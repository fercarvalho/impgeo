-- Rollback da migration 040 — orçamentos e pagamentos.
--
-- AVISO: drop em cascata destrói histórico de orçamentos, pagamentos e
-- trilha de auditoria. Use apenas em dev/staging ou se tiver backup recente
-- (ver passo 9 do plano: backup-pre-040-YYYY-MM-DD.sql).
--
-- Ordem inversa da criação: ALTERs primeiro (precisam tirar refs pra tc_budgets
-- antes de DROP TABLE), depois tabelas filhas, depois pais.

BEGIN;

-- ALTERs em tabelas existentes
DROP INDEX IF EXISTS idx_terracontrol_budget_status;
ALTER TABLE terracontrol
    DROP COLUMN IF EXISTS budget_status,
    DROP COLUMN IF EXISTS current_budget_id;

ALTER TABLE tc_users
    DROP COLUMN IF EXISTS abacatepay_customer_id;

-- Tabelas novas (ordem inversa de dependências)
DROP INDEX IF EXISTS idx_tc_webhook_events_processed_at;
DROP TABLE IF EXISTS tc_webhook_events;

DROP INDEX IF EXISTS idx_tc_budget_templates_only_one_active;
DROP TABLE IF EXISTS tc_budget_templates;

DROP INDEX IF EXISTS idx_tc_budget_events_budget;
DROP TABLE IF EXISTS tc_budget_events;

DROP INDEX IF EXISTS idx_tc_budget_revision_requests_budget;
DROP TABLE IF EXISTS tc_budget_revision_requests;

DROP INDEX IF EXISTS idx_tc_budget_revisions_budget;
DROP TABLE IF EXISTS tc_budget_revisions;

DROP INDEX IF EXISTS idx_tc_budgets_charge_id;
DROP INDEX IF EXISTS idx_tc_budgets_external_id;
DROP INDEX IF EXISTS idx_tc_budgets_status;
DROP INDEX IF EXISTS idx_tc_budgets_terracontrol_active;
DROP TABLE IF EXISTS tc_budgets;

COMMIT;
