-- =============================================================================
-- 022 ROLLBACK — Reverter: terracontrol → acompanhamentos
-- =============================================================================
-- Reverte a migration 022, voltando a tabela, o índice, modules_catalog
-- e user_module_permissions aos nomes originais.
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

-- 3. Reverter modules_catalog e user_module_permissions
DO $$
DECLARE
    has_old BOOLEAN;
    has_new BOOLEAN;
    fk_constraint_name TEXT;
BEGIN
    SELECT EXISTS (SELECT FROM modules_catalog WHERE module_key='acompanhamentos') INTO has_old;
    SELECT EXISTS (SELECT FROM modules_catalog WHERE module_key='terracontrol')    INTO has_new;

    -- Caso ambos existam, remove o 'acompanhamentos' duplicado
    IF has_new AND has_old THEN
        DELETE FROM modules_catalog WHERE module_key='acompanhamentos';
        has_old := FALSE;
    END IF;

    IF has_new AND NOT has_old THEN
        SELECT conname INTO fk_constraint_name
        FROM pg_constraint
        WHERE conrelid = 'user_module_permissions'::regclass
          AND contype = 'f'
          AND pg_get_constraintdef(oid) LIKE '%REFERENCES modules_catalog(module_key)%'
        LIMIT 1;

        IF fk_constraint_name IS NOT NULL THEN
            EXECUTE format('ALTER TABLE user_module_permissions DROP CONSTRAINT %I', fk_constraint_name);
        END IF;

        UPDATE modules_catalog
        SET module_key  = 'acompanhamentos',
            module_name = 'Acompanhamentos',
            route_path  = 'acompanhamentos',
            description = 'Acompanhamento operacional'
        WHERE module_key = 'terracontrol';

        UPDATE user_module_permissions
        SET module_key = 'acompanhamentos'
        WHERE module_key = 'terracontrol';

        ALTER TABLE user_module_permissions
        ADD CONSTRAINT user_module_permissions_module_key_fkey
        FOREIGN KEY (module_key) REFERENCES modules_catalog(module_key) ON DELETE CASCADE;
    END IF;
END $$;

COMMIT;
