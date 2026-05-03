import React, { useState, useEffect } from 'react';
import {
  Download, Filter, ChevronDown, ChevronRight, Activity, Plus, Pencil, Trash2, LogIn, UserCheck, ChevronLeft
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useModules } from '../../hooks/useModules';
const API_BASE_URL =
  typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
    ? 'http://localhost:9001/api'
    : ((import.meta as any).env?.VITE_API_URL || '/api');

interface ActivityLog {
  id: string;
  userId: string;
  username: string;
  action: string;
  moduleKey: string;
  entityType?: string;
  entityId?: string;
  details?: any;
  createdAt: string;
}

// Fields to hide from diff view (internal/noisy fields)
const HIDDEN_FIELDS = new Set(['createdAt', 'updatedAt', 'created_at', 'updated_at', 'id']);

const FIELD_LABELS: Record<string, string> = {
  name: 'Nome',
  description: 'Descrição',
  value: 'Valor',
  type: 'Tipo',
  category: 'Categoria',
  date: 'Data',
  email: 'Email',
  phone: 'Telefone',
  cpf: 'CPF',
  cnpj: 'CNPJ',
  address: 'Endereço',
  role: 'Cargo',
  modules: 'Módulos',
  isActive: 'Ativo',
  firstName: 'Nome',
  lastName: 'Sobrenome',
  username: 'Usuário',
  price: 'Preço',
  cost: 'Custo',
  stock: 'Estoque',
  sold: 'Vendidos',
};

function formatValue(val: any): string {
  if (val === null || val === undefined) return '—';
  if (Array.isArray(val)) return val.join(', ') || '—';
  if (typeof val === 'boolean') return val ? 'Sim' : 'Não';
  if (typeof val === 'object') return JSON.stringify(val);
  return String(val);
}

interface DiffViewProps {
  before: Record<string, any> | null;
  after: Record<string, any> | null;
}

