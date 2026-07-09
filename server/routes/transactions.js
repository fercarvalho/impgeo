// ═══════════════════════════════════════════════════════════════════════════
// server/routes/transactions.js
// Domínio de transações do financeiro: regras de transação (CRUD/reorder/revert/
// reprocess/retroativo/preview), permissões granulares de regras, transações
// (pending/candidates/resolve-confirmation + CRUD) e subcategorias. Extraídas de
// server.js (#3) — comportamento idêntico (rotas verbatim, paths preservados).
//
// applyRulesAndPersist / _truncateForNotif / VALID_TRANSACTION_TYPES /
// requireRulePermission ficam no server.js (compartilhados com import/asaas/
// webhooks) e chegam por injeção. Os schemas zod (transactionRuleSchema/
// transactionSchema) moram aqui dentro.
// ═══════════════════════════════════════════════════════════════════════════
'use strict';

const express = require('express');
const { z } = require('zod');
const path = require('path');
const push = require('../services/push');
const pushDispatcher = require('../services/push-dispatcher');

module.exports = function createTransactionsRoutes({
  db, logActivity, applyRulesAndPersist, _truncateForNotif,
  VALID_TRANSACTION_TYPES, requireRulePermission,
}) {
  const router = express.Router();

// ─── CRUD de regras ────────────────────────────────────────────────────────
router.get('/api/transaction-rules', async (req, res) => {
  try {
    const rules = await db.getAllTransactionRules();
    const perms = await db.getUserRulePermissions(req.user.id, req.user.role);
    res.json({ success: true, data: rules, permissions: perms });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Regra: descrição obrigatória + pelo menos uma ação (tipo/categoria/subcategoria/ocultar).
// Condições opcionais: faixa de valor e tipo casado.
const transactionRuleSchema = z.object({
  name: z.string().min(1, 'Nome obrigatório'),
  description_contains: z.string().min(1, 'Descrição obrigatória'),
  action_type: z.string().default('change_type'),
  action_value:     z.string().nullable().optional(),
  set_category:     z.string().nullable().optional(),
  set_subcategory:  z.string().nullable().optional(),
  hide_transaction: z.boolean().optional(),
  min_value: z.union([z.number(), z.string().transform(v => v === '' ? null : parseFloat(v))]).nullable().optional(),
  max_value: z.union([z.number(), z.string().transform(v => v === '' ? null : parseFloat(v))]).nullable().optional(),
  match_type: z.string().nullable().optional(),
  is_active: z.boolean().optional(),
}).passthrough().refine(
  (data) => Boolean(data.action_value) || Boolean(data.set_category) || Boolean(data.set_subcategory) || Boolean(data.hide_transaction),
  { message: 'Defina ao menos uma ação: tipo, categoria, subcategoria ou ocultar' }
).refine(
  (data) => data.min_value == null || data.max_value == null || Number(data.min_value) <= Number(data.max_value),
  { message: 'Valor mínimo deve ser menor ou igual ao máximo' }
);

router.post('/api/transaction-rules', requireRulePermission('create'), async (req, res) => {
  try {
    const data = transactionRuleSchema.parse(req.body);
    if (data.action_value && !VALID_TRANSACTION_TYPES.includes(data.action_value)) {
      return res.status(400).json({ success: false, error: `Tipo inválido. Use: ${VALID_TRANSACTION_TYPES.join(', ')}` });
    }
    const rule = await db.saveTransactionRule({ ...data, created_by: req.user.id });
    res.json({ success: true, data: rule });
    await logActivity(req, { action: 'rule_create', moduleKey: 'transactions', entityType: 'transaction_rule', entityId: rule.id, details: { rule } });
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ success: false, error: 'Dados inválidos', details: err.errors });
    res.status(500).json({ success: false, error: err.message });
  }
});

router.put('/api/transaction-rules/:id', requireRulePermission('edit'), async (req, res) => {
  try {
    const { id } = req.params;
    if (req.body.action_value && !VALID_TRANSACTION_TYPES.includes(req.body.action_value)) {
      return res.status(400).json({ success: false, error: `Tipo inválido. Use: ${VALID_TRANSACTION_TYPES.join(', ')}` });
    }
    const rule = await db.updateTransactionRule(id, req.body);
    res.json({ success: true, data: rule });
    await logActivity(req, { action: 'rule_edit', moduleKey: 'transactions', entityType: 'transaction_rule', entityId: id, details: { updates: req.body } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Exclusão recebe transactionAction: 'delete' | 'revert' | 'keep' para decidir
// o destino das transações já modificadas por essa regra.
router.delete('/api/transaction-rules/:id', requireRulePermission('delete'), async (req, res) => {
  try {
    const { id } = req.params;
    const { transactionAction = 'revert' } = req.body || {};
    if (!['delete', 'revert', 'keep'].includes(transactionAction)) {
      return res.status(400).json({ success: false, error: 'transactionAction inválido' });
    }

    const affected = (await db.queryWithRetry(
      'SELECT id FROM transactions WHERE applied_rule_id = $1',
      [id]
    )).rows;

    for (const t of affected) {
      if (transactionAction === 'delete') {
        await db.deleteTransaction(t.id);
      } else if (transactionAction === 'revert') {
        await db.revertTransactionRule(t.id);
      } else { // keep
        await db.queryWithRetry(
          'UPDATE transactions SET applied_rule_id = NULL, original_type = NULL, updated_at = NOW() WHERE id = $1',
          [t.id]
        );
      }
    }

    await db.deleteTransactionRule(id);
    res.json({ success: true, affected: affected.length, transactionAction });
    await logActivity(req, { action: 'rule_delete', moduleKey: 'transactions', entityType: 'transaction_rule', entityId: id, details: { transactionAction, affected: affected.length } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Retorna transações que JÁ estão classificadas por esta regra (independente
// da condição atual). Usado no preview de edição para detectar transações que
// ficaram "órfãs" — aplicadas pela regra mas que não casam mais com a nova condição.
router.get('/api/transaction-rules/:id/affected', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await db.queryWithRetry(
      'SELECT * FROM transactions WHERE applied_rule_id = $1 ORDER BY date DESC',
      [id]
    );
    res.json({ success: true, data: result.rows });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Reverte transações específicas (usado pelo modal de edição para "soltar" as órfãs)
router.post('/api/transaction-rules/:id/revert', requireRulePermission('edit'), async (req, res) => {
  try {
    const { id } = req.params;
    const { transactionIds = [] } = req.body || {};
    let reverted = 0;
    for (const txId of transactionIds) {
      // Só reverte se a transação realmente está governada por essa regra
      const t = (await db.queryWithRetry('SELECT applied_rule_id FROM transactions WHERE id = $1', [txId])).rows[0];
      if (t && t.applied_rule_id === id) {
        await db.revertTransactionRule(txId);
        reverted++;
      }
    }
    res.json({ success: true, reverted });
    await logActivity(req, { action: 'rule_revert_transactions', moduleKey: 'transactions', entityType: 'transaction_rule', entityId: id, details: { reverted } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Reordena regras (drag/setas) — body: { orderedIds: [...] }
router.post('/api/transaction-rules/reorder', requireRulePermission('edit'), async (req, res) => {
  try {
    const { orderedIds } = req.body || {};
    if (!Array.isArray(orderedIds) || orderedIds.length === 0) {
      return res.status(400).json({ success: false, error: 'orderedIds deve ser um array não-vazio' });
    }
    await db.reorderTransactionRules(orderedIds);
    res.json({ success: true });
    await logActivity(req, { action: 'rule_reorder', moduleKey: 'transactions', entityType: 'transaction_rule', details: { count: orderedIds.length } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Reprocessa as regras nas transações SEM categoria real (null/vazio, ou com
// categoria = tipo — resquício de importação antiga) e ainda NÃO governadas por
// regra nem pendentes. Aplica a regra que casa (1 match), marca "A confirmar"
// (2+) ou deixa "Sem categoria" (0). Não toca em transações já categorizadas
// manualmente nem nas já aplicadas por regra.
router.post('/api/transaction-rules/reprocess', requireRulePermission('edit'), async (req, res) => {
  try {
    const { rows } = await db.queryWithRetry(
      `SELECT id, description, value, type, category
         FROM transactions
        WHERE applied_rule_id IS NULL
          AND (needs_confirmation IS NULL OR needs_confirmation = FALSE)
          AND (category IS NULL OR TRIM(category) = '' OR category = type)`
    );
    let categorized = 0, pending = 0, uncategorized = 0;
    for (const tx of rows) {
      // Resíduo do bug de importação (categoria = tipo): zera antes de avaliar.
      if (tx.category && tx.category === tx.type) {
        await db.queryWithRetry('UPDATE transactions SET category = NULL WHERE id = $1', [tx.id]);
        tx.category = null;
      }
      const { matched } = await db.evaluateRulesForTransaction(tx);
      if (matched.length === 1) {
        await db.applyRuleToTransaction(tx.id, matched[0].id);
        categorized++;
      } else if (matched.length >= 2) {
        await db.markTransactionPendingConfirmation(tx.id, matched.map((r) => r.id));
        pending++;
      } else {
        uncategorized++;
      }
    }
    res.json({ success: true, total: rows.length, categorized, pending, uncategorized });
    await logActivity(req, { action: 'rule_reprocess', moduleKey: 'transactions', entityType: 'transaction_rule', details: { total: rows.length, categorized, pending, uncategorized } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Preview: dada uma condição, retorna transações que dariam match (para
// o modal de criar/editar regra mostrar o que será afetado retroativamente).
router.post('/api/transaction-rules/preview', async (req, res) => {
  try {
    const { description_contains, ruleId } = req.body || {};
    if (!description_contains) {
      return res.status(400).json({ success: false, error: 'description_contains obrigatório' });
    }
    const matches = await db.previewRuleMatches({ description_contains, excludeRuleId: ruleId || null });
    res.json({ success: true, data: matches });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Aplica retroativo de uma regra. excludedTransactionIds = transações que o
// usuário desmarcou no modal de preview.
router.post('/api/transaction-rules/:id/apply-retroactive', requireRulePermission('edit'), async (req, res) => {
  try {
    const { id } = req.params;
    const { excludedTransactionIds = [] } = req.body || {};
    const rule = await db.getTransactionRuleById(id);
    if (!rule) return res.status(404).json({ success: false, error: 'Regra não encontrada' });

    const candidates = await db.previewRuleMatches({ description_contains: rule.description_contains });
    const excludedSet = new Set(excludedTransactionIds);
    const eligible = candidates.filter(t => !excludedSet.has(t.id));

    let applied = 0;
    for (const t of eligible) {
      // Respeita transações que já têm outra regra aplicada (não sobrescreve)
      if (t.applied_rule_id && t.applied_rule_id !== id) continue;
      await db.applyRuleToTransaction(t.id, id);
      applied++;
    }

    res.json({ success: true, applied, excluded: excludedTransactionIds.length });
    await logActivity(req, { action: 'rule_apply_retroactive', moduleKey: 'transactions', entityType: 'transaction_rule', entityId: id, details: { applied, excluded: excludedTransactionIds.length } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Lista todas as transações pendentes com seus candidatos (para o modal bulk)
router.get('/api/transactions/pending', async (req, res) => {
  try {
    const txResult = await db.queryWithRetry(
      "SELECT * FROM transactions WHERE (needs_confirmation = TRUE OR type = 'A confirmar') AND is_hidden = FALSE ORDER BY date DESC"
    );
    const transactions = txResult.rows;
    // Anexa candidatos a cada transação
    const result = [];
    for (const t of transactions) {
      const candidates = await db.getTransactionRuleCandidates(t.id);
      result.push({ ...t, candidates });
    }
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Resolução em lote: recebe array [{transactionId, ruleId|null}]
router.post('/api/transactions/resolve-confirmation-bulk', async (req, res) => {
  try {
    const { resolutions } = req.body || {};
    if (!Array.isArray(resolutions) || resolutions.length === 0) {
      return res.status(400).json({ success: false, error: 'resolutions deve ser um array não-vazio' });
    }
    let resolved = 0;
    const errors = [];
    for (const r of resolutions) {
      try {
        if (r.ruleId) {
          await db.applyRuleToTransaction(r.transactionId, r.ruleId);
        } else {
          await db.revertTransactionRule(r.transactionId);
        }
        await db.deleteNotificationsByEntity('transaction', r.transactionId);
        resolved++;
      } catch (err) {
        errors.push({ transactionId: r.transactionId, error: err.message });
      }
    }
    res.json({ success: true, resolved, errors });
    await logActivity(req, { action: 'transaction_resolve_confirmation_bulk', moduleKey: 'transactions', entityType: 'transaction', details: { resolved, errorCount: errors.length } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Lista regras que deram match na transação (usado pelo modal de resolução)
router.get('/api/transactions/:id/candidates', async (req, res) => {
  try {
    const candidates = await db.getTransactionRuleCandidates(req.params.id);
    res.json({ success: true, data: candidates });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Marca um conjunto de transações como "A confirmar" usando esta regra como
// candidata (junto com outras regras ativas que também dão match na transação).
// Usado pelo botão "Decidir depois" do modal de preview retroativo.
router.post('/api/transaction-rules/:id/mark-pending-retroactive', requireRulePermission('edit'), async (req, res) => {
  try {
    const { id } = req.params;
    const { transactionIds = [] } = req.body || {};
    const rule = await db.getTransactionRuleById(id);
    if (!rule) return res.status(404).json({ success: false, error: 'Regra não encontrada' });

    let marked = 0;
    for (const txId of transactionIds) {
      const tx = (await db.queryWithRetry('SELECT * FROM transactions WHERE id = $1', [txId])).rows[0];
      if (!tx) continue;
      // Re-avalia para incluir TODAS as regras que dão match (não só a recém-criada)
      const { matched } = await db.evaluateRulesForTransaction(tx);
      const candidateIds = Array.from(new Set([id, ...matched.map(m => m.id)]));
      await db.markTransactionPendingConfirmation(txId, candidateIds);
      marked++;

      // Notificação para o ator + fanout para admins (mesmo padrão de applyRulesAndPersist)
      const title = 'Transação pendente de confirmação';
      const message = `A transação "${_truncateForNotif(tx.description)}" tem ${candidateIds.length} regra(s) candidata(s). Escolha qual aplicar.`;
      const notifPayload = {
        notification_type: 'transaction_confirm_needed',
        title, message,
        related_entity_type: 'transaction',
        related_entity_id: txId,
      };
      const notifiedUserIds = new Set();
      if (req.user?.id) {
        const actorNotif = await db.createNotification({ ...notifPayload, user_id: req.user.id });
        pushDispatcher.send(db, 'impgeo', req.user.id, actorNotif).catch(() => {});
        notifiedUserIds.add(req.user.id);
      }
      const adminsResult = await db.queryWithRetry(
        "SELECT id FROM users WHERE role IN ('admin', 'superadmin') AND is_active = TRUE"
      );
      for (const row of adminsResult.rows) {
        if (notifiedUserIds.has(row.id)) continue;
        const adminNotif = await db.createNotification({ ...notifPayload, user_id: row.id });
        pushDispatcher.send(db, 'impgeo', row.id, adminNotif).catch(() => {});
        notifiedUserIds.add(row.id);
      }
    }
    res.json({ success: true, marked });
    await logActivity(req, { action: 'rule_mark_pending_retroactive', moduleKey: 'transactions', entityType: 'transaction_rule', entityId: id, details: { marked } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Resolver pendência de uma transação (escolher uma regra ou manter original)
router.post('/api/transactions/:id/resolve-confirmation', async (req, res) => {
  try {
    const { id } = req.params;
    const { ruleId = null } = req.body || {};
    const tx = ruleId
      ? await db.applyRuleToTransaction(id, ruleId)
      : await db.revertTransactionRule(id);
    await db.deleteNotificationsByEntity('transaction', id);
    res.json({ success: true, data: tx });
    await logActivity(req, { action: 'transaction_resolve_confirmation', moduleKey: 'transactions', entityType: 'transaction', entityId: id, details: { ruleId } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});
// ─── Permissões granulares para regras ────────────────────────────────────
router.get('/api/user-rule-permissions/me', async (req, res) => {
  try {
    const perms = await db.getUserRulePermissions(req.user.id, req.user.role);
    res.json({ success: true, data: perms });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/api/users/:id/rule-permissions', async (req, res) => {
  try {
    if (req.user.role !== 'admin' && req.user.role !== 'superadmin') {
      return res.status(403).json({ success: false, error: 'Apenas admins' });
    }
    const targetUser = await db.getUserById(req.params.id);
    if (!targetUser) return res.status(404).json({ success: false, error: 'Usuário não encontrado' });
    const perms = await db.getUserRulePermissions(req.params.id, targetUser.role);
    res.json({ success: true, data: perms });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.put('/api/users/:id/rule-permissions', async (req, res) => {
  try {
    if (req.user.role !== 'admin' && req.user.role !== 'superadmin') {
      return res.status(403).json({ success: false, error: 'Apenas admins' });
    }
    const { can_create, can_edit, can_delete } = req.body || {};
    const updated = await db.setUserRulePermissions(
      req.params.id,
      { can_create, can_edit, can_delete },
      req.user.id
    );
    res.json({ success: true, data: updated });
    await logActivity(req, { action: 'rule_permissions_set', moduleKey: 'transactions', entityType: 'user', entityId: req.params.id, details: { can_create, can_edit, can_delete } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// APIs para Transações
router.get('/api/transactions', async (req, res) => {
  try {
    const transactions = await db.getAllTransactions();
    res.json({ success: true, data: transactions });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

const transactionSchema = z.object({
  date: z.string().optional(),
  description: z.string().min(1, 'A descrição é obrigatória'),
  value: z.number().or(z.string().transform(v => parseFloat(v))),
  type: z.string().min(1),
  category: z.string().min(1),
  subcategory: z.string().optional()
}).passthrough();

router.post('/api/transactions', async (req, res) => {
  try {
    const validatedData = transactionSchema.parse(req.body);
    const transaction = await db.saveTransaction(validatedData);
    const { transaction: finalTx, applied, matchedRules } = await applyRulesAndPersist(transaction, { actingUserId: req.user.id });
    res.json({ success: true, data: finalTx, ruleApplication: { applied, matchedCount: matchedRules.length } });
    await logActivity(req, {
      action: 'financial_create',
      moduleKey: 'transactions',
      entityType: 'transaction',
      entityId: finalTx?.id || null,
      details: { ruleApplication: applied, matchedRuleIds: matchedRules.map(r => r.id) }
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ success: false, error: 'Dados inválidos', details: error.errors });
    }
    res.status(500).json({ success: false, error: error.message });
  }
});

// Edição manual "solta" da regra: zera applied_rule_id/original_type/needs_confirmation
// (o usuário tem controle total dos dados — uma vez editada manualmente, a transação
// não é mais governada por nenhuma regra até que ele rode aplicação retroativa)
router.put('/api/transactions/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const transaction = await db.updateTransaction(id, req.body);
    // Solta da regra
    await db.queryWithRetry(
      `UPDATE transactions
          SET applied_rule_id = NULL,
              original_type = NULL,
              needs_confirmation = FALSE,
              updated_at = NOW()
        WHERE id = $1`,
      [id]
    );
    await db.deleteNotificationsByEntity('transaction', id);
    const fresh = (await db.queryWithRetry('SELECT * FROM transactions WHERE id = $1', [id])).rows[0];
    res.json({ success: true, data: fresh });
    await logActivity(req, {
      action: 'financial_edit',
      moduleKey: 'transactions',
      entityType: 'transaction',
      entityId: id
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.delete('/api/transactions/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await db.deleteTransaction(id);
    res.json({ success: true, message: 'Transação deletada com sucesso' });
    await logActivity(req, {
      action: 'financial_delete',
      moduleKey: 'transactions',
      entityType: 'transaction',
      entityId: id
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.delete('/api/transactions', async (req, res) => {
  try {
    const { ids } = req.body;
    if (!Array.isArray(ids)) {
      return res.status(400).json({ success: false, error: 'IDs devem ser um array' });
    }
    await db.deleteMultipleTransactions(ids);
    res.json({ success: true, message: `${ids.length} transações deletadas com sucesso` });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// APIs para Subcategorias
router.get('/api/subcategories', async (req, res) => {
  try {
    const subcategories = await db.getAllSubcategories();
    res.json({ success: true, data: subcategories });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/api/subcategories', async (req, res) => {
  try {
    const { name } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, error: 'Nome da subcategoria é obrigatório' });
    }

    const subcategory = await db.saveSubcategory(name.trim());
    res.json({ success: true, data: subcategory });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.put('/api/subcategories/:name', async (req, res) => {
  try {
    const oldName = decodeURIComponent(req.params.name || '').trim();
    const newName = (req.body?.newName || '').trim();
    if (!oldName || !newName) {
      return res.status(400).json({ success: false, error: 'Nome atual e novo nome são obrigatórios' });
    }
    if (oldName === newName) {
      return res.json({ success: true });
    }

    const result = await db.renameSubcategory(oldName, newName);
    if (result === 'not_found') {
      return res.status(404).json({ success: false, error: 'Subcategoria não encontrada' });
    }
    if (result === 'conflict') {
      return res.status(409).json({ success: false, error: 'Já existe uma subcategoria com esse nome' });
    }
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Exclusão em massa. Respeita o invariante: subcategoria usada por regra(s)
// não é excluída — volta em `blocked` com as regras. As livres são excluídas
// e voltam em `deleted`. Rota POST (path fixo) declarada antes das rotas :name
// pra não colidir.
router.post('/api/subcategories/bulk-delete', async (req, res) => {
  try {
    const names = Array.isArray(req.body?.names)
      ? req.body.names.map((n) => String(n || '').trim()).filter(Boolean)
      : [];
    if (names.length === 0) {
      return res.status(400).json({ success: false, error: 'Lista de subcategorias é obrigatória' });
    }

    const deleted = [];
    const blocked = [];
    for (const name of names) {
      const rules = await db.getRulesUsingSubcategory(name);
      if (rules.length > 0) {
        blocked.push({ name, rules });
        continue;
      }
      const ok = await db.deleteSubcategory(name);
      if (ok) deleted.push(name);
    }

    res.json({ success: true, deleted, blocked });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Regras que dependem desta subcategoria (set_subcategory). Frontend usa pra
// avisar antes de excluir e abrir o fluxo de edição das regras.
router.get('/api/subcategories/:name/rules', async (req, res) => {
  try {
    const name = decodeURIComponent(req.params.name || '').trim();
    if (!name) {
      return res.status(400).json({ success: false, error: 'Nome da subcategoria é obrigatório' });
    }
    const rules = await db.getRulesUsingSubcategory(name);
    res.json({ success: true, data: rules });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.delete('/api/subcategories/:name', async (req, res) => {
  try {
    const name = decodeURIComponent(req.params.name || '').trim();
    if (!name) {
      return res.status(400).json({ success: false, error: 'Nome da subcategoria é obrigatório' });
    }

    // Invariante: subcategoria usada por uma regra não pode ser excluída até a
    // regra ser editada (passar a usar outra) ou removida. Guard server-side
    // independente do frontend.
    const dependentRules = await db.getRulesUsingSubcategory(name);
    if (dependentRules.length > 0) {
      return res.status(409).json({
        success: false,
        error: 'in_use',
        message: 'Subcategoria está em uso por uma ou mais regras.',
        rules: dependentRules,
      });
    }

    const deleted = await db.deleteSubcategory(name);
    if (!deleted) {
      return res.status(404).json({ success: false, error: 'Subcategoria não encontrada' });
    }
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

  return router;
};
