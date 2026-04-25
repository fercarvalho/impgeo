import React, { useState, useEffect, useRef } from 'react';
import { 
  Download, Users, Activity, Package, BarChart3
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { 
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts';
const API_BASE_URL =
  typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
    ? 'http://localhost:9001/api'
    : ((import.meta as any).env?.VITE_API_URL || '/api');

interface Statistics {
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
  const [statistics, setStatistics] = useState<Statistics | null>(null);
  const [timeline, setTimeline] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [period, setPeriod] = useState<'7' | '30' | '90' | 'custom'>('30');
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    loadStatistics();
  }, []);

  useEffect(() => {
    // Para datas customizadas, aguardar 600ms após a última alteração antes de buscar
    if (period === 'custom') {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      // Capturar valores atuais no closure para evitar stale closure no setTimeout
      const start = customStartDate;
      const end = customEndDate;
      debounceRef.current = setTimeout(() => {
        if (start) loadTimeline(start, end);
      }, 600);
      return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
    }
    loadTimeline();
  }, [period, customStartDate, customEndDate]);

  const loadStatistics = async () => {
    try {
      setIsLoading(true);
      const response = await fetch(`${API_BASE_URL}/admin/statistics`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
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

  const loadTimeline = async (overrideStart?: string, overrideEnd?: string) => {
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
        startDate = overrideStart ?? customStartDate;
        endDate = overrideEnd || customEndDate || endDate;
      }

      if (!startDate) return;

      const response = await fetch(
        `${API_BASE_URL}/admin/statistics/usage-timeline?startDate=${startDate}&endDate=${endDate}&groupBy=day`,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        }
      );
      const result = await response.json();
      if (result.success) {
        setTimeline(result.data);
      }
    } catch (error) {
      console.error('Erro ao carregar timeline:', error);
    }
  };

  const handleExport = () => {
    if (!statistics) return;

    const data = {
      ...statistics,
      timeline,
      exportedAt: new Date().toISOString()
    };

    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `statistics-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  const COLORS = ['#f59e0b', '#ef4444', '#10b981', '#3b82f6', '#8b5cf6', '#ec4899'];

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-amber-600"></div>
      </div>
    );
  }

  if (!statistics) {
    return (
      <div className="flex flex-col items-center gap-3 py-16">
        <BarChart3 className="w-12 h-12 text-red-300" />
        <p className="text-red-600 font-medium">Erro ao carregar estatísticas</p>
        <p className="text-gray-400 text-sm">Tente recarregar a página</p>
      </div>
    );
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
        <h2 className="text-2xl font-bold text-amber-900">Estatísticas do Sistema</h2>
        <button
          onClick={handleExport}
          className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-amber-500 to-orange-600 text-white font-semibold rounded-xl hover:from-amber-600 hover:to-orange-700 shadow-lg hover:shadow-xl transform hover:-translate-y-0.5 transition-all duration-200"
        >
          <Download className="h-5 w-5" />
          Exportar Relatório
        </button>
      </div>

      {/* Cards de Resumo */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-gradient-to-r from-amber-500 to-orange-400 rounded-2xl shadow-lg p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-white/80 font-medium">Total de Usuários</p>
              <p className="text-2xl font-bold text-white">{statistics.users.total}</p>
              <p className="text-xs text-white/70 mt-1">{statistics.users.active} ativos</p>
            </div>
            <div className="bg-white/20 rounded-xl p-3">
              <Users className="h-8 w-8 text-white" />
            </div>
          </div>
        </div>

        <div className="bg-gradient-to-r from-blue-500 to-indigo-400 rounded-2xl shadow-lg p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-white/80 font-medium">Ações (30 dias)</p>
              <p className="text-2xl font-bold text-white">{statistics.activity.actionsLast30Days}</p>
              <p className="text-xs text-white/70 mt-1">{statistics.activity.totalActions} total</p>
            </div>
            <div className="bg-white/20 rounded-xl p-3">
              <Activity className="h-8 w-8 text-white" />
            </div>
          </div>
        </div>

        <div className="bg-gradient-to-r from-emerald-500 to-green-400 rounded-2xl shadow-lg p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-white/80 font-medium">Módulos</p>
              <p className="text-2xl font-bold text-white">{statistics.modules.total}</p>
              <p className="text-xs text-white/70 mt-1">{statistics.modules.active} ativos</p>
            </div>
            <div className="bg-white/20 rounded-xl p-3">
              <Package className="h-8 w-8 text-white" />
            </div>
          </div>
        </div>

        <div className="bg-gradient-to-r from-violet-500 to-purple-400 rounded-2xl shadow-lg p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-white/80 font-medium">Dados</p>
              <p className="text-2xl font-bold text-white">
                {statistics.data.transactions + statistics.data.products + statistics.data.clients}
              </p>
              <p className="text-xs text-white/70 mt-1">Transações, Produtos, Clientes</p>
            </div>
            <div className="bg-white/20 rounded-xl p-3">
              <BarChart3 className="h-8 w-8 text-white" />
            </div>
          </div>
        </div>
      </div>

      {/* Filtros de Período */}
      <div className="bg-gradient-to-r from-amber-50 to-orange-50 dark:from-gray-800 dark:to-gray-800 rounded-2xl border border-amber-200 dark:border-gray-700 shadow-lg p-4">
        <div className="flex items-center gap-4">
          <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Período:</label>
          <div className="flex gap-2">
            {(['7', '30', '90', 'custom'] as const).map((p) => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className={`px-4 py-2 rounded-2xl text-sm font-semibold transition-all duration-200 ${
                  period === p
                    ? 'bg-gradient-to-r from-amber-400 to-orange-400 text-white shadow-lg'
                    : 'bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-600 hover:border-amber-300 dark:hover:border-amber-600 hover:text-amber-600 dark:hover:text-amber-400'
                }`}
              >
                {p === '7' ? '7 dias' : p === '30' ? '30 dias' : p === '90' ? '90 dias' : 'Personalizado'}
              </button>
            ))}
          </div>
          {period === 'custom' && (
            <div className="flex items-center gap-2 ml-4">
              <input
                type="date"
                value={customStartDate}
                onChange={(e) => setCustomStartDate(e.target.value)}
                className="px-3 py-2 border border-amber-300 dark:border-gray-600 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-amber-500 bg-white dark:!bg-gray-700 dark:text-gray-100 text-sm"
              />
              <span className="text-sm text-amber-700 dark:text-amber-400 font-medium">até</span>
              <input
                type="date"
                value={customEndDate}
                onChange={(e) => setCustomEndDate(e.target.value)}
                className="px-3 py-2 border border-amber-300 dark:border-gray-600 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-amber-500 bg-white dark:!bg-gray-700 dark:text-gray-100 text-sm"
              />
            </div>
          )}
        </div>
      </div>

      {/* Gráficos */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Timeline de Uso */}
        <div className="bg-white rounded-2xl shadow-lg p-6">
          <h3 className="text-lg font-semibold mb-4 border-l-4 border-amber-400 pl-3">Timeline de Uso</h3>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={timeline}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis 
                dataKey="date" 
                tick={{ fontSize: 12 }}
                angle={-45}
                textAnchor="end"
                height={80}
              />
              <YAxis />
              <Tooltip />
              <Legend />
              <Line type="monotone" dataKey="count" stroke="#f59e0b" strokeWidth={2} name="Ações" />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Uso por Módulo */}
        <div className="bg-white rounded-2xl shadow-lg p-6">
          <h3 className="text-lg font-semibold mb-4 border-l-4 border-amber-400 pl-3">Uso por Módulo</h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={moduleData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" tick={{ fontSize: 12 }} />
              <YAxis />
              <Tooltip />
              <Legend />
              <Bar dataKey="actions" fill="#f59e0b" name="Ações" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Distribuição de Usuários por Função */}
        <div className="bg-white rounded-2xl shadow-lg p-6">
          <h3 className="text-lg font-semibold mb-4 border-l-4 border-amber-400 pl-3">Usuários por Função</h3>
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

        {/* Top Usuários */}
        <div className="bg-white rounded-2xl shadow-lg p-6">
          <h3 className="text-lg font-semibold mb-4 border-l-4 border-amber-400 pl-3">Top 5 Usuários Mais Ativos</h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={statistics.activity.topUsers}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="username" tick={{ fontSize: 12 }} />
              <YAxis />
              <Tooltip />
              <Legend />
              <Bar dataKey="count" fill="#10b981" name="Ações" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Tabelas de Detalhes */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-2xl shadow-lg p-6">
          <h3 className="text-lg font-semibold mb-4 border-l-4 border-amber-400 pl-3">Módulos Mais Usados</h3>
          <div className="space-y-2">
            {statistics.activity.topModules.map((module, _index) => (
              <div key={module.key} className="flex items-center justify-between p-2 hover:bg-gray-50 rounded-lg">
                <span className="text-sm font-medium">{module.key}</span>
                <span className="text-sm text-gray-600">{module.count} ações</span>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-lg p-6">
          <h3 className="text-lg font-semibold mb-4 border-l-4 border-amber-400 pl-3">Resumo de Dados</h3>
          <div className="space-y-3">
            <div className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
              <span className="text-sm font-medium">Transações</span>
              <span className="text-lg font-bold text-amber-600">{statistics.data.transactions}</span>
            </div>
            <div className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
              <span className="text-sm font-medium">Produtos</span>
              <span className="text-lg font-bold text-blue-600">{statistics.data.products}</span>
            </div>
            <div className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
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

