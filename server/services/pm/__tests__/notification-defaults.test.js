// Testes dos helpers puros de defaults de notificação (#7).
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const nd = require('../notification-defaults');

describe('notification-defaults · resolveDefault', () => {
  it('cache (tabela) tem precedência sobre o factory', () => {
    const map = new Map([[nd.cacheKey('impgeo', 'pm_task_assigned', 'email'), true]]);
    // factory tem email:false; o cache diz true
    expect(nd.resolveDefault(map, 'impgeo', 'pm_task_assigned', 'email')).toBe(true);
    // sem override no cache → cai no factory (push:true)
    expect(nd.resolveDefault(map, 'impgeo', 'pm_task_assigned', 'push')).toBe(true);
  });

  it('sem cache usa o factory', () => {
    expect(nd.resolveDefault(null, 'impgeo', 'pm_help_refused', 'email')).toBe(true);
    expect(nd.resolveDefault(null, 'impgeo', 'pm_task_overdue', 'email')).toBe(false);
    expect(nd.resolveDefault(new Map(), 'tc', 'tc_budget_sent', 'push')).toBe(true);
  });

  it('tipo desconhecido → false (segurança)', () => {
    expect(nd.resolveDefault(null, 'impgeo', 'tipo_inexistente', 'push')).toBe(false);
    expect(nd.resolveDefault(null, 'escopo_inexistente', 'x', 'push')).toBe(false);
  });

  it('lida com tipos _meta:* (têm ":" no nome)', () => {
    expect(nd.resolveDefault(null, 'impgeo', '_meta:foreground', 'push')).toBe(false);
    const map = new Map([[nd.cacheKey('impgeo', '_meta:foreground', 'push'), true]]);
    expect(nd.resolveDefault(map, 'impgeo', '_meta:foreground', 'push')).toBe(true);
  });
});

describe('notification-defaults · buildDefaultsGrid', () => {
  it('cobre todos os tipos do escopo × {push,email} usando o factory', () => {
    const grid = nd.buildDefaultsGrid(null, 'impgeo');
    const types = new Set(grid.map(g => g.notification_type));
    // todos os tipos do factory impgeo presentes
    for (const t of Object.keys(nd.FACTORY_DEFAULTS.impgeo)) expect(types.has(t)).toBe(true);
    // 2 canais por tipo
    expect(grid.length).toBe(types.size * 2);
    // um valor conhecido bate com o factory
    const cell = grid.find(g => g.notification_type === 'pm_due_date_requested' && g.channel === 'email');
    expect(cell.enabled).toBe(true);
  });

  it('inclui tipos que só existem no cache (tabela), não no factory', () => {
    const map = new Map([[nd.cacheKey('impgeo', 'tipo_novo_via_admin', 'push'), true]]);
    const grid = nd.buildDefaultsGrid(map, 'impgeo');
    const cell = grid.find(g => g.notification_type === 'tipo_novo_via_admin' && g.channel === 'push');
    expect(cell?.enabled).toBe(true);
  });

  it('escopo tc traz os tipos tc', () => {
    const grid = nd.buildDefaultsGrid(null, 'tc');
    const types = new Set(grid.map(g => g.notification_type));
    expect(types.has('tc_budget_sent')).toBe(true);
    expect(types.has('pm_task_assigned')).toBe(false); // é do impgeo
  });
});
