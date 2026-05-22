-- =============================================================================
-- 039 — migra flags 033/034 pras tabelas unificadas 037/038
-- =============================================================================
-- Popular notification_preferences e tc_notification_preferences a partir das
-- colunas antigas:
--   users.tc_email_notifications (033)      → notification_preferences
--                                              (type=tc_record_created, channel=email)
--   tc_users.email_notifications (034)      → tc_notification_preferences
--                                              (types tc_record_approved + tc_record_edited, channel=email)
--
-- Estratégia:
--   - SÓ INSERIMOS LINHAS NEGATIVAS (enabled=false) explícitas quando a flag
--     antiga difere do default do mapa em database-pg.js. Manter a tabela
--     enxuta — o helper getNotificationPreference já cai no default sozinho.
--   - Defaults assumidos (devem bater com Database.NOTIFICATION_DEFAULTS):
--       impgeo: tc_record_created/email default = FALSE
--               → só insere linha se user.tc_email_notifications = TRUE (override =TRUE)
--       tc:     tc_record_approved/email default = TRUE
--               tc_record_edited/email   default = TRUE
--               → só insere linha se tc_user.email_notifications = FALSE (override =FALSE)
--
--   - ON CONFLICT DO NOTHING: rodar a migration N vezes não duplica nem sobrescreve
--     preferências que o usuário já alterou pela UI depois da migração inicial.
--
--   - Mantemos as colunas antigas (033/034) intactas — dual-write durante a
--     janela de transição. Migration futura derruba quando confirmado que
--     nada lê mais delas.
--
-- DEFENSIVA: usa DO block + EXISTS check no information_schema pra:
--   1. Funcionar em ambientes onde 033/034 nunca rodou (dev local novo).
--   2. Funcionar APÓS uma migration futura que dropa as colunas legadas
--      (a 039 vira no-op idempotente).
--
-- IDEMPOTENTE.
-- =============================================================================

BEGIN;

-- impgeo: users com opt-in de email pra notificação de novo tc_record
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = current_schema()
       AND table_name = 'users'
       AND column_name = 'tc_email_notifications'
  ) THEN
    INSERT INTO notification_preferences (id, user_id, notification_type, channel, enabled)
    SELECT
      to_hex(extract(epoch from NOW())::bigint) || '-' || substr(md5(u.id || 'tc_email'), 1, 12),
      u.id,
      'tc_record_created',
      'email',
      TRUE
    FROM users u
    WHERE u.tc_email_notifications = TRUE
    ON CONFLICT (user_id, notification_type, channel) DO NOTHING;
    RAISE NOTICE '039: migrou opt-ins de tc_email_notifications (impgeo users)';
  ELSE
    RAISE NOTICE '039: coluna users.tc_email_notifications não existe — pulando (esperado em dev pré-033 ou pós-drop)';
  END IF;
END $$;

-- tc_users: opt-out de email (default é TRUE, então só persiste o FALSE)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = current_schema()
       AND table_name = 'tc_users'
       AND column_name = 'email_notifications'
  ) THEN
    INSERT INTO tc_notification_preferences (id, tc_user_id, notification_type, channel, enabled)
    SELECT
      to_hex(extract(epoch from NOW())::bigint) || '-' || substr(md5(tu.id || 'approved'), 1, 12),
      tu.id,
      'tc_record_approved',
      'email',
      FALSE
    FROM tc_users tu
    WHERE tu.email_notifications = FALSE
    ON CONFLICT (tc_user_id, notification_type, channel) DO NOTHING;

    INSERT INTO tc_notification_preferences (id, tc_user_id, notification_type, channel, enabled)
    SELECT
      to_hex(extract(epoch from NOW())::bigint) || '-' || substr(md5(tu.id || 'edited'), 1, 12),
      tu.id,
      'tc_record_edited',
      'email',
      FALSE
    FROM tc_users tu
    WHERE tu.email_notifications = FALSE
    ON CONFLICT (tc_user_id, notification_type, channel) DO NOTHING;
    RAISE NOTICE '039: migrou opt-outs de tc_users.email_notifications';
  ELSE
    RAISE NOTICE '039: coluna tc_users.email_notifications não existe — pulando (esperado em dev pré-034 ou pós-drop)';
  END IF;
END $$;

COMMIT;
