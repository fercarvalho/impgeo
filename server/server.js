const express = require('express');
const multer = require('multer');
const XLSX = require('xlsx');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const Database = require('./database');

const app = express();
const port = 9001;
const db = new Database();

// Middleware
app.use(cors());
app.use(express.json());

// Configuração do Multer para upload de arquivos
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadDir = path.join(__dirname, 'uploads');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    // Manter o nome original com timestamp para evitar conflitos
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({ 
  storage: storage,
  fileFilter: (req, file, cb) => {
    // Aceitar apenas arquivos .xlsx
    if (path.extname(file.originalname).toLowerCase() === '.xlsx') {
      cb(null, true);
    } else {
      cb(new Error('Apenas arquivos .xlsx são permitidos!'), false);
    }
  },
  limits: {
    fileSize: 5 * 1024 * 1024 // Limite de 5MB
  }
});

// Função para processar dados de transações
function processTransactions(worksheet) {
  const data = XLSX.utils.sheet_to_json(worksheet);
  const transactions = [];

  data.forEach((row, index) => {
    try {
      // Mapear colunas do Excel para o formato esperado
      const transaction = {
        id: Date.now() + index,
        date: row['Data'] || row['date'] || new Date().toISOString().split('T')[0],
        description: row['Descrição'] || row['Descricao'] || row['description'] || row['Description'] || '',
        value: parseFloat(row['Valor'] || row['value'] || row['Value'] || 0),
        type: row['Tipo'] || row['type'] || row['Type'] || 'Entrada',
        category: row['Categoria'] || row['category'] || row['Category'] || 'Outros',
        subcategory: row['Subcategoria'] || row['SubCategoria'] || row['subcategory'] || row['Subcategory'] || ''
      };

      // Validar se tem dados essenciais
      if (transaction.description && transaction.value) {
        transactions.push(transaction);
      }
    } catch (error) {
      console.log(`Erro ao processar linha ${index + 1}:`, error.message);
    }
  });

  return transactions;
}

// Função para processar dados de produtos
function processProducts(worksheet) {
  const data = XLSX.utils.sheet_to_json(worksheet);
  const products = [];

  data.forEach((row, index) => {
    try {
      // Mapear colunas do Excel para o formato esperado
      const product = {
        id: Date.now() + index,
        name: row['Nome'] || row['name'] || row['Name'] || '',
        category: row['Categoria'] || row['category'] || row['Category'] || 'Outros',
        price: parseFloat(row['Preço'] || row['Preco'] || row['price'] || row['Price'] || 0),
        cost: parseFloat(row['Custo'] || row['cost'] || row['Cost'] || 0),
        stock: parseInt(row['Estoque'] || row['stock'] || row['Stock'] || 0),
        sold: parseInt(row['Vendido'] || row['sold'] || row['Sold'] || 0)
      };

      // Validar se tem dados essenciais
      if (product.name) {
        products.push(product);
      }
    } catch (error) {
      console.log(`Erro ao processar linha ${index + 1}:`, error.message);
    }
  });

  return products;
}

// Função para processar dados de clientes
function processClients(worksheet) {
  const data = XLSX.utils.sheet_to_json(worksheet);
  const clients = [];

  data.forEach((row, index) => {
    try {
      // Mapear colunas do Excel para o formato esperado
      const documentType = row['Tipo de Documento'] || row['tipo de documento'] || row['Tipo de documento'] || 'cpf';
      const client = {
        id: Date.now() + index,
        name: row['Nome'] || row['name'] || row['Name'] || '',
        email: row['Email'] || row['email'] || row['Email'] || '',
        phone: row['Telefone'] || row['phone'] || row['Phone'] || '',
        address: row['Endereço'] || row['Endereco'] || row['address'] || row['Address'] || '',
        cpf: documentType === 'cpf' ? (row['CPF'] || row['cpf'] || row['Cpf'] || '') : '',
        cnpj: documentType === 'cnpj' ? (row['CNPJ'] || row['cnpj'] || row['Cnpj'] || '') : ''
      };

      // Validar se tem dados essenciais
      if (client.name && client.email) {
        clients.push(client);
      }
    } catch (error) {
      console.log(`Erro ao processar linha ${index + 1}:`, error.message);
    }
  });

  return clients;
}

