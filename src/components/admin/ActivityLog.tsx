import { useEffect, useMemo, useState } from 'react';
import { Download } from 'lucide-react';
import { getAdminApiBaseUrl, getAuthHeaders } from './api';

interface ActivityItem {
  id: string;
  username: string | null;
  action: string;
  moduleKey: string | null;
  entityType: string | null;
  entityId: string | null;
  createdAt: string;
  details?: Record<string, unknown>;
}

const ActivityLog: React.FC = () => {
  const apiBase = useMemo(() => getAdminApiBaseUrl(), []);
  const [items, setItems] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [pageSize] = useState(20);
  const [filters, setFilters] = useState({ search: '', moduleKey: '', action: '' });

  const load = async () => {
    try {
      setLoading(true);
      setError(null);
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(pageSize)
      });
      if (filters.search.trim()) params.set('search', filters.search.trim());
      if (filters.moduleKey.trim()) params.set('moduleKey', filters.moduleKey.trim());
      if (filters.action.trim()) params.set('action', filters.action.trim());

      const response = await fetch(`${apiBase}/admin/activity-log?${params.toString()}`, { headers: getAuthHeaders() });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Erro ao carregar atividades');
      setItems(data.data || []);
      setTotal(data.total || 0);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar atividades');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [page]);

  const onFilter = () => {
    setPage(1);
    load();
  };

  const exportData = (format: 'csv' | 'json') => {
    if (format === 'json') {
      const blob = new Blob([JSON.stringify(items, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `activity-log-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      return;
    }
    const headers = ['data', 'usuario', 'acao', 'modulo', 'entidade', 'id_entidade'];
    const rows = items.map((item) => [
      new Date(item.createdAt).toLocaleString('pt-BR'),
      item.username || '',
      item.action,
      item.moduleKey || '',
      item.entityType || '',
      item.entityId || ''
    ]);
    const csv = [headers.join(','), ...rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `activity-log-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const totalPages = Math.max(Math.ceil(total / pageSize), 1);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-gray-900">Atividades</h2>
        <div className="flex items-center gap-2">
          <button onClick={() => exportData('csv')} className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-gray-100 text-gray-700 hover:bg-gray-200">
            <Download className="h-4 w-4" />
            CSV
          </button>
          <button onClick={() => exportData('json')} className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-gray-100 text-gray-700 hover:bg-gray-200">
            <Download className="h-4 w-4" />
            JSON
          </button>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow p-4 grid grid-cols-1 md:grid-cols-4 gap-3">
        <input value={filters.search} onChange={(e) => setFilters((p) => ({ ...p, search: e.target.value }))} placeholder="Busca livre" className="px-3 py-2 border rounded-lg" />
        <input value={filters.moduleKey} onChange={(e) => setFilters((p) => ({ ...p, moduleKey: e.target.value }))} placeholder="Módulo (ex: admin)" className="px-3 py-2 border rounded-lg" />
        <input value={filters.action} onChange={(e) => setFilters((p) => ({ ...p, action: e.target.value }))} placeholder="Ação (ex: edit)" className="px-3 py-2 border rounded-lg" />
        <button onClick={onFilter} className="px-3 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700">Filtrar</button>
      </div>

      {error && <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-2 rounded-lg">{error}</div>}

      <div className="bg-white rounded-lg shadow overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Data</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Usuário</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Ação</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Módulo</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Entidade</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 bg-white">
            {loading ? (
              <tr><td className="px-4 py-6 text-gray-500" colSpan={5}>Carregando...</td></tr>
            ) : items.length === 0 ? (
              <tr><td className="px-4 py-6 text-gray-500" colSpan={5}>Nenhum registro encontrado</td></tr>
            ) : items.map((item) => (
              <tr key={item.id}>
                <td className="px-4 py-3 text-sm text-gray-700">{new Date(item.createdAt).toLocaleString('pt-BR')}</td>
                <td className="px-4 py-3 text-sm text-gray-700">{item.username || '-'}</td>
                <td className="px-4 py-3 text-sm text-gray-700">{item.action}</td>
                <td className="px-4 py-3 text-sm text-gray-700">{item.moduleKey || '-'}</td>
                <td className="px-4 py-3 text-sm text-gray-700">{item.entityType || '-'} {item.entityId ? `#${item.entityId}` : ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between">
        <span className="text-sm text-gray-600">Total: {total}</span>
        <div className="flex items-center gap-2">
          <button disabled={page <= 1} onClick={() => setPage((p) => Math.max(p - 1, 1))} className="px-3 py-1.5 rounded bg-gray-100 text-gray-700 disabled:opacity-50">Anterior</button>
          <span className="text-sm text-gray-700">{page} / {totalPages}</span>
          <button disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)} className="px-3 py-1.5 rounded bg-gray-100 text-gray-700 disabled:opacity-50">Próxima</button>
        </div>
      </div>
    </div>
  );
};

export default ActivityLog;
