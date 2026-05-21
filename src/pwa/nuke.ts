// Limpa caches + IndexedDB do PWA atual no logout.
//
// Importante: só apaga recursos do APP_ID corrente — se o usuário tem
// impgeo E tc-admin instalados no mesmo browser, deslogar de um NÃO pode
// estourar o cache do outro. Filtramos por prefixo do nome do cache.
//
// Não desregistra o SW por padrão (ele continua útil pra próxima sessão).

import { getCurrentAppId } from './appId'
import { deletePwaDb } from './db'

const STORAGE_KEEP_KEYS = new Set([
  'impgeo-theme-preference',
  'tc-pwa-cookie-consent',
])

export interface NukeOptions {
  unregisterSW?: boolean
}

export async function nukePwaState(options: NukeOptions = {}): Promise<void> {
  const appId = getCurrentAppId()
  const prefix = `${appId}-`

  if (typeof caches !== 'undefined') {
    try {
      const all = await caches.keys()
      await Promise.all(
        all.filter((k) => k.startsWith(prefix)).map((k) => caches.delete(k))
      )
    } catch (err) {
      console.warn('[pwa.nuke] falha ao limpar Cache API:', err)
    }
  }

  try {
    await deletePwaDb(appId)
  } catch (err) {
    console.warn('[pwa.nuke] falha ao limpar IndexedDB:', err)
  }

  for (const storage of [sessionStorage, localStorage]) {
    try {
      const toRemove: string[] = []
      for (let i = 0; i < storage.length; i++) {
        const key = storage.key(i)
        if (key && !STORAGE_KEEP_KEYS.has(key)) toRemove.push(key)
      }
      for (const k of toRemove) storage.removeItem(k)
    } catch {
      // storage bloqueado — ignora
    }
  }

  if (options.unregisterSW && typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
    try {
      const regs = await navigator.serviceWorker.getRegistrations()
      await Promise.all(regs.map((r) => r.unregister()))
    } catch (err) {
      console.warn('[pwa.nuke] falha ao desregistrar SW:', err)
    }
  }
}
