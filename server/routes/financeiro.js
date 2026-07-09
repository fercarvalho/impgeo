// ═══════════════════════════════════════════════════════════════════════════
// server/routes/financeiro.js
// Rotas do cluster Financeiro/Faturamento (produtos, projeção, backup, despesas
// fixas/variáveis, mkt, budget, investimentos, faturamento-*, resultado).
// Extraídas de server.js (#3) — comportamento idêntico (rotas verbatim, paths
// completos preservados). As rotas só chamam db.<metodo>; deps por injeção.
// ═══════════════════════════════════════════════════════════════════════════
'use strict';

const express = require('express');

module.exports = function createFinanceiroRoutes({ db, authenticateToken, logActivity }) {
  const router = express.Router();

router.get('/api/products', async (req, res) => {
  try {
    const products = await db.getAllProducts();
    res.json({ success: true, data: products });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/api/products', async (req, res) => {
  try {
    const product = await db.saveProduct(req.body);
    res.json({ success: true, data: product });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.put('/api/products/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const product = await db.updateProduct(id, req.body);
    res.json({ success: true, data: product });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.delete('/api/products/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await db.deleteProduct(id);
    res.json({ success: true, message: 'Produto deletado com sucesso' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.delete('/api/products', async (req, res) => {
  try {
    const { ids } = req.body;
    if (!Array.isArray(ids)) {
      return res.status(400).json({ success: false, error: 'IDs devem ser um array' });
    }
    await db.deleteMultipleProducts(ids);
    res.json({ success: true, message: `${ids.length} produtos deletados com sucesso` });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// APIs de Projeção
router.get('/api/projection', async (req, res) => {
  try {
    const projectionData = await db.getProjectionData();
    if (!projectionData) {
      return res.status(404).json({ error: 'Dados de projeção não encontrados' });
    }
    res.json(projectionData);
  } catch (error) {
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// Rota para sincronizar dados de projeção
router.post('/api/projection/sync', authenticateToken, async (req, res) => {
  try {
    const syncedData = await db.syncProjectionData();
    res.json({ success: true, data: syncedData });
  } catch (error) {
    res.status(500).json({ error: 'Erro ao sincronizar dados de projeção' });
  }
});

// Rota para atualizar dados de projeção
router.put('/api/projection', authenticateToken, async (req, res) => {
  try {
    const projectionData = req.body;
    const updatedData = await db.updateProjectionData(projectionData);
    res.json({ success: true, data: updatedData });
    await logActivity(req, {
      action: 'financial_edit',
      moduleKey: 'projecao',
      entityType: 'projection',
      entityId: 'main'
    });
  } catch (error) {
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// APIs de Backup Automático
router.post('/api/backup/create/:tableName', authenticateToken, async (req, res) => {
  try {
    const { tableName } = req.params;
    const result = await db.createAutoBackup(tableName);

    if (result.success) {
      res.json({ success: true, message: result.message, timestamp: result.timestamp });
    } else {
      res.status(400).json({ success: false, message: result.message });
    }
  } catch (error) {
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

router.post('/api/backup/restore/:tableName', authenticateToken, async (req, res) => {
  try {
    const { tableName } = req.params;
    const result = await db.restoreFromBackup(tableName);

    if (result.success) {
      res.json({ success: true, message: result.message, timestamp: result.timestamp });
    } else {
      res.status(400).json({ success: false, message: result.message });
    }
  } catch (error) {
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// APIs de Despesas Fixas
router.get('/api/fixed-expenses', async (req, res) => {
  try {
    const fixedExpensesData = await db.getFixedExpensesData();
    if (!fixedExpensesData) {
      return res.status(404).json({ error: 'Dados de despesas fixas não encontrados' });
    }
    res.json(fixedExpensesData);
  } catch (error) {
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

router.put('/api/fixed-expenses', authenticateToken, async (req, res) => {
  try {
    const fixedExpensesData = req.body;
    const updatedData = await db.updateFixedExpensesData(fixedExpensesData);
    res.json({ success: true, data: updatedData });
  } catch (error) {
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// Limpeza seletiva: Despesas Fixas
router.delete('/api/fixed-expenses', async (req, res) => {
  try {
    await db.createAutoBackup('fixedExpenses');
    const cleared = await db.updateFixedExpensesData({
      previsto: new Array(12).fill(0),
      media: new Array(12).fill(0),
      maximo: new Array(12).fill(0)
    });

    // Sincronizar dados de projeção após limpeza
    await db.syncProjectionData();

    res.json({ success: true, data: cleared });
  } catch (error) {
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// APIs de Despesas Variáveis
router.get('/api/variable-expenses', async (req, res) => {
  try {
    const variableExpensesData = await db.getVariableExpensesData();
    if (!variableExpensesData) {
      return res.status(404).json({ error: 'Dados de despesas variáveis não encontrados' });
    }
    res.json(variableExpensesData);
  } catch (error) {
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

router.put('/api/variable-expenses', authenticateToken, async (req, res) => {
  try {
    const variableExpensesData = req.body;
    const updatedData = await db.updateVariableExpensesData(variableExpensesData);
    res.json({ success: true, data: updatedData });
  } catch (error) {
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// Limpeza seletiva: Despesas Variáveis
router.delete('/api/variable-expenses', async (req, res) => {
  try {
    await db.createAutoBackup('variableExpenses');
    const cleared = await db.updateVariableExpensesData({
      previsto: new Array(12).fill(0),
      medio: new Array(12).fill(0),
      maximo: new Array(12).fill(0)
    });
    await db.syncProjectionData();
    res.json({ success: true, data: cleared });
  } catch (error) {
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// APIs de MKT
router.get('/api/mkt', async (req, res) => {
  try {
    const mktData = await db.getMktData();
    if (!mktData) {
      return res.status(404).json({ error: 'Dados de MKT não encontrados' });
    }
    res.json(mktData);
  } catch (error) {
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

router.put('/api/mkt', authenticateToken, async (req, res) => {
  try {
    const mktData = req.body;
    const updatedData = await db.updateMktData(mktData);
    res.json({ success: true, data: updatedData });
  } catch (error) {
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// Limpeza seletiva: MKT
router.delete('/api/mkt', async (req, res) => {
  try {
    await db.createAutoBackup('mkt');
    const cleared = await db.updateMktData({
      previsto: new Array(12).fill(0),
      medio: new Array(12).fill(0),
      maximo: new Array(12).fill(0)
    });
    await db.syncProjectionData();
    res.json({ success: true, data: cleared });
  } catch (error) {
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// APIs de Orçamento
router.get('/api/budget', async (req, res) => {
  try {
    const budgetData = await db.getBudgetData();
    if (!budgetData) {
      return res.status(404).json({ error: 'Dados de orçamento não encontrados' });
    }
    res.json(budgetData);
  } catch (error) {
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

router.put('/api/budget', authenticateToken, async (req, res) => {
  try {
    const budgetData = req.body;
    const updatedData = await db.updateBudgetData(budgetData);
    res.json({ success: true, data: updatedData });
  } catch (error) {
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// APIs de Investimentos
router.get('/api/investments', async (req, res) => {
  try {
    const investmentsData = await db.getInvestmentsData();
    if (!investmentsData) {
      return res.status(404).json({ error: 'Dados de investimentos não encontrados' });
    }
    res.json(investmentsData);
  } catch (error) {
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

router.put('/api/investments', authenticateToken, async (req, res) => {
  try {
    const investmentsData = req.body;
    const updatedData = await db.updateInvestmentsData(investmentsData);
    res.json({ success: true, data: updatedData });
  } catch (error) {
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// Limpeza seletiva: Investimentos
router.delete('/api/investments', async (req, res) => {
  try {
    await db.createAutoBackup('investments');
    const cleared = await db.updateInvestmentsData({
      previsto: new Array(12).fill(0),
      medio: new Array(12).fill(0),
      maximo: new Array(12).fill(0)
    });
    await db.syncProjectionData();
    res.json({ success: true, data: cleared });
  } catch (error) {
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// APIs de Faturamento REURB
router.get('/api/faturamento-reurb', async (req, res) => {
  try {
    const faturamentoReurbData = await db.getFaturamentoReurbData();
    if (!faturamentoReurbData) {
      return res.status(404).json({ error: 'Dados de faturamento REURB não encontrados' });
    }
    res.json(faturamentoReurbData);
  } catch (error) {
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

router.put('/api/faturamento-reurb', authenticateToken, async (req, res) => {
  try {
    const faturamentoReurbData = req.body;
    const updatedData = await db.updateFaturamentoReurbData(faturamentoReurbData);
    res.json({ success: true, data: updatedData });
  } catch (error) {
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// Limpeza seletiva: Faturamento REURB
router.delete('/api/faturamento-reurb', async (req, res) => {
  try {
    await db.createAutoBackup('faturamentoReurb');
    const cleared = await db.updateFaturamentoReurbData({
      previsto: new Array(12).fill(0),
      medio: new Array(12).fill(0),
      maximo: new Array(12).fill(0)
    });
    await db.syncProjectionData();
    res.json({ success: true, data: cleared });
  } catch (error) {
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// APIs de Faturamento GEO
router.get('/api/faturamento-geo', async (req, res) => {
  try {
    const faturamentoGeoData = await db.getFaturamentoGeoData();
    if (!faturamentoGeoData) {
      return res.status(404).json({ error: 'Dados de faturamento GEO não encontrados' });
    }
    res.json(faturamentoGeoData);
  } catch (error) {
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

router.put('/api/faturamento-geo', authenticateToken, async (req, res) => {
  try {
    const faturamentoGeoData = req.body;
    const updatedData = await db.updateFaturamentoGeoData(faturamentoGeoData);
    res.json({ success: true, data: updatedData });
  } catch (error) {
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// Limpeza seletiva: Faturamento GEO
router.delete('/api/faturamento-geo', async (req, res) => {
  try {
    await db.createAutoBackup('faturamentoGeo');
    const cleared = await db.updateFaturamentoGeoData({
      previsto: new Array(12).fill(0),
      medio: new Array(12).fill(0),
      maximo: new Array(12).fill(0)
    });
    await db.syncProjectionData();
    res.json({ success: true, data: cleared });
  } catch (error) {
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// APIs de Faturamento PLAN
router.get('/api/faturamento-plan', async (req, res) => {
  try {
    const faturamentoPlanData = await db.getFaturamentoPlanData();
    if (!faturamentoPlanData) {
      return res.status(404).json({ error: 'Dados de faturamento PLAN não encontrados' });
    }
    res.json(faturamentoPlanData);
  } catch (error) {
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

router.put('/api/faturamento-plan', authenticateToken, async (req, res) => {
  try {
    const faturamentoPlanData = req.body;
    const updatedData = await db.updateFaturamentoPlanData(faturamentoPlanData);
    res.json({ success: true, data: updatedData });
  } catch (error) {
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// Limpeza seletiva: Faturamento PLAN
router.delete('/api/faturamento-plan', async (req, res) => {
  try {
    await db.createAutoBackup('faturamentoPlan');
    const cleared = await db.updateFaturamentoPlanData({
      previsto: new Array(12).fill(0),
      medio: new Array(12).fill(0),
      maximo: new Array(12).fill(0)
    });
    await db.syncProjectionData();
    res.json({ success: true, data: cleared });
  } catch (error) {
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// APIs de Faturamento REG
router.get('/api/faturamento-reg', async (req, res) => {
  try {
    const faturamentoRegData = await db.getFaturamentoRegData();
    if (!faturamentoRegData) {
      return res.status(404).json({ error: 'Dados de faturamento REG não encontrados' });
    }
    res.json(faturamentoRegData);
  } catch (error) {
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

router.put('/api/faturamento-reg', authenticateToken, async (req, res) => {
  try {
    const faturamentoRegData = req.body;
    const updatedData = await db.updateFaturamentoRegData(faturamentoRegData);
    res.json({ success: true, data: updatedData });
  } catch (error) {
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// Limpeza seletiva: Faturamento REG
router.delete('/api/faturamento-reg', async (req, res) => {
  try {
    await db.createAutoBackup('faturamentoReg');
    const cleared = await db.updateFaturamentoRegData({
      previsto: new Array(12).fill(0),
      medio: new Array(12).fill(0),
      maximo: new Array(12).fill(0)
    });
    await db.syncProjectionData();
    res.json({ success: true, data: cleared });
  } catch (error) {
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// APIs de Faturamento NN
router.get('/api/faturamento-nn', async (req, res) => {
  try {
    const faturamentoNnData = await db.getFaturamentoNnData();
    if (!faturamentoNnData) {
      return res.status(404).json({ error: 'Dados de faturamento NN não encontrados' });
    }
    res.json(faturamentoNnData);
  } catch (error) {
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

router.put('/api/faturamento-nn', authenticateToken, async (req, res) => {
  try {
    const faturamentoNnData = req.body;
    const updatedData = await db.updateFaturamentoNnData(faturamentoNnData);
    res.json({ success: true, data: updatedData });
  } catch (error) {
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// Limpeza seletiva: Faturamento NN
router.delete('/api/faturamento-nn', async (req, res) => {
  try {
    await db.createAutoBackup('faturamentoNn');
    const cleared = await db.updateFaturamentoNnData({
      previsto: new Array(12).fill(0),
      medio: new Array(12).fill(0),
      maximo: new Array(12).fill(0)
    });
    await db.syncProjectionData();
    res.json({ success: true, data: cleared });
  } catch (error) {
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// APIs para Faturamento Total
router.get('/api/faturamento-total', async (req, res) => {
  try {
    const faturamentoTotalData = await db.getFaturamentoTotalData();
    if (!faturamentoTotalData) {
      return res.status(404).json({ error: 'Dados de faturamento total não encontrados' });
    }
    res.json(faturamentoTotalData);
  } catch (error) {
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

router.put('/api/faturamento-total', authenticateToken, async (req, res) => {
  try {
    const faturamentoTotalData = req.body;
    const updatedData = await db.updateFaturamentoTotalData(faturamentoTotalData);
    res.json({ success: true, data: updatedData });
  } catch (error) {
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// APIs para Resultado
router.get('/api/resultado', async (req, res) => {
  try {
    const resultadoData = await db.getResultadoData();
    if (!resultadoData) {
      return res.status(404).json({ error: 'Dados de resultado não encontrados' });
    }
    res.json(resultadoData);
  } catch (error) {
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

router.put('/api/resultado', authenticateToken, async (req, res) => {
  try {
    const resultadoData = req.body;
    const updatedData = await db.updateResultadoData(resultadoData);
    res.json({ success: true, data: updatedData });
  } catch (error) {
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// Limpeza seletiva: Resultado do ano anterior
router.delete('/api/resultado', async (req, res) => {
  try {
    await db.createAutoBackup('resultado');
    const cleared = await db.updateResultadoData({
      previsto: new Array(12).fill(0),
      medio: new Array(12).fill(0),
      maximo: new Array(12).fill(0)
    });
    await db.syncProjectionData();
    res.json({ success: true, data: cleared });
  } catch (error) {
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

  return router;
};
