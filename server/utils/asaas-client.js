/**
 * Asaas API Client
 * Sincroniza entradas (pagamentos recebidos) e saídas (transferências PIX/TED)
 * com a aba de Transações do impgeo.
 */

const https = require('https');

const API_URL = process.env.ASAAS_API_URL || 'https://api.asaas.com/v3';
const API_KEY = process.env.ASAAS_API_KEY;

// ─── HTTP helper ────────────────────────────────────────────────────────────

function asaasRequest(path, method = 'GET', body = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(API_URL + path);
    const options = {
      hostname: url.hostname,
      path: url.pathname + url.search,
      method,
      headers: {
        'access_token': API_KEY,
        'Content-Type': 'application/json',
        'User-Agent': 'impgeo/1.0',
      },
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode, body: data });
        }
      });
    });

    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

// ─── Mapeamento de tipos de pagamento ───────────────────────────────────────

function mapBillingType(billingType) {
  const map = {
    PIX: 'PIX',
    BOLETO: 'Boleto',
    CREDIT_CARD: 'Cartão de Crédito',
    DEBIT_CARD: 'Cartão de Débito',
    TRANSFER: 'Transferência',
    DEPOSIT: 'Depósito',
    UNDEFINED: 'Outro',
  };
  return map[billingType] || billingType || 'Outro';
}

// ─── Buscar pagamentos recebidos (entradas) ──────────────────────────────────

async function fetchReceivedPayments(since = null) {
  const params = new URLSearchParams({ status: 'RECEIVED', limit: '100', offset: '0' });
  if (since) params.set('paymentDate[ge]', since);

  const result = [];
  let offset = 0;
  let hasMore = true;

  while (hasMore) {
    params.set('offset', String(offset));
    const res = await asaasRequest(`/payments?${params.toString()}`);

    if (res.status !== 200) {
      console.error('[Asaas] Erro ao buscar pagamentos:', res.body);
      break;
    }

    const { data, hasMore: more } = res.body;
    if (!data || data.length === 0) break;

    for (const p of data) {
      result.push({
        asaas_id: p.id,
        asaas_type: 'payment',
        date: p.paymentDate || p.clientPaymentDate || p.dateCreated,
        description: `[Asaas] ${p.description || mapBillingType(p.billingType)} - ${p.invoiceNumber || p.id}`,
        value: parseFloat(p.netValue || p.value),
        type: 'entrada',
        category: 'Recebimento Asaas',
        subcategory: mapBillingType(p.billingType),
      });
    }

    hasMore = more;
    offset += data.length;
    if (offset >= 1000) break; // segurança
  }

  return result;
}

// ─── Buscar transferências realizadas (saídas) ───────────────────────────────

async function fetchDoneTransfers(since = null) {
  const params = new URLSearchParams({ status: 'DONE', limit: '100', offset: '0' });
  if (since) params.set('dateCreated[ge]', since);

  const result = [];
  let offset = 0;
  let hasMore = true;

  while (hasMore) {
    params.set('offset', String(offset));
    const res = await asaasRequest(`/transfers?${params.toString()}`);

    if (res.status !== 200) {
      console.error('[Asaas] Erro ao buscar transferências:', res.body);
      break;
    }

    const { data, hasMore: more } = res.body;
    if (!data || data.length === 0) break;

    for (const t of data) {
      const destName = t.bankAccount?.ownerName || 'Destinatário desconhecido';
      const operationType = t.operationType || 'PIX';
      result.push({
        asaas_id: t.id,
        asaas_type: 'transfer',
        date: t.effectiveDate || t.scheduleDate || t.dateCreated,
        description: `[Asaas] ${operationType} para ${destName}`,
        value: -Math.abs(parseFloat(t.value)),
        type: 'saída',
        category: 'Transferência Asaas',
        subcategory: operationType,
      });
    }

    hasMore = more;
    offset += data.length;
    if (offset >= 1000) break;
  }

  return result;
}

module.exports = { fetchReceivedPayments, fetchDoneTransfers };
