// Banner discreto convidando o user a ativar Web Push neste dispositivo.
//
// Visível APENAS quando o user PODE ativar (e ainda não ativou):
//   - permission='default'                  → CTA "Ativar notificações"
//   - permission='granted' && !subscribed   → CTA "Reativar push neste dispositivo"
//                                              (caso raro: user revogou via OS
//                                              mas browser ainda diz granted)
//   - 'pwa-not-installed-ios'               → mensagem orientando install
//
// ESCONDIDO quando:
//   - subscribed (já tem push neste device)
//   - 'denied' (não insistir — user já recusou)
//   - 'unsupported' (não adianta nem mostrar)
//
// Dispensável: clicar "Agora não" persiste timestamp em localStorage e o
// banner some por 7 dias. Após esse prazo, ele volta a aparecer (se o estado
// ainda for "convite válido").
//
// Reativa quando o user troca de estado (ex: instalou o PWA no iOS):
// re-avalia ao montar e quando a janela ganha foco.

import React, { useCallback, useEffect, useState } from 'react'
import { Bell, X, Loader2 } from 'lucide-react'
import {
  isWebPushSupported,
  getCurrentPermissionState,
  requestPermissionAndSubscribe,
  getActiveSubscriptionEndpoint,
  type PermissionState,
} from '@/pwa/push'

const DISMISS_KEY = 'pushBannerDismissedAt'
const DISMISS_TTL_MS = 7 * 24 * 60 * 60 * 1000 // 7 dias

function wasRecentlyDismissed(): boolean {
  try {
    const raw = localStorage.getItem(DISMISS_KEY)
    if (!raw) return false
    const at = parseInt(raw, 10)
    if (!at || Number.isNaN(at)) return false
    return Date.now() - at < DISMISS_TTL_MS
  } catch {
    return false
  }
}

function markDismissed(): void {
  try { localStorage.setItem(DISMISS_KEY, String(Date.now())) } catch { /* ignore */ }
}

function clearDismissed(): void {
  try { localStorage.removeItem(DISMISS_KEY) } catch { /* ignore */ }
}

const PushPermissionBanner: React.FC = () => {
  const [permission, setPermission] = useState<PermissionState>('unsupported')
  const [subscribed, setSubscribed] = useState(false)
  const [dismissed, setDismissed] = useState<boolean>(() => wasRecentlyDismissed())
  const [busy, setBusy] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  const evaluate = useCallback(async () => {
    if (!isWebPushSupported()) {
      setPermission('unsupported')
      setSubscribed(false)
      return
    }
    const p = getCurrentPermissionState()
    setPermission(p)
    if (p === 'granted') {
      const ep = await getActiveSubscriptionEndpoint()
      setSubscribed(!!ep)
    } else {
      setSubscribed(false)
    }
  }, [])

  useEffect(() => { evaluate() }, [evaluate])

  // Reavalia ao voltar foco (user pode ter instalado PWA, aceitado permissão
  // por outra rota, mudado config no OS, etc.).
  useEffect(() => {
    const onFocus = () => evaluate()
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [evaluate])

  const handleActivate = async () => {
    if (busy) return
    setBusy(true); setErrorMsg(null)
    const r = await requestPermissionAndSubscribe()
    if (r.ok) {
      // Limpa o dismiss — se algum dia o user vier a desativar, o banner
      // volta a aparecer normalmente quando o estado o reabilitar.
      clearDismissed()
      setDismissed(false)
      await evaluate()
    } else {
      setErrorMsg(r.error)
      // Em 'denied' o browser dá feedback próprio; em outros casos, o
      // texto abaixo do botão informa o user.
      await evaluate()
    }
    setBusy(false)
  }

  const handleDismiss = () => {
    markDismissed()
    setDismissed(true)
  }

  // Decisão de exibição.
  if (dismissed) return null
  if (!isWebPushSupported() || permission === 'unsupported') return null
  if (permission === 'denied') return null
  if (permission === 'granted' && subscribed) return null
  // Aqui: permission='default' OU ('granted' && !subscribed) OU 'pwa-not-installed-ios'

  const isIosNotInstalled = permission === 'pwa-not-installed-ios'

  return (
    <div
      role="region"
      aria-label="Ativar notificações no navegador"
      className="bg-gradient-to-r from-purple-50 via-indigo-50 to-blue-50 dark:from-purple-900/30 dark:via-indigo-900/30 dark:to-blue-900/30 border border-purple-200 dark:border-purple-800/50 rounded-lg shadow-sm"
    >
      <div className="px-4 py-2.5 flex items-center gap-3">
        <Bell className="w-5 h-5 text-purple-600 dark:text-purple-300 flex-shrink-0" aria-hidden="true" />
        <div className="flex-1 min-w-0">
          {isIosNotInstalled ? (
            <p className="text-sm text-gray-800 dark:text-gray-200">
              <strong>Receba notificações no iPhone:</strong> toque em <strong>Compartilhar</strong> e depois em <strong>Adicionar à Tela de Início</strong> para instalar o app.
            </p>
          ) : (
            <p className="text-sm text-gray-800 dark:text-gray-200">
              <strong>Ative as notificações</strong> para receber avisos importantes no seu dispositivo, mesmo com o app fechado.
            </p>
          )}
          {errorMsg && (
            <p className="text-xs text-red-700 dark:text-red-300 mt-0.5">{errorMsg}</p>
          )}
        </div>

        {!isIosNotInstalled && (
          <button
            type="button"
            onClick={handleActivate}
            disabled={busy}
            className="inline-flex items-center gap-1.5 text-sm px-3 py-1.5 bg-purple-600 hover:bg-purple-700 text-white rounded-lg font-semibold shadow-sm disabled:opacity-60 disabled:cursor-wait whitespace-nowrap"
          >
            {busy ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> : <Bell className="w-4 h-4" aria-hidden="true" />}
            {busy ? 'Ativando…' : 'Ativar notificações'}
          </button>
        )}

        <button
          type="button"
          onClick={handleDismiss}
          aria-label="Dispensar este aviso por 7 dias"
          title="Agora não (volta em 7 dias)"
          className="flex-shrink-0 p-1.5 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 hover:bg-white/40 dark:hover:bg-white/5 rounded transition-colors"
        >
          <X className="w-4 h-4" aria-hidden="true" />
        </button>
      </div>
    </div>
  )
}

export default PushPermissionBanner
