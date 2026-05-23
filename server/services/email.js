const sgMail = require('@sendgrid/mail');

let sendGridConfigured = false;

function ensureSendGridConfigured() {
  if (sendGridConfigured) return;

  const apiKey = process.env.SENDGRID_API_KEY;
  if (!apiKey) {
    throw new Error('SENDGRID_API_KEY não configurada');
  }

  sgMail.setApiKey(apiKey);
  sendGridConfigured = true;
}

function buildResetEmailTemplate({ resetUrl, username, expiresMinutes }) {
  const safeUsername = username || 'usuário';
  const safeExpiresMinutes = Number(expiresMinutes) || 60;

  const subject = 'Recuperação de Senha - IMPGEO';
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <style>
        body {
          font-family: Arial, sans-serif;
          line-height: 1.6;
          color: #333;
          margin: 0;
          padding: 0;
          background-color: #f3f6fb;
        }
        .container {
          max-width: 600px;
          margin: 0 auto;
          padding: 20px;
        }
        .header {
          background-color: #1d4ed8;
          color: white;
          padding: 20px;
          text-align: center;
          border-radius: 5px 5px 0 0;
        }
        .content {
          background-color: #ffffff;
          padding: 30px;
          border-radius: 0 0 5px 5px;
          box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
        }
        .button {
          display: inline-block;
          padding: 12px 30px;
          background-color: #1d4ed8;
          color: white;
          text-decoration: none;
          border-radius: 5px;
          margin: 20px 0;
          font-weight: bold;
        }
        .footer {
          margin-top: 20px;
          font-size: 12px;
          color: #666;
          text-align: center;
        }
        .token-info {
          background-color: #f9fafb;
          padding: 15px;
          border-left: 4px solid #1d4ed8;
          margin: 20px 0;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1 style="margin:0;font-size:24px;">Recuperação de Senha</h1>
        </div>
        <div class="content">
          <p>Olá, <strong>${safeUsername}</strong>!</p>
          <p>Recebemos uma solicitação para redefinir a senha da sua conta no sistema IMPGEO.</p>
          <p>Clique no botão abaixo para criar uma nova senha:</p>
          <div style="text-align: center;">
            <a href="${resetUrl}" class="button">Redefinir Senha</a>
          </div>
          <div class="token-info">
            <p style="margin-top:0;"><strong>Ou copie e cole este link no seu navegador:</strong></p>
            <p style="word-break: break-all; color: #1d4ed8; font-size: 13px; margin-bottom:0;">${resetUrl}</p>
          </div>
          <p><strong>Este link é válido por ${safeExpiresMinutes} minutos.</strong></p>
          <p>Se você não solicitou esta recuperação de senha, pode ignorar este email com segurança.</p>
        </div>
        <div class="footer">
          <p>Este é um email automático, por favor não responda.</p>
          <p>&copy; ${new Date().getFullYear()} IMPGEO</p>
        </div>
      </div>
    </body>
    </html>
  `;

  const text = `
    Olá, ${safeUsername}!
    
    Recebemos uma solicitação para redefinir a senha da sua conta no sistema IMPGEO.
    
    Acesse o link abaixo para redefinir sua senha:
    ${resetUrl}
    
    Este link é válido por ${safeExpiresMinutes} minutos.
    
    Se você não solicitou esta recuperação de senha, pode ignorar este email com segurança.
  `;

  return { subject, html, text };
}

async function enviarEmailRecuperacao({
  toEmail,
  username,
  resetUrl,
  expiresMinutes = 60
}) {
  ensureSendGridConfigured();

  const fromEmail = process.env.SENDGRID_FROM_EMAIL;
  const fromName = process.env.SENDGRID_FROM_NAME || 'IMPGEO';
  const templateId = process.env.SENDGRID_TEMPLATE_ID_RESET;

  if (!fromEmail) {
    throw new Error('SENDGRID_FROM_EMAIL não configurado');
  }

  if (!toEmail) {
    throw new Error('Email de destino não informado');
  }

  if (!resetUrl) {
    throw new Error('URL de recuperação não informada');
  }

  const msg = {
    to: toEmail,
    from: { email: fromEmail, name: fromName }
  };

  if (templateId) {
    msg.templateId = templateId;
    msg.dynamicTemplateData = {
      username: username || 'usuário',
      resetUrl,
      expiresMinutes
    };
  } else {
    const { subject, html, text } = buildResetEmailTemplate({
      resetUrl,
      username,
      expiresMinutes
    });
    msg.subject = subject;
    msg.html = html;
    msg.text = text;
  }

  const [response] = await sgMail.send(msg);
  return {
    messageId: response.headers?.['x-message-id'] || null,
    statusCode: response.statusCode
  };
}

// ============================================================================
// Templates do TerraControl (paleta verde→azul, identidade própria do subsaas)
// ============================================================================

function buildTcResetEmailTemplate({ resetUrl, username, expiresMinutes }) {
  const subject = 'Recuperação de senha — TerraControl';
  const text = `Olá ${username || ''},\n\n` +
    `Você solicitou a recuperação de senha do seu acesso ao TerraControl.\n\n` +
    `Acesse o link abaixo (válido por ${expiresMinutes} minutos):\n${resetUrl}\n\n` +
    `Se você não solicitou, ignore este email.\n\n— Equipe TerraControl`;
  const html = `<!DOCTYPE html><html lang="pt-BR"><body style="margin:0;padding:0;background:#f3f4f6;font-family:Arial,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:24px 0;">
      <tr><td align="center">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 10px 25px rgba(0,0,0,0.06);">
          <tr><td style="padding:32px 32px 16px 32px;background:linear-gradient(to right,#48A326,#0041B1);color:#fff;text-align:center;">
            <h1 style="margin:0;font-size:24px;font-weight:700;">TerraControl</h1>
            <p style="margin:6px 0 0;opacity:0.9;font-size:14px;">Plataforma de gestão territorial</p>
          </td></tr>
          <tr><td style="padding:32px;">
            <p style="margin:0 0 16px 0;font-size:16px;color:#111827;">Olá <strong>${username || 'usuário'}</strong>,</p>
            <p style="margin:0 0 16px 0;font-size:15px;line-height:1.55;color:#374151;">
              Você solicitou a recuperação de senha do seu acesso ao TerraControl. Clique no botão abaixo para definir uma nova senha:
            </p>
            <p style="text-align:center;margin:28px 0;">
              <a href="${resetUrl}" style="display:inline-block;padding:14px 28px;background:linear-gradient(to right,#48A326,#0041B1);color:#fff;text-decoration:none;font-weight:700;border-radius:12px;">Definir nova senha</a>
            </p>
            <p style="margin:0 0 8px 0;font-size:13px;color:#6b7280;">
              Este link é válido por <strong>${expiresMinutes} minutos</strong>. Se expirar, solicite novamente a recuperação.
            </p>
            <p style="margin:24px 0 0 0;font-size:13px;color:#6b7280;">Se você não solicitou esta recuperação, ignore este email — sua senha continua segura.</p>
          </td></tr>
          <tr><td style="padding:20px 32px;background:#f9fafb;font-size:12px;color:#9ca3af;text-align:center;">
            — Equipe TerraControl
          </td></tr>
        </table>
      </td></tr>
    </table>
    </body></html>`;
  return { subject, html, text };
}

async function enviarEmailTcResetSenha({ toEmail, username, resetUrl, expiresMinutes = 60 }) {
  ensureSendGridConfigured();
  const fromEmail = process.env.SENDGRID_FROM_EMAIL;
  const fromName = process.env.SENDGRID_FROM_NAME_TC || 'TerraControl';
  if (!fromEmail) throw new Error('SENDGRID_FROM_EMAIL não configurado');
  if (!toEmail) throw new Error('Email de destino não informado');
  if (!resetUrl) throw new Error('URL de recuperação não informada');
  const { subject, html, text } = buildTcResetEmailTemplate({ resetUrl, username, expiresMinutes });
  const msg = { to: toEmail, from: { email: fromEmail, name: fromName }, subject, html, text };
  const [response] = await sgMail.send(msg);
  return { messageId: response.headers?.['x-message-id'] || null, statusCode: response.statusCode };
}

// ============================================================================
// F2.1 — Convite para tc_user (paleta verde→azul, mesma identidade do reset)
// ============================================================================

function buildTcConviteEmailTemplate({ acceptUrl, invitedByName, expiresDays }) {
  const subject = 'Convite para acessar o TerraControl';
  const text = `Você foi convidado(a) por ${invitedByName || 'um administrador'} para acessar o TerraControl.\n\n` +
    `Complete seu cadastro pelo link abaixo (válido por ${expiresDays} dias):\n${acceptUrl}\n\n` +
    `Se você não esperava este convite, ignore este email.\n\n— Equipe TerraControl`;
  const html = `<!DOCTYPE html><html lang="pt-BR"><body style="margin:0;padding:0;background:#f3f4f6;font-family:Arial,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:24px 0;">
      <tr><td align="center">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 10px 25px rgba(0,0,0,0.06);">
          <tr><td style="padding:32px 32px 16px 32px;background:linear-gradient(to right,#48A326,#0041B1);color:#fff;text-align:center;">
            <h1 style="margin:0;font-size:24px;font-weight:700;">TerraControl</h1>
            <p style="margin:6px 0 0;opacity:0.9;font-size:14px;">Você foi convidado!</p>
          </td></tr>
          <tr><td style="padding:32px;">
            <p style="margin:0 0 16px 0;font-size:16px;color:#111827;">Olá!</p>
            <p style="margin:0 0 16px 0;font-size:15px;line-height:1.55;color:#374151;">
              <strong>${invitedByName || 'Um administrador'}</strong> convidou você a acessar o TerraControl —
              a plataforma de gestão territorial onde você poderá consultar seus imóveis rurais cadastrados,
              baixar matrículas, ITRs, CCIRs e o mapa do CAR.
            </p>
            <p style="margin:0 0 16px 0;font-size:15px;line-height:1.55;color:#374151;">
              Clique no botão abaixo para criar seu acesso (vai escolher um usuário e senha):
            </p>
            <p style="text-align:center;margin:28px 0;">
              <a href="${acceptUrl}" style="display:inline-block;padding:14px 28px;background:linear-gradient(to right,#48A326,#0041B1);color:#fff;text-decoration:none;font-weight:700;border-radius:12px;">Aceitar convite</a>
            </p>
            <p style="margin:0 0 8px 0;font-size:13px;color:#6b7280;">
              Este convite expira em <strong>${expiresDays} dias</strong>. Após expirar, peça um novo ao administrador.
            </p>
            <p style="margin:24px 0 0 0;font-size:13px;color:#6b7280;">Se você não esperava este convite, pode ignorar este email com segurança — nenhum acesso é criado até você completar o cadastro.</p>
          </td></tr>
          <tr><td style="padding:20px 32px;background:#f9fafb;font-size:12px;color:#9ca3af;text-align:center;">
            — Equipe TerraControl
          </td></tr>
        </table>
      </td></tr>
    </table>
    </body></html>`;
  return { subject, html, text };
}

async function enviarEmailTcConvite({ toEmail, acceptUrl, invitedByName, expiresDays = 7 }) {
  ensureSendGridConfigured();
  const fromEmail = process.env.SENDGRID_FROM_EMAIL;
  const fromName = process.env.SENDGRID_FROM_NAME_TC || 'TerraControl';
  if (!fromEmail) throw new Error('SENDGRID_FROM_EMAIL não configurado');
  if (!toEmail) throw new Error('Email de destino não informado');
  if (!acceptUrl) throw new Error('URL de aceite do convite não informada');
  const { subject, html, text } = buildTcConviteEmailTemplate({ acceptUrl, invitedByName, expiresDays });
  const msg = { to: toEmail, from: { email: fromEmail, name: fromName }, subject, html, text };
  const [response] = await sgMail.send(msg);
  return { messageId: response.headers?.['x-message-id'] || null, statusCode: response.statusCode };
}

// ============================================================================
// Notificações de eventos sobre registros TerraControl (aprovação / edição)
// Disparados pelo server.js após uma ação do admin sobre um registro que tem
// `created_by_tc_user_id`. Usam a mesma paleta verde→azul do reset/convite.
// ============================================================================

function buildTcRecordCardBlock({ imovel, municipio, codImovel }) {
  const lines = [
    imovel ? `<strong>${imovel}</strong>` : null,
    municipio ? `<span style="color:#6b7280;">${municipio}</span>` : null,
    codImovel ? `<span style="font-family:monospace;color:#9ca3af;">#${codImovel}</span>` : null,
  ].filter(Boolean).join(' · ');
  return `<div style="background:#f9fafb;border-left:4px solid #48A326;padding:14px 16px;border-radius:6px;margin:18px 0;font-size:15px;color:#111827;">${lines || 'Registro TerraControl'}</div>`;
}

