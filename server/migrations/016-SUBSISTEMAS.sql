-- =============================================================================
-- Migration 016 — SUBSISTEMAS
-- =============================================================================
-- Introduz a hierarquia de subsistemas acima de módulos:
--   subsystems → modules_catalog (FK) → user_module_permissions (FK)
--                ↓
--                user_subsystem_permissions (nova tabela)
--
-- Mudanças:
--   1. CREATE TABLE subsystems (5 subsistemas iniciais)
--   2. ALTER TABLE modules_catalog ADD COLUMN subsystem_key (NOT NULL ao final)
--   3. Renomeia 3 chaves: dashboard→dashboard_financeiro, metas→metas_financeiro,
--                         reports→relatorios_financeiro
--   4. INSERT 4 novos módulos do subsistema Gerenciamento
--   5. CREATE TABLE user_subsystem_permissions (acesso por subsistema inteiro)
--   6. sort_order vira ordem DENTRO do subsistema (não global)
--
-- activity_logs.module_key NÃO é alterado (preserva histórico — verificado:
-- nenhuma linha referencia 'dashboard', 'metas' ou 'reports').
--
-- Tudo em transação. Em caso de erro, rollback automático.
-- Para reverter manualmente após COMMIT: 016-SUBSISTEMAS-rollback.sql
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. Tabela subsystems
-- -----------------------------------------------------------------------------
CREATE TABLE subsystems (
    subsystem_key   VARCHAR(50)  PRIMARY KEY,
    name            VARCHAR(100) NOT NULL,
    description     TEXT,
    icon_name       VARCHAR(50),
    subdomain_slug  VARCHAR(50)  NOT NULL UNIQUE,
    sort_order      INTEGER      NOT NULL DEFAULT 0,
    is_active       BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_subsystems_sort_order ON subsystems(sort_order);
CREATE INDEX idx_subsystems_active     ON subsystems(is_active);

INSERT INTO subsystems (subsystem_key, name, description, icon_name, subdomain_slug, sort_order) VALUES
    ('admin',         'Admin',          'Administração do sistema, sessões, anomalias e alertas',  'ShieldCheck', 'admin',         1),
    ('gestao',        'Gestão',         'Roadmap, documentação e perguntas frequentes',            'BookOpen',    'gestao',        2),
    ('financeiro',    'Financeiro',     'Dashboard, metas, relatórios, projeção, transações, DRE', 'DollarSign',  'financeiro',    3),
    ('gerenciamento', 'Gerenciamento',  'Projetos, serviços, clientes e indicadores operacionais', 'Workflow',    'gerenciamento', 4),
    ('especial',      'Módulos Extras', 'Acompanhamentos e demais módulos não-temáticos',          'Sparkles',    'especial',      5);

-- -----------------------------------------------------------------------------
-- 2. modules_catalog: adicionar coluna subsystem_key (nullable durante migração)
-- -----------------------------------------------------------------------------
ALTER TABLE modules_catalog
    ADD COLUMN subsystem_key VARCHAR(50) REFERENCES subsystems(subsystem_key) ON UPDATE CASCADE;

-- Vincula cada módulo ao seu subsistema
UPDATE modules_catalog SET subsystem_key='admin'         WHERE module_key='admin';
UPDATE modules_catalog SET subsystem_key='admin'         WHERE module_key='sessions';
UPDATE modules_catalog SET subsystem_key='admin'         WHERE module_key='anomalies';
UPDATE modules_catalog SET subsystem_key='admin'         WHERE module_key='security_alerts';

UPDATE modules_catalog SET subsystem_key='gestao'        WHERE module_key='roadmap';
UPDATE modules_catalog SET subsystem_key='gestao'        WHERE module_key='documentacao';
UPDATE modules_catalog SET subsystem_key='gestao'        WHERE module_key='faq';

UPDATE modules_catalog SET subsystem_key='financeiro'    WHERE module_key='dashboard';      -- vira dashboard_financeiro abaixo
UPDATE modules_catalog SET subsystem_key='financeiro'    WHERE module_key='metas';          -- vira metas_financeiro abaixo
UPDATE modules_catalog SET subsystem_key='financeiro'    WHERE module_key='reports';        -- vira relatorios_financeiro abaixo
UPDATE modules_catalog SET subsystem_key='financeiro'    WHERE module_key='projecao';
UPDATE modules_catalog SET subsystem_key='financeiro'    WHERE module_key='transactions';
UPDATE modules_catalog SET subsystem_key='financeiro'    WHERE module_key='dre';

UPDATE modules_catalog SET subsystem_key='gerenciamento' WHERE module_key='projects';
UPDATE modules_catalog SET subsystem_key='gerenciamento' WHERE module_key='services';
UPDATE modules_catalog SET subsystem_key='gerenciamento' WHERE module_key='clients';

UPDATE modules_catalog SET subsystem_key='especial'      WHERE module_key='acompanhamentos';

-- Validação: todos os 17 módulos devem ter subsystem_key
DO $$
DECLARE
    unmapped_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO unmapped_count FROM modules_catalog WHERE subsystem_key IS NULL;
    IF unmapped_count > 0 THEN
        RAISE EXCEPTION 'Migração 016: % módulos sem subsystem_key — abortando', unmapped_count;
    END IF;
END $$;

-- -----------------------------------------------------------------------------
-- 3. Adicionar ON UPDATE CASCADE na FK de user_module_permissions
--    (necessário para propagar UPDATEs de PK de modules_catalog)
-- -----------------------------------------------------------------------------
ALTER TABLE user_module_permissions
    DROP CONSTRAINT user_module_permissions_module_key_fkey;

ALTER TABLE user_module_permissions
    ADD CONSTRAINT user_module_permissions_module_key_fkey
    FOREIGN KEY (module_key) REFERENCES modules_catalog(module_key)
    ON DELETE CASCADE
    ON UPDATE CASCADE;

-- -----------------------------------------------------------------------------
-- 4. Renomear chaves dos 3 módulos (UPDATE de PK propaga para user_module_permissions)
-- -----------------------------------------------------------------------------
UPDATE modules_catalog SET module_key='dashboard_financeiro',  route_path='dashboard_financeiro'  WHERE module_key='dashboard';
UPDATE modules_catalog SET module_key='metas_financeiro',      route_path='metas_financeiro'      WHERE module_key='metas';
UPDATE modules_catalog SET module_key='relatorios_financeiro', route_path='relatorios_financeiro' WHERE module_key='reports';

-- -----------------------------------------------------------------------------
-- 5. Inserir 4 novos módulos do subsistema Gerenciamento
-- -----------------------------------------------------------------------------
INSERT INTO modules_catalog (module_key, module_name, icon_name, description, route_path, is_system, sort_order, subsystem_key, is_active) VALUES
    ('dashboard_gerenciamento',  'Dashboard',  'BarChart3',  'Resumo do gerenciamento (projetos, serviços, clientes)', 'dashboard_gerenciamento',  TRUE, 18, 'gerenciamento', TRUE),
    ('metas_gerenciamento',      'Metas',      'Target',     'Metas operacionais do gerenciamento',                    'metas_gerenciamento',      TRUE, 19, 'gerenciamento', TRUE),
    ('projecao_gerenciamento',   'Projeção',   'LineChart',  'Projeções e definição de metas operacionais',            'projecao_gerenciamento',   TRUE, 20, 'gerenciamento', TRUE),
    ('relatorios_gerenciamento', 'Relatórios', 'FileText',   'Relatórios operacionais do gerenciamento',               'relatorios_gerenciamento', TRUE, 21, 'gerenciamento', TRUE);

-- -----------------------------------------------------------------------------
-- 6. Recalcular sort_order: agora é ordem DENTRO do subsistema, não global
-- -----------------------------------------------------------------------------
-- Admin
UPDATE modules_catalog SET sort_order=1 WHERE module_key='admin';
UPDATE modules_catalog SET sort_order=2 WHERE module_key='sessions';
UPDATE modules_catalog SET sort_order=3 WHERE module_key='anomalies';
UPDATE modules_catalog SET sort_order=4 WHERE module_key='security_alerts';

-- Gestão
UPDATE modules_catalog SET sort_order=1 WHERE module_key='roadmap';
UPDATE modules_catalog SET sort_order=2 WHERE module_key='documentacao';
UPDATE modules_catalog SET sort_order=3 WHERE module_key='faq';

-- Financeiro
UPDATE modules_catalog SET sort_order=1 WHERE module_key='dashboard_financeiro';
UPDATE modules_catalog SET sort_order=2 WHERE module_key='metas_financeiro';
UPDATE modules_catalog SET sort_order=3 WHERE module_key='relatorios_financeiro';
UPDATE modules_catalog SET sort_order=4 WHERE module_key='projecao';
UPDATE modules_catalog SET sort_order=5 WHERE module_key='transactions';
UPDATE modules_catalog SET sort_order=6 WHERE module_key='dre';

-- Gerenciamento
UPDATE modules_catalog SET sort_order=1 WHERE module_key='dashboard_gerenciamento';
UPDATE modules_catalog SET sort_order=2 WHERE module_key='metas_gerenciamento';
UPDATE modules_catalog SET sort_order=3 WHERE module_key='projecao_gerenciamento';
UPDATE modules_catalog SET sort_order=4 WHERE module_key='relatorios_gerenciamento';
UPDATE modules_catalog SET sort_order=5 WHERE module_key='projects';
UPDATE modules_catalog SET sort_order=6 WHERE module_key='services';
UPDATE modules_catalog SET sort_order=7 WHERE module_key='clients';

-- Especial
UPDATE modules_catalog SET sort_order=1 WHERE module_key='acompanhamentos';

-- -----------------------------------------------------------------------------
-- 7. Tornar subsystem_key NOT NULL agora que todos os módulos têm valor
-- -----------------------------------------------------------------------------
ALTER TABLE modules_catalog
    ALTER COLUMN subsystem_key SET NOT NULL;

CREATE INDEX idx_modules_catalog_subsystem ON modules_catalog(subsystem_key);

-- -----------------------------------------------------------------------------
-- 8. Tabela user_subsystem_permissions
-- -----------------------------------------------------------------------------
CREATE TABLE user_subsystem_permissions (
    id            VARCHAR(255) PRIMARY KEY,
    user_id       VARCHAR(255) NOT NULL REFERENCES users(id)         ON DELETE CASCADE,
    subsystem_key VARCHAR(50)  NOT NULL REFERENCES subsystems(subsystem_key) ON DELETE CASCADE ON UPDATE CASCADE,
    created_at    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (user_id, subsystem_key)
);

CREATE INDEX idx_user_subsystem_permissions_user_id       ON user_subsystem_permissions(user_id);
CREATE INDEX idx_user_subsystem_permissions_subsystem_key ON user_subsystem_permissions(subsystem_key);

-- -----------------------------------------------------------------------------
-- Validações finais
-- -----------------------------------------------------------------------------
DO $$
DECLARE
    total_modules INTEGER;
    total_subsystems INTEGER;
    total_user_perms INTEGER;
BEGIN
    SELECT COUNT(*) INTO total_modules FROM modules_catalog;
    SELECT COUNT(*) INTO total_subsystems FROM subsystems;
    SELECT COUNT(*) INTO total_user_perms FROM user_module_permissions
        WHERE module_key IN ('dashboard_financeiro','metas_financeiro','relatorios_financeiro');

    IF total_modules <> 21 THEN
        RAISE EXCEPTION 'Esperado 21 módulos, encontrados %', total_modules;
    END IF;
    IF total_subsystems <> 5 THEN
        RAISE EXCEPTION 'Esperado 5 subsistemas, encontrados %', total_subsystems;
    END IF;
    -- Cada usuário que tinha permissão para os 3 módulos antigos
    -- (dashboard, metas, reports) deve ter as 3 chaves novas propagadas
    -- via ON UPDATE CASCADE → total deve ser múltiplo de 3.
    -- Hardcoding do número exato seria errado em ambientes com nº distinto
    -- de usuários.
    IF total_user_perms = 0 OR (total_user_perms % 3) <> 0 THEN
        RAISE EXCEPTION 'Esperado total múltiplo de 3 (3 chaves renomeadas × N usuários); encontrados %', total_user_perms;
    END IF;

    RAISE NOTICE 'Migração 016 concluída: % módulos, % subsistemas, % permissões propagadas',
        total_modules, total_subsystems, total_user_perms;
END $$;

COMMIT;
