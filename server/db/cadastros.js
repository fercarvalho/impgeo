// ═══════════════════════════════════════════════════════════════════════════
// server/db/cadastros.js
// Domínio Cadastros do data-layer (#15 A): produtos, clientes, projetos e
// serviços (CRUD dos cadastros-base compartilhados). Colado no
// Database.prototype via Object.assign. Só usa this.* — sem símbolos de módulo.
// ═══════════════════════════════════════════════════════════════════════════
'use strict';

module.exports = {
  // Métodos para Produtos
  async getAllProducts() {
    try {
      const result = await this.queryWithRetry('SELECT * FROM products ORDER BY name');
      return result.rows;
    } catch (error) {
      console.error('Erro ao ler produtos:', error);
      return [];
    }
  },

  async saveProduct(product) {
    try {
      const id = this.generateId();
      const result = await this.queryWithRetry(
        `INSERT INTO products (id, name, category, price, cost, stock, sold, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         RETURNING *`,
        [
          id,
          product.name || null,
          product.category || null,
          product.price || 0,
          product.cost || 0,
          product.stock || 0,
          product.sold || 0,
          new Date().toISOString(),
          new Date().toISOString()
        ]
      );
      return result.rows[0];
    } catch (error) {
      console.error('Erro ao salvar produto:', error);
      throw error;
    }
  },

  async updateProduct(id, updatedProduct) {
    try {
      const result = await this.queryWithRetry(
        `UPDATE products 
         SET name = $1, category = $2, price = $3, cost = $4, stock = $5, sold = $6, updated_at = $7
         WHERE id = $8
         RETURNING *`,
        [
          updatedProduct.name || null,
          updatedProduct.category || null,
          updatedProduct.price || 0,
          updatedProduct.cost || 0,
          updatedProduct.stock || 0,
          updatedProduct.sold || 0,
          new Date().toISOString(),
          id
        ]
      );
      if (result.rows.length === 0) {
        throw new Error('Produto não encontrado');
      }
      return result.rows[0];
    } catch (error) {
      console.error('Erro ao atualizar produto:', error);
      throw error;
    }
  },

  async deleteProduct(id) {
    try {
      const result = await this.queryWithRetry(
        'DELETE FROM products WHERE id = $1 RETURNING id',
        [id]
      );
      if (result.rows.length === 0) {
        throw new Error('Produto não encontrado');
      }
      return true;
    } catch (error) {
      console.error('Erro ao deletar produto:', error);
      throw error;
    }
  },

  async deleteMultipleProducts(ids) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      for (const id of ids) {
        await client.query('DELETE FROM products WHERE id = $1', [id]);
      }
      await client.query('COMMIT');
      return true;
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Erro ao deletar múltiplos produtos:', error);
      throw error;
    } finally {
      client.release();
    }
  },

  // Métodos para Clientes
  async getAllClients() {
    try {
      const result = await this.queryWithRetry('SELECT * FROM clients ORDER BY name');
      return result.rows;
    } catch (error) {
      console.error('Erro ao ler clientes:', error);
      return [];
    }
  },

  // Helpers do padrão moderno (alinha com tc_users): nome separado + address JSONB.
  _composeClientName(c) {
    const composed = [c.firstName, c.lastName].filter(Boolean).join(' ').trim();
    return composed || c.name || null;
  },
  _normalizeAddressJson(addr) {
    if (addr == null) return null;
    if (typeof addr === 'string') {
      const s = addr.trim();
      if (!s) return null;
      try { return JSON.stringify(JSON.parse(s)); } catch { return JSON.stringify({ street: s }); }
    }
    if (typeof addr === 'object') return JSON.stringify(addr);
    return null;
  },

  async saveClient(client) {
    try {
      const id = this.generateId();
      const result = await this.queryWithRetry(
        `INSERT INTO clients (id, name, first_name, last_name, email, phone, company, cpf, cnpj, address, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11, $12)
         RETURNING *`,
        [
          id,
          this._composeClientName(client),
          client.firstName || null,
          client.lastName || null,
          client.email || null,
          client.phone || null,
          client.company || null,
          client.cpf || null,
          client.cnpj || null,
          this._normalizeAddressJson(client.address),
          new Date().toISOString(),
          new Date().toISOString()
        ]
      );
      return result.rows[0];
    } catch (error) {
      console.error('Erro ao salvar cliente:', error);
      throw error;
    }
  },

  async updateClient(id, updatedClient) {
    try {
      const result = await this.queryWithRetry(
        `UPDATE clients
         SET name = $1, first_name = $2, last_name = $3, email = $4, phone = $5,
             company = $6, cpf = $7, cnpj = $8, address = $9::jsonb, updated_at = $10
         WHERE id = $11
         RETURNING *`,
        [
          this._composeClientName(updatedClient),
          updatedClient.firstName || null,
          updatedClient.lastName || null,
          updatedClient.email || null,
          updatedClient.phone || null,
          updatedClient.company || null,
          updatedClient.cpf || null,
          updatedClient.cnpj || null,
          this._normalizeAddressJson(updatedClient.address),
          new Date().toISOString(),
          id
        ]
      );
      if (result.rows.length === 0) {
        throw new Error('Cliente não encontrado');
      }
      return result.rows[0];
    } catch (error) {
      console.error('Erro ao atualizar cliente:', error);
      throw error;
    }
  },

  async deleteClient(id) {
    try {
      const result = await this.queryWithRetry(
        'DELETE FROM clients WHERE id = $1 RETURNING id',
        [id]
      );
      if (result.rows.length === 0) {
        throw new Error('Cliente não encontrado');
      }
      return true;
    } catch (error) {
      console.error('Erro ao deletar cliente:', error);
      throw error;
    }
  },

  async deleteMultipleClients(ids) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      for (const id of ids) {
        await client.query('DELETE FROM clients WHERE id = $1', [id]);
      }
      await client.query('COMMIT');
      return true;
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Erro ao deletar múltiplos clientes:', error);
      throw error;
    } finally {
      client.release();
    }
  },

  // Métodos para Projetos
  async getAllProjects() {
    try {
      const result = await this.queryWithRetry('SELECT * FROM projects ORDER BY name');
      return result.rows;
    } catch (error) {
      console.error('Erro ao ler projetos:', error);
      return [];
    }
  },

  async saveProject(projectData) {
    try {
      const id = this.generateId();
      const result = await this.queryWithRetry(
        `INSERT INTO projects (id, name, client, status, description, manager_user_id, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING *`,
        [
          id,
          projectData.name || null,
          projectData.client || null,
          projectData.status || null,
          projectData.description || null,
          projectData.managerUserId || null,
          new Date().toISOString(),
          new Date().toISOString()
        ]
      );
      return result.rows[0];
    } catch (error) {
      throw new Error('Erro ao salvar projeto: ' + error.message);
    }
  },

  async updateProject(id, updatedData) {
    try {
      // manager_user_id só é tocado quando a chave vier no payload (permite
      // definir um responsável OU desvincular passando null/'').
      const setsManager = Object.prototype.hasOwnProperty.call(updatedData, 'managerUserId');
      const managerVal = updatedData.managerUserId || null;
      const result = await this.queryWithRetry(
        `UPDATE projects
         SET name = $1, client = $2, status = $3, description = $4, updated_at = $5${setsManager ? ', manager_user_id = $7' : ''}
         WHERE id = $6
         RETURNING *`,
        setsManager
          ? [updatedData.name || null, updatedData.client || null, updatedData.status || null, updatedData.description || null, new Date().toISOString(), id, managerVal]
          : [updatedData.name || null, updatedData.client || null, updatedData.status || null, updatedData.description || null, new Date().toISOString(), id]
      );
      if (result.rows.length === 0) {
        throw new Error('Projeto não encontrado');
      }
      return result.rows[0];
    } catch (error) {
      throw new Error('Erro ao atualizar projeto: ' + error.message);
    }
  },

  async deleteProject(id) {
    try {
      const result = await this.queryWithRetry(
        'DELETE FROM projects WHERE id = $1 RETURNING id',
        [id]
      );
      if (result.rows.length === 0) {
        throw new Error('Projeto não encontrado');
      }
      return true;
    } catch (error) {
      throw new Error('Erro ao excluir projeto: ' + error.message);
    }
  },

  async deleteMultipleProjects(ids) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      for (const id of ids) {
        await client.query('DELETE FROM projects WHERE id = $1', [id]);
      }
      await client.query('COMMIT');
      return true;
    } catch (error) {
      await client.query('ROLLBACK');
      throw new Error('Erro ao excluir projetos: ' + error.message);
    } finally {
      client.release();
    }
  },

  // Métodos para Serviços
  async getAllServices() {
    try {
      const result = await this.queryWithRetry('SELECT * FROM services ORDER BY name');
      return result.rows;
    } catch (error) {
      console.error('Erro ao ler serviços:', error);
      return [];
    }
  },

  async saveService(serviceData) {
    try {
      const id = this.generateId();
      const status = serviceData.status === 'inativo' ? 'inativo' : 'ativo';
      const result = await this.queryWithRetry(
        `INSERT INTO services (id, name, description, price, status, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING *`,
        [
          id,
          serviceData.name || null,
          serviceData.description || null,
          serviceData.price || 0,
          status,
          new Date().toISOString(),
          new Date().toISOString()
        ]
      );
      return result.rows[0];
    } catch (error) {
      throw new Error('Erro ao salvar serviço: ' + error.message);
    }
  },

  async updateService(id, updatedData) {
    try {
      // status só é alterado se vier no payload (preserva o atual senão).
      const result = await this.queryWithRetry(
        `UPDATE services
         SET name = $1, description = $2, price = $3,
             status = COALESCE($4, status), updated_at = $5
         WHERE id = $6
         RETURNING *`,
        [
          updatedData.name || null,
          updatedData.description || null,
          updatedData.price || 0,
          (updatedData.status === 'ativo' || updatedData.status === 'inativo') ? updatedData.status : null,
          new Date().toISOString(),
          id
        ]
      );
      if (result.rows.length === 0) {
        throw new Error('Serviço não encontrado');
      }
      return result.rows[0];
    } catch (error) {
      throw new Error('Erro ao atualizar serviço: ' + error.message);
    }
  },

  async deleteService(id) {
    try {
      const result = await this.queryWithRetry(
        'DELETE FROM services WHERE id = $1 RETURNING id',
        [id]
      );
      if (result.rows.length === 0) {
        throw new Error('Serviço não encontrado');
      }
      return true;
    } catch (error) {
      throw new Error('Erro ao excluir serviço: ' + error.message);
    }
  },

};
