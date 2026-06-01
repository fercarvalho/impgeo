-- ═══════════════════════════════════════════════════════════════════════════
-- 049-PM-POMODORO.sql
-- Fase 5 do módulo PM. Controle de tempo (Pomodoro) persistente server-side.
--   task_work_sessions   — 1 linha por ciclo (ativo + pausa), com agregados
--   pomodoro_events       — log atômico do ciclo (STARTED, PAUSED, ...)
--   pomodoro_daily_stats  — acumulado diário por usuário (limite de 400min ativos)
--   user_pomodoro_config  — config por usuário (limite, idle alert, próximo forçado)
--   task_idle_tracking    — tempo na área de tarefas sem iniciar nada
-- + trigger que cria config default ao inserir usuário.
--
-- Modelo do ciclo: running → break → completed (ou aborted / daily_limit_reached).
-- Só TEMPO ATIVO conta pro limite diário. Pular pausa (planned < 100) faz o
-- próximo ciclo subir (25→50→100).
--
-- Idempotente, transacional, validador final.
-- Rollback: 049-PM-POMODORO-rollback.sql
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ─── 1. task_work_sessions ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS task_work_sessions (
  id                    VARCHAR(255) PRIMARY KEY,
  user_id               VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  task_id               VARCHAR(255) REFERENCES project_tasks(id) ON DELETE SET NULL,
  project_id            VARCHAR(255) REFERENCES projects(id) ON DELETE SET NULL,
  category              VARCHAR(16) CHECK (category IN ('study','meeting','planning','admin','other')),
  pomodoro_mode         VARCHAR(20) NOT NULL CHECK (pomodoro_mode IN ('POMODORO_25_5','POMODORO_50_10','POMODORO_100_20')),
  planned_minutes       SMALLINT NOT NULL CHECK (planned_minutes IN (25,50,100)),
  break_planned_minutes SMALLINT NOT NULL CHECK (break_planned_minutes IN (5,10,20)),
  state                 VARCHAR(24) NOT NULL DEFAULT 'running'
                          CHECK (state IN ('running','paused','break','completed','aborted','daily_limit_reached')),
  started_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  pause_started_at      TIMESTAMPTZ,
  break_started_at      TIMESTAMPTZ,
  stopped_at            TIMESTAMPTZ,
  total_active_seconds  INTEGER DEFAULT 0,
  total_paused_seconds  INTEGER DEFAULT 0,
  total_break_seconds   INTEGER DEFAULT 0,
  skipped_break_count   SMALLINT DEFAULT 0,
  last_heartbeat        TIMESTAMPTZ DEFAULT NOW(),
  aborted_reason        VARCHAR(24) CHECK (aborted_reason IN ('manual','daily_limit','tab_closed_timeout','task_completed')),
  metadata              JSONB DEFAULT '{}'::jsonb,
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  updated_at            TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT chk_tws_target CHECK (task_id IS NOT NULL OR category IS NOT NULL)
);

-- Só UMA sessão "viva" por usuário (impede start concorrente em 2 abas).
CREATE UNIQUE INDEX IF NOT EXISTS uq_tws_active_per_user
  ON task_work_sessions(user_id)
  WHERE state IN ('running','paused','break');

