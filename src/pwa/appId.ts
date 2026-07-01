// Fonte única de verdade pra identidade do PWA por origin.
//
// O hostname determina qual PWA o usuário tá usando — cada um tem manifest,
// theme color, estratégia de Service Worker e ícones próprios.
//
// Mantemos isso isolado do tc-domains.ts (que decide qual entry React renderizar)
// porque o appId é usado também no SW (sem acesso a TS) e num <script> inline
// no index.html que roda antes do main.tsx. Hardcoded por hostname pra
// performance e zero dependências.
//
// Desde a unificação de domínio existem 2 PWAs: 'impgeo' e 'tc-public'
// (terracontrol.com.br). Não há mais 'tc-admin' — a equipe usa o mesmo PWA do
// TerraControl, com login unificado.

import { TC_PUBLIC_HOSTS } from '@/subsistemas/especial/tc-domains'

export type AppId = 'impgeo' | 'tc-public'

export function detectAppId(hostname: string = ''): AppId {
  const h = (hostname || '').toLowerCase()
  if (TC_PUBLIC_HOSTS.includes(h)) return 'tc-public'
  return 'impgeo'
}

export function getCurrentAppId(): AppId {
  if (typeof window === 'undefined') return 'impgeo'
  // O bloco inline em index.html já calculou — confia se existir.
  const fromWindow = (window as unknown as { __APP_ID__?: AppId }).__APP_ID__
  if (fromWindow) return fromWindow
  return detectAppId(window.location.hostname)
}

export const APP_THEME_COLOR: Record<AppId, string> = {
  'impgeo':    '#1d4ed8',
  'tc-public': '#48A326',
}

export const APP_BACKGROUND_COLOR: Record<AppId, string> = {
  'impgeo':    '#0a1a3e',
  'tc-public': '#0a1a0e',
}

export const APP_DISPLAY_NAME: Record<AppId, string> = {
  'impgeo':    'IMPGEO',
  'tc-public': 'TerraControl',
}
