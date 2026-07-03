// Testes da regra de revisão admin vs manager (Fase 6, cenários 3 e 4).
import { describe, it, expect, vi } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const rw = require('../review-workflow');

describe('review-workflow · shouldCreateFollowUp', () => {
  it('manager → cria follow-up', () => {
    expect(rw.shouldCreateFollowUp('manager')).toBe(true);
  });
  it('admin → NÃO cria follow-up', () => {
    expect(rw.shouldCreateFollowUp('admin')).toBe(false);
  });
  it('superadmin → NÃO cria follow-up', () => {
    expect(rw.shouldCreateFollowUp('superadmin')).toBe(false);
  });
});

describe('review-workflow · createAdminFollowUp', () => {
  const db = { generateId: (() => { let n = 0; return () => 'id' + (++n); })() };

  // nextSortOrder: valor devolvido pelo SELECT COALESCE(MAX(sort_order),-1)+1.
  function makeExec(nextSortOrder = 0) {
    const taskInserts = [];
    const eventInserts = [];
    return {
      _taskInserts: taskInserts,
      _eventInserts: eventInserts,
      query: vi.fn(async (sql, params) => {
        if (/COALESCE\(MAX\(sort_order\)/.test(sql)) return { rows: [{ next: nextSortOrder }] };
        if (/INSERT INTO project_tasks/.test(sql)) { taskInserts.push({ sql, params }); return { rows: [] }; }
        if (/INSERT INTO task_events/.test(sql)) { eventInserts.push({ sql, params }); return { rows: [] }; }
        return { rows: [] };
      }),
    };
  }

  it('cria "Revisão final" disponível, sem responsável e restrita a gestor', async () => {
    const exec = makeExec();
    const original = { id: 'tOrig', project_id: 'p1', project_stage_id: 's1', name: 'Elaborar laudo' };
    const result = await rw.createAdminFollowUp(exec, db, original, 'mgr1');
    expect(result).toBeTruthy();
    expect(result.taskName).toMatch(/Revisão final/);
    const insert = exec._taskInserts[0];
    // params: id, project, stage, name, description, sort_order (demais flags literais no SQL)
    expect(insert.params[3]).toMatch(/Revisão final/);
    expect(insert.params[1]).toBe('p1');        // project_id herdado
    expect(insert.params[2]).toBe('s1');        // mesma etapa da original
    expect(insert.sql).toMatch(/'available'/);  // status
    expect(insert.sql).toMatch(/gestor_only/);
    expect(insert.sql).toMatch(/TRUE, FALSE/);  // gestor_only=TRUE, acceptance_required=FALSE
  });

  it('sort_order = MAX+1 devolvido pelo SELECT', async () => {
    const exec = makeExec(7);
    const original = { id: 'tOrig', project_id: 'p1', project_stage_id: 's1', name: 'X' };
    await rw.createAdminFollowUp(exec, db, original, 'mgr1');
    expect(exec._taskInserts[0].params[5]).toBe(7); // sort_order
  });

  it('registra task_events created/system com payload de rastreio', async () => {
    const exec = makeExec();
    const original = { id: 'tOrig', project_id: 'p1', project_stage_id: 's1', name: 'X' };
    await rw.createAdminFollowUp(exec, db, original, 'mgr1');
    expect(exec._eventInserts).toHaveLength(1);
    const ev = exec._eventInserts[0];
    expect(ev.sql).toMatch(/'created','system'/);
    const payload = JSON.parse(ev.params[2]);
    expect(payload.followUpOf).toBe('tOrig');
    expect(payload.reason).toBe('manager_review');
  });
});
