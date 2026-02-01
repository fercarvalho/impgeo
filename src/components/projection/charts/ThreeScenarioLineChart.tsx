import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts'
import { formatValue, type ValueFormat } from './formatters'

export type MonthlyScenarioPoint = {
  month: string
  previsto: number
  medio: number
  maximo: number
}

type Props = {
  data: MonthlyScenarioPoint[]
  valueFormat?: ValueFormat
  height?: number
  showZeroReferenceLine?: boolean
}

const COLORS = {
  previsto: '#3b82f6',
  medio: '#10b981',
  maximo: '#8b5cf6'
} as const

function formatAxisTick(value: number, fmt: ValueFormat): string {
  // Axis precisa ser mais compacto que tooltip
  if (fmt === 'percent') return `${value.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`
  if (fmt === 'currency') {
    try {
      return value.toLocaleString('pt-BR', { notation: 'compact', compactDisplay: 'short', maximumFractionDigits: 1 })
    } catch {
      return value.toLocaleString('pt-BR', { maximumFractionDigits: 0 })
    }
  }
  return value.toLocaleString('pt-BR', { maximumFractionDigits: 1 })
}

export function ThreeScenarioLineChart({
  data,
  valueFormat = 'currency',
  height = 320,
  showZeroReferenceLine = false
}: Props) {
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null

    // payload vem na ordem das linhas renderizadas
    const byKey: Record<string, number> = {}
    for (const p of payload) {
      if (p?.dataKey) byKey[p.dataKey] = p.value
    }

    return (
      <div className="bg-white p-3 rounded-lg shadow-lg border border-gray-200">
        <p className="font-semibold text-gray-800 mb-2">{label}</p>
        <div className="space-y-1 text-sm">
          <div className="flex items-center justify-between gap-4">
            <span className="flex items-center gap-2">
              <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ backgroundColor: COLORS.previsto }} />
              Previsto
            </span>
            <span className="font-semibold text-gray-800">{formatValue(byKey.previsto ?? 0, valueFormat)}</span>
          </div>
          <div className="flex items-center justify-between gap-4">
            <span className="flex items-center gap-2">
              <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ backgroundColor: COLORS.medio }} />
              Médio
            </span>
            <span className="font-semibold text-gray-800">{formatValue(byKey.medio ?? 0, valueFormat)}</span>
          </div>
          <div className="flex items-center justify-between gap-4">
            <span className="flex items-center gap-2">
              <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ backgroundColor: COLORS.maximo }} />
              Máximo
            </span>
            <span className="font-semibold text-gray-800">{formatValue(byKey.maximo ?? 0, valueFormat)}</span>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="w-full" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="month" />
          <YAxis tickFormatter={(v: any) => formatAxisTick(Number(v), valueFormat)} />
          {showZeroReferenceLine && <ReferenceLine y={0} stroke="#9ca3af" strokeDasharray="4 4" />}
          <Tooltip content={<CustomTooltip />} />
          <Legend />
          <Line type="monotone" dataKey="previsto" name="Previsto" stroke={COLORS.previsto} strokeWidth={2.5} dot={false} />
          <Line type="monotone" dataKey="medio" name="Médio" stroke={COLORS.medio} strokeWidth={2.5} dot={false} />
          <Line type="monotone" dataKey="maximo" name="Máximo" stroke={COLORS.maximo} strokeWidth={2.5} dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

