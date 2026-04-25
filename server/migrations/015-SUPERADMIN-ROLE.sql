-- Adiciona a role 'superadmin' ao constraint da tabela users
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check
  CHECK (role::text = ANY (ARRAY[
    'admin'::character varying,
    'user'::character varying,
    'guest'::character varying,
    'superadmin'::character varying
  ]::text[]));
