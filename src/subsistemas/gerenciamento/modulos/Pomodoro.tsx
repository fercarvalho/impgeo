import React, { useCallback, useEffect, useState } from 'react'
import { Timer, Loader2, Play, Clock, Coffee, CheckCircle2, SkipForward } from 'lucide-react'
import { usePermissions } from '@/hooks/usePermissions'
import { getStats, getConfig, updateConfig, useActiveSession } from './_pm/pomodoroApi'
import PomodoroStartModal from './_pm/PomodoroStartModal'

const Pomodoro: React.FC = () => {
  const permissions = usePermissions('pomodoro_gerenciamento')
  const { session } = useActiveSession()
  const [tab, setTab] = useState<'stats' | 'config'>('stats')
  const [range, setRange] = useState('day')
  const [stats, setStats] = useState<any>(null)
  const [config, setConfig] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [startOpen, setStartOpen] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [s, c] = await Promise.all([getStats(range), getConfig()])
      setStats(s); setConfig(c)
    } catch { /* noop */ } finally { setLoading(false) }
  }, [range])

  useEffect(() => { load() }, [load])

  const saveConfig = async (patch: any) => {
    setSaving(true)
    try { const c = await updateConfig(patch); setConfig(c) }
    catch { /* noop */ } finally { setSaving(false) }
  }

  const StatCard = ({ icon: Icon, label, value, tone }: any) => (
    <div className="p-4 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:!bg-[#243040]">
      <div className={`flex items-center gap-2 text-${tone}-500 mb-1`}><Icon className="w-4 h-4" /><span className="text-xs text-gray-500 dark:text-gray-400">{label}</span></div>
      <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">{value}</div>
    </div>
  )

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600 shadow-md shadow-violet-500/25">
            <Timer className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Pomodoro</h1>
            <p className="text-gray-500 dark:text-gray-400 text-sm">Controle de tempo e estatísticas de foco</p>
          </div>
        </div>
        {permissions.canEdit && !session && (
          <button onClick={() => setStartOpen(true)}
            className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-violet-500 to-indigo-600 text-white font-semibold rounded-xl hover:-translate-y-0.5 transition-all shadow-lg shadow-violet-500/25">
            <Play className="w-4 h-4" /> Iniciar foco livre
          </button>
        )}
      </div>

      <div className="flex gap-1 border-b border-gray-200 dark:border-gray-700">
        {(['stats', 'config'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${tab === t ? 'border-violet-500 text-violet-600 dark:text-violet-400' : 'border-transparent text-gray-500'}`}>
            {t === 'stats' ? 'Estatísticas' : 'Configurações'}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12 text-gray-400"><Loader2 className="w-6 h-6 animate-spin" /></div>
      ) : tab === 'stats' ? (
        <div className="space-y-4">
          <div className="flex gap-2">
            {[['day', 'Hoje'], ['week', '7 dias'], ['month', '30 dias']].map(([v, l]) => (
              <button key={v} onClick={() => setRange(v)}
                className={`px-3 py-1.5 rounded-lg text-sm ${range === v ? 'bg-violet-600 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300'}`}>{l}</button>
            ))}
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            <StatCard icon={Clock} label="Min. ativos" value={stats?.active_minutes ?? 0} tone="blue" />
            <StatCard icon={Coffee} label="Min. pausa" value={stats?.break_minutes ?? 0} tone="amber" />
            <StatCard icon={CheckCircle2} label="Ciclos completos" value={stats?.completed ?? 0} tone="green" />
            <StatCard icon={SkipForward} label="Pausas puladas" value={stats?.skipped_breaks ?? 0} tone="orange" />
            <StatCard icon={Timer} label="Hoje / limite" value={`${stats?.todayActiveMinutes ?? 0}/${stats?.dailyLimit ?? 400}`} tone="violet" />
          </div>
        </div>
      ) : (
        <div className="max-w-md space-y-4">
          <div>
            <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">Limite diário de minutos ativos</label>
            <input type="number" min={25} max={600} defaultValue={config?.daily_limit_minutes ?? 400}
              onBlur={e => saveConfig({ dailyLimitMinutes: Number(e.target.value) })}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 dark:text-gray-100" />
            <p className="text-xs text-gray-400 mt-1">Padrão: 400 minutos.</p>
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">Alerta de inatividade (minutos)</label>
            <input type="number" min={1} max={60} defaultValue={config?.idle_alert_minutes ?? 5}
              onBlur={e => saveConfig({ idleAlertMinutes: Number(e.target.value) })}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 dark:text-gray-100" />
          </div>
          <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
            <input type="checkbox" defaultChecked={config?.sound_enabled !== false}
              onChange={e => saveConfig({ soundEnabled: e.target.checked })} className="rounded" />
            Som ao trocar de fase
          </label>
          {saving && <p className="text-xs text-violet-500">Salvando…</p>}
        </div>
      )}

      {startOpen && <PomodoroStartModal onClose={() => setStartOpen(false)} onStarted={load} />}
    </div>
  )
}

export default Pomodoro
