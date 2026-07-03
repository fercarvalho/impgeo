// Testes do template-service (Fase 2). Regra crítica: detecção de ciclo em
// dependências task→task. Mocka db.pool.query (sem banco real).

import { describe, it, expect, vi } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const templateService = require('../template-service');

// ─── Mock helper de db ────────────────────────────────────────────────────────
// edges: array de { task_id, target_task_id } representando "task depende de target".
function makeDb({ serviceId = 'svc1', edges = [] } = {}) {
  return {
    generateId: () => 'gen_' + Math.random().toString(36).slice(2),
    pool: {
      query: vi.fn(async (sql, params) => {
        // 1ª query do _wouldCreateCycle: resolve service_id da task
        if (/SELECT dt\.service_id FROM service_template_tasks/.test(sql)) {
          return { rows: [{ service_id: serviceId }] };
        }
        // 2ª query: carrega todas as arestas task→target do serviço
        if (/FROM service_template_task_deps/.test(sql)) {
          return { rows: edges };
        }
        return { rows: [] };
      }),
    },
  };
}

describe('template-service · detecção de ciclo (_wouldCreateCycle)', () => {
  it('detecta ciclo direto: A→B já existe, adicionar B→A cria ciclo', async () => {
    // A depende de B (A→B). Tentar criar B depende de A (B→A) → ciclo.
    const db = makeDb({ edges: [{ task_id: 'A', target_task_id: 'B' }] });
    const cycle = await templateService._wouldCreateCycle(db, 'B', 'A');
    expect(cycle).toBe(true);
  });

  it('detecta ciclo transitivo: A→B, B→C, adicionar C→A cria ciclo', async () => {
    const db = makeDb({ edges: [
      { task_id: 'A', target_task_id: 'B' },
      { task_id: 'B', target_task_id: 'C' },
    ] });
    const cycle = await templateService._wouldCreateCycle(db, 'C', 'A');
    expect(cycle).toBe(true);
  });

  it('não acusa ciclo quando dependência é acíclica (DAG)', async () => {
    const db = makeDb({ edges: [
      { task_id: 'A', target_task_id: 'B' },
      { task_id: 'B', target_task_id: 'C' },
    ] });
    // Adicionar A→C (A passa a depender de C também) — continua DAG.
    const cycle = await templateService._wouldCreateCycle(db, 'A', 'C');
    expect(cycle).toBe(false);
  });

  it('não acusa ciclo em grafo vazio', async () => {
    const db = makeDb({ edges: [] });
    const cycle = await templateService._wouldCreateCycle(db, 'X', 'Y');
    expect(cycle).toBe(false);
  });
});

describe('template-service · createDependency (validações)', () => {
  it('rejeita dependencyType inválido', async () => {
    const db = makeDb();
    await expect(
      templateService.createDependency(db, 'A', {
        dependencyType: 'bogus', dependencyTargetType: 'task', targetTaskId: 'B',
      })
    ).rejects.toThrow(/dependencyType inválido/);
  });

  it('rejeita auto-dependência (task depende de si mesma)', async () => {
    const db = makeDb();
    await expect(
      templateService.createDependency(db, 'A', {
        dependencyType: 'start_dependency', dependencyTargetType: 'task', targetTaskId: 'A',
      })
    ).rejects.toThrow(/si mesma/);
  });

  it('rejeita target task sem targetTaskId', async () => {
    const db = makeDb();
    await expect(
      templateService.createDependency(db, 'A', {
        dependencyType: 'start_dependency', dependencyTargetType: 'task',
      })
    ).rejects.toThrow(/targetTaskId obrigatório/);
  });

  it('lança erro com code=dependency_cycle quando criaria ciclo', async () => {
    const db = makeDb({ edges: [{ task_id: 'A', target_task_id: 'B' }] });
    // INSERT não deve ser alcançado; mockamos pra falhar se for.
    let err;
    try {
      await templateService.createDependency(db, 'B', {
        dependencyType: 'start_dependency', dependencyTargetType: 'task', targetTaskId: 'A',
      });
    } catch (e) { err = e; }
    expect(err).toBeDefined();
    expect(err.code).toBe('dependency_cycle');
  });
});

describe('template-service · createTrigger (validações)', () => {
  it('exige payload.name', async () => {
    const db = {
      generateId: () => 'g1',
      pool: { query: vi.fn(async () => ({ rows: [{ service_id: 'svc1' }] })) },
    };
    await expect(
      templateService.createTrigger(db, 'taskA', { payload: {} })
    ).rejects.toThrow(/payload\.name obrigatório/);
  });

  it('falha com code=trigger_source_invalid se source não existe', async () => {
    const db = {
      generateId: () => 'g1',
      pool: { query: vi.fn(async () => ({ rows: [] })) }, // source não encontrada
    };
    let err;
    try {
      await templateService.createTrigger(db, 'ghost', { payload: { name: 'X' } });
    } catch (e) { err = e; }
    expect(err.code).toBe('trigger_source_invalid');
  });
});
