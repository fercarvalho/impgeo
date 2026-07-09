// ═══════════════════════════════════════════════════════════════════════════
// server/routes/tc-auth.js
// Portal do tc_user externo do TerraControl (/api/tc-auth/*): login/refresh/
// logout, recuperação de senha, perfil, notificações/push/prefs, CRUD dos
// próprios registros, orçamentos (aceite/revisão/PIX), share-links e o webhook
// da AbacatePay. Extraídas de server.js (#3) — comportamento idêntico.
//
// tcRequestContext / setTcAuthCookies / clearTcAuthCookies ficam definidos no
// server.js (compartilhados com os logins TC do cluster de auth) e chegam por
// injeção. tcAuth aqui é o módulo de serviço (../auth/tc-auth), não este arquivo.
// ═══════════════════════════════════════════════════════════════════════════
'use strict';

const express = require('express');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const tcAuth = require('../auth/tc-auth');
const abacatepay = require('../services/abacatepay');
const push = require('../services/push');
const pushDispatcher = require('../services/push-dispatcher');

module.exports = function createTcAuthRoutes({
  db, budgetService, budgetDispatcher,
  setTcAuthCookies, clearTcAuthCookies, tcRequestContext,
  loginLimiter, passwordRecoveryLimiter, passwordResetLimiter, passwordTokenValidationLimiter,
  upload, uploadAvatar, uploadDocument, slugify,
}) {
  const router = express.Router();

// POST /api/tc-auth/login — login do tc_user externo
router.post('/api/tc-auth/login', loginLimiter, async (req, res) => {
  try {
    const { username, password } = req.body || {};
    if (!username || !password) {
      return res.status(400).json({ success: false, error: 'Usuário e senha são obrigatórios' });
    }
    const ctx = tcRequestContext(req);
    const result = await tcAuth.loginTcUser(db, { username, password, ...ctx });
    if (!result.ok) {
      // F2.2: encaminha 'code' e 'email' para o frontend disparar reenvio
      // automaticamente quando for caso de convite expirado/pendente.
      const payload = { success: false, error: result.error };
      if (result.code) payload.code = result.code;
      if (result.email) payload.email = result.email;
      return res.status(result.status).json(payload);
    }
    // PR #2 (PWA): emite cookies httpOnly em .terracontrol.* além de manter
    // tokens no body (legacyTokenInBody) por 1 release pra rollback seguro
    // caso o cliente novo (TcAuthContext + tcApi) tenha algum bug em prod.
    setTcAuthCookies(req, res, result.accessToken, result.refreshToken);
    res.json({
      success: true,
      token: result.accessToken,
      refreshToken: result.refreshToken,
      tcUser: result.tcUser,
      forcePasswordChange: result.forcePasswordChange,
      legacyTokenInBody: true,
    });
  } catch (error) {
    console.error('Erro em /api/tc-auth/login:', error);
    res.status(500).json({ success: false, error: 'Erro interno do servidor' });
  }
});

// POST /api/tc-auth/refresh — rotação de refresh token
// PR #2 (PWA): aceita refresh tanto via cookie tcRefreshToken (cliente novo)
// quanto via body (cliente legado/rollback).
router.post('/api/tc-auth/refresh', async (req, res) => {
  try {
    const refreshToken = req.cookies?.tcRefreshToken || req.body?.refreshToken;
    if (!refreshToken) {
      return res.status(400).json({ success: false, error: 'Refresh token obrigatório' });
    }
    const ctx = tcRequestContext(req);
    const result = await tcAuth.rotateTcRefreshToken(db, { refreshToken, ...ctx });
    setTcAuthCookies(req, res, result.accessToken, result.refreshToken);
    res.json({
      success: true,
      token: result.accessToken,
      refreshToken: result.refreshToken,
      tcUser: tcAuth.sanitizeTcUser(result.tcUser),
      legacyTokenInBody: true,
    });
  } catch (error) {
    res.status(401).json({ success: false, error: error.message || 'Falha ao renovar sessão' });
  }
});

// POST /api/tc-auth/logout — revoga refresh + limpa cookies httpOnly
router.post('/api/tc-auth/logout', tcAuth.authenticateTcUser, async (req, res) => {
  try {
    const refreshToken = req.cookies?.tcRefreshToken || req.body?.refreshToken;
    await tcAuth.logoutTcUser(db, refreshToken);
    clearTcAuthCookies(req, res);
    res.json({ success: true });
  } catch (error) {
    clearTcAuthCookies(req, res);
    res.status(500).json({ success: false, error: 'Erro ao fazer logout' });
  }
});

// POST /api/tc-auth/recuperar-senha — dispara email com link de reset
router.post('/api/tc-auth/recuperar-senha', passwordRecoveryLimiter, async (req, res) => {
  try {
    const { email, username } = req.body || {};
    if (!email && !username) {
      return res.status(400).json({ success: false, error: 'Informe email ou usuário' });
    }
    // Resposta sempre genérica (não revela se conta existe)
    const respGenerica = { success: true, message: 'Se a conta existir, enviaremos um email com instruções.' };
    let user = null;
    if (email)    user = await db.getTcUserByEmail(email);
    if (!user && username) user = await db.getTcUserByUsername(username);
    if (!user || !user.email || !user.is_active) return res.json(respGenerica);

    const { token: resetToken } = await db.createTcPasswordResetToken({ tcUserId: user.id, ttlMinutes: 60 });
    const tcPublicBase = process.env.TC_PUBLIC_BASE_URL
      || (process.env.NODE_ENV === 'production' ? 'https://terracontrol.com.br' : `${req.protocol}://${req.get('host')}`);
    const resetUrl = `${tcPublicBase.replace(/\/$/, '')}/?reset=${encodeURIComponent(resetToken)}`;

    try {
      const { enviarEmailTcResetSenha } = require('../services/email');
      await enviarEmailTcResetSenha({ toEmail: user.email, username: user.username, resetUrl, expiresMinutes: 60 });
    } catch (emailErr) {
      console.error('Falha ao enviar email de reset tc_user:', emailErr?.message || emailErr);
      // não revela falha de email pro cliente
    }
    res.json(respGenerica);
  } catch (error) {
    console.error('Erro em /api/tc-auth/recuperar-senha:', error);
    res.status(500).json({ success: false, error: 'Erro interno' });
  }
});

// GET /api/tc-auth/validar-token/:token — valida token de reset antes do form
router.get('/api/tc-auth/validar-token/:token', passwordTokenValidationLimiter, async (req, res) => {
  try {
    const row = await db.validateTcPasswordResetToken(req.params.token);
    if (!row) return res.status(400).json({ success: false, valid: false, error: 'Token inválido ou expirado' });
    res.json({ success: true, valid: true, username: row.username });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Erro interno' });
  }
});

// POST /api/tc-auth/resetar-senha — troca senha com token
router.post('/api/tc-auth/resetar-senha', passwordResetLimiter, async (req, res) => {
  try {
    const { token, novaSenha } = req.body || {};
    if (!token || !novaSenha) {
      return res.status(400).json({ success: false, error: 'Token e nova senha são obrigatórios' });
    }
    if (String(novaSenha).length < 6) {
      return res.status(400).json({ success: false, error: 'Senha deve ter pelo menos 6 caracteres' });
    }
    const newHash = await bcrypt.hash(String(novaSenha), 10);
    const result = await db.useTcPasswordResetToken(token, newHash);
    if (!result) return res.status(400).json({ success: false, error: 'Token inválido ou expirado' });
    // Revoga todas as sessões ativas (segurança)
    await db.revokeAllTcRefreshTokens(result.tcUserId);
    res.json({ success: true, message: 'Senha redefinida com sucesso. Faça login novamente.' });
  } catch (error) {
    console.error('Erro em /api/tc-auth/resetar-senha:', error);
    res.status(500).json({ success: false, error: 'Erro interno' });
  }
});

// GET /api/tc-auth/me — perfil completo do tc_user logado
router.get('/api/tc-auth/me', tcAuth.authenticateTcUser, async (req, res) => {
  try {
    const user = await db.getTcUserById(req.tcUser.id);
    if (!user) return res.status(404).json({ success: false, error: 'Usuário não encontrado' });
    res.json({ success: true, data: tcAuth.sanitizeTcUser(user) });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Erro interno' });
  }
});

// PUT /api/tc-auth/me — edita perfil (NÃO inclui senha/username — endpoints próprios)
// D2.7: se o campo email for alterado, exigimos currentPassword no payload e
// validamos contra o hash atual antes de salvar. Outros campos não exigem.
router.put('/api/tc-auth/me', tcAuth.authenticateTcUser, async (req, res) => {
  try {
    const allowedFields = ['firstName', 'lastName', 'email', 'phone', 'cpf', 'birthDate', 'gender', 'address', 'photoUrl'];
    const updates = {};
    for (const k of allowedFields) {
      if (Object.prototype.hasOwnProperty.call(req.body || {}, k)) updates[k] = req.body[k];
    }
    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ success: false, error: 'Nenhum campo fornecido' });
    }
    // Se email mudou: exige senha atual + checa colisão com outro tc_user
    if (Object.prototype.hasOwnProperty.call(updates, 'email')) {
      const tcUserFull = await db.getTcUserById(req.tcUser.id);
      const currentEmail = (tcUserFull?.email || '').toLowerCase();
      const newEmail = (updates.email || '').toLowerCase();
      if (newEmail !== currentEmail) {
        const { currentPassword } = req.body || {};
        if (!currentPassword) {
          return res.status(400).json({ success: false, error: 'Confirme com sua senha atual para alterar o email' });
        }
        const passwordOk = await bcrypt.compare(String(currentPassword), tcUserFull.password);
        if (!passwordOk) {
          return res.status(401).json({ success: false, error: 'Senha incorreta' });
        }
        if (newEmail) {
          const existing = await db.getTcUserByEmail(newEmail);
          if (existing && existing.id !== req.tcUser.id) {
            return res.status(409).json({ success: false, error: 'Este email já está em uso' });
          }
        }
      }
    }
    const updated = await db.updateTcUser(req.tcUser.id, updates);
    res.json({ success: true, data: tcAuth.sanitizeTcUser(updated) });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message || 'Erro interno' });
  }
});

