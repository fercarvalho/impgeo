-- ═══════════════════════════════════════════════════════════════════════════
-- 051-PM-NOTIFICATIONS-AND-REPORTS-rollback.sql
-- Reverte a 051. Backup antes:
--   pg_dump $DATABASE_URL_IMPGEO > backups/backup-rollback-051-$(date +%F).sql
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

DROP TABLE IF EXISTS pm_report_jobs CASCADE;
ALTER TABLE users DROP COLUMN IF EXISTS pm_report_frequencies;
ALTER TABLE users DROP COLUMN IF EXISTS pm_email_reports;

COMMIT;
