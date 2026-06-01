// ═══════════════════════════════════════════════════════════════════════════
// server/services/pm/project-service.js
//
// Service do módulo PM (Projetos + Tarefas).
//   Fase 1: auditoria (appendProjectEvent) + leituras.
//   Fase 3: criação ATÔMICA de projeto a partir de template, hook do PIX
//           (cliente + projeto), clone de etapa como nova versão, leitura
//           aninhada (projeto + stages + tasks + events).
//
// Transação: padrão manual pool.connect()+BEGIN/COMMIT (igual database-pg.js).
// Funções que aceitam `pgClient` rodam na conexão do caller (mesma tx).
// ═══════════════════════════════════════════════════════════════════════════

'use strict';

const { isValidProjectEventType, isValidActorType } = require('./state-machine');
const dependencyResolver = require('./dependency-resolver');
const clientService = require('./client-service');

const TC_SERVICE_ID = 'svc_terracontrol_default';

// ─── Auditoria ────────────────────────────────────────────────────────────────

async function appendProjectEvent(db, params) {
  const { projectId, eventType, actorType, actorId = null, payload = {}, pgClient } = params || {};
  if (!projectId) throw new Error('appendProjectEvent: projectId é obrigatório');
  if (!isValidProjectEventType(eventType)) throw new Error(`appendProjectEvent: eventType inválido "${eventType}"`);
  if (!isValidActorType(actorType)) throw new Error(`appendProjectEvent: actorType inválido "${actorType}"`);

  const id = db.generateId();
  const exec = pgClient || db.pool;
  const result = await exec.query(
    `INSERT INTO project_events (id, project_id, event_type, actor_type, actor_id, payload)
     VALUES ($1,$2,$3,$4,$5,$6::jsonb) RETURNING id`,
    [id, projectId, eventType, actorType, actorId, JSON.stringify(payload)]
  );
  return { id: result.rows[0].id };
}

// ─── Leituras ─────────────────────────────────────────────────────────────────

async function getProjectById(db, projectId, { pgClient } = {}) {
  if (!projectId) return null;
  const exec = pgClient || db.pool;
  const result = await exec.query('SELECT * FROM projects WHERE id = $1 LIMIT 1', [projectId]);
  return result.rows[0] || null;
}

async function listProjects(db, filters = {}) {
  const { status, clientId, managerUserId, serviceId, source, limit = 100, offset = 0 } = filters;
  const where = [];
  const values = [];
  let i = 1;
  if (status)        { where.push(`status = $${i++}`);          values.push(status); }
  if (clientId)      { where.push(`client_id = $${i++}`);       values.push(clientId); }
  if (managerUserId) { where.push(`manager_user_id = $${i++}`); values.push(managerUserId); }
  if (serviceId)     { where.push(`service_id = $${i++}`);      values.push(serviceId); }
  if (source)        { where.push(`source = $${i++}`);          values.push(source); }
  const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const sql = `SELECT * FROM projects ${whereClause} ORDER BY created_at DESC LIMIT $${i++} OFFSET $${i++}`;
  values.push(limit, offset);
  const result = await db.pool.query(sql, values);
  return result.rows;
}

async function listProjectEvents(db, projectId, { limit = 200 } = {}) {
  if (!projectId) return [];
  const result = await db.pool.query(
    `SELECT id, event_type, actor_type, actor_id, payload, created_at
       FROM project_events WHERE project_id = $1 ORDER BY created_at DESC LIMIT $2`,
    [projectId, limit]
  );
  return result.rows;
}

/**
 * Projeto + stages + tasks (+ deps/triggers por task) + eventos, aninhado.
 * include: subset de ['stages','tasks','events'] (tasks implica stages).
 */
