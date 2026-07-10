// ═══════════════════════════════════════════════════════════════════════════
// server/db/permissoes.js
// Domínio Permissões/Roles do data-layer (#15 A): permissões granulares
// (Fase 2.1), defaults editáveis por role (migration 043) e CRUD de roles
// dinâmicas (migration 044). Colado no Database.prototype via Object.assign.
// A fonte da verdade dos defaults vive em ../permissions/defaults.js — importada
// aqui (mesmos símbolos que o core usava).
// ═══════════════════════════════════════════════════════════════════════════
'use strict';

const {
  SYSTEM_ROLES,
  VALID_ACCESS_LEVELS,
  FALLBACK_DEFAULTS,
  computeDefaultsForRole,
  buildRoleMapFromDbRows,
  getDefaultLevelForRoleAndSubsystem,
  getDefaultOverridesForRole,
} = require('../permissions/defaults');

module.exports = {
  // ─── Permissões granulares (Fase 2.1) ─────────────────────────────────────

  /**
   * Retorna a matriz completa de permissões de um usuário, juntando o catálogo
   * de módulos (para cobrir módulos sem permissão) com o estado atual.
   *
   * Cada item: { moduleKey, moduleName, subsystemKey, accessLevel | null }
   * accessLevel === null significa "sem acesso".
   */
  // ─── Defaults editáveis (Fase 2.x — migration 043) ──────────────────────
  //
  // O mapa role→subsystema→level vive na tabela role_default_permissions.
  // Mantemos um cache em memória pra não bater no banco em todo seed; é
  // invalidado quando o admin salva mudanças via setRoleDefaultPermissions.

  /**
   * Carrega o mapa de defaults do banco (cached). Retorna config no formato
   * subsystem-level com moduleOverrides, igual ao FALLBACK_DEFAULTS — pode
   * ser passado direto pra computeDefaultsForRole.
   *
   * Se a tabela está vazia (edge case: migration 043 não rodou ou alguém
   * deletou tudo), retorna FALLBACK_DEFAULTS para que o sistema continue
   * funcionando.
   */
  async loadRoleDefaultsMap() {
    if (this._roleDefaultsMapCache) return this._roleDefaultsMapCache;

    await this.ensureProfileSchema();

    // Tabela pode ainda não existir se a 043 não rodou
    const tableExists = await this.queryWithRetry(
      `SELECT EXISTS (
         SELECT 1 FROM information_schema.tables
          WHERE table_name = 'role_default_permissions'
       ) AS ok`
    );
    if (!tableExists.rows[0]?.ok) {
      this._roleDefaultsMapCache = FALLBACK_DEFAULTS;
      return this._roleDefaultsMapCache;
    }

    const result = await this.queryWithRetry(
      `SELECT role, module_key AS "moduleKey", access_level AS "accessLevel"
         FROM role_default_permissions`
    );
    if (result.rows.length === 0) {
      this._roleDefaultsMapCache = FALLBACK_DEFAULTS;
      return this._roleDefaultsMapCache;
    }

    const catalog = await this.getModulesCatalog();
    this._roleDefaultsMapCache = buildRoleMapFromDbRows(result.rows, catalog);
    return this._roleDefaultsMapCache;
  },

  invalidateRoleDefaultsCache() {
    this._roleDefaultsMapCache = null;
  },

  /**
   * Retorna a matriz default que um usuário NOVO da role passada teria, no
   * mesmo formato do getUserPermissionsMatrix — módulos sem acesso aparecem
   * com accessLevel:null. Usa o mapa editável (cache do DB) como fonte.
   */
  async getDefaultPermissionsMatrix(role) {
    await this.ensureProfileSchema();
    const catalog = await this.getModulesCatalog();
    const configMap = await this.loadRoleDefaultsMap();
    const defaults = computeDefaultsForRole(role, catalog, configMap);
    const defaultsMap = new Map(defaults.map((d) => [d.moduleKey, d.accessLevel]));
    return catalog
      .filter((m) => m.isActive !== false)
      .map((m) => ({
        moduleKey:    m.moduleKey,
        moduleName:   m.moduleName,
        subsystemKey: m.subsystemKey,
        sortOrder:    m.sortOrder,
        accessLevel:  defaultsMap.get(m.moduleKey) || null,
      }));
  },

  /**
   * Substitui todos os defaults de uma role pelo array passado. Aceita o
   * mesmo shape de setUserPermissionsMatrix: [{moduleKey, accessLevel}].
   * Módulos ausentes do array são apagados (= "sem acesso" no default).
   * Atômico via transação + invalida o cache.
   */
  async setRoleDefaultPermissions(role, permissions) {
    await this.ensureProfileSchema();
    const exists = await this.getRoleByKey(role);
    if (!exists) {
      throw new Error(`Role inválida: ${role}`);
    }

    const catalog = await this.getModulesCatalog();
    const validKeys = new Set(catalog.map((m) => m.moduleKey));
    const seen = new Set();
    const sanitized = [];
    for (const item of (permissions || [])) {
      if (!item || typeof item !== 'object') continue;
      const moduleKey = item.moduleKey;
      const accessLevel = item.accessLevel;
      if (!validKeys.has(moduleKey)) continue;
      if (!VALID_ACCESS_LEVELS.includes(accessLevel)) continue;
      if (seen.has(moduleKey)) continue;
      seen.add(moduleKey);
      sanitized.push({ moduleKey, accessLevel });
    }

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('DELETE FROM role_default_permissions WHERE role = $1', [role]);
      for (const { moduleKey, accessLevel } of sanitized) {
        await client.query(
          `INSERT INTO role_default_permissions (role, module_key, access_level, updated_at)
           VALUES ($1, $2, $3, CURRENT_TIMESTAMP)`,
          [role, moduleKey, accessLevel]
        );
      }
      await client.query('COMMIT');
      this.invalidateRoleDefaultsCache();
      return sanitized;
    } catch (error) {
      await client.query('ROLLBACK');
      throw new Error('Erro ao salvar defaults da role: ' + error.message);
    } finally {
      client.release();
    }
  },

  /**
   * Restaura os defaults de uma role para os valores hardcoded do
   * FALLBACK_DEFAULTS. Usado pelo botão "Restaurar padrão original" na UI.
   */
  async resetRoleDefaultsToFallback(role) {
    if (!SYSTEM_ROLES.includes(role)) {
      throw new Error(`Restaurar padrão original só está disponível para funções do sistema (${SYSTEM_ROLES.join(', ')}). Roles customizadas devem ser ajustadas manualmente.`);
    }
    const catalog = await this.getModulesCatalog();
    // Calcula a lista usando o FALLBACK (passa null pra configMap)
    const fallback = computeDefaultsForRole(role, catalog, FALLBACK_DEFAULTS);
    return await this.setRoleDefaultPermissions(role, fallback);
  },

  // ─── CRUD de roles dinâmicas (migration 044) ──────────────────────────────

  async listRoles() {
    await this.ensureProfileSchema();
    const result = await this.queryWithRetry(
      `SELECT key, label, description, is_system, sort_order, created_at, updated_at
         FROM roles
        ORDER BY is_system DESC, sort_order ASC, label ASC`
    );
    return result.rows.map((row) => ({
      key:         row.key,
      label:       row.label,
      description: row.description,
      isSystem:    row.is_system === true,
      sortOrder:   row.sort_order,
      createdAt:   row.created_at,
      updatedAt:   row.updated_at,
    }));
  },

  async getRoleByKey(key) {
    await this.ensureProfileSchema();
    const result = await this.queryWithRetry(
      `SELECT key, label, description, is_system, sort_order, created_at, updated_at
         FROM roles WHERE key = $1 LIMIT 1`,
      [key]
    );
    if (!result.rows.length) return null;
    const row = result.rows[0];
    return {
      key:         row.key,
      label:       row.label,
      description: row.description,
      isSystem:    row.is_system === true,
      sortOrder:   row.sort_order,
      createdAt:   row.created_at,
      updatedAt:   row.updated_at,
    };
  },

  /**
   * Cria uma role custom. Se cloneFromRole for passado, copia a matriz de
   * defaults da role base; caso contrário, role nasce sem nenhuma permissão.
   * key: snake_case lowercase obrigatório (a CHECK do banco também valida).
   */
  async createRole({ key, label, description, sortOrder, cloneFromRole }) {
    await this.ensureProfileSchema();
    if (!key || typeof key !== 'string') throw new Error('key obrigatório');
    if (!label || typeof label !== 'string') throw new Error('label obrigatório');
    if (!/^[a-z][a-z0-9_]*$/.test(key)) {
      throw new Error('key deve ser snake_case minúsculo (letras, números e _)');
    }
    if (SYSTEM_ROLES.includes(key)) {
      throw new Error(`A chave "${key}" pertence ao sistema e não pode ser usada para uma role nova.`);
    }
    const existing = await this.getRoleByKey(key);
    if (existing) throw new Error(`Já existe uma função com a chave "${key}"`);

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        `INSERT INTO roles (key, label, description, is_system, sort_order, created_at, updated_at)
         VALUES ($1, $2, $3, FALSE, $4, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
        [key, label.trim(), (description || '').trim() || null, Number.isFinite(sortOrder) ? sortOrder : 100]
      );

      if (cloneFromRole) {
        const source = await client.query(
          `SELECT module_key, access_level FROM role_default_permissions WHERE role = $1`,
          [cloneFromRole]
        );
        for (const row of source.rows) {
          await client.query(
            `INSERT INTO role_default_permissions (role, module_key, access_level, updated_at)
             VALUES ($1, $2, $3, CURRENT_TIMESTAMP)`,
            [key, row.module_key, row.access_level]
          );
        }
      }
      await client.query('COMMIT');
      this.invalidateRoleDefaultsCache();
      return await this.getRoleByKey(key);
    } catch (error) {
      await client.query('ROLLBACK');
      throw new Error('Erro ao criar role: ' + error.message);
    } finally {
      client.release();
    }
  },

  /**
   * Atualiza label e/ou description de uma role. key e is_system são imutáveis.
   * Funciona para roles do sistema também (só restringe key/is_system).
   */
  async updateRoleMeta(key, { label, description, sortOrder }) {
    await this.ensureProfileSchema();
    const role = await this.getRoleByKey(key);
    if (!role) throw new Error('Role não encontrada');

    const sets = [];
    const params = [];
    if (typeof label === 'string' && label.trim()) {
      params.push(label.trim());
      sets.push(`label = $${params.length}`);
    }
    if (description !== undefined) {
      params.push(description === null ? null : String(description).trim() || null);
      sets.push(`description = $${params.length}`);
    }
    if (Number.isFinite(sortOrder)) {
      params.push(sortOrder);
      sets.push(`sort_order = $${params.length}`);
    }
    if (sets.length === 0) return role;

    params.push(key);
    await this.queryWithRetry(
      `UPDATE roles SET ${sets.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE key = $${params.length}`,
      params
    );
    return await this.getRoleByKey(key);
  },

  async countUsersByRole(key) {
    await this.ensureProfileSchema();
    const result = await this.queryWithRetry(
      `SELECT COUNT(*)::int AS n FROM users WHERE role = $1`,
      [key]
    );
    return result.rows[0]?.n || 0;
  },

  async listUsersByRole(key) {
    await this.ensureProfileSchema();
    const result = await this.queryWithRetry(
      `SELECT id, username, first_name, last_name FROM users WHERE role = $1 ORDER BY username`,
      [key]
    );
    return result.rows.map((row) => ({
      id:        row.id,
      username:  row.username,
      firstName: row.first_name || null,
      lastName:  row.last_name || null,
    }));
  },

  /**
   * Exclui uma role custom. Falha se for is_system OU se houver users com ela.
   * role_default_permissions é apagada em cascata pela FK.
   */
  async deleteRole(key) {
    await this.ensureProfileSchema();
    const role = await this.getRoleByKey(key);
    if (!role) throw new Error('Role não encontrada');
    if (role.isSystem) {
      throw new Error('Funções do sistema não podem ser excluídas.');
    }
    const userCount = await this.countUsersByRole(key);
    if (userCount > 0) {
      const err = new Error(`Não é possível excluir: ${userCount} usuário(s) ainda usam esta função. Migre-os para outra função antes.`);
      err.code = 'ROLE_HAS_USERS';
      err.userCount = userCount;
      throw err;
    }
    await this.queryWithRetry(`DELETE FROM roles WHERE key = $1`, [key]);
    this.invalidateRoleDefaultsCache();
    return true;
  },

  /**
   * Migra usuários de uma role para outra. Se resetPermissions=true, reaplica
   * os defaults da role nova para cada um (igual ao botão da UI quando troca-
   * se role); caso contrário só atualiza a coluna role.
   */
  async migrateUsersBetweenRoles(fromKey, toKey, resetPermissions = true) {
    await this.ensureProfileSchema();
    if (fromKey === toKey) throw new Error('Origem e destino são iguais.');
    const from = await this.getRoleByKey(fromKey);
    if (!from) throw new Error(`Role origem não encontrada: ${fromKey}`);
    const to = await this.getRoleByKey(toKey);
    if (!to) throw new Error(`Role destino não encontrada: ${toKey}`);

    const usersToMigrate = await this.queryWithRetry(
      `SELECT id FROM users WHERE role = $1`,
      [fromKey]
    );

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`UPDATE users SET role = $1, updated_at = CURRENT_TIMESTAMP WHERE role = $2`, [toKey, fromKey]);
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw new Error('Erro ao migrar usuários: ' + error.message);
    } finally {
      client.release();
    }

    let resetCount = 0;
    if (resetPermissions) {
      for (const row of usersToMigrate.rows) {
        await this.resetUserPermissionsToDefaults(row.id, toKey);
        resetCount++;
      }
    }
    return { migrated: usersToMigrate.rows.length, resetCount };
  },

  async getUserPermissionsMatrix(userId) {
    await this.ensureProfileSchema();
    const result = await this.queryWithRetry(
      `
        SELECT mc.module_key, mc.module_name, mc.subsystem_key,
               mc.sort_order, ump.access_level
          FROM modules_catalog mc
          LEFT JOIN user_module_permissions ump
                 ON ump.module_key = mc.module_key
                AND ump.user_id    = $1
         WHERE mc.is_active = TRUE
         ORDER BY mc.subsystem_key, mc.sort_order
      `,
      [userId]
    );
    return result.rows.map((row) => ({
      moduleKey:    row.module_key,
      moduleName:   row.module_name,
      subsystemKey: row.subsystem_key,
      sortOrder:    row.sort_order,
      accessLevel:  row.access_level || null,
    }));
  },

  /**
   * Substitui a matriz inteira de permissões do usuário pelo conjunto passado.
   * Aceita um array de pares { moduleKey, accessLevel } onde:
   *   - accessLevel ∈ {'view', 'edit'}  → cria/atualiza
   *   - moduleKey ausente do array       → DELETA (= sem acesso)
   *
   * Atômico via transação.
   */
  async setUserPermissionsMatrix(userId, permissions) {
    await this.ensureProfileSchema();

    // Sanitiza: só aceita levels válidos, só módulos que existem no catálogo
    const catalog = await this.getModulesCatalog();
    const validKeys = new Set(catalog.map((m) => m.moduleKey));

    const sanitized = [];
    const seen = new Set();
    for (const item of (permissions || [])) {
      if (!item || typeof item !== 'object') continue;
      const moduleKey = item.moduleKey;
      const accessLevel = item.accessLevel;
      if (!validKeys.has(moduleKey)) continue;
      if (!VALID_ACCESS_LEVELS.includes(accessLevel)) continue;
      if (seen.has(moduleKey)) continue;
      seen.add(moduleKey);
      sanitized.push({ moduleKey, accessLevel });
    }

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('DELETE FROM user_module_permissions WHERE user_id = $1', [userId]);
      const now = new Date().toISOString();
      for (const { moduleKey, accessLevel } of sanitized) {
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
      return sanitized;
    } catch (error) {
      await client.query('ROLLBACK');
      throw new Error('Erro ao atualizar matriz de permissões: ' + error.message);
    } finally {
      client.release();
    }
  },

  /**
   * Reseta permissões do usuário para o default da role atual (ou da role
   * passada). Usa computeDefaultsForRole contra o catálogo real do banco.
   */
  async resetUserPermissionsToDefaults(userId, roleOverride = null) {
    await this.ensureProfileSchema();
    let role = roleOverride;
    if (!role) {
      const userRow = await this.queryWithRetry('SELECT role FROM users WHERE id = $1', [userId]);
      role = userRow.rows[0]?.role;
    }
    if (!role) throw new Error('Usuário não encontrado para reset de permissões');

    const catalog = await this.getModulesCatalog();
    const configMap = await this.loadRoleDefaultsMap();
    const defaults = computeDefaultsForRole(role, catalog, configMap);
    return await this.setUserPermissionsMatrix(userId, defaults);
  },

  /**
   * Aplica um único accessLevel a TODOS os módulos de um subsistema para um
   * usuário. accessLevel === null remove todos os módulos do subsistema.
   * Não toca em módulos de outros subsistemas.
   */
  async setSubsystemPermissionsForUser(userId, subsystemKey, accessLevel) {
    await this.ensureProfileSchema();
    if (accessLevel !== null && !VALID_ACCESS_LEVELS.includes(accessLevel)) {
      throw new Error(`accessLevel inválido: ${accessLevel}`);
    }

    const catalog = await this.getModulesCatalog();
    const moduleKeys = catalog
      .filter((m) => m.subsystemKey === subsystemKey)
      .map((m) => m.moduleKey);
    if (moduleKeys.length === 0) return [];

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      // Remove tudo do subsistema
      await client.query(
        'DELETE FROM user_module_permissions WHERE user_id = $1 AND module_key = ANY($2)',
        [userId, moduleKeys]
      );
      // Reinsere com o novo nível (se não for 'none')
      if (accessLevel !== null) {
        const now = new Date().toISOString();
        for (const moduleKey of moduleKeys) {
          await client.query(
            `
              INSERT INTO user_module_permissions
                (id, user_id, module_key, access_level, created_at, updated_at)
              VALUES ($1, $2, $3, $4, $5, $6)
            `,
            [this.generateId(), userId, moduleKey, accessLevel, now, now]
          );
        }
      }
      await client.query('COMMIT');
      return moduleKeys.map((moduleKey) => ({ moduleKey, accessLevel }));
    } catch (error) {
      await client.query('ROLLBACK');
      throw new Error('Erro ao aplicar permissões em massa: ' + error.message);
    } finally {
      client.release();
    }
  },

  // Expostos para a UI (sem precisar duplicar imports no server.js)
  getDefaultLevelForRoleAndSubsystem(role, subsystemKey) {
    return getDefaultLevelForRoleAndSubsystem(role, subsystemKey);
  },
  getDefaultOverridesForRole(role) {
    return getDefaultOverridesForRole(role);
  },

  async createActivityLog(logData) {
    await this.ensureProfileSchema();
    const now = new Date().toISOString();
    await this.queryWithRetry(
      `
        INSERT INTO activity_logs
          (id, user_id, username, action, module_key, entity_type, entity_id, details, ip_address, created_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      `,
      [
        this.generateId(),
        logData.userId || null,
        logData.username || null,
        logData.action,
        logData.moduleKey || null,
        logData.entityType || null,
        logData.entityId || null,
        JSON.stringify(logData.details || {}),
        logData.ipAddress || null,
        now
      ]
    );
    return true;
  },

  async trimActivityLogs(maxRows = 100000) {
    await this.ensureProfileSchema();
    await this.queryWithRetry(
      `
        DELETE FROM activity_logs
        WHERE id IN (
          SELECT id
          FROM activity_logs
          ORDER BY created_at DESC
          OFFSET $1
        )
      `,
      [maxRows]
    );
  },

  async getActivityLogs(filters = {}) {
    await this.ensureProfileSchema();
    const page = Math.max(Number(filters.page) || 1, 1);
    const pageSize = Math.min(Math.max(Number(filters.pageSize) || 20, 1), 100);
    const offset = (page - 1) * pageSize;
    const conditions = [];
    const values = [];
    let paramIndex = 1;

    if (filters.userId) {
      conditions.push(`user_id = $${paramIndex++}`);
      values.push(filters.userId);
    }
    if (filters.moduleKey) {
      conditions.push(`module_key = $${paramIndex++}`);
      values.push(filters.moduleKey);
    }
    if (filters.action) {
      conditions.push(`action = $${paramIndex++}`);
      values.push(filters.action);
    }
    if (filters.startDate) {
      conditions.push(`created_at >= $${paramIndex++}`);
      values.push(filters.startDate);
    }
    if (filters.endDate) {
      conditions.push(`created_at <= $${paramIndex++}`);
      values.push(filters.endDate);
    }
    if (filters.search) {
      conditions.push(`(username ILIKE $${paramIndex} OR action ILIKE $${paramIndex} OR module_key ILIKE $${paramIndex})`);
      values.push(`%${filters.search}%`);
      paramIndex += 1;
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const dataValues = [...values, pageSize, offset];

    const totalResult = await this.queryWithRetry(
      `SELECT COUNT(*)::int AS total FROM activity_logs ${whereClause}`,
      values
    );
    const dataResult = await this.queryWithRetry(
      `
        SELECT id, user_id, username, action, module_key, entity_type, entity_id, details, ip_address, created_at
        FROM activity_logs
        ${whereClause}
        ORDER BY created_at DESC
        LIMIT $${paramIndex++} OFFSET $${paramIndex}
      `,
      dataValues
    );

    return {
      data: dataResult.rows.map((row) => ({
        id: row.id,
        userId: row.user_id || null,
        username: row.username || null,
        action: row.action,
        moduleKey: row.module_key || null,
        entityType: row.entity_type || null,
        entityId: row.entity_id || null,
        details: row.details && typeof row.details === 'object' ? row.details : {},
        ipAddress: row.ip_address || null,
        createdAt: row.created_at
      })),
      page,
      pageSize,
      total: totalResult.rows[0]?.total || 0
    };
  },

  async getSystemStatisticsLive() {
    await this.ensureProfileSchema();
    const [
      usersCount,
      activeUsersCount,
      modulesCount,
      activeModulesCount,
      activity24hCount,
      transactionsCount
    ] = await Promise.all([
      this.queryWithRetry('SELECT COUNT(*)::int AS value FROM users'),
      this.queryWithRetry('SELECT COUNT(*)::int AS value FROM users WHERE is_active = TRUE'),
      this.queryWithRetry('SELECT COUNT(*)::int AS value FROM modules_catalog'),
      this.queryWithRetry('SELECT COUNT(*)::int AS value FROM modules_catalog WHERE is_active = TRUE'),
      this.queryWithRetry("SELECT COUNT(*)::int AS value FROM activity_logs WHERE created_at >= NOW() - INTERVAL '24 hours'"),
      this.queryWithRetry('SELECT COUNT(*)::int AS value FROM transactions')
    ]);

    return {
      usersTotal: usersCount.rows[0]?.value || 0,
      usersActive: activeUsersCount.rows[0]?.value || 0,
      usersInactive: Math.max((usersCount.rows[0]?.value || 0) - (activeUsersCount.rows[0]?.value || 0), 0),
      modulesTotal: modulesCount.rows[0]?.value || 0,
      modulesActive: activeModulesCount.rows[0]?.value || 0,
      activityLast24h: activity24hCount.rows[0]?.value || 0,
      transactionsTotal: transactionsCount.rows[0]?.value || 0
    };
  },

  async getUsageTimeline(days = 30) {
    await this.ensureProfileSchema();
    const safeDays = Math.min(Math.max(Number(days) || 30, 1), 180);
    const result = await this.queryWithRetry(
      `
        SELECT
          TO_CHAR(created_at::date, 'YYYY-MM-DD') AS day,
          COUNT(*)::int AS total
        FROM activity_logs
        WHERE created_at >= NOW() - ($1::int * INTERVAL '1 day')
        GROUP BY created_at::date
        ORDER BY day ASC
      `,
      [safeDays]
    );
    return result.rows.map((row) => ({
      day: row.day,
      total: row.total
    }));
  },

  async getUsageTimelineByDateRange(startDate, endDate, groupBy = 'day') {
    await this.ensureProfileSchema();
    const safeGroupBy = groupBy === 'month' ? 'month' : 'day';
    const truncExpr = safeGroupBy === 'month' ? "date_trunc('month', created_at)" : "created_at::date";
    const formatExpr = safeGroupBy === 'month' ? 'YYYY-MM' : 'YYYY-MM-DD';
    const result = await this.queryWithRetry(
      `
        SELECT
          TO_CHAR(${truncExpr}, '${formatExpr}') AS date,
          COUNT(*)::int AS count
        FROM activity_logs
        WHERE created_at >= $1::date
          AND created_at < ($2::date + INTERVAL '1 day')
        GROUP BY ${truncExpr}
        ORDER BY ${truncExpr} ASC
      `,
      [startDate, endDate]
    );
    return result.rows.map((row) => ({
      date: row.date,
      count: row.count
    }));
  },

  async getTopModulesUsage(limit = 10) {
    await this.ensureProfileSchema();
    const safeLimit = Math.min(Math.max(Number(limit) || 10, 1), 50);
    const result = await this.queryWithRetry(
      `
        SELECT module_key, COUNT(*)::int AS total
        FROM activity_logs
        WHERE module_key IS NOT NULL AND module_key <> ''
        GROUP BY module_key
        ORDER BY total DESC
        LIMIT $1
      `,
      [safeLimit]
    );
    return result.rows.map((row) => ({
      moduleKey: row.module_key,
      total: row.total
    }));
  },

  async getTopUsersUsage(limit = 10) {
    await this.ensureProfileSchema();
    const safeLimit = Math.min(Math.max(Number(limit) || 10, 1), 50);
    const result = await this.queryWithRetry(
      `
        SELECT COALESCE(username, user_id, 'desconhecido') AS actor, COUNT(*)::int AS total
        FROM activity_logs
        GROUP BY COALESCE(username, user_id, 'desconhecido')
        ORDER BY total DESC
        LIMIT $1
      `,
      [safeLimit]
    );
    return result.rows.map((row) => ({
      actor: row.actor,
      total: row.total
    }));
  },

  async getCachedAdminStats(cacheKey = 'global') {
    await this.ensureProfileSchema();
    const result = await this.queryWithRetry(
      'SELECT payload, updated_at FROM admin_stats_cache WHERE cache_key = $1 LIMIT 1',
      [cacheKey]
    );
    if (result.rows.length === 0) return null;
    return {
      payload: result.rows[0].payload,
      updatedAt: result.rows[0].updated_at
    };
  },

  async refreshAdminStatsCache(cacheKey = 'global') {
    await this.ensureProfileSchema();
    const [timeline, topModules, topUsers] = await Promise.all([
      this.getUsageTimeline(30),
      this.getTopModulesUsage(10),
      this.getTopUsersUsage(10)
    ]);
    const payload = { timeline, topModules, topUsers };
    await this.queryWithRetry(
      `
        INSERT INTO admin_stats_cache (cache_key, payload, updated_at)
        VALUES ($1, $2, $3)
        ON CONFLICT (cache_key) DO UPDATE SET
          payload = EXCLUDED.payload,
          updated_at = EXCLUDED.updated_at
      `,
      [cacheKey, JSON.stringify(payload), new Date().toISOString()]
    );
    return payload;
  },

  async getHybridAdminStatistics(cacheKey = 'global', cacheTtlMinutes = 10) {
    await this.ensureProfileSchema();
    const live = await this.getSystemStatisticsLive();
    const cached = await this.getCachedAdminStats(cacheKey);
    const ttlMs = Math.max(Number(cacheTtlMinutes) || 10, 1) * 60 * 1000;
    const shouldRefresh = !cached || (Date.now() - new Date(cached.updatedAt).getTime()) > ttlMs;
    const aggregates = shouldRefresh
      ? await this.refreshAdminStatsCache(cacheKey)
      : cached.payload;

    return {
      live,
      aggregates,
      cacheUpdatedAt: shouldRefresh ? new Date().toISOString() : cached.updatedAt
    };
  },

  async getAdminStatisticsForPanel() {
    await this.ensureProfileSchema();
    const [
      usersTotalResult,
      usersActiveResult,
      usersByRoleResult,
      totalLoginsResult,
      totalActionsResult,
      actionsLast30DaysResult,
      byModuleResult,
      topUsersResult,
      topModulesResult,
      transactionsResult,
      productsResult,
      clientsResult,
      modulesResult
    ] = await Promise.all([
      this.queryWithRetry('SELECT COUNT(*)::int AS value FROM users'),
      this.queryWithRetry('SELECT COUNT(*)::int AS value FROM users WHERE is_active = TRUE'),
      this.queryWithRetry(
        `
          SELECT role, COUNT(*)::int AS value
          FROM users
          GROUP BY role
        `
      ),
      this.queryWithRetry("SELECT COUNT(*)::int AS value FROM activity_logs WHERE action = 'login'"),
      this.queryWithRetry('SELECT COUNT(*)::int AS value FROM activity_logs'),
      this.queryWithRetry("SELECT COUNT(*)::int AS value FROM activity_logs WHERE created_at >= NOW() - INTERVAL '30 days'"),
      this.queryWithRetry(
        `
          SELECT
            COALESCE(module_key, 'unknown') AS module_key,
            COUNT(*)::int AS actions,
            COUNT(DISTINCT COALESCE(user_id, username))::int AS users
          FROM activity_logs
          GROUP BY COALESCE(module_key, 'unknown')
        `
      ),
      this.queryWithRetry(
        `
          SELECT
            COALESCE(username, user_id, 'desconhecido') AS username,
            COUNT(*)::int AS count
          FROM activity_logs
          GROUP BY COALESCE(username, user_id, 'desconhecido')
          ORDER BY count DESC
          LIMIT 5
        `
      ),
      this.queryWithRetry(
        `
          SELECT
            COALESCE(module_key, 'unknown') AS key,
            COUNT(*)::int AS count
          FROM activity_logs
          GROUP BY COALESCE(module_key, 'unknown')
          ORDER BY count DESC
          LIMIT 10
        `
      ),
      this.queryWithRetry('SELECT COUNT(*)::int AS value FROM transactions'),
      this.queryWithRetry('SELECT COUNT(*)::int AS value FROM products'),
      this.queryWithRetry('SELECT COUNT(*)::int AS value FROM clients'),
      this.queryWithRetry(
        `
          SELECT
            COUNT(*)::int AS total,
            COUNT(*) FILTER (WHERE is_active = TRUE)::int AS active,
            COUNT(*) FILTER (WHERE is_system = TRUE)::int AS system,
            COUNT(*) FILTER (WHERE is_system = FALSE)::int AS custom
          FROM modules_catalog
        `
      )
    ]);

    const usersTotal = usersTotalResult.rows[0]?.value || 0;
    const usersActive = usersActiveResult.rows[0]?.value || 0;
    const usersByRole = { admin: 0, user: 0, guest: 0 };
    for (const item of usersByRoleResult.rows) {
      if (item.role === 'admin' || item.role === 'user' || item.role === 'guest') {
        usersByRole[item.role] = item.value || 0;
      }
    }

    const byModule = {};
    for (const item of byModuleResult.rows) {
      byModule[item.module_key] = {
        actions: item.actions || 0,
        users: item.users || 0
      };
    }

    return {
      users: {
        total: usersTotal,
        active: usersActive,
        inactive: Math.max(usersTotal - usersActive, 0),
        byRole: usersByRole
      },
      activity: {
        totalLogins: totalLoginsResult.rows[0]?.value || 0,
        totalActions: totalActionsResult.rows[0]?.value || 0,
        actionsLast30Days: actionsLast30DaysResult.rows[0]?.value || 0,
        byModule,
        topUsers: topUsersResult.rows.map((item) => ({
          username: item.username,
          count: item.count
        })),
        topModules: topModulesResult.rows.map((item) => ({
          key: item.key,
          count: item.count
        }))
      },
      data: {
        transactions: transactionsResult.rows[0]?.value || 0,
        products: productsResult.rows[0]?.value || 0,
        clients: clientsResult.rows[0]?.value || 0
      },
      modules: {
        total: modulesResult.rows[0]?.total || 0,
        active: modulesResult.rows[0]?.active || 0,
        system: modulesResult.rows[0]?.system || 0,
        custom: modulesResult.rows[0]?.custom || 0
      }
    };
  },

  async seedUserModulePermissionsFromRole(userId, role, skipEnsure = false) {
    if (!skipEnsure) {
      await this.ensureProfileSchema();
    }

    // Fase 2.x: usa defaults editáveis (role_default_permissions, migration
    // 043). Caímos no FALLBACK_DEFAULTS automaticamente se a tabela estiver
    // vazia. computeDefaultsForRole é puro — recebe o mapa do DB.
    const catalog = await this.getModulesCatalog();
    const configMap = await this.loadRoleDefaultsMap();
    const permissions = computeDefaultsForRole(role, catalog, configMap);
    const now = new Date().toISOString();

    for (const { moduleKey, accessLevel } of permissions) {
      await this.queryWithRetry(
        `
          INSERT INTO user_module_permissions
            (id, user_id, module_key, access_level, created_at, updated_at)
          VALUES ($1, $2, $3, $4, $5, $6)
          ON CONFLICT (user_id, module_key) DO UPDATE SET
            access_level = EXCLUDED.access_level,
            updated_at = EXCLUDED.updated_at
        `,
        [
          this.generateId(),
          userId,
          moduleKey,
          accessLevel,
          now,
          now
        ]
      );
    }
  },

  async getUserProfileById(userId) {
    await this.ensureProfileSchema();
    const userResult = await this.queryWithRetry(
      `
        SELECT
          id,
          username,
          role,
          first_name,
          last_name,
          email,
          phone,
          cpf,
          birth_date,
          gender,
          position,
          address,
          photo_url,
          is_active,
          last_login,
          created_at,
          updated_at,
          COALESCE(tc_email_notifications, FALSE) AS tc_email_notifications
        FROM users
        WHERE id = $1
      `,
      [userId]
    );

    if (userResult.rows.length === 0) {
      return null;
    }

    const user = userResult.rows[0];
    let parsedAddress = null;
    if (user.address && typeof user.address === 'object') {
      parsedAddress = user.address;
    } else if (typeof user.address === 'string') {
      try {
        parsedAddress = JSON.parse(user.address);
      } catch (error) {
        parsedAddress = null;
      }
    }

    let modulesAccess = await this.getUserModulePermissions(userId);
    let permissionsSource = 'persisted';

    if (modulesAccess.length === 0) {
      await this.seedUserModulePermissionsFromRole(userId, user.role, true);
      modulesAccess = await this.getUserModulePermissions(userId);
      permissionsSource = 'fallback';
    }

    return {
      id: user.id,
      username: user.username,
      role: user.role,
      firstName: user.first_name || null,
      lastName: user.last_name || null,
      email: user.email || null,
      phone: user.phone || null,
      cpf: user.cpf || null,
      birthDate: user.birth_date || null,
      gender: user.gender || null,
      position: user.position || null,
      address: parsedAddress,
      photoUrl: user.photo_url || null,
      isActive: user.is_active !== false,
      lastLogin: user.last_login || null,
      createdAt: user.created_at || null,
      updatedAt: user.updated_at || null,
      tcEmailNotifications: user.tc_email_notifications === true,
      modulesAccess,
      permissionsSource
    };
  },

  // Atualiza preferências leves do usuário (toggle opt-in de notificações
  // por email do TerraControl, futuras flags). Endpoint dedicado pra evitar
  // que esse path use o /api/user/profile que exige senha atual.
  async updateUserPreferences(userId, prefs) {
    const sets = [];
    const params = [];
    if (Object.prototype.hasOwnProperty.call(prefs, 'tcEmailNotifications')) {
      params.push(prefs.tcEmailNotifications === true);
      sets.push(`tc_email_notifications = $${params.length}`);
    }
    if (sets.length === 0) {
      return await this.getUserProfileById(userId);
    }
    params.push(userId);
    await this.queryWithRetry(
      `UPDATE users SET ${sets.join(', ')}, updated_at = NOW() WHERE id = $${params.length}`,
      params
    );
    return await this.getUserProfileById(userId);
  },

  async criarTokenRecuperacao(userId, ttlMinutes = 60) {
    await this.ensurePasswordResetSchema();
    const token = require('crypto').randomBytes(32).toString('hex');
    const safeTtl = Math.min(Math.max(Number(ttlMinutes) || 60, 5), 24 * 60);
    const expiresAt = new Date(Date.now() + safeTtl * 60 * 1000).toISOString();
    const tokenId = this.generateId();

    await this.queryWithRetry(
      `
        UPDATE password_reset_tokens
        SET used = TRUE, used_at = NOW()
        WHERE user_id = $1
          AND used = FALSE
          AND expires_at > NOW()
      `,
      [userId]
    );

    const result = await this.queryWithRetry(
      `
        INSERT INTO password_reset_tokens (id, user_id, token, expires_at, used, created_at)
        VALUES ($1, $2, $3, $4, FALSE, NOW())
        RETURNING id, token, expires_at, created_at
      `,
      [tokenId, userId, token, expiresAt]
    );

    return {
      id: result.rows[0].id,
      token: result.rows[0].token,
      expiresAt: result.rows[0].expires_at,
      createdAt: result.rows[0].created_at
    };
  },

  async validarTokenRecuperacao(token) {
    await this.ensurePasswordResetSchema();
    const result = await this.queryWithRetry(
      `
        SELECT
          prt.id,
          prt.user_id,
          prt.token,
          prt.expires_at,
          prt.used,
          prt.created_at,
          u.username,
          u.email
        FROM password_reset_tokens prt
        JOIN users u ON u.id = prt.user_id
        WHERE prt.token = $1
          AND prt.used = FALSE
          AND prt.expires_at > NOW()
        LIMIT 1
      `,
      [token]
    );

    if (result.rows.length === 0) return null;
    const row = result.rows[0];
    return {
      id: row.id,
      userId: row.user_id,
      token: row.token,
      expiresAt: row.expires_at,
      used: row.used === true,
      createdAt: row.created_at,
      username: row.username,
      email: row.email || null
    };
  },

  async marcarTokenComoUsado(token) {
    await this.ensurePasswordResetSchema();
    await this.queryWithRetry(
      `
        UPDATE password_reset_tokens
        SET used = TRUE, used_at = NOW()
        WHERE token = $1
      `,
      [token]
    );
    return true;
  },

  async resetarSenhaComToken(token, newPasswordHash) {
    await this.ensurePasswordResetSchema();
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      const tokenResult = await client.query(
        `
          SELECT
            prt.id,
            prt.user_id,
            prt.expires_at,
            u.username,
            u.email
          FROM password_reset_tokens prt
          JOIN users u ON u.id = prt.user_id
          WHERE prt.token = $1
            AND prt.used = FALSE
            AND prt.expires_at > NOW()
          FOR UPDATE
          LIMIT 1
        `,
        [token]
      );

      if (tokenResult.rows.length === 0) {
        throw new Error('Token inválido ou expirado');
      }

      const tokenRow = tokenResult.rows[0];

      await client.query(
        `
          UPDATE users
          SET password = $1, updated_at = $2
          WHERE id = $3
        `,
        [newPasswordHash, new Date().toISOString(), tokenRow.user_id]
      );

      await client.query(
        `
          UPDATE password_reset_tokens
          SET used = TRUE, used_at = NOW()
          WHERE id = $1
        `,
        [tokenRow.id]
      );

      await client.query('COMMIT');

      return {
        userId: tokenRow.user_id,
        username: tokenRow.username,
        email: tokenRow.email || null
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  },

  async cleanupExpiredPasswordResetTokens() {
    await this.ensurePasswordResetSchema();
    const result = await this.queryWithRetry(
      `
        DELETE FROM password_reset_tokens
        WHERE expires_at <= NOW() OR used = TRUE
      `
    );
    return result.rowCount || 0;
  },
};
