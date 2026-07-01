// Entry de terracontrol.viverdepj.com.br.
// Quando NÃO logado → <LoginScreen> (com initialUsername se vier ?u=).
// Quando logado mas force_password_change → <TcAlterarSenhaModal mode='forced'>.
// Quando logado normal → <TerraControlLoggedView>: header + lista de registros
//   filtrada pelo tc_user_record_access + menu de usuário.
//
// Também trata ?reset=<token> abrindo TcResetarSenhaModal.

import React, { useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { useTcAuth } from '@/contexts/TcAuthContext'
import { useAuth } from '@/contexts/AuthContext'
import LoginScreen from './LoginScreen'
import TcAlterarSenhaModal from './TcAlterarSenhaModal'
import TcResetarSenhaModal from './TcResetarSenhaModal'
import TcLoggedView from './TcLoggedView'
import TcAcceptInviteScreen from './TcAcceptInviteScreen'
import TerraControlAdminShell from './TerraControlAdminShell'
import OfflineBanner from '@/components/OfflineBanner'

// Entry ÚNICO do terracontrol.com.br (login unificado). Decide entre:
//   - equipe impgeo logada  → TerraControlAdminShell (via useAuth)
//   - cliente tc_user logado → TcLoggedView (via useTcAuth)
//   - ninguém logado         → LoginScreen (o form chama /api/tc-entry/login)
const TcPublicEntry: React.FC = () => {
  const { tcUser, isLoading, forcePasswordChange } = useTcAuth()
  const { user: impgeoUser, isLoading: impgeoLoading } = useAuth()
  const [resetToken, setResetToken] = useState<string | null>(null)
  const [inviteToken, setInviteToken] = useState<string | null>(null)
  const [initialUsername, setInitialUsername] = useState<string | undefined>(undefined)

  // Detecta query params:
  //   ?u=<username> → vem do redirect /v/legacy
  //   ?reset=<token> → fluxo de reset de senha
  //   /aceitar-convite?token=<token> → F2.1, fluxo de aceite de convite
  useEffect(() => {
    const url = new URL(window.location.href)
    const u = url.searchParams.get('u')
    if (u) setInitialUsername(u)
    const reset = url.searchParams.get('reset')
    if (reset) setResetToken(reset)
    if (url.pathname.startsWith('/aceitar-convite')) {
      const t = url.searchParams.get('token')
      if (t) setInviteToken(t)
    }
  }, [])

  // Aceite de convite tem prioridade sobre tudo: se tem token na URL, renderiza
  // a tela específica de aceite — ignora estado de login atual (o convidado
  // pode estar com sessão antiga de outro tc_user e tudo bem).
  if (inviteToken) {
    return (
      <>
        <OfflineBanner />
        <TcAcceptInviteScreen token={inviteToken} />
      </>
    )
  }

  // Espera AS DUAS auths resolverem antes de decidir — senão pisca o login
  // enquanto o cookie de sessão (cliente OU equipe) ainda está sendo validado.
  if (isLoading || impgeoLoading) {
    return (
      <>
        <OfflineBanner />
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-emerald-50 to-blue-50 dark:from-[#0a1a0e] dark:to-[#0a1a3e]">
          <div className="text-center text-gray-500">
            <Loader2 className="w-8 h-8 animate-spin mx-auto mb-2 text-tc-green" />
            Carregando…
          </div>
        </div>
      </>
    )
  }

  // Cliente tc_user tem prioridade (público majoritário). Na prática cliente e
  // equipe não coexistem: cada login seta só um conjunto de cookies.
  if (tcUser) {
    return (
      <>
        <OfflineBanner />
        <TcLoggedView />
        {forcePasswordChange && (
          <TcAlterarSenhaModal isOpen mode="forced" />
        )}
      </>
    )
  }

  // Equipe impgeo logada → shell do módulo TerraControl.
  if (impgeoUser) {
    return <TerraControlAdminShell />
  }

  // Ninguém logado → login unificado.
  return (
    <>
      <OfflineBanner />
      <LoginScreen initialUsername={initialUsername} />
      {resetToken && (
        <TcResetarSenhaModal isOpen onClose={() => setResetToken(null)} token={resetToken} />
      )}
    </>
  )
}

export default TcPublicEntry
