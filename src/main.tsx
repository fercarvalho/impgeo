import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import './index.css'

// Bug 5 corrigido: verificar se window.fetch existe antes de fazer o monkey-patch
if (window.fetch) {
  // Bug 7 corrigido: bind(window) garante que originalFetch seja sempre chamado com o contexto correto
  // Sem bind, alguns browsers (Safari/Firefox) lançam TypeError: Illegal invocation
  const originalFetch = window.fetch.bind(window);
  window.fetch = async (...args) => {
    let [resource, config] = args;

    const newConfig = { ...config } as RequestInit;

    let url = '';
    if (typeof resource === 'string') {
      url = resource;
    } else if (resource instanceof URL) {
      url = resource.toString();
    } else if (resource instanceof Request) {
      url = resource.url;
    }

    // Bug 4 corrigido: verificar se a URL é do mesmo domínio antes de injetar o token
    // Bug 8 corrigido: startsWith(origin) tem falso positivo — "https://app.com.evil.com" passaria
    // se origin fosse "https://app.com". Usar new URL().origin para comparação exata.
    let isSameOrigin = false;
    if (url.startsWith('/')) {
      isSameOrigin = true;
    } else {
      try {
        isSameOrigin = new URL(url).origin === window.location.origin;
      } catch {
        // URL inválida — não injeta token
      }
    }

    if (isSameOrigin && url.includes('/api/')) {
      // Bug 3 corrigido: try/catch para localStorage que pode lançar SecurityError
      let token: string | null = null;
      try {
        token = localStorage.getItem('authToken');
      } catch {
        // localStorage indisponível (sandbox, modo privado restrito, etc.)
      }

      if (token) {
        if (resource instanceof Request) {
          // Bug 1 corrigido: Request.headers é imutável — criar novo Request com headers atualizados
          const newHeaders = new Headers(resource.headers);
          newHeaders.set('Authorization', `Bearer ${token}`);
          resource = new Request(resource, { headers: newHeaders });
        } else {
          newConfig.headers = {
            ...newConfig.headers,
            'Authorization': `Bearer ${token}`
          };
        }
      }
    }

    // Bug 2 corrigido: separar os dois caminhos — Request não recebe newConfig como segundo arg
    if (resource instanceof Request) {
      return originalFetch(resource);
    }
    return originalFetch(resource, newConfig);
  };
}

// Bug 6 corrigido: verificar existência do elemento antes de usar non-null assertion
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
