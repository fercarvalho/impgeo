import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Activity, Users, TrendingUp, AlertTriangle, Clock, RefreshCw, XCircle, Globe, BarChart3, User, MapPin, Hash, Filter } from 'lucide-react';

const API_BASE_URL =
  typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
    ? 'http://localhost:9001/api'
    : ((import.meta as any).env?.VITE_API_URL || '/api');

interface AnomalyDetails {
  score?: number;
  type?: string;
  baseline?: string | string[];
  detected?: string;
  message?: string;
  [key: string]: unknown;
}

interface AnomalyRecord {
  id: number;
  timestamp: string;
  operation: string;
  user_id: string;
  username: string;
  ip_address: string;
  user_agent: string;
  details: AnomalyDetails;
  status: string;
}

// Authorization removido (cookie httpOnly cuida da auth desde a fase 1.3).
const authHeaders = () => ({
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
  if (!timestamp) return 'Desconhecido';
  const date = new Date(timestamp);
  if (isNaN(date.getTime())) return 'Desconhecido';
  const diff = Date.now() - date.getTime();
  if (diff < 0) return 'Agora';
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

  // Ref para rastrear controladores de requisições manuais (retry/refresh)
  const manualAbortRef = useRef<AbortController | null>(null);

  const fetchData = useCallback(async (signal?: AbortSignal) => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch(`${API_BASE_URL}/anomalies?limit=200`, { headers: authHeaders(), signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Erro desconhecido');

      const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
      const filtered = (data.anomalies || []).filter((a: AnomalyRecord) =>
        new Date(a.timestamp).getTime() >= cutoff
      );
      setAnomalies(filtered);
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') return;
      const message = err instanceof Error ? err.message : 'Erro desconhecido';
      setError(`Erro ao carregar dados: ${message}`);
    } finally {
      setLoading(false);
    }
  }, [days]);

  useEffect(() => {
    const controller = new AbortController();
    fetchData(controller.signal);
    return () => controller.abort();
  }, [fetchData]);

  // Dispara fetch manual com AbortController próprio para evitar race conditions
  const handleManualRefresh = useCallback(() => {
    if (manualAbortRef.current) manualAbortRef.current.abort();
    const controller = new AbortController();
    manualAbortRef.current = controller;
    fetchData(controller.signal);
  }, [fetchData]);

  // Estatísticas calculadas no frontend
  const displayed = useMemo(
    () => severityFilter > 0
      ? anomalies.filter(a => (a.details?.score ?? 0) >= severityFilter)
      : anomalies,
    [anomalies, severityFilter]
  );

  // Stats calculados sobre `displayed` para refletir o filtro ativo
  const affectedUsers = useMemo(() => new Set(displayed.map(a => a.user_id)).size, [displayed]);
  const highSeverityCount = useMemo(
    () => displayed.filter(a => (a.details?.score ?? 0) >= 70).length,
    [displayed]
  );
  const avgScore = useMemo(
    () => displayed.length > 0
      ? displayed.reduce((sum, a) => sum + (a.details?.score ?? 0), 0) / displayed.length
      : 0,
    [displayed]
  );

  const byType = useMemo(() => Object.entries(
    anomalies.reduce((acc: Record<string, { count: number; scoreSum: number }>, a) => {
      const type = a.details?.type || a.operation;
      if (!acc[type]) acc[type] = { count: 0, scoreSum: 0 };
      acc[type].count++;
      acc[type].scoreSum += a.details?.score ?? 0;
      return acc;
    }, {})
  ).map(([type, v]) => ({ type, count: v.count, avg_score: v.scoreSum / v.count })), [anomalies]);

  const topUsers = useMemo(() => Object.entries(
    anomalies.reduce((acc: Record<string, { username: string; count: number; last: string }>, a) => {
      if (!acc[a.user_id]) acc[a.user_id] = { username: a.username, count: 0, last: a.timestamp };
      acc[a.user_id].count++;
      // Bug #4: proteção contra Invalid Date em timestamps malformados
      const aTime = new Date(a.timestamp).getTime();
      const lastTime = new Date(acc[a.user_id].last).getTime();
      if (!isNaN(aTime) && (isNaN(lastTime) || aTime > lastTime)) acc[a.user_id].last = a.timestamp;
      return acc;
    }, {})
  )
    .map(([user_id, v]) => ({ user_id, username: v.username, anomaly_count: v.count, last_anomaly: v.last }))
    .sort((a, b) => b.anomaly_count - a.anomaly_count)
    .slice(0, 10), [anomalies]);

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <div className="text-center">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600 mx-auto mb-3" aria-hidden="true" />
          <p className="text-gray-500 dark:text-gray-400">Carregando dashboard...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <div className="flex items-center gap-2 text-red-600 dark:text-red-400 mb-3">
          <XCircle className="w-5 h-5" aria-hidden="true" />
          <span className="font-medium">{error}</span>
        </div>
        <button onClick={handleManualRefresh} className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
          <RefreshCw className="w-4 h-4" aria-hidden="true" /> Tentar novamente
        </button>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-2">
        <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
          <Activity className="w-6 h-6 text-blue-600 dark:text-blue-400" aria-hidden="true" />
        </div>
        <div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Dashboard de Anomalias</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">Monitoramento de comportamentos suspeitos detectados por ML</p>
        </div>
        <button onClick={handleManualRefresh} className="ml-auto p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg" title="Atualizar" aria-label="Atualizar dados">
          <RefreshCw className="w-4 h-4 text-gray-500 dark:text-gray-400" aria-hidden="true" />
        </button>
      </div>

      <div className="h-px bg-blue-200 dark:bg-blue-800 mb-6" />

      {/* Filtros */}
      <div className="bg-gradient-to-r from-blue-50 to-sky-50 dark:from-blue-900/20 dark:to-sky-900/20 p-4 rounded-lg border border-blue-200 dark:border-blue-800 shadow-sm mb-6">
        <div className="flex flex-col lg:flex-row lg:items-center gap-4 lg:gap-6">
          <div className="flex items-center gap-2">
            <Filter className="w-5 h-5 text-blue-500" aria-hidden="true" />
            <h3 className="text-lg font-bold text-gray-800 dark:text-gray-100 uppercase tracking-wide">Filtre seus itens:</h3>
          </div>
          <div className="flex items-end gap-3 flex-1">
            <div className="flex flex-col flex-1 min-w-0">
              <label htmlFor="anomaly-period-filter" className="text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">Período</label>
              <select
                id="anomaly-period-filter"
                name="anomaly-period-filter"
                aria-label="Filtrar por período"
                value={days}
                onChange={(e) => setDays(Number(e.target.value))}
                className="px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-gray-700 dark:text-gray-100 w-full"
              >
                <option value={1}>Últimas 24 horas</option>
                <option value={7}>Últimos 7 dias</option>
                <option value={30}>Últimos 30 dias</option>
                <option value={90}>Últimos 90 dias</option>
              </select>
            </div>
            <div className="flex flex-col flex-1 min-w-0">
              <label htmlFor="anomaly-severity-filter" className="text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">Severidade mínima</label>
              <select
                id="anomaly-severity-filter"
                name="anomaly-severity-filter"
                aria-label="Filtrar por severidade mínima"
                value={severityFilter}
                onChange={(e) => setSeverityFilter(Number(e.target.value))}
                className="px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-gray-700 dark:text-gray-100 w-full"
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
          { icon: <BarChart3 className="w-8 h-8 text-blue-500" aria-hidden="true" />, value: anomalies.length, label: 'Total de Anomalias' },
          { icon: <Users className="w-8 h-8 text-blue-500" aria-hidden="true" />, value: affectedUsers, label: 'Usuários Afetados' },
          { icon: <TrendingUp className="w-8 h-8 text-blue-500" aria-hidden="true" />, value: avgScore.toFixed(1), label: 'Score Médio' },
          { icon: <AlertTriangle className="w-8 h-8 text-red-500" aria-hidden="true" />, value: highSeverityCount, label: 'Alta Severidade' },
        ].map((card, i) => (
          <div key={i} className="bg-white dark:!bg-[#243040] border border-gray-100 dark:border-gray-700 rounded-xl p-4 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 flex items-center gap-3">
            <div className="flex-shrink-0">{card.icon}</div>
            <div>
              <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">{card.value}</div>
              <div className="text-xs text-gray-500 dark:text-gray-400">{card.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Anomalias por Tipo */}
      {byType.length > 0 && (
        <div className="bg-white dark:!bg-[#243040] border border-gray-100 dark:border-gray-700 rounded-xl p-4 shadow-sm mb-6">
          <h3 className="font-semibold text-gray-800 dark:text-gray-100 mb-3 flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-blue-600" aria-hidden="true" /> Anomalias por Tipo
          </h3>
          <div className="space-y-2">
            {byType.map(item => {
              const pct = anomalies.length > 0 ? (item.count / anomalies.length) * 100 : 0;
              return (
                <div key={item.type}>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-gray-700 dark:text-gray-200">{ANOMALY_LABELS[item.type] || item.type} <span className="text-gray-400 dark:text-gray-500">({item.count})</span></span>
                    <span className="text-gray-500 text-xs">Score: {item.avg_score.toFixed(0)}</span>
                  </div>
                  <div className="h-2 bg-gray-100 rounded-full overflow-hidden" role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100} aria-label={`${ANOMALY_LABELS[item.type] || item.type}: ${Math.round(pct)}%`}>
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
        <div className="bg-white dark:!bg-[#243040] border border-gray-100 dark:border-gray-700 rounded-xl p-4 shadow-sm mb-6">
          <h3 className="font-semibold text-gray-800 dark:text-gray-100 mb-3 flex items-center gap-2">
            <Users className="w-4 h-4 text-blue-600" aria-hidden="true" /> Usuários com Mais Anomalias
          </h3>
          <div className="space-y-2">
            {topUsers.map((u, index) => (
              <div key={u.user_id} className="flex items-center justify-between py-2 border-b border-gray-100 dark:border-gray-700 last:border-0">
                <div className="flex items-center gap-3">
                  <span className="text-xs font-bold text-gray-400 w-6">#{index + 1}</span>
                  <div>
                    <div className="font-medium text-gray-800 dark:text-gray-100 text-sm">{u.username}</div>
                    <div className="text-xs text-gray-500">{u.anomaly_count} anomalia{u.anomaly_count > 1 ? 's' : ''} · Última: {getTimeAgo(u.last_anomaly)}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Anomalias Recentes */}
      <div className="bg-white dark:!bg-[#243040] border border-gray-100 dark:border-gray-700 rounded-xl p-4 shadow-sm">
        <h3 className="font-semibold text-gray-800 dark:text-gray-100 mb-3 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-orange-500" aria-hidden="true" /> Anomalias Recentes
        </h3>
        {displayed.length === 0 ? (
          <p className="text-center py-8 text-gray-400">
            {severityFilter > 0
              ? 'Nenhuma anomalia encontrada para os filtros de período e severidade selecionados'
              : 'Nenhuma anomalia encontrada no período selecionado'}
          </p>
        ) : (
          <div className="space-y-3">
            {displayed.map(anomaly => {
              const score = anomaly.details?.score ?? 0;
              const type = anomaly.details?.type || anomaly.operation;
              const sev = getSeverity(score);
              return (
                <div key={anomaly.id} className="border border-gray-100 dark:border-gray-700 rounded-lg p-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-medium text-gray-800 dark:text-gray-100 text-sm">{ANOMALY_LABELS[type] || type}</span>
                    <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${sev.bg} ${sev.text}`}>{sev.label}</span>
                  </div>
                  <div className="text-xs text-gray-600 dark:text-gray-400 flex items-center gap-1 mb-1">
                    <User className="w-3 h-3" aria-hidden="true" /> {anomaly.username}
                  </div>
                  {anomaly.details?.baseline && (
                    <div className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1">
                      <MapPin className="w-3 h-3" aria-hidden="true" />
                      Usual: {Array.isArray(anomaly.details.baseline) ? anomaly.details.baseline.join(', ') : String(anomaly.details.baseline)}
                      {anomaly.details.detected ? ` → Detectado: ${anomaly.details.detected}` : ''}
                    </div>
                  )}
                  {anomaly.details?.message && (
                    <div className="text-xs text-gray-500 dark:text-gray-400">{String(anomaly.details.message)}</div>
                  )}
                  <div className="flex items-center gap-4 mt-2 text-xs text-gray-400 dark:text-gray-500">
                    <span className="flex items-center gap-1"><Hash className="w-3 h-3" aria-hidden="true" /> Score: {score}</span>
                    <span className="flex items-center gap-1"><Clock className="w-3 h-3" aria-hidden="true" /> {getTimeAgo(anomaly.timestamp)}</span>
                    <span className="flex items-center gap-1"><Globe className="w-3 h-3" aria-hidden="true" /> {anomaly.ip_address}</span>
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
