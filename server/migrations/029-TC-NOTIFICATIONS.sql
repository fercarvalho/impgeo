-- =============================================================================
-- 029 — tc_notifications: sistema de notificações pra tc_users
-- =============================================================================
-- Espelha a tabela `notifications` do impgeo (migrations 018 + 020) mas com
-- FK pra `tc_users(id)` em vez de `users(id)`. Mesmas semânticas:
--   - is_read / read_at  : status de leitura
--   - cleared / cleared_at : esconde do sininho mas mantém no banco
--   - notification_type  : usado pra rotear cliques (futuro)
--   - related_entity_*   : referência opcional pra entidade afetada
--
-- Notificações in-app exibidas no sininho do TcHeader. Disparos:
-- (futuro) admin avisa o tc_user de novidades, novo registro acessível,
-- expiração de senha temporária, etc.
--
-- IDEMPOTENTE.
-- =============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS tc_notifications (
    id                  VARCHAR(255) PRIMARY KEY,
    tc_user_id          VARCHAR(255) NOT NULL REFERENCES tc_users(id) ON DELETE CASCADE,
    notification_type   VARCHAR(50)  NOT NULL,
    title               VARCHAR(255) NOT NULL,
    message             TEXT,
    related_entity_type VARCHAR(50),
    related_entity_id   VARCHAR(255),
    is_read             BOOLEAN      NOT NULL DEFAULT FALSE,
    read_at             TIMESTAMPTZ,
    cleared             BOOLEAN      NOT NULL DEFAULT FALSE,
    cleared_at          TIMESTAMPTZ,
    created_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tc_notifications_user_id
    ON tc_notifications(tc_user_id);

CREATE INDEX IF NOT EXISTS idx_tc_notifications_unread
    ON tc_notifications(tc_user_id, is_read)
    WHERE is_read = FALSE;

CREATE INDEX IF NOT EXISTS idx_tc_notifications_type
    ON tc_notifications(notification_type);

CREATE INDEX IF NOT EXISTS idx_tc_notifications_entity
    ON tc_notifications(related_entity_type, related_entity_id);

CREATE INDEX IF NOT EXISTS idx_tc_notifications_created_at
    ON tc_notifications(created_at DESC);

COMMIT;
