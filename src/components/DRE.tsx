import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { TrendingUp, TrendingDown, DollarSign, Download, FileText, Filter, BarChart3, ArrowLeftRight } from 'lucide-react'
const parseLocalDate = (dateString: string | null | undefined): Date => {
  if (!dateString) return new Date(NaN)
  const m = String(dateString).match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (m) return new Date(parseInt(m[1], 10), parseInt(m[2], 10) - 1, parseInt(m[3], 10))
  return new Date(dateString)
}
const API_BASE_URL =
  typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
    ? 'http://localhost:9001/api'
    : ((import.meta as any).env?.VITE_API_URL || '/api');
import { useAuth } from '../contexts/AuthContext'
import jsPDF from 'jspdf'
import html2canvas from 'html2canvas'

interface Transaction {
  id: string
  date: string
  description: string
  value: number
  type: 'Receita' | 'Despesa'
  category: string
  createdAt?: string
  updatedAt?: string
}

interface DRERow {
  id: string
  description: string
  value: number
  valuePrevious?: number
  variation?: number
  variationPercent?: number
  type: 'receita' | 'despesa' | 'total'
  level: number
  parent?: string
}

// Fora do componente: funções puras sem dependência de estado
const isReceita = (type: string) => /receita/i.test(type || '')
const isDespesa = (type: string) => /despesa/i.test(type || '')

// Normaliza qualquer valor para número finito (NaN/Infinity → 0)
const safeVal = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? n : 0 }

const getPreviousPeriod = (period: 'mensal' | 'trimestral' | 'anual', month: number, year: number) => {
  if (period === 'mensal') {
    return month === 0 ? { month: 11, year: year - 1 } : { month: month - 1, year }
  } else if (period === 'trimestral') {
    const quarterStart = Math.floor(month / 3) * 3
    return quarterStart === 0 ? { month: 9, year: year - 1 } : { month: quarterStart - 3, year }
  } else {
    return { month: 0, year: year - 1 }
  }
}

const getMonthName = (month: number) => {
  const months = [
    'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
    'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
  ]
  return months[month] ?? ''
}

const formatCurrency = (value: number) => {
  if (!Number.isFinite(value)) return 'R$ 0,00'
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  }).format(value)
}

const formatPercent = (value: number) => {
  if (!Number.isFinite(value)) return '0,0%'
  return new Intl.NumberFormat('pt-BR', {
    style: 'percent',
    minimumFractionDigits: 1,
    maximumFractionDigits: 1
  }).format(value / 100)
}

