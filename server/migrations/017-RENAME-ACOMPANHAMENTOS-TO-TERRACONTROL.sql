-- =============================================================================
-- 017 — RENAME acompanhamentos → terracontrol
-- =============================================================================
-- Objetivo: renomear a tabela "acompanhamentos" para "terracontrol", renomear
-- o índice associado e atualizar a entrada correspondente em modules_catalog.
--
-- Esta migration é IDEMPOTENTE: pode ser executada múltiplas vezes sem efeito
-- colateral (usa IF EXISTS / verificações condicionais).
--
-- Executar com: psql ... -f 017-RENAME-ACOMPANHAMENTOS-TO-TERRACONTROL.sql
-- =============================================================================

BEGIN;

-- 1. Renomear tabela (se ainda existir com o nome antigo)
DO $$
BEGIN
    IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'acompanhamentos')
       AND NOT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'terracontrol') THEN
        ALTER TABLE acompanhamentos RENAME TO terracontrol;
        RAISE NOTICE 'Tabela acompanhamentos renomeada para terracontrol';
    ELSIF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'terracontrol') THEN
        RAISE NOTICE 'Tabela terracontrol já existe — nenhuma ação necessária';
    ELSE
        RAISE NOTICE 'Nenhuma tabela acompanhamentos encontrada — nenhuma ação necessária';
    END IF;
END $$;

-- 2. Renomear índice (se existir com o nome antigo)
DO $$
BEGIN
    IF EXISTS (SELECT FROM pg_indexes WHERE indexname = 'idx_acompanhamentos_cod_imovel')
       AND NOT EXISTS (SELECT FROM pg_indexes WHERE indexname = 'idx_terracontrol_cod_imovel') THEN
        ALTER INDEX idx_acompanhamentos_cod_imovel RENAME TO idx_terracontrol_cod_imovel;
        RAISE NOTICE 'Índice idx_acompanhamentos_cod_imovel renomeado';
    END IF;
END $$;

-- 3. Atualizar modules_catalog: chave, nome, rota e descrição
UPDATE modules_catalog
SET module_key  = 'terracontrol',
    module_name = 'TerraControl',
    route_path  = 'terracontrol',
    description = 'Controle e acompanhamento de imóveis rurais'
WHERE module_key = 'acompanhamentos';

-- 4. Atualizar referências em user_module_permissions (caso a FK não cascateie)
-- Observação: se a FK estiver com ON UPDATE CASCADE, este UPDATE é redundante.
UPDATE user_module_permissions
SET module_key = 'terracontrol'
WHERE module_key = 'acompanhamentos';

COMMIT;
