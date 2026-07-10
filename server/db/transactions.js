// ═══════════════════════════════════════════════════════════════════════════
// server/db/transactions.js
// Domínio Transações do data-layer (#15 A): CRUD de transações, regras
// (transaction_rules), aplicação/candidatos/preview e permissões granulares de
// regras por usuário. Colado no Database.prototype via Object.assign.
// Só usa this.* — sem símbolos de módulo.
// ═══════════════════════════════════════════════════════════════════════════
'use strict';

module.exports = {
  // Métodos para Transações
  async getAllTransactions() {
    try {
      const result = await this.queryWithRetry('SELECT * FROM transactions ORDER BY date DESC');
      return result.rows;
    } catch (error) {
      console.error('Erro ao ler transações:', error);
      return [];
    }
  },

  async saveTransaction(transaction) {
    try {
      const id = this.generateId();
      const result = await this.queryWithRetry(
        `INSERT INTO transactions (id, date, description, value, type, category, subcategory, asaas_id, asaas_type, source, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
         RETURNING *`,
        [
          id,
          transaction.date || null,
          transaction.description || null,
          transaction.value || 0,
          transaction.type || null,
          transaction.category || null,
          transaction.subcategory || null,
          transaction.asaas_id || null,
          transaction.asaas_type || null,
          transaction.source || 'manual',
          new Date().toISOString(),
          new Date().toISOString()
        ]
      );
      return result.rows[0];
    } catch (error) {
      console.error('Erro ao salvar transação:', error);
      throw error;
    }
  },

  async saveAsaasTransaction(transaction) {
    try {
      const id = this.generateId();
      const result = await this.queryWithRetry(
        `INSERT INTO transactions (id, date, description, value, type, category, subcategory, asaas_id, asaas_type, source, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'asaas', $10, $11)
         ON CONFLICT (asaas_id) DO NOTHING
         RETURNING *`,
        [
          id,
          transaction.date || null,
          transaction.description || null,
          transaction.value || 0,
          transaction.type || null,
          transaction.category || null,
          transaction.subcategory || null,
          transaction.asaas_id,
          transaction.asaas_type || null,
          new Date().toISOString(),
          new Date().toISOString()
        ]
      );
      return result.rows[0] || null; // null = já existia (ignorado)
    } catch (error) {
      console.error('Erro ao salvar transação Asaas:', error);
      throw error;
    }
  },

  async updateTransaction(id, updatedTransaction) {
    try {
      const result = await this.queryWithRetry(
        `UPDATE transactions 
         SET date = $1, description = $2, value = $3, type = $4, category = $5, subcategory = $6, updated_at = $7
         WHERE id = $8
         RETURNING *`,
        [
          updatedTransaction.date || null,
          updatedTransaction.description || null,
          updatedTransaction.value || 0,
          updatedTransaction.type || null,
          updatedTransaction.category || null,
          updatedTransaction.subcategory || null,
          new Date().toISOString(),
          id
        ]
      );
      if (result.rows.length === 0) {
        throw new Error('Transação não encontrada');
      }
      return result.rows[0];
    } catch (error) {
      console.error('Erro ao atualizar transação:', error);
      throw error;
    }
  },

  async deleteTransaction(id) {
    try {
      const result = await this.queryWithRetry(
        'DELETE FROM transactions WHERE id = $1 RETURNING id',
        [id]
      );
      if (result.rows.length === 0) {
        throw new Error('Transação não encontrada');
      }
      return true;
    } catch (error) {
      console.error('Erro ao deletar transação:', error);
      throw error;
    }
  },

  async deleteMultipleTransactions(ids) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      for (const id of ids) {
        await client.query('DELETE FROM transactions WHERE id = $1', [id]);
      }
      await client.query('COMMIT');
      return true;
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Erro ao deletar múltiplas transações:', error);
      throw error;
    } finally {
      client.release();
    }
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // Regras automáticas de transações (migration 018)
  // ═══════════════════════════════════════════════════════════════════════════

  async getAllTransactionRules() {
    try {
      const result = await this.queryWithRetry(
        'SELECT * FROM transaction_rules ORDER BY sort_order ASC, created_at ASC'
      );
      return result.rows;
    } catch (error) {
      console.error('Erro ao ler regras de transação:', error);
      return [];
    }
  },

  async getActiveTransactionRules() {
    try {
      const result = await this.queryWithRetry(
        'SELECT * FROM transaction_rules WHERE is_active = TRUE ORDER BY sort_order ASC, created_at ASC'
      );
      return result.rows;
    } catch (error) {
      console.error('Erro ao ler regras ativas:', error);
      return [];
    }
  },

  async getTransactionRuleById(id) {
    const result = await this.queryWithRetry(
      'SELECT * FROM transaction_rules WHERE id = $1',
      [id]
    );
    return result.rows[0] || null;
  },

  async saveTransactionRule(rule) {
    const id = this.generateId();
    const sortOrderResult = await this.queryWithRetry(
      'SELECT COALESCE(MAX(sort_order), -1) + 1 AS next_order FROM transaction_rules'
    );
    const nextOrder = rule.sort_order ?? sortOrderResult.rows[0].next_order;

    const result = await this.queryWithRetry(
      `INSERT INTO transaction_rules
         (id, name, description_contains, action_type, action_value, set_category, set_subcategory,
          hide_transaction, min_value, max_value, match_type,
          is_active, sort_order, created_by, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, NOW(), NOW())
       RETURNING *`,
      [
        id,
        rule.name,
        rule.description_contains,
        rule.action_type || 'change_type',
        rule.action_value || null,
        rule.set_category || null,
        rule.set_subcategory || null,
        !!rule.hide_transaction,
        rule.min_value ?? null,
        rule.max_value ?? null,
        rule.match_type || null,
        rule.is_active !== false,
        nextOrder,
        rule.created_by || null,
      ]
    );
    return result.rows[0];
  },

  async updateTransactionRule(id, updates) {
    const existing = await this.getTransactionRuleById(id);
    if (!existing) throw new Error('Regra não encontrada');

    // Coalesce explícito: aceita null para limpar campo (apenas se a chave foi enviada)
    const pick = (key, fallback) => (Object.prototype.hasOwnProperty.call(updates, key) ? updates[key] : fallback);

    const result = await this.queryWithRetry(
      `UPDATE transaction_rules
          SET name = $1,
              description_contains = $2,
              action_type = $3,
              action_value = $4,
              set_category = $5,
              set_subcategory = $6,
              hide_transaction = $7,
              min_value = $8,
              max_value = $9,
              match_type = $10,
              is_active = $11,
              sort_order = $12,
              updated_at = NOW()
        WHERE id = $13
        RETURNING *`,
      [
        updates.name ?? existing.name,
        updates.description_contains ?? existing.description_contains,
        updates.action_type ?? existing.action_type,
        pick('action_value', existing.action_value),
        pick('set_category', existing.set_category),
        pick('set_subcategory', existing.set_subcategory),
        Object.prototype.hasOwnProperty.call(updates, 'hide_transaction') ? !!updates.hide_transaction : existing.hide_transaction,
        pick('min_value', existing.min_value),
        pick('max_value', existing.max_value),
        pick('match_type', existing.match_type),
        updates.is_active ?? existing.is_active,
        updates.sort_order ?? existing.sort_order,
        id,
      ]
    );
    return result.rows[0];
  },

  async deleteTransactionRule(id) {
    const result = await this.queryWithRetry(
      'DELETE FROM transaction_rules WHERE id = $1 RETURNING id',
      [id]
    );
    if (result.rows.length === 0) throw new Error('Regra não encontrada');
    return true;
  },

  async reorderTransactionRules(orderedIds) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      for (let i = 0; i < orderedIds.length; i++) {
        await client.query(
          'UPDATE transaction_rules SET sort_order = $1, updated_at = NOW() WHERE id = $2',
          [i, orderedIds[i]]
        );
      }
      await client.query('COMMIT');
      return true;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  },

  // ───── Aplicação de regras ────────────────────────────────────────────────

  /**
   * Avalia uma transação contra todas as regras ATIVAS e retorna os matches.
   * Função PURA — não persiste nada. Caller decide o que fazer com o resultado.
   *
   * Match: descrição da transação contém `description_contains` da regra
   *        (case-insensitive). Regras sem descrição na transação não dão match.
   */
  async evaluateRulesForTransaction(transaction) {
    const rules = await this.getActiveTransactionRules();
    const description = (transaction.description || '').toLowerCase();
    if (!description) return { matched: [], rules };
    const value = parseFloat(transaction.value);
    const txType = transaction.type;

    const matched = rules.filter((r) => {
      // Condição: descrição contém (case-insensitive)
      const needle = (r.description_contains || '').toLowerCase().trim();
      if (!needle) return false;
      if (!description.includes(needle)) return false;

      // Condição: faixa de valor (inclusive). Comparação em valor absoluto pois
      // o sinal vem do tipo (Receita +/Despesa -) — usuário pensa em "valor da
      // transação", não no sinal.
      const absValue = Math.abs(value);
      if (r.min_value != null && absValue < parseFloat(r.min_value)) return false;
      if (r.max_value != null && absValue > parseFloat(r.max_value)) return false;

      // Condição: tipo atual da transação (Receita/Despesa/...)
      if (r.match_type && r.match_type !== txType) return false;

      return true;
    });

    return { matched, rules };
  },

  /**
   * Aplica uma regra específica a uma transação existente.
   * Guarda original_type para permitir reverter depois.
   */
  async applyRuleToTransaction(transactionId, ruleId) {
    const rule = await this.getTransactionRuleById(ruleId);
    if (!rule) throw new Error('Regra não encontrada');

    const txResult = await this.queryWithRetry(
      'SELECT * FROM transactions WHERE id = $1',
      [transactionId]
    );
    const tx = txResult.rows[0];
    if (!tx) throw new Error('Transação não encontrada');

    // "base" = estado a partir do qual a regra é aplicada. Se a transação
    // está pendente de confirmação (type='A confirmar'), partimos dos valores
    // originais — caso contrário, uma regra que só mexe em categoria deixaria
    // o type='A confirmar' indevidamente. Para transações normais, partimos
    // dos valores atuais.
    const isPending = tx.needs_confirmation === true || tx.type === 'A confirmar';
    const baseType        = isPending ? (tx.original_type        || tx.type)        : tx.type;
    const baseCategory    = isPending ? (tx.original_category    || tx.category)    : tx.category;
    const baseSubcategory = isPending ? (tx.original_subcategory || tx.subcategory) : tx.subcategory;

    // Aplica cada campo definido pela regra; senão mantém base.
    const newType        = rule.action_value     ? rule.action_value     : baseType;
    // Tipos sem categoria: transferência entre contas e movimentações de caixa
    // não têm categoria NEM subcategoria. Se a regra leva a transação a um
    // desses tipos, ambas são zeradas — não pode sobrar/aplicar nelas.
    const TYPES_WITHOUT_CATEGORY = ['Transferência entre contas', 'Reforço de caixa', 'Retirada de caixa'];
    const typeUsesCategory = !TYPES_WITHOUT_CATEGORY.includes(newType);
    const newCategory    = typeUsesCategory ? (rule.set_category    ? rule.set_category    : baseCategory)    : null;
    const newSubcategory = typeUsesCategory ? (rule.set_subcategory ? rule.set_subcategory : baseSubcategory) : null;
    const newHidden      = rule.hide_transaction ? true                  : tx.is_hidden;

    // Preserva os "original_*" apenas na primeira aplicação (para permitir
    // reverter ao estado original mesmo quando outra regra já estava aplicada).
    const originalType        = tx.original_type        || tx.type;
    const originalCategory    = tx.original_category    || tx.category;
    const originalSubcategory = tx.original_subcategory || tx.subcategory;

    const result = await this.queryWithRetry(
      `UPDATE transactions
          SET type = $1,
              category = $2,
              subcategory = $3,
              is_hidden = $4,
              applied_rule_id = $5,
              original_type = $6,
              original_category = $7,
              original_subcategory = $8,
              needs_confirmation = FALSE,
              updated_at = NOW()
        WHERE id = $9
        RETURNING *`,
      [newType, newCategory, newSubcategory, newHidden, ruleId, originalType, originalCategory, originalSubcategory, transactionId]
    );

    await this.clearTransactionRuleCandidates(transactionId);
    return result.rows[0];
  },

  /**
   * Reverte uma transação para o tipo original (antes da regra).
   * Se não houver original_type registrado, mantém o type atual mas zera
   * os campos de rastreamento.
   */
  async revertTransactionRule(transactionId) {
    const result = await this.queryWithRetry(
      `UPDATE transactions
          SET type = COALESCE(original_type, type),
              category = COALESCE(original_category, category),
              subcategory = COALESCE(original_subcategory, subcategory),
              is_hidden = FALSE,
              applied_rule_id = NULL,
              original_type = NULL,
              original_category = NULL,
              original_subcategory = NULL,
              needs_confirmation = FALSE,
              updated_at = NOW()
        WHERE id = $1
        RETURNING *`,
      [transactionId]
    );
    if (result.rows.length === 0) throw new Error('Transação não encontrada');
    await this.clearTransactionRuleCandidates(transactionId);
    return result.rows[0];
  },

  /**
   * Marca uma transação como pendente de confirmação manual (match em 2+ regras).
   * Guarda os candidatos e seta type='A confirmar'.
   */
  async markTransactionPendingConfirmation(transactionId, candidateRuleIds) {
    const txResult = await this.queryWithRetry(
      'SELECT * FROM transactions WHERE id = $1',
      [transactionId]
    );
    const tx = txResult.rows[0];
    if (!tx) throw new Error('Transação não encontrada');

    const originalType        = tx.original_type        || tx.type;
    const originalCategory    = tx.original_category    || tx.category;
    const originalSubcategory = tx.original_subcategory || tx.subcategory;

    const result = await this.queryWithRetry(
      `UPDATE transactions
          SET type = 'A confirmar',
              applied_rule_id = NULL,
              original_type = $1,
              original_category = $2,
              original_subcategory = $3,
              needs_confirmation = TRUE,
              updated_at = NOW()
        WHERE id = $4
        RETURNING *`,
      [originalType, originalCategory, originalSubcategory, transactionId]
    );

    await this.saveTransactionRuleCandidates(transactionId, candidateRuleIds);
    return result.rows[0];
  },

  // ───── Candidatos ─────────────────────────────────────────────────────────

  async saveTransactionRuleCandidates(transactionId, ruleIds) {
    if (!ruleIds || ruleIds.length === 0) return;
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('DELETE FROM transaction_rule_candidates WHERE transaction_id = $1', [transactionId]);
      for (const ruleId of ruleIds) {
        await client.query(
          `INSERT INTO transaction_rule_candidates (transaction_id, rule_id)
           VALUES ($1, $2) ON CONFLICT DO NOTHING`,
          [transactionId, ruleId]
        );
      }
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  },

  async getTransactionRuleCandidates(transactionId) {
    const result = await this.queryWithRetry(
      `SELECT r.* FROM transaction_rules r
         INNER JOIN transaction_rule_candidates c ON c.rule_id = r.id
        WHERE c.transaction_id = $1
        ORDER BY r.sort_order ASC, r.created_at ASC`,
      [transactionId]
    );
    return result.rows;
  },

  async clearTransactionRuleCandidates(transactionId) {
    await this.queryWithRetry(
      'DELETE FROM transaction_rule_candidates WHERE transaction_id = $1',
      [transactionId]
    );
  },

  // ───── Preview (para criar/editar regra retroativamente) ───────────────────

  /**
   * Dado um critério de descrição, retorna transações existentes que dariam
   * match. Cada item vem com info se já está associado a outra regra (para
   * o modal de preview avisar o usuário).
   */
  async previewRuleMatches({ description_contains, excludeRuleId = null }) {
    const needle = (description_contains || '').trim();
    if (!needle) return [];

    const result = await this.queryWithRetry(
      `SELECT t.*,
              r.id   AS existing_rule_id,
              r.name AS existing_rule_name
         FROM transactions t
         LEFT JOIN transaction_rules r ON r.id = t.applied_rule_id
        WHERE LOWER(t.description) LIKE LOWER($1)
          AND ($2::VARCHAR IS NULL OR t.applied_rule_id IS DISTINCT FROM $2)
        ORDER BY t.date DESC`,
      [`%${needle}%`, excludeRuleId]
    );
    return result.rows;
  },

  // Notificações (impgeo) — métodos movidos para db/notifications.js (#15 A).

  // ───── Permissões granulares para regras ──────────────────────────────────

  /**
   * Retorna {can_create, can_edit, can_delete} para o usuário.
   * - admin/superadmin: tudo true (bypass)
   * - outros: lê de user_rule_permissions; se não houver linha, retorna false
   */
  async getUserRulePermissions(userId, role) {
    if (role === 'admin' || role === 'superadmin') {
      return { can_create: true, can_edit: true, can_delete: true, is_admin_bypass: true };
    }
    const result = await this.queryWithRetry(
      'SELECT can_create, can_edit, can_delete FROM user_rule_permissions WHERE user_id = $1',
      [userId]
    );
    if (result.rows.length === 0) {
      return { can_create: false, can_edit: false, can_delete: false, is_admin_bypass: false };
    }
    return { ...result.rows[0], is_admin_bypass: false };
  },

  async setUserRulePermissions(userId, perms, grantedBy) {
    const result = await this.queryWithRetry(
      `INSERT INTO user_rule_permissions
         (user_id, can_create, can_edit, can_delete, granted_by, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
       ON CONFLICT (user_id) DO UPDATE
         SET can_create = EXCLUDED.can_create,
             can_edit   = EXCLUDED.can_edit,
             can_delete = EXCLUDED.can_delete,
             granted_by = EXCLUDED.granted_by,
             updated_at = NOW()
       RETURNING *`,
      [userId, !!perms.can_create, !!perms.can_edit, !!perms.can_delete, grantedBy || null]
    );
    return result.rows[0];
  },

  async deleteUserRulePermissions(userId) {
    await this.queryWithRetry(
      'DELETE FROM user_rule_permissions WHERE user_id = $1',
      [userId]
    );
  },

};
