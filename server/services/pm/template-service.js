// ═══════════════════════════════════════════════════════════════════════════
// server/services/pm/template-service.js
//
// CRUD + leitura do TEMPLATE de um serviço (etapas/tarefas/dependências/
// triggers) — Fase 2. A cópia do template pra um projeto real
// (cloneTemplateForProject) entra na Fase 3, quando project_stages/
// project_tasks existirem.
//
// Padrão: funções recebem `db` (instância Database). Para operações compostas
// usa transação manual via db.pool.connect() (mesmo padrão do database-pg.js).
// ═══════════════════════════════════════════════════════════════════════════

'use strict';

const DEP_TYPES    = ['start_dependency', 'completion_dependency'];
const TARGET_TYPES = ['task', 'stage'];
const STAGE_TYPES  = ['first', 'normal', 'last'];

// ─── Leitura: template completo aninhado ──────────────────────────────────────

/**
 * Retorna o template do serviço aninhado:
 * { serviceId, version, stages: [ { ...stage, tasks: [ { ...task, deps, triggers } ] } ] }
 * Se version não passada, usa a maior version existente (a "atual").
 */
async function getServiceTemplate(db, serviceId, { version } = {}) {
  if (!serviceId) throw new Error('getServiceTemplate: serviceId obrigatório');

  // Resolve version atual se não especificada.
  let resolvedVersion = version;
  if (resolvedVersion == null) {
    const v = await db.pool.query(
      'SELECT COALESCE(MAX(version), 1) AS v FROM service_template_stages WHERE service_id = $1',
      [serviceId]
    );
    resolvedVersion = v.rows[0].v;
  }

  const stagesRes = await db.pool.query(
    `SELECT * FROM service_template_stages
      WHERE service_id = $1 AND version = $2
      ORDER BY sort_order ASC`,
    [serviceId, resolvedVersion]
  );
  const stages = stagesRes.rows;
  if (stages.length === 0) {
    return { serviceId, version: resolvedVersion, stages: [] };
  }

  const stageIds = stages.map(s => s.id);
  const tasksRes = await db.pool.query(
    `SELECT * FROM service_template_tasks
      WHERE template_stage_id = ANY($1::varchar[])
      ORDER BY sort_order ASC`,
    [stageIds]
  );
  const tasks = tasksRes.rows;
  const taskIds = tasks.map(t => t.id);

  const depsRes = taskIds.length
    ? await db.pool.query(
        `SELECT * FROM service_template_task_deps WHERE task_id = ANY($1::varchar[])`,
        [taskIds]
      )
    : { rows: [] };

  const triggersRes = await db.pool.query(
    `SELECT * FROM service_template_task_triggers WHERE service_id = $1 AND is_active = TRUE`,
    [serviceId]
  );

  // Agrupa.
  const depsByTask = new Map();
  for (const d of depsRes.rows) {
    if (!depsByTask.has(d.task_id)) depsByTask.set(d.task_id, []);
    depsByTask.get(d.task_id).push(d);
  }
  const triggersBySource = new Map();
  for (const tr of triggersRes.rows) {
    if (!triggersBySource.has(tr.source_template_task_id)) triggersBySource.set(tr.source_template_task_id, []);
    triggersBySource.get(tr.source_template_task_id).push(tr);
  }
  const tasksByStage = new Map();
  for (const t of tasks) {
    if (!tasksByStage.has(t.template_stage_id)) tasksByStage.set(t.template_stage_id, []);
    tasksByStage.get(t.template_stage_id).push({
      ...t,
      deps: depsByTask.get(t.id) || [],
      triggers: triggersBySource.get(t.id) || [],
    });
  }

  return {
    serviceId,
    version: resolvedVersion,
    stages: stages.map(s => ({ ...s, tasks: tasksByStage.get(s.id) || [] })),
  };
}

// ─── Stages CRUD ──────────────────────────────────────────────────────────────

