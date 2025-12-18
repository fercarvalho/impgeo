const fs = require('fs');
const path = require('path');

class Database {
  constructor() {
    this.dbPath = path.join(__dirname, 'database');
    this.transactionsFile = path.join(this.dbPath, 'transactions.json');
    this.productsFile = path.join(this.dbPath, 'products.json');
    this.subcategoriesFile = path.join(this.dbPath, 'subcategories.json');
    this.clientsFile = path.join(this.dbPath, 'clients.json');
    this.projectsFile = path.join(this.dbPath, 'projects.json');
    this.servicesFile = path.join(this.dbPath, 'services.json');
    this.usersFile = path.join(this.dbPath, 'users.json');
    this.projectionFile = path.join(this.dbPath, 'projection.json');
    this.fixedExpensesFile = path.join(this.dbPath, 'fixedExpenses.json');
    this.variableExpensesFile = path.join(this.dbPath, 'variableExpenses.json');
    this.mktFile = path.join(this.dbPath, 'mkt.json');
    this.budgetFile = path.join(this.dbPath, 'budget.json');
    this.investmentsFile = path.join(this.dbPath, 'investments.json');
    this.faturamentoReurbFile = path.join(this.dbPath, 'faturamentoReurb.json');
    this.faturamentoGeoFile = path.join(this.dbPath, 'faturamentoGeo.json');
    this.faturamentoPlanFile = path.join(this.dbPath, 'faturamentoPlan.json');
    this.faturamentoRegFile = path.join(this.dbPath, 'faturamentoReg.json');
    this.faturamentoNnFile = path.join(this.dbPath, 'faturamentoNn.json');
    this.faturamentoTotalFile = path.join(this.dbPath, 'faturamentoTotal.json');
    this.resultadoFile = path.join(this.dbPath, 'resultado.json');
    this.acompanhamentosFile = path.join(this.dbPath, 'acompanhamentos.json');
    
    // Mapeamento de arquivos de projeção para seus backups
    this.projectionFiles = {
      'projection': this.projectionFile,
      'fixedExpenses': this.fixedExpensesFile,
      'variableExpenses': this.variableExpensesFile,
      'investments': this.investmentsFile,
      'mkt': this.mktFile,
      'budget': this.budgetFile,
      'faturamentoReurb': this.faturamentoReurbFile,
      'faturamentoGeo': this.faturamentoGeoFile,
      'faturamentoPlan': this.faturamentoPlanFile,
      'faturamentoReg': this.faturamentoRegFile,
      'faturamentoNn': this.faturamentoNnFile,
      'faturamentoTotal': this.faturamentoTotalFile,
      'resultado': this.resultadoFile
    };
    
    // Garantir que os arquivos existam
    this.ensureFilesExist();
  }

