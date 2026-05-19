// Contexto de autenticação para tc_users (usuários externos do TerraControl).
// Mantido SEPARADO do AuthContext do impgeo porque:
//   - Tabelas, endpoints e JWT diferentes (aud='terracontrol')
//   - Pode coexistir com sessão impgeo (cookie + sessionStorage isolados)
//   - Storage próprio: 'tcAuthToken' / 'tcRefreshToken' / 'tcUser'
//
// API:
//   const { tcUser, tcToken, isLoading, forcePasswordChange,
//           login, logout, refreshTcUser, updateTcUser } = useTcAuth()
//
// Login bem-sucedido com flag forcePasswordChange=true → componente decide
// mostrar modal não-fechável de troca de senha.

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'

const STORAGE_TOKEN = 'tcAuthToken'
const STORAGE_REFRESH = 'tcRefreshToken'
const STORAGE_USER = 'tcUserCache'

// Base da API — em dev local usa localhost:9001; em prod usa relative '/api'.
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
  createdVia?: string
  lastLogin?: string | null
  createdAt?: string
  updatedAt?: string
}

export interface TcLoginResponse {
  success: boolean
  forcePasswordChange?: boolean
  error?: string
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

interface TcAuthProviderProps {
  children: ReactNode
}

export const TcAuthProvider: React.FC<TcAuthProviderProps> = ({ children }) => {
  const [tcToken, setTcToken] = useState<string | null>(() => sessionStorage.getItem(STORAGE_TOKEN))
  const [tcUser, setTcUser] = useState<TcUser | null>(() => safeParseUser(sessionStorage.getItem(STORAGE_USER)))
  const [isLoading, setIsLoading] = useState<boolean>(true)
  const [forcePasswordChange, setForcePasswordChange] = useState<boolean>(false)
  const mountedRef = useRef(true)

  useEffect(() => { mountedRef.current = true; return () => { mountedRef.current = false } }, [])

  const persistAuth = useCallback((token: string | null, user: TcUser | null, refreshToken?: string | null) => {
    if (token) sessionStorage.setItem(STORAGE_TOKEN, token); else sessionStorage.removeItem(STORAGE_TOKEN)
    if (user)  sessionStorage.setItem(STORAGE_USER, JSON.stringify(user)); else sessionStorage.removeItem(STORAGE_USER)
    if (refreshToken !== undefined) {
      if (refreshToken) sessionStorage.setItem(STORAGE_REFRESH, refreshToken)
      else              sessionStorage.removeItem(STORAGE_REFRESH)
    }
  }, [])

  // Validação inicial: se há token no storage, refaz GET /me para confirmar.
  // Se 401, tenta refresh com refreshToken; se falhar, limpa tudo.
  useEffect(() => {
    const init = async () => {
      const storedToken = sessionStorage.getItem(STORAGE_TOKEN)
      if (!storedToken) { setIsLoading(false); return }
      try {
        const res = await fetch(`${API_BASE_URL}/tc-auth/me`, {
          headers: { Authorization: `Bearer ${storedToken}` },
        })
        if (res.ok) {
          const json = await res.json()
          if (mountedRef.current && json?.success && json?.data) {
            setTcUser(json.data)
            setForcePasswordChange(!!json.data.forcePasswordChange)
            sessionStorage.setItem(STORAGE_USER, JSON.stringify(json.data))
          }
        } else if (res.status === 401) {
          // tenta refresh
          const refreshToken = sessionStorage.getItem(STORAGE_REFRESH)
          if (refreshToken) {
            const r = await fetch(`${API_BASE_URL}/tc-auth/refresh`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ refreshToken }),
            })
            if (r.ok) {
              const data = await r.json()
              if (mountedRef.current && data?.success) {
                setTcToken(data.token)
                setTcUser(data.tcUser)
                setForcePasswordChange(!!data.tcUser?.forcePasswordChange)
                persistAuth(data.token, data.tcUser, data.refreshToken)
                setIsLoading(false)
                return
              }
            }
          }
          // refresh falhou — limpa
          if (mountedRef.current) {
            setTcToken(null); setTcUser(null); persistAuth(null, null, null)
          }
        }
      } catch (e) {
        console.error('Erro ao validar sessão tc_user:', e)
      } finally {
        if (mountedRef.current) setIsLoading(false)
      }
    }
    init()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const login = useCallback(async (username: string, password: string): Promise<TcLoginResponse> => {
    try {
      const res = await fetch(`${API_BASE_URL}/tc-auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      })
      const data = await res.json()
      if (!res.ok || !data?.success) {
        return { success: false, error: data?.error || 'Falha ao autenticar' }
      }
      setTcToken(data.token)
      setTcUser(data.tcUser)
      setForcePasswordChange(!!data.forcePasswordChange)
      persistAuth(data.token, data.tcUser, data.refreshToken || null)
      return { success: true, forcePasswordChange: !!data.forcePasswordChange }
    } catch (error: any) {
      return { success: false, error: error?.message || 'Erro de conexão' }
    }
  }, [persistAuth])

  const logout = useCallback(async () => {
    const refreshToken = sessionStorage.getItem(STORAGE_REFRESH)
    try {
      if (tcToken) {
        await fetch(`${API_BASE_URL}/tc-auth/logout`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tcToken}` },
          body: JSON.stringify({ refreshToken }),
        })
      }
    } catch { /* swallow */ }
    setTcToken(null); setTcUser(null); setForcePasswordChange(false)
    persistAuth(null, null, null)
  }, [tcToken, persistAuth])

  const refreshTcUser = useCallback(async (): Promise<boolean> => {
    if (!tcToken) return false
    try {
      const res = await fetch(`${API_BASE_URL}/tc-auth/me`, {
        headers: { Authorization: `Bearer ${tcToken}` },
      })
      if (!res.ok) return false
      const json = await res.json()
      if (json?.success && json?.data) {
        setTcUser(json.data)
        setForcePasswordChange(!!json.data.forcePasswordChange)
        sessionStorage.setItem(STORAGE_USER, JSON.stringify(json.data))
        return true
      }
    } catch (e) {
      console.error('refreshTcUser falhou:', e)
    }
    return false
  }, [tcToken])

  const updateTcUser = useCallback((data: Partial<TcUser>) => {
    setTcUser(prev => {
      const next = prev ? { ...prev, ...data } : (data as TcUser)
      sessionStorage.setItem(STORAGE_USER, JSON.stringify(next))
      return next
    })
  }, [])

  const value = useMemo<TcAuthContextType>(() => ({
    tcUser, tcToken, isLoading, forcePasswordChange,
    login, logout, refreshTcUser, updateTcUser, setForcePasswordChange,
  }), [tcUser, tcToken, isLoading, forcePasswordChange, login, logout, refreshTcUser, updateTcUser])

  return <TcAuthContext.Provider value={value}>{children}</TcAuthContext.Provider>
}

// Helper exportado para outros componentes do _terracontrol que queiram fetch
// com token automaticamente injetado (sem precisar de contexto).
export { API_BASE_URL as TC_API_BASE_URL, STORAGE_TOKEN as TC_STORAGE_TOKEN }