async function createStage(db, serviceId, data) {
  const {
    name, description = null, version = 1,
    defaultDurationDays = null, defaultAssigneeRole = null,
  } = data;
  if (!name) throw new Error('createStage: name obrigatório');

  // Auto-tipo (regra de produto): 1ª etapa = 'first'; demais = 'last' (e a
  // 'last' anterior vira 'normal'). O usuário pode reclassificar depois.
  const cntRes = await db.pool.query(
    'SELECT COUNT(*)::int AS n FROM service_template_stages WHERE service_id = $1 AND version = $2',
    [serviceId, version]
  );
  const isFirstEver = cntRes.rows[0].n === 0;
  const stageType = isFirstEver ? 'first' : 'last';
  if (!isFirstEver) {
    // Demote a 'last' atual para 'normal'.
    await db.pool.query(
      `UPDATE service_template_stages SET stage_type='normal', updated_at=NOW()
        WHERE service_id=$1 AND version=$2 AND stage_type='last'`,
      [serviceId, version]
    );
  }

  // sort_order temporário no fim; a normalização reposiciona por tipo.
  const maxRes = await db.pool.query(
    'SELECT COALESCE(MAX(sort_order), -1) + 1 AS next FROM service_template_stages WHERE service_id = $1 AND version = $2',
    [serviceId, version]
  );
  const id = db.generateId();
  const res = await db.pool.query(
    `INSERT INTO service_template_stages
       (id, service_id, name, description, version, sort_order, stage_type, default_duration_days, default_assignee_role)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
    [id, serviceId, name, description, version, maxRes.rows[0].next, stageType, defaultDurationDays, defaultAssigneeRole]
  );
  await _normalizeStageOrder(db, serviceId, version);
  return getStage(db, id);
}

async function updateStage(db, stageId, data) {
  const current = await getStage(db, stageId);
  if (!current) throw new Error('Etapa não encontrada');

  const newType = data.stageType;
  if (newType !== undefined && !STAGE_TYPES.includes(newType)) {
    throw new Error(`updateStage: stageType inválido "${newType}"`);
  }

  // Ao marcar como first/last, garante unicidade: rebaixa outra first/last p/ normal.
  if (newType === 'first' || newType === 'last') {
    await db.pool.query(
      `UPDATE service_template_stages SET stage_type='normal', updated_at=NOW()
        WHERE service_id=$1 AND version=$2 AND stage_type=$3 AND id<>$4`,
      [current.service_id, current.version, newType, stageId]
    );
  }

  const fields = [];
  const values = [];
  let i = 1;
  const map = {
    name: 'name', description: 'description', sortOrder: 'sort_order',
    stageType: 'stage_type', defaultDurationDays: 'default_duration_days',
    defaultAssigneeRole: 'default_assignee_role', isActive: 'is_active',
  };
  for (const [key, col] of Object.entries(map)) {
    if (data[key] !== undefined) { fields.push(`${col} = $${i++}`); values.push(data[key]); }
  }
  if (fields.length) {
    fields.push(`updated_at = NOW()`);
    values.push(stageId);
    await db.pool.query(`UPDATE service_template_stages SET ${fields.join(', ')} WHERE id = $${i}`, values);
  }

  // Mudou o tipo → reposiciona (first no topo, last no fim).
  if (newType !== undefined) {
    await _normalizeStageOrder(db, current.service_id, current.version);
  }
  return getStage(db, stageId);
}

async function getStage(db, stageId) {
  const r = await db.pool.query('SELECT * FROM service_template_stages WHERE id = $1', [stageId]);
  return r.rows[0] || null;
}

async function deleteStage(db, stageId) {
  const r = await db.pool.query('DELETE FROM service_template_stages WHERE id = $1 RETURNING service_id, version', [stageId]);
  if (!r.rows.length) throw new Error('Etapa não encontrada');
  await _normalizeStageOrder(db, r.rows[0].service_id, r.rows[0].version);
  return true;
}

// Reatribui sort_order em DUAS FASES (negativos → finais) numa transação, pra
// nunca colidir com a UNIQUE (service_id, version, sort_order).
async function _reassignOrder(client, serviceId, version, orderedIds) {
  for (let i = 0; i < orderedIds.length; i++) {
    await client.query(
      'UPDATE service_template_stages SET sort_order=$1 WHERE id=$2 AND service_id=$3 AND version=$4',
      [-(i + 1), orderedIds[i], serviceId, version]
    );
  }
  for (let i = 0; i < orderedIds.length; i++) {
    await client.query(
      'UPDATE service_template_stages SET sort_order=$1, updated_at=NOW() WHERE id=$2 AND service_id=$3 AND version=$4',
      [i, orderedIds[i], serviceId, version]
    );
  }
}

// Normaliza a ordem por (tipo: first<normal<last, depois sort_order atual).
async function _normalizeStageOrder(db, serviceId, version) {
  const r = await db.pool.query(
    `SELECT id, stage_type, sort_order FROM service_template_stages WHERE service_id = $1 AND version = $2`,
    [serviceId, version]
  );
  const rank = st => (st === 'first' ? -1 : st === 'last' ? 1 : 0);
  const orderedIds = r.rows.slice().sort((a, b) =>
    rank(a.stage_type) - rank(b.stage_type) || a.sort_order - b.sort_order
  ).map(s => s.id);

  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    await _reassignOrder(client, serviceId, version, orderedIds);
    await client.query('COMMIT');
  } catch (e) { await client.query('ROLLBACK'); throw e; }
  finally { client.release(); }
}

// Reordenação manual (setas): aplica a ordem explícita dada pelo usuário.
async function reorderStages(db, serviceId, version, orderedIds) {
  if (!Array.isArray(orderedIds) || !orderedIds.length) return;
  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    await _reassignOrder(client, serviceId, version, orderedIds);
    await client.query('COMMIT');
  } catch (e) { await client.query('ROLLBACK'); throw e; }
  finally { client.release(); }
}

// ─── Tasks CRUD ───────────────────────────────────────────────────────────────

async function createTask(db, templateStageId, data) {
  const stage = await getStage(db, templateStageId);
  if (!stage) throw new Error('createTask: etapa não encontrada');

  const {
    name, description = null, observation = null, sortOrder = null,
    defaultDays = null, defaultAssigneeRole = null, defaultEstimatedMinutes = null,
    defaultPriority = 2, requiresAcceptance = false, requiresAttachment = false,
    requiresReview = false, reviewType = null, reviewerDefaultRole = null,
    managerReviewAllowed = true, adminReviewAllowed = true, gestorOnly = false,
  } = data;
  if (!name) throw new Error('createTask: name obrigatório');

  let order = sortOrder;
  if (order == null) {
    const r = await db.pool.query(
      'SELECT COALESCE(MAX(sort_order), -1) + 1 AS next FROM service_template_tasks WHERE template_stage_id = $1',
      [templateStageId]
    );
    order = r.rows[0].next;
  }

  const id = db.generateId();
  const res = await db.pool.query(
    `INSERT INTO service_template_tasks
       (id, template_stage_id, service_id, name, description, observation, sort_order, default_days,
        default_assignee_role, default_estimated_minutes, default_priority, requires_acceptance,
        requires_attachment, requires_review, review_type, reviewer_default_role,
        manager_review_allowed, admin_review_allowed, gestor_only)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19) RETURNING *`,
    [id, templateStageId, stage.service_id, name, description, observation, order, defaultDays,
     defaultAssigneeRole, defaultEstimatedMinutes, defaultPriority, requiresAcceptance,
     requiresAttachment, requiresReview, reviewType, reviewerDefaultRole,
     managerReviewAllowed, adminReviewAllowed, gestorOnly === true]
  );
  return res.rows[0];
}

async function updateTask(db, taskId, data) {
  const map = {
    name: 'name', description: 'description', observation: 'observation', sortOrder: 'sort_order',
    defaultDays: 'default_days', defaultAssigneeRole: 'default_assignee_role',
    defaultEstimatedMinutes: 'default_estimated_minutes', defaultPriority: 'default_priority',
    requiresAcceptance: 'requires_acceptance', requiresAttachment: 'requires_attachment',
    requiresReview: 'requires_review', reviewType: 'review_type', reviewerDefaultRole: 'reviewer_default_role',
    managerReviewAllowed: 'manager_review_allowed', adminReviewAllowed: 'admin_review_allowed',
    gestorOnly: 'gestor_only', isActive: 'is_active',
  };
  const fields = [];
  const values = [];
  let i = 1;
  for (const [key, col] of Object.entries(map)) {
    if (data[key] !== undefined) { fields.push(`${col} = $${i++}`); values.push(data[key]); }
  }
  if (!fields.length) {
    const r = await db.pool.query('SELECT * FROM service_template_tasks WHERE id = $1', [taskId]);
    return r.rows[0] || null;
  }
  fields.push('updated_at = NOW()');
  values.push(taskId);
  const res = await db.pool.query(
    `UPDATE service_template_tasks SET ${fields.join(', ')} WHERE id = $${i} RETURNING *`,
    values
  );
  if (!res.rows.length) throw new Error('Tarefa não encontrada');
  return res.rows[0];
}

async function deleteTask(db, taskId) {
  const r = await db.pool.query('DELETE FROM service_template_tasks WHERE id = $1 RETURNING id', [taskId]);
  if (!r.rows.length) throw new Error('Tarefa não encontrada');
  return true;
}

// ─── Dependências ─────────────────────────────────────────────────────────────

async function createDependency(db, taskId, data) {
  const {
    dependencyType, dependencyTargetType, targetTaskId = null,
    targetStageId = null, requiredStatus = null,
  } = data;
  if (!DEP_TYPES.includes(dependencyType)) throw new Error(`dependencyType inválido "${dependencyType}"`);
  if (!TARGET_TYPES.includes(dependencyTargetType)) throw new Error(`dependencyTargetType inválido "${dependencyTargetType}"`);
  if (dependencyTargetType === 'task' && !targetTaskId) throw new Error('targetTaskId obrigatório p/ target task');
  if (dependencyTargetType === 'stage' && !targetStageId) throw new Error('targetStageId obrigatório p/ target stage');
  if (dependencyTargetType === 'task' && targetTaskId === taskId) throw new Error('Tarefa não pode depender de si mesma');

  // Validação de ciclo (só relevante p/ deps task→task).
  if (dependencyTargetType === 'task') {
    const wouldCycle = await _wouldCreateCycle(db, taskId, targetTaskId);
    if (wouldCycle) {
      const err = new Error('Dependência criaria um ciclo entre tarefas');
      err.code = 'dependency_cycle';
      throw err;
    }
  }

  const id = db.generateId();
  const res = await db.pool.query(
    `INSERT INTO service_template_task_deps
       (id, task_id, dependency_type, dependency_target_type, target_task_id, target_stage_id, required_status)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
    [id, taskId, dependencyType, dependencyTargetType, targetTaskId, targetStageId, requiredStatus]
  );
  return res.rows[0];
}

