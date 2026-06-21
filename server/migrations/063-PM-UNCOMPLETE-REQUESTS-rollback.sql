-- ═══════════════════════════════════════════════════════════════════════════
-- 063-PM-UNCOMPLETE-REQUESTS-rollback.sql
-- Reverte 063: remove a tabela de pedidos de reabertura de tarefa.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

DROP TABLE IF EXISTS task_uncomplete_requests;

DO $$ BEGIN RAISE NOTICE 'Rollback 063-PM-UNCOMPLETE-REQUESTS aplicado.'; END $$;

COMMIT;
