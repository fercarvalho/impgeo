import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import './index.css'
import { registerSW } from './pwa/registerSW'
import { setupInstallPrompt } from './pwa/installPrompt'
import { injectIosMeta } from './pwa/iosMeta'
import { getCurrentAppId } from './pwa/appId'

// PWA bootstrap. registerSW por padrão pula em dev (skipInDev: true) pra não
// brigar com HMR do Vite — pra testar localmente, rodar `npm run build && npm run preview`.
// Ativação por origin:
//   - PR #3: impgeo ativo
//   - PR #4: tc-public (em breve)
//   - PR #5: tc-admin (em breve)
{
  const appId = getCurrentAppId()
  // setupInstallPrompt + injectIosMeta podem rodar em todos os origins — são
  // só captura de evento e injeção de meta tags. O install prompt do
  // tc-public é gated internamente em installPrompt.ts (só dispara pós-login).
  setupInstallPrompt()
  injectIosMeta()
  // PR #3/#4/#5: SW ativo em todos os 3 origins. Cada um usa estratégia
  // diferente (shell+aviso pro impgeo; read-only pra tc-public e tc-admin)
  // — selecionada dentro do sw.js pelo dispatcher baseado em APP_ID.
  if (appId === 'impgeo' || appId === 'tc-public' || appId === 'tc-admin') {
    registerSW().catch((err) => console.error('[pwa] registerSW falhou:', err))
  }
}

// Fase 1.3+ (subsistemas) — auth migrou de localStorage/Bearer header para
// cookie httpOnly compartilhado. Aqui garantimos que toda chamada para o
// backend de API:
//   1. Envie cookies automaticamente (`credentials: 'include'`).
//   2. Injete o Authorization Bearer do sessionStorage como fallback. Em dev
//      cross-port (localhost:9000 → localhost:9001) a cookie pode não viajar
//      por restrições de SameSite/secure no Chrome moderno; o header torna
//      a auth confiável independente da cookie. O backend aceita ambos e
//      o header tem prioridade — durante impersonation o impersonationToken
//      já é gravado em `authToken` pelo persistToken(), então a prioridade
//      fica correta automaticamente.
//
// Cobre 3 casos de "URL é o backend":
//   1. URL relativa (`/api/...`) — passa pelo Vite proxy, mesma origin
//   2. URL com a mesma origin do frontend
//   3. URL absoluta para localhost:9001 em dev (cross-port mas mesmo backend).
if (window.fetch) {
  // bind(window) garante contexto correto em Safari/Firefox
  const originalFetch = window.fetch.bind(window);

  const isApiUrl = (url: string): boolean => {
    if (!url.includes('/api/')) return false;
    if (url.startsWith('/')) return true;
    try {
      const u = new URL(url);
      if (u.origin === window.location.origin) return true;
      // Dev local: frontend em localhost:9000 chama backend em localhost:9001.
      const devFrontHosts = ['localhost', '127.0.0.1', '0.0.0.0'];
      if (
        u.hostname === 'localhost' &&
        u.port === '9001' &&
        devFrontHosts.includes(window.location.hostname)
      ) {
        return true;
      }
      return false;
    } catch {
      return false;
    }
  };

  const readPersistedToken = (): string | null => {
    try {
      return (
        sessionStorage.getItem('impersonationToken') ??
        sessionStorage.getItem('authToken')
      );
    } catch {
      return null;
    }
  };

  const hasAuthHeader = (headers: HeadersInit | undefined): boolean => {
    if (!headers) return false;
    if (headers instanceof Headers) return headers.has('authorization');
    if (Array.isArray(headers)) {
      return headers.some(([k]) => String(k).toLowerCase() === 'authorization');
    }
    return Object.keys(headers).some(k => k.toLowerCase() === 'authorization');
  };

  window.fetch = async (...args) => {
    let [resource, config] = args;

    let url = '';
    if (typeof resource === 'string') {
      url = resource;
    } else if (resource instanceof URL) {
      url = resource.toString();
    } else if (resource instanceof Request) {
      url = resource.url;
    }

    if (isApiUrl(url)) {
      const persistedToken = readPersistedToken();

      if (resource instanceof Request) {
        // Request é imutável — recriamos para adicionar credentials/header.
        const needsCreds = resource.credentials !== 'include';
        const needsAuth = persistedToken && !resource.headers.has('authorization');
        if (needsCreds || needsAuth) {
          const init: RequestInit = { credentials: 'include' };
          if (needsAuth) {
            const newHeaders = new Headers(resource.headers);
            newHeaders.set('Authorization', `Bearer ${persistedToken}`);
            init.headers = newHeaders;
          }
          resource = new Request(resource, init);
        }
      } else {
        const newConfig: RequestInit = { ...config, credentials: 'include' };
        if (persistedToken && !hasAuthHeader(config?.headers)) {
          const merged = new Headers(config?.headers);
          merged.set('Authorization', `Bearer ${persistedToken}`);
          newConfig.headers = merged;
        }
        return originalFetch(resource, newConfig);
      }
    }

    if (resource instanceof Request) {
      return originalFetch(resource);
    }
    return originalFetch(resource, config);
  };
}

const rootElement = document.getElementById('root');
if (!rootElement) {
  console.error('[main.tsx] Elemento #root não encontrado no DOM. O app não pode ser iniciado.');
} else {
  ReactDOM.createRoot(rootElement).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
}
