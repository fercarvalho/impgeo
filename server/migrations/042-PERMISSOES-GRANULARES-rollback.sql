-- =============================================================================
-- Rollback Migration 042: Permissões granulares
-- =============================================================================
--
-- Reverte 042-PERMISSOES-GRANULARES.sql:
--   1. Restaura user_module_permissions a partir do backup
--   2. Recria user_subsystem_permissions (vazia)
--   3. Reverte constraint de access_level (volta a aceitar 'write')
--   4. Reverte constraint de role (remove 'manager'; usuários manager viram 'user')
--
-- Pré-condição: tabela user_module_permissions_backup_042 deve existir.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. Validar pré-condição: backup existe
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
     WHERE table_name = 'user_module_permissions_backup_042'
  ) THEN
    RAISE EXCEPTION 'Rollback impossível: tabela user_module_permissions_backup_042 não existe';
  END IF;
END $$;

-- -----------------------------------------------------------------------------
-- 2. Restaurar user_module_permissions
-- -----------------------------------------------------------------------------
TRUNCATE TABLE user_module_permissions;
INSERT INTO user_module_permissions
  SELECT * FROM user_module_permissions_backup_042;

-- -----------------------------------------------------------------------------
-- 3. Reverter constraint de access_level (volta a aceitar 'write')
-- -----------------------------------------------------------------------------
ALTER TABLE user_module_permissions
  DROP CONSTRAINT IF EXISTS user_module_permissions_access_level_check;
ALTER TABLE user_module_permissions
  ADD CONSTRAINT user_module_permissions_access_level_check
    CHECK (access_level IN ('view', 'write', 'edit'));

-- -----------------------------------------------------------------------------
-- 4. Recriar user_subsystem_permissions (vazia)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS user_subsystem_permissions (
    id            VARCHAR(255) PRIMARY KEY,
    user_id       VARCHAR(255) NOT NULL REFERENCES users(id)         ON DELETE CASCADE,
    subsystem_key VARCHAR(50)  NOT NULL REFERENCES subsystems(subsystem_key) ON DELETE CASCADE ON UPDATE CASCADE,
    created_at    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (user_id, subsystem_key)
);
CREATE INDEX IF NOT EXISTS idx_user_subsystem_permissions_user_id
  ON user_subsystem_permissions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_subsystem_permissions_subsystem_key
  ON user_subsystem_permissions(subsystem_key);

-- -----------------------------------------------------------------------------
-- 5. Reverter constraint de role (remove 'manager')
--    Usuários 'manager' são degradados para 'user' antes da constraint reapertar.
-- -----------------------------------------------------------------------------
UPDATE users SET role = 'user' WHERE role = 'manager';

ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check
  CHECK (role::text = ANY (ARRAY[
    'admin'::character varying,
    'user'::character varying,
    'guest'::character varying,
    'superadmin'::character varying
  ]::text[]));

COMMIT;

-- Backup permanece em user_module_permissions_backup_042 — apague manualmente
-- após confirmar que o rollback teve sucesso:
--   DROP TABLE user_module_permissions_backup_042;
