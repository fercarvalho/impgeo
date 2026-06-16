import React, { useState } from 'react'
import Modal from '@/components/Modal'
import { Timer, X, Loader2, Coffee, AlertTriangle, ShieldQuestion, CheckCircle2 } from 'lucide-react'
import { startSession, requestOverage, MODE_OPTIONS, notifyPomodoroChanged } from './pomodoroApi'

interface Props {
  taskId?: string | null
  taskName?: string | null
  onClose: () => void
  onStarted?: () => void
}

const CATEGORIES = [
  { value: 'study', label: 'Estudo' },
  { value: 'meeting', label: 'Reunião' },
  { value: 'planning', label: 'Planejamento' },
  { value: 'admin', label: 'Administrativo' },
  { value: 'other', label: 'Outro' },
]

// Modal de início de foco. Com taskId → vincula à tarefa; sem → exige categoria.
const PomodoroStartModal: React.FC<Props> = ({ taskId = null, taskName = null, onClose, onStarted }) => {
  const [minutes, setMinutes] = useState(25)
  const [custom, setCustom] = useState(false)
  const [focusMin, setFocusMin] = useState(30)
  const [breakMin, setBreakMin] = useState(8)
  const [category, setCategory] = useState('study')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [warning, setWarning] = useState<any>(null)   // aviso pós-início (recomendação/excedente)
  const [justification, setJustification] = useState('')
  const [requested, setRequested] = useState(false)

  const customValid = focusMin >= 1 && focusMin <= 240 && breakMin >= 1 && breakMin <= 60

  const submit = async () => {
    if (custom && !customValid) { setError('Foco: 1–240 min · Descanso: 1–60 min'); return }
    setBusy(true); setError(null)
    try {
      const r = await startSession({
        taskId: taskId || undefined,
        category: taskId ? undefined : category,
        plannedMinutes: custom ? focusMin : minutes,
        breakMinutes: custom ? breakMin : undefined,
      })
      notifyPomodoroChanged()
      onStarted?.()
      // A sessão já iniciou ("não trava"). Se há aviso, mantém o modal pra avisar/solicitar.
      if (r?.warning) { setWarning(r.warning); setBusy(false) }
      else onClose()
    } catch (e: any) { setError(e.message); setBusy(false) }
  }

  const askApproval = async () => {
    setBusy(true); setError(null)
    try { await requestOverage(justification.trim() || undefined); setRequested(true) }
    catch (e: any) { setError(e.message) } finally { setBusy(false) }
  }

  return (
    <Modal isOpen onClose={onClose}>
      <div className="bg-white dark:!bg-[#243040] rounded-2xl w-full max-w-md shadow-2xl overflow-hidden">
        <div className="bg-gradient-to-r from-violet-500 to-indigo-600 px-5 py-3 flex items-center justify-between">
          <h3 className="text-white font-bold flex items-center gap-2"><Timer className="w-4 h-4" /> Iniciar foco</h3>
          <button onClick={onClose} className="text-white/80 hover:text-white"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-5 space-y-4">
          {error && <div className="text-sm text-red-600 dark:text-red-400">{error}</div>}

          {warning ? (
            <div className="space-y-4 py-1">
              {warning.code === 'overage_approval_needed' ? (
                requested ? (
                  <div className="text-center space-y-2 py-2">
                    <CheckCircle2 className="w-10 h-10 mx-auto text-green-500" />
                    <p className="text-sm font-semibold text-gray-800 dark:text-gray-100">Pedido enviado!</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">Um gestor vai avaliar. Você será notificado quando aprovarem — só então o tempo extra é contabilizado.</p>
                    <button onClick={onClose} className="mt-2 px-4 py-2 rounded-xl bg-gradient-to-r from-violet-500 to-indigo-600 text-white text-sm font-semibold">Fechar</button>
                  </div>
                ) : (
                  <>
                    <div className="flex items-start gap-2 p-3 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
                      <ShieldQuestion className="w-5 h-5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
                      <div className="text-sm text-amber-800 dark:text-amber-300">
                        Você passou de <strong>{warning.hard} min</strong> hoje ({warning.worked} min trabalhados). A sessão já começou, mas o tempo extra <strong>só será contabilizado após aprovação</strong> de um gestor.
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">Justificativa (opcional)</label>
                      <textarea value={justification} onChange={e => setJustification(e.target.value)} rows={3}
                        placeholder="Ex.: fechamento de projeto urgente…"
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 dark:text-gray-100 text-sm" />
                    </div>
                    <div className="flex justify-end gap-2">
                      <button onClick={onClose} className="px-4 py-2 rounded-xl bg-gray-100 dark:!bg-[#2d3f52] text-gray-700 dark:text-gray-200 text-sm font-medium">Agora não</button>
                      <button onClick={askApproval} disabled={busy}
                        className="px-4 py-2 rounded-xl bg-gradient-to-r from-violet-500 to-indigo-600 text-white text-sm font-semibold disabled:opacity-50 flex items-center gap-1.5">
                        {busy && <Loader2 className="w-4 h-4 animate-spin" />} Solicitar aprovação
                      </button>
                    </div>
                  </>
                )
              ) : (
                <>
                  <div className="flex items-start gap-2 p-3 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
                    <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
                    <div className="text-sm text-amber-800 dark:text-amber-300">
                      Recomendamos não passar de <strong>{warning.recommended} min/dia</strong>. Você já trabalhou {warning.worked} min — a sessão começou normalmente.
                    </div>
                  </div>
                  <div className="flex justify-end">
                    <button onClick={onClose} className="px-4 py-2 rounded-xl bg-gradient-to-r from-violet-500 to-indigo-600 text-white text-sm font-semibold">Entendi</button>
                  </div>
                </>
              )}
            </div>
          ) : (<>

          {taskId ? (
            <p className="text-sm text-gray-600 dark:text-gray-300">Tarefa: <strong>{taskName || '—'}</strong></p>
          ) : (
            <div>
              <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">Categoria</label>
              <select value={category} onChange={e => setCategory(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 dark:text-gray-100 text-sm">
                {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-2">Modo Pomodoro</label>
            <div className="grid grid-cols-4 gap-2">
              {MODE_OPTIONS.map(m => (
                <button key={m.minutes} onClick={() => { setCustom(false); setMinutes(m.minutes) }}
                  className={`p-3 rounded-xl border text-center transition-all ${
                    !custom && minutes === m.minutes
                      ? 'border-violet-500 bg-violet-50 dark:bg-violet-900/30 ring-2 ring-violet-500/30'
                      : 'border-gray-200 dark:border-gray-700 hover:border-violet-300'
                  }`}>
                  <div className="font-bold text-gray-900 dark:text-gray-100">{m.minutes}</div>
                  <div className="text-[10px] text-gray-500 dark:text-gray-400 mt-0.5 flex items-center justify-center gap-0.5">
                    <Coffee className="w-3 h-3" />{m.minutes === 25 ? '5' : m.minutes === 50 ? '10' : '20'}
                  </div>
                </button>
              ))}
              <button onClick={() => setCustom(true)}
                className={`p-3 rounded-xl border text-center transition-all ${
                  custom
                    ? 'border-violet-500 bg-violet-50 dark:bg-violet-900/30 ring-2 ring-violet-500/30'
                    : 'border-gray-200 dark:border-gray-700 hover:border-violet-300'
                }`}>
                <div className="font-bold text-gray-900 dark:text-gray-100">Livre</div>
                <div className="text-[10px] text-gray-500 dark:text-gray-400 mt-0.5">custom</div>
              </button>
            </div>

            {custom && (
              <div className="grid grid-cols-2 gap-3 mt-3">
                <div>
                  <label className="block text-[11px] font-semibold text-gray-600 dark:text-gray-300 mb-1 flex items-center gap-1"><Timer className="w-3 h-3" /> Foco (min)</label>
                  <input type="number" min={1} max={240} value={focusMin}
                    onChange={e => setFocusMin(Math.max(1, Math.min(240, Number(e.target.value) || 0)))}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 dark:text-gray-100 text-sm" />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-gray-600 dark:text-gray-300 mb-1 flex items-center gap-1"><Coffee className="w-3 h-3" /> Descanso (min)</label>
                  <input type="number" min={1} max={60} value={breakMin}
                    onChange={e => setBreakMin(Math.max(1, Math.min(60, Number(e.target.value) || 0)))}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 dark:text-gray-100 text-sm" />
                </div>
                <p className="col-span-2 text-[10px] text-gray-400">Foco de 1 a 240 min · descanso de 1 a 60 min. No modo livre, pular a pausa não força o próximo ciclo.</p>
              </div>
            )}
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <button onClick={onClose} className="px-4 py-2 rounded-xl bg-gray-100 dark:!bg-[#2d3f52] text-gray-700 dark:text-gray-200 text-sm font-medium">Cancelar</button>
            <button onClick={submit} disabled={busy || (custom && !customValid)}
              className="px-4 py-2 rounded-xl bg-gradient-to-r from-violet-500 to-indigo-600 text-white text-sm font-semibold disabled:opacity-50 flex items-center gap-1.5">
              {busy && <Loader2 className="w-4 h-4 animate-spin" />} Iniciar
            </button>
          </div>
          </>)}
        </div>
      </div>
    </Modal>
  )
}

export default PomodoroStartModal