async function getProjectWithDetails(db, projectId, { include = ['stages', 'tasks', 'events'] } = {}) {
  const project = await getProjectById(db, projectId);
  if (!project) return null;
  const out = { ...project };

  const wantStages = include.includes('stages') || include.includes('tasks');
  const wantTasks = include.includes('tasks');

  if (wantStages) {
    const stagesRes = await db.pool.query(
      'SELECT * FROM project_stages WHERE project_id = $1 ORDER BY sort_order ASC', [projectId]
    );
    const stages = stagesRes.rows;

    if (wantTasks && stages.length) {
      const tasksRes = await db.pool.query(
        'SELECT * FROM project_tasks WHERE project_id = $1 ORDER BY sort_order ASC', [projectId]
      );
      const tasks = tasksRes.rows;
      const taskIds = tasks.map(t => t.id);
      const depsRes = taskIds.length
        ? await db.pool.query('SELECT * FROM project_task_deps WHERE task_id = ANY($1::varchar[])', [taskIds])
        : { rows: [] };
      const depByTask = new Map();
      for (const d of depsRes.rows) {
        if (!depByTask.has(d.task_id)) depByTask.set(d.task_id, []);
        depByTask.get(d.task_id).push(d);
      }
      const tasksByStage = new Map();
      for (const t of tasks) {
        if (!tasksByStage.has(t.project_stage_id)) tasksByStage.set(t.project_stage_id, []);
        tasksByStage.get(t.project_stage_id).push({ ...t, deps: depByTask.get(t.id) || [] });
      }
      out.stages = stages.map(s => ({ ...s, tasks: tasksByStage.get(s.id) || [] }));
    } else {
      out.stages = stages;
    }
  }

  if (include.includes('events')) {
    out.events = await listProjectEvents(db, projectId, { limit: 100 });
  }
  return out;
}

// ─── Loader interno do template (dentro da tx) ────────────────────────────────

async function _loadTemplate(exec, serviceId) {
  const vRes = await exec.query(
    'SELECT COALESCE(MAX(version), 1) AS v FROM service_template_stages WHERE service_id = $1', [serviceId]
  );
  const version = vRes.rows[0].v;
  const stagesRes = await exec.query(
    'SELECT * FROM service_template_stages WHERE service_id = $1 AND version = $2 ORDER BY sort_order ASC',
    [serviceId, version]
  );
  const stages = stagesRes.rows;
  const stageIds = stages.map(s => s.id);
  const tasksRes = stageIds.length
    ? await exec.query('SELECT * FROM service_template_tasks WHERE template_stage_id = ANY($1::varchar[]) ORDER BY sort_order ASC', [stageIds])
    : { rows: [] };
  const tasks = tasksRes.rows;
  const taskIds = tasks.map(t => t.id);
  const depsRes = taskIds.length
    ? await exec.query('SELECT * FROM service_template_task_deps WHERE task_id = ANY($1::varchar[])', [taskIds])
    : { rows: [] };
  const trgRes = await exec.query(
    'SELECT * FROM service_template_task_triggers WHERE service_id = $1 AND is_active = TRUE', [serviceId]
  );
  return { version, stages, tasks, deps: depsRes.rows, triggers: trgRes.rows };
}

// ─── Criação atômica a partir de template ─────────────────────────────────────

/**
 * Cria projeto + copia stages/tasks/deps/triggers do template do serviço, tudo
 * em uma transação. Tasks sem start_dependency nascem 'available'; com, 'pending'.
 *
 * @param {object} db
 * @param {object} input
 * @param {string} input.name
 * @param {string} input.serviceId
 * @param {string} [input.clientId]
 * @param {string} [input.managerUserId]
 * @param {string} [input.description]
 * @param {string} [input.startDate]   - ISO date; futura => status 'inativo'
 * @param {string} [input.status]      - força status (senão deriva de startDate)
 * @param {number} [input.totalCents]
 * @param {string} [input.source]      - 'manual' | 'terracontrol_pix' | 'imported'
 * @param {string} [input.terracontrolId]
 * @param {string} [input.budgetId]
 * @param {string} [input.actorUserId] - audit
 * @param {object} [opts]
 * @param {object} [opts.pgClient]     - se passado, NÃO abre tx própria (usa a do caller)
 * @returns {Promise<object>} projeto criado (com details)
 */
