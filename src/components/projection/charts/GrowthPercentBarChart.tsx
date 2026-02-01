import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts'
import { formatPercentBR } from './formatters'

export type GrowthPercentPoint = { name: string; value: number; color?: string }

type Props = {
  data: GrowthPercentPoint[]
  height?: number
}

export function GrowthPercentBarChart({ data, height = 260 }: Props) {
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null
    const v = Number(payload[0].value ?? 0)
    return (
      <div className="bg-white p-3 rounded-lg shadow-lg border border-gray-200">
        <p className="font-semibold text-gray-800 mb-1">{label}</p>
        <p className="text-sm text-gray-700">{formatPercentBR(v)}</p>
      </div>
    )
  }

  return (
    <div className="w-full" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="name" />
          <YAxis tickFormatter={(v: any) => `${Number(v).toLocaleString('pt-BR', { maximumFractionDigits: 0 })}%`} />
          <Tooltip content={<CustomTooltip />} />
          <Bar dataKey="value" name="%" fill="#3b82f6" radius={[6, 6, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

