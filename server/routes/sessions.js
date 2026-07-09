// ═══════════════════════════════════════════════════════════════════════════
// server/routes/sessions.js
// Sessão e segurança do impgeo: refresh token, logout, gestão de sessões ativas
// (listar/encerrar), dashboards de anomalias e alertas de segurança, e
// impersonation (superadmin assume outro usuário / encerra). Extraídas de
// server.js (#3) — comportamento idêntico (rotas verbatim, paths preservados).
//
// Cookie helpers (set/clear Auth/TcAdmin) ficam no server.js (compartilhados)
// e chegam por injeção.
// ═══════════════════════════════════════════════════════════════════════════
'use strict';

const express = require('express');
const jwt = require('jsonwebtoken');

module.exports = function createSessionsRoutes({
  db, authenticateToken, JWT_SECRET, requireAdmin, requireSuperAdmin,
  setAuthCookies, setTcAdminAuthCookies, clearAuthCookies, clearTcAdminAuthCookies,
}) {
  const router = express.Router();

// ═══════════════════════════════════════════════════════════════════════════════
// REFRESH TOKEN
// ═══════════════════════════════════════════════════════════════════════════════

router.post('/api/auth/refresh', async (req, res) => {
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

router.post('/api/auth/logout', authenticateToken, async (req, res) => {
  try {
    // Fase 1.3 — aceita refresh token via cookie httpOnly OU body
    const refreshToken = (req.cookies && req.cookies.refreshToken) || req.body.refreshToken;
    if (refreshToken) {
      const tokenData = await verifyRefreshToken(refreshToken);
      if (tokenData) {
        await revokeSessionByRefreshTokenId(tokenData.id, 'Logout do usuário');
        const { revokeRefreshToken } = require('../utils/refresh-tokens');
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

router.get('/api/sessions', authenticateToken, async (req, res) => {
  try {
    const isSuperAdmin = req.user.role === 'superadmin';
    const sessions = await getAllSessions(!isSuperAdmin);
    return res.json({ success: true, sessions });
  } catch (error) {
    console.error('Erro ao listar sessões:', error);
    return res.status(500).json({ success: false, error: 'Erro interno do servidor' });
  }
});

router.delete('/api/sessions/:id', authenticateToken, async (req, res) => {
  try {
    await revokeSession(req.params.id, 'Revogada pelo usuário');
    return res.json({ success: true, message: 'Sessão encerrada com sucesso' });
  } catch (error) {
    console.error('Erro ao revogar sessão:', error);
    return res.status(500).json({ success: false, error: 'Erro interno do servidor' });
  }
});

router.delete('/api/sessions', authenticateToken, async (req, res) => {
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

router.get('/api/anomalies', authenticateToken, requireAdmin, async (req, res) => {
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

router.get('/api/security-alerts', authenticateToken, requireAdmin, async (req, res) => {
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

router.post('/api/auth/impersonate/:userId', authenticateToken, requireSuperAdmin, async (req, res) => {
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

router.post('/api/auth/impersonate/stop', authenticateToken, async (req, res) => {
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

  return router;
};
