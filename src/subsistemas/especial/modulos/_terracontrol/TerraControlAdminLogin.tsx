// Tela de login do admin.terracontrol.viverdepj.com.br.
// Visualmente é IDÊNTICA ao LoginScreen do tc_user — paleta verde→azul,
// glassmorphism, spotlight, grid de pontos com gradient.
// Mas o submit chama /api/auth/login-terracontrol-admin que:
//   - Valida credenciais contra a tabela `users` (impgeo)
//   - **Antes de emitir token**, confirma acesso ao módulo `terracontrol`
//   - Sem acesso → 403 com mensagem clara
// Após sucesso, popula o AuthContext do impgeo normalmente; o TerraControlAdminShell
// detecta e renderiza <TerraControl /> direto (skip Picker).

import React, { useEffect, useMemo, useRef, useState } from 'react'
import { User, Lock, Eye, EyeOff, Loader2 } from 'lucide-react'
import Footer from '@/components/Footer'
import { useAuth } from '@/contexts/AuthContext'

// Base API: igual ao AuthContext do impgeo
const isLocalEnv =
  typeof window !== 'undefined' &&
  (window.location.hostname === 'localhost' ||
    window.location.hostname === '127.0.0.1' ||
    window.location.hostname === '0.0.0.0' ||
    window.location.hostname.endsWith('.local'))

const API_BASE_URL: string = isLocalEnv
  ? 'http://localhost:9001/api'
  : ((import.meta.env.VITE_API_URL as string | undefined) ?? '/api')

