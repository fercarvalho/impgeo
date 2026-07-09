// Testes da agregação de contadores da Central de Aprovações (#11).
// Isola a lógica de soma mockando os 5 services subjacentes (mesma instância
// via require cache), sem tocar banco.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const approvals = require('../approvals-service');
const taskService = require('../task-service');
const pomodoroService = require('../pomodoro-service');

const db = { pool: { query: vi.fn() } };
const viewer = { id: 'g1', role: 'manager' };

afterEach(() => vi.restoreAllMocks());

describe('approvals-service · getApprovalCounts', () => {
  it('soma os totais das 5 filas e monta byType', async () => {
    vi.spyOn(taskService, 'listPendingReviews').mockResolvedValue({ items: [], total: 2 });
    vi.spyOn(taskService, 'listPendingDelegations').mockResolvedValue({ items: [], total: 3 });
    vi.spyOn(taskService, 'listPendingUncompleteRequests').mockResolvedValue({ items: [], total: 1 });
    vi.spyOn(taskService, 'listPendingDueDateRequests').mockResolvedValue({ items: [], total: 4 });
    vi.spyOn(pomodoroService, 'listPendingOverages').mockResolvedValue([{ id: 'o1' }, { id: 'o2' }]);

    const r = await approvals.getApprovalCounts(db, viewer);
    expect(r.byType).toEqual({ reviews: 2, delegations: 3, uncomplete: 1, dueDate: 4, overage: 2 });
    expect(r.total).toBe(12);
  });

  it('passa o viewer e pagina {limit:1} para as 4 filas do task-service', async () => {
    const rev = vi.spyOn(taskService, 'listPendingReviews').mockResolvedValue({ items: [], total: 0 });
    vi.spyOn(taskService, 'listPendingDelegations').mockResolvedValue({ items: [], total: 0 });
    vi.spyOn(taskService, 'listPendingUncompleteRequests').mockResolvedValue({ items: [], total: 0 });
    vi.spyOn(taskService, 'listPendingDueDateRequests').mockResolvedValue({ items: [], total: 0 });
    vi.spyOn(pomodoroService, 'listPendingOverages').mockResolvedValue([]);

    const r = await approvals.getApprovalCounts(db, viewer);
    expect(r.total).toBe(0);
    expect(rev).toHaveBeenCalledWith(db, viewer, { limit: 1, offset: 0 });
  });

  it('trata overage não-array como 0', async () => {
    vi.spyOn(taskService, 'listPendingReviews').mockResolvedValue({ items: [], total: 0 });
    vi.spyOn(taskService, 'listPendingDelegations').mockResolvedValue({ items: [], total: 0 });
    vi.spyOn(taskService, 'listPendingUncompleteRequests').mockResolvedValue({ items: [], total: 0 });
    vi.spyOn(taskService, 'listPendingDueDateRequests').mockResolvedValue({ items: [], total: 0 });
    vi.spyOn(pomodoroService, 'listPendingOverages').mockResolvedValue(undefined);

    const r = await approvals.getApprovalCounts(db, viewer);
    expect(r.byType.overage).toBe(0);
    expect(r.total).toBe(0);
  });
});
