-- =============================================================================
-- Migration 043: role_default_permissions — defaults editáveis pela UI
-- =============================================================================
--
-- Move o mapa de defaults por role (que vivia hardcoded em
-- server/permissions/defaults.js) para uma tabela persistente que superadmins
-- podem editar via painel.
--
-- Cada (role, module_key) representa: "essa role recebe esse módulo, com esse
-- access_level, ao ser criada ou resetada." Ausência = sem acesso.
--
-- O mapa hardcoded permanece em defaults.js como FALLBACK_DEFAULTS — usado
-- quando o banco não tem nenhum registro para uma role (edge case de deletar
-- tudo) e como referência do "padrão original" no botão "Restaurar padrão".
--
-- Seed inicial reflete EXATAMENTE a tabela da migration 042:
--
--   ┌─────────────┬───────┬────────┬──────────┬───────────────┬──────────┐
--   │ role        │ admin │ gestao │ financ.  │ gerenciamento │ especial │
--   ├─────────────┼───────┼────────┼──────────┼───────────────┼──────────┤
--   │ superadmin  │ edit  │ edit   │ edit     │ edit          │ edit     │
--   │ admin       │ edit¹ │ edit   │ edit     │ edit          │ edit     │
--   │ manager     │  —    │ edit   │ edit     │ edit          │ edit     │
--   │ user        │  —    │ view   │ view     │ edit          │ edit     │
--   │ guest       │  —    │ view²  │ view     │ view          │ view     │
--   └─────────────┴───────┴────────┴──────────┴───────────────┴──────────┘
--   ¹ admin: só 'admin' (UserManagement); sessions/anomalies/security_alerts
--     permanecem exclusivos do superadmin (sem registro).
--   ² guest/gestao: só faq + documentacao (sem roadmap).
-- =============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS role_default_permissions (
  role         VARCHAR(50)  NOT NULL,
  module_key   VARCHAR(100) NOT NULL REFERENCES modules_catalog(module_key) ON DELETE CASCADE,
  access_level VARCHAR(10)  NOT NULL CHECK (access_level IN ('view', 'edit')),
  updated_at   TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (role, module_key),
  CHECK (role IN ('superadmin', 'admin', 'manager', 'user', 'guest'))
);

CREATE INDEX IF NOT EXISTS idx_role_default_permissions_role
  ON role_default_permissions(role);

-- ── Seed: superadmin edita TODOS os módulos ativos ─────────────────────────
INSERT INTO role_default_permissions (role, module_key, access_level)
SELECT 'superadmin', module_key, 'edit'
  FROM modules_catalog WHERE is_active = TRUE
ON CONFLICT (role, module_key) DO NOTHING;

-- ── Seed: admin edita 'admin' + tudo dos 4 subsistemas (não-admin) ────────
INSERT INTO role_default_permissions (role, module_key, access_level)
SELECT 'admin', module_key, 'edit'
  FROM modules_catalog
 WHERE is_active = TRUE
   AND (
        (subsystem_key = 'admin' AND module_key = 'admin')
     OR  subsystem_key IN ('gestao', 'financeiro', 'gerenciamento', 'especial')
   )
ON CONFLICT (role, module_key) DO NOTHING;

-- ── Seed: manager edita tudo dos 4 subsistemas (não-admin) ────────────────
INSERT INTO role_default_permissions (role, module_key, access_level)
SELECT 'manager', module_key, 'edit'
  FROM modules_catalog
 WHERE is_active = TRUE
   AND subsystem_key IN ('gestao', 'financeiro', 'gerenciamento', 'especial')
ON CONFLICT (role, module_key) DO NOTHING;

-- ── Seed: user view em gestao+financeiro; edit em gerenciamento+especial ──
INSERT INTO role_default_permissions (role, module_key, access_level)
SELECT 'user',
       module_key,
       CASE
         WHEN subsystem_key IN ('gerenciamento', 'especial') THEN 'edit'
         WHEN subsystem_key IN ('gestao', 'financeiro')      THEN 'view'
       END
  FROM modules_catalog
 WHERE is_active = TRUE
   AND subsystem_key IN ('gestao', 'financeiro', 'gerenciamento', 'especial')
ON CONFLICT (role, module_key) DO NOTHING;

-- ── Seed: guest view em quase tudo; gestao limitado a faq + documentacao ──
INSERT INTO role_default_permissions (role, module_key, access_level)
SELECT 'guest', module_key, 'view'
  FROM modules_catalog
 WHERE is_active = TRUE
   AND (
        (subsystem_key = 'gestao' AND module_key IN ('faq', 'documentacao'))
     OR  subsystem_key IN ('financeiro', 'gerenciamento', 'especial')
   )
ON CONFLICT (role, module_key) DO NOTHING;

-- ── Validação ──────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_count_super INTEGER;
  v_count_admin INTEGER;
  v_count_mgr   INTEGER;
  v_count_user  INTEGER;
  v_count_guest INTEGER;
  v_active_mods INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_active_mods FROM modules_catalog WHERE is_active = TRUE;

  SELECT COUNT(*) INTO v_count_super FROM role_default_permissions WHERE role = 'superadmin';
  SELECT COUNT(*) INTO v_count_admin FROM role_default_permissions WHERE role = 'admin';
  SELECT COUNT(*) INTO v_count_mgr   FROM role_default_permissions WHERE role = 'manager';
  SELECT COUNT(*) INTO v_count_user  FROM role_default_permissions WHERE role = 'user';
  SELECT COUNT(*) INTO v_count_guest FROM role_default_permissions WHERE role = 'guest';

  IF v_count_super <> v_active_mods THEN
    RAISE EXCEPTION 'superadmin deveria ter % perms, tem %', v_active_mods, v_count_super;
  END IF;
  IF v_count_admin = 0 OR v_count_mgr = 0 OR v_count_user = 0 OR v_count_guest = 0 THEN
    RAISE EXCEPTION 'Alguma role ficou sem perms: super=% admin=% mgr=% user=% guest=%',
      v_count_super, v_count_admin, v_count_mgr, v_count_user, v_count_guest;
  END IF;

  RAISE NOTICE '✓ Migration 043: role_defaults populados — super=% admin=% mgr=% user=% guest=%',
    v_count_super, v_count_admin, v_count_mgr, v_count_user, v_count_guest;
END $$;

COMMIT;
