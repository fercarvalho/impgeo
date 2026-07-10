// Matriz de autorização de gestão de tarefas (#4). Trava o comportamento do
// antigo _canManageTask ao separá-lo em canActOnTask/canAssignTo — a lógica de
// escopo (scopeCheck) tem que ser IDÊNTICA. db.pool.query fake roteado por SQL.
import { describe, it, expect } from 'vitest'
import { createRequire } from 'module'
const require = createRequire(import.meta.url)
const { scopeCheck, canActOnTask, canAssignTo } = require('../task-authz')

// Fake db: role por user, manager do projeto, e histórico de delegação.
function fakeDb({ roles = {}, projectManager = {}, history = [] } = {}) {
  return {
    pool: {
      query: async (sql, params) => {
        if (/FROM users/.test(sql)) return { rows: roles[params[0]] ? [{ role: roles[params[0]] }] : [] }
        if (/FROM projects/.test(sql)) return { rows: projectManager[params[0]] ? [{ manager_user_id: projectManager[params[0]] }] : [{ manager_user_id: null }] }
        if (/task_assignments_history/.test(sql)) {
          const hit = history.some(h => h.by === params[0] && h.to === params[1])
          return { rows: hit ? [{ '?column?': 1 }] : [] }
        }
        return { rows: [] }
      },
    },
  }
}

const task = (over = {}) => ({ id: 't1', project_id: 'p1', assignee_user_id: 'u_target', ...over })

describe('#4 · scopeCheck — superadmin', () => {
  it('superadmin pode tudo', async () => {
    const db = fakeDb({ roles: { u_target: 'admin' } })
    expect(await scopeCheck(db, { id: 'sa', role: 'superadmin' }, task(), 'u_target')).toBe(true)
  })
})

describe('#4 · scopeCheck — admin', () => {
  it('admin pode agir sobre tarefa de usuário comum', async () => {
    const db = fakeDb({ roles: { u_target: 'user' } })
    expect(await scopeCheck(db, { id: 'ad', role: 'admin' }, task(), 'u_target')).toBe(true)
  })
  it('admin NÃO pode sobre alvo que é outro admin', async () => {
    const db = fakeDb({ roles: { u_target: 'admin' } })
    expect(await scopeCheck(db, { id: 'ad', role: 'admin' }, task(), 'u_target')).toBe(false)
  })
  it('admin NÃO pode sobre alvo superadmin', async () => {
    const db = fakeDb({ roles: { u_target: 'superadmin' } })
    expect(await scopeCheck(db, { id: 'ad', role: 'admin' }, task(), 'u_target')).toBe(false)
  })
  it('admin pode sobre SI mesmo (mesmo sendo admin)', async () => {
    const db = fakeDb({ roles: { ad: 'admin' } })
    expect(await scopeCheck(db, { id: 'ad', role: 'admin' }, task(), 'ad')).toBe(true)
  })
})

describe('#4 · scopeCheck — manager', () => {
  const mgr = { id: 'mg', role: 'manager' }
  it('sem alvo (tarefa disponível) → pode', async () => {
    const db = fakeDb({})
    expect(await scopeCheck(db, mgr, task({ assignee_user_id: null }), null)).toBe(true)
  })
  it('alvo = ele mesmo → pode', async () => {
    const db = fakeDb({ roles: { mg: 'manager' } })
    expect(await scopeCheck(db, mgr, task(), 'mg')).toBe(true)
  })
  it('alvo usuário comum → pode', async () => {
    const db = fakeDb({ roles: { u_target: 'user' } })
    expect(await scopeCheck(db, mgr, task(), 'u_target')).toBe(true)
  })
  it('alvo é gestor de outro projeto (manager), mas ele gerencia o projeto da tarefa → pode', async () => {
    const db = fakeDb({ roles: { u_target: 'manager' }, projectManager: { p1: 'mg' } })
    expect(await scopeCheck(db, mgr, task(), 'u_target')).toBe(true)
  })
  it('alvo manager, projeto NÃO é dele, mas já delegou antes → pode', async () => {
    const db = fakeDb({ roles: { u_target: 'manager' }, projectManager: { p1: 'outro' }, history: [{ by: 'mg', to: 'u_target' }] })
    expect(await scopeCheck(db, mgr, task(), 'u_target')).toBe(true)
  })
  it('alvo manager, projeto de outro, sem histórico → NÃO pode', async () => {
    const db = fakeDb({ roles: { u_target: 'manager' }, projectManager: { p1: 'outro' }, history: [] })
    expect(await scopeCheck(db, mgr, task(), 'u_target')).toBe(false)
  })
})

describe('#4 · scopeCheck — usuário comum', () => {
  it('user comum não gerencia nada', async () => {
    const db = fakeDb({ roles: { u_target: 'user' } })
    expect(await scopeCheck(db, { id: 'u', role: 'user' }, task(), 'u_target')).toBe(false)
  })
  it('actor ausente → false', async () => {
    expect(await scopeCheck(fakeDb({}), null, task(), 'x')).toBe(false)
  })
})

describe('#4 · wrappers = scopeCheck com o alvo certo', () => {
  it('canActOnTask usa o assignee ATUAL da tarefa', async () => {
    const db = fakeDb({ roles: { u_target: 'admin' } })
    // admin agindo sobre tarefa cujo dono é outro admin → false (mesmo caminho do scopeCheck)
    expect(await canActOnTask(db, { id: 'ad', role: 'admin' }, task({ assignee_user_id: 'u_target' }))).toBe(false)
  })
  it('canAssignTo usa o ALVO explícito, não o assignee', async () => {
    const db = fakeDb({ roles: { u_target: 'admin', novo: 'user' } })
    // tarefa é de um admin, mas atribuir para "novo" (user comum) → true (avalia o alvo)
    expect(await canAssignTo(db, { id: 'ad', role: 'admin' }, task({ assignee_user_id: 'u_target' }), 'novo')).toBe(true)
  })
  it('canActOnTask e canAssignTo(assignee) coincidem', async () => {
    const db = fakeDb({ roles: { u_target: 'user' } })
    const t = task({ assignee_user_id: 'u_target' })
    const actor = { id: 'mg', role: 'manager' }
    expect(await canActOnTask(db, actor, t)).toBe(await canAssignTo(db, actor, t, t.assignee_user_id))
  })
})
