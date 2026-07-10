// Timezone configurável (#13): a resolução do APP_TIMEZONE precisa aceitar IANA
// válido, cair no default BRT quando ausente/inválido, e avisar no caso inválido.
import { describe, it, expect, vi } from 'vitest'
import { createRequire } from 'module'
const require = createRequire(import.meta.url)
const { resolveTimezone, isValidTimeZone, DEFAULT_TZ, APP_TIMEZONE } = require('../timezone')

describe('#13 · resolveTimezone', () => {
  it('usa um IANA válido do env', () => {
    expect(resolveTimezone('America/New_York')).toBe('America/New_York')
    expect(resolveTimezone('UTC')).toBe('UTC')
    expect(resolveTimezone('Europe/Lisbon')).toBe('Europe/Lisbon')
  })

  it('cai no default quando ausente', () => {
    expect(resolveTimezone(undefined)).toBe(DEFAULT_TZ)
    expect(resolveTimezone('')).toBe(DEFAULT_TZ)
    expect(resolveTimezone(null)).toBe(DEFAULT_TZ)
  })

  it('cai no default e AVISA quando inválido', () => {
    const warn = vi.fn()
    expect(resolveTimezone('Nao/Existe', { warn })).toBe(DEFAULT_TZ)
    expect(warn).toHaveBeenCalledOnce()
    expect(warn.mock.calls[0][0]).toContain('Nao/Existe')
  })

  it('ausente NÃO avisa (é o caminho normal)', () => {
    const warn = vi.fn()
    resolveTimezone(undefined, { warn })
    expect(warn).not.toHaveBeenCalled()
  })

  it('default é America/Sao_Paulo (BRT)', () => {
    expect(DEFAULT_TZ).toBe('America/Sao_Paulo')
  })
})

describe('#13 · isValidTimeZone', () => {
  it('aceita IANA válidos e rejeita lixo', () => {
    expect(isValidTimeZone('America/Sao_Paulo')).toBe(true)
    expect(isValidTimeZone('UTC')).toBe(true)
    expect(isValidTimeZone('Nao/Existe')).toBe(false)
    expect(isValidTimeZone('')).toBe(false)
    expect(isValidTimeZone(undefined)).toBe(false)
    expect(isValidTimeZone(123)).toBe(false)
  })
})

describe('#13 · APP_TIMEZONE', () => {
  it('é um IANA válido (default ou o do env)', () => {
    expect(isValidTimeZone(APP_TIMEZONE)).toBe(true)
  })
})
