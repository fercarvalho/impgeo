import React, { useCallback, useEffect, useState } from 'react'
import {
  ArrowLeft, Layers, ListTodo, History, DollarSign, Users, MapPin,
  Loader2, CopyPlus, SkipForward, CheckCircle2, Clock, AlertCircle,
  UserPlus, Plus, Unlink, CalendarClock, X,
} from 'lucide-react'
import Modal from '@/components/Modal'
import AssignTaskModal from './AssignTaskModal'
import LinkTransactionModal from './LinkTransactionModal'
import { setTaskDueDate } from './taskApi'

// ─── Tipos ────────────────────────────────────────────────────────────────────
interface Task {
  id: string
  name: string
  status: string
  assignee_user_id: string | null
  assignee_name?: string | null
  due_date: string | null
  review_required: boolean
  acceptance_required: boolean
  actual_minutes?: number | null
  default_days?: number | null
  can_manage?: boolean
  due_action?: 'edit' | 'request' | null
  deps?: any[]
}
interface Stage {
  id: string
  name: string
  version: number
  sort_order: number
  status: string
  tasks: Task[]
}
interface ProjectEvent {
  id: string
  event_type: string
  actor_type: string
  payload: any
  created_at: string
}
interface ProjectDetail {
  id: string
  name: string
  status: string
  description: string | null
  client_id: string | null
  service_id: string | null
  terracontrol_id: string | null
  total_cents: number
  expenses_cents: number
  profit_cents: number
  progress_pct: number
  stages?: Stage[]
  events?: ProjectEvent[]
}

const API = '/api'

