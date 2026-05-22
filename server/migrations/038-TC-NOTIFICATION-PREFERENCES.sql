-- =============================================================================
-- 038 — tc_notification_preferences: prefs unificadas pra tc_users
-- =============================================================================
-- Espelha notification_preferences (037), trocando FK pra tc_users(id).
-- A flag 034 (tc_users.email_notifications) é migrada pra cá pela migration
-- 039 e mantida em dual-write durante a transição.
--
-- IDEMPOTENTE.
-- =============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS tc_notification_preferences (
    id                  VARCHAR(255) PRIMARY KEY,
    tc_user_id          VARCHAR(255) NOT NULL REFERENCES tc_users(id) ON DELETE CASCADE,
    notification_type   VARCHAR(64)  NOT NULL,
    channel             VARCHAR(16)  NOT NULL,
    enabled             BOOLEAN      NOT NULL,
    updated_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    CONSTRAINT tc_notification_preferences_channel_check
        CHECK (channel IN ('push', 'email')),
    CONSTRAINT tc_notification_preferences_unique_pref
        UNIQUE (tc_user_id, notification_type, channel)
);

CREATE INDEX IF NOT EXISTS idx_tc_notification_preferences_user_id
    ON tc_notification_preferences(tc_user_id);

CREATE INDEX IF NOT EXISTS idx_tc_notification_preferences_lookup
    ON tc_notification_preferences(tc_user_id, notification_type, channel);

COMMIT;
