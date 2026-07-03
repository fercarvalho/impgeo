// Testes do runner de migrations (melhoria #2). Foco na lógica de seleção/
// ordenação (onde mora o risco) + comandos DB com um `db.query` fake roteado
// por regex — sem tocar banco nem disco real nos casos puros.
import { describe, it, expect, vi } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const runner = require('../runner');

// ─── Helpers puros ───────────────────────────────────────────────────────────
describe('runner · parseVersion / isMigrationFile', () => {
  it('extrai o prefixo NNN', () => {
    expect(runner.parseVersion('060-PM-DUE-DATE-REQUESTS.sql')).toBe('060');
    expect(runner.parseVersion('create-tables.sql')).toBe(null);
  });

  it('aceita só NNN-*.sql e rejeita rollback / não-numérico', () => {
    expect(runner.isMigrationFile('010-asaas.sql')).toBe(true);
    expect(runner.isMigrationFile('060-x-rollback.sql')).toBe(false);
    expect(runner.isMigrationFile('create-tables.sql')).toBe(false);
    expect(runner.isMigrationFile('seed-subcategories.js')).toBe(false);
  });
});

describe('runner · filterMigrationFiles', () => {
  const files = [
    '060-PM-DUE-DATE-REQUESTS.sql',
    '010-asaas-integration.sql',
    '060-PM-DUE-DATE-REQUESTS-rollback.sql', // excluído
    'create-tables.sql',                     // excluído (sem prefixo)
    'seed-subcategories.js',                 // excluído (não .sql)
    '042-PERMISSOES-GRANULARES.sql',
  ];

  it('filtra rollbacks/não-numéricos e ordena por version asc', () => {
    const out = runner.filterMigrationFiles(files);
    expect(out.map((m) => m.version)).toEqual(['010', '042', '060']);
    expect(out.every((m) => m.filename.endsWith('.sql'))).toBe(true);
    expect(out.some((m) => m.filename.includes('rollback'))).toBe(false);
  });

  it('ordena numericamente, não lexicograficamente', () => {
    const out = runner.filterMigrationFiles(['100-z.sql', '020-a.sql', '009-b.sql']);
    expect(out.map((m) => m.version)).toEqual(['009', '020', '100']);
  });
});

describe('runner · computePending', () => {
  const migrations = [
    { version: '010', filename: '010-a.sql' },
    { version: '011', filename: '011-b.sql' },
    { version: '012', filename: '012-c.sql' },
  ];
  it('remove as já aplicadas (aceita Set ou array)', () => {
    expect(runner.computePending(migrations, new Set(['010', '011'])).map((m) => m.version)).toEqual(['012']);
    expect(runner.computePending(migrations, ['010']).map((m) => m.version)).toEqual(['011', '012']);
  });
  it('conjunto vazio → tudo pendente', () => {
    expect(runner.computePending(migrations, new Set()).length).toBe(3);
  });
});

describe('runner · checksum', () => {
  it('é determinístico e sensível ao conteúdo', () => {
    expect(runner.checksum('SELECT 1')).toBe(runner.checksum('SELECT 1'));
    expect(runner.checksum('SELECT 1')).not.toBe(runner.checksum('SELECT 2'));
    expect(runner.checksum('x')).toMatch(/^[a-f0-9]{64}$/);
  });
});

describe('runner · hasOwnTransaction', () => {
  it('detecta BEGIN; próprio', () => {
    expect(runner.hasOwnTransaction('BEGIN;\nCREATE TABLE x();\nCOMMIT;')).toBe(true);
    expect(runner.hasOwnTransaction('  begin ;\n...')).toBe(true);
    expect(runner.hasOwnTransaction('ALTER TABLE t ADD COLUMN c INT;')).toBe(false);
  });
});

describe('runner · rollbackFilenameFor', () => {
  const files = ['060-PM.sql', '060-PM-rollback.sql', '061-X.sql'];
  it('acha o rollback pela version', () => {
    expect(runner.rollbackFilenameFor('060', files)).toBe('060-PM-rollback.sql');
  });
  it('null quando não há rollback', () => {
    expect(runner.rollbackFilenameFor('061', files)).toBe(null);
  });
});

