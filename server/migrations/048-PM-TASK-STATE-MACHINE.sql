-- ═══════════════════════════════════════════════════════════════════════════
-- 048-PM-TASK-STATE-MACHINE.sql
-- Fase 4 do módulo PM. Suporte à máquina de estados de tarefas:
--   task_assignments_history — auditoria de (re)atribuições e colaborações
-- Os índices de project_tasks (assignee/status, status/due_date) já vieram na 047.
--
-- Idempotente, transacional, validador final.
-- Rollback: 048-PM-TASK-STATE-MACHINE-rollback.sql
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

CREATE TABLE IF NOT EXISTS task_assignments_history (
  id                  VARCHAR(255) PRIMARY KEY,
  task_id             VARCHAR(255) NOT NULL REFERENCES project_tasks(id) ON DELETE CASCADE,
  from_user_id        VARCHAR(255) REFERENCES users(id) ON DELETE SET NULL,
  to_user_id          VARCHAR(255) REFERENCES users(id) ON DELETE SET NULL,
  assigned_by_user_id VARCHAR(255) REFERENCES users(id) ON DELETE SET NULL,
  reason              VARCHAR(32),   -- 'assign' | 'reassign' | 'help' | 'refused' | 'follow_up'
  note                TEXT,
  created_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_task_assign_hist_task ON task_assignments_history(task_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_task_assign_hist_to   ON task_assignments_history(to_user_id);

-- ─── Catálogo do módulo novo + permissões dos usuários existentes ─────────────
-- O boot do backend só semeia permissões para usuários SEM nenhuma permissão.
-- Para módulos novos pós-042, é preciso uma migration explícita (padrão da 017).

INSERT INTO modules_catalog
  (module_key, module_name, icon_name, description, route_path, is_system, is_active, sort_order, subsystem_key, created_at, updated_at)
VALUES
  ('tarefas_gerenciamento', 'Tarefas', 'ListTodo',
   'Execução e acompanhamento de tarefas dos projetos', 'tarefas_gerenciamento',
   TRUE, TRUE, 8, 'gerenciamento', NOW(), NOW())
ON CONFLICT (module_key) DO UPDATE SET
  is_active = TRUE, subsystem_key = 'gerenciamento', updated_at = NOW();

-- Concede permissão a usuários existentes conforme o nível de 'gerenciamento'
-- da role (edit p/ superadmin/admin/manager/user; view p/ guest).
INSERT INTO user_module_permissions (id, user_id, module_key, access_level, created_at, updated_at)
SELECT CONCAT(u.id, '-tarefas_gerenciamento'),
       u.id,
       'tarefas_gerenciamento',
       CASE u.role WHEN 'guest' THEN 'view' ELSE 'edit' END,
       NOW(), NOW()
  FROM users u
 WHERE NOT EXISTS (
   SELECT 1 FROM user_module_permissions ump
    WHERE ump.user_id = u.id AND ump.module_key = 'tarefas_gerenciamento'
 );

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'task_assignments_history') THEN
    RAISE EXCEPTION 'Migration 048 incompleta: task_assignments_history ausente';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM modules_catalog WHERE module_key = 'tarefas_gerenciamento') THEN
    RAISE EXCEPTION 'Migration 048 incompleta: módulo tarefas_gerenciamento ausente do catálogo';
  END IF;
  RAISE NOTICE 'Migration 048-PM-TASK-STATE-MACHINE aplicada com sucesso.';
END $$;

COMMIT;
