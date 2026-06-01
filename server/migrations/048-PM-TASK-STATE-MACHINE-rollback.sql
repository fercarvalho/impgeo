-- ═══════════════════════════════════════════════════════════════════════════
-- 048-PM-TASK-STATE-MACHINE-rollback.sql
-- Reverte a 048. Backup antes:
--   pg_dump $DATABASE_URL_IMPGEO > backups/backup-rollback-048-$(date +%F).sql
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

DELETE FROM user_module_permissions WHERE module_key = 'tarefas_gerenciamento';
-- modules_catalog: o módulo será re-upsertado no próximo boot (getDefaultModulesCatalog
-- já o inclui). Removemos aqui para coerência do rollback isolado.
DELETE FROM modules_catalog WHERE module_key = 'tarefas_gerenciamento';

DROP TABLE IF EXISTS task_assignments_history CASCADE;

COMMIT;
