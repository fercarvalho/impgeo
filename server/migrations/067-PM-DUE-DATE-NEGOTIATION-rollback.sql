-- ═══════════════════════════════════════════════════════════════════════════
-- 067-PM-DUE-DATE-NEGOTIATION-rollback.sql
-- Reverte 067: volta o CHECK de status p/ (pending,approved,rejected) e remove
-- decision_note. ATENÇÃO: falha se houver pedidos com status 'countered'.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

ALTER TABLE task_due_date_requests DROP CONSTRAINT IF EXISTS task_due_date_requests_status_check;
ALTER TABLE task_due_date_requests
  ADD CONSTRAINT task_due_date_requests_status_check CHECK (status IN ('pending','approved','rejected'));
ALTER TABLE task_due_date_requests DROP COLUMN IF EXISTS decision_note;

DO $$ BEGIN RAISE NOTICE 'Rollback 067-PM-DUE-DATE-NEGOTIATION aplicado.'; END $$;

COMMIT;
