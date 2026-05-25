// Serviço de orçamento — centraliza TODAS as transições de estado do
// tc_budgets + escrita em tc_budget_revisions + emissão de eventos em
// tc_budget_events + manutenção da denormalização em terracontrol
// (budget_status, current_budget_id).
//
// Por que tudo aqui (e não nos handlers): garante invariantes (1 budget
// ativo por imóvel, status nunca pula etapa, evento sempre gravado) num
// único ponto. Handlers HTTP ficam só com validação de input + auth.
//
// Notificações (push, e-mail, sino) saem deste módulo via budget-dispatcher.js
// — chamadas fire-and-forget após o commit.
//
// IMPORTANTE: este módulo NÃO faz auth check. É responsabilidade do handler
// HTTP validar permissão (admin: requireTerraControlAccess; tc_user:
// tcUserOwnsBudget) antes de chamar qualquer método daqui.

const path = require('path');
const fs = require('fs');
const abacatepay = require('./abacatepay');
const { renderBudgetPdf } = require('./budget-pdf');

// Diretório onde o PDF é gravado. Mesmo lugar dos outros docs do TC.
// Reusa /api/documents/:filename pra servir (dual auth).
const DOCS_DIR = path.join(__dirname, '..', 'uploads', 'documents');

// TTL padrão da cobrança PIX da AbacatePay (em segundos). 24h é folgado
// pro tc_user pagar sem stress; depois precisa clicar "Gerar novo QR".
const DEFAULT_PIX_EXPIRES_IN = 24 * 60 * 60;

// Helper de cálculo — recalcula sempre server-side a partir dos items.
// NUNCA confie no `total` que o admin manda no body — recalcule.
function computeTotalCents(items) {
  if (!Array.isArray(items)) return 0;
  return items.reduce((sum, it) => {
    const cents = Number(it?.amount_cents ?? it?.amountCents ?? 0);
    return sum + (Number.isFinite(cents) ? cents : 0);
  }, 0);
}

// Sanitiza items pro formato canônico armazenado em JSONB. Aceita o que vier
// (description/descricao, amount_cents/amountCents) e devolve forma única.
// Estrutura preparada pra futuro qty + unit + unitPrice — campos opcionais
// passam intocados.
function normalizeItems(items) {
  if (!Array.isArray(items)) return [];
  return items.map((it) => {
    const out = {
      description: String(it?.description ?? it?.descricao ?? '').trim(),
      amount_cents: Math.max(0, Math.floor(Number(it?.amount_cents ?? it?.amountCents ?? 0))),
    };
    if (it?.quantity != null) out.quantity = Number(it.quantity);
    if (it?.unit_label) out.unit_label = String(it.unit_label);
    if (it?.unit_amount_cents != null) out.unit_amount_cents = Math.floor(Number(it.unit_amount_cents));
    return out;
  });
}

function buildBudgetPdfPath(budgetId, revisionNumber) {
  const filename = `budget-${budgetId}-v${revisionNumber}.pdf`;
  return {
    path: path.join(DOCS_DIR, filename),
    filename,
    publicUrl: `/api/documents/${filename}`,
  };
}

