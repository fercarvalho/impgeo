// ═══════════════════════════════════════════════════════════════════════════
// server/migrations/runner.js
//
// Runner idempotente de migrations SQL + rastreamento em `schema_migrations`.
// Melhoria #2 do backlog técnico (docs/16 .../12-MELHORIAS-TECNICAS.md).
//
// Modelo: as migrations `NNN-*.sql` (010→…) são aplicadas em ordem; cada uma
// aplicada é registrada em `schema_migrations` (PK = version, o prefixo NNN).
// O runner NUNCA reaplica uma versão já registrada — o que elimina o risco de
// reexecutar migrations destrutivas (ex.: 032 reseta senhas).
//
// Ambientes já existentes (local + VPS) recebem `baseline`: registram 010→NNN
// como aplicadas SEM rodar o SQL. Daí em diante só migrations novas rodam.
//
// Design: os helpers puros e as funções de comando recebem `db` (um objeto com
// `.query`) por injeção — testáveis sem banco. O CLI (pg + dotenv) fica isolado
// no rodapé, só executa quando o arquivo é chamado direto (`require.main`).
//
// Uso:
//   node migrations/runner.js status
//   node migrations/runner.js up
//   node migrations/runner.js baseline
//   node migrations/runner.js down <version>
// ═══════════════════════════════════════════════════════════════════════════

'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const MIGRATIONS_DIR = __dirname;

// ─── Helpers puros (alvo dos testes; sem banco, sem fs) ─────────────────────

/** Extrai o prefixo de 3 dígitos (a "version") do nome do arquivo, ou null. */
function parseVersion(filename) {
  const m = /^(\d{3})-/.exec(filename);
  return m ? m[1] : null;
}

/** É um arquivo de migration aplicável? (NNN-*.sql, exceto *-rollback.sql). */
function isMigrationFile(filename) {
  return /^\d{3}-.*\.sql$/.test(filename) && !filename.endsWith('-rollback.sql');
}

/**
 * Filtra e ordena nomes de arquivo em migrations aplicáveis.
 * Exclui rollbacks e não-numéricos (ex.: create-tables.sql).
 * @returns {{version:string, filename:string}[]} ordenado por version asc.
 */
function filterMigrationFiles(filenames) {
  return filenames
    .filter(isMigrationFile)
    .map((filename) => ({ version: parseVersion(filename), filename }))
    .sort((a, b) => Number(a.version) - Number(b.version));
}

/** Migrations ainda não aplicadas, dado o conjunto de versions já aplicadas. */
function computePending(migrations, appliedVersions) {
  const applied = appliedVersions instanceof Set ? appliedVersions : new Set(appliedVersions);
  return migrations.filter((m) => !applied.has(m.version));
}

/** Checksum determinístico do conteúdo SQL (detecção de drift). */
function checksum(sql) {
  return crypto.createHash('sha256').update(sql, 'utf8').digest('hex');
}

/** A migration já gere a própria transação (`BEGIN;`)? */
function hasOwnTransaction(sql) {
  return /\bBEGIN\s*;/i.test(sql);
}

/** Nome do arquivo de rollback para uma version, entre os arquivos do dir. */
function rollbackFilenameFor(version, filenames) {
  const re = new RegExp(`^${version}-.*-rollback\\.sql$`);
  return filenames.find((f) => re.test(f)) || null;
}

// ─── Acesso a disco (fina camada sobre os helpers puros) ────────────────────

function listMigrationFiles(dir = MIGRATIONS_DIR) {
  return filterMigrationFiles(fs.readdirSync(dir));
}
function readSql(dir, filename) {
  return fs.readFileSync(path.join(dir, filename), 'utf8');
}

// ─── Funções de comando (recebem `db` = objeto com .query) ──────────────────

