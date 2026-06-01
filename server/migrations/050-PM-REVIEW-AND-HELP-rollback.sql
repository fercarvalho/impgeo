-- ═══════════════════════════════════════════════════════════════════════════
-- 050-PM-REVIEW-AND-HELP-rollback.sql
-- Reverte a 050. Backup antes:
--   pg_dump $DATABASE_URL_IMPGEO > backups/backup-rollback-050-$(date +%F).sql
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

DROP TABLE IF EXISTS task_help_requests CASCADE;
DROP TABLE IF EXISTS task_attachments   CASCADE;

ALTER TABLE project_tasks DROP CONSTRAINT IF EXISTS chk_ptask_review_decision;
ALTER TABLE project_tasks DROP COLUMN IF EXISTS adjustment_notes;
ALTER TABLE project_tasks DROP COLUMN IF EXISTS review_decision;
ALTER TABLE project_tasks DROP COLUMN IF EXISTS review_decided_at;
ALTER TABLE project_tasks DROP COLUMN IF EXISTS submitted_for_review_at;

COMMIT;
