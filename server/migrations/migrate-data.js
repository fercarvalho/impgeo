require('dotenv').config();
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT) || 5432,
  database: process.env.DB_NAME || 'impgeo',
  user: process.env.DB_USER || 'fernandocarvalho',
  password: process.env.DB_PASSWORD || '',
});

const dbPath = path.join(__dirname, '..', 'database');
const backupDir = path.join(dbPath, 'backup-json', new Date().toISOString().replace(/:/g, '-'));

function formatCodImovel(value) {
  const digits = String(value ?? '').replace(/\D/g, '');
  if (!digits) return null;
  return digits.padStart(3, '0');
}

// Função para criar backup
function backupFile(filePath, backupDir) {
  if (!fs.existsSync(filePath)) {
    return;
  }
  
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }
  
  const fileName = path.basename(filePath);
  const backupPath = path.join(backupDir, fileName);
  fs.copyFileSync(filePath, backupPath);
  console.log(`✅ Backup criado: ${fileName}`);
}

// Função para migrar entidades core
async function migrateCoreEntities() {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    console.log('\n📦 Migrando entidades core...\n');
    
    // Migrar Transactions
    const transactionsFile = path.join(dbPath, 'transactions.json');
    if (fs.existsSync(transactionsFile)) {
      backupFile(transactionsFile, backupDir);
      const transactions = JSON.parse(fs.readFileSync(transactionsFile, 'utf8'));
      
      for (const transaction of transactions) {
        await client.query(
          `INSERT INTO transactions (id, date, description, value, type, category, subcategory, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
           ON CONFLICT (id) DO NOTHING`,
          [
            transaction.id,
            transaction.date || null,
            transaction.description || null,
            transaction.value || 0,
            transaction.type || null,
            transaction.category || null,
            transaction.subcategory || null,
            transaction.createdAt || new Date().toISOString(),
            transaction.updatedAt || new Date().toISOString()
          ]
        );
      }
      console.log(`✅ ${transactions.length} transações migradas`);
    }
    
    // Migrar Products
    const productsFile = path.join(dbPath, 'products.json');
    if (fs.existsSync(productsFile)) {
      backupFile(productsFile, backupDir);
      const products = JSON.parse(fs.readFileSync(productsFile, 'utf8'));
      
      for (const product of products) {
        await client.query(
          `INSERT INTO products (id, name, category, price, cost, stock, sold, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
           ON CONFLICT (id) DO NOTHING`,
          [
            product.id,
            product.name || null,
            product.category || null,
            product.price || 0,
            product.cost || 0,
            product.stock || 0,
            product.sold || 0,
            product.createdAt || new Date().toISOString(),
            product.updatedAt || new Date().toISOString()
          ]
        );
      }
      console.log(`✅ ${products.length} produtos migrados`);
    }
    
    // Migrar Clients
    const clientsFile = path.join(dbPath, 'clients.json');
    if (fs.existsSync(clientsFile)) {
      backupFile(clientsFile, backupDir);
      const clients = JSON.parse(fs.readFileSync(clientsFile, 'utf8'));
      
      for (const row of clients) {
        await client.query(
          `INSERT INTO clients (id, name, email, phone, company, address, city, state, zip_code, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
           ON CONFLICT (id) DO NOTHING`,
          [
            row.id,
            row.name || null,
            row.email || null,
            row.phone || null,
            row.company || null,
            row.address || null,
            row.city || null,
            row.state || null,
            row.zipCode || null,
            row.createdAt || new Date().toISOString(),
            row.updatedAt || new Date().toISOString()
          ]
        );
      }
      console.log(`✅ ${clients.length} clientes migrados`);
    }
    
    // Migrar Projects
    const projectsFile = path.join(dbPath, 'projects.json');
    if (fs.existsSync(projectsFile)) {
      backupFile(projectsFile, backupDir);
      const projects = JSON.parse(fs.readFileSync(projectsFile, 'utf8'));
      
      for (const project of projects) {
        await client.query(
          `INSERT INTO projects (id, name, client, status, description, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           ON CONFLICT (id) DO NOTHING`,
          [
            project.id,
            project.name || null,
            project.client || null,
            project.status || null,
            project.description || null,
            project.createdAt || new Date().toISOString(),
            project.updatedAt || new Date().toISOString()
          ]
        );
      }
      console.log(`✅ ${projects.length} projetos migrados`);
    }
    
    // Migrar Services
    const servicesFile = path.join(dbPath, 'services.json');
    if (fs.existsSync(servicesFile)) {
      backupFile(servicesFile, backupDir);
      const services = JSON.parse(fs.readFileSync(servicesFile, 'utf8'));
      
      for (const service of services) {
        await client.query(
          `INSERT INTO services (id, name, description, price, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6)
           ON CONFLICT (id) DO NOTHING`,
          [
            service.id,
            service.name || null,
            service.description || null,
            service.price || 0,
            service.createdAt || new Date().toISOString(),
            service.updatedAt || new Date().toISOString()
          ]
        );
      }
      console.log(`✅ ${services.length} serviços migrados`);
    }
    
    // Migrar Acompanhamentos
    const acompanhamentosFile = path.join(dbPath, 'acompanhamentos.json');
    if (fs.existsSync(acompanhamentosFile)) {
      backupFile(acompanhamentosFile, backupDir);
      const acompanhamentos = JSON.parse(fs.readFileSync(acompanhamentosFile, 'utf8'));
      
      for (const acompanhamento of acompanhamentos) {
        await client.query(
          `INSERT INTO acompanhamentos (
             id, cod_imovel, imovel, municipio, mapa_url, matriculas, n_incra_ccir, car, status_car, itr,
             geo_certificacao, geo_registro, area_total, reserva_legal, cultura1, area_cultura1,
             cultura2, area_cultura2, outros, area_outros, app_codigo_florestal, app_vegetada,
             app_nao_vegetada, remanescente_florestal, endereco, status, observacoes, created_at, updated_at
           )
           VALUES (
             $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
             $11, $12, $13, $14, $15, $16, $17, $18, $19, $20,
             $21, $22, $23, $24, $25, $26, $27, $28, $29
           )
           ON CONFLICT (id) DO UPDATE SET
             cod_imovel = EXCLUDED.cod_imovel,
             imovel = EXCLUDED.imovel,
             municipio = EXCLUDED.municipio,
             mapa_url = EXCLUDED.mapa_url,
             matriculas = EXCLUDED.matriculas,
             n_incra_ccir = EXCLUDED.n_incra_ccir,
             car = EXCLUDED.car,
             status_car = EXCLUDED.status_car,
             itr = EXCLUDED.itr,
             geo_certificacao = EXCLUDED.geo_certificacao,
             geo_registro = EXCLUDED.geo_registro,
             area_total = EXCLUDED.area_total,
             reserva_legal = EXCLUDED.reserva_legal,
             cultura1 = EXCLUDED.cultura1,
             area_cultura1 = EXCLUDED.area_cultura1,
             cultura2 = EXCLUDED.cultura2,
             area_cultura2 = EXCLUDED.area_cultura2,
             outros = EXCLUDED.outros,
             area_outros = EXCLUDED.area_outros,
             app_codigo_florestal = EXCLUDED.app_codigo_florestal,
             app_vegetada = EXCLUDED.app_vegetada,
             app_nao_vegetada = EXCLUDED.app_nao_vegetada,
             remanescente_florestal = EXCLUDED.remanescente_florestal,
             endereco = EXCLUDED.endereco,
             status = EXCLUDED.status,
             observacoes = EXCLUDED.observacoes,
             updated_at = EXCLUDED.updated_at`,
          [
            acompanhamento.id,
            formatCodImovel(acompanhamento.cod_imovel || acompanhamento.codImovel),
            acompanhamento.imovel || acompanhamento.endereco || null,
            acompanhamento.municipio || null,
            acompanhamento.mapa_url || acompanhamento.mapaUrl || null,
            acompanhamento.matriculas || null,
            acompanhamento.n_incra_ccir || acompanhamento.nIncraCcir || null,
            acompanhamento.car || null,
            acompanhamento.status_car || acompanhamento.statusCar || acompanhamento.status || null,
            acompanhamento.itr || null,
            acompanhamento.geo_certificacao || acompanhamento.geoCertificacao || 'NÃO',
            acompanhamento.geo_registro || acompanhamento.geoRegistro || 'NÃO',
            acompanhamento.area_total ?? acompanhamento.areaTotal ?? 0,
            acompanhamento.reserva_legal ?? acompanhamento.reservaLegal ?? 0,
            acompanhamento.cultura1 || null,
            acompanhamento.area_cultura1 ?? acompanhamento.areaCultura1 ?? 0,
            acompanhamento.cultura2 || null,
            acompanhamento.area_cultura2 ?? acompanhamento.areaCultura2 ?? 0,
            acompanhamento.outros || null,
            acompanhamento.area_outros ?? acompanhamento.areaOutros ?? 0,
            acompanhamento.app_codigo_florestal ?? acompanhamento.appCodigoFlorestal ?? 0,
            acompanhamento.app_vegetada ?? acompanhamento.appVegetada ?? 0,
            acompanhamento.app_nao_vegetada ?? acompanhamento.appNaoVegetada ?? 0,
            acompanhamento.remanescente_florestal ?? acompanhamento.remanescenteFlorestal ?? 0,
            acompanhamento.endereco || acompanhamento.imovel || null,
            acompanhamento.status || acompanhamento.statusCar || null,
            acompanhamento.observacoes || null,
            acompanhamento.createdAt || new Date().toISOString(),
            acompanhamento.updatedAt || new Date().toISOString()
          ]
        );
      }
      console.log(`✅ ${acompanhamentos.length} acompanhamentos migrados`);
    }
    
    // Migrar Share Links
    const shareLinksFile = path.join(dbPath, 'shareLinks.json');
    if (fs.existsSync(shareLinksFile)) {
      backupFile(shareLinksFile, backupDir);
      const shareLinks = JSON.parse(fs.readFileSync(shareLinksFile, 'utf8'));
      
      for (const link of shareLinks) {
        await client.query(
          `INSERT INTO share_links (token, name, password_hash, expires_at, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6)
           ON CONFLICT (token) DO NOTHING`,
          [
            link.token,
            link.name || null,
            link.passwordHash || null,
            link.expiresAt || null,
            link.createdAt || new Date().toISOString(),
            link.updatedAt || new Date().toISOString()
          ]
        );
      }
      console.log(`✅ ${shareLinks.length} share links migrados`);
    }
    
    // Migrar Users
    const usersFile = path.join(dbPath, 'users.json');
    if (fs.existsSync(usersFile)) {
      backupFile(usersFile, backupDir);
      const users = JSON.parse(fs.readFileSync(usersFile, 'utf8'));
      
      for (const user of users) {
        await client.query(
          `INSERT INTO users (id, username, password, role, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6)
           ON CONFLICT (id) DO NOTHING`,
          [
            user.id,
            user.username || null,
            user.password || null,
            user.role || 'user',
            user.createdAt || new Date().toISOString(),
            user.updatedAt || new Date().toISOString()
          ]
        );
      }
      console.log(`✅ ${users.length} usuários migrados`);
    }
    
    // Migrar Subcategories
    const subcategoriesFile = path.join(dbPath, 'subcategories.json');
    if (fs.existsSync(subcategoriesFile)) {
      backupFile(subcategoriesFile, backupDir);
      const subcategories = JSON.parse(fs.readFileSync(subcategoriesFile, 'utf8'));
      
      for (const subcategory of subcategories) {
        await client.query(
          `INSERT INTO subcategories (name, created_at)
           VALUES ($1, $2)
           ON CONFLICT (name) DO NOTHING`,
          [
            subcategory,
            new Date().toISOString()
          ]
        );
      }
      console.log(`✅ ${subcategories.length} subcategorias migradas`);
    }
    
    await client.query('COMMIT');
    console.log('\n✅ Migração de entidades core concluída!\n');
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Erro na migração de entidades core:', error);
    throw error;
  } finally {
    client.release();
  }
}

