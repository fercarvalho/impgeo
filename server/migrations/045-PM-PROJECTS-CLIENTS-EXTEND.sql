-- ═══════════════════════════════════════════════════════════════════════════
-- 045-PM-PROJECTS-CLIENTS-EXTEND.sql
-- Fase 1 do módulo Gerenciamento de Projetos + Execução de Tarefas (PM).
-- Estende schemas existentes (clients, projects, transactions, terracontrol)
-- e cria tabela de auditoria project_events (espelha tc_record_events).
-- Idempotente, transacional, com validador final.
-- Rollback: 045-PM-PROJECTS-CLIENTS-EXTEND-rollback.sql
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ─── 1. clients: cpf/cnpj + tc_user_id + source + merge ──────────────────────

ALTER TABLE clients ADD COLUMN IF NOT EXISTS tc_user_id            VARCHAR(255);
ALTER TABLE clients ADD COLUMN IF NOT EXISTS cpf                   VARCHAR(20);
ALTER TABLE clients ADD COLUMN IF NOT EXISTS cnpj                  VARCHAR(20);
ALTER TABLE clients ADD COLUMN IF NOT EXISTS source                VARCHAR(16) DEFAULT 'manual';
ALTER TABLE clients ADD COLUMN IF NOT EXISTS merged_into_client_id VARCHAR(255);

DO $$
BEGIN
  -- FK tc_users (só se tc_users existe — proteção contra ambientes parciais)
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'tc_users')
     AND NOT EXISTS (SELECT 1 FROM information_schema.table_constraints
                     WHERE constraint_name = 'fk_clients_tc_user_id') THEN
    ALTER TABLE clients
      ADD CONSTRAINT fk_clients_tc_user_id
      FOREIGN KEY (tc_user_id) REFERENCES tc_users(id) ON DELETE SET NULL;
  END IF;

  -- self-FK pra merge
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints
                 WHERE constraint_name = 'fk_clients_merged_into') THEN
    ALTER TABLE clients
      ADD CONSTRAINT fk_clients_merged_into
      FOREIGN KEY (merged_into_client_id) REFERENCES clients(id) ON DELETE SET NULL;
  END IF;

  -- CHECK source
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints
                 WHERE constraint_name = 'chk_clients_source') THEN
    -- normaliza valores fora do domínio antes do CHECK
    UPDATE clients SET source = 'manual'
      WHERE source IS NULL OR source NOT IN ('manual','terracontrol','imported');
    ALTER TABLE clients
      ADD CONSTRAINT chk_clients_source
      CHECK (source IN ('manual','terracontrol','imported'));
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_clients_tc_user_id ON clients(tc_user_id) WHERE tc_user_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_clients_cpf        ON clients(cpf)        WHERE cpf IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_clients_cnpj       ON clients(cnpj)       WHERE cnpj IS NOT NULL;
CREATE INDEX        IF NOT EXISTS idx_clients_source    ON clients(source);

-- ─── 2. projects: 19 cols novas + status CHECK + FKs ─────────────────────────

ALTER TABLE projects ADD COLUMN IF NOT EXISTS client_id        VARCHAR(255);
ALTER TABLE projects ADD COLUMN IF NOT EXISTS service_id       VARCHAR(255);
ALTER TABLE projects ADD COLUMN IF NOT EXISTS terracontrol_id  VARCHAR(255);
ALTER TABLE projects ADD COLUMN IF NOT EXISTS budget_id        VARCHAR(255);
ALTER TABLE projects ADD COLUMN IF NOT EXISTS source           VARCHAR(16) DEFAULT 'manual';
ALTER TABLE projects ADD COLUMN IF NOT EXISTS manager_user_id  VARCHAR(255);
ALTER TABLE projects ADD COLUMN IF NOT EXISTS priority         SMALLINT;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS start_date       DATE;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS due_date         DATE;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS started_at       TIMESTAMPTZ;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS completed_at     TIMESTAMPTZ;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS canceled_at      TIMESTAMPTZ;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS total_cents      BIGINT  DEFAULT 0;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS paid_cents       BIGINT  DEFAULT 0;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS expenses_cents   BIGINT  DEFAULT 0;
-- profit_cents = total - expenses (req item 2 + decisão #24: lucro ORÇADO)
ALTER TABLE projects ADD COLUMN IF NOT EXISTS profit_cents     BIGINT GENERATED ALWAYS AS
  (COALESCE(total_cents, 0) - COALESCE(expenses_cents, 0)) STORED;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS progress_pct     NUMERIC(5,2) DEFAULT 0;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS auto_finalize    BOOLEAN DEFAULT TRUE;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS metadata         JSONB DEFAULT '{}'::jsonb;

-- Backfill: client (VARCHAR legado) -> client_id (FK)
UPDATE projects p
   SET client_id = c.id
  FROM clients c
 WHERE p.client IS NOT NULL
   AND p.client_id IS NULL
   AND c.name = p.client;

-- FKs em projects
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'fk_projects_client_id') THEN
    ALTER TABLE projects ADD CONSTRAINT fk_projects_client_id
      FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'fk_projects_service_id') THEN
    ALTER TABLE projects ADD CONSTRAINT fk_projects_service_id
      FOREIGN KEY (service_id) REFERENCES services(id) ON DELETE SET NULL;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'terracontrol')
     AND NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'fk_projects_terracontrol_id') THEN
    ALTER TABLE projects ADD CONSTRAINT fk_projects_terracontrol_id
      FOREIGN KEY (terracontrol_id) REFERENCES terracontrol(id) ON DELETE SET NULL;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'tc_budgets')
     AND NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'fk_projects_budget_id') THEN
    ALTER TABLE projects ADD CONSTRAINT fk_projects_budget_id
      FOREIGN KEY (budget_id) REFERENCES tc_budgets(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'fk_projects_manager_user_id') THEN
    ALTER TABLE projects ADD CONSTRAINT fk_projects_manager_user_id
      FOREIGN KEY (manager_user_id) REFERENCES users(id) ON DELETE SET NULL;
  END IF;

  -- CHECKs (status + source)
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'chk_projects_status') THEN
    -- normaliza status antigos pra não quebrar o CHECK
    UPDATE projects SET status = 'inactive'
      WHERE status IS NULL OR status NOT IN ('inactive','active','paused','completed','canceled');
    ALTER TABLE projects ADD CONSTRAINT chk_projects_status
      CHECK (status IN ('inactive','active','paused','completed','canceled'));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'chk_projects_source') THEN
    UPDATE projects SET source = 'manual'
      WHERE source IS NULL OR source NOT IN ('manual','terracontrol_pix','imported');
    ALTER TABLE projects ADD CONSTRAINT chk_projects_source
      CHECK (source IN ('manual','terracontrol_pix','imported'));
  END IF;
