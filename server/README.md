# 🚀 Sistema Alya - Backend API

## 📋 Descrição

API backend para o sistema financeiro Alya, responsável por processar imports/exports de dados em Excel.

## 🛠️ Instalação

```bash
cd server
npm install
node server.js
```

## 📡 Endpoints

### GET /api/test
Testa se a API está funcionando.

**Resposta:**
```json
{
  "message": "API funcionando!",
  "timestamp": "2025-09-23T18:53:00.000Z"
}
```

### POST /api/import
Importa dados de arquivo Excel (.xlsx).

**Parâmetros:**
- `file`: Arquivo Excel (.xlsx)
- `type`: "transactions" ou "products"

**Resposta:**
```json
{
  "success": true,
  "message": "2 transações importadas com sucesso!",
  "data": [...],
  "count": 2,
  "type": "transactions"
}
```

### POST /api/export
Exporta dados como arquivo Excel.

**Body:**
```json
{
  "type": "transactions", // ou "products"
  "data": [...]
}
```

## 📊 Formato dos Dados

### Transações
```javascript
{
  id: number,
  date: string,        // YYYY-MM-DD
  description: string,
  value: number,
  type: string,        // "Entrada" ou "Saída"
  category: string
}
```

### Produtos
```javascript
{
  id: number,
  name: string,
  category: string,
  price: number,
  cost: number,
  stock: number,
  sold: number
}
```

## 📂 Estrutura de Arquivos Excel

### Para Transações:
| Data | Descrição | Valor | Tipo | Categoria |
|------|-----------|--------|------|-----------|
| 2025-09-23 | Venda 1 | 100 | Entrada | Vendas |

### Para Produtos:
| Nome | Categoria | Preço | Custo | Estoque | Vendido |
|------|-----------|--------|-------|---------|---------|
| Produto A | Categoria 1 | 100 | 50 | 10 | 5 |

## 🔧 Status Atual

- ✅ Servidor criado e configurado
- ✅ Endpoints implementados
- ✅ Processamento de Excel
- ✅ Frontend integrado com fallback local
- ⚠️ Servidor apresenta instabilidade (investigando)

## 💡 Fallback Local

O frontend possui fallback automático:
- Se o servidor estiver offline, usa dados mock
- Export gera arquivos CSV localmente
- Import adiciona dados de exemplo

## 🐛 Troubleshooting

Se o servidor não iniciar:
1. Verifique se a porta 3001 está livre
2. Confirme que as dependências estão instaladas
3. Use o servidor simples: `node simple-server.js`
