-- =============================================================================
-- 040 — Orçamentos e pagamentos AbacatePay no TerraControl
-- =============================================================================
-- Fecha o loop comercial do TerraControl: tc_user cadastra imóvel → admin gera
-- orçamento → tc_user aprova e paga via PIX → imóvel é aprovado automaticamente.
--
-- Tabelas (todas IF NOT EXISTS — idempotente):
--
--   tc_budgets                    Orçamento ativo por registro do terracontrol.
--                                 Estado denormalizado: status + snapshot do
--                                 pagamento AbacatePay vigente (br_code, expires_at).
--   tc_budget_revisions           Snapshots imutáveis (v1, v2, ...) com conteúdo
--                                 TipTap + itens + PDF gerado.
--   tc_budget_revision_requests   Pedidos de alteração do tc_user. Fonte = 'tc_user'
--                                 (manual via UI) ou 'auto_edit' (PUT no registro
--                                 reabriu o ciclo).
--   tc_budget_events              Trilha de auditoria. Cada transição de status
--                                 ou ação do dispatcher grava 1 linha.
--   tc_budget_templates           Template padrão do orçamento (1 ativo MVP).
--                                 Conteúdo em TipTap JSON + itens default.
--                                 Suporta variáveis {{imovel}}, {{municipio}}, etc.
--   tc_webhook_events             Idempotência de webhooks por (provider, event_id).
--                                 Hoje só 'abacatepay'.
--
-- ALTERs:
--   tc_users.abacatepay_customer_id     Cache do cust_xxx (upsert por taxId).
--   terracontrol.current_budget_id      Lookup rápido do budget ativo.
--   terracontrol.budget_status          Denormalizado pra listagem (badges, gates).
--                                       NULL = registro legado (sem budget); ciclo
--                                       de orçamento só é obrigatório pra registros
--                                       novos criados após esta migration.
--
-- State machine do tc_budgets.status (consumida pelo budget-service):
--   draft → sent → revision_requested → sent → ... → awaiting_payment → paid
--                                                                     ↓
--                                                              (terracontrol.approved=TRUE)
--   admin pode cancelar a qualquer momento exceto paid.
--
-- IDEMPOTENTE.
-- =============================================================================

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- tc_budgets — 1 orçamento ativo por terracontrol.id
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tc_budgets (
    id                          VARCHAR(255) PRIMARY KEY,
    terracontrol_id             VARCHAR(255) NOT NULL REFERENCES terracontrol(id) ON DELETE CASCADE,
    status                      VARCHAR(32)  NOT NULL DEFAULT 'draft',
    current_revision            INTEGER      NOT NULL DEFAULT 0,
    total_amount_cents          INTEGER      NOT NULL DEFAULT 0,
    current_pdf_url             TEXT,
    abacatepay_charge_id        VARCHAR(255),
    abacatepay_external_id      VARCHAR(255),
    abacatepay_br_code          TEXT,
    abacatepay_br_code_base64   TEXT,
    abacatepay_expires_at       TIMESTAMPTZ,
    abacatepay_attempt          INTEGER      NOT NULL DEFAULT 0,
    paid_at                     TIMESTAMPTZ,
    paid_amount_cents           INTEGER,
    created_at                  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    created_by_user_id          VARCHAR(255) REFERENCES users(id),
    updated_at                  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    CONSTRAINT tc_budgets_status_check
        CHECK (status IN ('draft','sent','revision_requested','awaiting_payment','paid','cancelled'))
);

-- Garante 1 budget ativo por imóvel (cancelled não conta).
CREATE UNIQUE INDEX IF NOT EXISTS idx_tc_budgets_terracontrol_active
    ON tc_budgets(terracontrol_id) WHERE status <> 'cancelled';

CREATE INDEX IF NOT EXISTS idx_tc_budgets_status
    ON tc_budgets(status);

-- Lookup do webhook (externalId no payload AbacatePay → budget).
CREATE INDEX IF NOT EXISTS idx_tc_budgets_external_id
    ON tc_budgets(abacatepay_external_id) WHERE abacatepay_external_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_tc_budgets_charge_id
    ON tc_budgets(abacatepay_charge_id) WHERE abacatepay_charge_id IS NOT NULL;


-- ─────────────────────────────────────────────────────────────────────────────
-- tc_budget_revisions — snapshots imutáveis por versão
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tc_budget_revisions (
    id                       VARCHAR(255) PRIMARY KEY,
    budget_id                VARCHAR(255) NOT NULL REFERENCES tc_budgets(id) ON DELETE CASCADE,
    revision_number          INTEGER      NOT NULL,
    content_json             JSONB        NOT NULL,
    content_html_snapshot    TEXT,
    items                    JSONB        NOT NULL DEFAULT '[]'::jsonb,
    total_amount_cents       INTEGER      NOT NULL,
    pdf_url                  TEXT,
    created_at               TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    created_by_user_id       VARCHAR(255) REFERENCES users(id),
    CONSTRAINT tc_budget_revisions_unique_per_budget
        UNIQUE (budget_id, revision_number),
    CONSTRAINT tc_budget_revisions_revision_positive
        CHECK (revision_number >= 1)
);

