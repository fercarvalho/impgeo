-- ═══════════════════════════════════════════════════════════════════════════
-- 059-PM-BREAK-ACCUMULATION-rollback.sql
-- Reverte 059. Volta o CHECK da pausa a 1..60 (limpa sessões com pausa acumulada
-- > 60 antes, senão o ADD falha) e remove os acumuladores.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

ALTER TABLE user_pomodoro_config DROP COLUMN IF EXISTS carryover_break_minutes;
ALTER TABLE user_pomodoro_config DROP COLUMN IF EXISTS focus_since_break_minutes;

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT conname FROM pg_constraint
     WHERE conrelid = 'task_work_sessions'::regclass AND contype = 'c'
       AND pg_get_constraintdef(oid) ~* 'break_planned_minutes'
  LOOP
    EXECUTE format('ALTER TABLE task_work_sessions DROP CONSTRAINT %I', r.conname);
  END LOOP;
END $$;
ALTER TABLE task_work_sessions ADD CONSTRAINT chk_tws_break CHECK (break_planned_minutes BETWEEN 1 AND 60);

DO $$ BEGIN RAISE NOTICE 'Rollback 059-PM-BREAK-ACCUMULATION aplicado.'; END $$;

COMMIT;
