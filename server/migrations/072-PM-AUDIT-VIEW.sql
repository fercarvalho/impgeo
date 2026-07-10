-- ═══════════════════════════════════════════════════════════════════════════
-- 072-PM-AUDIT-VIEW.sql
-- Auditoria central do PM (melhoria #8). View read-only que UNIFICA as três
-- tabelas de evento por-entidade do PM numa linha comum, para investigação
-- cross-entidade (hoje é preciso consultar cada tabela separada):
--   - task_events     (por tarefa)
--   - project_events  (por projeto)
--   - pomodoro_events (por sessão/usuário)
--
-- Normalização para: (id, source, entity_type, entity_id, event_type,
-- actor_type, actor_id, payload, occurred_at). O pomodoro não tem actor_type
-- (é sempre 'user' via user_id) nem payload homogêneo — dobramos from_mode/
-- to_mode/work_session_id dentro de `payload` para não perder informação.
--
-- Read-only: NENHUM write path muda (a auditoria por-entidade continua idêntica).
-- Idempotente (CREATE OR REPLACE), transacional, validador final.
-- Rollback: 072-PM-AUDIT-VIEW-rollback.sql
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

CREATE OR REPLACE VIEW pm_audit_v AS
  SELECT
    id,
    'task'::text       AS source,
    'task'::text       AS entity_type,
    task_id            AS entity_id,
    event_type::text   AS event_type,
    actor_type::text   AS actor_type,
    actor_id,
    payload,
    created_at         AS occurred_at
  FROM task_events

  UNION ALL

  SELECT
    id,
    'project'::text,
    'project'::text,
    project_id,
    event_type::text,
    actor_type::text,
    actor_id,
    payload,
    created_at
  FROM project_events

  UNION ALL

  SELECT
    id,
    'pomodoro'::text,
    'pomodoro'::text,
    COALESCE(task_id, work_session_id),
    event_type::text,
    'user'::text                            AS actor_type,
    user_id                                 AS actor_id,
    COALESCE(metadata, '{}'::jsonb)
      || jsonb_build_object(
           'from_mode', from_mode,
           'to_mode', to_mode,
           'work_session_id', work_session_id
         )                                  AS payload,
    occurred_at
  FROM pomodoro_events;

-- ─── Validador final ──────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.views WHERE table_name = 'pm_audit_v') THEN
    RAISE EXCEPTION 'Migration 072 incompleta: view pm_audit_v não criada.';
  END IF;
  RAISE NOTICE 'Migration 072-PM-AUDIT-VIEW aplicada com sucesso.';
END $$;

COMMIT;