// PATCH /api/tc-auth/me/preferences — toggle leve de preferências do tc_user.
// Hoje só atende emailNotifications (opt-out de emails de eventos do TC).
// NÃO afeta emails transacionais críticos (reset de senha, convite) — esses
// sempre disparam.
router.patch('/api/tc-auth/me/preferences', tcAuth.authenticateTcUser, async (req, res) => {
  try {
    const allowed = ['emailNotifications'];
    const prefs = {};
    for (const key of allowed) {
      if (Object.prototype.hasOwnProperty.call(req.body || {}, key)) {
        prefs[key] = req.body[key];
      }
    }
    const updated = await db.updateTcUserPreferences(req.tcUser.id, prefs);
    if (!updated) return res.status(404).json({ success: false, error: 'tc_user não encontrado' });
    res.json({ success: true, data: tcAuth.sanitizeTcUser(updated) });
  } catch (error) {
    console.error('PATCH /api/tc-auth/me/preferences:', error);
    res.status(500).json({ success: false, error: 'Erro ao atualizar preferências' });
  }
});

// PUT /api/tc-auth/me/password — troca senha (exige senha atual)
router.put('/api/tc-auth/me/password', tcAuth.authenticateTcUser, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body || {};
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ success: false, error: 'Senha atual e nova são obrigatórias' });
    }
    if (String(newPassword).length < 6) {
      return res.status(400).json({ success: false, error: 'Nova senha deve ter pelo menos 6 caracteres' });
    }
    const user = await db.getTcUserById(req.tcUser.id);
    if (!user) return res.status(404).json({ success: false, error: 'Usuário não encontrado' });
    const ok = await bcrypt.compare(String(currentPassword), user.password);
    if (!ok) return res.status(401).json({ success: false, error: 'Senha atual incorreta' });

    const newHash = await bcrypt.hash(String(newPassword), 10);
    await db.updateTcUser(req.tcUser.id, { password: newHash, forcePasswordChange: false });
    // Revoga sessões antigas (mantém só a atual via novo login após troca)
    await db.revokeAllTcRefreshTokens(req.tcUser.id);
    res.json({ success: true, message: 'Senha alterada com sucesso. Faça login novamente.' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message || 'Erro interno' });
  }
});

