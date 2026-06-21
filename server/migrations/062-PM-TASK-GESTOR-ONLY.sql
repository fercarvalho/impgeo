-- ═══════════════════════════════════════════════════════════════════════════
-- 062-PM-TASK-GESTOR-ONLY.sql
-- Flag "Restrita a gestor" (req item 4, pós-cenário 10): tarefa que só pode ser
-- pega/executada por manager/admin/superadmin. Definida no template e copiada
-- para a instância (project_tasks) na criação do projeto / duplicação de etapa.
--
-- Usada no modal ao pegar tarefa: pré-requisito gestor_only não é oferecido
-- para auto-pegar a um usuário comum (só aparece como informativo).
--
-- Idempotente, transacional, validador final.
-- Rollback: 062-PM-TASK-GESTOR-ONLY-rollback.sql
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

ALTER TABLE service_template_tasks
  ADD COLUMN IF NOT EXISTS gestor_only BOOLEAN DEFAULT FALSE;

ALTER TABLE project_tasks
  ADD COLUMN IF NOT EXISTS gestor_only BOOLEAN DEFAULT FALSE;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='service_template_tasks' AND column_name='gestor_only')
     OR NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='project_tasks' AND column_name='gestor_only') THEN
    RAISE EXCEPTION 'Migration 062 incompleta: coluna gestor_only ausente';
  END IF;
  RAISE NOTICE 'Migration 062-PM-TASK-GESTOR-ONLY aplicada com sucesso.';
END $$;

COMMIT;
