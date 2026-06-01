-- ═══════════════════════════════════════════════════════════════════════════
-- 049-PM-POMODORO-rollback.sql
-- Reverte a 049. Backup antes:
--   pg_dump $DATABASE_URL_IMPGEO > backups/backup-rollback-049-$(date +%F).sql
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

DELETE FROM user_module_permissions WHERE module_key = 'pomodoro_gerenciamento';
DELETE FROM modules_catalog WHERE module_key = 'pomodoro_gerenciamento';

DROP TRIGGER IF EXISTS trg_seed_pomodoro_config ON users;
DROP FUNCTION IF EXISTS pm_seed_pomodoro_config();

DROP TABLE IF EXISTS task_idle_tracking    CASCADE;
DROP TABLE IF EXISTS pomodoro_events       CASCADE;
DROP TABLE IF EXISTS task_work_sessions    CASCADE;
DROP TABLE IF EXISTS pomodoro_daily_stats  CASCADE;
DROP TABLE IF EXISTS user_pomodoro_config  CASCADE;

COMMIT;
