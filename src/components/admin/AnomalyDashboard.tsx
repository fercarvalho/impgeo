import { useState, useEffect } from 'react';
import { Activity, Users, TrendingUp, AlertTriangle, Clock, RefreshCw, XCircle, Globe, BarChart3, User, MapPin, Hash, Filter } from 'lucide-react';

const API_BASE_URL =
  typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
    ? 'http://localhost:9001/api'
    : ((import.meta as any).env?.VITE_API_URL || '/api');

interface AnomalyStats {
  period: string;
  stats: {
    total: number;
    affectedUsers: number;
    avgScore: number;
    types: string[];
  };
  topUsers: Array<{
    user_id: string;
    username: string;
    anomaly_count: number;
    last_anomaly: string;
  }>;
  byType: Array<{
    type: string;
    count: number;
    avg_score: number;
  }>;
}

interface Anomaly {
  id: string;
  userId: string;
  username: string;
  type: string;
  score: number;
  details: any;
  ipAddress: string;
  timestamp: string;
}

interface UserBaseline {
  username: string;
  baseline: {
    countries: string[];
    avgHour: number;
    avgRequestsPerMinute: number;
    commonIPs: string[];
  };
  stats: {
    totalLogins: number;
    firstLogin: string;
    lastLogin: string;
  };
}

const authHeaders = () => ({
  'Authorization': `Bearer ${localStorage.getItem('authToken')}`,
  'Content-Type': 'application/json',
});

