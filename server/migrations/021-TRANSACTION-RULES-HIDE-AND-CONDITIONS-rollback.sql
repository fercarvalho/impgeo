-- Rollback Migration 021
BEGIN;

ALTER TABLE transaction_rules DROP CONSTRAINT IF EXISTS transaction_rules_at_least_one_action_check;
ALTER TABLE transaction_rules
    ADD CONSTRAINT transaction_rules_at_least_one_action_check
    CHECK (action_value IS NOT NULL OR set_category IS NOT NULL OR set_subcategory IS NOT NULL);

ALTER TABLE transaction_rules DROP CONSTRAINT IF EXISTS transaction_rules_value_range_check;

ALTER TABLE transaction_rules
    DROP COLUMN IF EXISTS hide_transaction,
    DROP COLUMN IF EXISTS min_value,
    DROP COLUMN IF EXISTS max_value,
    DROP COLUMN IF EXISTS match_type;

DROP INDEX IF EXISTS idx_transactions_hidden;
ALTER TABLE transactions DROP COLUMN IF EXISTS is_hidden;

DO $$ BEGIN RAISE NOTICE 'Rollback 021 concluído'; END $$;
COMMIT;
