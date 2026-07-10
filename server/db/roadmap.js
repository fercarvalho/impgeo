// ═══════════════════════════════════════════════════════════════════════════
// server/db/roadmap.js
// Domínio Roadmap do data-layer (#15 A): config, colunas e itens do roadmap
// (com _ensureRoadmapDefaults). Movido verbatim de database-pg.js e colado no
// Database.prototype via Object.assign (core). `this` = a instância db.
// ═══════════════════════════════════════════════════════════════════════════
'use strict';

const { toCamelCase } = require('./_shared');

module.exports = {

  async _ensureRoadmapDefaults() {
    if (this.roadmapSchemaEnsured) return;
    if (this.roadmapSchemaEnsuring) { await this.roadmapSchemaEnsuring; return; }
    this.roadmapSchemaEnsuring = (async () => {
      await this.queryWithRetry(`
        CREATE TABLE IF NOT EXISTS roadmap_items (
          id VARCHAR(255) PRIMARY KEY,
          titulo VARCHAR(255) NOT NULL,
          descricao TEXT,
          status VARCHAR(50) NOT NULL DEFAULT 'backlog',
          prioridade VARCHAR(20) DEFAULT 'media',
          ordem INTEGER DEFAULT 0,
          data_inicio TIMESTAMP,
          depende_de VARCHAR(255) REFERENCES roadmap_items(id) ON DELETE SET NULL,
          tempo_acumulado INTEGER DEFAULT 0,
          em_andamento BOOLEAN DEFAULT FALSE,
          ultimo_inicio TIMESTAMP,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          created_by VARCHAR(255) REFERENCES users(id) ON DELETE SET NULL
        )
      `);
      await this.queryWithRetry(`CREATE INDEX IF NOT EXISTS idx_roadmap_status ON roadmap_items(status)`);
      await this.queryWithRetry(`CREATE INDEX IF NOT EXISTS idx_roadmap_ordem ON roadmap_items(ordem)`);

      await this.queryWithRetry(`
        CREATE TABLE IF NOT EXISTS roadmap_colunas (
          id VARCHAR(255) PRIMARY KEY,
          key VARCHAR(100) UNIQUE NOT NULL,
          label VARCHAR(255) NOT NULL,
          cor VARCHAR(50) DEFAULT '#6b7280',
          cor_fundo VARCHAR(50) DEFAULT '#f3f4f6',
          ordem INTEGER DEFAULT 0,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);

      await this.queryWithRetry(`
        CREATE TABLE IF NOT EXISTS roadmap_config (
          id VARCHAR(255) PRIMARY KEY,
          coluna_concluir VARCHAR(100) DEFAULT 'lancado',
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);
      const cfgRes = await this.queryWithRetry('SELECT COUNT(*) FROM roadmap_config');
      if (parseInt(cfgRes.rows[0].count, 10) === 0) {
        await this.queryWithRetry(
          'INSERT INTO roadmap_config (id, coluna_concluir) VALUES ($1, $2)',
          [this.generateId(), 'lancado']
        );
      }

      const colRes = await this.queryWithRetry('SELECT COUNT(*) FROM roadmap_colunas');
      if (parseInt(colRes.rows[0].count, 10) === 0) {
        const defaultCols = [
          { key: 'backlog', label: 'Backlog',  cor: '#6b7280', cor_fundo: '#f3f4f6', ordem: 0 },
          { key: 'doing',   label: 'Doing',    cor: '#d97706', cor_fundo: '#fef3c7', ordem: 1 },
          { key: 'em_beta', label: 'Em Beta',  cor: '#2563eb', cor_fundo: '#dbeafe', ordem: 2 },
          { key: 'lancado', label: 'Lançado',  cor: '#16a34a', cor_fundo: '#dcfce7', ordem: 3 },
        ];
        for (const col of defaultCols) {
          const id = this.generateId();
          await this.queryWithRetry(
            'INSERT INTO roadmap_colunas (id, key, label, cor, cor_fundo, ordem) VALUES ($1, $2, $3, $4, $5, $6)',
            [id, col.key, col.label, col.cor, col.cor_fundo, col.ordem]
          );
        }
      }

      this.roadmapSchemaEnsured = true;
    })().finally(() => { this.roadmapSchemaEnsuring = null; });
    await this.roadmapSchemaEnsuring;
  },

  async getRoadmapItems() {
    await this._ensureRoadmapDefaults();
    try {
      const r = await this.queryWithRetry(
        `SELECT r.*, u.username AS created_by_username
         FROM roadmap_items r
         LEFT JOIN users u ON u.id = r.created_by
         ORDER BY
           CASE r.status
             WHEN 'backlog' THEN 1
             WHEN 'doing' THEN 2
             WHEN 'em_testes' THEN 3
             WHEN 'em_beta' THEN 4
             WHEN 'lancado' THEN 5
             WHEN 'done' THEN 6
             ELSE 7
           END,
           r.ordem ASC,
           r.created_at ASC`
      );
      return r.rows.map(row => toCamelCase(row));
    } catch (e) {
      console.error('Erro ao buscar itens do roadmap:', e);
      return [];
    }
  },

  async getRoadmapItemById(id) {
    await this._ensureRoadmapDefaults();
    const r = await this.queryWithRetry(
      `SELECT r.*, u.username AS created_by_username
       FROM roadmap_items r
       LEFT JOIN users u ON u.id = r.created_by
       WHERE r.id = $1`,
      [id]
    );
    if (r.rows.length === 0) return null;
    return toCamelCase(r.rows[0]);
  },

  async createRoadmapItem({ titulo, descricao, status, prioridade, dataInicio, dependeDe, createdBy }) {
    await this._ensureRoadmapDefaults();
    const id = this.generateId();
    const now = new Date().toISOString();
    const r = await this.queryWithRetry(
      `INSERT INTO roadmap_items
         (id, titulo, descricao, status, prioridade, ordem, data_inicio, depende_de, created_by, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5,
         (SELECT COALESCE(MAX(ordem), 0) + 1 FROM roadmap_items WHERE status = $4::varchar),
         $6, $7, $8, $9, $9)
       RETURNING *`,
      [id, titulo, descricao || null, status || 'backlog', prioridade || 'media',
       dataInicio || null, dependeDe || null, createdBy || null, now]
    );
    return toCamelCase(r.rows[0]);
  },

  async updateRoadmapItem(id, dados) {
    await this._ensureRoadmapDefaults();
    const fields = [];
    const values = [id];
    let i = 2;
    const map = {
      titulo: 'titulo',
      descricao: 'descricao',
      status: 'status',
      prioridade: 'prioridade',
      dataInicio: 'data_inicio',
      dependeDe: 'depende_de',
    };
    for (const [key, col] of Object.entries(map)) {
      if (dados[key] !== undefined) {
        fields.push(`${col} = $${i}`);
        values.push(dados[key] !== '' ? dados[key] : null);
        i++;
      }
    }
    if (fields.length === 0) return this.getRoadmapItemById(id);
    fields.push('updated_at = CURRENT_TIMESTAMP');
    const r = await this.queryWithRetry(
      `UPDATE roadmap_items SET ${fields.join(', ')} WHERE id = $1 RETURNING *`,
      values
    );
    if (r.rows.length === 0) throw new Error('Item do roadmap não encontrado');
    return toCamelCase(r.rows[0]);
  },

  async updateRoadmapItemStatus(id, status) {
    await this._ensureRoadmapDefaults();
    const r = await this.queryWithRetry(
      `UPDATE roadmap_items SET
         status = $2,
         ordem = (SELECT COALESCE(MAX(ordem), 0) + 1 FROM roadmap_items WHERE status = $2::varchar AND id != $1),
         updated_at = CURRENT_TIMESTAMP
       WHERE id = $1 RETURNING *`,
      [id, status]
    );
    if (r.rows.length === 0) throw new Error('Item do roadmap não encontrado');
    return toCamelCase(r.rows[0]);
  },

  async updateRoadmapOrdem(itens) {
    await this._ensureRoadmapDefaults();
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      for (const { id, ordem } of itens) {
        await client.query(
          'UPDATE roadmap_items SET ordem = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $1',
          [id, ordem]
        );
      }
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  },

  async deleteRoadmapItem(id) {
    await this._ensureRoadmapDefaults();
    const r = await this.queryWithRetry(
      'DELETE FROM roadmap_items WHERE id = $1 RETURNING *',
      [id]
    );
    if (r.rows.length === 0) throw new Error('Item do roadmap não encontrado');
    return toCamelCase(r.rows[0]);
  },

  async iniciarTempoRoadmap(id) {
    await this._ensureRoadmapDefaults();
    const r = await this.queryWithRetry(
      `UPDATE roadmap_items SET
         em_andamento = TRUE,
         ultimo_inicio = COALESCE(ultimo_inicio, CURRENT_TIMESTAMP),
         updated_at = CURRENT_TIMESTAMP
       WHERE id = $1 RETURNING *`,
      [id]
    );
    if (r.rows.length === 0) throw new Error('Item do roadmap não encontrado');
    return toCamelCase(r.rows[0]);
  },

  async pausarTempoRoadmap(id) {
    await this._ensureRoadmapDefaults();
    const r = await this.queryWithRetry(
      `UPDATE roadmap_items SET
         em_andamento = FALSE,
         updated_at = CURRENT_TIMESTAMP
       WHERE id = $1 RETURNING *`,
      [id]
    );
    if (r.rows.length === 0) throw new Error('Item do roadmap não encontrado');
    return toCamelCase(r.rows[0]);
  },

  async pararTempoRoadmap(id, tempoDecorrido) {
    await this._ensureRoadmapDefaults();
    const r = await this.queryWithRetry(
      `UPDATE roadmap_items SET
         tempo_acumulado = tempo_acumulado + $2,
         em_andamento = FALSE,
         ultimo_inicio = NULL,
         updated_at = CURRENT_TIMESTAMP
       WHERE id = $1 RETURNING *`,
      [id, parseInt(tempoDecorrido, 10) || 0]
    );
    if (r.rows.length === 0) throw new Error('Item do roadmap não encontrado');
    return toCamelCase(r.rows[0]);
  },

  async getRoadmapConfig() {
    await this._ensureRoadmapDefaults();
    const r = await this.queryWithRetry('SELECT * FROM roadmap_config LIMIT 1');
    if (r.rows.length === 0) return { colunaConcluir: 'lancado' };
    return toCamelCase(r.rows[0]);
  },

  async updateRoadmapConfig(dados) {
    await this._ensureRoadmapDefaults();
    const r = await this.queryWithRetry(
      `UPDATE roadmap_config SET coluna_concluir = $1, updated_at = CURRENT_TIMESTAMP RETURNING *`,
      [dados.colunaConcluir || 'lancado']
    );
    if (r.rows.length === 0) throw new Error('Configuração não encontrada');
    return toCamelCase(r.rows[0]);
  },

  async getRoadmapColunas() {
    await this._ensureRoadmapDefaults();
    const r = await this.queryWithRetry('SELECT * FROM roadmap_colunas ORDER BY ordem ASC, created_at ASC');
    return r.rows.map(row => toCamelCase(row));
  },

  async createRoadmapColuna({ label, cor, corFundo }) {
    await this._ensureRoadmapDefaults();
    const id = this.generateId();
    const key = label.toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || 'coluna';
    const existing = await this.queryWithRetry('SELECT COUNT(*) FROM roadmap_colunas WHERE key LIKE $1', [key + '%']);
    const count = parseInt(existing.rows[0].count, 10);
    const finalKey = count > 0 ? `${key}_${count + 1}` : key;
    const maxOrdem = await this.queryWithRetry('SELECT COALESCE(MAX(ordem), -1) + 1 AS next FROM roadmap_colunas');
    const ordem = maxOrdem.rows[0].next;
    const r = await this.queryWithRetry(
      'INSERT INTO roadmap_colunas (id, key, label, cor, cor_fundo, ordem) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
      [id, finalKey, label, cor || '#6b7280', corFundo || '#f3f4f6', ordem]
    );
    return toCamelCase(r.rows[0]);
  },

  async updateRoadmapColunasOrdem(colunas) {
    await this._ensureRoadmapDefaults();
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      for (const { id, ordem } of colunas) {
        await client.query('UPDATE roadmap_colunas SET ordem = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $1', [id, ordem]);
      }
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  },

  async deleteRoadmapColuna(id) {
    await this._ensureRoadmapDefaults();
    const colRes = await this.queryWithRetry('SELECT * FROM roadmap_colunas WHERE id = $1', [id]);
    if (colRes.rows.length === 0) throw new Error('Coluna não encontrada');
    const col = toCamelCase(colRes.rows[0]);
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        `UPDATE roadmap_items SET depende_de = NULL WHERE depende_de IN (SELECT id FROM roadmap_items WHERE status = $1)`,
        [col.key]
      );
      await client.query('DELETE FROM roadmap_items WHERE status = $1', [col.key]);
      await client.query('DELETE FROM roadmap_colunas WHERE id = $1', [id]);
      await client.query('COMMIT');
      return col;
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  },
};
