-- ═══════════════════════════════════════════════════════════════════════════
-- 070-PM-APROVACOES.sql
-- Módulo "Central de Aprovações" (melhoria #11): agrega as filas de aprovação
-- do gestor (prazo, reabertura, delegação, revisão, overage) numa página só.
--
-- Segue o padrão gestor-only do módulo relatorios_tarefas_gerenciamento (052):
-- catálogo + permissão restrita a admin/superadmin/manager. A visibilidade real
-- vem do user_module_permissions abaixo (não há default por role p/ este módulo).
--
-- Idempotente, transacional, validador final.
-- Rollback: 070-PM-APROVACOES-rollback.sql
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ─── Catálogo ─────────────────────────────────────────────────────────────────
INSERT INTO modules_catalog
  (module_key, module_name, icon_name, description, route_path, is_system, is_active, sort_order, subsystem_key, created_at, updated_at)
VALUES
  ('aprovacoes_gerenciamento', 'Central de Aprovações', 'ClipboardCheck',
   'Fila única de aprovações do gestor: prazo, reabertura, delegação, revisão e overage',
   'aprovacoes_gerenciamento', TRUE, TRUE, 11, 'gerenciamento', NOW(), NOW())
ON CONFLICT (module_key) DO UPDATE SET is_active = TRUE, subsystem_key = 'gerenciamento', updated_at = NOW();

-- ─── Permissão: só admin/superadmin/manager (aprovações são ação de gestor) ────
INSERT INTO user_module_permissions (id, user_id, module_key, access_level, created_at, updated_at)
SELECT CONCAT(u.id, '-aprovacoes_gerenciamento'), u.id, 'aprovacoes_gerenciamento', 'view', NOW(), NOW()
  FROM users u
 WHERE u.role IN ('admin','superadmin','manager')
   AND NOT EXISTS (SELECT 1 FROM user_module_permissions ump WHERE ump.user_id = u.id AND ump.module_key = 'aprovacoes_gerenciamento');

-- ─── Validador final ──────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM modules_catalog WHERE module_key='aprovacoes_gerenciamento') THEN
    RAISE EXCEPTION 'Migration 070 incompleta: módulo aprovacoes_gerenciamento não criado.';
  END IF;
  RAISE NOTICE 'Migration 070-PM-APROVACOES aplicada com sucesso.';
END $$;

COMMIT;
