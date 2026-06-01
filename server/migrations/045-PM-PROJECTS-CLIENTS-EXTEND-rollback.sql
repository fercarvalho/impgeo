-- ═══════════════════════════════════════════════════════════════════════════
-- 045-PM-PROJECTS-CLIENTS-EXTEND-rollback.sql
-- Reverte a migration 045. Use só em DB de teste ou pré-deploy.
-- ATENÇÃO: drop de project_events apaga TODA auditoria PM. Backup antes:
--   pg_dump $DATABASE_URL_IMPGEO > backups/backup-rollback-045-$(date +%F).sql
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ─── 5. project_events ────────────────────────────────────────────────────────
DROP TABLE IF EXISTS project_events CASCADE;

-- ─── 4. terracontrol: links reversos ──────────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'terracontrol') THEN
    ALTER TABLE terracontrol DROP CONSTRAINT IF EXISTS fk_terracontrol_project_id;
    DROP INDEX IF EXISTS idx_terracontrol_project_id;
    ALTER TABLE terracontrol DROP COLUMN IF EXISTS project_id;

    ALTER TABLE terracontrol DROP CONSTRAINT IF EXISTS fk_terracontrol_client_id;
    DROP INDEX IF EXISTS idx_terracontrol_client_id;
    ALTER TABLE terracontrol DROP COLUMN IF EXISTS client_id;
  END IF;
END $$;

-- ─── 3. transactions: project_id ──────────────────────────────────────────────
ALTER TABLE transactions DROP CONSTRAINT IF EXISTS fk_transactions_project_id;
DROP INDEX IF EXISTS idx_transactions_project_id;
ALTER TABLE transactions DROP COLUMN IF EXISTS project_id;

-- ─── 2. projects: FKs + CHECKs + indexes + cols ───────────────────────────────
ALTER TABLE projects DROP CONSTRAINT IF EXISTS fk_projects_client_id;
ALTER TABLE projects DROP CONSTRAINT IF EXISTS fk_projects_service_id;
ALTER TABLE projects DROP CONSTRAINT IF EXISTS fk_projects_terracontrol_id;
ALTER TABLE projects DROP CONSTRAINT IF EXISTS fk_projects_budget_id;
ALTER TABLE projects DROP CONSTRAINT IF EXISTS fk_projects_manager_user_id;
ALTER TABLE projects DROP CONSTRAINT IF EXISTS chk_projects_status;
ALTER TABLE projects DROP CONSTRAINT IF EXISTS chk_projects_source;

DROP INDEX IF EXISTS uq_projects_terracontrol_id;
DROP INDEX IF EXISTS idx_projects_client_id;
DROP INDEX IF EXISTS idx_projects_service_id;
DROP INDEX IF EXISTS idx_projects_manager_user_id;
DROP INDEX IF EXISTS idx_projects_due_date;

-- profit_cents é GENERATED; dropar primeiro (não dá pra dropar referenciadas dela mas é segura como expressão)
ALTER TABLE projects DROP COLUMN IF EXISTS profit_cents;
ALTER TABLE projects DROP COLUMN IF EXISTS metadata;
ALTER TABLE projects DROP COLUMN IF EXISTS auto_finalize;
ALTER TABLE projects DROP COLUMN IF EXISTS progress_pct;
ALTER TABLE projects DROP COLUMN IF EXISTS expenses_cents;
ALTER TABLE projects DROP COLUMN IF EXISTS paid_cents;
ALTER TABLE projects DROP COLUMN IF EXISTS total_cents;
ALTER TABLE projects DROP COLUMN IF EXISTS canceled_at;
ALTER TABLE projects DROP COLUMN IF EXISTS completed_at;
ALTER TABLE projects DROP COLUMN IF EXISTS started_at;
ALTER TABLE projects DROP COLUMN IF EXISTS due_date;
ALTER TABLE projects DROP COLUMN IF EXISTS start_date;
ALTER TABLE projects DROP COLUMN IF EXISTS priority;
ALTER TABLE projects DROP COLUMN IF EXISTS manager_user_id;
ALTER TABLE projects DROP COLUMN IF EXISTS source;
ALTER TABLE projects DROP COLUMN IF EXISTS budget_id;
ALTER TABLE projects DROP COLUMN IF EXISTS terracontrol_id;
ALTER TABLE projects DROP COLUMN IF EXISTS service_id;
ALTER TABLE projects DROP COLUMN IF EXISTS client_id;

-- ─── 1. clients: FKs + CHECKs + indexes + cols ────────────────────────────────
ALTER TABLE clients DROP CONSTRAINT IF EXISTS fk_clients_tc_user_id;
ALTER TABLE clients DROP CONSTRAINT IF EXISTS fk_clients_merged_into;
ALTER TABLE clients DROP CONSTRAINT IF EXISTS chk_clients_source;

DROP INDEX IF EXISTS uq_clients_tc_user_id;
DROP INDEX IF EXISTS uq_clients_cpf;
DROP INDEX IF EXISTS uq_clients_cnpj;
DROP INDEX IF EXISTS idx_clients_source;

ALTER TABLE clients DROP COLUMN IF EXISTS merged_into_client_id;
ALTER TABLE clients DROP COLUMN IF EXISTS source;
ALTER TABLE clients DROP COLUMN IF EXISTS cnpj;
ALTER TABLE clients DROP COLUMN IF EXISTS cpf;
ALTER TABLE clients DROP COLUMN IF EXISTS tc_user_id;

COMMIT;
