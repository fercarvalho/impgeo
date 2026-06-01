-- ═══════════════════════════════════════════════════════════════════════════
-- 052-PM-COSTS-AND-REPORTS.sql
-- Fase 8 do módulo PM. Custos automáticos por projeto (trigger), progresso
-- automático, views de apoio e o módulo de relatórios administrativos.
--
--   pm_recalc_project_expenses()  + trigger em transactions
--   pm_project_progress_recalc()  + trigger em project_tasks
--   views pm_project_health_v, pm_overdue_summary_v
--   módulo relatorios_tarefas_gerenciamento (catálogo + permissões)
--
-- Idempotente, transacional, validador final.
-- Rollback: 052-PM-COSTS-AND-REPORTS-rollback.sql
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ─── 1. Custo do projeto = soma das despesas vinculadas (em centavos) ─────────
-- transactions.value é DECIMAL (reais), type='Despesa' conta como custo.

CREATE OR REPLACE FUNCTION pm_recalc_project_expenses(p_project_id VARCHAR) RETURNS void AS $$
BEGIN
  IF p_project_id IS NULL THEN RETURN; END IF;
  UPDATE projects
     SET expenses_cents = COALESCE((
           SELECT ROUND(SUM(value) * 100)::BIGINT
             FROM transactions
            WHERE project_id = p_project_id AND type = 'Despesa'
         ), 0),
         updated_at = NOW()
   WHERE id = p_project_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION pm_transactions_cost_trigger() RETURNS trigger AS $$
BEGIN
  IF (TG_OP = 'INSERT') THEN
    PERFORM pm_recalc_project_expenses(NEW.project_id);
  ELSIF (TG_OP = 'UPDATE') THEN
    PERFORM pm_recalc_project_expenses(NEW.project_id);
    IF NEW.project_id IS DISTINCT FROM OLD.project_id THEN
      PERFORM pm_recalc_project_expenses(OLD.project_id);
    END IF;
  ELSIF (TG_OP = 'DELETE') THEN
    PERFORM pm_recalc_project_expenses(OLD.project_id);
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_pm_transactions_cost ON transactions;
CREATE TRIGGER trg_pm_transactions_cost
  AFTER INSERT OR UPDATE OR DELETE ON transactions
  FOR EACH ROW EXECUTE FUNCTION pm_transactions_cost_trigger();

-- ─── 2. Progresso do projeto = % de tarefas concluídas ────────────────────────

CREATE OR REPLACE FUNCTION pm_project_progress_recalc(p_project_id VARCHAR) RETURNS void AS $$
DECLARE total INT; done INT;
BEGIN
  IF p_project_id IS NULL THEN RETURN; END IF;
  SELECT COUNT(*) FILTER (WHERE status NOT IN ('canceled','refused')),
         COUNT(*) FILTER (WHERE status = 'completed')
    INTO total, done
    FROM project_tasks WHERE project_id = p_project_id;
  UPDATE projects
     SET progress_pct = CASE WHEN COALESCE(total,0) = 0 THEN 0 ELSE ROUND((done::numeric / total) * 100, 2) END,
         updated_at = NOW()
   WHERE id = p_project_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION pm_tasks_progress_trigger() RETURNS trigger AS $$
BEGIN
  IF (TG_OP = 'DELETE') THEN
    PERFORM pm_project_progress_recalc(OLD.project_id);
  ELSE
    PERFORM pm_project_progress_recalc(NEW.project_id);
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_pm_tasks_progress ON project_tasks;
CREATE TRIGGER trg_pm_tasks_progress
  AFTER INSERT OR UPDATE OF status OR DELETE ON project_tasks
  FOR EACH ROW EXECUTE FUNCTION pm_tasks_progress_trigger();

-- ─── 3. Views de apoio ────────────────────────────────────────────────────────
-- Saúde do projeto: progresso, dias p/ prazo, razão de custo.
CREATE OR REPLACE VIEW pm_project_health_v AS
SELECT p.id AS project_id, p.name, p.status, p.progress_pct,
       p.total_cents, p.expenses_cents, p.profit_cents,
       (p.due_date - CURRENT_DATE) AS days_to_deadline,
       CASE WHEN p.total_cents > 0 THEN ROUND((p.expenses_cents::numeric / p.total_cents) * 100, 1) ELSE NULL END AS expense_ratio_pct,
       (SELECT COUNT(*) FROM project_tasks t WHERE t.project_id = p.id) AS task_count,
       (SELECT COUNT(*) FROM project_tasks t WHERE t.project_id = p.id AND t.status = 'overdue') AS overdue_count
  FROM projects p;

-- Resumo de atrasos por responsável.
CREATE OR REPLACE VIEW pm_overdue_summary_v AS
SELECT t.assignee_user_id AS user_id,
       COUNT(*) AS overdue_tasks,
       MIN(t.due_date) AS oldest_due
  FROM project_tasks t
 WHERE t.status = 'overdue'
 GROUP BY t.assignee_user_id;

-- ─── 4. Recalc inicial (backfill) ─────────────────────────────────────────────
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT id FROM projects LOOP
    PERFORM pm_recalc_project_expenses(r.id);
    PERFORM pm_project_progress_recalc(r.id);
  END LOOP;
END $$;

-- ─── 5. Módulo relatorios_tarefas_gerenciamento ───────────────────────────────
INSERT INTO modules_catalog
  (module_key, module_name, icon_name, description, route_path, is_system, is_active, sort_order, subsystem_key, created_at, updated_at)
VALUES
  ('relatorios_tarefas_gerenciamento', 'Relatórios de Tarefas', 'BarChart3',
   'Relatórios administrativos de produtividade e custos dos projetos', 'relatorios_tarefas_gerenciamento',
   TRUE, TRUE, 10, 'gerenciamento', NOW(), NOW())
ON CONFLICT (module_key) DO UPDATE SET is_active = TRUE, subsystem_key = 'gerenciamento', updated_at = NOW();

-- Só admin/superadmin/manager têm acesso (relatórios consolidados são sensíveis).
INSERT INTO user_module_permissions (id, user_id, module_key, access_level, created_at, updated_at)
SELECT CONCAT(u.id, '-relatorios_tarefas_gerenciamento'), u.id, 'relatorios_tarefas_gerenciamento', 'view', NOW(), NOW()
  FROM users u
 WHERE u.role IN ('admin','superadmin','manager')
   AND NOT EXISTS (SELECT 1 FROM user_module_permissions ump WHERE ump.user_id = u.id AND ump.module_key = 'relatorios_tarefas_gerenciamento');

-- ─── Validador final ──────────────────────────────────────────────────────────
DO $$
DECLARE missing TEXT[] := ARRAY[]::TEXT[];
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='trg_pm_transactions_cost') THEN missing := array_append(missing, 'trigger custo'); END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='trg_pm_tasks_progress') THEN missing := array_append(missing, 'trigger progresso'); END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.views WHERE table_name='pm_project_health_v') THEN missing := array_append(missing, 'view health'); END IF;
  IF NOT EXISTS (SELECT 1 FROM modules_catalog WHERE module_key='relatorios_tarefas_gerenciamento') THEN missing := array_append(missing, 'módulo relatórios'); END IF;
  IF COALESCE(array_length(missing,1),0) > 0 THEN
    RAISE EXCEPTION 'Migration 052 incompleta: %', array_to_string(missing, ', ');
  END IF;
  RAISE NOTICE 'Migration 052-PM-COSTS-AND-REPORTS aplicada com sucesso.';
END $$;

COMMIT;
