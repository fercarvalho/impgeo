require('dotenv').config();
const express = require('express');
const multer = require('multer');
const XLSX = require('xlsx');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const hpp = require('hpp');
const xss = require('xss-clean');
const mongoSanitize = require('express-mongo-sanitize');
const sanitizeHtml = require('sanitize-html');
const { z } = require('zod');
const Database = require('./database-pg');
const { enviarEmailRecuperacao } = require('./services/email');
const { parseExtrato } = require('./services/extratoParser');
const { logAudit, AUDIT_OPERATIONS, AUDIT_STATUS } = require('./utils/audit');
const { createRefreshToken, verifyRefreshToken, rotateRefreshToken, revokeAllUserTokens, cleanupExpiredTokens } = require('./utils/refresh-tokens');
const { createSession, revokeSession, revokeAllUserSessions, getAllSessions, revokeSessionByRefreshTokenId, cleanupExpiredSessions } = require('./utils/session-manager');
const { startAnomalyMonitoring } = require('./utils/anomaly-detection');

const app = express();
const port = 9001;
const db = new Database();
const JWT_SECRET = process.env.JWT_SECRET || 'impgeo_7b3c1f4e9a2d_!Q9t$L0p@Z7x#F3k';
const BASE_URL = process.env.BASE_URL || 'http://localhost:9000';
const PASSWORD_RESET_TOKEN_TTL_MINUTES = Math.min(
  Math.max(Number(process.env.PASSWORD_RESET_TOKEN_TTL_MINUTES) || 60, 5),
  24 * 60
);
const PASSWORD_RESET_CLEANUP_INTERVAL_MINUTES = Math.min(
  Math.max(Number(process.env.PASSWORD_RESET_CLEANUP_INTERVAL_MINUTES) || 60, 5),
  24 * 60
);

// Helper para transformar texto em slug amigável
const slugify = (text) => {
  if (!text) return '';
  return text
    .toString()
    .toLowerCase()
    .trim()
    .normalize('NFD') // Decompor caracteres acentuados
    .replace(/[\u0300-\u036f]/g, '') // Remover acentos
    .replace(/\s+/g, '-') // Espaços para -
    .replace(/[^\w-]+/g, '') // Remover caracteres não-word
    .replace(/--+/g, '-'); // Múltiplos - para um único -
};


if (process.env.NODE_ENV === 'production' && !process.env.JWT_SECRET) {
  console.error('FATAL ERROR: JWT_SECRET MUST be defined in production environment.');
  process.exit(1);
}

// Confia no proxy Nginx para obter o IP real do cliente
app.set('trust proxy', 1);

// Middleware
app.use(helmet());

const corsOrigins = process.env.CORS_ORIGINS
  ? process.env.CORS_ORIGINS.split(',').map(o => o.trim())
  : (process.env.CORS_ORIGIN ? [process.env.CORS_ORIGIN] : ['http://localhost:9000']);
app.use(cors({ origin: corsOrigins, credentials: true }));

app.use(mongoSanitize());
app.use(xss());
app.use(hpp());
app.use(express.json());

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: 'Muitas tentativas de login. Tente novamente em alguns minutos.'
  }
});

const passwordRecoveryLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: 'Muitas tentativas de recuperação. Tente novamente em alguns minutos.'
  }
});

const passwordTokenValidationLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: 'Muitas tentativas de validação de token. Aguarde alguns minutos.'
  }
});

const passwordResetLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: 'Muitas tentativas de redefinição. Tente novamente em alguns minutos.'
  }
});

const avatarsDir = path.join(__dirname, 'uploads', 'avatars');
if (!fs.existsSync(avatarsDir)) {
  fs.mkdirSync(avatarsDir, { recursive: true });
}

const documentsDir = path.join(__dirname, 'uploads', 'documents');
if (!fs.existsSync(documentsDir)) {
  fs.mkdirSync(documentsDir, { recursive: true });
}

app.use('/api/avatars', express.static(avatarsDir, {
  maxAge: '1y',
  etag: true,
  lastModified: true
}));

app.use('/api/documents', express.static(documentsDir, {
  maxAge: '1y',
  etag: true,
  lastModified: true
}));

function validateEmailFormat(email) {
  if (!email || typeof email !== 'string') return false;
  const trimmed = email.trim();
  if (trimmed.length < 5 || trimmed.length > 254) return false;
  if (
    trimmed.startsWith('.') ||
    trimmed.startsWith('-') ||
    trimmed.endsWith('.') ||
    trimmed.endsWith('-')
  ) {
    return false;
  }
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const parts = trimmed.split('@');
  if (parts.length !== 2 || !parts[1].includes('.')) return false;
  return emailRegex.test(trimmed);
}

function parseAddress(addressValue) {
  if (!addressValue) return null;
  if (typeof addressValue === 'object') return addressValue;
  if (typeof addressValue === 'string') {
    try {
      return JSON.parse(addressValue);
    } catch (error) {
      return null;
    }
  }
  return null;
}

function mapUserToClient(user) {
  const address = parseAddress(user.address);
  const modulesAccess = Array.isArray(user.modulesAccess)
    ? user.modulesAccess.map((item) => ({
      moduleKey: item.moduleKey || item.module_key,
      moduleName: item.moduleName || item.module_name,
      accessLevel: item.accessLevel || item.access_level || 'view'
    }))
    : [];

  let formattedBirthDate = user.birthDate || user.birth_date || null;
  if (formattedBirthDate instanceof Date) {
    formattedBirthDate = formattedBirthDate.toISOString().split('T')[0];
  } else if (typeof formattedBirthDate === 'string' && formattedBirthDate.includes('T')) {
    formattedBirthDate = formattedBirthDate.split('T')[0];
  }

  return {
    id: user.id,
    username: user.username,
    role: user.role,
    firstName: user.firstName || user.first_name || null,
    lastName: user.lastName || user.last_name || null,
    email: user.email || null,
    phone: user.phone || null,
    photoUrl: user.photoUrl || user.photo_url || null,
    cpf: user.cpf || null,
    birthDate: formattedBirthDate,
    gender: user.gender || null,
    position: user.position || null,
    address,
    isActive: user.isActive !== undefined ? user.isActive : (user.is_active !== false),
    lastLogin: user.lastLogin || user.last_login || null,
    createdAt: user.createdAt || user.created_at || null,
    updatedAt: user.updatedAt || user.updated_at || null,
    modulesAccess,
    permissoesLegais: user.permissoesLegais || user.permissoes_legais || {}
  };
}

function normalizeModuleKey(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9_-]/g, '');
}

function sanitizeAction(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_:-]/g, '_')
    .slice(0, 100);
}

async function logActivity(req, payload) {
  try {
    await db.createActivityLog({
      userId: req.user?.id || null,
      username: req.user?.username || null,
      ipAddress: req.ip || req.headers['x-forwarded-for'] || null,
      action: sanitizeAction(payload.action),
      moduleKey: payload.moduleKey || null,
      entityType: payload.entityType || null,
      entityId: payload.entityId || null,
      details: payload.details || {}
    });
    if (Math.random() < 0.05) {
      await db.trimActivityLogs(100000);
    }
  } catch (error) {
    console.log('Falha ao registrar atividade:', error.message);
  }
}

function deleteAvatarFile(photoUrl) {
  try {
    if (!photoUrl) return;
    let filename = photoUrl;
    if (photoUrl.includes('/')) {
      filename = photoUrl.split('/').pop();
    }
    if (!filename || filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
      return;
    }
    const filePath = path.join(avatarsDir, filename);
    const resolvedPath = path.resolve(filePath);
    const resolvedAvatarsDir = path.resolve(avatarsDir);
    if (!resolvedPath.startsWith(resolvedAvatarsDir)) return;
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  } catch (error) {
    console.log('Erro ao remover avatar antigo:', error.message);
  }
}

function generateRandomPassword() {
  return crypto.randomBytes(16).toString('base64').slice(0, 16).replace(/[+/=]/g, (char) => {
    const replacements = { '+': 'A', '/': 'B', '=': 'C' };
    return replacements[char] || char;
  });
}

function buildPasswordResetUrl(token) {
  const normalizedBase = String(BASE_URL || '').trim().replace(/\/$/, '');
  return `${normalizedBase}/?token=${encodeURIComponent(token)}`;
}

// Middleware de autenticação
const authenticateToken = (req, res, next) => {
  if (req.user) return next();

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

const publicApiRoutes = [
  '/auth/login',
  '/auth/recuperar-senha',
  '/auth/resetar-senha'
];

const publicApiPrefixes = [
  '/avatars',
  '/documents',
  '/auth/validar-token/',
  '/acompanhamentos/public',
  '/modelo/',
  '/webhooks/'
];

app.use('/api', (req, res, next) => {
  if (publicApiRoutes.includes(req.path)) {
    return next();
  }
  if (publicApiPrefixes.some(prefix => req.path.startsWith(prefix))) {
    return next();
  }
  return authenticateToken(req, res, next);
});

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

// Uploader em memória — usado para PDFs de extrato/fatura (não grava em disco)
const uploadMemory = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

const avatarStorage = multer.diskStorage({
  destination: function (req, file, cb) {
    if (!fs.existsSync(avatarsDir)) {
      fs.mkdirSync(avatarsDir, { recursive: true });
    }
    cb(null, avatarsDir);
  },
  filename: function (req, file, cb) {
    const userId = req.user?.id || crypto.randomUUID();
    let ext = path.extname(file.originalname).toLowerCase();
    if (!ext) {
      if (file.mimetype === 'image/jpeg') ext = '.jpg';
      else if (file.mimetype === 'image/png') ext = '.png';
      else if (file.mimetype === 'image/webp') ext = '.webp';
    }
    cb(null, `${userId}-${Date.now()}${ext}`);
  }
});

const uploadAvatar = multer({
  storage: avatarStorage,
  fileFilter: (req, file, cb) => {
    const validMimetypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    const ext = path.extname(file.originalname).toLowerCase();
    const validExts = ['.jpeg', '.jpg', '.png', '.webp', '']; // empty string allows blobs

    if (validMimetypes.includes(file.mimetype) && validExts.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Apenas arquivos JPG, PNG ou WebP são permitidos!'), false);
    }
  },
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB
  }
});

const documentStorage = multer.diskStorage({
  destination: function (req, file, cb) {
    if (!fs.existsSync(documentsDir)) {
      fs.mkdirSync(documentsDir, { recursive: true });
    }
    cb(null, documentsDir);
  },
  filename: function (req, file, cb) {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `car-${Date.now()}-${Math.round(Math.random() * 1E9)}${ext}`);
  }
});

const uploadDocument = multer({
  storage: documentStorage,
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf' || path.extname(file.originalname).toLowerCase() === '.pdf') {
      cb(null, true);
    } else {
      cb(new Error('Apenas arquivos PDF são permitidos!'), false);
    }
  },
  limits: {
    fileSize: 20 * 1024 * 1024 // 20MB
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
app.get('/api/modelo/:type', async (req, res) => {
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

app.post('/api/acompanhamentos/upload-car', authenticateToken, uploadDocument.single('file'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'Nenhum arquivo enviado' });
    }
    const fileUrl = `/api/documents/${req.file.filename}`;
    res.json({ success: true, url: fileUrl });
  } catch (error) {
    console.error('Erro no upload de documento do CAR:', error);
    res.status(500).json({ success: false, error: 'Erro ao fazer upload do documento' });
  }
});

// Rota para importar arquivos
app.post('/api/import', upload.single('file'), async (req, res) => {
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
      for (const project of processedData) {
        try {
          await db.saveProject(project);
        } catch (error) {
          console.error('Erro ao salvar projeto:', error);
        }
      }
    } else if (type === 'acompanhamentos') {
      processedData = processAcompanhamentos(worksheet);
      console.log(`Processados ${processedData.length} acompanhamentos do arquivo`);
      message = `${processedData.length} acompanhamentos importados com sucesso!`;

      // Salvar acompanhamentos processados no banco de dados
      let savedCount = 0;
      for (const acompanhamento of processedData) {
        try {
          await db.saveAcompanhamento(acompanhamento);
          savedCount++;
        } catch (error) {
          console.error('Erro ao salvar acompanhamento:', error);
        }
      }
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
    await logActivity(req, {
      action: 'import',
      moduleKey: type,
      entityType: 'batch',
      entityId: String(processedData.length),
      details: { type, count: processedData.length }
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
app.post('/api/export', async (req, res) => {
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
    } else if (type === 'acompanhamentos') {
      const excelData = data.map(a => ({
        'Código do Imóvel': a.codImovel ?? a.cod_imovel ?? '',
        'Imóvel': a.imovel ?? a.endereco ?? '',
        'Município': a.municipio ?? '',
        'Mapa URL': a.mapaUrl ?? a.mapa_url ?? '',
        'Matrículas': a.matriculas ?? '',
        'N INCRA/CCIR': a.nIncraCcir ?? a.n_incra_ccir ?? '',
        'CAR': a.car ?? '',
        'Status CAR': a.statusCar ?? a.status_car ?? a.status ?? '',
        'ITR': a.itr ?? '',
        'Geo Certificação': a.geoCertificacao ?? a.geo_certificacao ?? 'NÃO',
        'Geo Registro': a.geoRegistro ?? a.geo_registro ?? 'NÃO',
        'Área Total (ha)': a.areaTotal ?? a.area_total ?? 0,
        'Reserva Legal (ha)': a.reservaLegal ?? a.reserva_legal ?? 0,
        'Cultura 1': a.cultura1 ?? '',
        'Área Cultura 1 (ha)': a.areaCultura1 ?? a.area_cultura1 ?? 0,
        'Cultura 2': a.cultura2 ?? '',
        'Área Cultura 2 (ha)': a.areaCultura2 ?? a.area_cultura2 ?? 0,
        'Outros': a.outros ?? '',
        'Área Outros (ha)': a.areaOutros ?? a.area_outros ?? 0,
        'APP Código Florestal (ha)': a.appCodigoFlorestal ?? a.app_codigo_florestal ?? 0,
        'APP Vegetada (ha)': a.appVegetada ?? a.app_vegetada ?? 0,
        'APP Não Vegetada (ha)': a.appNaoVegetada ?? a.app_nao_vegetada ?? 0,
        'Remanescente Florestal (ha)': a.remanescenteFlorestal ?? a.remanescente_florestal ?? 0
      }));
      worksheet = XLSX.utils.json_to_sheet(excelData);
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Acompanhamentos');
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
    await logActivity(req, {
      action: 'export',
      moduleKey: type || 'export',
      entityType: 'batch',
      details: { type, count: Array.isArray(data) ? data.length : 0 }
    });

  } catch (error) {
    console.error('Erro ao exportar dados:', error);
    res.status(500).json({
      error: 'Erro ao exportar dados',
      message: error.message
    });
  }
});

// ─── Importação de Extrato / Fatura Bancária ─────────────────────────────────

// Parse-only: processa o arquivo mas NÃO salva — retorna prévia para o sandbox
app.post('/api/import/extrato', authenticateToken, uploadMemory.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, error: 'Nenhum arquivo enviado.' });
    const { bank, importType = 'extrato', password } = req.body;
    if (!bank) return res.status(400).json({ success: false, error: 'Banco não informado.' });
    const ext = (req.file.originalname.split('.').pop() || '').toLowerCase();
    const parsed = await parseExtrato(bank, req.file.buffer, ext, importType, password || null);
    console.log(`[Extrato] bank=${bank} ext=${ext} importType=${importType} → ${parsed.length} transações encontradas`);
    res.json({ success: true, data: parsed, count: parsed.length });
  } catch (err) {
    console.error('[Extrato] Erro ao processar:', err);
    res.status(500).json({ success: false, error: err.message || 'Erro desconhecido ao processar arquivo' });
  }
});

