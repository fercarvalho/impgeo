BEGIN;
DROP INDEX IF EXISTS idx_notification_preferences_lookup;
DROP INDEX IF EXISTS idx_notification_preferences_user_id;
DROP TABLE IF EXISTS notification_preferences;
COMMIT;
