-- =============================================================================
-- 041 — tc_record_events: audit log do ciclo de vida do registro TerraControl
-- =============================================================================
-- Hoje o `tc_budget_events` cobre o ciclo comercial do orçamento, mas ações
-- diretas sobre o registro (cadastro inicial, edições, aprovações manuais)
-- ficavam sem trilha de auditoria. Histórico completo do imóvel agora junta
-- eventos das duas tabelas no front.
--
-- Tipos esperados em event_type:
--   created             registro criado (admin via POST /api/terracontrol OU
--                       tc_user via POST /api/tc-auth/me/records)
--   edited              UPDATE no registro (admin OU tc_user)
--   approved            terracontrol.approved = TRUE (admin via /approve OU
--                       webhook AbacatePay marcando budget como paid)
--   unapproved          terracontrol.approved = FALSE (admin via /unapprove)
--   deleted             registro removido (não persistido se o CASCADE drop
--                       remove a linha; rar, é mais pra refundgia futura)
--
-- payload guarda detalhes específicos do evento, ex.: lista de campos
-- alterados em 'edited', motivo de approve/unapprove, etc.
--
-- IDEMPOTENTE.
-- =============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS tc_record_events (
    id              VARCHAR(255) PRIMARY KEY,
    terracontrol_id VARCHAR(255) NOT NULL REFERENCES terracontrol(id) ON DELETE CASCADE,
    event_type      VARCHAR(64)  NOT NULL,
    actor_type      VARCHAR(16)  NOT NULL,
    actor_id        VARCHAR(255),
    payload         JSONB,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    CONSTRAINT tc_record_events_actor_type_check
        CHECK (actor_type IN ('impgeo','tc','system','abacatepay'))
);

CREATE INDEX IF NOT EXISTS idx_tc_record_events_terracontrol
    ON tc_record_events(terracontrol_id, created_at DESC);

COMMIT;
