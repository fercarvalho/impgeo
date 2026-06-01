// ═══════════════════════════════════════════════════════════════════════════
// server/services/pm/help-service.js
//
// Pedidos de ajuda em tarefas (req item 18). O ajudante colabora, mas SÓ o
// responsável/capturador original conclui a tarefa principal — markCollaboration
// Complete apenas encerra o pedido de ajuda, não a tarefa.
// ═══════════════════════════════════════════════════════════════════════════

'use strict';

function err(message, code, status = 400) { const e = new Error(message); e.code = code; e.status = status; return e; }

async function createHelpRequest(db, taskId, { requesterUserId, targetUserId, message = null }) {
  if (!targetUserId) throw err('Selecione quem vai ajudar', 'target_required');
  if (targetUserId === requesterUserId) throw err('Você não pode pedir ajuda a si mesmo', 'invalid_target');
  const task = await db.pool.query('SELECT id FROM project_tasks WHERE id = $1', [taskId]);
  if (!task.rows[0]) throw err('Tarefa não encontrada', 'not_found', 404);

  const id = db.generateId();
  await db.pool.query(
    `INSERT INTO task_help_requests (id, task_id, requester_user_id, target_user_id, message, status)
     VALUES ($1,$2,$3,$4,$5,'pending')`,
    [id, taskId, requesterUserId, targetUserId, message]
  );
  await db.pool.query(
    `INSERT INTO task_events (id, task_id, event_type, actor_type, actor_id, payload)
     VALUES ($1,$2,'help_requested','user',$3,$4::jsonb)`,
    [db.generateId(), taskId, requesterUserId, JSON.stringify({ helpId: id, targetUserId })]
  );
  const r = await db.pool.query('SELECT * FROM task_help_requests WHERE id = $1', [id]);
  return r.rows[0];
}

async function _load(db, helpId) {
  const r = await db.pool.query('SELECT * FROM task_help_requests WHERE id = $1', [helpId]);
  if (!r.rows[0]) throw err('Pedido de ajuda não encontrado', 'not_found', 404);
  return r.rows[0];
}

async function acceptHelp(db, helpId, { userId }) {
  const h = await _load(db, helpId);
  if (h.target_user_id !== userId) throw err('Apenas o convidado pode aceitar', 'forbidden', 403);
  if (h.status !== 'pending') throw err('Pedido já respondido', 'invalid_state', 409);
  await db.pool.query(`UPDATE task_help_requests SET status='accepted', accepted_at=NOW(), updated_at=NOW() WHERE id=$1`, [helpId]);
  // Ajudante entra como colaborador (histórico; não vira assignee).
  await db.pool.query(
    `INSERT INTO task_assignments_history (id, task_id, from_user_id, to_user_id, assigned_by_user_id, reason, note)
     VALUES ($1,$2,NULL,$3,$4,'help','colaboração aceita')`,
    [db.generateId(), h.task_id, userId, h.requester_user_id]
  );
  return _load(db, helpId);
}

async function refuseHelp(db, helpId, { userId, reason }) {
  const h = await _load(db, helpId);
  if (h.target_user_id !== userId) throw err('Apenas o convidado pode recusar', 'forbidden', 403);
  if (h.status !== 'pending') throw err('Pedido já respondido', 'invalid_state', 409);
  if (!reason || !String(reason).trim()) throw err('Justificativa obrigatória para recusar', 'reason_required', 400);
  await db.pool.query(
    `UPDATE task_help_requests SET status='refused', refused_at=NOW(), refusal_reason=$1, updated_at=NOW() WHERE id=$2`,
    [String(reason).trim(), helpId]
  );
  return _load(db, helpId);
}

async function markCollaborationComplete(db, helpId, { userId, notes = null }) {
  const h = await _load(db, helpId);
  if (h.target_user_id !== userId) throw err('Apenas o ajudante encerra a própria colaboração', 'forbidden', 403);
  if (h.status !== 'accepted') throw err('Só uma colaboração aceita pode ser concluída', 'invalid_state', 409);
  await db.pool.query(
    `UPDATE task_help_requests SET status='completed', completed_at=NOW(), resolution_notes=$1, updated_at=NOW() WHERE id=$2`,
    [notes, helpId]
  );
  return _load(db, helpId);
}

async function listIncomingHelp(db, userId) {
  const r = await db.pool.query(
    `SELECT h.*, t.name AS task_name, p.name AS project_name
       FROM task_help_requests h
       JOIN project_tasks t ON t.id = h.task_id
       JOIN projects p ON p.id = t.project_id
      WHERE h.target_user_id = $1
      ORDER BY h.created_at DESC`, [userId]
  );
  return r.rows;
}

module.exports = {
  createHelpRequest, acceptHelp, refuseHelp, markCollaborationComplete, listIncomingHelp,
};