// PUT /api/tc-auth/me/username — troca username (exige senha)
router.put('/api/tc-auth/me/username', tcAuth.authenticateTcUser, async (req, res) => {
  try {
    const { password, newUsername } = req.body || {};
    if (!password || !newUsername) {
      return res.status(400).json({ success: false, error: 'Senha e novo usuário são obrigatórios' });
    }
    const normalized = String(newUsername).trim().toLowerCase();
    if (!/^[a-z0-9][a-z0-9-_]{2,}$/.test(normalized)) {
      return res.status(400).json({ success: false, error: 'Usuário inválido: 3+ chars, apenas letras, números, hífens e underline' });
    }
    const user = await db.getTcUserById(req.tcUser.id);
    if (!user) return res.status(404).json({ success: false, error: 'Usuário não encontrado' });
    const ok = await bcrypt.compare(String(password), user.password);
    if (!ok) return res.status(401).json({ success: false, error: 'Senha incorreta' });
    // Unicidade global (tc_users + users), excluindo o próprio tc_user.
    if (await db.findUsernameOwnerTable(normalized, { excludeTcUserId: req.tcUser.id })) {
      return res.status(409).json({ success: false, error: 'Este usuário já está em uso' });
    }
    const updated = await db.updateTcUser(req.tcUser.id, { username: normalized });
    res.json({ success: true, data: tcAuth.sanitizeTcUser(updated) });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message || 'Erro interno' });
  }
});

// POST /api/tc-auth/me/photo — upload de foto (reusa uploadAvatar do impgeo)
router.post('/api/tc-auth/me/photo', tcAuth.authenticateTcUser, uploadAvatar.single('photo'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, error: 'Nenhum arquivo enviado' });
    const photoUrl = `/api/avatars/${req.file.filename}`;
    await db.updateTcUser(req.tcUser.id, { photoUrl });
    res.json({ success: true, data: { photoUrl } });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message || 'Erro ao salvar foto' });
  }
});

// ===========================================================================
// Notificações in-app pra tc_users (espelha /api/notifications do impgeo)
// ===========================================================================