async function ensureMigrationsTable(db) {
  await db.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version       TEXT PRIMARY KEY,
      filename      TEXT NOT NULL,
      checksum      TEXT,
      applied_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      execution_ms  INTEGER
    )`);
}

/** Map version→{checksum, filename} das migrations já aplicadas. */
async function getApplied(db) {
  const r = await db.query('SELECT version, filename, checksum FROM schema_migrations');
  const map = new Map();
  for (const row of r.rows) map.set(row.version, { checksum: row.checksum, filename: row.filename });
  return map;
}

/**
 * Relatório de estado: aplicadas × pendentes + avisos de drift (checksum do
 * arquivo diferente do gravado). Puro em relação ao banco (só lê).
 */
async function status(db, dir = MIGRATIONS_DIR) {
  await ensureMigrationsTable(db);
  const applied = await getApplied(db);
  const migrations = listMigrationFiles(dir);
  const pending = computePending(migrations, new Set(applied.keys()));
  const drift = [];
  for (const m of migrations) {
    const a = applied.get(m.version);
    if (a && a.checksum) {
      const cur = checksum(readSql(dir, m.filename));
      if (cur !== a.checksum) drift.push(m.version);
    }
  }
  return { total: migrations.length, applied: applied.size, pending, drift };
}

/**
 * Aplica as migrations pendentes em ordem. `db` DEVE ser um client dedicado
 * (mesma conexão) para que BEGIN/COMMIT valham entre chamadas.
 * @returns {string[]} versions aplicadas nesta execução.
 */
async function up(db, dir = MIGRATIONS_DIR) {
  await ensureMigrationsTable(db);
  const applied = await getApplied(db);
  const pending = computePending(listMigrationFiles(dir), new Set(applied.keys()));
  const done = [];
  for (const m of pending) {
    const sql = readSql(dir, m.filename);
    const sum = checksum(sql);
    const t0 = Date.now();
    if (hasOwnTransaction(sql)) {
      // O arquivo gere a própria transação; roda como está e registra à parte.
      await db.query(sql);
      await db.query(
        'INSERT INTO schema_migrations (version, filename, checksum, execution_ms) VALUES ($1,$2,$3,$4)',
        [m.version, m.filename, sum, Date.now() - t0]
      );
    } else {
      // Sem transação própria: envelopa para atomicidade (migration + registro).
      await db.query('BEGIN');
      try {
        await db.query(sql);
        await db.query(
          'INSERT INTO schema_migrations (version, filename, checksum, execution_ms) VALUES ($1,$2,$3,$4)',
          [m.version, m.filename, sum, Date.now() - t0]
        );
        await db.query('COMMIT');
      } catch (e) {
        await db.query('ROLLBACK');
        throw e;
      }
    }
    done.push(m.version);
  }
  return done;
}

/**
 * Baseline: registra TODAS as migrations atuais como aplicadas SEM rodar o SQL.
 * Para ambientes que já têm o schema aplicado à mão. Idempotente.
 * @returns {string[]} versions registradas (novas) nesta execução.
 */
async function baseline(db, dir = MIGRATIONS_DIR) {
  await ensureMigrationsTable(db);
  const applied = await getApplied(db);
  const migrations = listMigrationFiles(dir);
  const added = [];
  for (const m of migrations) {
    if (applied.has(m.version)) continue;
    const sum = checksum(readSql(dir, m.filename));
    const r = await db.query(
      `INSERT INTO schema_migrations (version, filename, checksum)
       VALUES ($1,$2,$3) ON CONFLICT (version) DO NOTHING`,
      [m.version, m.filename, sum]
    );
    if (r.rowCount > 0) added.push(m.version);
  }
  return added;
}

/**
 * Reverte uma version aplicada rodando seu par `-rollback.sql` e removendo o
 * registro. Erra claramente se a version não está aplicada ou não tem rollback.
 * `db` DEVE ser um client dedicado (transação).
 */
async function down(db, version, dir = MIGRATIONS_DIR) {
  await ensureMigrationsTable(db);
  const applied = await getApplied(db);
  if (!applied.has(version)) {
    throw new Error(`Migration ${version} não está aplicada — nada a reverter.`);
  }
  const rollbackFile = rollbackFilenameFor(version, fs.readdirSync(dir));
  if (!rollbackFile) {
    throw new Error(`Migration ${version} não tem arquivo -rollback.sql — reverta manualmente.`);
  }
  const sql = readSql(dir, rollbackFile);
  await db.query('BEGIN');
  try {
    await db.query(sql);
    await db.query('DELETE FROM schema_migrations WHERE version = $1', [version]);
    await db.query('COMMIT');
  } catch (e) {
    await db.query('ROLLBACK');
    throw e;
  }
  return rollbackFile;
}

module.exports = {
  // helpers puros
  parseVersion,
  isMigrationFile,
  filterMigrationFiles,
  computePending,
  checksum,
  hasOwnTransaction,
  rollbackFilenameFor,
  // disco
  listMigrationFiles,
  readSql,
  MIGRATIONS_DIR,
  // comandos
  ensureMigrationsTable,
  getApplied,
  status,
  up,
  baseline,
  down,
};

// ─── CLI (só quando executado direto; pg + dotenv isolados aqui) ────────────

if (require.main === module) {
  require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
  const { Pool } = require('pg');

  const pool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT) || 5432,
    database: process.env.DB_NAME || 'impgeo',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || '',
  });

  (async () => {
    const cmd = process.argv[2];
    const arg = process.argv[3];
    const client = await pool.connect();
    try {
      if (cmd === 'status') {
        const r = await status(client, MIGRATIONS_DIR);
        console.log(`Migrations: ${r.applied}/${r.total} aplicadas, ${r.pending.length} pendente(s).`);
        if (r.pending.length) console.log('Pendentes:', r.pending.map((m) => m.filename).join(', '));
        if (r.drift.length) console.warn('⚠️  Drift (checksum divergente):', r.drift.join(', '));
      } else if (cmd === 'up') {
        const done = await up(client, MIGRATIONS_DIR);
        console.log(done.length ? `Aplicadas: ${done.join(', ')}` : 'Nada pendente.');
      } else if (cmd === 'baseline') {
        const added = await baseline(client, MIGRATIONS_DIR);
        console.log(added.length ? `Baseline registrou ${added.length} migration(s): ${added[0]}…${added[added.length - 1]}` : 'Baseline já estava completo.');
      } else if (cmd === 'down') {
        if (!arg) throw new Error('Uso: node migrations/runner.js down <version>');
        const file = await down(client, arg, MIGRATIONS_DIR);
        console.log(`Revertida ${arg} via ${file}.`);
      } else {
        console.log('Comandos: status | up | baseline | down <version>');
        process.exitCode = 1;
      }
    } catch (e) {
      console.error('Erro:', e.message);
      process.exitCode = 1;
    } finally {
      client.release();
      await pool.end();
    }
  })();
}
