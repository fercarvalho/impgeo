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
        <div className="flex justify-between h-16 min-w-0">
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
              className={`px-3 py-2 rounded-md text-sm font-bold transition-colors ${
                activeTab === 'dashboard'
                  ? 'bg-blue-700 text-white'
                  : 'text-blue-200 hover:text-white hover:bg-blue-700'
              }`}
            >
              <Home className="h-4 w-4 inline mr-1" />
              Dashboard
            </button>
            <button
              onClick={() => setActiveTab('projects')}
              className={`px-3 py-2 rounded-md text-sm font-bold transition-colors ${
                activeTab === 'projects'
                  ? 'bg-blue-700 text-white'
                  : 'text-blue-200 hover:text-white hover:bg-blue-700'
              }`}
            >
              <Map className="h-4 w-4 inline mr-1" />
              Projetos
            </button>
            <button
              onClick={() => setActiveTab('services')}
              className={`px-3 py-2 rounded-md text-sm font-bold transition-colors ${
                activeTab === 'services'
                  ? 'bg-blue-700 text-white'
                  : 'text-blue-200 hover:text-white hover:bg-blue-700'
              }`}
            >
              <Target className="h-4 w-4 inline mr-1" />
              Serviços
            </button>
            <button
              onClick={() => setActiveTab('reports')}
              className={`px-3 py-2 rounded-md text-sm font-bold transition-colors ${
                activeTab === 'reports'
                  ? 'bg-blue-700 text-white'
                  : 'text-blue-200 hover:text-white hover:bg-blue-700'
              }`}
            >
              <BarChart3 className="h-4 w-4 inline mr-1" />
              Relatórios
            </button>
            <button
              onClick={() => setActiveTab('metas')}
              className={`px-3 py-2 rounded-md text-sm font-bold transition-colors ${
                activeTab === 'metas'
                  ? 'bg-blue-700 text-white'
                  : 'text-blue-200 hover:text-white hover:bg-blue-700'
              }`}
            >
              <TrendingUp className="h-4 w-4 inline mr-1" />
              Metas
            </button>
            <button
              onClick={() => setActiveTab('projecao')}
              className={`px-3 py-2 rounded-md text-sm font-bold transition-colors ${
                activeTab === 'projecao'
                  ? 'bg-blue-700 text-white'
                  : 'text-blue-200 hover:text-white hover:bg-blue-700'
              }`}
            >
              <Calculator className="h-4 w-4 inline mr-1" />
              Projeção Anual
            </button>
            <button
              onClick={() => setActiveTab('transactions')}
              className={`px-3 py-2 rounded-md text-sm font-bold transition-colors ${
                activeTab === 'transactions'
                  ? 'bg-blue-700 text-white'
                  : 'text-blue-200 hover:text-white hover:bg-blue-700'
              }`}
            >
              <FileText className="h-4 w-4 inline mr-1" />
              Transações
            </button>
            <button
              onClick={() => setActiveTab('clients')}
              className={`px-3 py-2 rounded-md text-sm font-bold transition-colors ${
                activeTab === 'clients'
                  ? 'bg-blue-700 text-white'
                  : 'text-blue-200 hover:text-white hover:bg-blue-700'
              }`}
            >
              <Building className="h-4 w-4 inline mr-1" />
              Clientes
            </button>
            <button
              onClick={() => setActiveTab('dre')}
              className={`px-3 py-2 rounded-md text-sm font-bold transition-colors ${
                activeTab === 'dre'
                  ? 'bg-blue-700 text-white'
                  : 'text-blue-200 hover:text-white hover:bg-blue-700'
              }`}
            >
              <BarChart3 className="h-4 w-4 inline mr-1" />
              DRE
            </button>
          </div>
        </div>
      </div>
    </nav>
  )

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
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
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
      
      <main className="max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8 pt-20">
        {activeTab === 'dashboard' && renderDashboard()}
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