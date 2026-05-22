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

// ─── Web Push handlers ──────────────────────────────────────────────────────
//
// Esta seção é independente do dispatcher de cache acima. O SW recebe pushes
// quando o backend envia via web-push (VAPID), independente do app estar
// aberto, fechado ou nem instalado (PWA standalone).
//
// Payload esperado (montado pelo push-dispatcher.js):
//   {
//     id, title, message, type,
//     related_entity_type, related_entity_id,
//     scope: 'impgeo' | 'tc',
//     foreground_show: boolean,  // user pediu OS-notif mesmo com app aberto?
//     ts
//   }
//
// Regra de foreground:
//   - Se houver clients visible E foreground_show=false → suprime OS-notif,
//     manda postMessage pro app atualizar o sino imediatamente.
//   - Caso contrário → showNotification.
//
// Ícone/badge por APP_ID — cada origin tem sua pasta em /icons/<sub>/.
// Mapeia o APP_ID derivado do scope pro nome do diretório.
const ICON_DIR_BY_APP = {
  'impgeo':    'impgeo',
  'tc-public': 'tc',
  'tc-admin':  'tc-admin',
};
const ICON_DIR = ICON_DIR_BY_APP[APP_ID] || 'impgeo';
const NOTIF_ICON  = `/icons/${ICON_DIR}/icon-192.png`;
const NOTIF_BADGE = `/icons/${ICON_DIR}/icon-192.png`;

function buildNotifTag(payload) {
  // Colapsa notifs sucessivas do mesmo registro num mesmo "slot" do OS.
  // Sem related_entity, cai num tag por tipo (ainda colapsa duplicatas
  // próximas em vez de empilhar dezenas).
  if (payload.related_entity_id && payload.related_entity_type) {
    return `${payload.type}-${payload.related_entity_type}-${payload.related_entity_id}`.slice(0, 60);
  }
  return `${payload.type || 'notif'}-${payload.id || 'noid'}`.slice(0, 60);
}

// URL a abrir/focar quando o user clica na notif. Dependente do APP_ID
// (origin) onde o SW está rodando, NÃO do scope do payload — porque o
// push só chega no origin onde a subscription foi feita, então o user
// está abrindo o app DESTE origin.
function buildClickUrl(payload) {
  // tc_record_created no impgeo: roteamento direto pro módulo TerraControl
  // (mesmo padrão de NotificationBell.tsx:124-130).
  if (APP_ID === 'impgeo' && payload.type === 'tc_record_created') {
    const params = new URLSearchParams({ subsystem: 'especial', module: 'terracontrol' });
    if (payload.related_entity_id) params.set('record', payload.related_entity_id);
    return `/?${params.toString()}`;
  }
  // Default: home do app — sino vai mostrar a notif quando user logar.
  return '/';
}

self.addEventListener('push', (event) => {
  let payload = null;
  try {
    payload = event.data ? event.data.json() : null;
  } catch {
    payload = event.data ? { title: 'Nova notificação', message: event.data.text() } : null;
  }
  if (!payload) return;

  event.waitUntil((async () => {
    // Procura clients deste mesmo SW (mesmo origin) que estejam visíveis.
    const allClients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const hasVisibleClient = allClients.some((c) => c.visibilityState === 'visible' && c.focused);

    // Sempre manda postMessage — quem tiver listener (NotificationBell, etc.)
    // pode atualizar a UI sem esperar polling. Origin é checado implicitamente
    // porque o SW só fala com clients do próprio scope.
    for (const c of allClients) {
      try {
        c.postMessage({ type: 'push-notification', payload });
      } catch { /* cliente fechou no meio — ok */ }
    }

    // Se há cliente visível e user NÃO pediu mostrar com app aberto → fim.
    if (hasVisibleClient && !payload.foreground_show) {
      return;
    }

    await self.registration.showNotification(payload.title || 'Nova notificação', {
      body: payload.message || '',
      icon: NOTIF_ICON,
      badge: NOTIF_BADGE,
      tag: buildNotifTag(payload),
      // renotify=true força beep/buzz mesmo com mesmo tag (notif atualizada).
      renotify: false,
      // data acompanha o evento de click.
      data: {
        url: buildClickUrl(payload),
        payload,
      },
    });
  })());
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || '/';

  event.waitUntil((async () => {
    const allClients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });

    // 1. Tenta achar um client deste origin já aberto — foca e manda mensagem
    //    pra navegar/atualizar (mais leve que abrir aba nova).
    for (const c of allClients) {
      try {
        // Foca o primeiro disponível.
        await c.focus();
        c.postMessage({
          type: 'push-notification-click',
          payload: event.notification.data && event.notification.data.payload,
          url: targetUrl,
        });
        return;
      } catch { /* não focável — tenta o próximo */ }
    }

    // 2. Sem clients abertos → abre janela nova.
    try {
      await self.clients.openWindow(targetUrl);
    } catch { /* navegador bloqueou — paciência */ }
  })());
});

// O browser pode invalidar a subscription periodicamente (rotação interna)
// ou quando o user limpa dados do site. Quando isso acontece, este evento
// dispara — re-subscrevemos com a VAPID atual e mandamos pro backend.
//
// Importante: o re-subscribe roda no contexto do SW, sem cookies do user
// "ativos" no momento. O endpoint POST /subscribe exige auth — se a sessão
// expirou, a re-inscrição falha silenciosamente (401) e o user precisa
// reativar push manualmente. Aceito esse trade-off em vez de tentar refresh
// de auth no SW.
self.addEventListener('pushsubscriptionchange', (event) => {
  event.waitUntil((async () => {
    try {
      // Endpoint VAPID depende do scope. Como o SW não sabe se o user é
      // impgeo ou tc-user neste origin sem cookies, tentamos primeiro o
      // do origin (impgeo → /api/push; tc → /api/tc-auth/push). Se 401, fim.
      const isTcOrigin = APP_ID === 'tc-public';
      const vapidEndpoint = isTcOrigin
        ? '/api/tc-auth/push/vapid-public-key'
        : '/api/push/vapid-public-key';
      const subscribeEndpoint = isTcOrigin
        ? '/api/tc-auth/push/subscribe'
        : '/api/push/subscribe';

      const vapidResp = await fetch(vapidEndpoint, { credentials: 'include' });
      if (!vapidResp.ok) return;
      const { publicKey } = await vapidResp.json();
      if (!publicKey) return;

      const newSub = await self.registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });

      await fetch(subscribeEndpoint, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          endpoint: newSub.endpoint,
          keys: {
            p256dh: arrayBufferToBase64(newSub.getKey('p256dh')),
            auth: arrayBufferToBase64(newSub.getKey('auth')),
          },
          app_id: APP_ID,
        }),
      });
    } catch {
      // Falha silenciosa — UI mostrará "permissão concedida mas sem
      // subscription" se relevante; user pode reativar pelo perfil.
    }
  })());
});

// Helpers VAPID — convertem entre base64url (formato da chave) e Uint8Array
// (formato exigido pelo pushManager.subscribe).
function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

function arrayBufferToBase64(buffer) {
  if (!buffer) return null;
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
  // base64url (sem padding, '+'→'-', '/'→'_'), formato esperado pelo backend.
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
