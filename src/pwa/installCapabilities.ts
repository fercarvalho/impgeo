// Detecção de OS / browser e cálculo da estratégia de instalação do PWA.
//
// Cada combinação OS+browser exige uma UX diferente:
//
//   - Android Chrome / Edge / Samsung Internet → prompt programático via
//     beforeinstallprompt (estratégia 'auto')
//   - Android Firefox → prompt nativo dentro do menu do browser; precisamos
//     instruir manualmente ('android-firefox')
//   - iOS / iPadOS Safari → SEM beforeinstallprompt; precisa modal com
//     "Toque em Compartilhar → Adicionar à Tela de Início" ('ios-safari')
//   - iOS Chrome / Firefox / Edge → todos rodam sobre WebKit e não podem
//     instalar PWA; precisamos redirecionar pro Safari ('ios-other-browser')
//   - macOS Safari (17+) → SEM beforeinstallprompt; "Arquivo → Adicionar ao
//     Dock" ou Compartilhar ('macos-safari')
//   - macOS Chrome / Edge → prompt programático ('auto')
//   - macOS Firefox → não suporta PWA instalável ('unsupported')
//   - Windows / Linux Chrome / Edge → prompt programático ('auto')
//   - Windows / Linux Firefox → não suporta ('unsupported')
//
// Detecção de "já instalado":
//   - display-mode: standalone (PWA aberto via ícone)
//   - navigator.standalone === true (iOS Safari standalone)
//   - document.referrer começa com 'android-app://' (TWA)
//   - localStorage flag setado quando appinstalled disparou

export type Platform = 'ios' | 'ipados' | 'android' | 'macos' | 'windows' | 'linux' | 'other'
export type Browser  = 'safari' | 'chrome' | 'edge' | 'firefox' | 'samsung' | 'other'

export type InstallStrategy =
  | 'installed'             // PWA já instalado / rodando standalone — não mostra banner
  | 'auto'                  // beforeinstallprompt disponível — botão dispara prompt nativo
  | 'ios-safari'            // iOS/iPadOS Safari — modal com Share → Adicionar à Tela
  | 'macos-safari'          // macOS Safari — modal com Arquivo → Adicionar ao Dock
  | 'ios-other-browser'     // iOS Chrome/FF/Edge — instruir abrir no Safari
  | 'android-firefox'       // Android Firefox — instruir menu do browser
  | 'unsupported'           // Firefox desktop (Win/Mac/Linux) — não suporta install
  | 'unknown'               // não conseguiu detectar — não mostra banner

export interface InstallCapabilities {
  platform: Platform
  browser: Browser
  isStandalone: boolean
  strategy: InstallStrategy
}

function detectPlatform(): Platform {
  if (typeof navigator === 'undefined') return 'other'
  const ua = navigator.userAgent || ''
  const platform = navigator.platform || ''
  const maxTouchPoints = navigator.maxTouchPoints || 0

  // iPadOS 13+ se identifica como Mac no userAgent — distingue por touch points.
  if (platform === 'MacIntel' && maxTouchPoints > 1) return 'ipados'
  if (/iPad/.test(ua)) return 'ipados'
  if (/iPhone|iPod/.test(ua)) return 'ios'
  if (/Android/i.test(ua)) return 'android'
  if (/Macintosh|Mac OS X/i.test(ua)) return 'macos'
  if (/Windows/i.test(ua)) return 'windows'
  if (/Linux/i.test(ua)) return 'linux'
  return 'other'
}

function detectBrowser(): Browser {
  if (typeof navigator === 'undefined') return 'other'
  const ua = navigator.userAgent || ''
  // Ordem importa — Edge contém "Chrome" no UA, Samsung contém "Chrome", etc.
  if (/Edg\//i.test(ua)) return 'edge'
  if (/SamsungBrowser/i.test(ua)) return 'samsung'
  if (/FxiOS|Firefox/i.test(ua)) return 'firefox'
  if (/CriOS/i.test(ua)) return 'chrome' // Chrome no iOS (que roda WebKit, mas é "Chrome")
  if (/Chrome/i.test(ua) && !/OPR\//i.test(ua)) return 'chrome'
  if (/Safari/i.test(ua) && !/Chrome|CriOS|FxiOS|Edg\//i.test(ua)) return 'safari'
  return 'other'
}

function detectStandalone(): boolean {
  if (typeof window === 'undefined') return false
  try {
    if (window.matchMedia?.('(display-mode: standalone)').matches) return true
  } catch { /* matchMedia indisponível */ }
  // iOS Safari expõe navigator.standalone (true se aberto via ícone na tela)
  const navStandalone = (window.navigator as Navigator & { standalone?: boolean }).standalone
  if (navStandalone === true) return true
  // Android TWA / Trusted Web Activity: referrer começa com 'android-app://'
  if (document.referrer?.startsWith('android-app://')) return true
  return false
}

function deriveStrategy(platform: Platform, browser: Browser, isStandalone: boolean): InstallStrategy {
  if (isStandalone) return 'installed'

  // iOS / iPadOS: SÓ o Safari real consegue instalar. Outros browsers no iOS
  // rodam sobre WebKit (sem APIs de install) e precisam abrir no Safari.
  if (platform === 'ios' || platform === 'ipados') {
    return browser === 'safari' ? 'ios-safari' : 'ios-other-browser'
  }

  // Desktop Safari: macOS 17+ tem "Adicionar ao Dock", mas sem prompt
  // programático. Versões anteriores não suportam install — vamos mostrar
  // a instrução de qualquer forma; quem estiver em versão antiga só vai ver
  // o menu sem a opção.
  if (platform === 'macos' && browser === 'safari') return 'macos-safari'

  // Android Firefox tem install pelo menu de 3 pontos do browser, mas sem
  // beforeinstallprompt — instruímos manualmente.
  if (platform === 'android' && browser === 'firefox') return 'android-firefox'

  // Firefox desktop (Mac/Windows/Linux) não suporta install de PWA.
  if (browser === 'firefox' && (platform === 'macos' || platform === 'windows' || platform === 'linux')) {
    return 'unsupported'
  }

  // Chromium em todas as plataformas tem beforeinstallprompt.
  if (browser === 'chrome' || browser === 'edge' || browser === 'samsung') {
    return 'auto'
  }

  return 'unknown'
}

export function detectInstallCapabilities(): InstallCapabilities {
  const platform = detectPlatform()
  const browser  = detectBrowser()
  const isStandalone = detectStandalone()
  const strategy = deriveStrategy(platform, browser, isStandalone)
  return { platform, browser, isStandalone, strategy }
}
