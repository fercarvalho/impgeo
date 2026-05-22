// Web Push runtime — config VAPID, public key, send (no Grupo 3).
//
// Centralizado aqui em vez de inline no server.js pra:
//   1. Não acoplar a config de VAPID ao boot do Express.
//   2. Permitir que o dispatcher (Grupo 3) reutilize a mesma instância.
//   3. Falhar com mensagem clara se as envs estiverem faltando, sem
//      derrubar o server inteiro — push é opcional.
//
// Uso típico:
//   const push = require('./services/push');
//   push.init(process.env);
//   if (push.isConfigured()) { ... }
//   const pubKey = push.getPublicKey();
//   await push.send(subscription, payload);   // Grupo 3

const webpush = require('web-push');

let _publicKey = null;
let _privateKey = null;
let _subject = null;
let _configured = false;

function init(env) {
  const pub = (env.VAPID_PUBLIC_KEY || '').trim();
  const priv = (env.VAPID_PRIVATE_KEY || '').trim();
  const subj = (env.VAPID_SUBJECT || '').trim();

  if (!pub || !priv) {
    console.warn('[push] VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY ausentes — Web Push desabilitado.');
    console.warn('[push] Gere com: node server/scripts/generate-vapid.mjs');
    _configured = false;
    return;
  }

  if (!subj) {
    console.warn('[push] VAPID_SUBJECT ausente — usando default mailto:noreply@example.com (NÃO USAR EM PROD).');
  }

  const subject = subj || 'mailto:noreply@example.com';

  try {
    webpush.setVapidDetails(subject, pub, priv);
    _publicKey = pub;
    _privateKey = priv;
    _subject = subject;
    _configured = true;
    console.log('[push] Web Push configurado. Subject:', subject);
  } catch (err) {
    console.error('[push] Falha ao configurar VAPID:', err.message);
    _configured = false;
  }
}

function isConfigured() {
  return _configured;
}

function getPublicKey() {
  return _publicKey;
}

// Envia uma notificação pra uma subscription.
// Caller é responsável por tratar erros — em particular:
//   - statusCode 404/410 → subscription expirada, remover do banco
//   - outros            → falha transitória, incrementar failed_count
// Não envolve em try/catch aqui pra preservar info de erro do web-push.
//
// `subscription` deve ter shape { endpoint, keys: { p256dh, auth } } — igual
// ao que o browser entrega no `pushManager.subscribe()` e que persistimos.
async function send(subscription, payload, options = {}) {
  if (!_configured) {
    throw new Error('[push] Web Push não configurado (faltam envs VAPID_*)');
  }
  const body = typeof payload === 'string' ? payload : JSON.stringify(payload);
  return webpush.sendNotification(subscription, body, {
    TTL: options.ttl || 60 * 60 * 24,   // 1 dia: push service descarta se cliente não voltar online
    urgency: options.urgency || 'normal', // very-low | low | normal | high
    topic: options.topic,                  // colapsa mensagens com mesmo topic (opt)
  });
}

module.exports = { init, isConfigured, getPublicKey, send };
