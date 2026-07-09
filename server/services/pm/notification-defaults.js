// ═══════════════════════════════════════════════════════════════════════════
// server/services/pm/notification-defaults.js
//
// Defaults de notificação (melhoria #7). Antes viviam num objeto estático em
// database-pg.js (mudar exigia deploy). Agora:
//   - FACTORY_DEFAULTS: os defaults "de fábrica" (seed da tabela + fallback).
//   - a tabela `notification_defaults` guarda os defaults EFETIVOS (editáveis
//     pelo admin, sem deploy); o database-pg.js carrega num cache em memória.
//   - resolveDefault/buildDefaultsGrid: helpers puros (testáveis) que o
//     database-pg.js usa por cima do cache, com fallback no factory.
//
// Escopos: 'impgeo' e 'tc'. Cada tipo → {push, email}. Tipos '_meta:*' guardam
// toggles que não são um evento (ex.: '_meta:foreground').
// ═══════════════════════════════════════════════════════════════════════════

'use strict';

const CHANNELS = ['push', 'email'];

// Defaults de fábrica — fonte do seed inicial e fallback se a tabela/cache
// estiverem vazios. Ao adicionar um tipo novo aqui, o boot-seeder insere a
// linha correspondente na tabela (ON CONFLICT DO NOTHING), preservando edições.
const FACTORY_DEFAULTS = Object.freeze({
  impgeo: {
    transaction_confirm_needed:     { push: true,  email: false },
    tc_record_created:              { push: true,  email: false },
    tc_budget_revision_requested:   { push: true,  email: false },
    tc_budget_payment_completed:    { push: true,  email: false },
    pm_task_assigned:               { push: true,  email: false },
    pm_task_accepted:               { push: true,  email: false },
    pm_task_refused:                { push: true,  email: false },
    pm_task_overdue:                { push: true,  email: false },
    pm_review_requested:            { push: true,  email: false },
    pm_review_decided:              { push: true,  email: false },
    pm_help_requested:              { push: true,  email: false },
    pm_help_accepted:               { push: true,  email: false },
    pm_help_refused:                { push: true,  email: true },
    pm_project_paid:                { push: true,  email: false },
    pm_project_completed:           { push: true,  email: false },
    pm_pomodoro_overage_requested:  { push: true,  email: true },
    pm_pomodoro_overage_decided:    { push: true,  email: true },
    pm_due_date_requested:          { push: true,  email: true },
    pm_due_date_proposed:           { push: true,  email: true },
    pm_due_date_decided:            { push: true,  email: true },
    pm_task_uncompleted:            { push: true,  email: true },
    pm_uncomplete_requested:        { push: true,  email: true },
    pm_uncomplete_decided:          { push: true,  email: true },
    pm_uncomplete_self_notice:      { push: true,  email: true },
    pm_review_followup:             { push: true,  email: true },
    pm_delegation_requested:        { push: true,  email: true },
    pm_delegation_decided:          { push: true,  email: true },
    '_meta:foreground':             { push: false, email: false },
  },
  tc: {
    tc_record_approved:             { push: true, email: true },
    tc_record_edited:               { push: true, email: true },
    tc_budget_sent:                 { push: true, email: true },
    tc_budget_revised:              { push: true, email: true },
    tc_budget_payment_confirmed:    { push: true, email: true },
    '_meta:foreground':             { push: false, email: false },
  },
});

const cacheKey = (scope, type, channel) => `${scope}:${type}:${channel}`;

/**
 * Resolve o default efetivo de (scope,type,channel): cache (tabela) → factory →
 * false (segurança: tipo desconhecido não dispara sem opt-in explícito).
 * @param {Map<string,boolean>|null} effectiveMap  cache scope:type:channel→bool
 */
function resolveDefault(effectiveMap, scope, type, channel) {
  if (effectiveMap && effectiveMap.has(cacheKey(scope, type, channel))) {
    return effectiveMap.get(cacheKey(scope, type, channel));
  }
  const forType = FACTORY_DEFAULTS[scope] && FACTORY_DEFAULTS[scope][type];
  if (forType && typeof forType[channel] === 'boolean') return forType[channel];
  return false;
}

/**
 * Conjunto de tipos conhecidos de um escopo: união do factory + o que está no
 * cache (tabela). Ordenado para saída estável.
 */
function knownTypes(effectiveMap, scope) {
  const set = new Set(Object.keys(FACTORY_DEFAULTS[scope] || {}));
  if (effectiveMap) {
    for (const key of effectiveMap.keys()) {
      const [s, type] = key.split(':');
      // key = scope:type:channel — mas type pode conter ':' (ex.: _meta:foreground)
      if (s === scope) set.add(key.slice(scope.length + 1, key.lastIndexOf(':')));
    }
  }
  return Array.from(set).sort();
}

/**
 * Grid completo de defaults de um escopo: [{notification_type, channel, enabled}].
 * Usa resolveDefault para cada célula (cache → factory).
 */
function buildDefaultsGrid(effectiveMap, scope) {
  const grid = [];
  for (const type of knownTypes(effectiveMap, scope)) {
    for (const channel of CHANNELS) {
      grid.push({ notification_type: type, channel, enabled: resolveDefault(effectiveMap, scope, type, channel) });
    }
  }
  return grid;
}

module.exports = { FACTORY_DEFAULTS, CHANNELS, cacheKey, resolveDefault, knownTypes, buildDefaultsGrid };
