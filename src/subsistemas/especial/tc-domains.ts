// Detecção de hostname para roteamento por subdomínio do TerraControl.
//
// Em produção há 2 subdomínios dedicados ao TerraControl, além do principal
// do impgeo:
//
//   - terracontrol.viverdepj.com.br        → entry público dos tc_users
//   - admin.terracontrol.viverdepj.com.br  → atalho de login impgeo → módulo TerraControl
//
// O App.tsx checa o hostname antes de decidir o que renderizar — se cair em
// tc-public ou tc-admin, NÃO entra no fluxo do SubsystemPicker do impgeo.

export const TC_PUBLIC_HOSTS = ['terracontrol.viverdepj.com.br', 'terracontrol.local']
export const TC_ADMIN_HOSTS  = ['admin.terracontrol.viverdepj.com.br', 'admin.terracontrol.local']

export type TcEntryMode = 'tc-public' | 'tc-admin' | 'impgeo'

export function detectTcEntryMode(hostname: string = ''): TcEntryMode {
  const h = (hostname || '').toLowerCase()
  if (TC_PUBLIC_HOSTS.includes(h)) return 'tc-public'
  if (TC_ADMIN_HOSTS.includes(h))  return 'tc-admin'
  return 'impgeo'
}

// Helper para descobrir a URL pública absoluta do tc-public (usado nos
// redirects de /v/<legacy>). Em dev pode estar undefined; backend monta.
export function getTcPublicBaseUrl(): string | null {
  if (typeof window === 'undefined') return null
  const h = window.location.hostname.toLowerCase()
  if (TC_PUBLIC_HOSTS.includes(h)) {
    return `${window.location.protocol}//${window.location.host}`
  }
  return null
}