// Função para processar dados de projetos
function processProjects(worksheet) {
  const data = XLSX.utils.sheet_to_json(worksheet);
  const projects = [];

  data.forEach((row, index) => {
    try {
      // Mapear colunas do Excel para o formato esperado
      const servicesString = row['Serviços'] || row['servicos'] || row['services'] || row['Services'] || '';
      const services = servicesString ? servicesString.split(',').map(s => s.trim()).filter(s => s) : [];
      
      const project = {
        id: Date.now() + index,
        name: row['Nome'] || row['name'] || row['Name'] || '',
        description: row['Descrição'] || row['descricao'] || row['description'] || row['Description'] || '',
        client: row['Cliente'] || row['client'] || row['Client'] || '',
        startDate: row['Data Início'] || row['data_inicio'] || row['startDate'] || row['StartDate'] || '',
        endDate: row['Data Fim'] || row['data_fim'] || row['endDate'] || row['EndDate'] || '',
        status: row['Status'] || row['status'] || row['Status'] || 'ativo',
        value: parseFloat(row['Valor'] || row['valor'] || row['value'] || row['Value'] || 0),
        progress: parseInt(row['Progresso'] || row['progresso'] || row['progress'] || row['Progress'] || 0),
        services: services
      };

      // Validar se tem dados essenciais
      if (project.name && project.client) {
        projects.push(project);
      }
    } catch (error) {
      console.log(`Erro ao processar linha ${index + 1}:`, error.message);
    }
  });

  return projects;
}

// Rota para baixar modelo de arquivo
app.get('/api/modelo/:type', (req, res) => {
  try {
    const { type } = req.params;
    if (!['transactions', 'products', 'clients', 'projects'].includes(type)) {
      return res.status(400).json({ error: 'Tipo inválido! Use "transactions", "products", "clients" ou "projects"' });
    }

    // Sempre gerar arquivo modelo dinamicamente para garantir colunas atualizadas
    const workbook = XLSX.utils.book_new();
    let worksheet;

    if (type === 'transactions') {
      // Criar dados de exemplo com todas as colunas
      const sampleData = [
        {
          'Data': '2024-01-15',
          'Descrição': 'Venda de produto',
          'Valor': 150.00,
          'Tipo': 'Receita',
          'Categoria': 'Vendas',
          'Subcategoria': 'Online'
        },
        {
          'Data': '2024-01-16',
          'Descrição': 'Compra de material',
          'Valor': 75.50,
          'Tipo': 'Despesa',
          'Categoria': 'Compras',
          'Subcategoria': 'Escritório'
        }
      ];
      worksheet = XLSX.utils.json_to_sheet(sampleData);
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Transações');
    } else if (type === 'clients') {
      const sampleData = [
        {
          'Nome': 'João Silva',
          'Email': 'joao@email.com',
          'Telefone': '(11) 99999-9999',
          'Endereço': 'Rua das Flores, 123',
          'Tipo de Documento': 'cpf',
          'CPF': '123.456.789-00',
          'CNPJ': ''
        },
        {
          'Nome': 'Empresa XYZ Ltda',
          'Email': 'contato@empresa.com',
          'Telefone': '(11) 88888-8888',
          'Endereço': 'Av. Principal, 456',
          'Tipo de Documento': 'cnpj',
          'CPF': '',
          'CNPJ': '12.345.678/0001-90'
        }
      ];
      worksheet = XLSX.utils.json_to_sheet(sampleData);
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Clientes');
    } else if (type === 'projects') {
      const sampleData = [
        {
          'Nome': 'Projeto Topografia Urbana',
          'Descrição': 'Levantamento topográfico para loteamento',
          'Cliente': 'Construtora ABC',
          'Data Início': '2024-01-15',
          'Data Fim': '2024-03-15',
          'Status': 'ativo',
          'Valor': 15000.00,
          'Progresso': 60,
          'Serviços': 'servico1,servico2'
        },
        {
          'Nome': 'Projeto Georreferenciamento',
          'Descrição': 'Georreferenciamento de propriedade rural',
          'Cliente': 'Fazenda XYZ',
          'Data Início': '2024-02-01',
          'Data Fim': '2024-02-28',
          'Status': 'concluido',
          'Valor': 8500.00,
          'Progresso': 100,
          'Serviços': 'servico3'
        }
      ];
      worksheet = XLSX.utils.json_to_sheet(sampleData);
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Projetos');
    } else {
      const headers = [{
        'Nome': '',
        'Categoria': '',
        'Preço': '',
        'Custo': '',
        'Estoque': '',
        'Vendido': ''
      }];
      worksheet = XLSX.utils.json_to_sheet(headers);
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Produtos');
    }

    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
    const filename = type === 'transactions' ? 'modelo-transacoes.xlsx' : 
                    type === 'clients' ? 'modelo-clientes.xlsx' : 
                    type === 'projects' ? 'modelo-projetos.xlsx' : 'modelo-produtos.xlsx';
    res.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length': buffer.length
    });
    return res.send(buffer);
  } catch (error) {
    console.error('Erro ao baixar modelo:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// Rota para importar arquivos
app.post('/api/import', upload.single('file'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Nenhum arquivo foi enviado!' });
    }

    const { type } = req.body; // 'transactions' ou 'products'
    
    if (!type || !['transactions', 'products', 'clients', 'projects'].includes(type)) {
      return res.status(400).json({ error: 'Tipo inválido! Use "transactions", "products", "clients" ou "projects"' });
    }

    console.log(`Processando arquivo: ${req.file.originalname} (${type})`);

    // Ler o arquivo Excel
    const workbook = XLSX.readFile(req.file.path);
    const sheetName = workbook.SheetNames[0]; // Pegar a primeira aba
    const worksheet = workbook.Sheets[sheetName];

    let processedData = [];
    let message = '';

    if (type === 'transactions') {
      processedData = processTransactions(worksheet);
      message = `${processedData.length} transações importadas com sucesso!`;
    } else if (type === 'products') {
      processedData = processProducts(worksheet);
      message = `${processedData.length} produtos importados com sucesso!`;
    } else if (type === 'clients') {
      processedData = processClients(worksheet);
      message = `${processedData.length} clientes importados com sucesso!`;
    } else if (type === 'projects') {
      processedData = processProjects(worksheet);
      message = `${processedData.length} projetos importados com sucesso!`;
    }

    // Limpar o arquivo temporário
    fs.unlinkSync(req.file.path);

    res.json({
      success: true,
      message: message,
      data: processedData,
      count: processedData.length,
      type: type
    });

  } catch (error) {
    console.error('Erro ao processar arquivo:', error);
    
    // Limpar arquivo em caso de erro
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    
    res.status(500).json({ 
      error: 'Erro interno do servidor',
      message: error.message 
    });
  }
});