function makeService(db) {
  // ─── Lockdown de registro novo ────────────────────────────────────────────

  // Chamado no POST /api/tc-auth/me/records logo após o INSERT do registro.
  // Não cria budget — só marca o terracontrol.budget_status='locked' pra
  // sinalizar que está aguardando admin gerar o orçamento. Budget só nasce
  // de fato em sendBudget. Esse design evita budgets fantasmas com
  // current_revision=0 e simplifica o ciclo (1 INSERT em tc_budgets =
  // 1 envio real).
  async function lockNewRecord(terracontrolId) {
    await db.setTerracontrolBudgetState(terracontrolId, { budgetStatus: 'locked' });
  }

  // ─── Helpers internos ─────────────────────────────────────────────────────

  // Carrega registro + tc_user dono pra renderizar PDF / dispatch.
  async function loadRecordAndOwner(terracontrolId) {
    const rows = await db.getTerraControlByIds([terracontrolId]);
    const record = rows[0];
    if (!record) throw new Error(`Registro ${terracontrolId} não encontrado`);
    let tcUser = null;
    if (record.created_by_tc_user_id) {
      tcUser = await db.getTcUserById(record.created_by_tc_user_id);
    }
    return { record, tcUser };
  }

  // Renderiza PDF da revisão e devolve path/url públicas.
  async function generateRevisionPdf({ budgetId, revisionNumber, record, tcUser, contentJson, items, totalAmountCents }) {
    fs.mkdirSync(DOCS_DIR, { recursive: true });
    const { path: outPath, filename, publicUrl } = buildBudgetPdfPath(budgetId, revisionNumber);
    await renderBudgetPdf({
      outPath,
      record,
      tcUser,
      revision: {
        revision_number: revisionNumber,
        content_json: contentJson,
        items,
        total_amount_cents: totalAmountCents,
        created_at: new Date().toISOString(),
      },
    });
    return { path: outPath, filename, publicUrl };
  }

  // ─── sendBudget: cria budget (se não existir) + nova revisão + status sent ─

  // Atomicidade pragmática: como o pdfkit grava num stream (assíncrono fora
  // do escopo do BEGIN do Postgres), não dá pra envolver tudo numa transação
  // única SQL+filesystem. Estratégia:
  //   1. SQL: cria budget + revision + evento + atualiza status (tudo em uma transação)
  //   2. Gera PDF e atualiza budget.current_pdf_url + revision.pdf_url depois
  //
  // Se passo 2 falhar, status já está sent mas pdf_url fica null — admin
  // pode reenviar. PDF é regenerável (não é fonte de verdade).
  async function sendBudget({ terracontrolId, actorUserId, contentJson, items }) {
    const totalAmountCents = computeTotalCents(items);
    const cleanItems = normalizeItems(items);
    if (totalAmountCents <= 0) {
      throw new Error('Total do orçamento deve ser maior que zero');
    }

    // Existe budget ativo? Se sim, é nova revisão. Senão, cria budget.
    let budget = await db.getBudgetByTerracontrolId(terracontrolId);
    let revisionNumber;
    if (!budget) {
      budget = await db.createBudget({ terracontrolId, createdByUserId: actorUserId });
      revisionNumber = 1;
    } else {
      // Não permite "reenviar" se já foi pago. Cancelado deveria estar
      // filtrado pelo getBudgetByTerracontrolId.
      if (budget.status === 'paid' || budget.status === 'awaiting_payment') {
        throw new Error(`Orçamento já está em status '${budget.status}'; não pode ser reenviado`);
      }
      revisionNumber = (budget.current_revision || 0) + 1;
    }

    // Cria revision (PDF preenchido depois)
    const revision = await db.createBudgetRevision({
      budgetId: budget.id,
      revisionNumber,
      contentJson,
      contentHtmlSnapshot: null, // pode ser populado pelo front se quiser cache
      items: cleanItems,
      totalAmountCents,
      pdfUrl: null,
      createdByUserId: actorUserId,
    });

    // Atualiza budget: status sent, current_revision, total
    budget = await db.updateBudgetStatus(budget.id, 'sent', {
      current_revision: revisionNumber,
      total_amount_cents: totalAmountCents,
    });

    // Atualiza denormalização no terracontrol
    await db.setTerracontrolBudgetState(terracontrolId, {
      budgetId: budget.id,
      budgetStatus: 'sent',
    });

    // Evento de auditoria
    await db.appendBudgetEvent({
      budgetId: budget.id,
      eventType: revisionNumber === 1 ? 'sent' : 'revised',
      actorType: 'impgeo',
      actorId: actorUserId || null,
      payload: { revisionNumber, totalAmountCents },
    });

    // PDF — best-effort, falha não desfaz envio
    const { record, tcUser } = await loadRecordAndOwner(terracontrolId);
    try {
      const pdf = await generateRevisionPdf({
        budgetId: budget.id,
        revisionNumber,
        record,
        tcUser,
        contentJson,
        items: cleanItems,
        totalAmountCents,
      });
      await db.queryWithRetry(
        `UPDATE tc_budget_revisions SET pdf_url = $2 WHERE id = $1`,
        [revision.id, pdf.publicUrl]
      );
      await db.updateBudgetStatus(budget.id, 'sent', { current_pdf_url: pdf.publicUrl });
      budget.current_pdf_url = pdf.publicUrl;
      revision.pdf_url = pdf.publicUrl;
    } catch (err) {
      console.error(`[budget-service] Falha ao gerar PDF do budget ${budget.id} v${revisionNumber}:`, err.message);
    }

    return { budget, revision, record, tcUser };
  }

  // ─── requestRevision: tc_user pede alteração (ou auto_edit dispara) ───────

  async function requestRevision({ budgetId, tcUserId, comment, source = 'tc_user' }) {
    const budget = await db.getBudgetById(budgetId);
    if (!budget) throw new Error('Orçamento não encontrado');
    if (budget.status !== 'sent' && budget.status !== 'revision_requested') {
      throw new Error(`Não é possível solicitar revisão em status '${budget.status}'`);
    }

    const request = await db.createBudgetRevisionRequest({
      budgetId,
      againstRevisionNumber: budget.current_revision || 1,
      comment,
      source,
      tcUserId,
    });

    if (budget.status !== 'revision_requested') {
      await db.updateBudgetStatus(budgetId, 'revision_requested');
      await db.setTerracontrolBudgetState(budget.terracontrol_id, {
        budgetStatus: 'revision_requested',
      });
    }

    await db.appendBudgetEvent({
      budgetId,
      eventType: 'revision_requested',
      actorType: source === 'auto_edit' ? 'system' : 'tc',
      actorId: tcUserId || null,
      payload: { comment, source },
    });

    return { budget: await db.getBudgetById(budgetId), request };
  }

  // ─── acceptAndStartPayment: tc_user aprova e gera PIX ────────────────────

  async function acceptAndStartPayment({ budgetId, tcUser }) {
    const budget = await db.getBudgetById(budgetId);
    if (!budget) throw new Error('Orçamento não encontrado');
    if (budget.status !== 'sent' && budget.status !== 'revision_requested') {
      throw new Error(`Orçamento não pode ser aprovado em status '${budget.status}'`);
    }
    if (!budget.total_amount_cents || budget.total_amount_cents <= 0) {
      throw new Error('Orçamento sem valor total — admin precisa reenviar');
    }

    // Cliente AbacatePay: upsert (por taxId) se tc_user tem CPF; senão cobra
    // sem customer vinculado (legítimo — paga quem quiser via copia-cola).
    let customerArg;
    if (tcUser?.cpf) {
      // Reusar cust_xxx em cache se já temos
      if (tcUser.abacatepay_customer_id) {
        customerArg = { id: tcUser.abacatepay_customer_id };
      } else {
        const fullName = [tcUser.first_name, tcUser.last_name].filter(Boolean).join(' ').trim()
          || tcUser.username;
        try {
          const cust = await abacatepay.createCustomer({
            name: fullName,
            email: tcUser.email || `tc-${tcUser.id}@noemail.local`,
            cellphone: tcUser.phone || undefined,
            taxId: tcUser.cpf,
          });
          if (cust?.id) {
            await db.setTcUserAbacatePayCustomerId(tcUser.id, cust.id);
            customerArg = { id: cust.id };
          }
        } catch (err) {
          // Se upsert falhar, manda inline — não bloqueia o pagamento
          console.warn('[budget-service] Falha ao upsertar customer AbacatePay:', err.message);
          customerArg = {
            name: fullName,
            email: tcUser.email,
            taxId: tcUser.cpf,
            cellphone: tcUser.phone,
          };
        }
      }
    }

    const attempt = (budget.abacatepay_attempt || 0) + 1;
    const externalId = `tc_budget_${budget.id}_attempt_${attempt}`;
    const charge = await abacatepay.createTransparentCharge({
      amount: budget.total_amount_cents,
      externalId,
      description: `Orçamento TerraControl v${budget.current_revision}`,
      expiresIn: DEFAULT_PIX_EXPIRES_IN,
      customer: customerArg,
      metadata: {
        budgetId: budget.id,
        terracontrolId: budget.terracontrol_id,
        tcUserId: tcUser?.id,
        revisionNumber: budget.current_revision,
        attempt,
      },
    });

    await db.updateBudgetPaymentSnapshot(budget.id, {
      chargeId: charge.id,
      externalId,
      brCode: charge.brCode,
      brCodeBase64: charge.brCodeBase64,
      expiresAt: charge.expiresAt,
      attempt,
    });
    const updated = await db.updateBudgetStatus(budget.id, 'awaiting_payment');
    await db.setTerracontrolBudgetState(budget.terracontrol_id, {
      budgetStatus: 'awaiting_payment',
    });
    await db.appendBudgetEvent({
      budgetId: budget.id,
      eventType: attempt === 1 ? 'accepted' : 'payment_initiated',
      actorType: 'tc',
      actorId: tcUser?.id || null,
      payload: { externalId, attempt, chargeId: charge.id },
    });

    return {
      budget: updated,
      payment: {
        brCode: charge.brCode,
        brCodeBase64: charge.brCodeBase64,
        expiresAt: charge.expiresAt,
        attempt,
      },
    };
  }

  // ─── refreshPaymentQrCode: PIX expirou, gera outro ────────────────────────

  async function refreshPaymentQrCode({ budgetId, tcUser }) {
    const budget = await db.getBudgetById(budgetId);
    if (!budget) throw new Error('Orçamento não encontrado');
    if (budget.status !== 'awaiting_payment') {
      throw new Error(`Não é possível regenerar QR Code em status '${budget.status}'`);
    }
    // Reusa fluxo: chama AbacatePay novamente com attempt+1
    const attempt = (budget.abacatepay_attempt || 0) + 1;
    const externalId = `tc_budget_${budget.id}_attempt_${attempt}`;
    let customerArg;
    if (tcUser?.abacatepay_customer_id) customerArg = { id: tcUser.abacatepay_customer_id };
    const charge = await abacatepay.createTransparentCharge({
      amount: budget.total_amount_cents,
      externalId,
      description: `Orçamento TerraControl v${budget.current_revision} (tentativa ${attempt})`,
      expiresIn: DEFAULT_PIX_EXPIRES_IN,
      customer: customerArg,
      metadata: {
        budgetId: budget.id,
        terracontrolId: budget.terracontrol_id,
        tcUserId: tcUser?.id,
        revisionNumber: budget.current_revision,
        attempt,
      },
    });
    await db.updateBudgetPaymentSnapshot(budget.id, {
      chargeId: charge.id,
      externalId,
      brCode: charge.brCode,
      brCodeBase64: charge.brCodeBase64,
      expiresAt: charge.expiresAt,
      attempt,
    });
    await db.appendBudgetEvent({
      budgetId: budget.id,
      eventType: 'payment_initiated',
      actorType: 'tc',
      actorId: tcUser?.id || null,
      payload: { externalId, attempt, chargeId: charge.id, reason: 'refresh' },
    });
    return {
      brCode: charge.brCode,
      brCodeBase64: charge.brCodeBase64,
      expiresAt: charge.expiresAt,
      attempt,
    };
  }

  // ─── markPaidFromWebhook: idempotente, aprova terracontrol ────────────────

  // Procura budget pelo externalId. Se status != 'awaiting_payment', grava
  // evento `payment_completed_unexpected` e retorna sem alterar (idempotente
  // pra replay de webhook ou reprocess manual).
  async function markPaidFromWebhook({ externalId, amountCents, abacatePayload }) {
    const budget = await db.getBudgetByExternalId(externalId);
    if (!budget) {
      console.warn(`[budget-service] markPaidFromWebhook: budget não encontrado pra externalId=${externalId}`);
      return { matched: false };
    }

    if (budget.status !== 'awaiting_payment') {
      await db.appendBudgetEvent({
        budgetId: budget.id,
        eventType: 'payment_completed_unexpected',
        actorType: 'abacatepay',
        actorId: null,
        payload: { externalId, currentStatus: budget.status, amountCents, abacatePayload },
      });
      return { matched: true, idempotent: true, budget };
    }

    // Atualiza budget pra paid + marca terracontrol approved
    const paidAt = new Date();
    const updated = await db.updateBudgetStatus(budget.id, 'paid', {
      paid_at: paidAt,
      paid_amount_cents: amountCents || budget.total_amount_cents,
    });
    await db.setTerracontrolBudgetState(budget.terracontrol_id, {
      budgetStatus: 'paid',
    });

    // Aprova o registro (system actor = null no approved_by_user_id, FK aceita null).
    let approvedRecord = null;
    try {
      approvedRecord = await db.approveTerraControlRecord(budget.terracontrol_id, null);
      // Audit log no registro (migration 041) — fonte 'abacatepay' diferencia
      // aprovação automática por pagamento de aprovação manual do admin.
      db.appendRecordEvent({
        terracontrolId: budget.terracontrol_id,
        eventType: 'approved',
        actorType: 'abacatepay',
        actorId: null,
        payload: { reason: 'payment_completed', budgetId: budget.id, amountCents },
      });
    } catch (err) {
      console.error(`[budget-service] Falha ao aprovar terracontrol ${budget.terracontrol_id}:`, err.message);
    }

    await db.appendBudgetEvent({
      budgetId: budget.id,
      eventType: 'payment_completed',
      actorType: 'abacatepay',
      actorId: null,
      payload: { externalId, amountCents, paidAt: paidAt.toISOString() },
    });

    return { matched: true, idempotent: false, budget: updated, record: approvedRecord };
  }

  // ─── cancelBudget: admin cancela ──────────────────────────────────────────

  // ─── dismissRevision: admin recusa pedido de revisão do tc_user ──────────
  // Status volta de 'revision_requested' pra 'sent' (orçamento anterior
  // continua válido — tc_user pode aprovar ou pedir nova revisão). Motivo é
  // obrigatório e gravado pra notificação ao cliente.
  async function dismissRevision({ budgetId, actorUserId, reason }) {
    const budget = await db.getBudgetById(budgetId);
    if (!budget) throw new Error('Orçamento não encontrado');
    if (budget.status !== 'revision_requested') {
      throw new Error(`Não há revisão pendente para descartar (status atual: ${budget.status})`);
    }
    if (!reason || !String(reason).trim()) {
      throw new Error('Motivo do descarte é obrigatório');
    }
    const cleanReason = String(reason).trim();
    const updated = await db.updateBudgetStatus(budgetId, 'sent');
    await db.setTerracontrolBudgetState(budget.terracontrol_id, { budgetStatus: 'sent' });
    await db.appendBudgetEvent({
      budgetId,
      eventType: 'revision_dismissed',
      actorType: 'impgeo',
      actorId: actorUserId || null,
      payload: { reason: cleanReason },
    });
    return { budget: updated, reason: cleanReason };
  }

  async function cancelBudget({ budgetId, actorUserId, reason }) {
    const budget = await db.getBudgetById(budgetId);
    if (!budget) throw new Error('Orçamento não encontrado');
    if (budget.status === 'paid') {
      throw new Error('Orçamento já pago — não pode ser cancelado');
    }
    const updated = await db.updateBudgetStatus(budgetId, 'cancelled');
    // Quando cancela, libera o imóvel pro tc_user editar (sem ciclo de orçamento)
    await db.setTerracontrolBudgetState(budget.terracontrol_id, {
      budgetId: null,
      budgetStatus: null,
    });
    await db.appendBudgetEvent({
      budgetId,
      eventType: 'cancelled',
      actorType: 'impgeo',
      actorId: actorUserId || null,
      payload: { reason: reason || null },
    });
    return updated;
  }

  // ─── Getters compostos ────────────────────────────────────────────────────

  async function getBudgetForAdmin(budgetId) {
    const budget = await db.getBudgetById(budgetId);
    if (!budget) return null;
    const [revisions, requests, events] = await Promise.all([
      db.listBudgetRevisions(budgetId),
      db.listBudgetRevisionRequests(budgetId),
      db.listBudgetEvents(budgetId),
    ]);
    return { budget, revisions, requests, events };
  }

  async function getBudgetForTcUser(budgetId, tcUserId) {
    const owns = await db.tcUserOwnsBudget(tcUserId, budgetId);
    if (!owns) return null;
    const budget = await db.getBudgetById(budgetId);
    if (!budget) return null;
    const [revisions, requests] = await Promise.all([
      db.listBudgetRevisions(budgetId),
      db.listBudgetRevisionRequests(budgetId),
    ]);
    const currentRevision = revisions.find(r => r.revision_number === budget.current_revision);
    return { budget, currentRevision, revisions, requests };
  }

  // ─── Template ─────────────────────────────────────────────────────────────

  async function getTemplate() {
    return db.getActiveBudgetTemplate();
  }

  async function saveTemplate({ name, contentJson, defaultItems, updatedByUserId }) {
    return db.upsertBudgetTemplate({ name, contentJson, defaultItems, updatedByUserId });
  }

  return {
    lockNewRecord,
    sendBudget,
    requestRevision,
    acceptAndStartPayment,
    refreshPaymentQrCode,
    markPaidFromWebhook,
    cancelBudget,
    dismissRevision,
    getBudgetForAdmin,
    getBudgetForTcUser,
    getTemplate,
    saveTemplate,
    // Helpers úteis pra handlers
    computeTotalCents,
    normalizeItems,
    buildBudgetPdfPath,
  };
}

module.exports = makeService;
