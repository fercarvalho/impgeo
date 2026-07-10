// ═══════════════════════════════════════════════════════════════════════════
// server/routes/content.js
// Rotas de conteúdo/CMS do sistema: feedback, FAQ, legal/LGPD (termos, privacidade,
// cookies), documentação, roadmap, rodapé e notificação de versão.
// Extraídas de server.js (#3) — comportamento idêntico (rotas verbatim, paths
// completos preservados). Deps por injeção; sanitizeHtml importado direto.
// requireLegalPermission e SANITIZE_OPTIONS são usados só por estas rotas → moram aqui.
// ═══════════════════════════════════════════════════════════════════════════
'use strict';

const express = require('express');
const sanitizeHtml = require('sanitize-html');
// #3 (fix): require desestruturado do server.js que passou batido na extração
// (rodada 3) — usado nas rotas legais (consentimento/termos/política/cookies).
const { logAudit, AUDIT_OPERATIONS } = require('../utils/audit');

module.exports = function createContentRoutes({ db, authenticateToken, requireAdmin, requireSuperAdmin, optionalAuth, logActivity }) {
  const router = express.Router();

  // Guard de permissão legal (LGPD) — movido do server.js (usado só por estas rotas).
  const requireLegalPermission = (tipo) => (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Não autenticado' });
    const { role, permissoes_legais } = req.user;
    if (role === 'superadmin') return next();
    if (role === 'admin' && permissoes_legais && permissoes_legais[tipo] === true) return next();
    return res.status(403).json({ error: 'Sem permissão para esta operação' });
  };

// ============================================================
// FEEDBACK
// ============================================================

// POST /api/feedback — usuário envia um feedback
router.post('/api/feedback', authenticateToken, async (req, res) => {
  try {
    const { categoria, descricao, imagemBase64, linkVideo, pagina } = req.body;

    if (!categoria || !['duvida', 'melhoria', 'sugestao', 'critica'].includes(categoria)) {
      return res.status(400).json({ success: false, error: 'Categoria inválida.' });
    }
    if (!descricao || descricao.trim().length < 20) {
      return res.status(400).json({ success: false, error: 'Descrição deve ter pelo menos 20 caracteres.' });
    }
    if (descricao.trim().length > 1000) {
      return res.status(400).json({ success: false, error: 'Descrição deve ter no máximo 1000 caracteres.' });
    }
    if (linkVideo && linkVideo.trim()) {
      const l = linkVideo.toLowerCase();
      if (!l.includes('drive.google.com') && !l.includes('docs.google.com')) {
        return res.status(400).json({ success: false, error: 'Link de vídeo deve ser do Google Drive.' });
      }
    }

    const feedback = await db.criarFeedback({
      usuarioId: req.user.id,
      categoria,
      descricao: descricao.trim(),
      imagemBase64: imagemBase64 || null,
      linkVideo: linkVideo?.trim() || null,
      pagina: pagina || null,
    });

    await logActivity(req, { action: 'create', moduleKey: 'feedback', entityType: 'feedback', entityId: feedback.id, details: { categoria } });

    res.status(201).json({ success: true, data: feedback });
  } catch (error) {
    console.error('Erro ao criar feedback:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/admin/feedbacks — listar todos (admin + superadmin)
router.get('/api/admin/feedbacks', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const feedbacks = await db.obterFeedbacks();
    res.json({ success: true, data: feedbacks });
  } catch (error) {
    console.error('Erro ao buscar feedbacks:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/admin/feedbacks/:id/responder — superadmin responde
router.post('/api/admin/feedbacks/:id/responder', authenticateToken, requireSuperAdmin, async (req, res) => {
  try {
    const { mensagem } = req.body;
    if (!mensagem || mensagem.trim().length < 10) {
      return res.status(400).json({ success: false, error: 'A mensagem deve ter pelo menos 10 caracteres.' });
    }

    const feedback = await db.obterFeedbackPorId(req.params.id);
    if (feedback.status !== 'pendente') {
      return res.status(400).json({ success: false, error: 'Este feedback já foi respondido ou aceito.' });
    }

    const atualizado = await db.responderFeedback(req.params.id, { resposta: mensagem.trim() });

    await logActivity(req, { action: 'update', moduleKey: 'feedback', entityType: 'feedback', entityId: req.params.id, details: { acao: 'responder' } });

    // Enviar email ao usuário
    if (process.env.SENDGRID_API_KEY && feedback.usuarioEmail) {
      try {
        const sgMail = require('@sendgrid/mail');
        sgMail.setApiKey(process.env.SENDGRID_API_KEY);
        const nomeUsuario = feedback.usuarioNome || feedback.usuarioEmail;
        await sgMail.send({
          to: feedback.usuarioEmail,
          from: { email: process.env.SENDGRID_FROM_EMAIL, name: process.env.SENDGRID_FROM_NAME || 'IMPGEO' },
          subject: 'Seu feedback foi respondido — IMPGEO',
          html: `
            <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;background:#fff;border-radius:8px;border:1px solid #e2e8f0;padding:32px;">
              <div style="text-align:center;margin-bottom:24px;">
                <h2 style="color:#1e293b;margin:0;">Seu feedback foi respondido</h2>
              </div>
              <p style="color:#475569;font-size:15px;line-height:1.6;">Olá <strong>${nomeUsuario}</strong>,</p>
              <p style="color:#475569;font-size:15px;line-height:1.6;">Nossa equipe analisou seu feedback e enviou uma resposta:</p>
              <div style="background:#f8fafc;border-left:4px solid #1d4ed8;border-radius:4px;padding:16px;margin:20px 0;">
                <p style="color:#1e293b;font-size:14px;margin:0;line-height:1.6;white-space:pre-wrap;">${mensagem.trim()}</p>
              </div>
              <p style="color:#64748b;font-size:13px;"><strong>Seu feedback original (${feedback.categoria}):</strong><br/>${feedback.descricao}</p>
              <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0;"/>
              <p style="color:#94a3b8;font-size:12px;text-align:center;">Este é um e-mail automático. Por favor, não responda.</p>
            </div>
          `,
        });
      } catch (sgError) {
        console.error('Erro ao enviar e-mail de resposta de feedback:', sgError?.response?.body || sgError);
      }
    }

    res.json({ success: true, data: atualizado });
  } catch (error) {
    console.error('Erro ao responder feedback:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/admin/feedbacks/:id/aceitar — superadmin aceita + notifica usuário
router.post('/api/admin/feedbacks/:id/aceitar', authenticateToken, requireSuperAdmin, async (req, res) => {
  try {
    const { mensagem } = req.body;
    if (!mensagem || mensagem.trim().length < 10) {
      return res.status(400).json({ success: false, error: 'A mensagem deve ter pelo menos 10 caracteres.' });
    }

    const feedback = await db.obterFeedbackPorId(req.params.id);
    if (feedback.status !== 'pendente') {
      return res.status(400).json({ success: false, error: 'Este feedback já foi respondido ou aceito.' });
    }

    const atualizado = await db.aceitarFeedback(req.params.id, { resposta: mensagem.trim() });

    await logActivity(req, { action: 'update', moduleKey: 'feedback', entityType: 'feedback', entityId: req.params.id, details: { acao: 'aceitar' } });

    // Enviar email ao usuário
    if (process.env.SENDGRID_API_KEY && feedback.usuarioEmail) {
      try {
        const sgMail = require('@sendgrid/mail');
        sgMail.setApiKey(process.env.SENDGRID_API_KEY);
        const nomeUsuario = feedback.usuarioNome || feedback.usuarioEmail;
        await sgMail.send({
          to: feedback.usuarioEmail,
          from: { email: process.env.SENDGRID_FROM_EMAIL, name: process.env.SENDGRID_FROM_NAME || 'IMPGEO' },
          subject: '✅ Seu feedback foi aceito — IMPGEO',
          html: `
            <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;background:#fff;border-radius:8px;border:1px solid #e2e8f0;padding:32px;">
              <div style="text-align:center;margin-bottom:24px;">
                <h2 style="color:#1e293b;margin:0;">Seu feedback foi aceito!</h2>
              </div>
              <p style="color:#475569;font-size:15px;line-height:1.6;">Olá <strong>${nomeUsuario}</strong>,</p>
              <p style="color:#475569;font-size:15px;line-height:1.6;">Ótima notícia! Sua sugestão foi analisada e <strong style="color:#16a34a;">aceita</strong> pela nossa equipe.</p>
              <div style="background:#f0fdf4;border-left:4px solid #16a34a;border-radius:4px;padding:16px;margin:20px 0;">
                <p style="color:#166534;font-size:14px;font-weight:bold;margin:0 0 8px 0;">Mensagem da equipe:</p>
                <p style="color:#1e293b;font-size:14px;margin:0;line-height:1.6;white-space:pre-wrap;">${mensagem.trim()}</p>
              </div>
              <p style="color:#64748b;font-size:13px;"><strong>Seu feedback original (${feedback.categoria}):</strong><br/>${feedback.descricao}</p>
              <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0;"/>
              <p style="color:#94a3b8;font-size:12px;text-align:center;">Este é um e-mail automático. Por favor, não responda.</p>
            </div>
          `,
        });
      } catch (sgError) {
        console.error('Erro ao enviar e-mail de aceite de feedback:', sgError?.response?.body || sgError);
      }
    }

    res.json({ success: true, data: atualizado });
  } catch (error) {
    console.error('Erro ao aceitar feedback:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ─── FAQ ──────────────────────────────────────────────────────────────────────

// GET /api/faq — auth opcional; filtra por visibilidade conforme role do usuário
router.get('/api/faq', optionalAuth, async (req, res) => {
  try {
    const userRole = req.user?.role || 'guest';
    const items = await db.obterFAQ(userRole);
    res.json({ success: true, data: items });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/admin/faq — todos os itens (admin + superadmin)
router.get('/api/admin/faq', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const items = await db.obterFAQAdmin();
    res.json({ success: true, data: items });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/admin/faq — criar novo item
router.post('/api/admin/faq', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { pergunta, resposta, visibility } = req.body;
    if (!pergunta || !pergunta.trim() || !resposta || !resposta.trim()) {
      return res.status(400).json({ success: false, error: 'Pergunta e resposta são obrigatórias' });
    }
    const item = await db.criarFAQ({ pergunta: pergunta.trim(), resposta: resposta.trim(), visibility: visibility || 'todos' });
    await logActivity(req, { action: 'create', moduleKey: 'faq', entityType: 'FAQ', entityId: item.id, details: { pergunta: item.pergunta } });
    res.status(201).json({ success: true, data: item });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// PUT /api/admin/faq/ordem — atualizar ordem em lote (deve vir ANTES de /:id)
router.put('/api/admin/faq/ordem', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { faqIds } = req.body;
    if (!Array.isArray(faqIds)) {
      return res.status(400).json({ success: false, error: 'faqIds deve ser um array' });
    }
    await db.atualizarOrdemFAQ(faqIds);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// PUT /api/admin/faq/:id — atualizar item
router.put('/api/admin/faq/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const item = await db.atualizarFAQ(req.params.id, req.body);
    await logActivity(req, { action: 'update', moduleKey: 'faq', entityType: 'FAQ', entityId: req.params.id, details: req.body });
    res.json({ success: true, data: item });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// DELETE /api/admin/faq/:id — deletar item
router.delete('/api/admin/faq/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const item = await db.deletarFAQ(req.params.id);
    await logActivity(req, { action: 'delete', moduleKey: 'faq', entityType: 'FAQ', entityId: req.params.id, details: { pergunta: item.pergunta } });
    res.json({ success: true, data: item });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ─── LEGAL (LGPD) ─────────────────────────────────────────────────────────────

const SANITIZE_OPTIONS = {
  allowedTags: sanitizeHtml.defaults.allowedTags.concat(['h1', 'h2', 'h3', 'u', 's', 'img']),
  allowedAttributes: { '*': ['class', 'style'], 'a': ['href', 'target'], 'img': ['src', 'alt'] },
};

// Rotas públicas
router.get('/api/termos-uso', async (req, res) => {
  try {
    const data = await db.obterTermosUso();
    res.json({ success: true, data });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

router.get('/api/politica-privacidade', async (req, res) => {
  try {
    const data = await db.obterPoliticaPrivacidade();
    res.json({ success: true, data });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

router.get('/api/cookie-banner-config', async (req, res) => {
  try {
    const data = await db.obterCookieBannerConfig();
    res.json({ success: true, data });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

router.get('/api/cookie-categorias', async (req, res) => {
  try {
    const data = await db.obterCookieCategorias(true);
    res.json({ success: true, data });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// Consentimento (usuário autenticado)
router.get('/api/cookie-consentimento', authenticateToken, async (req, res) => {
  try {
    const data = await db.obterConsentimentoUsuario(req.user.id);
    res.json({ success: true, data });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

router.post('/api/cookie-consentimento', authenticateToken, async (req, res) => {
  try {
    const { preferencias, versaoTermos = 1, versaoPolitica = 1 } = req.body;
    if (!preferencias || typeof preferencias !== 'object') {
      return res.status(400).json({ success: false, error: 'Preferências inválidas' });
    }
    const safePrefs = {};
    for (const [k, v] of Object.entries(preferencias)) {
      if (typeof v === 'boolean') safePrefs[k] = v;
    }
    await db.salvarConsentimentoUsuario(req.user.id, safePrefs, versaoTermos, versaoPolitica, req.ip, req.headers['user-agent']);
    await logAudit({ operation: AUDIT_OPERATIONS.LEGAL_CONSENTIMENTO_UPDATE, userId: req.user.id, username: req.user.username, ipAddress: req.ip, userAgent: req.headers['user-agent'], details: { preferencias: safePrefs } });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// Rotas admin — Termos de Uso
router.get('/api/admin/termos-uso', authenticateToken, requireLegalPermission('termos_uso'), async (req, res) => {
  try {
    const data = await db.obterTermosUsoAdmin();
    res.json({ success: true, data });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

router.put('/api/admin/termos-uso', authenticateToken, requireLegalPermission('termos_uso'), async (req, res) => {
  try {
    const { conteudo } = req.body;
    if (!conteudo || typeof conteudo !== 'string') return res.status(400).json({ success: false, error: 'Conteúdo obrigatório' });
    if (conteudo.length > 100000) return res.status(400).json({ success: false, error: 'Conteúdo muito longo' });
    const clean = sanitizeHtml(conteudo, SANITIZE_OPTIONS);
    const data = await db.atualizarTermosUso(clean, req.user.id);
    await logAudit({ operation: AUDIT_OPERATIONS.LEGAL_TERMOS_UPDATE, userId: req.user.id, username: req.user.username, ipAddress: req.ip, userAgent: req.headers['user-agent'], details: { versao: data.versao } });
    res.json({ success: true, data });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// Rotas admin — Política de Privacidade
router.get('/api/admin/politica-privacidade', authenticateToken, requireLegalPermission('politica_privacidade'), async (req, res) => {
  try {
    const data = await db.obterPoliticaPrivacidadeAdmin();
    res.json({ success: true, data });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

router.put('/api/admin/politica-privacidade', authenticateToken, requireLegalPermission('politica_privacidade'), async (req, res) => {
  try {
    const { conteudo } = req.body;
    if (!conteudo || typeof conteudo !== 'string') return res.status(400).json({ success: false, error: 'Conteúdo obrigatório' });
    if (conteudo.length > 100000) return res.status(400).json({ success: false, error: 'Conteúdo muito longo' });
    const clean = sanitizeHtml(conteudo, SANITIZE_OPTIONS);
    const data = await db.atualizarPoliticaPrivacidade(clean, req.user.id);
    await logAudit({ operation: AUDIT_OPERATIONS.LEGAL_POLITICA_UPDATE, userId: req.user.id, username: req.user.username, ipAddress: req.ip, userAgent: req.headers['user-agent'], details: { versao: data.versao } });
    res.json({ success: true, data });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// Rotas admin — Cookie Banner Config
router.get('/api/admin/cookie-banner-config', authenticateToken, requireLegalPermission('cookies'), async (req, res) => {
  try {
    const data = await db.obterCookieBannerConfig();
    res.json({ success: true, data });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

router.put('/api/admin/cookie-banner-config', authenticateToken, requireLegalPermission('cookies'), async (req, res) => {
  try {
    const { titulo, texto, textoBotaoAceitar, textoBotaoRejeitar, textoBotaoPersonalizar, textoDescricaoGerenciamento } = req.body;
    if (!titulo || !texto) return res.status(400).json({ success: false, error: 'Título e texto são obrigatórios' });
    const data = await db.atualizarCookieBannerConfig({ titulo, texto, textoBotaoAceitar, textoBotaoRejeitar, textoBotaoPersonalizar, textoDescricaoGerenciamento });
    await logAudit({ operation: AUDIT_OPERATIONS.LEGAL_COOKIES_CONFIG_UPDATE, userId: req.user.id, username: req.user.username, ipAddress: req.ip, userAgent: req.headers['user-agent'], details: {} });
    res.json({ success: true, data });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// Rotas admin — Cookie Categorias
router.get('/api/admin/cookie-categorias', authenticateToken, requireLegalPermission('cookies'), async (req, res) => {
  try {
    const data = await db.obterCookieCategorias(false);
    res.json({ success: true, data });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

router.post('/api/admin/cookie-categorias', authenticateToken, requireLegalPermission('cookies'), async (req, res) => {
  try {
    const { chave, nome, descricao, ativo, obrigatorio, ordem } = req.body;
    if (!chave || !nome || !descricao) return res.status(400).json({ success: false, error: 'Chave, nome e descrição são obrigatórios' });
    const data = await db.criarCookieCategoria({ chave, nome, descricao, ativo, obrigatorio, ordem });
    await logAudit({ operation: AUDIT_OPERATIONS.LEGAL_COOKIES_CATEGORIA_CREATE, userId: req.user.id, username: req.user.username, ipAddress: req.ip, userAgent: req.headers['user-agent'], details: { chave } });
    res.status(201).json({ success: true, data });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

router.put('/api/admin/cookie-categorias/:id', authenticateToken, requireLegalPermission('cookies'), async (req, res) => {
  try {
    const data = await db.atualizarCookieCategoria(req.params.id, req.body);
    await logAudit({ operation: AUDIT_OPERATIONS.LEGAL_COOKIES_CATEGORIA_UPDATE, userId: req.user.id, username: req.user.username, ipAddress: req.ip, userAgent: req.headers['user-agent'], details: { id: req.params.id } });
    res.json({ success: true, data });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

router.delete('/api/admin/cookie-categorias/:id', authenticateToken, requireLegalPermission('cookies'), async (req, res) => {
  try {
    await db.deletarCookieCategoria(req.params.id);
    await logAudit({ operation: AUDIT_OPERATIONS.LEGAL_COOKIES_CATEGORIA_DELETE, userId: req.user.id, username: req.user.username, ipAddress: req.ip, userAgent: req.headers['user-agent'], details: { id: req.params.id } });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// Rota superadmin — Permissões Legais por usuário
router.get('/api/admin/permissoes-legais/:userId', authenticateToken, requireSuperAdmin, async (req, res) => {
  try {
    const data = await db.obterPermissoesLegais(req.params.userId);
    res.json({ success: true, data });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

router.put('/api/admin/permissoes-legais/:userId', authenticateToken, requireSuperAdmin, async (req, res) => {
  try {
    const { permissoes } = req.body;
    if (!permissoes || typeof permissoes !== 'object') return res.status(400).json({ success: false, error: 'Permissões inválidas' });
    const data = await db.atualizarPermissoesLegais(req.params.userId, permissoes);
    await logAudit({ operation: AUDIT_OPERATIONS.LEGAL_PERMISSAO_UPDATE, userId: req.user.id, username: req.user.username, ipAddress: req.ip, userAgent: req.headers['user-agent'], details: { targetUserId: req.params.userId, permissoes: data } });
    res.json({ success: true, data });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// ============================================================
// DOCUMENTAÇÃO
// ============================================================

router.get('/api/documentation/public', async (req, res) => {
  try {
    const data = await db.obterDocumentacao('guest');
    res.json({ success: true, data });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

router.get('/api/documentation', authenticateToken, async (req, res) => {
  try {
    const userRole = req.user?.role || 'guest';
    const data = await db.obterDocumentacao(userRole);
    res.json({ success: true, data });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

router.post('/api/admin/documentation/sections', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { title, visibility } = req.body;
    if (!title?.trim()) return res.status(400).json({ success: false, error: 'Título obrigatório' });
    const data = await db.criarDocSection({ title: title.trim(), visibility: visibility || 'todos' });
    res.json({ success: true, data });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

router.put('/api/admin/documentation/sections/reorder', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { ids } = req.body;
    if (!Array.isArray(ids)) return res.status(400).json({ success: false, error: 'ids deve ser um array' });
    await db.reordenarDocSections(ids);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

router.put('/api/admin/documentation/sections/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { title, visibility } = req.body;
    if (title !== undefined && !title?.trim()) return res.status(400).json({ success: false, error: 'Título não pode ser vazio' });
    const data = await db.atualizarDocSection(req.params.id, {
      title: title?.trim(),
      visibility: visibility,
    });
    res.json({ success: true, data });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

router.delete('/api/admin/documentation/sections/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    await db.deletarDocSection(req.params.id);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

router.post('/api/admin/documentation/sections/:sectionId/pages', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { title, content } = req.body;
    if (!title?.trim()) return res.status(400).json({ success: false, error: 'Título obrigatório' });
    const data = await db.criarDocPage(req.params.sectionId, { title: title.trim(), content: content || '' });
    res.json({ success: true, data });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

router.put('/api/admin/documentation/pages/reorder', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { ids } = req.body;
    if (!Array.isArray(ids)) return res.status(400).json({ success: false, error: 'ids deve ser um array' });
    await db.reordenarDocPages(ids);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

router.put('/api/admin/documentation/pages/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { title, content } = req.body;
    if (!title?.trim()) return res.status(400).json({ success: false, error: 'Título obrigatório' });
    const data = await db.atualizarDocPage(req.params.id, { title: title.trim(), content: content ?? '' });
    res.json({ success: true, data });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

router.delete('/api/admin/documentation/pages/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    await db.deletarDocPage(req.params.id);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// ========== ROTAS DO ROADMAP ==========

// Configurações do roadmap
router.get('/api/admin/roadmap/config', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const config = await db.getRoadmapConfig();
    res.json(config);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.put('/api/admin/roadmap/config', authenticateToken, requireSuperAdmin, async (req, res) => {
  try {
    const config = await db.updateRoadmapConfig(req.body);
    await logActivity(req, { action: 'update', moduleKey: 'roadmap', entityType: 'roadmap_config', entityId: config.id, details: req.body });
    res.json(config);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Colunas do roadmap
router.get('/api/admin/roadmap/colunas', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const colunas = await db.getRoadmapColunas();
    res.json(colunas);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/api/admin/roadmap/colunas', authenticateToken, requireSuperAdmin, async (req, res) => {
  try {
    const { label, cor, corFundo } = req.body;
    if (!label) return res.status(400).json({ error: 'Nome da coluna é obrigatório' });
    const coluna = await db.createRoadmapColuna({ label, cor, corFundo });
    await logActivity(req, { action: 'create', moduleKey: 'roadmap', entityType: 'roadmap_coluna', entityId: coluna.id, details: { label } });
    res.status(201).json(coluna);
  } catch (error) {
    console.error('[Roadmap] Erro ao criar coluna:', error);
    res.status(500).json({ error: error.message });
  }
});

router.put('/api/admin/roadmap/colunas/ordem', authenticateToken, requireSuperAdmin, async (req, res) => {
  try {
    const { colunas } = req.body;
    await db.updateRoadmapColunasOrdem(colunas);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.delete('/api/admin/roadmap/colunas/:id', authenticateToken, requireSuperAdmin, async (req, res) => {
  try {
    const result = await db.deleteRoadmapColuna(req.params.id);
    await logActivity(req, { action: 'delete', moduleKey: 'roadmap', entityType: 'roadmap_coluna', entityId: req.params.id, details: { label: result.label } });
    res.json({ success: true });
  } catch (error) {
    console.error('[Roadmap] Erro ao deletar coluna:', error);
    res.status(500).json({ error: error.message });
  }
});

// Listar todos os itens (admin + superadmin)
router.get('/api/admin/roadmap', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const items = await db.getRoadmapItems();
    res.json(items);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Criar item (superadmin only) — deve vir antes de /:id
router.post('/api/admin/roadmap', authenticateToken, requireSuperAdmin, async (req, res) => {
  try {
    const { titulo, descricao, status, prioridade, dataInicio, dependeDe } = req.body;
    if (!titulo) return res.status(400).json({ error: 'Título é obrigatório' });
    const item = await db.createRoadmapItem({
      titulo, descricao, status, prioridade, dataInicio, dependeDe,
      createdBy: req.user.id,
    });
    await logActivity(req, { action: 'create', moduleKey: 'roadmap', entityType: 'roadmap', entityId: item.id, details: { titulo } });
    res.status(201).json(item);
  } catch (error) {
    console.error('[Roadmap] Erro ao criar item:', error);
    res.status(500).json({ error: error.message });
  }
});

// Atualizar ordem em lote (superadmin only) — deve vir antes de /:id
router.put('/api/admin/roadmap/ordem', authenticateToken, requireSuperAdmin, async (req, res) => {
  try {
    const { itens } = req.body;
    if (!Array.isArray(itens)) return res.status(400).json({ error: 'itens deve ser um array' });
    await db.updateRoadmapOrdem(itens);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Buscar item por ID (admin + superadmin)
router.get('/api/admin/roadmap/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const item = await db.getRoadmapItemById(req.params.id);
    if (!item) return res.status(404).json({ error: 'Item não encontrado' });
    res.json(item);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Atualizar item (superadmin only)
router.put('/api/admin/roadmap/:id', authenticateToken, requireSuperAdmin, async (req, res) => {
  try {
    const item = await db.updateRoadmapItem(req.params.id, req.body);
    await logActivity(req, { action: 'update', moduleKey: 'roadmap', entityType: 'roadmap', entityId: req.params.id, details: req.body });
    res.json(item);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Mudar status (superadmin only)
router.put('/api/admin/roadmap/:id/status', authenticateToken, requireSuperAdmin, async (req, res) => {
  try {
    const { status } = req.body;
    if (!status) return res.status(400).json({ error: 'Status é obrigatório' });
    const item = await db.updateRoadmapItemStatus(req.params.id, status);
    res.json(item);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Deletar item (superadmin only)
router.delete('/api/admin/roadmap/:id', authenticateToken, requireSuperAdmin, async (req, res) => {
  try {
    const item = await db.deleteRoadmapItem(req.params.id);
    await logActivity(req, { action: 'delete', moduleKey: 'roadmap', entityType: 'roadmap', entityId: req.params.id, details: { titulo: item.titulo } });
    res.json(item);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Iniciar timer (superadmin only)
router.post('/api/admin/roadmap/:id/iniciar-tempo', authenticateToken, requireSuperAdmin, async (req, res) => {
  try {
    const item = await db.iniciarTempoRoadmap(req.params.id);
    res.json(item);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Pausar timer (superadmin only)
router.post('/api/admin/roadmap/:id/pausar-tempo', authenticateToken, requireSuperAdmin, async (req, res) => {
  try {
    const item = await db.pausarTempoRoadmap(req.params.id);
    res.json(item);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Parar timer (superadmin only)
router.post('/api/admin/roadmap/:id/parar-tempo', authenticateToken, requireSuperAdmin, async (req, res) => {
  try {
    const { tempoDecorrido } = req.body;
    const item = await db.pararTempoRoadmap(req.params.id, tempoDecorrido);
    res.json(item);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ─── RODAPÉ ──────────────────────────────────────────────────────────────────

// Pública: retorna dados do rodapé para o componente Footer
router.get('/api/rodape', optionalAuth, async (req, res) => {
  try {
    const data = await db.obterRodapeCompleto();
    res.json({ success: true, data });
  } catch (err) {
    res.json({ success: true, data: { configuracoes: {}, colunas: [], bottomLinks: [] } });
  }
});

// Admin: dados completos para o painel
router.get('/api/admin/rodape', authenticateToken, requireSuperAdmin, async (req, res) => {
  try {
    const data = await db.obterRodapeCompleto();
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Config: salvar chave/valor
router.put('/api/admin/rodape/config/:chave', authenticateToken, requireSuperAdmin, async (req, res) => {
  try {
    const { chave } = req.params;
    const { valor } = req.body;
    await db.atualizarRodapeConfig(chave, valor);
    await logActivity(req, { action: 'UPDATE', entity: 'rodape_config', details: `chave=${chave}` });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Colunas
router.get('/api/admin/rodape/colunas', authenticateToken, requireSuperAdmin, async (req, res) => {
  try {
    const colunas = await db.obterRodapeColunas();
    res.json({ success: true, data: colunas });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/api/admin/rodape/colunas', authenticateToken, requireSuperAdmin, async (req, res) => {
  try {
    const { titulo } = req.body;
    if (!titulo?.trim()) return res.status(400).json({ success: false, error: 'Título obrigatório.' });
    const coluna = await db.criarRodapeColuna(titulo.trim());
    await logActivity(req, { action: 'CREATE', entity: 'rodape_coluna', details: titulo });
    res.json({ success: true, data: coluna });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.put('/api/admin/rodape/colunas/ordem', authenticateToken, requireSuperAdmin, async (req, res) => {
  try {
    const { colunaIds } = req.body;
    if (!Array.isArray(colunaIds)) return res.status(400).json({ success: false, error: 'colunaIds deve ser um array.' });
    await db.atualizarOrdemColunas(colunaIds);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.put('/api/admin/rodape/colunas/:id', authenticateToken, requireSuperAdmin, async (req, res) => {
  try {
    const { titulo } = req.body;
    const coluna = await db.atualizarRodapeColuna(req.params.id, titulo);
    await logActivity(req, { action: 'UPDATE', entity: 'rodape_coluna', details: req.params.id });
    res.json({ success: true, data: coluna });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.delete('/api/admin/rodape/colunas/:id', authenticateToken, requireSuperAdmin, async (req, res) => {
  try {
    await db.deletarRodapeColuna(req.params.id);
    await logActivity(req, { action: 'DELETE', entity: 'rodape_coluna', details: req.params.id });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Links
router.post('/api/admin/rodape/links', authenticateToken, requireSuperAdmin, async (req, res) => {
  try {
    const { coluna_id, texto, link, eh_link } = req.body;
    if (!texto?.trim()) return res.status(400).json({ success: false, error: 'Texto obrigatório.' });
    const saved = await db.criarRodapeLink({ coluna_id, texto: texto.trim(), link: link || '', eh_link });
    await logActivity(req, { action: 'CREATE', entity: 'rodape_link', details: texto });
    res.json({ success: true, data: saved });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.put('/api/admin/rodape/links/ordem', authenticateToken, requireSuperAdmin, async (req, res) => {
  try {
    const { linkIds } = req.body;
    if (!Array.isArray(linkIds)) return res.status(400).json({ success: false, error: 'linkIds deve ser um array.' });
    await db.atualizarOrdemLinks(linkIds);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.put('/api/admin/rodape/links/:id', authenticateToken, requireSuperAdmin, async (req, res) => {
  try {
    const { texto, link, eh_link, coluna_id } = req.body;
    const saved = await db.atualizarRodapeLink(req.params.id, { texto, link, eh_link, coluna_id });
    await logActivity(req, { action: 'UPDATE', entity: 'rodape_link', details: req.params.id });
    res.json({ success: true, data: saved });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.delete('/api/admin/rodape/links/:id', authenticateToken, requireSuperAdmin, async (req, res) => {
  try {
    await db.deletarRodapeLink(req.params.id);
    await logActivity(req, { action: 'DELETE', entity: 'rodape_link', details: req.params.id });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Bottom links
router.get('/api/admin/rodape/bottom-links', authenticateToken, requireSuperAdmin, async (req, res) => {
  try {
    const data = await db.obterRodapeBottomLinksAdmin();
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/api/admin/rodape/bottom-links', authenticateToken, requireSuperAdmin, async (req, res) => {
  try {
    const { texto, link, ativo } = req.body;
    if (!texto?.trim()) return res.status(400).json({ success: false, error: 'Texto obrigatório.' });
    const saved = await db.criarRodapeBottomLink({ texto: texto.trim(), link: link || '', ativo });
    res.json({ success: true, data: saved });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.put('/api/admin/rodape/bottom-links/ordem', authenticateToken, requireSuperAdmin, async (req, res) => {
  try {
    const { linkIds } = req.body;
    if (!Array.isArray(linkIds)) return res.status(400).json({ success: false, error: 'linkIds deve ser um array.' });
    await db.atualizarOrdemBottomLinks(linkIds);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.put('/api/admin/rodape/bottom-links/:id', authenticateToken, requireSuperAdmin, async (req, res) => {
  try {
    const { texto, link, ativo } = req.body;
    const saved = await db.atualizarRodapeBottomLink(req.params.id, { texto, link, ativo });
    res.json({ success: true, data: saved });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.delete('/api/admin/rodape/bottom-links/:id', authenticateToken, requireSuperAdmin, async (req, res) => {
  try {
    await db.deletarRodapeBottomLink(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Commits pendentes (fila completa para o superadmin processar em carrossel)
router.get('/api/admin/rodape/commits-pendentes', authenticateToken, requireSuperAdmin, async (req, res) => {
  try {
    const data = await db.obterCommitsPendentes();
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/api/admin/rodape/confirmar-commit', authenticateToken, requireSuperAdmin, async (req, res) => {
  try {
    const { action, novaVersao, mensagem, data, commitHash, rolesNotificados, manterSessionId } = req.body;
    if (!['manter', 'nova_versao', 'ignorar'].includes(action)) {
      return res.status(400).json({ success: false, error: 'action inválido.' });
    }
    if (action !== 'ignorar' && !mensagem?.trim()) {
      return res.status(400).json({ success: false, error: 'mensagem obrigatória.' });
    }
    await db.confirmarCommit({
      action, novaVersao, mensagem, data, commitHash,
      rolesNotificados: rolesNotificados || [],
      manterSessionId,
    });
    await logActivity(req, { action: 'UPDATE', entity: 'rodape_commit', details: `action=${action}` });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Notificação de nova versão
router.get('/api/notificacao-versao', authenticateToken, async (req, res) => {
  try {
    const data = await db.obterNotificacaoVersao(req.user.id, req.user.role);
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/api/notificacao-versao/vista', authenticateToken, async (req, res) => {
  try {
    const { versao } = req.body;
    if (!versao) return res.status(400).json({ success: false, error: 'versao obrigatória.' });
    await db.marcarVersaoVista(req.user.id, versao);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

  return router;
};
