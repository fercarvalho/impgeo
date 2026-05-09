-- =============================================================================
-- Rollback da Migration 017 — Permissões dos módulos novos do Gerenciamento
-- =============================================================================
-- Remove as permissões de user_module_permissions para os 4 módulos novos.
-- Os módulos em si (modules_catalog) NÃO são removidos — para isso, use o
-- rollback da migration 016.
-- =============================================================================

BEGIN;

DELETE FROM user_module_permissions
WHERE module_key IN (
    'dashboard_gerenciamento',
    'metas_gerenciamento',
    'projecao_gerenciamento',
    'relatorios_gerenciamento'
);

DO $$
DECLARE
    remaining INTEGER;
BEGIN
    SELECT COUNT(*) INTO remaining
    FROM user_module_permissions
    WHERE module_key IN (
        'dashboard_gerenciamento',
        'metas_gerenciamento',
        'projecao_gerenciamento',
        'relatorios_gerenciamento'
    );

    IF remaining > 0 THEN
        RAISE EXCEPTION 'Rollback 017: ainda restam % permissões — abortando', remaining;
    END IF;

    RAISE NOTICE 'Rollback 017 concluído: permissões dos 4 módulos novos removidas';
END $$;

COMMIT;
