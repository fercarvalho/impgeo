// ═══════════════════════════════════════════════════════════════════════════
// server/routes/auth.js
// Autenticação do impgeo e entradas TC: login (impgeo), login-terracontrol-admin,
// tc-entry/login, verify (2FA), recuperação/validação/reset de senha. Extraídas de
// server.js (#3) — comportamento idêntico (rotas verbatim, paths preservados).
//
// Cookie helpers (setAuthCookies/setTcAdminAuthCookies/setTcAuthCookies) e
// tcRequestContext ficam no server.js (compartilhados com refresh/logout/tc-auth)
// e chegam por injeção. tcAuth aqui é o módulo de serviço (../auth/tc-auth).
// ═══════════════════════════════════════════════════════════════════════════
'use strict';

const express = require('express');
const { z } = require('zod');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const tcAuth = require('../auth/tc-auth');

module.exports = function createAuthRoutes({
  db, authenticateToken, JWT_SECRET, PASSWORD_RESET_TOKEN_TTL_MINUTES,
  logActivity, loginLimiter, passwordRecoveryLimiter, passwordResetLimiter,
  passwordTokenValidationLimiter, mapUserToClient, validateEmailFormat,
  setAuthCookies, setTcAdminAuthCookies, setTcAuthCookies, tcRequestContext,
  buildPasswordResetUrl, generateRandomPassword,
}) {
  const router = express.Router();

const loginSchema = z.object({
  username: z.string().min(1, 'Usuário é obrigatório'),
  password: z.string().min(1, 'Senha é obrigatória')
});

router.post('/api/auth/login', async (req, res) => {
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
router.post('/api/auth/login-terracontrol-admin', loginLimiter, async (req, res) => {
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
router.post('/api/tc-entry/login', loginLimiter, async (req, res) => {
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

router.post('/api/auth/verify', authenticateToken, async (req, res) => {
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

    // #9: expõe o contexto de impersonation derivado das claims do token
    // (o cookie httpOnly cruza subdomínios, mas o sessionStorage é per-origin —
    // então a UI aprende "estou impersonando e o original é X" pela verify).
    return res.json({
      success: true,
      user: mapUserToClient(refreshedUser || { ...currentUser, last_login: nowISO }),
      impersonation: req.user.impersonatedBy
        ? { active: true, originalUsername: req.user.impersonatedByUsername || null }
        : { active: false },
    });
  } catch (error) {
    return res.status(500).json({ success: false, error: 'Erro interno do servidor' });
  }
});

router.post('/api/auth/recuperar-senha', passwordRecoveryLimiter, async (req, res) => {
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

router.get('/api/auth/validar-token/:token', passwordTokenValidationLimiter, async (req, res) => {
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

router.post('/api/auth/resetar-senha', passwordResetLimiter, async (req, res) => {
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

  return router;
};
