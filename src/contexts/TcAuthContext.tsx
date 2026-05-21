// Contexto de autenticação para tc_users (usuários externos do TerraControl).
// Mantido SEPARADO do AuthContext do impgeo porque:
//   - Tabelas, endpoints e JWT diferentes (aud='terracontrol')
//   - Pode coexistir com sessão impgeo (cookies isolados por Domain)
//
// PR #2 (PWA): a fonte de verdade da sessão migrou pra **cookie httpOnly**
// (tcAccessToken / tcRefreshToken em .terracontrol.*). Necessário pra PWA
// standalone em iOS — sessionStorage é zerado a cada fechamento do app
// instalado, mas cookies persistem.
//
// Backwards-compat:
//   - tcToken continua exposto na API do contexto (alimentado pela resposta
//     de /refresh ou /login), então os fetches existentes que usam
//     `Bearer ${tcToken}` seguem funcionando enquanto a sessão dura.
//   - sessionStorage de tcAuthToken/tcRefreshToken é lido em init() como
//     fallback (migra sessões pré-PWA sem forçar relogin).
//   - A migração progressiva dos consumidores pra `tcApi` (cookies-only) é
//     trabalho de PRs futuros — feito 1 componente por vez sem urgência.
//
// API: const { tcUser, tcToken, isLoading, forcePasswordChange,
//             login, logout, refreshTcUser, updateTcUser } = useTcAuth()

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { setTcRefreshFailureHandler } from '@/utils/tcApi'
import { setAuthState as setPwaAuthState } from '@/pwa/installPrompt'

const STORAGE_TOKEN_LEGACY   = 'tcAuthToken'
const STORAGE_REFRESH_LEGACY = 'tcRefreshToken'
const STORAGE_USER = 'tcUserCache'

const isLocalEnv =
  typeof window !== 'undefined' &&
  (window.location.hostname === 'localhost' ||
    window.location.hostname === '127.0.0.1' ||
    window.location.hostname === '0.0.0.0' ||
    window.location.hostname.endsWith('.local'))

const API_BASE_URL: string = isLocalEnv
  ? 'http://localhost:9001/api'
  : ((import.meta.env.VITE_API_URL as string | undefined) ?? '/api')

export interface TcUser {
  id: string
  username: string
  firstName?: string | null
  lastName?: string | null
  email?: string | null
  emailVerifiedAt?: string | null
  phone?: string | null
  cpf?: string | null
  birthDate?: string | null
  gender?: string | null
  address?: any
  photoUrl?: string | null
  forcePasswordChange?: boolean
  isActive?: boolean
  canShare?: boolean
  editRecordsPermission?: 'none' | 'created' | 'assigned' | 'all'
  deleteRecordsPermission?: 'none' | 'created' | 'all'
  emailNotifications?: boolean
  createdVia?: string
  lastLogin?: string | null
  createdAt?: string
  updatedAt?: string
  requiresProfileCompletion?: boolean
}

export interface TcLoginResponse {
  success: boolean
  forcePasswordChange?: boolean
  error?: string
  code?: 'invite_expired' | 'invite_pending' | string
  email?: string | null
  status?: number
}

interface TcAuthContextType {
  tcUser: TcUser | null
  tcToken: string | null
  isLoading: boolean
  forcePasswordChange: boolean
  login: (username: string, password: string) => Promise<TcLoginResponse>
  logout: () => Promise<void>
  refreshTcUser: () => Promise<boolean>
  updateTcUser: (data: Partial<TcUser>) => void
  setForcePasswordChange: (v: boolean) => void
}

const TcAuthContext = createContext<TcAuthContextType | null>(null)

export const useTcAuth = (): TcAuthContextType => {
  const ctx = useContext(TcAuthContext)
  if (!ctx) throw new Error('useTcAuth deve ser usado dentro de <TcAuthProvider>')
  return ctx
}

const safeParseUser = (raw: string | null): TcUser | null => {
  if (!raw) return null
  try { return JSON.parse(raw) as TcUser } catch { return null }
}

const safeGet = (key: string): string | null => {
  try { return sessionStorage.getItem(key) } catch { return null }
}
const safeSet = (key: string, value: string): void => {
  try { sessionStorage.setItem(key, value) } catch { /* storage bloqueado */ }
}
const safeRemove = (key: string): void => {
  try { sessionStorage.removeItem(key) } catch { /* storage bloqueado */ }
}

interface TcAuthProviderProps {
  children: ReactNode
}

