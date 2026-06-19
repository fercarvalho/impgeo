require('dotenv').config();
const express = require('express');
const multer = require('multer');
const XLSX = require('xlsx');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { rateLimit, ipKeyGenerator } = require('express-rate-limit');
const helmet = require('helmet');
const hpp = require('hpp');
const xss = require('xss-clean');
const mongoSanitize = require('express-mongo-sanitize');
const sanitizeHtml = require('sanitize-html');
const { z } = require('zod');
const Database = require('./database-pg');
const push = require('./services/push');
const pushDispatcher = require('./services/push-dispatcher');
const {
  enviarEmailRecuperacao,
  enviarEmailTcRegistroAprovado,
  enviarEmailTcRegistroEditado,
  enviarEmailImpgeoTcRecordCriado,
  enviarEmailImpgeoTcRecordEditado,
} = require('./services/email');
const { parseExtrato } = require('./services/extratoParser');
const { logAudit, AUDIT_OPERATIONS, AUDIT_STATUS } = require('./utils/audit');
const { createRefreshToken, verifyRefreshToken, rotateRefreshToken, revokeAllUserTokens, cleanupExpiredTokens } = require('./utils/refresh-tokens');
const { createSession, revokeSession, revokeAllUserSessions, getAllSessions, revokeSessionByRefreshTokenId, cleanupExpiredSessions } = require('./utils/session-manager');
const { startAnomalyMonitoring } = require('./utils/anomaly-detection');
const requireTerraControlAccess = require('./auth/require-terracontrol-access');
const emailService = require('./services/email');

const app = express();
const port = 9001;
const db = new Database();
push.init(process.env);

// Serviço de orçamentos TerraControl + dispatcher (migration 040).
// Injetados como dependências pra facilitar testes e quebra de ciclo.
const abacatepay = require('./services/abacatepay');
const budgetService = require('./services/budget-service')(db);
const budgetDispatcher = require('./services/budget-dispatcher')({
  db,
  pushDispatcher,
  emailService,
  publicUrls: {
    tcPublic: process.env.TC_PUBLIC_URL,
    impgeoPublic: process.env.IMPGEO_PUBLIC_URL,
  },
});
// PM (Gerenciamento de Projetos) — services stateless: recebem `db` por parâmetro.
const pmTemplateService = require('./services/pm/template-service');
const pmProjectService = require('./services/pm/project-service');
const pmTaskService = require('./services/pm/task-service');
const pmPomodoroService = require('./services/pm/pomodoro-service');
const pmHelpService = require('./services/pm/help-service');
const pmReportService = require('./services/pm/report-service');
const pmCostService = require('./services/pm/cost-service');
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

// Após a fase 1.3 (subsistemas) o frontend é acessado por múltiplos subdomínios:
//   *.impgeo.local em dev, *.impgeo.sistemas.viverdepj.com.br em prod.
// Com o update tc_users (migration 025/026) entraram 2 hosts novos:
//   terracontrol.viverdepj.com.br (login público tc_user)
//   admin.terracontrol.viverdepj.com.br (atalho impgeo admin → módulo TerraControl)
// Origem precisa ser permitida dinamicamente.
const isAllowedSubsystemOrigin = (origin) => {
  if (!origin) return false;
  // dev: http(s)://(qualquer-coisa.)impgeo.local(:port)
  if (/^https?:\/\/([a-z0-9-]+\.)?impgeo\.local(?::\d+)?$/.test(origin)) return true;
  // prod: https://(qualquer-coisa.)impgeo.sistemas.viverdepj.com.br
  if (/^https:\/\/([a-z0-9-]+\.)?impgeo\.sistemas\.viverdepj\.com\.br$/.test(origin)) return true;
  // dev: http(s)://(admin.)?terracontrol.local(:port)
  if (/^https?:\/\/(admin\.)?terracontrol\.local(?::\d+)?$/.test(origin)) return true;
  // prod: https://(admin.)?terracontrol.viverdepj.com.br
  if (/^https:\/\/(admin\.)?terracontrol\.viverdepj\.com\.br$/.test(origin)) return true;
  return false;
};

app.use(cors({
  origin: (origin, cb) => {
    if (!origin) return cb(null, true); // requisições same-origin / CLI / curl
    if (corsOrigins.includes(origin) || isAllowedSubsystemOrigin(origin)) {
      return cb(null, true);
    }
    return cb(new Error(`Origin not allowed by CORS: ${origin}`));
  },
  credentials: true
}));

app.use(cookieParser());

// Helpers para cookies de auth (fase 1.3+ — subsistemas).
//
// Domain do cookie é resolvido dinamicamente a partir do Host do request,
// para que o mesmo backend sirva tanto localhost quanto *.impgeo.local quanto
// produção sem reconfigurar .env por ambiente.
//
// Override manual: COOKIE_DOMAIN no .env tem prioridade absoluta (útil para
// debug ou cenários estranhos de proxy). Caso contrário:
//   - hostname termina em .impgeo.local                       → '.impgeo.local'
//   - hostname termina em .impgeo.sistemas.viverdepj.com.br   → '.impgeo.sistemas.viverdepj.com.br'
//   - localhost / 127.0.0.1 / outros                          → undefined (cookie vinculado ao host)
//
// Para que req.hostname reflita o host original do navegador (e não o do proxy
// do Vite), o vite.config.ts usa proxy com `changeOrigin: false`.
const resolveCookieDomain = (req) => {
  if (process.env.COOKIE_DOMAIN) return process.env.COOKIE_DOMAIN;
  const hostname = (req.hostname || '').toLowerCase();
  if (hostname === 'impgeo.local' || hostname.endsWith('.impgeo.local')) {
    return '.impgeo.local';
  }
  if (hostname === 'impgeo.sistemas.viverdepj.com.br' || hostname.endsWith('.impgeo.sistemas.viverdepj.com.br')) {
    return '.impgeo.sistemas.viverdepj.com.br';
  }
  return undefined; // cookie vinculado ao host (ex.: localhost)
};
const getAuthCookieOptions = (req) => ({
  httpOnly: true,
  secure: req.secure || req.headers['x-forwarded-proto'] === 'https',
  sameSite: 'lax',
  domain: resolveCookieDomain(req),
  path: '/'
});
const ACCESS_TOKEN_MAX_AGE  = 24 * 60 * 60 * 1000;       // 24h
const REFRESH_TOKEN_MAX_AGE = 7  * 24 * 60 * 60 * 1000;  // 7d
const setAuthCookies = (req, res, accessToken, refreshToken) => {
  const opts = getAuthCookieOptions(req);
  res.cookie('accessToken', accessToken, { ...opts, maxAge: ACCESS_TOKEN_MAX_AGE });
  if (refreshToken) {
    res.cookie('refreshToken', refreshToken, { ...opts, maxAge: REFRESH_TOKEN_MAX_AGE });
  }
};
const clearAuthCookies = (req, res) => {
  const opts = getAuthCookieOptions(req);
  res.clearCookie('accessToken',  opts);
  res.clearCookie('refreshToken', opts);
};

// === TC AUTH COOKIES =========================================================
// Cookies do TerraControl ficam em domínio separado (.terracontrol.*) e com
// NOMES diferentes (tcAccessToken, tcRefreshToken) — assim coexistem com os
// cookies do impgeo no mesmo browser sem nunca colidirem. O Domain é resolvido
// dinamicamente pelo Host original (mesmo motivo do impgeo: changeOrigin: false
// no Vite proxy preserva isso em dev).
const resolveTcCookieDomain = (req) => {
  if (process.env.TC_COOKIE_DOMAIN) return process.env.TC_COOKIE_DOMAIN;
  const hostname = (req.hostname || '').toLowerCase();
  if (hostname === 'terracontrol.local' || hostname.endsWith('.terracontrol.local')) {
    return '.terracontrol.local';
  }
  if (hostname === 'terracontrol.viverdepj.com.br' || hostname.endsWith('.terracontrol.viverdepj.com.br')) {
    return '.terracontrol.viverdepj.com.br';
  }
  return undefined;
};
const getTcCookieOptions = (req) => ({
  httpOnly: true,
  secure: req.secure || req.headers['x-forwarded-proto'] === 'https',
  sameSite: 'lax',
  domain: resolveTcCookieDomain(req),
  path: '/'
});
const setTcAuthCookies = (req, res, accessToken, refreshToken) => {
  const opts = getTcCookieOptions(req);
  res.cookie('tcAccessToken', accessToken, { ...opts, maxAge: ACCESS_TOKEN_MAX_AGE });
  if (refreshToken) {
    res.cookie('tcRefreshToken', refreshToken, { ...opts, maxAge: REFRESH_TOKEN_MAX_AGE });
  }
};
const clearTcAuthCookies = (req, res) => {
  const opts = getTcCookieOptions(req);
  res.clearCookie('tcAccessToken',  opts);
  res.clearCookie('tcRefreshToken', opts);
};

// === TC-ADMIN COOKIES ========================================================
// tc-admin (admin.terracontrol.viverdepj.com.br) faz login via /api/auth/
// login-terracontrol-admin (auth do impgeo). Como o cookie principal do impgeo
// tem Domain=.impgeo.*, ele NÃO alcança o origin terracontrol. PR #5 (PWA):
// emitimos um cookie ADICIONAL específico — `tcAdminAccessToken` /
// `tcAdminRefreshToken` — com Domain=.terracontrol.*, pra que a sessão
// persista corretamente em PWA standalone (iOS limpa sessionStorage entre
// fechamentos do app, mas cookie httpOnly persiste).
//
// extractAccessToken (middleware impgeo) lê este cookie como fallback do
// accessToken principal, então o admin shell continua autenticado normalmente.
const resolveTcAdminCookieDomain = (req) => {
  if (process.env.TC_ADMIN_COOKIE_DOMAIN) return process.env.TC_ADMIN_COOKIE_DOMAIN;
  const hostname = (req.hostname || '').toLowerCase();
  if (hostname === 'terracontrol.local' || hostname.endsWith('.terracontrol.local')) {
    return '.terracontrol.local';
  }
  if (hostname === 'terracontrol.viverdepj.com.br' || hostname.endsWith('.terracontrol.viverdepj.com.br')) {
    return '.terracontrol.viverdepj.com.br';
  }
  return undefined;
};
const getTcAdminCookieOptions = (req) => ({
  httpOnly: true,
  secure: req.secure || req.headers['x-forwarded-proto'] === 'https',
  sameSite: 'lax',
  domain: resolveTcAdminCookieDomain(req),
  path: '/'
});
const setTcAdminAuthCookies = (req, res, accessToken, refreshToken) => {
  // Só emite quando o request veio do domínio terracontrol — senão o browser
  // rejeita o Set-Cookie por Domain mismatch e seria gritaria à toa.
  if (!resolveTcAdminCookieDomain(req)) return;
  const opts = getTcAdminCookieOptions(req);
  res.cookie('tcAdminAccessToken', accessToken, { ...opts, maxAge: ACCESS_TOKEN_MAX_AGE });
  if (refreshToken) {
    res.cookie('tcAdminRefreshToken', refreshToken, { ...opts, maxAge: REFRESH_TOKEN_MAX_AGE });
  }
};
const clearTcAdminAuthCookies = (req, res) => {
  if (!resolveTcAdminCookieDomain(req)) return;
  const opts = getTcAdminCookieOptions(req);
  res.clearCookie('tcAdminAccessToken',  opts);
  res.clearCookie('tcAdminRefreshToken', opts);
};

app.use(mongoSanitize());
app.use(xss());
app.use(hpp());
// `verify` preserva o buffer original em req.rawBody. Usado pra validar
// HMAC de webhooks (AbacatePay no /api/webhooks/abacatepay). JSON.parse
// normal continua funcionando — req.body fica disponível como sempre.
app.use(express.json({
  verify: (req, _res, buf) => {
    req.rawBody = buf;
  },
}));

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

// Rate limiters para endpoints públicos de share link (G2.3).
// validate-password é o alvo crítico: cada chamada faz bcrypt.compare (custo alto)
// e pode ser usado para brute force de senha. Limite agressivo por IP+token.
// Key inclui token para impedir que atacante mude de link e mantenha o pool.
// ipKeyGenerator normaliza IPv6 (zera bits do host conforme RFC 4291) — é
// obrigatório em express-rate-limit v8 quando o keyGenerator é customizado.
// Usar req.ip cru permitiria que um atacante IPv6 trocasse o sufixo /64 a
// cada requisição e burlasse o rate limit.
const sharePasswordLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => `${ipKeyGenerator(req)}:${req.params?.token || ''}`,
  message: {
    success: false,
    error: 'Muitas tentativas de senha. Aguarde alguns minutos antes de tentar novamente.'
  }
});

// GET público: limite moderado, evita scraping em massa e DoS leve.
const sharePublicLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => `${ipKeyGenerator(req)}:${req.params?.token || ''}`,
  message: {
    success: false,
    error: 'Muitas requisições. Aguarde alguns minutos.'
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

// O handler GET /api/documents/:filename foi movido para depois da
// declaração de optionalAuth (mais abaixo no arquivo) — ele é registrado
// junto às outras rotas públicas de TerraControl.

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
    canManageTcUsers: (user.canManageTcUsers ?? user.can_manage_tc_users) === true,
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

// Lê o access token de header Authorization OU cookie httpOnly.
// Header tem prioridade para que impersonation continue funcionando: durante
// impersonation o frontend manda o impersonatedToken no header explicitamente,
// enquanto o cookie ainda tem o token original — a request precisa usar o do
// header. Em fluxo normal, o frontend recém-logado tem ambos com o mesmo token,
// e após F5 (sem state em memória) o header vai como "Bearer null"/"Bearer undefined"
// e cai para o cookie automaticamente.
const extractAccessToken = (req) => {
  const authHeader = req.headers['authorization'];
  const headerToken = authHeader && authHeader.split(' ')[1];
  const isValidHeaderToken =
    headerToken &&
    headerToken !== 'null' &&
    headerToken !== 'undefined' &&
    headerToken.length > 10;
  if (isValidHeaderToken) return headerToken;
  if (req.cookies) {
    // PR #5 (PWA): tcAdminAccessToken existe em admin.terracontrol.* e contém
    // o mesmo JWT do impgeo (emitido por login-terracontrol-admin). Tratado
    // como fallback do accessToken padrão.
    return req.cookies.accessToken || req.cookies.tcAdminAccessToken;
  }
  return undefined;
};

// Middleware de autenticação
const authenticateToken = (req, res, next) => {
  if (req.user) return next();

  const token = extractAccessToken(req);

  if (!token) {
    return res.status(401).json({ error: 'Token de acesso requerido' });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      // 401 (não 403): cliente sabe que é problema de auth e dispara refresh
      return res.status(401).json({ error: 'Token inválido ou expirado' });
    }
    req.user = user;
    next();
  });
};

// Middleware de auth opcional — preenche req.user se token válido, mas não bloqueia sem token
const optionalAuth = (req, res, next) => {
  const token = extractAccessToken(req);
  if (!token) return next();
  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (!err) req.user = user;
    next();
  });
};

const publicApiRoutes = [
  '/auth/login',
  '/auth/recuperar-senha',
  '/auth/resetar-senha',
  '/faq',
  '/cookie-banner-config',
  '/cookie-categorias',
  '/rodape'
];

