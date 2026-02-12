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

const backupRoot = path.join(__dirname, '..', 'database', 'backup-json');

function formatCodImovel(value) {
  const digits = String(value ?? '').replace(/\D/g, '');
  if (!digits) return null;
  return digits.padStart(3, '0');
}

function findLatestBackupWithAcompanhamentos() {
  if (!fs.existsSync(backupRoot)) {
    return null;
  }

  const dirs = fs
    .readdirSync(backupRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort()
    .reverse();

  for (const dir of dirs) {
    const filePath = path.join(backupRoot, dir, 'acompanhamentos.json');
    if (fs.existsSync(filePath)) {
      return filePath;
    }
  }

  return null;
}

async function ensureSchema(client) {
  await client.query(`
    ALTER TABLE acompanhamentos
      ADD COLUMN IF NOT EXISTS imovel TEXT,
      ADD COLUMN IF NOT EXISTS municipio VARCHAR(255),
      ADD COLUMN IF NOT EXISTS mapa_url TEXT,
      ADD COLUMN IF NOT EXISTS matriculas TEXT,
      ADD COLUMN IF NOT EXISTS n_incra_ccir VARCHAR(255),
      ADD COLUMN IF NOT EXISTS car TEXT,
      ADD COLUMN IF NOT EXISTS status_car VARCHAR(100),
      ADD COLUMN IF NOT EXISTS itr TEXT,
      ADD COLUMN IF NOT EXISTS geo_certificacao VARCHAR(10),
      ADD COLUMN IF NOT EXISTS geo_registro VARCHAR(10),
      ADD COLUMN IF NOT EXISTS area_total DECIMAL(12,2) DEFAULT 0,
      ADD COLUMN IF NOT EXISTS reserva_legal DECIMAL(12,2) DEFAULT 0,
      ADD COLUMN IF NOT EXISTS cultura1 VARCHAR(255),
      ADD COLUMN IF NOT EXISTS area_cultura1 DECIMAL(12,2) DEFAULT 0,
      ADD COLUMN IF NOT EXISTS cultura2 VARCHAR(255),
      ADD COLUMN IF NOT EXISTS area_cultura2 DECIMAL(12,2) DEFAULT 0,
      ADD COLUMN IF NOT EXISTS outros VARCHAR(255),
      ADD COLUMN IF NOT EXISTS area_outros DECIMAL(12,2) DEFAULT 0,
      ADD COLUMN IF NOT EXISTS app_codigo_florestal DECIMAL(12,2) DEFAULT 0,
      ADD COLUMN IF NOT EXISTS app_vegetada DECIMAL(12,2) DEFAULT 0,
      ADD COLUMN IF NOT EXISTS app_nao_vegetada DECIMAL(12,2) DEFAULT 0,
      ADD COLUMN IF NOT EXISTS remanescente_florestal DECIMAL(12,2) DEFAULT 0;
  `);
}

async function recoverFromFile(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  const rows = JSON.parse(raw);

  if (!Array.isArray(rows) || rows.length === 0) {
    throw new Error('Arquivo de acompanhamentos vazio ou inválido.');
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await ensureSchema(client);

    for (const row of rows) {
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
          String(row.id),
          formatCodImovel(row.cod_imovel || row.codImovel),
          row.imovel || row.endereco || null,
          row.municipio || null,
          row.mapa_url || row.mapaUrl || null,
          row.matriculas || null,
          row.n_incra_ccir || row.nIncraCcir || null,
          row.car || null,
          row.status_car || row.statusCar || row.status || null,
          row.itr || null,
          row.geo_certificacao || row.geoCertificacao || 'NÃO',
          row.geo_registro || row.geoRegistro || 'NÃO',
          row.area_total ?? row.areaTotal ?? 0,
          row.reserva_legal ?? row.reservaLegal ?? 0,
          row.cultura1 || null,
          row.area_cultura1 ?? row.areaCultura1 ?? 0,
          row.cultura2 || null,
          row.area_cultura2 ?? row.areaCultura2 ?? 0,
          row.outros || null,
          row.area_outros ?? row.areaOutros ?? 0,
          row.app_codigo_florestal ?? row.appCodigoFlorestal ?? 0,
          row.app_vegetada ?? row.appVegetada ?? 0,
          row.app_nao_vegetada ?? row.appNaoVegetada ?? 0,
          row.remanescente_florestal ?? row.remanescenteFlorestal ?? 0,
          row.endereco || row.imovel || null,
          row.status || row.statusCar || null,
          row.observacoes || null,
          row.createdAt || new Date().toISOString(),
          row.updatedAt || new Date().toISOString(),
        ]
      );
    }

    await client.query('COMMIT');
    console.log(`✅ Recuperação concluída: ${rows.length} acompanhamentos processados.`);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function main() {
  try {
    const manualPath = process.argv[2];
    const sourceFile = manualPath
      ? path.resolve(process.cwd(), manualPath)
      : findLatestBackupWithAcompanhamentos();

    if (!sourceFile || !fs.existsSync(sourceFile)) {
      throw new Error(
        'Não encontrei acompanhamentos.json no backup. Informe o arquivo manualmente: node migrations/recover-acompanhamentos.js "<caminho>"'
      );
    }

    console.log(`📂 Usando arquivo: ${sourceFile}`);
    await recoverFromFile(sourceFile);
  } catch (error) {
    console.error('❌ Erro ao recuperar acompanhamentos:', error.message || error);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

main();
