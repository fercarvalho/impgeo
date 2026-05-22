// Sino de notificações do tc_user — versão do NotificationBell do impgeo
// adaptada pra usar:
//   - Endpoints /api/tc-auth/notifications/* (em vez de /api/notifications)
//   - Authorization: Bearer <tcToken> + credentials: 'include'
//   - Estilo do header verde→azul (texto branco/azul claro)
//
// Mantém as mesmas operações: listar, marcar lida, marcar todas lidas, limpar
// (esconder do sininho), limpar todas, excluir, excluir todas. Polling a cada
// 30 segundos enquanto a aba estiver aberta.

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Bell, BellOff, Check, EyeOff, Trash2, CheckCheck, Eraser } from 'lucide-react'
import { useTcAuth } from '@/contexts/TcAuthContext'
import {
  isWebPushSupported,
  getCurrentPermissionState,
  requestPermissionAndSubscribe,
  unsubscribe as unsubscribePush,
  getActiveSubscriptionEndpoint,
  getDeniedHelpText,
  type PermissionState,
} from '@/pwa/push'
import { usePushBridge } from '@/hooks/usePushBridge'

const API_BASE_URL = '/api'
const POLL_INTERVAL_MS = 30_000

interface TcNotification {
  id: string
  tc_user_id: string
  notification_type: string
  title: string
  message: string | null
  related_entity_type: string | null
  related_entity_id: string | null
  is_read: boolean
  read_at: string | null
  cleared: boolean
  cleared_at: string | null
  created_at: string
}

