import React, { useState, useEffect, useRef } from 'react'
import { Calculator } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'

interface ProjectionData {
  despesasVariaveis: number[]
  despesasFixas: number[]
  investimentos: number[]
  mkt: number[]
  faturamentoReurb: number[]
  faturamentoGeo: number[]
  faturamentoPlan: number[]
  faturamentoReg: number[]
  faturamentoNn: number[]
  growth?: {
    minimo: number
    medio: number
    maximo: number
  }
  mktComponents?: {
    trafego: number[]
    socialMedia: number[]
    producaoConteudo: number[]
  }
}

interface FixedExpensesData {
  previsto: number[]
  media: number[]
  maximo: number[]
}

interface VariableExpensesData {
  previsto: number[]
  medio: number[]
  maximo: number[]
}

const API_BASE_URL = '/api'

const Projection: React.FC = () => {
  const { token } = useAuth()
  const [data, setData] = useState<ProjectionData>({
    despesasVariaveis: new Array(12).fill(0),
    despesasFixas: new Array(12).fill(0),
    investimentos: new Array(12).fill(0),
    mkt: new Array(12).fill(0),
    faturamentoReurb: new Array(12).fill(0),
    faturamentoGeo: new Array(12).fill(0),
    faturamentoPlan: new Array(12).fill(0),
    faturamentoReg: new Array(12).fill(0),
    faturamentoNn: new Array(12).fill(0),
    growth: { minimo: 0, medio: 0, maximo: 0 },
    mktComponents: {
      trafego: new Array(12).fill(0),
      socialMedia: new Array(12).fill(0),
      producaoConteudo: new Array(12).fill(0)
    }
  })
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [fixedExpensesData, setFixedExpensesData] = useState<FixedExpensesData>({
    previsto: new Array(12).fill(0),
    media: new Array(12).fill(0),
    maximo: new Array(12).fill(0)
  })
  const [variableExpensesData, setVariableExpensesData] = useState<VariableExpensesData>({
    previsto: new Array(12).fill(0),
    medio: new Array(12).fill(0),
    maximo: new Array(12).fill(0)
  })

  const meses = [
    'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
    'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
  ]

  // Carregar dados do servidor
  useEffect(() => {
    const loadData = async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/projection`)
        if (response.ok) {
          const serverData = await response.json()
          setData(serverData)
        } else {
          console.error('Erro ao carregar dados de projeção')
        }
      } catch (error) {
        console.error('Erro ao carregar dados:', error)
      } finally {
        setIsLoading(false)
      }
    }
    
    loadData()
    loadFixedExpensesData()
    loadVariableExpensesData()
  }, [])

  // Salvamento automático a cada 5 segundos
  useEffect(() => {
    const interval = setInterval(() => {
      if (token && !isSaving) {
        console.log('Salvamento automático executado')
        setIsSaving(true)
        saveToServer(data)
      }
    }, 5000)

    return () => clearInterval(interval)
  }, [token, data, isSaving])

  // Atualizar automaticamente todos os valores das despesas fixas
  useEffect(() => {
    let precisaAtualizar = false
    const novosValores = [...fixedExpensesData.previsto]
    
    for (let i = 0; i < 12; i++) {
      const novoValor = calcularPrevistoMes(i)
      if (novosValores[i] !== novoValor) {
        novosValores[i] = novoValor
        precisaAtualizar = true
      }
    }
    
    if (precisaAtualizar) {
      const novosDados = {
        ...fixedExpensesData,
        previsto: novosValores
      }
      setFixedExpensesData(novosDados)
      if (token) {
        saveFixedExpensesToServer(novosDados)
      }
    }
  }, [data.despesasFixas[11]]) // Depende do valor de dezembro da primeira tabela

  // Atualização automática das despesas variáveis quando dados da tabela principal ou percentual mudarem
  useEffect(() => {
    let precisaAtualizar = false
    const novosPrevisto = [...variableExpensesData.previsto]
    const novosMedio = [...variableExpensesData.medio]
    const novosMaximo = [...variableExpensesData.maximo]
    
    for (let i = 0; i < 12; i++) {
      const novoPrevisto = calcularPrevistoVariableMes(i)
      const novoMedio = calcularMedioVariableMes(i)
      const novoMaximo = calcularMaximoVariableMes(i)
      
      if (novosPrevisto[i] !== novoPrevisto) {
        novosPrevisto[i] = novoPrevisto
        precisaAtualizar = true
      }
      if (novosMedio[i] !== novoMedio) {
        novosMedio[i] = novoMedio
        precisaAtualizar = true
      }
      if (novosMaximo[i] !== novoMaximo) {
        novosMaximo[i] = novoMaximo
        precisaAtualizar = true
      }
    }
    
    if (precisaAtualizar) {
      const novosDados = {
        ...variableExpensesData,
        previsto: novosPrevisto,
        medio: novosMedio,
        maximo: novosMaximo
      }
      setVariableExpensesData(novosDados)
      if (token) {
        saveVariableExpensesToServer(novosDados)
      }
    }
  }, [data.despesasVariaveis, data.growth?.minimo, data.growth?.medio, data.growth?.maximo]) // Depende dos dados da tabela principal e percentuais

  // Salvar dados no servidor
  const saveToServer = async (newData: ProjectionData) => {
    if (!token) return
    
    setIsSaving(true)
    try {
      const response = await fetch(`${API_BASE_URL}/projection`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(newData)
      })
      
      if (!response.ok) {
        throw new Error('Erro ao salvar dados')
      }
      
      console.log('Dados salvos com sucesso!')
    } catch (error) {
      console.error('Erro ao salvar:', error)
    } finally {
      setIsSaving(false)
    }
  }

  const updateDataAndSave = (category: keyof ProjectionData, monthIndex: number, value: number) => {
    console.log('updateDataAndSave chamado:', category, monthIndex, value)
    const newData = {
      ...data,
      [category]: Array.isArray(data[category]) 
        ? (data[category] as number[]).map((val, index) => 
            index === monthIndex ? value : val
          )
        : data[category]
    }
    setData(newData)
    
    // Salvar imediatamente
    if (token) {
      console.log('Salvando no servidor...')
      setIsSaving(true)
      saveToServer(newData)
    } else {
      console.log('Token não encontrado, não salvando')
    }
  }

  // Atualiza blocos "growth" (não mensais)
  const updateGrowthAndSave = (key: 'minimo' | 'medio' | 'maximo', value: number) => {
    const newData: ProjectionData = {
      ...data,
      growth: {
        minimo: data.growth?.minimo ?? 0,
        medio: data.growth?.medio ?? 0,
        maximo: data.growth?.maximo ?? 0,
        [key]: value
      }
    }
    setData(newData)
    if (token) {
      setIsSaving(true)
      saveToServer(newData)
    }
  }

  // Carregar dados de despesas fixas
  const loadFixedExpensesData = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/fixed-expenses`)
      if (response.ok) {
        const fixedData = await response.json()
        setFixedExpensesData(fixedData)
      }
    } catch (error) {
      console.error('Erro ao carregar despesas fixas:', error)
    }
  }

  // Salvar dados de despesas fixas
  const saveFixedExpensesToServer = async (newData: FixedExpensesData) => {
    if (!token) return
    
    setIsSaving(true)
    try {
      const response = await fetch(`${API_BASE_URL}/fixed-expenses`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(newData)
      })
      
      if (!response.ok) {
        throw new Error('Erro ao salvar dados de despesas fixas')
      }
      
      console.log('Dados de despesas fixas salvos com sucesso!')
    } catch (error) {
      console.error('Erro ao salvar despesas fixas:', error)
    } finally {
      setIsSaving(false)
    }
  }

  // Atualizar despesas fixas e salvar
  const updateFixedExpensesAndSave = (category: keyof FixedExpensesData, monthIndex: number, value: number) => {
    const newData = {
      ...fixedExpensesData,
      [category]: fixedExpensesData[category].map((val, index) => 
        index === monthIndex ? value : val
      )
    }
    setFixedExpensesData(newData)
    
    if (token) {
      saveFixedExpensesToServer(newData)
    }
  }

  // Carregar dados de despesas variáveis
  const loadVariableExpensesData = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/variable-expenses`)
      if (response.ok) {
        const variableData = await response.json()
        setVariableExpensesData(variableData)
      }
    } catch (error) {
      console.error('Erro ao carregar despesas variáveis:', error)
    }
  }

  // Salvar dados de despesas variáveis
  const saveVariableExpensesToServer = async (newData: VariableExpensesData) => {
    if (!token) return
    
    setIsSaving(true)
    try {
      const response = await fetch(`${API_BASE_URL}/variable-expenses`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(newData)
      })
      
      if (!response.ok) {
        throw new Error('Erro ao salvar dados de despesas variáveis')
      }
      
      console.log('Dados de despesas variáveis salvos com sucesso!')
    } catch (error) {
      console.error('Erro ao salvar despesas variáveis:', error)
    } finally {
      setIsSaving(false)
    }
  }

  // Atualizar despesas variáveis e salvar
  const updateVariableExpensesAndSave = (category: keyof VariableExpensesData, monthIndex: number, value: number) => {
    const newData = {
      ...variableExpensesData,
      [category]: variableExpensesData[category].map((val, index) => 
        index === monthIndex ? value : val
      )
    }
    setVariableExpensesData(newData)
    
    if (token) {
      saveVariableExpensesToServer(newData)
    }
  }

  // Fórmulas calculadas
  const calcularDespesasTotais = (monthIndex: number) => {
    return formatNumber(data.despesasVariaveis[monthIndex] + data.despesasFixas[monthIndex])
  }

  const calcularFaturamentoTotal = (monthIndex: number) => {
    return formatNumber(
      data.faturamentoReurb[monthIndex] + 
      data.faturamentoGeo[monthIndex] + 
      data.faturamentoPlan[monthIndex] + 
      data.faturamentoReg[monthIndex] + 
      data.faturamentoNn[monthIndex]
    )
  }

  const calcularResultado = (monthIndex: number) => {
    const faturamentoTotal = calcularFaturamentoTotal(monthIndex)
    const despesasTotais = calcularDespesasTotais(monthIndex)
    return formatNumber(faturamentoTotal - (data.mkt[monthIndex] + data.investimentos[monthIndex] + despesasTotais))
  }

  // Cálculos por trimestre
  const calcularTrimestre = (startMonth: number, endMonth: number, calculator: (monthIndex: number) => number) => {
    let total = 0
    for (let i = startMonth; i <= endMonth; i++) {
      total += calculator(i)
    }
    return formatNumber(total)
  }

  const calcularTotalGeral = (calculator: (monthIndex: number) => number) => {
    return formatNumber(calcularTrimestre(0, 11, calculator))
  }

  const calcularMedia = (calculator: (monthIndex: number) => number) => {
    return formatNumber(calcularTotalGeral(calculator) / 12)
  }

  // Funções específicas para despesas fixas
  const calcularPrevistoJaneiro = () => {
    // Janeiro = Dezembro da primeira tabela + 10%
    const dezembroDespesasFixas = data.despesasFixas[11] || 0
    return formatNumber(dezembroDespesasFixas * 1.1)
  }

  const calcularPrevistoMes = (monthIndex: number) => {
    if (monthIndex === 0) {
      // Janeiro = Dezembro da primeira tabela + 10%
      return calcularPrevistoJaneiro()
    } else if (monthIndex === 1 || monthIndex === 2) {
      // Fevereiro e Março = Janeiro
      return formatNumber(fixedExpensesData.previsto[0] || 0)
    } else if (monthIndex === 3) {
      // Abril = Março + 10%
      const marco = fixedExpensesData.previsto[2] || 0
      return formatNumber(marco * 1.1)
    } else if (monthIndex === 4 || monthIndex === 5) {
      // Maio e Junho = Abril
      return formatNumber(fixedExpensesData.previsto[3] || 0)
    } else if (monthIndex === 6) {
      // Julho = Junho + 10%
      const junho = fixedExpensesData.previsto[5] || 0
      return formatNumber(junho * 1.1)
    } else if (monthIndex === 7 || monthIndex === 8) {
      // Agosto e Setembro = Julho
      return formatNumber(fixedExpensesData.previsto[6] || 0)
    } else if (monthIndex === 9) {
      // Outubro = Setembro + 10%
      const setembro = fixedExpensesData.previsto[8] || 0
      return formatNumber(setembro * 1.1)
    } else if (monthIndex === 10 || monthIndex === 11) {
      // Novembro e Dezembro = Outubro
      return formatNumber(fixedExpensesData.previsto[9] || 0)
    } else {
      // Fallback (não deveria acontecer)
      return 0
    }
  }

  const calcularMediaMes = (monthIndex: number) => {
    // Média = Previsto + 10%
    const previsto = calcularPrevistoMes(monthIndex)
    return formatNumber(previsto * 1.1)
  }

  const calcularMaximoMes = (monthIndex: number) => {
    // Máximo = Média + 10%
    const media = calcularMediaMes(monthIndex)
    return formatNumber(media * 1.1)
  }

  // Funções específicas para despesas variáveis
  const calcularPrevistoVariableMes = (monthIndex: number) => {
    // Previsto = Despesas Variáveis (tabela principal) + Percentual Mínimo
    const despesasVariaveis = data.despesasVariaveis[monthIndex] || 0
    const percentualMinimo = data.growth?.minimo || 0
    return formatNumber(despesasVariaveis + (despesasVariaveis * percentualMinimo / 100))
  }

  const calcularMedioVariableMes = (monthIndex: number) => {
    // Médio = Despesas Variáveis (tabela principal) + Percentual Médio
    const despesasVariaveis = data.despesasVariaveis[monthIndex] || 0
    const percentualMedio = data.growth?.medio || 0
    return formatNumber(despesasVariaveis + (despesasVariaveis * percentualMedio / 100))
  }

  const calcularMaximoVariableMes = (monthIndex: number) => {
    // Máximo = Despesas Variáveis (tabela principal) + Percentual Máximo
    const despesasVariaveis = data.despesasVariaveis[monthIndex] || 0
    const percentualMaximo = data.growth?.maximo || 0
    return formatNumber(despesasVariaveis + (despesasVariaveis * percentualMaximo / 100))
  }

  // Funções específicas para despesas fixas + variáveis (não editáveis)
  const calcularPrevistoFixoVariavelMes = (monthIndex: number) => {
    // Previsto = Despesas Fixas (Previsto) + Despesas Variáveis (Previsto)
    const despesasFixasPrevisto = calcularPrevistoMes(monthIndex)
    const despesasVariaveisPrevisto = calcularPrevistoVariableMes(monthIndex)
    return formatNumber(despesasFixasPrevisto + despesasVariaveisPrevisto)
  }

  const calcularMedioFixoVariavelMes = (monthIndex: number) => {
    // Médio = Despesas Fixas (Média) + Despesas Variáveis (Médio)
    const despesasFixasMedia = calcularMediaMes(monthIndex)
    const despesasVariaveisMedio = calcularMedioVariableMes(monthIndex)
    return formatNumber(despesasFixasMedia + despesasVariaveisMedio)
  }

  const calcularMaximoFixoVariavelMes = (monthIndex: number) => {
    // Máximo = Despesas Fixas (Máximo) + Despesas Variáveis (Máximo)
    const despesasFixasMaximo = calcularMaximoMes(monthIndex)
    const despesasVariaveisMaximo = calcularMaximoVariableMes(monthIndex)
    return formatNumber(despesasFixasMaximo + despesasVariaveisMaximo)
  }

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    }).format(Math.round(value * 100) / 100)
  }

  const formatNumber = (value: number) => {
    return Math.round(value * 100) / 100
  }

  const InputCell: React.FC<{
    value: number
    onBlur: (value: number) => void
    className?: string
    category: string
    monthIndex: number
  }> = ({ value, onBlur, className = '', category, monthIndex }) => {
    const inputRef = useRef<HTMLInputElement>(null)
    
    const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
      const numericValue = parseFloat(e.target.value) || 0
      console.log('handleBlur chamado com valor:', numericValue)
      onBlur(numericValue)
    }
    
    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter' || e.key === 'Tab') {
        const numericValue = parseFloat((e.target as HTMLInputElement).value) || 0
        console.log('Tecla Enter/Tab pressionada, salvando:', numericValue)
        onBlur(numericValue)
      }
    }
    
    return (
      <input
        ref={inputRef}
        key={`${category}-${monthIndex}-${value}`}
        type="number"
        defaultValue={value || ''}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        className={`w-full px-3 py-1 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${className}`}
        placeholder="0,00"
      />
    )
  }

  const CalculatedCell: React.FC<{
    value: number
    className?: string
  }> = ({ value, className = '' }) => (
    <div className={`px-3 py-1 text-sm font-semibold text-center ${className}`}>
      {formatCurrency(value)}
    </div>
  )

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <h1 className="text-3xl font-bold flex items-center gap-3">
          <Calculator className="w-8 h-8 text-blue-600" />
          Projeção Anual
        </h1>
        <div className="flex items-center gap-4">
          {isSaving && (
            <div className="flex items-center gap-2 text-sm text-blue-600">
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
              Salvando...
            </div>
          )}
          <div className="text-sm text-gray-600">
            <p>Preencha apenas os valores mensais - os cálculos são automáticos</p>
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center items-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          <span className="ml-2 text-gray-600">Carregando dados...</span>
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1200px]">
            {/* Cabeçalho */}
            <thead className="bg-gray-800 text-white">
              <tr>
                <th className="px-4 py-3 text-left font-bold">RESULTADO DO ANO ANTERIOR</th>
                <th className="px-3 py-3 text-center font-bold">1 TRI</th>
                {meses.slice(0, 3).map(mes => (
                  <th key={mes} className="px-3 py-3 text-center font-bold">{mes}</th>
                ))}
                <th className="px-3 py-3 text-center font-bold">2 TRI</th>
                {meses.slice(3, 6).map(mes => (
                  <th key={mes} className="px-3 py-3 text-center font-bold">{mes}</th>
                ))}
                <th className="px-3 py-3 text-center font-bold">3 TRI</th>
                {meses.slice(6, 9).map(mes => (
                  <th key={mes} className="px-3 py-3 text-center font-bold">{mes}</th>
                ))}
                <th className="px-3 py-3 text-center font-bold">4 TRI</th>
                {meses.slice(9, 12).map(mes => (
                  <th key={mes} className="px-3 py-3 text-center font-bold">{mes}</th>
                ))}
                <th className="px-3 py-3 text-center font-bold">Total Geral</th>
                <th className="px-3 py-3 text-center font-bold">Média</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-gray-200">
              {/* Despesas Totais */}
              <tr className="bg-gray-100">
                <td className="px-4 py-3 font-semibold text-gray-800">Despesas Totais</td>
                <td className="px-3 py-2">
                  <CalculatedCell value={calcularTrimestre(0, 2, calcularDespesasTotais)} />
                </td>
                {meses.slice(0, 3).map((_, index) => (
                  <td key={index} className="px-3 py-2">
                    <CalculatedCell value={calcularDespesasTotais(index)} />
                  </td>
                ))}
                <td className="px-3 py-2">
                  <CalculatedCell value={calcularTrimestre(3, 5, calcularDespesasTotais)} />
                </td>
                {meses.slice(3, 6).map((_, index) => (
                  <td key={index + 3} className="px-3 py-2">
                    <CalculatedCell value={calcularDespesasTotais(index + 3)} />
                  </td>
                ))}
                <td className="px-3 py-2">
                  <CalculatedCell value={calcularTrimestre(6, 8, calcularDespesasTotais)} />
                </td>
                {meses.slice(6, 9).map((_, index) => (
                  <td key={index + 6} className="px-3 py-2">
                    <CalculatedCell value={calcularDespesasTotais(index + 6)} />
                  </td>
                ))}
                <td className="px-3 py-2">
                  <CalculatedCell value={calcularTrimestre(9, 11, calcularDespesasTotais)} />
                </td>
                {meses.slice(9, 12).map((_, index) => (
                  <td key={index + 9} className="px-3 py-2">
                    <CalculatedCell value={calcularDespesasTotais(index + 9)} />
                  </td>
                ))}
                <td className="px-3 py-2">
                  <CalculatedCell value={calcularTotalGeral(calcularDespesasTotais)} />
                </td>
                <td className="px-3 py-2">
                  <CalculatedCell value={calcularMedia(calcularDespesasTotais)} />
                </td>
              </tr>

              {/* Despesas Variáveis */}
              <tr>
                <td className="px-4 py-3 text-gray-700">Despesas Variáveis</td>
                <td className="px-3 py-2">
                  <CalculatedCell value={calcularTrimestre(0, 2, (i) => data.despesasVariaveis[i])} />
                </td>
                {meses.slice(0, 3).map((_, index) => (
                  <td key={index} className="px-3 py-2">
                    <InputCell 
                      value={data.despesasVariaveis[index]} 
                      onBlur={(value) => updateDataAndSave('despesasVariaveis', index, value)}
                      category="despesasVariaveis"
                      monthIndex={index}
                    />
                  </td>
                ))}
                <td className="px-3 py-2">
                  <CalculatedCell value={calcularTrimestre(3, 5, (i) => data.despesasVariaveis[i])} />
                </td>
                {meses.slice(3, 6).map((_, index) => (
                  <td key={index + 3} className="px-3 py-2">
                    <InputCell 
                      value={data.despesasVariaveis[index + 3]} 
                      onBlur={(value) => updateDataAndSave('despesasVariaveis', index + 3, value)}
                      category="despesasVariaveis"
                      monthIndex={index + 3}
                    />
                  </td>
                ))}
                <td className="px-3 py-2">
                  <CalculatedCell value={calcularTrimestre(6, 8, (i) => data.despesasVariaveis[i])} />
                </td>
                {meses.slice(6, 9).map((_, index) => (
                  <td key={index + 6} className="px-3 py-2">
                    <InputCell 
                      value={data.despesasVariaveis[index + 6]} 
                      onBlur={(value) => updateDataAndSave('despesasVariaveis', index + 6, value)}
                      category="despesasVariaveis"
                      monthIndex={index + 6}
                    />
                  </td>
                ))}
                <td className="px-3 py-2">
                  <CalculatedCell value={calcularTrimestre(9, 11, (i) => data.despesasVariaveis[i])} />
                </td>
                {meses.slice(9, 12).map((_, index) => (
                  <td key={index + 9} className="px-3 py-2">
                    <InputCell 
                      value={data.despesasVariaveis[index + 9]} 
                      onBlur={(value) => updateDataAndSave('despesasVariaveis', index + 9, value)}
                      category="despesasVariaveis"
                      monthIndex={index + 9}
                    />
                  </td>
                ))}
                <td className="px-3 py-2">
                  <CalculatedCell value={calcularTotalGeral((i) => data.despesasVariaveis[i])} />
                </td>
                <td className="px-3 py-2">
                  <CalculatedCell value={calcularMedia((i) => data.despesasVariaveis[i])} />
                </td>
              </tr>

              {/* Despesas Fixas */}
              <tr>
                <td className="px-4 py-3 text-gray-700">Despesas Fixas</td>
                <td className="px-3 py-2">
                  <CalculatedCell value={calcularTrimestre(0, 2, (i) => data.despesasFixas[i])} />
                </td>
                {meses.slice(0, 3).map((_, index) => (
                  <td key={index} className="px-3 py-2">
                    <InputCell 
                      value={data.despesasFixas[index]} 
                      onBlur={(value) => updateDataAndSave('despesasFixas', index, value)}
                    
                      category="despesasFixas"
                      monthIndex={index}
                    />
                  </td>
                ))}
                <td className="px-3 py-2">
                  <CalculatedCell value={calcularTrimestre(3, 5, (i) => data.despesasFixas[i])} />
                </td>
                {meses.slice(3, 6).map((_, index) => (
                  <td key={index + 3} className="px-3 py-2">
                    <InputCell 
                      value={data.despesasFixas[index + 3]} 
                      onBlur={(value) => updateDataAndSave('despesasFixas', index + 3, value)}
                      category="despesasFixas"
                      monthIndex={index + 3}
                    />
                  </td>
                ))}
                <td className="px-3 py-2">
                  <CalculatedCell value={calcularTrimestre(6, 8, (i) => data.despesasFixas[i])} />
                </td>
                {meses.slice(6, 9).map((_, index) => (
                  <td key={index + 6} className="px-3 py-2">
                    <InputCell 
                      value={data.despesasFixas[index + 6]} 
                      onBlur={(value) => updateDataAndSave('despesasFixas', index + 6, value)}
                    
                      category="despesasFixas"
                      monthIndex={index + 6}
                    />
                  </td>
                ))}
                <td className="px-3 py-2">
                  <CalculatedCell value={calcularTrimestre(9, 11, (i) => data.despesasFixas[i])} />
                </td>
                {meses.slice(9, 12).map((_, index) => (
                  <td key={index + 9} className="px-3 py-2">
                    <InputCell 
                      value={data.despesasFixas[index + 9]} 
                      onBlur={(value) => updateDataAndSave('despesasFixas', index + 9, value)}
                    
                      category="despesasFixas"
                      monthIndex={index + 9}
                    />
                  </td>
                ))}
                <td className="px-3 py-2">
                  <CalculatedCell value={calcularTotalGeral((i) => data.despesasFixas[i])} />
                </td>
                <td className="px-3 py-2">
                  <CalculatedCell value={calcularMedia((i) => data.despesasFixas[i])} />
                </td>
              </tr>

              {/* Investimentos */}
              <tr>
                <td className="px-4 py-3 text-gray-700">Investimentos</td>
                <td className="px-3 py-2">
                  <CalculatedCell value={calcularTrimestre(0, 2, (i) => data.investimentos[i])} />
                </td>
                {meses.slice(0, 3).map((_, index) => (
                  <td key={index} className="px-3 py-2">
                    <InputCell 
                      value={data.investimentos[index]} 
                      onBlur={(value) => updateDataAndSave('investimentos', index, value)}
                    
                      category="investimentos"
                      monthIndex={index}
                    />
                  </td>
                ))}
                <td className="px-3 py-2">
                  <CalculatedCell value={calcularTrimestre(3, 5, (i) => data.investimentos[i])} />
                </td>
                {meses.slice(3, 6).map((_, index) => (
                  <td key={index + 3} className="px-3 py-2">
                    <InputCell 
                      value={data.investimentos[index + 3]} 
                      onBlur={(value) => updateDataAndSave('investimentos', index + 3, value)}
                    
                      category="investimentos"
                      monthIndex={index + 3}
                    />
                  </td>
                ))}
                <td className="px-3 py-2">
                  <CalculatedCell value={calcularTrimestre(6, 8, (i) => data.investimentos[i])} />
                </td>
                {meses.slice(6, 9).map((_, index) => (
                  <td key={index + 6} className="px-3 py-2">
                    <InputCell 
                      value={data.investimentos[index + 6]} 
                      onBlur={(value) => updateDataAndSave('investimentos', index + 6, value)}
                    
                      category="investimentos"
                      monthIndex={index + 6}
                    />
                  </td>
                ))}
                <td className="px-3 py-2">
                  <CalculatedCell value={calcularTrimestre(9, 11, (i) => data.investimentos[i])} />
                </td>
                {meses.slice(9, 12).map((_, index) => (
                  <td key={index + 9} className="px-3 py-2">
                    <InputCell 
                      value={data.investimentos[index + 9]} 
                      onBlur={(value) => updateDataAndSave('investimentos', index + 9, value)}
                    
                      category="investimentos"
                      monthIndex={index + 9}
                    />
                  </td>
                ))}
                <td className="px-3 py-2">
                  <CalculatedCell value={calcularTotalGeral((i) => data.investimentos[i])} />
                </td>
                <td className="px-3 py-2">
                  <CalculatedCell value={calcularMedia((i) => data.investimentos[i])} />
                </td>
              </tr>

              {/* Mkt */}
              <tr>
                <td className="px-4 py-3 text-gray-700">Mkt</td>
                <td className="px-3 py-2">
                  <CalculatedCell value={calcularTrimestre(0, 2, (i) => data.mkt[i])} />
                </td>
                {meses.slice(0, 3).map((_, index) => (
                  <td key={index} className="px-3 py-2">
                    <InputCell 
                      value={data.mkt[index]} 
                      onBlur={(value) => updateDataAndSave('mkt', index, value)}
                    
                      category="mkt"
                      monthIndex={index}
                    />
                  </td>
                ))}
                <td className="px-3 py-2">
                  <CalculatedCell value={calcularTrimestre(3, 5, (i) => data.mkt[i])} />
                </td>
                {meses.slice(3, 6).map((_, index) => (
                  <td key={index + 3} className="px-3 py-2">
                    <InputCell 
                      value={data.mkt[index + 3]} 
                      onBlur={(value) => updateDataAndSave('mkt', index + 3, value)}
                    
                      category="mkt"
                      monthIndex={index + 3}
                    />
                  </td>
                ))}
                <td className="px-3 py-2">
                  <CalculatedCell value={calcularTrimestre(6, 8, (i) => data.mkt[i])} />
                </td>
                {meses.slice(6, 9).map((_, index) => (
                  <td key={index + 6} className="px-3 py-2">
                    <InputCell 
                      value={data.mkt[index + 6]} 
                      onBlur={(value) => updateDataAndSave('mkt', index + 6, value)}
                    
                      category="mkt"
                      monthIndex={index + 6}
                    />
                  </td>
                ))}
                <td className="px-3 py-2">
                  <CalculatedCell value={calcularTrimestre(9, 11, (i) => data.mkt[i])} />
                </td>
                {meses.slice(9, 12).map((_, index) => (
                  <td key={index + 9} className="px-3 py-2">
                    <InputCell 
                      value={data.mkt[index + 9]} 
                      onBlur={(value) => updateDataAndSave('mkt', index + 9, value)}
                    
                      category="mkt"
                      monthIndex={index + 9}
                    />
                  </td>
                ))}
                <td className="px-3 py-2">
                  <CalculatedCell value={calcularTotalGeral((i) => data.mkt[i])} />
                </td>
                <td className="px-3 py-2">
                  <CalculatedCell value={calcularMedia((i) => data.mkt[i])} />
                </td>
              </tr>

              {/* Faturamento Total */}
              <tr className="bg-blue-50">
                <td className="px-4 py-3 font-semibold text-blue-800">Faturamento Total</td>
                <td className="px-3 py-2">
                  <CalculatedCell value={calcularTrimestre(0, 2, calcularFaturamentoTotal)} />
                </td>
                {meses.slice(0, 3).map((_, index) => (
                  <td key={index} className="px-3 py-2">
                    <CalculatedCell value={calcularFaturamentoTotal(index)} />
                  </td>
                ))}
                <td className="px-3 py-2">
                  <CalculatedCell value={calcularTrimestre(3, 5, calcularFaturamentoTotal)} />
                </td>
                {meses.slice(3, 6).map((_, index) => (
                  <td key={index + 3} className="px-3 py-2">
                    <CalculatedCell value={calcularFaturamentoTotal(index + 3)} />
                  </td>
                ))}
                <td className="px-3 py-2">
                  <CalculatedCell value={calcularTrimestre(6, 8, calcularFaturamentoTotal)} />
                </td>
                {meses.slice(6, 9).map((_, index) => (
                  <td key={index + 6} className="px-3 py-2">
                    <CalculatedCell value={calcularFaturamentoTotal(index + 6)} />
                  </td>
                ))}
                <td className="px-3 py-2">
                  <CalculatedCell value={calcularTrimestre(9, 11, calcularFaturamentoTotal)} />
                </td>
                {meses.slice(9, 12).map((_, index) => (
                  <td key={index + 9} className="px-3 py-2">
                    <CalculatedCell value={calcularFaturamentoTotal(index + 9)} />
                  </td>
                ))}
                <td className="px-3 py-2">
                  <CalculatedCell value={calcularTotalGeral(calcularFaturamentoTotal)} />
                </td>
                <td className="px-3 py-2">
                  <CalculatedCell value={calcularMedia(calcularFaturamentoTotal)} />
                </td>
              </tr>

              {/* Faturamento REURB */}
              <tr>
                <td className="px-4 py-3 text-gray-700">Faturamento REURB</td>
                <td className="px-3 py-2">
                  <CalculatedCell value={calcularTrimestre(0, 2, (i) => data.faturamentoReurb[i])} />
                </td>
                {meses.slice(0, 3).map((_, index) => (
                  <td key={index} className="px-3 py-2">
                    <InputCell 
                      value={data.faturamentoReurb[index]} 
                      onBlur={(value) => updateDataAndSave('faturamentoReurb', index, value)}
                      category="faturamentoReurb"
                      monthIndex={index}
                      className="bg-blue-100"
                    />
                  </td>
                ))}
                <td className="px-3 py-2">
                  <CalculatedCell value={calcularTrimestre(3, 5, (i) => data.faturamentoReurb[i])} />
                </td>
                {meses.slice(3, 6).map((_, index) => (
                  <td key={index + 3} className="px-3 py-2">
                    <InputCell 
                      value={data.faturamentoReurb[index + 3]} 
                      onBlur={(value) => updateDataAndSave('faturamentoReurb', index + 3, value)}
                      category="faturamentoReurb"
                      monthIndex={index + 3}
                      className="bg-blue-100"
                    />
                  </td>
                ))}
                <td className="px-3 py-2">
                  <CalculatedCell value={calcularTrimestre(6, 8, (i) => data.faturamentoReurb[i])} />
                </td>
                {meses.slice(6, 9).map((_, index) => (
                  <td key={index + 6} className="px-3 py-2">
                    <InputCell 
                      value={data.faturamentoReurb[index + 6]} 
                      onBlur={(value) => updateDataAndSave('faturamentoReurb', index + 6, value)}
                      category="faturamentoReurb"
                      monthIndex={index + 6}
                      className="bg-blue-100"
                    />
                  </td>
                ))}
                <td className="px-3 py-2">
                  <CalculatedCell value={calcularTrimestre(9, 11, (i) => data.faturamentoReurb[i])} />
                </td>
                {meses.slice(9, 12).map((_, index) => (
                  <td key={index + 9} className="px-3 py-2">
                    <InputCell 
                      value={data.faturamentoReurb[index + 9]} 
                      onBlur={(value) => updateDataAndSave('faturamentoReurb', index + 9, value)}
                      category="faturamentoReurb"
                      monthIndex={index + 9}
                      className="bg-blue-100"
                    />
                  </td>
                ))}
                <td className="px-3 py-2">
                  <CalculatedCell value={calcularTotalGeral((i) => data.faturamentoReurb[i])} />
                </td>
                <td className="px-3 py-2">
                  <CalculatedCell value={calcularMedia((i) => data.faturamentoReurb[i])} />
                </td>
              </tr>

              {/* Faturamento GEO */}
              <tr>
                <td className="px-4 py-3 text-gray-700">Faturamento GEO</td>
                <td className="px-3 py-2">
                  <CalculatedCell value={calcularTrimestre(0, 2, (i) => data.faturamentoGeo[i])} />
                </td>
                {meses.slice(0, 3).map((_, index) => (
                  <td key={index} className="px-3 py-2">
                    <InputCell 
                      value={data.faturamentoGeo[index]} 
                      onBlur={(value) => updateDataAndSave('faturamentoGeo', index, value)}
                      category="faturamentoGeo"
                      monthIndex={index}
                      className="bg-blue-100"
                    />
                  </td>
                ))}
                <td className="px-3 py-2">
                  <CalculatedCell value={calcularTrimestre(3, 5, (i) => data.faturamentoGeo[i])} />
                </td>
                {meses.slice(3, 6).map((_, index) => (
                  <td key={index + 3} className="px-3 py-2">
                    <InputCell 
                      value={data.faturamentoGeo[index + 3]} 
                      onBlur={(value) => updateDataAndSave('faturamentoGeo', index + 3, value)}
                      category="faturamentoGeo"
                      monthIndex={index + 3}
                      className="bg-blue-100"
                    />
                  </td>
                ))}
                <td className="px-3 py-2">
                  <CalculatedCell value={calcularTrimestre(6, 8, (i) => data.faturamentoGeo[i])} />
                </td>
                {meses.slice(6, 9).map((_, index) => (
                  <td key={index + 6} className="px-3 py-2">
                    <InputCell 
                      value={data.faturamentoGeo[index + 6]} 
                      onBlur={(value) => updateDataAndSave('faturamentoGeo', index + 6, value)}
                      category="faturamentoGeo"
                      monthIndex={index + 6}
                      className="bg-blue-100"
                    />
                  </td>
                ))}
                <td className="px-3 py-2">
                  <CalculatedCell value={calcularTrimestre(9, 11, (i) => data.faturamentoGeo[i])} />
                </td>
                {meses.slice(9, 12).map((_, index) => (
                  <td key={index + 9} className="px-3 py-2">
                    <InputCell 
                      value={data.faturamentoGeo[index + 9]} 
                      onBlur={(value) => updateDataAndSave('faturamentoGeo', index + 9, value)}
                      category="faturamentoGeo"
                      monthIndex={index + 9}
                      className="bg-blue-100"
                    />
                  </td>
                ))}
                <td className="px-3 py-2">
                  <CalculatedCell value={calcularTotalGeral((i) => data.faturamentoGeo[i])} />
                </td>
                <td className="px-3 py-2">
                  <CalculatedCell value={calcularMedia((i) => data.faturamentoGeo[i])} />
                </td>
              </tr>

              {/* Faturamento PLAN */}
              <tr>
                <td className="px-4 py-3 text-gray-700">Faturamento PLAN</td>
                <td className="px-3 py-2">
                  <CalculatedCell value={calcularTrimestre(0, 2, (i) => data.faturamentoPlan[i])} />
                </td>
                {meses.slice(0, 3).map((_, index) => (
                  <td key={index} className="px-3 py-2">
                    <InputCell 
                      value={data.faturamentoPlan[index]} 
                      onBlur={(value) => updateDataAndSave('faturamentoPlan', index, value)}
                      category="faturamentoPlan"
                      monthIndex={index}
                      className="bg-blue-100"
                    />
                  </td>
                ))}
                <td className="px-3 py-2">
                  <CalculatedCell value={calcularTrimestre(3, 5, (i) => data.faturamentoPlan[i])} />
                </td>
                {meses.slice(3, 6).map((_, index) => (
                  <td key={index + 3} className="px-3 py-2">
                    <InputCell 
                      value={data.faturamentoPlan[index + 3]} 
                      onBlur={(value) => updateDataAndSave('faturamentoPlan', index + 3, value)}
                      category="faturamentoPlan"
                      monthIndex={index + 3}
                      className="bg-blue-100"
                    />
                  </td>
                ))}
                <td className="px-3 py-2">
                  <CalculatedCell value={calcularTrimestre(6, 8, (i) => data.faturamentoPlan[i])} />
                </td>
                {meses.slice(6, 9).map((_, index) => (
                  <td key={index + 6} className="px-3 py-2">
                    <InputCell 
                      value={data.faturamentoPlan[index + 6]} 
                      onBlur={(value) => updateDataAndSave('faturamentoPlan', index + 6, value)}
                      category="faturamentoPlan"
                      monthIndex={index + 6}
                      className="bg-blue-100"
                    />
                  </td>
                ))}
                <td className="px-3 py-2">
                  <CalculatedCell value={calcularTrimestre(9, 11, (i) => data.faturamentoPlan[i])} />
                </td>
                {meses.slice(9, 12).map((_, index) => (
                  <td key={index + 9} className="px-3 py-2">
                    <InputCell 
                      value={data.faturamentoPlan[index + 9]} 
                      onBlur={(value) => updateDataAndSave('faturamentoPlan', index + 9, value)}
                      category="faturamentoPlan"
                      monthIndex={index + 9}
                      className="bg-blue-100"
                    />
                  </td>
                ))}
                <td className="px-3 py-2">
                  <CalculatedCell value={calcularTotalGeral((i) => data.faturamentoPlan[i])} />
                </td>
                <td className="px-3 py-2">
                  <CalculatedCell value={calcularMedia((i) => data.faturamentoPlan[i])} />
                </td>
              </tr>

              {/* Faturamento REG */}
              <tr>
                <td className="px-4 py-3 text-gray-700">Faturamento REG</td>
                <td className="px-3 py-2">
                  <CalculatedCell value={calcularTrimestre(0, 2, (i) => data.faturamentoReg[i])} />
                </td>
                {meses.slice(0, 3).map((_, index) => (
                  <td key={index} className="px-3 py-2">
                    <InputCell 
                      value={data.faturamentoReg[index]} 
                      onBlur={(value) => updateDataAndSave('faturamentoReg', index, value)}
                      category="faturamentoReg"
                      monthIndex={index}
                      className="bg-blue-100"
                    />
                  </td>
                ))}
                <td className="px-3 py-2">
                  <CalculatedCell value={calcularTrimestre(3, 5, (i) => data.faturamentoReg[i])} />
                </td>
                {meses.slice(3, 6).map((_, index) => (
                  <td key={index + 3} className="px-3 py-2">
                    <InputCell 
                      value={data.faturamentoReg[index + 3]} 
                      onBlur={(value) => updateDataAndSave('faturamentoReg', index + 3, value)}
                      category="faturamentoReg"
                      monthIndex={index + 3}
                      className="bg-blue-100"
                    />
                  </td>
                ))}
                <td className="px-3 py-2">
                  <CalculatedCell value={calcularTrimestre(6, 8, (i) => data.faturamentoReg[i])} />
                </td>
                {meses.slice(6, 9).map((_, index) => (
                  <td key={index + 6} className="px-3 py-2">
                    <InputCell 
                      value={data.faturamentoReg[index + 6]} 
                      onBlur={(value) => updateDataAndSave('faturamentoReg', index + 6, value)}
                      category="faturamentoReg"
                      monthIndex={index + 6}
                      className="bg-blue-100"
                    />
                  </td>
                ))}
                <td className="px-3 py-2">
                  <CalculatedCell value={calcularTrimestre(9, 11, (i) => data.faturamentoReg[i])} />
                </td>
                {meses.slice(9, 12).map((_, index) => (
                  <td key={index + 9} className="px-3 py-2">
                    <InputCell 
                      value={data.faturamentoReg[index + 9]} 
                      onBlur={(value) => updateDataAndSave('faturamentoReg', index + 9, value)}
                      category="faturamentoReg"
                      monthIndex={index + 9}
                      className="bg-blue-100"
                    />
                  </td>
                ))}
                <td className="px-3 py-2">
                  <CalculatedCell value={calcularTotalGeral((i) => data.faturamentoReg[i])} />
                </td>
                <td className="px-3 py-2">
                  <CalculatedCell value={calcularMedia((i) => data.faturamentoReg[i])} />
                </td>
              </tr>

              {/* Faturamento NN */}
              <tr>
                <td className="px-4 py-3 text-gray-700">Faturamento NN</td>
                <td className="px-3 py-2">
                  <CalculatedCell value={calcularTrimestre(0, 2, (i) => data.faturamentoNn[i])} />
                </td>
                {meses.slice(0, 3).map((_, index) => (
                  <td key={index} className="px-3 py-2">
                    <InputCell 
                      value={data.faturamentoNn[index]} 
                      onBlur={(value) => updateDataAndSave('faturamentoNn', index, value)}
                      category="faturamentoNn"
                      monthIndex={index}
                      className="bg-blue-100"
                    />
                  </td>
                ))}
                <td className="px-3 py-2">
                  <CalculatedCell value={calcularTrimestre(3, 5, (i) => data.faturamentoNn[i])} />
                </td>
                {meses.slice(3, 6).map((_, index) => (
                  <td key={index + 3} className="px-3 py-2">
                    <InputCell 
                      value={data.faturamentoNn[index + 3]} 
                      onBlur={(value) => updateDataAndSave('faturamentoNn', index + 3, value)}
                      category="faturamentoNn"
                      monthIndex={index + 3}
                      className="bg-blue-100"
                    />
                  </td>
                ))}
                <td className="px-3 py-2">
                  <CalculatedCell value={calcularTrimestre(6, 8, (i) => data.faturamentoNn[i])} />
                </td>
                {meses.slice(6, 9).map((_, index) => (
                  <td key={index + 6} className="px-3 py-2">
                    <InputCell 
                      value={data.faturamentoNn[index + 6]} 
                      onBlur={(value) => updateDataAndSave('faturamentoNn', index + 6, value)}
                      category="faturamentoNn"
                      monthIndex={index + 6}
                      className="bg-blue-100"
                    />
                  </td>
                ))}
                <td className="px-3 py-2">
                  <CalculatedCell value={calcularTrimestre(9, 11, (i) => data.faturamentoNn[i])} />
                </td>
                {meses.slice(9, 12).map((_, index) => (
                  <td key={index + 9} className="px-3 py-2">
                    <InputCell 
                      value={data.faturamentoNn[index + 9]} 
                      onBlur={(value) => updateDataAndSave('faturamentoNn', index + 9, value)}
                      category="faturamentoNn"
                      monthIndex={index + 9}
                      className="bg-blue-100"
                    />
                  </td>
                ))}
                <td className="px-3 py-2">
                  <CalculatedCell value={calcularTotalGeral((i) => data.faturamentoNn[i])} />
                </td>
                <td className="px-3 py-2">
                  <CalculatedCell value={calcularMedia((i) => data.faturamentoNn[i])} />
                </td>
              </tr>

              {/* Resultado */}
              <tr className="bg-gray-800 text-white">
                <td className="px-4 py-3 font-bold">Resultado</td>
                <td className="px-3 py-2">
                  <CalculatedCell value={calcularTrimestre(0, 2, calcularResultado)} className="text-white" />
                </td>
                {meses.slice(0, 3).map((_, index) => (
                  <td key={index} className="px-3 py-2">
                    <CalculatedCell value={calcularResultado(index)} className="text-white" />
                  </td>
                ))}
                <td className="px-3 py-2">
                  <CalculatedCell value={calcularTrimestre(3, 5, calcularResultado)} className="text-white" />
                </td>
                {meses.slice(3, 6).map((_, index) => (
                  <td key={index + 3} className="px-3 py-2">
                    <CalculatedCell value={calcularResultado(index + 3)} className="text-white" />
                  </td>
                ))}
                <td className="px-3 py-2">
                  <CalculatedCell value={calcularTrimestre(6, 8, calcularResultado)} className="text-white" />
                </td>
                {meses.slice(6, 9).map((_, index) => (
                  <td key={index + 6} className="px-3 py-2">
                    <CalculatedCell value={calcularResultado(index + 6)} className="text-white" />
                  </td>
                ))}
                <td className="px-3 py-2">
                  <CalculatedCell value={calcularTrimestre(9, 11, calcularResultado)} className="text-white" />
                </td>
                {meses.slice(9, 12).map((_, index) => (
                  <td key={index + 9} className="px-3 py-2">
                    <CalculatedCell value={calcularResultado(index + 9)} className="text-white" />
                  </td>
                ))}
                <td className="px-3 py-2">
                  <CalculatedCell value={calcularTotalGeral(calcularResultado)} className="text-white" />
                </td>
                <td className="px-3 py-2">
                  <CalculatedCell value={calcularMedia(calcularResultado)} className="text-white" />
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        </div>
      )}
      

      
      {/* Legenda (abaixo da tabela inicial) */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <h3 className="font-semibold text-blue-800 mb-2">Legenda:</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-blue-700">
          <div>
            <p><span className="font-semibold">Campos editáveis:</span> Apenas os valores mensais</p>
            <p><span className="font-semibold">Campos calculados:</span> Trimestres, Total Geral e Média</p>
            <p><span className="font-semibold">Salvamento:</span> Automático no servidor</p>
          </div>
          <div>
            <p><span className="font-semibold">Fórmulas:</span></p>
            <ul className="list-disc pl-5">
              <li>Despesas Totais = Despesas Variáveis + Despesas Fixas</li>
              <li>Faturamento Total = REURB + GEO + PLAN + REG + NN</li>
              <li>Resultado = Faturamento Total - (Mkt + Investimentos + Despesas Totais)</li>
            </ul>
          </div>
        </div>
      </div>

      {/* Percentual de Crescimento Anual */}
      {!isLoading && (
        <div className="bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[480px]">
              <thead className="bg-gray-800 text-white">
                <tr>
                  <th className="px-4 py-3 text-left font-bold">PERCENTUAL DE CRESCIMENTO ANUAL</th>
                  <th className="px-4 py-3 text-center font-bold">%</th>
                </tr>
              </thead>
              <tbody className="bg-blue-50 divide-y divide-blue-100">
                <tr>
                  <td className="px-4 py-3 text-gray-700">Mínimo</td>
                  <td className="px-4 py-2">
                    <input
                      type="number"
                      className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-right"
                      defaultValue={data.growth?.minimo ?? 0}
                      onBlur={(e) => updateGrowthAndSave('minimo', parseFloat(e.target.value) || 0)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === 'Tab') {
                          const target = e.target as HTMLInputElement
                          updateGrowthAndSave('minimo', parseFloat(target.value) || 0)
                        }
                      }}
                    />
                  </td>
                </tr>
                <tr>
                  <td className="px-4 py-3 text-gray-700">Médio</td>
                  <td className="px-4 py-2">
                    <input
                      type="number"
                      className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-right"
                      defaultValue={data.growth?.medio ?? 0}
                      onBlur={(e) => updateGrowthAndSave('medio', parseFloat(e.target.value) || 0)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === 'Tab') {
                          const target = e.target as HTMLInputElement
                          updateGrowthAndSave('medio', parseFloat(target.value) || 0)
                        }
                      }}
                    />
                  </td>
                </tr>
                <tr>
                  <td className="px-4 py-3 text-gray-700">Máximo</td>
                  <td className="px-4 py-2">
                    <input
                      type="number"
                      className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-right"
                      defaultValue={data.growth?.maximo ?? 0}
                      onBlur={(e) => updateGrowthAndSave('maximo', parseFloat(e.target.value) || 0)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === 'Tab') {
                          const target = e.target as HTMLInputElement
                          updateGrowthAndSave('maximo', parseFloat(target.value) || 0)
                        }
                      }}
                    />
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Composição MKT */}
      {!isLoading && (
        <div className="bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1200px]">
              <thead className="bg-blue-700 text-white">
                <tr>
                  <th className="px-4 py-3 text-left font-bold">Composição MKT</th>
                  <th className="px-3 py-3 text-center font-bold">1 TRI</th>
                  {meses.slice(0, 3).map(mes => (
                    <th key={mes} className="px-3 py-3 text-center font-bold" style={{width: '100px', minWidth: '100px'}}>{mes}</th>
                  ))}
                  <th className="px-3 py-3 text-center font-bold">2 TRI</th>
                  {meses.slice(3, 6).map(mes => (
                    <th key={mes} className="px-3 py-3 text-center font-bold" style={{width: '100px', minWidth: '100px'}}>{mes}</th>
                  ))}
                  <th className="px-3 py-3 text-center font-bold">3 TRI</th>
                  {meses.slice(6, 9).map(mes => (
                    <th key={mes} className="px-3 py-3 text-center font-bold" style={{width: '100px', minWidth: '100px'}}>{mes}</th>
                  ))}
                  <th className="px-3 py-3 text-center font-bold">4 TRI</th>
                  {meses.slice(9, 12).map(mes => (
                    <th key={mes} className="px-3 py-3 text-center font-bold" style={{width: '100px', minWidth: '100px'}}>{mes}</th>
                  ))}
                  <th className="px-3 py-3 text-center font-bold">Total Geral</th>
                  <th className="px-3 py-3 text-center font-bold">Média</th>
                </tr>
              </thead>

              <tbody className="divide-y divide-gray-200">
                {[
                  { key: 'trafego', label: 'Tráfego' },
                  { key: 'socialMedia', label: 'Social Media' },
                  { key: 'producaoConteudo', label: 'Produção Conteúdo' }
                ].map((row) => (
                  <tr key={row.key}>
                    <td className="px-4 py-3 text-gray-700">{row.label}</td>
                    <td className="px-3 py-2">
                      <CalculatedCell value={calcularTrimestre(0, 2, (i) => (data.mktComponents?.[row.key as keyof NonNullable<typeof data.mktComponents>] || [])[i] || 0)} />
                    </td>
                    {meses.slice(0, 3).map((_, index) => (
                      <td key={index} className="px-3 py-2" style={{width: '100px', minWidth: '100px'}}>
                        <InputCell
                          value={(data.mktComponents?.[row.key as keyof NonNullable<typeof data.mktComponents>] || [])[index] || 0}
                          onBlur={(value) => {
                            const current = data.mktComponents || { trafego: new Array(12).fill(0), socialMedia: new Array(12).fill(0), producaoConteudo: new Array(12).fill(0) }
                            const updated = {
                              ...data,
                              mktComponents: {
                                ...current,
                                [row.key]: (current[row.key as keyof typeof current] as number[]).map((v, i) => i === index ? value : v)
                              }
                            }
                            setData(updated)
                            if (token) saveToServer(updated)
                          }}
                          category={`mkt-${row.key}`}
                          monthIndex={index}
                        />
                      </td>
                    ))}
                    <td className="px-3 py-2">
                      <CalculatedCell value={calcularTrimestre(3, 5, (i) => (data.mktComponents?.[row.key as keyof NonNullable<typeof data.mktComponents>] || [])[i] || 0)} />
                    </td>
                    {meses.slice(3, 6).map((_, index) => (
                      <td key={index + 3} className="px-3 py-2" style={{width: '100px', minWidth: '100px'}}>
                        <InputCell
                          value={(data.mktComponents?.[row.key as keyof NonNullable<typeof data.mktComponents>] || [])[index + 3] || 0}
                          onBlur={(value) => {
                            const current = data.mktComponents || { trafego: new Array(12).fill(0), socialMedia: new Array(12).fill(0), producaoConteudo: new Array(12).fill(0) }
                            const updated = {
                              ...data,
                              mktComponents: {
                                ...current,
                                [row.key]: (current[row.key as keyof typeof current] as number[]).map((v, i) => i === (index + 3) ? value : v)
                              }
                            }
                            setData(updated)
                            if (token) saveToServer(updated)
                          }}
                          category={`mkt-${row.key}`}
                          monthIndex={index + 3}
                        />
                      </td>
                    ))}
                    <td className="px-3 py-2">
                      <CalculatedCell value={calcularTrimestre(6, 8, (i) => (data.mktComponents?.[row.key as keyof NonNullable<typeof data.mktComponents>] || [])[i] || 0)} />
                    </td>
                    {meses.slice(6, 9).map((_, index) => (
                      <td key={index + 6} className="px-3 py-2" style={{width: '100px', minWidth: '100px'}}>
                        <InputCell
                          value={(data.mktComponents?.[row.key as keyof NonNullable<typeof data.mktComponents>] || [])[index + 6] || 0}
                          onBlur={(value) => {
                            const current = data.mktComponents || { trafego: new Array(12).fill(0), socialMedia: new Array(12).fill(0), producaoConteudo: new Array(12).fill(0) }
                            const updated = {
                              ...data,
                              mktComponents: {
                                ...current,
                                [row.key]: (current[row.key as keyof typeof current] as number[]).map((v, i) => i === (index + 6) ? value : v)
                              }
                            }
                            setData(updated)
                            if (token) saveToServer(updated)
                          }}
                          category={`mkt-${row.key}`}
                          monthIndex={index + 6}
                        />
                      </td>
                    ))}
                    <td className="px-3 py-2">
                      <CalculatedCell value={calcularTrimestre(9, 11, (i) => (data.mktComponents?.[row.key as keyof NonNullable<typeof data.mktComponents>] || [])[i] || 0)} />
                    </td>
                    {meses.slice(9, 12).map((_, index) => (
                      <td key={index + 9} className="px-3 py-2" style={{width: '100px', minWidth: '100px'}}>
                        <InputCell
                          value={(data.mktComponents?.[row.key as keyof NonNullable<typeof data.mktComponents>] || [])[index + 9] || 0}
                          onBlur={(value) => {
                            const current = data.mktComponents || { trafego: new Array(12).fill(0), socialMedia: new Array(12).fill(0), producaoConteudo: new Array(12).fill(0) }
                            const updated = {
                              ...data,
                              mktComponents: {
                                ...current,
                                [row.key]: (current[row.key as keyof typeof current] as number[]).map((v, i) => i === (index + 9) ? value : v)
                              }
                            }
                            setData(updated)
                            if (token) saveToServer(updated)
                          }}
                          category={`mkt-${row.key}`}
                          monthIndex={index + 9}
                        />
                      </td>
                    ))}
                    <td className="px-3 py-2">
                      <CalculatedCell value={(() => {
                        const arr = (data.mktComponents?.[row.key as keyof NonNullable<typeof data.mktComponents>] || []) as number[]
                        return arr.reduce((sum, v) => sum + (v || 0), 0)
                      })()} />
                    </td>
                    <td className="px-3 py-2">
                      <CalculatedCell value={(() => {
                        const arr = (data.mktComponents?.[row.key as keyof NonNullable<typeof data.mktComponents>] || []) as number[]
                        const total = arr.reduce((sum, v) => sum + (v || 0), 0)
                        return total / 12
                      })()} />
                    </td>
                  </tr>
                ))}

                {/* TOTAL (soma das linhas) */}
                <tr className="bg-gray-100">
                  <td className="px-4 py-3 font-semibold text-gray-800">TOTAL</td>
                  <td className="px-3 py-2">
                    <CalculatedCell value={calcularTrimestre(0, 2, (i) => {
                      const c = data.mktComponents
                      if (!c) return 0
                      return (c.trafego[i]||0) + (c.socialMedia[i]||0) + (c.producaoConteudo[i]||0)
                    })} />
                  </td>
                  {meses.slice(0, 3).map((_, index) => (
                    <td key={index} className="px-3 py-2" style={{width: '100px', minWidth: '100px'}}>
                      <CalculatedCell value={(() => {
                        const c = data.mktComponents
                        if (!c) return 0
                        return (c.trafego[index]||0) + (c.socialMedia[index]||0) + (c.producaoConteudo[index]||0)
                      })()} />
                    </td>
                  ))}
                  <td className="px-3 py-2">
                    <CalculatedCell value={calcularTrimestre(3, 5, (i) => {
                      const c = data.mktComponents
                      if (!c) return 0
                      return (c.trafego[i]||0) + (c.socialMedia[i]||0) + (c.producaoConteudo[i]||0)
                    })} />
                  </td>
                  {meses.slice(3, 6).map((_, index) => (
                    <td key={index + 3} className="px-3 py-2" style={{width: '100px', minWidth: '100px'}}>
                      <CalculatedCell value={(() => {
                        const i = index + 3
                        const c = data.mktComponents
                        if (!c) return 0
                        return (c.trafego[i]||0) + (c.socialMedia[i]||0) + (c.producaoConteudo[i]||0)
                      })()} />
                    </td>
                  ))}
                  <td className="px-3 py-2">
                    <CalculatedCell value={calcularTrimestre(6, 8, (i) => {
                      const c = data.mktComponents
                      if (!c) return 0
                      return (c.trafego[i]||0) + (c.socialMedia[i]||0) + (c.producaoConteudo[i]||0)
                    })} />
                  </td>
                  {meses.slice(6, 9).map((_, index) => (
                    <td key={index + 6} className="px-3 py-2" style={{width: '100px', minWidth: '100px'}}>
                      <CalculatedCell value={(() => {
                        const i = index + 6
                        const c = data.mktComponents
                        if (!c) return 0
                        return (c.trafego[i]||0) + (c.socialMedia[i]||0) + (c.producaoConteudo[i]||0)
                      })()} />
                    </td>
                  ))}
                  <td className="px-3 py-2">
                    <CalculatedCell value={calcularTrimestre(9, 11, (i) => {
                      const c = data.mktComponents
                      if (!c) return 0
                      return (c.trafego[i]||0) + (c.socialMedia[i]||0) + (c.producaoConteudo[i]||0)
                    })} />
                  </td>
                  {meses.slice(9, 12).map((_, index) => (
                    <td key={index + 9} className="px-3 py-2" style={{width: '100px', minWidth: '100px'}}>
                      <CalculatedCell value={(() => {
                        const i = index + 9
                        const c = data.mktComponents
                        if (!c) return 0
                        return (c.trafego[i]||0) + (c.socialMedia[i]||0) + (c.producaoConteudo[i]||0)
                      })()} />
                    </td>
                  ))}
                  <td className="px-3 py-2">
                    <CalculatedCell value={(() => {
                      const c = data.mktComponents
                      if (!c) return 0
                      const sum = [...Array(12).keys()].reduce((acc, i) => acc + (c.trafego[i]||0) + (c.socialMedia[i]||0) + (c.producaoConteudo[i]||0), 0)
                      return sum
                    })()} />
                  </td>
                  <td className="px-3 py-2">
                    <CalculatedCell value={(() => {
                      const c = data.mktComponents
                      if (!c) return 0
                      const sum = [...Array(12).keys()].reduce((acc, i) => acc + (c.trafego[i]||0) + (c.socialMedia[i]||0) + (c.producaoConteudo[i]||0), 0)
                      return sum / 12
                    })()} />
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Legenda MKT (logo abaixo da Composição MKT) */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <h3 className="font-semibold text-blue-800 mb-2">Legenda MKT:</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-blue-700">
          <div>
            <p><span className="font-semibold">Produção de Conteúdo:</span> criação de campanhas com estratégia</p>
          </div>
          <div>
            <p><span className="font-semibold">Social Media:</span> gestão e posts orgânicos</p>
            <p><span className="font-semibold">Tráfego Pago:</span> anúncios/impulsionamentos</p>
          </div>
        </div>
      </div>

      {/* Despesas Fixas */}
      {!isLoading && (
        <div className="bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1200px]">
              <thead className="bg-blue-700 text-white">
                <tr>
                  <th className="px-4 py-3 text-left font-bold">DESPESAS Fixas</th>
                  <th className="px-3 py-3 text-center font-bold">1 TRI</th>
                  {meses.slice(0, 3).map(mes => (
                    <th key={mes} className="px-3 py-3 text-center font-bold" style={{width: '100px', minWidth: '100px'}}>{mes}</th>
                  ))}
                  <th className="px-3 py-3 text-center font-bold">2 TRI</th>
                  {meses.slice(3, 6).map(mes => (
                    <th key={mes} className="px-3 py-3 text-center font-bold" style={{width: '100px', minWidth: '100px'}}>{mes}</th>
                  ))}
                  <th className="px-3 py-3 text-center font-bold">3 TRI</th>
                  {meses.slice(6, 9).map(mes => (
                    <th key={mes} className="px-3 py-3 text-center font-bold" style={{width: '100px', minWidth: '100px'}}>{mes}</th>
                  ))}
                  <th className="px-3 py-3 text-center font-bold">4 TRI</th>
                  {meses.slice(9, 12).map(mes => (
                    <th key={mes} className="px-3 py-3 text-center font-bold" style={{width: '100px', minWidth: '100px'}}>{mes}</th>
                  ))}
                  <th className="px-3 py-3 text-center font-bold">Total Geral</th>
                  <th className="px-3 py-3 text-center font-bold">Média</th>
                </tr>
              </thead>

              <tbody className="divide-y divide-gray-200">
                {/* Linha Previsto */}
                <tr>
                  <td className="px-4 py-3 text-gray-700">Previsto</td>
                  <td className="px-3 py-2">
                    <CalculatedCell value={calcularTrimestre(0, 2, (i) => calcularPrevistoMes(i))} />
                  </td>
                  {meses.slice(0, 3).map((_, index) => (
                    <td key={index} className="px-3 py-2" style={{width: '100px', minWidth: '100px'}}>
                      <InputCell
                        value={calcularPrevistoMes(index)}
                        onBlur={(value) => updateFixedExpensesAndSave('previsto', index, value)}
                        category="previsto"
                        monthIndex={index}
                      />
                    </td>
                  ))}
                  <td className="px-3 py-2">
                    <CalculatedCell value={calcularTrimestre(3, 5, (i) => calcularPrevistoMes(i))} />
                  </td>
                  {meses.slice(3, 6).map((_, index) => (
                    <td key={index + 3} className="px-3 py-2" style={{width: '100px', minWidth: '100px'}}>
                      <InputCell
                        value={calcularPrevistoMes(index + 3)}
                        onBlur={(value) => updateFixedExpensesAndSave('previsto', index + 3, value)}
                        category="previsto"
                        monthIndex={index + 3}
                      />
                    </td>
                  ))}
                  <td className="px-3 py-2">
                    <CalculatedCell value={calcularTrimestre(6, 8, (i) => calcularPrevistoMes(i))} />
                  </td>
                  {meses.slice(6, 9).map((_, index) => (
                    <td key={index + 6} className="px-3 py-2" style={{width: '100px', minWidth: '100px'}}>
                      <InputCell
                        value={calcularPrevistoMes(index + 6)}
                        onBlur={(value) => updateFixedExpensesAndSave('previsto', index + 6, value)}
                        category="previsto"
                        monthIndex={index + 6}
                      />
                    </td>
                  ))}
                  <td className="px-3 py-2">
                    <CalculatedCell value={calcularTrimestre(9, 11, (i) => calcularPrevistoMes(i))} />
                  </td>
                  {meses.slice(9, 12).map((_, index) => (
                    <td key={index + 9} className="px-3 py-2" style={{width: '100px', minWidth: '100px'}}>
                      <InputCell
                        value={calcularPrevistoMes(index + 9)}
                        onBlur={(value) => updateFixedExpensesAndSave('previsto', index + 9, value)}
                        category="previsto"
                        monthIndex={index + 9}
                      />
                    </td>
                  ))}
                  <td className="px-3 py-2">
                    <CalculatedCell value={calcularTotalGeral((i) => calcularPrevistoMes(i))} />
                  </td>
                  <td className="px-3 py-2">
                    <CalculatedCell value={calcularMedia((i) => calcularPrevistoMes(i))} />
                  </td>
                </tr>

                {/* Linha Média */}
                <tr>
                  <td className="px-4 py-3 text-gray-700">Média</td>
                  <td className="px-3 py-2">
                    <CalculatedCell value={calcularTrimestre(0, 2, (i) => calcularMediaMes(i))} />
                  </td>
                  {meses.slice(0, 3).map((_, index) => (
                    <td key={index} className="px-3 py-2" style={{width: '100px', minWidth: '100px'}}>
                      <CalculatedCell value={calcularMediaMes(index)} />
                    </td>
                  ))}
                  <td className="px-3 py-2">
                    <CalculatedCell value={calcularTrimestre(3, 5, (i) => calcularMediaMes(i))} />
                  </td>
                  {meses.slice(3, 6).map((_, index) => (
                    <td key={index + 3} className="px-3 py-2" style={{width: '100px', minWidth: '100px'}}>
                      <CalculatedCell value={calcularMediaMes(index + 3)} />
                    </td>
                  ))}
                  <td className="px-3 py-2">
                    <CalculatedCell value={calcularTrimestre(6, 8, (i) => calcularMediaMes(i))} />
                  </td>
                  {meses.slice(6, 9).map((_, index) => (
                    <td key={index + 6} className="px-3 py-2" style={{width: '100px', minWidth: '100px'}}>
                      <CalculatedCell value={calcularMediaMes(index + 6)} />
                    </td>
                  ))}
                  <td className="px-3 py-2">
                    <CalculatedCell value={calcularTrimestre(9, 11, (i) => calcularMediaMes(i))} />
                  </td>
                  {meses.slice(9, 12).map((_, index) => (
                    <td key={index + 9} className="px-3 py-2" style={{width: '100px', minWidth: '100px'}}>
                      <CalculatedCell value={calcularMediaMes(index + 9)} />
                    </td>
                  ))}
                  <td className="px-3 py-2">
                    <CalculatedCell value={calcularTotalGeral((i) => calcularMediaMes(i))} />
                  </td>
                  <td className="px-3 py-2">
                    <CalculatedCell value={calcularMedia((i) => calcularMediaMes(i))} />
                  </td>
                </tr>

                {/* Linha Máximo */}
                <tr>
                  <td className="px-4 py-3 text-gray-700">Máximo</td>
                  <td className="px-3 py-2">
                    <CalculatedCell value={calcularTrimestre(0, 2, (i) => calcularMaximoMes(i))} />
                  </td>
                  {meses.slice(0, 3).map((_, index) => (
                    <td key={index} className="px-3 py-2" style={{width: '100px', minWidth: '100px'}}>
                      <CalculatedCell value={calcularMaximoMes(index)} />
                    </td>
                  ))}
                  <td className="px-3 py-2">
                    <CalculatedCell value={calcularTrimestre(3, 5, (i) => calcularMaximoMes(i))} />
                  </td>
                  {meses.slice(3, 6).map((_, index) => (
                    <td key={index + 3} className="px-3 py-2" style={{width: '100px', minWidth: '100px'}}>
                      <CalculatedCell value={calcularMaximoMes(index + 3)} />
                    </td>
                  ))}
                  <td className="px-3 py-2">
                    <CalculatedCell value={calcularTrimestre(6, 8, (i) => calcularMaximoMes(i))} />
                  </td>
                  {meses.slice(6, 9).map((_, index) => (
                    <td key={index + 6} className="px-3 py-2" style={{width: '100px', minWidth: '100px'}}>
                      <CalculatedCell value={calcularMaximoMes(index + 6)} />
                    </td>
                  ))}
                  <td className="px-3 py-2">
                    <CalculatedCell value={calcularTrimestre(9, 11, (i) => calcularMaximoMes(i))} />
                  </td>
                  {meses.slice(9, 12).map((_, index) => (
                    <td key={index + 9} className="px-3 py-2" style={{width: '100px', minWidth: '100px'}}>
                      <CalculatedCell value={calcularMaximoMes(index + 9)} />
                    </td>
                  ))}
                  <td className="px-3 py-2">
                    <CalculatedCell value={calcularTotalGeral((i) => calcularMaximoMes(i))} />
                  </td>
                  <td className="px-3 py-2">
                    <CalculatedCell value={calcularMedia((i) => calcularMaximoMes(i))} />
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Despesas Variáveis */}
      {!isLoading && (
        <div className="bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1200px]">
              <thead className="bg-blue-700 text-white">
                <tr>
                  <th className="px-4 py-3 text-left font-bold">DESPESAS Variáveis</th>
                  <th className="px-3 py-3 text-center font-bold">1 TRI</th>
                  {meses.slice(0, 3).map(mes => (
                    <th key={mes} className="px-3 py-3 text-center font-bold" style={{width: '100px', minWidth: '100px'}}>{mes}</th>
                  ))}
                  <th className="px-3 py-3 text-center font-bold">2 TRI</th>
                  {meses.slice(3, 6).map(mes => (
                    <th key={mes} className="px-3 py-3 text-center font-bold" style={{width: '100px', minWidth: '100px'}}>{mes}</th>
                  ))}
                  <th className="px-3 py-3 text-center font-bold">3 TRI</th>
                  {meses.slice(6, 9).map(mes => (
                    <th key={mes} className="px-3 py-3 text-center font-bold" style={{width: '100px', minWidth: '100px'}}>{mes}</th>
                  ))}
                  <th className="px-3 py-3 text-center font-bold">4 TRI</th>
                  {meses.slice(9, 12).map(mes => (
                    <th key={mes} className="px-3 py-3 text-center font-bold" style={{width: '100px', minWidth: '100px'}}>{mes}</th>
                  ))}
                  <th className="px-3 py-3 text-center font-bold">Total Geral</th>
                  <th className="px-3 py-3 text-center font-bold">Média</th>
                </tr>
              </thead>

              <tbody className="divide-y divide-gray-200">
                {/* Linha Previsto */}
                <tr>
                  <td className="px-4 py-3 text-gray-700">Previsto</td>
                  <td className="px-3 py-2">
                    <CalculatedCell value={calcularTrimestre(0, 2, (i) => calcularPrevistoVariableMes(i))} />
                  </td>
                  {meses.slice(0, 3).map((_, index) => (
                    <td key={index} className="px-3 py-2" style={{width: '100px', minWidth: '100px'}}>
                      <InputCell
                        value={calcularPrevistoVariableMes(index)}
                        onBlur={(value) => updateVariableExpensesAndSave('previsto', index, value)}
                        category="previsto-var"
                        monthIndex={index}
                      />
                    </td>
                  ))}
                  <td className="px-3 py-2">
                    <CalculatedCell value={calcularTrimestre(3, 5, (i) => calcularPrevistoVariableMes(i))} />
                  </td>
                  {meses.slice(3, 6).map((_, index) => (
                    <td key={index + 3} className="px-3 py-2" style={{width: '100px', minWidth: '100px'}}>
                      <InputCell
                        value={calcularPrevistoVariableMes(index + 3)}
                        onBlur={(value) => updateVariableExpensesAndSave('previsto', index + 3, value)}
                        category="previsto-var"
                        monthIndex={index + 3}
                      />
                    </td>
                  ))}
                  <td className="px-3 py-2">
                    <CalculatedCell value={calcularTrimestre(6, 8, (i) => calcularPrevistoVariableMes(i))} />
                  </td>
                  {meses.slice(6, 9).map((_, index) => (
                    <td key={index + 6} className="px-3 py-2" style={{width: '100px', minWidth: '100px'}}>
                      <InputCell
                        value={calcularPrevistoVariableMes(index + 6)}
                        onBlur={(value) => updateVariableExpensesAndSave('previsto', index + 6, value)}
                        category="previsto-var"
                        monthIndex={index + 6}
                      />
                    </td>
                  ))}
                  <td className="px-3 py-2">
                    <CalculatedCell value={calcularTrimestre(9, 11, (i) => calcularPrevistoVariableMes(i))} />
                  </td>
                  {meses.slice(9, 12).map((_, index) => (
                    <td key={index + 9} className="px-3 py-2" style={{width: '100px', minWidth: '100px'}}>
                      <InputCell
                        value={calcularPrevistoVariableMes(index + 9)}
                        onBlur={(value) => updateVariableExpensesAndSave('previsto', index + 9, value)}
                        category="previsto-var"
                        monthIndex={index + 9}
                      />
                    </td>
                  ))}
                  <td className="px-3 py-2">
                    <CalculatedCell value={calcularTotalGeral((i) => calcularPrevistoVariableMes(i))} />
                  </td>
                  <td className="px-3 py-2">
                    <CalculatedCell value={calcularMedia((i) => calcularPrevistoVariableMes(i))} />
                  </td>
                </tr>

                {/* Linha Médio */}
                <tr>
                  <td className="px-4 py-3 text-gray-700">Médio</td>
                  <td className="px-3 py-2">
                    <CalculatedCell value={calcularTrimestre(0, 2, (i) => calcularMedioVariableMes(i))} />
                  </td>
                  {meses.slice(0, 3).map((_, index) => (
                    <td key={index} className="px-3 py-2" style={{width: '100px', minWidth: '100px'}}>
                      <InputCell
                        value={calcularMedioVariableMes(index)}
                        onBlur={(value) => updateVariableExpensesAndSave('medio', index, value)}
                        category="medio-var"
                        monthIndex={index}
                      />
                    </td>
                  ))}
                  <td className="px-3 py-2">
                    <CalculatedCell value={calcularTrimestre(3, 5, (i) => calcularMedioVariableMes(i))} />
                  </td>
                  {meses.slice(3, 6).map((_, index) => (
                    <td key={index + 3} className="px-3 py-2" style={{width: '100px', minWidth: '100px'}}>
                      <InputCell
                        value={calcularMedioVariableMes(index + 3)}
                        onBlur={(value) => updateVariableExpensesAndSave('medio', index + 3, value)}
                        category="medio-var"
                        monthIndex={index + 3}
                      />
                    </td>
                  ))}
                  <td className="px-3 py-2">
                    <CalculatedCell value={calcularTrimestre(6, 8, (i) => calcularMedioVariableMes(i))} />
                  </td>
                  {meses.slice(6, 9).map((_, index) => (
                    <td key={index + 6} className="px-3 py-2" style={{width: '100px', minWidth: '100px'}}>
                      <InputCell
                        value={calcularMedioVariableMes(index + 6)}
                        onBlur={(value) => updateVariableExpensesAndSave('medio', index + 6, value)}
                        category="medio-var"
                        monthIndex={index + 6}
                      />
                    </td>
                  ))}
                  <td className="px-3 py-2">
                    <CalculatedCell value={calcularTrimestre(9, 11, (i) => calcularMedioVariableMes(i))} />
                  </td>
                  {meses.slice(9, 12).map((_, index) => (
                    <td key={index + 9} className="px-3 py-2" style={{width: '100px', minWidth: '100px'}}>
                      <InputCell
                        value={calcularMedioVariableMes(index + 9)}
                        onBlur={(value) => updateVariableExpensesAndSave('medio', index + 9, value)}
                        category="medio-var"
                        monthIndex={index + 9}
                      />
                    </td>
                  ))}
                  <td className="px-3 py-2">
                    <CalculatedCell value={calcularTotalGeral((i) => calcularMedioVariableMes(i))} />
                  </td>
                  <td className="px-3 py-2">
                    <CalculatedCell value={calcularMedia((i) => calcularMedioVariableMes(i))} />
                  </td>
                </tr>

                {/* Linha Máximo */}
                <tr>
                  <td className="px-4 py-3 text-gray-700">Máximo</td>
                  <td className="px-3 py-2">
                    <CalculatedCell value={calcularTrimestre(0, 2, (i) => calcularMaximoVariableMes(i))} />
                  </td>
                  {meses.slice(0, 3).map((_, index) => (
                    <td key={index} className="px-3 py-2" style={{width: '100px', minWidth: '100px'}}>
                      <InputCell
                        value={calcularMaximoVariableMes(index)}
                        onBlur={(value) => updateVariableExpensesAndSave('maximo', index, value)}
                        category="maximo-var"
                        monthIndex={index}
                      />
                    </td>
                  ))}
                  <td className="px-3 py-2">
                    <CalculatedCell value={calcularTrimestre(3, 5, (i) => calcularMaximoVariableMes(i))} />
                  </td>
                  {meses.slice(3, 6).map((_, index) => (
                    <td key={index + 3} className="px-3 py-2" style={{width: '100px', minWidth: '100px'}}>
                      <InputCell
                        value={calcularMaximoVariableMes(index + 3)}
                        onBlur={(value) => updateVariableExpensesAndSave('maximo', index + 3, value)}
                        category="maximo-var"
                        monthIndex={index + 3}
                      />
                    </td>
                  ))}
                  <td className="px-3 py-2">
                    <CalculatedCell value={calcularTrimestre(6, 8, (i) => calcularMaximoVariableMes(i))} />
                  </td>
                  {meses.slice(6, 9).map((_, index) => (
                    <td key={index + 6} className="px-3 py-2" style={{width: '100px', minWidth: '100px'}}>
                      <InputCell
                        value={calcularMaximoVariableMes(index + 6)}
                        onBlur={(value) => updateVariableExpensesAndSave('maximo', index + 6, value)}
                        category="maximo-var"
                        monthIndex={index + 6}
                      />
                    </td>
                  ))}
                  <td className="px-3 py-2">
                    <CalculatedCell value={calcularTrimestre(9, 11, (i) => calcularMaximoVariableMes(i))} />
                  </td>
                  {meses.slice(9, 12).map((_, index) => (
                    <td key={index + 9} className="px-3 py-2" style={{width: '100px', minWidth: '100px'}}>
                      <InputCell
                        value={calcularMaximoVariableMes(index + 9)}
                        onBlur={(value) => updateVariableExpensesAndSave('maximo', index + 9, value)}
                        category="maximo-var"
                        monthIndex={index + 9}
                      />
                    </td>
                  ))}
                  <td className="px-3 py-2">
                    <CalculatedCell value={calcularTotalGeral((i) => calcularMaximoVariableMes(i))} />
                  </td>
                  <td className="px-3 py-2">
                    <CalculatedCell value={calcularMedia((i) => calcularMaximoVariableMes(i))} />
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Despesas Fixas + Variáveis */}
      {!isLoading && (
        <div className="bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1200px]">
              <thead className="bg-green-700 text-white">
                <tr>
                  <th className="px-4 py-3 text-left font-bold">DESPESAS FIXAS + VARIÁVEIS</th>
                  <th className="px-3 py-3 text-center font-bold">1 TRI</th>
                  {meses.slice(0, 3).map(mes => (
                    <th key={mes} className="px-3 py-3 text-center font-bold" style={{width: '100px', minWidth: '100px'}}>{mes}</th>
                  ))}
                  <th className="px-3 py-3 text-center font-bold">2 TRI</th>
                  {meses.slice(3, 6).map(mes => (
                    <th key={mes} className="px-3 py-3 text-center font-bold" style={{width: '100px', minWidth: '100px'}}>{mes}</th>
                  ))}
                  <th className="px-3 py-3 text-center font-bold">3 TRI</th>
                  {meses.slice(6, 9).map(mes => (
                    <th key={mes} className="px-3 py-3 text-center font-bold" style={{width: '100px', minWidth: '100px'}}>{mes}</th>
                  ))}
                  <th className="px-3 py-3 text-center font-bold">4 TRI</th>
                  {meses.slice(9, 12).map(mes => (
                    <th key={mes} className="px-3 py-3 text-center font-bold" style={{width: '100px', minWidth: '100px'}}>{mes}</th>
                  ))}
                  <th className="px-3 py-3 text-center font-bold">Total Geral</th>
                  <th className="px-3 py-3 text-center font-bold">Média</th>
                </tr>
              </thead>

              <tbody className="divide-y divide-gray-200">
                {/* Linha Previsto */}
                <tr>
                  <td className="px-4 py-3 text-gray-700">Previsto</td>
                  <td className="px-3 py-2">
                    <CalculatedCell value={calcularTrimestre(0, 2, (i) => calcularPrevistoFixoVariavelMes(i))} />
                  </td>
                  {meses.slice(0, 3).map((_, index) => (
                    <td key={index} className="px-3 py-2" style={{width: '100px', minWidth: '100px'}}>
                      <CalculatedCell value={calcularPrevistoFixoVariavelMes(index)} />
                    </td>
                  ))}
                  <td className="px-3 py-2">
                    <CalculatedCell value={calcularTrimestre(3, 5, (i) => calcularPrevistoFixoVariavelMes(i))} />
                  </td>
                  {meses.slice(3, 6).map((_, index) => (
                    <td key={index + 3} className="px-3 py-2" style={{width: '100px', minWidth: '100px'}}>
                      <CalculatedCell value={calcularPrevistoFixoVariavelMes(index + 3)} />
                    </td>
                  ))}
                  <td className="px-3 py-2">
                    <CalculatedCell value={calcularTrimestre(6, 8, (i) => calcularPrevistoFixoVariavelMes(i))} />
                  </td>
                  {meses.slice(6, 9).map((_, index) => (
                    <td key={index + 6} className="px-3 py-2" style={{width: '100px', minWidth: '100px'}}>
                      <CalculatedCell value={calcularPrevistoFixoVariavelMes(index + 6)} />
                    </td>
                  ))}
                  <td className="px-3 py-2">
                    <CalculatedCell value={calcularTrimestre(9, 11, (i) => calcularPrevistoFixoVariavelMes(i))} />
                  </td>
                  {meses.slice(9, 12).map((_, index) => (
                    <td key={index + 9} className="px-3 py-2" style={{width: '100px', minWidth: '100px'}}>
                      <CalculatedCell value={calcularPrevistoFixoVariavelMes(index + 9)} />
                    </td>
                  ))}
                  <td className="px-3 py-2">
                    <CalculatedCell value={calcularTotalGeral((i) => calcularPrevistoFixoVariavelMes(i))} />
                  </td>
                  <td className="px-3 py-2">
                    <CalculatedCell value={calcularMedia((i) => calcularPrevistoFixoVariavelMes(i))} />
                  </td>
                </tr>

                {/* Linha Médio */}
                <tr>
                  <td className="px-4 py-3 text-gray-700">Médio</td>
                  <td className="px-3 py-2">
                    <CalculatedCell value={calcularTrimestre(0, 2, (i) => calcularMedioFixoVariavelMes(i))} />
                  </td>
                  {meses.slice(0, 3).map((_, index) => (
                    <td key={index} className="px-3 py-2" style={{width: '100px', minWidth: '100px'}}>
                      <CalculatedCell value={calcularMedioFixoVariavelMes(index)} />
                    </td>
                  ))}
                  <td className="px-3 py-2">
                    <CalculatedCell value={calcularTrimestre(3, 5, (i) => calcularMedioFixoVariavelMes(i))} />
                  </td>
                  {meses.slice(3, 6).map((_, index) => (
                    <td key={index + 3} className="px-3 py-2" style={{width: '100px', minWidth: '100px'}}>
                      <CalculatedCell value={calcularMedioFixoVariavelMes(index + 3)} />
                    </td>
                  ))}
                  <td className="px-3 py-2">
                    <CalculatedCell value={calcularTrimestre(6, 8, (i) => calcularMedioFixoVariavelMes(i))} />
                  </td>
                  {meses.slice(6, 9).map((_, index) => (
                    <td key={index + 6} className="px-3 py-2" style={{width: '100px', minWidth: '100px'}}>
                      <CalculatedCell value={calcularMedioFixoVariavelMes(index + 6)} />
                    </td>
                  ))}
                  <td className="px-3 py-2">
                    <CalculatedCell value={calcularTrimestre(9, 11, (i) => calcularMedioFixoVariavelMes(i))} />
                  </td>
                  {meses.slice(9, 12).map((_, index) => (
                    <td key={index + 9} className="px-3 py-2" style={{width: '100px', minWidth: '100px'}}>
                      <CalculatedCell value={calcularMedioFixoVariavelMes(index + 9)} />
                    </td>
                  ))}
                  <td className="px-3 py-2">
                    <CalculatedCell value={calcularTotalGeral((i) => calcularMedioFixoVariavelMes(i))} />
                  </td>
                  <td className="px-3 py-2">
                    <CalculatedCell value={calcularMedia((i) => calcularMedioFixoVariavelMes(i))} />
                  </td>
                </tr>

                {/* Linha Máximo */}
                <tr>
                  <td className="px-4 py-3 text-gray-700">Máximo</td>
                  <td className="px-3 py-2">
                    <CalculatedCell value={calcularTrimestre(0, 2, (i) => calcularMaximoFixoVariavelMes(i))} />
                  </td>
                  {meses.slice(0, 3).map((_, index) => (
                    <td key={index} className="px-3 py-2" style={{width: '100px', minWidth: '100px'}}>
                      <CalculatedCell value={calcularMaximoFixoVariavelMes(index)} />
                    </td>
                  ))}
                  <td className="px-3 py-2">
                    <CalculatedCell value={calcularTrimestre(3, 5, (i) => calcularMaximoFixoVariavelMes(i))} />
                  </td>
                  {meses.slice(3, 6).map((_, index) => (
                    <td key={index + 3} className="px-3 py-2" style={{width: '100px', minWidth: '100px'}}>
                      <CalculatedCell value={calcularMaximoFixoVariavelMes(index + 3)} />
                    </td>
                  ))}
                  <td className="px-3 py-2">
                    <CalculatedCell value={calcularTrimestre(6, 8, (i) => calcularMaximoFixoVariavelMes(i))} />
                  </td>
                  {meses.slice(6, 9).map((_, index) => (
                    <td key={index + 6} className="px-3 py-2" style={{width: '100px', minWidth: '100px'}}>
                      <CalculatedCell value={calcularMaximoFixoVariavelMes(index + 6)} />
                    </td>
                  ))}
                  <td className="px-3 py-2">
                    <CalculatedCell value={calcularTrimestre(9, 11, (i) => calcularMaximoFixoVariavelMes(i))} />
                  </td>
                  {meses.slice(9, 12).map((_, index) => (
                    <td key={index + 9} className="px-3 py-2" style={{width: '100px', minWidth: '100px'}}>
                      <CalculatedCell value={calcularMaximoFixoVariavelMes(index + 9)} />
                    </td>
                  ))}
                  <td className="px-3 py-2">
                    <CalculatedCell value={calcularTotalGeral((i) => calcularMaximoFixoVariavelMes(i))} />
                  </td>
                  <td className="px-3 py-2">
                    <CalculatedCell value={calcularMedia((i) => calcularMaximoFixoVariavelMes(i))} />
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

    </div>
  )
}

export default Projection
