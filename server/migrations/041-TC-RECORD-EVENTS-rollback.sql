-- Rollback da migration 041 — audit log de eventos do registro TerraControl.
-- Drop é seguro: tabela independente, sem FKs apontando pra ela.

BEGIN;
DROP INDEX IF EXISTS idx_tc_record_events_terracontrol;
DROP TABLE IF EXISTS tc_record_events;
COMMIT;
