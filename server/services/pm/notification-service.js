// ═══════════════════════════════════════════════════════════════════════════
// server/services/pm/notification-service.js
//
// Centraliza o disparo 3-way de notificações do PM (sino + push + e-mail),
// respeitando notification_preferences (scope 'impgeo'). Fire-and-forget:
// nunca propaga erro pro caller (falha de push/e-mail não desfaz nada).
//
// Requer push-dispatcher + email (sem ciclo com task-service).
// ═══════════════════════════════════════════════════════════════════════════

'use strict';

const pushDispatcher = require('../push-dispatcher');
const emailService = require('../email');
const strings = require('./notification-strings');

const IMPGEO_PUBLIC_URL = process.env.IMPGEO_PUBLIC_URL || '';

function ctaForProject(projectId) {
  if (!projectId || !IMPGEO_PUBLIC_URL) return null;
  return `${IMPGEO_PUBLIC_URL}/?subsystem=gerenciamento&module=projects&project=${projectId}`;
}

/**
 * Dispara notificação para 1 usuário impgeo.
 * @param {object} db
 * @param {object} p
 * @param {string} p.type        - tipo pm_* (deve existir em NOTIFICATION_DEFAULTS.impgeo)
 * @param {string} p.userId
 * @param {object} [p.payload]    - dados p/ montar os textos (notification-strings)
 * @param {string} [p.entityType] - related_entity_type (ex.: 'project_task','project')
 * @param {string} [p.entityId]
 * @param {string} [p.ctaProjectId] - se passado, monta CTA pro projeto
 */
async function notify(db, { type, userId, payload = {}, entityType = null, entityId = null, ctaProjectId = null }) {
  if (!userId || !type) return;
  const { title, message } = strings.build(type, payload);

  // 1. Sino (sempre).
  try {
    await db.createNotification({
      user_id: userId, notification_type: type, title, message,
      related_entity_type: entityType, related_entity_id: entityId,
    });
  } catch (e) { console.error('[pm-notify] sino falhou', type, e.message); }

  // 2. Push (push-dispatcher checa preferência internamente).
  try {
    await pushDispatcher.send(db, 'impgeo', userId, {
      notification_type: type, title, message,
      related_entity_type: entityType, related_entity_id: entityId,
    });
  } catch (e) { /* dispatcher já engole erro; defensivo */ }

  // 3. E-mail (opt-in via preferência).
  try {
    const emailOn = await db.getNotificationPreference('impgeo', userId, type, 'email').catch(() => false);
    if (emailOn) {
      const r = await db.pool.query('SELECT email FROM users WHERE id = $1', [userId]);
      const toEmail = r.rows[0]?.email;
      if (toEmail) {
        await emailService.enviarEmailPmNotificacao({ toEmail, title, message, ctaUrl: ctaForProject(ctaProjectId) });
      }
    }
  } catch (e) { console.error('[pm-notify] email falhou', type, e.message); }
}

// Notifica todos admins/superadmins ativos (ex.: pagamento, atraso crítico).
async function notifyAdmins(db, args) {
  try {
    const r = await db.pool.query(
      `SELECT id FROM users WHERE role IN ('admin','superadmin') AND COALESCE(is_active,true)=true`
    );
    for (const row of r.rows) {
      await notify(db, { ...args, userId: row.id });
    }
  } catch (e) { console.error('[pm-notify] notifyAdmins falhou', e.message); }
}

module.exports = { notify, notifyAdmins };
