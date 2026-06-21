import React from 'react'
import {
  ResponsiveContainer, PieChart, Pie, Cell, BarChart, Bar, AreaChart, Area,
  XAxis, YAxis, CartesianGrid, Tooltip,
} from 'recharts'

// ─── Wrappers de gráfico/cards do PM (recharts + dark mode) ──────────────────
// Usados no Dashboard e nas Metas do Gerenciamento. Mantém o visual rico do
// Financeiro mas com suporte a tema escuro e cores semânticas de status.

export const fmtNum = (n: number | null | undefined) => (Number(n) || 0).toLocaleString('pt-BR')
export const fmtMin = (m: number | null | undefined) => {
  const v = Math.max(0, Math.round(Number(m) || 0))
  const h = Math.floor(v / 60), mm = v % 60
  return h ? `${h}h${mm ? ` ${mm}min` : ''}` : `${mm}min`
}
export const fmtDay = (d: string) => {
  const [, m, day] = String(d).slice(0, 10).split('-')
  return day ? `${day}/${m}` : String(d)
}

export const STATUS_COLORS: Record<string, string> = {
  completed: '#10b981', in_progress: '#f59e0b', available: '#0ea5e9', overdue: '#f43f5e',
  pending_acceptance: '#a78bfa', pending_review: '#8b5cf6', pending_adjustment: '#fb923c',
  refused: '#9ca3af', canceled: '#6b7280', pending: '#cbd5e1',
}
export const STATUS_LABELS: Record<string, string> = {
  completed: 'Concluídas', in_progress: 'Em andamento', available: 'Disponíveis', overdue: 'Atrasadas',
  pending_acceptance: 'Aguard. aceite', pending_review: 'Em revisão', pending_adjustment: 'Em ajuste',
  refused: 'Recusadas', canceled: 'Canceladas', pending: 'Pendentes',
}

// ─── KPI card em gradiente (estilo dos cards grandes do Financeiro) ───────────
export const StatCard: React.FC<{
  icon: React.ReactNode
  label: string
  value: React.ReactNode
  sub?: React.ReactNode
  gradient: string // ex.: 'from-emerald-500 to-green-600'
  progress?: number | null // 0..100
}> = ({ icon, label, value, sub, gradient, progress }) => (
  <div className={`bg-gradient-to-br ${gradient} rounded-2xl shadow-lg p-5 text-white hover:-translate-y-1 hover:shadow-xl transition-all duration-200`}>
    <div className="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center mb-3">{icon}</div>
    <p className="text-3xl font-bold leading-none">{value}</p>
    <p className="text-xs font-semibold text-white/80 uppercase tracking-wide mt-1.5 truncate">{label}</p>
    {sub != null && <p className="text-xs text-white/70 mt-0.5">{sub}</p>}
    {progress != null && (
      <div className="mt-2.5 h-1.5 bg-white/25 rounded-full overflow-hidden">
        <div className="h-full bg-white rounded-full transition-all duration-500" style={{ width: `${Math.max(0, Math.min(100, progress))}%` }} />
      </div>
    )}
  </div>
)

// ─── Painel de seção com fundo tingido (estilo Financeiro) ────────────────────
export const SectionPanel: React.FC<{
  title: string
  icon: React.ReactNode
  tint: string // ex.: 'violet' | 'cyan'
  right?: React.ReactNode
  children: React.ReactNode
}> = ({ title, icon, tint, right, children }) => {
  const tints: Record<string, string> = {
    violet: 'from-violet-50/60 to-indigo-50/40 dark:from-violet-900/20 dark:to-indigo-900/10 border-violet-100 dark:border-violet-900/30',
    cyan: 'from-cyan-50/60 to-sky-50/40 dark:from-cyan-900/20 dark:to-sky-900/10 border-cyan-100 dark:border-cyan-900/30',
    emerald: 'from-emerald-50/60 to-green-50/40 dark:from-emerald-900/20 dark:to-green-900/10 border-emerald-100 dark:border-emerald-900/30',
  }
  return (
    <div className={`bg-gradient-to-br ${tints[tint] || tints.violet} rounded-2xl p-4 sm:p-5 border space-y-4`}>
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-xl sm:text-2xl font-bold text-gray-800 dark:text-gray-100 flex items-center gap-2.5">{icon} {title}</h2>
        {right}
      </div>
      {children}
    </div>
  )
}

// ─── Card-moldura para gráficos ───────────────────────────────────────────────
export const ChartShell: React.FC<{
  title: string
  subtitle?: string
  right?: React.ReactNode
  children: React.ReactNode
  className?: string
}> = ({ title, subtitle, right, children, className }) => (
  <div className={`bg-white dark:!bg-[#243040] rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden ${className || ''}`}>
    <div className="px-4 sm:px-5 py-3 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between gap-2">
      <div className="min-w-0">
        <h3 className="text-sm font-bold text-gray-800 dark:text-gray-100 truncate">{title}</h3>
        {subtitle && <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{subtitle}</p>}
      </div>
      {right}
    </div>
    <div className="p-3 sm:p-4">{children}</div>
  </div>
)

// Tooltip enxuto com dark mode.
const TT: React.FC<any> = ({ active, payload, label, suffix }) => {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-white dark:bg-gray-800 px-3 py-2 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 text-xs">
      {label != null && <p className="font-semibold text-gray-700 dark:text-gray-200 mb-1">{typeof label === 'string' && label.includes('-') ? fmtDay(label) : label}</p>}
      {payload.map((p: any, i: number) => (
        <div key={i} className="flex items-center gap-2">
          <span className="inline-block w-2 h-2 rounded-full" style={{ background: p.color || p.fill || p.payload?.fill }} />
          <span className="text-gray-600 dark:text-gray-300">{p.name}:</span>
          <span className="font-semibold text-gray-800 dark:text-gray-100">{fmtNum(p.value)}{suffix || ''}</span>
        </div>
      ))}
    </div>
  )
}

