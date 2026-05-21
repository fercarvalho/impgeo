// Camada cliente da estratégia offline.
//
// Composta por:
//   - useIsOnline()    : hook que reflete navigator.onLine + listeners
//   - attachOfflineInterceptors(api): adiciona um SEGUNDO response interceptor
//     ao axios — não substitui o interceptor de refresh (que continua sendo
//     o primeiro). Detecta ERR_NETWORK e 503 sintético (x-sw-offline: 1) e
//     dispatcha um event que o banner consome.
//
// O OfflineBanner em si é JSX, fica em OfflineBanner.tsx separado pra esse
// arquivo continuar como módulo .ts puro (importável de qualquer lugar).

import type { AxiosInstance, AxiosError } from 'axios'
import { useEffect, useState } from 'react'

export const OFFLINE_EVENT = 'pwa-offline-detected'
export const ONLINE_EVENT  = 'pwa-online-detected'

/** Hook reativo que reflete navigator.onLine + eventos online/offline. */
export function useIsOnline(): boolean {
  const [online, setOnline] = useState<boolean>(() =>
    typeof navigator === 'undefined' ? true : navigator.onLine
  )
  useEffect(() => {
    const goOnline  = () => setOnline(true)
    const goOffline = () => setOnline(false)
    window.addEventListener('online',  goOnline)
    window.addEventListener('offline', goOffline)
    return () => {
      window.removeEventListener('online',  goOnline)
      window.removeEventListener('offline', goOffline)
    }
  }, [])
  return online
}

/**
 * Anexa um response interceptor ao axios que detecta sinais de offline:
 *   - error.code === 'ERR_NETWORK' (rede caiu, browser não conseguiu sequer abrir conexão)
 *   - response.status === 503 + header 'x-sw-offline: 1' (SW devolveu 503 sintético)
 *
 * Em ambos casos dispatcha OFFLINE_EVENT (banner consome). O erro continua
 * propagando — interceptor não engole, só notifica.
 *
 * IMPORTANTE: chamar DEPOIS do interceptor de refresh. O refresh tenta tratar
 * 401 primeiro; só se ele propagar (refresh falhou ou status ≠ 401) é que
 * caímos aqui.
 */
export function attachOfflineInterceptors(api: AxiosInstance): void {
  api.interceptors.response.use(
    (response) => response,
    (error: AxiosError) => {
      const isNetworkErr = error.code === 'ERR_NETWORK' || !error.response
      const swOfflineHeader =
        error.response?.headers &&
        (error.response.headers as Record<string, string>)['x-sw-offline'] === '1'
      const isSyntheticOffline =
        error.response?.status === 503 && swOfflineHeader

      if (isNetworkErr || isSyntheticOffline) {
        try { window.dispatchEvent(new Event(OFFLINE_EVENT)) } catch { /* sw blocked */ }
      }
      return Promise.reject(error)
    }
  )
}
