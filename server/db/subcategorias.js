// ═══════════════════════════════════════════════════════════════════════════
// server/db/subcategorias.js
// Domínio Subcategorias do data-layer (#15 A): CRUD das subcategorias de
// transações. Colado no Database.prototype via Object.assign. Só usa this.*.
// ═══════════════════════════════════════════════════════════════════════════
'use strict';

module.exports = {
  // Métodos para Subcategorias
  async getAllSubcategories() {
    try {
      const result = await this.queryWithRetry('SELECT name FROM subcategories ORDER BY name');
      return result.rows.map(row => row.name);
    } catch (error) {
      console.error('Erro ao ler subcategorias:', error);
      return [];
    }
  },

  async saveSubcategory(name) {
    try {
      await this.queryWithRetry(
        'INSERT INTO subcategories (name, created_at) VALUES ($1, $2) ON CONFLICT (name) DO NOTHING',
        [name, new Date().toISOString()]
      );
      return name;
    } catch (error) {
      console.error('Erro ao salvar subcategoria:', error);
      throw error;
    }
  },

  // Remove a subcategoria da lista de opções selecionáveis. A coluna
  // `subcategory` em transactions é texto livre (sem FK), então transações já
  // cadastradas mantêm o valor — apenas deixa de aparecer nos dropdowns.
  async deleteSubcategory(name) {
    try {
      const result = await this.queryWithRetry(
        'DELETE FROM subcategories WHERE name = $1',
        [name]
      );
      return result.rowCount > 0;
    } catch (error) {
      console.error('Erro ao deletar subcategoria:', error);
      throw error;
    }
  },

  // Lista regras que referenciam a subcategoria em set_subcategory.
  // Usado para bloquear a exclusão enquanto houver regra dependente.
  async getRulesUsingSubcategory(name) {
    try {
      const result = await this.queryWithRetry(
        'SELECT id, name FROM transaction_rules WHERE set_subcategory = $1 ORDER BY name',
        [name]
      );
      return result.rows;
    } catch (error) {
      console.error('Erro ao listar regras da subcategoria:', error);
      throw error;
    }
  },

  // Renomeia uma subcategoria e propaga o novo nome para tudo que a referencia
  // por texto: transações (subcategory + original_subcategory) e regras
  // (set_subcategory). Atômico — ou tudo muda, ou nada.
  // Retorna: 'ok' | 'not_found' | 'conflict'.
  async renameSubcategory(oldName, newName) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      const exists = await client.query('SELECT 1 FROM subcategories WHERE name = $1', [oldName]);
      if (exists.rowCount === 0) {
        await client.query('ROLLBACK');
        return 'not_found';
      }

      // Nome novo já em uso por outra subcategoria → conflito.
      const clash = await client.query('SELECT 1 FROM subcategories WHERE name = $1', [newName]);
      if (clash.rowCount > 0) {
        await client.query('ROLLBACK');
        return 'conflict';
      }

      await client.query('UPDATE subcategories SET name = $1 WHERE name = $2', [newName, oldName]);
      await client.query('UPDATE transactions SET subcategory = $1 WHERE subcategory = $2', [newName, oldName]);
      await client.query('UPDATE transactions SET original_subcategory = $1 WHERE original_subcategory = $2', [newName, oldName]);
      await client.query('UPDATE transaction_rules SET set_subcategory = $1 WHERE set_subcategory = $2', [newName, oldName]);

      await client.query('COMMIT');
      return 'ok';
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Erro ao renomear subcategoria:', error);
      throw error;
    } finally {
      client.release();
    }
  },

};
