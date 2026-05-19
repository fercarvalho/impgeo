-- =============================================================================
-- 017 ROLLBACK — Reverter: terracontrol → acompanhamentos
-- =============================================================================
-- Reverte a migration 017, voltando a tabela e o módulo aos nomes originais.
-- Idempotente: pode ser executada múltiplas vezes sem efeito colateral.
-- =============================================================================

BEGIN;

-- 1. Renomear tabela de volta
DO $$
BEGIN
    IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'terracontrol')
       AND NOT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'acompanhamentos') THEN
        ALTER TABLE terracontrol RENAME TO acompanhamentos;
        RAISE NOTICE 'Tabela terracontrol renomeada de volta para acompanhamentos';
    END IF;
END $$;

-- 2. Renomear índice de volta
DO $$
BEGIN
    IF EXISTS (SELECT FROM pg_indexes WHERE indexname = 'idx_terracontrol_cod_imovel')
       AND NOT EXISTS (SELECT FROM pg_indexes WHERE indexname = 'idx_acompanhamentos_cod_imovel') THEN
        ALTER INDEX idx_terracontrol_cod_imovel RENAME TO idx_acompanhamentos_cod_imovel;
    END IF;
END $$;

-- 3. Reverter modules_catalog
UPDATE modules_catalog
SET module_key  = 'acompanhamentos',
    module_name = 'Acompanhamentos',
    route_path  = 'acompanhamentos',
    description = 'Acompanhamento operacional'
WHERE module_key = 'terracontrol';

-- 4. Reverter user_module_permissions
UPDATE user_module_permissions
SET module_key = 'acompanhamentos'
WHERE module_key = 'terracontrol';

COMMIT;
