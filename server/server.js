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
const createTcUsersRoutes = require('./routes/tc-users'); // #3: admin gerenciando tc_users + convites tc-auth extraído
const createAuthRoutes = require('./routes/auth'); // #3: autenticação (login/verify/recuperação-senha) extraída
const createImportExportRoutes = require('./routes/import-export'); // #3: import/export de dados (XLSX) extraído
const createSessionsRoutes = require('./routes/sessions'); // #3: sessão/segurança (refresh/logout/sessions/impersonation) extraído
const createAsaasRoutes = require('./routes/asaas'); // #3: integração Asaas (sync + webhook) extraída
const createMiscRoutes = require('./routes/misc'); // #3: rotas avulsas (resets/healthcheck/limpeza) extraídas
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

// #9: impersonation via cookie httpOnly server-set (substitui o cookie-pai
// JS-legível que era exfiltrável por XSS). Mesmo Domain=.impgeo.* do accessToken
// → cruza subdomínios nativamente; httpOnly → JS não lê. TTL casa com o JWT (2h).
// `extractAccessToken` dá prioridade a este cookie sobre header/accessToken.
const IMPERSONATION_TOKEN_MAX_AGE = 2 * 60 * 60 * 1000; // 2h (igual ao expiresIn do JWT)
const setImpersonationCookie = (req, res, token) => {
  res.cookie('impersonationToken', token, { ...getAuthCookieOptions(req), maxAge: IMPERSONATION_TOKEN_MAX_AGE });
};
const clearImpersonationCookie = (req, res) => {
  res.clearCookie('impersonationToken', getAuthCookieOptions(req));
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
// #9: extração movida para utils/token-extraction.js (pura, testada). A ordem de
// prioridade agora é: cookie httpOnly `impersonationToken` > header Bearer >
// cookie `accessToken`/`tcAdminAccessToken`.
const { extractAccessToken } = require('./utils/token-extraction');

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

// Importação/exportação de dados (XLSX): modelos, import, export, extrato — extraídas para routes/import-export.js (#3)
app.use(createImportExportRoutes({ db, authenticateToken, applyRulesAndPersist, logActivity, upload, uploadMemory }));

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
  uploadDocument,
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
app.use(createAuthRoutes({
  db, authenticateToken, JWT_SECRET, PASSWORD_RESET_TOKEN_TTL_MINUTES,
  logActivity, loginLimiter, passwordRecoveryLimiter, passwordResetLimiter,
  passwordTokenValidationLimiter, mapUserToClient, validateEmailFormat,
  setAuthCookies, setTcAdminAuthCookies, setTcAuthCookies, tcRequestContext,
  buildPasswordResetUrl, generateRandomPassword,
}));

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

// Admin do impgeo gerenciando tc_users + convites tc-auth — extraídas para routes/tc-users.js (#3)
app.use(createTcUsersRoutes({ db, authenticateToken, requireTcUsersManagement, passwordRecoveryLimiter }));

// Rotas avulsas (resets de senha, healthcheck, limpeza de projeção) — extraídas para routes/misc.js (#3)
app.use(createMiscRoutes({ db, authenticateToken, requireAdmin, logActivity }));

// APIs de gestão administrativa (módulos, roles, permissões, statistics, users) — extraídas para routes/admin.js (#3)
app.use(createAdminRoutes({
  db, authenticateToken, requireAdmin, requireSuperAdmin, logActivity,
  normalizeModuleKey, parseAddress,
}));


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


// Sessão e segurança (refresh/logout/sessions/anomalies/security-alerts/impersonation) — extraídas para routes/sessions.js (#3)
app.use(createSessionsRoutes({
  db, authenticateToken, JWT_SECRET, requireAdmin, requireSuperAdmin,
  setAuthCookies, setTcAdminAuthCookies, clearAuthCookies, clearTcAdminAuthCookies,
  setImpersonationCookie, clearImpersonationCookie,
}));

// Integração Asaas (sync manual + webhook) — extraídas para routes/asaas.js (#3)
app.use(createAsaasRoutes({ db, authenticateToken, requireAdmin, applyRulesAndPersist }));

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
