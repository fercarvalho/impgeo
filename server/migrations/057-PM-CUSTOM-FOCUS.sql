-- ═══════════════════════════════════════════════════════════════════════════
-- 057-PM-CUSTOM-FOCUS.sql
-- Permite foco/descanso PERSONALIZADOS no Pomodoro (além dos presets 25/50/100).
-- Relaxa os CHECKs que travavam planned_minutes/break_planned_minutes em valores
-- fixos e adiciona o modo 'POMODORO_CUSTOM'.
--
-- Idempotente, transacional, validador final.
-- Rollback: 057-PM-CUSTOM-FOCUS-rollback.sql
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- Remove os CHECKs antigos (nomes auto-gerados podem variar — descobre por definição).
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

-- Novos limites (faixas), permitindo valores livres dentro de um intervalo são.
ALTER TABLE task_work_sessions ADD CONSTRAINT chk_tws_planned CHECK (planned_minutes BETWEEN 1 AND 240);
ALTER TABLE task_work_sessions ADD CONSTRAINT chk_tws_break   CHECK (break_planned_minutes BETWEEN 1 AND 60);
ALTER TABLE task_work_sessions ADD CONSTRAINT chk_tws_mode    CHECK (pomodoro_mode IN ('POMODORO_25_5','POMODORO_50_10','POMODORO_100_20','POMODORO_CUSTOM'));

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='chk_tws_planned') THEN
    RAISE EXCEPTION 'Migration 057 incompleta: chk_tws_planned ausente';
  END IF;
  RAISE NOTICE 'Migration 057-PM-CUSTOM-FOCUS aplicada com sucesso.';
END $$;

COMMIT;
