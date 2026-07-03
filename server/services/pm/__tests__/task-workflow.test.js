// Guards de delegação e reabertura de tarefas (item 1 do doc 12).
// Mesma estratégia dos demais: db.pool.query roteado por regex; exercita os
// caminhos de erro (autorização/estado), que falham cedo e pedem poucos mocks.
import { describe, it, expect, vi } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const taskService = require('../task-service');

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
async function grab(promise) {
  try { await promise; return null; } catch (e) { return e; }
}
// SQLs efetivamente executados (para asserção de caminho).
const sqls = (db) => db.pool.query.mock.calls.map((c) => c[0]);

const RE_DELEG_SEL = /SELECT id FROM task_delegation_requests WHERE task_id/;
const RE_DELEG_REQ = /FROM task_delegation_requests WHERE id/;
const RE_TASK = /SELECT \* FROM project_tasks WHERE id/;
const RE_UNC_REQ = /SELECT \* FROM task_uncomplete_requests WHERE id/;
const RE_PROJ_MGR = /SELECT manager_user_id FROM projects/;

// ─── Delegação ──────────────────────────────────────────────────────────────
describe('task-service · decideDelegation (guards)', () => {
  it('não-admin não aprova delegação → forbidden (403), sem tocar o banco', async () => {
    const db = makeDb(router([]));
    const e = await grab(taskService.decideDelegation(db, 'd1', { id: 'm1', role: 'manager' }, { approved: true }));
    expect(e?.code).toBe('forbidden');
    expect(e?.status).toBe(403);
    expect(db.pool.query).not.toHaveBeenCalled();
  });

  it('pedido inexistente → not_found (404)', async () => {
    const db = makeDb(router([[RE_DELEG_REQ, { rows: [] }]]));
    const e = await grab(taskService.decideDelegation(db, 'd1', { id: 'a1', role: 'admin' }, { approved: true }));
    expect(e?.code).toBe('not_found');
    expect(e?.status).toBe(404);
  });

  it('pedido já decidido → invalid_state (409)', async () => {
    const db = makeDb(router([[RE_DELEG_REQ, { rows: [{ id: 'd1', task_id: 't1', project_id: 'p1', status: 'approved' }] }]]));
    const e = await grab(taskService.decideDelegation(db, 'd1', { id: 'a1', role: 'admin' }, { approved: false }));
    expect(e?.code).toBe('invalid_state');
    expect(e?.status).toBe(409);
  });
});

describe('task-service · requestDelegation (dedup do pedido pendente)', () => {
  const args = { taskId: 't1', projectId: 'p1', managerId: 'm1', toUserId: 'u2' };

  it('sem pendente → INSERT (cria pedido novo)', async () => {
    const db = makeDb(router([[RE_DELEG_SEL, { rows: [] }]]));
    await taskService.requestDelegation(db, args);
    const executed = sqls(db);
    expect(executed.some((s) => /INSERT INTO task_delegation_requests/.test(s))).toBe(true);
    expect(executed.some((s) => /UPDATE task_delegation_requests/.test(s))).toBe(false);
  });

  it('com pendente → UPDATE (re-pedir atualiza, não duplica)', async () => {
    const db = makeDb(router([[RE_DELEG_SEL, { rows: [{ id: 'd1' }] }]]));
    await taskService.requestDelegation(db, args);
    const executed = sqls(db);
    expect(executed.some((s) => /UPDATE task_delegation_requests/.test(s))).toBe(true);
    expect(executed.some((s) => /INSERT INTO task_delegation_requests/.test(s))).toBe(false);
  });
});

// ─── Reabertura (uncomplete) ────────────────────────────────────────────────
describe('task-service · uncompleteTask (guards)', () => {
  it('tarefa inexistente lança', async () => {
    const db = makeDb(router([[RE_TASK, { rows: [] }]]));
    const e = await grab(taskService.uncompleteTask(db, 't1', { actor: { id: 'a1', role: 'admin' }, reason: 'x' }));
    expect(e?.message).toMatch(/não encontrada/i);
  });

  it('tarefa não concluída → invalid_transition (409)', async () => {
    const db = makeDb(router([[RE_TASK, { rows: [{ id: 't1', project_id: 'p1', status: 'in_progress' }] }]]));
    const e = await grab(taskService.uncompleteTask(db, 't1', { actor: { id: 'a1', role: 'admin' }, reason: 'x' }));
    expect(e?.code).toBe('invalid_transition');
    expect(e?.status).toBe(409);
  });

  it('sem motivo → reason_required (400)', async () => {
    const db = makeDb(router([[RE_TASK, { rows: [{ id: 't1', project_id: 'p1', status: 'completed', assignee_user_id: 'u1' }] }]]));
    const e = await grab(taskService.uncompleteTask(db, 't1', { actor: { id: 'a1', role: 'admin' }, reason: '   ' }));
    expect(e?.code).toBe('reason_required');
    expect(e?.status).toBe(400);
  });

  it('usuário só desconclui a tarefa que concluiu → forbidden (403)', async () => {
    const db = makeDb(router([[RE_TASK, { rows: [{ id: 't1', project_id: 'p1', status: 'completed', assignee_user_id: 'outro' }] }]]));
    const e = await grab(taskService.uncompleteTask(db, 't1', { actor: { id: 'u1', role: 'user' }, reason: 'errei' }));
    expect(e?.code).toBe('forbidden');
    expect(e?.status).toBe(403);
  });

  it('gerente só desconclui tarefas dos projetos que gerencia → forbidden (403)', async () => {
    const db = makeDb(router([
      [RE_TASK, { rows: [{ id: 't1', project_id: 'p1', status: 'completed', assignee_user_id: 'u1' }] }],
      [RE_PROJ_MGR, { rows: [{ manager_user_id: 'outro_mgr' }] }],
    ]));
    const e = await grab(taskService.uncompleteTask(db, 't1', { actor: { id: 'm1', role: 'manager' }, reason: 'ajuste' }));
    expect(e?.code).toBe('forbidden');
    expect(e?.status).toBe(403);
  });
});

describe('task-service · decideUncomplete (guards)', () => {
  it('pedido inexistente lança', async () => {
    const db = makeDb(router([[RE_UNC_REQ, { rows: [] }]]));
    const e = await grab(taskService.decideUncomplete(db, 'r1', { reviewer: { id: 'a1', role: 'admin' }, approve: true }));
    expect(e?.message).toMatch(/não encontrado/i);
  });

  it('pedido já decidido → invalid_transition (409)', async () => {
    const db = makeDb(router([[RE_UNC_REQ, { rows: [{ id: 'r1', task_id: 't1', project_id: 'p1', status: 'approved' }] }]]));
    const e = await grab(taskService.decideUncomplete(db, 'r1', { reviewer: { id: 'a1', role: 'admin' }, approve: true }));
    expect(e?.code).toBe('invalid_transition');
    expect(e?.status).toBe(409);
  });

  it('manager de outro projeto não decide → forbidden (403)', async () => {
    const db = makeDb(router([
      [RE_UNC_REQ, { rows: [{ id: 'r1', task_id: 't1', project_id: 'p1', requester_role: 'user', status: 'pending' }] }],
      [RE_PROJ_MGR, { rows: [{ manager_user_id: 'outro_mgr' }] }],
    ]));
    const e = await grab(taskService.decideUncomplete(db, 'r1', { reviewer: { id: 'm1', role: 'manager' }, approve: true }));
    expect(e?.code).toBe('forbidden');
    expect(e?.status).toBe(403);
  });
});
