-- ═══════════════════════════════════════════════════════════════════════════
-- 057-PM-CUSTOM-FOCUS-rollback.sql
-- Reverte 057: volta aos CHECKs fixos (25/50/100). ATENÇÃO: se já existirem
-- sessões com valores custom, o ADD dos CHECKs fixos falha — limpe-as antes
-- ou mantenha a 057 aplicada.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT conname FROM pg_constraint
     WHERE conrelid = 'task_work_sessions'::regclass AND contype = 'c'
       AND pg_get_constraintdef(oid) ~* '(planned_minutes|break_planned_minutes|pomodoro_mode)'
  LOOP
    EXECUTE format('ALTER TABLE task_work_sessions DROP CONSTRAINT %I', r.conname);
  END LOOP;
END $$;

ALTER TABLE task_work_sessions ADD CONSTRAINT task_work_sessions_planned_minutes_check       CHECK (planned_minutes IN (25,50,100));
ALTER TABLE task_work_sessions ADD CONSTRAINT task_work_sessions_break_planned_minutes_check CHECK (break_planned_minutes IN (5,10,20));
ALTER TABLE task_work_sessions ADD CONSTRAINT task_work_sessions_pomodoro_mode_check         CHECK (pomodoro_mode IN ('POMODORO_25_5','POMODORO_50_10','POMODORO_100_20'));

DO $$ BEGIN RAISE NOTICE 'Rollback 057-PM-CUSTOM-FOCUS aplicado.'; END $$;

COMMIT;
