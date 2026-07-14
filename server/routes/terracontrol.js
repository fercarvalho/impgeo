// ═══════════════════════════════════════════════════════════════════════════
// server/routes/terracontrol.js
// Rotas do TerraControl (lado impgeo + público): CRUD de registros, gestão de
// orçamentos pelo admin (tc-budgets), aprovação, share-links, acesso público
// (/v/:token, documents, público por token). Extraídas de server.js (#3) —
// comportamento idêntico (rotas verbatim, paths completos preservados).
//
// NÃO inclui o portal tc-auth (/api/tc-auth/*) — fica em rodada futura, pois
// depende de relocar os helpers de cookie/contexto (setTcAuthCookies/
// tcRequestContext) compartilhados com os logins TC do cluster de auth.
//
// Helpers TC-only definidos aqui dentro (movidos com o bloco):
// dispatchTcRecordEventToOwner, shareAccessContext.
// ═══════════════════════════════════════════════════════════════════════════
'use strict';

const express = require('express');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const path = require('path');
const fs = require('fs');
const requireTerraControlAccess = require('../auth/require-terracontrol-access');
const tcAuth = require('../auth/tc-auth');
const push = require('../services/push');
const pushDispatcher = require('../services/push-dispatcher');
// #3 (fix): require desestruturado do server.js que passou batido na extração
// (rodada 4) — emails de registro TC aprovado/editado ao dono.
const { enviarEmailTcRegistroAprovado, enviarEmailTcRegistroEditado } = require('../services/email');

