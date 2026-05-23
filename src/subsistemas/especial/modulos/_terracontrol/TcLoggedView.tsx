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

import React, { lazy, Suspense, useCallback, useMemo, useState } from 'react'
import { useTcAuth } from '@/contexts/TcAuthContext'
import {
  type TerraControlRecord,
  normalizeRecords,
  useFeedback,
} from './index'
import TerraControlView from '../TerraControlView'
import TcHeader from './TcHeader'
// Lazy: o banner compartilha código com o sino do impgeo; ao usar lazy aqui
// também, o Vite gera um chunk próprio em vez de duplicar/inchar.
const PushPermissionBanner = lazy(() => import('@/components/PushPermissionBanner'))
import PwaInstallBanner from '@/components/PwaInstallBanner'
import TcUserProfileModal from './TcUserProfileModal'
import TcEditarPerfilModal from './TcEditarPerfilModal'
import TcAlterarSenhaModal from './TcAlterarSenhaModal'
import TcAlterarUsernameModal from './TcAlterarUsernameModal'
import TcSubShareModal from './TcSubShareModal'
import TcRecordFormModal from './TcRecordFormModal'
import TcBudgetViewScreen from './tcuser/TcBudgetViewScreen'
import TcBudgetPaymentScreen from './tcuser/TcBudgetPaymentScreen'
import TcBudgetPaidScreen from './tcuser/TcBudgetPaidScreen'
import type { PixPaymentSnapshot } from './tcuser/tcBudgetApi'

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

  // G8 (migration 040) — Roteamento local de orçamento.
  // Quando preenchido, a TcLoggedView troca o render do TerraControlView
  // pela tela respectiva. Tudo client-side (deep-link via ?budget= no G9).
  type BudgetView =
    | { kind: 'view'; budgetId: string }
    | { kind: 'pay';  budgetId: string; initialPayment?: PixPaymentSnapshot | null }
    | { kind: 'paid'; budgetId: string; imovel?: string | null; municipio?: string | null }
  const [budgetView, setBudgetView] = useState<BudgetView | null>(null)

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

  // G8: Handler de roteamento vindo do sino de notificações
  const handleRouteFromNotif = useCallback((route: { kind: 'budget'; id: string } | { kind: 'record'; id: string }) => {
    if (route.kind === 'budget') setBudgetView({ kind: 'view', budgetId: route.id })
    // kind='record' fica pro futuro (hoje só fecha o dropdown sem ir pra lugar)
  }, [])

  // G8: imóveis com orçamento que requer atenção do tc_user (sent ou
  // awaiting_payment). Banners agregados ficam no topo da lista.
  const pendingBudgets = useMemo(
    () => records.filter(r =>
      (r.budgetStatus === 'sent' || r.budgetStatus === 'awaiting_payment')
      && r.currentBudgetId
    ),
    [records]
  )

  if (!tcUser || !tcToken) return null

  // G8: telas de orçamento substituem o TerraControlView quando ativas
  if (budgetView) {
    // Header + tela específica, mantendo identidade visual do TcHeader
    const headerEl = (
      <TcHeader
        tcUser={tcUser}
        onOpenProfile={() => setShowProfile(true)}
        onOpenPassword={() => setShowPassword(true)}
        onOpenUsername={() => setShowUsername(true)}
        onRouteFromNotif={handleRouteFromNotif}
      />
    )
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-[#111827]">
        {headerEl}
        <main className="py-4">
          {budgetView.kind === 'view' && (
            <TcBudgetViewScreen
              budgetId={budgetView.budgetId}
              onBack={() => setBudgetView(null)}
              onAccepted={(budgetId, payment) => setBudgetView({ kind: 'pay', budgetId, initialPayment: payment })}
              onResumePayment={(budgetId) => setBudgetView({ kind: 'pay', budgetId })}
              notify={notify}
            />
          )}
          {budgetView.kind === 'pay' && (
            <TcBudgetPaymentScreen
              budgetId={budgetView.budgetId}
              initialPayment={budgetView.initialPayment || null}
              onBack={() => setBudgetView({ kind: 'view', budgetId: budgetView.budgetId })}
              onPaid={() => {
                const rec = records.find(r => r.currentBudgetId === budgetView.budgetId)
                setBudgetView({
                  kind: 'paid',
                  budgetId: budgetView.budgetId,
                  imovel: rec?.imovel || null,
                  municipio: rec?.municipio || null,
                })
                setRefetchKey(k => k + 1)
              }}
              notify={notify}
            />
          )}
          {budgetView.kind === 'paid' && (
            <TcBudgetPaidScreen
              imovel={budgetView.imovel}
              municipio={budgetView.municipio}
              onBackToList={() => setBudgetView(null)}
            />
          )}
        </main>
        <FeedbackHost />
      </div>
    )
  }

  return (
    <>
      <TerraControlView
        key={refetchKey}
        mode={{
          kind: 'tcuser',
          tcToken,
          tcUserFirstName: tcUser.firstName,
          headerSlot: (
            <>
              <TcHeader
                tcUser={tcUser}
                onOpenProfile={() => setShowProfile(true)}
                onOpenPassword={() => setShowPassword(true)}
                onOpenUsername={() => setShowUsername(true)}
                onRouteFromNotif={handleRouteFromNotif}
              />
              {/* Banner persistente convidando o user a ativar Web Push.
                  Wrapper espelha o max-w-7xl + padding do <main> do
                  TerraControlView pra ficar no mesmo comprimento do resto
                  do conteúdo (não full-bleed). Só visível pro tc_user logado.
                  Esconde sozinho quando ativo/dispensado/denied. */}
              <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6">
                {/* mb-6 cria a folga entre PushPermissionBanner e o
                    PwaInstallBanner abaixo (PushPermissionBanner não tem
                    margem interna; sem este wrapper os 2 ficam grudados). */}
                <Suspense fallback={null}>
                  <div className="mb-6">
                    <PushPermissionBanner />
                  </div>
                </Suspense>
                {/* Banner convidando a instalar o TerraControl como PWA.
                    Texto e estratégia de install adaptam-se ao OS/browser
                    (prompt nativo no Chrome/Edge; modal de instruções em
                    Safari iOS/macOS). Esconde sozinho quando já instalado
                    ou dispensado (7 dias). Aparece só pós-login (fica
                    dentro do TcLoggedView que só renderiza autenticado). */}
                <PwaInstallBanner />
                {/* G8 (migration 040): banners de orçamento pendente.
                    1 por imóvel com budgetStatus sent ou awaiting_payment.
                    Click vai pra TcBudgetViewScreen (sent) ou pagamento
                    (awaiting_payment). */}
                {pendingBudgets.length > 0 && (
                  <div className="mb-6 space-y-2">
                    {pendingBudgets.map(r => {
                      const isPay = r.budgetStatus === 'awaiting_payment'
                      const cls = isPay
                        ? 'border-orange-200 bg-orange-50 dark:bg-orange-900/15 dark:border-orange-900/40'
                        : 'border-blue-200 bg-blue-50 dark:bg-blue-900/15 dark:border-blue-900/40'
                      const label = isPay ? 'Pagamento pendente' : 'Orçamento aguardando você'
                      const btnLabel = isPay ? 'Retomar pagamento' : 'Ver orçamento'
                      return (
                        <div key={r.id} className={`flex items-center justify-between gap-3 px-4 py-3 rounded-xl border ${cls}`}>
                          <div className="min-w-0">
                            <p className="text-xs font-bold uppercase tracking-wider text-gray-600 dark:text-gray-400">{label}</p>
                            <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">
                              {r.imovel}{r.municipio ? ` · ${r.municipio}` : ''}
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => setBudgetView({
                              kind: isPay ? 'pay' : 'view',
                              budgetId: r.currentBudgetId!,
                            })}
                            className={`shrink-0 px-3 py-1.5 rounded-lg text-xs font-bold text-white ${
                              isPay
                                ? 'bg-orange-500 hover:bg-orange-600'
                                : 'bg-tc-blue hover:bg-tc-blue-dark'
                            }`}
                          >
                            {btnLabel}
                          </button>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            </>
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