CREATE INDEX IF NOT EXISTS idx_tc_budget_revisions_budget
    ON tc_budget_revisions(budget_id, revision_number DESC);


-- ─────────────────────────────────────────────────────────────────────────────
-- tc_budget_revision_requests — pedidos de alteração do tc_user
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tc_budget_revision_requests (
    id                       VARCHAR(255) PRIMARY KEY,
    budget_id                VARCHAR(255) NOT NULL REFERENCES tc_budgets(id) ON DELETE CASCADE,
    against_revision_number  INTEGER      NOT NULL,
    comment                  TEXT,
    source                   VARCHAR(16)  NOT NULL DEFAULT 'tc_user',
    created_at               TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    created_by_tc_user_id    VARCHAR(255) REFERENCES tc_users(id),
    CONSTRAINT tc_budget_revision_requests_source_check
        CHECK (source IN ('tc_user','auto_edit'))
);

CREATE INDEX IF NOT EXISTS idx_tc_budget_revision_requests_budget
    ON tc_budget_revision_requests(budget_id, created_at DESC);


-- ─────────────────────────────────────────────────────────────────────────────
-- tc_budget_events — trilha de auditoria
-- ─────────────────────────────────────────────────────────────────────────────
-- Tipos esperados:
--   created, sent, revised, revision_requested, accepted,
--   payment_initiated, payment_completed, payment_completed_unexpected,
--   payment_expired, payment_refunded, payment_disputed, cancelled
CREATE TABLE IF NOT EXISTS tc_budget_events (
    id           VARCHAR(255) PRIMARY KEY,
    budget_id    VARCHAR(255) NOT NULL REFERENCES tc_budgets(id) ON DELETE CASCADE,
    event_type   VARCHAR(64)  NOT NULL,
    actor_type   VARCHAR(16)  NOT NULL,
    actor_id     VARCHAR(255),
    payload      JSONB,
    created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    CONSTRAINT tc_budget_events_actor_type_check
        CHECK (actor_type IN ('impgeo','tc','system','abacatepay'))
);

CREATE INDEX IF NOT EXISTS idx_tc_budget_events_budget
    ON tc_budget_events(budget_id, created_at DESC);


-- ─────────────────────────────────────────────────────────────────────────────
-- tc_budget_templates — template padrão (1 ativo MVP)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tc_budget_templates (
    id                 VARCHAR(255) PRIMARY KEY,
    name               VARCHAR(255) NOT NULL DEFAULT 'Padrão',
    content_json       JSONB        NOT NULL,
    default_items      JSONB        NOT NULL DEFAULT '[]'::jsonb,
    is_active          BOOLEAN      NOT NULL DEFAULT TRUE,
    updated_at         TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_by_user_id VARCHAR(255) REFERENCES users(id)
);

-- Garante exatamente 1 template ativo por vez. Quando precisarmos suportar
-- múltiplos no futuro, basta dropar este índice.
CREATE UNIQUE INDEX IF NOT EXISTS idx_tc_budget_templates_only_one_active
    ON tc_budget_templates((TRUE)) WHERE is_active = TRUE;


-- ─────────────────────────────────────────────────────────────────────────────
-- tc_webhook_events — idempotência de webhooks
-- ─────────────────────────────────────────────────────────────────────────────
-- PK composta (provider, event_id) garante dedupe. Insert com ON CONFLICT
-- DO NOTHING devolve 0 linhas afetadas → handler sabe que é replay.
CREATE TABLE IF NOT EXISTS tc_webhook_events (
    provider     VARCHAR(32)  NOT NULL,
    event_id     VARCHAR(255) NOT NULL,
    event_type   VARCHAR(64)  NOT NULL,
    payload      JSONB,
    processed_at TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    PRIMARY KEY (provider, event_id)
);

CREATE INDEX IF NOT EXISTS idx_tc_webhook_events_processed_at
    ON tc_webhook_events(processed_at DESC);


-- ─────────────────────────────────────────────────────────────────────────────
-- ALTER tc_users — cache do customer AbacatePay
-- ─────────────────────────────────────────────────────────────────────────────
-- Upsert na API AbacatePay é por taxId, mas guardar o cust_xxx aqui evita
-- bater na API toda vez que vamos cobrar.
ALTER TABLE tc_users
    ADD COLUMN IF NOT EXISTS abacatepay_customer_id VARCHAR(255);


-- ─────────────────────────────────────────────────────────────────────────────
-- ALTER terracontrol — vínculo com budget ativo + status denormalizado
-- ─────────────────────────────────────────────────────────────────────────────
-- current_budget_id: FK pro budget mais recente NÃO cancelado.
-- budget_status: NULL = registro legado (sem ciclo de orçamento). Senão
--                espelha tc_budgets.status do current_budget_id e é mantido
--                pelo budget-service (não há trigger pra economizar overhead).
ALTER TABLE terracontrol
    ADD COLUMN IF NOT EXISTS current_budget_id VARCHAR(255)
        REFERENCES tc_budgets(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS budget_status     VARCHAR(32);

CREATE INDEX IF NOT EXISTS idx_terracontrol_budget_status
    ON terracontrol(budget_status) WHERE budget_status IS NOT NULL;

COMMIT;