module.exports = function createTerraControlRoutes({
  db, authenticateToken, optionalAuth, budgetService, budgetDispatcher,
  documentsDir, BASE_URL, slugify, sharePasswordLimiter, sharePublicLimiter,
  uploadDocument,
}) {
  const router = express.Router();

// APIs para TerraControl
router.get('/api/terracontrol', async (req, res) => {
  try {
    const records = await db.getAllTerraControl();
    res.json({ success: true, data: records });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/api/terracontrol', async (req, res) => {
  try {
    const record = await db.saveTerraControl(req.body);
    db.appendRecordEvent({
      terracontrolId: record.id,
      eventType: 'created',
      actorType: 'impgeo',
      actorId: req.user?.id || null,
      payload: { imovel: record.imovel, municipio: record.municipio },
    });
    res.json({ success: true, data: record });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Edição genérica de registro pelo admin. Quando o registro pertence a um
// tc_user (created_by_tc_user_id populado), notifica o dono via sino + email.
// Edição feita pelo próprio tc_user usa outro endpoint: PUT /api/tc-auth/me/
// records/:id — esse não dispara notif/email (ele é o ator).
router.put('/api/terracontrol/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const record = await db.updateTerraControl(id, req.body);
    db.appendRecordEvent({
      terracontrolId: id,
      eventType: 'edited',
      actorType: 'impgeo',
      actorId: req.user.id,
      payload: { fields: Object.keys(req.body || {}) },
    });
    const editedByName = req.user?.name || req.user?.username || 'um administrador';
    dispatchTcRecordEventToOwner(record, 'edited', { editedByName }).catch(() => {});
    res.json({ success: true, data: record });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.delete('/api/terracontrol/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await db.deleteTerraControl(id);
    res.json({ success: true, message: 'Registro excluído com sucesso' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Helper: notifica o tc_user dono do registro sobre uma ação do admin
// (aprovação / edição). Dispara o sino in-app via tc_notifications e
// também um email via SendGrid, ambos fire-and-forget. Erros são logados
// mas não quebram a request principal — falha de email/notif não deve
// reverter aprovação ou edição.
//
// `event` controla a cópia: 'approved' ou 'edited'.
async function dispatchTcRecordEventToOwner(record, event, { editedByName } = {}) {
  if (!record) return;
  const tcUserId = record.created_by_tc_user_id;
  if (!tcUserId) return; // registro não é de um tc_user — nada a fazer

  let tcUser;
  try {
    tcUser = await db.getTcUserById(tcUserId);
  } catch (e) {
    console.error('[tc-notif] Falha ao buscar tc_user:', e?.message);
    return;
  }
  if (!tcUser) return;

  const imovel = record.imovel || '';
  const municipio = record.municipio || '';
  const codImovel = record.cod_imovel != null ? record.cod_imovel : null;
  const username = [tcUser.first_name, tcUser.last_name].filter(Boolean).join(' ').trim()
    || tcUser.username
    || 'usuário';

  const title = event === 'approved'
    ? 'Seu registro foi aprovado'
    : 'Seu registro foi atualizado';
  const message = event === 'approved'
    ? `${imovel}${municipio ? ` em ${municipio}` : ''} — agora visível no TerraControl`
    : `${editedByName || 'Um administrador'} editou ${imovel}${municipio ? ` em ${municipio}` : ''}`;

  // 1) Sino in-app (tc_notifications) + push pro tc_user dono
  try {
    const tcNotif = await db.createTcNotification({
      tc_user_id: tcUserId,
      notification_type: event === 'approved' ? 'tc_record_approved' : 'tc_record_edited',
      title,
      message,
      related_entity_type: 'terracontrol',
      related_entity_id: record.id,
    });
    pushDispatcher.send(db, 'tc', tcUserId, tcNotif).catch(() => {});
  } catch (e) {
    console.error('[tc-notif] Falha ao gravar notif in-app:', e?.message);
  }

  // 2) Email — só dispara se tc_user tiver email E não tiver desligado
  // (opt-out via tc_users.email_notifications). Default DB é TRUE.
  // NÃO afeta emails transacionais críticos (reset de senha, convite).
  if (!tcUser.email) return;
  if (tcUser.email_notifications === false) return;
  const loginUrl = process.env.TC_PUBLIC_URL || 'https://terracontrol.com.br';
  try {
    if (event === 'approved') {
      await enviarEmailTcRegistroAprovado({
        toEmail: tcUser.email,
        username,
        imovel,
        municipio,
        codImovel,
        loginUrl,
      });
    } else {
      await enviarEmailTcRegistroEditado({
        toEmail: tcUser.email,
        username,
        imovel,
        municipio,
        codImovel,
        editedByName,
        loginUrl,
      });
    }
  } catch (e) {
    console.error('[tc-notif] Falha ao enviar email:', e?.message);
  }
}

// PATCH /api/admin/terracontrol/:id/approve — admin aprova registro pendente
// Requer auth impgeo (admin/superadmin OU usuário com módulo terracontrol).
router.patch('/api/admin/terracontrol/:id/approve', authenticateToken, requireTerraControlAccess, async (req, res) => {
  try {
    const updated = await db.approveTerraControlRecord(req.params.id, req.user.id);
    db.appendRecordEvent({
      terracontrolId: req.params.id,
      eventType: 'approved',
      actorType: 'impgeo',
      actorId: req.user.id,
    });
    // Notif + email pro tc_user dono (fire-and-forget, sem await pra não
    // atrasar o response). Falha aqui não desfaz a aprovação.
    dispatchTcRecordEventToOwner(updated, 'approved').catch(() => {});
    res.json({ success: true, data: updated });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message || 'Erro ao aprovar' });
  }
});

// PATCH /api/admin/terracontrol/:id/unapprove — admin revoga aprovação
router.patch('/api/admin/terracontrol/:id/unapprove', authenticateToken, requireTerraControlAccess, async (req, res) => {
  try {
    const updated = await db.unapproveTerraControlRecord(req.params.id);
    db.appendRecordEvent({
      terracontrolId: req.params.id,
      eventType: 'unapproved',
      actorType: 'impgeo',
      actorId: req.user.id,
    });
    res.json({ success: true, data: updated });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message || 'Erro ao revogar aprovação' });
  }
});

// ===========================================================================
// Orçamentos TerraControl — admin endpoints (migration 040)
// ===========================================================================
// Todas exigem authenticateToken + requireTerraControlAccess. Lógica de
// negócio fica em budgetService; aqui só validação básica e dispatch fire-
// and-forget de notificações.

// GET /api/admin/tc-budgets/template — template padrão ativo (1 por vez MVP)
router.get('/api/admin/tc-budgets/template', authenticateToken, requireTerraControlAccess, async (req, res) => {
  try {
    const tpl = await budgetService.getTemplate();
    res.json({ success: true, data: tpl });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message || 'Erro ao carregar template' });
  }
});

// PUT /api/admin/tc-budgets/template — upsert do template ativo
router.put('/api/admin/tc-budgets/template', authenticateToken, requireTerraControlAccess, async (req, res) => {
  try {
    const { name, contentJson, defaultItems } = req.body || {};
    if (!contentJson || typeof contentJson !== 'object') {
      return res.status(400).json({ success: false, error: 'contentJson (TipTap JSON) é obrigatório' });
    }
    const saved = await budgetService.saveTemplate({
      name,
      contentJson,
      defaultItems: Array.isArray(defaultItems) ? defaultItems : [],
      updatedByUserId: req.user.id,
    });
    res.json({ success: true, data: saved });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message || 'Erro ao salvar template' });
  }
});

// GET /api/admin/tc-budgets/by-record/:terracontrolId — orçamento ativo do imóvel
// Retorna 200 + data:null se não existe (UI usa pra decidir entre "Gerar" / "Ver").
router.get('/api/admin/tc-budgets/by-record/:terracontrolId', authenticateToken, requireTerraControlAccess, async (req, res) => {
  try {
    const budget = await db.getBudgetByTerracontrolId(req.params.terracontrolId);
    if (!budget) return res.json({ success: true, data: null });
    const full = await budgetService.getBudgetForAdmin(budget.id);
    res.json({ success: true, data: full });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message || 'Erro ao carregar orçamento' });
  }
});

// GET /api/admin/tc-budgets/:id — full payload (budget + revisions + requests + events)
router.get('/api/admin/tc-budgets/:id', authenticateToken, requireTerraControlAccess, async (req, res) => {
  try {
    const full = await budgetService.getBudgetForAdmin(req.params.id);
    if (!full) return res.status(404).json({ success: false, error: 'Orçamento não encontrado' });
    res.json({ success: true, data: full });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message || 'Erro ao carregar orçamento' });
  }
});