  ensureFilesExist() {
    if (!fs.existsSync(this.dbPath)) {
      fs.mkdirSync(this.dbPath, { recursive: true });
    }
    
    if (!fs.existsSync(this.transactionsFile)) {
      fs.writeFileSync(this.transactionsFile, '[]');
    }
    
    if (!fs.existsSync(this.productsFile)) {
      fs.writeFileSync(this.productsFile, '[]');
    }
    
    if (!fs.existsSync(this.subcategoriesFile)) {
      // Inicializar com as subcategorias padrão
      const defaultSubcategories = [
        'ALUGUEL + INTERNET',
        'ANUIDADE CREA IMP',
        'ANUIDADE CREA SÓCIOS',
        'ART',
        'Auxiliar de Campo',
        'CARTÃO BB (PROJETOS)',
        'CARTÃO C6',
        'CDB',
        'CELULAR',
        'CONFRAS E REFEIÇÕES',
        'CONSELHO REG ENG',
        'CONSULTOR',
        'CONTADOR',
        'DARF',
        'Despesa variável de projetos',
        'FEZINHA',
        'FGTS',
        'GUIA DAS',
        'ISS',
        'Locomoção',
        'Manutenções',
        'Materiais Extras',
        'MATERIAL ESCRITÓRIO',
        'MICROSOFT 365',
        'MÉTRICA TOPO',
        'ONR',
        'OUTROS GASTOS DU/VINI',
        'PLUXEE BENEFICIOS',
        'Produção Conteúdo',
        'Reembolso projetos',
        'RTK',
        'RTK (TOPOMIG)',
        'SALARIO DU - PRO LABORE',
        'SALARIO RAFAELA APARECIDA',
        'SALARIO VINI - PRO LABORE',
        'SALÁRIO THAISA TEIXEIRA BAHIA',
        'SEGURO DRONE',
        'SEGURO RTK',
        'Sindicato',
        'SITE',
        'Social Media',
        'Tráfego/SEO'
      ];
      fs.writeFileSync(this.subcategoriesFile, JSON.stringify(defaultSubcategories, null, 2));
    }
    
    if (!fs.existsSync(this.clientsFile)) {
      fs.writeFileSync(this.clientsFile, '[]');
    }
    
    if (!fs.existsSync(this.projectsFile)) {
      fs.writeFileSync(this.projectsFile, '[]');
    }
    
    if (!fs.existsSync(this.servicesFile)) {
      fs.writeFileSync(this.servicesFile, '[]');
    }
    
    if (!fs.existsSync(this.acompanhamentosFile)) {
      fs.writeFileSync(this.acompanhamentosFile, '[]');
    }
    
    if (!fs.existsSync(this.usersFile)) {
      // Criar usuários padrão
      const bcrypt = require('bcryptjs');
      const defaultUsers = [
        {
          id: this.generateId(),
          username: 'admin',
          password: bcrypt.hashSync('123456', 10),
          role: 'admin',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        },
        {
          id: this.generateId(),
          username: 'user',
          password: bcrypt.hashSync('135246', 10),
          role: 'user',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        },
        {
          id: this.generateId(),
          username: 'guest',
          password: bcrypt.hashSync('654321', 10),
          role: 'guest',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        }
      ];
      fs.writeFileSync(this.usersFile, JSON.stringify(defaultUsers, null, 2));
    }
    
    if (!fs.existsSync(this.projectionFile)) {
      // Criar dados de projeção padrão
      const defaultProjection = {
        despesasVariaveis: new Array(12).fill(0),
        despesasFixas: new Array(12).fill(0),
        investimentos: new Array(12).fill(0),
        mkt: new Array(12).fill(0),
        faturamentoReurb: new Array(12).fill(0),
        faturamentoGeo: new Array(12).fill(0),
        faturamentoPlan: new Array(12).fill(0),
        faturamentoReg: new Array(12).fill(0),
        faturamentoNn: new Array(12).fill(0),
        // Composição de MKT
        mktComponents: {
          trafego: new Array(12).fill(0),
          socialMedia: new Array(12).fill(0),
          producaoConteudo: new Array(12).fill(0)
        },
        // Tabela adicional: Percentual de Crescimento Anual
        growth: {
          minimo: 0,
          medio: 0,
          maximo: 0
        },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      fs.writeFileSync(this.projectionFile, JSON.stringify(defaultProjection, null, 2));
    }
    
    if (!fs.existsSync(this.fixedExpensesFile)) {
      // Criar dados de despesas fixas padrão
      const defaultFixedExpenses = {
        previsto: new Array(12).fill(0),
        media: new Array(12).fill(0),
        maximo: new Array(12).fill(0),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      fs.writeFileSync(this.fixedExpensesFile, JSON.stringify(defaultFixedExpenses, null, 2));
    }
    
    if (!fs.existsSync(this.variableExpensesFile)) {
      // Criar dados de despesas variáveis padrão
      const defaultVariableExpenses = {
        previsto: new Array(12).fill(0),
        medio: new Array(12).fill(0),
        maximo: new Array(12).fill(0),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      fs.writeFileSync(this.variableExpensesFile, JSON.stringify(defaultVariableExpenses, null, 2));
    }
    
    if (!fs.existsSync(this.mktFile)) {
      // Criar dados de MKT padrão
      const defaultMkt = {
        previsto: new Array(12).fill(0),
        medio: new Array(12).fill(0),
        maximo: new Array(12).fill(0),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      fs.writeFileSync(this.mktFile, JSON.stringify(defaultMkt, null, 2));
    }
    
    if (!fs.existsSync(this.budgetFile)) {
      // Criar dados de orçamento padrão
      const defaultBudget = {
        previsto: new Array(12).fill(0),
        medio: new Array(12).fill(0),
        maximo: new Array(12).fill(0),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      fs.writeFileSync(this.budgetFile, JSON.stringify(defaultBudget, null, 2));
    }
    
    if (!fs.existsSync(this.investmentsFile)) {
      // Criar dados de investimentos padrão
      const defaultInvestments = {
        previsto: new Array(12).fill(0),
        medio: new Array(12).fill(0),
        maximo: new Array(12).fill(0),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      fs.writeFileSync(this.investmentsFile, JSON.stringify(defaultInvestments, null, 2));
    }
    
    if (!fs.existsSync(this.faturamentoReurbFile)) {
      // Criar dados de faturamento REURB padrão
      const defaultFaturamentoReurb = {
        previsto: new Array(12).fill(0),
        medio: new Array(12).fill(0),
        maximo: new Array(12).fill(0),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      fs.writeFileSync(this.faturamentoReurbFile, JSON.stringify(defaultFaturamentoReurb, null, 2));
    }
    
    if (!fs.existsSync(this.faturamentoGeoFile)) {
      // Criar dados de faturamento GEO padrão
      const defaultFaturamentoGeo = {
        previsto: new Array(12).fill(0),
        medio: new Array(12).fill(0),
        maximo: new Array(12).fill(0),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      fs.writeFileSync(this.faturamentoGeoFile, JSON.stringify(defaultFaturamentoGeo, null, 2));
    }
    
    if (!fs.existsSync(this.faturamentoPlanFile)) {
      // Criar dados de faturamento PLAN padrão
      const defaultFaturamentoPlan = {
        previsto: new Array(12).fill(0),
        medio: new Array(12).fill(0),
        maximo: new Array(12).fill(0),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      fs.writeFileSync(this.faturamentoPlanFile, JSON.stringify(defaultFaturamentoPlan, null, 2));
    }
    
    if (!fs.existsSync(this.faturamentoRegFile)) {
      // Criar dados de faturamento REG padrão
      const defaultFaturamentoReg = {
        previsto: new Array(12).fill(0),
        medio: new Array(12).fill(0),
        maximo: new Array(12).fill(0),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      fs.writeFileSync(this.faturamentoRegFile, JSON.stringify(defaultFaturamentoReg, null, 2));
    }
    
    if (!fs.existsSync(this.faturamentoNnFile)) {
      // Criar dados de faturamento NN padrão
      const defaultFaturamentoNn = {
        previsto: new Array(12).fill(0),
        medio: new Array(12).fill(0),
        maximo: new Array(12).fill(0),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      fs.writeFileSync(this.faturamentoNnFile, JSON.stringify(defaultFaturamentoNn, null, 2));
    }
    
    if (!fs.existsSync(this.faturamentoTotalFile)) {
      // Criar dados de faturamento total padrão
      const defaultFaturamentoTotal = {
        previsto: new Array(12).fill(0),
        medio: new Array(12).fill(0),
        maximo: new Array(12).fill(0),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      fs.writeFileSync(this.faturamentoTotalFile, JSON.stringify(defaultFaturamentoTotal, null, 2));
    }
    
    if (!fs.existsSync(this.resultadoFile)) {
      // Criar dados de resultado padrão
      const defaultResultado = {
        previsto: new Array(12).fill(0),
        medio: new Array(12).fill(0),
        maximo: new Array(12).fill(0),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      fs.writeFileSync(this.resultadoFile, JSON.stringify(defaultResultado, null, 2));
    }
  }

  // Métodos para Transações
  getAllTransactions() {
    try {
      const data = fs.readFileSync(this.transactionsFile, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      console.error('Erro ao ler transações:', error);
      return [];
    }
  }

  saveTransaction(transaction) {
    try {
      const transactions = this.getAllTransactions();
      const newTransaction = {
        id: this.generateId(),
        ...transaction,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      transactions.push(newTransaction);
      fs.writeFileSync(this.transactionsFile, JSON.stringify(transactions, null, 2));
      return newTransaction;
    } catch (error) {
      console.error('Erro ao salvar transação:', error);
      throw error;
    }
  }

  updateTransaction(id, updatedTransaction) {
    try {
      const transactions = this.getAllTransactions();
      const index = transactions.findIndex(t => t.id === id);
      if (index === -1) {
        throw new Error('Transação não encontrada');
      }
      
      transactions[index] = {
        ...transactions[index],
        ...updatedTransaction,
        updatedAt: new Date().toISOString()
      };
      
      fs.writeFileSync(this.transactionsFile, JSON.stringify(transactions, null, 2));
      return transactions[index];
    } catch (error) {
      console.error('Erro ao atualizar transação:', error);
      throw error;
    }
  }

  deleteTransaction(id) {
    try {
      const transactions = this.getAllTransactions();
      const filteredTransactions = transactions.filter(t => t.id !== id);
      fs.writeFileSync(this.transactionsFile, JSON.stringify(filteredTransactions, null, 2));
      return true;
    } catch (error) {
      console.error('Erro ao deletar transação:', error);
      throw error;
    }
  }

  deleteMultipleTransactions(ids) {
    try {
      const transactions = this.getAllTransactions();
      const filteredTransactions = transactions.filter(t => !ids.includes(t.id));
      fs.writeFileSync(this.transactionsFile, JSON.stringify(filteredTransactions, null, 2));
      return true;
    } catch (error) {
      console.error('Erro ao deletar múltiplas transações:', error);
      throw error;
    }
  }

  // Métodos para Produtos
  getAllProducts() {
    try {
      const data = fs.readFileSync(this.productsFile, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      console.error('Erro ao ler produtos:', error);
      return [];
    }
  }

  saveProduct(product) {
    try {
      const products = this.getAllProducts();
      const newProduct = {
        id: this.generateId(),
        ...product,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      products.push(newProduct);
      fs.writeFileSync(this.productsFile, JSON.stringify(products, null, 2));
      return newProduct;
    } catch (error) {
      console.error('Erro ao salvar produto:', error);
      throw error;
    }
  }

  updateProduct(id, updatedProduct) {
    try {
      const products = this.getAllProducts();
      const index = products.findIndex(p => p.id === id);
      if (index === -1) {
        throw new Error('Produto não encontrado');
      }
      
      products[index] = {
        ...products[index],
        ...updatedProduct,
        updatedAt: new Date().toISOString()
      };
      
      fs.writeFileSync(this.productsFile, JSON.stringify(products, null, 2));
      return products[index];
    } catch (error) {
      console.error('Erro ao atualizar produto:', error);
      throw error;
    }
  }

  deleteProduct(id) {
    try {
      const products = this.getAllProducts();
      const filteredProducts = products.filter(p => p.id !== id);
      fs.writeFileSync(this.productsFile, JSON.stringify(filteredProducts, null, 2));
      return true;
    } catch (error) {
      console.error('Erro ao deletar produto:', error);
      throw error;
    }
  }

  deleteMultipleProducts(ids) {
    try {
      const products = this.getAllProducts();
      const filteredProducts = products.filter(p => !ids.includes(p.id));
      fs.writeFileSync(this.productsFile, JSON.stringify(filteredProducts, null, 2));
      return true;
    } catch (error) {
      console.error('Erro ao deletar múltiplos produtos:', error);
      throw error;
    }
  }

  // Métodos para Subcategorias
  getAllSubcategories() {
    try {
      const data = fs.readFileSync(this.subcategoriesFile, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      console.error('Erro ao ler subcategorias:', error);
      return [];
    }
  }

  saveSubcategory(name) {
    try {
      const subcategories = this.getAllSubcategories();
      
      // Verificar se já existe
      if (subcategories.includes(name)) {
        throw new Error('Subcategoria já existe');
      }
      
      // Encontrar a posição correta para inserir em ordem alfabética
      let insertIndex = subcategories.length;
      for (let i = 0; i < subcategories.length; i++) {
        if (name.toLowerCase() < subcategories[i].toLowerCase()) {
          insertIndex = i;
          break;
        }
      }
      
      // Inserir na posição correta
      subcategories.splice(insertIndex, 0, name);
      
      fs.writeFileSync(this.subcategoriesFile, JSON.stringify(subcategories, null, 2));
      return name;
    } catch (error) {
      console.error('Erro ao salvar subcategoria:', error);
      throw error;
    }
  }

  // Métodos para Clientes
  getAllClients() {
    try {
      const data = fs.readFileSync(this.clientsFile, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      console.error('Erro ao ler clientes:', error);
      return [];
    }
  }

  saveClient(client) {
    try {
      const clients = this.getAllClients();
      const newClient = {
        id: this.generateId(),
        ...client,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      clients.push(newClient);
      fs.writeFileSync(this.clientsFile, JSON.stringify(clients, null, 2));
      return newClient;
    } catch (error) {
      console.error('Erro ao salvar cliente:', error);
      throw error;
    }
  }

  updateClient(id, updatedClient) {
    try {
      const clients = this.getAllClients();
      const index = clients.findIndex(c => c.id === id);
      if (index === -1) {
        throw new Error('Cliente não encontrado');
      }
      
      clients[index] = {
        ...clients[index],
        ...updatedClient,
        updatedAt: new Date().toISOString()
      };
      
      fs.writeFileSync(this.clientsFile, JSON.stringify(clients, null, 2));
      return clients[index];
    } catch (error) {
      console.error('Erro ao atualizar cliente:', error);
      throw error;
    }
  }

  deleteClient(id) {
    try {
      const clients = this.getAllClients();
      const filteredClients = clients.filter(c => c.id !== id);
      fs.writeFileSync(this.clientsFile, JSON.stringify(filteredClients, null, 2));
      return true;
    } catch (error) {
      console.error('Erro ao deletar cliente:', error);
      throw error;
    }
  }

  deleteMultipleClients(ids) {
    try {
      const clients = this.getAllClients();
      const filteredClients = clients.filter(c => !ids.includes(c.id));
      fs.writeFileSync(this.clientsFile, JSON.stringify(filteredClients, null, 2));
      return true;
    } catch (error) {
      console.error('Erro ao deletar múltiplos clientes:', error);
      throw error;
    }
  }

  // Métodos para Projetos
  getAllProjects() {
    try {
      const data = fs.readFileSync(this.projectsFile, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      console.error('Erro ao ler projetos:', error);
      return [];
    }
  }

  saveProject(projectData) {
    try {
      const projects = this.getAllProjects();
      const newProject = {
        id: this.generateId(),
        ...projectData,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      projects.push(newProject);
      fs.writeFileSync(this.projectsFile, JSON.stringify(projects, null, 2));
      return newProject;
    } catch (error) {
      throw new Error('Erro ao salvar projeto: ' + error.message);
    }
  }

  updateProject(id, updatedData) {
    try {
      const projects = this.getAllProjects();
      const index = projects.findIndex(p => p.id === id);
      if (index === -1) {
        throw new Error('Projeto não encontrado');
      }
      projects[index] = {
        ...projects[index],
        ...updatedData,
        updatedAt: new Date().toISOString()
      };
      fs.writeFileSync(this.projectsFile, JSON.stringify(projects, null, 2));
      return projects[index];
    } catch (error) {
      throw new Error('Erro ao atualizar projeto: ' + error.message);
    }
  }

  deleteProject(id) {
    try {
      const projects = this.getAllProjects();
      const filteredProjects = projects.filter(p => p.id !== id);
      if (filteredProjects.length === projects.length) {
        throw new Error('Projeto não encontrado');
      }
      fs.writeFileSync(this.projectsFile, JSON.stringify(filteredProjects, null, 2));
    } catch (error) {
      throw new Error('Erro ao excluir projeto: ' + error.message);
    }
  }

  deleteMultipleProjects(ids) {
    try {
      const projects = this.getAllProjects();
      const filteredProjects = projects.filter(p => !ids.includes(p.id));
      fs.writeFileSync(this.projectsFile, JSON.stringify(filteredProjects, null, 2));
    } catch (error) {
      throw new Error('Erro ao excluir projetos: ' + error.message);
    }
  }

  // Métodos para Serviços
  getAllServices() {
    try {
      const data = fs.readFileSync(this.servicesFile, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      console.error('Erro ao ler serviços:', error);
      return [];
    }
  }

  saveService(serviceData) {
    try {
      const services = this.getAllServices();
      const newService = {
        id: this.generateId(),
        ...serviceData,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      services.push(newService);
      fs.writeFileSync(this.servicesFile, JSON.stringify(services, null, 2));
      return newService;
    } catch (error) {
      throw new Error('Erro ao salvar serviço: ' + error.message);
    }
  }

  updateService(id, updatedData) {
    try {
      const services = this.getAllServices();
      const index = services.findIndex(s => s.id === id);
      if (index === -1) {
        throw new Error('Serviço não encontrado');
      }
      services[index] = {
        ...services[index],
        ...updatedData,
        updatedAt: new Date().toISOString()
      };
      fs.writeFileSync(this.servicesFile, JSON.stringify(services, null, 2));
      return services[index];
    } catch (error) {
      throw new Error('Erro ao atualizar serviço: ' + error.message);
    }
  }

  deleteService(id) {
    try {
      const services = this.getAllServices();
      const filteredServices = services.filter(s => s.id !== id);
      if (filteredServices.length === services.length) {
        throw new Error('Serviço não encontrado');
      }
      fs.writeFileSync(this.servicesFile, JSON.stringify(filteredServices, null, 2));
    } catch (error) {
      throw new Error('Erro ao excluir serviço: ' + error.message);
    }
  }

  // Métodos para Acompanhamentos
  getAllAcompanhamentos() {
    try {
      const data = fs.readFileSync(this.acompanhamentosFile, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      console.error('Erro ao ler acompanhamentos:', error);
      return [];
    }
  }

  saveAcompanhamento(acompanhamentoData) {
    try {
      const acompanhamentos = this.getAllAcompanhamentos();
      const newAcompanhamento = {
        id: this.generateId(),
        ...acompanhamentoData,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      acompanhamentos.push(newAcompanhamento);
      fs.writeFileSync(this.acompanhamentosFile, JSON.stringify(acompanhamentos, null, 2));
      return newAcompanhamento;
    } catch (error) {
      throw new Error('Erro ao salvar acompanhamento: ' + error.message);
    }
  }

  updateAcompanhamento(id, updatedData) {
    try {
      const acompanhamentos = this.getAllAcompanhamentos();
      const index = acompanhamentos.findIndex(a => a.id === id);
      if (index === -1) {
        throw new Error('Acompanhamento não encontrado');
      }
      acompanhamentos[index] = {
        ...acompanhamentos[index],
        ...updatedData,
        updatedAt: new Date().toISOString()
      };
      fs.writeFileSync(this.acompanhamentosFile, JSON.stringify(acompanhamentos, null, 2));
      return acompanhamentos[index];
    } catch (error) {
      throw new Error('Erro ao atualizar acompanhamento: ' + error.message);
    }
  }

  deleteAcompanhamento(id) {
    try {
      const acompanhamentos = this.getAllAcompanhamentos();
      const filteredAcompanhamentos = acompanhamentos.filter(a => a.id !== id);
      if (filteredAcompanhamentos.length === acompanhamentos.length) {
        throw new Error('Acompanhamento não encontrado');
      }
      fs.writeFileSync(this.acompanhamentosFile, JSON.stringify(filteredAcompanhamentos, null, 2));
    } catch (error) {
      throw new Error('Erro ao excluir acompanhamento: ' + error.message);
    }
  }

  deleteMultipleAcompanhamentos(ids) {
    try {
      const acompanhamentos = this.getAllAcompanhamentos();
      const filteredAcompanhamentos = acompanhamentos.filter(a => !ids.includes(a.id));
      fs.writeFileSync(this.acompanhamentosFile, JSON.stringify(filteredAcompanhamentos, null, 2));
    } catch (error) {
      throw new Error('Erro ao excluir acompanhamentos: ' + error.message);
    }
  }

  // Métodos para Projeção
  getProjectionData() {
    try {
      const data = fs.readFileSync(this.projectionFile, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      console.error('Erro ao ler dados de projeção:', error);
      return null;
    }
  }

  updateProjectionData(projectionData) {
    try {
      // Criar backup automático antes da alteração
      this.createAutoBackup('projection')
      
      const data = {
        ...projectionData,
        updatedAt: new Date().toISOString()
      };
      fs.writeFileSync(this.projectionFile, JSON.stringify(data, null, 2));
      return data;
    } catch (error) {
      throw new Error('Erro ao salvar dados de projeção: ' + error.message);
    }
  }

  // Função para sincronizar dados dos arquivos separados com projection.json
  syncProjectionData() {
    try {
      const projectionData = this.getProjectionData();
      
      // Ler dados dos arquivos separados
      const fixedExpensesData = this.getFixedExpensesData();
      const variableExpensesData = this.getVariableExpensesData();
      const faturamentoReurbData = this.getFaturamentoReurbData();
      const faturamentoGeoData = this.getFaturamentoGeoData();
      const faturamentoPlanData = this.getFaturamentoPlanData();
      const faturamentoRegData = this.getFaturamentoRegData();
      const faturamentoNnData = this.getFaturamentoNnData();
      const investmentsData = this.getInvestmentsData();
      const mktData = this.getMktData();
      
      // Atualizar projection.json com os dados dos arquivos separados
      projectionData.despesasFixas = fixedExpensesData.previsto;
      projectionData.despesasVariaveis = variableExpensesData.previsto;
      projectionData.faturamentoReurb = faturamentoReurbData.previsto;
      projectionData.faturamentoGeo = faturamentoGeoData.previsto;
      projectionData.faturamentoPlan = faturamentoPlanData.previsto;
      projectionData.faturamentoReg = faturamentoRegData.previsto;
      projectionData.faturamentoNn = faturamentoNnData.previsto;
      projectionData.investimentos = investmentsData.previsto;
      projectionData.mkt = mktData.previsto;
      
      // Salvar projection.json atualizado
      const updatedData = {
        ...projectionData,
        updatedAt: new Date().toISOString()
      };
      fs.writeFileSync(this.projectionFile, JSON.stringify(updatedData, null, 2));
      
      return updatedData;
    } catch (error) {
      throw new Error('Erro ao sincronizar dados de projeção: ' + error.message);
    }
  }

  // Métodos para Despesas Fixas
  getFixedExpensesData() {
    try {
      const data = fs.readFileSync(this.fixedExpensesFile, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      console.error('Erro ao ler dados de despesas fixas:', error);
      return null;
    }
  }

  getVariableExpensesData() {
    try {
      const data = fs.readFileSync(this.variableExpensesFile, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      console.error('Erro ao ler dados de despesas variáveis:', error);
      return null;
    }
  }

  updateVariableExpensesData(variableExpensesData) {
    try {
      // Criar backup automático antes da alteração
      this.createAutoBackup('variableExpenses')
      
      const data = {
        ...variableExpensesData,
        updatedAt: new Date().toISOString()
      };
      fs.writeFileSync(this.variableExpensesFile, JSON.stringify(data, null, 2));
      return data;
    } catch (error) {
      console.error('Erro ao atualizar dados de despesas variáveis:', error);
      throw error;
    }
  }

  updateFixedExpensesData(fixedExpensesData) {
    try {
      // Criar backup automático antes da alteração
      this.createAutoBackup('fixedExpenses')
      
      const data = {
        ...fixedExpensesData,
        updatedAt: new Date().toISOString()
      };
      fs.writeFileSync(this.fixedExpensesFile, JSON.stringify(data, null, 2));
      return data;
    } catch (error) {
      throw new Error('Erro ao salvar dados de despesas fixas: ' + error.message);
    }
  }

  // Métodos para MKT
  getMktData() {
    try {
      const data = fs.readFileSync(this.mktFile, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      console.error('Erro ao ler dados de MKT:', error);
      return null;
    }
  }

  updateMktData(mktData) {
    try {
      // Criar backup automático antes da alteração
      this.createAutoBackup('mkt')
      
      const data = {
        ...mktData,
        updatedAt: new Date().toISOString()
      };
      fs.writeFileSync(this.mktFile, JSON.stringify(data, null, 2));
      return data;
    } catch (error) {
      throw new Error('Erro ao salvar dados de MKT: ' + error.message);
    }
  }

  // Métodos para Orçamento
  getBudgetData() {
    try {
      const data = fs.readFileSync(this.budgetFile, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      console.error('Erro ao ler dados de orçamento:', error);
      return null;
    }
  }

  updateBudgetData(budgetData) {
    try {
      // Criar backup automático antes da alteração
      this.createAutoBackup('budget')
      
      const data = {
        ...budgetData,
        updatedAt: new Date().toISOString()
      };
      fs.writeFileSync(this.budgetFile, JSON.stringify(data, null, 2));
      return data;
    } catch (error) {
      throw new Error('Erro ao salvar dados de orçamento: ' + error.message);
    }
  }

  // Métodos para Investimentos
  getInvestmentsData() {
    try {
      const data = fs.readFileSync(this.investmentsFile, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      console.error('Erro ao ler dados de investimentos:', error);
      return null;
    }
  }

  updateInvestmentsData(investmentsData) {
    try {
      // Criar backup automático antes da alteração
      this.createAutoBackup('investments')
      
      const data = {
        ...investmentsData,
        updatedAt: new Date().toISOString()
      };
      fs.writeFileSync(this.investmentsFile, JSON.stringify(data, null, 2));
      return data;
    } catch (error) {
      throw new Error('Erro ao salvar dados de investimentos: ' + error.message);
    }
  }

  // Métodos para Faturamento REURB
  getFaturamentoReurbData() {
    try {
      const data = fs.readFileSync(this.faturamentoReurbFile, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      console.error('Erro ao ler dados de faturamento REURB:', error);
      return null;
    }
  }

  updateFaturamentoReurbData(faturamentoReurbData) {
    try {
      // Criar backup automático antes da alteração
      this.createAutoBackup('faturamentoReurb')
      
      const data = {
        ...faturamentoReurbData,
        updatedAt: new Date().toISOString()
      };
      fs.writeFileSync(this.faturamentoReurbFile, JSON.stringify(data, null, 2));
      return data;
    } catch (error) {
      throw new Error('Erro ao salvar dados de faturamento REURB: ' + error.message);
    }
  }

  // Métodos para Faturamento GEO
  getFaturamentoGeoData() {
    try {
      const data = fs.readFileSync(this.faturamentoGeoFile, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      console.error('Erro ao ler dados de faturamento GEO:', error);
      return null;
    }
  }

  updateFaturamentoGeoData(faturamentoGeoData) {
    try {
      // Criar backup automático antes da alteração
      this.createAutoBackup('faturamentoGeo')
      
      const data = {
        ...faturamentoGeoData,
        updatedAt: new Date().toISOString()
      };
      fs.writeFileSync(this.faturamentoGeoFile, JSON.stringify(data, null, 2));
      return data;
    } catch (error) {
      throw new Error('Erro ao salvar dados de faturamento GEO: ' + error.message);
    }
  }

  // Métodos para Faturamento PLAN
  getFaturamentoPlanData() {
    try {
      const data = fs.readFileSync(this.faturamentoPlanFile, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      console.error('Erro ao ler dados de faturamento PLAN:', error);
      return null;
    }
  }

  updateFaturamentoPlanData(faturamentoPlanData) {
    try {
      // Criar backup automático antes da alteração
      this.createAutoBackup('faturamentoPlan')
      
      const data = {
        ...faturamentoPlanData,
        updatedAt: new Date().toISOString()
      };
      fs.writeFileSync(this.faturamentoPlanFile, JSON.stringify(data, null, 2));
      return data;
    } catch (error) {
      throw new Error('Erro ao salvar dados de faturamento PLAN: ' + error.message);
    }
  }

  // Métodos para Faturamento REG
  getFaturamentoRegData() {
    try {
      const data = fs.readFileSync(this.faturamentoRegFile, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      console.error('Erro ao ler dados de faturamento REG:', error);
      return null;
    }
  }

  updateFaturamentoRegData(faturamentoRegData) {
    try {
      // Criar backup automático antes da alteração
      this.createAutoBackup('faturamentoReg')
      
      const data = {
        ...faturamentoRegData,
        updatedAt: new Date().toISOString()
      };
      fs.writeFileSync(this.faturamentoRegFile, JSON.stringify(data, null, 2));
      return data;
    } catch (error) {
      throw new Error('Erro ao salvar dados de faturamento REG: ' + error.message);
    }
  }

  // Métodos para Faturamento NN
  getFaturamentoNnData() {
    try {
      const data = fs.readFileSync(this.faturamentoNnFile, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      console.error('Erro ao ler dados de faturamento NN:', error);
      return null;
    }
  }

  updateFaturamentoNnData(faturamentoNnData) {
    try {
      // Criar backup automático antes da alteração
      this.createAutoBackup('faturamentoNn')
      
      const data = {
        ...faturamentoNnData,
        updatedAt: new Date().toISOString()
      };
      fs.writeFileSync(this.faturamentoNnFile, JSON.stringify(data, null, 2));
      return data;
    } catch (error) {
      throw new Error('Erro ao salvar dados de faturamento NN: ' + error.message);
    }
  }

  // Métodos para Faturamento Total
  getFaturamentoTotalData() {
    try {
      const data = fs.readFileSync(this.faturamentoTotalFile, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      console.error('Erro ao ler dados de faturamento total:', error);
      return null;
    }
  }

  updateFaturamentoTotalData(faturamentoTotalData) {
    try {
      // Criar backup automático antes da alteração
      this.createAutoBackup('faturamentoTotal')
      
      const data = {
        ...faturamentoTotalData,
        updatedAt: new Date().toISOString()
      };
      fs.writeFileSync(this.faturamentoTotalFile, JSON.stringify(data, null, 2));
      return data;
    } catch (error) {
      throw new Error('Erro ao salvar dados de faturamento total: ' + error.message);
    }
  }

  // Métodos para Resultado
  getResultadoData() {
    try {
      const data = fs.readFileSync(this.resultadoFile, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      console.error('Erro ao ler dados de resultado:', error);
      return null;
    }
  }

  updateResultadoData(resultadoData) {
    try {
      // Criar backup automático antes da alteração
      this.createAutoBackup('resultado')
      
      const data = {
        ...resultadoData,
        updatedAt: new Date().toISOString()
      };
      fs.writeFileSync(this.resultadoFile, JSON.stringify(data, null, 2));
      return data;
    } catch (error) {
      throw new Error('Erro ao salvar dados de resultado: ' + error.message);
    }
  }

  // Métodos para Usuários
  getAllUsers() {
    try {
      const data = fs.readFileSync(this.usersFile, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      console.error('Erro ao ler usuários:', error);
      return [];
    }
  }

  getUserByUsername(username) {
    try {
      const users = this.getAllUsers();
      return users.find(user => user.username === username);
    } catch (error) {
      console.error('Erro ao buscar usuário:', error);
      return null;
    }
  }

  saveUser(userData) {
    try {
      const users = this.getAllUsers();
      const newUser = {
        id: this.generateId(),
        ...userData,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      users.push(newUser);
      fs.writeFileSync(this.usersFile, JSON.stringify(users, null, 2));
      return newUser;
    } catch (error) {
      throw new Error('Erro ao salvar usuário: ' + error.message);
    }
  }

  updateUser(id, updatedData) {
    try {
      const users = this.getAllUsers();
      const index = users.findIndex(u => u.id === id);
      if (index === -1) {
        throw new Error('Usuário não encontrado');
      }
      users[index] = {
        ...users[index],
        ...updatedData,
        updatedAt: new Date().toISOString()
      };
      fs.writeFileSync(this.usersFile, JSON.stringify(users, null, 2));
      return users[index];
    } catch (error) {
      throw new Error('Erro ao atualizar usuário: ' + error.message);
    }
  }

  deleteUser(id) {
    try {
      const users = this.getAllUsers();
      const filteredUsers = users.filter(u => u.id !== id);
      if (filteredUsers.length === users.length) {
        throw new Error('Usuário não encontrado');
      }
      fs.writeFileSync(this.usersFile, JSON.stringify(filteredUsers, null, 2));
    } catch (error) {
      throw new Error('Erro ao excluir usuário: ' + error.message);
    }
  }

  // Método auxiliar para gerar IDs únicos
  generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
  }

  // Limpar todos os dados de projeção
  clearAllProjectionData() {
    try {
      console.log('Iniciando limpeza de todos os dados de projeção...')
      
      // Limpar dados principais de projeção
      const defaultProjectionData = {
        despesasVariaveis: new Array(12).fill(0),
        despesasFixas: new Array(12).fill(0),
        investimentos: new Array(12).fill(0),
        mkt: new Array(12).fill(0),
        faturamentoReurb: new Array(12).fill(0),
        faturamentoGeo: new Array(12).fill(0),
        faturamentoPlan: new Array(12).fill(0),
        faturamentoReg: new Array(12).fill(0),
        faturamentoNn: new Array(12).fill(0),
        growth: { minimo: 0, medio: 0, maximo: 0 },
        mktComponents: {
          trafego: new Array(12).fill(0),
          socialMedia: new Array(12).fill(0),
          producaoConteudo: new Array(12).fill(0)
        }
      }
      
      // Limpar dados de tabelas específicas
      const defaultFaturamentoData = {
        previsto: new Array(12).fill(0),
        medio: new Array(12).fill(0),
        maximo: new Array(12).fill(0)
      }
      
      const defaultExpensesData = {
        previsto: new Array(12).fill(0),
        medio: new Array(12).fill(0),
        maximo: new Array(12).fill(0)
      }
      
      const defaultFixedExpensesData = {
        previsto: new Array(12).fill(0),
        media: new Array(12).fill(0),
        maximo: new Array(12).fill(0)
      }
      
      // Salvar dados limpos
      fs.writeFileSync(this.projectionFile, JSON.stringify(defaultProjectionData, null, 2))
      fs.writeFileSync(this.fixedExpensesFile, JSON.stringify(defaultFixedExpensesData, null, 2))
      fs.writeFileSync(this.variableExpensesFile, JSON.stringify(defaultExpensesData, null, 2))
      fs.writeFileSync(this.mktFile, JSON.stringify(defaultExpensesData, null, 2))
      fs.writeFileSync(this.budgetFile, JSON.stringify(defaultExpensesData, null, 2))
      fs.writeFileSync(this.investmentsFile, JSON.stringify(defaultExpensesData, null, 2))
      fs.writeFileSync(this.faturamentoReurbFile, JSON.stringify(defaultFaturamentoData, null, 2))
      fs.writeFileSync(this.faturamentoGeoFile, JSON.stringify(defaultFaturamentoData, null, 2))
      fs.writeFileSync(this.faturamentoPlanFile, JSON.stringify(defaultFaturamentoData, null, 2))
      fs.writeFileSync(this.faturamentoRegFile, JSON.stringify(defaultFaturamentoData, null, 2))
      fs.writeFileSync(this.faturamentoNnFile, JSON.stringify(defaultFaturamentoData, null, 2))
      fs.writeFileSync(this.faturamentoTotalFile, JSON.stringify(defaultFaturamentoData, null, 2))
      fs.writeFileSync(this.resultadoFile, JSON.stringify(defaultExpensesData, null, 2))
      
      console.log('Todos os dados de projeção foram limpos com sucesso!')
      return { success: true, message: 'Todos os dados de projeção foram limpos com sucesso!' }
      
    } catch (error) {
      console.error('Erro ao limpar dados de projeção:', error)
      return { success: false, message: 'Erro ao limpar dados de projeção: ' + error.message }
    }
  }

  // Função para criar backup automático antes de uma alteração
  createAutoBackup(tableName) {
    try {
      // Verificar se é uma tabela de projeção
      if (!this.projectionFiles[tableName]) {
        console.log(`⚠️ ${tableName} não é uma tabela de projeção, pulando backup`)
        return { success: false, message: 'Tabela não é de projeção' }
      }

      const originalFile = this.projectionFiles[tableName]
      const backupFile = originalFile.replace('.json', '-backup.json')
      
      // Verificar se o arquivo original existe
      if (!fs.existsSync(originalFile)) {
        console.log(`⚠️ Arquivo original ${tableName}.json não existe, pulando backup`)
        return { success: false, message: 'Arquivo original não existe' }
      }

      // Ler dados atuais
      const currentData = fs.readFileSync(originalFile, 'utf8')
      
      // Verificar se o backup já existe e se é diferente
      if (fs.existsSync(backupFile)) {
        const backupData = fs.readFileSync(backupFile, 'utf8')
        if (currentData === backupData) {
          console.log(`✅ ${tableName}: Dados idênticos ao backup, pulando`)
          return { success: true, message: 'Dados idênticos ao backup' }
        }
      }

      // Criar backup
      fs.writeFileSync(backupFile, currentData)
      console.log(`🔄 Backup automático criado: ${tableName}-backup.json`)
      
      return { 
        success: true, 
        message: `Backup automático criado para ${tableName}`,
        timestamp: new Date().toISOString()
      }
      
    } catch (error) {
      console.error(`❌ Erro ao criar backup automático para ${tableName}:`, error)
      return { success: false, message: `Erro no backup: ${error.message}` }
    }
  }

  // Função para restaurar de backup
  restoreFromBackup(tableName) {
    try {
      if (!this.projectionFiles[tableName]) {
        return { success: false, message: 'Tabela não é de projeção' }
      }

      const originalFile = this.projectionFiles[tableName]
      const backupFile = originalFile.replace('.json', '-backup.json')
      
      if (!fs.existsSync(backupFile)) {
        return { success: false, message: 'Arquivo de backup não existe' }
      }

      // Ler dados do backup
      const backupData = fs.readFileSync(backupFile, 'utf8')
      
      // Restaurar dados originais
      fs.writeFileSync(originalFile, backupData)
      console.log(`🔄 Restaurado de backup: ${tableName}`)
      
      return { 
        success: true, 
        message: `Dados restaurados de backup para ${tableName}`,
        timestamp: new Date().toISOString()
      }
      
    } catch (error) {
      console.error(`❌ Erro ao restaurar backup para ${tableName}:`, error)
      return { success: false, message: `Erro na restauração: ${error.message}` }
    }
  }
}

module.exports = Database;
