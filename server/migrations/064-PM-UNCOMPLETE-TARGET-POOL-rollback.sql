-- ═══════════════════════════════════════════════════════════════════════════
-- 064-PM-UNCOMPLETE-TARGET-POOL-rollback.sql
-- Reverte 064: volta o CHECK do target para ('self','original').
-- ATENÇÃO: falha se existirem pedidos com target='pool' (ajuste antes).
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

ALTER TABLE task_uncomplete_requests DROP CONSTRAINT IF EXISTS task_uncomplete_requests_target_check;
ALTER TABLE task_uncomplete_requests
  ADD CONSTRAINT task_uncomplete_requests_target_check CHECK (target IN ('self','original'));

DO $$ BEGIN RAISE NOTICE 'Rollback 064-PM-UNCOMPLETE-TARGET-POOL aplicado.'; END $$;

COMMIT;