async function deleteDependency(db, depId) {
  const r = await db.pool.query('DELETE FROM service_template_task_deps WHERE id = $1 RETURNING id', [depId]);
  if (!r.rows.length) throw new Error('Dependência não encontrada');
  return true;
}

/**
 * DFS: adicionar aresta task → target criaria ciclo? (grafo de deps task→task)
 * Aresta significa "task depende de target", i.e., target deve vir antes.
 * Há ciclo se target já depende (transitivamente) de task.
 */
async function _wouldCreateCycle(db, taskId, targetTaskId) {
  const edgesRes = await db.pool.query(
    `SELECT dt.service_id FROM service_template_tasks dt WHERE dt.id = $1`,
    [taskId]
  );
  if (!edgesRes.rows.length) return false;
  const serviceId = edgesRes.rows[0].service_id;

  // Carrega todas as arestas task→target (task depende de target) do serviço.
  const all = await db.pool.query(
    `SELECT d.task_id, d.target_task_id
       FROM service_template_task_deps d
       JOIN service_template_tasks t ON t.id = d.task_id
      WHERE t.service_id = $1 AND d.dependency_target_type = 'task' AND d.target_task_id IS NOT NULL`,
    [serviceId]
  );
  const adj = new Map(); // node -> [nodes it depends on]
  for (const e of all.rows) {
    if (!adj.has(e.task_id)) adj.set(e.task_id, []);
    adj.get(e.task_id).push(e.target_task_id);
  }
  // Aresta nova: taskId depende de targetTaskId.
  // Ciclo se a partir de targetTaskId conseguimos chegar de volta a taskId.
  const visited = new Set();
  const stack = [targetTaskId];
  while (stack.length) {
    const node = stack.pop();
    if (node === taskId) return true;
    if (visited.has(node)) continue;
    visited.add(node);
    for (const next of (adj.get(node) || [])) stack.push(next);
  }
  return false;
}

