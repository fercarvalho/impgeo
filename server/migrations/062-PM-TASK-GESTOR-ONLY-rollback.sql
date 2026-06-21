-- ═══════════════════════════════════════════════════════════════════════════
-- 062-PM-TASK-GESTOR-ONLY-rollback.sql
-- Reverte 062: remove a flag gestor_only do template e da instância.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

ALTER TABLE service_template_tasks DROP COLUMN IF EXISTS gestor_only;
ALTER TABLE project_tasks DROP COLUMN IF EXISTS gestor_only;

DO $$ BEGIN RAISE NOTICE 'Rollback 062-PM-TASK-GESTOR-ONLY aplicado.'; END $$;

COMMIT;
