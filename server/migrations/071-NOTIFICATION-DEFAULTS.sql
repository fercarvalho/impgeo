-- ═══════════════════════════════════════════════════════════════════════════
-- 071-NOTIFICATION-DEFAULTS.sql
-- Defaults de notificação editáveis (melhoria #7). Tira NOTIFICATION_DEFAULTS
-- do código para uma tabela — mudar um default deixa de exigir deploy.
--
-- A tabela guarda o default EFETIVO por (scope, notification_type, channel).
-- A população vem do boot-seeder no database-pg.js (upsert do FACTORY_DEFAULTS
-- ON CONFLICT DO NOTHING), então esta migration só cria a estrutura.
--
-- Idempotente, transacional, validador final.
-- Rollback: 071-NOTIFICATION-DEFAULTS-rollback.sql
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

CREATE TABLE IF NOT EXISTS notification_defaults (
  scope             VARCHAR(16)  NOT NULL,
  notification_type VARCHAR(64)  NOT NULL,
  channel           VARCHAR(8)   NOT NULL,
  enabled           BOOLEAN      NOT NULL DEFAULT FALSE,
  updated_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  CONSTRAINT notification_defaults_channel_check CHECK (channel IN ('push','email')),
  PRIMARY KEY (scope, notification_type, channel)
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='notification_defaults') THEN
    RAISE EXCEPTION 'Migration 071 incompleta: tabela notification_defaults não criada.';
  END IF;
  RAISE NOTICE 'Migration 071-NOTIFICATION-DEFAULTS aplicada com sucesso.';
END $$;

COMMIT;
