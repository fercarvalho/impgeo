import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import './index.css'

// Fase 1.3+ (subsistemas) — auth migrou de localStorage/Bearer header para
// cookie httpOnly compartilhado. Aqui garantimos que toda chamada para o
// backend de API envie cookies automaticamente (`credentials: 'include'`).
//
// Cobre 3 casos de "URL é o backend":
//   1. URL relativa (`/api/...`) — passa pelo Vite proxy, mesma origin
//   2. URL com a mesma origin do frontend
//   3. URL absoluta para localhost:9001 em dev (cross-port mas mesmo backend).
//      Cookies não são port-specific, então funcionam mesmo cross-port.
if (window.fetch) {
  // bind(window) garante contexto correto em Safari/Firefox
  const originalFetch = window.fetch.bind(window);

  const needsCredentials = (url: string): boolean => {
    if (!url.includes('/api/')) return false;
    if (url.startsWith('/')) return true;
    try {
      const u = new URL(url);
      if (u.origin === window.location.origin) return true;
      // Dev local: frontend em localhost:9000 chama backend em localhost:9001.
      // Cross-port, mas same hostname — cookies viajam.
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

    if (needsCredentials(url)) {
      if (resource instanceof Request) {
        // Request.credentials é imutável — recriamos
        if (resource.credentials !== 'include') {
          resource = new Request(resource, { credentials: 'include' });
        }
      } else {
        const newConfig: RequestInit = { ...config, credentials: 'include' };
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
