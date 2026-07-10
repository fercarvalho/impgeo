// ═══════════════════════════════════════════════════════════════════════════
// server/services/pm/audit-service.js
// Auditoria central do PM (#8) — leitura da view unificada `pm_audit_v`
// (task_events + project_events + pomodoro_events) com filtros e paginação.
// Read-only: só consulta a view; nenhum write path é tocado.
// ═══════════════════════════════════════════════════════════════════════════
'use strict';

// Monta o WHERE parametrizado a partir dos filtros (todos opcionais). Função
// pura → testável sem banco. Datas em ISO (comparadas contra occurred_at).
function buildWhere({ source, entityId, actorId, eventType, from, to } = {}) {
  const conds = [];
  const params = [];
  const add = (frag, val) => { params.push(val); conds.push(frag.replace('$?', `$${params.length}`)); };

  if (source)    add('a.source = $?', source);
  if (entityId)  add('a.entity_id = $?', entityId);
  if (actorId)   add('a.actor_id = $?', actorId);
  if (eventType) add('a.event_type = $?', eventType);
  if (from)      add('a.occurred_at >= $?', from);
  if (to)        add('a.occurred_at <= $?', to);

  return { where: conds.length ? `WHERE ${conds.join(' AND ')}` : '', params };
}

// Consulta a auditoria unificada. `limit` null → sem paginação (retorna tudo).
// Retorna { items, total } (mesmo contrato das listas paginadas do #12).
async function queryPmAudit(db, filters = {}) {
  const { limit = null, offset = 0 } = filters;
  const { where, params } = buildWhere(filters);

  const countRes = await db.pool.query(
    `SELECT COUNT(*)::int AS total FROM pm_audit_v a ${where}`,
    params
  );
  const total = countRes.rows[0]?.total || 0;

  // LEFT JOIN users resolve o nome do ator quando é um usuário (task/project/
  // pomodoro); fica null para system/cron/abacatepay.
  let sql =
    `SELECT a.id, a.source, a.entity_type, a.entity_id, a.event_type,
            a.actor_type, a.actor_id, u.username AS actor_username,
            a.payload, a.occurred_at
       FROM pm_audit_v a
       LEFT JOIN users u ON u.id = a.actor_id
       ${where}
      ORDER BY a.occurred_at DESC`;

  const qParams = [...params];
  if (limit != null) {
    qParams.push(limit);  sql += ` LIMIT $${qParams.length}`;
    qParams.push(offset); sql += ` OFFSET $${qParams.length}`;
  }

  const res = await db.pool.query(sql, qParams);
  return { items: res.rows, total };
}

module.exports = { queryPmAudit, buildWhere };
