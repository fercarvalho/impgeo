// Guards da negociação de prazo (task_due_date_requests) — item 1 do doc 12.
// Estratégia: mockar db.pool.query roteando por regex de SQL. Os testes exercem
// os caminhos de erro (guards), que falham cedo e exigem poucos mocks.
import { describe, it, expect, vi } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const taskService = require('../task-service');

// Roteia queries por regex; o que não casar cai no fallback (rows vazio).
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
const RE_REQ = /FROM task_due_date_requests WHERE id/;
const RE_PROJ_MGR = /SELECT manager_user_id FROM projects/;

async function grab(promise) {
  try { await promise; return null; } catch (e) { return e; }
}

// ─── decideDueDateChange (decisor age sobre pedido pendente) ────────────────
describe('task-service · decideDueDateChange (guards)', () => {
  it('pedido inexistente → not_found (404)', async () => {
    const db = makeDb(router([[RE_REQ, { rows: [] }]]));
    const e = await grab(taskService.decideDueDateChange(db, 'r1', { id: 'a1', role: 'admin' }, { approved: true }));
    expect(e?.code).toBe('not_found');
    expect(e?.status).toBe(404);
  });

  it('pedido não pendente → invalid_state (409)', async () => {
    const db = makeDb(router([[RE_REQ, { rows: [{ id: 'r1', task_id: 't1', project_id: 'p1', requester_role: 'user', status: 'approved' }] }]]));
    const e = await grab(taskService.decideDueDateChange(db, 'r1', { id: 'a1', role: 'admin' }, { approved: true }));
    expect(e?.code).toBe('invalid_state');
    expect(e?.status).toBe(409);
  });

  it('manager de outro projeto → forbidden (403)', async () => {
    const db = makeDb(router([
      [RE_REQ, { rows: [{ id: 'r1', task_id: 't1', project_id: 'p1', requester_role: 'user', status: 'pending' }] }],
      [RE_PROJ_MGR, { rows: [{ manager_user_id: 'outro' }] }],
    ]));
    const e = await grab(taskService.decideDueDateChange(db, 'r1', { id: 'm1', role: 'manager' }, { approved: true }));
    expect(e?.code).toBe('forbidden');
    expect(e?.status).toBe(403);
  });

  it('propose sem nova data → date_required (400)', async () => {
    const db = makeDb(router([[RE_REQ, { rows: [{ id: 'r1', task_id: 't1', project_id: 'p1', requester_role: 'user', status: 'pending' }] }]]));
    const e = await grab(taskService.decideDueDateChange(db, 'r1', { id: 'a1', role: 'admin' }, { action: 'propose' }));
    expect(e?.code).toBe('date_required');
    expect(e?.status).toBe(400);
  });

  it('force sem nova data → date_required (400)', async () => {
    const db = makeDb(router([[RE_REQ, { rows: [{ id: 'r1', task_id: 't1', project_id: 'p1', requester_role: 'user', status: 'pending' }] }]]));
    const e = await grab(taskService.decideDueDateChange(db, 'r1', { id: 'a1', role: 'admin' }, { action: 'force' }));
    expect(e?.code).toBe('date_required');
  });
});

// ─── respondDueDateProposal (solicitante responde contraproposta) ──────────
describe('task-service · respondDueDateProposal (guards)', () => {
  it('pedido inexistente → not_found (404)', async () => {
    const db = makeDb(router([[RE_REQ, { rows: [] }]]));
    const e = await grab(taskService.respondDueDateProposal(db, 'r1', { id: 'u1' }, { action: 'accept' }));
    expect(e?.code).toBe('not_found');
  });

  it('sem contraproposta (status != countered) → invalid_state (409)', async () => {
    const db = makeDb(router([[RE_REQ, { rows: [{ id: 'r1', task_id: 't1', project_id: 'p1', requested_by_user_id: 'u1', status: 'pending' }] }]]));
    const e = await grab(taskService.respondDueDateProposal(db, 'r1', { id: 'u1' }, { action: 'accept' }));
    expect(e?.code).toBe('invalid_state');
    expect(e?.status).toBe(409);
  });

  it('quem não pediu não pode responder → forbidden (403)', async () => {
    const db = makeDb(router([[RE_REQ, { rows: [{ id: 'r1', task_id: 't1', project_id: 'p1', requested_by_user_id: 'u1', status: 'countered' }] }]]));
    const e = await grab(taskService.respondDueDateProposal(db, 'r1', { id: 'u2' }, { action: 'accept' }));
    expect(e?.code).toBe('forbidden');
    expect(e?.status).toBe(403);
  });

  it('propose sem nova data → date_required (400)', async () => {
    const db = makeDb(router([[RE_REQ, { rows: [{ id: 'r1', task_id: 't1', project_id: 'p1', requested_by_user_id: 'u1', status: 'countered' }] }]]));
    const e = await grab(taskService.respondDueDateProposal(db, 'r1', { id: 'u1' }, { action: 'propose' }));
    expect(e?.code).toBe('date_required');
  });
});

// ─── Guards de existência de tarefa ────────────────────────────────────────
describe('task-service · requestDueDateChange / setTaskDueDate (tarefa inexistente)', () => {
  const RE_TASK = /SELECT \* FROM project_tasks WHERE id/;

  it('requestDueDateChange numa tarefa inexistente lança', async () => {
    const db = makeDb(router([[RE_TASK, { rows: [] }]]));
    const e = await grab(taskService.requestDueDateChange(db, 't1', { userId: 'u1' }));
    expect(e).toBeTruthy();
    expect(e.message).toMatch(/não encontrada/i);
  });

  it('setTaskDueDate numa tarefa inexistente lança', async () => {
    const db = makeDb(router([[RE_TASK, { rows: [] }]]));
    const e = await grab(taskService.setTaskDueDate(db, 't1', { dueDate: '2026-08-01' }));
    expect(e).toBeTruthy();
    expect(e.message).toMatch(/não encontrada/i);
  });
});
