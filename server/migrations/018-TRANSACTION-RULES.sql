-- =============================================================================
-- Migration 018 — REGRAS AUTOMÁTICAS DE TRANSAÇÕES
-- =============================================================================
-- Introduz sistema de regras que classificam automaticamente transações
-- (manual, importação Excel/CSV, Asaas e extrato/fatura bancária):
--
--   1. Expande os tipos válidos de transação:
--        - 'Receita'                     (existente)
--        - 'Despesa'                     (existente)
--        - 'Transferência entre contas'  (novo — azul; ignorado em DRE/Dashboard)
--        - 'A confirmar'                 (novo — roxo; pendente de escolha pelo
--                                          usuário quando 2+ regras dão match)
--
--   2. Tabela transaction_rules: definição das regras (condição + ação),
--      editável pelos admins (e por usuários com permissão granular).
--
--   3. Colunas extras em transactions para rastrear/reverter regras aplicadas:
--        - applied_rule_id      : regra que classificou esta transação
--        - original_type        : tipo antes da regra (para reverter)
--        - needs_confirmation   : true enquanto type='A confirmar'
--
--   4. transaction_rule_candidates: armazena quais regras deram match quando
--      a transação ficou pendente (alimenta o modal de resolução).
--
--   5. notifications: sistema in-app genérico; uso inicial é confirmação de
--      transação, mas serve para outros tipos no futuro.
--
--   6. user_rule_permissions: concessão granular (can_create / can_edit /
--      can_delete) para usuários comuns. Admins/superadmins têm tudo por
--      bypass no backend, sem precisar de linha aqui.
--
-- Tudo em transação. Em caso de erro, rollback automático.
-- Para reverter manualmente após COMMIT: 018-TRANSACTION-RULES-rollback.sql
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. Colunas novas em transactions
-- -----------------------------------------------------------------------------
ALTER TABLE transactions
    ADD COLUMN IF NOT EXISTS applied_rule_id   VARCHAR(255),
    ADD COLUMN IF NOT EXISTS original_type     VARCHAR(50),
    ADD COLUMN IF NOT EXISTS needs_confirmation BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_transactions_applied_rule_id ON transactions(applied_rule_id);
CREATE INDEX IF NOT EXISTS idx_transactions_needs_confirmation ON transactions(needs_confirmation) WHERE needs_confirmation = TRUE;

-- -----------------------------------------------------------------------------
-- 2. Tabela transaction_rules
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS transaction_rules (
    id                   VARCHAR(255) PRIMARY KEY,
    name                 VARCHAR(255) NOT NULL,
    description_contains TEXT         NOT NULL,
    action_type          VARCHAR(50)  NOT NULL CHECK (action_type IN ('change_type')),
    action_value         VARCHAR(100) NOT NULL,
    is_active            BOOLEAN      NOT NULL DEFAULT TRUE,
    sort_order           INTEGER      NOT NULL DEFAULT 0,
    created_by           VARCHAR(255) REFERENCES users(id) ON DELETE SET NULL,
    created_at           TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at           TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_transaction_rules_active     ON transaction_rules(is_active) WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS idx_transaction_rules_sort_order ON transaction_rules(sort_order);

-- FK de applied_rule_id (criada agora que a tabela existe)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE table_name = 'transactions'
          AND constraint_name = 'transactions_applied_rule_id_fkey'
    ) THEN
        ALTER TABLE transactions
            ADD CONSTRAINT transactions_applied_rule_id_fkey
            FOREIGN KEY (applied_rule_id) REFERENCES transaction_rules(id) ON DELETE SET NULL;
    END IF;
END $$;

-- -----------------------------------------------------------------------------
-- 3. transaction_rule_candidates (match em múltiplas regras → pendente)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS transaction_rule_candidates (
    transaction_id VARCHAR(255) NOT NULL REFERENCES transactions(id)      ON DELETE CASCADE,
    rule_id        VARCHAR(255) NOT NULL REFERENCES transaction_rules(id) ON DELETE CASCADE,
    created_at     TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (transaction_id, rule_id)
);

CREATE INDEX IF NOT EXISTS idx_transaction_rule_candidates_tx   ON transaction_rule_candidates(transaction_id);
CREATE INDEX IF NOT EXISTS idx_transaction_rule_candidates_rule ON transaction_rule_candidates(rule_id);

-- -----------------------------------------------------------------------------
-- 4. notifications (in-app, genérica)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS notifications (
    id                  VARCHAR(255) PRIMARY KEY,
    user_id             VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    notification_type   VARCHAR(50)  NOT NULL,
    title               VARCHAR(255) NOT NULL,
    message             TEXT,
    related_entity_type VARCHAR(50),
    related_entity_id   VARCHAR(255),
    is_read             BOOLEAN      NOT NULL DEFAULT FALSE,
    read_at             TIMESTAMPTZ,
    created_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user_id   ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_unread    ON notifications(user_id, is_read) WHERE is_read = FALSE;
CREATE INDEX IF NOT EXISTS idx_notifications_type      ON notifications(notification_type);
CREATE INDEX IF NOT EXISTS idx_notifications_entity    ON notifications(related_entity_type, related_entity_id);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications(created_at DESC);

-- -----------------------------------------------------------------------------
-- 5. user_rule_permissions (permissão granular para gerenciar regras)
-- -----------------------------------------------------------------------------
-- Admins e superadmins têm controle total por bypass no backend — NÃO precisam
-- de linha aqui. Esta tabela é usada apenas para conceder poderes a usuários
-- 'user' ou 'guest' que precisem mexer em regras.
CREATE TABLE IF NOT EXISTS user_rule_permissions (
    user_id    VARCHAR(255) PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    can_create BOOLEAN      NOT NULL DEFAULT FALSE,
    can_edit   BOOLEAN      NOT NULL DEFAULT FALSE,
    can_delete BOOLEAN      NOT NULL DEFAULT FALSE,
    granted_by VARCHAR(255) REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_user_rule_permissions_granted_by ON user_rule_permissions(granted_by);

-- -----------------------------------------------------------------------------
-- Validações finais
-- -----------------------------------------------------------------------------
DO $$
DECLARE
    has_applied_rule_id BOOLEAN;
    has_original_type   BOOLEAN;
    has_needs_confirm   BOOLEAN;
BEGIN
    SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'transactions' AND column_name = 'applied_rule_id'
    ) INTO has_applied_rule_id;

    SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'transactions' AND column_name = 'original_type'
    ) INTO has_original_type;

    SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'transactions' AND column_name = 'needs_confirmation'
    ) INTO has_needs_confirm;

    IF NOT (has_applied_rule_id AND has_original_type AND has_needs_confirm) THEN
        RAISE EXCEPTION 'Migração 018: colunas novas de transactions não foram criadas';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'transaction_rules') THEN
        RAISE EXCEPTION 'Migração 018: tabela transaction_rules não foi criada';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'transaction_rule_candidates') THEN
        RAISE EXCEPTION 'Migração 018: tabela transaction_rule_candidates não foi criada';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'notifications') THEN
        RAISE EXCEPTION 'Migração 018: tabela notifications não foi criada';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'user_rule_permissions') THEN
        RAISE EXCEPTION 'Migração 018: tabela user_rule_permissions não foi criada';
    END IF;

    RAISE NOTICE 'Migração 018 concluída: 4 tabelas novas + 3 colunas em transactions';
END $$;

COMMIT;
