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
    const r = await db.pool.query(
      `SELECT t.name AS task_name, s.name AS stage_name, p.name AS project_name
         FROM project_tasks t
         LEFT JOIN project_stages s ON s.id = t.project_stage_id
         LEFT JOIN projects p ON p.id = t.project_id
        WHERE t.id = ANY($1::varchar[])`, [taskIds]
    );
    names.push(...r.rows.map(x => {
      const ctx = [x.stage_name && `etapa ${x.stage_name}`, x.project_name && `projeto ${x.project_name}`].filter(Boolean).join(' do ');
      return ctx ? `${x.task_name} (${ctx})` : x.task_name;
    }));
  }
  if (stageIds.length) {
    const r = await db.pool.query(
      `SELECT s.name AS stage_name, p.name AS project_name
         FROM project_stages s LEFT JOIN projects p ON p.id = s.project_id
        WHERE s.id = ANY($1::varchar[])`, [stageIds]
    );
    names.push(...r.rows.map(x => x.project_name ? `etapa "${x.stage_name}" (projeto ${x.project_name})` : `etapa "${x.stage_name}"`));
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
async function assignTask(db, taskId, { toUserId, assignedByUserId = null, reason = 'assign', dueDate = undefined }) {
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

  // dueDate: undefined → não mexe no prazo; '' → limpa; 'YYYY-MM-DD' → define.
  // (O relógio do prazo só liga no primeiro Play — ver startTask.)
  const setDue = dueDate !== undefined;
  await db.pool.query(
    `UPDATE project_tasks
        SET assignee_user_id = $1, assigned_at = NOW(), status = $2,
            accepted_at = NULL, refusal_reason = NULL${setDue ? ', due_date = $4' : ''}, updated_at = NOW()
      WHERE id = $3`,
    setDue ? [toUserId, nextStatus, taskId, dueDate || null] : [toUserId, nextStatus, taskId]
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
async function claimTask(db, taskId, { userId, actorRole = null }) {
  if (!userId) throw new Error('claimTask: userId obrigatório');
  const task = await getTask(db.pool, taskId);
  if (!task) throw new Error('Tarefa não encontrada');
  if (task.assignee_user_id) throw err('Esta tarefa já tem um responsável', 'already_assigned', 409);
  if (task.status !== TASK_STATUSES.AVAILABLE) {
    throw err('Só é possível pegar tarefas disponíveis', 'invalid_transition', 409);
  }
  if (task.gestor_only && !_isGestorRole(actorRole)) {
    throw err('Esta tarefa é restrita a gestores (gerente/admin).', 'gestor_only', 403);
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

// Pré-requisitos de CONCLUSÃO ainda pendentes de uma tarefa (item 4): as tarefas
// (ou etapas) que precisam estar concluídas antes desta. Cada item indica se o
// `viewer` pode "pegar também" (claimable). `graph` opcional p/ reuso em lote.
async function completionPrereqs(db, task, viewer, graph = null) {
  const g = graph || await _loadGraph(db.pool, task.project_id);
  const comp = dependencyResolver.canCompleteTask(task.id, g);
  if (comp.ok || !comp.blockedBy.length) return [];

  const taskIds = comp.blockedBy.filter(d => d.target_task_id).map(d => d.target_task_id);
  const stageIds = comp.blockedBy.filter(d => d.target_stage_id && !d.target_task_id).map(d => d.target_stage_id);
  const out = [];
  const role = viewer?.role || null;

  if (taskIds.length) {
    const r = await db.pool.query(
      `SELECT t.id, t.name, t.status, t.assignee_user_id, t.gestor_only,
              s.name AS stage_name, p.name AS project_name
         FROM project_tasks t
         LEFT JOIN project_stages s ON s.id = t.project_stage_id
         LEFT JOIN projects p ON p.id = t.project_id
        WHERE t.id = ANY($1::varchar[])`, [taskIds]
    );
    r.rows.forEach(t => out.push({
      kind: 'task', id: t.id, name: t.name, stage_name: t.stage_name, project_name: t.project_name,
      status: t.status, assignee_user_id: t.assignee_user_id, gestor_only: t.gestor_only === true,
      claimable: t.status === 'available' && !t.assignee_user_id && (!t.gestor_only || _isGestorRole(role)),
    }));
  }
  if (stageIds.length) {
    const r = await db.pool.query(
      `SELECT s.id, s.name, p.name AS project_name FROM project_stages s
         LEFT JOIN projects p ON p.id = s.project_id WHERE s.id = ANY($1::varchar[])`, [stageIds]
    );
    r.rows.forEach(s => out.push({
      kind: 'stage', id: s.id, name: s.name, project_name: s.project_name, claimable: false,
    }));
  }
  return out;
}

// Pega várias tarefas de uma vez (a principal + pré-requisitos sugeridos).
// Best-effort: ignora as que não dão mais pra pegar (já atribuídas, restritas,
// etc.) e retorna { claimed: [ids], skipped: [{id, error}] }.
async function claimTasksBulk(db, taskIds, { userId, actorRole = null }) {
  const claimed = [], skipped = [];
  for (const id of [...new Set(taskIds)]) {
    try { await claimTask(db, id, { userId, actorRole }); claimed.push(id); }
    catch (e) { skipped.push({ id, error: e.message, code: e.code }); }
  }
  return { claimed, skipped };
}

/**
 * Define/ajusta/limpa o prazo (due_date) da tarefa, sem reatribuir. Se a tarefa
 * estava 'overdue' e o novo prazo não está vencido (ou foi limpo), volta a 'available'.
 * dueDate: 'YYYY-MM-DD' define · null/'' limpa.
 */
async function setTaskDueDate(db, taskId, { dueDate, userId = null }) {
  const task = await getTask(db.pool, taskId);
  if (!task) throw new Error('Tarefa não encontrada');
  const newDue = dueDate || null;
  const r = await db.pool.query(
    `UPDATE project_tasks
        SET due_date = $1::date,
            status = CASE WHEN status = 'overdue' AND ($1::date IS NULL OR $1::date >= CURRENT_DATE)
                          THEN 'available' ELSE status END,
            updated_at = NOW()
      WHERE id = $2
      RETURNING *`,
    [newDue, taskId]
  );
  await appendTaskEvent(db.pool, db, { taskId, eventType: 'due_date_changed', actorId: userId, payload: { dueDate: newDue } });
  return r.rows[0];
}

// ─── Aprovação de alteração de prazo ──────────────────────────────────────────

const _isAdminRole = (role) => role === 'admin' || role === 'superadmin';
const _isGestorRole = (role) => role === 'manager' || _isAdminRole(role);

async function _userRole(db, userId) {
  if (!userId) return null;
  const r = await db.pool.query('SELECT role FROM users WHERE id = $1', [userId]);
  return r.rows[0]?.role || null;
}

// Quem pode revisar, dado o papel de QUEM enviou a tarefa para revisão (item 1):
//   - tarefa enviada por manager → só admin/superadmin revisa.
//   - tarefa enviada por usuário → manager (se manager_review_allowed) ou admin.
//   - admin/superadmin sempre pode (se admin_review_allowed).
function _canReview(submitterRole, task, reviewerRole) {
  if (_isAdminRole(reviewerRole)) return task.admin_review_allowed !== false;
  if (reviewerRole === 'manager') {
    if (submitterRole === 'manager') return false;
    return task.manager_review_allowed !== false;
  }
  return false;
}
function _dateStr(d) {
  if (!d) return null;
  if (typeof d === 'string') return d.slice(0, 10);
  const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0'), day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
async function _userName(db, userId) {
  if (!userId) return null;
  const r = await db.pool.query(
    `SELECT COALESCE(NULLIF(TRIM(COALESCE(first_name,'')||' '||COALESCE(last_name,'')),''), username) AS name FROM users WHERE id=$1`, [userId]
  );
  return r.rows[0]?.name || null;
}

/**
 * Usuário comum / manager pede aprovação para alterar o prazo da tarefa.
 * 1 pedido pendente por tarefa (re-pedir atualiza). Notifica os aprovadores:
 *  - pedido de usuário → manager do projeto + admins/superadmins.
 *  - pedido de manager → só admins/superadmins.
 */
async function requestDueDateChange(db, taskId, { userId, requestedDueDate = null, justification = null }) {
  const task = await getTask(db.pool, taskId);
  if (!task) throw new Error('Tarefa não encontrada');
  const ur = await db.pool.query('SELECT role FROM users WHERE id=$1', [userId]);
  const role = ur.rows[0]?.role || 'user';
  const requesterRole = role === 'manager' ? 'manager' : 'user';
  const requesterName = await _userName(db, userId);
  const newDue = requestedDueDate || null;
  const just = justification ? String(justification).trim().slice(0, 1000) || null : null;
  const curDue = _dateStr(task.due_date);

  const pr = await db.pool.query('SELECT name, manager_user_id FROM projects WHERE id=$1', [task.project_id]);
  const projectName = pr.rows[0]?.name || null;
  const managerId = pr.rows[0]?.manager_user_id || null;

  let row;
  const existing = await db.pool.query(`SELECT id FROM task_due_date_requests WHERE task_id=$1 AND status='pending' LIMIT 1`, [taskId]);
  if (existing.rows[0]) {
    row = (await db.pool.query(
      `UPDATE task_due_date_requests SET requested_due_date=$1::date, justification=$2, requested_by_user_id=$3,
              requester_role=$4, current_due_date=$5::date, updated_at=NOW() WHERE id=$6 RETURNING *`,
      [newDue, just, userId, requesterRole, curDue, existing.rows[0].id]
    )).rows[0];
  } else {
    row = (await db.pool.query(
      `INSERT INTO task_due_date_requests (id, task_id, project_id, requested_by_user_id, requester_role, current_due_date, requested_due_date, justification, status)
       VALUES ($1,$2,$3,$4,$5,$6::date,$7::date,$8,'pending') RETURNING *`,
      [db.generateId(), taskId, task.project_id, userId, requesterRole, curDue, newDue, just]
    )).rows[0];
  }

  const payload = { userName: requesterName, taskName: task.name, projectName, currentDue: curDue, requestedDue: newDue, justification: just };
  if (requesterRole === 'manager') {
    notificationService.notifyAdmins(db, { type: 'pm_due_date_requested', payload, entityType: 'project_task', entityId: taskId, ctaProjectId: task.project_id, exceptUserId: userId }).catch(() => {});
  } else {
    if (managerId && managerId !== userId) {
      notificationService.notify(db, { type: 'pm_due_date_requested', userId: managerId, payload, entityType: 'project_task', entityId: taskId, ctaProjectId: task.project_id }).catch(() => {});
    }
    notificationService.notifyAdmins(db, { type: 'pm_due_date_requested', payload, entityType: 'project_task', entityId: taskId, ctaProjectId: task.project_id, exceptUserId: userId }).catch(() => {});
  }
  return row;
}

/** Gestor aprova/recusa. Aplica o prazo se aprovado; notifica o solicitante. */
async function decideDueDateChange(db, requestId, reviewer, { approved }) {
  const rr = await db.pool.query(
    `SELECT id, task_id, project_id, requested_by_user_id, requester_role, status,
            requested_due_date::text AS requested_due_date
       FROM task_due_date_requests WHERE id=$1`, [requestId]
  );
  const reqRow = rr.rows[0];
  if (!reqRow) throw err('Pedido não encontrado', 'not_found', 404);
  if (reqRow.status !== 'pending') throw err('Pedido já decidido', 'invalid_state', 409);

  // Autoridade: admin/superadmin sempre; manager só pedido de USUÁRIO em projeto dele.
  let authorized = false;
  if (_isAdminRole(reviewer?.role)) authorized = true;
  else if (reviewer?.role === 'manager' && reqRow.requester_role === 'user') {
    const p = await db.pool.query('SELECT manager_user_id FROM projects WHERE id=$1', [reqRow.project_id]);
    authorized = p.rows[0]?.manager_user_id === reviewer.id;
  }
  if (!authorized) throw err('Você não pode decidir este pedido.', 'forbidden', 403);

  await db.pool.query(
    `UPDATE task_due_date_requests SET status=$1, decided_by_user_id=$2, decided_at=NOW(), updated_at=NOW() WHERE id=$3`,
    [approved ? 'approved' : 'rejected', reviewer?.id || null, requestId]
  );
  if (approved) {
    await setTaskDueDate(db, reqRow.task_id, { dueDate: reqRow.requested_due_date, userId: reviewer?.id || null });
  }

  const decidedByName = await _userName(db, reviewer?.id);
  const t = await getTask(db.pool, reqRow.task_id);
  notificationService.notify(db, {
    type: 'pm_due_date_decided', userId: reqRow.requested_by_user_id,
    payload: { approved: !!approved, taskName: t?.name, requestedDue: reqRow.requested_due_date, decidedByName },
    entityType: 'project_task', entityId: reqRow.task_id, ctaProjectId: reqRow.project_id,
  }).catch(() => {});
  return { status: approved ? 'approved' : 'rejected' };
}

/** Fila de pedidos de alteração de prazo (escopo do gestor). */
async function listPendingDueDateRequests(db, reviewer) {
  let where, params;
  if (_isAdminRole(reviewer?.role)) { where = `o.status='pending'`; params = []; }
  else if (reviewer?.role === 'manager') { where = `o.status='pending' AND o.requester_role='user' AND p.manager_user_id=$1`; params = [reviewer.id]; }
  else return [];
  const r = await db.pool.query(
    `SELECT o.id, o.task_id, o.project_id, o.requester_role,
            o.requested_due_date::text AS requested_due_date, o.current_due_date::text AS current_due_date,
            o.justification, t.name AS task_name, p.name AS project_name,
            COALESCE(NULLIF(TRIM(COALESCE(u.first_name,'')||' '||COALESCE(u.last_name,'')),''), u.username) AS requester_name
       FROM task_due_date_requests o
       JOIN project_tasks t ON t.id=o.task_id
       LEFT JOIN projects p ON p.id=o.project_id
       LEFT JOIN users u ON u.id=o.requested_by_user_id
      WHERE ${where}
      ORDER BY o.created_at ASC`, params
  );
  return r.rows;
}

// ─── Delegação com aprovação (manager fora do projeto → admin aprova) ─────────

/**
 * Cria um pedido de delegação: manager (não dono do projeto) delegando uma
 * tarefa a um usuário comum. A tarefa NÃO é atribuída agora — só após aprovação.
 */
async function requestDelegation(db, { taskId, projectId, managerId, toUserId, dueDate = null }) {
  const existing = await db.pool.query(`SELECT id FROM task_delegation_requests WHERE task_id=$1 AND status='pending' LIMIT 1`, [taskId]);
  if (existing.rows[0]) {
    await db.pool.query(
      `UPDATE task_delegation_requests SET to_user_id=$1, due_date=$2::date, requested_by_user_id=$3, updated_at=NOW() WHERE id=$4`,
      [toUserId, dueDate, managerId, existing.rows[0].id]
    );
  } else {
    await db.pool.query(
      `INSERT INTO task_delegation_requests (id, task_id, project_id, requested_by_user_id, to_user_id, due_date, status)
       VALUES ($1,$2,$3,$4,$5,$6::date,'pending')`,
      [db.generateId(), taskId, projectId, managerId, toUserId, dueDate]
    );
  }
  const task = await getTask(db.pool, taskId);
  const toName = await _userName(db, toUserId);
  const mgrName = await _userName(db, managerId);
  notificationService.notifyAdmins(db, {
    type: 'pm_delegation_requested',
    payload: { taskName: task?.name, projectName: task?.project_name, toName, managerName: mgrName },
    entityType: 'project_task', entityId: taskId, ctaProjectId: projectId, exceptUserId: managerId,
  }).catch(() => {});
  return { requested: true };
}

/** Decide um pedido de delegação (só admin/superadmin). approved → atribui. */
async function decideDelegation(db, requestId, reviewer, { approved }) {
  if (!_isAdminRole(reviewer?.role)) throw err('Apenas admin aprova delegações.', 'forbidden', 403);
  const rr = await db.pool.query(
    `SELECT id, task_id, project_id, requested_by_user_id, to_user_id, due_date::text AS due_date, status
       FROM task_delegation_requests WHERE id=$1`, [requestId]
  );
  const reqRow = rr.rows[0];
  if (!reqRow) throw err('Pedido não encontrado', 'not_found', 404);
  if (reqRow.status !== 'pending') throw err('Pedido já decidido', 'invalid_state', 409);

  await db.pool.query(
    `UPDATE task_delegation_requests SET status=$1, decided_by_user_id=$2, decided_at=NOW(), updated_at=NOW() WHERE id=$3`,
    [approved ? 'approved' : 'rejected', reviewer?.id || null, requestId]
  );
  if (approved) {
    // Atribui EM NOME DO MANAGER que delegou (reason 'assign'): assim a tarefa
    // fica registrada como dele e uma eventual recusa volta para o manager, não
    // para o admin que só aprovou.
    await assignTask(db, reqRow.task_id, {
      toUserId: reqRow.to_user_id, assignedByUserId: reqRow.requested_by_user_id, reason: 'assign',
      ...(reqRow.due_date ? { dueDate: reqRow.due_date } : {}),
    });
  }
  const decidedByName = await _userName(db, reviewer?.id);
  const t = await getTask(db.pool, reqRow.task_id);
  notificationService.notify(db, {
    type: 'pm_delegation_decided', userId: reqRow.requested_by_user_id,
    payload: { approved: !!approved, taskName: t?.name, toName: await _userName(db, reqRow.to_user_id), decidedByName },
    entityType: 'project_task', entityId: reqRow.task_id, ctaProjectId: reqRow.project_id,
  }).catch(() => {});
  return { status: approved ? 'approved' : 'rejected' };
}

/** Fila de pedidos de delegação pendentes (só admin/superadmin). */
async function listPendingDelegations(db, viewer) {
  if (!_isAdminRole(viewer?.role)) return [];
  const NAME = (a) => `COALESCE(NULLIF(TRIM(COALESCE(${a}.first_name,'')||' '||COALESCE(${a}.last_name,'')),''), ${a}.username)`;
  const r = await db.pool.query(
    `SELECT o.id, o.task_id, o.project_id, o.due_date::text AS due_date,
            t.name AS task_name, p.name AS project_name,
            ${NAME('mu')} AS requester_name, ${NAME('tu')} AS to_name
       FROM task_delegation_requests o
       JOIN project_tasks t ON t.id=o.task_id
       LEFT JOIN projects p ON p.id=o.project_id
       LEFT JOIN users mu ON mu.id=o.requested_by_user_id
       LEFT JOIN users tu ON tu.id=o.to_user_id
      WHERE o.status='pending'
      ORDER BY o.created_at ASC`
  );
  return r.rows;
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
  // completed → in_progress só é permitido via uncompleteTask (com motivo e,
  // p/ manager, aprovação). "Iniciar" não pode reabrir uma concluída.
  if (task.status === TASK_STATUSES.COMPLETED) {
    throw err('Tarefa concluída — use "Desconcluir" para reabrir', 'invalid_transition', 409);
  }
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
            -- liga o relógio do prazo no PRIMEIRO play (hoje BRT + duração), se ainda não houver
            due_date = CASE WHEN due_date IS NULL AND default_days IS NOT NULL
                            THEN (NOW() AT TIME ZONE 'America/Sao_Paulo')::date + default_days ELSE due_date END,
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
async function completeTask(db, taskId, { userId, actorRole } = {}) {
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

  // Revisão por papel (req item 1): admin/superadmin concluindo NÃO passa por
  // revisão — vai direto a 'completed'. Para os demais, se a tarefa exige
  // revisão, vai p/ pending_review guardando QUEM enviou (gatear o revisor).
  if (pre.review_required && !_isAdminRole(actorRole)) {
    assertTransition(pre, TASK_STATUSES.PENDING_REVIEW);
    await db.pool.query(
      `UPDATE project_tasks SET status = 'pending_review', submitted_for_review_by_user_id = $2, updated_at = NOW() WHERE id = $1`,
      [taskId, userId || null]
    );
    await appendTaskEvent(db.pool, db, { taskId, eventType: 'submitted_for_review', actorId: userId, payload: { submitterRole: actorRole || null } });
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
  const submitterRole = await _userRole(db, pre.submitted_for_review_by_user_id);
  if (!_canReview(submitterRole, pre, reviewer.role)) {
    throw err('Esta tarefa foi concluída por um gerente; só admin pode revisá-la.', 'review_forbidden', 403);
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
    // Revisão por gerente gerou "Revisão final" disponível: avisa TODOS os
    // admins/superadmins — quem puder, pega e conclui.
    if (followUp) {
      const metaF = await _taskMeta(db, pre);
      _notifyAdmins(db, { type: 'pm_review_followup', payload: { ...metaF, taskName: followUp.taskName }, entityType: 'project_task', entityId: followUp.taskId, ctaProjectId: pre.project_id });
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
async function rejectReview(db, taskId, { userId, reviewerRole, adjustmentNotes }) {
  const task = await getTask(db.pool, taskId);
  if (!task) throw new Error('Tarefa não encontrada');
  if (task.status !== TASK_STATUSES.PENDING_REVIEW) {
    throw err('Tarefa não está aguardando revisão', 'invalid_transition', 409);
  }
  const submitterRole = await _userRole(db, task.submitted_for_review_by_user_id);
  if (!_canReview(submitterRole, task, reviewerRole)) {
    throw err('Esta tarefa foi concluída por um gerente; só admin pode revisá-la.', 'review_forbidden', 403);
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

// ─── Desconcluir (reabrir) tarefa (req item 5) ────────────────────────────────

// Aplica a reabertura: tarefa volta para 'available' (o responsável precisa dar
// play de novo) com o responsável escolhido (self = quem pediu; original = quem
// havia concluído). Reabre também o projeto se ele tinha sido finalizado por
// causa desta tarefa.
async function _applyUncomplete(db, task, { target, requesterId, originalCompleter, reason, actorId }) {
  // 'pool' = sem responsável (volta pra fila de "disponíveis para pegar").
  const newAssignee = target === 'pool' ? null
    : (target === 'self' ? requesterId : (originalCompleter || requesterId));
  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `UPDATE project_tasks
          SET status='available', assignee_user_id=$2,
              accepted_at = CASE WHEN $2::varchar IS NULL THEN NULL ELSE NOW() END,
              completed_at=NULL, started_at=NULL, paused_at=NULL,
              review_decision=NULL, review_decided_at=NULL, reviewer_user_id=NULL,
              submitted_for_review_by_user_id=NULL, updated_at=NOW()
        WHERE id=$1`,
      [task.id, newAssignee]
    );
    await appendTaskEvent(client, db, { taskId: task.id, eventType: 'uncompleted', actorId, payload: { reason, target, toUserId: newAssignee } });
    // Se o projeto havia sido finalizado, reabre (tem tarefa em andamento de novo).
    await client.query(
      `UPDATE projects SET status='ativo', completed_at=NULL, updated_at=NOW()
        WHERE id=$1 AND status='concluido'`,
      [task.project_id]
    );
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
  if (newAssignee) {
    const meta = await _taskMeta(db, task);
    _notify(db, { type: 'pm_task_uncompleted', userId: newAssignee, payload: { ...meta, reason }, entityType: 'project_task', entityId: task.id, ctaProjectId: task.project_id });
  }
  return getTask(db.pool, task.id);
}

/**
 * Desconclui (reabre) uma tarefa concluída.
 * @param {object} actor - { id, role }
 * @param {string} reason - obrigatório
 * @param {'self'|'original'|'pool'} target - capturar p/ si, devolver a quem concluiu, ou deixar disponível (sem responsável)
 * @returns {Promise<{ reopened?: object, requested?: object }>}
 */
async function uncompleteTask(db, taskId, { actor, reason, target = 'original' }) {
  const task = await getTask(db.pool, taskId);
  if (!task) throw new Error('Tarefa não encontrada');
  if (task.status !== TASK_STATUSES.COMPLETED) {
    throw err('Só é possível desconcluir tarefas concluídas', 'invalid_transition', 409);
  }
  if (!reason || !String(reason).trim()) {
    throw err('Explique o motivo da reabertura', 'reason_required', 400);
  }
  const cleanReason = String(reason).trim();
  const tgt = ['self', 'original', 'pool'].includes(target) ? target : 'original';
  const originalCompleter = task.assignee_user_id || null;

  // Usuário comum: só a tarefa que ele concluiu; volta sempre pra ele.
  if (!_isGestorRole(actor.role)) {
    if (originalCompleter !== actor.id) {
      throw err('Você só pode desconcluir tarefas que você concluiu', 'forbidden', 403);
    }
    const reopened = await _applyUncomplete(db, task, { target: 'self', requesterId: actor.id, originalCompleter, reason: cleanReason, actorId: actor.id });
    return { reopened };
  }

  // Admin/superadmin: aplica direto, com o target escolhido.
  if (_isAdminRole(actor.role)) {
    const reopened = await _applyUncomplete(db, task, { target: tgt, requesterId: actor.id, originalCompleter, reason: cleanReason, actorId: actor.id });
    // Ao reabrir PARA SI MESMO, os DEMAIS admins/superadmins são apenas
    // notificados (sino + e-mail) de que ele fez isso, com a justificativa.
    if (tgt === 'self') {
      const meta = await _taskMeta(db, task);
      const actorName = await _userName(db, actor.id);
      _notifyAdmins(db, { type: 'pm_uncomplete_self_notice', exceptUserId: actor.id, payload: { ...meta, reason: cleanReason, actorName }, entityType: 'project_task', entityId: taskId, ctaProjectId: task.project_id });
    }
    return { reopened };
  }

  // Manager: só nos projetos dele E precisa de aprovação de admin.
  const pr = await db.pool.query('SELECT manager_user_id FROM projects WHERE id = $1', [task.project_id]);
  if (pr.rows[0]?.manager_user_id !== actor.id) {
    throw err('Gerente só desconclui tarefas dos projetos que gerencia', 'forbidden', 403);
  }
  const reqId = db.generateId();
  await db.pool.query(
    `INSERT INTO task_uncomplete_requests
       (id, task_id, project_id, requested_by_user_id, requester_role, reason, target, original_completer_user_id)
     VALUES ($1,$2,$3,$4,'manager',$5,$6,$7)`,
    [reqId, taskId, task.project_id, actor.id, cleanReason, tgt, originalCompleter]
  );
  const meta = await _taskMeta(db, task);
  _notifyAdmins(db, { type: 'pm_uncomplete_requested', payload: { ...meta, reason: cleanReason }, entityType: 'project_task', entityId: taskId, ctaProjectId: task.project_id });
  return { requested: { id: reqId } };
}

/** Lista pedidos de reabertura pendentes (só admin/superadmin decide). */
async function listPendingUncompleteRequests(db, viewer = null) {
  if (!_isAdminRole(viewer?.role)) return [];
  const r = await db.pool.query(
    `SELECT ur.*, t.name AS task_name, p.name AS project_name,
            COALESCE(NULLIF(TRIM(COALESCE(ru.first_name,'')||' '||COALESCE(ru.last_name,'')),''), ru.username) AS requester_name
       FROM task_uncomplete_requests ur
       JOIN project_tasks t ON t.id = ur.task_id
       LEFT JOIN projects p ON p.id = ur.project_id
       LEFT JOIN users ru ON ru.id = ur.requested_by_user_id
      WHERE ur.status = 'pending'
      ORDER BY ur.created_at ASC`
  );
  return r.rows;
}

/** Decide um pedido de reabertura (admin). approve=true reabre; senão rejeita. */
async function decideUncomplete(db, reqId, { admin, approve }) {
  if (!_isAdminRole(admin?.role)) throw err('Apenas admin decide reaberturas', 'forbidden', 403);
  const rr = await db.pool.query('SELECT * FROM task_uncomplete_requests WHERE id = $1', [reqId]);
  const req = rr.rows[0];
  if (!req) throw new Error('Pedido não encontrado');
  if (req.status !== 'pending') throw err('Pedido já decidido', 'invalid_transition', 409);

  await db.pool.query(
    `UPDATE task_uncomplete_requests SET status=$2, decided_by_user_id=$3, decided_at=NOW(), updated_at=NOW() WHERE id=$1`,
    [reqId, approve ? 'approved' : 'rejected', admin.id]
  );

  // Notifica o manager que pediu.
  const task = await getTask(db.pool, req.task_id);
  if (task) {
    const meta = await _taskMeta(db, task);
    _notify(db, { type: 'pm_uncomplete_decided', userId: req.requested_by_user_id, payload: { ...meta, approved: !!approve }, entityType: 'project_task', entityId: req.task_id, ctaProjectId: req.project_id });
  }

  if (approve && task && task.status === TASK_STATUSES.COMPLETED) {
    const reopened = await _applyUncomplete(db, task, {
      target: req.target, requesterId: req.requested_by_user_id,
      originalCompleter: req.original_completer_user_id, reason: req.reason, actorId: admin.id,
    });
    return { approved: true, reopened };
  }
  return { approved: !!approve };
}

/** Lista tarefas aguardando revisão (fila do gestor).
 *  Anota `can_review` por tarefa conforme o papel do `viewer` e de quem enviou
 *  (item 1): manager não revisa tarefa enviada por outro manager. */
async function listPendingReviews(db, viewer = null) {
  const r = await db.pool.query(
    `SELECT t.*, p.name AS project_name, s.name AS stage_name, su.role AS submitter_role
       FROM project_tasks t
       JOIN projects p ON p.id = t.project_id
       LEFT JOIN project_stages s ON s.id = t.project_stage_id
       LEFT JOIN users su ON su.id = t.submitted_for_review_by_user_id
      WHERE t.status = 'pending_review'
      ORDER BY t.submitted_for_review_at ASC NULLS LAST`
  );
  const role = viewer?.role || null;
  return r.rows.map(t => ({ ...t, can_review: _canReview(t.submitter_role, t, role) }));
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
  setTaskDueDate,
  requestDueDateChange,
  decideDueDateChange,
  listPendingDueDateRequests,
  requestDelegation,
  decideDelegation,
  listPendingDelegations,
  claimTask,
  claimTasksBulk,
  completionPrereqs,
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
  uncompleteTask,
  listPendingUncompleteRequests,
  decideUncomplete,
  listPendingReviews,
  listMyTasks,
  listAvailableUnassignedTasks,
  listProjectTasks,
};
