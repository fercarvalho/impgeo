// ═══════════════════════════════════════════════════════════════════════════
// server/services/pm/cost-service.js
//
// Fase 8: financeiro do projeto. O custo (expenses_cents) é mantido por TRIGGER
// SQL (migration 052) ao vincular/alterar transações; este service só LÊ e
// expõe a vinculação. profit_cents é coluna GENERATED (total - expenses).
// ═══════════════════════════════════════════════════════════════════════════

'use strict';

/** Vincula (ou desvincula com projectId=null) uma transação a um projeto. */
async function linkTransactionToProject(db, transactionId, projectId) {
  const r = await db.pool.query(
    `UPDATE transactions SET project_id = $1, updated_at = NOW() WHERE id = $2 RETURNING id, project_id`,
    [projectId || null, transactionId]
  );
  if (!r.rows.length) { const e = new Error('Transação não encontrada'); e.status = 404; throw e; }
  return r.rows[0];
}

/** Financeiro do projeto + transações vinculadas. */
async function getProjectFinancials(db, projectId) {
  const p = await db.pool.query(
    `SELECT id, name, total_cents, paid_cents, expenses_cents, profit_cents FROM projects WHERE id = $1`,
    [projectId]
  );
  if (!p.rows.length) return null;
  const tx = await db.pool.query(
    `SELECT id, date, description, value, type, category FROM transactions WHERE project_id = $1 ORDER BY date DESC`,
    [projectId]
  );
  return { ...p.rows[0], transactions: tx.rows };
}

module.exports = { linkTransactionToProject, getProjectFinancials };
