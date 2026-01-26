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
  Phone,
  Mail,
  Map,
  Calculator,
  Download,
  ClipboardList,
  Shield
} from 'lucide-react'
// PDF libraries serão carregadas dinamicamente quando necessário
// Dynamic imports para componentes pesados (lazy loading)
import { lazy, Suspense } from 'react'
import Login from './components/Login'
import ChartModal from './components/modals/ChartModal'

const Reports = lazy(() => import('./components/Reports'))
const TransactionsPage = lazy(() => import('./components/Transactions').then(module => ({ default: module.TransactionsPage })))
const Clients = lazy(() => import('./components/Clients'))
const DRE = lazy(() => import('./components/DRE'))
const Projects = lazy(() => import('./components/Projects'))
const Services = lazy(() => import('./components/Services'))
const Projection = lazy(() => import('./components/Projection'))
const Acompanhamentos = lazy(() => import('./components/Acompanhamentos'))
const AcompanhamentosView = lazy(() => import('./components/AcompanhamentosView'))
const AdminPanel = lazy(() => import('./components/AdminPanel'))
import { AuthProvider, useAuth } from './contexts/AuthContext'
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

type TabType = 'dashboard' | 'projects' | 'services' | 'reports' | 'metas' | 'transactions' | 'clients' | 'dre' | 'projecao' | 'acompanhamentos' | 'admin'

const AppContent: React.FC = () => {
  const { user, logout, isLoading } = useAuth();
  const [viewToken, setViewToken] = useState<string | null>(null);

  // Verificar se há token de visualização pública na URL
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const hash = window.location.hash.substring(1);
    const token = urlParams.get('token') || (hash.startsWith('view_') ? hash : null);
    
    if (token && token.startsWith('view_')) {
      setViewToken(token);
    }
  }, []);

  if (viewToken && viewToken.startsWith('view_')) {
    // Renderizar visualização pública sem autenticação
    return <AcompanhamentosView token={viewToken} />;
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-3"></div>
          <p className="text-gray-600">Carregando...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Login />;
  }

  return <AppMain user={user} logout={logout} />;
};

