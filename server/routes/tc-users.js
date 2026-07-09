// ═══════════════════════════════════════════════════════════════════════════
// server/routes/tc-users.js
// Admin do impgeo gerenciando tc_users (migration 025/026): CRUD, reset de senha,
// gestão de acesso, desativação e convite; + fluxo de convite tc-auth (validar
// token, aceitar, reenviar). Extraídas de server.js (#3) — comportamento idêntico
// (rotas verbatim, paths completos preservados).
// ═══════════════════════════════════════════════════════════════════════════
'use strict';

const express = require('express');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

module.exports = function createTcUsersRoutes({
  db, authenticateToken, requireTcUsersManagement, passwordRecoveryLimiter,
}) {
  const router = express.Router();

// =============================================================================
// Admin do impgeo gerenciando tc_users (migration 025/026)
// =============================================================================

// GET /api/admin/tc-users — lista todos
router.get('/api/admin/tc-users', authenticateToken, requireTcUsersManagement, async (req, res) => {
  try {
    const list = await db.listTcUsersForAdmin();
    res.json({ success: true, data: list });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message || 'Erro ao listar' });
  }
});

// POST /api/admin/tc-users — cria novo tc_user com senha temporária + acesso a registros
router.post('/api/admin/tc-users', authenticateToken, requireTcUsersManagement, async (req, res) => {
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
router.put('/api/admin/tc-users/:id', authenticateToken, requireTcUsersManagement, async (req, res) => {
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
router.put('/api/admin/tc-users/:id/password-reset', authenticateToken, requireTcUsersManagement, async (req, res) => {
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
router.get('/api/admin/tc-users/:id/access', authenticateToken, requireTcUsersManagement, async (req, res) => {
  try {
    const ids = await db.getTcUserRecordIds(req.params.id);
    res.json({ success: true, data: ids });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message || 'Erro ao buscar acesso' });
  }
});

// PUT /api/admin/tc-users/:id/access — define quais registros o tc_user vê
router.put('/api/admin/tc-users/:id/access', authenticateToken, requireTcUsersManagement, async (req, res) => {
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
router.put('/api/admin/tc-users/:id/deactivate', authenticateToken, requireTcUsersManagement, async (req, res) => {
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
router.post('/api/admin/tc-users/invite', authenticateToken, requireTcUsersManagement, async (req, res) => {
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
      const { enviarEmailTcConvite } = require('../services/email');
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
router.get('/api/tc-auth/invite/:token', async (req, res) => {
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
router.post('/api/tc-auth/accept-invite', async (req, res) => {
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
router.post('/api/tc-auth/resend-invite', passwordRecoveryLimiter, async (req, res) => {
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
        const { enviarEmailTcConvite } = require('../services/email');
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

  return router;
};
