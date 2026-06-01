import React, { useCallback, useEffect, useState } from 'react'
import { BarChart3, Loader2, Download, Users, FolderKanban, AlertTriangle } from 'lucide-react'
import { usePermissions } from '@/hooks/usePermissions'

const API = '/api'

interface ProdRow { user_id: string; name: string; completed: number; overdue: number; open_tasks: number; active_minutes: number }
interface HealthRow { project_id: string; name: string; status: string; progress_pct: number; total_cents: number; expenses_cents: number; profit_cents: number; days_to_deadline: number | null; overdue_count: number }

const fmtBRL = (cents: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format((cents || 0) / 100)

function todayISO() { return new Date().toISOString().slice(0, 10) }
function daysAgoISO(n: number) { const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10) }

const RelatoriosTarefas: React.FC = () => {
  const permissions = usePermissions('relatorios_tarefas_gerenciamento')
  const [tab, setTab] = useState<'productivity' | 'health'>('productivity')
  const [from, setFrom] = useState(daysAgoISO(30))
  const [to, setTo] = useState(todayISO())
  const [prod, setProd] = useState<ProdRow[]>([])
  const [health, setHealth] = useState<HealthRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      if (tab === 'productivity') {
        const r = await fetch(`${API}/pm/reports/productivity?from=${from}&to=${to}`)
        const j = await r.json(); if (!j.success) throw new Error(j.error); setProd(j.data)
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
          <button onClick={exportXlsx} className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 text-sm font-medium hover:bg-gray-200">
            <Download className="w-4 h-4" /> Exportar XLSX
          </button>
        )}
      </div>

      <div className="flex gap-1 border-b border-gray-200 dark:border-gray-700">
        {([['productivity', 'Produtividade', Users], ['health', 'Saúde dos projetos', FolderKanban]] as const).map(([k, label, Icon]) => (
          <button key={k} onClick={() => setTab(k)}
            className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium border-b-2 -mb-px ${tab === k ? 'border-violet-500 text-violet-600 dark:text-violet-400' : 'border-transparent text-gray-500'}`}>
            <Icon className="w-4 h-4" /> {label}
          </button>
        ))}
      </div>

      {tab === 'productivity' && (
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
