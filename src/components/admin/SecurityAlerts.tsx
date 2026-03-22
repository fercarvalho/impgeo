import { useState, useEffect } from 'react';
import { Bell, Shield, BarChart3, Clock, Globe, User, XCircle, RefreshCw, Filter } from 'lucide-react';

const API_BASE_URL =
  typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
    ? 'http://localhost:9001/api'
    : ((import.meta as any).env?.VITE_API_URL || '/api');

interface Alert {
  id: string;
  user_id: string;
  username: string;
  action: string;
  details: any;
  ip_address: string;
  created_at: string;
}

interface AlertStats {
  period: string;
  total: number;
  affectedUsers: number;
  byType: Array<{
    action: string;
    count: number;
    affected_users: number;
  }>;
}

const authHeaders = () => ({
  'Authorization': `Bearer ${localStorage.getItem('authToken')}`,
  'Content-Type': 'application/json',
});

const ALERT_LABELS: Record<string, string> = {
  login_failed_suspicious: 'Login Suspeito',
  multiple_ips_detected: 'Múltiplos IPs',
  token_theft_detected: 'Roubo de Token',
  sql_injection_attempt: 'SQL Injection',
  xss_attempt: 'Tentativa XSS',
  brute_force_detected: 'Brute Force',
  new_country_login: 'Novo País',
  multiple_devices_detected: 'Múltiplos Dispositivos',
};

const CRITICAL = ['token_theft_detected', 'sql_injection_attempt', 'brute_force_detected'];
const HIGH = ['xss_attempt', 'new_country_login'];
const MEDIUM = ['multiple_ips_detected', 'multiple_devices_detected'];

const getSeverity = (action: string): { label: string; bg: string; text: string } => {
  if (CRITICAL.includes(action)) return { label: 'CRÍTICA', bg: 'bg-red-600', text: 'text-white' };
  if (HIGH.includes(action)) return { label: 'ALTA', bg: 'bg-orange-500', text: 'text-white' };
  if (MEDIUM.includes(action)) return { label: 'MÉDIA', bg: 'bg-yellow-400', text: 'text-gray-900' };
  return { label: 'BAIXA', bg: 'bg-green-600', text: 'text-white' };
};

const getSeverityBarColor = (action: string): string => {
  if (CRITICAL.includes(action)) return '#d32f2f';
  if (HIGH.includes(action)) return '#f57c00';
  if (MEDIUM.includes(action)) return '#fbc02d';
  return '#388e3c';
};

const getTimeAgo = (timestamp: string): string => {
  const diff = Date.now() - new Date(timestamp).getTime();
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(minutes / 60);
  const d = Math.floor(hours / 24);
  if (d > 0) return `${d}d atrás`;
  if (hours > 0) return `${hours}h atrás`;
  if (minutes > 0) return `${minutes}min atrás`;
  return 'Agora';
};

const LIMIT = 20;

