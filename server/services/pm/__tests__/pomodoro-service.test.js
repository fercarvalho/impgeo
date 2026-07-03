// Testes do pomodoro-service (Fase 5): cálculo de tempo ativo, limite diário,
// skip-upgrade, e modos. Mocka db.pool.
import { describe, it, expect, vi } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const pomodoro = require('../pomodoro-service');

// ─── activeSecondsNow (puro) ──────────────────────────────────────────────────
describe('pomodoro-service · activeSecondsNow', () => {
  it('desconta pausas acumuladas', () => {
    const started = new Date('2026-06-01T10:00:00Z').getTime();
    const now = started + 600 * 1000; // 10 min depois
    const s = { started_at: new Date(started).toISOString(), total_paused_seconds: 120, state: 'running' };
    expect(pomodoro.activeSecondsNow(s, now)).toBe(480); // 600 - 120
  });

  it('desconta a pausa em curso quando state=paused', () => {
    const started = new Date('2026-06-01T10:00:00Z').getTime();
    const pauseStart = started + 300 * 1000;
    const now = started + 600 * 1000;
    const s = { started_at: new Date(started).toISOString(), total_paused_seconds: 0, state: 'paused', pause_started_at: new Date(pauseStart).toISOString() };
    expect(pomodoro.activeSecondsNow(s, now)).toBe(300); // 600 - 300 em pausa
  });

  it('nunca retorna negativo', () => {
    const now = Date.now();
    const s = { started_at: new Date(now).toISOString(), total_paused_seconds: 9999, state: 'running' };
    expect(pomodoro.activeSecondsNow(s, now)).toBe(0);
  });
});

// ─── Modos ────────────────────────────────────────────────────────────────────
describe('pomodoro-service · modos', () => {
  it('mapeia minutos → modo e pausa', () => {
    expect(pomodoro.MODE_BY_MINUTES[25]).toBe('POMODORO_25_5');
    expect(pomodoro.MODE_BY_MINUTES[50]).toBe('POMODORO_50_10');
    expect(pomodoro.MODE_BY_MINUTES[100]).toBe('POMODORO_100_20');
    expect(pomodoro.BREAK_BY_MINUTES[25]).toBe(5);
    expect(pomodoro.BREAK_BY_MINUTES[100]).toBe(20);
  });
});

// ─── Mock de db ───────────────────────────────────────────────────────────────
function makeDb({ config = {}, todayMinutes = 0, activeSession = null } = {}) {
  const cfg = { user_id: 'u1', daily_limit_minutes: 400, next_cycle_forced_minutes: null, ...config };
  const queries = [];
  return {
    _queries: queries,
    generateId: () => 'gen' + Math.random().toString(36).slice(2),
    pool: {
      connect: async () => ({
        query: async (sql, p) => { queries.push(sql.trim().split('\n')[0]); return { rows: [] }; },
        release: () => {},
      }),
      query: vi.fn(async (sql, p) => {
        queries.push(sql.trim().split('\n')[0]);
        if (/FROM user_pomodoro_config/.test(sql)) return { rows: [cfg] };
        if (/SUM\(total_active_seconds\)/.test(sql)) return { rows: [{ min: todayMinutes }] };
        if (/total_minutes_worked FROM pomodoro_daily_stats/.test(sql)) return { rows: [{ total_minutes_worked: todayMinutes }] };
        if (/state IN \('running','paused','break'\)/.test(sql)) return { rows: activeSession ? [activeSession] : [] };
        if (/INSERT INTO task_work_sessions/.test(sql)) return { rows: [] };
        if (/SELECT \* FROM task_work_sessions WHERE id/.test(sql)) return { rows: [{ id: 'gen1', user_id: 'u1', planned_minutes: 25, break_planned_minutes: 5, pomodoro_mode: 'POMODORO_25_5', state: 'running', started_at: new Date().toISOString(), total_paused_seconds: 0 }] };
        if (/SELECT project_id FROM project_tasks/.test(sql)) return { rows: [{ project_id: 'p1' }] };
        return { rows: [] };
      }),
    },
  };
}

describe('pomodoro-service · startSession (limite diário = recomendação)', () => {
  it('NÃO bloqueia mais o início perto do limite (limite virou recomendação)', async () => {
    const db = makeDb({ todayMinutes: 390 }); // antes bloqueava; agora só recomenda
    const r = await pomodoro.startSession(db, { userId: 'u1', taskId: 't1', plannedMinutes: 25 });
    expect(r.session).toBeDefined();
    expect(r.warning).toBeNull(); // 390+25=415 < 480 (recomendado)
  });

  it('avisa over_recommended ao passar de 480 (sem travar)', async () => {
    const db = makeDb({ todayMinutes: 470 });
    const r = await pomodoro.startSession(db, { userId: 'u1', taskId: 't1', plannedMinutes: 25 });
    expect(r.warning?.code).toBe('over_recommended'); // 495 > 480, < 500
  });

  it('avisa overage_approval_needed ao passar de 500 (sem travar)', async () => {
    const db = makeDb({ todayMinutes: 490 });
    const r = await pomodoro.startSession(db, { userId: 'u1', taskId: 't1', plannedMinutes: 25 });
    expect(r.warning?.code).toBe('overage_approval_needed'); // 515 > 500
  });

  it('exige tarefa ou categoria', async () => {
    const db = makeDb({ todayMinutes: 0 });
    let err;
    try { await pomodoro.startSession(db, { userId: 'u1', plannedMinutes: 25 }); }
    catch (e) { err = e; }
    expect(err.code).toBe('target_required');
  });

  it('não força mais o foco (modelo antigo de upgrade removido)', async () => {
    // Mesmo com next_cycle_forced_minutes setado, o foco NÃO muda — pular pausa
    // agora acumula o INTERVALO, não aumenta o foco.
    const db = makeDb({ config: { next_cycle_forced_minutes: 50, carryover_break_minutes: 5 }, todayMinutes: 0 });
    const result = await pomodoro.startSession(db, { userId: 'u1', taskId: 't1', plannedMinutes: 25 });
    expect(result.session).toBeDefined();
    expect(result.forced).toBeUndefined();
    const insert = db._queries.find(q => /INSERT INTO task_work_sessions/.test(q));
    expect(insert).toBeDefined();
  });
});
