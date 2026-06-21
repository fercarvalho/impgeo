-- ═══════════════════════════════════════════════════════════════════════════
-- 061-PM-REVIEW-SUBMITTER-rollback.sql
-- Reverte 061: remove a coluna de autor do envio para revisão.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

ALTER TABLE project_tasks DROP COLUMN IF EXISTS submitted_for_review_by_user_id;

DO $$ BEGIN RAISE NOTICE 'Rollback 061-PM-REVIEW-SUBMITTER aplicado.'; END $$;

COMMIT;
