import React, { useState } from 'react'
import { BarChart3, Plus } from 'lucide-react'
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

const Reports: React.FC<ReportsProps> = ({ transactions }) => {
  const [expandedCharts, setExpandedCharts] = useState<string[]>([])

  const toggleChart = (id: string) => {
    setExpandedCharts(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }

  const agora = new Date()
  const inicioSemana = new Date(agora)
  inicioSemana.setDate(agora.getDate() - agora.getDay())
  inicioSemana.setHours(0, 0, 0, 0)

  const inicioMes = new Date(agora.getFullYear(), agora.getMonth(), 1)
  const inicioTrimestre = new Date(agora.getFullYear(), Math.floor(agora.getMonth() / 3) * 3, 1)
  const inicioAno = new Date(agora.getFullYear(), 0, 1)

  const transacoesSemana = transactions.filter(t => new Date(t.date) >= inicioSemana)
  const transacoesMes = transactions.filter(t => new Date(t.date) >= inicioMes)
  const transacoesTrimestre = transactions.filter(t => new Date(t.date) >= inicioTrimestre)
  const transacoesAno = transactions.filter(t => new Date(t.date) >= inicioAno)

  const calcularVendasPorCategoria = (ts: Transaction[]) => {
    const mapa: Record<string, number> = {}
    ts.forEach(t => { if (t.type === 'Receita') { mapa[t.category] = (mapa[t.category] || 0) + t.value } })
    const cores = ['#22c55e', '#3b82f6', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4']
    return Object.entries(mapa).map(([name, value], i) => ({ name, value, color: cores[i % cores.length] }))
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

  const calcularProdutosPorPeriodo = (ts: Transaction[], tipo: 'dia' | 'semana') => {
    const produtosPorPeriodo: { [key: string]: { [key: string]: number } } = {}
    ts.forEach(t => {
      if (t.type === 'Receita') {
        const data = new Date(t.date)
        let chave: string
        if (tipo === 'dia') {
          const diasSemana = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']
          chave = diasSemana[data.getDay()]
        } else {
          const semanaDoMes = Math.ceil(data.getDate() / 7)
          chave = `Sem ${semanaDoMes}`
        }
        if (!produtosPorPeriodo[chave]) produtosPorPeriodo[chave] = {}
        const nomeProduto = t.description || 'Produto'
        produtosPorPeriodo[chave][nomeProduto] = (produtosPorPeriodo[chave][nomeProduto] || 0) + 1
      }
    })
    return Object.entries(produtosPorPeriodo).map(([nome, produtos]) => ({ nome, ...produtos }))
  }

  // (sem helpers extras)

  const renderSecaoRelatorio = (titulo: string, dados: any, periodo: string) => {
    const totalVendasCategoria = dados.vendasPorCategoria.reduce((sum: number, item: any) => sum + item.valor, 0)
    const totalVendasProduto = dados.vendasPorProduto.reduce((sum: number, item: any) => sum + item.valor, 0)
    const totalDespesas = dados.despesasPorCategoria.reduce((sum: number, item: any) => sum + item.valor, 0)
    const lucroLiquido = totalVendasCategoria - totalDespesas

    return (
      <div className="space-y-6 mb-12">
        <h2 className="text-2xl font-bold text-gray-800">{titulo}</h2>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Vendas por Categoria */}
          <div className="bg-white p-6 rounded-2xl shadow-lg border border-gray-200">
            <div className="mb-8">
              <div className="flex items-center mb-6">
                <span className="text-gray-400 text-lg mr-3">📈</span>
                <h3 className="text-lg font-bold text-gray-800">Vendas por Projeto</h3>
              </div>
              <div className="space-y-3">
                {dados.vendasPorCategoria.map((item: any, index: number) => {
                  const chartId = `vendas-categoria-${periodo}-${index}`
                  return (
                    <div key={index} className="space-y-3">
                      <div 
                        className="bg-green-50 p-4 rounded-xl flex justify-between items-center cursor-pointer hover:opacity-80 transition-opacity"
                        onClick={() => toggleChart(chartId)}
                      >
                        <span className="bg-green-100 text-green-800 font-medium px-4 py-2 rounded-lg min-w-0 flex-shrink-0">
                          {item.nome}
                        </span>
                        <span className="font-bold text-gray-700 ml-4 text-right">
                          R$ {item.valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        </span>
                      </div>
                      {expandedCharts.includes(chartId) && (
                        <div className="bg-gray-50 p-4 rounded-lg">
                          <ResponsiveContainer width="100%" height={250}>
                            <BarChart data={[{name: item.nome, valor: item.valor}]}> 
                              <CartesianGrid strokeDasharray="3 3" />
                              <XAxis dataKey="name" />
                              <YAxis />
                              <Tooltip formatter={(value: any) => [`R$ ${value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, 'Projeto']} />
                              <Bar dataKey="valor" fill={item.cor} />
                            </BarChart>
                          </ResponsiveContainer>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
              <div className="mt-6 pt-4 border-t border-gray-200">
                <div className="space-y-3">
                  <div 
                    className="bg-green-200 p-4 rounded-xl flex justify-between items-center cursor-pointer hover:opacity-80 transition-opacity"
                    onClick={() => toggleChart(`total-vendas-categoria-${periodo}`)}
                  >
                    <span className="bg-green-300 text-green-800 font-bold px-4 py-2 rounded-lg min-w-0 flex-shrink-0">
                      Total Vendas por Projeto
                    </span>
                    <span className="font-bold text-green-800 text-lg ml-4 text-right">
                      R$ {totalVendasCategoria.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                  {expandedCharts.includes(`total-vendas-categoria-${periodo}`) && (
                    <div className="bg-gray-50 p-4 rounded-lg">
                      <ResponsiveContainer width="100%" height={300}>
                        <BarChart data={dados.vendasPorCategoria}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="nome" />
                          <YAxis />
                          <Tooltip formatter={(value: any) => [`R$ ${value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, 'Projeto']} />
                          <Bar dataKey="valor" fill="#22c55e" />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </div>
              </div>
            </div>
            {/* Vendas por Produto */}
            <div>
              <div className="mb-4">
                <h4 className="text-md font-bold text-gray-700">Vendas por Serviço</h4>
              </div>
              <div className="space-y-3">
                {dados.vendasPorProduto.map((item: any, index: number) => {
                  const chartId = `vendas-produto-${periodo}-${index}`
                  return (
                    <div key={index} className="space-y-3">
                      <div 
                        className="bg-blue-50 p-3 rounded-lg flex justify-between items-center cursor-pointer hover:opacity-80 transition-opacity"
                        onClick={() => toggleChart(chartId)}
                      >
                        <span className="bg-blue-100 text-blue-800 font-medium text-sm px-3 py-2 rounded min-w-0 flex-shrink-0">
                          {item.nome}
                        </span>
                        <span className="font-bold text-blue-900 text-sm ml-3 text-right">
                          R$ {item.valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        </span>
                      </div>
                      {expandedCharts.includes(chartId) && (
                        <div className="bg-gray-50 p-4 rounded-lg">
                          <ResponsiveContainer width="100%" height={250}>
                            <BarChart data={[{name: item.nome, valor: item.valor}]}> 
                              <CartesianGrid strokeDasharray="3 3" />
                              <XAxis dataKey="name" />
                              <YAxis />
                              <Tooltip formatter={(value: any) => [`R$ ${value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, 'Serviço']} />
                              <Bar dataKey="valor" fill={item.cor} />
                            </BarChart>
                          </ResponsiveContainer>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
              <div className="mt-4 pt-3 border-t border-gray-200">
                <div className="space-y-3">
                  <div 
                    className="bg-blue-200 p-3 rounded-lg flex justify-between items-center cursor-pointer hover:opacity-80 transition-opacity"
                    onClick={() => toggleChart(`total-vendas-produto-${periodo}`)}
                  >
                    <span className="bg-blue-300 text-blue-800 font-bold text-sm px-3 py-2 rounded min-w-0 flex-shrink-0">
                      Total por Serviço
                    </span>
                    <span className="font-bold text-blue-800 text-sm ml-3 text-right">
                      R$ {totalVendasProduto.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                  {expandedCharts.includes(`total-vendas-produto-${periodo}`) && (
                    <div className="bg-gray-50 p-4 rounded-lg">
                      <ResponsiveContainer width="100%" height={300}>
                        <BarChart data={dados.vendasPorProduto}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="nome" />
                          <YAxis />
                          <Tooltip formatter={(value: any) => [`R$ ${value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, 'Serviço']} />
                          <Bar dataKey="valor" fill="#3b82f6" />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
          {/* Despesas por Categoria */}
          <div className="bg-white p-6 rounded-2xl shadow-lg border border-gray-200">
            <div className="flex items-center mb-6">
              <span className="text-gray-400 text-lg mr-3">💸</span>
              <h3 className="text-lg font-bold text-gray-800">Despesas por Projeto</h3>
            </div>
            <div className="space-y-3">
              {dados.despesasPorCategoria.map((item: any, index: number) => {
                const chartId = `despesas-categoria-${periodo}-${index}`
                return (
                  <div key={index} className="space-y-3">
                    <div 
                      className="bg-orange-50 p-4 rounded-xl flex justify-between items-center cursor-pointer hover:opacity-80 transition-opacity"
                      onClick={() => toggleChart(chartId)}
                    >
                      <span className="bg-orange-100 text-orange-700 font-medium px-4 py-2 rounded-lg min-w-0 flex-shrink-0">
                        {item.nome}
                      </span>
                      <span className="font-bold text-gray-700 ml-4 text-right">
                        R$ {item.valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </span>
                    </div>
                    {expandedCharts.includes(chartId) && (
                      <div className="bg-gray-50 p-4 rounded-lg">
                        <ResponsiveContainer width="100%" height={250}>
                          <BarChart data={[{name: item.nome, valor: item.valor}]}> 
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis dataKey="name" />
                            <YAxis />
                            <Tooltip formatter={(value: any) => [`R$ ${value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, 'Projeto']} />
                            <Bar dataKey="valor" fill={item.cor} />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
            <div className="mt-6 pt-4 border-t border-gray-200">
              <div className="space-y-3">
                <div 
                  className="bg-orange-200 p-4 rounded-xl flex justify-between items-center cursor-pointer hover:opacity-80 transition-opacity"
                  onClick={() => toggleChart(`total-despesas-${periodo}`)}
                >
                  <span className="bg-orange-300 text-orange-800 font-bold px-4 py-2 rounded-lg min-w-0 flex-shrink-0">
                    Total de Despesas
                  </span>
                  <span className="font-bold text-orange-800 text-lg ml-4 text-right">
                    R$ {totalDespesas.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </span>
                </div>
                {expandedCharts.includes(`total-despesas-${periodo}`) && (
                  <div className="bg-gray-50 p-4 rounded-lg">
                    <ResponsiveContainer width="100%" height={300}>
                      <BarChart data={dados.despesasPorCategoria}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="nome" />
                        <YAxis />
                          <Tooltip formatter={(value: any) => [`R$ ${value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, 'Projeto']} />
                        <Bar dataKey="valor" fill="#f97316" />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Produtos por Período */}
        <div className="bg-white p-6 rounded-2xl shadow-lg border border-gray-200">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center">
              <span className="text-gray-400 text-lg mr-3">📦</span>
              <h3 className="text-lg font-bold text-gray-800">Serviços Vendidos por {periodo === 'Semana' ? 'Dia' : periodo === 'Mês' ? 'Semana' : periodo === 'Trimestre' ? 'Mês' : 'Trimestre'}</h3>
            </div>
            <button 
              className="text-blue-600 hover:text-blue-800 font-medium"
              onClick={() => toggleChart(`produtos-${periodo}`)}
            >
              {expandedCharts.includes(`produtos-${periodo}`) ? 'Ocultar Gráfico' : 'Ver Gráfico'}
            </button>
          </div>
          {expandedCharts.includes(`produtos-${periodo}`) && (
            <div className="bg-gray-50 p-4 rounded-lg">
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={
                  periodo === 'Semana' ? dados.produtosPorDia :
                  periodo === 'Mês' ? dados.produtosPorSemana :
                  periodo === 'Trimestre' ? dados.produtosPorMes :
                  dados.produtosPorTrimestre
                }>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="nome" />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="vela_lavanda" fill="#8b5cf6" name="Serviço A" />
                  <Bar dataKey="vela_vanilla" fill="#ec4899" name="Serviço B" />
                  <Bar dataKey="kit_romance" fill="#06b6d4" name="Serviço C" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        {/* Resumo */}
        <div className="bg-white p-6 rounded-2xl shadow-lg border border-gray-200">
          <h3 className="text-lg font-bold text-gray-800 mb-6">Resumo do {periodo}</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <div className="text-center p-4 bg-green-50 rounded-xl">
              <p className="text-sm font-bold text-green-600 mb-2">Total Vendas</p>
              <p className="text-xl font-bold text-green-600">R$ {totalVendasCategoria.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
            </div>
            <div className="text-center p-4 bg-red-50 rounded-xl">
              <p className="text-sm font-bold text-red-600 mb-2">Total Despesas</p>
              <p className="text-xl font-bold text-red-600">R$ {totalDespesas.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
            </div>
            <div className={`text-center p-4 rounded-xl ${lucroLiquido >= 0 ? 'bg-green-50' : 'bg-red-50'}`}>
              <p className={`text-sm font-bold mb-2 ${lucroLiquido >= 0 ? 'text-green-600' : 'text-red-600'}`}>Lucro Líquido</p>
              <p className={`text-xl font-bold ${lucroLiquido >= 0 ? 'text-green-600' : 'text-red-600'}`}>R$ {lucroLiquido.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
              <div className={`mt-2 p-2 rounded-lg ${lucroLiquido >= 0 ? 'bg-green-100' : 'bg-red-100'}`}>
                <p className={`text-xs font-bold ${lucroLiquido >= 0 ? 'text-green-600' : 'text-red-600'}`}>Margem: {totalVendasCategoria > 0 ? ((lucroLiquido / totalVendasCategoria) * 100).toFixed(1) : '0.0'}%</p>
              </div>
            </div>
            <div className={`text-center p-4 rounded-xl ${lucroLiquido >= 0 ? 'bg-green-50' : 'bg-red-50'}`}>
              <p className={`text-sm font-bold mb-2 ${lucroLiquido >= 0 ? 'text-green-600' : 'text-red-600'}`}>Status</p>
              <div className={`inline-flex items-center px-3 py-2 rounded-lg ${lucroLiquido >= 0 ? 'bg-green-100' : 'bg-red-100'}`}>
                <span className={`text-sm font-bold ${lucroLiquido >= 0 ? 'text-green-600' : 'text-red-600'}`}>{lucroLiquido >= 0 ? '📈 Positivo' : '📉 Negativo'}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // (sem variáveis extras)

  const dadosReais = {
    semana: {
      vendasPorCategoria: calcularVendasPorCategoria(transacoesSemana).map(i => ({ nome: i.name, valor: i.value, cor: i.color })),
      vendasPorProduto: calcularVendasPorProduto(transacoesSemana).map(i => ({ nome: i.name, valor: i.value, cor: i.color })),
      despesasPorCategoria: calcularDespesasPorCategoria(transacoesSemana).map(i => ({ nome: i.name, valor: i.value, cor: i.color })),
      produtosPorDia: calcularProdutosPorPeriodo(transacoesSemana, 'dia')
    },
    mes: {
      vendasPorCategoria: calcularVendasPorCategoria(transacoesMes).map(i => ({ nome: i.name, valor: i.value, cor: i.color })),
      vendasPorProduto: calcularVendasPorProduto(transacoesMes).map(i => ({ nome: i.name, valor: i.value, cor: i.color })),
      despesasPorCategoria: calcularDespesasPorCategoria(transacoesMes).map(i => ({ nome: i.name, valor: i.value, cor: i.color })),
      produtosPorSemana: calcularProdutosPorPeriodo(transacoesMes, 'semana')
    },
    trimestre: {
      vendasPorCategoria: calcularVendasPorCategoria(transacoesTrimestre).map(i => ({ nome: i.name, valor: i.value, cor: i.color })),
      vendasPorProduto: calcularVendasPorProduto(transacoesTrimestre).map(i => ({ nome: i.name, valor: i.value, cor: i.color })),
      despesasPorCategoria: calcularDespesasPorCategoria(transacoesTrimestre).map(i => ({ nome: i.name, valor: i.value, cor: i.color })),
      produtosPorMes: calcularProdutosPorPeriodo(transacoesTrimestre, 'semana')
    },
    ano: {
      vendasPorCategoria: calcularVendasPorCategoria(transacoesAno).map(i => ({ nome: i.name, valor: i.value, cor: i.color })),
      vendasPorProduto: calcularVendasPorProduto(transacoesAno).map(i => ({ nome: i.name, valor: i.value, cor: i.color })),
      despesasPorCategoria: calcularDespesasPorCategoria(transacoesAno).map(i => ({ nome: i.name, valor: i.value, cor: i.color })),
      produtosPorTrimestre: calcularProdutosPorPeriodo(transacoesAno, 'semana')
    }
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <h1 className="text-3xl font-bold flex items-center gap-3">
          <BarChart3 className="w-8 h-8 text-blue-600" />
          Relatórios
        </h1>
        <button
          onClick={() => alert('Ferramenta em construção')}
          className="flex items-center gap-3 px-6 py-3 bg-gradient-to-r from-blue-500 to-indigo-600 text-white font-semibold rounded-xl hover:from-blue-600 hover:to-indigo-700 shadow-lg hover:shadow-xl transform hover:-translate-y-1 transition-all duration-300"
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


