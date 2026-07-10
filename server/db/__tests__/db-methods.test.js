// Guarda do split do data-layer (#15 A): ao mover métodos da classe Database para
// db/<dominio>.js via Object.assign, o CONJUNTO de métodos da instância tem que
// permanecer idêntico ao snapshot. Pega método perdido no recorte, colisão de
// nome entre arquivos-domínio (Object.assign sobrescreve em silêncio), ou typo.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { createRequire } from 'module'
const require = createRequire(import.meta.url)
const Database = require('../../database-pg')
const here = dirname(fileURLToPath(import.meta.url))
const snapshot = JSON.parse(readFileSync(join(here, 'db-methods.snapshot.json'), 'utf8'))

const currentMethods = () =>
  Object.getOwnPropertyNames(Database.prototype).filter(n => n !== 'constructor').sort()

describe('#15 A · inventário de métodos do data-layer', () => {
  it('o conjunto de métodos é idêntico ao snapshot (nada perdido no split)', () => {
    const now = currentMethods()
    const missing = snapshot.filter(m => !now.includes(m))
    const extra = now.filter(m => !snapshot.includes(m))
    expect({ missing, extra }).toEqual({ missing: [], extra: [] })
  })

  it('métodos migrados continuam presentes e chamáveis', () => {
    const db = Object.create(Database.prototype)
    for (const m of ['criarFeedback', 'obterFeedbacks', 'aceitarFeedback']) {
      expect(typeof db[m]).toBe('function')
    }
  })
})
