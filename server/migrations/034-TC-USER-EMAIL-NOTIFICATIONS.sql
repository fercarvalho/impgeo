-- 034 — flag opt-out: tc_user pode desligar emails de eventos
-- Default TRUE (oposto da flag do impgeo): tc_user precisa receber por padrão
-- avisos de aprovação/edição dos próprios registros — só desliga se quiser.
-- Emails transacionais críticos (reset de senha, convite) NÃO consultam essa
-- flag — eles sempre disparam, são parte essencial do fluxo de acesso.

ALTER TABLE tc_users
  ADD COLUMN IF NOT EXISTS email_notifications BOOLEAN NOT NULL DEFAULT TRUE;
