import React, { useState } from 'react'
import Modal from '@/components/Modal'
import { CalendarClock, X, Loader2, CheckCircle2 } from 'lucide-react'
import { setTaskDueDate } from './taskApi'

// Modal de prazo da tarefa (instância — não mexe no prazo padrão da estrutura).
// admin/superadmin (due_action='edit') alteram direto; manager/usuário ('request') pedem aprovação.
interface Props {
  task: { id: string; name: string; due_date?: string | null; due_action?: 'edit' | 'request' | null }
  onClose: () => void
  onDone: () => void
}

const TaskDueDateModal: React.FC<Props> = ({ task, onClose, onDone }) => {
  const isReq = task.due_action === 'request'
  const [val, setVal] = useState((task.due_date || '').slice(0, 10))
  const [just, setJust] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)

  const save = async (v: string) => {
    setBusy(true); setError(null)
    try {
      const r = await setTaskDueDate(task.id, v || null, isReq ? just : undefined)
      if (r?.requested) { setMsg('Pedido enviado! Um gestor vai aprovar — você será notificado.'); onDone() }
      else { onDone(); onClose() }
    } catch (e: any) { setError(e.message) } finally { setBusy(false) }
  }

  const inputCls = 'w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 dark:text-gray-100 text-sm'

  return (
    <Modal isOpen onClose={onClose}>
      <div className="bg-white dark:!bg-[#243040] rounded-2xl w-full max-w-sm shadow-2xl overflow-hidden">
        <div className="bg-gradient-to-r from-violet-500 to-indigo-600 px-5 py-3 flex items-center justify-between">
          <h3 className="text-white font-bold flex items-center gap-2"><CalendarClock className="w-4 h-4" /> {isReq ? 'Solicitar alteração de prazo' : 'Prazo da tarefa'}</h3>
          <button onClick={onClose} className="text-white/80 hover:text-white"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-5 space-y-3">
          {error && <div className="text-sm text-red-600 dark:text-red-400">{error}</div>}
          {msg ? (
            <div className="text-center space-y-2 py-2">
              <CheckCircle2 className="w-10 h-10 mx-auto text-green-500" />
              <p className="text-sm text-gray-700 dark:text-gray-200">{msg}</p>
              <button onClick={onClose} className="mt-1 px-4 py-2 rounded-xl bg-gradient-to-r from-violet-500 to-indigo-600 text-white text-sm font-semibold">Fechar</button>
            </div>
          ) : (
            <>
              <p className="text-sm text-gray-600 dark:text-gray-300 truncate"><strong>{task.name}</strong></p>
              <input type="date" value={val} onChange={e => setVal(e.target.value)} className={inputCls} />
              {isReq ? (
                <>
                  <p className="text-xs text-amber-600 dark:text-amber-400">A alteração precisa de aprovação de um gestor. Você será notificado da decisão. Altera só esta tarefa.</p>
                  <textarea value={just} onChange={e => setJust(e.target.value)} rows={2} placeholder="Justificativa (opcional)…" className={inputCls} />
                </>
              ) : (
                <p className="text-xs text-gray-400">Altera só esta tarefa (não o prazo padrão da estrutura). Data passada → "Atrasada" em ~1 min; com novo prazo não vencido volta a "Disponível".</p>
              )}
              <div className="flex items-center justify-between gap-2 pt-1">
                <button onClick={() => save('')} disabled={busy} className="px-3 py-2 rounded-xl bg-gray-100 dark:!bg-[#2d3f52] text-gray-600 dark:text-gray-300 text-sm font-medium disabled:opacity-50">{isReq ? 'Pedir sem prazo' : 'Limpar prazo'}</button>
                <div className="flex gap-2">
                  <button onClick={onClose} className="px-4 py-2 rounded-xl bg-gray-100 dark:!bg-[#2d3f52] text-gray-700 dark:text-gray-200 text-sm font-medium">Cancelar</button>
                  <button onClick={() => save(val)} disabled={busy}
                    className="px-4 py-2 rounded-xl bg-gradient-to-r from-violet-500 to-indigo-600 text-white text-sm font-semibold disabled:opacity-50 flex items-center gap-1.5">
                    {busy && <Loader2 className="w-4 h-4 animate-spin" />} {isReq ? 'Solicitar' : 'Salvar'}
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </Modal>
  )
}

export default TaskDueDateModal
