-- =============================================================================
-- Rollback Migration 019 — REGRAS COM MÚLTIPLAS AÇÕES
-- =============================================================================
-- ATENÇÃO: regras que dependiam apenas de set_category/set_subcategory (sem
-- action_value) ficarão INVÁLIDAS após o rollback (action_value voltará a ser
-- NOT NULL). Para essas regras, preencha action_value antes de rodar este
-- rollback, ou aceite que serão deletadas/falharão.
-- =============================================================================

BEGIN;

-- 1. Drop constraint
ALTER TABLE transaction_rules
    DROP CONSTRAINT IF EXISTS transaction_rules_at_least_one_action_check;

-- 2. Drop colunas extras
ALTER TABLE transaction_rules
    DROP COLUMN IF EXISTS set_category,
    DROP COLUMN IF EXISTS set_subcategory;

ALTER TABLE transactions
    DROP COLUMN IF EXISTS original_category,
    DROP COLUMN IF EXISTS original_subcategory;

-- 3. Restaurar NOT NULL em action_value (preenche '' se houver NULLs órfãos)
UPDATE transaction_rules SET action_value = '' WHERE action_value IS NULL;
ALTER TABLE transaction_rules
    ALTER COLUMN action_value SET NOT NULL;

DO $$
BEGIN
    RAISE NOTICE 'Rollback 019 concluído';
END $$;

COMMIT;
