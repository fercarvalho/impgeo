-- Rollback Migration 043: descarta tabela role_default_permissions.
-- defaults.js cai automaticamente no FALLBACK_DEFAULTS hardcoded.

BEGIN;
DROP INDEX IF EXISTS idx_role_default_permissions_role;
DROP TABLE IF EXISTS role_default_permissions;
COMMIT;
