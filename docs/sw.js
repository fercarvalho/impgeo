// mock/mock-sw.js
const MOCK_DB = {
  auth: { token: 'demo-token', user: { id: 'u_1', name: 'Demo User', role: 'ADMIN' } },
  clients: [{ id: 'c_1', name: 'IMPGEO', email: 'contato@impgeo.com.br' },{ id: 'c_2', name: 'Cliente Beta', email: 'beta@empresa.com' }],
  products: [{ id: 'p_1', name: 'Serviço de Geoprocessamento', price: 3200.00, category: 'geo' },{ id: 'p_2', name: 'Consultoria', price: 1800.00, category: 'consulting' }],
  projects: [{ id: 'pr_1', name: 'Projeto Reurb', clientId: 'c_1', status: 'ongoing', value: 15000 },{ id: 'pr_2', name: 'Plano Diretor', clientId: 'c_2', status: 'planning', value: 22000 }],
  services: [{ id: 's_1', name: 'Mapeamento', category: 'geo', price: 1200 },{ id: 's_2', name: 'Regularização', category: 'reg', price: 1500 }],
  subcategories: [{ id: 'sc_1', name: 'Operacional' },{ id: 'sc_2', name: 'Administrativo' }],
  transactions: [
    { id: 't_1', type: 'income', amount: 3500.00, category: 'geo', date: '2025-09-01', clientId: 'c_1' },
    { id: 't_2', type: 'expense', amount: 450.00, category: 'tools', date: '2025-09-03' },
    { id: 't_3', type: 'income', amount: 1800.00, category: 'consulting', date: '2025-09-10', clientId: 'c_2' }
  ],
  budget: { monthly: 20000, spent: 5400 },
  goals: [{ id: 'g_1', period: '2025-09', revenue: 25000, expense: 8000 },{ id: 'g_2', period: '2025-10', revenue: 27000, expense: 9000 }]
};
self.addEventListener('install', (e) => { self.skipWaiting(); });
self.addEventListener('activate', (e) => { e.waitUntil(self.clients.claim()); });
async function jsonResponse(data, status = 200, delayMs = 400) {
  // small randomized delay to mimic real network latency (demo realism)
  await new Promise(res => setTimeout(res, delayMs));
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}
function notFound() { return jsonResponse({ error: 'Not found (mock)' }, 404); }
function uid(prefix){ return (prefix || 'id') + '_' + Math.random().toString(36).slice(2, 9); }
async function handleApi(req) {
  const url = new URL(req.url); const path = url.pathname;
  if (path === '/api/auth/login' && req.method === 'POST') {
    const body = await req.json().catch(() => ({}));
    const { username, password } = body;

    // Demo credentials: username: "superadmin", password: "123456"
    if (username === 'superadmin' && password === '123456') {
      // return a realistic auth payload used by the app
      return jsonResponse({
        token: 'demo-token',
        user: { id: 'u_1', name: 'Super Admin', role: 'ADMIN' }
      });
    }

    // invalid credentials
    return jsonResponse({ error: 'Usuário ou senha incorretos' }, 401);
  }
  if (path === '/api/auth/verify' && req.method === 'POST') {
    // accept token from Authorization header (Bearer) or JSON body { token }
    const authHeader = req.headers.get('Authorization') || '';
    const body = await req.json().catch(() => ({}));
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : (body.token || '');
    if (token && token === MOCK_DB.auth.token) {
      return jsonResponse({ valid: true, user: MOCK_DB.auth.user });
    }
    return jsonResponse({ valid: false }, 401);
  }
  if (path === '/api/auth/logout' && req.method === 'POST') {
    // demo logout: no server-side state, just return ok
    return jsonResponse({ ok: true });
  }
  const collections = ['clients','products','projects','services','transactions','subcategories'];
  for (const col of collections) {
    if (path === `/api/${col}`) {
      if (req.method === 'GET') return jsonResponse(MOCK_DB[col]);
      if (req.method === 'POST') { const body = await req.json().catch(() => ({})); const item = { id: uid(col[0]), ...body }; MOCK_DB[col].push(item); return jsonResponse(item, 201); }
      if (req.method === 'DELETE') { MOCK_DB[col] = []; return jsonResponse({ ok: true }); }
    }
    if (path.startsWith(`/api/${col}/`)) {
      const id = path.split('/').pop(); const idx = MOCK_DB[col].findIndex(i => i.id === id);
      if (req.method === 'GET') { const item = MOCK_DB[col].find(i => i.id === id); return item ? jsonResponse(item) : notFound(); }
      if (req.method === 'PUT') { const body = await req.json().catch(() => ({})); if (idx === -1) return notFound(); MOCK_DB[col][idx] = { ...MOCK_DB[col][idx], ...body }; return jsonResponse(MOCK_DB[col][idx]); }
      if (req.method === 'DELETE') { if (idx === -1) return notFound(); MOCK_DB[col].splice(idx, 1); return jsonResponse({ ok: true }); }
    }
  }
  if (path === '/api/budget') {
    if (req.method === 'GET') return jsonResponse(MOCK_DB.budget);
    if (req.method === 'PUT') { const body = await req.json().catch(() => ({})); MOCK_DB.budget = { ...MOCK_DB.budget, ...body }; return jsonResponse(MOCK_DB.budget); }
  }
  if (path === '/api/import' && req.method === 'POST') return jsonResponse({ ok: true, imported: true });
  if (path === '/api/export' && req.method === 'POST') return jsonResponse({ ok: true, url: '#mock-export.pdf' });
  return notFound();
}
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  const path = url.pathname;

  // 1) Reescreve caminhos absolutos de assets para /app/* (corrige imagens/logo/rodapé no Pages)
  const prefixes = ['/assets/', '/images/', '/img/', '/icons/'];
  if (path === '/favicon.ico' || prefixes.some(p => path.startsWith(p))) {
    const newPath = path === '/favicon.ico' ? '/app/favicon.ico' : '/app' + path;
    const rewrittenUrl = new URL(newPath, url.origin);

    const init = {
      method: event.request.method,
      headers: event.request.headers,
      mode: event.request.mode,
      credentials: event.request.credentials,
      cache: event.request.cache,
      redirect: event.request.redirect,
      referrer: event.request.referrer,
      referrerPolicy: event.request.referrerPolicy
    };
    // body só em métodos que suportam
    if (event.request.method !== 'GET' && event.request.method !== 'HEAD') {
      init.body = event.request.body;
      try { init.duplex = event.request.duplex; } catch (_) {}
    }

    event.respondWith(fetch(new Request(rewrittenUrl, init)));
    return;
  }

  // 2) Mock de API
  if (path.startsWith('/api/')) {
    event.respondWith(handleApi(event.request));
    return;
  }
});