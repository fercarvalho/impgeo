// Auditoria central do PM (#8): buildWhere monta o WHERE parametrizado correto e
// queryPmAudit roda o COUNT + a query com/sem paginação, retornando {items,total}.
import { describe, it, expect } from 'vitest'
import { createRequire } from 'module'
const require = createRequire(import.meta.url)
const { buildWhere, queryPmAudit } = require('../audit-service')

describe('#8 · buildWhere', () => {
  it('sem filtros → WHERE vazio, sem params', () => {
    const { where, params } = buildWhere({})
    expect(where).toBe('')
    expect(params).toEqual([])
  })

  it('um filtro → 1 condição parametrizada', () => {
    const { where, params } = buildWhere({ source: 'task' })
    expect(where).toBe('WHERE a.source = $1')
    expect(params).toEqual(['task'])
  })

  it('múltiplos filtros → numeração sequencial e ordem estável', () => {
    const { where, params } = buildWhere({
      source: 'pomodoro', actorId: 'u1', eventType: 'STARTED', from: '2026-01-01', to: '2026-02-01',
    })
    expect(where).toBe(
      'WHERE a.source = $1 AND a.actor_id = $2 AND a.event_type = $3 AND a.occurred_at >= $4 AND a.occurred_at <= $5'
    )
    expect(params).toEqual(['pomodoro', 'u1', 'STARTED', '2026-01-01', '2026-02-01'])
  })

  it('filtra por entityId', () => {
    const { where, params } = buildWhere({ entityId: 'task-42' })
    expect(where).toBe('WHERE a.entity_id = $1')
    expect(params).toEqual(['task-42'])
  })
})

// db.pool.query fake roteado por regex (padrão dos testes de service do PM).
function fakeDb({ total = 3, rows = [{ id: 'e1' }] } = {}) {
  const calls = []
  return {
    calls,
    pool: {
      query: async (sql, params) => {
        calls.push({ sql, params })
        if (/COUNT\(\*\)/i.test(sql)) return { rows: [{ total }] }
        return { rows }
      },
    },
  }
}

describe('#8 · queryPmAudit', () => {
  it('com limit: roda COUNT + query com LIMIT/OFFSET e retorna {items,total}', async () => {
    const db = fakeDb({ total: 7, rows: [{ id: 'a' }, { id: 'b' }] })
    const out = await queryPmAudit(db, { source: 'task', limit: 2, offset: 4 })

    expect(out.total).toBe(7)
    expect(out.items).toEqual([{ id: 'a' }, { id: 'b' }])

    const [countCall, dataCall] = db.calls
    expect(countCall.sql).toMatch(/COUNT\(\*\)/)
    expect(countCall.sql).toMatch(/FROM pm_audit_v/)
    expect(countCall.params).toEqual(['task'])
    // filtro ($1) + limit ($2) + offset ($3)
    expect(dataCall.sql).toMatch(/LIMIT \$2 OFFSET \$3/)
    expect(dataCall.sql).toMatch(/LEFT JOIN users/)
    expect(dataCall.sql).toMatch(/ORDER BY a\.occurred_at DESC/)
    expect(dataCall.params).toEqual(['task', 2, 4])
  })

  it('sem limit: não pagina (query sem LIMIT/OFFSET)', async () => {
    const db = fakeDb({ total: 2, rows: [{ id: 'x' }, { id: 'y' }] })
    const out = await queryPmAudit(db, {})
    expect(out.total).toBe(2)
    const dataCall = db.calls[1]
    expect(dataCall.sql).not.toMatch(/LIMIT/)
    expect(dataCall.params).toEqual([])
  })
})
