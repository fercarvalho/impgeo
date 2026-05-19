-- =============================================================================
-- 022 — RENAME acompanhamentos → terracontrol
-- =============================================================================
-- Objetivo: renomear a tabela "acompanhamentos" para "terracontrol", renomear
-- o índice associado, atualizar a entrada correspondente em modules_catalog
-- e propagar a mudança em user_module_permissions (a FK não tem
-- ON UPDATE CASCADE, então precisamos remover/recriar a constraint).
--
-- Cenário considerado: após o deploy do código novo, o seed do servidor
-- pode ter INSERIDO uma linha duplicada com module_key='terracontrol' antes
-- desta migration rodar. A migration trata este caso removendo o duplicado
-- antes de renomear a linha antiga.
--
-- IDEMPOTENTE: pode ser executada múltiplas vezes sem efeito colateral.
--
-- Executar com: psql ... -f 022-RENAME-ACOMPANHAMENTOS-TO-TERRACONTROL.sql
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Renomear tabela (se ainda existir com o nome antigo)
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- 2. Renomear índice (se existir com o nome antigo)
-- ---------------------------------------------------------------------------
DO $$
BEGIN
    IF EXISTS (SELECT FROM pg_indexes WHERE indexname = 'idx_acompanhamentos_cod_imovel')
       AND NOT EXISTS (SELECT FROM pg_indexes WHERE indexname = 'idx_terracontrol_cod_imovel') THEN
        ALTER INDEX idx_acompanhamentos_cod_imovel RENAME TO idx_terracontrol_cod_imovel;
        RAISE NOTICE 'Índice idx_acompanhamentos_cod_imovel renomeado';
    END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 3. Migrar modules_catalog e user_module_permissions
--    A FK user_module_permissions.module_key → modules_catalog.module_key NÃO
--    tem ON UPDATE CASCADE, então removemos a FK temporariamente, atualizamos
--    as duas tabelas e recriamos a FK.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
    has_old BOOLEAN;
    has_new BOOLEAN;
    fk_constraint_name TEXT;
BEGIN
    SELECT EXISTS (SELECT FROM modules_catalog WHERE module_key='acompanhamentos') INTO has_old;
    SELECT EXISTS (SELECT FROM modules_catalog WHERE module_key='terracontrol')    INTO has_new;

    -- Caso A: existem ambas (seed criou 'terracontrol' antes da migration rodar).
    -- Removemos a linha duplicada 'terracontrol' (nenhum user tem permissão
    -- nela ainda, então não há cascade indesejado) e seguimos para o rename.
    IF has_old AND has_new THEN
        DELETE FROM modules_catalog WHERE module_key='terracontrol';
        RAISE NOTICE 'Linha duplicada terracontrol removida de modules_catalog';
        has_new := FALSE;
    END IF;

    IF has_old AND NOT has_new THEN
        -- Descobrir o nome real da constraint FK (Postgres gera nomes
        -- automaticamente; o padrão é user_module_permissions_module_key_fkey)
        SELECT conname INTO fk_constraint_name
        FROM pg_constraint
        WHERE conrelid = 'user_module_permissions'::regclass
          AND contype = 'f'
          AND pg_get_constraintdef(oid) LIKE '%REFERENCES modules_catalog(module_key)%'
        LIMIT 1;

        -- Remover FK temporariamente
        IF fk_constraint_name IS NOT NULL THEN
            EXECUTE format('ALTER TABLE user_module_permissions DROP CONSTRAINT %I', fk_constraint_name);
            RAISE NOTICE 'FK % removida temporariamente', fk_constraint_name;
        END IF;

        -- Atualizar modules_catalog
        UPDATE modules_catalog
        SET module_key  = 'terracontrol',
            module_name = 'TerraControl',
            route_path  = 'terracontrol',
            description = 'Controle e acompanhamento de imóveis rurais'
        WHERE module_key = 'acompanhamentos';
        RAISE NOTICE 'modules_catalog atualizado: acompanhamentos → terracontrol';

        -- Atualizar user_module_permissions
        UPDATE user_module_permissions
        SET module_key = 'terracontrol'
        WHERE module_key = 'acompanhamentos';
        RAISE NOTICE 'user_module_permissions atualizado para terracontrol';

        -- Recriar FK
        ALTER TABLE user_module_permissions
        ADD CONSTRAINT user_module_permissions_module_key_fkey
        FOREIGN KEY (module_key) REFERENCES modules_catalog(module_key) ON DELETE CASCADE;
        RAISE NOTICE 'FK user_module_permissions_module_key_fkey recriada';
    ELSIF has_new AND NOT has_old THEN
        RAISE NOTICE 'Migration já aplicada — terracontrol existe e acompanhamentos não.';
    END IF;
END $$;

COMMIT;
