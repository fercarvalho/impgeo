// Batch do progresso de metas (#5): _metricValuesBatch agrupa as metas por FORMA
// (tasks/projects/focus) e roda ≤3 queries (uma por forma presente), mapeando o
// valor final por métrica. Aqui validamos o dispatch/mapeamento com db fake — a
// correção do SQL é provada por equivalência contra o banco (script local + smoke).
import { describe, it, expect } from 'vitest'
import { createRequire } from 'module'
const require = createRequire(import.meta.url)
const { _metricValuesBatch, _SHAPE } = require('../goals-service')

// Roteia por marcadores distintos de cada SQL de forma.
function fakeDb(rowsByShape) {
  const calls = []
  return {
    calls,
    pool: {
      query: async (sql, params) => {
        const shape = /pomodoro_daily_stats/.test(sql) ? 'focus'
          : /status='concluido'/.test(sql) ? 'projects'
          : /project_tasks/.test(sql) ? 'tasks' : 'unknown'
        calls.push({ shape, params })
        return { rows: rowsByShape[shape] || [] }
      },
    },
  }
}

describe('#5 · _SHAPE', () => {
  it('mapeia métrica → forma', () => {
    expect(_SHAPE('tasks_completed')).toBe('tasks')
    expect(_SHAPE('on_time_pct')).toBe('tasks')
    expect(_SHAPE('projects_completed')).toBe('projects')
    expect(_SHAPE('focus_minutes')).toBe('focus')
  })
})

describe('#5 · _metricValuesBatch', () => {
  it('roda no MÁXIMO 1 query por forma presente e mapeia os valores', async () => {
    const goals = [
      { id: 'g1', metric: 'tasks_completed', scope: 'self', target_user_id: 'u1', period_start: '2026-01-01', period_end: '2026-01-31' },
      { id: 'g2', metric: 'on_time_pct',     scope: 'team', target_user_id: 'm1', period_start: '2026-01-01', period_end: '2026-01-31' },
      { id: 'g3', metric: 'projects_completed', scope: 'global', target_user_id: null, period_start: '2026-01-01', period_end: '2026-01-31' },
      { id: 'g4', metric: 'focus_minutes',   scope: 'user', target_user_id: 'u2', period_start: '2026-01-01', period_end: '2026-01-31' },
    ]
    const db = fakeDb({
      tasks:    [{ goal_id: 'g1', completed: 10, on_time: 8 }, { goal_id: 'g2', completed: 4, on_time: 3 }],
      projects: [{ goal_id: 'g3', n: 5 }],
      focus:    [{ goal_id: 'g4', m: 420 }],
    })

    const values = await _metricValuesBatch(db, goals)

    // 3 formas presentes → exatamente 3 queries
    expect(db.calls.length).toBe(3)
    const shapes = db.calls.map(c => c.shape).sort()
    expect(shapes).toEqual(['focus', 'projects', 'tasks'])

    // tasks_completed → completed; on_time_pct → round(on_time/completed*100)
    expect(values.get('g1')).toBe(10)
    expect(values.get('g2')).toBe(Math.round((3 / 4) * 100)) // 75
    expect(values.get('g3')).toBe(5)
    expect(values.get('g4')).toBe(420)
  })

  it('agrupa metas da MESMA forma numa query só (unnest com N metas)', async () => {
    const goals = [
      { id: 'a', metric: 'tasks_completed', scope: 'self', target_user_id: 'u1', period_start: '2026-01-01', period_end: '2026-01-31' },
      { id: 'b', metric: 'tasks_completed', scope: 'self', target_user_id: 'u2', period_start: '2026-02-01', period_end: '2026-02-28' },
    ]
    const db = fakeDb({ tasks: [{ goal_id: 'a', completed: 1, on_time: 1 }, { goal_id: 'b', completed: 2, on_time: 0 }] })
    await _metricValuesBatch(db, goals)

    expect(db.calls.length).toBe(1) // uma única query p/ as 2 metas 'tasks'
    // arrays paralelos do unnest: [ids, scopes, targets, starts, ends]
    const [ids, scopes, targets] = db.calls[0].params
    expect(ids).toEqual(['a', 'b'])
    expect(scopes).toEqual(['self', 'self'])
    expect(targets).toEqual(['u1', 'u2'])
  })

  it('on_time_pct com 0 concluídas → 0 (sem divisão por zero)', async () => {
    const goals = [{ id: 'z', metric: 'on_time_pct', scope: 'self', target_user_id: 'u', period_start: '2026-01-01', period_end: '2026-01-31' }]
    const db = fakeDb({ tasks: [{ goal_id: 'z', completed: 0, on_time: 0 }] })
    const values = await _metricValuesBatch(db, goals)
    expect(values.get('z')).toBe(0)
  })

  it('meta sem linha no resultado → valor 0', async () => {
    const goals = [{ id: 'q', metric: 'projects_completed', scope: 'global', target_user_id: null, period_start: '2026-01-01', period_end: '2026-01-31' }]
    const db = fakeDb({ projects: [] })
    const values = await _metricValuesBatch(db, goals)
    expect(values.get('q')).toBe(0)
  })
})
