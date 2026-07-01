// Detecção de hostname para roteamento do TerraControl.
//
// Desde a unificação de domínio há UM só host dedicado ao TerraControl:
//
//   - terracontrol.com.br  → entry ÚNICO (login unificado: cliente tc_user +
//                            equipe impgeo no mesmo formulário)
//
// Não há mais subdomínio admin.terracontrol — a equipe entra pelo mesmo host,
// com credenciais impgeo, e o backend (POST /api/tc-entry/login) roteia.
//
// O App.tsx checa o hostname antes de decidir o que renderizar — se cair em
// 'tc', NÃO entra no fluxo do SubsystemPicker do impgeo.

export const TC_PUBLIC_HOSTS = ['terracontrol.com.br', 'terracontrol.local']

export type TcEntryMode = 'tc' | 'impgeo'

export function detectTcEntryMode(hostname: string = ''): TcEntryMode {
  const h = (hostname || '').toLowerCase()
  if (TC_PUBLIC_HOSTS.includes(h)) return 'tc'
  return 'impgeo'
}

// Helper para descobrir a URL pública absoluta do TerraControl (usado nos
// redirects de /v/<legacy>). Em dev pode estar undefined; backend monta.
export function getTcPublicBaseUrl(): string | null {
  if (typeof window === 'undefined') return null
  const h = window.location.hostname.toLowerCase()
  if (TC_PUBLIC_HOSTS.includes(h)) {
    return `${window.location.protocol}//${window.location.host}`
  }
  return null
}
