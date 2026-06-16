-- ═══════════════════════════════════════════════════════════════════════════
-- 058-PM-POMODORO-OVERAGE-rollback.sql
-- Reverte 058: remove a tabela de pedidos de excedente.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

DROP TABLE IF EXISTS pomodoro_overage_requests;

DO $$ BEGIN RAISE NOTICE 'Rollback 058-PM-POMODORO-OVERAGE aplicado.'; END $$;

COMMIT;
