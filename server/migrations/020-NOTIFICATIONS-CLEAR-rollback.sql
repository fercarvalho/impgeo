-- Rollback Migration 020
BEGIN;

DROP INDEX IF EXISTS idx_notifications_user_cleared;
ALTER TABLE notifications
    DROP COLUMN IF EXISTS cleared,
    DROP COLUMN IF EXISTS cleared_at;

DO $$
BEGIN
    RAISE NOTICE 'Rollback 020 concluído';
END $$;

COMMIT;
