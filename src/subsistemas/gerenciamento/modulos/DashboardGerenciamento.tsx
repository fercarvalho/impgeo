import React, { useCallback, useEffect, useMemo, useState } from 'react'
import {
  LayoutDashboard, CheckCircle2, Activity, AlertTriangle, Timer, Target,
  FolderKanban, TrendingUp, CalendarClock, Loader2, AlertCircle, Trophy,
} from 'lucide-react'
import PendingTasksBanner from './_pm/PendingTasksBanner'
import {
  StatCard, ChartShell, Donut, DonutLegend, Bars, AreaTrend, ProgressBar,
  STATUS_COLORS, STATUS_LABELS, fmtNum, fmtMin,
} from './_pm/charts'

const API = '/api'

interface DashUpcoming { id: string; name: string; status: string; due_date: string | null; project_name?: string; stage_name?: string }
interface DashData {
  role: string
  isGestor: boolean
  personal: {
    kpis: { open: number; in_progress: number; available: number; overdue: number; completed_period: number; focus_minutes: number; on_time_pct: number | null }
    by_status: Record<string, number>
    completions_by_day: { day: string; value: number }[]
    focus_by_day: { day: string; value: number }[]
    upcoming: DashUpcoming[]
  }
  global?: {
    kpis: { active_projects: number; completed_projects: number; overdue_tasks: number; throughput: number }
    throughput_by_day: { day: string; value: number }[]
    projects_health: { project_id: string; name: string; status: string; progress_pct: number; overdue_count: number; days_to_deadline: number | null; total_cents?: number; profit_cents?: number }[]
    top_users: { user_id: string; name: string; completed: number; overdue: number; open_tasks: number; active_minutes: number }[]
  }
}

const todayISO = () => new Date().toISOString().slice(0, 10)
const daysAgoISO = (n: number) => { const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10) }
const fmtDate = (v?: string | null) => { if (!v) return '—'; const [y, m, d] = String(v).slice(0, 10).split('-'); return d ? `${d}/${m}/${y}` : v }

const PRESETS = [{ k: '7', label: '7 dias' }, { k: '30', label: '30 dias' }, { k: '90', label: '90 dias' }]

