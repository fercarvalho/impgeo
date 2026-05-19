// Validação e conversão de URLs do Google Maps. Aplicado nos dois componentes
// (autenticado e público) antes de embedar em iframe — sem isso, um admin
// malicioso ou registro adulterado poderia injetar URL arbitrária e usar o
// iframe como vetor de phishing. Cf. G2.5.

const ALLOWED_HOSTS = ['www.google.com', 'google.com', 'maps.google.com']

export const isAllowedMapUrl = (url: string): boolean => {
  if (!url || typeof url !== 'string') return false
  try {
    const u = new URL(url)
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return false
    return ALLOWED_HOSTS.includes(u.hostname)
  } catch {
    return false
  }
}

// Converte URLs de viewer/edit do Google MyMaps para o formato embed.
// Retorna string vazia para URLs não-confiáveis — o caller deve renderizar
// um fallback (aviso) ao receber ''.
export const convertMapUrlToEmbed = (url: string): string => {
  if (!isAllowedMapUrl(url)) return ''
  if (url.includes('/embed')) return url

  const midMatch = url.match(/[?&]mid=([^&]+)/)
  if (midMatch) {
    const mid = midMatch[1]
    return `https://www.google.com/maps/d/embed?mid=${mid}`
  }

  return url
    .replace('/edit', '/embed')
    .replace('/u/0/viewer', '/embed')
    .replace('/viewer', '/embed')
}
