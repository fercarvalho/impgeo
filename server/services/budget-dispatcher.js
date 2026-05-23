// Dispatcher de notificações de orçamento — three-way fanout (sino in-app +
// Web Push + e-mail), espelhando o padrão de dispatchTcRecordEventToOwner.
//
// Duas direções:
//   - dispatchTcBudgetEventToOwner(budget, record, event, opts)
//       Notifica o tc_user dono do registro. Usado em: sent, revised, payment_completed.
//   - dispatchTcBudgetEventToAdmins(budget, record, event, opts)
//       Notifica os impgeo users com acesso ao módulo terracontrol. Usado em:
//       revision_requested, payment_completed.
//
// Tudo fire-and-forget no caller: nunca aguardar `await` (push/email lentos
// podem travar o response). Erros são logados, não propagados.
//
// Preferências respeitadas:
//   - tc_user: tc_users.email_notifications (boolean). NÃO existe ainda
//     preferência granular por type pro tc — vem no G9.
//   - impgeo: users.tc_email_notifications (boolean, opt-in default false).
//     Idem — granular vem no G9.

const fs = require('fs');

function makeDispatcher(deps) {
  const {
    db,
    pushDispatcher,
    emailService,
    publicUrls = {},
  } = deps;

  // URLs públicas pra deep-link nas notif/e-mails.
  const tcPublicUrl = publicUrls.tcPublic || process.env.TC_PUBLIC_URL || 'https://terracontrol.viverdepj.com.br';
  const impgeoPublicUrl = publicUrls.impgeoPublic || process.env.IMPGEO_PUBLIC_URL || '';

  function buildTcBudgetViewUrl(budgetId) {
    // O front do tc_user roteia por estado local; passamos o id na URL como hint.
    return `${tcPublicUrl}/?budget=${encodeURIComponent(budgetId)}`;
  }

  function buildAdminBudgetUrl(terracontrolId) {
    if (!impgeoPublicUrl) return null;
    return `${impgeoPublicUrl}/?subsystem=especial&module=terracontrol&record=${encodeURIComponent(terracontrolId)}`;
  }

  // Lê o PDF do disco e devolve buffer base64 pra anexar no e-mail.
  // Tolerante a falha: se não existe, retorna null e o e-mail vai sem anexo.
  function loadPdfBuffer(currentPdfUrl) {
    if (!currentPdfUrl || !currentPdfUrl.startsWith('/api/documents/')) return null;
    const filename = currentPdfUrl.substring('/api/documents/'.length);
    const docsDir = require('path').join(__dirname, '..', 'uploads', 'documents');
    const fullPath = require('path').join(docsDir, filename);
    try {
      if (!fs.existsSync(fullPath)) return null;
      return { buffer: fs.readFileSync(fullPath), filename };
    } catch {
      return null;
    }
  }

  // ─── Para o tc_user (dono do registro) ────────────────────────────────────

  async function dispatchTcBudgetEventToOwner(budget, record, event, { revisionNumber } = {}) {
    if (!budget || !record) return;
    const tcUserId = record.created_by_tc_user_id;
    if (!tcUserId) return;

    let tcUser;
    try {
      tcUser = await db.getTcUserById(tcUserId);
    } catch (e) {
      console.error('[tc-budget-dispatch] Falha ao buscar tc_user:', e?.message);
      return;
    }
    if (!tcUser) return;

    const imovel = record.imovel || '';
    const municipio = record.municipio || '';
    const codImovel = record.cod_imovel != null ? record.cod_imovel : null;
    const username = [tcUser.first_name, tcUser.last_name].filter(Boolean).join(' ').trim()
      || tcUser.username || 'usuário';
    const totalCents = budget.total_amount_cents;
    const rev = revisionNumber || budget.current_revision;

    const map = {
      sent: {
        notifType: 'tc_budget_sent',
        title: 'Você recebeu um orçamento',
        message: `${imovel}${municipio ? ` em ${municipio}` : ''} — clique para revisar e aprovar`,
        emailFn: emailService.enviarEmailTcOrcamentoEnviado,
      },
      revised: {
        notifType: 'tc_budget_revised',
        title: `Orçamento revisado (v${rev})`,
        message: `${imovel}${municipio ? ` em ${municipio}` : ''} — nova versão disponível`,
        emailFn: emailService.enviarEmailTcOrcamentoRevisado,
      },
      payment_completed: {
        notifType: 'tc_budget_payment_confirmed',
        title: 'Pagamento confirmado',
        message: `${imovel}${municipio ? ` em ${municipio}` : ''} — seu imóvel está aprovado`,
        emailFn: emailService.enviarEmailTcPagamentoConfirmado,
      },
    };
    const spec = map[event];
    if (!spec) {
      console.warn(`[tc-budget-dispatch] event desconhecido: ${event}`);
      return;
    }

    // 1) Sino in-app + push
    try {
      const notif = await db.createTcNotification({
        tc_user_id: tcUserId,
        notification_type: spec.notifType,
        title: spec.title,
        message: spec.message,
        related_entity_type: 'tc_budget',
        related_entity_id: budget.id,
      });
      pushDispatcher.send(db, 'tc', tcUserId, notif).catch(() => {});
    } catch (e) {
      console.error('[tc-budget-dispatch] Falha ao gravar notif in-app:', e?.message);
    }

    // 2) E-mail — respeita opt-out de tc_users.email_notifications
    if (!tcUser.email) return;
    if (tcUser.email_notifications === false) return;
    const viewUrl = buildTcBudgetViewUrl(budget.id);
    const baseArgs = {
      toEmail: tcUser.email,
      username,
      imovel,
      municipio,
      codImovel,
      totalCents,
      viewUrl,
    };
    try {
      if (event === 'sent') {
        const pdf = loadPdfBuffer(budget.current_pdf_url);
        await spec.emailFn({
          ...baseArgs,
          pdfBuffer: pdf?.buffer,
          pdfFilename: pdf?.filename,
        });
      } else if (event === 'revised') {
        const pdf = loadPdfBuffer(budget.current_pdf_url);
        await spec.emailFn({
          ...baseArgs,
          revisionNumber: rev,
          pdfBuffer: pdf?.buffer,
          pdfFilename: pdf?.filename,
        });
      } else if (event === 'payment_completed') {
        await spec.emailFn({
          ...baseArgs,
          paidAt: budget.paid_at,
          loginUrl: tcPublicUrl,
        });
      }
    } catch (e) {
      console.error('[tc-budget-dispatch] Falha ao enviar e-mail:', e?.message);
    }
  }

  // ─── Para impgeo admins (todos com acesso ao módulo terracontrol) ─────────

  async function dispatchTcBudgetEventToAdmins(budget, record, event, { tcUser, comment, source } = {}) {
    if (!budget || !record) return;

    const imovel = record.imovel || '';
    const municipio = record.municipio || '';
    const codImovel = record.cod_imovel != null ? record.cod_imovel : null;
    const tcUserName = tcUser
      ? ([tcUser.first_name, tcUser.last_name].filter(Boolean).join(' ').trim() || tcUser.username)
      : 'um usuário TerraControl';
    const adminUrl = buildAdminBudgetUrl(budget.terracontrol_id);

    const map = {
      revision_requested: {
        notifType: 'tc_budget_revision_requested',
        title: `${tcUserName} pediu revisão de orçamento`,
        message: source === 'auto_edit'
          ? `${imovel} foi editado pelo cliente — revisão automática`
          : `${imovel}${municipio ? ` em ${municipio}` : ''}`,
        emailFn: emailService.enviarEmailImpgeoRevisaoSolicitada,
      },
      payment_completed: {
        notifType: 'tc_budget_payment_completed',
        title: `Pagamento recebido — ${imovel}`,
        message: `${tcUserName} pagou o orçamento. Imóvel aprovado automaticamente.`,
        emailFn: emailService.enviarEmailImpgeoPagamentoRecebido,
      },
    };
    const spec = map[event];
    if (!spec) return;

    let impgeoUsers = [];
    try {
      impgeoUsers = await db.getImpgeoUsersWithTerraControlAccess();
    } catch (e) {
      console.error('[tc-budget-dispatch admin] Falha ao listar admins:', e?.message);
      return;
    }

    for (const u of impgeoUsers) {
      try {
        const notif = await db.createNotification({
          user_id: u.id,
          notification_type: spec.notifType,
          title: spec.title,
          message: spec.message,
          related_entity_type: 'tc_budget',
          related_entity_id: budget.id,
        });
        pushDispatcher.send(db, 'impgeo', u.id, notif).catch(() => {});
      } catch (e) {
        console.error('[tc-budget-dispatch admin] Falha ao notificar impgeo user:', u.id, e?.message);
      }

      // E-mail só pra quem deu opt-in (mesmo padrão de tc_record_created)
      if (u.tc_email_notifications !== true || !u.email) continue;
      const recipientName = [u.first_name, u.last_name].filter(Boolean).join(' ').trim()
        || u.username || 'usuário';
      try {
        if (event === 'revision_requested') {
          await spec.emailFn({
            toEmail: u.email,
            recipientName,
            tcUserName,
            imovel,
            municipio,
            codImovel,
            totalCents: budget.total_amount_cents,
            revisionNumber: budget.current_revision,
            comment,
            source,
            adminUrl,
          });
        } else if (event === 'payment_completed') {
          await spec.emailFn({
            toEmail: u.email,
            recipientName,
            tcUserName,
            imovel,
            municipio,
            codImovel,
            totalCents: budget.paid_amount_cents || budget.total_amount_cents,
            paidAt: budget.paid_at,
            adminUrl,
          });
        }
      } catch (e) {
        console.error('[tc-budget-dispatch admin] Falha ao enviar e-mail pra', u.id, e?.message);
      }
    }
  }

  return {
    dispatchTcBudgetEventToOwner,
    dispatchTcBudgetEventToAdmins,
  };
}

module.exports = makeDispatcher;
