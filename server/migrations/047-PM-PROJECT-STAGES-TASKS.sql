-- ═══════════════════════════════════════════════════════════════════════════
-- 047-PM-PROJECT-STAGES-TASKS.sql
-- Fase 3 do módulo PM. Entidades REAIS do projeto (cópia editável do template):
--   project_stages         — etapas do projeto (com version p/ diligência v2/v3)
--   project_tasks          — tarefas (status: máquina de 10 estados)
--   project_task_deps      — dependências copiadas do template
--   project_task_triggers  — gatilhos copiados (criam tarefa ao concluir source)
--   task_events            — auditoria do ciclo de vida da tarefa
--
-- Inclui CORREÇÃO (seção 0): a migration 045 colocou projects.status em inglês,
-- divergindo do requisito (item 2: "ativo, inativo, pausado, concluído") e do
-- frontend (Projects.tsx). Aqui convertemos p/ PORTUGUÊS.
--
-- Idempotente, transacional, validador final.
-- Rollback: 047-PM-PROJECT-STAGES-TASKS-rollback.sql
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ─── 0. Correção: projects.status em português ────────────────────────────────

DO $$
BEGIN
  -- Remove o CHECK antigo (inglês) se existir.
  IF EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'chk_projects_status') THEN
    ALTER TABLE projects DROP CONSTRAINT chk_projects_status;
  END IF;

  -- Traduz valores existentes (inglês → português). Projetos cujo status original
  -- foi "achatado" pra 'inactive' na 045 viram 'inativo' (não há como recuperar
  -- o original; impacto baixo em dev).
  UPDATE projects SET status = CASE status
    WHEN 'active'    THEN 'ativo'
    WHEN 'inactive'  THEN 'inativo'
    WHEN 'paused'    THEN 'pausado'
    WHEN 'completed' THEN 'concluido'
    WHEN 'canceled'  THEN 'cancelado'
    ELSE status
  END
  WHERE status IN ('active','inactive','paused','completed','canceled');

  -- Normaliza qualquer valor fora do domínio português.
  UPDATE projects SET status = 'inativo'
   WHERE status IS NULL OR status NOT IN ('ativo','inativo','pausado','concluido','cancelado');

  -- Recria CHECK em português.
  ALTER TABLE projects ADD CONSTRAINT chk_projects_status
    CHECK (status IN ('ativo','inativo','pausado','concluido','cancelado'));
END $$;

-- ─── 1. project_stages ────────────────────────────────────────────────────────
-- version permite "Elaboração v2/v3" DENTRO do mesmo projeto (diligência/retrabalho).

