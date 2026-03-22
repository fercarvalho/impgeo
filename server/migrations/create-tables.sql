-- Schema PostgreSQL para Impgeo
-- Criar banco de dados: CREATE DATABASE impgeo;

-- Tabelas Core

-- Usuários
CREATE TABLE IF NOT EXISTS users (
    id VARCHAR(255) PRIMARY KEY,
    username VARCHAR(255) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    first_name VARCHAR(255),
    last_name VARCHAR(255),
    email VARCHAR(255),
    phone VARCHAR(50),
    cpf VARCHAR(20),
    birth_date DATE,
    gender VARCHAR(50),
    position VARCHAR(255),
    address JSONB,
    role VARCHAR(50) NOT NULL CHECK (role IN ('superadmin', 'admin', 'user', 'guest')),
    photo_url TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    last_login TIMESTAMPTZ,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_users_username ON users(username);

ALTER TABLE users ADD COLUMN IF NOT EXISTS photo_url TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS first_name VARCHAR(255);
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_name VARCHAR(255);
ALTER TABLE users ADD COLUMN IF NOT EXISTS email VARCHAR(255);
ALTER TABLE users ADD COLUMN IF NOT EXISTS phone VARCHAR(50);
ALTER TABLE users ADD COLUMN IF NOT EXISTS cpf VARCHAR(20);
ALTER TABLE users ADD COLUMN IF NOT EXISTS birth_date DATE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS gender VARCHAR(50);
ALTER TABLE users ADD COLUMN IF NOT EXISTS position VARCHAR(255);
ALTER TABLE users ADD COLUMN IF NOT EXISTS address JSONB;

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_cpf ON users(cpf);

DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_name = 'users'
          AND column_name = 'last_login'
          AND data_type = 'timestamp without time zone'
    ) THEN
        ALTER TABLE users
            ALTER COLUMN last_login
            TYPE TIMESTAMPTZ
            USING last_login AT TIME ZONE 'UTC';
    END IF;
END $$;

-- Catálogo de módulos
CREATE TABLE IF NOT EXISTS modules_catalog (
    module_key VARCHAR(100) PRIMARY KEY,
    module_name VARCHAR(255) NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_modules_catalog_name ON modules_catalog(module_name);

-- Permissões por usuário e módulo
CREATE TABLE IF NOT EXISTS user_module_permissions (
    id VARCHAR(255) PRIMARY KEY,
    user_id VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    module_key VARCHAR(100) NOT NULL REFERENCES modules_catalog(module_key) ON DELETE CASCADE,
    access_level VARCHAR(10) NOT NULL CHECK (access_level IN ('view', 'write', 'edit')),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, module_key)
);

CREATE INDEX IF NOT EXISTS idx_user_module_permissions_user_id ON user_module_permissions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_module_permissions_module_key ON user_module_permissions(module_key);