const DRE: React.FC = () => {
  const { token, logout } = useAuth()
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [selectedPeriod, setSelectedPeriod] = useState<'mensal' | 'trimestral' | 'anual'>('mensal')
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth())
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear())
  const [isLoading, setIsLoading] = useState(true)
  const [isExporting, setIsExporting] = useState<'pdf' | 'excel' | null>(null)
  const dreContentRef = useRef<HTMLDivElement>(null)
  // Guard síncrono para evitar race condition de duplo clique (state React é assíncrono)
  const isExportingRef = useRef(false)
  // Armazena ID do setTimeout de revokeObjectURL para cancelar no unmount
  const revokeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // useCallback garante referência estável: o useEffect re-executa se token ou logout mudarem
  const fetchTransactions = useCallback(async (signal?: AbortSignal) => {
    try {
      setIsLoading(true)
      const headers: HeadersInit = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      }
      const response = await fetch(`${API_BASE_URL}/transactions`, { headers, signal })

      if (response.status === 401 || response.status === 403) {
        logout()
        return
      }

      const result = await response.json()
      // Guard extra: se o componente desmontou durante response.json(), não atualizar estado
      if (signal?.aborted) return
      if (result.success) {
        setTransactions(result.data)
      }
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') return
      console.error('Erro ao buscar transações:', error)
    } finally {
      // Não atualiza estado se a requisição foi abortada (componente desmontado)
      if (!signal?.aborted) setIsLoading(false)
    }
  }, [token, logout])

  useEffect(() => {
    if (!token) return
    const controller = new AbortController()
    fetchTransactions(controller.signal)
    return () => controller.abort()
  }, [token, fetchTransactions])

  // Cancela o setTimeout de revokeObjectURL ao desmontar o componente
  useEffect(() => {
    return () => {
      if (revokeTimerRef.current !== null) clearTimeout(revokeTimerRef.current)
    }
  }, [])

  // Filtrar transações por período
  const filterTransactionsByPeriod = useCallback((month: number, year: number, period: 'mensal' | 'trimestral' | 'anual') => {
    const normalizedMonth = period === 'trimestral' ? Math.floor(month / 3) * 3 : month
    const startDate = new Date(year, normalizedMonth, 1)
    let endDate: Date

    if (period === 'mensal') {
      endDate = new Date(year, normalizedMonth + 1, 0, 23, 59, 59, 999)
    } else if (period === 'trimestral') {
      endDate = new Date(year, normalizedMonth + 3, 0, 23, 59, 59, 999)
    } else {
      endDate = new Date(year, 11, 31, 23, 59, 59, 999)
    }

    return transactions.filter(transaction => {
      const transactionDate = parseLocalDate(transaction.date)
      return transactionDate >= startDate && transactionDate <= endDate
    })
  }, [transactions])

  const filteredTransactions = useMemo(() => {
    return filterTransactionsByPeriod(selectedMonth, selectedYear, selectedPeriod)
  }, [filterTransactionsByPeriod, selectedPeriod, selectedMonth, selectedYear])

  const previousPeriod = useMemo(() => {
    return getPreviousPeriod(selectedPeriod, selectedMonth, selectedYear)
  }, [selectedPeriod, selectedMonth, selectedYear])

  const previousPeriodTransactions = useMemo(() => {
    return filterTransactionsByPeriod(previousPeriod.month, previousPeriod.year, selectedPeriod)
  }, [filterTransactionsByPeriod, selectedPeriod, previousPeriod.month, previousPeriod.year])

  // Gerar DRE para um conjunto de transações
  const generateDRE = useCallback((transactions: Transaction[]): DRERow[] => {
    const receitas = transactions.filter(t => isReceita(t.type))
    const despesas = transactions.filter(t => isDespesa(t.type))

    const totalReceitas = receitas.reduce((sum, t) => sum + safeVal(t.value), 0)
    const totalDespesas = despesas.reduce((sum, t) => sum + safeVal(t.value), 0)
    const resultadoLiquido = totalReceitas - totalDespesas

    // Agrupar receitas por categoria (trim para evitar duplicatas por espaços, vazio → "Outros")
    const receitasPorCategoria = receitas.reduce((acc, t) => {
      const categoria = t.category && t.category.trim() ? t.category.trim() : 'Outros'
      if (!acc[categoria]) acc[categoria] = 0
      acc[categoria] += safeVal(t.value)
      return acc
    }, {} as Record<string, number>)

    // Agrupar despesas por categoria (trim para evitar duplicatas por espaços, vazio → "Outros")
    const despesasPorCategoria = despesas.reduce((acc, t) => {
      const categoria = t.category && t.category.trim() ? t.category.trim() : 'Outros'
      if (!acc[categoria]) acc[categoria] = 0
      acc[categoria] += safeVal(t.value)
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
      type: 'total',
      level: 0
    })

    return dreRows
  }, [])

  const currentDRE = useMemo(() => {
    return generateDRE(filteredTransactions)
  }, [generateDRE, filteredTransactions])

  const previousDRE = useMemo(() => {
    return generateDRE(previousPeriodTransactions)
  }, [generateDRE, previousPeriodTransactions])

  // Combinar DRE atual com anterior para comparação
  const dreWithComparison = useMemo(() => {
    const mapped = currentDRE.map(row => {
      const previousRow = previousDRE.find(r => r.id === row.id)
      if (previousRow) {
        const prevVal = safeVal(previousRow.value)
        const currVal = safeVal(row.value)
        const variation = currVal - prevVal
        const variationPercent = prevVal !== 0
          ? ((currVal - prevVal) / Math.abs(prevVal)) * 100
          : currVal > 0 ? 100 : 0  // mudança de base 0 para negativo é indefinida → exibir 0

        return {
          ...row,
          valuePrevious: previousRow.value,
          variation,
          variationPercent
        }
      }
      return row
    })

    // Inclui categorias que existiam no período anterior mas desapareceram no atual
    // (mostradas com value=0, variação=-100%, para não esconder regressões)
    const ghostRows = previousDRE
      .filter(prev => prev.level === 1 && !currentDRE.find(curr => curr.id === prev.id))
      .map(prev => ({
        ...prev,
        value: 0,
        valuePrevious: prev.value,
        variation: -prev.value,
        variationPercent: prev.value !== 0 ? -100 : 0
      }))

    // Calcula todas as posições de inserção ANTES de modificar o array,
    // depois insere de trás para frente para não deslocar índices já calculados.
    // Desempate por naturalIdx desc garante ordem natural do ghostRows quando
    // múltiplos ghosts compartilham o mesmo índice de inserção.
    const result = [...mapped]
    const insertions: Array<{ idx: number; naturalIdx: number; ghost: (typeof ghostRows)[0] }> = []
    ghostRows.forEach((ghost, naturalIdx) => {
      const insertAfter = result.reduce(
        (last, r, idx) => (r.parent === ghost.parent || r.id === ghost.parent) ? idx : last,
        -1
      )
      if (insertAfter !== -1) {
        insertions.push({ idx: insertAfter + 1, naturalIdx, ghost })
      } else {
        // Fallback: categoria ghost sem irmãs no período atual → inserir logo após o header da seção pai
        const parentIdx = result.findIndex(r => r.id === ghost.parent)
        if (parentIdx !== -1) insertions.push({ idx: parentIdx + 1, naturalIdx, ghost })
        // Se nem o pai existe, a ghost é verdadeiramente órfã — ignorar silenciosamente
      }
    })
    // Primário: idx desc (evita deslocamento de índices); secundário: naturalIdx desc
    // (ao inserir no mesmo ponto em sequência reversa, a ordem final é a natural)
    insertions.sort((a, b) => b.idx - a.idx || b.naturalIdx - a.naturalIdx)
    insertions.forEach(({ idx, ghost }) => result.splice(idx, 0, ghost))

    return result
  }, [currentDRE, previousDRE])

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

  const getPreviousPeriodLabel = () => {
    if (selectedPeriod === 'mensal') {
      return `${getMonthName(previousPeriod.month)} ${previousPeriod.year}`
    } else if (selectedPeriod === 'trimestral') {
      const trimestre = Math.floor(previousPeriod.month / 3) + 1
      return `${trimestre}º Trimestre ${previousPeriod.year}`
    } else {
      return `Ano ${previousPeriod.year}`
    }
  }

  // Exportar DRE em PDF
  const exportarPDF = async () => {
    // isExportingRef é síncrono — evita race condition de duplo clique antes do re-render
    if (!dreContentRef.current || isExportingRef.current) return
    isExportingRef.current = true
    setIsExporting('pdf')
    try {
      const canvas = await html2canvas(dreContentRef.current, {
        scale: 2,
        useCORS: true,
        logging: false
      })

      const imgData = canvas.toDataURL('image/png')
      const pdf = new jsPDF('p', 'mm', 'a4')
      const imgWidth = 210  // Largura de uma página A4 em mm
      const pageHeight = 297 // Altura de uma página A4 em mm
      const imgHeight = (canvas.height * imgWidth) / canvas.width
      let heightLeft = imgHeight
      let position = 0

      pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight)
      heightLeft -= pageHeight

      while (heightLeft > 0) {
        position -= pageHeight  // avança para o próximo "slice" da imagem
        pdf.addPage()
        pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight)
        heightLeft -= pageHeight
      }

      const filename = `DRE_${getPeriodLabel().replace(/\s/g, '_')}_${new Date().toISOString().split('T')[0]}.pdf`
      pdf.save(filename)
    } catch (error) {
      console.error('Erro ao exportar PDF:', error)
      alert('Erro ao exportar PDF. Tente novamente.')
    } finally {
      isExportingRef.current = false
      setIsExporting(null)
    }
  }

  // Exportar DRE em Excel
  const exportarExcel = async () => {
    // isExportingRef é síncrono — evita race condition de duplo clique antes do re-render
    if (isExportingRef.current) return
    isExportingRef.current = true
    setIsExporting('excel')
    try {
      // Escapa aspas duplas em strings para CSV válido
      const escapeCsv = (str: string) => `"${str.replace(/"/g, '""')}"`

      // Criar dados para exportação
      const hasPreviousData = previousPeriodTransactions.length > 0
      const csvAtual = [
        [escapeCsv('DRE - ' + getPeriodLabel())],
        [''],
        hasPreviousData
          ? [escapeCsv('Descrição'), escapeCsv('Valor Atual'), escapeCsv('Valor Anterior'), escapeCsv('Variação'), escapeCsv('Variação %')]
          : [escapeCsv('Descrição'), escapeCsv('Valor Atual')],
        ...dreWithComparison.map(row => {
          const base = [
            escapeCsv(row.description),
            Number.isFinite(row.value) ? row.value.toFixed(2) : '0.00',
          ]
          if (!hasPreviousData) return base
          return [
            ...base,
            row.valuePrevious !== undefined ? (Number.isFinite(row.valuePrevious) ? row.valuePrevious.toFixed(2) : '0.00') : '',
            row.variation !== undefined ? (Number.isFinite(row.variation) ? row.variation.toFixed(2) : '0.00') : '',
            row.variationPercent !== undefined ? (Number.isFinite(row.variationPercent) ? `${row.variationPercent.toFixed(2)}%` : '0.00%') : ''
          ]
        })
      ].map(row => row.join(',')).join('\n')

      const csvAnterior = [
        [escapeCsv('DRE - ' + getPreviousPeriodLabel())],
        [''],
        [escapeCsv('Descrição'), escapeCsv('Valor')],
        ...previousDRE.map(row => [
          escapeCsv(row.description),
          Number.isFinite(row.value) ? row.value.toFixed(2) : '0.00'
        ])
      ].map(row => row.join(',')).join('\n')

      const csvCompleto = hasPreviousData ? csvAtual + '\n\n' + csvAnterior : csvAtual

      // Criar blob e download
      const blob = new Blob(['\ufeff' + csvCompleto], { type: 'text/csv;charset=utf-8;' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `DRE_${getPeriodLabel().replace(/\s/g, '_')}_${new Date().toISOString().split('T')[0]}.csv`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      // Adia a revogação para garantir que o download iniciou (especialmente no Safari)
      // Usa ref para poder cancelar o timeout se o componente desmontar antes dos 150ms
      revokeTimerRef.current = setTimeout(() => URL.revokeObjectURL(url), 150)
    } catch (error) {
      console.error('Erro ao exportar Excel:', error)
      alert('Erro ao exportar Excel. Tente novamente.')
    } finally {
      isExportingRef.current = false
      setIsExporting(null)
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div role="status" aria-label="Carregando...">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" aria-hidden="true"></div>
        </div>
      </div>
    )
  }

  const totalReceitas = dreWithComparison.find(r => r.id === 'receitas')?.value ?? 0
  const totalDespesas = dreWithComparison.find(r => r.id === 'despesas')?.value ?? 0
  const resultadoLiquido = dreWithComparison.find(r => r.id === 'resultado')?.value ?? 0

  const receitasAnterior = previousDRE.find(r => r.id === 'receitas')?.value ?? 0
  const despesasAnterior = previousDRE.find(r => r.id === 'despesas')?.value ?? 0
  const resultadoAnterior = previousDRE.find(r => r.id === 'resultado')?.value ?? 0

  const variacaoReceitas = totalReceitas - receitasAnterior
  const variacaoReceitasPercent = receitasAnterior !== 0
    ? ((totalReceitas - receitasAnterior) / Math.abs(receitasAnterior)) * 100
    : totalReceitas > 0 ? 100 : 0  // base 0 → negativo é indefinido, não -100%

  const variacaoDespesas = totalDespesas - despesasAnterior
  const variacaoDespesasPercent = despesasAnterior !== 0
    ? ((totalDespesas - despesasAnterior) / Math.abs(despesasAnterior)) * 100
    : totalDespesas > 0 ? 100 : 0  // base 0 → negativo é indefinido, não -100%

  const variacaoResultado = resultadoLiquido - resultadoAnterior
  const variacaoResultadoPercent = resultadoAnterior !== 0
    ? ((resultadoLiquido - resultadoAnterior) / Math.abs(resultadoAnterior)) * 100
    : resultadoLiquido > 0 ? 100 : 0  // base 0 → negativo é indefinido, não -100%

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-3xl font-bold text-gray-900 dark:text-gray-100 flex items-center gap-3"><BarChart3 className="w-8 h-8 text-blue-500" aria-hidden="true" />DRE - Demonstrativo de Resultado do Exercício</h2>
          <p className="text-gray-600 dark:text-gray-400">Análise de receitas e despesas do período</p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={exportarPDF}
            disabled={!!isExporting}
            aria-busy={!!isExporting}
            className="flex items-center gap-3 px-6 py-3 bg-gradient-to-r from-blue-500 to-indigo-600 text-white font-semibold rounded-xl hover:from-blue-600 hover:to-indigo-700 shadow-lg shadow-blue-500/25 hover:shadow-xl hover:shadow-blue-500/35 transform hover:-translate-y-1 active:translate-y-0 transition-all duration-200 disabled:opacity-60 disabled:cursor-not-allowed disabled:transform-none"
          >
            {isExporting === 'pdf'
              ? <div className="h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent" aria-hidden="true" />
              : <Download className="h-5 w-5" aria-hidden="true" />}
            {isExporting === 'pdf' ? 'Gerando...' : 'Exportar PDF'}
          </button>
          <button
            onClick={exportarExcel}
            disabled={!!isExporting}
            aria-busy={!!isExporting}
            className="flex items-center gap-3 px-6 py-3 bg-gradient-to-r from-emerald-500 to-green-600 text-white font-semibold rounded-xl hover:from-emerald-600 hover:to-green-700 shadow-lg hover:shadow-xl transform hover:-translate-y-1 transition-all duration-300 disabled:opacity-60 disabled:cursor-not-allowed disabled:transform-none"
          >
            {isExporting === 'excel'
              ? <div className="h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent" aria-hidden="true" />
              : <FileText className="h-5 w-5" aria-hidden="true" />}
            {isExporting === 'excel' ? 'Gerando...' : 'Exportar Excel'}
          </button>
        </div>
      </div>

      {/* Filtros */}
      <div className="bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-gray-800 dark:to-gray-800 p-4 rounded-2xl border border-blue-200 dark:border-gray-700 shadow-lg">
        <div className="flex flex-col lg:flex-row lg:items-center gap-4 lg:gap-6">
          {/* Título */}
          <div className="flex items-center gap-2">
            <Filter className="w-5 h-5 text-blue-600" aria-hidden="true" />
            <span className="text-lg font-bold text-gray-800 dark:text-gray-100 uppercase tracking-wide">
              FILTRE SEUS ITENS:
            </span>
          </div>

          {/* Campos de Filtro */}
          <div className="flex items-end gap-1 sm:gap-2 md:gap-3 lg:gap-4 flex-1">
            <div className="flex flex-col flex-1 min-w-0">
              <label htmlFor="dre-period-filter" className="text-xs sm:text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1 truncate">
                Período
              </label>
              <select
                id="dre-period-filter"
                name="dre-period-filter"
                value={selectedPeriod}
                onChange={(e) => {
                  const period = e.target.value as 'mensal' | 'trimestral' | 'anual'
                  setSelectedPeriod(period)
                  // Ao trocar para trimestral, normaliza o mês para o início do trimestre
                  if (period === 'trimestral') {
                    setSelectedMonth(Math.floor(selectedMonth / 3) * 3)
                  }
                }}
                className="px-1 sm:px-2 md:px-3 py-1 sm:py-2 border border-blue-200 dark:border-gray-600 rounded-xl text-xs sm:text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white dark:!bg-gray-700 dark:text-gray-100 w-full transition-all duration-200"
              >
                <option value="mensal">Mensal</option>
                <option value="trimestral">Trimestral</option>
                <option value="anual">Anual</option>
              </select>
            </div>

            {selectedPeriod !== 'anual' && (
              <div className="flex flex-col flex-1 min-w-0">
                <label htmlFor="dre-month-filter" className="text-xs sm:text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1 truncate">
                  {selectedPeriod === 'trimestral' ? 'Trimestre' : 'Mês'}
                </label>
                <select
                  id="dre-month-filter"
                  name="dre-month-filter"
                  value={selectedMonth}
                  onChange={(e) => {
                    const month = parseInt(e.target.value)
                    setSelectedMonth(selectedPeriod === 'trimestral' ? Math.floor(month / 3) * 3 : month)
                  }}
                  className="px-1 sm:px-2 md:px-3 py-1 sm:py-2 border border-blue-200 dark:border-gray-600 rounded-xl text-xs sm:text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white dark:!bg-gray-700 dark:text-gray-100 w-full transition-all duration-200"
                >
                  {selectedPeriod === 'trimestral' ? (
                    <>
                      <option value={0}>1º Trimestre (Jan–Mar)</option>
                      <option value={3}>2º Trimestre (Abr–Jun)</option>
                      <option value={6}>3º Trimestre (Jul–Set)</option>
                      <option value={9}>4º Trimestre (Out–Dez)</option>
                    </>
                  ) : (
                    Array.from({ length: 12 }, (_, i) => (
                      <option key={i} value={i}>
                        {getMonthName(i)}
                      </option>
                    ))
                  )}
                </select>
              </div>
            )}

            <div className="flex flex-col flex-1 min-w-0">
              <label htmlFor="dre-year-filter" className="text-xs sm:text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1 truncate">
                Ano
              </label>
              <select
                id="dre-year-filter"
                name="dre-year-filter"
                value={selectedYear}
                onChange={(e) => setSelectedYear(parseInt(e.target.value))}
                className="px-1 sm:px-2 md:px-3 py-1 sm:py-2 border border-blue-200 dark:border-gray-600 rounded-xl text-xs sm:text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white dark:!bg-gray-700 dark:text-gray-100 w-full transition-all duration-200"
              >
                {Array.from({ length: 10 }, (_, i) => {
                  const year = new Date().getFullYear() - 7 + i
                  return (
                    <option key={year} value={year} disabled={year > new Date().getFullYear()}>
                      {year}
                    </option>
                  )
                })}
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* Conteúdo exportável em PDF */}
      <div ref={dreContentRef} className="space-y-6">

      {/* DRE Table */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
        <div className="px-4 sm:px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
              DRE
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300">
                {getPeriodLabel()}
              </span>
            </h3>
            {previousPeriodTransactions.length > 0 && (
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5 flex items-center gap-1">
                <ArrowLeftRight className="w-3.5 h-3.5" aria-hidden="true" />
                Comparando com <span className="font-medium text-gray-700 dark:text-gray-300">{getPreviousPeriodLabel()}</span>
              </p>
            )}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full" aria-label={`DRE – ${getPeriodLabel()}`}>
            <thead className="bg-gradient-to-r from-blue-500 to-indigo-600">
              <tr>
                <th scope="col" className="px-4 sm:px-6 py-3 text-left text-xs font-semibold text-white uppercase tracking-wider">
                  Descrição
                </th>
                <th scope="col" className="px-4 sm:px-6 py-3 text-right text-xs font-semibold text-white uppercase tracking-wider">
                  Valor Atual
                </th>
                {previousPeriodTransactions.length > 0 && (
                  <>
                    <th scope="col" className="px-4 sm:px-6 py-3 text-right text-xs font-semibold text-white uppercase tracking-wider">
                      Valor Anterior
                    </th>
                    <th scope="col" className="px-4 sm:px-6 py-3 text-right text-xs font-semibold text-white uppercase tracking-wider">
                      Variação
                    </th>
                  </>
                )}
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
              {filteredTransactions.length === 0 ||
               !filteredTransactions.some(t => isReceita(t.type) || isDespesa(t.type)) ? (
                <tr>
                  <td colSpan={previousPeriodTransactions.length > 0 ? 4 : 2} className="px-4 sm:px-6 py-12 text-center">
                    <div className="flex flex-col items-center gap-3">
                      <BarChart3 className="w-12 h-12 text-gray-300 dark:text-gray-600" aria-hidden="true" />
                      <p className="text-gray-500 dark:text-gray-400 font-medium">Nenhuma transação encontrada para o período selecionado</p>
                      <p className="text-gray-400 dark:text-gray-500 text-sm">Tente selecionar outro período</p>
                    </div>
                  </td>
                </tr>
              ) : (
                dreWithComparison.map((row) => {
                  const isReceitas = row.id === 'receitas'
                  const isDespesas = row.id === 'despesas'
                  const isResultado = row.id === 'resultado'
                  const borderColor = isReceitas ? 'border-l-4 border-l-emerald-500'
                    : isDespesas ? 'border-l-4 border-l-rose-500'
                    : isResultado ? `border-l-4 ${row.value >= 0 ? 'border-l-blue-500' : 'border-l-red-500'}`
                    : ''
                  const rowBg = isResultado
                    ? row.value >= 0 ? 'bg-green-50 dark:bg-green-900/20' : 'bg-red-50 dark:bg-red-900/20'
                    : row.level === 0 ? 'bg-blue-50 dark:bg-blue-900/20' : row.level === 1 ? 'bg-gray-50 dark:bg-gray-700/50' : ''

                  // Para linhas de despesa (exceto resultado), aumento é ruim → inverter cores
                  const isExpenseRow = row.id === 'despesas' || (row.type === 'despesa' && row.id !== 'resultado')
                  const isPositiveChange = isExpenseRow
                    ? (row.variation ?? 0) <= 0
                    : (row.variation ?? 0) >= 0

                  return (
                  <tr
                    key={row.id}
                    className={`${rowBg} ${row.level === 0 ? 'font-semibold' : ''} ${borderColor} ${isResultado ? 'border-t-2 border-t-gray-300 dark:border-t-gray-600' : ''}`}
                  >
                    <td
                      className={`py-3 text-sm ${isResultado ? (row.value >= 0 ? 'text-green-800 dark:text-green-300' : 'text-red-800 dark:text-red-300') : row.level === 0 ? 'text-blue-900 dark:text-blue-300' : 'text-gray-900 dark:text-gray-100'}`}
                      style={{ paddingLeft: `${row.level * 20 + 16}px`, paddingRight: '24px' }}
                    >
                      {isResultado ? <span className="text-base font-bold">{row.description}</span> : row.description}
                    </td>
                    <td
                      className={`px-4 sm:px-6 py-3 text-right font-medium ${isResultado ? 'text-base' : 'text-sm'} ${
                        row.id === 'receitas' ? 'text-green-600 dark:text-green-400'
                        : row.id === 'despesas' ? 'text-red-600 dark:text-red-400'
                        : row.type === 'receita' ? 'text-green-600 dark:text-green-400'
                        : row.type === 'despesa' ? 'text-red-600 dark:text-red-400'
                        : row.value >= 0 ? 'text-green-600 dark:text-green-400'
                        : 'text-red-600 dark:text-red-400'
                      }`}
                    >
                      {isResultado ? <span className="text-base font-bold">{formatCurrency(row.value)}</span> : formatCurrency(row.value)}
                    </td>
                    {previousPeriodTransactions.length > 0 && (
                      <>
                        <td className="px-4 sm:px-6 py-3 text-sm text-right text-gray-600 dark:text-gray-400">
                          {row.valuePrevious !== undefined ? formatCurrency(row.valuePrevious) : '-'}
                        </td>
                        <td className="px-4 sm:px-6 py-3 text-sm text-right">
                          {row.variation !== undefined && row.variationPercent !== undefined ? (
                            <div className="flex items-center justify-end gap-1">
                              <span
                                className={`inline-flex items-center gap-0.5 font-medium px-2 py-0.5 rounded-full text-xs ${isPositiveChange ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300' : 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300'}`}
                              >
                                {isPositiveChange ? <TrendingUp className="w-3 h-3" aria-hidden="true" /> : <TrendingDown className="w-3 h-3" aria-hidden="true" />}
                                {formatPercent(Math.abs(row.variationPercent))}
                              </span>
                              <span className="text-xs text-gray-500 dark:text-gray-400 hidden sm:inline">
                                {formatCurrency(Math.abs(row.variation))}
                              </span>
                            </div>
                          ) : (
                            <span className="text-gray-400 dark:text-gray-600">-</span>
                          )}
                        </td>
                      </>
                    )}
                  </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Resumo */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-gradient-to-r from-emerald-500 to-green-400 rounded-2xl shadow-lg p-6">
          <div className="flex items-center">
            <div className="flex-shrink-0 bg-white/20 rounded-xl p-2">
              <TrendingUp className="h-8 w-8 text-white" aria-hidden="true" />
            </div>
            <div className="ml-4 flex-1">
              <p className="text-sm font-medium text-white/80">Total Receitas</p>
              <p className="text-2xl font-bold text-white">
                {formatCurrency(totalReceitas)}
              </p>
              {previousPeriodTransactions.length > 0 && (
                <div className="flex items-center gap-1 mt-1">
                  <span className="text-xs text-white/90 flex items-center gap-0.5">
                    {variacaoReceitas >= 0 ? <TrendingUp className="w-3 h-3" aria-hidden="true" /> : <TrendingDown className="w-3 h-3" aria-hidden="true" />} {formatCurrency(Math.abs(variacaoReceitas))}
                  </span>
                  <span className="text-xs text-white/80">
                    ({formatPercent(Math.abs(variacaoReceitasPercent))})
                  </span>
                </div>
              )}
            </div>
          </div>
          {totalReceitas > 0 && (
            <div className="mt-4">
              <div className="flex justify-between text-xs text-white/70 mb-1">
                <span>Despesas / Receitas</span>
                {/* Label mostra o valor real (pode ser >100% quando despesas superam receitas) */}
                <span>{Math.round((totalDespesas / totalReceitas) * 100)}%</span>
              </div>
              <div className="h-1.5 bg-white/30 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${(totalDespesas / totalReceitas) > 0.9 ? 'bg-yellow-300' : 'bg-white'}`}
                  style={{ width: `${Math.min(100, (totalDespesas / totalReceitas) * 100)}%` }}
                />
              </div>
            </div>
          )}
        </div>

        <div className="bg-gradient-to-r from-rose-500 to-red-400 rounded-2xl shadow-lg p-6">
          <div className="flex items-center">
            <div className="flex-shrink-0 bg-white/20 rounded-xl p-2">
              <TrendingDown className="h-8 w-8 text-white" aria-hidden="true" />
            </div>
            <div className="ml-4 flex-1">
              <p className="text-sm font-medium text-white/80">Total Despesas</p>
              <p className="text-2xl font-bold text-white">
                {formatCurrency(totalDespesas)}
              </p>
              {previousPeriodTransactions.length > 0 && (
                <div className="flex items-center gap-1 mt-1">
                  <span className="text-xs text-white/90 flex items-center gap-0.5">
                    {variacaoDespesas <= 0 ? <TrendingDown className="w-3 h-3" aria-hidden="true" /> : <TrendingUp className="w-3 h-3" aria-hidden="true" />} {formatCurrency(Math.abs(variacaoDespesas))}
                  </span>
                  <span className="text-xs text-white/80">
                    ({formatPercent(Math.abs(variacaoDespesasPercent))})
                  </span>
                </div>
              )}
            </div>
          </div>
          {totalReceitas > 0 && (
            <div className="mt-4">
              <div className="flex justify-between text-xs text-white/70 mb-1">
                <span>Do total de receitas</span>
                {/* Label mostra o valor real (pode ser >100% quando despesas superam receitas) */}
                <span>{Math.round((totalDespesas / totalReceitas) * 100)}%</span>
              </div>
              <div className="h-1.5 bg-white/30 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${(totalDespesas / totalReceitas) > 0.9 ? 'bg-yellow-300' : 'bg-white'}`}
                  style={{ width: `${Math.min(100, (totalDespesas / totalReceitas) * 100)}%` }}
                />
              </div>
            </div>
          )}
        </div>

        <div className={`bg-gradient-to-r ${resultadoLiquido >= 0 ? 'from-blue-500 to-indigo-600' : 'from-rose-600 to-red-500'} rounded-2xl shadow-lg p-6`}>
          <div className="flex items-center">
            <div className="flex-shrink-0 bg-white/20 rounded-xl p-2">
              <DollarSign className="h-8 w-8 text-white" aria-hidden="true" />
            </div>
            <div className="ml-4 flex-1">
              <p className="text-sm font-medium text-white/80">Resultado Líquido</p>
              <p className="text-2xl font-bold text-white">
                {formatCurrency(resultadoLiquido)}
              </p>
              {previousPeriodTransactions.length > 0 && (
                <div className="flex items-center gap-1 mt-1">
                  <span className="text-xs text-white/90 flex items-center gap-0.5">
                    {variacaoResultado >= 0 ? <TrendingUp className="w-3 h-3" aria-hidden="true" /> : <TrendingDown className="w-3 h-3" aria-hidden="true" />} {formatCurrency(Math.abs(variacaoResultado))}
                  </span>
                  <span className="text-xs text-white/80">
                    ({formatPercent(Math.abs(variacaoResultadoPercent))})
                  </span>
                </div>
              )}
            </div>
          </div>
          {totalReceitas > 0 ? (
            <div className="mt-4">
              <div className="flex justify-between text-xs text-white/70 mb-1">
                <span>Margem líquida</span>
                {/* Label mantém sinal negativo para não enganar o usuário (Math.abs removido) */}
                <span>{Math.min(100, Math.max(-100, Math.round((resultadoLiquido / totalReceitas) * 100)))}%</span>
              </div>
              <div className="h-1.5 bg-white/30 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${resultadoLiquido < 0 ? 'bg-red-300' : 'bg-white'}`}
                  style={{ width: `${Math.abs(Math.min(100, Math.max(-100, (resultadoLiquido / totalReceitas) * 100)))}%` }}
                />
              </div>
            </div>
          ) : (
            <p className="mt-4 text-xs text-white/70">Sem receitas no período</p>
          )}
        </div>
      </div>

      </div>{/* fim do bloco exportável */}
    </div>
  )
}

export default DRE

