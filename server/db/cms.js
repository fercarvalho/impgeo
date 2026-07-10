// ═══════════════════════════════════════════════════════════════════════════
// server/db/cms.js
// Domínio CMS do data-layer (#15 A): FAQ, Legal/LGPD (termos/privacidade/cookies)
// e Documentação. Métodos movidos verbatim de database-pg.js e colados no
// Database.prototype via Object.assign (core). `this` = a instância db.
// (Roadmap e Rodapé virão em rodadas seguintes.)
// ═══════════════════════════════════════════════════════════════════════════
'use strict';

const { toCamelCase } = require('./_shared');

module.exports = {
  // ========== FAQ ==========

  async obterFAQ(userRole = 'guest') {
    try {
      const allowed = this._visibilityFor(userRole);
      const placeholders = allowed.map((_, i) => `$${i + 1}`).join(', ');
      const r = await this.pool.query(
        `SELECT id, pergunta, resposta, ordem, visibility FROM faq
         WHERE ativo = true AND visibility IN (${placeholders})
         ORDER BY ordem ASC, created_at ASC`,
        allowed
      );
      return r.rows.map(row => toCamelCase(row));
    } catch (e) {
      console.error('Erro ao buscar FAQ:', e);
      return [];
    }
  },

  async obterFAQAdmin() {
    try {
      const r = await this.pool.query(
        `SELECT * FROM faq ORDER BY ordem ASC, created_at ASC`
      );
      return r.rows.map(row => toCamelCase(row));
    } catch (e) {
      console.error('Erro ao buscar FAQ (admin):', e);
      return [];
    }
  },

  async criarFAQ({ pergunta, resposta, visibility = 'todos' }) {
    const id = this.generateId();
    const now = new Date().toISOString();
    const validVisibility = ['todos', 'usuarios', 'admins'].includes(visibility) ? visibility : 'todos';
    const ordemRes = await this.pool.query(
      'SELECT COALESCE(MAX(ordem), -1) + 1 AS prox FROM faq'
    );
    const ordem = ordemRes.rows[0].prox;
    const r = await this.pool.query(
      `INSERT INTO faq (id, pergunta, resposta, ativo, ordem, visibility, created_at, updated_at)
       VALUES ($1, $2, $3, true, $4, $5, $6, $6) RETURNING *`,
      [id, pergunta, resposta, ordem, validVisibility, now]
    );
    return toCamelCase(r.rows[0]);
  },

  async atualizarFAQ(id, { pergunta, resposta, ativo, visibility }) {
    const fields = [];
    const values = [id];
    let i = 2;
    if (pergunta !== undefined)    { fields.push(`pergunta = $${i++}`);    values.push(pergunta); }
    if (resposta !== undefined)    { fields.push(`resposta = $${i++}`);    values.push(resposta); }
    if (ativo !== undefined)       { fields.push(`ativo = $${i++}`);       values.push(ativo); }
    if (visibility !== undefined)  {
      const v = ['todos', 'usuarios', 'admins'].includes(visibility) ? visibility : 'todos';
      fields.push(`visibility = $${i++}`);
      values.push(v);
    }
    fields.push(`updated_at = $${i++}`);
    values.push(new Date().toISOString());
    const r = await this.pool.query(
      `UPDATE faq SET ${fields.join(', ')} WHERE id = $1 RETURNING *`,
      values
    );
    if (r.rows.length === 0) throw new Error('Item FAQ não encontrado');
    return toCamelCase(r.rows[0]);
  },

  async deletarFAQ(id) {
    const r = await this.pool.query(
      'DELETE FROM faq WHERE id = $1 RETURNING *',
      [id]
    );
    if (r.rows.length === 0) throw new Error('Item FAQ não encontrado');
    return toCamelCase(r.rows[0]);
  },

  async atualizarOrdemFAQ(faqIds) {
    const now = new Date().toISOString();
    for (let i = 0; i < faqIds.length; i++) {
      await this.pool.query(
        'UPDATE faq SET ordem = $1, updated_at = $2 WHERE id = $3',
        [i, now, faqIds[i]]
      );
    }
  },

  // ========== LEGAL (LGPD) ==========

  async _ensureLegalDefaults() {
    if (this.legalSchemaEnsured) return;
    if (this.legalSchemaEnsuring) { await this.legalSchemaEnsuring; return; }

    this.legalSchemaEnsuring = (async () => {
      await this.queryWithRetry(`
        CREATE TABLE IF NOT EXISTS termos_uso (
          id SERIAL PRIMARY KEY,
          conteudo TEXT NOT NULL DEFAULT '',
          versao INTEGER DEFAULT 1,
          updated_by VARCHAR(255) REFERENCES users(id) ON DELETE SET NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);
      await this.queryWithRetry(`
        CREATE TABLE IF NOT EXISTS politica_privacidade (
          id SERIAL PRIMARY KEY,
          conteudo TEXT NOT NULL DEFAULT '',
          versao INTEGER DEFAULT 1,
          updated_by VARCHAR(255) REFERENCES users(id) ON DELETE SET NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);
      await this.queryWithRetry(`
        CREATE TABLE IF NOT EXISTS cookie_banner_config (
          id SERIAL PRIMARY KEY,
          titulo VARCHAR(255) NOT NULL DEFAULT 'Política de Cookies',
          texto TEXT NOT NULL DEFAULT '',
          texto_botao_aceitar VARCHAR(100) DEFAULT 'Aceitar Todos',
          texto_botao_rejeitar VARCHAR(100) DEFAULT 'Rejeitar Todos',
          texto_botao_personalizar VARCHAR(100) DEFAULT 'Personalizar',
          texto_descricao_gerenciamento TEXT,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);
      await this.queryWithRetry(`
        CREATE TABLE IF NOT EXISTS cookie_categorias (
          id SERIAL PRIMARY KEY,
          chave VARCHAR(100) UNIQUE NOT NULL,
          nome VARCHAR(255) NOT NULL,
          descricao TEXT NOT NULL,
          ativo BOOLEAN DEFAULT TRUE,
          obrigatorio BOOLEAN DEFAULT FALSE,
          ordem INTEGER DEFAULT 0,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);
      await this.queryWithRetry(`
        CREATE TABLE IF NOT EXISTS cookie_consentimentos (
          id SERIAL PRIMARY KEY,
          user_id VARCHAR(255) REFERENCES users(id) ON DELETE CASCADE,
          preferencias JSONB NOT NULL,
          versao_termos INTEGER DEFAULT 1,
          versao_politica INTEGER DEFAULT 1,
          ip_address VARCHAR(45),
          user_agent TEXT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(user_id)
        )
      `);
      await this.queryWithRetry('CREATE INDEX IF NOT EXISTS idx_consentimentos_user ON cookie_consentimentos(user_id)');
      await this.queryWithRetry('ALTER TABLE users ADD COLUMN IF NOT EXISTS permissoes_legais JSONB DEFAULT \'{}\'');

      // Seeds
      const [tCount, pCount, cCount, catCount] = await Promise.all([
        this.queryWithRetry('SELECT COUNT(*) FROM termos_uso'),
        this.queryWithRetry('SELECT COUNT(*) FROM politica_privacidade'),
        this.queryWithRetry('SELECT COUNT(*) FROM cookie_banner_config'),
        this.queryWithRetry('SELECT COUNT(*) FROM cookie_categorias'),
      ]);

      if (parseInt(tCount.rows[0].count) === 0) {
        await this.queryWithRetry(`
          INSERT INTO termos_uso (conteudo, versao) VALUES ($1, 1)
        `, [`<h2>Termos de Uso</h2>
<p>Bem-vindo ao <strong>IMPGEO</strong>. Ao utilizar este sistema, você concorda com os presentes Termos de Uso.</p>
<h3>1. Aceitação dos Termos</h3>
<p>O uso deste sistema implica a aceitação integral destes Termos de Uso e da Política de Privacidade.</p>
<h3>2. Uso do Sistema</h3>
<p>O sistema é destinado exclusivamente ao uso por usuários autorizados. É proibido o compartilhamento de credenciais de acesso.</p>
<h3>3. Responsabilidades</h3>
<p>O usuário é responsável por manter a confidencialidade de suas credenciais e por todas as atividades realizadas em sua conta.</p>
<h3>4. Propriedade Intelectual</h3>
<p>Todo o conteúdo, design e funcionalidades do sistema são protegidos por direitos autorais e não podem ser reproduzidos sem autorização.</p>
<h3>5. Privacidade e LGPD</h3>
<p>O tratamento de dados pessoais é realizado em conformidade com a Lei Geral de Proteção de Dados (LGPD — Lei 13.709/2018). Consulte nossa Política de Privacidade para mais detalhes.</p>
<h3>6. Alterações</h3>
<p>Estes Termos podem ser atualizados a qualquer momento. A continuidade do uso do sistema após alterações implica aceitação dos novos Termos.</p>
<h3>7. Contato</h3>
<p>Para dúvidas sobre estes Termos, entre em contato com a equipe de suporte.</p>`]);
      }

      if (parseInt(pCount.rows[0].count) === 0) {
        await this.queryWithRetry(`
          INSERT INTO politica_privacidade (conteudo, versao) VALUES ($1, 1)
        `, [`<h2>Política de Privacidade</h2>
<p>Esta Política de Privacidade descreve como tratamos seus dados pessoais em conformidade com a <strong>Lei Geral de Proteção de Dados (LGPD — Lei 13.709/2018)</strong>.</p>
<h3>1. Dados Coletados</h3>
<p>Coletamos apenas os dados necessários para o funcionamento do sistema, incluindo: nome, e-mail, dados de acesso e informações de uso.</p>
<h3>2. Finalidade do Tratamento</h3>
<p>Seus dados são utilizados exclusivamente para: autenticação, personalização da experiência, segurança e conformidade legal.</p>
<h3>3. Base Legal (Art. 7º da LGPD)</h3>
<p>O tratamento é baseado no legítimo interesse do controlador, execução de contrato e cumprimento de obrigação legal.</p>
<h3>4. Compartilhamento de Dados</h3>
<p>Não compartilhamos seus dados com terceiros, exceto quando exigido por lei ou necessário para a prestação do serviço.</p>
<h3>5. Seus Direitos (Art. 18 da LGPD)</h3>
<p>Você tem direito a: acesso, correção, eliminação, portabilidade e revogação do consentimento a qualquer momento.</p>
<h3>6. Cookies</h3>
<p>Utilizamos cookies para melhorar sua experiência. Você pode gerenciar suas preferências a qualquer momento pelo banner de cookies.</p>
<h3>7. Segurança</h3>
<p>Adotamos medidas técnicas e organizacionais para proteger seus dados contra acesso não autorizado, perda ou destruição.</p>
<h3>8. Retenção de Dados</h3>
<p>Os dados são mantidos pelo tempo necessário para cumprir as finalidades descritas ou conforme exigido por lei.</p>
<h3>9. Contato — DPO</h3>
<p>Para exercer seus direitos ou esclarecer dúvidas sobre privacidade, entre em contato com nosso Encarregado de Proteção de Dados (DPO).</p>
<h3>10. Alterações</h3>
<p>Esta política pode ser atualizada periodicamente. Notificaremos alterações significativas através do sistema.</p>`]);
      }

      if (parseInt(cCount.rows[0].count) === 0) {
        await this.queryWithRetry(`
          INSERT INTO cookie_banner_config (titulo, texto, texto_botao_aceitar, texto_botao_rejeitar, texto_botao_personalizar, texto_descricao_gerenciamento)
          VALUES ($1, $2, $3, $4, $5, $6)
        `, [
          'Política de Cookies e Privacidade',
          'Utilizamos cookies para melhorar sua experiência e garantir a segurança do sistema, em conformidade com a LGPD (Lei 13.709/2018). Veja nossos',
          'Aceitar Todos',
          'Rejeitar Todos',
          'Personalizar',
          'Escolha quais tipos de cookies você deseja aceitar.',
        ]);
      }

      if (parseInt(catCount.rows[0].count) === 0) {
        await this.queryWithRetry(`
          INSERT INTO cookie_categorias (chave, nome, descricao, obrigatorio, ordem) VALUES
          ('necessary', 'Cookies Necessários', 'Essenciais para o funcionamento do sistema. Não podem ser desativados.', true, 0),
          ('analytics', 'Cookies Analíticos', 'Nos ajudam a entender como você usa o sistema para melhorarmos a experiência.', false, 1),
          ('marketing', 'Cookies de Marketing', 'Usados para personalizar conteúdo e anúncios relevantes.', false, 2)
        `);
      }

      this.legalSchemaEnsured = true;
    })();

    await this.legalSchemaEnsuring;
  },

  // ---- Termos de Uso ----
  async obterTermosUso() {
    await this._ensureLegalDefaults();
    const r = await this.queryWithRetry('SELECT id, conteudo, versao, updated_at FROM termos_uso ORDER BY id DESC LIMIT 1');
    if (r.rows.length === 0) return { conteudo: '', versao: 1, updatedAt: null };
    const row = r.rows[0];
    return { conteudo: row.conteudo, versao: row.versao, updatedAt: row.updated_at };
  },

  async obterTermosUsoAdmin() {
    await this._ensureLegalDefaults();
    const r = await this.queryWithRetry('SELECT id, conteudo, versao, updated_by, updated_at, created_at FROM termos_uso ORDER BY id DESC LIMIT 1');
    if (r.rows.length === 0) return null;
    const row = r.rows[0];
    return { id: row.id, conteudo: row.conteudo, versao: row.versao, updatedBy: row.updated_by, updatedAt: row.updated_at, createdAt: row.created_at };
  },

  async atualizarTermosUso(conteudo, userId) {
    await this._ensureLegalDefaults();
    const existing = await this.queryWithRetry('SELECT id, versao FROM termos_uso ORDER BY id DESC LIMIT 1');
    const now = new Date().toISOString();
    if (existing.rows.length === 0) {
      const r = await this.queryWithRetry('INSERT INTO termos_uso (conteudo, versao, updated_by, updated_at) VALUES ($1, 1, $2, $3) RETURNING *', [conteudo, userId, now]);
      return { conteudo: r.rows[0].conteudo, versao: r.rows[0].versao, updatedAt: r.rows[0].updated_at };
    }
    const novaVersao = (existing.rows[0].versao || 1) + 1;
    const r = await this.queryWithRetry('UPDATE termos_uso SET conteudo=$1, versao=$2, updated_by=$3, updated_at=$4 WHERE id=$5 RETURNING *', [conteudo, novaVersao, userId, now, existing.rows[0].id]);
    return { conteudo: r.rows[0].conteudo, versao: r.rows[0].versao, updatedAt: r.rows[0].updated_at };
  },

  // ---- Política de Privacidade ----
  async obterPoliticaPrivacidade() {
    await this._ensureLegalDefaults();
    const r = await this.queryWithRetry('SELECT id, conteudo, versao, updated_at FROM politica_privacidade ORDER BY id DESC LIMIT 1');
    if (r.rows.length === 0) return { conteudo: '', versao: 1, updatedAt: null };
    const row = r.rows[0];
    return { conteudo: row.conteudo, versao: row.versao, updatedAt: row.updated_at };
  },

  async obterPoliticaPrivacidadeAdmin() {
    await this._ensureLegalDefaults();
    const r = await this.queryWithRetry('SELECT id, conteudo, versao, updated_by, updated_at, created_at FROM politica_privacidade ORDER BY id DESC LIMIT 1');
    if (r.rows.length === 0) return null;
    const row = r.rows[0];
    return { id: row.id, conteudo: row.conteudo, versao: row.versao, updatedBy: row.updated_by, updatedAt: row.updated_at, createdAt: row.created_at };
  },

  async atualizarPoliticaPrivacidade(conteudo, userId) {
    await this._ensureLegalDefaults();
    const existing = await this.queryWithRetry('SELECT id, versao FROM politica_privacidade ORDER BY id DESC LIMIT 1');
    const now = new Date().toISOString();
    if (existing.rows.length === 0) {
      const r = await this.queryWithRetry('INSERT INTO politica_privacidade (conteudo, versao, updated_by, updated_at) VALUES ($1, 1, $2, $3) RETURNING *', [conteudo, userId, now]);
      return { conteudo: r.rows[0].conteudo, versao: r.rows[0].versao, updatedAt: r.rows[0].updated_at };
    }
    const novaVersao = (existing.rows[0].versao || 1) + 1;
    const r = await this.queryWithRetry('UPDATE politica_privacidade SET conteudo=$1, versao=$2, updated_by=$3, updated_at=$4 WHERE id=$5 RETURNING *', [conteudo, novaVersao, userId, now, existing.rows[0].id]);
    return { conteudo: r.rows[0].conteudo, versao: r.rows[0].versao, updatedAt: r.rows[0].updated_at };
  },

  // ---- Cookie Banner Config ----
  async obterCookieBannerConfig() {
    await this._ensureLegalDefaults();
    const r = await this.queryWithRetry('SELECT * FROM cookie_banner_config ORDER BY id DESC LIMIT 1');
    if (r.rows.length === 0) return null;
    const row = r.rows[0];
    return { titulo: row.titulo, texto: row.texto, textoBotaoAceitar: row.texto_botao_aceitar, textoBotaoRejeitar: row.texto_botao_rejeitar, textoBotaoPersonalizar: row.texto_botao_personalizar, textoDescricaoGerenciamento: row.texto_descricao_gerenciamento };
  },

  async atualizarCookieBannerConfig({ titulo, texto, textoBotaoAceitar, textoBotaoRejeitar, textoBotaoPersonalizar, textoDescricaoGerenciamento }) {
    await this._ensureLegalDefaults();
    const now = new Date().toISOString();
    const existing = await this.queryWithRetry('SELECT id FROM cookie_banner_config ORDER BY id DESC LIMIT 1');
    if (existing.rows.length === 0) {
      await this.queryWithRetry('INSERT INTO cookie_banner_config (titulo, texto, texto_botao_aceitar, texto_botao_rejeitar, texto_botao_personalizar, texto_descricao_gerenciamento, updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7)', [titulo, texto, textoBotaoAceitar, textoBotaoRejeitar, textoBotaoPersonalizar, textoDescricaoGerenciamento, now]);
    } else {
      await this.queryWithRetry('UPDATE cookie_banner_config SET titulo=$1,texto=$2,texto_botao_aceitar=$3,texto_botao_rejeitar=$4,texto_botao_personalizar=$5,texto_descricao_gerenciamento=$6,updated_at=$7 WHERE id=$8', [titulo, texto, textoBotaoAceitar, textoBotaoRejeitar, textoBotaoPersonalizar, textoDescricaoGerenciamento, now, existing.rows[0].id]);
    }
    return this.obterCookieBannerConfig();
  },

  // ---- Cookie Categorias ----
  async obterCookieCategorias(apenasAtivas = false) {
    await this._ensureLegalDefaults();
    const q = apenasAtivas ? 'SELECT * FROM cookie_categorias WHERE ativo=true ORDER BY ordem ASC' : 'SELECT * FROM cookie_categorias ORDER BY ordem ASC';
    const r = await this.queryWithRetry(q);
    return r.rows.map(row => ({ id: row.id, chave: row.chave, nome: row.nome, descricao: row.descricao, ativo: row.ativo, obrigatorio: row.obrigatorio, ordem: row.ordem }));
  },

  async criarCookieCategoria({ chave, nome, descricao, ativo = true, obrigatorio = false, ordem = 0 }) {
    await this._ensureLegalDefaults();
    const now = new Date().toISOString();
    const r = await this.queryWithRetry('INSERT INTO cookie_categorias (chave,nome,descricao,ativo,obrigatorio,ordem,created_at,updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$7) RETURNING *', [chave, nome, descricao, ativo, obrigatorio, ordem, now]);
    const row = r.rows[0];
    return { id: row.id, chave: row.chave, nome: row.nome, descricao: row.descricao, ativo: row.ativo, obrigatorio: row.obrigatorio, ordem: row.ordem };
  },

  async atualizarCookieCategoria(id, campos) {
    await this._ensureLegalDefaults();
    const now = new Date().toISOString();
    const fields = [];
    const values = [id];
    let i = 2;
    if (campos.nome !== undefined) { fields.push(`nome=$${i++}`); values.push(campos.nome); }
    if (campos.descricao !== undefined) { fields.push(`descricao=$${i++}`); values.push(campos.descricao); }
    if (campos.ativo !== undefined) { fields.push(`ativo=$${i++}`); values.push(campos.ativo); }
    if (campos.obrigatorio !== undefined) { fields.push(`obrigatorio=$${i++}`); values.push(campos.obrigatorio); }
    if (campos.ordem !== undefined) { fields.push(`ordem=$${i++}`); values.push(campos.ordem); }
    fields.push(`updated_at=$${i++}`); values.push(now);
    if (fields.length === 1) throw new Error('Nenhum campo para atualizar');
    const r = await this.queryWithRetry(`UPDATE cookie_categorias SET ${fields.join(',')} WHERE id=$1 RETURNING *`, values);
    if (r.rows.length === 0) throw new Error('Categoria não encontrada');
    const row = r.rows[0];
    return { id: row.id, chave: row.chave, nome: row.nome, descricao: row.descricao, ativo: row.ativo, obrigatorio: row.obrigatorio, ordem: row.ordem };
  },

  async deletarCookieCategoria(id) {
    await this._ensureLegalDefaults();
    const existing = await this.queryWithRetry('SELECT obrigatorio FROM cookie_categorias WHERE id=$1', [id]);
    if (existing.rows.length === 0) throw new Error('Categoria não encontrada');
    if (existing.rows[0].obrigatorio) throw new Error('Categorias obrigatórias não podem ser deletadas');
    await this.queryWithRetry('DELETE FROM cookie_categorias WHERE id=$1', [id]);
  },

  // ---- Consentimentos ----
  async obterConsentimentoUsuario(userId) {
    await this._ensureLegalDefaults();
    const r = await this.queryWithRetry('SELECT * FROM cookie_consentimentos WHERE user_id=$1', [userId]);
    if (r.rows.length === 0) return null;
    const row = r.rows[0];
    return { userId: row.user_id, preferencias: row.preferencias, versaoTermos: row.versao_termos, versaoPolitica: row.versao_politica, updatedAt: row.updated_at };
  },

  async salvarConsentimentoUsuario(userId, preferencias, versaoTermos, versaoPolitica, ipAddress, userAgent) {
    await this._ensureLegalDefaults();
    const now = new Date().toISOString();
    await this.queryWithRetry(`
      INSERT INTO cookie_consentimentos (user_id, preferencias, versao_termos, versao_politica, ip_address, user_agent, created_at, updated_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$7)
      ON CONFLICT (user_id) DO UPDATE SET preferencias=$2, versao_termos=$3, versao_politica=$4, ip_address=$5, user_agent=$6, updated_at=$7
    `, [userId, JSON.stringify(preferencias), versaoTermos, versaoPolitica, ipAddress, userAgent, now]);
  },

  // ---- Permissões Legais ----
  async obterPermissoesLegais(userId) {
    await this._ensureLegalDefaults();
    const r = await this.queryWithRetry('SELECT permissoes_legais FROM users WHERE id=$1', [userId]);
    if (r.rows.length === 0) throw new Error('Usuário não encontrado');
    return r.rows[0].permissoes_legais || {};
  },

  async atualizarPermissoesLegais(userId, permissoes) {
    await this._ensureLegalDefaults();
    const allowed = ['termos_uso', 'politica_privacidade', 'cookies'];
    const safe = {};
    for (const k of allowed) { safe[k] = permissoes[k] === true; }
    await this.queryWithRetry('UPDATE users SET permissoes_legais=$1 WHERE id=$2', [JSON.stringify(safe), userId]);
    return safe;
  },

  // ============================================================
  // DOCUMENTAÇÃO
  // ============================================================

  async _ensureDocDefaults() {
    if (this.docSchemaEnsured) return;
    if (this.docSchemaEnsuring) return this.docSchemaEnsuring;
    this.docSchemaEnsuring = (async () => {
      await this.queryWithRetry(`
        CREATE TABLE IF NOT EXISTS doc_sections (
          id VARCHAR(255) PRIMARY KEY,
          title VARCHAR(255) NOT NULL,
          ordem INTEGER DEFAULT 0,
          admin_only BOOLEAN DEFAULT false,
          visibility VARCHAR(20) DEFAULT 'todos',
          created_at TIMESTAMP,
          updated_at TIMESTAMP
        )
      `);
      // Migrações para bancos existentes
      await this.queryWithRetry(`ALTER TABLE doc_sections ADD COLUMN IF NOT EXISTS admin_only BOOLEAN DEFAULT false`);
      await this.queryWithRetry(`ALTER TABLE doc_sections ADD COLUMN IF NOT EXISTS visibility VARCHAR(20) DEFAULT 'todos'`);
      // Migra admin_only → visibility para seções que ainda não foram migradas
      await this.queryWithRetry(`
        UPDATE doc_sections SET visibility = 'admins' WHERE admin_only = true AND visibility = 'todos'
      `);
      await this.queryWithRetry(`
        CREATE TABLE IF NOT EXISTS doc_pages (
          id VARCHAR(255) PRIMARY KEY,
          section_id VARCHAR(255) REFERENCES doc_sections(id) ON DELETE CASCADE,
          title VARCHAR(255) NOT NULL,
          content TEXT DEFAULT '',
          ordem INTEGER DEFAULT 0,
          created_at TIMESTAMP,
          updated_at TIMESTAMP
        )
      `);
      // Migração da tabela faq
      await this.queryWithRetry(`ALTER TABLE faq ADD COLUMN IF NOT EXISTS admin_only BOOLEAN DEFAULT false`);
      await this.queryWithRetry(`ALTER TABLE faq ADD COLUMN IF NOT EXISTS visibility VARCHAR(20) DEFAULT 'todos'`);
      // Migra admin_only → visibility para perguntas que ainda não foram migradas
      await this.queryWithRetry(`
        UPDATE faq SET visibility = 'admins' WHERE admin_only = true AND visibility = 'todos'
      `);
      this.docSchemaEnsured = true;
    })();
    return this.docSchemaEnsuring;
  },

  // Retorna nível de visibilidade necessário para o role dado
  _visibilityFor(userRole) {
    if (userRole === 'admin' || userRole === 'superadmin') return ['todos', 'usuarios', 'admins'];
    if (userRole === 'user') return ['todos', 'usuarios'];
    return ['todos']; // guest
  },

  async obterDocumentacao(userRole = 'guest') {
    await this._ensureDocDefaults();
    const allowed = this._visibilityFor(userRole);
    const placeholders = allowed.map((_, i) => `$${i + 1}`).join(', ');
    const sections = await this.queryWithRetry(
      `SELECT id, title, ordem, visibility FROM doc_sections
       WHERE visibility IN (${placeholders})
       ORDER BY ordem ASC, created_at ASC`,
      allowed
    );
    const pages = await this.queryWithRetry(
      `SELECT id, section_id, title, content, ordem, updated_at FROM doc_pages ORDER BY ordem ASC, created_at ASC`
    );
    return sections.rows.map(s => ({
      id: s.id, title: s.title, order: s.ordem, visibility: s.visibility,
      pages: pages.rows.filter(p => p.section_id === s.id).map(p => ({
        id: p.id, sectionId: p.section_id, title: p.title,
        content: p.content, order: p.ordem, updatedAt: p.updated_at,
      })),
    }));
  },

  async criarDocSection({ title, visibility = 'todos' }) {
    await this._ensureDocDefaults();
    const id = this.generateId();
    const now = new Date().toISOString();
    const validVisibility = ['todos', 'usuarios', 'admins'].includes(visibility) ? visibility : 'todos';
    const maxOrdem = await this.queryWithRetry(`SELECT COALESCE(MAX(ordem),0)+1 AS next FROM doc_sections`);
    await this.queryWithRetry(
      `INSERT INTO doc_sections (id, title, ordem, visibility, created_at, updated_at) VALUES ($1,$2,$3,$4,$5,$5)`,
      [id, title, maxOrdem.rows[0].next, validVisibility, now]
    );
    return { id, title, order: maxOrdem.rows[0].next, visibility: validVisibility, pages: [] };
  },

  async atualizarDocSection(id, { title, visibility }) {
    await this._ensureDocDefaults();
    const now = new Date().toISOString();
    const fields = [];
    const values = [id];
    let i = 2;
    if (title !== undefined)      { fields.push(`title = $${i++}`);      values.push(title); }
    if (visibility !== undefined) {
      const v = ['todos', 'usuarios', 'admins'].includes(visibility) ? visibility : 'todos';
      fields.push(`visibility = $${i++}`);
      values.push(v);
    }
    fields.push(`updated_at = $${i++}`);
    values.push(now);
    await this.queryWithRetry(`UPDATE doc_sections SET ${fields.join(', ')} WHERE id=$1`, values);
    return { id, title, visibility };
  },

  async deletarDocSection(id) {
    await this._ensureDocDefaults();
    await this.queryWithRetry(`DELETE FROM doc_sections WHERE id=$1`, [id]);
  },

  async criarDocPage(sectionId, { title, content }) {
    await this._ensureDocDefaults();
    const id = this.generateId();
    const now = new Date().toISOString();
    const maxOrdem = await this.queryWithRetry(`SELECT COALESCE(MAX(ordem),0)+1 AS next FROM doc_pages WHERE section_id=$1`, [sectionId]);
    await this.queryWithRetry(
      `INSERT INTO doc_pages (id, section_id, title, content, ordem, created_at, updated_at) VALUES ($1,$2,$3,$4,$5,$6,$6)`,
      [id, sectionId, title, content || '', maxOrdem.rows[0].next, now]
    );
    return { id, sectionId, title, content: content || '', order: maxOrdem.rows[0].next, updatedAt: now };
  },

  async atualizarDocPage(id, { title, content }) {
    await this._ensureDocDefaults();
    const now = new Date().toISOString();
    await this.queryWithRetry(
      `UPDATE doc_pages SET title=$1, content=$2, updated_at=$3 WHERE id=$4`,
      [title, content, now, id]
    );
    return { id, title, content, updatedAt: now };
  },

  async deletarDocPage(id) {
    await this._ensureDocDefaults();
    await this.queryWithRetry(`DELETE FROM doc_pages WHERE id=$1`, [id]);
  },

  async reordenarDocSections(ids) {
    await this._ensureDocDefaults();
    const now = new Date().toISOString();
    for (let i = 0; i < ids.length; i++) {
      await this.queryWithRetry(`UPDATE doc_sections SET ordem=$1, updated_at=$2 WHERE id=$3`, [i, now, ids[i]]);
    }
  },

  async reordenarDocPages(ids) {
    await this._ensureDocDefaults();
    const now = new Date().toISOString();
    for (let i = 0; i < ids.length; i++) {
      await this.queryWithRetry(`UPDATE doc_pages SET ordem=$1, updated_at=$2 WHERE id=$3`, [i, now, ids[i]]);
    }
  },
};
