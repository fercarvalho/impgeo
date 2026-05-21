// Schema do IndexedDB do PWA — pré-definido mesmo sem uso no PR atual.
//
// Stores planejadas:
//   - 'cached-responses'  : key = url; value = { body, headers, cachedAt, etag }
//                           Reservada pra quando a estratégia read-only precisar
//                           passar dados do SW pro client além do Cache API
//                           (ex: timestamp pra UI mostrar "dados de hh:mm").
//   - 'pending-mutations' : key = uuid; value = { method, url, body, headers,
//                           createdAt, retries, idempotencyKey }
//                           Vazia até virar full-sync (PR futuro). Quando isso
//                           rolar, basta começar a empilhar mutações offline
//                           sem mexer no schema da DB.
//   - 'sync-state'        : key = scopeKey; value = { lastSyncedAt, cursor }
//                           Estado de sincronização por escopo (ex: 'tc-records').
//                           Também vazia agora.
//
// Cada PWA tem sua própria DB: pwa-impgeo, pwa-tc-public, pwa-tc-admin.
// nuke.ts apaga só a DB do APP_ID atual no logout.

import type { AppId } from './appId'

type IDBOpenDBRequest = ReturnType<typeof indexedDB.open>

const SCHEMA_VERSION = 1

const STORE_NAMES = ['cached-responses', 'pending-mutations', 'sync-state'] as const
export type StoreName = (typeof STORE_NAMES)[number]

export function getDbName(appId: AppId): string {
  return `pwa-${appId}`
}

export function openPwaDb(appId: AppId): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB indisponível neste ambiente'))
      return
    }
    const req: IDBOpenDBRequest = indexedDB.open(getDbName(appId), SCHEMA_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      for (const name of STORE_NAMES) {
        if (!db.objectStoreNames.contains(name)) {
          db.createObjectStore(name)
        }
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

export function deletePwaDb(appId: AppId): Promise<void> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      resolve()
      return
    }
    const req = indexedDB.deleteDatabase(getDbName(appId))
    req.onsuccess = () => resolve()
    req.onerror = () => reject(req.error)
    req.onblocked = () => resolve() // outras abas abertas — deixar passar
  })
}
