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
const pmDashboardService = require('./services/pm/dashboard-service');
const pmGoalsService = require('./services/pm/goals-service');
const pmReconcileService = require('./services/pm/reconcile-service');
const pmApprovalsService = require('./services/pm/approvals-service');
const { parsePagination } = require('./services/pm/pagination');
const createPmRoutes = require('./routes/pm'); // #3: rotas do PM extraídas para routes/pm.js
const createFinanceiroRoutes = require('./routes/financeiro'); // #3: rotas do Financeiro extraídas para routes/financeiro.js
const createContentRoutes = require('./routes/content'); // #3: rotas de conteúdo/CMS extraídas para routes/content.js
const createTerraControlRoutes = require('./routes/terracontrol'); // #3: rotas do TerraControl (impgeo+público) extraídas
const createTcAuthRoutes = require('./routes/tc-auth'); // #3: portal tc-auth (/api/tc-auth/*) extraído
const createAdminRoutes = require('./routes/admin'); // #3: gestão administrativa (módulos/roles/permissões/users) extraída
const createNotificationsRoutes = require('./routes/notifications'); // #3: notificações impgeo (list/push/prefs/defaults) extraídas
const createTransactionsRoutes = require('./routes/transactions'); // #3: transações/regras/subcategorias (financeiro) extraídas
const createUserProfileRoutes = require('./routes/user-profile'); // #3: autoatendimento do usuário (perfil/foto/senha) extraído
// Envelope de paginação aditivo (melhoria #12): `data` continua array; este
// objeto vai como irmão `pagination`. Sem `limit` (não paginado) → page/totalPages 1.
function pageEnvelope(pg, total) {
  return {
    total,
    limit: pg.limit,
    offset: pg.offset,
    page: pg.limit ? Math.floor(pg.offset / pg.limit) + 1 : 1,
    totalPages: pg.limit ? Math.max(1, Math.ceil(total / pg.limit)) : 1,
  };
}
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
// Com o update tc_users (migration 025/026) entrou o host do TerraControl.
// Desde a unificação de domínio, é UM só host — terracontrol.com.br — com
// login unificado (cliente tc_user + equipe impgeo no mesmo formulário, ver
// POST /api/tc-entry/login). Não há mais subdomínio admin.terracontrol.
// Origem precisa ser permitida dinamicamente.
const isAllowedSubsystemOrigin = (origin) => {
  if (!origin) return false;
  // dev: http(s)://(qualquer-coisa.)impgeo.local(:port)
  if (/^https?:\/\/([a-z0-9-]+\.)?impgeo\.local(?::\d+)?$/.test(origin)) return true;
  // prod: https://(qualquer-coisa.)impgeo.sistemas.viverdepj.com.br
  if (/^https:\/\/([a-z0-9-]+\.)?impgeo\.sistemas\.viverdepj\.com\.br$/.test(origin)) return true;
  // dev: http(s)://terracontrol.local(:port)
  if (/^https?:\/\/terracontrol\.local(?::\d+)?$/.test(origin)) return true;
  // prod: https://terracontrol.com.br (login unificado — sem subdomínio admin)
  if (/^https:\/\/terracontrol\.com\.br$/.test(origin)) return true;
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
  if (hostname === 'terracontrol.com.br' || hostname.endsWith('.terracontrol.com.br')) {
    return '.terracontrol.com.br';
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
  if (process.env.TC_ADMIN_COOKIE_DOMAIN || process.env.TC_COOKIE_DOMAIN) {
    return process.env.TC_ADMIN_COOKIE_DOMAIN || process.env.TC_COOKIE_DOMAIN;
  }
  const hostname = (req.hostname || '').toLowerCase();
  if (hostname === 'terracontrol.local' || hostname.endsWith('.terracontrol.local')) {
    return '.terracontrol.local';
  }
  if (hostname === 'terracontrol.com.br' || hostname.endsWith('.terracontrol.com.br')) {
    return '.terracontrol.com.br';
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
  '/tc-entry/login',            // login unificado do terracontrol.com.br (cliente + equipe)
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
        const savedT = await db.saveTransaction({ ...rest, source: 'import_xlsx' });
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
    const { transactions, importType } = req.body;
    if (!Array.isArray(transactions) || transactions.length === 0) {
      return res.status(400).json({ success: false, error: 'Nenhuma transação para importar.' });
    }
    // Origem: 'fatura' (cartão) ou 'extrato' (banco). Default 'extrato'.
    const importSource = importType === 'fatura' ? 'fatura' : 'extrato';
    const saved = [];
    let pendingCount = 0;
    let appliedCount = 0;
    for (const t of transactions) {
      const savedT = await db.saveTransaction({ ...t, userId: req.user.id, source: importSource });
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

const VALID_TRANSACTION_TYPES = ['Receita', 'Despesa', 'Reforço de caixa', 'Retirada de caixa', 'Transferência entre contas', 'A confirmar'];

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

// APIs de transações/regras/subcategorias (financeiro) — extraídas para routes/transactions.js (#3)
app.use(createTransactionsRoutes({
  db, logActivity, applyRulesAndPersist, _truncateForNotif,
  VALID_TRANSACTION_TYPES, requireRulePermission,
}));

// Notificações do impgeo (list/push/prefs/defaults) — extraídas para routes/notifications.js (#3)
app.use(createNotificationsRoutes({ db, authenticateToken }));


// APIs para Clientes
app.use(createPmRoutes({ db, requireModulePermission, pageEnvelope, uploadPmAttachment, pmAttachmentsDir }));


// APIs para TerraControl (lado impgeo + público) — extraídas para routes/terracontrol.js (#3)
app.use(createTerraControlRoutes({
  db, authenticateToken, optionalAuth, budgetService, budgetDispatcher,
  documentsDir, BASE_URL, slugify, sharePasswordLimiter, sharePublicLimiter,
}));

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

// APIs do tc_users (portal tc-auth) — extraídas para routes/tc-auth.js (#3)
app.use(createTcAuthRoutes({
  db, budgetService, budgetDispatcher,
  setTcAuthCookies, clearTcAuthCookies, tcRequestContext,
  loginLimiter, passwordRecoveryLimiter, passwordResetLimiter, passwordTokenValidationLimiter,
  upload, uploadAvatar, uploadDocument, slugify,
}));

// APIs para Produtos
app.use(createFinanceiroRoutes({ db, authenticateToken, logActivity }));

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

// POST /api/tc-entry/login — LOGIN UNIFICADO do terracontrol.com.br.
// Um único formulário aceita credenciais de cliente (tc_users) E de equipe
// (users com acesso ao módulo terracontrol). Como username é globalmente único
// (garantido na criação — ver findUsernameOwnerTable), decidimos a tabela de
// forma determinística e roteamos. A resposta traz `kind: 'tc_user' | 'impgeo'`
// pro frontend escolher a experiência (TcLoggedView vs TerraControlAdminShell).
// Falha em qualquer ramo devolve 401 genérico (não vaza em qual tabela existe).
app.post('/api/tc-entry/login', loginLimiter, async (req, res) => {
  try {
    const { username, password } = req.body || {};
    if (!username || !password) {
      return res.status(400).json({ success: false, error: 'Usuário e senha são obrigatórios' });
    }

    const owner = await db.findUsernameOwnerTable(username);

    // ── Caminho CLIENTE (tc_user) ──────────────────────────────────────────
    if (owner === 'tc_user') {
      const ctx = tcRequestContext(req);
      const result = await tcAuth.loginTcUser(db, { username, password, ...ctx });
      if (!result.ok) {
        // Encaminha 'code'/'email' (convite expirado/pendente) igual ao /tc-auth/login
        const payload = { success: false, error: result.error };
        if (result.code) payload.code = result.code;
        if (result.email) payload.email = result.email;
        return res.status(result.status).json(payload);
      }
      setTcAuthCookies(req, res, result.accessToken, result.refreshToken);
      return res.json({
        success: true,
        kind: 'tc_user',
        token: result.accessToken,
        refreshToken: result.refreshToken,
        tcUser: result.tcUser,
        forcePasswordChange: result.forcePasswordChange,
        legacyTokenInBody: true,
      });
    }

    // ── Caminho EQUIPE (impgeo com acesso ao módulo terracontrol) ───────────
    if (owner === 'impgeo') {
      const user = await db.getUserByUsername(username);
      if (!user || user.is_active === false) {
        return res.status(401).json({ success: false, error: 'Credenciais inválidas' });
      }
      // Primeiro acesso (senha placeholder) NÃO é suportado aqui — o membro da
      // equipe faz o 1º login pelo sistema impgeo. Aqui só senha real.
      const isValidPassword = await bcrypt.compare(String(password), user.password);
      if (!isValidPassword) {
        return res.status(401).json({ success: false, error: 'Credenciais inválidas' });
      }

      // Gate de módulo: só entra no terracontrol.com.br quem tem TerraControl.
      let hasTerracontrolAccess = false;
      if (user.role === 'superadmin' || user.role === 'admin') {
        hasTerracontrolAccess = true;
      } else if (user.role === 'user') {
        const perms = await db.getUserModulePermissions(user.id);
        hasTerracontrolAccess = Array.isArray(perms) && perms.some(p => p.moduleKey === 'terracontrol');
      }
      if (!hasTerracontrolAccess) {
        return res.status(403).json({ success: false, error: 'Você não tem acesso ao módulo TerraControl. Contate o administrador.' });
      }

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
        details: { role: user.role, via: 'tc-entry' },
        ipAddress: req.ip || req.headers['x-forwarded-for'] || null,
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
        console.warn('[tc-entry] Falha ao criar refresh token/sessão:', sessionError.message);
      }

      setAuthCookies(req, res, token, refreshTokenValue);
      setTcAdminAuthCookies(req, res, token, refreshTokenValue);
      const response = { success: true, kind: 'impgeo', token, user: mapUserToClient(updatedUserProfile || user) };
      if (refreshTokenValue) response.refreshToken = refreshTokenValue;
      return res.json(response);
    }

    // ── Username não existe em nenhuma tabela → genérico ────────────────────
    return res.status(401).json({ success: false, error: 'Credenciais inválidas' });
  } catch (error) {
    console.error('Erro em /api/tc-entry/login:', error);
    res.status(500).json({ success: false, error: 'Erro interno do servidor' });
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

// Autoatendimento do usuário (perfil/preferências/foto/username/senha) — extraídas para routes/user-profile.js (#3)
app.use(createUserProfileRoutes({
  db, authenticateToken, JWT_SECRET, upload, uploadAvatar,
  deleteAvatarFile, mapUserToClient, validateEmailFormat,
}));

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

// (requireLegalPermission movido para routes/content.js — usado só pelas rotas de conteúdo/LGPD)

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
    // Unicidade global: username não pode existir nem em tc_users nem em users
    // (equipe impgeo) — requisito do login unificado do terracontrol.com.br.
    if (await db.findUsernameOwnerTable(String(username).trim().toLowerCase())) {
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

// APIs de gestão administrativa (módulos, roles, permissões, statistics, users) — extraídas para routes/admin.js (#3)
app.use(createAdminRoutes({
  db, authenticateToken, requireAdmin, requireSuperAdmin, logActivity,
  normalizeModuleKey, parseAddress,
}));

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

app.use(createContentRoutes({ db, authenticateToken, requireAdmin, requireSuperAdmin, optionalAuth, logActivity }));

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

  // Reconciliação de totais (#10/#14) — diária. Detecta projetos com
  // expenses_cents/progress_pct divergentes (view pm_totals_drift_v), loga a
  // divergência e auto-corrige via as funções de recalc da 052 (nunca silencioso).
  const pmReconcileTimer = setInterval(async () => {
    try {
      const drifts = await pmReconcileService.checkTotals(db);
      if (drifts.length > 0) {
        console.warn(`[pm-reconcile] ${drifts.length} projeto(s) com totais divergentes:`,
          drifts.map(d => d.project_id).join(', '));
        const { fixed } = await pmReconcileService.healTotals(db);
        console.warn(`[pm-reconcile] ${fixed} projeto(s) corrigido(s) via recalc.`);
      }
    } catch (error) { console.log('[pm-reconcile] erro na reconciliação:', error.message); }
  }, 24 * 60 * 60 * 1000);
  if (typeof pmReconcileTimer.unref === 'function') pmReconcileTimer.unref();

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
