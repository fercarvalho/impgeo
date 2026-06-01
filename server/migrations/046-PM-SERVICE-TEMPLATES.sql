-- ═══════════════════════════════════════════════════════════════════════════
-- 046-PM-SERVICE-TEMPLATES.sql
-- Fase 2 do módulo PM. Estrutura declarativa de TEMPLATE por serviço:
--   service_template_stages   — etapas padrão (com tipo first/normal/last)
--   service_template_tasks    — tarefas padrão por etapa
--   service_template_task_deps — dependências (iniciar/concluir; alvo task|stage)
--   service_template_task_triggers — gatilhos que CRIAM tarefa nova
-- Seed do serviço de sistema "TerraControl" (svc_terracontrol_default).
--
-- Nota de design (alinha req item 5, mais rico que o rascunho do plano):
--   dependência distingue start_dependency vs completion_dependency e pode
--   mirar uma task OU uma stage (dependency_target_type). Triggers são
--   conceito SEPARADO de dependências (criam tarefa; não só liberam).
--
-- Idempotente, transacional, validador final.
-- Rollback: 046-PM-SERVICE-TEMPLATES-rollback.sql
-- Pré-requisito: ownership do schema public no user do app (ver migration 045).
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ─── 1. services: flags de template ───────────────────────────────────────────

ALTER TABLE services ADD COLUMN IF NOT EXISTS is_template_enabled  BOOLEAN  DEFAULT FALSE;
ALTER TABLE services ADD COLUMN IF NOT EXISTS is_system            BOOLEAN  DEFAULT FALSE;
ALTER TABLE services ADD COLUMN IF NOT EXISTS default_priority     SMALLINT DEFAULT 2;
ALTER TABLE services ADD COLUMN IF NOT EXISTS default_duration_days INTEGER;

-- ─── 2. service_template_stages ───────────────────────────────────────────────
-- stage_type: 'first' (sempre 1ª), 'last' (sempre última), 'normal' (posição livre).

CREATE TABLE IF NOT EXISTS service_template_stages (
  id                    VARCHAR(255) PRIMARY KEY,
  service_id            VARCHAR(255) NOT NULL REFERENCES services(id) ON DELETE CASCADE,
  name                  VARCHAR(255) NOT NULL,
  description           TEXT,
  version               INTEGER  NOT NULL DEFAULT 1,
  sort_order            INTEGER  NOT NULL DEFAULT 0,
  stage_type            VARCHAR(16) NOT NULL DEFAULT 'normal'
                          CHECK (stage_type IN ('first','normal','last')),
  default_duration_days INTEGER,
  default_assignee_role VARCHAR(16) CHECK (default_assignee_role IN ('admin','manager','user')),
  is_active             BOOLEAN DEFAULT TRUE,
  metadata              JSONB DEFAULT '{}'::jsonb,
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  updated_at            TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT uq_stpl_stage_order UNIQUE (service_id, version, sort_order)
);

CREATE INDEX IF NOT EXISTS idx_stpl_stages_service ON service_template_stages(service_id, version, sort_order);

-- ─── 3. service_template_tasks ────────────────────────────────────────────────
-- Campos cobrindo req item 3 (descrição, observação, prazo, responsável, revisão).

