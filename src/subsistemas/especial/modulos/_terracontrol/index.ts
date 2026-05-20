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
  CHART_TOP_LIMIT,
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

export { default as PasswordGate } from './PasswordGate'

// Sistema tc_users (login externo do TerraControl) — migration 025/026.
// Os componentes a seguir são consumidos por TerraControlView.tsx (entry público)
// e App.tsx (branch de hostname). Ver tc-domains.ts para a detecção de subdomínio.
export { default as LoginScreen } from './LoginScreen'
export { default as TcPublicEntry } from './TcPublicEntry'
export { default as TcLoggedView } from './TcLoggedView'
export { default as TcMenuUsuario } from './TcMenuUsuario'
export { default as TcUserProfileModal } from './TcUserProfileModal'
export { default as TcEditarPerfilModal } from './TcEditarPerfilModal'
export { default as TcAlterarSenhaModal } from './TcAlterarSenhaModal'
export { default as TcAlterarUsernameModal } from './TcAlterarUsernameModal'
export { default as TcEsqueciSenhaModal } from './TcEsqueciSenhaModal'
export { default as TcResetarSenhaModal } from './TcResetarSenhaModal'
export { default as TerraControlAdminLogin } from './TerraControlAdminLogin'
export { default as TerraControlAdminShell } from './TerraControlAdminShell'
export { default as TcUsersAdminPanel } from './TcUsersAdminPanel'
export { default as TcHeader } from './TcHeader'
export { default as TcSubShareModal } from './TcSubShareModal'
export { default as TcAcceptInviteScreen } from './TcAcceptInviteScreen'
