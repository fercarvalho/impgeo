// ═══════════════════════════════════════════════════════════════════════════
// server/services/pm/reconcile-service.js
//
// Reconciliação dos totais denormalizados de projects (melhorias #10/#14):
//   - expenses_cents (soma de despesas)  e  progress_pct (% concluído)
// são mantidos por trigger (migration 052). Se um trigger falhar/for desabilitado
// ou houver escrita direta, os valores dessincronizam silenciosamente.
//
// checkTotals: lê a view pm_totals_drift_v (migration 069) — só linhas divergentes.
// healTotals : conserta chamando as MESMAS funções de recalc da 052
//   (pm_recalc_project_expenses / pm_project_progress_recalc) — não reimplementa
//   a fórmula, garantindo o valor correto por construção.
//
// A view espelha as fórmulas das funções (invariante documentada na 069).
// ═══════════════════════════════════════════════════════════════════════════

'use strict';

/** Projetos com totais divergentes (read-only). Cada linha: project_id,
 *  project_name, stored_* e expected_* de expenses_cents e progress_pct. */
async function checkTotals(db) {
  const r = await db.pool.query('SELECT * FROM pm_totals_drift_v ORDER BY project_id');
  return r.rows;
}

/**
 * Recomputa os totais corretos via as funções da 052. Sem `projectId`, conserta
 * todos os projetos divergentes (os que a view acusa); com `projectId`, só ele.
 * @returns {Promise<{ fixed: number, projectIds: string[] }>}
 */
async function healTotals(db, { projectId = null } = {}) {
  let ids;
  if (projectId) {
    ids = [projectId];
  } else {
    const r = await db.pool.query('SELECT project_id FROM pm_totals_drift_v');
    ids = r.rows.map((row) => row.project_id);
  }
  for (const id of ids) {
    await db.pool.query('SELECT pm_recalc_project_expenses($1)', [id]);
    await db.pool.query('SELECT pm_project_progress_recalc($1)', [id]);
  }
  return { fixed: ids.length, projectIds: ids };
}

module.exports = { checkTotals, healTotals };
