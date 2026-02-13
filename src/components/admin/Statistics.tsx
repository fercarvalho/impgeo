import { useState, useEffect, useMemo } from 'react';
import { Download, Users, Activity, Package, BarChart3 } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts';
import { getAdminApiBaseUrl } from './api';

interface StatisticsData {
  users: {
    total: number;
    active: number;
    inactive: number;
    byRole: {
      admin: number;
      user: number;
      guest: number;
    };
  };
  activity: {
    totalLogins: number;
    totalActions: number;
    actionsLast30Days: number;
    byModule: Record<string, { actions: number; users: number }>;
    topUsers: Array<{ count: number; username: string }>;
    topModules: Array<{ key: string; count: number }>;
  };
  data: {
    transactions: number;
    products: number;
    clients: number;
  };
  modules: {
    total: number;
    active: number;
    system: number;
    custom: number;
  };
}

const Statistics: React.FC = () => {
  const { token } = useAuth();
  const apiBase = useMemo(() => getAdminApiBaseUrl(), []);
  const [statistics, setStatistics] = useState<StatisticsData | null>(null);
  const [timeline, setTimeline] = useState<Array<{ date: string; count: number }>>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [period, setPeriod] = useState<'7' | '30' | '90' | 'custom'>('30');
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');

  useEffect(() => {
    loadStatistics();
    loadTimeline();
  }, [period, customStartDate, customEndDate]);

  const authHeaders = () => ({
    Authorization: `Bearer ${token || localStorage.getItem('authToken') || ''}`,
    'Content-Type': 'application/json'
  });

  const loadStatistics = async () => {
    try {
      setIsLoading(true);
      const response = await fetch(`${apiBase}/admin/statistics`, { headers: authHeaders() });
      const result = await response.json();
      if (result.success) {
        setStatistics(result.data);
      }
    } catch (error) {
      console.error('Erro ao carregar estatísticas:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const loadTimeline = async () => {
    try {
      let startDate = '';
      let endDate = new Date().toISOString().split('T')[0];

      if (period === '7') {
        const date = new Date();
        date.setDate(date.getDate() - 7);
        startDate = date.toISOString().split('T')[0];
      } else if (period === '30') {
        const date = new Date();
        date.setDate(date.getDate() - 30);
        startDate = date.toISOString().split('T')[0];
      } else if (period === '90') {
        const date = new Date();
        date.setDate(date.getDate() - 90);
        startDate = date.toISOString().split('T')[0];
      } else if (period === 'custom') {
        startDate = customStartDate;
        endDate = customEndDate || endDate;
      }

      if (!startDate) return;

      const response = await fetch(
        `${apiBase}/admin/statistics/usage-timeline?startDate=${startDate}&endDate=${endDate}&groupBy=day`,
        { headers: authHeaders() }
      );
      const result = await response.json();
      if (result.success) {
        setTimeline(result.data || []);
      }
    } catch (error) {
      console.error('Erro ao carregar timeline:', error);
    }
  };

  const handleExport = () => {
    if (!statistics) return;
    const data = { ...statistics, timeline, exportedAt: new Date().toISOString() };
    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `statistics-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
  };

  const COLORS = ['#2563eb', '#1d4ed8', '#3b82f6', '#6366f1', '#8b5cf6', '#0ea5e9'];

  if (isLoading) {
    return <div className="text-center py-8">Carregando estatísticas...</div>;
  }

  if (!statistics) {
    return <div className="text-center py-8 text-red-600">Erro ao carregar estatísticas</div>;
  }

  const moduleData = Object.entries(statistics.activity.byModule).map(([key, value]) => ({
    name: key,
    actions: value.actions,
    users: value.users
  }));

  const roleData = [
    { name: 'Admin', value: statistics.users.byRole.admin },
    { name: 'Usuário', value: statistics.users.byRole.user },
    { name: 'Convidado', value: statistics.users.byRole.guest }
  ];

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-blue-900">Estatísticas do Sistema</h2>
        <button
          onClick={handleExport}
          className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          <Download className="h-5 w-5 mr-2" />
          Exportar Relatório
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Total de Usuários</p>
              <p className="text-2xl font-bold text-gray-900">{statistics.users.total}</p>
              <p className="text-xs text-green-600 mt-1">{statistics.users.active} ativos</p>
            </div>
            <Users className="h-12 w-12 text-blue-600" />
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Ações (30 dias)</p>
              <p className="text-2xl font-bold text-gray-900">{statistics.activity.actionsLast30Days}</p>
              <p className="text-xs text-gray-500 mt-1">{statistics.activity.totalActions} total</p>
            </div>
            <Activity className="h-12 w-12 text-blue-500" />
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Módulos</p>
              <p className="text-2xl font-bold text-gray-900">{statistics.modules.total}</p>
              <p className="text-xs text-gray-500 mt-1">{statistics.modules.active} ativos</p>
            </div>
            <Package className="h-12 w-12 text-green-500" />
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Dados</p>
              <p className="text-2xl font-bold text-gray-900">
                {statistics.data.transactions + statistics.data.products + statistics.data.clients}
              </p>
              <p className="text-xs text-gray-500 mt-1">Transações, Produtos, Clientes</p>
            </div>
            <BarChart3 className="h-12 w-12 text-purple-500" />
          </div>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow p-4">
        <div className="flex items-center gap-4">
          <label className="text-sm font-medium text-gray-700">Período:</label>
          <div className="flex gap-2">
            <button onClick={() => setPeriod('7')} className={`px-4 py-2 rounded-lg transition-colors ${period === '7' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}>7 dias</button>
            <button onClick={() => setPeriod('30')} className={`px-4 py-2 rounded-lg transition-colors ${period === '30' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}>30 dias</button>
            <button onClick={() => setPeriod('90')} className={`px-4 py-2 rounded-lg transition-colors ${period === '90' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}>90 dias</button>
            <button onClick={() => setPeriod('custom')} className={`px-4 py-2 rounded-lg transition-colors ${period === 'custom' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}>Personalizado</button>
          </div>
          {period === 'custom' && (
            <div className="flex gap-2 ml-4">
              <input type="date" value={customStartDate} onChange={(e) => setCustomStartDate(e.target.value)} className="px-3 py-2 border rounded-lg" />
              <span className="self-center">até</span>
              <input type="date" value={customEndDate} onChange={(e) => setCustomEndDate(e.target.value)} className="px-3 py-2 border rounded-lg" />
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold mb-4">Timeline de Uso</h3>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={timeline}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" tick={{ fontSize: 12 }} angle={-45} textAnchor="end" height={80} />
              <YAxis />
              <Tooltip />
              <Legend />
              <Line type="monotone" dataKey="count" stroke="#2563eb" strokeWidth={2} name="Ações" />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold mb-4">Uso por Módulo</h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={moduleData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" tick={{ fontSize: 12 }} />
              <YAxis />
              <Tooltip />
              <Legend />
              <Bar dataKey="actions" fill="#3b82f6" name="Ações" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold mb-4">Usuários por Função</h3>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={roleData}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={(props: any) => {
                  const { name, percent } = props;
                  return `${name}: ${((percent || 0) * 100).toFixed(0)}%`;
                }}
                outerRadius={80}
                fill="#8884d8"
                dataKey="value"
              >
                {roleData.map((_entry, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold mb-4">Top 5 Usuários Mais Ativos</h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={statistics.activity.topUsers}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="username" tick={{ fontSize: 12 }} />
              <YAxis />
              <Tooltip />
              <Legend />
              <Bar dataKey="count" fill="#1d4ed8" name="Ações" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold mb-4">Módulos Mais Usados</h3>
          <div className="space-y-2">
            {statistics.activity.topModules.map((module) => (
              <div key={module.key} className="flex items-center justify-between p-2 hover:bg-gray-50 rounded">
                <span className="text-sm font-medium">{module.key}</span>
                <span className="text-sm text-gray-600">{module.count} ações</span>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold mb-4">Resumo de Dados</h3>
          <div className="space-y-3">
            <div className="flex justify-between items-center p-3 bg-gray-50 rounded">
              <span className="text-sm font-medium">Transações</span>
              <span className="text-lg font-bold text-blue-600">{statistics.data.transactions}</span>
            </div>
            <div className="flex justify-between items-center p-3 bg-gray-50 rounded">
              <span className="text-sm font-medium">Produtos</span>
              <span className="text-lg font-bold text-blue-600">{statistics.data.products}</span>
            </div>
            <div className="flex justify-between items-center p-3 bg-gray-50 rounded">
              <span className="text-sm font-medium">Clientes</span>
              <span className="text-lg font-bold text-green-600">{statistics.data.clients}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Statistics;
