-- ═══════════════════════════════════════════════════════════════════════════════
-- Migration 009: Tabelas de Segurança
-- ═══════════════════════════════════════════════════════════════════════════════
--
-- Cria tabelas de segurança e autenticação avançada para o sistema Impgeo.
-- Execute após as migrations existentes.
--
-- Tabelas criadas (nesta ordem):
--   1. audit_logs      — logs de auditoria de operações de segurança
--   2. refresh_tokens  — tokens JWT de longa duração com rotação
--   3. active_sessions — sessões ativas por dispositivo com geolocalização
--
-- ═══════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ═══════════════════════════════════════════════════════════════════════════════
-- 1. AUDIT LOGS
-- ═══════════════════════════════════════════════════════════════════════════════

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
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_details ON audit_logs USING gin(details);

COMMENT ON TABLE audit_logs IS 'Registros de auditoria de segurança do sistema';
COMMENT ON COLUMN audit_logs.operation IS 'Tipo de operação: login, logout, create, update, delete, etc.';
COMMENT ON COLUMN audit_logs.user_id IS 'ID do usuário que realizou a operação (NULL para operações anônimas)';
COMMENT ON COLUMN audit_logs.ip_address IS 'Endereço IP de origem da requisição';
COMMENT ON COLUMN audit_logs.details IS 'Detalhes adicionais da operação em formato JSON';
COMMENT ON COLUMN audit_logs.status IS 'Status da operação: success, failure, blocked';

-- Função de limpeza automática (política de retenção: 2 anos)
CREATE OR REPLACE FUNCTION cleanup_old_audit_logs() RETURNS void AS $$
BEGIN
    DELETE FROM audit_logs WHERE timestamp < NOW() - INTERVAL '2 years';
END;
$$ LANGUAGE plpgsql;

-- ═══════════════════════════════════════════════════════════════════════════════
-- 2. REFRESH TOKENS
-- ═══════════════════════════════════════════════════════════════════════════════

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
        FOREIGN KEY(user_id)
        REFERENCES users(id)
        ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_refresh_tokens_token ON refresh_tokens(token);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user_id ON refresh_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_expires_at ON refresh_tokens(expires_at);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_revoked ON refresh_tokens(revoked);

COMMENT ON TABLE refresh_tokens IS 'Tokens de longa duração para renovação de access tokens JWT';
COMMENT ON COLUMN refresh_tokens.token IS 'Hash do refresh token (SHA-256)';
COMMENT ON COLUMN refresh_tokens.revoked IS 'Token foi revogado (logout ou comprometimento)';
COMMENT ON COLUMN refresh_tokens.replaced_by_token IS 'Token que substituiu este (rotação)';

CREATE OR REPLACE FUNCTION cleanup_expired_refresh_tokens() RETURNS void AS $$
BEGIN
    DELETE FROM refresh_tokens
    WHERE expires_at < NOW()
       OR (revoked = TRUE AND revoked_at < NOW() - INTERVAL '30 days');
END;
$$ LANGUAGE plpgsql;

-- ═══════════════════════════════════════════════════════════════════════════════
-- 3. ACTIVE SESSIONS
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS active_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id VARCHAR(50) NOT NULL,
    refresh_token_id INTEGER,

    -- Informações do dispositivo
    ip_address VARCHAR(45) NOT NULL,
    user_agent TEXT NOT NULL,
    device_type VARCHAR(50),
    device_name VARCHAR(255),
    browser VARCHAR(100),
    os VARCHAR(100),

    -- Geolocalização (via IP)
    country VARCHAR(100),
    city VARCHAR(255),
    latitude DECIMAL(10, 8),
    longitude DECIMAL(11, 8),

    -- Timestamps
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_activity_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP NOT NULL,

    -- Status
    is_active BOOLEAN DEFAULT TRUE,
    revoked_at TIMESTAMP,
    revoked_reason VARCHAR(255),

    CONSTRAINT fk_active_session_user
        FOREIGN KEY (user_id)
        REFERENCES users(id)
        ON DELETE CASCADE,

    CONSTRAINT fk_active_session_refresh_token
        FOREIGN KEY (refresh_token_id)
        REFERENCES refresh_tokens(id)
        ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_active_sessions_user_id ON active_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_active_sessions_refresh_token_id ON active_sessions(refresh_token_id);
CREATE INDEX IF NOT EXISTS idx_active_sessions_ip_address ON active_sessions(ip_address);
CREATE INDEX IF NOT EXISTS idx_active_sessions_is_active ON active_sessions(is_active) WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS idx_active_sessions_expires_at ON active_sessions(expires_at);

CREATE OR REPLACE FUNCTION cleanup_expired_sessions()
RETURNS void AS $$
BEGIN
    UPDATE active_sessions
    SET is_active = FALSE,
        revoked_at = CURRENT_TIMESTAMP,
        revoked_reason = 'Expirada automaticamente'
    WHERE is_active = TRUE
      AND expires_at < CURRENT_TIMESTAMP;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION update_session_last_activity()
RETURNS TRIGGER AS $$
BEGIN
    NEW.last_activity_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_session_last_activity ON active_sessions;
CREATE TRIGGER trigger_update_session_last_activity
BEFORE UPDATE ON active_sessions
FOR EACH ROW
EXECUTE FUNCTION update_session_last_activity();

-- ═══════════════════════════════════════════════════════════════════════════════
-- 4. NOVOS MÓDULOS DE SEGURANÇA (modules_catalog)
-- ═══════════════════════════════════════════════════════════════════════════════

INSERT INTO modules_catalog (key, name, description, is_system, is_active)
VALUES
    ('sessions',        'Sessões Ativas',    'Gerenciamento de sessões ativas por dispositivo', TRUE, TRUE),
    ('anomalies',       'Anomalias',         'Dashboard de detecção de anomalias de segurança', TRUE, TRUE),
    ('security_alerts', 'Alertas de Segurança', 'Portal de alertas e notificações de segurança', TRUE, TRUE)
ON CONFLICT (key) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════════════
-- 5. ROLE SUPERADMIN
-- ═══════════════════════════════════════════════════════════════════════════════

ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check
    CHECK (role IN ('superadmin', 'admin', 'user', 'guest'));

COMMIT;
