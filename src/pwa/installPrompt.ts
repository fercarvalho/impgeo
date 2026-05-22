// Captura e gating do prompt nativo de instalação do PWA.
//
// Política por app:
//   - impgeo:    sempre disponível (login obrigatório)
//   - tc-admin:  sempre disponível (login obrigatório)
//   - tc-public: SÓ disponível após login do tc_user — visitante anônimo via
//                link compartilhado não vê o convite de instalação
//
// O evento 'beforeinstallprompt' só dispara uma vez por sessão e precisa ser
// preventDefault() imediatamente pra ser usado depois. Por isso capturamos
// no boot, guardamos, e disponibilizamos via API.

import { useEffect, useState } from 'react'
import { getCurrentAppId, type AppId } from './appId'

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>
}

let deferredPrompt: BeforeInstallPromptEvent | null = null
let isAuthenticated = false

const PWA_INSTALL_EVENT = 'pwa-install-eligible'
const PWA_INSTALLED_EVENT = 'pwa-installed'
const PWA_PROMPT_RESOLVED_EVENT = 'pwa-prompt-resolved'

export function setupInstallPrompt(): void {
  if (typeof window === 'undefined') return

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault()
    deferredPrompt = e as BeforeInstallPromptEvent
    if (canPromptNow()) {
      window.dispatchEvent(new Event(PWA_INSTALL_EVENT))
    }
  })

  window.addEventListener('appinstalled', () => {
    deferredPrompt = null
    window.dispatchEvent(new Event(PWA_INSTALLED_EVENT))
  })
}

/** Chamado pelos contextos de auth quando o usuário loga/desloga. */
export function setAuthState(authenticated: boolean): void {
  const wasAuth = isAuthenticated
  isAuthenticated = authenticated
  if (!wasAuth && authenticated && deferredPrompt && canPromptNow()) {
    window.dispatchEvent(new Event(PWA_INSTALL_EVENT))
  }
}

function canPromptNow(appId: AppId = getCurrentAppId()): boolean {
  if (appId === 'tc-public') return isAuthenticated
  return true
}

export function canInstall(): boolean {
  return deferredPrompt !== null && canPromptNow()
}

export async function promptInstall(): Promise<'accepted' | 'dismissed' | 'unavailable'> {
  if (!deferredPrompt || !canPromptNow()) return 'unavailable'
  try {
    await deferredPrompt.prompt()
    const choice = await deferredPrompt.userChoice
    deferredPrompt = null
    window.dispatchEvent(new Event(PWA_PROMPT_RESOLVED_EVENT))
    return choice.outcome
  } catch {
    return 'unavailable'
  }
}

export const PWA_EVENTS = {
  installEligible: PWA_INSTALL_EVENT,
  installed: PWA_INSTALLED_EVENT,
  promptResolved: PWA_PROMPT_RESOLVED_EVENT,
} as const

/**
 * Hook reativo — retorna true quando há um prompt programático disponível
 * (beforeinstallprompt já capturado E gating de autenticação ok). Re-renderiza
 * quando o evento chega depois da montagem, quando o app é instalado, ou
 * quando o usuário confirma/dispensa o prompt.
 */
export function useCanInstall(): boolean {
  const [can, setCan] = useState<boolean>(() => canInstall())
  useEffect(() => {
    const refresh = () => setCan(canInstall())
    window.addEventListener(PWA_INSTALL_EVENT, refresh)
    window.addEventListener(PWA_INSTALLED_EVENT, refresh)
    window.addEventListener(PWA_PROMPT_RESOLVED_EVENT, refresh)
    return () => {
      window.removeEventListener(PWA_INSTALL_EVENT, refresh)
      window.removeEventListener(PWA_INSTALLED_EVENT, refresh)
      window.removeEventListener(PWA_PROMPT_RESOLVED_EVENT, refresh)
    }
  }, [])
  return can
}

/**
 * Hook reativo — true quando o appinstalled foi disparado nesta sessão.
 * Útil pra esconder o banner imediatamente após instalação.
 */
export function useWasJustInstalled(): boolean {
  const [installed, setInstalled] = useState(false)
  useEffect(() => {
    const onInstalled = () => setInstalled(true)
    window.addEventListener(PWA_INSTALLED_EVENT, onInstalled)
    return () => window.removeEventListener(PWA_INSTALLED_EVENT, onInstalled)
  }, [])
  return installed
}
