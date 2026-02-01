import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts'
import { formatCurrencyBRL } from './formatters'

export type MonthlyMktPoint = {
  month: string
  trafego: number
  socialMedia: number
  producaoConteudo: number
  total?: number
}

type Props = {
  data: MonthlyMktPoint[]
  height?: number
  showTotalLine?: boolean
  enabled?: {
    trafego?: boolean
    socialMedia?: boolean
    producaoConteudo?: boolean
    total?: boolean
  }
}

const COLORS = {
  trafego: '#3b82f6',
  socialMedia: '#22c55e',
  producaoConteudo: '#f59e0b',
  total: '#111827'
} as const

export function StackedMktChart({ data, height = 340, showTotalLine = true, enabled }: Props) {
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null

    const byKey: Record<string, number> = {}
    for (const p of payload) {
      if (p?.dataKey) byKey[p.dataKey] = p.value
    }

    const total =
      (byKey.trafego ?? 0) + (byKey.socialMedia ?? 0) + (byKey.producaoConteudo ?? 0)

    return (
      <div className="bg-white p-3 rounded-lg shadow-lg border border-gray-200">
        <p className="font-semibold text-gray-800 mb-2">{label}</p>
        <div className="space-y-1 text-sm">
          <div className="flex items-center justify-between gap-4">
            <span className="flex items-center gap-2">
              <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ backgroundColor: COLORS.trafego }} />
              Tráfego
            </span>
            <span className="font-semibold text-gray-800">{formatCurrencyBRL(byKey.trafego ?? 0)}</span>
          </div>
          <div className="flex items-center justify-between gap-4">
            <span className="flex items-center gap-2">
              <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ backgroundColor: COLORS.socialMedia }} />
              Social
            </span>
            <span className="font-semibold text-gray-800">{formatCurrencyBRL(byKey.socialMedia ?? 0)}</span>
          </div>
          <div className="flex items-center justify-between gap-4">
            <span className="flex items-center gap-2">
              <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ backgroundColor: COLORS.producaoConteudo }} />
              Conteúdo
            </span>
            <span className="font-semibold text-gray-800">{formatCurrencyBRL(byKey.producaoConteudo ?? 0)}</span>
          </div>
          <div className="border-t border-gray-200 pt-2 mt-2 flex items-center justify-between gap-4">
            <span className="font-semibold text-gray-700">Total</span>
            <span className="font-bold text-gray-900">{formatCurrencyBRL(total)}</span>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="w-full" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="month" />
          <YAxis tickFormatter={(v: any) => {
            const n = Number(v)
            try {
              return n.toLocaleString('pt-BR', { notation: 'compact', compactDisplay: 'short', maximumFractionDigits: 1 })
            } catch {
              return n.toLocaleString('pt-BR', { maximumFractionDigits: 0 })
            }
          }} />
          <Tooltip content={<CustomTooltip />} />
          <Legend />
          {(enabled?.trafego ?? true) && <Bar dataKey="trafego" name="Tráfego" stackId="mkt" fill={COLORS.trafego} />}
          {(enabled?.socialMedia ?? true) && (
            <Bar dataKey="socialMedia" name="Social Media" stackId="mkt" fill={COLORS.socialMedia} />
          )}
          {(enabled?.producaoConteudo ?? true) && (
            <Bar dataKey="producaoConteudo" name="Produção Conteúdo" stackId="mkt" fill={COLORS.producaoConteudo} />
          )}
          {showTotalLine && (enabled?.total ?? true) && (
            <Line type="monotone" dataKey="total" name="Total" stroke={COLORS.total} strokeWidth={2} dot={false} />
          )}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )
}

