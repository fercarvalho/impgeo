// ═══════════════════════════════════════════════════════════════════════════
// server/services/pm/task-service.js
//
// Máquina de estados das tarefas do projeto (Fase 4). TODA transição passa por
// aqui, valida contra ALLOWED_TRANSITIONS e grava task_events. Efeitos colaterais
// da conclusão (liberar dependentes, disparar gatilhos, finalizar projeto) rodam
// numa transação única.
//
// Auth é responsabilidade do handler HTTP — aqui só lógica de domínio.
// ═══════════════════════════════════════════════════════════════════════════

'use strict';

const { canTransitionTask, TASK_STATUSES } = require('./state-machine');
const dependencyResolver = require('./dependency-resolver');
const triggerRunner = require('./trigger-runner');
const projectFinalizer = require('./project-finalizer');
const pomodoroService = require('./pomodoro-service');
const reviewWorkflow = require('./review-workflow');
const notificationService = require('./notification-service');

// Notificação best-effort (nunca quebra a transição).
function _notify(db, args) { notificationService.notify(db, args).catch(() => {}); }
function _notifyAdmins(db, args) { notificationService.notifyAdmins(db, args).catch(() => {}); }
async function _taskMeta(db, task) {
  const r = await db.pool.query(
    `SELECT t.name AS task_name, p.name AS project_name FROM project_tasks t JOIN projects p ON p.id=t.project_id WHERE t.id=$1`,
    [task.id]
  );
  return { taskName: r.rows[0]?.task_name || task.name, projectName: r.rows[0]?.project_name || null };
}
async function _notifyProjectCompleted(db, projectId, finalized) {
  if (!finalized) return;
  try {
    const r = await db.pool.query('SELECT name, manager_user_id FROM projects WHERE id=$1', [projectId]);
    const proj = r.rows[0];
    if (!proj) return;
    const payload = { projectName: proj.name };
    if (proj.manager_user_id) _notify(db, { type: 'pm_project_completed', userId: proj.manager_user_id, payload, entityType: 'project', entityId: projectId, ctaProjectId: projectId });
    _notifyAdmins(db, { type: 'pm_project_completed', payload, entityType: 'project', entityId: projectId, ctaProjectId: projectId });
  } catch { /* best-effort */ }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function err(message, code, status = 400, extra = {}) {
  const e = new Error(message); e.code = code; e.status = status; Object.assign(e, extra); return e;
}

async function getTask(exec, taskId) {
  const r = await exec.query('SELECT * FROM project_tasks WHERE id = $1 LIMIT 1', [taskId]);
  return r.rows[0] || null;
}

// Resolve os nomes das tarefas/etapas que bloqueiam uma dependência (p/ mensagem clara).
async function _blockerNames(db, blockedBy = []) {
  const taskIds = blockedBy.filter(d => d.target_task_id).map(d => d.target_task_id);
  const stageIds = blockedBy.filter(d => d.target_stage_id).map(d => d.target_stage_id);
  const names = [];
  if (taskIds.length) {
    const r = await db.pool.query('SELECT name FROM project_tasks WHERE id = ANY($1::varchar[])', [taskIds]);
    names.push(...r.rows.map(x => x.name));
  }
  if (stageIds.length) {
    const r = await db.pool.query('SELECT name FROM project_stages WHERE id = ANY($1::varchar[])', [stageIds]);
    names.push(...r.rows.map(x => `etapa "${x.name}"`));
  }
  return names;
}

async function appendTaskEvent(exec, db, { taskId, eventType, actorId = null, payload = {} }) {
  await exec.query(
    `INSERT INTO task_events (id, task_id, event_type, actor_type, actor_id, payload)
     VALUES ($1,$2,$3,$4,$5,$6::jsonb)`,
    [db.generateId(), taskId, eventType, actorId ? 'user' : 'system', actorId, JSON.stringify(payload)]
  );
}

function assertTransition(task, next) {
  if (!canTransitionTask(task.status, next)) {
    const err = new Error(`Transição inválida: ${task.status} → ${next}`);
    err.code = 'invalid_transition';
    err.status = 409;
    throw err;
  }
}

// Carrega tasks/stages/deps do projeto (p/ resolver de dependências).
async function _loadGraph(exec, projectId) {
  const tasks = (await exec.query('SELECT id, status FROM project_tasks WHERE project_id = $1', [projectId])).rows;
  const stages = (await exec.query('SELECT id, status FROM project_stages WHERE project_id = $1', [projectId])).rows;
  const deps = (await exec.query(
    `SELECT d.* FROM project_task_deps d JOIN project_tasks t ON t.id = d.task_id WHERE t.project_id = $1`,
    [projectId]
  )).rows;
  return { tasks, stages, deps };
}

// ─── Transições simples (single update + event) ───────────────────────────────

/**
 * Atribui/reatribui a tarefa a um usuário. Não muda status por si só, mas se a
 * tarefa exige aceite (acceptance_required) e está 'available', vai p/
 * 'pending_acceptance' (aguardando o responsável aceitar).
 */
async function assignTask(db, taskId, { toUserId, assignedByUserId = null, reason = 'assign' }) {
  if (!toUserId) throw new Error('assignTask: toUserId obrigatório');
  const task = await getTask(db.pool, taskId);
  if (!task) throw new Error('Tarefa não encontrada');

  const fromUserId = task.assignee_user_id;
  // Reatribuir uma tarefa recusada a outra pessoa a "reabre": volta a aguardar
  // aceite (se exige) ou a ficar disponível, para o novo responsável agir.
  let nextStatus = task.status;
  if (task.acceptance_required && (task.status === 'available' || task.status === 'pending' || task.status === 'refused')) {
    nextStatus = TASK_STATUSES.PENDING_ACCEPTANCE;
    assertTransition(task, nextStatus);
  } else if (task.status === 'refused') {
    nextStatus = TASK_STATUSES.AVAILABLE;
    assertTransition(task, nextStatus);
  }

  await db.pool.query(
    `UPDATE project_tasks
        SET assignee_user_id = $1, assigned_at = NOW(), status = $2,
            accepted_at = NULL, refusal_reason = NULL, updated_at = NOW()
      WHERE id = $3`,
    [toUserId, nextStatus, taskId]
  );
  await db.pool.query(
    `INSERT INTO task_assignments_history (id, task_id, from_user_id, to_user_id, assigned_by_user_id, reason)
     VALUES ($1,$2,$3,$4,$5,$6)`,
    [db.generateId(), taskId, fromUserId, toUserId, assignedByUserId, reason]
  );
  await appendTaskEvent(db.pool, db, {
    taskId, eventType: 'assigned', actorId: assignedByUserId,
    payload: { toUserId, fromUserId, statusAfter: nextStatus },
  });
  const meta = await _taskMeta(db, task);
  _notify(db, { type: 'pm_task_assigned', userId: toUserId, payload: meta, entityType: 'project_task', entityId: taskId, ctaProjectId: task.project_id });
  return getTask(db.pool, taskId);
}

/**
 * "Pegar" uma tarefa disponível e sem responsável (auto-atribuição). Qualquer
 * usuário do módulo pode capturar uma tarefa que ninguém pegou ainda. Não passa
 * pelo fluxo de aceite (quem pega já está aceitando).
 */
async function claimTask(db, taskId, { userId }) {
  if (!userId) throw new Error('claimTask: userId obrigatório');
  const task = await getTask(db.pool, taskId);
  if (!task) throw new Error('Tarefa não encontrada');
  if (task.assignee_user_id) throw err('Esta tarefa já tem um responsável', 'already_assigned', 409);
  if (task.status !== TASK_STATUSES.AVAILABLE) {
    throw err('Só é possível pegar tarefas disponíveis', 'invalid_transition', 409);
  }
  await db.pool.query(
    `UPDATE project_tasks
        SET assignee_user_id = $1, assigned_at = NOW(), accepted_at = NOW(), updated_at = NOW()
      WHERE id = $2`,
    [userId, taskId]
  );
  await db.pool.query(
    `INSERT INTO task_assignments_history (id, task_id, from_user_id, to_user_id, assigned_by_user_id, reason)
     VALUES ($1,$2,NULL,$3,$3,'self_claim')`,
    [db.generateId(), taskId, userId]
  );
  await appendTaskEvent(db.pool, db, { taskId, eventType: 'assigned', actorId: userId, payload: { toUserId: userId, selfClaim: true } });
  return getTask(db.pool, taskId);
}

/** Aceita tarefa (pending_acceptance → available). */
async function acceptTask(db, taskId, { userId }) {
  const task = await getTask(db.pool, taskId);
  if (!task) throw new Error('Tarefa não encontrada');
  if (task.status !== TASK_STATUSES.PENDING_ACCEPTANCE) {
    const err = new Error('Só é possível aceitar tarefa aguardando aceite');
    err.code = 'invalid_transition'; err.status = 409;
    throw err;
  }
  assertTransition(task, TASK_STATUSES.AVAILABLE);
  await db.pool.query(
    `UPDATE project_tasks SET status = 'available', accepted_at = NOW(), updated_at = NOW() WHERE id = $1`, [taskId]
  );
  await appendTaskEvent(db.pool, db, { taskId, eventType: 'accepted', actorId: userId, payload: {} });
  return getTask(db.pool, taskId);
}

/** Recusa tarefa (exige justificativa). */
async function refuseTask(db, taskId, { userId, reason }) {
  if (!reason || !String(reason).trim()) {
    const err = new Error('Justificativa obrigatória para recusar a tarefa');
    err.code = 'reason_required'; err.status = 400;
    throw err;
  }
  const task = await getTask(db.pool, taskId);
  if (!task) throw new Error('Tarefa não encontrada');
  assertTransition(task, TASK_STATUSES.REFUSED);
  await db.pool.query(
    `UPDATE project_tasks SET status = 'refused', refusal_reason = $1, updated_at = NOW() WHERE id = $2`,
    [String(reason).trim(), taskId]
  );
  await db.pool.query(
    `INSERT INTO task_assignments_history (id, task_id, from_user_id, to_user_id, assigned_by_user_id, reason, note)
     VALUES ($1,$2,$3,NULL,$4,'refused',$5)`,
    [db.generateId(), taskId, task.assignee_user_id, userId, String(reason).trim()]
  );
  await appendTaskEvent(db.pool, db, { taskId, eventType: 'refused', actorId: userId, payload: { reason: String(reason).trim() } });

  // Notifica os responsáveis pela tarefa: quem a atribuiu + gerente do projeto
  // + admins. Deduplicado; não notifica quem recusou.
  try {
    const recips = new Set();
    const lastAssign = await db.pool.query(
      `SELECT assigned_by_user_id FROM task_assignments_history
        WHERE task_id = $1 AND reason = 'assign' AND assigned_by_user_id IS NOT NULL
        ORDER BY created_at DESC LIMIT 1`,
      [taskId]
    );
    if (lastAssign.rows[0]?.assigned_by_user_id) recips.add(lastAssign.rows[0].assigned_by_user_id);
    const projRow = await db.pool.query('SELECT manager_user_id FROM projects WHERE id = $1', [task.project_id]);
    if (projRow.rows[0]?.manager_user_id) recips.add(projRow.rows[0].manager_user_id);
    const admins = await db.pool.query(
      `SELECT id FROM users WHERE role IN ('admin','superadmin') AND COALESCE(is_active,true)=true`
    );
    admins.rows.forEach(r => recips.add(r.id));
    recips.delete(userId); // quem recusou não precisa ser avisado

    const metaR = await _taskMeta(db, task);
    for (const uid of recips) {
      _notify(db, {
        type: 'pm_task_refused', userId: uid,
        payload: { ...metaR, reason: String(reason).trim() },
        entityType: 'project_task', entityId: taskId, ctaProjectId: task.project_id,
      });
    }
  } catch (e) { console.error('[task-service] notificação de recusa falhou', taskId, e.message); }

  return getTask(db.pool, taskId);
}

/** Inicia tarefa. Valida dependências de início (server-side). */
async function startTask(db, taskId, { userId }) {
  const task = await getTask(db.pool, taskId);
  if (!task) throw new Error('Tarefa não encontrada');
  assertTransition(task, TASK_STATUSES.IN_PROGRESS);

  const graph = await _loadGraph(db.pool, task.project_id);
  const start = dependencyResolver.canStartTask(taskId, graph);
  if (!start.ok) {
    const names = await _blockerNames(db, start.blockedBy);
    const msg = names.length
      ? `Não dá para iniciar ainda. Conclua antes: ${names.join(', ')}.`
      : 'Tarefa bloqueada por dependências de início não satisfeitas';
    const err = new Error(msg);
    err.code = 'start_blocked'; err.status = 409; err.blockedBy = start.blockedBy;
    throw err;
  }

  await db.pool.query(
    `UPDATE project_tasks
        SET status = 'in_progress',
            started_at = COALESCE(started_at, NOW()),
            captured_by_user_id = COALESCE(captured_by_user_id, $1),
            assignee_user_id = COALESCE(assignee_user_id, $1),
            paused_at = NULL,
            updated_at = NOW()
      WHERE id = $2`,
    [userId || null, taskId]
  );
  await appendTaskEvent(db.pool, db, { taskId, eventType: 'started', actorId: userId, payload: {} });
  return getTask(db.pool, taskId);
}

/** Pausa leve do trabalho (status permanece in_progress; só marca paused_at). */
async function pauseTask(db, taskId, { userId }) {
  const task = await getTask(db.pool, taskId);
  if (!task) throw new Error('Tarefa não encontrada');
  if (task.status !== 'in_progress') {
    const err = new Error('Só é possível pausar tarefa em andamento'); err.code = 'invalid_transition'; err.status = 409; throw err;
  }
  await db.pool.query(`UPDATE project_tasks SET paused_at = NOW(), updated_at = NOW() WHERE id = $1`, [taskId]);
  await appendTaskEvent(db.pool, db, { taskId, eventType: 'paused', actorId: userId, payload: {} });
  // Pausa junto a sessão Pomodoro ativa desta tarefa (preserva o tempo p/ retomar).
  try { await pomodoroService.pauseSessionForTask(db, taskId, userId); } catch { /* best-effort */ }
  return getTask(db.pool, taskId);
}

/** Retoma o trabalho (limpa paused_at). */
async function resumeTask(db, taskId, { userId }) {
  const task = await getTask(db.pool, taskId);
  if (!task) throw new Error('Tarefa não encontrada');
  if (task.status !== 'in_progress') {
    const err = new Error('Só é possível retomar tarefa em andamento'); err.code = 'invalid_transition'; err.status = 409; throw err;
  }
  await db.pool.query(`UPDATE project_tasks SET paused_at = NULL, updated_at = NOW() WHERE id = $1`, [taskId]);
  await appendTaskEvent(db.pool, db, { taskId, eventType: 'resumed', actorId: userId, payload: {} });
  // Retoma a sessão Pomodoro pausada desta tarefa (reabre o cronômetro de onde parou).
  try { await pomodoroService.resumeSessionForTask(db, taskId, userId); } catch { /* best-effort */ }
  return getTask(db.pool, taskId);
}

/** Cancela tarefa. */
async function cancelTask(db, taskId, { userId, reason = null }) {
  const task = await getTask(db.pool, taskId);
  if (!task) throw new Error('Tarefa não encontrada');
  assertTransition(task, TASK_STATUSES.CANCELED);
  await db.pool.query(`UPDATE project_tasks SET status = 'canceled', updated_at = NOW() WHERE id = $1`, [taskId]);
  await appendTaskEvent(db.pool, db, { taskId, eventType: 'canceled', actorId: userId, payload: { reason } });
  return getTask(db.pool, taskId);
}

// ─── Conclusão (transação: complete + liberar dependentes + gatilhos + finalizar)

/**
 * Conclui a tarefa. Se review_required → 'pending_review' (aprovação na Fase 6).
 * Senão → 'completed' e dispara efeitos: promove dependentes a available,
 * executa gatilhos (cria tarefas novas) e tenta finalizar o projeto.
 */
async function completeTask(db, taskId, { userId } = {}) {
  const pre = await getTask(db.pool, taskId);
  if (!pre) throw new Error('Tarefa não encontrada');

  // Gate de conclusão (completion_dependency).
  const graph0 = await _loadGraph(db.pool, pre.project_id);
  const comp = dependencyResolver.canCompleteTask(taskId, graph0);
  if (!comp.ok) {
    const names = await _blockerNames(db, comp.blockedBy);
    const msg = names.length
      ? `Conclua antes: ${names.join(', ')}.`
      : 'Tarefa bloqueada por dependências de conclusão não satisfeitas';
    const err = new Error(msg);
    err.code = 'completion_blocked'; err.status = 409; err.blockedBy = comp.blockedBy;
    throw err;
  }

  // Se exige revisão, não conclui agora — vai p/ pending_review (Fase 6 aprova).
  if (pre.review_required) {
    assertTransition(pre, TASK_STATUSES.PENDING_REVIEW);
    await db.pool.query(
      `UPDATE project_tasks SET status = 'pending_review', updated_at = NOW() WHERE id = $1`, [taskId]
    );
    await appendTaskEvent(db.pool, db, { taskId, eventType: 'submitted_for_review', actorId: userId, payload: {} });
    const metaC = await _taskMeta(db, pre);
    _notifyAdmins(db, { type: 'pm_review_requested', payload: metaC, entityType: 'project_task', entityId: taskId, ctaProjectId: pre.project_id });
    return { task: await getTask(db.pool, taskId), promoted: [], triggered: [], projectFinalized: false };
  }

  assertTransition(pre, TASK_STATUSES.COMPLETED);

  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');

    await client.query(
      `UPDATE project_tasks SET status = 'completed', completed_at = NOW(), updated_at = NOW() WHERE id = $1`, [taskId]
    );
    await appendTaskEvent(client, db, { taskId, eventType: 'completed', actorId: userId, payload: {} });

    const { promote, triggered, projectFinalized } = await _applyCompletionEffects(client, db, pre.project_id, taskId, userId);

    await client.query('COMMIT');

    // Auto-complete da sessão Pomodoro ativa nessa tarefa (decisão #13).
    // Best-effort pós-commit — não desfaz a conclusão se falhar.
    try { await pomodoroService.autoCompleteSessionForTask(db, taskId, { userId }); }
    catch (e) { console.error('[task-service] auto-complete pomodoro falhou', taskId, e.message); }

    await _notifyProjectCompleted(db, pre.project_id, projectFinalized);

    return {
      task: await getTask(db.pool, taskId),
      promoted: promote,
      triggered,
      projectFinalized,
    };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// Efeitos pós-conclusão (compartilhado por completeTask e approveReview):
// libera dependentes, dispara gatilhos e tenta finalizar o projeto.
async function _applyCompletionEffects(client, db, projectId, taskId, userId) {
  const graph = await _loadGraph(client, projectId);
  const promote = dependencyResolver.resolveAvailableTasks(graph);
  if (promote.length) {
    await client.query(
      `UPDATE project_tasks SET status = 'available', updated_at = NOW() WHERE id = ANY($1::varchar[])`, [promote]
    );
    for (const pid of promote) {
      await appendTaskEvent(client, db, { taskId: pid, eventType: 'dependency_unblocked', actorId: null, payload: { byTask: taskId } });
    }
  }
  const triggered = await triggerRunner.runTriggersForCompletedTask(db, taskId, { pgClient: client, actorId: userId });
  const projectFinalized = await projectFinalizer.maybeFinalizeProject(client, db, projectId);
  return { promote, triggered, projectFinalized };
}

// ─── Revisão (Fase 6) ─────────────────────────────────────────────────────────

/** Envia explicitamente p/ revisão (in_progress → pending_review). */
async function submitForReview(db, taskId, { userId }) {
  const task = await getTask(db.pool, taskId);
  if (!task) throw new Error('Tarefa não encontrada');
  assertTransition(task, TASK_STATUSES.PENDING_REVIEW);
  await db.pool.query(
    `UPDATE project_tasks SET status='pending_review', submitted_for_review_at=NOW(), updated_at=NOW() WHERE id=$1`, [taskId]
  );
  await appendTaskEvent(db.pool, db, { taskId, eventType: 'submitted_for_review', actorId: userId, payload: {} });
  const metaS = await _taskMeta(db, task);
  _notifyAdmins(db, { type: 'pm_review_requested', payload: metaS, entityType: 'project_task', entityId: taskId, ctaProjectId: task.project_id });
  return getTask(db.pool, taskId);
}

/**
 * Aprova a revisão. Conclui a tarefa (+ efeitos). Se o revisor for MANAGER,
 * cria tarefa de acompanhamento para um admin (regra do req cenário 3).
 * @param {object} reviewer - { id, role }
 */
async function approveReview(db, taskId, reviewer) {
  const pre = await getTask(db.pool, taskId);
  if (!pre) throw new Error('Tarefa não encontrada');
  if (pre.status !== TASK_STATUSES.PENDING_REVIEW) {
    throw err('Tarefa não está aguardando revisão', 'invalid_transition', 409);
  }
  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `UPDATE project_tasks SET status='completed', completed_at=NOW(), review_decision='approved',
              review_decided_at=NOW(), reviewer_user_id=$1, updated_at=NOW() WHERE id=$2`,
      [reviewer.id || null, taskId]
    );
    await appendTaskEvent(client, db, { taskId, eventType: 'review_approved', actorId: reviewer.id || null, payload: { reviewerRole: reviewer.role } });

    const effects = await _applyCompletionEffects(client, db, pre.project_id, taskId, reviewer.id || null);
    var _approveFinalized = effects.projectFinalized;

    let followUp = null;
    if (reviewWorkflow.shouldCreateFollowUp(reviewer.role)) {
      followUp = await reviewWorkflow.createAdminFollowUp(client, db, pre, reviewer.id || null);
    }

    await client.query('COMMIT');
    try { await pomodoroService.autoCompleteSessionForTask(db, taskId, { userId: reviewer.id }); } catch { /* best-effort */ }
    if (pre.assignee_user_id) {
      const metaA = await _taskMeta(db, pre);
      _notify(db, { type: 'pm_review_decided', userId: pre.assignee_user_id, payload: { ...metaA, approved: true }, entityType: 'project_task', entityId: taskId, ctaProjectId: pre.project_id });
    }
    await _notifyProjectCompleted(db, pre.project_id, _approveFinalized);
    return { task: await getTask(db.pool, taskId), followUp, ...effects };
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

/** Reprova a revisão → pending_adjustment (com notas). */
async function rejectReview(db, taskId, { userId, adjustmentNotes }) {
  const task = await getTask(db.pool, taskId);
  if (!task) throw new Error('Tarefa não encontrada');
  if (task.status !== TASK_STATUSES.PENDING_REVIEW) {
    throw err('Tarefa não está aguardando revisão', 'invalid_transition', 409);
  }
  if (!adjustmentNotes || !String(adjustmentNotes).trim()) {
    throw err('Descreva os ajustes necessários', 'reason_required', 400);
  }
  await db.pool.query(
    `UPDATE project_tasks SET status='pending_adjustment', review_decision='rejected',
            review_decided_at=NOW(), reviewer_user_id=$1, adjustment_notes=$2, updated_at=NOW() WHERE id=$3`,
    [userId || null, String(adjustmentNotes).trim(), taskId]
  );
  await appendTaskEvent(db.pool, db, { taskId, eventType: 'review_rejected', actorId: userId, payload: { adjustmentNotes: String(adjustmentNotes).trim() } });
  if (task.assignee_user_id) {
    const metaRj = await _taskMeta(db, task);
    _notify(db, { type: 'pm_review_decided', userId: task.assignee_user_id, payload: { ...metaRj, approved: false, notes: String(adjustmentNotes).trim() }, entityType: 'project_task', entityId: taskId, ctaProjectId: task.project_id });
  }
  return getTask(db.pool, taskId);
}

/** Lista tarefas aguardando revisão (fila do gestor). */
async function listPendingReviews(db) {
  const r = await db.pool.query(
    `SELECT t.*, p.name AS project_name, s.name AS stage_name
       FROM project_tasks t
       JOIN projects p ON p.id = t.project_id
       LEFT JOIN project_stages s ON s.id = t.project_stage_id
      WHERE t.status = 'pending_review'
      ORDER BY t.submitted_for_review_at ASC NULLS LAST`
  );
  return r.rows;
}

// ─── Leituras p/ dashboard ────────────────────────────────────────────────────

/** Tarefas do usuário (responsável OU capturador), filtráveis por status. */
async function listMyTasks(db, userId, { statuses } = {}) {
  const params = [userId];
  let statusClause = '';
  if (Array.isArray(statuses) && statuses.length) {
    params.push(statuses);
    statusClause = `AND t.status = ANY($2::varchar[])`;
  }
  const r = await db.pool.query(
    `SELECT t.*, p.name AS project_name, s.name AS stage_name
       FROM project_tasks t
       JOIN projects p ON p.id = t.project_id
       LEFT JOIN project_stages s ON s.id = t.project_stage_id
      WHERE (t.assignee_user_id = $1 OR t.captured_by_user_id = $1) ${statusClause}
      ORDER BY t.due_date NULLS LAST, t.updated_at DESC`,
    params
  );
  return r.rows;
}

/**
 * Tarefas "disponíveis para pegar": sem responsável e em status 'available',
 * de projetos que não estão concluídos/cancelados. Qualquer usuário do módulo vê
 * para poder se auto-atribuir.
 */
async function listAvailableUnassignedTasks(db) {
  const r = await db.pool.query(
    `SELECT t.*, p.name AS project_name, s.name AS stage_name
       FROM project_tasks t
       JOIN projects p ON p.id = t.project_id
       LEFT JOIN project_stages s ON s.id = t.project_stage_id
      WHERE t.assignee_user_id IS NULL
        AND t.status = 'available'
        AND p.status NOT IN ('concluido', 'cancelado', 'inativo')
      ORDER BY t.due_date ASC NULLS LAST, t.updated_at DESC`
  );
  return r.rows;
}

/** Tarefas de um projeto (admin/manager). */
async function listProjectTasks(db, projectId) {
  const r = await db.pool.query(
    `SELECT t.*, s.name AS stage_name FROM project_tasks t
       LEFT JOIN project_stages s ON s.id = t.project_stage_id
      WHERE t.project_id = $1 ORDER BY t.sort_order ASC`,
    [projectId]
  );
  return r.rows;
}

module.exports = {
  getTask,
  appendTaskEvent,
  assignTask,
  claimTask,
  acceptTask,
  refuseTask,
  startTask,
  pauseTask,
  resumeTask,
  cancelTask,
  completeTask,
  submitForReview,
  approveReview,
  rejectReview,
  listPendingReviews,
  listMyTasks,
  listAvailableUnassignedTasks,
  listProjectTasks,
};
