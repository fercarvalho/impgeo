import React, { useCallback, useEffect, useState } from 'react'
import { Timer, Loader2, Play, Clock, Coffee, CheckCircle2, SkipForward, AlertTriangle, ShieldCheck, Check, X } from 'lucide-react'
import { usePermissions } from '@/hooks/usePermissions'
import {
  getStats, getConfig, updateConfig, useActiveSession,
  requestOverage, fetchPendingOverages, decideOverage, OverageRequest,
} from './_pm/pomodoroApi'
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
  const [pending, setPending] = useState<OverageRequest[] | null>(null) // null = não-gestor
  const [busyId, setBusyId] = useState<string | null>(null)
  const [reqBusy, setReqBusy] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [s, c] = await Promise.all([getStats(range), getConfig()])
      setStats(s); setConfig(c)
    } catch { /* noop */ } finally { setLoading(false) }
    // Fila de aprovação de excedente (gestor): 403 → não-gestor, esconde a seção.
    fetchPendingOverages().then(setPending).catch(() => setPending(null))
  }, [range])

  useEffect(() => { load() }, [load])

  const askApproval = async () => {
    setReqBusy(true)
    try { await requestOverage(); await load() } catch { /* noop */ } finally { setReqBusy(false) }
  }
  const decide = async (id: string, approved: boolean) => {
    setBusyId(id)
    try { await decideOverage(id, approved); await load() } catch { /* noop */ } finally { setBusyId(null) }
  }

  // Estado do excedente de hoje (para o card e o botão de solicitar).
  const worked = stats?.todayWorkedMinutes ?? 0
  const counted = stats?.todayActiveMinutes ?? 0
  const hard = stats?.hardMax ?? 500
  const overStatus = stats?.overageStatus as ('approved' | 'pending' | 'rejected' | null | undefined)
  const exempt = stats?.overageExempt === true   // gestor: não precisa de aprovação
  const needsApproval = !exempt && worked > hard && overStatus !== 'approved' && overStatus !== 'pending'

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
            <StatCard icon={Timer} label="Hoje (contabilizado / recom.)" value={`${counted}/${stats?.dailyLimit ?? 400}`} tone="violet" />
          </div>

          {/* Excedente do dia (recomendação + aprovação) */}
          {range === 'day' && worked > (stats?.recommendedMax ?? 480) && (
            <div className={`rounded-xl border p-4 text-sm ${
              exempt || overStatus === 'approved'
                ? 'border-green-200 dark:border-green-900 bg-green-50/50 dark:bg-green-900/10 text-green-800 dark:text-green-300'
                : 'border-amber-200 dark:border-amber-900 bg-amber-50/50 dark:bg-amber-900/10 text-amber-800 dark:text-amber-300'
            }`}>
              <div className="flex items-start gap-2">
                <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  Você trabalhou <strong>{worked} min</strong> hoje (recomendado: {stats?.recommendedMax ?? 480}, teto: {hard}).
                  {exempt && worked > hard && ' Tudo contabilizado — como gestor, seu tempo não precisa de aprovação. Lembre de descansar 😉'}
                  {!exempt && worked > hard && overStatus === 'approved' && ' Tempo extra aprovado — tudo contabilizado.'}
                  {!exempt && worked > hard && overStatus === 'pending' && ' Pedido de aprovação enviado, aguardando um gestor.'}
                  {!exempt && worked > hard && overStatus !== 'approved' && overStatus !== 'pending' && (
                    <> Acima de {hard} min, os <strong>{stats?.pendingMinutes ?? 0} min</strong> extras só contam após aprovação de um gestor.</>
                  )}
                </div>
                {needsApproval && (
                  <button onClick={askApproval} disabled={reqBusy}
                    className="flex-shrink-0 px-3 py-1.5 rounded-lg bg-violet-600 hover:bg-violet-700 text-white text-xs font-semibold disabled:opacity-50 flex items-center gap-1.5">
                    {reqBusy && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Solicitar aprovação
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Fila de aprovação (gestor) */}
          {pending && pending.length > 0 && (
            <section className="rounded-xl border border-violet-200 dark:border-violet-900 bg-violet-50/50 dark:bg-violet-900/10 p-4">
              <h2 className="text-sm font-semibold text-violet-700 dark:text-violet-300 mb-1 flex items-center gap-2">
                <ShieldCheck className="w-4 h-4" /> Aprovações de tempo extra ({pending.length})
              </h2>
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
                Estes colaboradores passaram do teto diário recomendado. O tempo acima do teto <strong>só é contabilizado se você aprovar</strong>.
              </p>
              <div className="space-y-2">
                {pending.map(o => (
                  <div key={o.id} className="flex items-center gap-3 bg-white dark:!bg-[#243040] rounded-lg px-3 py-2 border border-gray-200 dark:border-gray-700">
                    <div className="min-w-0 flex-1">
                      <div className="text-sm text-gray-800 dark:text-gray-100 truncate">{o.user_name} · <span className="text-gray-500">{o.worked_minutes} min hoje</span></div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">{o.justification ? <>Justificativa: {o.justification}</> : <em>Sem justificativa</em>}</div>
                    </div>
                    <button onClick={() => decide(o.id, true)} disabled={busyId === o.id} title="Aprovar"
                      className="p-1.5 rounded-lg bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400 hover:bg-green-100 disabled:opacity-50"><Check className="w-4 h-4" /></button>
                    <button onClick={() => decide(o.id, false)} disabled={busyId === o.id} title="Negar"
                      className="p-1.5 rounded-lg bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 hover:bg-red-100 disabled:opacity-50"><X className="w-4 h-4" /></button>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      ) : (
        <div className="max-w-md space-y-4">
          <div>
            <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">Limite diário recomendado (min ativos)</label>
            <input type="number" min={25} max={600} defaultValue={config?.daily_limit_minutes ?? 400}
              onBlur={e => saveConfig({ dailyLimitMinutes: Number(e.target.value) })}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 dark:text-gray-100" />
            <p className="text-xs text-gray-400 mt-1">Padrão 400 min. É só recomendação — não bloqueia. Acima de 20% (480) vem aviso; acima de 25% (500) o tempo extra precisa de aprovação de um gestor.</p>
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
