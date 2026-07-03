// Testes do trigger-runner (Fase 3). Mocka exec.query por padrão de SQL.
import { describe, it, expect, vi } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { runTriggersForCompletedTask } = require('../trigger-runner');

function makeExec({ source, triggers }) {
  const inserts = [];
  const updates = [];
  const query = vi.fn(async (sql, params) => {
    if (/SELECT id, project_id, project_stage_id FROM project_tasks/.test(sql)) {
      return { rows: source ? [source] : [] };
    }
    if (/SELECT \* FROM project_task_triggers/.test(sql)) {
      return { rows: triggers };
    }
    if (/SELECT COALESCE\(MAX\(sort_order\)/.test(sql)) {
      return { rows: [{ next: 0 }] };
    }
    if (/INSERT INTO project_tasks/.test(sql)) {
      inserts.push({ sql, params });
      return { rows: [] };
    }
    if (/UPDATE project_task_triggers SET triggered_at/.test(sql)) {
      updates.push({ sql, params });
      return { rows: [] };
    }
    if (/INSERT INTO task_events/.test(sql)) {
      return { rows: [] };
    }
    return { rows: [] };
  });
  return { query, _inserts: inserts, _updates: updates };
}

const db = { generateId: (() => { let n = 0; return () => 'id' + (++n); })() };

describe('trigger-runner · runTriggersForCompletedTask', () => {
  it('cria 1 tarefa nova por trigger pendente e marca triggered_at', async () => {
    const source = { id: 'src', project_id: 'proj', project_stage_id: 'stage1' };
    const triggers = [
      { id: 'trg1', payload: { name: 'Elaborar Laudo' }, on_status: 'completed', triggered_at: null },
    ];
    const exec = makeExec({ source, triggers });
    const created = await runTriggersForCompletedTask(db, 'src', { pgClient: exec, actorId: 'u1' });

    expect(created).toHaveLength(1);
    expect(created[0].name).toBe('Elaborar Laudo');
    expect(exec._inserts).toHaveLength(1); // 1 project_task criada
    expect(exec._updates).toHaveLength(1); // triggered_at marcado
  });

  it('não cria nada quando não há triggers pendentes', async () => {
    const source = { id: 'src', project_id: 'proj', project_stage_id: 'stage1' };
    const exec = makeExec({ source, triggers: [] });
    const created = await runTriggersForCompletedTask(db, 'src', { pgClient: exec });
    expect(created).toHaveLength(0);
    expect(exec._inserts).toHaveLength(0);
  });

  it('retorna vazio se a tarefa de origem não existe', async () => {
    const exec = makeExec({ source: null, triggers: [] });
    const created = await runTriggersForCompletedTask(db, 'ghost', { pgClient: exec });
    expect(created).toEqual([]);
  });

  it('respeita target_stage_id do payload (posiciona em outra etapa)', async () => {
    const source = { id: 'src', project_id: 'proj', project_stage_id: 'stage1' };
    const triggers = [
      { id: 'trg1', payload: { name: 'Follow-up', target_stage_id: 'stage9' }, on_status: 'completed', triggered_at: null },
    ];
    const exec = makeExec({ source, triggers });
    await runTriggersForCompletedTask(db, 'src', { pgClient: exec });
    // o INSERT da task usa stage9 como project_stage_id (3º param)
    const insert = exec._inserts[0];
    expect(insert.params[2]).toBe('stage9');
  });
});
