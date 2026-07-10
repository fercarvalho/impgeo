-- Rollback da 072-PM-AUDIT-VIEW.sql
-- Remove a view de auditoria central do PM (read-only, sem dados de negócio —
-- as tabelas de evento por-entidade permanecem intactas).
BEGIN;
DROP VIEW IF EXISTS pm_audit_v;
COMMIT;
