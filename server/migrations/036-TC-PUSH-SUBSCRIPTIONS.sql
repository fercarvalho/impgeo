-- =============================================================================
-- 036 — tc_push_subscriptions: subscriptions de Web Push pra tc_users
-- =============================================================================
-- Espelha push_subscriptions (035), trocando FK pra tc_users(id). Mesma
-- semântica de campos, mesmas regras de cleanup.
--
-- Na prática, app_id de tc_users será quase sempre 'tc-public' — mas mantemos
-- o mesmo enum dos 3 origins por simetria com push_subscriptions e pra cobrir
-- cenários futuros (admin tc multi-tenant, etc.).
--
-- IDEMPOTENTE.
-- =============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS tc_push_subscriptions (
    id                  VARCHAR(255) PRIMARY KEY,
    tc_user_id          VARCHAR(255) NOT NULL REFERENCES tc_users(id) ON DELETE CASCADE,
    endpoint            TEXT         NOT NULL UNIQUE,
    p256dh              TEXT         NOT NULL,
    auth                TEXT         NOT NULL,
    app_id              VARCHAR(20)  NOT NULL,
    user_agent          TEXT,
    failed_count        INTEGER      NOT NULL DEFAULT 0,
    created_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    last_seen_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    CONSTRAINT tc_push_subscriptions_app_id_check
        CHECK (app_id IN ('impgeo', 'tc-public', 'tc-admin'))
);

CREATE INDEX IF NOT EXISTS idx_tc_push_subscriptions_user_id
    ON tc_push_subscriptions(tc_user_id);

CREATE INDEX IF NOT EXISTS idx_tc_push_subscriptions_last_seen
    ON tc_push_subscriptions(last_seen_at DESC);

COMMIT;
