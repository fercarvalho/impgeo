// Banner que convida o usuário a instalar o PWA.
//
// Comportamento:
//   - Não aparece se o PWA já está instalado (display-mode: standalone, etc.)
//   - Não aparece se foi instalado nesta sessão (appinstalled event)
//   - Não aparece se foi dispensado recentemente (TTL 7 dias em localStorage)
//   - Não aparece se a estratégia é 'unknown' (não conseguimos detectar nada útil)
//   - Botão de ação muda conforme OS/browser:
//       * 'auto'              → "Instalar app" (dispara prompt nativo)
//       * 'ios-safari'        → "Como instalar no iPhone" (abre modal)
//       * 'macos-safari'      → "Como instalar no Mac" (abre modal)
//       * 'ios-other-browser' → "Como instalar no iPhone" (abre modal explicando Safari)
//       * 'android-firefox'   → "Como instalar" (abre modal)
//       * 'unsupported'       → "Saiba mais" (abre modal com sugestão de browser)

import React, { useMemo, useState } from 'react'
import { Download, Smartphone, Monitor, X } from 'lucide-react'
import {
  detectInstallCapabilities,
  type InstallCapabilities,
  type InstallStrategy,
} from '@/pwa/installCapabilities'
import { promptInstall, useCanInstall, useWasJustInstalled, useIsAppInstalled, isMarkedAsInstalled } from '@/pwa/installPrompt'
import { getCurrentAppId } from '@/pwa/appId'
import PwaInstallHowToModal from './PwaInstallHowToModal'

// Nome humano-amigável usado no banner e no modal de instruções. tc-admin
// vira "TerraControl" (não "TC Admin") porque é a marca que o usuário
// reconhece ao decidir instalar — o "TC Admin" continua sendo só o
// short_name do manifest pra diferenciar o ícone no launcher.
const APP_HUMAN_NAME: Record<ReturnType<typeof getCurrentAppId>, string> = {
  'impgeo':    'IMPGEO',
  'tc-public': 'TerraControl',
  'tc-admin':  'TerraControl',
}

const DISMISS_KEY = 'pwa-install-banner-dismissed-at'
const DISMISS_TTL_MS = 7 * 24 * 60 * 60 * 1000 // 7 dias

function isRecentlyDismissed(): boolean {
  try {
    const raw = localStorage.getItem(DISMISS_KEY)
    if (!raw) return false
    const ts = Number(raw)
    if (!Number.isFinite(ts)) return false
    return (Date.now() - ts) < DISMISS_TTL_MS
  } catch {
    return false
  }
}

function dismissNow(): void {
  try { localStorage.setItem(DISMISS_KEY, String(Date.now())) } catch { /* storage bloqueado */ }
}

interface ButtonConfig {
  label: string
  icon: React.ReactNode
  /** true → dispara prompt programático; false → abre modal de instruções. */
  isProgrammatic: boolean
}

function getButtonConfig(strategy: InstallStrategy): ButtonConfig | null {
  switch (strategy) {
    case 'auto':
      return { label: 'Instalar app', icon: <Download className="w-4 h-4" />, isProgrammatic: true }
    case 'ios-safari':
      return { label: 'Como instalar no iPhone', icon: <Smartphone className="w-4 h-4" />, isProgrammatic: false }
    case 'macos-safari':
      return { label: 'Como instalar no Mac', icon: <Monitor className="w-4 h-4" />, isProgrammatic: false }
    case 'ios-other-browser':
      return { label: 'Como instalar no iPhone', icon: <Smartphone className="w-4 h-4" />, isProgrammatic: false }
    case 'android-firefox':
      return { label: 'Como instalar', icon: <Smartphone className="w-4 h-4" />, isProgrammatic: false }
    case 'unsupported':
      return { label: 'Saiba mais', icon: <Monitor className="w-4 h-4" />, isProgrammatic: false }
    default:
      return null
  }
}

