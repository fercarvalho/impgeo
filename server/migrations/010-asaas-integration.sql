-- Integração Asaas: coluna para evitar duplicatas na sincronização
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS asaas_id VARCHAR(255) UNIQUE;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS asaas_type VARCHAR(50); -- 'payment' ou 'transfer'

CREATE INDEX IF NOT EXISTS idx_transactions_asaas_id ON transactions(asaas_id);
