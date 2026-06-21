import React, { useState } from 'react'
import Modal from '@/components/Modal'
import { Hand, X, Loader2, ClipboardCheck, GitBranch, Lock, AlertTriangle } from 'lucide-react'
import { PmTask, CompletionPrereq, claimTask, claimTasksBulk } from './taskApi'

// Modal ao pegar uma tarefa (itens 3 e 4): avisa se ela exige revisão para
// concluir e lista os pré-requisitos de conclusão. Os pré-requisitos livres
// vêm marcados para serem pegos junto; restritos a gestor / etapas aparecem só
// como informativo.
const ClaimTaskModal: React.FC<{ task: PmTask; onClose: () => void; onDone: () => void }> = ({ task, onClose, onDone }) => {
  const prereqs: CompletionPrereq[] = task.completion_prereqs || []
  const claimable = prereqs.filter(p => p.kind === 'task' && p.claimable)
  const info = prereqs.filter(p => !(p.kind === 'task' && p.claimable))

  const [selected, setSelected] = useState<Set<string>>(new Set(claimable.map(p => p.id)))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const toggle = (id: string) => setSelected(prev => {
    const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n
  })

  const confirm = async () => {
    setBusy(true); setError(null)
    try {
      if (selected.size > 0) await claimTasksBulk([task.id, ...selected])
      else await claimTask(task.id)
      onDone()
    } catch (e: any) { setError(e.message); setBusy(false) }
  }

  const primaryLabel = selected.size > 0 ? `Pegar tarefa + ${selected.size} pré-requisito(s)` : 'Pegar tarefa'

  return (
    <Modal isOpen onClose={onClose}>
      <div className="bg-white dark:!bg-[#243040] rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden">
        <div className="bg-gradient-to-r from-violet-500 to-indigo-600 px-5 py-3 flex items-center justify-between">
          <h3 className="text-white font-bold flex items-center gap-2"><Hand className="w-4 h-4" /> Pegar tarefa</h3>
          <button onClick={onClose} className="text-white/80 hover:text-white"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-5 space-y-3">
          {error && <div className="text-sm text-red-600 dark:text-red-400">{error}</div>}
          <p className="text-sm text-gray-700 dark:text-gray-200">Pegar a tarefa <strong>{task.name}</strong> para você?</p>

          {task.review_required && (
            <div className="flex items-start gap-2 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 px-3 py-2 text-xs text-amber-800 dark:text-amber-200">
              <ClipboardCheck className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <span>Esta tarefa <strong>exige revisão de um gestor</strong> para ser concluída — ao concluir, ela vai para a fila de revisão.</span>
            </div>
          )}

          {claimable.length > 0 && (
            <div className="rounded-xl border border-gray-200 dark:border-gray-700 p-3">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-gray-600 dark:text-gray-300 mb-2">
                <GitBranch className="w-3.5 h-3.5" /> Para concluir esta, outras precisam ser feitas antes. Pegar também?
              </div>
              <div className="space-y-1.5">
                {claimable.map(p => (
                  <label key={p.id} className="flex items-start gap-2 text-sm text-gray-700 dark:text-gray-200 cursor-pointer">
                    <input type="checkbox" checked={selected.has(p.id)} onChange={() => toggle(p.id)} className="mt-0.5" />
                    <span className="min-w-0">
                      {p.name}
                      <span className="text-xs text-gray-400"> · {p.stage_name ? `${p.stage_name} · ` : ''}{p.project_name}</span>
                    </span>
                  </label>
                ))}
              </div>
            </div>
          )}

          {info.length > 0 && (
            <div className="rounded-xl border border-gray-200 dark:border-gray-700 p-3">
              <div className="text-xs font-semibold text-gray-600 dark:text-gray-300 mb-2">Dependências feitas por outros</div>
              <div className="space-y-1.5">
                {info.map(p => (
                  <div key={`${p.kind}:${p.id}`} className="flex items-start gap-2 text-xs text-gray-500 dark:text-gray-400">
                    {p.kind === 'stage' ? <GitBranch className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                      : p.gestor_only ? <Lock className="w-3.5 h-3.5 flex-shrink-0 mt-0.5 text-amber-500" />
                      : <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />}
                    <span className="min-w-0">
                      {p.kind === 'stage' ? `Etapa "${p.name}"` : p.name}
                      {p.project_name && <span> · {p.project_name}</span>}
                      {p.gestor_only && <span className="text-amber-600 dark:text-amber-400"> — será feita por um gestor</span>}
                      {p.kind === 'task' && !p.gestor_only && p.assignee_user_id && <span> — já atribuída</span>}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <button onClick={onClose} className="px-4 py-2 rounded-xl bg-gray-100 dark:!bg-[#2d3f52] text-gray-700 dark:text-gray-200 text-sm font-medium">Cancelar</button>
            <button onClick={confirm} disabled={busy}
              className="px-4 py-2 rounded-xl bg-gradient-to-r from-violet-500 to-indigo-600 text-white text-sm font-semibold disabled:opacity-50 flex items-center gap-1.5">
              {busy && <Loader2 className="w-4 h-4 animate-spin" />} {primaryLabel}
            </button>
          </div>
        </div>
      </div>
    </Modal>
  )
}

export default ClaimTaskModal
