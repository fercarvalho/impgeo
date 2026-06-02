-- ═══════════════════════════════════════════════════════════════════════════
-- 056-PM-TASK-TIME-TRACKING.sql
-- Tempo real gasto por tarefa, para medir produtividade. Cada Stop/pausa/
-- conclusão/abort de uma sessão Pomodoro credita o tempo ATIVO trabalhado na
-- tarefa (project_tasks.actual_seconds), sem dupla contagem.
--
--   project_tasks.actual_seconds      — acumulador preciso (segundos)
--   project_tasks.actual_minutes      — já existia; passa a ser derivado (min)
--   task_work_sessions.credited_seconds — quanto do tempo ativo da sessão JÁ foi
--                                         creditado na tarefa (evita recontar ao
--                                         pausar→retomar→concluir a mesma sessão)
--
-- Idempotente, transacional, validador final.
-- Rollback: 056-PM-TASK-TIME-TRACKING-rollback.sql
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

ALTER TABLE project_tasks      ADD COLUMN IF NOT EXISTS actual_seconds   BIGINT DEFAULT 0;
ALTER TABLE task_work_sessions ADD COLUMN IF NOT EXISTS credited_seconds BIGINT DEFAULT 0;

-- Normaliza nulos.
UPDATE project_tasks      SET actual_seconds   = 0 WHERE actual_seconds   IS NULL;
UPDATE task_work_sessions SET credited_seconds = 0 WHERE credited_seconds IS NULL;

-- Backfill: sessões já encerradas (completed/aborted) creditam seu tempo ativo
-- às tarefas, marcando-as como já creditadas. Sessões vivas serão creditadas em runtime.
WITH agg AS (
  SELECT task_id, SUM(COALESCE(total_active_seconds,0)) AS secs
    FROM task_work_sessions
   WHERE task_id IS NOT NULL
     AND state IN ('completed','aborted')
     AND COALESCE(credited_seconds,0) = 0
   GROUP BY task_id
)
UPDATE project_tasks t
   SET actual_seconds = COALESCE(t.actual_seconds,0) + agg.secs,
       actual_minutes = ROUND((COALESCE(t.actual_seconds,0) + agg.secs) / 60.0),
       updated_at = NOW()
  FROM agg
 WHERE t.id = agg.task_id;

UPDATE task_work_sessions
   SET credited_seconds = COALESCE(total_active_seconds,0)
 WHERE task_id IS NOT NULL
   AND state IN ('completed','aborted')
   AND COALESCE(credited_seconds,0) = 0;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='project_tasks' AND column_name='actual_seconds') THEN
    RAISE EXCEPTION 'Migration 056 incompleta: project_tasks.actual_seconds ausente';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='task_work_sessions' AND column_name='credited_seconds') THEN
    RAISE EXCEPTION 'Migration 056 incompleta: task_work_sessions.credited_seconds ausente';
  END IF;
  RAISE NOTICE 'Migration 056-PM-TASK-TIME-TRACKING aplicada com sucesso.';
END $$;

COMMIT;
