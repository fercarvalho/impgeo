-- =============================================================================
-- Rollback da Migration 016 — SUBSISTEMAS
-- =============================================================================
-- Reverte tudo que 016-SUBSISTEMAS.sql aplicou:
--   1. Remove user_subsystem_permissions
--   2. Volta sort_order ao padrão global anterior
--   3. Renomeia chaves de volta (dashboard_financeiro → dashboard, etc.)
--   4. Remove os 4 módulos novos do gerenciamento
--   5. Remove coluna subsystem_key
--   6. Remove tabela subsystems
--   7. Remove ON UPDATE CASCADE da FK
--
-- Use apenas se a migração 016 já tiver sido aplicada e você quiser desfazer.
-- =============================================================================

BEGIN;

-- 1. Drop user_subsystem_permissions
DROP TABLE IF EXISTS user_subsystem_permissions;

-- 2-4. Reverter UPDATEs de chave (FK ainda tem ON UPDATE CASCADE — propaga)
UPDATE modules_catalog SET module_key='dashboard', route_path='dashboard' WHERE module_key='dashboard_financeiro';
UPDATE modules_catalog SET module_key='metas',     route_path='metas'     WHERE module_key='metas_financeiro';
UPDATE modules_catalog SET module_key='reports',   route_path='reports'   WHERE module_key='relatorios_financeiro';

-- 5. Remover os 4 módulos novos do gerenciamento (CASCADE remove user_module_permissions deles)
DELETE FROM modules_catalog WHERE module_key IN (
    'dashboard_gerenciamento',
    'metas_gerenciamento',
    'projecao_gerenciamento',
    'relatorios_gerenciamento'
);

-- 6. Restaurar sort_order global anterior
UPDATE modules_catalog SET sort_order=1  WHERE module_key='dashboard';
UPDATE modules_catalog SET sort_order=2  WHERE module_key='metas';
UPDATE modules_catalog SET sort_order=3  WHERE module_key='reports';
UPDATE modules_catalog SET sort_order=4  WHERE module_key='projecao';
UPDATE modules_catalog SET sort_order=5  WHERE module_key='transactions';
UPDATE modules_catalog SET sort_order=6  WHERE module_key='projects';
UPDATE modules_catalog SET sort_order=7  WHERE module_key='services';
UPDATE modules_catalog SET sort_order=8  WHERE module_key='clients';
UPDATE modules_catalog SET sort_order=9  WHERE module_key='dre';
UPDATE modules_catalog SET sort_order=10 WHERE module_key='acompanhamentos';
UPDATE modules_catalog SET sort_order=11 WHERE module_key='admin';
UPDATE modules_catalog SET sort_order=12 WHERE module_key='faq';
UPDATE modules_catalog SET sort_order=13 WHERE module_key='documentacao';
UPDATE modules_catalog SET sort_order=14 WHERE module_key='roadmap';
UPDATE modules_catalog SET sort_order=15 WHERE module_key='sessions';
UPDATE modules_catalog SET sort_order=16 WHERE module_key='anomalies';
UPDATE modules_catalog SET sort_order=17 WHERE module_key='security_alerts';

-- 7. Drop coluna subsystem_key
DROP INDEX IF EXISTS idx_modules_catalog_subsystem;
ALTER TABLE modules_catalog DROP COLUMN subsystem_key;

-- 8. Drop subsystems
DROP TABLE IF EXISTS subsystems;

-- 9. Remover ON UPDATE CASCADE da FK (volta ao estado original)
ALTER TABLE user_module_permissions
    DROP CONSTRAINT user_module_permissions_module_key_fkey;

ALTER TABLE user_module_permissions
    ADD CONSTRAINT user_module_permissions_module_key_fkey
    FOREIGN KEY (module_key) REFERENCES modules_catalog(module_key)
    ON DELETE CASCADE;

DO $$
DECLARE
    total_modules INTEGER;
BEGIN
    SELECT COUNT(*) INTO total_modules FROM modules_catalog;
    IF total_modules <> 17 THEN
        RAISE EXCEPTION 'Rollback: esperado 17 módulos após rollback, encontrados %', total_modules;
    END IF;
    RAISE NOTICE 'Rollback 016 concluído: % módulos restaurados', total_modules;
END $$;

COMMIT;
