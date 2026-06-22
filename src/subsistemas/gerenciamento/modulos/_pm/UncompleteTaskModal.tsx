import React, { useState } from 'react'
import Modal from '@/components/Modal'
import { Undo2, X, Loader2 } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { uncompleteTask } from './taskApi'

// Modal para desconcluir (reabrir) uma tarefa concluída (item 5).
//   - usuário comum: volta sempre pra ele (sem escolha de destino).
//   - gestor: escolhe capturar p/ si ou devolver a quem concluiu.
//   - manager: o pedido vai para aprovação de um admin antes de reabrir.
const UncompleteTaskModal: React.FC<{ task: { id: string; name: string }; onClose: () => void; onDone: () => void }> = ({ task, onClose, onDone }) => {
  const { user } = useAuth()
  const role = (user as any)?.role as string | undefined
  const isGestor = role === 'manager' || role === 'admin' || role === 'superadmin'
  const isManager = role === 'manager'

  const [reason, setReason] = useState('')
  const [target, setTarget] = useState<'self' | 'original' | 'pool'>('original')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const submit = async () => {
    if (!reason.trim()) { setError('Explique o motivo da reabertura'); return }
    setBusy(true); setError(null)
    try {
      const r = await uncompleteTask(task.id, reason.trim(), isGestor ? target : 'self')
      if (r?.requested) { setNotice('✅ Pedido de reabertura enviado — um gerente do projeto ou admin precisa aprovar antes de a tarefa voltar.'); setBusy(false); return }
      onDone()
    } catch (e: any) { setError(e.message); setBusy(false) }
  }

  return (
    <Modal isOpen onClose={onClose} destructive>
      <div className="bg-white dark:!bg-[#243040] rounded-2xl w-full max-w-md shadow-2xl overflow-hidden">
        <div className="bg-gradient-to-r from-orange-500 to-amber-600 px-5 py-3 flex items-center justify-between">
          <h3 className="text-white font-bold flex items-center gap-2"><Undo2 className="w-4 h-4" /> Desconcluir tarefa</h3>
          <button onClick={onClose} className="text-white/80 hover:text-white"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-5 space-y-3">
          {error && <div className="text-sm text-red-600 dark:text-red-400">{error}</div>}
          {notice ? (
            <>
              <div className="text-sm text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-xl px-3 py-2">{notice}</div>
              <div className="flex justify-end pt-1">
                <button onClick={onDone} className="px-4 py-2 rounded-xl bg-gradient-to-r from-orange-500 to-amber-600 text-white text-sm font-semibold">Ok</button>
              </div>
            </>
          ) : (
          <>
          <p className="text-sm text-gray-700 dark:text-gray-200">Reabrir a tarefa <strong>{task.name}</strong>?</p>

          <div>
            <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">Motivo da reabertura *</label>
            <textarea autoFocus rows={3} value={reason} onChange={e => setReason(e.target.value)}
              placeholder="Explique por que a tarefa precisa ser refeita…"
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 dark:text-gray-100 text-sm" />
          </div>

          {isGestor && (
            <div>
              <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">Para quem vai a tarefa?</label>
              <div className="space-y-1.5">
                <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-200 cursor-pointer">
                  <input type="radio" name="unc-target" checked={target === 'original'} onChange={() => setTarget('original')} />
                  Devolver a quem concluiu
                </label>
                <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-200 cursor-pointer">
                  <input type="radio" name="unc-target" checked={target === 'self'} onChange={() => setTarget('self')} />
                  Capturar para mim
                </label>
                <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-200 cursor-pointer">
                  <input type="radio" name="unc-target" checked={target === 'pool'} onChange={() => setTarget('pool')} />
                  Deixar disponível para alguém pegar
                </label>
              </div>
            </div>
          )}

          {(isManager || !isGestor) && (
            <div className="rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 px-3 py-2 text-xs text-amber-800 dark:text-amber-200">
              {isManager
                ? 'Como gerente, sua reabertura precisa da aprovação de um admin antes de a tarefa voltar a ficar disponível.'
                : 'Sua reabertura precisa da aprovação do gerente do projeto ou de um admin antes de a tarefa voltar pra você.'}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <button onClick={onClose} className="px-4 py-2 rounded-xl bg-gray-100 dark:!bg-[#2d3f52] text-gray-700 dark:text-gray-200 text-sm font-medium">Cancelar</button>
            <button onClick={submit} disabled={busy}
              className="px-4 py-2 rounded-xl bg-gradient-to-r from-orange-500 to-amber-600 text-white text-sm font-semibold disabled:opacity-50 flex items-center gap-1.5">
              {busy && <Loader2 className="w-4 h-4 animate-spin" />} {isGestor && !isManager ? 'Desconcluir' : 'Solicitar reabertura'}
            </button>
          </div>
          </>
          )}
        </div>
      </div>
    </Modal>
  )
}

export default UncompleteTaskModal
