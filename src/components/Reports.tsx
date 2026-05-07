import React, { useState, useMemo } from 'react'
import { BarChart3, Plus, TrendingUp, TrendingDown, DollarSign, Activity, ChevronDown, ChevronUp } from 'lucide-react'
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend
} from 'recharts'

export type TransactionType = 'Receita' | 'Despesa'

export interface Transaction {
  id: string
  date: string
  description: string
  value: number
  type: TransactionType
  category: string
}

interface ReportsProps {
  transactions: Transaction[]
}

// Bug #4: Força interpretação de datas como horário local (não UTC) para evitar
// desvio de 1 dia em fusos negativos como BRT (UTC-3)
const parseLocalDate = (dateStr: string): Date => {
  // Se for "YYYY-MM-DD", adiciona T00:00:00 para forçar horário local
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return new Date(dateStr + 'T00:00:00')
  }
  return new Date(dateStr)
}

const CHART_COLORS = ['#22c55e', '#3b82f6', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4']

const Reports: React.FC<ReportsProps> = ({ transactions }) => {
  const [expandedCharts, setExpandedCharts] = useState<string[]>([])

  const toggleChart = (id: string) => {
    setExpandedCharts(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }

  // Bug #6: Memoizar cálculos de datas de período para não recalcular a cada render
  const { transacoesSemana, transacoesMes, transacoesTrimestre, transacoesAno } = useMemo(() => {
    const agora = new Date()

    // Bug #11: Semana começa na segunda-feira (padrão brasileiro)
    const inicioSemana = new Date(agora)
    const diaSemana = agora.getDay() // 0=Dom, 1=Seg, ..., 6=Sáb
    const diasDesdeSegunda = diaSemana === 0 ? 6 : diaSemana - 1
    inicioSemana.setDate(agora.getDate() - diasDesdeSegunda)
    inicioSemana.setHours(0, 0, 0, 0)

    const inicioMes = new Date(agora.getFullYear(), agora.getMonth(), 1)
    const inicioTrimestre = new Date(agora.getFullYear(), Math.floor(agora.getMonth() / 3) * 3, 1)
    const inicioAno = new Date(agora.getFullYear(), 0, 1)

    return {
      transacoesSemana: transactions.filter(t => parseLocalDate(t.date) >= inicioSemana),
      transacoesMes: transactions.filter(t => parseLocalDate(t.date) >= inicioMes),
      transacoesTrimestre: transactions.filter(t => parseLocalDate(t.date) >= inicioTrimestre),
      transacoesAno: transactions.filter(t => parseLocalDate(t.date) >= inicioAno),
    }
  }, [transactions])

  const calcularVendasPorCategoria = (ts: Transaction[]) => {
    const mapa: Record<string, number> = {}
    ts.forEach(t => { if (t.type === 'Receita') { mapa[t.category] = (mapa[t.category] || 0) + t.value } })
    return Object.entries(mapa).map(([name, value], i) => ({ name, value, color: CHART_COLORS[i % CHART_COLORS.length] }))
  }

  const calcularDespesasPorCategoria = (ts: Transaction[]) => {
    const mapa: Record<string, number> = {}
    ts.forEach(t => { if (t.type === 'Despesa') { mapa[t.category] = (mapa[t.category] || 0) + t.value } })
    const cores = ['#ef4444', '#f97316', '#84cc16', '#f59e0b', '#8b5cf6']
    return Object.entries(mapa).map(([name, value], i) => ({ name, value, color: cores[i % cores.length] }))
  }

  const calcularVendasPorProduto = (ts: Transaction[]) => {
    const mapa: Record<string, number> = {}
    ts.forEach(t => { if (t.type === 'Receita') { const n = t.description || 'Produto'; mapa[n] = (mapa[n] || 0) + t.value } })
    const cores = ['#8b5cf6', '#ec4899', '#06b6d4', '#22c55e', '#3b82f6']
    return Object.entries(mapa)
      .sort(([,a], [,b]) => (b as number) - (a as number))
      .slice(0, 5)
      .map(([name, value], i) => ({ name, value: value as number, color: cores[i % cores.length] }))
  }

  // Bug #2: Adicionados tipos 'mes' e 'trimestre' para agrupamento correto por período
  const calcularProdutosPorPeriodo = (ts: Transaction[], tipo: 'dia' | 'semana' | 'mes' | 'trimestre') => {
    const produtosPorPeriodo: { [key: string]: { [key: string]: number } } = {}
    ts.forEach(t => {
      if (t.type === 'Receita') {
        const data = parseLocalDate(t.date)
        let chave: string
        if (tipo === 'dia') {
          const diasSemana = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']
          chave = diasSemana[data.getDay()]
        } else if (tipo === 'semana') {
          const semanaDoMes = Math.ceil(data.getDate() / 7)
          chave = `Sem ${semanaDoMes}`
        } else if (tipo === 'mes') {
          const meses = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']
          chave = meses[data.getMonth()]
        } else {
          // trimestre
          const tri = Math.floor(data.getMonth() / 3) + 1
          chave = `T${tri} ${data.getFullYear()}`
        }
        if (!produtosPorPeriodo[chave]) produtosPorPeriodo[chave] = {}
        const nomeProduto = t.description || 'Produto'
        produtosPorPeriodo[chave][nomeProduto] = (produtosPorPeriodo[chave][nomeProduto] || 0) + 1
      }
    })
    return Object.entries(produtosPorPeriodo).map(([nome, produtos]) => ({ nome, ...produtos }))
  }

  interface DadosPeriodo {
    vendasPorCategoria: { nome: string; valor: number; cor: string }[]
    vendasPorProduto: { nome: string; valor: number; cor: string }[]
    despesasPorCategoria: { nome: string; valor: number; cor: string }[]
    produtosPorPeriodo: { nome: string; [key: string]: number | string }[]
  }

  const renderSecaoRelatorio = (titulo: string, dados: DadosPeriodo, periodo: string) => {
    const totalVendasCategoria = dados.vendasPorCategoria.reduce((sum: number, item) => sum + item.valor, 0)
    const totalVendasProduto = dados.vendasPorProduto.reduce((sum: number, item) => sum + item.valor, 0)
    const totalDespesas = dados.despesasPorCategoria.reduce((sum: number, item) => sum + item.valor, 0)
    const lucroLiquido = totalVendasCategoria - totalDespesas
    const margem = totalVendasCategoria > 0 ? ((lucroLiquido / totalVendasCategoria) * 100) : 0

    // Bug #1: Extrair chaves de serviços dinamicamente dos dados reais
    const chavesServicos = Array.from(
      new Set(
        dados.produtosPorPeriodo.flatMap(row =>
          Object.keys(row).filter(k => k !== 'nome')
        )
      )
    )

    return (
      <div className="space-y-6 mb-12">
        {/* Cabeçalho da seção */}
        <div className="flex items-center gap-3">
          <div className="w-1 h-8 bg-gradient-to-b from-blue-500 to-indigo-600 rounded-full" />
          <h2 className="text-2xl font-bold text-gray-800 dark:text-gray-100">{titulo}</h2>
        </div>

        {/* KPI bar — resumo rápido no topo */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-gradient-to-br from-emerald-500 to-green-600 p-5 rounded-2xl shadow-lg hover:-translate-y-1 transition-all duration-200">
            <div className="flex items-center gap-2 mb-2">
              <TrendingUp className="w-4 h-4 text-white/80" />
              <p className="text-xs font-semibold text-white/80 uppercase tracking-wide">Total Vendas</p>
            </div>
            <p className="text-xl font-bold text-white">
              R$ {totalVendasCategoria.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
            </p>
          </div>

          <div className="bg-gradient-to-br from-red-500 to-orange-500 p-5 rounded-2xl shadow-lg hover:-translate-y-1 transition-all duration-200">
            <div className="flex items-center gap-2 mb-2">
              <TrendingDown className="w-4 h-4 text-white/80" />
              <p className="text-xs font-semibold text-white/80 uppercase tracking-wide">Total Despesas</p>
            </div>
            <p className="text-xl font-bold text-white">
              R$ {totalDespesas.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
            </p>
          </div>

          <div className={`bg-gradient-to-br p-5 rounded-2xl shadow-lg hover:-translate-y-1 transition-all duration-200 ${lucroLiquido >= 0 ? 'from-blue-500 to-indigo-600' : 'from-rose-500 to-red-600'}`}>
            <div className="flex items-center gap-2 mb-2">
              <DollarSign className="w-4 h-4 text-white/80" />
              <p className="text-xs font-semibold text-white/80 uppercase tracking-wide">Lucro Líquido</p>
            </div>
            <p className="text-xl font-bold text-white">
              R$ {lucroLiquido.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
            </p>
          </div>

          <div className={`bg-gradient-to-br p-5 rounded-2xl shadow-lg hover:-translate-y-1 transition-all duration-200 ${lucroLiquido >= 0 ? 'from-indigo-500 to-blue-600' : 'from-orange-500 to-red-500'}`}>
            <div className="flex items-center gap-2 mb-2">
              <Activity className="w-4 h-4 text-white/80" />
              <p className="text-xs font-semibold text-white/80 uppercase tracking-wide">Margem</p>
            </div>
            <p className="text-xl font-bold text-white">
              {margem.toFixed(1)}%
            </p>
            {/* Bug #9: aria-hidden nos emojis decorativos */}
            <p className="text-xs text-white/70 mt-1">
              <span aria-hidden="true">{lucroLiquido >= 0 ? '📈' : '📉'}</span>
              {' '}{lucroLiquido >= 0 ? 'Positivo' : 'Negativo'}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Vendas por Categoria */}
          <div className="bg-white dark:!bg-[#243040] p-6 rounded-2xl shadow-lg border border-gray-100 dark:border-gray-700">
            <div className="mb-6">
              <div className="flex items-center gap-2 mb-5">
                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-500 to-green-600 flex items-center justify-center">
                  <TrendingUp className="w-4 h-4 text-white" />
                </div>
                <h3 className="text-lg font-bold text-gray-800 dark:text-gray-100">Vendas por Projeto</h3>
              </div>
              {/* Bug #8: Empty state quando lista está vazia */}
              {dados.vendasPorCategoria.length === 0 ? (
                <p className="text-sm text-gray-400 dark:text-gray-500 py-4 text-center">Sem vendas por projeto neste período.</p>
              ) : (
                <div className="space-y-2">
                  {dados.vendasPorCategoria.map((item, index: number) => {
                    // Bug #5: usar item.nome como key em vez de index
                    const chartId = `vendas-categoria-${periodo}-${item.nome}`
                    const isOpen = expandedCharts.includes(chartId)
                    return (
                      <div key={item.nome} className="space-y-2">
                        {/* Bug #7: role="button" e tabIndex para acessibilidade por teclado */}
                        <div
                          role="button"
                          tabIndex={0}
                          className="bg-gradient-to-r from-emerald-50 to-green-50 dark:from-emerald-900/20 dark:to-green-900/10 p-4 rounded-xl flex justify-between items-center cursor-pointer hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 border border-emerald-100 dark:border-emerald-800/30"
                          onClick={() => toggleChart(chartId)}
                          onKeyDown={(e) => e.key === 'Enter' || e.key === ' ' ? toggleChart(chartId) : undefined}
                          aria-expanded={isOpen}
                        >
                          <span className="bg-emerald-100 dark:bg-emerald-800/40 text-emerald-800 dark:text-emerald-300 font-semibold px-3 py-1.5 rounded-lg text-sm">
                            {item.nome}
                          </span>
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-gray-700 dark:text-gray-200 text-sm">
                              R$ {item.valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                            </span>
                            {isOpen ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
                          </div>
                        </div>
                        {isOpen && (
                          <div className="bg-gray-50 dark:!bg-[#141e2d] p-4 rounded-xl border border-gray-100 dark:border-gray-700">
                            <ResponsiveContainer width="100%" height={220}>
                              <BarChart data={[{ name: item.nome, valor: item.valor }]}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                                <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                                <YAxis tick={{ fontSize: 12 }} />
                                <Tooltip formatter={(value: number) => [`R$ ${value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, 'Projeto']} />
                                <Bar dataKey="valor" fill={item.cor} radius={[6, 6, 0, 0]} />
                              </BarChart>
                            </ResponsiveContainer>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}

              {/* Total Vendas por Projeto */}
              <div className="mt-4 pt-4 border-t border-gray-100 dark:border-gray-700">
                <div
                  role="button"
                  tabIndex={0}
                  className="bg-gradient-to-r from-emerald-500 to-green-600 p-4 rounded-xl flex justify-between items-center cursor-pointer hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200"
                  onClick={() => toggleChart(`total-vendas-categoria-${periodo}`)}
                  onKeyDown={(e) => e.key === 'Enter' || e.key === ' ' ? toggleChart(`total-vendas-categoria-${periodo}`) : undefined}
                  aria-expanded={expandedCharts.includes(`total-vendas-categoria-${periodo}`)}
                >
                  <span className="text-white font-bold text-sm">Total Vendas por Projeto</span>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-white text-base">
                      R$ {totalVendasCategoria.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </span>
                    {expandedCharts.includes(`total-vendas-categoria-${periodo}`)
                      ? <ChevronUp className="w-4 h-4 text-white/80" />
                      : <ChevronDown className="w-4 h-4 text-white/80" />}
                  </div>
                </div>
                {expandedCharts.includes(`total-vendas-categoria-${periodo}`) && (
                  <div className="mt-2 bg-gray-50 dark:!bg-[#141e2d] p-4 rounded-xl border border-gray-100 dark:border-gray-700">
                    <ResponsiveContainer width="100%" height={260}>
                      <BarChart data={dados.vendasPorCategoria}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                        <XAxis dataKey="nome" tick={{ fontSize: 12 }} />
                        <YAxis tick={{ fontSize: 12 }} />
                        <Tooltip formatter={(value: number) => [`R$ ${value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, 'Projeto']} />
                        <Bar dataKey="valor" fill="#22c55e" radius={[6, 6, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </div>
            </div>

            {/* Vendas por Serviço */}
            <div className="pt-4 border-t border-gray-100 dark:border-gray-700">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center">
                  <Activity className="w-3.5 h-3.5 text-white" />
                </div>
                <h4 className="text-base font-bold text-gray-700 dark:text-gray-200">Vendas por Serviço</h4>
              </div>
              {/* Bug #8: Empty state para serviços */}
              {dados.vendasPorProduto.length === 0 ? (
                <p className="text-sm text-gray-400 dark:text-gray-500 py-4 text-center">Sem vendas por serviço neste período.</p>
              ) : (
                <div className="space-y-2">
                  {dados.vendasPorProduto.map((item, index: number) => {
                    // Bug #5: usar item.nome como key
                    const chartId = `vendas-produto-${periodo}-${item.nome}`
                    const isOpen = expandedCharts.includes(chartId)
                    return (
                      <div key={item.nome} className="space-y-2">
                        <div
                          role="button"
                          tabIndex={0}
                          className="bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/10 p-3 rounded-xl flex justify-between items-center cursor-pointer hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 border border-blue-100 dark:border-blue-800/30"
                          onClick={() => toggleChart(chartId)}
                          onKeyDown={(e) => e.key === 'Enter' || e.key === ' ' ? toggleChart(chartId) : undefined}
                          aria-expanded={isOpen}
                        >
                          <span className="bg-blue-100 dark:bg-blue-800/40 text-blue-800 dark:text-blue-300 font-semibold text-sm px-3 py-1.5 rounded-lg">
                            {item.nome}
                          </span>
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-gray-700 dark:text-gray-200 text-sm">
                              R$ {item.valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                            </span>
                            {isOpen ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
                          </div>
                        </div>
                        {isOpen && (
                          <div className="bg-gray-50 dark:!bg-[#141e2d] p-4 rounded-xl border border-gray-100 dark:border-gray-700">
                            <ResponsiveContainer width="100%" height={220}>
                              <BarChart data={[{ name: item.nome, valor: item.valor }]}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                                <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                                <YAxis tick={{ fontSize: 12 }} />
                                <Tooltip formatter={(value: number) => [`R$ ${value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, 'Serviço']} />
                                <Bar dataKey="valor" fill={item.cor} radius={[6, 6, 0, 0]} />
                              </BarChart>
                            </ResponsiveContainer>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}

              {/* Total por Serviço */}
              <div className="mt-4 pt-3 border-t border-gray-100 dark:border-gray-700">
                <div
                  role="button"
                  tabIndex={0}
                  className="bg-gradient-to-r from-blue-500 to-indigo-600 p-3 rounded-xl flex justify-between items-center cursor-pointer hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200"
                  onClick={() => toggleChart(`total-vendas-produto-${periodo}`)}
                  onKeyDown={(e) => e.key === 'Enter' || e.key === ' ' ? toggleChart(`total-vendas-produto-${periodo}`) : undefined}
                  aria-expanded={expandedCharts.includes(`total-vendas-produto-${periodo}`)}
                >
                  <span className="text-white font-bold text-sm">Total por Serviço</span>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-white text-sm">
                      R$ {totalVendasProduto.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </span>
                    {expandedCharts.includes(`total-vendas-produto-${periodo}`)
                      ? <ChevronUp className="w-4 h-4 text-white/80" />
                      : <ChevronDown className="w-4 h-4 text-white/80" />}
                  </div>
                </div>
                {expandedCharts.includes(`total-vendas-produto-${periodo}`) && (
                  <div className="mt-2 bg-gray-50 dark:!bg-[#141e2d] p-4 rounded-xl border border-gray-100 dark:border-gray-700">
                    <ResponsiveContainer width="100%" height={260}>
                      <BarChart data={dados.vendasPorProduto}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                        <XAxis dataKey="nome" tick={{ fontSize: 12 }} />
                        <YAxis tick={{ fontSize: 12 }} />
                        <Tooltip formatter={(value: number) => [`R$ ${value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, 'Serviço']} />
                        <Bar dataKey="valor" fill="#3b82f6" radius={[6, 6, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Despesas por Categoria */}
          <div className="bg-white dark:!bg-[#243040] p-6 rounded-2xl shadow-lg border border-gray-100 dark:border-gray-700">
            <div className="flex items-center gap-2 mb-5">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-red-500 to-orange-500 flex items-center justify-center">
                <TrendingDown className="w-4 h-4 text-white" />
              </div>
              <h3 className="text-lg font-bold text-gray-800 dark:text-gray-100">Despesas por Projeto</h3>
            </div>
            {/* Bug #8: Empty state para despesas */}
            {dados.despesasPorCategoria.length === 0 ? (
              <p className="text-sm text-gray-400 dark:text-gray-500 py-4 text-center">Sem despesas por projeto neste período.</p>
            ) : (
              <div className="space-y-2">
                {dados.despesasPorCategoria.map((item, index: number) => {
                  // Bug #5: usar item.nome como key
                  const chartId = `despesas-categoria-${periodo}-${item.nome}`
                  const isOpen = expandedCharts.includes(chartId)
                  return (
                    <div key={item.nome} className="space-y-2">
                      <div
                        role="button"
                        tabIndex={0}
                        className="bg-gradient-to-r from-orange-50 to-red-50 dark:from-orange-900/20 dark:to-red-900/10 p-4 rounded-xl flex justify-between items-center cursor-pointer hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 border border-orange-100 dark:border-orange-800/30"
                        onClick={() => toggleChart(chartId)}
                        onKeyDown={(e) => e.key === 'Enter' || e.key === ' ' ? toggleChart(chartId) : undefined}
                        aria-expanded={isOpen}
                      >
                        <span className="bg-orange-100 dark:bg-orange-800/40 text-orange-700 dark:text-orange-300 font-semibold px-3 py-1.5 rounded-lg text-sm">
                          {item.nome}
                        </span>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-gray-700 dark:text-gray-200 text-sm">
                            R$ {item.valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                          </span>
                          {isOpen ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
                        </div>
                      </div>
                      {isOpen && (
                        <div className="bg-gray-50 dark:!bg-[#141e2d] p-4 rounded-xl border border-gray-100 dark:border-gray-700">
                          <ResponsiveContainer width="100%" height={220}>
                            <BarChart data={[{ name: item.nome, valor: item.valor }]}>
                              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                              <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                              <YAxis tick={{ fontSize: 12 }} />
                              <Tooltip formatter={(value: number) => [`R$ ${value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, 'Projeto']} />
                              <Bar dataKey="valor" fill={item.cor} radius={[6, 6, 0, 0]} />
                            </BarChart>
                          </ResponsiveContainer>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}

            {/* Total de Despesas */}
            <div className="mt-4 pt-4 border-t border-gray-100 dark:border-gray-700">
              <div
                role="button"
                tabIndex={0}
                className="bg-gradient-to-r from-red-500 to-orange-500 p-4 rounded-xl flex justify-between items-center cursor-pointer hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200"
                onClick={() => toggleChart(`total-despesas-${periodo}`)}
                onKeyDown={(e) => e.key === 'Enter' || e.key === ' ' ? toggleChart(`total-despesas-${periodo}`) : undefined}
                aria-expanded={expandedCharts.includes(`total-despesas-${periodo}`)}
              >
                <span className="text-white font-bold text-sm">Total de Despesas</span>
                <div className="flex items-center gap-2">
                  <span className="font-bold text-white text-base">
                    R$ {totalDespesas.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </span>
                  {expandedCharts.includes(`total-despesas-${periodo}`)
                    ? <ChevronUp className="w-4 h-4 text-white/80" />
                    : <ChevronDown className="w-4 h-4 text-white/80" />}
                </div>
              </div>
              {expandedCharts.includes(`total-despesas-${periodo}`) && (
                <div className="mt-2 bg-gray-50 dark:!bg-[#141e2d] p-4 rounded-xl border border-gray-100 dark:border-gray-700">
                  <ResponsiveContainer width="100%" height={260}>
                    <BarChart data={dados.despesasPorCategoria}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                      <XAxis dataKey="nome" tick={{ fontSize: 12 }} />
                      <YAxis tick={{ fontSize: 12 }} />
                      <Tooltip formatter={(value: number) => [`R$ ${value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, 'Projeto']} />
                      <Bar dataKey="valor" fill="#f97316" radius={[6, 6, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Serviços Vendidos por Período */}
        <div className="bg-white dark:!bg-[#243040] p-6 rounded-2xl shadow-lg border border-gray-100 dark:border-gray-700">
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-400 to-indigo-500 flex items-center justify-center">
                <BarChart3 className="w-4 h-4 text-white" />
              </div>
              {/* Bug #3: título agora consistente com o agrupamento real dos dados */}
              <h3 className="text-lg font-bold text-gray-800 dark:text-gray-100">
                Serviços Vendidos por {periodo === 'Semana' ? 'Dia' : periodo === 'Mês' ? 'Semana' : periodo === 'Trimestre' ? 'Mês' : 'Trimestre'}
              </h3>
            </div>
            {/* Bug #10: aria-expanded no botão */}
            <button
              className="flex items-center gap-1.5 px-4 py-2 bg-gradient-to-r from-blue-500 to-indigo-600 text-white text-sm font-semibold rounded-xl shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-200"
              onClick={() => toggleChart(`produtos-${periodo}`)}
              aria-expanded={expandedCharts.includes(`produtos-${periodo}`)}
            >
              {expandedCharts.includes(`produtos-${periodo}`) ? (
                <><ChevronUp className="w-4 h-4" /> Ocultar Gráfico</>
              ) : (
                <><ChevronDown className="w-4 h-4" /> Ver Gráfico</>
              )}
            </button>
          </div>
          {expandedCharts.includes(`produtos-${periodo}`) && (
            <div className="bg-gray-50 dark:!bg-[#141e2d] p-4 rounded-xl border border-gray-100 dark:border-gray-700">
              {/* Bug #8: Empty state para o gráfico de serviços por período */}
              {dados.produtosPorPeriodo.length === 0 || chavesServicos.length === 0 ? (
                <p className="text-sm text-gray-400 dark:text-gray-500 py-8 text-center">Sem dados de serviços para este período.</p>
              ) : (
                <ResponsiveContainer width="100%" height={300}>
                  {/* Bug #1: Bars geradas dinamicamente com as chaves reais dos dados */}
                  <BarChart data={dados.produtosPorPeriodo}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis dataKey="nome" tick={{ fontSize: 12 }} />
                    <YAxis tick={{ fontSize: 12 }} />
                    <Tooltip />
                    <Legend />
                    {chavesServicos.map((chave, i) => (
                      <Bar
                        key={chave}
                        dataKey={chave}
                        fill={CHART_COLORS[i % CHART_COLORS.length]}
                        name={chave}
                        radius={[4, 4, 0, 0]}
                      />
                    ))}
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          )}
        </div>
      </div>
    )
  }

  // Bug #6: Memoizar todos os dados calculados para evitar recálculo a cada render
  const dadosReais = useMemo(() => ({
    semana: {
      vendasPorCategoria: calcularVendasPorCategoria(transacoesSemana).map(i => ({ nome: i.name, valor: i.value, cor: i.color })),
      vendasPorProduto: calcularVendasPorProduto(transacoesSemana).map(i => ({ nome: i.name, valor: i.value, cor: i.color })),
      despesasPorCategoria: calcularDespesasPorCategoria(transacoesSemana).map(i => ({ nome: i.name, valor: i.value, cor: i.color })),
      produtosPorPeriodo: calcularProdutosPorPeriodo(transacoesSemana, 'dia')
    },
    mes: {
      vendasPorCategoria: calcularVendasPorCategoria(transacoesMes).map(i => ({ nome: i.name, valor: i.value, cor: i.color })),
      vendasPorProduto: calcularVendasPorProduto(transacoesMes).map(i => ({ nome: i.name, valor: i.value, cor: i.color })),
      despesasPorCategoria: calcularDespesasPorCategoria(transacoesMes).map(i => ({ nome: i.name, valor: i.value, cor: i.color })),
      produtosPorPeriodo: calcularProdutosPorPeriodo(transacoesMes, 'semana')
    },
    trimestre: {
      vendasPorCategoria: calcularVendasPorCategoria(transacoesTrimestre).map(i => ({ nome: i.name, valor: i.value, cor: i.color })),
      vendasPorProduto: calcularVendasPorProduto(transacoesTrimestre).map(i => ({ nome: i.name, valor: i.value, cor: i.color })),
      despesasPorCategoria: calcularDespesasPorCategoria(transacoesTrimestre).map(i => ({ nome: i.name, valor: i.value, cor: i.color })),
      // Bug #2: tipo correto para trimestre = 'mes'
      produtosPorPeriodo: calcularProdutosPorPeriodo(transacoesTrimestre, 'mes')
    },
    ano: {
      vendasPorCategoria: calcularVendasPorCategoria(transacoesAno).map(i => ({ nome: i.name, valor: i.value, cor: i.color })),
      vendasPorProduto: calcularVendasPorProduto(transacoesAno).map(i => ({ nome: i.name, valor: i.value, cor: i.color })),
      despesasPorCategoria: calcularDespesasPorCategoria(transacoesAno).map(i => ({ nome: i.name, valor: i.value, cor: i.color })),
      // Bug #2: tipo correto para ano = 'trimestre'
      produtosPorPeriodo: calcularProdutosPorPeriodo(transacoesAno, 'trimestre')
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [transacoesSemana, transacoesMes, transacoesTrimestre, transacoesAno])

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <h1 className="text-3xl font-bold flex items-center gap-3 text-gray-900 dark:text-gray-100">
          <BarChart3 className="w-8 h-8 text-blue-600" />
          Relatórios
        </h1>
        <button
          onClick={() => alert('Ferramenta em construção')}
          className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-blue-500 to-indigo-600 text-white font-semibold rounded-xl shadow-lg shadow-blue-500/25 hover:from-blue-600 hover:to-indigo-700 hover:shadow-xl hover:shadow-blue-500/35 hover:-translate-y-0.5 active:translate-y-0 transition-all duration-200"
        >
          <Plus className="h-5 w-5" />
          Novo Relatório
        </button>
      </div>

      {renderSecaoRelatorio('Relatório Semanal', dadosReais.semana, 'Semana')}
      {renderSecaoRelatorio('Relatório Mensal', dadosReais.mes, 'Mês')}
      {renderSecaoRelatorio('Relatório Trimestral', dadosReais.trimestre, 'Trimestre')}
      {renderSecaoRelatorio('Relatório Anual', dadosReais.ano, 'Ano')}
    </div>
  )
}

export default Reports
