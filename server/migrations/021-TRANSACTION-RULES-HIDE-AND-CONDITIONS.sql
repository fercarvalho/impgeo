-- =============================================================================
-- Migration 021 — REGRAS: ação "Ignorar" + condições de valor e tipo
-- =============================================================================
-- Expande o motor de regras:
--
--   AÇÕES (transaction_rules):
--   - hide_transaction (BOOLEAN) — quando TRUE, marca a transação como
--     "oculta": não conta em DRE/Dashboard e fica fora da lista por padrão
--     (com toggle para exibir). Atende casos como duplicatas, taxas
--     irrelevantes, estornos automáticos.
--
--   CONDIÇÕES (transaction_rules):
--   - min_value (DECIMAL) — valor mínimo (inclusive) para a regra casar.
--     Útil para diferenciar tarifas de descrições genéricas (ex: PIX recebido
--     pode ser R$ 50 ou R$ 5000).
--   - max_value (DECIMAL) — valor máximo (inclusive).
--   - match_type (VARCHAR) — exige que a transação tenha tipo X para casar.
--     Quando NULL, casa qualquer tipo. Útil para evitar pegar transações
--     com tipo errado.
--
--   ESTADO DA TRANSAÇÃO:
--   - is_hidden (BOOLEAN) em transactions — flag aplicada por regra de
--     "Ignorar". DRE/Dashboard/Relatórios passam a filtrar por
--     is_hidden = FALSE adicionalmente ao filtro de tipo.
--
-- Tudo em transação. Rollback disponível.
-- =============================================================================

BEGIN;

-- 1. Novas colunas em transaction_rules
ALTER TABLE transaction_rules
    ADD COLUMN IF NOT EXISTS hide_transaction BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS min_value        DECIMAL(12, 2),
    ADD COLUMN IF NOT EXISTS max_value        DECIMAL(12, 2),
    ADD COLUMN IF NOT EXISTS match_type       VARCHAR(50);

-- 2. Constraint at_least_one_action passa a aceitar hide_transaction como ação válida
ALTER TABLE transaction_rules DROP CONSTRAINT IF EXISTS transaction_rules_at_least_one_action_check;
ALTER TABLE transaction_rules
    ADD CONSTRAINT transaction_rules_at_least_one_action_check
    CHECK (
        action_value IS NOT NULL
        OR set_category IS NOT NULL
        OR set_subcategory IS NOT NULL
        OR hide_transaction = TRUE
    );

-- 3. Coerência: se min_value e max_value definidos, min <= max
ALTER TABLE transaction_rules DROP CONSTRAINT IF EXISTS transaction_rules_value_range_check;
ALTER TABLE transaction_rules
    ADD CONSTRAINT transaction_rules_value_range_check
    CHECK (
        min_value IS NULL OR max_value IS NULL OR min_value <= max_value
    );

-- 4. is_hidden em transactions
ALTER TABLE transactions
    ADD COLUMN IF NOT EXISTS is_hidden BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_transactions_hidden ON transactions(is_hidden) WHERE is_hidden = TRUE;

DO $$
DECLARE
    has_hide   BOOLEAN;
    has_minv   BOOLEAN;
    has_maxv   BOOLEAN;
    has_mtype  BOOLEAN;
    has_thide  BOOLEAN;
BEGIN
    SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='transaction_rules' AND column_name='hide_transaction') INTO has_hide;
    SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='transaction_rules' AND column_name='min_value') INTO has_minv;
    SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='transaction_rules' AND column_name='max_value') INTO has_maxv;
    SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='transaction_rules' AND column_name='match_type') INTO has_mtype;
    SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='transactions' AND column_name='is_hidden') INTO has_thide;
    IF NOT (has_hide AND has_minv AND has_maxv AND has_mtype AND has_thide) THEN
        RAISE EXCEPTION 'Migração 021: colunas não criadas corretamente';
    END IF;
    RAISE NOTICE 'Migração 021 concluída: hide_transaction + min/max value + match_type + is_hidden';
END $$;

COMMIT;
