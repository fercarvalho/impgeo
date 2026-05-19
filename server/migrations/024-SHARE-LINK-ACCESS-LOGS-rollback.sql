-- =============================================================================
-- 024 ROLLBACK — Reverter criação de share_link_access_logs
-- =============================================================================
-- ATENÇÃO: dropa toda a tabela e o histórico de auditoria. Use só se houver
-- bug grave na migration.
-- =============================================================================

BEGIN;

DROP INDEX IF EXISTS idx_share_link_access_logs_ip_status;
DROP INDEX IF EXISTS idx_share_link_access_logs_accessed_at;
DROP INDEX IF EXISTS idx_share_link_access_logs_token;
DROP TABLE IF EXISTS share_link_access_logs;

COMMIT;
