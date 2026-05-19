-- =============================================================================
-- 024 — SHARE LINK ACCESS LOGS (auditoria de acesso público ao TerraControl)
-- =============================================================================
-- Cria tabela para registrar cada acesso aos endpoints públicos do TerraControl
-- (compartilhamento por link). Necessário para LGPD/compliance e investigação
-- de brute force ou vazamento.
--
-- Eventos registrados:
--   - 'view'                  → tentativa de carregar /api/terracontrol/public/:token
--   - 'password_check'        → tentativa de validar senha
--   - 'document_download'     → download de PDF via share link autorizado
--
-- Status:
--   - 'success'         → acesso autorizado e dados retornados
--   - 'password_required' → link tem senha e não foi fornecida
--   - 'password_invalid'  → senha incorreta
--   - 'expired'           → link expirado
--   - 'not_found'         → token inexistente ou link revogado
--
-- IDEMPOTENTE: usa CREATE TABLE IF NOT EXISTS.
-- =============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS share_link_access_logs (
    id           BIGSERIAL    PRIMARY KEY,
    token        VARCHAR(255) NOT NULL,
    action       VARCHAR(50)  NOT NULL,
    status       VARCHAR(50)  NOT NULL,
    ip           VARCHAR(64),
    user_agent   TEXT,
    -- Quando action='document_download', guarda o nome do arquivo solicitado
    -- (sem o prefixo /api/documents/) para auditoria fina.
    document     VARCHAR(255),
    accessed_at  TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Índices para consultas comuns: por token (auditoria), por timestamp (rotação)
CREATE INDEX IF NOT EXISTS idx_share_link_access_logs_token
    ON share_link_access_logs(token);

CREATE INDEX IF NOT EXISTS idx_share_link_access_logs_accessed_at
    ON share_link_access_logs(accessed_at DESC);

-- Índice composto para identificar rapidamente tentativas falhadas por IP
CREATE INDEX IF NOT EXISTS idx_share_link_access_logs_ip_status
    ON share_link_access_logs(ip, status, accessed_at DESC);

DO $$
BEGIN
    RAISE NOTICE 'Migration 024 OK: tabela share_link_access_logs criada';
END $$;

COMMIT;
