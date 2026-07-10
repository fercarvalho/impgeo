// ═══════════════════════════════════════════════════════════════════════════
// server/db/financeiro.js
// Domínio Financeiro do data-layer (#15 A): projeção, despesas fixas/variáveis,
// MKT, budget, investimentos, faturamento (REURB/GEO/PLAN/REG/NN/Total), resultado
// e backup/restore. Movido verbatim de database-pg.js e colado no
// Database.prototype via Object.assign (core). Só usa this.* — sem símbolos de módulo.
// ═══════════════════════════════════════════════════════════════════════════
'use strict';

module.exports = {
  // Métodos para Projeção
  async getProjectionData() {
    try {
      const result = await this.queryWithRetry('SELECT * FROM projection WHERE id = 1');
      if (result.rows.length === 0) {
        return null;
      }
      const row = result.rows[0];
      return {
        despesasVariaveis: row.despesas_variaveis || [],
        despesasFixas: row.despesas_fixas || [],
        investimentos: row.investimentos || [],
        mkt: row.mkt || [],
        faturamentoReurb: row.faturamento_reurb || [],
        faturamentoGeo: row.faturamento_geo || [],
        faturamentoPlan: row.faturamento_plan || [],
        faturamentoReg: row.faturamento_reg || [],
        faturamentoNn: row.faturamento_nn || [],
        mktComponents: row.mkt_components || { trafego: [], socialMedia: [], producaoConteudo: [] },
        growth: row.growth || { minimo: 0, medio: 0, maximo: 0 },
        createdAt: row.created_at,
        updatedAt: row.updated_at
      };
    } catch (error) {
      console.error('Erro ao ler dados de projeção:', error);
      return null;
    }
  },

  async updateProjectionData(projectionData) {
    try {
      const result = await this.queryWithRetry(
        `UPDATE projection SET
           despesas_variaveis = $1,
           despesas_fixas = $2,
           investimentos = $3,
           mkt = $4,
           faturamento_reurb = $5,
           faturamento_geo = $6,
           faturamento_plan = $7,
           faturamento_reg = $8,
           faturamento_nn = $9,
           mkt_components = $10,
           growth = $11,
           updated_at = $12
         WHERE id = 1
         RETURNING *`,
        [
          projectionData.despesasVariaveis || new Array(12).fill(0),
          projectionData.despesasFixas || new Array(12).fill(0),
          projectionData.investimentos || new Array(12).fill(0),
          projectionData.mkt || new Array(12).fill(0),
          projectionData.faturamentoReurb || new Array(12).fill(0),
          projectionData.faturamentoGeo || new Array(12).fill(0),
          projectionData.faturamentoPlan || new Array(12).fill(0),
          projectionData.faturamentoReg || new Array(12).fill(0),
          projectionData.faturamentoNn || new Array(12).fill(0),
          JSON.stringify(projectionData.mktComponents || { trafego: [], socialMedia: [], producaoConteudo: [] }),
          JSON.stringify(projectionData.growth || { minimo: 0, medio: 0, maximo: 0 }),
          new Date().toISOString()
        ]
      );
      return result.rows[0];
    } catch (error) {
      throw new Error('Erro ao salvar dados de projeção: ' + error.message);
    }
  },

  async syncProjectionData() {
    try {
      const fixedExpensesData = await this.getFixedExpensesData();
      const variableExpensesData = await this.getVariableExpensesData();
      const faturamentoReurbData = await this.getFaturamentoReurbData();
      const faturamentoGeoData = await this.getFaturamentoGeoData();
      const faturamentoPlanData = await this.getFaturamentoPlanData();
      const faturamentoRegData = await this.getFaturamentoRegData();
      const faturamentoNnData = await this.getFaturamentoNnData();
      const investmentsData = await this.getInvestmentsData();
      const mktData = await this.getMktData();

      const projectionData = await this.getProjectionData();
      projectionData.despesasFixas = fixedExpensesData.previsto;
      projectionData.despesasVariaveis = variableExpensesData.previsto;
      projectionData.faturamentoReurb = faturamentoReurbData.previsto;
      projectionData.faturamentoGeo = faturamentoGeoData.previsto;
      projectionData.faturamentoPlan = faturamentoPlanData.previsto;
      projectionData.faturamentoReg = faturamentoRegData.previsto;
      projectionData.faturamentoNn = faturamentoNnData.previsto;
      projectionData.investimentos = investmentsData.previsto;
      projectionData.mkt = mktData.previsto;

      return await this.updateProjectionData(projectionData);
    } catch (error) {
      throw new Error('Erro ao sincronizar dados de projeção: ' + error.message);
    }
  },

  // Métodos para Despesas Fixas
  async getFixedExpensesData() {
    try {
      const result = await this.queryWithRetry('SELECT * FROM fixed_expenses WHERE id = 1');
      if (result.rows.length === 0) {
        return { previsto: [], media: [], maximo: [] };
      }
      const row = result.rows[0];
      return {
        previsto: row.previsto || [],
        media: row.media || [],
        maximo: row.maximo || []
      };
    } catch (error) {
      console.error('Erro ao ler dados de despesas fixas:', error);
      return null;
    }
  },

  async updateFixedExpensesData(fixedExpensesData) {
    try {
      const result = await this.queryWithRetry(
        `UPDATE fixed_expenses SET
           previsto = $1,
           media = $2,
           maximo = $3,
           updated_at = $4
         WHERE id = 1
         RETURNING *`,
        [
          fixedExpensesData.previsto || new Array(12).fill(0),
          fixedExpensesData.media || new Array(12).fill(0),
          fixedExpensesData.maximo || new Array(12).fill(0),
          new Date().toISOString()
        ]
      );
      return result.rows[0];
    } catch (error) {
      throw new Error('Erro ao salvar dados de despesas fixas: ' + error.message);
    }
  },

  // Métodos para Despesas Variáveis
  async getVariableExpensesData() {
    try {
      const result = await this.queryWithRetry('SELECT * FROM variable_expenses WHERE id = 1');
      if (result.rows.length === 0) {
        return { previsto: [], medio: [], maximo: [] };
      }
      const row = result.rows[0];
      return {
        previsto: row.previsto || [],
        medio: row.medio || [],
        maximo: row.maximo || []
      };
    } catch (error) {
      console.error('Erro ao ler dados de despesas variáveis:', error);
      return null;
    }
  },

  async updateVariableExpensesData(variableExpensesData) {
    try {
      const result = await this.queryWithRetry(
        `UPDATE variable_expenses SET
           previsto = $1,
           medio = $2,
           maximo = $3,
           updated_at = $4
         WHERE id = 1
         RETURNING *`,
        [
          variableExpensesData.previsto || new Array(12).fill(0),
          variableExpensesData.medio || new Array(12).fill(0),
          variableExpensesData.maximo || new Array(12).fill(0),
          new Date().toISOString()
        ]
      );
      return result.rows[0];
    } catch (error) {
      throw new Error('Erro ao atualizar dados de despesas variáveis: ' + error.message);
    }
  },

  // Métodos para MKT
  async getMktData() {
    try {
      const result = await this.queryWithRetry('SELECT * FROM mkt WHERE id = 1');
      if (result.rows.length === 0) {
        return { previsto: [], medio: [], maximo: [] };
      }
      const row = result.rows[0];
      return {
        previsto: row.previsto || [],
        medio: row.medio || [],
        maximo: row.maximo || []
      };
    } catch (error) {
      console.error('Erro ao ler dados de MKT:', error);
      return null;
    }
  },

  async updateMktData(mktData) {
    try {
      const result = await this.queryWithRetry(
        `UPDATE mkt SET
           previsto = $1,
           medio = $2,
           maximo = $3,
           updated_at = $4
         WHERE id = 1
         RETURNING *`,
        [
          mktData.previsto || new Array(12).fill(0),
          mktData.medio || new Array(12).fill(0),
          mktData.maximo || new Array(12).fill(0),
          new Date().toISOString()
        ]
      );
      return result.rows[0];
    } catch (error) {
      throw new Error('Erro ao salvar dados de MKT: ' + error.message);
    }
  },

  // Métodos para Budget
  async getBudgetData() {
    try {
      const result = await this.queryWithRetry('SELECT * FROM budget WHERE id = 1');
      if (result.rows.length === 0) {
        return { previsto: [], medio: [], maximo: [] };
      }
      const row = result.rows[0];
      return {
        previsto: row.previsto || [],
        medio: row.medio || [],
        maximo: row.maximo || []
      };
    } catch (error) {
      console.error('Erro ao ler dados de orçamento:', error);
      return null;
    }
  },

  async updateBudgetData(budgetData) {
    try {
      const result = await this.queryWithRetry(
        `UPDATE budget SET
           previsto = $1,
           medio = $2,
           maximo = $3,
           updated_at = $4
         WHERE id = 1
         RETURNING *`,
        [
          budgetData.previsto || new Array(12).fill(0),
          budgetData.medio || new Array(12).fill(0),
          budgetData.maximo || new Array(12).fill(0),
          new Date().toISOString()
        ]
      );
      return result.rows[0];
    } catch (error) {
      throw new Error('Erro ao salvar dados de orçamento: ' + error.message);
    }
  },

  // Métodos para Investments
  async getInvestmentsData() {
    try {
      const result = await this.queryWithRetry('SELECT * FROM investments WHERE id = 1');
      if (result.rows.length === 0) {
        return { previsto: [], medio: [], maximo: [] };
      }
      const row = result.rows[0];
      return {
        previsto: row.previsto || [],
        medio: row.medio || [],
        maximo: row.maximo || []
      };
    } catch (error) {
      console.error('Erro ao ler dados de investimentos:', error);
      return null;
    }
  },

  async updateInvestmentsData(investmentsData) {
    try {
      const result = await this.queryWithRetry(
        `UPDATE investments SET
           previsto = $1,
           medio = $2,
           maximo = $3,
           updated_at = $4
         WHERE id = 1
         RETURNING *`,
        [
          investmentsData.previsto || new Array(12).fill(0),
          investmentsData.medio || new Array(12).fill(0),
          investmentsData.maximo || new Array(12).fill(0),
          new Date().toISOString()
        ]
      );
      return result.rows[0];
    } catch (error) {
      throw new Error('Erro ao salvar dados de investimentos: ' + error.message);
    }
  },

  // Métodos para Faturamento REURB
  async getFaturamentoReurbData() {
    try {
      const result = await this.queryWithRetry('SELECT * FROM faturamento_reurb WHERE id = 1');
      if (result.rows.length === 0) {
        return { previsto: [], medio: [], maximo: [] };
      }
      const row = result.rows[0];
      return {
        previsto: row.previsto || [],
        medio: row.medio || [],
        maximo: row.maximo || []
      };
    } catch (error) {
      console.error('Erro ao ler dados de faturamento REURB:', error);
      return null;
    }
  },

  async updateFaturamentoReurbData(faturamentoReurbData) {
    try {
      const result = await this.queryWithRetry(
        `UPDATE faturamento_reurb SET
           previsto = $1,
           medio = $2,
           maximo = $3,
           updated_at = $4
         WHERE id = 1
         RETURNING *`,
        [
          faturamentoReurbData.previsto || new Array(12).fill(0),
          faturamentoReurbData.medio || new Array(12).fill(0),
          faturamentoReurbData.maximo || new Array(12).fill(0),
          new Date().toISOString()
        ]
      );
      return result.rows[0];
    } catch (error) {
      throw new Error('Erro ao salvar dados de faturamento REURB: ' + error.message);
    }
  },

  // Métodos para Faturamento GEO
  async getFaturamentoGeoData() {
    try {
      const result = await this.queryWithRetry('SELECT * FROM faturamento_geo WHERE id = 1');
      if (result.rows.length === 0) {
        return { previsto: [], medio: [], maximo: [] };
      }
      const row = result.rows[0];
      return {
        previsto: row.previsto || [],
        medio: row.medio || [],
        maximo: row.maximo || []
      };
    } catch (error) {
      console.error('Erro ao ler dados de faturamento GEO:', error);
      return null;
    }
  },

  async updateFaturamentoGeoData(faturamentoGeoData) {
    try {
      const result = await this.queryWithRetry(
        `UPDATE faturamento_geo SET
           previsto = $1,
           medio = $2,
           maximo = $3,
           updated_at = $4
         WHERE id = 1
         RETURNING *`,
        [
          faturamentoGeoData.previsto || new Array(12).fill(0),
          faturamentoGeoData.medio || new Array(12).fill(0),
          faturamentoGeoData.maximo || new Array(12).fill(0),
          new Date().toISOString()
        ]
      );
      return result.rows[0];
    } catch (error) {
      throw new Error('Erro ao salvar dados de faturamento GEO: ' + error.message);
    }
  },

  // Métodos para Faturamento PLAN
  async getFaturamentoPlanData() {
    try {
      const result = await this.queryWithRetry('SELECT * FROM faturamento_plan WHERE id = 1');
      if (result.rows.length === 0) {
        return { previsto: [], medio: [], maximo: [] };
      }
      const row = result.rows[0];
      return {
        previsto: row.previsto || [],
        medio: row.medio || [],
        maximo: row.maximo || []
      };
    } catch (error) {
      console.error('Erro ao ler dados de faturamento PLAN:', error);
      return null;
    }
  },

  async updateFaturamentoPlanData(faturamentoPlanData) {
    try {
      const result = await this.queryWithRetry(
        `UPDATE faturamento_plan SET
           previsto = $1,
           medio = $2,
           maximo = $3,
           updated_at = $4
         WHERE id = 1
         RETURNING *`,
        [
          faturamentoPlanData.previsto || new Array(12).fill(0),
          faturamentoPlanData.medio || new Array(12).fill(0),
          faturamentoPlanData.maximo || new Array(12).fill(0),
          new Date().toISOString()
        ]
      );
      return result.rows[0];
    } catch (error) {
      throw new Error('Erro ao salvar dados de faturamento PLAN: ' + error.message);
    }
  },

  // Métodos para Faturamento REG
  async getFaturamentoRegData() {
    try {
      const result = await this.queryWithRetry('SELECT * FROM faturamento_reg WHERE id = 1');
      if (result.rows.length === 0) {
        return { previsto: [], medio: [], maximo: [] };
      }
      const row = result.rows[0];
      return {
        previsto: row.previsto || [],
        medio: row.medio || [],
        maximo: row.maximo || []
      };
    } catch (error) {
      console.error('Erro ao ler dados de faturamento REG:', error);
      return null;
    }
  },

  async updateFaturamentoRegData(faturamentoRegData) {
    try {
      const result = await this.queryWithRetry(
        `UPDATE faturamento_reg SET
           previsto = $1,
           medio = $2,
           maximo = $3,
           updated_at = $4
         WHERE id = 1
         RETURNING *`,
        [
          faturamentoRegData.previsto || new Array(12).fill(0),
          faturamentoRegData.medio || new Array(12).fill(0),
          faturamentoRegData.maximo || new Array(12).fill(0),
          new Date().toISOString()
        ]
      );
      return result.rows[0];
    } catch (error) {
      throw new Error('Erro ao salvar dados de faturamento REG: ' + error.message);
    }
  },

  // Métodos para Faturamento NN
  async getFaturamentoNnData() {
    try {
      const result = await this.queryWithRetry('SELECT * FROM faturamento_nn WHERE id = 1');
      if (result.rows.length === 0) {
        return { previsto: [], medio: [], maximo: [] };
      }
      const row = result.rows[0];
      return {
        previsto: row.previsto || [],
        medio: row.medio || [],
        maximo: row.maximo || []
      };
    } catch (error) {
      console.error('Erro ao ler dados de faturamento NN:', error);
      return null;
    }
  },

  async updateFaturamentoNnData(faturamentoNnData) {
    try {
      const result = await this.queryWithRetry(
        `UPDATE faturamento_nn SET
           previsto = $1,
           medio = $2,
           maximo = $3,
           updated_at = $4
         WHERE id = 1
         RETURNING *`,
        [
          faturamentoNnData.previsto || new Array(12).fill(0),
          faturamentoNnData.medio || new Array(12).fill(0),
          faturamentoNnData.maximo || new Array(12).fill(0),
          new Date().toISOString()
        ]
      );
      return result.rows[0];
    } catch (error) {
      throw new Error('Erro ao salvar dados de faturamento NN: ' + error.message);
    }
  },

  // Métodos para Faturamento Total
  async getFaturamentoTotalData() {
    try {
      const result = await this.queryWithRetry('SELECT * FROM faturamento_total WHERE id = 1');
      if (result.rows.length === 0) {
        return { previsto: [], medio: [], maximo: [] };
      }
      const row = result.rows[0];
      return {
        previsto: row.previsto || [],
        medio: row.medio || [],
        maximo: row.maximo || []
      };
    } catch (error) {
      console.error('Erro ao ler dados de faturamento total:', error);
      return null;
    }
  },

  async updateFaturamentoTotalData(faturamentoTotalData) {
    try {
      const result = await this.queryWithRetry(
        `UPDATE faturamento_total SET
           previsto = $1,
           medio = $2,
           maximo = $3,
           updated_at = $4
         WHERE id = 1
         RETURNING *`,
        [
          faturamentoTotalData.previsto || new Array(12).fill(0),
          faturamentoTotalData.medio || new Array(12).fill(0),
          faturamentoTotalData.maximo || new Array(12).fill(0),
          new Date().toISOString()
        ]
      );
      return result.rows[0];
    } catch (error) {
      throw new Error('Erro ao salvar dados de faturamento total: ' + error.message);
    }
  },

  // Métodos para Resultado
  async getResultadoData() {
    try {
      const result = await this.queryWithRetry('SELECT * FROM resultado WHERE id = 1');
      if (result.rows.length === 0) {
        return { previsto: [], medio: [], maximo: [] };
      }
      const row = result.rows[0];
      return {
        previsto: row.previsto || [],
        medio: row.medio || [],
        maximo: row.maximo || []
      };
    } catch (error) {
      console.error('Erro ao ler dados de resultado:', error);
      return null;
    }
  },

  async updateResultadoData(resultadoData) {
    try {
      const result = await this.queryWithRetry(
        `UPDATE resultado SET
           previsto = $1,
           medio = $2,
           maximo = $3,
           updated_at = $4
         WHERE id = 1
         RETURNING *`,
        [
          resultadoData.previsto || new Array(12).fill(0),
          resultadoData.medio || new Array(12).fill(0),
          resultadoData.maximo || new Array(12).fill(0),
          new Date().toISOString()
        ]
      );
      return result.rows[0];
    } catch (error) {
      throw new Error('Erro ao salvar dados de resultado: ' + error.message);
    }
  },

  // Limpar todos os dados de projeção
  async clearAllProjectionData() {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      
      const defaultArray = new Array(12).fill(0);
      const defaultGrowth = JSON.stringify({ minimo: 0, medio: 0, maximo: 0 });
      const defaultMktComponents = JSON.stringify({ trafego: defaultArray, socialMedia: defaultArray, producaoConteudo: defaultArray });
      
      await client.query(
        `UPDATE projection SET
           despesas_variaveis = $1,
           despesas_fixas = $1,
           investimentos = $1,
           mkt = $1,
           faturamento_reurb = $1,
           faturamento_geo = $1,
           faturamento_plan = $1,
           faturamento_reg = $1,
           faturamento_nn = $1,
           mkt_components = $2,
           growth = $3,
           updated_at = $4
         WHERE id = 1`,
        [defaultArray, defaultMktComponents, defaultGrowth, new Date().toISOString()]
      );
      
      await client.query(`UPDATE fixed_expenses SET previsto = $1, media = $1, maximo = $1, updated_at = $2 WHERE id = 1`, [defaultArray, new Date().toISOString()]);
      await client.query(`UPDATE variable_expenses SET previsto = $1, medio = $1, maximo = $1, updated_at = $2 WHERE id = 1`, [defaultArray, new Date().toISOString()]);
      await client.query(`UPDATE mkt SET previsto = $1, medio = $1, maximo = $1, updated_at = $2 WHERE id = 1`, [defaultArray, new Date().toISOString()]);
      await client.query(`UPDATE budget SET previsto = $1, medio = $1, maximo = $1, updated_at = $2 WHERE id = 1`, [defaultArray, new Date().toISOString()]);
      await client.query(`UPDATE investments SET previsto = $1, medio = $1, maximo = $1, updated_at = $2 WHERE id = 1`, [defaultArray, new Date().toISOString()]);
      await client.query(`UPDATE faturamento_reurb SET previsto = $1, medio = $1, maximo = $1, updated_at = $2 WHERE id = 1`, [defaultArray, new Date().toISOString()]);
      await client.query(`UPDATE faturamento_geo SET previsto = $1, medio = $1, maximo = $1, updated_at = $2 WHERE id = 1`, [defaultArray, new Date().toISOString()]);
      await client.query(`UPDATE faturamento_plan SET previsto = $1, medio = $1, maximo = $1, updated_at = $2 WHERE id = 1`, [defaultArray, new Date().toISOString()]);
      await client.query(`UPDATE faturamento_reg SET previsto = $1, medio = $1, maximo = $1, updated_at = $2 WHERE id = 1`, [defaultArray, new Date().toISOString()]);
      await client.query(`UPDATE faturamento_nn SET previsto = $1, medio = $1, maximo = $1, updated_at = $2 WHERE id = 1`, [defaultArray, new Date().toISOString()]);
      await client.query(`UPDATE faturamento_total SET previsto = $1, medio = $1, maximo = $1, updated_at = $2 WHERE id = 1`, [defaultArray, new Date().toISOString()]);
      await client.query(`UPDATE resultado SET previsto = $1, medio = $1, maximo = $1, updated_at = $2 WHERE id = 1`, [defaultArray, new Date().toISOString()]);
      
      await client.query('COMMIT');
      return true;
    } catch (error) {
      await client.query('ROLLBACK');
      throw new Error('Erro ao limpar dados de projeção: ' + error.message);
    } finally {
      client.release();
    }
  },

  // Métodos de backup (stub - implementar conforme necessário)
  async createAutoBackup(tableName) {
    // Implementar lógica de backup se necessário
    console.log(`Backup criado para tabela: ${tableName}`);
  },

  async restoreFromBackup(tableName, backupId) {
    // Implementar lógica de restore se necessário
    console.log(`Restaurando backup ${backupId} para tabela: ${tableName}`);
  },

};
