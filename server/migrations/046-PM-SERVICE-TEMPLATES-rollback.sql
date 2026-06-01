-- ═══════════════════════════════════════════════════════════════════════════
-- 046-PM-SERVICE-TEMPLATES-rollback.sql
-- Reverte a migration 046. Use só em DB de teste ou pré-deploy.
-- ATENÇÃO: apaga todos os templates de serviço + o serviço de sistema TC.
-- Backup antes:
--   pg_dump $DATABASE_URL_IMPGEO > backups/backup-rollback-046-$(date +%F).sql
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- Remove seed TC (CASCADE limpa stages/tasks/deps/triggers via FK).
DELETE FROM services WHERE id = 'svc_terracontrol_default';

-- Drop tabelas (ordem reversa de dependência).
DROP TABLE IF EXISTS service_template_task_triggers CASCADE;
DROP TABLE IF EXISTS service_template_task_deps      CASCADE;
DROP TABLE IF EXISTS service_template_tasks          CASCADE;
DROP TABLE IF EXISTS service_template_stages         CASCADE;

-- Reverte colunas em services.
ALTER TABLE services DROP COLUMN IF EXISTS default_duration_days;
ALTER TABLE services DROP COLUMN IF EXISTS default_priority;
ALTER TABLE services DROP COLUMN IF EXISTS is_system;
ALTER TABLE services DROP COLUMN IF EXISTS is_template_enabled;

COMMIT;
