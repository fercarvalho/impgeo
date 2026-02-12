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

async function validateMigration() {
  const client = await pool.connect();
  let errors = 0;
  let warnings = 0;
  
  try {
    console.log('🔍 Validando migração de dados...\n');
    
    // Validar entidades core
    const coreEntities = [
      { name: 'transactions', file: 'transactions.json' },
      { name: 'products', file: 'products.json' },
      { name: 'clients', file: 'clients.json' },
      { name: 'projects', file: 'projects.json' },
      { name: 'services', file: 'services.json' },
      { name: 'users', file: 'users.json' },
      { name: 'acompanhamentos', file: 'acompanhamentos.json' },
      { name: 'share_links', file: 'shareLinks.json' },
      { name: 'subcategories', file: 'subcategories.json' }
    ];
    
    console.log('📦 Validando entidades core...\n');
    
    for (const entity of coreEntities) {
      const filePath = path.join(dbPath, entity.file);
      
      if (!fs.existsSync(filePath)) {
        console.log(`⚠️  Arquivo ${entity.file} não encontrado, pulando...`);
        warnings++;
        continue;
      }
      
      const jsonData = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      const jsonCount = Array.isArray(jsonData) ? jsonData.length : 0;
      
      const result = await client.query(`SELECT COUNT(*) as count FROM ${entity.name}`);
      const dbCount = parseInt(result.rows[0].count);
      
      if (jsonCount === dbCount) {
        console.log(`✅ ${entity.name}: ${jsonCount} registros (JSON) = ${dbCount} registros (DB)`);
      } else {
        console.log(`❌ ${entity.name}: ${jsonCount} registros (JSON) ≠ ${dbCount} registros (DB)`);
        errors++;
      }
    }
    
    // Validar dados de projeção
    console.log('\n📊 Validando dados de projeção...\n');
    
    const projectionFiles = [
      { name: 'projection', file: 'projection.json', table: 'projection' },
      { name: 'fixed_expenses', file: 'fixedExpenses.json', table: 'fixed_expenses' },
      { name: 'variable_expenses', file: 'variableExpenses.json', table: 'variable_expenses' },
      { name: 'mkt', file: 'mkt.json', table: 'mkt' },
      { name: 'budget', file: 'budget.json', table: 'budget' },
      { name: 'investments', file: 'investments.json', table: 'investments' },
      { name: 'faturamento_reurb', file: 'faturamentoReurb.json', table: 'faturamento_reurb' },
      { name: 'faturamento_geo', file: 'faturamentoGeo.json', table: 'faturamento_geo' },
      { name: 'faturamento_plan', file: 'faturamentoPlan.json', table: 'faturamento_plan' },
      { name: 'faturamento_reg', file: 'faturamentoReg.json', table: 'faturamento_reg' },
      { name: 'faturamento_nn', file: 'faturamentoNn.json', table: 'faturamento_nn' },
      { name: 'faturamento_total', file: 'faturamentoTotal.json', table: 'faturamento_total' },
      { name: 'resultado', file: 'resultado.json', table: 'resultado' }
    ];
    
    for (const proj of projectionFiles) {
      const filePath = path.join(dbPath, proj.file);
      
      if (!fs.existsSync(filePath)) {
        console.log(`⚠️  Arquivo ${proj.file} não encontrado, pulando...`);
        warnings++;
        continue;
      }
      
      const jsonData = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      
      // Verificar se os arrays têm 12 elementos
      const arrayFields = ['previsto', 'medio', 'media', 'maximo'];
      let arrayValid = true;
      
      for (const field of arrayFields) {
        if (jsonData[field] && Array.isArray(jsonData[field])) {
          if (jsonData[field].length !== 12) {
            console.log(`⚠️  ${proj.name}.${field}: array tem ${jsonData[field].length} elementos (esperado 12)`);
            warnings++;
            arrayValid = false;
          }
        }
      }
      
      if (arrayValid) {
        console.log(`✅ ${proj.name}: estrutura válida`);
      }
    }
    
    // Validar projection.json especificamente
    const projectionFile = path.join(dbPath, 'projection.json');
    if (fs.existsSync(projectionFile)) {
      const projectionData = JSON.parse(fs.readFileSync(projectionFile, 'utf8'));
      
      // Verificar arrays de 12 elementos
      const arrayFields = ['despesasVariaveis', 'despesasFixas', 'investimentos', 'mkt', 
                          'faturamentoReurb', 'faturamentoGeo', 'faturamentoPlan', 
                          'faturamentoReg', 'faturamentoNn'];
      
      for (const field of arrayFields) {
        if (projectionData[field] && Array.isArray(projectionData[field])) {
          if (projectionData[field].length !== 12) {
            console.log(`⚠️  projection.${field}: array tem ${projectionData[field].length} elementos (esperado 12)`);
            warnings++;
          }
        }
      }
      
      // Verificar mktComponents
      if (projectionData.mktComponents) {
        const mktFields = ['trafego', 'socialMedia', 'producaoConteudo'];
        for (const field of mktFields) {
          if (projectionData.mktComponents[field] && Array.isArray(projectionData.mktComponents[field])) {
            if (projectionData.mktComponents[field].length !== 12) {
              console.log(`⚠️  projection.mktComponents.${field}: array tem ${projectionData.mktComponents[field].length} elementos (esperado 12)`);
              warnings++;
            }
          }
        }
      }
    }
    
    console.log('\n' + '='.repeat(50));
    console.log(`✅ Validação concluída!`);
    console.log(`   Erros: ${errors}`);
    console.log(`   Avisos: ${warnings}`);
    
    if (errors > 0) {
      console.log('\n❌ Migração possui erros que precisam ser corrigidos!');
      process.exit(1);
    } else if (warnings > 0) {
      console.log('\n⚠️  Migração concluída com avisos.');
      process.exit(0);
    } else {
      console.log('\n✅ Migração validada com sucesso!');
      process.exit(0);
    }
    
  } catch (error) {
    console.error('❌ Erro durante validação:', error);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

validateMigration();
