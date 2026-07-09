// Editor dos DEFAULTS de notificação do sistema (melhoria #7). Diferente do
// NotificationPreferencesSection (que é por-usuário), aqui o admin define o
// PADRÃO aplicado a quem não personalizou — por escopo (impgeo/tc).
// Consome GET/PUT /api/admin/notification-defaults.

import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { Bell, Loader2 } from 'lucide-react'
import { labelFor } from '@/components/NotificationPreferencesSection'

type Channel = 'push' | 'email'
type Scope = 'impgeo' | 'tc'

interface DefaultRow {
  notification_type: string
  channel: Channel
  enabled: boolean
}

const NotificationDefaultsManagement: React.FC = () => {
  const [scope, setScope] = useState<Scope>('impgeo')
  const [rows, setRows] = useState<DefaultRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [savingKey, setSavingKey] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const r = await fetch(`/api/admin/notification-defaults?scope=${scope}`, { credentials: 'include' })
      const j = await r.json()
      if (!r.ok || !j.success) throw new Error(j.error || `HTTP ${r.status}`)
      setRows(j.data || [])
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [scope])

  useEffect(() => { load() }, [load])

  const toggle = async (type: string, channel: Channel, nextValue: boolean) => {
    const key = `${type}:${channel}`
    setSavingKey(key)
    const prev = rows
    setRows(arr => arr.map(r => r.notification_type === type && r.channel === channel ? { ...r, enabled: nextValue } : r))
    try {
      const r = await fetch('/api/admin/notification-defaults', {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scope, notification_type: type, channel, enabled: nextValue }),
      })
      const j = await r.json()
      if (!r.ok || !j.success) throw new Error(j.error || `HTTP ${r.status}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setRows(prev)
    } finally {
      setSavingKey(null)
    }
  }

  // Agrupa por tipo, ignorando os toggles _meta:* (comportamento de UI, não evento).
  const byType = useMemo(() => {
    const m = new Map<string, { push?: DefaultRow; email?: DefaultRow }>()
    for (const r of rows) {
      if (r.notification_type.startsWith('_meta:')) continue
      if (!m.has(r.notification_type)) m.set(r.notification_type, {})
      m.get(r.notification_type)![r.channel] = r
    }
    return Array.from(m.entries())
  }, [rows])

  const cell = (row: DefaultRow | undefined, type: string, channel: Channel) => {
    const key = `${type}:${channel}`
    const enabled = row ? row.enabled : false
    const saving = savingKey === key
    return (
      <button
        type="button"
        onClick={() => toggle(type, channel, !enabled)}
        disabled={saving}
        aria-pressed={enabled}
        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
          enabled ? 'bg-blue-600' : 'bg-gray-300 dark:bg-gray-600'
        } ${saving ? 'opacity-60 cursor-wait' : ''}`}
      >
        <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${enabled ? 'translate-x-6' : 'translate-x-1'}`} />
      </button>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Bell className="w-5 h-5 text-blue-600 dark:text-blue-400" />
        <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">Defaults de Notificação</h2>
      </div>
      <p className="text-sm text-gray-600 dark:text-gray-400">
        Define o <strong>padrão do sistema</strong> por tipo de evento — aplicado a quem ainda não
        personalizou as próprias preferências. Mudanças valem na hora, sem novo deploy.
      </p>

      {/* Seletor de escopo */}
      <div className="inline-flex rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
        {(['impgeo', 'tc'] as Scope[]).map(s => (
          <button
            key={s}
            type="button"
            onClick={() => setScope(s)}
            className={`px-4 py-1.5 text-sm font-medium transition-colors ${
              scope === s
                ? 'bg-blue-600 text-white'
                : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
            }`}
          >
            {s === 'impgeo' ? 'IMPGEO (interno)' : 'TerraControl (clientes)'}
          </button>
        ))}
      </div>

      {error && (
        <div className="text-xs text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded px-2 py-1">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
          <Loader2 className="w-4 h-4 animate-spin" /> Carregando defaults…
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-gray-200 dark:border-gray-700">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 dark:bg-gray-800">
              <tr>
                <th className="text-left px-3 py-2 font-semibold text-gray-700 dark:text-gray-300">Evento</th>
                <th className="px-3 py-2 font-semibold text-gray-700 dark:text-gray-300 w-20 text-center">Push</th>
                <th className="px-3 py-2 font-semibold text-gray-700 dark:text-gray-300 w-20 text-center">E-mail</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-700/50">
              {byType.map(([type, channels]) => {
                const lbl = labelFor(type)
                return (
                  <tr key={type} className="bg-white dark:bg-gray-900/30">
                    <td className="px-3 py-2 align-top">
                      <p className="font-medium text-gray-900 dark:text-gray-100">{lbl.title}</p>
                      {lbl.description && <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">{lbl.description}</p>}
                    </td>
                    <td className="px-3 py-2 text-center">{cell(channels.push, type, 'push')}</td>
                    <td className="px-3 py-2 text-center">{cell(channels.email, type, 'email')}</td>
                  </tr>
                )
              })}
              {byType.length === 0 && (
                <tr><td colSpan={3} className="px-3 py-6 text-center text-gray-500 dark:text-gray-400 text-sm">Nenhum tipo de notificação neste escopo.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

export default NotificationDefaultsManagement