const TcNotificationBell: React.FC = () => {
  const { tcToken } = useTcAuth()
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState<TcNotification[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [confirmDeleteAll, setConfirmDeleteAll] = useState(false)
  const dropdownRef = useRef<HTMLDivElement | null>(null)

  const authedInit = useCallback((extra: RequestInit = {}): RequestInit => ({
    ...extra,
    credentials: 'include',
    headers: {
      ...(extra.headers as Record<string, string> | undefined),
      ...(tcToken ? { Authorization: `Bearer ${tcToken}` } : {}),
    },
  }), [tcToken])

  const fetchNotifications = useCallback(async () => {
    try {
      const r = await fetch(`${API_BASE_URL}/tc-auth/notifications`, authedInit())
      const j = await r.json()
      if (j.success) {
        setItems(j.data || [])
        setUnreadCount(j.unreadCount || 0)
      }
    } catch {/* silencioso (rede) */}
  }, [authedInit])

  useEffect(() => {
    if (!tcToken) return
    fetchNotifications()
    const t = setInterval(fetchNotifications, POLL_INTERVAL_MS)
    return () => clearInterval(t)
  }, [fetchNotifications, tcToken])

  // Ponte SW → UI: atualização imediata do sino quando push chega com app
  // visível (modo foreground-quiet). Filtra payloads do scope tc.
  usePushBridge({
    scopeFilter: 'tc',
    onPush: () => { fetchNotifications() },
  })

  // Estado do Web Push neste dispositivo (mesmo padrão do NotificationBell impgeo)
  const [pushPermission, setPushPermission] = useState<PermissionState>('unsupported')
  const [pushSubscribed, setPushSubscribed] = useState<boolean>(false)
  const [pushBusy, setPushBusy] = useState<boolean>(false)
  const [pushMessage, setPushMessage] = useState<string | null>(null)

  // Headers extras com Bearer pra push.ts atravessar bem cookie + token em
  // qualquer ambiente. Memoizado pra não invalidar refs do hook a cada render.
  const pushAuthHeaders = useMemo<Record<string, string>>(() => {
    const h: Record<string, string> = {}
    if (tcToken) h.Authorization = `Bearer ${tcToken}`
    return h
  }, [tcToken])

  const refreshPushState = useCallback(async () => {
    const state = getCurrentPermissionState()
    setPushPermission(state)
    if (state === 'granted') {
      const endpoint = await getActiveSubscriptionEndpoint()
      setPushSubscribed(!!endpoint)
    } else {
      setPushSubscribed(false)
    }
  }, [])

  useEffect(() => { if (open) refreshPushState() }, [open, refreshPushState])

  const handleEnablePush = async () => {
    if (pushBusy) return
    setPushBusy(true); setPushMessage(null)
    const r = await requestPermissionAndSubscribe({ authHeaders: pushAuthHeaders })
    setPushMessage(r.ok ? 'Notificações ativadas neste dispositivo.' : r.error)
    await refreshPushState()
    setPushBusy(false)
  }
  const handleDisablePush = async () => {
    if (pushBusy) return
    setPushBusy(true); setPushMessage(null)
    const r = await unsubscribePush({ authHeaders: pushAuthHeaders })
    setPushMessage(r.ok ? 'Notificações desativadas neste dispositivo.' : r.error)
    await refreshPushState()
    setPushBusy(false)
  }

  // Fecha dropdown ao clicar fora
  useEffect(() => {
    if (!open) return
    const onClick = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) setOpen(false)
    }
    window.addEventListener('mousedown', onClick)
    return () => window.removeEventListener('mousedown', onClick)
  }, [open])

  const markRead = async (id: string) => {
    try {
      await fetch(`${API_BASE_URL}/tc-auth/notifications/${id}/read`, authedInit({ method: 'PATCH' }))
      setItems((prev) => prev.map((n) => (n.id === id ? { ...n, is_read: true } : n)))
      setUnreadCount((c) => Math.max(0, c - 1))
    } catch {}
  }

  const markAllRead = async () => {
    try {
      await fetch(`${API_BASE_URL}/tc-auth/notifications/read-all`, authedInit({ method: 'PATCH' }))
      setItems((prev) => prev.map((n) => ({ ...n, is_read: true })))
      setUnreadCount(0)
    } catch {}
  }

  const clearOne = async (id: string) => {
    try {
      await fetch(`${API_BASE_URL}/tc-auth/notifications/${id}/clear`, authedInit({ method: 'PATCH' }))
      setItems((prev) => {
        const removed = prev.find((n) => n.id === id)
        if (removed && !removed.is_read) setUnreadCount((c) => Math.max(0, c - 1))
        return prev.filter((n) => n.id !== id)
      })
    } catch {}
  }

  const clearAll = async () => {
    try {
      await fetch(`${API_BASE_URL}/tc-auth/notifications/clear-all`, authedInit({ method: 'PATCH' }))
      setItems([])
      setUnreadCount(0)
    } catch {}
  }

  const deleteOne = async (id: string) => {
    try {
      await fetch(`${API_BASE_URL}/tc-auth/notifications/${id}`, authedInit({ method: 'DELETE' }))
      setItems((prev) => {
        const removed = prev.find((n) => n.id === id)
        if (removed && !removed.is_read) setUnreadCount((c) => Math.max(0, c - 1))
        return prev.filter((n) => n.id !== id)
      })
    } catch {}
  }

  const deleteAll = async () => {
    try {
      await fetch(`${API_BASE_URL}/tc-auth/notifications`, authedInit({ method: 'DELETE' }))
      setItems([])
      setUnreadCount(0)
      setConfirmDeleteAll(false)
    } catch {}
  }

  const handleClickNotification = async (n: TcNotification) => {
    if (!n.is_read) await markRead(n.id)
    // No futuro: roteamento baseado em notification_type (ex: abrir registro X)
  }

  const stop = (e: React.MouseEvent) => e.stopPropagation()

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="relative p-2 text-white hover:bg-white/10 rounded-lg transition-colors"
        title="Notificações"
        aria-label="Notificações"
      >
        <Bell className="w-5 h-5" />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 flex items-center justify-center bg-red-500 text-white text-[10px] font-bold rounded-full">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-96 max-w-[calc(100vw-2rem)] max-h-[70vh] bg-white dark:bg-gray-800 rounded-xl shadow-2xl border border-gray-200 dark:border-gray-700 z-50 flex flex-col overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700 bg-gradient-to-r from-tc-green/10 to-tc-blue/10 dark:from-tc-green/20 dark:to-tc-blue/20">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100">
                Notificações {items.length > 0 && <span className="text-xs text-gray-500 dark:text-gray-400">({items.length})</span>}
              </h3>
            </div>
            {items.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {unreadCount > 0 && (
                  <button onClick={markAllRead} className="flex items-center gap-1 text-[11px] px-2 py-1 bg-tc-blue/10 hover:bg-tc-blue/20 text-tc-blue rounded font-semibold">
                    <CheckCheck className="w-3 h-3" /> Marcar todas como lidas
                  </button>
                )}
                <button onClick={clearAll} className="flex items-center gap-1 text-[11px] px-2 py-1 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 rounded font-semibold">
                  <Eraser className="w-3 h-3" /> Limpar todas
                </button>
                <button onClick={() => setConfirmDeleteAll(true)} className="flex items-center gap-1 text-[11px] px-2 py-1 bg-red-100 hover:bg-red-200 dark:bg-red-900/30 dark:hover:bg-red-900/50 text-red-700 dark:text-red-300 rounded font-semibold">
                  <Trash2 className="w-3 h-3" /> Excluir todas
                </button>
              </div>
            )}

            {/* Toggle de Web Push neste dispositivo. Mesmo padrão UX do
                NotificationBell impgeo, paleta tc (verde). */}
            {pushPermission !== 'unsupported' && isWebPushSupported() && (
              <div className="mt-2 pt-2 border-t border-tc-green/20">
                {pushPermission === 'default' && (
                  <button
                    onClick={handleEnablePush}
                    disabled={pushBusy}
                    className="w-full flex items-center justify-center gap-1.5 text-[11px] px-2 py-1.5 bg-tc-green/10 hover:bg-tc-green/20 text-tc-green-dark rounded font-semibold disabled:opacity-50"
                  >
                    <Bell className="w-3 h-3" />
                    {pushBusy ? 'Ativando…' : 'Ativar notificações neste navegador'}
                  </button>
                )}
                {pushPermission === 'granted' && !pushSubscribed && (
                  <button
                    onClick={handleEnablePush}
                    disabled={pushBusy}
                    className="w-full flex items-center justify-center gap-1.5 text-[11px] px-2 py-1.5 bg-tc-green/10 hover:bg-tc-green/20 text-tc-green-dark rounded font-semibold disabled:opacity-50"
                  >
                    <Bell className="w-3 h-3" />
                    {pushBusy ? 'Reativando…' : 'Reativar notificações neste navegador'}
                  </button>
                )}
                {pushPermission === 'granted' && pushSubscribed && (
                  <button
                    onClick={handleDisablePush}
                    disabled={pushBusy}
                    className="w-full flex items-center justify-center gap-1.5 text-[11px] px-2 py-1.5 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 rounded font-semibold disabled:opacity-50"
                  >
                    <BellOff className="w-3 h-3" />
                    {pushBusy ? 'Desativando…' : 'Desativar notificações neste navegador'}
                  </button>
                )}
                {pushPermission === 'denied' && (
                  <p className="text-[10.5px] text-gray-600 dark:text-gray-400 px-1 py-0.5">
                    Notificações bloqueadas. {getDeniedHelpText()}
                  </p>
                )}
                {pushPermission === 'pwa-not-installed-ios' && (
                  <p className="text-[10.5px] text-gray-600 dark:text-gray-400 px-1 py-0.5">
                    Para receber notificações no iPhone, toque em <strong>Compartilhar → Adicionar à Tela de Início</strong>.
                  </p>
                )}
                {pushMessage && (
                  <p className="mt-1 text-[10.5px] text-gray-600 dark:text-gray-400 px-1">{pushMessage}</p>
                )}
              </div>
            )}
          </div>

          {confirmDeleteAll && (
            <div className="px-4 py-3 bg-red-50 dark:bg-red-900/20 border-b border-red-200 dark:border-red-800/50">
              <p className="text-xs font-semibold text-red-800 dark:text-red-200 mb-2">Excluir TODAS as notificações permanentemente?</p>
              <div className="flex gap-2">
                <button onClick={deleteAll} className="text-xs px-3 py-1 bg-red-600 hover:bg-red-700 text-white rounded font-bold">Sim, excluir</button>
                <button onClick={() => setConfirmDeleteAll(false)} className="text-xs px-3 py-1 bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-800 dark:text-gray-200 rounded font-semibold">Cancelar</button>
              </div>
            </div>
          )}

          <div className="flex-1 overflow-y-auto">
            {items.length === 0 ? (
              <p className="text-center text-sm text-gray-500 py-8">Nenhuma notificação</p>
            ) : (
              <ul className="divide-y divide-gray-100 dark:divide-gray-700">
                {items.map((n) => (
                  <li
                    key={n.id}
                    onClick={() => handleClickNotification(n)}
                    className={`group relative p-3 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors ${n.is_read ? 'opacity-70' : ''}`}
                  >
                    <div className="flex items-start gap-2">
                      {!n.is_read && <span className="mt-1.5 w-2 h-2 bg-tc-green rounded-full flex-shrink-0" />}
                      <div className="flex-1 min-w-0 pr-16">
                        <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{n.title}</p>
                        {n.message && <p className="text-xs text-gray-600 dark:text-gray-400 mt-0.5 line-clamp-2">{n.message}</p>}
                        <p className="text-[10px] text-gray-400 mt-1">{new Date(n.created_at).toLocaleString('pt-BR')}</p>
                      </div>
                    </div>

                    <div className="absolute top-2 right-2 hidden group-hover:flex gap-1 bg-white dark:bg-gray-800 rounded-lg shadow-md border border-gray-200 dark:border-gray-700 p-0.5" onClick={stop}>
                      {!n.is_read && (
                        <button
                          onClick={() => markRead(n.id)}
                          title="Marcar como lida"
                          className="p-1.5 text-tc-blue hover:bg-tc-blue/10 rounded"
                        >
                          <Check className="w-3.5 h-3.5" />
                        </button>
                      )}
                      <button
                        onClick={() => clearOne(n.id)}
                        title="Limpar (esconde do sininho)"
                        className="p-1.5 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
                      >
                        <EyeOff className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => deleteOne(n.id)}
                        title="Excluir definitivamente"
                        className="p-1.5 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 rounded"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default TcNotificationBell
