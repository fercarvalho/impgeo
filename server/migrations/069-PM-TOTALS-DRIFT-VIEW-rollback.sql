-- Rollback da 069-PM-TOTALS-DRIFT-VIEW.sql
-- Remove a view de reconciliação (read-only, sem dados de negócio).
BEGIN;
DROP VIEW IF EXISTS pm_totals_drift_v;
COMMIT;
