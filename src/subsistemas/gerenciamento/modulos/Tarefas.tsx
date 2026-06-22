import React, { useCallback, useEffect, useRef, useState } from 'react'
import { ListTodo, Play, Pause, RotateCcw, CheckCircle2, Clock, Loader2, AlertTriangle, X, HelpCircle, ClipboardCheck, UserPlus, Inbox, Timer, CalendarClock, Check, Users, Undo2 } from 'lucide-react'
import { usePermissions } from '@/hooks/usePermissions'
import { useDialogs } from '@/components/DialogProvider'
import PendingTasksBanner from './_pm/PendingTasksBanner'
import {
  fetchMyTasks, taskAction, TASK_STATUS_META, PmTask,
  fetchPendingReviews, fetchIncomingHelp, helpAction, HelpRequest,
  fetchAvailableTasks,
  fetchPendingDueRequests, decideDueRequest, DueDateRequest,
  fetchMyDueProposals, respondDueProposal,
  fetchPendingUncompleteRequests, decideUncompleteRequest, UncompleteRequest,
  fetchPendingDelegations, decideDelegation, DelegationRequest,
} from './_pm/taskApi'
import DueProposalModal from './_pm/DueProposalModal'
import { useActiveSession, markTaskAreaOpened, getActive } from './_pm/pomodoroApi'
import PomodoroStartModal from './_pm/PomodoroStartModal'
import IdleAlertModal from './_pm/IdleAlertModal'
import HelpRequestModal from './_pm/HelpRequestModal'
import TaskReviewModal from './_pm/TaskReviewModal'
import TaskDueDateModal from './_pm/TaskDueDateModal'
import AssignTaskModal from './_pm/AssignTaskModal'
import ClaimTaskModal from './_pm/ClaimTaskModal'
import UncompleteTaskModal from './_pm/UncompleteTaskModal'

// data ISO/'YYYY-MM-DD' → 'dd/mm/aaaa' (sem parse de Date, evita erro de fuso)
const fmtDate = (v?: string | null) => {
  if (!v) return ''
  const [y, m, d] = String(v).slice(0, 10).split('-')
  return d ? `${d}/${m}/${y}` : String(v).slice(0, 10)
}

// Agrupamento de exibição do dashboard pessoal.
const GROUPS: { key: string; label: string; statuses: string[] }[] = [
  { key: 'in_progress', label: 'Em andamento',     statuses: ['in_progress'] },
  { key: 'available',   label: 'Disponíveis',       statuses: ['available'] },
  { key: 'overdue',     label: 'Atrasadas',         statuses: ['overdue'] },
  { key: 'pending',     label: 'Pendentes',         statuses: ['pending'] },
  { key: 'review',      label: 'Em revisão/ajuste', statuses: ['pending_review', 'pending_adjustment'] },
  { key: 'done',        label: 'Concluídas',        statuses: ['completed'] },
]