const TerraControlAdminLogin: React.FC = () => {
  const { updateUser } = useAuth()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const bgDots = useMemo(() => {
    const VIEWBOX_W = 1440, step = 52
    const cols = Math.ceil(VIEWBOX_W / step) + 1
    const rows = Math.ceil(920 / step) + 1
    const GREEN: [number, number, number] = [72, 163, 38]
    const BLUE:  [number, number, number] = [0, 65, 177]
    const interp = (t: number) => {
      const c = Math.max(0, Math.min(1, t))
      const r = Math.round(GREEN[0] + (BLUE[0] - GREEN[0]) * c)
      const g = Math.round(GREEN[1] + (BLUE[1] - GREEN[1]) * c)
      const b = Math.round(GREEN[2] + (BLUE[2] - GREEN[2]) * c)
      return `rgb(${r}, ${g}, ${b})`
    }
    return Array.from({ length: cols * rows }, (_, i) => {
      const x = (i % cols) * step
      const y = Math.floor(i / cols) * step
      return { x, y, color: interp(x / VIEWBOX_W) }
    })
  }, [])

  const spotlightRef = useRef<HTMLDivElement>(null)
  const dotsLayerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const GREEN: [number, number, number] = [72, 163, 38]
    const BLUE:  [number, number, number] = [0, 65, 177]
    const onMove = (e: MouseEvent) => {
      const el = spotlightRef.current
      if (el) {
        const t = Math.max(0, Math.min(1, e.clientX / window.innerWidth))
        const r = Math.round(GREEN[0] + (BLUE[0] - GREEN[0]) * t)
        const g = Math.round(GREEN[1] + (BLUE[1] - GREEN[1]) * t)
        const b = Math.round(GREEN[2] + (BLUE[2] - GREEN[2]) * t)
        el.style.background = `radial-gradient(650px circle at ${e.clientX}px ${e.clientY}px, rgba(${r},${g},${b},0.18), transparent 65%)`
        el.style.opacity = '1'
      }
      const dl = dotsLayerRef.current
      if (dl) {
        const m = `radial-gradient(200px circle at ${e.clientX}px ${e.clientY}px, black 20%, transparent 100%)`
        dl.style.webkitMaskImage = m
        dl.style.setProperty('mask-image', m)
      }
    }
    const onLeave = () => {
      if (spotlightRef.current) spotlightRef.current.style.opacity = '0'
    }
    window.addEventListener('mousemove', onMove)
    document.documentElement.addEventListener('mouseleave', onLeave)
    return () => {
      window.removeEventListener('mousemove', onMove)
      document.documentElement.removeEventListener('mouseleave', onLeave)
    }
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (isSubmitting) return
    setError('')
    if (!username.trim() || !password) {
      setError('Informe usuário e senha.')
      return
    }
    setIsSubmitting(true)
    try {
      const res = await fetch(`${API_BASE_URL}/auth/login-terracontrol-admin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ username: username.trim(), password }),
      })
      const data = await res.json()
      if (!res.ok || !data?.success) {
        setError(data?.error || 'Falha ao autenticar')
        return
      }
      // Popula AuthContext do impgeo: token em sessionStorage + user no state
      if (data.token) sessionStorage.setItem('authToken', data.token)
      if (data.refreshToken) sessionStorage.setItem('refreshToken', data.refreshToken)
      updateUser(data.user, data.token)
      // O TerraControlAdminShell vai detectar `user` populado e renderizar TerraControl direto.
    } catch (e: any) {
      setError(e?.message || 'Erro de conexão')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="relative min-h-screen flex flex-col tc-login-page-bg">
      <h1 className="sr-only">TerraControl Admin — Login</h1>

      <div className="absolute inset-0 overflow-hidden pointer-events-none select-none" aria-hidden="true">
        <div ref={spotlightRef} className="absolute inset-0" style={{ opacity: 0, transition: 'opacity 0.4s ease' }} />
        <div ref={dotsLayerRef} className="absolute inset-0">
          <svg className="absolute inset-0 w-full h-full" viewBox="0 0 1440 900" preserveAspectRatio="xMidYMid slice">
            {bgDots.map((d, i) => (
              <circle key={i} cx={d.x} cy={d.y} r="1.8" fill={d.color} opacity="0.85" />
            ))}
          </svg>
        </div>
        {/* Ondas decorativas (mesmas do LoginScreen do tc_user) */}
        <svg className="absolute inset-0 w-full h-full tc-login-svg-bg" viewBox="0 0 1440 900" preserveAspectRatio="xMidYMid slice">
          <path d="M-200,160 C100,60 350,260 680,140 C980,30 1180,230 1500,120" fill="none" stroke="#48A326" strokeWidth="1.5" className="tc-svg-wave-1" />
          <path d="M-200,340 C150,240 400,440 750,300 C1060,175 1270,380 1600,260" fill="none" stroke="#0041B1" strokeWidth="1"   className="tc-svg-wave-2" />
          <path d="M-200,520 C200,420 460,620 820,480 C1130,355 1340,550 1640,440" fill="none" stroke="#48A326" strokeWidth="1.5" className="tc-svg-wave-3" />
          <path d="M-200,700 C250,600 520,800 890,650 C1160,520 1360,710 1640,610" fill="none" stroke="#0041B1" strokeWidth="1"   className="tc-svg-wave-4" />
        </svg>
      </div>

      <div className="relative z-10 flex flex-col items-center justify-center flex-1 min-h-screen py-10 px-4">
        <div className="tc-login-card w-full max-w-md rounded-3xl p-6 sm:p-8">
          <div className="text-center mb-8">
            <img src="/logo_terracontrol.png" alt="TerraControl" className="h-16 w-auto object-contain mx-auto" />
            <h2 className="text-2xl font-bold mt-3 tracking-tight bg-gradient-to-r from-tc-green to-tc-blue bg-clip-text text-transparent">
              TerraControl
            </h2>
            <p className="text-xs uppercase tracking-wider text-gray-400 font-semibold mt-1">
              Acesso administrador
            </p>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-3 font-medium">
              Entre com sua conta do impgeo
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="relative">
              <div className="absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none z-10">
                <User className="h-4 w-4 text-gray-400" />
              </div>
              <input
                id="tc-admin-username"
                name="username"
                type="text"
                value={username}
                onChange={(e) => { setUsername(e.target.value); setError('') }}
                placeholder=" "
                className="tc-float-input"
                autoComplete="username"
                autoFocus
                required
              />
              <label htmlFor="tc-admin-username" className="tc-float-label">Usuário (impgeo)</label>
            </div>

            <div className="relative">
              <div className="absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none z-10">
                <Lock className="h-4 w-4 text-gray-400" />
              </div>
              <input
                id="tc-admin-password"
                name="password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => { setPassword(e.target.value); setError('') }}
                placeholder=" "
                className="tc-float-input pr-11"
                autoComplete="current-password"
                required
              />
              <label htmlFor="tc-admin-password" className="tc-float-label">Senha</label>
              <button
                type="button"
                onClick={() => setShowPassword(v => !v)}
                aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 z-10"
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>

            {error && (
              <div role="alert" className="tc-error-block rounded-xl p-3.5">
                <p className="text-sm font-medium">{error}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full py-3.5 px-4 mt-1 rounded-xl font-semibold text-white bg-gradient-to-r from-tc-green to-tc-blue hover:from-tc-green-dark hover:to-tc-blue-dark shadow-lg shadow-tc-blue/25 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {isSubmitting
                ? (<><Loader2 className="w-4 h-4 animate-spin" /> Entrando...</>)
                : 'Entrar no TerraControl'}
            </button>
          </form>
        </div>
        <p className="mt-6 text-xs text-gray-400 dark:text-gray-500 text-center max-w-md">
          Apenas usuários do impgeo com acesso ao módulo TerraControl podem entrar aqui.
        </p>
      </div>

      <style>{`
        .tc-login-page-bg { background: linear-gradient(135deg, #ecfdf5 0%, #eff6ff 40%, #e0e7ff 100%); }
        html.dark .tc-login-page-bg { background: linear-gradient(135deg, #0a1a0e 0%, #0f172a 40%, #0a1a3e 100%); }
        .tc-login-card {
          background: rgba(255,255,255,0.82);
          backdrop-filter: blur(24px);
          border: 1px solid rgba(72,163,38,0.20);
          box-shadow: 0 25px 50px -12px rgba(0,65,177,0.10), 0 10px 24px -6px rgba(0,0,0,0.06);
        }
        html.dark .tc-login-card { background: rgba(30,41,59,0.85); border-color: rgba(72,163,38,0.30); }
        .tc-float-input {
          width: 100%; height: 3.5rem;
          padding: 1.375rem 1rem 0.375rem 2.75rem;
          border: 1px solid rgba(209,213,219,0.70);
          border-radius: 0.75rem;
          background: rgba(255,255,255,0.65);
          color: #111827; font-size: 0.9375rem;
        }
        html.dark .tc-float-input { background: rgba(15,23,42,0.70); border-color: rgba(72,163,38,0.25); color: #f1f5f9; }
        .tc-float-input::placeholder { color: transparent; }
        .tc-float-input:focus { outline: none; border-color: #48A326; box-shadow: 0 0 0 3px rgba(72,163,38,0.18); }
        .tc-float-label {
          position: absolute; left: 2.75rem; top: 50%; transform: translateY(-50%);
          font-size: 0.9375rem; color: #9ca3af; pointer-events: none;
          transition: top 0.18s ease, transform 0.18s ease, font-size 0.18s ease, color 0.18s ease;
          white-space: nowrap;
        }
        .tc-float-input:focus ~ .tc-float-label,
        .tc-float-input:not(:placeholder-shown) ~ .tc-float-label {
          top: 0.55rem; transform: translateY(0);
          font-size: 0.625rem; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: #0041B1;
        }
        html.dark .tc-float-input:focus ~ .tc-float-label,
        html.dark .tc-float-input:not(:placeholder-shown) ~ .tc-float-label { color: #86CA2D; }
        .tc-error-block { background: rgba(254,226,226,0.80); border: 1px solid rgba(252,165,165,0.60); color: #dc2626; }
        html.dark .tc-error-block { background: rgba(127,29,29,0.50); border-color: rgba(239,68,68,0.40); color: #fca5a5; }
        .tc-login-svg-bg .tc-svg-wave-1 { opacity: 0.20; }
        .tc-login-svg-bg .tc-svg-wave-2 { opacity: 0.13; }
        .tc-login-svg-bg .tc-svg-wave-3 { opacity: 0.13; }
        .tc-login-svg-bg .tc-svg-wave-4 { opacity: 0.09; }
      `}</style>

      <Footer />
    </div>
  )
}

export default TerraControlAdminLogin
