import React, { useState } from 'react'
import Modal from '@/components/Modal'
import { ClipboardCheck, X, Loader2, Check, RotateCcw } from 'lucide-react'
import { reviewApprove, reviewReject, PmTask } from './taskApi'

// Modal de revisão (admin/manager): aprovar ou reprovar com ajustes.
const TaskReviewModal: React.FC<{ task: PmTask; onClose: () => void; onDone: () => void }> = ({ task, onClose, onDone }) => {
  const [mode, setMode] = useState<'choose' | 'reject'>('choose')
  const [notes, setNotes] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const approve = async () => {
    setBusy(true); setError(null)
    try { await reviewApprove(task.id); onDone() }
    catch (e: any) { setError(e.message); setBusy(false) }
  }
  const reject = async () => {
    if (!notes.trim()) { setError('Descreva os ajustes necessários'); return }
    setBusy(true); setError(null)
    try { await reviewReject(task.id, notes.trim()); onDone() }
    catch (e: any) { setError(e.message); setBusy(false) }
  }

  return (
    <Modal isOpen onClose={onClose}>
      <div className="bg-white dark:!bg-[#243040] rounded-2xl w-full max-w-md shadow-2xl overflow-hidden">
        <div className="bg-gradient-to-r from-violet-500 to-indigo-600 px-5 py-3 flex items-center justify-between">
          <h3 className="text-white font-bold flex items-center gap-2"><ClipboardCheck className="w-4 h-4" /> Revisar tarefa</h3>
          <button onClick={onClose} className="text-white/80 hover:text-white"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-5 space-y-4">
          {error && <div className="text-sm text-red-600 dark:text-red-400">{error}</div>}
          <p className="text-sm text-gray-600 dark:text-gray-300">
            Tarefa: <strong>{task.name}</strong>
            {task.project_name && <span className="text-gray-400"> · {task.project_name}</span>}
          </p>

          {mode === 'choose' ? (
            <div className="flex flex-col gap-2">
              <button onClick={approve} disabled={busy}
                className="w-full py-2.5 rounded-xl bg-green-600 hover:bg-green-700 text-white font-semibold flex items-center justify-center gap-2 disabled:opacity-50">
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />} Aprovar
              </button>
              <button onClick={() => setMode('reject')} disabled={busy}
                className="w-full py-2.5 rounded-xl bg-orange-50 dark:bg-orange-900/20 text-orange-600 dark:text-orange-400 font-semibold flex items-center justify-center gap-2 hover:bg-orange-100">
                <RotateCcw className="w-4 h-4" /> Reprovar (pedir ajustes)
              </button>
              <p className="text-xs text-gray-400 text-center mt-1">
                Se você for gerente, ao aprovar será criada uma tarefa de acompanhamento para um admin.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300">Ajustes necessários *</label>
              <textarea autoFocus rows={3} value={notes} onChange={e => setNotes(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 dark:text-gray-100 text-sm" />
              <div className="flex justify-end gap-2">
                <button onClick={() => setMode('choose')} className="px-4 py-2 rounded-xl bg-gray-100 dark:!bg-[#2d3f52] text-gray-700 dark:text-gray-200 text-sm font-medium">Voltar</button>
                <button onClick={reject} disabled={busy}
                  className="px-4 py-2 rounded-xl bg-gradient-to-r from-orange-500 to-red-500 text-white text-sm font-semibold disabled:opacity-50">Reprovar</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </Modal>
  )
}

export default TaskReviewModal