const Tarefas: React.FC = () => {
  const permissions = usePermissions('tarefas_gerenciamento')
  const { prompt } = useDialogs()
  const { session } = useActiveSession()
  const [tasks, setTasks] = useState<PmTask[]>([])
  const [available, setAvailable] = useState<PmTask[]>([])
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [focusTask, setFocusTask] = useState<PmTask | null>(null)  // abre PomodoroStartModal
  const [helpTask, setHelpTask] = useState<PmTask | null>(null)    // abre HelpRequestModal
  const [reviewTask, setReviewTask] = useState<PmTask | null>(null) // abre TaskReviewModal
  const [dueTask, setDueTask] = useState<PmTask | null>(null)        // abre TaskDueDateModal
  const [assignTask, setAssignTask] = useState<PmTask | null>(null)  // abre AssignTaskModal (atribuir a alguém)
  const [claimFor, setClaimFor] = useState<PmTask | null>(null)      // abre ClaimTaskModal (pegar p/ si)
  const [uncompleteFor, setUncompleteFor] = useState<PmTask | null>(null) // abre UncompleteTaskModal
  const [showIdle, setShowIdle] = useState(false)
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Fase 6: revisões (gestor) e ajudas recebidas.
  const [pendingReviews, setPendingReviews] = useState<PmTask[] | null>(null) // null = não-gestor
  const [incomingHelp, setIncomingHelp] = useState<HelpRequest[]>([])
  const [dueReqs, setDueReqs] = useState<DueDateRequest[] | null>(null) // null = não-gestor
  const [dueProps, setDueProps] = useState<DueDateRequest[]>([]) // contrapropostas de prazo p/ mim
  const [dueModal, setDueModal] = useState<{ mode: 'decider' | 'requester'; request: DueDateRequest } | null>(null)
  const [uncReqs, setUncReqs] = useState<UncompleteRequest[]>([]) // pedidos de reabertura (admin)
  const [delReqs, setDelReqs] = useState<DelegationRequest[]>([]) // pedidos de delegação (admin)

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try { setTasks(await fetchMyTasks()) }
    catch (e: any) { setError(e.message || 'Falha ao carregar tarefas') }
    finally { setLoading(false) }
    // Tarefas disponíveis para pegar (sem responsável).
    fetchAvailableTasks().then(setAvailable).catch(() => setAvailable([]))
    // Revisões pendentes (gestor): 403 → não-gestor, esconde a seção.
    fetchPendingReviews().then(setPendingReviews).catch(() => setPendingReviews(null))
    fetchIncomingHelp().then(setIncomingHelp).catch(() => setIncomingHelp([]))
    fetchPendingDueRequests().then(setDueReqs).catch(() => setDueReqs(null))
    fetchMyDueProposals().then(setDueProps).catch(() => setDueProps([]))
    fetchPendingUncompleteRequests().then(setUncReqs).catch(() => setUncReqs([]))
    fetchPendingDelegations().then(setDelReqs).catch(() => setDelReqs([]))
  }, [])

  useEffect(() => {
    load()
    const onChanged = () => load()
    window.addEventListener('pm-tasks-changed', onChanged)
    return () => window.removeEventListener('pm-tasks-changed', onChanged)
  }, [load])

  // Alerta de inatividade: 5min na área sem sessão ativa → modal.
  useEffect(() => {
    markTaskAreaOpened()
    const arm = () => {
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current)
      idleTimerRef.current = setTimeout(() => { if (!session) setShowIdle(true) }, 5 * 60 * 1000)
    }
    arm()
    return () => { if (idleTimerRef.current) clearTimeout(idleTimerRef.current) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Se uma sessão iniciar, cancela o alerta pendente.
  useEffect(() => { if (session && idleTimerRef.current) clearTimeout(idleTimerRef.current) }, [session])

  const startAndFocus = async (t: PmTask) => {
    setBusyId(t.id); setError(null)
    try {
      await taskAction(t.id, 'start')
      await load()
      try { window.dispatchEvent(new CustomEvent('pm-tasks-changed')) } catch { /* noop */ }
      setFocusTask(t)  // abre escolha de modo Pomodoro
    } catch (e: any) { setError(e.message) }
    finally { setBusyId(null) }
  }

  // Abre o modal de pegar tarefa (aviso de revisão + sugestão de pré-requisitos).
  const claim = (t: PmTask) => setClaimFor(t)

  const act = async (t: PmTask, action: 'start' | 'pause' | 'resume' | 'complete', body?: any) => {
    setBusyId(t.id); setError(null)
    try {
      await taskAction(t.id, action, body)
      await load()
      try {
        window.dispatchEvent(new CustomEvent('pm-tasks-changed'))
        // pause/resume da tarefa também mexem na sessão Pomodoro → reabre/fecha o widget.
        window.dispatchEvent(new CustomEvent('pm-pomodoro-changed'))
      } catch { /* noop */ }
      // Ao retomar: se a sessão estacionada expirou (não reabriu), abre o foco p/ iniciar de novo.
      if (action === 'resume') {
        const fresh = await getActive().catch(() => null)
        if (!fresh) setFocusTask(t)
      }
    } catch (e: any) { setError(e.message) }
    finally { setBusyId(null) }
  }

  const byGroup = (statuses: string[]) => tasks.filter(t => statuses.includes(t.status))

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="p-2.5 rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600 shadow-md shadow-violet-500/25">
          <ListTodo className="w-5 h-5 text-white" aria-hidden="true" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Minhas Tarefas</h1>
          <p className="text-gray-500 dark:text-gray-400 text-sm">Acompanhe e execute suas tarefas dos projetos</p>
        </div>
      </div>

      <PendingTasksBanner onChanged={load} />

      {/* Solicitações de alteração de prazo (gestor) */}
      {dueReqs && dueReqs.length > 0 && (
        <section className="rounded-xl border border-amber-200 dark:border-amber-900 bg-amber-50/50 dark:bg-amber-900/10 p-4">
          <h2 className="text-sm font-semibold text-amber-700 dark:text-amber-300 mb-1 flex items-center gap-2">
            <CalendarClock className="w-4 h-4" /> Solicitações de prazo ({dueReqs.length})
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
                <button onClick={() => setDueModal({ mode: 'decider', request: d })} title="Propor / forçar outra data"
                  className="p-1.5 rounded-lg bg-violet-50 dark:bg-violet-900/20 text-violet-600 dark:text-violet-400 hover:bg-violet-100"><CalendarClock className="w-4 h-4" /></button>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Contrapropostas de prazo para mim (solicitante responde) */}
      {dueProps.length > 0 && (
        <section className="rounded-xl border border-indigo-200 dark:border-indigo-900 bg-indigo-50/50 dark:bg-indigo-900/10 p-4">
          <h2 className="text-sm font-semibold text-indigo-700 dark:text-indigo-300 mb-1 flex items-center gap-2">
            <CalendarClock className="w-4 h-4" /> Propostas de prazo para você ({dueProps.length})
          </h2>
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">Um gestor propôs outra data para o seu pedido. Aceite, recuse (mantém o atual) ou contraproponha.</p>
          <div className="space-y-2">
            {dueProps.map(d => (
              <div key={d.id} className="flex items-center gap-2 bg-white dark:!bg-[#243040] rounded-lg px-3 py-2 border border-gray-200 dark:border-gray-700">
                <div className="min-w-0 flex-1">
                  <div className="text-sm text-gray-800 dark:text-gray-100 truncate">{d.task_name} <span className="text-xs text-gray-400">· {d.project_name}</span></div>
                  <div className="text-xs text-gray-500 dark:text-gray-400">
                    {d.decided_by_name || 'Gestor'} propõe: {d.current_due_date || 'sem prazo'} → <strong>{d.requested_due_date || 'sem prazo'}</strong>
                  </div>
                  {d.decision_note && <div className="text-xs text-gray-500 dark:text-gray-400">Obs. do gestor: {d.decision_note}</div>}
                </div>
                <button onClick={async () => { await respondDueProposal(d.id, { action: 'accept' }); load() }} title="Aceitar"
                  className="p-1.5 rounded-lg bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400 hover:bg-green-100"><Check className="w-4 h-4" /></button>
                <button onClick={async () => { const note = await prompt({ title: 'Recusar proposta de prazo', label: 'Motivo (opcional)', multiline: true, confirmLabel: 'Recusar' }); if (note === null) return; await respondDueProposal(d.id, { action: 'reject', justification: note }); load() }} title="Recusar (mantém o prazo atual)"
                  className="p-1.5 rounded-lg bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 hover:bg-red-100"><X className="w-4 h-4" /></button>
                <button onClick={() => setDueModal({ mode: 'requester', request: d })} title="Contrapropor outra data"
                  className="p-1.5 rounded-lg bg-violet-50 dark:bg-violet-900/20 text-violet-600 dark:text-violet-400 hover:bg-violet-100"><CalendarClock className="w-4 h-4" /></button>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Solicitações de reabertura (admin aprova manager) */}
      {uncReqs.length > 0 && (
        <section className="rounded-xl border border-orange-200 dark:border-orange-900 bg-orange-50/50 dark:bg-orange-900/10 p-4">
          <h2 className="text-sm font-semibold text-orange-700 dark:text-orange-300 mb-1 flex items-center gap-2">
            <Undo2 className="w-4 h-4" /> Solicitações de reabertura ({uncReqs.length})
          </h2>
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">Um gerente pediu para reabrir uma tarefa concluída. Aprove para a tarefa voltar a ficar em andamento.</p>
          <div className="space-y-2">
            {uncReqs.map(u => (
              <div key={u.id} className="flex items-center gap-3 bg-white dark:!bg-[#243040] rounded-lg px-3 py-2 border border-gray-200 dark:border-gray-700">
                <div className="min-w-0 flex-1">
                  <div className="text-sm text-gray-800 dark:text-gray-100 truncate">{u.task_name} <span className="text-xs text-gray-400">· {u.project_name}</span></div>
                  <div className="text-xs text-gray-500 dark:text-gray-400">
                    {u.requester_name}: {u.target === 'self' ? 'capturar p/ si' : u.target === 'pool' ? 'deixar disponível' : 'devolver a quem concluiu'} — {u.reason}
                  </div>
                </div>
                <button onClick={async () => { await decideUncompleteRequest(u.id, true); load() }} title="Aprovar"
                  className="p-1.5 rounded-lg bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400 hover:bg-green-100"><Check className="w-4 h-4" /></button>
                <button onClick={async () => { await decideUncompleteRequest(u.id, false); load() }} title="Recusar"
                  className="p-1.5 rounded-lg bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 hover:bg-red-100"><X className="w-4 h-4" /></button>
              </div>
            ))}
          </div>
        </section>
      )}

      {delReqs.length > 0 && (
        <section className="rounded-xl border border-sky-200 dark:border-sky-900 bg-sky-50/50 dark:bg-sky-900/10 p-4">
          <h2 className="text-sm font-semibold text-sky-700 dark:text-sky-300 mb-1 flex items-center gap-2">
            <UserPlus className="w-4 h-4" /> Solicitações de delegação ({delReqs.length})
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
        </section>
      )}

      {/* Revisões pendentes (admin/manager) */}
      {pendingReviews && pendingReviews.length > 0 && (
        <section className="rounded-xl border border-violet-200 dark:border-violet-900 bg-violet-50/50 dark:bg-violet-900/10 p-4">
          <h2 className="text-sm font-semibold text-violet-700 dark:text-violet-300 mb-2 flex items-center gap-2">
            <ClipboardCheck className="w-4 h-4" /> Revisões pendentes ({pendingReviews.length})
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
        </section>
      )}

      {/* Ajudas recebidas */}
      {incomingHelp.filter(h => h.status === 'pending' || h.status === 'accepted').length > 0 && (
        <section className="rounded-xl border border-sky-200 dark:border-sky-900 bg-sky-50/50 dark:bg-sky-900/10 p-4">
          <h2 className="text-sm font-semibold text-sky-700 dark:text-sky-300 mb-2 flex items-center gap-2">
            <HelpCircle className="w-4 h-4" /> Pedidos de ajuda para você
          </h2>
          <div className="space-y-2">
            {incomingHelp.filter(h => h.status === 'pending' || h.status === 'accepted').map(h => (
              <div key={h.id} className="bg-white dark:!bg-[#243040] rounded-lg px-3 py-2 border border-gray-200 dark:border-gray-700">
                <div className="text-sm text-gray-800 dark:text-gray-100">{h.task_name} <span className="text-xs text-gray-400">· {h.project_name}</span></div>
                {h.message && <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{h.message}</div>}
                <div className="flex gap-2 mt-2">
                  {h.status === 'pending' ? (
                    <>
                      <button onClick={async () => { await helpAction(h.id, 'accept'); load() }}
                        className="px-3 py-1 rounded-lg bg-green-600 hover:bg-green-700 text-white text-xs font-semibold">Aceitar</button>
                      <button onClick={async () => { const r = await prompt({ title: 'Recusar pedido de ajuda', label: 'Motivo da recusa', multiline: true, required: true, confirmLabel: 'Recusar' }); if (r?.trim()) { await helpAction(h.id, 'refuse', { reason: r.trim() }); load() } }}
                        className="px-3 py-1 rounded-lg bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 text-xs font-semibold hover:bg-red-100">Recusar</button>
                    </>
                  ) : (
                    <button onClick={async () => { await helpAction(h.id, 'complete'); load() }}
                      className="px-3 py-1 rounded-lg bg-sky-600 hover:bg-sky-700 text-white text-xs font-semibold">Concluir colaboração</button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {error && (
        <div role="alert" className="flex items-center gap-2 px-4 py-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl text-red-700 dark:text-red-400 text-sm">
          <AlertTriangle className="w-4 h-4 flex-shrink-0" />
          <span className="flex-1">{error}</span>
          <button onClick={() => setError(null)}><X className="w-4 h-4" /></button>
        </div>
      )}

      {/* Tarefas disponíveis para pegar (sem responsável) */}
      {available.length > 0 && (
        <section className="rounded-xl border border-emerald-200 dark:border-emerald-900 bg-emerald-50/50 dark:bg-emerald-900/10 p-4">
          <h2 className="text-sm font-semibold text-emerald-700 dark:text-emerald-300 mb-1 flex items-center gap-2">
            <Inbox className="w-4 h-4" /> Tarefas disponíveis para pegar
            <span className="text-xs text-emerald-600/70 dark:text-emerald-400/70">({available.length})</span>
          </h2>
          <p className="text-xs text-emerald-700/70 dark:text-emerald-400/60 mb-2">Tarefas de projetos ainda sem responsável. Clique no <UserPlus className="w-3 h-3 inline" /> para assumir.</p>
          <div className="space-y-2">
            {available.map(t => (
              <div key={t.id} className="flex items-center gap-3 bg-white dark:!bg-[#243040] rounded-lg px-3 py-2 border border-gray-200 dark:border-gray-700">
                <div className="min-w-0 flex-1">
                  <div className="text-sm text-gray-800 dark:text-gray-100 truncate flex items-center gap-1.5">
                    {t.name}
                    {t.gestor_only && <span title="Restrita a gestor (gerente/admin)" className="text-[10px] font-medium uppercase tracking-wide px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">gestor</span>}
                    {t.review_required && <span title="Exige revisão para concluir" className="text-[10px] font-medium uppercase tracking-wide px-1.5 py-0.5 rounded bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300">revisão</span>}
                  </div>
                  <div className="text-xs text-gray-500 dark:text-gray-400 truncate">{t.project_name}{t.stage_name ? ` · ${t.stage_name}` : ''}</div>
                </div>
                {t.default_days != null && <span title="Prazo (dias) — começa a contar quando você pega" className="text-[11px] text-gray-400 flex items-center gap-1 flex-shrink-0"><Clock className="w-3 h-3" />{t.default_days}d</span>}
                {t.can_assign && (
                  <button onClick={() => setAssignTask(t)} disabled={busyId === t.id} title="Atribuir a outra pessoa"
                    className="p-1.5 rounded-lg bg-violet-50 dark:bg-violet-900/20 text-violet-600 dark:text-violet-400 hover:bg-violet-100 disabled:opacity-50 flex-shrink-0">
                    <Users className="w-4 h-4" />
                  </button>
                )}
                {permissions.canEdit && (
                  <button onClick={() => claim(t)} disabled={busyId === t.id} title="Pegar esta tarefa para você"
                    className="p-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-100 disabled:opacity-50 flex-shrink-0">
                    {busyId === t.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
                  </button>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Minhas tarefas */}
      {available.length > 0 && !loading && tasks.length > 0 && (
        <h2 className="text-base font-bold text-gray-800 dark:text-gray-100">Minhas tarefas</h2>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-16 text-gray-400"><Loader2 className="w-7 h-7 animate-spin" /></div>
      ) : tasks.length === 0 ? (
        <div className="text-center py-16 bg-white dark:!bg-[#243040] rounded-2xl border border-gray-200 dark:border-gray-700">
          <ListTodo className="w-10 h-10 mx-auto mb-3 text-gray-300 dark:text-gray-600" />
          <p className="text-gray-500 dark:text-gray-400 text-sm">Nenhuma tarefa atribuída a você.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {GROUPS.map(g => {
            const list = byGroup(g.statuses)
            if (list.length === 0) return null
            return (
              <section key={g.key}>
                <h2 className="text-sm font-semibold text-gray-600 dark:text-gray-300 mb-2 flex items-center gap-2">
                  {g.label} <span className="text-xs text-gray-400">({list.length})</span>
                </h2>
                <div className="space-y-2">
                  {list.map(t => {
                    const paused = !!t.paused_at
                    const st = (t.status === 'in_progress' && paused)
                      ? { label: 'Pausada', cls: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' }
                      : (TASK_STATUS_META[t.status] || { label: t.status, cls: 'bg-gray-100 text-gray-600' })
                    return (
                      <div key={t.id} className="bg-white dark:!bg-[#243040] border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-3 flex items-center gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="font-medium text-gray-800 dark:text-gray-100 text-sm truncate">{t.name}</div>
                          <div className="text-xs text-gray-500 dark:text-gray-400 truncate">
                            {t.project_name}{t.stage_name ? ` · ${t.stage_name}` : ''}
                          </div>
                        </div>
                        {(t.due_date || t.default_days != null) && (
                          <span title={t.due_date ? 'Vence em' : 'Prazo (dias)'} className="text-[11px] text-gray-400 flex items-center gap-1 flex-shrink-0"><Clock className="w-3 h-3" />{t.due_date ? fmtDate(t.due_date) : `${t.default_days}d`}</span>
                        )}
                        <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium flex-shrink-0 ${st.cls}`}>{st.label}</span>

                        {permissions.canEdit && (
                          <div className="flex items-center gap-1 flex-shrink-0">
                            {/* Prazo da tarefa (só desta tarefa): admin altera direto, demais pedem aprovação */}
                            {t.due_action && (t.status === 'in_progress' || t.status === 'overdue') && (
                              <button onClick={() => setDueTask(t)} disabled={busyId === t.id}
                                title={t.due_action === 'request' ? 'Solicitar alteração de prazo' : 'Editar prazo'}
                                className="p-1.5 rounded-lg bg-violet-50 dark:bg-violet-900/20 text-violet-600 dark:text-violet-400 hover:bg-violet-100 disabled:opacity-50">
                                <CalendarClock className="w-4 h-4" />
                              </button>
                            )}
                            {(t.status === 'available' || t.status === 'overdue' || t.status === 'pending_adjustment') && (
                              <button onClick={() => startAndFocus(t)} disabled={busyId === t.id} title="Iniciar (abre o foco)"
                                className="p-1.5 rounded-lg bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 hover:bg-blue-100 disabled:opacity-50">
                                {busyId === t.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                              </button>
                            )}
                            {t.status === 'in_progress' && !paused && (
                              <button onClick={() => act(t, 'pause')} disabled={busyId === t.id} title="Pausar"
                                className="p-1.5 rounded-lg bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400 hover:bg-amber-100 disabled:opacity-50">
                                <Pause className="w-4 h-4" />
                              </button>
                            )}
                            {t.status === 'in_progress' && paused && (
                              <button onClick={() => act(t, 'resume')} disabled={busyId === t.id} title="Retomar"
                                className="p-1.5 rounded-lg bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400 hover:bg-amber-100 disabled:opacity-50">
                                <RotateCcw className="w-4 h-4" />
                              </button>
                            )}
                            {/* Em andamento sem cronômetro ativo → iniciar um Pomodoro novo (ex.: sessão estacionada expirou). */}
                            {t.status === 'in_progress' && !paused && !session && (
                              <button onClick={() => setFocusTask(t)} disabled={busyId === t.id} title="Iniciar cronômetro (foco)"
                                className="p-1.5 rounded-lg bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 hover:bg-blue-100 disabled:opacity-50">
                                <Timer className="w-4 h-4" />
                              </button>
                            )}
                            {t.status === 'in_progress' && (
                              <button onClick={() => setHelpTask(t)} disabled={busyId === t.id} title="Pedir ajuda"
                                className="p-1.5 rounded-lg bg-sky-50 dark:bg-sky-900/20 text-sky-600 dark:text-sky-400 hover:bg-sky-100 disabled:opacity-50">
                                <HelpCircle className="w-4 h-4" />
                              </button>
                            )}
                            {t.status === 'in_progress' && (
                              <button onClick={() => act(t, 'complete')} disabled={busyId === t.id} title={t.review_required ? 'Enviar p/ revisão' : 'Concluir'}
                                className="p-1.5 rounded-lg bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400 hover:bg-green-100 disabled:opacity-50">
                                <CheckCircle2 className="w-4 h-4" />
                              </button>
                            )}
                            {t.status === 'completed' && (
                              <button onClick={() => setUncompleteFor(t)} disabled={busyId === t.id} title="Desconcluir (reabrir)"
                                className="p-1.5 rounded-lg bg-orange-50 dark:bg-orange-900/20 text-orange-600 dark:text-orange-400 hover:bg-orange-100 disabled:opacity-50">
                                <Undo2 className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </section>
            )
          })}
        </div>
      )}

      {focusTask && (
        <PomodoroStartModal
          taskId={focusTask.id}
          taskName={focusTask.name}
          onClose={() => setFocusTask(null)}
          onStarted={() => { setFocusTask(null) }}
        />
      )}

      {showIdle && (
        <IdleAlertModal
          onChoose={() => setShowIdle(false)}
          onSnooze={() => {
            setShowIdle(false)
            if (idleTimerRef.current) clearTimeout(idleTimerRef.current)
            idleTimerRef.current = setTimeout(() => { if (!session) setShowIdle(true) }, 30 * 60 * 1000)
          }}
          onDismiss={() => setShowIdle(false)}
        />
      )}

      {helpTask && (
        <HelpRequestModal task={helpTask} onClose={() => setHelpTask(null)} onDone={() => { setHelpTask(null); load() }} />
      )}

      {reviewTask && (
        <TaskReviewModal task={reviewTask} onClose={() => setReviewTask(null)}
          onDone={() => { setReviewTask(null); load(); try { window.dispatchEvent(new CustomEvent('pm-tasks-changed')) } catch { /* noop */ } }} />
      )}

      {dueTask && (
        <TaskDueDateModal task={dueTask} onClose={() => setDueTask(null)} onDone={load} />
      )}

      {dueModal && (
        <DueProposalModal mode={dueModal.mode} request={dueModal.request}
          onClose={() => setDueModal(null)} onDone={() => { setDueModal(null); load() }} />
      )}

      {claimFor && (
        <ClaimTaskModal task={claimFor} onClose={() => setClaimFor(null)}
          onDone={() => { setClaimFor(null); load(); try { window.dispatchEvent(new CustomEvent('pm-tasks-changed')) } catch { /* noop */ } }} />
      )}

      {uncompleteFor && (
        <UncompleteTaskModal task={uncompleteFor} onClose={() => setUncompleteFor(null)}
          onDone={() => { setUncompleteFor(null); load(); try { window.dispatchEvent(new CustomEvent('pm-tasks-changed')) } catch { /* noop */ } }} />
      )}

      {assignTask && (
        <AssignTaskModal
          projectId={assignTask.project_id}
          taskId={assignTask.id}
          taskName={assignTask.name}
          currentAssigneeId={assignTask.assignee_user_id}
          onClose={() => setAssignTask(null)}
          onDone={() => { setAssignTask(null); load() }}
        />
      )}
    </div>
  )
}

export default Tarefas