// POST /api/admin/tc-budgets — cria/envia orçamento (status passa direto pra sent)
// Se já existe budget ativo, ESTE endpoint não é o caminho — use /:id/revise.
// Body: { terracontrolId, contentJson, items }
router.post('/api/admin/tc-budgets', authenticateToken, requireTerraControlAccess, async (req, res) => {
  try {
    const { terracontrolId, contentJson, items } = req.body || {};
    if (!terracontrolId) return res.status(400).json({ success: false, error: 'terracontrolId obrigatório' });
    if (!contentJson || typeof contentJson !== 'object') {
      return res.status(400).json({ success: false, error: 'contentJson (TipTap JSON) é obrigatório' });
    }
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ success: false, error: 'Adicione pelo menos um item ao orçamento' });
    }
    const existing = await db.getBudgetByTerracontrolId(terracontrolId);
    if (existing && existing.current_revision > 0) {
      return res.status(409).json({
        success: false,
        error: `Já existe orçamento ativo para este imóvel (status: ${existing.status}). Use o endpoint de revisão.`,
      });
    }
    const { budget, revision, record } = await budgetService.sendBudget({
      terracontrolId, actorUserId: req.user.id, contentJson, items,
    });
    // Fire-and-forget — notificação não atrasa response
    budgetDispatcher.dispatchTcBudgetEventToOwner(budget, record, 'sent').catch(() => {});
    res.json({ success: true, data: { budget, revision } });
  } catch (error) {
    console.error('Erro POST /api/admin/tc-budgets:', error);
    res.status(500).json({ success: false, error: error.message || 'Erro ao enviar orçamento' });
  }
});

// POST /api/admin/tc-budgets/:id/revise — cria nova revisão (v2, v3, …)
// Body: { contentJson, items }
router.post('/api/admin/tc-budgets/:id/revise', authenticateToken, requireTerraControlAccess, async (req, res) => {
  try {
    const { contentJson, items } = req.body || {};
    if (!contentJson || typeof contentJson !== 'object') {
      return res.status(400).json({ success: false, error: 'contentJson é obrigatório' });
    }
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ success: false, error: 'Adicione pelo menos um item' });
    }
    const existing = await db.getBudgetById(req.params.id);
    if (!existing) return res.status(404).json({ success: false, error: 'Orçamento não encontrado' });
    const { budget, revision, record } = await budgetService.sendBudget({
      terracontrolId: existing.terracontrol_id,
      actorUserId: req.user.id,
      contentJson,
      items,
    });
    budgetDispatcher.dispatchTcBudgetEventToOwner(budget, record, 'revised', {
      revisionNumber: revision.revision_number,
    }).catch(() => {});
    res.json({ success: true, data: { budget, revision } });
  } catch (error) {
    console.error('Erro POST /api/admin/tc-budgets/:id/revise:', error);
    res.status(500).json({ success: false, error: error.message || 'Erro ao revisar orçamento' });
  }
});

// POST /api/admin/tc-budgets/:id/cancel — admin cancela orçamento
router.post('/api/admin/tc-budgets/:id/cancel', authenticateToken, requireTerraControlAccess, async (req, res) => {
  try {
    const { reason } = req.body || {};
    const cancelled = await budgetService.cancelBudget({
      budgetId: req.params.id, actorUserId: req.user.id, reason,
    });
    res.json({ success: true, data: cancelled });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message || 'Erro ao cancelar' });
  }
});

// POST /api/admin/tc-budgets/:id/dismiss-revision — admin descarta pedido de revisão
// Body: { reason }
// Status volta 'revision_requested' → 'sent'. Notifica + envia e-mail pro tc_user.
router.post('/api/admin/tc-budgets/:id/dismiss-revision', authenticateToken, requireTerraControlAccess, async (req, res) => {
  try {
    const { reason } = req.body || {};
    const { budget, reason: cleanReason } = await budgetService.dismissRevision({
      budgetId: req.params.id, actorUserId: req.user.id, reason,
    });
    // Dispatch fire-and-forget pro tc_user
    (async () => {
      try {
        const rows = await db.getTerraControlByIds([budget.terracontrol_id]);
        const record = rows[0];
        if (record) {
          await budgetDispatcher.dispatchTcBudgetEventToOwner(budget, record, 'revision_dismissed', {
            reason: cleanReason,
          });
        }
      } catch (e) {
        console.error('[dismiss-revision] Falha no dispatch:', e?.message);
      }
    })();
    res.json({ success: true, data: budget });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message || 'Erro ao descartar revisão' });
  }
});

// GET /api/admin/tc-records/:id/history — histórico completo do imóvel:
// eventos do registro + orçamento ativo (revisões/pedidos/eventos) intercalados.
// Front ordena/exibe — endpoint só agrega.
router.get('/api/admin/tc-records/:id/history', authenticateToken, requireTerraControlAccess, async (req, res) => {
  try {
    const recordRows = await db.getTerraControlByIds([req.params.id]);
    const record = recordRows[0];
    if (!record) return res.status(404).json({ success: false, error: 'Registro não encontrado' });
    const recordEvents = await db.listRecordEvents(req.params.id);
    const budget = await db.getBudgetByTerracontrolId(req.params.id);
    let budgetData = null;
    if (budget) {
      budgetData = await budgetService.getBudgetForAdmin(budget.id);
    }
    res.json({ success: true, data: { record, recordEvents, budget: budgetData } });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message || 'Erro ao carregar histórico' });
  }
});

