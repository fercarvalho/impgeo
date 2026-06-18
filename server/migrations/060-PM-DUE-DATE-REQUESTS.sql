-- ═══════════════════════════════════════════════════════════════════════════
-- 060-PM-DUE-DATE-REQUESTS.sql
-- Trava de alteração de prazo: usuário comum e manager pedem aprovação para
-- alterar o prazo de uma tarefa; admin/superadmin alteram direto.
--   - pedido de usuário  → aprova: manager do projeto OU admin/superadmin
--   - pedido de manager  → aprova: só admin/superadmin
--
-- 1 pedido pendente por tarefa.
--
-- Idempotente, transacional, validador final.
-- Rollback: 060-PM-DUE-DATE-REQUESTS-rollback.sql
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

CREATE TABLE IF NOT EXISTS task_due_date_requests (
  id                   VARCHAR(255) PRIMARY KEY,
  task_id              VARCHAR(255) NOT NULL REFERENCES project_tasks(id) ON DELETE CASCADE,
  project_id           VARCHAR(255) REFERENCES projects(id) ON DELETE CASCADE,
  requested_by_user_id VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  requester_role       VARCHAR(16),                 -- snapshot: 'user' | 'manager'
  current_due_date     DATE,                        -- prazo atual (referência)
  requested_due_date   DATE,                        -- novo prazo (NULL = pedir p/ limpar)
  justification        TEXT,
  status               VARCHAR(12) NOT NULL DEFAULT 'pending'
                         CHECK (status IN ('pending','approved','rejected')),
  decided_by_user_id   VARCHAR(255) REFERENCES users(id) ON DELETE SET NULL,
  decided_at           TIMESTAMPTZ,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- No máximo 1 pedido pendente por tarefa.
CREATE UNIQUE INDEX IF NOT EXISTS uq_due_req_task_pending ON task_due_date_requests(task_id) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_due_req_pending ON task_due_date_requests(status) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_due_req_project ON task_due_date_requests(project_id);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='task_due_date_requests') THEN
    RAISE EXCEPTION 'Migration 060 incompleta: task_due_date_requests ausente';
  END IF;
  RAISE NOTICE 'Migration 060-PM-DUE-DATE-REQUESTS aplicada com sucesso.';
END $$;

COMMIT;
