// Prioridade de extração do token de acesso (#9) — o coração da correção de
// segurança: o cookie httpOnly de impersonation deve vencer o header e o
// accessToken, para que o token de impersonation nunca dependa de storage JS.
import { describe, it, expect } from 'vitest'
import { createRequire } from 'module'
const require = createRequire(import.meta.url)
const { extractAccessToken } = require('../token-extraction')

const LONG = 'x'.repeat(40) // > 10 chars, passa no guard de header

describe('#9 · extractAccessToken — prioridade', () => {
  it('cookie de impersonation vence o header Bearer', () => {
    const req = {
      headers: { authorization: `Bearer superadmin-${LONG}` },
      cookies: { impersonationToken: `imp-${LONG}`, accessToken: `sa-${LONG}` },
    }
    expect(extractAccessToken(req)).toBe(`imp-${LONG}`)
  })

  it('cookie de impersonation vence o accessToken (sem header)', () => {
    const req = {
      headers: {},
      cookies: { impersonationToken: `imp-${LONG}`, accessToken: `sa-${LONG}` },
    }
    expect(extractAccessToken(req)).toBe(`imp-${LONG}`)
  })

  it('sem impersonation, header Bearer vence o accessToken (fallback dev)', () => {
    const req = {
      headers: { authorization: `Bearer hdr-${LONG}` },
      cookies: { accessToken: `sa-${LONG}` },
    }
    expect(extractAccessToken(req)).toBe(`hdr-${LONG}`)
  })

  it('sem impersonation e sem header, usa accessToken', () => {
    const req = { headers: {}, cookies: { accessToken: `sa-${LONG}` } }
    expect(extractAccessToken(req)).toBe(`sa-${LONG}`)
  })

  it('cai em tcAdminAccessToken quando não há accessToken', () => {
    const req = { headers: {}, cookies: { tcAdminAccessToken: `tca-${LONG}` } }
    expect(extractAccessToken(req)).toBe(`tca-${LONG}`)
  })

  it('ignora header Bearer inválido (null/undefined/curto) e cai no cookie', () => {
    for (const bad of ['Bearer null', 'Bearer undefined', 'Bearer short']) {
      const req = { headers: { authorization: bad }, cookies: { accessToken: `sa-${LONG}` } }
      expect(extractAccessToken(req)).toBe(`sa-${LONG}`)
    }
  })

  it('retorna undefined quando não há token algum', () => {
    expect(extractAccessToken({ headers: {}, cookies: {} })).toBeUndefined()
    expect(extractAccessToken({ headers: {} })).toBeUndefined()
  })

  it('impersonationToken presente mas vazio NÃO é usado (cai no fluxo normal)', () => {
    const req = {
      headers: { authorization: `Bearer hdr-${LONG}` },
      cookies: { impersonationToken: '', accessToken: `sa-${LONG}` },
    }
    expect(extractAccessToken(req)).toBe(`hdr-${LONG}`)
  })
})
