// Testes do dependency-resolver (Fase 3). Lógica pura — sem mocks de I/O.
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const resolver = require('../dependency-resolver');

describe('dependency-resolver · resolveAvailableTasks', () => {
  it('promove tarefa pending sem dependências', () => {
    const tasks = [{ id: 'A', status: 'pending' }];
    const result = resolver.resolveAvailableTasks({ tasks, deps: [] });
    expect(result).toEqual(['A']);
  });

  it('NÃO promove tarefa cuja start_dependency não está satisfeita', () => {
    const tasks = [
      { id: 'A', status: 'in_progress' },
      { id: 'B', status: 'pending' },
    ];
    const deps = [
      { task_id: 'B', dependency_type: 'start_dependency', dependency_target_type: 'task', target_task_id: 'A', required_status: 'completed' },
    ];
    expect(resolver.resolveAvailableTasks({ tasks, deps })).toEqual([]);
  });

  it('promove tarefa quando a start_dependency é satisfeita', () => {
    const tasks = [
      { id: 'A', status: 'completed' },
      { id: 'B', status: 'pending' },
    ];
    const deps = [
      { task_id: 'B', dependency_type: 'start_dependency', dependency_target_type: 'task', target_task_id: 'A', required_status: 'completed' },
    ];
    expect(resolver.resolveAvailableTasks({ tasks, deps })).toEqual(['B']);
  });

  it('exige TODAS as start_dependencies satisfeitas', () => {
    const tasks = [
      { id: 'A', status: 'completed' },
      { id: 'B', status: 'in_progress' },
      { id: 'C', status: 'pending' },
    ];
    const deps = [
      { task_id: 'C', dependency_type: 'start_dependency', dependency_target_type: 'task', target_task_id: 'A', required_status: 'completed' },
      { task_id: 'C', dependency_type: 'start_dependency', dependency_target_type: 'task', target_task_id: 'B', required_status: 'completed' },
    ];
    // B ainda não completou → C não promove
    expect(resolver.resolveAvailableTasks({ tasks, deps })).toEqual([]);
  });

  it('start_dependency em ETAPA é respeitada', () => {
    const tasks = [{ id: 'T', status: 'pending' }];
    const stages = [{ id: 'S1', status: 'pending' }];
    const deps = [
      { task_id: 'T', dependency_type: 'start_dependency', dependency_target_type: 'stage', target_stage_id: 'S1', required_status: 'completed' },
    ];
    expect(resolver.resolveAvailableTasks({ tasks, stages, deps })).toEqual([]);
    stages[0].status = 'completed';
    expect(resolver.resolveAvailableTasks({ tasks, stages, deps })).toEqual(['T']);
  });

  it('required_status default = completed quando null', () => {
    const tasks = [
      { id: 'A', status: 'completed' },
      { id: 'B', status: 'pending' },
    ];
    const deps = [
      { task_id: 'B', dependency_type: 'start_dependency', dependency_target_type: 'task', target_task_id: 'A', required_status: null },
    ];
    expect(resolver.resolveAvailableTasks({ tasks, deps })).toEqual(['B']);
  });
});

describe('dependency-resolver · canCompleteTask', () => {
  it('bloqueia conclusão se completion_dependency não satisfeita', () => {
    const tasks = [
      { id: 'desenho', status: 'in_progress' },
      { id: 'laudo', status: 'in_progress' },
    ];
    const deps = [
      { task_id: 'laudo', dependency_type: 'completion_dependency', dependency_target_type: 'task', target_task_id: 'desenho', required_status: 'completed' },
    ];
    const r = resolver.canCompleteTask('laudo', { tasks, deps });
    expect(r.ok).toBe(false);
    expect(r.blockedBy).toHaveLength(1);
  });

  it('permite conclusão quando completion_dependency satisfeita', () => {
    const tasks = [
      { id: 'desenho', status: 'completed' },
      { id: 'laudo', status: 'in_progress' },
    ];
    const deps = [
      { task_id: 'laudo', dependency_type: 'completion_dependency', dependency_target_type: 'task', target_task_id: 'desenho', required_status: 'completed' },
    ];
    expect(resolver.canCompleteTask('laudo', { tasks, deps }).ok).toBe(true);
  });

  it('completion_dependency NÃO impede início (canStartTask ignora completion)', () => {
    const tasks = [
      { id: 'desenho', status: 'in_progress' },
      { id: 'laudo', status: 'available' },
    ];
    const deps = [
      { task_id: 'laudo', dependency_type: 'completion_dependency', dependency_target_type: 'task', target_task_id: 'desenho', required_status: 'completed' },
    ];
    // laudo pode iniciar junto com desenho (só não pode concluir antes)
    expect(resolver.canStartTask('laudo', { tasks, deps }).ok).toBe(true);
  });
});
