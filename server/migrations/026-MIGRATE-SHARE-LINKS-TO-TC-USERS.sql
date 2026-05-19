-- =============================================================================
-- 026 — Migrar share_links existentes para tc_users
-- =============================================================================
-- Para cada share_link com selected_ids não vazio:
--   1. Gera username = slug(name) com sufixo numérico em colisão
--   2. Insere em tc_users:
--      - password: preservada se existia (password_hash) OU bcrypt('tc123', 10)
--      - force_password_change: TRUE
--      - first_name: name original ou 'Convidado'
--      - created_via: 'migrated'
--   3. Expande selected_ids[] em tc_user_record_access (1 linha por record)
--   4. Insere alias em tc_legacy_aliases para redirect /v/<token> → login
--
-- share_links sem selected_ids são ignorados (não vale criar tc_user que não vê nada).
--
-- IDEMPOTENTE: registra alias em tc_legacy_aliases — re-run pula share_links
-- que já têm alias.
--
-- Senha temporária: 'tc123' (hash gerado em runtime via pgcrypto.crypt com
-- gen_salt('bf', 10) — compatível com bcrypt.compare() do bcryptjs no Node).
-- =============================================================================

BEGIN;

-- pgcrypto fornece crypt() compatível com bcrypt (algoritmo 'bf').
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ---------------------------------------------------------------------------
-- Funções auxiliares: slugify em PL/pgSQL (mesma lógica do slugify do server.js)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION pg_temp.slugify(input TEXT) RETURNS TEXT AS $$
DECLARE
    s TEXT;
BEGIN
    IF input IS NULL OR TRIM(input) = '' THEN RETURN ''; END IF;
    s := LOWER(TRIM(input));
    -- Remove acentos via unaccent (extensão padrão) — fallback manual se não disponível
    BEGIN
        s := unaccent(s);
    EXCEPTION WHEN undefined_function THEN
        -- Fallback: substitui combos comuns
        s := translate(s, 'àáâãäåèéêëìíîïòóôõöùúûüçñ', 'aaaaaaeeeeiiiiooooouuuucn');
    END;
    s := regexp_replace(s, '\s+', '-', 'g');     -- espaços → hífens
    s := regexp_replace(s, '[^\w-]+', '', 'g');  -- remove não-word
    s := regexp_replace(s, '-{2,}', '-', 'g');   -- múltiplos hífens → 1
    s := regexp_replace(s, '^-+|-+$', '', 'g');  -- trim hífens nas bordas
    RETURN s;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

CREATE OR REPLACE FUNCTION pg_temp.next_unique_username(base TEXT) RETURNS TEXT AS $$
DECLARE
    candidate TEXT := base;
    counter INTEGER := 2;
BEGIN
    IF base IS NULL OR base = '' THEN
        base := 'convidado';
        candidate := base;
    END IF;
    WHILE EXISTS (SELECT 1 FROM tc_users WHERE username = candidate) LOOP
        candidate := base || '-' || counter;
        counter := counter + 1;
    END LOOP;
    RETURN candidate;
END;
$$ LANGUAGE plpgsql;

-- ---------------------------------------------------------------------------
-- Migração: cursor sobre share_links elegíveis
-- ---------------------------------------------------------------------------
DO $$
DECLARE
    sl RECORD;
    new_tc_user_id TEXT;
    new_username   TEXT;
    base_slug      TEXT;
    rec_id         TEXT;
    migrated_count INTEGER := 0;
    skipped_count  INTEGER := 0;
    -- Hash bcrypt do 'tc123' gerado uma vez aqui via pgcrypto. Cost 10 = mesmo
    -- do impgeo. bcrypt.compare('tc123', hash) no Node valida normalmente.
    DEFAULT_PASSWORD_HASH TEXT := crypt('tc123', gen_salt('bf', 10));
BEGIN
    FOR sl IN
        SELECT *
        FROM share_links
        WHERE selected_ids IS NOT NULL AND array_length(selected_ids, 1) > 0
          AND NOT EXISTS (SELECT 1 FROM tc_legacy_aliases tla WHERE tla.share_link_token = share_links.token)
    LOOP
        -- 1. Gera username único
        base_slug := pg_temp.slugify(COALESCE(sl.name, 'convidado'));
        IF base_slug = '' THEN base_slug := 'convidado'; END IF;
        new_username := pg_temp.next_unique_username(base_slug);

        -- 2. Insere tc_user (id é UUID v4 ou similar; gera via gen_random_uuid se disponível, senão md5+random)
        BEGIN
            new_tc_user_id := gen_random_uuid()::TEXT;
        EXCEPTION WHEN undefined_function THEN
            new_tc_user_id := md5(random()::TEXT || clock_timestamp()::TEXT);
        END;

        INSERT INTO tc_users (
            id, username, password,
            first_name, force_password_change, created_via, created_at, updated_at
        ) VALUES (
            new_tc_user_id,
            new_username,
            COALESCE(NULLIF(sl.password_hash, ''), DEFAULT_PASSWORD_HASH),
            COALESCE(NULLIF(TRIM(sl.name), ''), 'Convidado'),
            TRUE,  -- sempre força troca de senha no 1º login
            'migrated',
            sl.created_at,
            NOW()
        );

        -- 3. Expande selected_ids em tc_user_record_access
        FOREACH rec_id IN ARRAY sl.selected_ids
        LOOP
            -- Só insere se o registro ainda existir em terracontrol (FK)
            IF EXISTS (SELECT 1 FROM terracontrol WHERE id = rec_id) THEN
                INSERT INTO tc_user_record_access (tc_user_id, terracontrol_id, created_at)
                VALUES (new_tc_user_id, rec_id, sl.created_at)
                ON CONFLICT (tc_user_id, terracontrol_id) DO NOTHING;
            END IF;
        END LOOP;

        -- 4. Cria alias para URL antiga
        INSERT INTO tc_legacy_aliases (share_link_token, tc_user_id, created_at)
        VALUES (sl.token, new_tc_user_id, sl.created_at)
        ON CONFLICT (share_link_token) DO NOTHING;

        migrated_count := migrated_count + 1;
    END LOOP;

    -- Conta share_links que foram ignorados
    SELECT COUNT(*) INTO skipped_count
    FROM share_links
    WHERE selected_ids IS NULL OR array_length(selected_ids, 1) IS NULL OR array_length(selected_ids, 1) = 0;

    RAISE NOTICE 'Migration 026 OK: % share_links migrados para tc_users, % ignorados (selected_ids vazio)',
        migrated_count, skipped_count;
END $$;

COMMIT;