function buildTcRecordCardText({ imovel, municipio, codImovel }) {
  const parts = [imovel, municipio, codImovel ? `#${codImovel}` : null].filter(Boolean);
  return parts.length ? parts.join(' · ') : 'Registro TerraControl';
}

function buildTcRegistroAprovadoTemplate({ username, imovel, municipio, codImovel, loginUrl }) {
  const subject = 'Seu registro foi aprovado — TerraControl';
  const card = buildTcRecordCardBlock({ imovel, municipio, codImovel });
  const cardText = buildTcRecordCardText({ imovel, municipio, codImovel });
  const text = `Olá ${username || ''},\n\n` +
    `Seu registro foi aprovado e já está visível no TerraControl.\n\n` +
    `Registro: ${cardText}\n\n` +
    (loginUrl ? `Acesse: ${loginUrl}\n\n` : '') +
    `— Equipe TerraControl`;
  const html = `<!DOCTYPE html><html lang="pt-BR"><body style="margin:0;padding:0;background:#f3f4f6;font-family:Arial,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:24px 0;">
      <tr><td align="center">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 10px 25px rgba(0,0,0,0.06);">
          <tr><td style="padding:32px 32px 16px 32px;background:linear-gradient(to right,#48A326,#0041B1);color:#fff;text-align:center;">
            <h1 style="margin:0;font-size:24px;font-weight:700;">TerraControl</h1>
            <p style="margin:6px 0 0;opacity:0.9;font-size:14px;">Seu registro foi aprovado</p>
          </td></tr>
          <tr><td style="padding:32px;">
            <p style="margin:0 0 16px 0;font-size:16px;color:#111827;">Olá <strong>${username || 'usuário'}</strong>,</p>
            <p style="margin:0 0 8px 0;font-size:15px;line-height:1.55;color:#374151;">
              Seu registro foi <strong>aprovado</strong> e já está disponível no TerraControl.
            </p>
            ${card}
            ${loginUrl ? `<p style="text-align:center;margin:24px 0;">
              <a href="${loginUrl}" style="display:inline-block;padding:14px 28px;background:linear-gradient(to right,#48A326,#0041B1);color:#fff;text-decoration:none;font-weight:700;border-radius:12px;">Acessar TerraControl</a>
            </p>` : ''}
            <p style="margin:18px 0 0 0;font-size:13px;color:#6b7280;">Você também recebeu uma notificação no sininho do TerraControl.</p>
          </td></tr>
          <tr><td style="padding:20px 32px;background:#f9fafb;font-size:12px;color:#9ca3af;text-align:center;">
            — Equipe TerraControl
          </td></tr>
        </table>
      </td></tr>
    </table>
    </body></html>`;
  return { subject, html, text };
}

