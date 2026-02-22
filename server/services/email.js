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

module.exports = {
  enviarEmailRecuperacao
};
