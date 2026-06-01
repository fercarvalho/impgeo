-- ═══════════════════════════════════════════════════════════════════════════
-- 051-PM-NOTIFICATIONS-AND-REPORTS.sql
-- Fase 7 do módulo PM. Preferências de relatório por e-mail + auditoria de envios.
--   users (+ pm_email_reports, pm_report_frequencies)
--   pm_report_jobs (idempotência de envio por período)
--
-- Os defaults de notificação (push/email por tipo pm_*) vivem em código
-- (Database.NOTIFICATION_DEFAULTS.impgeo) — não há seed de linhas aqui; só
-- overrides explícitos do usuário criam linhas em notification_preferences.
--
-- Idempotente, transacional, validador final.
-- Rollback: 051-PM-NOTIFICATIONS-AND-REPORTS-rollback.sql
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

ALTER TABLE users ADD COLUMN IF NOT EXISTS pm_email_reports     BOOLEAN DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS pm_report_frequencies JSONB DEFAULT '[]'::jsonb;

CREATE TABLE IF NOT EXISTS pm_report_jobs (
  id            VARCHAR(255) PRIMARY KEY,
  user_id       VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  frequency     VARCHAR(12) NOT NULL CHECK (frequency IN ('daily','weekly','monthly','quarterly','yearly')),
  period_start  DATE NOT NULL,
  period_end    DATE NOT NULL,
  sent_at       TIMESTAMPTZ DEFAULT NOW(),
  status        VARCHAR(12) DEFAULT 'sent' CHECK (status IN ('sent','error','skipped')),
  error         TEXT,
  CONSTRAINT uq_pm_report_jobs UNIQUE (user_id, frequency, period_start)
);
CREATE INDEX IF NOT EXISTS idx_pm_report_jobs_user ON pm_report_jobs(user_id, frequency, period_start DESC);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='pm_email_reports') THEN
    RAISE EXCEPTION 'Migration 051 incompleta: users.pm_email_reports ausente';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='pm_report_jobs') THEN
    RAISE EXCEPTION 'Migration 051 incompleta: pm_report_jobs ausente';
  END IF;
  RAISE NOTICE 'Migration 051-PM-NOTIFICATIONS-AND-REPORTS aplicada com sucesso.';
END $$;

COMMIT;
