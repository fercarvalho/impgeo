// ═══════════════════════════════════════════════════════════════════════════
// server/services/pm/notification-strings.js
// Dicionário pt-BR dos textos de notificação do módulo PM (i18n-ready).
// ═══════════════════════════════════════════════════════════════════════════

'use strict';

const STRINGS = {
  pm_task_assigned:     (p) => ({ title: 'Nova tarefa atribuída', message: `Você recebeu a tarefa "${p.taskName}"${p.projectName ? ` no projeto ${p.projectName}` : ''}.` }),
  pm_task_accepted:     (p) => ({ title: 'Tarefa aceita',         message: `"${p.taskName}" foi aceita.` }),
  pm_task_refused:      (p) => ({ title: 'Tarefa recusada',       message: `"${p.taskName}" foi recusada${p.reason ? `: ${p.reason}` : ''}.` }),
  pm_task_overdue:      (p) => ({ title: 'Tarefa atrasada',       message: `"${p.taskName}"${p.projectName ? ` (${p.projectName})` : ''} passou do prazo.` }),
  pm_review_requested:  (p) => ({ title: 'Revisão solicitada',    message: `"${p.taskName}" está aguardando revisão.` }),
  pm_review_decided:    (p) => ({ title: p.approved ? 'Revisão aprovada' : 'Revisão reprovada', message: p.approved ? `"${p.taskName}" foi aprovada.` : `"${p.taskName}" precisa de ajustes${p.notes ? `: ${p.notes}` : ''}.` }),
  pm_help_requested:    (p) => ({ title: 'Pedido de ajuda',       message: `${p.requesterName || 'Um colega'} pediu sua ajuda em "${p.taskName}".` }),
  pm_help_accepted:     (p) => ({ title: 'Ajuda aceita',          message: `${p.helperName || 'Um colega'} vai ajudar em "${p.taskName}".` }),
  pm_project_paid:      (p) => ({ title: 'Pagamento recebido',    message: `Projeto "${p.projectName}" foi pago e iniciado.` }),
  pm_project_completed: (p) => ({ title: 'Projeto concluído',     message: `Projeto "${p.projectName}" foi concluído.` }),
};

function build(type, payload = {}) {
  const fn = STRINGS[type];
  if (!fn) return { title: 'Atualização', message: '' };
  return fn(payload);
}

module.exports = { build, STRINGS };