const DiffView: React.FC<DiffViewProps> = ({ before, after }) => {
  // Collect all keys from both objects, excluding hidden fields
  const allKeys = Array.from(
    new Set([
      ...Object.keys(before || {}),
      ...Object.keys(after || {}),
    ])
  ).filter(k => !HIDDEN_FIELDS.has(k));

  if (allKeys.length === 0) return null;

  // For creates: show all after fields
  // For deletes: show all before fields
  // For edits: show only changed fields
  const isCreate = before === null;
  const isDelete = after === null;

  const rows = allKeys.filter(key => {
    if (isCreate || isDelete) return true;
    const bVal = formatValue(before?.[key]);
    const aVal = formatValue(after?.[key]);
    return bVal !== aVal;
  });

  if (rows.length === 0) return <p className="text-xs text-gray-400 italic">Nenhuma alteração detectada.</p>;

  return (
    <div className="mt-2 rounded-md overflow-hidden border border-gray-200 text-xs">
      <table className="w-full">
        <thead>
          <tr className="bg-gray-100 text-gray-600">
            <th className="px-3 py-1.5 text-left font-medium w-1/4">Campo</th>
            {!isCreate && <th className="px-3 py-1.5 text-left font-medium w-[37.5%] text-red-700">Antes</th>}
            {!isDelete && <th className="px-3 py-1.5 text-left font-medium w-[37.5%] text-green-700">Depois</th>}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {rows.map(key => (
            <tr key={key}>
              <td className="px-3 py-1.5 text-gray-600 font-medium">
                {FIELD_LABELS[key] || key}
              </td>
              {!isCreate && (
                <td className="px-3 py-1.5 bg-red-50 text-red-800 font-mono break-all">
                  {formatValue(before?.[key])}
                </td>
              )}
              {!isDelete && (
                <td className="px-3 py-1.5 bg-green-50 text-green-800 font-mono break-all">
                  {formatValue(after?.[key])}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

const ActivityLog: React.FC = () => {
  const { token } = useAuth();
  const { modules } = useModules();
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [filters, setFilters] = useState({
    userId: '',
    moduleKey: '',
    action: '',
    startDate: '',
    endDate: ''
  });
  const [page, setPage] = useState(1);
  const limit = 50;
  // Acumulador de todos os usuários/ações já vistos — persiste entre páginas para os dropdowns de filtro
  const [knownUsers, setKnownUsers] = useState<string[]>([]);
  const [knownActions, setKnownActions] = useState<string[]>([]);

  useEffect(() => {
    loadLogs();
  }, [filters, page]);

  const loadLogs = async () => {
    try {
      setIsLoading(true);
      const queryParams = new URLSearchParams();
      if (filters.userId) queryParams.append('userId', filters.userId);
      if (filters.moduleKey) queryParams.append('moduleKey', filters.moduleKey);
      if (filters.action) queryParams.append('action', filters.action);
      if (filters.startDate) queryParams.append('startDate', filters.startDate);
      if (filters.endDate) queryParams.append('endDate', filters.endDate);
      queryParams.append('pageSize', limit.toString());
      queryParams.append('page', page.toString());

      const response = await fetch(`${API_BASE_URL}/admin/activity-log?${queryParams}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
      const result = await response.json();
      if (result.success) {
        setLogs(result.data);
        // Acumular usuários e ações conhecidos para os filtros
        setKnownUsers(prev => Array.from(new Set([...prev, ...result.data.map((l: ActivityLog) => l.username)])));
        setKnownActions(prev => Array.from(new Set([...prev, ...result.data.map((l: ActivityLog) => l.action)])));
      }
    } catch (error) {
      console.error('Erro ao carregar logs:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const toggleRow = (id: string) => {
    setExpandedRows(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const hasDiff = (log: ActivityLog) =>
    log.details && (log.details.before !== undefined || log.details.after !== undefined);

  const handleExport = async (format: 'csv' | 'json') => {
    // Buscar todos os logs sem paginação para exportação completa
    try {
      const queryParams = new URLSearchParams();
      if (filters.userId) queryParams.append('userId', filters.userId);
      if (filters.moduleKey) queryParams.append('moduleKey', filters.moduleKey);
      if (filters.action) queryParams.append('action', filters.action);
      if (filters.startDate) queryParams.append('startDate', filters.startDate);
      if (filters.endDate) queryParams.append('endDate', filters.endDate);
      queryParams.append('pageSize', '100');
      queryParams.append('page', '1');

      const response = await fetch(`${API_BASE_URL}/admin/activity-log?${queryParams}`, {
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }
      });
      const result = await response.json();
      const allLogs: ActivityLog[] = result.success ? result.data : logs;

      const data = allLogs.map(log => ({
        Usuário: log.username,
        Ação: log.action,
        Módulo: log.moduleKey,
        Tipo: log.entityType || '',
        Data: new Date(log.createdAt).toLocaleString(),
        Detalhes: JSON.stringify(log.details || {})
      }));

      if (data.length === 0) {
        alert('Nenhum registro encontrado para exportar.');
        return;
      }

      if (format === 'csv') {
        const headers = Object.keys(data[0]);
        const csv = [
          headers.join(','),
          ...data.map(row => headers.map(header => `"${row[header as keyof typeof row]}"`).join(','))
        ].join('\n');
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `activity-logs-${new Date().toISOString().split('T')[0]}.csv`;
        a.click();
        window.URL.revokeObjectURL(url);
      } else {
        const json = JSON.stringify(data, null, 2);
        const blob = new Blob([json], { type: 'application/json' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `activity-logs-${new Date().toISOString().split('T')[0]}.json`;
        a.click();
        window.URL.revokeObjectURL(url);
      }
    } catch (error) {
      console.error('Erro ao exportar:', error);
    }
  };

  const clearFilters = () => {
    setFilters({
      userId: '',
      moduleKey: '',
      action: '',
      startDate: '',
      endDate: ''
    });
    setPage(1);
  };

  const actionLabels: Record<string, string> = {
    'create': 'Criar',
    'edit': 'Editar',
    'delete': 'Deletar',
    'login': 'Login',
    'permission_change': 'Mudança de Permissão',
    'impersonate': 'Impersonar',
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Histórico de Atividades</h2>
        <div className="flex gap-2">
          <button
            onClick={() => handleExport('csv')}
            className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-emerald-500 to-green-600 text-white font-semibold rounded-xl hover:from-emerald-600 hover:to-green-700 shadow-lg transition-all"
          >
            <Download className="h-5 w-5" />
            Exportar CSV
          </button>
          <button
            onClick={() => handleExport('json')}
            className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-blue-500 to-indigo-500 text-white font-semibold rounded-xl hover:from-blue-600 hover:to-indigo-600 shadow-lg transition-all"
          >
            <Download className="h-5 w-5" />
            Exportar JSON
          </button>
        </div>
      </div>

      {/* Filtros */}
      <div className="bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-gray-800 dark:to-gray-800 rounded-2xl border border-blue-200 dark:border-gray-700 shadow-lg p-4">
        <div className="flex items-center gap-2 mb-4">
          <Filter className="h-5 w-5 text-gray-600 dark:text-gray-400" />
          <h3 className="font-semibold text-gray-900 dark:text-gray-100">Filtros</h3>
          <button
            onClick={clearFilters}
            className="ml-auto text-sm text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300"
          >
            Limpar filtros
          </button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Usuário</label>
            <select
              value={filters.userId}
              onChange={(e) => {
                setFilters({ ...filters, userId: e.target.value });
                setPage(1);
              }}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:!bg-gray-700 dark:text-gray-100 transition-all duration-200"
            >
              <option value="">Todos</option>
              {knownUsers.map(user => (
                <option key={user} value={user}>{user}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Módulo</label>
            <select
              value={filters.moduleKey}
              onChange={(e) => {
                setFilters({ ...filters, moduleKey: e.target.value });
                setPage(1);
              }}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:!bg-gray-700 dark:text-gray-100 transition-all duration-200"
            >
              <option value="">Todos</option>
              {modules.map(mod => (
                <option key={mod.id} value={mod.key}>{mod.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Ação</label>
            <select
              value={filters.action}
              onChange={(e) => {
                setFilters({ ...filters, action: e.target.value });
                setPage(1);
              }}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:!bg-gray-700 dark:text-gray-100 transition-all duration-200"
            >
              <option value="">Todas</option>
              {knownActions.map(action => (
                <option key={action} value={action}>{actionLabels[action] || action}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Data Início</label>
            <input
              type="date"
              value={filters.startDate}
              onChange={(e) => {
                setFilters({ ...filters, startDate: e.target.value });
                setPage(1);
              }}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:!bg-gray-700 dark:text-gray-100 transition-all duration-200"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Data Fim</label>
            <input
              type="date"
              value={filters.endDate}
              onChange={(e) => {
                setFilters({ ...filters, endDate: e.target.value });
                setPage(1);
              }}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:!bg-gray-700 dark:text-gray-100 transition-all duration-200"
            />
          </div>
        </div>
      </div>

      {/* Tabela */}
      <div className="bg-white dark:!bg-[#243040] rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gradient-to-r from-blue-500 to-indigo-600">
              <tr>
                <th className="w-8 px-3 py-3" />
                <th className="px-6 py-3 text-left text-xs font-medium text-white uppercase tracking-wider">Usuário</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-white uppercase tracking-wider">Ação</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-white uppercase tracking-wider">Módulo</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-white uppercase tracking-wider">Entidade</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-white uppercase tracking-wider">Data/Hora</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
              {logs.map((log) => {
                const expanded = expandedRows.has(log.id);
                const hasDetails = hasDiff(log);
                return (
                  <React.Fragment key={log.id}>
                    <tr
                      className={`${hasDetails ? 'cursor-pointer hover:bg-blue-50/50 dark:hover:bg-blue-900/20' : 'hover:bg-gray-50'}`}
                      onClick={() => hasDetails && toggleRow(log.id)}
                    >
                      <td className="px-3 py-4 text-gray-400">
                        {hasDetails && (
                          expanded
                            ? <ChevronDown className="h-4 w-4" />
                            : <ChevronRight className="h-4 w-4" />
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                        {log.username}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded-full ${
                          log.action === 'create' ? 'bg-green-100 text-green-700' :
                          log.action === 'edit' ? 'bg-blue-100 text-blue-700' :
                          log.action === 'delete' ? 'bg-red-100 text-red-700' :
                          log.action === 'login' ? 'bg-purple-100 text-purple-700' :
                          log.action === 'impersonate' ? 'bg-indigo-100 text-indigo-700' :
                          'bg-gray-100 text-gray-700'
                        }`}>
                          {log.action === 'create' && <Plus className="w-3 h-3" />}
                          {log.action === 'edit' && <Pencil className="w-3 h-3" />}
                          {log.action === 'delete' && <Trash2 className="w-3 h-3" />}
                          {log.action === 'login' && <LogIn className="w-3 h-3" />}
                          {log.action === 'impersonate' && <UserCheck className="w-3 h-3" />}
                          {actionLabels[log.action] || log.action}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {log.moduleKey || '-'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {log.entityType || '-'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {new Date(log.createdAt).toLocaleString()}
                      </td>
                    </tr>
                    {hasDetails && expanded && (
                      <tr className="bg-gray-50">
                        <td colSpan={6} className="px-8 py-3">
                          <DiffView
                            before={log.details?.before ?? null}
                            after={log.details?.after ?? null}
                          />
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
        {logs.length === 0 && (
          <div className="flex flex-col items-center gap-3 py-12">
            <Activity className="w-12 h-12 text-gray-300" />
            <p className="text-gray-500 font-medium">Nenhum log encontrado</p>
            <p className="text-gray-400 text-sm">Tente ajustar os filtros ou o período</p>
          </div>
        )}
        {logs.length > 0 && (
          <div className="px-6 py-4 border-t flex justify-between items-center">
            <div className="text-sm text-gray-500">
              Exibindo <span className="font-semibold text-gray-700">{(page - 1) * limit + 1}–{(page - 1) * limit + logs.length}</span> registro(s)
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="flex items-center gap-1 px-3 py-1.5 border border-gray-200 rounded-lg text-sm text-gray-600 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-blue-50 hover:border-blue-300 hover:text-blue-700 dark:hover:bg-blue-900/20 transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
                Anterior
              </button>
              <span className="px-3 py-1.5 text-sm font-semibold bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300 rounded-lg">
                {page}
              </span>
              <button
                onClick={() => setPage(p => p + 1)}
                disabled={logs.length < limit}
                className="flex items-center gap-1 px-3 py-1.5 border border-gray-200 rounded-lg text-sm text-gray-600 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-blue-50 hover:border-blue-300 hover:text-blue-700 dark:hover:bg-blue-900/20 transition-colors"
              >
                Próxima
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ActivityLog;
