require('dotenv').config();
const { Pool } = require('pg');

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
    this.acompanhamentosSchemaEnsured = false;
    this.acompanhamentosSchemaEnsuring = null;
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
    return [
      { moduleKey: 'dashboard', moduleName: 'Dashboard', iconName: 'BarChart3', routePath: 'dashboard', isSystem: true, description: 'Visão geral do sistema' },
      { moduleKey: 'projects', moduleName: 'Projetos', iconName: 'FolderOpen', routePath: 'projects', isSystem: true, description: 'Gestão de projetos' },
      { moduleKey: 'services', moduleName: 'Serviços', iconName: 'Briefcase', routePath: 'services', isSystem: true, description: 'Gestão de serviços' },
      { moduleKey: 'reports', moduleName: 'Relatórios', iconName: 'FileText', routePath: 'reports', isSystem: true, description: 'Relatórios e análises' },
      { moduleKey: 'metas', moduleName: 'Metas', iconName: 'Target', routePath: 'metas', isSystem: true, description: 'Definição e acompanhamento de metas' },
      { moduleKey: 'projecao', moduleName: 'Projeção', iconName: 'LineChart', routePath: 'projecao', isSystem: true, description: 'Projeções financeiras' },
      { moduleKey: 'transactions', moduleName: 'Transações', iconName: 'Wallet', routePath: 'transactions', isSystem: true, description: 'Transações financeiras' },
      { moduleKey: 'clients', moduleName: 'Clientes', iconName: 'Users', routePath: 'clients', isSystem: true, description: 'Cadastro de clientes' },
      { moduleKey: 'dre', moduleName: 'DRE', iconName: 'Calculator', routePath: 'dre', isSystem: true, description: 'Demonstrativo de resultados' },
      { moduleKey: 'acompanhamentos', moduleName: 'Acompanhamentos', iconName: 'ClipboardList', routePath: 'acompanhamentos', isSystem: true, description: 'Acompanhamento operacional' },
      { moduleKey: 'admin', moduleName: 'Admin', iconName: 'Shield', routePath: 'admin', isSystem: true, description: 'Painel administrativo' },
      { moduleKey: 'sessions', moduleName: 'Sessões Ativas', iconName: 'Monitor', routePath: 'sessions', isSystem: true, description: 'Gerenciamento de sessões ativas por dispositivo' },
      { moduleKey: 'anomalies', moduleName: 'Anomalias', iconName: 'AlertTriangle', routePath: 'anomalies', isSystem: true, description: 'Dashboard de detecção de anomalias de segurança' },
      { moduleKey: 'security_alerts', moduleName: 'Alertas de Segurança', iconName: 'ShieldAlert', routePath: 'security_alerts', isSystem: true, description: 'Portal de alertas e notificações de segurança' },
      { moduleKey: 'faq', moduleName: 'FAQ', iconName: 'HelpCircle', routePath: 'faq', isSystem: true, description: 'Perguntas frequentes do sistema' },
      { moduleKey: 'roadmap', moduleName: 'Roadmap', iconName: 'Map', routePath: 'roadmap', isSystem: true, description: 'Roadmap de desenvolvimento do sistema' }
    ];
  }

  getDefaultModuleKeysByRole(role) {
    const allModuleKeys = this.getDefaultModulesCatalog().map((module) => module.moduleKey);
    const superadminOnlyModules = ['sessions', 'anomalies', 'security_alerts'];
    const adminAndSuperadminModules = ['roadmap'];
    switch (role) {
      case 'superadmin':
        return allModuleKeys;
      case 'admin':
        return allModuleKeys.filter((moduleKey) => !superadminOnlyModules.includes(moduleKey));
      case 'user':
        return allModuleKeys.filter((moduleKey) => moduleKey !== 'admin' && !superadminOnlyModules.includes(moduleKey) && !adminAndSuperadminModules.includes(moduleKey));
      case 'guest':
        return allModuleKeys.filter(
          (moduleKey) => !['admin', 'dre', 'acompanhamentos', ...superadminOnlyModules, ...adminAndSuperadminModules].includes(moduleKey)
        );
      default:
        return [];
    }
  }

  getDefaultAccessLevelByRole(role) {
    switch (role) {
      case 'superadmin':
      case 'admin':
        return 'edit';
      case 'user':
        return 'write';
      case 'guest':
      default:
        return 'view';
    }
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
          access_level VARCHAR(10) NOT NULL CHECK (access_level IN ('view', 'write', 'edit')),
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
              (module_key, module_name, icon_name, description, route_path, is_system, is_active, created_at, updated_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
            ON CONFLICT (module_key) DO UPDATE SET
              module_name = EXCLUDED.module_name,
              icon_name = COALESCE(modules_catalog.icon_name, EXCLUDED.icon_name),
              description = COALESCE(modules_catalog.description, EXCLUDED.description),
              route_path = COALESCE(modules_catalog.route_path, EXCLUDED.route_path),
              is_system = TRUE,
              is_active = EXCLUDED.is_active,
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

  async saveClient(client) {
    try {
      const id = this.generateId();
      const result = await this.queryWithRetry(
        `INSERT INTO clients (id, name, email, phone, company, address, city, state, zip_code, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
         RETURNING *`,
        [
          id,
          client.name || null,
          client.email || null,
          client.phone || null,
          client.company || null,
          client.address || null,
          client.city || null,
          client.state || null,
          client.zipCode || null,
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
         SET name = $1, email = $2, phone = $3, company = $4, address = $5, city = $6, state = $7, zip_code = $8, updated_at = $9
         WHERE id = $10
         RETURNING *`,
        [
          updatedClient.name || null,
          updatedClient.email || null,
          updatedClient.phone || null,
          updatedClient.company || null,
          updatedClient.address || null,
          updatedClient.city || null,
          updatedClient.state || null,
          updatedClient.zipCode || null,
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
        `INSERT INTO projects (id, name, client, status, description, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING *`,
        [
          id,
          projectData.name || null,
          projectData.client || null,
          projectData.status || null,
          projectData.description || null,
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
      const result = await this.queryWithRetry(
        `UPDATE projects 
         SET name = $1, client = $2, status = $3, description = $4, updated_at = $5
         WHERE id = $6
         RETURNING *`,
        [
          updatedData.name || null,
          updatedData.client || null,
          updatedData.status || null,
          updatedData.description || null,
          new Date().toISOString(),
          id
        ]
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
      const result = await this.queryWithRetry(
        `INSERT INTO services (id, name, description, price, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING *`,
        [
          id,
          serviceData.name || null,
          serviceData.description || null,
          serviceData.price || 0,
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
      const result = await this.queryWithRetry(
        `UPDATE services 
         SET name = $1, description = $2, price = $3, updated_at = $4
         WHERE id = $5
         RETURNING *`,
        [
          updatedData.name || null,
          updatedData.description || null,
          updatedData.price || 0,
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

  // Métodos para Acompanhamentos
  async getAllAcompanhamentos() {
    try {
      await this.ensureAcompanhamentosSchema();
      const result = await this.queryWithRetry('SELECT * FROM acompanhamentos ORDER BY cod_imovel');
      return result.rows;
    } catch (error) {
      console.error('Erro ao ler acompanhamentos:', error);
      return [];
    }
  }

  async saveAcompanhamento(acompanhamentoData) {
    try {
      await this.ensureAcompanhamentosSchema();
      const id = this.generateId();
      const result = await this.queryWithRetry(
        `INSERT INTO acompanhamentos (
           id, imovel, municipio, mapa_url, matriculas, matriculas_dados, n_incra_ccir, ccir_dados, car, car_url, status_car, itr, itr_dados,
           geo_certificacao, geo_registro, area_total, reserva_legal, cultura1, area_cultura1,
           cultura2, area_cultura2, outros, area_outros, app_codigo_florestal, app_vegetada,
           app_nao_vegetada, remanescente_florestal, endereco, status, observacoes, created_at, updated_at
         )
         VALUES (
           $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
           $11, $12, $13, $14, $15, $16, $17, $18, $19, $20,
           $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31, $32
         )
         RETURNING *`,
        [
          id,
          acompanhamentoData.imovel || acompanhamentoData.endereco || null,
          acompanhamentoData.municipio || null,
          acompanhamentoData.mapa_url || acompanhamentoData.mapaUrl || null,
          acompanhamentoData.matriculas || null,
          acompanhamentoData.matriculas_dados ? JSON.stringify(acompanhamentoData.matriculas_dados) : (acompanhamentoData.matriculasDados ? JSON.stringify(acompanhamentoData.matriculasDados) : null),
          acompanhamentoData.n_incra_ccir || acompanhamentoData.nIncraCcir || null,
          acompanhamentoData.ccir_dados ? JSON.stringify(acompanhamentoData.ccir_dados) : (acompanhamentoData.ccirDados ? JSON.stringify(acompanhamentoData.ccirDados) : null),
          acompanhamentoData.car || null,
          acompanhamentoData.car_url || acompanhamentoData.carUrl || null,
          acompanhamentoData.status_car || acompanhamentoData.statusCar || acompanhamentoData.status || null,
          acompanhamentoData.itr || null,
          acompanhamentoData.itr_dados ? JSON.stringify(acompanhamentoData.itr_dados) : (acompanhamentoData.itrDados ? JSON.stringify(acompanhamentoData.itrDados) : null),
          acompanhamentoData.geo_certificacao || acompanhamentoData.geoCertificacao || 'NÃO',
          acompanhamentoData.geo_registro || acompanhamentoData.geoRegistro || 'NÃO',
          acompanhamentoData.area_total ?? acompanhamentoData.areaTotal ?? 0,
          acompanhamentoData.reserva_legal ?? acompanhamentoData.reservaLegal ?? 0,
          acompanhamentoData.cultura1 || null,
          acompanhamentoData.area_cultura1 ?? acompanhamentoData.areaCultura1 ?? 0,
          acompanhamentoData.cultura2 || null,
          acompanhamentoData.area_cultura2 ?? acompanhamentoData.areaCultura2 ?? 0,
          acompanhamentoData.outros || null,
          acompanhamentoData.area_outros ?? acompanhamentoData.areaOutros ?? 0,
          acompanhamentoData.app_codigo_florestal ?? acompanhamentoData.appCodigoFlorestal ?? 0,
          acompanhamentoData.app_vegetada ?? acompanhamentoData.appVegetada ?? 0,
          acompanhamentoData.app_nao_vegetada ?? acompanhamentoData.appNaoVegetada ?? 0,
          acompanhamentoData.remanescente_florestal ?? acompanhamentoData.remanescenteFlorestal ?? 0,
          acompanhamentoData.endereco || acompanhamentoData.imovel || null,
          acompanhamentoData.status || acompanhamentoData.statusCar || null,
          acompanhamentoData.observacoes || null,
          new Date().toISOString(),
          new Date().toISOString()
        ]
      );
      return result.rows[0];
    } catch (error) {
      throw new Error('Erro ao salvar acompanhamento: ' + error.message);
    }
  }

  async updateAcompanhamento(id, updatedData) {
    try {
      await this.ensureAcompanhamentosSchema();
      const result = await this.queryWithRetry(
        `UPDATE acompanhamentos 
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
        throw new Error('Acompanhamento não encontrado');
      }
      return result.rows[0];
    } catch (error) {
      throw new Error('Erro ao atualizar acompanhamento: ' + error.message);
    }
  }

  async deleteAcompanhamento(id) {
    try {
      const result = await this.queryWithRetry(
        'DELETE FROM acompanhamentos WHERE id = $1 RETURNING id',
        [id]
      );
      if (result.rows.length === 0) {
        throw new Error('Acompanhamento não encontrado');
      }
      return true;
    } catch (error) {
      throw new Error('Erro ao excluir acompanhamento: ' + error.message);
    }
  }

  async deleteMultipleAcompanhamentos(ids) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      for (const id of ids) {
        await client.query('DELETE FROM acompanhamentos WHERE id = $1', [id]);
      }
      await client.query('COMMIT');
      return true;
    } catch (error) {
      await client.query('ROLLBACK');
      throw new Error('Erro ao excluir acompanhamentos: ' + error.message);
    } finally {
      client.release();
    }
  }

  async ensureAcompanhamentosSchema() {
    if (this.acompanhamentosSchemaEnsured) return;
    if (this.acompanhamentosSchemaEnsuring) {
      await this.acompanhamentosSchemaEnsuring;
      return;
    }

    this.acompanhamentosSchemaEnsuring = (async () => {
      await this.queryWithRetry('ALTER TABLE acompanhamentos ADD COLUMN IF NOT EXISTS car_url TEXT');
      await this.queryWithRetry('ALTER TABLE acompanhamentos ADD COLUMN IF NOT EXISTS matriculas_dados JSONB');
      await this.queryWithRetry('ALTER TABLE acompanhamentos ADD COLUMN IF NOT EXISTS itr_dados JSONB');
      await this.queryWithRetry('ALTER TABLE acompanhamentos ADD COLUMN IF NOT EXISTS ccir_dados JSONB');
    })()
      .then(() => {
        this.acompanhamentosSchemaEnsured = true;
      })
      .finally(() => {
        this.acompanhamentosSchemaEnsuring = null;
      });

    await this.acompanhamentosSchemaEnsuring;
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
        SELECT module_key, module_name, icon_name, description, route_path, is_system, is_active, sort_order, created_at, updated_at
        FROM modules_catalog
        ORDER BY sort_order ASC NULLS LAST, module_name ASC
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
      createdAt: row.created_at || null,
      updatedAt: row.updated_at || null
    }));
  }

  async getModuleByKey(moduleKey) {
    await this.ensureProfileSchema();
    const result = await this.queryWithRetry(
      `
        SELECT module_key, module_name, icon_name, description, route_path, is_system, is_active, created_at, updated_at
        FROM modules_catalog
        WHERE module_key = $1
        LIMIT 1
      `,
      [moduleKey]
    );

    if (result.rows.length === 0) return null;
    const row = result.rows[0];
    return {
      moduleKey: row.module_key,
      moduleName: row.module_name,
      iconName: row.icon_name || null,
      description: row.description || null,
      routePath: row.route_path || null,
      isSystem: row.is_system === true,
      isActive: row.is_active !== false,
      createdAt: row.created_at || null,
      updatedAt: row.updated_at || null
    };
  }

  async createModule(moduleData) {
    await this.ensureProfileSchema();
    const now = new Date().toISOString();
    const maxResult = await this.queryWithRetry('SELECT COALESCE(MAX(sort_order), 0) + 1 AS next_order FROM modules_catalog');
    const nextOrder = maxResult.rows[0]?.next_order ?? 1;
    const result = await this.queryWithRetry(
      `
        INSERT INTO modules_catalog
          (module_key, module_name, icon_name, description, route_path, is_system, is_active, sort_order, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        RETURNING module_key, module_name, icon_name, description, route_path, is_system, is_active, sort_order, created_at, updated_at
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
        now,
        now
      ]
    );
    const row = result.rows[0];
    return {
      moduleKey: row.module_key,
      moduleName: row.module_name,
      iconName: row.icon_name || null,
      description: row.description || null,
      routePath: row.route_path || null,
      isSystem: row.is_system === true,
      isActive: row.is_active !== false,
      sortOrder: row.sort_order ?? null,
      createdAt: row.created_at || null,
      updatedAt: row.updated_at || null
    };
  }

  async updateModule(moduleKey, moduleData) {
    await this.ensureProfileSchema();
    const existing = await this.getModuleByKey(moduleKey);
    if (!existing) {
      throw new Error('Módulo não encontrado');
    }

    if (existing.isSystem && moduleData.moduleKey && moduleData.moduleKey !== moduleKey) {
      throw new Error('Não é permitido alterar a chave de um módulo de sistema');
    }

    const targetKey = moduleData.moduleKey || moduleKey;
    const result = await this.queryWithRetry(
      `
        UPDATE modules_catalog
        SET
          module_key = $1,
          module_name = $2,
          icon_name = $3,
          description = $4,
          route_path = $5,
          is_active = $6,
          updated_at = $7
        WHERE module_key = $8
        RETURNING module_key, module_name, icon_name, description, route_path, is_system, is_active, created_at, updated_at
      `,
      [
        targetKey,
        moduleData.moduleName ?? existing.moduleName,
        moduleData.iconName !== undefined ? moduleData.iconName : existing.iconName,
        moduleData.description !== undefined ? moduleData.description : existing.description,
        moduleData.routePath !== undefined ? moduleData.routePath : existing.routePath,
        moduleData.isActive !== undefined ? moduleData.isActive : existing.isActive,
        new Date().toISOString(),
        moduleKey
      ]
    );

    const row = result.rows[0];
    return {
      moduleKey: row.module_key,
      moduleName: row.module_name,
      iconName: row.icon_name || null,
      description: row.description || null,
      routePath: row.route_path || null,
      isSystem: row.is_system === true,
      isActive: row.is_active !== false,
      createdAt: row.created_at || null,
      updatedAt: row.updated_at || null
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

  async reorderModules(orderedKeys) {
    await this.ensureProfileSchema();
    const now = new Date().toISOString();
    for (let i = 0; i < orderedKeys.length; i++) {
      await this.queryWithRetry(
        'UPDATE modules_catalog SET sort_order = $1, updated_at = $2 WHERE module_key = $3',
        [i + 1, now, orderedKeys[i]]
      );
    }
    return true;
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

    const moduleKeys = this.getDefaultModuleKeysByRole(role);
    const accessLevel = this.getDefaultAccessLevelByRole(role);
    const now = new Date().toISOString();

    for (const moduleKey of moduleKeys) {
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
          updated_at
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
      modulesAccess,
      permissionsSource
    };
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

  async obterFAQ() {
    try {
      const r = await this.pool.query(
        `SELECT * FROM faq WHERE ativo = true ORDER BY ordem ASC, created_at ASC`
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

  async criarFAQ({ pergunta, resposta }) {
    const id = this.generateId();
    const now = new Date().toISOString();
    const ordemRes = await this.pool.query(
      'SELECT COALESCE(MAX(ordem), -1) + 1 AS prox FROM faq'
    );
    const ordem = ordemRes.rows[0].prox;
    const r = await this.pool.query(
      `INSERT INTO faq (id, pergunta, resposta, ativo, ordem, created_at, updated_at)
       VALUES ($1, $2, $3, true, $4, $5, $5) RETURNING *`,
      [id, pergunta, resposta, ordem, now]
    );
    return toCamelCase(r.rows[0]);
  }

  async atualizarFAQ(id, { pergunta, resposta, ativo }) {
    const fields = [];
    const values = [id];
    let i = 2;
    if (pergunta !== undefined) { fields.push(`pergunta = $${i++}`); values.push(pergunta); }
    if (resposta !== undefined) { fields.push(`resposta = $${i++}`); values.push(resposta); }
    if (ativo !== undefined)    { fields.push(`ativo = $${i++}`);    values.push(ativo); }
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
          created_at TIMESTAMP,
          updated_at TIMESTAMP
        )
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
      // Registrar módulo documentacao se não existir
      const mod = await this.queryWithRetry(`SELECT module_key FROM modules_catalog WHERE module_key = 'documentacao' LIMIT 1`);
      if (mod.rows.length === 0) {
        await this.queryWithRetry(
          `INSERT INTO modules_catalog (module_key, module_name, description, icon, is_active, is_system) VALUES ($1,$2,$3,$4,true,true)
           ON CONFLICT (module_key) DO NOTHING`,
          ['documentacao', 'Documentação', 'Manual e guias do sistema', 'BookOpen']
        );
        console.log('Módulo Documentação criado no PostgreSQL.');
      }
      this.docSchemaEnsured = true;
    })();
    return this.docSchemaEnsuring;
  }

  async obterDocumentacao() {
    await this._ensureDocDefaults();
    const sections = await this.queryWithRetry(
      `SELECT id, title, ordem FROM doc_sections ORDER BY ordem ASC, created_at ASC`
    );
    const pages = await this.queryWithRetry(
      `SELECT id, section_id, title, content, ordem, updated_at FROM doc_pages ORDER BY ordem ASC, created_at ASC`
    );
    return sections.rows.map(s => ({
      id: s.id, title: s.title, order: s.ordem,
      pages: pages.rows.filter(p => p.section_id === s.id).map(p => ({
        id: p.id, sectionId: p.section_id, title: p.title,
        content: p.content, order: p.ordem, updatedAt: p.updated_at,
      })),
    }));
  }

  async criarDocSection({ title }) {
    await this._ensureDocDefaults();
    const id = this.generateId();
    const now = new Date().toISOString();
    const maxOrdem = await this.queryWithRetry(`SELECT COALESCE(MAX(ordem),0)+1 AS next FROM doc_sections`);
    await this.queryWithRetry(
      `INSERT INTO doc_sections (id, title, ordem, created_at, updated_at) VALUES ($1,$2,$3,$4,$4)`,
      [id, title, maxOrdem.rows[0].next, now]
    );
    return { id, title, order: maxOrdem.rows[0].next, pages: [] };
  }

  async atualizarDocSection(id, { title }) {
    await this._ensureDocDefaults();
    const now = new Date().toISOString();
    await this.queryWithRetry(`UPDATE doc_sections SET title=$1, updated_at=$2 WHERE id=$3`, [title, now, id]);
    return { id, title };
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

  async obterCommitPendente() {
    const r = await this.pool.query(
      `SELECT chave, valor FROM rodape_configuracoes
       WHERE chave IN ('ultimo_commit_inserido','ultimo_commit_confirmado','ultimo_commit_msg','ultimo_commit_data','versao_sistema')`
    );
    const obj = {};
    for (const row of r.rows) obj[row.chave] = row.valor;

    const inserido   = obj['ultimo_commit_inserido']  || null;
    const confirmado = obj['ultimo_commit_confirmado'] || null;
    const versao     = obj['versao_sistema'] || '';
    const msg        = obj['ultimo_commit_msg']  || '';
    const data       = obj['ultimo_commit_data'] || '';

    const pendente = inserido && inserido !== confirmado;
    return { pendente: !!pendente, commitHash: inserido, versaoAtual: versao, mensagem: msg, data };
  }

  async confirmarCommit({ action, novaVersao, mensagem, data, commitHash, rolesNotificados = [] }) {
    const now = new Date().toISOString();
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      await client.query(
        `INSERT INTO rodape_configuracoes (chave, valor, updated_at)
         VALUES ('ultimo_commit_confirmado', $1, $2)
         ON CONFLICT (chave) DO UPDATE SET valor = $1, updated_at = $2`,
        [commitHash, now]
      );

      if (action === 'ignorar') {
        await client.query('COMMIT');
        return { ok: true };
      }

      const novoItem = `<li><strong>${data}</strong> — ${mensagem}</li>`;
      const notasRes = await client.query(`SELECT valor FROM rodape_configuracoes WHERE chave = 'notas_versao'`);
      let notas = notasRes.rows.length > 0 ? (notasRes.rows[0].valor || '') : '';

      if (action === 'nova_versao' && novaVersao) {
        await client.query(
          `INSERT INTO rodape_configuracoes (chave, valor, updated_at)
           VALUES ('versao_sistema', $1, $2)
           ON CONFLICT (chave) DO UPDATE SET valor = $1, updated_at = $2`,
          [novaVersao, now]
        );

        const novaSecao = `<h2>Versão ${novaVersao}</h2>\n<h3>📋 Atualizações</h3>\n<ul>\n<!--COMMITS-->\n${novoItem}\n</ul>\n<hr>\n`;
        notas = notas.includes('<h2>') ? notas.replace('<h2>', novaSecao + '<h2>') : novaSecao + notas;

        for (const [chave, valor] of [
          ['versao_notificada', novaVersao],
          ['versao_notificada_roles', JSON.stringify(rolesNotificados)],
          ['versao_notificada_texto', mensagem],
        ]) {
          await client.query(
            `INSERT INTO rodape_configuracoes (chave, valor, updated_at) VALUES ($1, $2, $3)
             ON CONFLICT (chave) DO UPDATE SET valor = $2, updated_at = $3`,
            [chave, valor, now]
          );
        }

        await client.query(`DELETE FROM versao_notificacoes_vistas WHERE versao = $1`, [novaVersao]).catch(() => {});
      } else {
        notas = notas.includes('<!--COMMITS-->')
          ? notas.replace('<!--COMMITS-->', `<!--COMMITS-->\n${novoItem}`)
          : `<ul>\n<!--COMMITS-->\n${novoItem}\n</ul>\n` + notas;
      }

      await client.query(
        `UPDATE rodape_configuracoes SET valor = $1, updated_at = $2 WHERE chave = 'notas_versao'`,
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
      `SELECT chave, valor FROM rodape_configuracoes
       WHERE chave IN ('versao_notificada', 'versao_notificada_roles', 'versao_notificada_texto')`
    );
    const obj = {};
    for (const row of r.rows) obj[row.chave] = row.valor;

    const versao = obj['versao_notificada'] || '';
    if (!versao) return { notificar: false };

    let roles = [];
    try { roles = JSON.parse(obj['versao_notificada_roles'] || '[]'); } catch { roles = []; }
    if (!roles.includes(userRole)) return { notificar: false };

    const visto = await this.pool.query(
      `SELECT 1 FROM versao_notificacoes_vistas WHERE user_id = $1 AND versao = $2`,
      [userId, versao]
    ).catch(() => ({ rows: [] }));

    if (visto.rows.length > 0) return { notificar: false };

    return { notificar: true, versao, texto: obj['versao_notificada_texto'] || '' };
  }

  async marcarVersaoVista(userId, versao) {
    await this.pool.query(
      `INSERT INTO versao_notificacoes_vistas (user_id, versao) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [userId, versao]
    ).catch(() => {});
  }
}

module.exports = Database;
