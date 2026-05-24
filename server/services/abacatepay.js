// Cliente HTTP para a API da AbacatePay (gateway de pagamento brasileiro).
//
// Cobre só o que o TerraControl precisa hoje (Transparent Checkout pra PIX):
//   - createCustomer       upsert de cliente (taxId é unique no lado deles)
//   - createTransparentCharge   gera cobrança PIX com brCode + QR Code base64
//   - getCharge            consulta status de uma cobrança
//   - verifyWebhookHmac    valida assinatura HMAC-SHA256 do webhook
//   - verifyWebhookSecretFromQuery   confere ?webhookSecret=... contra env
//
// Sem SDK oficial — fetch nativo (Node 18+). Mantém a stack enxuta e o
// payload visível pra debug.
//
// Env vars:
//   ABACATEPAY_API_KEY        chave Bearer. Em dev mode é uma chave dev (sim
//                             ulação); em prod é a chave real. Mesma URL base.
//   ABACATEPAY_WEBHOOK_SECRET secret arbitrário (gere com `openssl rand -base64
//                             32`). Validado APENAS contra ?webhookSecret=...
//                             na query string do webhook — NÃO é usado no HMAC
//                             (o HMAC usa a chave pública fixa da AbacatePay
//                             ABACATEPAY_WEBHOOK_PUBLIC_KEY abaixo).
//   ABACATEPAY_BASE_URL       opcional, default 'https://api.abacatepay.com'.
//
// Se ABACATEPAY_API_KEY estiver vazia, as funções de chamada lançam erro
// com mensagem útil (não silenciam). Pra rodar testes locais sem credencial,
// stube por fora (jest, etc) — aqui não há fallback automático.

const crypto = require('crypto');

const DEFAULT_BASE_URL = 'https://api.abacatepay.com';
const API_VERSION_PATH = '/v2';

// Chave PÚBLICA da AbacatePay usada pra assinar webhooks via HMAC-SHA256.
// Mesma chave pra todos os clientes — vem direto da documentação oficial
// (https://docs.abacatepay.com/pages/webhooks). NÃO é segredo nem o
// webhookSecret configurado no painel.
//
// Camadas de validação do webhook:
//   1) ?webhookSecret=<...> na URL (verifica contra ABACATEPAY_WEBHOOK_SECRET)
//   2) X-Webhook-Signature header (HMAC sobre raw body usando ESTA chave pública)
const ABACATEPAY_WEBHOOK_PUBLIC_KEY =
  't9dXRhHHo3yDEj5pVDYz0frf7q6bMKyMRmxxCPIPp3RCplBfXRxqlC6ZpiWmOqj4L63qEaeUOtrCI8P0VMUgo6iIga2ri9ogaHFs0WIIywSMg0q7RmBfybe1E5XJcfC4IW3alNqym0tXoAKkzvfEjZxV6bE0oG2zJrNNYmUCKZyV0KZ3JS8Votf9EAWWYdiDkMkpbMdPggfh1EqHlVkMiTady6jOR3hyzGEHrIz2Ret0xHKMbiqkr9HS1JhNHDX9';

function getApiKey() {
  const key = process.env.ABACATEPAY_API_KEY;
  if (!key) {
    throw new Error('ABACATEPAY_API_KEY não configurada nas env vars');
  }
  return key;
}

function getBaseUrl() {
  return (process.env.ABACATEPAY_BASE_URL || DEFAULT_BASE_URL).replace(/\/+$/, '');
}