CREATE TABLE IF NOT EXISTS project_stages (
  id                  VARCHAR(255) PRIMARY KEY,
  project_id          VARCHAR(255) NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name                VARCHAR(255) NOT NULL,
  description         TEXT,
  version             INTEGER NOT NULL DEFAULT 1,
  sort_order          INTEGER NOT NULL DEFAULT 0,
  status              VARCHAR(16) NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending','active','completed','skipped')),
  responsible_user_id VARCHAR(255) REFERENCES users(id) ON DELETE SET NULL,
  default_days        INTEGER,
  start_date          DATE,
  due_date            DATE,
  started_at          TIMESTAMPTZ,
  completed_at        TIMESTAMPTZ,
  template_stage_id   VARCHAR(255),   -- audit; sem FK forte (template pode mudar/versão)
  template_snapshot   JSONB,          -- snapshot da stage template no momento da cópia
  metadata            JSONB DEFAULT '{}'::jsonb,
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_project_stages_project ON project_stages(project_id, sort_order);

-- ─── 2. project_tasks (máquina de 10 estados) ─────────────────────────────────

CREATE TABLE IF NOT EXISTS project_tasks (
  id                   VARCHAR(255) PRIMARY KEY,
  project_id           VARCHAR(255) NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  project_stage_id     VARCHAR(255) NOT NULL REFERENCES project_stages(id) ON DELETE CASCADE,
  name                 VARCHAR(255) NOT NULL,
  description          TEXT,
  observation          TEXT,
  sort_order           INTEGER NOT NULL DEFAULT 0,
  status               VARCHAR(24) NOT NULL DEFAULT 'pending'
                         CHECK (status IN (
                           'pending','available','in_progress','pending_acceptance',
                           'pending_review','pending_adjustment','completed',
                           'overdue','refused','canceled')),
  assignee_user_id     VARCHAR(255) REFERENCES users(id) ON DELETE SET NULL,
  captured_by_user_id  VARCHAR(255) REFERENCES users(id) ON DELETE SET NULL,
  created_by_user_id   VARCHAR(255) REFERENCES users(id) ON DELETE SET NULL,
  default_days         INTEGER,
  start_date           DATE,
  due_date             DATE,
  assigned_at          TIMESTAMPTZ,
  accepted_at          TIMESTAMPTZ,
  started_at           TIMESTAMPTZ,
  paused_at            TIMESTAMPTZ,
  completed_at         TIMESTAMPTZ,
  actual_minutes       INTEGER DEFAULT 0,
  estimated_minutes    INTEGER,
  priority             SMALLINT DEFAULT 2,
  review_required      BOOLEAN DEFAULT FALSE,
  acceptance_required  BOOLEAN DEFAULT FALSE,
  reviewer_user_id     VARCHAR(255) REFERENCES users(id) ON DELETE SET NULL,
  manager_review_allowed BOOLEAN DEFAULT TRUE,
  admin_review_allowed   BOOLEAN DEFAULT TRUE,
  refusal_reason       TEXT,
  template_task_id     VARCHAR(255),  -- audit
  created_by_trigger   BOOLEAN DEFAULT FALSE,
  metadata             JSONB DEFAULT '{}'::jsonb,
  created_at           TIMESTAMPTZ DEFAULT NOW(),
  updated_at           TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_project_tasks_project  ON project_tasks(project_id);
CREATE INDEX IF NOT EXISTS idx_project_tasks_stage    ON project_tasks(project_stage_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_project_tasks_assignee ON project_tasks(assignee_user_id, status);
CREATE INDEX IF NOT EXISTS idx_project_tasks_status_due ON project_tasks(status, due_date);

-- ─── 3. project_task_deps (copiadas do template) ──────────────────────────────

CREATE TABLE IF NOT EXISTS project_task_deps (
  id                     VARCHAR(255) PRIMARY KEY,
  task_id                VARCHAR(255) NOT NULL REFERENCES project_tasks(id) ON DELETE CASCADE,
  dependency_type        VARCHAR(24) NOT NULL
                           CHECK (dependency_type IN ('start_dependency','completion_dependency')),
  dependency_target_type VARCHAR(8) NOT NULL
                           CHECK (dependency_target_type IN ('task','stage')),
  target_task_id         VARCHAR(255) REFERENCES project_tasks(id)  ON DELETE CASCADE,
  target_stage_id        VARCHAR(255) REFERENCES project_stages(id) ON DELETE CASCADE,
  required_status        VARCHAR(32),
  created_at             TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT chk_ptask_dep_target CHECK (
    (dependency_target_type = 'task'  AND target_task_id  IS NOT NULL AND target_stage_id IS NULL) OR
    (dependency_target_type = 'stage' AND target_stage_id IS NOT NULL AND target_task_id  IS NULL)
  ),
  CONSTRAINT chk_ptask_dep_not_self CHECK (target_task_id IS NULL OR target_task_id <> task_id)
);

CREATE INDEX IF NOT EXISTS idx_ptask_deps_task         ON project_task_deps(task_id);
CREATE INDEX IF NOT EXISTS idx_ptask_deps_target_task  ON project_task_deps(target_task_id);
CREATE INDEX IF NOT EXISTS idx_ptask_deps_target_stage ON project_task_deps(target_stage_id);

-- ─── 4. project_task_triggers (copiados do template) ──────────────────────────
-- triggered_at: idempotência — quando a source completa e o trigger materializa
-- a tarefa, grava NOW(); re-execução não duplica.

CREATE TABLE IF NOT EXISTS project_task_triggers (
  id                     VARCHAR(255) PRIMARY KEY,
  project_id             VARCHAR(255) NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  source_task_id         VARCHAR(255) NOT NULL REFERENCES project_tasks(id) ON DELETE CASCADE,
  action                 VARCHAR(16) NOT NULL DEFAULT 'create' CHECK (action IN ('create')),
  on_status              VARCHAR(32) NOT NULL DEFAULT 'completed',
  payload                JSONB NOT NULL DEFAULT '{}'::jsonb,
  triggered_at           TIMESTAMPTZ,
  created_task_id        VARCHAR(255) REFERENCES project_tasks(id) ON DELETE SET NULL,
  created_at             TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ptask_triggers_source  ON project_task_triggers(source_task_id);
CREATE INDEX IF NOT EXISTS idx_ptask_triggers_project ON project_task_triggers(project_id);

-- ─── 5. task_events (auditoria) ───────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS task_events (
  id          VARCHAR(255) PRIMARY KEY,
  task_id     VARCHAR(255) NOT NULL REFERENCES project_tasks(id) ON DELETE CASCADE,
  event_type  VARCHAR(48) NOT NULL,
  actor_type  VARCHAR(16) NOT NULL CHECK (actor_type IN ('user','system','abacatepay','cron')),
  actor_id    VARCHAR(255),
  payload     JSONB DEFAULT '{}'::jsonb,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_task_events_task_created ON task_events(task_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_task_events_type         ON task_events(event_type);

-- ─── Validador final ──────────────────────────────────────────────────────────

DO $$
DECLARE
  required_tables TEXT[] := ARRAY['project_stages','project_tasks','project_task_deps','project_task_triggers','task_events'];
  t       TEXT;
  missing TEXT[] := ARRAY[]::TEXT[];
BEGIN
  FOREACH t IN ARRAY required_tables LOOP
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = t) THEN
      missing := array_append(missing, t);
    END IF;
  END LOOP;

  -- Confirma CHECK português ativo.
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'chk_projects_status'
  ) THEN
    missing := array_append(missing, 'chk_projects_status (pt)');
  END IF;

  IF COALESCE(array_length(missing, 1), 0) > 0 THEN
    RAISE EXCEPTION 'Migration 047 incompleta: %', array_to_string(missing, ', ');
  END IF;

  RAISE NOTICE 'Migration 047-PM-PROJECT-STAGES-TASKS aplicada com sucesso.';
END $$;

COMMIT;