const EmptyChart: React.FC<{ height: number; msg?: string }> = ({ height, msg }) => (
  <div className="w-full flex items-center justify-center text-sm text-gray-400 dark:text-gray-500" style={{ height }}>
    {msg || 'Sem dados no período'}
  </div>
)

// ─── Donut (distribuição) ─────────────────────────────────────────────────────
export const Donut: React.FC<{
  data: { name: string; value: number; color: string }[]
  height?: number
  centerLabel?: string
  centerValue?: React.ReactNode
}> = ({ data, height = 220, centerLabel, centerValue }) => {
  const items = (data || []).filter(d => d.value > 0)
  const total = items.reduce((a, d) => a + d.value, 0)
  if (!total) return <EmptyChart height={height} msg="Nenhuma tarefa" />
  return (
    <div className="relative" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie data={items} dataKey="value" nameKey="name" innerRadius="62%" outerRadius="90%" paddingAngle={2} stroke="none">
            {items.map((d, i) => <Cell key={i} fill={d.color} />)}
          </Pie>
          <Tooltip content={<TT />} />
        </PieChart>
      </ResponsiveContainer>
      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
        <span className="text-2xl font-bold text-gray-800 dark:text-gray-100">{centerValue ?? total}</span>
        {centerLabel && <span className="text-xs text-gray-500 dark:text-gray-400">{centerLabel}</span>}
      </div>
    </div>
  )
}

// Legenda compacta para o donut.
export const DonutLegend: React.FC<{ data: { name: string; value: number; color: string }[] }> = ({ data }) => (
  <div className="grid grid-cols-2 gap-x-3 gap-y-1 mt-3">
    {(data || []).filter(d => d.value > 0).map((d, i) => (
      <div key={i} className="flex items-center gap-1.5 text-xs">
        <span className="inline-block w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: d.color }} />
        <span className="text-gray-600 dark:text-gray-300 truncate flex-1">{d.name}</span>
        <span className="font-semibold text-gray-800 dark:text-gray-100">{d.value}</span>
      </div>
    ))}
  </div>
)

// ─── Barras (série/ranking) ───────────────────────────────────────────────────
export const Bars: React.FC<{
  data: any[]
  xKey: string
  yKey: string
  color?: string
  height?: number
  xIsDay?: boolean
  layout?: 'horizontal' | 'vertical'
}> = ({ data, xKey, yKey, color = '#8b5cf6', height = 220, xIsDay, layout = 'horizontal' }) => {
  if (!data?.length) return <EmptyChart height={height} />
  const vertical = layout === 'vertical'
  return (
    <div className="text-gray-400 dark:text-gray-500" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout={layout} margin={{ top: 6, right: 10, left: vertical ? 8 : -18, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="currentColor" strokeOpacity={0.12} />
          {vertical ? (
            <>
              <XAxis type="number" tick={{ fontSize: 11, fill: 'currentColor' }} allowDecimals={false} />
              <YAxis type="category" dataKey={xKey} tick={{ fontSize: 11, fill: 'currentColor' }} width={90} />
            </>
          ) : (
            <>
              <XAxis dataKey={xKey} tick={{ fontSize: 11, fill: 'currentColor' }} tickFormatter={xIsDay ? fmtDay : undefined} />
              <YAxis tick={{ fontSize: 11, fill: 'currentColor' }} allowDecimals={false} />
            </>
          )}
          <Tooltip content={<TT />} cursor={{ fill: 'currentColor', fillOpacity: 0.05 }} />
          <Bar dataKey={yKey} fill={color} radius={vertical ? [0, 6, 6, 0] : [6, 6, 0, 0]} maxBarSize={42} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

// ─── Área (série temporal) ────────────────────────────────────────────────────
export const AreaTrend: React.FC<{
  data: any[]
  xKey: string
  yKey: string
  color?: string
  height?: number
  suffix?: string
}> = ({ data, xKey, yKey, color = '#6366f1', height = 200, suffix }) => {
  if (!data?.length) return <EmptyChart height={height} />
  const gid = `g-${yKey}-${color.replace('#', '')}`
  return (
    <div className="text-gray-400 dark:text-gray-500" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 6, right: 10, left: -18, bottom: 0 }}>
          <defs>
            <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.35} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="currentColor" strokeOpacity={0.12} />
          <XAxis dataKey={xKey} tick={{ fontSize: 11, fill: 'currentColor' }} tickFormatter={fmtDay} minTickGap={24} />
          <YAxis tick={{ fontSize: 11, fill: 'currentColor' }} allowDecimals={false} width={36} />
          <Tooltip content={<TT suffix={suffix} />} />
          <Area type="monotone" dataKey={yKey} stroke={color} strokeWidth={2} fill={`url(#${gid})`} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}

// ─── Barra de progresso (metas / saúde) ───────────────────────────────────────
export const ProgressBar: React.FC<{ pct: number; color?: string; height?: string }> = ({ pct, color = 'bg-violet-500', height = 'h-2' }) => (
  <div className={`w-full ${height} bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden`}>
    <div className={`h-full ${color} rounded-full transition-all duration-500`} style={{ width: `${Math.max(0, Math.min(100, pct))}%` }} />
  </div>
)
