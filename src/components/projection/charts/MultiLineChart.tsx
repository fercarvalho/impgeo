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

type TooltipProps = {
  active?: boolean
  payload?: Array<{ dataKey: string; name: string; value: number; stroke: string }>
  label?: string
  valueFormat: ValueFormat
}

function CustomTooltip({ active, payload, label, valueFormat }: TooltipProps) {
  if (!active || !payload?.length) return null

  return (
    <div className="bg-white p-3 rounded-lg shadow-lg border border-gray-200">
      <p className="font-semibold text-gray-800 mb-2">{label}</p>
      <div className="space-y-1 text-sm">
        {payload.map((p) => {
          const raw = p.value
          const v = typeof raw === 'number' && !isNaN(raw) ? raw : 0
          return (
            <div key={p.dataKey} className="flex items-center justify-between gap-4">
              <span className="flex items-center gap-2">
                <span
                  aria-hidden="true"
                  className="inline-block w-2.5 h-2.5 rounded-full"
                  style={{ backgroundColor: p.stroke }}
                />
                {p.name}
              </span>
              <span className="font-semibold text-gray-800">{formatValue(v, valueFormat)}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

type Props = {
  data: Array<Record<string, unknown>>
  series: MultiLineSeries[]
  xKey?: string
  valueFormat?: ValueFormat
  height?: number
  showZeroReferenceLine?: boolean
}

function formatAxisTick(value: number, valueFormat: ValueFormat): string {
  if (isNaN(value) || value == null) return ''
  if (valueFormat === 'percent')
    return `${value.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`
  if (valueFormat === 'currency') {
    try {
      return value.toLocaleString('pt-BR', {
        notation: 'compact',
        compactDisplay: 'short',
        maximumFractionDigits: 1,
      })
    } catch {
      return value.toLocaleString('pt-BR', { maximumFractionDigits: 0 })
    }
  }
  return value.toLocaleString('pt-BR', { maximumFractionDigits: 1 })
}

export function MultiLineChart({
  data,
  series,
  xKey = 'month',
  valueFormat = 'currency',
  height = 340,
  showZeroReferenceLine = false,
}: Props) {
  const safeSeries = series ?? []
  const safeData = data ?? []
  const enabled = safeSeries.filter((s) => s.enabled)

  if (safeData.length === 0 || enabled.length === 0) {
    return (
      <div
        className="w-full flex items-center justify-center text-sm text-gray-500"
        style={{ height }}
      >
        Sem dados para exibir
      </div>
    )
  }

  return (
    <div className="w-full" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={safeData} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey={xKey} />
          <YAxis
            tickFormatter={(v: number) => formatAxisTick(Number(v), valueFormat)}
            width={90}
          />
          {showZeroReferenceLine && (
            <ReferenceLine y={0} stroke="#9ca3af" strokeDasharray="4 4" />
          )}
          <Tooltip content={<CustomTooltip valueFormat={valueFormat} />} />
          <Legend />
          {enabled.map((s) => (
            <Line
              key={s.key}
              type="monotone"
              dataKey={s.key}
              name={s.name}
              stroke={s.color}
              strokeWidth={2.5}
              dot={false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