// Função para migrar dados de projeção
async function migrateProjectionData() {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    console.log('\n📊 Migrando dados de projeção...\n');
    
    // Migrar Projection
    const projectionFile = path.join(dbPath, 'projection.json');
    if (fs.existsSync(projectionFile)) {
      backupFile(projectionFile, backupDir);
      const projection = JSON.parse(fs.readFileSync(projectionFile, 'utf8'));
      
      await client.query(
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
         WHERE id = 1`,
        [
          projection.despesasVariaveis || new Array(12).fill(0),
          projection.despesasFixas || new Array(12).fill(0),
          projection.investimentos || new Array(12).fill(0),
          projection.mkt || new Array(12).fill(0),
          projection.faturamentoReurb || new Array(12).fill(0),
          projection.faturamentoGeo || new Array(12).fill(0),
          projection.faturamentoPlan || new Array(12).fill(0),
          projection.faturamentoReg || new Array(12).fill(0),
          projection.faturamentoNn || new Array(12).fill(0),
          JSON.stringify(projection.mktComponents || { trafego: [], socialMedia: [], producaoConteudo: [] }),
          JSON.stringify(projection.growth || { minimo: 0, medio: 0, maximo: 0 }),
          projection.updatedAt || new Date().toISOString()
        ]
      );
      console.log('✅ Dados de projection migrados');
    }
    
    // Função auxiliar para migrar tabelas singleton
    const migrateSingletonTable = async (tableName, filePath, fields) => {
      if (!fs.existsSync(filePath)) {
        return;
      }
      
      backupFile(filePath, backupDir);
      const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      
      const values = fields.map(field => {
        if (field === 'previsto' || field === 'medio' || field === 'media' || field === 'maximo') {
          return data[field] || new Array(12).fill(0);
        }
        return data[field] || null;
      });
      
      const setClause = fields.map((field, index) => {
        const dbField = field === 'media' ? 'media' : field === 'medio' ? 'medio' : field;
        return `${dbField} = $${index + 1}`;
      }).join(', ') + ', updated_at = $' + (fields.length + 1);
      
      values.push(data.updatedAt || new Date().toISOString());
      
      await client.query(
        `UPDATE ${tableName} SET ${setClause} WHERE id = 1`,
        values
      );
      
      console.log(`✅ Dados de ${tableName} migrados`);
    };
    
    // Migrar tabelas singleton
    await migrateSingletonTable('fixed_expenses', path.join(dbPath, 'fixedExpenses.json'), ['previsto', 'media', 'maximo']);
    await migrateSingletonTable('variable_expenses', path.join(dbPath, 'variableExpenses.json'), ['previsto', 'medio', 'maximo']);
    await migrateSingletonTable('mkt', path.join(dbPath, 'mkt.json'), ['previsto', 'medio', 'maximo']);
    await migrateSingletonTable('budget', path.join(dbPath, 'budget.json'), ['previsto', 'medio', 'maximo']);
    await migrateSingletonTable('investments', path.join(dbPath, 'investments.json'), ['previsto', 'medio', 'maximo']);
    await migrateSingletonTable('faturamento_reurb', path.join(dbPath, 'faturamentoReurb.json'), ['previsto', 'medio', 'maximo']);
    await migrateSingletonTable('faturamento_geo', path.join(dbPath, 'faturamentoGeo.json'), ['previsto', 'medio', 'maximo']);
    await migrateSingletonTable('faturamento_plan', path.join(dbPath, 'faturamentoPlan.json'), ['previsto', 'medio', 'maximo']);
    await migrateSingletonTable('faturamento_reg', path.join(dbPath, 'faturamentoReg.json'), ['previsto', 'medio', 'maximo']);
    await migrateSingletonTable('faturamento_nn', path.join(dbPath, 'faturamentoNn.json'), ['previsto', 'medio', 'maximo']);
    await migrateSingletonTable('faturamento_total', path.join(dbPath, 'faturamentoTotal.json'), ['previsto', 'medio', 'maximo']);
    await migrateSingletonTable('resultado', path.join(dbPath, 'resultado.json'), ['previsto', 'medio', 'maximo']);
    
    await client.query('COMMIT');
    console.log('\n✅ Migração de dados de projeção concluída!\n');
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Erro na migração de dados de projeção:', error);
    throw error;
  } finally {
    client.release();
  }
}

// Função principal
async function main() {
  try {
    console.log('🚀 Iniciando migração de dados JSON para PostgreSQL...\n');
    console.log(`📁 Backup será salvo em: ${backupDir}\n`);
    
    // Criar diretório de backup
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true });
    }
    
    // Migrar entidades core
    await migrateCoreEntities();
    
    // Migrar dados de projeção
    await migrateProjectionData();
    
    console.log('✅ Migração concluída com sucesso!');
    console.log(`📁 Backup salvo em: ${backupDir}`);
    
  } catch (error) {
    console.error('❌ Erro durante a migração:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

// Executar migração
main();
