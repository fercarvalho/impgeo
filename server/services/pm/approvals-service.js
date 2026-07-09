// ═══════════════════════════════════════════════════════════════════════════
// server/services/pm/approvals-service.js
//
// Central de Aprovações (melhoria #11): contagem agregada das filas de gestor,
// para o badge do menu. Reusa os services de listagem existentes (que já
// encapsulam o WHERE por papel) pedindo só o total — `{limit:1}` roda o COUNT
// sem carregar as linhas. Overage não é paginado → usa o length.
// ═══════════════════════════════════════════════════════════════════════════

'use strict';

const taskService = require('./task-service');
const pomodoroService = require('./pomodoro-service');

const ONE = { limit: 1, offset: 0 };

/**
 * Totais pendentes por fila + soma, no escopo do `viewer` (gestor).
 * @returns {Promise<{ total, byType: {reviews, delegations, uncomplete, dueDate, overage} }>}
 */
async function getApprovalCounts(db, viewer) {
  const [reviews, delegations, uncomplete, dueDate, overageRows] = await Promise.all([
    taskService.listPendingReviews(db, viewer, ONE),
    taskService.listPendingDelegations(db, viewer, ONE),
    taskService.listPendingUncompleteRequests(db, viewer, ONE),
    taskService.listPendingDueDateRequests(db, viewer, ONE),
    pomodoroService.listPendingOverages(db),
  ]);
  const byType = {
    reviews: reviews.total,
    delegations: delegations.total,
    uncomplete: uncomplete.total,
    dueDate: dueDate.total,
    overage: Array.isArray(overageRows) ? overageRows.length : 0,
  };
  const total = byType.reviews + byType.delegations + byType.uncomplete + byType.dueDate + byType.overage;
  return { total, byType };
}

module.exports = { getApprovalCounts };
