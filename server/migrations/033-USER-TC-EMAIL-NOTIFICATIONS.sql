-- 033 — flag opt-in: receber email quando tc_user cadastra registro
-- Default FALSE pra não inundar inbox de quem nunca pediu. O sino in-app
-- continua disparando pra todo mundo com acesso ao módulo TerraControl
-- (independente desta flag); só o email é gated.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS tc_email_notifications BOOLEAN NOT NULL DEFAULT FALSE;

-- Index pra acelerar o filtro no dispatcher (poucos true em geral)
CREATE INDEX IF NOT EXISTS idx_users_tc_email_notifications
  ON users(tc_email_notifications) WHERE tc_email_notifications = TRUE;
