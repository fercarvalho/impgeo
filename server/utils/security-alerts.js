/**
 * Sistema de Alertas de Segurança - SendGrid Email
 * Envia notificações automáticas para eventos críticos de segurança
 */

const sgMail = require('@sendgrid/mail');
const { Pool } = require('pg');

sgMail.setApiKey(process.env.SENDGRID_API_KEY);

const ALERT_EMAIL_FROM = process.env.ALERT_EMAIL_FROM || 'security@impgeo.com';
const ALERT_EMAIL_TO = process.env.ALERT_EMAIL_TO || 'admin@impgeo.com';

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  user: process.env.DB_USER || 'impgeo_user',
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME || 'impgeo_db',
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
});

const SEVERITY = {
  INFO: 'INFO',
  LOW: 'LOW',
  MEDIUM: 'MEDIUM',
  HIGH: 'HIGH',
  CRITICAL: 'CRITICAL'
};

const SEVERITY_EMOJI = {
  INFO: 'ℹ️',
  LOW: '⚠️',
  MEDIUM: '🟡',
  HIGH: '🟠',
  CRITICAL: '🔴'
};

function formatFieldsHTML(fields) {
  if (!fields || fields.length === 0) return '';

  return fields.map(field => `
    <tr>
      <td style="padding: 8px; background-color: #f8f9fa; font-weight: bold; border: 1px solid #dee2e6;">
        ${field.title}
      </td>
      <td style="padding: 8px; border: 1px solid #dee2e6;">
        ${field.value}
      </td>
    </tr>
  `).join('');
}

function generateEmailHTML(title, message, severity, fields = []) {
  const emoji = SEVERITY_EMOJI[severity];
  const color = {
    INFO: '#17a2b8',
    LOW: '#ffc107',
    MEDIUM: '#fd7e14',
    HIGH: '#dc3545',
    CRITICAL: '#721c24'
  }[severity];

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Alerta de Segurança - IMPGeo</title>
</head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; background-color: #f4f4f4;">
  <div style="max-width: 600px; margin: 20px auto; background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
    <div style="background-color: ${color}; color: white; padding: 20px; text-align: center;">
      <h1 style="margin: 0; font-size: 24px;">${emoji} Alerta de Segurança</h1>
      <p style="margin: 5px 0 0 0; font-size: 14px; opacity: 0.9;">IMPGeo System</p>
    </div>
    <div style="background-color: #f8f9fa; padding: 15px; border-left: 4px solid ${color};">
      <strong style="color: ${color}; font-size: 16px;">Severidade: ${severity}</strong>
    </div>
    <div style="padding: 20px;">
      <h2 style="color: #333; font-size: 20px; margin-top: 0;">${title}</h2>
      <p style="color: #666; font-size: 14px; margin-bottom: 20px;">${message}</p>
      ${fields.length > 0 ? `
      <h3 style="color: #333; font-size: 16px; margin-bottom: 10px;">Detalhes:</h3>
      <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
        ${formatFieldsHTML(fields)}
      </table>
      ` : ''}
      <p style="color: #999; font-size: 12px; margin-top: 20px;">
        <strong>Data/Hora:</strong> ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}
      </p>
    </div>
    <div style="background-color: #f8f9fa; padding: 15px; text-align: center; border-top: 1px solid #dee2e6;">
      <p style="margin: 0; font-size: 12px; color: #666;">
        Este é um alerta automático do sistema de segurança IMPGeo.<br>
        Não responda este email.
      </p>
    </div>
  </div>
</body>
</html>
  `;
}

async function sendEmailAlert(title, message, severity, fields = []) {
  if (!process.env.SENDGRID_API_KEY) {
    console.warn('⚠️  SENDGRID_API_KEY não configurada. Alerta não enviado.');
    return false;
  }

  try {
    const msg = {
      to: ALERT_EMAIL_TO.split(',').map(email => email.trim()),
      from: ALERT_EMAIL_FROM,
      subject: `[${severity}] ${title} - IMPGeo Security`,
      html: generateEmailHTML(title, message, severity, fields),
      text: `
${SEVERITY_EMOJI[severity]} ALERTA DE SEGURANÇA - ${severity}

${title}

${message}

${fields.map(f => `${f.title}: ${f.value}`).join('\n')}

Data/Hora: ${new Date().toLocaleString('pt-BR')}