END $$;

-- UNIQUE em terracontrol_id (decisão #23: 1 terreno = 1 projeto)
CREATE UNIQUE INDEX IF NOT EXISTS uq_projects_terracontrol_id ON projects(terracontrol_id) WHERE terracontrol_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_projects_client_id       ON projects(client_id);
CREATE INDEX IF NOT EXISTS idx_projects_service_id      ON projects(service_id);
CREATE INDEX IF NOT EXISTS idx_projects_manager_user_id ON projects(manager_user_id);
CREATE INDEX IF NOT EXISTS idx_projects_due_date        ON projects(due_date);

-- ─── 3. transactions: project_id ──────────────────────────────────────────────

ALTER TABLE transactions ADD COLUMN IF NOT EXISTS project_id VARCHAR(255);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'fk_transactions_project_id') THEN
    ALTER TABLE transactions ADD CONSTRAINT fk_transactions_project_id
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_transactions_project_id ON transactions(project_id);

-- ─── 4. terracontrol: client_id + project_id (link reverso bidirecional) ─────

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'terracontrol') THEN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name = 'terracontrol' AND column_name = 'client_id') THEN
      ALTER TABLE terracontrol ADD COLUMN client_id VARCHAR(255);
      ALTER TABLE terracontrol ADD CONSTRAINT fk_terracontrol_client_id
        FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE SET NULL;
      CREATE INDEX idx_terracontrol_client_id ON terracontrol(client_id);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name = 'terracontrol' AND column_name = 'project_id') THEN
      ALTER TABLE terracontrol ADD COLUMN project_id VARCHAR(255);
      ALTER TABLE terracontrol ADD CONSTRAINT fk_terracontrol_project_id
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL;
      CREATE INDEX idx_terracontrol_project_id ON terracontrol(project_id);
    END IF;
  END IF;
END $$;

-- ─── 5. project_events (auditoria, espelha tc_record_events) ──────────────────

CREATE TABLE IF NOT EXISTS project_events (
  id          VARCHAR(255) PRIMARY KEY,
  project_id  VARCHAR(255) NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  event_type  VARCHAR(64)  NOT NULL,
  actor_type  VARCHAR(16)  NOT NULL CHECK (actor_type IN ('user','system','abacatepay','cron')),
  actor_id    VARCHAR(255),
  payload     JSONB DEFAULT '{}'::jsonb,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_project_events_project_id_created ON project_events(project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_project_events_event_type         ON project_events(event_type);

-- ─── Validador final ──────────────────────────────────────────────────────────

DO $$
DECLARE
  expected_project_cols TEXT[] := ARRAY[
    'client_id','service_id','terracontrol_id','budget_id','source',
    'manager_user_id','priority','start_date','due_date','started_at',
    'completed_at','canceled_at','total_cents','paid_cents','expenses_cents',
    'profit_cents','progress_pct','auto_finalize','metadata'
  ];
  expected_clients_cols TEXT[] := ARRAY['tc_user_id','cpf','cnpj','source','merged_into_client_id'];
  c       TEXT;
  missing TEXT[] := ARRAY[]::TEXT[];
BEGIN
  FOREACH c IN ARRAY expected_project_cols LOOP
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name = 'projects' AND column_name = c) THEN
      missing := array_append(missing, 'projects.' || c);
    END IF;
  END LOOP;

  FOREACH c IN ARRAY expected_clients_cols LOOP
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name = 'clients' AND column_name = c) THEN
      missing := array_append(missing, 'clients.' || c);
    END IF;
  END LOOP;

  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'project_events') THEN
    missing := array_append(missing, 'TABLE project_events');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'transactions' AND column_name = 'project_id') THEN
    missing := array_append(missing, 'transactions.project_id');
  END IF;

  IF COALESCE(array_length(missing, 1), 0) > 0 THEN
    RAISE EXCEPTION 'Migration 045 incompleta: %', array_to_string(missing, ', ');
  END IF;

  RAISE NOTICE 'Migration 045-PM-PROJECTS-CLIENTS-EXTEND aplicada com sucesso.';
END $$;

COMMIT;
