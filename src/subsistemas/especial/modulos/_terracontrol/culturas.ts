// Normalização de nomes de cultura e matching tolerante a variações
// (acentos, sinônimos comuns). Compartilhado entre os dois componentes.

import type { TerraControlRecord } from './types'

export const normalizeCulturaName = (name: string): string => {
  if (!name) return ''
  return name
    .toUpperCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
}

// Variações conhecidas — sinônimos e formas alternativas. Mantém os tipos
// "canônicos" mapeados para as formas mais frequentes na base.
const VARIACOES: Record<string, string[]> = {
  'CULTURA TEMPORARIA': ['CULTURA TEMPORARIA', 'CULTURA TEMPORÁRIA', 'TEMPORARIA', 'TEMPORÁRIA'],
  SILVICULTURA:        ['SILVICULTURA', 'REFLORESTAMENTO'],
  PASTO:               ['PASTO', 'PASTAGEM', 'PASTAGENS'],
  BANHADO:             ['BANHADO', 'BANHADOS', 'BREJO', 'BREJOS'],
  SERVIDAO:            ['SERVIDAO', 'SERVIDÃO', 'SERVIDOES', 'SERVIÇÕES'],
  'AREA ANTROPIZADA':  ['AREA ANTROPIZADA', 'ÁREA ANTROPIZADA', 'ANTROPIZADA', 'ANTROPIZADO'],
}

export const matchesCulturaType = (cultura: string, tipo: string): boolean => {
  const culturaNorm = normalizeCulturaName(cultura)
  const tipoNorm = normalizeCulturaName(tipo)
  if (!culturaNorm || !tipoNorm) return false
  if (culturaNorm === tipoNorm) return true

  const variacoes = VARIACOES[tipoNorm] || []
  if (variacoes.some(v => normalizeCulturaName(v) === culturaNorm)) return true

  // Fallback: substring match (cobre casos como "Pastagem natural" → "Pasto").
  return culturaNorm.includes(tipoNorm) || tipoNorm.includes(culturaNorm)
}

// Soma a área (cultura1 + cultura2 + outros) atribuída a um determinado tipo,
// considerando as três posições do registro.
export const getAreaByCulturaType = (records: TerraControlRecord[], tipo: string): number => {
  let total = 0
  for (const r of records) {
    if (matchesCulturaType(r.cultura1, tipo)) total += r.areaCultura1 || 0
    if (matchesCulturaType(r.cultura2, tipo)) total += r.areaCultura2 || 0
    if (matchesCulturaType(r.outros, tipo))   total += r.areaOutros   || 0
  }
  return total
}
