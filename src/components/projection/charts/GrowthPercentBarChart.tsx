import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts'
import { formatPercentBR } from './formatters'

export type GrowthPercentPoint = { name: string; value: number; color?: string }

type TooltipProps = {
  active?: boolean
  payload?: Array<{ value: number }>
  label?: string
}

function CustomTooltip({ active, payload, label }: TooltipProps) {
  if (!active || !payload?.length) return null
  const raw = payload[0].value
  const v = typeof raw === 'number' && !isNaN(raw) ? raw : 0
  return (
    <div className="bg-white p-3 rounded-lg shadow-lg border border-gray-200">
      <p className="font-semibold text-gray-800 mb-1">{label}</p>
      <p className="text-sm text-gray-700">{formatPercentBR(v)}</p>
    </div>
  )
}

type Props = {
  data: GrowthPercentPoint[]
  height?: number
}

export function GrowthPercentBarChart({ data, height = 260 }: Props) {
  if (!data || data.length === 0) {
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
        <BarChart data={data} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="name" />
          <YAxis
            tickFormatter={(v: number) => {
              const n = typeof v === 'number' && !isNaN(v) ? v : 0
              return `${n.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`
            }}
          />
          <Tooltip content={<CustomTooltip />} />
          <Bar dataKey="value" name="%" radius={[6, 6, 0, 0]}>
            {data.map((entry, index) => (
              <Cell
                key={`cell-${index}`}
                fill={entry.color ?? '#3b82f6'}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
