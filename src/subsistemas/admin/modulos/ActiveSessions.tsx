import { useState, useEffect, useCallback } from 'react';
import { Lock, XCircle, RefreshCw, Monitor, Smartphone, Globe, Clock, Calendar, MapPin, Trash2 } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';

interface Session {
  id: string;
  user_id: string;
  username: string;
  role: string;
  ip_address: string;
  device_type: string;
  device_name: string;
  browser: string;
  os: string;
  country: string;
  city: string;
  created_at: string;
  last_activity_at: string;
  expires_at: string;
  is_active: boolean;
}

const API_BASE_URL =
  typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
    ? 'http://localhost:9001/api'
    : ((import.meta as any).env?.VITE_API_URL || '/api');

export default function ActiveSessions() {
  const { token } = useAuth();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const authHeaders = useCallback(() => ({
    'Authorization': `Bearer ${token ?? ''}`,
    'Content-Type': 'application/json',
  }), [token]);

  const fetchSessions = useCallback(async (signal?: AbortSignal) => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch(`${API_BASE_URL}/sessions`, { headers: authHeaders(), signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setSessions(data.sessions || []);
      setLoading(false);
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') return;
      setError('Erro ao carregar sessões');
      setLoading(false);
    }
  }, [authHeaders]);

  useEffect(() => {
    if (!token) return;
    const controller = new AbortController();
    fetchSessions(controller.signal);
    return () => controller.abort();
  }, [token, fetchSessions]);

  const revokeSession = async (sessionId: string) => {
    if (!confirm('Deseja encerrar esta sessão? O dispositivo será desconectado imediatamente.')) return;
    try {
      const res = await fetch(`${API_BASE_URL}/sessions/${sessionId}`, { method: 'DELETE', headers: authHeaders() });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setSessions(prev => prev.filter(s => s.id !== sessionId));
    } catch {
      alert('Erro ao encerrar sessão');
    }
  };

  const revokeAll = async () => {
    if (!confirm('Deseja encerrar TODAS as outras sessões?\n\nTodos os outros dispositivos serão desconectados imediatamente.')) return;
    try {
      const res = await fetch(`${API_BASE_URL}/sessions`, {
        method: 'DELETE',
        headers: authHeaders(),
        body: JSON.stringify({}),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      alert('Todas as outras sessões foram encerradas!');
      const controller = new AbortController();
      fetchSessions(controller.signal);
    } catch {
      alert('Erro ao encerrar sessões');
    }
  };

  const getDeviceIcon = (type: string) => {
    if (type === 'mobile' || type === 'tablet') return <Smartphone className="w-6 h-6 text-blue-600" />;
    return <Monitor className="w-6 h-6 text-blue-600" />;
  };

  const getTimeAgo = (timestamp: string): string => {
    if (!timestamp) return 'Desconhecido';
    const date = new Date(timestamp);
    if (isNaN(date.getTime())) return 'Desconhecido';
    const diff = Date.now() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    if (days > 0) return `${days} dia${days > 1 ? 's' : ''} atrás`;
    if (hours > 0) return `${hours} hora${hours > 1 ? 's' : ''} atrás`;
    if (minutes > 0) return `${minutes} minuto${minutes > 1 ? 's' : ''} atrás`;
    return 'Agora';
  };

  const formatDate = (timestamp: string): string => {
    if (!timestamp) return 'Data desconhecida';
    const date = new Date(timestamp);
    if (isNaN(date.getTime())) return 'Data inválida';
    return date.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <div className="text-center">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-500 mx-auto mb-3" aria-hidden="true" />
          <p className="text-gray-500 dark:text-gray-400">Carregando sessões...</p>
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
        <button onClick={() => fetchSessions()} className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 dark:hover:bg-blue-500">
          <RefreshCw className="w-4 h-4" aria-hidden="true" /> Tentar novamente
        </button>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-2">
        <div className="p-2.5 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl shadow-md shadow-blue-500/25">
          <Lock className="w-6 h-6 text-white" aria-hidden="true" />
        </div>
        <div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Sessões Ativas</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">Gerencie os dispositivos conectados à sua conta</p>
        </div>
        <button onClick={() => fetchSessions()} className="ml-auto p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg" title="Atualizar" aria-label="Atualizar sessões">
          <RefreshCw className="w-4 h-4 text-gray-500 dark:text-gray-400" aria-hidden="true" />
        </button>
      </div>

      <div className="h-px bg-gradient-to-r from-blue-200 to-indigo-200 dark:from-blue-800 dark:to-indigo-800 mb-6" />

      {sessions.length === 0 ? (
        <div className="text-center py-12 text-gray-400 dark:text-gray-500">Nenhuma sessão ativa encontrada.</div>
      ) : (
        <div className="space-y-4">
          {sessions.map((session, index) => (
            <div key={session.id} className="bg-white dark:!bg-[#243040] border border-gray-200 dark:border-gray-700 rounded-xl p-4 shadow-sm hover:shadow-md hover:border-blue-200 dark:hover:border-blue-700 transition-all duration-200">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <div className="p-2 bg-blue-50 dark:bg-blue-900/20 rounded-lg flex-shrink-0" aria-hidden="true">
                    {getDeviceIcon(session.device_type)}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-gray-900 dark:text-gray-100 truncate">{session.device_name || 'Dispositivo desconhecido'}</span>
                      <span className="px-2 py-0.5 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 text-xs rounded-full font-medium">@{session.username}</span>
                    </div>
                    <p className="text-sm text-gray-400 dark:text-gray-500">{session.browser || 'Navegador desconhecido'} · {session.os || 'SO desconhecido'}</p>
                  </div>
                </div>
                {index !== 0 && (
                  <button
                    onClick={() => revokeSession(session.id)}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-red-600 border border-red-200 dark:border-red-800 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 text-sm flex-shrink-0"
                    aria-label={`Encerrar sessão de ${session.device_name || 'dispositivo desconhecido'}`}
                  >
                    <Trash2 className="w-3.5 h-3.5" aria-hidden="true" /> Encerrar
                  </button>
                )}
              </div>

              <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-2 text-sm text-gray-500">
                <div className="flex items-center gap-1.5">
                  <MapPin className="w-3.5 h-3.5 flex-shrink-0" aria-hidden="true" />
                  <span className="truncate">{session.city && session.country ? `${session.city}, ${session.country}` : (session.country || 'Localização desconhecida')}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Globe className="w-3.5 h-3.5 flex-shrink-0" aria-hidden="true" />
                  <span className="truncate font-mono text-xs">{session.ip_address || 'IP desconhecido'}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 flex-shrink-0" aria-hidden="true" />
                  <span className="truncate">Ativo {getTimeAgo(session.last_activity_at)}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5 flex-shrink-0" aria-hidden="true" />
                  <span className="truncate">Criada {formatDate(session.created_at)}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {sessions.length > 1 && (
        <div className="mt-6 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl">
          <button
            onClick={revokeAll}
            className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 font-medium"
          >
            <XCircle className="w-4 h-4" aria-hidden="true" /> Encerrar todas as outras sessões
          </button>
          <p className="text-center text-xs text-red-500 dark:text-red-400 mt-2">Todos os outros dispositivos serão desconectados imediatamente</p>
        </div>
      )}

      <div className="mt-6 p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl text-sm text-blue-700 dark:text-blue-300">
        <p className="font-medium mb-1">Sobre as Sessões</p>
        <ul className="space-y-0.5 list-disc list-inside text-blue-600 dark:text-blue-400">
          <li>Cada sessão representa um dispositivo conectado à sua conta</li>
          <li>Sessões expiram automaticamente após períodos de inatividade</li>
          <li>Se você não reconhece algum dispositivo, encerre a sessão imediatamente</li>
        </ul>
      </div>
    </div>
  );
}
