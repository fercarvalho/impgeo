-- ═══════════════════════════════════════════════════════════════════════════
-- 067-PM-DUE-DATE-NEGOTIATION.sql
-- Negociação de prazo: além de aprovar/recusar, o decisor pode PROPOR/FORÇAR
-- uma nova data; ao propor, vira contraproposta (status 'countered') e volta
-- para o solicitante aceitar/recusar/contrapropor. Justificativa do decisor
-- (decision_note) explica recusa/proposta.
--
-- Idempotente, transacional, validador final.
-- Rollback: 067-PM-DUE-DATE-NEGOTIATION-rollback.sql
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

ALTER TABLE task_due_date_requests DROP CONSTRAINT IF EXISTS task_due_date_requests_status_check;
ALTER TABLE task_due_date_requests
  ADD CONSTRAINT task_due_date_requests_status_check CHECK (status IN ('pending','countered','approved','rejected'));

ALTER TABLE task_due_date_requests ADD COLUMN IF NOT EXISTS decision_note TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_name='task_due_date_requests' AND column_name='decision_note'
  ) THEN
    RAISE EXCEPTION 'Migration 067 incompleta: decision_note ausente';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.check_constraints
     WHERE constraint_name='task_due_date_requests_status_check' AND check_clause ILIKE '%countered%'
  ) THEN
    RAISE EXCEPTION 'Migration 067 incompleta: status countered não liberado';
  END IF;
  RAISE NOTICE 'Migration 067-PM-DUE-DATE-NEGOTIATION aplicada com sucesso.';
END $$;

COMMIT;
