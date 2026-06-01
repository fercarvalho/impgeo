-- ═══════════════════════════════════════════════════════════════════════════
-- 054-PM-SERVICE-STATUS.sql
-- Adiciona status (ativo/inativo) ao serviço, para permitir inativar um serviço
-- sem deletá-lo — serviços inativos não geram novos projetos (validado no app).
--
-- Idempotente, transacional, validador final.
-- Rollback: 054-PM-SERVICE-STATUS-rollback.sql
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

ALTER TABLE services ADD COLUMN IF NOT EXISTS status VARCHAR(16) DEFAULT 'ativo';

-- Normaliza valores existentes/nulos antes do CHECK.
UPDATE services SET status = 'ativo' WHERE status IS NULL OR status NOT IN ('ativo','inativo');

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'chk_services_status') THEN
    ALTER TABLE services ADD CONSTRAINT chk_services_status CHECK (status IN ('ativo','inativo'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_services_status ON services(status);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='services' AND column_name='status') THEN
    RAISE EXCEPTION 'Migration 054 incompleta: services.status ausente';
  END IF;
  RAISE NOTICE 'Migration 054-PM-SERVICE-STATUS aplicada com sucesso.';
END $$;

COMMIT;
