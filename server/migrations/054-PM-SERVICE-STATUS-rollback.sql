-- ═══════════════════════════════════════════════════════════════════════════
-- 054-PM-SERVICE-STATUS-rollback.sql
-- Reverte a 054.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

ALTER TABLE services DROP CONSTRAINT IF EXISTS chk_services_status;
DROP INDEX IF EXISTS idx_services_status;
ALTER TABLE services DROP COLUMN IF EXISTS status;

COMMIT;
