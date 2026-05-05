#!/bin/bash
# ============================================================
# update-release-notes.sh
# Detecta os commits novos desde a última execução e empilha
# todos eles na fila commits_pendentes para que o superadmin
# possa processá-los um a um (carrossel) ao fazer login.
#
# Como funciona:
#   • Lê ultimo_commit_inserido do banco (ponteiro do último commit
#     que esse script já viu).
#   • Se existir e ainda estiver na história do git, lista
#     git log <prev>..HEAD e empilha cada commit na fila.
#   • Se não existir (primeira execução) ou se o commit anterior
#     não estiver mais na história (force-push, rebase), faz
#     fallback: empilha apenas HEAD.
#   • Atualiza o ponteiro para o HEAD atual ao final.
#
# Uso: bash scripts/update-release-notes.sh
# ============================================================

set -e

# Carrega .env da raiz do projeto (caso o hook rode sem variáveis de ambiente)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
if [ -f "$ROOT_DIR/server/.env" ]; then
  set -a
  # shellcheck disable=SC1091
  source "$ROOT_DIR/server/.env"
  set +a
fi

# Configuração do banco de dados
# Usa DATABASE_URL_IMPGEO (produção) ou fallback para banco local em desenvolvimento
DB_URL="${DATABASE_URL_IMPGEO:-}"
API_PORT="${PORT:-9001}"

# Fallback para desenvolvimento local: conecta sem URL usando peer auth
if [ -z "$DB_URL" ] && command -v psql &> /dev/null; then
  DB_NAME="${DB_NAME:-impgeo}"
  DB_USER="${DB_USER:-$(whoami)}"
  DB_URL="postgresql://$DB_USER@localhost/$DB_NAME"
fi

HEAD_HASH=$(git rev-parse HEAD 2>/dev/null || echo "")
if [ -z "$HEAD_HASH" ]; then
  echo "⚠️  Nenhum commit encontrado. Abortando."
  exit 0
fi

if ! command -v psql &> /dev/null || [ -z "$DB_URL" ]; then
  echo "⚠️  psql não encontrado ou DATABASE_URL não definida. Abortando."
  exit 0
fi

# Lê o ponteiro do último commit que este script já processou
PREV_HASH=$(psql "$DB_URL" -At -c "SELECT valor FROM rodape_configuracoes WHERE chave = 'ultimo_commit_inserido'" 2>/dev/null || echo "")

# Determina a lista de commits a processar
if [ -n "$PREV_HASH" ] && git cat-file -e "$PREV_HASH^{commit}" 2>/dev/null; then
  if [ "$PREV_HASH" = "$HEAD_HASH" ]; then
    echo "ℹ️  Nenhum commit novo desde $(git rev-parse --short "$PREV_HASH"). Nada a fazer."
    exit 0
  fi
  RANGE="${PREV_HASH}..HEAD"
  echo "🔁 Empilhando commits em ${RANGE}…"
  HASHES=$(git log --reverse --pretty=format:'%H' "$RANGE" 2>/dev/null || echo "")
else
  # Primeira execução ou ponteiro inválido (force-push/rebase) → só o HEAD
  if [ -n "$PREV_HASH" ]; then
    echo "⚠️  Commit anterior ($PREV_HASH) não está mais na história — empilhando apenas HEAD."
  else
    echo "ℹ️  Primeira execução — empilhando apenas o HEAD atual."
  fi
  HASHES="$HEAD_HASH"
fi

if [ -z "$HASHES" ]; then
  echo "ℹ️  Nenhum commit a empilhar."
  exit 0
fi

NOW=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

# Constrói os INSERTs em um único bloco SQL para evitar N round-trips
SQL_INSERTS=""
COUNT=0
LAST_MSG=""
LAST_DATE=""
while IFS= read -r HASH; do
  [ -z "$HASH" ] && continue
  MSG=$(git log -1 --pretty=%s "$HASH" 2>/dev/null || echo "")
  DATE=$(git log -1 --date=format:'%d/%m/%Y' --pretty=%cd "$HASH" 2>/dev/null || date '+%d/%m/%Y')
  ESCAPED_MSG=$(printf '%s' "$MSG" | sed "s/'/''/g")
  SQL_INSERTS="${SQL_INSERTS}
    INSERT INTO commits_pendentes (commit_hash, mensagem, data, detectado_em)
    VALUES ('$HASH', '$ESCAPED_MSG', '$DATE', '$NOW')
    ON CONFLICT (commit_hash) DO NOTHING;"
  COUNT=$((COUNT + 1))
  LAST_MSG="$ESCAPED_MSG"
  LAST_DATE="$DATE"
  echo "  • ${HASH:0:7} — $MSG"
done <<< "$HASHES"

if [ "$COUNT" -eq 0 ]; then
  echo "ℹ️  Nenhum commit a empilhar."
  exit 0
fi

# Aplica os INSERTs em uma única transação e atualiza o ponteiro
psql "$DB_URL" <<-SQL
  BEGIN;
  $SQL_INSERTS

  -- Atualiza o ponteiro para o HEAD atual (compat com chaves antigas)
  INSERT INTO rodape_configuracoes (chave, valor, updated_at)
  VALUES
    ('ultimo_commit_inserido', '$HEAD_HASH', '$NOW'),
    ('ultimo_commit_msg',      '$LAST_MSG',  '$NOW'),
    ('ultimo_commit_data',     '$LAST_DATE', '$NOW')
  ON CONFLICT (chave) DO UPDATE SET valor = EXCLUDED.valor, updated_at = EXCLUDED.updated_at;
  COMMIT;
SQL

echo "✅ $COUNT commit(s) empilhado(s) na fila."
