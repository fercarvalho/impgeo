import React, { useState } from 'react'
import Modal from '@/components/Modal'
import { CalendarClock, X, Loader2 } from 'lucide-react'
import { decideDueRequest, respondDueProposal, DueDateRequest } from './taskApi'

// Modal de data para a negociação de prazo:
//  - modo 'decider'   → o gestor propõe OU força uma nova data (+ nota opcional).
//  - modo 'requester' → o solicitante contrapropõe uma nova data (+ justificativa).
const DueProposalModal: React.FC<{
  mode: 'decider' | 'requester'
  request: DueDateRequest
  onClose: () => void
  onDone: () => void
}> = ({ mode, request, onClose, onDone }) => {
  const [date, setDate] = useState((request.requested_due_date || '').slice(0, 10))
  const [kind, setKind] = useState<'propose' | 'force'>('propose') // só no modo decisor
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async () => {
    if (!date) { setError('Informe a data'); return }
    setBusy(true); setError(null)
    try {
      if (mode === 'decider') {
        await decideDueRequest(request.id, { action: kind, newDueDate: date, note: note || null })
      } else {
        await respondDueProposal(request.id, { action: 'propose', newDueDate: date, justification: note || null })
      }
      onDone()
    } catch (e: any) { setError(e.message); setBusy(false) }
  }

  const inputCls = 'w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 dark:text-gray-100 text-sm'

  return (
    <Modal isOpen onClose={onClose}>
      <div className="bg-white dark:!bg-[#243040] rounded-2xl w-full max-w-sm shadow-2xl overflow-hidden">
        <div className="bg-gradient-to-r from-violet-500 to-indigo-600 px-5 py-3 flex items-center justify-between">
          <h3 className="text-white font-bold flex items-center gap-2"><CalendarClock className="w-4 h-4" /> {mode === 'decider' ? 'Propor / forçar prazo' : 'Contrapropor prazo'}</h3>
          <button onClick={onClose} className="text-white/80 hover:text-white"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-5 space-y-3">
          {error && <div className="text-sm text-red-600 dark:text-red-400">{error}</div>}
          <p className="text-sm text-gray-600 dark:text-gray-300 truncate"><strong>{request.task_name}</strong></p>
          <div>
            <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">Nova data</label>
            <input type="date" value={date} onChange={e => setDate(e.target.value)} className={inputCls} />
          </div>
          {mode === 'decider' && (
            <div className="space-y-1.5">
              <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-200 cursor-pointer">
                <input type="radio" name="due-kind" checked={kind === 'propose'} onChange={() => setKind('propose')} />
                Propor (o solicitante aceita ou contrapropõe)
              </label>
              <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-200 cursor-pointer">
                <input type="radio" name="due-kind" checked={kind === 'force'} onChange={() => setKind('force')} />
                Forçar (aplica a data na hora)
              </label>
            </div>
          )}
          <textarea value={note} onChange={e => setNote(e.target.value)} rows={2}
            placeholder={mode === 'decider' ? 'Justificativa (opcional)…' : 'Justificativa (opcional)…'} className={inputCls} />
          <div className="flex justify-end gap-2 pt-1">
            <button onClick={onClose} className="px-4 py-2 rounded-xl bg-gray-100 dark:!bg-[#2d3f52] text-gray-700 dark:text-gray-200 text-sm font-medium">Cancelar</button>
            <button onClick={submit} disabled={busy || !date}
              className="px-4 py-2 rounded-xl bg-gradient-to-r from-violet-500 to-indigo-600 text-white text-sm font-semibold disabled:opacity-50 flex items-center gap-1.5">
              {busy && <Loader2 className="w-4 h-4 animate-spin" />} {mode === 'decider' ? (kind === 'force' ? 'Forçar prazo' : 'Propor prazo') : 'Contrapropor'}
            </button>
          </div>
        </div>
      </div>
    </Modal>
  )
}

export default DueProposalModal
