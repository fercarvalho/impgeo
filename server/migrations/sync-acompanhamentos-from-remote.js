require('dotenv').config();
const { Pool } = require('pg');

const REMOTE_URL =
  process.env.REMOTE_ACOMPANHAMENTOS_URL ||
  'https://impgeo.sistemas.viverdepj.com.br/api/acompanhamentos';

function formatCodImovel(value) {
  const digits = String(value ?? '').replace(/\D/g, '');
  if (!digits) return null;
  return digits.padStart(3, '0');
}

function normalize(row) {
  return {
    id: String(row?.id ?? ''),
    codImovel: Number(row?.codImovel ?? row?.cod_imovel ?? 0),
    imovel: row?.imovel ?? row?.endereco ?? null,
    municipio: row?.municipio ?? null,
    mapaUrl: row?.mapaUrl ?? row?.mapa_url ?? null,
    matriculas: row?.matriculas ?? null,
    nIncraCcir: row?.nIncraCcir ?? row?.n_incra_ccir ?? null,
    car: row?.car ?? null,
    statusCar: row?.statusCar ?? row?.status_car ?? row?.status ?? null,
    itr: row?.itr ?? null,
    geoCertificacao: row?.geoCertificacao ?? row?.geo_certificacao ?? 'NÃO',
    geoRegistro: row?.geoRegistro ?? row?.geo_registro ?? 'NÃO',
    areaTotal: Number(row?.areaTotal ?? row?.area_total ?? 0),
    reservaLegal: Number(row?.reservaLegal ?? row?.reserva_legal ?? 0),
    cultura1: row?.cultura1 ?? null,
    areaCultura1: Number(row?.areaCultura1 ?? row?.area_cultura1 ?? 0),
    cultura2: row?.cultura2 ?? null,
    areaCultura2: Number(row?.areaCultura2 ?? row?.area_cultura2 ?? 0),
    outros: row?.outros ?? null,
    areaOutros: Number(row?.areaOutros ?? row?.area_outros ?? 0),
    appCodigoFlorestal: Number(row?.appCodigoFlorestal ?? row?.app_codigo_florestal ?? 0),
    appVegetada: Number(row?.appVegetada ?? row?.app_vegetada ?? 0),
    appNaoVegetada: Number(row?.appNaoVegetada ?? row?.app_nao_vegetada ?? 0),
    remanescenteFlorestal: Number(row?.remanescenteFlorestal ?? row?.remanescente_florestal ?? 0),
  };
}

async function fetchRemoteRows() {
  const response = await fetch(REMOTE_URL);
  if (!response.ok) {
    throw new Error(`Falha ao buscar remoto: HTTP ${response.status}`);
  }

  const payload = await response.json();
  if (!payload?.success || !Array.isArray(payload?.data)) {
    throw new Error('Resposta remota inválida.');
  }

  return payload.data.map(normalize);
}

async function syncRows(rows) {
  const pool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT) || 5432,
    database: process.env.DB_NAME || 'impgeo',
    user: process.env.DB_USER || 'fernandocarvalho',
    password: process.env.DB_PASSWORD || '',
  });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

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
           $21, $22, $23, $24, $25, $26, $27, NOW(), NOW()
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
           updated_at = NOW()`,
        [
          row.id,
          formatCodImovel(row.codImovel),
          row.imovel,
          row.municipio,
          row.mapaUrl,
          row.matriculas,
          row.nIncraCcir,
          row.car,
          row.statusCar,
          row.itr,
          row.geoCertificacao,
          row.geoRegistro,
          row.areaTotal,
          row.reservaLegal,
          row.cultura1,
          row.areaCultura1,
          row.cultura2,
          row.areaCultura2,
          row.outros,
          row.areaOutros,
          row.appCodigoFlorestal,
          row.appVegetada,
          row.appNaoVegetada,
          row.remanescenteFlorestal,
          row.imovel,
          row.statusCar,
          null,
        ]
      );
    }

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

async function main() {
  try {
    const rows = await fetchRemoteRows();
    if (!rows.length) {
      throw new Error('Sem dados remotos para sincronizar.');
    }

    await syncRows(rows);
    console.log(`✅ Sincronização concluída: ${rows.length} registros.`);
  } catch (error) {
    console.error('❌ Erro na sincronização:', error.message || error);
    process.exit(1);
  }
}

main();
