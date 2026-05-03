import { useState, useEffect } from 'react'
import {
  Home,
  DollarSign,
  BarChart3,
  TrendingUp,
  Plus,
  Target,
  PieChart,
  TrendingDown,
  LogOut,
  ArrowUpCircle,
  Building,
  FileText,
  Map,
  Map as MapIcon,
  Calculator,
  Download,
  ClipboardList,
  Shield,
  Monitor,
  AlertTriangle,
  ShieldAlert,
  HelpCircle,
  BookOpen,
  CheckCircle2,
  Zap,
  Wallet,
  XCircle,
} from 'lucide-react'
// PDF libraries serão carregadas dinamicamente quando necessário
// Dynamic imports para componentes pesados (lazy loading)
import { lazy, Suspense } from 'react'
import { PieChart as RechartsPieChart, Pie, Cell, Tooltip as RechartsTooltip, Legend, ResponsiveContainer } from 'recharts'
import Login from './components/Login'
import ResetarSenhaModal from './components/ResetarSenhaModal'
import ChartModal from './components/modals/ChartModal'
import MenuUsuario from './components/MenuUsuario'

const Reports = lazy(() => import('./components/Reports'))
const TransactionsPage = lazy(() => import('./components/Transactions').then(module => ({ default: module.TransactionsPage })))
const Clients = lazy(() => import('./components/Clients'))
const DRE = lazy(() => import('./components/DRE'))
const Projects = lazy(() => import('./components/Projects'))
const Services = lazy(() => import('./components/Services'))
const Projection = lazy(() => import('./components/Projection'))
const Acompanhamentos = lazy(() => import('./components/Acompanhamentos'))
const AcompanhamentosView = lazy(() => import('./components/AcompanhamentosView'))
const AdminPanel = lazy(() => import('./components/admin/AdminTabs'))
const ActiveSessions = lazy(() => import('./components/admin/ActiveSessions'))
const AnomalyDashboard = lazy(() => import('./components/admin/AnomalyDashboard'))
const SecurityAlerts = lazy(() => import('./components/admin/SecurityAlerts'))
const FAQ = lazy(() => import('./components/FAQ'))
import Documentation from './components/Documentation'
const Roadmap = lazy(() => import('./components/Roadmap'))
import ImpersonationBanner from './components/ImpersonationBanner'
import FeedbackButton from './components/FeedbackButton'
import Footer from './components/Footer'
import CommitVersionModal from './components/CommitVersionModal'
import VersaoNovaModal from './components/VersaoNovaModal'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import { ThemeProvider, useTheme } from './contexts/ThemeContext'
import ThemeToggle from './components/ThemeToggle'
import { usePermissions } from './hooks/usePermissions'
// Gráficos agora são usados pelo componente Reports

// Funções para comunicação com a API
const API_BASE_URL = '/api'

// Funções para Transações
const fetchTransactions = async () => {
  const response = await fetch(`${API_BASE_URL}/transactions`)
  const result = await response.json()
  return result.success ? result.data : []
}


// Tipos
interface NewTransaction {
  id: string;
  date: string;
  description: string;
  value: number;
  type: 'Receita' | 'Despesa';
  category: string;
  createdAt?: string;
  updatedAt?: string;
}



interface Meta {
  id: string;
  descricao: string;
  valor: number;
  tipo: 'receita' | 'despesa' | 'lucro' | 'vendas';
  categoria?: string;
  dataInicio: string;
  dataFim: string;
  periodo: string;
  status: 'ativa' | 'pausada' | 'concluida';
}

type TabType = 'dashboard' | 'projects' | 'services' | 'reports' | 'metas' | 'transactions' | 'clients' | 'dre' | 'projecao' | 'acompanhamentos' | 'admin' | 'sessions' | 'anomalies' | 'security_alerts' | 'faq' | 'documentacao' | 'roadmap'

const AppContent: React.FC = () => {
  const { user, token, logout, isLoading } = useAuth();
  const [viewToken, setViewToken] = useState<string | null>(null);
  const [passwordResetToken, setPasswordResetToken] = useState<string | null>(null);
  const [showPasswordResetModal, setShowPasswordResetModal] = useState(false);

  // Sincronizar consentimento de cookies com o banco após login
  useEffect(() => {
    if (!user || !token) return;
    const LGPD_API = typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
      ? 'http://localhost:9001/api'
      : ((import.meta as any).env?.VITE_API_URL || '/api');
    const saved = localStorage.getItem('cookieConsent');
    if (!saved) return;
    try {
      const prefs = JSON.parse(saved);
      fetch(`${LGPD_API}/cookie-consentimento`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ preferencias: prefs, versaoTermos: 1, versaoPolitica: 1 }),
      }).catch(e => console.error('Erro ao sincronizar consentimento LGPD:', e));
    } catch {}
  }, [user?.id]);

  // Verificar se há token de visualização pública na URL
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const hash = window.location.hash.substring(1);
    const token = urlParams.get('token') || (hash.startsWith('view_') ? hash : null);
    const isPasswordResetToken = token && /^[0-9a-f]{64}$/i.test(token);
    const isViewRoute = window.location.pathname.includes('/acompanhamentos-view');
    
    // Se o token existe e não é de reset de senha, ou se estamos na rota de visualização
    if (token && (!isPasswordResetToken || isViewRoute || token.startsWith('view_'))) {
      setViewToken(token);
      return;
    }

    if (token) {
      setPasswordResetToken(token);
      setShowPasswordResetModal(true);
      const newUrl = window.location.pathname + window.location.hash;
      window.history.replaceState({}, '', newUrl);
    }
  }, []);

  if (viewToken) {
    // Renderizar visualização pública sem autenticação
    return <AcompanhamentosView token={viewToken} />;
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-100 dark:bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-3"></div>
          <p className="text-gray-600">Carregando...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <>
        <Login />
        {passwordResetToken ? (
          <ResetarSenhaModal
            isOpen={showPasswordResetModal}
            token={passwordResetToken}
            onClose={() => {
              setShowPasswordResetModal(false);
              setPasswordResetToken(null);
            }}
          />
        ) : null}
      </>
    );
  }

  return <AppMain user={user} logout={logout} />;
};

