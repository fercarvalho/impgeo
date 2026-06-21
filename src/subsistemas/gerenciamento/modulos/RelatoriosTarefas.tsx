import React, { useCallback, useEffect, useState } from 'react'
import { BarChart3, Loader2, Download, Users, FolderKanban, AlertTriangle, Users2, FileText, ChevronRight, ChevronDown } from 'lucide-react'
import { usePermissions } from '@/hooks/usePermissions'

const API = '/api'

interface ProjBreakdown { project_id: string; project_name: string; completed: number; overdue: number; open_tasks: number; active_minutes: number }
interface ProdRow { user_id: string; name: string; completed: number; overdue: number; open_tasks: number; active_minutes: number; projects?: ProjBreakdown[] }
interface HealthRow { project_id: string; name: string; status: string; progress_pct: number; total_cents: number; expenses_cents: number; profit_cents: number; days_to_deadline: number | null; overdue_count: number }
interface TeamRow { manager_id: string; manager_name: string; manager_role?: string; members: ProdRow[]; totals: { completed: number; overdue: number; open_tasks: number; active_minutes: number } }

const fmtBRL = (cents: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format((cents || 0) / 100)

function todayISO() { return new Date().toISOString().slice(0, 10) }
function daysAgoISO(n: number) { const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10) }

