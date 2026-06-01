import React, { useCallback, useEffect, useState } from 'react'
import Modal from '@/components/Modal'
import { Inbox, X, Check, Loader2 } from 'lucide-react'
import { fetchMyTasks, taskAction, PmTask } from './taskApi'

// Hook compartilhado: tarefas aguardando aceite do usuário atual.
export function usePendingAcceptanceTasks() {
  const [tasks, setTasks] = useState<PmTask[]>([])
  const [loading, setLoading] = useState(true)
  const refetch = useCallback(async () => {
    try {
      const data = await fetchMyTasks(['pending_acceptance'])
      setTasks(data)
    } catch { /* silencioso no banner */ }
    finally { setLoading(false) }
  }, [])
  useEffect(() => {
    refetch()
    const onChanged = () => refetch()
    window.addEventListener('pm-tasks-changed', onChanged)
    return () => window.removeEventListener('pm-tasks-changed', onChanged)
  }, [refetch])
  return { tasks, count: tasks.length, loading, refetch }
}

// Banner "Você tem possíveis novas tarefas" + modal de aceite/recusa.
// Reutilizado no Dashboard e no módulo Tarefas.
const PendingTasksBanner: React.FC<{ onChanged?: () => void }> = ({ onChanged }) => {
  const { tasks, count, refetch } = usePendingAcceptanceTasks()
  const [open, setOpen] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [refuseFor, setRefuseFor] = useState<PmTask | null>(null)
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | null>(null)

  if (count === 0) return null

  const notifyChange = () => {
    refetch()
    onChanged?.()
    try { window.dispatchEvent(new CustomEvent('pm-tasks-changed')) } catch { /* noop */ }
  }

  const accept = async (t: PmTask) => {
    setBusyId(t.id); setError(null)
    try { await taskAction(t.id, 'accept'); notifyChange() }
    catch (e: any) { setError(e.message) }
    finally { setBusyId(null) }
  }
  const submitRefuse = async () => {
    if (!refuseFor) return
    if (!reason.trim()) { setError('Justificativa obrigatória'); return }
    setBusyId(refuseFor.id); setError(null)
    try { await taskAction(refuseFor.id, 'refuse', { reason: reason.trim() }); setRefuseFor(null); setReason(''); notifyChange() }
    catch (e: any) { setError(e.message) }
    finally { setBusyId(null) }
  }

  return (
    <>
      <div className="flex items-center gap-3 px-4 py-3 rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20">
        <Inbox className="w-5 h-5 text-amber-600 dark:text-amber-400 flex-shrink-0" />
        <span className="flex-1 text-sm font-medium text-amber-800 dark:text-amber-300">
          Você tem possíveis novas tarefas ({count})
        </span>
        <button onClick={() => { setOpen(true); setError(null) }}
          className="px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-sm font-semibold transition-colors">
          Revisar
        </button>
      </div>

      {open && (
        <Modal isOpen onClose={() => setOpen(false)}>
          <div className="bg-white dark:!bg-[#243040] rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden">
            <div className="bg-gradient-to-r from-amber-500 to-orange-600 px-5 py-3 flex items-center justify-between">
              <h3 className="text-white font-bold flex items-center gap-2"><Inbox className="w-4 h-4" /> Tarefas para aceitar</h3>
              <button onClick={() => setOpen(false)} className="text-white/80 hover:text-white"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-5 space-y-3 max-h-[70vh] overflow-y-auto">
              {error && <div className="text-sm text-red-600 dark:text-red-400">{error}</div>}
              {tasks.length === 0 && <p className="text-sm text-gray-400">Nada pendente.</p>}
              {tasks.map(t => (
                <div key={t.id} className="border border-gray-200 dark:border-gray-700 rounded-xl p-3">
                  <div className="font-medium text-gray-800 dark:text-gray-100 text-sm">{t.name}</div>
                  <div className="text-xs text-gray-500 dark:text-gray-400 mb-2">
                    {t.project_name}{t.stage_name ? ` · ${t.stage_name}` : ''}
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => accept(t)} disabled={busyId === t.id}
                      className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-green-600 hover:bg-green-700 text-white text-xs font-semibold disabled:opacity-50">
                      {busyId === t.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />} Aceitar
                    </button>
                    <button onClick={() => { setRefuseFor(t); setReason(''); setError(null) }} disabled={busyId === t.id}
                      className="px-3 py-1.5 rounded-lg bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 text-xs font-semibold hover:bg-red-100 dark:hover:bg-red-900/40 disabled:opacity-50">
                      Recusar
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </Modal>
      )}

      {refuseFor && (
        <Modal isOpen onClose={() => setRefuseFor(null)}>
          <div className="bg-white dark:!bg-[#243040] rounded-2xl w-full max-w-md shadow-2xl overflow-hidden">
            <div className="bg-gradient-to-r from-red-500 to-red-600 px-5 py-3 flex items-center justify-between">
              <h3 className="text-white font-bold">Recusar tarefa</h3>
              <button onClick={() => setRefuseFor(null)} className="text-white/80 hover:text-white"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-5 space-y-3">
              {error && <div className="text-sm text-red-600 dark:text-red-400">{error}</div>}
              <p className="text-sm text-gray-600 dark:text-gray-300">Justifique a recusa de <strong>{refuseFor.name}</strong>:</p>
              <textarea autoFocus rows={3} value={reason} onChange={e => setReason(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 dark:text-gray-100 text-sm" />
              <div className="flex justify-end gap-2">
                <button onClick={() => setRefuseFor(null)} className="px-4 py-2 rounded-xl bg-gray-100 dark:!bg-[#2d3f52] text-gray-700 dark:text-gray-200 text-sm font-medium">Cancelar</button>
                <button onClick={submitRefuse} disabled={busyId === refuseFor.id}
                  className="px-4 py-2 rounded-xl bg-gradient-to-r from-red-500 to-red-600 text-white text-sm font-semibold disabled:opacity-50">Recusar</button>
              </div>
            </div>
          </div>
        </Modal>
      )}
    </>
  )
}

export default PendingTasksBanner