// Wrapper genérico de chamada. Lida com retry simples (1 retry em 5xx),
// tradução de erro pra mensagem legível, e parse defensivo do envelope
// `{ data, error, success }` que a AbacatePay usa em toda resposta.
async function call(method, pathSuffix, body) {
  const url = `${getBaseUrl()}${API_VERSION_PATH}${pathSuffix}`;
  const init = {
    method,
    headers: {
      Authorization: `Bearer ${getApiKey()}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
  };
  if (body !== undefined) init.body = JSON.stringify(body);

  let lastErr;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(url, init);
      const text = await res.text();
      let parsed = null;
      try { parsed = text ? JSON.parse(text) : null; } catch { /* não-json */ }

      if (!res.ok) {
        const msg = parsed?.error || parsed?.message || `HTTP ${res.status}`;
        const err = new Error(`AbacatePay ${method} ${pathSuffix} falhou: ${msg}`);
        err.status = res.status;
        err.body = parsed || text;
        // Retry só em 5xx — 4xx é erro nosso, não adianta repetir.
        if (res.status >= 500 && attempt === 0) {
          lastErr = err;
          await new Promise(r => setTimeout(r, 600));
          continue;
        }
        throw err;
      }

      // Envelope padrão: { data, error, success }. Devolve `data` (ou raw
      // se a API mudar o contrato no futuro — não quebra).
      return parsed && Object.prototype.hasOwnProperty.call(parsed, 'data')
        ? parsed.data
        : parsed;
    } catch (err) {
      // Erro de rede (fetch reject) — tenta de novo 1x.
      if (attempt === 0 && !err.status) {
        lastErr = err;
        await new Promise(r => setTimeout(r, 600));
        continue;
      }
      throw err;
    }
  }
  throw lastErr;
}

// ─── Customers ──────────────────────────────────────────────────────────────

// Cria (ou retorna existente) um cliente. AbacatePay faz upsert por taxId,
// então passar o mesmo CPF/CNPJ não duplica — devolve o `cust_xxx` existente.
async function createCustomer({ name, email, cellphone, taxId, zipCode, metadata }) {
  if (!email) throw new Error('createCustomer: email é obrigatório');
  // O exemplo da doc coloca os campos do customer dentro de { data: {...} }
  // (diferente do pattern do transparent que usa direto). Ver
  // https://docs.abacatepay.com/pages/client/create
  return call('POST', '/customers/create', {
    data: {
      name: name || undefined,
      email,
      cellphone: cellphone || undefined,
      taxId: taxId || undefined,
      zipCode: zipCode || undefined,
    },
    metadata: metadata || undefined,
  });
}

// ─── Transparent Charge (PIX) ───────────────────────────────────────────────

// Cria cobrança PIX com QR Code. Valor em CENTAVOS.
//
// externalId: nossa string única (usar 'tc_budget_<id>_attempt_<N>') — volta
// no webhook pra reconciliação.
// metadata: object livre, retornado intacto no webhook.
//
// customer: pode ser inline ({name, email, taxId, cellphone}) ou só
// {id: 'cust_xxx'} se já tem o customer cadastrado.
async function createTransparentCharge({
  amount,
  externalId,
  description,
  expiresIn,   // segundos
  customer,
  metadata,
}) {
  if (typeof amount !== 'number' || amount <= 0) {
    throw new Error('createTransparentCharge: amount (centavos) deve ser > 0');
  }
  if (!externalId) {
    throw new Error('createTransparentCharge: externalId é obrigatório (idempotência + reconciliação)');
  }
  const data = {
    amount,
    externalId,
    description: description || undefined,
    expiresIn: expiresIn || undefined,
    customer: customer || undefined,
    metadata: metadata || undefined,
  };
  return call('POST', '/transparents/create', { method: 'PIX', data });
}

async function getCharge(chargeId) {
  if (!chargeId) throw new Error('getCharge: chargeId obrigatório');
  // A doc tem /transparents/check?id= como GET. Mantemos compat usando query.
  return call('GET', `/transparents/check?id=${encodeURIComponent(chargeId)}`);
}

// ─── Webhook validation ─────────────────────────────────────────────────────

// AbacatePay usa dupla camada de segurança em webhooks:
//   1) ?webhookSecret=<secret>  na URL configurada no painel
//   2) X-Webhook-Signature      header com HMAC-SHA256 (base64) do raw body
//
// Validamos AMBAS. Falha em qualquer uma → 401.

function verifyWebhookSecretFromQuery(req) {
  const expected = process.env.ABACATEPAY_WEBHOOK_SECRET;
  if (!expected) {
    console.warn('[abacatepay] ABACATEPAY_WEBHOOK_SECRET não configurada — webhook não pode ser validado');
    return false;
  }
  const received = req.query?.webhookSecret;
  if (typeof received !== 'string' || received.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(received), Buffer.from(expected));
}

// rawBody: Buffer ou string EXATA do request (sem reparse). Por isso o
// handler usa express.json({verify}) pra preservar req.rawBody — re-stringify
// com JSON.stringify NÃO bate (formatação muda).
//
// IMPORTANTE: o HMAC usa a CHAVE PÚBLICA fixa da AbacatePay
// (ABACATEPAY_WEBHOOK_PUBLIC_KEY), NÃO o webhookSecret configurado no painel.
// O webhookSecret é validado separadamente pela query string em
// verifyWebhookSecretFromQuery. Param `secret` mantido por compat mas ignorado.
function verifyWebhookHmac(rawBody, signatureHeader, _secret) {
  if (!signatureHeader || typeof signatureHeader !== 'string') return false;
  const buf = Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(String(rawBody), 'utf8');
  const expected = crypto
    .createHmac('sha256', ABACATEPAY_WEBHOOK_PUBLIC_KEY)
    .update(buf)
    .digest('base64');
  const a = Buffer.from(expected);
  const b = Buffer.from(signatureHeader);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

module.exports = {
  createCustomer,
  createTransparentCharge,
  getCharge,
  verifyWebhookHmac,
  verifyWebhookSecretFromQuery,
};
