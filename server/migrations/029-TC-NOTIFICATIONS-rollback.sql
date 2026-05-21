BEGIN;
DROP INDEX IF EXISTS idx_tc_notifications_created_at;
DROP INDEX IF EXISTS idx_tc_notifications_entity;
DROP INDEX IF EXISTS idx_tc_notifications_type;
DROP INDEX IF EXISTS idx_tc_notifications_unread;
DROP INDEX IF EXISTS idx_tc_notifications_user_id;
DROP TABLE IF EXISTS tc_notifications;
COMMIT;
