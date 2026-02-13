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
    role VARCHAR(50) NOT NULL CHECK (role IN ('admin', 'user', 'guest')),
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
