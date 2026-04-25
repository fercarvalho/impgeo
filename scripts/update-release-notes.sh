#!/bin/bash
# ============================================================
# update-release-notes.sh
# Detecta o último commit e armazena como "pendente" no banco
# para que o superadmin possa confirmá-lo ao fazer login.
# Uso: bash scripts/update-release-notes.sh
# ============================================================

set -e

# Configuração do banco de dados
DB_URL="${DATABASE_URL:-}"
API_PORT="${PORT:-9001}"

# Pega o hash e a mensagem do último commit
COMMIT_HASH=$(git rev-parse HEAD 2>/dev/null || echo "")
COMMIT_MSG=$(git log -1 --pretty=%s 2>/dev/null || echo "")
COMMIT_DATE=$(git log -1 --date=format:'%d/%m/%Y' --pretty=%cd 2>/dev/null || date '+%d/%m/%Y')

if [ -z "$COMMIT_HASH" ]; then
  echo "⚠️  Nenhum commit encontrado. Abortando."
  exit 0
fi

echo "📦 Commit: ${COMMIT_HASH:0:7}"
echo "📝 Mensagem: $COMMIT_MSG"
echo "📅 Data: $COMMIT_DATE"

# Usa psql (disponível no servidor) para inserir no banco
if command -v psql &> /dev/null && [ -n "$DB_URL" ]; then
  NOW=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
  psql "$DB_URL" <<-SQL
    INSERT INTO rodape_configuracoes (chave, valor, updated_at)
    VALUES
      ('ultimo_commit_inserido', '$COMMIT_HASH', '$NOW'),
      ('ultimo_commit_msg',      '$COMMIT_MSG',  '$NOW'),
      ('ultimo_commit_data',     '$COMMIT_DATE', '$NOW')
    ON CONFLICT (chave) DO UPDATE SET valor = EXCLUDED.valor, updated_at = EXCLUDED.updated_at;
SQL
  echo "✅ Commit pendente registrado no banco."
else
  echo "⚠️  psql não encontrado ou DATABASE_URL não definida."
  echo "   Execute manualmente o SQL acima no banco de dados."
fi
