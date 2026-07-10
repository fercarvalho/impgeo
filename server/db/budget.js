// ═══════════════════════════════════════════════════════════════════════════
// server/db/budget.js
// Domínio TerraControl Orçamentos/Pagamentos do data-layer (#15 A, migration 040):
// camada de persistência pura de orçamento (cabeçalho), revisões (snapshots),
// pedidos de revisão, eventos/auditoria, template padrão, idempotência de
// webhook, cache do customer AbacatePay e denormalização terracontrol↔budget.
// Colado no Database.prototype via Object.assign. Só usa this.* — sem símbolos
// de módulo. (Toda lógica de transição de estado fica em budget-service.)
// ═══════════════════════════════════════════════════════════════════════════
'use strict';

module.exports = {
  // ═══════════════════════════════════════════════════════════════════════════
  // TerraControl — Orçamentos e pagamentos (migration 040)
  // ═══════════════════════════════════════════════════════════════════════════
  // Camada de persistência pura. Toda lógica de transição de estado, transação,
  // notificação e chamada externa fica em server/services/budget-service.js.
  //
  // Convenções:
  //   - Status do orçamento: draft|sent|revision_requested|awaiting_payment|paid|cancelled
  //   - Revisões numeradas a partir de 1 (revision_number=0 = budget criado mas
  //     ainda sem revisão enviada — não acontece no fluxo atual, sendBudget já
  //     cria com revision=1).
  //   - terracontrol.budget_status NULL = registro legado, fluxo livre.
  // ═══════════════════════════════════════════════════════════════════════════

  // ───── Orçamento (cabeçalho) ─────────────────────────────────────────────

  async createBudget({ terracontrolId, createdByUserId }) {
    const id = this.generateId();
    const result = await this.queryWithRetry(
      `INSERT INTO tc_budgets (id, terracontrol_id, status, created_by_user_id)
       VALUES ($1, $2, 'draft', $3)
       RETURNING *`,
      [id, terracontrolId, createdByUserId || null]
    );
    return result.rows[0];
  },

  async getBudgetById(id) {
    const result = await this.queryWithRetry(
      'SELECT * FROM tc_budgets WHERE id = $1',
      [id]
    );
    return result.rows[0] || null;
  },

  // Devolve o budget NÃO cancelado de um registro (1 por vez, garantido por
  // índice único parcial). Retorna null se nunca houve orçamento.
  async getBudgetByTerracontrolId(terracontrolId) {
    const result = await this.queryWithRetry(
      `SELECT * FROM tc_budgets
        WHERE terracontrol_id = $1 AND status <> 'cancelled'
        ORDER BY created_at DESC
        LIMIT 1`,
      [terracontrolId]
    );
    return result.rows[0] || null;
  },

  // Lookup por externalId pra reconciliar webhooks. AbacatePay manda o que a
  // gente mandou em metadata/externalId — usamos `tc_budget_<id>_attempt_<N>`.
  async getBudgetByExternalId(externalId) {
    const result = await this.queryWithRetry(
      'SELECT * FROM tc_budgets WHERE abacatepay_external_id = $1 LIMIT 1',
      [externalId]
    );
    return result.rows[0] || null;
  },

  // Atualiza só o status + updated_at. Extras opcionais (ex: paid_at, paid_amount).
  async updateBudgetStatus(id, status, extras = {}) {
    const sets = ['status = $2', 'updated_at = NOW()'];
    const params = [id, status];
    let i = 3;
    for (const [col, val] of Object.entries(extras)) {
      sets.push(`${col} = $${i++}`);
      params.push(val);
    }
    const result = await this.queryWithRetry(
      `UPDATE tc_budgets SET ${sets.join(', ')}
        WHERE id = $1
        RETURNING *`,
      params
    );
    return result.rows[0] || null;
  },

  // Snapshot do pagamento AbacatePay no budget (br_code, expires_at, attempt).
  // Chamado em accept (1ª emissão) e refresh-pix (re-emissões).
  async updateBudgetPaymentSnapshot(id, {
    chargeId, externalId, brCode, brCodeBase64, expiresAt, attempt,
  }) {
    const result = await this.queryWithRetry(
      `UPDATE tc_budgets
          SET abacatepay_charge_id      = $2,
              abacatepay_external_id    = $3,
              abacatepay_br_code        = $4,
              abacatepay_br_code_base64 = $5,
              abacatepay_expires_at     = $6,
              abacatepay_attempt        = $7,
              updated_at                = NOW()
        WHERE id = $1
        RETURNING *`,
      [id, chargeId, externalId, brCode, brCodeBase64, expiresAt, attempt]
    );
    return result.rows[0] || null;
  },

  // ───── Revisões (snapshots imutáveis) ────────────────────────────────────

  async createBudgetRevision({
    budgetId, revisionNumber, contentJson, contentHtmlSnapshot,
    items, totalAmountCents, pdfUrl, createdByUserId,
  }) {
    const id = this.generateId();
    const result = await this.queryWithRetry(
      `INSERT INTO tc_budget_revisions
         (id, budget_id, revision_number, content_json, content_html_snapshot,
          items, total_amount_cents, pdf_url, created_by_user_id)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9)
       RETURNING *`,
      [
        id, budgetId, revisionNumber,
        JSON.stringify(contentJson || {}),
        contentHtmlSnapshot || null,
        JSON.stringify(items || []),
        totalAmountCents,
        pdfUrl || null,
        createdByUserId || null,
      ]
    );
    return result.rows[0];
  },

  async listBudgetRevisions(budgetId) {
    // G10: JOIN com users pra trazer nome/sobrenome do impgeo user que
    // criou a revisão. Sempre é impgeo (admin envia) — não precisa CASE
    // como nos eventos.
    const result = await this.queryWithRetry(
      `SELECT r.*,
              u.first_name AS created_by_first_name,
              u.last_name  AS created_by_last_name,
              u.username   AS created_by_username
         FROM tc_budget_revisions r
         LEFT JOIN users u ON u.id = r.created_by_user_id
        WHERE r.budget_id = $1
        ORDER BY r.revision_number DESC`,
      [budgetId]
    );
    return result.rows;
  },

  async getCurrentBudgetRevision(budgetId, revisionNumber) {
    const result = await this.queryWithRetry(
      `SELECT * FROM tc_budget_revisions
        WHERE budget_id = $1 AND revision_number = $2`,
      [budgetId, revisionNumber]
    );
    return result.rows[0] || null;
  },

  // ───── Pedidos de revisão (do tc_user) ───────────────────────────────────

  async createBudgetRevisionRequest({
    budgetId, againstRevisionNumber, comment, source, tcUserId,
  }) {
    const id = this.generateId();
    const result = await this.queryWithRetry(
      `INSERT INTO tc_budget_revision_requests
         (id, budget_id, against_revision_number, comment, source, created_by_tc_user_id)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [
        id, budgetId, againstRevisionNumber,
        comment || null,
        source || 'tc_user',
        tcUserId || null,
      ]
    );
    return result.rows[0];
  },

  async listBudgetRevisionRequests(budgetId) {
    // G10: JOIN com tc_users pra trazer nome/sobrenome do tc_user que pediu
    // a revisão. Requests vêm do cliente, então sempre tc_users.
    const result = await this.queryWithRetry(
      `SELECT r.*,
              tu.first_name AS created_by_first_name,
              tu.last_name  AS created_by_last_name,
              tu.username   AS created_by_username
         FROM tc_budget_revision_requests r
         LEFT JOIN tc_users tu ON tu.id = r.created_by_tc_user_id
        WHERE r.budget_id = $1
        ORDER BY r.created_at DESC`,
      [budgetId]
    );
    return result.rows;
  },

  // ───── Eventos / trilha de auditoria ─────────────────────────────────────

  // Append-only. Nunca update — se algo dá errado, gera evento adicional.
  async appendBudgetEvent({ budgetId, eventType, actorType, actorId, payload }) {
    const id = this.generateId();
    const result = await this.queryWithRetry(
      `INSERT INTO tc_budget_events
         (id, budget_id, event_type, actor_type, actor_id, payload)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb)
       RETURNING *`,
      [
        id, budgetId, eventType, actorType,
        actorId || null,
        payload ? JSON.stringify(payload) : null,
      ]
    );
    return result.rows[0];
  },

  async listBudgetEvents(budgetId) {
    // G10: LEFT JOIN dual com users e tc_users — escolhe via CASE pelo
    // actor_type. Quando actor_type='system' ou 'abacatepay' não tem user
    // associado e os campos voltam null (o front renderiza o tipo bruto).
    const result = await this.queryWithRetry(
      `SELECT e.*,
              CASE WHEN e.actor_type = 'impgeo' THEN u.first_name
                   WHEN e.actor_type = 'tc'     THEN tu.first_name END AS actor_first_name,
              CASE WHEN e.actor_type = 'impgeo' THEN u.last_name
                   WHEN e.actor_type = 'tc'     THEN tu.last_name END AS actor_last_name,
              CASE WHEN e.actor_type = 'impgeo' THEN u.username
                   WHEN e.actor_type = 'tc'     THEN tu.username END AS actor_username
         FROM tc_budget_events e
         LEFT JOIN users u     ON e.actor_type = 'impgeo' AND u.id  = e.actor_id
         LEFT JOIN tc_users tu ON e.actor_type = 'tc'     AND tu.id = e.actor_id
        WHERE e.budget_id = $1
        ORDER BY e.created_at ASC`,
      [budgetId]
    );
    return result.rows;
  },

  // ───── Template padrão ───────────────────────────────────────────────────

  async getActiveBudgetTemplate() {
    const result = await this.queryWithRetry(
      'SELECT * FROM tc_budget_templates WHERE is_active = TRUE LIMIT 1'
    );
    return result.rows[0] || null;
  },

  // Cria/atualiza o template ativo. Como há índice único parcial garantindo
  // 1 ativo, usamos UPDATE se existir, INSERT se não.
  async upsertBudgetTemplate({ name, contentJson, defaultItems, updatedByUserId }) {
    const existing = await this.getActiveBudgetTemplate();
    if (existing) {
      const result = await this.queryWithRetry(
        `UPDATE tc_budget_templates
            SET name             = COALESCE($2, name),
                content_json     = $3::jsonb,
                default_items    = $4::jsonb,
                updated_at       = NOW(),
                updated_by_user_id = $5
          WHERE id = $1
          RETURNING *`,
        [
          existing.id,
          name || null,
          JSON.stringify(contentJson || {}),
          JSON.stringify(defaultItems || []),
          updatedByUserId || null,
        ]
      );
      return result.rows[0];
    }
    const id = this.generateId();
    const result = await this.queryWithRetry(
      `INSERT INTO tc_budget_templates
         (id, name, content_json, default_items, is_active, updated_by_user_id)
       VALUES ($1, $2, $3::jsonb, $4::jsonb, TRUE, $5)
       RETURNING *`,
      [
        id,
        name || 'Padrão',
        JSON.stringify(contentJson || {}),
        JSON.stringify(defaultItems || []),
        updatedByUserId || null,
      ]
    );
    return result.rows[0];
  },

  // ───── Webhook events — idempotência ─────────────────────────────────────

  // Insert com ON CONFLICT DO NOTHING. Retorna {firstSeen: true} se realmente
  // inseriu (handler deve processar), false se já existia (handler pula).
  async recordWebhookEvent({ provider, eventId, eventType, payload }) {
    const result = await this.queryWithRetry(
      `INSERT INTO tc_webhook_events (provider, event_id, event_type, payload)
       VALUES ($1, $2, $3, $4::jsonb)
       ON CONFLICT (provider, event_id) DO NOTHING
       RETURNING provider, event_id`,
      [provider, eventId, eventType, payload ? JSON.stringify(payload) : null]
    );
    return { firstSeen: result.rowCount > 0 };
  },

  // ───── tc_users — cache do AbacatePay customer_id ────────────────────────

  async setTcUserAbacatePayCustomerId(tcUserId, customerId) {
    await this.queryWithRetry(
      'UPDATE tc_users SET abacatepay_customer_id = $2, updated_at = NOW() WHERE id = $1',
      [tcUserId, customerId]
    );
  },

  // ───── terracontrol ↔ budget (denormalização) ────────────────────────────

  // Atualiza current_budget_id + budget_status no registro. Chamada pelo
  // budget-service em toda transição relevante.
  async setTerracontrolBudgetState(terracontrolId, { budgetId = undefined, budgetStatus }) {
    const sets = ['budget_status = $2', 'updated_at = CURRENT_TIMESTAMP'];
    const params = [terracontrolId, budgetStatus];
    if (budgetId !== undefined) {
      sets.push(`current_budget_id = $${params.length + 1}`);
      params.push(budgetId);
    }
    await this.queryWithRetry(
      `UPDATE terracontrol SET ${sets.join(', ')} WHERE id = $1`,
      params
    );
  },

  // ───── tc_record_events — audit log do registro (migration 041) ─────────

  // Append-only. Use pra TODA ação não-trivial sobre o registro
  // (created, edited, approved, unapproved). Falha silenciosa: o caller
  // não deve quebrar a request principal se o audit falhar.
  async appendRecordEvent({ terracontrolId, eventType, actorType, actorId, payload }) {
    try {
      const id = this.generateId();
      const result = await this.queryWithRetry(
        `INSERT INTO tc_record_events
           (id, terracontrol_id, event_type, actor_type, actor_id, payload)
         VALUES ($1, $2, $3, $4, $5, $6::jsonb)
         RETURNING *`,
        [
          id, terracontrolId, eventType, actorType,
          actorId || null,
          payload ? JSON.stringify(payload) : null,
        ]
      );
      return result.rows[0];
    } catch (err) {
      console.error('[appendRecordEvent] Falha ao gravar audit:', err?.message);
      return null;
    }
  },

  async listRecordEvents(terracontrolId) {
    // G10: mesmo padrão do listBudgetEvents — JOIN dual + CASE pelo actor_type.
    const result = await this.queryWithRetry(
      `SELECT e.*,
              CASE WHEN e.actor_type = 'impgeo' THEN u.first_name
                   WHEN e.actor_type = 'tc'     THEN tu.first_name END AS actor_first_name,
              CASE WHEN e.actor_type = 'impgeo' THEN u.last_name
                   WHEN e.actor_type = 'tc'     THEN tu.last_name END AS actor_last_name,
              CASE WHEN e.actor_type = 'impgeo' THEN u.username
                   WHEN e.actor_type = 'tc'     THEN tu.username END AS actor_username
         FROM tc_record_events e
         LEFT JOIN users u     ON e.actor_type = 'impgeo' AND u.id  = e.actor_id
         LEFT JOIN tc_users tu ON e.actor_type = 'tc'     AND tu.id = e.actor_id
        WHERE e.terracontrol_id = $1
        ORDER BY e.created_at ASC`,
      [terracontrolId]
    );
    return result.rows;
  },

  // ───── Ownership: tc_user é dono do budget? ──────────────────────────────

  // Verdadeiro se o terracontrol referenciado pelo budget foi criado pelo
  // tc_user OU se tc_user tem acesso explícito via tc_user_record_access.
  // Mesmo critério usado por tcUserCanEditRecord / tcUserCanDeleteRecord,
  // mas via JOIN no budget.
  async tcUserOwnsBudget(tcUserId, budgetId) {
    const result = await this.queryWithRetry(
      `SELECT 1 FROM tc_budgets b
         JOIN terracontrol t ON t.id = b.terracontrol_id
        WHERE b.id = $1
          AND (
            t.created_by_tc_user_id = $2
            OR EXISTS (
              SELECT 1 FROM tc_user_record_access a
               WHERE a.tc_user_id = $2 AND a.terracontrol_id = t.id
            )
          )
        LIMIT 1`,
      [budgetId, tcUserId]
    );
    return result.rowCount > 0;
  },
};
