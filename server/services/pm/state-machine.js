// ═══════════════════════════════════════════════════════════════════════════
// server/services/pm/state-machine.js
//
// Single source of truth para os domínios CHECK do PostgreSQL e os helpers
// de validação de transição do módulo PM (Projetos + Tarefas).
//
// Espelha 1:1 os CHECK constraints definidos nas migrations 045+. Manter
// SINCRONIZADO ao adicionar/remover valor em qualquer CHECK do schema PM.
//
// Convenção: constantes em UPPER_SNAKE; valores em snake_case (matchar SQL).
// ═══════════════════════════════════════════════════════════════════════════

'use strict';

// ─── Projeto (status) ─────────────────────────────────────────────────────────
// Espelha CHECK em projects.status. Em PORTUGUÊS pra alinhar com o requisito
// (item 2: "ativo, inativo, pausado, concluído") e com o frontend existente
// (Projects.tsx). Corrigido na migration 047 (a 045 tinha colocado em inglês).
// Semântica:
//   - inativo   = data início futura, ou ainda não iniciado
//   - ativo     = em andamento
//   - pausado   = pausado manual
//   - concluido = concluído (auto se auto_finalize=TRUE, ou manual)
//   - cancelado = cancelado
const PROJECT_STATUSES = Object.freeze({
  INACTIVE:  'inativo',
  ACTIVE:    'ativo',
  PAUSED:    'pausado',
  COMPLETED: 'concluido',
  CANCELED:  'cancelado',
});
const PROJECT_STATUS_VALUES = Object.freeze(Object.values(PROJECT_STATUSES));

// ─── Projeto (source) ─────────────────────────────────────────────────────────
// Espelha CHECK em projects.source.
const PROJECT_SOURCES = Object.freeze(['manual', 'terracontrol_pix', 'imported']);

// ─── Clients (source) ─────────────────────────────────────────────────────────
// Espelha CHECK em clients.source.
const CLIENT_SOURCES = Object.freeze(['manual', 'terracontrol', 'imported']);

// ─── project_events ───────────────────────────────────────────────────────────
// Espelha CHECK em project_events.actor_type.
const PROJECT_EVENT_ACTOR_TYPES = Object.freeze(['user', 'system', 'abacatepay', 'cron']);

// Lista inicial; será expandida nas fases seguintes (cada fase pode adicionar
// novos eventos — basta documentar aqui).
const PROJECT_EVENT_TYPES = Object.freeze([
  'created',
  'updated',
  'status_changed',
  'client_linked',
  'project_created_from_pix',
  'stage_added',
  'stage_completed',
  'task_created',
  'task_completed',
  'completed',
  'canceled',
]);

// ─── Task (status) ────────────────────────────────────────────────────────────
// Será o CHECK em project_tasks.status (migration 047, Fase 3).
// 10 estados conforme requisito do produto.
const TASK_STATUSES = Object.freeze({
  PENDING:            'pending',
  AVAILABLE:          'available',
  IN_PROGRESS:        'in_progress',
  PENDING_ACCEPTANCE: 'pending_acceptance',
  PENDING_REVIEW:     'pending_review',
  PENDING_ADJUSTMENT: 'pending_adjustment',
  COMPLETED:          'completed',
  OVERDUE:            'overdue',
  REFUSED:            'refused',
  CANCELED:           'canceled',
});
const TASK_STATUS_VALUES = Object.freeze(Object.values(TASK_STATUSES));

// Matriz de transições válidas (Fase 4). Estrutura: { [from]: [to, ...] }.
// Revisão (pending_review→completed/pending_adjustment via approve/reject) é
// exercida na Fase 6, mas as arestas já constam aqui.
const ALLOWED_TRANSITIONS = Object.freeze({
  pending:            ['available', 'canceled'],
  available:          ['in_progress', 'pending_acceptance', 'overdue', 'canceled'],
  pending_acceptance: ['available', 'in_progress', 'refused', 'canceled'],
  in_progress:        ['pending_review', 'completed', 'available', 'overdue', 'canceled'],
  pending_review:     ['completed', 'pending_adjustment', 'canceled'],
  pending_adjustment: ['in_progress', 'available', 'canceled'],
  overdue:            ['in_progress', 'completed', 'pending_review', 'canceled'],
  refused:            ['available', 'pending_acceptance', 'canceled'],
  // 'completed' deixou de ser terminal: pode ser REABERTA (desconcluída) por
  // gestor/usuário, voltando para 'available' (req item 5) — o responsável
  // precisa dar play de novo.
  completed:          ['available'],
  canceled:           [],   // terminal
});

// ─── Helpers de validação ─────────────────────────────────────────────────────

function isValidProjectStatus(status) {
  return PROJECT_STATUS_VALUES.includes(status);
}

function isValidProjectSource(source) {
  return PROJECT_SOURCES.includes(source);
}

function isValidClientSource(source) {
  return CLIENT_SOURCES.includes(source);
}

function isValidProjectEventType(eventType) {
  return PROJECT_EVENT_TYPES.includes(eventType);
}

function isValidActorType(actorType) {
  return PROJECT_EVENT_ACTOR_TYPES.includes(actorType);
}

function isValidTaskStatus(status) {
  return TASK_STATUS_VALUES.includes(status);
}

// Será usada na Fase 4. Retorna false até a matriz ser populada.
function canTransitionTask(fromStatus, toStatus) {
  const allowed = ALLOWED_TRANSITIONS[fromStatus];
  if (!allowed) return false;
  if (typeof allowed.has === 'function') return allowed.has(toStatus);
  if (Array.isArray(allowed)) return allowed.includes(toStatus);
  return false;
}

module.exports = {
  // Projeto
  PROJECT_STATUSES,
  PROJECT_STATUS_VALUES,
  PROJECT_SOURCES,
  // Clients
  CLIENT_SOURCES,
  // project_events
  PROJECT_EVENT_ACTOR_TYPES,
  PROJECT_EVENT_TYPES,
  // Task
  TASK_STATUSES,
  TASK_STATUS_VALUES,
  ALLOWED_TRANSITIONS,
  // Helpers
  isValidProjectStatus,
  isValidProjectSource,
  isValidClientSource,
  isValidProjectEventType,
  isValidActorType,
  isValidTaskStatus,
  canTransitionTask,
};
