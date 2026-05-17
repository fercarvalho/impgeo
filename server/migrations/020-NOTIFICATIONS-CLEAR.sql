-- =============================================================================
-- Migration 020 — NOTIFICAÇÕES: limpar vs excluir
-- =============================================================================
-- Distingue "limpar" (esconde do sininho mas mantém no banco para histórico)
-- de "excluir" (remove permanentemente).
--
--   - cleared: BOOLEAN — TRUE = não aparece mais no dropdown do sino
--   - cleared_at: TIMESTAMPTZ — quando foi limpa
--
-- A query do sino passa a filtrar por cleared = FALSE; auditoria/relatórios
-- futuros ainda podem ler todas as linhas.
-- =============================================================================

BEGIN;

ALTER TABLE notifications
    ADD COLUMN IF NOT EXISTS cleared    BOOLEAN     NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS cleared_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_notifications_user_cleared
    ON notifications(user_id, cleared) WHERE cleared = FALSE;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='notifications' AND column_name='cleared') THEN
        RAISE EXCEPTION 'Migração 020: coluna cleared não foi criada';
    END IF;
    RAISE NOTICE 'Migração 020 concluída: notifications agora suporta limpar (cleared) e excluir (DELETE)';
END $$;

COMMIT;