// ─── Comandos DB (db.query fake roteado por regex) ──────────────────────────
function router(routes, fallback = { rows: [], rowCount: 0 }) {
  return async (sql, params) => {
    for (const [re, resp] of routes) {
      if (re.test(sql)) return typeof resp === 'function' ? resp(params) : resp;
    }
    return fallback;
  };
}
function makeDb(handler) {
  return { query: vi.fn(handler) };
}
const sqls = (db) => db.query.mock.calls.map((c) => c[0]);
const RE_APPLIED = /SELECT version, filename, checksum FROM schema_migrations/;

describe('runner · ensureMigrationsTable', () => {
  it('cria a tabela de forma idempotente', async () => {
    const db = makeDb(router([]));
    await runner.ensureMigrationsTable(db);
    expect(sqls(db).some((s) => /CREATE TABLE IF NOT EXISTS schema_migrations/.test(s))).toBe(true);
  });
});

describe('runner · getApplied', () => {
  it('devolve um Map version → {checksum, filename}', async () => {
    const db = makeDb(router([[RE_APPLIED, { rows: [{ version: '010', filename: '010-a.sql', checksum: 'abc' }] }]]));
    const map = await runner.getApplied(db);
    expect(map.get('010')).toEqual({ checksum: 'abc', filename: '010-a.sql' });
  });
});

describe('runner · baseline', () => {
  it('registra as migrations do disco que ainda não estão aplicadas, sem rodar SQL', async () => {
    // Nenhuma aplicada ainda → todas as migrations reais viram INSERT ... ON CONFLICT.
    const inserts = [];
    const db = makeDb(router([
      [RE_APPLIED, { rows: [] }],
      [/INSERT INTO schema_migrations/, (params) => { inserts.push(params[0]); return { rowCount: 1 }; }],
    ]));
    const added = await runner.baseline(db, runner.MIGRATIONS_DIR);
    // Não rodou nenhum DDL/DML de migration — só ensure + select + inserts.
    expect(sqls(db).some((s) => /CREATE TABLE .*project_tasks|ALTER TABLE|DROP TABLE/i.test(s))).toBe(false);
    expect(added.length).toBeGreaterThan(0);
    expect(added).toEqual([...added].sort((a, b) => Number(a) - Number(b))); // ordenado
    expect(added).toContain('010');
  });

  it('pula versions já aplicadas (idempotente)', async () => {
    const db = makeDb(router([
      [RE_APPLIED, { rows: runner.listMigrationFiles().map((m) => ({ version: m.version, filename: m.filename, checksum: 'x' })) }],
      [/INSERT INTO schema_migrations/, { rowCount: 0 }],
    ]));
    const added = await runner.baseline(db, runner.MIGRATIONS_DIR);
    expect(added).toEqual([]);
  });
});

describe('runner · down (guards)', () => {
  it('erra se a version não está aplicada', async () => {
    const db = makeDb(router([[RE_APPLIED, { rows: [] }]]));
    await expect(runner.down(db, '060', runner.MIGRATIONS_DIR)).rejects.toThrow(/não está aplicada/i);
  });

  it('erra se a version aplicada não tem arquivo -rollback (ex.: 010)', async () => {
    // 010–015 não têm rollback no disco; simulamos 010 como aplicada.
    const db = makeDb(router([[RE_APPLIED, { rows: [{ version: '010', filename: '010-asaas-integration.sql', checksum: 'x' }] }]]));
    await expect(runner.down(db, '010', runner.MIGRATIONS_DIR)).rejects.toThrow(/-rollback\.sql/i);
  });
});

describe('runner · status', () => {
  it('reporta total/aplicadas/pendentes a partir do disco real', async () => {
    const db = makeDb(router([[RE_APPLIED, { rows: [] }]]));
    const r = await runner.status(db, runner.MIGRATIONS_DIR);
    expect(r.total).toBeGreaterThan(0);
    expect(r.applied).toBe(0);
    expect(r.pending.length).toBe(r.total);
    expect(r.drift).toEqual([]);
  });
});
