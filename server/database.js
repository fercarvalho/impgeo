const fs = require('fs');
const path = require('path');

class Database {
  constructor() {
    this.dbPath = path.join(__dirname, 'database');
    this.transactionsFile = path.join(this.dbPath, 'transactions.json');
    this.productsFile = path.join(this.dbPath, 'products.json');
    this.subcategoriesFile = path.join(this.dbPath, 'subcategories.json');
    this.clientsFile = path.join(this.dbPath, 'clients.json');
    
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

  // Método auxiliar para gerar IDs únicos
  generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
  }
}

module.exports = Database;