const RelatoriosTarefas: React.FC = () => {
  const permissions = usePermissions('relatorios_tarefas_gerenciamento')
  const [tab, setTab] = useState<'productivity' | 'health' | 'teams'>('productivity')
  const [from, setFrom] = useState(daysAgoISO(30))
  const [to, setTo] = useState(todayISO())
  const [prod, setProd] = useState<ProdRow[]>([])
  const [health, setHealth] = useState<HealthRow[]>([])
  const [teams, setTeams] = useState<TeamRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  // Membros expandidos na aba Equipes — chave `${manager_id}:${user_id}`.
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const toggleMember = (key: string) => setExpanded(prev => {
    const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n
  })

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      if (tab === 'productivity') {
        const r = await fetch(`${API}/pm/reports/productivity?from=${from}&to=${to}`)
        const j = await r.json(); if (!j.success) throw new Error(j.error); setProd(j.data)
      } else if (tab === 'teams') {
        const r = await fetch(`${API}/pm/reports/teams?from=${from}&to=${to}`)
        const j = await r.json(); if (!j.success) throw new Error(j.error); setTeams(j.data)
      } else {
        const r = await fetch(`${API}/pm/reports/projects-health`)
        const j = await r.json(); if (!j.success) throw new Error(j.error); setHealth(j.data)
      }
    } catch (e: any) { setError(e.message || 'Falha ao carregar relatório') }
    finally { setLoading(false) }
  }, [tab, from, to])

  useEffect(() => { load() }, [load])

  if (!permissions.canView) {
    return <div className="text-sm text-gray-500 dark:text-gray-400">Você não tem acesso aos relatórios consolidados.</div>
  }

  const exportXlsx = () => { window.open(`${API}/pm/reports/export?from=${from}&to=${to}`, '_blank') }
  const exportPdf = () => { window.open(`${API}/pm/reports/export-pdf?from=${from}&to=${to}`, '_blank') }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600 shadow-md shadow-violet-500/25">
            <BarChart3 className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Relatórios de Tarefas</h1>
            <p className="text-gray-500 dark:text-gray-400 text-sm">Produtividade da equipe e saúde dos projetos</p>
          </div>
        </div>
        {tab === 'productivity' && (
          <div className="flex gap-2">
            <button onClick={exportXlsx} className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 text-sm font-medium hover:bg-gray-200">
              <Download className="w-4 h-4" /> XLSX
            </button>
            <button onClick={exportPdf} className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 text-sm font-medium hover:bg-gray-200">
              <FileText className="w-4 h-4" /> PDF
            </button>
          </div>
        )}
      </div>

      <div className="flex gap-1 border-b border-gray-200 dark:border-gray-700">
        {([['productivity', 'Produtividade', Users], ['teams', 'Equipes', Users2], ['health', 'Saúde dos projetos', FolderKanban]] as const).map(([k, label, Icon]) => (
          <button key={k} onClick={() => setTab(k)}
            className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium border-b-2 -mb-px ${tab === k ? 'border-violet-500 text-violet-600 dark:text-violet-400' : 'border-transparent text-gray-500'}`}>
            <Icon className="w-4 h-4" /> {label}
          </button>
        ))}
      </div>

      {tab !== 'health' && (
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">De</label>
            <input type="date" value={from} onChange={e => setFrom(e.target.value)} className="px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 dark:text-gray-100 text-sm" />
          </div>
          <div>
            <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Até</label>
            <input type="date" value={to} onChange={e => setTo(e.target.value)} className="px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 dark:text-gray-100 text-sm" />
          </div>
          <div className="flex gap-1">
            {[['7d', 7], ['30d', 30], ['90d', 90]].map(([l, n]) => (
              <button key={l as string} onClick={() => { setFrom(daysAgoISO(n as number)); setTo(todayISO()) }}
                className="px-2.5 py-1.5 rounded-lg text-xs bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200">{l}</button>
            ))}
          </div>
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 text-sm text-red-600 dark:text-red-400"><AlertTriangle className="w-4 h-4" />{error}</div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-12 text-gray-400"><Loader2 className="w-6 h-6 animate-spin" /></div>
      ) : tab === 'productivity' ? (
        <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-700">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 dark:bg-[#2d3f52] text-gray-600 dark:text-gray-300">
              <tr>
                <th className="text-left px-4 py-2 font-semibold">Usuário</th>
                <th className="text-right px-4 py-2 font-semibold">Concluídas</th>
                <th className="text-right px-4 py-2 font-semibold">Atrasadas</th>
                <th className="text-right px-4 py-2 font-semibold">Abertas</th>
                <th className="text-right px-4 py-2 font-semibold">Min. ativos</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
              {prod.length === 0 && <tr><td colSpan={5} className="px-4 py-6 text-center text-gray-400">Sem dados no período.</td></tr>}
              {prod.map(r => (
                <tr key={r.user_id} className="text-gray-800 dark:text-gray-100">
                  <td className="px-4 py-2">{r.name}</td>
                  <td className="px-4 py-2 text-right">{r.completed}</td>
                  <td className="px-4 py-2 text-right text-red-600 dark:text-red-400">{r.overdue}</td>
                  <td className="px-4 py-2 text-right">{r.open_tasks}</td>
                  <td className="px-4 py-2 text-right">{r.active_minutes}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : tab === 'teams' ? (
        <div className="space-y-4">
          {teams.length > 0 && <p className="text-xs text-gray-400">Clique num membro para ver o detalhamento por projeto. Min. por projeto = tempo creditado às tarefas; o total do membro é o foco no Pomodoro no período.</p>}
          {teams.length === 0 && <div className="text-center py-8 text-gray-400 text-sm">Nenhuma equipe (sem gerentes ou sem membros no período).</div>}
          {teams.map(team => (
            <div key={team.manager_id} className="rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
              <div className="bg-gray-50 dark:bg-[#2d3f52] px-4 py-2.5 flex items-center gap-2">
                <div className="w-7 h-7 rounded-full bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">{(team.manager_name || '?').charAt(0).toUpperCase()}</div>
                <span className="font-semibold text-gray-800 dark:text-gray-100 flex-1 truncate">
                  Equipe de {team.manager_name}
                  {team.manager_role && team.manager_role !== 'manager' && (
                    <span className="ml-2 align-middle text-[10px] font-medium uppercase tracking-wide px-1.5 py-0.5 rounded bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300">{team.manager_role}</span>
                  )}
                </span>
                <span className="text-xs text-gray-500 dark:text-gray-400">{team.members.length} membro(s) · {team.totals.completed} concl. · <span className="text-red-500">{team.totals.overdue} atras.</span> · {team.totals.active_minutes} min</span>
              </div>
              {team.members.length === 0 ? (
                <p className="px-4 py-3 text-xs text-gray-400">Sem membros no período.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead className="text-gray-500 dark:text-gray-400">
                    <tr>
                      <th className="text-left px-4 py-1.5 font-medium">Membro</th>
                      <th className="text-right px-4 py-1.5 font-medium">Concluídas</th>
                      <th className="text-right px-4 py-1.5 font-medium">Atrasadas</th>
                      <th className="text-right px-4 py-1.5 font-medium">Abertas</th>
                      <th className="text-right px-4 py-1.5 font-medium">Min. ativos</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                    {team.members.map(m => {
                      const key = `${team.manager_id}:${m.user_id}`
                      const hasProjects = !!(m.projects && m.projects.length)
                      const isOpen = expanded.has(key)
                      return (
                        <React.Fragment key={m.user_id}>
                          <tr
                            className={`text-gray-800 dark:text-gray-100 ${hasProjects ? 'cursor-pointer hover:bg-gray-50 dark:hover:bg-[#2d3f52]/50' : ''}`}
                            onClick={() => hasProjects && toggleMember(key)}
                          >
                            <td className="px-4 py-1.5">
                              <span className="inline-flex items-center gap-1.5">
                                {hasProjects
                                  ? (isOpen ? <ChevronDown className="w-3.5 h-3.5 text-gray-400" /> : <ChevronRight className="w-3.5 h-3.5 text-gray-400" />)
                                  : <span className="w-3.5 h-3.5 inline-block" />}
                                {m.name}
                                {hasProjects && <span className="text-xs text-gray-400">({m.projects!.length} proj.)</span>}
                              </span>
                            </td>
                            <td className="px-4 py-1.5 text-right">{m.completed}</td>
                            <td className="px-4 py-1.5 text-right text-red-600 dark:text-red-400">{m.overdue}</td>
                            <td className="px-4 py-1.5 text-right">{m.open_tasks}</td>
                            <td className="px-4 py-1.5 text-right">{m.active_minutes}</td>
                          </tr>
                          {isOpen && m.projects!.map(p => (
                            <tr key={`${m.user_id}:${p.project_id}`} className="text-gray-600 dark:text-gray-300 bg-gray-50/60 dark:bg-[#2d3f52]/30">
                              <td className="pl-10 pr-4 py-1 text-xs truncate flex items-center gap-1.5">
                                <FolderKanban className="w-3 h-3 text-violet-400 flex-shrink-0" />{p.project_name}
                              </td>
                              <td className="px-4 py-1 text-right text-xs">{p.completed}</td>
                              <td className="px-4 py-1 text-right text-xs text-red-500/80">{p.overdue}</td>
                              <td className="px-4 py-1 text-right text-xs">{p.open_tasks}</td>
                              <td className="px-4 py-1 text-right text-xs">{p.active_minutes}</td>
                            </tr>
                          ))}
                        </React.Fragment>
                      )
                    })}
                  </tbody>
                </table>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-700">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 dark:bg-[#2d3f52] text-gray-600 dark:text-gray-300">
              <tr>
                <th className="text-left px-4 py-2 font-semibold">Projeto</th>
                <th className="text-left px-4 py-2 font-semibold">Status</th>
                <th className="text-right px-4 py-2 font-semibold">Progresso</th>
                <th className="text-right px-4 py-2 font-semibold">Custo</th>
                <th className="text-right px-4 py-2 font-semibold">Resultado</th>
                <th className="text-right px-4 py-2 font-semibold">Atrasadas</th>
                <th className="text-right px-4 py-2 font-semibold">Prazo (dias)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
              {health.length === 0 && <tr><td colSpan={7} className="px-4 py-6 text-center text-gray-400">Sem projetos.</td></tr>}
              {health.map(r => (
                <tr key={r.project_id} className="text-gray-800 dark:text-gray-100">
                  <td className="px-4 py-2">{r.name}</td>
                  <td className="px-4 py-2">{r.status}</td>
                  <td className="px-4 py-2 text-right">{Math.round(r.progress_pct || 0)}%</td>
                  <td className="px-4 py-2 text-right text-red-600 dark:text-red-400">{fmtBRL(r.expenses_cents)}</td>
                  <td className={`px-4 py-2 text-right ${(r.profit_cents || 0) >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>{fmtBRL(r.profit_cents)}</td>
                  <td className="px-4 py-2 text-right">{r.overdue_count}</td>
                  <td className="px-4 py-2 text-right">{r.days_to_deadline ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

export default RelatoriosTarefas
