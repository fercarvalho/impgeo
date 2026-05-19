// Normalização de registros vindos da API. O backend devolve em snake_case
// (Postgres) mas também aceita camelCase (legado JSON pré-fase 1). Esta camada
// uniformiza para camelCase + tipos esperados pelo frontend.
//
// Antes estava duplicada em TerraControl.tsx e TerraControlView.tsx com pequenas
// divergências (formato de ID para itens legacy). Agora é única fonte de verdade.

import type { CcirItem, ItrItem, MatriculaItem, TerraControlRecord } from './types'

// Gera ID estável a partir do registro pai + índice — útil para itens legados
// (matrículas/CCIR/ITR vindos como string CSV antes do schema JSONB).
// Antes: `Date.now().toString(36)_idx_${Math.random()...}` — colidia em ms iguais.
const legacyId = (kind: string, parentId: string, idx: number): string =>
  `legacy-${kind}-${parentId || 'noid'}-${idx}`

function parseJsonbArray<T>(raw: unknown): T[] {
  if (!raw) return []
  if (Array.isArray(raw)) return raw as T[]
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw)
      return Array.isArray(parsed) ? (parsed as T[]) : []
    } catch (e) {
      console.error('Erro ao parsear JSONB:', e)
      return []
    }
  }
  return []
}

export function normalizeRecord(raw: any): TerraControlRecord {
  const recordId = String(raw?.id ?? '')

  // Matrículas: preferir o array JSONB; senão, derivar da string legada.
  let matriculasDados: MatriculaItem[] = parseJsonbArray<MatriculaItem>(
    raw?.matriculasDados ?? raw?.matriculas_dados
  )
  if (matriculasDados.length === 0 && typeof raw?.matriculas === 'string') {
    matriculasDados = raw.matriculas
      .split(',')
      .map((m: string, idx: number) => ({ id: legacyId('mat', recordId, idx), numero: m.trim(), url: '' }))
      .filter((m: MatriculaItem) => m.numero.length > 0)
  }

  // ITR: idem. Adicionalmente, faz fallback do campo legado `url` → `declaracaoUrl`
  // (versões anteriores guardavam o PDF da declaração apenas em `url`).
  let itrDados: ItrItem[] = parseJsonbArray<ItrItem>(raw?.itrDados ?? raw?.itr_dados)
  if (itrDados.length === 0 && typeof raw?.itr === 'string') {
    itrDados = raw.itr
      .split(',')
      .map((m: string, idx: number) => ({
        id: legacyId('itr', recordId, idx),
        numero: m.trim(),
        url: '',
        declaracaoUrl: '',
        reciboUrl: '',
      }))
      .filter((m: ItrItem) => m.numero.length > 0)
  }
  itrDados = itrDados.map(item => ({
    ...item,
    declaracaoUrl: item.declaracaoUrl || item.url || '',
  }))

  // CCIR: idem.
  let ccirDados: CcirItem[] = parseJsonbArray<CcirItem>(raw?.ccirDados ?? raw?.ccir_dados)
  if (ccirDados.length === 0) {
    const legacyCcir = raw?.nIncraCcir ?? raw?.n_incra_ccir
    if (typeof legacyCcir === 'string') {
      ccirDados = legacyCcir
        .split(',')
        .map((m: string, idx: number) => ({ id: legacyId('ccir', recordId, idx), numero: m.trim(), url: '' }))
        .filter((m: CcirItem) => m.numero.length > 0)
    }
  }

  return {
    id: recordId,
    codImovel: Number(raw?.codImovel ?? raw?.cod_imovel ?? 0),
    imovel: raw?.imovel ?? raw?.endereco ?? '',
    municipio: raw?.municipio ?? '',
    mapaUrl: raw?.mapaUrl ?? raw?.mapa_url ?? '',
    matriculas: raw?.matriculas ?? '',
    matriculasDados,
    nIncraCcir: raw?.nIncraCcir ?? raw?.n_incra_ccir ?? '',
    ccirDados,
    car: raw?.car ?? '',
    carUrl: raw?.carUrl ?? raw?.car_url ?? '',
    statusCar: raw?.statusCar ?? raw?.status_car ?? '',
    itr: raw?.itr ?? '',
    itrDados,
    geoCertificacao: (raw?.geoCertificacao ?? raw?.geo_certificacao) === 'SIM' ? 'SIM' : 'NÃO',
    geoRegistro: (raw?.geoRegistro ?? raw?.geo_registro) === 'SIM' ? 'SIM' : 'NÃO',
    areaTotal: Number(raw?.areaTotal ?? raw?.area_total ?? 0),
    reservaLegal: Number(raw?.reservaLegal ?? raw?.reserva_legal ?? 0),
    cultura1: raw?.cultura1 ?? '',
    areaCultura1: Number(raw?.areaCultura1 ?? raw?.area_cultura1 ?? 0),
    cultura2: raw?.cultura2 ?? '',
    areaCultura2: Number(raw?.areaCultura2 ?? raw?.area_cultura2 ?? 0),
    outros: raw?.outros ?? '',
    areaOutros: Number(raw?.areaOutros ?? raw?.area_outros ?? 0),
    appCodigoFlorestal: Number(raw?.appCodigoFlorestal ?? raw?.app_codigo_florestal ?? 0),
    appVegetada: Number(raw?.appVegetada ?? raw?.app_vegetada ?? 0),
    appNaoVegetada: Number(raw?.appNaoVegetada ?? raw?.app_nao_vegetada ?? 0),
    remanescenteFlorestal: Number(raw?.remanescenteFlorestal ?? raw?.remanescente_florestal ?? 0),
  }
}

export const normalizeRecords = (rows: any[]): TerraControlRecord[] =>
  Array.isArray(rows) ? rows.map(normalizeRecord) : []

// Formata cod_imovel para 3 dígitos com leading zero (ex.: 5 → "005").
export const formatCodImovel = (value: number): string =>
  String(Number(value || 0)).padStart(3, '0')

// Slugifica nome do imóvel para uso seguro em nome de arquivo (ZIP, etc.).
export const getSafeImovelName = (name: string): string => {
  if (!name) return 'Sem_Nome'
  const safe = name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]/gi, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
    .trim()
  return safe || 'Sem_Nome'
}

export const formatNumber = (num: number): string =>
  (num || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