async function enviarEmailTcRegistroAprovado({ toEmail, username, imovel, municipio, codImovel, loginUrl }) {
  ensureSendGridConfigured();
  const fromEmail = process.env.SENDGRID_FROM_EMAIL;
  const fromName = process.env.SENDGRID_FROM_NAME_TC || 'TerraControl';
  if (!fromEmail) throw new Error('SENDGRID_FROM_EMAIL não configurado');
  if (!toEmail) throw new Error('Email de destino não informado');
  const { subject, html, text } = buildTcRegistroAprovadoTemplate({ username, imovel, municipio, codImovel, loginUrl });
  const msg = { to: toEmail, from: { email: fromEmail, name: fromName }, subject, html, text };
  const [response] = await sgMail.send(msg);
  return { messageId: response.headers?.['x-message-id'] || null, statusCode: response.statusCode };
}

function buildTcRegistroEditadoTemplate({ username, imovel, municipio, codImovel, editedByName, loginUrl }) {
  const subject = 'Seu registro foi atualizado — TerraControl';
  const card = buildTcRecordCardBlock({ imovel, municipio, codImovel });
  const cardText = buildTcRecordCardText({ imovel, municipio, codImovel });
  const ator = editedByName || 'um administrador';
  const text = `Olá ${username || ''},\n\n` +
    `${ator} atualizou um dos seus registros no TerraControl.\n\n` +
    `Registro: ${cardText}\n\n` +
    (loginUrl ? `Acesse: ${loginUrl}\n\n` : '') +
    `— Equipe TerraControl`;
  const html = `<!DOCTYPE html><html lang="pt-BR"><body style="margin:0;padding:0;background:#f3f4f6;font-family:Arial,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:24px 0;">
      <tr><td align="center">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 10px 25px rgba(0,0,0,0.06);">
          <tr><td style="padding:32px 32px 16px 32px;background:linear-gradient(to right,#48A326,#0041B1);color:#fff;text-align:center;">
            <h1 style="margin:0;font-size:24px;font-weight:700;">TerraControl</h1>
            <p style="margin:6px 0 0;opacity:0.9;font-size:14px;">Seu registro foi atualizado</p>
          </td></tr>
          <tr><td style="padding:32px;">
            <p style="margin:0 0 16px 0;font-size:16px;color:#111827;">Olá <strong>${username || 'usuário'}</strong>,</p>
            <p style="margin:0 0 8px 0;font-size:15px;line-height:1.55;color:#374151;">
              <strong>${ator}</strong> atualizou um dos seus registros no TerraControl.
            </p>
            ${card}
            ${loginUrl ? `<p style="text-align:center;margin:24px 0;">
              <a href="${loginUrl}" style="display:inline-block;padding:14px 28px;background:linear-gradient(to right,#48A326,#0041B1);color:#fff;text-decoration:none;font-weight:700;border-radius:12px;">Ver no TerraControl</a>
            </p>` : ''}
            <p style="margin:18px 0 0 0;font-size:13px;color:#6b7280;">Você também recebeu uma notificação no sininho do TerraControl.</p>
          </td></tr>
          <tr><td style="padding:20px 32px;background:#f9fafb;font-size:12px;color:#9ca3af;text-align:center;">
            — Equipe TerraControl
          </td></tr>
        </table>
      </td></tr>
    </table>
    </body></html>`;
  return { subject, html, text };
}

