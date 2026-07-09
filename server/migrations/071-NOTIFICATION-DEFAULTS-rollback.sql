-- Rollback da 071-NOTIFICATION-DEFAULTS.sql
-- Remove a tabela de defaults. O código volta a usar o FACTORY_DEFAULTS
-- (fallback), sem perder comportamento. Backup antes:
--   pg_dump $DATABASE_URL_IMPGEO > backups/backup-rollback-071-$(date +%F).sql
BEGIN;
DROP TABLE IF EXISTS notification_defaults;
COMMIT;
