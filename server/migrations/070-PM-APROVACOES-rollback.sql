-- ═══════════════════════════════════════════════════════════════════════════
-- 070-PM-APROVACOES-rollback.sql
-- Reverte a 070 (módulo Central de Aprovações). Backup antes:
--   pg_dump $DATABASE_URL_IMPGEO > backups/backup-rollback-070-$(date +%F).sql
-- Remove só o catálogo + permissões do módulo (sem dados de negócio).
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

DELETE FROM user_module_permissions WHERE module_key = 'aprovacoes_gerenciamento';
DELETE FROM modules_catalog WHERE module_key = 'aprovacoes_gerenciamento';

COMMIT;
