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

function toCamelCase(obj) {
  if (Array.isArray(obj)) return obj.map(toCamelCase);
  if (obj !== null && typeof obj === 'object' && !(obj instanceof Date)) {
    return Object.keys(obj).reduce((acc, key) => {
      const camel = key.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
      acc[camel] = toCamelCase(obj[key]);
      return acc;
    }, {});
  }
  return obj;
}

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

  getDefaultModulesCatalog() {
    // Após a migração 016 (subsistemas), todo módulo tem subsystemKey obrigatório.
    // 3 chaves foram renomeadas: dashboard→dashboard_financeiro,
    //                           metas→metas_financeiro,
    //                           reports→relatorios_financeiro.
    // 4 módulos novos do subsistema gerenciamento foram adicionados.
    // sortOrder é a ordem DENTRO do subsistema (não global).
    return [
      // Subsistema admin
      { moduleKey: 'admin',                    moduleName: 'Admin',                 iconName: 'Shield',        routePath: 'admin',                    isSystem: true, description: 'Painel administrativo',                              subsystemKey: 'admin',         sortOrder: 1 },
      { moduleKey: 'sessions',                 moduleName: 'Sessões Ativas',        iconName: 'Monitor',       routePath: 'sessions',                 isSystem: true, description: 'Gerenciamento de sessões ativas por dispositivo',   subsystemKey: 'admin',         sortOrder: 2 },
      { moduleKey: 'anomalies',                moduleName: 'Anomalias',             iconName: 'AlertTriangle', routePath: 'anomalies',                isSystem: true, description: 'Dashboard de detecção de anomalias de segurança',  subsystemKey: 'admin',         sortOrder: 3 },
      { moduleKey: 'security_alerts',          moduleName: 'Alertas de Segurança',  iconName: 'ShieldAlert',   routePath: 'security_alerts',          isSystem: true, description: 'Portal de alertas e notificações de segurança',     subsystemKey: 'admin',         sortOrder: 4 },

      // Subsistema gestao
      { moduleKey: 'roadmap',                  moduleName: 'Roadmap',               iconName: 'Map',           routePath: 'roadmap',                  isSystem: true, description: 'Roadmap de desenvolvimento do sistema',             subsystemKey: 'gestao',        sortOrder: 1 },
      { moduleKey: 'documentacao',             moduleName: 'Documentação',          iconName: 'BookOpen',      routePath: 'documentacao',             isSystem: true, description: 'Manual e guias do sistema',                         subsystemKey: 'gestao',        sortOrder: 2 },
      { moduleKey: 'faq',                      moduleName: 'FAQ',                   iconName: 'HelpCircle',    routePath: 'faq',                      isSystem: true, description: 'Perguntas frequentes do sistema',                   subsystemKey: 'gestao',        sortOrder: 3 },

      // Subsistema financeiro
      { moduleKey: 'dashboard_financeiro',     moduleName: 'Dashboard',             iconName: 'BarChart3',     routePath: 'dashboard_financeiro',     isSystem: true, description: 'Visão geral do sistema',                            subsystemKey: 'financeiro',    sortOrder: 1 },
      { moduleKey: 'metas_financeiro',         moduleName: 'Metas',                 iconName: 'Target',        routePath: 'metas_financeiro',         isSystem: true, description: 'Definição e record de metas',               subsystemKey: 'financeiro',    sortOrder: 2 },
      { moduleKey: 'relatorios_financeiro',    moduleName: 'Relatórios',            iconName: 'FileText',      routePath: 'relatorios_financeiro',    isSystem: true, description: 'Relatórios e análises',                             subsystemKey: 'financeiro',    sortOrder: 3 },
      { moduleKey: 'projecao',                 moduleName: 'Projeção',              iconName: 'LineChart',     routePath: 'projecao',                 isSystem: true, description: 'Projeções financeiras',                             subsystemKey: 'financeiro',    sortOrder: 4 },
      { moduleKey: 'transactions',             moduleName: 'Transações',            iconName: 'Wallet',        routePath: 'transactions',             isSystem: true, description: 'Transações financeiras',                            subsystemKey: 'financeiro',    sortOrder: 5 },
      { moduleKey: 'dre',                      moduleName: 'DRE',                   iconName: 'Calculator',    routePath: 'dre',                      isSystem: true, description: 'Demonstrativo de resultados',                       subsystemKey: 'financeiro',    sortOrder: 6 },

      // Subsistema gerenciamento (4 módulos novos)
      { moduleKey: 'dashboard_gerenciamento',  moduleName: 'Dashboard',             iconName: 'BarChart3',     routePath: 'dashboard_gerenciamento',  isSystem: true, description: 'Resumo do gerenciamento (projetos, serviços, clientes)', subsystemKey: 'gerenciamento', sortOrder: 1 },
      { moduleKey: 'metas_gerenciamento',      moduleName: 'Metas',                 iconName: 'Target',        routePath: 'metas_gerenciamento',      isSystem: true, description: 'Metas operacionais do gerenciamento',               subsystemKey: 'gerenciamento', sortOrder: 2 },
      { moduleKey: 'projecao_gerenciamento',   moduleName: 'Projeção',              iconName: 'LineChart',     routePath: 'projecao_gerenciamento',   isSystem: true, description: 'Projeções e definição de metas operacionais',       subsystemKey: 'gerenciamento', sortOrder: 3 },
      { moduleKey: 'relatorios_gerenciamento', moduleName: 'Relatórios',            iconName: 'FileText',      routePath: 'relatorios_gerenciamento', isSystem: true, description: 'Relatórios operacionais do gerenciamento',          subsystemKey: 'gerenciamento', sortOrder: 4 },
      { moduleKey: 'projects',                 moduleName: 'Projetos',              iconName: 'FolderOpen',    routePath: 'projects',                 isSystem: true, description: 'Gestão de projetos',                                subsystemKey: 'gerenciamento', sortOrder: 5 },
      { moduleKey: 'services',                 moduleName: 'Serviços',              iconName: 'Briefcase',     routePath: 'services',                 isSystem: true, description: 'Gestão de serviços',                                subsystemKey: 'gerenciamento', sortOrder: 6 },
      { moduleKey: 'clients',                  moduleName: 'Clientes',              iconName: 'Users',         routePath: 'clients',                  isSystem: true, description: 'Cadastro de clientes',                              subsystemKey: 'gerenciamento', sortOrder: 7 },
      { moduleKey: 'tarefas_gerenciamento',    moduleName: 'Tarefas',               iconName: 'ListTodo',      routePath: 'tarefas_gerenciamento',    isSystem: true, description: 'Execução e acompanhamento de tarefas dos projetos',  subsystemKey: 'gerenciamento', sortOrder: 8 },
      { moduleKey: 'pomodoro_gerenciamento',   moduleName: 'Pomodoro',              iconName: 'Timer',         routePath: 'pomodoro_gerenciamento',   isSystem: true, description: 'Controle de tempo (Pomodoro) e estatísticas pessoais', subsystemKey: 'gerenciamento', sortOrder: 9 },
      { moduleKey: 'relatorios_tarefas_gerenciamento', moduleName: 'Relatórios de Tarefas', iconName: 'BarChart3', routePath: 'relatorios_tarefas_gerenciamento', isSystem: true, description: 'Relatórios administrativos de produtividade e custos', subsystemKey: 'gerenciamento', sortOrder: 10 },

      // Subsistema especial (módulos extras)
      { moduleKey: 'terracontrol',          moduleName: 'TerraControl',       iconName: 'ClipboardList', routePath: 'terracontrol',          isSystem: true, description: 'Controle e acompanhamento de imóveis rurais',          subsystemKey: 'especial',      sortOrder: 1 }
    ];
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

  // Métodos para Transações
  async getAllTransactions() {
    try {
      const result = await this.queryWithRetry('SELECT * FROM transactions ORDER BY date DESC');
      return result.rows;
    } catch (error) {
      console.error('Erro ao ler transações:', error);
      return [];
    }
  }

  async saveTransaction(transaction) {
    try {
      const id = this.generateId();
      const result = await this.queryWithRetry(
        `INSERT INTO transactions (id, date, description, value, type, category, subcategory, asaas_id, asaas_type, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
         RETURNING *`,
        [
          id,
          transaction.date || null,
          transaction.description || null,
          transaction.value || 0,
          transaction.type || null,
          transaction.category || null,
          transaction.subcategory || null,
          transaction.asaas_id || null,
          transaction.asaas_type || null,
          new Date().toISOString(),
          new Date().toISOString()
        ]
      );
      return result.rows[0];
    } catch (error) {
      console.error('Erro ao salvar transação:', error);
      throw error;
    }
  }

  async saveAsaasTransaction(transaction) {
    try {
      const id = this.generateId();
      const result = await this.queryWithRetry(
        `INSERT INTO transactions (id, date, description, value, type, category, subcategory, asaas_id, asaas_type, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
         ON CONFLICT (asaas_id) DO NOTHING
         RETURNING *`,
        [
          id,
          transaction.date || null,
          transaction.description || null,
          transaction.value || 0,
          transaction.type || null,
          transaction.category || null,
          transaction.subcategory || null,
          transaction.asaas_id,
          transaction.asaas_type || null,
          new Date().toISOString(),
          new Date().toISOString()
        ]
      );
      return result.rows[0] || null; // null = já existia (ignorado)
    } catch (error) {
      console.error('Erro ao salvar transação Asaas:', error);
      throw error;
    }
  }

  async updateTransaction(id, updatedTransaction) {
    try {
      const result = await this.queryWithRetry(
        `UPDATE transactions 
         SET date = $1, description = $2, value = $3, type = $4, category = $5, subcategory = $6, updated_at = $7
         WHERE id = $8
         RETURNING *`,
        [
          updatedTransaction.date || null,
          updatedTransaction.description || null,
          updatedTransaction.value || 0,
          updatedTransaction.type || null,
          updatedTransaction.category || null,
          updatedTransaction.subcategory || null,
          new Date().toISOString(),
          id
        ]
      );
      if (result.rows.length === 0) {
        throw new Error('Transação não encontrada');
      }
      return result.rows[0];
    } catch (error) {
      console.error('Erro ao atualizar transação:', error);
      throw error;
    }
  }

  async deleteTransaction(id) {
    try {
      const result = await this.queryWithRetry(
        'DELETE FROM transactions WHERE id = $1 RETURNING id',
        [id]
      );
      if (result.rows.length === 0) {
        throw new Error('Transação não encontrada');
      }
      return true;
    } catch (error) {
      console.error('Erro ao deletar transação:', error);
      throw error;
    }
  }

  async deleteMultipleTransactions(ids) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      for (const id of ids) {
        await client.query('DELETE FROM transactions WHERE id = $1', [id]);
      }
      await client.query('COMMIT');
      return true;
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Erro ao deletar múltiplas transações:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Regras automáticas de transações (migration 018)
  // ═══════════════════════════════════════════════════════════════════════════

  async getAllTransactionRules() {
    try {
      const result = await this.queryWithRetry(
        'SELECT * FROM transaction_rules ORDER BY sort_order ASC, created_at ASC'
      );
      return result.rows;
    } catch (error) {
      console.error('Erro ao ler regras de transação:', error);
      return [];
    }
  }

  async getActiveTransactionRules() {
    try {
      const result = await this.queryWithRetry(
        'SELECT * FROM transaction_rules WHERE is_active = TRUE ORDER BY sort_order ASC, created_at ASC'
      );
      return result.rows;
    } catch (error) {
      console.error('Erro ao ler regras ativas:', error);
      return [];
    }
  }

  async getTransactionRuleById(id) {
    const result = await this.queryWithRetry(
      'SELECT * FROM transaction_rules WHERE id = $1',
      [id]
    );
    return result.rows[0] || null;
  }

  async saveTransactionRule(rule) {
    const id = this.generateId();
    const sortOrderResult = await this.queryWithRetry(
      'SELECT COALESCE(MAX(sort_order), -1) + 1 AS next_order FROM transaction_rules'
    );
    const nextOrder = rule.sort_order ?? sortOrderResult.rows[0].next_order;

    const result = await this.queryWithRetry(
      `INSERT INTO transaction_rules
         (id, name, description_contains, action_type, action_value, set_category, set_subcategory,
          hide_transaction, min_value, max_value, match_type,
          is_active, sort_order, created_by, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, NOW(), NOW())
       RETURNING *`,
      [
        id,
        rule.name,
        rule.description_contains,
        rule.action_type || 'change_type',
        rule.action_value || null,
        rule.set_category || null,
        rule.set_subcategory || null,
        !!rule.hide_transaction,
        rule.min_value ?? null,
        rule.max_value ?? null,
        rule.match_type || null,
        rule.is_active !== false,
        nextOrder,
        rule.created_by || null,
      ]
    );
    return result.rows[0];
  }

  async updateTransactionRule(id, updates) {
    const existing = await this.getTransactionRuleById(id);
    if (!existing) throw new Error('Regra não encontrada');

    // Coalesce explícito: aceita null para limpar campo (apenas se a chave foi enviada)
    const pick = (key, fallback) => (Object.prototype.hasOwnProperty.call(updates, key) ? updates[key] : fallback);

    const result = await this.queryWithRetry(
      `UPDATE transaction_rules
          SET name = $1,
              description_contains = $2,
              action_type = $3,
              action_value = $4,
              set_category = $5,
              set_subcategory = $6,
              hide_transaction = $7,
              min_value = $8,
              max_value = $9,
              match_type = $10,
              is_active = $11,
              sort_order = $12,
              updated_at = NOW()
        WHERE id = $13
        RETURNING *`,
      [
        updates.name ?? existing.name,
        updates.description_contains ?? existing.description_contains,
        updates.action_type ?? existing.action_type,
        pick('action_value', existing.action_value),
        pick('set_category', existing.set_category),
        pick('set_subcategory', existing.set_subcategory),
        Object.prototype.hasOwnProperty.call(updates, 'hide_transaction') ? !!updates.hide_transaction : existing.hide_transaction,
        pick('min_value', existing.min_value),
        pick('max_value', existing.max_value),
        pick('match_type', existing.match_type),
        updates.is_active ?? existing.is_active,
        updates.sort_order ?? existing.sort_order,
        id,
      ]
    );
    return result.rows[0];
  }

  async deleteTransactionRule(id) {
    const result = await this.queryWithRetry(
      'DELETE FROM transaction_rules WHERE id = $1 RETURNING id',
      [id]
    );
    if (result.rows.length === 0) throw new Error('Regra não encontrada');
    return true;
  }

  async reorderTransactionRules(orderedIds) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      for (let i = 0; i < orderedIds.length; i++) {
        await client.query(
          'UPDATE transaction_rules SET sort_order = $1, updated_at = NOW() WHERE id = $2',
          [i, orderedIds[i]]
        );
      }
      await client.query('COMMIT');
      return true;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  // ───── Aplicação de regras ────────────────────────────────────────────────

  /**
   * Avalia uma transação contra todas as regras ATIVAS e retorna os matches.
   * Função PURA — não persiste nada. Caller decide o que fazer com o resultado.
   *
   * Match: descrição da transação contém `description_contains` da regra
   *        (case-insensitive). Regras sem descrição na transação não dão match.
   */
  async evaluateRulesForTransaction(transaction) {
    const rules = await this.getActiveTransactionRules();
    const description = (transaction.description || '').toLowerCase();
    if (!description) return { matched: [], rules };
    const value = parseFloat(transaction.value);
    const txType = transaction.type;

    const matched = rules.filter((r) => {
      // Condição: descrição contém (case-insensitive)
      const needle = (r.description_contains || '').toLowerCase().trim();
      if (!needle) return false;
      if (!description.includes(needle)) return false;

      // Condição: faixa de valor (inclusive). Comparação em valor absoluto pois
      // o sinal vem do tipo (Receita +/Despesa -) — usuário pensa em "valor da
      // transação", não no sinal.
      const absValue = Math.abs(value);
      if (r.min_value != null && absValue < parseFloat(r.min_value)) return false;
      if (r.max_value != null && absValue > parseFloat(r.max_value)) return false;

      // Condição: tipo atual da transação (Receita/Despesa/...)
      if (r.match_type && r.match_type !== txType) return false;

      return true;
    });

    return { matched, rules };
  }

  /**
   * Aplica uma regra específica a uma transação existente.
   * Guarda original_type para permitir reverter depois.
   */
  async applyRuleToTransaction(transactionId, ruleId) {
    const rule = await this.getTransactionRuleById(ruleId);
    if (!rule) throw new Error('Regra não encontrada');

    const txResult = await this.queryWithRetry(
      'SELECT * FROM transactions WHERE id = $1',
      [transactionId]
    );
    const tx = txResult.rows[0];
    if (!tx) throw new Error('Transação não encontrada');

    // "base" = estado a partir do qual a regra é aplicada. Se a transação
    // está pendente de confirmação (type='A confirmar'), partimos dos valores
    // originais — caso contrário, uma regra que só mexe em categoria deixaria
    // o type='A confirmar' indevidamente. Para transações normais, partimos
    // dos valores atuais.
    const isPending = tx.needs_confirmation === true || tx.type === 'A confirmar';
    const baseType        = isPending ? (tx.original_type        || tx.type)        : tx.type;
    const baseCategory    = isPending ? (tx.original_category    || tx.category)    : tx.category;
    const baseSubcategory = isPending ? (tx.original_subcategory || tx.subcategory) : tx.subcategory;

    // Aplica cada campo definido pela regra; senão mantém base.
    const newType        = rule.action_value     ? rule.action_value     : baseType;
    const newCategory    = rule.set_category     ? rule.set_category     : baseCategory;
    const newSubcategory = rule.set_subcategory  ? rule.set_subcategory  : baseSubcategory;
    const newHidden      = rule.hide_transaction ? true                  : tx.is_hidden;

    // Preserva os "original_*" apenas na primeira aplicação (para permitir
    // reverter ao estado original mesmo quando outra regra já estava aplicada).
    const originalType        = tx.original_type        || tx.type;
    const originalCategory    = tx.original_category    || tx.category;
    const originalSubcategory = tx.original_subcategory || tx.subcategory;

    const result = await this.queryWithRetry(
      `UPDATE transactions
          SET type = $1,
              category = $2,
              subcategory = $3,
              is_hidden = $4,
              applied_rule_id = $5,
              original_type = $6,
              original_category = $7,
              original_subcategory = $8,
              needs_confirmation = FALSE,
              updated_at = NOW()
        WHERE id = $9
        RETURNING *`,
      [newType, newCategory, newSubcategory, newHidden, ruleId, originalType, originalCategory, originalSubcategory, transactionId]
    );

    await this.clearTransactionRuleCandidates(transactionId);
    return result.rows[0];
  }

  /**
   * Reverte uma transação para o tipo original (antes da regra).
   * Se não houver original_type registrado, mantém o type atual mas zera
   * os campos de rastreamento.
   */
  async revertTransactionRule(transactionId) {
    const result = await this.queryWithRetry(
      `UPDATE transactions
          SET type = COALESCE(original_type, type),
              category = COALESCE(original_category, category),
              subcategory = COALESCE(original_subcategory, subcategory),
              is_hidden = FALSE,
              applied_rule_id = NULL,
              original_type = NULL,
              original_category = NULL,
              original_subcategory = NULL,
              needs_confirmation = FALSE,
              updated_at = NOW()
        WHERE id = $1
        RETURNING *`,
      [transactionId]
    );
    if (result.rows.length === 0) throw new Error('Transação não encontrada');
    await this.clearTransactionRuleCandidates(transactionId);
    return result.rows[0];
  }

  /**
   * Marca uma transação como pendente de confirmação manual (match em 2+ regras).
   * Guarda os candidatos e seta type='A confirmar'.
   */
  async markTransactionPendingConfirmation(transactionId, candidateRuleIds) {
    const txResult = await this.queryWithRetry(
      'SELECT * FROM transactions WHERE id = $1',
      [transactionId]
    );
    const tx = txResult.rows[0];
    if (!tx) throw new Error('Transação não encontrada');

    const originalType        = tx.original_type        || tx.type;
    const originalCategory    = tx.original_category    || tx.category;
    const originalSubcategory = tx.original_subcategory || tx.subcategory;

    const result = await this.queryWithRetry(
      `UPDATE transactions
          SET type = 'A confirmar',
              applied_rule_id = NULL,
              original_type = $1,
              original_category = $2,
              original_subcategory = $3,
              needs_confirmation = TRUE,
              updated_at = NOW()
        WHERE id = $4
        RETURNING *`,
      [originalType, originalCategory, originalSubcategory, transactionId]
    );

    await this.saveTransactionRuleCandidates(transactionId, candidateRuleIds);
    return result.rows[0];
  }

  // ───── Candidatos ─────────────────────────────────────────────────────────

  async saveTransactionRuleCandidates(transactionId, ruleIds) {
    if (!ruleIds || ruleIds.length === 0) return;
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('DELETE FROM transaction_rule_candidates WHERE transaction_id = $1', [transactionId]);
      for (const ruleId of ruleIds) {
        await client.query(
          `INSERT INTO transaction_rule_candidates (transaction_id, rule_id)
           VALUES ($1, $2) ON CONFLICT DO NOTHING`,
          [transactionId, ruleId]
        );
      }
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async getTransactionRuleCandidates(transactionId) {
    const result = await this.queryWithRetry(
      `SELECT r.* FROM transaction_rules r
         INNER JOIN transaction_rule_candidates c ON c.rule_id = r.id
        WHERE c.transaction_id = $1
        ORDER BY r.sort_order ASC, r.created_at ASC`,
      [transactionId]
    );
    return result.rows;
  }

  async clearTransactionRuleCandidates(transactionId) {
    await this.queryWithRetry(
      'DELETE FROM transaction_rule_candidates WHERE transaction_id = $1',
      [transactionId]
    );
  }

  // ───── Preview (para criar/editar regra retroativamente) ───────────────────

  /**
   * Dado um critério de descrição, retorna transações existentes que dariam
   * match. Cada item vem com info se já está associado a outra regra (para
   * o modal de preview avisar o usuário).
   */
  async previewRuleMatches({ description_contains, excludeRuleId = null }) {
    const needle = (description_contains || '').trim();
    if (!needle) return [];

    const result = await this.queryWithRetry(
      `SELECT t.*,
              r.id   AS existing_rule_id,
              r.name AS existing_rule_name
         FROM transactions t
         LEFT JOIN transaction_rules r ON r.id = t.applied_rule_id
        WHERE LOWER(t.description) LIKE LOWER($1)
          AND ($2::VARCHAR IS NULL OR t.applied_rule_id IS DISTINCT FROM $2)
        ORDER BY t.date DESC`,
      [`%${needle}%`, excludeRuleId]
    );
    return result.rows;
  }

  // ───── Notificações ───────────────────────────────────────────────────────

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
  }

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
  }

  async getUnreadNotificationCount(userId) {
    const result = await this.queryWithRetry(
      'SELECT COUNT(*)::INT AS count FROM notifications WHERE user_id = $1 AND is_read = FALSE AND cleared = FALSE',
      [userId]
    );
    return result.rows[0].count;
  }

  async markNotificationAsRead(id, userId) {
    const result = await this.queryWithRetry(
      `UPDATE notifications
          SET is_read = TRUE, read_at = NOW()
        WHERE id = $1 AND user_id = $2
        RETURNING *`,
      [id, userId]
    );
    return result.rows[0] || null;
  }

  async markAllNotificationsAsRead(userId) {
    await this.queryWithRetry(
      `UPDATE notifications
          SET is_read = TRUE, read_at = NOW()
        WHERE user_id = $1 AND is_read = FALSE AND cleared = FALSE`,
      [userId]
    );
  }

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
  }

  async clearAllNotifications(userId) {
    const result = await this.queryWithRetry(
      `UPDATE notifications
          SET cleared = TRUE, cleared_at = NOW()
        WHERE user_id = $1 AND cleared = FALSE
        RETURNING id`,
      [userId]
    );
    return result.rows.length;
  }

  // "Excluir" = remover permanentemente do banco
  async deleteNotification(id, userId) {
    const result = await this.queryWithRetry(
      'DELETE FROM notifications WHERE id = $1 AND user_id = $2 RETURNING id',
      [id, userId]
    );
    return result.rows.length > 0;
  }

  async deleteAllNotificationsForUser(userId, { onlyCleared = false } = {}) {
    const result = await this.queryWithRetry(
      `DELETE FROM notifications
        WHERE user_id = $1
          AND ($2::BOOLEAN = FALSE OR cleared = TRUE)
        RETURNING id`,
      [userId, onlyCleared]
    );
    return result.rows.length;
  }

  async deleteNotificationsByEntity(entityType, entityId) {
    await this.queryWithRetry(
      'DELETE FROM notifications WHERE related_entity_type = $1 AND related_entity_id = $2',
      [entityType, entityId]
    );
  }

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
  }

  // ───── Permissões granulares para regras ──────────────────────────────────

  /**
   * Retorna {can_create, can_edit, can_delete} para o usuário.
   * - admin/superadmin: tudo true (bypass)
   * - outros: lê de user_rule_permissions; se não houver linha, retorna false
   */
  async getUserRulePermissions(userId, role) {
    if (role === 'admin' || role === 'superadmin') {
      return { can_create: true, can_edit: true, can_delete: true, is_admin_bypass: true };
    }
    const result = await this.queryWithRetry(
      'SELECT can_create, can_edit, can_delete FROM user_rule_permissions WHERE user_id = $1',
      [userId]
    );
    if (result.rows.length === 0) {
      return { can_create: false, can_edit: false, can_delete: false, is_admin_bypass: false };
    }
    return { ...result.rows[0], is_admin_bypass: false };
  }

  async setUserRulePermissions(userId, perms, grantedBy) {
    const result = await this.queryWithRetry(
      `INSERT INTO user_rule_permissions
         (user_id, can_create, can_edit, can_delete, granted_by, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
       ON CONFLICT (user_id) DO UPDATE
         SET can_create = EXCLUDED.can_create,
             can_edit   = EXCLUDED.can_edit,
             can_delete = EXCLUDED.can_delete,
             granted_by = EXCLUDED.granted_by,
             updated_at = NOW()
       RETURNING *`,
      [userId, !!perms.can_create, !!perms.can_edit, !!perms.can_delete, grantedBy || null]
    );
    return result.rows[0];
  }

  async deleteUserRulePermissions(userId) {
    await this.queryWithRetry(
      'DELETE FROM user_rule_permissions WHERE user_id = $1',
      [userId]
    );
  }

  // Métodos para Produtos
  async getAllProducts() {
    try {
      const result = await this.queryWithRetry('SELECT * FROM products ORDER BY name');
      return result.rows;
    } catch (error) {
      console.error('Erro ao ler produtos:', error);
      return [];
    }
  }

  async saveProduct(product) {
    try {
      const id = this.generateId();
      const result = await this.queryWithRetry(
        `INSERT INTO products (id, name, category, price, cost, stock, sold, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         RETURNING *`,
        [
          id,
          product.name || null,
          product.category || null,
          product.price || 0,
          product.cost || 0,
          product.stock || 0,
          product.sold || 0,
          new Date().toISOString(),
          new Date().toISOString()
        ]
      );
      return result.rows[0];
    } catch (error) {
      console.error('Erro ao salvar produto:', error);
      throw error;
    }
  }

  async updateProduct(id, updatedProduct) {
    try {
      const result = await this.queryWithRetry(
        `UPDATE products 
         SET name = $1, category = $2, price = $3, cost = $4, stock = $5, sold = $6, updated_at = $7
         WHERE id = $8
         RETURNING *`,
        [
          updatedProduct.name || null,
          updatedProduct.category || null,
          updatedProduct.price || 0,
          updatedProduct.cost || 0,
          updatedProduct.stock || 0,
          updatedProduct.sold || 0,
          new Date().toISOString(),
          id
        ]
      );
      if (result.rows.length === 0) {
        throw new Error('Produto não encontrado');
      }
      return result.rows[0];
    } catch (error) {
      console.error('Erro ao atualizar produto:', error);
      throw error;
    }
  }

  async deleteProduct(id) {
    try {
      const result = await this.queryWithRetry(
        'DELETE FROM products WHERE id = $1 RETURNING id',
        [id]
      );
      if (result.rows.length === 0) {
        throw new Error('Produto não encontrado');
      }
      return true;
    } catch (error) {
      console.error('Erro ao deletar produto:', error);
      throw error;
    }
  }

  async deleteMultipleProducts(ids) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      for (const id of ids) {
        await client.query('DELETE FROM products WHERE id = $1', [id]);
      }
      await client.query('COMMIT');
      return true;
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Erro ao deletar múltiplos produtos:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  // Métodos para Clientes
  async getAllClients() {
    try {
      const result = await this.queryWithRetry('SELECT * FROM clients ORDER BY name');
      return result.rows;
    } catch (error) {
      console.error('Erro ao ler clientes:', error);
      return [];
    }
  }

  // Helpers do padrão moderno (alinha com tc_users): nome separado + address JSONB.
  _composeClientName(c) {
    const composed = [c.firstName, c.lastName].filter(Boolean).join(' ').trim();
    return composed || c.name || null;
  }
  _normalizeAddressJson(addr) {
    if (addr == null) return null;
    if (typeof addr === 'string') {
      const s = addr.trim();
      if (!s) return null;
      try { return JSON.stringify(JSON.parse(s)); } catch { return JSON.stringify({ street: s }); }
    }
    if (typeof addr === 'object') return JSON.stringify(addr);
    return null;
  }

  async saveClient(client) {
    try {
      const id = this.generateId();
      const result = await this.queryWithRetry(
        `INSERT INTO clients (id, name, first_name, last_name, email, phone, company, cpf, cnpj, address, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11, $12)
         RETURNING *`,
        [
          id,
          this._composeClientName(client),
          client.firstName || null,
          client.lastName || null,
          client.email || null,
          client.phone || null,
          client.company || null,
          client.cpf || null,
          client.cnpj || null,
          this._normalizeAddressJson(client.address),
          new Date().toISOString(),
          new Date().toISOString()
        ]
      );
      return result.rows[0];
    } catch (error) {
      console.error('Erro ao salvar cliente:', error);
      throw error;
    }
  }

  async updateClient(id, updatedClient) {
    try {
      const result = await this.queryWithRetry(
        `UPDATE clients
         SET name = $1, first_name = $2, last_name = $3, email = $4, phone = $5,
             company = $6, cpf = $7, cnpj = $8, address = $9::jsonb, updated_at = $10
         WHERE id = $11
         RETURNING *`,
        [
          this._composeClientName(updatedClient),
          updatedClient.firstName || null,
          updatedClient.lastName || null,
          updatedClient.email || null,
          updatedClient.phone || null,
          updatedClient.company || null,
          updatedClient.cpf || null,
          updatedClient.cnpj || null,
          this._normalizeAddressJson(updatedClient.address),
          new Date().toISOString(),
          id
        ]
      );
      if (result.rows.length === 0) {
        throw new Error('Cliente não encontrado');
      }
      return result.rows[0];
    } catch (error) {
      console.error('Erro ao atualizar cliente:', error);
      throw error;
    }
  }

  async deleteClient(id) {
    try {
      const result = await this.queryWithRetry(
        'DELETE FROM clients WHERE id = $1 RETURNING id',
        [id]
      );
      if (result.rows.length === 0) {
        throw new Error('Cliente não encontrado');
      }
      return true;
    } catch (error) {
      console.error('Erro ao deletar cliente:', error);
      throw error;
    }
  }

  async deleteMultipleClients(ids) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      for (const id of ids) {
        await client.query('DELETE FROM clients WHERE id = $1', [id]);
      }
      await client.query('COMMIT');
      return true;
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Erro ao deletar múltiplos clientes:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  // Métodos para Projetos
  async getAllProjects() {
    try {
      const result = await this.queryWithRetry('SELECT * FROM projects ORDER BY name');
      return result.rows;
    } catch (error) {
      console.error('Erro ao ler projetos:', error);
      return [];
    }
  }

  async saveProject(projectData) {
    try {
      const id = this.generateId();
      const result = await this.queryWithRetry(
        `INSERT INTO projects (id, name, client, status, description, manager_user_id, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING *`,
        [
          id,
          projectData.name || null,
          projectData.client || null,
          projectData.status || null,
          projectData.description || null,
          projectData.managerUserId || null,
          new Date().toISOString(),
          new Date().toISOString()
        ]
      );
      return result.rows[0];
    } catch (error) {
      throw new Error('Erro ao salvar projeto: ' + error.message);
    }
  }

  async updateProject(id, updatedData) {
    try {
      // manager_user_id só é tocado quando a chave vier no payload (permite
      // definir um responsável OU desvincular passando null/'').
      const setsManager = Object.prototype.hasOwnProperty.call(updatedData, 'managerUserId');
      const managerVal = updatedData.managerUserId || null;
      const result = await this.queryWithRetry(
        `UPDATE projects
         SET name = $1, client = $2, status = $3, description = $4, updated_at = $5${setsManager ? ', manager_user_id = $7' : ''}
         WHERE id = $6
         RETURNING *`,
        setsManager
          ? [updatedData.name || null, updatedData.client || null, updatedData.status || null, updatedData.description || null, new Date().toISOString(), id, managerVal]
          : [updatedData.name || null, updatedData.client || null, updatedData.status || null, updatedData.description || null, new Date().toISOString(), id]
      );
      if (result.rows.length === 0) {
        throw new Error('Projeto não encontrado');
      }
      return result.rows[0];
    } catch (error) {
      throw new Error('Erro ao atualizar projeto: ' + error.message);
    }
  }

  async deleteProject(id) {
    try {
      const result = await this.queryWithRetry(
        'DELETE FROM projects WHERE id = $1 RETURNING id',
        [id]
      );
      if (result.rows.length === 0) {
        throw new Error('Projeto não encontrado');
      }
      return true;
    } catch (error) {
      throw new Error('Erro ao excluir projeto: ' + error.message);
    }
  }

  async deleteMultipleProjects(ids) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      for (const id of ids) {
        await client.query('DELETE FROM projects WHERE id = $1', [id]);
      }
      await client.query('COMMIT');
      return true;
    } catch (error) {
      await client.query('ROLLBACK');
      throw new Error('Erro ao excluir projetos: ' + error.message);
    } finally {
      client.release();
    }
  }

  // Métodos para Serviços
  async getAllServices() {
    try {
      const result = await this.queryWithRetry('SELECT * FROM services ORDER BY name');
      return result.rows;
    } catch (error) {
      console.error('Erro ao ler serviços:', error);
      return [];
    }
  }

  async saveService(serviceData) {
    try {
      const id = this.generateId();
      const status = serviceData.status === 'inativo' ? 'inativo' : 'ativo';
      const result = await this.queryWithRetry(
        `INSERT INTO services (id, name, description, price, status, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING *`,
        [
          id,
          serviceData.name || null,
          serviceData.description || null,
          serviceData.price || 0,
          status,
          new Date().toISOString(),
          new Date().toISOString()
        ]
      );
      return result.rows[0];
    } catch (error) {
      throw new Error('Erro ao salvar serviço: ' + error.message);
    }
  }

  async updateService(id, updatedData) {
    try {
      // status só é alterado se vier no payload (preserva o atual senão).
      const result = await this.queryWithRetry(
        `UPDATE services
         SET name = $1, description = $2, price = $3,
             status = COALESCE($4, status), updated_at = $5
         WHERE id = $6
         RETURNING *`,
        [
          updatedData.name || null,
          updatedData.description || null,
          updatedData.price || 0,
          (updatedData.status === 'ativo' || updatedData.status === 'inativo') ? updatedData.status : null,
          new Date().toISOString(),
          id
        ]
      );
      if (result.rows.length === 0) {
        throw new Error('Serviço não encontrado');
      }
      return result.rows[0];
    } catch (error) {
      throw new Error('Erro ao atualizar serviço: ' + error.message);
    }
  }

  async deleteService(id) {
    try {
      const result = await this.queryWithRetry(
        'DELETE FROM services WHERE id = $1 RETURNING id',
        [id]
      );
      if (result.rows.length === 0) {
        throw new Error('Serviço não encontrado');
      }
      return true;
    } catch (error) {
      throw new Error('Erro ao excluir serviço: ' + error.message);
    }
  }

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
      // Verifica colisão de username (que não seja o próprio stub do convite)
      const collision = await client.query(
        'SELECT id FROM tc_users WHERE username = $1 AND id <> $2 LIMIT 1',
        [normalizedUsername, invite.tc_user_id]
      );
      if (collision.rows.length > 0) {
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

  static NOTIFICATION_DEFAULTS = Object.freeze({
    impgeo: {
      transaction_confirm_needed:     { push: true,  email: false },
      tc_record_created:              { push: true,  email: false },
      // G9 (migration 040) — orçamentos: push on por default, email opt-in
      // (mesmo padrão de tc_record_created — evita spam em times grandes).
      tc_budget_revision_requested:   { push: true,  email: false },
      tc_budget_payment_completed:    { push: true,  email: false },
      // PM Fase 7 — projetos/tarefas. Push on por default; email opt-in (evita
      // spam em times grandes). Eventos endereçados ao próprio executor podem
      // ligar email manualmente nas preferências.
      pm_task_assigned:               { push: true,  email: false },
      pm_task_accepted:               { push: true,  email: false },
      pm_task_refused:                { push: true,  email: false },
      pm_task_overdue:                { push: true,  email: false },
      pm_review_requested:            { push: true,  email: false },
      pm_review_decided:              { push: true,  email: false },
      pm_help_requested:              { push: true,  email: false },
      pm_help_accepted:               { push: true,  email: false },
      pm_project_paid:                { push: true,  email: false },
      pm_project_completed:           { push: true,  email: false },
      // Excedente de tempo diário (Pomodoro) — pedido/decisão: email ON por
      // default (precisa de ação do gestor; o executor quer saber a decisão).
      pm_pomodoro_overage_requested:  { push: true,  email: true },
      pm_pomodoro_overage_decided:    { push: true,  email: true },
      // Alteração de prazo de tarefa (pedido/decisão) — email ON por default.
      pm_due_date_requested:          { push: true,  email: true },
      pm_due_date_decided:            { push: true,  email: true },
      // Reabertura de tarefa concluída (desconcluir) — afeta o responsável e o
      // gestor que pediu; email ON por default.
      pm_task_uncompleted:            { push: true,  email: true },
      pm_uncomplete_requested:        { push: true,  email: true },
      pm_uncomplete_decided:          { push: true,  email: true },
      pm_uncomplete_self_notice:      { push: true,  email: true },
      '_meta:foreground':             { push: false, email: false },
    },
    tc: {
      tc_record_approved:             { push: true, email: true },
      tc_record_edited:               { push: true, email: true },
      // G9 — pro tc_user, todos os eventos de orçamento ligados por default
      // (cliente está esperando o orçamento ou o status do pagamento).
      tc_budget_sent:                 { push: true, email: true },
      tc_budget_revised:              { push: true, email: true },
      tc_budget_payment_confirmed:    { push: true, email: true },
      '_meta:foreground':             { push: false, email: false },
    },
  });

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
    const map = Database.NOTIFICATION_DEFAULTS[scope] || {};
    const forType = map[notificationType];
    if (forType && typeof forType[channel] === 'boolean') return forType[channel];
    return false;
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
    const map = Database.NOTIFICATION_DEFAULTS[scope] || {};
    const types = new Set([
      ...Object.keys(map),
      ...result.rows.map(r => r.notification_type),
    ]);
    for (const type of types) {
      for (const channel of ['push', 'email']) {
        const key = `${type}:${channel}`;
        const row = stored.get(key);
        const def = (map[type] && typeof map[type][channel] === 'boolean')
          ? map[type][channel]
          : false;
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

  // Métodos para Subcategorias
  async getAllSubcategories() {
    try {
      const result = await this.queryWithRetry('SELECT name FROM subcategories ORDER BY name');
      return result.rows.map(row => row.name);
    } catch (error) {
      console.error('Erro ao ler subcategorias:', error);
      return [];
    }
  }

  async saveSubcategory(name) {
    try {
      await this.queryWithRetry(
        'INSERT INTO subcategories (name, created_at) VALUES ($1, $2) ON CONFLICT (name) DO NOTHING',
        [name, new Date().toISOString()]
      );
      return name;
    } catch (error) {
      console.error('Erro ao salvar subcategoria:', error);
      throw error;
    }
  }

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
  }

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
  }

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
  }

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
  }

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
  }

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
  }

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
  }

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
  }

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
  }

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
  }

  async getSubsystemByKey(subsystemKey) {
    await this.ensureProfileSchema();
    const result = await this.queryWithRetry(
      `SELECT subsystem_key, name FROM subsystems WHERE subsystem_key = $1 LIMIT 1`,
      [subsystemKey]
    );
    return result.rows[0] || null;
  }

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
  }

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
  }

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
  }

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
  }

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
  }

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
  }

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
  }

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

  // Métodos para Projeção
  async getProjectionData() {
    try {
      const result = await this.queryWithRetry('SELECT * FROM projection WHERE id = 1');
      if (result.rows.length === 0) {
        return null;
      }
      const row = result.rows[0];
      return {
        despesasVariaveis: row.despesas_variaveis || [],
        despesasFixas: row.despesas_fixas || [],
        investimentos: row.investimentos || [],
        mkt: row.mkt || [],
        faturamentoReurb: row.faturamento_reurb || [],
        faturamentoGeo: row.faturamento_geo || [],
        faturamentoPlan: row.faturamento_plan || [],
        faturamentoReg: row.faturamento_reg || [],
        faturamentoNn: row.faturamento_nn || [],
        mktComponents: row.mkt_components || { trafego: [], socialMedia: [], producaoConteudo: [] },
        growth: row.growth || { minimo: 0, medio: 0, maximo: 0 },
        createdAt: row.created_at,
        updatedAt: row.updated_at
      };
    } catch (error) {
      console.error('Erro ao ler dados de projeção:', error);
      return null;
    }
  }

  async updateProjectionData(projectionData) {
    try {
      const result = await this.queryWithRetry(
        `UPDATE projection SET
           despesas_variaveis = $1,
           despesas_fixas = $2,
           investimentos = $3,
           mkt = $4,
           faturamento_reurb = $5,
           faturamento_geo = $6,
           faturamento_plan = $7,
           faturamento_reg = $8,
           faturamento_nn = $9,
           mkt_components = $10,
           growth = $11,
           updated_at = $12
         WHERE id = 1
         RETURNING *`,
        [
          projectionData.despesasVariaveis || new Array(12).fill(0),
          projectionData.despesasFixas || new Array(12).fill(0),
          projectionData.investimentos || new Array(12).fill(0),
          projectionData.mkt || new Array(12).fill(0),
          projectionData.faturamentoReurb || new Array(12).fill(0),
          projectionData.faturamentoGeo || new Array(12).fill(0),
          projectionData.faturamentoPlan || new Array(12).fill(0),
          projectionData.faturamentoReg || new Array(12).fill(0),
          projectionData.faturamentoNn || new Array(12).fill(0),
          JSON.stringify(projectionData.mktComponents || { trafego: [], socialMedia: [], producaoConteudo: [] }),
          JSON.stringify(projectionData.growth || { minimo: 0, medio: 0, maximo: 0 }),
          new Date().toISOString()
        ]
      );
      return result.rows[0];
    } catch (error) {
      throw new Error('Erro ao salvar dados de projeção: ' + error.message);
    }
  }

  async syncProjectionData() {
    try {
      const fixedExpensesData = await this.getFixedExpensesData();
      const variableExpensesData = await this.getVariableExpensesData();
      const faturamentoReurbData = await this.getFaturamentoReurbData();
      const faturamentoGeoData = await this.getFaturamentoGeoData();
      const faturamentoPlanData = await this.getFaturamentoPlanData();
      const faturamentoRegData = await this.getFaturamentoRegData();
      const faturamentoNnData = await this.getFaturamentoNnData();
      const investmentsData = await this.getInvestmentsData();
      const mktData = await this.getMktData();

      const projectionData = await this.getProjectionData();
      projectionData.despesasFixas = fixedExpensesData.previsto;
      projectionData.despesasVariaveis = variableExpensesData.previsto;
      projectionData.faturamentoReurb = faturamentoReurbData.previsto;
      projectionData.faturamentoGeo = faturamentoGeoData.previsto;
      projectionData.faturamentoPlan = faturamentoPlanData.previsto;
      projectionData.faturamentoReg = faturamentoRegData.previsto;
      projectionData.faturamentoNn = faturamentoNnData.previsto;
      projectionData.investimentos = investmentsData.previsto;
      projectionData.mkt = mktData.previsto;

      return await this.updateProjectionData(projectionData);
    } catch (error) {
      throw new Error('Erro ao sincronizar dados de projeção: ' + error.message);
    }
  }

  // Métodos para Despesas Fixas
  async getFixedExpensesData() {
    try {
      const result = await this.queryWithRetry('SELECT * FROM fixed_expenses WHERE id = 1');
      if (result.rows.length === 0) {
        return { previsto: [], media: [], maximo: [] };
      }
      const row = result.rows[0];
      return {
        previsto: row.previsto || [],
        media: row.media || [],
        maximo: row.maximo || []
      };
    } catch (error) {
      console.error('Erro ao ler dados de despesas fixas:', error);
      return null;
    }
  }

  async updateFixedExpensesData(fixedExpensesData) {
    try {
      const result = await this.queryWithRetry(
        `UPDATE fixed_expenses SET
           previsto = $1,
           media = $2,
           maximo = $3,
           updated_at = $4
         WHERE id = 1
         RETURNING *`,
        [
          fixedExpensesData.previsto || new Array(12).fill(0),
          fixedExpensesData.media || new Array(12).fill(0),
          fixedExpensesData.maximo || new Array(12).fill(0),
          new Date().toISOString()
        ]
      );
      return result.rows[0];
    } catch (error) {
      throw new Error('Erro ao salvar dados de despesas fixas: ' + error.message);
    }
  }

  // Métodos para Despesas Variáveis
  async getVariableExpensesData() {
    try {
      const result = await this.queryWithRetry('SELECT * FROM variable_expenses WHERE id = 1');
      if (result.rows.length === 0) {
        return { previsto: [], medio: [], maximo: [] };
      }
      const row = result.rows[0];
      return {
        previsto: row.previsto || [],
        medio: row.medio || [],
        maximo: row.maximo || []
      };
    } catch (error) {
      console.error('Erro ao ler dados de despesas variáveis:', error);
      return null;
    }
  }

  async updateVariableExpensesData(variableExpensesData) {
    try {
      const result = await this.queryWithRetry(
        `UPDATE variable_expenses SET
           previsto = $1,
           medio = $2,
           maximo = $3,
           updated_at = $4
         WHERE id = 1
         RETURNING *`,
        [
          variableExpensesData.previsto || new Array(12).fill(0),
          variableExpensesData.medio || new Array(12).fill(0),
          variableExpensesData.maximo || new Array(12).fill(0),
          new Date().toISOString()
        ]
      );
      return result.rows[0];
    } catch (error) {
      throw new Error('Erro ao atualizar dados de despesas variáveis: ' + error.message);
    }
  }

  // Métodos para MKT
  async getMktData() {
    try {
      const result = await this.queryWithRetry('SELECT * FROM mkt WHERE id = 1');
      if (result.rows.length === 0) {
        return { previsto: [], medio: [], maximo: [] };
      }
      const row = result.rows[0];
      return {
        previsto: row.previsto || [],
        medio: row.medio || [],
        maximo: row.maximo || []
      };
    } catch (error) {
      console.error('Erro ao ler dados de MKT:', error);
      return null;
    }
  }

  async updateMktData(mktData) {
    try {
      const result = await this.queryWithRetry(
        `UPDATE mkt SET
           previsto = $1,
           medio = $2,
           maximo = $3,
           updated_at = $4
         WHERE id = 1
         RETURNING *`,
        [
          mktData.previsto || new Array(12).fill(0),
          mktData.medio || new Array(12).fill(0),
          mktData.maximo || new Array(12).fill(0),
          new Date().toISOString()
        ]
      );
      return result.rows[0];
    } catch (error) {
      throw new Error('Erro ao salvar dados de MKT: ' + error.message);
    }
  }

  // Métodos para Budget
  async getBudgetData() {
    try {
      const result = await this.queryWithRetry('SELECT * FROM budget WHERE id = 1');
      if (result.rows.length === 0) {
        return { previsto: [], medio: [], maximo: [] };
      }
      const row = result.rows[0];
      return {
        previsto: row.previsto || [],
        medio: row.medio || [],
        maximo: row.maximo || []
      };
    } catch (error) {
      console.error('Erro ao ler dados de orçamento:', error);
      return null;
    }
  }

  async updateBudgetData(budgetData) {
    try {
      const result = await this.queryWithRetry(
        `UPDATE budget SET
           previsto = $1,
           medio = $2,
           maximo = $3,
           updated_at = $4
         WHERE id = 1
         RETURNING *`,
        [
          budgetData.previsto || new Array(12).fill(0),
          budgetData.medio || new Array(12).fill(0),
          budgetData.maximo || new Array(12).fill(0),
          new Date().toISOString()
        ]
      );
      return result.rows[0];
    } catch (error) {
      throw new Error('Erro ao salvar dados de orçamento: ' + error.message);
    }
  }

  // Métodos para Investments
  async getInvestmentsData() {
    try {
      const result = await this.queryWithRetry('SELECT * FROM investments WHERE id = 1');
      if (result.rows.length === 0) {
        return { previsto: [], medio: [], maximo: [] };
      }
      const row = result.rows[0];
      return {
        previsto: row.previsto || [],
        medio: row.medio || [],
        maximo: row.maximo || []
      };
    } catch (error) {
      console.error('Erro ao ler dados de investimentos:', error);
      return null;
    }
  }

  async updateInvestmentsData(investmentsData) {
    try {
      const result = await this.queryWithRetry(
        `UPDATE investments SET
           previsto = $1,
           medio = $2,
           maximo = $3,
           updated_at = $4
         WHERE id = 1
         RETURNING *`,
        [
          investmentsData.previsto || new Array(12).fill(0),
          investmentsData.medio || new Array(12).fill(0),
          investmentsData.maximo || new Array(12).fill(0),
          new Date().toISOString()
        ]
      );
      return result.rows[0];
    } catch (error) {
      throw new Error('Erro ao salvar dados de investimentos: ' + error.message);
    }
  }

  // Métodos para Faturamento REURB
  async getFaturamentoReurbData() {
    try {
      const result = await this.queryWithRetry('SELECT * FROM faturamento_reurb WHERE id = 1');
      if (result.rows.length === 0) {
        return { previsto: [], medio: [], maximo: [] };
      }
      const row = result.rows[0];
      return {
        previsto: row.previsto || [],
        medio: row.medio || [],
        maximo: row.maximo || []
      };
    } catch (error) {
      console.error('Erro ao ler dados de faturamento REURB:', error);
      return null;
    }
  }

  async updateFaturamentoReurbData(faturamentoReurbData) {
    try {
      const result = await this.queryWithRetry(
        `UPDATE faturamento_reurb SET
           previsto = $1,
           medio = $2,
           maximo = $3,
           updated_at = $4
         WHERE id = 1
         RETURNING *`,
        [
          faturamentoReurbData.previsto || new Array(12).fill(0),
          faturamentoReurbData.medio || new Array(12).fill(0),
          faturamentoReurbData.maximo || new Array(12).fill(0),
          new Date().toISOString()
        ]
      );
      return result.rows[0];
    } catch (error) {
      throw new Error('Erro ao salvar dados de faturamento REURB: ' + error.message);
    }
  }

  // Métodos para Faturamento GEO
  async getFaturamentoGeoData() {
    try {
      const result = await this.queryWithRetry('SELECT * FROM faturamento_geo WHERE id = 1');
      if (result.rows.length === 0) {
        return { previsto: [], medio: [], maximo: [] };
      }
      const row = result.rows[0];
      return {
        previsto: row.previsto || [],
        medio: row.medio || [],
        maximo: row.maximo || []
      };
    } catch (error) {
      console.error('Erro ao ler dados de faturamento GEO:', error);
      return null;
    }
  }

  async updateFaturamentoGeoData(faturamentoGeoData) {
    try {
      const result = await this.queryWithRetry(
        `UPDATE faturamento_geo SET
           previsto = $1,
           medio = $2,
           maximo = $3,
           updated_at = $4
         WHERE id = 1
         RETURNING *`,
        [
          faturamentoGeoData.previsto || new Array(12).fill(0),
          faturamentoGeoData.medio || new Array(12).fill(0),
          faturamentoGeoData.maximo || new Array(12).fill(0),
          new Date().toISOString()
        ]
      );
      return result.rows[0];
    } catch (error) {
      throw new Error('Erro ao salvar dados de faturamento GEO: ' + error.message);
    }
  }

  // Métodos para Faturamento PLAN
  async getFaturamentoPlanData() {
    try {
      const result = await this.queryWithRetry('SELECT * FROM faturamento_plan WHERE id = 1');
      if (result.rows.length === 0) {
        return { previsto: [], medio: [], maximo: [] };
      }
      const row = result.rows[0];
      return {
        previsto: row.previsto || [],
        medio: row.medio || [],
        maximo: row.maximo || []
      };
    } catch (error) {
      console.error('Erro ao ler dados de faturamento PLAN:', error);
      return null;
    }
  }

  async updateFaturamentoPlanData(faturamentoPlanData) {
    try {
      const result = await this.queryWithRetry(
        `UPDATE faturamento_plan SET
           previsto = $1,
           medio = $2,
           maximo = $3,
           updated_at = $4
         WHERE id = 1
         RETURNING *`,
        [
          faturamentoPlanData.previsto || new Array(12).fill(0),
          faturamentoPlanData.medio || new Array(12).fill(0),
          faturamentoPlanData.maximo || new Array(12).fill(0),
          new Date().toISOString()
        ]
      );
      return result.rows[0];
    } catch (error) {
      throw new Error('Erro ao salvar dados de faturamento PLAN: ' + error.message);
    }
  }

  // Métodos para Faturamento REG
  async getFaturamentoRegData() {
    try {
      const result = await this.queryWithRetry('SELECT * FROM faturamento_reg WHERE id = 1');
      if (result.rows.length === 0) {
        return { previsto: [], medio: [], maximo: [] };
      }
      const row = result.rows[0];
      return {
        previsto: row.previsto || [],
        medio: row.medio || [],
        maximo: row.maximo || []
      };
    } catch (error) {
      console.error('Erro ao ler dados de faturamento REG:', error);
      return null;
    }
  }

  async updateFaturamentoRegData(faturamentoRegData) {
    try {
      const result = await this.queryWithRetry(
        `UPDATE faturamento_reg SET
           previsto = $1,
           medio = $2,
           maximo = $3,
           updated_at = $4
         WHERE id = 1
         RETURNING *`,
        [
          faturamentoRegData.previsto || new Array(12).fill(0),
          faturamentoRegData.medio || new Array(12).fill(0),
          faturamentoRegData.maximo || new Array(12).fill(0),
          new Date().toISOString()
        ]
      );
      return result.rows[0];
    } catch (error) {
      throw new Error('Erro ao salvar dados de faturamento REG: ' + error.message);
    }
  }

  // Métodos para Faturamento NN
  async getFaturamentoNnData() {
    try {
      const result = await this.queryWithRetry('SELECT * FROM faturamento_nn WHERE id = 1');
      if (result.rows.length === 0) {
        return { previsto: [], medio: [], maximo: [] };
      }
      const row = result.rows[0];
      return {
        previsto: row.previsto || [],
        medio: row.medio || [],
        maximo: row.maximo || []
      };
    } catch (error) {
      console.error('Erro ao ler dados de faturamento NN:', error);
      return null;
    }
  }

  async updateFaturamentoNnData(faturamentoNnData) {
    try {
      const result = await this.queryWithRetry(
        `UPDATE faturamento_nn SET
           previsto = $1,
           medio = $2,
           maximo = $3,
           updated_at = $4
         WHERE id = 1
         RETURNING *`,
        [
          faturamentoNnData.previsto || new Array(12).fill(0),
          faturamentoNnData.medio || new Array(12).fill(0),
          faturamentoNnData.maximo || new Array(12).fill(0),
          new Date().toISOString()
        ]
      );
      return result.rows[0];
    } catch (error) {
      throw new Error('Erro ao salvar dados de faturamento NN: ' + error.message);
    }
  }

  // Métodos para Faturamento Total
  async getFaturamentoTotalData() {
    try {
      const result = await this.queryWithRetry('SELECT * FROM faturamento_total WHERE id = 1');
      if (result.rows.length === 0) {
        return { previsto: [], medio: [], maximo: [] };
      }
      const row = result.rows[0];
      return {
        previsto: row.previsto || [],
        medio: row.medio || [],
        maximo: row.maximo || []
      };
    } catch (error) {
      console.error('Erro ao ler dados de faturamento total:', error);
      return null;
    }
  }

  async updateFaturamentoTotalData(faturamentoTotalData) {
    try {
      const result = await this.queryWithRetry(
        `UPDATE faturamento_total SET
           previsto = $1,
           medio = $2,
           maximo = $3,
           updated_at = $4
         WHERE id = 1
         RETURNING *`,
        [
          faturamentoTotalData.previsto || new Array(12).fill(0),
          faturamentoTotalData.medio || new Array(12).fill(0),
          faturamentoTotalData.maximo || new Array(12).fill(0),
          new Date().toISOString()
        ]
      );
      return result.rows[0];
    } catch (error) {
      throw new Error('Erro ao salvar dados de faturamento total: ' + error.message);
    }
  }

  // Métodos para Resultado
  async getResultadoData() {
    try {
      const result = await this.queryWithRetry('SELECT * FROM resultado WHERE id = 1');
      if (result.rows.length === 0) {
        return { previsto: [], medio: [], maximo: [] };
      }
      const row = result.rows[0];
      return {
        previsto: row.previsto || [],
        medio: row.medio || [],
        maximo: row.maximo || []
      };
    } catch (error) {
      console.error('Erro ao ler dados de resultado:', error);
      return null;
    }
  }

  async updateResultadoData(resultadoData) {
    try {
      const result = await this.queryWithRetry(
        `UPDATE resultado SET
           previsto = $1,
           medio = $2,
           maximo = $3,
           updated_at = $4
         WHERE id = 1
         RETURNING *`,
        [
          resultadoData.previsto || new Array(12).fill(0),
          resultadoData.medio || new Array(12).fill(0),
          resultadoData.maximo || new Array(12).fill(0),
          new Date().toISOString()
        ]
      );
      return result.rows[0];
    } catch (error) {
      throw new Error('Erro ao salvar dados de resultado: ' + error.message);
    }
  }

  // Limpar todos os dados de projeção
  async clearAllProjectionData() {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      
      const defaultArray = new Array(12).fill(0);
      const defaultGrowth = JSON.stringify({ minimo: 0, medio: 0, maximo: 0 });
      const defaultMktComponents = JSON.stringify({ trafego: defaultArray, socialMedia: defaultArray, producaoConteudo: defaultArray });
      
      await client.query(
        `UPDATE projection SET
           despesas_variaveis = $1,
           despesas_fixas = $1,
           investimentos = $1,
           mkt = $1,
           faturamento_reurb = $1,
           faturamento_geo = $1,
           faturamento_plan = $1,
           faturamento_reg = $1,
           faturamento_nn = $1,
           mkt_components = $2,
           growth = $3,
           updated_at = $4
         WHERE id = 1`,
        [defaultArray, defaultMktComponents, defaultGrowth, new Date().toISOString()]
      );
      
      await client.query(`UPDATE fixed_expenses SET previsto = $1, media = $1, maximo = $1, updated_at = $2 WHERE id = 1`, [defaultArray, new Date().toISOString()]);
      await client.query(`UPDATE variable_expenses SET previsto = $1, medio = $1, maximo = $1, updated_at = $2 WHERE id = 1`, [defaultArray, new Date().toISOString()]);
      await client.query(`UPDATE mkt SET previsto = $1, medio = $1, maximo = $1, updated_at = $2 WHERE id = 1`, [defaultArray, new Date().toISOString()]);
      await client.query(`UPDATE budget SET previsto = $1, medio = $1, maximo = $1, updated_at = $2 WHERE id = 1`, [defaultArray, new Date().toISOString()]);
      await client.query(`UPDATE investments SET previsto = $1, medio = $1, maximo = $1, updated_at = $2 WHERE id = 1`, [defaultArray, new Date().toISOString()]);
      await client.query(`UPDATE faturamento_reurb SET previsto = $1, medio = $1, maximo = $1, updated_at = $2 WHERE id = 1`, [defaultArray, new Date().toISOString()]);
      await client.query(`UPDATE faturamento_geo SET previsto = $1, medio = $1, maximo = $1, updated_at = $2 WHERE id = 1`, [defaultArray, new Date().toISOString()]);
      await client.query(`UPDATE faturamento_plan SET previsto = $1, medio = $1, maximo = $1, updated_at = $2 WHERE id = 1`, [defaultArray, new Date().toISOString()]);
      await client.query(`UPDATE faturamento_reg SET previsto = $1, medio = $1, maximo = $1, updated_at = $2 WHERE id = 1`, [defaultArray, new Date().toISOString()]);
      await client.query(`UPDATE faturamento_nn SET previsto = $1, medio = $1, maximo = $1, updated_at = $2 WHERE id = 1`, [defaultArray, new Date().toISOString()]);
      await client.query(`UPDATE faturamento_total SET previsto = $1, medio = $1, maximo = $1, updated_at = $2 WHERE id = 1`, [defaultArray, new Date().toISOString()]);
      await client.query(`UPDATE resultado SET previsto = $1, medio = $1, maximo = $1, updated_at = $2 WHERE id = 1`, [defaultArray, new Date().toISOString()]);
      
      await client.query('COMMIT');
      return true;
    } catch (error) {
      await client.query('ROLLBACK');
      throw new Error('Erro ao limpar dados de projeção: ' + error.message);
    } finally {
      client.release();
    }
  }

  // Métodos de backup (stub - implementar conforme necessário)
  async createAutoBackup(tableName) {
    // Implementar lógica de backup se necessário
    console.log(`Backup criado para tabela: ${tableName}`);
  }

  async restoreFromBackup(tableName, backupId) {
    // Implementar lógica de restore se necessário
    console.log(`Restaurando backup ${backupId} para tabela: ${tableName}`);
  }

  // ========== FEEDBACK ==========

  async criarFeedback({ usuarioId, categoria, descricao, imagemBase64, linkVideo, pagina }) {
    const id = this.generateId();
    const now = new Date().toISOString();
    const r = await this.pool.query(
      `INSERT INTO feedbacks (id, usuario_id, categoria, descricao, imagem_base64, link_video, pagina, status, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'pendente', $8, $8) RETURNING *`,
      [id, usuarioId, categoria, descricao, imagemBase64 || null, linkVideo || null, pagina || null, now]
    );
    return toCamelCase(r.rows[0]);
  }

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
  }

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
  }

  async responderFeedback(id, { resposta }) {
    const now = new Date().toISOString();
    const r = await this.pool.query(
      `UPDATE feedbacks SET resposta = $1, status = 'respondido', updated_at = $2 WHERE id = $3 RETURNING *`,
      [resposta, now, id]
    );
    if (r.rows.length === 0) throw new Error('Feedback não encontrado');
    return toCamelCase(r.rows[0]);
  }

  async aceitarFeedback(id, { resposta }) {
    const now = new Date().toISOString();
    const r = await this.pool.query(
      `UPDATE feedbacks SET resposta = $1, status = 'aceito', updated_at = $2 WHERE id = $3 RETURNING *`,
      [resposta, now, id]
    );
    if (r.rows.length === 0) throw new Error('Feedback não encontrado');
    return toCamelCase(r.rows[0]);
  }
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
  }

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
  }

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
  }

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
  }

  async deletarFAQ(id) {
    const r = await this.pool.query(
      'DELETE FROM faq WHERE id = $1 RETURNING *',
      [id]
    );
    if (r.rows.length === 0) throw new Error('Item FAQ não encontrado');
    return toCamelCase(r.rows[0]);
  }

  async atualizarOrdemFAQ(faqIds) {
    const now = new Date().toISOString();
    for (let i = 0; i < faqIds.length; i++) {
      await this.pool.query(
        'UPDATE faq SET ordem = $1, updated_at = $2 WHERE id = $3',
        [i, now, faqIds[i]]
      );
    }
  }

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
  }

  // ---- Termos de Uso ----
  async obterTermosUso() {
    await this._ensureLegalDefaults();
    const r = await this.queryWithRetry('SELECT id, conteudo, versao, updated_at FROM termos_uso ORDER BY id DESC LIMIT 1');
    if (r.rows.length === 0) return { conteudo: '', versao: 1, updatedAt: null };
    const row = r.rows[0];
    return { conteudo: row.conteudo, versao: row.versao, updatedAt: row.updated_at };
  }

  async obterTermosUsoAdmin() {
    await this._ensureLegalDefaults();
    const r = await this.queryWithRetry('SELECT id, conteudo, versao, updated_by, updated_at, created_at FROM termos_uso ORDER BY id DESC LIMIT 1');
    if (r.rows.length === 0) return null;
    const row = r.rows[0];
    return { id: row.id, conteudo: row.conteudo, versao: row.versao, updatedBy: row.updated_by, updatedAt: row.updated_at, createdAt: row.created_at };
  }

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
  }

  // ---- Política de Privacidade ----
  async obterPoliticaPrivacidade() {
    await this._ensureLegalDefaults();
    const r = await this.queryWithRetry('SELECT id, conteudo, versao, updated_at FROM politica_privacidade ORDER BY id DESC LIMIT 1');
    if (r.rows.length === 0) return { conteudo: '', versao: 1, updatedAt: null };
    const row = r.rows[0];
    return { conteudo: row.conteudo, versao: row.versao, updatedAt: row.updated_at };
  }

  async obterPoliticaPrivacidadeAdmin() {
    await this._ensureLegalDefaults();
    const r = await this.queryWithRetry('SELECT id, conteudo, versao, updated_by, updated_at, created_at FROM politica_privacidade ORDER BY id DESC LIMIT 1');
    if (r.rows.length === 0) return null;
    const row = r.rows[0];
    return { id: row.id, conteudo: row.conteudo, versao: row.versao, updatedBy: row.updated_by, updatedAt: row.updated_at, createdAt: row.created_at };
  }

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
  }

  // ---- Cookie Banner Config ----
  async obterCookieBannerConfig() {
    await this._ensureLegalDefaults();
    const r = await this.queryWithRetry('SELECT * FROM cookie_banner_config ORDER BY id DESC LIMIT 1');
    if (r.rows.length === 0) return null;
    const row = r.rows[0];
    return { titulo: row.titulo, texto: row.texto, textoBotaoAceitar: row.texto_botao_aceitar, textoBotaoRejeitar: row.texto_botao_rejeitar, textoBotaoPersonalizar: row.texto_botao_personalizar, textoDescricaoGerenciamento: row.texto_descricao_gerenciamento };
  }

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
  }

  // ---- Cookie Categorias ----
  async obterCookieCategorias(apenasAtivas = false) {
    await this._ensureLegalDefaults();
    const q = apenasAtivas ? 'SELECT * FROM cookie_categorias WHERE ativo=true ORDER BY ordem ASC' : 'SELECT * FROM cookie_categorias ORDER BY ordem ASC';
    const r = await this.queryWithRetry(q);
    return r.rows.map(row => ({ id: row.id, chave: row.chave, nome: row.nome, descricao: row.descricao, ativo: row.ativo, obrigatorio: row.obrigatorio, ordem: row.ordem }));
  }

  async criarCookieCategoria({ chave, nome, descricao, ativo = true, obrigatorio = false, ordem = 0 }) {
    await this._ensureLegalDefaults();
    const now = new Date().toISOString();
    const r = await this.queryWithRetry('INSERT INTO cookie_categorias (chave,nome,descricao,ativo,obrigatorio,ordem,created_at,updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$7) RETURNING *', [chave, nome, descricao, ativo, obrigatorio, ordem, now]);
    const row = r.rows[0];
    return { id: row.id, chave: row.chave, nome: row.nome, descricao: row.descricao, ativo: row.ativo, obrigatorio: row.obrigatorio, ordem: row.ordem };
  }

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
  }

  async deletarCookieCategoria(id) {
    await this._ensureLegalDefaults();
    const existing = await this.queryWithRetry('SELECT obrigatorio FROM cookie_categorias WHERE id=$1', [id]);
    if (existing.rows.length === 0) throw new Error('Categoria não encontrada');
    if (existing.rows[0].obrigatorio) throw new Error('Categorias obrigatórias não podem ser deletadas');
    await this.queryWithRetry('DELETE FROM cookie_categorias WHERE id=$1', [id]);
  }

  // ---- Consentimentos ----
  async obterConsentimentoUsuario(userId) {
    await this._ensureLegalDefaults();
    const r = await this.queryWithRetry('SELECT * FROM cookie_consentimentos WHERE user_id=$1', [userId]);
    if (r.rows.length === 0) return null;
    const row = r.rows[0];
    return { userId: row.user_id, preferencias: row.preferencias, versaoTermos: row.versao_termos, versaoPolitica: row.versao_politica, updatedAt: row.updated_at };
  }

  async salvarConsentimentoUsuario(userId, preferencias, versaoTermos, versaoPolitica, ipAddress, userAgent) {
    await this._ensureLegalDefaults();
    const now = new Date().toISOString();
    await this.queryWithRetry(`
      INSERT INTO cookie_consentimentos (user_id, preferencias, versao_termos, versao_politica, ip_address, user_agent, created_at, updated_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$7)
      ON CONFLICT (user_id) DO UPDATE SET preferencias=$2, versao_termos=$3, versao_politica=$4, ip_address=$5, user_agent=$6, updated_at=$7
    `, [userId, JSON.stringify(preferencias), versaoTermos, versaoPolitica, ipAddress, userAgent, now]);
  }

  // ---- Permissões Legais ----
  async obterPermissoesLegais(userId) {
    await this._ensureLegalDefaults();
    const r = await this.queryWithRetry('SELECT permissoes_legais FROM users WHERE id=$1', [userId]);
    if (r.rows.length === 0) throw new Error('Usuário não encontrado');
    return r.rows[0].permissoes_legais || {};
  }

  async atualizarPermissoesLegais(userId, permissoes) {
    await this._ensureLegalDefaults();
    const allowed = ['termos_uso', 'politica_privacidade', 'cookies'];
    const safe = {};
    for (const k of allowed) { safe[k] = permissoes[k] === true; }
    await this.queryWithRetry('UPDATE users SET permissoes_legais=$1 WHERE id=$2', [JSON.stringify(safe), userId]);
    return safe;
  }

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
  }

  // Retorna nível de visibilidade necessário para o role dado
  _visibilityFor(userRole) {
    if (userRole === 'admin' || userRole === 'superadmin') return ['todos', 'usuarios', 'admins'];
    if (userRole === 'user') return ['todos', 'usuarios'];
    return ['todos']; // guest
  }

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
  }

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
  }

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
  }

  async deletarDocSection(id) {
    await this._ensureDocDefaults();
    await this.queryWithRetry(`DELETE FROM doc_sections WHERE id=$1`, [id]);
  }

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
  }

  async atualizarDocPage(id, { title, content }) {
    await this._ensureDocDefaults();
    const now = new Date().toISOString();
    await this.queryWithRetry(
      `UPDATE doc_pages SET title=$1, content=$2, updated_at=$3 WHERE id=$4`,
      [title, content, now, id]
    );
    return { id, title, content, updatedAt: now };
  }

  async deletarDocPage(id) {
    await this._ensureDocDefaults();
    await this.queryWithRetry(`DELETE FROM doc_pages WHERE id=$1`, [id]);
  }

  async reordenarDocSections(ids) {
    await this._ensureDocDefaults();
    const now = new Date().toISOString();
    for (let i = 0; i < ids.length; i++) {
      await this.queryWithRetry(`UPDATE doc_sections SET ordem=$1, updated_at=$2 WHERE id=$3`, [i, now, ids[i]]);
    }
  }

  async reordenarDocPages(ids) {
    await this._ensureDocDefaults();
    const now = new Date().toISOString();
    for (let i = 0; i < ids.length; i++) {
      await this.queryWithRetry(`UPDATE doc_pages SET ordem=$1, updated_at=$2 WHERE id=$3`, [i, now, ids[i]]);
    }
  }

  // ============================================================
  // ROADMAP
  // ============================================================

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
  }

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
  }

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
  }

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
  }

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
  }

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
  }

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
  }

  async deleteRoadmapItem(id) {
    await this._ensureRoadmapDefaults();
    const r = await this.queryWithRetry(
      'DELETE FROM roadmap_items WHERE id = $1 RETURNING *',
      [id]
    );
    if (r.rows.length === 0) throw new Error('Item do roadmap não encontrado');
    return toCamelCase(r.rows[0]);
  }

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
  }

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
  }

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
  }

  async getRoadmapConfig() {
    await this._ensureRoadmapDefaults();
    const r = await this.queryWithRetry('SELECT * FROM roadmap_config LIMIT 1');
    if (r.rows.length === 0) return { colunaConcluir: 'lancado' };
    return toCamelCase(r.rows[0]);
  }

  async updateRoadmapConfig(dados) {
    await this._ensureRoadmapDefaults();
    const r = await this.queryWithRetry(
      `UPDATE roadmap_config SET coluna_concluir = $1, updated_at = CURRENT_TIMESTAMP RETURNING *`,
      [dados.colunaConcluir || 'lancado']
    );
    if (r.rows.length === 0) throw new Error('Configuração não encontrada');
    return toCamelCase(r.rows[0]);
  }

  async getRoadmapColunas() {
    await this._ensureRoadmapDefaults();
    const r = await this.queryWithRetry('SELECT * FROM roadmap_colunas ORDER BY ordem ASC, created_at ASC');
    return r.rows.map(row => toCamelCase(row));
  }

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
  }

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
  }

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
  }

  // ========== RODAPÉ ==========

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
  }

  async obterRodapeConfiguracoes() {
    const r = await this.pool.query(`SELECT chave, valor FROM rodape_configuracoes`);
    const obj = {};
    for (const row of r.rows) obj[row.chave] = row.valor;
    return obj;
  }

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
  }

  async obterRodapeColunas() {
    const r = await this.pool.query(`SELECT * FROM rodape_colunas ORDER BY ordem ASC, created_at ASC`);
    return r.rows;
  }

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
  }

  async atualizarRodapeColuna(id, titulo) {
    const now = new Date().toISOString();
    const r = await this.pool.query(
      `UPDATE rodape_colunas SET titulo = $1, updated_at = $2 WHERE id = $3 RETURNING *`,
      [titulo, now, id]
    );
    if (r.rows.length === 0) throw new Error('Coluna não encontrada');
    return r.rows[0];
  }

  async deletarRodapeColuna(id) {
    const r = await this.pool.query(`DELETE FROM rodape_colunas WHERE id = $1 RETURNING *`, [id]);
    if (r.rows.length === 0) throw new Error('Coluna não encontrada');
    return r.rows[0];
  }

  async atualizarOrdemColunas(colunaIds) {
    const now = new Date().toISOString();
    for (let i = 0; i < colunaIds.length; i++) {
      await this.pool.query(`UPDATE rodape_colunas SET ordem = $1, updated_at = $2 WHERE id = $3`, [i, now, colunaIds[i]]);
    }
  }

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
  }

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
  }

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
  }

  async deletarRodapeLink(id) {
    const r = await this.pool.query(`DELETE FROM rodape_links WHERE id = $1 RETURNING *`, [id]);
    if (r.rows.length === 0) throw new Error('Link não encontrado');
    return r.rows[0];
  }

  async atualizarOrdemLinks(linkIds) {
    const now = new Date().toISOString();
    for (let i = 0; i < linkIds.length; i++) {
      await this.pool.query(`UPDATE rodape_links SET ordem = $1, updated_at = $2 WHERE id = $3`, [i, now, linkIds[i]]);
    }
  }

  // ========== RODAPÉ — BOTTOM LINKS ==========

  async obterRodapeBottomLinksAdmin() {
    const r = await this.pool.query(`SELECT * FROM rodape_bottom_links ORDER BY ordem ASC, created_at ASC`);
    return r.rows.map(row => ({ id: row.id, texto: row.texto, link: row.link, ativo: row.ativo, ordem: row.ordem }));
  }

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
  }

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
  }

  async deletarRodapeBottomLink(id) {
    const r = await this.pool.query(`DELETE FROM rodape_bottom_links WHERE id = $1 RETURNING *`, [id]);
    if (r.rows.length === 0) throw new Error('Link não encontrado');
    return r.rows[0];
  }

  async atualizarOrdemBottomLinks(linkIds) {
    const now = new Date().toISOString();
    for (let i = 0; i < linkIds.length; i++) {
      await this.pool.query(`UPDATE rodape_bottom_links SET ordem = $1, updated_at = $2 WHERE id = $3`, [i, now, linkIds[i]]);
    }
  }

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
  }

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
  }

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
  }

  async marcarVersaoVista(userId, versao) {
    await this.pool.query(
      `INSERT INTO versao_notificacoes_vistas (user_id, versao) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [userId, versao]
    ).catch(() => {});
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // TerraControl — Orçamentos e pagamentos (migration 040)
  // ═══════════════════════════════════════════════════════════════════════════
  // Camada de persistência pura. Toda lógica de transição de estado, transação,
  // notificação e chamada externa fica em server/services/budget-service.js.
  //
  // Convenções:
  //   - Status do orçamento: draft|sent|revision_requested|awaiting_payment|paid|cancelled
  //   - Revisões numeradas a partir de 1 (revision_number=0 = budget criado mas
  //     ainda sem revisão enviada — não acontece no fluxo atual, sendBudget já
  //     cria com revision=1).
  //   - terracontrol.budget_status NULL = registro legado, fluxo livre.
  // ═══════════════════════════════════════════════════════════════════════════

  // ───── Orçamento (cabeçalho) ─────────────────────────────────────────────

  async createBudget({ terracontrolId, createdByUserId }) {
    const id = this.generateId();
    const result = await this.queryWithRetry(
      `INSERT INTO tc_budgets (id, terracontrol_id, status, created_by_user_id)
       VALUES ($1, $2, 'draft', $3)
       RETURNING *`,
      [id, terracontrolId, createdByUserId || null]
    );
    return result.rows[0];
  }

  async getBudgetById(id) {
    const result = await this.queryWithRetry(
      'SELECT * FROM tc_budgets WHERE id = $1',
      [id]
    );
    return result.rows[0] || null;
  }

  // Devolve o budget NÃO cancelado de um registro (1 por vez, garantido por
  // índice único parcial). Retorna null se nunca houve orçamento.
  async getBudgetByTerracontrolId(terracontrolId) {
    const result = await this.queryWithRetry(
      `SELECT * FROM tc_budgets
        WHERE terracontrol_id = $1 AND status <> 'cancelled'
        ORDER BY created_at DESC
        LIMIT 1`,
      [terracontrolId]
    );
    return result.rows[0] || null;
  }

  // Lookup por externalId pra reconciliar webhooks. AbacatePay manda o que a
  // gente mandou em metadata/externalId — usamos `tc_budget_<id>_attempt_<N>`.
  async getBudgetByExternalId(externalId) {
    const result = await this.queryWithRetry(
      'SELECT * FROM tc_budgets WHERE abacatepay_external_id = $1 LIMIT 1',
      [externalId]
    );
    return result.rows[0] || null;
  }

  // Atualiza só o status + updated_at. Extras opcionais (ex: paid_at, paid_amount).
  async updateBudgetStatus(id, status, extras = {}) {
    const sets = ['status = $2', 'updated_at = NOW()'];
    const params = [id, status];
    let i = 3;
    for (const [col, val] of Object.entries(extras)) {
      sets.push(`${col} = $${i++}`);
      params.push(val);
    }
    const result = await this.queryWithRetry(
      `UPDATE tc_budgets SET ${sets.join(', ')}
        WHERE id = $1
        RETURNING *`,
      params
    );
    return result.rows[0] || null;
  }

  // Snapshot do pagamento AbacatePay no budget (br_code, expires_at, attempt).
  // Chamado em accept (1ª emissão) e refresh-pix (re-emissões).
  async updateBudgetPaymentSnapshot(id, {
    chargeId, externalId, brCode, brCodeBase64, expiresAt, attempt,
  }) {
    const result = await this.queryWithRetry(
      `UPDATE tc_budgets
          SET abacatepay_charge_id      = $2,
              abacatepay_external_id    = $3,
              abacatepay_br_code        = $4,
              abacatepay_br_code_base64 = $5,
              abacatepay_expires_at     = $6,
              abacatepay_attempt        = $7,
              updated_at                = NOW()
        WHERE id = $1
        RETURNING *`,
      [id, chargeId, externalId, brCode, brCodeBase64, expiresAt, attempt]
    );
    return result.rows[0] || null;
  }

  // ───── Revisões (snapshots imutáveis) ────────────────────────────────────

  async createBudgetRevision({
    budgetId, revisionNumber, contentJson, contentHtmlSnapshot,
    items, totalAmountCents, pdfUrl, createdByUserId,
  }) {
    const id = this.generateId();
    const result = await this.queryWithRetry(
      `INSERT INTO tc_budget_revisions
         (id, budget_id, revision_number, content_json, content_html_snapshot,
          items, total_amount_cents, pdf_url, created_by_user_id)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9)
       RETURNING *`,
      [
        id, budgetId, revisionNumber,
        JSON.stringify(contentJson || {}),
        contentHtmlSnapshot || null,
        JSON.stringify(items || []),
        totalAmountCents,
        pdfUrl || null,
        createdByUserId || null,
      ]
    );
    return result.rows[0];
  }

  async listBudgetRevisions(budgetId) {
    // G10: JOIN com users pra trazer nome/sobrenome do impgeo user que
    // criou a revisão. Sempre é impgeo (admin envia) — não precisa CASE
    // como nos eventos.
    const result = await this.queryWithRetry(
      `SELECT r.*,
              u.first_name AS created_by_first_name,
              u.last_name  AS created_by_last_name,
              u.username   AS created_by_username
         FROM tc_budget_revisions r
         LEFT JOIN users u ON u.id = r.created_by_user_id
        WHERE r.budget_id = $1
        ORDER BY r.revision_number DESC`,
      [budgetId]
    );
    return result.rows;
  }

  async getCurrentBudgetRevision(budgetId, revisionNumber) {
    const result = await this.queryWithRetry(
      `SELECT * FROM tc_budget_revisions
        WHERE budget_id = $1 AND revision_number = $2`,
      [budgetId, revisionNumber]
    );
    return result.rows[0] || null;
  }

  // ───── Pedidos de revisão (do tc_user) ───────────────────────────────────

  async createBudgetRevisionRequest({
    budgetId, againstRevisionNumber, comment, source, tcUserId,
  }) {
    const id = this.generateId();
    const result = await this.queryWithRetry(
      `INSERT INTO tc_budget_revision_requests
         (id, budget_id, against_revision_number, comment, source, created_by_tc_user_id)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [
        id, budgetId, againstRevisionNumber,
        comment || null,
        source || 'tc_user',
        tcUserId || null,
      ]
    );
    return result.rows[0];
  }

  async listBudgetRevisionRequests(budgetId) {
    // G10: JOIN com tc_users pra trazer nome/sobrenome do tc_user que pediu
    // a revisão. Requests vêm do cliente, então sempre tc_users.
    const result = await this.queryWithRetry(
      `SELECT r.*,
              tu.first_name AS created_by_first_name,
              tu.last_name  AS created_by_last_name,
              tu.username   AS created_by_username
         FROM tc_budget_revision_requests r
         LEFT JOIN tc_users tu ON tu.id = r.created_by_tc_user_id
        WHERE r.budget_id = $1
        ORDER BY r.created_at DESC`,
      [budgetId]
    );
    return result.rows;
  }

  // ───── Eventos / trilha de auditoria ─────────────────────────────────────

  // Append-only. Nunca update — se algo dá errado, gera evento adicional.
  async appendBudgetEvent({ budgetId, eventType, actorType, actorId, payload }) {
    const id = this.generateId();
    const result = await this.queryWithRetry(
      `INSERT INTO tc_budget_events
         (id, budget_id, event_type, actor_type, actor_id, payload)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb)
       RETURNING *`,
      [
        id, budgetId, eventType, actorType,
        actorId || null,
        payload ? JSON.stringify(payload) : null,
      ]
    );
    return result.rows[0];
  }

  async listBudgetEvents(budgetId) {
    // G10: LEFT JOIN dual com users e tc_users — escolhe via CASE pelo
    // actor_type. Quando actor_type='system' ou 'abacatepay' não tem user
    // associado e os campos voltam null (o front renderiza o tipo bruto).
    const result = await this.queryWithRetry(
      `SELECT e.*,
              CASE WHEN e.actor_type = 'impgeo' THEN u.first_name
                   WHEN e.actor_type = 'tc'     THEN tu.first_name END AS actor_first_name,
              CASE WHEN e.actor_type = 'impgeo' THEN u.last_name
                   WHEN e.actor_type = 'tc'     THEN tu.last_name END AS actor_last_name,
              CASE WHEN e.actor_type = 'impgeo' THEN u.username
                   WHEN e.actor_type = 'tc'     THEN tu.username END AS actor_username
         FROM tc_budget_events e
         LEFT JOIN users u     ON e.actor_type = 'impgeo' AND u.id  = e.actor_id
         LEFT JOIN tc_users tu ON e.actor_type = 'tc'     AND tu.id = e.actor_id
        WHERE e.budget_id = $1
        ORDER BY e.created_at ASC`,
      [budgetId]
    );
    return result.rows;
  }

  // ───── Template padrão ───────────────────────────────────────────────────

  async getActiveBudgetTemplate() {
    const result = await this.queryWithRetry(
      'SELECT * FROM tc_budget_templates WHERE is_active = TRUE LIMIT 1'
    );
    return result.rows[0] || null;
  }

  // Cria/atualiza o template ativo. Como há índice único parcial garantindo
  // 1 ativo, usamos UPDATE se existir, INSERT se não.
  async upsertBudgetTemplate({ name, contentJson, defaultItems, updatedByUserId }) {
    const existing = await this.getActiveBudgetTemplate();
    if (existing) {
      const result = await this.queryWithRetry(
        `UPDATE tc_budget_templates
            SET name             = COALESCE($2, name),
                content_json     = $3::jsonb,
                default_items    = $4::jsonb,
                updated_at       = NOW(),
                updated_by_user_id = $5
          WHERE id = $1
          RETURNING *`,
        [
          existing.id,
          name || null,
          JSON.stringify(contentJson || {}),
          JSON.stringify(defaultItems || []),
          updatedByUserId || null,
        ]
      );
      return result.rows[0];
    }
    const id = this.generateId();
    const result = await this.queryWithRetry(
      `INSERT INTO tc_budget_templates
         (id, name, content_json, default_items, is_active, updated_by_user_id)
       VALUES ($1, $2, $3::jsonb, $4::jsonb, TRUE, $5)
       RETURNING *`,
      [
        id,
        name || 'Padrão',
        JSON.stringify(contentJson || {}),
        JSON.stringify(defaultItems || []),
        updatedByUserId || null,
      ]
    );
    return result.rows[0];
  }

  // ───── Webhook events — idempotência ─────────────────────────────────────

  // Insert com ON CONFLICT DO NOTHING. Retorna {firstSeen: true} se realmente
  // inseriu (handler deve processar), false se já existia (handler pula).
  async recordWebhookEvent({ provider, eventId, eventType, payload }) {
    const result = await this.queryWithRetry(
      `INSERT INTO tc_webhook_events (provider, event_id, event_type, payload)
       VALUES ($1, $2, $3, $4::jsonb)
       ON CONFLICT (provider, event_id) DO NOTHING
       RETURNING provider, event_id`,
      [provider, eventId, eventType, payload ? JSON.stringify(payload) : null]
    );
    return { firstSeen: result.rowCount > 0 };
  }

  // ───── tc_users — cache do AbacatePay customer_id ────────────────────────

  async setTcUserAbacatePayCustomerId(tcUserId, customerId) {
    await this.queryWithRetry(
      'UPDATE tc_users SET abacatepay_customer_id = $2, updated_at = NOW() WHERE id = $1',
      [tcUserId, customerId]
    );
  }

  // ───── terracontrol ↔ budget (denormalização) ────────────────────────────

  // Atualiza current_budget_id + budget_status no registro. Chamada pelo
  // budget-service em toda transição relevante.
  async setTerracontrolBudgetState(terracontrolId, { budgetId = undefined, budgetStatus }) {
    const sets = ['budget_status = $2', 'updated_at = CURRENT_TIMESTAMP'];
    const params = [terracontrolId, budgetStatus];
    if (budgetId !== undefined) {
      sets.push(`current_budget_id = $${params.length + 1}`);
      params.push(budgetId);
    }
    await this.queryWithRetry(
      `UPDATE terracontrol SET ${sets.join(', ')} WHERE id = $1`,
      params
    );
  }

  // ───── tc_record_events — audit log do registro (migration 041) ─────────

  // Append-only. Use pra TODA ação não-trivial sobre o registro
  // (created, edited, approved, unapproved). Falha silenciosa: o caller
  // não deve quebrar a request principal se o audit falhar.
  async appendRecordEvent({ terracontrolId, eventType, actorType, actorId, payload }) {
    try {
      const id = this.generateId();
      const result = await this.queryWithRetry(
        `INSERT INTO tc_record_events
           (id, terracontrol_id, event_type, actor_type, actor_id, payload)
         VALUES ($1, $2, $3, $4, $5, $6::jsonb)
         RETURNING *`,
        [
          id, terracontrolId, eventType, actorType,
          actorId || null,
          payload ? JSON.stringify(payload) : null,
        ]
      );
      return result.rows[0];
    } catch (err) {
      console.error('[appendRecordEvent] Falha ao gravar audit:', err?.message);
      return null;
    }
  }

  async listRecordEvents(terracontrolId) {
    // G10: mesmo padrão do listBudgetEvents — JOIN dual + CASE pelo actor_type.
    const result = await this.queryWithRetry(
      `SELECT e.*,
              CASE WHEN e.actor_type = 'impgeo' THEN u.first_name
                   WHEN e.actor_type = 'tc'     THEN tu.first_name END AS actor_first_name,
              CASE WHEN e.actor_type = 'impgeo' THEN u.last_name
                   WHEN e.actor_type = 'tc'     THEN tu.last_name END AS actor_last_name,
              CASE WHEN e.actor_type = 'impgeo' THEN u.username
                   WHEN e.actor_type = 'tc'     THEN tu.username END AS actor_username
         FROM tc_record_events e
         LEFT JOIN users u     ON e.actor_type = 'impgeo' AND u.id  = e.actor_id
         LEFT JOIN tc_users tu ON e.actor_type = 'tc'     AND tu.id = e.actor_id
        WHERE e.terracontrol_id = $1
        ORDER BY e.created_at ASC`,
      [terracontrolId]
    );
    return result.rows;
  }

  // ───── Ownership: tc_user é dono do budget? ──────────────────────────────

  // Verdadeiro se o terracontrol referenciado pelo budget foi criado pelo
  // tc_user OU se tc_user tem acesso explícito via tc_user_record_access.
  // Mesmo critério usado por tcUserCanEditRecord / tcUserCanDeleteRecord,
  // mas via JOIN no budget.
  async tcUserOwnsBudget(tcUserId, budgetId) {
    const result = await this.queryWithRetry(
      `SELECT 1 FROM tc_budgets b
         JOIN terracontrol t ON t.id = b.terracontrol_id
        WHERE b.id = $1
          AND (
            t.created_by_tc_user_id = $2
            OR EXISTS (
              SELECT 1 FROM tc_user_record_access a
               WHERE a.tc_user_id = $2 AND a.terracontrol_id = t.id
            )
          )
        LIMIT 1`,
      [budgetId, tcUserId]
    );
    return result.rowCount > 0;
  }
}

module.exports = Database;