router.get('/api/tc-auth/notifications', tcAuth.authenticateTcUser, async (req, res) => {
  try {
    const onlyUnread = req.query.onlyUnread === 'true';
    const limit = parseInt(req.query.limit, 10) || 50;
    const notifs = await db.getTcNotificationsForUser(req.tcUser.id, { onlyUnread, limit });
    const unreadCount = await db.getUnreadTcNotificationCount(req.tcUser.id);
    res.json({ success: true, data: notifs, unreadCount });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.patch('/api/tc-auth/notifications/read-all', tcAuth.authenticateTcUser, async (req, res) => {
  try {
    await db.markAllTcNotificationsAsRead(req.tcUser.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.patch('/api/tc-auth/notifications/clear-all', tcAuth.authenticateTcUser, async (req, res) => {
  try {
    const cleared = await db.clearAllTcNotifications(req.tcUser.id);
    res.json({ success: true, cleared });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.delete('/api/tc-auth/notifications', tcAuth.authenticateTcUser, async (req, res) => {
  try {
    const onlyCleared = req.query.onlyCleared === 'true';
    const deleted = await db.deleteAllTcNotificationsForUser(req.tcUser.id, { onlyCleared });
    res.json({ success: true, deleted });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Rotas com :id depois das literais (read-all, clear-all)
// G10.2 — marca como lidas todas as notifs do tc_user sobre uma entidade.
// Body: { entity_type, entity_id }. Idempotente; retorna quantas foram afetadas.
// Front chama isso quando user abre/age sobre o entity (ex: TcBudgetViewScreen
// faz mount com budgetId → notifs daquele budget viram lidas sem precisar
// clicar no sininho).
router.patch('/api/tc-auth/notifications/read-by-entity', tcAuth.authenticateTcUser, async (req, res) => {
  try {
    const { entity_type, entity_id } = req.body || {};
    if (!entity_type || !entity_id) {
      return res.status(400).json({ success: false, error: 'entity_type e entity_id obrigatórios' });
    }
    const affected = await db.markTcNotificationsByEntityAsRead(req.tcUser.id, String(entity_type), entity_id);
    res.json({ success: true, data: { affected } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.patch('/api/tc-auth/notifications/:id/read', tcAuth.authenticateTcUser, async (req, res) => {
  try {
    const updated = await db.markTcNotificationAsRead(req.params.id, req.tcUser.id);
    res.json({ success: true, data: updated });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.patch('/api/tc-auth/notifications/:id/clear', tcAuth.authenticateTcUser, async (req, res) => {
  try {
    const updated = await db.clearTcNotification(req.params.id, req.tcUser.id);
    res.json({ success: true, data: updated });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.delete('/api/tc-auth/notifications/:id', tcAuth.authenticateTcUser, async (req, res) => {
  try {
    const deleted = await db.deleteTcNotification(req.params.id, req.tcUser.id);
    if (!deleted) return res.status(404).json({ success: false, error: 'Notificação não encontrada' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── Web Push: subscriptions e preferências (tc_users) ──────────────────
// Espelha /api/push/* + /api/notification-preferences mas usa o middleware
// tcAuth.authenticateTcUser (req.tcUser) e tabelas tc_push_subscriptions /
// tc_notification_preferences (scope='tc' nos helpers).
//
// Notar que app_id default pra tc_user é 'tc-public', mas mantemos a lista
// completa pra cobrir cenários futuros (tc_user com acesso a admin, etc).

router.get('/api/tc-auth/push/vapid-public-key', tcAuth.authenticateTcUser, async (req, res) => {
  if (!push.isConfigured()) {
    return res.status(503).json({ success: false, error: 'Web Push não configurado no servidor' });
  }
  res.json({ success: true, publicKey: push.getPublicKey() });
});

router.post('/api/tc-auth/push/subscribe', tcAuth.authenticateTcUser, async (req, res) => {
  try {
    const { endpoint, keys, app_id } = req.body || {};
    if (!endpoint || typeof endpoint !== 'string' || endpoint.length < 20) {
      return res.status(400).json({ success: false, error: 'endpoint inválido' });
    }
    if (!keys || typeof keys.p256dh !== 'string' || typeof keys.auth !== 'string') {
      return res.status(400).json({ success: false, error: 'keys.p256dh e keys.auth são obrigatórios' });
    }
    const ALLOWED_APP_IDS = ['impgeo', 'tc-public', 'tc-admin'];
    if (!ALLOWED_APP_IDS.includes(app_id)) {
      return res.status(400).json({ success: false, error: 'app_id deve ser impgeo, tc-public ou tc-admin' });
    }
    const userAgent = (req.headers['user-agent'] || '').slice(0, 500);
    const sub = await db.upsertPushSubscription('tc', req.tcUser.id, { endpoint, keys }, app_id, userAgent);
    res.json({ success: true, data: { id: sub.id, endpoint: sub.endpoint, app_id: sub.app_id } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.delete('/api/tc-auth/push/subscribe', tcAuth.authenticateTcUser, async (req, res) => {
  try {
    const { endpoint } = req.body || {};
    if (!endpoint || typeof endpoint !== 'string') {
      return res.status(400).json({ success: false, error: 'endpoint obrigatório' });
    }
    const removed = await db.deletePushSubscriptionByEndpoint('tc', req.tcUser.id, endpoint);
    res.json({ success: true, removed });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/api/tc-auth/notification-preferences', tcAuth.authenticateTcUser, async (req, res) => {
  try {
    const grid = await db.listNotificationPreferences('tc', req.tcUser.id);
    res.json({ success: true, data: grid });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.put('/api/tc-auth/notification-preferences', tcAuth.authenticateTcUser, async (req, res) => {
  try {
    const { notification_type, channel, enabled } = req.body || {};
    if (!notification_type || typeof notification_type !== 'string' || notification_type.length > 64) {
      return res.status(400).json({ success: false, error: 'notification_type inválido' });
    }
    if (channel !== 'push' && channel !== 'email') {
      return res.status(400).json({ success: false, error: 'channel deve ser "push" ou "email"' });
    }
    if (typeof enabled !== 'boolean') {
      return res.status(400).json({ success: false, error: 'enabled deve ser boolean' });
    }
    const pref = await db.setNotificationPreference('tc', req.tcUser.id, notification_type, channel, enabled);
    res.json({ success: true, data: pref });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/tc-auth/me/records — lista registros TerraControl que o tc_user pode ver
// Aceita ?onlyApproved=true pra esconder pendentes (default: todos)
router.get('/api/tc-auth/me/records', tcAuth.authenticateTcUser, async (req, res) => {
  try {
    const onlyApproved = req.query.onlyApproved === 'true';
    const records = await db.getTcUserRecords(req.tcUser.id, { onlyApproved });
    res.json({ success: true, data: records });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Erro ao listar registros' });
  }
});

// POST /api/tc-auth/me/records — tc_user cria registro próprio
// Força created_by_tc_user_id + approved=FALSE + grant em tc_user_record_access.
// Dispara notificação pra impgeo users com acesso ao módulo TerraControl.
router.post('/api/tc-auth/me/records', tcAuth.authenticateTcUser, async (req, res) => {
  try {
    const payload = req.body || {};
    if (!payload.imovel || !String(payload.imovel).trim()) {
      return res.status(400).json({ success: false, error: 'Nome do imóvel é obrigatório' });
    }
    if (!payload.municipio || !String(payload.municipio).trim()) {
      return res.status(400).json({ success: false, error: 'Município é obrigatório' });
    }
    if (!payload.mapaUrl && !payload.mapa_url) {
      return res.status(400).json({ success: false, error: 'Link do Google Maps é obrigatório' });
    }

    const created = await db.saveTerraControlAsTcUser(payload, req.tcUser.id);

    // Audit log (migration 041) — fire-and-forget, não trava criação
    db.appendRecordEvent({
      terracontrolId: created.id,
      eventType: 'created',
      actorType: 'tc',
      actorId: req.tcUser.id,
      payload: { imovel: created.imovel, municipio: created.municipio },
    });

    // Lockdown: registros novos ficam aguardando o admin enviar o orçamento.
    // tc_user não pode editar o cadastro até receber a primeira proposta.
    // Falha aqui não desfaz a criação — best-effort sincronizado.
    try {
      await budgetService.lockNewRecord(created.id);
      // Reflete o lock no objeto retornado pro front pular fetch extra
      created.budget_status = 'locked';
    } catch (lockErr) {
      console.error('[tc-records] Falha ao aplicar lockdown:', lockErr?.message);
    }

    // Dispara notificações pra impgeo users (fire-and-forget).
    // - Sino in-app: TODOS com acesso ao módulo (admin/superadmin ou
    //   user_module_permissions de 'terracontrol').
    // - Email: SÓ quem deu opt-in (users.tc_email_notifications = TRUE).
    //   Padrão é FALSE pra evitar spam — admin liga em "Meu perfil".
    (async () => {
      try {
        const impgeoUsers = await db.getImpgeoUsersWithTerraControlAccess();
        const tcName = [req.tcUser.firstName, req.tcUser.lastName].filter(Boolean).join(' ').trim()
          || req.tcUser.username
          || 'um usuário TerraControl';
        const adminUrl = process.env.IMPGEO_PUBLIC_URL
          ? `${process.env.IMPGEO_PUBLIC_URL}/?subsystem=especial&module=terracontrol&record=${created.id}`
          : undefined;
        const codImovel = created.cod_imovel != null ? created.cod_imovel : null;
        for (const u of impgeoUsers) {
          const userNotif = await db.createNotification({
            user_id: u.id,
            notification_type: 'tc_record_created',
            title: `${tcName} cadastrou um novo registro`,
            message: `${created.imovel} em ${created.municipio} — aguardando aprovação`,
            related_entity_type: 'terracontrol',
            related_entity_id: created.id,
          });
          pushDispatcher.send(db, 'impgeo', u.id, userNotif).catch(() => {});
          // Email opt-in (filtro feito aqui, query já trouxe a flag)
          if (u.tc_email_notifications === true && u.email) {
            const recipientName = [u.first_name, u.last_name].filter(Boolean).join(' ').trim()
              || u.username
              || 'usuário';
            enviarEmailImpgeoTcRecordCriado({
              toEmail: u.email,
              recipientName,
              tcUserName: tcName,
              imovel: created.imovel,
              municipio: created.municipio,
              codImovel,
              adminUrl,
            }).catch(e => console.error('[tc-records] Falha ao enviar email:', e?.message));
          }
        }
      } catch (notifErr) {
        console.error('[tc-records] Falha ao disparar notificações:', notifErr?.message);
      }
    })();

    res.json({ success: true, data: created });
  } catch (error) {
    console.error('Erro POST /api/tc-auth/me/records:', error);
    res.status(500).json({ success: false, error: error.message || 'Erro ao criar registro' });
  }
});

// PUT /api/tc-auth/me/records/:id — tc_user edita registro
// Permissão checada server-side via tcUserCanEditRecord.
//
// Lockdown (migration 040): se o registro está em ciclo de orçamento em
// estado que bloqueia edição (locked, awaiting_payment, paid), devolve 403
// com mensagem específica antes mesmo de tentar atualizar. Edição em
// budget.status === 'sent' é permitida MAS dispara revisão automática
// fire-and-forget no fim (admin é notificado pra reavaliar).
router.put('/api/tc-auth/me/records/:id', tcAuth.authenticateTcUser, async (req, res) => {
  try {
    const ok = await db.tcUserCanEditRecord(req.tcUser.id, req.params.id);
    if (!ok) {
      return res.status(403).json({ success: false, error: 'Você não tem permissão para editar este registro' });
    }

    // Pré-check de lockdown — bloqueia em estados sensíveis com mensagem dedicada.
    const existingBudget = await db.getBudgetByTerracontrolId(req.params.id);
    if (existingBudget) {
      const lockMessages = {
        locked: 'Aguardando envio do orçamento. Você poderá editar o cadastro assim que receber a primeira proposta.',
        awaiting_payment: 'Pagamento em andamento. Cancele ou conclua o pagamento antes de editar o cadastro.',
        paid: 'Imóvel já foi pago e aprovado. Para alterações, fale com o suporte.',
      };
      const msg = lockMessages[existingBudget.status];
      if (msg) {
        return res.status(403).json({ success: false, error: msg, code: `budget_${existingBudget.status}` });
      }
    }

    const updated = await db.updateTerraControlByTcUser(req.params.id, req.body || {});

    // G10.1: lista de chaves do body que o tc_user enviou. Usada tanto no
    // audit log quanto no email/notif de admins.
    const editedFieldKeys = Object.keys(req.body || {});

    // Audit log (migration 041) — fire-and-forget
    db.appendRecordEvent({
      terracontrolId: req.params.id,
      eventType: 'edited',
      actorType: 'tc',
      actorId: req.tcUser.id,
      payload: { fields: editedFieldKeys },
    });

    // G10.1 — notifica admins sobre a edição (in-app + push + email) APENAS
    // quando não há auto-revisão acontecendo (budget.status !== 'sent'). No
    // caso de 'sent', a notif de revisão automática (abaixo) já cobre o
    // aviso e duplicar deixaria a caixa de entrada poluída.
    const willTriggerAutoRevision = !!(existingBudget && existingBudget.status === 'sent');
    if (!willTriggerAutoRevision) {
      // Mapa de campo → label pt-BR (camelCase e snake_case caem no mesmo
      // rótulo). Caller do front pode mandar qualquer dos dois.
      const FIELD_LABELS = {
        imovel: 'Imóvel', endereco: 'Endereço',
        municipio: 'Município',
        mapaUrl: 'Mapa', mapa_url: 'Mapa',
        matriculas: 'Matrículas', matriculasDados: 'Matrículas', matriculas_dados: 'Matrículas',
        nIncraCcir: 'N. INCRA / CCIR', n_incra_ccir: 'N. INCRA / CCIR',
        ccirDados: 'CCIR', ccir_dados: 'CCIR',
        car: 'CAR', carUrl: 'PDF do CAR', car_url: 'PDF do CAR',
        statusCar: 'Status do CAR', status_car: 'Status do CAR', status: 'Status',
        itr: 'ITR', itrDados: 'ITR', itr_dados: 'ITR',
        geoCertificacao: 'Geo Certificação', geo_certificacao: 'Geo Certificação',
        geoRegistro: 'Geo Registro', geo_registro: 'Geo Registro',
        areaTotal: 'Área total', area_total: 'Área total',
        reservaLegal: 'Reserva legal', reserva_legal: 'Reserva legal',
        cultura1: 'Cultura 1',
        areaCultura1: 'Área Cultura 1', area_cultura1: 'Área Cultura 1',
        cultura2: 'Cultura 2',
        areaCultura2: 'Área Cultura 2', area_cultura2: 'Área Cultura 2',
        outros: 'Outros',
        areaOutros: 'Área Outros', area_outros: 'Área Outros',
        appCodigoFlorestal: 'APP Código Florestal', app_codigo_florestal: 'APP Código Florestal',
        appVegetada: 'APP Vegetada', app_vegetada: 'APP Vegetada',
        appNaoVegetada: 'APP Não Vegetada', app_nao_vegetada: 'APP Não Vegetada',
        remanescenteFlorestal: 'Remanescente Florestal', remanescente_florestal: 'Remanescente Florestal',
        observacoes: 'Observações',
      };
      const fieldLabels = Array.from(new Set(
        editedFieldKeys.map(k => FIELD_LABELS[k]).filter(Boolean)
      ));
      // Fire-and-forget — não bloqueia o response do PUT.
      (async () => {
        try {
          const tcName = [req.tcUser.firstName, req.tcUser.lastName].filter(Boolean).join(' ').trim()
            || req.tcUser.username
            || 'um usuário TerraControl';
          const impgeoUsers = await db.getImpgeoUsersWithTerraControlAccess();
          const adminUrl = process.env.IMPGEO_PUBLIC_URL
            ? `${process.env.IMPGEO_PUBLIC_URL}/?subsystem=especial&module=terracontrol&record=${updated.id}`
            : undefined;
          const codImovel = updated.cod_imovel != null ? updated.cod_imovel : null;
          const fieldsSummary = fieldLabels.length
            ? fieldLabels.slice(0, 3).join(', ') + (fieldLabels.length > 3 ? `, +${fieldLabels.length - 3}` : '')
            : 'detalhes indisponíveis';
          for (const u of impgeoUsers) {
            const notif = await db.createNotification({
              user_id: u.id,
              notification_type: 'tc_record_edited_by_user',
              title: `${tcName} editou um imóvel`,
              message: `${updated.imovel}${updated.municipio ? ` em ${updated.municipio}` : ''} — campos: ${fieldsSummary}`,
              related_entity_type: 'terracontrol',
              related_entity_id: updated.id,
            });
            pushDispatcher.send(db, 'impgeo', u.id, notif).catch(() => {});
            if (u.tc_email_notifications === true && u.email) {
              const recipientName = [u.first_name, u.last_name].filter(Boolean).join(' ').trim()
                || u.username || 'usuário';
              enviarEmailImpgeoTcRecordEditado({
                toEmail: u.email,
                recipientName,
                tcUserName: tcName,
                imovel: updated.imovel,
                municipio: updated.municipio,
                codImovel,
                fieldLabels,
                adminUrl,
              }).catch(e => console.error('[tc-records PUT] Falha ao enviar email edit:', e?.message));
            }
          }
        } catch (e) {
          console.error('[tc-records PUT] Falha ao notificar admins (edit):', e?.message);
        }
      })();
    }

    // Auto-revisão: se há orçamento status='sent', o admin precisa saber que o
    // imóvel mudou — abre uma nova solicitação de revisão (source='auto_edit')
    // e move pro estado revision_requested. Fire-and-forget pra não atrasar
    // o response — falha aqui não desfaz o update.
    if (existingBudget && existingBudget.status === 'sent') {
      (async () => {
        try {
          const { budget } = await budgetService.requestRevision({
            budgetId: existingBudget.id,
            tcUserId: req.tcUser.id,
            comment: 'O cliente editou o cadastro do imóvel após o envio do orçamento. Revise se os valores ainda se aplicam.',
            source: 'auto_edit',
          });
          await budgetDispatcher.dispatchTcBudgetEventToAdmins(budget, updated, 'revision_requested', {
            tcUser: req.tcUser,
            comment: 'Imóvel editado pelo cliente (revisão automática)',
            source: 'auto_edit',
          });
        } catch (e) {
          console.error('[tc-records PUT] Falha ao disparar auto-revisão:', e?.message);
        }
      })();
    }

    res.json({ success: true, data: updated });
  } catch (error) {
    console.error('Erro PUT /api/tc-auth/me/records/:id:', error);
    res.status(500).json({ success: false, error: error.message || 'Erro ao atualizar registro' });
  }
});

// POST /api/tc-auth/me/upload-car — upload de PDF pro tc_user
// Espelho do /api/terracontrol/upload-car mas autenticado via tc_user JWT.
// Mesmo validador de magic bytes %PDF (G2.4).
router.post('/api/tc-auth/me/upload-car', tcAuth.authenticateTcUser, uploadDocument.single('file'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'Nenhum arquivo enviado' });
    }
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
      console.error('Erro ao validar assinatura PDF (tc_user):', sigErr);
      try { fs.unlinkSync(req.file.path); } catch (_) {}
      return res.status(500).json({ success: false, error: 'Falha ao validar o arquivo enviado' });
    }
    const fileUrl = `/api/documents/${req.file.filename}`;
    res.json({ success: true, url: fileUrl });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message || 'Erro no upload' });
  }
});

// DELETE /api/tc-auth/me/records/:id — tc_user exclui registro
router.delete('/api/tc-auth/me/records/:id', tcAuth.authenticateTcUser, async (req, res) => {
  try {
    const ok = await db.tcUserCanDeleteRecord(req.tcUser.id, req.params.id);
    if (!ok) {
      return res.status(403).json({ success: false, error: 'Você não tem permissão para excluir este registro' });
    }
    await db.deleteTerraControlByTcUser(req.params.id);
    res.json({ success: true });
  } catch (error) {
    console.error('Erro DELETE /api/tc-auth/me/records/:id:', error);
    res.status(500).json({ success: false, error: error.message || 'Erro ao excluir registro' });
  }
});

// ===========================================================================
// Orçamentos TerraControl — endpoints tc_user (migration 040)
// ===========================================================================
// Ownership: budgetService.getBudgetForTcUser já checa via db.tcUserOwnsBudget.
// Demais ações fazem o check antes de qualquer escrita.

// GET /api/tc-auth/me/budgets/by-record/:terracontrolId
// Devolve o orçamento ativo (ou null) do registro indicado, se tc_user é dono.
router.get('/api/tc-auth/me/budgets/by-record/:terracontrolId', tcAuth.authenticateTcUser, async (req, res) => {
  try {
    const budget = await db.getBudgetByTerracontrolId(req.params.terracontrolId);
    if (!budget) return res.json({ success: true, data: null });
    const full = await budgetService.getBudgetForTcUser(budget.id, req.tcUser.id);
    if (!full) return res.status(403).json({ success: false, error: 'Acesso negado' });
    res.json({ success: true, data: full });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message || 'Erro ao carregar orçamento' });
  }
});

// GET /api/tc-auth/me/budgets/:id — full payload (budget + revisão atual + history)
router.get('/api/tc-auth/me/budgets/:id', tcAuth.authenticateTcUser, async (req, res) => {
  try {
    const full = await budgetService.getBudgetForTcUser(req.params.id, req.tcUser.id);
    if (!full) return res.status(404).json({ success: false, error: 'Orçamento não encontrado' });
    res.json({ success: true, data: full });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message || 'Erro ao carregar orçamento' });
  }
});

// POST /api/tc-auth/me/budgets/:id/request-revision
// Body: { comment }
router.post('/api/tc-auth/me/budgets/:id/request-revision', tcAuth.authenticateTcUser, async (req, res) => {
  try {
    const owns = await db.tcUserOwnsBudget(req.tcUser.id, req.params.id);
    if (!owns) return res.status(403).json({ success: false, error: 'Acesso negado' });
    const { comment } = req.body || {};
    if (!comment || !String(comment).trim()) {
      return res.status(400).json({ success: false, error: 'Comentário obrigatório (descreva o que precisa ser alterado)' });
    }
    const { budget, request } = await budgetService.requestRevision({
      budgetId: req.params.id,
      tcUserId: req.tcUser.id,
      comment: String(comment).trim(),
      source: 'tc_user',
    });
    // Dispatcher pros admins precisa do record pra renderizar texto.
    (async () => {
      try {
        const rows = await db.getTerraControlByIds([budget.terracontrol_id]);
        const record = rows[0];
        if (record) {
          await budgetDispatcher.dispatchTcBudgetEventToAdmins(budget, record, 'revision_requested', {
            tcUser: req.tcUser, comment, source: 'tc_user',
          });
        }
      } catch (e) {
        console.error('[tc-budgets request-revision] Falha no dispatch admin:', e?.message);
      }
    })();
    res.json({ success: true, data: { budget, request } });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message || 'Erro ao solicitar revisão' });
  }
});

// POST /api/tc-auth/me/budgets/:id/accept — aprova orçamento e cria cobrança PIX
// Devolve { brCode, brCodeBase64, expiresAt, attempt } pro front mostrar QR.
router.post('/api/tc-auth/me/budgets/:id/accept', tcAuth.authenticateTcUser, async (req, res) => {
  try {
    const owns = await db.tcUserOwnsBudget(req.tcUser.id, req.params.id);
    if (!owns) return res.status(403).json({ success: false, error: 'Acesso negado' });
    // tc_user completo do DB (req.tcUser tem só claims do JWT — sem cpf/abacatepay_customer_id)
    const tcUser = await db.getTcUserById(req.tcUser.id);
    const { budget, payment } = await budgetService.acceptAndStartPayment({
      budgetId: req.params.id, tcUser,
    });
    res.json({ success: true, data: { budget, payment } });
  } catch (error) {
    console.error('[tc-budgets accept] Erro:', error);
    res.status(500).json({ success: false, error: error.message || 'Erro ao iniciar pagamento' });
  }
});

// POST /api/tc-auth/me/budgets/:id/refresh-pix — re-emite QR Code (PIX expirou)
router.post('/api/tc-auth/me/budgets/:id/refresh-pix', tcAuth.authenticateTcUser, async (req, res) => {
  try {
    const owns = await db.tcUserOwnsBudget(req.tcUser.id, req.params.id);
    if (!owns) return res.status(403).json({ success: false, error: 'Acesso negado' });
    const tcUser = await db.getTcUserById(req.tcUser.id);
    const payment = await budgetService.refreshPaymentQrCode({
      budgetId: req.params.id, tcUser,
    });
    res.json({ success: true, data: payment });
  } catch (error) {
    console.error('[tc-budgets refresh-pix] Erro:', error);
    res.status(500).json({ success: false, error: error.message || 'Erro ao regenerar QR Code' });
  }
});

// ===========================================================================
// Webhook AbacatePay — público, validado por HMAC + secret query (migration 040)
// ===========================================================================
// Dupla validação:
//   1) ?webhookSecret= na query (timing-safe contra env)
//   2) X-Webhook-Signature header HMAC-SHA256 sobre RAW body
// Idempotência: tc_webhook_events (provider+event_id) bloqueia replay.
//
// Retorna 200 só APÓS processamento bem-sucedido — AbacatePay retenta em
// non-2xx. Erros internos devolvem 500 (provoca retry). Falha de validação
// devolve 401 (provider sabe parar de tentar).
router.post('/api/webhooks/abacatepay', async (req, res) => {
  try {
    if (!abacatepay.verifyWebhookSecretFromQuery(req)) {
      console.warn('[webhook abacatepay] webhookSecret inválido');
      return res.status(401).json({ success: false, error: 'unauthorized' });
    }
    const signature = req.headers['x-webhook-signature'];
    if (!abacatepay.verifyWebhookHmac(req.rawBody, signature, process.env.ABACATEPAY_WEBHOOK_SECRET)) {
      console.warn('[webhook abacatepay] HMAC inválido');
      return res.status(401).json({ success: false, error: 'invalid signature' });
    }

    const payload = req.body || {};
    const eventType = payload.event;
    // O `id` do envelope é o event_id pra dedupe (formato 'log_xxx'). Se a
    // doc mudar, cair pro id interno do data.
    const eventId = payload.id || payload.data?.id || null;
    if (!eventType || !eventId) {
      return res.status(400).json({ success: false, error: 'event/id ausentes' });
    }

    const { firstSeen } = await db.recordWebhookEvent({
      provider: 'abacatepay',
      eventId,
      eventType,
      payload,
    });
    if (!firstSeen) {
      return res.json({ success: true, dedupe: true });
    }

    // Roteamento por event type
    if (eventType === 'transparent.completed' || eventType === 'billing.paid') {
      const transparent = payload.data?.transparent || payload.data;
      // AbacatePay tem devolvido externalId=null no payload do webhook em
      // alguns casos (bug do provider — visto em prod 2026-05-23). Fallback:
      // reconstruir o externalId a partir do metadata que mandamos no accept
      // (a gente põe { budgetId, attempt } lá; basta refazer o formato).
      // paidAmount também pode vir null; cai no amount nesse caso.
      let externalId = transparent?.externalId;
      if (!externalId) {
        const md = transparent?.metadata || {};
        if (md.budgetId) {
          externalId = `tc_budget_${md.budgetId}_attempt_${md.attempt || 1}`;
          console.info(`[webhook abacatepay] externalId reconstruído via metadata: ${externalId}`);
        }
      }
      const amountCents = transparent?.paidAmount || transparent?.amount;
      if (!externalId) {
        console.warn('[webhook abacatepay] transparent.completed sem externalId nem metadata.budgetId — ignorando');
        return res.json({ success: true, warning: 'no externalId' });
      }
      const result = await budgetService.markPaidFromWebhook({
        externalId, amountCents, abacatePayload: payload,
      });
      if (result.matched && !result.idempotent && result.budget && result.record) {
        // Dispatch fire-and-forget (não atrasa response pro provider).
        // O tcUser pro dispatch vem do nosso DB (created_by_tc_user_id do
        // registro), NÃO do payload.data.customer da AbacatePay — esse
        // último não tem os campos first_name/last_name/username que o
        // dispatcher espera, resultando em "Undefined pagou o orçamento"
        // nas notificações dos admins.
        (async () => {
          let tcUserForDispatch = null;
          try {
            if (result.record.created_by_tc_user_id) {
              tcUserForDispatch = await db.getTcUserById(result.record.created_by_tc_user_id);
            }
          } catch (e) {
            console.error('[webhook abacatepay] Falha ao buscar tc_user pra dispatch:', e?.message);
          }
          budgetDispatcher.dispatchTcBudgetEventToOwner(
            result.budget, result.record, 'payment_completed'
          ).catch(() => {});
          budgetDispatcher.dispatchTcBudgetEventToAdmins(
            result.budget, result.record, 'payment_completed',
            { tcUser: tcUserForDispatch }
          ).catch(() => {});
        })();
      }
      return res.json({ success: true });
    }

    if (eventType === 'transparent.refunded' || eventType === 'transparent.disputed') {
      // MVP: só registra evento via dedupe. Rollback de approval fica em
      // TECH-DEBT — admin lida manualmente pelo painel.
      const transparent = payload.data?.transparent || {};
      let externalId = transparent?.externalId || payload.data?.externalId;
      if (!externalId && transparent?.metadata?.budgetId) {
        // Mesmo fallback do branch completed — AbacatePay às vezes deixa null
        const md = transparent.metadata;
        externalId = `tc_budget_${md.budgetId}_attempt_${md.attempt || 1}`;
      }
      if (externalId) {
        const budget = await db.getBudgetByExternalId(externalId);
        if (budget) {
          await db.appendBudgetEvent({
            budgetId: budget.id,
            eventType: eventType === 'transparent.refunded' ? 'payment_refunded' : 'payment_disputed',
            actorType: 'abacatepay',
            actorId: null,
            payload,
          });
        }
      }
      return res.json({ success: true });
    }

    // Evento não tratado — registramos pra auditoria e devolvemos 200 pra não
    // ficar retentando indefinidamente.
    console.info(`[webhook abacatepay] evento não tratado: ${eventType}`);
    return res.json({ success: true, unhandled: eventType });
  } catch (error) {
    console.error('[webhook abacatepay] erro no processamento:', error);
    // Retorna 500 pra AbacatePay tentar de novo (dedupe garante segurança)
    res.status(500).json({ success: false, error: 'processing error' });
  }
});

// Sub-share criado pelo tc_user — só pode incluir registros do seu access.
// Reaproveita a tabela share_links já existente, marcando created_by_tc_user_id.
router.get('/api/tc-auth/me/share-links', tcAuth.authenticateTcUser, async (req, res) => {
  try {
    const links = await db.getShareLinksCreatedByTcUser(req.tcUser.id);
    res.json({ success: true, data: links });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Erro ao listar share links' });
  }
});

router.post('/api/tc-auth/me/share-links', tcAuth.authenticateTcUser, async (req, res) => {
  try {
    const { name, expiresAt, password, selectedIds } = req.body || {};
    if (!Array.isArray(selectedIds) || selectedIds.length === 0) {
      return res.status(400).json({ success: false, error: 'Selecione pelo menos um registro' });
    }
    // Filtra apenas registros que o tc_user TEM acesso
    const allowedRecordIds = await db.getTcUserRecordIds(req.tcUser.id);
    const allowedSet = new Set(allowedRecordIds.map(String));
    const safeIds = selectedIds.map(String).filter(id => allowedSet.has(id));
    if (safeIds.length === 0) {
      return res.status(403).json({ success: false, error: 'Nenhum dos registros selecionados está no seu acesso' });
    }

    // Token sempre com sufixo aleatório forte (G2.2)
    let token = '';
    if (name && name.trim()) {
      const baseSlug = slugify(name);
      const suffix = crypto.randomBytes(8).toString('hex');
      token = baseSlug ? `${baseSlug}-${suffix}` : `view_${suffix}`;
    } else {
      token = 'view_' + crypto.randomBytes(32).toString('hex');
    }

    let expiresAtISO = null;
    if (expiresAt && String(expiresAt).trim()) {
      expiresAtISO = new Date(expiresAt).toISOString();
    }
    let passwordHash = null;
    if (password && String(password).trim()) {
      passwordHash = await bcrypt.hash(String(password), 10);
    }

    await db.saveShareLink(token, name || null, expiresAtISO, passwordHash, safeIds);
    // Marca quem criou
    await db.queryWithRetry(
      'UPDATE share_links SET created_by_tc_user_id = $1 WHERE token = $2',
      [req.tcUser.id, token]
    );
    res.json({ success: true, token, message: 'Link gerado com sucesso' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message || 'Erro ao criar share link' });
  }
});

router.delete('/api/tc-auth/me/share-links/:token', tcAuth.authenticateTcUser, async (req, res) => {
  try {
    // Confirma que o link pertence ao tc_user antes de apagar
    const row = await db.queryWithRetry(
      'SELECT token FROM share_links WHERE token = $1 AND created_by_tc_user_id = $2 LIMIT 1',
      [req.params.token, req.tcUser.id]
    );
    if (row.rows.length === 0) return res.status(404).json({ success: false, error: 'Link não encontrado' });
    await db.deleteShareLink(req.params.token);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message || 'Erro ao excluir' });
  }
});

  return router;
};
