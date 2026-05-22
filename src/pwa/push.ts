// Cliente de Web Push — pede permissão, gerencia subscription do dispositivo
// e sincroniza com o backend.
//
// Scope-aware: usa getCurrentAppId() pra decidir entre os endpoints impgeo
// (/api/push/*) e tc (/api/tc-auth/push/*). Não precisa parâmetro — cada
// origin já tem um único par de auth ativo via cookie.
//
// O Service Worker é responsabilidade de registerSW.ts — este módulo assume
// que ele já está registrado (chama navigator.serviceWorker.ready).

import { getCurrentAppId } from './appId'

export type PermissionState =
  | 'unsupported'              // browser não tem Push API ou Notification API
  | 'pwa-not-installed-ios'    // iOS Safari sem standalone — precisa instalar pra ativar
  | 'default'                  // user ainda não decidiu
  | 'granted'                  // user permitiu
  | 'denied'                   // user bloqueou (precisa ir nas configs do browser)

interface SubscribeOk { ok: true;  endpoint: string }
interface SubscribeErr { ok: false; error: string }
type SubscribeResult = SubscribeOk | SubscribeErr

interface UnsubscribeOk  { ok: true }
interface UnsubscribeErr { ok: false; error: string }
type UnsubscribeResult = UnsubscribeOk | UnsubscribeErr

// Headers extras aceitos por requestPermissionAndSubscribe / unsubscribe.
// Pro impgeo, basta o cookie httpOnly (vazio); pro tc, o TcAuthContext
// passa { Authorization: 'Bearer ${tcToken}' } como fallback robusto
// (mesma convenção do TcAuthContext.refreshTcUser).
export interface PushAuthOpts {
  authHeaders?: Record<string, string>
}

const IS_IOS = typeof navigator !== 'undefined'
  && /iPad|iPhone|iPod/.test(navigator.userAgent)
  && !(window as unknown as { MSStream?: unknown }).MSStream

function isStandalonePwa(): boolean {
  if (typeof window === 'undefined') return false
  try {
    if (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) return true
    // iOS Safari pré-16.4 usa navigator.standalone
    const nav = navigator as unknown as { standalone?: boolean }
    return nav.standalone === true
  } catch {
    return false
  }
}

export function isWebPushSupported(): boolean {
  if (typeof window === 'undefined') return false
  if (!('serviceWorker' in navigator)) return false
  if (!('PushManager' in window)) return false
  if (typeof Notification === 'undefined') return false
  return true
}

export function getCurrentPermissionState(): PermissionState {
  if (!isWebPushSupported()) return 'unsupported'
  // iOS: Push API exige PWA instalada (16.4+). Se não está em standalone,
  // não adianta nem pedir — a permissão dá certo mas o subscribe falha.
  if (IS_IOS && !isStandalonePwa()) return 'pwa-not-installed-ios'
  return Notification.permission as PermissionState
}

// Cada origin tem seu próprio par de endpoints. Centralizar aqui pra evitar
// strings espalhadas no código de UI.
function endpointsForCurrentApp() {
  const appId = getCurrentAppId()
  const isTc = appId === 'tc-public' // (tc-admin usa auth impgeo, não tc-auth)
  return {
    appId,
    isTc,
    vapidKeyUrl: isTc ? '/api/tc-auth/push/vapid-public-key' : '/api/push/vapid-public-key',
    subscribeUrl: isTc ? '/api/tc-auth/push/subscribe' : '/api/push/subscribe',
  }
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64)
  const arr = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i)
  return arr
}

function arrayBufferToBase64Url(buffer: ArrayBuffer | null): string {
  if (!buffer) return ''
  const bytes = new Uint8Array(buffer)
  let binary = ''
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i])
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