CREATE TABLE IF NOT EXISTS service_template_tasks (
  id                     VARCHAR(255) PRIMARY KEY,
  template_stage_id      VARCHAR(255) NOT NULL REFERENCES service_template_stages(id) ON DELETE CASCADE,
  service_id             VARCHAR(255) NOT NULL REFERENCES services(id) ON DELETE CASCADE, -- denormalizado p/ query
  name                   VARCHAR(255) NOT NULL,
  description            TEXT,
  observation            TEXT,
  sort_order             INTEGER NOT NULL DEFAULT 0,
  default_days           INTEGER,     -- prazo padrão em dias
  default_assignee_role  VARCHAR(16) CHECK (default_assignee_role IN ('admin','manager','user')),
  default_estimated_minutes INTEGER,
  default_priority       SMALLINT DEFAULT 2,
  requires_acceptance    BOOLEAN DEFAULT FALSE,
  requires_attachment    BOOLEAN DEFAULT FALSE,
  requires_review        BOOLEAN DEFAULT FALSE,
  review_type            VARCHAR(24),  -- ex.: 'standard','technical' (semântica no app)
  reviewer_default_role  VARCHAR(16) CHECK (reviewer_default_role IN ('admin','manager','user')),
  manager_review_allowed BOOLEAN DEFAULT TRUE,
  admin_review_allowed   BOOLEAN DEFAULT TRUE,
  is_active              BOOLEAN DEFAULT TRUE,
  metadata               JSONB DEFAULT '{}'::jsonb,
  created_at             TIMESTAMPTZ DEFAULT NOW(),
  updated_at             TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_stpl_tasks_stage   ON service_template_tasks(template_stage_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_stpl_tasks_service ON service_template_tasks(service_id);

-- ─── 4. service_template_task_deps ────────────────────────────────────────────
-- Dependências declarativas (req item 5):
--   dependency_type: 'start_dependency'      → task só INICIA após alvo cumprir required_status
--                    'completion_dependency' → task pode iniciar, só CONCLUI após alvo cumprir
--   target: task OU stage (dependency_target_type) — exatamente um *_id preenchido
--   required_status: status do alvo exigido (ex.: 'completed','reviewed'); NULL = 'completed'

CREATE TABLE IF NOT EXISTS service_template_task_deps (
  id                     VARCHAR(255) PRIMARY KEY,
  task_id                VARCHAR(255) NOT NULL REFERENCES service_template_tasks(id) ON DELETE CASCADE,
  dependency_type        VARCHAR(24)  NOT NULL
                           CHECK (dependency_type IN ('start_dependency','completion_dependency')),
  dependency_target_type VARCHAR(8)   NOT NULL
                           CHECK (dependency_target_type IN ('task','stage')),
  target_task_id         VARCHAR(255) REFERENCES service_template_tasks(id)  ON DELETE CASCADE,
  target_stage_id        VARCHAR(255) REFERENCES service_template_stages(id) ON DELETE CASCADE,
  required_status        VARCHAR(32),
  created_at             TIMESTAMPTZ DEFAULT NOW(),
  -- garante coerência target_type ↔ qual coluna está preenchida
  CONSTRAINT chk_stpl_dep_target CHECK (
    (dependency_target_type = 'task'  AND target_task_id  IS NOT NULL AND target_stage_id IS NULL) OR
    (dependency_target_type = 'stage' AND target_stage_id IS NOT NULL AND target_task_id  IS NULL)
  ),
  -- não depender de si mesma
  CONSTRAINT chk_stpl_dep_not_self CHECK (target_task_id IS NULL OR target_task_id <> task_id)
);

CREATE INDEX IF NOT EXISTS idx_stpl_deps_task        ON service_template_task_deps(task_id);
CREATE INDEX IF NOT EXISTS idx_stpl_deps_target_task ON service_template_task_deps(target_task_id);
CREATE INDEX IF NOT EXISTS idx_stpl_deps_target_stage ON service_template_task_deps(target_stage_id);

-- ─── 5. service_template_task_triggers ────────────────────────────────────────
-- Trigger ≠ dependência: quando source_template_task_id COMPLETA, materializa
-- uma tarefa NOVA descrita em payload (não precisa pré-existir no template).
-- payload JSONB: { name, description, default_assignee_role, default_estimated_minutes,
--                  requires_review, default_days, target_stage_id?, sort_order? }

CREATE TABLE IF NOT EXISTS service_template_task_triggers (
  id                      VARCHAR(255) PRIMARY KEY,
  service_id              VARCHAR(255) NOT NULL REFERENCES services(id) ON DELETE CASCADE,
  source_template_task_id VARCHAR(255) NOT NULL REFERENCES service_template_tasks(id) ON DELETE CASCADE,
  action                  VARCHAR(16) NOT NULL DEFAULT 'create' CHECK (action IN ('create')),
  on_status               VARCHAR(32) NOT NULL DEFAULT 'completed', -- status do source que dispara
  payload                 JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_active               BOOLEAN DEFAULT TRUE,
  created_at              TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_stpl_triggers_source  ON service_template_task_triggers(source_template_task_id);
CREATE INDEX IF NOT EXISTS idx_stpl_triggers_service ON service_template_task_triggers(service_id);

-- ─── 6. Seed: serviço de sistema "TerraControl" ───────────────────────────────
-- ID determinístico p/ idempotência e p/ o webhook PIX referenciar (Fase 3).

INSERT INTO services (id, name, description, price, is_system, is_template_enabled, default_priority, created_at, updated_at)
VALUES ('svc_terracontrol_default',
        'TerraControl',
        'Serviço de regularização/georreferenciamento gerado automaticamente quando um terreno do TerraControl é pago via PIX.',
        0, TRUE, TRUE, 2, NOW(), NOW())
ON CONFLICT (id) DO UPDATE
  SET is_system = TRUE, is_template_enabled = TRUE;

-- Stages seed (IDs determinísticos). version=1.
INSERT INTO service_template_stages (id, service_id, name, description, version, sort_order, stage_type, default_duration_days)
VALUES
  ('svc_tc_stage_1', 'svc_terracontrol_default', 'Coleta de documentos',  'Reunir matrícula, CAR, ITR, CCIR e dados do imóvel.', 1, 0, 'first',  5),
  ('svc_tc_stage_2', 'svc_terracontrol_default', 'Vistoria técnica',       'Vistoria de campo e coleta de coordenadas.',          1, 1, 'normal', 7),
  ('svc_tc_stage_3', 'svc_terracontrol_default', 'Elaboração do laudo',    'Produção do laudo/peça técnica.',                     1, 2, 'normal', 10),
  ('svc_tc_stage_4', 'svc_terracontrol_default', 'Revisão admin',          'Revisão técnica final pela equipe.',                  1, 3, 'normal', 3),
  ('svc_tc_stage_5', 'svc_terracontrol_default', 'Entrega ao cliente',     'Entrega dos produtos e encerramento.',                1, 4, 'last',   2)
ON CONFLICT (id) DO NOTHING;

-- Tasks seed (1-2 por stage; review na etapa de revisão).
INSERT INTO service_template_tasks
  (id, template_stage_id, service_id, name, description, sort_order, default_days, default_assignee_role, requires_review, requires_acceptance)
VALUES
  ('svc_tc_task_1_1', 'svc_tc_stage_1', 'svc_terracontrol_default', 'Conferir documentação do imóvel', 'Validar matrícula, CAR, ITR, CCIR.', 0, 5, 'user',  FALSE, FALSE),
  ('svc_tc_task_2_1', 'svc_tc_stage_2', 'svc_terracontrol_default', 'Agendar e executar vistoria',     'Vistoria de campo com coleta de coordenadas.', 0, 7, 'user', FALSE, FALSE),
  ('svc_tc_task_3_1', 'svc_tc_stage_3', 'svc_terracontrol_default', 'Elaborar laudo técnico',          'Produção do laudo conforme normas.', 0, 10, 'user', TRUE,  FALSE),
  ('svc_tc_task_4_1', 'svc_tc_stage_4', 'svc_terracontrol_default', 'Revisar laudo',                   'Revisão técnica final do laudo.', 0, 3, 'manager', FALSE, TRUE),
  ('svc_tc_task_5_1', 'svc_tc_stage_5', 'svc_terracontrol_default', 'Entregar produtos ao cliente',    'Disponibilizar produtos finais.', 0, 2, 'user', FALSE, FALSE)
ON CONFLICT (id) DO NOTHING;

-- Dependência exemplo: "Elaborar laudo" só CONCLUI depois que "vistoria" concluir.
INSERT INTO service_template_task_deps
  (id, task_id, dependency_type, dependency_target_type, target_task_id, required_status)
VALUES
  ('svc_tc_dep_1', 'svc_tc_task_3_1', 'completion_dependency', 'task', 'svc_tc_task_2_1', 'completed')
ON CONFLICT (id) DO NOTHING;

-- ─── Validador final ──────────────────────────────────────────────────────────

DO $$
DECLARE
  required_tables TEXT[] := ARRAY[
    'service_template_stages','service_template_tasks',
    'service_template_task_deps','service_template_task_triggers'
  ];
  t       TEXT;
  missing TEXT[] := ARRAY[]::TEXT[];
BEGIN
  FOREACH t IN ARRAY required_tables LOOP
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = t) THEN
      missing := array_append(missing, t);
    END IF;
  END LOOP;

  IF NOT EXISTS (SELECT 1 FROM services WHERE id = 'svc_terracontrol_default' AND is_system = TRUE) THEN
    missing := array_append(missing, 'seed svc_terracontrol_default');
  END IF;

  IF (SELECT COUNT(*) FROM service_template_stages WHERE service_id = 'svc_terracontrol_default') < 5 THEN
    missing := array_append(missing, 'seed stages TC (<5)');
  END IF;

  IF COALESCE(array_length(missing, 1), 0) > 0 THEN
    RAISE EXCEPTION 'Migration 046 incompleta: %', array_to_string(missing, ', ');
  END IF;

  RAISE NOTICE 'Migration 046-PM-SERVICE-TEMPLATES aplicada com sucesso.';
END $$;

COMMIT;