export default function SecurityAlerts() {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [stats, setStats] = useState<AlertStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [days, setDays] = useState(7);
  const [typeFilter, setTypeFilter] = useState('');
  const [page, setPage] = useState(0);

  useEffect(() => { fetchData(); }, [days, typeFilter, page]);

  const fetchData = async () => {
    try {
      setLoading(true);
      setError(null);
      const [alertsRes, statsRes] = await Promise.all([
        fetch(`${API_BASE_URL}/security-alerts?limit=${LIMIT}&offset=${page * LIMIT}${typeFilter ? `&type=${typeFilter}` : ''}`, { headers: authHeaders() }),
        fetch(`${API_BASE_URL}/security-alerts?days=${days}&stats=1`, { headers: authHeaders() }),
      ]);
      const alertsData = await alertsRes.json();
      const statsData = await statsRes.json();
      setAlerts(alertsData.alerts || []);
      setStats(statsData.stats || statsData);
    } catch {
      setError('Erro ao carregar alertas');
    } finally {
      setLoading(false);
    }
  };

  if (loading && alerts.length === 0) {
    return (
      <div className="flex items-center justify-center p-12">
        <div className="text-center">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-amber-600 mx-auto mb-3" />
          <p className="text-gray-500">Carregando alertas...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <div className="flex items-center gap-2 text-red-600 mb-3">
          <XCircle className="w-5 h-5" />
          <span className="font-medium">{error}</span>
        </div>
        <button onClick={fetchData} className="flex items-center gap-2 px-4 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700">
          <RefreshCw className="w-4 h-4" /> Tentar novamente
        </button>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-2">
        <div className="p-2 bg-amber-100 rounded-lg">
          <Bell className="w-6 h-6 text-amber-600" />
        </div>
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Portal de Alertas de Segurança</h2>
          <p className="text-sm text-gray-500">Monitoramento de eventos de segurança em tempo real</p>
        </div>
        <button onClick={fetchData} className="ml-auto p-2 hover:bg-gray-100 rounded-lg" title="Atualizar">
          <RefreshCw className="w-4 h-4 text-gray-500" />
        </button>
      </div>

      <div className="h-px bg-amber-200 mb-6" />

      {/* Filtros */}
      <div className="bg-gradient-to-r from-amber-50 to-orange-50 p-4 rounded-lg border border-amber-200 shadow-sm mb-6">
        <div className="flex flex-col lg:flex-row lg:items-center gap-4 lg:gap-6">
          <div className="flex items-center gap-2">
            <Filter className="w-5 h-5 text-amber-600" />
            <h3 className="text-lg font-bold text-gray-800 uppercase tracking-wide">FILTRE SEUS ITENS:</h3>
          </div>
          <div className="flex items-end gap-3 flex-1">
            <div className="flex flex-col flex-1 min-w-0">
              <label htmlFor="alert-period-filter" className="text-xs font-semibold text-gray-700 mb-1">Período</label>
              <select
                id="alert-period-filter"
                name="alert-period-filter"
                aria-label="Filtrar por período"
                value={days}
                onChange={(e) => { setDays(Number(e.target.value)); setPage(0); }}
                className="px-3 py-2 border border-amber-300 rounded-md text-sm focus:ring-2 focus:ring-amber-500 focus:border-amber-500 bg-white w-full"
              >
                <option value={1}>Últimas 24 horas</option>
                <option value={7}>Últimos 7 dias</option>
                <option value={30}>Últimos 30 dias</option>
                <option value={90}>Últimos 90 dias</option>
              </select>
            </div>
            <div className="flex flex-col flex-1 min-w-0">
              <label htmlFor="alert-type-filter" className="text-xs font-semibold text-gray-700 mb-1">Tipo de Alerta</label>
              <select
                id="alert-type-filter"
                name="alert-type-filter"
                aria-label="Filtrar por tipo de alerta"
                value={typeFilter}
                onChange={(e) => { setTypeFilter(e.target.value); setPage(0); }}
                className="px-3 py-2 border border-amber-300 rounded-md text-sm focus:ring-2 focus:ring-amber-500 focus:border-amber-500 bg-white w-full"
              >
                <option value="">Todos</option>
                {Object.entries(ALERT_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
          {[
            { icon: <Shield className="w-8 h-8 text-blue-500" />, value: stats.total, label: 'Total de Alertas' },
            { icon: <User className="w-8 h-8 text-blue-500" />, value: stats.affectedUsers, label: 'Usuários Afetados' },
            { icon: <BarChart3 className="w-8 h-8 text-blue-500" />, value: stats.byType?.length ?? 0, label: 'Tipos Diferentes' },
            { icon: <Clock className="w-8 h-8 text-blue-500" />, value: stats.period, label: 'Período' },
          ].map((card, i) => (
            <div key={i} className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm flex items-center gap-3">
              <div className="flex-shrink-0">{card.icon}</div>
              <div>
                <div className="text-2xl font-bold text-gray-900">{card.value}</div>
                <div className="text-xs text-gray-500">{card.label}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Distribuição por Tipo */}
      {stats && stats.byType && stats.byType.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm mb-6">
          <h3 className="font-semibold text-gray-800 mb-3 flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-amber-600" /> Distribuição por Tipo
          </h3>
          <div className="space-y-2">
            {stats.byType.map(item => {
              const pct = stats.total > 0 ? (item.count / stats.total) * 100 : 0;
              return (
                <div key={item.action}>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-gray-700">{ALERT_LABELS[item.action] || item.action} <span className="text-gray-400">({item.count})</span></span>
                    <span className="text-gray-500 text-xs">{pct.toFixed(1)}%</span>
                  </div>
                  <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: getSeverityBarColor(item.action) }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Lista de Alertas */}
      <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
        <h3 className="font-semibold text-gray-800 mb-3 flex items-center gap-2">
          <Bell className="w-4 h-4 text-amber-600" /> Alertas Recentes
        </h3>
        {alerts.length === 0 ? (
          <p className="text-center py-8 text-gray-400">Nenhum alerta encontrado no período selecionado</p>
        ) : (
          <>
            <div className="space-y-3">
              {alerts.map(alert => {
                const sev = getSeverity(alert.action);
                return (
                  <div key={alert.id} className="border border-gray-100 rounded-lg p-3">
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-medium text-gray-800 text-sm">{ALERT_LABELS[alert.action] || alert.action}</span>
                      <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${sev.bg} ${sev.text}`}>{sev.label}</span>
                    </div>
                    <div className="text-xs text-gray-600 flex items-center gap-1 mb-1">
                      <User className="w-3 h-3" /> {alert.username}
                    </div>
                    {alert.details && typeof alert.details === 'object' && (
                      <div className="text-xs text-gray-500 space-y-0.5">
                        {alert.details.message && <div>{alert.details.message}</div>}
                        {alert.details.attempts && <div>Tentativas: {alert.details.attempts}</div>}
                        {alert.details.country && <div>País: {alert.details.country}</div>}
                        {alert.details.payload && (
                          <div className="font-mono bg-gray-50 rounded px-2 py-1 text-xs">
                            Payload: {JSON.stringify(alert.details.payload).substring(0, 100)}...
                          </div>
                        )}
                      </div>
                    )}
                    <div className="flex items-center gap-4 mt-2 text-xs text-gray-400">
                      <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> {getTimeAgo(alert.created_at)}</span>
                      <span className="flex items-center gap-1"><Globe className="w-3 h-3" /> {alert.ip_address}</span>
                      <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> {new Date(alert.created_at).toLocaleString('pt-BR')}</span>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Paginação */}
            <div className="flex items-center justify-center gap-4 mt-4">
              <button
                onClick={() => setPage(p => Math.max(0, p - 1))}
                disabled={page === 0}
                className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg disabled:opacity-40 hover:bg-gray-50"
              >
                ← Anterior
              </button>
              <span className="text-sm text-gray-500">Página {page + 1}</span>
              <button
                onClick={() => setPage(p => p + 1)}
                disabled={alerts.length < LIMIT}
                className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg disabled:opacity-40 hover:bg-gray-50"
              >
                Próxima →
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
