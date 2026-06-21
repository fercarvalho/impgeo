-- ═══════════════════════════════════════════════════════════════════════════
-- 061-PM-REVIEW-SUBMITTER.sql
-- Revisão por papel de quem concluiu (req item 1, pós-cenário 10):
--   - admin/superadmin conclui  → sem revisão (vai direto a 'completed').
--   - manager conclui c/ review  → só admin/superadmin revisa.
--   - usuário conclui c/ review  → manager OU admin/superadmin revisa.
--
-- Para gatear a revisão pelo papel de QUEM enviou, guardamos o autor do envio.
--
-- Idempotente, transacional, validador final.
-- Rollback: 061-PM-REVIEW-SUBMITTER-rollback.sql
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

ALTER TABLE project_tasks
  ADD COLUMN IF NOT EXISTS submitted_for_review_by_user_id VARCHAR(255);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_name='project_tasks' AND column_name='submitted_for_review_by_user_id'
  ) THEN
    RAISE EXCEPTION 'Migration 061 incompleta: coluna submitted_for_review_by_user_id ausente';
  END IF;
  RAISE NOTICE 'Migration 061-PM-REVIEW-SUBMITTER aplicada com sucesso.';
END $$;

COMMIT;
