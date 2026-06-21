import React, { useRef, useState } from 'react'
import Modal from '@/components/Modal'
import { Copy, X, Loader2, Plus, Trash2, ChevronUp, ChevronDown, GitBranch, Zap, ArrowLeft } from 'lucide-react'

// Importação de estrutura padrão a partir de outro serviço, COM prévia editável:
//   1. escolhe o serviço de origem;
//   2. carrega a estrutura numa prévia local (não toca na original);
//   3. edita (renomear/remover/reordenar/adicionar etapas e tarefas, ajustar
//      flags das tarefas);
//   4. "Importar estrutura" → cria como nova versão no serviço de destino.
//
// Dependências e gatilhos são preservados nas tarefas mantidas; deps cujo alvo
// foi removido são descartadas no backend.

interface DraftTask {
  refId: string
  name: string
  default_days: number | null
  default_assignee_role: 'admin' | 'manager' | 'user' | null
  requires_review: boolean
  requires_acceptance: boolean
  gestor_only: boolean
  // preservados (não editáveis na prévia)
  description: string | null
  observation: string | null
  default_estimated_minutes: number | null
  default_priority: number | null
  review_type: string | null
  reviewer_default_role: string | null
  manager_review_allowed: boolean
  admin_review_allowed: boolean
  metadata: any
  deps: any[]
  triggers: any[]
}
interface DraftStage {
  refId: string
  name: string
  stage_type: 'first' | 'normal' | 'last'
  description: string | null
  default_duration_days: number | null
  default_assignee_role: 'admin' | 'manager' | 'user' | null
  metadata: any
  tasks: DraftTask[]
}

const API = '/api'

type MergeMode = 'replace' | 'merge-before' | 'merge-after'

