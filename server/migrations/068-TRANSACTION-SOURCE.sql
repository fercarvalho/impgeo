-- 068 - TRANSACTION SOURCE
-- Rastreio de origem da transação: de onde ela veio.
-- Valores: 'manual' | 'import_xlsx' | 'extrato' | 'fatura' | 'asaas'
-- (default 'manual'). Backfill: tudo que tem asaas_id vira 'asaas'; o resto
-- fica 'manual' (origem real desconhecida em transações legadas).

ALTER TABLE transactions ADD COLUMN IF NOT EXISTS source VARCHAR(20) DEFAULT 'manual';

UPDATE transactions
   SET source = 'asaas'
 WHERE asaas_id IS NOT NULL
   AND (source IS NULL OR source = 'manual');

CREATE INDEX IF NOT EXISTS idx_transactions_source ON transactions(source);
