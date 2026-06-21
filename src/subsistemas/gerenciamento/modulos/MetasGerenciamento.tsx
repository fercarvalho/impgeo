import React, { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Target, Plus, CheckCircle2, Timer, FolderKanban, Pencil, Trash2, X, Loader2, AlertCircle, Flag,
} from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { useDialogs } from '@/components/DialogProvider'
import Modal from '@/components/Modal'
import { ConicGauge, fmtNum, fmtMin } from './_pm/charts'

const API = '/api'

type Metric = 'tasks_completed' | 'on_time_pct' | 'projects_completed' | 'focus_minutes'
type Scope = 'self' | 'user' | 'team' | 'global'
type Period = 'week' | 'month' | 'quarter'

interface Goal {
  id: string; title: string | null; metric: Metric; target: number; scope: Scope
  target_user_id: string | null; target_user_name?: string | null
  period: Period; period_start: string; period_end: string
  current: number; pct: number; status: 'on_track' | 'at_risk' | 'hit' | 'missed'
}

const METRIC_META: Record<Metric, { label: string; icon: React.ReactNode; unit: 'qtd' | 'pct' | 'min'; targetLabel: string }> = {
  tasks_completed: { label: 'Tarefas concluídas', icon: <CheckCircle2 className="w-4 h-4" />, unit: 'qtd', targetLabel: 'Alvo (qtd)' },
  on_time_pct: { label: '% de tarefas no prazo', icon: <Target className="w-4 h-4" />, unit: 'pct', targetLabel: 'Alvo (%)' },
  projects_completed: { label: 'Projetos concluídos', icon: <FolderKanban className="w-4 h-4" />, unit: 'qtd', targetLabel: 'Alvo (qtd)' },
  focus_minutes: { label: 'Tempo de foco', icon: <Timer className="w-4 h-4" />, unit: 'min', targetLabel: 'Alvo (min)' },
}
const PERIOD_LABEL: Record<Period, string> = { week: 'Semana', month: 'Mês', quarter: 'Trimestre' }
const STATUS_META: Record<Goal['status'], { label: string; bar: string; badge: string }> = {
  hit: { label: 'Batida', bar: 'bg-emerald-500', badge: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300' },
  on_track: { label: 'No caminho', bar: 'bg-violet-500', badge: 'bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300' },
  at_risk: { label: 'Em risco', bar: 'bg-amber-500', badge: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300' },
  missed: { label: 'Não batida', bar: 'bg-rose-500', badge: 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300' },
}

const DONUT_COLOR: Record<Goal['status'], string> = { hit: '#22c55e', on_track: '#8b5cf6', at_risk: '#f59e0b', missed: '#ef4444' }

const fmtVal = (m: Metric, v: number) => METRIC_META[m].unit === 'min' ? fmtMin(v) : METRIC_META[m].unit === 'pct' ? `${Math.round(v)}%` : fmtNum(v)
const fmtDate = (v: string) => { const [y, m, d] = String(v).slice(0, 10).split('-'); return `${d}/${m}/${y.slice(2)}` }

function computeWindow(period: Period): { start: string; end: string } {
  const now = new Date()
  const iso = (d: Date) => d.toISOString().slice(0, 10)
  if (period === 'week') {
    const dow = (now.getDay() + 6) % 7 // segunda=0
    const start = new Date(now); start.setDate(now.getDate() - dow)
    const end = new Date(start); end.setDate(start.getDate() + 6)
    return { start: iso(start), end: iso(end) }
  }
  if (period === 'quarter') {
    const q = Math.floor(now.getMonth() / 3)
    return { start: iso(new Date(now.getFullYear(), q * 3, 1)), end: iso(new Date(now.getFullYear(), q * 3 + 3, 0)) }
  }
  return { start: iso(new Date(now.getFullYear(), now.getMonth(), 1)), end: iso(new Date(now.getFullYear(), now.getMonth() + 1, 0)) }
}

const scopeLabel = (g: Goal) =>
  g.scope === 'self' ? 'Pessoal'
    : g.scope === 'global' ? 'Empresa'
      : g.scope === 'team' ? `Equipe de ${g.target_user_name || '—'}`
        : g.target_user_name || '—'

const MetasGerenciamento: React.FC = () => {
  const { user } = useAuth()
  const role = (user as any)?.role as string | undefined
  const isGestor = role === 'manager' || role === 'admin' || role === 'superadmin'
  const isAdmin = role === 'admin' || role === 'superadmin'
  const { confirm } = useDialogs()

  const [goals, setGoals] = useState<Goal[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState<'mine' | 'team'>('mine')
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<Goal | null>(null)

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const r = await fetch(`${API}/pm/goals`)
      const j = await r.json()
      if (!j.success) throw new Error(j.error || 'Falha ao carregar metas')
      setGoals(j.data)
    } catch (e: any) { setError(e.message) } finally { setLoading(false) }
  }, [])
  useEffect(() => { load() }, [load])

  const mine = useMemo(() => goals.filter(g => g.scope === 'self' && g.target_user_id === (user as any)?.id), [goals, user])
  const team = useMemo(() => goals.filter(g => g.scope !== 'self' || g.target_user_id !== (user as any)?.id), [goals, user])
  const shown = tab === 'mine' ? mine : team

  const remove = async (g: Goal) => {
    if (!await confirm({ title: 'Excluir meta', message: `Excluir a meta "${g.title || METRIC_META[g.metric].label}"?`, confirmLabel: 'Excluir', destructive: true })) return
    await fetch(`${API}/pm/goals/${g.id}`, { method: 'DELETE' }); load()
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <h1 className="text-3xl font-bold flex items-center gap-3 text-gray-900 dark:text-gray-100">
          <Target className="w-8 h-8 text-violet-600" /> Metas
        </h1>
        <button onClick={() => { setEditing(null); setModalOpen(true) }}
          className="flex items-center gap-2.5 px-6 py-3 bg-gradient-to-r from-violet-500 to-indigo-600 text-white font-semibold rounded-xl hover:from-violet-600 hover:to-indigo-700 shadow-lg hover:shadow-xl transform hover:-translate-y-1 transition-all duration-300">
          <Plus className="h-5 w-5" /> Nova meta
        </button>
      </div>

      {error && (
        <div role="alert" className="flex items-center gap-2 px-3 py-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl text-red-700 dark:text-red-400 text-sm">
          <AlertCircle className="w-4 h-4" /> {error}
        </div>
      )}

      <div className="inline-flex rounded-xl bg-gray-100 dark:bg-[#243040] p-1">
        {([['mine', 'Minhas metas'], ['team', 'Equipe & empresa']] as const).map(([k, label]) => (
          <button key={k} onClick={() => setTab(k)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${tab === k ? 'bg-white dark:bg-violet-600 text-violet-700 dark:text-white shadow-sm' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700'}`}>
            {label} {k === 'mine' ? `(${mine.length})` : `(${team.length})`}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16 text-gray-400"><Loader2 className="w-7 h-7 animate-spin" /></div>
      ) : shown.length === 0 ? (
        <div className="text-center py-16 rounded-2xl border-2 border-dashed border-gray-200 dark:border-gray-700">
          <Flag className="w-10 h-10 mx-auto mb-3 text-gray-300 dark:text-gray-600" />
          <p className="text-sm text-gray-500 dark:text-gray-400">{tab === 'mine' ? 'Você ainda não tem metas pessoais.' : 'Nenhuma meta de equipe/empresa.'}</p>
          <button onClick={() => { setEditing(null); setModalOpen(true) }} className="mt-3 text-sm text-violet-600 dark:text-violet-400 font-medium hover:underline">Criar a primeira</button>
        </div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
          {shown.map(g => {
            const sm = STATUS_META[g.status]
            const mm = METRIC_META[g.metric]
            const canEdit = isAdmin || g.scope === 'self'
            const remaining = Math.max(0, g.target - g.current)
            return (
              <div key={g.id} className="bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-800 dark:to-slate-900 rounded-2xl shadow-lg border border-slate-200 dark:border-slate-700 p-5">
                {/* Cabeçalho */}
                <div className="flex items-start gap-2 mb-4">
                  <div className="w-9 h-9 rounded-xl bg-violet-100 dark:bg-violet-900/40 text-violet-600 dark:text-violet-300 flex items-center justify-center flex-shrink-0">{mm.icon}</div>
                  <div className="min-w-0 flex-1">
                    <p className="text-base font-bold text-gray-800 dark:text-gray-100 truncate">{g.title || mm.label}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{mm.label} · {scopeLabel(g)}</p>
                  </div>
                  <span className={`text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full ${sm.badge} flex-shrink-0`}>{sm.label}</span>
                  {canEdit && (
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button onClick={() => { setEditing(g); setModalOpen(true) }} className="p-1 text-gray-400 hover:text-violet-600" title="Editar"><Pencil className="w-4 h-4" /></button>
                      <button onClick={() => remove(g)} className="p-1 text-gray-400 hover:text-rose-600" title="Excluir"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  )}
                </div>

                {/* Donut + mini-stats */}
                <div className="flex flex-col sm:flex-row items-center gap-5">
                  <ConicGauge pct={g.pct} color={DONUT_COLOR[g.status]} size={132} />
                  <div className="flex-1 grid grid-cols-3 gap-2.5 w-full">
                    <div className="bg-white dark:!bg-[#243040] rounded-xl p-3 text-center shadow-md border border-gray-100 dark:border-gray-700">
                      <div className="text-[10px] font-bold text-gray-500 uppercase tracking-wide mb-1">Alvo</div>
                      <div className="text-lg font-black text-gray-800 dark:text-gray-100">{fmtVal(g.metric, g.target)}</div>
                    </div>
                    <div className="bg-white dark:!bg-[#243040] rounded-xl p-3 text-center shadow-md border border-gray-100 dark:border-gray-700">
                      <div className="text-[10px] font-bold text-emerald-600 uppercase tracking-wide mb-1">Atual</div>
                      <div className="text-lg font-black text-emerald-700 dark:text-emerald-400">{fmtVal(g.metric, g.current)}</div>
                    </div>
                    <div className="bg-white dark:!bg-[#243040] rounded-xl p-3 text-center shadow-md border border-gray-100 dark:border-gray-700">
                      <div className="text-[10px] font-bold text-violet-600 uppercase tracking-wide mb-1">Falta</div>
                      <div className="text-lg font-black text-gray-800 dark:text-gray-100">{g.status === 'hit' ? '—' : fmtVal(g.metric, remaining)}</div>
                    </div>
                  </div>
                </div>

                <div className="mt-4 pt-3 border-t border-slate-200 dark:border-slate-700 text-xs text-gray-400">
                  {PERIOD_LABEL[g.period]} · {fmtDate(g.period_start)} – {fmtDate(g.period_end)}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {modalOpen && (
        <GoalModal
          goal={editing}
          isGestor={isGestor}
          isAdmin={isAdmin}
          actorId={(user as any)?.id}
          onClose={() => setModalOpen(false)}
          onSaved={() => { setModalOpen(false); load() }}
        />
      )}
    </div>
  )
}

// ─── Modal de criar/editar meta ───────────────────────────────────────────────
const GoalModal: React.FC<{
  goal: Goal | null
  isGestor: boolean
  isAdmin: boolean
  actorId?: string
  onClose: () => void
  onSaved: () => void
}> = ({ goal, isGestor, isAdmin, actorId, onClose, onSaved }) => {
  const editMode = !!goal
  const [title, setTitle] = useState(goal?.title || '')
  const [metric, setMetric] = useState<Metric>(goal?.metric || 'tasks_completed')
  const [target, setTarget] = useState(goal ? String(goal.target) : '')
  const [scope, setScope] = useState<Scope>(goal?.scope || 'self')
  const [targetUserId, setTargetUserId] = useState(goal?.target_user_id || '')
  const [period, setPeriod] = useState<Period>(goal?.period || 'month')
  const [users, setUsers] = useState<{ id: string; name: string; role: string }[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const needsUserPicker = (scope === 'user') || (scope === 'team' && isAdmin)
  useEffect(() => {
    if (!needsUserPicker || users.length) return
    fetch(`${API}/pm/users`).then(r => r.ok ? r.json() : null).then(j => { if (j?.success) setUsers(j.data) }).catch(() => {})
  }, [needsUserPicker, users.length])

  const scopeOptions: { v: Scope; label: string }[] = [
    { v: 'self', label: 'Pessoal (eu)' },
    ...(isGestor ? [{ v: 'user' as Scope, label: 'Um usuário' }, { v: 'team' as Scope, label: 'Equipe' }] : []),
    ...(isAdmin ? [{ v: 'global' as Scope, label: 'Empresa (global)' }] : []),
  ]

  const submit = async () => {
    const tgt = Number(target)
    if (!(tgt > 0)) { setError('Defina um alvo maior que zero'); return }
    setBusy(true); setError(null)
    try {
      if (editMode) {
        const r = await fetch(`${API}/pm/goals/${goal!.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: title || null, target: tgt }) })
        const j = await r.json(); if (!j.success) throw new Error(j.error || 'Falha')
      } else {
        const win = computeWindow(period)
        const body: any = { title: title || null, metric, target: tgt, scope, period, period_start: win.start, period_end: win.end }
        if (scope === 'user') body.target_user_id = targetUserId
        if (scope === 'team') body.target_user_id = isAdmin ? targetUserId : actorId
        const r = await fetch(`${API}/pm/goals`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
        const j = await r.json(); if (!j.success) throw new Error(j.error || 'Falha')
      }
      onSaved()
    } catch (e: any) { setError(e.message); setBusy(false) }
  }

  return (
    <Modal isOpen onClose={onClose}>
      <div className="bg-white dark:!bg-[#243040] rounded-2xl w-full max-w-md shadow-2xl overflow-hidden">
        <div className="bg-gradient-to-r from-violet-500 to-indigo-600 px-5 py-3 flex items-center justify-between">
          <h3 className="text-white font-bold flex items-center gap-2"><Target className="w-4 h-4" /> {editMode ? 'Editar meta' : 'Nova meta'}</h3>
          <button onClick={onClose} className="text-white/80 hover:text-white"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-5 space-y-3">
          {error && <div className="text-sm text-red-600 dark:text-red-400">{error}</div>}
          <div>
            <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">Título (opcional)</label>
            <input value={title} onChange={e => setTitle(e.target.value)} placeholder={METRIC_META[metric].label}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 dark:text-gray-100 text-sm" />
          </div>
          {!editMode && (
            <div>
              <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">Indicador</label>
              <select value={metric} onChange={e => setMetric(e.target.value as Metric)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 dark:text-gray-100 text-sm">
                {(Object.keys(METRIC_META) as Metric[]).map(m => <option key={m} value={m}>{METRIC_META[m].label}</option>)}
              </select>
            </div>
          )}
          <div>
            <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">{METRIC_META[metric].targetLabel}</label>
            <input type="number" min={1} value={target} onChange={e => setTarget(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 dark:text-gray-100 text-sm" />
          </div>
          {!editMode && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">Escopo</label>
                  <select value={scope} onChange={e => setScope(e.target.value as Scope)}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 dark:text-gray-100 text-sm">
                    {scopeOptions.map(o => <option key={o.v} value={o.v}>{o.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">Período</label>
                  <select value={period} onChange={e => setPeriod(e.target.value as Period)}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 dark:text-gray-100 text-sm">
                    {(Object.keys(PERIOD_LABEL) as Period[]).map(p => <option key={p} value={p}>{PERIOD_LABEL[p]} atual</option>)}
                  </select>
                </div>
              </div>
              {needsUserPicker && (
                <div>
                  <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">{scope === 'team' ? 'Gerente da equipe' : 'Usuário'}</label>
                  <select value={targetUserId} onChange={e => setTargetUserId(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 dark:text-gray-100 text-sm">
                    <option value="">Selecione…</option>
                    {users.filter(u => scope !== 'team' || u.role === 'manager' || u.role === 'admin' || u.role === 'superadmin').map(u => <option key={u.id} value={u.id}>{u.name} ({u.role})</option>)}
                  </select>
                </div>
              )}
            </>
          )}
          <div className="flex justify-end gap-2 pt-1">
            <button onClick={onClose} className="px-4 py-2 rounded-xl bg-gray-100 dark:!bg-[#2d3f52] text-gray-700 dark:text-gray-200 text-sm font-medium">Cancelar</button>
            <button onClick={submit} disabled={busy || !target}
              className="px-4 py-2 rounded-xl bg-gradient-to-r from-violet-500 to-indigo-600 text-white text-sm font-semibold disabled:opacity-50 flex items-center gap-1.5">
              {busy && <Loader2 className="w-4 h-4 animate-spin" />} {editMode ? 'Salvar' : 'Criar meta'}
            </button>
          </div>
        </div>
      </div>
    </Modal>
  )
}

export default MetasGerenciamento
