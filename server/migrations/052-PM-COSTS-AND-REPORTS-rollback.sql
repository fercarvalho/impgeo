-- ═══════════════════════════════════════════════════════════════════════════
-- 052-PM-COSTS-AND-REPORTS-rollback.sql
-- Reverte a 052. Backup antes:
--   pg_dump $DATABASE_URL_IMPGEO > backups/backup-rollback-052-$(date +%F).sql
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

DELETE FROM user_module_permissions WHERE module_key = 'relatorios_tarefas_gerenciamento';
DELETE FROM modules_catalog WHERE module_key = 'relatorios_tarefas_gerenciamento';

DROP VIEW IF EXISTS pm_overdue_summary_v;
DROP VIEW IF EXISTS pm_project_health_v;

DROP TRIGGER IF EXISTS trg_pm_tasks_progress ON project_tasks;
DROP TRIGGER IF EXISTS trg_pm_transactions_cost ON transactions;
DROP FUNCTION IF EXISTS pm_tasks_progress_trigger();
DROP FUNCTION IF EXISTS pm_transactions_cost_trigger();
DROP FUNCTION IF EXISTS pm_project_progress_recalc(VARCHAR);
DROP FUNCTION IF EXISTS pm_recalc_project_expenses(VARCHAR);

COMMIT;
