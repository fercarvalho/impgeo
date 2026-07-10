require('dotenv').config();
const { Pool } = require('pg');
const {
  SYSTEM_ROLES,
  VALID_ACCESS_LEVELS,
  FALLBACK_DEFAULTS,
  computeDefaultsForRole,
  buildRoleMapFromDbRows,
  getDefaultLevelForRoleAndSubsystem,
  getDefaultOverridesForRole,
} = require('./permissions/defaults');
const {
  FACTORY_DEFAULTS: NOTIFICATION_FACTORY_DEFAULTS,
  CHANNELS: NOTIFICATION_CHANNELS,
  cacheKey: notifCacheKey,
  resolveDefault: resolveNotificationDefault,
  knownTypes: knownNotificationTypes,
  buildDefaultsGrid: buildNotificationDefaultsGrid,
} = require('./services/pm/notification-defaults');
const { MODULES_CATALOG } = require('./modules-catalog');
// #15 A: toCamelCase movido para db/_shared.js (compartilhado com os arquivos-domínio).
const { toCamelCase, TC_USER_PUBLIC_FIELDS } = require('./db/_shared');

class Database {
  constructor() {
    this.pool = new Pool({
      host: process.env.DB_HOST || 'localhost',
      port: Number(process.env.DB_PORT) || 5432,
      database: process.env.DB_NAME || 'impgeo',
      user: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD || '',
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
    });
    this.shareLinksSchemaEnsured = false;
    this.shareLinksSchemaEnsuring = null;
    this.profileSchemaEnsured = false;
    this.profileSchemaEnsuring = null;
    this.passwordResetSchemaEnsured = false;
    this.passwordResetSchemaEnsuring = null;
    this.terracontrolSchemaEnsured = false;
    this.terracontrolSchemaEnsuring = null;
    this.legalSchemaEnsured = false;
    this.legalSchemaEnsuring = null;
    this.docSchemaEnsured = false;
    this.docSchemaEnsuring = null;
    this.roadmapSchemaEnsured = false;
    this.roadmapSchemaEnsuring = null;
    // Inicializa tabelas legais em background
    this._ensureLegalDefaults().catch(e => console.error('Erro ao inicializar schema legal:', e));
    // Inicializa tabelas de documentação em background
    this._ensureDocDefaults().catch(e => console.error('Erro ao inicializar schema de documentação:', e));
    // Inicializa tabelas do roadmap em background
    this._ensureRoadmapDefaults().catch(e => console.error('Erro ao inicializar schema do roadmap:', e));
  }

