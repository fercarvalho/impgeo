// Auth para tc_users (usuários externos do TerraControl).
// JWT separado por audience (aud='terracontrol') para não confundir com
// sessões impgeo. Refresh token armazenado como SHA256-hash no DB; rotação
// independente. Espelha a lógica de server/utils/refresh-tokens.js, mas
// usa as tabelas tc_*.

const crypto = require('crypto');
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'change-me-in-prod';
const JWT_AUDIENCE = 'terracontrol';
const ACCESS_TOKEN_EXPIRES = '15m';                // curto, refresh frequente
const REFRESH_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 dias

// Garante a coluna password e bcrypt instalado no projeto (idem impgeo).
const bcrypt = require('bcryptjs');

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function buildAccessToken(tcUser) {
  // Claims mínimos. Não inclui senha nem dados sensíveis.
  // sub = id; aud='terracontrol' diferencia do JWT impgeo.
  return jwt.sign(
    {
      sub: tcUser.id,
      username: tcUser.username,
      forcePasswordChange: !!tcUser.force_password_change,
    },
    JWT_SECRET,
    { expiresIn: ACCESS_TOKEN_EXPIRES, audience: JWT_AUDIENCE }
  );
}

function verifyAccessToken(token) {
  // Retorna o payload se válido; lança erro se inválido/expirado/audience errado.
  return jwt.verify(token, JWT_SECRET, { audience: JWT_AUDIENCE });
}

// Extrai token Bearer; o frontend tc_user usa header explícito (cookie
// httpOnly seria complicado dado que vamos rodar em subdomínio diferente).
function extractTcAccessToken(req) {
  const authHeader = req.headers['authorization'];
  if (!authHeader) return null;
  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') return null;
  const t = parts[1];
  if (!t || t === 'null' || t === 'undefined' || t.length < 10) return null;
  return t;
}

// Middleware: popula req.tcUser se JWT tc válido.
function authenticateTcUser(req, res, next) {
  const token = extractTcAccessToken(req);
  if (!token) {
    return res.status(401).json({ success: false, error: 'Token requerido' });
  }
  try {
    const payload = verifyAccessToken(token);
    if (!payload || payload.aud !== JWT_AUDIENCE) {
      return res.status(401).json({ success: false, error: 'Token inválido' });
    }
    req.tcUser = { id: payload.sub, username: payload.username, forcePasswordChange: payload.forcePasswordChange };
    next();
  } catch (err) {
    return res.status(401).json({ success: false, error: 'Token inválido ou expirado' });
  }
}

// Cria refresh token, persiste hash, retorna o valor plain para enviar ao cliente.
async function createTcRefreshToken(db, { tcUserId, ip, userAgent }) {
  const token = crypto.randomBytes(64).toString('hex');
  const tokenHash = sha256(token);
  const expiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_MS).toISOString();
  await db.insertTcRefreshToken({ tcUserId, tokenHash, expiresAt, ip, userAgent });
  return { token, expiresAt };
}

// Valida refresh, gera novo par (access + refresh), revoga o anterior e
// vincula via replaced_by para auditoria. Retorna { tcUser, accessToken, refreshToken }.
async function rotateTcRefreshToken(db, { refreshToken, ip, userAgent }) {
  if (!refreshToken) throw new Error('Refresh token ausente');
  const currentHash = sha256(refreshToken);
  const row = await db.getTcRefreshTokenByHash(currentHash);
  if (!row) throw new Error('Refresh token inválido ou expirado');
  const tcUser = await db.getTcUserById(row.tc_user_id);
  if (!tcUser || !tcUser.is_active) {
    await db.revokeTcRefreshToken(currentHash);
    throw new Error('Usuário inativo');
  }
  // Novo par
  const { token: newRefresh } = await createTcRefreshToken(db, { tcUserId: tcUser.id, ip, userAgent });
  const newHash = sha256(newRefresh);
  await db.revokeTcRefreshToken(currentHash, newHash);
  const accessToken = buildAccessToken(tcUser);
  return { tcUser, accessToken, refreshToken: newRefresh };
}

