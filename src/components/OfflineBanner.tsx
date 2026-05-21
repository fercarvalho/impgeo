// Banner fixo no topo quando o app detecta que está offline.
//
// Reage a 2 sinais:
//   1. Hook useIsOnline() — navigator.onLine
//   2. Eventos OFFLINE_EVENT/ONLINE_EVENT — disparados pelo interceptor do
//      axios quando uma request falha com ERR_NETWORK ou 503 sintético do SW
//
// Mostra sempre que offline; some quando navigator volta online.

import React, { useEffect, useState } from 'react'
import { useIsOnline, OFFLINE_EVENT } from '@/utils/offlineClient'

const OfflineBanner: React.FC = () => {
  const online = useIsOnline()
  const [recentlyDetectedOffline, setRecentlyDetectedOffline] = useState(false)

  useEffect(() => {
    const onOfflineDetected = () => setRecentlyDetectedOffline(true)
    window.addEventListener(OFFLINE_EVENT, onOfflineDetected)
    return () => window.removeEventListener(OFFLINE_EVENT, onOfflineDetected)
  }, [])

  useEffect(() => {
    if (online) setRecentlyDetectedOffline(false)
  }, [online])

  if (online && !recentlyDetectedOffline) return null

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed top-0 inset-x-0 z-[9999] bg-amber-500 dark:bg-amber-600 text-white px-4 py-2 text-sm font-medium shadow-md flex items-center justify-center gap-2"
    >
      <svg className="w-4 h-4 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 5.636a9 9 0 010 12.728M16.243 8.757a5 5 0 010 7.07M3 3l18 18" />
      </svg>
      <span>Você está offline — algumas ações ficam indisponíveis até a conexão voltar.</span>
    </div>
  )
}

export default OfflineBanner