const AppMain: React.FC<{ user: any; logout: () => void }> = ({ user, logout }) => {
  const permissions = usePermissions();
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

  // Função auxiliar para calcular largura da barra de progresso de forma segura
  const calcularLarguraBarra = (valor: number, total: number, casasDecimais: number = 1): string => {
    const percentual = parseFloat(calcularPercentualSeguro(valor, total, casasDecimais))
    return percentual === 0 ? '0%' : `${Math.min(100, percentual)}%`
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

  // Função para calcular totais
  const calculateTotals = () => {
    const receitas = transactions.filter(t => t.type === 'Receita').reduce((s, t) => s + t.value, 0)
    const despesas = transactions.filter(t => t.type === 'Despesa').reduce((s, t) => s + t.value, 0)
    const resultado = receitas - despesas
    return { receitas, despesas, resultado }
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
    const currentYear = 2025
    const transacoesDoMes = transactions.filter(t => {
      const transactionDate = new Date(t.date)
      return transactionDate.getMonth() === monthIndex && transactionDate.getFullYear() === currentYear
    })
    const totalReceitas = transacoesDoMes.filter(t => t.type === 'Receita').reduce((sum, t) => sum + t.value, 0)
    
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
    const currentYear = 2025
    const transacoesDoMes = transactions.filter(t => {
      const transactionDate = new Date(t.date)
      return transactionDate.getMonth() === monthIndex && transactionDate.getFullYear() === currentYear
    })
    const totalDespesas = transacoesDoMes.filter(t => t.type === 'Despesa').reduce((sum, t) => sum + t.value, 0)
    
    // Meta de despesas para o mês (limite de 15.000 por mês)
    const metaDespesas = 15000
    
    const data = [
      { name: 'Alcançado', value: totalDespesas, color: '#ef4444' },
      { name: 'Limite Restante', value: Math.max(0, metaDespesas - totalDespesas), color: '#e5e7eb' }
    ]
    
    openChart(`Despesas - ${monthName}`, data, `Alcançado vs Limite de R$ ${metaDespesas.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`)
  }

  const openInvestimentosChart = (monthIndex: number, monthName: string) => {
    const currentYear = 2025
    const transacoesDoMes = transactions.filter(t => {
      const transactionDate = new Date(t.date)
      return transactionDate.getMonth() === monthIndex && transactionDate.getFullYear() === currentYear
    })
    const totalReceitas = transacoesDoMes.filter(t => t.type === 'Receita').reduce((sum, t) => sum + t.value, 0)
    const totalDespesas = transacoesDoMes.filter(t => t.type === 'Despesa').reduce((sum, t) => sum + t.value, 0)
    
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
    const currentYear = 2025
    const transacoesDoMes = transactions.filter(t => {
      const transactionDate = new Date(t.date)
      return transactionDate.getMonth() === monthIndex && transactionDate.getFullYear() === currentYear
    })
    const totalReceitas = transacoesDoMes.filter(t => t.type === 'Receita').reduce((sum, t) => sum + t.value, 0)
    
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
    const currentYear = 2025
    const transacoesDoAno = transactions.filter(t => {
      const transactionDate = new Date(t.date)
      return transactionDate.getFullYear() === currentYear
    })
    const totalReceitasAno = transacoesDoAno.filter(t => t.type === 'Receita').reduce((sum, t) => sum + t.value, 0)
    
    // Meta anual de faturamento (soma das metas mensais)
    const metasDoAno = [18500, 19200, 20100, 19800, 20500, 21000, 21500, 22000, 21889.17, 23000, 25000, 28000]
    const metaFaturamentoAnual = metasDoAno.reduce((sum, meta) => sum + meta, 0)
    
    const data = [
      { name: 'Alcançado', value: totalReceitasAno, color: '#10b981' },
      { name: 'Meta Restante', value: Math.max(0, metaFaturamentoAnual - totalReceitasAno), color: '#e5e7eb' }
    ]
    
    openChart('Faturamento Anual 2025', data, `Alcançado vs Meta Anual de R$ ${metaFaturamentoAnual.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`)
  }

  const openDespesasAnualChart = () => {
    const currentYear = 2025
    const transacoesDoAno = transactions.filter(t => {
      const transactionDate = new Date(t.date)
      return transactionDate.getFullYear() === currentYear
    })
    const totalDespesasAno = transacoesDoAno.filter(t => t.type === 'Despesa').reduce((sum, t) => sum + t.value, 0)
    
    // Meta anual de despesas (limite de 180.000 por ano)
    const metaDespesasAnual = 180000
    
    const data = [
      { name: 'Alcançado', value: totalDespesasAno, color: '#ef4444' },
      { name: 'Limite Restante', value: Math.max(0, metaDespesasAnual - totalDespesasAno), color: '#e5e7eb' }
    ]
    
    openChart('Despesas Anuais 2025', data, `Alcançado vs Limite Anual de R$ ${metaDespesasAnual.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`)
  }

  const openInvestimentosAnualChart = () => {
    const currentYear = 2025
    const transacoesDoAno = transactions.filter(t => {
      const transactionDate = new Date(t.date)
      return transactionDate.getFullYear() === currentYear
    })
    const totalReceitasAno = transacoesDoAno.filter(t => t.type === 'Receita').reduce((sum, t) => sum + t.value, 0)
    const totalDespesasAno = transacoesDoAno.filter(t => t.type === 'Despesa').reduce((sum, t) => sum + t.value, 0)
    
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
    
    openChart('Investimentos Anuais 2025', data, `Alcançado vs Metas Anuais: Gerais R$ ${metaInvestimentosGeraisAnual.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} | MKT R$ ${metaInvestimentosMktAnual.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`)
  }

  const openProgressoAnualChart = () => {
    const currentYear = 2025
    const transacoesDoAno = transactions.filter(t => {
      const transactionDate = new Date(t.date)
      return transactionDate.getFullYear() === currentYear
    })
    const totalReceitasAno = transacoesDoAno.filter(t => t.type === 'Receita').reduce((sum, t) => sum + t.value, 0)
    const metasDoAno = [18500, 19200, 20100, 19800, 20500, 21000, 21500, 22000, 21889.17, 23000, 25000, 28000]
    const metaTotalAno = metasDoAno.reduce((sum, meta) => sum + meta, 0)
    
    const data = [
      { name: 'Meta Anual Alcançada', value: totalReceitasAno, color: '#ec4899' },
      { name: 'Meta Anual Restante', value: Math.max(0, metaTotalAno - totalReceitasAno), color: '#f3f4f6' }
    ]
    
    openChart('Progresso da Meta Anual 2025', data, 'Progresso em relação à meta anual')
  }

  // NavigationBar
  const NavigationBar = () => (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-gradient-to-r from-blue-900 to-blue-800 shadow-lg">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-20 min-w-0">
          <div className="flex items-center">
            <div className="flex-shrink-0 flex items-center">
              <img src="/imp_logo.png" alt="IMPGEO Logo" className="h-8 w-8 mr-2 object-contain" />
              <div>
                <span className="text-white text-xl font-bold">IMPGEO</span>
                <p className="text-blue-200 text-sm">Sistema de Gestão Financeira</p>
              </div>
            </div>
          </div>
          <div className="flex items-center space-x-4 overflow-x-auto scrollbar-hide nav-scroll min-w-0 flex-1">
            <button onClick={() => setActiveTab('dashboard')} className={`px-3 py-3 rounded-md text-base font-bold transition-colors flex flex-col items-center justify-start ${activeTab === 'dashboard' ? 'bg-blue-700 text-white' : 'text-blue-200 hover:text-white hover:bg-blue-700'}`}>
              <Home className="h-4 w-4 mb-3" />
              Dashboard
            </button>
            <button onClick={() => setActiveTab('projects')} className={`px-3 py-3 rounded-md text-base font-bold transition-colors flex flex-col items-center justify-start ${activeTab === 'projects' ? 'bg-blue-700 text-white' : 'text-blue-200 hover:text-white hover:bg-blue-700'}`}>
              <Map className="h-4 w-4 mb-3" />
              Projetos
            </button>
            <button onClick={() => setActiveTab('services')} className={`px-3 py-3 rounded-md text-base font-bold transition-colors flex flex-col items-center justify-start ${activeTab === 'services' ? 'bg-blue-700 text-white' : 'text-blue-200 hover:text-white hover:bg-blue-700'}`}>
              <Target className="h-4 w-4 mb-3" />
              Serviços
            </button>
            <button onClick={() => setActiveTab('reports')} className={`px-3 py-3 rounded-md text-base font-bold transition-colors flex flex-col items-center justify-start ${activeTab === 'reports' ? 'bg-blue-700 text-white' : 'text-blue-200 hover:text-white hover:bg-blue-700'}`}>
              <BarChart3 className="h-4 w-4 mb-3" />
              Relatórios
            </button>
            <button onClick={() => setActiveTab('metas')} className={`px-3 py-3 rounded-md text-base font-bold transition-colors flex flex-col items-center justify-start ${activeTab === 'metas' ? 'bg-blue-700 text-white' : 'text-blue-200 hover:text-white hover:bg-blue-700'}`}>
              <TrendingUp className="h-4 w-4 mb-3" />
              Metas
            </button>
            <button onClick={() => setActiveTab('projecao')} className={`px-3 py-3 rounded-md text-base font-bold transition-colors flex flex-col items-center justify-start ${activeTab === 'projecao' ? 'bg-blue-700 text-white' : 'text-blue-200 hover:text-white hover:bg-blue-700'}`}>
              <Calculator className="h-4 w-4 mb-3" />
              <span className="text-center leading-tight">Projeção</span>
            </button>
            <button onClick={() => setActiveTab('transactions')} className={`px-3 py-3 rounded-md text-base font-bold transition-colors flex flex-col items-center justify-start ${activeTab === 'transactions' ? 'bg-blue-700 text-white' : 'text-blue-200 hover:text-white hover:bg-blue-700'}`}>
              <FileText className="h-4 w-4 mb-3" />
              Transações
            </button>
            <button onClick={() => setActiveTab('clients')} className={`px-3 py-3 rounded-md text-base font-bold transition-colors flex flex-col items-center justify-start ${activeTab === 'clients' ? 'bg-blue-700 text-white' : 'text-blue-200 hover:text-white hover:bg-blue-700'}`}>
              <Building className="h-4 w-4 mb-3" />
              Clientes
            </button>
            <button onClick={() => setActiveTab('dre')} className={`px-3 py-3 rounded-md text-base font-bold transition-colors flex flex-col items-center justify-start ${activeTab === 'dre' ? 'bg-blue-700 text-white' : 'text-blue-200 hover:text-white hover:bg-blue-700'}`}>
              <BarChart3 className="h-4 w-4 mb-3" />
              DRE
            </button>
            <button onClick={() => setActiveTab('acompanhamentos')} className={`px-3 py-3 rounded-md text-base font-bold transition-colors flex flex-col items-center justify-start ${activeTab === 'acompanhamentos' ? 'bg-blue-700 text-white' : 'text-blue-200 hover:text-white hover:bg-blue-700'}`}>
              <ClipboardList className="h-4 w-4 mb-3" />
              Acompanhamentos
            </button>
            {user.role === 'admin' && (
              <button onClick={() => setActiveTab('admin')} className={`px-3 py-3 rounded-md text-base font-bold transition-colors flex flex-col items-center justify-start ${activeTab === 'admin' ? 'bg-blue-700 text-white' : 'text-blue-200 hover:text-white hover:bg-blue-700'}`}>
                <Shield className="h-4 w-4 mb-3" />
                Admin
              </button>
            )}
          </div>
          <div className="flex items-center space-x-4">
            <div className="text-white text-sm">
              <span className="text-blue-200">Olá,</span> {user.username}
            </div>
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
      </div>
    </nav>
  )

  // Função para renderizar um mês completo (stub para manter referências)
  const renderMonth = (monthName: string, monthIndex: number) => {
    return (
      <div key={monthName} className="space-y-6 mb-32">
        <div className="bg-gradient-to-r from-blue-500 to-indigo-600 p-4 rounded-2xl shadow-lg">
          <h2 className="text-3xl font-bold text-white text-center uppercase tracking-wider">
            {monthName} - 2025
          </h2>
        </div>
        {renderMonthContent(monthName, monthIndex)}
      </div>
    )
  }

  // Conteúdo do mês (stub alinhado com referências existentes)
  const renderMonthContent = (_monthName: string, monthIndex: number) => {
    // Cálculos para o mês específico
    const currentYear = 2025
    const transacoesDoMes = transactions.filter(t => {
      const transactionDate = new Date(t.date)
      return transactionDate.getMonth() === monthIndex && transactionDate.getFullYear() === currentYear
    })

    const totalReceitas = transacoesDoMes.filter(t => t.type === 'Receita').reduce((sum, t) => sum + t.value, 0)
    const totalDespesas = transacoesDoMes.filter(t => t.type === 'Despesa').reduce((sum, t) => sum + t.value, 0)
    
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
    
    const receitasAnteriores = transacoesAnteriores.filter(t => t.type === 'Receita').reduce((sum, t) => sum + t.value, 0)
    const despesasAnteriores = transacoesAnteriores.filter(t => t.type === 'Despesa').reduce((sum, t) => sum + t.value, 0)
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

    return (
      <div className="space-y-6">
        {/* 1. RESULTADO */}
        <div className="space-y-4">
          <h2 className="text-xl font-bold text-gray-800 flex items-center gap-3">
            <PieChart className="w-6 h-6 text-gray-600" />
            Resultado
          </h2>
          
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Quadrante Financeiro */}
            <div className="bg-white/90 backdrop-blur-sm p-8 rounded-2xl shadow-lg border border-gray-200">
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
            <div className="bg-white/90 backdrop-blur-sm p-8 rounded-2xl shadow-lg border border-gray-200">
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
          <h2 className="text-xl font-bold text-emerald-800 flex items-center gap-3">
            <TrendingUp className="w-6 h-6 text-emerald-600" />
            Faturamento
          </h2>
          
          {/* Primeira linha: Total, REURB, GEO */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div 
              className="bg-gradient-to-br from-indigo-50 to-indigo-100 p-4 rounded-2xl border border-indigo-200 shadow-lg cursor-pointer hover:shadow-xl transition-all duration-300 hover:scale-105"
              onClick={() => openFaturamentoChart(monthIndex, mesesMetas[monthIndex].nome)}
            >
              <h3 className="text-base font-bold text-indigo-800 mb-3">Faturamento Total</h3>
              <div className="text-xl font-bold text-indigo-900 mb-3">
                R$ {totalReceitas.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </div>
              
              {/* Barra de Progresso */}
              <div className="mb-3">
                <div className="flex justify-between text-xs font-medium text-indigo-700 mb-3">
                  <span>Progresso</span>
                  <span>{calcularPercentualSeguro(totalReceitas, metaValue, 0)}%</span>
                </div>
                <div className="w-full bg-indigo-200 rounded-full h-2 relative">
                  {/* Barra base (0-100%) */}
                  <div 
                    className="bg-gradient-to-r from-indigo-500 to-indigo-600 h-2 rounded-full transition-all duration-300"
                    style={{ width: calcularLarguraBarra(totalReceitas, metaValue, 1) }}
                  ></div>
                  {/* Barra de excesso (>100%) */}
                  {parseFloat(calcularPercentualSeguro(totalReceitas, metaValue, 1)) > 100 && (
                    <div 
                      className="absolute top-0 left-0 bg-gradient-to-r from-indigo-700 to-indigo-800 h-2 rounded-full transition-all duration-300"
                      style={{ width: calcularLarguraBarra(Math.max(0, parseFloat(calcularPercentualSeguro(totalReceitas, metaValue, 1)) - 100), 100, 1) }}
                    ></div>
                  )}
                </div>
              </div>
              
              {/* Valores Alcançado/Restante */}
              <div className="text-xs text-indigo-700 font-medium">
                R$ {totalReceitas.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} / R$ {Math.max(0, metaValue - totalReceitas).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </div>
            </div>

            <div 
              className="bg-gradient-to-br from-emerald-50 to-emerald-100 p-4 rounded-2xl border border-emerald-200 shadow-lg cursor-pointer hover:shadow-xl transition-all duration-300 hover:scale-105"
              onClick={() => openFaturamentoChart(monthIndex, mesesMetas[monthIndex].nome)}
            >
              <h3 className="text-base font-bold text-emerald-800 mb-3">Faturamento REURB</h3>
              <div className="text-xl font-bold text-emerald-900 mb-3">
                R$ {(totalReceitas * 1.0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </div>
              
              {/* Barra de Progresso */}
              <div className="mb-3">
                <div className="flex justify-between text-xs font-medium text-emerald-700 mb-3">
                  <span>Progresso</span>
                  <span>{calcularPercentualSeguro(totalReceitas * 1.0, getFaturamentoValue('Reurb', monthIndex), 0)}%</span>
                </div>
                <div className="w-full bg-emerald-200 rounded-full h-2 relative">
                  {/* Barra base (0-100%) */}
                  <div 
                    className="bg-gradient-to-r from-emerald-500 to-emerald-600 h-2 rounded-full transition-all duration-300"
                    style={{ width: calcularLarguraBarra(totalReceitas * 1.0, getFaturamentoValue('Reurb', monthIndex), 1) }}
                  ></div>
                  {/* Barra de excesso (>100%) */}
                  {parseFloat(calcularPercentualSeguro(totalReceitas * 1.0, getFaturamentoValue('Reurb', monthIndex), 1)) > 100 && (
                    <div 
                      className="absolute top-0 left-0 bg-gradient-to-r from-emerald-700 to-emerald-800 h-2 rounded-full transition-all duration-300"
                      style={{ width: calcularLarguraBarra(Math.max(0, parseFloat(calcularPercentualSeguro(totalReceitas * 1.0, getFaturamentoValue('Reurb', monthIndex), 1)) - 100), 100, 1) }}
                    ></div>
                  )}
                </div>
              </div>
              
              {/* Valores Alcançado/Restante */}
              <div className="text-xs text-emerald-700 font-medium">
                R$ {(totalReceitas * 1.0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })} / R$ {Math.max(0, (getFaturamentoValue('Reurb', monthIndex)) - (totalReceitas * 1.0)).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </div>
            </div>

            <div 
              className="bg-gradient-to-br from-green-50 to-green-100 p-4 rounded-2xl border border-green-200 shadow-lg cursor-pointer hover:shadow-xl transition-all duration-300 hover:scale-105"
              onClick={() => openFaturamentoChart(monthIndex, mesesMetas[monthIndex].nome)}
            >
              <h3 className="text-base font-bold text-green-800 mb-3">Faturamento GEO</h3>
              <div className="text-xl font-bold text-green-900 mb-3">
                R$ {(totalReceitas * 0.8).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </div>
              
              {/* Barra de Progresso */}
              <div className="mb-3">
                <div className="flex justify-between text-xs font-medium text-green-700 mb-3">
                  <span>Progresso</span>
                  <span>{calcularPercentualSeguro(totalReceitas * 0.8, getFaturamentoValue('Geo', monthIndex), 0)}%</span>
                </div>
                <div className="w-full bg-green-200 rounded-full h-2 relative">
                  {/* Barra base (0-100%) */}
                  <div 
                    className="bg-gradient-to-r from-green-500 to-green-600 h-2 rounded-full transition-all duration-300"
                    style={{ width: calcularLarguraBarra(totalReceitas * 0.8, getFaturamentoValue('Geo', monthIndex), 1) }}
                  ></div>
                  {/* Barra de excesso (>100%) */}
                  {(((totalReceitas * 0.8) / (getFaturamentoValue('Geo', monthIndex))) * 100) > 100 && (
                    <div 
                      className="absolute top-0 left-0 bg-gradient-to-r from-green-700 to-green-800 h-2 rounded-full transition-all duration-300"
                      style={{ width: `${Math.min(100, ((((totalReceitas * 0.8) / (getFaturamentoValue('Geo', monthIndex))) * 100) - 100))}%` }}
                    ></div>
                  )}
                </div>
              </div>
              
              {/* Valores Alcançado/Restante */}
              <div className="text-xs text-green-700 font-medium">
                R$ {(totalReceitas * 0.8).toLocaleString('pt-BR', { minimumFractionDigits: 2 })} / R$ {Math.max(0, (getFaturamentoValue('Geo', monthIndex)) - (totalReceitas * 0.8)).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </div>
            </div>
          </div>
          
          {/* Segunda linha: PLAN, REG, NN */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div 
              className="bg-gradient-to-br from-teal-50 to-teal-100 p-4 rounded-2xl border border-teal-200 shadow-lg cursor-pointer hover:shadow-xl transition-all duration-300 hover:scale-105"
              onClick={() => openFaturamentoChart(monthIndex, mesesMetas[monthIndex].nome)}
            >
              <h3 className="text-base font-bold text-teal-800 mb-3">Faturamento PLAN</h3>
              <div className="text-xl font-bold text-teal-900 mb-3">
                R$ {(totalReceitas * 0.6).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </div>
              
              {/* Barra de Progresso */}
              <div className="mb-3">
                <div className="flex justify-between text-xs font-medium text-teal-700 mb-3">
                  <span>Progresso</span>
                  <span>{calcularPercentualSeguro(totalReceitas * 0.6, getFaturamentoValue('Plan', monthIndex), 0)}%</span>
                </div>
                <div className="w-full bg-teal-200 rounded-full h-2 relative">
                  {/* Barra base (0-100%) */}
                  <div 
                    className="bg-gradient-to-r from-teal-500 to-teal-600 h-2 rounded-full transition-all duration-300"
                    style={{ width: calcularLarguraBarra(totalReceitas * 0.6, getFaturamentoValue('Plan', monthIndex), 1) }}
                  ></div>
                  {/* Barra de excesso (>100%) */}
                  {(((totalReceitas * 0.6) / (getFaturamentoValue('Plan', monthIndex))) * 100) > 100 && (
                    <div 
                      className="absolute top-0 left-0 bg-gradient-to-r from-teal-700 to-teal-800 h-2 rounded-full transition-all duration-300"
                      style={{ width: `${Math.min(100, ((((totalReceitas * 0.6) / (getFaturamentoValue('Plan', monthIndex))) * 100) - 100))}%` }}
                    ></div>
                  )}
                </div>
              </div>
              
              {/* Valores Alcançado/Restante */}
              <div className="text-xs text-teal-700 font-medium">
                R$ {(totalReceitas * 0.6).toLocaleString('pt-BR', { minimumFractionDigits: 2 })} / R$ {Math.max(0, (getFaturamentoValue('Plan', monthIndex)) - (totalReceitas * 0.6)).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </div>
            </div>

            <div 
              className="bg-gradient-to-br from-cyan-50 to-cyan-100 p-4 rounded-2xl border border-cyan-200 shadow-lg cursor-pointer hover:shadow-xl transition-all duration-300 hover:scale-105"
              onClick={() => openFaturamentoChart(monthIndex, mesesMetas[monthIndex].nome)}
            >
              <h3 className="text-base font-bold text-cyan-800 mb-3">Faturamento REG</h3>
              <div className="text-xl font-bold text-cyan-900 mb-3">
                R$ {(totalReceitas * 0.4).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </div>
              
              {/* Barra de Progresso */}
              <div className="mb-3">
                <div className="flex justify-between text-xs font-medium text-cyan-700 mb-3">
                  <span>Progresso</span>
                  <span>{calcularPercentualSeguro(totalReceitas * 0.4, getFaturamentoValue('Reg', monthIndex), 0)}%</span>
                </div>
                <div className="w-full bg-cyan-200 rounded-full h-2 relative">
                  {/* Barra base (0-100%) */}
                  <div 
                    className="bg-gradient-to-r from-cyan-500 to-cyan-600 h-2 rounded-full transition-all duration-300"
                    style={{ width: calcularLarguraBarra(totalReceitas * 0.4, getFaturamentoValue('Reg', monthIndex), 1) }}
                  ></div>
                  {/* Barra de excesso (>100%) */}
                  {(((totalReceitas * 0.4) / (getFaturamentoValue('Reg', monthIndex))) * 100) > 100 && (
                    <div 
                      className="absolute top-0 left-0 bg-gradient-to-r from-cyan-700 to-cyan-800 h-2 rounded-full transition-all duration-300"
                      style={{ width: `${Math.min(100, ((((totalReceitas * 0.4) / (getFaturamentoValue('Reg', monthIndex))) * 100) - 100))}%` }}
                    ></div>
                  )}
                </div>
              </div>
              
              {/* Valores Alcançado/Restante */}
              <div className="text-xs text-cyan-700 font-medium">
                R$ {(totalReceitas * 0.4).toLocaleString('pt-BR', { minimumFractionDigits: 2 })} / R$ {Math.max(0, (getFaturamentoValue('Reg', monthIndex)) - (totalReceitas * 0.4)).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </div>
            </div>

            <div 
              className="bg-gradient-to-br from-pink-50 to-pink-100 p-4 rounded-2xl border border-pink-200 shadow-lg cursor-pointer hover:shadow-xl transition-all duration-300 hover:scale-105"
              onClick={() => openFaturamentoChart(monthIndex, mesesMetas[monthIndex].nome)}
            >
              <h3 className="text-base font-bold text-pink-800 mb-3">Faturamento NN</h3>
              <div className="text-xl font-bold text-pink-900 mb-3">
                R$ {(totalReceitas * 0.2).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </div>
              
              {/* Barra de Progresso */}
              <div className="mb-3">
                <div className="flex justify-between text-xs font-medium text-pink-700 mb-3">
                  <span>Progresso</span>
                  <span>{calcularPercentualSeguro(totalReceitas * 0.2, getFaturamentoValue('Nn', monthIndex), 0)}%</span>
                </div>
                <div className="w-full bg-pink-200 rounded-full h-2 relative">
                  {/* Barra base (0-100%) */}
                  <div 
                    className="bg-gradient-to-r from-pink-500 to-pink-600 h-2 rounded-full transition-all duration-300"
                    style={{ width: calcularLarguraBarra(totalReceitas * 0.2, getFaturamentoValue('Nn', monthIndex), 1) }}
                  ></div>
                  {/* Barra de excesso (>100%) */}
                  {(((totalReceitas * 0.2) / (getFaturamentoValue('Nn', monthIndex))) * 100) > 100 && (
                    <div 
                      className="absolute top-0 left-0 bg-gradient-to-r from-pink-700 to-pink-800 h-2 rounded-full transition-all duration-300"
                      style={{ width: `${Math.min(100, ((((totalReceitas * 0.2) / (getFaturamentoValue('Nn', monthIndex))) * 100) - 100))}%` }}
                    ></div>
                  )}
                </div>
              </div>
              
              {/* Valores Alcançado/Restante */}
              <div className="text-xs text-pink-700 font-medium">
                R$ {(totalReceitas * 0.2).toLocaleString('pt-BR', { minimumFractionDigits: 2 })} / R$ {Math.max(0, (getFaturamentoValue('Nn', monthIndex)) - (totalReceitas * 0.2)).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </div>
            </div>
          </div>
        </div>

        {/* 3. DESPESAS */}
        <div className="space-y-4">
          <h2 className="text-xl font-bold text-red-800 flex items-center gap-3">
            <TrendingDown className="w-6 h-6 text-red-600" />
            Despesas
          </h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <div 
              className="bg-gradient-to-br from-red-50 to-red-100 p-4 rounded-2xl border border-red-200 shadow-lg cursor-pointer hover:shadow-xl transition-all duration-300 hover:scale-105"
              onClick={() => openDespesasChart(monthIndex, mesesMetas[monthIndex].nome)}
            >
              <h3 className="text-base font-bold text-red-800 mb-3">Despesas TOTAL</h3>
              <div className="text-xl font-bold text-red-900 mb-3">
                R$ {totalDespesas.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </div>
              
              {/* Barra de Progresso (Para despesas, menos é melhor) */}
              <div className="mb-3">
                <div className="flex justify-between text-xs font-medium text-red-700 mb-3">
                  <span>Limite</span>
                  <span>{calcularPercentualSeguro(totalDespesas, getBudgetValue(monthIndex), 0)}%</span>
                </div>
                <div className="w-full bg-red-200 rounded-full h-2 relative">
                  {/* Barra base (0-100%) */}
                  <div 
                    className="bg-gradient-to-r from-red-500 to-red-600 h-2 rounded-full transition-all duration-300"
                    style={{ width: calcularLarguraBarra(totalDespesas, getBudgetValue(monthIndex), 1) }}
                  ></div>
                  {/* Barra de excesso (>100%) */}
                  {((totalDespesas / getBudgetValue(monthIndex)) * 100) > 100 && (
                    <div 
                      className="absolute top-0 left-0 bg-gradient-to-r from-red-700 to-red-900 h-2 rounded-full transition-all duration-300"
                      style={{ width: `${Math.min(100, (((totalDespesas / getBudgetValue(monthIndex)) * 100) - 100))}%` }}
                    ></div>
                  )}
                </div>
              </div>
              
              {/* Valores Usado/Restante */}
              <div className="text-xs text-red-700 font-medium">
                R$ {totalDespesas.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} / R$ {Math.max(0, getBudgetValue(monthIndex) - totalDespesas).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </div>
            </div>

            <div 
              className="bg-gradient-to-br from-orange-50 to-orange-100 p-4 rounded-2xl border border-orange-200 shadow-lg cursor-pointer hover:shadow-xl transition-all duration-300 hover:scale-105"
              onClick={() => openDespesasChart(monthIndex, mesesMetas[monthIndex].nome)}
            >
              <h3 className="text-base font-bold text-orange-800 mb-3">Despesas Variáveis</h3>
              <div className="text-xl font-bold text-orange-900 mb-3">
                R$ {(totalDespesas * 0.7).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </div>
              
              {/* Barra de Progresso */}
              <div className="mb-3">
                <div className="flex justify-between text-xs font-medium text-orange-700 mb-3">
                  <span>Limite</span>
                  <span>{calcularPercentualSeguro(totalDespesas * 0.7, getVariableExpensesValue(monthIndex), 0)}%</span>
                </div>
                <div className="w-full bg-orange-200 rounded-full h-2 relative">
                  {/* Barra base (0-100%) */}
                  <div 
                    className="bg-gradient-to-r from-orange-500 to-orange-600 h-2 rounded-full transition-all duration-300"
                    style={{ width: calcularLarguraBarra(totalDespesas * 0.7, getVariableExpensesValue(monthIndex), 1) }}
                  ></div>
                  {/* Barra de excesso (>100%) */}
                  {(((totalDespesas * 0.7) / getVariableExpensesValue(monthIndex)) * 100) > 100 && (
                    <div 
                      className="absolute top-0 left-0 bg-gradient-to-r from-orange-700 to-orange-900 h-2 rounded-full transition-all duration-300"
                      style={{ width: `${Math.min(100, ((((totalDespesas * 0.7) / getVariableExpensesValue(monthIndex)) * 100) - 100))}%` }}
                    ></div>
                  )}
                </div>
              </div>
              
              {/* Valores Usado/Restante */}
              <div className="text-xs text-orange-700 font-medium">
                R$ {(totalDespesas * 0.7).toLocaleString('pt-BR', { minimumFractionDigits: 2 })} / R$ {Math.max(0, getVariableExpensesValue(monthIndex) - (totalDespesas * 0.7)).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </div>
            </div>

            <div 
              className="bg-gradient-to-br from-amber-50 to-amber-100 p-4 rounded-2xl border border-amber-200 shadow-lg cursor-pointer hover:shadow-xl transition-all duration-300 hover:scale-105"
              onClick={() => openDespesasChart(monthIndex, mesesMetas[monthIndex].nome)}
            >
              <h3 className="text-base font-bold text-amber-800 mb-3">Despesas Fixas</h3>
              <div className="text-xl font-bold text-amber-900 mb-3">
                R$ {getFixedExpensesValue(monthIndex).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </div>
              
              {/* Barra de Progresso */}
              <div className="mb-3">
                <div className="flex justify-between text-xs font-medium text-amber-700 mb-3">
                  <span>Progresso</span>
                  <span>{calcularPercentualSeguro(totalDespesas * 0.25, Math.max(getFixedExpensesValue(monthIndex), 1), 0)}%</span>
                </div>
                <div className="w-full bg-amber-200 rounded-full h-2 relative">
                  {/* Barra base (0-100%) */}
                  <div 
                    className="bg-gradient-to-r from-amber-500 to-amber-600 h-2 rounded-full transition-all duration-300"
                    style={{ width: calcularLarguraBarra(totalDespesas * 0.25, Math.max(getFixedExpensesValue(monthIndex), 1), 1) }}
                  ></div>
                  {/* Barra de excesso (>100%) */}
                  {((totalDespesas * 0.25) / Math.max(getFixedExpensesValue(monthIndex), 1) * 100) > 100 && (
                    <div 
                      className="absolute top-0 left-0 bg-gradient-to-r from-amber-700 to-amber-900 h-2 rounded-full transition-all duration-300"
                      style={{ width: `${Math.min(100, (((totalDespesas * 0.25) / Math.max(getFixedExpensesValue(monthIndex), 1) * 100) - 100))}%` }}
                    ></div>
                  )}
                </div>
              </div>
              
              {/* Valores Realizado/Meta */}
              <div className="text-xs text-amber-700 font-medium">
                R$ {(totalDespesas * 0.25).toLocaleString('pt-BR', { minimumFractionDigits: 2 })} / R$ {getFixedExpensesValue(monthIndex).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </div>
            </div>
          </div>
        </div>

        {/* 4. INVESTIMENTOS */}
        <div className="space-y-4">
          <h2 className="text-xl font-bold text-indigo-800 flex items-center gap-3">
            <ArrowUpCircle className="w-6 h-6 text-indigo-600" />
            Investimentos
          </h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div 
              className="bg-gradient-to-br from-blue-50 to-blue-100 p-4 rounded-2xl border border-blue-200 shadow-lg cursor-pointer hover:shadow-xl transition-all duration-300 hover:scale-105"
              onClick={() => openInvestimentosChart(monthIndex, mesesMetas[monthIndex].nome)}
            >
              <h3 className="text-base font-bold text-blue-800 mb-3">Investimentos Gerais</h3>
              <div className="text-xl font-bold text-blue-900 mb-3">
                R$ {(totalDespesas * 0.05).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </div>
              
              {/* Barra de Progresso */}
              <div className="mb-3">
                <div className="flex justify-between text-xs font-medium text-blue-700 mb-3">
                  <span>Meta</span>
                  <span>{calcularPercentualSeguro(totalDespesas * 0.05, getInvestimentoValue('investimentos', monthIndex), 0)}%</span>
                </div>
                <div className="w-full bg-blue-200 rounded-full h-2 relative">
                  {/* Barra base (0-100%) */}
                  <div 
                    className="bg-gradient-to-r from-blue-500 to-blue-600 h-2 rounded-full transition-all duration-300"
                    style={{ width: calcularLarguraBarra(totalDespesas * 0.05, getInvestimentoValue('investimentos', monthIndex), 1) }}
                  ></div>
                  {/* Barra de excesso (>100%) */}
                  {parseFloat(calcularPercentualSeguro(totalDespesas * 0.05, getInvestimentoValue('investimentos', monthIndex), 1)) > 100 && (
                    <div 
                      className="absolute top-0 left-0 bg-gradient-to-r from-blue-700 to-blue-900 h-2 rounded-full transition-all duration-300"
                      style={{ width: `${Math.min(100, parseFloat(calcularPercentualSeguro(totalDespesas * 0.05, getInvestimentoValue('investimentos', monthIndex), 1)) - 100)}%` }}
                    ></div>
                  )}
                </div>
              </div>
              
              {/* Valores Alcançado/Restante */}
              <div className="text-xs text-blue-700 font-medium">
                R$ {(totalDespesas * 0.05).toLocaleString('pt-BR', { minimumFractionDigits: 2 })} / R$ {Math.max(0, getInvestimentoValue('investimentos', monthIndex) - (totalDespesas * 0.05)).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </div>
            </div>

            <div 
              className="bg-gradient-to-br from-purple-50 to-purple-100 p-4 rounded-2xl border border-purple-200 shadow-lg cursor-pointer hover:shadow-xl transition-all duration-300 hover:scale-105"
              onClick={() => openInvestimentosChart(monthIndex, mesesMetas[monthIndex].nome)}
            >
              <h3 className="text-base font-bold text-purple-800 mb-3">Investimentos em MKT</h3>
              <div className="text-xl font-bold text-purple-900 mb-3">
                R$ {(totalReceitas * 0.1).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </div>
              
              {/* Barra de Progresso */}
              <div className="mb-3">
                <div className="flex justify-between text-xs font-medium text-purple-700 mb-3">
                  <span>Meta</span>
                  <span>{calcularPercentualSeguro(totalReceitas * 0.1, getInvestimentoValue('mkt', monthIndex), 0)}%</span>
                </div>
                <div className="w-full bg-purple-200 rounded-full h-2 relative">
                  {/* Barra base (0-100%) */}
                  <div 
                    className="bg-gradient-to-r from-purple-500 to-purple-600 h-2 rounded-full transition-all duration-300"
                    style={{ width: calcularLarguraBarra(totalReceitas * 0.1, getInvestimentoValue('mkt', monthIndex), 1) }}
                  ></div>
                  {/* Barra de excesso (>100%) */}
                  {parseFloat(calcularPercentualSeguro(totalReceitas * 0.1, getInvestimentoValue('mkt', monthIndex), 1)) > 100 && (
                    <div 
                      className="absolute top-0 left-0 bg-gradient-to-r from-purple-700 to-purple-900 h-2 rounded-full transition-all duration-300"
                      style={{ width: `${Math.min(100, parseFloat(calcularPercentualSeguro(totalReceitas * 0.1, getInvestimentoValue('mkt', monthIndex), 1)) - 100)}%` }}
                    ></div>
                  )}
                </div>
              </div>
              
              {/* Valores Alcançado/Restante */}
              <div className="text-xs text-purple-700 font-medium">
                R$ {(totalReceitas * 0.1).toLocaleString('pt-BR', { minimumFractionDigits: 2 })} / R$ {Math.max(0, getInvestimentoValue('mkt', monthIndex) - (totalReceitas * 0.1)).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </div>
            </div>
          </div>
        </div>

        {/* 5. PROGRESSO VISUAL */}
        <div className="space-y-4">
          <h2 className="text-xl font-bold text-cyan-800 flex items-center gap-3">
            <BarChart3 className="w-6 h-6 text-blue-600" />
            Progresso Visual
          </h2>
          
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Gráfico de Pizza */}
            <div 
              className="bg-gradient-to-br from-pink-50 to-rose-50 p-4 rounded-2xl border border-pink-200 shadow-lg cursor-pointer hover:shadow-xl transition-all duration-300 hover:scale-105"
              onClick={() => openProgressoChart(monthIndex, mesesMetas[monthIndex].nome)}
            >
              <h3 className="text-base font-bold text-rose-800 mb-3">Distribuição de Receitas</h3>
              <div className="flex items-center justify-center h-48">
                <div className="relative w-32 h-32">
                  {/* Círculo base */}
                  <div className="absolute inset-0 rounded-full border-8 border-pink-200"></div>
                  {/* Círculo de progresso */}
                  <div 
                    className="absolute inset-0 rounded-full border-8 border-transparent border-t-pink-500 border-r-pink-500 transition-all duration-500"
                    style={{ 
                      transform: `rotate(${((totalReceitas / metaValue) * 360)}deg)`,
                      clipPath: totalReceitas >= metaValue ? 'none' : 'polygon(50% 0%, 100% 0%, 100% 100%, 50% 100%)'
                    }}
                  ></div>
                  {/* Texto central */}
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="text-center">
                      <div className="text-xl font-bold text-rose-800">
                        {calcularPercentualSeguro(totalReceitas, metaValue, 0)}%
                      </div>
                      <div className="text-xs text-rose-600 font-medium">Alcançado</div>
                    </div>
                  </div>
                </div>
              </div>
              <div className="text-center text-xs text-rose-700 font-medium">
                R$ {totalReceitas.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} de R$ {metaValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </div>
            </div>

            {/* Barra de Progresso Linear */}
            <div 
              className="bg-gradient-to-br from-sky-50 to-blue-50 p-4 rounded-2xl border border-sky-200 shadow-lg cursor-pointer hover:shadow-xl transition-all duration-300 hover:scale-105"
              onClick={() => openProgressoChart(monthIndex, mesesMetas[monthIndex].nome)}
            >
              <h3 className="text-base font-bold text-sky-800 mb-3">Progresso Linear</h3>
              <div className="space-y-4">
                <div className="text-center">
                  <div className="text-3xl font-bold text-sky-900 mb-3">
                    {calcularPercentualSeguro(totalReceitas, metaValue, 1)}%
                  </div>
                  <div className="text-xs text-sky-700">Meta Alcançada</div>
                </div>
                
                <div className="w-full bg-sky-200 rounded-full h-4 relative overflow-hidden">
                  <div 
                    className="bg-gradient-to-r from-sky-500 to-blue-500 h-4 rounded-full transition-all duration-500 relative"
                    style={{ width: `${Math.min(100, ((totalReceitas / metaValue) * 100))}%` }}
                  >
                    {/* Efeito de brilho */}
                    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white to-transparent opacity-30 animate-pulse"></div>
                  </div>
                </div>
                
                <div className="flex justify-between text-xs text-cyan-700 font-medium">
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
    const currentYear = 2025
    
    // Cálculos totais do ano
    const transacoesDoAno = transactions.filter(t => {
      const transactionDate = new Date(t.date)
      return transactionDate.getFullYear() === currentYear
    })

    const totalReceitasAno = transacoesDoAno.filter(t => t.type === 'Receita').reduce((sum, t) => sum + t.value, 0)
    const totalDespesasAno = transacoesDoAno.filter(t => t.type === 'Despesa').reduce((sum, t) => sum + t.value, 0)

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
    
    const receitasAnosAnteriores = transacoesAnosAnteriores.filter(t => t.type === 'Receita').reduce((sum, t) => sum + t.value, 0)
    const despesasAnosAnteriores = transacoesAnosAnteriores.filter(t => t.type === 'Despesa').reduce((sum, t) => sum + t.value, 0)
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
        <div className="bg-gradient-to-r from-purple-500 to-indigo-600 p-8 rounded-2xl shadow-xl">
          <h2 className="text-4xl font-bold text-white text-center uppercase tracking-wider">
            TOTAL DO ANO - 2025
          </h2>
        </div>

        {/* 1. RESULTADO ANUAL */}
        <div className="space-y-4">
          <h2 className="text-3xl font-bold text-pink-800 flex items-center gap-3">
            <PieChart className="w-8 h-8 text-purple-600" />
            Resultado Anual
          </h2>
          
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Quadrante Financeiro Anual */}
            <div className="bg-gradient-to-br from-purple-50 to-indigo-50 p-8 rounded-2xl shadow-lg border-2 border-purple-200">
              <div className="space-y-4">
                {/* REFORÇO DE CAIXA */}
                <div className="flex justify-between items-center py-3 border-b-2 border-purple-200">
                  <span className="font-bold text-pink-800 text-lg">REFORÇO DE CAIXA</span>
                  <span className="font-bold text-pink-900 text-lg">R$ {reforcoCaixaAno.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
              </div>
                
                {/* SAÍDA DE CAIXA */}
                <div className="flex justify-between items-center py-3 border-b-2 border-purple-200">
                  <span className="font-bold text-pink-800 text-lg">SAÍDA DE CAIXA</span>
                  <span className="font-bold text-pink-900 text-lg">R$ {saidaCaixaAno.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
            </div>
                
                {/* RECEITA ANUAL */}
                <div className="flex justify-between items-center py-3 border-b-2 border-purple-200">
                  <span className="font-bold text-emerald-700 text-lg">RECEITA ANUAL</span>
                  <span className="font-bold text-emerald-800 text-lg">
                    R$ {totalReceitasAno.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </span>
          </div>
                
                {/* DESPESA ANUAL */}
                <div className="flex justify-between items-center py-3 border-b-2 border-purple-200">
                  <span className="font-bold text-red-700 text-lg">DESPESA ANUAL</span>
                  <span className="font-bold text-red-800 text-lg">
                    -R$ {totalDespesasAno.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </span>
                </div>
                
                {/* SALDO INICIAL */}
                <div className="flex justify-between items-center py-3 border-b-2 border-purple-200">
                  <span className="font-bold text-cyan-700 text-lg">SALDO INICIAL</span>
                  <span className="font-bold text-cyan-800 text-lg">R$ {saldoInicialAno.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                </div>
                
                {/* TOTAL GERAL ANUAL */}
                <div className="flex justify-between items-center py-6 bg-gradient-to-r from-purple-100 to-indigo-100 px-6 rounded-xl border-3 border-purple-400 mt-6">
                  <span className="font-bold text-pink-900 text-2xl">Total Geral Anual</span>
                  <span className={`font-bold text-2xl ${
                    (saldoInicialAno + totalReceitasAno - totalDespesasAno) >= 0 ? 'text-emerald-800' : 'text-red-800'
                  }`}>
                    R$ {(saldoInicialAno + totalReceitasAno - totalDespesasAno).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </span>
                </div>
              </div>
            </div>

            {/* Quadrante META ANUAL */}
            <div className="bg-gradient-to-br from-purple-50 to-indigo-50 p-8 rounded-2xl shadow-lg border-2 border-purple-200">
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
                <div className="grid grid-cols-3 gap-4 pb-2 border-b-2 border-purple-300">
                  <div className="text-center">
                    <span className="font-bold text-purple-600 text-lg"></span>
                  </div>
                  <div className="text-center">
                    <span className="font-bold text-pink-800 text-xl">R$</span>
                  </div>
                  <div className="text-center">
                    <span className="font-bold text-pink-800 text-xl">%</span>
                  </div>
                </div>
                
                {/* META ANUAL */}
                <div className="grid grid-cols-3 gap-4 py-3 border-b border-purple-200">
                  <div className="font-bold text-pink-800 italic text-lg">META ANUAL</div>
                  <div className="text-center font-bold text-pink-900 text-lg">R$ {metaTotalAno.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</div>
                  <div className="text-center font-bold text-pink-900 text-lg">100%</div>
                </div>
                
                {/* ALCANÇADO ANUAL */}
                <div className="grid grid-cols-3 gap-4 py-3 border-b border-purple-200">
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
          <h2 className="text-3xl font-bold text-emerald-800 flex items-center gap-3">
            <TrendingUp className="w-8 h-8 text-emerald-600" />
            Faturamento Anual
          </h2>
          
          {/* Primeira linha: Total, REURB, GEO */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div 
              className="bg-gradient-to-br from-indigo-50 to-indigo-100 p-4 rounded-2xl border border-indigo-200 shadow-lg cursor-pointer hover:shadow-xl transition-all duration-300 hover:scale-105"
              onClick={() => openFaturamentoAnualChart()}
            >
              <h3 className="text-base font-bold text-indigo-800 mb-3">Faturamento Total Anual</h3>
              <div className="text-xl font-bold text-indigo-900 mb-3">
                R$ {totalReceitasAno.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </div>
              
              {/* Barra de Progresso */}
              <div className="mb-3">
                <div className="flex justify-between text-xs font-medium text-indigo-700 mb-3">
                  <span>Progresso</span>
                  <span>{calcularPercentualSeguro(totalReceitasAno, metaTotalAno, 0)}%</span>
                </div>
                <div className="w-full bg-indigo-200 rounded-full h-2 relative">
                  {/* Barra base (0-100%) */}
                  <div 
                    className="bg-gradient-to-r from-indigo-500 to-indigo-600 h-2 rounded-full transition-all duration-300"
                    style={{ width: calcularLarguraBarra(totalReceitasAno, metaTotalAno, 1) }}
                  ></div>
                  {/* Barra de excesso (>100%) */}
                  {((totalReceitasAno / metaTotalAno) * 100) > 100 && (
                    <div 
                      className="absolute top-0 left-0 bg-gradient-to-r from-indigo-700 to-indigo-800 h-2 rounded-full transition-all duration-300"
                      style={{ width: `${Math.min(100, (((totalReceitasAno / metaTotalAno) * 100) - 100))}%` }}
                    ></div>
                  )}
                </div>
              </div>
              
              {/* Valores Alcançado/Restante */}
              <div className="text-xs text-indigo-700 font-medium">
                R$ {totalReceitasAno.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} / R$ {Math.max(0, metaTotalAno - totalReceitasAno).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </div>
            </div>

            <div 
              className="bg-gradient-to-br from-emerald-50 to-emerald-100 p-4 rounded-2xl border border-emerald-200 shadow-lg cursor-pointer hover:shadow-xl transition-all duration-300 hover:scale-105"
              onClick={() => openFaturamentoAnualChart()}
            >
              <h3 className="text-base font-bold text-emerald-800 mb-3">Faturamento REURB Anual</h3>
              <div className="text-xl font-bold text-emerald-900 mb-3">
                R$ {(totalReceitasAno * 1.0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </div>
              
              {/* Barra de Progresso */}
              <div className="mb-3">
                <div className="flex justify-between text-xs font-medium text-emerald-700 mb-3">
                  <span>Progresso</span>
                  <span>{calcularPercentualSeguro(totalReceitasAno, metaTotalAno, 0)}%</span>
                </div>
                <div className="w-full bg-emerald-200 rounded-full h-2 relative">
                  {/* Barra base (0-100%) */}
                  <div 
                    className="bg-gradient-to-r from-emerald-500 to-emerald-600 h-2 rounded-full transition-all duration-300"
                    style={{ width: calcularLarguraBarra(totalReceitasAno, metaTotalAno, 1) }}
                  ></div>
                  {/* Barra de excesso (>100%) */}
                  {(((totalReceitasAno * 1.0) / (metaTotalAno * 1.0)) * 100) > 100 && (
                    <div 
                      className="absolute top-0 left-0 bg-gradient-to-r from-emerald-700 to-emerald-800 h-2 rounded-full transition-all duration-300"
                      style={{ width: `${Math.min(100, ((((totalReceitasAno * 1.0) / (metaTotalAno * 1.0)) * 100) - 100))}%` }}
                    ></div>
                  )}
                </div>
              </div>
              
              {/* Valores Alcançado/Restante */}
              <div className="text-xs text-emerald-700 font-medium">
                R$ {(totalReceitasAno * 1.0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })} / R$ {Math.max(0, (metaTotalAno * 1.0) - (totalReceitasAno * 1.0)).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </div>
            </div>

            <div 
              className="bg-gradient-to-br from-green-50 to-green-100 p-4 rounded-2xl border border-green-200 shadow-lg cursor-pointer hover:shadow-xl transition-all duration-300 hover:scale-105"
              onClick={() => openFaturamentoAnualChart()}
            >
              <h3 className="text-base font-bold text-green-800 mb-3">Faturamento GEO Anual</h3>
              <div className="text-xl font-bold text-green-900 mb-3">
                R$ {(totalReceitasAno * 0.8).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </div>
              
              {/* Barra de Progresso */}
              <div className="mb-3">
                <div className="flex justify-between text-xs font-medium text-green-700 mb-3">
                  <span>Progresso</span>
                  <span>{calcularPercentualSeguro(totalReceitasAno, metaTotalAno, 0)}%</span>
                </div>
                <div className="w-full bg-green-200 rounded-full h-2 relative">
                  {/* Barra base (0-100%) */}
                  <div 
                    className="bg-gradient-to-r from-green-500 to-green-600 h-2 rounded-full transition-all duration-300"
                    style={{ width: calcularLarguraBarra(totalReceitasAno, metaTotalAno, 1) }}
                  ></div>
                  {/* Barra de excesso (>100%) */}
                  {(((totalReceitasAno * 0.8) / (metaTotalAno * 0.8)) * 100) > 100 && (
                    <div 
                      className="absolute top-0 left-0 bg-gradient-to-r from-green-700 to-green-800 h-2 rounded-full transition-all duration-300"
                      style={{ width: `${Math.min(100, ((((totalReceitasAno * 0.8) / (metaTotalAno * 0.8)) * 100) - 100))}%` }}
                    ></div>
                  )}
                </div>
              </div>
              
              {/* Valores Alcançado/Restante */}
              <div className="text-xs text-green-700 font-medium">
                R$ {(totalReceitasAno * 0.8).toLocaleString('pt-BR', { minimumFractionDigits: 2 })} / R$ {Math.max(0, (metaTotalAno * 0.8) - (totalReceitasAno * 0.8)).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </div>
            </div>
          </div>
          
          {/* Segunda linha: PLAN, REG, NN */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div 
              className="bg-gradient-to-br from-teal-50 to-teal-100 p-4 rounded-2xl border border-teal-200 shadow-lg cursor-pointer hover:shadow-xl transition-all duration-300 hover:scale-105"
              onClick={() => openFaturamentoAnualChart()}
            >
              <h3 className="text-base font-bold text-teal-800 mb-3">Faturamento PLAN Anual</h3>
              <div className="text-xl font-bold text-teal-900 mb-3">
                R$ {(totalReceitasAno * 0.6).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </div>
              
              {/* Barra de Progresso */}
              <div className="mb-3">
                <div className="flex justify-between text-xs font-medium text-teal-700 mb-3">
                  <span>Progresso</span>
                  <span>{calcularPercentualSeguro(totalReceitasAno, metaTotalAno, 0)}%</span>
                </div>
                <div className="w-full bg-teal-200 rounded-full h-2 relative">
                  {/* Barra base (0-100%) */}
                  <div 
                    className="bg-gradient-to-r from-teal-500 to-teal-600 h-2 rounded-full transition-all duration-300"
                    style={{ width: calcularLarguraBarra(totalReceitasAno, metaTotalAno, 1) }}
                  ></div>
                  {/* Barra de excesso (>100%) */}
                  {(((totalReceitasAno * 0.6) / (metaTotalAno * 0.6)) * 100) > 100 && (
                    <div 
                      className="absolute top-0 left-0 bg-gradient-to-r from-teal-700 to-teal-800 h-2 rounded-full transition-all duration-300"
                      style={{ width: `${Math.min(100, ((((totalReceitasAno * 0.6) / (metaTotalAno * 0.6)) * 100) - 100))}%` }}
                    ></div>
                  )}
                </div>
              </div>
              
              {/* Valores Alcançado/Restante */}
              <div className="text-xs text-teal-700 font-medium">
                R$ {(totalReceitasAno * 0.6).toLocaleString('pt-BR', { minimumFractionDigits: 2 })} / R$ {Math.max(0, (metaTotalAno * 0.6) - (totalReceitasAno * 0.6)).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </div>
            </div>

            <div 
              className="bg-gradient-to-br from-cyan-50 to-cyan-100 p-4 rounded-2xl border border-cyan-200 shadow-lg cursor-pointer hover:shadow-xl transition-all duration-300 hover:scale-105"
              onClick={() => openFaturamentoAnualChart()}
            >
              <h3 className="text-base font-bold text-cyan-800 mb-3">Faturamento REG Anual</h3>
              <div className="text-xl font-bold text-cyan-900 mb-3">
                R$ {(totalReceitasAno * 0.4).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </div>
              
              {/* Barra de Progresso */}
              <div className="mb-3">
                <div className="flex justify-between text-xs font-medium text-cyan-700 mb-3">
                  <span>Progresso</span>
                  <span>{calcularPercentualSeguro(totalReceitasAno, metaTotalAno, 0)}%</span>
                </div>
                <div className="w-full bg-cyan-200 rounded-full h-2 relative">
                  {/* Barra base (0-100%) */}
                  <div 
                    className="bg-gradient-to-r from-cyan-500 to-cyan-600 h-2 rounded-full transition-all duration-300"
                    style={{ width: calcularLarguraBarra(totalReceitasAno, metaTotalAno, 1) }}
                  ></div>
                  {/* Barra de excesso (>100%) */}
                  {(((totalReceitasAno * 0.4) / (metaTotalAno * 0.4)) * 100) > 100 && (
                    <div 
                      className="absolute top-0 left-0 bg-gradient-to-r from-cyan-700 to-cyan-800 h-2 rounded-full transition-all duration-300"
                      style={{ width: `${Math.min(100, ((((totalReceitasAno * 0.4) / (metaTotalAno * 0.4)) * 100) - 100))}%` }}
                    ></div>
                  )}
                </div>
              </div>
              
              {/* Valores Alcançado/Restante */}
              <div className="text-xs text-cyan-700 font-medium">
                R$ {(totalReceitasAno * 0.4).toLocaleString('pt-BR', { minimumFractionDigits: 2 })} / R$ {Math.max(0, (metaTotalAno * 0.4) - (totalReceitasAno * 0.4)).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </div>
            </div>

            <div 
              className="bg-gradient-to-br from-pink-50 to-pink-100 p-4 rounded-2xl border border-pink-200 shadow-lg cursor-pointer hover:shadow-xl transition-all duration-300 hover:scale-105"
              onClick={() => openFaturamentoAnualChart()}
            >
              <h3 className="text-base font-bold text-pink-800 mb-3">Faturamento NN Anual</h3>
              <div className="text-xl font-bold text-pink-900 mb-3">
                R$ {(totalReceitasAno * 0.2).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </div>
              
              {/* Barra de Progresso */}
              <div className="mb-3">
                <div className="flex justify-between text-xs font-medium text-pink-700 mb-3">
                  <span>Progresso</span>
                  <span>{calcularPercentualSeguro(totalReceitasAno, metaTotalAno, 0)}%</span>
                </div>
                <div className="w-full bg-pink-200 rounded-full h-2 relative">
                  {/* Barra base (0-100%) */}
                  <div 
                    className="bg-gradient-to-r from-pink-500 to-pink-600 h-2 rounded-full transition-all duration-300"
                    style={{ width: calcularLarguraBarra(totalReceitasAno, metaTotalAno, 1) }}
                  ></div>
                  {/* Barra de excesso (>100%) */}
                  {(((totalReceitasAno * 0.2) / (metaTotalAno * 0.2)) * 100) > 100 && (
                    <div 
                      className="absolute top-0 left-0 bg-gradient-to-r from-pink-700 to-pink-800 h-2 rounded-full transition-all duration-300"
                      style={{ width: `${Math.min(100, ((((totalReceitasAno * 0.2) / (metaTotalAno * 0.2)) * 100) - 100))}%` }}
                    ></div>
                  )}
                </div>
              </div>
              
              {/* Valores Alcançado/Restante */}
              <div className="text-xs text-pink-700 font-medium">
                R$ {(totalReceitasAno * 0.2).toLocaleString('pt-BR', { minimumFractionDigits: 2 })} / R$ {Math.max(0, (metaTotalAno * 0.2) - (totalReceitasAno * 0.2)).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </div>
            </div>
          </div>
        </div>

        {/* 3. DESPESAS ANUAIS */}
        <div className="space-y-4">
          <h2 className="text-3xl font-bold text-red-800 flex items-center gap-3">
            <TrendingDown className="w-8 h-8 text-red-600" />
            Despesas Anuais
          </h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <div 
              className="bg-gradient-to-br from-red-100 to-red-200 p-8 rounded-2xl border-2 border-red-300 shadow-xl cursor-pointer hover:shadow-2xl transition-all duration-300 hover:scale-105"
              onClick={() => openDespesasAnualChart()}
            >
              <h3 className="text-xl font-bold text-red-900 mb-6">Despesas TOTAL Anuais</h3>
              <div className="text-3xl font-bold text-red-900 mb-3">
                R$ {totalDespesasAno.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </div>
              
              {/* Barra de Progresso Anual */}
              <div className="mb-3">
                <div className="flex justify-between text-xs font-medium text-red-800 mb-3">
                  <span>Limite Anual</span>
                  <span>{calcularPercentualSeguro(totalDespesasAno, getBudgetValueAnual(), 0)}%</span>
                </div>
                <div className="w-full bg-red-300 rounded-full h-3 relative">
                  {/* Barra base (0-100%) */}
                  <div 
                    className="bg-gradient-to-r from-red-600 to-red-700 h-3 rounded-full transition-all duration-300"
                    style={{ width: calcularLarguraBarra(totalDespesasAno, getBudgetValueAnual(), 1) }}
                  ></div>
                  {/* Barra de excesso (>100%) */}
                  {((totalDespesasAno / getBudgetValueAnual()) * 100) > 100 && (
                    <div 
                      className="absolute top-0 left-0 bg-gradient-to-r from-red-800 to-red-900 h-3 rounded-full transition-all duration-300"
                      style={{ width: `${Math.min(100, (((totalDespesasAno / getBudgetValueAnual()) * 100) - 100))}%` }}
                    ></div>
                  )}
                </div>
              </div>
              
              {/* Valores Usado/Restante */}
              <div className="text-xs text-red-800 font-medium">
                R$ {totalDespesasAno.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} / R$ {Math.max(0, getBudgetValueAnual() - totalDespesasAno).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </div>
            </div>

            <div 
              className="bg-gradient-to-br from-orange-100 to-orange-200 p-8 rounded-2xl border-2 border-orange-300 shadow-xl cursor-pointer hover:shadow-2xl transition-all duration-300 hover:scale-105"
              onClick={() => openDespesasAnualChart()}
            >
              <h3 className="text-xl font-bold text-orange-900 mb-6">Despesas Variáveis Anuais</h3>
              <div className="text-3xl font-bold text-orange-900 mb-3">
                R$ {(totalDespesasAno * 0.7).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </div>
              
              {/* Barra de Progresso Anual */}
              <div className="mb-3">
                <div className="flex justify-between text-xs font-medium text-orange-800 mb-3">
                  <span>Limite Anual</span>
                  <span>{calcularPercentualSeguro(totalDespesasAno * 0.7, getVariableExpensesValueAnual(), 0)}%</span>
                </div>
                <div className="w-full bg-orange-300 rounded-full h-3 relative">
                  {/* Barra base (0-100%) */}
                  <div 
                    className="bg-gradient-to-r from-orange-600 to-orange-700 h-3 rounded-full transition-all duration-300"
                    style={{ width: calcularLarguraBarra(totalDespesasAno * 0.7, getVariableExpensesValueAnual(), 1) }}
                  ></div>
                  {/* Barra de excesso (>100%) */}
                  {(((totalDespesasAno * 0.7) / getVariableExpensesValueAnual()) * 100) > 100 && (
                    <div 
                      className="absolute top-0 left-0 bg-gradient-to-r from-orange-800 to-orange-900 h-3 rounded-full transition-all duration-300"
                      style={{ width: `${Math.min(100, ((((totalDespesasAno * 0.7) / getVariableExpensesValueAnual()) * 100) - 100))}%` }}
                    ></div>
                  )}
                </div>
              </div>
              
              {/* Valores Usado/Restante */}
              <div className="text-xs text-orange-800 font-medium">
                R$ {(totalDespesasAno * 0.7).toLocaleString('pt-BR', { minimumFractionDigits: 2 })} / R$ {Math.max(0, getVariableExpensesValueAnual() - (totalDespesasAno * 0.7)).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </div>
            </div>

            <div 
              className="bg-gradient-to-br from-amber-100 to-amber-200 p-8 rounded-2xl border-2 border-amber-300 shadow-xl cursor-pointer hover:shadow-2xl transition-all duration-300 hover:scale-105"
              onClick={() => openDespesasAnualChart()}
            >
              <h3 className="text-xl font-bold text-amber-900 mb-6">Despesas Fixas Anuais</h3>
              <div className="text-3xl font-bold text-amber-900 mb-3">
                R$ {getFixedExpensesValueAnual().toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </div>
              
              {/* Barra de Progresso Anual */}
              <div className="mb-3">
                <div className="flex justify-between text-xs font-medium text-amber-800 mb-3">
                  <span>Progresso Anual</span>
                  <span>{calcularPercentualSeguro(totalDespesasAno * 0.25, Math.max(getFixedExpensesValueAnual(), 1), 0)}%</span>
                </div>
                <div className="w-full bg-amber-300 rounded-full h-3 relative">
                  {/* Barra base (0-100%) */}
                  <div 
                    className="bg-gradient-to-r from-amber-600 to-amber-700 h-3 rounded-full transition-all duration-300"
                    style={{ width: calcularLarguraBarra(totalDespesasAno * 0.25, Math.max(getFixedExpensesValueAnual(), 1), 1) }}
                  ></div>
                  {/* Barra de excesso (>100%) */}
                  {((totalDespesasAno * 0.25) / Math.max(getFixedExpensesValueAnual(), 1) * 100) > 100 && (
                    <div 
                      className="absolute top-0 left-0 bg-gradient-to-r from-amber-800 to-amber-900 h-3 rounded-full transition-all duration-300"
                      style={{ width: `${Math.min(100, (((totalDespesasAno * 0.25) / Math.max(getFixedExpensesValueAnual(), 1) * 100) - 100))}%` }}
                    ></div>
                  )}
                </div>
              </div>
              
              {/* Valores Realizado/Meta */}
              <div className="text-xs text-amber-800 font-medium">
                R$ {(totalDespesasAno * 0.25).toLocaleString('pt-BR', { minimumFractionDigits: 2 })} / R$ {getFixedExpensesValueAnual().toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </div>
            </div>
          </div>
        </div>

        {/* 4. INVESTIMENTOS ANUAIS */}
        <div className="space-y-4">
          <h2 className="text-3xl font-bold text-indigo-800 flex items-center gap-3">
            <ArrowUpCircle className="w-8 h-8 text-indigo-600" />
            Investimentos Anuais
          </h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div 
              className="bg-gradient-to-br from-blue-100 to-blue-200 p-8 rounded-2xl border-2 border-blue-300 shadow-xl cursor-pointer hover:shadow-2xl transition-all duration-300 hover:scale-105"
              onClick={() => openInvestimentosAnualChart()}
            >
              <h3 className="text-xl font-bold text-blue-900 mb-6">Investimentos Gerais Anuais</h3>
              <div className="text-3xl font-bold text-blue-900 mb-3">
                R$ {(totalDespesasAno * 0.05).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </div>
              
              {/* Barra de Progresso Anual */}
              <div className="mb-3">
                <div className="flex justify-between text-xs font-medium text-blue-800 mb-3">
                  <span>Meta Anual</span>
                  <span>{calcularPercentualSeguro(totalDespesasAno * 0.05, metaInvestimentosGeraisAnual, 0)}%</span>
                </div>
                <div className="w-full bg-blue-300 rounded-full h-3 relative">
                  {/* Barra base (0-100%) */}
                  <div 
                    className="bg-gradient-to-r from-blue-600 to-blue-700 h-3 rounded-full transition-all duration-300"
                    style={{ width: calcularLarguraBarra(totalDespesasAno * 0.05, metaInvestimentosGeraisAnual, 1) }}
                  ></div>
                  {/* Barra de excesso (>100%) */}
                  {parseFloat(calcularPercentualSeguro(totalDespesasAno * 0.05, metaInvestimentosGeraisAnual, 1)) > 100 && (
                    <div 
                      className="absolute top-0 left-0 bg-gradient-to-r from-blue-800 to-blue-900 h-3 rounded-full transition-all duration-300"
                      style={{ width: `${Math.min(100, parseFloat(calcularPercentualSeguro(totalDespesasAno * 0.05, metaInvestimentosGeraisAnual, 1)) - 100)}%` }}
                    ></div>
                  )}
                </div>
              </div>
              
              {/* Valores Alcançado/Restante */}
              <div className="text-xs text-cyan-800 font-medium">
                R$ {(totalDespesasAno * 0.05).toLocaleString('pt-BR', { minimumFractionDigits: 2 })} / R$ {Math.max(0, metaInvestimentosGeraisAnual - (totalDespesasAno * 0.05)).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </div>
            </div>

            <div 
              className="bg-gradient-to-br from-purple-100 to-purple-200 p-8 rounded-2xl border-2 border-purple-300 shadow-xl cursor-pointer hover:shadow-2xl transition-all duration-300 hover:scale-105"
              onClick={() => openInvestimentosAnualChart()}
            >
              <h3 className="text-xl font-bold text-purple-900 mb-6">Investimentos MKT Anuais</h3>
              <div className="text-3xl font-bold text-purple-900 mb-3">
                R$ {(totalReceitasAno * 0.1).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </div>
              
              {/* Barra de Progresso Anual */}
              <div className="mb-3">
                <div className="flex justify-between text-xs font-medium text-purple-800 mb-3">
                  <span>Meta Anual</span>
                  <span>{calcularPercentualSeguro(totalReceitasAno * 0.1, metaInvestimentosMktAnual, 0)}%</span>
                </div>
                <div className="w-full bg-purple-300 rounded-full h-3 relative">
                  {/* Barra base (0-100%) */}
                  <div 
                    className="bg-gradient-to-r from-purple-600 to-purple-700 h-3 rounded-full transition-all duration-300"
                    style={{ width: calcularLarguraBarra(totalReceitasAno * 0.1, metaInvestimentosMktAnual, 1) }}
                  ></div>
                  {/* Barra de excesso (>100%) */}
                  {parseFloat(calcularPercentualSeguro(totalReceitasAno * 0.1, metaInvestimentosMktAnual, 1)) > 100 && (
                    <div 
                      className="absolute top-0 left-0 bg-gradient-to-r from-purple-800 to-purple-900 h-3 rounded-full transition-all duration-300"
                      style={{ width: `${Math.min(100, parseFloat(calcularPercentualSeguro(totalReceitasAno * 0.1, metaInvestimentosMktAnual, 1)) - 100)}%` }}
                    ></div>
                  )}
                </div>
              </div>
              
              {/* Valores Alcançado/Restante */}
              <div className="text-xs text-pink-800 font-medium">
                R$ {(totalReceitasAno * 0.1).toLocaleString('pt-BR', { minimumFractionDigits: 2 })} / R$ {Math.max(0, metaInvestimentosMktAnual - (totalReceitasAno * 0.1)).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </div>
            </div>
          </div>
        </div>

        {/* 5. PROGRESSO VISUAL ANUAL */}
        <div className="space-y-4">
          <h2 className="text-3xl font-bold text-cyan-800 flex items-center gap-3">
            <BarChart3 className="w-8 h-8 text-blue-600" />
            Progresso Visual Anual
          </h2>
          
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Gráfico de Pizza Anual */}
            <div 
              className="bg-gradient-to-br from-pink-50 to-rose-50 p-4 rounded-2xl border border-pink-200 shadow-lg cursor-pointer hover:shadow-xl transition-all duration-300 hover:scale-105"
              onClick={() => openProgressoAnualChart()}
            >
              <h3 className="text-base font-bold text-pink-800 mb-3">Distribuição de Receitas Anuais</h3>
              <div className="flex items-center justify-center h-48">
                <div className="relative w-32 h-32">
                  <div className="absolute inset-0 rounded-full border-8 border-pink-200"></div>
                  <div 
                    className="absolute inset-0 rounded-full border-8 border-transparent border-t-pink-500 border-r-pink-500 transition-all duration-500"
                    style={{ 
                      transform: `rotate(${((totalReceitasAno / metaTotalAno) * 360)}deg)`,
                      clipPath: totalReceitasAno >= metaTotalAno ? 'none' : 'polygon(50% 0%, 100% 0%, 100% 100%, 50% 100%)'
                    }}
                  ></div>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="text-center">
                      <div className="text-xl font-bold text-pink-800">
                        {calcularPercentualSeguro(totalReceitasAno, metaTotalAno, 0)}%
                      </div>
                      <div className="text-xs text-pink-600 font-medium">Alcançado</div>
                    </div>
                  </div>
                </div>
              </div>
              <div className="text-center text-xs text-pink-700 font-medium">
                R$ {totalReceitasAno.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} de R$ {metaTotalAno.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </div>
            </div>

            {/* Barra de Progresso Linear Anual */}
            <div 
              className="bg-gradient-to-br from-cyan-50 to-blue-50 p-4 rounded-2xl border border-cyan-200 shadow-lg cursor-pointer hover:shadow-xl transition-all duration-300 hover:scale-105"
              onClick={() => openProgressoAnualChart()}
            >
              <h3 className="text-base font-bold text-cyan-800 mb-3">Progresso Linear Anual</h3>
              <div className="space-y-4">
                <div className="text-center">
                  <div className="text-3xl font-bold text-cyan-900 mb-3">
                    {metaTotalAno > 0 ? ((totalReceitasAno / metaTotalAno) * 100).toFixed(1) : 0}%
                  </div>
                  <div className="text-xs text-cyan-700">Meta Anual Alcançada</div>
                </div>
                
                <div className="w-full bg-cyan-200 rounded-full h-4 relative overflow-hidden">
                  <div 
                    className="bg-gradient-to-r from-cyan-500 to-blue-500 h-4 rounded-full transition-all duration-500 relative"
                    style={{ width: calcularLarguraBarra(totalReceitasAno, metaTotalAno, 1) }}
                  >
                    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white to-transparent opacity-30 animate-pulse"></div>
                  </div>
                </div>
                
                <div className="flex justify-between text-xs text-cyan-700 font-medium">
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
      const currentYear = 2025
      const transacoesDoMes = transactions.filter(t => {
        const transactionDate = new Date(t.date)
        return transactionDate.getMonth() === monthIndex && transactionDate.getFullYear() === currentYear
      })
      
      const totalReceitas = transacoesDoMes.filter(t => t.type === 'Receita').reduce((sum, t) => sum + t.value, 0)
      const totalDespesas = transacoesDoMes.filter(t => t.type === 'Despesa').reduce((sum, t) => sum + t.value, 0)
      
      // Meta/Limite de despesas = soma das despesas da projeção (limite total)
      const metaDespesas = projectionData ? 
        (projectionData.despesasVariaveis[monthIndex] || 0) + 
        (projectionData.despesasFixas[monthIndex] || 0) : 0
      
      const resultadoFinanceiro = totalReceitas - metaDespesas
      
      // Criar HTML do relatório com dados REAIS
      tempElement.innerHTML = `
        <div style="text-align: center; margin-bottom: 30px;">
          <h1 style="color: #1e40af; font-size: 28px; margin: 0; font-weight: bold;">IMPGEO</h1>
          <h2 style="color: #374151; font-size: 24px; margin: 10px 0; font-weight: bold;">Relatório de Metas - ${mesSelecionado.nome} 2025</h2>
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
      const fileName = `Metas_${mesSelecionado.nome}_2025_${new Date().toISOString().split('T')[0]}.pdf`
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

        {/* Renderizar Mês Selecionado com Dropdown Integrado */}
        {mesSelecionado && (
          <div className="space-y-6 mb-32">
            {/* Dropdown do Mês Selecionado */}
            <div className="bg-gradient-to-r from-blue-500 to-indigo-600 p-4 rounded-2xl shadow-lg">
                <select
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(Number(e.target.value))}
                className="w-full text-3xl font-bold text-white text-center uppercase tracking-wider bg-transparent border-none outline-none cursor-pointer"
                style={{ 
                  appearance: 'none',
                  WebkitAppearance: 'none',
                  MozAppearance: 'none',
                  backgroundImage: `url("data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3E%3Cpath stroke='%23ffffff' stroke-linecap='round' stroke-linejoin='round' stroke-width='2.5' d='M6 8l4 4 4-4'/%3E%3C/svg%3E")`,
                  backgroundPosition: 'right 1rem center',
                  backgroundRepeat: 'no-repeat',
                  backgroundSize: '1.2em 1.2em',
                  paddingRight: '3rem'
                }}
              >
                {mesesMetas.map((mes) => (
                  <option key={mes.indice} value={mes.indice} className="text-gray-800 bg-white normal-case text-lg font-normal">
                    {mes.nome} - 2025
                  </option>
                ))}
                </select>
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
    const { receitas, despesas, resultado } = calculateTotals()
    
    
    // Usar dados reais das transações para o mês atual
    const totalReceitasMes = receitas
    const totalDespesasMes = despesas
    const lucroLiquidoMes = resultado
    
    // Função para determinar o trimestre de um mês (0-11)
    const getQuarter = (month: number) => Math.floor(month / 3)
    
    // Cálculos trimestrais
    const currentQuarter = getQuarter(new Date().getMonth())
    const transacoesTrimestre = transactions.filter(t => {
      const transactionDate = new Date(t.date)
      const transactionQuarter = getQuarter(transactionDate.getMonth())
      return transactionQuarter === currentQuarter && transactionDate.getFullYear() === new Date().getFullYear()
    })
    
    const totalReceitasTrimestre = transacoesTrimestre
      .filter(t => t.type === 'Receita')
      .reduce((sum, t) => sum + t.value, 0)
    const totalDespesasTrimestre = transacoesTrimestre
      .filter(t => t.type === 'Despesa')
      .reduce((sum, t) => sum + t.value, 0)
    const lucroLiquidoTrimestre = totalReceitasTrimestre - totalDespesasTrimestre
    
    // Cálculos anuais
    const currentYear = new Date().getFullYear()
    const transacoesAno = transactions.filter(t => {
      const transactionDate = new Date(t.date)
      return transactionDate.getFullYear() === currentYear
    })
    
    const totalReceitasAno = transacoesAno
      .filter(t => t.type === 'Receita')
      .reduce((sum, t) => sum + t.value, 0)
    const totalDespesasAno = transacoesAno
      .filter(t => t.type === 'Despesa')
      .reduce((sum, t) => sum + t.value, 0)
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
      
      return (
        <div className="bg-white p-4 rounded-2xl shadow-lg border border-gray-100 mt-4">
          <h3 className="text-base font-bold text-gray-800 mb-3">{title}</h3>
          <div className="flex items-center justify-center h-64">
            <div className="text-center">
              <div className="text-3xl font-bold text-gray-800 mb-3">
                {hasData ? `R$ ${(Math.round(data[0].value * 100) / 100).toFixed(2)}` : 'Sem dados'}
              </div>
              <div className="text-xs text-gray-600">
                {hasData ? data[0].name : 'Nenhuma transação encontrada'}
              </div>
            </div>
          </div>
        </div>
      );
  }

    return (
      <div className="space-y-8">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-start gap-4">
          <h1 className="text-3xl font-bold flex items-center gap-3">
            <BarChart3 className="w-8 h-8 text-blue-600" />
            Dashboard IMPGEO
          </h1>
        {permissions.canCreate && (
          <button 
              onClick={() => setShowTransactionModal(true)}
              className="flex items-center gap-3 px-6 py-3 bg-gradient-to-r from-blue-500 to-indigo-600 text-white font-semibold rounded-xl hover:from-blue-600 hover:to-indigo-700 shadow-lg hover:shadow-xl transform hover:-translate-y-1 transition-all duration-300"
          >
              <Plus className="h-5 w-5" />
            Nova Transação
          </button>
        )}
      </div>

        {/* Seção Mês Atual */}
          <div className="space-y-4">
          <h2 className="text-xl font-bold text-gray-800 flex items-center gap-3">
            <PieChart className="w-6 h-6 text-gray-600" />
            Mês Atual
            <span className="text-lg font-medium text-blue-600 bg-blue-50 px-3 py-1 rounded-lg border border-blue-200">
              {nomesMeses[new Date().getMonth()]}
            </span>
          </h2>
          
          <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* Card Receitas */}
              <div className="space-y-4">
                <div 
                  className="bg-gradient-to-br from-green-500 to-green-600 p-4 rounded-2xl shadow-lg cursor-pointer hover:shadow-xl transition-all duration-200 hover:-translate-y-1"
                  onClick={() => toggleChart('receitas-mensal')}
                >
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-white bg-opacity-20 rounded-xl flex items-center justify-center">
                      <DollarSign className="h-6 w-6 text-white" />
            </div>
              <div>
                      <p className="text-base font-bold text-white text-opacity-80 uppercase tracking-wide">Receitas</p>
                      <p className="text-xl font-bold text-white mt-1">
                        R$ {(Math.round(totalReceitasMes * 100) / 100).toFixed(2)}
              </p>
            </div>
          </div>
            </div>
                {expandedCharts.includes('receitas-mensal') && renderPieChart(pieChartData, 'Distribuição Mensal: Receitas vs Despesas')}
        </div>

              {/* Card Despesas */}
              <div className="space-y-4">
                <div 
                  className="bg-gradient-to-br from-red-500 to-red-600 p-4 rounded-2xl shadow-lg cursor-pointer hover:shadow-xl transition-all duration-200 hover:-translate-y-1"
                  onClick={() => toggleChart('despesas-mensal')}
                >
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-white bg-opacity-20 rounded-xl flex items-center justify-center">
                      <TrendingDown className="h-6 w-6 text-white" />
            </div>
              <div>
                      <p className="text-base font-bold text-white text-opacity-80 uppercase tracking-wide">Despesas</p>
                      <p className="text-xl font-bold text-white mt-1">
                        R$ {(Math.round(totalDespesasMes * 100) / 100).toFixed(2)}
              </p>
            </div>
          </div>
          </div>
                {expandedCharts.includes('despesas-mensal') && renderPieChart(pieChartData, 'Distribuição Mensal: Receitas vs Despesas')}
        </div>

              {/* Card Saldo */}
          <div className="space-y-4">
                <div 
                  className={`p-4 rounded-2xl shadow-lg cursor-pointer hover:shadow-xl transition-all duration-200 hover:-translate-y-1 ${
                    lucroLiquidoMes >= 0 ? 'bg-gradient-to-br from-yellow-500 to-yellow-600' : 'bg-gradient-to-br from-red-500 to-red-600'
                  }`}
                  onClick={() => toggleChart('saldo-mensal')}
                >
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-white bg-opacity-20 rounded-xl flex items-center justify-center">
                      <BarChart3 className="h-6 w-6 text-white" />
            </div>
              <div>
                      <p className="text-base font-bold text-white text-opacity-80 uppercase tracking-wide">Saldo</p>
                      <p className={`text-xl font-bold mt-1 ${
                        lucroLiquidoMes >= 0 ? 'text-green-900' : 'text-red-900'
                      }`}>
                        R$ {(Math.round(lucroLiquidoMes * 100) / 100).toFixed(2)}
              </p>
            </div>
          </div>
        </div>
                {expandedCharts.includes('saldo-mensal') && renderPieChart(pieChartData, `Comparação: Meta vs Real (${nomesMeses[new Date().getMonth()]})`)}
      </div>
        </div>
      </div>
    </div>
            
        {/* Seção Trimestre */}
        <div className="space-y-4">
          <h2 className="text-xl font-bold text-cyan-800 flex items-center gap-3">
            <PieChart className="w-6 h-6 text-cyan-600" />
            Trimestre Atual
            <span className="text-lg font-medium text-cyan-600 bg-cyan-50 px-3 py-1 rounded-lg border border-cyan-200">
              {nomesTrimestres[currentQuarter]}
            </span>
          </h2>
          
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* Card Receitas Trimestrais */}
              <div className="space-y-4">
                <div 
                  className="bg-gradient-to-br from-green-500 to-green-600 p-4 rounded-2xl shadow-lg cursor-pointer hover:shadow-xl transition-all duration-200 hover:-translate-y-1"
                  onClick={() => toggleChart('receitas-trimestre')}
                >
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-white bg-opacity-20 rounded-xl flex items-center justify-center">
                      <DollarSign className="h-6 w-6 text-white" />
            </div>
              <div>
                      <p className="text-base font-bold text-white text-opacity-80 uppercase tracking-wide">Receitas</p>
                      <p className="text-xl font-bold text-white mt-1">
                        R$ {(Math.round(totalReceitasTrimestre * 100) / 100).toFixed(2)}
                      </p>
            </div>
            </div>
          </div>
                {expandedCharts.includes('receitas-trimestre') && renderPieChart(pieChartDataTrimestre, 'Distribuição Trimestral: Receitas vs Despesas')}
        </div>

              {/* Card Despesas Trimestrais */}
              <div className="space-y-4">
                <div 
                  className="bg-gradient-to-br from-red-500 to-red-600 p-4 rounded-2xl shadow-lg cursor-pointer hover:shadow-xl transition-all duration-200 hover:-translate-y-1"
                  onClick={() => toggleChart('despesas-trimestre')}
                >
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-white bg-opacity-20 rounded-xl flex items-center justify-center">
                      <TrendingDown className="h-6 w-6 text-white" />
              </div>
            <div>
                      <p className="text-base font-bold text-white text-opacity-80 uppercase tracking-wide">Despesas</p>
                      <p className="text-xl font-bold text-white mt-1">
                        R$ {(Math.round(totalDespesasTrimestre * 100) / 100).toFixed(2)}
                </p>
          </div>
        </div>
      </div>
                {expandedCharts.includes('despesas-trimestre') && renderPieChart(pieChartDataTrimestre, 'Distribuição Trimestral: Receitas vs Despesas')}
    </div>

              {/* Card Saldo Trimestral */}
              <div className="space-y-4">
                <div 
                  className={`p-4 rounded-2xl shadow-lg cursor-pointer hover:shadow-xl transition-all duration-200 hover:-translate-y-1 ${
                    lucroLiquidoTrimestre >= 0 ? 'bg-gradient-to-br from-yellow-500 to-yellow-600' : 'bg-gradient-to-br from-red-500 to-red-600'
                  }`}
                  onClick={() => toggleChart('saldo-trimestre')}
                >
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-white bg-opacity-20 rounded-xl flex items-center justify-center">
                      <BarChart3 className="h-6 w-6 text-white" />
      </div>
              <div>
                      <p className="text-base font-bold text-white text-opacity-80 uppercase tracking-wide">Saldo</p>
                      <p className={`text-xl font-bold mt-1 ${
                        lucroLiquidoTrimestre >= 0 ? 'text-green-900' : 'text-red-900'
                      }`}>
                        R$ {(Math.round(lucroLiquidoTrimestre * 100) / 100).toFixed(2)}
              </p>
                        </div>
                      </div>
                        </div>
                {expandedCharts.includes('saldo-trimestre') && renderPieChart(pieChartDataTrimestre, `Comparação Trimestral: Meta vs Real (${nomesTrimestres[currentQuarter]})`)}
                      </div>
                    </div>
        </div>
      </div>

        {/* Seção Ano */}
        <div className="space-y-4">
          <h2 className="text-xl font-bold text-pink-800 flex items-center gap-3">
            <PieChart className="w-6 h-6 text-purple-600" />
            Ano {currentYear}
          </h2>
          
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* Card Receitas Anuais */}
              <div className="space-y-4">
                <div 
                  className="bg-gradient-to-br from-green-500 to-green-600 p-4 rounded-2xl shadow-lg cursor-pointer hover:shadow-xl transition-all duration-200 hover:-translate-y-1"
                  onClick={() => toggleChart('receitas-anual')}
                >
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-white bg-opacity-20 rounded-xl flex items-center justify-center">
                      <DollarSign className="h-6 w-6 text-white" />
          </div>
              <div>
                      <p className="text-base font-bold text-white text-opacity-80 uppercase tracking-wide">Receitas Anuais</p>
                      <p className="text-xl font-bold text-white mt-1">
                        R$ {(Math.round(totalReceitasAno * 100) / 100).toFixed(2)}
                </p>
              </div>
            </div>
        </div>
                {expandedCharts.includes('receitas-anual') && renderPieChart(pieChartDataAnual, 'Distribuição Anual: Receitas vs Despesas')}
          </div>

              {/* Card Despesas Anuais */}
          <div className="space-y-4">
                <div 
                  className="bg-gradient-to-br from-red-500 to-red-600 p-4 rounded-2xl shadow-lg cursor-pointer hover:shadow-xl transition-all duration-200 hover:-translate-y-1"
                  onClick={() => toggleChart('despesas-anual')}
                >
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-white bg-opacity-20 rounded-xl flex items-center justify-center">
                      <TrendingDown className="h-6 w-6 text-white" />
              </div>
              <div>
                      <p className="text-base font-bold text-white text-opacity-80 uppercase tracking-wide">Despesas Anuais</p>
                      <p className="text-xl font-bold text-white mt-1">
                        R$ {(Math.round(totalDespesasAno * 100) / 100).toFixed(2)}
                </p>
              </div>
            </div>
      </div>
                {expandedCharts.includes('despesas-anual') && renderPieChart(pieChartDataAnual, 'Distribuição Anual: Receitas vs Despesas')}
          </div>

              {/* Card Saldo Anual */}
              <div className="space-y-4">
                <div 
                  className={`p-4 rounded-2xl shadow-lg cursor-pointer hover:shadow-xl transition-all duration-200 hover:-translate-y-1 ${
                    lucroLiquidoAno >= 0 ? 'bg-gradient-to-br from-yellow-500 to-yellow-600' : 'bg-gradient-to-br from-red-500 to-red-600'
                  }`}
                  onClick={() => toggleChart('saldo-anual')}
                >
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-white bg-opacity-20 rounded-xl flex items-center justify-center">
                      <BarChart3 className="h-6 w-6 text-white" />
              </div>
              <div>
                      <p className="text-base font-bold text-white text-opacity-80 uppercase tracking-wide">Saldo Anual</p>
                      <p className={`text-xl font-bold mt-1 ${
                        lucroLiquidoAno >= 0 ? 'text-green-900' : 'text-red-900'
                      }`}>
                        R$ {(Math.round(lucroLiquidoAno * 100) / 100).toFixed(2)}
                </p>
              </div>
            </div>
          </div>
                {expandedCharts.includes('saldo-anual') && renderPieChart(pieChartDataAnual, 'Comparação Anual: Meta vs Real')}
              </div>
            </div>
          </div>
        </div>

        {/* Lista de Transações Recentes */}
          <div className="space-y-4">
          <h2 className="text-xl font-bold text-gray-800 flex items-center gap-3">
            <DollarSign className="w-6 h-6 text-gray-600" />
            Transações Recentes
          </h2>
          
          <div className="bg-white rounded-2xl shadow-lg border border-gray-200 overflow-hidden">
            {transacoesRecentes.length === 0 ? (
              <div className="p-8 text-center">
                <p className="text-gray-500">Nenhuma transação encontrada.</p>
                <p className="text-xs text-gray-400 mt-1">Adicione suas primeiras transações para vê-las aqui.</p>
          </div>
            ) : (
              <div className="divide-y divide-gray-100">
                {transacoesRecentes.map((transacao, index) => (
                  <div key={index} className="p-4 hover:bg-gray-50 transition-colors duration-200">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className={`w-3 h-3 rounded-full ${
                          transacao.type === 'Receita' ? 'bg-emerald-500' : 'bg-red-500'
                        }`}></div>
              <div>
                          <p className="font-medium text-gray-900">{transacao.description}</p>
                          <p className="text-xs text-gray-500">{transacao.category}</p>
        </div>
            </div>
                      <div className="text-right">
                        <p className={`font-bold ${
                          transacao.type === 'Receita' ? 'text-emerald-600' : 'text-red-600'
                        }`}>
                          {transacao.type === 'Receita' ? '+' : '-'}R$ {(Math.round(transacao.value * 100) / 100).toFixed(2)}
                        </p>
                        <p className="text-xs text-gray-500">
                          {new Date(transacao.date).toLocaleDateString('pt-BR')}
                </p>
              </div>
            </div>
          </div>
                ))}
              </div>
            )}
          
            <div className="p-6 bg-gradient-to-r from-gray-50 to-blue-50 border-t border-gray-100">
            <button
                onClick={() => setActiveTab('transactions')}
                className="w-full flex items-center justify-center gap-3 px-6 py-4 bg-gradient-to-r from-blue-500 to-indigo-600 text-white font-semibold rounded-xl hover:from-blue-600 hover:to-indigo-700 shadow-lg hover:shadow-xl transform hover:-translate-y-1 transition-all duration-300 group"
              >
                <DollarSign className="h-5 w-5 group-hover:scale-110 transition-transform duration-300" />
                Ver todas as transações
                <ArrowUpCircle className="h-5 w-5 rotate-90 group-hover:translate-x-1 transition-all duration-300" />
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
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Carregando dados...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-100">
      <NavigationBar />
      
      <main className="max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8 pt-24">
        {activeTab === 'dashboard' && (
          <>
            {renderDashboard()}
            {showTransactionModal && (
              <TransactionsPage 
                showModal={true}
                onCloseModal={() => setShowTransactionModal(false)}
              />
            )}
          </>
        )}
        {activeTab === 'metas' && renderMetas()}
        {activeTab === 'reports' && (
          <Suspense fallback={<div className="flex items-center justify-center py-12"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div></div>}>
            <Reports transactions={transactions} />
          </Suspense>
        )}
        {activeTab === 'transactions' && (
          <Suspense fallback={<div className="flex items-center justify-center py-12"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div></div>}>
            <TransactionsPage />
          </Suspense>
        )}
        {activeTab === 'projects' && (
          <Suspense fallback={<div className="flex items-center justify-center py-12"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div></div>}>
            <Projects />
          </Suspense>
        )}
        {activeTab === 'services' && (
          <Suspense fallback={<div className="flex items-center justify-center py-12"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div></div>}>
            <Services />
          </Suspense>
        )}
        {/* removido placeholder duplicado de Relatórios */}
        {activeTab === 'metas' && (
          <div className="space-y-6">
            <h1 className="text-3xl font-bold text-gray-900">Metas</h1>
            <p className="text-gray-600">Funcionalidade em desenvolvimento...</p>
            </div>
        )}
        {activeTab === 'projecao' && (
          <Suspense fallback={<div className="flex items-center justify-center py-12"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div></div>}>
            <Projection />
          </Suspense>
        )}
        {activeTab === 'clients' && (
          <Suspense fallback={<div className="flex items-center justify-center py-12"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div></div>}>
            <Clients />
          </Suspense>
        )}
        {activeTab === 'dre' && (
          <Suspense fallback={<div className="flex items-center justify-center py-12"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div></div>}>
            <DRE />
          </Suspense>
        )}
        {activeTab === 'acompanhamentos' && (
          <Suspense fallback={<div className="flex items-center justify-center py-12"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div></div>}>
            <Acompanhamentos />
          </Suspense>
        )}
        {activeTab === 'admin' && user.role === 'admin' && (
          <Suspense fallback={<div className="flex items-center justify-center py-12"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div></div>}>
            <AdminPanel />
          </Suspense>
        )}
      </main>

      {/* Footer */}
      <footer className="bg-gray-800 text-white py-8 mt-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div>
              <div className="flex items-center mb-3">
                <img 
                  src="/logo_rodape.PNG" 
                  alt="Viver de PJ Logo" 
                  className="h-12 w-12 mr-2 object-contain"
                />
                <div>
                  <span className="text-base font-bold">Viver de PJ</span>
                  <p className="text-gray-400 text-sm">Ecosistema de Empreendedorismo</p>
                </div>
              </div>
              <p className="text-gray-400 text-sm">
                Sistema de Gestão Financeira por Viver de PJ. A Viver de PJ é um ecosistema completo de gestão e educação para Empreeendedores.
                <br /><br />
                Autor: Fernando Carvalho Gomes dos Santos 39063242816.
              </p>
            </div>
            
            <div>
              <h3 className="text-lg font-semibold mb-3">Contato</h3>
              <div className="space-y-2 text-gray-400">
                <div className="flex items-center">
                  <Phone className="h-4 w-4 mr-2" />
                  <span>(11) 91611-1900</span>
                </div>
                <div className="flex items-center">
                  <Mail className="h-4 w-4 mr-2" />
                  <span>vem@viverdepj.com.br</span>
                </div>
                <div className="flex items-center">
                  <Map className="h-4 w-4 mr-2" />
                  <span>São Paulo, SP</span>
                </div>
              </div>
            </div>
            
            <div>
              <h3 className="text-lg font-semibold mb-3">Serviços</h3>
              <div className="space-y-2 text-gray-400">
                <p>Consultoria Estratégica de Negócios</p>
                <p>Consultoria em Negócios</p>
                <p>Sistema de Gestão</p>
                <p>Sistema Financeiro</p>
                <p>CRM</p>
                <p>IA Financeira</p>
                <p>IA de Atendimento</p>
                <p>IA para Negócios</p>
                <p>Benefícios Corporativos</p>
                <p>Contabilidade para Empresas</p>
                <p>BPO Financeiro</p>
              </div>
            </div>
          </div>
          
          <div className="border-t border-gray-700 mt-8 pt-8 text-center text-gray-400">
            <p>&copy; 2026 Viver de PJ. TODOS OS DIREITOS RESERVADOS</p>
          </div>
        </div>
      </footer>
      
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
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}

export default App