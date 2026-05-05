import type { MonthlyScenarioPoint } from './ThreeScenarioLineChart'
import type { MonthlyMktPoint } from './StackedMktChart'

/** Converte valor para número seguro — trata null, undefined e NaN como 0 */
function safeN(v: unknown): number {
  const n = Number(v)
  return typeof n === 'number' && !isNaN(n) ? n : 0
}

export function buildMonthlyScenarioData(params: {
  months: string[]
  calcPrevisto: (monthIndex: number) => number
  calcMedio: (monthIndex: number) => number
  calcMaximo: (monthIndex: number) => number
}): MonthlyScenarioPoint[] {
  const { months, calcPrevisto, calcMedio, calcMaximo } = params
  return months.map((m, i) => ({
    month: m,
    previsto: safeN(calcPrevisto(i)),
    medio: safeN(calcMedio(i)),
    maximo: safeN(calcMaximo(i)),
  }))
}

export function buildMonthlyBaseSeries(
  months: string[],
  values: number[]
): { month: string; value: number }[] {
  return months.map((m, i) => ({
    month: m,
    value: safeN(values?.[i]),
  }))
}

export function buildMonthlyMktComponentsData(params: {
  months: string[]
  trafego: number[]
  socialMedia: number[]
  producaoConteudo: number[]
}): MonthlyMktPoint[] {
  const { months, trafego, socialMedia, producaoConteudo } = params
  return months.map((m, i) => {
    const t = safeN(trafego?.[i])
    const s = safeN(socialMedia?.[i])
    const p = safeN(producaoConteudo?.[i])
    return { month: m, trafego: t, socialMedia: s, producaoConteudo: p, total: t + s + p }
  })
}
