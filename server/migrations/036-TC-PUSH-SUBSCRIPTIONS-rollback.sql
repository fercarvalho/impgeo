BEGIN;
DROP INDEX IF EXISTS idx_tc_push_subscriptions_last_seen;
DROP INDEX IF EXISTS idx_tc_push_subscriptions_user_id;
DROP TABLE IF EXISTS tc_push_subscriptions;
COMMIT;
