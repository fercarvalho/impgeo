-- ═══════════════════════════════════════════════════════════════════════════
-- 056-PM-TASK-TIME-TRACKING-rollback.sql
-- Reverte 056: remove os acumuladores de tempo por tarefa.
-- (actual_minutes NÃO é dropado — é coluna pré-existente da 047.)
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

ALTER TABLE project_tasks      DROP COLUMN IF EXISTS actual_seconds;
ALTER TABLE task_work_sessions DROP COLUMN IF EXISTS credited_seconds;

DO $$ BEGIN RAISE NOTICE 'Rollback 056-PM-TASK-TIME-TRACKING aplicado.'; END $$;

COMMIT;
