import React, { useEffect, useState } from 'react'
import { Mail, Loader2 } from 'lucide-react'

// Painel de opt-in dos relatórios administrativos por e-mail (PM Fase 7).
// Renderizado dentro das preferências de notificação (scope impgeo). Para
// não-gestores o backend retorna 403 → o painel se esconde.
const FREqS: { value: string; label: string }[] = [
  { value: 'daily', label: 'Diário' },
  { value: 'weekly', label: 'Semanal' },
  { value: 'monthly', label: 'Mensal' },
  { value: 'quarterly', label: 'Trimestral' },
  { value: 'yearly', label: 'Anual' },
]

const PmEmailReportsPanel: React.FC = () => {
  const [visible, setVisible] = useState(true)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [emailReports, setEmailReports] = useState(false)
  const [frequencies, setFrequencies] = useState<string[]>([])

  useEffect(() => {
    fetch('/api/me/pm-email-prefs')
      .then(r => { if (r.status === 403) { setVisible(false); return null } return r.json() })
      .then(j => { if (j?.success) { setEmailReports(j.data.emailReports); setFrequencies(j.data.frequencies || []) } })
      .catch(() => setVisible(false))
      .finally(() => setLoading(false))
  }, [])

  const save = async (next: { emailReports?: boolean; frequencies?: string[] }) => {
    const body = { emailReports: next.emailReports ?? emailReports, frequencies: next.frequencies ?? frequencies }
    setSaving(true)
    try {
      const r = await fetch('/api/me/pm-email-prefs', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const j = await r.json()
      if (j.success) { setEmailReports(j.data.emailReports); setFrequencies(j.data.frequencies) }
    } catch { /* noop */ } finally { setSaving(false) }
  }

  const toggleFreq = (f: string) => {
    const next = frequencies.includes(f) ? frequencies.filter(x => x !== f) : [...frequencies, f]
    setFrequencies(next); save({ frequencies: next })
  }

  if (!visible) return null
  if (loading) return null

  return (
    <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-3 space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Mail className="w-4 h-4 text-violet-600 dark:text-violet-400" />
          <span className="text-sm font-semibold text-gray-800 dark:text-gray-100">Relatórios por e-mail (gestão)</span>
          {saving && <Loader2 className="w-3.5 h-3.5 animate-spin text-gray-400" />}
        </div>
        <label className="inline-flex items-center cursor-pointer">
          <input type="checkbox" checked={emailReports} onChange={e => save({ emailReports: e.target.checked })} className="sr-only peer" />
          <div className="relative w-10 h-5 bg-gray-200 peer-checked:bg-violet-600 rounded-full transition-colors after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:after:translate-x-5"></div>
        </label>
      </div>
      <p className="text-xs text-gray-500 dark:text-gray-400">Receba resumos de produtividade e tempo por e-mail nas frequências escolhidas.</p>
      {emailReports && (
        <div className="flex flex-wrap gap-2 pt-1">
          {FREqS.map(f => (
            <button key={f.value} onClick={() => toggleFreq(f.value)}
              className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
                frequencies.includes(f.value)
                  ? 'bg-violet-600 text-white'
                  : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200'
              }`}>
              {f.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export default PmEmailReportsPanel
