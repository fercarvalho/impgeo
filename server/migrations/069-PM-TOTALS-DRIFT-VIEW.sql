-- ═══════════════════════════════════════════════════════════════════════════
-- 069-PM-TOTALS-DRIFT-VIEW.sql
-- Reconciliação de totais (melhorias #10/#14). View que expõe os projetos cujos
-- totais denormalizados divergem do valor recomputado da fonte:
--   - expenses_cents : soma de transactions type='Despesa' (× 100)
--   - progress_pct   : % de tarefas concluídas (fora de canceled/refused)
--
-- ⚠️ INVARIANTE: as fórmulas de `expected_*` abaixo DEVEM espelhar 1:1 as
-- funções pm_recalc_project_expenses() e pm_project_progress_recalc() da
-- migration 052. Ao mudar uma, mude a outra — senão a reconciliação diverge.
-- (profit_cents é GENERATED — não pode divergir; paid_cents/total_cents são
-- definidos pela app, não são agregados de linhas-filhas.)
--
-- Só as linhas COM divergência aparecem (IS DISTINCT FROM). Read-only; o
-- conserto é feito chamando as funções de recalc da 052 (reconcile-service).
--
-- Idempotente (CREATE OR REPLACE), transacional, validador final.
-- Rollback: 069-PM-TOTALS-DRIFT-VIEW-rollback.sql
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

CREATE OR REPLACE VIEW pm_totals_drift_v AS
SELECT * FROM (
  SELECT
    p.id   AS project_id,
    p.name AS project_name,
    p.expenses_cents AS stored_expenses_cents,
    COALESCE((
      SELECT ROUND(SUM(value) * 100)::BIGINT
        FROM transactions t
       WHERE t.project_id = p.id AND t.type = 'Despesa'
    ), 0) AS expected_expenses_cents,
    p.progress_pct AS stored_progress_pct,
    CASE WHEN COALESCE(agg.total, 0) = 0 THEN 0
         ELSE ROUND((agg.done::numeric / agg.total) * 100, 2) END AS expected_progress_pct
  FROM projects p
  CROSS JOIN LATERAL (
    SELECT COUNT(*) FILTER (WHERE status NOT IN ('canceled','refused')) AS total,
           COUNT(*) FILTER (WHERE status = 'completed')                 AS done
      FROM project_tasks WHERE project_id = p.id
  ) agg
) d
WHERE d.stored_expenses_cents IS DISTINCT FROM d.expected_expenses_cents
   OR d.stored_progress_pct   IS DISTINCT FROM d.expected_progress_pct;

-- ─── Validador final ──────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.views WHERE table_name = 'pm_totals_drift_v') THEN
    RAISE EXCEPTION 'Migration 069 incompleta: view pm_totals_drift_v não criada.';
  END IF;
  RAISE NOTICE 'Migration 069-PM-TOTALS-DRIFT-VIEW aplicada com sucesso.';
END $$;

COMMIT;