// Pede permissão (UI gesture do user) e cria/atualiza a subscription no
// backend. Idempotente: chamar de novo quando já está ativo só renova o
// last_seen_at.
export async function requestPermissionAndSubscribe(opts: PushAuthOpts = {}): Promise<SubscribeResult> {
  const state = getCurrentPermissionState()
  if (state === 'unsupported') return { ok: false, error: 'Navegador não suporta notificações push.' }
  if (state === 'pwa-not-installed-ios') {
    return { ok: false, error: 'Instale o app na tela inicial (Compartilhar → Adicionar à Tela de Início) para receber notificações.' }
  }
  if (state === 'denied') {
    return { ok: false, error: 'Permissão bloqueada nas configurações do navegador. Reative manualmente em Configurações do site.' }
  }

  try {
    // Notification.requestPermission só dispara o popup do browser se
    // permission === 'default'. Se 'granted', resolve imediatamente.
    const permission = await Notification.requestPermission()
    if (permission !== 'granted') {
      return { ok: false, error: 'Permissão não concedida.' }
    }

    const reg = await navigator.serviceWorker.ready

    // Busca VAPID public key do backend. credentials:'include' = manda cookies.
    // authHeaders adiciona o Bearer pro tc (TcAuthContext o passa explicitamente).
    const { vapidKeyUrl, subscribeUrl, appId } = endpointsForCurrentApp()
    const extra = opts.authHeaders || {}
    const vapidResp = await fetch(vapidKeyUrl, { credentials: 'include', headers: extra })
    if (!vapidResp.ok) {
      return { ok: false, error: `Falha ao buscar chave VAPID (HTTP ${vapidResp.status}). Faça login novamente.` }
    }
    const vapidJson = await vapidResp.json()
    if (!vapidJson.publicKey) {
      return { ok: false, error: 'Servidor não retornou chave VAPID — Web Push pode estar desabilitado.' }
    }

    // Se já existe subscription no SW deste browser, reusa (a PushManager
    // garante 1 por SW). Senão, cria nova.
    let subscription = await reg.pushManager.getSubscription()
    if (!subscription) {
      // Cast: TS 5 tipa Uint8Array com ArrayBufferLike genérico (que inclui
      // SharedArrayBuffer), mas pushManager.subscribe quer ArrayBuffer estrito.
      // Em runtime é o mesmo dado.
      subscription = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidJson.publicKey) as BufferSource,
      })
    }

    const subscribeResp = await fetch(subscribeUrl, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', ...extra },
      body: JSON.stringify({
        endpoint: subscription.endpoint,
        keys: {
          p256dh: arrayBufferToBase64Url(subscription.getKey('p256dh')),
          auth:   arrayBufferToBase64Url(subscription.getKey('auth')),
        },
        app_id: appId,
      }),
    })
    if (!subscribeResp.ok) {
      return { ok: false, error: `Falha ao registrar subscription (HTTP ${subscribeResp.status}).` }
    }

    return { ok: true, endpoint: subscription.endpoint }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return { ok: false, error: msg }
  }
}

// Remove subscription deste dispositivo: backend (DELETE) + browser (unsubscribe).
// Não revoga a permissão — só desliga o envio. Se o user clicar "ativar" de
// novo, não vai precisar pedir permissão de novo.
export async function unsubscribe(opts: PushAuthOpts = {}): Promise<UnsubscribeResult> {
  try {
    if (!isWebPushSupported()) return { ok: true } // nada pra fazer
    const reg = await navigator.serviceWorker.ready
    const subscription = await reg.pushManager.getSubscription()
    if (!subscription) return { ok: true }

    const { subscribeUrl } = endpointsForCurrentApp()
    const extra = opts.authHeaders || {}
    // Tenta avisar o backend primeiro — mas se falhar, ainda assim faz
    // unsubscribe local pra não deixar o user travado.
    try {
      await fetch(subscribeUrl, {
        method: 'DELETE',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', ...extra },
        body: JSON.stringify({ endpoint: subscription.endpoint }),
      })
    } catch { /* ignorar */ }

    await subscription.unsubscribe()
    return { ok: true }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return { ok: false, error: msg }
  }
}

// Devolve instrução curta sobre como reativar a permissão de notificações
// quando o user a bloqueou (permission='denied'). Detecta o browser pelo UA
// e oferece o caminho mais direto.
//
// Não é exato (UA sniffing é frágil), mas o pior caso é cair no texto
// genérico — que ainda funciona. Não usar pra lógica crítica, só UI.
export function getDeniedHelpText(): string {
  if (typeof navigator === 'undefined') {
    return 'Reative em Configurações do site, no seu navegador.'
  }
  const ua = navigator.userAgent
  const isMobile = /Mobi|Android|iPhone|iPad/i.test(ua)

  if (/Edg\//.test(ua)) {
    return 'Edge: clique no cadeado ao lado da URL → "Permissões" → ative Notificações.'
  }
  if (/Firefox\//.test(ua)) {
    return 'Firefox: clique no escudo/cadeado ao lado da URL → "Permissões" → permita Notificações.'
  }
  if (/Chrome\//.test(ua) && !/OPR\//.test(ua)) {
    if (isMobile) {
      return 'Chrome Android: toque nos 3 pontos no topo → "Configurações do site" → Notificações → Permitir.'
    }
    return 'Chrome: clique no cadeado ao lado da URL → "Notificações" → Permitir, e recarregue.'
  }
  if (/Safari\//.test(ua) && !/Chrome\//.test(ua)) {
    if (/iPhone|iPad/.test(ua)) {
      return 'Safari iOS: abra Ajustes do iOS → Notificações → este app → ative "Permitir notificações".'
    }
    return 'Safari Mac: menu Safari → Configurações → Sites → Notificações → permita este site.'
  }
  return 'Reative permissão de notificações nas Configurações do site do seu navegador.'
}

// Retorna o endpoint atualmente ativo neste dispositivo (ou null). Útil pra
// UI saber se deve mostrar "Ativar" ou "Desativar".
export async function getActiveSubscriptionEndpoint(): Promise<string | null> {
  try {
    if (!isWebPushSupported()) return null
    const reg = await navigator.serviceWorker.ready
    const sub = await reg.pushManager.getSubscription()
    return sub ? sub.endpoint : null
  } catch {
    return null
  }
}