// ─── Triggers (criam tarefa nova) ─────────────────────────────────────────────

async function createTrigger(db, sourceTemplateTaskId, data) {
  const src = await db.pool.query('SELECT service_id FROM service_template_tasks WHERE id = $1', [sourceTemplateTaskId]);
  if (!src.rows.length) {
    const err = new Error('createTrigger: tarefa de origem não encontrada');
    err.code = 'trigger_source_invalid';
    throw err;
  }
  const { onStatus = 'completed', payload = {} } = data;
  if (!payload.name) throw new Error('createTrigger: payload.name obrigatório (tarefa a criar)');

  const id = db.generateId();
  const res = await db.pool.query(
    `INSERT INTO service_template_task_triggers
       (id, service_id, source_template_task_id, action, on_status, payload)
     VALUES ($1,$2,$3,'create',$4,$5::jsonb) RETURNING *`,
    [id, src.rows[0].service_id, sourceTemplateTaskId, onStatus, JSON.stringify(payload)]
  );
  return res.rows[0];
}

async function deleteTrigger(db, triggerId) {
  const r = await db.pool.query('DELETE FROM service_template_task_triggers WHERE id = $1 RETURNING id', [triggerId]);
  if (!r.rows.length) throw new Error('Trigger não encontrado');
  return true;
}

