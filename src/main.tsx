import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import './index.css'

// Fase 1.3 (subsistemas) — auth migrou de localStorage/Bearer header para
// cookie httpOnly compartilhado entre subdomínios. Aqui só garantimos que
// toda chamada same-origin para /api envie cookies automaticamente
// (`credentials: 'include'`). O backend continua aceitando header
// Authorization durante a transição, mas o frontend não envia mais.
if (window.fetch) {
  // bind(window) garante contexto correto em Safari/Firefox
  const originalFetch = window.fetch.bind(window);
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

    let isSameOrigin = false;
    if (url.startsWith('/')) {
      isSameOrigin = true;
    } else {
      try {
        isSameOrigin = new URL(url).origin === window.location.origin;
      } catch {
        // URL inválida — não toca
      }
    }

    if (isSameOrigin && url.includes('/api/')) {
      if (resource instanceof Request) {
        // Request.credentials é imutável — recriamos com credentials: 'include'
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
