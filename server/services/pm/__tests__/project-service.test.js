// Testes do project-service (Fase 3): atomicidade (rollback) e idempotência
// do hook PIX. Mocka db.pool.connect() com um client cujo query() pode falhar.
import { describe, it, expect, vi } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const projectService = require('../project-service');

function makeClient(handler) {
  const calls = [];
  return {
    calls,
    query: vi.fn(async (sql, params) => {
      calls.push(sql.trim().split('\n')[0]);
      return handler(sql, params);
    }),
    release: vi.fn(),
  };
}

function makeDb(client) {
  let n = 0;
  return {
    generateId: () => 'id' + (++n),
    pool: {
      connect: vi.fn(async () => client),
      query: vi.fn(async () => ({ rows: [] })),
    },
  };
}

describe('project-service · createProjectFromTemplate (atomicidade)', () => {
  it('faz ROLLBACK e propaga erro se um INSERT falha no meio da transação', async () => {
    const client = makeClient((sql) => {
      if (sql.startsWith('BEGIN')) return { rows: [] };
      if (/INSERT INTO projects/.test(sql)) throw new Error('falha forçada no insert de projeto');
      return { rows: [] };
    });
    const db = makeDb(client);

    await expect(
      projectService.createProjectFromTemplate(db, { name: 'X', serviceId: null })
    ).rejects.toThrow(/falha forçada/);

    // Deve ter chamado BEGIN e ROLLBACK (não COMMIT), e liberado a conexão.
    expect(client.calls).toContain('BEGIN');
    expect(client.calls).toContain('ROLLBACK');
    expect(client.calls).not.toContain('COMMIT');
    expect(client.release).toHaveBeenCalled();
  });
});

describe('project-service · createProjectFromTerraControlPayment (idempotência)', () => {
  it('NÃO cria projeto novo se já existe um para o terreno (replay seguro)', async () => {
    const client = makeClient((sql) => {
      if (sql.startsWith('BEGIN') || sql.startsWith('COMMIT')) return { rows: [] };
      if (/SELECT id, client_id FROM projects WHERE terracontrol_id/.test(sql)) {
        return { rows: [{ id: 'proj_existente', client_id: 'cli1' }] };
      }
      return { rows: [] };
    });
    const db = makeDb(client);

    const result = await projectService.createProjectFromTerraControlPayment(db, {
      terracontrolId: 'tc1', tcUserId: 'tcu1',
    });

    expect(result.created).toBe(false);
    expect(result.projectId).toBe('proj_existente');
    expect(client.calls).toContain('COMMIT'); // fecha a tx mesmo no caminho idempotente
  });

  it('exige terracontrolId', async () => {
    const db = makeDb(makeClient(() => ({ rows: [] })));
    await expect(
      projectService.createProjectFromTerraControlPayment(db, { terracontrolId: null })
    ).rejects.toThrow(/terracontrolId obrigatório/);
  });
});