export default function AnomalyDashboard() {
  const [stats, setStats] = useState<AnomalyStats | null>(null);
  const [recent, setRecent] = useState<Anomaly[]>([]);
  const [days, setDays] = useState(7);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedUser, setSelectedUser] = useState<string | null>(null);
  const [userBaseline, setUserBaseline] = useState<UserBaseline | null>(null);
  const [severityFilter, setSeverityFilter] = useState<number>(0);

  useEffect(() => { fetchData(); }, [days, severityFilter]);

  const fetchData = async () => {
    try {
      setLoading(true);
      setError(null);
      const [statsRes, recentRes] = await Promise.all([
        fetch(`${API_BASE_URL}/anomalies?days=${days}`, { headers: authHeaders() }),
        fetch(`${API_BASE_URL}/anomalies?limit=50${severityFilter > 0 ? `&severity=${severityFilter}` : ''}`, { headers: authHeaders() }),
      ]);
      const statsData = await statsRes.json();
      const recentData = await recentRes.json();
      setStats(statsData);
      setRecent(recentData.anomalies || []);
    } catch {
      setError('Erro ao carregar dados');
    } finally {
      setLoading(false);
    }
  };

  const fetchUserBaseline = async (username: string) => {
    try {
      const res = await fetch(`${API_BASE_URL}/anomalies/baseline/${username}`, { headers: authHeaders() });
      const data = await res.json();
      setUserBaseline(data);
      setSelectedUser(username);
    } catch {
      alert('Erro ao buscar dados do usuário');
    }
  };

  const getAnomalyTypeLabel = (type: string): string => {
    const labels: Record<string, string> = {
      new_country: 'Novo País',
      unusual_hour: 'Horário Incomum',
      abnormal_volume: 'Volume Anormal',
      multiple_ips: 'Múltiplos IPs',
      multiple_devices: 'Múltiplos Dispositivos',
      brute_force: 'Brute Force',
    };
    return labels[type] || type;
  };

  const getSeverity = (score: number): { label: string; bg: string; text: string } => {
    if (score >= 90) return { label: 'CRÍTICA', bg: 'bg-red-600', text: 'text-white' };
    if (score >= 70) return { label: 'ALTA', bg: 'bg-orange-500', text: 'text-white' };
    if (score >= 50) return { label: 'MÉDIA', bg: 'bg-yellow-400', text: 'text-gray-900' };
    return { label: 'BAIXA', bg: 'bg-green-600', text: 'text-white' };
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

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <div className="text-center">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-amber-600 mx-auto mb-3" />
          <p className="text-gray-500">Carregando dashboard...</p>
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

  const highSeverityCount = recent.filter(a => a.score >= 70).length;

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-2">
        <div className="p-2 bg-blue-100 rounded-lg">
          <Activity className="w-6 h-6 text-blue-600" />
        </div>
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Dashboard de Anomalias</h2>
          <p className="text-sm text-gray-500">Monitoramento de comportamentos suspeitos detectados por ML</p>
        </div>
        <button onClick={fetchData} className="ml-auto p-2 hover:bg-gray-100 rounded-lg" title="Atualizar">
          <RefreshCw className="w-4 h-4 text-gray-500" />
        </button>
      </div>

      <div className="h-px bg-blue-200 mb-6" />

      {/* Filtros */}
      <div className="bg-gradient-to-r from-blue-50 to-sky-50 p-4 rounded-lg border border-blue-200 shadow-sm mb-6">
        <div className="flex flex-col lg:flex-row lg:items-center gap-4 lg:gap-6">
          <div className="flex items-center gap-2">
            <Filter className="w-5 h-5 text-blue-500" />
            <h3 className="text-lg font-bold text-gray-800 uppercase tracking-wide">FILTRE SEUS ITENS:</h3>
          </div>
          <div className="flex items-end gap-3 flex-1">
            <div className="flex flex-col flex-1 min-w-0">
              <label htmlFor="anomaly-period-filter" className="text-xs font-semibold text-gray-700 mb-1">Período</label>
              <select
                id="anomaly-period-filter"
                name="anomaly-period-filter"
                aria-label="Filtrar por período"
                value={days}
                onChange={(e) => setDays(Number(e.target.value))}
                className="px-3 py-2 border border-blue-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white w-full"
              >
                <option value={1}>Últimas 24 horas</option>
                <option value={7}>Últimos 7 dias</option>
                <option value={30}>Últimos 30 dias</option>
                <option value={90}>Últimos 90 dias</option>
              </select>
            </div>
            <div className="flex flex-col flex-1 min-w-0">
              <label htmlFor="anomaly-severity-filter" className="text-xs font-semibold text-gray-700 mb-1">Severidade mínima</label>
              <select
                id="anomaly-severity-filter"
                name="anomaly-severity-filter"
                aria-label="Filtrar por severidade mínima"
                value={severityFilter}
                onChange={(e) => setSeverityFilter(Number(e.target.value))}
                className="px-3 py-2 border border-blue-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white w-full"
              >
                <option value={0}>Todas</option>
                <option value={50}>Média ou superior</option>
                <option value={70}>Alta ou superior</option>
                <option value={90}>Apenas críticas</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
          {[
            { icon: <BarChart3 className="w-8 h-8 text-blue-500" />, value: stats.stats.total, label: 'Total de Anomalias' },
            { icon: <Users className="w-8 h-8 text-blue-500" />, value: stats.stats.affectedUsers, label: 'Usuários Afetados' },
            { icon: <TrendingUp className="w-8 h-8 text-blue-500" />, value: stats.stats.avgScore?.toFixed(1) ?? '—', label: 'Score Médio' },
            { icon: <AlertTriangle className="w-8 h-8 text-red-500" />, value: highSeverityCount, label: 'Alta Severidade' },
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

      {/* Anomalias por Tipo */}
      {stats && stats.byType.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm mb-6">
          <h3 className="font-semibold text-gray-800 mb-3 flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-amber-600" /> Anomalias por Tipo
          </h3>
          <div className="space-y-2">
            {stats.byType.map(item => {
              const pct = stats.stats.total > 0 ? (item.count / stats.stats.total) * 100 : 0;
              return (
                <div key={item.type}>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-gray-700">{getAnomalyTypeLabel(item.type)} <span className="text-gray-400">({item.count})</span></span>
                    <span className="text-gray-500 text-xs">Score: {item.avg_score.toFixed(0)}</span>
                  </div>
                  <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div className="h-full bg-amber-500 rounded-full" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Top Usuários */}
      {stats && stats.topUsers.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm mb-6">
          <h3 className="font-semibold text-gray-800 mb-3 flex items-center gap-2">
            <Users className="w-4 h-4 text-amber-600" /> Usuários com Mais Anomalias
          </h3>
          <div className="space-y-2">
            {stats.topUsers.slice(0, 10).map((u, index) => (
              <div key={u.user_id} className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
                <div className="flex items-center gap-3">
                  <span className="text-xs font-bold text-gray-400 w-6">#{index + 1}</span>
                  <div>
                    <div className="font-medium text-gray-800 text-sm">{u.username}</div>
                    <div className="text-xs text-gray-500">{u.anomaly_count} anomalia{u.anomaly_count > 1 ? 's' : ''} · Última: {getTimeAgo(u.last_anomaly)}</div>
                  </div>
                </div>
                <button
                  onClick={() => fetchUserBaseline(u.username)}
                  className="text-xs px-3 py-1 border border-amber-300 text-amber-700 rounded-lg hover:bg-amber-50"
                >
                  Ver Baseline
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Anomalias Recentes */}
      <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
        <h3 className="font-semibold text-gray-800 mb-3 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-amber-600" /> Anomalias Recentes
        </h3>
        {recent.length === 0 ? (
          <p className="text-center py-8 text-gray-400">Nenhuma anomalia encontrada no período selecionado</p>
        ) : (
          <div className="space-y-3">
            {recent.map(anomaly => {
              const sev = getSeverity(anomaly.score);
              return (
                <div key={anomaly.id} className="border border-gray-100 rounded-lg p-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-medium text-gray-800 text-sm">{getAnomalyTypeLabel(anomaly.type)}</span>
                    <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${sev.bg} ${sev.text}`}>{sev.label}</span>
                  </div>
                  <div className="text-xs text-gray-600 flex items-center gap-1 mb-1">
                    <User className="w-3 h-3" /> {anomaly.username}
                  </div>
                  {anomaly.type === 'new_country' && anomaly.details?.baseline && (
                    <div className="text-xs text-gray-500 flex items-center gap-1">
                      <MapPin className="w-3 h-3" />
                      Usual: {anomaly.details.baseline.join(', ')} → Detectado: {anomaly.details.detected}
                    </div>
                  )}
                  {anomaly.type === 'unusual_hour' && anomaly.details?.detected !== undefined && (
                    <div className="text-xs text-gray-500 flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      Horário: {anomaly.details.detected}:00h{anomaly.details.avgHour ? ` (usual: ${anomaly.details.avgHour}:00h)` : ''}
                    </div>
                  )}
                  {anomaly.details?.message && (
                    <div className="text-xs text-gray-500">{anomaly.details.message}</div>
                  )}
                  <div className="flex items-center gap-4 mt-2 text-xs text-gray-400">
                    <span className="flex items-center gap-1"><Hash className="w-3 h-3" /> Score: {anomaly.score}</span>
                    <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> {getTimeAgo(anomaly.timestamp)}</span>
                    <span className="flex items-center gap-1"><Globe className="w-3 h-3" /> {anomaly.ipAddress}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Modal Baseline */}
      {selectedUser && userBaseline && (
        <div
          className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
          onClick={() => { setSelectedUser(null); setUserBaseline(null); }}
        >
          <div
            className="bg-white rounded-xl shadow-xl max-w-md w-full p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-gray-900 flex items-center gap-2">
                <BarChart3 className="w-5 h-5 text-amber-600" /> Baseline: {userBaseline.username}
              </h3>
              <button
                onClick={() => { setSelectedUser(null); setUserBaseline(null); }}
                className="text-gray-400 hover:text-gray-600 text-xl leading-none"
              >
                ✕
              </button>
            </div>
            <div className="space-y-3 text-sm">
              <div>
                <div className="flex items-center gap-1 font-medium text-gray-700 mb-0.5"><Globe className="w-4 h-4" /> Países comuns</div>
                <p className="text-gray-600 pl-5">{userBaseline.baseline.countries.join(', ') || '—'}</p>
              </div>
              <div>
                <div className="flex items-center gap-1 font-medium text-gray-700 mb-0.5"><Clock className="w-4 h-4" /> Horário médio de acesso</div>
                <p className="text-gray-600 pl-5">{userBaseline.baseline.avgHour}:00h</p>
              </div>
              <div>
                <div className="flex items-center gap-1 font-medium text-gray-700 mb-0.5"><BarChart3 className="w-4 h-4" /> Requisições por minuto (média)</div>
                <p className="text-gray-600 pl-5">{userBaseline.baseline.avgRequestsPerMinute?.toFixed(1)}</p>
              </div>
              <div>
                <div className="flex items-center gap-1 font-medium text-gray-700 mb-0.5"><Globe className="w-4 h-4" /> IPs comuns</div>
                <p className="text-gray-600 pl-5">{userBaseline.baseline.commonIPs.join(', ') || '—'}</p>
              </div>
              <div>
                <div className="flex items-center gap-1 font-medium text-gray-700 mb-0.5"><TrendingUp className="w-4 h-4" /> Estatísticas</div>
                <div className="pl-5 text-gray-600 space-y-0.5">
                  <p>Total de logins: {userBaseline.stats.totalLogins}</p>
                  <p>Primeiro login: {new Date(userBaseline.stats.firstLogin).toLocaleString('pt-BR')}</p>
                  <p>Último login: {new Date(userBaseline.stats.lastLogin).toLocaleString('pt-BR')}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
