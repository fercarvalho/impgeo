#!/bin/bash
# ============================================================
# check-migrations.sh
# Checagem READ-ONLY: há migrations pendentes (não aplicadas)?
# Serve para o deploy NÃO reiniciar a app com o schema atrasado
# (código novo referenciando objeto que ainda não existe).
#
#   • Sai 0 e imprime "em dia" se tudo aplicado.
#   • Sai 1 (com aviso) se houver pendentes → o deploy deve abortar
#     e você roda 'bash scripts/migrate.sh' antes.
#
# Não escreve nada no banco. Uso: bash scripts/check-migrations.sh
# ============================================================
set -euo pipefail
cd "$(dirname "$0")/.."   # raiz do repo, independente de onde foi chamado

out="$(node server/migrations/runner.js status)"
echo "$out"
pend="$(echo "$out" | grep -oE '[0-9]+ pendente' | grep -oE '^[0-9]+' || true)"

if [ "${pend:-0}" != "0" ]; then
  echo "⚠️  ${pend} migration(s) pendente(s). Rode 'bash scripts/migrate.sh' (backup + up) ANTES de reiniciar."
  exit 1
fi
echo "✔ Migrations em dia."