// Login: valida credenciais, gera tokens, atualiza last_login.
async function loginTcUser(db, { username, password, ip, userAgent }) {
  const user = await db.getTcUserByUsername(String(username || '').trim());
  if (!user) return { ok: false, status: 401, error: 'Credenciais inválidas' };

  // F2.2: convite pendente que passou do prazo → 423 Locked com email para reenvio
  if (user.created_via === 'invite' && !user.email_verified_at && user.is_active === false) {
    const expirationDays = Number(process.env.TC_INVITE_EXPIRATION_DAYS || 7) || 7;
    const createdAt = new Date(user.created_at);
    const expiresAt = new Date(createdAt.getTime() + expirationDays * 24 * 60 * 60 * 1000);
    if (new Date() > expiresAt) {
      return {
        ok: false,
        status: 423,
        error: 'Seu convite expirou. Solicite um novo email de convite.',
        code: 'invite_expired',
        email: user.email || null,
      };
    }
    // Se ainda não expirou mas não aceitou → orientar a clicar no link do email
    return {
      ok: false,
      status: 403,
      error: 'Você ainda não completou o cadastro. Verifique o email de convite ou peça um novo.',
      code: 'invite_pending',
      email: user.email || null,
    };
  }

  if (!user.is_active) return { ok: false, status: 403, error: 'Usuário inativo. Contate o administrador.' };

  const passwordOk = await bcrypt.compare(String(password || ''), user.password);
  if (!passwordOk) return { ok: false, status: 401, error: 'Credenciais inválidas' };

  await db.setTcUserLastLogin(user.id);
  const accessToken = buildAccessToken(user);
  const { token: refreshToken } = await createTcRefreshToken(db, { tcUserId: user.id, ip, userAgent });
  return {
    ok: true,
    accessToken,
    refreshToken,
    tcUser: sanitizeTcUser(user),
    forcePasswordChange: !!user.force_password_change,
  };
}

// Logout: revoga o refresh token informado.
async function logoutTcUser(db, refreshToken) {
  if (!refreshToken) return;
  const hash = sha256(refreshToken);
  await db.revokeTcRefreshToken(hash);
}

// F2.3: dado o tc_user, devolve se ele precisa completar o perfil.
// Trigger: aceitou convite (email_verified_at populado) MAS ainda não preencheu
// pelo menos um dos campos essenciais (telefone, CPF, data de nascimento ou
// endereço com cidade). Cadastros 'direct' e 'migrated' não disparam o modal —
// só quem passou pelo fluxo de convite por email.
function computeRequiresProfileCompletion(rest) {
  if (!rest.email_verified_at) return false;
  if (rest.created_via !== 'invite') return false;
  const addr = rest.address || {};
  const hasAddressCity = !!(addr && typeof addr === 'object' && (addr.city || addr.cidade));
  return !rest.phone || !rest.cpf || !rest.birth_date || !hasAddressCity;
}

// Remove campos sensíveis antes de enviar para o cliente.
function sanitizeTcUser(user) {
  if (!user) return null;
  const { password, ...rest } = user;
  // Normaliza camelCase para o frontend
  return {
    id: rest.id,
    username: rest.username,
    firstName: rest.first_name,
    lastName: rest.last_name,
    email: rest.email,
    emailVerifiedAt: rest.email_verified_at,
    phone: rest.phone,
    cpf: rest.cpf,
    birthDate: rest.birth_date,
    gender: rest.gender,
    address: rest.address,
    photoUrl: rest.photo_url,
    forcePasswordChange: rest.force_password_change,
    isActive: rest.is_active,
    createdVia: rest.created_via,
    canShare: rest.can_share === true,   // F2.5 — permite gerar sub-share links
    // F: permissões de manipular registros que o tc_user tem acesso
    editRecordsPermission: rest.edit_records_permission || 'all',
    deleteRecordsPermission: rest.delete_records_permission || 'none',
    lastLogin: rest.last_login,
    createdAt: rest.created_at,
    updatedAt: rest.updated_at,
    requiresProfileCompletion: computeRequiresProfileCompletion(rest),
  };
}

module.exports = {
  JWT_AUDIENCE,
  ACCESS_TOKEN_EXPIRES,
  REFRESH_TOKEN_TTL_MS,
  sha256,
  buildAccessToken,
  verifyAccessToken,
  extractTcAccessToken,
  authenticateTcUser,
  createTcRefreshToken,
  rotateTcRefreshToken,
  loginTcUser,
  logoutTcUser,
  sanitizeTcUser,
};
