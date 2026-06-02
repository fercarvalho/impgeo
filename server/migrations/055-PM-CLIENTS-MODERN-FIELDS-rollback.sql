-- ═══════════════════════════════════════════════════════════════════════════
-- 055-PM-CLIENTS-MODERN-FIELDS-rollback.sql
-- Reverte a 055. Backup antes:
--   pg_dump $DATABASE_URL_IMPGEO > backups/backup-rollback-055-$(date +%F).sql
-- Converte address JSONB de volta para TEXT (serializando o objeto).
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

DO $$
DECLARE coltype TEXT;
BEGIN
  SELECT data_type INTO coltype FROM information_schema.columns
   WHERE table_name='clients' AND column_name='address';
  IF coltype = 'jsonb' THEN
    ALTER TABLE clients
      ALTER COLUMN address TYPE text USING (
        CASE WHEN address IS NULL THEN NULL ELSE address::text END
      );
  END IF;
END $$;

ALTER TABLE clients DROP COLUMN IF EXISTS last_name;
ALTER TABLE clients DROP COLUMN IF EXISTS first_name;

COMMIT;
