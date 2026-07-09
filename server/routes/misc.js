// ═══════════════════════════════════════════════════════════════════════════
// server/routes/misc.js
// Rotas avulsas sem domínio próprio: resets de senha administrativos
// (reset-first-login, reset-all-passwords), healthcheck (/api/test) e limpeza de
// dados de projeção (clear-all-projection-data). Extraídas de server.js (#3) —
// comportamento idêntico (rotas verbatim, paths completos preservados).
// ═══════════════════════════════════════════════════════════════════════════
'use strict';

const express = require('express');

module.exports = function createMiscRoutes({ db, authenticateToken, requireAdmin, logActivity }) {
  const router = express.Router();

router.post('/api/auth/reset-first-login', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { username } = req.body;
    if (!username) {
      return res.status(400).json({ error: 'Username é obrigatório' });
    }

    const user = await db.getUserByUsername(username);
    if (!user) {
      return res.status(404).json({ error: 'Usuário não encontrado' });
    }

    await db.updateUser(user.id, { lastLogin: null });
    await logActivity(req, {
      action: 'reset_password',
      moduleKey: 'admin',
      entityType: 'user',
      entityId: user.id
    });

    return res.json({
      success: true,
      message: `Primeiro login resetado para o usuário ${username}. Agora você pode fazer login com qualquer senha novamente.`
    });
  } catch (error) {
    return res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

router.post('/api/auth/reset-all-passwords', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const allUsers = await db.getAllUsers();
    let resetCount = 0;

    for (const user of allUsers) {
      await db.updateUser(user.id, { lastLogin: null });
      resetCount += 1;
    }

    await logActivity(req, {
      action: 'reset_all_passwords',
      moduleKey: 'admin',
      entityType: 'system'
    });

    return res.json({
      success: true,
      message: `Senhas resetadas para ${resetCount} usuário(s). Todos os usuários precisarão fazer primeiro login novamente.`,
      resetCount
    });
  } catch (error) {
    return res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// APIs de gestão administrativa (módulos, roles, permissões, statistics, users) — extraídas para routes/admin.js (#3)
router.get('/api/test', async (req, res) => {
  res.json({
    message: 'API funcionando!',
    timestamp: new Date().toISOString(),
    endpoints: [
      'POST /api/auth/login - Fazer login',
      'POST /api/auth/verify - Verificar token',
      'GET /api/transactions - Listar transações',
      'POST /api/transactions - Criar transação',
      'PUT /api/transactions/:id - Atualizar transação',
      'DELETE /api/transactions/:id - Deletar transação',
      'DELETE /api/transactions - Deletar múltiplas transações',
      'GET /api/products - Listar produtos',
      'POST /api/products - Criar produto',
      'PUT /api/products/:id - Atualizar produto',
      'DELETE /api/products/:id - Deletar produto',
      'DELETE /api/products - Deletar múltiplos produtos',
      'POST /api/import - Importar arquivos Excel',
      'POST /api/export - Exportar dados para Excel',
      'GET /api/projection - Obter dados de projeção',
      'PUT /api/projection - Atualizar dados de projeção',
      'GET /api/fixed-expenses - Obter dados de despesas fixas',
      'PUT /api/fixed-expenses - Atualizar dados de despesas fixas',
      'GET /api/variable-expenses - Obter dados de despesas variáveis',
      'PUT /api/variable-expenses - Atualizar dados de despesas variáveis',
      'GET /api/mkt - Obter dados de MKT',
      'PUT /api/mkt - Atualizar dados de MKT',
      'GET /api/budget - Obter dados de orçamento',
      'PUT /api/budget - Atualizar dados de orçamento',
      'GET /api/investments - Obter dados de investimentos',
      'PUT /api/investments - Atualizar dados de investimentos',
      'GET /api/faturamento-reurb - Obter dados de faturamento REURB',
      'PUT /api/faturamento-reurb - Atualizar dados de faturamento REURB',
      'GET /api/faturamento-geo - Obter dados de faturamento GEO',
      'PUT /api/faturamento-geo - Atualizar dados de faturamento GEO',
      'GET /api/faturamento-plan - Obter dados de faturamento PLAN',
      'PUT /api/faturamento-plan - Atualizar dados de faturamento PLAN',
      'GET /api/faturamento-reg - Obter dados de faturamento REG',
      'PUT /api/faturamento-reg - Atualizar dados de faturamento REG',
      'GET /api/faturamento-nn - Obter dados de faturamento NN',
      'PUT /api/faturamento-nn - Atualizar dados de faturamento NN',
      'GET /api/faturamento-total - Obter dados de faturamento total',
      'PUT /api/faturamento-total - Atualizar dados de faturamento total',
      'GET /api/resultado - Obter dados de resultado',
      'PUT /api/resultado - Atualizar dados de resultado',
      'GET /api/test - Testar API'
    ]
  });
});

router.delete('/api/clear-all-projection-data', authenticateToken, async (req, res) => {
  try {
    console.log('Endpoint de limpeza de dados chamado')
    const result = await db.clearAllProjectionData()

    if (result.success) {
      res.json({
        success: true,
        message: 'Todos os dados de projeção foram limpos com sucesso!'
      })
    } else {
      res.status(500).json({
        success: false,
        message: result.message
      })
    }
  } catch (error) {
    console.error('Erro no endpoint de limpeza:', error)
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor ao limpar dados'
    })
  }
})


  return router;
};
