#!/usr/bin/env node
// Gera todos os PNGs de PWA pros 3 apps (impgeo, tc, tc-admin) a partir
// dos logos-fonte em public/. Determinístico — committar a saída.
//
// Uso:  node scripts/generate-icons.mjs
// Requer: sharp (devDependency)
//
// Outputs (por app):
//   icon-192.png          — manifest, purpose: any
//   icon-512.png          — manifest, purpose: any
//   maskable-192.png      — purpose: maskable (com safe zone)
//   maskable-512.png      — purpose: maskable
//   apple-touch-icon-180.png — iOS home screen (NÃO maskable)
//   favicon.ico           — fallback browser tab (only impgeo + tc)
//   splash-{6 sizes}.png  — iOS apple-touch-startup-image
//
// O badge "ADMIN" do tc-admin é desenhado via SVG composite.

import { promises as fs } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const PUBLIC_DIR = path.join(ROOT, 'public')

const SOURCES = {
  impgeo:     path.join(PUBLIC_DIR, 'logo_pwa.png'),
  tc:         path.join(PUBLIC_DIR, 'logo_terracontrol.png'),
  // tc-admin reusa logo_terracontrol.png e adiciona badge ADMIN.
  'tc-admin': path.join(PUBLIC_DIR, 'logo_terracontrol.png'),
}

const THEME = {
  impgeo:     { bg: '#0a1a3e', accent: '#1d4ed8' },
  tc:         { bg: '#0a1a0e', accent: '#48A326' },
  'tc-admin': { bg: '#0a1a3e', accent: '#0041B1' },
}

const ICON_SIZES = [192, 512]
const APPLE_TOUCH_SIZE = 180
const SPLASH_SIZES = [
  { w: 750,  h: 1334 },
  { w: 1125, h: 2436 },
  { w: 1242, h: 2688 },
  { w: 1170, h: 2532 },
  { w: 1290, h: 2796 },
  { w: 1668, h: 2388 },
]

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true })
}

function hexToRgb(hex) {
  const m = hex.replace('#', '')
  const n = parseInt(m, 16)
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 }
}

async function loadSource(src) {
  return sharp(src).png().toBuffer()
}

async function renderIcon({ srcBuffer, size, bg, padding = 0.1 }) {
  const inner = Math.round(size * (1 - padding * 2))
  const offset = Math.round((size - inner) / 2)
  const fg = await sharp(srcBuffer).resize(inner, inner, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).toBuffer()
  const { r, g, b } = hexToRgb(bg)
  return sharp({ create: { width: size, height: size, channels: 4, background: { r, g, b, alpha: 1 } } })
    .composite([{ input: fg, top: offset, left: offset }])
    .png()
    .toBuffer()
}

async function renderTransparentIcon({ srcBuffer, size }) {
  // apple-touch-icon prefere ícone sem transparência mas com aspect square.
  return sharp(srcBuffer).resize(size, size, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 1 } }).png().toBuffer()
}

async function renderSplash({ srcBuffer, w, h, bg }) {
  const inner = Math.round(Math.min(w, h) * 0.35)
  const fg = await sharp(srcBuffer).resize(inner, inner, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).toBuffer()
  const { r, g, b } = hexToRgb(bg)
  const left = Math.round((w - inner) / 2)
  const top = Math.round((h - inner) / 2)
  return sharp({ create: { width: w, height: h, channels: 4, background: { r, g, b, alpha: 1 } } })
    .composite([{ input: fg, top, left }])
    .png()
    .toBuffer()
}

async function addAdminBadge(buffer, size) {
  // Faixa "ADMIN" diagonal no canto superior direito.
  const ribbonSize = Math.round(size * 0.4)
  const fontSize = Math.round(size * 0.08)
  const svg = `
    <svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
      <g transform="translate(${size - ribbonSize}, 0)">
        <polygon points="0,0 ${ribbonSize},0 ${ribbonSize},${ribbonSize}" fill="#0041B1" opacity="0.95"/>
        <text x="${ribbonSize * 0.7}" y="${ribbonSize * 0.35}" font-family="Helvetica, Arial, sans-serif" font-size="${fontSize}" font-weight="700" fill="#ffffff" text-anchor="middle" transform="rotate(45 ${ribbonSize * 0.7} ${ribbonSize * 0.35})">ADMIN</text>
      </g>
    </svg>
  `
  return sharp(buffer).composite([{ input: Buffer.from(svg), top: 0, left: 0 }]).png().toBuffer()
}

async function generateAppIcons(app, sourcePath) {
  const outDir = path.join(PUBLIC_DIR, 'icons', app === 'impgeo' ? 'impgeo' : app === 'tc' ? 'tc' : 'tc-admin')
  await ensureDir(outDir)

  const srcBuffer = await loadSource(sourcePath)
  const themeKey = app
  const { bg } = THEME[themeKey]

  console.log(`[${app}] ícones em ${outDir}`)

  for (const size of ICON_SIZES) {
    let icon = await renderIcon({ srcBuffer, size, bg: '#ffffff', padding: 0.05 })
    let maskable = await renderIcon({ srcBuffer, size, bg, padding: 0.18 })
    if (app === 'tc-admin') {
      icon = await addAdminBadge(icon, size)
      maskable = await addAdminBadge(maskable, size)
    }
    await fs.writeFile(path.join(outDir, `icon-${size}.png`), icon)
    await fs.writeFile(path.join(outDir, `maskable-${size}.png`), maskable)
  }

  let apple = await renderTransparentIcon({ srcBuffer, size: APPLE_TOUCH_SIZE })
  if (app === 'tc-admin') apple = await addAdminBadge(apple, APPLE_TOUCH_SIZE)
  await fs.writeFile(path.join(outDir, `apple-touch-icon-180.png`), apple)

  // Favicon (aba do navegador) — logo em 64px, fundo transparente.
  const favicon = await sharp(srcBuffer)
    .resize(64, 64, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer()
  await fs.writeFile(path.join(outDir, 'favicon.png'), favicon)

  for (const { w, h } of SPLASH_SIZES) {
    const splash = await renderSplash({ srcBuffer, w, h, bg })
    await fs.writeFile(path.join(outDir, `splash-${w}x${h}.png`), splash)
  }
}

async function main() {
  for (const [app, src] of Object.entries(SOURCES)) {
    try {
      await fs.access(src)
    } catch {
      console.warn(`[skip] fonte não encontrada: ${src}`)
      continue
    }
    await generateAppIcons(app, src)
  }
  console.log('\n✓ Ícones gerados.')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
