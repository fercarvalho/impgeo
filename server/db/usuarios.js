// ═══════════════════════════════════════════════════════════════════════════
// server/db/usuarios.js
// Domínio Usuários do data-layer (#15 A): CRUD de usuários da equipe impgeo,
// subsistemas (read-only, fase 3.0) e catálogo de módulos. Colado no
// Database.prototype via Object.assign. Só usa this.* — sem símbolos de módulo.
// (Permissões/defaults/roles ficam em db/permissoes.js.)
// ═══════════════════════════════════════════════════════════════════════════
'use strict';

module.exports = {
  // Métodos para Usuários
  async getAllUsers() {
    try {
      await this.ensureProfileSchema();
      const result = await this.queryWithRetry('SELECT * FROM users ORDER BY username');
      return result.rows;
    } catch (error) {
      console.error('Erro ao ler usuários:', error);
      return [];
    }
  },

  async getUserByUsername(username) {
    try {
      await this.ensureProfileSchema();
      const result = await this.queryWithRetry(
        'SELECT * FROM users WHERE username = $1',
        [username]
      );
      return result.rows[0] || null;
    } catch (error) {
      console.error('Erro ao buscar usuário:', error);
      return null;
    }
  },

  async getUserByEmail(email) {
    try {
      await this.ensureProfileSchema();
      const normalizedEmail = String(email || '').trim().toLowerCase();
      if (!normalizedEmail) return null;
      const result = await this.queryWithRetry(
        'SELECT * FROM users WHERE LOWER(email) = $1 LIMIT 1',
        [normalizedEmail]
      );
      return result.rows[0] || null;
    } catch (error) {
      console.error('Erro ao buscar usuário por email:', error);
      return null;
    }
  },

  async getUsersByEmail(email) {
    try {
      await this.ensureProfileSchema();
      const normalizedEmail = String(email || '').trim().toLowerCase();
      if (!normalizedEmail) return [];
      const result = await this.queryWithRetry(
        'SELECT * FROM users WHERE LOWER(email) = $1 ORDER BY username ASC',
        [normalizedEmail]
      );
      return result.rows;
    } catch (error) {
      console.error('Erro ao buscar usuários por email:', error);
      return [];
    }
  },

  async getUserById(id) {
    try {
      await this.ensureProfileSchema();
      const result = await this.queryWithRetry(
        'SELECT * FROM users WHERE id = $1',
        [id]
      );
      return result.rows[0] || null;
    } catch (error) {
      console.error('Erro ao buscar usuário por id:', error);
      return null;
    }
  },

  async saveUser(userData) {
    try {
      await this.ensureProfileSchema();
      const id = this.generateId();
      const result = await this.queryWithRetry(
        `INSERT INTO users (
          id, username, password, first_name, last_name, email, phone, photo_url, cpf, birth_date,
          gender, position, address, role, is_active, last_login, created_at, updated_at
        )
         VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
          $11, $12, $13, $14, $15, $16, $17, $18
        )
         RETURNING *`,
        [
          id,
          userData.username || null,
          userData.password || null,
          userData.firstName || null,
          userData.lastName || null,
          userData.email || null,
          userData.phone || null,
          userData.photoUrl || null,
          userData.cpf || null,
          userData.birthDate || null,
          userData.gender || null,
          userData.position || null,
          userData.address ? JSON.stringify(userData.address) : null,
          userData.role || 'user',
          userData.isActive !== undefined ? userData.isActive : true,
          userData.lastLogin || null,
          new Date().toISOString(),
          new Date().toISOString()
        ]
      );
      await this.seedUserModulePermissionsFromRole(id, userData.role || 'user', true);
      return result.rows[0];
    } catch (error) {
      throw new Error('Erro ao salvar usuário: ' + error.message);
    }
  },

  async updateUser(id, updatedData) {
    try {
      await this.ensureProfileSchema();
      const setClause = [];
      const values = [];
      let paramIndex = 1;

      if (updatedData.username !== undefined) {
        setClause.push(`username = $${paramIndex++}`);
        values.push(updatedData.username);
      }
      if (updatedData.password !== undefined) {
        setClause.push(`password = $${paramIndex++}`);
        values.push(updatedData.password);
      }
      if (updatedData.role !== undefined) {
        setClause.push(`role = $${paramIndex++}`);
        values.push(updatedData.role);
      }
      if (updatedData.isActive !== undefined) {
        setClause.push(`is_active = $${paramIndex++}`);
        values.push(updatedData.isActive);
      }
      if (updatedData.photoUrl !== undefined) {
        setClause.push(`photo_url = $${paramIndex++}`);
        values.push(updatedData.photoUrl);
      }
      if (updatedData.lastLogin !== undefined) {
        setClause.push(`last_login = $${paramIndex++}`);
        values.push(updatedData.lastLogin);
      }
      if (updatedData.firstName !== undefined) {
        setClause.push(`first_name = $${paramIndex++}`);
        values.push(updatedData.firstName);
      }
      if (updatedData.lastName !== undefined) {
        setClause.push(`last_name = $${paramIndex++}`);
        values.push(updatedData.lastName);
      }
      if (updatedData.email !== undefined) {
        setClause.push(`email = $${paramIndex++}`);
        values.push(updatedData.email);
      }
      if (updatedData.phone !== undefined) {
        setClause.push(`phone = $${paramIndex++}`);
        values.push(updatedData.phone);
      }
      if (updatedData.cpf !== undefined) {
        setClause.push(`cpf = $${paramIndex++}`);
        values.push(updatedData.cpf);
      }
      if (updatedData.birthDate !== undefined) {
        setClause.push(`birth_date = $${paramIndex++}`);
        values.push(updatedData.birthDate);
      }
      if (updatedData.gender !== undefined) {
        setClause.push(`gender = $${paramIndex++}`);
        values.push(updatedData.gender);
      }
      if (updatedData.position !== undefined) {
        setClause.push(`position = $${paramIndex++}`);
        values.push(updatedData.position);
      }
      if (updatedData.address !== undefined) {
        setClause.push(`address = $${paramIndex++}`);
        values.push(
          updatedData.address && typeof updatedData.address === 'object'
            ? JSON.stringify(updatedData.address)
            : updatedData.address
        );
      }
      if (updatedData.canManageTcUsers !== undefined) {
        setClause.push(`can_manage_tc_users = $${paramIndex++}`);
        values.push(!!updatedData.canManageTcUsers);
      }

      setClause.push(`updated_at = $${paramIndex++}`);
      values.push(new Date().toISOString());
      values.push(id);

      const result = await this.queryWithRetry(
        `UPDATE users SET ${setClause.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
        values
      );
      if (result.rows.length === 0) {
        throw new Error('Usuário não encontrado');
      }
      return result.rows[0];
    } catch (error) {
      throw new Error('Erro ao atualizar usuário: ' + error.message);
    }
  },

  async deleteUser(id) {
    try {
      await this.ensureProfileSchema();
      const result = await this.queryWithRetry(
        'DELETE FROM users WHERE id = $1 RETURNING id',
        [id]
      );
      if (result.rows.length === 0) {
        throw new Error('Usuário não encontrado');
      }
      return true;
    } catch (error) {
      throw new Error('Erro ao excluir usuário: ' + error.message);
    }
  },

  async getModulesCatalog() {
    await this.ensureProfileSchema();
    const result = await this.queryWithRetry(
      `
        SELECT module_key, module_name, icon_name, description, route_path,
               is_system, is_active, sort_order, subsystem_key,
               created_at, updated_at
        FROM modules_catalog
        ORDER BY subsystem_key ASC, sort_order ASC NULLS LAST, module_name ASC
      `
    );
    return result.rows.map((row) => ({
      moduleKey: row.module_key,
      moduleName: row.module_name,
      iconName: row.icon_name || null,
      description: row.description || null,
      routePath: row.route_path || null,
      isSystem: row.is_system === true,
      isActive: row.is_active !== false,
      sortOrder: row.sort_order ?? null,
      subsystemKey: row.subsystem_key || null,
      createdAt: row.created_at || null,
      updatedAt: row.updated_at || null
    }));
  },

  // ─── Subsistemas (read-only por enquanto — fase 3.0) ──────────────────────
  async listSubsystems() {
    await this.ensureProfileSchema();
    const result = await this.queryWithRetry(
      `SELECT subsystem_key, name, description, icon_name, subdomain_slug,
              sort_order, is_active, created_at, updated_at
         FROM subsystems
        WHERE is_active = TRUE
        ORDER BY sort_order ASC, name ASC`
    );
    return result.rows.map((row) => ({
      subsystemKey:   row.subsystem_key,
      name:           row.name,
      description:    row.description || null,
      iconName:       row.icon_name || null,
      subdomainSlug:  row.subdomain_slug,
      sortOrder:      row.sort_order ?? 0,
      isActive:       row.is_active !== false,
      createdAt:      row.created_at || null,
      updatedAt:      row.updated_at || null,
    }));
  },

  async getSubsystemByKey(subsystemKey) {
    await this.ensureProfileSchema();
    const result = await this.queryWithRetry(
      `SELECT subsystem_key, name FROM subsystems WHERE subsystem_key = $1 LIMIT 1`,
      [subsystemKey]
    );
    return result.rows[0] || null;
  },

  // ─── Módulos do catálogo ──────────────────────────────────────────────────
  // Fase 3.0: todos os métodos agora respeitam subsystem_key. sort_order é
  // POR SUBSISTEMA (decisão da migration 016), não global.

  async getModuleByKey(moduleKey) {
    await this.ensureProfileSchema();
    const result = await this.queryWithRetry(
      `
        SELECT module_key, module_name, icon_name, description, route_path,
               is_system, is_active, sort_order, subsystem_key,
               created_at, updated_at
        FROM modules_catalog
        WHERE module_key = $1
        LIMIT 1
      `,
      [moduleKey]
    );

    if (result.rows.length === 0) return null;
    const row = result.rows[0];
    return {
      moduleKey:    row.module_key,
      moduleName:   row.module_name,
      iconName:     row.icon_name || null,
      description:  row.description || null,
      routePath:    row.route_path || null,
      isSystem:     row.is_system === true,
      isActive:     row.is_active !== false,
      sortOrder:    row.sort_order ?? null,
      subsystemKey: row.subsystem_key || null,
      createdAt:    row.created_at || null,
      updatedAt:    row.updated_at || null,
    };
  },

  async createModule(moduleData) {
    await this.ensureProfileSchema();
    const subsystemKey = moduleData.subsystemKey;
    if (!subsystemKey) {
      throw new Error('subsystemKey é obrigatório');
    }
    const sub = await this.getSubsystemByKey(subsystemKey);
    if (!sub) {
      throw new Error(`Subsistema inválido: "${subsystemKey}"`);
    }
    const now = new Date().toISOString();
    // sort_order = MAX dentro do subsistema + 1
    const maxResult = await this.queryWithRetry(
      `SELECT COALESCE(MAX(sort_order), 0) + 1 AS next_order
         FROM modules_catalog WHERE subsystem_key = $1`,
      [subsystemKey]
    );
    const nextOrder = maxResult.rows[0]?.next_order ?? 1;
    const result = await this.queryWithRetry(
      `
        INSERT INTO modules_catalog
          (module_key, module_name, icon_name, description, route_path, is_system, is_active, sort_order, subsystem_key, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        RETURNING module_key, module_name, icon_name, description, route_path, is_system, is_active, sort_order, subsystem_key, created_at, updated_at
      `,
      [
        moduleData.moduleKey,
        moduleData.moduleName,
        moduleData.iconName || null,
        moduleData.description || null,
        moduleData.routePath || null,
        moduleData.isSystem === true,
        moduleData.isActive !== false,
        nextOrder,
        subsystemKey,
        now,
        now,
      ]
    );
    const row = result.rows[0];
    return {
      moduleKey:    row.module_key,
      moduleName:   row.module_name,
      iconName:     row.icon_name || null,
      description:  row.description || null,
      routePath:    row.route_path || null,
      isSystem:     row.is_system === true,
      isActive:     row.is_active !== false,
      sortOrder:    row.sort_order ?? null,
      subsystemKey: row.subsystem_key || null,
      createdAt:    row.created_at || null,
      updatedAt:    row.updated_at || null,
    };
  },

  /**
   * Atualiza metadados de um módulo. Se subsystemKey vier diferente do atual,
   * recalcula sort_order = MAX(sort_order)+1 no destino — o módulo vai para
   * o fim do novo subsistema. Atômico via transação.
   * Campos editáveis: moduleName, iconName, description, routePath, isActive,
   * subsystemKey. moduleKey continua imutável (regra antiga preservada).
   */
  async updateModule(moduleKey, moduleData) {
    await this.ensureProfileSchema();
    const existing = await this.getModuleByKey(moduleKey);
    if (!existing) throw new Error('Módulo não encontrado');

    // Validação de subsystem (se enviado)
    let targetSubsystemKey = existing.subsystemKey;
    let targetSortOrder    = existing.sortOrder;
    if (moduleData.subsystemKey && moduleData.subsystemKey !== existing.subsystemKey) {
      const sub = await this.getSubsystemByKey(moduleData.subsystemKey);
      if (!sub) throw new Error(`Subsistema inválido: "${moduleData.subsystemKey}"`);
      targetSubsystemKey = moduleData.subsystemKey;
      // Vai pro fim do destino
      const maxResult = await this.queryWithRetry(
        `SELECT COALESCE(MAX(sort_order), 0) + 1 AS next_order
           FROM modules_catalog WHERE subsystem_key = $1`,
        [targetSubsystemKey]
      );
      targetSortOrder = maxResult.rows[0]?.next_order ?? 1;
    }

    const result = await this.queryWithRetry(
      `
        UPDATE modules_catalog
        SET module_name   = $1,
            icon_name     = $2,
            description   = $3,
            route_path    = $4,
            is_active     = $5,
            subsystem_key = $6,
            sort_order    = $7,
            updated_at    = $8
        WHERE module_key = $9
        RETURNING module_key, module_name, icon_name, description, route_path,
                  is_system, is_active, sort_order, subsystem_key,
                  created_at, updated_at
      `,
      [
        moduleData.moduleName  ?? existing.moduleName,
        moduleData.iconName    !== undefined ? moduleData.iconName    : existing.iconName,
        moduleData.description !== undefined ? moduleData.description : existing.description,
        moduleData.routePath   !== undefined ? moduleData.routePath   : existing.routePath,
        moduleData.isActive    !== undefined ? moduleData.isActive    : existing.isActive,
        targetSubsystemKey,
        targetSortOrder,
        new Date().toISOString(),
        moduleKey,
      ]
    );

    const row = result.rows[0];
    return {
      moduleKey:    row.module_key,
      moduleName:   row.module_name,
      iconName:     row.icon_name || null,
      description:  row.description || null,
      routePath:    row.route_path || null,
      isSystem:     row.is_system === true,
      isActive:     row.is_active !== false,
      sortOrder:    row.sort_order ?? null,
      subsystemKey: row.subsystem_key || null,
      createdAt:    row.created_at || null,
      updatedAt:    row.updated_at || null,
    };
  },

  async deleteModule(moduleKey) {
    await this.ensureProfileSchema();
    const module = await this.getModuleByKey(moduleKey);
    if (!module) {
      throw new Error('Módulo não encontrado');
    }
    if (module.isSystem) {
      throw new Error('Não é permitido excluir módulo de sistema');
    }
    await this.queryWithRetry('DELETE FROM modules_catalog WHERE module_key = $1', [moduleKey]);
    return true;
  },

  /**
   * Reordena módulos DENTRO DE UM SUBSISTEMA. Valida que todas as keys
   * passadas pertencem ao subsystemKey antes de qualquer UPDATE.
   */
  async reorderModules(subsystemKey, orderedKeys) {
    await this.ensureProfileSchema();
    if (!subsystemKey) throw new Error('subsystemKey é obrigatório');
    if (!Array.isArray(orderedKeys) || orderedKeys.length === 0) {
      throw new Error('orderedKeys deve ser um array não-vazio');
    }

    // Valida: todas as keys são módulos desse subsistema
    const expected = await this.queryWithRetry(
      `SELECT module_key FROM modules_catalog WHERE subsystem_key = $1`,
      [subsystemKey]
    );
    const validSet = new Set(expected.rows.map((r) => r.module_key));
    for (const k of orderedKeys) {
      if (!validSet.has(k)) {
        throw new Error(`Módulo "${k}" não pertence ao subsistema "${subsystemKey}"`);
      }
    }

    const now = new Date().toISOString();
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      for (let i = 0; i < orderedKeys.length; i++) {
        await client.query(
          `UPDATE modules_catalog SET sort_order = $1, updated_at = $2
            WHERE module_key = $3 AND subsystem_key = $4`,
          [i + 1, now, orderedKeys[i], subsystemKey]
        );
      }
      await client.query('COMMIT');
      return true;
    } catch (error) {
      await client.query('ROLLBACK');
      throw new Error('Erro ao reordenar módulos: ' + error.message);
    } finally {
      client.release();
    }
  },

  async getUserModulePermissions(userId) {
    await this.ensureProfileSchema();
    const result = await this.queryWithRetry(
      `
        SELECT
          ump.module_key,
          mc.module_name,
          ump.access_level
        FROM user_module_permissions ump
        JOIN modules_catalog mc ON mc.module_key = ump.module_key
        WHERE ump.user_id = $1
          AND mc.is_active = TRUE
        ORDER BY mc.module_name ASC
      `,
      [userId]
    );

    return result.rows.map((row) => ({
      moduleKey: row.module_key,
      moduleName: row.module_name,
      accessLevel: row.access_level
    }));
  },

  async setUserModulePermissions(userId, moduleKeys, accessLevel = 'view') {
    await this.ensureProfileSchema();

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      await client.query('DELETE FROM user_module_permissions WHERE user_id = $1', [userId]);

      const uniqueModuleKeys = [...new Set(moduleKeys || [])];
      let validModuleKeys = [];
      if (uniqueModuleKeys.length > 0) {
        const validResult = await client.query(
          'SELECT module_key FROM modules_catalog WHERE module_key = ANY($1)',
          [uniqueModuleKeys]
        );
        validModuleKeys = validResult.rows.map((row) => row.module_key);
      }
      const now = new Date().toISOString();

      for (const moduleKey of validModuleKeys) {
        await client.query(
          `
            INSERT INTO user_module_permissions
              (id, user_id, module_key, access_level, created_at, updated_at)
            VALUES ($1, $2, $3, $4, $5, $6)
          `,
          [this.generateId(), userId, moduleKey, accessLevel, now, now]
        );
      }

      await client.query('COMMIT');
      return true;
    } catch (error) {
      await client.query('ROLLBACK');
      throw new Error('Erro ao definir permissões de módulos: ' + error.message);
    } finally {
      client.release();
    }
  },

};
