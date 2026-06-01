// ═══════════════════════════════════════════════════════════════════════════
// server/services/pm/dependency-resolver.js
//
// Lógica PURA (sem I/O) de resolução de dependências de tarefas do projeto.
// Dado o conjunto de tarefas/etapas/deps, decide:
//   - quais tarefas `pending` já podem virar `available` (start_dependency)
//   - se uma tarefa pode `completar` (completion_dependency)
//
// Conceitos (alinha req item 5):
//   start_dependency      → a tarefa só FICA DISPONÍVEL após o alvo cumprir
//                           required_status. (gate de início)
//   completion_dependency → a tarefa pode iniciar, mas só CONCLUI após o alvo
//                           cumprir required_status. (gate de conclusão)
//
// required_status default = 'completed' quando null.
// ═══════════════════════════════════════════════════════════════════════════

'use strict';

const DEFAULT_REQUIRED_STATUS = 'completed';

/**
 * Avalia se o alvo de uma dependência cumpriu o status exigido.
 * @param {object} dep         - { dependency_target_type, target_task_id, target_stage_id, required_status }
 * @param {Map}    taskById    - Map<taskId, { status }>
 * @param {Map}    stageById   - Map<stageId, { status }>
 */
function isDependencySatisfied(dep, taskById, stageById) {
  const required = dep.required_status || DEFAULT_REQUIRED_STATUS;
  if (dep.dependency_target_type === 'task') {
    const target = taskById.get(dep.target_task_id);
    if (!target) return false;
    // 'completed' é o terminal; aceita também se exigir status já alcançado.
    return target.status === required;
  }
  if (dep.dependency_target_type === 'stage') {
    const target = stageById.get(dep.target_stage_id);
    if (!target) return false;
    return target.status === required;
  }
  return false;
}

/**
 * Indexa tasks e stages por id.
 */
function _index({ tasks = [], stages = [] }) {
  const taskById = new Map(tasks.map(t => [t.id, t]));
  const stageById = new Map(stages.map(s => [s.id, s]));
  return { taskById, stageById };
}

/**
 * Agrupa deps por task_id, separando start vs completion.
 */
function _groupDeps(deps = []) {
  const startByTask = new Map();
  const completionByTask = new Map();
  for (const d of deps) {
    const bucket = d.dependency_type === 'start_dependency' ? startByTask : completionByTask;
    if (!bucket.has(d.task_id)) bucket.set(d.task_id, []);
    bucket.get(d.task_id).push(d);
  }
  return { startByTask, completionByTask };
}

/**
 * Retorna os IDs das tarefas atualmente `pending` cujas start_dependencies
 * estão TODAS satisfeitas — ou seja, devem ser promovidas a `available`.
 *
 * @param {object} input - { tasks, stages, deps }
 * @returns {string[]} taskIds a promover
 */
function resolveAvailableTasks({ tasks = [], stages = [], deps = [] }) {
  const { taskById, stageById } = _index({ tasks, stages });
  const { startByTask } = _groupDeps(deps);
  const toPromote = [];

  for (const task of tasks) {
    if (task.status !== 'pending') continue;
    const starts = startByTask.get(task.id) || [];
    const allSatisfied = starts.every(d => isDependencySatisfied(d, taskById, stageById));
    if (allSatisfied) toPromote.push(task.id);
  }
  return toPromote;
}

/**
 * Uma tarefa pode ser concluída? (todas as completion_dependencies satisfeitas)
 *
 * @param {string} taskId
 * @param {object} input - { tasks, stages, deps }
 * @returns {{ ok: boolean, blockedBy: object[] }}
 */
function canCompleteTask(taskId, { tasks = [], stages = [], deps = [] }) {
  const { taskById, stageById } = _index({ tasks, stages });
  const { completionByTask } = _groupDeps(deps);
  const comps = completionByTask.get(taskId) || [];
  const blockedBy = comps.filter(d => !isDependencySatisfied(d, taskById, stageById));
  return { ok: blockedBy.length === 0, blockedBy };
}

/**
 * Uma tarefa pode ser iniciada? (todas as start_dependencies satisfeitas)
 * Útil pra validar `startTask` no backend mesmo que a task já esteja 'available'.
 */
function canStartTask(taskId, { tasks = [], stages = [], deps = [] }) {
  const { taskById, stageById } = _index({ tasks, stages });
  const { startByTask } = _groupDeps(deps);
  const starts = startByTask.get(taskId) || [];
  const blockedBy = starts.filter(d => !isDependencySatisfied(d, taskById, stageById));
  return { ok: blockedBy.length === 0, blockedBy };
}

module.exports = {
  DEFAULT_REQUIRED_STATUS,
  isDependencySatisfied,
  resolveAvailableTasks,
  canCompleteTask,
  canStartTask,
};
