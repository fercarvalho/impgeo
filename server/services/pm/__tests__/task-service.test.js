// Testes da máquina de estados de tarefas (Fase 4).
import { describe, it, expect, vi } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const sm = require('../state-machine');
const taskService = require('../task-service');

// ─── Matriz de transições (pura) ──────────────────────────────────────────────
describe('state-machine · ALLOWED_TRANSITIONS', () => {
  it('permite available → in_progress', () => {
    expect(sm.canTransitionTask('available', 'in_progress')).toBe(true);
  });
  it('permite pending → available', () => {
    expect(sm.canTransitionTask('pending', 'available')).toBe(true);
  });
  it('permite pending_acceptance → available e → refused', () => {
    expect(sm.canTransitionTask('pending_acceptance', 'available')).toBe(true);
    expect(sm.canTransitionTask('pending_acceptance', 'refused')).toBe(true);
  });
  it('permite in_progress → completed e → pending_review', () => {
    expect(sm.canTransitionTask('in_progress', 'completed')).toBe(true);
    expect(sm.canTransitionTask('in_progress', 'pending_review')).toBe(true);
  });
  it('PERMITE completed → available (reabertura/desconcluir)', () => {
    expect(sm.canTransitionTask('completed', 'available')).toBe(true);
  });
  it('BLOQUEIA completed → outros estados além de available', () => {
    expect(sm.canTransitionTask('completed', 'in_progress')).toBe(false);
    expect(sm.canTransitionTask('completed', 'pending_review')).toBe(false);
  });
  it('BLOQUEIA canceled → qualquer', () => {
    expect(sm.canTransitionTask('canceled', 'available')).toBe(false);
  });
  it('BLOQUEIA pending → completed (pula etapas)', () => {
    expect(sm.canTransitionTask('pending', 'completed')).toBe(false);
  });
});

// ─── Guards do task-service ───────────────────────────────────────────────────
function dbWithTask(task) {
  return {
    generateId: () => 'id1',
    pool: { query: vi.fn(async (sql) => {
      if (/SELECT \* FROM project_tasks WHERE id/.test(sql)) return { rows: task ? [task] : [] };
      return { rows: [] };
    }) },
  };
}

describe('task-service · refuseTask', () => {
  it('exige justificativa (reason)', async () => {
    const db = dbWithTask({ id: 't1', status: 'pending_acceptance' });
    let err;
    try { await taskService.refuseTask(db, 't1', { userId: 'u1', reason: '   ' }); } catch (e) { err = e; }
    expect(err).toBeDefined();
    expect(err.code).toBe('reason_required');
    expect(err.status).toBe(400);
  });
});

describe('task-service · transição inválida', () => {
  it('startTask numa tarefa já concluída → invalid_transition (409)', async () => {
    const db = dbWithTask({ id: 't1', status: 'completed', project_id: 'p1' });
    let err;
    try { await taskService.startTask(db, 't1', { userId: 'u1' }); } catch (e) { err = e; }
    expect(err).toBeDefined();
    expect(err.code).toBe('invalid_transition');
    expect(err.status).toBe(409);
  });

  it('acceptTask fora de pending_acceptance → invalid_transition', async () => {
    const db = dbWithTask({ id: 't1', status: 'in_progress' });
    let err;
    try { await taskService.acceptTask(db, 't1', { userId: 'u1' }); } catch (e) { err = e; }
    expect(err?.code).toBe('invalid_transition');
  });
});
