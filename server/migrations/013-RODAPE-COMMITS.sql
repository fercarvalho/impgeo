-- Migration 013: Controle de commits pendentes no rodapé
-- Usa a tabela rodape_configuracoes existente com chaves especiais:
--   ultimo_commit_inserido   → hash do commit detectado pelo hook
--   ultimo_commit_confirmado → hash do commit confirmado pelo superadmin
--   ultimo_commit_msg        → mensagem do commit
--   ultimo_commit_data       → data do commit (DD/MM/YYYY)

-- Garante que as chaves de controle existam (sem sobrescrever valores)
INSERT INTO rodape_configuracoes (chave, valor) VALUES
  ('ultimo_commit_inserido',   ''),
  ('ultimo_commit_confirmado', ''),
  ('ultimo_commit_msg',        ''),
  ('ultimo_commit_data',       ''),
  ('versao_notificada',        ''),
  ('versao_notificada_roles',  '[]'),
  ('versao_notificada_texto',  '')
ON CONFLICT (chave) DO NOTHING;
