import { useState, useEffect } from 'react';
import { Activity, Users, TrendingUp, AlertTriangle, Clock, RefreshCw, XCircle, Globe, BarChart3, User, MapPin, Hash, Filter } from 'lucide-react';

const API_BASE_URL =
  typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
    ? 'http://localhost:9001/api'
    : ((import.meta as any).env?.VITE_API_URL || '/api');

interface AnomalyRecord {
  id: number;
  timestamp: string;
  operation: string;
  user_id: string;
  username: string;
  ip_address: string;
  user_agent: string;
  details: any;
  status: string;
}

const authHeaders = () => ({
  'Authorization': `Bearer ${localStorage.getItem('authToken')}`,
  'Content-Type': 'application/json',
});

const ANOMALY_LABELS: Record<string, string> = {
  new_country: 'Novo País',
  unusual_hour: 'Horário Incomum',
  abnormal_volume: 'Volume Anormal',
  multiple_ips: 'Múltiplos IPs',
  multiple_devices: 'Múltiplos Dispositivos',
  brute_force: 'Brute Force',
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

export default function AnomalyDashboard() {
  const [anomalies, setAnomalies] = useState<AnomalyRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [severityFilter, setSeverityFilter] = useState<number>(0);
  const [days, setDays] = useState(7);

  useEffect(() => { fetchData(); }, [days]);

  const fetchData = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch(`${API_BASE_URL}/anomalies?limit=200`, { headers: authHeaders() });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Erro desconhecido');

      const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
      const filtered = (data.anomalies || []).filter((a: AnomalyRecord) =>
        new Date(a.timestamp).getTime() >= cutoff
      );
      setAnomalies(filtered);
    } catch {
      setError('Erro ao carregar dados');
    } finally {
      setLoading(false);
    }
  };

  // Estatísticas calculadas no frontend
  const displayed = severityFilter > 0
    ? anomalies.filter(a => (a.details?.score ?? 0) >= severityFilter)
    : anomalies;

  const affectedUsers = new Set(anomalies.map(a => a.user_id)).size;
  const highSeverityCount = anomalies.filter(a => (a.details?.score ?? 0) >= 70).length;
  const avgScore = anomalies.length > 0
    ? anomalies.reduce((sum, a) => sum + (a.details?.score ?? 0), 0) / anomalies.length
    : 0;

  const byType = Object.entries(
    anomalies.reduce((acc: Record<string, { count: number; scoreSum: number }>, a) => {
      const type = a.details?.type || a.operation;
      if (!acc[type]) acc[type] = { count: 0, scoreSum: 0 };
      acc[type].count++;
      acc[type].scoreSum += a.details?.score ?? 0;
      return acc;
    }, {})
  ).map(([type, v]) => ({ type, count: v.count, avg_score: v.scoreSum / v.count }));

  const topUsers = Object.entries(
    anomalies.reduce((acc: Record<string, { username: string; count: number; last: string }>, a) => {
      if (!acc[a.user_id]) acc[a.user_id] = { username: a.username, count: 0, last: a.timestamp };
      acc[a.user_id].count++;
      if (new Date(a.timestamp) > new Date(acc[a.user_id].last)) acc[a.user_id].last = a.timestamp;
      return acc;
    }, {})
  )
    .map(([user_id, v]) => ({ user_id, username: v.username, anomaly_count: v.count, last_anomaly: v.last }))
    .sort((a, b) => b.anomaly_count - a.anomaly_count)
    .slice(0, 10);

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <div className="text-center">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600 mx-auto mb-3" />
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
        <button onClick={fetchData} className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
          <RefreshCw className="w-4 h-4" /> Tentar novamente
        </button>
      </div>
    );
  }

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
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        {[
          { icon: <BarChart3 className="w-8 h-8 text-blue-500" />, value: anomalies.length, label: 'Total de Anomalias' },
          { icon: <Users className="w-8 h-8 text-blue-500" />, value: affectedUsers, label: 'Usuários Afetados' },
          { icon: <TrendingUp className="w-8 h-8 text-blue-500" />, value: avgScore.toFixed(1), label: 'Score Médio' },
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

      {/* Anomalias por Tipo */}
      {byType.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm mb-6">
          <h3 className="font-semibold text-gray-800 mb-3 flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-blue-600" /> Anomalias por Tipo
          </h3>
          <div className="space-y-2">
            {byType.map(item => {
              const pct = anomalies.length > 0 ? (item.count / anomalies.length) * 100 : 0;
              return (
                <div key={item.type}>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-gray-700">{ANOMALY_LABELS[item.type] || item.type} <span className="text-gray-400">({item.count})</span></span>
                    <span className="text-gray-500 text-xs">Score: {item.avg_score.toFixed(0)}</span>
                  </div>
                  <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div className="h-full bg-blue-500 rounded-full" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Top Usuários */}
      {topUsers.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm mb-6">
          <h3 className="font-semibold text-gray-800 mb-3 flex items-center gap-2">
            <Users className="w-4 h-4 text-blue-600" /> Usuários com Mais Anomalias
          </h3>
          <div className="space-y-2">
            {topUsers.map((u, index) => (
              <div key={u.user_id} className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
                <div className="flex items-center gap-3">
                  <span className="text-xs font-bold text-gray-400 w-6">#{index + 1}</span>
                  <div>
                    <div className="font-medium text-gray-800 text-sm">{u.username}</div>
                    <div className="text-xs text-gray-500">{u.anomaly_count} anomalia{u.anomaly_count > 1 ? 's' : ''} · Última: {getTimeAgo(u.last_anomaly)}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Anomalias Recentes */}
      <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
        <h3 className="font-semibold text-gray-800 mb-3 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-blue-600" /> Anomalias Recentes
        </h3>
        {displayed.length === 0 ? (
          <p className="text-center py-8 text-gray-400">Nenhuma anomalia encontrada no período selecionado</p>
        ) : (
          <div className="space-y-3">
            {displayed.map(anomaly => {
              const score = anomaly.details?.score ?? 0;
              const type = anomaly.details?.type || anomaly.operation;
              const sev = getSeverity(score);
              return (
                <div key={anomaly.id} className="border border-gray-100 rounded-lg p-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-medium text-gray-800 text-sm">{ANOMALY_LABELS[type] || type}</span>
                    <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${sev.bg} ${sev.text}`}>{sev.label}</span>
                  </div>
                  <div className="text-xs text-gray-600 flex items-center gap-1 mb-1">
                    <User className="w-3 h-3" /> {anomaly.username}
                  </div>
                  {anomaly.details?.baseline && (
                    <div className="text-xs text-gray-500 flex items-center gap-1">
                      <MapPin className="w-3 h-3" />
                      Usual: {Array.isArray(anomaly.details.baseline) ? anomaly.details.baseline.join(', ') : anomaly.details.baseline}
                      {anomaly.details.detected ? ` → Detectado: ${anomaly.details.detected}` : ''}
                    </div>
                  )}
                  {anomaly.details?.message && (
                    <div className="text-xs text-gray-500">{anomaly.details.message}</div>
                  )}
                  <div className="flex items-center gap-4 mt-2 text-xs text-gray-400">
                    <span className="flex items-center gap-1"><Hash className="w-3 h-3" /> Score: {score}</span>
                    <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> {getTimeAgo(anomaly.timestamp)}</span>
                    <span className="flex items-center gap-1"><Globe className="w-3 h-3" /> {anomaly.ip_address}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
