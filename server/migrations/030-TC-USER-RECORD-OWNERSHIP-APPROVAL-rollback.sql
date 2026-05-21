-- Rollback de 030-TC-USER-RECORD-OWNERSHIP-APPROVAL.sql
BEGIN;

ALTER TABLE tc_users
  DROP CONSTRAINT IF EXISTS chk_delete_records_permission,
  DROP CONSTRAINT IF EXISTS chk_edit_records_permission;

ALTER TABLE tc_users
  DROP COLUMN IF EXISTS delete_records_permission,
  DROP COLUMN IF EXISTS edit_records_permission;

DROP INDEX IF EXISTS idx_terracontrol_created_by_user;
DROP INDEX IF EXISTS idx_terracontrol_created_by_tc_user;
DROP INDEX IF EXISTS idx_terracontrol_approved;

ALTER TABLE terracontrol
  DROP COLUMN IF EXISTS approved_by_user_id,
  DROP COLUMN IF EXISTS approved_at,
  DROP COLUMN IF EXISTS approved,
  DROP COLUMN IF EXISTS created_by_tc_user_id,
  DROP COLUMN IF EXISTS created_by_user_id;

COMMIT;
