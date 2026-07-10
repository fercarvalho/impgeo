// ═══════════════════════════════════════════════════════════════════════════
// server/db/feedback.js
// Domínio Feedback do data-layer (#15 A). Métodos movidos verbatim de
// database-pg.js e colados no Database.prototype via Object.assign (core).
// `this` = a instância db (this.pool, this.generateId etc. seguem funcionando).
// ═══════════════════════════════════════════════════════════════════════════
'use strict';

const { toCamelCase } = require('./_shared');

module.exports = {

  async criarFeedback({ usuarioId, categoria, descricao, imagemBase64, linkVideo, pagina }) {
    const id = this.generateId();
    const now = new Date().toISOString();
    const r = await this.pool.query(
      `INSERT INTO feedbacks (id, usuario_id, categoria, descricao, imagem_base64, link_video, pagina, status, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'pendente', $8, $8) RETURNING *`,
      [id, usuarioId, categoria, descricao, imagemBase64 || null, linkVideo || null, pagina || null, now]
    );
    return toCamelCase(r.rows[0]);
  },

  async obterFeedbacks() {
    const r = await this.pool.query(
      `SELECT f.*,
              u.first_name, u.last_name, u.username, u.email AS usuario_email
       FROM feedbacks f
       LEFT JOIN users u ON u.id = f.usuario_id
       ORDER BY f.created_at DESC`
    );
    return r.rows.map(row => {
      const fb = toCamelCase(row);
      fb.usuarioNome = [row.first_name, row.last_name].filter(Boolean).join(' ') || row.username || 'Usuário';
      fb.usuarioEmail = row.usuario_email || '';
      return fb;
    });
  },

  async obterFeedbackPorId(id) {
    const r = await this.pool.query(
      `SELECT f.*,
              u.first_name, u.last_name, u.username, u.email AS usuario_email
       FROM feedbacks f
       LEFT JOIN users u ON u.id = f.usuario_id
       WHERE f.id = $1`,
      [id]
    );
    if (r.rows.length === 0) throw new Error('Feedback não encontrado');
    const row = r.rows[0];
    const fb = toCamelCase(row);
    fb.usuarioNome = [row.first_name, row.last_name].filter(Boolean).join(' ') || row.username || 'Usuário';
    fb.usuarioEmail = row.usuario_email || '';
    return fb;
  },

  async responderFeedback(id, { resposta }) {
    const now = new Date().toISOString();
    const r = await this.pool.query(
      `UPDATE feedbacks SET resposta = $1, status = 'respondido', updated_at = $2 WHERE id = $3 RETURNING *`,
      [resposta, now, id]
    );
    if (r.rows.length === 0) throw new Error('Feedback não encontrado');
    return toCamelCase(r.rows[0]);
  },

  async aceitarFeedback(id, { resposta }) {
    const now = new Date().toISOString();
    const r = await this.pool.query(
      `UPDATE feedbacks SET resposta = $1, status = 'aceito', updated_at = $2 WHERE id = $3 RETURNING *`,
      [resposta, now, id]
    );
    if (r.rows.length === 0) throw new Error('Feedback não encontrado');
    return toCamelCase(r.rows[0]);
  },
};
