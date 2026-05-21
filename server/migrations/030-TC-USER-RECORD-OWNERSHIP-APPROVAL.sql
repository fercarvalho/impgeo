-- =============================================================================
-- 030 — Ownership + Approval em terracontrol + permissões em tc_users
-- =============================================================================
-- 1. terracontrol ganha:
--    - created_by_user_id     (FK users.id, nullable)
--    - created_by_tc_user_id  (FK tc_users.id, nullable)
--    - approved               (boolean, DEFAULT TRUE para retrocompat dos existentes)
--    - approved_at            (timestamptz)
--    - approved_by_user_id    (FK users.id, nullable)
--
-- 2. tc_users ganha:
--    - edit_records_permission   ('none'|'created'|'assigned'|'all', DEFAULT 'all')
--    - delete_records_permission ('none'|'created'|'all',            DEFAULT 'none')
--
-- Todos os registros TerraControl existentes ficam approved=TRUE (default).
-- Todos os tc_users existentes herdam edit='all' / delete='none' (defaults).
--
-- IDEMPOTENTE.
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- terracontrol
-- ---------------------------------------------------------------------------
ALTER TABLE terracontrol
  ADD COLUMN IF NOT EXISTS created_by_user_id     VARCHAR(255) REFERENCES users(id)    ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS created_by_tc_user_id  VARCHAR(255) REFERENCES tc_users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS approved               BOOLEAN      NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS approved_at            TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS approved_by_user_id    VARCHAR(255) REFERENCES users(id) ON DELETE SET NULL;

-- Backfill: registros existentes (approved=TRUE por default) ganham approved_at
-- igual a updated_at (ou created_at, ou NOW se ambos NULL).
UPDATE terracontrol
   SET approved_at = COALESCE(approved_at, updated_at, created_at, NOW())
 WHERE approved = TRUE AND approved_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_terracontrol_approved
  ON terracontrol(approved) WHERE approved = FALSE;
CREATE INDEX IF NOT EXISTS idx_terracontrol_created_by_tc_user
  ON terracontrol(created_by_tc_user_id);
CREATE INDEX IF NOT EXISTS idx_terracontrol_created_by_user
  ON terracontrol(created_by_user_id);

-- ---------------------------------------------------------------------------
-- tc_users
-- ---------------------------------------------------------------------------
ALTER TABLE tc_users
  ADD COLUMN IF NOT EXISTS edit_records_permission   VARCHAR(20) NOT NULL DEFAULT 'all',
  ADD COLUMN IF NOT EXISTS delete_records_permission VARCHAR(20) NOT NULL DEFAULT 'none';

-- Constraints de valor permitido (idempotente via DO block; ADD CONSTRAINT direto
-- não tem IF NOT EXISTS antes do Postgres 16)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'chk_edit_records_permission' AND conrelid = 'tc_users'::regclass
  ) THEN
    ALTER TABLE tc_users
      ADD CONSTRAINT chk_edit_records_permission
        CHECK (edit_records_permission IN ('none','created','assigned','all'));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'chk_delete_records_permission' AND conrelid = 'tc_users'::regclass
  ) THEN
    ALTER TABLE tc_users
      ADD CONSTRAINT chk_delete_records_permission
        CHECK (delete_records_permission IN ('none','created','all'));
  END IF;
END $$;

DO $$
DECLARE
  approved_count   INTEGER;
  tcuser_count     INTEGER;
BEGIN
  SELECT COUNT(*) INTO approved_count FROM terracontrol WHERE approved = TRUE;
  SELECT COUNT(*) INTO tcuser_count   FROM tc_users WHERE edit_records_permission = 'all';
  RAISE NOTICE 'Migration 030 OK: % registros terracontrol aprovados, % tc_users com edit=all default',
    approved_count, tcuser_count;
END $$;

COMMIT;
