-- =============================================================================
-- 023 — TERRACONTROL cod_imovel: INTEGER NOT NULL UNIQUE + SEQUENCE
-- =============================================================================
-- Corrige o estado atual da coluna terracontrol.cod_imovel:
--   • Tipo VARCHAR(255) — ordenação lexicográfica errada ("10" < "9")
--   • Pode ser NULL — registros criados pela UI ficavam sem código
--   • Sem UNIQUE — duplicatas silenciosas possíveis
--   • Sem geração automática no INSERT
--
-- Estratégia:
--   1. Cria SEQUENCE terracontrol_cod_imovel_seq
--   2. Preenche linhas NULL/vazias com nextval() ANTES de mudar o tipo
--   3. ALTER COLUMN para INTEGER, removendo não-dígitos do que existir
--   4. Define NOT NULL + DEFAULT nextval() + UNIQUE
--   5. Avança a sequence para MAX(cod_imovel) atual
--   6. Vincula a sequence à coluna (ownership) — DROP TABLE leva a sequence junto
--
-- IDEMPOTENTE: pode rodar múltiplas vezes sem efeito colateral.
-- Executar com: psql ... -f 023-TERRACONTROL-COD-IMOVEL-FIX.sql
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 0. Garantir que a tabela exista (proteção em ambientes recém-criados)
-- ---------------------------------------------------------------------------
DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'terracontrol') THEN
        RAISE EXCEPTION 'Tabela terracontrol não existe — aplicar create-tables.sql antes';
    END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 1. Criar SEQUENCE se ainda não existir
-- ---------------------------------------------------------------------------
CREATE SEQUENCE IF NOT EXISTS terracontrol_cod_imovel_seq;

-- ---------------------------------------------------------------------------
-- 2. Descobrir o tipo atual da coluna e tratar cada caso
-- ---------------------------------------------------------------------------
DO $$
DECLARE
    current_type TEXT;
    max_existing INTEGER;
BEGIN
    SELECT data_type INTO current_type
    FROM information_schema.columns
    WHERE table_name = 'terracontrol' AND column_name = 'cod_imovel';

    IF current_type IS NULL THEN
        RAISE EXCEPTION 'Coluna terracontrol.cod_imovel não existe';
    END IF;

    -- Caso A: ainda VARCHAR — precisa preencher NULLs como string e converter
    IF current_type IN ('character varying', 'text') THEN
        RAISE NOTICE 'cod_imovel ainda é %, preenchendo NULLs e convertendo para INTEGER...', current_type;

        -- Ajusta sequence para começar APÓS o maior valor numérico já existente
        -- (regex extrai só dígitos; valores tipo "001" viram 1)
        SELECT COALESCE(MAX(NULLIF(regexp_replace(cod_imovel, '\D', '', 'g'), '')::INTEGER), 0)
        INTO max_existing
        FROM terracontrol;

        PERFORM setval('terracontrol_cod_imovel_seq', GREATEST(max_existing, 1), max_existing > 0);

        -- Preenche linhas NULL ou vazias com nextval() ANTES de mudar o tipo
        UPDATE terracontrol
        SET cod_imovel = nextval('terracontrol_cod_imovel_seq')::TEXT
        WHERE cod_imovel IS NULL OR TRIM(cod_imovel) = '';

        -- Converte tipo: extrai dígitos e cast para INTEGER
        ALTER TABLE terracontrol
            ALTER COLUMN cod_imovel TYPE INTEGER
            USING NULLIF(regexp_replace(cod_imovel, '\D', '', 'g'), '')::INTEGER;

        RAISE NOTICE 'Tipo convertido para INTEGER';

    ELSIF current_type = 'integer' THEN
        RAISE NOTICE 'cod_imovel já é INTEGER, pulando conversão de tipo';

    ELSE
        RAISE EXCEPTION 'Tipo inesperado para cod_imovel: %', current_type;
    END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 3. Avançar a sequence para o MAX atual (após eventuais inserts intermediários)
-- ---------------------------------------------------------------------------
DO $$
DECLARE
    max_existing INTEGER;
BEGIN
    SELECT COALESCE(MAX(cod_imovel), 0) INTO max_existing FROM terracontrol;
    PERFORM setval('terracontrol_cod_imovel_seq', GREATEST(max_existing, 1), max_existing > 0);
    RAISE NOTICE 'Sequence avançada para %', max_existing;
END $$;

-- ---------------------------------------------------------------------------
-- 4. Definir DEFAULT nextval() — INSERTs sem cod_imovel passam a auto-gerar
-- ---------------------------------------------------------------------------
ALTER TABLE terracontrol
    ALTER COLUMN cod_imovel SET DEFAULT nextval('terracontrol_cod_imovel_seq');

-- Vincular ownership: se a tabela for dropada, a sequence é dropada junto
ALTER SEQUENCE terracontrol_cod_imovel_seq OWNED BY terracontrol.cod_imovel;

-- ---------------------------------------------------------------------------
-- 5. NOT NULL (após garantir que não há NULLs)
-- ---------------------------------------------------------------------------
DO $$
DECLARE
    null_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO null_count FROM terracontrol WHERE cod_imovel IS NULL;
    IF null_count > 0 THEN
        RAISE EXCEPTION 'Ainda existem % linhas com cod_imovel NULL — abortando NOT NULL', null_count;
    END IF;
END $$;

ALTER TABLE terracontrol ALTER COLUMN cod_imovel SET NOT NULL;

-- ---------------------------------------------------------------------------
-- 6. UNIQUE constraint (cuidado: aborta se já houver duplicatas)
-- ---------------------------------------------------------------------------
DO $$
DECLARE
    dup_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO dup_count FROM (
        SELECT cod_imovel FROM terracontrol GROUP BY cod_imovel HAVING COUNT(*) > 1
    ) d;

    IF dup_count > 0 THEN
        RAISE EXCEPTION 'Existem % cod_imovel duplicados — resolver manualmente antes de aplicar UNIQUE', dup_count;
    END IF;

    -- Adiciona constraint só se ainda não existir
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'terracontrol_cod_imovel_unique'
    ) THEN
        ALTER TABLE terracontrol
            ADD CONSTRAINT terracontrol_cod_imovel_unique UNIQUE (cod_imovel);
        RAISE NOTICE 'UNIQUE constraint adicionada';
    ELSE
        RAISE NOTICE 'UNIQUE constraint já existe';
    END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 7. Validação final
-- ---------------------------------------------------------------------------
DO $$
DECLARE
    final_type TEXT;
    total INTEGER;
    nulls INTEGER;
BEGIN
    SELECT data_type INTO final_type
    FROM information_schema.columns
    WHERE table_name = 'terracontrol' AND column_name = 'cod_imovel';

    SELECT COUNT(*) INTO total FROM terracontrol;
    SELECT COUNT(*) INTO nulls FROM terracontrol WHERE cod_imovel IS NULL;

    IF final_type <> 'integer' THEN
        RAISE EXCEPTION 'Tipo final inesperado: %', final_type;
    END IF;
    IF nulls > 0 THEN
        RAISE EXCEPTION 'Ainda % NULLs após migration', nulls;
    END IF;

    RAISE NOTICE 'Migration 023 OK: % registros, tipo %, sem NULLs', total, final_type;
END $$;

COMMIT;
