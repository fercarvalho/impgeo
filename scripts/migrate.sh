#!/bin/bash
# ============================================================
# migrate.sh
# Portão de migrations do deploy (e uso avulso).
#   • Mostra o status (quantas pendentes).
#   • Se NÃO houver pendente → sai 0 (deploy segue normal).
#   • Se houver → pergunta. Com 'sim': BACKUP (pg_dump) + aplica (runner up)
#     e sai 0 (deploy continua). Com 'não': sai 1 (aborta o deploy — não
#     reinicie a app com o schema atrasado).
#
# Chamado pelo deploy-impgeo logo após o 'git pull':
#     bash scripts/migrate.sh || exit 1
# Requer $DATABASE_URL_IMPGEO (para o pg_dump).
# Reverter a última:  node server/migrations/runner.js down <versão>
# ============================================================
set -euo pipefail
cd "$(dirname "$0")/.."   # raiz do repo, independente de onde foi chamado

out="$(node server/migrations/runner.js status)"
echo "$out"
pend="$(echo "$out" | grep -oE '[0-9]+ pendente' | grep -oE '^[0-9]+' || true)"

if [ "${pend:-0}" = "0" ]; then
  echo "✔ Migrations em dia."
  exit 0
fi

echo "⚠️  ${pend} migration(s) pendente(s)."
read -r -p "Fazer backup e aplicar agora? [s/N] " ok
if [[ ! "$ok" =~ ^[sS]$ ]]; then
  echo "✋ Não aplicado — deploy abortado (não reinicie com o schema atrás)."
  exit 1
fi

: "${DATABASE_URL_IMPGEO:?defina/exporte DATABASE_URL_IMPGEO para o pg_dump}"
mkdir -p backups
bkp="backups/backup-pre-migrate-$(date +%F-%H%M%S).sql"
echo "▶ Backup → $bkp"
pg_dump "$DATABASE_URL_IMPGEO" > "$bkp"

node server/migrations/runner.js up
echo "▶ Status final:"
node server/migrations/runner.js status
echo "✔ Migrations aplicadas — deploy continua."
