// Consistência dos 3 pontos de sincronização (#6): o manifest do frontend
// (SUBSYSTEMS[].moduleKeys) e o catálogo do backend (MODULES_CATALOG) precisam
// concordar. Este teste roda no CI e REPROVA qualquer divergência manifest↔catálogo
// — a fonte mais comum de "módulo some do menu / vai pro subsistema errado".
//
// Importa o manifest TS direto (é self-contained; o esbuild do vitest transpila).
import { describe, it, expect } from 'vitest'
import { createRequire } from 'module'
import { SUBSYSTEMS } from '../../../../src/subsistemas/manifest'
const require = createRequire(import.meta.url)
const { MODULES_CATALOG } = require('../../../modules-catalog')

// catálogo agrupado por subsystemKey → Set(moduleKeys)
function catalogBySub() {
  const m = new Map()
  for (const mod of MODULES_CATALOG) {
    if (!m.has(mod.subsystemKey)) m.set(mod.subsystemKey, new Set())
    m.get(mod.subsystemKey).add(mod.moduleKey)
  }
  return m
}

const sortedArr = (set) => [...set].sort()

describe('#6 · consistência manifest ↔ catálogo', () => {
  it('as chaves de subsistema batem (bidirecional)', () => {
    const manifestKeys = new Set(SUBSYSTEMS.map(s => s.key))
    const catalogKeys = new Set(MODULES_CATALOG.map(m => m.subsystemKey))
    expect(sortedArr(catalogKeys)).toEqual(sortedArr(manifestKeys))
  })

  it('para cada subsistema, moduleKeys do manifest == moduleKeys do catálogo', () => {
    const cat = catalogBySub()
    for (const sub of SUBSYSTEMS) {
      const manifestSet = new Set(sub.moduleKeys)
      const catalogSet = cat.get(sub.key) || new Set()
      // Diferença nos dois sentidos, com mensagem clara de qual módulo diverge.
      const soNoManifest = [...manifestSet].filter(k => !catalogSet.has(k))
      const soNoCatalogo = [...catalogSet].filter(k => !manifestSet.has(k))
      expect({ subsistema: sub.key, soNoManifest, soNoCatalogo })
        .toEqual({ subsistema: sub.key, soNoManifest: [], soNoCatalogo: [] })
    }
  })

  it('todo moduleKey do manifest existe no catálogo (e vice-versa)', () => {
    const manifestModules = new Set(SUBSYSTEMS.flatMap(s => s.moduleKeys))
    const catalogModules = new Set(MODULES_CATALOG.map(m => m.moduleKey))
    expect(sortedArr(manifestModules)).toEqual(sortedArr(catalogModules))
  })
})

describe('#6 · sanidade do catálogo', () => {
  it('não há moduleKey duplicado', () => {
    const keys = MODULES_CATALOG.map(m => m.moduleKey)
    const dups = keys.filter((k, i) => keys.indexOf(k) !== i)
    expect(dups).toEqual([])
  })

  it('sortOrder é único dentro de cada subsistema', () => {
    const seen = new Map() // subsystemKey → Set(sortOrder)
    const collisions = []
    for (const m of MODULES_CATALOG) {
      if (!seen.has(m.subsystemKey)) seen.set(m.subsystemKey, new Set())
      const s = seen.get(m.subsystemKey)
      if (s.has(m.sortOrder)) collisions.push(`${m.subsystemKey}:${m.sortOrder}`)
      s.add(m.sortOrder)
    }
    expect(collisions).toEqual([])
  })

  it('todo módulo tem subsystemKey e moduleKey não-vazios', () => {
    for (const m of MODULES_CATALOG) {
      expect(typeof m.moduleKey).toBe('string')
      expect(m.moduleKey.length).toBeGreaterThan(0)
      expect(typeof m.subsystemKey).toBe('string')
      expect(m.subsystemKey.length).toBeGreaterThan(0)
    }
  })
})
