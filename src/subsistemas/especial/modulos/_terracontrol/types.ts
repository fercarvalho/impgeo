// Tipos compartilhados entre TerraControl (autenticado) e TerraControlView (público).
// Antes estavam duplicados nos dois componentes — qualquer alteração obrigava
// edição em dois lugares e divergiu silenciosamente algumas vezes (por exemplo
// `id` de matrículas legacy usa formatos diferentes nos dois normalize).

export interface MatriculaItem {
  id: string
  numero: string
  url?: string
}

export interface ItrItem {
  id: string
  numero: string
  /**
   * @deprecated G6.2 — versões antigas guardavam o PDF da declaração em `url`.
   * O normalize.ts mescla para `declaracaoUrl` e remove `url` do objeto.
   * Runtime não deve mais ler este campo; mantido aqui só para compat de raw input.
   */
  url?: string
  declaracaoUrl?: string
  reciboUrl?: string
}

export interface CcirItem {
  id: string
  numero: string
  url?: string
}

export interface TerraControlRecord {
  id: string
  codImovel: number
  imovel: string
  municipio: string
  mapaUrl?: string
  matriculas: string
  matriculasDados?: MatriculaItem[]
  nIncraCcir: string
  car: string
  carUrl?: string
  statusCar: string
  itr: string
  itrDados?: ItrItem[]
  ccirDados?: CcirItem[]
  geoCertificacao: 'SIM' | 'NÃO'
  geoRegistro: 'SIM' | 'NÃO'
  areaTotal: number
  reservaLegal: number
  cultura1: string
  areaCultura1: number
  cultura2: string
  areaCultura2: number
  outros: string
  areaOutros: number
  appCodigoFlorestal: number
  appVegetada: number
  appNaoVegetada: number
  remanescenteFlorestal: number
  // F: ownership + approval
  createdByUserId?: string | null
  createdByTcUserId?: string | null
  createdByTcUsername?: string | null
  createdByTcFullName?: string | null
  approved: boolean
  approvedAt?: string | null
  approvedByUserId?: string | null
  // G7 (migration 040) — vínculo com orçamento ativo. NULL = registro
  // legado (criado antes da feature) ou nunca teve orçamento.
  currentBudgetId?: string | null
  budgetStatus?: 'locked' | 'sent' | 'revision_requested' | 'awaiting_payment' | 'paid' | null
}

// Campos pelos quais a UI ordena a listagem. `saldoReservaLegal` é computado
// (reservaLegal - 0.2 * areaTotal) — não vem do banco.
export type SortField =
  | 'codImovel'
  | 'imovel'
  | 'municipio'
  | 'nIncraCcir'
  | 'car'
  | 'statusCar'
  | 'itr'
  | 'geoCertificacao'
  | 'geoRegistro'
  | 'areaTotal'
  | 'reservaLegal'
  | 'saldoReservaLegal'
  | 'cultura1'
  | 'areaCultura1'
  | 'cultura2'
  | 'areaCultura2'
  | 'outros'
  | 'areaOutros'
  | 'appCodigoFlorestal'
  | 'appVegetada'
  | 'appNaoVegetada'
  | 'remanescenteFlorestal'

export type SortDirection = 'asc' | 'desc'

// Transformador opcional aplicado a URLs de documento antes de fetch/<a>.
// Usado pela View pública para injetar ?token=&password= em /api/documents/*.
// No componente autenticado, o transform é identidade.
export type UrlTransformer = (url?: string) => string