  // Método auxiliar para gerar IDs únicos
  generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
  }

  // Padroniza código do imóvel para 3 dígitos (001, 002, ...)
  formatCodImovel(value) {
    const digits = String(value ?? '').replace(/\D/g, '');
    if (!digits) return null;
    return digits.padStart(3, '0');
  }

  // Método auxiliar para retry logic
  async queryWithRetry(queryText, params, retries = 3) {
    for (let i = 0; i < retries; i++) {
      try {
        return await this.pool.query(queryText, params);
      } catch (error) {
        if (error.code === 'ECONNREFUSED' && i < retries - 1) {
          await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)));
          continue;
        }
        throw error;
      }
    }
  }

  // Catálogo de módulos — movido para ./modules-catalog.js (#6), para ser
  // importável pelo teste de consistência sem instanciar Database.
  getDefaultModulesCatalog() {
    return MODULES_CATALOG;
  }

  // Fase 2.1: fonte da verdade dos defaults vive em ./permissions/defaults.js.
  // As helpers abaixo são wrappers finos que delegam, mantendo a API antiga
  // para callers ainda não migrados (que vão sumir nas próximas sub-fases).

  getDefaultPermissionsByRole(role) {
    const catalog = this.getDefaultModulesCatalog();
    return computeDefaultsForRole(role, catalog);
  }

  getDefaultModuleKeysByRole(role) {
    return this.getDefaultPermissionsByRole(role).map((perm) => perm.moduleKey);
  }

  // DEPRECATED — não há mais "um único nível por role", as roles mistas
  // (user, guest) precisam de níveis diferentes por subsistema. Mantido por
  // compat: retorna o nível mais permissivo que a role tem em qualquer
  // subsistema. Quem precisar do mapeamento real deve usar
  // getDefaultPermissionsByRole().
  getDefaultAccessLevelByRole(role) {
    const perms = this.getDefaultPermissionsByRole(role);
    if (perms.some((p) => p.accessLevel === 'edit')) return 'edit';
    if (perms.some((p) => p.accessLevel === 'view')) return 'view';
    return 'view';
  }

  async ensureProfileSchema() {
    if (this.profileSchemaEnsured) return;
    if (this.profileSchemaEnsuring) {
      await this.profileSchemaEnsuring;
      return;
    }

    this.profileSchemaEnsuring = (async () => {
      // Origem da transação (migration 068) — self-heal.
      await this.queryWithRetry("ALTER TABLE transactions ADD COLUMN IF NOT EXISTS source VARCHAR(20) DEFAULT 'manual'");
      await this.queryWithRetry('ALTER TABLE users ADD COLUMN IF NOT EXISTS photo_url TEXT');
      await this.queryWithRetry('ALTER TABLE users ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE');
      await this.queryWithRetry('ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login TIMESTAMPTZ');
      await this.queryWithRetry('ALTER TABLE users ADD COLUMN IF NOT EXISTS first_name VARCHAR(255)');
      await this.queryWithRetry('ALTER TABLE users ADD COLUMN IF NOT EXISTS last_name VARCHAR(255)');
      await this.queryWithRetry('ALTER TABLE users ADD COLUMN IF NOT EXISTS email VARCHAR(255)');
      await this.queryWithRetry('ALTER TABLE users ADD COLUMN IF NOT EXISTS phone VARCHAR(50)');
      await this.queryWithRetry('ALTER TABLE users ADD COLUMN IF NOT EXISTS cpf VARCHAR(20)');
      await this.queryWithRetry('ALTER TABLE users ADD COLUMN IF NOT EXISTS birth_date DATE');
      await this.queryWithRetry('ALTER TABLE users ADD COLUMN IF NOT EXISTS gender VARCHAR(50)');
      await this.queryWithRetry('ALTER TABLE users ADD COLUMN IF NOT EXISTS position VARCHAR(255)');
      await this.queryWithRetry('ALTER TABLE users ADD COLUMN IF NOT EXISTS address JSONB');
      await this.queryWithRetry('CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)');
      await this.queryWithRetry('CREATE INDEX IF NOT EXISTS idx_users_cpf ON users(cpf)');

      const lastLoginColumn = await this.queryWithRetry(
        `
          SELECT data_type
          FROM information_schema.columns
          WHERE table_name = 'users'
            AND column_name = 'last_login'
          LIMIT 1
        `
      );

      const lastLoginDataType = lastLoginColumn.rows[0]?.data_type;
      if (lastLoginDataType === 'timestamp without time zone') {
        await this.queryWithRetry(
          `
            ALTER TABLE users
            ALTER COLUMN last_login
            TYPE TIMESTAMPTZ
            USING last_login AT TIME ZONE 'UTC'
          `
        );
      }

      await this.queryWithRetry(`
        CREATE TABLE IF NOT EXISTS modules_catalog (
          module_key VARCHAR(100) PRIMARY KEY,
          module_name VARCHAR(255) NOT NULL,
          icon_name VARCHAR(100),
          description TEXT,
          route_path VARCHAR(255),
          is_system BOOLEAN DEFAULT FALSE,
          is_active BOOLEAN DEFAULT TRUE,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);
      await this.queryWithRetry('ALTER TABLE modules_catalog ADD COLUMN IF NOT EXISTS icon_name VARCHAR(100)');
      await this.queryWithRetry('ALTER TABLE modules_catalog ADD COLUMN IF NOT EXISTS description TEXT');
      await this.queryWithRetry('ALTER TABLE modules_catalog ADD COLUMN IF NOT EXISTS route_path VARCHAR(255)');
      await this.queryWithRetry('ALTER TABLE modules_catalog ADD COLUMN IF NOT EXISTS is_system BOOLEAN DEFAULT FALSE');
      await this.queryWithRetry('ALTER TABLE modules_catalog ADD COLUMN IF NOT EXISTS sort_order INTEGER');
      await this.queryWithRetry('CREATE UNIQUE INDEX IF NOT EXISTS idx_modules_catalog_key_unique ON modules_catalog(module_key)');

      await this.queryWithRetry(`
        CREATE TABLE IF NOT EXISTS user_module_permissions (
          id VARCHAR(255) PRIMARY KEY,
          user_id VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          module_key VARCHAR(100) NOT NULL REFERENCES modules_catalog(module_key) ON DELETE CASCADE,
          access_level VARCHAR(10) NOT NULL CHECK (access_level IN ('view', 'edit')),
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(user_id, module_key)
        )
      `);

      await this.queryWithRetry(`
        CREATE INDEX IF NOT EXISTS idx_user_module_permissions_user_id
        ON user_module_permissions(user_id)
      `);
      await this.queryWithRetry(`
        CREATE INDEX IF NOT EXISTS idx_user_module_permissions_module_key
        ON user_module_permissions(module_key)
      `);

      await this.queryWithRetry(`
        CREATE TABLE IF NOT EXISTS activity_logs (
          id VARCHAR(255) PRIMARY KEY,
          user_id VARCHAR(255),
          username VARCHAR(255),
          action VARCHAR(100) NOT NULL,
          module_key VARCHAR(100),
          entity_type VARCHAR(100),
          entity_id VARCHAR(255),
          details JSONB,
          ip_address VARCHAR(100),
          created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
        )
      `);
      await this.queryWithRetry(`
        CREATE INDEX IF NOT EXISTS idx_activity_logs_created_at
        ON activity_logs(created_at DESC)
      `);
      await this.queryWithRetry(`
        CREATE INDEX IF NOT EXISTS idx_activity_logs_user_id
        ON activity_logs(user_id)
      `);
      await this.queryWithRetry(`
        CREATE INDEX IF NOT EXISTS idx_activity_logs_module_key
        ON activity_logs(module_key)
      `);
      await this.queryWithRetry(`
        CREATE INDEX IF NOT EXISTS idx_activity_logs_action
        ON activity_logs(action)
      `);

      await this.queryWithRetry(`
        CREATE TABLE IF NOT EXISTS admin_stats_cache (
          cache_key VARCHAR(100) PRIMARY KEY,
          payload JSONB NOT NULL,
          updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
        )
      `);

      const defaultModules = this.getDefaultModulesCatalog();
      for (const module of defaultModules) {
        await this.queryWithRetry(
          `
            INSERT INTO modules_catalog
              (module_key, module_name, icon_name, description, route_path, is_system, is_active, sort_order, subsystem_key, created_at, updated_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
            ON CONFLICT (module_key) DO UPDATE SET
              module_name = EXCLUDED.module_name,
              icon_name = COALESCE(modules_catalog.icon_name, EXCLUDED.icon_name),
              description = COALESCE(modules_catalog.description, EXCLUDED.description),
              route_path = COALESCE(modules_catalog.route_path, EXCLUDED.route_path),
              is_system = TRUE,
              is_active = EXCLUDED.is_active,
              subsystem_key = EXCLUDED.subsystem_key,
              updated_at = EXCLUDED.updated_at
          `,
          [
            module.moduleKey,
            module.moduleName,
            module.iconName || null,
            module.description || null,
            module.routePath || null,
            module.isSystem === true,
            true,
            module.sortOrder ?? null,
            module.subsystemKey,
            new Date().toISOString(),
            new Date().toISOString()
          ]
        );
      }

      // Boot-warn (#6): confere que todo subsistema referenciado pelo catálogo
      // existe na tabela `subsystems`. Só avisa (não trava). O drift
      // manifest↔catálogo é barrado no CI (modules-consistency.test.js).
      try {
        const subRows = await this.queryWithRetry('SELECT subsystem_key FROM subsystems');
        const knownSubs = new Set(subRows.rows.map(r => r.subsystem_key));
        const catalogSubs = new Set(defaultModules.map(m => m.subsystemKey));
        const missing = [...catalogSubs].filter(s => !knownSubs.has(s));
        if (missing.length > 0) {
          console.warn(`[modules] ⚠️  subsistema(s) do catálogo ausentes na tabela subsystems: ${missing.join(', ')} — o menu pode não exibir esses módulos.`);
        }
      } catch { /* tabela subsystems ausente (migration 016 não aplicada) — ignora */ }

      const usersWithoutPermissions = await this.queryWithRetry(`
        SELECT u.id, u.role
        FROM users u
        LEFT JOIN user_module_permissions ump ON ump.user_id = u.id
        GROUP BY u.id, u.role
        HAVING COUNT(ump.id) = 0
      `);

      for (const user of usersWithoutPermissions.rows) {
        await this.seedUserModulePermissionsFromRole(user.id, user.role, true);
      }

      // Fase 2.1: o seed legado por-módulo (que populava com 'write' para
      // user) foi removido. A migration 042 já populou todos os usuários
      // existentes via defaults de role. Para usuários NOVOS, o caminho é
      // seedUserModulePermissionsFromRole(), que delega para defaults.js.
      // Para módulos novos adicionados depois da 042: chamar
      // resetUserPermissionsToDefaults(userId, role) ou aplicar uma migration
      // específica (como a 017 fez para os 4 módulos do gerenciamento).


      // ── Tabelas de segurança / sessões ─────────────────────────
      await this.queryWithRetry(`
        CREATE TABLE IF NOT EXISTS audit_logs (
          id SERIAL PRIMARY KEY,
          timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          operation VARCHAR(100) NOT NULL,
          user_id VARCHAR(255),
          username VARCHAR(255),
          ip_address VARCHAR(45),
          user_agent TEXT,
          details JSONB,
          status VARCHAR(50) DEFAULT 'success',
          error_message TEXT,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);
      await this.queryWithRetry(`CREATE INDEX IF NOT EXISTS idx_audit_logs_timestamp  ON audit_logs(timestamp DESC)`);
      await this.queryWithRetry(`CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id    ON audit_logs(user_id)`);
      await this.queryWithRetry(`CREATE INDEX IF NOT EXISTS idx_audit_logs_operation  ON audit_logs(operation)`);
      await this.queryWithRetry(`CREATE INDEX IF NOT EXISTS idx_audit_logs_status     ON audit_logs(status)`);

      await this.queryWithRetry(`
        CREATE TABLE IF NOT EXISTS refresh_tokens (
          id SERIAL PRIMARY KEY,
          token VARCHAR(500) UNIQUE NOT NULL,
          user_id VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          expires_at TIMESTAMPTZ NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          revoked BOOLEAN DEFAULT FALSE,
          revoked_at TIMESTAMPTZ,
          ip_address VARCHAR(45),
          user_agent TEXT,
          replaced_by_token VARCHAR(500)
        )
      `);
      await this.queryWithRetry(`CREATE INDEX IF NOT EXISTS idx_refresh_tokens_token      ON refresh_tokens(token)`);
      await this.queryWithRetry(`CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user_id    ON refresh_tokens(user_id)`);
      await this.queryWithRetry(`CREATE INDEX IF NOT EXISTS idx_refresh_tokens_expires_at ON refresh_tokens(expires_at)`);
      await this.queryWithRetry(`CREATE INDEX IF NOT EXISTS idx_refresh_tokens_revoked    ON refresh_tokens(revoked)`);

      await this.queryWithRetry(`
        CREATE TABLE IF NOT EXISTS active_sessions (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          user_id VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          refresh_token_id INTEGER REFERENCES refresh_tokens(id) ON DELETE SET NULL,
          ip_address VARCHAR(45) NOT NULL,
          user_agent TEXT NOT NULL,
          device_type VARCHAR(50),
          device_name VARCHAR(255),
          browser VARCHAR(100),
          os VARCHAR(100),
          country VARCHAR(100),
          city VARCHAR(255),
          latitude DECIMAL(10,8),
          longitude DECIMAL(11,8),
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          last_activity_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          expires_at TIMESTAMP NOT NULL,
          is_active BOOLEAN DEFAULT TRUE,
          revoked_at TIMESTAMP,
          revoked_reason VARCHAR(255)
        )
      `);
      await this.queryWithRetry(`CREATE INDEX IF NOT EXISTS idx_active_sessions_user_id   ON active_sessions(user_id)`);
      await this.queryWithRetry(`CREATE INDEX IF NOT EXISTS idx_active_sessions_is_active  ON active_sessions(is_active) WHERE is_active = TRUE`);
      await this.queryWithRetry(`CREATE INDEX IF NOT EXISTS idx_active_sessions_refresh_id ON active_sessions(refresh_token_id)`);
      // ────────────────────────────────────────────────────────────

      // ── Tabela de notificações de versão ───────────────────────
      await this.queryWithRetry(`
        CREATE TABLE IF NOT EXISTS versao_notificacoes_vistas (
          user_id VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          versao  VARCHAR(50)  NOT NULL,
          visto_em TIMESTAMPTZ DEFAULT NOW(),
          PRIMARY KEY (user_id, versao)
        )
      `);

      await this.queryWithRetry(`
        CREATE TABLE IF NOT EXISTS versao_notificacoes (
          versao     VARCHAR(50) PRIMARY KEY,
          texto      TEXT,
          roles      TEXT,
          criado_em  TIMESTAMPTZ DEFAULT NOW()
        )
      `);
      await this.queryWithRetry(`CREATE INDEX IF NOT EXISTS idx_versao_notificacoes_criado ON versao_notificacoes(criado_em)`);

      // Colunas para diferenciar 'versao' (release) de 'aviso' (commit sem nova versão)
      await this.queryWithRetry(`ALTER TABLE versao_notificacoes ADD COLUMN IF NOT EXISTS tipo VARCHAR(20) DEFAULT 'versao'`);
      await this.queryWithRetry(`ALTER TABLE versao_notificacoes ADD COLUMN IF NOT EXISTS versao_referencia VARCHAR(50)`);

      // Migração one-shot: traz a notificação atual (chaves antigas) para o histórico
      await this.queryWithRetry(`
        INSERT INTO versao_notificacoes (versao, texto, roles, criado_em, tipo, versao_referencia)
        SELECT
          v.valor,
          COALESCE(t.valor, ''),
          COALESCE(r.valor, '[]'),
          COALESCE(v.updated_at, NOW()),
          'versao',
          v.valor
        FROM rodape_configuracoes v
        LEFT JOIN rodape_configuracoes t ON t.chave = 'versao_notificada_texto'
        LEFT JOIN rodape_configuracoes r ON r.chave = 'versao_notificada_roles'
        WHERE v.chave = 'versao_notificada' AND v.valor IS NOT NULL AND v.valor <> ''
        ON CONFLICT (versao) DO NOTHING
      `);

      // Fila de commits pendentes (cada commit detectado pelo hook empilha aqui)
      await this.queryWithRetry(`
        CREATE TABLE IF NOT EXISTS commits_pendentes (
          commit_hash   VARCHAR(50) PRIMARY KEY,
          mensagem      TEXT,
          data          VARCHAR(20),
          detectado_em  TIMESTAMPTZ DEFAULT NOW()
        )
      `);
      await this.queryWithRetry(`CREATE INDEX IF NOT EXISTS idx_commits_pendentes_detectado ON commits_pendentes(detectado_em)`);

      // Migração one-shot: se o último commit detectado ainda não foi confirmado,
      // joga ele na fila para não ser perdido na transição
      await this.queryWithRetry(`
        INSERT INTO commits_pendentes (commit_hash, mensagem, data, detectado_em)
        SELECT
          ins.valor,
          COALESCE(msg.valor, ''),
          COALESCE(dt.valor, ''),
          COALESCE(ins.updated_at, NOW())
        FROM rodape_configuracoes ins
        LEFT JOIN rodape_configuracoes msg ON msg.chave = 'ultimo_commit_msg'
        LEFT JOIN rodape_configuracoes dt  ON dt.chave  = 'ultimo_commit_data'
        LEFT JOIN rodape_configuracoes cf  ON cf.chave  = 'ultimo_commit_confirmado'
        WHERE ins.chave = 'ultimo_commit_inserido'
          AND ins.valor IS NOT NULL AND ins.valor <> ''
          AND (cf.valor IS NULL OR cf.valor <> ins.valor)
        ON CONFLICT (commit_hash) DO NOTHING
      `);
      // ────────────────────────────────────────────────────────────

      // ── Tabelas do rodapé ──────────────────────────────────────
      await this.queryWithRetry(`
        CREATE TABLE IF NOT EXISTS rodape_configuracoes (
          chave VARCHAR(100) PRIMARY KEY,
          valor TEXT,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);

      await this.queryWithRetry(`
        CREATE TABLE IF NOT EXISTS rodape_colunas (
          id VARCHAR(255) PRIMARY KEY,
          titulo VARCHAR(255) NOT NULL,
          ordem INTEGER DEFAULT 0,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);

      await this.queryWithRetry(`
        CREATE TABLE IF NOT EXISTS rodape_links (
          id VARCHAR(255) PRIMARY KEY,
          coluna_id VARCHAR(255) REFERENCES rodape_colunas(id) ON DELETE CASCADE,
          texto VARCHAR(255) NOT NULL,
          link TEXT,
          eh_link BOOLEAN DEFAULT TRUE,
          ordem INTEGER DEFAULT 0,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);

      await this.queryWithRetry(`
        CREATE TABLE IF NOT EXISTS rodape_bottom_links (
          id VARCHAR(255) PRIMARY KEY,
          texto VARCHAR(255) NOT NULL,
          link TEXT,
          ativo BOOLEAN DEFAULT TRUE,
          ordem INTEGER DEFAULT 0,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);
      // ────────────────────────────────────────────────────────────

      // Defaults de notificação (#7): semeia a tabela com o factory e carrega
      // o cache (defensivo — no-op se a migration 071 ainda não rodou).
      await this._seedNotificationDefaults();

      this.profileSchemaEnsured = true;
    })().finally(() => {
      this.profileSchemaEnsuring = null;
    });

    await this.profileSchemaEnsuring;
  }

  async ensurePasswordResetSchema() {
    if (this.passwordResetSchemaEnsured) return;
    if (this.passwordResetSchemaEnsuring) {
      await this.passwordResetSchemaEnsuring;
      return;
    }

    this.passwordResetSchemaEnsuring = (async () => {
      await this.queryWithRetry(`
        CREATE TABLE IF NOT EXISTS password_reset_tokens (
          id VARCHAR(255) PRIMARY KEY,
          user_id VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          token VARCHAR(255) UNIQUE NOT NULL,
          expires_at TIMESTAMPTZ NOT NULL,
          used BOOLEAN DEFAULT FALSE,
          created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
          used_at TIMESTAMPTZ
        )
      `);
      await this.queryWithRetry(
        'CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_user_id ON password_reset_tokens(user_id)'
      );
      await this.queryWithRetry(
        'CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_expires_at ON password_reset_tokens(expires_at)'
      );
      await this.queryWithRetry(
        'CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_used ON password_reset_tokens(used)'
      );
      this.passwordResetSchemaEnsured = true;
    })().finally(() => {
      this.passwordResetSchemaEnsuring = null;
    });

    await this.passwordResetSchemaEnsuring;
  }

  // Transações (CRUD, regras, aplicação, candidatos, preview, permissões) — movidos para db/transactions.js (#15 A).
  // Cadastros (produtos, clientes, projetos, serviços) — movidos para db/cadastros.js (#15 A).
  // TerraControl (registros, share, tc_users, tokens, convites, notificações tc) — movidos para db/terracontrol.js (#15 A).
  // ===========================================================================
  // Web Push: subscriptions e preferências de notificação
  // ===========================================================================
  // Duas famílias paralelas (scope='impgeo' vs scope='tc'), escolhidas pelo
  // primeiro parâmetro de cada helper. impgeo → push_subscriptions /
  // notification_preferences; tc → tc_push_subscriptions /
  // tc_notification_preferences.
  //
  // Os helpers de preferências têm fallback de defaults inline (constante
  // NOTIFICATION_DEFAULTS abaixo). Idéia: nem todo user precisa ter linha pra
  // cada (type, channel) — só quando o user toca o toggle a linha aparece.
  // Mantém a tabela enxuta e permite mudar defaults sem migration.
  //
  // Tipos de notificação especiais com prefixo '_meta:' guardam toggles que
  // não correspondem a um evento (ex: '_meta:foreground' = "mostrar push
  // OS-level com o app aberto").
  //
  // Migration 039 popula a tabela a partir das flags 033/034 antigas; o
  // código aqui não consulta 033/034 — depende da migração estar aplicada.

  // Defaults de notificação (melhoria #7): agora vivem na tabela
  // notification_defaults (editáveis sem deploy). NOTIFICATION_DEFAULTS segue
  // como alias do FACTORY (fallback + seed); os defaults EFETIVOS ficam no cache
  // _notifDefaults, carregado no boot por _seedNotificationDefaults().
  static NOTIFICATION_DEFAULTS = NOTIFICATION_FACTORY_DEFAULTS;
  _notifDefaults = null; // Map scope:type:channel→bool (null = usar factory)

  // Carrega os defaults efetivos da tabela p/ o cache. Defensivo: se a tabela
  // ainda não existe (migration 071 não aplicada), mantém null → usa o factory.
  async _loadNotificationDefaults() {
    try {
      const r = await this.queryWithRetry('SELECT scope, notification_type, channel, enabled FROM notification_defaults');
      const map = new Map();
      for (const row of r.rows) map.set(notifCacheKey(row.scope, row.notification_type, row.channel), row.enabled);
      this._notifDefaults = map;
    } catch { this._notifDefaults = null; }
  }

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
  }

  // Admin: grid de defaults efetivos de um escopo (cache → factory).
  async listNotificationDefaults(scope) {
    if (!this._notifDefaults) await this._loadNotificationDefaults();
    return buildNotificationDefaultsGrid(this._notifDefaults, scope);
  }

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
  }

  _pushSubsTable(scope) {
    return scope === 'tc' ? 'tc_push_subscriptions' : 'push_subscriptions';
  }

  _pushSubsUserCol(scope) {
    return scope === 'tc' ? 'tc_user_id' : 'user_id';
  }

  _prefsTable(scope) {
    return scope === 'tc' ? 'tc_notification_preferences' : 'notification_preferences';
  }

  _prefsUserCol(scope) {
    return scope === 'tc' ? 'tc_user_id' : 'user_id';
  }

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
  }

  async listActivePushSubscriptions(scope, userId) {
    const table = this._pushSubsTable(scope);
    const userCol = this._pushSubsUserCol(scope);
    const result = await this.queryWithRetry(
      `SELECT * FROM ${table} WHERE ${userCol} = $1 ORDER BY last_seen_at DESC`,
      [userId]
    );
    return result.rows;
  }

  async listAllPushSubscriptionsForUser(scope, userId) {
    return this.listActivePushSubscriptions(scope, userId);
  }

  async deletePushSubscriptionByEndpoint(scope, userId, endpoint) {
    const table = this._pushSubsTable(scope);
    const userCol = this._pushSubsUserCol(scope);
    const result = await this.queryWithRetry(
      `DELETE FROM ${table} WHERE ${userCol} = $1 AND endpoint = $2 RETURNING id`,
      [userId, endpoint]
    );
    return result.rows.length > 0;
  }

  // Remove uma subscription que o push service marcou como inválida (410/404).
  // Não exige user_id porque o endpoint é único globalmente.
  async pruneInvalidPushSubscription(scope, endpoint) {
    const table = this._pushSubsTable(scope);
    await this.queryWithRetry(
      `DELETE FROM ${table} WHERE endpoint = $1`,
      [endpoint]
    );
  }

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
  }

  async touchPushSubscriptionLastSeen(scope, endpoint) {
    const table = this._pushSubsTable(scope);
    await this.queryWithRetry(
      `UPDATE ${table}
          SET last_seen_at = NOW(), failed_count = 0
        WHERE endpoint = $1`,
      [endpoint]
    );
  }

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
  }

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
  }

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
  }

  async listTcUsersForAdmin() {
    // Inclui contagem de registros acessíveis por tc_user
    const r = await this.queryWithRetry(
      `SELECT ${TC_USER_PUBLIC_FIELDS},
              (SELECT COUNT(*) FROM tc_user_record_access tura WHERE tura.tc_user_id = tu.id) AS records_count
       FROM tc_users tu
       ORDER BY tu.created_at DESC`
    );
    return r.rows;
  }

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
  }

  // Subcategorias — movidos para db/subcategorias.js (#15 A).
  // Usuários, subsistemas e catálogo de módulos — movidos para db/usuarios.js (#15 A).
  // Permissões granulares, defaults por role e roles dinâmicas — movidos para db/permissoes.js (#15 A).

  // Financeiro (projeção/despesas/faturamento/resultado/backup) — métodos movidos para db/financeiro.js (#15 A).
  // FEEDBACK — métodos movidos para db/feedback.js (#15 A); anexados via Object.assign no fim do arquivo.
  // FAQ / Legal / Documentação — métodos movidos para db/cms.js (#15 A).
  // Roadmap — métodos movidos para db/roadmap.js (#15 A).
  // Rodapé + notificações de versão — métodos movidos para db/rodape.js (#15 A).

  // TerraControl Orçamentos/Pagamentos (migration 040) — movidos para db/budget.js (#15 A).
}

// ═══════════════════════════════════════════════════════════════════════════
// #15 A — Split do data-layer por domínio. Os métodos migrados vivem em
// db/<dominio>.js e são colados no prototype aqui (mesma instância `db`, `this`
// preservado → 587 call-sites `db.metodo()` e 631 `this.metodo()` intactos).
// ═══════════════════════════════════════════════════════════════════════════
Object.assign(Database.prototype,
  require('./db/feedback'),
  require('./db/notifications'),
  require('./db/cms'),
  require('./db/roadmap'),
  require('./db/rodape'),
  require('./db/financeiro'),
  require('./db/transactions'),
  require('./db/cadastros'),
  require('./db/budget'),
  require('./db/subcategorias'),
  require('./db/usuarios'),
  require('./db/permissoes'),
  require('./db/terracontrol'),
);

module.exports = Database;
