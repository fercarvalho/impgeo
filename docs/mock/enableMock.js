// mock/enableMock.js
export async function enableMock() {
  if (!('serviceWorker' in navigator)) return;
  try {
    await navigator.serviceWorker.register('/mock/mock-sw.js', { scope: '/' });
    console.info('[IMPGEO MOCK] Service Worker registrado.');
  } catch (err) {
    console.warn('[IMPGEO MOCK] Falha ao registrar SW:', err);
  }
}