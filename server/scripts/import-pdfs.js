const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
const readline = require('readline');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT) || 5432,
  database: process.env.DB_NAME || 'impgeo',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || '',
});

const importarDir = path.join(__dirname, '../importar');
const uploadsDir = path.join(__dirname, '../uploads/documents');

const MODES = {
  1: { name: 'Matrículas', field: 'matriculas_dados', legacyField: 'matriculas', suffix: '_matr' },
  2: { name: 'CAR', field: 'car_url', legacyField: 'car', suffix: '_car' },
  3: { name: 'ITR - Declaração', field: 'itr_dados', legacyField: 'itr', subField: 'declaracaoUrl', suffix: '_itr_dec' },
  4: { name: 'ITR - Recibo', field: 'itr_dados', legacyField: 'itr', subField: 'reciboUrl', suffix: '_itr_rec' },
  5: { name: 'CCIR', field: 'ccir_dados', legacyField: 'n_incra_ccir', subField: 'url', suffix: '_ccir' }
};

async function askQuestion(query) {
  return new Promise(resolve => rl.question(query, resolve));
}

async function run() {
  console.log('📦 IMPGEO - Script de Importação Automática (Versão Pro)');
  console.log('-------------------------------------------------------');
  console.log('1. Matrículas (_matr.pdf)');
  console.log('2. CAR (_car.pdf)');
  console.log('3. ITR - Declaração (_itr_dec.pdf)');
  console.log('4. ITR - Recibo (_itr_rec.pdf)');
  console.log('5. CCIR (_ccir.pdf)');
  console.log('6. MODO INTELIGENTE (Detectar tipo pelo nome do arquivo)');
  console.log('0. Sair');
  
  const choice = await askQuestion('\nEscolha o tipo de documento que deseja importar (0-6): ');
  
  if (choice === '0') {
    console.log('Saindo...');
    process.exit(0);
  }

  if (choice !== '6' && !MODES[choice]) {
    console.log('❌ Opção inválida.');
    process.exit(0);
  }

  if (!fs.existsSync(importarDir)) {
    fs.mkdirSync(importarDir, { recursive: true });
    console.log(`⚠️ Pasta /importar criada.`);
    process.exit(0);
  }

  const files = fs.readdirSync(importarDir).filter(f => f.toLowerCase().endsWith('.pdf'));
  
  if (files.length === 0) {
    console.log('⚠️ Nenhum arquivo PDF encontrado na pasta /importar.');
    process.exit(0);
  }

  // Carregar lista de IDs e campos legados para o primeiro match
  const { rows: acompanhamentos } = await pool.query('SELECT id, matriculas, car, itr, n_incra_ccir FROM acompanhamentos');

  let successCount = 0;
  let failCount = 0;

  for (const file of files) {
    const fileName = file.replace(/\.[^/.]+$/, "");
    let currentMode;
    let docNumber;
    let currentChoice;

    if (choice === '6') {
      const modeKey = Object.keys(MODES).find(key => fileName.toLowerCase().endsWith(MODES[key].suffix));
      if (!modeKey) {
        console.log(`\n📄 Ignorando: ${file} (Sufixo não reconhecido)`);
        continue;
      }
      currentMode = MODES[modeKey];
      docNumber = fileName.substring(0, fileName.length - currentMode.suffix.length).trim();
      currentChoice = modeKey;
    } else {
      currentMode = MODES[choice];
      docNumber = fileName.trim();
      currentChoice = choice;
    }

    console.log(`\n📄 Processando: ${file} (Tipo: ${currentMode.name} | ID: ${docNumber})`);

    // Match inicial para encontrar os IDs dos imóveis
    const targetIds = acompanhamentos.filter(a => {
      // 1. Checar campo legado
      const legacyValue = a[currentMode.legacyField];
      if (legacyValue) {
        const legacyStr = String(legacyValue);
        if (currentChoice === '1') {
          if (legacyStr.split(',').map(s => s.trim()).includes(docNumber)) return true;
        } else {
          if (legacyStr.trim() === docNumber) return true;
        }
      }
      return false;
    }).map(a => a.id);

    // Se não achou pelo legado, precisa buscar no JSON atualizado de cada um
    // Mas para simplificar, vamos buscar no banco quem tem esse número no JSON correspondente
    const { rows: jsonTargets } = await pool.query(
      `SELECT id FROM acompanhamentos WHERE ${currentMode.field}::text LIKE $1`,
      [`%${docNumber}%`]
    );
    
    const allUniqueIds = [...new Set([...targetIds, ...jsonTargets.map(t => t.id)])];

    if (allUniqueIds.length === 0) {
      console.log(`❌ Registro não encontrado no sistema para ID: ${docNumber}`);
      failCount++;
      continue;
    }

    const timestamp = Date.now();
    const random = Math.floor(Math.random() * 1000000);
    let prefix = 'doc';
    if (currentChoice === '1') prefix = 'matr';
    else if (currentChoice === '2') prefix = 'car';
    else if (currentChoice === '3') prefix = 'dec';
    else if (currentChoice === '4') prefix = 'rec';
    else if (currentChoice === '5') prefix = 'ccir';
    
    const newFileName = `${prefix}-${docNumber}-${timestamp}-${random}.pdf`;
    const newPath = path.join(uploadsDir, newFileName);
    const fileUrl = `/api/documents/${newFileName}`;

    fs.copyFileSync(path.join(importarDir, file), newPath);

    for (const id of allUniqueIds) {
      // BUSCAR O DADO MAIS ATUALIZADO DO BANCO PARA ESTE ID
      const { rows: [actualTarget] } = await pool.query(`SELECT * FROM acompanhamentos WHERE id = $1`, [id]);
      
      if (currentChoice === '2') {
        await pool.query('UPDATE acompanhamentos SET car_url = $1 WHERE id = $2', [fileUrl, id]);
      } else {
        let items = [];
        try {
          const rawData = actualTarget[currentMode.field];
          items = rawData ? (Array.isArray(rawData) ? rawData : JSON.parse(rawData)) : [];
        } catch (e) { items = []; }
        if (!Array.isArray(items)) items = [];

        let found = false;
        items = items.map(item => {
          if (item.numero === docNumber) {
            found = true;
            if (currentMode.subField) {
              return { ...item, [currentMode.subField]: fileUrl };
            } else {
              return { ...item, url: fileUrl };
            }
          }
          return item;
        });

        if (!found) {
          const newItem = {
            id: Math.random().toString(36).substr(2, 9),
            numero: docNumber,
          };
          if (currentMode.subField) {
            newItem[currentMode.subField] = fileUrl;
          } else {
            newItem.url = fileUrl;
          }
          items.push(newItem);
        }

        await pool.query(
          `UPDATE acompanhamentos SET ${currentMode.field} = $1 WHERE id = $2`,
          [JSON.stringify(items), id]
        );
      }
    }

    fs.unlinkSync(path.join(importarDir, file));
    console.log(`✅ [${allUniqueIds.length}] registro(s) atualizado(s).`);
    successCount++;
  }

  console.log(`\n🏁 Concluído!`);
  console.log(`📊 Sucesso: ${successCount} | Erros: ${failCount}`);
  
  await pool.end();
  rl.close();
}

run().catch(err => {
  console.error('❌ Erro inesperado:', err);
  process.exit(1);
});
