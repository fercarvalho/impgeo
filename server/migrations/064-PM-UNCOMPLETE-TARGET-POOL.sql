-- ═══════════════════════════════════════════════════════════════════════════
-- 064-PM-UNCOMPLETE-TARGET-POOL.sql
-- Adiciona o destino 'pool' à reabertura de tarefas: além de 'self' (capturar)
-- e 'original' (devolver a quem concluiu), permite deixar a tarefa DISPONÍVEL
-- (sem responsável) para qualquer um pegar.
--
-- Idempotente, transacional, validador final.
-- Rollback: 064-PM-UNCOMPLETE-TARGET-POOL-rollback.sql
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

ALTER TABLE task_uncomplete_requests DROP CONSTRAINT IF EXISTS task_uncomplete_requests_target_check;
ALTER TABLE task_uncomplete_requests
  ADD CONSTRAINT task_uncomplete_requests_target_check CHECK (target IN ('self','original','pool'));

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.check_constraints
     WHERE constraint_name = 'task_uncomplete_requests_target_check'
       AND check_clause ILIKE '%pool%'
  ) THEN
    RAISE EXCEPTION 'Migration 064 incompleta: CHECK do target não inclui pool';
  END IF;
  RAISE NOTICE 'Migration 064-PM-UNCOMPLETE-TARGET-POOL aplicada com sucesso.';
END $$;

COMMIT;
