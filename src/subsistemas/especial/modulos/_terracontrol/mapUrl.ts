// Validação e conversão de URLs do Google Maps. Aplicado nos dois componentes
// (autenticado e público) antes de embedar em iframe — sem isso, um admin
// malicioso ou registro adulterado poderia injetar URL arbitrária e usar o
// iframe como vetor de phishing. Cf. G2.5.

// Hosts permitidos para embed direto no iframe.
const EMBED_HOSTS = ['www.google.com', 'google.com', 'maps.google.com']

// Hosts confiáveis para abrir em nova aba (não embedam por restrição do Google).
// goo.gl / maps.app.goo.gl são links curtos do próprio Google Maps app.
const EXTERNAL_ONLY_HOSTS = ['goo.gl', 'maps.app.goo.gl']

export const isAllowedMapUrl = (url: string): boolean => {
  if (!url || typeof url !== 'string') return false
  try {
    const u = new URL(url)
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return false
    return EMBED_HOSTS.includes(u.hostname) || EXTERNAL_ONLY_HOSTS.includes(u.hostname)
  } catch {
    return false
  }
}

// Indica se a URL é confiável MAS não pode ser embedada (só "abrir em nova aba").
// O componente usa isso para esconder o iframe e mostrar uma mensagem alternativa.
export const isExternalOnlyMapUrl = (url: string): boolean => {
  if (!url || typeof url !== 'string') return false
  try {
    const u = new URL(url)
    return EXTERNAL_ONLY_HOSTS.includes(u.hostname)
  } catch {
    return false
  }
}

// Converte URLs do Google Maps para o formato embed.
// Retorna string vazia para URLs não-embedáveis (não-confiáveis ou só-externas).
// O caller deve renderizar um fallback (aviso + botão "abrir em nova aba")
// quando receber ''.
//
// Casos cobertos (G5.2):
//   1. /embed na URL → já é embed, usa direto
//   2. mid=<id> → MyMaps embed (Drive)
//   3. /maps/d/viewer ou /edit → troca para /maps/d/embed (MyMaps legacy)
//   4. /maps/place/... ou /maps?q=... → usa endpoint público
//      https://maps.google.com/maps?q=...&output=embed
//   5. /maps/@lat,lng,zoom → idem, extrai coordenadas
//   6. goo.gl/maps.app.goo.gl → não-embedável (servir só como "abrir em nova aba")
export const convertMapUrlToEmbed = (url: string): string => {
  if (!isAllowedMapUrl(url)) return ''
  if (isExternalOnlyMapUrl(url)) return ''

  // Já é embed? Confia.
  if (url.includes('/embed')) return url

  // Google MyMaps: ?mid=<id>
  const midMatch = url.match(/[?&]mid=([^&]+)/)
  if (midMatch) {
    return `https://www.google.com/maps/d/embed?mid=${midMatch[1]}`
  }

  // MyMaps com viewer/edit no path → troca por /embed (formato legado)
  if (url.includes('/maps/d/')) {
    return url
      .replace('/edit', '/embed')
      .replace('/u/0/viewer', '/embed')
      .replace('/viewer', '/embed')
  }

  // /maps/place/Nome+do+local/@lat,lng,zoom/...
  // /maps/@lat,lng,zoom
  // /maps?q=lat,lng — fallback: usar o "output=embed" do endpoint público
  try {
    const u = new URL(url)
    // 1ª tentativa: extrair coordenadas do path (@lat,lng[,zoom])
    const coordMatch = u.pathname.match(/@(-?\d+\.?\d*),(-?\d+\.?\d*)/)
    if (coordMatch) {
      const [, lat, lng] = coordMatch
      return `https://maps.google.com/maps?q=${lat},${lng}&z=15&output=embed`
    }
    // 2ª tentativa: query string q=...
    const q = u.searchParams.get('q')
    if (q) {
      return `https://maps.google.com/maps?q=${encodeURIComponent(q)}&output=embed`
    }
    // 3ª tentativa: query string ll=lat,lng
    const ll = u.searchParams.get('ll')
    if (ll) {
      return `https://maps.google.com/maps?q=${encodeURIComponent(ll)}&output=embed`
    }
  } catch {
    // segue para fallback
  }

  // Nada extraível — esconde iframe e deixa caller cair no fallback "abrir em nova aba".
  return ''
}
