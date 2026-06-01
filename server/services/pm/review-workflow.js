// ═══════════════════════════════════════════════════════════════════════════
// server/services/pm/review-workflow.js
//
// Regra de revisão (req cenários 3 e 4):
//   - admin aprova   → tarefa concluída, SEM tarefa extra.
//   - manager aprova → tarefa concluída + tarefa de ACOMPANHAMENTO criada para
//     um admin (o de menor carga atual), aguardando aceite.
//
// Mantido separado de task-service (não o requer) para teste isolado e para
// evitar ciclo de require (task-service → review-workflow).
// ═══════════════════════════════════════════════════════════════════════════

'use strict';

function shouldCreateFollowUp(reviewerRole) {
  return reviewerRole === 'manager';
}

// Acha o admin/superadmin ativo com menor carga de tarefas abertas.
async function _leastLoadedAdmin(exec) {
  const r = await exec.query(
    `SELECT u.id
       FROM users u
      WHERE u.role IN ('admin','superadmin') AND COALESCE(u.is_active, true) = true
      ORDER BY (
        SELECT COUNT(*) FROM project_tasks t
         WHERE t.assignee_user_id = u.id
           AND t.status IN ('available','in_progress','pending_acceptance','pending_review')
      ) ASC, u.id ASC
      LIMIT 1`
  );
  return r.rows[0]?.id || null;
}

/**
 * Cria a tarefa de acompanhamento para um admin, na mesma etapa da original.
 * Status pending_acceptance (o admin precisa aceitar).
 * @returns {Promise<{ taskId: string, adminId: string } | null>}
 */
async function createAdminFollowUp(exec, db, originalTask, reviewerUserId) {
  const adminId = await _leastLoadedAdmin(exec);
  if (!adminId) return null;

  const ordRes = await exec.query(
    'SELECT COALESCE(MAX(sort_order), -1) + 1 AS next FROM project_tasks WHERE project_stage_id = $1',
    [originalTask.project_stage_id]
  );
  const newId = db.generateId();
  await exec.query(
    `INSERT INTO project_tasks
       (id, project_id, project_stage_id, name, description, sort_order, status,
        assignee_user_id, assigned_at, acceptance_required, created_by_trigger, created_at, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,'pending_acceptance',$7,NOW(),TRUE,FALSE, NOW(), NOW())`,
    [newId, originalTask.project_id, originalTask.project_stage_id,
     `Revisão final: ${originalTask.name}`,
     `Acompanhamento gerado porque a revisão foi feita por um gerente.`,
     ordRes.rows[0].next, adminId]
  );
  await exec.query(
    `INSERT INTO task_assignments_history (id, task_id, from_user_id, to_user_id, assigned_by_user_id, reason, note)
     VALUES ($1,$2,NULL,$3,$4,'follow_up',$5)`,
    [db.generateId(), newId, adminId, reviewerUserId, `Revisão de ${originalTask.id} por gerente`]
  );
  await exec.query(
    `INSERT INTO task_events (id, task_id, event_type, actor_type, actor_id, payload)
     VALUES ($1,$2,'assigned','system',NULL,$3::jsonb)`,
    [db.generateId(), newId, JSON.stringify({ followUpOf: originalTask.id, adminId, reason: 'manager_review' })]
  );
  return { taskId: newId, adminId };
}

module.exports = { shouldCreateFollowUp, createAdminFollowUp, _leastLoadedAdmin };
