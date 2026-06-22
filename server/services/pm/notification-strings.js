// ═══════════════════════════════════════════════════════════════════════════
// server/services/pm/notification-strings.js
// Dicionário pt-BR dos textos de notificação do módulo PM (i18n-ready).
// ═══════════════════════════════════════════════════════════════════════════

'use strict';

const STRINGS = {
  pm_task_assigned:     (p) => ({ title: 'Nova tarefa atribuída', message: `${p.assignedByName ? `${p.assignedByName} atribuiu a você` : 'Você recebeu'} a tarefa "${p.taskName}"${p.projectName ? ` no projeto ${p.projectName}` : ''}.` }),
  pm_task_accepted:     (p) => ({ title: 'Tarefa aceita',         message: `${p.accepterName || 'O responsável'} aceitou "${p.taskName}".` }),
  pm_task_refused:      (p) => ({ title: 'Tarefa recusada',       message: `${p.refuserName || 'O responsável'} recusou "${p.taskName}"${p.reason ? `: ${p.reason}` : ''}.` }),
  pm_task_overdue:      (p) => ({ title: 'Tarefa atrasada',       message: `"${p.taskName}"${p.projectName ? ` (${p.projectName})` : ''} passou do prazo.` }),
  pm_review_requested:  (p) => ({ title: 'Revisão solicitada',    message: `${p.submitterName || 'Um colaborador'} enviou "${p.taskName}" para revisão.` }),
  pm_review_decided:    (p) => ({ title: p.approved ? 'Revisão aprovada' : 'Revisão reprovada', message: p.approved ? `${p.reviewerName || 'Um gestor'} aprovou "${p.taskName}".` : `${p.reviewerName || 'Um gestor'} pediu ajustes em "${p.taskName}"${p.notes ? `: ${p.notes}` : ''}.` }),
  pm_help_requested:    (p) => ({ title: 'Pedido de ajuda',       message: `${p.requesterName || 'Um colega'} pediu sua ajuda em "${p.taskName}".` }),
  pm_help_accepted:     (p) => ({ title: 'Ajuda aceita',          message: `${p.helperName || 'Um colega'} vai ajudar em "${p.taskName}".` }),
  pm_project_paid:      (p) => ({ title: 'Pagamento recebido',    message: `Projeto "${p.projectName}" foi pago e iniciado.` }),
  pm_project_completed: (p) => ({ title: 'Projeto concluído',     message: `Projeto "${p.projectName}" foi concluído.` }),
  pm_pomodoro_overage_requested: (p) => ({
    title: 'Aprovação de tempo extra',
    message: `${p.userName || 'Um colaborador'} trabalhou ${p.workedMinutes ?? '?'} min hoje, acima do teto de ${p.hard ?? 500} min (limite recomendado: ${p.limit ?? 400} min), e pediu aprovação para que o tempo extra seja contabilizado.${p.justification ? ` Justificativa: "${p.justification}"` : ' (sem justificativa)'} Aprove ou recuse em Pomodoro → Aprovações de tempo extra.`,
  }),
  pm_due_date_requested: (p) => ({
    title: 'Alteração de prazo (aprovação)',
    message: `${p.userName || 'Um colaborador'} pediu para alterar o prazo de "${p.taskName}"${p.projectName ? ` (${p.projectName})` : ''}: de ${p.currentDue || 'sem prazo'} para ${p.requestedDue || 'sem prazo'}.${p.justification ? ` Justificativa: "${p.justification}"` : ''} Aprove ou recuse em Tarefas → Solicitações de prazo.`,
  }),
  pm_due_date_decided: (p) => ({
    title: p.approved ? 'Alteração de prazo aprovada' : 'Alteração de prazo recusada',
    message: p.approved
      ? `O novo prazo de "${p.taskName}" (${p.requestedDue || 'sem prazo'}) foi aprovado${p.decidedByName ? ` por ${p.decidedByName}` : ''}.`
      : `Seu pedido de alteração de prazo de "${p.taskName}" foi recusado${p.decidedByName ? ` por ${p.decidedByName}` : ''}.`,
  }),
  pm_pomodoro_overage_decided:   (p) => ({
    title: p.approved ? 'Tempo extra aprovado' : 'Tempo extra recusado',
    message: p.approved
      ? `Seu tempo extra de hoje foi aprovado${p.decidedByName ? ` por ${p.decidedByName}` : ''} — o tempo passa a ser contabilizado normalmente.`
      : `Seu pedido de tempo extra de hoje foi recusado${p.decidedByName ? ` por ${p.decidedByName}` : ''}. O tempo acima do teto não será contabilizado hoje.`,
  }),
  pm_task_uncompleted: (p) => ({
    title: 'Tarefa reaberta',
    message: `${p.byName || 'Um gestor'} reabriu "${p.taskName}"${p.projectName ? ` (${p.projectName})` : ''} e ela está com você de novo${p.reason ? `. Motivo: "${p.reason}"` : ''}.`,
  }),
  pm_uncomplete_requested: (p) => ({
    title: 'Reabertura de tarefa (aprovação)',
    message: `${p.requesterName || 'Um gerente'} pediu para reabrir "${p.taskName}"${p.projectName ? ` (${p.projectName})` : ''}${p.reason ? `. Motivo: "${p.reason}"` : ''}. Aprove ou recuse em Tarefas → Solicitações de reabertura.`,
  }),
  pm_uncomplete_decided: (p) => ({
    title: p.approved ? 'Reabertura aprovada' : 'Reabertura recusada',
    message: p.approved
      ? `${p.decidedByName || 'Um admin'} aprovou seu pedido para reabrir "${p.taskName}" — a tarefa voltou a ficar disponível.`
      : `${p.decidedByName || 'Um admin'} recusou seu pedido para reabrir "${p.taskName}".`,
  }),
  pm_uncomplete_self_notice: (p) => ({
    title: 'Tarefa reaberta por um admin',
    message: `${p.actorName || 'Um admin'} reabriu a tarefa "${p.taskName}"${p.projectName ? ` (${p.projectName})` : ''} para si${p.reason ? `. Motivo: "${p.reason}"` : ''}.`,
  }),
  pm_review_followup: (p) => ({
    title: 'Revisão final disponível',
    message: `${p.reviewerName ? `${p.reviewerName} (gerente) aprovou uma revisão. ` : ''}"${p.taskName}"${p.projectName ? ` (${p.projectName})` : ''} aguarda revisão final — qualquer admin/superadmin pode pegar e concluir em Tarefas → disponíveis.`,
  }),
  pm_delegation_requested: (p) => ({
    title: 'Delegação aguardando aprovação',
    message: `${p.managerName || 'Um gerente'} quer delegar "${p.taskName}"${p.projectName ? ` (${p.projectName})` : ''} para ${p.toName || 'um usuário'}. Aprove ou recuse em Tarefas → Solicitações de delegação.`,
  }),
  pm_delegation_decided: (p) => ({
    title: p.approved ? 'Delegação aprovada' : 'Delegação recusada',
    message: p.approved
      ? `${p.decidedByName || 'Um admin'} aprovou sua delegação de "${p.taskName}" para ${p.toName || 'o usuário'} — a tarefa já está com ${p.toName || 'ele'}.`
      : `${p.decidedByName || 'Um admin'} recusou sua delegação de "${p.taskName}" para ${p.toName || 'o usuário'}.`,
  }),
};

function build(type, payload = {}) {
  const fn = STRINGS[type];
  if (!fn) return { title: 'Atualização', message: '' };
  return fn(payload);
}

module.exports = { build, STRINGS };
