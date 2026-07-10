// ═══════════════════════════════════════════════════════════════════════════
// server/db/push-prefs.js
// Domínio Web Push / Preferências de notificação do data-layer (#15 A):
// cache/seed dos defaults efetivos (tabela notification_defaults, migration 071),
// CRUD admin dos defaults, subscriptions Web Push (scope impgeo|tc), preferências
// por usuário e 2 helpers admin de tc_users. Colado no Database.prototype via
// Object.assign. O estático NOTIFICATION_DEFAULTS e o campo de instância
// `_notifDefaults` seguem no core (class body); estes métodos só os acessam via
// this.*. Símbolos de módulo importados de ../services/pm/notification-defaults
// e ./_shared.
// ═══════════════════════════════════════════════════════════════════════════
'use strict';

const {
  FACTORY_DEFAULTS: NOTIFICATION_FACTORY_DEFAULTS,
  CHANNELS: NOTIFICATION_CHANNELS,
  cacheKey: notifCacheKey,
  resolveDefault: resolveNotificationDefault,
  knownTypes: knownNotificationTypes,
  buildDefaultsGrid: buildNotificationDefaultsGrid,
} = require('../services/pm/notification-defaults');
const { TC_USER_PUBLIC_FIELDS } = require('./_shared');

module.exports = {
  // Carrega os defaults efetivos da tabela p/ o cache. Defensivo: se a tabela
  // ainda não existe (migration 071 não aplicada), mantém null → usa o factory.
  async _loadNotificationDefaults() {
    try {
      const r = await this.queryWithRetry('SELECT scope, notification_type, channel, enabled FROM notification_defaults');
      const map = new Map();
      for (const row of r.rows) map.set(notifCacheKey(row.scope, row.notification_type, row.channel), row.enabled);
      this._notifDefaults = map;
    } catch { this._notifDefaults = null; }
  },

  // Semeia a tabela com o FACTORY (ON CONFLICT DO NOTHING — preserva edições do
  // admin e cobre tipos novos que surjam no código) e recarrega o cache. Boot.
  async _seedNotificationDefaults() {
    try {
      for (const scope of Object.keys(NOTIFICATION_FACTORY_DEFAULTS)) {
        for (const [type, byChannel] of Object.entries(NOTIFICATION_FACTORY_DEFAULTS[scope])) {
          for (const channel of NOTIFICATION_CHANNELS) {
            if (typeof byChannel[channel] !== 'boolean') continue;
            await this.queryWithRetry(
              `INSERT INTO notification_defaults (scope, notification_type, channel, enabled)
               VALUES ($1,$2,$3,$4) ON CONFLICT (scope, notification_type, channel) DO NOTHING`,
              [scope, type, channel, byChannel[channel]]
            );
          }
        }
      }
    } catch { /* tabela ausente ainda — factory cobre */ }
    await this._loadNotificationDefaults();
  },

  // Admin: grid de defaults efetivos de um escopo (cache → factory).
  async listNotificationDefaults(scope) {
    if (!this._notifDefaults) await this._loadNotificationDefaults();
    return buildNotificationDefaultsGrid(this._notifDefaults, scope);
  },

  // Admin: altera um default (upsert) e recarrega o cache.
  async setNotificationDefault(scope, notificationType, channel, enabled) {
    await this.queryWithRetry(
      `INSERT INTO notification_defaults (scope, notification_type, channel, enabled, updated_at)
       VALUES ($1,$2,$3,$4, NOW())
       ON CONFLICT (scope, notification_type, channel) DO UPDATE SET enabled = EXCLUDED.enabled, updated_at = NOW()`,
      [scope, notificationType, channel, !!enabled]
    );
    await this._loadNotificationDefaults();
    return { scope, notification_type: notificationType, channel, enabled: !!enabled };
  },

  _pushSubsTable(scope) {
    return scope === 'tc' ? 'tc_push_subscriptions' : 'push_subscriptions';
  },

  _pushSubsUserCol(scope) {
    return scope === 'tc' ? 'tc_user_id' : 'user_id';
  },

  _prefsTable(scope) {
    return scope === 'tc' ? 'tc_notification_preferences' : 'notification_preferences';
  },

  _prefsUserCol(scope) {
    return scope === 'tc' ? 'tc_user_id' : 'user_id';
  },

  // Insere uma subscription nova ou atualiza last_seen_at se o endpoint já
  // existir (mesmo dispositivo re-subscribendo, ou outro user na mesma máquina
  // — neste caso o user_id também é atualizado, decisão consciente: a
  // subscription "pertence" ao último usuário logado naquela combinação
  // browser+origin).
  async upsertPushSubscription(scope, userId, sub, appId, userAgent) {
    const table = this._pushSubsTable(scope);
    const userCol = this._pushSubsUserCol(scope);
    const id = this.generateId();
    const result = await this.queryWithRetry(
      `INSERT INTO ${table} (id, ${userCol}, endpoint, p256dh, auth, app_id, user_agent)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (endpoint) DO UPDATE
         SET ${userCol}  = EXCLUDED.${userCol},
             p256dh      = EXCLUDED.p256dh,
             auth        = EXCLUDED.auth,
             app_id      = EXCLUDED.app_id,
             user_agent  = EXCLUDED.user_agent,
             failed_count = 0,
             last_seen_at = NOW()
       RETURNING *`,
      [id, userId, sub.endpoint, sub.keys.p256dh, sub.keys.auth, appId, userAgent || null]
    );
    return result.rows[0];
  },

  async listActivePushSubscriptions(scope, userId) {
    const table = this._pushSubsTable(scope);
    const userCol = this._pushSubsUserCol(scope);
    const result = await this.queryWithRetry(
      `SELECT * FROM ${table} WHERE ${userCol} = $1 ORDER BY last_seen_at DESC`,
      [userId]
    );
    return result.rows;
  },

  async listAllPushSubscriptionsForUser(scope, userId) {
    return this.listActivePushSubscriptions(scope, userId);
  },

  async deletePushSubscriptionByEndpoint(scope, userId, endpoint) {
    const table = this._pushSubsTable(scope);
    const userCol = this._pushSubsUserCol(scope);
    const result = await this.queryWithRetry(
      `DELETE FROM ${table} WHERE ${userCol} = $1 AND endpoint = $2 RETURNING id`,
      [userId, endpoint]
    );
    return result.rows.length > 0;
  },

  // Remove uma subscription que o push service marcou como inválida (410/404).
  // Não exige user_id porque o endpoint é único globalmente.
  async pruneInvalidPushSubscription(scope, endpoint) {
    const table = this._pushSubsTable(scope);
    await this.queryWithRetry(
      `DELETE FROM ${table} WHERE endpoint = $1`,
      [endpoint]
    );
  },

  // Marca uma falha transitória; quando failed_count atinge MAX, remove.
  // Devolve { removed: boolean, failed_count: number } pra observabilidade.
  async markPushSubscriptionFailed(scope, endpoint, maxFails = 5) {
    const table = this._pushSubsTable(scope);
    const result = await this.queryWithRetry(
      `UPDATE ${table}
          SET failed_count = failed_count + 1
        WHERE endpoint = $1
        RETURNING failed_count`,
      [endpoint]
    );
    if (result.rows.length === 0) return { removed: false, failed_count: 0 };
    const count = result.rows[0].failed_count;
    if (count >= maxFails) {
      await this.pruneInvalidPushSubscription(scope, endpoint);
      return { removed: true, failed_count: count };
    }
    return { removed: false, failed_count: count };
  },

  async touchPushSubscriptionLastSeen(scope, endpoint) {
    const table = this._pushSubsTable(scope);
    await this.queryWithRetry(
      `UPDATE ${table}
          SET last_seen_at = NOW(), failed_count = 0
        WHERE endpoint = $1`,
      [endpoint]
    );
  },

  // ----- Preferências ------------------------------------------------------

  // Devolve TRUE/FALSE (nunca null). Usa default do mapa se não houver linha.
  // Default-default = FALSE pra tipos desconhecidos (segurança: não envia push
  // sem opt-in explícito).
  async getNotificationPreference(scope, userId, notificationType, channel) {
    const table = this._prefsTable(scope);
    const userCol = this._prefsUserCol(scope);
    const result = await this.queryWithRetry(
      `SELECT enabled FROM ${table}
        WHERE ${userCol} = $1 AND notification_type = $2 AND channel = $3`,
      [userId, notificationType, channel]
    );
    if (result.rows.length > 0) return result.rows[0].enabled;
    // Fallback: default efetivo (cache da tabela) → factory → false.
    return resolveNotificationDefault(this._notifDefaults, scope, notificationType, channel);
  },

  async setNotificationPreference(scope, userId, notificationType, channel, enabled) {
    const table = this._prefsTable(scope);
    const userCol = this._prefsUserCol(scope);
    const id = this.generateId();
    const result = await this.queryWithRetry(
      `INSERT INTO ${table} (id, ${userCol}, notification_type, channel, enabled)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (${userCol}, notification_type, channel) DO UPDATE
         SET enabled    = EXCLUDED.enabled,
             updated_at = NOW()
       RETURNING *`,
      [id, userId, notificationType, channel, !!enabled]
    );
    return result.rows[0];
  },

  // Devolve o grid completo de preferências do user, com defaults aplicados
  // para qualquer combinação (type, channel) que não tenha linha explícita.
  // Útil pra UI desenhar a tabela toda.
  async listNotificationPreferences(scope, userId) {
    const table = this._prefsTable(scope);
    const userCol = this._prefsUserCol(scope);
    const result = await this.queryWithRetry(
      `SELECT notification_type, channel, enabled, updated_at
         FROM ${table} WHERE ${userCol} = $1`,
      [userId]
    );
    const stored = new Map();
    for (const row of result.rows) {
      stored.set(`${row.notification_type}:${row.channel}`, row);
    }
    const grid = [];
    // Tipos = defaults efetivos do escopo (cache→factory) ∪ tipos já salvos pelo user.
    if (!this._notifDefaults) await this._loadNotificationDefaults();
    const types = new Set([
      ...knownNotificationTypes(this._notifDefaults, scope),
      ...result.rows.map(r => r.notification_type),
    ]);
    for (const type of types) {
      for (const channel of ['push', 'email']) {
        const key = `${type}:${channel}`;
        const row = stored.get(key);
        const def = resolveNotificationDefault(this._notifDefaults, scope, type, channel);
        grid.push({
          notification_type: type,
          channel,
          enabled: row ? row.enabled : def,
          is_default: !row,
          updated_at: row ? row.updated_at : null,
        });
      }
    }
    return grid;
  },

  async listTcUsersForAdmin() {
    // Inclui contagem de registros acessíveis por tc_user
    const r = await this.queryWithRetry(
      `SELECT ${TC_USER_PUBLIC_FIELDS},
              (SELECT COUNT(*) FROM tc_user_record_access tura WHERE tura.tc_user_id = tu.id) AS records_count
       FROM tc_users tu
       ORDER BY tu.created_at DESC`
    );
    return r.rows;
  },

  // Força reset de senha por admin: gera nova senha temporária, hasheia,
  // seta force_password_change=TRUE, revoga sessões.
  async adminResetTcUserPassword(tcUserId, plainPassword) {
    const bcrypt = require('bcryptjs');
    const hash = await bcrypt.hash(plainPassword, 10);
    await this.queryWithRetry(
      `UPDATE tc_users
       SET password = $1, force_password_change = TRUE, updated_at = NOW()
       WHERE id = $2`,
      [hash, tcUserId]
    );
    await this.revokeAllTcRefreshTokens(tcUserId);
  },
};
