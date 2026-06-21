-- ═══════════════════════════════════════════════════════════════════════════
-- 065-PM-GOALS-rollback.sql
-- Reverte 065: remove a tabela de metas.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

DROP TABLE IF EXISTS pm_goals;

DO $$ BEGIN RAISE NOTICE 'Rollback 065-PM-GOALS aplicado.'; END $$;

COMMIT;
