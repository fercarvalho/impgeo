-- Reverte 039: remove apenas as linhas inseridas pela migração de email.
-- Cuidado: se o user tocou esses toggles depois pela UI, esta deleção também
-- volta o estado. Por isso esta migration NÃO deveria precisar de rollback em
-- prod — o rollback é destrutivo. Use só se a migração rodou e foi imediatamente
-- detectada como errada.

BEGIN;

DELETE FROM notification_preferences
 WHERE notification_type = 'tc_record_created'
   AND channel = 'email';

DELETE FROM tc_notification_preferences
 WHERE notification_type IN ('tc_record_approved', 'tc_record_edited')
   AND channel = 'email';

COMMIT;
