// iOS Safari ignora boa parte do manifest.webmanifest e exige meta tags
// próprias pra suportar PWA decente: capacidade standalone, status bar style,
// nome curto na home screen, ícone touch e splash screens por device.
//
// Como cada PWA (impgeo, tc-public, tc-admin) tem branding diferente,
// injetamos essas tags em runtime baseado em getCurrentAppId(). Apple ignora
// theme-color do manifest mas respeita status-bar-style, então pintamos a
// status bar com a cor de marca via aquele meta.

import { getCurrentAppId, APP_DISPLAY_NAME, type AppId } from './appId'

const SPLASH_SIZES: Array<{ w: number; h: number; ratio: number }> = [
  { w: 750,  h: 1334, ratio: 2 },   // iPhone 8 / SE 2
  { w: 1125, h: 2436, ratio: 3 },   // iPhone X / XS / 11 Pro
  { w: 1242, h: 2688, ratio: 3 },   // iPhone XS Max / 11 Pro Max
  { w: 1170, h: 2532, ratio: 3 },   // iPhone 12-15
  { w: 1290, h: 2796, ratio: 3 },   // iPhone 14/15 Pro Max
  { w: 1668, h: 2388, ratio: 2 },   // iPad Pro 11
]

function appIconDir(appId: AppId): string {
  if (appId === 'tc-public') return '/icons/tc'
  if (appId === 'tc-admin')  return '/icons/tc-admin'
  return '/icons/impgeo'
}

function setMeta(name: string, content: string): void {
  let el = document.head.querySelector<HTMLMetaElement>(`meta[name="${name}"]`)
  if (!el) {
    el = document.createElement('meta')
    el.name = name
    document.head.appendChild(el)
  }
  el.content = content
}

function setLink(rel: string, href: string, attrs: Record<string, string> = {}): void {
  const selector = Object.entries(attrs).reduce(
    (acc, [k, v]) => `${acc}[${k}="${v}"]`,
    `link[rel="${rel}"]`
  )
  let el = document.head.querySelector<HTMLLinkElement>(selector)
  if (!el) {
    el = document.createElement('link')
    el.rel = rel
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v)
    document.head.appendChild(el)
  }
  el.href = href
}

export function injectIosMeta(): void {
  if (typeof document === 'undefined') return
  const appId = getCurrentAppId()
  const iconDir = appIconDir(appId)

  setMeta('apple-mobile-web-app-capable', 'yes')
  setMeta('mobile-web-app-capable', 'yes')
  setMeta('apple-mobile-web-app-status-bar-style', 'black-translucent')
  setMeta('apple-mobile-web-app-title', APP_DISPLAY_NAME[appId])

  setLink('apple-touch-icon', `${iconDir}/apple-touch-icon-180.png`, { sizes: '180x180' })

  for (const { w, h, ratio } of SPLASH_SIZES) {
    const orientation = w < h ? 'portrait' : 'landscape'
    const media = `(device-width: ${Math.round(w / ratio)}px) and (device-height: ${Math.round(h / ratio)}px) and (-webkit-device-pixel-ratio: ${ratio}) and (orientation: ${orientation})`
    setLink('apple-touch-startup-image', `${iconDir}/splash-${w}x${h}.png`, { media })
  }
}
