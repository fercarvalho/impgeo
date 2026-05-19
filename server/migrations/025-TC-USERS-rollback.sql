-- =============================================================================
-- 025 ROLLBACK — Reverter sistema tc_users
-- =============================================================================
-- ATENÇÃO: dropa TUDO. Tc_users criados são perdidos. Não use em produção
-- depois que houver tc_users reais — só durante desenvolvimento.
-- =============================================================================

BEGIN;

-- Reverter modificações em tabelas existentes
ALTER TABLE share_link_access_logs DROP COLUMN IF EXISTS tc_user_id;
DROP INDEX IF EXISTS idx_share_link_access_logs_tc_user;

ALTER TABLE share_links DROP COLUMN IF EXISTS created_by_tc_user_id;
ALTER TABLE share_links DROP COLUMN IF EXISTS created_by_user_id;
DROP INDEX IF EXISTS idx_share_links_created_by_tc_user;

-- Dropar tabelas tc_* (CASCADE remove FKs e índices automaticamente)
DROP TABLE IF EXISTS tc_legacy_aliases       CASCADE;
DROP TABLE IF EXISTS tc_email_verifications  CASCADE;
DROP TABLE IF EXISTS tc_password_reset_tokens CASCADE;
DROP TABLE IF EXISTS tc_refresh_tokens       CASCADE;
DROP TABLE IF EXISTS tc_user_record_access   CASCADE;
DROP TABLE IF EXISTS tc_users                CASCADE;

COMMIT;