async function enviarEmailTcRegistroEditado({ toEmail, username, imovel, municipio, codImovel, editedByName, loginUrl }) {
  ensureSendGridConfigured();
  const fromEmail = process.env.SENDGRID_FROM_EMAIL;
  const fromName = process.env.SENDGRID_FROM_NAME_TC || 'TerraControl';
  if (!fromEmail) throw new Error('SENDGRID_FROM_EMAIL não configurado');
  if (!toEmail) throw new Error('Email de destino não informado');
  const { subject, html, text } = buildTcRegistroEditadoTemplate({ username, imovel, municipio, codImovel, editedByName, loginUrl });
  const msg = { to: toEmail, from: { email: fromEmail, name: fromName }, subject, html, text };
  const [response] = await sgMail.send(msg);
  return { messageId: response.headers?.['x-message-id'] || null, statusCode: response.statusCode };
}

// ============================================================================
// Notif pro impgeo user (opt-in) — tc_user cadastrou novo registro
// ============================================================================

function buildImpgeoTcRecordCriadoTemplate({ recipientName, tcUserName, imovel, municipio, codImovel, adminUrl }) {
  const subject = `Novo registro no TerraControl — ${imovel || 'sem nome'}`;
  const card = buildTcRecordCardBlock({ imovel, municipio, codImovel });
  const cardText = buildTcRecordCardText({ imovel, municipio, codImovel });
  const text = `Olá ${recipientName || ''},\n\n` +
    `${tcUserName} cadastrou um novo registro no TerraControl — aguardando aprovação.\n\n` +
    `Registro: ${cardText}\n\n` +
    (adminUrl ? `Acesse para revisar: ${adminUrl}\n\n` : '') +
    `Você está recebendo esse email porque ativou as notificações por email do TerraControl. Pode desligar a qualquer momento em "Meu perfil" no IMPGEO.\n\n` +
    `— Equipe IMPGEO`;
  const html = `<!DOCTYPE html><html lang="pt-BR"><body style="margin:0;padding:0;background:#f3f4f6;font-family:Arial,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:24px 0;">
      <tr><td align="center">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 10px 25px rgba(0,0,0,0.06);">
          <tr><td style="padding:32px 32px 16px 32px;background:linear-gradient(to right,#48A326,#0041B1);color:#fff;text-align:center;">
            <h1 style="margin:0;font-size:24px;font-weight:700;">TerraControl</h1>
            <p style="margin:6px 0 0;opacity:0.9;font-size:14px;">Novo registro aguardando aprovação</p>
          </td></tr>
          <tr><td style="padding:32px;">
            <p style="margin:0 0 16px 0;font-size:16px;color:#111827;">Olá <strong>${recipientName || 'usuário'}</strong>,</p>
            <p style="margin:0 0 8px 0;font-size:15px;line-height:1.55;color:#374151;">
              <strong>${tcUserName}</strong> cadastrou um novo registro no TerraControl — aguardando sua revisão.
            </p>
            ${card}
            ${adminUrl ? `<p style="text-align:center;margin:24px 0;">
              <a href="${adminUrl}" style="display:inline-block;padding:14px 28px;background:linear-gradient(to right,#48A326,#0041B1);color:#fff;text-decoration:none;font-weight:700;border-radius:12px;">Abrir TerraControl</a>
            </p>` : ''}
            <p style="margin:18px 0 0 0;font-size:12px;color:#9ca3af;line-height:1.5;">
              Você está recebendo este email porque ativou notificações por email do TerraControl. Pode desligar em "Meu perfil" no IMPGEO.
            </p>
          </td></tr>
          <tr><td style="padding:20px 32px;background:#f9fafb;font-size:12px;color:#9ca3af;text-align:center;">
            — Equipe IMPGEO
          </td></tr>
        </table>
      </td></tr>
    </table>
    </body></html>`;
  return { subject, html, text };
}

