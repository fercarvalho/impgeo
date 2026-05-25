-- =============================================================================
-- Migration 042: Permissões granulares (Fase 2.0 — Schema)
-- =============================================================================
--
-- Objetivo:
--   1. Adicionar role 'manager' (intermediário admin↔user)
--   2. Descartar tabela user_subsystem_permissions (redundante;
--      user_module_permissions é a fonte da verdade)
--   3. Restringir access_level a 'view' / 'edit' (remove 'write' legado)
--   4. Backup de user_module_permissions antes do reset
--   5. Reset + aplicação dos defaults por role conforme tabela abaixo:
--
--   ┌─────────────┬──────────┬──────────┬──────────┬───────────────┬──────────┐
--   │ role        │ admin    │ gestao   │ financ.  │ gerenciamento │ especial │
--   ├─────────────┼──────────┼──────────┼──────────┼───────────────┼──────────┤
--   │ superadmin  │ edit ALL │ edit ALL │ edit ALL │ edit ALL      │ edit ALL │
--   │ admin       │ edit ¹   │ edit ALL │ edit ALL │ edit ALL      │ edit ALL │
--   │ manager     │   —      │ edit ALL │ edit ALL │ edit ALL      │ edit ALL │
--   │ user        │   —      │ view ALL │ view ALL │ edit ALL      │ edit ALL │
--   │ guest       │   —      │ view ²   │ view ALL │ view ALL      │ view ALL │
--   └─────────────┴──────────┴──────────┴──────────┴───────────────┴──────────┘
--   ¹ admin: edit em 'admin' (UserManagement); SEM acesso a 'sessions',
--     'anomalies', 'security_alerts' (exclusivos do superadmin).
--   ² guest/gestao: 'faq' + 'documentacao' (view); SEM acesso a 'roadmap'.
--
-- Reversão: 042-PERMISSOES-GRANULARES-rollback.sql (após COMMIT) ou ROLLBACK
-- automático em caso de erro durante a transação.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. Backup de user_module_permissions
-- -----------------------------------------------------------------------------
DROP TABLE IF EXISTS user_module_permissions_backup_042;
CREATE TABLE user_module_permissions_backup_042 AS
  SELECT * FROM user_module_permissions;

-- -----------------------------------------------------------------------------
-- 2. Aceitar role 'manager'
-- -----------------------------------------------------------------------------
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check
  CHECK (role::text = ANY (ARRAY[
    'superadmin'::character varying,
    'admin'::character varying,
    'manager'::character varying,
    'user'::character varying,
    'guest'::character varying
  ]::text[]));

-- -----------------------------------------------------------------------------
-- 3. Descartar user_subsystem_permissions (redundante)
-- -----------------------------------------------------------------------------
DROP INDEX IF EXISTS idx_user_subsystem_permissions_user_id;
DROP INDEX IF EXISTS idx_user_subsystem_permissions_subsystem_key;
DROP TABLE IF EXISTS user_subsystem_permissions;

-- -----------------------------------------------------------------------------
-- 4. access_level: só 'view' / 'edit'
-- -----------------------------------------------------------------------------
UPDATE user_module_permissions SET access_level = 'edit'
  WHERE access_level = 'write';

ALTER TABLE user_module_permissions
  DROP CONSTRAINT IF EXISTS user_module_permissions_access_level_check;
ALTER TABLE user_module_permissions
  ADD CONSTRAINT user_module_permissions_access_level_check
    CHECK (access_level IN ('view', 'edit'));

-- -----------------------------------------------------------------------------
-- 5. Reset + aplicação dos defaults por role
-- -----------------------------------------------------------------------------
TRUNCATE TABLE user_module_permissions;

-- 5a. superadmin → edit em TODOS os módulos
INSERT INTO user_module_permissions (id, user_id, module_key, access_level, created_at, updated_at)
SELECT CONCAT(u.id, '-', mc.module_key), u.id, mc.module_key, 'edit',
       CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
  FROM users u
  CROSS JOIN modules_catalog mc
 WHERE u.role = 'superadmin'
   AND mc.is_active = TRUE;

-- 5b. admin → edit em 'admin' (UserManagement) apenas; sessions/anomalies/
--             security_alerts ficam exclusivos do superadmin (sem registro).
--             Demais subsistemas: edit em tudo.
INSERT INTO user_module_permissions (id, user_id, module_key, access_level, created_at, updated_at)
SELECT CONCAT(u.id, '-', mc.module_key), u.id, mc.module_key, 'edit',
       CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
  FROM users u
  CROSS JOIN modules_catalog mc
 WHERE u.role = 'admin'
   AND mc.is_active = TRUE
   AND (
        (mc.subsystem_key = 'admin' AND mc.module_key = 'admin')
     OR  mc.subsystem_key IN ('gestao', 'financeiro', 'gerenciamento', 'especial')
   );

-- 5c. manager → sem acesso ao subsistema admin; edit em todos os outros
INSERT INTO user_module_permissions (id, user_id, module_key, access_level, created_at, updated_at)
SELECT CONCAT(u.id, '-', mc.module_key), u.id, mc.module_key, 'edit',
       CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
  FROM users u
  CROSS JOIN modules_catalog mc
 WHERE u.role = 'manager'
   AND mc.is_active = TRUE
   AND mc.subsystem_key IN ('gestao', 'financeiro', 'gerenciamento', 'especial');

