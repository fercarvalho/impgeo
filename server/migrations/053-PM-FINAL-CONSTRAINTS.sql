-- ═══════════════════════════════════════════════════════════════════════════
-- 053-PM-FINAL-CONSTRAINTS.sql
-- Fase 9 do módulo PM. Endurecimento final: índices de performance.
--
-- DECISÕES (divergem do rascunho original do plano, por correção):
--  - NÃO forçar terracontrol.client_id NOT NULL: terrenos podem existir sem
--    cliente (ainda não pagos). A regra "1 cliente por terreno" já é garantida
--    estruturalmente pela coluna FK única client_id.
--  - NÃO dropar projects.client (legado VARCHAR): o frontend (Projects.tsx)
--    ainda lê/filtra por esse campo. Dropar quebraria a UI. Mantido como dívida
--    documentada (migração futura: Projects.tsx → client_id + JOIN clients).
--
-- Idempotente, transacional, validador final.
-- Rollback: 053-PM-FINAL-CONSTRAINTS-rollback.sql
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- Índice parcial p/ o detector de atraso (cron 1min) e listagens de pendências.
CREATE INDEX IF NOT EXISTS idx_project_tasks_due_active
  ON project_tasks(due_date)
  WHERE status NOT IN ('completed','canceled');

-- Índice composto p/ filtros de gestão por manager + status.
CREATE INDEX IF NOT EXISTS idx_projects_manager_status
  ON projects(manager_user_id, status);

-- GIN p/ buscas em metadata (projetos e snapshots de etapa).
CREATE INDEX IF NOT EXISTS idx_projects_metadata_gin
  ON projects USING GIN (metadata);
CREATE INDEX IF NOT EXISTS idx_project_stages_snapshot_gin
  ON project_stages USING GIN (template_snapshot);

-- Índice p/ a fila de revisão (pending_review ordenado por submissão).
CREATE INDEX IF NOT EXISTS idx_project_tasks_review_queue
  ON project_tasks(submitted_for_review_at)
  WHERE status = 'pending_review';

DO $$
BEGIN
  RAISE NOTICE 'Migration 053-PM-FINAL-CONSTRAINTS aplicada com sucesso.';
END $$;

COMMIT;