async function enviarEmailImpgeoTcRecordCriado({ toEmail, recipientName, tcUserName, imovel, municipio, codImovel, adminUrl }) {
  ensureSendGridConfigured();
  const fromEmail = process.env.SENDGRID_FROM_EMAIL;
  const fromName = process.env.SENDGRID_FROM_NAME_TC || 'TerraControl';
  if (!fromEmail) throw new Error('SENDGRID_FROM_EMAIL não configurado');
  if (!toEmail) throw new Error('Email de destino não informado');
  const { subject, html, text } = buildImpgeoTcRecordCriadoTemplate({ recipientName, tcUserName, imovel, municipio, codImovel, adminUrl });
  const msg = { to: toEmail, from: { email: fromEmail, name: fromName }, subject, html, text };
  const [response] = await sgMail.send(msg);
  return { messageId: response.headers?.['x-message-id'] || null, statusCode: response.statusCode };
}

// ============================================================================
// Orçamentos (migration 040) — 5 templates
// ============================================================================
// Formatação BRL pra usar tanto em texto quanto HTML.
function formatBRL(cents) {
  const value = (Number(cents) || 0) / 100;
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function buildOrcamentoCardBlock({ imovel, municipio, codImovel, totalCents, revisionNumber }) {
  const lines = [
    imovel ? `<strong>${imovel}</strong>` : null,
    municipio ? `<span style="color:#6b7280;">${municipio}</span>` : null,
    codImovel ? `<span style="font-family:monospace;color:#9ca3af;">#${codImovel}</span>` : null,
  ].filter(Boolean).join(' · ');
  const total = totalCents != null
    ? `<div style="margin-top:10px;font-size:18px;color:#48A326;font-weight:700;">Total: ${formatBRL(totalCents)}</div>`
    : '';
  const rev = revisionNumber && revisionNumber > 1
    ? `<div style="margin-top:6px;font-size:12px;color:#6b7280;">Revisão v${revisionNumber}</div>`
    : '';
  return `<div style="background:#f9fafb;border-left:4px solid #48A326;padding:14px 16px;border-radius:6px;margin:18px 0;font-size:15px;color:#111827;">${lines || 'Orçamento TerraControl'}${total}${rev}</div>`;
}

function buildOrcamentoCardText({ imovel, municipio, codImovel, totalCents, revisionNumber }) {
  const head = [imovel, municipio, codImovel ? `#${codImovel}` : null].filter(Boolean).join(' · ');
  const lines = [head || 'Orçamento TerraControl'];
  if (totalCents != null) lines.push(`Total: ${formatBRL(totalCents)}`);
  if (revisionNumber && revisionNumber > 1) lines.push(`Revisão v${revisionNumber}`);
  return lines.join('\n');
}

function buildBaseEmailShell({ headerTitle, headerSubtitle, bodyHtml, ctaLabel, ctaUrl, footerNote, palette = 'green' }) {
  // palette 'green' = gradiente verde→azul TC (default); 'orange' = aviso (revisão)
  const grad = palette === 'orange'
    ? 'background:linear-gradient(to right,#F59E0B,#0041B1);'
    : 'background:linear-gradient(to right,#48A326,#0041B1);';
  return `<!DOCTYPE html><html lang="pt-BR"><body style="margin:0;padding:0;background:#f3f4f6;font-family:Arial,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:24px 0;">
      <tr><td align="center">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 10px 25px rgba(0,0,0,0.06);">
          <tr><td style="padding:32px 32px 16px 32px;${grad}color:#fff;text-align:center;">
            <h1 style="margin:0;font-size:24px;font-weight:700;">TerraControl</h1>
            <p style="margin:6px 0 0;opacity:0.9;font-size:14px;">${headerSubtitle || headerTitle}</p>
          </td></tr>
          <tr><td style="padding:32px;">
            ${bodyHtml}
            ${ctaUrl ? `<p style="text-align:center;margin:24px 0;">
              <a href="${ctaUrl}" style="display:inline-block;padding:14px 28px;${grad}color:#fff;text-decoration:none;font-weight:700;border-radius:12px;">${ctaLabel || 'Abrir TerraControl'}</a>
            </p>` : ''}
            ${footerNote ? `<p style="margin:18px 0 0 0;font-size:13px;color:#6b7280;">${footerNote}</p>` : ''}
          </td></tr>
          <tr><td style="padding:20px 32px;background:#f9fafb;font-size:12px;color:#9ca3af;text-align:center;">
            — Equipe TerraControl
          </td></tr>
        </table>
      </td></tr>
    </table>
    </body></html>`;
}

// ─── tc_user: orçamento enviado (v1) ────────────────────────────────────────

function buildTcOrcamentoEnviadoTemplate({ username, imovel, municipio, codImovel, totalCents, viewUrl }) {
  const subject = 'Você recebeu um orçamento — TerraControl';
  const card = buildOrcamentoCardBlock({ imovel, municipio, codImovel, totalCents });
  const cardText = buildOrcamentoCardText({ imovel, municipio, codImovel, totalCents });
  const text = `Olá ${username || ''},\n\n` +
    `Você recebeu um orçamento para o seu imóvel no TerraControl. O PDF do orçamento segue em anexo.\n\n` +
    `${cardText}\n\n` +
    (viewUrl ? `Acesse para revisar e aprovar: ${viewUrl}\n\n` : '') +
    `Após aprovado, você pode pagar via PIX direto na plataforma.\n\n— Equipe TerraControl`;
  const bodyHtml = `
    <p style="margin:0 0 16px 0;font-size:16px;color:#111827;">Olá <strong>${username || 'usuário'}</strong>,</p>
    <p style="margin:0 0 8px 0;font-size:15px;line-height:1.55;color:#374151;">
      Você recebeu um orçamento para o seu imóvel no TerraControl. <strong>O PDF do orçamento segue em anexo.</strong>
    </p>
    ${card}
    <p style="margin:0 0 8px 0;font-size:14px;color:#374151;">
      Após sua aprovação, o pagamento pode ser feito via PIX direto na plataforma.
    </p>`;
  const html = buildBaseEmailShell({
    headerSubtitle: 'Novo orçamento disponível',
    bodyHtml,
    ctaLabel: 'Revisar orçamento',
    ctaUrl: viewUrl,
    footerNote: 'Você também recebeu uma notificação no sininho do TerraControl.',
  });
  return { subject, html, text };
}

async function enviarEmailTcOrcamentoEnviado({ toEmail, username, imovel, municipio, codImovel, totalCents, viewUrl, pdfBuffer, pdfFilename }) {
  ensureSendGridConfigured();
  const fromEmail = process.env.SENDGRID_FROM_EMAIL;
  const fromName = process.env.SENDGRID_FROM_NAME_TC || 'TerraControl';
  if (!fromEmail) throw new Error('SENDGRID_FROM_EMAIL não configurado');
  if (!toEmail) throw new Error('Email de destino não informado');
  const { subject, html, text } = buildTcOrcamentoEnviadoTemplate({ username, imovel, municipio, codImovel, totalCents, viewUrl });
  const msg = { to: toEmail, from: { email: fromEmail, name: fromName }, subject, html, text };
  if (pdfBuffer) {
    msg.attachments = [{
      content: Buffer.isBuffer(pdfBuffer) ? pdfBuffer.toString('base64') : pdfBuffer,
      filename: pdfFilename || 'orcamento.pdf',
      type: 'application/pdf',
      disposition: 'attachment',
    }];
  }
  const [response] = await sgMail.send(msg);
  return { messageId: response.headers?.['x-message-id'] || null, statusCode: response.statusCode };
}

// ─── tc_user: orçamento revisado (v2+) ──────────────────────────────────────

function buildTcOrcamentoRevisadoTemplate({ username, imovel, municipio, codImovel, totalCents, revisionNumber, viewUrl }) {
  const subject = `Orçamento revisado (v${revisionNumber || 2}) — TerraControl`;
  const card = buildOrcamentoCardBlock({ imovel, municipio, codImovel, totalCents, revisionNumber });
  const cardText = buildOrcamentoCardText({ imovel, municipio, codImovel, totalCents, revisionNumber });
  const text = `Olá ${username || ''},\n\n` +
    `Seu orçamento foi revisado conforme sua solicitação. A nova versão (v${revisionNumber || 2}) segue em anexo.\n\n` +
    `${cardText}\n\n` +
    (viewUrl ? `Acesse para revisar: ${viewUrl}\n\n` : '') +
    `— Equipe TerraControl`;
  const bodyHtml = `
    <p style="margin:0 0 16px 0;font-size:16px;color:#111827;">Olá <strong>${username || 'usuário'}</strong>,</p>
    <p style="margin:0 0 8px 0;font-size:15px;line-height:1.55;color:#374151;">
      Seu orçamento foi <strong>revisado</strong> conforme sua solicitação. A nova versão (v${revisionNumber || 2}) segue em anexo.
    </p>
    ${card}`;
  const html = buildBaseEmailShell({
    headerSubtitle: `Orçamento revisado (v${revisionNumber || 2})`,
    bodyHtml,
    ctaLabel: 'Revisar orçamento',
    ctaUrl: viewUrl,
  });
  return { subject, html, text };
}

async function enviarEmailTcOrcamentoRevisado({ toEmail, username, imovel, municipio, codImovel, totalCents, revisionNumber, viewUrl, pdfBuffer, pdfFilename }) {
  ensureSendGridConfigured();
  const fromEmail = process.env.SENDGRID_FROM_EMAIL;
  const fromName = process.env.SENDGRID_FROM_NAME_TC || 'TerraControl';
  if (!fromEmail) throw new Error('SENDGRID_FROM_EMAIL não configurado');
  if (!toEmail) throw new Error('Email de destino não informado');
  const { subject, html, text } = buildTcOrcamentoRevisadoTemplate({ username, imovel, municipio, codImovel, totalCents, revisionNumber, viewUrl });
  const msg = { to: toEmail, from: { email: fromEmail, name: fromName }, subject, html, text };
  if (pdfBuffer) {
    msg.attachments = [{
      content: Buffer.isBuffer(pdfBuffer) ? pdfBuffer.toString('base64') : pdfBuffer,
      filename: pdfFilename || `orcamento-v${revisionNumber || 2}.pdf`,
      type: 'application/pdf',
      disposition: 'attachment',
    }];
  }
  const [response] = await sgMail.send(msg);
  return { messageId: response.headers?.['x-message-id'] || null, statusCode: response.statusCode };
}

// ─── tc_user: pagamento confirmado ──────────────────────────────────────────

function buildTcPagamentoConfirmadoTemplate({ username, imovel, municipio, codImovel, totalCents, paidAt, loginUrl }) {
  const subject = 'Pagamento confirmado — TerraControl';
  const card = buildOrcamentoCardBlock({ imovel, municipio, codImovel, totalCents });
  const cardText = buildOrcamentoCardText({ imovel, municipio, codImovel, totalCents });
  const dataPag = paidAt ? new Date(paidAt).toLocaleString('pt-BR') : '';
  const text = `Olá ${username || ''},\n\n` +
    `Seu pagamento foi confirmado e seu imóvel já está aprovado no TerraControl.\n\n` +
    `${cardText}\n` +
    (dataPag ? `Pago em: ${dataPag}\n` : '') + '\n' +
    (loginUrl ? `Acesse: ${loginUrl}\n\n` : '') +
    `— Equipe TerraControl`;
  const bodyHtml = `
    <p style="margin:0 0 16px 0;font-size:16px;color:#111827;">Olá <strong>${username || 'usuário'}</strong>,</p>
    <p style="margin:0 0 8px 0;font-size:15px;line-height:1.55;color:#374151;">
      <strong>Pagamento confirmado!</strong> Seu imóvel já está aprovado e disponível no TerraControl.
    </p>
    ${card}
    ${dataPag ? `<p style="margin:8px 0 0 0;font-size:13px;color:#6b7280;">Pago em ${dataPag}</p>` : ''}`;
  const html = buildBaseEmailShell({
    headerSubtitle: 'Pagamento confirmado',
    bodyHtml,
    ctaLabel: 'Acessar TerraControl',
    ctaUrl: loginUrl,
    footerNote: 'Obrigado por usar o TerraControl.',
  });
  return { subject, html, text };
}

async function enviarEmailTcPagamentoConfirmado({ toEmail, username, imovel, municipio, codImovel, totalCents, paidAt, loginUrl }) {
  ensureSendGridConfigured();
  const fromEmail = process.env.SENDGRID_FROM_EMAIL;
  const fromName = process.env.SENDGRID_FROM_NAME_TC || 'TerraControl';
  if (!fromEmail) throw new Error('SENDGRID_FROM_EMAIL não configurado');
  if (!toEmail) throw new Error('Email de destino não informado');
  const { subject, html, text } = buildTcPagamentoConfirmadoTemplate({ username, imovel, municipio, codImovel, totalCents, paidAt, loginUrl });
  const msg = { to: toEmail, from: { email: fromEmail, name: fromName }, subject, html, text };
  const [response] = await sgMail.send(msg);
  return { messageId: response.headers?.['x-message-id'] || null, statusCode: response.statusCode };
}

// ─── impgeo admin: revisão solicitada pelo tc_user ──────────────────────────

function buildImpgeoRevisaoSolicitadaTemplate({ recipientName, tcUserName, imovel, municipio, codImovel, totalCents, revisionNumber, comment, source, adminUrl }) {
  const subject = `Revisão de orçamento solicitada — ${imovel || 'imóvel TC'}`;
  const card = buildOrcamentoCardBlock({ imovel, municipio, codImovel, totalCents, revisionNumber });
  const cardText = buildOrcamentoCardText({ imovel, municipio, codImovel, totalCents, revisionNumber });
  const sourceLabel = source === 'auto_edit'
    ? 'O imóvel foi editado pelo tc_user (revisão automática).'
    : 'O tc_user solicitou alterações no orçamento.';
  const text = `Olá ${recipientName || ''},\n\n` +
    `${sourceLabel}\n` +
    `Solicitante: ${tcUserName || 'tc_user'}\n\n` +
    `${cardText}\n\n` +
    (comment ? `Comentário:\n${comment}\n\n` : '') +
    (adminUrl ? `Abrir no painel admin: ${adminUrl}\n\n` : '') +
    `Você está recebendo este email porque ativou notificações de orçamentos. Pode desligar em "Meu perfil" no IMPGEO.\n\n` +
    `— Equipe IMPGEO`;
  const bodyHtml = `
    <p style="margin:0 0 16px 0;font-size:16px;color:#111827;">Olá <strong>${recipientName || 'usuário'}</strong>,</p>
    <p style="margin:0 0 8px 0;font-size:15px;line-height:1.55;color:#374151;">
      ${sourceLabel} Solicitante: <strong>${tcUserName || 'tc_user'}</strong>.
    </p>
    ${card}
    ${comment ? `<div style="background:#fff7ed;border-left:4px solid #F59E0B;padding:12px 14px;border-radius:6px;margin:14px 0;font-size:14px;color:#374151;white-space:pre-wrap;">${escapeHtml(comment)}</div>` : ''}
    <p style="margin:18px 0 0 0;font-size:12px;color:#9ca3af;line-height:1.5;">
      Você está recebendo este email porque ativou notificações de orçamentos. Pode desligar em "Meu perfil" no IMPGEO.
    </p>`;
  const html = buildBaseEmailShell({
    headerSubtitle: 'Revisão de orçamento solicitada',
    bodyHtml,
    ctaLabel: 'Abrir no painel',
    ctaUrl: adminUrl,
    palette: 'orange',
  });
  return { subject, html, text };
}

async function enviarEmailImpgeoRevisaoSolicitada({ toEmail, recipientName, tcUserName, imovel, municipio, codImovel, totalCents, revisionNumber, comment, source, adminUrl }) {
  ensureSendGridConfigured();
  const fromEmail = process.env.SENDGRID_FROM_EMAIL;
  const fromName = process.env.SENDGRID_FROM_NAME_TC || 'TerraControl';
  if (!fromEmail) throw new Error('SENDGRID_FROM_EMAIL não configurado');
  if (!toEmail) throw new Error('Email de destino não informado');
  const { subject, html, text } = buildImpgeoRevisaoSolicitadaTemplate({ recipientName, tcUserName, imovel, municipio, codImovel, totalCents, revisionNumber, comment, source, adminUrl });
  const msg = { to: toEmail, from: { email: fromEmail, name: fromName }, subject, html, text };
  const [response] = await sgMail.send(msg);
  return { messageId: response.headers?.['x-message-id'] || null, statusCode: response.statusCode };
}

// ─── impgeo admin: pagamento recebido ───────────────────────────────────────

function buildImpgeoPagamentoRecebidoTemplate({ recipientName, tcUserName, imovel, municipio, codImovel, totalCents, paidAt, adminUrl }) {
  const subject = `Pagamento recebido — ${imovel || 'imóvel TC'}`;
  const card = buildOrcamentoCardBlock({ imovel, municipio, codImovel, totalCents });
  const cardText = buildOrcamentoCardText({ imovel, municipio, codImovel, totalCents });
  const dataPag = paidAt ? new Date(paidAt).toLocaleString('pt-BR') : '';
  const text = `Olá ${recipientName || ''},\n\n` +
    `Um pagamento foi recebido no TerraControl e o imóvel foi aprovado automaticamente.\n\n` +
    `Cliente: ${tcUserName || 'tc_user'}\n` +
    `${cardText}\n` +
    (dataPag ? `Pago em: ${dataPag}\n` : '') + '\n' +
    (adminUrl ? `Ver no painel: ${adminUrl}\n\n` : '') +
    `Você está recebendo este email porque ativou notificações de orçamentos. Pode desligar em "Meu perfil" no IMPGEO.\n\n` +
    `— Equipe IMPGEO`;
  const bodyHtml = `
    <p style="margin:0 0 16px 0;font-size:16px;color:#111827;">Olá <strong>${recipientName || 'usuário'}</strong>,</p>
    <p style="margin:0 0 8px 0;font-size:15px;line-height:1.55;color:#374151;">
      Um pagamento foi <strong>recebido</strong> e o imóvel foi aprovado automaticamente.
    </p>
    <p style="margin:8px 0;font-size:14px;color:#374151;">Cliente: <strong>${tcUserName || 'tc_user'}</strong></p>
    ${card}
    ${dataPag ? `<p style="margin:8px 0 0 0;font-size:13px;color:#6b7280;">Pago em ${dataPag}</p>` : ''}
    <p style="margin:18px 0 0 0;font-size:12px;color:#9ca3af;line-height:1.5;">
      Você está recebendo este email porque ativou notificações de orçamentos. Pode desligar em "Meu perfil" no IMPGEO.
    </p>`;
  const html = buildBaseEmailShell({
    headerSubtitle: 'Pagamento recebido',
    bodyHtml,
    ctaLabel: 'Abrir no painel',
    ctaUrl: adminUrl,
  });
  return { subject, html, text };
}

async function enviarEmailImpgeoPagamentoRecebido({ toEmail, recipientName, tcUserName, imovel, municipio, codImovel, totalCents, paidAt, adminUrl }) {
  ensureSendGridConfigured();
  const fromEmail = process.env.SENDGRID_FROM_EMAIL;
  const fromName = process.env.SENDGRID_FROM_NAME_TC || 'TerraControl';
  if (!fromEmail) throw new Error('SENDGRID_FROM_EMAIL não configurado');
  if (!toEmail) throw new Error('Email de destino não informado');
  const { subject, html, text } = buildImpgeoPagamentoRecebidoTemplate({ recipientName, tcUserName, imovel, municipio, codImovel, totalCents, paidAt, adminUrl });
  const msg = { to: toEmail, from: { email: fromEmail, name: fromName }, subject, html, text };
  const [response] = await sgMail.send(msg);
  return { messageId: response.headers?.['x-message-id'] || null, statusCode: response.statusCode };
}

// Escape básico pra prevenir HTML injection em campos livres do usuário (comment)
function escapeHtml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

module.exports = {
  enviarEmailRecuperacao,
  enviarEmailTcResetSenha,
  enviarEmailTcConvite,
  enviarEmailTcRegistroAprovado,
  enviarEmailTcRegistroEditado,
  enviarEmailImpgeoTcRecordCriado,
  // Orçamentos (G4)
  enviarEmailTcOrcamentoEnviado,
  enviarEmailTcOrcamentoRevisado,
  enviarEmailTcPagamentoConfirmado,
  enviarEmailImpgeoRevisaoSolicitada,
  enviarEmailImpgeoPagamentoRecebido,
};
