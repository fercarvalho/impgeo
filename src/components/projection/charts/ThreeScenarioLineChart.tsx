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

const COLORS = {
  previsto: '#3b82f6',
  medio: '#10b981',
  maximo: '#8b5cf6',
} as const

function safeNum(v: unknown): number {
  const n = Number(v)
  return typeof n === 'number' && !isNaN(n) ? n : 0
}

function formatAxisTick(value: number, fmt: ValueFormat): string {
  const safe = typeof value === 'number' && !isNaN(value) ? value : 0
  if (fmt === 'percent')
    return `${safe.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`
  if (fmt === 'currency') {
    try {
      return safe.toLocaleString('pt-BR', {
        notation: 'compact',
        compactDisplay: 'short',
        maximumFractionDigits: 1,
      })
    } catch {
      return safe.toLocaleString('pt-BR', { maximumFractionDigits: 0 })
    }
  }
  return safe.toLocaleString('pt-BR', { maximumFractionDigits: 1 })
}

type TooltipProps = {
  active?: boolean
  payload?: Array<{ dataKey: string; value: number }>
  label?: string
  valueFormat: ValueFormat
}

function CustomTooltip({ active, payload, label, valueFormat }: TooltipProps) {
  if (!active || !payload?.length) return null

  const byKey: Record<string, number> = {}
  for (const p of payload) {
    if (p?.dataKey) byKey[p.dataKey] = safeNum(p.value)
  }

  return (
    <div className="bg-white p-3 rounded-lg shadow-lg border border-gray-200">
      <p className="font-semibold text-gray-800 mb-2">{label}</p>
      <div className="space-y-1 text-sm">
        <div className="flex items-center justify-between gap-4">
          <span className="flex items-center gap-2">
            <span
              aria-hidden="true"
              className="inline-block w-2.5 h-2.5 rounded-full"
              style={{ backgroundColor: COLORS.previsto }}
            />
            Previsto
          </span>
          <span className="font-semibold text-gray-800">
            {formatValue(byKey.previsto ?? 0, valueFormat)}
          </span>
        </div>
        <div className="flex items-center justify-between gap-4">
          <span className="flex items-center gap-2">
            <span
              aria-hidden="true"
              className="inline-block w-2.5 h-2.5 rounded-full"
              style={{ backgroundColor: COLORS.medio }}
            />
            Médio
          </span>
          <span className="font-semibold text-gray-800">
            {formatValue(byKey.medio ?? 0, valueFormat)}
          </span>
        </div>
        <div className="flex items-center justify-between gap-4">
          <span className="flex items-center gap-2">
            <span
              aria-hidden="true"
              className="inline-block w-2.5 h-2.5 rounded-full"
              style={{ backgroundColor: COLORS.maximo }}
            />
            Máximo
          </span>
          <span className="font-semibold text-gray-800">
            {formatValue(byKey.maximo ?? 0, valueFormat)}
          </span>
        </div>
      </div>
    </div>
  )
}

type Props = {
  data: MonthlyScenarioPoint[]
  valueFormat?: ValueFormat
  height?: number
  showZeroReferenceLine?: boolean
}

export function ThreeScenarioLineChart({
  data,
  valueFormat = 'currency',
  height = 320,
  showZeroReferenceLine = false,
}: Props) {
  const safeData = data ?? []

  if (safeData.length === 0) {
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
          <XAxis dataKey="month" />
          <YAxis tickFormatter={(v: number) => formatAxisTick(Number(v), valueFormat)} />
          {showZeroReferenceLine && (
            <ReferenceLine y={0} stroke="#9ca3af" strokeDasharray="4 4" />
          )}
          <Tooltip content={<CustomTooltip valueFormat={valueFormat} />} />
          <Legend />
          <Line
            type="monotone"
            dataKey="previsto"
            name="Previsto"
            stroke={COLORS.previsto}
            strokeWidth={2.5}
            dot={false}
          />
          <Line
            type="monotone"
            dataKey="medio"
            name="Médio"
            stroke={COLORS.medio}
            strokeWidth={2.5}
            dot={false}
          />
          <Line
            type="monotone"
            dataKey="maximo"
            name="Máximo"
            stroke={COLORS.maximo}
            strokeWidth={2.5}
            dot={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
