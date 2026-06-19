import React, { useCallback, useEffect, useState } from 'react'
import Modal from '@/components/Modal'
import {
  Layers, Plus, Trash2, Edit2, ChevronUp, ChevronDown, X, GitBranch, Zap,
  Loader2, AlertTriangle, CheckCircle2, ListTodo,
} from 'lucide-react'

// ─── Tipos (espelham o backend snake_case via mapeamento leve) ────────────────
interface TemplateDep {
  id: string
  task_id: string
  dependency_type: 'start_dependency' | 'completion_dependency'
  dependency_target_type: 'task' | 'stage'
  target_task_id: string | null
  target_stage_id: string | null
  required_status: string | null
}
interface TemplateTrigger {
  id: string
  source_template_task_id: string
  on_status: string
  payload: Record<string, any>
}
interface TemplateTask {
  id: string
  template_stage_id: string
  name: string
  description: string | null
  observation: string | null
  sort_order: number
  default_days: number | null
  default_assignee_role: 'admin' | 'manager' | 'user' | null
  requires_review: boolean
  requires_acceptance: boolean
  review_type: string | null
  reviewer_default_role: 'admin' | 'manager' | 'user' | null
  manager_review_allowed: boolean
  admin_review_allowed: boolean
  deps: TemplateDep[]
  triggers: TemplateTrigger[]
}
interface TemplateStage {
  id: string
  name: string
  description: string | null
  version: number
  sort_order: number
  stage_type: 'first' | 'normal' | 'last'
  default_duration_days: number | null
  tasks: TemplateTask[]
}
interface TemplateData {
  serviceId: string
  version: number
  stages: TemplateStage[]
}

const API = '/api'

interface Props {
  serviceId: string
  serviceName: string
  canEdit: boolean
  onClose: () => void
}

const ROLE_LABELS: Record<string, string> = { admin: 'Admin', manager: 'Gerente', user: 'Usuário' }

