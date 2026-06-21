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

/**
 * Cria a tarefa de acompanhamento ("Revisão final") na mesma etapa da original.
 * Fica DISPONÍVEL e SEM responsável, restrita a gestor (gestor_only) — qualquer
 * admin/superadmin pode pegar e fazer. A notificação a todos os gestores é
 * disparada pelo chamador (approveReview), após o commit.
 * @returns {Promise<{ taskId: string, taskName: string } | null>}
 */
async function createAdminFollowUp(exec, db, originalTask, reviewerUserId) {
  const ordRes = await exec.query(
    'SELECT COALESCE(MAX(sort_order), -1) + 1 AS next FROM project_tasks WHERE project_stage_id = $1',
    [originalTask.project_stage_id]
  );
  const newId = db.generateId();
  const taskName = `Revisão final: ${originalTask.name}`;
  await exec.query(
    `INSERT INTO project_tasks
       (id, project_id, project_stage_id, name, description, sort_order, status,
        gestor_only, acceptance_required, created_by_trigger, created_at, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,'available', TRUE, FALSE, FALSE, NOW(), NOW())`,
    [newId, originalTask.project_id, originalTask.project_stage_id, taskName,
     `Acompanhamento gerado porque a revisão foi feita por um gerente. Qualquer admin/superadmin pode pegar e concluir.`,
     ordRes.rows[0].next]
  );
  await exec.query(
    `INSERT INTO task_events (id, task_id, event_type, actor_type, actor_id, payload)
     VALUES ($1,$2,'created','system',NULL,$3::jsonb)`,
    [db.generateId(), newId, JSON.stringify({ followUpOf: originalTask.id, reason: 'manager_review' })]
  );
  return { taskId: newId, taskName };
}

module.exports = { shouldCreateFollowUp, createAdminFollowUp };
