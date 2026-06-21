-- ═══════════════════════════════════════════════════════════════════════════
-- 066-PM-DELEGATION-REQUESTS.sql
-- Trava de delegação: quando um MANAGER que NÃO é o dono do projeto delega uma
-- tarefa para um usuário comum, vira um pedido pendente que um admin/superadmin
-- precisa aprovar antes de a tarefa ir de fato para o usuário.
--
-- 1 pedido pendente por tarefa.
--
-- Idempotente, transacional, validador final.
-- Rollback: 066-PM-DELEGATION-REQUESTS-rollback.sql
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

CREATE TABLE IF NOT EXISTS task_delegation_requests (
  id                   VARCHAR(255) PRIMARY KEY,
  task_id              VARCHAR(255) NOT NULL REFERENCES project_tasks(id) ON DELETE CASCADE,
  project_id           VARCHAR(255) REFERENCES projects(id) ON DELETE CASCADE,
  requested_by_user_id VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,  -- o manager
  to_user_id           VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,  -- usuário comum
  due_date             DATE,
  status               VARCHAR(12) NOT NULL DEFAULT 'pending'
                         CHECK (status IN ('pending','approved','rejected')),
  decided_by_user_id   VARCHAR(255) REFERENCES users(id) ON DELETE SET NULL,
  decided_at           TIMESTAMPTZ,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_deleg_req_task_pending ON task_delegation_requests(task_id) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_deleg_req_pending ON task_delegation_requests(status) WHERE status = 'pending';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='task_delegation_requests') THEN
    RAISE EXCEPTION 'Migration 066 incompleta: task_delegation_requests ausente';
  END IF;
  RAISE NOTICE 'Migration 066-PM-DELEGATION-REQUESTS aplicada com sucesso.';
END $$;

COMMIT;
