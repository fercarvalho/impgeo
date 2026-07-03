// Testes da paginação opt-in do PM (melhoria #12): helper puro parsePagination
// + encaixe de LIMIT/OFFSET/COUNT nas list-functions (db.query fake).
import { describe, it, expect, vi } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { parsePagination } = require('../pagination');
const taskService = require('../task-service');

// ─── parsePagination (puro) ─────────────────────────────────────────────────
describe('parsePagination', () => {
  it('sem limit → sem paginação (limit null, offset 0)', () => {
    expect(parsePagination({})).toEqual({ limit: null, offset: 0 });
    expect(parsePagination({ offset: 40 })).toEqual({ limit: null, offset: 0 });
  });

  it('limit=0 → sem paginação', () => {
    expect(parsePagination({ limit: 0 })).toEqual({ limit: null, offset: 0 });
    expect(parsePagination({ limit: '0' })).toEqual({ limit: null, offset: 0 });
  });

  it('limit válido pagina; offset default 0', () => {
    expect(parsePagination({ limit: 25 })).toEqual({ limit: 25, offset: 0 });
    expect(parsePagination({ limit: '10' })).toEqual({ limit: 10, offset: 0 });
  });

  it('offset explícito tem precedência sobre page', () => {
    expect(parsePagination({ limit: 10, offset: 30, page: 5 })).toEqual({ limit: 10, offset: 30 });
  });

  it('deriva offset de page (1-based) quando não há offset', () => {
    expect(parsePagination({ limit: 20, page: 1 })).toEqual({ limit: 20, offset: 0 });
    expect(parsePagination({ limit: 20, page: 3 })).toEqual({ limit: 20, offset: 40 });
  });

  it('page sem limit usa o defaultLimit', () => {
    expect(parsePagination({ page: 2 }, { defaultLimit: 25 })).toEqual({ limit: 25, offset: 25 });
  });

  it('clampa limit ao maxLimit', () => {
    expect(parsePagination({ limit: 9999 }, { maxLimit: 200 })).toEqual({ limit: 200, offset: 0 });
  });

  it('ignora lixo (negativo, NaN, string não-numérica)', () => {
    expect(parsePagination({ limit: -5 })).toEqual({ limit: null, offset: 0 });
    expect(parsePagination({ limit: 'abc' })).toEqual({ limit: null, offset: 0 });
    expect(parsePagination({ limit: 10, offset: -3 })).toEqual({ limit: 10, offset: 0 });
    expect(parsePagination({ limit: 10, page: 'x' })).toEqual({ limit: 10, offset: 0 });
  });

  it('trunca frações', () => {
    expect(parsePagination({ limit: 10.9, offset: 5.9 })).toEqual({ limit: 10, offset: 5 });
  });
});

// ─── Encaixe nas list-functions (db.query fake) ─────────────────────────────
function router(routes, fallback = { rows: [] }) {
  return async (sql, params) => {
    for (const [re, resp] of routes) {
      if (re.test(sql)) return typeof resp === 'function' ? resp(params) : resp;
    }
    return fallback;
  };
}
function makeDb(handler) {
  return { generateId: () => 'gen1', pool: { query: vi.fn(handler) } };
}
const sqls = (db) => db.pool.query.mock.calls.map((c) => c[0]);

describe('list-functions · paginação', () => {
  it('sem page → uma query só, sem LIMIT/OFFSET nem COUNT; total = length', async () => {
    const db = makeDb(router([[/FROM project_tasks/, { rows: [{ id: 't1' }, { id: 't2' }] }]]));
    const r = await taskService.listMyTasks(db, 'u1');
    expect(r.items).toHaveLength(2);
    expect(r.total).toBe(2);
    const executed = sqls(db);
    expect(executed).toHaveLength(1);
    expect(executed.some((s) => /LIMIT|COUNT\(\*\)/.test(s))).toBe(false);
  });

  it('com page → roda COUNT + query com LIMIT/OFFSET; total vem do COUNT', async () => {
    const db = makeDb(router([
      [/SELECT COUNT\(\*\)::int AS n FROM \(/, { rows: [{ n: 57 }] }],
      [/LIMIT \$\d+ OFFSET \$\d+/, { rows: [{ id: 't1' }, { id: 't2' }] }],
    ]));
    const r = await taskService.listMyTasks(db, 'u1', {}, { limit: 2, offset: 4 });
    expect(r.items).toHaveLength(2);
    expect(r.total).toBe(57); // do COUNT, não do length da página
    const executed = sqls(db);
    expect(executed.some((s) => /SELECT COUNT\(\*\)::int AS n FROM \(/.test(s))).toBe(true);
    expect(executed.some((s) => /LIMIT \$\d+ OFFSET \$\d+/.test(s))).toBe(true);
  });

  it('COUNT usa os mesmos params do WHERE (limit/offset entram depois)', async () => {
    let countParams, pageParams;
    const db = makeDb(router([
      [/COUNT\(\*\)::int/, (p) => { countParams = p; return { rows: [{ n: 3 }] }; }],
      [/LIMIT \$\d+ OFFSET \$\d+/, (p) => { pageParams = p; return { rows: [] }; }],
    ]));
    // listMyTasks com statuses → param $2 no WHERE
    await taskService.listMyTasks(db, 'u1', { statuses: ['available'] }, { limit: 5, offset: 10 });
    expect(countParams).toEqual(['u1', ['available']]);            // só o WHERE
    expect(pageParams).toEqual(['u1', ['available'], 5, 10]);       // WHERE + limit + offset
  });

  it('filas por papel: viewer sem permissão → { items: [], total: 0 } sem tocar o banco', async () => {
    const db = makeDb(router([]));
    const r = await taskService.listPendingDelegations(db, { role: 'user' }, { limit: 10, offset: 0 });
    expect(r).toEqual({ items: [], total: 0 });
    expect(db.pool.query).not.toHaveBeenCalled();
  });
});
