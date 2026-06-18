-- ═══════════════════════════════════════════════════════════════════════════
-- 060-PM-DUE-DATE-REQUESTS-rollback.sql
-- Reverte 060: remove a tabela de pedidos de alteração de prazo.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

DROP TABLE IF EXISTS task_due_date_requests;

DO $$ BEGIN RAISE NOTICE 'Rollback 060-PM-DUE-DATE-REQUESTS aplicado.'; END $$;

COMMIT;