CREATE INDEX IF NOT EXISTS idx_tws_user_started ON task_work_sessions(user_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_tws_task         ON task_work_sessions(task_id);
CREATE INDEX IF NOT EXISTS idx_tws_state        ON task_work_sessions(state);

-- ─── 2. pomodoro_events (log atômico) ─────────────────────────────────────────

CREATE TABLE IF NOT EXISTS pomodoro_events (
  id              VARCHAR(255) PRIMARY KEY,
  user_id         VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  work_session_id VARCHAR(255) NOT NULL REFERENCES task_work_sessions(id) ON DELETE CASCADE,
  task_id         VARCHAR(255),
  event_type      VARCHAR(24) NOT NULL CHECK (event_type IN (
                    'STARTED','PAUSED','RESUMED','STOPPED','BREAK_STARTED',
                    'BREAK_SKIPPED','BREAK_COMPLETED','MODE_UPGRADED','DAILY_LIMIT_REACHED')),
  from_mode       VARCHAR(20),
  to_mode         VARCHAR(20),
  occurred_at     TIMESTAMPTZ DEFAULT NOW(),
  metadata        JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_pomo_events_session ON pomodoro_events(work_session_id, occurred_at);
CREATE INDEX IF NOT EXISTS idx_pomo_events_user    ON pomodoro_events(user_id, occurred_at DESC);

-- ─── 3. pomodoro_daily_stats ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS pomodoro_daily_stats (
  user_id              VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  day                  DATE NOT NULL,
  total_minutes_worked INTEGER DEFAULT 0,   -- só ativo; base do limite de 400
  break_minutes        INTEGER DEFAULT 0,
  sessions_completed   INTEGER DEFAULT 0,
  sessions_aborted     INTEGER DEFAULT 0,
  skipped_breaks       INTEGER DEFAULT 0,
  updated_at           TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_id, day)
);

-- ─── 4. user_pomodoro_config (+ trigger de seed) ──────────────────────────────

CREATE TABLE IF NOT EXISTS user_pomodoro_config (
  user_id                  VARCHAR(255) PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  daily_limit_minutes      SMALLINT DEFAULT 400,
  idle_alert_minutes       SMALLINT DEFAULT 5,
  sound_enabled            BOOLEAN DEFAULT TRUE,
  next_cycle_forced_minutes SMALLINT,   -- consumido no próximo start (skip de pausa)
  created_at               TIMESTAMPTZ DEFAULT NOW(),
  updated_at               TIMESTAMPTZ DEFAULT NOW()
);

-- Seed pra usuários já existentes.
INSERT INTO user_pomodoro_config (user_id)
SELECT id FROM users
ON CONFLICT (user_id) DO NOTHING;

-- Trigger: cria config default ao inserir usuário novo.
CREATE OR REPLACE FUNCTION pm_seed_pomodoro_config() RETURNS trigger AS $$
BEGIN
  INSERT INTO user_pomodoro_config (user_id) VALUES (NEW.id)
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_seed_pomodoro_config ON users;
CREATE TRIGGER trg_seed_pomodoro_config
  AFTER INSERT ON users
  FOR EACH ROW EXECUTE FUNCTION pm_seed_pomodoro_config();

-- ─── 5. task_idle_tracking ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS task_idle_tracking (
  id                       VARCHAR(255) PRIMARY KEY,
  user_id                  VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  opened_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  first_task_started_at    TIMESTAMPTZ,
  idle_before_start_seconds INTEGER,
  alert_shown_at           TIMESTAMPTZ,
  alert_dismissed_at       TIMESTAMPTZ,
  alert_action             VARCHAR(24),   -- 'started_task' | 'snoozed' | 'dismissed'
  snoozed_until            TIMESTAMPTZ,
  created_at               TIMESTAMPTZ DEFAULT NOW(),
  updated_at               TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_idle_user_opened ON task_idle_tracking(user_id, opened_at DESC);

-- ─── 6. Módulo pomodoro_gerenciamento (catálogo + permissões) ─────────────────

INSERT INTO modules_catalog
  (module_key, module_name, icon_name, description, route_path, is_system, is_active, sort_order, subsystem_key, created_at, updated_at)
VALUES
  ('pomodoro_gerenciamento', 'Pomodoro', 'Timer',
   'Controle de tempo (Pomodoro) e estatísticas pessoais', 'pomodoro_gerenciamento',
   TRUE, TRUE, 9, 'gerenciamento', NOW(), NOW())
ON CONFLICT (module_key) DO UPDATE SET
  is_active = TRUE, subsystem_key = 'gerenciamento', updated_at = NOW();

INSERT INTO user_module_permissions (id, user_id, module_key, access_level, created_at, updated_at)
SELECT CONCAT(u.id, '-pomodoro_gerenciamento'), u.id, 'pomodoro_gerenciamento',
       CASE u.role WHEN 'guest' THEN 'view' ELSE 'edit' END, NOW(), NOW()
  FROM users u
 WHERE NOT EXISTS (
   SELECT 1 FROM user_module_permissions ump
    WHERE ump.user_id = u.id AND ump.module_key = 'pomodoro_gerenciamento'
 );

-- ─── Validador final ──────────────────────────────────────────────────────────

DO $$
DECLARE
  required_tables TEXT[] := ARRAY['task_work_sessions','pomodoro_events','pomodoro_daily_stats','user_pomodoro_config','task_idle_tracking'];
  t TEXT; missing TEXT[] := ARRAY[]::TEXT[];
BEGIN
  FOREACH t IN ARRAY required_tables LOOP
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = t) THEN
      missing := array_append(missing, t);
    END IF;
  END LOOP;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_seed_pomodoro_config') THEN
    missing := array_append(missing, 'trigger trg_seed_pomodoro_config');
  END IF;
  IF COALESCE(array_length(missing,1),0) > 0 THEN
    RAISE EXCEPTION 'Migration 049 incompleta: %', array_to_string(missing, ', ');
  END IF;
  RAISE NOTICE 'Migration 049-PM-POMODORO aplicada com sucesso.';
END $$;

COMMIT;
