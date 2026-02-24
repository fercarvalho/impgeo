import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import './index.css'

const originalFetch = window.fetch;
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

  if (url.includes('/api/')) {
    const token = localStorage.getItem('authToken');
    if (token) {
      if (resource instanceof Request) {
        resource.headers.set('Authorization', `Bearer ${token}`);
      } else {
        newConfig.headers = {
          ...newConfig.headers,
          'Authorization': `Bearer ${token}`
        };
      }
    }
  }

  return originalFetch(resource instanceof Request ? resource : resource, newConfig);
};

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
