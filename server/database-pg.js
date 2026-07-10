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
const { toCamelCase } = require('./db/_shared');

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
  }

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
  }

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
  }

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
  }

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
  }

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
  }

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
  }

  async deleteTerraControlByTcUser(id) {
    return this.deleteTerraControl(id);
  }

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
  }

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
  }

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
  }

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
  }

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
  }

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
  }

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
  }

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
  }

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
  }

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
  }

  async getAllShareLinks() {
    try {
      const result = await this.queryWithRetry('SELECT * FROM share_links ORDER BY created_at DESC');
      return result.rows;
    } catch (error) {
      console.error('Erro ao buscar links compartilháveis:', error);
      return [];
    }
  }

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
  }

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
  }

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
  }

  // =========================================================================
  // tc_users — usuários externos do TerraControl (migration 025)
  // =========================================================================

  // Lista de campos seguros para retornar em SELECT (omite password).
  static get TC_USER_PUBLIC_FIELDS() {
    return [
      'id', 'username', 'first_name', 'last_name', 'email', 'email_verified_at',
      'phone', 'cpf', 'birth_date', 'gender', 'address', 'photo_url',
      'force_password_change', 'is_active', 'can_share',
      'edit_records_permission', 'delete_records_permission',
      'created_via', 'last_login', 'created_at', 'updated_at'
    ].join(', ');
  }

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
  }

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
  }

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
  }

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
  }

  async getAllTcUsers() {
    try {
      const result = await this.queryWithRetry(
        `SELECT ${Database.TC_USER_PUBLIC_FIELDS} FROM tc_users ORDER BY created_at DESC`
      );
      return result.rows;
    } catch (error) {
      console.error('Erro ao listar tc_users:', error);
      return [];
    }
  }

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
  }

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
  }

  async setTcUserLastLogin(id) {
    await this.queryWithRetry('UPDATE tc_users SET last_login = NOW() WHERE id = $1', [id]);
  }

  async deactivateTcUser(id) {
    await this.queryWithRetry('UPDATE tc_users SET is_active = FALSE, updated_at = NOW() WHERE id = $1', [id]);
  }

  async usernameTcUserExists(username) {
    const r = await this.queryWithRetry('SELECT 1 FROM tc_users WHERE username = $1 LIMIT 1', [username]);
    return r.rows.length > 0;
  }

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
  }

  // =========================================================================
  // tc_user_record_access — permissão granular por registro
  // =========================================================================

  async getTcUserRecordIds(tcUserId) {
    const r = await this.queryWithRetry(
      'SELECT terracontrol_id FROM tc_user_record_access WHERE tc_user_id = $1',
      [tcUserId]
    );
    return r.rows.map(row => row.terracontrol_id);
  }

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
  }

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
  }

  async tcUserHasAccessToRecord(tcUserId, recordId) {
    const r = await this.queryWithRetry(
      'SELECT 1 FROM tc_user_record_access WHERE tc_user_id = $1 AND terracontrol_id = $2 LIMIT 1',
      [tcUserId, String(recordId)]
    );
    return r.rows.length > 0;
  }

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
  }

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
  }

  async getTcRefreshTokenByHash(tokenHash) {
    const r = await this.queryWithRetry(
      `SELECT * FROM tc_refresh_tokens
       WHERE token_hash = $1 AND revoked = FALSE AND expires_at > NOW()
       LIMIT 1`,
      [tokenHash]
    );
    return r.rows[0] || null;
  }

  async revokeTcRefreshToken(tokenHash, replacedBy = null) {
    await this.queryWithRetry(
      `UPDATE tc_refresh_tokens
       SET revoked = TRUE, revoked_at = NOW(), replaced_by = $2
       WHERE token_hash = $1`,
      [tokenHash, replacedBy]
    );
  }

  async revokeAllTcRefreshTokens(tcUserId) {
    await this.queryWithRetry(
      `UPDATE tc_refresh_tokens
       SET revoked = TRUE, revoked_at = NOW()
       WHERE tc_user_id = $1 AND revoked = FALSE`,
      [tcUserId]
    );
  }

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
  }

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
  }

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
  }

  // =========================================================================
  // share_links — versão tc_user (sub-share gerado pelo próprio tc_user)
  // =========================================================================

  async getShareLinksCreatedByTcUser(tcUserId) {
    const r = await this.queryWithRetry(
      'SELECT * FROM share_links WHERE created_by_tc_user_id = $1 ORDER BY created_at DESC',
      [tcUserId]
    );
    return r.rows;
  }

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
  }

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
  }

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
  }

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
  }

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
  }

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
  }

  async getUnreadTcNotificationCount(tcUserId) {
    const result = await this.queryWithRetry(
      'SELECT COUNT(*)::INT AS count FROM tc_notifications WHERE tc_user_id = $1 AND is_read = FALSE AND cleared = FALSE',
      [tcUserId]
    );
    return result.rows[0].count;
  }

  async markTcNotificationAsRead(id, tcUserId) {
    const result = await this.queryWithRetry(
      `UPDATE tc_notifications
          SET is_read = TRUE, read_at = NOW()
        WHERE id = $1 AND tc_user_id = $2
        RETURNING *`,
      [id, tcUserId]
    );
    return result.rows[0] || null;
  }

  async markAllTcNotificationsAsRead(tcUserId) {
    await this.queryWithRetry(
      `UPDATE tc_notifications
          SET is_read = TRUE, read_at = NOW()
        WHERE tc_user_id = $1 AND is_read = FALSE AND cleared = FALSE`,
      [tcUserId]
    );
  }

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
  }

  async clearTcNotification(id, tcUserId) {
    const result = await this.queryWithRetry(
      `UPDATE tc_notifications
          SET cleared = TRUE, cleared_at = NOW()
        WHERE id = $1 AND tc_user_id = $2
        RETURNING *`,
      [id, tcUserId]
    );
    return result.rows[0] || null;
  }

  async clearAllTcNotifications(tcUserId) {
    const result = await this.queryWithRetry(
      `UPDATE tc_notifications
          SET cleared = TRUE, cleared_at = NOW()
        WHERE tc_user_id = $1 AND cleared = FALSE
        RETURNING id`,
      [tcUserId]
    );
    return result.rows.length;
  }

  async deleteTcNotification(id, tcUserId) {
    const result = await this.queryWithRetry(
      'DELETE FROM tc_notifications WHERE id = $1 AND tc_user_id = $2 RETURNING id',
      [id, tcUserId]
    );
    return result.rows[0] || null;
  }

  async deleteAllTcNotificationsForUser(tcUserId, { onlyCleared = false } = {}) {
    const result = await this.queryWithRetry(
      `DELETE FROM tc_notifications
        WHERE tc_user_id = $1 AND ($2::BOOLEAN = FALSE OR cleared = TRUE)
        RETURNING id`,
      [tcUserId, onlyCleared]
    );
    return result.rows.length;
  }

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
      `SELECT ${Database.TC_USER_PUBLIC_FIELDS},
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
  }

  invalidateRoleDefaultsCache() {
    this._roleDefaultsMapCache = null;
  }

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
  }

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
  }

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
  }

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
  }

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
  }

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
  }

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
  }

  async countUsersByRole(key) {
    await this.ensureProfileSchema();
    const result = await this.queryWithRetry(
      `SELECT COUNT(*)::int AS n FROM users WHERE role = $1`,
      [key]
    );
    return result.rows[0]?.n || 0;
  }

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
  }

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
  }

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
  }

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
  }

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
  }

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
  }

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
  }

  // Expostos para a UI (sem precisar duplicar imports no server.js)
  getDefaultLevelForRoleAndSubsystem(role, subsystemKey) {
    return getDefaultLevelForRoleAndSubsystem(role, subsystemKey);
  }
  getDefaultOverridesForRole(role) {
    return getDefaultOverridesForRole(role);
  }

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
  }

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
  }

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
  }

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
  }

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
  }

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
  }

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
  }

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
  }

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
  }

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
  }

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
  }

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
  }

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
  }

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
  }

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
  }

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
  }

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
  }

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
  }

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
  }

  async cleanupExpiredPasswordResetTokens() {
    await this.ensurePasswordResetSchema();
    const result = await this.queryWithRetry(
      `
        DELETE FROM password_reset_tokens
        WHERE expires_at <= NOW() OR used = TRUE
      `
    );
    return result.rowCount || 0;
  }

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
);

module.exports = Database;