// POST /api/admin/tc-budgets/preview-pdf — gera PDF temporário pra preview
// no editor (admin clica "Visualizar PDF" antes de enviar). NÃO persiste em
// uploads/documents — vai pra /tmp, é stream-ed pro response, depois apagado.
// Body: { terracontrolId, contentJson, items }
router.post('/api/admin/tc-budgets/preview-pdf', authenticateToken, requireTerraControlAccess, async (req, res) => {
  const { renderBudgetPdf } = require('../services/budget-pdf');
  const os = require('os');
  const path = require('path');
  const crypto = require('crypto');
  const fs = require('fs');
  let tmpPath = null;
  try {
    const { terracontrolId, contentJson, items } = req.body || {};
    if (!terracontrolId) return res.status(400).json({ success: false, error: 'terracontrolId obrigatório' });
    if (!contentJson || typeof contentJson !== 'object') {
      return res.status(400).json({ success: false, error: 'contentJson obrigatório' });
    }
    const rows = await db.getTerraControlByIds([terracontrolId]);
    const record = rows[0];
    if (!record) return res.status(404).json({ success: false, error: 'Registro não encontrado' });
    let tcUser = null;
    if (record.created_by_tc_user_id) {
      tcUser = await db.getTcUserById(record.created_by_tc_user_id);
    }
    const cleanItems = budgetService.normalizeItems(Array.isArray(items) ? items : []);
    const totalAmountCents = budgetService.computeTotalCents(cleanItems);
    // Arquivo temp com nome aleatório pra evitar colisão (multi-admin)
    tmpPath = path.join(os.tmpdir(), `tc-budget-preview-${crypto.randomBytes(8).toString('hex')}.pdf`);
    await renderBudgetPdf({
      outPath: tmpPath,
      record,
      tcUser,
      revision: {
        revision_number: ((await db.getBudgetByTerracontrolId(terracontrolId))?.current_revision || 0) + 1,
        content_json: contentJson,
        items: cleanItems,
        total_amount_cents: totalAmountCents,
        created_at: new Date().toISOString(),
      },
    });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="preview-orcamento.pdf"`);
    res.setHeader('Cache-Control', 'no-store');
    const stream = fs.createReadStream(tmpPath);
    stream.on('close', () => {
      // Cleanup: apaga o arquivo temp depois do response
      fs.unlink(tmpPath, () => {});
    });
    stream.pipe(res);
  } catch (error) {
    console.error('[tc-budgets preview-pdf] Erro:', error);
    if (tmpPath) { try { fs.unlinkSync(tmpPath); } catch {} }
    if (!res.headersSent) {
      res.status(500).json({ success: false, error: error.message || 'Erro ao gerar PDF' });
    }
  }
});

router.delete('/api/terracontrol', async (req, res) => {
  try {
    const { ids } = req.body;
    if (!Array.isArray(ids)) {
      return res.status(400).json({ success: false, error: 'IDs devem ser um array' });
    }
    const { deletedCount } = await db.deleteMultipleTerraControl(ids);
    res.json({ success: true, deletedCount, message: `${deletedCount} registro(s) excluído(s)` });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Rota para listar todos os links compartilháveis
router.get('/api/terracontrol/share-links', authenticateToken, async (req, res) => {
  try {
    const shareLinks = await db.getAllShareLinks();
    res.json({
      success: true,
      data: shareLinks
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Rota para gerar link compartilhável de records
router.post('/api/terracontrol/generate-share-link', authenticateToken, async (req, res) => {
  try {
    const { name, expiresAt, password, selectedIds } = req.body;
    const bcrypt = require('bcryptjs');

    if (!Array.isArray(selectedIds) || selectedIds.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Selecione pelo menos um registro para compartilhar'
      });
    }

    // Gerar token único para compartilhamento.
    // Política (G2.2): nome → slug + sufixo aleatório SEMPRE (não só em colisão).
    // Slug puro é enumerável; sufixo com 8 bytes (16 hex chars, 64 bits) torna
    // impraticável adivinhar — equivalente a UUID parcial. Sem nome, mantém o
    // 'view_<32bytes>' que já era seguro.
    let token = '';
    if (name && name.trim()) {
      const baseSlug = slugify(name);
      const suffix = require('crypto').randomBytes(8).toString('hex');
      token = baseSlug ? `${baseSlug}-${suffix}` : `view_${suffix}`;
    } else {
      token = 'view_' + require('crypto').randomBytes(32).toString('hex');
    }

    // Converter data de expiração para ISO string se fornecida
    let expiresAtISO = null;
    if (expiresAt && expiresAt.trim()) {
      // Se já estiver em formato ISO, usar diretamente, senão converter de datetime-local
      if (expiresAt.includes('T') && expiresAt.length === 16) {
        // Formato datetime-local (YYYY-MM-DDTHH:mm), converter para ISO
        expiresAtISO = new Date(expiresAt).toISOString();
      } else {
        expiresAtISO = new Date(expiresAt).toISOString();
      }
    }

    // Hash da senha se fornecida
    let passwordHash = null;
    if (password && password.trim()) {
      passwordHash = await bcrypt.hash(password, 10);
    }

    // Salvar token com nome, data de expiração e senha no banco
    await db.saveShareLink(token, name, expiresAtISO, passwordHash, selectedIds);

    res.json({
      success: true,
      token: token,
      message: 'Link compartilhável gerado com sucesso'
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Rota para atualizar um link compartilhável
router.put('/api/terracontrol/share-links/:token', authenticateToken, async (req, res) => {
  try {
    const { token } = req.params;
    const { name, expiresAt, password, regenerateToken } = req.body;
    const bcrypt = require('bcryptjs');

    if (regenerateToken) {
      // Mesma política do create (G2.2): sempre sufixo aleatório forte.
      let newToken = '';
      const effectiveName = name !== undefined ? name : (await db.getShareLink(token))?.name;

      if (effectiveName && effectiveName.trim()) {
        const baseSlug = slugify(effectiveName);
        const suffix = require('crypto').randomBytes(8).toString('hex');
        newToken = baseSlug ? `${baseSlug}-${suffix}` : `view_${suffix}`;
      } else {
        newToken = 'view_' + require('crypto').randomBytes(32).toString('hex');
      }

      const linkData = await db.getShareLink(token);
      if (!linkData) {
        return res.status(404).json({ success: false, error: 'Link não encontrado' });
      }

      // Converter data de expiração se fornecida
      const linkExpiresAt = linkData.expiresAt || linkData.expires_at || null;
      const linkPasswordHash = linkData.passwordHash || linkData.password_hash || null;
      const linkSelectedIds = Array.isArray(linkData.selectedIds)
        ? linkData.selectedIds
        : Array.isArray(linkData.selected_ids)
          ? linkData.selected_ids
          : null;

      let expiresAtISO = linkExpiresAt;
      if (expiresAt !== undefined) {
        if (expiresAt && expiresAt.trim()) {
          if (expiresAt.includes('T') && expiresAt.length === 16) {
            expiresAtISO = new Date(expiresAt).toISOString();
          } else {
            expiresAtISO = new Date(expiresAt).toISOString();
          }
        } else {
          expiresAtISO = null;
        }
      }

      // Hash da senha se fornecida
      let passwordHash = linkPasswordHash;
      if (password !== undefined) {
        if (password && password.trim()) {
          passwordHash = await bcrypt.hash(password, 10);
        } else {
          passwordHash = null;
        }
      }

      // Criar novo link com o novo token
      await db.saveShareLink(
        newToken,
        name !== undefined ? name : linkData.name,
        expiresAtISO,
        passwordHash,
        linkSelectedIds
      );
      // Excluir o link antigo
      await db.deleteShareLink(token);

      res.json({
        success: true,
        token: newToken,
        message: 'Token regenerado com sucesso'
      });
    } else {
      // Atualizar nome, data de expiração e/ou senha
      const bcrypt = require('bcryptjs');
      const updates = {};
      if (name !== undefined) updates.name = name || null;
      if (expiresAt !== undefined) {
        // Converter data de expiração para ISO string se fornecida
        if (expiresAt && expiresAt.trim()) {
          // Se já estiver em formato ISO, usar diretamente, senão converter de datetime-local
          if (expiresAt.includes('T') && expiresAt.length === 16) {
            // Formato datetime-local (YYYY-MM-DDTHH:mm), converter para ISO
            updates.expiresAt = new Date(expiresAt).toISOString();
          } else {
            updates.expiresAt = new Date(expiresAt).toISOString();
          }
        } else {
          updates.expiresAt = null;
        }
      }
      if (password !== undefined) {
        // Se senha for fornecida, fazer hash. Se string vazia ou null, remover senha
        if (password && password.trim()) {
          updates.passwordHash = await bcrypt.hash(password, 10);
        } else {
          updates.passwordHash = null;
        }
      }

      const updated = await db.updateShareLink(token, updates);
      res.json({
        success: true,
        data: updated,
        message: 'Link atualizado com sucesso'
      });
    }
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Rota para excluir um link compartilhável
router.delete('/api/terracontrol/share-links/:token', authenticateToken, async (req, res) => {
  try {
    const { token } = req.params;
    await db.deleteShareLink(token);
    res.json({
      success: true,
      message: 'Link excluído com sucesso'
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Helper inline para extrair contexto de request usado em auditoria (G2.6)
function shareAccessContext(req) {
  return {
    ip: req.ip || req.headers['x-forwarded-for'] || null,
    userAgent: req.headers['user-agent'] || null,
  };
}

// Rota para validar senha do link compartilhável (G2.3 rate limit, G2.6 auditoria)
router.post('/api/terracontrol/public/:token/validate-password', sharePasswordLimiter, async (req, res) => {
  const { token } = req.params;
  const ctx = shareAccessContext(req);
  try {
    const { password } = req.body;
    const bcrypt = require('bcryptjs');

    const shareLink = await db.getShareLink(token);

    if (!shareLink) {
      db.logShareLinkAccess({ token, action: 'password_check', status: 'not_found', ...ctx });
      return res.status(404).json({
        success: false,
        error: 'Link compartilhável não encontrado'
      });
    }

    const linkExpiresAt = shareLink.expiresAt || shareLink.expires_at;
    const linkPasswordHash = shareLink.passwordHash || shareLink.password_hash;

    if (linkExpiresAt) {
      const expiresAt = new Date(linkExpiresAt);
      if (new Date() > expiresAt) {
        db.logShareLinkAccess({ token, action: 'password_check', status: 'expired', ...ctx });
        return res.status(410).json({
          success: false,
          error: 'Este link compartilhável expirou e não está mais disponível'
        });
      }
    }

    if (!linkPasswordHash) {
      return res.status(400).json({
        success: false,
        error: 'Este link não possui senha'
      });
    }

    if (!password) {
      return res.status(400).json({
        success: false,
        error: 'Senha é obrigatória'
      });
    }

    const isValid = await bcrypt.compare(password, linkPasswordHash);

    if (!isValid) {
      db.logShareLinkAccess({ token, action: 'password_check', status: 'password_invalid', ...ctx });
      return res.status(401).json({
        success: false,
        error: 'Senha incorreta'
      });
    }

    db.logShareLinkAccess({ token, action: 'password_check', status: 'success', ...ctx });
    res.json({
      success: true,
      message: 'Senha válida'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message || 'Erro ao validar senha'
    });
  }
});

// Rota de Redirecionamento Curto (/v/:token)
//
// Fluxo único: token é share_link vivo (sub-share criado por tc_user via
// /api/tc-auth/me/share-links) → redireciona pra /?token=<token>. A SPA detecta
// e renderiza TerraControlView em modo 'share' (PasswordGate se necessário).
//
// Suporte ao tc_legacy_aliases foi REMOVIDO (migration 031). URLs antigas de
// share_links migrados em 2026-04 não funcionam mais.
router.get('/v/:token', async (req, res) => {
  try {
    const { token } = req.params;
    const normalizedBase = String(BASE_URL || '').trim().replace(/\/$/, '');
    res.redirect(`${normalizedBase}/?token=${token}`);
  } catch (error) {
    console.error('Erro em /v/:token:', error);
    res.status(500).send('Erro ao redirecionar');
  }
});

// G2.1 — /api/documents passa a exigir autenticação.
// Antes: express.static aberto a qualquer pessoa que descobrisse o nome do
// arquivo (pseudo-aleatório mas previsível em log/cache/histórico).
// Agora: aceita 2 fontes de auth:
//   1. Sessão autenticada do impgeo (cookie httpOnly ou Bearer Authorization)
//   2. Sessão do tc_user (Bearer com JWT aud='terracontrol') — verifica se o
//      documento pertence a algum registro do tc_user_record_access do usuário.
//   3. Share token público (?token=<share>&password=<senha-opcional>) válido,
//      desde que o documento esteja referenciado por algum registro do share
//      (car_url, matriculas_dados[].url, itr_dados[].declaracaoUrl/reciboUrl,
//      ccir_dados[].url) — confere no DB.
// Sem nenhuma das três → 401.
//
// O middleware geral '/api' pula esta rota graças à entrada '/documents' em
// publicApiPrefixes — a validação real está aqui dentro, com optionalAuth.
router.get('/api/documents/:filename', optionalAuth, async (req, res) => {
  const { filename } = req.params;

  // Path traversal: bloqueia '..' ou separadores. Multer já gera nomes
  // sanitizados, mas a rota é pública e o filename vem do cliente.
  if (!filename || filename.includes('/') || filename.includes('\\') || filename.includes('..')) {
    return res.status(400).json({ success: false, error: 'Nome de arquivo inválido' });
  }

  // Caminho 1: sessão autenticada → libera direto.
  if (req.user) {
    return res.sendFile(path.join(documentsDir, filename), {
      // G5.5 — antes era 1y. Reduzido para 7d: PDF substituído ou registro
      // deletado fica visível em todos os clientes em até uma semana, em vez
      // de eternamente no cache do navegador.
      maxAge: '7d',
      headers: { 'Cache-Control': 'private, max-age=604800' }
    }, (err) => {
      if (err && !res.headersSent) {
        res.status(err.code === 'ENOENT' ? 404 : 500).end();
      }
    });
  }

  // Caminho 2: JWT do tc_user. Verifica acesso por tc_user_record_access ao
  // registro que contém esse arquivo. Cache curto (5 min) — se admin revogar
  // o acesso, o PDF para de aparecer rapidamente.
  //
  // Aceita o JWT em TRÊS fontes, nesta ordem:
  //   1. Header: Authorization: Bearer <jwt>   (fetch() programático)
  //   2. Cookie httpOnly `tcAccessToken`       (navegação <a href> / iframe)
  //   3. Query:  ?tcAuth=<jwt>                 (legado / links já emitidos)
  //
  // (1) e (2) vêm de extractTcAccessToken — o MESMO extractor usado pelo
  // authenticateTcUser, então esta rota passa a seguir a mesma fonte de verdade
  // da sessão tc_user (que migrou pra cookie httpOnly no PR #2 / PWA).
  //
  // Por que o cookie é essencial aqui: <a href> NÃO manda header Authorization.
  // Com o token vivendo só em memória no client (cache do /refresh), o link
  // `?tcAuth=${tcToken}` saía vazio em reload/PWA e o download dava 401 — o
  // cookie, que o browser já manda na navegação same-origin, resolve isso.
  //
  // A query segue aceita por compatibilidade (links antigos). O JWT na URL é
  // tolerável porque o access token expira em 15 min e HTTPS encripta a URL,
  // mas o caminho preferido agora é o cookie.
  let tcTokenStr = tcAuth.extractTcAccessToken(req) || '';
  if (!tcTokenStr && req.query.tcAuth) {
    tcTokenStr = String(req.query.tcAuth).trim();
  }
  if (tcTokenStr && tcTokenStr.length > 10) {
    try {
      const payload = tcAuth.verifyAccessToken(tcTokenStr);
      if (payload && payload.aud === tcAuth.JWT_AUDIENCE) {
        // PDFs de orçamento (migration 040): nome `budget-<id>-v<N>.pdf`.
        // Acesso garantido por tcUserOwnsBudget (ownership do registro vinculado),
        // não pela tabela tc_user_record_access (que é pra docs de matrículas/ITR/CCIR).
        const budgetMatch = /^budget-([A-Za-z0-9_-]+)-v\d+\.pdf$/.exec(filename);
        if (budgetMatch) {
          const budgetId = budgetMatch[1];
          const ownsBudget = await db.tcUserOwnsBudget(payload.sub, budgetId);
          if (!ownsBudget) {
            return res.status(403).json({ success: false, error: 'PDF do orçamento não disponível para este usuário' });
          }
          return res.sendFile(path.join(documentsDir, filename), {
            maxAge: '5m',
            headers: { 'Cache-Control': 'private, max-age=300' }
          }, (err) => {
            if (err && !res.headersSent) {
              res.status(err.code === 'ENOENT' ? 404 : 500).end();
            }
          });
        }
        // Demais PDFs (matrícula, ITR, CCIR, CAR) → fluxo normal por ACL
        const fileUrlInDb = `/api/documents/${filename}`;
        const hasAccess = await db.tcUserHasAccessToDocument(payload.sub, fileUrlInDb);
        if (!hasAccess) {
          return res.status(403).json({ success: false, error: 'Documento não disponível para este usuário' });
        }
        return res.sendFile(path.join(documentsDir, filename), {
          maxAge: '5m',
          headers: { 'Cache-Control': 'private, max-age=300' }
        }, (err) => {
          if (err && !res.headersSent) {
            res.status(err.code === 'ENOENT' ? 404 : 500).end();
          }
        });
      }
    } catch (_e) {
      // JWT inválido com aud='terracontrol' → cai pro caminho 3 (share token)
      // se houver, senão 401.
    }
  }

  // Caminho 3: share token público. Documento só é entregue se for referenciado
  // por algum registro listado em selected_ids do share.
  const shareToken = String(req.query.token || '').trim();
  const sharePassword = String(req.query.password || '').trim();
  const ctx = shareAccessContext(req);

  if (!shareToken) {
    return res.status(401).json({ success: false, error: 'Autenticação requerida' });
  }

  try {
    const shareLink = await db.getShareLink(shareToken);

    if (!shareLink) {
      db.logShareLinkAccess({ token: shareToken, action: 'document_download', status: 'not_found', document: filename, ...ctx });
      return res.status(401).json({ success: false, error: 'Link inválido' });
    }

    const linkExpiresAt = shareLink.expiresAt || shareLink.expires_at;
    const linkPasswordHash = shareLink.passwordHash || shareLink.password_hash;
    const linkSelectedIds = Array.isArray(shareLink.selectedIds)
      ? shareLink.selectedIds
      : Array.isArray(shareLink.selected_ids)
        ? shareLink.selected_ids
        : [];

    if (linkExpiresAt && new Date(linkExpiresAt) < new Date()) {
      db.logShareLinkAccess({ token: shareToken, action: 'document_download', status: 'expired', document: filename, ...ctx });
      return res.status(410).json({ success: false, error: 'Link expirou' });
    }

    if (linkPasswordHash) {
      const bcrypt = require('bcryptjs');
      if (!sharePassword) {
        db.logShareLinkAccess({ token: shareToken, action: 'document_download', status: 'password_required', document: filename, ...ctx });
        return res.status(403).json({ success: false, error: 'Senha requerida' });
      }
      const ok = await bcrypt.compare(sharePassword, linkPasswordHash);
      if (!ok) {
        db.logShareLinkAccess({ token: shareToken, action: 'document_download', status: 'password_invalid', document: filename, ...ctx });
        return res.status(401).json({ success: false, error: 'Senha incorreta' });
      }
    }

    if (linkSelectedIds.length === 0) {
      db.logShareLinkAccess({ token: shareToken, action: 'document_download', status: 'not_found', document: filename, ...ctx });
      return res.status(410).json({ success: false, error: 'Link não disponível' });
    }

    // Confirma que o arquivo solicitado pertence a algum registro do share.
    // A URL salva no DB tem prefixo "/api/documents/" — montamos e comparamos
    // contra os campos de documentos. Usa LIKE no JSONB pra cobrir url, carUrl,
    // declaracaoUrl, reciboUrl simultaneamente.
    const fileUrlInDb = `/api/documents/${filename}`;
    const ownsResult = await db.queryWithRetry(
      `SELECT 1 FROM terracontrol
       WHERE id = ANY($1::text[])
         AND (
           car_url = $2
           OR matriculas_dados::text LIKE $3
           OR itr_dados::text         LIKE $3
           OR ccir_dados::text        LIKE $3
         )
       LIMIT 1`,
      [linkSelectedIds.map(String), fileUrlInDb, `%${fileUrlInDb}%`]
    );

    if (ownsResult.rows.length === 0) {
      db.logShareLinkAccess({ token: shareToken, action: 'document_download', status: 'not_found', document: filename, ...ctx });
      return res.status(403).json({ success: false, error: 'Documento não disponível neste link' });
    }

    db.logShareLinkAccess({ token: shareToken, action: 'document_download', status: 'success', document: filename, ...ctx });
    return res.sendFile(path.join(documentsDir, filename), {
      // Cache curto no caminho público: se admin revogar acesso, navegador
      // de quem teve a URL não pode segurar o PDF eternamente.
      maxAge: '5m',
      headers: { 'Cache-Control': 'private, max-age=300' }
    }, (err) => {
      if (err && !res.headersSent) {
        res.status(err.code === 'ENOENT' ? 404 : 500).end();
      }
    });
  } catch (error) {
    console.error('Erro ao servir documento via share link:', error);
    return res.status(500).json({ success: false, error: 'Erro ao servir documento' });
  }
});

// Rota pública para visualizar records (sem autenticação) — G2.3 rate limit, G2.6 auditoria
router.get('/api/terracontrol/public/:token', sharePublicLimiter, async (req, res) => {
  const { token } = req.params;
  const ctx = shareAccessContext(req);
  try {
    const { password } = req.query;
    const bcrypt = require('bcryptjs');

    const shareLink = await db.getShareLink(token);

    if (!shareLink) {
      db.logShareLinkAccess({ token, action: 'view', status: 'not_found', ...ctx });
      return res.status(404).json({
        success: false,
        error: 'Link compartilhável não encontrado'
      });
    }

    const linkExpiresAt = shareLink.expiresAt || shareLink.expires_at;
    const linkPasswordHash = shareLink.passwordHash || shareLink.password_hash;
    const linkSelectedIds = Array.isArray(shareLink.selectedIds)
      ? shareLink.selectedIds
      : Array.isArray(shareLink.selected_ids)
        ? shareLink.selected_ids
        : [];

    if (linkExpiresAt) {
      const expiresAt = new Date(linkExpiresAt);
      if (new Date() > expiresAt) {
        db.logShareLinkAccess({ token, action: 'view', status: 'expired', ...ctx });
        return res.status(410).json({
          success: false,
          error: 'Este link compartilhável expirou e não está mais disponível'
        });
      }
    }

    if (linkPasswordHash) {
      if (!password) {
        db.logShareLinkAccess({ token, action: 'view', status: 'password_required', ...ctx });
        return res.status(403).json({
          success: false,
          requiresPassword: true,
          shareLinkName: shareLink.name,
          error: 'Este link requer senha para acesso'
        });
      }

      const isValid = await bcrypt.compare(password, linkPasswordHash);
      if (!isValid) {
        db.logShareLinkAccess({ token, action: 'view', status: 'password_invalid', ...ctx });
        return res.status(401).json({
          success: false,
          requiresPassword: true,
          shareLinkName: shareLink.name,
          error: 'Senha incorreta'
        });
      }
    }

    // Recusa share links sem seleção: a UI atual exige selectedIds.length >= 1
    // ao criar; links antigos com selected_ids NULL representavam "todos os
    // registros" — comportamento que vaza banco inteiro e foi descontinuado.
    if (linkSelectedIds.length === 0) {
      db.logShareLinkAccess({ token, action: 'view', status: 'not_found', ...ctx });
      return res.status(410).json({
        success: false,
        error: 'Este link não está mais disponível. Solicite um novo link ao administrador.'
      });
    }

    // Filtragem feita pelo banco (WHERE id = ANY) em vez de carregar a tabela
    // inteira e filtrar em JS — evita transitar dados sensíveis pela memória.
    // F: sub-share anônimo NUNCA expõe registros pendentes de aprovação.
    const allRecords = await db.getTerraControlByIds(linkSelectedIds);
    const filteredTerraControl = allRecords.filter(r => r.approved !== false);

    db.logShareLinkAccess({ token, action: 'view', status: 'success', ...ctx });
    res.json({
      success: true,
      data: filteredTerraControl,
      shareLinkName: shareLink.name
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message || 'Erro ao carregar dados'
    });
  }
});

// POST /api/terracontrol/upload-car — upload do PDF do CAR (valida magic bytes %PDF)
router.post('/api/terracontrol/upload-car', authenticateToken, uploadDocument.single('file'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'Nenhum arquivo enviado' });
    }

    // G2.4 — validar magic bytes %PDF antes de aceitar.
    // multer só checa mimetype/extensão (cabeçalhos controlados pelo cliente).
    // Para impedir upload de HTML/JS renomeado para .pdf, lemos os primeiros
    // 4 bytes e verificamos a assinatura real. Se inválido, removemos o arquivo.
    try {
      const fd = fs.openSync(req.file.path, 'r');
      const header = Buffer.alloc(4);
      fs.readSync(fd, header, 0, 4, 0);
      fs.closeSync(fd);
      if (header.toString('ascii') !== '%PDF') {
        try { fs.unlinkSync(req.file.path); } catch (_) {}
        return res.status(400).json({ success: false, error: 'Arquivo enviado não é um PDF válido' });
      }
    } catch (sigErr) {
      console.error('Erro ao validar assinatura PDF:', sigErr);
      try { fs.unlinkSync(req.file.path); } catch (_) {}
      return res.status(500).json({ success: false, error: 'Falha ao validar o arquivo enviado' });
    }

    const fileUrl = `/api/documents/${req.file.filename}`;
    res.json({ success: true, url: fileUrl });
  } catch (error) {
    console.error('Erro no upload de documento do CAR:', error);
    res.status(500).json({ success: false, error: 'Erro ao fazer upload do documento' });
  }
});

  return router;
};
