-- =============================================================================
-- Migration 019 — REGRAS COM MÚLTIPLAS AÇÕES (tipo + categoria + subcategoria)
-- =============================================================================
-- Expande transaction_rules para permitir que uma regra modifique mais de
-- um campo da transação:
--   - action_value (renomeado semanticamente para "tipo destino", agora NULLABLE)
--   - set_category (novo, NULLABLE)
--   - set_subcategory (novo, NULLABLE)
--
-- A regra aplica QUAISQUER campos não-nulos. A constraint exige pelo menos um.
--
-- Também adiciona colunas em transactions para permitir reverter cada campo:
--   - original_category
--   - original_subcategory
-- (já tínhamos original_type da migration 018)
--
-- Tudo em transação. Para reverter manualmente após COMMIT:
-- 019-TRANSACTION-RULES-MULTI-ACTION-rollback.sql
-- =============================================================================

BEGIN;

-- 1. Tornar action_value nullable
ALTER TABLE transaction_rules
    ALTER COLUMN action_value DROP NOT NULL;

-- 2. Adicionar set_category e set_subcategory
ALTER TABLE transaction_rules
    ADD COLUMN IF NOT EXISTS set_category    VARCHAR(255),
    ADD COLUMN IF NOT EXISTS set_subcategory VARCHAR(255);

-- 3. Adicionar constraint: pelo menos uma ação deve estar definida
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE table_name = 'transaction_rules'
          AND constraint_name = 'transaction_rules_at_least_one_action_check'
    ) THEN
        ALTER TABLE transaction_rules
            ADD CONSTRAINT transaction_rules_at_least_one_action_check
            CHECK (
                action_value IS NOT NULL
                OR set_category IS NOT NULL
                OR set_subcategory IS NOT NULL
            );
    END IF;
END $$;

-- 4. Colunas em transactions para reverter categoria/subcategoria
ALTER TABLE transactions
    ADD COLUMN IF NOT EXISTS original_category    VARCHAR(255),
    ADD COLUMN IF NOT EXISTS original_subcategory VARCHAR(255);

-- Validações finais
DO $$
DECLARE
    has_set_cat BOOLEAN;
    has_set_sub BOOLEAN;
    has_orig_cat BOOLEAN;
    has_orig_sub BOOLEAN;
BEGIN
    SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='transaction_rules' AND column_name='set_category') INTO has_set_cat;
    SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='transaction_rules' AND column_name='set_subcategory') INTO has_set_sub;
    SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='transactions' AND column_name='original_category') INTO has_orig_cat;
    SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='transactions' AND column_name='original_subcategory') INTO has_orig_sub;

    IF NOT (has_set_cat AND has_set_sub AND has_orig_cat AND has_orig_sub) THEN
        RAISE EXCEPTION 'Migração 019: colunas não foram criadas corretamente';
    END IF;

    RAISE NOTICE 'Migração 019 concluída: regras agora suportam tipo + categoria + subcategoria';
END $$;

COMMIT;
