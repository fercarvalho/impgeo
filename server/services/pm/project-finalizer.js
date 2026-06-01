// ═══════════════════════════════════════════════════════════════════════════
// server/services/pm/project-finalizer.js
//
// Após uma tarefa concluir, se o projeto tem auto_finalize=TRUE e todas as
// tarefas obrigatórias (não canceladas/recusadas) estão completas, marca o
// projeto como 'concluido'. Roda dentro da tx de conclusão.
// ═══════════════════════════════════════════════════════════════════════════

'use strict';

/**
 * @param {object} exec - pgClient (mesma tx) ou pool
 * @param {object} db   - p/ generateId
 * @param {string} projectId
 * @returns {Promise<boolean>} true se finalizou o projeto agora
 */
async function maybeFinalizeProject(exec, db, projectId) {
  const projRes = await exec.query('SELECT id, status, auto_finalize FROM projects WHERE id = $1', [projectId]);
  const project = projRes.rows[0];
  if (!project) return false;
  if (project.auto_finalize !== true) return false;
  if (project.status === 'concluido' || project.status === 'cancelado') return false;

  // Tarefas "vivas" = não canceladas/recusadas. Projeto finaliza quando todas
  // as vivas estão completed (e existe ao menos uma).
  const countRes = await exec.query(
    `SELECT
       COUNT(*) FILTER (WHERE status NOT IN ('canceled','refused')) AS alive,
       COUNT(*) FILTER (WHERE status = 'completed')                 AS done
     FROM project_tasks WHERE project_id = $1`,
    [projectId]
  );
  const alive = Number(countRes.rows[0].alive);
  const done = Number(countRes.rows[0].done);
  if (alive === 0 || done < alive) return false;

  await exec.query(
    `UPDATE projects SET status = 'concluido', completed_at = NOW(), progress_pct = 100, updated_at = NOW() WHERE id = $1`,
    [projectId]
  );
  await exec.query(
    `INSERT INTO project_events (id, project_id, event_type, actor_type, actor_id, payload)
     VALUES ($1,$2,'completed','system',NULL,$3::jsonb)`,
    [db.generateId(), projectId, JSON.stringify({ reason: 'auto_finalize', tasksCompleted: done })]
  );
  return true;
}

module.exports = { maybeFinalizeProject };
