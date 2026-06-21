-- ═══════════════════════════════════════════════════════════════════════════
-- 063-PM-UNCOMPLETE-REQUESTS.sql
-- "Desconcluir" tarefa (req item 5, pós-cenário 10):
--   - usuário comum  → desconclui só a tarefa que ele concluiu (volta pra ele).
--   - admin/superadmin → desconclui qualquer (direto); escolhe capturar p/ si
--     ou devolver a quem concluiu.
--   - manager → desconclui nos projetos dele, mas precisa de APROVAÇÃO de admin
--     antes de a tarefa reabrir (esta tabela guarda o pedido pendente).
--
-- target: 'self' (capturar) | 'original' (devolver a quem concluiu).
-- 1 pedido pendente por tarefa.
--
-- Idempotente, transacional, validador final.
-- Rollback: 063-PM-UNCOMPLETE-REQUESTS-rollback.sql
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

CREATE TABLE IF NOT EXISTS task_uncomplete_requests (
  id                        VARCHAR(255) PRIMARY KEY,
  task_id                   VARCHAR(255) NOT NULL REFERENCES project_tasks(id) ON DELETE CASCADE,
  project_id                VARCHAR(255) REFERENCES projects(id) ON DELETE CASCADE,
  requested_by_user_id      VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  requester_role            VARCHAR(16),                 -- snapshot do papel
  reason                    TEXT NOT NULL,
  target                    VARCHAR(12) NOT NULL DEFAULT 'original'
                              CHECK (target IN ('self','original')),
  original_completer_user_id VARCHAR(255) REFERENCES users(id) ON DELETE SET NULL,
  status                    VARCHAR(12) NOT NULL DEFAULT 'pending'
                              CHECK (status IN ('pending','approved','rejected')),
  decided_by_user_id        VARCHAR(255) REFERENCES users(id) ON DELETE SET NULL,
  decided_at                TIMESTAMPTZ,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- No máximo 1 pedido pendente por tarefa.
CREATE UNIQUE INDEX IF NOT EXISTS uq_uncomplete_task_pending ON task_uncomplete_requests(task_id) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_uncomplete_pending ON task_uncomplete_requests(status) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_uncomplete_project ON task_uncomplete_requests(project_id);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='task_uncomplete_requests') THEN
    RAISE EXCEPTION 'Migration 063 incompleta: task_uncomplete_requests ausente';
  END IF;
  RAISE NOTICE 'Migration 063-PM-UNCOMPLETE-REQUESTS aplicada com sucesso.';
END $$;

COMMIT;
