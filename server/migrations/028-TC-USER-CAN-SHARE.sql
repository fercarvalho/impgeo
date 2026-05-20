-- =============================================================================
-- 028 — tc_users.can_share: permissão de gerar sub-share links
-- =============================================================================
-- Tc_users marcados com can_share=TRUE conseguem gerar links anônimos
-- (share_links) a partir dos imóveis aos quais eles têm acesso. Tc_users com
-- can_share=FALSE só conseguem visualizar (login deles + lista de registros)
-- e não veem o botão "Compartilhar" na tela.
--
-- Padrão FALSE: a permissão é deliberadamente off por default — o admin liga
-- caso a caso. Tc_users migrados de share_links antigos ficam off também.
--
-- Sub-share links continuam sendo criados via POST /api/tc-auth/me/share-links
-- (endpoint já existente desde a fase 1).
--
-- IDEMPOTENTE.
-- =============================================================================

BEGIN;

ALTER TABLE tc_users
  ADD COLUMN IF NOT EXISTS can_share BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_tc_users_can_share
  ON tc_users(can_share)
  WHERE can_share = TRUE;

COMMIT;
