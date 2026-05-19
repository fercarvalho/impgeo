// Barrel de re-exports para os módulos compartilhados do TerraControl.
// Permite imports em um único `from './terracontrol'` nos componentes.

export type {
  MatriculaItem,
  ItrItem,
  CcirItem,
  TerraControlRecord,
  SortField,
  SortDirection,
  UrlTransformer,
} from './types'

export {
  normalizeRecord,
  normalizeRecords,
  formatCodImovel,
  getSafeImovelName,
  formatNumber,
} from './normalize'

export { isAllowedMapUrl, isExternalOnlyMapUrl, convertMapUrlToEmbed } from './mapUrl'

export {
  normalizeCulturaName,
  matchesCulturaType,
  getAreaByCulturaType,
} from './culturas'

export type { ChartDatum, APPField } from './charts'
export {
  CHART_COLORS,
  getTotalImoveisData,
  getAreaTotalData,
  getGeoCertificacaoData,
  getGeoRegistroData,
  getCulturaData,
  getAPPData,
  getReservaLegalData,
} from './charts'

export {
  downloadAllMatriculasZip,
  downloadAllItrZip,
  downloadSingleItrZip,
  downloadAllCcirZip,
  downloadRegistroZip,
} from './downloads'

export { useFeedback } from './feedback'
export type { ToastType } from './feedback'