// Confirm: recebe a lista (possivelmente editada) do sandbox e salva no banco
app.post('/api/import/extrato/confirm', authenticateToken, async (req, res) => {
  try {
    const { transactions } = req.body;
    if (!Array.isArray(transactions) || transactions.length === 0) {
      return res.status(400).json({ success: false, error: 'Nenhuma transação para importar.' });
    }
    const saved = [];
    for (const t of transactions) {
      const savedT = await db.saveTransaction({ ...t, userId: req.user.id });
      await logActivity(req, {
        action: 'create',
        moduleKey: 'transactions',
        entityType: 'transaction',
        entityId: savedT?.id || null,
        details: { after: savedT },
      });
      saved.push(savedT);
    }
    res.json({ success: true, message: `${saved.length} transações importadas com sucesso!`, data: saved, count: saved.length });
  } catch (err) {
    console.error('[Extrato Confirm] Erro:', err);
    res.status(500).json({ success: false, error: err.message || 'Erro ao salvar transações' });
  }
});

// APIs para Transações
app.get('/api/transactions', async (req, res) => {
  try {
    const transactions = await db.getAllTransactions();
    res.json({ success: true, data: transactions });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

const transactionSchema = z.object({
  date: z.string().optional(),
  description: z.string().min(1, 'A descrição é obrigatória'),
  value: z.number().or(z.string().transform(v => parseFloat(v))),
  type: z.string().min(1),
  category: z.string().min(1),
  subcategory: z.string().optional()
}).passthrough();

app.post('/api/transactions', async (req, res) => {
  try {
    const validatedData = transactionSchema.parse(req.body);
    const transaction = await db.saveTransaction(validatedData);
    res.json({ success: true, data: transaction });
    await logActivity(req, {
      action: 'financial_create',
      moduleKey: 'transactions',
      entityType: 'transaction',
      entityId: transaction?.id || null
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ success: false, error: 'Dados inválidos', details: error.errors });
    }
    res.status(500).json({ success: false, error: error.message });
  }
});

app.put('/api/transactions/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const transaction = await db.updateTransaction(id, req.body);
    res.json({ success: true, data: transaction });
    await logActivity(req, {
      action: 'financial_edit',
      moduleKey: 'transactions',
      entityType: 'transaction',
      entityId: id
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.delete('/api/transactions/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await db.deleteTransaction(id);
    res.json({ success: true, message: 'Transação deletada com sucesso' });
    await logActivity(req, {
      action: 'financial_delete',
      moduleKey: 'transactions',
      entityType: 'transaction',
      entityId: id
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.delete('/api/transactions', async (req, res) => {
  try {
    const { ids } = req.body;
    if (!Array.isArray(ids)) {
      return res.status(400).json({ success: false, error: 'IDs devem ser um array' });
    }
    await db.deleteMultipleTransactions(ids);
    res.json({ success: true, message: `${ids.length} transações deletadas com sucesso` });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// APIs para Subcategorias
app.get('/api/subcategories', async (req, res) => {
  try {
    const subcategories = await db.getAllSubcategories();
    res.json({ success: true, data: subcategories });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/subcategories', async (req, res) => {
  try {
    const { name } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, error: 'Nome da subcategoria é obrigatório' });
    }

    const subcategory = await db.saveSubcategory(name.trim());
    res.json({ success: true, data: subcategory });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// APIs para Clientes
app.get('/api/clients', async (req, res) => {
  try {
    const clients = await db.getAllClients();
    res.json({ success: true, data: clients });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/clients', async (req, res) => {
  try {
    const client = await db.saveClient(req.body);
    res.json({ success: true, data: client });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.put('/api/clients/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const client = await db.updateClient(id, req.body);
    res.json({ success: true, data: client });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.delete('/api/clients/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await db.deleteClient(id);
    res.json({ success: true, message: 'Cliente deletado com sucesso' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.delete('/api/clients', async (req, res) => {
  try {
    const { ids } = req.body;
    if (!Array.isArray(ids)) {
      return res.status(400).json({ success: false, error: 'IDs devem ser um array' });
    }
    await db.deleteMultipleClients(ids);
    res.json({ success: true, message: `${ids.length} clientes deletados com sucesso` });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// APIs para Projetos
app.get('/api/projects', async (req, res) => {
  try {
    const projects = await db.getAllProjects();
    res.json({ success: true, data: projects });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/projects', async (req, res) => {
  try {
    const project = await db.saveProject(req.body);
    res.json({ success: true, data: project });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.put('/api/projects/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const updatedProject = await db.updateProject(id, req.body);
    res.json({ success: true, data: updatedProject });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.delete('/api/projects/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await db.deleteProject(id);
    res.json({ success: true, message: 'Projeto excluído com sucesso' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.delete('/api/projects', async (req, res) => {
  try {
    const { ids } = req.body;
    if (!Array.isArray(ids)) {
      return res.status(400).json({ success: false, error: 'IDs devem ser um array' });
    }

    await db.deleteMultipleProjects(ids);
    res.json({ success: true, message: `${ids.length} projetos deletados com sucesso` });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// APIs para Serviços
app.get('/api/services', async (req, res) => {
  try {
    const services = await db.getAllServices();
    res.json({ success: true, data: services });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/services', async (req, res) => {
  try {
    const service = await db.saveService(req.body);
    res.json({ success: true, data: service });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.put('/api/services/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const updatedService = await db.updateService(id, req.body);
    res.json({ success: true, data: updatedService });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.delete('/api/services/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await db.deleteService(id);
    res.json({ success: true, message: 'Serviço excluído com sucesso' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// APIs para Acompanhamentos
app.get('/api/acompanhamentos', async (req, res) => {
  try {
    const acompanhamentos = await db.getAllAcompanhamentos();
    res.json({ success: true, data: acompanhamentos });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/acompanhamentos', async (req, res) => {
  try {
    const acompanhamento = await db.saveAcompanhamento(req.body);
    res.json({ success: true, data: acompanhamento });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.put('/api/acompanhamentos/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const acompanhamento = await db.updateAcompanhamento(id, req.body);
    res.json({ success: true, data: acompanhamento });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.delete('/api/acompanhamentos/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await db.deleteAcompanhamento(id);
    res.json({ success: true, message: 'Acompanhamento deletado com sucesso' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.delete('/api/acompanhamentos', async (req, res) => {
  try {
    const { ids } = req.body;
    if (!Array.isArray(ids)) {
      return res.status(400).json({ success: false, error: 'IDs devem ser um array' });
    }
    await db.deleteMultipleAcompanhamentos(ids);
    res.json({ success: true, message: `${ids.length} acompanhamentos deletados com sucesso` });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Rota para listar todos os links compartilháveis
app.get('/api/acompanhamentos/share-links', authenticateToken, async (req, res) => {
  try {
    const shareLinks = await db.getAllShareLinks();
    res.json({
      success: true,
      data: shareLinks
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Rota para gerar link compartilhável de acompanhamentos
app.post('/api/acompanhamentos/generate-share-link', authenticateToken, async (req, res) => {
  try {
    const { name, expiresAt, password, selectedIds } = req.body;
    const bcrypt = require('bcryptjs');

    if (!Array.isArray(selectedIds) || selectedIds.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Selecione pelo menos um registro para compartilhar'
      });
    }

    // Gerar token único para compartilhamento
    let token = '';
    if (name && name.trim()) {
      const baseSlug = slugify(name);
      token = baseSlug;

      // Verificar se o slug já existe
      const existingLink = await db.getShareLink(token);
      if (existingLink) {
        // Se existir, adiciona um sufixo aleatório curto
        const suffix = require('crypto').randomBytes(3).toString('hex');
        token = `${baseSlug}-${suffix}`;
      }
    } else {
      token = 'view_' + require('crypto').randomBytes(32).toString('hex');
    }

    // Converter data de expiração para ISO string se fornecida
    let expiresAtISO = null;
    if (expiresAt && expiresAt.trim()) {
      // Se já estiver em formato ISO, usar diretamente, senão converter de datetime-local
      if (expiresAt.includes('T') && expiresAt.length === 16) {
        // Formato datetime-local (YYYY-MM-DDTHH:mm), converter para ISO
        expiresAtISO = new Date(expiresAt).toISOString();
      } else {
        expiresAtISO = new Date(expiresAt).toISOString();
      }
    }

    // Hash da senha se fornecida
    let passwordHash = null;
    if (password && password.trim()) {
      passwordHash = await bcrypt.hash(password, 10);
    }

    // Salvar token com nome, data de expiração e senha no banco
    await db.saveShareLink(token, name, expiresAtISO, passwordHash, selectedIds);

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
app.put('/api/acompanhamentos/share-links/:token', authenticateToken, async (req, res) => {
  try {
    const { token } = req.params;
    const { name, expiresAt, password, regenerateToken } = req.body;
    const bcrypt = require('bcryptjs');

    if (regenerateToken) {
      // Gerar novo token personalizado ou aleatório
      let newToken = '';
      const effectiveName = name !== undefined ? name : (await db.getShareLink(token))?.name;
      
      if (effectiveName && effectiveName.trim()) {
        const baseSlug = slugify(effectiveName);
        newToken = baseSlug;
        const existingLink = await db.getShareLink(newToken);
        if (existingLink && existingLink.token !== token) {
           const suffix = require('crypto').randomBytes(3).toString('hex');
           newToken = `${baseSlug}-${suffix}`;
        }
      } else {
        newToken = 'view_' + require('crypto').randomBytes(32).toString('hex');
      }

      const linkData = await db.getShareLink(token);
      if (!linkData) {
        return res.status(404).json({ success: false, error: 'Link não encontrado' });
      }

      // Converter data de expiração se fornecida
      const linkExpiresAt = linkData.expiresAt || linkData.expires_at || null;
      const linkPasswordHash = linkData.passwordHash || linkData.password_hash || null;
      const linkSelectedIds = Array.isArray(linkData.selectedIds)
        ? linkData.selectedIds
        : Array.isArray(linkData.selected_ids)
          ? linkData.selected_ids
          : null;

      let expiresAtISO = linkExpiresAt;
      if (expiresAt !== undefined) {
        if (expiresAt && expiresAt.trim()) {
          if (expiresAt.includes('T') && expiresAt.length === 16) {
            expiresAtISO = new Date(expiresAt).toISOString();
          } else {
            expiresAtISO = new Date(expiresAt).toISOString();
          }
        } else {
          expiresAtISO = null;
        }
      }

      // Hash da senha se fornecida
      let passwordHash = linkPasswordHash;
      if (password !== undefined) {
        if (password && password.trim()) {
          passwordHash = await bcrypt.hash(password, 10);
        } else {
          passwordHash = null;
        }
      }

      // Criar novo link com o novo token
      await db.saveShareLink(
        newToken,
        name !== undefined ? name : linkData.name,
        expiresAtISO,
        passwordHash,
        linkSelectedIds
      );
      // Excluir o link antigo
      await db.deleteShareLink(token);

      res.json({
        success: true,
        token: newToken,
        message: 'Token regenerado com sucesso'
      });
    } else {
      // Atualizar nome, data de expiração e/ou senha
      const bcrypt = require('bcryptjs');
      const updates = {};
      if (name !== undefined) updates.name = name || null;
      if (expiresAt !== undefined) {
        // Converter data de expiração para ISO string se fornecida
        if (expiresAt && expiresAt.trim()) {
          // Se já estiver em formato ISO, usar diretamente, senão converter de datetime-local
          if (expiresAt.includes('T') && expiresAt.length === 16) {
            // Formato datetime-local (YYYY-MM-DDTHH:mm), converter para ISO
            updates.expiresAt = new Date(expiresAt).toISOString();
          } else {
            updates.expiresAt = new Date(expiresAt).toISOString();
          }
        } else {
          updates.expiresAt = null;
        }
      }
      if (password !== undefined) {
        // Se senha for fornecida, fazer hash. Se string vazia ou null, remover senha
        if (password && password.trim()) {
          updates.passwordHash = await bcrypt.hash(password, 10);
        } else {
          updates.passwordHash = null;
        }
      }

      const updated = await db.updateShareLink(token, updates);
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
app.delete('/api/acompanhamentos/share-links/:token', authenticateToken, async (req, res) => {
  try {
    const { token } = req.params;
    await db.deleteShareLink(token);
    res.json({
      success: true,
      message: 'Link excluído com sucesso'
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Rota para validar senha do link compartilhável
app.post('/api/acompanhamentos/public/:token/validate-password', async (req, res) => {
  try {
    const { token } = req.params;
    const { password } = req.body;
    const bcrypt = require('bcryptjs');

    // Buscar informações do link compartilhável
    const shareLink = await db.getShareLink(token);

    if (!shareLink) {
      return res.status(404).json({
        success: false,
        error: 'Link compartilhável não encontrado'
      });
    }

    // Verificar se o link expirou
    const linkExpiresAt = shareLink.expiresAt || shareLink.expires_at;
    const linkPasswordHash = shareLink.passwordHash || shareLink.password_hash;

    if (linkExpiresAt) {
      const expiresAt = new Date(linkExpiresAt);
      const now = new Date();

      if (now > expiresAt) {
        return res.status(410).json({
          success: false,
          error: 'Este link compartilhável expirou e não está mais disponível'
        });
      }
    }

    // Verificar se tem senha
    if (!linkPasswordHash) {
      return res.status(400).json({
        success: false,
        error: 'Este link não possui senha'
      });
    }

    // Validar senha
    if (!password) {
      return res.status(400).json({
        success: false,
        error: 'Senha é obrigatória'
      });
    }

    const isValid = await bcrypt.compare(password, linkPasswordHash);

    if (!isValid) {
      return res.status(401).json({
        success: false,
        error: 'Senha incorreta'
      });
    }

    res.json({
      success: true,
      message: 'Senha válida'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message || 'Erro ao validar senha'
    });
  }
});

// Rota de Redirecionamento Curto (/v/:token)
app.get('/v/:token', async (req, res) => {
  try {
    const { token } = req.params;
    // Redirecionar para a página de visualização com o token na query
    const normalizedBase = String(BASE_URL || '').trim().replace(/\/$/, '');
    res.redirect(`${normalizedBase}/?token=${token}`);
  } catch (error) {
    res.status(500).send('Erro ao redirecionar');
  }
});

// Rota pública para visualizar acompanhamentos (sem autenticação)
app.get('/api/acompanhamentos/public/:token', async (req, res) => {
  try {
    const { token } = req.params;
    const { password } = req.query;
    const bcrypt = require('bcryptjs');

    // Buscar informações do link compartilhável
    const shareLink = await db.getShareLink(token);

    if (!shareLink) {
      return res.status(404).json({
        success: false,
        error: 'Link compartilhável não encontrado'
      });
    }

    // Verificar se o link expirou
    const linkExpiresAt = shareLink.expiresAt || shareLink.expires_at;
    const linkPasswordHash = shareLink.passwordHash || shareLink.password_hash;
    const linkSelectedIds = Array.isArray(shareLink.selectedIds)
      ? shareLink.selectedIds
      : Array.isArray(shareLink.selected_ids)
        ? shareLink.selected_ids
        : [];

    if (linkExpiresAt) {
      const expiresAt = new Date(linkExpiresAt);
      const now = new Date();

      if (now > expiresAt) {
        return res.status(410).json({
          success: false,
          error: 'Este link compartilhável expirou e não está mais disponível'
        });
      }
    }

    // Verificar se tem senha e se foi fornecida
    if (linkPasswordHash) {
      if (!password) {
        return res.status(403).json({
          success: false,
          requiresPassword: true,
          shareLinkName: shareLink.name,
          error: 'Este link requer senha para acesso'
        });
      }

      // Validar senha
      const isValid = await bcrypt.compare(password, linkPasswordHash);
      if (!isValid) {
        return res.status(401).json({
          success: false,
          requiresPassword: true,
          shareLinkName: shareLink.name,
          error: 'Senha incorreta'
        });
      }
    }

    // Buscar todos os acompanhamentos (público)
    const acompanhamentos = await db.getAllAcompanhamentos();
    const filteredAcompanhamentos = linkSelectedIds.length > 0
      ? acompanhamentos.filter((item) => linkSelectedIds.includes(String(item.id)))
      : acompanhamentos;

    res.json({
      success: true,
      data: filteredAcompanhamentos,
      shareLinkName: shareLink.name
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message || 'Erro ao carregar dados'
    });
  }
});

// APIs para Produtos
app.get('/api/products', async (req, res) => {
  try {
    const products = await db.getAllProducts();
    res.json({ success: true, data: products });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/products', async (req, res) => {
  try {
    const product = await db.saveProduct(req.body);
    res.json({ success: true, data: product });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.put('/api/products/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const product = await db.updateProduct(id, req.body);
    res.json({ success: true, data: product });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.delete('/api/products/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await db.deleteProduct(id);
    res.json({ success: true, message: 'Produto deletado com sucesso' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.delete('/api/products', async (req, res) => {
  try {
    const { ids } = req.body;
    if (!Array.isArray(ids)) {
      return res.status(400).json({ success: false, error: 'IDs devem ser um array' });
    }
    await db.deleteMultipleProducts(ids);
    res.json({ success: true, message: `${ids.length} produtos deletados com sucesso` });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// APIs de Projeção
app.get('/api/projection', async (req, res) => {
  try {
    const projectionData = await db.getProjectionData();
    if (!projectionData) {
      return res.status(404).json({ error: 'Dados de projeção não encontrados' });
    }
    res.json(projectionData);
  } catch (error) {
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// Rota para sincronizar dados de projeção
app.post('/api/projection/sync', authenticateToken, async (req, res) => {
  try {
    const syncedData = await db.syncProjectionData();
    res.json({ success: true, data: syncedData });
  } catch (error) {
    res.status(500).json({ error: 'Erro ao sincronizar dados de projeção' });
  }
});

// Rota para atualizar dados de projeção
app.put('/api/projection', authenticateToken, async (req, res) => {
  try {
    const projectionData = req.body;
    const updatedData = await db.updateProjectionData(projectionData);
    res.json({ success: true, data: updatedData });
    await logActivity(req, {
      action: 'financial_edit',
      moduleKey: 'projecao',
      entityType: 'projection',
      entityId: 'main'
    });
  } catch (error) {
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// APIs de Backup Automático
app.post('/api/backup/create/:tableName', authenticateToken, async (req, res) => {
  try {
    const { tableName } = req.params;
    const result = await db.createAutoBackup(tableName);

    if (result.success) {
      res.json({ success: true, message: result.message, timestamp: result.timestamp });
    } else {
      res.status(400).json({ success: false, message: result.message });
    }
  } catch (error) {
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

app.post('/api/backup/restore/:tableName', authenticateToken, async (req, res) => {
  try {
    const { tableName } = req.params;
    const result = await db.restoreFromBackup(tableName);

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
app.get('/api/fixed-expenses', async (req, res) => {
  try {
    const fixedExpensesData = await db.getFixedExpensesData();
    if (!fixedExpensesData) {
      return res.status(404).json({ error: 'Dados de despesas fixas não encontrados' });
    }
    res.json(fixedExpensesData);
  } catch (error) {
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

app.put('/api/fixed-expenses', authenticateToken, async (req, res) => {
  try {
    const fixedExpensesData = req.body;
    const updatedData = await db.updateFixedExpensesData(fixedExpensesData);
    res.json({ success: true, data: updatedData });
  } catch (error) {
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// Limpeza seletiva: Despesas Fixas
app.delete('/api/fixed-expenses', async (req, res) => {
  try {
    await db.createAutoBackup('fixedExpenses');
    const cleared = await db.updateFixedExpensesData({
      previsto: new Array(12).fill(0),
      media: new Array(12).fill(0),
      maximo: new Array(12).fill(0)
    });

    // Sincronizar dados de projeção após limpeza
    await db.syncProjectionData();

    res.json({ success: true, data: cleared });
  } catch (error) {
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// APIs de Despesas Variáveis
app.get('/api/variable-expenses', async (req, res) => {
  try {
    const variableExpensesData = await db.getVariableExpensesData();
    if (!variableExpensesData) {
      return res.status(404).json({ error: 'Dados de despesas variáveis não encontrados' });
    }
    res.json(variableExpensesData);
  } catch (error) {
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

app.put('/api/variable-expenses', authenticateToken, async (req, res) => {
  try {
    const variableExpensesData = req.body;
    const updatedData = await db.updateVariableExpensesData(variableExpensesData);
    res.json({ success: true, data: updatedData });
  } catch (error) {
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// Limpeza seletiva: Despesas Variáveis
app.delete('/api/variable-expenses', async (req, res) => {
  try {
    await db.createAutoBackup('variableExpenses');
    const cleared = await db.updateVariableExpensesData({
      previsto: new Array(12).fill(0),
      medio: new Array(12).fill(0),
      maximo: new Array(12).fill(0)
    });
    await db.syncProjectionData();
    res.json({ success: true, data: cleared });
  } catch (error) {
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// APIs de MKT
app.get('/api/mkt', async (req, res) => {
  try {
    const mktData = await db.getMktData();
    if (!mktData) {
      return res.status(404).json({ error: 'Dados de MKT não encontrados' });
    }
    res.json(mktData);
  } catch (error) {
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

app.put('/api/mkt', authenticateToken, async (req, res) => {
  try {
    const mktData = req.body;
    const updatedData = await db.updateMktData(mktData);
    res.json({ success: true, data: updatedData });
  } catch (error) {
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// Limpeza seletiva: MKT
app.delete('/api/mkt', async (req, res) => {
  try {
    await db.createAutoBackup('mkt');
    const cleared = await db.updateMktData({
      previsto: new Array(12).fill(0),
      medio: new Array(12).fill(0),
      maximo: new Array(12).fill(0)
    });
    await db.syncProjectionData();
    res.json({ success: true, data: cleared });
  } catch (error) {
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// APIs de Orçamento
app.get('/api/budget', async (req, res) => {
  try {
    const budgetData = await db.getBudgetData();
    if (!budgetData) {
      return res.status(404).json({ error: 'Dados de orçamento não encontrados' });
    }
    res.json(budgetData);
  } catch (error) {
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

app.put('/api/budget', authenticateToken, async (req, res) => {
  try {
    const budgetData = req.body;
    const updatedData = await db.updateBudgetData(budgetData);
    res.json({ success: true, data: updatedData });
  } catch (error) {
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// APIs de Investimentos
app.get('/api/investments', async (req, res) => {
  try {
    const investmentsData = await db.getInvestmentsData();
    if (!investmentsData) {
      return res.status(404).json({ error: 'Dados de investimentos não encontrados' });
    }
    res.json(investmentsData);
  } catch (error) {
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

app.put('/api/investments', authenticateToken, async (req, res) => {
  try {
    const investmentsData = req.body;
    const updatedData = await db.updateInvestmentsData(investmentsData);
    res.json({ success: true, data: updatedData });
  } catch (error) {
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// Limpeza seletiva: Investimentos
app.delete('/api/investments', async (req, res) => {
  try {
    await db.createAutoBackup('investments');
    const cleared = await db.updateInvestmentsData({
      previsto: new Array(12).fill(0),
      medio: new Array(12).fill(0),
      maximo: new Array(12).fill(0)
    });
    await db.syncProjectionData();
    res.json({ success: true, data: cleared });
  } catch (error) {
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// APIs de Faturamento REURB
app.get('/api/faturamento-reurb', async (req, res) => {
  try {
    const faturamentoReurbData = await db.getFaturamentoReurbData();
    if (!faturamentoReurbData) {
      return res.status(404).json({ error: 'Dados de faturamento REURB não encontrados' });
    }
    res.json(faturamentoReurbData);
  } catch (error) {
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

app.put('/api/faturamento-reurb', authenticateToken, async (req, res) => {
  try {
    const faturamentoReurbData = req.body;
    const updatedData = await db.updateFaturamentoReurbData(faturamentoReurbData);
    res.json({ success: true, data: updatedData });
  } catch (error) {
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// Limpeza seletiva: Faturamento REURB
app.delete('/api/faturamento-reurb', async (req, res) => {
  try {
    await db.createAutoBackup('faturamentoReurb');
    const cleared = await db.updateFaturamentoReurbData({
      previsto: new Array(12).fill(0),
      medio: new Array(12).fill(0),
      maximo: new Array(12).fill(0)
    });
    await db.syncProjectionData();
    res.json({ success: true, data: cleared });
  } catch (error) {
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// APIs de Faturamento GEO
app.get('/api/faturamento-geo', async (req, res) => {
  try {
    const faturamentoGeoData = await db.getFaturamentoGeoData();
    if (!faturamentoGeoData) {
      return res.status(404).json({ error: 'Dados de faturamento GEO não encontrados' });
    }
    res.json(faturamentoGeoData);
  } catch (error) {
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

app.put('/api/faturamento-geo', authenticateToken, async (req, res) => {
  try {
    const faturamentoGeoData = req.body;
    const updatedData = await db.updateFaturamentoGeoData(faturamentoGeoData);
    res.json({ success: true, data: updatedData });
  } catch (error) {
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// Limpeza seletiva: Faturamento GEO
app.delete('/api/faturamento-geo', async (req, res) => {
  try {
    await db.createAutoBackup('faturamentoGeo');
    const cleared = await db.updateFaturamentoGeoData({
      previsto: new Array(12).fill(0),
      medio: new Array(12).fill(0),
      maximo: new Array(12).fill(0)
    });
    await db.syncProjectionData();
    res.json({ success: true, data: cleared });
  } catch (error) {
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// APIs de Faturamento PLAN
app.get('/api/faturamento-plan', async (req, res) => {
  try {
    const faturamentoPlanData = await db.getFaturamentoPlanData();
    if (!faturamentoPlanData) {
      return res.status(404).json({ error: 'Dados de faturamento PLAN não encontrados' });
    }
    res.json(faturamentoPlanData);
  } catch (error) {
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

app.put('/api/faturamento-plan', authenticateToken, async (req, res) => {
  try {
    const faturamentoPlanData = req.body;
    const updatedData = await db.updateFaturamentoPlanData(faturamentoPlanData);
    res.json({ success: true, data: updatedData });
  } catch (error) {
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// Limpeza seletiva: Faturamento PLAN
app.delete('/api/faturamento-plan', async (req, res) => {
  try {
    await db.createAutoBackup('faturamentoPlan');
    const cleared = await db.updateFaturamentoPlanData({
      previsto: new Array(12).fill(0),
      medio: new Array(12).fill(0),
      maximo: new Array(12).fill(0)
    });
    await db.syncProjectionData();
    res.json({ success: true, data: cleared });
  } catch (error) {
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// APIs de Faturamento REG
app.get('/api/faturamento-reg', async (req, res) => {
  try {
    const faturamentoRegData = await db.getFaturamentoRegData();
    if (!faturamentoRegData) {
      return res.status(404).json({ error: 'Dados de faturamento REG não encontrados' });
    }
    res.json(faturamentoRegData);
  } catch (error) {
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

app.put('/api/faturamento-reg', authenticateToken, async (req, res) => {
  try {
    const faturamentoRegData = req.body;
    const updatedData = await db.updateFaturamentoRegData(faturamentoRegData);
    res.json({ success: true, data: updatedData });
  } catch (error) {
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// Limpeza seletiva: Faturamento REG
app.delete('/api/faturamento-reg', async (req, res) => {
  try {
    await db.createAutoBackup('faturamentoReg');
    const cleared = await db.updateFaturamentoRegData({
      previsto: new Array(12).fill(0),
      medio: new Array(12).fill(0),
      maximo: new Array(12).fill(0)
    });
    await db.syncProjectionData();
    res.json({ success: true, data: cleared });
  } catch (error) {
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// APIs de Faturamento NN
app.get('/api/faturamento-nn', async (req, res) => {
  try {
    const faturamentoNnData = await db.getFaturamentoNnData();
    if (!faturamentoNnData) {
      return res.status(404).json({ error: 'Dados de faturamento NN não encontrados' });
    }
    res.json(faturamentoNnData);
  } catch (error) {
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

app.put('/api/faturamento-nn', authenticateToken, async (req, res) => {
  try {
    const faturamentoNnData = req.body;
    const updatedData = await db.updateFaturamentoNnData(faturamentoNnData);
    res.json({ success: true, data: updatedData });
  } catch (error) {
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// Limpeza seletiva: Faturamento NN
app.delete('/api/faturamento-nn', async (req, res) => {
  try {
    await db.createAutoBackup('faturamentoNn');
    const cleared = await db.updateFaturamentoNnData({
      previsto: new Array(12).fill(0),
      medio: new Array(12).fill(0),
      maximo: new Array(12).fill(0)
    });
    await db.syncProjectionData();
    res.json({ success: true, data: cleared });
  } catch (error) {
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// APIs para Faturamento Total
app.get('/api/faturamento-total', async (req, res) => {
  try {
    const faturamentoTotalData = await db.getFaturamentoTotalData();
    if (!faturamentoTotalData) {
      return res.status(404).json({ error: 'Dados de faturamento total não encontrados' });
    }
    res.json(faturamentoTotalData);
  } catch (error) {
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

app.put('/api/faturamento-total', authenticateToken, async (req, res) => {
  try {
    const faturamentoTotalData = req.body;
    const updatedData = await db.updateFaturamentoTotalData(faturamentoTotalData);
    res.json({ success: true, data: updatedData });
  } catch (error) {
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// APIs para Resultado
app.get('/api/resultado', async (req, res) => {
  try {
    const resultadoData = await db.getResultadoData();
    if (!resultadoData) {
      return res.status(404).json({ error: 'Dados de resultado não encontrados' });
    }
    res.json(resultadoData);
  } catch (error) {
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

app.put('/api/resultado', authenticateToken, async (req, res) => {
  try {
    const resultadoData = req.body;
    const updatedData = await db.updateResultadoData(resultadoData);
    res.json({ success: true, data: updatedData });
  } catch (error) {
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// Limpeza seletiva: Resultado do ano anterior
app.delete('/api/resultado', async (req, res) => {
  try {
    await db.createAutoBackup('resultado');
    const cleared = await db.updateResultadoData({
      previsto: new Array(12).fill(0),
      medio: new Array(12).fill(0),
      maximo: new Array(12).fill(0)
    });
    await db.syncProjectionData();
    res.json({ success: true, data: cleared });
  } catch (error) {
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// APIs de Autenticação
const loginSchema = z.object({
  username: z.string().min(1, 'Usuário é obrigatório'),
  password: z.string().min(1, 'Senha é obrigatória')
});

app.post('/api/auth/login', async (req, res) => {
  try {
    let username, password;
    try {
      const parsed = loginSchema.parse(req.body);
      username = parsed.username;
      password = parsed.password;
    } catch (validationError) {
      return res.status(400).json({ error: 'Usuário e senha são obrigatórios' });
    }

    const user = await db.getUserByUsername(username);
    if (!user) {
      return res.status(401).json({ error: 'Credenciais inválidas' });
    }

    if (user.is_active === false) {
      return res.status(403).json({ error: 'Usuário inativo. Contate um administrador.' });
    }

    const isFirstLogin = !user.last_login;
    let isValidPassword = false;
    let newPassword = null;

    if (isFirstLogin) {
      isValidPassword = true;
      newPassword = generateRandomPassword();
      const hashedPassword = await bcrypt.hash(newPassword, 10);
      const nowISO = new Date().toISOString();
      await db.updateUser(user.id, { password: hashedPassword, lastLogin: nowISO });
    } else {
      isValidPassword = await bcrypt.compare(password, user.password);
    }

    if (!isValidPassword) {
      return res.status(401).json({ error: 'Credenciais inválidas' });
    }

    if (!isFirstLogin) {
      const nowISO = new Date().toISOString();
      await db.updateUser(user.id, { lastLogin: nowISO });
    }

    const token = jwt.sign(
      { id: user.id, username: user.username, role: user.role, permissoes_legais: user.permissoes_legais || {} },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    const updatedUserProfile = await db.getUserProfileById(user.id);
    await db.createActivityLog({
      userId: user.id,
      username: user.username,
      action: 'login',
      moduleKey: 'auth',
      entityType: 'user',
      entityId: user.id,
      details: { role: user.role },
      ipAddress: req.ip || req.headers['x-forwarded-for'] || null
    });

    // Gerar refresh token e criar sessão
    let refreshTokenValue = null;
    try {
      const { token: rt, tokenId } = await createRefreshToken({
        userId: user.id,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      });
      refreshTokenValue = rt;
      await createSession(user.id, tokenId, req);
    } catch (sessionError) {
      console.warn('[login] Falha ao criar refresh token/sessão (não crítico):', sessionError.message);
    }

    const response = {
      success: true,
      token,
      user: mapUserToClient(updatedUserProfile || user)
    };

    if (refreshTokenValue) {
      response.refreshToken = refreshTokenValue;
    }

    if (isFirstLogin && newPassword) {
      response.firstLogin = true;
      response.newPassword = newPassword;
    }

    res.json(response);
  } catch (error) {
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

app.post('/api/auth/verify', authenticateToken, async (req, res) => {
  try {
    const currentUser = await db.getUserById(req.user.id);
    if (!currentUser) {
      return res.status(404).json({ success: false, error: 'Usuário não encontrado' });
    }

    if (currentUser.is_active === false) {
      return res.status(403).json({ success: false, error: 'Usuário inativo. Contate um administrador.' });
    }

    const nowISO = new Date().toISOString();
    await db.updateUser(currentUser.id, { lastLogin: nowISO });
    const refreshedUser = await db.getUserProfileById(currentUser.id);
    await logActivity(req, {
      action: 'auth_verify',
      moduleKey: 'auth',
      entityType: 'user',
      entityId: currentUser.id
    });

    return res.json({
      success: true,
      user: mapUserToClient(refreshedUser || { ...currentUser, last_login: nowISO })
    });
  } catch (error) {
    return res.status(500).json({ success: false, error: 'Erro interno do servidor' });
  }
});

app.post('/api/auth/recuperar-senha', passwordRecoveryLimiter, async (req, res) => {
  const requestId = req.headers['x-request-id'] || crypto.randomUUID();
  try {
    const rawEmail = req.body?.email;
    const rawUsername = req.body?.username;
    const email = rawEmail ? String(rawEmail).trim().toLowerCase() : '';
    const username = rawUsername ? String(rawUsername).trim() : '';

    if (!email && !username) {
      return res.status(400).json({ success: false, error: 'Email ou nome de usuário é obrigatório' });
    }

    let user = null;

    if (email && username) {
      if (!validateEmailFormat(email)) {
        return res.status(400).json({ success: false, error: 'Formato de email inválido' });
      }
      user = await db.getUserByUsername(username);
      if (!user || !user.email || String(user.email).trim().toLowerCase() !== email) {
        return res.status(400).json({
          success: false,
          error: 'O nome de usuário informado não está associado a este email.'
        });
      }
    } else if (username) {
      user = await db.getUserByUsername(username);
    } else if (email) {
      if (!validateEmailFormat(email)) {
        return res.status(400).json({ success: false, error: 'Formato de email inválido' });
      }
      const usersByEmail = await db.getUsersByEmail(email);
      if (usersByEmail.length > 1) {
        return res.status(400).json({
          success: false,
          error: 'MULTIPLE_USERS',
          message: 'Este email está associado a múltiplas contas. Informe também o nome de usuário.'
        });
      }
      user = usersByEmail[0] || null;
    }

    // Resposta neutra para reduzir enumeração de usuários.
    if (!user || !user.email) {
      return res.json({
        success: true,
        message: 'Se o email/nome de usuário estiver cadastrado, você receberá um link de recuperação.'
      });
    }

    const tokenData = await db.criarTokenRecuperacao(user.id, PASSWORD_RESET_TOKEN_TTL_MINUTES);
    const resetUrl = buildPasswordResetUrl(tokenData.token);

    await enviarEmailRecuperacao({
      toEmail: String(user.email).trim(),
      username: user.username,
      resetUrl,
      expiresMinutes: PASSWORD_RESET_TOKEN_TTL_MINUTES
    });

    await db.createActivityLog({
      userId: user.id,
      username: user.username,
      action: 'password_recovery_requested',
      moduleKey: 'auth',
      entityType: 'user',
      entityId: user.id,
      details: { requestId },
      ipAddress: req.ip || req.headers['x-forwarded-for'] || null
    });

    return res.json({
      success: true,
      message: 'Se o email/nome de usuário estiver cadastrado, você receberá um link de recuperação.'
    });
  } catch (error) {
    console.error(`[password-recovery][${requestId}]`, error.message);
    return res.status(500).json({
      success: false,
      error: 'Erro ao processar solicitação de recuperação'
    });
  }
});

app.get('/api/auth/validar-token/:token', passwordTokenValidationLimiter, async (req, res) => {
  try {
    const { token } = req.params;
    if (!token || String(token).trim().length < 20) {
      return res.status(400).json({ success: false, error: 'Token inválido ou expirado' });
    }

    const tokenData = await db.validarTokenRecuperacao(String(token).trim());
    if (!tokenData) {
      return res.status(400).json({ success: false, error: 'Token inválido ou expirado' });
    }

    return res.json({
      success: true,
      valid: true,
      username: tokenData.username
    });
  } catch (error) {
    return res.status(500).json({ success: false, error: 'Erro ao validar token' });
  }
});

app.post('/api/auth/resetar-senha', passwordResetLimiter, async (req, res) => {
  const requestId = req.headers['x-request-id'] || crypto.randomUUID();
  try {
    const { token, novaSenha } = req.body || {};

    if (!token || !novaSenha) {
      return res.status(400).json({ success: false, error: 'Token e nova senha são obrigatórios' });
    }

    if (String(novaSenha).length < 6) {
      return res.status(400).json({ success: false, error: 'A nova senha deve ter pelo menos 6 caracteres' });
    }

    const hashedPassword = await bcrypt.hash(String(novaSenha), 10);
    const updatedUser = await db.resetarSenhaComToken(String(token).trim(), hashedPassword);

    await db.createActivityLog({
      userId: updatedUser.userId,
      username: updatedUser.username,
      action: 'password_reset_completed',
      moduleKey: 'auth',
      entityType: 'user',
      entityId: updatedUser.userId,
      details: { requestId },
      ipAddress: req.ip || req.headers['x-forwarded-for'] || null
    });

    return res.json({
      success: true,
      message: 'Senha redefinida com sucesso!'
    });
  } catch (error) {
    const isTokenError = error.message === 'Token inválido ou expirado';
    const statusCode = isTokenError ? 400 : 500;
    const safeMessage = isTokenError ? error.message : 'Erro ao redefinir senha';
    console.error(`[password-reset][${requestId}]`, error.message);
    return res.status(statusCode).json({
      success: false,
      error: safeMessage
    });
  }
});

app.get('/api/modules-catalog', authenticateToken, async (req, res) => {
  try {
    const catalog = await db.getModulesCatalog();
    const activeModules = catalog.filter((module) => module.isActive !== false);
    return res.json({ success: true, data: activeModules });
  } catch (error) {
    return res.status(500).json({ success: false, error: 'Erro ao carregar catálogo de módulos' });
  }
});

// API do próprio usuário autenticado
app.get('/api/user/profile', authenticateToken, async (req, res) => {
  try {
    const profile = await db.getUserProfileById(req.user.id);
    if (!profile) {
      return res.status(404).json({ success: false, error: 'Usuário não encontrado' });
    }

    return res.json({
      success: true,
      data: profile
    });
  } catch (error) {
    return res.status(500).json({ success: false, error: 'Erro interno do servidor' });
  }
});

app.post('/api/user/upload-photo', authenticateToken, uploadAvatar.single('photo'), (req, res) => {
  fs.appendFileSync('multer_debug.log', JSON.stringify({
    file: req.file,
    body: req.body
  }) + '\n');
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'Nenhum arquivo enviado' });
    }

    if (req.file.mimetype !== 'image/webp' || !req.file.filename.endsWith('.webp')) {
      if (fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }
      return res.status(400).json({ success: false, error: 'Apenas arquivos WebP são permitidos' });
    }

    const photoUrl = `/api/avatars/${req.file.filename}`;
    return res.json({
      success: true,
      data: { photoUrl }
    });
  } catch (error) {
    if (req.file && fs.existsSync(req.file.path)) {
      try {
        fs.unlinkSync(req.file.path);
      } catch (deleteError) {
        console.log('Erro ao remover arquivo após falha de upload:', deleteError.message);
      }
    }
    return res.status(500).json({ success: false, error: 'Erro ao fazer upload da foto' });
  }
});

app.put('/api/user/profile', authenticateToken, async (req, res) => {
  try {
    const {
      firstName,
      lastName,
      email,
      phone,
      photoUrl,
      password,
      cpf,
      birthDate,
      gender,
      position,
      address
    } = req.body;

    const currentUser = await db.getUserById(req.user.id);
    if (!currentUser) {
      return res.status(404).json({ success: false, error: 'Usuário não encontrado' });
    }

    if (!password) {
      return res.status(400).json({ success: false, error: 'Senha atual é obrigatória para atualizar o perfil' });
    }

    const isValidPassword = await bcrypt.compare(password, currentUser.password);
    if (!isValidPassword) {
      return res.status(401).json({ success: false, error: 'Senha atual incorreta' });
    }

    if (!firstName || String(firstName).trim().length < 2) {
      return res.status(400).json({ success: false, error: 'Nome é obrigatório e deve ter pelo menos 2 caracteres' });
    }
    if (!lastName || String(lastName).trim().length < 2) {
      return res.status(400).json({ success: false, error: 'Sobrenome é obrigatório e deve ter pelo menos 2 caracteres' });
    }
    if (!email || !String(email).trim()) {
      return res.status(400).json({ success: false, error: 'Email é obrigatório' });
    }
    if (!validateEmailFormat(String(email))) {
      return res.status(400).json({ success: false, error: 'Formato de email inválido' });
    }

    const phoneDigits = String(phone || '').replace(/\D/g, '');
    if (phoneDigits.length !== 10 && phoneDigits.length !== 11) {
      return res.status(400).json({ success: false, error: 'Telefone deve ter 10 ou 11 dígitos' });
    }

    const cpfDigits = String(cpf || '').replace(/\D/g, '');
    if (cpfDigits.length !== 11) {
      return res.status(400).json({ success: false, error: 'CPF deve ter 11 dígitos' });
    }

    if (!birthDate) {
      return res.status(400).json({ success: false, error: 'Data de nascimento é obrigatória' });
    }
    if (!gender) {
      return res.status(400).json({ success: false, error: 'Gênero é obrigatório' });
    }
    if (!position || !String(position).trim()) {
      return res.status(400).json({ success: false, error: 'Cargo é obrigatório' });
    }

    if (!address || !address.cep) {
      return res.status(400).json({ success: false, error: 'CEP é obrigatório' });
    }
    const cepDigits = String(address.cep).replace(/\D/g, '');
    if (cepDigits.length !== 8) {
      return res.status(400).json({ success: false, error: 'CEP deve ter 8 dígitos' });
    }
    if (!address.street || !String(address.street).trim()) {
      return res.status(400).json({ success: false, error: 'Rua/Logradouro é obrigatório' });
    }
    if (!address.number || !String(address.number).trim()) {
      return res.status(400).json({ success: false, error: 'Número do endereço é obrigatório' });
    }
    if (!address.neighborhood || !String(address.neighborhood).trim()) {
      return res.status(400).json({ success: false, error: 'Bairro é obrigatório' });
    }
    if (!address.city || !String(address.city).trim()) {
      return res.status(400).json({ success: false, error: 'Cidade é obrigatória' });
    }
    if (!address.state || String(address.state).trim().length !== 2) {
      return res.status(400).json({ success: false, error: 'Estado (UF) é obrigatório e deve ter 2 caracteres' });
    }

    const updateData = {
      firstName: String(firstName).trim(),
      lastName: String(lastName).trim(),
      email: String(email).trim(),
      phone: phoneDigits,
      cpf: cpfDigits,
      birthDate,
      gender: String(gender),
      position: String(position).trim(),
      address: {
        cep: cepDigits,
        street: String(address.street).trim(),
        number: String(address.number).trim(),
        complement: address.complement ? String(address.complement).trim() : '',
        neighborhood: String(address.neighborhood).trim(),
        city: String(address.city).trim(),
        state: String(address.state).trim().toUpperCase()
      }
    };

    if (photoUrl !== undefined) {
      if (currentUser.photo_url && currentUser.photo_url !== photoUrl) {
        deleteAvatarFile(currentUser.photo_url);
      }
      updateData.photoUrl = photoUrl || null;
    }

    const updatedUser = await db.updateUser(req.user.id, updateData);
    const token = jwt.sign(
      { id: updatedUser.id, username: updatedUser.username, role: updatedUser.role },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    return res.json({
      success: true,
      data: mapUserToClient(updatedUser),
      token
    });
  } catch (error) {
    return res.status(500).json({ success: false, error: 'Erro interno do servidor' });
  }
});

// APIs do próprio usuário autenticado
app.put('/api/user/username', authenticateToken, async (req, res) => {
  try {
    const { newUsername, currentPassword } = req.body;

    if (!newUsername || !String(newUsername).trim()) {
      return res.status(400).json({ success: false, error: 'Novo username é obrigatório' });
    }

    if (!currentPassword) {
      return res.status(400).json({ success: false, error: 'Senha atual é obrigatória' });
    }

    const normalizedUsername = String(newUsername).trim();
    if (normalizedUsername.length < 3) {
      return res.status(400).json({ success: false, error: 'Username deve ter pelo menos 3 caracteres' });
    }

    const usernameRegex = /^[a-zA-Z0-9_-]+$/;
    if (!usernameRegex.test(normalizedUsername)) {
      return res.status(400).json({ success: false, error: 'Username inválido. Use apenas letras, números, underscore (_) ou hífen (-)' });
    }

    const currentUser = await db.getUserById(req.user.id);
    if (!currentUser) {
      return res.status(404).json({ success: false, error: 'Usuário não encontrado' });
    }

    const isValidPassword = await bcrypt.compare(currentPassword, currentUser.password);
    if (!isValidPassword) {
      return res.status(401).json({ success: false, error: 'Senha atual incorreta' });
    }

    if (currentUser.username === normalizedUsername) {
      return res.status(400).json({ success: false, error: 'O novo username deve ser diferente do atual' });
    }

    const existingUser = await db.getUserByUsername(normalizedUsername);
    if (existingUser && existingUser.id !== currentUser.id) {
      return res.status(400).json({ success: false, error: 'Username já está em uso' });
    }

    const updatedUser = await db.updateUser(currentUser.id, { username: normalizedUsername });
    const newToken = jwt.sign(
      { id: updatedUser.id, username: updatedUser.username, role: updatedUser.role },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    return res.json({
      success: true,
      message: 'Username alterado com sucesso',
      user: {
        id: updatedUser.id,
        username: updatedUser.username,
        role: updatedUser.role
      },
      token: newToken
    });
  } catch (error) {
    return res.status(500).json({ success: false, error: 'Erro interno do servidor' });
  }
});

app.put('/api/user/password', authenticateToken, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ success: false, error: 'Senha atual e nova senha são obrigatórias' });
    }

    if (String(newPassword).length < 6) {
      return res.status(400).json({ success: false, error: 'A nova senha deve ter pelo menos 6 caracteres' });
    }

    const currentUser = await db.getUserById(req.user.id);
    if (!currentUser) {
      return res.status(404).json({ success: false, error: 'Usuário não encontrado' });
    }

    const isValidPassword = await bcrypt.compare(currentPassword, currentUser.password);
    if (!isValidPassword) {
      return res.status(401).json({ success: false, error: 'Senha atual incorreta' });
    }

    const isSamePassword = await bcrypt.compare(newPassword, currentUser.password);
    if (isSamePassword) {
      return res.status(400).json({ success: false, error: 'A nova senha deve ser diferente da senha atual' });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await db.updateUser(currentUser.id, { password: hashedPassword });

    return res.json({
      success: true,
      message: 'Senha alterada com sucesso'
    });
  } catch (error) {
    return res.status(500).json({ success: false, error: 'Erro interno do servidor' });
  }
});

// Middleware para verificar se o usuário é admin ou superadmin
const requireAdmin = (req, res, next) => {
  if (req.user && (req.user.role === 'admin' || req.user.role === 'superadmin')) {
    next();
  } else {
    res.status(403).json({ error: 'Acesso negado. Apenas administradores podem realizar esta ação.' });
  }
};

// Middleware para verificar se o usuário é superadmin
const requireSuperAdmin = (req, res, next) => {
  if (req.user && req.user.role === 'superadmin') {
    next();
  } else {
    res.status(403).json({ error: 'Acesso negado. Apenas super administradores podem realizar esta ação.' });
  }
};

// Middleware de permissões legais granulares
const requireLegalPermission = (tipo) => (req, res, next) => {
  if (!req.user) return res.status(401).json({ error: 'Não autenticado' });
  const { role, permissoes_legais } = req.user;
  if (role === 'superadmin') return next();
  if (role === 'admin' && permissoes_legais && permissoes_legais[tipo] === true) return next();
  return res.status(403).json({ error: 'Sem permissão para esta operação' });
};

app.post('/api/auth/reset-first-login', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { username } = req.body;
    if (!username) {
      return res.status(400).json({ error: 'Username é obrigatório' });
    }

    const user = await db.getUserByUsername(username);
    if (!user) {
      return res.status(404).json({ error: 'Usuário não encontrado' });
    }

    await db.updateUser(user.id, { lastLogin: null });
    await logActivity(req, {
      action: 'reset_password',
      moduleKey: 'admin',
      entityType: 'user',
      entityId: user.id
    });

    return res.json({
      success: true,
      message: `Primeiro login resetado para o usuário ${username}. Agora você pode fazer login com qualquer senha novamente.`
    });
  } catch (error) {
    return res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

app.post('/api/auth/reset-all-passwords', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const allUsers = await db.getAllUsers();
    let resetCount = 0;

    for (const user of allUsers) {
      await db.updateUser(user.id, { lastLogin: null });
      resetCount += 1;
    }

    await logActivity(req, {
      action: 'reset_all_passwords',
      moduleKey: 'admin',
      entityType: 'system'
    });

    return res.json({
      success: true,
      message: `Senhas resetadas para ${resetCount} usuário(s). Todos os usuários precisarão fazer primeiro login novamente.`,
      resetCount
    });
  } catch (error) {
    return res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// APIs de Módulos (apenas para admins)
app.post('/api/admin/modules/reorder', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { keys } = req.body;
    if (!Array.isArray(keys) || keys.length === 0) {
      return res.status(400).json({ error: 'Array de keys é obrigatório' });
    }
    await db.reorderModules(keys);
    return res.json({ success: true });
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Erro ao reordenar módulos' });
  }
});

app.get('/api/admin/modules', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const modules = await db.getModulesCatalog();
    return res.json({ success: true, data: modules });
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Erro ao buscar módulos' });
  }
});

app.post('/api/admin/modules', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const {
      moduleKey,
      moduleName,
      iconName,
      description,
      routePath,
      isActive
    } = req.body || {};

    const normalizedKey = normalizeModuleKey(moduleKey);
    if (!normalizedKey || normalizedKey.length < 2) {
      return res.status(400).json({ error: 'moduleKey inválido. Use letras, números, "_" ou "-"' });
    }
    if (!moduleName || String(moduleName).trim().length < 2) {
      return res.status(400).json({ error: 'moduleName é obrigatório' });
    }

    const existing = await db.getModuleByKey(normalizedKey);
    if (existing) {
      return res.status(400).json({ error: 'Já existe um módulo com esta chave' });
    }

    const created = await db.createModule({
      moduleKey: normalizedKey,
      moduleName: String(moduleName).trim(),
      iconName: iconName ? String(iconName).trim() : null,
      description: description ? String(description).trim() : null,
      routePath: routePath ? String(routePath).trim() : null,
      isActive: isActive !== false,
      isSystem: false
    });

    await logActivity(req, {
      action: 'create',
      moduleKey: 'admin',
      entityType: 'module',
      entityId: created.moduleKey,
      details: { targetModuleKey: created.moduleKey }
    });

    return res.status(201).json({ success: true, data: created });
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Erro ao criar módulo' });
  }
});

app.put('/api/admin/modules/:moduleKey', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { moduleKey } = req.params;
    const existing = await db.getModuleByKey(moduleKey);
    if (!existing) {
      return res.status(404).json({ error: 'Módulo não encontrado' });
    }

    const updatePayload = {};
    if (req.body.moduleName !== undefined) {
      if (!String(req.body.moduleName).trim()) {
        return res.status(400).json({ error: 'moduleName inválido' });
      }
      updatePayload.moduleName = String(req.body.moduleName).trim();
    }
    if (req.body.moduleKey !== undefined) {
      const normalizedKey = normalizeModuleKey(req.body.moduleKey);
      if (!normalizedKey || normalizedKey.length < 2) {
        return res.status(400).json({ error: 'moduleKey inválido' });
      }
      updatePayload.moduleKey = normalizedKey;
    }
    if (req.body.iconName !== undefined) updatePayload.iconName = req.body.iconName ? String(req.body.iconName).trim() : null;
    if (req.body.description !== undefined) updatePayload.description = req.body.description ? String(req.body.description).trim() : null;
    if (req.body.routePath !== undefined) updatePayload.routePath = req.body.routePath ? String(req.body.routePath).trim() : null;
    if (req.body.isActive !== undefined) updatePayload.isActive = req.body.isActive === true;

    const updated = await db.updateModule(moduleKey, updatePayload);

    await logActivity(req, {
      action: 'edit',
      moduleKey: 'admin',
      entityType: 'module',
      entityId: updated.moduleKey,
      details: { targetModuleKey: updated.moduleKey, previousModuleKey: moduleKey }
    });

    return res.json({ success: true, data: updated });
  } catch (error) {
    const status = /não encontrado/i.test(error.message) ? 404 : 400;
    return res.status(status).json({ error: error.message || 'Erro ao atualizar módulo' });
  }
});

app.delete('/api/admin/modules/:moduleKey', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { moduleKey } = req.params;
    await db.deleteModule(moduleKey);
    await logActivity(req, {
      action: 'delete',
      moduleKey: 'admin',
      entityType: 'module',
      entityId: moduleKey
    });
    return res.json({ success: true, message: 'Módulo removido com sucesso' });
  } catch (error) {
    const status = /sistema|não encontrado/i.test(error.message) ? 400 : 500;
    return res.status(status).json({ error: error.message || 'Erro ao remover módulo' });
  }
});

app.get('/api/admin/activity-log', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const result = await db.getActivityLogs({
      page: req.query.page,
      pageSize: req.query.pageSize,
      userId: req.query.userId,
      moduleKey: req.query.moduleKey,
      action: req.query.action,
      startDate: req.query.startDate,
      endDate: req.query.endDate,
      search: req.query.search
    });
    return res.json({ success: true, ...result });
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Erro ao carregar logs de atividade' });
  }
});

app.get('/api/admin/statistics', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const stats = await db.getAdminStatisticsForPanel();
    return res.json({ success: true, data: stats });
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Erro ao carregar estatísticas' });
  }
});

app.get('/api/admin/statistics/users/:userId', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const logs = await db.getActivityLogs({
      page: req.query.page || 1,
      pageSize: req.query.pageSize || 20,
      userId: req.params.userId
    });
    return res.json({ success: true, ...logs });
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Erro ao carregar estatísticas do usuário' });
  }
});

app.get('/api/admin/statistics/modules/:moduleKey', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const logs = await db.getActivityLogs({
      page: req.query.page || 1,
      pageSize: req.query.pageSize || 20,
      moduleKey: req.params.moduleKey
    });
    return res.json({ success: true, ...logs });
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Erro ao carregar estatísticas do módulo' });
  }
});

app.get('/api/admin/statistics/usage-timeline', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const startDateParam = req.query.startDate ? String(req.query.startDate) : null;
    const endDateParam = req.query.endDate ? String(req.query.endDate) : null;
    const groupBy = req.query.groupBy ? String(req.query.groupBy) : 'day';

    if (startDateParam) {
      const endDate = endDateParam || new Date().toISOString().split('T')[0];
      const timeline = await db.getUsageTimelineByDateRange(startDateParam, endDate, groupBy);
      return res.json({ success: true, data: timeline });
    }

    const days = Math.min(Math.max(Number(req.query.days) || 30, 1), 180);
    const timeline = await db.getUsageTimeline(days);
    return res.json({
      success: true,
      data: timeline.map((item) => ({
        date: item.day,
        count: item.total
      }))
    });
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Erro ao carregar timeline de uso' });
  }
});

// APIs de Gerenciamento de Usuários (apenas para admins)
// GET /api/users - Listar todos os usuários
app.get('/api/users', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const users = await db.getAllUsers();
    // Remover senha e mapear campos snake_case -> camelCase
    const usersWithoutPasswords = users.map(user => ({
      id: user.id,
      username: user.username,
      role: user.role,
      firstName: user.first_name ?? null,
      lastName: user.last_name ?? null,
      email: user.email ?? null,
      phone: user.phone ?? null,
      cpf: user.cpf ?? null,
      birthDate: user.birth_date ?? null,
      gender: user.gender ?? null,
      address: parseAddress(user.address),
      position: user.position ?? null,
      isActive: user.is_active !== false,
      createdAt: user.created_at || user.createdAt || null,
      updatedAt: user.updated_at || user.updatedAt || null
    }));
    res.json({ success: true, data: usersWithoutPasswords });
  } catch (error) {
    res.status(500).json({ error: 'Erro ao buscar usuários' });
  }
});

// POST /api/users - Criar novo usuário
app.post('/api/users', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { username, role } = req.body;

    if (!username || !role) {
      return res.status(400).json({ error: 'Username e role são obrigatórios' });
    }

    // Validar role
    const validRoles = ['admin', 'user', 'guest', 'superadmin'];
    if (!validRoles.includes(role)) {
      return res.status(400).json({ error: 'Role inválido. Use: admin, user, guest ou superadmin' });
    }

    // Verificar se o usuário já existe
    const existingUser = await db.getUserByUsername(username);
    if (existingUser) {
      return res.status(400).json({ error: 'Usuário já existe' });
    }

    // Placeholder de primeiro login (igual ao alya)
    const placeholderPassword = await bcrypt.hash('FIRST_LOGIN_PLACEHOLDER', 10);

    // Criar usuário
    const newUser = await db.saveUser({
      username,
      password: placeholderPassword,
      role,
      lastLogin: null
    });

    // Remover senha antes de enviar
    const { password: _, ...userWithoutPassword } = newUser;
    res.status(201).json({ success: true, data: userWithoutPassword });
    await logActivity(req, {
      action: 'create',
      moduleKey: 'admin',
      entityType: 'user',
      entityId: newUser.id
    });
  } catch (error) {
    res.status(500).json({ error: 'Erro ao criar usuário: ' + error.message });
  }
});

// PUT /api/users/:id - Atualizar usuário
app.put('/api/users/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const {
      username,
      password,
      role,
      isActive,
      firstName,
      lastName,
      email,
      phone,
      position,
      cpf,
      birthDate,
      gender,
      address
    } = req.body;

    // Validar role se fornecido
    if (role) {
      const validRoles = ['admin', 'user', 'guest', 'superadmin'];
      if (!validRoles.includes(role)) {
        return res.status(400).json({ error: 'Role inválido. Use: admin, user, guest ou superadmin' });
      }
    }

    // Preparar dados para atualização
    const updateData = {};
    if (username) updateData.username = username;
    if (role) updateData.role = role;
    if (typeof isActive === 'boolean') {
      if (req.user.id === id && isActive === false) {
        return res.status(400).json({ error: 'Você não pode desativar seu próprio usuário' });
      }
      updateData.isActive = isActive;
    }
    if (firstName !== undefined) updateData.firstName = firstName;
    if (lastName !== undefined) updateData.lastName = lastName;
    if (email !== undefined) updateData.email = email;
    if (phone !== undefined) updateData.phone = phone;
    if (position !== undefined) updateData.position = position;
    if (cpf !== undefined) updateData.cpf = cpf;
    if (birthDate !== undefined) updateData.birthDate = birthDate;
    if (gender !== undefined) updateData.gender = gender;
    if (address !== undefined) updateData.address = address;
    if (password) {
      updateData.password = await bcrypt.hash(password, 10);
    }

    // Verificar se está tentando mudar o username para um que já existe
    if (username) {
      const existingUser = await db.getUserByUsername(username);
      if (existingUser && existingUser.id !== id) {
        return res.status(400).json({ error: 'Username já está em uso' });
      }
    }

    // Atualizar usuário
    const updatedUser = await db.updateUser(id, updateData);

    if (role) {
      const defaultModuleKeys = db.getDefaultModuleKeysByRole(role);
      const accessLevel = db.getDefaultAccessLevelByRole(role);
      await db.setUserModulePermissions(id, defaultModuleKeys, accessLevel);
    }

    // Remover senha antes de enviar
    const { password: _, ...safeUser } = updatedUser;
    res.json({
      success: true,
      data: {
        id: safeUser.id,
        username: safeUser.username,
        role: safeUser.role,
        firstName: safeUser.first_name ?? null,
        lastName: safeUser.last_name ?? null,
        email: safeUser.email ?? null,
        phone: safeUser.phone ?? null,
        cpf: safeUser.cpf ?? null,
        birthDate: safeUser.birth_date ?? null,
        gender: safeUser.gender ?? null,
        address: parseAddress(safeUser.address),
        position: safeUser.position ?? null,
        isActive: safeUser.is_active !== false,
        createdAt: safeUser.created_at || null,
        updatedAt: safeUser.updated_at || null
      }
    });
    await logActivity(req, {
      action: 'edit',
      moduleKey: 'admin',
      entityType: 'user',
      entityId: id,
      details: { fields: Object.keys(updateData) }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/users/:id/modules - Listar módulos e permissões do usuário
app.get('/api/users/:id/modules', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const targetUser = await db.getUserById(id);
    if (!targetUser) {
      return res.status(404).json({ error: 'Usuário não encontrado' });
    }

    const catalog = await db.getModulesCatalog();
    const userModules = await db.getUserModulePermissions(id);
    const enabledSet = new Set(userModules.map((item) => item.moduleKey));

    const data = catalog.map((module) => ({
      moduleKey: module.moduleKey,
      moduleName: module.moduleName,
      enabled: enabledSet.has(module.moduleKey)
    }));

    return res.json({ success: true, data });
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Erro ao carregar módulos do usuário' });
  }
});

// PUT /api/users/:id/modules - Atualizar módulos de acesso do usuário
app.put('/api/users/:id/modules', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { moduleKeys } = req.body;

    if (!Array.isArray(moduleKeys)) {
      return res.status(400).json({ error: 'moduleKeys deve ser um array' });
    }

    const targetUser = await db.getUserById(id);
    if (!targetUser) {
      return res.status(404).json({ error: 'Usuário não encontrado' });
    }

    const catalog = await db.getModulesCatalog();
    const validKeys = new Set(catalog.map((item) => item.moduleKey));
    const filteredKeys = [...new Set(moduleKeys)].filter((key) => validKeys.has(key));

    await db.setUserModulePermissions(id, filteredKeys, 'view');
    await logActivity(req, {
      action: 'permission_change',
      moduleKey: 'admin',
      entityType: 'user_modules',
      entityId: id,
      details: { moduleCount: filteredKeys.length }
    });

    return res.json({ success: true, message: 'Módulos atualizados com sucesso' });
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Erro ao atualizar módulos do usuário' });
  }
});

// POST /api/users/:id/reset-password - Resetar senha de usuário
app.post('/api/users/:id/reset-password', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const targetUser = await db.getUserById(id);

    if (!targetUser) {
      return res.status(404).json({ error: 'Usuário não encontrado' });
    }

    const temporaryPassword = crypto.randomBytes(6).toString('base64url').slice(0, 10);
    const hashedPassword = await bcrypt.hash(temporaryPassword, 10);
    await db.updateUser(id, { password: hashedPassword });
    await logActivity(req, {
      action: 'reset_password',
      moduleKey: 'admin',
      entityType: 'user',
      entityId: id
    });

    return res.json({
      success: true,
      message: 'Senha resetada com sucesso',
      temporaryPassword
    });
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Erro ao resetar senha' });
  }
});

// DELETE /api/users/:id - Excluir usuário
app.delete('/api/users/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    // Não permitir que o admin exclua a si mesmo
    if (req.user.id === id) {
      return res.status(400).json({ error: 'Você não pode excluir seu próprio usuário' });
    }

    await db.deleteUser(id);
    res.json({ success: true, message: 'Usuário excluído com sucesso' });
    await logActivity(req, {
      action: 'delete',
      moduleKey: 'admin',
      entityType: 'user',
      entityId: id
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Rota de teste
app.get('/api/test', async (req, res) => {
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
app.delete('/api/clear-all-projection-data', authenticateToken, async (req, res) => {
  try {
    console.log('Endpoint de limpeza de dados chamado')
    const result = await db.clearAllProjectionData()

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

// ═══════════════════════════════════════════════════════════════════════════════
// REFRESH TOKEN
// ═══════════════════════════════════════════════════════════════════════════════

app.post('/api/auth/refresh', async (req, res) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) {
      return res.status(400).json({ success: false, error: 'refreshToken é obrigatório' });
    }

    const rotated = await rotateRefreshToken(
      refreshToken,
      req.ip,
      req.headers['user-agent']
    );

    if (!rotated) {
      return res.status(401).json({ success: false, error: 'Refresh token inválido ou expirado' });
    }

    const accessToken = jwt.sign(
      { id: rotated.userId, username: rotated.username, role: rotated.role },
      JWT_SECRET,
      { expiresIn: '15m' }
    );

    return res.json({ success: true, token: accessToken, refreshToken: rotated.token });
  } catch (error) {
    console.error('Erro ao renovar token:', error);
    return res.status(500).json({ success: false, error: 'Erro interno do servidor' });
  }
});

app.post('/api/auth/logout', authenticateToken, async (req, res) => {
  try {
    const { refreshToken } = req.body;
    if (refreshToken) {
      const tokenData = await verifyRefreshToken(refreshToken);
      if (tokenData) {
        await revokeSessionByRefreshTokenId(tokenData.id, 'Logout do usuário');
        const { revokeRefreshToken } = require('./utils/refresh-tokens');
        await revokeRefreshToken(refreshToken);
      }
    }
    await logAudit({
      operation: AUDIT_OPERATIONS.LOGOUT,
      userId: req.user.id,
      username: req.user.username,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      status: AUDIT_STATUS.SUCCESS,
    });
    return res.json({ success: true, message: 'Logout realizado com sucesso' });
  } catch (error) {
    console.error('Erro no logout:', error);
    return res.status(500).json({ success: false, error: 'Erro interno do servidor' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// SESSÕES ATIVAS
// ═══════════════════════════════════════════════════════════════════════════════

app.get('/api/sessions', authenticateToken, async (req, res) => {
  try {
    const isSuperAdmin = req.user.role === 'superadmin';
    const sessions = await getAllSessions(!isSuperAdmin);
    return res.json({ success: true, sessions });
  } catch (error) {
    console.error('Erro ao listar sessões:', error);
    return res.status(500).json({ success: false, error: 'Erro interno do servidor' });
  }
});

app.delete('/api/sessions/:id', authenticateToken, async (req, res) => {
  try {
    await revokeSession(req.params.id, 'Revogada pelo usuário');
    return res.json({ success: true, message: 'Sessão encerrada com sucesso' });
  } catch (error) {
    console.error('Erro ao revogar sessão:', error);
    return res.status(500).json({ success: false, error: 'Erro interno do servidor' });
  }
});

app.delete('/api/sessions', authenticateToken, async (req, res) => {
  try {
    const { currentRefreshTokenId } = req.body;
    const count = await revokeAllUserSessions(
      req.user.id,
      'Todas as sessões encerradas pelo usuário',
      currentRefreshTokenId || null
    );
    return res.json({ success: true, message: `${count} sessão(ões) encerrada(s)` });
  } catch (error) {
    console.error('Erro ao revogar todas as sessões:', error);
    return res.status(500).json({ success: false, error: 'Erro interno do servidor' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// ANOMALIAS E ALERTAS DE SEGURANÇA
// ═══════════════════════════════════════════════════════════════════════════════

app.get('/api/anomalies', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { Pool } = require('pg');
    const pool = new Pool({
      host: process.env.DB_HOST || 'localhost',
      port: process.env.DB_PORT || 5432,
      database: process.env.DB_NAME,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
    });
    const limit = Math.min(parseInt(req.query.limit) || 50, 200);
    const offset = parseInt(req.query.offset) || 0;
    const result = await pool.query(
      `SELECT * FROM audit_logs
       WHERE operation = 'anomaly_detected'
       ORDER BY timestamp DESC
       LIMIT $1 OFFSET $2`,
      [limit, offset]
    );
    pool.end();
    return res.json({ success: true, anomalies: result.rows });
  } catch (error) {
    console.error('Erro ao listar anomalias:', error);
    return res.status(500).json({ success: false, error: 'Erro interno do servidor' });
  }
});

app.get('/api/security-alerts', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { Pool } = require('pg');
    const pool = new Pool({
      host: process.env.DB_HOST || 'localhost',
      port: process.env.DB_PORT || 5432,
      database: process.env.DB_NAME,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
    });
    const limit = Math.min(parseInt(req.query.limit) || 50, 200);
    const offset = parseInt(req.query.offset) || 0;
    const result = await pool.query(
      `SELECT * FROM audit_logs
       WHERE operation = 'security_alert'
       ORDER BY timestamp DESC
       LIMIT $1 OFFSET $2`,
      [limit, offset]
    );
    pool.end();
    return res.json({ success: true, alerts: result.rows });
  } catch (error) {
    console.error('Erro ao listar alertas de segurança:', error);
    return res.status(500).json({ success: false, error: 'Erro interno do servidor' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// IMPERSONATION (REPRESENTAÇÃO DE USUÁRIO)
// ═══════════════════════════════════════════════════════════════════════════════

app.post('/api/auth/impersonate/:userId', authenticateToken, requireSuperAdmin, async (req, res) => {
  try {
    const targetUser = await db.getUserById(req.params.userId);
    if (!targetUser) {
      return res.status(404).json({ success: false, error: 'Usuário não encontrado' });
    }
    if (targetUser.role === 'superadmin') {
      return res.status(403).json({ success: false, error: 'Não é possível representar outro superadmin' });
    }

    const impersonationToken = jwt.sign(
      {
        id: targetUser.id,
        username: targetUser.username,
        role: targetUser.role,
        impersonatedBy: req.user.id,
        impersonatedByUsername: req.user.username,
      },
      JWT_SECRET,
      { expiresIn: '2h' }
    );

    await logAudit({
      operation: AUDIT_OPERATIONS.IMPERSONATION_START,
      userId: req.user.id,
      username: req.user.username,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      details: { targetUserId: targetUser.id, targetUsername: targetUser.username },
      status: AUDIT_STATUS.SUCCESS,
    });

    return res.json({
      success: true,
      token: impersonationToken,
      impersonatedUser: {
        id: targetUser.id,
        username: targetUser.username,
        role: targetUser.role,
      }
    });
  } catch (error) {
    console.error('Erro ao iniciar impersonation:', error);
    return res.status(500).json({ success: false, error: 'Erro interno do servidor' });
  }
});

app.post('/api/auth/impersonate/stop', authenticateToken, async (req, res) => {
  try {
    const { originalToken } = req.body;
    if (!originalToken) {
      return res.status(400).json({ success: false, error: 'originalToken é obrigatório' });
    }

    let originalUser;
    try {
      originalUser = jwt.verify(originalToken, JWT_SECRET);
    } catch {
      return res.status(401).json({ success: false, error: 'Token original inválido' });
    }

    if (originalUser.role !== 'superadmin') {
      return res.status(403).json({ success: false, error: 'Token original não pertence a um superadmin' });
    }

    await logAudit({
      operation: AUDIT_OPERATIONS.IMPERSONATION_STOP,
      userId: originalUser.id,
      username: originalUser.username,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      details: { stoppedImpersonating: req.user.username },
      status: AUDIT_STATUS.SUCCESS,
    });

    return res.json({ success: true, token: originalToken, user: originalUser });
  } catch (error) {
    console.error('Erro ao encerrar impersonation:', error);
    return res.status(500).json({ success: false, error: 'Erro interno do servidor' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// INTEGRAÇÃO ASAAS
// ═══════════════════════════════════════════════════════════════════════════════

const { fetchReceivedPayments, fetchDoneTransfers } = require('./utils/asaas-client');

// Sincronização manual: busca entradas e saídas e salva no banco
app.post('/api/asaas/sync', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { since } = req.body; // ex: "2025-01-01" — se omitido, busca tudo

    const [payments, transfers] = await Promise.all([
      fetchReceivedPayments(since || null),
      fetchDoneTransfers(since || null),
    ]);

    let inserted = 0;
    let skipped = 0;

    for (const tx of [...payments, ...transfers]) {
      const saved = await db.saveAsaasTransaction(tx);
      if (saved) inserted++;
      else skipped++;
    }

    console.log(`[Asaas Sync] ${inserted} inseridas, ${skipped} já existiam`);
    return res.json({ success: true, inserted, skipped, total: payments.length + transfers.length });
  } catch (error) {
    console.error('[Asaas Sync] Erro:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

// Webhook: recebe eventos em tempo real do Asaas
app.post('/api/webhooks/asaas', async (req, res) => {
  try {
    const token = req.headers['asaas-access-token'] || req.headers['authorization'];
    if (process.env.ASAAS_WEBHOOK_TOKEN && token !== process.env.ASAAS_WEBHOOK_TOKEN) {
      return res.status(401).json({ success: false, error: 'Token inválido' });
    }

    const { event, payment, transfer } = req.body;

    if (event === 'PAYMENT_RECEIVED' && payment) {
      const tx = {
        asaas_id: payment.id,
        asaas_type: 'payment',
        date: payment.paymentDate || payment.clientPaymentDate || payment.dateCreated,
        description: `[Asaas] ${payment.description || payment.billingType || 'Pagamento'} - ${payment.invoiceNumber || payment.id}`,
        value: parseFloat(payment.netValue || payment.value),
        type: 'Receita',
        category: 'Recebimento Asaas',
        subcategory: payment.billingType || 'Outro',
      };
      await db.saveAsaasTransaction(tx);
      console.log(`[Asaas Webhook] Entrada registrada: ${payment.id} — R$ ${tx.value}`);
    }

    if (event === 'TRANSFER_DONE' && transfer) {
      const destName = transfer.bankAccount?.ownerName || 'Destinatário';
      const operationType = transfer.operationType || 'PIX';
      const tx = {
        asaas_id: transfer.id,
        asaas_type: 'transfer',
        date: transfer.effectiveDate || transfer.dateCreated,
        description: `[Asaas] ${operationType} para ${destName}`,
        value: Math.abs(parseFloat(transfer.value)),
        type: 'Despesa',
        category: 'Transferência Asaas',
        subcategory: operationType,
      };
      await db.saveAsaasTransaction(tx);
      console.log(`[Asaas Webhook] Saída registrada: ${transfer.id} — R$ ${tx.value}`);
    }

    return res.json({ success: true });
  } catch (error) {
    console.error('[Asaas Webhook] Erro:', error);
    return res.status(500).json({ success: false });
  }
});

// ============================================================
// FEEDBACK
// ============================================================

// POST /api/feedback — usuário envia um feedback
app.post('/api/feedback', authenticateToken, async (req, res) => {
  try {
    const { categoria, descricao, imagemBase64, linkVideo, pagina } = req.body;

    if (!categoria || !['duvida', 'melhoria', 'sugestao', 'critica'].includes(categoria)) {
      return res.status(400).json({ success: false, error: 'Categoria inválida.' });
    }
    if (!descricao || descricao.trim().length < 20) {
      return res.status(400).json({ success: false, error: 'Descrição deve ter pelo menos 20 caracteres.' });
    }
    if (descricao.trim().length > 1000) {
      return res.status(400).json({ success: false, error: 'Descrição deve ter no máximo 1000 caracteres.' });
    }
    if (linkVideo && linkVideo.trim()) {
      const l = linkVideo.toLowerCase();
      if (!l.includes('drive.google.com') && !l.includes('docs.google.com')) {
        return res.status(400).json({ success: false, error: 'Link de vídeo deve ser do Google Drive.' });
      }
    }

    const feedback = await db.criarFeedback({
      usuarioId: req.user.id,
      categoria,
      descricao: descricao.trim(),
      imagemBase64: imagemBase64 || null,
      linkVideo: linkVideo?.trim() || null,
      pagina: pagina || null,
    });

    await logActivity(req, { action: 'create', moduleKey: 'feedback', entityType: 'feedback', entityId: feedback.id, details: { categoria } });

    res.status(201).json({ success: true, data: feedback });
  } catch (error) {
    console.error('Erro ao criar feedback:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/admin/feedbacks — listar todos (admin + superadmin)
app.get('/api/admin/feedbacks', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const feedbacks = await db.obterFeedbacks();
    res.json({ success: true, data: feedbacks });
  } catch (error) {
    console.error('Erro ao buscar feedbacks:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/admin/feedbacks/:id/responder — superadmin responde
app.post('/api/admin/feedbacks/:id/responder', authenticateToken, requireSuperAdmin, async (req, res) => {
  try {
    const { mensagem } = req.body;
    if (!mensagem || mensagem.trim().length < 10) {
      return res.status(400).json({ success: false, error: 'A mensagem deve ter pelo menos 10 caracteres.' });
    }

    const feedback = await db.obterFeedbackPorId(req.params.id);
    if (feedback.status !== 'pendente') {
      return res.status(400).json({ success: false, error: 'Este feedback já foi respondido ou aceito.' });
    }

    const atualizado = await db.responderFeedback(req.params.id, { resposta: mensagem.trim() });

    await logActivity(req, { action: 'update', moduleKey: 'feedback', entityType: 'feedback', entityId: req.params.id, details: { acao: 'responder' } });

    // Enviar email ao usuário
    if (process.env.SENDGRID_API_KEY && feedback.usuarioEmail) {
      try {
        const sgMail = require('@sendgrid/mail');
        sgMail.setApiKey(process.env.SENDGRID_API_KEY);
        const nomeUsuario = feedback.usuarioNome || feedback.usuarioEmail;
        await sgMail.send({
          to: feedback.usuarioEmail,
          from: { email: process.env.SENDGRID_FROM_EMAIL, name: process.env.SENDGRID_FROM_NAME || 'IMPGEO' },
          subject: 'Seu feedback foi respondido — IMPGEO',
          html: `
            <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;background:#fff;border-radius:8px;border:1px solid #e2e8f0;padding:32px;">
              <div style="text-align:center;margin-bottom:24px;">
                <h2 style="color:#1e293b;margin:0;">Seu feedback foi respondido</h2>
              </div>
              <p style="color:#475569;font-size:15px;line-height:1.6;">Olá <strong>${nomeUsuario}</strong>,</p>
              <p style="color:#475569;font-size:15px;line-height:1.6;">Nossa equipe analisou seu feedback e enviou uma resposta:</p>
              <div style="background:#f8fafc;border-left:4px solid #1d4ed8;border-radius:4px;padding:16px;margin:20px 0;">
                <p style="color:#1e293b;font-size:14px;margin:0;line-height:1.6;white-space:pre-wrap;">${mensagem.trim()}</p>
              </div>
              <p style="color:#64748b;font-size:13px;"><strong>Seu feedback original (${feedback.categoria}):</strong><br/>${feedback.descricao}</p>
              <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0;"/>
              <p style="color:#94a3b8;font-size:12px;text-align:center;">Este é um e-mail automático. Por favor, não responda.</p>
            </div>
          `,
        });
      } catch (sgError) {
        console.error('Erro ao enviar e-mail de resposta de feedback:', sgError?.response?.body || sgError);
      }
    }

    res.json({ success: true, data: atualizado });
  } catch (error) {
    console.error('Erro ao responder feedback:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/admin/feedbacks/:id/aceitar — superadmin aceita + notifica usuário
app.post('/api/admin/feedbacks/:id/aceitar', authenticateToken, requireSuperAdmin, async (req, res) => {
  try {
    const { mensagem } = req.body;
    if (!mensagem || mensagem.trim().length < 10) {
      return res.status(400).json({ success: false, error: 'A mensagem deve ter pelo menos 10 caracteres.' });
    }

    const feedback = await db.obterFeedbackPorId(req.params.id);
    if (feedback.status !== 'pendente') {
      return res.status(400).json({ success: false, error: 'Este feedback já foi respondido ou aceito.' });
    }

    const atualizado = await db.aceitarFeedback(req.params.id, { resposta: mensagem.trim() });

    await logActivity(req, { action: 'update', moduleKey: 'feedback', entityType: 'feedback', entityId: req.params.id, details: { acao: 'aceitar' } });

    // Enviar email ao usuário
    if (process.env.SENDGRID_API_KEY && feedback.usuarioEmail) {
      try {
        const sgMail = require('@sendgrid/mail');
        sgMail.setApiKey(process.env.SENDGRID_API_KEY);
        const nomeUsuario = feedback.usuarioNome || feedback.usuarioEmail;
        await sgMail.send({
          to: feedback.usuarioEmail,
          from: { email: process.env.SENDGRID_FROM_EMAIL, name: process.env.SENDGRID_FROM_NAME || 'IMPGEO' },
          subject: '✅ Seu feedback foi aceito — IMPGEO',
          html: `
            <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;background:#fff;border-radius:8px;border:1px solid #e2e8f0;padding:32px;">
              <div style="text-align:center;margin-bottom:24px;">
                <h2 style="color:#1e293b;margin:0;">Seu feedback foi aceito!</h2>
              </div>
              <p style="color:#475569;font-size:15px;line-height:1.6;">Olá <strong>${nomeUsuario}</strong>,</p>
              <p style="color:#475569;font-size:15px;line-height:1.6;">Ótima notícia! Sua sugestão foi analisada e <strong style="color:#16a34a;">aceita</strong> pela nossa equipe.</p>
              <div style="background:#f0fdf4;border-left:4px solid #16a34a;border-radius:4px;padding:16px;margin:20px 0;">
                <p style="color:#166534;font-size:14px;font-weight:bold;margin:0 0 8px 0;">Mensagem da equipe:</p>
                <p style="color:#1e293b;font-size:14px;margin:0;line-height:1.6;white-space:pre-wrap;">${mensagem.trim()}</p>
              </div>
              <p style="color:#64748b;font-size:13px;"><strong>Seu feedback original (${feedback.categoria}):</strong><br/>${feedback.descricao}</p>
              <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0;"/>
              <p style="color:#94a3b8;font-size:12px;text-align:center;">Este é um e-mail automático. Por favor, não responda.</p>
            </div>
          `,
        });
      } catch (sgError) {
        console.error('Erro ao enviar e-mail de aceite de feedback:', sgError?.response?.body || sgError);
      }
    }

    res.json({ success: true, data: atualizado });
  } catch (error) {
    console.error('Erro ao aceitar feedback:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ─── FAQ ──────────────────────────────────────────────────────────────────────

// GET /api/faq — público (sem autenticação), apenas itens ativos
app.get('/api/faq', async (req, res) => {
  try {
    const items = await db.obterFAQ();
    res.json({ success: true, data: items });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/admin/faq — todos os itens (admin + superadmin)
app.get('/api/admin/faq', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const items = await db.obterFAQAdmin();
    res.json({ success: true, data: items });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/admin/faq — criar novo item
app.post('/api/admin/faq', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { pergunta, resposta } = req.body;
    if (!pergunta || !pergunta.trim() || !resposta || !resposta.trim()) {
      return res.status(400).json({ success: false, error: 'Pergunta e resposta são obrigatórias' });
    }
    const item = await db.criarFAQ({ pergunta: pergunta.trim(), resposta: resposta.trim() });
    await logActivity(req, { action: 'create', moduleKey: 'faq', entityType: 'FAQ', entityId: item.id, details: { pergunta: item.pergunta } });
    res.status(201).json({ success: true, data: item });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// PUT /api/admin/faq/ordem — atualizar ordem em lote (deve vir ANTES de /:id)
app.put('/api/admin/faq/ordem', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { faqIds } = req.body;
    if (!Array.isArray(faqIds)) {
      return res.status(400).json({ success: false, error: 'faqIds deve ser um array' });
    }
    await db.atualizarOrdemFAQ(faqIds);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// PUT /api/admin/faq/:id — atualizar item
app.put('/api/admin/faq/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const item = await db.atualizarFAQ(req.params.id, req.body);
    await logActivity(req, { action: 'update', moduleKey: 'faq', entityType: 'FAQ', entityId: req.params.id, details: req.body });
    res.json({ success: true, data: item });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// DELETE /api/admin/faq/:id — deletar item
app.delete('/api/admin/faq/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const item = await db.deletarFAQ(req.params.id);
    await logActivity(req, { action: 'delete', moduleKey: 'faq', entityType: 'FAQ', entityId: req.params.id, details: { pergunta: item.pergunta } });
    res.json({ success: true, data: item });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ─── LEGAL (LGPD) ─────────────────────────────────────────────────────────────

const SANITIZE_OPTIONS = {
  allowedTags: sanitizeHtml.defaults.allowedTags.concat(['h1', 'h2', 'h3', 'u', 's', 'img']),
  allowedAttributes: { '*': ['class', 'style'], 'a': ['href', 'target'], 'img': ['src', 'alt'] },
};

// Rotas públicas
app.get('/api/termos-uso', async (req, res) => {
  try {
    const data = await db.obterTermosUso();
    res.json({ success: true, data });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.get('/api/politica-privacidade', async (req, res) => {
  try {
    const data = await db.obterPoliticaPrivacidade();
    res.json({ success: true, data });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.get('/api/cookie-banner-config', async (req, res) => {
  try {
    const data = await db.obterCookieBannerConfig();
    res.json({ success: true, data });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.get('/api/cookie-categorias', async (req, res) => {
  try {
    const data = await db.obterCookieCategorias(true);
    res.json({ success: true, data });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// Consentimento (usuário autenticado)
app.get('/api/cookie-consentimento', authenticateToken, async (req, res) => {
  try {
    const data = await db.obterConsentimentoUsuario(req.user.id);
    res.json({ success: true, data });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.post('/api/cookie-consentimento', authenticateToken, async (req, res) => {
  try {
    const { preferencias, versaoTermos = 1, versaoPolitica = 1 } = req.body;
    if (!preferencias || typeof preferencias !== 'object') {
      return res.status(400).json({ success: false, error: 'Preferências inválidas' });
    }
    const safePrefs = {};
    for (const [k, v] of Object.entries(preferencias)) {
      if (typeof v === 'boolean') safePrefs[k] = v;
    }
    await db.salvarConsentimentoUsuario(req.user.id, safePrefs, versaoTermos, versaoPolitica, req.ip, req.headers['user-agent']);
    await logAudit({ operation: AUDIT_OPERATIONS.LEGAL_CONSENTIMENTO_UPDATE, userId: req.user.id, username: req.user.username, ipAddress: req.ip, userAgent: req.headers['user-agent'], details: { preferencias: safePrefs } });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// Rotas admin — Termos de Uso
app.get('/api/admin/termos-uso', authenticateToken, requireLegalPermission('termos_uso'), async (req, res) => {
  try {
    const data = await db.obterTermosUsoAdmin();
    res.json({ success: true, data });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.put('/api/admin/termos-uso', authenticateToken, requireLegalPermission('termos_uso'), async (req, res) => {
  try {
    const { conteudo } = req.body;
    if (!conteudo || typeof conteudo !== 'string') return res.status(400).json({ success: false, error: 'Conteúdo obrigatório' });
    if (conteudo.length > 100000) return res.status(400).json({ success: false, error: 'Conteúdo muito longo' });
    const clean = sanitizeHtml(conteudo, SANITIZE_OPTIONS);
    const data = await db.atualizarTermosUso(clean, req.user.id);
    await logAudit({ operation: AUDIT_OPERATIONS.LEGAL_TERMOS_UPDATE, userId: req.user.id, username: req.user.username, ipAddress: req.ip, userAgent: req.headers['user-agent'], details: { versao: data.versao } });
    res.json({ success: true, data });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// Rotas admin — Política de Privacidade
app.get('/api/admin/politica-privacidade', authenticateToken, requireLegalPermission('politica_privacidade'), async (req, res) => {
  try {
    const data = await db.obterPoliticaPrivacidadeAdmin();
    res.json({ success: true, data });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.put('/api/admin/politica-privacidade', authenticateToken, requireLegalPermission('politica_privacidade'), async (req, res) => {
  try {
    const { conteudo } = req.body;
    if (!conteudo || typeof conteudo !== 'string') return res.status(400).json({ success: false, error: 'Conteúdo obrigatório' });
    if (conteudo.length > 100000) return res.status(400).json({ success: false, error: 'Conteúdo muito longo' });
    const clean = sanitizeHtml(conteudo, SANITIZE_OPTIONS);
    const data = await db.atualizarPoliticaPrivacidade(clean, req.user.id);
    await logAudit({ operation: AUDIT_OPERATIONS.LEGAL_POLITICA_UPDATE, userId: req.user.id, username: req.user.username, ipAddress: req.ip, userAgent: req.headers['user-agent'], details: { versao: data.versao } });
    res.json({ success: true, data });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// Rotas admin — Cookie Banner Config
app.get('/api/admin/cookie-banner-config', authenticateToken, requireLegalPermission('cookies'), async (req, res) => {
  try {
    const data = await db.obterCookieBannerConfig();
    res.json({ success: true, data });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.put('/api/admin/cookie-banner-config', authenticateToken, requireLegalPermission('cookies'), async (req, res) => {
  try {
    const { titulo, texto, textoBotaoAceitar, textoBotaoRejeitar, textoBotaoPersonalizar, textoDescricaoGerenciamento } = req.body;
    if (!titulo || !texto) return res.status(400).json({ success: false, error: 'Título e texto são obrigatórios' });
    const data = await db.atualizarCookieBannerConfig({ titulo, texto, textoBotaoAceitar, textoBotaoRejeitar, textoBotaoPersonalizar, textoDescricaoGerenciamento });
    await logAudit({ operation: AUDIT_OPERATIONS.LEGAL_COOKIES_CONFIG_UPDATE, userId: req.user.id, username: req.user.username, ipAddress: req.ip, userAgent: req.headers['user-agent'], details: {} });
    res.json({ success: true, data });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// Rotas admin — Cookie Categorias
app.get('/api/admin/cookie-categorias', authenticateToken, requireLegalPermission('cookies'), async (req, res) => {
  try {
    const data = await db.obterCookieCategorias(false);
    res.json({ success: true, data });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.post('/api/admin/cookie-categorias', authenticateToken, requireLegalPermission('cookies'), async (req, res) => {
  try {
    const { chave, nome, descricao, ativo, obrigatorio, ordem } = req.body;
    if (!chave || !nome || !descricao) return res.status(400).json({ success: false, error: 'Chave, nome e descrição são obrigatórios' });
    const data = await db.criarCookieCategoria({ chave, nome, descricao, ativo, obrigatorio, ordem });
    await logAudit({ operation: AUDIT_OPERATIONS.LEGAL_COOKIES_CATEGORIA_CREATE, userId: req.user.id, username: req.user.username, ipAddress: req.ip, userAgent: req.headers['user-agent'], details: { chave } });
    res.status(201).json({ success: true, data });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.put('/api/admin/cookie-categorias/:id', authenticateToken, requireLegalPermission('cookies'), async (req, res) => {
  try {
    const data = await db.atualizarCookieCategoria(req.params.id, req.body);
    await logAudit({ operation: AUDIT_OPERATIONS.LEGAL_COOKIES_CATEGORIA_UPDATE, userId: req.user.id, username: req.user.username, ipAddress: req.ip, userAgent: req.headers['user-agent'], details: { id: req.params.id } });
    res.json({ success: true, data });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.delete('/api/admin/cookie-categorias/:id', authenticateToken, requireLegalPermission('cookies'), async (req, res) => {
  try {
    await db.deletarCookieCategoria(req.params.id);
    await logAudit({ operation: AUDIT_OPERATIONS.LEGAL_COOKIES_CATEGORIA_DELETE, userId: req.user.id, username: req.user.username, ipAddress: req.ip, userAgent: req.headers['user-agent'], details: { id: req.params.id } });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// Rota superadmin — Permissões Legais por usuário
app.get('/api/admin/permissoes-legais/:userId', authenticateToken, requireSuperAdmin, async (req, res) => {
  try {
    const data = await db.obterPermissoesLegais(req.params.userId);
    res.json({ success: true, data });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.put('/api/admin/permissoes-legais/:userId', authenticateToken, requireSuperAdmin, async (req, res) => {
  try {
    const { permissoes } = req.body;
    if (!permissoes || typeof permissoes !== 'object') return res.status(400).json({ success: false, error: 'Permissões inválidas' });
    const data = await db.atualizarPermissoesLegais(req.params.userId, permissoes);
    await logAudit({ operation: AUDIT_OPERATIONS.LEGAL_PERMISSAO_UPDATE, userId: req.user.id, username: req.user.username, ipAddress: req.ip, userAgent: req.headers['user-agent'], details: { targetUserId: req.params.userId, permissoes: data } });
    res.json({ success: true, data });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// ============================================================
// DOCUMENTAÇÃO
// ============================================================

app.get('/api/documentation/public', async (req, res) => {
  try {
    const data = await db.obterDocumentacao();
    res.json({ success: true, data });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.get('/api/documentation', authenticateToken, async (req, res) => {
  try {
    const data = await db.obterDocumentacao();
    res.json({ success: true, data });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.post('/api/admin/documentation/sections', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { title } = req.body;
    if (!title?.trim()) return res.status(400).json({ success: false, error: 'Título obrigatório' });
    const data = await db.criarDocSection({ title: title.trim() });
    res.json({ success: true, data });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.put('/api/admin/documentation/sections/reorder', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { ids } = req.body;
    if (!Array.isArray(ids)) return res.status(400).json({ success: false, error: 'ids deve ser um array' });
    await db.reordenarDocSections(ids);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.put('/api/admin/documentation/sections/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { title } = req.body;
    if (!title?.trim()) return res.status(400).json({ success: false, error: 'Título obrigatório' });
    const data = await db.atualizarDocSection(req.params.id, { title: title.trim() });
    res.json({ success: true, data });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.delete('/api/admin/documentation/sections/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    await db.deletarDocSection(req.params.id);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.post('/api/admin/documentation/sections/:sectionId/pages', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { title, content } = req.body;
    if (!title?.trim()) return res.status(400).json({ success: false, error: 'Título obrigatório' });
    const data = await db.criarDocPage(req.params.sectionId, { title: title.trim(), content: content || '' });
    res.json({ success: true, data });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.put('/api/admin/documentation/pages/reorder', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { ids } = req.body;
    if (!Array.isArray(ids)) return res.status(400).json({ success: false, error: 'ids deve ser um array' });
    await db.reordenarDocPages(ids);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.put('/api/admin/documentation/pages/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { title, content } = req.body;
    if (!title?.trim()) return res.status(400).json({ success: false, error: 'Título obrigatório' });
    const data = await db.atualizarDocPage(req.params.id, { title: title.trim(), content: content ?? '' });
    res.json({ success: true, data });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.delete('/api/admin/documentation/pages/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    await db.deletarDocPage(req.params.id);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// ========== ROTAS DO ROADMAP ==========

// Configurações do roadmap
app.get('/api/admin/roadmap/config', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const config = await db.getRoadmapConfig();
    res.json(config);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/admin/roadmap/config', authenticateToken, requireSuperAdmin, async (req, res) => {
  try {
    const config = await db.updateRoadmapConfig(req.body);
    await logActivity(req, { action: 'update', moduleKey: 'roadmap', entityType: 'roadmap_config', entityId: config.id, details: req.body });
    res.json(config);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Colunas do roadmap
app.get('/api/admin/roadmap/colunas', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const colunas = await db.getRoadmapColunas();
    res.json(colunas);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/admin/roadmap/colunas', authenticateToken, requireSuperAdmin, async (req, res) => {
  try {
    const { label, cor, corFundo } = req.body;
    if (!label) return res.status(400).json({ error: 'Nome da coluna é obrigatório' });
    const coluna = await db.createRoadmapColuna({ label, cor, corFundo });
    await logActivity(req, { action: 'create', moduleKey: 'roadmap', entityType: 'roadmap_coluna', entityId: coluna.id, details: { label } });
    res.status(201).json(coluna);
  } catch (error) {
    console.error('[Roadmap] Erro ao criar coluna:', error);
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/admin/roadmap/colunas/ordem', authenticateToken, requireSuperAdmin, async (req, res) => {
  try {
    const { colunas } = req.body;
    await db.updateRoadmapColunasOrdem(colunas);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/admin/roadmap/colunas/:id', authenticateToken, requireSuperAdmin, async (req, res) => {
  try {
    const result = await db.deleteRoadmapColuna(req.params.id);
    await logActivity(req, { action: 'delete', moduleKey: 'roadmap', entityType: 'roadmap_coluna', entityId: req.params.id, details: { label: result.label } });
    res.json({ success: true });
  } catch (error) {
    console.error('[Roadmap] Erro ao deletar coluna:', error);
    res.status(500).json({ error: error.message });
  }
});

// Listar todos os itens (admin + superadmin)
app.get('/api/admin/roadmap', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const items = await db.getRoadmapItems();
    res.json(items);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Criar item (superadmin only) — deve vir antes de /:id
app.post('/api/admin/roadmap', authenticateToken, requireSuperAdmin, async (req, res) => {
  try {
    const { titulo, descricao, status, prioridade, dataInicio, dependeDe } = req.body;
    if (!titulo) return res.status(400).json({ error: 'Título é obrigatório' });
    const item = await db.createRoadmapItem({
      titulo, descricao, status, prioridade, dataInicio, dependeDe,
      createdBy: req.user.id,
    });
    await logActivity(req, { action: 'create', moduleKey: 'roadmap', entityType: 'roadmap', entityId: item.id, details: { titulo } });
    res.status(201).json(item);
  } catch (error) {
    console.error('[Roadmap] Erro ao criar item:', error);
    res.status(500).json({ error: error.message });
  }
});

// Atualizar ordem em lote (superadmin only) — deve vir antes de /:id
app.put('/api/admin/roadmap/ordem', authenticateToken, requireSuperAdmin, async (req, res) => {
  try {
    const { itens } = req.body;
    if (!Array.isArray(itens)) return res.status(400).json({ error: 'itens deve ser um array' });
    await db.updateRoadmapOrdem(itens);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Buscar item por ID (admin + superadmin)
app.get('/api/admin/roadmap/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const item = await db.getRoadmapItemById(req.params.id);
    if (!item) return res.status(404).json({ error: 'Item não encontrado' });
    res.json(item);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Atualizar item (superadmin only)
app.put('/api/admin/roadmap/:id', authenticateToken, requireSuperAdmin, async (req, res) => {
  try {
    const item = await db.updateRoadmapItem(req.params.id, req.body);
    await logActivity(req, { action: 'update', moduleKey: 'roadmap', entityType: 'roadmap', entityId: req.params.id, details: req.body });
    res.json(item);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Mudar status (superadmin only)
app.put('/api/admin/roadmap/:id/status', authenticateToken, requireSuperAdmin, async (req, res) => {
  try {
    const { status } = req.body;
    if (!status) return res.status(400).json({ error: 'Status é obrigatório' });
    const item = await db.updateRoadmapItemStatus(req.params.id, status);
    res.json(item);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Deletar item (superadmin only)
app.delete('/api/admin/roadmap/:id', authenticateToken, requireSuperAdmin, async (req, res) => {
  try {
    const item = await db.deleteRoadmapItem(req.params.id);
    await logActivity(req, { action: 'delete', moduleKey: 'roadmap', entityType: 'roadmap', entityId: req.params.id, details: { titulo: item.titulo } });
    res.json(item);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Iniciar timer (superadmin only)
app.post('/api/admin/roadmap/:id/iniciar-tempo', authenticateToken, requireSuperAdmin, async (req, res) => {
  try {
    const item = await db.iniciarTempoRoadmap(req.params.id);
    res.json(item);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Pausar timer (superadmin only)
app.post('/api/admin/roadmap/:id/pausar-tempo', authenticateToken, requireSuperAdmin, async (req, res) => {
  try {
    const item = await db.pausarTempoRoadmap(req.params.id);
    res.json(item);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Parar timer (superadmin only)
app.post('/api/admin/roadmap/:id/parar-tempo', authenticateToken, requireSuperAdmin, async (req, res) => {
  try {
    const { tempoDecorrido } = req.body;
    const item = await db.pararTempoRoadmap(req.params.id, tempoDecorrido);
    res.json(item);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ─── RODAPÉ ──────────────────────────────────────────────────────────────────

// Pública: retorna dados do rodapé para o componente Footer
app.get('/api/rodape', async (req, res) => {
  try {
    const data = await db.obterRodapeCompleto();
    res.json({ success: true, data });
  } catch (err) {
    res.json({ success: true, data: { configuracoes: {}, colunas: [], bottomLinks: [] } });
  }
});

// Admin: dados completos para o painel
app.get('/api/admin/rodape', authenticateToken, requireSuperAdmin, async (req, res) => {
  try {
    const data = await db.obterRodapeCompleto();
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Config: salvar chave/valor
app.put('/api/admin/rodape/config/:chave', authenticateToken, requireSuperAdmin, async (req, res) => {
  try {
    const { chave } = req.params;
    const { valor } = req.body;
    await db.atualizarRodapeConfig(chave, valor);
    await logActivity(req, { action: 'UPDATE', entity: 'rodape_config', details: `chave=${chave}` });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Colunas
app.get('/api/admin/rodape/colunas', authenticateToken, requireSuperAdmin, async (req, res) => {
  try {
    const colunas = await db.obterRodapeColunas();
    res.json({ success: true, data: colunas });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/admin/rodape/colunas', authenticateToken, requireSuperAdmin, async (req, res) => {
  try {
    const { titulo } = req.body;
    if (!titulo?.trim()) return res.status(400).json({ success: false, error: 'Título obrigatório.' });
    const coluna = await db.criarRodapeColuna(titulo.trim());
    await logActivity(req, { action: 'CREATE', entity: 'rodape_coluna', details: titulo });
    res.json({ success: true, data: coluna });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.put('/api/admin/rodape/colunas/ordem', authenticateToken, requireSuperAdmin, async (req, res) => {
  try {
    const { colunaIds } = req.body;
    if (!Array.isArray(colunaIds)) return res.status(400).json({ success: false, error: 'colunaIds deve ser um array.' });
    await db.atualizarOrdemColunas(colunaIds);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.put('/api/admin/rodape/colunas/:id', authenticateToken, requireSuperAdmin, async (req, res) => {
  try {
    const { titulo } = req.body;
    const coluna = await db.atualizarRodapeColuna(req.params.id, titulo);
    await logActivity(req, { action: 'UPDATE', entity: 'rodape_coluna', details: req.params.id });
    res.json({ success: true, data: coluna });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.delete('/api/admin/rodape/colunas/:id', authenticateToken, requireSuperAdmin, async (req, res) => {
  try {
    await db.deletarRodapeColuna(req.params.id);
    await logActivity(req, { action: 'DELETE', entity: 'rodape_coluna', details: req.params.id });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Links
app.post('/api/admin/rodape/links', authenticateToken, requireSuperAdmin, async (req, res) => {
  try {
    const { coluna_id, texto, link, eh_link } = req.body;
    if (!texto?.trim()) return res.status(400).json({ success: false, error: 'Texto obrigatório.' });
    const saved = await db.criarRodapeLink({ coluna_id, texto: texto.trim(), link: link || '', eh_link });
    await logActivity(req, { action: 'CREATE', entity: 'rodape_link', details: texto });
    res.json({ success: true, data: saved });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.put('/api/admin/rodape/links/ordem', authenticateToken, requireSuperAdmin, async (req, res) => {
  try {
    const { linkIds } = req.body;
    if (!Array.isArray(linkIds)) return res.status(400).json({ success: false, error: 'linkIds deve ser um array.' });
    await db.atualizarOrdemLinks(linkIds);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.put('/api/admin/rodape/links/:id', authenticateToken, requireSuperAdmin, async (req, res) => {
  try {
    const { texto, link, eh_link, coluna_id } = req.body;
    const saved = await db.atualizarRodapeLink(req.params.id, { texto, link, eh_link, coluna_id });
    await logActivity(req, { action: 'UPDATE', entity: 'rodape_link', details: req.params.id });
    res.json({ success: true, data: saved });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.delete('/api/admin/rodape/links/:id', authenticateToken, requireSuperAdmin, async (req, res) => {
  try {
    await db.deletarRodapeLink(req.params.id);
    await logActivity(req, { action: 'DELETE', entity: 'rodape_link', details: req.params.id });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Bottom links
app.get('/api/admin/rodape/bottom-links', authenticateToken, requireSuperAdmin, async (req, res) => {
  try {
    const data = await db.obterRodapeBottomLinksAdmin();
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/admin/rodape/bottom-links', authenticateToken, requireSuperAdmin, async (req, res) => {
  try {
    const { texto, link, ativo } = req.body;
    if (!texto?.trim()) return res.status(400).json({ success: false, error: 'Texto obrigatório.' });
    const saved = await db.criarRodapeBottomLink({ texto: texto.trim(), link: link || '', ativo });
    res.json({ success: true, data: saved });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.put('/api/admin/rodape/bottom-links/ordem', authenticateToken, requireSuperAdmin, async (req, res) => {
  try {
    const { linkIds } = req.body;
    if (!Array.isArray(linkIds)) return res.status(400).json({ success: false, error: 'linkIds deve ser um array.' });
    await db.atualizarOrdemBottomLinks(linkIds);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.put('/api/admin/rodape/bottom-links/:id', authenticateToken, requireSuperAdmin, async (req, res) => {
  try {
    const { texto, link, ativo } = req.body;
    const saved = await db.atualizarRodapeBottomLink(req.params.id, { texto, link, ativo });
    res.json({ success: true, data: saved });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.delete('/api/admin/rodape/bottom-links/:id', authenticateToken, requireSuperAdmin, async (req, res) => {
  try {
    await db.deletarRodapeBottomLink(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Commit pendente
app.get('/api/admin/rodape/commit-pendente', authenticateToken, requireSuperAdmin, async (req, res) => {
  try {
    const data = await db.obterCommitPendente();
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/admin/rodape/confirmar-commit', authenticateToken, requireSuperAdmin, async (req, res) => {
  try {
    const { action, novaVersao, mensagem, data, commitHash, rolesNotificados } = req.body;
    if (!['manter', 'nova_versao', 'ignorar'].includes(action)) {
      return res.status(400).json({ success: false, error: 'action inválido.' });
    }
    if (action !== 'ignorar' && !mensagem?.trim()) {
      return res.status(400).json({ success: false, error: 'mensagem obrigatória.' });
    }
    await db.confirmarCommit({ action, novaVersao, mensagem, data, commitHash, rolesNotificados: rolesNotificados || [] });
    await logActivity(req, { action: 'UPDATE', entity: 'rodape_commit', details: `action=${action}` });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Notificação de nova versão
app.get('/api/notificacao-versao', authenticateToken, async (req, res) => {
  try {
    const data = await db.obterNotificacaoVersao(req.user.id, req.user.role);
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/notificacao-versao/vista', authenticateToken, async (req, res) => {
  try {
    const { versao } = req.body;
    if (!versao) return res.status(400).json({ success: false, error: 'versao obrigatória.' });
    await db.marcarVersaoVista(req.user.id, versao);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Iniciar servidor
app.listen(port, () => {
  console.log(`🚀 Servidor rodando na porta ${port}`);
  console.log(`📡 API disponível em http://localhost:${port}`);
  console.log(`🧪 Teste a API em http://localhost:${port}/api/test`);

  const cleanupIntervalMs = PASSWORD_RESET_CLEANUP_INTERVAL_MINUTES * 60 * 1000;
  const timer = setInterval(async () => {
    try {
      const removed = await db.cleanupExpiredPasswordResetTokens();
      if (removed > 0) {
        console.log(`[password-reset] limpeza automática removeu ${removed} token(s)`);
      }
    } catch (error) {
      console.log('[password-reset] erro na limpeza automática:', error.message);
    }
  }, cleanupIntervalMs);
  if (typeof timer.unref === 'function') {
    timer.unref();
  }

  // Monitoramento de anomalias a cada 15 minutos
  startAnomalyMonitoring(15);

  // Cleanup de sessões e refresh tokens expirados (a cada hora)
  const securityCleanupTimer = setInterval(async () => {
    try {
      await cleanupExpiredSessions();
      await cleanupExpiredTokens();
    } catch (error) {
      console.log('[security-cleanup] erro na limpeza automática:', error.message);
    }
  }, 60 * 60 * 1000);
  if (typeof securityCleanupTimer.unref === 'function') {
    securityCleanupTimer.unref();
  }

  // Sync automático Asaas a cada hora
  if (process.env.ASAAS_API_KEY) {
    const asaasSyncTimer = setInterval(async () => {
      try {
        const since = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString().split('T')[0]; // últimas 2h
        const [payments, transfers] = await Promise.all([
          fetchReceivedPayments(since),
          fetchDoneTransfers(since),
        ]);
        let inserted = 0;
        for (const tx of [...payments, ...transfers]) {
          const saved = await db.saveAsaasTransaction(tx);
          if (saved) inserted++;
        }
        if (inserted > 0) console.log(`[Asaas Auto-Sync] ${inserted} nova(s) transação(ões) importada(s)`);
      } catch (error) {
        console.error('[Asaas Auto-Sync] Erro:', error.message);
      }
    }, 60 * 60 * 1000); // a cada 1 hora
    if (typeof asaasSyncTimer.unref === 'function') asaasSyncTimer.unref();
    console.log('🔄 Asaas: sync automático ativado (a cada 1 hora)');
  }
});