-- Transações
CREATE TABLE IF NOT EXISTS transactions (
    id VARCHAR(255) PRIMARY KEY,
    date DATE NOT NULL,
    description TEXT,
    value DECIMAL(10,2) NOT NULL,
    type VARCHAR(50),
    category VARCHAR(255),
    subcategory VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_transactions_date ON transactions(date);
CREATE INDEX idx_transactions_category ON transactions(category);

-- Produtos
CREATE TABLE IF NOT EXISTS products (
    id VARCHAR(255) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    category VARCHAR(255),
    price DECIMAL(10,2),
    cost DECIMAL(10,2),
    stock INTEGER DEFAULT 0,
    sold INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Clientes
CREATE TABLE IF NOT EXISTS clients (
    id VARCHAR(255) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255),
    phone VARCHAR(50),
    company VARCHAR(255),
    address TEXT,
    city VARCHAR(255),
    state VARCHAR(50),
    zip_code VARCHAR(20),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_clients_email ON clients(email);
CREATE INDEX idx_clients_name ON clients(name);

-- Projetos
CREATE TABLE IF NOT EXISTS projects (
    id VARCHAR(255) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    client VARCHAR(255),
    status VARCHAR(50),
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_projects_status ON projects(status);
CREATE INDEX idx_projects_client ON projects(client);

-- Serviços
CREATE TABLE IF NOT EXISTS services (
    id VARCHAR(255) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    price DECIMAL(10,2),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Acompanhamentos
CREATE TABLE IF NOT EXISTS acompanhamentos (
    id VARCHAR(255) PRIMARY KEY,
    cod_imovel VARCHAR(255),
    imovel TEXT,
    municipio VARCHAR(255),
    mapa_url TEXT,
    matriculas TEXT,
    n_incra_ccir VARCHAR(255),
    car TEXT,
    car_url TEXT,
    status_car VARCHAR(100),
    itr TEXT,
    geo_certificacao VARCHAR(10),
    geo_registro VARCHAR(10),
    area_total DECIMAL(12,2) DEFAULT 0,
    reserva_legal DECIMAL(12,2) DEFAULT 0,
    cultura1 VARCHAR(255),
    area_cultura1 DECIMAL(12,2) DEFAULT 0,
    cultura2 VARCHAR(255),
    area_cultura2 DECIMAL(12,2) DEFAULT 0,
    outros VARCHAR(255),
    area_outros DECIMAL(12,2) DEFAULT 0,
    app_codigo_florestal DECIMAL(12,2) DEFAULT 0,
    app_vegetada DECIMAL(12,2) DEFAULT 0,
    app_nao_vegetada DECIMAL(12,2) DEFAULT 0,
    remanescente_florestal DECIMAL(12,2) DEFAULT 0,
    -- Mantidos por compatibilidade com versões anteriores da migração
    endereco TEXT,
    status VARCHAR(50),
    observacoes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_acompanhamentos_cod_imovel ON acompanhamentos(cod_imovel);

-- Share Links
CREATE TABLE IF NOT EXISTS share_links (
    token VARCHAR(255) PRIMARY KEY,
    name VARCHAR(255),
    password_hash VARCHAR(255),
    expires_at TIMESTAMP,
    selected_ids TEXT[],
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_share_links_token ON share_links(token);

-- Password reset tokens
CREATE TABLE IF NOT EXISTS password_reset_tokens (
    id VARCHAR(255) PRIMARY KEY,
    user_id VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token VARCHAR(255) UNIQUE NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    used BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    used_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_user_id ON password_reset_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_expires_at ON password_reset_tokens(expires_at);
CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_used ON password_reset_tokens(used);

-- Subcategorias
CREATE TABLE IF NOT EXISTS subcategories (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) UNIQUE NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_subcategories_name ON subcategories(name);

-- Tabelas de Projeção (Singleton)

-- Projeção principal
CREATE TABLE IF NOT EXISTS projection (
    id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    despesas_variaveis DECIMAL(10,2)[] DEFAULT ARRAY[0,0,0,0,0,0,0,0,0,0,0,0]::DECIMAL(10,2)[],
    despesas_fixas DECIMAL(10,2)[] DEFAULT ARRAY[0,0,0,0,0,0,0,0,0,0,0,0]::DECIMAL(10,2)[],
    investimentos DECIMAL(10,2)[] DEFAULT ARRAY[0,0,0,0,0,0,0,0,0,0,0,0]::DECIMAL(10,2)[],
    mkt DECIMAL(10,2)[] DEFAULT ARRAY[0,0,0,0,0,0,0,0,0,0,0,0]::DECIMAL(10,2)[],
    faturamento_reurb DECIMAL(10,2)[] DEFAULT ARRAY[0,0,0,0,0,0,0,0,0,0,0,0]::DECIMAL(10,2)[],
    faturamento_geo DECIMAL(10,2)[] DEFAULT ARRAY[0,0,0,0,0,0,0,0,0,0,0,0]::DECIMAL(10,2)[],
    faturamento_plan DECIMAL(10,2)[] DEFAULT ARRAY[0,0,0,0,0,0,0,0,0,0,0,0]::DECIMAL(10,2)[],
    faturamento_reg DECIMAL(10,2)[] DEFAULT ARRAY[0,0,0,0,0,0,0,0,0,0,0,0]::DECIMAL(10,2)[],
    faturamento_nn DECIMAL(10,2)[] DEFAULT ARRAY[0,0,0,0,0,0,0,0,0,0,0,0]::DECIMAL(10,2)[],
    mkt_components JSONB DEFAULT '{"trafego": [0,0,0,0,0,0,0,0,0,0,0,0], "socialMedia": [0,0,0,0,0,0,0,0,0,0,0,0], "producaoConteudo": [0,0,0,0,0,0,0,0,0,0,0,0]}'::JSONB,
    growth JSONB DEFAULT '{"minimo": 0, "medio": 0, "maximo": 0}'::JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_projection_mkt_components ON projection USING GIN (mkt_components);
CREATE INDEX idx_projection_growth ON projection USING GIN (growth);

-- Inserir registro inicial para projection
INSERT INTO projection (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- Despesas Fixas
CREATE TABLE IF NOT EXISTS fixed_expenses (
    id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    previsto DECIMAL(10,2)[] DEFAULT ARRAY[0,0,0,0,0,0,0,0,0,0,0,0]::DECIMAL(10,2)[],
    media DECIMAL(10,2)[] DEFAULT ARRAY[0,0,0,0,0,0,0,0,0,0,0,0]::DECIMAL(10,2)[],
    maximo DECIMAL(10,2)[] DEFAULT ARRAY[0,0,0,0,0,0,0,0,0,0,0,0]::DECIMAL(10,2)[],
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO fixed_expenses (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- Despesas Variáveis
CREATE TABLE IF NOT EXISTS variable_expenses (
    id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    previsto DECIMAL(10,2)[] DEFAULT ARRAY[0,0,0,0,0,0,0,0,0,0,0,0]::DECIMAL(10,2)[],
    medio DECIMAL(10,2)[] DEFAULT ARRAY[0,0,0,0,0,0,0,0,0,0,0,0]::DECIMAL(10,2)[],
    maximo DECIMAL(10,2)[] DEFAULT ARRAY[0,0,0,0,0,0,0,0,0,0,0,0]::DECIMAL(10,2)[],
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO variable_expenses (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- MKT
CREATE TABLE IF NOT EXISTS mkt (
    id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    previsto DECIMAL(10,2)[] DEFAULT ARRAY[0,0,0,0,0,0,0,0,0,0,0,0]::DECIMAL(10,2)[],
    medio DECIMAL(10,2)[] DEFAULT ARRAY[0,0,0,0,0,0,0,0,0,0,0,0]::DECIMAL(10,2)[],
    maximo DECIMAL(10,2)[] DEFAULT ARRAY[0,0,0,0,0,0,0,0,0,0,0,0]::DECIMAL(10,2)[],
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO mkt (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- Budget
CREATE TABLE IF NOT EXISTS budget (
    id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    previsto DECIMAL(10,2)[] DEFAULT ARRAY[0,0,0,0,0,0,0,0,0,0,0,0]::DECIMAL(10,2)[],
    medio DECIMAL(10,2)[] DEFAULT ARRAY[0,0,0,0,0,0,0,0,0,0,0,0]::DECIMAL(10,2)[],
    maximo DECIMAL(10,2)[] DEFAULT ARRAY[0,0,0,0,0,0,0,0,0,0,0,0]::DECIMAL(10,2)[],
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO budget (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- Investments
CREATE TABLE IF NOT EXISTS investments (
    id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    previsto DECIMAL(10,2)[] DEFAULT ARRAY[0,0,0,0,0,0,0,0,0,0,0,0]::DECIMAL(10,2)[],
    medio DECIMAL(10,2)[] DEFAULT ARRAY[0,0,0,0,0,0,0,0,0,0,0,0]::DECIMAL(10,2)[],
    maximo DECIMAL(10,2)[] DEFAULT ARRAY[0,0,0,0,0,0,0,0,0,0,0,0]::DECIMAL(10,2)[],
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO investments (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- Faturamento REURB
CREATE TABLE IF NOT EXISTS faturamento_reurb (
    id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    previsto DECIMAL(10,2)[] DEFAULT ARRAY[0,0,0,0,0,0,0,0,0,0,0,0]::DECIMAL(10,2)[],
    medio DECIMAL(10,2)[] DEFAULT ARRAY[0,0,0,0,0,0,0,0,0,0,0,0]::DECIMAL(10,2)[],
    maximo DECIMAL(10,2)[] DEFAULT ARRAY[0,0,0,0,0,0,0,0,0,0,0,0]::DECIMAL(10,2)[],
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO faturamento_reurb (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- Faturamento GEO
CREATE TABLE IF NOT EXISTS faturamento_geo (
    id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    previsto DECIMAL(10,2)[] DEFAULT ARRAY[0,0,0,0,0,0,0,0,0,0,0,0]::DECIMAL(10,2)[],
    medio DECIMAL(10,2)[] DEFAULT ARRAY[0,0,0,0,0,0,0,0,0,0,0,0]::DECIMAL(10,2)[],
    maximo DECIMAL(10,2)[] DEFAULT ARRAY[0,0,0,0,0,0,0,0,0,0,0,0]::DECIMAL(10,2)[],
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO faturamento_geo (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- Faturamento PLAN
CREATE TABLE IF NOT EXISTS faturamento_plan (
    id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    previsto DECIMAL(10,2)[] DEFAULT ARRAY[0,0,0,0,0,0,0,0,0,0,0,0]::DECIMAL(10,2)[],
    medio DECIMAL(10,2)[] DEFAULT ARRAY[0,0,0,0,0,0,0,0,0,0,0,0]::DECIMAL(10,2)[],
    maximo DECIMAL(10,2)[] DEFAULT ARRAY[0,0,0,0,0,0,0,0,0,0,0,0]::DECIMAL(10,2)[],
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO faturamento_plan (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- Faturamento REG
CREATE TABLE IF NOT EXISTS faturamento_reg (
    id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    previsto DECIMAL(10,2)[] DEFAULT ARRAY[0,0,0,0,0,0,0,0,0,0,0,0]::DECIMAL(10,2)[],
    medio DECIMAL(10,2)[] DEFAULT ARRAY[0,0,0,0,0,0,0,0,0,0,0,0]::DECIMAL(10,2)[],
    maximo DECIMAL(10,2)[] DEFAULT ARRAY[0,0,0,0,0,0,0,0,0,0,0,0]::DECIMAL(10,2)[],
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO faturamento_reg (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- Faturamento NN
CREATE TABLE IF NOT EXISTS faturamento_nn (
    id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    previsto DECIMAL(10,2)[] DEFAULT ARRAY[0,0,0,0,0,0,0,0,0,0,0,0]::DECIMAL(10,2)[],
    medio DECIMAL(10,2)[] DEFAULT ARRAY[0,0,0,0,0,0,0,0,0,0,0,0]::DECIMAL(10,2)[],
    maximo DECIMAL(10,2)[] DEFAULT ARRAY[0,0,0,0,0,0,0,0,0,0,0,0]::DECIMAL(10,2)[],
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO faturamento_nn (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- Faturamento Total
CREATE TABLE IF NOT EXISTS faturamento_total (
    id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    previsto DECIMAL(10,2)[] DEFAULT ARRAY[0,0,0,0,0,0,0,0,0,0,0,0]::DECIMAL(10,2)[],
    medio DECIMAL(10,2)[] DEFAULT ARRAY[0,0,0,0,0,0,0,0,0,0,0,0]::DECIMAL(10,2)[],
    maximo DECIMAL(10,2)[] DEFAULT ARRAY[0,0,0,0,0,0,0,0,0,0,0,0]::DECIMAL(10,2)[],
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO faturamento_total (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- Resultado
CREATE TABLE IF NOT EXISTS resultado (
    id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    previsto DECIMAL(10,2)[] DEFAULT ARRAY[0,0,0,0,0,0,0,0,0,0,0,0]::DECIMAL(10,2)[],
    medio DECIMAL(10,2)[] DEFAULT ARRAY[0,0,0,0,0,0,0,0,0,0,0,0]::DECIMAL(10,2)[],
    maximo DECIMAL(10,2)[] DEFAULT ARRAY[0,0,0,0,0,0,0,0,0,0,0,0]::DECIMAL(10,2)[],
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO resultado (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════════════
-- Tabelas de Segurança Avançada
-- ═══════════════════════════════════════════════════════════════════════════════

-- Audit Logs
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
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_timestamp ON audit_logs(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_operation ON audit_logs(operation);
CREATE INDEX IF NOT EXISTS idx_audit_logs_status ON audit_logs(status);
CREATE INDEX IF NOT EXISTS idx_audit_logs_details ON audit_logs USING gin(details);

CREATE OR REPLACE FUNCTION cleanup_old_audit_logs() RETURNS void AS $$
BEGIN
    DELETE FROM audit_logs WHERE timestamp < NOW() - INTERVAL '2 years';
END;
$$ LANGUAGE plpgsql;

-- Refresh Tokens
CREATE TABLE IF NOT EXISTS refresh_tokens (
    id SERIAL PRIMARY KEY,
    token VARCHAR(500) UNIQUE NOT NULL,
    user_id VARCHAR(255) NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    revoked BOOLEAN DEFAULT FALSE,
    revoked_at TIMESTAMPTZ,
    ip_address VARCHAR(45),
    user_agent TEXT,
    replaced_by_token VARCHAR(500),
    CONSTRAINT fk_refresh_token_user
        FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_refresh_tokens_token ON refresh_tokens(token);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user_id ON refresh_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_expires_at ON refresh_tokens(expires_at);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_revoked ON refresh_tokens(revoked);

CREATE OR REPLACE FUNCTION cleanup_expired_refresh_tokens() RETURNS void AS $$
BEGIN
    DELETE FROM refresh_tokens
    WHERE expires_at < NOW()
       OR (revoked = TRUE AND revoked_at < NOW() - INTERVAL '30 days');
END;
$$ LANGUAGE plpgsql;

-- Active Sessions
CREATE TABLE IF NOT EXISTS active_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id VARCHAR(50) NOT NULL,
    refresh_token_id INTEGER,
    ip_address VARCHAR(45) NOT NULL,
    user_agent TEXT NOT NULL,
    device_type VARCHAR(50),
    device_name VARCHAR(255),
    browser VARCHAR(100),
    os VARCHAR(100),
    country VARCHAR(100),
    city VARCHAR(255),
    latitude DECIMAL(10, 8),
    longitude DECIMAL(11, 8),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_activity_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    revoked_at TIMESTAMP,
    revoked_reason VARCHAR(255),
    CONSTRAINT fk_active_session_user
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_active_session_refresh_token
        FOREIGN KEY (refresh_token_id) REFERENCES refresh_tokens(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_active_sessions_user_id ON active_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_active_sessions_refresh_token_id ON active_sessions(refresh_token_id);
CREATE INDEX IF NOT EXISTS idx_active_sessions_ip_address ON active_sessions(ip_address);
CREATE INDEX IF NOT EXISTS idx_active_sessions_is_active ON active_sessions(is_active) WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS idx_active_sessions_expires_at ON active_sessions(expires_at);

CREATE OR REPLACE FUNCTION cleanup_expired_sessions() RETURNS void AS $$
BEGIN
    UPDATE active_sessions
    SET is_active = FALSE,
        revoked_at = CURRENT_TIMESTAMP,
        revoked_reason = 'Expirada automaticamente'
    WHERE is_active = TRUE
      AND expires_at < CURRENT_TIMESTAMP;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION update_session_last_activity() RETURNS TRIGGER AS $$
BEGIN
    NEW.last_activity_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_session_last_activity ON active_sessions;
CREATE TRIGGER trigger_update_session_last_activity
BEFORE UPDATE ON active_sessions
FOR EACH ROW EXECUTE FUNCTION update_session_last_activity();

-- Módulos de segurança no catálogo
INSERT INTO modules_catalog (module_key, module_name, is_active)
VALUES
    ('sessions',        'Sessões Ativas',       TRUE),
    ('anomalies',       'Anomalias',            TRUE),
    ('security_alerts', 'Alertas de Segurança', TRUE)
ON CONFLICT (module_key) DO NOTHING;

-- Atualizar constraint de role para incluir superadmin (para bancos existentes)
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check
    CHECK (role IN ('superadmin', 'admin', 'user', 'guest'));
