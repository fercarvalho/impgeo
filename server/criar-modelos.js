const XLSX = require('xlsx');
const path = require('path');

// Criar dados de exemplo para o modelo
const modeloTransacoes = [
  {
    'Data': '2025-09-23',
    'Descrição': 'Venda de produto A',
    'Valor': 150.00,
    'Tipo': 'Entrada',
    'Categoria': 'Vendas'
  },
  {
    'Data': '2025-09-23',
    'Descrição': 'Compra de material',
    'Valor': 75.50,
    'Tipo': 'Saída',
    'Categoria': 'Compras'
  },
  {
    'Data': '2025-09-23',
    'Descrição': 'Pagamento de serviço',
    'Valor': 200.00,
    'Tipo': 'Saída',
    'Categoria': 'Serviços'
  }
];

const modeloProdutos = [
  {
    'Nome': 'Produto Exemplo 1',
    'Categoria': 'Eletrônicos',
    'Preço': 299.90,
    'Custo': 150.00,
    'Estoque': 25,
    'Vendido': 8
  },
  {
    'Nome': 'Produto Exemplo 2',
    'Categoria': 'Roupas',
    'Preço': 89.90,
    'Custo': 45.00,
    'Estoque': 50,
    'Vendido': 15
  },
  {
    'Nome': 'Produto Exemplo 3',
    'Categoria': 'Casa',
    'Preço': 149.90,
    'Custo': 75.00,
    'Estoque': 10,
    'Vendido': 3
  }
];

// Função para criar arquivo Excel
function criarArquivoModelo(tipo, dados, nomeArquivo) {
  const workbook = XLSX.utils.book_new();
  const worksheet = XLSX.utils.json_to_sheet(dados);
  
  XLSX.utils.book_append_sheet(workbook, worksheet, tipo === 'transactions' ? 'Transações' : 'Produtos');
  
  const filePath = path.join(__dirname, 'public', nomeArquivo);
  XLSX.writeFile(workbook, filePath);
  
  console.log(`✅ Arquivo ${nomeArquivo} criado em: ${filePath}`);
}

// Criar pasta public se não existir
const publicDir = path.join(__dirname, 'public');
const fs = require('fs');
if (!fs.existsSync(publicDir)) {
  fs.mkdirSync(publicDir, { recursive: true });
}

// Criar arquivos modelo
criarArquivoModelo('transactions', modeloTransacoes, 'modelo-transacoes.xlsx');
criarArquivoModelo('products', modeloProdutos, 'modelo-produtos.xlsx');

console.log('🎉 Arquivos modelo criados com sucesso!');
