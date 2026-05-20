BEGIN;
DROP INDEX IF EXISTS idx_tc_users_can_share;
ALTER TABLE tc_users DROP COLUMN IF EXISTS can_share;
COMMIT;
