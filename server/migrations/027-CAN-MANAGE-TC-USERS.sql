-- =============================================================================
-- 027 — Permissão delegada: can_manage_tc_users
-- =============================================================================
-- Adiciona uma flag boolean em `users` que, quando TRUE, autoriza um usuário
-- com role != 'admin'/'superadmin' a acessar os endpoints /api/admin/tc-users/*.
--
-- Caso de uso: cliente parceiro recebe um login do tipo `role=user` no impgeo
-- só para gerenciar os usuários TerraControl da sua carteira, sem dar acesso
-- aos outros módulos admin do impgeo.
--
-- Apenas superadmin pode ligar/desligar essa flag (controlado no backend).
--
-- IDEMPOTENTE: usa IF NOT EXISTS.
-- =============================================================================

BEGIN;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS can_manage_tc_users BOOLEAN NOT NULL DEFAULT FALSE;

-- Index para queries que filtram por essa flag (raras, mas baratas)
CREATE INDEX IF NOT EXISTS idx_users_can_manage_tc_users
  ON users(can_manage_tc_users)
  WHERE can_manage_tc_users = TRUE;

COMMIT;
