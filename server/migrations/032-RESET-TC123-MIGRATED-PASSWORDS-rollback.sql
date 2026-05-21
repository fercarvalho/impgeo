-- Rollback de 032: NÃO é possível recuperar o hash original ('tc123').
-- Se você precisar reverter, manualmente:
--   1. Identifique os tc_users afetados pela última run da 032
--   2. Para cada um, gere novo hash bcrypt da senha que deseja
--   3. UPDATE tc_users SET password=<novo_hash> WHERE id=...
--
-- O rollback "automático" abaixo não restaura nada — apenas existe pra
-- consistência do padrão de rollback files. A 032 é efetivamente uma
-- operação one-way (igual a outras invalidações de credenciais).
BEGIN;
-- intencionalmente vazio
COMMIT;