---
Este é um alerta automático do sistema de segurança IMPGeo.
      `.trim()
    };

    await sgMail.send(msg);
    console.log(`✅ [Security Alert] Email enviado: ${title}`);
    return true;
  } catch (error) {
    console.error('❌ Erro ao enviar email com SendGrid:', error);
    if (error.response) {
      console.error('SendGrid Error Response:', error.response.body);
    }
    return false;
  }
}

async function sendAlert(title, message, severity, fields = []) {
  const success = await sendEmailAlert(title, message, severity, fields);

  try {
    await pool.query(
      `INSERT INTO audit_logs (operation, status, details, created_at)
       VALUES ($1, $2, $3, NOW())`,
      [
        'security_alert',
        success ? 'success' : 'failed',
        JSON.stringify({ title, message, severity, fields })
      ]
    );
  } catch (dbError) {
    console.error('❌ Erro ao registrar alerta no banco:', dbError.message);
  }

  return success;
}

async function alertSuspiciousLogin(username, ip, reason) {
  return await sendAlert(
    'Tentativa de Login Suspeita',
    'Uma tentativa de login suspeita foi detectada no sistema.',
    SEVERITY.HIGH,
    [
      { title: 'Usuário', value: username },
      { title: 'IP', value: ip },
      { title: 'Motivo', value: reason },
      { title: 'Ação Recomendada', value: 'Verificar se o usuário reconhece esta tentativa de login' }
    ]
  );
}

async function alertMultipleIPs(username, ips, timeWindow = '5 minutos') {
  return await sendAlert(
    'Múltiplos IPs Detectados',
    `O usuário ${username} acessou o sistema de ${ips.length} IPs diferentes em ${timeWindow}.`,
    SEVERITY.HIGH,
    [
      { title: 'Usuário', value: username },
      { title: 'Quantidade de IPs', value: ips.length.toString() },
      { title: 'IPs Detectados', value: ips.join(', ') },
      { title: 'Janela de Tempo', value: timeWindow },
      { title: 'Risco', value: 'Possível compartilhamento de credenciais ou ataque' }
    ]
  );
}

async function alertTokenTheft(username, ip, refreshToken) {
  return await sendAlert(
    'ROUBO DE TOKEN DETECTADO',
    'Uso de refresh token já utilizado detectado! Todas as sessões do usuário foram revogadas.',
    SEVERITY.CRITICAL,
    [
      { title: 'Usuário', value: username },
      { title: 'IP', value: ip },
      { title: 'Token (últimos 10 chars)', value: '...' + refreshToken.slice(-10) },
      { title: 'Ação Tomada', value: 'Todas as sessões revogadas automaticamente' },
      { title: 'Ação Requerida', value: 'Notificar o usuário e solicitar troca de senha' }
    ]
  );
}

async function alertSQLInjection(ip, endpoint, payload) {
  return await sendAlert(
    'Tentativa de SQL Injection',
    'Padrão de SQL Injection detectado em requisição.',
    SEVERITY.CRITICAL,
    [
      { title: 'IP', value: ip },
      { title: 'Endpoint', value: endpoint },
      { title: 'Payload Detectado', value: payload.substring(0, 100) + '...' },
      { title: 'Ação Tomada', value: 'Requisição bloqueada pelo WAF' }
    ]
  );
}

async function alertXSS(ip, endpoint, payload) {
  return await sendAlert(
    'Tentativa de XSS (Cross-Site Scripting)',
    'Padrão de XSS detectado em requisição.',
    SEVERITY.HIGH,
    [
      { title: 'IP', value: ip },
      { title: 'Endpoint', value: endpoint },
      { title: 'Payload Detectado', value: payload.substring(0, 100) + '...' },
      { title: 'Ação Tomada', value: 'Requisição bloqueada pelo WAF' }
    ]
  );
}

async function alertBruteForce(username, attempts, ip, timeWindow = '10 minutos') {
  return await sendAlert(
    'Ataque de Brute Force Detectado',
    `${attempts} tentativas de login falhadas em ${timeWindow}.`,
    SEVERITY.CRITICAL,
    [
      { title: 'Usuário Alvo', value: username },
      { title: 'Tentativas', value: attempts.toString() },
      { title: 'IP', value: ip },
      { title: 'Janela de Tempo', value: timeWindow },
      { title: 'Ação Tomada', value: 'Conta temporariamente bloqueada (15 minutos)' },
      { title: 'Ação Recomendada', value: 'Bloquear IP no firewall se ataque persistir' }
    ]
  );
}

async function alertNewCountry(username, country, ip) {
  return await sendAlert(
    'Login de Novo País Detectado',
    `O usuário ${username} fez login de um país não usual.`,
    SEVERITY.MEDIUM,
    [
      { title: 'Usuário', value: username },
      { title: 'País', value: country },
      { title: 'IP', value: ip },
      { title: 'Observação', value: 'Este é o primeiro login detectado deste país' },
      { title: 'Ação Recomendada', value: 'Confirmar com o usuário se a atividade é legítima' }
    ]
  );
}

async function alertMultipleDevices(username, devices, timeWindow = '5 minutos') {
  return await sendAlert(
    'Múltiplos Dispositivos Detectados',
    `O usuário ${username} acessou de ${devices.length} dispositivos diferentes em ${timeWindow}.`,
    SEVERITY.MEDIUM,
    [
      { title: 'Usuário', value: username },
      { title: 'Quantidade de Dispositivos', value: devices.length.toString() },
      { title: 'Dispositivos', value: devices.join(', ') },
      { title: 'Janela de Tempo', value: timeWindow },
      { title: 'Observação', value: 'Pode indicar compartilhamento de credenciais' }
    ]
  );
}

async function alertAnomaly(username, anomalyType, details, score) {
  const severityMap = {
    100: SEVERITY.CRITICAL,
    80: SEVERITY.HIGH,
    60: SEVERITY.MEDIUM,
    40: SEVERITY.LOW,
    20: SEVERITY.INFO
  };

  const severity = Object.entries(severityMap)
    .sort((a, b) => b[0] - a[0])
    .find(([threshold]) => score >= parseInt(threshold))?.[1] || SEVERITY.INFO;

  return await sendAlert(
    `Anomalia Detectada: ${anomalyType}`,
    details,
    severity,
    [
      { title: 'Usuário', value: username },
      { title: 'Tipo de Anomalia', value: anomalyType },
      { title: 'Score de Risco', value: `${score}/100` },
      { title: 'Detalhes', value: details }
    ]
  );
}

module.exports = {
  sendAlert,
  alertSuspiciousLogin,
  alertMultipleIPs,
  alertTokenTheft,
  alertSQLInjection,
  alertXSS,
  alertBruteForce,
  alertNewCountry,
  alertMultipleDevices,
  alertAnomaly,
  SEVERITY
};
