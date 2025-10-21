import React, { useState, useEffect, useMemo } from 'react'
import { TrendingUp, TrendingDown, DollarSign } from 'lucide-react'

interface Transaction {
  id: string
  date: string
  description: string
  value: number
  type: 'Receita' | 'Despesa'
  category: string
  subcategory?: string
}

interface DRERow {
  id: string
  description: string
  value: number
  type: 'receita' | 'despesa' | 'total'
  level: number
  parent?: string
}

const DRE: React.FC = () => {
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [selectedPeriod, setSelectedPeriod] = useState<'mensal' | 'trimestral' | 'anual'>('mensal')
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth())
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear())
  const [isLoading, setIsLoading] = useState(true)

  const API_BASE_URL = '/api'

  useEffect(() => {
    fetchTransactions()
  }, [])

  const fetchTransactions = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/transactions`)
      const data = await response.json()
      if (data.success) {
        setTransactions(data.data)
      }
    } catch (error) {
      console.error('Erro ao buscar transações:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const filteredTransactions = useMemo(() => {
    const startDate = new Date(selectedYear, selectedMonth, 1)
    let endDate: Date

    if (selectedPeriod === 'mensal') {
      endDate = new Date(selectedYear, selectedMonth + 1, 0)
    } else if (selectedPeriod === 'trimestral') {
      endDate = new Date(selectedYear, selectedMonth + 3, 0)
    } else {
      endDate = new Date(selectedYear, 11, 31)
    }

    return transactions.filter(transaction => {
      const transactionDate = new Date(transaction.date)
      return transactionDate >= startDate && transactionDate <= endDate
    })
  }, [transactions, selectedPeriod, selectedMonth, selectedYear])

  const generateDRE = useMemo(() => {
    const receitas = filteredTransactions.filter(t => t.type === 'Receita')
    const despesas = filteredTransactions.filter(t => t.type === 'Despesa')

    const totalReceitas = receitas.reduce((sum, t) => sum + t.value, 0)
    const totalDespesas = despesas.reduce((sum, t) => sum + t.value, 0)
    const resultadoLiquido = totalReceitas - totalDespesas

    // Agrupar receitas por categoria
    const receitasPorCategoria = receitas.reduce((acc, t) => {
      if (!acc[t.category]) acc[t.category] = 0
      acc[t.category] += t.value
      return acc
    }, {} as Record<string, number>)

    // Agrupar despesas por categoria
    const despesasPorCategoria = despesas.reduce((acc, t) => {
      if (!acc[t.category]) acc[t.category] = 0
      acc[t.category] += t.value
      return acc
    }, {} as Record<string, number>)

    const dreRows: DRERow[] = [
      // Receitas
      {
        id: 'receitas',
        description: 'RECEITAS OPERACIONAIS',
        value: totalReceitas,
        type: 'total',
        level: 0
      }
    ]

    // Adicionar receitas por categoria
    Object.entries(receitasPorCategoria).forEach(([categoria, valor]) => {
      dreRows.push({
        id: `receita-${categoria}`,
        description: categoria,
        value: valor,
        type: 'receita',
        level: 1,
        parent: 'receitas'
      })
    })

    // Despesas
    dreRows.push({
      id: 'despesas',
      description: 'DESPESAS OPERACIONAIS',
      value: totalDespesas,
      type: 'total',
      level: 0
    })

    // Adicionar despesas por categoria
    Object.entries(despesasPorCategoria).forEach(([categoria, valor]) => {
      dreRows.push({
        id: `despesa-${categoria}`,
        description: categoria,
        value: valor,
        type: 'despesa',
        level: 1,
        parent: 'despesas'
      })
    })

    // Resultado
    dreRows.push({
      id: 'resultado',
      description: 'RESULTADO LÍQUIDO',
      value: resultadoLiquido,
      type: resultadoLiquido >= 0 ? 'receita' : 'despesa',
      level: 0
    })

    return dreRows
  }, [filteredTransactions])

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    }).format(value)
  }

  const getMonthName = (month: number) => {
    const months = [
      'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
      'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
    ]
    return months[month]
  }

  const getPeriodLabel = () => {
    if (selectedPeriod === 'mensal') {
      return `${getMonthName(selectedMonth)} ${selectedYear}`
    } else if (selectedPeriod === 'trimestral') {
      const trimestre = Math.floor(selectedMonth / 3) + 1
      return `${trimestre}º Trimestre ${selectedYear}`
    } else {
      return `Ano ${selectedYear}`
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">DRE - Demonstrativo de Resultado do Exercício</h1>
          <p className="text-gray-600">Análise de receitas e despesas do período</p>
        </div>
      </div>

      {/* Filtros */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 sm:p-6">
        <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-end">
          <div className="flex flex-col gap-2">
            <label className="text-sm font-semibold text-gray-700">Período</label>
            <select
              value={selectedPeriod}
              onChange={(e) => setSelectedPeriod(e.target.value as 'mensal' | 'trimestral' | 'anual')}
              className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="mensal">Mensal</option>
              <option value="trimestral">Trimestral</option>
              <option value="anual">Anual</option>
            </select>
          </div>

          {selectedPeriod !== 'anual' && (
            <div className="flex flex-col gap-2">
              <label className="text-sm font-semibold text-gray-700">Mês</label>
              <select
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(parseInt(e.target.value))}
                className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                {Array.from({ length: 12 }, (_, i) => (
                  <option key={i} value={i}>
                    {getMonthName(i)}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="flex flex-col gap-2">
            <label className="text-sm font-semibold text-gray-700">Ano</label>
            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(parseInt(e.target.value))}
              className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              {Array.from({ length: 5 }, (_, i) => {
                const year = new Date().getFullYear() - 2 + i
                return (
                  <option key={year} value={year}>
                    {year}
                  </option>
                )
              })}
            </select>
          </div>
        </div>
      </div>

      {/* DRE Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="px-4 sm:px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">
            DRE - {getPeriodLabel()}
          </h2>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Descrição
                </th>
                <th className="px-4 sm:px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Valor
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {generateDRE.map((row) => (
                <tr
                  key={row.id}
                  className={`${
                    row.level === 0
                      ? 'bg-blue-50 font-semibold'
                      : row.level === 1
                      ? 'bg-gray-50'
                      : ''
                  } ${
                    row.id === 'resultado' ? 'border-t-2 border-gray-300' : ''
                  }`}
                >
                  <td
                    className={`px-4 sm:px-6 py-3 text-sm ${
                      row.level === 0 ? 'text-blue-900' : 'text-gray-900'
                    }`}
                    style={{ paddingLeft: `${row.level * 20 + 16}px` }}
                  >
                    {row.description}
                  </td>
                  <td
                    className={`px-4 sm:px-6 py-3 text-sm text-right font-medium ${
                      row.type === 'receita'
                        ? 'text-green-600'
                        : row.type === 'despesa'
                        ? 'text-red-600'
                        : row.value >= 0
                        ? 'text-green-600'
                        : 'text-red-600'
                    }`}
                  >
                    {formatCurrency(row.value)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Resumo */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <TrendingUp className="h-8 w-8 text-green-600" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-500">Total Receitas</p>
              <p className="text-2xl font-semibold text-green-600">
                {formatCurrency(
                  generateDRE.find(r => r.id === 'receitas')?.value || 0
                )}
              </p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <TrendingDown className="h-8 w-8 text-red-600" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-500">Total Despesas</p>
              <p className="text-2xl font-semibold text-red-600">
                {formatCurrency(
                  generateDRE.find(r => r.id === 'despesas')?.value || 0
                )}
              </p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <DollarSign className="h-8 w-8 text-blue-600" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-500">Resultado Líquido</p>
              <p className={`text-2xl font-semibold ${
                (generateDRE.find(r => r.id === 'resultado')?.value || 0) >= 0
                  ? 'text-green-600'
                  : 'text-red-600'
              }`}>
                {formatCurrency(
                  generateDRE.find(r => r.id === 'resultado')?.value || 0
                )}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default DRE
