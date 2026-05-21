DROP INDEX IF EXISTS idx_users_tc_email_notifications;
ALTER TABLE users DROP COLUMN IF EXISTS tc_email_notifications;
