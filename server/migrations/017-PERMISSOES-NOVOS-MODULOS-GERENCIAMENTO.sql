-- =============================================================================
-- Migration 017 — Permissões para os módulos novos do Gerenciamento
-- =============================================================================
-- A migration 016 inseriu os 4 módulos novos no modules_catalog
-- (dashboard_gerenciamento, metas_gerenciamento, projecao_gerenciamento,
-- relatorios_gerenciamento) mas NÃO criou registros em user_module_permissions
-- para usuários existentes. Resultado: ninguém vê os novos módulos no menu.
--
-- Esta migração concede permissão a todos os usuários (com access_level
-- conforme o role) para os 4 módulos novos. Usuários user/guest ainda serão
-- bloqueados pelo subsistema na fase 1.8 — esta concessão é só para que o
-- catálogo fique coerente.
--
-- A partir desta versão, o backend (database-pg.js → ensureProfileSchema)
-- também garante automaticamente essas permissões para usuários antigos sem
-- elas a cada boot — para o caso de o banco ser revertido para um snapshot
-- pré-016 e remigrado.
-- =============================================================================

BEGIN;

INSERT INTO user_module_permissions (id, user_id, module_key, access_level, created_at, updated_at)
SELECT
    CONCAT(u.id, '-', m.module_key),
    u.id,
    m.module_key,
    CASE u.role
        WHEN 'superadmin' THEN 'edit'
        WHEN 'admin'      THEN 'edit'
        WHEN 'user'       THEN 'write'
        ELSE                   'view'
    END,
    NOW(),
    NOW()
FROM users u
CROSS JOIN (VALUES
    ('dashboard_gerenciamento'),
    ('metas_gerenciamento'),
    ('projecao_gerenciamento'),
    ('relatorios_gerenciamento')
) AS m(module_key)
WHERE NOT EXISTS (
    SELECT 1 FROM user_module_permissions ump
    WHERE ump.user_id = u.id AND ump.module_key = m.module_key
)
ON CONFLICT (user_id, module_key) DO NOTHING;

DO $$
DECLARE
    granted INTEGER;
    expected INTEGER;
BEGIN
    SELECT COUNT(*) INTO granted
    FROM user_module_permissions
    WHERE module_key IN (
        'dashboard_gerenciamento',
        'metas_gerenciamento',
        'projecao_gerenciamento',
        'relatorios_gerenciamento'
    );

    SELECT COUNT(*) * 4 INTO expected FROM users;

    IF granted < expected THEN
        RAISE WARNING 'Migração 017: esperado >= % permissões; encontrado %. Verifique se há usuários sem todas as 4 chaves.',
            expected, granted;
    END IF;

    RAISE NOTICE 'Migração 017 concluída: % permissões existentes para os 4 módulos novos do gerenciamento', granted;
END $$;

COMMIT;
