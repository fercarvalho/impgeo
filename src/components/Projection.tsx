import React, { useState, useEffect, useRef } from 'react'
import { FaBullseye, FaChartLine, FaChartBar, FaRocket, FaUndo, FaTrash, FaSearch, FaEdit, FaCalculator, FaHandPointer, FaTable } from 'react-icons/fa'
import { useAuth } from '../contexts/AuthContext'

interface ProjectionData {
  despesasVariaveis: number[]
  despesasFixas: number[]
  investimentos: number[]
  investimentosPrevistoManual?: (number | null)[]
  investimentosMedioManual?: (number | null)[]
  investimentosMaximoManual?: (number | null)[]
  variablePrevistoManual?: (number | null)[]
  variableMedioManual?: (number | null)[]
  variableMaximoManual?: (number | null)[]
  fixedPrevistoManual?: (number | null)[]
  fixedMediaManual?: (number | null)[]
  fixedMaximoManual?: (number | null)[]
  mkt: number[]
  faturamentoReurb: number[]
  faturamentoReurbPrevistoManual?: (number | null)[]
  faturamentoReurbMedioManual?: (number | null)[]
  faturamentoReurbMaximoManual?: (number | null)[]
  faturamentoGeo: number[]
  faturamentoGeoPrevistoManual?: (number | null)[]
  faturamentoGeoMedioManual?: (number | null)[]
  faturamentoGeoMaximoManual?: (number | null)[]
  faturamentoPlan: number[]
  faturamentoPlanPrevistoManual?: (number | null)[]
  faturamentoPlanMedioManual?: (number | null)[]
  faturamentoPlanMaximoManual?: (number | null)[]
  faturamentoReg: number[]
  faturamentoRegPrevistoManual?: (number | null)[]
  faturamentoRegMedioManual?: (number | null)[]
  faturamentoRegMaximoManual?: (number | null)[]
  faturamentoNn: number[]
  faturamentoNnPrevistoManual?: (number | null)[]
  faturamentoNnMedioManual?: (number | null)[]
  faturamentoNnMaximoManual?: (number | null)[]
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

interface FaturamentoData {
  previsto: number[]
  medio: number[]
  maximo: number[]
}

const API_BASE_URL = '/api'

const Projection: React.FC = () => {
  const { token, user } = useAuth()
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
  
  // Estado para controlar visualização (tabela/gráfico)
  const [isChartView, setIsChartView] = useState(false)
  
  // Função para criar gráfico de barras simples
  const createLineChart = (previsto: number[], medio: number[], maximo: number[], title: string) => {
    // PROPRIEDADES PADRÃO DO GRÁFICO - REUTILIZÁVEIS PARA PRÓXIMOS GRÁFICOS
    const CHART_CONFIG = {
      height: 280,                    // Altura do gráfico
      width: 1200,                    // Largura base (usado no viewBox)
      paddingX: 100,                  // Padding horizontal para labels
      paddingYTop: 25,                // Padding superior para evitar cortes
      paddingYBottom: 50,             // Padding inferior para labels dos meses
      marginPercent: 0.05,             // Margem percentual (5%) para não colar nas bordas
      gridIntervals: 10,              // Número de intervalos no grid (10)
      lineWidth: 3,                   // Espessura das linhas
      pointRadius: 4,                 // Raio dos pontos nas linhas
      hoverRadius: 6,                 // Raio dos pontos no hover
      fontSize: 'text-xs',            // Tamanho da fonte dos labels
      colors: {
        previsto: '#3b82f6',          // Azul para Previsto
        medio: '#10b981',             // Verde para Médio
        maximo: '#8b5cf6'             // Roxo para Máximo
      }
    }
    
    const months = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']
    const allValues = [...previsto, ...medio, ...maximo]
    const rawMinValue = Math.min(...allValues) // Valor mínimo real
    const rawMaxValue = Math.max(...allValues) // Valor máximo real
    
    // Adicionar uma pequena margem para que as linhas não fiquem coladas nas bordas
    const range = rawMaxValue - rawMinValue
    const margin = range * CHART_CONFIG.marginPercent
    const minValue = rawMinValue - margin
    const maxValue = rawMaxValue + margin
    
    // Usar as propriedades padrão
    const chartHeight = CHART_CONFIG.height
    const chartWidth = CHART_CONFIG.width
    const paddingX = CHART_CONFIG.paddingX
    const paddingYTop = CHART_CONFIG.paddingYTop
    const paddingYBottom = CHART_CONFIG.paddingYBottom
    
    // Função para calcular coordenadas Y (escala entre minValue e maxValue)
    const getY = (value: number) => {
      if (maxValue === minValue) return paddingYTop + chartHeight / 2 // Se todos os valores são iguais
      return paddingYTop + chartHeight - ((value - minValue) / (maxValue - minValue)) * chartHeight
    }
    
    // Função para calcular coordenadas X (com padding para evitar cortes)
    const getX = (index: number) => paddingX + (index / (months.length - 1)) * (chartWidth - 2 * paddingX)
    
    return (
      <div className="bg-white rounded-xl p-6 shadow-lg border">
        <h3 className="text-lg font-semibold mb-4 text-center">{title}</h3>
        
        {/* Legenda */}
        <div className="flex justify-center gap-6 mb-4">
          <div className="flex items-center gap-2">
            <div className="w-4 h-0.5 bg-blue-500"></div>
            <span className="text-sm text-gray-600">Previsto</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-0.5 bg-green-500"></div>
            <span className="text-sm text-gray-600">Médio</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-0.5 bg-purple-500"></div>
            <span className="text-sm text-gray-600">Máximo</span>
          </div>
        </div>
        
        {/* Gráfico SVG */}
        <div className="overflow-x-auto w-full">
          <svg width="100%" height={chartHeight + paddingYTop + paddingYBottom} className="mx-auto" viewBox={`0 0 ${chartWidth} ${chartHeight + paddingYTop + paddingYBottom}`}>
            {/* Grid horizontal com intervalos configuráveis */}
            {Array.from({ length: CHART_CONFIG.gridIntervals + 1 }, (_, i) => i / CHART_CONFIG.gridIntervals).map((ratio, i) => {
              const value = minValue + (maxValue - minValue) * (1 - ratio)
              return (
                <g key={i}>
                  <line
                    x1={paddingX}
                    y1={paddingYTop + chartHeight * ratio}
                    x2={chartWidth - paddingX}
                    y2={paddingYTop + chartHeight * ratio}
                    stroke={i % 2 === 0 ? "#e5e7eb" : "#f3f4f6"} // Linhas principais mais destacadas
                    strokeWidth={i % 2 === 0 ? 1 : 0.5}
                  />
                  <text
                    x={paddingX - 25}
                    y={paddingYTop + chartHeight * ratio + 4}
                    textAnchor="end"
                    className={`${CHART_CONFIG.fontSize} fill-gray-500`}
                  >
                    R$ {Math.round(value).toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                  </text>
                </g>
              )
            })}
            
            {/* Linha Previsto */}
            <polyline
              points={previsto.map((value, index) => `${getX(index)},${getY(value)}`).join(' ')}
              fill="none"
              stroke={CHART_CONFIG.colors.previsto}
              strokeWidth={CHART_CONFIG.lineWidth}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            
            {/* Linha Médio */}
            <polyline
              points={medio.map((value, index) => `${getX(index)},${getY(value)}`).join(' ')}
              fill="none"
              stroke={CHART_CONFIG.colors.medio}
              strokeWidth={CHART_CONFIG.lineWidth}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            
            {/* Linha Máximo */}
            <polyline
              points={maximo.map((value, index) => `${getX(index)},${getY(value)}`).join(' ')}
              fill="none"
              stroke={CHART_CONFIG.colors.maximo}
              strokeWidth={CHART_CONFIG.lineWidth}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            
            {/* Pontos nas linhas */}
            {previsto.map((value, index) => (
              <circle
                key={`previsto-${index}`}
                cx={getX(index)}
                cy={getY(value)}
                r={CHART_CONFIG.pointRadius}
                fill={CHART_CONFIG.colors.previsto}
                className={`hover:r-${CHART_CONFIG.hoverRadius} transition-all duration-200`}
              />
            ))}
            
            {medio.map((value, index) => (
              <circle
                key={`medio-${index}`}
                cx={getX(index)}
                cy={getY(value)}
                r={CHART_CONFIG.pointRadius}
                fill={CHART_CONFIG.colors.medio}
                className={`hover:r-${CHART_CONFIG.hoverRadius} transition-all duration-200`}
              />
            ))}
            
            {maximo.map((value, index) => (
              <circle
                key={`maximo-${index}`}
                cx={getX(index)}
                cy={getY(value)}
                r={CHART_CONFIG.pointRadius}
                fill={CHART_CONFIG.colors.maximo}
                className={`hover:r-${CHART_CONFIG.hoverRadius} transition-all duration-200`}
              />
            ))}
            
            {/* Labels dos meses */}
            {months.map((month, index) => (
              <text
                key={month}
                x={getX(index)}
                y={paddingYTop + chartHeight + 30}
                textAnchor="middle"
                className={`${CHART_CONFIG.fontSize} fill-gray-600 font-medium`}
              >
                {month}
              </text>
            ))}
          </svg>
        </div>
      </div>
    )
  }
  
  // Estados para rastrear edições manuais
  const [manualEdits, setManualEdits] = useState<{
    [key: string]: boolean
  }>(() => {
    const saved = localStorage.getItem('manualEdits')
    return saved ? JSON.parse(saved) : {}
  })
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

  // Estados para tabelas de faturamento
  const [faturamentoReurbData, setFaturamentoReurbData] = useState<FaturamentoData>({
    previsto: new Array(12).fill(0),
    medio: new Array(12).fill(0),
    maximo: new Array(12).fill(0)
  })

  const [faturamentoGeoData, setFaturamentoGeoData] = useState<FaturamentoData>({
    previsto: new Array(12).fill(0),
    medio: new Array(12).fill(0),
    maximo: new Array(12).fill(0)
  })

  const [faturamentoPlanData, setFaturamentoPlanData] = useState<FaturamentoData>({
    previsto: new Array(12).fill(0),
    medio: new Array(12).fill(0),
    maximo: new Array(12).fill(0)
  })

  const [faturamentoRegData, setFaturamentoRegData] = useState<FaturamentoData>({
    previsto: new Array(12).fill(0),
    medio: new Array(12).fill(0),
    maximo: new Array(12).fill(0)
  })

  const [faturamentoNnData, setFaturamentoNnData] = useState<FaturamentoData>({
    previsto: new Array(12).fill(0),
    medio: new Array(12).fill(0),
    maximo: new Array(12).fill(0)
  })

  const [faturamentoTotalData, setFaturamentoTotalData] = useState<FaturamentoData>({
    previsto: new Array(12).fill(0),
    medio: new Array(12).fill(0),
    maximo: new Array(12).fill(0)
  })

  const [budgetData, setBudgetData] = useState<VariableExpensesData>({
    previsto: new Array(12).fill(0),
    medio: new Array(12).fill(0),
    maximo: new Array(12).fill(0)
  })

  const [resultadoData, setResultadoData] = useState<VariableExpensesData>({
    previsto: new Array(12).fill(0),
    medio: new Array(12).fill(0),
    maximo: new Array(12).fill(0)
  })

  const [investmentsData, setInvestmentsData] = useState<VariableExpensesData>({
    previsto: new Array(12).fill(0),
    medio: new Array(12).fill(0),
    maximo: new Array(12).fill(0)
  })

  const meses = [
    'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
    'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
  ]

  // Carregar dados do servidor
  const loadData = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/projection`)
      if (response.ok) {
        const serverData = await response.json()
        console.log('📊 DADOS CARREGADOS DO BANCO:', {
          despesasVariaveis: serverData.despesasVariaveis,
          despesasFixas: serverData.despesasFixas,
          faturamentoNn: serverData.faturamentoNn,
          faturamentoNnPrevistoManual: serverData.faturamentoNnPrevistoManual,
          growth: serverData.growth
        })
        setData(serverData)
      } else {
        console.error('Erro ao carregar dados de projeção')
      }
    } catch (error) {
      console.error('Erro ao carregar dados:', error)
    }
  }

  useEffect(() => {
    const loadDataAsync = async () => {
      await loadData()
      await loadFixedExpensesData()
      await loadVariableExpensesData()
      await loadMktData()
      await loadInvestmentsData()
      await loadFaturamentoReurbData()
      await loadFaturamentoGeoData()
      await loadFaturamentoPlanData()
      await loadFaturamentoRegData()
      await loadFaturamentoNnData()
      await loadFaturamentoTotalData()
      await loadBudgetData()
      await loadResultadoData()
      setIsLoading(false)
    }
    
    loadDataAsync()
  }, [])

  // Salvamento automático a cada 5 segundos - DESABILITADO TEMPORARIAMENTE
  // useEffect(() => {
  //   const interval = setInterval(() => {
  //     if (token && !isSaving) {
  //       console.log('Salvamento automático executado')
  //       setIsSaving(true)
  //       saveToServer(data)
  //     }
  //   }, 5000)

  //   return () => clearInterval(interval)
  // }, [token, data, isSaving])

  // Popular automaticamente despesas fixas APENAS quando base existir e arrays estiverem vazios
  useEffect(() => {
    const isEmptyArray = (arr: number[]) => arr.length !== 12 || arr.every(v => !v || v === 0)
    const baseDezembro = data?.despesasFixas?.[11] || 0
    // Só roda quando temos base (dezembro > 0) e arrays estão vazios
    if (!baseDezembro || (!isEmptyArray(fixedExpensesData.previsto) && !isEmptyArray(fixedExpensesData.media) && !isEmptyArray(fixedExpensesData.maximo))) {
      return
    }

    // Calcula seguindo a regra, sem sobrescrever edições manuais
    const p: number[] = new Array(12).fill(0)
    // Janeiro = Dezembro da tabela principal + 10%
    p[0] = formatNumber(baseDezembro * 1.1)
    // Fev/Mar = Jan
    p[1] = p[0]
    p[2] = p[0]
    // Abril = Mar + 10%
    p[3] = formatNumber(p[2] * 1.1)
    // Maio/Junho = Abril
    p[4] = p[3]
    p[5] = p[3]
    // Julho = Junho + 10%
    p[6] = formatNumber(p[5] * 1.1)
    // Agosto/Setembro = Julho
    p[7] = p[6]
    p[8] = p[6]
    // Outubro = Setembro + 10%
    p[9] = formatNumber(p[8] * 1.1)
    // Novembro/Dezembro = Outubro
    p[10] = p[9]
    p[11] = p[9]

    const m: number[] = p.map(v => formatNumber(v * 1.1))
    const x: number[] = m.map(v => formatNumber(v * 1.1))

      const novosDados = {
        ...fixedExpensesData,
      previsto: p,
      media: m,
      maximo: x
      }
      setFixedExpensesData(novosDados)
      if (token) {
        saveFixedExpensesToServer(novosDados)
      }
  }, [data.despesasFixas])

  // Atualização automática das despesas variáveis quando dados da tabela principal ou percentual mudarem
  useEffect(() => {
    let precisaAtualizar = false
    const novosPrevisto = [...variableExpensesData.previsto]
    const novosMedio = [...variableExpensesData.medio]
    const novosMaximo = [...variableExpensesData.maximo]
    
    for (let i = 0; i < 12; i++) {
      // Verificar se foi editado manualmente antes de recalcular
      const previstoEditKey = `variableExpenses-previsto-${i}`
      const medioEditKey = `variableExpenses-medio-${i}`
      const maximoEditKey = `variableExpenses-maximo-${i}`
      
      const novoPrevisto = calcularPrevistoVariableMes(i)
      const novoMedio = calcularMedioVariableMes(i)
      const novoMaximo = calcularMaximoVariableMes(i)
      
      // Só recalcular se não foi editado manualmente
      if (!manualEdits[previstoEditKey] && novosPrevisto[i] !== novoPrevisto) {
        novosPrevisto[i] = novoPrevisto
        precisaAtualizar = true
      }
      if (!manualEdits[medioEditKey] && novosMedio[i] !== novoMedio) {
        novosMedio[i] = novoMedio
        precisaAtualizar = true
      }
      if (!manualEdits[maximoEditKey] && novosMaximo[i] !== novoMaximo) {
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
  }, [data.despesasVariaveis, data.growth?.minimo, data.growth?.medio, data.growth?.maximo, manualEdits]) // Depende dos dados da tabela principal e percentuais

  // Salvar manualEdits no localStorage sempre que mudar
  useEffect(() => {
    localStorage.setItem('manualEdits', JSON.stringify(manualEdits))
  }, [manualEdits])

  // Escutar evento para resetar cálculos automaticamente quando entrar na aba de metas
  useEffect(() => {
    const handleResetarCalculosAutomatico = () => {
      console.log('🔄 Resetando cálculos automaticamente ao entrar na aba de metas...')
      resetarCalculos()
    }

    window.addEventListener('resetarCalculosAutomatico', handleResetarCalculosAutomatico)
    
    return () => {
      window.removeEventListener('resetarCalculosAutomatico', handleResetarCalculosAutomatico)
    }
  }, [])

  // Forçar cálculo inicial das despesas variáveis quando dados forem carregados
  useEffect(() => {
    console.log('useEffect despesas variáveis executado:', {
      isLoading,
      hasDespesasVariaveis: !!data.despesasVariaveis,
      hasGrowth: !!data.growth,
      despesasVariaveis: data.despesasVariaveis?.[0],
      growth: data.growth
    })
    
    if (!isLoading && data.despesasVariaveis && data.growth) {
      console.log('Forçando cálculo inicial das despesas variáveis...')
      const novosPrevisto = []
      const novosMedio = []
      const novosMaximo = []
      
      for (let i = 0; i < 12; i++) {
        novosPrevisto[i] = calcularPrevistoVariableMes(i)
        novosMedio[i] = calcularMedioVariableMes(i)
        novosMaximo[i] = calcularMaximoVariableMes(i)
      }
      
      console.log('Valores calculados:', {
        previsto: novosPrevisto.slice(0, 3),
        medio: novosMedio.slice(0, 3),
        maximo: novosMaximo.slice(0, 3)
      })
      
      const novosDados = {
        ...variableExpensesData,
        previsto: novosPrevisto,
        medio: novosMedio,
        maximo: novosMaximo
      }
      
      setVariableExpensesData(novosDados)
      if (token) {
        console.log('Salvando no servidor...')
        saveVariableExpensesToServer(novosDados)
      }
    }
  }, [isLoading, data.despesasVariaveis, data.growth])

  // Atualização automática do faturamento REURB quando dados da tabela principal ou percentual mudarem
  useEffect(() => {
    let precisaAtualizar = false
    const novosPrevisto = [...faturamentoReurbData.previsto]
    const novosMedio = [...faturamentoReurbData.medio]
    const novosMaximo = [...faturamentoReurbData.maximo]
    
    for (let i = 0; i < 12; i++) {
      // Verificar se foi editado manualmente antes de recalcular
      const previstoEditKey = `faturamentoReurb-previsto-${i}`
      const medioEditKey = `faturamentoReurb-medio-${i}`
      const maximoEditKey = `faturamentoReurb-maximo-${i}`
      
      const novoPrevisto = calcularPrevistoReurbMes(i)
      const novoMedio = calcularMedioReurbMes(i)
      const novoMaximo = calcularMaximoReurbMes(i)
      
      // Só recalcular se não foi editado manualmente
      if (!manualEdits[previstoEditKey] && novosPrevisto[i] !== novoPrevisto) {
        novosPrevisto[i] = novoPrevisto
        precisaAtualizar = true
      }
      if (!manualEdits[medioEditKey] && novosMedio[i] !== novoMedio) {
        novosMedio[i] = novoMedio
        precisaAtualizar = true
      }
      if (!manualEdits[maximoEditKey] && novosMaximo[i] !== novoMaximo) {
        novosMaximo[i] = novoMaximo
        precisaAtualizar = true
      }
    }
    
    if (precisaAtualizar) {
      const novosDados = {
        ...faturamentoReurbData,
        previsto: novosPrevisto,
        medio: novosMedio,
        maximo: novosMaximo
      }
      setFaturamentoReurbData(novosDados)
      if (token) {
        saveFaturamentoReurbToServer(novosDados)
      }
    }
  }, [data.faturamentoReurb, data.growth?.minimo, data.growth?.medio, data.growth?.maximo, manualEdits])

  // Atualização automática do faturamento GEO quando dados da tabela principal ou percentual mudarem
  useEffect(() => {
    let precisaAtualizar = false
    const novosPrevisto = [...faturamentoGeoData.previsto]
    const novosMedio = [...faturamentoGeoData.medio]
    const novosMaximo = [...faturamentoGeoData.maximo]
    
    for (let i = 0; i < 12; i++) {
      const novoPrevisto = calcularPrevistoGeoMes(i)
      const novoMedio = calcularMedioGeoMes(i)
      const novoMaximo = calcularMaximoGeoMes(i)
      
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
        ...faturamentoGeoData,
        previsto: novosPrevisto,
        medio: novosMedio,
        maximo: novosMaximo
      }
      setFaturamentoGeoData(novosDados)
      if (token) {
        saveFaturamentoGeoToServer(novosDados)
      }
    }
  }, [data.faturamentoGeo, data.growth?.minimo, data.growth?.medio, data.growth?.maximo])

  // Atualização automática do faturamento PLAN - DESABILITADO TEMPORARIAMENTE
  useEffect(() => {
    let precisaAtualizar = false
    const novosPrevisto = [...faturamentoPlanData.previsto]
    const novosMedio = [...faturamentoPlanData.medio]
    const novosMaximo = [...faturamentoPlanData.maximo]
    
    for (let i = 0; i < 12; i++) {
      const novoPrevisto = calcularPrevistoPlanMes(i)
      const novoMedio = calcularMedioPlanMes(i)
      const novoMaximo = calcularMaximoPlanMes(i)
      
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
        ...faturamentoPlanData,
        previsto: novosPrevisto,
        medio: novosMedio,
        maximo: novosMaximo
      }
      setFaturamentoPlanData(novosDados)
      if (token) {
        saveFaturamentoPlanToServer(novosDados)
      }
    }
  }, [data.faturamentoPlan, data.growth?.minimo, data.growth?.medio, data.growth?.maximo])

  // Atualização automática do faturamento REG quando dados da tabela principal ou percentual mudarem
  useEffect(() => {
    let precisaAtualizar = false
    const novosPrevisto = [...faturamentoRegData.previsto]
    const novosMedio = [...faturamentoRegData.medio]
    const novosMaximo = [...faturamentoRegData.maximo]
    
    for (let i = 0; i < 12; i++) {
      const novoPrevisto = calcularPrevistoRegMes(i)
      const novoMedio = calcularMedioRegMes(i)
      const novoMaximo = calcularMaximoRegMes(i)
      
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
        ...faturamentoRegData,
        previsto: novosPrevisto,
        medio: novosMedio,
        maximo: novosMaximo
      }
      setFaturamentoRegData(novosDados)
      if (token) {
        saveFaturamentoRegToServer(novosDados)
      }
    }
  }, [data.faturamentoReg, data.growth?.minimo, data.growth?.medio, data.growth?.maximo])

  // Atualização automática do faturamento NN quando dados da tabela principal ou percentual mudarem
  useEffect(() => {
    let precisaAtualizar = false
    const novosPrevisto = [...faturamentoNnData.previsto]
    const novosMedio = [...faturamentoNnData.medio]
    const novosMaximo = [...faturamentoNnData.maximo]
    
    for (let i = 0; i < 12; i++) {
      const novoPrevisto = calcularPrevistoNnMes(i)
      const novoMedio = calcularMedioNnMes(i)
      const novoMaximo = calcularMaximoNnMes(i)
      
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
        ...faturamentoNnData,
        previsto: novosPrevisto,
        medio: novosMedio,
        maximo: novosMaximo
      }
      setFaturamentoNnData(novosDados)
      if (token) {
        saveFaturamentoNnToServer(novosDados)
      }
    }
  }, [data.faturamentoNn, data.growth?.minimo, data.growth?.medio, data.growth?.maximo])

  // Atualização automática dos investimentos quando dados da tabela principal ou percentual mudarem
  useEffect(() => {
    let precisaAtualizar = false
    const novosPrevisto = [...investmentsData.previsto]
    const novosMedio = [...investmentsData.medio]
    const novosMaximo = [...investmentsData.maximo]
    
    for (let i = 0; i < 12; i++) {
      const novoPrevisto = calcularPrevistoInvestimentoMes(i)
      const novoMedio = calcularMedioInvestimentoMes(i)
      const novoMaximo = calcularMaximoInvestimentoMes(i)
      
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
        ...investmentsData,
        previsto: novosPrevisto,
        medio: novosMedio,
        maximo: novosMaximo
      }
      setInvestmentsData(novosDados)
      if (token) {
        saveInvestmentsToServer(novosDados)
      }
    }
  }, [data.investimentos, data.growth?.minimo, data.growth?.medio, data.growth?.maximo])

  // Atualização automática do faturamento total quando qualquer faturamento mudar
  useEffect(() => {
    console.log('useEffect faturamento total executado')
    if (token) {
      const novosPrevisto = [...faturamentoTotalData.previsto]
      const novosMedio = [...faturamentoTotalData.medio]
      const novosMaximo = [...faturamentoTotalData.maximo]
      
      for (let i = 0; i < 12; i++) {
        const novoPrevisto = calcularPrevistoTotalMes(i)
        const novoMedio = calcularMedioTotalMes(i)
        const novoMaximo = calcularMaximoTotalMes(i)
        
        if (novosPrevisto[i] !== novoPrevisto) {
          novosPrevisto[i] = novoPrevisto
        }
        if (novosMedio[i] !== novoMedio) {
          novosMedio[i] = novoMedio
        }
        if (novosMaximo[i] !== novoMaximo) {
          novosMaximo[i] = novoMaximo
        }
      }
      
      const novosDados = {
        ...faturamentoTotalData,
        previsto: novosPrevisto,
        medio: novosMedio,
        maximo: novosMaximo
      }
      
      console.log('Novos dados de faturamento total:', novosDados)
      setFaturamentoTotalData(novosDados)
      saveFaturamentoTotalToServer(novosDados)
    }
  }, [faturamentoReurbData, faturamentoGeoData, faturamentoPlanData, faturamentoRegData, faturamentoNnData])

  // Atualização automática do orçamento quando despesas fixas, variáveis, MKT ou investimentos mudarem
  useEffect(() => {
    if (token) {
      const novosPrevisto = [...budgetData.previsto]
      const novosMedio = [...budgetData.medio]
      const novosMaximo = [...budgetData.maximo]
      
      for (let i = 0; i < 12; i++) {
        const novoPrevisto = calcularPrevistoOrcamentoMes(i)
        const novoMedio = calcularMedioOrcamentoMes(i)
        const novoMaximo = calcularMaximoOrcamentoMes(i)
        
        if (novosPrevisto[i] !== novoPrevisto) {
          novosPrevisto[i] = novoPrevisto
        }
        if (novosMedio[i] !== novoMedio) {
          novosMedio[i] = novoMedio
        }
        if (novosMaximo[i] !== novoMaximo) {
          novosMaximo[i] = novoMaximo
        }
      }
      
      const novosDados = {
        ...budgetData,
        previsto: novosPrevisto,
        medio: novosMedio,
        maximo: novosMaximo
      }
      
      setBudgetData(novosDados)
      saveBudgetToServer(novosDados)
    }
  }, [fixedExpensesData, variableExpensesData, data.mktComponents, data.investimentos])

  // Atualização automática do resultado quando faturamento total ou orçamento mudarem
  useEffect(() => {
    console.log('useEffect resultado executado')
    if (token) {
      const novosPrevisto = [...resultadoData.previsto]
      const novosMedio = [...resultadoData.medio]
      const novosMaximo = [...resultadoData.maximo]
      let precisaAtualizar = false
      
      for (let i = 0; i < 12; i++) {
        const novoPrevisto = calcularPrevistoResultadoMes(i)
        const novoMedio = calcularMedioResultadoMes(i)
        const novoMaximo = calcularMaximoResultadoMes(i)
        
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
          ...resultadoData,
          previsto: novosPrevisto,
          medio: novosMedio,
          maximo: novosMaximo
        }
        
        console.log('Novos dados de resultado:', novosDados)
        setResultadoData(novosDados)
        saveResultadoToServer(novosDados)
      }
    }
  }, [data, fixedExpensesData, variableExpensesData, data.mktComponents, data.investimentos])

  // Atualização automática dos dados de MKT quando componentes de MKT ou percentual mudarem
  useEffect(() => {
    const novosPrevisto = meses.map((_, monthIndex) => {
      const editKey = `mkt-${monthIndex}`
      // Se foi editado manualmente, não recalcular
      if (manualEdits[editKey]) {
        return data.mkt[monthIndex] || 0
      }
      return calcularPrevistoMktMes(monthIndex)
    })
    const novosMedio = meses.map((_, monthIndex) => {
      const editKey = `mkt-${monthIndex}`
      if (manualEdits[editKey]) {
        return data.mkt[monthIndex] || 0
      }
      return calcularMedioMktMes(monthIndex)
    })
    const novosMaximo = meses.map((_, monthIndex) => {
      const editKey = `mkt-${monthIndex}`
      if (manualEdits[editKey]) {
        return data.mkt[monthIndex] || 0
      }
      return calcularMaximoMktMes(monthIndex)
    })
    
    const novosDados = {
      previsto: novosPrevisto,
      medio: novosMedio,
      maximo: novosMaximo
    }
    // Os dados são calculados automaticamente e salvos no servidor
    if (token) {
      saveMktToServer(novosDados)
    }
  }, [data.mktComponents?.trafego, data.mktComponents?.socialMedia, data.mktComponents?.producaoConteudo, data.growth?.minimo, data.growth?.medio, data.growth?.maximo, manualEdits]) // Depende dos componentes de MKT e percentuais

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
      const j = await response.json()
      if (j && j.success && j.data) {
        setData(j.data)
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
    
    // Marcar como edição manual
    const editKey = `${category}-${monthIndex}`
    setManualEdits(prev => ({
      ...prev,
      [editKey]: true
    }))
    
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
    
    // Marcar como edição manual
    const editKey = `growth-${key}`
    setManualEdits(prev => ({
      ...prev,
      [editKey]: true
    }))
    
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
    if (!token) {
      console.error('❌ Token não encontrado para salvar despesas fixas')
      return
    }
    
    console.log('💾 Salvando despesas fixas:', newData)
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
        console.error('❌ Erro ao salvar despesas fixas:', response.status, response.statusText)
        throw new Error('Erro ao salvar dados de despesas fixas')
      }
      const j = await response.json()
      console.log('✅ Despesas fixas salvas com sucesso:', j)
      if (j && j.success && j.data) {
        setFixedExpensesData(j.data)
      }
      console.log('Dados de despesas fixas salvos com sucesso!')
    } catch (error) {
      console.error('Erro ao salvar despesas fixas:', error)
    } finally {
      setIsSaving(false)
    }
  }

  // Atualizar despesas fixas e salvar

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

  // Carregar dados de faturamento REURB
  const loadFaturamentoReurbData = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/faturamento-reurb`)
      if (response.ok) {
        const faturamentoData = await response.json()
        setFaturamentoReurbData(faturamentoData)
      }
    } catch (error) {
      console.error('Erro ao carregar faturamento REURB:', error)
    }
  }

  // Carregar dados de faturamento GEO
  const loadFaturamentoGeoData = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/faturamento-geo`)
      if (response.ok) {
        const faturamentoData = await response.json()
        setFaturamentoGeoData(faturamentoData)
      }
    } catch (error) {
      console.error('Erro ao carregar faturamento GEO:', error)
    }
  }

  // Carregar dados de faturamento PLAN
  const loadFaturamentoPlanData = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/faturamento-plan`)
      if (response.ok) {
        const faturamentoData = await response.json()
        setFaturamentoPlanData(faturamentoData)
      }
    } catch (error) {
      console.error('Erro ao carregar faturamento PLAN:', error)
    }
  }

  // Carregar dados de faturamento REG
  const loadFaturamentoRegData = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/faturamento-reg`)
      if (response.ok) {
        const faturamentoData = await response.json()
        setFaturamentoRegData(faturamentoData)
      }
    } catch (error) {
      console.error('Erro ao carregar faturamento REG:', error)
    }
  }

  // Carregar dados de faturamento NN
  const loadFaturamentoNnData = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/faturamento-nn`)
      if (response.ok) {
        const faturamentoData = await response.json()
        setFaturamentoNnData(faturamentoData)
      }
    } catch (error) {
      console.error('Erro ao carregar faturamento NN:', error)
    }
  }

  const loadFaturamentoTotalData = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/faturamento-total`)
      if (response.ok) {
        const faturamentoData = await response.json()
        setFaturamentoTotalData(faturamentoData)
      }
    } catch (error) {
      console.error('Erro ao carregar faturamento total:', error)
    }
  }

  const loadBudgetData = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/budget`)
      if (response.ok) {
        const budgetData = await response.json()
        setBudgetData(budgetData)
      }
    } catch (error) {
      console.error('Erro ao carregar dados de orçamento:', error)
    }
  }

  const loadResultadoData = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/resultado`)
      if (response.ok) {
        const resultadoData = await response.json()
        console.log('Dados de resultado carregados do servidor:', resultadoData)
        // Não vamos sobrescrever os valores calculados com dados salvos
        // setResultadoData(resultadoData)
      }
    } catch (error) {
      console.error('Erro ao carregar dados de resultado:', error)
    }
  }

  // Função para forçar recálculo do resultado financeiro

  // Carregar dados de MKT
  const loadMktData = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/mkt`)
      if (response.ok) {
        // Os dados são carregados mas não armazenados em estado local
        // pois são calculados automaticamente baseados na tabela principal
        console.log('Dados de MKT carregados com sucesso')
      }
    } catch (error) {
      console.error('Erro ao carregar dados de MKT:', error)
    }
  }

  const loadInvestmentsData = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/investments`)
      if (response.ok) {
        const investmentsData = await response.json()
        setInvestmentsData(investmentsData)
        console.log('Dados de Investimentos carregados com sucesso:', investmentsData)
      }
    } catch (error) {
      console.error('Erro ao carregar dados de Investimentos:', error)
    }
  }

  // Preencher de maneira manual - simula edições manuais multiplicando por 10
  const preencherDeManieraManual = () => {
    if (!confirm('Preencher todos os valores simulando edições manuais (multiplicando por 10)?')) {
      return
    }

    const novosDados = { ...data }
    const novosManualEdits = { ...manualEdits }

    // Simular edições manuais para Despesas Fixas
    for (let i = 0; i < 12; i++) {
      const valorOriginal = data.despesasFixas[i] || 0
      const novoValor = valorOriginal * 10
      novosDados.despesasFixas[i] = novoValor
      novosManualEdits[`fixedPrevistoManual-${i}`] = true
    }

    // Simular edições manuais para Despesas Variáveis
    for (let i = 0; i < 12; i++) {
      const valorOriginal = data.despesasVariaveis[i] || 0
      const novoValor = valorOriginal * 10
      novosDados.despesasVariaveis[i] = novoValor
      novosManualEdits[`variablePrevistoManual-${i}`] = true
    }

    // Simular edições manuais para Investimentos
    for (let i = 0; i < 12; i++) {
      const valorOriginal = data.investimentos[i] || 0
      const novoValor = valorOriginal * 10
      novosDados.investimentos[i] = novoValor
      novosManualEdits[`investimentosPrevistoManual-${i}`] = true
    }

    // Simular edições manuais para MKT
    for (let i = 0; i < 12; i++) {
      const valorOriginal = data.mkt[i] || 0
      const novoValor = valorOriginal * 10
      novosDados.mkt[i] = novoValor
    }

    // Simular edições manuais para Faturamento REURB
    for (let i = 0; i < 12; i++) {
      const valorOriginal = data.faturamentoReurb[i] || 0
      const novoValor = valorOriginal * 10
      novosDados.faturamentoReurb[i] = novoValor
      novosManualEdits[`faturamentoReurbPrevistoManual-${i}`] = true
    }

    // Simular edições manuais para Faturamento GEO
    for (let i = 0; i < 12; i++) {
      const valorOriginal = data.faturamentoGeo[i] || 0
      const novoValor = valorOriginal * 10
      novosDados.faturamentoGeo[i] = novoValor
      novosManualEdits[`faturamentoGeoPrevistoManual-${i}`] = true
    }

    // Simular edições manuais para Faturamento PLAN
    for (let i = 0; i < 12; i++) {
      const valorOriginal = data.faturamentoPlan[i] || 0
      const novoValor = valorOriginal * 10
      novosDados.faturamentoPlan[i] = novoValor
      novosManualEdits[`faturamentoPlanPrevistoManual-${i}`] = true
    }

    // Simular edições manuais para Faturamento REG
    for (let i = 0; i < 12; i++) {
      const valorOriginal = data.faturamentoReg[i] || 0
      const novoValor = valorOriginal * 10
      novosDados.faturamentoReg[i] = novoValor
      novosManualEdits[`faturamentoRegPrevistoManual-${i}`] = true
    }

    // Simular edições manuais para Faturamento NN
    for (let i = 0; i < 12; i++) {
      const valorOriginal = data.faturamentoNn[i] || 0
      const novoValor = valorOriginal * 10
      novosDados.faturamentoNn[i] = novoValor
      novosManualEdits[`faturamentoNnPrevistoManual-${i}`] = true
    }

    // Atualizar os dados e manualEdits
    setData(novosDados)
    setManualEdits(novosManualEdits)
    
    // Salvar no localStorage
    localStorage.setItem('manualEdits', JSON.stringify(novosManualEdits))
    
    // Salvar no servidor
    saveToServer(novosDados)
    
    alert('✅ Valores preenchidos simulando edições manuais com sucesso!')
  }

  // Preencher Resultado do Ano Anterior com valores crescentes
  const preencherResultadoAnoAnterior = () => {
    if (!confirm('Preencher todos os campos de "Resultado do Ano Anterior" com valores crescentes de 100 em 100?')) {
      return
    }

    let valorAtual = 100
    const novosDados = { ...data }

    // Preencher cada linha (categoria) com valores crescentes
    // Despesas Variáveis (12 meses)
    novosDados.despesasVariaveis = Array.from({ length: 12 }, () => {
      const valor = valorAtual
      valorAtual += 100
      return valor
    })

    // Despesas Fixas (12 meses)
    novosDados.despesasFixas = Array.from({ length: 12 }, () => {
      const valor = valorAtual
      valorAtual += 100
      return valor
    })

    // Investimentos (12 meses)
    novosDados.investimentos = Array.from({ length: 12 }, () => {
      const valor = valorAtual
      valorAtual += 100
      return valor
    })

    // MKT (12 meses)
    novosDados.mkt = Array.from({ length: 12 }, () => {
      const valor = valorAtual
      valorAtual += 100
      return valor
    })

    // Faturamento REURB (12 meses)
    novosDados.faturamentoReurb = Array.from({ length: 12 }, () => {
      const valor = valorAtual
      valorAtual += 100
      return valor
    })

    // Faturamento GEO (12 meses)
    novosDados.faturamentoGeo = Array.from({ length: 12 }, () => {
      const valor = valorAtual
      valorAtual += 100
      return valor
    })

    // Faturamento PLAN (12 meses)
    novosDados.faturamentoPlan = Array.from({ length: 12 }, () => {
      const valor = valorAtual
      valorAtual += 100
      return valor
    })

    // Faturamento REG (12 meses)
    novosDados.faturamentoReg = Array.from({ length: 12 }, () => {
      const valor = valorAtual
      valorAtual += 100
      return valor
    })

    // Faturamento NN (12 meses)
    novosDados.faturamentoNn = Array.from({ length: 12 }, () => {
      const valor = valorAtual
      valorAtual += 100
      return valor
    })

    // Atualizar os dados
    setData(novosDados)
    saveToServer(novosDados)
    
    alert('✅ Tabela "Resultado do Ano Anterior" preenchida com sucesso!')
  }

  // Função para resetar cálculos (extraída do botão)
  const resetarCalculos = async () => {
    // Limpar edições manuais do estado local
    setManualEdits({})
    
    // Limpar arrays de edições manuais do estado principal
    const updatedData = {
      ...data,
      // Limpar edições manuais de despesas fixas
      fixedPrevistoManual: undefined,
      fixedMediaManual: undefined,
      fixedMaximoManual: undefined,
      // Limpar edições manuais de despesas variáveis
      variablePrevistoManual: undefined,
      variableMedioManual: undefined,
      variableMaximoManual: undefined,
      // Limpar edições manuais de investimentos
      investimentosPrevistoManual: undefined,
      investimentosMedioManual: undefined,
      investimentosMaximoManual: undefined,
      // Limpar edições manuais de faturamentos
      faturamentoReurbPrevistoManual: undefined,
      faturamentoReurbMedioManual: undefined,
      faturamentoReurbMaximoManual: undefined,
      faturamentoGeoPrevistoManual: undefined,
      faturamentoGeoMedioManual: undefined,
      faturamentoGeoMaximoManual: undefined,
      faturamentoPlanPrevistoManual: undefined,
      faturamentoPlanMedioManual: undefined,
      faturamentoPlanMaximoManual: undefined,
      faturamentoRegPrevistoManual: undefined,
      faturamentoRegMedioManual: undefined,
      faturamentoRegMaximoManual: undefined,
      faturamentoNnPrevistoManual: undefined,
      faturamentoNnMedioManual: undefined,
      faturamentoNnMaximoManual: undefined
    }
    
    setData(updatedData)
    
    // Salvar no servidor
    if (token) {
      saveToServer(updatedData)
    }
    
    console.log('Edições manuais resetadas - cálculos automáticos reativados')
    alert('✅ Cálculos resetados com sucesso!\n\nTodas as edições manuais foram removidas e os valores voltaram aos cálculos automáticos.')
  }

  // Limpar todos os dados de projeção
  const clearAllProjectionData = async () => {
    if (!token) {
      alert('Você precisa estar logado para limpar os dados!')
      return
    }

    const confirmMessage = `⚠️ ATENÇÃO! ⚠️