// Rota para exportar dados (futura implementação)
app.post('/api/export', (req, res) => {
  const { type, data } = req.body;
  
  try {
    // Criar um novo workbook
    const workbook = XLSX.utils.book_new();
    let worksheet;

    if (type === 'transactions') {
      // Mapear dados para formato Excel
      const excelData = data.map(t => ({
        'Data': t.date,
        'Descrição': t.description,
        'Valor': t.value,
        'Tipo': t.type,
        'Categoria': t.category,
        'Subcategoria': t.subcategory || ''
      }));
      worksheet = XLSX.utils.json_to_sheet(excelData);
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Transações');
    } else if (type === 'products') {
      // Mapear dados para formato Excel
      const excelData = data.map(p => ({
        'Nome': p.name,
        'Categoria': p.category,
        'Preço': p.price,
        'Custo': p.cost,
        'Estoque': p.stock,
        'Vendido': p.sold
      }));
      worksheet = XLSX.utils.json_to_sheet(excelData);
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Produtos');
    } else if (type === 'clients') {
      // Mapear dados para formato Excel
      const excelData = data.map(c => ({
        'Nome': c.name,
        'Email': c.email,
        'Telefone': c.phone,
        'Endereço': c.address,
        'CPF': c.cpf || '',
        'CNPJ': c.cnpj || ''
      }));
      worksheet = XLSX.utils.json_to_sheet(excelData);
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Clientes');
    }

    // Gerar buffer do arquivo
    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

    // Configurar headers para download
    const filename = `${type}_${new Date().toISOString().split('T')[0]}.xlsx`;
    res.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length': buffer.length
    });

    res.send(buffer);

  } catch (error) {
    console.error('Erro ao exportar dados:', error);
    res.status(500).json({ 
      error: 'Erro ao exportar dados',
      message: error.message 
    });
  }
});