const DashboardGerenciamento: React.FC = () => {
  const [period, setPeriod] = useState('30')
  const [data, setData] = useState<DashData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const { from, to } = useMemo(() => ({ from: daysAgoISO(Number(period)), to: todayISO() }), [period])

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const r = await fetch(`${API}/pm/dashboard?from=${from}&to=${to}`)
      const j = await r.json()
      if (!j.success) throw new Error(j.error || 'Falha ao carregar')
      setData(j.data)
    } catch (e: any) { setError(e.message || 'Erro ao carregar o painel') }
    finally { setLoading(false) }
  }, [from, to])

  useEffect(() => { load() }, [load])

  const statusDonut = useMemo(() => {
    const bs = data?.personal.by_status || {}
    return Object.keys(bs)
      .filter(k => k !== 'canceled' && k !== 'refused')
      .map(k => ({ name: STATUS_LABELS[k] || k, value: bs[k], color: STATUS_COLORS[k] || '#94a3b8' }))
      .sort((a, b) => b.value - a.value)
  }, [data])
  const totalTasks = useMemo(() => statusDonut.reduce((a, d) => a + d.value, 0), [statusDonut])

  return (
    <div className="space-y-6">
      {/* Header + filtro de período */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600 shadow-md shadow-violet-500/25">
            <LayoutDashboard className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Dashboard</h1>
            <p className="text-gray-500 dark:text-gray-400 text-sm">Suas tarefas, seu tempo e o panorama dos projetos</p>
          </div>
        </div>
        <div className="inline-flex rounded-xl bg-gray-100 dark:bg-[#243040] p-1 self-start">
          {PRESETS.map(p => (
            <button key={p.k} onClick={() => setPeriod(p.k)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${period === p.k ? 'bg-white dark:bg-violet-600 text-violet-700 dark:text-white shadow-sm' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700'}`}>
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div role="alert" className="flex items-center gap-2 px-3 py-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl text-red-700 dark:text-red-400 text-sm">
          <AlertCircle className="w-4 h-4" /> {error}
        </div>
      )}

      <PendingTasksBanner onChanged={load} />

      {loading || !data ? (
        <div className="flex items-center justify-center py-20 text-gray-400"><Loader2 className="w-7 h-7 animate-spin" /></div>
      ) : (
        <>
          {/* ── Visão pessoal ── */}
          <section className="space-y-4">
            <h2 className="text-xs font-bold uppercase tracking-wide text-gray-400 dark:text-gray-500">Minha produtividade</h2>
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 sm:gap-4">
              <StatCard icon={<CheckCircle2 className="w-4 h-4" />} label="Concluídas" value={fmtNum(data.personal.kpis.completed_period)} sub={`últimos ${period} dias`} gradient="from-emerald-500 to-green-600" />
              <StatCard icon={<Activity className="w-4 h-4" />} label="Em andamento" value={fmtNum(data.personal.kpis.in_progress)} gradient="from-amber-500 to-orange-500" />
              <StatCard icon={<AlertTriangle className="w-4 h-4" />} label="Atrasadas" value={fmtNum(data.personal.kpis.overdue)} gradient="from-rose-500 to-red-500" />
              <StatCard icon={<Target className="w-4 h-4" />} label="No prazo" value={data.personal.kpis.on_time_pct == null ? '—' : `${data.personal.kpis.on_time_pct}%`} progress={data.personal.kpis.on_time_pct} gradient="from-sky-500 to-blue-600" />
              <StatCard icon={<Timer className="w-4 h-4" />} label="Foco" value={fmtMin(data.personal.kpis.focus_minutes)} sub={`últimos ${period} dias`} gradient="from-violet-500 to-indigo-600" />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <ChartShell title="Minhas tarefas por status">
                <Donut data={statusDonut} centerValue={totalTasks} centerLabel="tarefas" />
                <DonutLegend data={statusDonut} />
              </ChartShell>
              <ChartShell title="Concluídas por dia" className="lg:col-span-2">
                <AreaTrend data={data.personal.completions_by_day} xKey="day" yKey="value" color="#10b981" />
              </ChartShell>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <ChartShell title="Foco por dia" subtitle="minutos ativos no Pomodoro" className="lg:col-span-2">
                <AreaTrend data={data.personal.focus_by_day} xKey="day" yKey="value" color="#6366f1" suffix="min" />
              </ChartShell>
              <ChartShell title="A vencer / atrasadas">
                {data.personal.upcoming.length === 0 ? (
                  <div className="py-10 text-center text-sm text-gray-400 dark:text-gray-500">Nada com prazo por aqui 🎉</div>
                ) : (
                  <div className="divide-y divide-gray-100 dark:divide-gray-700 -my-1">
                    {data.personal.upcoming.map(t => (
                      <div key={t.id} className="py-2 flex items-center gap-2">
                        <CalendarClock className={`w-4 h-4 flex-shrink-0 ${t.status === 'overdue' ? 'text-rose-500' : 'text-gray-400'}`} />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm text-gray-800 dark:text-gray-100 truncate">{t.name}</p>
                          <p className="text-xs text-gray-400 truncate">{t.project_name}</p>
                        </div>
                        <span className={`text-xs font-medium ${t.status === 'overdue' ? 'text-rose-500' : 'text-gray-500 dark:text-gray-400'}`}>{fmtDate(t.due_date)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </ChartShell>
            </div>
          </section>

          {/* ── Visão de gestão ── */}
          {data.isGestor && data.global && (
            <section className="space-y-4 pt-2">
              <h2 className="text-xs font-bold uppercase tracking-wide text-gray-400 dark:text-gray-500">Visão geral {data.role === 'manager' ? '(minha equipe)' : '(todos os projetos)'}</h2>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
                <StatCard icon={<FolderKanban className="w-4 h-4" />} label="Projetos ativos" value={fmtNum(data.global.kpis.active_projects)} gradient="from-violet-500 to-purple-600" />
                <StatCard icon={<CheckCircle2 className="w-4 h-4" />} label="Projetos concluídos" value={fmtNum(data.global.kpis.completed_projects)} sub={`últimos ${period} dias`} gradient="from-emerald-500 to-teal-600" />
                <StatCard icon={<TrendingUp className="w-4 h-4" />} label="Tarefas concluídas" value={fmtNum(data.global.kpis.throughput)} sub={`últimos ${period} dias`} gradient="from-sky-500 to-cyan-600" />
                <StatCard icon={<AlertTriangle className="w-4 h-4" />} label="Tarefas atrasadas" value={fmtNum(data.global.kpis.overdue_tasks)} gradient="from-rose-500 to-red-500" />
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <ChartShell title="Conclusões por dia" subtitle="throughput da operação">
                  <AreaTrend data={data.global.throughput_by_day} xKey="day" yKey="value" color="#0ea5e9" />
                </ChartShell>
                <ChartShell title="Ranking de produtividade" subtitle="tarefas concluídas por pessoa" right={<Trophy className="w-4 h-4 text-amber-400" />}>
                  {data.global.top_users.filter(u => u.completed > 0).length === 0 ? (
                    <div className="py-12 text-center text-sm text-gray-400">Sem conclusões no período</div>
                  ) : (
                    <Bars layout="vertical" data={data.global.top_users.filter(u => u.completed > 0).slice(0, 7).map(u => ({ name: u.name, completed: u.completed }))} xKey="name" yKey="completed" color="#8b5cf6" height={Math.max(160, data.global.top_users.filter(u => u.completed > 0).slice(0, 7).length * 34)} />
                  )}
                </ChartShell>
              </div>

              <ChartShell title="Saúde dos projetos" subtitle="progresso e atrasos" right={<FolderKanban className="w-4 h-4 text-gray-400" />}>
                {data.global.projects_health.length === 0 ? (
                  <div className="py-10 text-center text-sm text-gray-400">Nenhum projeto</div>
                ) : (
                  <div className="space-y-3">
                    {data.global.projects_health.map(p => (
                      <div key={p.project_id} className="flex items-center gap-3">
                        <div className="min-w-0 w-40 sm:w-52">
                          <p className="text-sm text-gray-800 dark:text-gray-100 truncate">{p.name}</p>
                          <p className="text-xs text-gray-400">
                            {p.status}
                            {p.overdue_count > 0 && <span className="text-rose-500"> · {p.overdue_count} atrasada(s)</span>}
                            {p.days_to_deadline != null && <span> · {p.days_to_deadline < 0 ? `${-p.days_to_deadline}d vencido` : `${p.days_to_deadline}d`}</span>}
                          </p>
                        </div>
                        <div className="flex-1"><ProgressBar pct={Number(p.progress_pct)} color={p.overdue_count > 0 ? 'bg-rose-500' : 'bg-emerald-500'} /></div>
                        <span className="text-xs font-semibold text-gray-700 dark:text-gray-200 w-10 text-right">{Math.round(Number(p.progress_pct))}%</span>
                      </div>
                    ))}
                  </div>
                )}
              </ChartShell>
            </section>
          )}
        </>
      )}
    </div>
  )
}

export default DashboardGerenciamento
