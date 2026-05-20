// Tela principal do tc_user logado. Reusa o TerraControlView completo (com
// charts, estatísticas, downloads ZIP, modais de mapa/PDF/ITR, busca, paginação)
// passando o modo 'tcuser' — que sobreescreve:
//   - origem dos dados (/api/tc-auth/me/records em vez de share token)
//   - header (TcHeader com logo + avatar/menu do usuário)
//   - autenticação de downloads (?tcAuth=<jwt> em vez de ?token=)
//   - botões de gerar sub-share (bulk no header + individual em cada card),
//     visíveis só quando tcUser.canShare === true
//
// Esse wrapper cuida dos modais auxiliares (perfil, edição de perfil, mudar
// senha, mudar username, gerar sub-share) — TerraControlView só renderiza os
// modais dele (mapa, gráficos, downloads etc.).

import React, { useMemo, useState } from 'react'
import { useTcAuth } from '@/contexts/TcAuthContext'
import {
  type TerraControlRecord,
  normalizeRecords,
  useFeedback,
} from './index'
import TerraControlView from '../TerraControlView'
import TcHeader from './TcHeader'
import TcUserProfileModal from './TcUserProfileModal'
import TcEditarPerfilModal from './TcEditarPerfilModal'
import TcAlterarSenhaModal from './TcAlterarSenhaModal'
import TcAlterarUsernameModal from './TcAlterarUsernameModal'
import TcSubShareModal from './TcSubShareModal'

const TcLoggedView: React.FC = () => {
  const { tcUser, tcToken } = useTcAuth()
  const { notify, FeedbackHost } = useFeedback()

  // Modais do menu de usuário
  const [showProfile, setShowProfile] = useState(false)
  const [showEditPerfil, setShowEditPerfil] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [showUsername, setShowUsername] = useState(false)

  // Modal de sub-share — controlado por estado com IDs pré-selecionados
  const [shareIds, setShareIds] = useState<string[] | null>(null)
  // Cache dos records que o tc_user vê — usado pra alimentar o modal de
  // sub-share (passar a lista completa e pré-selecionados).
  // Buscamos UMA vez aqui (mesmo endpoint que o TerraControlView vai chamar
  // internamente). Aceitamos a duplicação de fetch nesse caso porque o backend
  // tem cache curto e a lista é pequena.
  const [records, setRecords] = useState<TerraControlRecord[]>([])

  // Sincroniza records (carregamos uma vez ao montar — o TerraControlView faz
  // o mesmo fetch internamente, e está OK que sejam 2 fetches paralelos:
  // a UI principal nunca volta a buscar, e esse aqui só serve pro modal share)
  React.useEffect(() => {
    if (!tcToken) return
    const ctrl = new AbortController()
    fetch('/api/tc-auth/me/records', {
      headers: { Authorization: `Bearer ${tcToken}` },
      credentials: 'include',
      signal: ctrl.signal,
    })
      .then(r => r.json())
      .then(data => {
        if (data?.success) setRecords(normalizeRecords(data.data || []))
      })
      .catch(() => {/* TerraControlView já trata o erro principal */})
    return () => ctrl.abort()
  }, [tcToken])

  // Permissão de compartilhamento — só renderizamos os botões se a flag estiver ligada
  const canShare = tcUser?.canShare === true

  // Callbacks para o TerraControlView
  const handleShareBulk = useMemo(
    () => canShare ? (allIds: string[]) => setShareIds(allIds) : undefined,
    [canShare]
  )
  const handleShareSingle = useMemo(
    () => canShare ? (id: string) => setShareIds([id]) : undefined,
    [canShare]
  )

  if (!tcUser || !tcToken) return null

  return (
    <>
      <TerraControlView
        mode={{
          kind: 'tcuser',
          tcToken,
          tcUserFirstName: tcUser.firstName,
          headerSlot: (
            <TcHeader
              tcUser={tcUser}
              onOpenProfile={() => setShowProfile(true)}
              onOpenPassword={() => setShowPassword(true)}
              onOpenUsername={() => setShowUsername(true)}
            />
          ),
          onShareBulk: handleShareBulk,
          onShareSingle: handleShareSingle,
        }}
      />

      {/* Modais do menu de usuário */}
      <TcUserProfileModal
        isOpen={showProfile && !tcUser.requiresProfileCompletion}
        onClose={() => setShowProfile(false)}
        tcUser={tcUser}
        onEdit={() => { setShowProfile(false); setShowEditPerfil(true) }}
      />
      <TcEditarPerfilModal
        isOpen={showEditPerfil && !tcUser.requiresProfileCompletion}
        onClose={() => setShowEditPerfil(false)}
        notify={notify}
      />
      {/* F2.3: modal obrigatório quando o tc_user veio de convite e não preencheu */}
      {tcUser.requiresProfileCompletion && (
        <TcEditarPerfilModal isOpen required onClose={() => {/* required = sem close */}} notify={notify} />
      )}
      <TcAlterarSenhaModal
        isOpen={showPassword}
        mode="normal"
        onClose={() => setShowPassword(false)}
      />
      <TcAlterarUsernameModal
        isOpen={showUsername}
        onClose={() => setShowUsername(false)}
      />

      {/* Modal de gerar sub-share link (F2.5 — flag can_share) */}
      {canShare && shareIds && (
        <TcSubShareModal
          isOpen={true}
          onClose={() => setShareIds(null)}
          tcToken={tcToken}
          records={records}
          initialSelectedIds={shareIds}
          notify={notify}
        />
      )}

      <FeedbackHost />
    </>
  )
}

export default TcLoggedView
