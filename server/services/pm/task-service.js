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

// ─── Helpers ──────────────────────────────────────────────────────────────────

function err(message, code, status = 400, extra = {}) {
  const e = new Error(message); e.code = code; e.status = status; Object.assign(e, extra); return e;
}

async function getTask(exec, taskId) {
  const r = await exec.query('SELECT * FROM project_tasks WHERE id = $1 LIMIT 1', [taskId]);
  return r.rows[0] || null;
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
  let nextStatus = task.status;
  if (task.acceptance_required && (task.status === 'available' || task.status === 'pending')) {
    nextStatus = TASK_STATUSES.PENDING_ACCEPTANCE;
    assertTransition(task, nextStatus);
  }

  await db.pool.query(
    `UPDATE project_tasks SET assignee_user_id = $1, assigned_at = NOW(), status = $2, updated_at = NOW() WHERE id = $3`,
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
    const err = new Error('Tarefa bloqueada por dependências de início não satisfeitas');
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
    const err = new Error('Tarefa bloqueada por dependências de conclusão não satisfeitas');
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

    let followUp = null;
    if (reviewWorkflow.shouldCreateFollowUp(reviewer.role)) {
      followUp = await reviewWorkflow.createAdminFollowUp(client, db, pre, reviewer.id || null);
    }

    await client.query('COMMIT');
    try { await pomodoroService.autoCompleteSessionForTask(db, taskId, { userId: reviewer.id }); } catch { /* best-effort */ }
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
  listProjectTasks,
};
