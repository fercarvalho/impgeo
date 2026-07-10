// Guarda contra o footgun de ordem de rotas do Express que causou o 403 no
// encerramento da impersonation (#9): a rota literal `/api/auth/impersonate/stop`
// PRECISA ser registrada ANTES da param `/api/auth/impersonate/:userId` — senão
// POST /impersonate/stop casa com :userId="stop", cai no start e o
// requireSuperAdmin devolve 403.
import { describe, it, expect } from 'vitest'
import { createRequire } from 'module'
const require = createRequire(import.meta.url)
const createSessionsRoutes = require('../sessions')

const noop = () => {}
const mw = (req, res, next) => next()

function sessionsRouter() {
  return createSessionsRoutes({
    db: {}, authenticateToken: mw, JWT_SECRET: 'x', requireAdmin: mw, requireSuperAdmin: mw,
    setAuthCookies: noop, setTcAdminAuthCookies: noop, clearAuthCookies: noop, clearTcAdminAuthCookies: noop,
    setImpersonationCookie: noop, clearImpersonationCookie: noop,
  })
}

describe('#9 · ordem das rotas de impersonation', () => {
  it('/impersonate/stop é registrada antes de /impersonate/:userId', () => {
    const router = sessionsRouter()
    const paths = router.stack.filter(l => l.route).map(l => l.route.path)
    const stopIdx = paths.indexOf('/api/auth/impersonate/stop')
    const userIdIdx = paths.indexOf('/api/auth/impersonate/:userId')
    expect(stopIdx).toBeGreaterThanOrEqual(0)
    expect(userIdIdx).toBeGreaterThanOrEqual(0)
    expect(stopIdx).toBeLessThan(userIdIdx)
  })
})
