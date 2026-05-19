-- =============================================================================
-- 026 ROLLBACK — Reverter migração share_links → tc_users
-- =============================================================================
-- Remove apenas os tc_users criados pela migration 026 (created_via='migrated').
-- Tc_users criados manualmente (created_via='direct' ou 'invite') ficam intactos.
-- CASCADE remove tc_user_record_access, tc_refresh_tokens, tc_legacy_aliases
-- vinculados (graças aos FKs ON DELETE CASCADE).
--
-- ATENÇÃO: se tc_user migrado já trocou a senha e fez uso real, o rollback
-- apaga TUDO dele. Use só durante desenvolvimento ou logo após a migração.
-- =============================================================================

BEGIN;

DELETE FROM tc_users WHERE created_via = 'migrated';

DO $$
DECLARE
    remaining INTEGER;
BEGIN
    SELECT COUNT(*) INTO remaining FROM tc_users WHERE created_via = 'migrated';
    IF remaining > 0 THEN
        RAISE EXCEPTION 'Ainda há % tc_users migrados após o rollback', remaining;
    END IF;
    RAISE NOTICE 'Rollback 026 OK: tc_users migrados removidos';
END $$;

COMMIT;
