// ═══════════════════════════════════════════════════════════════════════════
// server/db/notifications.js
// Domínio Notificações (impgeo) do data-layer (#15 A). Métodos movidos verbatim
// de database-pg.js e colados no Database.prototype via Object.assign (core).
// `this` = a instância db (this.pool/queryWithRetry/generateId preservados).
// Só usa this.* — sem símbolos de módulo.
// ═══════════════════════════════════════════════════════════════════════════
'use strict';

module.exports = {
  async createNotification(notif) {
    const id = this.generateId();
    const result = await this.queryWithRetry(
      `INSERT INTO notifications
         (id, user_id, notification_type, title, message, related_entity_type, related_entity_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [
        id,
        notif.user_id,
        notif.notification_type,
        notif.title,
        notif.message || null,
        notif.related_entity_type || null,
        notif.related_entity_id || null,
      ]
    );
    return result.rows[0];
  },

  async getNotificationsForUser(userId, { onlyUnread = false, limit = 50, includeCleared = false } = {}) {
    const result = await this.queryWithRetry(
      `SELECT * FROM notifications
        WHERE user_id = $1
          AND ($2::BOOLEAN = FALSE OR is_read = FALSE)
          AND ($3::BOOLEAN = TRUE  OR cleared = FALSE)
        ORDER BY created_at DESC
        LIMIT $4`,
      [userId, onlyUnread, includeCleared, limit]
    );
    return result.rows;
  },

  async getUnreadNotificationCount(userId) {
    const result = await this.queryWithRetry(
      'SELECT COUNT(*)::INT AS count FROM notifications WHERE user_id = $1 AND is_read = FALSE AND cleared = FALSE',
      [userId]
    );
    return result.rows[0].count;
  },

  async markNotificationAsRead(id, userId) {
    const result = await this.queryWithRetry(
      `UPDATE notifications
          SET is_read = TRUE, read_at = NOW()
        WHERE id = $1 AND user_id = $2
        RETURNING *`,
      [id, userId]
    );
    return result.rows[0] || null;
  },

  async markAllNotificationsAsRead(userId) {
    await this.queryWithRetry(
      `UPDATE notifications
          SET is_read = TRUE, read_at = NOW()
        WHERE user_id = $1 AND is_read = FALSE AND cleared = FALSE`,
      [userId]
    );
  },

  // "Limpar" = esconder do sininho mas manter no banco (cleared = TRUE)
  async clearNotification(id, userId) {
    const result = await this.queryWithRetry(
      `UPDATE notifications
          SET cleared = TRUE, cleared_at = NOW()
        WHERE id = $1 AND user_id = $2
        RETURNING *`,
      [id, userId]
    );
    return result.rows[0] || null;
  },

  async clearAllNotifications(userId) {
    const result = await this.queryWithRetry(
      `UPDATE notifications
          SET cleared = TRUE, cleared_at = NOW()
        WHERE user_id = $1 AND cleared = FALSE
        RETURNING id`,
      [userId]
    );
    return result.rows.length;
  },

  // "Excluir" = remover permanentemente do banco
  async deleteNotification(id, userId) {
    const result = await this.queryWithRetry(
      'DELETE FROM notifications WHERE id = $1 AND user_id = $2 RETURNING id',
      [id, userId]
    );
    return result.rows.length > 0;
  },

  async deleteAllNotificationsForUser(userId, { onlyCleared = false } = {}) {
    const result = await this.queryWithRetry(
      `DELETE FROM notifications
        WHERE user_id = $1
          AND ($2::BOOLEAN = FALSE OR cleared = TRUE)
        RETURNING id`,
      [userId, onlyCleared]
    );
    return result.rows.length;
  },

  async deleteNotificationsByEntity(entityType, entityId) {
    await this.queryWithRetry(
      'DELETE FROM notifications WHERE related_entity_type = $1 AND related_entity_id = $2',
      [entityType, entityId]
    );
  },

  async fanoutNotificationToAdmins(notif) {
    const adminsResult = await this.queryWithRetry(
      "SELECT id FROM users WHERE role IN ('admin', 'superadmin') AND is_active = TRUE"
    );
    const created = [];
    for (const row of adminsResult.rows) {
      const n = await this.createNotification({ ...notif, user_id: row.id });
      created.push(n);
    }
    return created;
  },
};
