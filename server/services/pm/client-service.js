// ═══════════════════════════════════════════════════════════════════════════
// server/services/pm/client-service.js
//
// Liga tc_users (clientes externos do TerraControl) à tabela `clients` do
// impgeo. Idempotente: usado pelo webhook PIX (Fase 3) pra garantir que todo
// terreno pago tenha um cliente correspondente.
//
// Ordem de dedup (evita cliente duplicado):
//   1. clients.tc_user_id  (vínculo já existente)
//   2. clients.cpf         (cliente cadastrado manualmente com mesmo CPF)
//   3. clients.email
//
// Aceita `pgClient` opcional p/ rodar na mesma transação do caller.
// ═══════════════════════════════════════════════════════════════════════════

'use strict';

/**
 * Serializa o address JSONB do tc_user numa string legível p/ clients.address (TEXT).
 */
function serializeAddress(addr) {
  if (!addr || typeof addr !== 'object') return null;
  const parts = [];
  if (addr.street || addr.logradouro) parts.push(addr.street || addr.logradouro);
  if (addr.number || addr.numero) parts.push(addr.number || addr.numero);
  if (addr.neighborhood || addr.bairro) parts.push(addr.neighborhood || addr.bairro);
  const cityState = [addr.city || addr.cidade, addr.state || addr.uf].filter(Boolean).join('/');
  if (cityState) parts.push(cityState);
  if (addr.zipCode || addr.cep) parts.push('CEP ' + (addr.zipCode || addr.cep));
  return parts.length ? parts.join(', ') : null;
}

/**
 * Encontra ou cria um cliente a partir de um tc_user. Idempotente.
 *
 * @param {object} db
 * @param {string} tcUserId
 * @param {object} [opts]
 * @param {object} [opts.pgClient] - conexão da tx do caller (opcional)
 * @param {string} [opts.actorUserId] - quem disparou (audit), null p/ system
 * @returns {Promise<{ clientId: string, created: boolean }>}
 */
async function findOrCreateFromTcUser(db, tcUserId, { pgClient } = {}) {
  if (!tcUserId) throw new Error('findOrCreateFromTcUser: tcUserId obrigatório');
  const exec = pgClient || db.pool;

  // Carrega tc_user.
  const tcRes = await exec.query('SELECT * FROM tc_users WHERE id = $1 LIMIT 1', [tcUserId]);
  const tcUser = tcRes.rows[0];
  if (!tcUser) throw new Error(`findOrCreateFromTcUser: tc_user ${tcUserId} não encontrado`);

  // 1. Já vinculado?
  const byLink = await exec.query('SELECT id FROM clients WHERE tc_user_id = $1 LIMIT 1', [tcUserId]);
  if (byLink.rows[0]) return { clientId: byLink.rows[0].id, created: false };

  // 2. Por CPF (e vincula tc_user_id se achar).
  if (tcUser.cpf) {
    const byCpf = await exec.query('SELECT id, tc_user_id FROM clients WHERE cpf = $1 LIMIT 1', [tcUser.cpf]);
    if (byCpf.rows[0]) {
      const cid = byCpf.rows[0].id;
      if (!byCpf.rows[0].tc_user_id) {
        await exec.query('UPDATE clients SET tc_user_id = $1, updated_at = NOW() WHERE id = $2', [tcUserId, cid]);
      }
      return { clientId: cid, created: false };
    }
  }

  // 3. Por email.
  if (tcUser.email) {
    const byEmail = await exec.query('SELECT id, tc_user_id FROM clients WHERE email = $1 LIMIT 1', [tcUser.email]);
    if (byEmail.rows[0]) {
      const cid = byEmail.rows[0].id;
      if (!byEmail.rows[0].tc_user_id) {
        await exec.query('UPDATE clients SET tc_user_id = $1, updated_at = NOW() WHERE id = $2', [tcUserId, cid]);
      }
      return { clientId: cid, created: false };
    }
  }

  // 4. Cria novo cliente.
  const id = db.generateId();
  const name = [tcUser.first_name, tcUser.last_name].filter(Boolean).join(' ').trim()
    || tcUser.username
    || tcUser.email
    || 'Cliente TerraControl';
  let address = null;
  try {
    const addrObj = typeof tcUser.address === 'string' ? JSON.parse(tcUser.address) : tcUser.address;
    address = serializeAddress(addrObj);
  } catch { address = null; }

  await exec.query(
    `INSERT INTO clients (id, name, email, phone, cpf, address, source, tc_user_id, created_at, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,'terracontrol',$7, NOW(), NOW())`,
    [id, name, tcUser.email || null, tcUser.phone || null, tcUser.cpf || null, address, tcUserId]
  );
  return { clientId: id, created: true };
}

module.exports = {
  findOrCreateFromTcUser,
  serializeAddress,
};
