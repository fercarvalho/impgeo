import React, { useEffect, useState } from 'react'
import Modal from '@/components/Modal'
import { HelpCircle, X, Loader2 } from 'lucide-react'
import { createHelpRequest, fetchPmUsers, PmUser, PmTask } from './taskApi'

// Modal para pedir ajuda em uma tarefa: escolhe um colega + descreve a ajuda.
const HelpRequestModal: React.FC<{ task: PmTask; onClose: () => void; onDone: () => void }> = ({ task, onClose, onDone }) => {
  const [users, setUsers] = useState<PmUser[]>([])
  const [targetUserId, setTargetUserId] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => { fetchPmUsers().then(setUsers).catch(() => {}) }, [])

  const submit = async () => {
    if (!targetUserId) { setError('Selecione quem vai ajudar'); return }
    if (!message.trim()) { setError('Descreva a ajuda necessária'); return }
    setBusy(true); setError(null)
    try { await createHelpRequest(task.id, targetUserId, message.trim()); onDone() }
    catch (e: any) { setError(e.message); setBusy(false) }
  }

  return (
    <Modal isOpen onClose={onClose}>
      <div className="bg-white dark:!bg-[#243040] rounded-2xl w-full max-w-md shadow-2xl overflow-hidden">
        <div className="bg-gradient-to-r from-sky-500 to-blue-600 px-5 py-3 flex items-center justify-between">
          <h3 className="text-white font-bold flex items-center gap-2"><HelpCircle className="w-4 h-4" /> Pedir ajuda</h3>
          <button onClick={onClose} className="text-white/80 hover:text-white"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-5 space-y-3">
          {error && <div className="text-sm text-red-600 dark:text-red-400">{error}</div>}
          <p className="text-sm text-gray-600 dark:text-gray-300">Tarefa: <strong>{task.name}</strong></p>
          <div>
            <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">Quem pode ajudar?</label>
            <select value={targetUserId} onChange={e => setTargetUserId(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 dark:text-gray-100 text-sm">
              <option value="">Selecione…</option>
              {users.map(u => <option key={u.id} value={u.id}>{u.name} ({u.role})</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">Do que você precisa?</label>
            <textarea autoFocus rows={3} value={message} onChange={e => setMessage(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 dark:text-gray-100 text-sm" />
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <button onClick={onClose} className="px-4 py-2 rounded-xl bg-gray-100 dark:!bg-[#2d3f52] text-gray-700 dark:text-gray-200 text-sm font-medium">Cancelar</button>
            <button onClick={submit} disabled={busy}
              className="px-4 py-2 rounded-xl bg-gradient-to-r from-sky-500 to-blue-600 text-white text-sm font-semibold disabled:opacity-50 flex items-center gap-1.5">
              {busy && <Loader2 className="w-4 h-4 animate-spin" />} Enviar pedido
            </button>
          </div>
        </div>
      </div>
    </Modal>
  )
}

export default HelpRequestModal
