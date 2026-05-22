// Bridge entre Service Worker e componentes React.
//
// O SW envia postMessage({ type: 'push-notification', payload }) sempre que
// recebe um push — INDEPENDENTE de mostrar OS-notification ou não. Esse
// hook captura essas mensagens e dispara um callback do componente, o que
// permite atualizar UI (sino, badge, etc.) imediatamente, sem esperar o
// próximo polling de 30s.
//
// Também captura 'push-notification-click' (quando o user clica numa
// OS-notif e o SW foca um cliente já aberto), pra UI navegar/abrir modal
// apropriado.
//
// Uso típico:
//
//   usePushBridge({
//     onPush: () => refetchNotifications(),
//     onClick: (payload) => {
//       // payload tem related_entity_type/id pra rotear
//     },
//   })
//
// Sem efeito se o browser não tem serviceWorker (ex: SSR).

import { useEffect, useRef } from 'react'

interface PushBridgePayload {
  id?: string
  title?: string
  message?: string
  type?: string
  related_entity_type?: string | null
  related_entity_id?: string | null
  scope?: 'impgeo' | 'tc'
  foreground_show?: boolean
  ts?: number
}

interface UsePushBridgeOptions {
  /** Disparado a cada push recebido pelo SW (mesmo OS-notif suprimida). */
  onPush?: (payload: PushBridgePayload) => void
  /** Disparado quando o user clica numa OS-notification deste app. */
  onClick?: (payload: PushBridgePayload, url?: string) => void
  /** Filtro opcional por scope — útil pra TcNotificationBell ignorar push impgeo. */
  scopeFilter?: 'impgeo' | 'tc'
}

export function usePushBridge(options: UsePushBridgeOptions = {}): void {
  // Guardamos os callbacks em ref pra evitar re-attach do listener a cada
  // render (que reiniciaria o filtro toda hora).
  const optsRef = useRef(options)
  optsRef.current = options

  useEffect(() => {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return

    const handler = (event: MessageEvent) => {
      const data = event.data
      if (!data || typeof data !== 'object') return

      const payload = (data.payload || {}) as PushBridgePayload

      // Filtro por scope: TcNotificationBell quer só payloads scope='tc';
      // NotificationBell quer só scope='impgeo'. Quando não definido,
      // passa tudo (default).
      if (optsRef.current.scopeFilter && payload.scope && payload.scope !== optsRef.current.scopeFilter) {
        return
      }

      if (data.type === 'push-notification' && optsRef.current.onPush) {
        optsRef.current.onPush(payload)
      } else if (data.type === 'push-notification-click' && optsRef.current.onClick) {
        optsRef.current.onClick(payload, data.url as string | undefined)
      }
    }

    navigator.serviceWorker.addEventListener('message', handler)
    return () => navigator.serviceWorker.removeEventListener('message', handler)
  }, [])
}
