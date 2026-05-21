/* eslint-disable no-restricted-globals */
// Service Worker único pros 3 PWAs (impgeo, tc-public, tc-admin).
//
// O APP_ID é derivado do hostname do scope do SW, não de query string ou
// import.meta — porque o SW roda em contexto isolado e o registro é sempre
// /sw.js?v=<hash> (a query só serve pra invalidar cache do browser do
// próprio script SW).
//
// Estratégias por APP_ID:
//   - impgeo:    shell + aviso. Navigation falha → /offline.html.
//                APIs network-only; 503 sintético com x-sw-offline: 1.
//   - tc-public: read-only. GETs em allowlist → stale-while-revalidate.
//                Mutações network-only; 503 sintético offline.
//   - tc-admin:  read-only (mesma estratégia).
//
// __BUILD_HASH__ é substituído pelo plugin do Vite em closeBundle. Em dev
// (se algum dia o SW for ativado lá) fica a string literal — aceita.

const VERSION = '__BUILD_HASH__';

const TC_PUBLIC_HOSTS = ['terracontrol.viverdepj.com.br', 'terracontrol.local'];
const TC_ADMIN_HOSTS  = ['admin.terracontrol.viverdepj.com.br', 'admin.terracontrol.local'];

function detectAppIdFromScope(scope) {
  try {
    const h = new URL(scope).hostname.toLowerCase();
    if (TC_PUBLIC_HOSTS.includes(h)) return 'tc-public';
    if (TC_ADMIN_HOSTS.includes(h))  return 'tc-admin';
    return 'impgeo';
  } catch {
    return 'impgeo';
  }
}

const APP_ID = detectAppIdFromScope(self.registration.scope);
const CACHE_PRECACHE = `${APP_ID}-precache-${VERSION}`;
const CACHE_RUNTIME  = `${APP_ID}-runtime-${VERSION}`;

// Recursos do shell pré-cacheados em install.
// index.html é cacheado em runtime (depende do navigation handler).
const PRECACHE_URLS = [
  '/offline.html',
  `/manifests/${APP_ID}.webmanifest`,
];

// Allowlist de endpoints GET pra cachear (só read-only PWAs usam).
// Deny-by-default — qualquer endpoint fora daqui é network-only.
//
// Regras pra incluir um endpoint aqui:
//   1. Resposta é específica do usuário autenticado (não tem token na URL).
//   2. Cachear o body por algumas horas não causa problema de segurança ou
//      consistência grave (read-only — sempre revalida online).
//   3. NÃO é endpoint de auth (login/refresh/logout/recuperar/resetar) nem
//      endpoint público com token na URL (share-links públicos, invite,
//      validar-token) — esses são one-shot ou sensíveis.
const TC_GET_ALLOWLIST = [
  /^\/api\/tc-auth\/me$/,
  /^\/api\/tc-auth\/me\/records(\?.*)?$/,
  /^\/api\/tc-auth\/me\/records\/[\w-]+$/,
  /^\/api\/tc-auth\/me\/share-links(\?.*)?$/,
  /^\/api\/tc-auth\/notifications(\?.*)?$/,
];

const TC_ADMIN_GET_ALLOWLIST = [
  /^\/api\/auth\/me$/,
  /^\/api\/terracontrol(\?.*)?$/,
  /^\/api\/terracontrol\/share-links(\?.*)?$/,
];

function getAllowlist(appId) {
  if (appId === 'tc-public') return TC_GET_ALLOWLIST;
  if (appId === 'tc-admin')  return TC_ADMIN_GET_ALLOWLIST;
  return [];
}

function isApiAllowlisted(pathname, search) {
  const full = pathname + (search || '');
  return getAllowlist(APP_ID).some((re) => re.test(full));
}

function syntheticOfflineResponse() {
  return new Response(
    JSON.stringify({ error: 'offline', message: 'Sem conexão' }),
    {
      status: 503,
      statusText: 'Service Unavailable',
      headers: { 'Content-Type': 'application/json', 'x-sw-offline': '1' },
    }
  );
}

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_PRECACHE);
    await cache.addAll(PRECACHE_URLS).catch(() => {
      // Alguns arquivos podem não existir num PWA específico (ex: offline.html
      // só importa pro impgeo). Falhar silenciosamente em vez de bloquear o install.
    });
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keep = new Set([CACHE_PRECACHE, CACHE_RUNTIME]);
    const all = await caches.keys();
    await Promise.all(
      all
        .filter((k) => k.startsWith(`${APP_ID}-`) && !keep.has(k))
        .map((k) => caches.delete(k))
    );
    await self.clients.claim();
  })());
});

// Dispatcher de fetch — escolhe estratégia baseado em APP_ID + tipo de request.
self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    // Mutações: network-first sempre; offline devolve 503 sintético.
    event.respondWith(handleMutation(request));
    return;
  }

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return; // cross-origin: deixa passar

  // Navigation (HTML do app shell).
  if (request.mode === 'navigate') {
    event.respondWith(handleNavigation(request));
    return;
  }

  // Static assets (com hash no nome) — cache-first.
  if (url.pathname.startsWith('/assets/') || url.pathname.startsWith('/icons/')) {
    event.respondWith(handleStaticAsset(request));
    return;
  }

  // API GETs — depende da estratégia do APP_ID.
  if (url.pathname.startsWith('/api/')) {
    if (APP_ID === 'impgeo') {
      event.respondWith(handleApiNetworkOnly(request));
    } else {
      event.respondWith(handleApiReadOnly(request, url));
    }
    return;
  }

  // Default: network, fallback cache.
  event.respondWith(handleDefault(request));
});

async function handleNavigation(request) {
  try {
    const fresh = await fetch(request);
    const cache = await caches.open(CACHE_RUNTIME);
    cache.put(request, fresh.clone()).catch(() => {});
    return fresh;
  } catch {
    const cached = await caches.match(request);
    if (cached) return cached;
    const offline = await caches.match('/offline.html');
    if (offline) return offline;
    return new Response('<h1>Sem conexão</h1>', {
      status: 503,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });
  }
}

async function handleStaticAsset(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  try {
    const fresh = await fetch(request);
    const cache = await caches.open(CACHE_RUNTIME);
    cache.put(request, fresh.clone()).catch(() => {});
    return fresh;
  } catch {
    return new Response('', { status: 504 });
  }
}

async function handleApiNetworkOnly(request) {
  try {
    return await fetch(request);
  } catch {
    return syntheticOfflineResponse();
  }
}

async function handleApiReadOnly(request, url) {
  if (!isApiAllowlisted(url.pathname, url.search)) {
    return handleApiNetworkOnly(request);
  }
  // Stale-while-revalidate.
  const cache = await caches.open(CACHE_RUNTIME);
  const cached = await cache.match(request);
  const networkPromise = fetch(request)
    .then((resp) => {
      if (resp && resp.ok) cache.put(request, resp.clone()).catch(() => {});
      return resp;
    })
    .catch(() => null);
  if (cached) {
    networkPromise.catch(() => {});
    return cached;
  }
  const network = await networkPromise;
  return network || syntheticOfflineResponse();
}

async function handleMutation(request) {
  try {
    return await fetch(request);
  } catch {
    return syntheticOfflineResponse();
  }
}

async function handleDefault(request) {
  try {
    return await fetch(request);
  } catch {
    const cached = await caches.match(request);
    if (cached) return cached;
    return new Response('', { status: 504 });
  }
}

// postMessage do client → SW pra controle (ex: forçar skipWaiting numa update).
self.addEventListener('message', (event) => {
  if (!event.data || typeof event.data !== 'object') return;
  if (event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
