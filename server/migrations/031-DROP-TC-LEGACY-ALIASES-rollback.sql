-- Rollback de 031: recria tc_legacy_aliases vazia. Os aliases originais NÃO
-- voltam — eles foram populados na migration 026, que precisaria ser re-rodada
-- para repovoar. Reverter este drop só refaz a estrutura, não os dados.
BEGIN;

CREATE TABLE IF NOT EXISTS tc_legacy_aliases (
  share_link_token  VARCHAR(255) PRIMARY KEY,
  tc_user_id        VARCHAR(255) NOT NULL REFERENCES tc_users(id) ON DELETE CASCADE,
  redirect_used_at  TIMESTAMPTZ,
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

COMMIT;
