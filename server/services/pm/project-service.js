// ═══════════════════════════════════════════════════════════════════════════
// server/services/pm/project-service.js
//
// Service do módulo PM (Projetos + Tarefas) — Fase 1: esqueleto com helpers
// de auditoria (appendProjectEvent) e leituras básicas. Expandido nas Fases
// 3+ com criação atômica de projeto, integração com webhook PIX, etc.
//
// Padrão de transação segue o existente em `database-pg.js`:
//   const client = await db.pool.connect();
//   try {
//     await client.query('BEGIN');
//     // ... usa client.query(...) pra ficar na mesma tx
//     await client.query('COMMIT');
//   } catch (err) {
//     await client.query('ROLLBACK');
//     throw err;
//   } finally {
//     client.release();
//   }
//
// Funções aqui aceitam um `pgClient` opcional — se passado, usa essa conexão
// (mesma tx do caller); se omitido, usa o pool diretamente (1 query, sem tx).
// ═══════════════════════════════════════════════════════════════════════════

'use strict';

const { isValidProjectEventType, isValidActorType } = require('./state-machine');

/**
 * Grava 1 linha em project_events.
 *
 * @param {object}  db                  - Instância de Database (com .pool e .generateId)
 * @param {object}  params
 * @param {string}  params.projectId
 * @param {string}  params.eventType    - Veja PROJECT_EVENT_TYPES
 * @param {string}  params.actorType    - 'user' | 'system' | 'abacatepay' | 'cron'
 * @param {string}  [params.actorId]    - null permitido (ex.: 'system'/'cron')
 * @param {object}  [params.payload]    - JSONB
 * @param {object}  [params.pgClient]   - opcional; se passar, query usa essa conexão (mesma tx)
 * @returns {Promise<{ id: string }>}
 */
async function appendProjectEvent(db, params) {
  const {
    projectId,
    eventType,
    actorType,
    actorId = null,
    payload = {},
    pgClient,
  } = params || {};

  if (!projectId) {
    throw new Error('appendProjectEvent: projectId é obrigatório');
  }
  if (!isValidProjectEventType(eventType)) {
    throw new Error(`appendProjectEvent: eventType inválido "${eventType}"`);
  }
  if (!isValidActorType(actorType)) {
    throw new Error(`appendProjectEvent: actorType inválido "${actorType}"`);
  }

  const id = db.generateId();
  const sql = `
    INSERT INTO project_events (id, project_id, event_type, actor_type, actor_id, payload)
    VALUES ($1, $2, $3, $4, $5, $6::jsonb)
    RETURNING id
  `;
  const values = [id, projectId, eventType, actorType, actorId, JSON.stringify(payload)];

  const exec = pgClient || db.pool;
  const result = await exec.query(sql, values);
  return { id: result.rows[0].id };
}

/**
 * Busca projeto por ID. Retorna null se não existe.
 * Não inclui stages/tasks aninhadas — esses helpers virão na Fase 3.
 */
async function getProjectById(db, projectId, { pgClient } = {}) {
  if (!projectId) return null;
  const exec = pgClient || db.pool;
  const result = await exec.query('SELECT * FROM projects WHERE id = $1 LIMIT 1', [projectId]);
  return result.rows[0] || null;
}

/**
 * Lista projetos com filtros simples. Paginação por LIMIT/OFFSET.
 * Filtros ricos (por equipe do manager, agregados financeiros) virão na Fase 8.
 *
 * @param {object} db
 * @param {object} [filters]
 * @param {string} [filters.status]
 * @param {string} [filters.clientId]
 * @param {string} [filters.managerUserId]
 * @param {string} [filters.serviceId]
 * @param {string} [filters.source]
 * @param {number} [filters.limit=100]
 * @param {number} [filters.offset=0]
 */
async function listProjects(db, filters = {}) {
  const {
    status,
    clientId,
    managerUserId,
    serviceId,
    source,
    limit = 100,
    offset = 0,
  } = filters;

  const where = [];
  const values = [];
  let i = 1;

  if (status)        { where.push(`status = $${i++}`);          values.push(status); }
  if (clientId)      { where.push(`client_id = $${i++}`);       values.push(clientId); }
  if (managerUserId) { where.push(`manager_user_id = $${i++}`); values.push(managerUserId); }
  if (serviceId)     { where.push(`service_id = $${i++}`);      values.push(serviceId); }
  if (source)        { where.push(`source = $${i++}`);          values.push(source); }

  const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const sql = `
    SELECT *
      FROM projects
      ${whereClause}
     ORDER BY created_at DESC
     LIMIT $${i++} OFFSET $${i++}
  `;
  values.push(limit, offset);

  const result = await db.pool.query(sql, values);
  return result.rows;
}

/**
 * Lista os últimos N eventos de auditoria de um projeto.
 */
async function listProjectEvents(db, projectId, { limit = 200 } = {}) {
  if (!projectId) return [];
  const sql = `
    SELECT id, event_type, actor_type, actor_id, payload, created_at
      FROM project_events
     WHERE project_id = $1
     ORDER BY created_at DESC
     LIMIT $2
  `;
  const result = await db.pool.query(sql, [projectId, limit]);
  return result.rows;
}

module.exports = {
  appendProjectEvent,
  getProjectById,
  listProjects,
  listProjectEvents,
};
