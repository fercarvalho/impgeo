-- ═══════════════════════════════════════════════════════════════════════════
-- 050-PM-REVIEW-AND-HELP.sql
-- Fase 6 do módulo PM. Revisão de tarefas, anexos e pedidos de ajuda.
--   project_tasks (+ colunas de revisão)
--   task_attachments    — anexos por tarefa (storage em server/uploads/pm/)
--   task_help_requests  — pedidos de ajuda (com justificativa na recusa)
--
-- Idempotente, transacional, validador final.
-- Rollback: 050-PM-REVIEW-AND-HELP-rollback.sql
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ─── 1. project_tasks: colunas de revisão ─────────────────────────────────────
ALTER TABLE project_tasks ADD COLUMN IF NOT EXISTS submitted_for_review_at TIMESTAMPTZ;
ALTER TABLE project_tasks ADD COLUMN IF NOT EXISTS review_decided_at       TIMESTAMPTZ;
ALTER TABLE project_tasks ADD COLUMN IF NOT EXISTS review_decision         VARCHAR(12);
ALTER TABLE project_tasks ADD COLUMN IF NOT EXISTS adjustment_notes        TEXT;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'chk_ptask_review_decision') THEN
    ALTER TABLE project_tasks ADD CONSTRAINT chk_ptask_review_decision
      CHECK (review_decision IS NULL OR review_decision IN ('approved','rejected'));
  END IF;
END $$;

-- ─── 2. task_attachments ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS task_attachments (
  id                 VARCHAR(255) PRIMARY KEY,
  task_id            VARCHAR(255) NOT NULL REFERENCES project_tasks(id) ON DELETE CASCADE,
  file_name          VARCHAR(512) NOT NULL,
  stored_name        VARCHAR(512) NOT NULL,
  mime               VARCHAR(128),
  size_bytes         BIGINT,
  uploaded_by_user_id VARCHAR(255) REFERENCES users(id) ON DELETE SET NULL,
  uploaded_at        TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_task_attachments_task ON task_attachments(task_id, uploaded_at DESC);

-- ─── 3. task_help_requests ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS task_help_requests (
  id                  VARCHAR(255) PRIMARY KEY,
  task_id             VARCHAR(255) NOT NULL REFERENCES project_tasks(id) ON DELETE CASCADE,
  requester_user_id   VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  target_user_id      VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  message             TEXT,
  status              VARCHAR(12) NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending','accepted','refused','completed')),
  refusal_reason      TEXT,
  resolution_notes    TEXT,
  accepted_at         TIMESTAMPTZ,
  refused_at          TIMESTAMPTZ,
  completed_at        TIMESTAMPTZ,
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW(),
  -- recusa exige justificativa (req item 18)
  CONSTRAINT chk_help_refusal CHECK (refused_at IS NULL OR refusal_reason IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS idx_help_requests_target    ON task_help_requests(target_user_id, status);
CREATE INDEX IF NOT EXISTS idx_help_requests_requester ON task_help_requests(requester_user_id);
CREATE INDEX IF NOT EXISTS idx_help_requests_task      ON task_help_requests(task_id);

-- ─── Validador final ──────────────────────────────────────────────────────────
DO $$
DECLARE missing TEXT[] := ARRAY[]::TEXT[];
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'task_attachments') THEN missing := array_append(missing, 'task_attachments'); END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'task_help_requests') THEN missing := array_append(missing, 'task_help_requests'); END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='project_tasks' AND column_name='review_decision') THEN missing := array_append(missing, 'project_tasks.review_decision'); END IF;
  IF COALESCE(array_length(missing,1),0) > 0 THEN
    RAISE EXCEPTION 'Migration 050 incompleta: %', array_to_string(missing, ', ');
  END IF;
  RAISE NOTICE 'Migration 050-PM-REVIEW-AND-HELP aplicada com sucesso.';
END $$;

COMMIT;
