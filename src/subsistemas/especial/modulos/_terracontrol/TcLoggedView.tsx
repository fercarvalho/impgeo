// Tela principal do tc_user logado. Reusa o TerraControlView completo (com
// charts, estatísticas, downloads ZIP, modais de mapa/PDF/ITR, busca, paginação)
// passando o modo 'tcuser' — que sobreescreve:
//   - origem dos dados (/api/tc-auth/me/records em vez de share token)
//   - header (TcHeader com logo + avatar/menu do usuário)
//   - autenticação de downloads (?tcAuth=<jwt> em vez de ?token=)
//   - botões de gerar sub-share (bulk no header + individual em cada card),
//     visíveis só quando tcUser.canShare === true
//   - F: CRUD de registros (criar/editar/excluir) com TcRecordFormModal,
//     gated por editRecordsPermission / deleteRecordsPermission
//
// Esse wrapper cuida dos modais auxiliares (perfil, edição de perfil, mudar
// senha, mudar username, gerar sub-share, criar/editar registro).

import React, { useCallback, useMemo, useState } from 'react'
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
import TcRecordFormModal from './TcRecordFormModal'

const TcLoggedView: React.FC = () => {
  const { tcUser, tcToken } = useTcAuth()
  const { notify, confirm, FeedbackHost } = useFeedback()

  // Modais do menu de usuário
  const [showProfile, setShowProfile] = useState(false)
  const [showEditPerfil, setShowEditPerfil] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [showUsername, setShowUsername] = useState(false)

  // Modal de sub-share — controlado por estado com IDs pré-selecionados
  const [shareIds, setShareIds] = useState<string[] | null>(null)
  // Cache dos records — alimentado pelo fetch local + atualizado quando
  // tc_user cria/edita/exclui via callbacks
  const [records, setRecords] = useState<TerraControlRecord[]>([])

  // F: filtro de aprovação (controlado pelo TcLoggedView, refletido pro View)
  const [approvalFilter, setApprovalFilter] = useState<'all' | 'approved'>('all')

  // F: modal de cadastro/edição (undefined = criar; record = editar)
  const [recordFormOpen, setRecordFormOpen] = useState(false)
  const [editingRecord, setEditingRecord] = useState<TerraControlRecord | null>(null)

  // Bump pra forçar refetch do TerraControlView quando criamos/editamos
  const [refetchKey, setRefetchKey] = useState(0)

  // Sincroniza records ao montar (e quando filtro/refetchKey muda).
  React.useEffect(() => {
    if (!tcToken) return
    const ctrl = new AbortController()
    const qs = approvalFilter === 'approved' ? '?onlyApproved=true' : ''
    fetch(`/api/tc-auth/me/records${qs}`, {
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
  }, [tcToken, approvalFilter, refetchKey])

  // Permissão de compartilhamento — só renderizamos os botões se a flag estiver ligada
  const canShare = tcUser?.canShare === true

  // F: helpers de permissão (espelha tcUserCanEditRecord/Delete do backend).
  // Backend sempre revalida — esse aqui é só pra esconder/mostrar botão na UI.
  const canEditRecord = useCallback((record: TerraControlRecord): boolean => {
    const perm = tcUser?.editRecordsPermission || 'all'
    if (perm === 'none') return false
    const isCreator = record.createdByTcUserId === tcUser?.id
    if (perm === 'created')  return isCreator
    if (perm === 'assigned') return !isCreator  // assume que está na lista (já filtrou pelo backend)
    return true // 'all'
  }, [tcUser])

  const canDeleteRecord = useCallback((record: TerraControlRecord): boolean => {
    const perm = tcUser?.deleteRecordsPermission || 'none'
    if (perm === 'none') return false
    const isCreator = record.createdByTcUserId === tcUser?.id
    if (perm === 'created') return isCreator
    return true // 'all'
  }, [tcUser])

  // Callbacks para o TerraControlView
  const handleShareBulk = useMemo(
    () => canShare ? (allIds: string[]) => setShareIds(allIds) : undefined,
    [canShare]
  )
  const handleShareSingle = useMemo(
    () => canShare ? (id: string) => setShareIds([id]) : undefined,
    [canShare]
  )
  const handleCreateRecord = useCallback(() => {
    setEditingRecord(null)
    setRecordFormOpen(true)
  }, [])
  const handleEditRecord = useCallback((id: string) => {
    const r = records.find(x => String(x.id) === String(id))
    if (!r) { notify('Registro não encontrado', { type: 'error' }); return }
    setEditingRecord(r)
    setRecordFormOpen(true)
  }, [records, notify])
  const handleDeleteRecord = useCallback(async (id: string) => {
    const r = records.find(x => String(x.id) === String(id))
    if (!r) return
    const ok = await confirm(`Tem certeza que deseja excluir "${r.imovel}"?`, { variant: 'danger', confirmLabel: 'Excluir' })
    if (!ok) return
    try {
      const res = await fetch(`/api/tc-auth/me/records/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${tcToken}` },
        credentials: 'include',
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok && data.success) {
        notify('Registro excluído', { type: 'success' })
        setRefetchKey(k => k + 1)
      } else {
        notify(data?.error || 'Erro ao excluir', { type: 'error' })
      }
    } catch (e: any) {
      notify(e?.message || 'Erro de conexão', { type: 'error' })
    }
  }, [records, tcToken, notify, confirm])

  // F: exclusão em massa (botão "Excluir N selecionados" na action bar)
  const handleDeleteSelected = useCallback(async (ids: string[]) => {
    if (!ids.length) return
    const ok = await confirm(
      `Tem certeza que deseja excluir ${ids.length} registro${ids.length > 1 ? 's' : ''}?`,
      { variant: 'danger', confirmLabel: 'Excluir todos' }
    )
    if (!ok) return
    let okCount = 0
    let errCount = 0
    for (const id of ids) {
      try {
        const res = await fetch(`/api/tc-auth/me/records/${id}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${tcToken}` },
          credentials: 'include',
        })
        if (res.ok) okCount++
        else errCount++
      } catch { errCount++ }
    }
    if (errCount === 0) notify(`${okCount} registro(s) excluído(s)`, { type: 'success' })
    else if (okCount === 0) notify('Erro ao excluir os registros', { type: 'error' })
    else notify(`${okCount} excluído(s), ${errCount} falharam`, { type: 'warning' })
    setRefetchKey(k => k + 1)
  }, [tcToken, notify, confirm])

  if (!tcUser || !tcToken) return null

  return (
    <>
      <TerraControlView
        key={refetchKey}
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
          onCreateRecord: handleCreateRecord,
          onEditRecord: tcUser.editRecordsPermission !== 'none' ? handleEditRecord : undefined,
          onDeleteRecord: tcUser.deleteRecordsPermission !== 'none' ? handleDeleteRecord : undefined,
          onDeleteSelected: tcUser.deleteRecordsPermission !== 'none' ? handleDeleteSelected : undefined,
          canEditRecord,
          canDeleteRecord,
          approvalFilter,
          onChangeApprovalFilter: setApprovalFilter,
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

      {/* F: modal de cadastro/edição de registro */}
      {recordFormOpen && (
        <TcRecordFormModal
          isOpen={recordFormOpen}
          onClose={() => { setRecordFormOpen(false); setEditingRecord(null) }}
          record={editingRecord}
          notify={notify}
          onSaved={() => {
            setRecordFormOpen(false)
            setEditingRecord(null)
            setRefetchKey(k => k + 1)
          }}
        />
      )}

      <FeedbackHost />
    </>
  )
}

export default TcLoggedView
