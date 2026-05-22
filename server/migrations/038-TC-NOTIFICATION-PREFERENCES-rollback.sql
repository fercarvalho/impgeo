BEGIN;
DROP INDEX IF EXISTS idx_tc_notification_preferences_lookup;
DROP INDEX IF EXISTS idx_tc_notification_preferences_user_id;
DROP TABLE IF EXISTS tc_notification_preferences;
COMMIT;
