// ═══════════════════════════════════════════════════════════════════════════
// server/services/pm/trigger-runner.js
//
// Executa os GATILHOS (project_task_triggers) quando uma tarefa conclui.
// Trigger ≠ dependência: dependência LIBERA tarefa existente; trigger CRIA
// uma tarefa nova descrita no payload.
//
// Idempotência: cada trigger row tem triggered_at. Se já preenchido, não
// dispara de novo (seguro pra replays / reprocessamento).
//
// Chamado pela Fase 4 (task-service.completeTask) dentro da mesma transação.
// ═══════════════════════════════════════════════════════════════════════════

'use strict';

/**
 * Dispara os triggers cuja source é `sourceTaskId` e que ainda não foram
 * executados. Cria as tarefas e marca os triggers como executados.
 *
 * @param {object} db
 * @param {string} sourceTaskId
 * @param {object} opts
 * @param {object} opts.pgClient   - conexão da tx (obrigatório: roda dentro da tx de conclusão)
 * @param {string} [opts.actorId]  - quem concluiu a source (audit)
 * @returns {Promise<Array<{ triggerId: string, createdTaskId: string, name: string }>>}
 */
async function runTriggersForCompletedTask(db, sourceTaskId, { pgClient, actorId = null } = {}) {
  const exec = pgClient || db.pool;

  // Carrega a source (precisamos da stage e do projeto p/ posicionar a nova task).
  const srcRes = await exec.query(
    'SELECT id, project_id, project_stage_id FROM project_tasks WHERE id = $1 LIMIT 1',
    [sourceTaskId]
  );
  const src = srcRes.rows[0];
  if (!src) return [];

  // Triggers pendentes (não executados) p/ status 'completed'.
  const trgRes = await exec.query(
    `SELECT * FROM project_task_triggers
      WHERE source_task_id = $1 AND on_status = 'completed' AND triggered_at IS NULL`,
    [sourceTaskId]
  );

  const created = [];
  for (const trg of trgRes.rows) {
    const payload = (typeof trg.payload === 'string' ? JSON.parse(trg.payload) : trg.payload) || {};
    const name = payload.name || 'Tarefa gerada';
    const targetStageId = payload.target_stage_id || src.project_stage_id;

    // sort_order: ao final da stage alvo.
    const ordRes = await exec.query(
      'SELECT COALESCE(MAX(sort_order), -1) + 1 AS next FROM project_tasks WHERE project_stage_id = $1',
      [targetStageId]
    );
    const sortOrder = ordRes.rows[0].next;

    const newTaskId = db.generateId();
    await exec.query(
      `INSERT INTO project_tasks
         (id, project_id, project_stage_id, name, description, sort_order, status,
          default_days, review_required, created_by_trigger, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,'available',$7,$8,TRUE, NOW(), NOW())`,
      [newTaskId, src.project_id, targetStageId, name, payload.description || null,
       sortOrder, payload.default_days || null, payload.requires_review === true]
    );

    // Marca trigger como executado (idempotência).
    await exec.query(
      'UPDATE project_task_triggers SET triggered_at = NOW(), created_task_id = $1 WHERE id = $2',
      [newTaskId, trg.id]
    );

    // Audit na tarefa criada.
    await exec.query(
      `INSERT INTO task_events (id, task_id, event_type, actor_type, actor_id, payload)
       VALUES ($1,$2,'created_by_trigger',$3,$4,$5::jsonb)`,
      [db.generateId(), newTaskId, actorId ? 'user' : 'system', actorId,
       JSON.stringify({ triggerId: trg.id, sourceTaskId })]
    );

    created.push({ triggerId: trg.id, createdTaskId: newTaskId, name });
  }

  return created;
}

module.exports = { runTriggersForCompletedTask };
