-- ═══════════════════════════════════════════════════════════════════════════
-- 065-PM-GOALS.sql
-- Metas operacionais do Gerenciamento. Cada meta tem um indicador, um alvo, um
-- escopo (pessoal/usuário/equipe/global) e uma janela (semana/mês/trimestre).
-- O progresso é calculado AO VIVO sobre os dados reais (tarefas/projetos/pomodoro).
--
-- Idempotente, transacional, validador final.
-- Rollback: 065-PM-GOALS-rollback.sql
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

CREATE TABLE IF NOT EXISTS pm_goals (
  id                  VARCHAR(255) PRIMARY KEY,
  title               VARCHAR(255),
  metric              VARCHAR(24) NOT NULL
                        CHECK (metric IN ('tasks_completed','on_time_pct','projects_completed','focus_minutes')),
  target              NUMERIC(12,2) NOT NULL,
  scope               VARCHAR(12) NOT NULL
                        CHECK (scope IN ('self','user','team','global')),
  target_user_id      VARCHAR(255) REFERENCES users(id) ON DELETE CASCADE,  -- NULL p/ global
  period              VARCHAR(12) NOT NULL CHECK (period IN ('week','month','quarter')),
  period_start        DATE NOT NULL,
  period_end          DATE NOT NULL,
  created_by_user_id  VARCHAR(255) REFERENCES users(id) ON DELETE SET NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pm_goals_target  ON pm_goals(target_user_id);
CREATE INDEX IF NOT EXISTS idx_pm_goals_creator ON pm_goals(created_by_user_id);
CREATE INDEX IF NOT EXISTS idx_pm_goals_scope   ON pm_goals(scope);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='pm_goals') THEN
    RAISE EXCEPTION 'Migration 065 incompleta: pm_goals ausente';
  END IF;
  RAISE NOTICE 'Migration 065-PM-GOALS aplicada com sucesso.';
END $$;

COMMIT;