const TemplateImportModal: React.FC<{
  targetServiceId: string
  targetServiceName: string
  /** Estrutura atual do destino (etapas com tarefas/deps/triggers). Vazia se não houver. */
  currentStages: any[]
  onClose: () => void
  onImported: () => void
}> = ({ targetServiceId, targetServiceName, currentStages, onClose, onImported }) => {
  const hasCurrent = (currentStages?.length || 0) > 0
  const [step, setStep] = useState<'pick' | 'mode' | 'preview'>('pick')
  const [mode, setMode] = useState<MergeMode>('replace')
  const [services, setServices] = useState<{ id: string; name: string }[]>([])
  const [sourceId, setSourceId] = useState('')
  const [sourceName, setSourceName] = useState('')
  const [sourceRaw, setSourceRaw] = useState<any[]>([])
  const [draft, setDraft] = useState<DraftStage[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const uidRef = useRef(0)
  const uid = () => `new-${uidRef.current++}`

  // Converte etapas cruas (do GET /template) em rascunho editável.
  const toDraft = (stages: any[]): DraftStage[] => (stages || []).map((s: any) => ({
    refId: s.id || uid(), name: s.name || 'Etapa', stage_type: s.stage_type || 'normal',
    description: s.description ?? null, default_duration_days: s.default_duration_days ?? null,
    default_assignee_role: s.default_assignee_role ?? null, metadata: s.metadata ?? {},
    tasks: (s.tasks || []).map((t: any) => ({
      refId: t.id || uid(), name: t.name || 'Tarefa', default_days: t.default_days ?? null,
      default_assignee_role: t.default_assignee_role ?? null,
      requires_review: t.requires_review === true, requires_acceptance: t.requires_acceptance === true,
      gestor_only: t.gestor_only === true,
      description: t.description ?? null, observation: t.observation ?? null,
      default_estimated_minutes: t.default_estimated_minutes ?? null, default_priority: t.default_priority ?? null,
      review_type: t.review_type ?? null, reviewer_default_role: t.reviewer_default_role ?? null,
      manager_review_allowed: t.manager_review_allowed !== false, admin_review_allowed: t.admin_review_allowed !== false,
      metadata: t.metadata ?? {}, deps: t.deps || [], triggers: t.triggers || [],
    })),
  }))

  // Carrega a lista de serviços (exceto o atual) ao montar.
  React.useEffect(() => {
    (async () => {
      try {
        const r = await fetch(`${API}/services`)
        const j = await r.json()
        const list = (j.success ? j.data : j) || []
        setServices(list.filter((s: any) => s.id !== targetServiceId).map((s: any) => ({ id: s.id, name: s.name })))
      } catch { setServices([]) }
    })()
  }, [targetServiceId])

  // Passo 1 → busca a estrutura da origem. Se o destino já tem estrutura, vai
  // para a escolha Substituir/Mesclar; senão, monta a prévia direto.
  const advanceFromPick = async () => {
    if (!sourceId) return
    setBusy(true); setError(null)
    try {
      const r = await fetch(`${API}/services/${sourceId}/template`)
      const j = await r.json()
      if (!j.success) throw new Error(j.error || 'Falha ao carregar estrutura')
      const raw = j.data?.stages || []
      if (!raw.length) throw new Error('O serviço de origem não tem estrutura para copiar.')
      setSourceRaw(raw)
      setSourceName(services.find(s => s.id === sourceId)?.name || '')
      if (hasCurrent) { setMode('replace'); setStep('mode') }
      else { setDraft(toDraft(raw)); setStep('preview') }
    } catch (e: any) { setError(e.message || 'Erro ao carregar') }
    finally { setBusy(false) }
  }

  // Passo 2 (só quando há estrutura atual) → monta a prévia conforme o modo.
  const buildPreview = () => {
    const incoming = toDraft(sourceRaw)
    const existing = toDraft(currentStages)
    if (mode === 'replace') setDraft(incoming)
    else if (mode === 'merge-before') setDraft([...incoming, ...existing])
    else setDraft([...existing, ...incoming])
    setStep('preview')
  }

  // ─── mutadores locais (não afetam a origem) ─────────────────────────────────
  const setStage = (i: number, patch: Partial<DraftStage>) =>
    setDraft(d => d.map((s, idx) => idx === i ? { ...s, ...patch } : s))
  const removeStage = (i: number) => setDraft(d => d.filter((_, idx) => idx !== i))
  const moveStage = (i: number, dir: -1 | 1) => setDraft(d => {
    const j = i + dir; if (j < 0 || j >= d.length) return d
    const next = [...d];[next[i], next[j]] = [next[j], next[i]]; return next
  })
  const addStage = () => setDraft(d => [...d, { refId: uid(), name: 'Nova etapa', stage_type: 'normal', description: null, default_duration_days: null, default_assignee_role: null, metadata: {}, tasks: [] }])

  const setTask = (si: number, ti: number, patch: Partial<DraftTask>) =>
    setDraft(d => d.map((s, idx) => idx !== si ? s : { ...s, tasks: s.tasks.map((t, j) => j === ti ? { ...t, ...patch } : t) }))
  const removeTask = (si: number, ti: number) =>
    setDraft(d => d.map((s, idx) => idx !== si ? s : { ...s, tasks: s.tasks.filter((_, j) => j !== ti) }))
  const moveTask = (si: number, ti: number, dir: -1 | 1) => setDraft(d => d.map((s, idx) => {
    if (idx !== si) return s
    const j = ti + dir; if (j < 0 || j >= s.tasks.length) return s
    const tasks = [...s.tasks];[tasks[ti], tasks[j]] = [tasks[j], tasks[ti]]; return { ...s, tasks }
  }))
  const addTask = (si: number) => setDraft(d => d.map((s, idx) => idx !== si ? s : {
    ...s, tasks: [...s.tasks, { refId: uid(), name: 'Nova tarefa', default_days: null, default_assignee_role: null, requires_review: false, requires_acceptance: false, gestor_only: false, description: null, observation: null, default_estimated_minutes: null, default_priority: null, review_type: null, reviewer_default_role: null, manager_review_allowed: true, admin_review_allowed: true, metadata: {}, deps: [], triggers: [] }],
  }))

  const doImport = async () => {
    if (!draft.length) { setError('A estrutura está vazia.'); return }
    setBusy(true); setError(null)
    try {
      const r = await fetch(`${API}/services/${targetServiceId}/template/import`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stages: draft }),
      })
      const j = await r.json()
      if (!j.success) throw new Error(j.error || 'Falha ao importar')
      onImported()
    } catch (e: any) { setError(e.message || 'Erro ao importar'); setBusy(false) }
  }

  return (
    <Modal isOpen onClose={onClose}>
      <div className="bg-white dark:!bg-[#243040] rounded-2xl w-full max-w-3xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">
        <div className="bg-gradient-to-r from-violet-500 to-indigo-600 px-5 py-3 flex items-center justify-between flex-shrink-0">
          <h3 className="text-white font-bold flex items-center gap-2 min-w-0">
            <Copy className="w-4 h-4 flex-shrink-0" />
            <span className="truncate">{step === 'preview' ? `Prévia · ${sourceName} → ${targetServiceName}` : 'Copiar estrutura de outro serviço'}</span>
          </h3>
          <button onClick={onClose} className="text-white/80 hover:text-white"><X className="w-5 h-5" /></button>
        </div>

        <div className="px-5 py-4 overflow-y-auto flex-1 space-y-3">
          {error && (
            <div role="alert" className="px-3 py-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-red-700 dark:text-red-400 text-sm">{error}</div>
          )}

          {step === 'pick' ? (
            <>
              <p className="text-sm text-gray-600 dark:text-gray-300">
                Escolha o serviço de origem. A estrutura abre numa <strong>prévia editável</strong> — suas alterações não afetam o serviço original.
              </p>
              <div>
                <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">Serviço de origem</label>
                <select value={sourceId} onChange={e => setSourceId(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 dark:text-gray-100 text-sm">
                  <option value="">Selecione…</option>
                  {services.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
            </>
          ) : step === 'mode' ? (
            <>
              <p className="text-sm text-gray-600 dark:text-gray-300">
                <strong>{targetServiceName}</strong> já tem uma estrutura ({currentStages.length} etapa(s)). O que fazer com a estrutura de <strong>{sourceName}</strong>?
              </p>
              <div className="space-y-2">
                {[
                  { v: 'replace', t: 'Substituir', d: 'Descarta a estrutura atual e usa só a de origem.' },
                  { v: 'merge-before', t: 'Mesclar — nova antes da atual', d: 'Etapas de origem entram primeiro, depois as atuais.' },
                  { v: 'merge-after', t: 'Mesclar — nova depois da atual', d: 'Mantém as etapas atuais e adiciona as de origem ao final.' },
                ].map(o => (
                  <label key={o.v} className={`flex items-start gap-2 rounded-xl border p-3 cursor-pointer transition-colors ${mode === o.v ? 'border-violet-400 bg-violet-50 dark:bg-violet-900/20' : 'border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-[#2d3f52]/40'}`}>
                    <input type="radio" name="mergemode" className="mt-0.5" checked={mode === o.v} onChange={() => setMode(o.v as MergeMode)} />
                    <span>
                      <span className="block text-sm font-medium text-gray-800 dark:text-gray-100">{o.t}</span>
                      <span className="block text-xs text-gray-500 dark:text-gray-400">{o.d}</span>
                    </span>
                  </label>
                ))}
              </div>
              <p className="text-xs text-gray-400">A estrutura final entra como nova versão (a atual fica preservada no histórico).</p>
            </>
          ) : (
            <>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Edite à vontade — nada disso altera "{sourceName}". Dependências e gatilhos das tarefas mantidas são preservados.
              </p>
              {draft.map((s, si) => (
                <div key={s.refId} className="border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
                  <div className="bg-gray-50 dark:bg-[#2d3f52] px-3 py-2 flex items-center gap-2">
                    <span className="text-xs font-bold text-violet-600 dark:text-violet-400 w-4">{si + 1}</span>
                    <input value={s.name} onChange={e => setStage(si, { name: e.target.value })}
                      className="flex-1 min-w-0 bg-transparent border-b border-transparent focus:border-violet-400 outline-none font-semibold text-gray-800 dark:text-gray-100 text-sm py-0.5" />
                    <select value={s.stage_type} onChange={e => setStage(si, { stage_type: e.target.value as any })}
                      className="text-xs rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-1.5 py-0.5 text-gray-600 dark:text-gray-300">
                      <option value="first">Primeira</option><option value="normal">Normal</option><option value="last">Final</option>
                    </select>
                    <button onClick={() => moveStage(si, -1)} disabled={si === 0} className="p-1 text-gray-400 hover:text-gray-600 disabled:opacity-30"><ChevronUp className="w-4 h-4" /></button>
                    <button onClick={() => moveStage(si, 1)} disabled={si === draft.length - 1} className="p-1 text-gray-400 hover:text-gray-600 disabled:opacity-30"><ChevronDown className="w-4 h-4" /></button>
                    <button onClick={() => removeStage(si)} className="p-1 text-red-400 hover:text-red-600"><Trash2 className="w-4 h-4" /></button>
                  </div>
                  <div className="p-2 space-y-1.5">
                    {s.tasks.map((t, ti) => (
                      <div key={t.refId} className="flex flex-wrap items-center gap-2 rounded-lg border border-gray-100 dark:border-gray-700 px-2 py-1.5">
                        <input value={t.name} onChange={e => setTask(si, ti, { name: e.target.value })}
                          className="flex-1 min-w-[140px] bg-transparent border-b border-transparent focus:border-violet-400 outline-none text-sm text-gray-700 dark:text-gray-200 py-0.5" />
                        <label className="flex items-center gap-1 text-[11px] text-gray-500 dark:text-gray-400">
                          prazo
                          <input type="number" min={0} value={t.default_days ?? ''} onChange={e => setTask(si, ti, { default_days: e.target.value === '' ? null : Number(e.target.value) })}
                            className="w-12 px-1 py-0.5 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200" />d
                        </label>
                        <label className="flex items-center gap-1 text-[11px] text-gray-500 dark:text-gray-400"><input type="checkbox" checked={t.requires_review} onChange={e => setTask(si, ti, { requires_review: e.target.checked })} /> revisão</label>
                        <label className="flex items-center gap-1 text-[11px] text-gray-500 dark:text-gray-400"><input type="checkbox" checked={t.requires_acceptance} onChange={e => setTask(si, ti, { requires_acceptance: e.target.checked })} /> aceite</label>
                        <label className="flex items-center gap-1 text-[11px] text-gray-500 dark:text-gray-400"><input type="checkbox" checked={t.gestor_only} onChange={e => setTask(si, ti, { gestor_only: e.target.checked })} /> gestor</label>
                        {t.deps?.length > 0 && <span title={`${t.deps.length} dependência(s)`} className="text-[10px] text-amber-600 dark:text-amber-400 flex items-center gap-0.5"><GitBranch className="w-3 h-3" />{t.deps.length}</span>}
                        {t.triggers?.length > 0 && <span title={`${t.triggers.length} gatilho(s)`} className="text-[10px] text-sky-600 dark:text-sky-400 flex items-center gap-0.5"><Zap className="w-3 h-3" />{t.triggers.length}</span>}
                        <button onClick={() => moveTask(si, ti, -1)} disabled={ti === 0} className="p-0.5 text-gray-400 hover:text-gray-600 disabled:opacity-30"><ChevronUp className="w-3.5 h-3.5" /></button>
                        <button onClick={() => moveTask(si, ti, 1)} disabled={ti === s.tasks.length - 1} className="p-0.5 text-gray-400 hover:text-gray-600 disabled:opacity-30"><ChevronDown className="w-3.5 h-3.5" /></button>
                        <button onClick={() => removeTask(si, ti)} className="p-0.5 text-red-400 hover:text-red-600"><Trash2 className="w-3.5 h-3.5" /></button>
                      </div>
                    ))}
                    <button onClick={() => addTask(si)} className="text-xs text-violet-600 dark:text-violet-400 hover:underline flex items-center gap-1 px-1 pt-0.5"><Plus className="w-3.5 h-3.5" /> tarefa</button>
                  </div>
                </div>
              ))}
              <button onClick={addStage} className="text-xs px-3 py-1.5 rounded-lg bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 font-medium flex items-center gap-1"><Plus className="w-3.5 h-3.5" /> Etapa</button>
            </>
          )}
        </div>

        <div className="px-5 py-3 border-t border-gray-100 dark:border-gray-700 flex justify-between items-center flex-shrink-0">
          {step === 'mode'
            ? <button onClick={() => { setStep('pick'); setError(null) }} className="text-sm text-gray-500 dark:text-gray-400 hover:underline flex items-center gap-1"><ArrowLeft className="w-4 h-4" /> Trocar origem</button>
            : step === 'preview'
              ? <button onClick={() => { setStep(hasCurrent ? 'mode' : 'pick'); setError(null) }} className="text-sm text-gray-500 dark:text-gray-400 hover:underline flex items-center gap-1"><ArrowLeft className="w-4 h-4" /> Voltar</button>
              : <span />}
          <div className="flex gap-2">
            <button onClick={onClose} className="px-4 py-2 rounded-xl bg-gray-100 dark:!bg-[#2d3f52] text-gray-700 dark:text-gray-200 text-sm font-medium">Cancelar</button>
            {step === 'pick' ? (
              <button onClick={advanceFromPick} disabled={busy || !sourceId}
                className="px-4 py-2 rounded-xl bg-gradient-to-r from-violet-500 to-indigo-600 text-white text-sm font-semibold disabled:opacity-50 flex items-center gap-1.5">
                {busy && <Loader2 className="w-4 h-4 animate-spin" />} {hasCurrent ? 'Avançar' : 'Ver prévia'}
              </button>
            ) : step === 'mode' ? (
              <button onClick={buildPreview} disabled={busy}
                className="px-4 py-2 rounded-xl bg-gradient-to-r from-violet-500 to-indigo-600 text-white text-sm font-semibold disabled:opacity-50">
                Ver prévia
              </button>
            ) : (
              <button onClick={doImport} disabled={busy || !draft.length}
                className="px-4 py-2 rounded-xl bg-gradient-to-r from-violet-500 to-indigo-600 text-white text-sm font-semibold disabled:opacity-50 flex items-center gap-1.5">
                {busy && <Loader2 className="w-4 h-4 animate-spin" />} Importar estrutura
              </button>
            )}
          </div>
        </div>
      </div>
    </Modal>
  )
}

export default TemplateImportModal
