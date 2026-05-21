/* eslint-disable no-restricted-globals */
// SW de emergência. Use trocando o URL do register() pra '/sw-killswitch.js'
// numa release que substitui o sw.js comprometido. O browser detecta scriptURL
// diferente, instala este, ele limpa tudo e se auto-desregistra.
//
// Servir com Cache-Control: no-store, must-revalidate (nginx).

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    try {
      const all = await caches.keys();
      await Promise.all(all.map((k) => caches.delete(k)));
    } catch {}
    try {
      await self.registration.unregister();
    } catch {}
    try {
      const clients = await self.clients.matchAll();
      for (const client of clients) {
        client.navigate(client.url).catch(() => {});
      }
    } catch {}
  })());
});

self.addEventListener('fetch', () => {
  // Não intercepta nada — deixa rede passar normalmente.
});