const publicApiPrefixes = [
  '/avatars',
  '/documents',
  '/auth/validar-token/',
  '/auth/login-terracontrol-admin',
  '/terracontrol/public',
  '/tc-auth/',                  // tc_user login/refresh/recuperar/resetar; rotas protegidas usam authenticateTcUser internamente
  '/modelo/',
  '/webhooks/',
  '/documentation/public'
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

// PM Fase 6: storage de anexos de tarefas (qualquer tipo, até 10MB).
const pmAttachmentsDir = path.join(__dirname, 'uploads', 'pm');
const pmAttachmentStorage = multer.diskStorage({
  destination: function (req, file, cb) {
    if (!fs.existsSync(pmAttachmentsDir)) fs.mkdirSync(pmAttachmentsDir, { recursive: true });
    cb(null, pmAttachmentsDir);
  },
  filename: function (req, file, cb) {
    const ext = path.extname(file.originalname);
    cb(null, `pm-${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`);
  }
});
const uploadPmAttachment = multer({ storage: pmAttachmentStorage, limits: { fileSize: 10 * 1024 * 1024 } });

// Função para processar dados de transações
function processTransactions(worksheet) {
  const data = XLSX.utils.sheet_to_json(worksheet);
  const transactions = [];

  data.forEach((row, index) => {
    try {
      // Mapear colunas do Excel para o formato esperado
      const transaction = {
        id: crypto.randomUUID(),
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
        id: crypto.randomUUID(),
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
// Achata o address (objeto JSONB ou string legada) em colunas planas p/ export.
function flattenClientAddress(addr) {
  if (!addr) return {};
  let a = addr;
  if (typeof a === 'string') { try { a = JSON.parse(a); } catch { return { street: a }; } }
  if (typeof a !== 'object') return {};
  return {
    cep: a.cep || '', street: a.street || '', number: a.number || '',
    complement: a.complement || '', neighborhood: a.neighborhood || '',
    city: a.city || '', state: a.state || '',
  };
}

function processClients(worksheet) {
  const data = XLSX.utils.sheet_to_json(worksheet);
  const clients = [];
  const pick = (row, ...keys) => { for (const k of keys) { if (row[k] != null && String(row[k]).trim()) return String(row[k]).trim(); } return ''; };

  data.forEach((row, index) => {
    try {
      const documentType = (pick(row, 'Tipo de Documento', 'tipo de documento', 'Tipo de documento') || 'cpf').toLowerCase();
      // Nome pode vir separado (Nome/Sobrenome) ou junto (compat com modelo antigo).
      let firstName = pick(row, 'Nome', 'Nome (Primeiro)', 'name', 'Name');
      let lastName = pick(row, 'Sobrenome', 'Sobrenome (Último)', 'last_name');
      if (!lastName && firstName.includes(' ')) {
        const parts = firstName.split(' ');
        firstName = parts[0];
        lastName = parts.slice(1).join(' ');
      }
      const address = {
        cep: pick(row, 'CEP', 'cep'),
        street: pick(row, 'Rua', 'Logradouro', 'Endereço', 'Endereco', 'address'),
        number: pick(row, 'Número', 'Numero', 'number'),
        complement: pick(row, 'Complemento', 'complement'),
        neighborhood: pick(row, 'Bairro', 'neighborhood'),
        city: pick(row, 'Cidade', 'city'),
        state: pick(row, 'UF', 'Estado', 'state'),
      };
      // Remove campos vazios; address vira null se tudo vazio.
      const addrEntries = Object.entries(address).filter(([, v]) => v);
      const client = {
        firstName,
        lastName: lastName || null,
        email: pick(row, 'Email', 'email', 'E-mail'),
        phone: pick(row, 'Telefone', 'phone', 'Phone'),
        cpf: documentType === 'cpf' ? pick(row, 'CPF', 'cpf', 'Cpf') : (pick(row, 'CPF', 'cpf') || null),
        cnpj: documentType === 'cnpj' ? pick(row, 'CNPJ', 'cnpj', 'Cnpj') : (pick(row, 'CNPJ', 'cnpj') || null),
        address: addrEntries.length ? Object.fromEntries(addrEntries) : null,
      };

      if (client.firstName && client.email) {
        clients.push(client);
      }
    } catch (error) {
      console.log(`Erro ao processar linha ${index + 1}:`, error.message);
    }
  });

  return clients;
}

// Função para processar dados de records
function processTerraControl(worksheet) {
  const data = XLSX.utils.sheet_to_json(worksheet);
  const records = [];

  data.forEach((row, index) => {
    try {
      const record = {
        id: crypto.randomUUID(),
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
      if (record.codImovel > 0 && record.imovel) {
        records.push(record);
      }
    } catch (error) {
      console.log(`Erro ao processar linha ${index + 1}:`, error.message);
    }
  });

  return records;
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
        id: crypto.randomUUID(),
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
    if (!['transactions', 'products', 'clients', 'projects', 'terracontrol'].includes(type)) {
      return res.status(400).json({ error: 'Tipo inválido! Use "transactions", "products", "clients", "projects" ou "terracontrol"' });
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
          'Nome': 'João', 'Sobrenome': 'Silva',
          'Email': 'joao@email.com', 'Telefone': '(11) 99999-9999',
          'Tipo de Documento': 'cpf', 'CPF': '123.456.789-00', 'CNPJ': '',
          'CEP': '01001-000', 'Rua': 'Rua das Flores', 'Número': '123',
          'Complemento': 'Apto 12', 'Bairro': 'Centro', 'Cidade': 'São Paulo', 'UF': 'SP'
        },
        {
          'Nome': 'Empresa XYZ Ltda', 'Sobrenome': '',
          'Email': 'contato@empresa.com', 'Telefone': '(11) 88888-8888',
          'Tipo de Documento': 'cnpj', 'CPF': '', 'CNPJ': '12.345.678/0001-90',
          'CEP': '20040-002', 'Rua': 'Av. Principal', 'Número': '456',
          'Complemento': '', 'Bairro': 'Centro', 'Cidade': 'Rio de Janeiro', 'UF': 'RJ'
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
    } else if (type === 'terracontrol') {
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
      XLSX.utils.book_append_sheet(workbook, worksheet, 'TerraControl');
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
          type === 'terracontrol' ? 'modelo-terracontrol.xlsx' : 'modelo-produtos.xlsx';
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

app.post('/api/terracontrol/upload-car', authenticateToken, uploadDocument.single('file'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'Nenhum arquivo enviado' });
    }

    // G2.4 — validar magic bytes %PDF antes de aceitar.
    // multer só checa mimetype/extensão (cabeçalhos controlados pelo cliente).
    // Para impedir upload de HTML/JS renomeado para .pdf, lemos os primeiros
    // 4 bytes e verificamos a assinatura real. Se inválido, removemos o arquivo.
    try {
      const fd = fs.openSync(req.file.path, 'r');
      const header = Buffer.alloc(4);
      fs.readSync(fd, header, 0, 4, 0);
      fs.closeSync(fd);
      if (header.toString('ascii') !== '%PDF') {
        try { fs.unlinkSync(req.file.path); } catch (_) {}
        return res.status(400).json({ success: false, error: 'Arquivo enviado não é um PDF válido' });
      }
    } catch (sigErr) {
      console.error('Erro ao validar assinatura PDF:', sigErr);
      try { fs.unlinkSync(req.file.path); } catch (_) {}
      return res.status(500).json({ success: false, error: 'Falha ao validar o arquivo enviado' });
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

    const { type } = req.body; // 'transactions', 'products', 'clients', 'projects' ou 'terracontrol'

    if (!type || !['transactions', 'products', 'clients', 'projects', 'terracontrol'].includes(type)) {
      return res.status(400).json({ success: false, error: 'Tipo inválido! Use "transactions", "products", "clients", "projects" ou "terracontrol"' });
    }

    console.log(`Processando arquivo: ${req.file.originalname} (${type})`);

    // Ler o arquivo Excel
    const workbook = XLSX.readFile(req.file.path);
    const sheetName = workbook.SheetNames[0]; // Pegar a primeira aba
    const worksheet = workbook.Sheets[sheetName];

    let processedData = [];
    let message = '';

    if (type === 'transactions') {
      const parsed = processTransactions(worksheet);
      // Persiste no banco + aplica regras automáticas
      const saved = [];
      let appliedCount = 0;
      let pendingCount = 0;
      for (const t of parsed) {
        // O id gerado pelo parser não vai para o DB (saveTransaction gera UUID próprio)
        const { id: _ignored, ...rest } = t;
        const savedT = await db.saveTransaction(rest);
        const { transaction: finalTx, applied } = await applyRulesAndPersist(savedT, { actingUserId: req.user?.id || null });
        if (applied === 'rule') appliedCount++;
        if (applied === 'pending') pendingCount++;
        saved.push(finalTx);
      }
      processedData = saved;
      message = `${saved.length} transações importadas com sucesso!${appliedCount ? ` (${appliedCount} classificadas por regras)` : ''}${pendingCount ? ` ${pendingCount} aguardam confirmação.` : ''}`;
    } else if (type === 'products') {
      processedData = processProducts(worksheet);
      message = `${processedData.length} produtos importados com sucesso!`;
    } else if (type === 'clients') {
      const parsed = processClients(worksheet);
      // Persiste de fato (antes só retornava e sumia no reload).
      const saved = [];
      for (const c of parsed) {
        try { saved.push(await db.saveClient(c)); }
        catch (error) { console.error('Erro ao salvar cliente importado:', error.message); }
      }
      processedData = saved;
      message = `${saved.length} clientes importados com sucesso!`;
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
    } else if (type === 'terracontrol') {
      const parsedRecords = processTerraControl(worksheet);
      console.log(`Processados ${parsedRecords.length} registros TerraControl do arquivo`);

      // G5.1 — substitui o array com IDs locais por registros realmente
      // persistidos no DB (incluindo cod_imovel auto-gerado via sequence e UUID
      // da PK). O frontend usa esse array para popular a UI sem precisar fazer
      // re-fetch.
      const savedRecords = [];
      for (const record of parsedRecords) {
        try {
          const saved = await db.saveTerraControl(record);
          savedRecords.push(saved);
        } catch (error) {
          console.error('Erro ao salvar registro TerraControl:', error);
        }
      }
      processedData = savedRecords;
      console.log(`${savedRecords.length} registros TerraControl salvos no banco de dados`);
      message = `${savedRecords.length} registros importados com sucesso!`;
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
      // Mapear dados para formato Excel (nome separado + endereço em colunas).
      const excelData = data.map(c => {
        const a = flattenClientAddress(c.address);
        return {
          'Nome': c.first_name || c.firstName || (c.name ? String(c.name).split(' ')[0] : ''),
          'Sobrenome': c.last_name || c.lastName || (c.name ? String(c.name).split(' ').slice(1).join(' ') : ''),
          'Email': c.email || '',
          'Telefone': c.phone || '',
          'Tipo de Documento': c.cnpj ? 'cnpj' : 'cpf',
          'CPF': c.cpf || '',
          'CNPJ': c.cnpj || '',
          'CEP': a.cep || '', 'Rua': a.street || '', 'Número': a.number || '',
          'Complemento': a.complement || '', 'Bairro': a.neighborhood || '',
          'Cidade': a.city || '', 'UF': a.state || '',
        };
      });
      worksheet = XLSX.utils.json_to_sheet(excelData);
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Clientes');
    } else if (type === 'terracontrol') {
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
      XLSX.utils.book_append_sheet(workbook, worksheet, 'TerraControl');
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
    let pendingCount = 0;
    let appliedCount = 0;
    for (const t of transactions) {
      const savedT = await db.saveTransaction({ ...t, userId: req.user.id });
      const { transaction: finalTx, applied } = await applyRulesAndPersist(savedT, { actingUserId: req.user.id });
      if (applied === 'rule') appliedCount++;
      if (applied === 'pending') pendingCount++;
      await logActivity(req, {
        action: 'create',
        moduleKey: 'transactions',
        entityType: 'transaction',
        entityId: finalTx?.id || null,
        details: { after: finalTx, ruleApplication: applied },
      });
      saved.push(finalTx);
    }
    res.json({ success: true, message: `${saved.length} transações importadas com sucesso!`, data: saved, count: saved.length, ruleApplication: { applied: appliedCount, pending: pendingCount } });
  } catch (err) {
    console.error('[Extrato Confirm] Erro:', err);
    res.status(500).json({ success: false, error: err.message || 'Erro ao salvar transações' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// REGRAS AUTOMÁTICAS DE TRANSAÇÕES (migration 018)
// ═══════════════════════════════════════════════════════════════════════════

const VALID_TRANSACTION_TYPES = ['Receita', 'Despesa', 'Transferência entre contas', 'A confirmar'];

function _truncateForNotif(s, n = 80) {
  if (!s) return '';
  const str = String(s);
  return str.length > n ? str.slice(0, n) + '…' : str;
}

// Helper: aplica regras a uma transação já persistida (saveTransaction retorna
// a row do INSERT). Atualiza o tipo conforme as regras ATIVAS, ou marca como
// 'A confirmar' quando 2+ regras dão match. Cria notificações nesse caso.
async function applyRulesAndPersist(savedTransaction, { actingUserId = null } = {}) {
  if (!savedTransaction || !savedTransaction.id) {
    return { transaction: savedTransaction, applied: 'none', matchedRules: [] };
  }
  const { matched } = await db.evaluateRulesForTransaction(savedTransaction);

  if (matched.length === 0) {
    return { transaction: savedTransaction, applied: 'none', matchedRules: [] };
  }
  if (matched.length === 1) {
    const updated = await db.applyRuleToTransaction(savedTransaction.id, matched[0].id);
    return { transaction: updated, applied: 'rule', matchedRules: matched, ruleApplied: matched[0] };
  }
  // 2+ matches → pendente
  const updated = await db.markTransactionPendingConfirmation(savedTransaction.id, matched.map(r => r.id));
  const title = 'Transação pendente de confirmação';
  const message = `A transação "${_truncateForNotif(savedTransaction.description)}" deu match em ${matched.length} regras. Escolha qual aplicar.`;
  const notifPayload = {
    notification_type: 'transaction_confirm_needed',
    title,
    message,
    related_entity_type: 'transaction',
    related_entity_id: savedTransaction.id,
  };
  // Para o ator (se houver) e fanout para todos admins/superadmins (dedup será via UI)
  const notifiedUserIds = new Set();
  if (actingUserId) {
    const actorNotif = await db.createNotification({ ...notifPayload, user_id: actingUserId });
    pushDispatcher.send(db, 'impgeo', actingUserId, actorNotif).catch(() => {});
    notifiedUserIds.add(actingUserId);
  }
  const adminsResult = await db.queryWithRetry(
    "SELECT id FROM users WHERE role IN ('admin', 'superadmin') AND is_active = TRUE"
  );
  for (const row of adminsResult.rows) {
    if (notifiedUserIds.has(row.id)) continue;
    const adminNotif = await db.createNotification({ ...notifPayload, user_id: row.id });
    pushDispatcher.send(db, 'impgeo', row.id, adminNotif).catch(() => {});
    notifiedUserIds.add(row.id);
  }
  return { transaction: updated, applied: 'pending', matchedRules: matched };
}

// Middleware: exige permissão de regras para uma ação
function requireRulePermission(action /* 'create' | 'edit' | 'delete' */) {
  return async (req, res, next) => {
    try {
      const perms = await db.getUserRulePermissions(req.user.id, req.user.role);
      const flagMap = { create: 'can_create', edit: 'can_edit', delete: 'can_delete' };
      if (!perms[flagMap[action]]) {
        return res.status(403).json({ success: false, error: `Permissão insuficiente para ${action} de regras` });
      }
      req.rulePermissions = perms;
      next();
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  };
}

// ─── CRUD de regras ────────────────────────────────────────────────────────
app.get('/api/transaction-rules', async (req, res) => {
  try {
    const rules = await db.getAllTransactionRules();
    const perms = await db.getUserRulePermissions(req.user.id, req.user.role);
    res.json({ success: true, data: rules, permissions: perms });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Regra: descrição obrigatória + pelo menos uma ação (tipo/categoria/subcategoria/ocultar).
// Condições opcionais: faixa de valor e tipo casado.
const transactionRuleSchema = z.object({
  name: z.string().min(1, 'Nome obrigatório'),
  description_contains: z.string().min(1, 'Descrição obrigatória'),
  action_type: z.string().default('change_type'),
  action_value:     z.string().nullable().optional(),
  set_category:     z.string().nullable().optional(),
  set_subcategory:  z.string().nullable().optional(),
  hide_transaction: z.boolean().optional(),
  min_value: z.union([z.number(), z.string().transform(v => v === '' ? null : parseFloat(v))]).nullable().optional(),
  max_value: z.union([z.number(), z.string().transform(v => v === '' ? null : parseFloat(v))]).nullable().optional(),
  match_type: z.string().nullable().optional(),
  is_active: z.boolean().optional(),
}).passthrough().refine(
  (data) => Boolean(data.action_value) || Boolean(data.set_category) || Boolean(data.set_subcategory) || Boolean(data.hide_transaction),
  { message: 'Defina ao menos uma ação: tipo, categoria, subcategoria ou ocultar' }
).refine(
  (data) => data.min_value == null || data.max_value == null || Number(data.min_value) <= Number(data.max_value),
  { message: 'Valor mínimo deve ser menor ou igual ao máximo' }
);

app.post('/api/transaction-rules', requireRulePermission('create'), async (req, res) => {
  try {
    const data = transactionRuleSchema.parse(req.body);
    if (data.action_value && !VALID_TRANSACTION_TYPES.includes(data.action_value)) {
      return res.status(400).json({ success: false, error: `Tipo inválido. Use: ${VALID_TRANSACTION_TYPES.join(', ')}` });
    }
    const rule = await db.saveTransactionRule({ ...data, created_by: req.user.id });
    res.json({ success: true, data: rule });
    await logActivity(req, { action: 'rule_create', moduleKey: 'transactions', entityType: 'transaction_rule', entityId: rule.id, details: { rule } });
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ success: false, error: 'Dados inválidos', details: err.errors });
    res.status(500).json({ success: false, error: err.message });
  }
});

app.put('/api/transaction-rules/:id', requireRulePermission('edit'), async (req, res) => {
  try {
    const { id } = req.params;
    if (req.body.action_value && !VALID_TRANSACTION_TYPES.includes(req.body.action_value)) {
      return res.status(400).json({ success: false, error: `Tipo inválido. Use: ${VALID_TRANSACTION_TYPES.join(', ')}` });
    }
    const rule = await db.updateTransactionRule(id, req.body);
    res.json({ success: true, data: rule });
    await logActivity(req, { action: 'rule_edit', moduleKey: 'transactions', entityType: 'transaction_rule', entityId: id, details: { updates: req.body } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Exclusão recebe transactionAction: 'delete' | 'revert' | 'keep' para decidir
// o destino das transações já modificadas por essa regra.
app.delete('/api/transaction-rules/:id', requireRulePermission('delete'), async (req, res) => {
  try {
    const { id } = req.params;
    const { transactionAction = 'revert' } = req.body || {};
    if (!['delete', 'revert', 'keep'].includes(transactionAction)) {
      return res.status(400).json({ success: false, error: 'transactionAction inválido' });
    }

    const affected = (await db.queryWithRetry(
      'SELECT id FROM transactions WHERE applied_rule_id = $1',
      [id]
    )).rows;

    for (const t of affected) {
      if (transactionAction === 'delete') {
        await db.deleteTransaction(t.id);
      } else if (transactionAction === 'revert') {
        await db.revertTransactionRule(t.id);
      } else { // keep
        await db.queryWithRetry(
          'UPDATE transactions SET applied_rule_id = NULL, original_type = NULL, updated_at = NOW() WHERE id = $1',
          [t.id]
        );
      }
    }

    await db.deleteTransactionRule(id);
    res.json({ success: true, affected: affected.length, transactionAction });
    await logActivity(req, { action: 'rule_delete', moduleKey: 'transactions', entityType: 'transaction_rule', entityId: id, details: { transactionAction, affected: affected.length } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Retorna transações que JÁ estão classificadas por esta regra (independente
// da condição atual). Usado no preview de edição para detectar transações que
// ficaram "órfãs" — aplicadas pela regra mas que não casam mais com a nova condição.
app.get('/api/transaction-rules/:id/affected', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await db.queryWithRetry(
      'SELECT * FROM transactions WHERE applied_rule_id = $1 ORDER BY date DESC',
      [id]
    );
    res.json({ success: true, data: result.rows });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Reverte transações específicas (usado pelo modal de edição para "soltar" as órfãs)
app.post('/api/transaction-rules/:id/revert', requireRulePermission('edit'), async (req, res) => {
  try {
    const { id } = req.params;
    const { transactionIds = [] } = req.body || {};
    let reverted = 0;
    for (const txId of transactionIds) {
      // Só reverte se a transação realmente está governada por essa regra
      const t = (await db.queryWithRetry('SELECT applied_rule_id FROM transactions WHERE id = $1', [txId])).rows[0];
      if (t && t.applied_rule_id === id) {
        await db.revertTransactionRule(txId);
        reverted++;
      }
    }
    res.json({ success: true, reverted });
    await logActivity(req, { action: 'rule_revert_transactions', moduleKey: 'transactions', entityType: 'transaction_rule', entityId: id, details: { reverted } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Reordena regras (drag/setas) — body: { orderedIds: [...] }
app.post('/api/transaction-rules/reorder', requireRulePermission('edit'), async (req, res) => {
  try {
    const { orderedIds } = req.body || {};
    if (!Array.isArray(orderedIds) || orderedIds.length === 0) {
      return res.status(400).json({ success: false, error: 'orderedIds deve ser um array não-vazio' });
    }
    await db.reorderTransactionRules(orderedIds);
    res.json({ success: true });
    await logActivity(req, { action: 'rule_reorder', moduleKey: 'transactions', entityType: 'transaction_rule', details: { count: orderedIds.length } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Preview: dada uma condição, retorna transações que dariam match (para
// o modal de criar/editar regra mostrar o que será afetado retroativamente).
app.post('/api/transaction-rules/preview', async (req, res) => {
  try {
    const { description_contains, ruleId } = req.body || {};
    if (!description_contains) {
      return res.status(400).json({ success: false, error: 'description_contains obrigatório' });
    }
    const matches = await db.previewRuleMatches({ description_contains, excludeRuleId: ruleId || null });
    res.json({ success: true, data: matches });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Aplica retroativo de uma regra. excludedTransactionIds = transações que o
// usuário desmarcou no modal de preview.
app.post('/api/transaction-rules/:id/apply-retroactive', requireRulePermission('edit'), async (req, res) => {
  try {
    const { id } = req.params;
    const { excludedTransactionIds = [] } = req.body || {};
    const rule = await db.getTransactionRuleById(id);
    if (!rule) return res.status(404).json({ success: false, error: 'Regra não encontrada' });

    const candidates = await db.previewRuleMatches({ description_contains: rule.description_contains });
    const excludedSet = new Set(excludedTransactionIds);
    const eligible = candidates.filter(t => !excludedSet.has(t.id));

    let applied = 0;
    for (const t of eligible) {
      // Respeita transações que já têm outra regra aplicada (não sobrescreve)
      if (t.applied_rule_id && t.applied_rule_id !== id) continue;
      await db.applyRuleToTransaction(t.id, id);
      applied++;
    }

    res.json({ success: true, applied, excluded: excludedTransactionIds.length });
    await logActivity(req, { action: 'rule_apply_retroactive', moduleKey: 'transactions', entityType: 'transaction_rule', entityId: id, details: { applied, excluded: excludedTransactionIds.length } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Lista todas as transações pendentes com seus candidatos (para o modal bulk)
app.get('/api/transactions/pending', async (req, res) => {
  try {
    const txResult = await db.queryWithRetry(
      "SELECT * FROM transactions WHERE (needs_confirmation = TRUE OR type = 'A confirmar') AND is_hidden = FALSE ORDER BY date DESC"
    );
    const transactions = txResult.rows;
    // Anexa candidatos a cada transação
    const result = [];
    for (const t of transactions) {
      const candidates = await db.getTransactionRuleCandidates(t.id);
      result.push({ ...t, candidates });
    }
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Resolução em lote: recebe array [{transactionId, ruleId|null}]
app.post('/api/transactions/resolve-confirmation-bulk', async (req, res) => {
  try {
    const { resolutions } = req.body || {};
    if (!Array.isArray(resolutions) || resolutions.length === 0) {
      return res.status(400).json({ success: false, error: 'resolutions deve ser um array não-vazio' });
    }
    let resolved = 0;
    const errors = [];
    for (const r of resolutions) {
      try {
        if (r.ruleId) {
          await db.applyRuleToTransaction(r.transactionId, r.ruleId);
        } else {
          await db.revertTransactionRule(r.transactionId);
        }
        await db.deleteNotificationsByEntity('transaction', r.transactionId);
        resolved++;
      } catch (err) {
        errors.push({ transactionId: r.transactionId, error: err.message });
      }
    }
    res.json({ success: true, resolved, errors });
    await logActivity(req, { action: 'transaction_resolve_confirmation_bulk', moduleKey: 'transactions', entityType: 'transaction', details: { resolved, errorCount: errors.length } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Lista regras que deram match na transação (usado pelo modal de resolução)
app.get('/api/transactions/:id/candidates', async (req, res) => {
  try {
    const candidates = await db.getTransactionRuleCandidates(req.params.id);
    res.json({ success: true, data: candidates });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Marca um conjunto de transações como "A confirmar" usando esta regra como
// candidata (junto com outras regras ativas que também dão match na transação).
// Usado pelo botão "Decidir depois" do modal de preview retroativo.
app.post('/api/transaction-rules/:id/mark-pending-retroactive', requireRulePermission('edit'), async (req, res) => {
  try {
    const { id } = req.params;
    const { transactionIds = [] } = req.body || {};
    const rule = await db.getTransactionRuleById(id);
    if (!rule) return res.status(404).json({ success: false, error: 'Regra não encontrada' });

    let marked = 0;
    for (const txId of transactionIds) {
      const tx = (await db.queryWithRetry('SELECT * FROM transactions WHERE id = $1', [txId])).rows[0];
      if (!tx) continue;
      // Re-avalia para incluir TODAS as regras que dão match (não só a recém-criada)
      const { matched } = await db.evaluateRulesForTransaction(tx);
      const candidateIds = Array.from(new Set([id, ...matched.map(m => m.id)]));
      await db.markTransactionPendingConfirmation(txId, candidateIds);
      marked++;

      // Notificação para o ator + fanout para admins (mesmo padrão de applyRulesAndPersist)
      const title = 'Transação pendente de confirmação';
      const message = `A transação "${_truncateForNotif(tx.description)}" tem ${candidateIds.length} regra(s) candidata(s). Escolha qual aplicar.`;
      const notifPayload = {
        notification_type: 'transaction_confirm_needed',
        title, message,
        related_entity_type: 'transaction',
        related_entity_id: txId,
      };
      const notifiedUserIds = new Set();
      if (req.user?.id) {
        const actorNotif = await db.createNotification({ ...notifPayload, user_id: req.user.id });
        pushDispatcher.send(db, 'impgeo', req.user.id, actorNotif).catch(() => {});
        notifiedUserIds.add(req.user.id);
      }
      const adminsResult = await db.queryWithRetry(
        "SELECT id FROM users WHERE role IN ('admin', 'superadmin') AND is_active = TRUE"
      );
      for (const row of adminsResult.rows) {
        if (notifiedUserIds.has(row.id)) continue;
        const adminNotif = await db.createNotification({ ...notifPayload, user_id: row.id });
        pushDispatcher.send(db, 'impgeo', row.id, adminNotif).catch(() => {});
        notifiedUserIds.add(row.id);
      }
    }
    res.json({ success: true, marked });
    await logActivity(req, { action: 'rule_mark_pending_retroactive', moduleKey: 'transactions', entityType: 'transaction_rule', entityId: id, details: { marked } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Resolver pendência de uma transação (escolher uma regra ou manter original)
app.post('/api/transactions/:id/resolve-confirmation', async (req, res) => {
  try {
    const { id } = req.params;
    const { ruleId = null } = req.body || {};
    const tx = ruleId
      ? await db.applyRuleToTransaction(id, ruleId)
      : await db.revertTransactionRule(id);
    await db.deleteNotificationsByEntity('transaction', id);
    res.json({ success: true, data: tx });
    await logActivity(req, { action: 'transaction_resolve_confirmation', moduleKey: 'transactions', entityType: 'transaction', entityId: id, details: { ruleId } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── Notificações ──────────────────────────────────────────────────────────
app.get('/api/notifications', async (req, res) => {
  try {
    const onlyUnread = req.query.onlyUnread === 'true';
    const limit = parseInt(req.query.limit, 10) || 50;
    const notifs = await db.getNotificationsForUser(req.user.id, { onlyUnread, limit });
    const unreadCount = await db.getUnreadNotificationCount(req.user.id);
    res.json({ success: true, data: notifs, unreadCount });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.patch('/api/notifications/read-all', async (req, res) => {
  try {
    await db.markAllNotificationsAsRead(req.user.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// "Limpar todas" — esconde do sininho, mantém no banco
app.patch('/api/notifications/clear-all', async (req, res) => {
  try {
    const cleared = await db.clearAllNotifications(req.user.id);
    res.json({ success: true, cleared });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// "Excluir todas" — remove do banco permanentemente
app.delete('/api/notifications', async (req, res) => {
  try {
    const onlyCleared = req.query.onlyCleared === 'true';
    const deleted = await db.deleteAllNotificationsForUser(req.user.id, { onlyCleared });
    res.json({ success: true, deleted });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Rotas com :id (individuais) — colocadas DEPOIS das rotas literais para evitar
// que '/clear-all' / 'read-all' sejam capturadas por ':id'.
app.patch('/api/notifications/:id/read', async (req, res) => {
  try {
    const updated = await db.markNotificationAsRead(req.params.id, req.user.id);
    res.json({ success: true, data: updated });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.patch('/api/notifications/:id/clear', async (req, res) => {
  try {
    const updated = await db.clearNotification(req.params.id, req.user.id);
    res.json({ success: true, data: updated });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.delete('/api/notifications/:id', async (req, res) => {
  try {
    const deleted = await db.deleteNotification(req.params.id, req.user.id);
    if (!deleted) return res.status(404).json({ success: false, error: 'Notificação não encontrada' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── Web Push: subscriptions e preferências (impgeo) ─────────────────────
// Auth herda do middleware global `authenticateToken` (req.user já populado).
// Os endpoints `/api/tc-auth/push/*` ficam mais abaixo, no bloco do tc.
//
// `app_id` no body diferencia subscription do mesmo user em origins distintos
// (mesmo user_id pode ter linhas com app_id='impgeo', 'tc-public' e 'tc-admin').

app.get('/api/push/vapid-public-key', async (req, res) => {
  if (!push.isConfigured()) {
    return res.status(503).json({ success: false, error: 'Web Push não configurado no servidor' });
  }
  res.json({ success: true, publicKey: push.getPublicKey() });
});

app.post('/api/push/subscribe', async (req, res) => {
  try {
    const { endpoint, keys, app_id } = req.body || {};
    if (!endpoint || typeof endpoint !== 'string' || endpoint.length < 20) {
      return res.status(400).json({ success: false, error: 'endpoint inválido' });
    }
    if (!keys || typeof keys.p256dh !== 'string' || typeof keys.auth !== 'string') {
      return res.status(400).json({ success: false, error: 'keys.p256dh e keys.auth são obrigatórios' });
    }
    const ALLOWED_APP_IDS = ['impgeo', 'tc-public', 'tc-admin'];
    if (!ALLOWED_APP_IDS.includes(app_id)) {
      return res.status(400).json({ success: false, error: 'app_id deve ser impgeo, tc-public ou tc-admin' });
    }
    const userAgent = (req.headers['user-agent'] || '').slice(0, 500);
    const sub = await db.upsertPushSubscription('impgeo', req.user.id, { endpoint, keys }, app_id, userAgent);
    res.json({ success: true, data: { id: sub.id, endpoint: sub.endpoint, app_id: sub.app_id } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.delete('/api/push/subscribe', async (req, res) => {
  try {
    const { endpoint } = req.body || {};
    if (!endpoint || typeof endpoint !== 'string') {
      return res.status(400).json({ success: false, error: 'endpoint obrigatório' });
    }
    const removed = await db.deletePushSubscriptionByEndpoint('impgeo', req.user.id, endpoint);
    res.json({ success: true, removed });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/notification-preferences', async (req, res) => {
  try {
    const grid = await db.listNotificationPreferences('impgeo', req.user.id);
    res.json({ success: true, data: grid });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.put('/api/notification-preferences', async (req, res) => {
  try {
    const { notification_type, channel, enabled } = req.body || {};
    if (!notification_type || typeof notification_type !== 'string' || notification_type.length > 64) {
      return res.status(400).json({ success: false, error: 'notification_type inválido' });
    }
    if (channel !== 'push' && channel !== 'email') {
      return res.status(400).json({ success: false, error: 'channel deve ser "push" ou "email"' });
    }
    if (typeof enabled !== 'boolean') {
      return res.status(400).json({ success: false, error: 'enabled deve ser boolean' });
    }
    const pref = await db.setNotificationPreference('impgeo', req.user.id, notification_type, channel, enabled);
    res.json({ success: true, data: pref });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── Permissões granulares para regras ────────────────────────────────────
app.get('/api/user-rule-permissions/me', async (req, res) => {
  try {
    const perms = await db.getUserRulePermissions(req.user.id, req.user.role);
    res.json({ success: true, data: perms });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/users/:id/rule-permissions', async (req, res) => {
  try {
    if (req.user.role !== 'admin' && req.user.role !== 'superadmin') {
      return res.status(403).json({ success: false, error: 'Apenas admins' });
    }
    const targetUser = await db.getUserById(req.params.id);
    if (!targetUser) return res.status(404).json({ success: false, error: 'Usuário não encontrado' });
    const perms = await db.getUserRulePermissions(req.params.id, targetUser.role);
    res.json({ success: true, data: perms });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.put('/api/users/:id/rule-permissions', async (req, res) => {
  try {
    if (req.user.role !== 'admin' && req.user.role !== 'superadmin') {
      return res.status(403).json({ success: false, error: 'Apenas admins' });
    }
    const { can_create, can_edit, can_delete } = req.body || {};
    const updated = await db.setUserRulePermissions(
      req.params.id,
      { can_create, can_edit, can_delete },
      req.user.id
    );
    res.json({ success: true, data: updated });
    await logActivity(req, { action: 'rule_permissions_set', moduleKey: 'transactions', entityType: 'user', entityId: req.params.id, details: { can_create, can_edit, can_delete } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
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
    const { transaction: finalTx, applied, matchedRules } = await applyRulesAndPersist(transaction, { actingUserId: req.user.id });
    res.json({ success: true, data: finalTx, ruleApplication: { applied, matchedCount: matchedRules.length } });
    await logActivity(req, {
      action: 'financial_create',
      moduleKey: 'transactions',
      entityType: 'transaction',
      entityId: finalTx?.id || null,
      details: { ruleApplication: applied, matchedRuleIds: matchedRules.map(r => r.id) }
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ success: false, error: 'Dados inválidos', details: error.errors });
    }
    res.status(500).json({ success: false, error: error.message });
  }
});

// Edição manual "solta" da regra: zera applied_rule_id/original_type/needs_confirmation
// (o usuário tem controle total dos dados — uma vez editada manualmente, a transação
// não é mais governada por nenhuma regra até que ele rode aplicação retroativa)
app.put('/api/transactions/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const transaction = await db.updateTransaction(id, req.body);
    // Solta da regra
    await db.queryWithRetry(
      `UPDATE transactions
          SET applied_rule_id = NULL,
              original_type = NULL,
              needs_confirmation = FALSE,
              updated_at = NOW()
        WHERE id = $1`,
      [id]
    );
    await db.deleteNotificationsByEntity('transaction', id);
    const fresh = (await db.queryWithRetry('SELECT * FROM transactions WHERE id = $1', [id])).rows[0];
    res.json({ success: true, data: fresh });
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
    // PM Fase 3: se vier serviceId, materializa o template (cria projeto +
    // etapas + tarefas + deps + triggers atomicamente). Senão, comportamento
    // legado (projeto simples).
    if (req.body && req.body.serviceId) {
      // Serviço inativo não gera novos projetos (mas continua no sistema).
      // Tolerante: se a coluna status ainda não existe (migration 054 não
      // aplicada), não bloqueia — apenas pula o check.
      try {
        const svc = await db.pool.query('SELECT status FROM services WHERE id = $1', [req.body.serviceId]);
        if (svc.rows[0]?.status === 'inativo') {
          return res.status(400).json({ success: false, error: 'Este serviço está inativo e não pode gerar novos projetos.', code: 'service_inactive' });
        }
      } catch (e) {
        if (!/column .*status.* does not exist/i.test(e.message)) throw e;
      }
      const project = await pmProjectService.createProjectFromTemplate(db, {
        name: req.body.name,
        description: req.body.description,
        serviceId: req.body.serviceId,
        clientId: req.body.clientId || null,
        managerUserId: req.body.managerUserId || null,
        startDate: req.body.startDate || null,
        status: req.body.status || null,
        totalCents: req.body.totalCents || 0,
        source: 'manual',
        actorUserId: req.user?.id || null,
      });
      return res.json({ success: true, data: project });
    }
    const project = await db.saveProject(req.body);
    res.json({ success: true, data: project });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// PM Fase 3: detalhe aninhado do projeto (etapas/tarefas/eventos).
app.get('/api/projects/:id', async (req, res) => {
  try {
    const include = req.query.include
      ? String(req.query.include).split(',').map(s => s.trim()).filter(Boolean)
      : ['stages', 'tasks', 'events'];
    const project = await pmProjectService.getProjectWithDetails(db, req.params.id, { include });
    if (!project) return res.status(404).json({ success: false, error: 'Projeto não encontrado' });
    await _annotateCanManage(db, req.user, project);
    res.json({ success: true, data: project });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// PM Fase 3: pular etapa.
app.post('/api/projects/:id/stages/:stageId/skip', requireModulePermission('projects', 'edit'), async (req, res) => {
  try {
    await pmProjectService.skipStage(db, req.params.id, req.params.stageId, { actorUserId: req.user?.id || null });
    res.json({ success: true });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

// PM Fase 3: clonar etapa como nova versão (diligência/retrabalho — "v2/v3").
app.post('/api/projects/:id/stages/:stageId/clone-as-version', requireModulePermission('projects', 'edit'), async (req, res) => {
  try {
    const project = await pmProjectService.cloneStageAsNewVersion(db, req.params.id, req.params.stageId, { actorUserId: req.user?.id || null });
    res.json({ success: true, data: project });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

// ─── PM Fase 4: workflow de tarefas (state machine) ───────────────────────────
// Auth: módulo 'tarefas_gerenciamento'. Mutações exigem edit; leitura, view.
// Ações sobre a própria tarefa (accept/start/...) também checam ownership.

const _isManagerRole = (u) => u && (u.role === 'admin' || u.role === 'superadmin' || u.role === 'manager');

// Escopo de gestão de tarefa (atribuir / definir prazo):
//  - superadmin: tudo.
//  - admin: tudo, MENOS tarefa de outro admin ou de superadmin.
//  - manager: só na equipe dele — projeto que gerencia, quem ele já atribuiu, ou ele mesmo.
//  - demais: não.
// targetUserId = dono/alvo relevante (assignee da tarefa, ou o novo responsável no assign).
async function _canManageTask(db, actor, task, targetUserId) {
  if (!actor) return false;
  if (targetUserId === undefined) targetUserId = task && task.assignee_user_id;
  if (actor.role === 'superadmin') return true;

  let targetRole = null;
  if (targetUserId) {
    const r = await db.pool.query('SELECT role FROM users WHERE id = $1', [targetUserId]);
    targetRole = r.rows[0]?.role || null;
  }

  if (actor.role === 'admin') {
    if (targetUserId && targetUserId !== actor.id && (targetRole === 'admin' || targetRole === 'superadmin')) return false;
    return true;
  }

  if (actor.role === 'manager') {
    if (targetUserId && targetUserId === actor.id) return true;
    if (task && task.project_id) {
      const p = await db.pool.query('SELECT manager_user_id FROM projects WHERE id = $1', [task.project_id]);
      if (p.rows[0]?.manager_user_id === actor.id) return true;
    }
    if (targetUserId) {
      const h = await db.pool.query(
        `SELECT 1 FROM task_assignments_history WHERE assigned_by_user_id = $1 AND to_user_id = $2 LIMIT 1`,
        [actor.id, targetUserId]
      );
      if (h.rows[0]) return true;
    }
    return false;
  }
  return false;
}

// Anota cada tarefa do projeto com:
//  - can_manage: escopo de ATRIBUIR (esconde o botão fora do escopo).
//  - due_action: o que o ator pode fazer com o PRAZO → 'edit' (admin/superadmin
//    direto) | 'request' (manager/usuário pedem aprovação) | null (não pode).
async function _annotateCanManage(db, actor, project) {
  if (!actor || !project) return;
  const tasks = (project.stages || []).flatMap(s => s.tasks || []);
  if (!tasks.length) return;

  if (actor.role === 'superadmin') { tasks.forEach(t => { t.can_manage = true; t.due_action = 'edit'; }); return; }

  if (actor.role === 'admin') {
    const ids = [...new Set(tasks.map(t => t.assignee_user_id).filter(Boolean))];
    const roleById = {};
    if (ids.length) {
      const rr = await db.pool.query('SELECT id, role FROM users WHERE id = ANY($1::varchar[])', [ids]);
      rr.rows.forEach(r => { roleById[r.id] = r.role; });
    }
    tasks.forEach(t => {
      const tid = t.assignee_user_id;
      t.can_manage = !(tid && tid !== actor.id && (roleById[tid] === 'admin' || roleById[tid] === 'superadmin'));
      t.due_action = t.can_manage ? 'edit' : null;  // admin altera direto, menos tarefa de outro admin
    });
    return;
  }

  if (actor.role === 'manager') {
    const ownsProject = project.manager_user_id === actor.id;
    let teamSet = new Set();
    if (!ownsProject) {
      const h = await db.pool.query('SELECT DISTINCT to_user_id FROM task_assignments_history WHERE assigned_by_user_id = $1', [actor.id]);
      teamSet = new Set(h.rows.map(r => r.to_user_id));
    }
    tasks.forEach(t => {
      const tid = t.assignee_user_id;
      t.can_manage = (tid === actor.id) || ownsProject || (!!tid && teamSet.has(tid));
      t.due_action = 'request';  // manager pede aprovação de admin para alterar prazo
    });
    return;
  }

  // usuário comum: só pode PEDIR alteração do prazo da própria tarefa.
  tasks.forEach(t => {
    t.can_manage = false;
    t.due_action = (t.assignee_user_id === actor.id || t.captured_by_user_id === actor.id) ? 'request' : null;
  });
}

// Guarda: admin/manager OU responsável/capturador da tarefa.
async function _guardTaskActor(req, res, taskId) {
  const task = await pmTaskService.getTask(db.pool, taskId);
  if (!task) { res.status(404).json({ success: false, error: 'Tarefa não encontrada' }); return null; }
  if (_isManagerRole(req.user)) return task;
  if (task.assignee_user_id === req.user?.id || task.captured_by_user_id === req.user?.id) return task;
  res.status(403).json({ success: false, error: 'Você não pode agir sobre esta tarefa.' });
  return null;
}

// Atribuir/reatribuir (admin/manager).
app.post('/api/projects/:id/tasks/:taskId/assign', requireModulePermission('tarefas_gerenciamento', 'edit'), async (req, res) => {
  try {
    if (!_isManagerRole(req.user)) return res.status(403).json({ success: false, error: 'Apenas gestores atribuem tarefas.' });
    const existing = await pmTaskService.getTask(db.pool, req.params.taskId);
    if (!existing) return res.status(404).json({ success: false, error: 'Tarefa não encontrada' });
    // Escopo: pode agir nesta tarefa E atribuir ao novo responsável.
    const okCurrent = await _canManageTask(db, req.user, existing, existing.assignee_user_id);
    const okTarget = await _canManageTask(db, req.user, existing, req.body.userId);
    if (!okCurrent || !okTarget) return res.status(403).json({ success: false, error: 'Fora do seu escopo: gerencie apenas tarefas da sua equipe.' });
    const task = await pmTaskService.assignTask(db, req.params.taskId, {
      toUserId: req.body.userId, assignedByUserId: req.user?.id || null, reason: req.body.reason || 'assign',
      ...(req.body.dueDate !== undefined ? { dueDate: req.body.dueDate } : {}),
    });
    res.json({ success: true, data: task });
  } catch (error) {
    res.status(error.status || 400).json({ success: false, error: error.message, code: error.code });
  }
});

// Definir/ajustar/limpar o prazo da tarefa (gestor), sem reatribuir.
app.post('/api/tasks/:taskId/due-date', requireModulePermission('tarefas_gerenciamento', 'edit'), async (req, res) => {
  try {
    const existing = await pmTaskService.getTask(db.pool, req.params.taskId);
    if (!existing) return res.status(404).json({ success: false, error: 'Tarefa não encontrada' });
    const role = req.user?.role;

    // Admin/superadmin: alteram DIRETO (admin não mexe em tarefa de outro admin).
    if (role === 'admin' || role === 'superadmin') {
      if (!await _canManageTask(db, req.user, existing)) return res.status(403).json({ success: false, error: 'Você não pode alterar o prazo de uma tarefa de outro admin.' });
      const task = await pmTaskService.setTaskDueDate(db, req.params.taskId, { dueDate: req.body.dueDate ?? null, userId: req.user?.id || null });
      return res.json({ success: true, data: { applied: true, task } });
    }

    // Usuário comum só pede na PRÓPRIA tarefa.
    if (role !== 'manager') {
      const mine = existing.assignee_user_id === req.user?.id || existing.captured_by_user_id === req.user?.id;
      if (!mine) return res.status(403).json({ success: false, error: 'Você só pode pedir alteração de prazo da sua própria tarefa.' });
    }

    // Manager / usuário → pedido de aprovação.
    const request = await pmTaskService.requestDueDateChange(db, req.params.taskId, {
      userId: req.user.id, requestedDueDate: req.body.dueDate ?? null, justification: req.body.justification || null,
    });
    res.json({ success: true, data: { requested: true, request } });
  } catch (error) {
    res.status(error.status || 400).json({ success: false, error: error.message, code: error.code });
  }
});

// Fila de pedidos de alteração de prazo (gestor — escopo no service).
app.get('/api/pm/due-date-requests/pending', requireModulePermission('tarefas_gerenciamento', 'view'), async (req, res) => {
  try {
    if (!_isManagerRole(req.user)) return res.status(403).json({ success: false, error: 'Apenas gestores.' });
    res.json({ success: true, data: await pmTaskService.listPendingDueDateRequests(db, req.user) });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

// Aprovar/recusar um pedido (autoridade verificada no service).
app.post('/api/pm/due-date-requests/:id/decide', requireModulePermission('tarefas_gerenciamento', 'edit'), async (req, res) => {
  try {
    const data = await pmTaskService.decideDueDateChange(db, req.params.id, req.user, { approved: req.body.approved === true });
    res.json({ success: true, data });
  } catch (error) { res.status(error.status || 400).json({ success: false, error: error.message, code: error.code }); }
});

// Ações sobre a tarefa.
const taskActions = {
  accept:  (taskId, req) => pmTaskService.acceptTask(db, taskId, { userId: req.user?.id || null }),
  refuse:  (taskId, req) => pmTaskService.refuseTask(db, taskId, { userId: req.user?.id || null, reason: req.body.reason }),
  start:   (taskId, req) => pmTaskService.startTask(db, taskId, { userId: req.user?.id || null }),
  pause:   (taskId, req) => pmTaskService.pauseTask(db, taskId, { userId: req.user?.id || null }),
  resume:  (taskId, req) => pmTaskService.resumeTask(db, taskId, { userId: req.user?.id || null }),
  complete:(taskId, req) => pmTaskService.completeTask(db, taskId, { userId: req.user?.id || null }),
  cancel:  (taskId, req) => pmTaskService.cancelTask(db, taskId, { userId: req.user?.id || null, reason: req.body.reason || null }),
};
for (const action of Object.keys(taskActions)) {
  app.post(`/api/tasks/:taskId/${action}`, requireModulePermission('tarefas_gerenciamento', 'edit'), async (req, res) => {
    try {
      // cancel só gestor; demais ações exigem ownership (ou gestor).
      if (action === 'cancel' && !_isManagerRole(req.user)) {
        return res.status(403).json({ success: false, error: 'Apenas gestores cancelam tarefas.' });
      }
      const task = await _guardTaskActor(req, res, req.params.taskId);
      if (!task) return;
      const result = await taskActions[action](req.params.taskId, req);
      res.json({ success: true, data: result });
    } catch (error) {
      res.status(error.status || 400).json({ success: false, error: error.message, code: error.code, blockedBy: error.blockedBy });
    }
  });
}

// "Pegar" uma tarefa disponível e sem responsável (auto-atribuição).
app.post('/api/tasks/:taskId/claim', requireModulePermission('tarefas_gerenciamento', 'edit'), async (req, res) => {
  try {
    const task = await pmTaskService.claimTask(db, req.params.taskId, { userId: req.user.id });
    res.json({ success: true, data: task });
  } catch (error) {
    res.status(error.status || 400).json({ success: false, error: error.message, code: error.code });
  }
});

// Dashboard pessoal.
app.get('/api/me/tasks', requireModulePermission('tarefas_gerenciamento', 'view'), async (req, res) => {
  try {
    const statuses = req.query.status ? String(req.query.status).split(',').map(s => s.trim()).filter(Boolean) : null;
    const tasks = await pmTaskService.listMyTasks(db, req.user.id, { statuses });
    // São tarefas do próprio usuário: admin/superadmin alteram prazo direto; demais pedem.
    const dueAction = (req.user?.role === 'admin' || req.user?.role === 'superadmin') ? 'edit' : 'request';
    tasks.forEach(t => { t.due_action = dueAction; });
    res.json({ success: true, data: tasks });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Tarefas disponíveis para "pegar" (sem responsável, status available).
app.get('/api/me/available-tasks', requireModulePermission('tarefas_gerenciamento', 'view'), async (req, res) => {
  try {
    const tasks = await pmTaskService.listAvailableUnassignedTasks(db);
    // can_assign: pode atribuir a OUTRA pessoa (gestor, no escopo). Usuário comum só "pega".
    const role = req.user?.role;
    if (role === 'superadmin' || role === 'admin') {
      tasks.forEach(t => { t.can_assign = true; });
    } else if (role === 'manager') {
      const pr = await db.pool.query('SELECT id FROM projects WHERE manager_user_id = $1', [req.user.id]);
      const mine = new Set(pr.rows.map(r => r.id));
      tasks.forEach(t => { t.can_assign = mine.has(t.project_id); });
    } else {
      tasks.forEach(t => { t.can_assign = false; });
    }
    res.json({ success: true, data: tasks });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Tarefas de um projeto (gestores).
app.get('/api/projects/:id/tasks', requireModulePermission('tarefas_gerenciamento', 'view'), async (req, res) => {
  try {
    const tasks = await pmTaskService.listProjectTasks(db, req.params.id);
    res.json({ success: true, data: tasks });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Preferências de relatório por e-mail (opt-in).
app.get('/api/me/pm-email-prefs', requireModulePermission('tarefas_gerenciamento', 'view'), async (req, res) => {
  try {
    if (!_isManagerRole(req.user)) return res.status(403).json({ success: false, error: 'Relatórios por e-mail são só para gestores.' });
    const r = await db.pool.query('SELECT pm_email_reports, pm_report_frequencies FROM users WHERE id = $1', [req.user.id]);
    const row = r.rows[0] || {};
    res.json({ success: true, data: { emailReports: row.pm_email_reports === true, frequencies: Array.isArray(row.pm_report_frequencies) ? row.pm_report_frequencies : [] } });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

app.put('/api/me/pm-email-prefs', requireModulePermission('tarefas_gerenciamento', 'view'), async (req, res) => {
  try {
    if (!_isManagerRole(req.user)) return res.status(403).json({ success: false, error: 'Relatórios por e-mail são só para gestores.' });
    const VALID = ['daily', 'weekly', 'monthly', 'quarterly', 'yearly'];
    const freqs = Array.isArray(req.body.frequencies) ? req.body.frequencies.filter(f => VALID.includes(f)) : [];
    const emailReports = req.body.emailReports === true;
    await db.pool.query(
      'UPDATE users SET pm_email_reports = $1, pm_report_frequencies = $2::jsonb WHERE id = $3',
      [emailReports, JSON.stringify(freqs), req.user.id]
    );
    res.json({ success: true, data: { emailReports, frequencies: freqs } });
  } catch (error) { res.status(400).json({ success: false, error: error.message }); }
});

// ─── PM Fase 8: relatórios administrativos + custos ───────────────────────────
const REL = 'relatorios_tarefas_gerenciamento';

app.get('/api/pm/reports/productivity', requireModulePermission(REL, 'view'), async (req, res) => {
  try {
    const data = await pmReportService.productivityByUser(db, { from: req.query.from, to: req.query.to, user: req.user });
    res.json({ success: true, data });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

app.get('/api/pm/reports/projects-health', requireModulePermission(REL, 'view'), async (req, res) => {
  try {
    const data = await pmReportService.projectsHealth(db, { user: req.user });
    res.json({ success: true, data });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

// Equipes agrupadas por gerente (admin/superadmin: todas; manager: a dele).
app.get('/api/pm/reports/teams', requireModulePermission(REL, 'view'), async (req, res) => {
  try {
    const data = await pmReportService.teamsReport(db, { from: req.query.from, to: req.query.to, user: req.user });
    res.json({ success: true, data });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

app.get('/api/pm/reports/financials', requireModulePermission(REL, 'view'), async (req, res) => {
  try {
    if (!req.query.projectId) return res.status(400).json({ success: false, error: 'projectId obrigatório' });
    const data = await pmCostService.getProjectFinancials(db, req.query.projectId);
    if (!data) return res.status(404).json({ success: false, error: 'Projeto não encontrado' });
    res.json({ success: true, data });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

// Export XLSX da produtividade (usa a lib XLSX já presente no backend).
app.get('/api/pm/reports/export', requireModulePermission(REL, 'view'), async (req, res) => {
  try {
    const rows = await pmReportService.productivityByUser(db, { from: req.query.from, to: req.query.to, user: req.user });
    const aoa = [['Usuário', 'Concluídas', 'Atrasadas', 'Abertas', 'Min. ativos']]
      .concat(rows.map(r => [r.name, Number(r.completed), Number(r.overdue), Number(r.open_tasks), Number(r.active_minutes)]));
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Produtividade');
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="produtividade.xlsx"');
    res.send(buf);
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

// Export PDF da produtividade (pdfkit).
app.get('/api/pm/reports/export-pdf', requireModulePermission(REL, 'view'), async (req, res) => {
  try {
    const PDFDocument = require('pdfkit'); // lazy: não derruba o server se faltar a lib
    const rows = await pmReportService.productivityByUser(db, { from: req.query.from, to: req.query.to, user: req.user });
    const doc = new PDFDocument({ margin: 40, size: 'A4' });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="produtividade.pdf"');
    doc.pipe(res);

    doc.fontSize(16).fillColor('#111827').text('Relatório de Produtividade');
    doc.moveDown(0.2).fontSize(10).fillColor('#6b7280')
      .text(`Período: ${req.query.from || '—'} a ${req.query.to || '—'}  ·  gerado em ${new Date().toLocaleString('pt-BR')}`);
    doc.moveDown(0.8);

    const colX = [40, 250, 335, 415, 480];      // x de cada coluna; tabela vai até 555
    const right = 555;
    const headers = ['Usuário', 'Concluídas', 'Atrasadas', 'Abertas', 'Min. ativos'];
    let y = doc.y;
    doc.rect(40, y, right - 40, 18).fill('#6d28d9');
    doc.fillColor('#ffffff').fontSize(9);
    headers.forEach((h, i) => doc.text(h, colX[i] + 3, y + 5, { width: (colX[i + 1] || right) - colX[i] - 6, align: i === 0 ? 'left' : 'right' }));
    y += 22;

    doc.fontSize(9);
    rows.forEach(r => {
      if (y > 790) { doc.addPage(); y = 40; }
      const cells = [r.name, String(r.completed), String(r.overdue), String(r.open_tasks), String(r.active_minutes)];
      doc.fillColor('#111827');
      cells.forEach((c, i) => doc.text(c, colX[i] + 3, y, { width: (colX[i + 1] || right) - colX[i] - 6, align: i === 0 ? 'left' : 'right' }));
      y += 15;
      doc.moveTo(40, y - 3).lineTo(right, y - 3).strokeColor('#eef0f3').lineWidth(0.5).stroke();
    });
    if (!rows.length) doc.fillColor('#6b7280').text('Sem dados no período.', 40, y + 4);

    doc.end();
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

// Vincular/desvincular transação a projeto (custo recalculado por trigger).
app.post('/api/transactions/:id/link-project', requireModulePermission('projects', 'edit'), async (req, res) => {
  try {
    const data = await pmCostService.linkTransactionToProject(db, req.params.id, req.body.projectId || null);
    res.json({ success: true, data });
  } catch (error) { res.status(error.status || 400).json({ success: false, error: error.message }); }
});

// Vincular VÁRIAS transações a um projeto (ação em massa). projectId null = desvincula.
app.post('/api/transactions/link-project-bulk', requireModulePermission('projects', 'edit'), async (req, res) => {
  try {
    const ids = Array.isArray(req.body.ids) ? req.body.ids : [];
    const data = await pmCostService.linkTransactionsToProject(db, ids, req.body.projectId || null);
    res.json({ success: true, data });
  } catch (error) { res.status(error.status || 400).json({ success: false, error: error.message }); }
});

// Transações vinculadas a um projeto (aba Custos).
app.get('/api/projects/:id/transactions', requireModulePermission('projects', 'view'), async (req, res) => {
  try {
    const r = await db.pool.query(
      `SELECT id, date, description, value, type, category FROM transactions WHERE project_id = $1 ORDER BY date DESC`,
      [req.params.id]
    );
    res.json({ success: true, data: r.rows });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

// Despesas ainda não vinculadas (picker de vínculo).
app.get('/api/pm/unlinked-transactions', requireModulePermission('projects', 'edit'), async (req, res) => {
  try {
    const r = await db.pool.query(
      `SELECT id, date, description, value, type FROM transactions
        WHERE project_id IS NULL AND type = 'Despesa' ORDER BY date DESC LIMIT 100`
    );
    res.json({ success: true, data: r.rows });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

// Lista enxuta de usuários p/ pickers (atribuição, ajuda). Só campos públicos.
app.get('/api/pm/users', requireModulePermission('tarefas_gerenciamento', 'view'), async (req, res) => {
  try {
    const users = await db.getAllUsers();
    const data = (users || [])
      .filter(u => u.is_active !== false)
      .map(u => ({
        id: u.id,
        name: [u.first_name, u.last_name].filter(Boolean).join(' ') || u.username,
        role: u.role,
      }));
    res.json({ success: true, data });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

// Usuários a quem o ator PODE atribuir a tarefa (escopo) — para o dropdown do assign.
app.get('/api/pm/assignable-users', requireModulePermission('tarefas_gerenciamento', 'view'), async (req, res) => {
  try {
    if (!_isManagerRole(req.user)) return res.status(403).json({ success: false, error: 'Apenas gestores atribuem tarefas.' });
    const actor = req.user;
    const task = req.query.taskId ? await pmTaskService.getTask(db.pool, req.query.taskId) : null;

    // Contexto do manager (1x): gerencia o projeto? quem está na equipe dele?
    let ownsProject = false, teamSet = new Set();
    if (actor.role === 'manager') {
      if (task && task.project_id) {
        const p = await db.pool.query('SELECT manager_user_id FROM projects WHERE id = $1', [task.project_id]);
        ownsProject = p.rows[0]?.manager_user_id === actor.id;
      }
      if (!ownsProject) {
        const h = await db.pool.query('SELECT DISTINCT to_user_id FROM task_assignments_history WHERE assigned_by_user_id = $1', [actor.id]);
        teamSet = new Set(h.rows.map(r => r.to_user_id));
      }
    }

    const users = (await db.getAllUsers() || []).filter(u => u.is_active !== false);
    const data = users.filter(u => {
      if (actor.role === 'superadmin') return true;
      if (actor.role === 'admin') return u.id === actor.id || !(u.role === 'admin' || u.role === 'superadmin');
      if (actor.role === 'manager') return u.id === actor.id || ownsProject || teamSet.has(u.id);
      return false;
    }).map(u => ({ id: u.id, name: [u.first_name, u.last_name].filter(Boolean).join(' ') || u.username, role: u.role }));

    res.json({ success: true, data });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

// ─── PM Fase 6: revisão, anexos e ajuda ───────────────────────────────────────

// Enviar p/ revisão (responsável/gestor).
app.post('/api/tasks/:taskId/submit-review', requireModulePermission('tarefas_gerenciamento', 'edit'), async (req, res) => {
  try {
    const task = await _guardTaskActor(req, res, req.params.taskId);
    if (!task) return;
    res.json({ success: true, data: await pmTaskService.submitForReview(db, req.params.taskId, { userId: req.user?.id || null }) });
  } catch (error) { res.status(error.status || 400).json({ success: false, error: error.message, code: error.code }); }
});

// Aprovar / reprovar revisão (admin/manager).
app.post('/api/tasks/:taskId/review/approve', requireModulePermission('tarefas_gerenciamento', 'edit'), async (req, res) => {
  try {
    if (!_isManagerRole(req.user)) return res.status(403).json({ success: false, error: 'Apenas admin/gerente revisa.' });
    const result = await pmTaskService.approveReview(db, req.params.taskId, { id: req.user.id, role: req.user.role });
    res.json({ success: true, data: result });
  } catch (error) { res.status(error.status || 400).json({ success: false, error: error.message, code: error.code }); }
});

app.post('/api/tasks/:taskId/review/reject', requireModulePermission('tarefas_gerenciamento', 'edit'), async (req, res) => {
  try {
    if (!_isManagerRole(req.user)) return res.status(403).json({ success: false, error: 'Apenas admin/gerente revisa.' });
    const result = await pmTaskService.rejectReview(db, req.params.taskId, { userId: req.user.id, adjustmentNotes: req.body.adjustmentNotes });
    res.json({ success: true, data: result });
  } catch (error) { res.status(error.status || 400).json({ success: false, error: error.message, code: error.code }); }
});

// Fila de revisões pendentes (admin/manager).
app.get('/api/pm/pending-reviews', requireModulePermission('tarefas_gerenciamento', 'view'), async (req, res) => {
  try {
    if (!_isManagerRole(req.user)) return res.status(403).json({ success: false, error: 'Apenas admin/gerente.' });
    res.json({ success: true, data: await pmTaskService.listPendingReviews(db) });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

// Anexos.
app.post('/api/tasks/:taskId/attachments', requireModulePermission('tarefas_gerenciamento', 'edit'), uploadPmAttachment.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, error: 'Arquivo obrigatório' });
    const task = await pmTaskService.getTask(db.pool, req.params.taskId);
    if (!task) return res.status(404).json({ success: false, error: 'Tarefa não encontrada' });
    const id = db.generateId();
    await db.pool.query(
      `INSERT INTO task_attachments (id, task_id, file_name, stored_name, mime, size_bytes, uploaded_by_user_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [id, req.params.taskId, req.file.originalname, req.file.filename, req.file.mimetype, req.file.size, req.user?.id || null]
    );
    res.json({ success: true, data: { id, fileName: req.file.originalname } });
  } catch (error) { res.status(400).json({ success: false, error: error.message }); }
});

app.get('/api/tasks/:taskId/attachments', requireModulePermission('tarefas_gerenciamento', 'view'), async (req, res) => {
  try {
    const r = await db.pool.query(
      `SELECT id, file_name, mime, size_bytes, uploaded_by_user_id, uploaded_at FROM task_attachments WHERE task_id = $1 ORDER BY uploaded_at DESC`,
      [req.params.taskId]
    );
    res.json({ success: true, data: r.rows });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

app.get('/api/pm/attachments/:id/download', requireModulePermission('tarefas_gerenciamento', 'view'), async (req, res) => {
  try {
    const r = await db.pool.query('SELECT * FROM task_attachments WHERE id = $1', [req.params.id]);
    const att = r.rows[0];
    if (!att) return res.status(404).json({ success: false, error: 'Anexo não encontrado' });
    const filePath = path.join(pmAttachmentsDir, att.stored_name);
    if (!fs.existsSync(filePath)) return res.status(404).json({ success: false, error: 'Arquivo ausente no servidor' });
    res.download(filePath, att.file_name);
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

app.delete('/api/pm/attachments/:id', requireModulePermission('tarefas_gerenciamento', 'edit'), async (req, res) => {
  try {
    const r = await db.pool.query('DELETE FROM task_attachments WHERE id = $1 RETURNING stored_name', [req.params.id]);
    if (r.rows[0]) {
      const fp = path.join(pmAttachmentsDir, r.rows[0].stored_name);
      if (fs.existsSync(fp)) { try { fs.unlinkSync(fp); } catch { /* noop */ } }
    }
    res.json({ success: true });
  } catch (error) { res.status(400).json({ success: false, error: error.message }); }
});

// Pedidos de ajuda.
app.post('/api/tasks/:taskId/help-request', requireModulePermission('tarefas_gerenciamento', 'edit'), async (req, res) => {
  try {
    const data = await pmHelpService.createHelpRequest(db, req.params.taskId, {
      requesterUserId: req.user.id, targetUserId: req.body.targetUserId, message: req.body.message || null,
    });
    res.json({ success: true, data });
  } catch (error) { res.status(error.status || 400).json({ success: false, error: error.message, code: error.code }); }
});

app.get('/api/me/help-requests', requireModulePermission('tarefas_gerenciamento', 'view'), async (req, res) => {
  try { res.json({ success: true, data: await pmHelpService.listIncomingHelp(db, req.user.id) }); }
  catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

const helpActions = {
  accept:   (id, req) => pmHelpService.acceptHelp(db, id, { userId: req.user.id }),
  refuse:   (id, req) => pmHelpService.refuseHelp(db, id, { userId: req.user.id, reason: req.body.reason }),
  complete: (id, req) => pmHelpService.markCollaborationComplete(db, id, { userId: req.user.id, notes: req.body.notes || null }),
};
for (const action of Object.keys(helpActions)) {
  app.post(`/api/help-requests/:id/${action}`, requireModulePermission('tarefas_gerenciamento', 'edit'), async (req, res) => {
    try { res.json({ success: true, data: await helpActions[action](req.params.id, req) }); }
    catch (error) { res.status(error.status || 400).json({ success: false, error: error.message, code: error.code }); }
  });
}

// ─── PM Fase 5: Pomodoro (controle de tempo) ──────────────────────────────────
// Endpoints pessoais — escopo sempre req.user.id. Só autenticação (já global).

app.get('/api/pomodoro/active', async (req, res) => {
  try {
    const session = await pmPomodoroService.getActiveSession(db, req.user.id);
    res.json({ success: true, data: session });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

app.post('/api/pomodoro/sessions', async (req, res) => {
  try {
    const result = await pmPomodoroService.startSession(db, {
      userId: req.user.id,
      taskId: req.body.taskId || null,
      category: req.body.category || null,
      plannedMinutes: Number(req.body.plannedMinutes) || 25,
      breakMinutes: req.body.breakMinutes != null ? Number(req.body.breakMinutes) : null,
    });
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(error.status || 400).json({ success: false, error: error.message, code: error.code, remainingMinutes: error.remainingMinutes });
  }
});

const pomodoroActions = {
  pause:          (id, req) => pmPomodoroService.pauseSession(db, id, req.user.id),
  resume:         (id, req) => pmPomodoroService.resumeSession(db, id, req.user.id),
  complete:       (id, req) => pmPomodoroService.completeActive(db, id, req.user.id),
  'finish-break': (id, req) => pmPomodoroService.finishBreak(db, id, req.user.id),
  'skip-break':   (id, req) => pmPomodoroService.skipBreak(db, id, req.user.id),
  abort:          (id, req) => pmPomodoroService.abortSession(db, id, req.user.id, { reason: req.body?.reason || 'manual' }),
  heartbeat:      (id, req) => pmPomodoroService.heartbeat(db, id, req.user.id),
};
for (const action of Object.keys(pomodoroActions)) {
  app.post(`/api/pomodoro/sessions/:id/${action}`, async (req, res) => {
    try {
      const data = await pomodoroActions[action](req.params.id, req);
      res.json({ success: true, data });
    } catch (error) {
      res.status(error.status || 400).json({ success: false, error: error.message, code: error.code });
    }
  });
}

app.get('/api/pomodoro/stats', async (req, res) => {
  try {
    const stats = await pmPomodoroService.getStats(db, req.user.id, { range: req.query.range || 'day' });
    res.json({ success: true, data: stats });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

// ─── Excedente de tempo diário (recomendação + aprovação de gestor) ───────────
// Status do meu pedido de hoje.
app.get('/api/pomodoro/overage', async (req, res) => {
  try { res.json({ success: true, data: await pmPomodoroService.getOverageToday(db, req.user.id) }); }
  catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

// Solicitar aprovação do excedente (justificativa opcional).
app.post('/api/pomodoro/overage', async (req, res) => {
  try {
    const data = await pmPomodoroService.requestOverage(db, req.user.id, { justification: req.body.justification || null });
    res.json({ success: true, data });
  } catch (error) { res.status(error.status || 400).json({ success: false, error: error.message, code: error.code }); }
});

// Fila de pedidos pendentes (gestor).
app.get('/api/pomodoro/overage/pending', async (req, res) => {
  try {
    if (!_isManagerRole(req.user)) return res.status(403).json({ success: false, error: 'Apenas gestores.' });
    res.json({ success: true, data: await pmPomodoroService.listPendingOverages(db) });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

// Aprovar/negar um pedido (gestor).
app.post('/api/pomodoro/overage/:id/decide', async (req, res) => {
  try {
    if (!_isManagerRole(req.user)) return res.status(403).json({ success: false, error: 'Apenas gestores.' });
    const data = await pmPomodoroService.decideOverage(db, req.params.id, req.user, { approved: req.body.approved === true });
    res.json({ success: true, data });
  } catch (error) { res.status(error.status || 400).json({ success: false, error: error.message, code: error.code }); }
});

app.get('/api/pomodoro/config', async (req, res) => {
  try { res.json({ success: true, data: await pmPomodoroService.getConfig(db, req.user.id) }); }
  catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

app.put('/api/pomodoro/config', async (req, res) => {
  try {
    const cfg = await pmPomodoroService.updateConfig(db, req.user.id, {
      dailyLimitMinutes: req.body.dailyLimitMinutes,
      idleAlertMinutes: req.body.idleAlertMinutes,
      soundEnabled: req.body.soundEnabled,
    });
    res.json({ success: true, data: cfg });
  } catch (error) { res.status(400).json({ success: false, error: error.message }); }
});

// Idle tracking: registra abertura da área de tarefas (alerta 5min é client-side
// nesta fase; notificação proativa via cron entra na Fase 7).
app.post('/api/me/task-area-opened', async (req, res) => {
  try {
    await db.pool.query(
      `INSERT INTO task_idle_tracking (id, user_id, opened_at) VALUES ($1, $2, NOW())`,
      [db.generateId(), req.user.id]
    );
    res.json({ success: true });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
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
    // Serviços de sistema (ex.: svc_terracontrol_default) não podem ser excluídos.
    const svc = await db.pool.query('SELECT is_system FROM services WHERE id = $1', [id]);
    if (svc.rows[0]?.is_system === true) {
      return res.status(403).json({ success: false, error: 'Serviço de sistema não pode ser excluído.' });
    }
    await db.deleteService(id);
    res.json({ success: true, message: 'Serviço excluído com sucesso' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ─── PM Fase 2: Template de serviço (etapas/tarefas/deps/triggers) ────────────
// Auth: middleware global já aplica authenticateToken; gate granular por módulo
// 'services' (view p/ ler, edit p/ mutar). superadmin/admin têm bypass.

// Template completo aninhado.
app.get('/api/services/:id/template', requireModulePermission('services', 'view'), async (req, res) => {
  try {
    const tpl = await pmTemplateService.getServiceTemplate(db, req.params.id, {
      version: req.query.version ? Number(req.query.version) : undefined,
    });
    res.json({ success: true, data: tpl });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Stages
app.post('/api/services/:id/template/stages', requireModulePermission('services', 'edit'), async (req, res) => {
  try {
    const stage = await pmTemplateService.createStage(db, req.params.id, req.body);
    res.json({ success: true, data: stage });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

// Reordenação manual de etapas (setas) — em transação, sem colisão de unique.
app.put('/api/services/:id/template/stages/reorder', requireModulePermission('services', 'edit'), async (req, res) => {
  try {
    await pmTemplateService.reorderStages(db, req.params.id, Number(req.body.version) || 1, req.body.orderedIds || []);
    res.json({ success: true });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

app.patch('/api/services/:id/template/stages/:stageId', requireModulePermission('services', 'edit'), async (req, res) => {
  try {
    const stage = await pmTemplateService.updateStage(db, req.params.stageId, req.body);
    res.json({ success: true, data: stage });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

app.delete('/api/services/:id/template/stages/:stageId', requireModulePermission('services', 'edit'), async (req, res) => {
  try {
    await pmTemplateService.deleteStage(db, req.params.stageId);
    res.json({ success: true });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

// Tasks
app.post('/api/services/:id/template/stages/:stageId/tasks', requireModulePermission('services', 'edit'), async (req, res) => {
  try {
    const task = await pmTemplateService.createTask(db, req.params.stageId, req.body);
    res.json({ success: true, data: task });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

app.patch('/api/services/:id/template/tasks/:taskId', requireModulePermission('services', 'edit'), async (req, res) => {
  try {
    const task = await pmTemplateService.updateTask(db, req.params.taskId, req.body);
    res.json({ success: true, data: task });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

app.delete('/api/services/:id/template/tasks/:taskId', requireModulePermission('services', 'edit'), async (req, res) => {
  try {
    await pmTemplateService.deleteTask(db, req.params.taskId);
    res.json({ success: true });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

// Dependências (start/completion; alvo task|stage). Valida ciclo → 400.
app.post('/api/services/:id/template/tasks/:taskId/dependencies', requireModulePermission('services', 'edit'), async (req, res) => {
  try {
    const dep = await pmTemplateService.createDependency(db, req.params.taskId, req.body);
    res.json({ success: true, data: dep });
  } catch (error) {
    const status = error.code === 'dependency_cycle' ? 400 : 400;
    res.status(status).json({ success: false, error: error.message, code: error.code });
  }
});

app.delete('/api/services/:id/template/dependencies/:depId', requireModulePermission('services', 'edit'), async (req, res) => {
  try {
    await pmTemplateService.deleteDependency(db, req.params.depId);
    res.json({ success: true });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

// Triggers (criam tarefa nova quando a source completa).
app.post('/api/services/:id/template/tasks/:taskId/triggers', requireModulePermission('services', 'edit'), async (req, res) => {
  try {
    const trigger = await pmTemplateService.createTrigger(db, req.params.taskId, req.body);
    res.json({ success: true, data: trigger });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message, code: error.code });
  }
});

app.delete('/api/services/:id/template/triggers/:triggerId', requireModulePermission('services', 'edit'), async (req, res) => {
  try {
    await pmTemplateService.deleteTrigger(db, req.params.triggerId);
    res.json({ success: true });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

// Version bump: cria v(N+1) preservando a versão atual.
app.post('/api/services/:id/template/version-bump', requireModulePermission('services', 'edit'), async (req, res) => {
  try {
    const newVersion = await pmTemplateService.versionBump(db, req.params.id);
    res.json({ success: true, data: { version: newVersion } });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

// APIs para TerraControl
app.get('/api/terracontrol', async (req, res) => {
  try {
    const records = await db.getAllTerraControl();
    res.json({ success: true, data: records });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/terracontrol', async (req, res) => {
  try {
    const record = await db.saveTerraControl(req.body);
    db.appendRecordEvent({
      terracontrolId: record.id,
      eventType: 'created',
      actorType: 'impgeo',
      actorId: req.user?.id || null,
      payload: { imovel: record.imovel, municipio: record.municipio },
    });
    res.json({ success: true, data: record });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Edição genérica de registro pelo admin. Quando o registro pertence a um
// tc_user (created_by_tc_user_id populado), notifica o dono via sino + email.
// Edição feita pelo próprio tc_user usa outro endpoint: PUT /api/tc-auth/me/
// records/:id — esse não dispara notif/email (ele é o ator).
app.put('/api/terracontrol/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const record = await db.updateTerraControl(id, req.body);
    db.appendRecordEvent({
      terracontrolId: id,
      eventType: 'edited',
      actorType: 'impgeo',
      actorId: req.user.id,
      payload: { fields: Object.keys(req.body || {}) },
    });
    const editedByName = req.user?.name || req.user?.username || 'um administrador';
    dispatchTcRecordEventToOwner(record, 'edited', { editedByName }).catch(() => {});
    res.json({ success: true, data: record });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.delete('/api/terracontrol/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await db.deleteTerraControl(id);
    res.json({ success: true, message: 'Registro excluído com sucesso' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Helper: notifica o tc_user dono do registro sobre uma ação do admin
// (aprovação / edição). Dispara o sino in-app via tc_notifications e
// também um email via SendGrid, ambos fire-and-forget. Erros são logados
// mas não quebram a request principal — falha de email/notif não deve
// reverter aprovação ou edição.
//
// `event` controla a cópia: 'approved' ou 'edited'.
async function dispatchTcRecordEventToOwner(record, event, { editedByName } = {}) {
  if (!record) return;
  const tcUserId = record.created_by_tc_user_id;
  if (!tcUserId) return; // registro não é de um tc_user — nada a fazer

  let tcUser;
  try {
    tcUser = await db.getTcUserById(tcUserId);
  } catch (e) {
    console.error('[tc-notif] Falha ao buscar tc_user:', e?.message);
    return;
  }
  if (!tcUser) return;

  const imovel = record.imovel || '';
  const municipio = record.municipio || '';
  const codImovel = record.cod_imovel != null ? record.cod_imovel : null;
  const username = [tcUser.first_name, tcUser.last_name].filter(Boolean).join(' ').trim()
    || tcUser.username
    || 'usuário';

  const title = event === 'approved'
    ? 'Seu registro foi aprovado'
    : 'Seu registro foi atualizado';
  const message = event === 'approved'
    ? `${imovel}${municipio ? ` em ${municipio}` : ''} — agora visível no TerraControl`
    : `${editedByName || 'Um administrador'} editou ${imovel}${municipio ? ` em ${municipio}` : ''}`;

  // 1) Sino in-app (tc_notifications) + push pro tc_user dono
  try {
    const tcNotif = await db.createTcNotification({
      tc_user_id: tcUserId,
      notification_type: event === 'approved' ? 'tc_record_approved' : 'tc_record_edited',
      title,
      message,
      related_entity_type: 'terracontrol',
      related_entity_id: record.id,
    });
    pushDispatcher.send(db, 'tc', tcUserId, tcNotif).catch(() => {});
  } catch (e) {
    console.error('[tc-notif] Falha ao gravar notif in-app:', e?.message);
  }

  // 2) Email — só dispara se tc_user tiver email E não tiver desligado
  // (opt-out via tc_users.email_notifications). Default DB é TRUE.
  // NÃO afeta emails transacionais críticos (reset de senha, convite).
  if (!tcUser.email) return;
  if (tcUser.email_notifications === false) return;
  const loginUrl = process.env.TC_PUBLIC_URL || 'https://terracontrol.viverdepj.com.br';
  try {
    if (event === 'approved') {
      await enviarEmailTcRegistroAprovado({
        toEmail: tcUser.email,
        username,
        imovel,
        municipio,
        codImovel,
        loginUrl,
      });
    } else {
      await enviarEmailTcRegistroEditado({
        toEmail: tcUser.email,
        username,
        imovel,
        municipio,
        codImovel,
        editedByName,
        loginUrl,
      });
    }
  } catch (e) {
    console.error('[tc-notif] Falha ao enviar email:', e?.message);
  }
}

// PATCH /api/admin/terracontrol/:id/approve — admin aprova registro pendente
// Requer auth impgeo (admin/superadmin OU usuário com módulo terracontrol).
app.patch('/api/admin/terracontrol/:id/approve', authenticateToken, requireTerraControlAccess, async (req, res) => {
  try {
    const updated = await db.approveTerraControlRecord(req.params.id, req.user.id);
    db.appendRecordEvent({
      terracontrolId: req.params.id,
      eventType: 'approved',
      actorType: 'impgeo',
      actorId: req.user.id,
    });
    // Notif + email pro tc_user dono (fire-and-forget, sem await pra não
    // atrasar o response). Falha aqui não desfaz a aprovação.
    dispatchTcRecordEventToOwner(updated, 'approved').catch(() => {});
    res.json({ success: true, data: updated });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message || 'Erro ao aprovar' });
  }
});

// PATCH /api/admin/terracontrol/:id/unapprove — admin revoga aprovação
app.patch('/api/admin/terracontrol/:id/unapprove', authenticateToken, requireTerraControlAccess, async (req, res) => {
  try {
    const updated = await db.unapproveTerraControlRecord(req.params.id);
    db.appendRecordEvent({
      terracontrolId: req.params.id,
      eventType: 'unapproved',
      actorType: 'impgeo',
      actorId: req.user.id,
    });
    res.json({ success: true, data: updated });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message || 'Erro ao revogar aprovação' });
  }
});

// ===========================================================================
// Orçamentos TerraControl — admin endpoints (migration 040)
// ===========================================================================
// Todas exigem authenticateToken + requireTerraControlAccess. Lógica de
// negócio fica em budgetService; aqui só validação básica e dispatch fire-
// and-forget de notificações.

// GET /api/admin/tc-budgets/template — template padrão ativo (1 por vez MVP)
app.get('/api/admin/tc-budgets/template', authenticateToken, requireTerraControlAccess, async (req, res) => {
  try {
    const tpl = await budgetService.getTemplate();
    res.json({ success: true, data: tpl });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message || 'Erro ao carregar template' });
  }
});

// PUT /api/admin/tc-budgets/template — upsert do template ativo
app.put('/api/admin/tc-budgets/template', authenticateToken, requireTerraControlAccess, async (req, res) => {
  try {
    const { name, contentJson, defaultItems } = req.body || {};
    if (!contentJson || typeof contentJson !== 'object') {
      return res.status(400).json({ success: false, error: 'contentJson (TipTap JSON) é obrigatório' });
    }
    const saved = await budgetService.saveTemplate({
      name,
      contentJson,
      defaultItems: Array.isArray(defaultItems) ? defaultItems : [],
      updatedByUserId: req.user.id,
    });
    res.json({ success: true, data: saved });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message || 'Erro ao salvar template' });
  }
});

// GET /api/admin/tc-budgets/by-record/:terracontrolId — orçamento ativo do imóvel
// Retorna 200 + data:null se não existe (UI usa pra decidir entre "Gerar" / "Ver").
app.get('/api/admin/tc-budgets/by-record/:terracontrolId', authenticateToken, requireTerraControlAccess, async (req, res) => {
  try {
    const budget = await db.getBudgetByTerracontrolId(req.params.terracontrolId);
    if (!budget) return res.json({ success: true, data: null });
    const full = await budgetService.getBudgetForAdmin(budget.id);
    res.json({ success: true, data: full });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message || 'Erro ao carregar orçamento' });
  }
});

// GET /api/admin/tc-budgets/:id — full payload (budget + revisions + requests + events)
app.get('/api/admin/tc-budgets/:id', authenticateToken, requireTerraControlAccess, async (req, res) => {
  try {
    const full = await budgetService.getBudgetForAdmin(req.params.id);
    if (!full) return res.status(404).json({ success: false, error: 'Orçamento não encontrado' });
    res.json({ success: true, data: full });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message || 'Erro ao carregar orçamento' });
  }
});

// POST /api/admin/tc-budgets — cria/envia orçamento (status passa direto pra sent)
// Se já existe budget ativo, ESTE endpoint não é o caminho — use /:id/revise.
// Body: { terracontrolId, contentJson, items }
app.post('/api/admin/tc-budgets', authenticateToken, requireTerraControlAccess, async (req, res) => {
  try {
    const { terracontrolId, contentJson, items } = req.body || {};
    if (!terracontrolId) return res.status(400).json({ success: false, error: 'terracontrolId obrigatório' });
    if (!contentJson || typeof contentJson !== 'object') {
      return res.status(400).json({ success: false, error: 'contentJson (TipTap JSON) é obrigatório' });
    }
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ success: false, error: 'Adicione pelo menos um item ao orçamento' });
    }
    const existing = await db.getBudgetByTerracontrolId(terracontrolId);
    if (existing && existing.current_revision > 0) {
      return res.status(409).json({
        success: false,
        error: `Já existe orçamento ativo para este imóvel (status: ${existing.status}). Use o endpoint de revisão.`,
      });
    }
    const { budget, revision, record } = await budgetService.sendBudget({
      terracontrolId, actorUserId: req.user.id, contentJson, items,
    });
    // Fire-and-forget — notificação não atrasa response
    budgetDispatcher.dispatchTcBudgetEventToOwner(budget, record, 'sent').catch(() => {});
    res.json({ success: true, data: { budget, revision } });
  } catch (error) {
    console.error('Erro POST /api/admin/tc-budgets:', error);
    res.status(500).json({ success: false, error: error.message || 'Erro ao enviar orçamento' });
  }
});

// POST /api/admin/tc-budgets/:id/revise — cria nova revisão (v2, v3, …)
// Body: { contentJson, items }
app.post('/api/admin/tc-budgets/:id/revise', authenticateToken, requireTerraControlAccess, async (req, res) => {
  try {
    const { contentJson, items } = req.body || {};
    if (!contentJson || typeof contentJson !== 'object') {
      return res.status(400).json({ success: false, error: 'contentJson é obrigatório' });
    }
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ success: false, error: 'Adicione pelo menos um item' });
    }
    const existing = await db.getBudgetById(req.params.id);
    if (!existing) return res.status(404).json({ success: false, error: 'Orçamento não encontrado' });
    const { budget, revision, record } = await budgetService.sendBudget({
      terracontrolId: existing.terracontrol_id,
      actorUserId: req.user.id,
      contentJson,
      items,
    });
    budgetDispatcher.dispatchTcBudgetEventToOwner(budget, record, 'revised', {
      revisionNumber: revision.revision_number,
    }).catch(() => {});
    res.json({ success: true, data: { budget, revision } });
  } catch (error) {
    console.error('Erro POST /api/admin/tc-budgets/:id/revise:', error);
    res.status(500).json({ success: false, error: error.message || 'Erro ao revisar orçamento' });
  }
});

// POST /api/admin/tc-budgets/:id/cancel — admin cancela orçamento
app.post('/api/admin/tc-budgets/:id/cancel', authenticateToken, requireTerraControlAccess, async (req, res) => {
  try {
    const { reason } = req.body || {};
    const cancelled = await budgetService.cancelBudget({
      budgetId: req.params.id, actorUserId: req.user.id, reason,
    });
    res.json({ success: true, data: cancelled });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message || 'Erro ao cancelar' });
  }
});

// POST /api/admin/tc-budgets/:id/dismiss-revision — admin descarta pedido de revisão
// Body: { reason }
// Status volta 'revision_requested' → 'sent'. Notifica + envia e-mail pro tc_user.
app.post('/api/admin/tc-budgets/:id/dismiss-revision', authenticateToken, requireTerraControlAccess, async (req, res) => {
  try {
    const { reason } = req.body || {};
    const { budget, reason: cleanReason } = await budgetService.dismissRevision({
      budgetId: req.params.id, actorUserId: req.user.id, reason,
    });
    // Dispatch fire-and-forget pro tc_user
    (async () => {
      try {
        const rows = await db.getTerraControlByIds([budget.terracontrol_id]);
        const record = rows[0];
        if (record) {
          await budgetDispatcher.dispatchTcBudgetEventToOwner(budget, record, 'revision_dismissed', {
            reason: cleanReason,
          });
        }
      } catch (e) {
        console.error('[dismiss-revision] Falha no dispatch:', e?.message);
      }
    })();
    res.json({ success: true, data: budget });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message || 'Erro ao descartar revisão' });
  }
});

// GET /api/admin/tc-records/:id/history — histórico completo do imóvel:
// eventos do registro + orçamento ativo (revisões/pedidos/eventos) intercalados.
// Front ordena/exibe — endpoint só agrega.
app.get('/api/admin/tc-records/:id/history', authenticateToken, requireTerraControlAccess, async (req, res) => {
  try {
    const recordRows = await db.getTerraControlByIds([req.params.id]);
    const record = recordRows[0];
    if (!record) return res.status(404).json({ success: false, error: 'Registro não encontrado' });
    const recordEvents = await db.listRecordEvents(req.params.id);
    const budget = await db.getBudgetByTerracontrolId(req.params.id);
    let budgetData = null;
    if (budget) {
      budgetData = await budgetService.getBudgetForAdmin(budget.id);
    }
    res.json({ success: true, data: { record, recordEvents, budget: budgetData } });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message || 'Erro ao carregar histórico' });
  }
});

// POST /api/admin/tc-budgets/preview-pdf — gera PDF temporário pra preview
// no editor (admin clica "Visualizar PDF" antes de enviar). NÃO persiste em
// uploads/documents — vai pra /tmp, é stream-ed pro response, depois apagado.
// Body: { terracontrolId, contentJson, items }
app.post('/api/admin/tc-budgets/preview-pdf', authenticateToken, requireTerraControlAccess, async (req, res) => {
  const { renderBudgetPdf } = require('./services/budget-pdf');
  const os = require('os');
  const path = require('path');
  const crypto = require('crypto');
  const fs = require('fs');
  let tmpPath = null;
  try {
    const { terracontrolId, contentJson, items } = req.body || {};
    if (!terracontrolId) return res.status(400).json({ success: false, error: 'terracontrolId obrigatório' });
    if (!contentJson || typeof contentJson !== 'object') {
      return res.status(400).json({ success: false, error: 'contentJson obrigatório' });
    }
    const rows = await db.getTerraControlByIds([terracontrolId]);
    const record = rows[0];
    if (!record) return res.status(404).json({ success: false, error: 'Registro não encontrado' });
    let tcUser = null;
    if (record.created_by_tc_user_id) {
      tcUser = await db.getTcUserById(record.created_by_tc_user_id);
    }
    const cleanItems = budgetService.normalizeItems(Array.isArray(items) ? items : []);
    const totalAmountCents = budgetService.computeTotalCents(cleanItems);
    // Arquivo temp com nome aleatório pra evitar colisão (multi-admin)
    tmpPath = path.join(os.tmpdir(), `tc-budget-preview-${crypto.randomBytes(8).toString('hex')}.pdf`);
    await renderBudgetPdf({
      outPath: tmpPath,
      record,
      tcUser,
      revision: {
        revision_number: ((await db.getBudgetByTerracontrolId(terracontrolId))?.current_revision || 0) + 1,
        content_json: contentJson,
        items: cleanItems,
        total_amount_cents: totalAmountCents,
        created_at: new Date().toISOString(),
      },
    });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="preview-orcamento.pdf"`);
    res.setHeader('Cache-Control', 'no-store');
    const stream = fs.createReadStream(tmpPath);
    stream.on('close', () => {
      // Cleanup: apaga o arquivo temp depois do response
      fs.unlink(tmpPath, () => {});
    });
    stream.pipe(res);
  } catch (error) {
    console.error('[tc-budgets preview-pdf] Erro:', error);
    if (tmpPath) { try { fs.unlinkSync(tmpPath); } catch {} }
    if (!res.headersSent) {
      res.status(500).json({ success: false, error: error.message || 'Erro ao gerar PDF' });
    }
  }
});

app.delete('/api/terracontrol', async (req, res) => {
  try {
    const { ids } = req.body;
    if (!Array.isArray(ids)) {
      return res.status(400).json({ success: false, error: 'IDs devem ser um array' });
    }
    const { deletedCount } = await db.deleteMultipleTerraControl(ids);
    res.json({ success: true, deletedCount, message: `${deletedCount} registro(s) excluído(s)` });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Rota para listar todos os links compartilháveis
app.get('/api/terracontrol/share-links', authenticateToken, async (req, res) => {
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

// Rota para gerar link compartilhável de records
app.post('/api/terracontrol/generate-share-link', authenticateToken, async (req, res) => {
  try {
    const { name, expiresAt, password, selectedIds } = req.body;
    const bcrypt = require('bcryptjs');

    if (!Array.isArray(selectedIds) || selectedIds.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Selecione pelo menos um registro para compartilhar'
      });
    }

    // Gerar token único para compartilhamento.
    // Política (G2.2): nome → slug + sufixo aleatório SEMPRE (não só em colisão).
    // Slug puro é enumerável; sufixo com 8 bytes (16 hex chars, 64 bits) torna
    // impraticável adivinhar — equivalente a UUID parcial. Sem nome, mantém o
    // 'view_<32bytes>' que já era seguro.
    let token = '';
    if (name && name.trim()) {
      const baseSlug = slugify(name);
      const suffix = require('crypto').randomBytes(8).toString('hex');
      token = baseSlug ? `${baseSlug}-${suffix}` : `view_${suffix}`;
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
app.put('/api/terracontrol/share-links/:token', authenticateToken, async (req, res) => {
  try {
    const { token } = req.params;
    const { name, expiresAt, password, regenerateToken } = req.body;
    const bcrypt = require('bcryptjs');

    if (regenerateToken) {
      // Mesma política do create (G2.2): sempre sufixo aleatório forte.
      let newToken = '';
      const effectiveName = name !== undefined ? name : (await db.getShareLink(token))?.name;

      if (effectiveName && effectiveName.trim()) {
        const baseSlug = slugify(effectiveName);
        const suffix = require('crypto').randomBytes(8).toString('hex');
        newToken = baseSlug ? `${baseSlug}-${suffix}` : `view_${suffix}`;
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
app.delete('/api/terracontrol/share-links/:token', authenticateToken, async (req, res) => {
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

// Helper inline para extrair contexto de request usado em auditoria (G2.6)
function shareAccessContext(req) {
  return {
    ip: req.ip || req.headers['x-forwarded-for'] || null,
    userAgent: req.headers['user-agent'] || null,
  };
}

// Rota para validar senha do link compartilhável (G2.3 rate limit, G2.6 auditoria)
app.post('/api/terracontrol/public/:token/validate-password', sharePasswordLimiter, async (req, res) => {
  const { token } = req.params;
  const ctx = shareAccessContext(req);
  try {
    const { password } = req.body;
    const bcrypt = require('bcryptjs');

    const shareLink = await db.getShareLink(token);

    if (!shareLink) {
      db.logShareLinkAccess({ token, action: 'password_check', status: 'not_found', ...ctx });
      return res.status(404).json({
        success: false,
        error: 'Link compartilhável não encontrado'
      });
    }

    const linkExpiresAt = shareLink.expiresAt || shareLink.expires_at;
    const linkPasswordHash = shareLink.passwordHash || shareLink.password_hash;

    if (linkExpiresAt) {
      const expiresAt = new Date(linkExpiresAt);
      if (new Date() > expiresAt) {
        db.logShareLinkAccess({ token, action: 'password_check', status: 'expired', ...ctx });
        return res.status(410).json({
          success: false,
          error: 'Este link compartilhável expirou e não está mais disponível'
        });
      }
    }

    if (!linkPasswordHash) {
      return res.status(400).json({
        success: false,
        error: 'Este link não possui senha'
      });
    }

    if (!password) {
      return res.status(400).json({
        success: false,
        error: 'Senha é obrigatória'
      });
    }

    const isValid = await bcrypt.compare(password, linkPasswordHash);

    if (!isValid) {
      db.logShareLinkAccess({ token, action: 'password_check', status: 'password_invalid', ...ctx });
      return res.status(401).json({
        success: false,
        error: 'Senha incorreta'
      });
    }

    db.logShareLinkAccess({ token, action: 'password_check', status: 'success', ...ctx });
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
//
// Fluxo único: token é share_link vivo (sub-share criado por tc_user via
// /api/tc-auth/me/share-links) → redireciona pra /?token=<token>. A SPA detecta
// e renderiza TerraControlView em modo 'share' (PasswordGate se necessário).
//
// Suporte ao tc_legacy_aliases foi REMOVIDO (migration 031). URLs antigas de
// share_links migrados em 2026-04 não funcionam mais.
app.get('/v/:token', async (req, res) => {
  try {
    const { token } = req.params;
    const normalizedBase = String(BASE_URL || '').trim().replace(/\/$/, '');
    res.redirect(`${normalizedBase}/?token=${token}`);
  } catch (error) {
    console.error('Erro em /v/:token:', error);
    res.status(500).send('Erro ao redirecionar');
  }
});

// G2.1 — /api/documents passa a exigir autenticação.
// Antes: express.static aberto a qualquer pessoa que descobrisse o nome do
// arquivo (pseudo-aleatório mas previsível em log/cache/histórico).
// Agora: aceita 2 fontes de auth:
//   1. Sessão autenticada do impgeo (cookie httpOnly ou Bearer Authorization)
//   2. Sessão do tc_user (Bearer com JWT aud='terracontrol') — verifica se o
//      documento pertence a algum registro do tc_user_record_access do usuário.
//   3. Share token público (?token=<share>&password=<senha-opcional>) válido,
//      desde que o documento esteja referenciado por algum registro do share
//      (car_url, matriculas_dados[].url, itr_dados[].declaracaoUrl/reciboUrl,
//      ccir_dados[].url) — confere no DB.
// Sem nenhuma das três → 401.
//
// O middleware geral '/api' pula esta rota graças à entrada '/documents' em
// publicApiPrefixes — a validação real está aqui dentro, com optionalAuth.
app.get('/api/documents/:filename', optionalAuth, async (req, res) => {
  const { filename } = req.params;

  // Path traversal: bloqueia '..' ou separadores. Multer já gera nomes
  // sanitizados, mas a rota é pública e o filename vem do cliente.
  if (!filename || filename.includes('/') || filename.includes('\\') || filename.includes('..')) {
    return res.status(400).json({ success: false, error: 'Nome de arquivo inválido' });
  }

  // Caminho 1: sessão autenticada → libera direto.
  if (req.user) {
    return res.sendFile(path.join(documentsDir, filename), {
      // G5.5 — antes era 1y. Reduzido para 7d: PDF substituído ou registro
      // deletado fica visível em todos os clientes em até uma semana, em vez
      // de eternamente no cache do navegador.
      maxAge: '7d',
      headers: { 'Cache-Control': 'private, max-age=604800' }
    }, (err) => {
      if (err && !res.headersSent) {
        res.status(err.code === 'ENOENT' ? 404 : 500).end();
      }
    });
  }

  // Caminho 2: JWT do tc_user. Verifica acesso por tc_user_record_access ao
  // registro que contém esse arquivo. Cache curto (5 min) — se admin revogar
  // o acesso, o PDF para de aparecer rapidamente.
  //
  // Aceita o JWT em DUAS fontes (header pra fetch() programático, query string
  // pra <a href> / iframe — sem header não dá pra usar Bearer em <a>):
  //   - Header: Authorization: Bearer <jwt>
  //   - Query:  ?tcAuth=<jwt>
  // Header tem precedência sobre query. O JWT na URL é considerado aceitável
  // porque (a) o access token tem vida curta (15 min) e (b) HTTPS encripta a
  // URL no transit. Logs de proxy podem capturar, mas o cost-benefit favorece
  // a UX de downloads diretos via <a>.
  let tcTokenStr = '';
  const tcAuthHeader = req.headers['authorization'];
  if (tcAuthHeader && tcAuthHeader.startsWith('Bearer ')) {
    tcTokenStr = tcAuthHeader.split(' ')[1] || '';
  } else if (req.query.tcAuth) {
    tcTokenStr = String(req.query.tcAuth).trim();
  }
  if (tcTokenStr && tcTokenStr.length > 10) {
    try {
      const tcAuth = require('./auth/tc-auth');
      const payload = tcAuth.verifyAccessToken(tcTokenStr);
      if (payload && payload.aud === tcAuth.JWT_AUDIENCE) {
        // PDFs de orçamento (migration 040): nome `budget-<id>-v<N>.pdf`.
        // Acesso garantido por tcUserOwnsBudget (ownership do registro vinculado),
        // não pela tabela tc_user_record_access (que é pra docs de matrículas/ITR/CCIR).
        const budgetMatch = /^budget-([A-Za-z0-9_-]+)-v\d+\.pdf$/.exec(filename);
        if (budgetMatch) {
          const budgetId = budgetMatch[1];
          const ownsBudget = await db.tcUserOwnsBudget(payload.sub, budgetId);
          if (!ownsBudget) {
            return res.status(403).json({ success: false, error: 'PDF do orçamento não disponível para este usuário' });
          }
          return res.sendFile(path.join(documentsDir, filename), {
            maxAge: '5m',
            headers: { 'Cache-Control': 'private, max-age=300' }
          }, (err) => {
            if (err && !res.headersSent) {
              res.status(err.code === 'ENOENT' ? 404 : 500).end();
            }
          });
        }
        // Demais PDFs (matrícula, ITR, CCIR, CAR) → fluxo normal por ACL
        const fileUrlInDb = `/api/documents/${filename}`;
        const hasAccess = await db.tcUserHasAccessToDocument(payload.sub, fileUrlInDb);
        if (!hasAccess) {
          return res.status(403).json({ success: false, error: 'Documento não disponível para este usuário' });
        }
        return res.sendFile(path.join(documentsDir, filename), {
          maxAge: '5m',
          headers: { 'Cache-Control': 'private, max-age=300' }
        }, (err) => {
          if (err && !res.headersSent) {
            res.status(err.code === 'ENOENT' ? 404 : 500).end();
          }
        });
      }
    } catch (_e) {
      // JWT inválido com aud='terracontrol' → cai pro caminho 3 (share token)
      // se houver, senão 401.
    }
  }

  // Caminho 3: share token público. Documento só é entregue se for referenciado
  // por algum registro listado em selected_ids do share.
  const shareToken = String(req.query.token || '').trim();
  const sharePassword = String(req.query.password || '').trim();
  const ctx = shareAccessContext(req);

  if (!shareToken) {
    return res.status(401).json({ success: false, error: 'Autenticação requerida' });
  }

  try {
    const shareLink = await db.getShareLink(shareToken);

    if (!shareLink) {
      db.logShareLinkAccess({ token: shareToken, action: 'document_download', status: 'not_found', document: filename, ...ctx });
      return res.status(401).json({ success: false, error: 'Link inválido' });
    }

    const linkExpiresAt = shareLink.expiresAt || shareLink.expires_at;
    const linkPasswordHash = shareLink.passwordHash || shareLink.password_hash;
    const linkSelectedIds = Array.isArray(shareLink.selectedIds)
      ? shareLink.selectedIds
      : Array.isArray(shareLink.selected_ids)
        ? shareLink.selected_ids
        : [];

    if (linkExpiresAt && new Date(linkExpiresAt) < new Date()) {
      db.logShareLinkAccess({ token: shareToken, action: 'document_download', status: 'expired', document: filename, ...ctx });
      return res.status(410).json({ success: false, error: 'Link expirou' });
    }

    if (linkPasswordHash) {
      const bcrypt = require('bcryptjs');
      if (!sharePassword) {
        db.logShareLinkAccess({ token: shareToken, action: 'document_download', status: 'password_required', document: filename, ...ctx });
        return res.status(403).json({ success: false, error: 'Senha requerida' });
      }
      const ok = await bcrypt.compare(sharePassword, linkPasswordHash);
      if (!ok) {
        db.logShareLinkAccess({ token: shareToken, action: 'document_download', status: 'password_invalid', document: filename, ...ctx });
        return res.status(401).json({ success: false, error: 'Senha incorreta' });
      }
    }

    if (linkSelectedIds.length === 0) {
      db.logShareLinkAccess({ token: shareToken, action: 'document_download', status: 'not_found', document: filename, ...ctx });
      return res.status(410).json({ success: false, error: 'Link não disponível' });
    }

    // Confirma que o arquivo solicitado pertence a algum registro do share.
    // A URL salva no DB tem prefixo "/api/documents/" — montamos e comparamos
    // contra os campos de documentos. Usa LIKE no JSONB pra cobrir url, carUrl,
    // declaracaoUrl, reciboUrl simultaneamente.
    const fileUrlInDb = `/api/documents/${filename}`;
    const ownsResult = await db.queryWithRetry(
      `SELECT 1 FROM terracontrol
       WHERE id = ANY($1::text[])
         AND (
           car_url = $2
           OR matriculas_dados::text LIKE $3
           OR itr_dados::text         LIKE $3
           OR ccir_dados::text        LIKE $3
         )
       LIMIT 1`,
      [linkSelectedIds.map(String), fileUrlInDb, `%${fileUrlInDb}%`]
    );

    if (ownsResult.rows.length === 0) {
      db.logShareLinkAccess({ token: shareToken, action: 'document_download', status: 'not_found', document: filename, ...ctx });
      return res.status(403).json({ success: false, error: 'Documento não disponível neste link' });
    }

    db.logShareLinkAccess({ token: shareToken, action: 'document_download', status: 'success', document: filename, ...ctx });
    return res.sendFile(path.join(documentsDir, filename), {
      // Cache curto no caminho público: se admin revogar acesso, navegador
      // de quem teve a URL não pode segurar o PDF eternamente.
      maxAge: '5m',
      headers: { 'Cache-Control': 'private, max-age=300' }
    }, (err) => {
      if (err && !res.headersSent) {
        res.status(err.code === 'ENOENT' ? 404 : 500).end();
      }
    });
  } catch (error) {
    console.error('Erro ao servir documento via share link:', error);
    return res.status(500).json({ success: false, error: 'Erro ao servir documento' });
  }
});

// Rota pública para visualizar records (sem autenticação) — G2.3 rate limit, G2.6 auditoria
app.get('/api/terracontrol/public/:token', sharePublicLimiter, async (req, res) => {
  const { token } = req.params;
  const ctx = shareAccessContext(req);
  try {
    const { password } = req.query;
    const bcrypt = require('bcryptjs');

    const shareLink = await db.getShareLink(token);

    if (!shareLink) {
      db.logShareLinkAccess({ token, action: 'view', status: 'not_found', ...ctx });
      return res.status(404).json({
        success: false,
        error: 'Link compartilhável não encontrado'
      });
    }

    const linkExpiresAt = shareLink.expiresAt || shareLink.expires_at;
    const linkPasswordHash = shareLink.passwordHash || shareLink.password_hash;
    const linkSelectedIds = Array.isArray(shareLink.selectedIds)
      ? shareLink.selectedIds
      : Array.isArray(shareLink.selected_ids)
        ? shareLink.selected_ids
        : [];

    if (linkExpiresAt) {
      const expiresAt = new Date(linkExpiresAt);
      if (new Date() > expiresAt) {
        db.logShareLinkAccess({ token, action: 'view', status: 'expired', ...ctx });
        return res.status(410).json({
          success: false,
          error: 'Este link compartilhável expirou e não está mais disponível'
        });
      }
    }

    if (linkPasswordHash) {
      if (!password) {
        db.logShareLinkAccess({ token, action: 'view', status: 'password_required', ...ctx });
        return res.status(403).json({
          success: false,
          requiresPassword: true,
          shareLinkName: shareLink.name,
          error: 'Este link requer senha para acesso'
        });
      }

      const isValid = await bcrypt.compare(password, linkPasswordHash);
      if (!isValid) {
        db.logShareLinkAccess({ token, action: 'view', status: 'password_invalid', ...ctx });
        return res.status(401).json({
          success: false,
          requiresPassword: true,
          shareLinkName: shareLink.name,
          error: 'Senha incorreta'
        });
      }
    }

    // Recusa share links sem seleção: a UI atual exige selectedIds.length >= 1
    // ao criar; links antigos com selected_ids NULL representavam "todos os
    // registros" — comportamento que vaza banco inteiro e foi descontinuado.
    if (linkSelectedIds.length === 0) {
      db.logShareLinkAccess({ token, action: 'view', status: 'not_found', ...ctx });
      return res.status(410).json({
        success: false,
        error: 'Este link não está mais disponível. Solicite um novo link ao administrador.'
      });
    }

    // Filtragem feita pelo banco (WHERE id = ANY) em vez de carregar a tabela
    // inteira e filtrar em JS — evita transitar dados sensíveis pela memória.
    // F: sub-share anônimo NUNCA expõe registros pendentes de aprovação.
    const allRecords = await db.getTerraControlByIds(linkSelectedIds);
    const filteredTerraControl = allRecords.filter(r => r.approved !== false);

    db.logShareLinkAccess({ token, action: 'view', status: 'success', ...ctx });
    res.json({
      success: true,
      data: filteredTerraControl,
      shareLinkName: shareLink.name
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message || 'Erro ao carregar dados'
    });
  }
});

// =============================================================================
// APIs do tc_users (usuários externos do TerraControl) — migration 025/026
// =============================================================================
const tcAuth = require('./auth/tc-auth');

function tcRequestContext(req) {
  return {
    ip: req.ip || req.headers['x-forwarded-for'] || null,
    userAgent: req.headers['user-agent'] || null,
  };
}

// POST /api/tc-auth/login — login do tc_user externo
app.post('/api/tc-auth/login', loginLimiter, async (req, res) => {
  try {
    const { username, password } = req.body || {};
    if (!username || !password) {
      return res.status(400).json({ success: false, error: 'Usuário e senha são obrigatórios' });
    }
    const ctx = tcRequestContext(req);
    const result = await tcAuth.loginTcUser(db, { username, password, ...ctx });
    if (!result.ok) {
      // F2.2: encaminha 'code' e 'email' para o frontend disparar reenvio
      // automaticamente quando for caso de convite expirado/pendente.
      const payload = { success: false, error: result.error };
      if (result.code) payload.code = result.code;
      if (result.email) payload.email = result.email;
      return res.status(result.status).json(payload);
    }
    // PR #2 (PWA): emite cookies httpOnly em .terracontrol.* além de manter
    // tokens no body (legacyTokenInBody) por 1 release pra rollback seguro
    // caso o cliente novo (TcAuthContext + tcApi) tenha algum bug em prod.
    setTcAuthCookies(req, res, result.accessToken, result.refreshToken);
    res.json({
      success: true,
      token: result.accessToken,
      refreshToken: result.refreshToken,
      tcUser: result.tcUser,
      forcePasswordChange: result.forcePasswordChange,
      legacyTokenInBody: true,
    });
  } catch (error) {
    console.error('Erro em /api/tc-auth/login:', error);
    res.status(500).json({ success: false, error: 'Erro interno do servidor' });
  }
});

// POST /api/tc-auth/refresh — rotação de refresh token
// PR #2 (PWA): aceita refresh tanto via cookie tcRefreshToken (cliente novo)
// quanto via body (cliente legado/rollback).
app.post('/api/tc-auth/refresh', async (req, res) => {
  try {
    const refreshToken = req.cookies?.tcRefreshToken || req.body?.refreshToken;
    if (!refreshToken) {
      return res.status(400).json({ success: false, error: 'Refresh token obrigatório' });
    }
    const ctx = tcRequestContext(req);
    const result = await tcAuth.rotateTcRefreshToken(db, { refreshToken, ...ctx });
    setTcAuthCookies(req, res, result.accessToken, result.refreshToken);
    res.json({
      success: true,
      token: result.accessToken,
      refreshToken: result.refreshToken,
      tcUser: tcAuth.sanitizeTcUser(result.tcUser),
      legacyTokenInBody: true,
    });
  } catch (error) {
    res.status(401).json({ success: false, error: error.message || 'Falha ao renovar sessão' });
  }
});

// POST /api/tc-auth/logout — revoga refresh + limpa cookies httpOnly
app.post('/api/tc-auth/logout', tcAuth.authenticateTcUser, async (req, res) => {
  try {
    const refreshToken = req.cookies?.tcRefreshToken || req.body?.refreshToken;
    await tcAuth.logoutTcUser(db, refreshToken);
    clearTcAuthCookies(req, res);
    res.json({ success: true });
  } catch (error) {
    clearTcAuthCookies(req, res);
    res.status(500).json({ success: false, error: 'Erro ao fazer logout' });
  }
});

// POST /api/tc-auth/recuperar-senha — dispara email com link de reset
app.post('/api/tc-auth/recuperar-senha', passwordRecoveryLimiter, async (req, res) => {
  try {
    const { email, username } = req.body || {};
    if (!email && !username) {
      return res.status(400).json({ success: false, error: 'Informe email ou usuário' });
    }
    // Resposta sempre genérica (não revela se conta existe)
    const respGenerica = { success: true, message: 'Se a conta existir, enviaremos um email com instruções.' };
    let user = null;
    if (email)    user = await db.getTcUserByEmail(email);
    if (!user && username) user = await db.getTcUserByUsername(username);
    if (!user || !user.email || !user.is_active) return res.json(respGenerica);

    const { token: resetToken } = await db.createTcPasswordResetToken({ tcUserId: user.id, ttlMinutes: 60 });
    const tcPublicBase = process.env.TC_PUBLIC_BASE_URL
      || (process.env.NODE_ENV === 'production' ? 'https://terracontrol.viverdepj.com.br' : `${req.protocol}://${req.get('host')}`);
    const resetUrl = `${tcPublicBase.replace(/\/$/, '')}/?reset=${encodeURIComponent(resetToken)}`;

    try {
      const { enviarEmailTcResetSenha } = require('./services/email');
      await enviarEmailTcResetSenha({ toEmail: user.email, username: user.username, resetUrl, expiresMinutes: 60 });
    } catch (emailErr) {
      console.error('Falha ao enviar email de reset tc_user:', emailErr?.message || emailErr);
      // não revela falha de email pro cliente
    }
    res.json(respGenerica);
  } catch (error) {
    console.error('Erro em /api/tc-auth/recuperar-senha:', error);
    res.status(500).json({ success: false, error: 'Erro interno' });
  }
});

// GET /api/tc-auth/validar-token/:token — valida token de reset antes do form
app.get('/api/tc-auth/validar-token/:token', passwordTokenValidationLimiter, async (req, res) => {
  try {
    const row = await db.validateTcPasswordResetToken(req.params.token);
    if (!row) return res.status(400).json({ success: false, valid: false, error: 'Token inválido ou expirado' });
    res.json({ success: true, valid: true, username: row.username });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Erro interno' });
  }
});

// POST /api/tc-auth/resetar-senha — troca senha com token
app.post('/api/tc-auth/resetar-senha', passwordResetLimiter, async (req, res) => {
  try {
    const { token, novaSenha } = req.body || {};
    if (!token || !novaSenha) {
      return res.status(400).json({ success: false, error: 'Token e nova senha são obrigatórios' });
    }
    if (String(novaSenha).length < 6) {
      return res.status(400).json({ success: false, error: 'Senha deve ter pelo menos 6 caracteres' });
    }
    const newHash = await bcrypt.hash(String(novaSenha), 10);
    const result = await db.useTcPasswordResetToken(token, newHash);
    if (!result) return res.status(400).json({ success: false, error: 'Token inválido ou expirado' });
    // Revoga todas as sessões ativas (segurança)
    await db.revokeAllTcRefreshTokens(result.tcUserId);
    res.json({ success: true, message: 'Senha redefinida com sucesso. Faça login novamente.' });
  } catch (error) {
    console.error('Erro em /api/tc-auth/resetar-senha:', error);
    res.status(500).json({ success: false, error: 'Erro interno' });
  }
});

// GET /api/tc-auth/me — perfil completo do tc_user logado
app.get('/api/tc-auth/me', tcAuth.authenticateTcUser, async (req, res) => {
  try {
    const user = await db.getTcUserById(req.tcUser.id);
    if (!user) return res.status(404).json({ success: false, error: 'Usuário não encontrado' });
    res.json({ success: true, data: tcAuth.sanitizeTcUser(user) });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Erro interno' });
  }
});

// PUT /api/tc-auth/me — edita perfil (NÃO inclui senha/username — endpoints próprios)
// D2.7: se o campo email for alterado, exigimos currentPassword no payload e
// validamos contra o hash atual antes de salvar. Outros campos não exigem.
app.put('/api/tc-auth/me', tcAuth.authenticateTcUser, async (req, res) => {
  try {
    const allowedFields = ['firstName', 'lastName', 'email', 'phone', 'cpf', 'birthDate', 'gender', 'address', 'photoUrl'];
    const updates = {};
    for (const k of allowedFields) {
      if (Object.prototype.hasOwnProperty.call(req.body || {}, k)) updates[k] = req.body[k];
    }
    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ success: false, error: 'Nenhum campo fornecido' });
    }
    // Se email mudou: exige senha atual + checa colisão com outro tc_user
    if (Object.prototype.hasOwnProperty.call(updates, 'email')) {
      const tcUserFull = await db.getTcUserById(req.tcUser.id);
      const currentEmail = (tcUserFull?.email || '').toLowerCase();
      const newEmail = (updates.email || '').toLowerCase();
      if (newEmail !== currentEmail) {
        const { currentPassword } = req.body || {};
        if (!currentPassword) {
          return res.status(400).json({ success: false, error: 'Confirme com sua senha atual para alterar o email' });
        }
        const passwordOk = await bcrypt.compare(String(currentPassword), tcUserFull.password);
        if (!passwordOk) {
          return res.status(401).json({ success: false, error: 'Senha incorreta' });
        }
        if (newEmail) {
          const existing = await db.getTcUserByEmail(newEmail);
          if (existing && existing.id !== req.tcUser.id) {
            return res.status(409).json({ success: false, error: 'Este email já está em uso' });
          }
        }
      }
    }
    const updated = await db.updateTcUser(req.tcUser.id, updates);
    res.json({ success: true, data: tcAuth.sanitizeTcUser(updated) });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message || 'Erro interno' });
  }
});

// PATCH /api/tc-auth/me/preferences — toggle leve de preferências do tc_user.
// Hoje só atende emailNotifications (opt-out de emails de eventos do TC).
// NÃO afeta emails transacionais críticos (reset de senha, convite) — esses
// sempre disparam.
app.patch('/api/tc-auth/me/preferences', tcAuth.authenticateTcUser, async (req, res) => {
  try {
    const allowed = ['emailNotifications'];
    const prefs = {};
    for (const key of allowed) {
      if (Object.prototype.hasOwnProperty.call(req.body || {}, key)) {
        prefs[key] = req.body[key];
      }
    }
    const updated = await db.updateTcUserPreferences(req.tcUser.id, prefs);
    if (!updated) return res.status(404).json({ success: false, error: 'tc_user não encontrado' });
    res.json({ success: true, data: tcAuth.sanitizeTcUser(updated) });
  } catch (error) {
    console.error('PATCH /api/tc-auth/me/preferences:', error);
    res.status(500).json({ success: false, error: 'Erro ao atualizar preferências' });
  }
});

// PUT /api/tc-auth/me/password — troca senha (exige senha atual)
app.put('/api/tc-auth/me/password', tcAuth.authenticateTcUser, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body || {};
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ success: false, error: 'Senha atual e nova são obrigatórias' });
    }
    if (String(newPassword).length < 6) {
      return res.status(400).json({ success: false, error: 'Nova senha deve ter pelo menos 6 caracteres' });
    }
    const user = await db.getTcUserById(req.tcUser.id);
    if (!user) return res.status(404).json({ success: false, error: 'Usuário não encontrado' });
    const ok = await bcrypt.compare(String(currentPassword), user.password);
    if (!ok) return res.status(401).json({ success: false, error: 'Senha atual incorreta' });

    const newHash = await bcrypt.hash(String(newPassword), 10);
    await db.updateTcUser(req.tcUser.id, { password: newHash, forcePasswordChange: false });
    // Revoga sessões antigas (mantém só a atual via novo login após troca)
    await db.revokeAllTcRefreshTokens(req.tcUser.id);
    res.json({ success: true, message: 'Senha alterada com sucesso. Faça login novamente.' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message || 'Erro interno' });
  }
});

// PUT /api/tc-auth/me/username — troca username (exige senha)
app.put('/api/tc-auth/me/username', tcAuth.authenticateTcUser, async (req, res) => {
  try {
    const { password, newUsername } = req.body || {};
    if (!password || !newUsername) {
      return res.status(400).json({ success: false, error: 'Senha e novo usuário são obrigatórios' });
    }
    const normalized = String(newUsername).trim().toLowerCase();
    if (!/^[a-z0-9][a-z0-9-_]{2,}$/.test(normalized)) {
      return res.status(400).json({ success: false, error: 'Usuário inválido: 3+ chars, apenas letras, números, hífens e underline' });
    }
    const user = await db.getTcUserById(req.tcUser.id);
    if (!user) return res.status(404).json({ success: false, error: 'Usuário não encontrado' });
    const ok = await bcrypt.compare(String(password), user.password);
    if (!ok) return res.status(401).json({ success: false, error: 'Senha incorreta' });
    if (await db.usernameTcUserExists(normalized) && normalized !== user.username) {
      return res.status(409).json({ success: false, error: 'Este usuário já está em uso' });
    }
    const updated = await db.updateTcUser(req.tcUser.id, { username: normalized });
    res.json({ success: true, data: tcAuth.sanitizeTcUser(updated) });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message || 'Erro interno' });
  }
});

// POST /api/tc-auth/me/photo — upload de foto (reusa uploadAvatar do impgeo)
app.post('/api/tc-auth/me/photo', tcAuth.authenticateTcUser, uploadAvatar.single('photo'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, error: 'Nenhum arquivo enviado' });
    const photoUrl = `/api/avatars/${req.file.filename}`;
    await db.updateTcUser(req.tcUser.id, { photoUrl });
    res.json({ success: true, data: { photoUrl } });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message || 'Erro ao salvar foto' });
  }
});

// ===========================================================================
// Notificações in-app pra tc_users (espelha /api/notifications do impgeo)
// ===========================================================================

app.get('/api/tc-auth/notifications', tcAuth.authenticateTcUser, async (req, res) => {
  try {
    const onlyUnread = req.query.onlyUnread === 'true';
    const limit = parseInt(req.query.limit, 10) || 50;
    const notifs = await db.getTcNotificationsForUser(req.tcUser.id, { onlyUnread, limit });
    const unreadCount = await db.getUnreadTcNotificationCount(req.tcUser.id);
    res.json({ success: true, data: notifs, unreadCount });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.patch('/api/tc-auth/notifications/read-all', tcAuth.authenticateTcUser, async (req, res) => {
  try {
    await db.markAllTcNotificationsAsRead(req.tcUser.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.patch('/api/tc-auth/notifications/clear-all', tcAuth.authenticateTcUser, async (req, res) => {
  try {
    const cleared = await db.clearAllTcNotifications(req.tcUser.id);
    res.json({ success: true, cleared });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.delete('/api/tc-auth/notifications', tcAuth.authenticateTcUser, async (req, res) => {
  try {
    const onlyCleared = req.query.onlyCleared === 'true';
    const deleted = await db.deleteAllTcNotificationsForUser(req.tcUser.id, { onlyCleared });
    res.json({ success: true, deleted });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Rotas com :id depois das literais (read-all, clear-all)
// G10.2 — marca como lidas todas as notifs do tc_user sobre uma entidade.
// Body: { entity_type, entity_id }. Idempotente; retorna quantas foram afetadas.
// Front chama isso quando user abre/age sobre o entity (ex: TcBudgetViewScreen
// faz mount com budgetId → notifs daquele budget viram lidas sem precisar
// clicar no sininho).
app.patch('/api/tc-auth/notifications/read-by-entity', tcAuth.authenticateTcUser, async (req, res) => {
  try {
    const { entity_type, entity_id } = req.body || {};
    if (!entity_type || !entity_id) {
      return res.status(400).json({ success: false, error: 'entity_type e entity_id obrigatórios' });
    }
    const affected = await db.markTcNotificationsByEntityAsRead(req.tcUser.id, String(entity_type), entity_id);
    res.json({ success: true, data: { affected } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.patch('/api/tc-auth/notifications/:id/read', tcAuth.authenticateTcUser, async (req, res) => {
  try {
    const updated = await db.markTcNotificationAsRead(req.params.id, req.tcUser.id);
    res.json({ success: true, data: updated });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.patch('/api/tc-auth/notifications/:id/clear', tcAuth.authenticateTcUser, async (req, res) => {
  try {
    const updated = await db.clearTcNotification(req.params.id, req.tcUser.id);
    res.json({ success: true, data: updated });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.delete('/api/tc-auth/notifications/:id', tcAuth.authenticateTcUser, async (req, res) => {
  try {
    const deleted = await db.deleteTcNotification(req.params.id, req.tcUser.id);
    if (!deleted) return res.status(404).json({ success: false, error: 'Notificação não encontrada' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── Web Push: subscriptions e preferências (tc_users) ──────────────────
// Espelha /api/push/* + /api/notification-preferences mas usa o middleware
// tcAuth.authenticateTcUser (req.tcUser) e tabelas tc_push_subscriptions /
// tc_notification_preferences (scope='tc' nos helpers).
//
// Notar que app_id default pra tc_user é 'tc-public', mas mantemos a lista
// completa pra cobrir cenários futuros (tc_user com acesso a admin, etc).

app.get('/api/tc-auth/push/vapid-public-key', tcAuth.authenticateTcUser, async (req, res) => {
  if (!push.isConfigured()) {
    return res.status(503).json({ success: false, error: 'Web Push não configurado no servidor' });
  }
  res.json({ success: true, publicKey: push.getPublicKey() });
});

app.post('/api/tc-auth/push/subscribe', tcAuth.authenticateTcUser, async (req, res) => {
  try {
    const { endpoint, keys, app_id } = req.body || {};
    if (!endpoint || typeof endpoint !== 'string' || endpoint.length < 20) {
      return res.status(400).json({ success: false, error: 'endpoint inválido' });
    }
    if (!keys || typeof keys.p256dh !== 'string' || typeof keys.auth !== 'string') {
      return res.status(400).json({ success: false, error: 'keys.p256dh e keys.auth são obrigatórios' });
    }
    const ALLOWED_APP_IDS = ['impgeo', 'tc-public', 'tc-admin'];
    if (!ALLOWED_APP_IDS.includes(app_id)) {
      return res.status(400).json({ success: false, error: 'app_id deve ser impgeo, tc-public ou tc-admin' });
    }
    const userAgent = (req.headers['user-agent'] || '').slice(0, 500);
    const sub = await db.upsertPushSubscription('tc', req.tcUser.id, { endpoint, keys }, app_id, userAgent);
    res.json({ success: true, data: { id: sub.id, endpoint: sub.endpoint, app_id: sub.app_id } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.delete('/api/tc-auth/push/subscribe', tcAuth.authenticateTcUser, async (req, res) => {
  try {
    const { endpoint } = req.body || {};
    if (!endpoint || typeof endpoint !== 'string') {
      return res.status(400).json({ success: false, error: 'endpoint obrigatório' });
    }
    const removed = await db.deletePushSubscriptionByEndpoint('tc', req.tcUser.id, endpoint);
    res.json({ success: true, removed });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/tc-auth/notification-preferences', tcAuth.authenticateTcUser, async (req, res) => {
  try {
    const grid = await db.listNotificationPreferences('tc', req.tcUser.id);
    res.json({ success: true, data: grid });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.put('/api/tc-auth/notification-preferences', tcAuth.authenticateTcUser, async (req, res) => {
  try {
    const { notification_type, channel, enabled } = req.body || {};
    if (!notification_type || typeof notification_type !== 'string' || notification_type.length > 64) {
      return res.status(400).json({ success: false, error: 'notification_type inválido' });
    }
    if (channel !== 'push' && channel !== 'email') {
      return res.status(400).json({ success: false, error: 'channel deve ser "push" ou "email"' });
    }
    if (typeof enabled !== 'boolean') {
      return res.status(400).json({ success: false, error: 'enabled deve ser boolean' });
    }
    const pref = await db.setNotificationPreference('tc', req.tcUser.id, notification_type, channel, enabled);
    res.json({ success: true, data: pref });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/tc-auth/me/records — lista registros TerraControl que o tc_user pode ver
// Aceita ?onlyApproved=true pra esconder pendentes (default: todos)
app.get('/api/tc-auth/me/records', tcAuth.authenticateTcUser, async (req, res) => {
  try {
    const onlyApproved = req.query.onlyApproved === 'true';
    const records = await db.getTcUserRecords(req.tcUser.id, { onlyApproved });
    res.json({ success: true, data: records });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Erro ao listar registros' });
  }
});

// POST /api/tc-auth/me/records — tc_user cria registro próprio
// Força created_by_tc_user_id + approved=FALSE + grant em tc_user_record_access.
// Dispara notificação pra impgeo users com acesso ao módulo TerraControl.
app.post('/api/tc-auth/me/records', tcAuth.authenticateTcUser, async (req, res) => {
  try {
    const payload = req.body || {};
    if (!payload.imovel || !String(payload.imovel).trim()) {
      return res.status(400).json({ success: false, error: 'Nome do imóvel é obrigatório' });
    }
    if (!payload.municipio || !String(payload.municipio).trim()) {
      return res.status(400).json({ success: false, error: 'Município é obrigatório' });
    }
    if (!payload.mapaUrl && !payload.mapa_url) {
      return res.status(400).json({ success: false, error: 'Link do Google Maps é obrigatório' });
    }

    const created = await db.saveTerraControlAsTcUser(payload, req.tcUser.id);

    // Audit log (migration 041) — fire-and-forget, não trava criação
    db.appendRecordEvent({
      terracontrolId: created.id,
      eventType: 'created',
      actorType: 'tc',
      actorId: req.tcUser.id,
      payload: { imovel: created.imovel, municipio: created.municipio },
    });

    // Lockdown: registros novos ficam aguardando o admin enviar o orçamento.
    // tc_user não pode editar o cadastro até receber a primeira proposta.
    // Falha aqui não desfaz a criação — best-effort sincronizado.
    try {
      await budgetService.lockNewRecord(created.id);
      // Reflete o lock no objeto retornado pro front pular fetch extra
      created.budget_status = 'locked';
    } catch (lockErr) {
      console.error('[tc-records] Falha ao aplicar lockdown:', lockErr?.message);
    }

    // Dispara notificações pra impgeo users (fire-and-forget).
    // - Sino in-app: TODOS com acesso ao módulo (admin/superadmin ou
    //   user_module_permissions de 'terracontrol').
    // - Email: SÓ quem deu opt-in (users.tc_email_notifications = TRUE).
    //   Padrão é FALSE pra evitar spam — admin liga em "Meu perfil".
    (async () => {
      try {
        const impgeoUsers = await db.getImpgeoUsersWithTerraControlAccess();
        const tcName = [req.tcUser.firstName, req.tcUser.lastName].filter(Boolean).join(' ').trim()
          || req.tcUser.username
          || 'um usuário TerraControl';
        const adminUrl = process.env.IMPGEO_PUBLIC_URL
          ? `${process.env.IMPGEO_PUBLIC_URL}/?subsystem=especial&module=terracontrol&record=${created.id}`
          : undefined;
        const codImovel = created.cod_imovel != null ? created.cod_imovel : null;
        for (const u of impgeoUsers) {
          const userNotif = await db.createNotification({
            user_id: u.id,
            notification_type: 'tc_record_created',
            title: `${tcName} cadastrou um novo registro`,
            message: `${created.imovel} em ${created.municipio} — aguardando aprovação`,
            related_entity_type: 'terracontrol',
            related_entity_id: created.id,
          });
          pushDispatcher.send(db, 'impgeo', u.id, userNotif).catch(() => {});
          // Email opt-in (filtro feito aqui, query já trouxe a flag)
          if (u.tc_email_notifications === true && u.email) {
            const recipientName = [u.first_name, u.last_name].filter(Boolean).join(' ').trim()
              || u.username
              || 'usuário';
            enviarEmailImpgeoTcRecordCriado({
              toEmail: u.email,
              recipientName,
              tcUserName: tcName,
              imovel: created.imovel,
              municipio: created.municipio,
              codImovel,
              adminUrl,
            }).catch(e => console.error('[tc-records] Falha ao enviar email:', e?.message));
          }
        }
      } catch (notifErr) {
        console.error('[tc-records] Falha ao disparar notificações:', notifErr?.message);
      }
    })();

    res.json({ success: true, data: created });
  } catch (error) {
    console.error('Erro POST /api/tc-auth/me/records:', error);
    res.status(500).json({ success: false, error: error.message || 'Erro ao criar registro' });
  }
});

// PUT /api/tc-auth/me/records/:id — tc_user edita registro
// Permissão checada server-side via tcUserCanEditRecord.
//
// Lockdown (migration 040): se o registro está em ciclo de orçamento em
// estado que bloqueia edição (locked, awaiting_payment, paid), devolve 403
// com mensagem específica antes mesmo de tentar atualizar. Edição em
// budget.status === 'sent' é permitida MAS dispara revisão automática
// fire-and-forget no fim (admin é notificado pra reavaliar).
app.put('/api/tc-auth/me/records/:id', tcAuth.authenticateTcUser, async (req, res) => {
  try {
    const ok = await db.tcUserCanEditRecord(req.tcUser.id, req.params.id);
    if (!ok) {
      return res.status(403).json({ success: false, error: 'Você não tem permissão para editar este registro' });
    }

    // Pré-check de lockdown — bloqueia em estados sensíveis com mensagem dedicada.
    const existingBudget = await db.getBudgetByTerracontrolId(req.params.id);
    if (existingBudget) {
      const lockMessages = {
        locked: 'Aguardando envio do orçamento. Você poderá editar o cadastro assim que receber a primeira proposta.',
        awaiting_payment: 'Pagamento em andamento. Cancele ou conclua o pagamento antes de editar o cadastro.',
        paid: 'Imóvel já foi pago e aprovado. Para alterações, fale com o suporte.',
      };
      const msg = lockMessages[existingBudget.status];
      if (msg) {
        return res.status(403).json({ success: false, error: msg, code: `budget_${existingBudget.status}` });
      }
    }

    const updated = await db.updateTerraControlByTcUser(req.params.id, req.body || {});

    // G10.1: lista de chaves do body que o tc_user enviou. Usada tanto no
    // audit log quanto no email/notif de admins.
    const editedFieldKeys = Object.keys(req.body || {});

    // Audit log (migration 041) — fire-and-forget
    db.appendRecordEvent({
      terracontrolId: req.params.id,
      eventType: 'edited',
      actorType: 'tc',
      actorId: req.tcUser.id,
      payload: { fields: editedFieldKeys },
    });

    // G10.1 — notifica admins sobre a edição (in-app + push + email) APENAS
    // quando não há auto-revisão acontecendo (budget.status !== 'sent'). No
    // caso de 'sent', a notif de revisão automática (abaixo) já cobre o
    // aviso e duplicar deixaria a caixa de entrada poluída.
    const willTriggerAutoRevision = !!(existingBudget && existingBudget.status === 'sent');
    if (!willTriggerAutoRevision) {
      // Mapa de campo → label pt-BR (camelCase e snake_case caem no mesmo
      // rótulo). Caller do front pode mandar qualquer dos dois.
      const FIELD_LABELS = {
        imovel: 'Imóvel', endereco: 'Endereço',
        municipio: 'Município',
        mapaUrl: 'Mapa', mapa_url: 'Mapa',
        matriculas: 'Matrículas', matriculasDados: 'Matrículas', matriculas_dados: 'Matrículas',
        nIncraCcir: 'N. INCRA / CCIR', n_incra_ccir: 'N. INCRA / CCIR',
        ccirDados: 'CCIR', ccir_dados: 'CCIR',
        car: 'CAR', carUrl: 'PDF do CAR', car_url: 'PDF do CAR',
        statusCar: 'Status do CAR', status_car: 'Status do CAR', status: 'Status',
        itr: 'ITR', itrDados: 'ITR', itr_dados: 'ITR',
        geoCertificacao: 'Geo Certificação', geo_certificacao: 'Geo Certificação',
        geoRegistro: 'Geo Registro', geo_registro: 'Geo Registro',
        areaTotal: 'Área total', area_total: 'Área total',
        reservaLegal: 'Reserva legal', reserva_legal: 'Reserva legal',
        cultura1: 'Cultura 1',
        areaCultura1: 'Área Cultura 1', area_cultura1: 'Área Cultura 1',
        cultura2: 'Cultura 2',
        areaCultura2: 'Área Cultura 2', area_cultura2: 'Área Cultura 2',
        outros: 'Outros',
        areaOutros: 'Área Outros', area_outros: 'Área Outros',
        appCodigoFlorestal: 'APP Código Florestal', app_codigo_florestal: 'APP Código Florestal',
        appVegetada: 'APP Vegetada', app_vegetada: 'APP Vegetada',
        appNaoVegetada: 'APP Não Vegetada', app_nao_vegetada: 'APP Não Vegetada',
        remanescenteFlorestal: 'Remanescente Florestal', remanescente_florestal: 'Remanescente Florestal',
        observacoes: 'Observações',
      };
      const fieldLabels = Array.from(new Set(
        editedFieldKeys.map(k => FIELD_LABELS[k]).filter(Boolean)
      ));
      // Fire-and-forget — não bloqueia o response do PUT.
      (async () => {
        try {
          const tcName = [req.tcUser.firstName, req.tcUser.lastName].filter(Boolean).join(' ').trim()
            || req.tcUser.username
            || 'um usuário TerraControl';
          const impgeoUsers = await db.getImpgeoUsersWithTerraControlAccess();
          const adminUrl = process.env.IMPGEO_PUBLIC_URL
            ? `${process.env.IMPGEO_PUBLIC_URL}/?subsystem=especial&module=terracontrol&record=${updated.id}`
            : undefined;
          const codImovel = updated.cod_imovel != null ? updated.cod_imovel : null;
          const fieldsSummary = fieldLabels.length
            ? fieldLabels.slice(0, 3).join(', ') + (fieldLabels.length > 3 ? `, +${fieldLabels.length - 3}` : '')
            : 'detalhes indisponíveis';
          for (const u of impgeoUsers) {
            const notif = await db.createNotification({
              user_id: u.id,
              notification_type: 'tc_record_edited_by_user',
              title: `${tcName} editou um imóvel`,
              message: `${updated.imovel}${updated.municipio ? ` em ${updated.municipio}` : ''} — campos: ${fieldsSummary}`,
              related_entity_type: 'terracontrol',
              related_entity_id: updated.id,
            });
            pushDispatcher.send(db, 'impgeo', u.id, notif).catch(() => {});
            if (u.tc_email_notifications === true && u.email) {
              const recipientName = [u.first_name, u.last_name].filter(Boolean).join(' ').trim()
                || u.username || 'usuário';
              enviarEmailImpgeoTcRecordEditado({
                toEmail: u.email,
                recipientName,
                tcUserName: tcName,
                imovel: updated.imovel,
                municipio: updated.municipio,
                codImovel,
                fieldLabels,
                adminUrl,
              }).catch(e => console.error('[tc-records PUT] Falha ao enviar email edit:', e?.message));
            }
          }
        } catch (e) {
          console.error('[tc-records PUT] Falha ao notificar admins (edit):', e?.message);
        }
      })();
    }

    // Auto-revisão: se há orçamento status='sent', o admin precisa saber que o
    // imóvel mudou — abre uma nova solicitação de revisão (source='auto_edit')
    // e move pro estado revision_requested. Fire-and-forget pra não atrasar
    // o response — falha aqui não desfaz o update.
    if (existingBudget && existingBudget.status === 'sent') {
      (async () => {
        try {
          const { budget } = await budgetService.requestRevision({
            budgetId: existingBudget.id,
            tcUserId: req.tcUser.id,
            comment: 'O cliente editou o cadastro do imóvel após o envio do orçamento. Revise se os valores ainda se aplicam.',
            source: 'auto_edit',
          });
          await budgetDispatcher.dispatchTcBudgetEventToAdmins(budget, updated, 'revision_requested', {
            tcUser: req.tcUser,
            comment: 'Imóvel editado pelo cliente (revisão automática)',
            source: 'auto_edit',
          });
        } catch (e) {
          console.error('[tc-records PUT] Falha ao disparar auto-revisão:', e?.message);
        }
      })();
    }

    res.json({ success: true, data: updated });
  } catch (error) {
    console.error('Erro PUT /api/tc-auth/me/records/:id:', error);
    res.status(500).json({ success: false, error: error.message || 'Erro ao atualizar registro' });
  }
});

// POST /api/tc-auth/me/upload-car — upload de PDF pro tc_user
// Espelho do /api/terracontrol/upload-car mas autenticado via tc_user JWT.
// Mesmo validador de magic bytes %PDF (G2.4).
app.post('/api/tc-auth/me/upload-car', tcAuth.authenticateTcUser, uploadDocument.single('file'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'Nenhum arquivo enviado' });
    }
    try {
      const fd = fs.openSync(req.file.path, 'r');
      const header = Buffer.alloc(4);
      fs.readSync(fd, header, 0, 4, 0);
      fs.closeSync(fd);
      if (header.toString('ascii') !== '%PDF') {
        try { fs.unlinkSync(req.file.path); } catch (_) {}
        return res.status(400).json({ success: false, error: 'Arquivo enviado não é um PDF válido' });
      }
    } catch (sigErr) {
      console.error('Erro ao validar assinatura PDF (tc_user):', sigErr);
      try { fs.unlinkSync(req.file.path); } catch (_) {}
      return res.status(500).json({ success: false, error: 'Falha ao validar o arquivo enviado' });
    }
    const fileUrl = `/api/documents/${req.file.filename}`;
    res.json({ success: true, url: fileUrl });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message || 'Erro no upload' });
  }
});

// DELETE /api/tc-auth/me/records/:id — tc_user exclui registro
app.delete('/api/tc-auth/me/records/:id', tcAuth.authenticateTcUser, async (req, res) => {
  try {
    const ok = await db.tcUserCanDeleteRecord(req.tcUser.id, req.params.id);
    if (!ok) {
      return res.status(403).json({ success: false, error: 'Você não tem permissão para excluir este registro' });
    }
    await db.deleteTerraControlByTcUser(req.params.id);
    res.json({ success: true });
  } catch (error) {
    console.error('Erro DELETE /api/tc-auth/me/records/:id:', error);
    res.status(500).json({ success: false, error: error.message || 'Erro ao excluir registro' });
  }
});

// ===========================================================================
// Orçamentos TerraControl — endpoints tc_user (migration 040)
// ===========================================================================
// Ownership: budgetService.getBudgetForTcUser já checa via db.tcUserOwnsBudget.
// Demais ações fazem o check antes de qualquer escrita.

// GET /api/tc-auth/me/budgets/by-record/:terracontrolId
// Devolve o orçamento ativo (ou null) do registro indicado, se tc_user é dono.
app.get('/api/tc-auth/me/budgets/by-record/:terracontrolId', tcAuth.authenticateTcUser, async (req, res) => {
  try {
    const budget = await db.getBudgetByTerracontrolId(req.params.terracontrolId);
    if (!budget) return res.json({ success: true, data: null });
    const full = await budgetService.getBudgetForTcUser(budget.id, req.tcUser.id);
    if (!full) return res.status(403).json({ success: false, error: 'Acesso negado' });
    res.json({ success: true, data: full });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message || 'Erro ao carregar orçamento' });
  }
});

// GET /api/tc-auth/me/budgets/:id — full payload (budget + revisão atual + history)
app.get('/api/tc-auth/me/budgets/:id', tcAuth.authenticateTcUser, async (req, res) => {
  try {
    const full = await budgetService.getBudgetForTcUser(req.params.id, req.tcUser.id);
    if (!full) return res.status(404).json({ success: false, error: 'Orçamento não encontrado' });
    res.json({ success: true, data: full });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message || 'Erro ao carregar orçamento' });
  }
});

// POST /api/tc-auth/me/budgets/:id/request-revision
// Body: { comment }
app.post('/api/tc-auth/me/budgets/:id/request-revision', tcAuth.authenticateTcUser, async (req, res) => {
  try {
    const owns = await db.tcUserOwnsBudget(req.tcUser.id, req.params.id);
    if (!owns) return res.status(403).json({ success: false, error: 'Acesso negado' });
    const { comment } = req.body || {};
    if (!comment || !String(comment).trim()) {
      return res.status(400).json({ success: false, error: 'Comentário obrigatório (descreva o que precisa ser alterado)' });
    }
    const { budget, request } = await budgetService.requestRevision({
      budgetId: req.params.id,
      tcUserId: req.tcUser.id,
      comment: String(comment).trim(),
      source: 'tc_user',
    });
    // Dispatcher pros admins precisa do record pra renderizar texto.
    (async () => {
      try {
        const rows = await db.getTerraControlByIds([budget.terracontrol_id]);
        const record = rows[0];
        if (record) {
          await budgetDispatcher.dispatchTcBudgetEventToAdmins(budget, record, 'revision_requested', {
            tcUser: req.tcUser, comment, source: 'tc_user',
          });
        }
      } catch (e) {
        console.error('[tc-budgets request-revision] Falha no dispatch admin:', e?.message);
      }
    })();
    res.json({ success: true, data: { budget, request } });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message || 'Erro ao solicitar revisão' });
  }
});

// POST /api/tc-auth/me/budgets/:id/accept — aprova orçamento e cria cobrança PIX
// Devolve { brCode, brCodeBase64, expiresAt, attempt } pro front mostrar QR.
app.post('/api/tc-auth/me/budgets/:id/accept', tcAuth.authenticateTcUser, async (req, res) => {
  try {
    const owns = await db.tcUserOwnsBudget(req.tcUser.id, req.params.id);
    if (!owns) return res.status(403).json({ success: false, error: 'Acesso negado' });
    // tc_user completo do DB (req.tcUser tem só claims do JWT — sem cpf/abacatepay_customer_id)
    const tcUser = await db.getTcUserById(req.tcUser.id);
    const { budget, payment } = await budgetService.acceptAndStartPayment({
      budgetId: req.params.id, tcUser,
    });
    res.json({ success: true, data: { budget, payment } });
  } catch (error) {
    console.error('[tc-budgets accept] Erro:', error);
    res.status(500).json({ success: false, error: error.message || 'Erro ao iniciar pagamento' });
  }
});

// POST /api/tc-auth/me/budgets/:id/refresh-pix — re-emite QR Code (PIX expirou)
app.post('/api/tc-auth/me/budgets/:id/refresh-pix', tcAuth.authenticateTcUser, async (req, res) => {
  try {
    const owns = await db.tcUserOwnsBudget(req.tcUser.id, req.params.id);
    if (!owns) return res.status(403).json({ success: false, error: 'Acesso negado' });
    const tcUser = await db.getTcUserById(req.tcUser.id);
    const payment = await budgetService.refreshPaymentQrCode({
      budgetId: req.params.id, tcUser,
    });
    res.json({ success: true, data: payment });
  } catch (error) {
    console.error('[tc-budgets refresh-pix] Erro:', error);
    res.status(500).json({ success: false, error: error.message || 'Erro ao regenerar QR Code' });
  }
});

// ===========================================================================
// Webhook AbacatePay — público, validado por HMAC + secret query (migration 040)
// ===========================================================================
// Dupla validação:
//   1) ?webhookSecret= na query (timing-safe contra env)
//   2) X-Webhook-Signature header HMAC-SHA256 sobre RAW body
// Idempotência: tc_webhook_events (provider+event_id) bloqueia replay.
//
// Retorna 200 só APÓS processamento bem-sucedido — AbacatePay retenta em
// non-2xx. Erros internos devolvem 500 (provoca retry). Falha de validação
// devolve 401 (provider sabe parar de tentar).
app.post('/api/webhooks/abacatepay', async (req, res) => {
  try {
    if (!abacatepay.verifyWebhookSecretFromQuery(req)) {
      console.warn('[webhook abacatepay] webhookSecret inválido');
      return res.status(401).json({ success: false, error: 'unauthorized' });
    }
    const signature = req.headers['x-webhook-signature'];
    if (!abacatepay.verifyWebhookHmac(req.rawBody, signature, process.env.ABACATEPAY_WEBHOOK_SECRET)) {
      console.warn('[webhook abacatepay] HMAC inválido');
      return res.status(401).json({ success: false, error: 'invalid signature' });
    }

    const payload = req.body || {};
    const eventType = payload.event;
    // O `id` do envelope é o event_id pra dedupe (formato 'log_xxx'). Se a
    // doc mudar, cair pro id interno do data.
    const eventId = payload.id || payload.data?.id || null;
    if (!eventType || !eventId) {
      return res.status(400).json({ success: false, error: 'event/id ausentes' });
    }

    const { firstSeen } = await db.recordWebhookEvent({
      provider: 'abacatepay',
      eventId,
      eventType,
      payload,
    });
    if (!firstSeen) {
      return res.json({ success: true, dedupe: true });
    }

    // Roteamento por event type
    if (eventType === 'transparent.completed' || eventType === 'billing.paid') {
      const transparent = payload.data?.transparent || payload.data;
      // AbacatePay tem devolvido externalId=null no payload do webhook em
      // alguns casos (bug do provider — visto em prod 2026-05-23). Fallback:
      // reconstruir o externalId a partir do metadata que mandamos no accept
      // (a gente põe { budgetId, attempt } lá; basta refazer o formato).
      // paidAmount também pode vir null; cai no amount nesse caso.
      let externalId = transparent?.externalId;
      if (!externalId) {
        const md = transparent?.metadata || {};
        if (md.budgetId) {
          externalId = `tc_budget_${md.budgetId}_attempt_${md.attempt || 1}`;
          console.info(`[webhook abacatepay] externalId reconstruído via metadata: ${externalId}`);
        }
      }
      const amountCents = transparent?.paidAmount || transparent?.amount;
      if (!externalId) {
        console.warn('[webhook abacatepay] transparent.completed sem externalId nem metadata.budgetId — ignorando');
        return res.json({ success: true, warning: 'no externalId' });
      }
      const result = await budgetService.markPaidFromWebhook({
        externalId, amountCents, abacatePayload: payload,
      });
      if (result.matched && !result.idempotent && result.budget && result.record) {
        // Dispatch fire-and-forget (não atrasa response pro provider).
        // O tcUser pro dispatch vem do nosso DB (created_by_tc_user_id do
        // registro), NÃO do payload.data.customer da AbacatePay — esse
        // último não tem os campos first_name/last_name/username que o
        // dispatcher espera, resultando em "Undefined pagou o orçamento"
        // nas notificações dos admins.
        (async () => {
          let tcUserForDispatch = null;
          try {
            if (result.record.created_by_tc_user_id) {
              tcUserForDispatch = await db.getTcUserById(result.record.created_by_tc_user_id);
            }
          } catch (e) {
            console.error('[webhook abacatepay] Falha ao buscar tc_user pra dispatch:', e?.message);
          }
          budgetDispatcher.dispatchTcBudgetEventToOwner(
            result.budget, result.record, 'payment_completed'
          ).catch(() => {});
          budgetDispatcher.dispatchTcBudgetEventToAdmins(
            result.budget, result.record, 'payment_completed',
            { tcUser: tcUserForDispatch }
          ).catch(() => {});
        })();
      }
      return res.json({ success: true });
    }

    if (eventType === 'transparent.refunded' || eventType === 'transparent.disputed') {
      // MVP: só registra evento via dedupe. Rollback de approval fica em
      // TECH-DEBT — admin lida manualmente pelo painel.
      const transparent = payload.data?.transparent || {};
      let externalId = transparent?.externalId || payload.data?.externalId;
      if (!externalId && transparent?.metadata?.budgetId) {
        // Mesmo fallback do branch completed — AbacatePay às vezes deixa null
        const md = transparent.metadata;
        externalId = `tc_budget_${md.budgetId}_attempt_${md.attempt || 1}`;
      }
      if (externalId) {
        const budget = await db.getBudgetByExternalId(externalId);
        if (budget) {
          await db.appendBudgetEvent({
            budgetId: budget.id,
            eventType: eventType === 'transparent.refunded' ? 'payment_refunded' : 'payment_disputed',
            actorType: 'abacatepay',
            actorId: null,
            payload,
          });
        }
      }
      return res.json({ success: true });
    }

    // Evento não tratado — registramos pra auditoria e devolvemos 200 pra não
    // ficar retentando indefinidamente.
    console.info(`[webhook abacatepay] evento não tratado: ${eventType}`);
    return res.json({ success: true, unhandled: eventType });
  } catch (error) {
    console.error('[webhook abacatepay] erro no processamento:', error);
    // Retorna 500 pra AbacatePay tentar de novo (dedupe garante segurança)
    res.status(500).json({ success: false, error: 'processing error' });
  }
});

// Sub-share criado pelo tc_user — só pode incluir registros do seu access.
// Reaproveita a tabela share_links já existente, marcando created_by_tc_user_id.
app.get('/api/tc-auth/me/share-links', tcAuth.authenticateTcUser, async (req, res) => {
  try {
    const links = await db.getShareLinksCreatedByTcUser(req.tcUser.id);
    res.json({ success: true, data: links });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Erro ao listar share links' });
  }
});

app.post('/api/tc-auth/me/share-links', tcAuth.authenticateTcUser, async (req, res) => {
  try {
    const { name, expiresAt, password, selectedIds } = req.body || {};
    if (!Array.isArray(selectedIds) || selectedIds.length === 0) {
      return res.status(400).json({ success: false, error: 'Selecione pelo menos um registro' });
    }
    // Filtra apenas registros que o tc_user TEM acesso
    const allowedRecordIds = await db.getTcUserRecordIds(req.tcUser.id);
    const allowedSet = new Set(allowedRecordIds.map(String));
    const safeIds = selectedIds.map(String).filter(id => allowedSet.has(id));
    if (safeIds.length === 0) {
      return res.status(403).json({ success: false, error: 'Nenhum dos registros selecionados está no seu acesso' });
    }

    // Token sempre com sufixo aleatório forte (G2.2)
    let token = '';
    if (name && name.trim()) {
      const baseSlug = slugify(name);
      const suffix = crypto.randomBytes(8).toString('hex');
      token = baseSlug ? `${baseSlug}-${suffix}` : `view_${suffix}`;
    } else {
      token = 'view_' + crypto.randomBytes(32).toString('hex');
    }

    let expiresAtISO = null;
    if (expiresAt && String(expiresAt).trim()) {
      expiresAtISO = new Date(expiresAt).toISOString();
    }
    let passwordHash = null;
    if (password && String(password).trim()) {
      passwordHash = await bcrypt.hash(String(password), 10);
    }

    await db.saveShareLink(token, name || null, expiresAtISO, passwordHash, safeIds);
    // Marca quem criou
    await db.queryWithRetry(
      'UPDATE share_links SET created_by_tc_user_id = $1 WHERE token = $2',
      [req.tcUser.id, token]
    );
    res.json({ success: true, token, message: 'Link gerado com sucesso' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message || 'Erro ao criar share link' });
  }
});

app.delete('/api/tc-auth/me/share-links/:token', tcAuth.authenticateTcUser, async (req, res) => {
  try {
    // Confirma que o link pertence ao tc_user antes de apagar
    const row = await db.queryWithRetry(
      'SELECT token FROM share_links WHERE token = $1 AND created_by_tc_user_id = $2 LIMIT 1',
      [req.params.token, req.tcUser.id]
    );
    if (row.rows.length === 0) return res.status(404).json({ success: false, error: 'Link não encontrado' });
    await db.deleteShareLink(req.params.token);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message || 'Erro ao excluir' });
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

    // Fase 1.3 — auth via cookie compartilhado entre subdomínios.
    // Mantemos `token` e `refreshToken` no body por compatibilidade com clientes
    // legacy, mas o frontend novo usa apenas os cookies httpOnly.
    setAuthCookies(req, res, token, refreshTokenValue);

    res.json(response);
  } catch (error) {
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// Login dedicado ao subdomínio admin.terracontrol.viverdepj.com.br.
// Mesma lógica do /api/auth/login, mas valida ANTES de gerar token que o
// user tem acesso ao módulo `terracontrol` (via user_module_permissions
// ou role default). Sem acesso → 403, sem gerar token nem refresh nem session.
//
// Por que endpoint separado: garante que credenciais válidas mas sem o módulo
// nunca produzam token via essa porta. O /api/auth/login normal continua
// funcionando para qualquer user impgeo (com permissão para outros módulos).
app.post('/api/auth/login-terracontrol-admin', loginLimiter, async (req, res) => {
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
    if (!user) return res.status(401).json({ error: 'Credenciais inválidas' });
    if (user.is_active === false) {
      return res.status(403).json({ error: 'Usuário inativo. Contate um administrador.' });
    }

    // Valida senha (não suportamos firstLogin neste endpoint — primeiro acesso
    // deve ser feito pelo /api/auth/login do impgeo).
    const isValidPassword = await bcrypt.compare(password, user.password);
    if (!isValidPassword) return res.status(401).json({ error: 'Credenciais inválidas' });

    // Verifica acesso ao módulo terracontrol — antes de qualquer outra coisa.
    // Hierarquia: superadmin/admin têm acesso default; user/guest precisam
    // de entrada em user_module_permissions com module_key='terracontrol'.
    let hasTerracontrolAccess = false;
    if (user.role === 'superadmin' || user.role === 'admin') {
      hasTerracontrolAccess = true;
    } else if (user.role === 'user') {
      // role=user tem todos os módulos exceto admin/dre/terracontrol por default,
      // mas pode ganhar terracontrol via permissão explícita.
      const perms = await db.getUserModulePermissions(user.id);
      hasTerracontrolAccess = Array.isArray(perms) && perms.some(p => p.moduleKey === 'terracontrol');
    } // role=guest nunca tem acesso

    if (!hasTerracontrolAccess) {
      return res.status(403).json({
        error: 'Você não tem acesso ao módulo TerraControl. Contate o administrador.'
      });
    }

    // Daqui em diante: idêntico ao /api/auth/login (gera token, sessão, cookie).
    const nowISO = new Date().toISOString();
    await db.updateUser(user.id, { lastLogin: nowISO });

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
      details: { role: user.role, via: 'admin.terracontrol' },
      ipAddress: req.ip || req.headers['x-forwarded-for'] || null
    });

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
      console.warn('[login-tc-admin] Falha ao criar refresh token/sessão:', sessionError.message);
    }

    const response = {
      success: true,
      token,
      user: mapUserToClient(updatedUserProfile || user)
    };
    if (refreshTokenValue) response.refreshToken = refreshTokenValue;

    setAuthCookies(req, res, token, refreshTokenValue);
    // PR #5 (PWA): emite cookie adicional com Domain=.terracontrol.* pra que
    // o tc-admin standalone preserve sessão em iOS PWA.
    setTcAdminAuthCookies(req, res, token, refreshTokenValue);
    res.json(response);
  } catch (error) {
    console.error('Erro em /api/auth/login-terracontrol-admin:', error);
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

// Toggle leve de preferências do usuário — sem exigir senha atual (em
// contraste com PUT /api/user/profile, que altera campos sensíveis).
// Hoje só atende tcEmailNotifications; ampliar conforme novas prefs.
app.patch('/api/user/preferences', authenticateToken, async (req, res) => {
  try {
    const allowed = ['tcEmailNotifications'];
    const prefs = {};
    for (const key of allowed) {
      if (Object.prototype.hasOwnProperty.call(req.body || {}, key)) {
        prefs[key] = req.body[key];
      }
    }
    const profile = await db.updateUserPreferences(req.user.id, prefs);
    return res.json({ success: true, data: profile });
  } catch (error) {
    console.error('PATCH /api/user/preferences:', error);
    return res.status(500).json({ success: false, error: 'Erro ao atualizar preferências' });
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

// Gate de permissão granular por módulo (Fase 2.x). superadmin/admin têm bypass;
// demais roles precisam de entrada em user_module_permissions com o nível exigido.
// `level` ∈ 'view' | 'edit' ('edit' satisfaz 'view'). Usado nas rotas PM novas.
// Function declaration (hoisted) — é chamada no registro das rotas PM (que
// aparecem ANTES desta linha no arquivo); precisa estar disponível em todo o
// módulo, por isso NÃO pode ser `const` (cairia na temporal dead zone).
function requireModulePermission(moduleKey, level = 'view') {
  return async (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Não autenticado' });
    if (req.user.role === 'admin' || req.user.role === 'superadmin') return next();
    try {
      const perms = await db.getUserModulePermissions(req.user.id);
      const entry = Array.isArray(perms) ? perms.find(p => p.moduleKey === moduleKey) : null;
      const accessLevel = entry?.accessLevel || null;
      const ok = level === 'view'
        ? (accessLevel === 'view' || accessLevel === 'edit')
        : (accessLevel === 'edit');
      if (ok) return next();
      return res.status(403).json({ error: `Acesso negado ao módulo ${moduleKey}.` });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  };
}

// F2.4 — Autoriza endpoints /api/admin/tc-users/* para:
//   (a) admin/superadmin impgeo (passa direto), OU
//   (b) user impgeo com flag can_manage_tc_users=TRUE (permissão delegada).
// Faz uma query rápida em users para checar a flag — só é chamado em rotas
// administrativas (baixo volume), então o custo é desprezível.
const requireTcUsersManagement = async (req, res, next) => {
  if (!req.user) return res.status(401).json({ error: 'Não autenticado' });
  if (req.user.role === 'admin' || req.user.role === 'superadmin') return next();
  try {
    const ok = await db.userCanManageTcUsers(req.user.id);
    if (ok) return next();
    return res.status(403).json({ error: 'Acesso negado. Você não tem permissão para gerenciar usuários TerraControl.' });
  } catch (e) {
    return res.status(500).json({ error: 'Erro ao validar permissão' });
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

// =============================================================================
// Admin do impgeo gerenciando tc_users (migration 025/026)
// =============================================================================

// GET /api/admin/tc-users — lista todos
app.get('/api/admin/tc-users', authenticateToken, requireTcUsersManagement, async (req, res) => {
  try {
    const list = await db.listTcUsersForAdmin();
    res.json({ success: true, data: list });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message || 'Erro ao listar' });
  }
});

// POST /api/admin/tc-users — cria novo tc_user com senha temporária + acesso a registros
app.post('/api/admin/tc-users', authenticateToken, requireTcUsersManagement, async (req, res) => {
  try {
    const { username, firstName, lastName, email, password, selectedIds, canShare, editRecordsPermission, deleteRecordsPermission } = req.body || {};
    if (!username || !firstName || !email) {
      return res.status(400).json({ success: false, error: 'Username, nome e email são obrigatórios' });
    }
    if (!/^[a-z0-9][a-z0-9\-_]{2,}$/.test(String(username).trim().toLowerCase())) {
      return res.status(400).json({ success: false, error: 'Username inválido' });
    }
    if (await db.usernameTcUserExists(String(username).trim().toLowerCase())) {
      return res.status(409).json({ success: false, error: 'Este usuário já existe' });
    }
    if (email && await db.getTcUserByEmail(email)) {
      return res.status(409).json({ success: false, error: 'Este email já está em uso' });
    }
    // Senha: se vier do body usa; senão gera aleatória de 10 chars.
    const plainPassword = password && String(password).length >= 6
      ? String(password)
      : crypto.randomBytes(6).toString('base64').replace(/[+/=]/g, '').slice(0, 10);
    const hash = await bcrypt.hash(plainPassword, 10);

    const created = await db.createTcUser({
      username: String(username).trim().toLowerCase(),
      password: hash,
      firstName: String(firstName).trim(),
      lastName: lastName ? String(lastName).trim() : null,
      email: String(email).trim().toLowerCase(),
      forcePasswordChange: true,                // sempre força no 1º login
      isActive: true,
      createdVia: 'direct',
      createdByUserId: req.user.id,
    });

    if (Array.isArray(selectedIds) && selectedIds.length > 0) {
      await db.setTcUserRecordAccess(created.id, selectedIds, req.user.id);
    }

    // F2.5 — se admin marcou "pode compartilhar" no modal de criação,
    // aplica via update (createTcUser não tem esse campo por design)
    // F: idem pras 2 permissões de manipular registros (não-defaults)
    const postCreate = {};
    if (canShare === true) postCreate.canShare = true;
    if (editRecordsPermission && editRecordsPermission !== 'all') {
      postCreate.editRecordsPermission = editRecordsPermission;
    }
    if (deleteRecordsPermission && deleteRecordsPermission !== 'none') {
      postCreate.deleteRecordsPermission = deleteRecordsPermission;
    }
    if (Object.keys(postCreate).length > 0) {
      await db.updateTcUser(created.id, postCreate);
    }

    res.json({
      success: true,
      data: {
        id: created.id,
        username: created.username,
        email: created.email,
        temporaryPassword: plainPassword,        // mostra UMA vez ao admin
      },
    });
  } catch (error) {
    console.error('Erro POST /api/admin/tc-users:', error);
    res.status(500).json({ success: false, error: error.message || 'Erro ao criar' });
  }
});

// PUT /api/admin/tc-users/:id — edita campos do tc_user
app.put('/api/admin/tc-users/:id', authenticateToken, requireTcUsersManagement, async (req, res) => {
  try {
    const allowed = ['firstName', 'lastName', 'email', 'phone', 'cpf', 'isActive', 'canShare', 'editRecordsPermission', 'deleteRecordsPermission'];
    const updates = {};
    for (const k of allowed) {
      if (Object.prototype.hasOwnProperty.call(req.body || {}, k)) updates[k] = req.body[k];
    }
    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ success: false, error: 'Nenhum campo fornecido' });
    }
    const updated = await db.updateTcUser(req.params.id, updates);
    res.json({ success: true, data: updated });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message || 'Erro ao atualizar' });
  }
});

// PUT /api/admin/tc-users/:id/password-reset — força reset de senha
app.put('/api/admin/tc-users/:id/password-reset', authenticateToken, requireTcUsersManagement, async (req, res) => {
  try {
    const tcUser = await db.getTcUserById(req.params.id);
    if (!tcUser) return res.status(404).json({ success: false, error: 'Usuário não encontrado' });
    const plainPassword = crypto.randomBytes(6).toString('base64').replace(/[+/=]/g, '').slice(0, 10);
    await db.adminResetTcUserPassword(req.params.id, plainPassword);
    res.json({ success: true, data: { temporaryPassword: plainPassword } });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message || 'Erro ao resetar senha' });
  }
});

// GET /api/admin/tc-users/:id/access — lista os IDs de registros que o tc_user vê
app.get('/api/admin/tc-users/:id/access', authenticateToken, requireTcUsersManagement, async (req, res) => {
  try {
    const ids = await db.getTcUserRecordIds(req.params.id);
    res.json({ success: true, data: ids });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message || 'Erro ao buscar acesso' });
  }
});

// PUT /api/admin/tc-users/:id/access — define quais registros o tc_user vê
app.put('/api/admin/tc-users/:id/access', authenticateToken, requireTcUsersManagement, async (req, res) => {
  try {
    const { recordIds } = req.body || {};
    if (!Array.isArray(recordIds)) {
      return res.status(400).json({ success: false, error: 'recordIds deve ser um array' });
    }
    const result = await db.setTcUserRecordAccess(req.params.id, recordIds, req.user.id);
    res.json({ success: true, ...result });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message || 'Erro ao definir acesso' });
  }
});

// PUT /api/admin/tc-users/:id/deactivate — desativa
app.put('/api/admin/tc-users/:id/deactivate', authenticateToken, requireTcUsersManagement, async (req, res) => {
  try {
    await db.deactivateTcUser(req.params.id);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message || 'Erro ao desativar' });
  }
});

// ===========================================================================
// F2.1 — Convite por email para tc_user
// ===========================================================================

// POST /api/admin/tc-users/invite — admin convida tc_user por email
// Body: { email, selectedIds?: string[] }
app.post('/api/admin/tc-users/invite', authenticateToken, requireTcUsersManagement, async (req, res) => {
  try {
    const { email, selectedIds, canShare, editRecordsPermission, deleteRecordsPermission } = req.body || {};
    if (!email) return res.status(400).json({ success: false, error: 'Email é obrigatório' });

    const expiresDays = Number(process.env.TC_INVITE_EXPIRATION_DAYS || 7) || 7;
    const result = await db.createTcUserInvite({
      email: String(email).trim().toLowerCase(),
      invitedByUserId: req.user.id,
      selectedIds: Array.isArray(selectedIds) ? selectedIds : [],
      expiresDays,
    });

    // F2.5 — aplica can_share + permissões de manipular registros no stub
    // (ou no tc_user existente caso seja reenvio de convite)
    if (result.tcUserId) {
      const postCreate = {};
      if (canShare === true) postCreate.canShare = true;
      if (editRecordsPermission && editRecordsPermission !== 'all') {
        postCreate.editRecordsPermission = editRecordsPermission;
      }
      if (deleteRecordsPermission && deleteRecordsPermission !== 'none') {
        postCreate.deleteRecordsPermission = deleteRecordsPermission;
      }
      if (Object.keys(postCreate).length > 0) {
        await db.updateTcUser(result.tcUserId, postCreate);
      }
    }

    // Monta URL de aceite. TC_PUBLIC_BASE_URL pode estar setado em prod; em dev,
    // fallback baseado em headers.
    const base = process.env.TC_PUBLIC_BASE_URL
      || (req.headers['x-forwarded-proto'] || 'http') + '://' + (req.headers['x-forwarded-host'] || req.headers.host);
    const acceptUrl = `${base}/aceitar-convite?token=${result.token}`;

    // Dispara email (não bloqueia retorno em caso de falha — admin pode reenviar)
    try {
      const inviterName = [req.user.firstName, req.user.lastName].filter(Boolean).join(' ') || req.user.username;
      const { enviarEmailTcConvite } = require('./services/email');
      await enviarEmailTcConvite({
        toEmail: String(email).trim().toLowerCase(),
        acceptUrl,
        invitedByName: inviterName,
        expiresDays,
      });
    } catch (emailErr) {
      console.error('[invite] Falha ao enviar email:', emailErr?.message);
      return res.json({
        success: true,
        warning: 'Convite criado mas falhou ao enviar o email. Use o link abaixo manualmente.',
        data: { acceptUrl, reused: result.reused, expiresAt: result.expiresAt },
      });
    }

    res.json({
      success: true,
      data: { acceptUrl, reused: result.reused, expiresAt: result.expiresAt },
    });
  } catch (error) {
    console.error('Erro POST /api/admin/tc-users/invite:', error);
    res.status(error.message?.includes('Já existe') ? 409 : 500)
      .json({ success: false, error: error.message || 'Erro ao criar convite' });
  }
});

// GET /api/tc-auth/invite/:token — preview público do convite (sem auth)
// Retorna info mínima pra UI saber se o convite é válido + email pré-preenchido
app.get('/api/tc-auth/invite/:token', async (req, res) => {
  try {
    const invite = await db.getTcInviteByToken(req.params.token);
    if (!invite) return res.status(404).json({ success: false, error: 'Convite não encontrado' });
    if (invite.verified_at) return res.status(410).json({ success: false, error: 'Este convite já foi aceito' });
    if (new Date(invite.expires_at) < new Date()) {
      return res.status(410).json({ success: false, error: 'Convite expirado' });
    }
    const inviterName = [invite.inviter_first_name, invite.inviter_last_name].filter(Boolean).join(' ').trim()
      || invite.inviter_username
      || 'Administrador';
    res.json({
      success: true,
      data: {
        email: invite.email,
        invitedByName: inviterName,
        expiresAt: invite.expires_at,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message || 'Erro ao consultar convite' });
  }
});

// POST /api/tc-auth/accept-invite — convidado finaliza cadastro
// Body: { token, username, password, firstName, lastName? }
app.post('/api/tc-auth/accept-invite', async (req, res) => {
  try {
    const { token, username, password, firstName, lastName } = req.body || {};
    if (!token) return res.status(400).json({ success: false, error: 'Token obrigatório' });
    await db.acceptTcInvite({ token, username, password, firstName, lastName });
    res.json({ success: true });
  } catch (error) {
    const msg = error.message || 'Erro ao aceitar convite';
    const status = /já foi aceito|expirado|não encontrado/i.test(msg) ? 410
      : /username|senha|nome|email/i.test(msg) ? 400
      : 500;
    res.status(status).json({ success: false, error: msg });
  }
});

// POST /api/tc-auth/resend-invite — F2.2: convidado pede novo convite
// Público (mesmo limiter do recuperar-senha pra dificultar enumeração).
// Body: { email }
// Sempre responde 200 com mensagem genérica para não vazar quais emails têm
// convite pendente — mas só gera token novo + envia email se realmente houver
// stub pendente para esse email.
app.post('/api/tc-auth/resend-invite', passwordRecoveryLimiter, async (req, res) => {
  try {
    const rawEmail = req.body?.email;
    if (!rawEmail) {
      return res.status(400).json({ success: false, error: 'Email obrigatório' });
    }
    const email = String(rawEmail).trim().toLowerCase();

    const tcUser = await db.getTcUserByEmail(email);
    // Só reenvia se: o user existe, é convite (created_via='invite'), ainda não
    // foi verificado, e está inativo. Caso contrário responde 200 genérico —
    // não queremos diferenciar "email não cadastrado" de "já é ativo" para
    // dificultar enumeração.
    if (
      tcUser
      && tcUser.created_via === 'invite'
      && !tcUser.email_verified_at
      && tcUser.is_active === false
    ) {
      const expiresDays = Number(process.env.TC_INVITE_EXPIRATION_DAYS || 7) || 7;
      // Reaproveita a função do db: ela detecta o stub pendente e gera token novo
      // (sem mexer em acessos existentes do tc_user)
      const result = await db.createTcUserInvite({
        email,
        invitedByUserId: tcUser.created_by_user_id || null,
        selectedIds: [],            // não toca em acessos no reenvio
        expiresDays,
      });

      const base = process.env.TC_PUBLIC_BASE_URL
        || (req.headers['x-forwarded-proto'] || 'http') + '://' + (req.headers['x-forwarded-host'] || req.headers.host);
      const acceptUrl = `${base}/aceitar-convite?token=${result.token}`;

      try {
        const { enviarEmailTcConvite } = require('./services/email');
        // Pega nome do convidador para personalizar
        let inviterName = 'Administrador';
        if (tcUser.created_by_user_id) {
          try {
            const inviter = await db.getUserById(tcUser.created_by_user_id);
            if (inviter) {
              const full = [inviter.first_name, inviter.last_name].filter(Boolean).join(' ').trim();
              inviterName = full || inviter.username || 'Administrador';
            }
          } catch { /* mantém default */ }
        }
        await enviarEmailTcConvite({ toEmail: email, acceptUrl, invitedByName: inviterName, expiresDays });
      } catch (emailErr) {
        console.error('[resend-invite] Falha no email:', emailErr?.message);
      }
    }

    // Resposta genérica em todos os casos
    res.json({
      success: true,
      message: 'Se houver convite pendente para este email, um novo link foi enviado.',
    });
  } catch (error) {
    console.error('Erro POST /api/tc-auth/resend-invite:', error);
    // Mesmo em erro genérico devolvemos 200 pra não permitir enumeração via timing/status
    res.json({
      success: true,
      message: 'Se houver convite pendente para este email, um novo link foi enviado.',
    });
  }
});

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
// POST /api/admin/modules/reorder — Fase 3.0: contrato novo
// Body: { subsystemKey, keys: [...] }. Reorder é POR subsistema agora —
// sort_order é local ao subsystem desde a migration 016.
app.post('/api/admin/modules/reorder', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { subsystemKey, keys } = req.body || {};
    if (!subsystemKey || typeof subsystemKey !== 'string') {
      return res.status(400).json({ error: 'subsystemKey é obrigatório' });
    }
    if (!Array.isArray(keys) || keys.length === 0) {
      return res.status(400).json({ error: 'Array de keys é obrigatório' });
    }
    await db.reorderModules(subsystemKey, keys);
    return res.json({ success: true });
  } catch (error) {
    return res.status(400).json({ error: error.message || 'Erro ao reordenar módulos' });
  }
});

// GET /api/admin/subsystems — lista (read-only) usada pelos dropdowns da UI
app.get('/api/admin/subsystems', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const subsystems = await db.listSubsystems();
    return res.json({ success: true, data: subsystems });
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Erro ao buscar subsistemas' });
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
      isActive,
      subsystemKey,
    } = req.body || {};

    const normalizedKey = normalizeModuleKey(moduleKey);
    if (!normalizedKey || normalizedKey.length < 2) {
      return res.status(400).json({ error: 'moduleKey inválido. Use letras, números, "_" ou "-"' });
    }
    if (!moduleName || String(moduleName).trim().length < 2) {
      return res.status(400).json({ error: 'moduleName é obrigatório' });
    }
    if (!subsystemKey) {
      return res.status(400).json({ error: 'subsystemKey é obrigatório' });
    }
    const sub = await db.getSubsystemByKey(subsystemKey);
    if (!sub) {
      return res.status(400).json({ error: `Subsistema inválido: "${subsystemKey}"` });
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
      isSystem: false,
      subsystemKey,
    });

    await logActivity(req, {
      action: 'create',
      moduleKey: 'admin',
      entityType: 'module',
      entityId: created.moduleKey,
      details: { targetModuleKey: created.moduleKey, subsystemKey },
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
    // moduleKey é imutável (regra antiga). Não aceitamos mais rename via PUT.
    if (req.body.iconName !== undefined) updatePayload.iconName = req.body.iconName ? String(req.body.iconName).trim() : null;
    if (req.body.description !== undefined) updatePayload.description = req.body.description ? String(req.body.description).trim() : null;
    if (req.body.routePath !== undefined) updatePayload.routePath = req.body.routePath ? String(req.body.routePath).trim() : null;
    if (req.body.isActive !== undefined) updatePayload.isActive = req.body.isActive === true;
    if (req.body.subsystemKey !== undefined) {
      const sub = await db.getSubsystemByKey(req.body.subsystemKey);
      if (!sub) {
        return res.status(400).json({ error: `Subsistema inválido: "${req.body.subsystemKey}"` });
      }
      updatePayload.subsystemKey = req.body.subsystemKey;
    }

    const updated = await db.updateModule(moduleKey, updatePayload);

    await logActivity(req, {
      action: 'edit',
      moduleKey: 'admin',
      entityType: 'module',
      entityId: updated.moduleKey,
      details: {
        targetModuleKey: updated.moduleKey,
        ...(updatePayload.subsystemKey ? { movedTo: updatePayload.subsystemKey, movedFrom: existing.subsystemKey } : {}),
      },
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
      canManageTcUsers: user.can_manage_tc_users === true,
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
    const { username, role, permissions } = req.body;

    if (!username || !role) {
      return res.status(400).json({ error: 'Username e role são obrigatórios' });
    }

    // Validar role contra a tabela roles (dinâmica desde fase 2.x — migration 044)
    const roleRow = await db.getRoleByKey(role);
    if (!roleRow) {
      return res.status(400).json({ error: `Role inválida: "${role}" não existe` });
    }

    // Validar permissions (opcional). Se fornecido, deve ser array de pares
    // {moduleKey, accessLevel}. Vai sobrescrever os defaults após a criação.
    if (permissions !== undefined && !Array.isArray(permissions)) {
      return res.status(400).json({ error: 'permissions deve ser um array de {moduleKey, accessLevel}' });
    }

    // Verificar se o usuário já existe
    const existingUser = await db.getUserByUsername(username);
    if (existingUser) {
      return res.status(400).json({ error: 'Usuário já existe' });
    }

    // Placeholder de primeiro login (igual ao alya)
    const placeholderPassword = await bcrypt.hash('FIRST_LOGIN_PLACEHOLDER', 10);

    // Criar usuário (saveUser já aplica seedUserModulePermissionsFromRole
    // com defaults da role; em seguida, se vier permissions custom no body,
    // sobrescrevemos com a matriz informada pelo admin).
    const newUser = await db.saveUser({
      username,
      password: placeholderPassword,
      role,
      lastLogin: null
    });

    if (Array.isArray(permissions)) {
      await db.setUserPermissionsMatrix(newUser.id, permissions);
    }

    // Remover senha antes de enviar
    const { password: _, ...userWithoutPassword } = newUser;
    res.status(201).json({ success: true, data: userWithoutPassword });
    await logActivity(req, {
      action: 'create',
      moduleKey: 'admin',
      entityType: 'user',
      entityId: newUser.id,
      details: { role, customPermissions: Array.isArray(permissions) ? permissions.length : 0 },
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
      address,
      canManageTcUsers,  // F2.4 — só superadmin pode alterar
    } = req.body;

    // Validar role se fornecido (Fase 2.x: dinâmico contra tabela roles)
    if (role) {
      const roleRow = await db.getRoleByKey(role);
      if (!roleRow) {
        return res.status(400).json({ error: `Role inválida: "${role}" não existe` });
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
    if (canManageTcUsers !== undefined) {
      // Só superadmin pode ligar/desligar a flag de gestão delegada
      if (req.user.role !== 'superadmin') {
        return res.status(403).json({ error: 'Apenas superadmin pode alterar a permissão de gerenciamento de TerraControl' });
      }
      updateData.canManageTcUsers = !!canManageTcUsers;
    }
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

    // Fase 2.1: quando role muda, por padrão recalculamos a matriz inteira
    // de permissões a partir dos defaults da role nova. O cliente pode passar
    // keepPermissions=true para preservar a matriz atual (usado na UI quando
    // o admin escolhe explicitamente "manter permissões customizadas").
    const keepPermissions = req.body.keepPermissions === true;
    if (role && !keepPermissions) {
      await db.resetUserPermissionsToDefaults(id, role);
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
        canManageTcUsers: safeUser.can_manage_tc_users === true,
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
// DEPRECATED (Fase 2.5): retorna apenas a presença/ausência, sem nível.
// Use GET /api/admin/users/:id/permissions para a matriz com view/edit.
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
// DEPRECATED (Fase 2.5): salva sempre com access_level='view'. Use
// PUT /api/admin/users/:id/permissions para a matriz com view/edit.
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

// ─── Permissões granulares (Fase 2.1) ────────────────────────────────────────
// Endpoints novos com semântica view/edit explícita. O legado
// /api/users/:id/modules continua funcionando para compat enquanto a UI
// antiga não migrar (será substituído na sub-fase 2.3).

// GET /api/admin/permissions/defaults?role=manager
// Matriz de permissões padrão para uma role — usada pelo modal "Novo Usuário"
// para pré-popular a UI de permissões granulares antes da criação efetiva.
app.get('/api/admin/permissions/defaults', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const role = String(req.query.role || '').trim();
    const roleRow = await db.getRoleByKey(role);
    if (!roleRow) {
      return res.status(400).json({ error: `Role inválida: "${role}" não existe` });
    }
    const matrix = await db.getDefaultPermissionsMatrix(role);
    return res.json({ success: true, data: { role, permissions: matrix } });
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Erro ao carregar defaults' });
  }
});

// ─── Defaults editáveis (Fase 2.x) ───────────────────────────────────────────
// Gerenciamento das tabelas role_default_permissions. Só superadmin edita;
// admins comuns só leem (via /api/admin/permissions/defaults acima).

// GET /api/admin/role-defaults
// Retorna a matriz completa { roles: { [role]: [{moduleKey, ...}] } } com 5
// roles × 21 módulos. Usado pelo painel "Padrões de Função" pra renderizar
// a matriz inicial.
app.get('/api/admin/role-defaults', authenticateToken, requireSuperAdmin, async (req, res) => {
  try {
    // Lista dinâmica desde a 044 — inclui system + roles custom criadas pelo admin
    const allRoles = await db.listRoles();
    const matrices = {};
    for (const r of allRoles) {
      matrices[r.key] = await db.getDefaultPermissionsMatrix(r.key);
    }
    return res.json({ success: true, data: { roles: matrices } });
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Erro ao carregar defaults' });
  }
});

// PUT /api/admin/role-defaults/:role
// Body: { permissions: [{ moduleKey, accessLevel: 'view'|'edit' }] }
// Substitui os defaults de uma role. Módulos ausentes do array = sem acesso.
// Invalida cache automaticamente.
app.put('/api/admin/role-defaults/:role', authenticateToken, requireSuperAdmin, async (req, res) => {
  try {
    const { role } = req.params;
    const { permissions } = req.body;
    const roleRow = await db.getRoleByKey(role);
    if (!roleRow) {
      return res.status(400).json({ error: `Role inválida: "${role}" não existe` });
    }
    if (!Array.isArray(permissions)) {
      return res.status(400).json({ error: 'permissions deve ser um array' });
    }
    const applied = await db.setRoleDefaultPermissions(role, permissions);
    await logActivity(req, {
      action: 'role_defaults_update',
      moduleKey: 'admin',
      entityType: 'role_defaults',
      entityId: role,
      details: { count: applied.length },
    });
    return res.json({ success: true, data: { role, count: applied.length } });
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Erro ao salvar defaults' });
  }
});

// POST /api/admin/role-defaults/:role/reset
// Restaura os defaults da role para os valores hardcoded originais
// (FALLBACK_DEFAULTS em defaults.js).
app.post('/api/admin/role-defaults/:role/reset', authenticateToken, requireSuperAdmin, async (req, res) => {
  try {
    const { role } = req.params;
    const roleRow = await db.getRoleByKey(role);
    if (!roleRow) {
      return res.status(400).json({ error: `Role inválida: "${role}" não existe` });
    }
    const applied = await db.resetRoleDefaultsToFallback(role);
    await logActivity(req, {
      action: 'role_defaults_reset',
      moduleKey: 'admin',
      entityType: 'role_defaults',
      entityId: role,
      details: { count: applied.length },
    });
    return res.json({ success: true, data: { role, count: applied.length } });
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Erro ao resetar defaults' });
  }
});

// ─── CRUD de roles (migration 044) ───────────────────────────────────────────
// Superadmin gerencia o catálogo de funções. As 5 roles do sistema têm key
// imutável e não podem ser deletadas — apenas label/description editáveis.

// GET /api/admin/roles — lista todas (system + custom)
app.get('/api/admin/roles', authenticateToken, requireSuperAdmin, async (req, res) => {
  try {
    const roles = await db.listRoles();
    return res.json({ success: true, data: { roles } });
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Erro ao listar roles' });
  }
});

// POST /api/admin/roles — cria role custom
// Body: { key, label, description?, sortOrder?, cloneFromRole? }
app.post('/api/admin/roles', authenticateToken, requireSuperAdmin, async (req, res) => {
  try {
    const { key, label, description, sortOrder, cloneFromRole } = req.body;
    if (cloneFromRole) {
      const src = await db.getRoleByKey(cloneFromRole);
      if (!src) return res.status(400).json({ error: `cloneFromRole inválido: "${cloneFromRole}"` });
    }
    const created = await db.createRole({ key, label, description, sortOrder, cloneFromRole });
    await logActivity(req, {
      action: 'role_create',
      moduleKey: 'admin',
      entityType: 'role',
      entityId: created.key,
      details: { label: created.label, cloneFromRole: cloneFromRole || null },
    });
    return res.status(201).json({ success: true, data: created });
  } catch (error) {
    return res.status(400).json({ error: error.message || 'Erro ao criar role' });
  }
});

// PUT /api/admin/roles/:key — edita label/description/sortOrder
// key e is_system permanecem imutáveis (inclusive para roles do sistema).
app.put('/api/admin/roles/:key', authenticateToken, requireSuperAdmin, async (req, res) => {
  try {
    const { key } = req.params;
    const { label, description, sortOrder } = req.body;
    const role = await db.getRoleByKey(key);
    if (!role) return res.status(404).json({ error: 'Role não encontrada' });
    const updated = await db.updateRoleMeta(key, { label, description, sortOrder });
    await logActivity(req, {
      action: 'role_update',
      moduleKey: 'admin',
      entityType: 'role',
      entityId: key,
    });
    return res.json({ success: true, data: updated });
  } catch (error) {
    return res.status(400).json({ error: error.message || 'Erro ao atualizar role' });
  }
});

// DELETE /api/admin/roles/:key — exclui role custom
// Falha 400 com code='ROLE_HAS_USERS' se houver usuários — a UI pode então
// usar /usage pra listar e /migrate-users pra esvaziar antes de tentar de novo.
app.delete('/api/admin/roles/:key', authenticateToken, requireSuperAdmin, async (req, res) => {
  try {
    const { key } = req.params;
    await db.deleteRole(key);
    await logActivity(req, {
      action: 'role_delete',
      moduleKey: 'admin',
      entityType: 'role',
      entityId: key,
    });
    return res.json({ success: true });
  } catch (error) {
    const payload = { error: error.message || 'Erro ao excluir role' };
    if (error.code === 'ROLE_HAS_USERS') {
      payload.code = 'ROLE_HAS_USERS';
      payload.userCount = error.userCount;
      return res.status(409).json(payload);
    }
    return res.status(400).json(payload);
  }
});

// GET /api/admin/roles/:key/usage — lista users que usam esta role
app.get('/api/admin/roles/:key/usage', authenticateToken, requireSuperAdmin, async (req, res) => {
  try {
    const { key } = req.params;
    const role = await db.getRoleByKey(key);
    if (!role) return res.status(404).json({ error: 'Role não encontrada' });
    const users = await db.listUsersByRole(key);
    return res.json({ success: true, data: { role: role.key, label: role.label, users } });
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Erro ao buscar uso da role' });
  }
});

// POST /api/admin/roles/:fromKey/migrate-users
// Body: { toKey, resetPermissions?: boolean }
// Migra todos os usuários de fromKey para toKey, opcionalmente resetando
// permissões para os defaults da role de destino.
app.post('/api/admin/roles/:fromKey/migrate-users', authenticateToken, requireSuperAdmin, async (req, res) => {
  try {
    const { fromKey } = req.params;
    const { toKey, resetPermissions = true } = req.body;
    if (!toKey) return res.status(400).json({ error: 'toKey obrigatório' });
    const result = await db.migrateUsersBetweenRoles(fromKey, toKey, !!resetPermissions);
    await logActivity(req, {
      action: 'role_migrate_users',
      moduleKey: 'admin',
      entityType: 'role',
      entityId: fromKey,
      details: { toKey, migrated: result.migrated, resetCount: result.resetCount },
    });
    return res.json({ success: true, data: result });
  } catch (error) {
    return res.status(400).json({ error: error.message || 'Erro ao migrar usuários' });
  }
});

// GET /api/admin/users/:id/permissions
// Retorna a matriz [{ moduleKey, moduleName, subsystemKey, accessLevel|null }]
app.get('/api/admin/users/:id/permissions', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const targetUser = await db.getUserById(id);
    if (!targetUser) {
      return res.status(404).json({ error: 'Usuário não encontrado' });
    }
    const matrix = await db.getUserPermissionsMatrix(id);
    return res.json({
      success: true,
      data: {
        userId: id,
        role: targetUser.role,
        permissions: matrix,
      },
    });
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Erro ao carregar permissões' });
  }
});

// PUT /api/admin/users/:id/permissions
// Body: { permissions: [{ moduleKey, accessLevel: 'view'|'edit' }] }
// Substitui a matriz inteira (módulos ausentes = sem acesso).
app.put('/api/admin/users/:id/permissions', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { permissions } = req.body;
    if (!Array.isArray(permissions)) {
      return res.status(400).json({ error: 'permissions deve ser um array' });
    }
    const targetUser = await db.getUserById(id);
    if (!targetUser) {
      return res.status(404).json({ error: 'Usuário não encontrado' });
    }
    const applied = await db.setUserPermissionsMatrix(id, permissions);
    await logActivity(req, {
      action: 'permission_change',
      moduleKey: 'admin',
      entityType: 'user_permissions',
      entityId: id,
      details: { count: applied.length },
    });
    return res.json({ success: true, data: { count: applied.length } });
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Erro ao atualizar permissões' });
  }
});

// POST /api/admin/users/:id/permissions/reset
// Reseta a matriz para os defaults da role atual do usuário.
app.post('/api/admin/users/:id/permissions/reset', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const targetUser = await db.getUserById(id);
    if (!targetUser) {
      return res.status(404).json({ error: 'Usuário não encontrado' });
    }
    const applied = await db.resetUserPermissionsToDefaults(id);
    await logActivity(req, {
      action: 'permission_reset',
      moduleKey: 'admin',
      entityType: 'user_permissions',
      entityId: id,
      details: { role: targetUser.role, count: applied.length },
    });
    return res.json({ success: true, data: { count: applied.length, role: targetUser.role } });
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Erro ao resetar permissões' });
  }
});

// POST /api/admin/users/:id/permissions/bulk-subsystem
// Body: { subsystemKey: 'gestao', accessLevel: 'view'|'edit'|null }
// Aplica um único nível a todos os módulos do subsistema (null = remove).
app.post('/api/admin/users/:id/permissions/bulk-subsystem', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { subsystemKey, accessLevel } = req.body;
    if (!subsystemKey || typeof subsystemKey !== 'string') {
      return res.status(400).json({ error: 'subsystemKey é obrigatório' });
    }
    const normalizedLevel = (accessLevel === null || accessLevel === 'none') ? null : accessLevel;
    if (normalizedLevel !== null && !['view', 'edit'].includes(normalizedLevel)) {
      return res.status(400).json({ error: "accessLevel deve ser 'view', 'edit' ou null" });
    }
    const targetUser = await db.getUserById(id);
    if (!targetUser) {
      return res.status(404).json({ error: 'Usuário não encontrado' });
    }
    const applied = await db.setSubsystemPermissionsForUser(id, subsystemKey, normalizedLevel);
    await logActivity(req, {
      action: 'permission_bulk_subsystem',
      moduleKey: 'admin',
      entityType: 'user_permissions',
      entityId: id,
      details: { subsystemKey, accessLevel: normalizedLevel, moduleCount: applied.length },
    });
    return res.json({ success: true, data: { subsystemKey, accessLevel: normalizedLevel, count: applied.length } });
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Erro ao aplicar bulk' });
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
    // Fase 1.3 — aceita refresh token via cookie httpOnly OU body (compatibilidade).
    // PR #5 (PWA): também aceita tcAdminRefreshToken como fallback (tc-admin
    // standalone em iOS PWA).
    const refreshToken =
      (req.cookies && req.cookies.refreshToken) ||
      (req.cookies && req.cookies.tcAdminRefreshToken) ||
      req.body.refreshToken;
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

    // Atualiza ambos os cookies (rotação) + o cookie tc-admin quando aplicável.
    setAuthCookies(req, res, accessToken, rotated.token);
    setTcAdminAuthCookies(req, res, accessToken, rotated.token);

    return res.json({ success: true, token: accessToken, refreshToken: rotated.token });
  } catch (error) {
    console.error('Erro ao renovar token:', error);
    return res.status(500).json({ success: false, error: 'Erro interno do servidor' });
  }
});

app.post('/api/auth/logout', authenticateToken, async (req, res) => {
  try {
    // Fase 1.3 — aceita refresh token via cookie httpOnly OU body
    const refreshToken = (req.cookies && req.cookies.refreshToken) || req.body.refreshToken;
    if (refreshToken) {
      const tokenData = await verifyRefreshToken(refreshToken);
      if (tokenData) {
        await revokeSessionByRefreshTokenId(tokenData.id, 'Logout do usuário');
        const { revokeRefreshToken } = require('./utils/refresh-tokens');
        await revokeRefreshToken(refreshToken);
      }
    }
    // Limpa cookies independentemente de termos achado o refresh token
    clearAuthCookies(req, res);
    clearTcAdminAuthCookies(req, res);
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
      if (saved) {
        inserted++;
        await applyRulesAndPersist(saved, { actingUserId: req.user.id });
      } else {
        skipped++;
      }
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
      const savedPayment = await db.saveAsaasTransaction(tx);
      if (savedPayment) await applyRulesAndPersist(savedPayment, { actingUserId: null });
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
      const savedTransfer = await db.saveAsaasTransaction(tx);
      if (savedTransfer) await applyRulesAndPersist(savedTransfer, { actingUserId: null });
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

// GET /api/faq — auth opcional; filtra por visibilidade conforme role do usuário
app.get('/api/faq', optionalAuth, async (req, res) => {
  try {
    const userRole = req.user?.role || 'guest';
    const items = await db.obterFAQ(userRole);
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
    const { pergunta, resposta, visibility } = req.body;
    if (!pergunta || !pergunta.trim() || !resposta || !resposta.trim()) {
      return res.status(400).json({ success: false, error: 'Pergunta e resposta são obrigatórias' });
    }
    const item = await db.criarFAQ({ pergunta: pergunta.trim(), resposta: resposta.trim(), visibility: visibility || 'todos' });
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
    const data = await db.obterDocumentacao('guest');
    res.json({ success: true, data });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.get('/api/documentation', authenticateToken, async (req, res) => {
  try {
    const userRole = req.user?.role || 'guest';
    const data = await db.obterDocumentacao(userRole);
    res.json({ success: true, data });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.post('/api/admin/documentation/sections', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { title, visibility } = req.body;
    if (!title?.trim()) return res.status(400).json({ success: false, error: 'Título obrigatório' });
    const data = await db.criarDocSection({ title: title.trim(), visibility: visibility || 'todos' });
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
    const { title, visibility } = req.body;
    if (title !== undefined && !title?.trim()) return res.status(400).json({ success: false, error: 'Título não pode ser vazio' });
    const data = await db.atualizarDocSection(req.params.id, {
      title: title?.trim(),
      visibility: visibility,
    });
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
app.get('/api/rodape', optionalAuth, async (req, res) => {
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

// Commits pendentes (fila completa para o superadmin processar em carrossel)
app.get('/api/admin/rodape/commits-pendentes', authenticateToken, requireSuperAdmin, async (req, res) => {
  try {
    const data = await db.obterCommitsPendentes();
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/admin/rodape/confirmar-commit', authenticateToken, requireSuperAdmin, async (req, res) => {
  try {
    const { action, novaVersao, mensagem, data, commitHash, rolesNotificados, manterSessionId } = req.body;
    if (!['manter', 'nova_versao', 'ignorar'].includes(action)) {
      return res.status(400).json({ success: false, error: 'action inválido.' });
    }
    if (action !== 'ignorar' && !mensagem?.trim()) {
      return res.status(400).json({ success: false, error: 'mensagem obrigatória.' });
    }
    await db.confirmarCommit({
      action, novaVersao, mensagem, data, commitHash,
      rolesNotificados: rolesNotificados || [],
      manterSessionId,
    });
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
app.listen(port, async () => {
  console.log(`🚀 Servidor rodando na porta ${port}`);
  console.log(`📡 API disponível em http://localhost:${port}`);
  console.log(`🧪 Teste a API em http://localhost:${port}/api/test`);

  // Garantir que todas as tabelas existam antes de iniciar timers/monitoramento
  try {
    await db.ensureProfileSchema();
    console.log('✅ Schema do banco inicializado com sucesso.');
  } catch (err) {
    console.error('❌ Erro ao inicializar schema no startup:', err.message);
  }

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

  // PM Fase 5: aborta sessões Pomodoro "mortas" (aba fechada > 30min sem
  // heartbeat). A cada 5min. Evita sessões eternas inflando o tempo ativo.
  const pomodoroStaleTimer = setInterval(async () => {
    try {
      const n = await pmPomodoroService.abortStaleSessions(db);
      if (n > 0) console.log(`[pomodoro] ${n} sessão(ões) abortada(s) por timeout de heartbeat.`);
    } catch (error) {
      console.log('[pomodoro] erro ao abortar sessões mortas:', error.message);
    }
  }, 5 * 60 * 1000);
  if (typeof pomodoroStaleTimer.unref === 'function') pomodoroStaleTimer.unref();

  // PM Fase 7: detector de tarefas atrasadas (a cada 1min). Marca overdue +
  // notifica responsável e admins (idempotente — só pega available/in_progress).
  const pmOverdueTimer = setInterval(async () => {
    try {
      const n = await pmReportService.detectAndMarkOverdue(db);
      if (n > 0) console.log(`[pm-report] ${n} tarefa(s) marcada(s) como atrasada(s).`);
    } catch (error) { console.log('[pm-report] erro no detector de atraso:', error.message); }
  }, 60 * 1000);
  if (typeof pmOverdueTimer.unref === 'function') pmOverdueTimer.unref();

  // PM Fase 7: tick de relatórios por e-mail (a cada 5min). Envia o relatório
  // do período anterior fechado p/ admins opt-in; idempotente via pm_report_jobs.
  const pmReportTimer = setInterval(async () => {
    try {
      const sent = await pmReportService.sendDueReports(db, new Date());
      if (sent > 0) console.log(`[pm-report] ${sent} relatório(s) enviado(s) por e-mail.`);
    } catch (error) { console.log('[pm-report] erro no tick de relatórios:', error.message); }
  }, 5 * 60 * 1000);
  if (typeof pmReportTimer.unref === 'function') pmReportTimer.unref();

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
          if (saved) {
            inserted++;
            await applyRulesAndPersist(saved, { actingUserId: null });
          }
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
