import React, { useCallback, useEffect, useRef, useState } from 'react'
import { ClipboardCheck, CalendarClock, Undo2, UserPlus, Check, X, Timer, Loader2, CheckCircle2 } from 'lucide-react'
import { useDialogs } from '@/components/DialogProvider'
import {
  PmTask,
  fetchPendingReviews,
  fetchPendingDueRequests, decideDueRequest, DueDateRequest,
  fetchPendingUncompleteRequests, decideUncompleteRequest, UncompleteRequest,
  fetchPendingDelegations, decideDelegation, DelegationRequest,
} from './_pm/taskApi'
import { fetchPendingOverages, decideOverage, OverageRequest } from './_pm/pomodoroApi'
import Pagination from './_pm/Pagination'
import { usePaginatedList } from './_pm/usePaginatedList'
import DueProposalModal from './_pm/DueProposalModal'
import TaskReviewModal from './_pm/TaskReviewModal'

// data ISO/'YYYY-MM-DD' → 'dd/mm/aaaa' (sem parse de Date, evita erro de fuso)
const fmtDate = (v?: string | null) => {
  if (!v) return ''
  const [y, m, d] = String(v).slice(0, 10).split('-')
  return d ? `${d}/${m}/${y}` : String(v).slice(0, 10)
}

// Central de Aprovações (#11): agrega as 5 filas de gestor num lugar só.
// As filas planas usam usePaginatedList (o .total é o contador); overage não é
// paginado (volume baixo). Refresca via load() + evento global 'pm-tasks-changed'.
const CentralAprovacoes: React.FC = () => {
  const { prompt } = useDialogs()
  const PAGE = 25
  const dueList = usePaginatedList<DueDateRequest>(fetchPendingDueRequests, PAGE)
  const uncList = usePaginatedList<UncompleteRequest>(fetchPendingUncompleteRequests, PAGE)
  const delList = usePaginatedList<DelegationRequest>(fetchPendingDelegations, PAGE)
  const reviewsList = usePaginatedList<PmTask>(fetchPendingReviews, PAGE)
  const dueReqs = dueList.items
  const uncReqs = uncList.items
  const delReqs = delList.items
  const pendingReviews = reviewsList.items

  const [overages, setOverages] = useState<OverageRequest[]>([])
  const [loaded, setLoaded] = useState(false)
  const [reviewTask, setReviewTask] = useState<PmTask | null>(null)
  const [dueModal, setDueModal] = useState<DueDateRequest | null>(null)

  // Recarrega as 4 filas paginadas via ref (deps estáveis do load, sem re-armar efeito).
  const reloadPagedRef = useRef<() => void>(() => {})
  reloadPagedRef.current = () => {
    dueList.reload(); uncList.reload(); delList.reload(); reviewsList.reload()
  }
  const firstLoadRef = useRef(true)

  const load = useCallback(async () => {
    fetchPendingOverages().then(setOverages).catch(() => setOverages([])).finally(() => setLoaded(true))
    if (firstLoadRef.current) firstLoadRef.current = false
    else reloadPagedRef.current()
  }, [])

  useEffect(() => {
    load()
    const onChanged = () => load()
    window.addEventListener('pm-tasks-changed', onChanged)
    return () => window.removeEventListener('pm-tasks-changed', onChanged)
  }, [load])

  const total = dueList.total + uncList.total + delList.total + reviewsList.total + overages.length
  const anyLoading = dueList.loading || uncList.loading || delList.loading || reviewsList.loading || !loaded

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="p-2.5 rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600 shadow-md shadow-violet-500/25">
          <ClipboardCheck className="w-5 h-5 text-white" aria-hidden="true" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Central de Aprovações</h1>
          <p className="text-gray-500 dark:text-gray-400 text-sm">Pendências que aguardam a sua decisão, num lugar só</p>
        </div>
      </div>

      {/* Solicitações de alteração de prazo */}
      {dueList.total > 0 && (
        <section className="rounded-xl border border-amber-200 dark:border-amber-900 bg-amber-50/50 dark:bg-amber-900/10 p-4">
          <h2 className="text-sm font-semibold text-amber-700 dark:text-amber-300 mb-1 flex items-center gap-2">
            <CalendarClock className="w-4 h-4" /> Solicitações de prazo ({dueList.total})
          </h2>
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">Aprove para aplicar o prazo pedido, recuse (mantém o atual), ou proponha/force outra data.</p>
          <div className="space-y-2">
            {dueReqs.map(d => (
              <div key={d.id} className="flex items-center gap-2 bg-white dark:!bg-[#243040] rounded-lg px-3 py-2 border border-gray-200 dark:border-gray-700">
                <div className="min-w-0 flex-1">
                  <div className="text-sm text-gray-800 dark:text-gray-100 truncate">{d.task_name} <span className="text-xs text-gray-400">· {d.project_name}</span></div>
                  <div className="text-xs text-gray-500 dark:text-gray-400">
                    {d.requester_name} ({d.requester_role === 'manager' ? 'gerente' : 'usuário'}): {d.current_due_date || 'sem prazo'} → <strong>{d.requested_due_date || 'sem prazo'}</strong>
                  </div>
                  {d.justification && <div className="text-xs text-gray-500 dark:text-gray-400">Justificativa: {d.justification}</div>}
                </div>
                <button onClick={async () => { await decideDueRequest(d.id, { action: 'approve' }); load() }} title="Aprovar"
                  className="p-1.5 rounded-lg bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400 hover:bg-green-100"><Check className="w-4 h-4" /></button>
                <button onClick={async () => { const note = await prompt({ title: 'Recusar pedido de prazo', label: 'Motivo (opcional)', multiline: true, confirmLabel: 'Recusar' }); if (note === null) return; await decideDueRequest(d.id, { action: 'reject', note }); load() }} title="Recusar (mantém o prazo atual)"
                  className="p-1.5 rounded-lg bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 hover:bg-red-100"><X className="w-4 h-4" /></button>
                <button onClick={() => setDueModal(d)} title="Propor / forçar outra data"
                  className="p-1.5 rounded-lg bg-violet-50 dark:bg-violet-900/20 text-violet-600 dark:text-violet-400 hover:bg-violet-100"><CalendarClock className="w-4 h-4" /></button>
              </div>
            ))}
          </div>
          <Pagination page={dueList.page} totalPages={dueList.totalPages} total={dueList.total} onPage={dueList.setPage} disabled={dueList.loading} />
        </section>
      )}

      {/* Solicitações de reabertura */}
      {uncList.total > 0 && (
        <section className="rounded-xl border border-orange-200 dark:border-orange-900 bg-orange-50/50 dark:bg-orange-900/10 p-4">
          <h2 className="text-sm font-semibold text-orange-700 dark:text-orange-300 mb-1 flex items-center gap-2">
            <Undo2 className="w-4 h-4" /> Solicitações de reabertura ({uncList.total})
          </h2>
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">Um gerente ou usuário pediu para reabrir uma tarefa concluída. Aprove para a tarefa voltar a ficar disponível.</p>
          <div className="space-y-2">
            {uncReqs.map(u => (
              <div key={u.id} className="flex items-center gap-3 bg-white dark:!bg-[#243040] rounded-lg px-3 py-2 border border-gray-200 dark:border-gray-700">
                <div className="min-w-0 flex-1">
                  <div className="text-sm text-gray-800 dark:text-gray-100 truncate">{u.task_name} <span className="text-xs text-gray-400">· {u.project_name}</span></div>
                  <div className="text-xs text-gray-500 dark:text-gray-400">
                    {u.requester_name}: {u.target === 'self' ? 'volta pra quem pediu' : u.target === 'pool' ? 'deixar disponível' : 'devolver a quem concluiu'} — {u.reason}
                  </div>
                </div>
                <button onClick={async () => { await decideUncompleteRequest(u.id, true); load() }} title="Aprovar"
                  className="p-1.5 rounded-lg bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400 hover:bg-green-100"><Check className="w-4 h-4" /></button>
                <button onClick={async () => { await decideUncompleteRequest(u.id, false); load() }} title="Recusar"
                  className="p-1.5 rounded-lg bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 hover:bg-red-100"><X className="w-4 h-4" /></button>
              </div>
            ))}
          </div>
          <Pagination page={uncList.page} totalPages={uncList.totalPages} total={uncList.total} onPage={uncList.setPage} disabled={uncList.loading} />
        </section>
      )}

      {/* Solicitações de delegação */}
      {delList.total > 0 && (
        <section className="rounded-xl border border-sky-200 dark:border-sky-900 bg-sky-50/50 dark:bg-sky-900/10 p-4">
          <h2 className="text-sm font-semibold text-sky-700 dark:text-sky-300 mb-1 flex items-center gap-2">
            <UserPlus className="w-4 h-4" /> Solicitações de delegação ({delList.total})
          </h2>
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">Um gerente quer delegar uma tarefa de um projeto que não é dele. Aprove para a tarefa ir ao usuário.</p>
          <div className="space-y-2">
            {delReqs.map(d => (
              <div key={d.id} className="flex items-center gap-3 bg-white dark:!bg-[#243040] rounded-lg px-3 py-2 border border-gray-200 dark:border-gray-700">
                <div className="min-w-0 flex-1">
                  <div className="text-sm text-gray-800 dark:text-gray-100 truncate">{d.task_name} <span className="text-xs text-gray-400">· {d.project_name}</span></div>
                  <div className="text-xs text-gray-500 dark:text-gray-400">{d.requester_name} → <strong>{d.to_name}</strong>{d.due_date ? ` · prazo ${fmtDate(d.due_date)}` : ''}</div>
                </div>
                <button onClick={async () => { await decideDelegation(d.id, true); load() }} title="Aprovar"
                  className="p-1.5 rounded-lg bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400 hover:bg-green-100"><Check className="w-4 h-4" /></button>
                <button onClick={async () => { await decideDelegation(d.id, false); load() }} title="Recusar"
                  className="p-1.5 rounded-lg bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 hover:bg-red-100"><X className="w-4 h-4" /></button>
              </div>
            ))}
          </div>
          <Pagination page={delList.page} totalPages={delList.totalPages} total={delList.total} onPage={delList.setPage} disabled={delList.loading} />
        </section>
      )}

      {/* Revisões pendentes */}
      {reviewsList.total > 0 && (
        <section className="rounded-xl border border-violet-200 dark:border-violet-900 bg-violet-50/50 dark:bg-violet-900/10 p-4">
          <h2 className="text-sm font-semibold text-violet-700 dark:text-violet-300 mb-2 flex items-center gap-2">
            <ClipboardCheck className="w-4 h-4" /> Revisões pendentes ({reviewsList.total})
          </h2>
          <div className="space-y-2">
            {pendingReviews.map(t => (
              <div key={t.id} className="flex items-center gap-3 bg-white dark:!bg-[#243040] rounded-lg px-3 py-2 border border-gray-200 dark:border-gray-700">
                <div className="min-w-0 flex-1">
                  <div className="text-sm text-gray-800 dark:text-gray-100 truncate">{t.name}</div>
                  <div className="text-xs text-gray-500 dark:text-gray-400 truncate">{t.project_name}{t.stage_name ? ` · ${t.stage_name}` : ''}</div>
                </div>
                {t.can_review === false ? (
                  <span className="px-2.5 py-1.5 rounded-lg bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300 text-xs font-medium">Só admin revisa</span>
                ) : (
                  <button onClick={() => setReviewTask(t)}
                    className="px-3 py-1.5 rounded-lg bg-violet-600 hover:bg-violet-700 text-white text-xs font-semibold">Revisar</button>
                )}
              </div>
            ))}
          </div>
          <Pagination page={reviewsList.page} totalPages={reviewsList.totalPages} total={reviewsList.total} onPage={reviewsList.setPage} disabled={reviewsList.loading} />
        </section>
      )}

      {/* Pedidos de tempo extra (overage do Pomodoro) */}
      {overages.length > 0 && (
        <section className="rounded-xl border border-blue-200 dark:border-blue-900 bg-blue-50/50 dark:bg-blue-900/10 p-4">
          <h2 className="text-sm font-semibold text-blue-700 dark:text-blue-300 mb-1 flex items-center gap-2">
            <Timer className="w-4 h-4" /> Pedidos de tempo extra ({overages.length})
          </h2>
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">Um usuário atingiu o limite diário de foco e pediu para continuar. Aprove para liberar o tempo extra de hoje.</p>
          <div className="space-y-2">
            {overages.map(o => (
              <div key={o.id} className="flex items-center gap-3 bg-white dark:!bg-[#243040] rounded-lg px-3 py-2 border border-gray-200 dark:border-gray-700">
                <div className="min-w-0 flex-1">
                  <div className="text-sm text-gray-800 dark:text-gray-100 truncate">{o.user_name || o.user_id} <span className="text-xs text-gray-400">· {fmtDate(o.day)}</span></div>
                  <div className="text-xs text-gray-500 dark:text-gray-400">
                    {o.worked_minutes != null ? `${o.worked_minutes} min trabalhados hoje` : 'tempo extra solicitado'}{o.justification ? ` — ${o.justification}` : ''}
                  </div>
                </div>
                <button onClick={async () => { await decideOverage(o.id, true); load() }} title="Aprovar"
                  className="p-1.5 rounded-lg bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400 hover:bg-green-100"><Check className="w-4 h-4" /></button>
                <button onClick={async () => { await decideOverage(o.id, false); load() }} title="Negar"
                  className="p-1.5 rounded-lg bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 hover:bg-red-100"><X className="w-4 h-4" /></button>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Estado vazio / carregando */}
      {anyLoading && total === 0 && (
        <div className="flex items-center justify-center py-16 text-gray-400"><Loader2 className="w-7 h-7 animate-spin" /></div>
      )}
      {!anyLoading && total === 0 && (
        <div className="text-center py-16 bg-white dark:!bg-[#243040] rounded-2xl border border-gray-200 dark:border-gray-700">
          <CheckCircle2 className="w-10 h-10 mx-auto mb-3 text-emerald-400" />
          <p className="text-gray-500 dark:text-gray-400 text-sm">Nenhuma aprovação pendente. Tudo em dia!</p>
        </div>
      )}

      {reviewTask && (
        <TaskReviewModal task={reviewTask} onClose={() => setReviewTask(null)}
          onDone={() => { setReviewTask(null); load(); try { window.dispatchEvent(new CustomEvent('pm-tasks-changed')) } catch { /* noop */ } }} />
      )}

      {dueModal && (
        <DueProposalModal mode="decider" request={dueModal}
          onClose={() => setDueModal(null)} onDone={() => { setDueModal(null); load() }} />
      )}
    </div>
  )
}

export default CentralAprovacoes
