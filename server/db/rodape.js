// ═══════════════════════════════════════════════════════════════════════════
// server/db/rodape.js
// Domínio Rodapé + Notificações de versão do data-layer (#15 A): config, colunas,
// links, bottom-links, commits pendentes e versao_notificacoes. Movido verbatim
// de database-pg.js e colado no Database.prototype via Object.assign (core).
// Só usa this.* — sem símbolos de módulo.
// ═══════════════════════════════════════════════════════════════════════════
'use strict';

module.exports = {
  async obterRodapeCompleto() {
    const [confRes, colunasRes, linksRes, bottomRes] = await Promise.all([
      this.pool.query(`SELECT chave, valor FROM rodape_configuracoes`),
      this.pool.query(`SELECT * FROM rodape_colunas ORDER BY ordem ASC, created_at ASC`),
      this.pool.query(`SELECT * FROM rodape_links ORDER BY ordem ASC, created_at ASC`),
      this.pool.query(`SELECT * FROM rodape_bottom_links ORDER BY ordem ASC, created_at ASC`).catch(() => ({ rows: [] })),
    ]);

    const configuracoes = {};
    for (const row of confRes.rows) configuracoes[row.chave] = row.valor;

    const linksMap = {};
    for (const link of linksRes.rows) {
      if (!linksMap[link.coluna_id]) linksMap[link.coluna_id] = [];
      linksMap[link.coluna_id].push({
        id: link.id, coluna_id: link.coluna_id, texto: link.texto,
        link: link.link, ehLink: link.eh_link, ordem: link.ordem,
      });
    }

    const colunas = colunasRes.rows.map(col => ({
      id: col.id, titulo: col.titulo, ordem: col.ordem, links: linksMap[col.id] || [],
    }));

    const bottomLinks = bottomRes.rows.map(row => ({
      id: row.id, texto: row.texto, link: row.link, ativo: row.ativo, ordem: row.ordem,
    }));

    return { configuracoes, colunas, bottomLinks };
  },

  async obterRodapeConfiguracoes() {
    const r = await this.pool.query(`SELECT chave, valor FROM rodape_configuracoes`);
    const obj = {};
    for (const row of r.rows) obj[row.chave] = row.valor;
    return obj;
  },

  async atualizarRodapeConfig(chave, valor) {
    const now = new Date().toISOString();
    const r = await this.pool.query(
      `INSERT INTO rodape_configuracoes (chave, valor, updated_at)
       VALUES ($1, $2, $3)
       ON CONFLICT (chave) DO UPDATE SET valor = $2, updated_at = $3
       RETURNING *`,
      [chave, valor, now]
    );
    return r.rows[0];
  },

  async obterRodapeColunas() {
    const r = await this.pool.query(`SELECT * FROM rodape_colunas ORDER BY ordem ASC, created_at ASC`);
    return r.rows;
  },

  async criarRodapeColuna(titulo) {
    const id = 'col-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7);
    const now = new Date().toISOString();
    const ordemRes = await this.pool.query(`SELECT COALESCE(MAX(ordem), -1) + 1 AS prox FROM rodape_colunas`);
    const ordem = ordemRes.rows[0].prox;
    const r = await this.pool.query(
      `INSERT INTO rodape_colunas (id, titulo, ordem, created_at, updated_at) VALUES ($1, $2, $3, $4, $4) RETURNING *`,
      [id, titulo, ordem, now]
    );
    return r.rows[0];
  },

  async atualizarRodapeColuna(id, titulo) {
    const now = new Date().toISOString();
    const r = await this.pool.query(
      `UPDATE rodape_colunas SET titulo = $1, updated_at = $2 WHERE id = $3 RETURNING *`,
      [titulo, now, id]
    );
    if (r.rows.length === 0) throw new Error('Coluna não encontrada');
    return r.rows[0];
  },

  async deletarRodapeColuna(id) {
    const r = await this.pool.query(`DELETE FROM rodape_colunas WHERE id = $1 RETURNING *`, [id]);
    if (r.rows.length === 0) throw new Error('Coluna não encontrada');
    return r.rows[0];
  },

  async atualizarOrdemColunas(colunaIds) {
    const now = new Date().toISOString();
    for (let i = 0; i < colunaIds.length; i++) {
      await this.pool.query(`UPDATE rodape_colunas SET ordem = $1, updated_at = $2 WHERE id = $3`, [i, now, colunaIds[i]]);
    }
  },

  async obterRodapeLinks() {
    const r = await this.pool.query(
      `SELECT rl.*, rc.titulo AS coluna_titulo FROM rodape_links rl
       LEFT JOIN rodape_colunas rc ON rl.coluna_id = rc.id
       ORDER BY rc.ordem ASC, rl.ordem ASC, rl.created_at ASC`
    );
    return r.rows.map(row => ({
      id: row.id, colunaId: row.coluna_id, texto: row.texto,
      link: row.link, ehLink: row.eh_link, ordem: row.ordem, colunaTitulo: row.coluna_titulo,
    }));
  },

  async criarRodapeLink({ coluna_id, texto, link, eh_link }) {
    const id = 'lnk-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7);
    const now = new Date().toISOString();
    const ordemRes = await this.pool.query(
      `SELECT COALESCE(MAX(ordem), -1) + 1 AS prox FROM rodape_links WHERE coluna_id = $1`, [coluna_id]
    );
    const ordem = ordemRes.rows[0].prox;
    const ehLink = eh_link !== undefined ? eh_link : (link && link.trim() !== '');
    const linkVal = ehLink ? (link || '') : '';
    const r = await this.pool.query(
      `INSERT INTO rodape_links (id, coluna_id, texto, link, eh_link, ordem, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $7) RETURNING *`,
      [id, coluna_id, texto, linkVal, ehLink, ordem, now]
    );
    return {
      id: r.rows[0].id, colunaId: r.rows[0].coluna_id, texto: r.rows[0].texto,
      link: r.rows[0].link, ehLink: r.rows[0].eh_link, ordem: r.rows[0].ordem,
    };
  },

  async atualizarRodapeLink(id, { texto, link, eh_link, coluna_id }) {
    const now = new Date().toISOString();
    const fields = [];
    const values = [id];
    if (texto !== undefined)    { values.push(texto);    fields.push(`texto = $${values.length}`); }
    if (eh_link !== undefined)  { values.push(eh_link);  fields.push(`eh_link = $${values.length}`); }
    if (link !== undefined || eh_link === false) {
      const linkVal = eh_link === false ? '' : (link || '');
      values.push(linkVal); fields.push(`link = $${values.length}`);
    }
    if (coluna_id !== undefined) { values.push(coluna_id); fields.push(`coluna_id = $${values.length}`); }
    values.push(now); fields.push(`updated_at = $${values.length}`);
    const r = await this.pool.query(
      `UPDATE rodape_links SET ${fields.join(', ')} WHERE id = $1 RETURNING *`, values
    );
    if (r.rows.length === 0) throw new Error('Link não encontrado');
    return {
      id: r.rows[0].id, colunaId: r.rows[0].coluna_id, texto: r.rows[0].texto,
      link: r.rows[0].link, ehLink: r.rows[0].eh_link, ordem: r.rows[0].ordem,
    };
  },

  async deletarRodapeLink(id) {
    const r = await this.pool.query(`DELETE FROM rodape_links WHERE id = $1 RETURNING *`, [id]);
    if (r.rows.length === 0) throw new Error('Link não encontrado');
    return r.rows[0];
  },

  async atualizarOrdemLinks(linkIds) {
    const now = new Date().toISOString();
    for (let i = 0; i < linkIds.length; i++) {
      await this.pool.query(`UPDATE rodape_links SET ordem = $1, updated_at = $2 WHERE id = $3`, [i, now, linkIds[i]]);
    }
  },

  // ========== RODAPÉ — BOTTOM LINKS ==========

  async obterRodapeBottomLinksAdmin() {
    const r = await this.pool.query(`SELECT * FROM rodape_bottom_links ORDER BY ordem ASC, created_at ASC`);
    return r.rows.map(row => ({ id: row.id, texto: row.texto, link: row.link, ativo: row.ativo, ordem: row.ordem }));
  },

  async criarRodapeBottomLink({ texto, link, ativo }) {
    const id = 'btm-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7);
    const now = new Date().toISOString();
    const ordemRes = await this.pool.query(`SELECT COALESCE(MAX(ordem), -1) + 1 AS prox FROM rodape_bottom_links`);
    const ordem = ordemRes.rows[0].prox;
    const r = await this.pool.query(
      `INSERT INTO rodape_bottom_links (id, texto, link, ativo, ordem, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $6) RETURNING *`,
      [id, texto, link || '', ativo !== false, ordem, now]
    );
    const row = r.rows[0];
    return { id: row.id, texto: row.texto, link: row.link, ativo: row.ativo, ordem: row.ordem };
  },

  async atualizarRodapeBottomLink(id, { texto, link, ativo }) {
    const now = new Date().toISOString();
    const fields = [];
    const values = [id];
    if (texto !== undefined) { values.push(texto); fields.push(`texto = $${values.length}`); }
    if (link  !== undefined) { values.push(link);  fields.push(`link = $${values.length}`); }
    if (ativo !== undefined) { values.push(ativo); fields.push(`ativo = $${values.length}`); }
    values.push(now); fields.push(`updated_at = $${values.length}`);
    const r = await this.pool.query(
      `UPDATE rodape_bottom_links SET ${fields.join(', ')} WHERE id = $1 RETURNING *`, values
    );
    if (r.rows.length === 0) throw new Error('Link não encontrado');
    const row = r.rows[0];
    return { id: row.id, texto: row.texto, link: row.link, ativo: row.ativo, ordem: row.ordem };
  },

  async deletarRodapeBottomLink(id) {
    const r = await this.pool.query(`DELETE FROM rodape_bottom_links WHERE id = $1 RETURNING *`, [id]);
    if (r.rows.length === 0) throw new Error('Link não encontrado');
    return r.rows[0];
  },

  async atualizarOrdemBottomLinks(linkIds) {
    const now = new Date().toISOString();
    for (let i = 0; i < linkIds.length; i++) {
      await this.pool.query(`UPDATE rodape_bottom_links SET ordem = $1, updated_at = $2 WHERE id = $3`, [i, now, linkIds[i]]);
    }
  },

  // ========== RODAPÉ — COMMIT PENDENTE & NOTIFICAÇÕES ==========

  async obterCommitsPendentes() {
    const versaoRes = await this.pool.query(
      `SELECT valor FROM rodape_configuracoes WHERE chave = 'versao_sistema'`
    );
    const versaoAtual = versaoRes.rows.length > 0 ? (versaoRes.rows[0].valor || '') : '';

    const r = await this.pool.query(
      `SELECT commit_hash, mensagem, data, detectado_em
         FROM commits_pendentes
         ORDER BY detectado_em ASC`
    );

    return {
      versaoAtual,
      commits: r.rows.map(row => ({
        commitHash: row.commit_hash,
        mensagem: row.mensagem || '',
        data: row.data || '',
        detectadoEm: row.detectado_em,
      })),
    };
  },

  async confirmarCommit({ action, novaVersao, mensagem, data, commitHash, rolesNotificados = [], manterSessionId }) {
    const now = new Date().toISOString();
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      // Marca este commit como confirmado (compat com código antigo) e remove da fila
      await client.query(
        `INSERT INTO rodape_configuracoes (chave, valor, updated_at)
         VALUES ('ultimo_commit_confirmado', $1, $2)
         ON CONFLICT (chave) DO UPDATE SET valor = $1, updated_at = $2`,
        [commitHash, now]
      );
      await client.query(`DELETE FROM commits_pendentes WHERE commit_hash = $1`, [commitHash]);

      if (action === 'ignorar') {
        await client.query('COMMIT');
        return { ok: true };
      }

      const novoItem = `<li><strong>${data}</strong> — ${mensagem}</li>`;
      const notasRes = await client.query(`SELECT valor FROM rodape_configuracoes WHERE chave = 'notas_versao'`);
      let notas = notasRes.rows.length > 0 ? (notasRes.rows[0].valor || '') : '';

      if (action === 'nova_versao' && novaVersao) {
        // Detecta se a seção desta versão já existe (caso de carrossel onde
        // o superadmin já criou a versão num commit anterior e agora processa
        // commits subsequentes com a mesma versão "sticky")
        const versaoAtualRes = await client.query(`SELECT valor FROM rodape_configuracoes WHERE chave = 'versao_sistema'`);
        const versaoAtual = versaoAtualRes.rows.length > 0 ? (versaoAtualRes.rows[0].valor || '') : '';
        const secaoJaExiste = versaoAtual === novaVersao && notas.includes(`<h2>Versão ${novaVersao}</h2>`);

        if (secaoJaExiste) {
          // Apenas adiciona o item na seção existente (não duplica cabeçalho)
          notas = notas.includes('<!--COMMITS-->')
            ? notas.replace('<!--COMMITS-->', `<!--COMMITS-->\n${novoItem}`)
            : notas.replace(
                `<h2>Versão ${novaVersao}</h2>`,
                `<h2>Versão ${novaVersao}</h2>\n<ul>\n<!--COMMITS-->\n${novoItem}\n</ul>`
              );
        } else {
          await client.query(
            `INSERT INTO rodape_configuracoes (chave, valor, updated_at)
             VALUES ('versao_sistema', $1, $2)
             ON CONFLICT (chave) DO UPDATE SET valor = $1, updated_at = $2`,
            [novaVersao, now]
          );

          const novaSecao = `<h2>Versão ${novaVersao}</h2>\n<h3>📋 Atualizações</h3>\n<ul>\n<!--COMMITS-->\n${novoItem}\n</ul>\n<hr>\n`;
          notas = notas.includes('<h2>') ? notas.replace('<h2>', novaSecao + '<h2>') : novaSecao + notas;
        }

        // Notificação aos usuários: UPSERT — se já existe (mesma versão sticky),
        // adiciona o item ao texto consolidado; senão cria nova entrada
        const existeNotifRes = await client.query(`SELECT texto FROM versao_notificacoes WHERE versao = $1`, [novaVersao]);
        if (existeNotifRes.rows.length > 0) {
          const textoAtual = existeNotifRes.rows[0].texto || '';
          const textoNovo = textoAtual ? `${textoAtual}\n• ${mensagem}` : `• ${mensagem}`;
          await client.query(
            `UPDATE versao_notificacoes
                SET texto = $2, roles = $3, criado_em = $4, tipo = 'versao', versao_referencia = $1
              WHERE versao = $1`,
            [novaVersao, textoNovo, JSON.stringify(rolesNotificados), now]
          );
          // Reseta vistas para que usuários revejam o card consolidado atualizado
          await client.query(`DELETE FROM versao_notificacoes_vistas WHERE versao = $1`, [novaVersao]).catch(() => {});
        } else {
          await client.query(
            `INSERT INTO versao_notificacoes (versao, texto, roles, criado_em, tipo, versao_referencia)
             VALUES ($1, $2, $3, $4, 'versao', $1)`,
            [novaVersao, mensagem, JSON.stringify(rolesNotificados), now]
          );
        }
      } else {
        // action === 'manter': adiciona o item na seção atual das notas
        notas = notas.includes('<!--COMMITS-->')
          ? notas.replace('<!--COMMITS-->', `<!--COMMITS-->\n${novoItem}`)
          : `<ul>\n<!--COMMITS-->\n${novoItem}\n</ul>\n` + notas;

        // Notifica usuários (consolidando todos os "manter" da mesma sessão num único card)
        if (manterSessionId && Array.isArray(rolesNotificados) && rolesNotificados.length > 0) {
          const versaoRefRes = await client.query(`SELECT valor FROM rodape_configuracoes WHERE chave = 'versao_sistema'`);
          const versaoRef = versaoRefRes.rows.length > 0 ? (versaoRefRes.rows[0].valor || '') : '';
          const chave = `m:${manterSessionId}`;
          const itemBullet = `• ${mensagem}`;

          const existeRes = await client.query(`SELECT texto FROM versao_notificacoes WHERE versao = $1`, [chave]);
          if (existeRes.rows.length > 0) {
            const textoAtual = existeRes.rows[0].texto || '';
            const textoNovo = textoAtual ? `${textoAtual}\n${itemBullet}` : itemBullet;
            await client.query(
              `UPDATE versao_notificacoes
                  SET texto = $2, roles = $3, criado_em = $4, tipo = 'aviso', versao_referencia = $5
                WHERE versao = $1`,
              [chave, textoNovo, JSON.stringify(rolesNotificados), now, versaoRef]
            );
            // Reseta vistas para que usuários que abriram antes vejam a nova consolidação
            await client.query(`DELETE FROM versao_notificacoes_vistas WHERE versao = $1`, [chave]).catch(() => {});
          } else {
            await client.query(
              `INSERT INTO versao_notificacoes (versao, texto, roles, criado_em, tipo, versao_referencia)
               VALUES ($1, $2, $3, $4, 'aviso', $5)`,
              [chave, itemBullet, JSON.stringify(rolesNotificados), now, versaoRef]
            );
          }
        }
      }

      await client.query(
        `INSERT INTO rodape_configuracoes (chave, valor, updated_at) VALUES ('notas_versao', $1, $2)
         ON CONFLICT (chave) DO UPDATE SET valor = $1, updated_at = $2`,
        [notas, now]
      );

      await client.query('COMMIT');
      return { ok: true };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  },

  async obterNotificacaoVersao(userId, userRole) {
    const r = await this.pool.query(
      `SELECT n.versao, n.texto, n.roles, n.criado_em, n.tipo, n.versao_referencia
         FROM versao_notificacoes n
         LEFT JOIN versao_notificacoes_vistas v
           ON v.versao = n.versao AND v.user_id = $1
        WHERE v.versao IS NULL
        ORDER BY n.criado_em ASC`,
      [userId]
    ).catch(() => ({ rows: [] }));

    const versoes = [];
    for (const row of r.rows) {
      let roles = [];
      try { roles = JSON.parse(row.roles || '[]'); } catch { roles = []; }
      if (!roles.includes(userRole)) continue;
      versoes.push({
        versao: row.versao,
        texto: row.texto || '',
        criadoEm: row.criado_em,
        tipo: row.tipo || 'versao',
        versaoReferencia: row.versao_referencia || row.versao,
      });
    }

    if (versoes.length === 0) return { notificar: false, versoes: [] };
    return { notificar: true, versoes };
  },

  async marcarVersaoVista(userId, versao) {
    await this.pool.query(
      `INSERT INTO versao_notificacoes_vistas (user_id, versao) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [userId, versao]
    ).catch(() => {});
  },
};
