// Testes da state-machine do PM (single source of truth dos CHECK do schema).
// Cobre os validadores de domínio e a matriz ALLOWED_TRANSITIONS de forma
// data-driven, garantindo que canTransitionTask concorda 1:1 com a matriz.
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const sm = require('../state-machine');

// ─── Validadores de domínio ────────────────────────────────────────────────
describe('state-machine · validadores de domínio', () => {
  it('isValidProjectStatus: aceita valores em pt, rejeita inglês/lixo', () => {
    for (const s of sm.PROJECT_STATUS_VALUES) expect(sm.isValidProjectStatus(s)).toBe(true);
    expect(sm.isValidProjectStatus('ativo')).toBe(true);
    expect(sm.isValidProjectStatus('active')).toBe(false); // corrigido na migration 047
    expect(sm.isValidProjectStatus('')).toBe(false);
    expect(sm.isValidProjectStatus(undefined)).toBe(false);
  });

  it('isValidProjectSource', () => {
    expect(sm.isValidProjectSource('manual')).toBe(true);
    expect(sm.isValidProjectSource('terracontrol_pix')).toBe(true);
    expect(sm.isValidProjectSource('imported')).toBe(true);
    expect(sm.isValidProjectSource('terracontrol')).toBe(false); // é source de client, não de project
  });

  it('isValidClientSource (não confundir com project source)', () => {
    expect(sm.isValidClientSource('terracontrol')).toBe(true);
    expect(sm.isValidClientSource('terracontrol_pix')).toBe(false);
    expect(sm.isValidClientSource('manual')).toBe(true);
  });

  it('isValidProjectEventType', () => {
    for (const t of ['created', 'status_changed', 'task_completed', 'canceled']) {
      expect(sm.isValidProjectEventType(t)).toBe(true);
    }
    expect(sm.isValidProjectEventType('deleted')).toBe(false);
  });

  it('isValidActorType', () => {
    for (const t of ['user', 'system', 'abacatepay', 'cron']) {
      expect(sm.isValidActorType(t)).toBe(true);
    }
    expect(sm.isValidActorType('robot')).toBe(false);
  });

  it('isValidTaskStatus cobre os 10 estados', () => {
    expect(sm.TASK_STATUS_VALUES).toHaveLength(10);
    for (const s of sm.TASK_STATUS_VALUES) expect(sm.isValidTaskStatus(s)).toBe(true);
    expect(sm.isValidTaskStatus('done')).toBe(false);
  });
});

// ─── Matriz de transições (data-driven) ────────────────────────────────────
describe('state-machine · ALLOWED_TRANSITIONS (data-driven)', () => {
  it('canTransitionTask concorda 1:1 com a matriz para todo (from → to) válido', () => {
    for (const [from, targets] of Object.entries(sm.ALLOWED_TRANSITIONS)) {
      for (const to of targets) {
        expect(sm.canTransitionTask(from, to)).toBe(true);
      }
    }
  });

  it('nega transição para estado fora da lista de cada origem', () => {
    for (const [from, targets] of Object.entries(sm.ALLOWED_TRANSITIONS)) {
      for (const to of sm.TASK_STATUS_VALUES) {
        if (!targets.includes(to)) expect(sm.canTransitionTask(from, to)).toBe(false);
      }
    }
  });

  it('canceled é terminal (nenhuma saída)', () => {
    expect(sm.ALLOWED_TRANSITIONS.canceled).toEqual([]);
    for (const to of sm.TASK_STATUS_VALUES) {
      expect(sm.canTransitionTask('canceled', to)).toBe(false);
    }
  });

  it('completed só reabre para available (req item 5)', () => {
    expect(sm.canTransitionTask('completed', 'available')).toBe(true);
    expect(sm.canTransitionTask('completed', 'in_progress')).toBe(false);
    expect(sm.canTransitionTask('completed', 'pending_review')).toBe(false);
  });

  it('revisão: pending_review → completed | pending_adjustment (cenários 3/4)', () => {
    expect(sm.canTransitionTask('pending_review', 'completed')).toBe(true);
    expect(sm.canTransitionTask('pending_review', 'pending_adjustment')).toBe(true);
    expect(sm.canTransitionTask('pending_review', 'available')).toBe(false);
  });

  it('bloqueia pulos de etapa e origem desconhecida', () => {
    expect(sm.canTransitionTask('pending', 'completed')).toBe(false);
    expect(sm.canTransitionTask('estado_inexistente', 'available')).toBe(false);
  });
});
