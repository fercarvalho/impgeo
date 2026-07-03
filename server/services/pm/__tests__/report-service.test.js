// Testes do report-service (Fase 7): cálculo do período anterior por frequência.
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const report = require('../report-service');

// Usa uma data fixa (BRT). 2026-06-15 é uma segunda-feira.
const now = new Date('2026-06-15T15:00:00-03:00');

describe('report-service · previousPeriod', () => {
  it('daily → ontem', () => {
    const p = report.previousPeriod('daily', now);
    expect(p.start).toBe('2026-06-14');
    expect(p.end).toBe('2026-06-14');
  });

  it('weekly → semana anterior (seg a dom)', () => {
    const p = report.previousPeriod('weekly', now);
    // semana atual começa 2026-06-15 (seg); anterior = 06-08 a 06-14
    expect(p.start).toBe('2026-06-08');
    expect(p.end).toBe('2026-06-14');
  });

  it('monthly → mês anterior completo', () => {
    const p = report.previousPeriod('monthly', now);
    expect(p.start).toBe('2026-05-01');
    expect(p.end).toBe('2026-05-31');
  });

  it('quarterly → trimestre anterior', () => {
    // junho = Q2 (abr-jun); anterior = Q1 (jan-mar)
    const p = report.previousPeriod('quarterly', now);
    expect(p.start).toBe('2026-01-01');
    expect(p.end).toBe('2026-03-31');
  });

  it('yearly → ano anterior', () => {
    const p = report.previousPeriod('yearly', now);
    expect(p.start).toBe('2025-01-01');
    expect(p.end).toBe('2025-12-31');
  });

  it('frequência inválida → null', () => {
    expect(report.previousPeriod('bogus', now)).toBeNull();
  });
});

describe('report-service · viradas de mês/ano', () => {
  it('daily em 1º de janeiro → 31/12 do ano anterior', () => {
    const p = report.previousPeriod('daily', new Date('2026-01-01T10:00:00-03:00'));
    expect(p.start).toBe('2025-12-31');
  });
  it('monthly em janeiro → dezembro do ano anterior', () => {
    const p = report.previousPeriod('monthly', new Date('2026-01-10T10:00:00-03:00'));
    expect(p.start).toBe('2025-12-01');
    expect(p.end).toBe('2025-12-31');
  });
});
