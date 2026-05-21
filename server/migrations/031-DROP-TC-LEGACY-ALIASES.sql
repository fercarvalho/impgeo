-- =============================================================================
-- 031 — DROP tc_legacy_aliases (cleanup)
-- =============================================================================
-- Tabela criada na migration 025 com objetivo de redirecionar URLs antigas
-- /v/<share_link_token> → /?u=<username> via handler /v/:token no backend.
--
-- Decisão: não vamos mais dar suporte a essas URLs legadas. Os tc_users
-- migrados (criados via migration 026) acessam normalmente pelo
-- terracontrol.viverdepj.com.br com username/senha. Quem entrava pelo link
-- antigo precisa lembrar do username (informado por email antes da
-- desativação).
--
-- O caminho /v/:token continua existindo no backend pra sub-share links
-- gerados por tc_users (POST /api/tc-auth/me/share-links). Apenas o branch
-- de legacy alias é removido.
--
-- IDEMPOTENTE.
-- =============================================================================

BEGIN;

DROP TABLE IF EXISTS tc_legacy_aliases CASCADE;

COMMIT;
