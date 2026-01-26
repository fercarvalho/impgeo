const express = require('express');
const multer = require('multer');
const XLSX = require('xlsx');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const Database = require('./database');

const app = express();
const port = 9001;
const db = new Database();
const JWT_SECRET = 'impgeo_secret_key_2024';

// Middleware
app.use(cors());
app.use(express.json());

// Middleware de autenticação
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Token de acesso requerido' });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ error: 'Token inválido' });
    }
    req.user = user;
    next();
  });
};

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
    fileSize: 10 * 1024 * 1024 // Limite de 10MB
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

// Função para processar dados de acompanhamentos
function processAcompanhamentos(worksheet) {
  const data = XLSX.utils.sheet_to_json(worksheet);
  const acompanhamentos = [];

  data.forEach((row, index) => {
    try {
      const acompanhamento = {
        id: Date.now() + index,
        codImovel: parseInt(row['COD. IMP'] || row['Cod. Imp'] || row['codImovel'] || row['COD IMP'] || 0),
        imovel: row['IMÓVEL'] || row['Imóvel'] || row['imovel'] || row['IMOVEL'] || '',
        municipio: row['MUNICÍPIO'] || row['Município'] || row['municipio'] || row['MUNICIPIO'] || '',
        mapaUrl: row['MAPA'] || row['Mapa'] || row['mapa'] || row['MAPA URL'] || row['Mapa URL'] || row['mapaUrl'] || '',
        matriculas: row['MATRÍCULAS'] || row['Matrículas'] || row['matriculas'] || row['MATRICULAS'] || '',
        nIncraCcir: row['N INCRA / CCIR'] || row['N Incra / CCIR'] || row['nIncraCcir'] || row['N INCRA CCIR'] || '',
        car: row['CAR'] || row['car'] || '',
        statusCar: row['STATUS CAR'] || row['Status CAR'] || row['statusCar'] || row['STATUS_CAR'] || 'ATIVO - AGUARDANDO ANÁLISE SC',
        itr: row['ITR'] || row['itr'] || '',
        geoCertificacao: (row['GEO CERTIFICAÇÃO'] || row['Geo Certificação'] || row['geoCertificacao'] || row['GEO_CERTIFICACAO'] || 'NÃO').toUpperCase() === 'SIM' ? 'SIM' : 'NÃO',
        geoRegistro: (row['GEO REGISTRO'] || row['Geo Registro'] || row['geoRegistro'] || row['GEO_REGISTRO'] || 'NÃO').toUpperCase() === 'SIM' ? 'SIM' : 'NÃO',
        areaTotal: parseFloat((row['ÁREA TOTAL (ha)'] || row['Área Total (ha)'] || row['areaTotal'] || row['AREA_TOTAL'] || 0).toString().replace(',', '.')) || 0,
        reservaLegal: parseFloat((row['20% RESERVA LEGAL (ha)'] || row['20% Reserva Legal (ha)'] || row['reservaLegal'] || row['RESERVA_LEGAL'] || 0).toString().replace(',', '.')) || 0,
        cultura1: row['CULTURAS'] || row['Culturas'] || row['cultura1'] || row['CULTURA1'] || '',
        areaCultura1: parseFloat((row['ÁREA (ha)'] || row['Área (ha)'] || row['areaCultura1'] || row['AREA_CULTURA1'] || 0).toString().replace(',', '.')) || 0,
        cultura2: row['CULTURAS.1'] || row['Culturas 2'] || row['cultura2'] || row['CULTURA2'] || '',
        areaCultura2: parseFloat((row['ÁREA (ha).1'] || row['Área (ha) 2'] || row['areaCultura2'] || row['AREA_CULTURA2'] || 0).toString().replace(',', '.')) || 0,
        outros: row['OUTROS'] || row['Outros'] || row['outros'] || '',
        areaOutros: parseFloat((row['ÁREA (ha).2'] || row['Área (ha) Outros'] || row['areaOutros'] || row['AREA_OUTROS'] || 0).toString().replace(',', '.')) || 0,
        appCodigoFlorestal: parseFloat((row['APP (CÓDIGO FLORESTAL)'] || row['APP (Código Florestal)'] || row['appCodigoFlorestal'] || row['APP_CODIGO_FLORESTAL'] || 0).toString().replace(',', '.')) || 0,
        appVegetada: parseFloat((row['APP (VEGETADA)'] || row['APP (Vegetada)'] || row['appVegetada'] || row['APP_VEGETADA'] || 0).toString().replace(',', '.')) || 0,
        appNaoVegetada: parseFloat((row['APP (NÃO VEGETADA)'] || row['APP (Não Vegetada)'] || row['appNaoVegetada'] || row['APP_NAO_VEGETADA'] || 0).toString().replace(',', '.')) || 0,
        remanescenteFlorestal: parseFloat((row['REMANESCENTE FLORESTAL (ha)'] || row['Remanescente Florestal (ha)'] || row['remanescenteFlorestal'] || row['REMANESCENTE_FLORESTAL'] || 0).toString().replace(',', '.')) || 0
      };

      // Validar se tem dados essenciais
      if (acompanhamento.codImovel > 0 && acompanhamento.imovel) {
        acompanhamentos.push(acompanhamento);
      }
    } catch (error) {
      console.log(`Erro ao processar linha ${index + 1}:`, error.message);
    }
  });

  return acompanhamentos;
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
    if (!['transactions', 'products', 'clients', 'projects', 'acompanhamentos'].includes(type)) {
      return res.status(400).json({ error: 'Tipo inválido! Use "transactions", "products", "clients", "projects" ou "acompanhamentos"' });
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
    } else if (type === 'acompanhamentos') {
      const sampleData = [
        {
          'COD. IMP': 1,
          'IMÓVEL': 'Fazenda Jacarezinho',
          'MUNICÍPIO': 'Joaquim Távora',
          'MAPA': 'https://www.google.com/maps/d/u/0/viewer?...',
          'MATRÍCULAS': '4031, 4183',
          'N INCRA / CCIR': '731.000.003.808-7',
          'CAR': 'PR-4112803-06020389GGA77AG9000237709GA760A2',
          'STATUS CAR': 'ATIVO - AGUARDANDO ANÁLISE SC',
          'ITR': '',
          'GEO CERTIFICAÇÃO': 'SIM',
          'GEO REGISTRO': 'SIM',
          'ÁREA TOTAL (ha)': 33.26,
          '20% RESERVA LEGAL (ha)': 2.35,
          'CULTURAS': 'Cultura Temporária',
          'ÁREA (ha)': 5.64,
          'CULTURAS.1': 'Pasto',
          'ÁREA (ha).1': 3.22,
          'OUTROS': 'Horta',
          'ÁREA (ha).2': 0.83,
          'APP (CÓDIGO FLORESTAL)': 2.38,
          'APP (VEGETADA)': 1.44,
          'APP (NÃO VEGETADA)': 0.62,
          'REMANESCENTE FLORESTAL (ha)': 0.68
        }
      ];
      worksheet = XLSX.utils.json_to_sheet(sampleData);
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Acompanhamentos');
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
                    type === 'projects' ? 'modelo-projetos.xlsx' :
                    type === 'acompanhamentos' ? 'modelo-acompanhamentos.xlsx' : 'modelo-produtos.xlsx';
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
      return res.status(400).json({ success: false, error: 'Nenhum arquivo foi enviado!' });
    }

    const { type } = req.body; // 'transactions', 'products', 'clients', 'projects' ou 'acompanhamentos'
    
    if (!type || !['transactions', 'products', 'clients', 'projects', 'acompanhamentos'].includes(type)) {
      return res.status(400).json({ success: false, error: 'Tipo inválido! Use "transactions", "products", "clients", "projects" ou "acompanhamentos"' });
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
      
      // Salvar projetos processados no banco de dados
      processedData.forEach(project => {
        try {
          db.saveProject(project);
        } catch (error) {
          console.error('Erro ao salvar projeto:', error);
        }
      });
    } else if (type === 'acompanhamentos') {
      processedData = processAcompanhamentos(worksheet);
      console.log(`Processados ${processedData.length} acompanhamentos do arquivo`);
      message = `${processedData.length} acompanhamentos importados com sucesso!`;
      
      // Salvar acompanhamentos processados no banco de dados
      let savedCount = 0;
      processedData.forEach(acompanhamento => {
        try {
          db.saveAcompanhamento(acompanhamento);
          savedCount++;
        } catch (error) {
          console.error('Erro ao salvar acompanhamento:', error);
        }
      });
      console.log(`${savedCount} acompanhamentos salvos no banco de dados`);
    }

    // Limpar o arquivo temporário
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }

    res.json({
      success: true,
      message: message,
      data: processedData,
      count: processedData.length,
      type: type
    });

  } catch (error) {
    console.error('Erro ao processar arquivo:', error);
    console.error('Stack trace:', error.stack);
    
    // Limpar arquivo em caso de erro
    if (req.file && fs.existsSync(req.file.path)) {
      try {
        fs.unlinkSync(req.file.path);
      } catch (unlinkError) {
        console.error('Erro ao limpar arquivo temporário:', unlinkError);
      }
    }
    
    res.status(500).json({ 
      success: false,
      error: 'Erro interno do servidor',
      message: error.message || 'Erro desconhecido ao processar arquivo'
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

// APIs para Acompanhamentos
app.get('/api/acompanhamentos', (req, res) => {
  try {
    const acompanhamentos = db.getAllAcompanhamentos();
    res.json({ success: true, data: acompanhamentos });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/acompanhamentos', (req, res) => {
  try {
    const acompanhamento = db.saveAcompanhamento(req.body);
    res.json({ success: true, data: acompanhamento });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.put('/api/acompanhamentos/:id', (req, res) => {
  try {
    const { id } = req.params;
    const acompanhamento = db.updateAcompanhamento(id, req.body);
    res.json({ success: true, data: acompanhamento });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.delete('/api/acompanhamentos/:id', (req, res) => {
  try {
    const { id } = req.params;
    db.deleteAcompanhamento(id);
    res.json({ success: true, message: 'Acompanhamento deletado com sucesso' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.delete('/api/acompanhamentos', (req, res) => {
  try {
    const { ids } = req.body;
    if (!Array.isArray(ids)) {
      return res.status(400).json({ success: false, error: 'IDs devem ser um array' });
    }
    db.deleteMultipleAcompanhamentos(ids);
    res.json({ success: true, message: `${ids.length} acompanhamentos deletados com sucesso` });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Rota para listar todos os links compartilháveis
app.get('/api/acompanhamentos/share-links', authenticateToken, (req, res) => {
  try {
    const shareLinks = db.getAllShareLinks();
    res.json({ 
      success: true, 
      data: shareLinks 
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Rota para gerar link compartilhável de acompanhamentos
app.post('/api/acompanhamentos/generate-share-link', authenticateToken, (req, res) => {
  try {
    const { name } = req.body;
    
    // Gerar token único para compartilhamento
    const token = 'view_' + require('crypto').randomBytes(32).toString('hex');
    
    // Salvar token com nome no banco
    db.saveShareLink(token, name);
    
    res.json({ 
      success: true, 
      token: token,
      message: 'Link compartilhável gerado com sucesso'
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Rota para atualizar um link compartilhável
app.put('/api/acompanhamentos/share-links/:token', authenticateToken, (req, res) => {
  try {
    const { token } = req.params;
    const { name, regenerateToken } = req.body;
    
    if (regenerateToken) {
      // Gerar novo token
      const newToken = 'view_' + require('crypto').randomBytes(32).toString('hex');
      const linkData = db.getShareLink(token);
      if (!linkData) {
        return res.status(404).json({ success: false, error: 'Link não encontrado' });
      }
      
      // Criar novo link com o novo token
      db.saveShareLink(newToken, name !== undefined ? name : linkData.name);
      // Excluir o link antigo
      db.deleteShareLink(token);
      
      res.json({ 
        success: true, 
        token: newToken,
        message: 'Token regenerado com sucesso'
      });
    } else {
      // Apenas atualizar o nome
      const updated = db.updateShareLink(token, { name: name || null });
      res.json({ 
        success: true, 
        data: updated,
        message: 'Link atualizado com sucesso'
      });
    }
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Rota para excluir um link compartilhável
app.delete('/api/acompanhamentos/share-links/:token', authenticateToken, (req, res) => {
  try {
    const { token } = req.params;
    db.deleteShareLink(token);
    res.json({ 
      success: true, 
      message: 'Link excluído com sucesso' 
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Rota pública para visualizar acompanhamentos (sem autenticação)
app.get('/api/acompanhamentos/public/:token', (req, res) => {
  try {
    const { token } = req.params;
    
    // Validar formato do token
    if (!token || !token.startsWith('view_')) {
      return res.status(400).json({ 
        success: false, 
        error: 'Token inválido' 
      });
    }
    
    // Buscar informações do link compartilhável
    const shareLink = db.getShareLink(token);
    
    // Buscar todos os acompanhamentos (público)
    const acompanhamentos = db.getAllAcompanhamentos();
    
    res.json({ 
      success: true, 
      data: acompanhamentos,
      shareLinkName: shareLink ? shareLink.name : null
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      error: error.message || 'Erro ao carregar dados' 
    });
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

// APIs de Projeção
app.get('/api/projection', (req, res) => {
  try {
    const projectionData = db.getProjectionData();
    if (!projectionData) {
      return res.status(404).json({ error: 'Dados de projeção não encontrados' });
    }
    res.json(projectionData);
  } catch (error) {
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// Rota para sincronizar dados de projeção
app.post('/api/projection/sync', authenticateToken, (req, res) => {
  try {
    const syncedData = db.syncProjectionData();
    res.json({ success: true, data: syncedData });
  } catch (error) {
    res.status(500).json({ error: 'Erro ao sincronizar dados de projeção' });
  }
});

// Rota para atualizar dados de projeção
app.put('/api/projection', authenticateToken, (req, res) => {
  try {
    const projectionData = req.body;
    const updatedData = db.updateProjectionData(projectionData);
    res.json({ success: true, data: updatedData });
  } catch (error) {
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// APIs de Backup Automático
app.post('/api/backup/create/:tableName', authenticateToken, (req, res) => {
  try {
    const { tableName } = req.params;
    const result = db.createAutoBackup(tableName);
    
    if (result.success) {
      res.json({ success: true, message: result.message, timestamp: result.timestamp });
    } else {
      res.status(400).json({ success: false, message: result.message });
    }
  } catch (error) {
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

app.post('/api/backup/restore/:tableName', authenticateToken, (req, res) => {
  try {
    const { tableName } = req.params;
    const result = db.restoreFromBackup(tableName);
    
    if (result.success) {
      res.json({ success: true, message: result.message, timestamp: result.timestamp });
    } else {
      res.status(400).json({ success: false, message: result.message });
    }
  } catch (error) {
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// APIs de Despesas Fixas
app.get('/api/fixed-expenses', (req, res) => {
  try {
    const fixedExpensesData = db.getFixedExpensesData();
    if (!fixedExpensesData) {
      return res.status(404).json({ error: 'Dados de despesas fixas não encontrados' });
    }
    res.json(fixedExpensesData);
  } catch (error) {
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

app.put('/api/fixed-expenses', authenticateToken, (req, res) => {
  try {
    const fixedExpensesData = req.body;
    const updatedData = db.updateFixedExpensesData(fixedExpensesData);
    res.json({ success: true, data: updatedData });
  } catch (error) {
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// Limpeza seletiva: Despesas Fixas
app.delete('/api/fixed-expenses', (req, res) => {
  try {
    db.createAutoBackup('fixedExpenses');
    const cleared = db.updateFixedExpensesData({
      previsto: new Array(12).fill(0),
      media: new Array(12).fill(0),
      maximo: new Array(12).fill(0)
    });
    
    // Sincronizar dados de projeção após limpeza
    db.syncProjectionData();
    
    res.json({ success: true, data: cleared });
  } catch (error) {
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// APIs de Despesas Variáveis
app.get('/api/variable-expenses', (req, res) => {
  try {
    const variableExpensesData = db.getVariableExpensesData();
    if (!variableExpensesData) {
      return res.status(404).json({ error: 'Dados de despesas variáveis não encontrados' });
    }
    res.json(variableExpensesData);
  } catch (error) {
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

app.put('/api/variable-expenses', authenticateToken, (req, res) => {
  try {
    const variableExpensesData = req.body;
    const updatedData = db.updateVariableExpensesData(variableExpensesData);
    res.json({ success: true, data: updatedData });
  } catch (error) {
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// Limpeza seletiva: Despesas Variáveis
app.delete('/api/variable-expenses', (req, res) => {
  try {
    db.createAutoBackup('variableExpenses');
    const cleared = db.updateVariableExpensesData({
      previsto: new Array(12).fill(0),
      medio: new Array(12).fill(0),
      maximo: new Array(12).fill(0)
    });
    db.syncProjectionData();
    res.json({ success: true, data: cleared });
  } catch (error) {
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// APIs de MKT
app.get('/api/mkt', (req, res) => {
  try {
    const mktData = db.getMktData();
    if (!mktData) {
      return res.status(404).json({ error: 'Dados de MKT não encontrados' });
    }
    res.json(mktData);
  } catch (error) {
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

app.put('/api/mkt', authenticateToken, (req, res) => {
  try {
    const mktData = req.body;
    const updatedData = db.updateMktData(mktData);
    res.json({ success: true, data: updatedData });
  } catch (error) {
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// Limpeza seletiva: MKT
app.delete('/api/mkt', (req, res) => {
  try {
    db.createAutoBackup('mkt');
    const cleared = db.updateMktData({
      previsto: new Array(12).fill(0),
      medio: new Array(12).fill(0),
      maximo: new Array(12).fill(0)
    });
    db.syncProjectionData();
    res.json({ success: true, data: cleared });
  } catch (error) {
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// APIs de Orçamento
app.get('/api/budget', (req, res) => {
  try {
    const budgetData = db.getBudgetData();
    if (!budgetData) {
      return res.status(404).json({ error: 'Dados de orçamento não encontrados' });
    }
    res.json(budgetData);
  } catch (error) {
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

app.put('/api/budget', authenticateToken, (req, res) => {
  try {
    const budgetData = req.body;
    const updatedData = db.updateBudgetData(budgetData);
    res.json({ success: true, data: updatedData });
  } catch (error) {
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// APIs de Investimentos
app.get('/api/investments', (req, res) => {
  try {
    const investmentsData = db.getInvestmentsData();
    if (!investmentsData) {
      return res.status(404).json({ error: 'Dados de investimentos não encontrados' });
    }
    res.json(investmentsData);
  } catch (error) {
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

app.put('/api/investments', authenticateToken, (req, res) => {
  try {
    const investmentsData = req.body;
    const updatedData = db.updateInvestmentsData(investmentsData);
    res.json({ success: true, data: updatedData });
  } catch (error) {
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// Limpeza seletiva: Investimentos
app.delete('/api/investments', (req, res) => {
  try {
    db.createAutoBackup('investments');
    const cleared = db.updateInvestmentsData({
      previsto: new Array(12).fill(0),
      medio: new Array(12).fill(0),
      maximo: new Array(12).fill(0)
    });
    db.syncProjectionData();
    res.json({ success: true, data: cleared });
  } catch (error) {
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// APIs de Faturamento REURB
app.get('/api/faturamento-reurb', (req, res) => {
  try {
    const faturamentoReurbData = db.getFaturamentoReurbData();
    if (!faturamentoReurbData) {
      return res.status(404).json({ error: 'Dados de faturamento REURB não encontrados' });
    }
    res.json(faturamentoReurbData);
  } catch (error) {
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

app.put('/api/faturamento-reurb', authenticateToken, (req, res) => {
  try {
    const faturamentoReurbData = req.body;
    const updatedData = db.updateFaturamentoReurbData(faturamentoReurbData);
    res.json({ success: true, data: updatedData });
  } catch (error) {
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// Limpeza seletiva: Faturamento REURB
app.delete('/api/faturamento-reurb', (req, res) => {
  try {
    db.createAutoBackup('faturamentoReurb');
    const cleared = db.updateFaturamentoReurbData({
      previsto: new Array(12).fill(0),
      medio: new Array(12).fill(0),
      maximo: new Array(12).fill(0)
    });
    db.syncProjectionData();
    res.json({ success: true, data: cleared });
  } catch (error) {
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// APIs de Faturamento GEO
app.get('/api/faturamento-geo', (req, res) => {
  try {
    const faturamentoGeoData = db.getFaturamentoGeoData();
    if (!faturamentoGeoData) {
      return res.status(404).json({ error: 'Dados de faturamento GEO não encontrados' });
    }
    res.json(faturamentoGeoData);
  } catch (error) {
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

app.put('/api/faturamento-geo', authenticateToken, (req, res) => {
  try {
    const faturamentoGeoData = req.body;
    const updatedData = db.updateFaturamentoGeoData(faturamentoGeoData);
    res.json({ success: true, data: updatedData });
  } catch (error) {
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// Limpeza seletiva: Faturamento GEO
app.delete('/api/faturamento-geo', (req, res) => {
  try {
    db.createAutoBackup('faturamentoGeo');
    const cleared = db.updateFaturamentoGeoData({
      previsto: new Array(12).fill(0),
      medio: new Array(12).fill(0),
      maximo: new Array(12).fill(0)
    });
    db.syncProjectionData();
    res.json({ success: true, data: cleared });
  } catch (error) {
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// APIs de Faturamento PLAN
app.get('/api/faturamento-plan', (req, res) => {
  try {
    const faturamentoPlanData = db.getFaturamentoPlanData();
    if (!faturamentoPlanData) {
      return res.status(404).json({ error: 'Dados de faturamento PLAN não encontrados' });
    }
    res.json(faturamentoPlanData);
  } catch (error) {
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

app.put('/api/faturamento-plan', authenticateToken, (req, res) => {
  try {
    const faturamentoPlanData = req.body;
    const updatedData = db.updateFaturamentoPlanData(faturamentoPlanData);
    res.json({ success: true, data: updatedData });
  } catch (error) {
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// Limpeza seletiva: Faturamento PLAN
app.delete('/api/faturamento-plan', (req, res) => {
  try {
    db.createAutoBackup('faturamentoPlan');
    const cleared = db.updateFaturamentoPlanData({
      previsto: new Array(12).fill(0),
      medio: new Array(12).fill(0),
      maximo: new Array(12).fill(0)
    });
    db.syncProjectionData();
    res.json({ success: true, data: cleared });
  } catch (error) {
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// APIs de Faturamento REG
app.get('/api/faturamento-reg', (req, res) => {
  try {
    const faturamentoRegData = db.getFaturamentoRegData();
    if (!faturamentoRegData) {
      return res.status(404).json({ error: 'Dados de faturamento REG não encontrados' });
    }
    res.json(faturamentoRegData);
  } catch (error) {
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

app.put('/api/faturamento-reg', authenticateToken, (req, res) => {
  try {
    const faturamentoRegData = req.body;
    const updatedData = db.updateFaturamentoRegData(faturamentoRegData);
    res.json({ success: true, data: updatedData });
  } catch (error) {
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// Limpeza seletiva: Faturamento REG
app.delete('/api/faturamento-reg', (req, res) => {
  try {
    db.createAutoBackup('faturamentoReg');
    const cleared = db.updateFaturamentoRegData({
      previsto: new Array(12).fill(0),
      medio: new Array(12).fill(0),
      maximo: new Array(12).fill(0)
    });
    db.syncProjectionData();
    res.json({ success: true, data: cleared });
  } catch (error) {
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// APIs de Faturamento NN
app.get('/api/faturamento-nn', (req, res) => {
  try {
    const faturamentoNnData = db.getFaturamentoNnData();
    if (!faturamentoNnData) {
      return res.status(404).json({ error: 'Dados de faturamento NN não encontrados' });
    }
    res.json(faturamentoNnData);
  } catch (error) {
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

app.put('/api/faturamento-nn', authenticateToken, (req, res) => {
  try {
    const faturamentoNnData = req.body;
    const updatedData = db.updateFaturamentoNnData(faturamentoNnData);
    res.json({ success: true, data: updatedData });
  } catch (error) {
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// Limpeza seletiva: Faturamento NN
app.delete('/api/faturamento-nn', (req, res) => {
  try {
    db.createAutoBackup('faturamentoNn');
    const cleared = db.updateFaturamentoNnData({
      previsto: new Array(12).fill(0),
      medio: new Array(12).fill(0),
      maximo: new Array(12).fill(0)
    });
    db.syncProjectionData();
    res.json({ success: true, data: cleared });
  } catch (error) {
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// APIs para Faturamento Total
app.get('/api/faturamento-total', (req, res) => {
  try {
    const faturamentoTotalData = db.getFaturamentoTotalData();
    if (!faturamentoTotalData) {
      return res.status(404).json({ error: 'Dados de faturamento total não encontrados' });
    }
    res.json(faturamentoTotalData);
  } catch (error) {
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

app.put('/api/faturamento-total', authenticateToken, (req, res) => {
  try {
    const faturamentoTotalData = req.body;
    const updatedData = db.updateFaturamentoTotalData(faturamentoTotalData);
    res.json({ success: true, data: updatedData });
  } catch (error) {
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// APIs para Resultado
app.get('/api/resultado', (req, res) => {
  try {
    const resultadoData = db.getResultadoData();
    if (!resultadoData) {
      return res.status(404).json({ error: 'Dados de resultado não encontrados' });
    }
    res.json(resultadoData);
  } catch (error) {
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

app.put('/api/resultado', authenticateToken, (req, res) => {
  try {
    const resultadoData = req.body;
    const updatedData = db.updateResultadoData(resultadoData);
    res.json({ success: true, data: updatedData });
  } catch (error) {
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// Limpeza seletiva: Resultado do ano anterior
app.delete('/api/resultado', (req, res) => {
  try {
    db.createAutoBackup('resultado');
    const cleared = db.updateResultadoData({
      previsto: new Array(12).fill(0),
      medio: new Array(12).fill(0),
      maximo: new Array(12).fill(0)
    });
    db.syncProjectionData();
    res.json({ success: true, data: cleared });
  } catch (error) {
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// APIs de Autenticação
app.post('/api/auth/login', (req, res) => {
  try {
    const { username, password } = req.body;
    
    if (!username || !password) {
      return res.status(400).json({ error: 'Usuário e senha são obrigatórios' });
    }

    const user = db.getUserByUsername(username);
    if (!user) {
      return res.status(401).json({ error: 'Credenciais inválidas' });
    }

    const isValidPassword = bcrypt.compareSync(password, user.password);
    if (!isValidPassword) {
      return res.status(401).json({ error: 'Credenciais inválidas' });
    }

    const token = jwt.sign(
      { id: user.id, username: user.username, role: user.role },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.json({
      success: true,
      token,
      user: {
        id: user.id,
        username: user.username,
        role: user.role
      }
    });
  } catch (error) {
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

app.post('/api/auth/verify', authenticateToken, (req, res) => {
  res.json({
    success: true,
    user: req.user
  });
});

// Middleware para verificar se o usuário é admin
const requireAdmin = (req, res, next) => {
  if (req.user && req.user.role === 'admin') {
    next();
  } else {
    res.status(403).json({ error: 'Acesso negado. Apenas administradores podem realizar esta ação.' });
  }
};

// APIs de Gerenciamento de Usuários (apenas para admins)
// GET /api/users - Listar todos os usuários
app.get('/api/users', authenticateToken, requireAdmin, (req, res) => {
  try {
    const users = db.getAllUsers();
    // Remover senhas dos usuários antes de enviar
    const usersWithoutPasswords = users.map(user => ({
      id: user.id,
      username: user.username,
      role: user.role,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt
    }));
    res.json({ success: true, data: usersWithoutPasswords });
  } catch (error) {
    res.status(500).json({ error: 'Erro ao buscar usuários' });
  }
});

// POST /api/users - Criar novo usuário
app.post('/api/users', authenticateToken, requireAdmin, (req, res) => {
  try {
    const { username, password, role } = req.body;
    
    if (!username || !password || !role) {
      return res.status(400).json({ error: 'Username, password e role são obrigatórios' });
    }

    // Validar role
    const validRoles = ['admin', 'user', 'guest'];
    if (!validRoles.includes(role)) {
      return res.status(400).json({ error: 'Role inválido. Use: admin, user ou guest' });
    }

    // Verificar se o usuário já existe
    const existingUser = db.getUserByUsername(username);
    if (existingUser) {
      return res.status(400).json({ error: 'Usuário já existe' });
    }

    // Hash da senha
    const hashedPassword = bcrypt.hashSync(password, 10);

    // Criar usuário
    const newUser = db.saveUser({
      username,
      password: hashedPassword,
      role
    });

    // Remover senha antes de enviar
    const { password: _, ...userWithoutPassword } = newUser;
    res.status(201).json({ success: true, data: userWithoutPassword });
  } catch (error) {
    res.status(500).json({ error: 'Erro ao criar usuário: ' + error.message });
  }
});

// PUT /api/users/:id - Atualizar usuário
app.put('/api/users/:id', authenticateToken, requireAdmin, (req, res) => {
  try {
    const { id } = req.params;
    const { username, password, role } = req.body;

    // Validar role se fornecido
    if (role) {
      const validRoles = ['admin', 'user', 'guest'];
      if (!validRoles.includes(role)) {
        return res.status(400).json({ error: 'Role inválido. Use: admin, user ou guest' });
      }
    }

    // Preparar dados para atualização
    const updateData = {};
    if (username) updateData.username = username;
    if (role) updateData.role = role;
    if (password) {
      updateData.password = bcrypt.hashSync(password, 10);
    }

    // Verificar se está tentando mudar o username para um que já existe
    if (username) {
      const existingUser = db.getUserByUsername(username);
      if (existingUser && existingUser.id !== id) {
        return res.status(400).json({ error: 'Username já está em uso' });
      }
    }

    // Atualizar usuário
    const updatedUser = db.updateUser(id, updateData);

    // Remover senha antes de enviar
    const { password: _, ...userWithoutPassword } = updatedUser;
    res.json({ success: true, data: userWithoutPassword });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// DELETE /api/users/:id - Excluir usuário
app.delete('/api/users/:id', authenticateToken, requireAdmin, (req, res) => {
  try {
    const { id } = req.params;

    // Não permitir que o admin exclua a si mesmo
    if (req.user.id === id) {
      return res.status(400).json({ error: 'Você não pode excluir seu próprio usuário' });
    }

    db.deleteUser(id);
    res.json({ success: true, message: 'Usuário excluído com sucesso' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Rota de teste
app.get('/api/test', (req, res) => {
  res.json({ 
    message: 'API funcionando!',
    timestamp: new Date().toISOString(),
    endpoints: [
      'POST /api/auth/login - Fazer login',
      'POST /api/auth/verify - Verificar token',
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
      'GET /api/projection - Obter dados de projeção',
      'PUT /api/projection - Atualizar dados de projeção',
      'GET /api/fixed-expenses - Obter dados de despesas fixas',
      'PUT /api/fixed-expenses - Atualizar dados de despesas fixas',
      'GET /api/variable-expenses - Obter dados de despesas variáveis',
      'PUT /api/variable-expenses - Atualizar dados de despesas variáveis',
      'GET /api/mkt - Obter dados de MKT',
      'PUT /api/mkt - Atualizar dados de MKT',
      'GET /api/budget - Obter dados de orçamento',
      'PUT /api/budget - Atualizar dados de orçamento',
      'GET /api/investments - Obter dados de investimentos',
      'PUT /api/investments - Atualizar dados de investimentos',
      'GET /api/faturamento-reurb - Obter dados de faturamento REURB',
      'PUT /api/faturamento-reurb - Atualizar dados de faturamento REURB',
      'GET /api/faturamento-geo - Obter dados de faturamento GEO',
      'PUT /api/faturamento-geo - Atualizar dados de faturamento GEO',
      'GET /api/faturamento-plan - Obter dados de faturamento PLAN',
      'PUT /api/faturamento-plan - Atualizar dados de faturamento PLAN',
      'GET /api/faturamento-reg - Obter dados de faturamento REG',
      'PUT /api/faturamento-reg - Atualizar dados de faturamento REG',
      'GET /api/faturamento-nn - Obter dados de faturamento NN',
      'PUT /api/faturamento-nn - Atualizar dados de faturamento NN',
      'GET /api/faturamento-total - Obter dados de faturamento total',
      'PUT /api/faturamento-total - Atualizar dados de faturamento total',
      'GET /api/resultado - Obter dados de resultado',
      'PUT /api/resultado - Atualizar dados de resultado',
      'GET /api/test - Testar API'
    ]
  });
});

// Middleware de tratamento de erros
app.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ success: false, error: 'Arquivo muito grande! Tamanho máximo permitido: 10MB.' });
    }
    return res.status(400).json({ success: false, error: 'Erro no upload: ' + error.message });
  }
  
  if (error.message) {
    return res.status(400).json({ success: false, error: error.message });
  }
  
  res.status(500).json({ success: false, error: 'Erro interno do servidor' });
});

// Limpar todos os dados de projeção
app.delete('/api/clear-all-projection-data', authenticateToken, (req, res) => {
  try {
    console.log('Endpoint de limpeza de dados chamado')
    const result = db.clearAllProjectionData()
    
    if (result.success) {
      res.json({ 
        success: true, 
        message: 'Todos os dados de projeção foram limpos com sucesso!' 
      })
    } else {
      res.status(500).json({ 
        success: false, 
        message: result.message 
      })
    }
  } catch (error) {
    console.error('Erro no endpoint de limpeza:', error)
    res.status(500).json({ 
      success: false, 
      message: 'Erro interno do servidor ao limpar dados' 
    })
  }
})

// Iniciar servidor
app.listen(port, () => {
  console.log(`🚀 Servidor rodando na porta ${port}`);
  console.log(`📡 API disponível em http://localhost:${port}`);
  console.log(`🧪 Teste a API em http://localhost:${port}/api/test`);
});
