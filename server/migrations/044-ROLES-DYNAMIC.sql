-- =============================================================================
-- Migration 044: roles dinâmicas
-- =============================================================================
--
-- Antes: users.role era CHECK fixo a 5 valores hardcoded (superadmin, admin,
-- manager, user, guest). Defaults estavam em role_default_permissions também
-- com CHECK fixo.
--
-- Agora: tabela `roles` é a fonte da verdade. As 5 atuais ficam marcadas como
-- is_system=true — não podem ser deletadas nem ter a key renomeada (o código
-- tem bypass específico pra superadmin/admin em vários lugares). Labels e
-- descrições delas continuam editáveis. Superadmin pode criar roles novas
-- via UI; essas se comportam como user/manager comum (gateadas só pela
-- matriz granular).
--
-- users.role e role_default_permissions.role passam a ser FK em roles.key,
-- com ON UPDATE CASCADE (renames de keys de roles custom refletem em users)
-- e ON DELETE RESTRICT (delete só passa se não houver usuário associado;
-- role_default_permissions cascateia separado).
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. Tabela roles
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS roles (
  key         VARCHAR(50)  PRIMARY KEY,
  label       VARCHAR(100) NOT NULL,
  description TEXT,
  is_system   BOOLEAN      NOT NULL DEFAULT FALSE,
  sort_order  INTEGER      NOT NULL DEFAULT 100,
  created_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (key ~ '^[a-z][a-z0-9_]*$')  -- snake_case lowercase
);

-- Seed: 5 roles do sistema (is_system=true)
INSERT INTO roles (key, label, description, is_system, sort_order) VALUES
  ('superadmin', 'Super Administrador', 'Controle total do sistema; gerencia funções, padrões e segurança.', TRUE, 10),
  ('admin',      'Administrador',       'Gerencia usuários e módulos; edita os 4 subsistemas operacionais.',  TRUE, 20),
  ('manager',    'Gerente',             'Intermediário entre Admin e Usuário; edita os 4 subsistemas.',       TRUE, 30),
  ('user',       'Usuário',             'Acesso padrão ao sistema.',                                          TRUE, 40),
  ('guest',      'Convidado',           'Acesso somente leitura.',                                            TRUE, 50)
ON CONFLICT (key) DO NOTHING;

-- -----------------------------------------------------------------------------
-- 2. users.role: trocar CHECK por FK em roles(key)
-- -----------------------------------------------------------------------------
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users
  ADD CONSTRAINT users_role_fkey
    FOREIGN KEY (role) REFERENCES roles(key)
    ON UPDATE CASCADE
    ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);

-- -----------------------------------------------------------------------------
-- 3. role_default_permissions.role: trocar CHECK por FK
-- -----------------------------------------------------------------------------
-- Drop o CHECK in-line do role (estava como CHECK (role IN (...)) na 043)
ALTER TABLE role_default_permissions
  DROP CONSTRAINT IF EXISTS role_default_permissions_role_check;
ALTER TABLE role_default_permissions
  ADD CONSTRAINT role_default_permissions_role_fkey
    FOREIGN KEY (role) REFERENCES roles(key)
    ON UPDATE CASCADE
    ON DELETE CASCADE;

-- -----------------------------------------------------------------------------
-- 4. Validação
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  v_roles_count INTEGER;
  v_orphan_users INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_roles_count FROM roles;
  IF v_roles_count < 5 THEN
    RAISE EXCEPTION 'Esperado pelo menos 5 roles (sistema), tem %', v_roles_count;
  END IF;

  -- Confirma que nenhum user ficou com role inválida (a FK pegaria, mas
  -- explicitamos a checagem)
  SELECT COUNT(*) INTO v_orphan_users
    FROM users u LEFT JOIN roles r ON r.key = u.role
   WHERE r.key IS NULL;
  IF v_orphan_users > 0 THEN
    RAISE EXCEPTION '% usuários com role inexistente em roles', v_orphan_users;
  END IF;

  RAISE NOTICE '✓ Migration 044: roles dinâmicas — % roles cadastradas (5 system + custom)', v_roles_count;
END $$;

COMMIT;
