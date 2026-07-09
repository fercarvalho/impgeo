#!/bin/bash
# ============================================================
# migrate.sh
# Aplica as migrations pendentes do impgeo, com BACKUP antes e
# confirmação. Passo DELIBERADO — não roda no deploy automático.
#
# Fluxo:
#   • mostra o status (quantas pendentes);
#   • pede confirmação;
#   • faz pg_dump para backups/backup-pre-migrate-<data>.sql;
#   • roda o runner (up) e mostra o status final.
#
# Requer $DATABASE_URL_IMPGEO (para o pg_dump).
# Reverter a última:  node server/migrations/runner.js down <versão>
# Uso: bash scripts/migrate.sh
# ============================================================
set -euo pipefail
cd "$(dirname "$0")/.."   # raiz do repo

echo "▶ Status atual:"
node server/migrations/runner.js status
echo
read -r -p "Backup + aplicar as pendentes? [s/N] " ok
[[ "$ok" =~ ^[sS]$ ]] || { echo "Cancelado."; exit 0; }

: "${DATABASE_URL_IMPGEO:?defina/exporte DATABASE_URL_IMPGEO para o pg_dump}"
mkdir -p backups
bkp="backups/backup-pre-migrate-$(date +%F-%H%M%S).sql"
echo "▶ Backup → $bkp"
pg_dump "$DATABASE_URL_IMPGEO" > "$bkp"

node server/migrations/runner.js up
echo "▶ Status final:"
node server/migrations/runner.js status
echo "✔ Feito. Se o deploy incluiu código novo, rode: deploy-impgeo (ou pm2 restart impgeo-api --update-env)"
