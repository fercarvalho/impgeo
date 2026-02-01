export type ValueFormat = 'currency' | 'number' | 'percent'

export function formatCurrencyBRL(value: number): string {
  const safe = Number.isFinite(value) ? value : 0
  return `R$ ${safe.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export function formatNumberBR(value: number): string {
  const safe = Number.isFinite(value) ? value : 0
  return safe.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export function formatPercentBR(value: number): string {
  const safe = Number.isFinite(value) ? value : 0
  return `${safe.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`
}

export function formatValue(value: number, format: ValueFormat): string {
  if (format === 'currency') return formatCurrencyBRL(value)
  if (format === 'percent') return formatPercentBR(value)
  return formatNumberBR(value)
}

export type SeriesKpis = {
  total: number
  average: number
  best: { month: string; value: number }
  worst: { month: string; value: number }
}

export function computeSeriesKpis(values: number[], months: string[]): SeriesKpis {
  const safeValues = values.map(v => (Number.isFinite(v) ? v : 0))
  const total = safeValues.reduce((acc, v) => acc + v, 0)
  const average = safeValues.length ? total / safeValues.length : 0

  let bestIdx = 0
  let worstIdx = 0
  for (let i = 1; i < safeValues.length; i++) {
    if (safeValues[i] > safeValues[bestIdx]) bestIdx = i
    if (safeValues[i] < safeValues[worstIdx]) worstIdx = i
  }

  return {
    total,
    average,
    best: { month: months[bestIdx] ?? String(bestIdx + 1), value: safeValues[bestIdx] ?? 0 },
    worst: { month: months[worstIdx] ?? String(worstIdx + 1), value: safeValues[worstIdx] ?? 0 }
  }
}

