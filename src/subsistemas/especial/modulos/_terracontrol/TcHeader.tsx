// Header verde→azul próprio do TerraControlView quando renderizado em modo
// tc_user (logado em terracontrol.viverdepj.com.br). Substitui o header padrão
// "TerraControl by IMPGEO" pelo header "TerraControl + avatar/menu do usuário".
//
// Os callbacks (onOpenProfile, etc.) são repassados ao TcMenuUsuario que abre
// os modais de perfil/senha/username via TcLoggedView que é o pai final.

import React from 'react'
import type { TcUser } from '@/contexts/TcAuthContext'
import TcMenuUsuario from './TcMenuUsuario'

interface Props {
  tcUser: TcUser
  onOpenProfile: () => void
  onOpenPassword: () => void
  onOpenUsername: () => void
}

const TcHeader: React.FC<Props> = ({ tcUser, onOpenProfile, onOpenPassword, onOpenUsername }) => {
  return (
    <div className="bg-gradient-to-r from-tc-green-dark to-tc-blue-dark text-white shadow-lg">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-5">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <img src="/logo_terracontrol.png" alt="TerraControl" className="h-14 w-14 object-contain rounded-lg flex-shrink-0" />
            <div className="min-w-0">
              <h1 className="text-xl font-bold leading-tight">TerraControl</h1>
              <p className="text-blue-200 text-sm">Plataforma de gestão territorial</p>
            </div>
          </div>
          <div className="flex-shrink-0">
            <TcMenuUsuario
              tcUser={tcUser}
              onOpenProfile={onOpenProfile}
              onOpenPassword={onOpenPassword}
              onOpenUsername={onOpenUsername}
            />
          </div>
        </div>
      </div>
    </div>
  )
}

export default TcHeader