export const TcAuthProvider: React.FC<TcAuthProviderProps> = ({ children }) => {
  // tcToken: in-memory cache do access token mais recente (vindo de /refresh
  // ou /login). Mantém compat com componentes que usam Bearer ${tcToken}.
  const [tcToken, setTcToken] = useState<string | null>(null)
  // tcUser: cache em sessionStorage só pra renderização inicial sem flash.
  // A fonte de verdade é o backend; init() revalida.
  const [tcUser, setTcUser] = useState<TcUser | null>(() => safeParseUser(safeGet(STORAGE_USER)))
  const [isLoading, setIsLoading] = useState<boolean>(true)
  const [forcePasswordChange, setForcePasswordChange] = useState<boolean>(false)
  const mountedRef = useRef(true)

  useEffect(() => { mountedRef.current = true; return () => { mountedRef.current = false } }, [])

  const persistUserCache = useCallback((user: TcUser | null) => {
    if (user) safeSet(STORAGE_USER, JSON.stringify(user))
    else      safeRemove(STORAGE_USER)
  }, [])

  const clearLegacyTokens = useCallback(() => {
    safeRemove(STORAGE_TOKEN_LEGACY)
    safeRemove(STORAGE_REFRESH_LEGACY)
  }, [])

  const applyAuth = useCallback((token: string | null, user: TcUser | null) => {
    setTcToken(token)
    setTcUser(user)
    persistUserCache(user)
    setForcePasswordChange(!!user?.forcePasswordChange)
  }, [persistUserCache])

  const clearAuth = useCallback(() => {
    setTcToken(null)
    setTcUser(null)
    setForcePasswordChange(false)
    persistUserCache(null)
    clearLegacyTokens()
  }, [persistUserCache, clearLegacyTokens])

  // init(): cookie é fonte primária. Fallback pra body por compatibilidade
  // com sessões existentes (pré-PWA). Aceita sessão estabelecida via:
  //   1. Cookie tcRefreshToken (PR #2 +): POST /refresh sem body
  //   2. sessionStorage legado: POST /refresh com refreshToken no body
  useEffect(() => {
    const init = async () => {
      // (1) Tenta refresh via cookie
      try {
        const r = await fetch(`${API_BASE_URL}/tc-auth/refresh`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: '{}',
        })
        if (r.ok) {
          const data = await r.json()
          if (data?.success && mountedRef.current) {
            applyAuth(data.token ?? null, data.tcUser ?? null)
            clearLegacyTokens()
            setIsLoading(false)
            return
          }
        }
      } catch { /* segue pro fallback */ }

      // (2) Fallback: sessionStorage legado (migra sessões pré-PWA)
      const legacyRefresh = safeGet(STORAGE_REFRESH_LEGACY)
      if (legacyRefresh) {
        try {
          const r = await fetch(`${API_BASE_URL}/tc-auth/refresh`, {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ refreshToken: legacyRefresh }),
          })
          if (r.ok) {
            const data = await r.json()
            if (data?.success && mountedRef.current) {
              applyAuth(data.token ?? null, data.tcUser ?? null)
              clearLegacyTokens()
              setIsLoading(false)
              return
            }
          }
        } catch { /* swallow */ }
      }

      // (3) Sem sessão válida
      if (mountedRef.current) {
        clearAuth()
        setIsLoading(false)
      }
    }
    init()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const login = useCallback(async (username: string, password: string): Promise<TcLoginResponse> => {
    try {
      const res = await fetch(`${API_BASE_URL}/tc-auth/login`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      })
      const data = await res.json()
      if (!res.ok || !data?.success) {
        return {
          success: false,
          error: data?.error || 'Falha ao autenticar',
          code: data?.code,
          email: data?.email ?? null,
          status: res.status,
        }
      }
      // Cookies já foram setados pelo backend via Set-Cookie.
      // O token no body é mantido por 1 release (legacyTokenInBody) pra alimentar
      // o tcToken in-memory que os componentes existentes consomem.
      applyAuth(data.token ?? null, data.tcUser ?? null)
      clearLegacyTokens()
      setForcePasswordChange(!!data.forcePasswordChange)
      return { success: true, forcePasswordChange: !!data.forcePasswordChange }
    } catch (error: any) {
      return { success: false, error: error?.message || 'Erro de conexão' }
    }
  }, [applyAuth, clearLegacyTokens])

  const logout = useCallback(async () => {
    try {
      await fetch(`${API_BASE_URL}/tc-auth/logout`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      })
    } catch { /* swallow */ }
    clearAuth()
  }, [clearAuth])

  // tcApi (PR #2) avisa quando seu refresh interceptor falha — limpamos
  // a sessão pra UI cair na tela de login do tc-public.
  useEffect(() => {
    setTcRefreshFailureHandler(() => {
      if (mountedRef.current) clearAuth()
    })
    return () => setTcRefreshFailureHandler(null)
  }, [clearAuth])

  // PR #4 (PWA): libera o install prompt do tc-public APENAS após login.
  // Visitante anônimo (link compartilhado) nunca vê o convite de instalação.
  useEffect(() => {
    setPwaAuthState(!!tcUser)
  }, [tcUser])

  const refreshTcUser = useCallback(async (): Promise<boolean> => {
    try {
      const headers: Record<string, string> = {}
      if (tcToken) headers.Authorization = `Bearer ${tcToken}`
      const res = await fetch(`${API_BASE_URL}/tc-auth/me`, {
        credentials: 'include',
        headers,
      })
      if (!res.ok) return false
      const json = await res.json()
      if (json?.success && json?.data && mountedRef.current) {
        setTcUser(json.data)
        setForcePasswordChange(!!json.data.forcePasswordChange)
        persistUserCache(json.data)
        return true
      }
    } catch (e) {
      console.error('refreshTcUser falhou:', e)
    }
    return false
  }, [tcToken, persistUserCache])

  const updateTcUser = useCallback((data: Partial<TcUser>) => {
    setTcUser(prev => {
      const next = prev ? { ...prev, ...data } : (data as TcUser)
      persistUserCache(next)
      return next
    })
  }, [persistUserCache])

  const value = useMemo<TcAuthContextType>(() => ({
    tcUser, tcToken, isLoading, forcePasswordChange,
    login, logout, refreshTcUser, updateTcUser, setForcePasswordChange,
  }), [tcUser, tcToken, isLoading, forcePasswordChange, login, logout, refreshTcUser, updateTcUser])

  return <TcAuthContext.Provider value={value}>{children}</TcAuthContext.Provider>
}

// Helpers exportados (mantidos pra compat com consumidores existentes que
// usam STORAGE_TOKEN como chave pra ler/escrever sessionStorage). Após a
// migração progressiva pra tcApi, esses re-exports podem ser removidos.
export { API_BASE_URL as TC_API_BASE_URL, STORAGE_TOKEN_LEGACY as TC_STORAGE_TOKEN }
