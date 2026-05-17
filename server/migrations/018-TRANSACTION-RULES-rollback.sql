-- =============================================================================
-- Rollback da Migration 018 — REGRAS AUTOMÁTICAS DE TRANSAÇÕES
-- =============================================================================
-- Reverte tudo que 018-TRANSACTION-RULES.sql aplicou:
--   1. Reverte transações com type='Transferência entre contas' / 'A confirmar'
--      para o original_type (Receita/Despesa); se original_type for NULL,
--      mantém o type atual (caso raro — transação cadastrada manualmente
--      com tipo novo).
--   2. Remove transaction_rule_candidates
--   3. Remove user_rule_permissions
--   4. Remove notifications
--   5. Remove FK applied_rule_id → transaction_rules
--   6. Remove transaction_rules
--   7. Remove colunas extras de transactions
--
-- ATENÇÃO: este rollback apaga TODAS as regras criadas e perde notificações.
-- =============================================================================

BEGIN;

-- 1. Reverter transações com tipos novos para o original (quando possível)
UPDATE transactions
   SET type = original_type
 WHERE type IN ('Transferência entre contas', 'A confirmar')
   AND original_type IS NOT NULL;

-- 2-4. Drop tabelas dependentes
DROP TABLE IF EXISTS transaction_rule_candidates;
DROP TABLE IF EXISTS user_rule_permissions;
DROP TABLE IF EXISTS notifications;

-- 5. Remover FK applied_rule_id
ALTER TABLE transactions
    DROP CONSTRAINT IF EXISTS transactions_applied_rule_id_fkey;

-- 6. Drop transaction_rules
DROP TABLE IF EXISTS transaction_rules;

-- 7. Drop colunas extras de transactions
DROP INDEX IF EXISTS idx_transactions_applied_rule_id;
DROP INDEX IF EXISTS idx_transactions_needs_confirmation;
ALTER TABLE transactions
    DROP COLUMN IF EXISTS applied_rule_id,
    DROP COLUMN IF EXISTS original_type,
    DROP COLUMN IF EXISTS needs_confirmation;

DO $$
DECLARE
    still_has_table BOOLEAN;
BEGIN
    SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'transaction_rules')
      INTO still_has_table;

    IF still_has_table THEN
        RAISE EXCEPTION 'Rollback 018: tabela transaction_rules ainda existe';
    END IF;

    RAISE NOTICE 'Rollback 018 concluído';
END $$;

COMMIT;
