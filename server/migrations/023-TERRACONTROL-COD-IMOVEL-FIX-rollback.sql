-- =============================================================================
-- 023 ROLLBACK — Reverter cod_imovel para VARCHAR(255) nullable sem UNIQUE
-- =============================================================================
-- Idempotente: pode ser executada múltiplas vezes sem efeito colateral.
-- ATENÇÃO: ao reverter o tipo, valores INTEGER viram TEXT padronizados (sem
-- zero-padding). Caso seja necessário recuperar "001", "002" etc., faça manual.
-- =============================================================================

BEGIN;

-- 1. Remover UNIQUE constraint (se existir)
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'terracontrol_cod_imovel_unique'
    ) THEN
        ALTER TABLE terracontrol DROP CONSTRAINT terracontrol_cod_imovel_unique;
        RAISE NOTICE 'UNIQUE constraint removida';
    END IF;
END $$;

-- 2. Remover DEFAULT e NOT NULL
DO $$
DECLARE
    current_type TEXT;
BEGIN
    SELECT data_type INTO current_type
    FROM information_schema.columns
    WHERE table_name = 'terracontrol' AND column_name = 'cod_imovel';

    IF current_type = 'integer' THEN
        ALTER TABLE terracontrol ALTER COLUMN cod_imovel DROP DEFAULT;
        ALTER TABLE terracontrol ALTER COLUMN cod_imovel DROP NOT NULL;

        -- Converter de volta para VARCHAR(255)
        ALTER TABLE terracontrol
            ALTER COLUMN cod_imovel TYPE VARCHAR(255)
            USING cod_imovel::TEXT;

        RAISE NOTICE 'Tipo revertido para VARCHAR(255)';
    ELSE
        RAISE NOTICE 'cod_imovel não é INTEGER (% atual) — nada a reverter', current_type;
    END IF;
END $$;

-- 3. Dropar a SEQUENCE
DROP SEQUENCE IF EXISTS terracontrol_cod_imovel_seq;

COMMIT;
