import React, { useCallback, useEffect, useState } from 'react'
import { ListTodo, Play, Pause, RotateCcw, CheckCircle2, Clock, Loader2, AlertTriangle, X } from 'lucide-react'
import { usePermissions } from '@/hooks/usePermissions'
import PendingTasksBanner from './_pm/PendingTasksBanner'
import { fetchMyTasks, taskAction, TASK_STATUS_META, PmTask } from './_pm/taskApi'

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
  const [tasks, setTasks] = useState<PmTask[]>([])
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try { setTasks(await fetchMyTasks()) }
    catch (e: any) { setError(e.message || 'Falha ao carregar tarefas') }
    finally { setLoading(false) }
  }, [])

  useEffect(() => {
    load()
    const onChanged = () => load()
    window.addEventListener('pm-tasks-changed', onChanged)
    return () => window.removeEventListener('pm-tasks-changed', onChanged)
  }, [load])

  const act = async (t: PmTask, action: 'start' | 'pause' | 'resume' | 'complete', body?: any) => {
    setBusyId(t.id); setError(null)
    try {
      await taskAction(t.id, action, body)
      await load()
      try { window.dispatchEvent(new CustomEvent('pm-tasks-changed')) } catch { /* noop */ }
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

      {error && (
        <div role="alert" className="flex items-center gap-2 px-4 py-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl text-red-700 dark:text-red-400 text-sm">
          <AlertTriangle className="w-4 h-4 flex-shrink-0" />
          <span className="flex-1">{error}</span>
          <button onClick={() => setError(null)}><X className="w-4 h-4" /></button>
        </div>
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
                    const st = TASK_STATUS_META[t.status] || { label: t.status, cls: 'bg-gray-100 text-gray-600' }
                    const paused = !!t.paused_at
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
                              <button onClick={() => act(t, 'start')} disabled={busyId === t.id} title="Iniciar"
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
    </div>
  )
}

export default Tarefas
