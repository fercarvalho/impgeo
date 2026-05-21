-- =============================================================================
-- 032 — Invalida hash de 'tc123' em tc_users migrados que nunca logaram
-- =============================================================================
-- Mitigação retroativa do problema:
--   A migration 026 atribuiu bcrypt('tc123', 10) como senha default pra
--   tc_users vindos de share_links SEM senha original. Esses tc_users ficaram
--   com force_password_change=TRUE.
--
--   Risco: quem nunca fez o 1º login ainda aceita 'tc123' (senha conhecida
--   publicamente — está no histórico do git em migration 026 + commits).
--
-- Esta migration:
--   Pra cada tc_user com (created_via='migrated' AND last_login IS NULL AND
--   force_password_change=TRUE), substitui o hash de senha por uma string
--   formato bcrypt-like mas com bytes aleatórios — efetivamente bloqueia o
--   login (bcrypt.compare retorna false). O tc_user precisa usar "Esqueci
--   minha senha" pra recuperar acesso, ou pedir reset ao admin.
--
-- Não usa pgcrypto (não disponível na VPS sem superuser). Usa md5(random()::text)
-- duas vezes pra gerar 64 chars hex após o prefixo bcrypt — esse formato não
-- é parseável por bcrypt, então bcrypt.compare retorna false.
--
-- IDEMPOTENTE: a coluna password é sobrescrita cada vez. Re-run não é
-- destrutivo (gera novo hash inválido, mas o login continua bloqueado).
-- =============================================================================

BEGIN;

DO $$
DECLARE
  affected INTEGER;
BEGIN
  -- Contagem antes (pra audit no NOTICE)
  SELECT COUNT(*) INTO affected
    FROM tc_users
   WHERE created_via = 'migrated'
     AND last_login IS NULL
     AND force_password_change = TRUE;

  -- random() é volatile, então é avaliado por linha no UPDATE. md5 retorna
  -- 32 chars hex. Concatenando dois md5, dá 64 chars depois do prefixo bcrypt.
  UPDATE tc_users
     SET password = '$2b$10$'
                 || md5(random()::text || id || clock_timestamp()::text)
                 || md5(random()::text || id || created_at::text),
         updated_at = NOW()
   WHERE created_via = 'migrated'
     AND last_login IS NULL
     AND force_password_change = TRUE;

  RAISE NOTICE 'Migration 032 OK: % tc_users tiveram senha tc123 invalidada (login bloqueado até reset por email/admin)',
    affected;
END $$;

COMMIT;
