-- Rollback de 027-CAN-MANAGE-TC-USERS.sql
BEGIN;
DROP INDEX IF EXISTS idx_users_can_manage_tc_users;
ALTER TABLE users DROP COLUMN IF EXISTS can_manage_tc_users;
COMMIT;
