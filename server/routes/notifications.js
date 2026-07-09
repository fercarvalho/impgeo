// ═══════════════════════════════════════════════════════════════════════════
// server/routes/notifications.js
// Notificações do impgeo: listagem/leitura/limpeza, inscrição de push (VAPID),
// preferências de notificação por usuário e defaults de notificação (admin).
// Extraídas de server.js (#3) — comportamento idêntico (rotas verbatim, paths
// completos preservados). Auth vem do middleware global app.use('/api', ...).
// ═══════════════════════════════════════════════════════════════════════════
'use strict';

const express = require('express');
const push = require('../services/push');

module.exports = function createNotificationsRoutes({ db, authenticateToken }) {
  const router = express.Router();

// ─── Notificações ──────────────────────────────────────────────────────────
router.get('/api/notifications', async (req, res) => {
  try {
    const onlyUnread = req.query.onlyUnread === 'true';
    const limit = parseInt(req.query.limit, 10) || 50;
    const notifs = await db.getNotificationsForUser(req.user.id, { onlyUnread, limit });
    const unreadCount = await db.getUnreadNotificationCount(req.user.id);
    res.json({ success: true, data: notifs, unreadCount });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.patch('/api/notifications/read-all', async (req, res) => {
  try {
    await db.markAllNotificationsAsRead(req.user.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// "Limpar todas" — esconde do sininho, mantém no banco
router.patch('/api/notifications/clear-all', async (req, res) => {
  try {
    const cleared = await db.clearAllNotifications(req.user.id);
    res.json({ success: true, cleared });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// "Excluir todas" — remove do banco permanentemente
router.delete('/api/notifications', async (req, res) => {
  try {
    const onlyCleared = req.query.onlyCleared === 'true';
    const deleted = await db.deleteAllNotificationsForUser(req.user.id, { onlyCleared });
    res.json({ success: true, deleted });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Rotas com :id (individuais) — colocadas DEPOIS das rotas literais para evitar
// que '/clear-all' / 'read-all' sejam capturadas por ':id'.
router.patch('/api/notifications/:id/read', async (req, res) => {
  try {
    const updated = await db.markNotificationAsRead(req.params.id, req.user.id);
    res.json({ success: true, data: updated });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.patch('/api/notifications/:id/clear', async (req, res) => {
  try {
    const updated = await db.clearNotification(req.params.id, req.user.id);
    res.json({ success: true, data: updated });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.delete('/api/notifications/:id', async (req, res) => {
  try {
    const deleted = await db.deleteNotification(req.params.id, req.user.id);
    if (!deleted) return res.status(404).json({ success: false, error: 'Notificação não encontrada' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── Web Push: subscriptions e preferências (impgeo) ─────────────────────
// Auth herda do middleware global `authenticateToken` (req.user já populado).
// Os endpoints `/api/tc-auth/push/*` ficam mais abaixo, no bloco do tc.
//
// `app_id` no body diferencia subscription do mesmo user em origins distintos
// (mesmo user_id pode ter linhas com app_id='impgeo', 'tc-public' e 'tc-admin').

router.get('/api/push/vapid-public-key', async (req, res) => {
  if (!push.isConfigured()) {
    return res.status(503).json({ success: false, error: 'Web Push não configurado no servidor' });
  }
  res.json({ success: true, publicKey: push.getPublicKey() });
});

router.post('/api/push/subscribe', async (req, res) => {
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
    const sub = await db.upsertPushSubscription('impgeo', req.user.id, { endpoint, keys }, app_id, userAgent);
    res.json({ success: true, data: { id: sub.id, endpoint: sub.endpoint, app_id: sub.app_id } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.delete('/api/push/subscribe', async (req, res) => {
  try {
    const { endpoint } = req.body || {};
    if (!endpoint || typeof endpoint !== 'string') {
      return res.status(400).json({ success: false, error: 'endpoint obrigatório' });
    }
    const removed = await db.deletePushSubscriptionByEndpoint('impgeo', req.user.id, endpoint);
    res.json({ success: true, removed });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/api/notification-preferences', async (req, res) => {
  try {
    const grid = await db.listNotificationPreferences('impgeo', req.user.id);
    res.json({ success: true, data: grid });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.put('/api/notification-preferences', async (req, res) => {
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
    const pref = await db.setNotificationPreference('impgeo', req.user.id, notification_type, channel, enabled);
    res.json({ success: true, data: pref });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── Defaults de notificação do sistema (#7) — admin/superadmin ────────────
// Editam o padrão aplicado a quem NÃO personalizou (fallback global por escopo).
router.get('/api/admin/notification-defaults', async (req, res) => {
  try {
    if (req.user.role !== 'admin' && req.user.role !== 'superadmin') {
      return res.status(403).json({ success: false, error: 'Apenas administradores.' });
    }
    const scope = req.query.scope === 'tc' ? 'tc' : 'impgeo';
    const grid = await db.listNotificationDefaults(scope);
    res.json({ success: true, data: grid });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.put('/api/admin/notification-defaults', async (req, res) => {
  try {
    if (req.user.role !== 'admin' && req.user.role !== 'superadmin') {
      return res.status(403).json({ success: false, error: 'Apenas administradores.' });
    }
    const { scope, notification_type, channel, enabled } = req.body || {};
    if (scope !== 'impgeo' && scope !== 'tc') {
      return res.status(400).json({ success: false, error: 'scope deve ser "impgeo" ou "tc"' });
    }
    if (!notification_type || typeof notification_type !== 'string' || notification_type.length > 64) {
      return res.status(400).json({ success: false, error: 'notification_type inválido' });
    }
    if (channel !== 'push' && channel !== 'email') {
      return res.status(400).json({ success: false, error: 'channel deve ser "push" ou "email"' });
    }
    if (typeof enabled !== 'boolean') {
      return res.status(400).json({ success: false, error: 'enabled deve ser boolean' });
    }
    const def = await db.setNotificationDefault(scope, notification_type, channel, enabled);
    res.json({ success: true, data: def });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

  return router;
};