const ServiceTemplateEditor: React.FC<Props> = ({ serviceId, serviceName, canEdit, onClose }) => {
  const [tpl, setTpl] = useState<TemplateData | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // sub-modais
  const [taskModal, setTaskModal] = useState<{ stageId: string; task: TemplateTask | null } | null>(null)
  const [depModal, setDepModal] = useState<TemplateTask | null>(null)
  const [triggerModal, setTriggerModal] = useState<TemplateTask | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const r = await fetch(`${API}/services/${serviceId}/template`)
      const j = await r.json()
      if (!j.success) throw new Error(j.error || 'Falha ao carregar template')
      setTpl(j.data)
    } catch (e: any) {
      setError(e.message || 'Erro ao carregar template')
    } finally {
      setLoading(false)
    }
  }, [serviceId])

  useEffect(() => { load() }, [load])

  // helper de chamada mutadora
  const mutate = useCallback(async (url: string, method: string, body?: any) => {
    setBusy(true)
    setError(null)
    try {
      const r = await fetch(`${API}${url}`, {
        method,
        headers: body ? { 'Content-Type': 'application/json' } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      })
      const j = await r.json()
      if (!j.success) {
        const msg = j.code === 'dependency_cycle'
          ? 'Essa dependência criaria um ciclo entre tarefas.'
          : (j.error || 'Operação falhou')
        throw new Error(msg)
      }
      await load()
      return true
    } catch (e: any) {
      setError(e.message || 'Erro na operação')
      return false
    } finally {
      setBusy(false)
    }
  }, [load])

  // ─── Stage ops ──────────────────────────────────────────────────────────────
  const addStage = async () => {
    const name = window.prompt('Nome da nova etapa:')
    if (!name?.trim()) return
    await mutate(`/services/${serviceId}/template/stages`, 'POST', { name: name.trim(), version: tpl?.version || 1 })
  }
  const renameStage = async (s: TemplateStage) => {
    const name = window.prompt('Novo nome da etapa:', s.name)
    if (!name?.trim() || name === s.name) return
    await mutate(`/services/${serviceId}/template/stages/${s.id}`, 'PATCH', { name: name.trim() })
  }
  const setStageType = async (s: TemplateStage, stageType: string) => {
    await mutate(`/services/${serviceId}/template/stages/${s.id}`, 'PATCH', { stageType })
  }
  const moveStage = async (s: TemplateStage, dir: -1 | 1) => {
    if (!tpl) return
    const ordered = [...tpl.stages]
    const idx = ordered.findIndex(x => x.id === s.id)
    const swapIdx = idx + dir
    if (swapIdx < 0 || swapIdx >= ordered.length) return
    // Troca posições e envia a ordem completa (reatribuída em transação no backend).
    ;[ordered[idx], ordered[swapIdx]] = [ordered[swapIdx], ordered[idx]]
    await mutate(`/services/${serviceId}/template/stages/reorder`, 'PUT', {
      version: tpl.version, orderedIds: ordered.map(x => x.id),
    })
  }
  const deleteStage = async (s: TemplateStage) => {
    if (!window.confirm(`Excluir a etapa "${s.name}" e suas tarefas?`)) return
    await mutate(`/services/${serviceId}/template/stages/${s.id}`, 'DELETE')
  }

  // ─── Task ops ───────────────────────────────────────────────────────────────
  const deleteTask = async (t: TemplateTask) => {
    if (!window.confirm(`Excluir a tarefa "${t.name}"?`)) return
    await mutate(`/services/${serviceId}/template/tasks/${t.id}`, 'DELETE')
  }
  const deleteDep = async (depId: string) => {
    await mutate(`/services/${serviceId}/template/dependencies/${depId}`, 'DELETE')
  }
  const deleteTrigger = async (trId: string) => {
    await mutate(`/services/${serviceId}/template/triggers/${trId}`, 'DELETE')
  }
  const versionBump = async () => {
    if (!window.confirm('Criar uma nova versão do template (preserva a atual)?')) return
    await mutate(`/services/${serviceId}/template/version-bump`, 'POST')
  }

  // mapa task_id → nome (p/ exibir alvo de dependências)
  const allTasks = (tpl?.stages || []).flatMap(s => s.tasks)
  const taskName = (id: string | null) => allTasks.find(t => t.id === id)?.name || '—'
  const stageName = (id: string | null) => tpl?.stages.find(s => s.id === id)?.name || '—'

  return (
    <Modal isOpen onClose={onClose} ariaLabelledBy="tpl-editor-title">
      <div className="bg-white dark:!bg-[#243040] rounded-2xl w-full max-w-3xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="bg-gradient-to-r from-violet-500 to-indigo-600 px-6 py-4 flex items-center justify-between flex-shrink-0">
          <h2 id="tpl-editor-title" className="text-lg font-bold text-white flex items-center gap-2 min-w-0">
            <Layers className="w-5 h-5 flex-shrink-0" aria-hidden="true" />
            <span className="truncate">Estrutura padrão · {serviceName}</span>
          </h2>
          <button onClick={onClose} className="text-white/80 hover:text-white hover:bg-white/20 rounded-lg p-1.5 transition-all" aria-label="Fechar">
            <X className="w-5 h-5" aria-hidden="true" />
          </button>
        </div>

        {/* Toolbar */}
        <div className="px-6 py-3 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between flex-shrink-0">
          <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
            Versão {tpl?.version ?? '—'} · {tpl?.stages.length ?? 0} etapa(s)
          </span>
          {canEdit && (
            <div className="flex items-center gap-2">
              <button onClick={versionBump} disabled={busy || !tpl?.stages.length}
                className="text-xs px-3 py-1.5 rounded-lg bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 font-medium transition-colors disabled:opacity-50">
                Nova versão
              </button>
              <button onClick={addStage} disabled={busy}
                className="text-xs px-3 py-1.5 rounded-lg bg-violet-600 hover:bg-violet-700 text-white font-medium flex items-center gap-1 transition-colors disabled:opacity-50">
                <Plus className="w-3.5 h-3.5" /> Etapa
              </button>
            </div>
          )}
        </div>

        {/* Body */}
        <div className="px-6 py-4 overflow-y-auto flex-1 space-y-4">
          {error && (
            <div role="alert" className="flex items-start gap-2 px-3 py-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-red-700 dark:text-red-400 text-sm">
              <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <span className="flex-1">{error}</span>
              <button onClick={() => setError(null)}><X className="w-4 h-4" /></button>
            </div>
          )}

          {loading ? (
            <div className="flex items-center justify-center py-12 text-gray-400">
              <Loader2 className="w-6 h-6 animate-spin" />
            </div>
          ) : !tpl?.stages.length ? (
            <div className="text-center py-12 text-gray-400 dark:text-gray-500">
              <ListTodo className="w-10 h-10 mx-auto mb-3 opacity-50" />
              <p className="text-sm">Nenhuma etapa no template ainda.</p>
              {canEdit && <p className="text-xs mt-1">Use "Etapa" acima para começar.</p>}
            </div>
          ) : (
            tpl.stages.map((s, sIdx) => (
              <div key={s.id} className="border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
                {/* Stage header */}
                <div className="bg-gray-50 dark:bg-[#2d3f52] px-4 py-2.5 flex items-center gap-2">
                  <span className="text-xs font-bold text-violet-600 dark:text-violet-400 w-5">{sIdx + 1}</span>
                  <span className="font-semibold text-gray-800 dark:text-gray-100 flex-1 truncate">{s.name}</span>
                  {canEdit ? (
                    <select value={s.stage_type} onChange={(e) => setStageType(s, e.target.value)}
                      className="text-xs rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-1.5 py-0.5 text-gray-600 dark:text-gray-300">
                      <option value="first">Primeira</option>
                      <option value="normal">Normal</option>
                      <option value="last">Final</option>
                    </select>
                  ) : (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-gray-200 dark:bg-gray-600 text-gray-600 dark:text-gray-300">
                      {s.stage_type === 'first' ? 'Primeira' : s.stage_type === 'last' ? 'Final' : 'Normal'}
                    </span>
                  )}
                  {canEdit && (
                    <div className="flex items-center gap-0.5">
                      <button onClick={() => moveStage(s, -1)} disabled={busy || sIdx === 0} className="p-1 text-gray-400 hover:text-gray-600 disabled:opacity-30" aria-label="Mover acima"><ChevronUp className="w-4 h-4" /></button>
                      <button onClick={() => moveStage(s, 1)} disabled={busy || sIdx === tpl.stages.length - 1} className="p-1 text-gray-400 hover:text-gray-600 disabled:opacity-30" aria-label="Mover abaixo"><ChevronDown className="w-4 h-4" /></button>
                      <button onClick={() => renameStage(s)} disabled={busy} className="p-1 text-blue-400 hover:text-blue-600" aria-label="Renomear"><Edit2 className="w-4 h-4" /></button>
                      <button onClick={() => deleteStage(s)} disabled={busy} className="p-1 text-red-400 hover:text-red-600" aria-label="Excluir etapa"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  )}
                </div>

                {/* Tasks */}
                <div className="divide-y divide-gray-100 dark:divide-gray-700">
                  {s.tasks.map(t => (
                    <div key={t.id} className="px-4 py-2.5">
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-gray-800 dark:text-gray-100 flex-1 truncate">{t.name}</span>
                        {t.requires_review && <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400">revisão</span>}
                        {t.requires_acceptance && <span className="text-[10px] px-1.5 py-0.5 rounded bg-sky-100 dark:bg-sky-900/30 text-sky-700 dark:text-sky-400">aceite</span>}
                        {t.default_days != null && <span className="text-[10px] text-gray-400">{t.default_days}d</span>}
                        {t.default_assignee_role && <span className="text-[10px] text-gray-400">{ROLE_LABELS[t.default_assignee_role]}</span>}
                        {canEdit && (
                          <div className="flex items-center gap-0.5">
                            <button onClick={() => setDepModal(t)} disabled={busy} className="p-1 text-indigo-400 hover:text-indigo-600" aria-label="Dependências" title="Dependências"><GitBranch className="w-4 h-4" /></button>
                            <button onClick={() => setTriggerModal(t)} disabled={busy} className="p-1 text-fuchsia-400 hover:text-fuchsia-600" aria-label="Gatilhos" title="Gatilhos"><Zap className="w-4 h-4" /></button>
                            <button onClick={() => setTaskModal({ stageId: s.id, task: t })} disabled={busy} className="p-1 text-blue-400 hover:text-blue-600" aria-label="Editar tarefa"><Edit2 className="w-4 h-4" /></button>
                            <button onClick={() => deleteTask(t)} disabled={busy} className="p-1 text-red-400 hover:text-red-600" aria-label="Excluir tarefa"><Trash2 className="w-4 h-4" /></button>
                          </div>
                        )}
                      </div>
                      {/* deps + triggers resumo */}
                      {(t.deps.length > 0 || t.triggers.length > 0) && (
                        <div className="mt-1.5 ml-1 space-y-1">
                          {t.deps.map(d => (
                            <div key={d.id} className="flex items-center gap-1.5 text-[11px] text-gray-500 dark:text-gray-400">
                              <GitBranch className="w-3 h-3 text-indigo-400" />
                              <span>
                                {d.dependency_type === 'start_dependency' ? 'inicia após' : 'conclui após'}{' '}
                                {d.dependency_target_type === 'task' ? taskName(d.target_task_id) : `etapa: ${stageName(d.target_stage_id)}`}
                                {d.required_status ? ` (${d.required_status})` : ''}
                              </span>
                              {canEdit && <button onClick={() => deleteDep(d.id)} className="text-red-300 hover:text-red-500"><X className="w-3 h-3" /></button>}
                            </div>
                          ))}
                          {t.triggers.map(tr => (
                            <div key={tr.id} className="flex items-center gap-1.5 text-[11px] text-gray-500 dark:text-gray-400">
                              <Zap className="w-3 h-3 text-fuchsia-400" />
                              <span>ao concluir → cria "{tr.payload?.name || '—'}"</span>
                              {canEdit && <button onClick={() => deleteTrigger(tr.id)} className="text-red-300 hover:text-red-500"><X className="w-3 h-3" /></button>}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                  {canEdit && (
                    <button onClick={() => setTaskModal({ stageId: s.id, task: null })} disabled={busy}
                      className="w-full px-4 py-2 text-xs text-violet-600 dark:text-violet-400 hover:bg-violet-50 dark:hover:bg-violet-900/20 flex items-center gap-1.5 transition-colors">
                      <Plus className="w-3.5 h-3.5" /> Adicionar tarefa
                    </button>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Sub-modais */}
      {taskModal && (
        <TaskFormModal
          serviceId={serviceId}
          stageId={taskModal.stageId}
          task={taskModal.task}
          onClose={() => setTaskModal(null)}
          onSaved={() => { setTaskModal(null); load() }}
        />
      )}
      {depModal && (
        <DependencyFormModal
          serviceId={serviceId}
          task={depModal}
          allTasks={allTasks}
          stages={tpl?.stages || []}
          onClose={() => setDepModal(null)}
          onSaved={() => { setDepModal(null); load() }}
        />
      )}
      {triggerModal && (
        <TriggerFormModal
          serviceId={serviceId}
          task={triggerModal}
          onClose={() => setTriggerModal(null)}
          onSaved={() => { setTriggerModal(null); load() }}
        />
      )}
    </Modal>
  )
}

// ─── Sub-modal: criar/editar tarefa ───────────────────────────────────────────
const TaskFormModal: React.FC<{
  serviceId: string; stageId: string; task: TemplateTask | null
  onClose: () => void; onSaved: () => void
}> = ({ serviceId, stageId, task, onClose, onSaved }) => {
  const [form, setForm] = useState({
    name: task?.name || '',
    description: task?.description || '',
    observation: task?.observation || '',
    defaultDays: task?.default_days != null ? String(task.default_days) : '',
    defaultAssigneeRole: task?.default_assignee_role || '',
    requiresReview: task?.requires_review || false,
    requiresAcceptance: task?.requires_acceptance || false,
    managerReviewAllowed: task?.manager_review_allowed ?? true,
    adminReviewAllowed: task?.admin_review_allowed ?? true,
  })
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const submit = async () => {
    if (!form.name.trim()) { setErr('Nome obrigatório'); return }
    setBusy(true); setErr(null)
    const body: any = {
      name: form.name.trim(),
      description: form.description || null,
      observation: form.observation || null,
      defaultDays: form.defaultDays ? parseInt(form.defaultDays, 10) : null,
      defaultAssigneeRole: form.defaultAssigneeRole || null,
      requiresReview: form.requiresReview,
      requiresAcceptance: form.requiresAcceptance,
      managerReviewAllowed: form.managerReviewAllowed,
      adminReviewAllowed: form.adminReviewAllowed,
    }
    try {
      const url = task
        ? `/api/services/${serviceId}/template/tasks/${task.id}`
        : `/api/services/${serviceId}/template/stages/${stageId}/tasks`
      const r = await fetch(url, { method: task ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const j = await r.json()
      if (!j.success) throw new Error(j.error || 'Falha ao salvar')
      onSaved()
    } catch (e: any) { setErr(e.message); setBusy(false) }
  }

  const inputCls = 'w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-xl focus:ring-2 focus:ring-violet-500 focus:border-violet-500 bg-white dark:bg-gray-700 dark:text-gray-100 text-sm transition-all'

  return (
    <Modal isOpen onClose={onClose}>
      <div className="bg-white dark:!bg-[#243040] rounded-2xl w-full max-w-md shadow-2xl overflow-hidden">
        <div className="bg-gradient-to-r from-violet-500 to-indigo-600 px-5 py-3 flex items-center justify-between">
          <h3 className="text-white font-bold">{task ? 'Editar tarefa' : 'Nova tarefa'}</h3>
          <button onClick={onClose} className="text-white/80 hover:text-white"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-5 space-y-3 max-h-[70vh] overflow-y-auto">
          {err && <div className="text-sm text-red-600 dark:text-red-400">{err}</div>}
          <div>
            <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">Nome *</label>
            <input autoFocus value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} className={inputCls} />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">Descrição</label>
            <textarea rows={2} value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} className={inputCls} />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">Observação padrão</label>
            <input value={form.observation} onChange={e => setForm(f => ({ ...f, observation: e.target.value }))} className={inputCls} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">Prazo (dias)</label>
              <input type="number" min="0" value={form.defaultDays} onChange={e => setForm(f => ({ ...f, defaultDays: e.target.value }))} className={inputCls} />
              <p className="text-[10px] text-gray-400 mt-0.5">Dias para concluir; o relógio começa quando a tarefa é pega/atribuída.</p>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">Responsável padrão</label>
              <select value={form.defaultAssigneeRole} onChange={e => setForm(f => ({ ...f, defaultAssigneeRole: e.target.value as any }))} className={inputCls}>
                <option value="">—</option>
                <option value="user">Usuário</option>
                <option value="manager">Gerente</option>
                <option value="admin">Admin</option>
              </select>
            </div>
          </div>
          <div className="space-y-2 pt-1">
            <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
              <input type="checkbox" checked={form.requiresReview} onChange={e => setForm(f => ({ ...f, requiresReview: e.target.checked }))} className="rounded" />
              Exige revisão
            </label>
            <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
              <input type="checkbox" checked={form.requiresAcceptance} onChange={e => setForm(f => ({ ...f, requiresAcceptance: e.target.checked }))} className="rounded" />
              Exige aceite
            </label>
            {form.requiresReview && (
              <div className="ml-6 space-y-1.5">
                <label className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400">
                  <input type="checkbox" checked={form.managerReviewAllowed} onChange={e => setForm(f => ({ ...f, managerReviewAllowed: e.target.checked }))} className="rounded" />
                  Gerente pode revisar
                </label>
                <label className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400">
                  <input type="checkbox" checked={form.adminReviewAllowed} onChange={e => setForm(f => ({ ...f, adminReviewAllowed: e.target.checked }))} className="rounded" />
                  Admin pode revisar
                </label>
              </div>
            )}
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button onClick={onClose} className="px-4 py-2 rounded-xl bg-gray-100 dark:!bg-[#2d3f52] text-gray-700 dark:text-gray-200 text-sm font-medium">Cancelar</button>
            <button onClick={submit} disabled={busy} className="px-4 py-2 rounded-xl bg-gradient-to-r from-violet-500 to-indigo-600 text-white text-sm font-semibold disabled:opacity-50 flex items-center gap-1.5">
              {busy && <Loader2 className="w-4 h-4 animate-spin" />} Salvar
            </button>
          </div>
        </div>
      </div>
    </Modal>
  )
}

// ─── Sub-modal: criar dependência ─────────────────────────────────────────────
const DependencyFormModal: React.FC<{
  serviceId: string; task: TemplateTask; allTasks: TemplateTask[]; stages: TemplateStage[]
  onClose: () => void; onSaved: () => void
}> = ({ serviceId, task, allTasks, stages, onClose, onSaved }) => {
  const [depType, setDepType] = useState<'start_dependency' | 'completion_dependency'>('start_dependency')
  const [targetType, setTargetType] = useState<'task' | 'stage'>('task')
  const [targetId, setTargetId] = useState('')
  const [requiredStatus, setRequiredStatus] = useState('completed')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const submit = async () => {
    if (!targetId) { setErr('Selecione o alvo'); return }
    setBusy(true); setErr(null)
    const body: any = {
      dependencyType: depType,
      dependencyTargetType: targetType,
      requiredStatus: requiredStatus || null,
      ...(targetType === 'task' ? { targetTaskId: targetId } : { targetStageId: targetId }),
    }
    try {
      const r = await fetch(`/api/services/${serviceId}/template/tasks/${task.id}/dependencies`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      })
      const j = await r.json()
      if (!j.success) throw new Error(j.code === 'dependency_cycle' ? 'Criaria um ciclo entre tarefas.' : (j.error || 'Falha'))
      onSaved()
    } catch (e: any) { setErr(e.message); setBusy(false) }
  }

  const inputCls = 'w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 dark:text-gray-100 text-sm'
  const candidateTasks = allTasks.filter(t => t.id !== task.id)

  return (
    <Modal isOpen onClose={onClose}>
      <div className="bg-white dark:!bg-[#243040] rounded-2xl w-full max-w-md shadow-2xl overflow-hidden">
        <div className="bg-gradient-to-r from-indigo-500 to-blue-600 px-5 py-3 flex items-center justify-between">
          <h3 className="text-white font-bold flex items-center gap-2"><GitBranch className="w-4 h-4" /> Dependência</h3>
          <button onClick={onClose} className="text-white/80 hover:text-white"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-5 space-y-3">
          {err && <div className="text-sm text-red-600 dark:text-red-400">{err}</div>}
          <p className="text-xs text-gray-500 dark:text-gray-400">Tarefa: <strong>{task.name}</strong></p>
          <div>
            <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">Tipo</label>
            <select value={depType} onChange={e => setDepType(e.target.value as any)} className={inputCls}>
              <option value="start_dependency">Só inicia após o alvo</option>
              <option value="completion_dependency">Só conclui após o alvo</option>
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">Alvo</label>
              <select value={targetType} onChange={e => { setTargetType(e.target.value as any); setTargetId('') }} className={inputCls}>
                <option value="task">Tarefa</option>
                <option value="stage">Etapa</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">Status exigido</label>
              <input value={requiredStatus} onChange={e => setRequiredStatus(e.target.value)} className={inputCls} placeholder="completed" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">{targetType === 'task' ? 'Tarefa alvo' : 'Etapa alvo'}</label>
            <select value={targetId} onChange={e => setTargetId(e.target.value)} className={inputCls}>
              <option value="">Selecione…</option>
              {targetType === 'task'
                ? candidateTasks.map(t => <option key={t.id} value={t.id}>{t.name}</option>)
                : stages.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button onClick={onClose} className="px-4 py-2 rounded-xl bg-gray-100 dark:!bg-[#2d3f52] text-gray-700 dark:text-gray-200 text-sm font-medium">Cancelar</button>
            <button onClick={submit} disabled={busy} className="px-4 py-2 rounded-xl bg-gradient-to-r from-indigo-500 to-blue-600 text-white text-sm font-semibold disabled:opacity-50 flex items-center gap-1.5">
              {busy && <Loader2 className="w-4 h-4 animate-spin" />} Adicionar
            </button>
          </div>
        </div>
      </div>
    </Modal>
  )
}

// ─── Sub-modal: criar trigger ─────────────────────────────────────────────────
const TriggerFormModal: React.FC<{
  serviceId: string; task: TemplateTask; onClose: () => void; onSaved: () => void
}> = ({ serviceId, task, onClose, onSaved }) => {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [assigneeRole, setAssigneeRole] = useState('')
  const [requiresReview, setRequiresReview] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const submit = async () => {
    if (!name.trim()) { setErr('Nome da tarefa a criar é obrigatório'); return }
    setBusy(true); setErr(null)
    const body = {
      onStatus: 'completed',
      payload: {
        name: name.trim(),
        description: description || null,
        default_assignee_role: assigneeRole || null,
        requires_review: requiresReview,
      },
    }
    try {
      const r = await fetch(`/api/services/${serviceId}/template/tasks/${task.id}/triggers`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      })
      const j = await r.json()
      if (!j.success) throw new Error(j.error || 'Falha')
      onSaved()
    } catch (e: any) { setErr(e.message); setBusy(false) }
  }

  const inputCls = 'w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 dark:text-gray-100 text-sm'

  return (
    <Modal isOpen onClose={onClose}>
      <div className="bg-white dark:!bg-[#243040] rounded-2xl w-full max-w-md shadow-2xl overflow-hidden">
        <div className="bg-gradient-to-r from-fuchsia-500 to-violet-600 px-5 py-3 flex items-center justify-between">
          <h3 className="text-white font-bold flex items-center gap-2"><Zap className="w-4 h-4" /> Gatilho</h3>
          <button onClick={onClose} className="text-white/80 hover:text-white"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-5 space-y-3">
          {err && <div className="text-sm text-red-600 dark:text-red-400">{err}</div>}
          <p className="text-xs text-gray-500 dark:text-gray-400 flex items-start gap-1.5">
            <CheckCircle2 className="w-3.5 h-3.5 mt-0.5 text-fuchsia-400 flex-shrink-0" />
            Quando <strong>{task.name}</strong> for concluída, cria automaticamente a tarefa abaixo.
          </p>
          <div>
            <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">Nome da tarefa a criar *</label>
            <input autoFocus value={name} onChange={e => setName(e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">Descrição</label>
            <textarea rows={2} value={description} onChange={e => setDescription(e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">Responsável padrão</label>
            <select value={assigneeRole} onChange={e => setAssigneeRole(e.target.value)} className={inputCls}>
              <option value="">—</option>
              <option value="user">Usuário</option>
              <option value="manager">Gerente</option>
              <option value="admin">Admin</option>
            </select>
          </div>
          <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
            <input type="checkbox" checked={requiresReview} onChange={e => setRequiresReview(e.target.checked)} className="rounded" />
            Tarefa criada exige revisão
          </label>
          <div className="flex justify-end gap-2 pt-2">
            <button onClick={onClose} className="px-4 py-2 rounded-xl bg-gray-100 dark:!bg-[#2d3f52] text-gray-700 dark:text-gray-200 text-sm font-medium">Cancelar</button>
            <button onClick={submit} disabled={busy} className="px-4 py-2 rounded-xl bg-gradient-to-r from-fuchsia-500 to-violet-600 text-white text-sm font-semibold disabled:opacity-50 flex items-center gap-1.5">
              {busy && <Loader2 className="w-4 h-4 animate-spin" />} Adicionar
            </button>
          </div>
        </div>
      </div>
    </Modal>
  )
}

export default ServiceTemplateEditor
