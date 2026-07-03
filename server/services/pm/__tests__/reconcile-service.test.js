// Testes da reconciliação de totais (#10/#14). db.pool.query fake roteado por
// regex; valida que checkTotals lê a view e healTotals chama as funções de recalc.
import { describe, it, expect, vi } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const reconcile = require('../reconcile-service');

function router(routes, fallback = { rows: [] }) {
  return async (sql, params) => {
    for (const [re, resp] of routes) {
      if (re.test(sql)) return typeof resp === 'function' ? resp(params) : resp;
    }
    return fallback;
  };
}
function makeDb(handler) {
  return { pool: { query: vi.fn(handler) } };
}
const calls = (db) => db.pool.query.mock.calls;

const RE_VIEW = /FROM pm_totals_drift_v/;
const RE_RECALC_EXP = /pm_recalc_project_expenses\(\$1\)/;
const RE_RECALC_PROG = /pm_project_progress_recalc\(\$1\)/;

describe('reconcile-service · checkTotals', () => {
  it('lê a view e devolve as linhas divergentes', async () => {
    const drift = { project_id: 'p1', stored_progress_pct: 99, expected_progress_pct: 50 };
    const db = makeDb(router([[RE_VIEW, { rows: [drift] }]]));
    const rows = await reconcile.checkTotals(db);
    expect(rows).toEqual([drift]);
    expect(calls(db)).toHaveLength(1);
  });

  it('sem divergência → lista vazia', async () => {
    const db = makeDb(router([[RE_VIEW, { rows: [] }]]));
    expect(await reconcile.checkTotals(db)).toEqual([]);
  });
});

describe('reconcile-service · healTotals', () => {
  it('sem projectId: lê os ids da view e recalcula cada um (as duas funções)', async () => {
    const db = makeDb(router([[RE_VIEW, { rows: [{ project_id: 'p1' }, { project_id: 'p2' }] }]]));
    const res = await reconcile.healTotals(db);
    expect(res).toEqual({ fixed: 2, projectIds: ['p1', 'p2'] });
    const params = calls(db).filter((c) => RE_RECALC_EXP.test(c[0]) || RE_RECALC_PROG.test(c[0]));
    // 2 projetos × 2 funções = 4 chamadas de recalc
    expect(params).toHaveLength(4);
    expect(calls(db).filter((c) => RE_RECALC_EXP.test(c[0])).map((c) => c[1])).toEqual([['p1'], ['p2']]);
    expect(calls(db).filter((c) => RE_RECALC_PROG.test(c[0])).map((c) => c[1])).toEqual([['p1'], ['p2']]);
  });

  it('com projectId: só ele, sem ler a view', async () => {
    const db = makeDb(router([]));
    const res = await reconcile.healTotals(db, { projectId: 'pX' });
    expect(res).toEqual({ fixed: 1, projectIds: ['pX'] });
    expect(calls(db).some((c) => RE_VIEW.test(c[0]))).toBe(false);
    expect(calls(db).filter((c) => RE_RECALC_EXP.test(c[0]) || RE_RECALC_PROG.test(c[0]))).toHaveLength(2);
  });

  it('nada divergente → não chama recalc', async () => {
    const db = makeDb(router([[RE_VIEW, { rows: [] }]]));
    const res = await reconcile.healTotals(db);
    expect(res).toEqual({ fixed: 0, projectIds: [] });
    expect(calls(db).filter((c) => RE_RECALC_EXP.test(c[0]) || RE_RECALC_PROG.test(c[0]))).toHaveLength(0);
  });
});
