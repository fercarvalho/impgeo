-- =============================================================================
-- 025 — TC_USERS: sistema de usuários externos do TerraControl
-- =============================================================================
-- Cria a infraestrutura de "tc_users": usuários externos que vão acessar a
-- view pública do TerraControl com login/senha próprios (em vez do esquema
-- antigo de share_links anônimos com senha).
--
-- Tabelas criadas:
--   - tc_users                      (perfil, credenciais)
--   - tc_user_record_access         (permissão granular por terracontrol_id)
--   - tc_refresh_tokens             (rotação de sessões)
--   - tc_password_reset_tokens      (reset por email)
--   - tc_email_verifications        (esqueleto fase 2: confirmação 7 dias)
--   - tc_legacy_aliases             (URL antiga /v/<token> redireciona p/ login)
--
-- Modificações em tabelas existentes:
--   - share_links: +created_by_user_id, +created_by_tc_user_id
--   - share_link_access_logs: +tc_user_id (auditoria)
--
-- IDEMPOTENTE: CREATE TABLE IF NOT EXISTS, ADD COLUMN IF NOT EXISTS.
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. tc_users — usuário externo
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tc_users (
    id                       VARCHAR(255) PRIMARY KEY,
    username                 VARCHAR(255) UNIQUE NOT NULL,
    password                 VARCHAR(255) NOT NULL,
    first_name               VARCHAR(255),
    last_name                VARCHAR(255),
    email                    VARCHAR(255),
    email_verified_at        TIMESTAMPTZ,
    phone                    VARCHAR(50),
    cpf                      VARCHAR(20),
    birth_date               DATE,
    gender                   VARCHAR(50),
    address                  JSONB,
    photo_url                TEXT,
    -- Tc_users migrados começam com TRUE; tc_users criados pelo admin
    -- ganham senha temporária e também recebem TRUE.
    force_password_change    BOOLEAN NOT NULL DEFAULT FALSE,
    is_active                BOOLEAN NOT NULL DEFAULT TRUE,
    -- 'direct': criado pelo admin impgeo com senha temporária.
    -- 'invite': criado pelo admin impgeo apenas com email (fluxo de convite, fase 2).
    -- 'migrated': criado pela migration 026 a partir de share_links antigos.
    created_via              VARCHAR(20) NOT NULL DEFAULT 'direct',
    created_by_user_id       VARCHAR(255) REFERENCES users(id) ON DELETE SET NULL,
    last_login               TIMESTAMPTZ,
    created_at               TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at               TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Email único quando preenchido (NULL permitido na fase 1; obrigatório na fase 2).
CREATE UNIQUE INDEX IF NOT EXISTS idx_tc_users_email_unique
    ON tc_users(LOWER(email)) WHERE email IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tc_users_username  ON tc_users(username);
CREATE INDEX IF NOT EXISTS idx_tc_users_is_active ON tc_users(is_active);

-- ---------------------------------------------------------------------------
-- 2. tc_user_record_access — permissão granular por registro
-- ---------------------------------------------------------------------------
-- Substitui o antigo `share_links.selected_ids TEXT[]`. Agora cada tc_user
-- tem N linhas, uma por terracontrol_id que pode ver. Permite revogação
-- granular e ON DELETE CASCADE automático quando registro/user é apagado.
CREATE TABLE IF NOT EXISTS tc_user_record_access (
    id                  BIGSERIAL PRIMARY KEY,
    tc_user_id          VARCHAR(255) NOT NULL REFERENCES tc_users(id)    ON DELETE CASCADE,
    terracontrol_id     VARCHAR(255) NOT NULL REFERENCES terracontrol(id) ON DELETE CASCADE,
    granted_by_user_id  VARCHAR(255) REFERENCES users(id) ON DELETE SET NULL,
    created_at          TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(tc_user_id, terracontrol_id)
);
CREATE INDEX IF NOT EXISTS idx_tc_user_record_access_tc_user ON tc_user_record_access(tc_user_id);
CREATE INDEX IF NOT EXISTS idx_tc_user_record_access_record  ON tc_user_record_access(terracontrol_id);

-- ---------------------------------------------------------------------------
-- 3. tc_refresh_tokens — rotação de sessão
-- ---------------------------------------------------------------------------
-- Schema espelho de refresh_tokens do impgeo, mas com FK separada e
-- token_hash (SHA256) em vez de plain (mais seguro: rotação sem armazenar
-- o token literal).
CREATE TABLE IF NOT EXISTS tc_refresh_tokens (
    id                BIGSERIAL PRIMARY KEY,
    tc_user_id        VARCHAR(255) NOT NULL REFERENCES tc_users(id) ON DELETE CASCADE,
    token_hash        VARCHAR(128) NOT NULL UNIQUE,
    expires_at        TIMESTAMPTZ NOT NULL,
    revoked           BOOLEAN NOT NULL DEFAULT FALSE,
    revoked_at        TIMESTAMPTZ,
    replaced_by       VARCHAR(128),
    ip                VARCHAR(64),
    user_agent        TEXT,
    created_at        TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_tc_refresh_tokens_user ON tc_refresh_tokens(tc_user_id);
CREATE INDEX IF NOT EXISTS idx_tc_refresh_tokens_hash ON tc_refresh_tokens(token_hash);

-- ---------------------------------------------------------------------------
-- 4. tc_password_reset_tokens — reset por email
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tc_password_reset_tokens (
    id          VARCHAR(255) PRIMARY KEY,
    tc_user_id  VARCHAR(255) NOT NULL REFERENCES tc_users(id) ON DELETE CASCADE,
    token       VARCHAR(255) NOT NULL UNIQUE,
    expires_at  TIMESTAMPTZ NOT NULL,
    used        BOOLEAN DEFAULT FALSE,
    used_at     TIMESTAMPTZ,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_tc_password_reset_tokens_user ON tc_password_reset_tokens(tc_user_id);

-- ---------------------------------------------------------------------------
-- 5. tc_email_verifications — confirmação de email (esqueleto fase 2)
-- ---------------------------------------------------------------------------
-- Schema pronto, mas fluxo de envio de email + bloqueio após 7 dias é da fase 2.
CREATE TABLE IF NOT EXISTS tc_email_verifications (
    id          VARCHAR(255) PRIMARY KEY,
    tc_user_id  VARCHAR(255) NOT NULL REFERENCES tc_users(id) ON DELETE CASCADE,
    email       VARCHAR(255) NOT NULL,
    token       VARCHAR(255) NOT NULL UNIQUE,
    expires_at  TIMESTAMPTZ NOT NULL,
    verified_at TIMESTAMPTZ,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_tc_email_verifications_user ON tc_email_verifications(tc_user_id);

-- ---------------------------------------------------------------------------
-- 6. tc_legacy_aliases — URL antiga /v/<token> redireciona p/ tc_user
-- ---------------------------------------------------------------------------
-- Migration 026 popula esta tabela com 1 linha por share_link migrado.
-- Endpoint GET /v/:token consulta aqui ANTES de cair no fluxo antigo
-- de share_link (que ainda existe para sub-shares criados por tc_users).
CREATE TABLE IF NOT EXISTS tc_legacy_aliases (
    share_link_token  VARCHAR(255) PRIMARY KEY,
    tc_user_id        VARCHAR(255) NOT NULL REFERENCES tc_users(id) ON DELETE CASCADE,
    redirect_used_at  TIMESTAMPTZ,
    created_at        TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_tc_legacy_aliases_tc_user ON tc_legacy_aliases(tc_user_id);

-- ---------------------------------------------------------------------------
-- 7. share_links — registrar quem criou (admin impgeo OU tc_user)
-- ---------------------------------------------------------------------------
ALTER TABLE share_links
    ADD COLUMN IF NOT EXISTS created_by_user_id    VARCHAR(255) REFERENCES users(id)    ON DELETE SET NULL;
ALTER TABLE share_links
    ADD COLUMN IF NOT EXISTS created_by_tc_user_id VARCHAR(255) REFERENCES tc_users(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_share_links_created_by_tc_user ON share_links(created_by_tc_user_id);

-- ---------------------------------------------------------------------------
-- 8. share_link_access_logs — auditoria também de tc_users
-- ---------------------------------------------------------------------------
ALTER TABLE share_link_access_logs
    ADD COLUMN IF NOT EXISTS tc_user_id VARCHAR(255) REFERENCES tc_users(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_share_link_access_logs_tc_user ON share_link_access_logs(tc_user_id);

-- ---------------------------------------------------------------------------
-- Validação final
-- ---------------------------------------------------------------------------
DO $$
DECLARE
    expected_tables TEXT[] := ARRAY[
        'tc_users', 'tc_user_record_access', 'tc_refresh_tokens',
        'tc_password_reset_tokens', 'tc_email_verifications', 'tc_legacy_aliases'
    ];
    t TEXT;
BEGIN
    FOREACH t IN ARRAY expected_tables
    LOOP
        IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = t) THEN
            RAISE EXCEPTION 'Tabela % não foi criada', t;
        END IF;
    END LOOP;
    RAISE NOTICE 'Migration 025 OK: 6 tabelas tc_* criadas + 2 colunas em share_links + 1 em share_link_access_logs';
END $$;

COMMIT;
