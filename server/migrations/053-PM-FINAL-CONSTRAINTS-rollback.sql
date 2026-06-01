-- ═══════════════════════════════════════════════════════════════════════════
-- 053-PM-FINAL-CONSTRAINTS-rollback.sql
-- Reverte a 053 (apenas índices). Sem perda de dados.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

DROP INDEX IF EXISTS idx_project_tasks_due_active;
DROP INDEX IF EXISTS idx_projects_manager_status;
DROP INDEX IF EXISTS idx_projects_metadata_gin;
DROP INDEX IF EXISTS idx_project_stages_snapshot_gin;
DROP INDEX IF EXISTS idx_project_tasks_review_queue;

COMMIT;
