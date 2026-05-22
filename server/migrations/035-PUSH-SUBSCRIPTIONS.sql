-- =============================================================================
-- 035 — push_subscriptions: subscriptions de Web Push pra impgeo users
-- =============================================================================
-- Cada linha = (user × dispositivo × origin). Um user pode ter N subscriptions
-- ativas (multi-device: desktop + celular instalado como PWA; admin acessando
-- de impgeo OU admin.terracontrol, etc.).
--
-- Campos:
--   - endpoint       : URL única do push service (FCM/Mozilla/WebKit).
--                      É a chave natural — UNIQUE garante idempotência: mesmo
--                      dispositivo re-subscribendo apenas atualiza last_seen_at.
--   - p256dh / auth  : chaves de criptografia da subscription (vêm do browser).
--   - app_id         : origin (impgeo | tc-public | tc-admin). Mesma user pode
--                      ter subscriptions em origins diferentes, cada uma com
--                      VAPID/escopo próprio.
--   - user_agent     : pra UI listar "iPhone Safari", "Chrome Windows", etc.
--   - last_seen_at   : atualizado a cada send bem-sucedido + a cada subscribe
--                      do mesmo endpoint. Permite limpeza de subs zumbis.
--   - failed_count   : incrementado em erros transitórios; ao chegar em 5
--                      a sub é removida (configurável no dispatcher).
--
-- Em erros 410/404 do push service, a sub é removida IMEDIATAMENTE
-- (subscription expirada, não tem retry possível).
--
-- IDEMPOTENTE.
-- =============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS push_subscriptions (
    id                  VARCHAR(255) PRIMARY KEY,
    user_id             VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    endpoint            TEXT         NOT NULL UNIQUE,
    p256dh              TEXT         NOT NULL,
    auth                TEXT         NOT NULL,
    app_id              VARCHAR(20)  NOT NULL,
    user_agent          TEXT,
    failed_count        INTEGER      NOT NULL DEFAULT 0,
    created_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    last_seen_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    CONSTRAINT push_subscriptions_app_id_check
        CHECK (app_id IN ('impgeo', 'tc-public', 'tc-admin'))
);

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user_id
    ON push_subscriptions(user_id);

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_last_seen
    ON push_subscriptions(last_seen_at DESC);

COMMIT;
