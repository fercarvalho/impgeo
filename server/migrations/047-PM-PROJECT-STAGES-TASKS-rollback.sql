-- ═══════════════════════════════════════════════════════════════════════════
-- 047-PM-PROJECT-STAGES-TASKS-rollback.sql
-- Reverte a 047. Backup antes:
--   pg_dump $DATABASE_URL_IMPGEO > backups/backup-rollback-047-$(date +%F).sql
-- ATENÇÃO: NÃO reverte a tradução de status (047 seção 0). Reverter o CHECK
-- pra inglês reintroduziria o bug da 045; deixamos o status em português.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

DROP TABLE IF EXISTS task_events           CASCADE;
DROP TABLE IF EXISTS project_task_triggers CASCADE;
DROP TABLE IF EXISTS project_task_deps     CASCADE;
DROP TABLE IF EXISTS project_tasks         CASCADE;
DROP TABLE IF EXISTS project_stages        CASCADE;

-- Mantém projects.status em português (correção da seção 0 NÃO é revertida de
-- propósito — o CHECK inglês da 045 estava errado).

COMMIT;