// ─── Version bump ─────────────────────────────────────────────────────────────

/**
 * Cria uma cópia v(N+1) de TODO o template do serviço (stages+tasks+deps+triggers),
 * preservando a versão antiga. Projetos antigos guardam a version no momento da cópia.
 * Retorna a nova version.
 */
async function versionBump(db, serviceId) {
  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');

    const vRes = await client.query(
      'SELECT COALESCE(MAX(version), 0) AS v FROM service_template_stages WHERE service_id = $1',
      [serviceId]
    );
    const currentVersion = vRes.rows[0].v;
    if (currentVersion === 0) {
      await client.query('ROLLBACK');
      throw new Error('versionBump: serviço não tem template para versionar');
    }
    const newVersion = currentVersion + 1;

    // Mapa de IDs antigos → novos (stages e tasks).
    const stageIdMap = new Map();
    const taskIdMap = new Map();

    const oldStages = await client.query(
      'SELECT * FROM service_template_stages WHERE service_id = $1 AND version = $2 ORDER BY sort_order',
      [serviceId, currentVersion]
    );
    for (const s of oldStages.rows) {
      const newId = db.generateId();
      stageIdMap.set(s.id, newId);
      await client.query(
        `INSERT INTO service_template_stages
           (id, service_id, name, description, version, sort_order, stage_type, default_duration_days, default_assignee_role, is_active, metadata)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
        [newId, serviceId, s.name, s.description, newVersion, s.sort_order, s.stage_type,
         s.default_duration_days, s.default_assignee_role, s.is_active, s.metadata]
      );
    }

    const oldStageIds = oldStages.rows.map(s => s.id);
    const oldTasks = oldStageIds.length
      ? await client.query('SELECT * FROM service_template_tasks WHERE template_stage_id = ANY($1::varchar[])', [oldStageIds])
      : { rows: [] };
    for (const t of oldTasks.rows) {
      const newId = db.generateId();
      taskIdMap.set(t.id, newId);
      await client.query(
        `INSERT INTO service_template_tasks
           (id, template_stage_id, service_id, name, description, observation, sort_order, default_days,
            default_assignee_role, default_estimated_minutes, default_priority, requires_acceptance,
            requires_attachment, requires_review, review_type, reviewer_default_role,
            manager_review_allowed, admin_review_allowed, gestor_only, is_active, metadata)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21)`,
        [newId, stageIdMap.get(t.template_stage_id), serviceId, t.name, t.description, t.observation,
         t.sort_order, t.default_days, t.default_assignee_role, t.default_estimated_minutes,
         t.default_priority, t.requires_acceptance, t.requires_attachment, t.requires_review,
         t.review_type, t.reviewer_default_role, t.manager_review_allowed, t.admin_review_allowed,
         t.gestor_only === true, t.is_active, t.metadata]
      );
    }

    // Deps (remapeia task_id, target_task_id, target_stage_id).
    const oldTaskIds = oldTasks.rows.map(t => t.id);
    if (oldTaskIds.length) {
      const oldDeps = await client.query(
        'SELECT * FROM service_template_task_deps WHERE task_id = ANY($1::varchar[])', [oldTaskIds]
      );
      for (const d of oldDeps.rows) {
        await client.query(
          `INSERT INTO service_template_task_deps
             (id, task_id, dependency_type, dependency_target_type, target_task_id, target_stage_id, required_status)
           VALUES ($1,$2,$3,$4,$5,$6,$7)`,
          [db.generateId(), taskIdMap.get(d.task_id), d.dependency_type, d.dependency_target_type,
           d.target_task_id ? taskIdMap.get(d.target_task_id) : null,
           d.target_stage_id ? stageIdMap.get(d.target_stage_id) : null,
           d.required_status]
        );
      }

      // Triggers (remapeia source).
      const oldTriggers = await client.query(
        'SELECT * FROM service_template_task_triggers WHERE source_template_task_id = ANY($1::varchar[])', [oldTaskIds]
      );
      for (const tr of oldTriggers.rows) {
        await client.query(
          `INSERT INTO service_template_task_triggers
             (id, service_id, source_template_task_id, action, on_status, payload, is_active)
           VALUES ($1,$2,$3,$4,$5,$6,$7)`,
          [db.generateId(), serviceId, taskIdMap.get(tr.source_template_task_id), tr.action,
           tr.on_status, tr.payload, tr.is_active]
        );
      }
    }

    await client.query('COMMIT');
    return newVersion;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

module.exports = {
  // constantes (compartilhar com validação/UI)
  DEP_TYPES,
  TARGET_TYPES,
  STAGE_TYPES,
  // leitura
  getServiceTemplate,
  // stages
  createStage,
  updateStage,
  getStage,
  deleteStage,
  reorderStages,
  // tasks
  createTask,
  updateTask,
  deleteTask,
  // deps
  createDependency,
  deleteDependency,
  // triggers
  createTrigger,
  deleteTrigger,
  // versionamento
  versionBump,
  // exposto p/ teste
  _wouldCreateCycle,
};
