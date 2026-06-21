import React, { useEffect, useState } from 'react'
import Modal from '@/components/Modal'
import { UserPlus, X, Loader2 } from 'lucide-react'
import { fetchAssignableUsers, PmUser } from './taskApi'

// Atribui uma tarefa do projeto a um usuário (ação de gestor).
const AssignTaskModal: React.FC<{
  projectId: string
  taskId: string
  taskName: string
  currentAssigneeId?: string | null
  onClose: () => void
  onDone: () => void
}> = ({ projectId, taskId, taskName, currentAssigneeId = null, onClose, onDone }) => {
  const [users, setUsers] = useState<PmUser[]>([])
  const [userId, setUserId] = useState(currentAssigneeId || '')
  const [dueDate, setDueDate] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  useEffect(() => { fetchAssignableUsers(taskId).then(setUsers).catch(() => {}) }, [taskId])

  const submit = async () => {
    if (!userId) { setError('Selecione um responsável'); return }
    setBusy(true); setError(null)
    try {
      const r = await fetch(`/api/projects/${projectId}/tasks/${taskId}/assign`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, ...(dueDate ? { dueDate } : {}) }),
      })
      const j = await r.json()
      if (!j.success) throw new Error(j.error || 'Falha ao atribuir')
      if (j.data?.requested) { setNotice('Pedido de delegação enviado — um admin precisa aprovar antes de a tarefa ir para o usuário.'); setBusy(false); return }
      onDone()
    } catch (e: any) { setError(e.message); setBusy(false) }
  }

  return (
    <Modal isOpen onClose={onClose}>
      <div className="bg-white dark:!bg-[#243040] rounded-2xl w-full max-w-md shadow-2xl overflow-hidden">
        <div className="bg-gradient-to-r from-violet-500 to-indigo-600 px-5 py-3 flex items-center justify-between">
          <h3 className="text-white font-bold flex items-center gap-2"><UserPlus className="w-4 h-4" /> Atribuir tarefa</h3>
          <button onClick={onClose} className="text-white/80 hover:text-white"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-5 space-y-3">
          {notice ? (
            <>
              <div className="text-sm text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-xl px-3 py-2">{notice}</div>
              <div className="flex justify-end pt-1">
                <button onClick={onDone} className="px-4 py-2 rounded-xl bg-gradient-to-r from-violet-500 to-indigo-600 text-white text-sm font-semibold">Ok</button>
              </div>
            </>
          ) : (
          <>
          {error && <div className="text-sm text-red-600 dark:text-red-400">{error}</div>}
          <p className="text-sm text-gray-600 dark:text-gray-300">Tarefa: <strong>{taskName}</strong></p>
          <div>
            <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">Responsável</label>
            <select autoFocus value={userId} onChange={e => setUserId(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 dark:text-gray-100 text-sm">
              <option value="">Selecione…</option>
              {users.map(u => <option key={u.id} value={u.id}>{u.name} ({u.role})</option>)}
            </select>
            <p className="text-xs text-gray-400 mt-1">Se a tarefa exige aceite, ela vai para "aguardando aceite" do responsável.</p>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">Prazo (opcional)</label>
            <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 dark:text-gray-100 text-sm" />
            <p className="text-xs text-gray-400 mt-1">Vencido (data passada) → vira "Atrasada" automaticamente em ~1 min (cron).</p>
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <button onClick={onClose} className="px-4 py-2 rounded-xl bg-gray-100 dark:!bg-[#2d3f52] text-gray-700 dark:text-gray-200 text-sm font-medium">Cancelar</button>
            <button onClick={submit} disabled={busy}
              className="px-4 py-2 rounded-xl bg-gradient-to-r from-violet-500 to-indigo-600 text-white text-sm font-semibold disabled:opacity-50 flex items-center gap-1.5">
              {busy && <Loader2 className="w-4 h-4 animate-spin" />} Atribuir
            </button>
          </div>
          </>
          )}
        </div>
      </div>
    </Modal>
  )
}

export default AssignTaskModal
