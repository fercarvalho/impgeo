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
function jsonResponse(data, status = 200) { return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } }); }
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
  if (path === '/api/auth/verify' && req.method === 'POST') return jsonResponse({ valid: true, ...MOCK_DB.auth });
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
  if (url.pathname.startsWith('/api/')) { event.respondWith(handleApi(event.request)); }
});