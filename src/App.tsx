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
  ArrowUpCircle,
  Building,
  FileText,
  Phone,
  Mail,
  Map,
  Calculator
} from 'lucide-react'

// Funções para comunicação com a API
const API_BASE_URL = 'http://localhost:9001/api'

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

type TabType = 'dashboard' | 'projects' | 'services' | 'reports' | 'metas' | 'transactions' | 'clients' | 'dre' | 'projecao'

function App() {
  const [activeTab, setActiveTab] = useState<TabType>('dashboard')
  const [transactions, setTransactions] = useState<NewTransaction[]>([])
  const [metas, setMetas] = useState<Meta[]>([])
  const [isLoading, setIsLoading] = useState(true)
  


  // Estados para gráficos expandidos
  const [expandedCharts, setExpandedCharts] = useState<string[]>([])
  
  // Estados para Metas
  const [selectedMonth, setSelectedMonth] = useState<number>(new Date().getMonth())
  
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

  // Carregar dados iniciais
  useEffect(() => {
    const loadData = async () => {
      setIsLoading(true)
      try {
        const [transactionsData] = await Promise.all([
          fetchTransactions()
        ])
        
        setTransactions(transactionsData)
        
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
    const receitas = transactions
      .filter(t => t.type === 'Receita')
      .reduce((sum, t) => sum + t.value, 0)
    
    const despesas = transactions
      .filter(t => t.type === 'Despesa')
      .reduce((sum, t) => sum + t.value, 0)
    
    const resultado = receitas - despesas
    
    return { receitas, despesas, resultado }
  }




  // Componente de navegação
  const NavigationBar = () => (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-gradient-to-r from-blue-900 to-blue-800 shadow-lg">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-28 min-w-0">
          <div className="flex items-center">
            <div className="flex-shrink-0 flex items-center">
              <img 
                src="/imp_logo.png" 
                alt="IMPGEO Logo" 
                className="h-8 w-8 mr-2 object-contain"
              />
              <div>
                <span className="text-white text-xl font-bold">IMPGEO</span>
                <p className="text-blue-200 text-sm">Sistema de Gestão Financeira</p>
              </div>
            </div>
          </div>
          <div className="flex items-center space-x-4 overflow-x-auto scrollbar-hide nav-scroll min-w-0 flex-1">
        <button
          onClick={() => setActiveTab('dashboard')}
              className={`px-3 py-3 rounded-md text-sm font-bold transition-colors flex flex-col items-center justify-start ${
            activeTab === 'dashboard'
              ? 'bg-blue-700 text-white'
              : 'text-blue-200 hover:text-white hover:bg-blue-700'
          }`}
        >
              <Home className="h-4 w-4 mb-1" />
              Dashboard
            </button>
            <button
              onClick={() => setActiveTab('projects')}
              className={`px-3 py-3 rounded-md text-sm font-bold transition-colors flex flex-col items-center justify-start ${
                activeTab === 'projects'
                  ? 'bg-blue-700 text-white'
                  : 'text-blue-200 hover:text-white hover:bg-blue-700'
              }`}
            >
              <Map className="h-4 w-4 mb-1" />
              Projetos
            </button>
            <button
              onClick={() => setActiveTab('services')}
              className={`px-3 py-3 rounded-md text-sm font-bold transition-colors flex flex-col items-center justify-start ${
                activeTab === 'services'
                  ? 'bg-blue-700 text-white'
                  : 'text-blue-200 hover:text-white hover:bg-blue-700'
              }`}
            >
              <Target className="h-4 w-4 mb-1" />
              Serviços
            </button>
            <button
              onClick={() => setActiveTab('reports')}
              className={`px-3 py-3 rounded-md text-sm font-bold transition-colors flex flex-col items-center justify-start ${
                activeTab === 'reports'
                  ? 'bg-blue-700 text-white'
                  : 'text-blue-200 hover:text-white hover:bg-blue-700'
              }`}
            >
              <BarChart3 className="h-4 w-4 mb-1" />
              Relatórios
            </button>
            <button
              onClick={() => setActiveTab('metas')}
              className={`px-3 py-3 rounded-md text-sm font-bold transition-colors flex flex-col items-center justify-start ${
                activeTab === 'metas'
                  ? 'bg-blue-700 text-white'
                  : 'text-blue-200 hover:text-white hover:bg-blue-700'
              }`}
            >
              <TrendingUp className="h-4 w-4 mb-1" />
              Metas
            </button>
            <button
              onClick={() => setActiveTab('projecao')}
              className={`px-3 py-3 rounded-md text-sm font-bold transition-colors flex flex-col items-center justify-start ${
                activeTab === 'projecao'
                  ? 'bg-blue-700 text-white'
                  : 'text-blue-200 hover:text-white hover:bg-blue-700'
              }`}
            >
              <Calculator className="h-4 w-4 mb-1 mt-4" />
              <span className="text-center leading-tight">Projeção<br />Anual</span>
            </button>
            <button
              onClick={() => setActiveTab('transactions')}
              className={`px-3 py-3 rounded-md text-sm font-bold transition-colors flex flex-col items-center justify-start ${
                activeTab === 'transactions'
                  ? 'bg-blue-700 text-white'
                  : 'text-blue-200 hover:text-white hover:bg-blue-700'
              }`}
            >
              <FileText className="h-4 w-4 mb-1" />
              Transações
            </button>
            <button
              onClick={() => setActiveTab('clients')}
              className={`px-3 py-3 rounded-md text-sm font-bold transition-colors flex flex-col items-center justify-start ${
                activeTab === 'clients'
                  ? 'bg-blue-700 text-white'
                  : 'text-blue-200 hover:text-white hover:bg-blue-700'
              }`}
            >
              <Building className="h-4 w-4 mb-1" />
              Clientes
            </button>
            <button
              onClick={() => setActiveTab('dre')}
              className={`px-3 py-3 rounded-md text-sm font-bold transition-colors flex flex-col items-center justify-start ${
                activeTab === 'dre'
                  ? 'bg-blue-700 text-white'
                  : 'text-blue-200 hover:text-white hover:bg-blue-700'
              }`}
            >
              <BarChart3 className="h-4 w-4 mb-1" />
              DRE
            </button>
          </div>
        </div>
      </div>
    </nav>
  )

  // Função para renderizar conteúdo do mês
  const renderMonthContent = (monthName: string, monthIndex: number, metaValue: number, saldoInicial: number = 31970.50) => {
    // Cálculos para o mês específico
    const currentYear = 2025
    const transacoesDoMes = transactions.filter(t => {
      const transactionDate = new Date(t.date)
      return transactionDate.getMonth() === monthIndex && transactionDate.getFullYear() === currentYear
    })

    const totalReceitas = transacoesDoMes.filter(t => t.type === 'Receita').reduce((sum, t) => sum + t.value, 0)
    const totalDespesas = transacoesDoMes.filter(t => t.type === 'Despesa').reduce((sum, t) => sum + t.value, 0)

    return (
    <div className="space-y-6">
        {/* 1. RESULTADO */}
        <div className="space-y-4">
          <h2 className="text-2xl font-bold text-gray-800 flex items-center gap-3">
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
                  <span className="font-bold text-gray-800">R$ 0,00</span>
        </div>

                {/* SAÍDA DE CAIXA */}
                <div className="flex justify-between items-center py-2 border-b border-gray-200">
                  <span className="font-semibold text-gray-700">SAÍDA DE CAIXA</span>
                  <span className="font-bold text-gray-800">R$ 0,00</span>
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
                  <span className="font-semibold text-blue-700">SALDO INICIAL</span>
                  <span className="font-bold text-blue-800">R$ {saldoInicial.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
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
                    {metaValue > 0 ? ((totalReceitas / metaValue) * 100).toFixed(0) : 0}%
        </div>
      </div>
                
                {/* RESTANTE */}
                <div className="grid grid-cols-3 gap-4 py-3">
                  <div className="font-bold text-red-700 italic">RESTANTE</div>
                  <div className="text-center font-bold text-red-800">
                    -R$ {Math.max(0, metaValue - totalReceitas).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
      </div>
                  <div className="text-center font-bold text-red-800">
                    {metaValue > 0 ? Math.max(0, 100 - ((totalReceitas / metaValue) * 100)).toFixed(0) : 100}%
            </div>
            </div>
            </div>
          </div>
      </div>
    </div>

        {/* 2. FATURAMENTO */}
          <div className="space-y-4">
          <h2 className="text-2xl font-bold text-emerald-800 flex items-center gap-3">
            <TrendingUp className="w-6 h-6 text-emerald-600" />
            Faturamento
          </h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <div className="bg-gradient-to-br from-emerald-50 to-emerald-100 p-6 rounded-2xl border border-emerald-200 shadow-lg">
              <h3 className="text-lg font-bold text-emerald-800 mb-4">Faturamento TOTAL</h3>
              <div className="text-2xl font-bold text-emerald-900 mb-4">
                R$ {totalReceitas.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
            </div>
            
              {/* Barra de Progresso */}
              <div className="mb-3">
                <div className="flex justify-between text-sm font-medium text-emerald-700 mb-1">
                  <span>Progresso</span>
                  <span>{((totalReceitas / 30000) * 100).toFixed(0)}%</span>
            </div>
                <div className="w-full bg-emerald-200 rounded-full h-2 relative">
                  {/* Barra base (0-100%) */}
                  <div 
                    className="bg-gradient-to-r from-emerald-500 to-emerald-600 h-2 rounded-full transition-all duration-300"
                    style={{ width: `${Math.min(100, ((totalReceitas / 30000) * 100))}%` }}
                  ></div>
                  {/* Barra de excesso (>100%) */}
                  {((totalReceitas / 30000) * 100) > 100 && (
                    <div 
                      className="absolute top-0 left-0 bg-gradient-to-r from-emerald-700 to-emerald-800 h-2 rounded-full transition-all duration-300"
                      style={{ width: `${Math.min(100, (((totalReceitas / 30000) * 100) - 100))}%` }}
                    ></div>
                  )}
            </div>
          </div>
          
              {/* Valores Alcançado/Restante */}
              <div className="text-sm text-emerald-700 font-medium">
                R$ {totalReceitas.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} / R$ {Math.max(0, 30000 - totalReceitas).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
          </div>
        </div>

            <div className="bg-gradient-to-br from-green-50 to-green-100 p-6 rounded-2xl border border-green-200 shadow-lg">
              <h3 className="text-lg font-bold text-green-800 mb-4">Faturamento Varejo</h3>
              <div className="text-2xl font-bold text-green-900 mb-4">
                R$ {(totalReceitas * 0.6).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
            </div>
            
              {/* Barra de Progresso */}
              <div className="mb-3">
                <div className="flex justify-between text-sm font-medium text-green-700 mb-1">
                  <span>Progresso</span>
                  <span>{(((totalReceitas * 0.6) / 18000) * 100).toFixed(0)}%</span>
            </div>
                <div className="w-full bg-green-200 rounded-full h-2 relative">
                  {/* Barra base (0-100%) */}
                  <div 
                    className="bg-gradient-to-r from-green-500 to-green-600 h-2 rounded-full transition-all duration-300"
                    style={{ width: `${Math.min(100, (((totalReceitas * 0.6) / 18000) * 100))}%` }}
                  ></div>
                  {/* Barra de excesso (>100%) */}
                  {(((totalReceitas * 0.6) / 18000) * 100) > 100 && (
                    <div 
                      className="absolute top-0 left-0 bg-gradient-to-r from-green-700 to-green-800 h-2 rounded-full transition-all duration-300"
                      style={{ width: `${Math.min(100, ((((totalReceitas * 0.6) / 18000) * 100) - 100))}%` }}
                    ></div>
                  )}
            </div>
            </div>
            
              {/* Valores Alcançado/Restante */}
              <div className="text-sm text-green-700 font-medium">
                R$ {(totalReceitas * 0.6).toLocaleString('pt-BR', { minimumFractionDigits: 2 })} / R$ {Math.max(0, 18000 - (totalReceitas * 0.6)).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
            </div>
          </div>
          
            <div className="bg-gradient-to-br from-teal-50 to-teal-100 p-6 rounded-2xl border border-teal-200 shadow-lg">
              <h3 className="text-lg font-bold text-teal-800 mb-4">Faturamento Atacado</h3>
              <div className="text-2xl font-bold text-teal-900 mb-4">
                R$ {(totalReceitas * 0.3).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
          </div>
              
              {/* Barra de Progresso */}
              <div className="mb-3">
                <div className="flex justify-between text-sm font-medium text-teal-700 mb-1">
                  <span>Progresso</span>
                  <span>{(((totalReceitas * 0.3) / 12000) * 100).toFixed(0)}%</span>
        </div>
                <div className="w-full bg-teal-200 rounded-full h-2 relative">
                  {/* Barra base (0-100%) */}
                  <div 
                    className="bg-gradient-to-r from-teal-500 to-teal-600 h-2 rounded-full transition-all duration-300"
                    style={{ width: `${Math.min(100, (((totalReceitas * 0.3) / 12000) * 100))}%` }}
                  ></div>
                  {/* Barra de excesso (>100%) */}
                  {(((totalReceitas * 0.3) / 12000) * 100) > 100 && (
                    <div 
                      className="absolute top-0 left-0 bg-gradient-to-r from-teal-700 to-teal-800 h-2 rounded-full transition-all duration-300"
                      style={{ width: `${Math.min(100, ((((totalReceitas * 0.3) / 12000) * 100) - 100))}%` }}
                    ></div>
                  )}
      </div>
            </div>
            
              {/* Valores Alcançado/Restante */}
              <div className="text-sm text-teal-700 font-medium">
                R$ {(totalReceitas * 0.3).toLocaleString('pt-BR', { minimumFractionDigits: 2 })} / R$ {Math.max(0, 12000 - (totalReceitas * 0.3)).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </div>
              </div>
            </div>
            </div>
            
        {/* 3. DESPESAS */}
        <div className="space-y-4">
          <h2 className="text-2xl font-bold text-red-800 flex items-center gap-3">
            <TrendingDown className="w-6 h-6 text-red-600" />
            Despesas
          </h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <div className="bg-gradient-to-br from-red-50 to-red-100 p-6 rounded-2xl border border-red-200 shadow-lg">
              <h3 className="text-lg font-bold text-red-800 mb-4">Despesas TOTAL</h3>
              <div className="text-2xl font-bold text-red-900 mb-4">
                R$ {totalDespesas.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
            </div>
            
              {/* Barra de Progresso (Para despesas, menos é melhor) */}
              <div className="mb-3">
                <div className="flex justify-between text-sm font-medium text-red-700 mb-1">
                  <span>Limite</span>
                  <span>{((totalDespesas / 15000) * 100).toFixed(0)}%</span>
            </div>
                <div className="w-full bg-red-200 rounded-full h-2 relative">
                  {/* Barra base (0-100%) */}
                  <div 
                    className="bg-gradient-to-r from-red-500 to-red-600 h-2 rounded-full transition-all duration-300"
                    style={{ width: `${Math.min(100, ((totalDespesas / 15000) * 100))}%` }}
                  ></div>
                  {/* Barra de excesso (>100%) */}
                  {((totalDespesas / 15000) * 100) > 100 && (
                    <div 
                      className="absolute top-0 left-0 bg-gradient-to-r from-red-700 to-red-900 h-2 rounded-full transition-all duration-300"
                      style={{ width: `${Math.min(100, (((totalDespesas / 15000) * 100) - 100))}%` }}
                    ></div>
                  )}
            </div>
          </div>
          
              {/* Valores Usado/Restante */}
              <div className="text-sm text-red-700 font-medium">
                R$ {totalDespesas.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} / R$ {Math.max(0, 15000 - totalDespesas).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
          </div>
        </div>

            <div className="bg-gradient-to-br from-orange-50 to-orange-100 p-6 rounded-2xl border border-orange-200 shadow-lg">
              <h3 className="text-lg font-bold text-orange-800 mb-4">Despesas Variáveis</h3>
              <div className="text-2xl font-bold text-orange-900 mb-4">
                R$ {(totalDespesas * 0.7).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </div>
              
              {/* Barra de Progresso */}
              <div className="mb-3">
                <div className="flex justify-between text-sm font-medium text-orange-700 mb-1">
                  <span>Limite</span>
                  <span>{(((totalDespesas * 0.7) / 10500) * 100).toFixed(0)}%</span>
              </div>
                <div className="w-full bg-orange-200 rounded-full h-2 relative">
                  {/* Barra base (0-100%) */}
                  <div 
                    className="bg-gradient-to-r from-orange-500 to-orange-600 h-2 rounded-full transition-all duration-300"
                    style={{ width: `${Math.min(100, (((totalDespesas * 0.7) / 10500) * 100))}%` }}
                  ></div>
                  {/* Barra de excesso (>100%) */}
                  {(((totalDespesas * 0.7) / 10500) * 100) > 100 && (
                    <div 
                      className="absolute top-0 left-0 bg-gradient-to-r from-orange-700 to-orange-900 h-2 rounded-full transition-all duration-300"
                      style={{ width: `${Math.min(100, ((((totalDespesas * 0.7) / 10500) * 100) - 100))}%` }}
                    ></div>
                  )}
            </div>
              </div>
              
              {/* Valores Usado/Restante */}
              <div className="text-sm text-orange-700 font-medium">
                R$ {(totalDespesas * 0.7).toLocaleString('pt-BR', { minimumFractionDigits: 2 })} / R$ {Math.max(0, 10500 - (totalDespesas * 0.7)).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </div>
            </div>
            
            <div className="bg-gradient-to-br from-amber-50 to-amber-100 p-6 rounded-2xl border border-amber-200 shadow-lg">
              <h3 className="text-lg font-bold text-amber-800 mb-4">Despesas Fixas</h3>
              <div className="text-2xl font-bold text-amber-900 mb-4">
                R$ {(totalDespesas * 0.25).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </div>
              
              {/* Barra de Progresso */}
              <div className="mb-3">
                <div className="flex justify-between text-sm font-medium text-amber-700 mb-1">
                  <span>Limite</span>
                  <span>{(((totalDespesas * 0.25) / 4500) * 100).toFixed(0)}%</span>
              </div>
                <div className="w-full bg-amber-200 rounded-full h-2 relative">
                  {/* Barra base (0-100%) */}
                  <div 
                    className="bg-gradient-to-r from-amber-500 to-amber-600 h-2 rounded-full transition-all duration-300"
                    style={{ width: `${Math.min(100, (((totalDespesas * 0.25) / 4500) * 100))}%` }}
                  ></div>
                  {/* Barra de excesso (>100%) */}
                  {(((totalDespesas * 0.25) / 4500) * 100) > 100 && (
                    <div 
                      className="absolute top-0 left-0 bg-gradient-to-r from-amber-700 to-amber-900 h-2 rounded-full transition-all duration-300"
                      style={{ width: `${Math.min(100, ((((totalDespesas * 0.25) / 4500) * 100) - 100))}%` }}
                    ></div>
                  )}
            </div>
            </div>
            
              {/* Valores Usado/Restante */}
              <div className="text-sm text-amber-700 font-medium">
                R$ {(totalDespesas * 0.25).toLocaleString('pt-BR', { minimumFractionDigits: 2 })} / R$ {Math.max(0, 4500 - (totalDespesas * 0.25)).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
            </div>
          </div>
          </div>
        </div>

        {/* 4. INVESTIMENTOS */}
        <div className="space-y-4">
          <h2 className="text-2xl font-bold text-indigo-800 flex items-center gap-3">
            <ArrowUpCircle className="w-6 h-6 text-indigo-600" />
            Investimentos
          </h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-gradient-to-br from-blue-50 to-blue-100 p-6 rounded-2xl border border-blue-200 shadow-lg">
              <h3 className="text-lg font-bold text-blue-800 mb-4">Investimentos Gerais</h3>
              <div className="text-2xl font-bold text-blue-900 mb-4">
                R$ {(totalDespesas * 0.05).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </div>
              
              {/* Barra de Progresso */}
              <div className="mb-3">
                <div className="flex justify-between text-sm font-medium text-blue-700 mb-1">
                  <span>Meta</span>
                  <span>{(((totalDespesas * 0.05) / 2000) * 100).toFixed(0)}%</span>
                </div>
                <div className="w-full bg-blue-200 rounded-full h-2 relative">
                  {/* Barra base (0-100%) */}
                  <div 
                    className="bg-gradient-to-r from-blue-500 to-blue-600 h-2 rounded-full transition-all duration-300"
                    style={{ width: `${Math.min(100, (((totalDespesas * 0.05) / 2000) * 100))}%` }}
                  ></div>
                  {/* Barra de excesso (>100%) */}
                  {(((totalDespesas * 0.05) / 2000) * 100) > 100 && (
                    <div 
                      className="absolute top-0 left-0 bg-gradient-to-r from-blue-700 to-blue-900 h-2 rounded-full transition-all duration-300"
                      style={{ width: `${Math.min(100, ((((totalDespesas * 0.05) / 2000) * 100) - 100))}%` }}
                    ></div>
                  )}
                </div>
              </div>
              
              {/* Valores Alcançado/Restante */}
              <div className="text-sm text-blue-700 font-medium">
                R$ {(totalDespesas * 0.05).toLocaleString('pt-BR', { minimumFractionDigits: 2 })} / R$ {Math.max(0, 2000 - (totalDespesas * 0.05)).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </div>
            </div>

            <div className="bg-gradient-to-br from-purple-50 to-purple-100 p-6 rounded-2xl border border-purple-200 shadow-lg">
              <h3 className="text-lg font-bold text-purple-800 mb-4">Investimentos em MKT</h3>
              <div className="text-2xl font-bold text-purple-900 mb-4">
                R$ {(totalReceitas * 0.1).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </div>
              
              {/* Barra de Progresso */}
              <div className="mb-3">
                <div className="flex justify-between text-sm font-medium text-purple-700 mb-1">
                  <span>Meta</span>
                  <span>{(((totalReceitas * 0.1) / 3000) * 100).toFixed(0)}%</span>
                </div>
                <div className="w-full bg-purple-200 rounded-full h-2 relative">
                  {/* Barra base (0-100%) */}
                  <div 
                    className="bg-gradient-to-r from-purple-500 to-purple-600 h-2 rounded-full transition-all duration-300"
                    style={{ width: `${Math.min(100, (((totalReceitas * 0.1) / 3000) * 100))}%` }}
                  ></div>
                  {/* Barra de excesso (>100%) */}
                  {(((totalReceitas * 0.1) / 3000) * 100) > 100 && (
                    <div 
                      className="absolute top-0 left-0 bg-gradient-to-r from-purple-700 to-purple-900 h-2 rounded-full transition-all duration-300"
                      style={{ width: `${Math.min(100, ((((totalReceitas * 0.1) / 3000) * 100) - 100))}%` }}
                    ></div>
                  )}
                </div>
              </div>
              
              {/* Valores Alcançado/Restante */}
              <div className="text-sm text-purple-700 font-medium">
                R$ {(totalReceitas * 0.1).toLocaleString('pt-BR', { minimumFractionDigits: 2 })} / R$ {Math.max(0, 3000 - (totalReceitas * 0.1)).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // Função para renderizar um mês completo
  const renderMonth = (monthName: string, monthIndex: number, metaValue: number, saldoInicial: number = 31970.50) => {
    return (
      <div key={monthName} className="space-y-6 mb-12">
        {/* Título Principal do Mês */}
        <div className="bg-gradient-to-r from-blue-500 to-indigo-600 p-6 rounded-2xl shadow-lg">
          <h2 className="text-3xl font-bold text-white text-center uppercase tracking-wider">
            {monthName} - 2025
          </h2>
              </div>
              
        {/* Conteúdo do Mês */}
        {renderMonthContent(monthName, monthIndex, metaValue, saldoInicial)}
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

    // Metas totais do ano
    const metasDoAno = [18500, 19200, 20100, 19800, 20500, 21000, 21500, 22000, 21889.17, 23000, 25000, 28000]
    const metaTotalAno = metasDoAno.reduce((sum, meta) => sum + meta, 0)
    const saldoInicialAno = 31970.50

    return (
      <div className="space-y-6 mb-12">
        {/* Título Principal do Ano */}
        <div className="bg-gradient-to-r from-purple-500 to-indigo-600 p-8 rounded-2xl shadow-xl">
          <h2 className="text-4xl font-bold text-white text-center uppercase tracking-wider">
            TOTAL DO ANO - 2025
          </h2>
              </div>
              
        {/* 1. RESULTADO ANUAL */}
          <div className="space-y-4">
          <h2 className="text-3xl font-bold text-purple-800 flex items-center gap-3">
            <PieChart className="w-8 h-8 text-purple-600" />
            Resultado Anual
          </h2>
          
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Quadrante Financeiro Anual */}
            <div className="bg-gradient-to-br from-purple-50 to-indigo-50 p-8 rounded-2xl shadow-lg border-2 border-purple-200">
              <div className="space-y-4">
                {/* REFORÇO DE CAIXA */}
                <div className="flex justify-between items-center py-3 border-b-2 border-purple-200">
                  <span className="font-bold text-purple-800 text-lg">REFORÇO DE CAIXA</span>
                  <span className="font-bold text-purple-900 text-lg">R$ 0,00</span>
          </div>
              
                {/* SAÍDA DE CAIXA */}
                <div className="flex justify-between items-center py-3 border-b-2 border-purple-200">
                  <span className="font-bold text-purple-800 text-lg">SAÍDA DE CAIXA</span>
                  <span className="font-bold text-purple-900 text-lg">R$ 0,00</span>
              </div>
              
                {/* RECEITA ANUAL */}
                <div className="flex justify-between items-center py-3 border-b-2 border-purple-200">
                  <span className="font-bold text-purple-800 text-lg">RECEITA ANUAL</span>
                  <span className="font-bold text-purple-900 text-lg">
                    R$ {totalReceitasAno.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </span>
            </div>
            
                {/* DESPESA ANUAL */}
                <div className="flex justify-between items-center py-3 border-b-2 border-purple-200">
                  <span className="font-bold text-purple-800 text-lg">DESPESA ANUAL</span>
                  <span className="font-bold text-purple-900 text-lg">
                    -R$ {totalDespesasAno.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </span>
              </div>
              
                {/* SALDO FINAL ANUAL */}
                <div className="flex justify-between items-center py-3 bg-purple-100 rounded-lg px-3">
                  <span className="font-bold text-purple-900 text-lg">SALDO FINAL ANUAL</span>
                  <span className="font-bold text-purple-900 text-lg">
                    R$ {(saldoInicialAno + totalReceitasAno - totalDespesasAno).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </span>
                </div>
              </div>
            </div>
            
            {/* Quadrante de Metas Anuais */}
            <div className="bg-gradient-to-br from-blue-50 to-indigo-50 p-8 rounded-2xl shadow-lg border-2 border-blue-200">
              <div className="space-y-4">
                <h3 className="text-xl font-bold text-blue-800 text-center mb-4">META ANUAL</h3>
                
                {/* META ESTABELECIDA ANUAL */}
                <div className="flex justify-between items-center py-3 border-b-2 border-blue-200">
                  <span className="font-bold text-blue-800 text-lg">META ESTABELECIDA</span>
                  <span className="font-bold text-blue-900 text-lg">
                    R$ {metaTotalAno.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </span>
            </div>
            
                {/* RESULTADO REAL ANUAL */}
                <div className="flex justify-between items-center py-3 border-b-2 border-blue-200">
                  <span className="font-bold text-blue-800 text-lg">RESULTADO REAL</span>
                  <span className={`font-bold text-lg ${(totalReceitasAno - totalDespesasAno) >= metaTotalAno ? 'text-green-600' : 'text-red-600'}`}>
                    R$ {(totalReceitasAno - totalDespesasAno).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </span>
              </div>
              
                {/* DIFERENÇA ANUAL */}
                <div className="flex justify-between items-center py-3 bg-blue-100 rounded-lg px-3">
                  <span className="font-bold text-blue-900 text-lg">DIFERENÇA</span>
                  <span className={`font-bold text-lg ${(totalReceitasAno - totalDespesasAno) >= metaTotalAno ? 'text-green-600' : 'text-red-600'}`}>
                    {((totalReceitasAno - totalDespesasAno) >= metaTotalAno ? '+' : '')}
                    R$ {((totalReceitasAno - totalDespesasAno) - metaTotalAno).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </span>
              </div>
              
                {/* STATUS ANUAL */}
                <div className="text-center py-2">
                  <span className={`inline-block px-4 py-2 rounded-full font-bold text-sm ${
                    (totalReceitasAno - totalDespesasAno) >= metaTotalAno 
                      ? 'bg-green-100 text-green-800' 
                      : 'bg-red-100 text-red-800'
                  }`}>
                    {(totalReceitasAno - totalDespesasAno) >= metaTotalAno ? '✅ META ANUAL ATINGIDA' : '❌ META ANUAL NÃO ATINGIDA'}
                  </span>
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
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <div className="bg-gradient-to-br from-emerald-100 to-emerald-200 p-8 rounded-2xl border-2 border-emerald-300 shadow-xl">
              <h3 className="text-xl font-bold text-emerald-900 mb-6">Faturamento TOTAL ANUAL</h3>
              <div className="text-3xl font-bold text-emerald-900 mb-4">
                R$ {totalReceitasAno.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </div>
              {/* Barra de Progresso Anual */}
              <div className="mb-3">
                <div className="flex justify-between text-sm font-medium text-emerald-800 mb-1">
                  <span>Meta Anual</span>
                  <span>{((totalReceitasAno / (30000 * 12)) * 100).toFixed(0)}%</span>
                </div>
                <div className="w-full bg-emerald-300 rounded-full h-3 relative">
                  {/* Barra base (0-100%) */}
                  <div 
                    className="bg-gradient-to-r from-emerald-600 to-emerald-700 h-3 rounded-full transition-all duration-300"
                    style={{ width: `${Math.min(100, ((totalReceitasAno / (30000 * 12)) * 100))}%` }}
                  ></div>
                  {/* Barra de excesso (>100%) */}
                  {((totalReceitasAno / (30000 * 12)) * 100) > 100 && (
                    <div 
                      className="absolute top-0 left-0 bg-gradient-to-r from-emerald-800 to-emerald-900 h-3 rounded-full transition-all duration-300"
                      style={{ width: `${Math.min(100, (((totalReceitasAno / (30000 * 12)) * 100) - 100))}%` }}
                    ></div>
                  )}
                </div>
              </div>
              {/* Valores Alcançado/Restante */}
              <div className="text-sm text-emerald-800 font-medium">
                R$ {totalReceitasAno.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} / R$ {Math.max(0, (30000 * 12) - totalReceitasAno).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </div>
            </div>
            <div className="bg-gradient-to-br from-green-100 to-green-200 p-8 rounded-2xl border-2 border-green-300 shadow-xl">
              <h3 className="text-xl font-bold text-green-900 mb-6">Faturamento Varejo Anual</h3>
              <div className="text-3xl font-bold text-green-900 mb-4">
                R$ {(totalReceitasAno * 0.6).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </div>
              {/* Barra de Progresso Anual */}
              <div className="mb-3">
                <div className="flex justify-between text-sm font-medium text-green-800 mb-1">
                  <span>Meta Anual</span>
                  <span>{((((totalReceitasAno * 0.6)) / (18000 * 12)) * 100).toFixed(0)}%</span>
                </div>
                <div className="w-full bg-green-300 rounded-full h-3 relative">
                  <div 
                    className="bg-gradient-to-r from-green-600 to-green-700 h-3 rounded-full transition-all duration-300"
                    style={{ width: `${Math.min(100, ((((totalReceitasAno * 0.6)) / (18000 * 12)) * 100))}%` }}
                  ></div>
                  {((((totalReceitasAno * 0.6)) / (18000 * 12)) * 100) > 100 && (
                    <div 
                      className="absolute top-0 left-0 bg-gradient-to-r from-green-800 to-green-900 h-3 rounded-full transition-all duration-300"
                      style={{ width: `${Math.min(100, (((((totalReceitasAno * 0.6)) / (18000 * 12)) * 100) - 100))}%` }}
                    ></div>
                  )}
                </div>
              </div>
              <div className="text-sm text-green-800 font-medium">
                R$ {(totalReceitasAno * 0.6).toLocaleString('pt-BR', { minimumFractionDigits: 2 })} / R$ {Math.max(0, (18000 * 12) - (totalReceitasAno * 0.6)).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </div>
            </div>
            <div className="bg-gradient-to-br from-teal-100 to-teal-200 p-8 rounded-2xl border-2 border-teal-300 shadow-xl">
              <h3 className="text-xl font-bold text-teal-900 mb-6">Faturamento Atacado Anual</h3>
              <div className="text-3xl font-bold text-teal-900 mb-4">
                R$ {(totalReceitasAno * 0.3).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </div>
              {/* Barra de Progresso Anual */}
              <div className="mb-3">
                <div className="flex justify-between text-sm font-medium text-teal-800 mb-1">
                  <span>Meta Anual</span>
                  <span>{((((totalReceitasAno * 0.3)) / (12000 * 12)) * 100).toFixed(0)}%</span>
                </div>
                <div className="w-full bg-teal-300 rounded-full h-3 relative">
                  <div 
                    className="bg-gradient-to-r from-teal-600 to-teal-700 h-3 rounded-full transition-all duration-300"
                    style={{ width: `${Math.min(100, ((((totalReceitasAno * 0.3)) / (12000 * 12)) * 100))}%` }}
                  ></div>
                  {((((totalReceitasAno * 0.3)) / (12000 * 12)) * 100) > 100 && (
                    <div 
                      className="absolute top-0 left-0 bg-gradient-to-r from-teal-800 to-teal-900 h-3 rounded-full transition-all duration-300"
                      style={{ width: `${Math.min(100, (((((totalReceitasAno * 0.3)) / (12000 * 12)) * 100) - 100))}%` }}
                    ></div>
                  )}
                </div>
              </div>
              <div className="text-sm text-teal-800 font-medium">
                R$ {(totalReceitasAno * 0.3).toLocaleString('pt-BR', { minimumFractionDigits: 2 })} / R$ {Math.max(0, (12000 * 12) - (totalReceitasAno * 0.3)).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
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
            <div className="bg-gradient-to-br from-red-100 to-red-200 p-8 rounded-2xl border-2 border-red-300 shadow-xl">
              <h3 className="text-xl font-bold text-red-900 mb-6">Despesas TOTAL Anuais</h3>
              <div className="text-3xl font-bold text-red-900 mb-4">
                R$ {totalDespesasAno.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </div>
              {/* Barra de Progresso Anual */}
              <div className="mb-3">
                <div className="flex justify-between text-sm font-medium text-red-800 mb-1">
                  <span>Limite Anual</span>
                  <span>{((totalDespesasAno / 180000) * 100).toFixed(0)}%</span>
                </div>
                <div className="w-full bg-red-300 rounded-full h-3 relative">
                  <div 
                    className="bg-gradient-to-r from-red-600 to-red-700 h-3 rounded-full transition-all duration-300"
                    style={{ width: `${Math.min(100, ((totalDespesasAno / 180000) * 100))}%` }}
                  ></div>
                  {((totalDespesasAno / 180000) * 100) > 100 && (
                    <div 
                      className="absolute top-0 left-0 bg-gradient-to-r from-red-800 to-red-900 h-3 rounded-full transition-all duration-300"
                      style={{ width: `${Math.min(100, (((totalDespesasAno / 180000) * 100) - 100))}%` }}
                    ></div>
                  )}
                </div>
              </div>
              {/* Valores Usado/Restante */}
              <div className="text-sm text-red-800 font-medium">
                R$ {totalDespesasAno.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} / R$ {Math.max(0, 180000 - totalDespesasAno).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </div>
            </div>
            <div className="bg-gradient-to-br from-orange-100 to-orange-200 p-8 rounded-2xl border-2 border-orange-300 shadow-xl">
              <h3 className="text-xl font-bold text-orange-900 mb-6">Despesas Variáveis Anuais</h3>
              <div className="text-3xl font-bold text-orange-900 mb-4">
                R$ {(totalDespesasAno * 0.7).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </div>
              <div className="mb-3">
                <div className="flex justify-between text-sm font-medium text-orange-800 mb-1">
                  <span>Limite Anual</span>
                  <span>{(((totalDespesasAno * 0.7) / 126000) * 100).toFixed(0)}%</span>
                </div>
                <div className="w-full bg-orange-300 rounded-full h-3 relative">
                  <div 
                    className="bg-gradient-to-r from-orange-600 to-orange-700 h-3 rounded-full transition-all duration-300"
                    style={{ width: `${Math.min(100, (((totalDespesasAno * 0.7) / 126000) * 100))}%` }}
                  ></div>
                  {(((totalDespesasAno * 0.7) / 126000) * 100) > 100 && (
                    <div 
                      className="absolute top-0 left-0 bg-gradient-to-r from-orange-800 to-orange-900 h-3 rounded-full transition-all duration-300"
                      style={{ width: `${Math.min(100, ((((totalDespesasAno * 0.7) / 126000) * 100) - 100))}%` }}
                    ></div>
                  )}
                </div>
              </div>
              <div className="text-sm text-orange-800 font-medium">
                R$ {(totalDespesasAno * 0.7).toLocaleString('pt-BR', { minimumFractionDigits: 2 })} / R$ {Math.max(0, 126000 - (totalDespesasAno * 0.7)).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </div>
            </div>
            <div className="bg-gradient-to-br from-amber-100 to-amber-200 p-8 rounded-2xl border-2 border-amber-300 shadow-xl">
              <h3 className="text-xl font-bold text-amber-900 mb-6">Despesas Fixas Anuais</h3>
              <div className="text-3xl font-bold text-amber-900 mb-4">
                R$ {(totalDespesasAno * 0.25).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </div>
              <div className="mb-3">
                <div className="flex justify-between text-sm font-medium text-amber-800 mb-1">
                  <span>Limite Anual</span>
                  <span>{(((totalDespesasAno * 0.25) / 54000) * 100).toFixed(0)}%</span>
                </div>
                <div className="w-full bg-amber-300 rounded-full h-3 relative">
                  <div 
                    className="bg-gradient-to-r from-amber-600 to-amber-700 h-3 rounded-full transition-all duration-300"
                    style={{ width: `${Math.min(100, (((totalDespesasAno * 0.25) / 54000) * 100))}%` }}
                  ></div>
                  {(((totalDespesasAno * 0.25) / 54000) * 100) > 100 && (
                    <div 
                      className="absolute top-0 left-0 bg-gradient-to-r from-amber-800 to-amber-900 h-3 rounded-full transition-all duration-300"
                      style={{ width: `${Math.min(100, ((((totalDespesasAno * 0.25) / 54000) * 100) - 100))}%` }}
                    ></div>
                  )}
                </div>
              </div>
              <div className="text-sm text-amber-800 font-medium">
                R$ {(totalDespesasAno * 0.25).toLocaleString('pt-BR', { minimumFractionDigits: 2 })} / R$ {Math.max(0, 54000 - (totalDespesasAno * 0.25)).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
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
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-gradient-to-br from-blue-100 to-blue-200 p-8 rounded-2xl border-2 border-blue-300 shadow-xl">
              <h3 className="text-xl font-bold text-blue-900 mb-6">Investimentos Gerais Anuais</h3>
              <div className="text-3xl font-bold text-blue-900 mb-4">
                R$ {(totalDespesasAno * 0.05).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </div>
              <div className="mb-3">
                <div className="flex justify-between text-sm font-medium text-blue-800 mb-1">
                  <span>Meta Anual</span>
                  <span>{(((totalDespesasAno * 0.05) / 24000) * 100).toFixed(0)}%</span>
                </div>
                <div className="w-full bg-blue-300 rounded-full h-3 relative">
                  <div 
                    className="bg-gradient-to-r from-blue-600 to-blue-700 h-3 rounded-full transition-all duration-300"
                    style={{ width: `${Math.min(100, (((totalDespesasAno * 0.05) / 24000) * 100))}%` }}
                  ></div>
                  {(((totalDespesasAno * 0.05) / 24000) * 100) > 100 && (
                    <div 
                      className="absolute top-0 left-0 bg-gradient-to-r from-blue-800 to-blue-900 h-3 rounded-full transition-all duration-300"
                      style={{ width: `${Math.min(100, ((((totalDespesasAno * 0.05) / 24000) * 100) - 100))}%` }}
                    ></div>
                  )}
                </div>
              </div>
              <div className="text-sm text-blue-800 font-medium">
                R$ {(totalDespesasAno * 0.05).toLocaleString('pt-BR', { minimumFractionDigits: 2 })} / R$ {Math.max(0, 24000 - (totalDespesasAno * 0.05)).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </div>
            </div>
            <div className="bg-gradient-to-br from-purple-100 to-purple-200 p-8 rounded-2xl border-2 border-purple-300 shadow-xl">
              <h3 className="text-xl font-bold text-purple-900 mb-6">Investimentos MKT Anuais</h3>
              <div className="text-3xl font-bold text-purple-900 mb-4">
                R$ {(totalReceitasAno * 0.1).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </div>
              <div className="mb-3">
                <div className="flex justify-between text-sm font-medium text-purple-800 mb-1">
                  <span>Meta Anual</span>
                  <span>{(((totalReceitasAno * 0.1) / 36000) * 100).toFixed(0)}%</span>
                </div>
                <div className="w-full bg-purple-300 rounded-full h-3 relative">
                  <div 
                    className="bg-gradient-to-r from-purple-600 to-purple-700 h-3 rounded-full transition-all duration-300"
                    style={{ width: `${Math.min(100, (((totalReceitasAno * 0.1) / 36000) * 100))}%` }}
                  ></div>
                  {(((totalReceitasAno * 0.1) / 36000) * 100) > 100 && (
                    <div 
                      className="absolute top-0 left-0 bg-gradient-to-r from-purple-800 to-purple-900 h-3 rounded-full transition-all duration-300"
                      style={{ width: `${Math.min(100, ((((totalReceitasAno * 0.1) / 36000) * 100) - 100))}%` }}
                    ></div>
                  )}
                </div>
              </div>
              <div className="text-sm text-purple-800 font-medium">
                R$ {(totalReceitasAno * 0.1).toLocaleString('pt-BR', { minimumFractionDigits: 2 })} / R$ {Math.max(0, 36000 - (totalReceitasAno * 0.1)).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </div>
            </div>
          </div>
        </div>
      </div>
    )
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
          <button
            onClick={() => alert("Ferramenta em construção")}
            className="flex items-center gap-3 px-6 py-3 bg-gradient-to-r from-blue-500 to-indigo-600 text-white font-semibold rounded-xl hover:from-blue-600 hover:to-indigo-700 shadow-lg hover:shadow-xl transform hover:-translate-y-1 transition-all duration-300"
          >
            <Plus className="h-5 w-5" />
            Nova Meta
          </button>
              </div>
              
        {/* Renderizar Mês Selecionado com Dropdown Integrado */}
        {mesSelecionado && (
          <div className="space-y-6 mb-12">
            {/* Dropdown do Mês Selecionado */}
            <div className="bg-gradient-to-r from-blue-500 to-indigo-600 p-6 rounded-2xl shadow-lg">
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
            {renderMonthContent(mesSelecionado.nome, mesSelecionado.indice, mesSelecionado.meta, 31970.50)}
              </div>
        )}

        {/* Renderizar Total do Ano */}
        {renderTotalAno()}

        {/* Renderizar todos os 12 meses em ordem normal */}
        {mesesMetas.map((mes) => 
          renderMonth(mes.nome, mes.indice, mes.meta, 31970.50)
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
        <div className="bg-white p-6 rounded-2xl shadow-lg border border-gray-100 mt-4">
          <h3 className="text-lg font-bold text-gray-800 mb-4">{title}</h3>
          <div className="flex items-center justify-center h-64">
            <div className="text-center">
              <div className="text-3xl font-bold text-gray-800 mb-2">
                {hasData ? `R$ ${data[0].value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : 'Sem dados'}
              </div>
              <div className="text-sm text-gray-600">
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
        <button 
            onClick={() => setActiveTab('transactions')}
            className="flex items-center gap-3 px-6 py-3 bg-gradient-to-r from-blue-500 to-indigo-600 text-white font-semibold rounded-xl hover:from-blue-600 hover:to-indigo-700 shadow-lg hover:shadow-xl transform hover:-translate-y-1 transition-all duration-300"
        >
            <Plus className="h-5 w-5" />
          Nova Transação
        </button>
      </div>

        {/* Seção Mês Atual */}
          <div className="space-y-4">
          <h2 className="text-2xl font-bold text-gray-800 flex items-center gap-3">
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
                  className="bg-gradient-to-br from-green-500 to-green-600 p-6 rounded-2xl shadow-lg cursor-pointer hover:shadow-xl transition-all duration-200 hover:-translate-y-1"
                  onClick={() => toggleChart('receitas-mensal')}
                >
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-white bg-opacity-20 rounded-xl flex items-center justify-center">
                      <DollarSign className="h-6 w-6 text-white" />
            </div>
              <div>
                      <p className="text-sm font-bold text-white text-opacity-80 uppercase tracking-wide">Receitas</p>
                      <p className="text-2xl font-bold text-white mt-1">
                        R$ {totalReceitasMes.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </p>
            </div>
          </div>
            </div>
                {expandedCharts.includes('receitas-mensal') && renderPieChart(pieChartData, 'Distribuição Mensal: Receitas vs Despesas')}
        </div>

              {/* Card Despesas */}
              <div className="space-y-4">
                <div 
                  className="bg-gradient-to-br from-red-500 to-red-600 p-6 rounded-2xl shadow-lg cursor-pointer hover:shadow-xl transition-all duration-200 hover:-translate-y-1"
                  onClick={() => toggleChart('despesas-mensal')}
                >
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-white bg-opacity-20 rounded-xl flex items-center justify-center">
                      <TrendingDown className="h-6 w-6 text-white" />
            </div>
              <div>
                      <p className="text-sm font-bold text-white text-opacity-80 uppercase tracking-wide">Despesas</p>
                      <p className="text-2xl font-bold text-white mt-1">
                        R$ {totalDespesasMes.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </p>
            </div>
          </div>
          </div>
                {expandedCharts.includes('despesas-mensal') && renderPieChart(pieChartData, 'Distribuição Mensal: Receitas vs Despesas')}
        </div>

              {/* Card Saldo */}
          <div className="space-y-4">
                <div 
                  className={`p-6 rounded-2xl shadow-lg cursor-pointer hover:shadow-xl transition-all duration-200 hover:-translate-y-1 ${
                    lucroLiquidoMes >= 0 ? 'bg-gradient-to-br from-yellow-500 to-yellow-600' : 'bg-gradient-to-br from-red-500 to-red-600'
                  }`}
                  onClick={() => toggleChart('saldo-mensal')}
                >
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-white bg-opacity-20 rounded-xl flex items-center justify-center">
                      <BarChart3 className="h-6 w-6 text-white" />
            </div>
              <div>
                      <p className="text-sm font-bold text-white text-opacity-80 uppercase tracking-wide">Saldo</p>
                      <p className={`text-2xl font-bold mt-1 ${
                        lucroLiquidoMes >= 0 ? 'text-green-900' : 'text-red-900'
                      }`}>
                        R$ {lucroLiquidoMes.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
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
          <h2 className="text-2xl font-bold text-cyan-800 flex items-center gap-3">
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
                  className="bg-gradient-to-br from-green-500 to-green-600 p-6 rounded-2xl shadow-lg cursor-pointer hover:shadow-xl transition-all duration-200 hover:-translate-y-1"
                  onClick={() => toggleChart('receitas-trimestre')}
                >
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-white bg-opacity-20 rounded-xl flex items-center justify-center">
                      <DollarSign className="h-6 w-6 text-white" />
            </div>
              <div>
                      <p className="text-sm font-bold text-white text-opacity-80 uppercase tracking-wide">Receitas</p>
                      <p className="text-2xl font-bold text-white mt-1">
                        R$ {totalReceitasTrimestre.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </p>
            </div>
            </div>
          </div>
                {expandedCharts.includes('receitas-trimestre') && renderPieChart(pieChartDataTrimestre, 'Distribuição Trimestral: Receitas vs Despesas')}
        </div>

              {/* Card Despesas Trimestrais */}
              <div className="space-y-4">
                <div 
                  className="bg-gradient-to-br from-red-500 to-red-600 p-6 rounded-2xl shadow-lg cursor-pointer hover:shadow-xl transition-all duration-200 hover:-translate-y-1"
                  onClick={() => toggleChart('despesas-trimestre')}
                >
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-white bg-opacity-20 rounded-xl flex items-center justify-center">
                      <TrendingDown className="h-6 w-6 text-white" />
              </div>
            <div>
                      <p className="text-sm font-bold text-white text-opacity-80 uppercase tracking-wide">Despesas</p>
                      <p className="text-2xl font-bold text-white mt-1">
                        R$ {totalDespesasTrimestre.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </p>
          </div>
        </div>
      </div>
                {expandedCharts.includes('despesas-trimestre') && renderPieChart(pieChartDataTrimestre, 'Distribuição Trimestral: Receitas vs Despesas')}
    </div>

              {/* Card Saldo Trimestral */}
              <div className="space-y-4">
                <div 
                  className={`p-6 rounded-2xl shadow-lg cursor-pointer hover:shadow-xl transition-all duration-200 hover:-translate-y-1 ${
                    lucroLiquidoTrimestre >= 0 ? 'bg-gradient-to-br from-yellow-500 to-yellow-600' : 'bg-gradient-to-br from-red-500 to-red-600'
                  }`}
                  onClick={() => toggleChart('saldo-trimestre')}
                >
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-white bg-opacity-20 rounded-xl flex items-center justify-center">
                      <BarChart3 className="h-6 w-6 text-white" />
      </div>
              <div>
                      <p className="text-sm font-bold text-white text-opacity-80 uppercase tracking-wide">Saldo</p>
                      <p className={`text-2xl font-bold mt-1 ${
                        lucroLiquidoTrimestre >= 0 ? 'text-green-900' : 'text-red-900'
                      }`}>
                        R$ {lucroLiquidoTrimestre.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
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
          <h2 className="text-2xl font-bold text-purple-800 flex items-center gap-3">
            <PieChart className="w-6 h-6 text-purple-600" />
            Ano {currentYear}
          </h2>
          
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* Card Receitas Anuais */}
              <div className="space-y-4">
                <div 
                  className="bg-gradient-to-br from-green-500 to-green-600 p-6 rounded-2xl shadow-lg cursor-pointer hover:shadow-xl transition-all duration-200 hover:-translate-y-1"
                  onClick={() => toggleChart('receitas-anual')}
                >
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-white bg-opacity-20 rounded-xl flex items-center justify-center">
                      <DollarSign className="h-6 w-6 text-white" />
          </div>
              <div>
                      <p className="text-sm font-bold text-white text-opacity-80 uppercase tracking-wide">Receitas Anuais</p>
                      <p className="text-2xl font-bold text-white mt-1">
                        R$ {totalReceitasAno.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </p>
              </div>
            </div>
        </div>
                {expandedCharts.includes('receitas-anual') && renderPieChart(pieChartDataAnual, 'Distribuição Anual: Receitas vs Despesas')}
          </div>

              {/* Card Despesas Anuais */}
          <div className="space-y-4">
                <div 
                  className="bg-gradient-to-br from-red-500 to-red-600 p-6 rounded-2xl shadow-lg cursor-pointer hover:shadow-xl transition-all duration-200 hover:-translate-y-1"
                  onClick={() => toggleChart('despesas-anual')}
                >
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-white bg-opacity-20 rounded-xl flex items-center justify-center">
                      <TrendingDown className="h-6 w-6 text-white" />
              </div>
              <div>
                      <p className="text-sm font-bold text-white text-opacity-80 uppercase tracking-wide">Despesas Anuais</p>
                      <p className="text-2xl font-bold text-white mt-1">
                        R$ {totalDespesasAno.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </p>
              </div>
            </div>
      </div>
                {expandedCharts.includes('despesas-anual') && renderPieChart(pieChartDataAnual, 'Distribuição Anual: Receitas vs Despesas')}
          </div>

              {/* Card Saldo Anual */}
              <div className="space-y-4">
                <div 
                  className={`p-6 rounded-2xl shadow-lg cursor-pointer hover:shadow-xl transition-all duration-200 hover:-translate-y-1 ${
                    lucroLiquidoAno >= 0 ? 'bg-gradient-to-br from-yellow-500 to-yellow-600' : 'bg-gradient-to-br from-red-500 to-red-600'
                  }`}
                  onClick={() => toggleChart('saldo-anual')}
                >
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-white bg-opacity-20 rounded-xl flex items-center justify-center">
                      <BarChart3 className="h-6 w-6 text-white" />
              </div>
              <div>
                      <p className="text-sm font-bold text-white text-opacity-80 uppercase tracking-wide">Saldo Anual</p>
                      <p className={`text-2xl font-bold mt-1 ${
                        lucroLiquidoAno >= 0 ? 'text-green-900' : 'text-red-900'
                      }`}>
                        R$ {lucroLiquidoAno.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
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
          <h2 className="text-2xl font-bold text-gray-800 flex items-center gap-3">
            <DollarSign className="w-6 h-6 text-gray-600" />
            Transações Recentes
          </h2>
          
          <div className="bg-white rounded-2xl shadow-lg border border-gray-200 overflow-hidden">
            {transacoesRecentes.length === 0 ? (
              <div className="p-8 text-center">
                <p className="text-gray-500">Nenhuma transação encontrada.</p>
                <p className="text-sm text-gray-400 mt-1">Adicione suas primeiras transações para vê-las aqui.</p>
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
                          <p className="text-sm text-gray-500">{transacao.category}</p>
        </div>
            </div>
                      <div className="text-right">
                        <p className={`font-bold ${
                          transacao.type === 'Receita' ? 'text-emerald-600' : 'text-red-600'
                        }`}>
                          {transacao.type === 'Receita' ? '+' : '-'}R$ {transacao.value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        </p>
                        <p className="text-sm text-gray-500">
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
      
      <main className="max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8 pt-32">
        {activeTab === 'dashboard' && renderDashboard()}
        {activeTab === 'metas' && renderMetas()}
        {activeTab === 'transactions' && (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold text-gray-900">Transações</h1>
        <button 
                onClick={() => alert('Funcionalidade em desenvolvimento')}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors font-bold"
        >
          <Plus className="h-4 w-4 inline mr-2" />
          Nova Transação
        </button>
      </div>
            <p className="text-gray-600">Funcionalidade em desenvolvimento...</p>
            </div>
        )}
        {activeTab === 'projects' && (
          <div className="space-y-6">
            <h1 className="text-3xl font-bold text-gray-900">Projetos</h1>
            <p className="text-gray-600">Funcionalidade em desenvolvimento...</p>
            </div>
        )}
        {activeTab === 'services' && (
          <div className="space-y-6">
            <h1 className="text-3xl font-bold text-gray-900">Serviços</h1>
            <p className="text-gray-600">Funcionalidade em desenvolvimento...</p>
          </div>
        )}
        {activeTab === 'reports' && (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold text-gray-900">Relatórios</h1>
            <p className="text-gray-600">Funcionalidade em desenvolvimento...</p>
            </div>
        )}
        {activeTab === 'metas' && (
          <div className="space-y-6">
            <h1 className="text-3xl font-bold text-gray-900">Metas</h1>
            <p className="text-gray-600">Funcionalidade em desenvolvimento...</p>
            </div>
        )}
        {activeTab === 'projecao' && (
          <div className="space-y-6">
            <h1 className="text-3xl font-bold text-gray-900">Projeção Anual</h1>
            <p className="text-gray-600">Funcionalidade em desenvolvimento...</p>
            </div>
        )}
        {activeTab === 'clients' && (
    <div className="space-y-6">
        <h1 className="text-3xl font-bold text-gray-900">Clientes</h1>
            <p className="text-gray-600">Funcionalidade em desenvolvimento...</p>
      </div>
        )}
        {activeTab === 'dre' && (
      <div className="space-y-6">
            <h1 className="text-3xl font-bold text-gray-900">DRE</h1>
            <p className="text-gray-600">Funcionalidade em desenvolvimento...</p>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="bg-gray-800 text-white py-8 mt-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div>
              <div className="flex items-center mb-4">
                <img 
                  src="/logo_rodape.PNG" 
                  alt="Viver de PJ Logo" 
                  className="h-12 w-12 mr-2 object-contain"
                />
                <div>
                  <span className="text-lg font-bold">Viver de PJ</span>
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
              <h3 className="text-lg font-semibold mb-4">Contato</h3>
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
              <h3 className="text-lg font-semibold mb-4">Serviços</h3>
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
    </div>
  )
}

export default App