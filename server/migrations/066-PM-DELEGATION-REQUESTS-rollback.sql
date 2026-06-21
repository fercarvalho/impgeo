-- ═══════════════════════════════════════════════════════════════════════════
-- 066-PM-DELEGATION-REQUESTS-rollback.sql
-- Reverte 066: remove a tabela de pedidos de delegação.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

DROP TABLE IF EXISTS task_delegation_requests;

DO $$ BEGIN RAISE NOTICE 'Rollback 066-PM-DELEGATION-REQUESTS aplicado.'; END $$;

COMMIT;
