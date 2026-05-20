// Tela de aceite de convite — F2.1.
// Acessada via https://terracontrol.viverdepj.com.br/aceitar-convite?token=XYZ
// vinda do email disparado pelo backend ao admin convidar um tc_user.
//
// Fluxo:
//   1. Monta → GET /api/tc-auth/invite/:token (preview público sem auth)
//   2. Mostra "Olá! <quem> te convidou a acessar como <email>"
//   3. Convidado preenche: username, password (+ confirm), firstName, lastName?
//   4. Submit → POST /api/tc-auth/accept-invite
//   5. Sucesso → redireciona pra LoginScreen com username pré-preenchido
//
// Estados de erro tratados:
//   - 404 token não existe → "Convite não encontrado"
//   - 410 expirado ou já aceito → mensagem específica
//   - 400 username inválido / senha curta / nome vazio → toast/inline

import React, { useEffect, useMemo, useRef, useState } from 'react'
import { User, Lock, Eye, EyeOff, Loader2, AlertTriangle, CheckCircle, Mail } from 'lucide-react'
import Footer from '@/components/Footer'

interface InviteInfo {
  email: string
  invitedByName: string
  expiresAt: string
}

interface Props {
  token: string
}

const TcAcceptInviteScreen: React.FC<Props> = ({ token }) => {
  const [phase, setPhase] = useState<'loading' | 'invalid' | 'form' | 'success'>('loading')
  const [info, setInfo] = useState<InviteInfo | null>(null)
  const [errorMessage, setErrorMessage] = useState('')

  // Form
  const [username, setUsername] = useState('')
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState('')

  // Fundo decorativo (mesmo do LoginScreen — paleta verde→azul + ondas + spotlight + dots)
  const spotlightRef = useRef<HTMLDivElement>(null)
  const dotsLayerRef = useRef<HTMLDivElement>(null)
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
    const onLeave = () => { if (spotlightRef.current) spotlightRef.current.style.opacity = '0' }
    window.addEventListener('mousemove', onMove)
    document.documentElement.addEventListener('mouseleave', onLeave)
    return () => {
      window.removeEventListener('mousemove', onMove)
      document.documentElement.removeEventListener('mouseleave', onLeave)
    }
  }, [])

  // Carrega preview do convite
  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        const res = await fetch(`/api/tc-auth/invite/${encodeURIComponent(token)}`)
        const data = await res.json()
        if (cancelled) return
        if (res.ok && data?.success) {
          setInfo(data.data as InviteInfo)
          setPhase('form')
        } else {
          setErrorMessage(data?.error || 'Convite inválido')
          setPhase('invalid')
        }
      } catch {
        if (!cancelled) {
          setErrorMessage('Erro de conexão. Tente novamente em instantes.')
          setPhase('invalid')
        }
      }
    }
    load()
    return () => { cancelled = true }
  }, [token])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (submitting) return
    setFormError('')

    const normalizedUsername = username.trim().toLowerCase()
    if (!/^[a-z0-9][a-z0-9\-_]{2,}$/.test(normalizedUsername)) {
      setFormError('Username inválido — use ao menos 3 caracteres: minúsculas, números, "-" ou "_"')
      return
    }
    if (!firstName.trim()) { setFormError('Informe seu nome'); return }
    if (password.length < 8) { setFormError('A senha deve ter no mínimo 8 caracteres'); return }
    if (password !== confirmPassword) { setFormError('As senhas não coincidem'); return }

    setSubmitting(true)
    try {
      const res = await fetch('/api/tc-auth/accept-invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token,
          username: normalizedUsername,
          password,
          firstName: firstName.trim(),
          lastName: lastName.trim() || undefined,
        }),
      })
      const data = await res.json()
      if (res.ok && data?.success) {
        setPhase('success')
        // Redireciona após 2s para a tela de login com username pré-preenchido
        setTimeout(() => {
          const u = encodeURIComponent(normalizedUsername)
          window.location.href = `/?u=${u}`
        }, 2200)
      } else {
        setFormError(data?.error || 'Não foi possível aceitar o convite')
      }
    } catch (err: any) {
      setFormError(err?.message || 'Erro de conexão')
    } finally {
      setSubmitting(false)
    }
  }

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  return (
    <div className="relative min-h-screen flex flex-col tc-login-page-bg">
      <h1 className="sr-only">TerraControl — Aceitar convite</h1>

      <div className="absolute inset-0 overflow-hidden pointer-events-none select-none" aria-hidden="true">
        <div ref={spotlightRef} className="absolute inset-0" style={{ opacity: 0, transition: 'opacity 0.4s ease' }} />
        <div ref={dotsLayerRef} className="absolute inset-0">
          <svg className="absolute inset-0 w-full h-full" viewBox="0 0 1440 900" preserveAspectRatio="xMidYMid slice">
            {bgDots.map((d, i) => (
              <circle key={i} cx={d.x} cy={d.y} r="1.8" fill={d.color} opacity="0.85" />
            ))}
          </svg>
        </div>
        <svg className="absolute inset-0 w-full h-full tc-login-svg-bg" viewBox="0 0 1440 900" preserveAspectRatio="xMidYMid slice">
          <path d="M-200,160 C100,60 350,260 680,140 C980,30 1180,230 1500,120" fill="none" stroke="#48A326" strokeWidth="1.5" className="tc-svg-wave-1" />
          <path d="M-200,340 C150,240 400,440 750,300 C1060,175 1270,380 1600,260" fill="none" stroke="#0041B1" strokeWidth="1" className="tc-svg-wave-2" />
          <path d="M-200,520 C200,420 460,620 820,480 C1130,355 1340,550 1640,440" fill="none" stroke="#48A326" strokeWidth="1.5" className="tc-svg-wave-3" />
          <path d="M-200,700 C250,600 520,800 890,650 C1160,520 1360,710 1640,610" fill="none" stroke="#0041B1" strokeWidth="1" className="tc-svg-wave-4" />
        </svg>
      </div>

      <div className="relative z-10 flex flex-col items-center justify-center flex-1 py-10 px-4">
        <div className="tc-login-card w-full max-w-md rounded-3xl p-6 sm:p-8">
          <div className="text-center mb-6">
            <img src="/logo_terracontrol.png" alt="TerraControl" className="h-14 w-auto object-contain mx-auto" />
            <h2 className="text-xl font-bold mt-3 tracking-tight bg-gradient-to-r from-tc-green to-tc-blue bg-clip-text text-transparent">
              TerraControl
            </h2>
          </div>

          {phase === 'loading' && (
            <div className="text-center py-10 text-gray-500">
              <Loader2 className="w-8 h-8 animate-spin mx-auto mb-3 text-tc-green" />
              Validando convite...
            </div>
          )}

          {phase === 'invalid' && (
            <div className="text-center py-6">
              <div className="mx-auto w-14 h-14 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center mb-4">
                <AlertTriangle className="w-7 h-7 text-red-600 dark:text-red-400" />
              </div>
              <h3 className="text-base font-bold text-gray-900 dark:text-gray-100 mb-2">Convite indisponível</h3>
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-5">{errorMessage}</p>
              <p className="text-xs text-gray-500 dark:text-gray-500">
                Se você acha que isso é um erro, peça ao administrador para reenviar o convite.
              </p>
              <a href="/" className="inline-block mt-4 text-sm font-semibold text-tc-blue hover:underline">
                Voltar para a página de login
              </a>
            </div>
          )}

          {phase === 'success' && (
            <div className="text-center py-6">
              <div className="mx-auto w-14 h-14 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center mb-4">
                <CheckCircle className="w-7 h-7 text-green-600 dark:text-green-400" />
              </div>
              <h3 className="text-base font-bold text-gray-900 dark:text-gray-100 mb-2">Cadastro concluído!</h3>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Você será redirecionado para a tela de login...
              </p>
              <Loader2 className="w-5 h-5 animate-spin mx-auto mt-4 text-tc-green" />
            </div>
          )}

          {phase === 'form' && info && (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="bg-gradient-to-br from-tc-green/10 to-tc-blue/10 dark:from-tc-green/20 dark:to-tc-blue/20 border border-tc-green/20 rounded-xl p-4 mb-2">
                <p className="text-sm text-gray-700 dark:text-gray-200 leading-relaxed">
                  Olá! <strong>{info.invitedByName}</strong> convidou você a acessar o TerraControl.
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1.5 flex items-center gap-1">
                  <Mail className="w-3.5 h-3.5" /> {info.email}
                </p>
              </div>

              <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
                Complete os campos abaixo para criar seu acesso:
              </p>

              <div className="relative">
                <div className="absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none z-10">
                  <User className="h-4 w-4 text-gray-400" />
                </div>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value.toLowerCase())}
                  placeholder=" "
                  className="tc-float-input"
                  autoComplete="username"
                  autoFocus
                  required
                />
                <label className="tc-float-label">Nome de usuário</label>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="relative">
                  <input
                    type="text"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    placeholder=" "
                    className="tc-float-input pl-3"
                    autoComplete="given-name"
                    required
                  />
                  <label className="tc-float-label tc-float-label-noicon">Nome</label>
                </div>
                <div className="relative">
                  <input
                    type="text"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    placeholder=" "
                    className="tc-float-input pl-3"
                    autoComplete="family-name"
                  />
                  <label className="tc-float-label tc-float-label-noicon">Sobrenome</label>
                </div>
              </div>

              <div className="relative">
                <div className="absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none z-10">
                  <Lock className="h-4 w-4 text-gray-400" />
                </div>
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder=" "
                  className="tc-float-input pr-11"
                  autoComplete="new-password"
                  required
                />
                <label className="tc-float-label">Senha (mín. 8)</label>
                <button
                  type="button"
                  onClick={() => setShowPassword(s => !s)}
                  aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 z-10"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>

              <div className="relative">
                <div className="absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none z-10">
                  <Lock className="h-4 w-4 text-gray-400" />
                </div>
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder=" "
                  className="tc-float-input"
                  autoComplete="new-password"
                  required
                />
                <label className="tc-float-label">Confirmar senha</label>
              </div>

              {formError && (
                <div role="alert" className="tc-error-block rounded-xl p-3">
                  <p className="text-sm font-medium">{formError}</p>
                </div>
              )}

              <button
                type="submit"
                disabled={submitting}
                className="w-full py-3 px-4 rounded-xl font-semibold text-white bg-gradient-to-r from-tc-green to-tc-blue hover:from-tc-green-dark hover:to-tc-blue-dark shadow-lg shadow-tc-blue/25 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {submitting ? (<><Loader2 className="w-4 h-4 animate-spin" /> Criando acesso...</>) : 'Criar meu acesso'}
              </button>
            </form>
          )}
        </div>
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
          width: 100%; height: 3.25rem;
          padding: 1.25rem 1rem 0.375rem 2.75rem;
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
        .tc-float-label-noicon { left: 0.85rem; }
        .tc-float-input:focus ~ .tc-float-label,
        .tc-float-input:not(:placeholder-shown) ~ .tc-float-label {
          top: 0.5rem; transform: translateY(0);
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

export default TcAcceptInviteScreen
