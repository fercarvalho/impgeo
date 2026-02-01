import type { MonthlyScenarioPoint } from './ThreeScenarioLineChart'
import type { MonthlyMktPoint } from './StackedMktChart'

export function buildMonthlyScenarioData(params: {
  months: string[]
  calcPrevisto: (monthIndex: number) => number
  calcMedio: (monthIndex: number) => number
  calcMaximo: (monthIndex: number) => number
}): MonthlyScenarioPoint[] {
  const { months, calcPrevisto, calcMedio, calcMaximo } = params
  return months.map((m, i) => ({
    month: m,
    previsto: Number(calcPrevisto(i) ?? 0),
    medio: Number(calcMedio(i) ?? 0),
    maximo: Number(calcMaximo(i) ?? 0)
  }))
}

export function buildMonthlyBaseSeries(months: string[], values: number[]): { month: string; value: number }[] {
  return months.map((m, i) => ({
    month: m,
    value: Number(values?.[i] ?? 0)
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
    const t = Number(trafego?.[i] ?? 0)
    const s = Number(socialMedia?.[i] ?? 0)
    const p = Number(producaoConteudo?.[i] ?? 0)
    return { month: m, trafego: t, socialMedia: s, producaoConteudo: p, total: t + s + p }
  })
}

