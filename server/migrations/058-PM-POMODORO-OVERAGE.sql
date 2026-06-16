-- ═══════════════════════════════════════════════════════════════════════════
-- 058-PM-POMODORO-OVERAGE.sql
-- Limite diário do Pomodoro vira RECOMENDAÇÃO (não trava). Acima de um teto
-- (padrão 1,25× = 500 min p/ limite 400), o tempo extra só é CONTABILIZADO após
-- aprovação de um manager/admin. Este pedido de aprovação é por usuário/dia.
--
--   pomodoro_overage_requests — 1 pedido por (user_id, day)
--
-- Idempotente, transacional, validador final.
-- Rollback: 058-PM-POMODORO-OVERAGE-rollback.sql
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

CREATE TABLE IF NOT EXISTS pomodoro_overage_requests (
  id                  VARCHAR(255) PRIMARY KEY,
  user_id             VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  day                 DATE NOT NULL DEFAULT CURRENT_DATE,
  justification       TEXT,
  status              VARCHAR(12) NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending','approved','rejected')),
  decided_by_user_id  VARCHAR(255) REFERENCES users(id) ON DELETE SET NULL,
  decided_at          TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_pomodoro_overage_user_day UNIQUE (user_id, day)
);

CREATE INDEX IF NOT EXISTS idx_pomodoro_overage_pending ON pomodoro_overage_requests(status) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_pomodoro_overage_user_day ON pomodoro_overage_requests(user_id, day);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='pomodoro_overage_requests') THEN
    RAISE EXCEPTION 'Migration 058 incompleta: pomodoro_overage_requests ausente';
  END IF;
  RAISE NOTICE 'Migration 058-PM-POMODORO-OVERAGE aplicada com sucesso.';
END $$;

COMMIT;