// status de tarefa → cor + label
const TASK_STATUS: Record<string, { label: string; cls: string }> = {
  pending:            { label: 'Pendente',          cls: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300' },
  available:          { label: 'Disponível',        cls: 'bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400' },
  in_progress:        { label: 'Em andamento',      cls: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' },
  pending_acceptance: { label: 'Aguard. aceite',    cls: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' },
  pending_review:     { label: 'Aguard. revisão',   cls: 'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400' },
  pending_adjustment: { label: 'Em ajuste',         cls: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400' },
  completed:          { label: 'Concluída',         cls: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' },
  overdue:            { label: 'Atrasada',          cls: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' },
  refused:            { label: 'Recusada',          cls: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' },
  canceled:           { label: 'Cancelada',         cls: 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400' },
}
const STAGE_STATUS: Record<string, string> = {
  pending: 'Pendente', active: 'Ativa', completed: 'Concluída', skipped: 'Pulada',
}

const fmtBRL = (cents: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format((cents || 0) / 100)

// data ISO/'YYYY-MM-DD' → 'dd/mm/aaaa' (sem parse de Date, evita erro de fuso)
const fmtDate = (v?: string | null) => {
  if (!v) return ''
  const [y, m, d] = String(v).slice(0, 10).split('-')
  return d ? `${d}/${m}/${y}` : String(v).slice(0, 10)
}

// minutos → "1h 23min" / "45min" / "—"
const fmtDur = (min?: number | null) => {
  const m = Math.max(0, Math.round(min || 0))
  if (!m) return '—'
  const h = Math.floor(m / 60)
  const r = m % 60
  return h ? `${h}h ${r}min` : `${r}min`
}

interface Props {
  projectId: string
  canEdit: boolean
  onBack: () => void
}

type Tab = 'stages' | 'costs' | 'events' | 'team' | 'terra'

const ProjectDetailPage: React.FC<Props> = ({ projectId, canEdit, onBack }) => {
  const [project, setProject] = useState<ProjectDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState<Tab>('stages')
  const [assignFor, setAssignFor] = useState<Task | null>(null)
  const [dueFor, setDueFor] = useState<Task | null>(null)
  const [dueVal, setDueVal] = useState('')
  const [dueJust, setDueJust] = useState('')
  const [dueMsg, setDueMsg] = useState<string | null>(null)
  const [showLink, setShowLink] = useState(false)
  const [linkedTx, setLinkedTx] = useState<any[]>([])

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const r = await fetch(`${API}/projects/${projectId}?include=stages,tasks,events`)
      const j = await r.json()
      if (!j.success) throw new Error(j.error || 'Falha ao carregar projeto')
      setProject(j.data)
    } catch (e: any) {
      setError(e.message || 'Erro ao carregar')
    } finally {
      setLoading(false)
    }
  }, [projectId])

  useEffect(() => { load() }, [load])

  const loadTx = useCallback(async () => {
    try {
      const r = await fetch(`${API}/projects/${projectId}/transactions`)
      const j = await r.json()
      if (j.success) setLinkedTx(j.data)
    } catch { /* noop */ }
  }, [projectId])

  useEffect(() => { if (tab === 'costs') loadTx() }, [tab, loadTx])

  const unlinkTx = async (txId: string) => {
    setBusy(true)
    try {
      await fetch(`${API}/transactions/${txId}/link-project`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ projectId: null }),
      })
      await loadTx(); await load()
    } catch { /* noop */ } finally { setBusy(false) }
  }

  const openDue = (t: Task) => { setDueFor(t); setDueVal((t.due_date || '').slice(0, 10)); setDueJust(''); setDueMsg(null) }

  const saveDue = async (val: string) => {
    if (!dueFor) return
    setBusy(true); setError(null)
    try {
      const r = await setTaskDueDate(dueFor.id, val || null, dueFor.due_action === 'request' ? dueJust : undefined)
      if (r?.requested) { setDueMsg('Pedido enviado! Um gestor vai aprovar — você será notificado.'); await load() }
      else { setDueFor(null); await load() }
    } catch (e: any) { setError(e.message) } finally { setBusy(false) }
  }

  const cloneStage = async (stageId: string) => {
    if (!window.confirm('Criar uma nova versão desta etapa (com as tarefas copiadas)?')) return
    setBusy(true)
    try {
      const r = await fetch(`${API}/projects/${projectId}/stages/${stageId}/clone-as-version`, { method: 'POST' })
      const j = await r.json()
      if (!j.success) throw new Error(j.error || 'Falha')
      await load()
    } catch (e: any) { setError(e.message) } finally { setBusy(false) }
  }
  const skipStage = async (stageId: string) => {
    if (!window.confirm('Pular esta etapa?')) return
    setBusy(true)
    try {
      const r = await fetch(`${API}/projects/${projectId}/stages/${stageId}/skip`, { method: 'POST' })
      const j = await r.json()
      if (!j.success) throw new Error(j.error || 'Falha')
      await load()
    } catch (e: any) { setError(e.message) } finally { setBusy(false) }
  }

  if (loading) {
    return <div className="flex items-center justify-center py-20 text-gray-400"><Loader2 className="w-7 h-7 animate-spin" /></div>
  }
  if (error && !project) {
    return (
      <div className="space-y-4">
        <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-gray-600 dark:text-gray-300"><ArrowLeft className="w-4 h-4" /> Voltar</button>
        <div className="text-red-600 dark:text-red-400 text-sm">{error}</div>
      </div>
    )
  }
  if (!project) return null

  const totalTasks = (project.stages || []).reduce((n, s) => n + s.tasks.length, 0)
  const doneTasks = (project.stages || []).reduce((n, s) => n + s.tasks.filter(t => t.status === 'completed').length, 0)

  const TABS: { key: Tab; label: string; icon: any }[] = [
    { key: 'stages', label: 'Etapas', icon: Layers },
    { key: 'costs', label: 'Custos', icon: DollarSign },
    { key: 'events', label: 'Eventos', icon: History },
    { key: 'team', label: 'Equipe', icon: Users },
    ...(project.terracontrol_id ? [{ key: 'terra' as Tab, label: 'Terreno', icon: MapPin }] : []),
  ]

  return (
    <div className="space-y-5">
      {/* Header */}
      <div>
        <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100 mb-3">
          <ArrowLeft className="w-4 h-4" /> Voltar aos projetos
        </button>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="p-2.5 rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600 shadow-md shadow-violet-500/25 flex-shrink-0">
              <Layers className="w-5 h-5 text-white" />
            </div>
            <div className="min-w-0">
              <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100 truncate">{project.name}</h1>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {doneTasks}/{totalTasks} tarefas · {(project.stages || []).length} etapa(s) · {project.status}
              </p>
            </div>
          </div>
        </div>
      </div>

      {error && <div className="text-sm text-red-600 dark:text-red-400">{error}</div>}

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-200 dark:border-gray-700 overflow-x-auto">
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors whitespace-nowrap ${
              tab === t.key
                ? 'border-violet-500 text-violet-600 dark:text-violet-400'
                : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
            }`}>
            <t.icon className="w-4 h-4" /> {t.label}
          </button>
        ))}
      </div>

      {/* Conteúdo */}
      {tab === 'stages' && (
        <div className="space-y-4">
          {(project.stages || []).length === 0 && (
            <div className="text-center py-10 text-gray-400"><ListTodo className="w-9 h-9 mx-auto mb-2 opacity-50" /><p className="text-sm">Sem etapas neste projeto.</p></div>
          )}
          {(project.stages || []).map((s, i) => (
            <div key={s.id} className="border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
              <div className="bg-gray-50 dark:bg-[#2d3f52] px-4 py-2.5 flex items-center gap-2">
                <span className="text-xs font-bold text-violet-600 dark:text-violet-400 w-5">{i + 1}</span>
                <span className="font-semibold text-gray-800 dark:text-gray-100 flex-1 truncate">{s.name}</span>
                <span className="text-xs px-2 py-0.5 rounded-full bg-gray-200 dark:bg-gray-600 text-gray-600 dark:text-gray-300">{STAGE_STATUS[s.status] || s.status}</span>
                {canEdit && (
                  <div className="flex items-center gap-0.5">
                    <button onClick={() => cloneStage(s.id)} disabled={busy} title="Nova versão (diligência)" className="p-1 text-violet-400 hover:text-violet-600"><CopyPlus className="w-4 h-4" /></button>
                    {s.status !== 'completed' && s.status !== 'skipped' && (
                      <button onClick={() => skipStage(s.id)} disabled={busy} title="Pular etapa" className="p-1 text-gray-400 hover:text-gray-600"><SkipForward className="w-4 h-4" /></button>
                    )}
                  </div>
                )}
              </div>
              <div className="divide-y divide-gray-100 dark:divide-gray-700">
                {s.tasks.length === 0 && <p className="px-4 py-3 text-xs text-gray-400">Sem tarefas.</p>}
                {s.tasks.map(t => {
                  // Tarefa disponível com responsável definido → badge "Atribuída".
                  const st = (t.status === 'available' && t.assignee_user_id)
                    ? { label: 'Atribuída', cls: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400' }
                    : (TASK_STATUS[t.status] || { label: t.status, cls: 'bg-gray-100 text-gray-600' })
                  return (
                    <div key={t.id} className="px-4 py-2.5 flex items-center gap-2">
                      <span className="text-sm text-gray-800 dark:text-gray-100 flex-1 truncate">{t.name}</span>
                      {t.assignee_name && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 flex items-center gap-0.5 max-w-[140px] truncate">
                          <Users className="w-3 h-3 flex-shrink-0" />{t.assignee_name}
                        </span>
                      )}
                      {t.review_required && <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400">revisão</span>}
                      {(t.due_date || t.default_days != null) && <span title={t.due_date ? 'Vence em' : 'Prazo (dias)'} className="text-[10px] text-gray-400 flex items-center gap-0.5"><Clock className="w-3 h-3" />{t.due_date ? fmtDate(t.due_date) : `${t.default_days}d`}</span>}
                      <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${st.cls}`}>{st.label}</span>
                      {t.due_action && (
                        <button onClick={() => openDue(t)} disabled={busy}
                          title={t.due_action === 'request' ? 'Solicitar alteração de prazo' : (t.due_date ? 'Editar prazo' : 'Definir prazo')}
                          className="p-1 text-violet-400 hover:text-violet-600">
                          <CalendarClock className="w-4 h-4" />
                        </button>
                      )}
                      {canEdit && t.can_manage !== false && (
                        <button onClick={() => setAssignFor(t)} disabled={busy}
                          title={t.assignee_user_id ? 'Reatribuir' : 'Atribuir responsável'}
                          className="p-1 text-violet-400 hover:text-violet-600">
                          <UserPlus className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === 'costs' && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="p-4 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:!bg-[#243040]">
            <p className="text-xs text-gray-500 dark:text-gray-400">Valor do projeto</p>
            <p className="text-lg font-bold text-gray-900 dark:text-gray-100">{fmtBRL(project.total_cents)}</p>
          </div>
          <div className="p-4 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:!bg-[#243040]">
            <p className="text-xs text-gray-500 dark:text-gray-400">Custo (despesas vinculadas)</p>
            <p className="text-lg font-bold text-red-600 dark:text-red-400">{fmtBRL(project.expenses_cents)}</p>
          </div>
          <div className="p-4 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:!bg-[#243040]">
            <p className="text-xs text-gray-500 dark:text-gray-400">Resultado (orçado − custo)</p>
            <p className={`text-lg font-bold ${project.profit_cents >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>{fmtBRL(project.profit_cents)}</p>
          </div>
          <div className="sm:col-span-3 mt-2">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-200">Despesas vinculadas</h3>
              {canEdit && (
                <button onClick={() => setShowLink(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-violet-600 hover:bg-violet-700 text-white text-xs font-semibold">
                  <Plus className="w-3.5 h-3.5" /> Vincular transação
                </button>
              )}
            </div>
            {linkedTx.length === 0 ? (
              <p className="text-xs text-gray-400">Nenhuma despesa vinculada. O custo é recalculado automaticamente ao vincular.</p>
            ) : (
              <div className="rounded-xl border border-gray-200 dark:border-gray-700 divide-y divide-gray-100 dark:divide-gray-700">
                {linkedTx.map(t => (
                  <div key={t.id} className="flex items-center gap-3 px-3 py-2">
                    <div className="min-w-0 flex-1">
                      <div className="text-sm text-gray-800 dark:text-gray-100 truncate">{t.description || '(sem descrição)'}</div>
                      <div className="text-xs text-gray-400">{t.date} · {t.type} · <span className="text-red-600 dark:text-red-400">{fmtBRL(Math.round((t.value || 0) * 100))}</span></div>
                    </div>
                    {canEdit && (
                      <button onClick={() => unlinkTx(t.id)} disabled={busy} title="Desvincular" className="p-1 text-gray-400 hover:text-red-600">
                        <Unlink className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {tab === 'events' && (
        <div className="space-y-2">
          {(project.events || []).length === 0 && <p className="text-sm text-gray-400">Sem eventos.</p>}
          {(project.events || []).map(ev => (
            <div key={ev.id} className="flex items-start gap-2 text-sm">
              <CheckCircle2 className="w-4 h-4 text-violet-400 mt-0.5 flex-shrink-0" />
              <div className="flex-1">
                <span className="text-gray-800 dark:text-gray-200 font-medium">{ev.event_type}</span>
                <span className="text-gray-400 text-xs ml-2">{new Date(ev.created_at).toLocaleString('pt-BR')}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === 'team' && (() => {
        // Agrupa as tarefas por responsável (assignee_user_id).
        const byUser = new Map<string, { name: string; tasks: Task[] }>()
        ;(project.stages || []).forEach(s => s.tasks.forEach(t => {
          if (!t.assignee_user_id) return
          const cur = byUser.get(t.assignee_user_id) || { name: t.assignee_name || 'Usuário', tasks: [] }
          cur.tasks.push(t)
          byUser.set(t.assignee_user_id, cur)
        }))
        const members = Array.from(byUser.entries())
        return (
          <div className="space-y-4">
            <p className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
              <AlertCircle className="w-4 h-4 text-violet-400" /> Atribua responsáveis pelo botão <UserPlus className="w-3.5 h-3.5 inline" /> em cada tarefa, na aba <strong>Etapas</strong>.
            </p>
            {members.length === 0 ? (
              <div className="text-center py-10 text-gray-400">
                <Users className="w-9 h-9 mx-auto mb-2 opacity-50" />
                <p className="text-sm">Nenhuma tarefa atribuída neste projeto ainda.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {members.map(([uid, m]) => {
                  const done = m.tasks.filter(t => t.status === 'completed').length
                  const totalMin = m.tasks.reduce((n, t) => n + (t.actual_minutes || 0), 0)
                  return (
                    <div key={uid} className="border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
                      <div className="bg-gray-50 dark:bg-[#2d3f52] px-4 py-2.5 flex items-center gap-2">
                        <div className="w-7 h-7 rounded-full bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                          {m.name.charAt(0).toUpperCase()}
                        </div>
                        <span className="font-semibold text-gray-800 dark:text-gray-100 flex-1 truncate">{m.name}</span>
                        <span className="text-xs text-violet-600 dark:text-violet-400 font-medium flex items-center gap-1"><Clock className="w-3.5 h-3.5" />{fmtDur(totalMin)}</span>
                        <span className="text-xs text-gray-500 dark:text-gray-400">· {done}/{m.tasks.length} concluída(s)</span>
                      </div>
                      <div className="divide-y divide-gray-100 dark:divide-gray-700">
                        {m.tasks.map(t => {
                          const st = (t.status === 'available' && t.assignee_user_id)
                            ? { label: 'Atribuída', cls: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400' }
                            : (TASK_STATUS[t.status] || { label: t.status, cls: 'bg-gray-100 text-gray-600' })
                          return (
                            <div key={t.id} className="px-4 py-2.5 flex items-center gap-2">
                              <span className="text-sm text-gray-800 dark:text-gray-100 flex-1 truncate">{t.name}</span>
                              <span className="text-[10px] text-violet-500 dark:text-violet-400 flex items-center gap-0.5 flex-shrink-0" title="Tempo trabalhado"><Clock className="w-3 h-3" />{fmtDur(t.actual_minutes)}</span>
                              <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${st.cls}`}>{st.label}</span>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )
      })()}

      {tab === 'terra' && project.terracontrol_id && (
        <div className="space-y-3">
          <p className="text-sm text-gray-600 dark:text-gray-300">Este projeto foi gerado a partir de um terreno do TerraControl.</p>
          <a
            href={`/?subsystem=especial&module=terracontrol&record=${project.terracontrol_id}`}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-gradient-to-r from-tc-green to-tc-blue text-white text-sm font-semibold"
          >
            <MapPin className="w-4 h-4" /> Ver terreno no TerraControl
          </a>
        </div>
      )}

      {assignFor && (
        <AssignTaskModal
          projectId={project.id}
          taskId={assignFor.id}
          taskName={assignFor.name}
          currentAssigneeId={assignFor.assignee_user_id}
          onClose={() => setAssignFor(null)}
          onDone={() => { setAssignFor(null); load() }}
        />
      )}

      {showLink && (
        <LinkTransactionModal
          projectId={project.id}
          onClose={() => setShowLink(false)}
          onDone={() => { loadTx(); load() }}
        />
      )}

      {dueFor && (() => {
        const isReq = dueFor.due_action === 'request'
        return (
        <Modal isOpen onClose={() => setDueFor(null)}>
          <div className="bg-white dark:!bg-[#243040] rounded-2xl w-full max-w-sm shadow-2xl overflow-hidden">
            <div className="bg-gradient-to-r from-violet-500 to-indigo-600 px-5 py-3 flex items-center justify-between">
              <h3 className="text-white font-bold flex items-center gap-2"><CalendarClock className="w-4 h-4" /> {isReq ? 'Solicitar alteração de prazo' : 'Prazo da tarefa'}</h3>
              <button onClick={() => setDueFor(null)} className="text-white/80 hover:text-white"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-5 space-y-3">
              {dueMsg ? (
                <div className="text-center space-y-2 py-2">
                  <CheckCircle2 className="w-10 h-10 mx-auto text-green-500" />
                  <p className="text-sm text-gray-700 dark:text-gray-200">{dueMsg}</p>
                  <button onClick={() => setDueFor(null)} className="mt-1 px-4 py-2 rounded-xl bg-gradient-to-r from-violet-500 to-indigo-600 text-white text-sm font-semibold">Fechar</button>
                </div>
              ) : (
                <>
                  <p className="text-sm text-gray-600 dark:text-gray-300 truncate"><strong>{dueFor.name}</strong></p>
                  <input type="date" value={dueVal} onChange={e => setDueVal(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 dark:text-gray-100 text-sm" />
                  {isReq ? (
                    <>
                      <p className="text-xs text-amber-600 dark:text-amber-400">A alteração precisa de aprovação de um gestor. Você será notificado da decisão.</p>
                      <textarea value={dueJust} onChange={e => setDueJust(e.target.value)} rows={2} placeholder="Justificativa (opcional)…"
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 dark:text-gray-100 text-sm" />
                    </>
                  ) : (
                    <p className="text-xs text-gray-400">Data passada → vira "Atrasada" em ~1 min. Atrasada com novo prazo não vencido volta a "Disponível".</p>
                  )}
                  <div className="flex items-center justify-between gap-2 pt-1">
                    <button onClick={() => saveDue('')} disabled={busy} className="px-3 py-2 rounded-xl bg-gray-100 dark:!bg-[#2d3f52] text-gray-600 dark:text-gray-300 text-sm font-medium disabled:opacity-50">{isReq ? 'Pedir sem prazo' : 'Limpar prazo'}</button>
                    <div className="flex gap-2">
                      <button onClick={() => setDueFor(null)} className="px-4 py-2 rounded-xl bg-gray-100 dark:!bg-[#2d3f52] text-gray-700 dark:text-gray-200 text-sm font-medium">Cancelar</button>
                      <button onClick={() => saveDue(dueVal)} disabled={busy}
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
      })()}
    </div>
  )
}

export default ProjectDetailPage