-- 5d. user → view em gestao + financeiro; edit em gerenciamento + especial
INSERT INTO user_module_permissions (id, user_id, module_key, access_level, created_at, updated_at)
SELECT CONCAT(u.id, '-', mc.module_key), u.id, mc.module_key,
       CASE
         WHEN mc.subsystem_key IN ('gerenciamento', 'especial') THEN 'edit'
         WHEN mc.subsystem_key IN ('gestao', 'financeiro')      THEN 'view'
       END,
       CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
  FROM users u
  CROSS JOIN modules_catalog mc
 WHERE u.role = 'user'
   AND mc.is_active = TRUE
   AND mc.subsystem_key IN ('gestao', 'financeiro', 'gerenciamento', 'especial');

-- 5e. guest → view em quase tudo; gestao limitado a faq + documentacao
INSERT INTO user_module_permissions (id, user_id, module_key, access_level, created_at, updated_at)
SELECT CONCAT(u.id, '-', mc.module_key), u.id, mc.module_key, 'view',
       CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
  FROM users u
  CROSS JOIN modules_catalog mc
 WHERE u.role = 'guest'
   AND mc.is_active = TRUE
   AND (
        (mc.subsystem_key = 'gestao' AND mc.module_key IN ('faq', 'documentacao'))
     OR  mc.subsystem_key IN ('financeiro', 'gerenciamento', 'especial')
   );

-- -----------------------------------------------------------------------------
-- 6. Validação atômica
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  v_total_perms       INTEGER;
  v_invalid_levels    INTEGER;
  v_invalid_roles     INTEGER;
  v_orphan_modules    INTEGER;
  v_superadmin_count  INTEGER;
  v_superadmin_perms  INTEGER;
  v_total_modules     INTEGER;
  v_subsys_table_ok   BOOLEAN;
BEGIN
  -- Confirma DROP da user_subsystem_permissions
  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables
     WHERE table_name = 'user_subsystem_permissions'
  ) INTO v_subsys_table_ok;
  IF v_subsys_table_ok THEN
    RAISE EXCEPTION 'Validação falhou: user_subsystem_permissions ainda existe';
  END IF;

  -- access_level só pode ser 'view' / 'edit'
  SELECT COUNT(*) INTO v_invalid_levels
    FROM user_module_permissions
   WHERE access_level NOT IN ('view', 'edit');
  IF v_invalid_levels > 0 THEN
    RAISE EXCEPTION 'Validação falhou: % registros com access_level inválido', v_invalid_levels;
  END IF;

  -- role só pode ser superadmin/admin/manager/user/guest
  SELECT COUNT(*) INTO v_invalid_roles
    FROM users
   WHERE role NOT IN ('superadmin', 'admin', 'manager', 'user', 'guest');
  IF v_invalid_roles > 0 THEN
    RAISE EXCEPTION 'Validação falhou: % usuários com role inválida', v_invalid_roles;
  END IF;

  -- Nenhum module_key órfão (sem FK formal — checamos manualmente)
  SELECT COUNT(*) INTO v_orphan_modules
    FROM user_module_permissions ump
    LEFT JOIN modules_catalog mc ON mc.module_key = ump.module_key
   WHERE mc.module_key IS NULL;
  IF v_orphan_modules > 0 THEN
    RAISE EXCEPTION 'Validação falhou: % permissões apontam para módulos inexistentes', v_orphan_modules;
  END IF;

  -- Superadmin deve ter acesso a TODOS os módulos ativos
  SELECT COUNT(*) INTO v_superadmin_count FROM users WHERE role = 'superadmin';
  SELECT COUNT(*) INTO v_total_modules    FROM modules_catalog WHERE is_active = TRUE;
  SELECT COUNT(*) INTO v_superadmin_perms
    FROM user_module_permissions ump
    JOIN users u ON u.id = ump.user_id
   WHERE u.role = 'superadmin' AND ump.access_level = 'edit';

  IF v_superadmin_count > 0 AND v_superadmin_perms <> v_superadmin_count * v_total_modules THEN
    RAISE EXCEPTION 'Validação falhou: superadmins têm % perms, esperado %',
      v_superadmin_perms, (v_superadmin_count * v_total_modules);
  END IF;

  -- Total de perms > 0 (defensivo)
  SELECT COUNT(*) INTO v_total_perms FROM user_module_permissions;
  IF v_total_perms = 0 THEN
    RAISE EXCEPTION 'Validação falhou: nenhuma permissão inserida (esperado > 0)';
  END IF;

  RAISE NOTICE '✓ Migration 042: % permissões aplicadas, % módulos ativos, % usuários',
    v_total_perms, v_total_modules, (SELECT COUNT(*) FROM users);
END $$;

COMMIT;

-- =============================================================================
-- Pós-migration:
--   - Backup em user_module_permissions_backup_042 (mantido para auditoria)
--   - Para descartar backup após validar: DROP TABLE user_module_permissions_backup_042;
-- =============================================================================
