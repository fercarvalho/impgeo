// Fonte única de verdade pra identidade do PWA por origin.
//
// O hostname determina qual PWA o usuário tá usando — cada um tem manifest,
// theme color, estratégia de Service Worker e ícones próprios.
//
// Mantemos isso isolado do tc-domains.ts (que decide qual entry React renderizar)
// porque o appId é usado também no SW (sem acesso a TS) e num <script> inline
// no index.html que roda antes do main.tsx. Hardcoded por hostname pra
// performance e zero dependências.

import { TC_PUBLIC_HOSTS, TC_ADMIN_HOSTS } from '@/subsistemas/especial/tc-domains'

export type AppId = 'impgeo' | 'tc-public' | 'tc-admin'

export function detectAppId(hostname: string = ''): AppId {
  const h = (hostname || '').toLowerCase()
  if (TC_PUBLIC_HOSTS.includes(h)) return 'tc-public'
  if (TC_ADMIN_HOSTS.includes(h))  return 'tc-admin'
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
  'tc-admin':  '#0041B1',
}

export const APP_BACKGROUND_COLOR: Record<AppId, string> = {
  'impgeo':    '#0a1a3e',
  'tc-public': '#0a1a0e',
  'tc-admin':  '#0a1a3e',
}

export const APP_DISPLAY_NAME: Record<AppId, string> = {
  'impgeo':    'IMPGEO',
  'tc-public': 'TerraControl',
  'tc-admin':  'TC Admin',
}
