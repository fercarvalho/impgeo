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

export type MultiLineSeries = {
  key: string
  name: string
  color: string
  enabled: boolean
}

type Props = {
  data: Array<Record<string, any>>
  series: MultiLineSeries[]
  xKey?: string
  valueFormat?: ValueFormat
  height?: number
  showZeroReferenceLine?: boolean
}

export function MultiLineChart({
  data,
  series,
  xKey = 'month',
  valueFormat = 'currency',
  height = 340,
  showZeroReferenceLine = false
}: Props) {
  const enabled = series.filter(s => s.enabled)

  const formatAxisTick = (value: number): string => {
    if (valueFormat === 'percent') return `${value.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`
    if (valueFormat === 'currency') {
      try {
        return value.toLocaleString('pt-BR', { notation: 'compact', compactDisplay: 'short', maximumFractionDigits: 1 })
      } catch {
        return value.toLocaleString('pt-BR', { maximumFractionDigits: 0 })
      }
    }
    return value.toLocaleString('pt-BR', { maximumFractionDigits: 1 })
  }

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null

    // payload já vem apenas com séries ativas (linhas renderizadas)
    return (
      <div className="bg-white p-3 rounded-lg shadow-lg border border-gray-200">
        <p className="font-semibold text-gray-800 mb-2">{label}</p>
        <div className="space-y-1 text-sm">
          {payload.map((p: any) => (
            <div key={p.dataKey} className="flex items-center justify-between gap-4">
              <span className="flex items-center gap-2">
                <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ backgroundColor: p.stroke }} />
                {p.name}
              </span>
              <span className="font-semibold text-gray-800">{formatValue(Number(p.value ?? 0), valueFormat)}</span>
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="w-full" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey={xKey} />
          <YAxis tickFormatter={(v: any) => formatAxisTick(Number(v))} width={90} />
          {showZeroReferenceLine && <ReferenceLine y={0} stroke="#9ca3af" strokeDasharray="4 4" />}
          <Tooltip content={<CustomTooltip />} />
          <Legend />
          {enabled.map(s => (
            <Line key={s.key} type="monotone" dataKey={s.key} name={s.name} stroke={s.color} strokeWidth={2.5} dot={false} />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

