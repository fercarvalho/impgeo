import React, { useCallback, useEffect, useRef, useState } from 'react'
import { ListTodo, Play, Pause, RotateCcw, CheckCircle2, Clock, Loader2, AlertTriangle, X, HelpCircle, ClipboardCheck, UserPlus, Inbox, Timer, CalendarClock, Check } from 'lucide-react'
import { usePermissions } from '@/hooks/usePermissions'
import PendingTasksBanner from './_pm/PendingTasksBanner'
import {
  fetchMyTasks, taskAction, TASK_STATUS_META, PmTask,
  fetchPendingReviews, fetchIncomingHelp, helpAction, HelpRequest,
  fetchAvailableTasks, claimTask,
  fetchPendingDueRequests, decideDueRequest, DueDateRequest,
} from './_pm/taskApi'
import { useActiveSession, markTaskAreaOpened, getActive } from './_pm/pomodoroApi'
import PomodoroStartModal from './_pm/PomodoroStartModal'
import IdleAlertModal from './_pm/IdleAlertModal'
import HelpRequestModal from './_pm/HelpRequestModal'
import TaskReviewModal from './_pm/TaskReviewModal'

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
  const { session } = useActiveSession()
  const [tasks, setTasks] = useState<PmTask[]>([])
  const [available, setAvailable] = useState<PmTask[]>([])
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [focusTask, setFocusTask] = useState<PmTask | null>(null)  // abre PomodoroStartModal
  const [helpTask, setHelpTask] = useState<PmTask | null>(null)    // abre HelpRequestModal
  const [reviewTask, setReviewTask] = useState<PmTask | null>(null) // abre TaskReviewModal
  const [showIdle, setShowIdle] = useState(false)
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Fase 6: revisões (gestor) e ajudas recebidas.
  const [pendingReviews, setPendingReviews] = useState<PmTask[] | null>(null) // null = não-gestor
  const [incomingHelp, setIncomingHelp] = useState<HelpRequest[]>([])
  const [dueReqs, setDueReqs] = useState<DueDateRequest[] | null>(null) // null = não-gestor

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

  const claim = async (t: PmTask) => {
    if (!window.confirm(`Pegar a tarefa "${t.name}" para você?`)) return
    setBusyId(t.id); setError(null)
    try {
      await claimTask(t.id)
      await load()
      try { window.dispatchEvent(new CustomEvent('pm-tasks-changed')) } catch { /* noop */ }
    } catch (e: any) { setError(e.message) }
    finally { setBusyId(null) }
  }

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
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">Alterações de prazo pedem aprovação. Aprove para aplicar o novo prazo na tarefa.</p>
          <div className="space-y-2">
            {dueReqs.map(d => (
              <div key={d.id} className="flex items-center gap-3 bg-white dark:!bg-[#243040] rounded-lg px-3 py-2 border border-gray-200 dark:border-gray-700">
                <div className="min-w-0 flex-1">
                  <div className="text-sm text-gray-800 dark:text-gray-100 truncate">{d.task_name} <span className="text-xs text-gray-400">· {d.project_name}</span></div>
                  <div className="text-xs text-gray-500 dark:text-gray-400">
                    {d.requester_name} ({d.requester_role === 'manager' ? 'gerente' : 'usuário'}): {d.current_due_date || 'sem prazo'} → <strong>{d.requested_due_date || 'sem prazo'}</strong>
                  </div>
                  {d.justification && <div className="text-xs text-gray-500 dark:text-gray-400">Justificativa: {d.justification}</div>}
                </div>
                <button onClick={async () => { await decideDueRequest(d.id, true); load() }} title="Aprovar"
                  className="p-1.5 rounded-lg bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400 hover:bg-green-100"><Check className="w-4 h-4" /></button>
                <button onClick={async () => { await decideDueRequest(d.id, false); load() }} title="Recusar"
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
                <button onClick={() => setReviewTask(t)}
                  className="px-3 py-1.5 rounded-lg bg-violet-600 hover:bg-violet-700 text-white text-xs font-semibold">Revisar</button>
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
                      <button onClick={async () => { const r = window.prompt('Motivo da recusa:'); if (r?.trim()) { await helpAction(h.id, 'refuse', { reason: r.trim() }); load() } }}
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
                  <div className="text-sm text-gray-800 dark:text-gray-100 truncate">{t.name}</div>
                  <div className="text-xs text-gray-500 dark:text-gray-400 truncate">{t.project_name}{t.stage_name ? ` · ${t.stage_name}` : ''}</div>
                </div>
                {t.due_date && <span className="text-[11px] text-gray-400 flex items-center gap-1 flex-shrink-0"><Clock className="w-3 h-3" />{t.due_date}</span>}
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
                        {t.due_date && (
                          <span className="text-[11px] text-gray-400 flex items-center gap-1 flex-shrink-0"><Clock className="w-3 h-3" />{t.due_date}</span>
                        )}
                        <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium flex-shrink-0 ${st.cls}`}>{st.label}</span>

                        {permissions.canEdit && (
                          <div className="flex items-center gap-1 flex-shrink-0">
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
    </div>
  )
}

export default Tarefas