// APIs para Transações
app.get('/api/transactions', (req, res) => {
  try {
    const transactions = db.getAllTransactions();
    res.json({ success: true, data: transactions });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/transactions', (req, res) => {
  try {
    const transaction = db.saveTransaction(req.body);
    res.json({ success: true, data: transaction });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.put('/api/transactions/:id', (req, res) => {
  try {
    const { id } = req.params;
    const transaction = db.updateTransaction(id, req.body);
    res.json({ success: true, data: transaction });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.delete('/api/transactions/:id', (req, res) => {
  try {
    const { id } = req.params;
    db.deleteTransaction(id);
    res.json({ success: true, message: 'Transação deletada com sucesso' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.delete('/api/transactions', (req, res) => {
  try {
    const { ids } = req.body;
    if (!Array.isArray(ids)) {
      return res.status(400).json({ success: false, error: 'IDs devem ser um array' });
    }
    db.deleteMultipleTransactions(ids);
    res.json({ success: true, message: `${ids.length} transações deletadas com sucesso` });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// APIs para Subcategorias
app.get('/api/subcategories', (req, res) => {
  try {
    const subcategories = db.getAllSubcategories();
    res.json({ success: true, data: subcategories });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/subcategories', (req, res) => {
  try {
    const { name } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, error: 'Nome da subcategoria é obrigatório' });
    }
    
    const subcategory = db.saveSubcategory(name.trim());
    res.json({ success: true, data: subcategory });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// APIs para Clientes
app.get('/api/clients', (req, res) => {
  try {
    const clients = db.getAllClients();
    res.json({ success: true, data: clients });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/clients', (req, res) => {
  try {
    const client = db.saveClient(req.body);
    res.json({ success: true, data: client });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.put('/api/clients/:id', (req, res) => {
  try {
    const { id } = req.params;
    const client = db.updateClient(id, req.body);
    res.json({ success: true, data: client });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.delete('/api/clients/:id', (req, res) => {
  try {
    const { id } = req.params;
    db.deleteClient(id);
    res.json({ success: true, message: 'Cliente deletado com sucesso' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.delete('/api/clients', (req, res) => {
  try {
    const { ids } = req.body;
    if (!Array.isArray(ids)) {
      return res.status(400).json({ success: false, error: 'IDs devem ser um array' });
    }
    db.deleteMultipleClients(ids);
    res.json({ success: true, message: `${ids.length} clientes deletados com sucesso` });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// APIs para Projetos
app.get('/api/projects', (req, res) => {
  try {
    const projects = db.getAllProjects();
    res.json({ success: true, data: projects });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/projects', (req, res) => {
  try {
    const project = db.saveProject(req.body);
    res.json({ success: true, data: project });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.put('/api/projects/:id', (req, res) => {
  try {
    const { id } = req.params;
    const updatedProject = db.updateProject(id, req.body);
    res.json({ success: true, data: updatedProject });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.delete('/api/projects/:id', (req, res) => {
  try {
    const { id } = req.params;
    db.deleteProject(id);
    res.json({ success: true, message: 'Projeto excluído com sucesso' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.delete('/api/projects', (req, res) => {
  try {
    const { ids } = req.body;
    if (!Array.isArray(ids)) {
      return res.status(400).json({ success: false, error: 'IDs devem ser um array' });
    }
    
    db.deleteMultipleProjects(ids);
    res.json({ success: true, message: `${ids.length} projetos deletados com sucesso` });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// APIs para Serviços
app.get('/api/services', (req, res) => {
  try {
    const services = db.getAllServices();
    res.json({ success: true, data: services });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/services', (req, res) => {
  try {
    const service = db.saveService(req.body);
    res.json({ success: true, data: service });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.put('/api/services/:id', (req, res) => {
  try {
    const { id } = req.params;
    const updatedService = db.updateService(id, req.body);
    res.json({ success: true, data: updatedService });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.delete('/api/services/:id', (req, res) => {
  try {
    const { id } = req.params;
    db.deleteService(id);
    res.json({ success: true, message: 'Serviço excluído com sucesso' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// APIs para Produtos
app.get('/api/products', (req, res) => {
  try {
    const products = db.getAllProducts();
    res.json({ success: true, data: products });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/products', (req, res) => {
  try {
    const product = db.saveProduct(req.body);
    res.json({ success: true, data: product });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.put('/api/products/:id', (req, res) => {
  try {
    const { id } = req.params;
    const product = db.updateProduct(id, req.body);
    res.json({ success: true, data: product });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.delete('/api/products/:id', (req, res) => {
  try {
    const { id } = req.params;
    db.deleteProduct(id);
    res.json({ success: true, message: 'Produto deletado com sucesso' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.delete('/api/products', (req, res) => {
  try {
    const { ids } = req.body;
    if (!Array.isArray(ids)) {
      return res.status(400).json({ success: false, error: 'IDs devem ser um array' });
    }
    db.deleteMultipleProducts(ids);
    res.json({ success: true, message: `${ids.length} produtos deletados com sucesso` });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Rota de teste
app.get('/api/test', (req, res) => {
  res.json({ 
    message: 'API funcionando!', 
    timestamp: new Date().toISOString(),
    endpoints: [
      'GET /api/transactions - Listar transações',
      'POST /api/transactions - Criar transação',
      'PUT /api/transactions/:id - Atualizar transação',
      'DELETE /api/transactions/:id - Deletar transação',
      'DELETE /api/transactions - Deletar múltiplas transações',
      'GET /api/products - Listar produtos',
      'POST /api/products - Criar produto',
      'PUT /api/products/:id - Atualizar produto',
      'DELETE /api/products/:id - Deletar produto',
      'DELETE /api/products - Deletar múltiplos produtos',
      'POST /api/import - Importar arquivos Excel',
      'POST /api/export - Exportar dados para Excel',
      'GET /api/test - Testar API'
    ]
  });
});

// Middleware de tratamento de erros
app.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: 'Arquivo muito grande! Máximo 5MB.' });
    }
  }
  
  res.status(400).json({ error: error.message });
});

// Iniciar servidor
app.listen(port, () => {
  console.log(`🚀 Servidor rodando na porta ${port}`);
  console.log(`📡 API disponível em http://localhost:${port}`);
  console.log(`🧪 Teste a API em http://localhost:${port}/api/test`);
});
