-- ═══════════════════════════════════════════════════════════════════════════
-- 055-PM-CLIENTS-MODERN-FIELDS.sql
-- Alinha `clients` ao padrão moderno do `tc_users`:
--   - first_name / last_name (separados)
--   - address vira JSONB (shape {cep,street,number,complement,neighborhood,city,state})
-- `name` é mantida e sincronizada pelo app (= first+last) para retrocompat
-- (match de projeto, displays). Colunas legadas city/state/zip_code são
-- absorvidas no address JSONB e deixam de ser usadas.
--
-- Idempotente, transacional, validador final.
-- Rollback: 055-PM-CLIENTS-MODERN-FIELDS-rollback.sql
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- 1. Nome separado.
ALTER TABLE clients ADD COLUMN IF NOT EXISTS first_name VARCHAR(255);
ALTER TABLE clients ADD COLUMN IF NOT EXISTS last_name  VARCHAR(255);

-- Backfill a partir de `name` (1º token = first; resto = last).
UPDATE clients
   SET first_name = COALESCE(NULLIF(split_part(name, ' ', 1), ''), name),
       last_name  = NULLIF(TRIM(SUBSTRING(name FROM POSITION(' ' IN name) + 1)), '')
 WHERE name IS NOT NULL AND first_name IS NULL;

-- 2. address TEXT → JSONB, absorvendo city/state/zip_code legados.
DO $$
DECLARE coltype TEXT;
BEGIN
  SELECT data_type INTO coltype FROM information_schema.columns
   WHERE table_name='clients' AND column_name='address';
  IF coltype = 'text' THEN
    ALTER TABLE clients
      ALTER COLUMN address TYPE jsonb USING (
        CASE
          WHEN address IS NULL AND city IS NULL AND state IS NULL AND zip_code IS NULL THEN NULL
          WHEN address ~ '^\s*\{' THEN address::jsonb
          ELSE jsonb_strip_nulls(jsonb_build_object(
            'street', NULLIF(address, ''),
            'city',   NULLIF(city, ''),
            'state',  NULLIF(state, ''),
            'cep',    NULLIF(zip_code, '')
          ))
        END
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='clients' AND column_name='first_name') THEN
    RAISE EXCEPTION 'Migration 055 incompleta: clients.first_name ausente';
  END IF;
  IF (SELECT data_type FROM information_schema.columns WHERE table_name='clients' AND column_name='address') <> 'jsonb' THEN
    RAISE EXCEPTION 'Migration 055 incompleta: clients.address não é jsonb';
  END IF;
  RAISE NOTICE 'Migration 055-PM-CLIENTS-MODERN-FIELDS aplicada com sucesso.';
END $$;

COMMIT;
