// Constantes e builders de dados para gráficos. Recebem o array de registros
// como parâmetro, sem capturar state do componente — facilita memoização e
// reuso entre TerraControl (autenticado) e TerraControlView (público).

import type { TerraControlRecord } from './types'
import { matchesCulturaType } from './culturas'

export interface ChartDatum {
  name: string
  value: number
  color: string
}

export const CHART_COLORS: readonly string[] = [
  '#3b82f6', // azul
  '#22c55e', // verde
  '#ef4444', // vermelho
  '#f59e0b', // laranja
  '#8b5cf6', // roxo
  '#ec4899', // rosa
  '#06b6d4', // ciano
  '#84cc16', // verde limão
  '#f97316', // laranja escuro
  '#6366f1', // índigo
]

const withColors = (rows: Array<{ name: string; value: number }>): ChartDatum[] =>
  rows.map((row, idx) => ({ ...row, color: CHART_COLORS[idx % CHART_COLORS.length] }))

// "Quantos imóveis em cada município?"
export const getTotalImoveisData = (records: TerraControlRecord[]): ChartDatum[] => {
  const byMunicipio = records.reduce<Record<string, number>>((acc, r) => {
    acc[r.municipio] = (acc[r.municipio] || 0) + 1
    return acc
  }, {})
  const rows = Object.entries(byMunicipio)
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value)
  return withColors(rows)
}

// "Quantos ha de área total em cada município?"
export const getAreaTotalData = (records: TerraControlRecord[]): ChartDatum[] => {
  const byMunicipio = records.reduce<Record<string, number>>((acc, r) => {
    acc[r.municipio] = (acc[r.municipio] || 0) + (r.areaTotal || 0)
    return acc
  }, {})
  const rows = Object.entries(byMunicipio)
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value)
  return withColors(rows)
}

export const getGeoCertificacaoData = (records: TerraControlRecord[]): ChartDatum[] => {
  const sim = records.filter(a => a.geoCertificacao === 'SIM').length
  const nao = records.filter(a => a.geoCertificacao === 'NÃO').length
  return [
    { name: 'SIM', value: sim, color: '#22c55e' },
    { name: 'NÃO', value: nao, color: '#ef4444' },
  ]
}

export const getGeoRegistroData = (records: TerraControlRecord[]): ChartDatum[] => {
  const sim = records.filter(a => a.geoRegistro === 'SIM').length
  const nao = records.filter(a => a.geoRegistro === 'NÃO').length
  return [
    { name: 'SIM', value: sim, color: '#22c55e' },
    { name: 'NÃO', value: nao, color: '#ef4444' },
  ]
}

// Top 10 imóveis por área no tipo de cultura informado.
// TODO (Grupo 6 / features): permitir "ver todos" em vez de cap fixo.
export const getCulturaData = (records: TerraControlRecord[], tipo: string): ChartDatum[] => {
  const rows = records
    .map(r => {
      let area = 0
      if (matchesCulturaType(r.cultura1, tipo)) area += r.areaCultura1 || 0
      if (matchesCulturaType(r.cultura2, tipo)) area += r.areaCultura2 || 0
      if (matchesCulturaType(r.outros, tipo))   area += r.areaOutros   || 0
      return { name: r.imovel, value: area }
    })
    .filter(item => item.value > 0)
    .sort((a, b) => b.value - a.value)
    .slice(0, 10)
  return withColors(rows)
}

export type APPField =
  | 'appCodigoFlorestal'
  | 'appVegetada'
  | 'appNaoVegetada'
  | 'remanescenteFlorestal'

export const getAPPData = (records: TerraControlRecord[], field: APPField): ChartDatum[] => {
  const rows = records
    .map(r => ({ name: r.imovel, value: r[field] || 0 }))
    .filter(item => item.value > 0)
    .sort((a, b) => b.value - a.value)
    .slice(0, 10)
  return withColors(rows)
}

export const getReservaLegalData = (records: TerraControlRecord[]): ChartDatum[] => {
  const rows = records
    .map(r => ({ name: r.imovel, value: r.reservaLegal || 0 }))
    .filter(item => item.value > 0)
    .sort((a, b) => b.value - a.value)
    .slice(0, 10)
  return withColors(rows)
}
