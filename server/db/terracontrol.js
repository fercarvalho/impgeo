// ═══════════════════════════════════════════════════════════════════════════
// server/db/terracontrol.js
// Domínio TerraControl do data-layer (#15 A): registros (CRUD impgeo + tc_user),
// aprovação, share links, tc_users (CRUD/prefs/access), refresh tokens, reset de
// senha, convites e notificações tc. Colado no Database.prototype via
// Object.assign. TC_USER_PUBLIC_FIELDS importado de ./_shared (antes era o
// estático Database.TC_USER_PUBLIC_FIELDS). Demais símbolos: só this.*.
// ═══════════════════════════════════════════════════════════════════════════
'use strict';

const { TC_USER_PUBLIC_FIELDS } = require('./_shared');

module.exports = {
  // Métodos para TerraControl
  async getAllTerraControl() {
    try {
      await this.ensureTerraControlSchema();
      // F: ownership+approval. LEFT JOIN com tc_users pra trazer username/nome
      // de quem criou (quando criado por tc_user via /api/tc-auth/me/records).
      // Quando criado por impgeo, tc_user.* fica null.
      const result = await this.queryWithRetry(
        `SELECT tc.*,
                tu.username   AS created_by_tc_username,
                tu.first_name AS created_by_tc_first_name,
                tu.last_name  AS created_by_tc_last_name
           FROM terracontrol tc
           LEFT JOIN tc_users tu ON tu.id = tc.created_by_tc_user_id
          ORDER BY tc.cod_imovel`
      );
      return result.rows;
    } catch (error) {
      console.error('Erro ao ler TerraControl:', error);
      return [];
    }
  },

  // Busca registros TerraControl filtrados por uma lista de IDs.
  // Usado pelo endpoint público para evitar carregar a tabela inteira
  // antes de filtrar em JS (vazamento de dados via memória do processo).
  async getTerraControlByIds(ids) {
    try {
      await this.ensureTerraControlSchema();
      if (!Array.isArray(ids) || ids.length === 0) return [];
      const normalizedIds = ids.map(id => String(id));
      const result = await this.queryWithRetry(
        'SELECT * FROM terracontrol WHERE id = ANY($1::text[]) ORDER BY cod_imovel',
        [normalizedIds]
      );
      return result.rows;
    } catch (error) {
      console.error('Erro ao ler TerraControl por IDs:', error);
      return [];
    }
  },

  async saveTerraControl(recordData) {
    try {
      await this.ensureTerraControlSchema();
      const id = this.generateId();
      // cod_imovel é gerado automaticamente pela SEQUENCE (migration 023):
      // ao omitir a coluna do INSERT, o DEFAULT nextval() preenche.
      // RETURNING * traz o valor final para o caller.
      //
      // F: ownership+approval. Aceita opcionalmente:
      //   - createdByUserId / createdByTcUserId — quem criou (depende do path)
      //   - approved — TRUE por default; impgeo cria já aprovado, tc_user
      //     passa explicitamente FALSE em saveTerraControlAsTcUser.
      const approved = recordData.approved !== false; // default TRUE
      const result = await this.queryWithRetry(
        `INSERT INTO terracontrol (
           id, imovel, municipio, mapa_url, matriculas, matriculas_dados, n_incra_ccir, ccir_dados, car, car_url, status_car, itr, itr_dados,
           geo_certificacao, geo_registro, area_total, reserva_legal, cultura1, area_cultura1,
           cultura2, area_cultura2, outros, area_outros, app_codigo_florestal, app_vegetada,
           app_nao_vegetada, remanescente_florestal, endereco, status, observacoes, created_at, updated_at,
           created_by_user_id, created_by_tc_user_id, approved, approved_at, approved_by_user_id
         )
         VALUES (
           $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
           $11, $12, $13, $14, $15, $16, $17, $18, $19, $20,
           $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31, $32,
           $33, $34, $35, $36, $37
         )
         RETURNING *`,
        [
          id,
          recordData.imovel || recordData.endereco || null,
          recordData.municipio || null,
          recordData.mapa_url || recordData.mapaUrl || null,
          recordData.matriculas || null,
          recordData.matriculas_dados ? JSON.stringify(recordData.matriculas_dados) : (recordData.matriculasDados ? JSON.stringify(recordData.matriculasDados) : null),
          recordData.n_incra_ccir || recordData.nIncraCcir || null,
          recordData.ccir_dados ? JSON.stringify(recordData.ccir_dados) : (recordData.ccirDados ? JSON.stringify(recordData.ccirDados) : null),
          recordData.car || null,
          recordData.car_url || recordData.carUrl || null,
          recordData.status_car || recordData.statusCar || recordData.status || null,
          recordData.itr || null,
          recordData.itr_dados ? JSON.stringify(recordData.itr_dados) : (recordData.itrDados ? JSON.stringify(recordData.itrDados) : null),
          recordData.geo_certificacao || recordData.geoCertificacao || 'NÃO',
          recordData.geo_registro || recordData.geoRegistro || 'NÃO',
          recordData.area_total ?? recordData.areaTotal ?? 0,
          recordData.reserva_legal ?? recordData.reservaLegal ?? 0,
          recordData.cultura1 || null,
          recordData.area_cultura1 ?? recordData.areaCultura1 ?? 0,
          recordData.cultura2 || null,
          recordData.area_cultura2 ?? recordData.areaCultura2 ?? 0,
          recordData.outros || null,
          recordData.area_outros ?? recordData.areaOutros ?? 0,
          recordData.app_codigo_florestal ?? recordData.appCodigoFlorestal ?? 0,
          recordData.app_vegetada ?? recordData.appVegetada ?? 0,
          recordData.app_nao_vegetada ?? recordData.appNaoVegetada ?? 0,
          recordData.remanescente_florestal ?? recordData.remanescenteFlorestal ?? 0,
          recordData.endereco || recordData.imovel || null,
          recordData.status || recordData.statusCar || null,
          recordData.observacoes || null,
          new Date().toISOString(),
          new Date().toISOString(),
          recordData.created_by_user_id || recordData.createdByUserId || null,
          recordData.created_by_tc_user_id || recordData.createdByTcUserId || null,
          approved,
          approved ? (recordData.approved_at || new Date().toISOString()) : null,
          approved ? (recordData.approved_by_user_id || recordData.approvedByUserId || null) : null,
        ]
      );
      return result.rows[0];
    } catch (error) {
      throw new Error('Erro ao salvar TerraControl: ' + error.message);
    }
  },

  async updateTerraControl(id, updatedData) {
    try {
      await this.ensureTerraControlSchema();
      // cod_imovel é imutável (identificador estável do imóvel) — não está
      // no SET. Caller que tentar mudá-lo é silenciosamente ignorado.
      const result = await this.queryWithRetry(
        `UPDATE terracontrol
         SET imovel = $1,
             municipio = $2,
             mapa_url = $3,
             matriculas = $4,
             matriculas_dados = $5,
             n_incra_ccir = $6,
             ccir_dados = $7,
             car = $8,
             car_url = $9,
             status_car = $10,
             itr = $11,
             itr_dados = $12,
             geo_certificacao = $13,
             geo_registro = $14,
             area_total = $15,
             reserva_legal = $16,
             cultura1 = $17,
             area_cultura1 = $18,
             cultura2 = $19,
             area_cultura2 = $20,
             outros = $21,
             area_outros = $22,
             app_codigo_florestal = $23,
             app_vegetada = $24,
             app_nao_vegetada = $25,
             remanescente_florestal = $26,
             endereco = $27,
             status = $28,
             observacoes = $29,
             updated_at = $30
         WHERE id = $31
         RETURNING *`,
        [
          updatedData.imovel || updatedData.endereco || null,
          updatedData.municipio || null,
          updatedData.mapa_url || updatedData.mapaUrl || null,
          updatedData.matriculas || null,
          updatedData.matriculas_dados ? JSON.stringify(updatedData.matriculas_dados) : (updatedData.matriculasDados ? JSON.stringify(updatedData.matriculasDados) : null),
          updatedData.n_incra_ccir || updatedData.nIncraCcir || null,
          updatedData.ccir_dados ? JSON.stringify(updatedData.ccir_dados) : (updatedData.ccirDados ? JSON.stringify(updatedData.ccirDados) : null),
          updatedData.car || null,
          updatedData.car_url || updatedData.carUrl || null,
          updatedData.status_car || updatedData.statusCar || updatedData.status || null,
          updatedData.itr || null,
          updatedData.itr_dados ? JSON.stringify(updatedData.itr_dados) : (updatedData.itrDados ? JSON.stringify(updatedData.itrDados) : null),
          updatedData.geo_certificacao || updatedData.geoCertificacao || 'NÃO',
          updatedData.geo_registro || updatedData.geoRegistro || 'NÃO',
          updatedData.area_total ?? updatedData.areaTotal ?? 0,
          updatedData.reserva_legal ?? updatedData.reservaLegal ?? 0,
          updatedData.cultura1 || null,
          updatedData.area_cultura1 ?? updatedData.areaCultura1 ?? 0,
          updatedData.cultura2 || null,
          updatedData.area_cultura2 ?? updatedData.areaCultura2 ?? 0,
          updatedData.outros || null,
          updatedData.area_outros ?? updatedData.areaOutros ?? 0,
          updatedData.app_codigo_florestal ?? updatedData.appCodigoFlorestal ?? 0,
          updatedData.app_vegetada ?? updatedData.appVegetada ?? 0,
          updatedData.app_nao_vegetada ?? updatedData.appNaoVegetada ?? 0,
          updatedData.remanescente_florestal ?? updatedData.remanescenteFlorestal ?? 0,
          updatedData.endereco || updatedData.imovel || null,
          updatedData.status || updatedData.statusCar || null,
          updatedData.observacoes || null,
          new Date().toISOString(),
          id
        ]
      );
      if (result.rows.length === 0) {
        throw new Error('TerraControl não encontrado');
      }
      return result.rows[0];
    } catch (error) {
      throw new Error('Erro ao atualizar TerraControl: ' + error.message);
    }
  },

  async deleteTerraControl(id) {
    try {
      const result = await this.queryWithRetry(
        'DELETE FROM terracontrol WHERE id = $1 RETURNING id',
        [id]
      );
      if (result.rows.length === 0) {
        throw new Error('TerraControl não encontrado');
      }
      return true;
    } catch (error) {
      throw new Error('Erro ao excluir TerraControl: ' + error.message);
    }
  },

  // =========================================================================
  // F: tc_users criam/editam/deletam seus próprios registros
  // =========================================================================

  // Tc_user cria registro. Força:
  //  - created_by_tc_user_id = tcUserId
  //  - approved = FALSE (admin precisa aprovar)
  //  - access automático em tc_user_record_access (criador sempre vê)
  // Tudo em transação — se algo falhar, nada fica meio-criado.
  async saveTerraControlAsTcUser(recordData, tcUserId) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      // Reaproveita a query do saveTerraControl mas dentro da transação,
      // garantindo created_by_tc_user_id + approved=FALSE
      const id = this.generateId();
      const result = await client.query(
        `INSERT INTO terracontrol (
           id, imovel, municipio, mapa_url, matriculas, matriculas_dados, n_incra_ccir, ccir_dados, car, car_url, status_car, itr, itr_dados,
           geo_certificacao, geo_registro, area_total, reserva_legal, cultura1, area_cultura1,
           cultura2, area_cultura2, outros, area_outros, app_codigo_florestal, app_vegetada,
           app_nao_vegetada, remanescente_florestal, endereco, status, observacoes, created_at, updated_at,
           created_by_tc_user_id, approved
         )
         VALUES (
           $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
           $11, $12, $13, $14, $15, $16, $17, $18, $19, $20,
           $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31, $32,
           $33, FALSE
         )
         RETURNING *`,
        [
          id,
          recordData.imovel || recordData.endereco || null,
          recordData.municipio || null,
          recordData.mapa_url || recordData.mapaUrl || null,
          recordData.matriculas || null,
          recordData.matriculas_dados ? JSON.stringify(recordData.matriculas_dados) : (recordData.matriculasDados ? JSON.stringify(recordData.matriculasDados) : null),
          recordData.n_incra_ccir || recordData.nIncraCcir || null,
          recordData.ccir_dados ? JSON.stringify(recordData.ccir_dados) : (recordData.ccirDados ? JSON.stringify(recordData.ccirDados) : null),
          recordData.car || null,
          recordData.car_url || recordData.carUrl || null,
          recordData.status_car || recordData.statusCar || recordData.status || null,
          recordData.itr || null,
          recordData.itr_dados ? JSON.stringify(recordData.itr_dados) : (recordData.itrDados ? JSON.stringify(recordData.itrDados) : null),
          recordData.geo_certificacao || recordData.geoCertificacao || 'NÃO',
          recordData.geo_registro || recordData.geoRegistro || 'NÃO',
          recordData.area_total ?? recordData.areaTotal ?? 0,
          recordData.reserva_legal ?? recordData.reservaLegal ?? 0,
          recordData.cultura1 || null,
          recordData.area_cultura1 ?? recordData.areaCultura1 ?? 0,
          recordData.cultura2 || null,
          recordData.area_cultura2 ?? recordData.areaCultura2 ?? 0,
          recordData.outros || null,
          recordData.area_outros ?? recordData.areaOutros ?? 0,
          recordData.app_codigo_florestal ?? recordData.appCodigoFlorestal ?? 0,
          recordData.app_vegetada ?? recordData.appVegetada ?? 0,
          recordData.app_nao_vegetada ?? recordData.appNaoVegetada ?? 0,
          recordData.remanescente_florestal ?? recordData.remanescenteFlorestal ?? 0,
          recordData.endereco || recordData.imovel || null,
          recordData.status || recordData.statusCar || null,
          recordData.observacoes || null,
          new Date().toISOString(),
          new Date().toISOString(),
          tcUserId,
        ]
      );
      const created = result.rows[0];

      // Acesso automático: criador vê o próprio registro
      await client.query(
        `INSERT INTO tc_user_record_access (tc_user_id, terracontrol_id, granted_by_user_id)
         VALUES ($1, $2, NULL)
         ON CONFLICT (tc_user_id, terracontrol_id) DO NOTHING`,
        [tcUserId, created.id]
      );

      await client.query('COMMIT');
      return created;
    } catch (error) {
      await client.query('ROLLBACK');
      throw new Error('Erro ao salvar TerraControl (tc_user): ' + error.message);
    } finally {
      client.release();
    }
  },

  // Edição por tc_user. Caller deve validar permissão via tcUserCanEditRecord
  // ANTES. Se o registro está aprovado, esta operação RESETA approved=FALSE
  // (item da spec: edição por tc_user força reanálise).
  async updateTerraControlByTcUser(id, updates) {
    const updated = await this.updateTerraControl(id, updates);
    // Reseta aprovação se estiver aprovado
    if (updated && updated.approved === true) {
      const r = await this.queryWithRetry(
        `UPDATE terracontrol
            SET approved = FALSE,
                approved_at = NULL,
                approved_by_user_id = NULL,
                updated_at = NOW()
          WHERE id = $1
        RETURNING *`,
        [id]
      );
      return r.rows[0];
    }
    return updated;
  },

  async deleteTerraControlByTcUser(id) {
    return this.deleteTerraControl(id);
  },

  // Aprova registro (admin path). Caller é authenticateToken+requireAdmin OR
  // módulo terracontrol. approvedByUserId vem de req.user.id.
  async approveTerraControlRecord(id, approvedByUserId) {
    const r = await this.queryWithRetry(
      `UPDATE terracontrol
          SET approved = TRUE,
              approved_at = NOW(),
              approved_by_user_id = $2,
              updated_at = NOW()
        WHERE id = $1
        RETURNING *`,
      [id, approvedByUserId]
    );
    if (r.rows.length === 0) throw new Error('Registro não encontrado');
    return r.rows[0];
  },

  async unapproveTerraControlRecord(id) {
    const r = await this.queryWithRetry(
      `UPDATE terracontrol
          SET approved = FALSE,
              approved_at = NULL,
              approved_by_user_id = NULL,
              updated_at = NOW()
        WHERE id = $1
        RETURNING *`,
      [id]
    );
    if (r.rows.length === 0) throw new Error('Registro não encontrado');
    return r.rows[0];
  },

  // Verifica permissão de EDIÇÃO de registro pelo tc_user.
  // edit_records_permission:
  //   'none'     → false sempre
  //   'created'  → record.created_by_tc_user_id === tcUserId
  //   'assigned' → record.id in tc_user_record_access (mas NÃO criado por ele)
  //   'all'      → tc_user tem acesso (assigned OR created)
  async tcUserCanEditRecord(tcUserId, recordId) {
    const r = await this.queryWithRetry(
      `SELECT
         (SELECT edit_records_permission FROM tc_users WHERE id = $1) AS perm,
         (SELECT created_by_tc_user_id FROM terracontrol WHERE id = $2) AS creator,
         EXISTS (
           SELECT 1 FROM tc_user_record_access
            WHERE tc_user_id = $1 AND terracontrol_id = $2
         ) AS has_access`,
      [tcUserId, recordId]
    );
    const row = r.rows[0];
    if (!row || !row.perm) return false;
    const isCreator = row.creator === tcUserId;
    switch (row.perm) {
      case 'none':     return false;
      case 'created':  return isCreator;
      case 'assigned': return row.has_access && !isCreator; // só designados, não os próprios
      case 'all':      return row.has_access || isCreator;
      default:         return false;
    }
  },

  // Verifica permissão de EXCLUSÃO.
  // delete_records_permission:
  //   'none'    → false sempre
  //   'created' → record.created_by_tc_user_id === tcUserId
  //   'all'     → tc_user tem acesso (assigned OR created)
  async tcUserCanDeleteRecord(tcUserId, recordId) {
    const r = await this.queryWithRetry(
      `SELECT
         (SELECT delete_records_permission FROM tc_users WHERE id = $1) AS perm,
         (SELECT created_by_tc_user_id FROM terracontrol WHERE id = $2) AS creator,
         EXISTS (
           SELECT 1 FROM tc_user_record_access
            WHERE tc_user_id = $1 AND terracontrol_id = $2
         ) AS has_access`,
      [tcUserId, recordId]
    );
    const row = r.rows[0];
    if (!row || !row.perm) return false;
    const isCreator = row.creator === tcUserId;
    switch (row.perm) {
      case 'none':    return false;
      case 'created': return isCreator;
      case 'all':     return row.has_access || isCreator;
      default:        return false;
    }
  },

  // Lista impgeo users que devem receber notificação de novo registro tc_user.
  // Regra: admin/superadmin (bypass) + users com módulo terracontrol explícito.
  async getImpgeoUsersWithTerraControlAccess() {
    const r = await this.queryWithRetry(
      `SELECT DISTINCT u.id, u.username, u.first_name, u.last_name, u.email,
                       COALESCE(u.tc_email_notifications, FALSE) AS tc_email_notifications
         FROM users u
         LEFT JOIN user_module_permissions ump
           ON ump.user_id = u.id AND ump.module_key = 'terracontrol'
        WHERE u.is_active <> FALSE
          AND (u.role IN ('admin','superadmin') OR ump.user_id IS NOT NULL)`
    );
    return r.rows;
  },

  async deleteMultipleTerraControl(ids) {
    // Substitui N round-trips dentro de transação por uma única query atômica.
    // ANY($1::text[]) é seguro contra SQL injection e ignora IDs inexistentes.
    if (!Array.isArray(ids) || ids.length === 0) {
      return { deletedCount: 0 };
    }
    try {
      const normalizedIds = ids.map(id => String(id));
      const result = await this.queryWithRetry(
        'DELETE FROM terracontrol WHERE id = ANY($1::text[]) RETURNING id',
        [normalizedIds]
      );
      return { deletedCount: result.rowCount };
    } catch (error) {
      throw new Error('Erro ao excluir TerraControl: ' + error.message);
    }
  },

  async ensureTerraControlSchema() {
    if (this.terracontrolSchemaEnsured) return;
    if (this.terracontrolSchemaEnsuring) {
      await this.terracontrolSchemaEnsuring;
      return;
    }

    this.terracontrolSchemaEnsuring = (async () => {
      await this.queryWithRetry('ALTER TABLE terracontrol ADD COLUMN IF NOT EXISTS car_url TEXT');
      await this.queryWithRetry('ALTER TABLE terracontrol ADD COLUMN IF NOT EXISTS matriculas_dados JSONB');
      await this.queryWithRetry('ALTER TABLE terracontrol ADD COLUMN IF NOT EXISTS itr_dados JSONB');
      await this.queryWithRetry('ALTER TABLE terracontrol ADD COLUMN IF NOT EXISTS ccir_dados JSONB');
    })()
      .then(() => {
        this.terracontrolSchemaEnsured = true;
      })
      .finally(() => {
        this.terracontrolSchemaEnsuring = null;
      });

    await this.terracontrolSchemaEnsuring;
  },

  async ensureShareLinksSchema() {
    if (this.shareLinksSchemaEnsured) return;
    if (this.shareLinksSchemaEnsuring) {
      await this.shareLinksSchemaEnsuring;
      return;
    }

    this.shareLinksSchemaEnsuring = this.queryWithRetry(
      'ALTER TABLE share_links ADD COLUMN IF NOT EXISTS selected_ids TEXT[]'
    )
      .then(() => {
        this.shareLinksSchemaEnsured = true;
      })
      .finally(() => {
        this.shareLinksSchemaEnsuring = null;
      });

    await this.shareLinksSchemaEnsuring;
  },

  // Métodos para Share Links
  async saveShareLink(token, name, expiresAt, passwordHash, selectedIds = null) {
    try {
      await this.ensureShareLinksSchema();
      const result = await this.queryWithRetry(
        `INSERT INTO share_links (token, name, password_hash, expires_at, selected_ids, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (token) DO UPDATE SET
           name = EXCLUDED.name,
           password_hash = EXCLUDED.password_hash,
           expires_at = EXCLUDED.expires_at,
           selected_ids = EXCLUDED.selected_ids,
           updated_at = EXCLUDED.updated_at
         RETURNING *`,
        [
          token,
          name || null,
          passwordHash || null,
          expiresAt || null,
          Array.isArray(selectedIds) ? selectedIds.map((id) => String(id)) : null,
          new Date().toISOString(),
          new Date().toISOString()
        ]
      );
      return result.rows[0];
    } catch (error) {
      throw new Error('Erro ao salvar link compartilhável: ' + error.message);
    }
  },

  async getShareLink(token) {
    try {
      const result = await this.queryWithRetry(
        'SELECT * FROM share_links WHERE token = $1',
        [token]
      );
      return result.rows[0] || null;
    } catch (error) {
      console.error('Erro ao buscar link compartilhável:', error);
      return null;
    }
  },

  async getAllShareLinks() {
    try {
      const result = await this.queryWithRetry('SELECT * FROM share_links ORDER BY created_at DESC');
      return result.rows;
    } catch (error) {
      console.error('Erro ao buscar links compartilháveis:', error);
      return [];
    }
  },

  async updateShareLink(token, updates) {
    try {
      const setClause = [];
      const values = [];
      let paramIndex = 1;

      if (updates.name !== undefined) {
        setClause.push(`name = $${paramIndex++}`);
        values.push(updates.name || null);
      }
      if (updates.passwordHash !== undefined) {
        setClause.push(`password_hash = $${paramIndex++}`);
        values.push(updates.passwordHash || null);
      }
      if (updates.expiresAt !== undefined) {
        setClause.push(`expires_at = $${paramIndex++}`);
        values.push(updates.expiresAt === '' ? null : updates.expiresAt);
      }

      setClause.push(`updated_at = $${paramIndex++}`);
      values.push(new Date().toISOString());
      values.push(token);

      const result = await this.queryWithRetry(
        `UPDATE share_links SET ${setClause.join(', ')} WHERE token = $${paramIndex} RETURNING *`,
        values
      );
      if (result.rows.length === 0) {
        throw new Error('Link compartilhável não encontrado');
      }
      return result.rows[0];
    } catch (error) {
      throw new Error('Erro ao atualizar link compartilhável: ' + error.message);
    }
  },

  // Auditoria de acesso público (migration 024). Falha silenciosa: nunca
  // bloquear o fluxo do usuário por causa de log — só registra console.error.
  async logShareLinkAccess({ token, action, status, ip, userAgent, document }) {
    try {
      await this.queryWithRetry(
        `INSERT INTO share_link_access_logs (token, action, status, ip, user_agent, document)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          String(token || ''),
          String(action || ''),
          String(status || ''),
          ip ? String(ip).slice(0, 64) : null,
          userAgent ? String(userAgent).slice(0, 2000) : null,
          document ? String(document).slice(0, 255) : null,
        ]
      );
    } catch (error) {
      console.error('Falha ao registrar acesso a share link:', error?.message || error);
    }
  },

  async deleteShareLink(token) {
    try {
      const result = await this.queryWithRetry(
        'DELETE FROM share_links WHERE token = $1 RETURNING token',
        [token]
      );
      if (result.rows.length === 0) {
        throw new Error('Link compartilhável não encontrado');
      }
      return true;
    } catch (error) {
      throw new Error('Erro ao excluir link compartilhável: ' + error.message);
    }
  },

  // =========================================================================
  // tc_users — usuários externos do TerraControl (migration 025)
  // =========================================================================


  async getTcUserByUsername(username) {
    try {
      const result = await this.queryWithRetry(
        'SELECT * FROM tc_users WHERE username = $1 LIMIT 1',
        [username]
      );
      return result.rows[0] || null;
    } catch (error) {
      console.error('Erro ao buscar tc_user por username:', error);
      return null;
    }
  },

  async getTcUserById(id) {
    try {
      const result = await this.queryWithRetry(
        'SELECT * FROM tc_users WHERE id = $1 LIMIT 1',
        [id]
      );
      return result.rows[0] || null;
    } catch (error) {
      console.error('Erro ao buscar tc_user por id:', error);
      return null;
    }
  },

  // Patch leve de preferências do tc_user. Allowlist controlada — não cobre
  // password/email/role; pra esses tem fluxos próprios. Hoje só atende
  // emailNotifications.
  async updateTcUserPreferences(id, prefs) {
    const sets = [];
    const params = [];
    if (Object.prototype.hasOwnProperty.call(prefs, 'emailNotifications')) {
      params.push(prefs.emailNotifications === true);
      sets.push(`email_notifications = $${params.length}`);
    }
    if (sets.length === 0) {
      return await this.getTcUserById(id);
    }
    params.push(id);
    const result = await this.queryWithRetry(
      `UPDATE tc_users SET ${sets.join(', ')}, updated_at = NOW()
       WHERE id = $${params.length}
       RETURNING *`,
      params
    );
    return result.rows[0] || null;
  },

  async getTcUserByEmail(email) {
    try {
      const normalized = String(email || '').trim().toLowerCase();
      if (!normalized) return null;
      const result = await this.queryWithRetry(
        'SELECT * FROM tc_users WHERE LOWER(email) = $1 LIMIT 1',
        [normalized]
      );
      return result.rows[0] || null;
    } catch (error) {
      console.error('Erro ao buscar tc_user por email:', error);
      return null;
    }
  },

  async getAllTcUsers() {
    try {
      const result = await this.queryWithRetry(
        `SELECT ${TC_USER_PUBLIC_FIELDS} FROM tc_users ORDER BY created_at DESC`
      );
      return result.rows;
    } catch (error) {
      console.error('Erro ao listar tc_users:', error);
      return [];
    }
  },

  async createTcUser(data) {
    // Caller é responsável pelo hash da senha (bcrypt.hash); aqui só insere.
    const id = data.id || this.generateId();
    try {
      const result = await this.queryWithRetry(
        `INSERT INTO tc_users (
           id, username, password, first_name, last_name, email, phone, cpf,
           birth_date, gender, address, photo_url, force_password_change,
           is_active, created_via, created_by_user_id, created_at, updated_at
         ) VALUES (
           $1, $2, $3, $4, $5, $6, $7, $8,
           $9, $10, $11, $12, $13,
           $14, $15, $16, NOW(), NOW()
         ) RETURNING *`,
        [
          id,
          data.username,
          data.password,
          data.firstName || data.first_name || null,
          data.lastName  || data.last_name  || null,
          data.email     || null,
          data.phone     || null,
          data.cpf       || null,
          data.birthDate || data.birth_date || null,
          data.gender    || null,
          data.address ? JSON.stringify(data.address) : null,
          data.photoUrl  || data.photo_url || null,
          data.forcePasswordChange === undefined ? false : !!data.forcePasswordChange,
          data.isActive === undefined ? true : !!data.isActive,
          data.createdVia || 'direct',
          data.createdByUserId || null
        ]
      );
      return result.rows[0];
    } catch (error) {
      throw new Error('Erro ao criar tc_user: ' + error.message);
    }
  },

  async updateTcUser(id, updates) {
    // Caller deve garantir que `password` (se vier) já está hasheado.
    const allowed = {
      username: updates.username,
      password: updates.password,
      first_name: updates.firstName ?? updates.first_name,
      last_name:  updates.lastName  ?? updates.last_name,
      email: updates.email,
      phone: updates.phone,
      cpf: updates.cpf,
      birth_date: updates.birthDate ?? updates.birth_date,
      gender: updates.gender,
      address: updates.address !== undefined ? (updates.address ? JSON.stringify(updates.address) : null) : undefined,
      photo_url: updates.photoUrl ?? updates.photo_url,
      force_password_change: updates.forcePasswordChange,
      is_active: updates.isActive,
      can_share: updates.canShare ?? updates.can_share,
      edit_records_permission: updates.editRecordsPermission ?? updates.edit_records_permission,
      delete_records_permission: updates.deleteRecordsPermission ?? updates.delete_records_permission,
      email_verified_at: updates.emailVerifiedAt ?? updates.email_verified_at,
      last_login: updates.lastLogin ?? updates.last_login,
    };
    const sets = [];
    const params = [];
    let idx = 1;
    for (const [col, val] of Object.entries(allowed)) {
      if (val === undefined) continue;
      sets.push(`${col} = $${idx++}`);
      params.push(val);
    }
    if (sets.length === 0) return this.getTcUserById(id);
    sets.push(`updated_at = NOW()`);
    params.push(id);
    try {
      const result = await this.queryWithRetry(
        `UPDATE tc_users SET ${sets.join(', ')} WHERE id = $${idx} RETURNING *`,
        params
      );
      if (result.rows.length === 0) throw new Error('tc_user não encontrado');
      return result.rows[0];
    } catch (error) {
      throw new Error('Erro ao atualizar tc_user: ' + error.message);
    }
  },

  async setTcUserLastLogin(id) {
    await this.queryWithRetry('UPDATE tc_users SET last_login = NOW() WHERE id = $1', [id]);
  },

  async deactivateTcUser(id) {
    await this.queryWithRetry('UPDATE tc_users SET is_active = FALSE, updated_at = NOW() WHERE id = $1', [id]);
  },

  async usernameTcUserExists(username) {
    const r = await this.queryWithRetry('SELECT 1 FROM tc_users WHERE username = $1 LIMIT 1', [username]);
    return r.rows.length > 0;
  },

  // Unicidade GLOBAL de username entre `users` (equipe impgeo) e `tc_users`
  // (clientes). Pré-requisito do login unificado em terracontrol.com.br: como
  // o mesmo formulário aceita as duas credenciais, um username não pode existir
  // nas duas tabelas ao mesmo tempo (senão o roteamento por tipo fica ambíguo).
  // Comparação case-insensitive porque impgeo permite maiúsculas e tc_users é
  // sempre lowercased. Retorna 'impgeo' | 'tc_user' | null.
  async findUsernameOwnerTable(username, { excludeUserId = null, excludeTcUserId = null } = {}) {
    const u = String(username || '').trim().toLowerCase();
    if (!u) return null;
    const imp = await this.queryWithRetry(
      'SELECT 1 FROM users WHERE LOWER(username) = $1 AND ($2::text IS NULL OR id <> $2) LIMIT 1',
      [u, excludeUserId]
    );
    if (imp.rows.length > 0) return 'impgeo';
    const tc = await this.queryWithRetry(
      'SELECT 1 FROM tc_users WHERE LOWER(username) = $1 AND ($2::text IS NULL OR id <> $2) LIMIT 1',
      [u, excludeTcUserId]
    );
    if (tc.rows.length > 0) return 'tc_user';
    return null;
  },

  // =========================================================================
  // tc_user_record_access — permissão granular por registro
  // =========================================================================

  async getTcUserRecordIds(tcUserId) {
    const r = await this.queryWithRetry(
      'SELECT terracontrol_id FROM tc_user_record_access WHERE tc_user_id = $1',
      [tcUserId]
    );
    return r.rows.map(row => row.terracontrol_id);
  },

  async getTcUserRecords(tcUserId, { onlyApproved = false } = {}) {
    // Retorna os registros completos que o tc_user tem acesso, ordenados por cod_imovel.
    // F: aceita filtro onlyApproved + traz nome do criador via LEFT JOIN.
    const r = await this.queryWithRetry(
      `SELECT tc.*,
              tu.username   AS created_by_tc_username,
              tu.first_name AS created_by_tc_first_name,
              tu.last_name  AS created_by_tc_last_name
         FROM terracontrol tc
         JOIN tc_user_record_access tura ON tura.terracontrol_id = tc.id
         LEFT JOIN tc_users tu ON tu.id = tc.created_by_tc_user_id
        WHERE tura.tc_user_id = $1
          AND ($2::BOOLEAN = FALSE OR tc.approved = TRUE)
        ORDER BY tc.cod_imovel`,
      [tcUserId, !!onlyApproved]
    );
    return r.rows;
  },

  async setTcUserRecordAccess(tcUserId, recordIds, grantedByUserId = null) {
    // Substitui completamente o conjunto: apaga os atuais e insere os novos.
    const ids = Array.isArray(recordIds) ? recordIds.map(String) : [];
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('DELETE FROM tc_user_record_access WHERE tc_user_id = $1', [tcUserId]);
      for (const recordId of ids) {
        await client.query(
          `INSERT INTO tc_user_record_access (tc_user_id, terracontrol_id, granted_by_user_id)
           VALUES ($1, $2, $3) ON CONFLICT (tc_user_id, terracontrol_id) DO NOTHING`,
          [tcUserId, recordId, grantedByUserId]
        );
      }
      await client.query('COMMIT');
      return { granted: ids.length };
    } catch (error) {
      await client.query('ROLLBACK');
      throw new Error('Erro ao definir acesso do tc_user: ' + error.message);
    } finally {
      client.release();
    }
  },

  async tcUserHasAccessToRecord(tcUserId, recordId) {
    const r = await this.queryWithRetry(
      'SELECT 1 FROM tc_user_record_access WHERE tc_user_id = $1 AND terracontrol_id = $2 LIMIT 1',
      [tcUserId, String(recordId)]
    );
    return r.rows.length > 0;
  },

  // Para o handler de /api/documents: confirma que o tc_user tem acesso ao
  // registro que contém o arquivo informado (compara contra car_url e
  // os campos JSONB matriculas_dados, itr_dados, ccir_dados).
  async tcUserHasAccessToDocument(tcUserId, fileUrlInDb) {
    const r = await this.queryWithRetry(
      `SELECT 1 FROM terracontrol tc
       JOIN tc_user_record_access tura ON tura.terracontrol_id = tc.id
       WHERE tura.tc_user_id = $1
         AND (
           tc.car_url = $2
           OR tc.matriculas_dados::text LIKE $3
           OR tc.itr_dados::text         LIKE $3
           OR tc.ccir_dados::text        LIKE $3
         )
       LIMIT 1`,
      [tcUserId, fileUrlInDb, `%${fileUrlInDb}%`]
    );
    return r.rows.length > 0;
  },

  // =========================================================================
  // tc_legacy_aliases — REMOVIDO na migration 031 (drop legacy support).
  // Os métodos getTcLegacyAlias e markTcLegacyAliasUsed foram removidos junto.
  // O handler /v/:token segue válido pra sub-share links gerados por tc_users.
  // =========================================================================

  // =========================================================================
  // tc_refresh_tokens — sessões tc_user
  // =========================================================================

  async insertTcRefreshToken({ tcUserId, tokenHash, expiresAt, ip, userAgent }) {
    const r = await this.queryWithRetry(
      `INSERT INTO tc_refresh_tokens (tc_user_id, token_hash, expires_at, ip, user_agent)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [tcUserId, tokenHash, expiresAt, ip ? String(ip).slice(0, 64) : null, userAgent ? String(userAgent).slice(0, 2000) : null]
    );
    return r.rows[0].id;
  },

  async getTcRefreshTokenByHash(tokenHash) {
    const r = await this.queryWithRetry(
      `SELECT * FROM tc_refresh_tokens
       WHERE token_hash = $1 AND revoked = FALSE AND expires_at > NOW()
       LIMIT 1`,
      [tokenHash]
    );
    return r.rows[0] || null;
  },

  async revokeTcRefreshToken(tokenHash, replacedBy = null) {
    await this.queryWithRetry(
      `UPDATE tc_refresh_tokens
       SET revoked = TRUE, revoked_at = NOW(), replaced_by = $2
       WHERE token_hash = $1`,
      [tokenHash, replacedBy]
    );
  },

  async revokeAllTcRefreshTokens(tcUserId) {
    await this.queryWithRetry(
      `UPDATE tc_refresh_tokens
       SET revoked = TRUE, revoked_at = NOW()
       WHERE tc_user_id = $1 AND revoked = FALSE`,
      [tcUserId]
    );
  },

  // =========================================================================
  // tc_password_reset_tokens — reset por email
  // =========================================================================

  async createTcPasswordResetToken({ tcUserId, ttlMinutes = 60 }) {
    const id = this.generateId();
    const token = require('crypto').randomBytes(32).toString('hex');
    await this.queryWithRetry(
      'UPDATE tc_password_reset_tokens SET used = TRUE, used_at = NOW() WHERE tc_user_id = $1 AND used = FALSE',
      [tcUserId]
    );
    await this.queryWithRetry(
      `INSERT INTO tc_password_reset_tokens (id, tc_user_id, token, expires_at)
       VALUES ($1, $2, $3, NOW() + INTERVAL '${ttlMinutes} minutes')`,
      [id, tcUserId, token]
    );
    return { id, token };
  },

  async validateTcPasswordResetToken(token) {
    const r = await this.queryWithRetry(
      `SELECT prt.*, tu.username
       FROM tc_password_reset_tokens prt
       JOIN tc_users tu ON tu.id = prt.tc_user_id
       WHERE prt.token = $1 AND prt.used = FALSE AND prt.expires_at > NOW()
       LIMIT 1`,
      [token]
    );
    return r.rows[0] || null;
  },

  async useTcPasswordResetToken(token, newPasswordHash) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const sel = await client.query(
        `SELECT prt.id, prt.tc_user_id FROM tc_password_reset_tokens prt
         WHERE prt.token = $1 AND prt.used = FALSE AND prt.expires_at > NOW()
         FOR UPDATE`,
        [token]
      );
      if (sel.rows.length === 0) {
        await client.query('ROLLBACK');
        return null;
      }
      const { id, tc_user_id } = sel.rows[0];
      await client.query(
        'UPDATE tc_users SET password = $1, force_password_change = FALSE, updated_at = NOW() WHERE id = $2',
        [newPasswordHash, tc_user_id]
      );
      await client.query(
        'UPDATE tc_password_reset_tokens SET used = TRUE, used_at = NOW() WHERE id = $1',
        [id]
      );
      await client.query('COMMIT');
      return { tcUserId: tc_user_id };
    } catch (error) {
      await client.query('ROLLBACK');
      throw new Error('Erro ao resetar senha tc_user: ' + error.message);
    } finally {
      client.release();
    }
  },

  // =========================================================================
  // share_links — versão tc_user (sub-share gerado pelo próprio tc_user)
  // =========================================================================

  async getShareLinksCreatedByTcUser(tcUserId) {
    const r = await this.queryWithRetry(
      'SELECT * FROM share_links WHERE created_by_tc_user_id = $1 ORDER BY created_at DESC',
      [tcUserId]
    );
    return r.rows;
  },

  // =========================================================================
  // Admin do impgeo gerenciando tc_users (CRUD)
  // =========================================================================

  // =========================================================================
  // F2.1 — Convite por email para tc_user
  // =========================================================================

  // Cria um tc_user "stub" (inativo, sem username/senha definitivos) e um
  // registro em tc_email_verifications com token + expiração. Atribui acessos
  // se passados em selectedIds. Tudo em uma única transação — se algo falhar,
  // nada fica meio-criado.
  //
  // Retorna { tcUserId, token, expiresAt } para o caller construir o link
  // e disparar o email.
  async createTcUserInvite({ email, invitedByUserId, selectedIds = [], expiresDays = 7 }) {
    if (!email || typeof email !== 'string') throw new Error('Email é obrigatório');
    const normalizedEmail = email.trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(normalizedEmail)) throw new Error('Email inválido');

    // Bcrypt de uma senha aleatória inacessível — o convidado vai definir a
    // dele ao aceitar; isto é só pra satisfazer NOT NULL em tc_users.password.
    const crypto = require('crypto');
    const bcrypt = require('bcryptjs');
    const placeholderPassword = crypto.randomBytes(32).toString('hex');
    const placeholderHash = await bcrypt.hash(placeholderPassword, 10);

    const tcUserId = crypto.randomUUID();
    const inviteId = crypto.randomUUID();
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + expiresDays * 24 * 60 * 60 * 1000).toISOString();

    // Username temporário único — convidado vai escolher o real ao aceitar.
    // Prefixo invite- + hex curto para satisfazer UNIQUE(username) sem colidir
    // com slugs reais.
    const tempUsername = `invite-${crypto.randomBytes(6).toString('hex')}`;

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      // Se já existe tc_user ativo com esse email → conflito
      const existing = await client.query(
        'SELECT id, is_active, email_verified_at FROM tc_users WHERE LOWER(email) = $1 LIMIT 1',
        [normalizedEmail]
      );
      if (existing.rows.length > 0) {
        const u = existing.rows[0];
        if (u.is_active === true || u.email_verified_at) {
          throw new Error('Já existe um usuário ativo com este email');
        }
        // Existe um invite pendente — vamos reaproveitar (revogar o token
        // anterior e criar um novo). Isso permite reenviar convite.
        await client.query(
          'DELETE FROM tc_email_verifications WHERE tc_user_id = $1',
          [u.id]
        );
        await client.query(
          `INSERT INTO tc_email_verifications (id, tc_user_id, email, token, expires_at)
           VALUES ($1, $2, $3, $4, $5)`,
          [inviteId, u.id, normalizedEmail, token, expiresAt]
        );
        // Atualiza acessos se vieram novos
        if (Array.isArray(selectedIds) && selectedIds.length > 0) {
          await client.query('DELETE FROM tc_user_record_access WHERE tc_user_id = $1', [u.id]);
          for (const rid of selectedIds) {
            await client.query(
              `INSERT INTO tc_user_record_access (tc_user_id, terracontrol_id, granted_by_user_id)
               VALUES ($1, $2, $3) ON CONFLICT (tc_user_id, terracontrol_id) DO NOTHING`,
              [u.id, String(rid), invitedByUserId]
            );
          }
        }
        await client.query('COMMIT');
        return { tcUserId: u.id, token, expiresAt, reused: true };
      }

      // Caso normal: cria stub novo
      await client.query(
        `INSERT INTO tc_users (id, username, password, email, is_active, force_password_change, created_via, created_by_user_id)
         VALUES ($1, $2, $3, $4, FALSE, TRUE, 'invite', $5)`,
        [tcUserId, tempUsername, placeholderHash, normalizedEmail, invitedByUserId]
      );
      await client.query(
        `INSERT INTO tc_email_verifications (id, tc_user_id, email, token, expires_at)
         VALUES ($1, $2, $3, $4, $5)`,
        [inviteId, tcUserId, normalizedEmail, token, expiresAt]
      );
      if (Array.isArray(selectedIds) && selectedIds.length > 0) {
        for (const rid of selectedIds) {
          await client.query(
            `INSERT INTO tc_user_record_access (tc_user_id, terracontrol_id, granted_by_user_id)
             VALUES ($1, $2, $3) ON CONFLICT (tc_user_id, terracontrol_id) DO NOTHING`,
            [tcUserId, String(rid), invitedByUserId]
          );
        }
      }
      await client.query('COMMIT');
      return { tcUserId, token, expiresAt, reused: false };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  },

  // Retorna info pública do convite (sem expor coisas sensíveis). Usado pelo
  // frontend ANTES do login para mostrar "Olá! Você foi convidado a acessar..."
  async getTcInviteByToken(token) {
    const r = await this.queryWithRetry(
      `SELECT v.id, v.tc_user_id, v.email, v.expires_at, v.verified_at,
              u.username AS inviter_username,
              u.first_name AS inviter_first_name,
              u.last_name AS inviter_last_name
       FROM tc_email_verifications v
       JOIN tc_users tu ON tu.id = v.tc_user_id
       LEFT JOIN users u ON u.id = tu.created_by_user_id
       WHERE v.token = $1
       LIMIT 1`,
      [token]
    );
    return r.rows[0] || null;
  },

  // Aceita o convite: define username/senha/nome do tc_user, ativa, marca
  // email como verificado, invalida o token. Tudo em transação.
  async acceptTcInvite({ token, username, password, firstName, lastName }) {
    const bcrypt = require('bcryptjs');
    const invite = await this.getTcInviteByToken(token);
    if (!invite) throw new Error('Convite não encontrado');
    if (invite.verified_at) throw new Error('Este convite já foi aceito');
    if (new Date(invite.expires_at) < new Date()) throw new Error('Convite expirado');

    const normalizedUsername = String(username || '').trim().toLowerCase();
    if (!/^[a-z0-9][a-z0-9\-_]{2,}$/.test(normalizedUsername)) {
      throw new Error('Username inválido');
    }
    if (!password || String(password).length < 8) {
      throw new Error('Senha deve ter no mínimo 8 caracteres');
    }
    if (!firstName || !String(firstName).trim()) {
      throw new Error('Nome é obrigatório');
    }

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      // Verifica colisão de username (que não seja o próprio stub do convite).
      // Checa as DUAS tabelas (tc_users + users) porque username é global no
      // login unificado do terracontrol.com.br. Case-insensitive.
      const collisionTc = await client.query(
        'SELECT 1 FROM tc_users WHERE LOWER(username) = $1 AND id <> $2 LIMIT 1',
        [normalizedUsername, invite.tc_user_id]
      );
      const collisionImpgeo = await client.query(
        'SELECT 1 FROM users WHERE LOWER(username) = $1 LIMIT 1',
        [normalizedUsername]
      );
      if (collisionTc.rows.length > 0 || collisionImpgeo.rows.length > 0) {
        throw new Error('Este nome de usuário já existe');
      }
      const hash = await bcrypt.hash(String(password), 10);
      await client.query(
        `UPDATE tc_users
         SET username = $1,
             password = $2,
             first_name = $3,
             last_name = $4,
             is_active = TRUE,
             force_password_change = FALSE,
             email_verified_at = NOW(),
             updated_at = NOW()
         WHERE id = $5`,
        [normalizedUsername, hash, String(firstName).trim(), lastName ? String(lastName).trim() : null, invite.tc_user_id]
      );
      await client.query(
        'UPDATE tc_email_verifications SET verified_at = NOW() WHERE token = $1',
        [token]
      );
      await client.query('COMMIT');
      return { tcUserId: invite.tc_user_id, username: normalizedUsername };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  },

  // Retorna true se o usuário impgeo está autorizado a gerenciar tc_users
  // (admin/superadmin OU flag can_manage_tc_users=TRUE). Usado pelo middleware.
  async userCanManageTcUsers(userId) {
    const r = await this.queryWithRetry(
      `SELECT role, can_manage_tc_users FROM users WHERE id = $1 LIMIT 1`,
      [userId]
    );
    if (r.rows.length === 0) return false;
    const u = r.rows[0];
    if (u.role === 'admin' || u.role === 'superadmin') return true;
    return u.can_manage_tc_users === true;
  },

  // =========================================================================
  // tc_notifications — sistema de notificações in-app pra tc_users
  // Espelha api das `notifications` do impgeo (migration 018/020) mas com FK
  // pra tc_users. Consumido pelos endpoints /api/tc-auth/notifications/*.
  // =========================================================================

  async createTcNotification(notif) {
    const id = this.generateId();
    const result = await this.queryWithRetry(
      `INSERT INTO tc_notifications
         (id, tc_user_id, notification_type, title, message, related_entity_type, related_entity_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [
        id,
        notif.tc_user_id,
        notif.notification_type,
        notif.title,
        notif.message || null,
        notif.related_entity_type || null,
        notif.related_entity_id || null,
      ]
    );
    return result.rows[0];
  },

  async getTcNotificationsForUser(tcUserId, { onlyUnread = false, limit = 50, includeCleared = false } = {}) {
    const result = await this.queryWithRetry(
      `SELECT * FROM tc_notifications
        WHERE tc_user_id = $1
          AND ($2::BOOLEAN = FALSE OR is_read = FALSE)
          AND ($3::BOOLEAN = TRUE  OR cleared = FALSE)
        ORDER BY created_at DESC
        LIMIT $4`,
      [tcUserId, onlyUnread, includeCleared, limit]
    );
    return result.rows;
  },

  async getUnreadTcNotificationCount(tcUserId) {
    const result = await this.queryWithRetry(
      'SELECT COUNT(*)::INT AS count FROM tc_notifications WHERE tc_user_id = $1 AND is_read = FALSE AND cleared = FALSE',
      [tcUserId]
    );
    return result.rows[0].count;
  },

  async markTcNotificationAsRead(id, tcUserId) {
    const result = await this.queryWithRetry(
      `UPDATE tc_notifications
          SET is_read = TRUE, read_at = NOW()
        WHERE id = $1 AND tc_user_id = $2
        RETURNING *`,
      [id, tcUserId]
    );
    return result.rows[0] || null;
  },

  async markAllTcNotificationsAsRead(tcUserId) {
    await this.queryWithRetry(
      `UPDATE tc_notifications
          SET is_read = TRUE, read_at = NOW()
        WHERE tc_user_id = $1 AND is_read = FALSE AND cleared = FALSE`,
      [tcUserId]
    );
  },

  // G10.2 — auto mark-as-read por entidade relacionada.
  // Usado quando o tc_user engaja com o entity (abre TcBudgetViewScreen,
  // aprova, pede revisão, paga) — as notifs sobre aquele budget viram
  // "lidas" automaticamente, sem o user precisar clicar no sininho.
  // Retorna a contagem de linhas afetadas pro front decidir se decrementa
  // o badge otimistamente.
  async markTcNotificationsByEntityAsRead(tcUserId, entityType, entityId) {
    const result = await this.queryWithRetry(
      `UPDATE tc_notifications
          SET is_read = TRUE, read_at = NOW()
        WHERE tc_user_id = $1
          AND related_entity_type = $2
          AND related_entity_id   = $3
          AND is_read = FALSE
          AND cleared = FALSE`,
      [tcUserId, entityType, String(entityId)]
    );
    return result.rowCount || 0;
  },

  async clearTcNotification(id, tcUserId) {
    const result = await this.queryWithRetry(
      `UPDATE tc_notifications
          SET cleared = TRUE, cleared_at = NOW()
        WHERE id = $1 AND tc_user_id = $2
        RETURNING *`,
      [id, tcUserId]
    );
    return result.rows[0] || null;
  },

  async clearAllTcNotifications(tcUserId) {
    const result = await this.queryWithRetry(
      `UPDATE tc_notifications
          SET cleared = TRUE, cleared_at = NOW()
        WHERE tc_user_id = $1 AND cleared = FALSE
        RETURNING id`,
      [tcUserId]
    );
    return result.rows.length;
  },

  async deleteTcNotification(id, tcUserId) {
    const result = await this.queryWithRetry(
      'DELETE FROM tc_notifications WHERE id = $1 AND tc_user_id = $2 RETURNING id',
      [id, tcUserId]
    );
    return result.rows[0] || null;
  },

  async deleteAllTcNotificationsForUser(tcUserId, { onlyCleared = false } = {}) {
    const result = await this.queryWithRetry(
      `DELETE FROM tc_notifications
        WHERE tc_user_id = $1 AND ($2::BOOLEAN = FALSE OR cleared = TRUE)
        RETURNING id`,
      [tcUserId, onlyCleared]
    );
    return result.rows.length;
  },

};