const AppMain: React.FC<{ user: any; logout: () => void }> = ({ user, logout }) => {
  const permissions = usePermissions();
  const { token } = useAuth();
  const { isDark } = useTheme();
  const [activeTab, setActiveTab] = useState<TabType>('dashboard')
  const [transactions, setTransactions] = useState<NewTransaction[]>([])
  const [metas, setMetas] = useState<Meta[]>([])
  const [projectionData, setProjectionData] = useState<any>(null)
  const [mktData, setMktData] = useState<any>(null)
  const [investmentsData, setInvestmentsData] = useState<any>(null)
  const [budgetData, setBudgetData] = useState<any>(null)
  const [variableExpensesData, setVariableExpensesData] = useState<any>(null)
  const [fixedExpensesData, setFixedExpensesData] = useState<any>(null)
  const [syncResults, setSyncResults] = useState<any>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isReloadingProjection, setIsReloadingProjection] = useState(false)
  const [showSuccessMessage, setShowSuccessMessage] = useState(false)
  const [showTransactionModal, setShowTransactionModal] = useState(false)
  const [catalogModules, setCatalogModules] = useState<{ moduleKey: string; moduleName: string; iconName?: string | null }[] | null>(null)

  // Commit pendente (superadmin)
  const [commitPendente, setCommitPendente] = useState<{
    commitHash: string;
    versaoAtual: string;
    mensagem: string;
    data: string;
  } | null>(null);

  // Notificação de nova versão (outros usuários)
  const [versoesNovas, setVersoesNovas] = useState<Array<{
    versao: string;
    texto: string;
  }> | null>(null);

  const getDefaultModulesByRole = (role: string): string[] => {
    const allWithoutAdmin = ['dashboard', 'projects', 'services', 'reports', 'metas', 'projecao', 'transactions', 'clients', 'dre', 'acompanhamentos', 'faq', 'documentacao'];
    if (role === 'superadmin') return [...allWithoutAdmin, 'admin', 'roadmap'];
    if (role === 'admin') return [...allWithoutAdmin, 'admin', 'roadmap'];
    if (role === 'user') return allWithoutAdmin;
    if (role === 'guest') return allWithoutAdmin.filter((moduleKey) => moduleKey !== 'dre' && moduleKey !== 'acompanhamentos');
    return [];
  };

  const modulesFromApi = Array.isArray(user?.modulesAccess)
    ? user.modulesAccess
        .map((item: any) => item?.moduleKey)
        .filter((moduleKey: string | undefined): moduleKey is string => Boolean(moduleKey))
    : [];

  const permissionKeys = modulesFromApi.length > 0 ? modulesFromApi : getDefaultModulesByRole(user?.role);
  const catalogModuleKeys = catalogModules ? catalogModules.map(m => m.moduleKey) : null;
  const availableModuleKeys = new Set(
    Array.isArray(catalogModuleKeys) && catalogModuleKeys.length > 0
      ? permissionKeys.filter((key: string) => catalogModuleKeys.includes(key))
      : permissionKeys
  );

  const hasModuleAccess = (moduleKey: string) => availableModuleKeys.has(moduleKey);

  // Verificar commit pendente quando superadmin faz login
  useEffect(() => {
    if (!token || !user || user.role !== 'superadmin') return;
    let cancelled = false;

    const checkCommit = async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/admin/rodape/commit-pendente`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok || cancelled) return;
        const json = await res.json();
        if (json.success && json.data?.pendente && !cancelled) {
          setCommitPendente({
            commitHash: json.data.commitHash,
            versaoAtual: json.data.versaoAtual || '',
            mensagem: json.data.mensagem || '',
            data: json.data.data || '',
          });
        }
      } catch {
        // silently ignore
      }
    };

    checkCommit();
    return () => { cancelled = true; };
  }, [token, user?.id]);

  // Verificar notificação de nova versão (usuários não-superadmin)
  useEffect(() => {
    if (!token || !user || user.role === 'superadmin') return;
    let cancelled = false;

    const checkVersao = async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/notificacao-versao`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok || cancelled) return;
        const json = await res.json();
        if (json.success && json.data?.notificar && Array.isArray(json.data.versoes) && json.data.versoes.length > 0 && !cancelled) {
          setVersoesNovas(json.data.versoes.map((v: any) => ({ versao: v.versao, texto: v.texto || '' })));
        }
      } catch {
        // silently ignore
      }
    };

    checkVersao();
    return () => { cancelled = true; };
  }, [token, user?.id]);

  useEffect(() => {
    const loadModulesCatalog = async () => {
      try {
        if (!localStorage.getItem('authToken')) return;
        const response = await fetch(`${API_BASE_URL}/modules-catalog`, {
          headers: {
            Authorization: `Bearer ${localStorage.getItem('authToken') || ''}`
          }
        });
        const result = await response.json();
        if (response.ok && result?.success && Array.isArray(result.data)) {
          setCatalogModules(
            result.data
              .filter((item: any) => Boolean(item?.moduleKey))
              .map((item: any) => ({
                moduleKey: item.moduleKey as string,
                moduleName: item.moduleName as string,
                iconName: item.iconName ?? null,
              }))
          );
        }
      } catch (error) {
        setCatalogModules(null);
      }
    };

    loadModulesCatalog();
  }, [user?.id]);

  useEffect(() => {
    if (!hasModuleAccess(activeTab)) {
      const orderedTabs: TabType[] = ['dashboard', 'projects', 'services', 'reports', 'metas', 'projecao', 'transactions', 'clients', 'dre', 'acompanhamentos', 'faq', 'admin', 'sessions', 'anomalies', 'security_alerts'];
      const fallbackTab = orderedTabs.find((tab) => hasModuleAccess(tab)) || 'dashboard';
      setActiveTab(fallbackTab);
    }
  }, [activeTab, user]);

  // Resetar para dashboard quando impersonation iniciar ou encerrar
  useEffect(() => {
    const handleImpersonationChange = () => setActiveTab('dashboard');
    window.addEventListener('auth:impersonation-changed', handleImpersonationChange);
    return () => window.removeEventListener('auth:impersonation-changed', handleImpersonationChange);
  }, []);

  // Resetar modal quando trocar de aba
  useEffect(() => {
    setShowTransactionModal(false)
  }, [activeTab])
  
  // Executar resetar cálculos automaticamente quando entrar na aba de metas
  useEffect(() => {
    if (activeTab === 'metas') {
      // Aguardar um pequeno delay para garantir que o componente esteja carregado
      const timer = setTimeout(() => {
        // Disparar evento customizado para o componente Projection executar resetarCalculos
        window.dispatchEvent(new CustomEvent('resetarCalculosAutomatico'))
      }, 500)
      
      return () => clearTimeout(timer)
    }
  }, [activeTab])
  


  // Estados para gráficos expandidos
  const [expandedCharts, setExpandedCharts] = useState<string[]>([])
  
  // Estados para Metas
  const [selectedMonth, setSelectedMonth] = useState<number>(new Date().getMonth())
  const [dashboardSelectedMonth, setDashboardSelectedMonth] = useState<number>(new Date().getMonth())
  const [dashboardSelectedYear, setDashboardSelectedYear] = useState<number>(new Date().getFullYear())
  const [dashboardSelectedQuarter, setDashboardSelectedQuarter] = useState<number>(Math.floor(new Date().getMonth() / 3))
  
  // Estados para modal de gráficos
  const [chartModal, setChartModal] = useState<{
    isOpen: boolean;
    title: string;
    data: Array<{name: string; value: number; color: string}>;
    totalValue: number;
    subtitle?: string;
  }>({
    isOpen: false,
    title: '',
    data: [],
    totalValue: 0
  })
  
  // Definição das metas mensais (centralizada)
  const mesesMetas = [
    { nome: 'JANEIRO', indice: 0, meta: 18500.00 },
    { nome: 'FEVEREIRO', indice: 1, meta: 19200.00 },
    { nome: 'MARÇO', indice: 2, meta: 20100.00 },
    { nome: 'ABRIL', indice: 3, meta: 19800.00 },
    { nome: 'MAIO', indice: 4, meta: 20500.00 },
    { nome: 'JUNHO', indice: 5, meta: 21000.00 },
    { nome: 'JULHO', indice: 6, meta: 21500.00 },
    { nome: 'AGOSTO', indice: 7, meta: 22000.00 },
    { nome: 'SETEMBRO', indice: 8, meta: 21889.17 },
    { nome: 'OUTUBRO', indice: 9, meta: 23000.00 },
    { nome: 'NOVEMBRO', indice: 10, meta: 25000.00 },
    { nome: 'DEZEMBRO', indice: 11, meta: 28000.00 }
  ]

  // Função para comparar dados das metas com a projeção
  const verificarSincronizacaoMetas = async () => {
    try {
      console.log('🔍 Verificando sincronização das metas...')
      
      // Buscar dados atualizados da projeção
      const response = await fetch('/api/projection')
      if (!response.ok) {
        throw new Error('Erro ao buscar dados da projeção')
      }
      
      const dadosProjecaoAtualizados = await response.json()
      
      // Calcular metas esperadas para cada mês
      const meses = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 
                    'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro']
      
      const resultados = meses.map((mes, monthIndex) => {
        // Calcular meta esperada baseada na projeção
        const metasDoMes = [
          dadosProjecaoAtualizados.faturamentoReurb?.[monthIndex] || 0,
          dadosProjecaoAtualizados.faturamentoGeo?.[monthIndex] || 0,
          dadosProjecaoAtualizados.faturamentoPlan?.[monthIndex] || 0,
          dadosProjecaoAtualizados.faturamentoReg?.[monthIndex] || 0,
          dadosProjecaoAtualizados.faturamentoNn?.[monthIndex] || 0
        ]
        
        const metaEsperada = metasDoMes.reduce((sum, meta) => sum + meta, 0)
        
        // Calcular meta atual (baseada nos dados carregados)
        const metasDoMesAtual = projectionData ? [
          projectionData.faturamentoReurb?.[monthIndex] || 0,
          projectionData.faturamentoGeo?.[monthIndex] || 0,
          projectionData.faturamentoPlan?.[monthIndex] || 0,
          projectionData.faturamentoReg?.[monthIndex] || 0,
          projectionData.faturamentoNn?.[monthIndex] || 0
        ] : [0, 0, 0, 0, 0]
        
        const metaAtual = metasDoMesAtual.reduce((sum, meta) => sum + meta, 0)
        
        return {
          mes,
          monthIndex,
          metaEsperada,
          metaAtual,
          sincronizado: Math.abs(metaEsperada - metaAtual) < 0.01, // Tolerância de 1 centavo
          diferenca: metaEsperada - metaAtual,
          detalhes: {
            reurb: {
              esperado: dadosProjecaoAtualizados.faturamentoReurb?.[monthIndex] || 0,
              atual: getFaturamentoValue('Reurb', monthIndex)
            },
            geo: {
              esperado: dadosProjecaoAtualizados.faturamentoGeo?.[monthIndex] || 0,
              atual: getFaturamentoValue('Geo', monthIndex)
            },
            plan: {
              esperado: dadosProjecaoAtualizados.faturamentoPlan?.[monthIndex] || 0,
              atual: getFaturamentoValue('Plan', monthIndex)
            },
            reg: {
              esperado: dadosProjecaoAtualizados.faturamentoReg?.[monthIndex] || 0,
              atual: getFaturamentoValue('Reg', monthIndex)
            },
            nn: {
              esperado: dadosProjecaoAtualizados.faturamentoNn?.[monthIndex] || 0,
              atual: getFaturamentoValue('Nn', monthIndex)
            }
          }
        }
      })
      
      // Calcular estatísticas gerais
      const totalSincronizado = resultados.filter(r => r.sincronizado).length
      const totalMeses = resultados.length
      const percentualSincronizado = (totalSincronizado / totalMeses) * 100
      
      const resultadoFinal = {
        timestamp: new Date().toISOString(),
        totalMeses,
        totalSincronizado,
        percentualSincronizado,
        resultados,
        dadosProjecaoAtualizados,
        dadosProjecaoAtual: projectionData
      }
      
      setSyncResults(resultadoFinal)
      console.log('✅ Verificação de sincronização concluída:', resultadoFinal)
      
    } catch (error) {
      console.error('❌ Erro ao verificar sincronização:', error)
      setSyncResults({
        error: 'Erro ao verificar sincronização: ' + (error instanceof Error ? error.message : String(error)),
        timestamp: new Date().toISOString()
      })
    }
  }

  // Sincronizar com mudanças na projeção
  useEffect(() => {
    if (projectionData) {
      console.log('🔄 Dados da projeção atualizados, recalculando metas...')
      // Forçar re-render dos componentes que dependem dos dados da projeção
    }
  }, [projectionData])

  // Função para recarregar dados da projeção
  const recarregarDadosProjecao = async () => {
    try {
      setIsReloadingProjection(true)
      const authToken = localStorage.getItem('authToken')
      if (!authToken) {
        console.warn('⚠️ Token não encontrado')
        return
      }
      
      console.log('🔄 Iniciando recarregamento de dados...')
      
      // Primeiro sincronizar os dados dos arquivos separados com projection.json
      const syncResponse = await fetch('/api/projection/sync', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`
        }
      })
      
      if (syncResponse.ok) {
        console.log('✅ Dados sincronizados com sucesso')
      } else {
        console.warn('⚠️ Erro ao sincronizar dados')
      }
      
      // Depois recarregar os dados da projeção
      await loadProjectionData()
      await loadMktData()
      await loadInvestmentsData()
      await loadBudgetData()
      await loadVariableExpensesData()
      await loadFixedExpensesData()
      
      console.log('✅ Recarregamento concluído!')
      
      // Mostrar mensagem de sucesso
      setShowSuccessMessage(true)
      setTimeout(() => {
        setShowSuccessMessage(false)
      }, 3000) // Remove a mensagem após 3 segundos
      
    } catch (error) {
      console.error('❌ Erro ao recarregar dados:', error)
    } finally {
      setIsReloadingProjection(false)
    }
  }

  // Função auxiliar para calcular percentual de forma segura (evita NaN)
  const calcularPercentualSeguro = (valor: number, total: number, casasDecimais: number = 0): string => {
    if (!total || total === 0) return '0'
    const percentual = (valor / total) * 100
    return isNaN(percentual) ? '0' : percentual.toFixed(casasDecimais)
  }

  // Função auxiliar para obter valor correto da linha Previsto
  const getFaturamentoValue = (tipo: string, monthIndex: number) => {
    if (!projectionData) return 0
    
    const manualKey = `faturamento${tipo}PrevistoManual` as keyof typeof projectionData
    const baseKey = `faturamento${tipo}` as keyof typeof projectionData
    
    const manualValue = projectionData[manualKey] as number[] | undefined
    const baseValue = projectionData[baseKey] as number[] | undefined
    
    if (manualValue && manualValue[monthIndex] !== undefined) {
      return manualValue[monthIndex]
    }
    
    return baseValue?.[monthIndex] || 0
  }

  // Função auxiliar para obter valor correto de investimentos e MKT
  const getInvestimentoValue = (tipo: 'investimentos' | 'mkt', monthIndex: number) => {
    if (!projectionData) return 0
    
    if (tipo === 'investimentos' && investmentsData) {
      // Para investimentos: usar valor da linha Previsto do arquivo específico
      return investmentsData.previsto?.[monthIndex] || 0
    }
    
    if (tipo === 'mkt' && mktData) {
      // Para MKT: usar valor da linha Previsto do arquivo específico
      return mktData.previsto?.[monthIndex] || 0
    }
    
    return 0
  }

  const getBudgetValue = (monthIndex: number) => {
    if (!budgetData) return 0
    // Para orçamento: usar valor da linha Previsto do arquivo específico
    return budgetData.previsto?.[monthIndex] || 0
  }

  const getVariableExpensesValue = (monthIndex: number) => {
    if (!variableExpensesData) return 0
    // Para despesas variáveis: usar valor da linha Previsto do arquivo específico
    return variableExpensesData.previsto?.[monthIndex] || 0
  }

  const getVariableExpensesValueAnual = () => {
    if (!variableExpensesData) return 0
    // Para despesas variáveis anuais: somar todos os valores da linha Previsto
    return variableExpensesData.previsto?.reduce((sum: number, value: number) => sum + value, 0) || 0
  }

  const getFixedExpensesValue = (monthIndex: number) => {
    if (!fixedExpensesData) return 0
    // Para despesas fixas: usar valor da linha Previsto do arquivo específico
    return fixedExpensesData.previsto?.[monthIndex] || 0
  }

  const getFixedExpensesValueAnual = () => {
    if (!fixedExpensesData) return 0
    // Para despesas fixas anuais: somar todos os valores da linha Previsto
    return fixedExpensesData.previsto?.reduce((sum: number, value: number) => sum + value, 0) || 0
  }

  const getBudgetValueAnual = () => {
    if (!budgetData) return 0
    // Para orçamento anual: somar todos os valores da linha Previsto
    return budgetData.previsto?.reduce((sum: number, value: number) => sum + value, 0) || 0
  }

  // Carregar dados da projeção
  const loadProjectionData = async () => {
    try {
      const response = await fetch('/api/projection')
      if (response.ok) {
        const data = await response.json()
        setProjectionData(data)
        console.log('📊 Dados da projeção carregados:', data)
        console.log('🔍 Faturamento NN Janeiro:', data.faturamentoNn?.[0])
      }
    } catch (error) {
      console.error('Erro ao carregar dados da projeção:', error)
    }
  }

  // Carregar dados de MKT
  const loadMktData = async () => {
    try {
      const response = await fetch('/api/mkt')
      if (response.ok) {
        const data = await response.json()
        setMktData(data)
      }
    } catch (error) {
      console.error('Erro ao carregar dados de MKT:', error)
    }
  }

  const loadInvestmentsData = async () => {
    try {
      const response = await fetch('/api/investments')
      if (response.ok) {
        const data = await response.json()
        setInvestmentsData(data)
      }
    } catch (error) {
      console.error('Erro ao carregar dados de Investimentos:', error)
    }
  }

  const loadBudgetData = async () => {
    try {
      const response = await fetch('/api/budget')
      if (response.ok) {
        const data = await response.json()
        setBudgetData(data)
      }
    } catch (error) {
      console.error('Erro ao carregar dados de Orçamento:', error)
    }
  }

  const loadVariableExpensesData = async () => {
    try {
      const response = await fetch('/api/variable-expenses')
      if (response.ok) {
        const data = await response.json()
        setVariableExpensesData(data)
      }
    } catch (error) {
      console.error('Erro ao carregar dados de Despesas Variáveis:', error)
    }
  }

  const loadFixedExpensesData = async () => {
    try {
      const response = await fetch('/api/fixed-expenses')
      if (response.ok) {
        const data = await response.json()
        setFixedExpensesData(data)
      }
    } catch (error) {
      console.error('Erro ao carregar dados de Despesas Fixas:', error)
    }
  }

  // Carregar dados iniciais
  useEffect(() => {
    const loadData = async () => {
      setIsLoading(true)
      try {
        const [transactionsData] = await Promise.all([
          fetchTransactions()
        ])
        
        setTransactions(transactionsData)
        await loadProjectionData()
        await loadMktData()
        await loadInvestmentsData()
        await loadBudgetData()
        await loadVariableExpensesData()
        await loadFixedExpensesData()
        
        // Criar metas padrão para IMPGEO
        const defaultMetas: Meta[] = [
          {
            id: '1',
            descricao: 'Meta de Receita Mensal',
            valor: 50000,
            tipo: 'receita',
            categoria: 'Vendas',
            dataInicio: '2024-01-01',
            dataFim: '2024-12-31',
            periodo: 'Mensal',
            status: 'ativa'
          },
          {
            id: '2',
            descricao: 'Meta de Projetos Concluídos',
            valor: 24,
            tipo: 'vendas',
            categoria: 'Projetos',
            dataInicio: '2024-01-01',
            dataFim: '2024-12-31',
            periodo: 'Anual',
            status: 'ativa'
          }
        ]
        
        setMetas(defaultMetas)
      } catch (error) {
        console.error('Erro ao carregar dados:', error)
      } finally {
        setIsLoading(false)
      }
    }
    
    loadData()
  }, [])

  // Salvar metas no localStorage
  useEffect(() => {
    localStorage.setItem('impgeo-metas', JSON.stringify(metas))
  }, [metas])

  // Função para alternar gráficos
  const toggleChart = (chartId: string) => {
    setExpandedCharts(prev => 
      prev.includes(chartId) 
        ? prev.filter(id => id !== chartId)
        : [...prev, chartId]
    )
  }

  // Funções para abrir gráficos
  const openChart = (title: string, data: Array<{name: string; value: number; color: string}>, subtitle?: string) => {
    const totalValue = data.reduce((sum, item) => sum + item.value, 0)
    setChartModal({
      isOpen: true,
      title,
      data,
      totalValue,
      subtitle
    })
  }

  const closeChart = () => {
    setChartModal(prev => ({ ...prev, isOpen: false }))
  }

  // Funções específicas para cada tipo de gráfico
  const openFaturamentoChart = (monthIndex: number, monthName: string) => {
    const currentYear = new Date().getFullYear()
    const transacoesDoMes = transactions.filter(t => {
      const transactionDate = new Date(t.date)
      return transactionDate.getMonth() === monthIndex && transactionDate.getFullYear() === currentYear
    })
    const totalReceitas = transacoesDoMes.filter(t => t.type === 'Receita').reduce((sum, t) => sum + (parseFloat(String(t.value)) || 0), 0)
    
    // Meta de faturamento para o mês (baseada nos arquivos específicos - linha Previsto)
    const metasDoMes = projectionData ? [
      getFaturamentoValue('Reurb', monthIndex),
      getFaturamentoValue('Geo', monthIndex),
      getFaturamentoValue('Plan', monthIndex),
      getFaturamentoValue('Reg', monthIndex),
      getFaturamentoValue('Nn', monthIndex)
    ] : [18500, 19200, 20100, 19800, 20500, 21000, 21500, 22000, 21889.17, 23000, 25000, 28000]
    
    // Meta total do mês (soma de todos os faturamentos)
    const metaFaturamento = metasDoMes.reduce((sum, meta) => sum + meta, 0)
    
    const data = [
      { name: 'Alcançado', value: totalReceitas, color: '#10b981' },
      { name: 'Meta Restante', value: Math.max(0, metaFaturamento - totalReceitas), color: '#e5e7eb' }
    ]
    
    openChart(`Faturamento - ${monthName}`, data, `Alcançado vs Meta de R$ ${metaFaturamento.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`)
  }

  const openDespesasChart = (monthIndex: number, monthName: string) => {
    const currentYear = new Date().getFullYear()
    const transacoesDoMes = transactions.filter(t => {
      const transactionDate = new Date(t.date)
      return transactionDate.getMonth() === monthIndex && transactionDate.getFullYear() === currentYear
    })
    const totalDespesas = transacoesDoMes.filter(t => t.type === 'Despesa').reduce((sum, t) => sum + (parseFloat(String(t.value)) || 0), 0)
    
    // Meta de despesas para o mês (limite de 15.000 por mês)
    const metaDespesas = 15000
    
    const data = [
      { name: 'Alcançado', value: totalDespesas, color: '#ef4444' },
      { name: 'Limite Restante', value: Math.max(0, metaDespesas - totalDespesas), color: '#e5e7eb' }
    ]
    
    openChart(`Despesas - ${monthName}`, data, `Alcançado vs Limite de R$ ${metaDespesas.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`)
  }

  const openInvestimentosChart = (monthIndex: number, monthName: string) => {
    const currentYear = new Date().getFullYear()
    const transacoesDoMes = transactions.filter(t => {
      const transactionDate = new Date(t.date)
      return transactionDate.getMonth() === monthIndex && transactionDate.getFullYear() === currentYear
    })
    const totalReceitas = transacoesDoMes.filter(t => t.type === 'Receita').reduce((sum, t) => sum + (parseFloat(String(t.value)) || 0), 0)
    const totalDespesas = transacoesDoMes.filter(t => t.type === 'Despesa').reduce((sum, t) => sum + (parseFloat(String(t.value)) || 0), 0)
    
    // Metas de investimentos para o mês (baseadas na projeção - linha Previsto)
    const metaInvestimentosGerais = getInvestimentoValue('investimentos', monthIndex)
    const metaInvestimentosMkt = getInvestimentoValue('mkt', monthIndex)
    const investimentosGerais = totalDespesas * 0.05
    const investimentosMkt = totalReceitas * 0.1
    
    const data = [
      { name: 'Investimentos Gerais Alcançados', value: investimentosGerais, color: '#3b82f6' },
      { name: 'Meta Restante Gerais', value: Math.max(0, metaInvestimentosGerais - investimentosGerais), color: '#e5e7eb' },
      { name: 'Investimentos MKT Alcançados', value: investimentosMkt, color: '#8b5cf6' },
      { name: 'Meta Restante MKT', value: Math.max(0, metaInvestimentosMkt - investimentosMkt), color: '#f3f4f6' }
    ]
    
    openChart(`Investimentos - ${monthName}`, data, `Alcançado vs Metas: Gerais R$ ${metaInvestimentosGerais.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} | MKT R$ ${metaInvestimentosMkt.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`)
  }

  const openProgressoChart = (monthIndex: number, monthName: string) => {
    const currentYear = new Date().getFullYear()
    const transacoesDoMes = transactions.filter(t => {
      const transactionDate = new Date(t.date)
      return transactionDate.getMonth() === monthIndex && transactionDate.getFullYear() === currentYear
    })
    const totalReceitas = transacoesDoMes.filter(t => t.type === 'Receita').reduce((sum, t) => sum + (parseFloat(String(t.value)) || 0), 0)
    
    // Meta de faturamento para o mês (baseada nos arquivos específicos - linha Previsto)
    const metasDoMes = projectionData ? [
      getFaturamentoValue('Reurb', monthIndex),
      getFaturamentoValue('Geo', monthIndex),
      getFaturamentoValue('Plan', monthIndex),
      getFaturamentoValue('Reg', monthIndex),
      getFaturamentoValue('Nn', monthIndex)
    ] : [18500, 19200, 20100, 19800, 20500, 21000, 21500, 22000, 21889.17, 23000, 25000, 28000]
    
    console.log('🔍 Debug metas para', monthName, ':', {
      projectionData: !!projectionData,
      faturamentoNn: projectionData?.faturamentoNn?.[monthIndex],
      metasDoMes,
      monthIndex
    })
    
    // Meta total do mês (soma de todos os faturamentos)
    const metaValue = metasDoMes.reduce((sum, meta) => sum + meta, 0)
    
    const data = [
      { name: 'Meta Alcançada', value: totalReceitas, color: '#ec4899' },
      { name: 'Meta Restante', value: Math.max(0, metaValue - totalReceitas), color: '#f3f4f6' }
    ]
    
    openChart(`Progresso da Meta - ${monthName}`, data, `Progresso em relação à meta mensal`)
  }

  // Funções para gráficos anuais
  const openFaturamentoAnualChart = () => {
    const currentYear = new Date().getFullYear()
    const transacoesDoAno = transactions.filter(t => {
      const transactionDate = new Date(t.date)
      return transactionDate.getFullYear() === currentYear
    })
    const totalReceitasAno = transacoesDoAno.filter(t => t.type === 'Receita').reduce((sum, t) => sum + (parseFloat(String(t.value)) || 0), 0)
    
    // Meta anual de faturamento (soma das metas mensais)
    const metasDoAno = [18500, 19200, 20100, 19800, 20500, 21000, 21500, 22000, 21889.17, 23000, 25000, 28000]
    const metaFaturamentoAnual = metasDoAno.reduce((sum, meta) => sum + meta, 0)
    
    const data = [
      { name: 'Alcançado', value: totalReceitasAno, color: '#10b981' },
      { name: 'Meta Restante', value: Math.max(0, metaFaturamentoAnual - totalReceitasAno), color: '#e5e7eb' }
    ]
    
    openChart('Faturamento Anual ${new Date().getFullYear()}', data, `Alcançado vs Meta Anual de R$ ${metaFaturamentoAnual.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`)
  }

  const openDespesasAnualChart = () => {
    const currentYear = new Date().getFullYear()
    const transacoesDoAno = transactions.filter(t => {
      const transactionDate = new Date(t.date)
      return transactionDate.getFullYear() === currentYear
    })
    const totalDespesasAno = transacoesDoAno.filter(t => t.type === 'Despesa').reduce((sum, t) => sum + (parseFloat(String(t.value)) || 0), 0)
    
    // Meta anual de despesas (limite de 180.000 por ano)
    const metaDespesasAnual = 180000
    
    const data = [
      { name: 'Alcançado', value: totalDespesasAno, color: '#ef4444' },
      { name: 'Limite Restante', value: Math.max(0, metaDespesasAnual - totalDespesasAno), color: '#e5e7eb' }
    ]
    
    openChart('Despesas Anuais ${new Date().getFullYear()}', data, `Alcançado vs Limite Anual de R$ ${metaDespesasAnual.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`)
  }

  const openInvestimentosAnualChart = () => {
    const currentYear = new Date().getFullYear()
    const transacoesDoAno = transactions.filter(t => {
      const transactionDate = new Date(t.date)
      return transactionDate.getFullYear() === currentYear
    })
    const totalReceitasAno = transacoesDoAno.filter(t => t.type === 'Receita').reduce((sum, t) => sum + (parseFloat(String(t.value)) || 0), 0)
    const totalDespesasAno = transacoesDoAno.filter(t => t.type === 'Despesa').reduce((sum, t) => sum + (parseFloat(String(t.value)) || 0), 0)
    
    // Metas anuais de investimentos (baseadas na projeção - linha Previsto)
    const metaInvestimentosGeraisAnual = Array.from({ length: 12 }, (_, monthIndex) => 
      getInvestimentoValue('investimentos', monthIndex)
    ).reduce((sum, meta) => sum + meta, 0)
    
    const metaInvestimentosMktAnual = Array.from({ length: 12 }, (_, monthIndex) => 
      getInvestimentoValue('mkt', monthIndex)
    ).reduce((sum, meta) => sum + meta, 0)
    const investimentosGeraisAnual = totalDespesasAno * 0.05
    const investimentosMktAnual = totalReceitasAno * 0.1
    
    const data = [
      { name: 'Investimentos Gerais Alcançados', value: investimentosGeraisAnual, color: '#3b82f6' },
      { name: 'Meta Restante Gerais', value: Math.max(0, metaInvestimentosGeraisAnual - investimentosGeraisAnual), color: '#e5e7eb' },
      { name: 'Investimentos MKT Alcançados', value: investimentosMktAnual, color: '#8b5cf6' },
      { name: 'Meta Restante MKT', value: Math.max(0, metaInvestimentosMktAnual - investimentosMktAnual), color: '#f3f4f6' }
    ]
    
    openChart('Investimentos Anuais ${new Date().getFullYear()}', data, `Alcançado vs Metas Anuais: Gerais R$ ${metaInvestimentosGeraisAnual.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} | MKT R$ ${metaInvestimentosMktAnual.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`)
  }

  const openProgressoAnualChart = () => {
    const currentYear = new Date().getFullYear()
    const transacoesDoAno = transactions.filter(t => {
      const transactionDate = new Date(t.date)
      return transactionDate.getFullYear() === currentYear
    })
    const totalReceitasAno = transacoesDoAno.filter(t => t.type === 'Receita').reduce((sum, t) => sum + (parseFloat(String(t.value)) || 0), 0)
    const metasDoAno = [18500, 19200, 20100, 19800, 20500, 21000, 21500, 22000, 21889.17, 23000, 25000, 28000]
    const metaTotalAno = metasDoAno.reduce((sum, meta) => sum + meta, 0)
    
    const data = [
      { name: 'Meta Anual Alcançada', value: totalReceitasAno, color: '#ec4899' },
      { name: 'Meta Anual Restante', value: Math.max(0, metaTotalAno - totalReceitasAno), color: '#f3f4f6' }
    ]
    
    openChart('Progresso da Meta Anual ${new Date().getFullYear()}', data, 'Progresso em relação à meta anual')
  }

  // NavigationBar
  const NavigationBar = () => (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-gradient-to-r from-blue-900 to-blue-800 shadow-lg">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Primeira linha: Logo, nome, subtítulo, usuário e botão sair */}
        <div className="flex justify-between items-center h-16 py-2">
          <div className="flex items-center">
            <div className="flex-shrink-0 flex items-center">
              <img src="/imp_logo.png" alt="IMPGEO Logo" className="h-8 w-8 mr-2 object-contain" />
              <div>
                <span className="text-white text-xl font-bold">IMPGEO</span>
                <p className="text-blue-200 text-sm">Sistema de Gestão Inteligente</p>
              </div>
            </div>
          </div>
          <div className="flex items-center space-x-4">
            <MenuUsuario />
            <button 
              onClick={logout}
              className="flex items-center space-x-2 px-3 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors"
              title="Sair"
            >
              <LogOut className="h-4 w-4" />
              <span className="hidden sm:inline">Sair</span>
            </button>
          </div>
        </div>
        
        {/* Segunda linha: Menus — ordem definida pelo catálogo (drag-and-drop no Admin) */}
        <div className="flex items-center justify-start space-x-3 overflow-x-auto scrollbar-hide nav-scroll pb-2 px-1">
          {(() => {
            const iconMap: Record<string, React.ElementType> = {
              dashboard: Home,
              projects: Map,
              services: Target,
              reports: BarChart3,
              metas: TrendingUp,
              projecao: Calculator,
              transactions: FileText,
              clients: Building,
              dre: BarChart3,
              acompanhamentos: ClipboardList,
              faq: HelpCircle,
              documentacao: BookOpen,
              roadmap: MapIcon,
              admin: Shield,
              sessions: Monitor,
              anomalies: AlertTriangle,
              security_alerts: ShieldAlert,
            };

            // Se o catálogo ainda não carregou, usa a ordem padrão como fallback
            const orderedModules = catalogModules && catalogModules.length > 0
              ? catalogModules
              : Object.keys(iconMap).map(key => ({ moduleKey: key, moduleName: key, iconName: null }));

            return orderedModules
              .filter(m => hasModuleAccess(m.moduleKey))
              .map(m => {
                const Icon = iconMap[m.moduleKey] ?? Shield;
                const key = m.moduleKey as TabType;
                return (
                  <button
                    key={key}
                    onClick={() => { setActiveTab(key); window.scrollTo({ top: 0, behavior: "instant" }); }}
                    className={`px-3 py-2.5 rounded-md text-sm font-semibold transition-colors flex flex-col items-center justify-start whitespace-nowrap ${activeTab === key ? 'bg-blue-700 text-white' : 'text-blue-200 hover:text-white hover:bg-blue-700'}`}
                  >
                    <Icon className="h-4 w-4 mb-2" />
                    {m.moduleName}
                  </button>
                );
              });
          })()}
        </div>
      </div>
    </nav>
  )

  // Função para renderizar um mês completo (stub para manter referências)
  const renderMonth = (monthName: string, monthIndex: number) => {
    return (
      <div key={monthName} className="space-y-6 mb-12">
        <div className="bg-gradient-to-r from-blue-500 to-indigo-600 p-6 rounded-2xl shadow-lg flex items-center justify-between">
          <button
            type="button"
            onClick={() => setSelectedMonth((m) => (m - 1 + 12) % 12)}
            className="p-2 rounded-lg bg-white/20 hover:bg-white/30 text-white transition-colors duration-150"
          >
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
          </button>
          <h2 className="text-3xl font-bold text-white text-center uppercase tracking-wider">
            {monthName} — {new Date().getFullYear()}
          </h2>
          <button
            type="button"
            onClick={() => setSelectedMonth((m) => (m + 1) % 12)}
            className="p-2 rounded-lg bg-white/20 hover:bg-white/30 text-white transition-colors duration-150"
          >
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
          </button>
        </div>
        {renderMonthContent(monthName, monthIndex)}
      </div>
    )
  }

  // Helpers reutilizados em renderMonthContent e renderTotalAno
  const badgeReceita = (real: number, meta: number) => {
    if (meta <= 0) return null;
    const pct = (real / meta) * 100;
    if (pct >= 100) return (
      <span className="flex items-center gap-1 text-xs font-bold text-white bg-white/20 px-2 py-0.5 rounded-full">
        <CheckCircle2 className="w-3 h-3" /> Atingido
      </span>
    );
    if (pct >= 75) return (
      <span className="flex items-center gap-1 text-xs font-bold text-white bg-black/20 px-2 py-0.5 rounded-full">
        <Zap className="w-3 h-3" /> Em andamento
      </span>
    );
    return (
      <span className="flex items-center gap-1 text-xs font-bold text-white bg-black/20 px-2 py-0.5 rounded-full">
        <XCircle className="w-3 h-3" /> Abaixo
      </span>
    );
  };

  const badgeDespesa = (real: number, limite: number) => {
    if (limite <= 0) return null;
    const pct = (real / limite) * 100;
    if (pct > 100) return (
      <span className="flex items-center gap-1 text-xs font-bold text-white bg-black/20 px-2 py-0.5 rounded-full">
        <AlertTriangle className="w-3 h-3" /> Estourado
      </span>
    );
    if (pct >= 85) return (
      <span className="flex items-center gap-1 text-xs font-bold text-white bg-black/20 px-2 py-0.5 rounded-full">
        <AlertTriangle className="w-3 h-3" /> Próximo
      </span>
    );
    return (
      <span className="flex items-center gap-1 text-xs font-bold text-white bg-white/20 px-2 py-0.5 rounded-full">
        <CheckCircle2 className="w-3 h-3" /> Dentro do limite
      </span>
    );
  };

  const renderBar = (real: number, meta: number) => {
    const pct = meta > 0 ? Math.min(100, (real / meta) * 100) : 0;
    return (
      <div className="w-full bg-white/30 rounded-full h-3 relative overflow-hidden">
        <div
          className="bg-white/70 h-3 rounded-full transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
    );
  };

  // Conteúdo do mês (stub alinhado com referências existentes)
  const renderMonthContent = (_monthName: string, monthIndex: number) => {
    // Cálculos para o mês específico
    const currentYear = new Date().getFullYear()
    const transacoesDoMes = transactions.filter(t => {
      const transactionDate = new Date(t.date)
      return transactionDate.getMonth() === monthIndex && transactionDate.getFullYear() === currentYear
    })

    const totalReceitas = transacoesDoMes.filter(t => t.type === 'Receita').reduce((sum, t) => sum + (parseFloat(String(t.value)) || 0), 0)
    const totalDespesas = transacoesDoMes.filter(t => t.type === 'Despesa').reduce((sum, t) => sum + (parseFloat(String(t.value)) || 0), 0)
    
    // Meta de faturamento para o mês (baseada nos arquivos específicos - linha Previsto)
    const metasDoMes = projectionData ? [
      getFaturamentoValue('Reurb', monthIndex),
      getFaturamentoValue('Geo', monthIndex),
      getFaturamentoValue('Plan', monthIndex),
      getFaturamentoValue('Reg', monthIndex),
      getFaturamentoValue('Nn', monthIndex)
    ] : [18500, 19200, 20100, 19800, 20500, 21000, 21500, 22000, 21889.17, 23000, 25000, 28000]
    
    console.log('🔍 Debug renderMonthContent para mês', monthIndex, ':', {
      projectionData: !!projectionData,
      faturamentoNn: projectionData?.faturamentoNn?.[monthIndex],
      metasDoMes,
      monthIndex
    })
    
    // Meta total do mês (soma de todos os faturamentos)
    const metaValue = metasDoMes.reduce((sum, meta) => sum + meta, 0)
    
    // Calcular saldo inicial baseado em todas as transações anteriores ao mês atual
    const transacoesAnteriores = transactions.filter(t => {
      const transactionDate = new Date(t.date)
      const transactionMonth = transactionDate.getMonth()
      const transactionYear = transactionDate.getFullYear()
      
      // Incluir transações de anos anteriores ou meses anteriores do ano atual
      return (transactionYear < currentYear) || 
             (transactionYear === currentYear && transactionMonth < monthIndex)
    })
    
    const receitasAnteriores = transacoesAnteriores.filter(t => t.type === 'Receita').reduce((sum, t) => sum + (parseFloat(String(t.value)) || 0), 0)
    const despesasAnteriores = transacoesAnteriores.filter(t => t.type === 'Despesa').reduce((sum, t) => sum + (parseFloat(String(t.value)) || 0), 0)
    const saldoInicial = receitasAnteriores - despesasAnteriores
    
    // Calcular reforço e saída de caixa (movimentações líquidas)
    const reforcoCaixa = totalReceitas
    const saidaCaixa = totalDespesas

    // Debug: Log das transações para verificar se estão sendo carregadas
    console.log(`📊 MÊS ${monthIndex} (${_monthName}):`, {
      totalTransacoes: transactions.length,
      transacoesDoMes: transacoesDoMes.length,
      totalReceitas,
      totalDespesas,
      metaValue,
      progressoPercentual: calcularPercentualSeguro(totalReceitas, metaValue, 1)
    })

    // Status da meta
    const metaAtingida = totalReceitas >= metaValue
    const progressoPercentual = parseFloat(calcularPercentualSeguro(totalReceitas, metaValue, 1))
    const statusCor = metaAtingida ? 'text-emerald-600' : progressoPercentual >= 80 ? 'text-yellow-600' : 'text-red-600'
    const statusIcon = metaAtingida ? '✅' : progressoPercentual >= 80 ? '⚠️' : '❌'
    const statusTexto = metaAtingida ? 'META ATINGIDA!' : progressoPercentual >= 80 ? 'QUASE LÁ!' : 'EM ANDAMENTO'

    // Debug específico para Meta do Mês
    console.log(`🎯 META DO MÊS ${monthIndex}:`, {
      metaValue,
      totalReceitas,
      progressoPercentual,
      metaAtingida,
      restante: Math.max(0, metaValue - totalReceitas)
    })

    // Helpers para badges de status
    return (
      <div className="space-y-6">
        {/* DONUT CENTRAL — percentual geral de faturamento */}
        <div className="bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-800 dark:to-slate-900 rounded-2xl shadow-lg border border-slate-200 dark:border-slate-700 p-6">
          <div className="flex flex-col md:flex-row items-center gap-8">
            {/* Donut */}
            {(() => {
              const color = progressoPercentual >= 100 ? '#22c55e' : progressoPercentual >= 75 ? '#f59e0b' : '#ef4444';
              const deg = (Math.min(100, progressoPercentual) / 100) * 360;
              return (
                <div className="flex-shrink-0 flex items-center justify-center" style={{ width: 200, height: 200 }}>
                  <div style={{
                    width: 188, height: 188, borderRadius: '50%',
                    background: `conic-gradient(${color} ${deg}deg, ${isDark ? '#334155' : '#e5e7eb'} ${deg}deg)`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <div style={{
                      width: 136, height: 136, borderRadius: '50%',
                      background: isDark ? '#1e293b' : 'white',
                      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                    }}>
                      <span className="text-3xl font-black" style={{ color }}>{progressoPercentual.toFixed(0)}%</span>
                      <span className={`text-xs font-medium ${isDark ? 'text-slate-400' : 'text-gray-500'}`}>da meta</span>
                    </div>
                  </div>
                </div>
              );
            })()}
            {/* Resumo ao lado do donut */}
            {(() => {
              const margemLiquida = totalReceitas > 0 ? ((totalReceitas - totalDespesas) / totalReceitas) * 100 : 0;
              const resultado = totalReceitas - totalDespesas;
              return (
                <div className="flex-1 grid grid-cols-2 sm:grid-cols-4 gap-4 w-full">
                  <div className="bg-white dark:!bg-[#243040] rounded-xl p-4 text-center shadow-md border border-gray-100 dark:border-gray-700">
                    <div className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-1">Meta</div>
                    <div className="text-xl font-black text-gray-800 dark:text-gray-100">R$ {metaValue.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</div>
                  </div>
                  <div className="bg-white dark:!bg-[#243040] rounded-xl p-4 text-center shadow-md border border-gray-100 dark:border-gray-700">
                    <div className="text-xs font-bold text-emerald-600 uppercase tracking-wide mb-1">Realizado</div>
                    <div className="text-xl font-black text-emerald-700">R$ {totalReceitas.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</div>
                  </div>
                  <div className="bg-white dark:!bg-[#243040] rounded-xl p-4 text-center shadow-md border border-gray-100 dark:border-gray-700">
                    <div className={`text-xs font-bold uppercase tracking-wide mb-1 ${resultado >= 0 ? 'text-blue-600' : 'text-red-600'}`}>Resultado</div>
                    <div className={`text-xl font-black ${resultado >= 0 ? 'text-blue-700' : 'text-red-700'}`}>
                      {resultado >= 0 ? '+' : ''}R$ {resultado.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                    </div>
                  </div>
                  <div className="bg-white dark:!bg-[#243040] rounded-xl p-4 text-center shadow-md border border-gray-100 dark:border-gray-700">
                    <div className={`text-xs font-bold uppercase tracking-wide mb-1 ${margemLiquida >= 0 ? 'text-violet-600' : 'text-red-600'}`}>Margem</div>
                    <div className={`text-xl font-black ${margemLiquida >= 0 ? 'text-violet-700' : 'text-red-700'}`}>{margemLiquida.toFixed(1)}%</div>
                  </div>
                </div>
              );
            })()}
          </div>
        </div>

        {/* 1. RESULTADO */}
        <div className="space-y-4">
          <h2 className="text-2xl font-bold text-gray-800 dark:text-gray-100 flex items-center gap-3">
            <PieChart className="w-6 h-6 text-gray-600" />
            Resultado
          </h2>
          
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Quadrante Financeiro */}
            <div className="bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-800 dark:to-slate-900 p-6 rounded-2xl shadow-lg border border-slate-200 dark:border-slate-700">
              <div className="space-y-3">
                {/* REFORÇO DE CAIXA */}
                <div className="flex justify-between items-center py-2 border-b border-gray-200">
                  <span className="font-semibold text-gray-700">REFORÇO DE CAIXA</span>
                  <span className="font-bold text-gray-800">R$ {reforcoCaixa.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
              </div>
                
                {/* SAÍDA DE CAIXA */}
                <div className="flex justify-between items-center py-2 border-b border-gray-200">
                  <span className="font-semibold text-gray-700">SAÍDA DE CAIXA</span>
                  <span className="font-bold text-gray-800">R$ {saidaCaixa.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
            </div>
                
                {/* RECEITA */}
                <div className="flex justify-between items-center py-2 border-b border-gray-200">
                  <span className="font-semibold text-emerald-700">RECEITA</span>
                  <span className="font-bold text-emerald-800">
                    R$ {totalReceitas.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </span>
                </div>
                
                {/* DESPESA */}
                <div className="flex justify-between items-center py-2 border-b border-gray-200">
                  <span className="font-semibold text-red-700">DESPESA</span>
                  <span className="font-bold text-red-800">
                    -R$ {totalDespesas.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </span>
                </div>
                
                {/* SALDO INICIAL */}
                <div className="flex justify-between items-center py-2 border-b border-gray-200">
                  <span className="font-semibold text-cyan-700">SALDO INICIAL</span>
                  <span className="font-bold text-cyan-800">R$ {saldoInicial.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                </div>
                
                {/* TOTAL GERAL */}
                <div className="flex justify-between items-center py-4 bg-gray-50 px-4 rounded-lg border-2 border-gray-300 mt-4">
                  <span className="font-bold text-gray-900 text-lg">Total geral</span>
                  <span className={`font-bold text-xl ${
                    (saldoInicial + totalReceitas - totalDespesas) >= 0 ? 'text-emerald-800' : 'text-red-800'
                  }`}>
                    R$ {(saldoInicial + totalReceitas - totalDespesas).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </span>
                </div>
              </div>
            </div>

            {/* Quadrante META DO MÊS */}
            <div className="bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-800 dark:to-slate-900 p-6 rounded-2xl shadow-lg border border-slate-200 dark:border-slate-700">
              <div className="space-y-4">
                {/* Status da Meta */}
                <div className={`text-center p-3 rounded-lg border-2 ${metaAtingida ? 'bg-emerald-50 border-emerald-200' : progressoPercentual >= 80 ? 'bg-yellow-50 border-yellow-200' : 'bg-red-50 border-red-200'}`}>
                  <div className={`text-base font-bold ${statusCor} flex items-center justify-center gap-2`}>
                    <span>{statusIcon}</span>
                    <span>{statusTexto}</span>
                  </div>
                  <div className={`text-xs font-medium ${statusCor}`}>
                    {calcularPercentualSeguro(totalReceitas, metaValue, 1)}% da meta atingida
                  </div>
                </div>
                
                {/* Cabeçalho com colunas R$ e % */}
                <div className="grid grid-cols-3 gap-4 pb-2 border-b-2 border-gray-300">
                  <div className="text-center">
                    <span className="font-bold text-gray-600 text-lg"></span>
                </div>
                  <div className="text-center">
                    <span className="font-bold text-gray-800 text-xl">R$</span>
              </div>
                  <div className="text-center">
                    <span className="font-bold text-gray-800 text-xl">%</span>
            </div>
          </div>
                
                {/* META */}
                <div className="grid grid-cols-3 gap-4 py-3 border-b border-gray-200">
                  <div className="font-bold text-gray-800 italic">META</div>
                  <div className="text-center font-bold text-gray-800">R$ {metaValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</div>
                  <div className="text-center font-bold text-gray-800">100%</div>
                </div>
                
                {/* ALCANÇADO */}
                <div className="grid grid-cols-3 gap-4 py-3 border-b border-gray-200">
                  <div className="font-bold text-emerald-700 italic">ALCANÇADO</div>
                  <div className="text-center font-bold text-emerald-800">
                    R$ {totalReceitas.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </div>
                  <div className="text-center font-bold text-emerald-800">
                    {calcularPercentualSeguro(totalReceitas, metaValue, 0)}%
                  </div>
                </div>
                
                {/* RESTANTE */}
                <div className="grid grid-cols-3 gap-4 py-3">
                  <div className="font-bold text-red-700 italic">RESTANTE</div>
                  <div className="text-center font-bold text-red-800">
                    -R$ {Math.max(0, metaValue - totalReceitas).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </div>
                  <div className="text-center font-bold text-red-800">
                    {calcularPercentualSeguro(Math.max(0, metaValue - totalReceitas), metaValue, 0)}%
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* 2. FATURAMENTO */}
        <div className="space-y-4">
          <h2 className="text-2xl font-bold text-emerald-800 dark:text-emerald-300 flex items-center gap-3">
            <TrendingUp className="w-6 h-6 text-emerald-600" />
            Faturamento
          </h2>
          
          {/* Primeira linha: Total, REURB, GEO */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div
              className="bg-gradient-to-br from-blue-500 to-indigo-600 p-6 rounded-2xl shadow-lg cursor-pointer hover:shadow-xl hover:-translate-y-1 transition-all duration-200"
              onClick={() => openFaturamentoChart(monthIndex, mesesMetas[monthIndex].nome)}
            >
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-lg font-bold text-white">Faturamento Total</h3>
                {badgeReceita(totalReceitas, metaValue)}
              </div>
              <div className="text-2xl font-bold text-white mb-4">
                R$ {totalReceitas.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </div>
              <div className="mb-3">
                <div className="flex justify-between text-sm font-medium text-white/80 mb-1">
                  <span>Progresso</span>
                  <span>{calcularPercentualSeguro(totalReceitas, metaValue, 0)}%</span>
                </div>
                {renderBar(totalReceitas, metaValue)}
              </div>
              <div className="text-xs text-white/70 font-medium flex justify-between">
                <span>Meta: <span className="font-bold text-white">R$ {metaValue.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</span></span>
                <span className="font-bold text-white/90">{calcularPercentualSeguro(totalReceitas, metaValue, 0)}% atingido</span>
              </div>
            </div>

            <div
              className="bg-gradient-to-br from-green-400 to-emerald-500 p-6 rounded-2xl shadow-lg cursor-pointer hover:shadow-xl hover:-translate-y-1 transition-all duration-200"
              onClick={() => openFaturamentoChart(monthIndex, mesesMetas[monthIndex].nome)}
            >
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-lg font-bold text-white">Faturamento REURB</h3>
                {badgeReceita(totalReceitas, getFaturamentoValue('Reurb', monthIndex))}
              </div>
              <div className="text-2xl font-bold text-white mb-4">
                R$ {(totalReceitas * 1.0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </div>
              <div className="mb-3">
                <div className="flex justify-between text-sm font-medium text-white/80 mb-1">
                  <span>Progresso</span>
                  <span>{calcularPercentualSeguro(totalReceitas, getFaturamentoValue('Reurb', monthIndex), 0)}%</span>
                </div>
                {renderBar(totalReceitas, getFaturamentoValue('Reurb', monthIndex))}
              </div>
              <div className="text-xs text-white/70 font-medium flex justify-between">
                <span>Meta: <span className="font-bold text-white">R$ {getFaturamentoValue('Reurb', monthIndex).toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</span></span>
                <span className="font-bold text-white/90">{calcularPercentualSeguro(totalReceitas, getFaturamentoValue('Reurb', monthIndex), 0)}%</span>
              </div>
            </div>

            <div
              className="bg-gradient-to-br from-teal-400 to-teal-500 p-6 rounded-2xl shadow-lg cursor-pointer hover:shadow-xl hover:-translate-y-1 transition-all duration-200"
              onClick={() => openFaturamentoChart(monthIndex, mesesMetas[monthIndex].nome)}
            >
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-lg font-bold text-white">Faturamento GEO</h3>
                {badgeReceita(totalReceitas * 0.8, getFaturamentoValue('Geo', monthIndex))}
              </div>
              <div className="text-2xl font-bold text-white mb-4">
                R$ {(totalReceitas * 0.8).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </div>
              <div className="mb-3">
                <div className="flex justify-between text-sm font-medium text-white/80 mb-1">
                  <span>Progresso</span>
                  <span>{calcularPercentualSeguro(totalReceitas * 0.8, getFaturamentoValue('Geo', monthIndex), 0)}%</span>
                </div>
                {renderBar(totalReceitas * 0.8, getFaturamentoValue('Geo', monthIndex))}
              </div>
              <div className="text-xs text-white/70 font-medium flex justify-between">
                <span>Meta: <span className="font-bold text-white">R$ {getFaturamentoValue('Geo', monthIndex).toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</span></span>
                <span className="font-bold text-white/90">{calcularPercentualSeguro(totalReceitas * 0.8, getFaturamentoValue('Geo', monthIndex), 0)}%</span>
              </div>
            </div>
          </div>
          
          {/* Segunda linha: PLAN, REG, NN */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div
              className="bg-gradient-to-br from-cyan-400 to-cyan-500 p-6 rounded-2xl shadow-lg cursor-pointer hover:shadow-xl hover:-translate-y-1 transition-all duration-200"
              onClick={() => openFaturamentoChart(monthIndex, mesesMetas[monthIndex].nome)}
            >
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-lg font-bold text-white">Faturamento PLAN</h3>
                {badgeReceita(totalReceitas * 0.6, getFaturamentoValue('Plan', monthIndex))}
              </div>
              <div className="text-2xl font-bold text-white mb-4">
                R$ {(totalReceitas * 0.6).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </div>
              <div className="mb-3">
                <div className="flex justify-between text-sm font-medium text-white/80 mb-1">
                  <span>Progresso</span>
                  <span>{calcularPercentualSeguro(totalReceitas * 0.6, getFaturamentoValue('Plan', monthIndex), 0)}%</span>
                </div>
                {renderBar(totalReceitas * 0.6, getFaturamentoValue('Plan', monthIndex))}
              </div>
              <div className="text-xs text-white/70 font-medium flex justify-between">
                <span>Meta: <span className="font-bold text-white">R$ {getFaturamentoValue('Plan', monthIndex).toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</span></span>
                <span className="font-bold text-white/90">{calcularPercentualSeguro(totalReceitas * 0.6, getFaturamentoValue('Plan', monthIndex), 0)}%</span>
              </div>
            </div>

            <div
              className="bg-gradient-to-br from-indigo-400 to-indigo-500 p-6 rounded-2xl shadow-lg cursor-pointer hover:shadow-xl hover:-translate-y-1 transition-all duration-200"
              onClick={() => openFaturamentoChart(monthIndex, mesesMetas[monthIndex].nome)}
            >
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-lg font-bold text-white">Faturamento REG</h3>
                {badgeReceita(totalReceitas * 0.4, getFaturamentoValue('Reg', monthIndex))}
              </div>
              <div className="text-2xl font-bold text-white mb-4">
                R$ {(totalReceitas * 0.4).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </div>
              <div className="mb-3">
                <div className="flex justify-between text-sm font-medium text-white/80 mb-1">
                  <span>Progresso</span>
                  <span>{calcularPercentualSeguro(totalReceitas * 0.4, getFaturamentoValue('Reg', monthIndex), 0)}%</span>
                </div>
                {renderBar(totalReceitas * 0.4, getFaturamentoValue('Reg', monthIndex))}
              </div>
              <div className="text-xs text-white/70 font-medium flex justify-between">
                <span>Meta: <span className="font-bold text-white">R$ {getFaturamentoValue('Reg', monthIndex).toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</span></span>
                <span className="font-bold text-white/90">{calcularPercentualSeguro(totalReceitas * 0.4, getFaturamentoValue('Reg', monthIndex), 0)}%</span>
              </div>
            </div>

            <div
              className="bg-gradient-to-br from-violet-400 to-violet-500 p-6 rounded-2xl shadow-lg cursor-pointer hover:shadow-xl hover:-translate-y-1 transition-all duration-200"
              onClick={() => openFaturamentoChart(monthIndex, mesesMetas[monthIndex].nome)}
            >
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-lg font-bold text-white">Faturamento NN</h3>
                {badgeReceita(totalReceitas * 0.2, getFaturamentoValue('Nn', monthIndex))}
              </div>
              <div className="text-2xl font-bold text-white mb-4">
                R$ {(totalReceitas * 0.2).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </div>
              <div className="mb-3">
                <div className="flex justify-between text-sm font-medium text-white/80 mb-1">
                  <span>Progresso</span>
                  <span>{calcularPercentualSeguro(totalReceitas * 0.2, getFaturamentoValue('Nn', monthIndex), 0)}%</span>
                </div>
                {renderBar(totalReceitas * 0.2, getFaturamentoValue('Nn', monthIndex))}
              </div>
              <div className="text-xs text-white/70 font-medium flex justify-between">
                <span>Meta: <span className="font-bold text-white">R$ {getFaturamentoValue('Nn', monthIndex).toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</span></span>
                <span className="font-bold text-white/90">{calcularPercentualSeguro(totalReceitas * 0.2, getFaturamentoValue('Nn', monthIndex), 0)}%</span>
              </div>
            </div>
          </div>
        </div>

        {/* 3. DESPESAS */}
        <div className="space-y-4">
          <h2 className="text-2xl font-bold text-red-800 dark:text-red-300 flex items-center gap-3">
            <TrendingDown className="w-6 h-6 text-red-600" />
            Despesas
          </h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <div
              className="bg-gradient-to-br from-red-400 to-red-500 p-6 rounded-2xl shadow-lg cursor-pointer hover:shadow-xl hover:-translate-y-1 transition-all duration-200"
              onClick={() => openDespesasChart(monthIndex, mesesMetas[monthIndex].nome)}
            >
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-lg font-bold text-white">Despesas TOTAL</h3>
                {badgeDespesa(totalDespesas, getBudgetValue(monthIndex))}
              </div>
              <div className="text-2xl font-bold text-white mb-4">
                R$ {totalDespesas.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </div>
              <div className="mb-3">
                <div className="flex justify-between text-sm font-medium text-white/80 mb-1">
                  <span>Limite</span>
                  <span>{calcularPercentualSeguro(totalDespesas, getBudgetValue(monthIndex), 0)}%</span>
                </div>
                {renderBar(totalDespesas, getBudgetValue(monthIndex))}
              </div>
              <div className="text-xs text-white/70 font-medium flex justify-between">
                <span>Limite: <span className="font-bold text-white">R$ {getBudgetValue(monthIndex).toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</span></span>
                <span className="font-bold text-white/90">{calcularPercentualSeguro(totalDespesas, getBudgetValue(monthIndex), 0)}%</span>
              </div>
            </div>

            <div
              className="bg-gradient-to-br from-orange-400 to-orange-500 p-6 rounded-2xl shadow-lg cursor-pointer hover:shadow-xl hover:-translate-y-1 transition-all duration-200"
              onClick={() => openDespesasChart(monthIndex, mesesMetas[monthIndex].nome)}
            >
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-lg font-bold text-white">Despesas Variáveis</h3>
                {badgeDespesa(totalDespesas * 0.7, getVariableExpensesValue(monthIndex))}
              </div>
              <div className="text-2xl font-bold text-white mb-4">
                R$ {(totalDespesas * 0.7).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </div>
              <div className="mb-3">
                <div className="flex justify-between text-sm font-medium text-white/80 mb-1">
                  <span>Limite</span>
                  <span>{calcularPercentualSeguro(totalDespesas * 0.7, getVariableExpensesValue(monthIndex), 0)}%</span>
                </div>
                {renderBar(totalDespesas * 0.7, getVariableExpensesValue(monthIndex))}
              </div>
              <div className="text-xs text-white/70 font-medium flex justify-between">
                <span>Limite: <span className="font-bold text-white">R$ {getVariableExpensesValue(monthIndex).toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</span></span>
                <span className="font-bold text-white/90">{calcularPercentualSeguro(totalDespesas * 0.7, getVariableExpensesValue(monthIndex), 0)}%</span>
              </div>
            </div>

            <div
              className="bg-gradient-to-br from-amber-400 to-amber-500 p-6 rounded-2xl shadow-lg cursor-pointer hover:shadow-xl hover:-translate-y-1 transition-all duration-200"
              onClick={() => openDespesasChart(monthIndex, mesesMetas[monthIndex].nome)}
            >
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-lg font-bold text-white">Despesas Fixas</h3>
                {badgeDespesa(totalDespesas * 0.25, Math.max(getFixedExpensesValue(monthIndex), 1))}
              </div>
              <div className="text-2xl font-bold text-white mb-4">
                R$ {getFixedExpensesValue(monthIndex).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </div>
              <div className="mb-3">
                <div className="flex justify-between text-sm font-medium text-white/80 mb-1">
                  <span>Limite</span>
                  <span>{calcularPercentualSeguro(totalDespesas * 0.25, Math.max(getFixedExpensesValue(monthIndex), 1), 0)}%</span>
                </div>
                {renderBar(totalDespesas * 0.25, Math.max(getFixedExpensesValue(monthIndex), 1))}
              </div>
              <div className="text-xs text-white/70 font-medium flex justify-between">
                <span>Realizado: <span className="font-bold text-white">R$ {(totalDespesas * 0.25).toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</span></span>
                <span className="font-bold text-white/90">{calcularPercentualSeguro(totalDespesas * 0.25, Math.max(getFixedExpensesValue(monthIndex), 1), 0)}%</span>
              </div>
            </div>
          </div>
        </div>

        {/* 4. INVESTIMENTOS */}
        <div className="space-y-4">
          <h2 className="text-2xl font-bold text-indigo-800 dark:text-indigo-300 flex items-center gap-3">
            <ArrowUpCircle className="w-6 h-6 text-indigo-600" />
            Investimentos
          </h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div
              className="bg-gradient-to-br from-blue-400 to-blue-500 p-6 rounded-2xl shadow-lg cursor-pointer hover:shadow-xl hover:-translate-y-1 transition-all duration-200"
              onClick={() => openInvestimentosChart(monthIndex, mesesMetas[monthIndex].nome)}
            >
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-lg font-bold text-white">Investimentos Gerais</h3>
                {badgeReceita(totalDespesas * 0.05, getInvestimentoValue('investimentos', monthIndex))}
              </div>
              <div className="text-2xl font-bold text-white mb-4">
                R$ {(totalDespesas * 0.05).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </div>
              <div className="mb-3">
                <div className="flex justify-between text-sm font-medium text-white/80 mb-1">
                  <span>Meta</span>
                  <span>{calcularPercentualSeguro(totalDespesas * 0.05, getInvestimentoValue('investimentos', monthIndex), 0)}%</span>
                </div>
                {renderBar(totalDespesas * 0.05, getInvestimentoValue('investimentos', monthIndex))}
              </div>
              <div className="text-xs text-white/70 font-medium flex justify-between">
                <span>Meta: <span className="font-bold text-white">R$ {getInvestimentoValue('investimentos', monthIndex).toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</span></span>
                <span className="font-bold text-white/90">{calcularPercentualSeguro(totalDespesas * 0.05, getInvestimentoValue('investimentos', monthIndex), 0)}%</span>
              </div>
            </div>

            <div
              className="bg-gradient-to-br from-purple-400 to-purple-500 p-6 rounded-2xl shadow-lg cursor-pointer hover:shadow-xl hover:-translate-y-1 transition-all duration-200"
              onClick={() => openInvestimentosChart(monthIndex, mesesMetas[monthIndex].nome)}
            >
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-lg font-bold text-white">Investimentos em MKT</h3>
                {badgeReceita(totalReceitas * 0.1, getInvestimentoValue('mkt', monthIndex))}
              </div>
              <div className="text-2xl font-bold text-white mb-4">
                R$ {(totalReceitas * 0.1).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </div>
              <div className="mb-3">
                <div className="flex justify-between text-sm font-medium text-white/80 mb-1">
                  <span>Meta</span>
                  <span>{calcularPercentualSeguro(totalReceitas * 0.1, getInvestimentoValue('mkt', monthIndex), 0)}%</span>
                </div>
                {renderBar(totalReceitas * 0.1, getInvestimentoValue('mkt', monthIndex))}
              </div>
              <div className="text-xs text-white/70 font-medium flex justify-between">
                <span>Meta: <span className="font-bold text-white">R$ {getInvestimentoValue('mkt', monthIndex).toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</span></span>
                <span className="font-bold text-white/90">{calcularPercentualSeguro(totalReceitas * 0.1, getInvestimentoValue('mkt', monthIndex), 0)}%</span>
              </div>
            </div>
          </div>
        </div>

        {/* 5. PROGRESSO VISUAL */}
        <div className="space-y-4">
          <h2 className="text-2xl font-bold text-blue-800 dark:text-blue-300 flex items-center gap-3">
            <BarChart3 className="w-6 h-6 text-blue-600" />
            Progresso Visual
          </h2>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Donut de Receitas */}
            <div
              className="bg-gradient-to-br from-blue-500 to-indigo-600 p-6 rounded-2xl shadow-lg cursor-pointer hover:shadow-xl hover:-translate-y-1 transition-all duration-200"
              onClick={() => openProgressoChart(monthIndex, mesesMetas[monthIndex].nome)}
            >
              <h3 className="text-lg font-bold text-white mb-4">Distribuição de Receitas</h3>
              <div className="flex items-center justify-center h-44">
                <div className="relative w-36 h-36">
                  <svg viewBox="0 0 36 36" className="w-full h-full -rotate-90">
                    <circle cx="18" cy="18" r="15.9" fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="3.5" />
                    <circle
                      cx="18" cy="18" r="15.9" fill="none"
                      stroke="rgba(255,255,255,0.85)"
                      strokeWidth="3.5"
                      strokeDasharray={`${Math.min(100, (totalReceitas / Math.max(metaValue, 1)) * 100)} 100`}
                      strokeLinecap="round"
                    />
                  </svg>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="text-center">
                      <div className="text-2xl font-bold text-white">
                        {calcularPercentualSeguro(totalReceitas, metaValue, 0)}%
                      </div>
                      <div className="text-xs text-white/70 font-medium">Alcançado</div>
                    </div>
                  </div>
                </div>
              </div>
              <div className="text-center text-xs text-white/70 font-medium mt-2">
                R$ {totalReceitas.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} de R$ {metaValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </div>
            </div>

            {/* Barra de Progresso Linear */}
            <div
              className="bg-gradient-to-br from-indigo-500 to-blue-600 p-6 rounded-2xl shadow-lg cursor-pointer hover:shadow-xl hover:-translate-y-1 transition-all duration-200"
              onClick={() => openProgressoChart(monthIndex, mesesMetas[monthIndex].nome)}
            >
              <h3 className="text-lg font-bold text-white mb-4">Progresso Linear</h3>
              <div className="space-y-6">
                <div className="text-center">
                  <div className="text-4xl font-bold text-white mb-1">
                    {calcularPercentualSeguro(totalReceitas, metaValue, 1)}%
                  </div>
                  <div className="text-xs text-white/70 font-medium">Meta Alcançada</div>
                </div>

                <div className="w-full bg-white/20 rounded-full h-4 overflow-hidden">
                  <div
                    className="bg-white/80 h-4 rounded-full transition-all duration-500"
                    style={{ width: `${Math.min(100, (totalReceitas / Math.max(metaValue, 1)) * 100)}%` }}
                  ></div>
                </div>

                <div className="flex justify-between text-xs text-white/70 font-medium">
                  <span>R$ 0</span>
                  <span>R$ {metaValue.toLocaleString('pt-BR', { minimumFractionDigits: 0 })}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // Função para renderizar o total do ano
  const renderTotalAno = () => {
    const currentYear = new Date().getFullYear()
    
    // Cálculos totais do ano
    const transacoesDoAno = transactions.filter(t => {
      const transactionDate = new Date(t.date)
      return transactionDate.getFullYear() === currentYear
    })

    const totalReceitasAno = transacoesDoAno.filter(t => t.type === 'Receita').reduce((sum, t) => sum + (parseFloat(String(t.value)) || 0), 0)
    const totalDespesasAno = transacoesDoAno.filter(t => t.type === 'Despesa').reduce((sum, t) => sum + (parseFloat(String(t.value)) || 0), 0)

    // Metas anuais de investimentos (baseadas na projeção - linha Previsto)
    const metaInvestimentosGeraisAnual = Array.from({ length: 12 }, (_, monthIndex) => 
      getInvestimentoValue('investimentos', monthIndex)
    ).reduce((sum, meta) => sum + meta, 0)
    
    const metaInvestimentosMktAnual = Array.from({ length: 12 }, (_, monthIndex) => 
      getInvestimentoValue('mkt', monthIndex)
    ).reduce((sum, meta) => sum + meta, 0)
    const metasDoAno = projectionData ? Array.from({ length: 12 }, (_, monthIndex) => {
      const metasDoMes = [
        getFaturamentoValue('Reurb', monthIndex),
        getFaturamentoValue('Geo', monthIndex),
        getFaturamentoValue('Plan', monthIndex),
        getFaturamentoValue('Reg', monthIndex),
        getFaturamentoValue('Nn', monthIndex)
      ]
      return metasDoMes.reduce((sum, meta) => sum + meta, 0)
    }) : [18500, 19200, 20100, 19800, 20500, 21000, 21500, 22000, 21889.17, 23000, 25000, 28000]
    
    const metaTotalAno = metasDoAno.reduce((sum, meta) => sum + meta, 0)
    
    // Calcular saldo inicial anual (todas as transações de anos anteriores)
    const transacoesAnosAnteriores = transactions.filter(t => {
      const transactionDate = new Date(t.date)
      return transactionDate.getFullYear() < currentYear
    })
    
    const receitasAnosAnteriores = transacoesAnosAnteriores.filter(t => t.type === 'Receita').reduce((sum, t) => sum + (parseFloat(String(t.value)) || 0), 0)
    const despesasAnosAnteriores = transacoesAnosAnteriores.filter(t => t.type === 'Despesa').reduce((sum, t) => sum + (parseFloat(String(t.value)) || 0), 0)
    const saldoInicialAno = receitasAnosAnteriores - despesasAnosAnteriores
    
    // Calcular reforço e saída de caixa anual
    const reforcoCaixaAno = totalReceitasAno
    const saidaCaixaAno = totalDespesasAno

    // Debug: Log das transações anuais
    console.log(`📊 ANO ${currentYear}:`, {
      totalTransacoes: transactions.length,
      transacoesDoAno: transacoesDoAno.length,
      totalReceitasAno,
      totalDespesasAno,
      metaTotalAno,
      progressoPercentualAnual: metaTotalAno > 0 ? ((totalReceitasAno / metaTotalAno) * 100).toFixed(1) : 0
    })

    // Status da meta anual
    const metaAnualAtingida = totalReceitasAno >= metaTotalAno
    const progressoPercentualAnual = metaTotalAno > 0 ? ((totalReceitasAno / metaTotalAno) * 100) : 0
    const statusCorAnual = metaAnualAtingida ? 'text-emerald-600' : progressoPercentualAnual >= 80 ? 'text-yellow-600' : 'text-red-600'
    const statusIconAnual = metaAnualAtingida ? '✅' : progressoPercentualAnual >= 80 ? '⚠️' : '❌'
    const statusTextoAnual = metaAnualAtingida ? 'META ANUAL ATINGIDA!' : progressoPercentualAnual >= 80 ? 'QUASE LÁ!' : 'EM ANDAMENTO'

    return (
      <div className="space-y-6 mb-32">
        {/* Título Principal do Ano */}
        <div className="bg-gradient-to-r from-blue-500 to-indigo-600 p-8 rounded-2xl shadow-xl">
          <h2 className="text-4xl font-bold text-white text-center uppercase tracking-wider">
            TOTAL DO ANO — {new Date().getFullYear()}
          </h2>
        </div>

        {/* 1. RESULTADO ANUAL */}
        <div className="space-y-4">
          <h2 className="text-3xl font-bold text-blue-800 dark:text-blue-300 flex items-center gap-3">
            <PieChart className="w-8 h-8 text-blue-600" />
            Resultado Anual
          </h2>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Quadrante Financeiro Anual */}
            <div className="bg-gradient-to-br from-slate-50 to-blue-50 dark:from-slate-800 dark:to-slate-900 p-8 rounded-2xl shadow-lg border border-blue-100 dark:border-slate-700">
              <div className="space-y-4">
                {/* REFORÇO DE CAIXA */}
                <div className="flex justify-between items-center py-3 border-b border-blue-100 dark:border-slate-700">
                  <span className="font-bold text-blue-800 dark:text-blue-300 text-lg">REFORÇO DE CAIXA</span>
                  <span className="font-bold text-blue-900 dark:text-blue-200 text-lg">R$ {reforcoCaixaAno.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                </div>

                {/* SAÍDA DE CAIXA */}
                <div className="flex justify-between items-center py-3 border-b border-blue-100 dark:border-slate-700">
                  <span className="font-bold text-blue-800 dark:text-blue-300 text-lg">SAÍDA DE CAIXA</span>
                  <span className="font-bold text-blue-900 dark:text-blue-200 text-lg">R$ {saidaCaixaAno.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                </div>

                {/* RECEITA ANUAL */}
                <div className="flex justify-between items-center py-3 border-b border-blue-100 dark:border-slate-700">
                  <span className="font-bold text-emerald-700 text-lg">RECEITA ANUAL</span>
                  <span className="font-bold text-emerald-800 text-lg">
                    R$ {totalReceitasAno.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </span>
                </div>

                {/* DESPESA ANUAL */}
                <div className="flex justify-between items-center py-3 border-b border-blue-100 dark:border-slate-700">
                  <span className="font-bold text-red-700 text-lg">DESPESA ANUAL</span>
                  <span className="font-bold text-red-800 text-lg">
                    -R$ {totalDespesasAno.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </span>
                </div>

                {/* SALDO INICIAL */}
                <div className="flex justify-between items-center py-3 border-b border-blue-100 dark:border-slate-700">
                  <span className="font-bold text-indigo-700 dark:text-indigo-400 text-lg">SALDO INICIAL</span>
                  <span className="font-bold text-indigo-800 dark:text-indigo-300 text-lg">R$ {saldoInicialAno.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                </div>

                {/* TOTAL GERAL ANUAL */}
                <div className="flex justify-between items-center py-6 bg-gradient-to-r from-blue-500 to-indigo-600 px-6 rounded-xl mt-6">
                  <span className="font-bold text-white text-2xl">Total Geral Anual</span>
                  <span className="font-bold text-2xl text-white">
                    R$ {(saldoInicialAno + totalReceitasAno - totalDespesasAno).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </span>
                </div>
              </div>
            </div>

            {/* Quadrante META ANUAL */}
            <div className="bg-gradient-to-br from-slate-50 to-blue-50 dark:from-slate-800 dark:to-slate-900 p-8 rounded-2xl shadow-lg border border-blue-100 dark:border-slate-700">
              <div className="space-y-4">
                {/* Status da Meta Anual */}
                <div className={`text-center p-4 rounded-lg border-2 ${metaAnualAtingida ? 'bg-emerald-50 border-emerald-200' : progressoPercentualAnual >= 80 ? 'bg-yellow-50 border-yellow-200' : 'bg-red-50 border-red-200'}`}>
                  <div className={`text-xl font-bold ${statusCorAnual} flex items-center justify-center gap-2`}>
                    <span>{statusIconAnual}</span>
                    <span>{statusTextoAnual}</span>
                  </div>
                  <div className={`text-xs font-medium ${statusCorAnual}`}>
                    {progressoPercentualAnual.toFixed(1)}% da meta anual atingida
                  </div>
                </div>
                
                {/* Cabeçalho com colunas R$ e % */}
                <div className="grid grid-cols-3 gap-4 pb-2 border-b-2 border-blue-200 dark:border-slate-600">
                  <div className="text-center">
                    <span className="font-bold text-blue-600 text-lg"></span>
                  </div>
                  <div className="text-center">
                    <span className="font-bold text-blue-800 dark:text-blue-300 text-xl">R$</span>
                  </div>
                  <div className="text-center">
                    <span className="font-bold text-blue-800 dark:text-blue-300 text-xl">%</span>
                  </div>
                </div>

                {/* META ANUAL */}
                <div className="grid grid-cols-3 gap-4 py-3 border-b border-blue-100 dark:border-slate-600">
                  <div className="font-bold text-blue-800 dark:text-blue-300 italic text-lg">META ANUAL</div>
                  <div className="text-center font-bold text-blue-900 dark:text-blue-200 text-lg">R$ {metaTotalAno.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</div>
                  <div className="text-center font-bold text-blue-900 dark:text-blue-200 text-lg">100%</div>
                </div>

                {/* ALCANÇADO ANUAL */}
                <div className="grid grid-cols-3 gap-4 py-3 border-b border-blue-100 dark:border-slate-600">
                  <div className="font-bold text-emerald-700 italic text-lg">ALCANÇADO</div>
                  <div className="text-center font-bold text-emerald-800 text-lg">
                    R$ {totalReceitasAno.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </div>
                  <div className="text-center font-bold text-emerald-800 text-lg">
                    {calcularPercentualSeguro(totalReceitasAno, metaTotalAno, 0)}%
                  </div>
                </div>

                {/* RESTANTE ANUAL */}
                <div className="grid grid-cols-3 gap-4 py-3">
                  <div className="font-bold text-red-700 italic text-lg">RESTANTE</div>
                  <div className="text-center font-bold text-red-800 text-lg">
                    -R$ {Math.max(0, metaTotalAno - totalReceitasAno).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </div>
                  <div className="text-center font-bold text-red-800 text-lg">
                    {calcularPercentualSeguro(Math.max(0, metaTotalAno - totalReceitasAno), metaTotalAno, 0)}%
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* 2. FATURAMENTO ANUAL */}
        <div className="space-y-4">
          <h2 className="text-3xl font-bold text-blue-800 dark:text-blue-300 flex items-center gap-3">
            <TrendingUp className="w-8 h-8 text-blue-600" />
            Faturamento Anual
          </h2>
          
          {/* Primeira linha: Total, REURB, GEO */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div
              className="bg-gradient-to-br from-blue-500 to-indigo-600 p-6 rounded-2xl shadow-lg cursor-pointer hover:shadow-xl hover:-translate-y-1 transition-all duration-200"
              onClick={() => openFaturamentoAnualChart()}
            >
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-lg font-bold text-white">Fat. Total Anual</h3>
                {badgeReceita(totalReceitasAno, metaTotalAno)}
              </div>
              <div className="text-2xl font-bold text-white mb-4">
                R$ {totalReceitasAno.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </div>
              <div className="mb-3">
                <div className="flex justify-between text-sm font-medium text-white/80 mb-1">
                  <span>Progresso</span>
                  <span>{calcularPercentualSeguro(totalReceitasAno, metaTotalAno, 0)}%</span>
                </div>
                {renderBar(totalReceitasAno, metaTotalAno)}
              </div>
              <div className="text-xs text-white/70 font-medium flex justify-between">
                <span>Meta: <span className="font-bold text-white">R$ {metaTotalAno.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</span></span>
                <span className="font-bold text-white/90">{calcularPercentualSeguro(totalReceitasAno, metaTotalAno, 0)}%</span>
              </div>
            </div>

            <div
              className="bg-gradient-to-br from-green-400 to-emerald-500 p-6 rounded-2xl shadow-lg cursor-pointer hover:shadow-xl hover:-translate-y-1 transition-all duration-200"
              onClick={() => openFaturamentoAnualChart()}
            >
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-lg font-bold text-white">Fat. REURB Anual</h3>
                {badgeReceita(totalReceitasAno, metaTotalAno)}
              </div>
              <div className="text-2xl font-bold text-white mb-4">
                R$ {(totalReceitasAno * 1.0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </div>
              <div className="mb-3">
                <div className="flex justify-between text-sm font-medium text-white/80 mb-1">
                  <span>Progresso</span>
                  <span>{calcularPercentualSeguro(totalReceitasAno, metaTotalAno, 0)}%</span>
                </div>
                {renderBar(totalReceitasAno, metaTotalAno)}
              </div>
              <div className="text-xs text-white/70 font-medium flex justify-between">
                <span>Meta: <span className="font-bold text-white">R$ {(metaTotalAno * 1.0).toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</span></span>
                <span className="font-bold text-white/90">{calcularPercentualSeguro(totalReceitasAno, metaTotalAno, 0)}%</span>
              </div>
            </div>

            <div
              className="bg-gradient-to-br from-teal-400 to-teal-500 p-6 rounded-2xl shadow-lg cursor-pointer hover:shadow-xl hover:-translate-y-1 transition-all duration-200"
              onClick={() => openFaturamentoAnualChart()}
            >
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-lg font-bold text-white">Fat. GEO Anual</h3>
                {badgeReceita(totalReceitasAno * 0.8, metaTotalAno * 0.8)}
              </div>
              <div className="text-2xl font-bold text-white mb-4">
                R$ {(totalReceitasAno * 0.8).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </div>
              <div className="mb-3">
                <div className="flex justify-between text-sm font-medium text-white/80 mb-1">
                  <span>Progresso</span>
                  <span>{calcularPercentualSeguro(totalReceitasAno * 0.8, metaTotalAno * 0.8, 0)}%</span>
                </div>
                {renderBar(totalReceitasAno * 0.8, metaTotalAno * 0.8)}
              </div>
              <div className="text-xs text-white/70 font-medium flex justify-between">
                <span>Meta: <span className="font-bold text-white">R$ {(metaTotalAno * 0.8).toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</span></span>
                <span className="font-bold text-white/90">{calcularPercentualSeguro(totalReceitasAno * 0.8, metaTotalAno * 0.8, 0)}%</span>
              </div>
            </div>
          </div>

          {/* Segunda linha: PLAN, REG, NN */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div
              className="bg-gradient-to-br from-cyan-400 to-cyan-500 p-6 rounded-2xl shadow-lg cursor-pointer hover:shadow-xl hover:-translate-y-1 transition-all duration-200"
              onClick={() => openFaturamentoAnualChart()}
            >
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-lg font-bold text-white">Fat. PLAN Anual</h3>
                {badgeReceita(totalReceitasAno * 0.6, metaTotalAno * 0.6)}
              </div>
              <div className="text-2xl font-bold text-white mb-4">
                R$ {(totalReceitasAno * 0.6).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </div>
              <div className="mb-3">
                <div className="flex justify-between text-sm font-medium text-white/80 mb-1">
                  <span>Progresso</span>
                  <span>{calcularPercentualSeguro(totalReceitasAno * 0.6, metaTotalAno * 0.6, 0)}%</span>
                </div>
                {renderBar(totalReceitasAno * 0.6, metaTotalAno * 0.6)}
              </div>
              <div className="text-xs text-white/70 font-medium flex justify-between">
                <span>Meta: <span className="font-bold text-white">R$ {(metaTotalAno * 0.6).toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</span></span>
                <span className="font-bold text-white/90">{calcularPercentualSeguro(totalReceitasAno * 0.6, metaTotalAno * 0.6, 0)}%</span>
              </div>
            </div>

            <div
              className="bg-gradient-to-br from-indigo-400 to-indigo-500 p-6 rounded-2xl shadow-lg cursor-pointer hover:shadow-xl hover:-translate-y-1 transition-all duration-200"
              onClick={() => openFaturamentoAnualChart()}
            >
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-lg font-bold text-white">Fat. REG Anual</h3>
                {badgeReceita(totalReceitasAno * 0.4, metaTotalAno * 0.4)}
              </div>
              <div className="text-2xl font-bold text-white mb-4">
                R$ {(totalReceitasAno * 0.4).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </div>
              <div className="mb-3">
                <div className="flex justify-between text-sm font-medium text-white/80 mb-1">
                  <span>Progresso</span>
                  <span>{calcularPercentualSeguro(totalReceitasAno * 0.4, metaTotalAno * 0.4, 0)}%</span>
                </div>
                {renderBar(totalReceitasAno * 0.4, metaTotalAno * 0.4)}
              </div>
              <div className="text-xs text-white/70 font-medium flex justify-between">
                <span>Meta: <span className="font-bold text-white">R$ {(metaTotalAno * 0.4).toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</span></span>
                <span className="font-bold text-white/90">{calcularPercentualSeguro(totalReceitasAno * 0.4, metaTotalAno * 0.4, 0)}%</span>
              </div>
            </div>

            <div
              className="bg-gradient-to-br from-violet-400 to-violet-500 p-6 rounded-2xl shadow-lg cursor-pointer hover:shadow-xl hover:-translate-y-1 transition-all duration-200"
              onClick={() => openFaturamentoAnualChart()}
            >
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-lg font-bold text-white">Fat. NN Anual</h3>
                {badgeReceita(totalReceitasAno * 0.2, metaTotalAno * 0.2)}
              </div>
              <div className="text-2xl font-bold text-white mb-4">
                R$ {(totalReceitasAno * 0.2).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </div>
              <div className="mb-3">
                <div className="flex justify-between text-sm font-medium text-white/80 mb-1">
                  <span>Progresso</span>
                  <span>{calcularPercentualSeguro(totalReceitasAno * 0.2, metaTotalAno * 0.2, 0)}%</span>
                </div>
                {renderBar(totalReceitasAno * 0.2, metaTotalAno * 0.2)}
              </div>
              <div className="text-xs text-white/70 font-medium flex justify-between">
                <span>Meta: <span className="font-bold text-white">R$ {(metaTotalAno * 0.2).toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</span></span>
                <span className="font-bold text-white/90">{calcularPercentualSeguro(totalReceitasAno * 0.2, metaTotalAno * 0.2, 0)}%</span>
              </div>
            </div>
          </div>
        </div>

        {/* 3. DESPESAS ANUAIS */}
        <div className="space-y-4">
          <h2 className="text-3xl font-bold text-red-800 dark:text-red-300 flex items-center gap-3">
            <TrendingDown className="w-8 h-8 text-red-600" />
            Despesas Anuais
          </h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <div
              className="bg-gradient-to-br from-red-400 to-red-500 p-6 rounded-2xl shadow-lg cursor-pointer hover:shadow-xl hover:-translate-y-1 transition-all duration-200"
              onClick={() => openDespesasAnualChart()}
            >
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-lg font-bold text-white">Despesas TOTAL Anuais</h3>
                {badgeDespesa(totalDespesasAno, getBudgetValueAnual())}
              </div>
              <div className="text-2xl font-bold text-white mb-4">
                R$ {totalDespesasAno.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </div>
              <div className="mb-3">
                <div className="flex justify-between text-sm font-medium text-white/80 mb-1">
                  <span>Limite Anual</span>
                  <span>{calcularPercentualSeguro(totalDespesasAno, getBudgetValueAnual(), 0)}%</span>
                </div>
                {renderBar(totalDespesasAno, getBudgetValueAnual())}
              </div>
              <div className="text-xs text-white/70 font-medium flex justify-between">
                <span>Limite: <span className="font-bold text-white">R$ {getBudgetValueAnual().toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</span></span>
                <span className="font-bold text-white/90">{calcularPercentualSeguro(totalDespesasAno, getBudgetValueAnual(), 0)}%</span>
              </div>
            </div>

            <div
              className="bg-gradient-to-br from-orange-400 to-orange-500 p-6 rounded-2xl shadow-lg cursor-pointer hover:shadow-xl hover:-translate-y-1 transition-all duration-200"
              onClick={() => openDespesasAnualChart()}
            >
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-lg font-bold text-white">Desp. Variáveis Anuais</h3>
                {badgeDespesa(totalDespesasAno * 0.7, getVariableExpensesValueAnual())}
              </div>
              <div className="text-2xl font-bold text-white mb-4">
                R$ {(totalDespesasAno * 0.7).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </div>
              <div className="mb-3">
                <div className="flex justify-between text-sm font-medium text-white/80 mb-1">
                  <span>Limite Anual</span>
                  <span>{calcularPercentualSeguro(totalDespesasAno * 0.7, getVariableExpensesValueAnual(), 0)}%</span>
                </div>
                {renderBar(totalDespesasAno * 0.7, getVariableExpensesValueAnual())}
              </div>
              <div className="text-xs text-white/70 font-medium flex justify-between">
                <span>Limite: <span className="font-bold text-white">R$ {getVariableExpensesValueAnual().toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</span></span>
                <span className="font-bold text-white/90">{calcularPercentualSeguro(totalDespesasAno * 0.7, getVariableExpensesValueAnual(), 0)}%</span>
              </div>
            </div>

            <div
              className="bg-gradient-to-br from-amber-400 to-amber-500 p-6 rounded-2xl shadow-lg cursor-pointer hover:shadow-xl hover:-translate-y-1 transition-all duration-200"
              onClick={() => openDespesasAnualChart()}
            >
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-lg font-bold text-white">Desp. Fixas Anuais</h3>
                {badgeDespesa(totalDespesasAno * 0.25, Math.max(getFixedExpensesValueAnual(), 1))}
              </div>
              <div className="text-2xl font-bold text-white mb-4">
                R$ {getFixedExpensesValueAnual().toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </div>
              <div className="mb-3">
                <div className="flex justify-between text-sm font-medium text-white/80 mb-1">
                  <span>Progresso Anual</span>
                  <span>{calcularPercentualSeguro(totalDespesasAno * 0.25, Math.max(getFixedExpensesValueAnual(), 1), 0)}%</span>
                </div>
                {renderBar(totalDespesasAno * 0.25, Math.max(getFixedExpensesValueAnual(), 1))}
              </div>
              <div className="text-xs text-white/70 font-medium flex justify-between">
                <span>Realizado: <span className="font-bold text-white">R$ {(totalDespesasAno * 0.25).toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</span></span>
                <span className="font-bold text-white/90">{calcularPercentualSeguro(totalDespesasAno * 0.25, Math.max(getFixedExpensesValueAnual(), 1), 0)}%</span>
              </div>
            </div>
          </div>
        </div>

        {/* 4. INVESTIMENTOS ANUAIS */}
        <div className="space-y-4">
          <h2 className="text-3xl font-bold text-indigo-800 dark:text-indigo-300 flex items-center gap-3">
            <ArrowUpCircle className="w-8 h-8 text-indigo-600" />
            Investimentos Anuais
          </h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div
              className="bg-gradient-to-br from-blue-400 to-blue-500 p-6 rounded-2xl shadow-lg cursor-pointer hover:shadow-xl hover:-translate-y-1 transition-all duration-200"
              onClick={() => openInvestimentosAnualChart()}
            >
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-lg font-bold text-white">Invest. Gerais Anuais</h3>
                {badgeReceita(totalDespesasAno * 0.05, metaInvestimentosGeraisAnual)}
              </div>
              <div className="text-2xl font-bold text-white mb-4">
                R$ {(totalDespesasAno * 0.05).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </div>
              <div className="mb-3">
                <div className="flex justify-between text-sm font-medium text-white/80 mb-1">
                  <span>Meta Anual</span>
                  <span>{calcularPercentualSeguro(totalDespesasAno * 0.05, metaInvestimentosGeraisAnual, 0)}%</span>
                </div>
                {renderBar(totalDespesasAno * 0.05, metaInvestimentosGeraisAnual)}
              </div>
              <div className="text-xs text-white/70 font-medium flex justify-between">
                <span>Meta: <span className="font-bold text-white">R$ {metaInvestimentosGeraisAnual.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</span></span>
                <span className="font-bold text-white/90">{calcularPercentualSeguro(totalDespesasAno * 0.05, metaInvestimentosGeraisAnual, 0)}%</span>
              </div>
            </div>

            <div
              className="bg-gradient-to-br from-purple-400 to-purple-500 p-6 rounded-2xl shadow-lg cursor-pointer hover:shadow-xl hover:-translate-y-1 transition-all duration-200"
              onClick={() => openInvestimentosAnualChart()}
            >
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-lg font-bold text-white">Invest. MKT Anuais</h3>
                {badgeReceita(totalReceitasAno * 0.1, metaInvestimentosMktAnual)}
              </div>
              <div className="text-2xl font-bold text-white mb-4">
                R$ {(totalReceitasAno * 0.1).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </div>
              <div className="mb-3">
                <div className="flex justify-between text-sm font-medium text-white/80 mb-1">
                  <span>Meta Anual</span>
                  <span>{calcularPercentualSeguro(totalReceitasAno * 0.1, metaInvestimentosMktAnual, 0)}%</span>
                </div>
                {renderBar(totalReceitasAno * 0.1, metaInvestimentosMktAnual)}
              </div>
              <div className="text-xs text-white/70 font-medium flex justify-between">
                <span>Meta: <span className="font-bold text-white">R$ {metaInvestimentosMktAnual.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</span></span>
                <span className="font-bold text-white/90">{calcularPercentualSeguro(totalReceitasAno * 0.1, metaInvestimentosMktAnual, 0)}%</span>
              </div>
            </div>
          </div>
        </div>

        {/* 5. PROGRESSO VISUAL ANUAL */}
        <div className="space-y-4">
          <h2 className="text-3xl font-bold text-blue-800 dark:text-blue-300 flex items-center gap-3">
            <BarChart3 className="w-8 h-8 text-blue-600" />
            Progresso Visual Anual
          </h2>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Donut Anual */}
            <div
              className="bg-gradient-to-br from-blue-500 to-indigo-600 p-6 rounded-2xl shadow-lg cursor-pointer hover:shadow-xl hover:-translate-y-1 transition-all duration-200"
              onClick={() => openProgressoAnualChart()}
            >
              <h3 className="text-lg font-bold text-white mb-4">Distribuição de Receitas Anuais</h3>
              <div className="flex items-center justify-center h-44">
                <div className="relative w-36 h-36">
                  <svg viewBox="0 0 36 36" className="w-full h-full -rotate-90">
                    <circle cx="18" cy="18" r="15.9" fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="3.5" />
                    <circle
                      cx="18" cy="18" r="15.9" fill="none"
                      stroke="rgba(255,255,255,0.85)"
                      strokeWidth="3.5"
                      strokeDasharray={`${Math.min(100, (totalReceitasAno / Math.max(metaTotalAno, 1)) * 100)} 100`}
                      strokeLinecap="round"
                    />
                  </svg>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="text-center">
                      <div className="text-2xl font-bold text-white">
                        {calcularPercentualSeguro(totalReceitasAno, metaTotalAno, 0)}%
                      </div>
                      <div className="text-xs text-white/70 font-medium">Alcançado</div>
                    </div>
                  </div>
                </div>
              </div>
              <div className="text-center text-xs text-white/70 font-medium mt-2">
                R$ {totalReceitasAno.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} de R$ {metaTotalAno.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </div>
            </div>

            {/* Barra Linear Anual */}
            <div
              className="bg-gradient-to-br from-indigo-500 to-blue-600 p-6 rounded-2xl shadow-lg cursor-pointer hover:shadow-xl hover:-translate-y-1 transition-all duration-200"
              onClick={() => openProgressoAnualChart()}
            >
              <h3 className="text-lg font-bold text-white mb-4">Progresso Linear Anual</h3>
              <div className="space-y-6">
                <div className="text-center">
                  <div className="text-4xl font-bold text-white mb-1">
                    {metaTotalAno > 0 ? ((totalReceitasAno / metaTotalAno) * 100).toFixed(1) : 0}%
                  </div>
                  <div className="text-xs text-white/70 font-medium">Meta Anual Alcançada</div>
                </div>

                <div className="w-full bg-white/20 rounded-full h-4 overflow-hidden">
                  <div
                    className="bg-white/80 h-4 rounded-full transition-all duration-500"
                    style={{ width: `${Math.min(100, (totalReceitasAno / Math.max(metaTotalAno, 1)) * 100)}%` }}
                  ></div>
                </div>

                <div className="flex justify-between text-xs text-white/70 font-medium">
                  <span>R$ 0</span>
                  <span>R$ {metaTotalAno.toLocaleString('pt-BR', { minimumFractionDigits: 0 })}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // Função para exportar dados do mês selecionado em PDF
  const exportarMetasPDF = async () => {
    try {
      const mesSelecionado = mesesMetas.find(mes => mes.indice === selectedMonth)
      if (!mesSelecionado) {
        alert('Mês selecionado não encontrado!')
        return
      }

      // Criar elemento temporário para capturar o conteúdo
      const tempElement = document.createElement('div')
      tempElement.style.position = 'absolute'
      tempElement.style.left = '-9999px'
      tempElement.style.top = '-9999px'
      tempElement.style.width = '800px'
      tempElement.style.backgroundColor = 'white'
      tempElement.style.padding = '20px'
      tempElement.style.fontFamily = 'Arial, sans-serif'
      
      // Obter dados REAIS do mês selecionado usando as mesmas funções da interface
      const monthIndex = selectedMonth
      
      // Usar getFaturamentoValue para obter os dados reais (incluindo valores manuais)
      const metasDoMes = projectionData ? [
        getFaturamentoValue('Reurb', monthIndex),
        getFaturamentoValue('Geo', monthIndex),
        getFaturamentoValue('Plan', monthIndex),
        getFaturamentoValue('Reg', monthIndex),
        getFaturamentoValue('Nn', monthIndex)
      ] : [0, 0, 0, 0, 0]
      
      // Meta de faturamento = soma de todos os faturamentos (meta total)
      const metaFaturamento = metasDoMes.reduce((sum, meta) => sum + meta, 0)
      
      // Obter dados reais de transações do mês
      const currentYear = new Date().getFullYear()
      const transacoesDoMes = transactions.filter(t => {
        const transactionDate = new Date(t.date)
        return transactionDate.getMonth() === monthIndex && transactionDate.getFullYear() === currentYear
      })
      
      const totalReceitas = transacoesDoMes.filter(t => t.type === 'Receita').reduce((sum, t) => sum + (parseFloat(String(t.value)) || 0), 0)
      const totalDespesas = transacoesDoMes.filter(t => t.type === 'Despesa').reduce((sum, t) => sum + (parseFloat(String(t.value)) || 0), 0)
      
      // Meta/Limite de despesas = soma das despesas da projeção (limite total)
      const metaDespesas = projectionData ? 
        (projectionData.despesasVariaveis[monthIndex] || 0) + 
        (projectionData.despesasFixas[monthIndex] || 0) : 0
      
      const resultadoFinanceiro = totalReceitas - metaDespesas
      
      // Criar HTML do relatório com dados REAIS
      tempElement.innerHTML = `
        <div style="text-align: center; margin-bottom: 30px;">
          <h1 style="color: #1e40af; font-size: 28px; margin: 0; font-weight: bold;">IMPGEO</h1>
          <h2 style="color: #374151; font-size: 24px; margin: 10px 0; font-weight: bold;">Relatório de Metas - ${mesSelecionado.nome} ${new Date().getFullYear()}</h2>
          <p style="color: #6b7280; font-size: 14px; margin: 0;">Gerado em ${new Date().toLocaleDateString('pt-BR')} às ${new Date().toLocaleTimeString('pt-BR')}</p>
        </div>
        
        <div style="margin-bottom: 30px;">
          <h3 style="color: #1e40af; font-size: 20px; margin-bottom: 15px; border-bottom: 2px solid #1e40af; padding-bottom: 5px;">📊 Resumo Executivo</h3>
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px;">
            <div style="background: #f0f9ff; padding: 15px; border-radius: 8px; border-left: 4px solid #1e40af;">
              <div style="font-weight: bold; color: #1e40af; margin-bottom: 5px;">Meta de Faturamento</div>
              <div style="font-size: 18px; font-weight: bold; color: #1e3a8a;">R$ ${metaFaturamento.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</div>
            </div>
            <div style="background: #f0fdf4; padding: 15px; border-radius: 8px; border-left: 4px solid #10b981;">
              <div style="font-weight: bold; color: #10b981; margin-bottom: 5px;">Faturamento Realizado</div>
              <div style="font-size: 18px; font-weight: bold; color: #059669;">R$ ${totalReceitas.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</div>
            </div>
            <div style="background: #fef2f2; padding: 15px; border-radius: 8px; border-left: 4px solid #ef4444;">
              <div style="font-weight: bold; color: #ef4444; margin-bottom: 5px;">Limite de Despesas</div>
              <div style="font-size: 18px; font-weight: bold; color: #dc2626;">R$ ${metaDespesas.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</div>
            </div>
            <div style="background: ${resultadoFinanceiro >= 0 ? '#f0fdf4' : '#fef2f2'}; padding: 15px; border-radius: 8px; border-left: 4px solid ${resultadoFinanceiro >= 0 ? '#10b981' : '#ef4444'};">
              <div style="font-weight: bold; color: ${resultadoFinanceiro >= 0 ? '#10b981' : '#ef4444'}; margin-bottom: 5px;">Resultado Financeiro</div>
              <div style="font-size: 18px; font-weight: bold; color: ${resultadoFinanceiro >= 0 ? '#059669' : '#dc2626'};">R$ ${resultadoFinanceiro.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</div>
            </div>
          </div>
        </div>
        
        <div style="margin-bottom: 30px;">
          <h3 style="color: #1e40af; font-size: 20px; margin-bottom: 15px; border-bottom: 2px solid #1e40af; padding-bottom: 5px;">💰 Detalhamento de Faturamento</h3>
          <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
            <thead>
              <tr style="background: #1e40af; color: white;">
                <th style="padding: 12px; text-align: left; border: 1px solid #1e40af;">Tipo de Faturamento</th>
                <th style="padding: 12px; text-align: right; border: 1px solid #1e40af;">Valor Previsto (R$)</th>
                <th style="padding: 12px; text-align: center; border: 1px solid #1e40af;">% do Total</th>
              </tr>
            </thead>
            <tbody>
              <tr style="background: #f8fafc;">
                <td style="padding: 10px; border: 1px solid #e2e8f0;">REURB</td>
                <td style="padding: 10px; border: 1px solid #e2e8f0; text-align: right; font-weight: bold;">${(metasDoMes[0] || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                <td style="padding: 10px; border: 1px solid #e2e8f0; text-align: center;">${metaFaturamento > 0 ? ((metasDoMes[0] || 0) / metaFaturamento * 100).toFixed(1) : 0}%</td>
              </tr>
              <tr>
                <td style="padding: 10px; border: 1px solid #e2e8f0;">GEO</td>
                <td style="padding: 10px; border: 1px solid #e2e8f0; text-align: right; font-weight: bold;">${(metasDoMes[1] || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                <td style="padding: 10px; border: 1px solid #e2e8f0; text-align: center;">${metaFaturamento > 0 ? ((metasDoMes[1] || 0) / metaFaturamento * 100).toFixed(1) : 0}%</td>
              </tr>
              <tr style="background: #f8fafc;">
                <td style="padding: 10px; border: 1px solid #e2e8f0;">PLAN</td>
                <td style="padding: 10px; border: 1px solid #e2e8f0; text-align: right; font-weight: bold;">${(metasDoMes[2] || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                <td style="padding: 10px; border: 1px solid #e2e8f0; text-align: center;">${metaFaturamento > 0 ? ((metasDoMes[2] || 0) / metaFaturamento * 100).toFixed(1) : 0}%</td>
              </tr>
              <tr>
                <td style="padding: 10px; border: 1px solid #e2e8f0;">REG</td>
                <td style="padding: 10px; border: 1px solid #e2e8f0; text-align: right; font-weight: bold;">${(metasDoMes[3] || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                <td style="padding: 10px; border: 1px solid #e2e8f0; text-align: center;">${metaFaturamento > 0 ? ((metasDoMes[3] || 0) / metaFaturamento * 100).toFixed(1) : 0}%</td>
              </tr>
              <tr style="background: #f8fafc;">
                <td style="padding: 10px; border: 1px solid #e2e8f0;">NN</td>
                <td style="padding: 10px; border: 1px solid #e2e8f0; text-align: right; font-weight: bold;">${(metasDoMes[4] || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                <td style="padding: 10px; border: 1px solid #e2e8f0; text-align: center;">${metaFaturamento > 0 ? ((metasDoMes[4] || 0) / metaFaturamento * 100).toFixed(1) : 0}%</td>
              </tr>
              <tr style="background: #1e40af; color: white; font-weight: bold;">
                <td style="padding: 12px; border: 1px solid #1e40af;">TOTAL PREVISTO</td>
                <td style="padding: 12px; border: 1px solid #1e40af; text-align: right;">${metaFaturamento.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                <td style="padding: 12px; border: 1px solid #1e40af; text-align: center;">100%</td>
              </tr>
            </tbody>
          </table>
        </div>
        
        <div style="margin-bottom: 30px;">
          <h3 style="color: #1e40af; font-size: 20px; margin-bottom: 15px; border-bottom: 2px solid #1e40af; padding-bottom: 5px;">📈 Análise de Performance</h3>
          <div style="background: #f8fafc; padding: 20px; border-radius: 8px; border: 1px solid #e2e8f0;">
            <div style="margin-bottom: 15px;">
              <div style="display: flex; justify-content: space-between; margin-bottom: 5px;">
                <span style="font-weight: bold;">Meta vs Realizado:</span>
                <span style="font-weight: bold; color: ${totalReceitas >= metaFaturamento ? '#10b981' : '#ef4444'};">${totalReceitas >= metaFaturamento ? '✅ Meta Atingida' : '❌ Meta Não Atingida'}</span>
              </div>
              <div style="background: #e2e8f0; height: 20px; border-radius: 10px; overflow: hidden;">
                <div style="background: ${totalReceitas >= metaFaturamento ? '#10b981' : '#ef4444'}; height: 100%; width: ${Math.min((totalReceitas / metaFaturamento) * 100, 100)}%; transition: width 0.3s ease;"></div>
              </div>
              <div style="text-align: center; margin-top: 5px; font-size: 14px; color: #6b7280;">
                ${((totalReceitas / metaFaturamento) * 100).toFixed(1)}% da meta
              </div>
            </div>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin-top: 15px;">
              <div>
                <div style="font-weight: bold; color: #374151; margin-bottom: 5px;">Diferença da Meta:</div>
                <div style="font-size: 16px; color: ${totalReceitas >= metaFaturamento ? '#10b981' : '#ef4444'}; font-weight: bold;">
                  R$ ${(totalReceitas - metaFaturamento).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </div>
              </div>
              <div>
                <div style="font-weight: bold; color: #374151; margin-bottom: 5px;">Margem de Lucro:</div>
                <div style="font-size: 16px; color: ${resultadoFinanceiro >= 0 ? '#10b981' : '#ef4444'}; font-weight: bold;">
                  ${totalReceitas > 0 ? ((resultadoFinanceiro / totalReceitas) * 100).toFixed(1) : 0}%
                </div>
              </div>
            </div>
          </div>
        </div>
        
        <div style="margin-bottom: 30px;">
          <h3 style="color: #1e40af; font-size: 20px; margin-bottom: 15px; border-bottom: 2px solid #1e40af; padding-bottom: 5px;">📋 Dados de Transações Reais</h3>
          <div style="background: #f8fafc; padding: 20px; border-radius: 8px; border: 1px solid #e2e8f0;">
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px;">
              <div>
                <div style="font-weight: bold; color: #374151; margin-bottom: 5px;">Total de Transações:</div>
                <div style="font-size: 16px; color: #1e40af; font-weight: bold;">${transacoesDoMes.length} transações</div>
              </div>
              <div>
                <div style="font-weight: bold; color: #374151; margin-bottom: 5px;">Receitas Reais:</div>
                <div style="font-size: 16px; color: #10b981; font-weight: bold;">R$ ${totalReceitas.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</div>
              </div>
              <div>
                <div style="font-weight: bold; color: #374151; margin-bottom: 5px;">Despesas Reais:</div>
                <div style="font-size: 16px; color: #ef4444; font-weight: bold;">R$ ${totalDespesas.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</div>
              </div>
              <div>
                <div style="font-weight: bold; color: #374151; margin-bottom: 5px;">Limite de Despesas:</div>
                <div style="font-size: 16px; color: #f59e0b; font-weight: bold;">R$ ${metaDespesas.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</div>
              </div>
            </div>
          </div>
        </div>
        
        <div style="text-align: center; margin-top: 40px; padding-top: 20px; border-top: 2px solid #e2e8f0;">
          <p style="color: #6b7280; font-size: 12px; margin: 0;">
            Relatório gerado automaticamente pelo sistema IMPGEO<br>
            Dados baseados em projeções e transações reais do mês<br>
            Para mais informações, acesse o painel administrativo
          </p>
        </div>
      `
      
      document.body.appendChild(tempElement)
      
      // Capturar o elemento como imagem
      // Carregar html2canvas dinamicamente
      const html2canvas = (await import('html2canvas')).default
      const canvas = await html2canvas(tempElement, {
        scale: 2,
        useCORS: true,
        allowTaint: true,
        backgroundColor: '#ffffff'
      })
      
      // Remover elemento temporário
      document.body.removeChild(tempElement)
      
      // Criar PDF
      const imgData = canvas.toDataURL('image/png')
      // Carregar jsPDF dinamicamente
      const jsPDF = (await import('jspdf')).default
      const pdf = new jsPDF('p', 'mm', 'a4')
      const imgWidth = 210
      const pageHeight = 295
      const imgHeight = (canvas.height * imgWidth) / canvas.width
      let heightLeft = imgHeight
      
      let position = 0
      
      pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight)
      heightLeft -= pageHeight
      
      while (heightLeft >= 0) {
        position = heightLeft - imgHeight
        pdf.addPage()
        pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight)
        heightLeft -= pageHeight
      }
      
      // Salvar PDF
      const fileName = `Metas_${mesSelecionado.nome}_${new Date().getFullYear()}_${new Date().toISOString().split('T')[0]}.pdf`
      pdf.save(fileName)
      
      alert(`✅ Relatório PDF exportado com sucesso!\nArquivo: ${fileName}\n\n📊 Dados incluídos:\n• Meta de Faturamento: R$ ${metaFaturamento.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}\n• Faturamento Realizado: R$ ${totalReceitas.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}\n• Limite de Despesas: R$ ${metaDespesas.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}\n• Resultado Financeiro: R$ ${resultadoFinanceiro.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`)
      
    } catch (error) {
      console.error('Erro ao exportar PDF:', error)
      alert('❌ Erro ao exportar PDF. Tente novamente.')
    }
  }

  // Render Metas
  const renderMetas = () => {
    // Encontrar o mês selecionado na lista
    const mesSelecionado = mesesMetas.find(mes => mes.indice === selectedMonth)

    return (
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <h1 className="text-3xl font-bold flex items-center gap-3">
            <Target className="w-8 h-8 text-blue-600" />
            Metas
          </h1>
          <div className="flex gap-3">
            <button 
              onClick={exportarMetasPDF}
              className="flex items-center gap-3 px-6 py-3 bg-gradient-to-r from-blue-500 to-indigo-600 text-white font-semibold rounded-xl hover:from-blue-600 hover:to-indigo-700 shadow-lg hover:shadow-xl transform hover:-translate-y-1 transition-all duration-300"
            >
              <Download className="h-5 w-5" />
              Exportar PDF
            </button>
            <button 
              onClick={() => alert("Ferramenta em construção")}
              className="flex items-center gap-3 px-6 py-3 bg-gradient-to-r from-blue-500 to-indigo-600 text-white font-semibold rounded-xl hover:from-blue-600 hover:to-indigo-700 shadow-lg hover:shadow-xl transform hover:-translate-y-1 transition-all duration-300"
            >
              <Plus className="h-5 w-5" />
              Nova Meta
            </button>
          </div>
        </div>

        {/* Segunda linha: Botões do superadmin */}
        {user?.username === 'superadmin' && (
          <div className="flex items-center gap-4 justify-end">
            <button 
              onClick={recarregarDadosProjecao}
              disabled={isReloadingProjection}
              className={`flex items-center gap-3 px-6 py-3 font-semibold rounded-xl shadow-lg transition-all duration-300 ${
                isReloadingProjection 
                  ? 'bg-gradient-to-r from-gray-400 to-gray-500 text-gray-200 cursor-not-allowed' 
                  : 'bg-gradient-to-r from-orange-500 to-red-600 text-white hover:from-orange-600 hover:to-red-700 hover:shadow-xl hover:-translate-y-1'
              }`}
            >
              {isReloadingProjection ? (
                <>
                  <svg className="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Recarregando...
                </>
              ) : (
                <>
                  <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  Recarregar Projeção
                </>
              )}
            </button>

            <button 
              onClick={verificarSincronizacaoMetas}
              className="flex items-center gap-3 px-6 py-3 bg-gradient-to-r from-purple-500 to-purple-600 text-white font-semibold rounded-xl hover:from-purple-600 hover:to-purple-700 shadow-lg hover:shadow-xl transform hover:-translate-y-1 transition-all duration-300"
            >
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Verificar Sincronização
            </button>
          </div>
        )}

        {/* Resultados da Verificação de Sincronização */}
        {syncResults && (
          <div className="bg-white rounded-2xl shadow-lg border border-gray-200 p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-bold text-gray-800 flex items-center gap-2">
                <svg className="h-6 w-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Resultado da Verificação de Sincronização
              </h3>
              <button 
                onClick={() => setSyncResults(null)}
                className="text-gray-500 hover:text-gray-700"
              >
                <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            
            {syncResults.error ? (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                <p className="text-red-800 font-medium">{syncResults.error}</p>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Estatísticas Gerais */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-center">
                    <div className="text-2xl font-bold text-blue-800">{syncResults.totalMeses}</div>
                    <div className="text-sm text-blue-600">Total de Meses</div>
                  </div>
                  <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-center">
                    <div className="text-2xl font-bold text-green-800">{syncResults.totalSincronizado}</div>
                    <div className="text-sm text-green-600">Meses Sincronizados</div>
                  </div>
                  <div className="bg-purple-50 border border-purple-200 rounded-lg p-4 text-center">
                    <div className="text-2xl font-bold text-purple-800">{syncResults.percentualSincronizado.toFixed(1)}%</div>
                    <div className="text-sm text-purple-600">Taxa de Sincronização</div>
                  </div>
                </div>
                
                {/* Detalhes por Mês */}
                <div className="space-y-2">
                  <h4 className="font-semibold text-gray-700">Detalhes por Mês:</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                    {syncResults.resultados.map((resultado: any) => (
                      <div 
                        key={resultado.monthIndex}
                        className={`border rounded-lg p-3 ${
                          resultado.sincronizado 
                            ? 'bg-green-50 border-green-200' 
                            : 'bg-red-50 border-red-200'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <span className="font-medium text-gray-800">{resultado.mes}</span>
                          <span className={`text-sm font-bold ${
                            resultado.sincronizado ? 'text-green-600' : 'text-red-600'
                          }`}>
                            {resultado.sincronizado ? '✅' : '❌'}
                          </span>
                        </div>
                        <div className="text-sm space-y-1">
                          <div className="flex justify-between">
                            <span className="text-gray-600">Esperado:</span>
                            <span className="font-medium">R$ {resultado.metaEsperada.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-gray-600">Atual:</span>
                            <span className="font-medium">R$ {resultado.metaAtual.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                          </div>
                          {!resultado.sincronizado && (
                            <div className="flex justify-between text-red-600">
                              <span className="text-sm">Diferença:</span>
                              <span className="font-medium text-sm">R$ {resultado.diferenca.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                
                {/* Timestamp */}
                <div className="text-xs text-gray-500 text-center pt-4 border-t">
                  Verificação realizada em: {new Date(syncResults.timestamp).toLocaleString('pt-BR')}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Renderizar Mês Selecionado com navegador horizontal */}
        {mesSelecionado && (
          <div className="space-y-6 mb-12">
            {/* Navegador de Mês */}
            <div className="bg-gradient-to-r from-blue-500 to-indigo-600 p-6 rounded-2xl shadow-lg flex items-center justify-between">
              <button
                type="button"
                onClick={() => setSelectedMonth((m) => (m - 1 + 12) % 12)}
                className="p-2 rounded-lg bg-white/20 hover:bg-white/30 text-white transition-colors duration-150"
              >
                <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
              </button>
              <h2 className="text-3xl font-bold text-white text-center uppercase tracking-wider">
                {mesSelecionado.nome} — {new Date().getFullYear()}
              </h2>
              <button
                type="button"
                onClick={() => setSelectedMonth((m) => (m + 1) % 12)}
                className="p-2 rounded-lg bg-white/20 hover:bg-white/30 text-white transition-colors duration-150"
              >
                <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
              </button>
            </div>
              
            {/* Conteúdo do Mês */}
            {renderMonthContent(mesSelecionado.nome, mesSelecionado.indice)}
              </div>
        )}

        {/* Renderizar Total do Ano */}
        {renderTotalAno()}

        {/* Renderizar todos os 12 meses em ordem normal */}
        {mesesMetas.map((mes) => 
          renderMonth(mes.nome, mes.indice)
        )}
              </div>
    )
  }

  // Render Dashboard
  const renderDashboard = () => {
    const currentYear = new Date().getFullYear()
    const transacoesMesSelecionado = transactions.filter(t => {
      const transactionDate = new Date(t.date)
      return transactionDate.getMonth() === dashboardSelectedMonth && transactionDate.getFullYear() === dashboardSelectedYear
    })

    const totalReceitasMes = transacoesMesSelecionado
      .filter(t => t.type === 'Receita')
      .reduce((sum, t) => sum + (parseFloat(String(t.value)) || 0), 0)
    const totalDespesasMes = transacoesMesSelecionado
      .filter(t => t.type === 'Despesa')
      .reduce((sum, t) => sum + (parseFloat(String(t.value)) || 0), 0)
    const lucroLiquidoMes = totalReceitasMes - totalDespesasMes
    
    // Função para determinar o trimestre de um mês (0-11)
    const getQuarter = (month: number) => Math.floor(month / 3)

    // Cálculos trimestrais
    const currentQuarter = dashboardSelectedQuarter
    const transacoesTrimestre = transactions.filter(t => {
      const transactionDate = new Date(t.date)
      const transactionQuarter = getQuarter(transactionDate.getMonth())
      return transactionQuarter === currentQuarter && transactionDate.getFullYear() === dashboardSelectedYear
    })
    
    const totalReceitasTrimestre = transacoesTrimestre
      .filter(t => t.type === 'Receita')
      .reduce((sum, t) => sum + (parseFloat(String(t.value)) || 0), 0)
    const totalDespesasTrimestre = transacoesTrimestre
      .filter(t => t.type === 'Despesa')
      .reduce((sum, t) => sum + (parseFloat(String(t.value)) || 0), 0)
    const lucroLiquidoTrimestre = totalReceitasTrimestre - totalDespesasTrimestre
    
    // Cálculos anuais
    const transacoesAno = transactions.filter(t => {
      const transactionDate = new Date(t.date)
      return transactionDate.getFullYear() === dashboardSelectedYear
    })
    
    const totalReceitasAno = transacoesAno
      .filter(t => t.type === 'Receita')
      .reduce((sum, t) => sum + (parseFloat(String(t.value)) || 0), 0)
    const totalDespesasAno = transacoesAno
      .filter(t => t.type === 'Despesa')
      .reduce((sum, t) => sum + (parseFloat(String(t.value)) || 0), 0)
    const lucroLiquidoAno = totalReceitasAno - totalDespesasAno

    // Transações recentes (últimas 5)
    const transacoesRecentes = transactions
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, 5)

    // Nomes dos meses e trimestres
    const nomesMeses = [
      'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
      'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
    ]

    const nomesTrimestres = ['1º Trimestre', '2º Trimestre', '3º Trimestre', '4º Trimestre']

    // Anos disponíveis (do mais antigo com transação até o ano atual + 1)
    const yearsWithData = transactions.map(t => new Date(t.date).getFullYear()).filter(y => !isNaN(y))
    const minYear = yearsWithData.length > 0 ? Math.min(...yearsWithData) : currentYear
    const availableYears: number[] = []
    for (let y = Math.min(minYear, currentYear); y <= currentYear + 1; y++) availableYears.push(y)

    // Dados para gráficos
    const pieChartData = [
      { name: 'Receitas', value: totalReceitasMes, color: '#22c55e' },
      { name: 'Despesas', value: totalDespesasMes, color: '#ef4444' }
    ]

    const pieChartDataTrimestre = [
      { name: 'Receitas', value: totalReceitasTrimestre, color: '#22c55e' },
      { name: 'Despesas', value: totalDespesasTrimestre, color: '#ef4444' }
    ]

    const pieChartDataAnual = [
      { name: 'Receitas', value: totalReceitasAno, color: '#22c55e' },
      { name: 'Despesas', value: totalDespesasAno, color: '#ef4444' }
    ]


    // Componente de gráfico de rosca (donut chart)
    const renderPieChart = (data: any[], title: string) => {
      const hasData = data.length > 0 && data.some(item => item.value > 0);
      const total = data.reduce((sum, item) => sum + item.value, 0);

      return (
        <div className="bg-white dark:!bg-[#243040] p-6 rounded-2xl shadow-lg border border-gray-100 dark:border-gray-700 mt-4">
          <h3 className="text-lg font-bold text-gray-800 dark:text-gray-100 mb-4">{title}</h3>
          {hasData ? (
            <ResponsiveContainer width="100%" height={280}>
              <RechartsPieChart>
                <Pie
                  data={data}
                  cx="50%"
                  cy="50%"
                  innerRadius={70}
                  outerRadius={110}
                  paddingAngle={5}
                  dataKey="value"
                  cornerRadius={6}
                  stroke="none"
                >
                  {data.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <RechartsTooltip
                  formatter={(value: any) => [`R$ ${(parseFloat(String(value)) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, '']}
                  contentStyle={{ backgroundColor: '#ffffff', border: '1px solid #e5e7eb', borderRadius: '12px', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)' }}
                />
                <Legend
                  verticalAlign="bottom"
                  height={36}
                  iconType="circle"
                  wrapperStyle={{ paddingTop: '16px', fontSize: '14px', fontWeight: 600 }}
                  formatter={(value) => <span className="text-sm text-gray-700 dark:text-gray-300">{value}</span>}
                />
              </RechartsPieChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-60 text-gray-400 text-sm">
              Nenhuma transação encontrada
            </div>
          )}
          {hasData && (
            <div className="mt-2 pt-2 border-t border-gray-100 dark:border-gray-700 flex justify-between text-xs text-gray-500 dark:text-gray-400">
              {data.map(item => (
                <span key={item.name}>
                  <span className="font-semibold" style={{ color: item.color }}>{item.name}:</span>{' '}
                  R$ {item.value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  {total > 0 && <span className="ml-1 text-gray-400">({((item.value / total) * 100).toFixed(1)}%)</span>}
                </span>
              ))}
            </div>
          )}
        </div>
      );
    }

    return (
      <div className="space-y-8">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <h1 className="text-3xl font-bold flex items-center gap-3">
            <BarChart3 className="w-8 h-8 text-blue-600" />
            Dashboard IMPGEO
          </h1>
          {permissions.canCreate && (
            <button
              onClick={() => setShowTransactionModal(true)}
              className="flex items-center gap-3 px-6 py-3 bg-gradient-to-r from-blue-500 to-indigo-600 text-white font-semibold rounded-xl hover:from-blue-600 hover:to-indigo-700 shadow-lg shadow-blue-500/25 hover:shadow-xl hover:shadow-blue-500/35 hover:-translate-y-0.5 active:translate-y-0 transition-all duration-200 whitespace-nowrap"
            >
              <Plus className="h-5 w-5" />
              Nova Transação
            </button>
          )}
        </div>

        {/* Seção Mês */}
        <div className="bg-gradient-to-br from-blue-50/60 to-indigo-50/40 dark:from-blue-900/20 dark:to-indigo-900/10 rounded-2xl p-5 border border-blue-100 dark:border-blue-900/30 space-y-4">
          <div className="flex items-center gap-3">
            <h2 className="text-2xl font-bold text-gray-800 dark:text-gray-100 flex items-center gap-3">
              <PieChart className="w-6 h-6 text-blue-600" />
              Dados do mês
            </h2>
            <div className="flex items-center gap-1 bg-blue-100 dark:bg-blue-900/40 border border-blue-200 dark:border-blue-800 rounded-lg overflow-hidden">
              <button
                onClick={() => setDashboardSelectedMonth((m) => (m - 1 + 12) % 12)}
                className="px-2 py-1.5 text-blue-700 dark:text-blue-300 hover:bg-blue-200 dark:hover:bg-blue-800 transition-colors duration-150"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
              </button>
              <span className="text-sm font-semibold text-blue-700 dark:text-blue-300 px-2 min-w-[140px] text-center">
                {nomesMeses[dashboardSelectedMonth]} {dashboardSelectedYear}
              </span>
              <button
                onClick={() => setDashboardSelectedMonth((m) => (m + 1) % 12)}
                className="px-2 py-1.5 text-blue-700 dark:text-blue-300 hover:bg-blue-200 dark:hover:bg-blue-800 transition-colors duration-150"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
              </button>
            </div>
          </div>

          {/* Resumo rápido do mês */}
          {(() => {
            const recCount = transacoesMesSelecionado.filter(t => t.type === 'Receita').length
            const despCount = transacoesMesSelecionado.filter(t => t.type === 'Despesa').length
            const margem = totalReceitasMes > 0 ? (lucroLiquidoMes / totalReceitasMes) * 100 : 0
            return (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="bg-white dark:!bg-[#243040] rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm p-4 flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-emerald-100 dark:bg-emerald-900/40 flex items-center justify-center flex-shrink-0">
                    <DollarSign className="w-5 h-5 text-emerald-600" />
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Receitas</p>
                    <p className="text-xl font-black text-emerald-600">{recCount} <span className="text-sm font-semibold">lançamento{recCount !== 1 ? 's' : ''}</span></p>
                  </div>
                </div>
                <div className="bg-white dark:!bg-[#243040] rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm p-4 flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-red-100 dark:bg-red-900/40 flex items-center justify-center flex-shrink-0">
                    <TrendingDown className="w-5 h-5 text-red-600" />
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Despesas</p>
                    <p className="text-xl font-black text-red-600">{despCount} <span className="text-sm font-semibold">lançamento{despCount !== 1 ? 's' : ''}</span></p>
                  </div>
                </div>
                <div className="bg-white dark:!bg-[#243040] rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm p-4 flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${lucroLiquidoMes >= 0 ? 'bg-blue-100 dark:bg-blue-900/40' : 'bg-red-100 dark:bg-red-900/40'}`}>
                    <Wallet className={`w-5 h-5 ${lucroLiquidoMes >= 0 ? 'text-blue-600' : 'text-red-600'}`} />
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Lucro Líquido</p>
                    <p className={`text-base font-black ${lucroLiquidoMes >= 0 ? 'text-blue-600' : 'text-red-600'}`}>
                      {lucroLiquidoMes >= 0 ? '+' : ''}R$ {lucroLiquidoMes.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                    </p>
                  </div>
                </div>
                <div className={`rounded-xl border shadow-sm p-4 flex items-center gap-3 ${margem >= 20 ? 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800' : margem >= 0 ? 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800' : 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800'}`}>
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${margem >= 20 ? 'bg-emerald-100 dark:bg-emerald-900/40' : margem >= 0 ? 'bg-amber-100 dark:bg-amber-900/40' : 'bg-red-100 dark:bg-red-900/40'}`}>
                    <Zap className={`w-5 h-5 ${margem >= 20 ? 'text-emerald-600' : margem >= 0 ? 'text-amber-600' : 'text-red-600'}`} />
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Margem</p>
                    <p className={`text-xl font-black ${margem >= 20 ? 'text-emerald-700 dark:text-emerald-400' : margem >= 0 ? 'text-amber-700 dark:text-amber-400' : 'text-red-700 dark:text-red-400'}`}>{margem.toFixed(1)}%</p>
                  </div>
                </div>
              </div>
            )
          })()}

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Card Receitas */}
            <div className="space-y-4">
              <div
                className="bg-gradient-to-br from-green-400 to-emerald-500 p-6 rounded-2xl shadow-lg cursor-pointer hover:shadow-xl transition-all duration-200 hover:-translate-y-1"
                onClick={() => toggleChart('receitas-mensal')}
              >
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center">
                    <DollarSign className="h-6 w-6 text-white" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-white/80 uppercase tracking-wide">Receitas</p>
                    <p className="text-2xl font-bold text-white mt-1">
                      R$ {totalReceitasMes.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </p>
                    <span className="inline-flex items-center gap-1 mt-1 text-xs font-bold bg-white/20 text-white px-2 py-0.5 rounded-full">
                      <CheckCircle2 className="w-3 h-3" /> {transacoesMesSelecionado.filter(t => t.type === 'Receita').length} lançamentos
                    </span>
                  </div>
                </div>
              </div>
              {expandedCharts.includes('receitas-mensal') && renderPieChart(pieChartData, 'Distribuição Mensal: Receitas vs Despesas')}
            </div>

            {/* Card Despesas */}
            <div className="space-y-4">
              <div
                className="bg-gradient-to-br from-red-400 to-rose-500 p-6 rounded-2xl shadow-lg cursor-pointer hover:shadow-xl transition-all duration-200 hover:-translate-y-1"
                onClick={() => toggleChart('despesas-mensal')}
              >
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center">
                    <TrendingDown className="h-6 w-6 text-white" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-white/80 uppercase tracking-wide">Despesas</p>
                    <p className="text-2xl font-bold text-white mt-1">
                      R$ {totalDespesasMes.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </p>
                    <span className="inline-flex items-center gap-1 mt-1 text-xs font-bold bg-white/20 text-white px-2 py-0.5 rounded-full">
                      <AlertTriangle className="w-3 h-3" /> {transacoesMesSelecionado.filter(t => t.type === 'Despesa').length} lançamentos
                    </span>
                  </div>
                </div>
              </div>
              {expandedCharts.includes('despesas-mensal') && renderPieChart(pieChartData, 'Distribuição Mensal: Receitas vs Despesas')}
            </div>

            {/* Card Saldo */}
            <div className="space-y-4">
              <div
                className={`p-6 rounded-2xl shadow-lg cursor-pointer hover:shadow-xl transition-all duration-200 hover:-translate-y-1 ${
                  lucroLiquidoMes >= 0 ? 'bg-gradient-to-br from-blue-500 to-indigo-600' : 'bg-gradient-to-br from-red-400 to-red-500'
                }`}
                onClick={() => toggleChart('saldo-mensal')}
              >
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center">
                    <BarChart3 className="h-6 w-6 text-white" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-white/80 uppercase tracking-wide">Saldo</p>
                    <p className="text-2xl font-bold text-white mt-1">
                      R$ {lucroLiquidoMes.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </p>
                    <span className={`inline-flex items-center gap-1 mt-1 text-xs font-bold px-2 py-0.5 rounded-full ${lucroLiquidoMes >= 0 ? 'bg-white/20 text-white' : 'bg-black/20 text-white/90'}`}>
                      {lucroLiquidoMes >= 0 ? <><CheckCircle2 className="w-3 h-3" /> Positivo</> : <><AlertTriangle className="w-3 h-3" /> Negativo</>}
                    </span>
                  </div>
                </div>
              </div>
              {expandedCharts.includes('saldo-mensal') && renderPieChart(pieChartData, `Receitas vs Despesas — ${nomesMeses[dashboardSelectedMonth]}`)}
            </div>
          </div>
        </div>

        {/* Seção Trimestre */}
        <div className="bg-gradient-to-br from-cyan-50/60 to-sky-50/40 dark:from-cyan-900/20 dark:to-sky-900/10 rounded-2xl p-5 border border-cyan-100 dark:border-cyan-900/30 space-y-4">
          <h2 className="text-2xl font-bold text-cyan-800 dark:text-cyan-300 flex items-center gap-3">
            <PieChart className="w-6 h-6 text-cyan-600" />
            Trimestre
            <select
              id="dashboard-quarter-selector"
              name="dashboard-quarter-selector"
              aria-label="Selecionar trimestre do dashboard"
              value={dashboardSelectedQuarter}
              onChange={(e) => setDashboardSelectedQuarter(Number(e.target.value))}
              className="text-sm font-semibold text-cyan-700 dark:text-cyan-300 bg-cyan-100 dark:bg-cyan-900/40 px-3 py-1 rounded-lg border border-cyan-200 dark:border-cyan-800 outline-none cursor-pointer"
            >
              {nomesTrimestres.map((t, i) => (
                <option key={i} value={i}>{t} {dashboardSelectedYear}</option>
              ))}
            </select>
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Card Receitas Trimestrais */}
            <div className="space-y-4">
              <div
                className="bg-gradient-to-br from-green-400 to-emerald-500 p-6 rounded-2xl shadow-lg cursor-pointer hover:shadow-xl transition-all duration-200 hover:-translate-y-1"
                onClick={() => toggleChart('receitas-trimestre')}
              >
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center">
                    <DollarSign className="h-6 w-6 text-white" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-white/80 uppercase tracking-wide">Receitas</p>
                    <p className="text-2xl font-bold text-white mt-1">
                      R$ {totalReceitasTrimestre.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </p>
                    <span className="inline-flex items-center gap-1 mt-1 text-xs font-bold bg-white/20 text-white px-2 py-0.5 rounded-full">
                      <CheckCircle2 className="w-3 h-3" /> {nomesTrimestres[dashboardSelectedQuarter]}
                    </span>
                  </div>
                </div>
              </div>
              {expandedCharts.includes('receitas-trimestre') && renderPieChart(pieChartDataTrimestre, 'Distribuição Trimestral: Receitas vs Despesas')}
            </div>

            {/* Card Despesas Trimestrais */}
            <div className="space-y-4">
              <div
                className="bg-gradient-to-br from-red-400 to-rose-500 p-6 rounded-2xl shadow-lg cursor-pointer hover:shadow-xl transition-all duration-200 hover:-translate-y-1"
                onClick={() => toggleChart('despesas-trimestre')}
              >
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center">
                    <TrendingDown className="h-6 w-6 text-white" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-white/80 uppercase tracking-wide">Despesas</p>
                    <p className="text-2xl font-bold text-white mt-1">
                      R$ {totalDespesasTrimestre.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </p>
                    <span className="inline-flex items-center gap-1 mt-1 text-xs font-bold bg-white/20 text-white px-2 py-0.5 rounded-full">
                      <AlertTriangle className="w-3 h-3" /> {nomesTrimestres[dashboardSelectedQuarter]}
                    </span>
                  </div>
                </div>
              </div>
              {expandedCharts.includes('despesas-trimestre') && renderPieChart(pieChartDataTrimestre, 'Distribuição Trimestral: Receitas vs Despesas')}
            </div>

            {/* Card Saldo Trimestral */}
            <div className="space-y-4">
              <div
                className={`p-6 rounded-2xl shadow-lg cursor-pointer hover:shadow-xl transition-all duration-200 hover:-translate-y-1 ${
                  lucroLiquidoTrimestre >= 0 ? 'bg-gradient-to-br from-blue-500 to-indigo-600' : 'bg-gradient-to-br from-red-400 to-red-500'
                }`}
                onClick={() => toggleChart('saldo-trimestre')}
              >
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center">
                    <BarChart3 className="h-6 w-6 text-white" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-white/80 uppercase tracking-wide">Saldo</p>
                    <p className="text-2xl font-bold text-white mt-1">
                      R$ {lucroLiquidoTrimestre.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </p>
                    <span className={`inline-flex items-center gap-1 mt-1 text-xs font-bold px-2 py-0.5 rounded-full ${lucroLiquidoTrimestre >= 0 ? 'bg-white/20 text-white' : 'bg-black/20 text-white/90'}`}>
                      {lucroLiquidoTrimestre >= 0 ? <><CheckCircle2 className="w-3 h-3" /> Positivo</> : <><AlertTriangle className="w-3 h-3" /> Negativo</>}
                    </span>
                  </div>
                </div>
              </div>
              {expandedCharts.includes('saldo-trimestre') && renderPieChart(pieChartDataTrimestre, `Receitas vs Despesas — ${nomesTrimestres[dashboardSelectedQuarter]}`)}
            </div>
          </div>
        </div>

        {/* Seção Ano */}
        <div className="bg-gradient-to-br from-indigo-50/60 to-blue-50/40 dark:from-indigo-900/20 dark:to-blue-900/10 rounded-2xl p-5 border border-indigo-100 dark:border-indigo-900/30 space-y-4">
          <h2 className="text-2xl font-bold text-indigo-800 dark:text-indigo-300 flex items-center gap-3">
            <PieChart className="w-6 h-6 text-indigo-600" />
            Ano
            <select
              id="dashboard-year-selector"
              name="dashboard-year-selector"
              aria-label="Selecionar ano do dashboard"
              value={dashboardSelectedYear}
              onChange={(e) => {
                const y = Number(e.target.value)
                setDashboardSelectedYear(y)
                const isCurrentYear = y === new Date().getFullYear()
                setDashboardSelectedQuarter(isCurrentYear ? Math.floor(new Date().getMonth() / 3) : 0)
                setDashboardSelectedMonth(isCurrentYear ? new Date().getMonth() : 0)
              }}
              className="text-sm font-semibold text-indigo-700 dark:text-indigo-300 bg-indigo-100 dark:bg-indigo-900/40 px-3 py-1 rounded-lg border border-indigo-200 dark:border-indigo-800 outline-none cursor-pointer"
            >
              {availableYears.map(y => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Card Receitas Anuais */}
            <div className="space-y-4">
              <div
                className="bg-gradient-to-br from-green-400 to-emerald-500 p-6 rounded-2xl shadow-lg cursor-pointer hover:shadow-xl transition-all duration-200 hover:-translate-y-1"
                onClick={() => toggleChart('receitas-anual')}
              >
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center">
                    <DollarSign className="h-6 w-6 text-white" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-white/80 uppercase tracking-wide">Receitas Anuais</p>
                    <p className="text-2xl font-bold text-white mt-1">
                      R$ {totalReceitasAno.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </p>
                    <span className="inline-flex items-center gap-1 mt-1 text-xs font-bold bg-white/20 text-white px-2 py-0.5 rounded-full">
                      <CheckCircle2 className="w-3 h-3" /> {dashboardSelectedYear}
                    </span>
                  </div>
                </div>
              </div>
              {expandedCharts.includes('receitas-anual') && renderPieChart(pieChartDataAnual, 'Distribuição Anual: Receitas vs Despesas')}
            </div>

            {/* Card Despesas Anuais */}
            <div className="space-y-4">
              <div
                className="bg-gradient-to-br from-red-400 to-rose-500 p-6 rounded-2xl shadow-lg cursor-pointer hover:shadow-xl transition-all duration-200 hover:-translate-y-1"
                onClick={() => toggleChart('despesas-anual')}
              >
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center">
                    <TrendingDown className="h-6 w-6 text-white" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-white/80 uppercase tracking-wide">Despesas Anuais</p>
                    <p className="text-2xl font-bold text-white mt-1">
                      R$ {totalDespesasAno.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </p>
                    <span className="inline-flex items-center gap-1 mt-1 text-xs font-bold bg-white/20 text-white px-2 py-0.5 rounded-full">
                      <AlertTriangle className="w-3 h-3" /> {dashboardSelectedYear}
                    </span>
                  </div>
                </div>
              </div>
              {expandedCharts.includes('despesas-anual') && renderPieChart(pieChartDataAnual, 'Distribuição Anual: Receitas vs Despesas')}
            </div>

            {/* Card Saldo Anual */}
            <div className="space-y-4">
              <div
                className={`p-6 rounded-2xl shadow-lg cursor-pointer hover:shadow-xl transition-all duration-200 hover:-translate-y-1 ${
                  lucroLiquidoAno >= 0 ? 'bg-gradient-to-br from-blue-500 to-indigo-600' : 'bg-gradient-to-br from-red-400 to-red-500'
                }`}
                onClick={() => toggleChart('saldo-anual')}
              >
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center">
                    <BarChart3 className="h-6 w-6 text-white" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-white/80 uppercase tracking-wide">Saldo Anual</p>
                    <p className="text-2xl font-bold text-white mt-1">
                      R$ {lucroLiquidoAno.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </p>
                    <span className={`inline-flex items-center gap-1 mt-1 text-xs font-bold px-2 py-0.5 rounded-full ${lucroLiquidoAno >= 0 ? 'bg-white/20 text-white' : 'bg-black/20 text-white/90'}`}>
                      {lucroLiquidoAno >= 0 ? <><CheckCircle2 className="w-3 h-3" /> Positivo</> : <><AlertTriangle className="w-3 h-3" /> Negativo</>}
                    </span>
                  </div>
                </div>
              </div>
              {expandedCharts.includes('saldo-anual') && renderPieChart(pieChartDataAnual, `Receitas vs Despesas — ${dashboardSelectedYear}`)}
            </div>
          </div>
        </div>

        {/* Lista de Transações Recentes */}
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl shadow-md shadow-blue-500/25">
              <DollarSign className="w-5 h-5 text-white" />
            </div>
            <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">
              Transações Recentes
            </h2>
          </div>

          {transacoesRecentes.length > 0 && (() => {
            const rec = transacoesRecentes.filter(t => t.type === 'Receita')
            const desp = transacoesRecentes.filter(t => t.type === 'Despesa')
            const totalRec = rec.reduce((s, t) => s + (Number(t.value) || 0), 0)
            const totalDesp = desp.reduce((s, t) => s + (Number(t.value) || 0), 0)
            return (
              <div className="flex flex-wrap gap-3 mb-2">
                <span className="flex items-center gap-2 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-700 text-emerald-700 dark:text-emerald-400 text-sm font-bold px-3 py-1.5 rounded-full">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" />
                  {rec.length} receita{rec.length !== 1 ? 's' : ''} · +R$ {totalRec.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </span>
                <span className="flex items-center gap-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 text-red-700 dark:text-red-400 text-sm font-bold px-3 py-1.5 rounded-full">
                  <span className="w-2 h-2 rounded-full bg-red-500 inline-block" />
                  {desp.length} despesa{desp.length !== 1 ? 's' : ''} · -R$ {totalDesp.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </span>
                <span className={`flex items-center gap-2 border text-sm font-bold px-3 py-1.5 rounded-full ${(totalRec - totalDesp) >= 0 ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-700 text-blue-700 dark:text-blue-400' : 'bg-rose-50 dark:bg-rose-900/20 border-rose-200 dark:border-rose-700 text-rose-700 dark:text-rose-400'}`}>
                  Saldo: {(totalRec - totalDesp) >= 0 ? '+' : ''}R$ {(totalRec - totalDesp).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </span>
              </div>
            )
          })()}

          <div className="bg-white dark:!bg-[#243040] rounded-2xl shadow-md dark:shadow-[0_0_0_1px_rgba(255,255,255,0.07),0_4px_24px_rgba(0,0,0,0.4)] border border-gray-200 dark:border-gray-600 overflow-hidden">
            {transacoesRecentes.length === 0 ? (
              <div className="p-12 text-center">
                <div className="flex justify-center mb-3">
                  <div className="bg-gray-100 dark:bg-gray-700 rounded-full p-4">
                    <DollarSign className="w-8 h-8 text-gray-400 dark:text-gray-500" />
                  </div>
                </div>
                <p className="text-gray-500 dark:text-gray-400 font-medium">Nenhuma transação encontrada.</p>
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">Adicione suas primeiras transações para vê-las aqui.</p>
              </div>
            ) : (
              <div>
                {transacoesRecentes.map((transacao, index) => (
                  <div
                    key={index}
                    className={`px-5 py-3.5 border-b last:border-b-0 border-gray-100 dark:border-gray-700/60 transition-colors duration-150 ${
                      index % 2 === 0 ? 'imp-row-even' : 'imp-row-odd'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ring-2 ring-offset-1 ${
                          index % 2 === 0 ? 'ring-offset-white dark:ring-offset-[#1f2937]' : 'ring-offset-gray-50 dark:ring-offset-[#374151]'
                        } ${
                          transacao.type === 'Receita'
                            ? 'bg-emerald-500 ring-emerald-200 dark:ring-emerald-700'
                            : 'bg-red-500 ring-red-200 dark:ring-red-700'
                        }`} />
                        <div className="min-w-0 flex-1">
                          <p className="font-medium text-gray-900 dark:text-gray-100 truncate text-sm">{transacao.description}</p>
                          <p className="text-xs text-gray-400 dark:text-gray-500 truncate">{transacao.category}</p>
                        </div>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className={`font-bold whitespace-nowrap text-sm ${
                          transacao.type === 'Receita'
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : 'text-red-600 dark:text-red-400'
                        }`}>
                          {transacao.type === 'Receita' ? '+' : '-'}R$ {Math.abs(transacao.value).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        </p>
                        <p className="text-xs text-gray-400 dark:text-gray-500 whitespace-nowrap">
                          {new Date(transacao.date).toLocaleDateString('pt-BR')}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="px-5 py-4 bg-gradient-to-r from-gray-50 to-blue-50/60 dark:from-gray-700/30 dark:to-blue-900/20 border-t border-gray-100 dark:border-gray-600/60">
              <button
                onClick={() => { setActiveTab('transactions'); window.scrollTo({ top: 0, behavior: 'instant' }); }}
                className="w-full flex items-center justify-center gap-3 px-6 py-3.5 bg-gradient-to-r from-blue-500 to-indigo-600 text-white font-semibold rounded-xl hover:from-blue-600 hover:to-indigo-700 shadow-md shadow-blue-500/25 hover:shadow-lg hover:shadow-blue-500/30 hover:-translate-y-0.5 active:translate-y-0 transition-all duration-200 group"
              >
                <DollarSign className="h-4 w-4 group-hover:scale-110 transition-transform duration-200" />
                Ver todas as transações
                <ArrowUpCircle className="h-4 w-4 rotate-90 group-hover:translate-x-1 transition-all duration-200" />
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // Renderização principal
  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-100 dark:bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Carregando dados...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-100 dark:bg-gray-900">
      <ImpersonationBanner />
      {user && <FeedbackButton paginaAtual={activeTab} />}
      <NavigationBar />
      
      <main className="max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8 pt-36">
        {activeTab === 'dashboard' && hasModuleAccess('dashboard') && (
          <>
            {renderDashboard()}
            {showTransactionModal && (
              <Suspense fallback={<div className="flex items-center justify-center py-12"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div></div>}>
                <TransactionsPage 
                  showModal={true}
                  onCloseModal={() => setShowTransactionModal(false)}
                />
              </Suspense>
            )}
          </>
        )}
        {activeTab === 'metas' && hasModuleAccess('metas') && renderMetas()}
        {activeTab === 'reports' && hasModuleAccess('reports') && (
          <Suspense fallback={<div className="flex items-center justify-center py-12"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div></div>}>
            <Reports transactions={transactions} />
          </Suspense>
        )}
        {activeTab === 'transactions' && hasModuleAccess('transactions') && (
          <Suspense fallback={<div className="flex items-center justify-center py-12"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div></div>}>
            <TransactionsPage />
          </Suspense>
        )}
        {activeTab === 'projects' && hasModuleAccess('projects') && (
          <Suspense fallback={<div className="flex items-center justify-center py-12"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div></div>}>
            <Projects />
          </Suspense>
        )}
        {activeTab === 'services' && hasModuleAccess('services') && (
          <Suspense fallback={<div className="flex items-center justify-center py-12"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div></div>}>
            <Services />
          </Suspense>
        )}
        {/* removido placeholder duplicado de Relatórios */}
        {activeTab === 'metas' && hasModuleAccess('metas') && (
          <div className="space-y-6">
            <h1 className="text-3xl font-bold text-gray-900">Metas</h1>
            <p className="text-gray-600">Funcionalidade em desenvolvimento...</p>
            </div>
        )}
        {activeTab === 'projecao' && hasModuleAccess('projecao') && (
          <Suspense fallback={<div className="flex items-center justify-center py-12"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div></div>}>
            <Projection />
          </Suspense>
        )}
        {activeTab === 'clients' && hasModuleAccess('clients') && (
          <Suspense fallback={<div className="flex items-center justify-center py-12"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div></div>}>
            <Clients />
          </Suspense>
        )}
        {activeTab === 'dre' && hasModuleAccess('dre') && (
          <Suspense fallback={<div className="flex items-center justify-center py-12"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div></div>}>
            <DRE />
          </Suspense>
        )}
        {activeTab === 'acompanhamentos' && hasModuleAccess('acompanhamentos') && (
          <Suspense fallback={<div className="flex items-center justify-center py-12"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div></div>}>
            <Acompanhamentos />
          </Suspense>
        )}
        {activeTab === 'faq' && hasModuleAccess('faq') && (
          <Suspense fallback={<div className="flex items-center justify-center py-12"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div></div>}>
            <FAQ />
          </Suspense>
        )}
        {activeTab === 'documentacao' && hasModuleAccess('documentacao') && (
          <Suspense fallback={<div className="flex items-center justify-center py-12"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div></div>}>
            <Documentation />
          </Suspense>
        )}
        {activeTab === 'admin' && hasModuleAccess('admin') && (
          <Suspense fallback={<div className="flex items-center justify-center py-12"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div></div>}>
            <AdminPanel />
          </Suspense>
        )}
        {activeTab === 'sessions' && hasModuleAccess('sessions') && (
          <Suspense fallback={<div className="flex items-center justify-center py-12"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div></div>}>
            <ActiveSessions />
          </Suspense>
        )}
        {activeTab === 'anomalies' && hasModuleAccess('anomalies') && (
          <Suspense fallback={<div className="flex items-center justify-center py-12"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div></div>}>
            <AnomalyDashboard />
          </Suspense>
        )}
        {activeTab === 'security_alerts' && hasModuleAccess('security_alerts') && (
          <Suspense fallback={<div className="flex items-center justify-center py-12"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div></div>}>
            <SecurityAlerts />
          </Suspense>
        )}
        {activeTab === 'roadmap' && hasModuleAccess('roadmap') && (
          <Suspense fallback={<div className="flex items-center justify-center py-12"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div></div>}>
            <Roadmap />
          </Suspense>
        )}
      </main>

      <Footer />

      {/* Modal de confirmação de commit pendente (somente superadmin) */}
      {commitPendente && (
        <CommitVersionModal
          commitHash={commitPendente.commitHash}
          versaoAtual={commitPendente.versaoAtual}
          mensagemOriginal={commitPendente.mensagem}
          data={commitPendente.data}
          onClose={() => setCommitPendente(null)}
          onIgnore={async () => {
            const res = await fetch(`${API_BASE_URL}/admin/rodape/confirmar-commit`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
              body: JSON.stringify({
                action: 'ignorar',
                commitHash: commitPendente.commitHash,
                mensagem: '',
                data: commitPendente.data,
                rolesNotificados: [],
              }),
            });
            if (!res.ok) throw new Error('Falha na requisição');
            setCommitPendente(null);
          }}
          onConfirm={async ({ action, novaVersao, mensagem, data, rolesNotificados }) => {
            const res = await fetch(`${API_BASE_URL}/admin/rodape/confirmar-commit`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
              body: JSON.stringify({
                action,
                novaVersao,
                commitHash: commitPendente.commitHash,
                mensagem,
                data,
                rolesNotificados,
              }),
            });
            if (!res.ok) throw new Error('Falha na requisição');
            setCommitPendente(null);
            window.dispatchEvent(new Event('rodape-updated'));
          }}
        />
      )}

      {/* Modal de nova versão para usuários */}
      {versoesNovas && versoesNovas.length > 0 && (
        <VersaoNovaModal
          versoes={versoesNovas}
          onConfirm={async (versao) => {
            try {
              await fetch(`${API_BASE_URL}/notificacao-versao/vista`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({ versao }),
              });
            } catch { /* silently ignore */ }
          }}
          onClose={() => setVersoesNovas(null)}
        />
      )}

      {/* Modal de Gráficos */}
      <ChartModal
        isOpen={chartModal.isOpen}
        onClose={closeChart}
        title={chartModal.title}
        data={chartModal.data}
        totalValue={chartModal.totalValue}
        subtitle={chartModal.subtitle}
      />

      {/* Notificação de Sucesso */}
      {showSuccessMessage && (
        <div className="fixed top-4 right-4 z-50 animate-in slide-in-from-right duration-300">
          <div className="bg-green-500 text-white px-6 py-4 rounded-lg shadow-lg flex items-center gap-3">
            <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            <div>
              <div className="font-semibold">✅ Sincronização Concluída!</div>
              <div className="text-sm opacity-90">Dados da projeção atualizados com sucesso</div>
            </div>
            <button 
              onClick={() => setShowSuccessMessage(false)}
              className="ml-2 text-white hover:text-gray-200 transition-colors"
            >
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <AppContent />
        <ThemeToggle />
      </AuthProvider>
    </ThemeProvider>
  );
}

export default App