const PwaInstallBanner: React.FC = () => {
  // Capacidades não mudam em runtime (depende só do device/browser).
  const caps: InstallCapabilities = useMemo(() => detectInstallCapabilities(), [])
  const canInstallProgrammatic = useCanInstall()
  const wasJustInstalled = useWasJustInstalled()
  // Detecta PWA já instalado mesmo quando acessando via aba comum (não
  // standalone). Resolve bug do Chrome desktop: depois de instalar, ao abrir
  // o site numa aba normal, beforeinstallprompt NÃO dispara — banner ficava
  // preso em "Preparando…".
  //
  // 3 camadas de detecção combinadas (any-of):
  //   1. caps.isStandalone        → display-mode standalone (PWA aberto via ícone)
  //   2. wasJustInstalled         → appinstalled disparou nesta sessão
  //   3. useIsAppInstalled        → getInstalledRelatedApps() (depende do
  //                                 manifest ter related_applications NA HORA
  //                                 da instalação — pode falhar pra PWAs
  //                                 instalados antes do related_applications
  //                                 ter sido adicionado)
  //   4. markedAsInstalled (init) → flag persistente em localStorage setada
  //                                 quando appinstalled disparou em qualquer
  //                                 sessão passada. Cobre o caso de quem
  //                                 fechou o browser depois de instalar.
  const isAlreadyInstalled = useIsAppInstalled()
  const markedAsInstalled = useMemo(() => isMarkedAsInstalled(), [])
  const [dismissed, setDismissed] = useState<boolean>(() => isRecentlyDismissed())
  const [showHowTo, setShowHowTo] = useState(false)
  const appName = APP_HUMAN_NAME[getCurrentAppId()]

  // Atalho silencioso: qualquer sinal de já instalado → não mostra banner.
  if (caps.isStandalone || wasJustInstalled || isAlreadyInstalled || markedAsInstalled || dismissed) return null
  if (caps.strategy === 'installed' || caps.strategy === 'unknown') return null

  const button = getButtonConfig(caps.strategy)
  if (!button) return null

  // 'auto' depende do beforeinstallprompt ter sido capturado pelo browser. Se
  // ainda não foi (pode levar alguns segundos), não escondemos o banner — só
  // mostramos o botão desabilitado / com label "Preparando…" até ficar pronto.
  const programmaticReady = caps.strategy === 'auto' ? canInstallProgrammatic : true

  const handleClick = async () => {
    if (button.isProgrammatic) {
      await promptInstall()
      // Não tratamos 'dismissed' como dispensa permanente — usuário pode ter
      // clicado em Cancelar por engano. O banner continua aparecendo (com
      // botão "Preparando…" até o browser re-disparar beforeinstallprompt
      // na próxima carga da página). Dispensa "definitiva" (7 dias) só
      // acontece quando o usuário clica explicitamente no X.
      // Se 'accepted', o appinstalled dispara e o useWasJustInstalled
      // esconde o banner automaticamente.
    } else {
      setShowHowTo(true)
    }
  }

  const handleDismiss = () => {
    dismissNow()
    setDismissed(true)
  }

  return (
    <>
      <div
        className="mb-6 rounded-xl border border-blue-200 dark:border-blue-800/60 bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-950/40 dark:to-indigo-950/40 px-4 py-3 sm:px-5 sm:py-4 flex items-start gap-3 sm:gap-4 shadow-sm"
        role="region"
        aria-label="Convite para instalar o aplicativo"
      >
        <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-blue-600 dark:bg-blue-500 text-white flex items-center justify-center">
          <Download className="w-5 h-5" />
        </div>

        <div className="flex-1 min-w-0">
          <p className="text-sm sm:text-base font-semibold text-gray-900 dark:text-gray-100">
            Instale o {appName} como aplicativo
          </p>
          <p className="mt-0.5 text-xs sm:text-sm text-gray-600 dark:text-gray-400 leading-relaxed">
            Acesso rápido pela tela inicial, abre em janela própria e funciona melhor offline.
          </p>
        </div>

        <div className="flex-shrink-0 flex items-center gap-2">
          <button
            onClick={handleClick}
            disabled={!programmaticReady}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 sm:px-4 sm:py-2 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 disabled:cursor-not-allowed text-white text-xs sm:text-sm font-medium shadow-sm transition-colors"
          >
            {button.icon}
            <span className="hidden sm:inline">{programmaticReady ? button.label : 'Preparando…'}</span>
            <span className="sm:hidden">{programmaticReady ? 'Instalar' : '…'}</span>
          </button>
          <button
            onClick={handleDismiss}
            className="p-1.5 rounded-lg text-gray-500 hover:text-gray-700 hover:bg-white/60 dark:text-gray-400 dark:hover:text-gray-200 dark:hover:bg-gray-800/60"
            aria-label="Dispensar por 7 dias"
            title="Dispensar por 7 dias"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      <PwaInstallHowToModal
        isOpen={showHowTo}
        strategy={caps.strategy}
        appName={appName}
        onClose={() => setShowHowTo(false)}
      />
    </>
  )
}

export default PwaInstallBanner