async function createProjectFromTemplate(db, input, opts = {}) {
  const ownTx = !opts.pgClient;
  const client = opts.pgClient || await db.pool.connect();
  try {
    if (ownTx) await client.query('BEGIN');

    const id = db.generateId();
    const today = new Date().toISOString().slice(0, 10);
    const startDate = input.startDate || today;
    const status = input.status || (startDate > today ? 'inativo' : 'ativo');
    const source = input.source || 'manual';

    await client.query(
      `INSERT INTO projects
         (id, name, description, client_id, service_id, manager_user_id, status, source,
          terracontrol_id, budget_id, start_date, total_cents, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12, NOW(), NOW())`,
      [id, input.name || 'Projeto', input.description || null, input.clientId || null,
       input.serviceId || null, input.managerUserId || null, status, source,
       input.terracontrolId || null, input.budgetId || null, startDate, input.totalCents || 0]
    );

    let createdTasks = [];
    if (input.serviceId) {
      const tpl = await _loadTemplate(client, input.serviceId);

      // Copia stages.
      const stageIdMap = new Map();
      for (const s of tpl.stages) {
        const newStageId = db.generateId();
        stageIdMap.set(s.id, newStageId);
        await client.query(
          `INSERT INTO project_stages
             (id, project_id, name, description, version, sort_order, status,
              responsible_user_id, default_days, template_stage_id, template_snapshot, created_at, updated_at)
           VALUES ($1,$2,$3,$4,1,$5,'pending',NULL,$6,$7,$8::jsonb, NOW(), NOW())`,
          [newStageId, id, s.name, s.description, s.sort_order, s.default_duration_days,
           s.id, JSON.stringify(s)]
        );
      }

      // Copia tasks (status inicial 'pending'; resolver promove abaixo).
      const taskIdMap = new Map();
      for (const t of tpl.tasks) {
        const newTaskId = db.generateId();
        taskIdMap.set(t.id, newTaskId);
        await client.query(
          `INSERT INTO project_tasks
             (id, project_id, project_stage_id, name, description, observation, sort_order, status,
              default_days, review_required, acceptance_required, reviewer_user_id,
              manager_review_allowed, admin_review_allowed, estimated_minutes, priority,
              template_task_id, created_by_user_id, created_at, updated_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,'pending',$8,$9,$10,NULL,$11,$12,$13,$14,$15,$16, NOW(), NOW())`,
          [newTaskId, id, stageIdMap.get(t.template_stage_id), t.name, t.description, t.observation,
           t.sort_order, t.default_days, t.requires_review, t.requires_acceptance,
           t.manager_review_allowed, t.admin_review_allowed, t.default_estimated_minutes,
           t.default_priority || 2, t.id, input.actorUserId || null]
        );
      }

      // Copia deps (remapeia ids).
      for (const d of tpl.deps) {
        await client.query(
          `INSERT INTO project_task_deps
             (id, task_id, dependency_type, dependency_target_type, target_task_id, target_stage_id, required_status)
           VALUES ($1,$2,$3,$4,$5,$6,$7)`,
          [db.generateId(), taskIdMap.get(d.task_id), d.dependency_type, d.dependency_target_type,
           d.target_task_id ? taskIdMap.get(d.target_task_id) : null,
           d.target_stage_id ? stageIdMap.get(d.target_stage_id) : null,
           d.required_status]
        );
      }

      // Copia triggers (remapeia source).
      for (const trg of tpl.triggers) {
        await client.query(
          `INSERT INTO project_task_triggers
             (id, project_id, source_task_id, action, on_status, payload, created_at)
           VALUES ($1,$2,$3,$4,$5,$6::jsonb, NOW())`,
          [db.generateId(), id, taskIdMap.get(trg.source_template_task_id), trg.action,
           trg.on_status, JSON.stringify(typeof trg.payload === 'string' ? JSON.parse(trg.payload) : trg.payload)]
        );
      }

      // Resolve quais tasks sem start_dependency viram 'available'.
      const tasksRes = await client.query('SELECT id, status FROM project_tasks WHERE project_id = $1', [id]);
      const stagesRes = await client.query('SELECT id, status FROM project_stages WHERE project_id = $1', [id]);
      const depsRes = await client.query(
        `SELECT d.* FROM project_task_deps d JOIN project_tasks t ON t.id = d.task_id WHERE t.project_id = $1`, [id]
      );
      const toPromote = dependencyResolver.resolveAvailableTasks({
        tasks: tasksRes.rows, stages: stagesRes.rows, deps: depsRes.rows,
      });
      if (toPromote.length) {
        await client.query(
          `UPDATE project_tasks SET status = 'available', updated_at = NOW() WHERE id = ANY($1::varchar[])`,
          [toPromote]
        );
      }
      createdTasks = tasksRes.rows;
    }

    // Auditoria.
    await client.query(
      `INSERT INTO project_events (id, project_id, event_type, actor_type, actor_id, payload)
       VALUES ($1,$2,$3,$4,$5,$6::jsonb)`,
      [db.generateId(), id, source === 'terracontrol_pix' ? 'project_created_from_pix' : 'created',
       input.actorUserId ? 'user' : 'system', input.actorUserId || null,
       JSON.stringify({ serviceId: input.serviceId, taskCount: createdTasks.length })]
    );

    if (ownTx) await client.query('COMMIT');
    return await getProjectWithDetails(db, id);
  } catch (err) {
    if (ownTx) await client.query('ROLLBACK');
    throw err;
  } finally {
    if (ownTx) client.release();
  }
}

