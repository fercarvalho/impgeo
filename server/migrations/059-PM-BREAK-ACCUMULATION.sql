-- ═══════════════════════════════════════════════════════════════════════════
-- 059-PM-BREAK-ACCUMULATION.sql
-- Novo modelo de "pular pausa": pular NÃO aumenta o foco — ACUMULA o intervalo.
-- O próximo intervalo soma os pulados. Só dá pra pular enquanto o foco acumulado
-- (desde a última pausa) for < 100 min; daí a pausa é obrigatória.
--
--   user_pomodoro_config.carryover_break_minutes   — soma dos intervalos pulados
--   user_pomodoro_config.focus_since_break_minutes — foco acumulado desde a última pausa
--   task_work_sessions.break_planned_minutes        — CHECK relaxado (a pausa pode somar > 60)
--
-- Idempotente, transacional, validador final.
-- Rollback: 059-PM-BREAK-ACCUMULATION-rollback.sql
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

ALTER TABLE user_pomodoro_config ADD COLUMN IF NOT EXISTS carryover_break_minutes   SMALLINT NOT NULL DEFAULT 0;
ALTER TABLE user_pomodoro_config ADD COLUMN IF NOT EXISTS focus_since_break_minutes SMALLINT NOT NULL DEFAULT 0;

-- Zera resíduo do modelo antigo (foco forçado) — não é mais usado.
UPDATE user_pomodoro_config SET next_cycle_forced_minutes = NULL WHERE next_cycle_forced_minutes IS NOT NULL;

-- A pausa pode acumular acima de 60 min (soma dos pulados) → relaxa o CHECK.
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
ALTER TABLE task_work_sessions ADD CONSTRAINT chk_tws_break CHECK (break_planned_minutes BETWEEN 1 AND 1000);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='user_pomodoro_config' AND column_name='carryover_break_minutes') THEN
    RAISE EXCEPTION 'Migration 059 incompleta: carryover_break_minutes ausente';
  END IF;
  RAISE NOTICE 'Migration 059-PM-BREAK-ACCUMULATION aplicada com sucesso.';
END $$;

COMMIT;
