// Testes do cost-service (Fase 8). Mocka db.pool.query.
import { describe, it, expect, vi } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const cost = require('../cost-service');

function makeDb(handler) {
  return { pool: { query: vi.fn(handler) } };
}

describe('cost-service · linkTransactionToProject', () => {
  it('vincula transação e retorna o vínculo', async () => {
    const db = makeDb(async (sql, p) => {
      expect(sql).toMatch(/UPDATE transactions SET project_id/);
      return { rows: [{ id: p[1], project_id: p[0] }] };
    });
    const r = await cost.linkTransactionToProject(db, 'tx1', 'proj1');
    expect(r.project_id).toBe('proj1');
  });

  it('desvincula com projectId=null', async () => {
    const db = makeDb(async (sql, p) => ({ rows: [{ id: 'tx1', project_id: null }] }));
    const r = await cost.linkTransactionToProject(db, 'tx1', null);
    expect(r.project_id).toBeNull();
  });

  it('404 se transação não existe', async () => {
    const db = makeDb(async () => ({ rows: [] }));
    let err;
    try { await cost.linkTransactionToProject(db, 'ghost', 'p1'); } catch (e) { err = e; }
    expect(err).toBeDefined();
    expect(err.status).toBe(404);
  });
});

describe('cost-service · getProjectFinancials', () => {
  it('retorna financeiro + transações vinculadas', async () => {
    const db = makeDb(async (sql) => {
      if (/FROM projects WHERE id/.test(sql)) return { rows: [{ id: 'p1', name: 'P', total_cents: 10000, paid_cents: 0, expenses_cents: 3000, profit_cents: 7000 }] };
      if (/FROM transactions WHERE project_id/.test(sql)) return { rows: [{ id: 't1', value: 30, type: 'Despesa' }] };
      return { rows: [] };
    });
    const r = await cost.getProjectFinancials(db, 'p1');
    expect(r.profit_cents).toBe(7000);
    expect(r.transactions).toHaveLength(1);
  });

  it('null se projeto não existe', async () => {
    const db = makeDb(async () => ({ rows: [] }));
    expect(await cost.getProjectFinancials(db, 'x')).toBeNull();
  });
});
