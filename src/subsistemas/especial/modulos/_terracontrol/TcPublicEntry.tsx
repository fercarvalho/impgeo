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
import LoginScreen from './LoginScreen'
import TcAlterarSenhaModal from './TcAlterarSenhaModal'
import TcResetarSenhaModal from './TcResetarSenhaModal'
import TcLoggedView from './TcLoggedView'

const TcPublicEntry: React.FC = () => {
  const { tcUser, isLoading, forcePasswordChange } = useTcAuth()
  const [resetToken, setResetToken] = useState<string | null>(null)
  const [initialUsername, setInitialUsername] = useState<string | undefined>(undefined)

  // Detecta query params: ?u=<username> (vem do redirect /v/legacy) e ?reset=<token>
  useEffect(() => {
    const url = new URL(window.location.href)
    const u = url.searchParams.get('u')
    if (u) setInitialUsername(u)
    const reset = url.searchParams.get('reset')
    if (reset) setResetToken(reset)
  }, [])

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-emerald-50 to-blue-50 dark:from-[#0a1a0e] dark:to-[#0a1a3e]">
        <div className="text-center text-gray-500">
          <Loader2 className="w-8 h-8 animate-spin mx-auto mb-2 text-tc-green" />
          Carregando…
        </div>
      </div>
    )
  }

  if (!tcUser) {
    return (
      <>
        <LoginScreen initialUsername={initialUsername} />
        {resetToken && (
          <TcResetarSenhaModal isOpen onClose={() => setResetToken(null)} token={resetToken} />
        )}
      </>
    )
  }

  return (
    <>
      <TcLoggedView />
      {forcePasswordChange && (
        <TcAlterarSenhaModal isOpen mode="forced" />
      )}
    </>
  )
}

export default TcPublicEntry
