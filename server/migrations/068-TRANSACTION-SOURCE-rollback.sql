-- Rollback da 068 - TRANSACTION SOURCE
DROP INDEX IF EXISTS idx_transactions_source;
ALTER TABLE transactions DROP COLUMN IF EXISTS source;
