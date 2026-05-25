-- Rollback Migration 044: reverte roles dinâmicas para CHECK fixo.
-- Pré-condição: não existe nenhuma role custom (key fora dos 5 do sistema)
-- com usuários ou registros em role_default_permissions; aborta se houver.

BEGIN;

DO $$
DECLARE
  v_custom_users INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_custom_users
    FROM users u
   WHERE u.role NOT IN ('superadmin', 'admin', 'manager', 'user', 'guest');
  IF v_custom_users > 0 THEN
    RAISE EXCEPTION 'Rollback inseguro: % users com role custom — migre-os antes', v_custom_users;
  END IF;
END $$;

-- Apaga roles custom (system ficam)
DELETE FROM roles WHERE is_system = FALSE;

-- Reverte FK por CHECK
ALTER TABLE role_default_permissions DROP CONSTRAINT IF EXISTS role_default_permissions_role_fkey;
ALTER TABLE role_default_permissions
  ADD CONSTRAINT role_default_permissions_role_check
    CHECK (role IN ('superadmin', 'admin', 'manager', 'user', 'guest'));

ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_fkey;
DROP INDEX IF EXISTS idx_users_role;
ALTER TABLE users ADD CONSTRAINT users_role_check
  CHECK (role::text = ANY (ARRAY[
    'superadmin'::character varying,
    'admin'::character varying,
    'manager'::character varying,
    'user'::character varying,
    'guest'::character varying
  ]::text[]));

-- Tabela roles é descartada inteira (cascateia em ON DELETE CASCADE)
DROP TABLE IF EXISTS roles;

COMMIT;
