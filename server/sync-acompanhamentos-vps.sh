#!/bin/bash

# Script para sincronizar acompanhamentos.json para a VPS
# Uso: ./sync-acompanhamentos-vps.sh [usuario@host:/caminho/do/projeto]

# Cores para output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Obter o diretório do script
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Verificar se o arquivo existe
ACOMPANHAMENTOS_FILE="$SCRIPT_DIR/database/acompanhamentos.json"

if [ ! -f "$ACOMPANHAMENTOS_FILE" ]; then
    echo -e "${RED}Erro: Arquivo $ACOMPANHAMENTOS_FILE não encontrado!${NC}"
    exit 1
fi

# Verificar se foi fornecido o destino
if [ -z "$1" ]; then
    echo -e "${YELLOW}Uso: $0 usuario@host:/caminho/do/projeto${NC}"
    echo -e "${YELLOW}Exemplo: $0 root@192.168.1.100:/var/www/impgeo${NC}"
    exit 1
fi

DEST="$1"

echo -e "${GREEN}Iniciando sincronização de acompanhamentos...${NC}"
echo -e "Origem: $ACOMPANHAMENTOS_FILE"
echo -e "Destino: $DEST/server/database/acompanhamentos.json"
echo ""

# Fazer backup do arquivo na VPS antes de substituir
echo -e "${YELLOW}Fazendo backup do arquivo existente na VPS...${NC}"
ssh ${DEST%%:*} "cp $DEST/server/database/acompanhamentos.json $DEST/server/database/acompanhamentos.json.backup.$(date +%Y%m%d_%H%M%S) 2>/dev/null || echo 'Arquivo não existe, criando novo'"

# Copiar arquivo
echo -e "${YELLOW}Copiando arquivo...${NC}"
scp "$ACOMPANHAMENTOS_FILE" "${DEST}/server/database/acompanhamentos.json"

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ Arquivo copiado com sucesso!${NC}"
    echo -e "${YELLOW}Nota: Você pode precisar reiniciar o servidor Node.js na VPS para que as mudanças sejam aplicadas.${NC}"
else
    echo -e "${RED}✗ Erro ao copiar arquivo!${NC}"
    exit 1
fi
