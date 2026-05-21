// Registro do Service Worker. Em PR #1 esta função existe mas NÃO é chamada
// no boot — main.tsx mantém a chamada comentada. Ativaremos por origin nos
// PRs #3 (impgeo), #4 (tc-public), #5 (tc-admin).
//
// O SW é sempre /sw.js (mesmo arquivo, dispatcher interno por APP_ID derivado
// do scope). Versão lida de __BUILD_HASH__ injetada pelo plugin do Vite em
// build time, garantindo invalidação a cada deploy.

export interface RegisterSWOptions {
  /** Não registra em dev (HMR do Vite briga com cache do SW). */
  skipInDev?: boolean
  /** Callback quando uma nova versão tá pronta pra ativar. */
  onUpdateAvailable?: (registration: ServiceWorkerRegistration) => void
  /** Callback quando o SW assume controle pela 1ª vez. */
  onReady?: (registration: ServiceWorkerRegistration) => void
}

export async function registerSW(options: RegisterSWOptions = {}): Promise<ServiceWorkerRegistration | null> {
  const { skipInDev = true, onUpdateAvailable, onReady } = options

  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) {
    return null
  }

  // Vite expõe import.meta.env.DEV em build. Em prod fica false.
  const isDev = Boolean((import.meta as ImportMeta & { env?: { DEV?: boolean } }).env?.DEV)
  if (skipInDev && isDev) {
    return null
  }

  const buildHash =
    (window as unknown as { __BUILD_HASH__?: string }).__BUILD_HASH__ ?? 'dev'

  try {
    const registration = await navigator.serviceWorker.register(
      `/sw.js?v=${encodeURIComponent(buildHash)}`,
      { scope: '/' }
    )

    if (registration.waiting && navigator.serviceWorker.controller) {
      onUpdateAvailable?.(registration)
    }

    registration.addEventListener('updatefound', () => {
      const newWorker = registration.installing
      if (!newWorker) return
      newWorker.addEventListener('statechange', () => {
        if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
          onUpdateAvailable?.(registration)
        }
      })
    })

    if (registration.active) {
      onReady?.(registration)
    }

    return registration
  } catch (err) {
    console.error('[pwa] registerSW falhou:', err)
    return null
  }
}

/**
 * Ativa o kill switch: substitui o SW atual por um vazio que limpa caches e
 * se auto-desregistra. Usar em emergência (SW hijackeado, bug grave em cache).
 */
export async function activateKillSwitch(): Promise<void> {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return
  try {
    await navigator.serviceWorker.register('/sw-killswitch.js', { scope: '/' })
  } catch (err) {
    console.error('[pwa] kill switch falhou:', err)
  }
}