Esta ação irá APAGAR TODOS os dados de projeção, incluindo:
• Todos os valores de faturamento
• Todas as despesas fixas e variáveis
• Todos os investimentos e MKT
• Todos os percentuais de crescimento
• Todos os dados salvos no banco de dados

Esta ação NÃO PODE ser desfeita!

Tem certeza que deseja continuar?`

    if (!confirm(confirmMessage)) {
      return
    }

    const doubleConfirm = confirm(`🚨 CONFIRMAÇÃO FINAL 🚨

Você está prestes a APAGAR TODOS os dados de projeção permanentemente.

Esta é sua última chance de cancelar.

Continuar mesmo assim?`)

    if (!doubleConfirm) {
      return
    }

    try {
      setIsSaving(true)
      console.log('Iniciando limpeza de todos os dados...')
      
      const response = await fetch(`${API_BASE_URL}/clear-all-projection-data`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      })

      if (response.ok) {
        const result = await response.json()
        console.log('Dados limpos com sucesso:', result.message)
        
        // Recarregar todos os dados
        await loadData()
        await loadFixedExpensesData()
        await loadVariableExpensesData()
        await loadMktData()
        await loadFaturamentoReurbData()
        await loadFaturamentoGeoData()
        await loadFaturamentoPlanData()
        await loadFaturamentoRegData()
        await loadFaturamentoNnData()
        await loadFaturamentoTotalData()
        await loadBudgetData()
        await loadResultadoData()
        
        // Limpar edições manuais
        setManualEdits({})
        
        alert('✅ Todos os dados foram limpos com sucesso!\n\nA página será recarregada para aplicar as mudanças.')
        
        // Recarregar a página
        window.location.reload()
        
      } else {
        const error = await response.json()
        console.error('Erro ao limpar dados:', error.message)
        alert(`❌ Erro ao limpar dados: ${error.message}`)
      }
    } catch (error) {
      console.error('Erro ao limpar dados:', error)
      alert(`❌ Erro ao limpar dados: ${error instanceof Error ? error.message : 'Erro desconhecido'}`)
    } finally {
      setIsSaving(false)
    }
  }


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
      const j = await response.json()
      if (j && j.success && j.data) {
        setVariableExpensesData(j.data)
      }
      console.log('Dados de despesas variáveis salvos com sucesso!')
    } catch (error) {
      console.error('Erro ao salvar despesas variáveis:', error)
    } finally {
      setIsSaving(false)
    }
  }

  // Salvar dados de faturamento REURB
  const saveFaturamentoReurbToServer = async (newData: FaturamentoData) => {
    if (!token) return
    
    setIsSaving(true)
    try {
      const response = await fetch(`${API_BASE_URL}/faturamento-reurb`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(newData)
      })
      
      if (!response.ok) {
        throw new Error('Erro ao salvar dados de faturamento REURB')
      }
      const j = await response.json()
      if (j && j.success && j.data) {
        setFaturamentoReurbData(j.data)
      }
      console.log('Dados de faturamento REURB salvos com sucesso!')
    } catch (error) {
      console.error('Erro ao salvar faturamento REURB:', error)
    } finally {
      setIsSaving(false)
    }
  }

  // Salvar dados de faturamento GEO
  const saveFaturamentoGeoToServer = async (newData: FaturamentoData) => {
    if (!token) return
    
    setIsSaving(true)
    try {
      const response = await fetch(`${API_BASE_URL}/faturamento-geo`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(newData)
      })
      
      if (!response.ok) {
        throw new Error('Erro ao salvar dados de faturamento GEO')
      }
      const j = await response.json()
      if (j && j.success && j.data) {
        setFaturamentoGeoData(j.data)
      }
      console.log('Dados de faturamento GEO salvos com sucesso!')
    } catch (error) {
      console.error('Erro ao salvar faturamento GEO:', error)
    } finally {
      setIsSaving(false)
    }
  }

  // Salvar dados de faturamento PLAN
  const saveFaturamentoPlanToServer = async (newData: FaturamentoData) => {
    if (!token) return
    
    setIsSaving(true)
    try {
      const response = await fetch(`${API_BASE_URL}/faturamento-plan`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(newData)
      })
      
      if (!response.ok) {
        throw new Error('Erro ao salvar dados de faturamento PLAN')
      }
      const j = await response.json()
      if (j && j.success && j.data) {
        setFaturamentoPlanData(j.data)
      }
      console.log('Dados de faturamento PLAN salvos com sucesso!')
    } catch (error) {
      console.error('Erro ao salvar faturamento PLAN:', error)
    } finally {
      setIsSaving(false)
    }
  }

  // Salvar dados de faturamento REG
  const saveFaturamentoRegToServer = async (newData: FaturamentoData) => {
    if (!token) return
    
    setIsSaving(true)
    try {
      const response = await fetch(`${API_BASE_URL}/faturamento-reg`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(newData)
      })
      
      if (!response.ok) {
        throw new Error('Erro ao salvar dados de faturamento REG')
      }
      const j = await response.json()
      if (j && j.success && j.data) {
        setFaturamentoRegData(j.data)
      }
      console.log('Dados de faturamento REG salvos com sucesso!')
    } catch (error) {
      console.error('Erro ao salvar faturamento REG:', error)
    } finally {
      setIsSaving(false)
    }
  }

  // Salvar dados de faturamento NN
  const saveFaturamentoNnToServer = async (newData: FaturamentoData) => {
    if (!token) return
    
    setIsSaving(true)
    try {
      const response = await fetch(`${API_BASE_URL}/faturamento-nn`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(newData)
      })
      
      if (!response.ok) {
        throw new Error('Erro ao salvar dados de faturamento NN')
      }
      const j = await response.json()
      if (j && j.success && j.data) {
        setFaturamentoNnData(j.data)
      }
      console.log('Dados de faturamento NN salvos com sucesso!')
    } catch (error) {
      console.error('Erro ao salvar faturamento NN:', error)
    } finally {
      setIsSaving(false)
    }
  }

  // Salvar dados de faturamento total
  const saveFaturamentoTotalToServer = async (newData: FaturamentoData) => {
    if (!token) return
    
    setIsSaving(true)
    try {
      const response = await fetch(`${API_BASE_URL}/faturamento-total`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(newData)
      })
      
      if (!response.ok) {
        throw new Error('Erro ao salvar dados de faturamento total')
      }
      const j = await response.json()
      if (j && j.success && j.data) {
        setFaturamentoTotalData(j.data)
      }
      console.log('Dados de faturamento total salvos com sucesso!')
    } catch (error) {
      console.error('Erro ao salvar faturamento total:', error)
    } finally {
      setIsSaving(false)
    }
  }

  // Salvar dados de orçamento
  const saveBudgetToServer = async (newData: VariableExpensesData) => {
    if (!token) return
    
    setIsSaving(true)
    try {
      const response = await fetch(`${API_BASE_URL}/budget`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(newData)
      })
      
      if (!response.ok) {
        throw new Error('Erro ao salvar dados de orçamento')
      }
      const j = await response.json()
      if (j && j.success && j.data) {
        setBudgetData(j.data)
      }
      console.log('Dados de orçamento salvos com sucesso!')
    } catch (error) {
      console.error('Erro ao salvar orçamento:', error)
    } finally {
      setIsSaving(false)
    }
  }

  // Salvar dados de resultado
  const saveResultadoToServer = async (newData: VariableExpensesData) => {
    if (!token) return
    
    setIsSaving(true)
    try {
      const response = await fetch(`${API_BASE_URL}/resultado`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(newData)
      })
      
      if (!response.ok) {
        throw new Error('Erro ao salvar dados de resultado')
      }
      const j = await response.json()
      if (j && j.success && j.data) {
        setResultadoData(j.data)
      }
      console.log('Dados de resultado salvos com sucesso!')
    } catch (error) {
      console.error('Erro ao salvar resultado:', error)
    } finally {
      setIsSaving(false)
    }
  }

  // Salvar dados de MKT
  const saveMktToServer = async (newData: VariableExpensesData) => {
    if (!token) return
    
    setIsSaving(true)
    try {
      const response = await fetch(`${API_BASE_URL}/mkt`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(newData)
      })
      
      if (!response.ok) {
        throw new Error('Erro ao salvar dados de MKT')
      }
      const j = await response.json()
      if (j && j.success && j.data) {
        // MKT tem estado derivado; não sobrescrevemos diretamente 'data', apenas confirmamos
      }
      console.log('Dados de MKT salvos com sucesso!')
    } catch (error) {
      console.error('Erro ao salvar dados de MKT:', error)
    } finally {
      setIsSaving(false)
    }
  }

  const saveInvestmentsToServer = async (newData: VariableExpensesData) => {
    if (!token) return
    
    setIsSaving(true)
    try {
      const response = await fetch(`${API_BASE_URL}/investments`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(newData)
      })
      
      if (!response.ok) {
        throw new Error('Erro ao salvar dados de Investimentos')
      }
      const j = await response.json()
      if (j && j.success && j.data) {
        // Investimentos tem estado derivado; não sobrescrevemos diretamente 'data', apenas confirmamos
      }
      console.log('Dados de Investimentos salvos com sucesso!')
    } catch (error) {
      console.error('Erro ao salvar dados de Investimentos:', error)
    } finally {
      setIsSaving(false)
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




  // Funções específicas para despesas variáveis
  const calcularPrevistoVariableMes = (monthIndex: number) => {
    const override = data.variablePrevistoManual?.[monthIndex]
    if (override !== undefined && override !== null) return formatNumber(override)
    // Previsto = Despesas Variáveis (tabela principal) + Percentual Mínimo
    const despesasVariaveis = data.despesasVariaveis[monthIndex] || 0
    const percentualMinimo = data.growth?.minimo || 0
    return formatNumber(despesasVariaveis + (despesasVariaveis * percentualMinimo / 100))
  }

  const calcularMedioVariableMes = (monthIndex: number) => {
    const override = data.variableMedioManual?.[monthIndex]
    if (override !== undefined && override !== null) return formatNumber(override)
    // Médio = Despesas Variáveis (tabela principal) + Percentual Médio
    const despesasVariaveis = data.despesasVariaveis[monthIndex] || 0
    const percentualMedio = data.growth?.medio || 0
    return formatNumber(despesasVariaveis + (despesasVariaveis * percentualMedio / 100))
  }

  const calcularMaximoVariableMes = (monthIndex: number) => {
    const override = data.variableMaximoManual?.[monthIndex]
    if (override !== undefined && override !== null) return formatNumber(override)
    // Máximo = Despesas Variáveis (tabela principal) + Percentual Máximo
    const despesasVariaveis = data.despesasVariaveis[monthIndex] || 0
    const percentualMaximo = data.growth?.maximo || 0
    return formatNumber(despesasVariaveis + (despesasVariaveis * percentualMaximo / 100))
  }

  // Funções de cálculo para Despesas Fixas
  const calcularPrevistoFixedMes = (monthIndex: number) => {
    const override = data.fixedPrevistoManual?.[monthIndex]
    if (override !== undefined && override !== null) return formatNumber(override)
    
    // Nova fórmula: Janeiro = Dezembro anterior + 10%
    // Fevereiro e Março = Janeiro
    // Abril = Março + 10%, Maio e Junho = Abril
    // Julho = Junho + 10%, Agosto e Setembro = Julho
    // Outubro = Setembro + 10%, Novembro e Dezembro = Outubro
    
    const dezembroAnterior = data.despesasFixas[11] || 0 // Valor de dezembro do ano anterior
    const janeiro = dezembroAnterior * 1.10 // Janeiro = Dezembro + 10%
    
    if (monthIndex === 0) return formatNumber(janeiro) // Janeiro
    if (monthIndex === 1 || monthIndex === 2) return formatNumber(janeiro) // Fevereiro e Março
    
    const abril = janeiro * 1.10 // Abril = Janeiro + 10%
    if (monthIndex === 3) return formatNumber(abril) // Abril
    if (monthIndex === 4 || monthIndex === 5) return formatNumber(abril) // Maio e Junho
    
    const julho = abril * 1.10 // Julho = Abril + 10%
    if (monthIndex === 6) return formatNumber(julho) // Julho
    if (monthIndex === 7 || monthIndex === 8) return formatNumber(julho) // Agosto e Setembro
    
    const outubro = julho * 1.10 // Outubro = Julho + 10%
    if (monthIndex === 9) return formatNumber(outubro) // Outubro
    if (monthIndex === 10 || monthIndex === 11) return formatNumber(outubro) // Novembro e Dezembro
    
    return formatNumber(0)
  }

  const calcularMediaFixedMes = (monthIndex: number) => {
    const override = data.fixedMediaManual?.[monthIndex]
    if (override !== undefined && override !== null) return formatNumber(override)
    
    // Médio = Previsto + 10%
    const previstoStr = calcularPrevistoFixedMes(monthIndex)
    const previstoValue = parseFloat(String(previstoStr).replace(/[^\d.-]/g, '')) || 0
    return formatNumber(previstoValue * 1.10)
  }

  const calcularMaximoFixedMes = (monthIndex: number) => {
    const override = data.fixedMaximoManual?.[monthIndex]
    if (override !== undefined && override !== null) return formatNumber(override)
    
    // Máximo = Médio + 10%
    const medioStr = calcularMediaFixedMes(monthIndex)
    const medioValue = parseFloat(String(medioStr).replace(/[^\d.-]/g, '')) || 0
    return formatNumber(medioValue * 1.10)
  }

  // Funções de cálculo para Faturamento REURB
  const calcularPrevistoReurbMes = (monthIndex: number) => {
    // Verificar se há override manual primeiro
    const override = data.faturamentoReurbPrevistoManual?.[monthIndex]
    if (override !== undefined && override !== null) {
      console.log(`REURB Mês ${monthIndex}: Usando valor manual=${override}`)
      return formatNumber(override)
    }
    
    // Previsto = Faturamento REURB (tabela principal) + Percentual Mínimo
    const faturamentoReurb = data.faturamentoReurb[monthIndex] || 0
    const percentualMinimo = data.growth?.minimo || 0
    const resultado = formatNumber(faturamentoReurb + (faturamentoReurb * percentualMinimo / 100))
    console.log(`REURB Mês ${monthIndex}: Base=${faturamentoReurb}, Percentual=${percentualMinimo}%, Resultado=${resultado}`)
    return resultado
  }

  const calcularMedioReurbMes = (monthIndex: number) => {
    // Verificar se há override manual primeiro
    const override = data.faturamentoReurbMedioManual?.[monthIndex]
    if (override !== undefined && override !== null) {
      console.log(`REURB Médio Mês ${monthIndex}: Usando valor manual=${override}`)
      return formatNumber(override)
    }
    
    // Médio = Faturamento REURB (tabela principal) + Percentual Médio
    const faturamentoReurb = data.faturamentoReurb[monthIndex] || 0
    const percentualMedio = data.growth?.medio || 0
    return formatNumber(faturamentoReurb + (faturamentoReurb * percentualMedio / 100))
  }

  const calcularMaximoReurbMes = (monthIndex: number) => {
    // Verificar se há override manual primeiro
    const override = data.faturamentoReurbMaximoManual?.[monthIndex]
    if (override !== undefined && override !== null) {
      console.log(`REURB Máximo Mês ${monthIndex}: Usando valor manual=${override}`)
      return formatNumber(override)
    }
    
    // Máximo = Faturamento REURB (tabela principal) + Percentual Máximo
    const faturamentoReurb = data.faturamentoReurb[monthIndex] || 0
    const percentualMaximo = data.growth?.maximo || 0
    return formatNumber(faturamentoReurb + (faturamentoReurb * percentualMaximo / 100))
  }

  // Funções de cálculo para Faturamento GEO
  const calcularPrevistoGeoMes = (monthIndex: number) => {
    // Verificar se há override manual primeiro
    const override = data.faturamentoGeoPrevistoManual?.[monthIndex]
    if (override !== undefined && override !== null) {
      console.log(`GEO Mês ${monthIndex}: Usando valor manual=${override}`)
      return formatNumber(override)
    }
    
    // Previsto = Faturamento GEO (tabela principal) + Percentual Mínimo
    const faturamentoGeo = data.faturamentoGeo[monthIndex] || 0
    const percentualMinimo = data.growth?.minimo || 0
    return formatNumber(faturamentoGeo + (faturamentoGeo * percentualMinimo / 100))
  }

  const calcularMedioGeoMes = (monthIndex: number) => {
    // Verificar se há override manual primeiro
    const override = data.faturamentoGeoMedioManual?.[monthIndex]
    if (override !== undefined && override !== null) {
      console.log(`GEO Médio Mês ${monthIndex}: Usando valor manual=${override}`)
      return formatNumber(override)
    }
    
    // Médio = Faturamento GEO (tabela principal) + Percentual Médio
    const faturamentoGeo = data.faturamentoGeo[monthIndex] || 0
    const percentualMedio = data.growth?.medio || 0
    return formatNumber(faturamentoGeo + (faturamentoGeo * percentualMedio / 100))
  }

  const calcularMaximoGeoMes = (monthIndex: number) => {
    // Verificar se há override manual primeiro
    const override = data.faturamentoGeoMaximoManual?.[monthIndex]
    if (override !== undefined && override !== null) {
      console.log(`GEO Máximo Mês ${monthIndex}: Usando valor manual=${override}`)
      return formatNumber(override)
    }
    
    // Máximo = Faturamento GEO (tabela principal) + Percentual Máximo
    const faturamentoGeo = data.faturamentoGeo[monthIndex] || 0
    const percentualMaximo = data.growth?.maximo || 0
    return formatNumber(faturamentoGeo + (faturamentoGeo * percentualMaximo / 100))
  }

  // Funções de cálculo para Faturamento PLAN
  const calcularPrevistoPlanMes = (monthIndex: number) => {
    // Verificar se há override manual primeiro
    const override = data.faturamentoPlanPrevistoManual?.[monthIndex]
    if (override !== undefined && override !== null) {
      console.log(`PLAN Mês ${monthIndex}: Usando valor manual=${override}`)
      return formatNumber(override)
    }
    
    // Previsto = Faturamento PLAN (tabela principal) + Percentual Mínimo
    const faturamentoPlan = data.faturamentoPlan[monthIndex] || 0
    const percentualMinimo = data.growth?.minimo || 0
    return formatNumber(faturamentoPlan + (faturamentoPlan * percentualMinimo / 100))
  }

  const calcularMedioPlanMes = (monthIndex: number) => {
    // Verificar se há override manual primeiro
    const override = data.faturamentoPlanMedioManual?.[monthIndex]
    if (override !== undefined && override !== null) {
      console.log(`PLAN Médio Mês ${monthIndex}: Usando valor manual=${override}`)
      return formatNumber(override)
    }
    
    // Médio = Faturamento PLAN (tabela principal) + Percentual Médio
    const faturamentoPlan = data.faturamentoPlan[monthIndex] || 0
    const percentualMedio = data.growth?.medio || 0
    return formatNumber(faturamentoPlan + (faturamentoPlan * percentualMedio / 100))
  }

  const calcularMaximoPlanMes = (monthIndex: number) => {
    // Verificar se há override manual primeiro
    const override = data.faturamentoPlanMaximoManual?.[monthIndex]
    if (override !== undefined && override !== null) {
      console.log(`PLAN Máximo Mês ${monthIndex}: Usando valor manual=${override}`)
      return formatNumber(override)
    }
    
    // Máximo = Faturamento PLAN (tabela principal) + Percentual Máximo
    const faturamentoPlan = data.faturamentoPlan[monthIndex] || 0
    const percentualMaximo = data.growth?.maximo || 0
    return formatNumber(faturamentoPlan + (faturamentoPlan * percentualMaximo / 100))
  }

  // Funções de cálculo para Faturamento REG
  const calcularPrevistoRegMes = (monthIndex: number) => {
    // Verificar se há override manual primeiro
    const override = data.faturamentoRegPrevistoManual?.[monthIndex]
    if (override !== undefined && override !== null) {
      console.log(`REG Mês ${monthIndex}: Usando valor manual=${override}`)
      return formatNumber(override)
    }
    
    // Previsto = Faturamento REG (tabela principal) + Percentual Mínimo
    const faturamentoReg = data.faturamentoReg[monthIndex] || 0
    const percentualMinimo = data.growth?.minimo || 0
    return formatNumber(faturamentoReg + (faturamentoReg * percentualMinimo / 100))
  }

  const calcularMedioRegMes = (monthIndex: number) => {
    // Verificar se há override manual primeiro
    const override = data.faturamentoRegMedioManual?.[monthIndex]
    if (override !== undefined && override !== null) {
      console.log(`REG Médio Mês ${monthIndex}: Usando valor manual=${override}`)
      return formatNumber(override)
    }
    
    // Médio = Faturamento REG (tabela principal) + Percentual Médio
    const faturamentoReg = data.faturamentoReg[monthIndex] || 0
    const percentualMedio = data.growth?.medio || 0
    return formatNumber(faturamentoReg + (faturamentoReg * percentualMedio / 100))
  }

  const calcularMaximoRegMes = (monthIndex: number) => {
    // Verificar se há override manual primeiro
    const override = data.faturamentoRegMaximoManual?.[monthIndex]
    if (override !== undefined && override !== null) {
      console.log(`REG Máximo Mês ${monthIndex}: Usando valor manual=${override}`)
      return formatNumber(override)
    }
    
    // Máximo = Faturamento REG (tabela principal) + Percentual Máximo
    const faturamentoReg = data.faturamentoReg[monthIndex] || 0
    const percentualMaximo = data.growth?.maximo || 0
    return formatNumber(faturamentoReg + (faturamentoReg * percentualMaximo / 100))
  }

  // Funções de cálculo para Faturamento NN
  const calcularPrevistoNnMes = (monthIndex: number) => {
    // Verificar se há override manual primeiro
    const override = data.faturamentoNnPrevistoManual?.[monthIndex]
    if (override !== undefined && override !== null) {
      console.log(`NN Mês ${monthIndex}: Usando valor manual=${override}`)
      return formatNumber(override)
    }
    
    // Previsto = Faturamento NN (tabela principal) + Percentual Mínimo
    const faturamentoNn = data.faturamentoNn[monthIndex] || 0
    const percentualMinimo = data.growth?.minimo || 0
    const valorCalculado = faturamentoNn + (faturamentoNn * percentualMinimo / 100)
    console.log(`NN Mês ${monthIndex}: Calculado automaticamente=${valorCalculado} (base=${faturamentoNn} + ${percentualMinimo}%)`)
    return formatNumber(valorCalculado)
  }

  const calcularMedioNnMes = (monthIndex: number) => {
    // Verificar se há override manual primeiro
    const override = data.faturamentoNnMedioManual?.[monthIndex]
    if (override !== undefined && override !== null) {
      console.log(`NN Médio Mês ${monthIndex}: Usando valor manual=${override}`)
      return formatNumber(override)
    }
    
    // Médio = Faturamento NN (tabela principal) + Percentual Médio
    const faturamentoNn = data.faturamentoNn[monthIndex] || 0
    const percentualMedio = data.growth?.medio || 0
    return formatNumber(faturamentoNn + (faturamentoNn * percentualMedio / 100))
  }

  const calcularMaximoNnMes = (monthIndex: number) => {
    // Verificar se há override manual primeiro
    const override = data.faturamentoNnMaximoManual?.[monthIndex]
    if (override !== undefined && override !== null) {
      console.log(`NN Máximo Mês ${monthIndex}: Usando valor manual=${override}`)
      return formatNumber(override)
    }
    
    // Máximo = Faturamento NN (tabela principal) + Percentual Máximo
    const faturamentoNn = data.faturamentoNn[monthIndex] || 0
    const percentualMaximo = data.growth?.maximo || 0
    return formatNumber(faturamentoNn + (faturamentoNn * percentualMaximo / 100))
  }

  // Funções de cálculo para Faturamento Total
  const calcularPrevistoTotalMes = (monthIndex: number) => {
    // Previsto = Soma de todos os faturamentos (Previsto)
    const reurbPrevisto = calcularPrevistoReurbMes(monthIndex)
    const geoPrevisto = calcularPrevistoGeoMes(monthIndex)
    const planPrevisto = calcularPrevistoPlanMes(monthIndex)
    const regPrevisto = calcularPrevistoRegMes(monthIndex)
    const nnPrevisto = calcularPrevistoNnMes(monthIndex)
    const total = formatNumber(reurbPrevisto + geoPrevisto + planPrevisto + regPrevisto + nnPrevisto)
    console.log(`Faturamento Total Mês ${monthIndex}: REURB=${reurbPrevisto}, GEO=${geoPrevisto}, PLAN=${planPrevisto}, REG=${regPrevisto}, NN=${nnPrevisto}, Total=${total}`)
    return total
  }

  const calcularMedioTotalMes = (monthIndex: number) => {
    // Médio = Soma de todos os faturamentos (Médio)
    const reurbMedio = calcularMedioReurbMes(monthIndex)
    const geoMedio = calcularMedioGeoMes(monthIndex)
    const planMedio = calcularMedioPlanMes(monthIndex)
    const regMedio = calcularMedioRegMes(monthIndex)
    const nnMedio = calcularMedioNnMes(monthIndex)
    return formatNumber(reurbMedio + geoMedio + planMedio + regMedio + nnMedio)
  }

  const calcularMaximoTotalMes = (monthIndex: number) => {
    // Máximo = Soma de todos os faturamentos (Máximo)
    const reurbMaximo = calcularMaximoReurbMes(monthIndex)
    const geoMaximo = calcularMaximoGeoMes(monthIndex)
    const planMaximo = calcularMaximoPlanMes(monthIndex)
    const regMaximo = calcularMaximoRegMes(monthIndex)
    const nnMaximo = calcularMaximoNnMes(monthIndex)
    return formatNumber(reurbMaximo + geoMaximo + planMaximo + regMaximo + nnMaximo)
  }

  // Funções específicas para despesas fixas + variáveis (não editáveis)
  const calcularPrevistoFixoVariavelMes = (monthIndex: number) => {
    // Previsto = Despesas Fixas (Previsto) + Despesas Variáveis (Previsto)
    const despesasFixasPrevisto = calcularPrevistoFixedMes(monthIndex)
    const despesasVariaveisPrevisto = calcularPrevistoVariableMes(monthIndex)
    return formatNumber(despesasFixasPrevisto + despesasVariaveisPrevisto)
  }

  const calcularMedioFixoVariavelMes = (monthIndex: number) => {
    // Médio = Despesas Fixas (Média) + Despesas Variáveis (Médio)
    const despesasFixasMedia = calcularMediaFixedMes(monthIndex)
    const despesasVariaveisMedio = calcularMedioVariableMes(monthIndex)
    return formatNumber(despesasFixasMedia + despesasVariaveisMedio)
  }

  const calcularMaximoFixoVariavelMes = (monthIndex: number) => {
    // Máximo = Despesas Fixas (Máximo) + Despesas Variáveis (Máximo)
    const despesasFixasMaximo = calcularMaximoFixedMes(monthIndex)
    const despesasVariaveisMaximo = calcularMaximoVariableMes(monthIndex)
    return formatNumber(despesasFixasMaximo + despesasVariaveisMaximo)
  }

  // Funções específicas para investimentos (mesma lógica das despesas variáveis)
  const calcularPrevistoInvestimentoMes = (monthIndex: number) => {
    // Usa override manual se existir
    const override = data.investimentosPrevistoManual?.[monthIndex]
    if (override !== undefined && override !== null) return formatNumber(override)
    // Previsto = Investimentos (tabela principal) + Percentual Mínimo
    const investimentos = data.investimentos[monthIndex] || 0
    const percentualMinimo = data.growth?.minimo || 0
    return formatNumber(investimentos + (investimentos * percentualMinimo / 100))
  }

  const calcularMedioInvestimentoMes = (monthIndex: number) => {
    const override = data.investimentosMedioManual?.[monthIndex]
    if (override !== undefined && override !== null) return formatNumber(override)
    // Médio = Investimentos (tabela principal) + Percentual Médio
    const investimentos = data.investimentos[monthIndex] || 0
    const percentualMedio = data.growth?.medio || 0
    return formatNumber(investimentos + (investimentos * percentualMedio / 100))
  }

  const calcularMaximoInvestimentoMes = (monthIndex: number) => {
    const override = data.investimentosMaximoManual?.[monthIndex]
    if (override !== undefined && override !== null) return formatNumber(override)
    // Máximo = Investimentos (tabela principal) + Percentual Máximo
    const investimentos = data.investimentos[monthIndex] || 0
    const percentualMaximo = data.growth?.maximo || 0
    return formatNumber(investimentos + (investimentos * percentualMaximo / 100))
  }

  // Funções de cálculo para MKT baseadas na linha TOTAL da Composição MKT
  const calcularPrevistoMktMes = (monthIndex: number) => {
    // Previsto = Total da composição de MKT (sem percentual de crescimento)
    const totalMkt = (data.mktComponents?.trafego[monthIndex] || 0) + 
                    (data.mktComponents?.socialMedia[monthIndex] || 0) + 
                    (data.mktComponents?.producaoConteudo[monthIndex] || 0)
    return formatNumber(totalMkt)
  }

  const calcularMedioMktMes = (monthIndex: number) => {
    const totalMkt = (data.mktComponents?.trafego[monthIndex] || 0) + 
                    (data.mktComponents?.socialMedia[monthIndex] || 0) + 
                    (data.mktComponents?.producaoConteudo[monthIndex] || 0)
    const percentualMedio = data.growth?.medio || 0
    return formatNumber(totalMkt + (totalMkt * percentualMedio / 100))
  }

  const calcularMaximoMktMes = (monthIndex: number) => {
    const totalMkt = (data.mktComponents?.trafego[monthIndex] || 0) + 
                    (data.mktComponents?.socialMedia[monthIndex] || 0) + 
                    (data.mktComponents?.producaoConteudo[monthIndex] || 0)
    const percentualMaximo = data.growth?.maximo || 0
    return formatNumber(totalMkt + (totalMkt * percentualMaximo / 100))
  }

  // Funções de cálculo para Orçamento: (Despesas Fixas + Variáveis) + MKT + Investimentos
  const calcularPrevistoOrcamentoMes = (monthIndex: number) => {
    const despesasFixoVariavel = calcularPrevistoFixoVariavelMes(monthIndex)
    const mkt = calcularPrevistoMktMes(monthIndex)
    const investimentos = calcularPrevistoInvestimentoMes(monthIndex)
    const total = formatNumber(despesasFixoVariavel + mkt + investimentos)
    console.log(`Orçamento Mês ${monthIndex}: Despesas=${despesasFixoVariavel}, MKT=${mkt}, Investimentos=${investimentos}, Total=${total}`)
    return total
  }

  const calcularMedioOrcamentoMes = (monthIndex: number) => {
    const despesasFixoVariavel = calcularMedioFixoVariavelMes(monthIndex)
    const mkt = calcularMedioMktMes(monthIndex)
    const investimentos = calcularMedioInvestimentoMes(monthIndex)
    return formatNumber(despesasFixoVariavel + mkt + investimentos)
  }

  const calcularMaximoOrcamentoMes = (monthIndex: number) => {
    const despesasFixoVariavel = calcularMaximoFixoVariavelMes(monthIndex)
    const mkt = calcularMaximoMktMes(monthIndex)
    const investimentos = calcularMaximoInvestimentoMes(monthIndex)
    return formatNumber(despesasFixoVariavel + mkt + investimentos)
  }

  // Funções de cálculo para Resultado
  const calcularPrevistoResultadoMes = (monthIndex: number) => {
    // Resultado = Faturamento Total (Previsto) - Orçamento (Previsto)
    const faturamentoTotalPrevisto = calcularPrevistoTotalMes(monthIndex)
    const orcamentoPrevisto = calcularPrevistoOrcamentoMes(monthIndex)
    const resultado = formatNumber(faturamentoTotalPrevisto - orcamentoPrevisto)
    console.log(`Mês ${monthIndex}: Faturamento=${faturamentoTotalPrevisto}, Orçamento=${orcamentoPrevisto}, Resultado=${resultado}`)
    return resultado
  }

  const calcularMedioResultadoMes = (monthIndex: number) => {
    // Resultado = Faturamento Total (Médio) - Orçamento (Médio)
    const faturamentoTotalMedio = calcularMedioTotalMes(monthIndex)
    const orcamentoMedio = calcularMedioOrcamentoMes(monthIndex)
    return formatNumber(faturamentoTotalMedio - orcamentoMedio)
  }

  const calcularMaximoResultadoMes = (monthIndex: number) => {
    // Resultado = Faturamento Total (Máximo) - Orçamento (Máximo)
    const faturamentoTotalMaximo = calcularMaximoTotalMes(monthIndex)
    const orcamentoMaximo = calcularMaximoOrcamentoMes(monthIndex)
    return formatNumber(faturamentoTotalMaximo - orcamentoMaximo)
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
    const debounceTimerRef = useRef<number | undefined>(undefined)
    const isNegative = value < 0
    const textColor = isNegative ? 'text-red-600' : 'text-gray-900'
    
    // Verificar se foi editado manualmente
    const editKey = `${category}-${monthIndex}`
    const isManuallyEdited = manualEdits[editKey]
    
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

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const numericValue = parseFloat(e.target.value) || 0
      // debounce para evitar muitos PUTs enquanto digita
      if (debounceTimerRef.current) {
        window.clearTimeout(debounceTimerRef.current)
      }
      debounceTimerRef.current = window.setTimeout(() => {
        console.log('Autosave (debounce) com valor:', numericValue)
        onBlur(numericValue)
      }, 500)
    }
    
    return (
      <div className="relative">
      <input
        ref={inputRef}
        key={`${category}-${monthIndex}-${value}`}
        type="number"
        defaultValue={value || ''}
        onBlur={handleBlur}
          onChange={handleChange}
        onKeyDown={handleKeyDown}
          className={`w-full px-3 py-1 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${textColor} ${className} ${isManuallyEdited ? 'bg-yellow-50 border-yellow-300' : ''}`}
        placeholder="0,00"
      />
        {isManuallyEdited && (
          <div className="absolute -top-1 -right-1 w-2 h-2 bg-yellow-400 rounded-full" title="Editado manualmente - protegido de cálculos automáticos"></div>
        )}
      </div>
    )
  }

  const CalculatedCell: React.FC<{
    value: number
    className?: string
  }> = ({ value, className = '' }) => {
    const isNegative = value < 0
    const textColor = isNegative ? 'text-red-600' : 'text-gray-900'
    
    return (
      <div className={`px-3 py-1 text-sm font-semibold text-center ${textColor} ${className}`}>
        {formatCurrency(value)}
      </div>
    )
  }

  // Função para verificar sincronização entre banco e interface
  const verificarSincronizacao = async () => {
    try {
      console.log('🔍 INICIANDO VERIFICAÇÃO DE SINCRONIZAÇÃO...')
      
      // Carregar dados do banco
      const response = await fetch(`${API_BASE_URL}/projection`)
      if (!response.ok) {
        console.error('❌ Erro ao carregar dados do banco')
        return
      }
      
      const dadosBanco = await response.json()
      console.log('📊 DADOS DO BANCO:', dadosBanco)
      
      // Verificar cada categoria
      const verificacoes = {
        despesasVariaveis: verificarArray(dadosBanco.despesasVariaveis, data.despesasVariaveis, 'Despesas Variáveis'),
        despesasFixas: verificarArray(dadosBanco.despesasFixas, data.despesasFixas, 'Despesas Fixas'),
        investimentos: verificarArray(dadosBanco.investimentos, data.investimentos, 'Investimentos'),
        mkt: verificarArray(dadosBanco.mkt, data.mkt, 'MKT'),
        faturamentoReurb: verificarArray(dadosBanco.faturamentoReurb, data.faturamentoReurb, 'Faturamento REURB'),
        faturamentoGeo: verificarArray(dadosBanco.faturamentoGeo, data.faturamentoGeo, 'Faturamento GEO'),
        faturamentoPlan: verificarArray(dadosBanco.faturamentoPlan, data.faturamentoPlan, 'Faturamento PLAN'),
        faturamentoReg: verificarArray(dadosBanco.faturamentoReg, data.faturamentoReg, 'Faturamento REG'),
        faturamentoNn: verificarArray(dadosBanco.faturamentoNn, data.faturamentoNn, 'Faturamento NN'),
        growth: verificarGrowth(dadosBanco.growth, data.growth, 'Growth'),
        mktComponents: verificarMktComponents(dadosBanco.mktComponents, data.mktComponents, 'MKT Components')
      }
      
      // Verificar valores manuais
      const verificacoesManuais = {
        fixedPrevistoManual: verificarArray(dadosBanco.fixedPrevistoManual || [], data.fixedPrevistoManual || [], 'Fixed Previsto Manual'),
        variablePrevistoManual: verificarArray(dadosBanco.variablePrevistoManual || [], data.variablePrevistoManual || [], 'Variable Previsto Manual'),
        faturamentoNnPrevistoManual: verificarArray(dadosBanco.faturamentoNnPrevistoManual || [], data.faturamentoNnPrevistoManual || [], 'Faturamento NN Previsto Manual')
      }
      
      // Resumo final
      const totalVerificacoes = Object.values(verificacoes).length + Object.values(verificacoesManuais).length
      const verificacoesPassaram = Object.values(verificacoes).filter(v => v.sincronizado).length + 
                                 Object.values(verificacoesManuais).filter(v => v.sincronizado).length
      
      console.log('📋 RESUMO DA VERIFICAÇÃO:')
      console.log(`✅ Verificações que passaram: ${verificacoesPassaram}/${totalVerificacoes}`)
      console.log(`❌ Verificações que falharam: ${totalVerificacoes - verificacoesPassaram}/${totalVerificacoes}`)
      
      if (verificacoesPassaram === totalVerificacoes) {
        console.log('🎉 TODAS AS VERIFICAÇÕES PASSARAM! Os dados estão sincronizados.')
        alert('🎉 VERIFICAÇÃO CONCLUÍDA!\n\n✅ Todos os dados estão sincronizados entre banco e interface.')
      } else {
        console.log('⚠️ ALGUMAS VERIFICAÇÕES FALHARAM! Há discrepâncias entre banco e interface.')
        alert('⚠️ VERIFICAÇÃO CONCLUÍDA!\n\n❌ Algumas discrepâncias foram encontradas.\n\nVerifique o console para detalhes.')
      }
      
    } catch (error) {
      console.error('❌ Erro durante verificação:', error)
      alert('❌ ERRO!\n\nErro durante a verificação. Verifique o console para detalhes.')
    }
  }
  
  // Função auxiliar para verificar arrays
  const verificarArray = (banco: any[], dadosInterface: any[], nome: string) => {
    if (!banco || !dadosInterface) {
      console.log(`❌ ${nome}: Dados ausentes (banco: ${!!banco}, interface: ${!!dadosInterface})`)
      return { sincronizado: false, nome, detalhes: 'Dados ausentes' }
    }
    
    if (banco.length !== dadosInterface.length) {
      console.log(`❌ ${nome}: Tamanhos diferentes (banco: ${banco.length}, interface: ${dadosInterface.length})`)
      return { sincronizado: false, nome, detalhes: 'Tamanhos diferentes' }
    }
    
    const diferencas = []
    for (let i = 0; i < banco.length; i++) {
      if (banco[i] !== dadosInterface[i]) {
        diferencas.push({ indice: i, banco: banco[i], interface: dadosInterface[i] })
      }
    }
    
    if (diferencas.length > 0) {
      console.log(`❌ ${nome}: ${diferencas.length} diferenças encontradas:`, diferencas)
      return { sincronizado: false, nome, detalhes: `${diferencas.length} diferenças`, diferencas }
    } else {
      console.log(`✅ ${nome}: Sincronizado (${banco.length} valores)`)
      return { sincronizado: true, nome, detalhes: `${banco.length} valores sincronizados` }
    }
  }
  
  // Função auxiliar para verificar growth
  const verificarGrowth = (banco: any, dadosInterface: any, nome: string) => {
    if (!banco || !dadosInterface) {
      console.log(`❌ ${nome}: Dados ausentes`)
      return { sincronizado: false, nome, detalhes: 'Dados ausentes' }
    }
    
    const campos = ['minimo', 'medio', 'maximo']
    const diferencas = []
    
    for (const campo of campos) {
      if (banco[campo] !== dadosInterface[campo]) {
        diferencas.push({ campo, banco: banco[campo], interface: dadosInterface[campo] })
      }
    }
    
    if (diferencas.length > 0) {
      console.log(`❌ ${nome}: ${diferencas.length} diferenças encontradas:`, diferencas)
      return { sincronizado: false, nome, detalhes: `${diferencas.length} diferenças`, diferencas }
    } else {
      console.log(`✅ ${nome}: Sincronizado`)
      return { sincronizado: true, nome, detalhes: 'Sincronizado' }
    }
  }
  
  // Função auxiliar para verificar mktComponents
  const verificarMktComponents = (banco: any, dadosInterface: any, nome: string) => {
    if (!banco || !dadosInterface) {
      console.log(`❌ ${nome}: Dados ausentes`)
      return { sincronizado: false, nome, detalhes: 'Dados ausentes' }
    }
    
    const componentes = ['trafego', 'socialMedia', 'producaoConteudo']
    const diferencas = []
    
    for (const componente of componentes) {
      const verificacao = verificarArray(banco[componente], dadosInterface[componente], `${nome}.${componente}`)
      if (!verificacao.sincronizado) {
        diferencas.push({ componente, detalhes: verificacao.detalhes })
      }
    }
    
    if (diferencas.length > 0) {
      console.log(`❌ ${nome}: ${diferencas.length} componentes com diferenças:`, diferencas)
      return { sincronizado: false, nome, detalhes: `${diferencas.length} componentes com diferenças`, diferencas }
    } else {
      console.log(`✅ ${nome}: Sincronizado`)
      return { sincronizado: true, nome, detalhes: 'Sincronizado' }
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4">
        {/* Primeira linha: Título + Botões principais */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <h1 className="text-3xl font-bold flex items-center gap-3">
            <FaCalculator className="w-8 h-8 text-blue-600" />
            Projeção Anual
          </h1>
          <div className="flex items-center gap-4">
            <button
              onClick={resetarCalculos}
              className="flex items-center gap-3 px-6 py-3 bg-gradient-to-r from-blue-500 to-indigo-600 text-white font-semibold rounded-xl hover:from-blue-600 hover:to-indigo-700 shadow-lg hover:shadow-xl transform hover:-translate-y-1 transition-all duration-300"
              title="Resetar edições manuais e permitir cálculos automáticos"
            >
              <FaUndo className="h-5 w-5" />
              Resetar Cálculos
            </button>
            
            <button
              onClick={clearAllProjectionData}
              className="flex items-center gap-3 px-6 py-3 bg-gradient-to-r from-red-600 to-red-800 text-white font-semibold rounded-xl hover:from-red-700 hover:to-red-900 shadow-lg hover:shadow-xl transform hover:-translate-y-1 transition-all duration-300"
              title="⚠️ APAGAR TODOS os dados de projeção permanentemente"
              disabled={isSaving}
            >
              <FaTrash className="h-5 w-5" />
              {isSaving ? 'Limpando...' : 'Limpar Todos os Dados'}
            </button>
          </div>
        </div>
        
        {/* Segunda linha: Botões do superadmin */}
        {user?.username === 'superadmin' && (
          <div className="flex items-center gap-4 justify-end">
            <button
              onClick={verificarSincronizacao}
              className="flex items-center gap-3 px-6 py-3 bg-gradient-to-r from-purple-500 to-purple-600 text-white font-semibold rounded-xl hover:from-purple-600 hover:to-purple-700 shadow-lg hover:shadow-xl transform hover:-translate-y-1 transition-all duration-300"
              title="Verificar se os valores exibidos estão sincronizados com o banco de dados"
            >
              <FaSearch className="h-5 w-5" />
              Verificar Sincronização
            </button>

            <button
              onClick={preencherResultadoAnoAnterior}
              className="flex items-center gap-3 px-6 py-3 bg-gradient-to-r from-green-500 to-emerald-600 text-white font-semibold rounded-xl hover:from-green-600 hover:to-emerald-700 shadow-lg hover:shadow-xl transform hover:-translate-y-1 transition-all duration-300"
              title="Preencher tabela Resultado do Ano Anterior com valores crescentes"
            >
              <FaEdit className="h-5 w-5" />
              Preencher Resultado do Ano Anterior
            </button>

            <button
              onClick={preencherDeManieraManual}
              className="flex items-center gap-3 px-6 py-3 bg-gradient-to-r from-orange-500 to-yellow-600 text-white font-semibold rounded-xl hover:from-orange-600 hover:to-yellow-700 shadow-lg hover:shadow-xl transform hover:-translate-y-1 transition-all duration-300"
              title="Simular edições manuais multiplicando valores por 10"
            >
              <FaHandPointer className="h-5 w-5" />
              Preencher de Maneira Manual
            </button>
          </div>
        )}
      </div>

      {/* Frase informativa */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <p className="text-sm text-gray-600">Preencha apenas os valores mensais - os cálculos são automáticos</p>
          {isSaving && (
            <div className="flex items-center gap-2 text-sm text-blue-600">
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
              salvando
            </div>
          )}
        </div>
        
        {/* Switch Tabela/Gráfico */}
        <div className="flex items-center gap-3">
          <span className={`text-sm font-medium ${!isChartView ? 'text-blue-600' : 'text-gray-500'}`}>
            <FaTable className="inline mr-1" /> Tabelas
          </span>
          <button
            onClick={() => setIsChartView(!isChartView)}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${
              isChartView ? 'bg-blue-600' : 'bg-gray-300'
            }`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform duration-200 ease-in-out ${
                isChartView ? 'translate-x-6' : 'translate-x-1'
              }`}
            />
          </button>
          <span className={`text-sm font-medium ${isChartView ? 'text-blue-600' : 'text-gray-500'}`}>
            <FaChartBar className="inline mr-1" /> Gráficos
          </span>
        </div>
      </div>

      {/* Tabela/Gráfico RESULTADO - A mais importante - MOVIDA PARA O TOPO */}
      <div className="mb-8">
        {isChartView ? (
          <div className="flex justify-center">
            {createLineChart(resultadoData.previsto, resultadoData.medio, resultadoData.maximo, 'Resultado Financeiro')}
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl bg-gradient-to-br from-white to-blue-50 shadow-2xl border-2 border-blue-200">
          <table className="w-full border-collapse">
            <thead>
              <tr className="bg-gradient-to-r from-blue-600 via-blue-700 to-blue-800 text-white">
                <th className="px-6 py-4 text-left text-lg font-bold sticky left-0 z-10" style={{backgroundColor: '#355ee0'}}><FaBullseye className="inline mr-2" /> RESULTADO FINANCEIRO</th>
                <th className="px-4 py-4 text-center font-semibold">1º TRI</th>
                <th className="px-3 py-3 text-center font-semibold" style={{width: '100px', minWidth: '100px'}}>Janeiro</th>
                <th className="px-3 py-3 text-center font-semibold" style={{width: '100px', minWidth: '100px'}}>Fevereiro</th>
                <th className="px-3 py-3 text-center font-semibold" style={{width: '100px', minWidth: '100px'}}>Março</th>
                <th className="px-4 py-4 text-center font-semibold">2º TRI</th>
                <th className="px-3 py-3 text-center font-semibold" style={{width: '100px', minWidth: '100px'}}>Abril</th>
                <th className="px-3 py-3 text-center font-semibold" style={{width: '100px', minWidth: '100px'}}>Maio</th>
                <th className="px-3 py-3 text-center font-semibold" style={{width: '100px', minWidth: '100px'}}>Junho</th>
                <th className="px-4 py-4 text-center font-semibold">3º TRI</th>
                <th className="px-3 py-3 text-center font-semibold" style={{width: '100px', minWidth: '100px'}}>Julho</th>
                <th className="px-3 py-3 text-center font-semibold" style={{width: '100px', minWidth: '100px'}}>Agosto</th>
                <th className="px-3 py-3 text-center font-semibold" style={{width: '100px', minWidth: '100px'}}>Setembro</th>
                <th className="px-4 py-4 text-center font-semibold">4º TRI</th>
                <th className="px-3 py-3 text-center font-semibold" style={{width: '100px', minWidth: '100px'}}>Outubro</th>
                <th className="px-3 py-3 text-center font-semibold" style={{width: '100px', minWidth: '100px'}}>Novembro</th>
                <th className="px-3 py-3 text-center font-semibold" style={{width: '100px', minWidth: '100px'}}>Dezembro</th>
                <th className="px-4 py-4 text-center font-semibold">Total Geral</th>
                <th className="px-4 py-4 text-center font-semibold">Média</th>
              </tr>
            </thead>
            <tbody>
              {/* Linha Previsto */}
              <tr className="hover:bg-blue-50 transition-colors">
                <td className="px-6 py-4 text-gray-800 font-semibold sticky left-0 z-10" style={{backgroundColor: '#fbfdff'}}><FaChartBar className="inline mr-2" /> Cenário Previsto</td>
                <td className="px-3 py-3">
                  <CalculatedCell value={calcularTrimestre(0, 2, (i) => calcularPrevistoResultadoMes(i))} />
                </td>
                {meses.slice(0, 3).map((_, index) => (
                <td key={index} className="px-3 py-3" style={{width: '100px', minWidth: '100px'}}>
                  <CalculatedCell value={calcularPrevistoResultadoMes(index)} />
                </td>
                ))}
                <td className="px-3 py-3">
                  <CalculatedCell value={calcularTrimestre(3, 5, (i) => calcularPrevistoResultadoMes(i))} />
                </td>
                {meses.slice(3, 6).map((_, index) => (
                  <td key={index + 3} className="px-3 py-3" style={{width: '100px', minWidth: '100px'}}>
                    <CalculatedCell value={calcularPrevistoResultadoMes(index + 3)} />
                  </td>
                ))}
                <td className="px-3 py-3">
                  <CalculatedCell value={calcularTrimestre(6, 8, (i) => calcularPrevistoResultadoMes(i))} />
                </td>
                {meses.slice(6, 9).map((_, index) => (
                  <td key={index + 6} className="px-3 py-3" style={{width: '100px', minWidth: '100px'}}>
                    <CalculatedCell value={calcularPrevistoResultadoMes(index + 6)} />
                  </td>
                ))}
                <td className="px-3 py-3">
                  <CalculatedCell value={calcularTrimestre(9, 11, (i) => calcularPrevistoResultadoMes(i))} />
                </td>
                {meses.slice(9, 12).map((_, index) => (
                  <td key={index + 9} className="px-3 py-3" style={{width: '100px', minWidth: '100px'}}>
                    <CalculatedCell value={calcularPrevistoResultadoMes(index + 9)} />
                  </td>
                ))}
                <td className="px-3 py-3 font-semibold">
                  <CalculatedCell value={calcularTotalGeral((i) => calcularPrevistoResultadoMes(i))} />
                </td>
                <td className="px-3 py-3 font-semibold">
                  <CalculatedCell value={calcularMedia((i) => calcularPrevistoResultadoMes(i))} />
                </td>
              </tr>

              {/* Linha Médio */}
              <tr className="hover:bg-blue-50 transition-colors">
                <td className="px-6 py-4 text-gray-800 font-semibold sticky left-0 z-10" style={{backgroundColor: '#fbfdff'}}><FaChartLine className="inline mr-2" /> Cenário Médio</td>
                <td className="px-3 py-3">
                  <CalculatedCell value={calcularTrimestre(0, 2, (i) => calcularMedioResultadoMes(i))} />
                </td>
                {meses.slice(0, 3).map((_, index) => (
                  <td key={index} className="px-3 py-3" style={{width: '100px', minWidth: '100px'}}>
                    <CalculatedCell value={calcularMedioResultadoMes(index)} />
                  </td>
                ))}
                <td className="px-3 py-3">
                  <CalculatedCell value={calcularTrimestre(3, 5, (i) => calcularMedioResultadoMes(i))} />
                </td>
                {meses.slice(3, 6).map((_, index) => (
                  <td key={index + 3} className="px-3 py-3" style={{width: '100px', minWidth: '100px'}}>
                    <CalculatedCell value={calcularMedioResultadoMes(index + 3)} />
                  </td>
                ))}
                <td className="px-3 py-3">
                  <CalculatedCell value={calcularTrimestre(6, 8, (i) => calcularMedioResultadoMes(i))} />
                </td>
                {meses.slice(6, 9).map((_, index) => (
                  <td key={index + 6} className="px-3 py-3" style={{width: '100px', minWidth: '100px'}}>
                    <CalculatedCell value={calcularMedioResultadoMes(index + 6)} />
                  </td>
                ))}
                <td className="px-3 py-3">
                  <CalculatedCell value={calcularTrimestre(9, 11, (i) => calcularMedioResultadoMes(i))} />
                </td>
                {meses.slice(9, 12).map((_, index) => (
                  <td key={index + 9} className="px-3 py-3" style={{width: '100px', minWidth: '100px'}}>
                    <CalculatedCell value={calcularMedioResultadoMes(index + 9)} />
                  </td>
                ))}
                <td className="px-3 py-3 font-semibold">
                  <CalculatedCell value={calcularTotalGeral((i) => calcularMedioResultadoMes(i))} />
                </td>
                <td className="px-3 py-3 font-semibold">
                  <CalculatedCell value={calcularMedia((i) => calcularMedioResultadoMes(i))} />
                </td>
              </tr>

              {/* Linha Máximo */}
              <tr className="hover:bg-blue-50 transition-colors">
                <td className="px-6 py-4 text-gray-800 font-semibold sticky left-0 z-10" style={{backgroundColor: '#fbfdff'}}><FaRocket className="inline mr-2" /> Cenário Máximo</td>
                <td className="px-3 py-3">
                  <CalculatedCell value={calcularTrimestre(0, 2, (i) => calcularMaximoResultadoMes(i))} />
                </td>
                {meses.slice(0, 3).map((_, index) => (
                  <td key={index} className="px-3 py-3" style={{width: '100px', minWidth: '100px'}}>
                    <CalculatedCell value={calcularMaximoResultadoMes(index)} />
                  </td>
                ))}
                <td className="px-3 py-3">
                  <CalculatedCell value={calcularTrimestre(3, 5, (i) => calcularMaximoResultadoMes(i))} />
                </td>
                {meses.slice(3, 6).map((_, index) => (
                  <td key={index + 3} className="px-3 py-3" style={{width: '100px', minWidth: '100px'}}>
                    <CalculatedCell value={calcularMaximoResultadoMes(index + 3)} />
                  </td>
                ))}
                <td className="px-3 py-3">
                  <CalculatedCell value={calcularTrimestre(6, 8, (i) => calcularMaximoResultadoMes(i))} />
                </td>
                {meses.slice(6, 9).map((_, index) => (
                  <td key={index + 6} className="px-3 py-3" style={{width: '100px', minWidth: '100px'}}>
                    <CalculatedCell value={calcularMaximoResultadoMes(index + 6)} />
                  </td>
                ))}
                <td className="px-3 py-3">
                  <CalculatedCell value={calcularTrimestre(9, 11, (i) => calcularMaximoResultadoMes(i))} />
                </td>
                {meses.slice(9, 12).map((_, index) => (
                  <td key={index + 9} className="px-3 py-3" style={{width: '100px', minWidth: '100px'}}>
                    <CalculatedCell value={calcularMaximoResultadoMes(index + 9)} />
                  </td>
                ))}
                <td className="px-3 py-3 font-semibold">
                  <CalculatedCell value={calcularTotalGeral((i) => calcularMaximoResultadoMes(i))} />
                </td>
                <td className="px-3 py-3 font-semibold">
                  <CalculatedCell value={calcularMedia((i) => calcularMaximoResultadoMes(i))} />
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        )}
      </div>

      {/* Legenda Resultado Financeiro */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <h3 className="font-semibold text-blue-800 mb-2">Legenda Resultado Financeiro:</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-blue-700">
          <div>
            <p><span className="font-semibold">Campos calculados:</span> Não editável, cálculo automático</p>
            <p><span className="font-semibold">Fórmula:</span> Faturamento Total - Orçamento</p>
          </div>
          <div>
            <p><span className="font-semibold">Função:</span> Resultado líquido (lucro/prejuízo)</p>
            <p><span className="font-semibold">Cores:</span> Verde para positivo, vermelho para negativo</p>
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
                <th className="px-4 py-3 text-left font-bold sticky left-0 z-10 bg-gray-800">RESULTADO DO ANO ANTERIOR</th>
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
                <td className="px-4 py-3 font-semibold text-gray-800 sticky left-0 z-10 bg-gray-100">Despesas Totais</td>
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
                <td className="px-4 py-3 text-gray-700 sticky left-0 z-10 bg-white">Despesas Variáveis</td>
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
                <td className="px-4 py-3 text-gray-700 sticky left-0 z-10 bg-white">Despesas Fixas</td>
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
                <td className="px-4 py-3 text-gray-700 sticky left-0 z-10 bg-white">Investimentos</td>
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
                <td className="px-4 py-3 text-gray-700 sticky left-0 z-10 bg-white">Mkt</td>
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
                <td className="px-4 py-3 font-semibold text-gray-800 sticky left-0 z-10 bg-blue-50">Faturamento Total</td>
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
                <td className="px-4 py-3 text-gray-700 sticky left-0 z-10 bg-white">Faturamento REURB</td>
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
                <td className="px-4 py-3 text-gray-700 sticky left-0 z-10 bg-white">Faturamento GEO</td>
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
                <td className="px-4 py-3 text-gray-700 sticky left-0 z-10 bg-white">Faturamento PLAN</td>
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
                <td className="px-4 py-3 text-gray-700 sticky left-0 z-10 bg-white">Faturamento REG</td>
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
                <td className="px-4 py-3 text-gray-700 sticky left-0 z-10 bg-white">Faturamento NN</td>
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
                <td className="px-4 py-3 font-bold sticky left-0 z-10 bg-gray-800">Resultado</td>
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
                  <th className="px-4 py-3 text-left font-bold sticky left-0 z-10 bg-gray-800">PERCENTUAL DE CRESCIMENTO ANUAL</th>
                  <th className="px-4 py-3 text-center font-bold">%</th>
                </tr>
              </thead>
              <tbody className="bg-blue-50 divide-y divide-blue-100">
                <tr>
                  <td className="px-4 py-3 text-gray-700 sticky left-0 z-10 bg-white">Mínimo</td>
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
                  <td className="px-4 py-3 text-gray-700 sticky left-0 z-10 bg-white">Médio</td>
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
                  <td className="px-4 py-3 text-gray-700 sticky left-0 z-10 bg-white">Máximo</td>
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

      {/* Legenda Percentual de Crescimento Anual */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <h3 className="font-semibold text-blue-800 mb-2">Legenda Percentual de Crescimento Anual:</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-blue-700">
          <div>
            <p><span className="font-semibold">Campos editáveis:</span> Mínimo, Médio e Máximo</p>
            <p><span className="font-semibold">Função:</span> Define percentuais de crescimento para cálculos automáticos</p>
          </div>
          <div>
            <p><span className="font-semibold">Uso:</span> Utilizado pelas tabelas de Despesas Variáveis, Investimentos e Faturamentos</p>
            <p><span className="font-semibold">Cálculo:</span> Valor base + (Valor base × Percentual ÷ 100)</p>
          </div>
        </div>
      </div>

      {/* Composição MKT */}
      {!isLoading && (
        <div className="bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1200px]">
              <thead className="bg-blue-700 text-white">
                <tr>
                  <th className="px-4 py-3 text-left font-bold sticky left-0 z-10 bg-blue-700">Composição MKT</th>
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
                    <td className="px-4 py-3 text-gray-700 sticky left-0 z-10 bg-white">{row.label}</td>
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
                  <td className="px-4 py-3 font-semibold text-gray-800 sticky left-0 z-10 bg-gray-100">TOTAL</td>
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

      {/* Tabela MKT */}
      <div className="bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1200px]">
            <thead className="bg-orange-700 text-white">
              <tr>
                <th className="px-4 py-3 text-left font-bold sticky left-0 z-10 bg-orange-700">MKT</th>
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
                <th className="px-3 py-3 text-center font-bold">TOTAL GERAL</th>
                <th className="px-3 py-3 text-center font-bold">MÉDIA</th>
              </tr>
            </thead>
            <tbody>
              {/* Linha Previsto */}
              <tr>
                <td className="px-4 py-3 text-gray-700 sticky left-0 z-10 bg-white">Previsto</td>
                <td className="px-3 py-2">
                  <CalculatedCell value={calcularTrimestre(0, 2, (i) => calcularPrevistoMktMes(i))} />
                </td>
                {meses.slice(0, 3).map((_, index) => (
                  <td key={index} className="px-3 py-2" style={{width: '100px', minWidth: '100px'}}>
                    <CalculatedCell value={calcularPrevistoMktMes(index)} />
                  </td>
                ))}
                <td className="px-3 py-2">
                  <CalculatedCell value={calcularTrimestre(3, 5, (i) => calcularPrevistoMktMes(i))} />
                </td>
                {meses.slice(3, 6).map((_, index) => (
                  <td key={index + 3} className="px-3 py-2" style={{width: '100px', minWidth: '100px'}}>
                    <CalculatedCell value={calcularPrevistoMktMes(index + 3)} />
                  </td>
                ))}
                <td className="px-3 py-2">
                  <CalculatedCell value={calcularTrimestre(6, 8, (i) => calcularPrevistoMktMes(i))} />
                </td>
                {meses.slice(6, 9).map((_, index) => (
                  <td key={index + 6} className="px-3 py-2" style={{width: '100px', minWidth: '100px'}}>
                    <CalculatedCell value={calcularPrevistoMktMes(index + 6)} />
                  </td>
                ))}
                <td className="px-3 py-2">
                  <CalculatedCell value={calcularTrimestre(9, 11, (i) => calcularPrevistoMktMes(i))} />
                </td>
                {meses.slice(9, 12).map((_, index) => (
                  <td key={index + 9} className="px-3 py-2" style={{width: '100px', minWidth: '100px'}}>
                    <CalculatedCell value={calcularPrevistoMktMes(index + 9)} />
                  </td>
                ))}
                <td className="px-3 py-2">
                  <CalculatedCell value={calcularTotalGeral((i) => calcularPrevistoMktMes(i))} />
                </td>
                <td className="px-3 py-2">
                  <CalculatedCell value={calcularMedia((i) => calcularPrevistoMktMes(i))} />
                </td>
              </tr>

              {/* Linha Médio */}
              <tr>
                <td className="px-4 py-3 text-gray-700 sticky left-0 z-10 bg-white">Médio</td>
                <td className="px-3 py-2">
                  <CalculatedCell value={calcularTrimestre(0, 2, (i) => calcularMedioMktMes(i))} />
                </td>
                {meses.slice(0, 3).map((_, index) => (
                  <td key={index} className="px-3 py-2" style={{width: '100px', minWidth: '100px'}}>
                    <CalculatedCell value={calcularMedioMktMes(index)} />
                  </td>
                ))}
                <td className="px-3 py-2">
                  <CalculatedCell value={calcularTrimestre(3, 5, (i) => calcularMedioMktMes(i))} />
                </td>
                {meses.slice(3, 6).map((_, index) => (
                  <td key={index + 3} className="px-3 py-2" style={{width: '100px', minWidth: '100px'}}>
                    <CalculatedCell value={calcularMedioMktMes(index + 3)} />
                  </td>
                ))}
                <td className="px-3 py-2">
                  <CalculatedCell value={calcularTrimestre(6, 8, (i) => calcularMedioMktMes(i))} />
                </td>
                {meses.slice(6, 9).map((_, index) => (
                  <td key={index + 6} className="px-3 py-2" style={{width: '100px', minWidth: '100px'}}>
                    <CalculatedCell value={calcularMedioMktMes(index + 6)} />
                  </td>
                ))}
                <td className="px-3 py-2">
                  <CalculatedCell value={calcularTrimestre(9, 11, (i) => calcularMedioMktMes(i))} />
                </td>
                {meses.slice(9, 12).map((_, index) => (
                  <td key={index + 9} className="px-3 py-2" style={{width: '100px', minWidth: '100px'}}>
                    <CalculatedCell value={calcularMedioMktMes(index + 9)} />
                  </td>
                ))}
                <td className="px-3 py-2">
                  <CalculatedCell value={calcularTotalGeral((i) => calcularMedioMktMes(i))} />
                </td>
                <td className="px-3 py-2">
                  <CalculatedCell value={calcularMedia((i) => calcularMedioMktMes(i))} />
                </td>
              </tr>

              {/* Linha Máximo */}
              <tr>
                <td className="px-4 py-3 text-gray-700 sticky left-0 z-10 bg-white">Máximo</td>
                <td className="px-3 py-2">
                  <CalculatedCell value={calcularTrimestre(0, 2, (i) => calcularMaximoMktMes(i))} />
                </td>
                {meses.slice(0, 3).map((_, index) => (
                  <td key={index} className="px-3 py-2" style={{width: '100px', minWidth: '100px'}}>
                    <CalculatedCell value={calcularMaximoMktMes(index)} />
                  </td>
                ))}
                <td className="px-3 py-2">
                  <CalculatedCell value={calcularTrimestre(3, 5, (i) => calcularMaximoMktMes(i))} />
                </td>
                {meses.slice(3, 6).map((_, index) => (
                  <td key={index + 3} className="px-3 py-2" style={{width: '100px', minWidth: '100px'}}>
                    <CalculatedCell value={calcularMaximoMktMes(index + 3)} />
                  </td>
                ))}
                <td className="px-3 py-2">
                  <CalculatedCell value={calcularTrimestre(6, 8, (i) => calcularMaximoMktMes(i))} />
                </td>
                {meses.slice(6, 9).map((_, index) => (
                  <td key={index + 6} className="px-3 py-2" style={{width: '100px', minWidth: '100px'}}>
                    <CalculatedCell value={calcularMaximoMktMes(index + 6)} />
                  </td>
                ))}
                <td className="px-3 py-2">
                  <CalculatedCell value={calcularTrimestre(9, 11, (i) => calcularMaximoMktMes(i))} />
                </td>
                {meses.slice(9, 12).map((_, index) => (
                  <td key={index + 9} className="px-3 py-2" style={{width: '100px', minWidth: '100px'}}>
                    <CalculatedCell value={calcularMaximoMktMes(index + 9)} />
                  </td>
                ))}
                <td className="px-3 py-2">
                  <CalculatedCell value={calcularTotalGeral((i) => calcularMaximoMktMes(i))} />
                </td>
                <td className="px-3 py-2">
                  <CalculatedCell value={calcularMedia((i) => calcularMaximoMktMes(i))} />
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Legenda MKT */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <h3 className="font-semibold text-blue-800 mb-2">Legenda MKT:</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-blue-700">
          <div>
            <p><span className="font-semibold">Campos calculados:</span> Não editável, soma automática</p>
            <p><span className="font-semibold">Fonte:</span> Linha "TOTAL" da tabela Composição MKT</p>
          </div>
          <div>
            <p><span className="font-semibold">Componentes:</span> Tráfego + Social Media + Produção Conteúdo</p>
            <p><span className="font-semibold">Uso:</span> Componente do cálculo do Orçamento</p>
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
                  <th className="px-4 py-3 text-left font-bold sticky left-0 z-10 bg-blue-700">DESPESAS Fixas</th>
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
                  <td className="px-4 py-3 text-gray-700 sticky left-0 z-10 bg-white">Previsto</td>
                  <td className="px-3 py-2">
                    <CalculatedCell value={calcularTrimestre(0, 2, (i) => calcularPrevistoFixedMes(i))} />
                  </td>
                  {meses.slice(0, 3).map((_, index) => (
                    <td key={index} className="px-3 py-2" style={{width: '100px', minWidth: '100px'}}>
                      <InputCell
                        value={calcularPrevistoFixedMes(index)}
                        onBlur={(value) => {
                          // Salvar em projection.json (para compatibilidade)
                          const arr = (data.fixedPrevistoManual && data.fixedPrevistoManual.length === 12) ? [...data.fixedPrevistoManual] : new Array(12).fill(null)
                          arr[index] = value
                          const updated = { ...data, fixedPrevistoManual: arr }
                          setData(updated)
                          if (token) saveToServer(updated)
                          
                          // Salvar em fixedExpenses.json (para metas)
                          const novosDados = {
                            ...fixedExpensesData,
                            previsto: [...fixedExpensesData.previsto]
                          }
                          novosDados.previsto[index] = value
                          setFixedExpensesData(novosDados)
                          if (token) {
                            saveFixedExpensesToServer(novosDados)
                          }
                        }}
                        category="previsto-fixed"
                        monthIndex={index}
                      />
                    </td>
                  ))}
                  <td className="px-3 py-2">
                    <CalculatedCell value={calcularTrimestre(3, 5, (i) => calcularPrevistoFixedMes(i))} />
                  </td>
                  {meses.slice(3, 6).map((_, index) => (
                    <td key={index + 3} className="px-3 py-2" style={{width: '100px', minWidth: '100px'}}>
                      <InputCell
                        value={calcularPrevistoFixedMes(index + 3)}
                        onBlur={(value) => {
                          // Salvar em projection.json (para compatibilidade)
                          const arr = (data.fixedPrevistoManual && data.fixedPrevistoManual.length === 12) ? [...data.fixedPrevistoManual] : new Array(12).fill(null)
                          arr[index + 3] = value
                          const updated = { ...data, fixedPrevistoManual: arr }
                          setData(updated)
                          if (token) saveToServer(updated)
                          
                          // Salvar em fixedExpenses.json (para metas)
                          const novosDados = {
                            ...fixedExpensesData,
                            previsto: [...fixedExpensesData.previsto]
                          }
                          novosDados.previsto[index + 3] = value
                          setFixedExpensesData(novosDados)
                          if (token) {
                            saveFixedExpensesToServer(novosDados)
                          }
                        }}
                        category="previsto-fixed"
                        monthIndex={index + 3}
                      />
                    </td>
                  ))}
                  <td className="px-3 py-2">
                    <CalculatedCell value={calcularTrimestre(6, 8, (i) => calcularPrevistoFixedMes(i))} />
                  </td>
                  {meses.slice(6, 9).map((_, index) => (
                    <td key={index + 6} className="px-3 py-2" style={{width: '100px', minWidth: '100px'}}>
                      <InputCell
                        value={calcularPrevistoFixedMes(index + 6)}
                        onBlur={(value) => {
                          // Salvar em projection.json (para compatibilidade)
                          const arr = (data.fixedPrevistoManual && data.fixedPrevistoManual.length === 12) ? [...data.fixedPrevistoManual] : new Array(12).fill(null)
                          arr[index + 6] = value
                          const updated = { ...data, fixedPrevistoManual: arr }
                          setData(updated)
                          if (token) saveToServer(updated)
                          
                          // Salvar em fixedExpenses.json (para metas)
                          const novosDados = {
                            ...fixedExpensesData,
                            previsto: [...fixedExpensesData.previsto]
                          }
                          novosDados.previsto[index + 6] = value
                          setFixedExpensesData(novosDados)
                          if (token) {
                            saveFixedExpensesToServer(novosDados)
                          }
                        }}
                        category="previsto-fixed"
                        monthIndex={index + 6}
                      />
                    </td>
                  ))}
                  <td className="px-3 py-2">
                    <CalculatedCell value={calcularTrimestre(9, 11, (i) => calcularPrevistoFixedMes(i))} />
                  </td>
                  {meses.slice(9, 12).map((_, index) => (
                    <td key={index + 9} className="px-3 py-2" style={{width: '100px', minWidth: '100px'}}>
                      <InputCell
                        value={calcularPrevistoFixedMes(index + 9)}
                        onBlur={(value) => {
                          // Salvar em projection.json (para compatibilidade)
                          const arr = (data.fixedPrevistoManual && data.fixedPrevistoManual.length === 12) ? [...data.fixedPrevistoManual] : new Array(12).fill(null)
                          arr[index + 9] = value
                          const updated = { ...data, fixedPrevistoManual: arr }
                          setData(updated)
                          if (token) saveToServer(updated)
                          
                          // Salvar em fixedExpenses.json (para metas)
                          const novosDados = {
                            ...fixedExpensesData,
                            previsto: [...fixedExpensesData.previsto]
                          }
                          novosDados.previsto[index + 9] = value
                          setFixedExpensesData(novosDados)
                          if (token) {
                            saveFixedExpensesToServer(novosDados)
                          }
                        }}
                        category="previsto-fixed"
                        monthIndex={index + 9}
                      />
                    </td>
                  ))}
                  <td className="px-3 py-2">
                    <CalculatedCell value={calcularTotalGeral((i) => calcularPrevistoFixedMes(i))} />
                  </td>
                  <td className="px-3 py-2">
                    <CalculatedCell value={calcularMedia((i) => calcularPrevistoFixedMes(i))} />
                  </td>
                </tr>

                {/* Linha Média */}
                <tr>
                  <td className="px-4 py-3 text-gray-700 sticky left-0 z-10 bg-white">Média</td>
                  <td className="px-3 py-2">
                    <CalculatedCell value={calcularTrimestre(0, 2, (i) => calcularMediaFixedMes(i))} />
                  </td>
                  {meses.slice(0, 3).map((_, index) => (
                    <td key={index} className="px-3 py-2" style={{width: '100px', minWidth: '100px'}}>
                      <InputCell
                        value={calcularMediaFixedMes(index)}
                        onBlur={(value) => {
                          const arr = (data.fixedMediaManual && data.fixedMediaManual.length === 12) ? [...data.fixedMediaManual] : new Array(12).fill(null)
                          arr[index] = value
                          const updated = { ...data, fixedMediaManual: arr }
                          setData(updated)
                          if (token) saveToServer(updated)
                        }}
                        category="media-fixed"
                        monthIndex={index}
                      />
                    </td>
                  ))}
                  <td className="px-3 py-2">
                    <CalculatedCell value={calcularTrimestre(3, 5, (i) => calcularMediaFixedMes(i))} />
                  </td>
                  {meses.slice(3, 6).map((_, index) => (
                    <td key={index + 3} className="px-3 py-2" style={{width: '100px', minWidth: '100px'}}>
                      <InputCell
                        value={calcularMediaFixedMes(index + 3)}
                        onBlur={(value) => {
                          const arr = (data.fixedMediaManual && data.fixedMediaManual.length === 12) ? [...data.fixedMediaManual] : new Array(12).fill(null)
                          arr[index + 3] = value
                          const updated = { ...data, fixedMediaManual: arr }
                          setData(updated)
                          if (token) saveToServer(updated)
                        }}
                        category="media-fixed"
                        monthIndex={index + 3}
                      />
                    </td>
                  ))}
                  <td className="px-3 py-2">
                    <CalculatedCell value={calcularTrimestre(6, 8, (i) => calcularMediaFixedMes(i))} />
                  </td>
                  {meses.slice(6, 9).map((_, index) => (
                    <td key={index + 6} className="px-3 py-2" style={{width: '100px', minWidth: '100px'}}>
                      <InputCell
                        value={calcularMediaFixedMes(index + 6)}
                        onBlur={(value) => {
                          const arr = (data.fixedMediaManual && data.fixedMediaManual.length === 12) ? [...data.fixedMediaManual] : new Array(12).fill(null)
                          arr[index + 6] = value
                          const updated = { ...data, fixedMediaManual: arr }
                          setData(updated)
                          if (token) saveToServer(updated)
                        }}
                        category="media-fixed"
                        monthIndex={index + 6}
                      />
                    </td>
                  ))}
                  <td className="px-3 py-2">
                    <CalculatedCell value={calcularTrimestre(9, 11, (i) => calcularMediaFixedMes(i))} />
                  </td>
                  {meses.slice(9, 12).map((_, index) => (
                    <td key={index + 9} className="px-3 py-2" style={{width: '100px', minWidth: '100px'}}>
                      <InputCell
                        value={calcularMediaFixedMes(index + 9)}
                        onBlur={(value) => {
                          const arr = (data.fixedMediaManual && data.fixedMediaManual.length === 12) ? [...data.fixedMediaManual] : new Array(12).fill(null)
                          arr[index + 9] = value
                          const updated = { ...data, fixedMediaManual: arr }
                          setData(updated)
                          if (token) saveToServer(updated)
                        }}
                        category="media-fixed"
                        monthIndex={index + 9}
                      />
                    </td>
                  ))}
                  <td className="px-3 py-2">
                    <CalculatedCell value={calcularTotalGeral((i) => calcularMediaFixedMes(i))} />
                  </td>
                  <td className="px-3 py-2">
                    <CalculatedCell value={calcularMedia((i) => calcularMediaFixedMes(i))} />
                  </td>
                </tr>

                {/* Linha Máximo */}
                <tr>
                  <td className="px-4 py-3 text-gray-700 sticky left-0 z-10 bg-white">Máximo</td>
                  <td className="px-3 py-2">
                    <CalculatedCell value={calcularTrimestre(0, 2, (i) => calcularMaximoFixedMes(i))} />
                  </td>
                  {meses.slice(0, 3).map((_, index) => (
                    <td key={index} className="px-3 py-2" style={{width: '100px', minWidth: '100px'}}>
                      <InputCell
                        value={calcularMaximoFixedMes(index)}
                        onBlur={(value) => {
                          const arr = (data.fixedMaximoManual && data.fixedMaximoManual.length === 12) ? [...data.fixedMaximoManual] : new Array(12).fill(null)
                          arr[index] = value
                          const updated = { ...data, fixedMaximoManual: arr }
                          setData(updated)
                          if (token) saveToServer(updated)
                        }}
                        category="maximo-fixed"
                        monthIndex={index}
                      />
                    </td>
                  ))}
                  <td className="px-3 py-2">
                    <CalculatedCell value={calcularTrimestre(3, 5, (i) => calcularMaximoFixedMes(i))} />
                  </td>
                  {meses.slice(3, 6).map((_, index) => (
                    <td key={index + 3} className="px-3 py-2" style={{width: '100px', minWidth: '100px'}}>
                      <InputCell
                        value={calcularMaximoFixedMes(index + 3)}
                        onBlur={(value) => {
                          const arr = (data.fixedMaximoManual && data.fixedMaximoManual.length === 12) ? [...data.fixedMaximoManual] : new Array(12).fill(null)
                          arr[index + 3] = value
                          const updated = { ...data, fixedMaximoManual: arr }
                          setData(updated)
                          if (token) saveToServer(updated)
                        }}
                        category="maximo-fixed"
                        monthIndex={index + 3}
                      />
                    </td>
                  ))}
                  <td className="px-3 py-2">
                    <CalculatedCell value={calcularTrimestre(6, 8, (i) => calcularMaximoFixedMes(i))} />
                  </td>
                  {meses.slice(6, 9).map((_, index) => (
                    <td key={index + 6} className="px-3 py-2" style={{width: '100px', minWidth: '100px'}}>
                      <InputCell
                        value={calcularMaximoFixedMes(index + 6)}
                        onBlur={(value) => {
                          const arr = (data.fixedMaximoManual && data.fixedMaximoManual.length === 12) ? [...data.fixedMaximoManual] : new Array(12).fill(null)
                          arr[index + 6] = value
                          const updated = { ...data, fixedMaximoManual: arr }
                          setData(updated)
                          if (token) saveToServer(updated)
                        }}
                        category="maximo-fixed"
                        monthIndex={index + 6}
                      />
                    </td>
                  ))}
                  <td className="px-3 py-2">
                    <CalculatedCell value={calcularTrimestre(9, 11, (i) => calcularMaximoFixedMes(i))} />
                  </td>
                  {meses.slice(9, 12).map((_, index) => (
                    <td key={index + 9} className="px-3 py-2" style={{width: '100px', minWidth: '100px'}}>
                      <InputCell
                        value={calcularMaximoFixedMes(index + 9)}
                        onBlur={(value) => {
                          const arr = (data.fixedMaximoManual && data.fixedMaximoManual.length === 12) ? [...data.fixedMaximoManual] : new Array(12).fill(null)
                          arr[index + 9] = value
                          const updated = { ...data, fixedMaximoManual: arr }
                          setData(updated)
                          if (token) saveToServer(updated)
                        }}
                        category="maximo-fixed"
                        monthIndex={index + 9}
                      />
                    </td>
                  ))}
                  <td className="px-3 py-2">
                    <CalculatedCell value={calcularTotalGeral((i) => calcularMaximoFixedMes(i))} />
                  </td>
                  <td className="px-3 py-2">
                    <CalculatedCell value={calcularMedia((i) => calcularMaximoFixedMes(i))} />
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Legenda Despesas Fixas */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <h3 className="font-semibold text-blue-800 mb-2">Legenda Despesas Fixas:</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-blue-700">
          <div>
            <p><span className="font-semibold">Campos editáveis:</span> Apenas linha "Previsto"</p>
            <p><span className="font-semibold">Campos calculados:</span> Média (+10%) e Máximo (+10%)</p>
          </div>
          <div>
            <p><span className="font-semibold">Lógica:</span> Janeiro = Dezembro anterior + 10%</p>
            <p><span className="font-semibold">Cópia:</span> Fev/Mar copiam Jan, Mai/Jun copiam Abr, etc.</p>
          </div>
        </div>
      </div>

      {/* Despesas Variáveis */}
      {!isLoading && (
        <div className="bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1200px]">
              <thead className="bg-blue-700 text-white">
                <tr>
                  <th className="px-4 py-3 text-left font-bold sticky left-0 z-10 bg-blue-700">DESPESAS Variáveis</th>
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
                  <td className="px-4 py-3 text-gray-700 sticky left-0 z-10 bg-white">Previsto</td>
                  <td className="px-3 py-2">
                    <CalculatedCell value={calcularTrimestre(0, 2, (i) => calcularPrevistoVariableMes(i))} />
                  </td>
                  {meses.slice(0, 3).map((_, index) => (
                    <td key={index} className="px-3 py-2" style={{width: '100px', minWidth: '100px'}}>
                      <InputCell
                        value={calcularPrevistoVariableMes(index)}
                        onBlur={(value) => {
                          const arr = (data.variablePrevistoManual && data.variablePrevistoManual.length === 12) ? [...data.variablePrevistoManual] : new Array(12).fill(null)
                          arr[index] = value
                          const updated = { ...data, variablePrevistoManual: arr }
                          setData(updated)
                          if (token) saveToServer(updated)
                        }}
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
                        onBlur={(value) => {
                          const arr = (data.variablePrevistoManual && data.variablePrevistoManual.length === 12) ? [...data.variablePrevistoManual] : new Array(12).fill(null)
                          arr[index + 3] = value
                          const updated = { ...data, variablePrevistoManual: arr }
                          setData(updated)
                          if (token) saveToServer(updated)
                        }}
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
                        onBlur={(value) => {
                          const arr = (data.variablePrevistoManual && data.variablePrevistoManual.length === 12) ? [...data.variablePrevistoManual] : new Array(12).fill(null)
                          arr[index + 6] = value
                          const updated = { ...data, variablePrevistoManual: arr }
                          setData(updated)
                          if (token) saveToServer(updated)
                        }}
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
                        onBlur={(value) => {
                          const arr = (data.variablePrevistoManual && data.variablePrevistoManual.length === 12) ? [...data.variablePrevistoManual] : new Array(12).fill(null)
                          arr[index + 9] = value
                          const updated = { ...data, variablePrevistoManual: arr }
                          setData(updated)
                          if (token) saveToServer(updated)
                        }}
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
                  <td className="px-4 py-3 text-gray-700 sticky left-0 z-10 bg-white">Médio</td>
                  <td className="px-3 py-2">
                    <CalculatedCell value={calcularTrimestre(0, 2, (i) => calcularMedioVariableMes(i))} />
                  </td>
                  {meses.slice(0, 3).map((_, index) => (
                    <td key={index} className="px-3 py-2" style={{width: '100px', minWidth: '100px'}}>
                      <InputCell
                        value={calcularMedioVariableMes(index)}
                        onBlur={(value) => {
                          const arr = (data.variableMedioManual && data.variableMedioManual.length === 12) ? [...data.variableMedioManual] : new Array(12).fill(null)
                          arr[index] = value
                          const updated = { ...data, variableMedioManual: arr }
                          setData(updated)
                          if (token) saveToServer(updated)
                        }}
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
                        onBlur={(value) => {
                          const arr = (data.variableMedioManual && data.variableMedioManual.length === 12) ? [...data.variableMedioManual] : new Array(12).fill(null)
                          arr[index + 3] = value
                          const updated = { ...data, variableMedioManual: arr }
                          setData(updated)
                          if (token) saveToServer(updated)
                        }}
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
                        onBlur={(value) => {
                          const arr = (data.variableMedioManual && data.variableMedioManual.length === 12) ? [...data.variableMedioManual] : new Array(12).fill(null)
                          arr[index + 6] = value
                          const updated = { ...data, variableMedioManual: arr }
                          setData(updated)
                          if (token) saveToServer(updated)
                        }}
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
                        onBlur={(value) => {
                          const arr = (data.variableMedioManual && data.variableMedioManual.length === 12) ? [...data.variableMedioManual] : new Array(12).fill(null)
                          arr[index + 9] = value
                          const updated = { ...data, variableMedioManual: arr }
                          setData(updated)
                          if (token) saveToServer(updated)
                        }}
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
                  <td className="px-4 py-3 text-gray-700 sticky left-0 z-10 bg-white">Máximo</td>
                  <td className="px-3 py-2">
                    <CalculatedCell value={calcularTrimestre(0, 2, (i) => calcularMaximoVariableMes(i))} />
                  </td>
                  {meses.slice(0, 3).map((_, index) => (
                    <td key={index} className="px-3 py-2" style={{width: '100px', minWidth: '100px'}}>
                      <InputCell
                        value={calcularMaximoVariableMes(index)}
                        onBlur={(value) => {
                          const arr = (data.variableMaximoManual && data.variableMaximoManual.length === 12) ? [...data.variableMaximoManual] : new Array(12).fill(null)
                          arr[index] = value
                          const updated = { ...data, variableMaximoManual: arr }
                          setData(updated)
                          if (token) saveToServer(updated)
                        }}
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
                        onBlur={(value) => {
                          const arr = (data.variableMaximoManual && data.variableMaximoManual.length === 12) ? [...data.variableMaximoManual] : new Array(12).fill(null)
                          arr[index + 3] = value
                          const updated = { ...data, variableMaximoManual: arr }
                          setData(updated)
                          if (token) saveToServer(updated)
                        }}
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
                        onBlur={(value) => {
                          const arr = (data.variableMaximoManual && data.variableMaximoManual.length === 12) ? [...data.variableMaximoManual] : new Array(12).fill(null)
                          arr[index + 6] = value
                          const updated = { ...data, variableMaximoManual: arr }
                          setData(updated)
                          if (token) saveToServer(updated)
                        }}
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
                        onBlur={(value) => {
                          const arr = (data.variableMaximoManual && data.variableMaximoManual.length === 12) ? [...data.variableMaximoManual] : new Array(12).fill(null)
                          arr[index + 9] = value
                          const updated = { ...data, variableMaximoManual: arr }
                          setData(updated)
                          if (token) saveToServer(updated)
                        }}
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

      {/* Legenda Despesas Variáveis */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <h3 className="font-semibold text-blue-800 mb-2">Legenda Despesas Variáveis:</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-blue-700">
          <div>
            <p><span className="font-semibold">Campos editáveis:</span> Todas as linhas (Previsto, Médio, Máximo)</p>
            <p><span className="font-semibold">Cálculo base:</span> Despesas Variáveis da tabela principal + Percentual</p>
          </div>
          <div>
            <p><span className="font-semibold">Percentuais:</span> Previsto (Mínimo), Médio, Máximo</p>
            <p><span className="font-semibold">Persistência:</span> Valores editados são salvos no servidor</p>
          </div>
        </div>
      </div>

      {/* Despesas Fixas + Variáveis */}
      {!isLoading && (
        <div className="bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1200px]">
              <thead className="bg-green-700 text-white">
                <tr>
                  <th className="px-4 py-3 text-left font-bold sticky left-0 z-10 bg-green-700">DESPESAS FIXAS + VARIÁVEIS</th>
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
                  <td className="px-4 py-3 text-gray-700 sticky left-0 z-10 bg-white">Previsto</td>
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
                  <td className="px-4 py-3 text-gray-700 sticky left-0 z-10 bg-white">Médio</td>
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
                  <td className="px-4 py-3 text-gray-700 sticky left-0 z-10 bg-white">Máximo</td>
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

      {/* Legenda Despesas Fixas + Variáveis */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <h3 className="font-semibold text-blue-800 mb-2">Legenda Despesas Fixas + Variáveis:</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-blue-700">
          <div>
            <p><span className="font-semibold">Campos calculados:</span> Soma automática das duas tabelas</p>
            <p><span className="font-semibold">Função:</span> Não editável, apenas visualização</p>
          </div>
          <div>
            <p><span className="font-semibold">Cálculo:</span> Despesas Fixas + Despesas Variáveis</p>
            <p><span className="font-semibold">Uso:</span> Componente do cálculo do Orçamento</p>
          </div>
        </div>
      </div>

      {/* Investimentos */}
      {!isLoading && (
        <div className="bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1200px]">
              <thead className="bg-purple-700 text-white">
                <tr>
                  <th className="px-4 py-3 text-left font-bold sticky left-0 z-10 bg-purple-700">INVESTIMENTOS</th>
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
                  <td className="px-4 py-3 text-gray-700 sticky left-0 z-10 bg-white">Previsto</td>
                  <td className="px-3 py-2">
                    <CalculatedCell value={calcularTrimestre(0, 2, (i) => calcularPrevistoInvestimentoMes(i))} />
                  </td>
                  {meses.slice(0, 3).map((_, index) => (
                    <td key={index} className="px-3 py-2" style={{width: '100px', minWidth: '100px'}}>
                      <InputCell
                        value={calcularPrevistoInvestimentoMes(index)}
                        onBlur={(value) => {
                          const arr = (data.investimentosPrevistoManual && data.investimentosPrevistoManual.length === 12) ? [...data.investimentosPrevistoManual] : new Array(12).fill(null)
                          arr[index] = value
                          const updated = { ...data, investimentosPrevistoManual: arr }
                          setData(updated)
                          if (token) saveToServer(updated)
                        }}
                        category="previsto-inv"
                        monthIndex={index}
                      />
                    </td>
                  ))}
                  <td className="px-3 py-2">
                    <CalculatedCell value={calcularTrimestre(3, 5, (i) => calcularPrevistoInvestimentoMes(i))} />
                  </td>
                  {meses.slice(3, 6).map((_, index) => (
                    <td key={index + 3} className="px-3 py-2" style={{width: '100px', minWidth: '100px'}}>
                      <InputCell
                        value={calcularPrevistoInvestimentoMes(index + 3)}
                        onBlur={(value) => {
                          const arr = (data.investimentosPrevistoManual && data.investimentosPrevistoManual.length === 12) ? [...data.investimentosPrevistoManual] : new Array(12).fill(null)
                          arr[index + 3] = value
                          const updated = { ...data, investimentosPrevistoManual: arr }
                          setData(updated)
                          if (token) saveToServer(updated)
                        }}
                        category="previsto-inv"
                        monthIndex={index + 3}
                      />
                    </td>
                  ))}
                  <td className="px-3 py-2">
                    <CalculatedCell value={calcularTrimestre(6, 8, (i) => calcularPrevistoInvestimentoMes(i))} />
                  </td>
                  {meses.slice(6, 9).map((_, index) => (
                    <td key={index + 6} className="px-3 py-2" style={{width: '100px', minWidth: '100px'}}>
                      <InputCell
                        value={calcularPrevistoInvestimentoMes(index + 6)}
                        onBlur={(value) => {
                          const arr = (data.investimentosPrevistoManual && data.investimentosPrevistoManual.length === 12) ? [...data.investimentosPrevistoManual] : new Array(12).fill(null)
                          arr[index + 6] = value
                          const updated = { ...data, investimentosPrevistoManual: arr }
                          setData(updated)
                          if (token) saveToServer(updated)
                        }}
                        category="previsto-inv"
                        monthIndex={index + 6}
                      />
                    </td>
                  ))}
                  <td className="px-3 py-2">
                    <CalculatedCell value={calcularTrimestre(9, 11, (i) => calcularPrevistoInvestimentoMes(i))} />
                  </td>
                  {meses.slice(9, 12).map((_, index) => (
                    <td key={index + 9} className="px-3 py-2" style={{width: '100px', minWidth: '100px'}}>
                      <InputCell
                        value={calcularPrevistoInvestimentoMes(index + 9)}
                        onBlur={(value) => {
                          const arr = (data.investimentosPrevistoManual && data.investimentosPrevistoManual.length === 12) ? [...data.investimentosPrevistoManual] : new Array(12).fill(null)
                          arr[index + 9] = value
                          const updated = { ...data, investimentosPrevistoManual: arr }
                          setData(updated)
                          if (token) saveToServer(updated)
                        }}
                        category="previsto-inv"
                        monthIndex={index + 9}
                      />
                    </td>
                  ))}
                  <td className="px-3 py-2">
                    <CalculatedCell value={calcularTotalGeral((i) => calcularPrevistoInvestimentoMes(i))} />
                  </td>
                  <td className="px-3 py-2">
                    <CalculatedCell value={calcularMedia((i) => calcularPrevistoInvestimentoMes(i))} />
                  </td>
                </tr>

                {/* Linha Médio */}
                <tr>
                  <td className="px-4 py-3 text-gray-700 sticky left-0 z-10 bg-white">Médio</td>
                  <td className="px-3 py-2">
                    <CalculatedCell value={calcularTrimestre(0, 2, (i) => calcularMedioInvestimentoMes(i))} />
                  </td>
                  {meses.slice(0, 3).map((_, index) => (
                    <td key={index} className="px-3 py-2" style={{width: '100px', minWidth: '100px'}}>
                      <InputCell
                        value={calcularMedioInvestimentoMes(index)}
                        onBlur={(value) => {
                          const arr = (data.investimentosMedioManual && data.investimentosMedioManual.length === 12) ? [...data.investimentosMedioManual] : new Array(12).fill(null)
                          arr[index] = value
                          const updated = { ...data, investimentosMedioManual: arr }
                          setData(updated)
                          if (token) saveToServer(updated)
                        }}
                        category="medio-inv"
                        monthIndex={index}
                      />
                    </td>
                  ))}
                  <td className="px-3 py-2">
                    <CalculatedCell value={calcularTrimestre(3, 5, (i) => calcularMedioInvestimentoMes(i))} />
                  </td>
                  {meses.slice(3, 6).map((_, index) => (
                    <td key={index + 3} className="px-3 py-2" style={{width: '100px', minWidth: '100px'}}>
                      <InputCell
                        value={calcularMedioInvestimentoMes(index + 3)}
                        onBlur={(value) => {
                          const arr = (data.investimentosMedioManual && data.investimentosMedioManual.length === 12) ? [...data.investimentosMedioManual] : new Array(12).fill(null)
                          arr[index + 3] = value
                          const updated = { ...data, investimentosMedioManual: arr }
                          setData(updated)
                          if (token) saveToServer(updated)
                        }}
                        category="medio-inv"
                        monthIndex={index + 3}
                      />
                    </td>
                  ))}
                  <td className="px-3 py-2">
                    <CalculatedCell value={calcularTrimestre(6, 8, (i) => calcularMedioInvestimentoMes(i))} />
                  </td>
                  {meses.slice(6, 9).map((_, index) => (
                    <td key={index + 6} className="px-3 py-2" style={{width: '100px', minWidth: '100px'}}>
                      <InputCell
                        value={calcularMedioInvestimentoMes(index + 6)}
                        onBlur={(value) => {
                          const arr = (data.investimentosMedioManual && data.investimentosMedioManual.length === 12) ? [...data.investimentosMedioManual] : new Array(12).fill(null)
                          arr[index + 6] = value
                          const updated = { ...data, investimentosMedioManual: arr }
                          setData(updated)
                          if (token) saveToServer(updated)
                        }}
                        category="medio-inv"
                        monthIndex={index + 6}
                      />
                    </td>
                  ))}
                  <td className="px-3 py-2">
                    <CalculatedCell value={calcularTrimestre(9, 11, (i) => calcularMedioInvestimentoMes(i))} />
                  </td>
                  {meses.slice(9, 12).map((_, index) => (
                    <td key={index + 9} className="px-3 py-2" style={{width: '100px', minWidth: '100px'}}>
                      <InputCell
                        value={calcularMedioInvestimentoMes(index + 9)}
                        onBlur={(value) => {
                          const arr = (data.investimentosMedioManual && data.investimentosMedioManual.length === 12) ? [...data.investimentosMedioManual] : new Array(12).fill(null)
                          arr[index + 9] = value
                          const updated = { ...data, investimentosMedioManual: arr }
                          setData(updated)
                          if (token) saveToServer(updated)
                        }}
                        category="medio-inv"
                        monthIndex={index + 9}
                      />
                    </td>
                  ))}
                  <td className="px-3 py-2">
                    <CalculatedCell value={calcularTotalGeral((i) => calcularMedioInvestimentoMes(i))} />
                  </td>
                  <td className="px-3 py-2">
                    <CalculatedCell value={calcularMedia((i) => calcularMedioInvestimentoMes(i))} />
                  </td>
                </tr>

                {/* Linha Máximo */}
                <tr>
                  <td className="px-4 py-3 text-gray-700 sticky left-0 z-10 bg-white">Máximo</td>
                  <td className="px-3 py-2">
                    <CalculatedCell value={calcularTrimestre(0, 2, (i) => calcularMaximoInvestimentoMes(i))} />
                  </td>
                  {meses.slice(0, 3).map((_, index) => (
                    <td key={index} className="px-3 py-2" style={{width: '100px', minWidth: '100px'}}>
                      <InputCell
                        value={calcularMaximoInvestimentoMes(index)}
                        onBlur={(value) => {
                          const arr = (data.investimentosMaximoManual && data.investimentosMaximoManual.length === 12) ? [...data.investimentosMaximoManual] : new Array(12).fill(null)
                          arr[index] = value
                          const updated = { ...data, investimentosMaximoManual: arr }
                          setData(updated)
                          if (token) saveToServer(updated)
                        }}
                        category="maximo-inv"
                        monthIndex={index}
                      />
                    </td>
                  ))}
                  <td className="px-3 py-2">
                    <CalculatedCell value={calcularTrimestre(3, 5, (i) => calcularMaximoInvestimentoMes(i))} />
                  </td>
                  {meses.slice(3, 6).map((_, index) => (
                    <td key={index + 3} className="px-3 py-2" style={{width: '100px', minWidth: '100px'}}>
                      <InputCell
                        value={calcularMaximoInvestimentoMes(index + 3)}
                        onBlur={(value) => {
                          const arr = (data.investimentosMaximoManual && data.investimentosMaximoManual.length === 12) ? [...data.investimentosMaximoManual] : new Array(12).fill(null)
                          arr[index + 3] = value
                          const updated = { ...data, investimentosMaximoManual: arr }
                          setData(updated)
                          if (token) saveToServer(updated)
                        }}
                        category="maximo-inv"
                        monthIndex={index + 3}
                      />
                    </td>
                  ))}
                  <td className="px-3 py-2">
                    <CalculatedCell value={calcularTrimestre(6, 8, (i) => calcularMaximoInvestimentoMes(i))} />
                  </td>
                  {meses.slice(6, 9).map((_, index) => (
                    <td key={index + 6} className="px-3 py-2" style={{width: '100px', minWidth: '100px'}}>
                      <InputCell
                        value={calcularMaximoInvestimentoMes(index + 6)}
                        onBlur={(value) => {
                          const arr = (data.investimentosMaximoManual && data.investimentosMaximoManual.length === 12) ? [...data.investimentosMaximoManual] : new Array(12).fill(null)
                          arr[index + 6] = value
                          const updated = { ...data, investimentosMaximoManual: arr }
                          setData(updated)
                          if (token) saveToServer(updated)
                        }}
                        category="maximo-inv"
                        monthIndex={index + 6}
                      />
                    </td>
                  ))}
                  <td className="px-3 py-2">
                    <CalculatedCell value={calcularTrimestre(9, 11, (i) => calcularMaximoInvestimentoMes(i))} />
                  </td>
                  {meses.slice(9, 12).map((_, index) => (
                    <td key={index + 9} className="px-3 py-2" style={{width: '100px', minWidth: '100px'}}>
                      <InputCell
                        value={calcularMaximoInvestimentoMes(index + 9)}
                        onBlur={(value) => {
                          const arr = (data.investimentosMaximoManual && data.investimentosMaximoManual.length === 12) ? [...data.investimentosMaximoManual] : new Array(12).fill(null)
                          arr[index + 9] = value
                          const updated = { ...data, investimentosMaximoManual: arr }
                          setData(updated)
                          if (token) saveToServer(updated)
                        }}
                        category="maximo-inv"
                        monthIndex={index + 9}
                      />
                    </td>
                  ))}
                  <td className="px-3 py-2">
                    <CalculatedCell value={calcularTotalGeral((i) => calcularMaximoInvestimentoMes(i))} />
                  </td>
                  <td className="px-3 py-2">
                    <CalculatedCell value={calcularMedia((i) => calcularMaximoInvestimentoMes(i))} />
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Legenda Investimentos */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <h3 className="font-semibold text-blue-800 mb-2">Legenda Investimentos:</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-blue-700">
          <div>
            <p><span className="font-semibold">Campos editáveis:</span> Todas as linhas (Previsto, Médio, Máximo)</p>
            <p><span className="font-semibold">Cálculo base:</span> Investimentos da tabela principal + Percentual</p>
          </div>
          <div>
            <p><span className="font-semibold">Persistência:</span> Valores editados não são salvos</p>
            <p><span className="font-semibold">Uso:</span> Componente do cálculo do Orçamento</p>
          </div>
        </div>
      </div>

      {/* Tabela Orçamento */}
      <div className="bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1200px]">
            <thead className="bg-indigo-700 text-white">
              <tr>
                <th className="px-4 py-3 text-left font-bold sticky left-0 z-10 bg-indigo-700">ORÇAMENTO</th>
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
                <th className="px-3 py-3 text-center font-bold">TOTAL GERAL</th>
                <th className="px-3 py-3 text-center font-bold">MÉDIA</th>
              </tr>
            </thead>
            <tbody>
              {/* Linha Previsto */}
              <tr>
                <td className="px-4 py-3 text-gray-700 sticky left-0 z-10 bg-white">Previsto</td>
                <td className="px-3 py-2">
                  <CalculatedCell value={calcularTrimestre(0, 2, (i) => calcularPrevistoOrcamentoMes(i))} />
                </td>
                {meses.slice(0, 3).map((_, index) => (
                  <td key={index} className="px-3 py-2" style={{width: '100px', minWidth: '100px'}}>
                    <CalculatedCell value={calcularPrevistoOrcamentoMes(index)} />
                  </td>
                ))}
                <td className="px-3 py-2">
                  <CalculatedCell value={calcularTrimestre(3, 5, (i) => calcularPrevistoOrcamentoMes(i))} />
                </td>
                {meses.slice(3, 6).map((_, index) => (
                  <td key={index + 3} className="px-3 py-2" style={{width: '100px', minWidth: '100px'}}>
                    <CalculatedCell value={calcularPrevistoOrcamentoMes(index + 3)} />
                  </td>
                ))}
                <td className="px-3 py-2">
                  <CalculatedCell value={calcularTrimestre(6, 8, (i) => calcularPrevistoOrcamentoMes(i))} />
                </td>
                {meses.slice(6, 9).map((_, index) => (
                  <td key={index + 6} className="px-3 py-2" style={{width: '100px', minWidth: '100px'}}>
                    <CalculatedCell value={calcularPrevistoOrcamentoMes(index + 6)} />
                  </td>
                ))}
                <td className="px-3 py-2">
                  <CalculatedCell value={calcularTrimestre(9, 11, (i) => calcularPrevistoOrcamentoMes(i))} />
                </td>
                {meses.slice(9, 12).map((_, index) => (
                  <td key={index + 9} className="px-3 py-2" style={{width: '100px', minWidth: '100px'}}>
                    <CalculatedCell value={calcularPrevistoOrcamentoMes(index + 9)} />
                  </td>
                ))}
                <td className="px-3 py-2">
                  <CalculatedCell value={calcularTotalGeral((i) => calcularPrevistoOrcamentoMes(i))} />
                </td>
                <td className="px-3 py-2">
                  <CalculatedCell value={calcularMedia((i) => calcularPrevistoOrcamentoMes(i))} />
                </td>
              </tr>

              {/* Linha Médio */}
              <tr>
                <td className="px-4 py-3 text-gray-700 sticky left-0 z-10 bg-white">Médio</td>
                <td className="px-3 py-2">
                  <CalculatedCell value={calcularTrimestre(0, 2, (i) => calcularMedioOrcamentoMes(i))} />
                </td>
                {meses.slice(0, 3).map((_, index) => (
                  <td key={index} className="px-3 py-2" style={{width: '100px', minWidth: '100px'}}>
                    <CalculatedCell value={calcularMedioOrcamentoMes(index)} />
                  </td>
                ))}
                <td className="px-3 py-2">
                  <CalculatedCell value={calcularTrimestre(3, 5, (i) => calcularMedioOrcamentoMes(i))} />
                </td>
                {meses.slice(3, 6).map((_, index) => (
                  <td key={index + 3} className="px-3 py-2" style={{width: '100px', minWidth: '100px'}}>
                    <CalculatedCell value={calcularMedioOrcamentoMes(index + 3)} />
                  </td>
                ))}
                <td className="px-3 py-2">
                  <CalculatedCell value={calcularTrimestre(6, 8, (i) => calcularMedioOrcamentoMes(i))} />
                </td>
                {meses.slice(6, 9).map((_, index) => (
                  <td key={index + 6} className="px-3 py-2" style={{width: '100px', minWidth: '100px'}}>
                    <CalculatedCell value={calcularMedioOrcamentoMes(index + 6)} />
                  </td>
                ))}
                <td className="px-3 py-2">
                  <CalculatedCell value={calcularTrimestre(9, 11, (i) => calcularMedioOrcamentoMes(i))} />
                </td>
                {meses.slice(9, 12).map((_, index) => (
                  <td key={index + 9} className="px-3 py-2" style={{width: '100px', minWidth: '100px'}}>
                    <CalculatedCell value={calcularMedioOrcamentoMes(index + 9)} />
                  </td>
                ))}
                <td className="px-3 py-2">
                  <CalculatedCell value={calcularTotalGeral((i) => calcularMedioOrcamentoMes(i))} />
                </td>
                <td className="px-3 py-2">
                  <CalculatedCell value={calcularMedia((i) => calcularMedioOrcamentoMes(i))} />
                </td>
              </tr>

              {/* Linha Máximo */}
              <tr>
                <td className="px-4 py-3 text-gray-700 sticky left-0 z-10 bg-white">Máximo</td>
                <td className="px-3 py-2">
                  <CalculatedCell value={calcularTrimestre(0, 2, (i) => calcularMaximoOrcamentoMes(i))} />
                </td>
                {meses.slice(0, 3).map((_, index) => (
                  <td key={index} className="px-3 py-2" style={{width: '100px', minWidth: '100px'}}>
                    <CalculatedCell value={calcularMaximoOrcamentoMes(index)} />
                  </td>
                ))}
                <td className="px-3 py-2">
                  <CalculatedCell value={calcularTrimestre(3, 5, (i) => calcularMaximoOrcamentoMes(i))} />
                </td>
                {meses.slice(3, 6).map((_, index) => (
                  <td key={index + 3} className="px-3 py-2" style={{width: '100px', minWidth: '100px'}}>
                    <CalculatedCell value={calcularMaximoOrcamentoMes(index + 3)} />
                  </td>
                ))}
                <td className="px-3 py-2">
                  <CalculatedCell value={calcularTrimestre(6, 8, (i) => calcularMaximoOrcamentoMes(i))} />
                </td>
                {meses.slice(6, 9).map((_, index) => (
                  <td key={index + 6} className="px-3 py-2" style={{width: '100px', minWidth: '100px'}}>
                    <CalculatedCell value={calcularMaximoOrcamentoMes(index + 6)} />
                  </td>
                ))}
                <td className="px-3 py-2">
                  <CalculatedCell value={calcularTrimestre(9, 11, (i) => calcularMaximoOrcamentoMes(i))} />
                </td>
                {meses.slice(9, 12).map((_, index) => (
                  <td key={index + 9} className="px-3 py-2" style={{width: '100px', minWidth: '100px'}}>
                    <CalculatedCell value={calcularMaximoOrcamentoMes(index + 9)} />
                  </td>
                ))}
                <td className="px-3 py-2">
                  <CalculatedCell value={calcularTotalGeral((i) => calcularMaximoOrcamentoMes(i))} />
                </td>
                <td className="px-3 py-2">
                  <CalculatedCell value={calcularMedia((i) => calcularMaximoOrcamentoMes(i))} />
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Legenda Orçamento */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <h3 className="font-semibold text-blue-800 mb-2">Legenda Orçamento:</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-blue-700">
          <div>
            <p><span className="font-semibold">Campos calculados:</span> Não editável, soma automática</p>
            <p><span className="font-semibold">Componentes:</span> Despesas Fixas + Variáveis + MKT + Investimentos</p>
          </div>
          <div>
            <p><span className="font-semibold">Função:</span> Total de gastos previstos</p>
            <p><span className="font-semibold">Uso:</span> Comparação com Faturamento Total</p>
          </div>
        </div>
      </div>

      {/* Tabela Faturamento REURB */}
      <div className="bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1200px]">
            <thead className="bg-red-700 text-white">
              <tr>
                <th className="px-4 py-3 text-left font-bold sticky left-0 z-10 bg-red-700">FATURAMENTO REURB</th>
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
                <th className="px-3 py-3 text-center font-bold">TOTAL GERAL</th>
                <th className="px-3 py-3 text-center font-bold">MÉDIA</th>
              </tr>
            </thead>
            <tbody>
              {/* Linha Previsto */}
              <tr>
                <td className="px-4 py-3 text-gray-700 sticky left-0 z-10 bg-white">Previsto</td>
                <td className="px-3 py-2">
                  <CalculatedCell value={faturamentoReurbData.previsto[0] + faturamentoReurbData.previsto[1] + faturamentoReurbData.previsto[2]} />
                </td>
                {meses.slice(0, 3).map((_, index) => (
                  <td key={index} className="px-3 py-2" style={{width: '100px', minWidth: '100px'}}>
                    <InputCell 
                      value={faturamentoReurbData.previsto[index]} 
                      onBlur={(value: number) => {
                        const newData = {...faturamentoReurbData}
                        newData.previsto[index] = value
                        setFaturamentoReurbData(newData)
                        saveFaturamentoReurbToServer(newData)
                        
                        // Salvar também no estado principal para override manual
                        const arr = (data.faturamentoReurbPrevistoManual && data.faturamentoReurbPrevistoManual.length === 12) ? [...data.faturamentoReurbPrevistoManual] : new Array(12).fill(null)
                        arr[index] = value
                        const updated = { ...data, faturamentoReurbPrevistoManual: arr }
                        setData(updated)
                        if (token) saveToServer(updated)
                      }}
                      category="faturamentoReurb"
                      monthIndex={index}
                    />
                  </td>
                ))}
                <td className="px-3 py-2">
                  <CalculatedCell value={faturamentoReurbData.previsto[3] + faturamentoReurbData.previsto[4] + faturamentoReurbData.previsto[5]} />
                </td>
                {meses.slice(3, 6).map((_, index) => (
                  <td key={index + 3} className="px-3 py-2" style={{width: '100px', minWidth: '100px'}}>
                    <InputCell 
                      value={faturamentoReurbData.previsto[index + 3]} 
                      onBlur={(value: number) => {
                        const newData = {...faturamentoReurbData}
                        newData.previsto[index + 3] = value
                        setFaturamentoReurbData(newData)
                        saveFaturamentoReurbToServer(newData)
                        
                        // Salvar também no estado principal para override manual
                        const arr = (data.faturamentoReurbPrevistoManual && data.faturamentoReurbPrevistoManual.length === 12) ? [...data.faturamentoReurbPrevistoManual] : new Array(12).fill(null)
                        arr[index + 3] = value
                        const updated = { ...data, faturamentoReurbPrevistoManual: arr }
                        setData(updated)
                        if (token) saveToServer(updated)
                      }}
                      category="faturamentoReurb"
                      monthIndex={index}
                    />
                  </td>
                ))}
                <td className="px-3 py-2">
                  <CalculatedCell value={faturamentoReurbData.previsto[6] + faturamentoReurbData.previsto[7] + faturamentoReurbData.previsto[8]} />
                </td>
                {meses.slice(6, 9).map((_, index) => (
                  <td key={index + 6} className="px-3 py-2" style={{width: '100px', minWidth: '100px'}}>
                    <InputCell 
                      value={faturamentoReurbData.previsto[index + 6]} 
                      onBlur={(value: number) => {
                        const newData = {...faturamentoReurbData}
                        newData.previsto[index + 6] = value
                        setFaturamentoReurbData(newData)
                        saveFaturamentoReurbToServer(newData)
                        
                        // Salvar também no estado principal para override manual
                        const arr = (data.faturamentoReurbPrevistoManual && data.faturamentoReurbPrevistoManual.length === 12) ? [...data.faturamentoReurbPrevistoManual] : new Array(12).fill(null)
                        arr[index + 6] = value
                        const updated = { ...data, faturamentoReurbPrevistoManual: arr }
                        setData(updated)
                        if (token) saveToServer(updated)
                      }}
                      category="faturamentoReurb"
                      monthIndex={index}
                    />
                  </td>
                ))}
                <td className="px-3 py-2">
                  <CalculatedCell value={faturamentoReurbData.previsto[9] + faturamentoReurbData.previsto[10] + faturamentoReurbData.previsto[11]} />
                </td>
                {meses.slice(9, 12).map((_, index) => (
                  <td key={index + 9} className="px-3 py-2" style={{width: '100px', minWidth: '100px'}}>
                    <InputCell 
                      value={faturamentoReurbData.previsto[index + 9]} 
                      onBlur={(value: number) => {
                        const newData = {...faturamentoReurbData}
                        newData.previsto[index + 9] = value
                        setFaturamentoReurbData(newData)
                        saveFaturamentoReurbToServer(newData)
                        
                        // Salvar também no estado principal para override manual
                        const arr = (data.faturamentoReurbPrevistoManual && data.faturamentoReurbPrevistoManual.length === 12) ? [...data.faturamentoReurbPrevistoManual] : new Array(12).fill(null)
                        arr[index + 9] = value
                        const updated = { ...data, faturamentoReurbPrevistoManual: arr }
                        setData(updated)
                        if (token) saveToServer(updated)
                      }}
                      category="faturamentoReurb"
                      monthIndex={index}
                    />
                  </td>
                ))}
                <td className="px-3 py-2">
                  <CalculatedCell value={faturamentoReurbData.previsto.reduce((sum, v) => sum + v, 0)} />
                </td>
                <td className="px-3 py-2">
                  <CalculatedCell value={faturamentoReurbData.previsto.reduce((sum, v) => sum + v, 0) / 12} />
                </td>
              </tr>

              {/* Linha Médio */}
              <tr>
                <td className="px-4 py-3 text-gray-700 sticky left-0 z-10 bg-white">Médio</td>
                <td className="px-3 py-2">
                  <CalculatedCell value={calcularTrimestre(0, 2, (i) => calcularMedioReurbMes(i))} />
                </td>
                {meses.slice(0, 3).map((_, index) => (
                  <td key={index} className="px-3 py-2" style={{width: '100px', minWidth: '100px'}}>
                    <InputCell 
                      value={calcularMedioReurbMes(index)} 
                      onBlur={(value) => {
                        const arr = (data.faturamentoReurbMedioManual && data.faturamentoReurbMedioManual.length === 12) ? [...data.faturamentoReurbMedioManual] : new Array(12).fill(null)
                        arr[index] = value
                        const updated = { ...data, faturamentoReurbMedioManual: arr }
                        setData(updated)
                        if (token) saveToServer(updated)
                      }}
                      category="faturamentoReurb"
                      monthIndex={index}
                    />
                  </td>
                ))}
                <td className="px-3 py-2">
                  <CalculatedCell value={calcularTrimestre(3, 5, (i) => calcularMedioReurbMes(i))} />
                </td>
                {meses.slice(3, 6).map((_, index) => (
                  <td key={index + 3} className="px-3 py-2" style={{width: '100px', minWidth: '100px'}}>
                    <InputCell 
                      value={calcularMedioReurbMes(index + 3)} 
                      onBlur={(value) => {
                        const arr = (data.faturamentoReurbMedioManual && data.faturamentoReurbMedioManual.length === 12) ? [...data.faturamentoReurbMedioManual] : new Array(12).fill(null)
                        arr[index + 3] = value
                        const updated = { ...data, faturamentoReurbMedioManual: arr }
                        setData(updated)
                        if (token) saveToServer(updated)
                      }}
                      category="faturamentoReurb"
                      monthIndex={index}
                    />
                  </td>
                ))}
                <td className="px-3 py-2">
                  <CalculatedCell value={calcularTrimestre(6, 8, (i) => calcularMedioReurbMes(i))} />
                </td>
                {meses.slice(6, 9).map((_, index) => (
                  <td key={index + 6} className="px-3 py-2" style={{width: '100px', minWidth: '100px'}}>
                    <InputCell 
                      value={calcularMedioReurbMes(index + 6)} 
                      onBlur={(value) => {
                        const arr = (data.faturamentoReurbMedioManual && data.faturamentoReurbMedioManual.length === 12) ? [...data.faturamentoReurbMedioManual] : new Array(12).fill(null)
                        arr[index + 6] = value
                        const updated = { ...data, faturamentoReurbMedioManual: arr }
                        setData(updated)
                        if (token) saveToServer(updated)
                      }}
                      category="faturamentoReurb"
                      monthIndex={index}
                    />
                  </td>
                ))}
                <td className="px-3 py-2">
                  <CalculatedCell value={calcularTrimestre(9, 11, (i) => calcularMedioReurbMes(i))} />
                </td>
                {meses.slice(9, 12).map((_, index) => (
                  <td key={index + 9} className="px-3 py-2" style={{width: '100px', minWidth: '100px'}}>
                    <InputCell 
                      value={calcularMedioReurbMes(index + 9)} 
                      onBlur={(value) => {
                        const arr = (data.faturamentoReurbMedioManual && data.faturamentoReurbMedioManual.length === 12) ? [...data.faturamentoReurbMedioManual] : new Array(12).fill(null)
                        arr[index + 9] = value
                        const updated = { ...data, faturamentoReurbMedioManual: arr }
                        setData(updated)
                        if (token) saveToServer(updated)
                      }}
                      category="faturamentoReurb"
                      monthIndex={index}
                    />
                  </td>
                ))}
                <td className="px-3 py-2">
                  <CalculatedCell value={calcularTotalGeral((i) => calcularMedioReurbMes(i))} />
                </td>
                <td className="px-3 py-2">
                  <CalculatedCell value={calcularMedia((i) => calcularMedioReurbMes(i))} />
                </td>
              </tr>

              {/* Linha Máximo */}
              <tr>
                <td className="px-4 py-3 text-gray-700 sticky left-0 z-10 bg-white">Máximo</td>
                <td className="px-3 py-2">
                  <CalculatedCell value={calcularTrimestre(0, 2, (i) => calcularMaximoReurbMes(i))} />
                </td>
                {meses.slice(0, 3).map((_, index) => (
                  <td key={index} className="px-3 py-2" style={{width: '100px', minWidth: '100px'}}>
                    <InputCell 
                      value={calcularMaximoReurbMes(index)} 
                      onBlur={(value) => {
                        const arr = (data.faturamentoReurbMaximoManual && data.faturamentoReurbMaximoManual.length === 12) ? [...data.faturamentoReurbMaximoManual] : new Array(12).fill(null)
                        arr[index] = value
                        const updated = { ...data, faturamentoReurbMaximoManual: arr }
                        setData(updated)
                        if (token) saveToServer(updated)
                      }}
                      category="faturamentoReurb"
                      monthIndex={index}
                    />
                  </td>
                ))}
                <td className="px-3 py-2">
                  <CalculatedCell value={calcularTrimestre(3, 5, (i) => calcularMaximoReurbMes(i))} />
                </td>
                {meses.slice(3, 6).map((_, index) => (
                  <td key={index + 3} className="px-3 py-2" style={{width: '100px', minWidth: '100px'}}>
                    <InputCell 
                      value={calcularMaximoReurbMes(index + 3)} 
                      onBlur={(value) => {
                        const arr = (data.faturamentoReurbMaximoManual && data.faturamentoReurbMaximoManual.length === 12) ? [...data.faturamentoReurbMaximoManual] : new Array(12).fill(null)
                        arr[index + 3] = value
                        const updated = { ...data, faturamentoReurbMaximoManual: arr }
                        setData(updated)
                        if (token) saveToServer(updated)
                      }}
                      category="faturamentoReurb"
                      monthIndex={index}
                    />
                  </td>
                ))}
                <td className="px-3 py-2">
                  <CalculatedCell value={calcularTrimestre(6, 8, (i) => calcularMaximoReurbMes(i))} />
                </td>
                {meses.slice(6, 9).map((_, index) => (
                  <td key={index + 6} className="px-3 py-2" style={{width: '100px', minWidth: '100px'}}>
                    <InputCell 
                      value={calcularMaximoReurbMes(index + 6)} 
                      onBlur={(value) => {
                        const arr = (data.faturamentoReurbMaximoManual && data.faturamentoReurbMaximoManual.length === 12) ? [...data.faturamentoReurbMaximoManual] : new Array(12).fill(null)
                        arr[index + 6] = value
                        const updated = { ...data, faturamentoReurbMaximoManual: arr }
                        setData(updated)
                        if (token) saveToServer(updated)
                      }}
                      category="faturamentoReurb"
                      monthIndex={index}
                    />
                  </td>
                ))}
                <td className="px-3 py-2">
                  <CalculatedCell value={calcularTrimestre(9, 11, (i) => calcularMaximoReurbMes(i))} />
                </td>
                {meses.slice(9, 12).map((_, index) => (
                  <td key={index + 9} className="px-3 py-2" style={{width: '100px', minWidth: '100px'}}>
                    <InputCell 
                      value={calcularMaximoReurbMes(index + 9)} 
                      onBlur={(value) => {
                        const arr = (data.faturamentoReurbMaximoManual && data.faturamentoReurbMaximoManual.length === 12) ? [...data.faturamentoReurbMaximoManual] : new Array(12).fill(null)
                        arr[index + 9] = value
                        const updated = { ...data, faturamentoReurbMaximoManual: arr }
                        setData(updated)
                        if (token) saveToServer(updated)
                      }}
                      category="faturamentoReurb"
                      monthIndex={index}
                    />
                  </td>
                ))}
                <td className="px-3 py-2">
                  <CalculatedCell value={calcularTotalGeral((i) => calcularMaximoReurbMes(i))} />
                </td>
                <td className="px-3 py-2">
                  <CalculatedCell value={calcularMedia((i) => calcularMaximoReurbMes(i))} />
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Legenda Faturamento REURB */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <h3 className="font-semibold text-blue-800 mb-2">Legenda Faturamento REURB:</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-blue-700">
          <div>
            <p><span className="font-semibold">Campos editáveis:</span> Todas as linhas (Previsto, Médio, Máximo)</p>
            <p><span className="font-semibold">Cálculo base:</span> REURB da tabela principal + Percentual</p>
          </div>
          <div>
            <p><span className="font-semibold">Persistência:</span> Valores editados são salvos no servidor</p>
            <p><span className="font-semibold">Uso:</span> Componente do Faturamento Total</p>
          </div>
        </div>
      </div>

      {/* Tabela Faturamento GEO */}
      <div className="bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1200px]">
            <thead className="bg-green-700 text-white">
              <tr>
                <th className="px-4 py-3 text-left font-bold sticky left-0 z-10 bg-green-700">FATURAMENTO GEO</th>
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
                <th className="px-3 py-3 text-center font-bold">TOTAL GERAL</th>
                <th className="px-3 py-3 text-center font-bold">MÉDIA</th>
              </tr>
            </thead>
            <tbody>
              {/* Linha Previsto */}
              <tr>
                <td className="px-4 py-3 text-gray-700 sticky left-0 z-10 bg-white">Previsto</td>
                <td className="px-3 py-2">
                  <CalculatedCell value={faturamentoGeoData.previsto[0] + faturamentoGeoData.previsto[1] + faturamentoGeoData.previsto[2]} />
                </td>
                {meses.slice(0, 3).map((_, index) => (
                  <td key={index} className="px-3 py-2" style={{width: '100px', minWidth: '100px'}}>
                    <InputCell 
                      value={faturamentoGeoData.previsto[index]} 
                      onBlur={(value: number) => {
                        const newData = {...faturamentoGeoData}
                        newData.previsto[index] = value
                        setFaturamentoGeoData(newData)
                        saveFaturamentoGeoToServer(newData)
                        
                        // Salvar também no estado principal para override manual
                        const arr = (data.faturamentoGeoPrevistoManual && data.faturamentoGeoPrevistoManual.length === 12) ? [...data.faturamentoGeoPrevistoManual] : new Array(12).fill(null)
                        arr[index] = value
                        const updated = { ...data, faturamentoGeoPrevistoManual: arr }
                        setData(updated)
                        if (token) saveToServer(updated)
                      }}
                      category="faturamentoGeo"
                      monthIndex={index}
                    />
                  </td>
                ))}
                <td className="px-3 py-2">
                  <CalculatedCell value={faturamentoGeoData.previsto[3] + faturamentoGeoData.previsto[4] + faturamentoGeoData.previsto[5]} />
                </td>
                {meses.slice(3, 6).map((_, index) => (
                  <td key={index + 3} className="px-3 py-2" style={{width: '100px', minWidth: '100px'}}>
                    <InputCell 
                      value={faturamentoGeoData.previsto[index + 3]} 
                      onBlur={(value: number) => {
                        const newData = {...faturamentoGeoData}
                        newData.previsto[index + 3] = value
                        setFaturamentoGeoData(newData)
                        saveFaturamentoGeoToServer(newData)
                        
                        // Salvar também no estado principal para override manual
                        const arr = (data.faturamentoGeoPrevistoManual && data.faturamentoGeoPrevistoManual.length === 12) ? [...data.faturamentoGeoPrevistoManual] : new Array(12).fill(null)
                        arr[index + 3] = value
                        const updated = { ...data, faturamentoGeoPrevistoManual: arr }
                        setData(updated)
                        if (token) saveToServer(updated)
                      }}
                      category="faturamentoGeo"
                      monthIndex={index}
                    />
                  </td>
                ))}
                <td className="px-3 py-2">
                  <CalculatedCell value={faturamentoGeoData.previsto[6] + faturamentoGeoData.previsto[7] + faturamentoGeoData.previsto[8]} />
                </td>
                {meses.slice(6, 9).map((_, index) => (
                  <td key={index + 6} className="px-3 py-2" style={{width: '100px', minWidth: '100px'}}>
                    <InputCell 
                      value={faturamentoGeoData.previsto[index + 6]} 
                      onBlur={(value: number) => {
                        const newData = {...faturamentoGeoData}
                        newData.previsto[index + 6] = value
                        setFaturamentoGeoData(newData)
                        saveFaturamentoGeoToServer(newData)
                        
                        // Salvar também no estado principal para override manual
                        const arr = (data.faturamentoGeoPrevistoManual && data.faturamentoGeoPrevistoManual.length === 12) ? [...data.faturamentoGeoPrevistoManual] : new Array(12).fill(null)
                        arr[index + 6] = value
                        const updated = { ...data, faturamentoGeoPrevistoManual: arr }
                        setData(updated)
                        if (token) saveToServer(updated)
                      }}
                      category="faturamentoGeo"
                      monthIndex={index}
                    />
                  </td>
                ))}
                <td className="px-3 py-2">
                  <CalculatedCell value={faturamentoGeoData.previsto[9] + faturamentoGeoData.previsto[10] + faturamentoGeoData.previsto[11]} />
                </td>
                {meses.slice(9, 12).map((_, index) => (
                  <td key={index + 9} className="px-3 py-2" style={{width: '100px', minWidth: '100px'}}>
                    <InputCell 
                      value={faturamentoGeoData.previsto[index + 9]} 
                      onBlur={(value: number) => {
                        const newData = {...faturamentoGeoData}
                        newData.previsto[index + 9] = value
                        setFaturamentoGeoData(newData)
                        saveFaturamentoGeoToServer(newData)
                        
                        // Salvar também no estado principal para override manual
                        const arr = (data.faturamentoGeoPrevistoManual && data.faturamentoGeoPrevistoManual.length === 12) ? [...data.faturamentoGeoPrevistoManual] : new Array(12).fill(null)
                        arr[index + 9] = value
                        const updated = { ...data, faturamentoGeoPrevistoManual: arr }
                        setData(updated)
                        if (token) saveToServer(updated)
                      }}
                      category="faturamentoGeo"
                      monthIndex={index}
                    />
                  </td>
                ))}
                <td className="px-3 py-2">
                  <CalculatedCell value={faturamentoGeoData.previsto.reduce((sum, v) => sum + v, 0)} />
                </td>
                <td className="px-3 py-2">
                  <CalculatedCell value={faturamentoGeoData.previsto.reduce((sum, v) => sum + v, 0) / 12} />
                </td>
              </tr>

              {/* Linha Médio */}
              <tr>
                <td className="px-4 py-3 text-gray-700 sticky left-0 z-10 bg-white">Médio</td>
                <td className="px-3 py-2">
                  <CalculatedCell value={calcularTrimestre(0, 2, (i) => calcularMedioGeoMes(i))} />
                </td>
                {meses.slice(0, 3).map((_, index) => (
                  <td key={index} className="px-3 py-2" style={{width: '100px', minWidth: '100px'}}>
                    <InputCell 
                      value={calcularMedioGeoMes(index)} 
                      onBlur={(value) => {
                        const arr = (data.faturamentoGeoMedioManual && data.faturamentoGeoMedioManual.length === 12) ? [...data.faturamentoGeoMedioManual] : new Array(12).fill(null)
                        arr[index] = value
                        const updated = { ...data, faturamentoGeoMedioManual: arr }
                        setData(updated)
                        if (token) saveToServer(updated)
                      }}
                      category="faturamentoGeo"
                      monthIndex={index}
                    />
                  </td>
                ))}
                <td className="px-3 py-2">
                  <CalculatedCell value={calcularTrimestre(3, 5, (i) => calcularMedioGeoMes(i))} />
                </td>
                {meses.slice(3, 6).map((_, index) => (
                  <td key={index + 3} className="px-3 py-2" style={{width: '100px', minWidth: '100px'}}>
                    <InputCell 
                      value={calcularMedioGeoMes(index + 3)} 
                      onBlur={(value) => {
                        const arr = (data.faturamentoGeoMedioManual && data.faturamentoGeoMedioManual.length === 12) ? [...data.faturamentoGeoMedioManual] : new Array(12).fill(null)
                        arr[index + 3] = value
                        const updated = { ...data, faturamentoGeoMedioManual: arr }
                        setData(updated)
                        if (token) saveToServer(updated)
                      }}
                      category="faturamentoGeo"
                      monthIndex={index}
                    />
                  </td>
                ))}
                <td className="px-3 py-2">
                  <CalculatedCell value={calcularTrimestre(6, 8, (i) => calcularMedioGeoMes(i))} />
                </td>
                {meses.slice(6, 9).map((_, index) => (
                  <td key={index + 6} className="px-3 py-2" style={{width: '100px', minWidth: '100px'}}>
                    <InputCell 
                      value={calcularMedioGeoMes(index + 6)} 
                      onBlur={(value) => {
                        const arr = (data.faturamentoGeoMedioManual && data.faturamentoGeoMedioManual.length === 12) ? [...data.faturamentoGeoMedioManual] : new Array(12).fill(null)
                        arr[index + 6] = value
                        const updated = { ...data, faturamentoGeoMedioManual: arr }
                        setData(updated)
                        if (token) saveToServer(updated)
                      }}
                      category="faturamentoGeo"
                      monthIndex={index}
                    />
                  </td>
                ))}
                <td className="px-3 py-2">
                  <CalculatedCell value={calcularTrimestre(9, 11, (i) => calcularMedioGeoMes(i))} />
                </td>
                {meses.slice(9, 12).map((_, index) => (
                  <td key={index + 9} className="px-3 py-2" style={{width: '100px', minWidth: '100px'}}>
                    <InputCell 
                      value={calcularMedioGeoMes(index + 9)} 
                      onBlur={(value) => {
                        const arr = (data.faturamentoGeoMedioManual && data.faturamentoGeoMedioManual.length === 12) ? [...data.faturamentoGeoMedioManual] : new Array(12).fill(null)
                        arr[index + 9] = value
                        const updated = { ...data, faturamentoGeoMedioManual: arr }
                        setData(updated)
                        if (token) saveToServer(updated)
                      }}
                      category="faturamentoGeo"
                      monthIndex={index}
                    />
                  </td>
                ))}
                <td className="px-3 py-2">
                  <CalculatedCell value={calcularTotalGeral((i) => calcularMedioGeoMes(i))} />
                </td>
                <td className="px-3 py-2">
                  <CalculatedCell value={calcularMedia((i) => calcularMedioGeoMes(i))} />
                </td>
              </tr>

              {/* Linha Máximo */}
              <tr>
                <td className="px-4 py-3 text-gray-700 sticky left-0 z-10 bg-white">Máximo</td>
                <td className="px-3 py-2">
                  <CalculatedCell value={calcularTrimestre(0, 2, (i) => calcularMaximoGeoMes(i))} />
                </td>
                {meses.slice(0, 3).map((_, index) => (
                  <td key={index} className="px-3 py-2" style={{width: '100px', minWidth: '100px'}}>
                    <InputCell 
                      value={calcularMaximoGeoMes(index)} 
                      onBlur={(value) => {
                        const arr = (data.faturamentoGeoMaximoManual && data.faturamentoGeoMaximoManual.length === 12) ? [...data.faturamentoGeoMaximoManual] : new Array(12).fill(null)
                        arr[index] = value
                        const updated = { ...data, faturamentoGeoMaximoManual: arr }
                        setData(updated)
                        if (token) saveToServer(updated)
                      }}
                      category="faturamentoGeo"
                      monthIndex={index}
                    />
                  </td>
                ))}
                <td className="px-3 py-2">
                  <CalculatedCell value={calcularTrimestre(3, 5, (i) => calcularMaximoGeoMes(i))} />
                </td>
                {meses.slice(3, 6).map((_, index) => (
                  <td key={index + 3} className="px-3 py-2" style={{width: '100px', minWidth: '100px'}}>
                    <InputCell 
                      value={calcularMaximoGeoMes(index + 3)} 
                      onBlur={(value) => {
                        const arr = (data.faturamentoGeoMaximoManual && data.faturamentoGeoMaximoManual.length === 12) ? [...data.faturamentoGeoMaximoManual] : new Array(12).fill(null)
                        arr[index + 3] = value
                        const updated = { ...data, faturamentoGeoMaximoManual: arr }
                        setData(updated)
                        if (token) saveToServer(updated)
                      }}
                      category="faturamentoGeo"
                      monthIndex={index}
                    />
                  </td>
                ))}
                <td className="px-3 py-2">
                  <CalculatedCell value={calcularTrimestre(6, 8, (i) => calcularMaximoGeoMes(i))} />
                </td>
                {meses.slice(6, 9).map((_, index) => (
                  <td key={index + 6} className="px-3 py-2" style={{width: '100px', minWidth: '100px'}}>
                    <InputCell 
                      value={calcularMaximoGeoMes(index + 6)} 
                      onBlur={(value) => {
                        const arr = (data.faturamentoGeoMaximoManual && data.faturamentoGeoMaximoManual.length === 12) ? [...data.faturamentoGeoMaximoManual] : new Array(12).fill(null)
                        arr[index + 6] = value
                        const updated = { ...data, faturamentoGeoMaximoManual: arr }
                        setData(updated)
                        if (token) saveToServer(updated)
                      }}
                      category="faturamentoGeo"
                      monthIndex={index}
                    />
                  </td>
                ))}
                <td className="px-3 py-2">
                  <CalculatedCell value={calcularTrimestre(9, 11, (i) => calcularMaximoGeoMes(i))} />
                </td>
                {meses.slice(9, 12).map((_, index) => (
                  <td key={index + 9} className="px-3 py-2" style={{width: '100px', minWidth: '100px'}}>
                    <InputCell 
                      value={calcularMaximoGeoMes(index + 9)} 
                      onBlur={(value) => {
                        const arr = (data.faturamentoGeoMaximoManual && data.faturamentoGeoMaximoManual.length === 12) ? [...data.faturamentoGeoMaximoManual] : new Array(12).fill(null)
                        arr[index + 9] = value
                        const updated = { ...data, faturamentoGeoMaximoManual: arr }
                        setData(updated)
                        if (token) saveToServer(updated)
                      }}
                      category="faturamentoGeo"
                      monthIndex={index}
                    />
                  </td>
                ))}
                <td className="px-3 py-2">
                  <CalculatedCell value={calcularTotalGeral((i) => calcularMaximoGeoMes(i))} />
                </td>
                <td className="px-3 py-2">
                  <CalculatedCell value={calcularMedia((i) => calcularMaximoGeoMes(i))} />
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Legenda Faturamento GEO */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <h3 className="font-semibold text-blue-800 mb-2">Legenda Faturamento GEO:</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-blue-700">
          <div>
            <p><span className="font-semibold">Campos editáveis:</span> Todas as linhas (Previsto, Médio, Máximo)</p>
            <p><span className="font-semibold">Cálculo base:</span> GEO da tabela principal + Percentual</p>
          </div>
          <div>
            <p><span className="font-semibold">Persistência:</span> Valores editados são salvos no servidor</p>
            <p><span className="font-semibold">Uso:</span> Componente do Faturamento Total</p>
          </div>
        </div>
      </div>

      {/* Tabela Faturamento PLAN */}
      <div className="bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1200px]">
            <thead className="bg-blue-700 text-white">
              <tr>
                <th className="px-4 py-3 text-left font-bold sticky left-0 z-10 bg-blue-700">FATURAMENTO PLAN</th>
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
                <th className="px-3 py-3 text-center font-bold">TOTAL GERAL</th>
                <th className="px-3 py-3 text-center font-bold">MÉDIA</th>
              </tr>
            </thead>
            <tbody>
              {/* Linha Previsto */}
              <tr>
                <td className="px-4 py-3 text-gray-700 sticky left-0 z-10 bg-white">Previsto</td>
                <td className="px-3 py-2">
                  <CalculatedCell value={faturamentoPlanData.previsto[0] + faturamentoPlanData.previsto[1] + faturamentoPlanData.previsto[2]} />
                </td>
                {meses.slice(0, 3).map((_, index) => (
                  <td key={index} className="px-3 py-2" style={{width: '100px', minWidth: '100px'}}>
                    <InputCell 
                      value={faturamentoPlanData.previsto[index]} 
                      onBlur={(value: number) => {
                        const newData = {...faturamentoPlanData}
                        newData.previsto[index] = value
                        setFaturamentoPlanData(newData)
                        saveFaturamentoPlanToServer(newData)
                        
                        // Salvar também no estado principal para override manual
                        const arr = (data.faturamentoPlanPrevistoManual && data.faturamentoPlanPrevistoManual.length === 12) ? [...data.faturamentoPlanPrevistoManual] : new Array(12).fill(null)
                        arr[index] = value
                        const updated = { ...data, faturamentoPlanPrevistoManual: arr }
                        setData(updated)
                        if (token) saveToServer(updated)
                      }}
                      category="faturamentoPlan"
                      monthIndex={index}
                    />
                  </td>
                ))}
                <td className="px-3 py-2">
                  <CalculatedCell value={faturamentoPlanData.previsto[3] + faturamentoPlanData.previsto[4] + faturamentoPlanData.previsto[5]} />
                </td>
                {meses.slice(3, 6).map((_, index) => (
                  <td key={index + 3} className="px-3 py-2" style={{width: '100px', minWidth: '100px'}}>
                    <InputCell 
                      value={faturamentoPlanData.previsto[index + 3]} 
                      onBlur={(value: number) => {
                        const newData = {...faturamentoPlanData}
                        newData.previsto[index + 3] = value
                        setFaturamentoPlanData(newData)
                        saveFaturamentoPlanToServer(newData)
                        
                        // Salvar também no estado principal para override manual
                        const arr = (data.faturamentoPlanPrevistoManual && data.faturamentoPlanPrevistoManual.length === 12) ? [...data.faturamentoPlanPrevistoManual] : new Array(12).fill(null)
                        arr[index + 3] = value
                        const updated = { ...data, faturamentoPlanPrevistoManual: arr }
                        setData(updated)
                        if (token) saveToServer(updated)
                      }}
                      category="faturamentoPlan"
                      monthIndex={index}
                    />
                  </td>
                ))}
                <td className="px-3 py-2">
                  <CalculatedCell value={faturamentoPlanData.previsto[6] + faturamentoPlanData.previsto[7] + faturamentoPlanData.previsto[8]} />
                </td>
                {meses.slice(6, 9).map((_, index) => (
                  <td key={index + 6} className="px-3 py-2" style={{width: '100px', minWidth: '100px'}}>
                    <InputCell 
                      value={faturamentoPlanData.previsto[index + 6]} 
                      onBlur={(value: number) => {
                        const newData = {...faturamentoPlanData}
                        newData.previsto[index + 6] = value
                        setFaturamentoPlanData(newData)
                        saveFaturamentoPlanToServer(newData)
                        
                        // Salvar também no estado principal para override manual
                        const arr = (data.faturamentoPlanPrevistoManual && data.faturamentoPlanPrevistoManual.length === 12) ? [...data.faturamentoPlanPrevistoManual] : new Array(12).fill(null)
                        arr[index + 6] = value
                        const updated = { ...data, faturamentoPlanPrevistoManual: arr }
                        setData(updated)
                        if (token) saveToServer(updated)
                      }}
                      category="faturamentoPlan"
                      monthIndex={index}
                    />
                  </td>
                ))}
                <td className="px-3 py-2">
                  <CalculatedCell value={faturamentoPlanData.previsto[9] + faturamentoPlanData.previsto[10] + faturamentoPlanData.previsto[11]} />
                </td>
                {meses.slice(9, 12).map((_, index) => (
                  <td key={index + 9} className="px-3 py-2" style={{width: '100px', minWidth: '100px'}}>
                    <InputCell 
                      value={faturamentoPlanData.previsto[index + 9]} 
                      onBlur={(value: number) => {
                        const newData = {...faturamentoPlanData}
                        newData.previsto[index + 9] = value
                        setFaturamentoPlanData(newData)
                        saveFaturamentoPlanToServer(newData)
                        
                        // Salvar também no estado principal para override manual
                        const arr = (data.faturamentoPlanPrevistoManual && data.faturamentoPlanPrevistoManual.length === 12) ? [...data.faturamentoPlanPrevistoManual] : new Array(12).fill(null)
                        arr[index + 9] = value
                        const updated = { ...data, faturamentoPlanPrevistoManual: arr }
                        setData(updated)
                        if (token) saveToServer(updated)
                      }}
                      category="faturamentoPlan"
                      monthIndex={index}
                    />
                  </td>
                ))}
                <td className="px-3 py-2">
                  <CalculatedCell value={faturamentoPlanData.previsto.reduce((sum, v) => sum + v, 0)} />
                </td>
                <td className="px-3 py-2">
                  <CalculatedCell value={faturamentoPlanData.previsto.reduce((sum, v) => sum + v, 0) / 12} />
                </td>
              </tr>

              {/* Linha Médio */}
              <tr>
                <td className="px-4 py-3 text-gray-700 sticky left-0 z-10 bg-white">Médio</td>
                <td className="px-3 py-2">
                  <CalculatedCell value={calcularTrimestre(0, 2, (i) => calcularMedioPlanMes(i))} />
                </td>
                {meses.slice(0, 3).map((_, index) => (
                  <td key={index} className="px-3 py-2" style={{width: '100px', minWidth: '100px'}}>
                    <InputCell 
                      value={calcularMedioPlanMes(index)} 
                      onBlur={(value) => {
                        const arr = (data.faturamentoPlanMedioManual && data.faturamentoPlanMedioManual.length === 12) ? [...data.faturamentoPlanMedioManual] : new Array(12).fill(null)
                        arr[index] = value
                        const updated = { ...data, faturamentoPlanMedioManual: arr }
                        setData(updated)
                        if (token) saveToServer(updated)
                      }}
                      category="faturamentoPlan"
                      monthIndex={index}
                    />
                  </td>
                ))}
                <td className="px-3 py-2">
                  <CalculatedCell value={calcularTrimestre(3, 5, (i) => calcularMedioPlanMes(i))} />
                </td>
                {meses.slice(3, 6).map((_, index) => (
                  <td key={index + 3} className="px-3 py-2" style={{width: '100px', minWidth: '100px'}}>
                    <InputCell 
                      value={calcularMedioPlanMes(index + 3)} 
                      onBlur={(value) => {
                        const arr = (data.faturamentoPlanMedioManual && data.faturamentoPlanMedioManual.length === 12) ? [...data.faturamentoPlanMedioManual] : new Array(12).fill(null)
                        arr[index + 3] = value
                        const updated = { ...data, faturamentoPlanMedioManual: arr }
                        setData(updated)
                        if (token) saveToServer(updated)
                      }}
                      category="faturamentoPlan"
                      monthIndex={index}
                    />
                  </td>
                ))}
                <td className="px-3 py-2">
                  <CalculatedCell value={calcularTrimestre(6, 8, (i) => calcularMedioPlanMes(i))} />
                </td>
                {meses.slice(6, 9).map((_, index) => (
                  <td key={index + 6} className="px-3 py-2" style={{width: '100px', minWidth: '100px'}}>
                    <InputCell 
                      value={calcularMedioPlanMes(index + 6)} 
                      onBlur={(value) => {
                        const arr = (data.faturamentoPlanMedioManual && data.faturamentoPlanMedioManual.length === 12) ? [...data.faturamentoPlanMedioManual] : new Array(12).fill(null)
                        arr[index + 6] = value
                        const updated = { ...data, faturamentoPlanMedioManual: arr }
                        setData(updated)
                        if (token) saveToServer(updated)
                      }}
                      category="faturamentoPlan"
                      monthIndex={index}
                    />
                  </td>
                ))}
                <td className="px-3 py-2">
                  <CalculatedCell value={calcularTrimestre(9, 11, (i) => calcularMedioPlanMes(i))} />
                </td>
                {meses.slice(9, 12).map((_, index) => (
                  <td key={index + 9} className="px-3 py-2" style={{width: '100px', minWidth: '100px'}}>
                    <InputCell 
                      value={calcularMedioPlanMes(index + 9)} 
                      onBlur={(value) => {
                        const arr = (data.faturamentoPlanMedioManual && data.faturamentoPlanMedioManual.length === 12) ? [...data.faturamentoPlanMedioManual] : new Array(12).fill(null)
                        arr[index + 9] = value
                        const updated = { ...data, faturamentoPlanMedioManual: arr }
                        setData(updated)
                        if (token) saveToServer(updated)
                      }}
                      category="faturamentoPlan"
                      monthIndex={index}
                    />
                  </td>
                ))}
                <td className="px-3 py-2">
                  <CalculatedCell value={calcularTotalGeral((i) => calcularMedioPlanMes(i))} />
                </td>
                <td className="px-3 py-2">
                  <CalculatedCell value={calcularMedia((i) => calcularMedioPlanMes(i))} />
                </td>
              </tr>

              {/* Linha Máximo */}
              <tr>
                <td className="px-4 py-3 text-gray-700 sticky left-0 z-10 bg-white">Máximo</td>
                <td className="px-3 py-2">
                  <CalculatedCell value={calcularTrimestre(0, 2, (i) => calcularMaximoPlanMes(i))} />
                </td>
                {meses.slice(0, 3).map((_, index) => (
                  <td key={index} className="px-3 py-2" style={{width: '100px', minWidth: '100px'}}>
                    <InputCell 
                      value={calcularMaximoPlanMes(index)} 
                      onBlur={(value) => {
                        const arr = (data.faturamentoPlanMaximoManual && data.faturamentoPlanMaximoManual.length === 12) ? [...data.faturamentoPlanMaximoManual] : new Array(12).fill(null)
                        arr[index] = value
                        const updated = { ...data, faturamentoPlanMaximoManual: arr }
                        setData(updated)
                        if (token) saveToServer(updated)
                      }}
                      category="faturamentoPlan"
                      monthIndex={index}
                    />
                  </td>
                ))}
                <td className="px-3 py-2">
                  <CalculatedCell value={calcularTrimestre(3, 5, (i) => calcularMaximoPlanMes(i))} />
                </td>
                {meses.slice(3, 6).map((_, index) => (
                  <td key={index + 3} className="px-3 py-2" style={{width: '100px', minWidth: '100px'}}>
                    <InputCell 
                      value={calcularMaximoPlanMes(index + 3)} 
                      onBlur={(value) => {
                        const arr = (data.faturamentoPlanMaximoManual && data.faturamentoPlanMaximoManual.length === 12) ? [...data.faturamentoPlanMaximoManual] : new Array(12).fill(null)
                        arr[index + 3] = value
                        const updated = { ...data, faturamentoPlanMaximoManual: arr }
                        setData(updated)
                        if (token) saveToServer(updated)
                      }}
                      category="faturamentoPlan"
                      monthIndex={index}
                    />
                  </td>
                ))}
                <td className="px-3 py-2">
                  <CalculatedCell value={calcularTrimestre(6, 8, (i) => calcularMaximoPlanMes(i))} />
                </td>
                {meses.slice(6, 9).map((_, index) => (
                  <td key={index + 6} className="px-3 py-2" style={{width: '100px', minWidth: '100px'}}>
                    <InputCell 
                      value={calcularMaximoPlanMes(index + 6)} 
                      onBlur={(value) => {
                        const arr = (data.faturamentoPlanMaximoManual && data.faturamentoPlanMaximoManual.length === 12) ? [...data.faturamentoPlanMaximoManual] : new Array(12).fill(null)
                        arr[index + 6] = value
                        const updated = { ...data, faturamentoPlanMaximoManual: arr }
                        setData(updated)
                        if (token) saveToServer(updated)
                      }}
                      category="faturamentoPlan"
                      monthIndex={index}
                    />
                  </td>
                ))}
                <td className="px-3 py-2">
                  <CalculatedCell value={calcularTrimestre(9, 11, (i) => calcularMaximoPlanMes(i))} />
                </td>
                {meses.slice(9, 12).map((_, index) => (
                  <td key={index + 9} className="px-3 py-2" style={{width: '100px', minWidth: '100px'}}>
                    <InputCell 
                      value={calcularMaximoPlanMes(index + 9)} 
                      onBlur={(value) => {
                        const arr = (data.faturamentoPlanMaximoManual && data.faturamentoPlanMaximoManual.length === 12) ? [...data.faturamentoPlanMaximoManual] : new Array(12).fill(null)
                        arr[index + 9] = value
                        const updated = { ...data, faturamentoPlanMaximoManual: arr }
                        setData(updated)
                        if (token) saveToServer(updated)
                      }}
                      category="faturamentoPlan"
                      monthIndex={index}
                    />
                  </td>
                ))}
                <td className="px-3 py-2">
                  <CalculatedCell value={calcularTotalGeral((i) => calcularMaximoPlanMes(i))} />
                </td>
                <td className="px-3 py-2">
                  <CalculatedCell value={calcularMedia((i) => calcularMaximoPlanMes(i))} />
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Legenda Faturamento PLAN */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <h3 className="font-semibold text-blue-800 mb-2">Legenda Faturamento PLAN:</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-blue-700">
          <div>
            <p><span className="font-semibold">Campos editáveis:</span> Todas as linhas (Previsto, Médio, Máximo)</p>
            <p><span className="font-semibold">Cálculo base:</span> PLAN da tabela principal + Percentual</p>
          </div>
          <div>
            <p><span className="font-semibold">Persistência:</span> Valores editados são salvos no servidor</p>
            <p><span className="font-semibold">Uso:</span> Componente do Faturamento Total</p>
          </div>
        </div>
      </div>

      {/* Tabela Faturamento REG */}
      <div className="bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1200px]">
            <thead className="bg-yellow-700 text-white">
              <tr>
                <th className="px-4 py-3 text-left font-bold sticky left-0 z-10 bg-yellow-700">FATURAMENTO REG</th>
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
                <th className="px-3 py-3 text-center font-bold">TOTAL GERAL</th>
                <th className="px-3 py-3 text-center font-bold">MÉDIA</th>
              </tr>
            </thead>
            <tbody>
              {/* Linha Previsto */}
              <tr>
                <td className="px-4 py-3 text-gray-700 sticky left-0 z-10 bg-white">Previsto</td>
                <td className="px-3 py-2">
                  <CalculatedCell value={faturamentoRegData.previsto[0] + faturamentoRegData.previsto[1] + faturamentoRegData.previsto[2]} />
                </td>
                {meses.slice(0, 3).map((_, index) => (
                  <td key={index} className="px-3 py-2" style={{width: '100px', minWidth: '100px'}}>
                    <InputCell 
                      value={faturamentoRegData.previsto[index]} 
                      onBlur={(value: number) => {
                        const newData = {...faturamentoRegData}
                        newData.previsto[index] = value
                        setFaturamentoRegData(newData)
                        saveFaturamentoRegToServer(newData)
                        
                        // Salvar também no estado principal para override manual
                        const arr = (data.faturamentoRegPrevistoManual && data.faturamentoRegPrevistoManual.length === 12) ? [...data.faturamentoRegPrevistoManual] : new Array(12).fill(null)
                        arr[index] = value
                        const updated = { ...data, faturamentoRegPrevistoManual: arr }
                        setData(updated)
                        if (token) saveToServer(updated)
                      }}
                      category="faturamentoReg"
                      monthIndex={index}
                    />
                  </td>
                ))}
                <td className="px-3 py-2">
                  <CalculatedCell value={faturamentoRegData.previsto[3] + faturamentoRegData.previsto[4] + faturamentoRegData.previsto[5]} />
                </td>
                {meses.slice(3, 6).map((_, index) => (
                  <td key={index + 3} className="px-3 py-2" style={{width: '100px', minWidth: '100px'}}>
                    <InputCell 
                      value={faturamentoRegData.previsto[index + 3]} 
                      onBlur={(value: number) => {
                        const newData = {...faturamentoRegData}
                        newData.previsto[index + 3] = value
                        setFaturamentoRegData(newData)
                        saveFaturamentoRegToServer(newData)
                        
                        // Salvar também no estado principal para override manual
                        const arr = (data.faturamentoRegPrevistoManual && data.faturamentoRegPrevistoManual.length === 12) ? [...data.faturamentoRegPrevistoManual] : new Array(12).fill(null)
                        arr[index + 3] = value
                        const updated = { ...data, faturamentoRegPrevistoManual: arr }
                        setData(updated)
                        if (token) saveToServer(updated)
                      }}
                      category="faturamentoReg"
                      monthIndex={index}
                    />
                  </td>
                ))}
                <td className="px-3 py-2">
                  <CalculatedCell value={faturamentoRegData.previsto[6] + faturamentoRegData.previsto[7] + faturamentoRegData.previsto[8]} />
                </td>
                {meses.slice(6, 9).map((_, index) => (
                  <td key={index + 6} className="px-3 py-2" style={{width: '100px', minWidth: '100px'}}>
                    <InputCell 
                      value={faturamentoRegData.previsto[index + 6]} 
                      onBlur={(value: number) => {
                        const newData = {...faturamentoRegData}
                        newData.previsto[index + 6] = value
                        setFaturamentoRegData(newData)
                        saveFaturamentoRegToServer(newData)
                        
                        // Salvar também no estado principal para override manual
                        const arr = (data.faturamentoRegPrevistoManual && data.faturamentoRegPrevistoManual.length === 12) ? [...data.faturamentoRegPrevistoManual] : new Array(12).fill(null)
                        arr[index + 6] = value
                        const updated = { ...data, faturamentoRegPrevistoManual: arr }
                        setData(updated)
                        if (token) saveToServer(updated)
                      }}
                      category="faturamentoReg"
                      monthIndex={index}
                    />
                  </td>
                ))}
                <td className="px-3 py-2">
                  <CalculatedCell value={faturamentoRegData.previsto[9] + faturamentoRegData.previsto[10] + faturamentoRegData.previsto[11]} />
                </td>
                {meses.slice(9, 12).map((_, index) => (
                  <td key={index + 9} className="px-3 py-2" style={{width: '100px', minWidth: '100px'}}>
                    <InputCell 
                      value={faturamentoRegData.previsto[index + 9]} 
                      onBlur={(value: number) => {
                        const newData = {...faturamentoRegData}
                        newData.previsto[index + 9] = value
                        setFaturamentoRegData(newData)
                        saveFaturamentoRegToServer(newData)
                        
                        // Salvar também no estado principal para override manual
                        const arr = (data.faturamentoRegPrevistoManual && data.faturamentoRegPrevistoManual.length === 12) ? [...data.faturamentoRegPrevistoManual] : new Array(12).fill(null)
                        arr[index + 9] = value
                        const updated = { ...data, faturamentoRegPrevistoManual: arr }
                        setData(updated)
                        if (token) saveToServer(updated)
                      }}
                      category="faturamentoReg"
                      monthIndex={index}
                    />
                  </td>
                ))}
                <td className="px-3 py-2">
                  <CalculatedCell value={faturamentoRegData.previsto.reduce((sum, v) => sum + v, 0)} />
                </td>
                <td className="px-3 py-2">
                  <CalculatedCell value={faturamentoRegData.previsto.reduce((sum, v) => sum + v, 0) / 12} />
                </td>
              </tr>

              {/* Linha Médio */}
              <tr>
                <td className="px-4 py-3 text-gray-700 sticky left-0 z-10 bg-white">Médio</td>
                <td className="px-3 py-2">
                  <CalculatedCell value={calcularTrimestre(0, 2, (i) => calcularMedioRegMes(i))} />
                </td>
                {meses.slice(0, 3).map((_, index) => (
                  <td key={index} className="px-3 py-2" style={{width: '100px', minWidth: '100px'}}>
                    <InputCell 
                      value={calcularMedioRegMes(index)} 
                      onBlur={(value) => {
                        const arr = (data.faturamentoRegMedioManual && data.faturamentoRegMedioManual.length === 12) ? [...data.faturamentoRegMedioManual] : new Array(12).fill(null)
                        arr[index] = value
                        const updated = { ...data, faturamentoRegMedioManual: arr }
                        setData(updated)
                        if (token) saveToServer(updated)
                      }}
                      category="faturamentoReg"
                      monthIndex={index}
                    />
                  </td>
                ))}
                <td className="px-3 py-2">
                  <CalculatedCell value={calcularTrimestre(3, 5, (i) => calcularMedioRegMes(i))} />
                </td>
                {meses.slice(3, 6).map((_, index) => (
                  <td key={index + 3} className="px-3 py-2" style={{width: '100px', minWidth: '100px'}}>
                    <InputCell 
                      value={calcularMedioRegMes(index + 3)} 
                      onBlur={(value) => {
                        const arr = (data.faturamentoRegMedioManual && data.faturamentoRegMedioManual.length === 12) ? [...data.faturamentoRegMedioManual] : new Array(12).fill(null)
                        arr[index + 3] = value
                        const updated = { ...data, faturamentoRegMedioManual: arr }
                        setData(updated)
                        if (token) saveToServer(updated)
                      }}
                      category="faturamentoReg"
                      monthIndex={index}
                    />
                  </td>
                ))}
                <td className="px-3 py-2">
                  <CalculatedCell value={calcularTrimestre(6, 8, (i) => calcularMedioRegMes(i))} />
                </td>
                {meses.slice(6, 9).map((_, index) => (
                  <td key={index + 6} className="px-3 py-2" style={{width: '100px', minWidth: '100px'}}>
                    <InputCell 
                      value={calcularMedioRegMes(index + 6)} 
                      onBlur={(value) => {
                        const arr = (data.faturamentoRegMedioManual && data.faturamentoRegMedioManual.length === 12) ? [...data.faturamentoRegMedioManual] : new Array(12).fill(null)
                        arr[index + 6] = value
                        const updated = { ...data, faturamentoRegMedioManual: arr }
                        setData(updated)
                        if (token) saveToServer(updated)
                      }}
                      category="faturamentoReg"
                      monthIndex={index}
                    />
                  </td>
                ))}
                <td className="px-3 py-2">
                  <CalculatedCell value={calcularTrimestre(9, 11, (i) => calcularMedioRegMes(i))} />
                </td>
                {meses.slice(9, 12).map((_, index) => (
                  <td key={index + 9} className="px-3 py-2" style={{width: '100px', minWidth: '100px'}}>
                    <InputCell 
                      value={calcularMedioRegMes(index + 9)} 
                      onBlur={(value) => {
                        const arr = (data.faturamentoRegMedioManual && data.faturamentoRegMedioManual.length === 12) ? [...data.faturamentoRegMedioManual] : new Array(12).fill(null)
                        arr[index + 9] = value
                        const updated = { ...data, faturamentoRegMedioManual: arr }
                        setData(updated)
                        if (token) saveToServer(updated)
                      }}
                      category="faturamentoReg"
                      monthIndex={index}
                    />
                  </td>
                ))}
                <td className="px-3 py-2">
                  <CalculatedCell value={calcularTotalGeral((i) => calcularMedioRegMes(i))} />
                </td>
                <td className="px-3 py-2">
                  <CalculatedCell value={calcularMedia((i) => calcularMedioRegMes(i))} />
                </td>
              </tr>

              {/* Linha Máximo */}
              <tr>
                <td className="px-4 py-3 text-gray-700 sticky left-0 z-10 bg-white">Máximo</td>
                <td className="px-3 py-2">
                  <CalculatedCell value={calcularTrimestre(0, 2, (i) => calcularMaximoRegMes(i))} />
                </td>
                {meses.slice(0, 3).map((_, index) => (
                  <td key={index} className="px-3 py-2" style={{width: '100px', minWidth: '100px'}}>
                    <InputCell 
                      value={calcularMaximoRegMes(index)} 
                      onBlur={(value) => {
                        const arr = (data.faturamentoRegMaximoManual && data.faturamentoRegMaximoManual.length === 12) ? [...data.faturamentoRegMaximoManual] : new Array(12).fill(null)
                        arr[index] = value
                        const updated = { ...data, faturamentoRegMaximoManual: arr }
                        setData(updated)
                        if (token) saveToServer(updated)
                      }}
                      category="faturamentoReg"
                      monthIndex={index}
                    />
                  </td>
                ))}
                <td className="px-3 py-2">
                  <CalculatedCell value={calcularTrimestre(3, 5, (i) => calcularMaximoRegMes(i))} />
                </td>
                {meses.slice(3, 6).map((_, index) => (
                  <td key={index + 3} className="px-3 py-2" style={{width: '100px', minWidth: '100px'}}>
                    <InputCell 
                      value={calcularMaximoRegMes(index + 3)} 
                      onBlur={(value) => {
                        const arr = (data.faturamentoRegMaximoManual && data.faturamentoRegMaximoManual.length === 12) ? [...data.faturamentoRegMaximoManual] : new Array(12).fill(null)
                        arr[index + 3] = value
                        const updated = { ...data, faturamentoRegMaximoManual: arr }
                        setData(updated)
                        if (token) saveToServer(updated)
                      }}
                      category="faturamentoReg"
                      monthIndex={index}
                    />
                  </td>
                ))}
                <td className="px-3 py-2">
                  <CalculatedCell value={calcularTrimestre(6, 8, (i) => calcularMaximoRegMes(i))} />
                </td>
                {meses.slice(6, 9).map((_, index) => (
                  <td key={index + 6} className="px-3 py-2" style={{width: '100px', minWidth: '100px'}}>
                    <InputCell 
                      value={calcularMaximoRegMes(index + 6)} 
                      onBlur={(value) => {
                        const arr = (data.faturamentoRegMaximoManual && data.faturamentoRegMaximoManual.length === 12) ? [...data.faturamentoRegMaximoManual] : new Array(12).fill(null)
                        arr[index + 6] = value
                        const updated = { ...data, faturamentoRegMaximoManual: arr }
                        setData(updated)
                        if (token) saveToServer(updated)
                      }}
                      category="faturamentoReg"
                      monthIndex={index}
                    />
                  </td>
                ))}
                <td className="px-3 py-2">
                  <CalculatedCell value={calcularTrimestre(9, 11, (i) => calcularMaximoRegMes(i))} />
                </td>
                {meses.slice(9, 12).map((_, index) => (
                  <td key={index + 9} className="px-3 py-2" style={{width: '100px', minWidth: '100px'}}>
                    <InputCell 
                      value={calcularMaximoRegMes(index + 9)} 
                      onBlur={(value) => {
                        const arr = (data.faturamentoRegMaximoManual && data.faturamentoRegMaximoManual.length === 12) ? [...data.faturamentoRegMaximoManual] : new Array(12).fill(null)
                        arr[index + 9] = value
                        const updated = { ...data, faturamentoRegMaximoManual: arr }
                        setData(updated)
                        if (token) saveToServer(updated)
                      }}
                      category="faturamentoReg"
                      monthIndex={index}
                    />
                  </td>
                ))}
                <td className="px-3 py-2">
                  <CalculatedCell value={calcularTotalGeral((i) => calcularMaximoRegMes(i))} />
                </td>
                <td className="px-3 py-2">
                  <CalculatedCell value={calcularMedia((i) => calcularMaximoRegMes(i))} />
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Legenda Faturamento REG */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <h3 className="font-semibold text-blue-800 mb-2">Legenda Faturamento REG:</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-blue-700">
          <div>
            <p><span className="font-semibold">Campos editáveis:</span> Todas as linhas (Previsto, Médio, Máximo)</p>
            <p><span className="font-semibold">Cálculo base:</span> REG da tabela principal + Percentual</p>
          </div>
          <div>
            <p><span className="font-semibold">Persistência:</span> Valores editados são salvos no servidor</p>
            <p><span className="font-semibold">Uso:</span> Componente do Faturamento Total</p>
          </div>
        </div>
      </div>

      {/* Tabela Faturamento NN */}
      <div className="bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1200px]">
            <thead className="bg-gray-700 text-white">
              <tr>
                <th className="px-4 py-3 text-left font-bold sticky left-0 z-10 bg-gray-700">FATURAMENTO NN</th>
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
                <th className="px-3 py-3 text-center font-bold">TOTAL GERAL</th>
                <th className="px-3 py-3 text-center font-bold">MÉDIA</th>
              </tr>
            </thead>
            <tbody>
              {/* Linha Previsto */}
              <tr>
                <td className="px-4 py-3 text-gray-700 sticky left-0 z-10 bg-white">Previsto</td>
                <td className="px-3 py-2">
                  <CalculatedCell value={faturamentoNnData.previsto[0] + faturamentoNnData.previsto[1] + faturamentoNnData.previsto[2]} />
                </td>
                {meses.slice(0, 3).map((_, index) => (
                  <td key={index} className="px-3 py-2" style={{width: '100px', minWidth: '100px'}}>
                    <InputCell 
                      value={faturamentoNnData.previsto[index]} 
                      onBlur={(value: number) => {
                        const newData = {...faturamentoNnData}
                        newData.previsto[index] = value
                        setFaturamentoNnData(newData)
                        saveFaturamentoNnToServer(newData)
                        
                        // Salvar também no estado principal para override manual
                        const arr = (data.faturamentoNnPrevistoManual && data.faturamentoNnPrevistoManual.length === 12) ? [...data.faturamentoNnPrevistoManual] : new Array(12).fill(null)
                        arr[index] = value
                        const updated = { ...data, faturamentoNnPrevistoManual: arr }
                        setData(updated)
                        if (token) saveToServer(updated)
                      }}
                      category="faturamentoNn"
                      monthIndex={index}
                    />
                  </td>
                ))}
                <td className="px-3 py-2">
                  <CalculatedCell value={faturamentoNnData.previsto[3] + faturamentoNnData.previsto[4] + faturamentoNnData.previsto[5]} />
                </td>
                {meses.slice(3, 6).map((_, index) => (
                  <td key={index + 3} className="px-3 py-2" style={{width: '100px', minWidth: '100px'}}>
                    <InputCell 
                      value={faturamentoNnData.previsto[index + 3]} 
                      onBlur={(value: number) => {
                        const newData = {...faturamentoNnData}
                        newData.previsto[index + 3] = value
                        setFaturamentoNnData(newData)
                        saveFaturamentoNnToServer(newData)
                        
                        // Salvar também no estado principal para override manual
                        const arr = (data.faturamentoNnPrevistoManual && data.faturamentoNnPrevistoManual.length === 12) ? [...data.faturamentoNnPrevistoManual] : new Array(12).fill(null)
                        arr[index + 3] = value
                        const updated = { ...data, faturamentoNnPrevistoManual: arr }
                        setData(updated)
                        if (token) saveToServer(updated)
                      }}
                      category="faturamentoNn"
                      monthIndex={index}
                    />
                  </td>
                ))}
                <td className="px-3 py-2">
                  <CalculatedCell value={calcularTrimestre(6, 8, (i) => calcularPrevistoNnMes(i))} />
                </td>
                {meses.slice(6, 9).map((_, index) => (
                  <td key={index + 6} className="px-3 py-2" style={{width: '100px', minWidth: '100px'}}>
                    <InputCell 
                      value={calcularPrevistoNnMes(index + 6)} 
                      onBlur={(value) => {
                        const arr = (data.faturamentoNnPrevistoManual && data.faturamentoNnPrevistoManual.length === 12) ? [...data.faturamentoNnPrevistoManual] : new Array(12).fill(null)
                        arr[index + 6] = value
                        const updated = { ...data, faturamentoNnPrevistoManual: arr }
                        setData(updated)
                        if (token) saveToServer(updated)
                      }}
                      category="faturamentoNn"
                      monthIndex={index + 6}
                    />
                  </td>
                ))}
                <td className="px-3 py-2">
                  <CalculatedCell value={calcularTrimestre(9, 11, (i) => calcularPrevistoNnMes(i))} />
                </td>
                {meses.slice(9, 12).map((_, index) => (
                  <td key={index + 9} className="px-3 py-2" style={{width: '100px', minWidth: '100px'}}>
                    <InputCell 
                      value={calcularPrevistoNnMes(index + 9)} 
                      onBlur={(value) => {
                        console.log(`🔵 Salvando Outubro NN: ${value}, index: ${index + 9}`)
                        const arr = (data.faturamentoNnPrevistoManual && data.faturamentoNnPrevistoManual.length === 12) ? [...data.faturamentoNnPrevistoManual] : new Array(12).fill(null)
                        arr[index + 9] = value
                        console.log(`🔵 Array manual NN:`, arr)
                        const updated = { ...data, faturamentoNnPrevistoManual: arr }
                        setData(updated)
                        console.log(`🔵 Salvando no projection.json...`)
                        if (token) saveToServer(updated)
                        
                        // Salvar também no arquivo faturamentoNn.json
                        const newData = {...faturamentoNnData}
                        newData.previsto[index + 9] = value
                        setFaturamentoNnData(newData)
                        console.log(`🔵 Salvando no faturamentoNn.json...`)
                        saveFaturamentoNnToServer(newData)
                      }}
                      category="faturamentoNn"
                      monthIndex={index + 9}
                    />
                  </td>
                ))}
                <td className="px-3 py-2">
                  <CalculatedCell value={calcularTotalGeral((i) => calcularPrevistoNnMes(i))} />
                </td>
                <td className="px-3 py-2">
                  <CalculatedCell value={calcularMedia((i) => calcularPrevistoNnMes(i))} />
                </td>
              </tr>

              {/* Linha Médio */}
              <tr>
                <td className="px-4 py-3 text-gray-700 sticky left-0 z-10 bg-white">Médio</td>
                <td className="px-3 py-2">
                  <CalculatedCell value={calcularTrimestre(0, 2, (i) => calcularMedioNnMes(i))} />
                </td>
                {meses.slice(0, 3).map((_, index) => (
                  <td key={index} className="px-3 py-2" style={{width: '100px', minWidth: '100px'}}>
                    <InputCell 
                      value={calcularMedioNnMes(index)} 
                      onBlur={(value) => {
                        const arr = (data.faturamentoNnMedioManual && data.faturamentoNnMedioManual.length === 12) ? [...data.faturamentoNnMedioManual] : new Array(12).fill(null)
                        arr[index] = value
                        const updated = { ...data, faturamentoNnMedioManual: arr }
                        setData(updated)
                        if (token) saveToServer(updated)
                      }}
                      category="faturamentoNn"
                      monthIndex={index}
                    />
                  </td>
                ))}
                <td className="px-3 py-2">
                  <CalculatedCell value={calcularTrimestre(3, 5, (i) => calcularMedioNnMes(i))} />
                </td>
                {meses.slice(3, 6).map((_, index) => (
                  <td key={index + 3} className="px-3 py-2" style={{width: '100px', minWidth: '100px'}}>
                    <InputCell 
                      value={calcularMedioNnMes(index + 3)} 
                      onBlur={(value) => {
                        const arr = (data.faturamentoNnMedioManual && data.faturamentoNnMedioManual.length === 12) ? [...data.faturamentoNnMedioManual] : new Array(12).fill(null)
                        arr[index + 3] = value
                        const updated = { ...data, faturamentoNnMedioManual: arr }
                        setData(updated)
                        if (token) saveToServer(updated)
                      }}
                      category="faturamentoNn"
                      monthIndex={index}
                    />
                  </td>
                ))}
                <td className="px-3 py-2">
                  <CalculatedCell value={calcularTrimestre(6, 8, (i) => calcularMedioNnMes(i))} />
                </td>
                {meses.slice(6, 9).map((_, index) => (
                  <td key={index + 6} className="px-3 py-2" style={{width: '100px', minWidth: '100px'}}>
                    <InputCell 
                      value={calcularMedioNnMes(index + 6)} 
                      onBlur={(value) => {
                        const arr = (data.faturamentoNnMedioManual && data.faturamentoNnMedioManual.length === 12) ? [...data.faturamentoNnMedioManual] : new Array(12).fill(null)
                        arr[index + 6] = value
                        const updated = { ...data, faturamentoNnMedioManual: arr }
                        setData(updated)
                        if (token) saveToServer(updated)
                      }}
                      category="faturamentoNn"
                      monthIndex={index}
                    />
                  </td>
                ))}
                <td className="px-3 py-2">
                  <CalculatedCell value={calcularTrimestre(9, 11, (i) => calcularMedioNnMes(i))} />
                </td>
                {meses.slice(9, 12).map((_, index) => (
                  <td key={index + 9} className="px-3 py-2" style={{width: '100px', minWidth: '100px'}}>
                    <InputCell 
                      value={calcularMedioNnMes(index + 9)} 
                      onBlur={(value) => {
                        const arr = (data.faturamentoNnMedioManual && data.faturamentoNnMedioManual.length === 12) ? [...data.faturamentoNnMedioManual] : new Array(12).fill(null)
                        arr[index + 9] = value
                        const updated = { ...data, faturamentoNnMedioManual: arr }
                        setData(updated)
                        if (token) saveToServer(updated)
                      }}
                      category="faturamentoNn"
                      monthIndex={index}
                    />
                  </td>
                ))}
                <td className="px-3 py-2">
                  <CalculatedCell value={calcularTotalGeral((i) => calcularMedioNnMes(i))} />
                </td>
                <td className="px-3 py-2">
                  <CalculatedCell value={calcularMedia((i) => calcularMedioNnMes(i))} />
                </td>
              </tr>

              {/* Linha Máximo */}
              <tr>
                <td className="px-4 py-3 text-gray-700 sticky left-0 z-10 bg-white">Máximo</td>
                <td className="px-3 py-2">
                  <CalculatedCell value={calcularTrimestre(0, 2, (i) => calcularMaximoNnMes(i))} />
                </td>
                {meses.slice(0, 3).map((_, index) => (
                  <td key={index} className="px-3 py-2" style={{width: '100px', minWidth: '100px'}}>
                    <InputCell 
                      value={calcularMaximoNnMes(index)} 
                      onBlur={(value) => {
                        const arr = (data.faturamentoNnMaximoManual && data.faturamentoNnMaximoManual.length === 12) ? [...data.faturamentoNnMaximoManual] : new Array(12).fill(null)
                        arr[index] = value
                        const updated = { ...data, faturamentoNnMaximoManual: arr }
                        setData(updated)
                        if (token) saveToServer(updated)
                      }}
                      category="faturamentoNn"
                      monthIndex={index}
                    />
                  </td>
                ))}
                <td className="px-3 py-2">
                  <CalculatedCell value={calcularTrimestre(3, 5, (i) => calcularMaximoNnMes(i))} />
                </td>
                {meses.slice(3, 6).map((_, index) => (
                  <td key={index + 3} className="px-3 py-2" style={{width: '100px', minWidth: '100px'}}>
                    <InputCell 
                      value={calcularMaximoNnMes(index + 3)} 
                      onBlur={(value) => {
                        const arr = (data.faturamentoNnMaximoManual && data.faturamentoNnMaximoManual.length === 12) ? [...data.faturamentoNnMaximoManual] : new Array(12).fill(null)
                        arr[index + 3] = value
                        const updated = { ...data, faturamentoNnMaximoManual: arr }
                        setData(updated)
                        if (token) saveToServer(updated)
                      }}
                      category="faturamentoNn"
                      monthIndex={index}
                    />
                  </td>
                ))}
                <td className="px-3 py-2">
                  <CalculatedCell value={calcularTrimestre(6, 8, (i) => calcularMaximoNnMes(i))} />
                </td>
                {meses.slice(6, 9).map((_, index) => (
                  <td key={index + 6} className="px-3 py-2" style={{width: '100px', minWidth: '100px'}}>
                    <InputCell 
                      value={calcularMaximoNnMes(index + 6)} 
                      onBlur={(value) => {
                        const arr = (data.faturamentoNnMaximoManual && data.faturamentoNnMaximoManual.length === 12) ? [...data.faturamentoNnMaximoManual] : new Array(12).fill(null)
                        arr[index + 6] = value
                        const updated = { ...data, faturamentoNnMaximoManual: arr }
                        setData(updated)
                        if (token) saveToServer(updated)
                      }}
                      category="faturamentoNn"
                      monthIndex={index}
                    />
                  </td>
                ))}
                <td className="px-3 py-2">
                  <CalculatedCell value={calcularTrimestre(9, 11, (i) => calcularMaximoNnMes(i))} />
                </td>
                {meses.slice(9, 12).map((_, index) => (
                  <td key={index + 9} className="px-3 py-2" style={{width: '100px', minWidth: '100px'}}>
                    <InputCell 
                      value={calcularMaximoNnMes(index + 9)} 
                      onBlur={(value) => {
                        const arr = (data.faturamentoNnMaximoManual && data.faturamentoNnMaximoManual.length === 12) ? [...data.faturamentoNnMaximoManual] : new Array(12).fill(null)
                        arr[index + 9] = value
                        const updated = { ...data, faturamentoNnMaximoManual: arr }
                        setData(updated)
                        if (token) saveToServer(updated)
                      }}
                      category="faturamentoNn"
                      monthIndex={index}
                    />
                  </td>
                ))}
                <td className="px-3 py-2">
                  <CalculatedCell value={calcularTotalGeral((i) => calcularMaximoNnMes(i))} />
                </td>
                <td className="px-3 py-2">
                  <CalculatedCell value={calcularMedia((i) => calcularMaximoNnMes(i))} />
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Legenda Faturamento NN */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <h3 className="font-semibold text-blue-800 mb-2">Legenda Faturamento NN:</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-blue-700">
          <div>
            <p><span className="font-semibold">Campos editáveis:</span> Todas as linhas (Previsto, Médio, Máximo)</p>
            <p><span className="font-semibold">Cálculo base:</span> NN da tabela principal + Percentual</p>
          </div>
          <div>
            <p><span className="font-semibold">Persistência:</span> Valores editados são salvos no servidor</p>
            <p><span className="font-semibold">Uso:</span> Componente do Faturamento Total</p>
          </div>
        </div>
      </div>

      {/* Tabela FATURAMENTO TOTAL */}
      <div className="mb-8">
        <div className="overflow-x-auto rounded-lg bg-white shadow-lg">
          <table className="w-full border-collapse">
            <thead>
              <tr className="bg-gradient-to-r from-purple-600 to-purple-800 text-white">
                <th className="px-4 py-3 text-left sticky left-0 z-10" style={{backgroundColor: '#8639DE'}}>FATURAMENTO TOTAL</th>
                <th className="px-3 py-3 text-center">1º TRI</th>
                <th className="px-3 py-2 text-center" style={{width: '100px', minWidth: '100px'}}>Janeiro</th>
                <th className="px-3 py-2 text-center" style={{width: '100px', minWidth: '100px'}}>Fevereiro</th>
                <th className="px-3 py-2 text-center" style={{width: '100px', minWidth: '100px'}}>Março</th>
                <th className="px-3 py-3 text-center">2º TRI</th>
                <th className="px-3 py-2 text-center" style={{width: '100px', minWidth: '100px'}}>Abril</th>
                <th className="px-3 py-2 text-center" style={{width: '100px', minWidth: '100px'}}>Maio</th>
                <th className="px-3 py-2 text-center" style={{width: '100px', minWidth: '100px'}}>Junho</th>
                <th className="px-3 py-3 text-center">3º TRI</th>
                <th className="px-3 py-2 text-center" style={{width: '100px', minWidth: '100px'}}>Julho</th>
                <th className="px-3 py-2 text-center" style={{width: '100px', minWidth: '100px'}}>Agosto</th>
                <th className="px-3 py-2 text-center" style={{width: '100px', minWidth: '100px'}}>Setembro</th>
                <th className="px-3 py-3 text-center">4º TRI</th>
                <th className="px-3 py-2 text-center" style={{width: '100px', minWidth: '100px'}}>Outubro</th>
                <th className="px-3 py-2 text-center" style={{width: '100px', minWidth: '100px'}}>Novembro</th>
                <th className="px-3 py-2 text-center" style={{width: '100px', minWidth: '100px'}}>Dezembro</th>
                <th className="px-3 py-3 text-center">Total Geral</th>
                <th className="px-3 py-3 text-center">Média</th>
              </tr>
            </thead>
            <tbody>
              {/* Linha Previsto */}
              <tr>
                <td className="px-4 py-3 text-gray-700 sticky left-0 z-10 bg-white">Previsto</td>
                <td className="px-3 py-2">
                  <CalculatedCell value={
                    (
                      (faturamentoReurbData.previsto[0] + faturamentoGeoData.previsto[0] + faturamentoPlanData.previsto[0] + faturamentoRegData.previsto[0] + faturamentoNnData.previsto[0]) +
                      (faturamentoReurbData.previsto[1] + faturamentoGeoData.previsto[1] + faturamentoPlanData.previsto[1] + faturamentoRegData.previsto[1] + faturamentoNnData.previsto[1]) +
                      (faturamentoReurbData.previsto[2] + faturamentoGeoData.previsto[2] + faturamentoPlanData.previsto[2] + faturamentoRegData.previsto[2] + faturamentoNnData.previsto[2])
                    )
                  } />
                </td>
                {meses.slice(0, 3).map((_, index) => (
                  <td key={index} className="px-3 py-2" style={{width: '100px', minWidth: '100px'}}>
                    <CalculatedCell value={faturamentoTotalData.previsto[index]} />
                  </td>
                ))}
                <td className="px-3 py-2">
                  <CalculatedCell value={
                    (
                      (faturamentoReurbData.previsto[3] + faturamentoGeoData.previsto[3] + faturamentoPlanData.previsto[3] + faturamentoRegData.previsto[3] + faturamentoNnData.previsto[3]) +
                      (faturamentoReurbData.previsto[4] + faturamentoGeoData.previsto[4] + faturamentoPlanData.previsto[4] + faturamentoRegData.previsto[4] + faturamentoNnData.previsto[4]) +
                      (faturamentoReurbData.previsto[5] + faturamentoGeoData.previsto[5] + faturamentoPlanData.previsto[5] + faturamentoRegData.previsto[5] + faturamentoNnData.previsto[5])
                    )
                  } />
                </td>
                {meses.slice(3, 6).map((_, index) => (
                  <td key={index + 3} className="px-3 py-2" style={{width: '100px', minWidth: '100px'}}>
                    <CalculatedCell value={faturamentoTotalData.previsto[index + 3]} />
                  </td>
                ))}
                <td className="px-3 py-2">
                  <CalculatedCell value={
                    (
                      (faturamentoReurbData.previsto[6] + faturamentoGeoData.previsto[6] + faturamentoPlanData.previsto[6] + faturamentoRegData.previsto[6] + faturamentoNnData.previsto[6]) +
                      (faturamentoReurbData.previsto[7] + faturamentoGeoData.previsto[7] + faturamentoPlanData.previsto[7] + faturamentoRegData.previsto[7] + faturamentoNnData.previsto[7]) +
                      (faturamentoReurbData.previsto[8] + faturamentoGeoData.previsto[8] + faturamentoPlanData.previsto[8] + faturamentoRegData.previsto[8] + faturamentoNnData.previsto[8])
                    )
                  } />
                </td>
                {meses.slice(6, 9).map((_, index) => (
                  <td key={index + 6} className="px-3 py-2" style={{width: '100px', minWidth: '100px'}}>
                    <CalculatedCell value={faturamentoTotalData.previsto[index + 6]} />
                  </td>
                ))}
                <td className="px-3 py-2">
                  <CalculatedCell value={
                    (
                      (faturamentoReurbData.previsto[9] + faturamentoGeoData.previsto[9] + faturamentoPlanData.previsto[9] + faturamentoRegData.previsto[9] + faturamentoNnData.previsto[9]) +
                      (faturamentoReurbData.previsto[10] + faturamentoGeoData.previsto[10] + faturamentoPlanData.previsto[10] + faturamentoRegData.previsto[10] + faturamentoNnData.previsto[10]) +
                      (faturamentoReurbData.previsto[11] + faturamentoGeoData.previsto[11] + faturamentoPlanData.previsto[11] + faturamentoRegData.previsto[11] + faturamentoNnData.previsto[11])
                    )
                  } />
                </td>
                {meses.slice(9, 12).map((_, index) => (
                  <td key={index + 9} className="px-3 py-2" style={{width: '100px', minWidth: '100px'}}>
                    <CalculatedCell value={faturamentoTotalData.previsto[index + 9]} />
                  </td>
                ))}
                <td className="px-3 py-2">
                  <CalculatedCell value={faturamentoTotalData.previsto.reduce((sum, value) => sum + value, 0)} />
                </td>
                <td className="px-3 py-2">
                  <CalculatedCell value={faturamentoTotalData.previsto.reduce((sum, value) => sum + value, 0) / 12} />
                </td>
              </tr>

              {/* Linha Médio */}
              <tr>
                <td className="px-4 py-3 text-gray-700 sticky left-0 z-10 bg-white">Médio</td>
                <td className="px-3 py-2">
                  <CalculatedCell value={
                    (
                      (faturamentoTotalData.medio[0]) +
                      (faturamentoTotalData.medio[1]) +
                      (faturamentoTotalData.medio[2])
                    )
                  } />
                </td>
                {meses.slice(0, 3).map((_, index) => (
                  <td key={index} className="px-3 py-2" style={{width: '100px', minWidth: '100px'}}>
                    <CalculatedCell value={faturamentoTotalData.medio[index]} />
                  </td>
                ))}
                <td className="px-3 py-2">
                  <CalculatedCell value={
                    (
                      (faturamentoTotalData.medio[3]) +
                      (faturamentoTotalData.medio[4]) +
                      (faturamentoTotalData.medio[5])
                    )
                  } />
                </td>
                {meses.slice(3, 6).map((_, index) => (
                  <td key={index + 3} className="px-3 py-2" style={{width: '100px', minWidth: '100px'}}>
                    <CalculatedCell value={
                      (faturamentoTotalData.medio[index + 3])
                    } />
                  </td>
                ))}
                <td className="px-3 py-2">
                  <CalculatedCell value={
                    (
                      (faturamentoTotalData.medio[6]) +
                      (faturamentoTotalData.medio[7]) +
                      (faturamentoTotalData.medio[8])
                    )
                  } />
                </td>
                {meses.slice(6, 9).map((_, index) => (
                  <td key={index + 6} className="px-3 py-2" style={{width: '100px', minWidth: '100px'}}>
                    <CalculatedCell value={
                      (faturamentoTotalData.medio[index + 6])
                    } />
                  </td>
                ))}
                <td className="px-3 py-2">
                  <CalculatedCell value={
                    (
                      (faturamentoTotalData.medio[9]) +
                      (faturamentoTotalData.medio[10]) +
                      (faturamentoTotalData.medio[11])
                    )
                  } />
                </td>
                {meses.slice(9, 12).map((_, index) => (
                  <td key={index + 9} className="px-3 py-2" style={{width: '100px', minWidth: '100px'}}>
                    <CalculatedCell value={
                      (faturamentoTotalData.medio[index + 9])
                    } />
                  </td>
                ))}
                <td className="px-3 py-2">
                  <CalculatedCell value={
                    Array.from({ length: 12 }, (_, i) => i).reduce((sum: number, i: number) => sum + (
                      faturamentoTotalData.medio[i]
                    ), 0)
                  } />
                </td>
                <td className="px-3 py-2">
                  <CalculatedCell value={
                    (Array.from({ length: 12 }, (_, i) => i).reduce((sum: number, i: number) => sum + (
                      faturamentoTotalData.medio[i]
                    ), 0) / 12)
                  } />
                </td>
              </tr>

              {/* Linha Máximo */}
              <tr>
                <td className="px-4 py-3 text-gray-700 sticky left-0 z-10 bg-white">Máximo</td>
                <td className="px-3 py-2">
                  <CalculatedCell value={
                    (
                      (faturamentoTotalData.maximo[0]) +
                      (faturamentoTotalData.maximo[1]) +
                      (faturamentoTotalData.maximo[2])
                    )
                  } />
                </td>
                {meses.slice(0, 3).map((_, index) => (
                  <td key={index} className="px-3 py-2" style={{width: '100px', minWidth: '100px'}}>
                    <CalculatedCell value={
                      (faturamentoTotalData.maximo[index])
                    } />
                  </td>
                ))}
                <td className="px-3 py-2">
                  <CalculatedCell value={
                    (
                      (faturamentoTotalData.maximo[3]) +
                      (faturamentoTotalData.maximo[4]) +
                      (faturamentoTotalData.maximo[5])
                    )
                  } />
                </td>
                {meses.slice(3, 6).map((_, index) => (
                  <td key={index + 3} className="px-3 py-2" style={{width: '100px', minWidth: '100px'}}>
                    <CalculatedCell value={
                      (faturamentoTotalData.maximo[index + 3])
                    } />
                  </td>
                ))}
                <td className="px-3 py-2">
                  <CalculatedCell value={
                    (
                      (faturamentoTotalData.maximo[6]) +
                      (faturamentoTotalData.maximo[7]) +
                      (faturamentoTotalData.maximo[8])
                    )
                  } />
                </td>
                {meses.slice(6, 9).map((_, index) => (
                  <td key={index + 6} className="px-3 py-2" style={{width: '100px', minWidth: '100px'}}>
                    <CalculatedCell value={
                      (faturamentoTotalData.maximo[index + 6])
                    } />
                  </td>
                ))}
                <td className="px-3 py-2">
                  <CalculatedCell value={
                    (
                      (faturamentoTotalData.maximo[9]) +
                      (faturamentoTotalData.maximo[10]) +
                      (faturamentoTotalData.maximo[11])
                    )
                  } />
                </td>
                {meses.slice(9, 12).map((_, index) => (
                  <td key={index + 9} className="px-3 py-2" style={{width: '100px', minWidth: '100px'}}>
                    <CalculatedCell value={calcularMaximoTotalMes(index + 9)} />
                  </td>
                ))}
                <td className="px-3 py-2">
                  <CalculatedCell value={calcularTotalGeral((i) => calcularMaximoTotalMes(i))} />
                </td>
                <td className="px-3 py-2">
                  <CalculatedCell value={calcularMedia((i) => calcularMaximoTotalMes(i))} />
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Legenda Faturamento Total */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <h3 className="font-semibold text-blue-800 mb-2">Legenda Faturamento Total:</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-blue-700">
          <div>
            <p><span className="font-semibold">Campos calculados:</span> Não editável, soma automática</p>
            <p><span className="font-semibold">Componentes:</span> REURB + GEO + PLAN + REG + NN</p>
          </div>
          <div>
            <p><span className="font-semibold">Função:</span> Total de receitas previstas</p>
            <p><span className="font-semibold">Uso:</span> Comparação com Orçamento para Resultado</p>
          </div>
        </div>
      </div>


    </div>
  )
}

export default Projection