// ─── Hook do PIX: cria cliente + projeto TerraControl ─────────────────────────

/**
 * Chamado pelo webhook PIX (markPaidFromWebhook). Idempotente:
 *   - cliente via client-service (UNIQUE tc_user_id)
 *   - projeto: se já existe pra esse terracontrol_id (UNIQUE), retorna o existente
 *
 * @returns {Promise<{ projectId: string|null, clientId: string|null, created: boolean }>}
 */
async function createProjectFromTerraControlPayment(db, { terracontrolId, tcUserId, budgetId = null }) {
  if (!terracontrolId) throw new Error('createProjectFromTerraControlPayment: terracontrolId obrigatório');

  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');

    // Idempotência: projeto já existe pra esse terreno?
    const existing = await client.query('SELECT id, client_id FROM projects WHERE terracontrol_id = $1 LIMIT 1', [terracontrolId]);
    if (existing.rows[0]) {
      await client.query('COMMIT');
      return { projectId: existing.rows[0].id, clientId: existing.rows[0].client_id, created: false };
    }

    // Carrega o terreno (nome p/ o projeto, fallback do tc_user).
    const tcRes = await client.query('SELECT * FROM terracontrol WHERE id = $1 LIMIT 1', [terracontrolId]);
    const record = tcRes.rows[0];
    if (!record) throw new Error(`terracontrol ${terracontrolId} não encontrado`);

    const effectiveTcUserId = tcUserId || record.created_by_tc_user_id || null;

    // Cliente (idempotente).
    let clientId = record.client_id || null;
    if (!clientId && effectiveTcUserId) {
      const r = await clientService.findOrCreateFromTcUser(db, effectiveTcUserId, { pgClient: client });
      clientId = r.clientId;
      // Vincula tc_users.client_id e terracontrol.client_id.
      await client.query('UPDATE tc_users SET client_id = $1 WHERE id = $2 AND client_id IS NULL', [clientId, effectiveTcUserId]);
      await client.query('UPDATE terracontrol SET client_id = $1 WHERE id = $2 AND client_id IS NULL', [clientId, terracontrolId]);
    }

    // Projeto a partir do template TerraControl (mesma tx).
    const projectName = `TerraControl · ${record.imovel || record.municipio || ('Imóvel #' + (record.cod_imovel ?? ''))}`.trim();
    const project = await createProjectFromTemplate(db, {
      name: projectName,
      serviceId: TC_SERVICE_ID,
      clientId,
      status: 'ativo',
      source: 'terracontrol_pix',
      terracontrolId,
      budgetId,
    }, { pgClient: client });

    // Link reverso terracontrol.project_id.
    await client.query('UPDATE terracontrol SET project_id = $1 WHERE id = $2', [project.id, terracontrolId]);

    await client.query('COMMIT');
    return { projectId: project.id, clientId, created: true };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// ─── Clone de etapa como nova versão (diligência/retrabalho) ──────────────────

/**
 * Duplica uma etapa existente DENTRO do mesmo projeto, incrementando a version
 * (ex.: "Elaboração dos Produtos" → "Elaboração dos Produtos v2"). Copia as
 * tarefas (resetadas p/ pending/available conforme deps). Posiciona ao final.
 */
async function cloneStageAsNewVersion(db, projectId, stageId, { actorUserId = null } = {}) {
  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');

    const sRes = await client.query('SELECT * FROM project_stages WHERE id = $1 AND project_id = $2', [stageId, projectId]);
    const stage = sRes.rows[0];
    if (!stage) throw new Error('Etapa não encontrada no projeto');

    // version máxima dessa "família" de etapa (mesmo nome base).
    const baseName = stage.name.replace(/\s+v\d+$/i, '');
    const vRes = await client.query(
      `SELECT COALESCE(MAX(version), 1) AS v FROM project_stages
        WHERE project_id = $1 AND (name = $2 OR name ~ ($2 || ' v[0-9]+$'))`,
      [projectId, baseName]
    );
    const newVersion = (vRes.rows[0].v || 1) + 1;

    const ordRes = await client.query('SELECT COALESCE(MAX(sort_order), -1) + 1 AS next FROM project_stages WHERE project_id = $1', [projectId]);
    const newStageId = db.generateId();
    await client.query(
      `INSERT INTO project_stages
         (id, project_id, name, description, version, sort_order, status, default_days, template_stage_id, template_snapshot, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,'pending',$7,$8,$9::jsonb, NOW(), NOW())`,
      [newStageId, projectId, `${baseName} v${newVersion}`, stage.description, newVersion,
       ordRes.rows[0].next, stage.default_days, stage.template_stage_id, JSON.stringify(stage.template_snapshot || {})]
    );

    // Copia tarefas da etapa original (status 'available'; sem deps copiadas — etapa de retrabalho começa solta).
    const tasksRes = await client.query('SELECT * FROM project_tasks WHERE project_stage_id = $1 ORDER BY sort_order', [stageId]);
    for (const t of tasksRes.rows) {
      await client.query(
        `INSERT INTO project_tasks
           (id, project_id, project_stage_id, name, description, observation, sort_order, status,
            default_days, review_required, acceptance_required, manager_review_allowed, admin_review_allowed,
            estimated_minutes, priority, template_task_id, created_by_user_id, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,'available',$8,$9,$10,$11,$12,$13,$14,$15,$16, NOW(), NOW())`,
        [db.generateId(), projectId, newStageId, t.name, t.description, t.observation, t.sort_order,
         t.default_days, t.review_required, t.acceptance_required, t.manager_review_allowed,
         t.admin_review_allowed, t.estimated_minutes, t.priority, t.template_task_id, actorUserId]
      );
    }

    await client.query(
      `INSERT INTO project_events (id, project_id, event_type, actor_type, actor_id, payload)
       VALUES ($1,$2,'stage_added',$3,$4,$5::jsonb)`,
      [db.generateId(), projectId, actorUserId ? 'user' : 'system', actorUserId,
       JSON.stringify({ clonedFromStageId: stageId, newStageId, version: newVersion })]
    );

    await client.query('COMMIT');
    return await getProjectWithDetails(db, projectId, { include: ['stages', 'tasks'] });
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// ─── Skip de etapa ────────────────────────────────────────────────────────────

async function skipStage(db, projectId, stageId, { actorUserId = null } = {}) {
  const r = await db.pool.query(
    `UPDATE project_stages SET status = 'skipped', updated_at = NOW()
      WHERE id = $1 AND project_id = $2 RETURNING id`,
    [stageId, projectId]
  );
  if (!r.rows.length) throw new Error('Etapa não encontrada no projeto');
  await appendProjectEvent(db, {
    projectId, eventType: 'status_changed', actorType: actorUserId ? 'user' : 'system',
    actorId: actorUserId, payload: { stageId, action: 'skipped' },
  });
  return true;
}

module.exports = {
  TC_SERVICE_ID,
  appendProjectEvent,
  getProjectById,
  listProjects,
  listProjectEvents,
  getProjectWithDetails,
  createProjectFromTemplate,
  createProjectFromTerraControlPayment,
  cloneStageAsNewVersion,
  skipStage,
};
