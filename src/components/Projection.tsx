import React, { useState, useEffect, useRef } from 'react'
import { Calculator, RotateCcw, Trash2 } from 'lucide-react'
import { FaBullseye, FaChartLine, FaChartBar, FaRocket } from 'react-icons/fa'
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
  mkt: number[]
  faturamentoReurb: number[]
  faturamentoReurbPrevistoManual?: (number | null)[]
  faturamentoGeo: number[]
  faturamentoGeoPrevistoManual?: (number | null)[]
  faturamentoPlan: number[]
  faturamentoPlanPrevistoManual?: (number | null)[]
  faturamentoReg: number[]
  faturamentoRegPrevistoManual?: (number | null)[]
  faturamentoNn: number[]
  faturamentoNnPrevistoManual?: (number | null)[]
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
  
  // Estados para rastrear edições manuais
  const [manualEdits, setManualEdits] = useState<{
    [key: string]: boolean
  }>({})
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

  // Atualização automática do faturamento GEO quando dados da tabela principal ou percentual mudarem - DESABILITADO TEMPORARIAMENTE
  /*
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
  */

  // Atualização automática do faturamento PLAN - DESABILITADO TEMPORARIAMENTE
  useEffect(() => {
    // DESABILITADO TEMPORARIAMENTE - remover a linha abaixo para reativar
    return;
    
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
    // DESABILITADO TEMPORARIAMENTE - remover a linha abaixo para reativar
    return;
    
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
    // DESABILITADO TEMPORARIAMENTE - remover a linha abaixo para reativar
    return;
    
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
    // Os investimentos são calculados automaticamente, mas não são salvos em banco separado
    // Eles são calculados em tempo real baseados nos dados da tabela principal
  }, [data.investimentos, data.growth?.minimo, data.growth?.medio, data.growth?.maximo]) // Depende dos dados da tabela principal e percentuais

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
      const j = await response.json()
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
  const updateFixedExpensesAndSave = (category: keyof FixedExpensesData, monthIndex: number, value: number) => {
    const newData = {
      ...fixedExpensesData,
      [category]: fixedExpensesData[category].map((val, index) => 
        index === monthIndex ? value : val
      )
    }
    setFixedExpensesData(newData)
    
    // Marcar como edição manual
    const editKey = `fixedExpenses-${category}-${monthIndex}`
    setManualEdits(prev => ({
      ...prev,
      [editKey]: true
    }))
    
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
    // Médio = Faturamento REURB (tabela principal) + Percentual Médio
    const faturamentoReurb = data.faturamentoReurb[monthIndex] || 0
    const percentualMedio = data.growth?.medio || 0
    return formatNumber(faturamentoReurb + (faturamentoReurb * percentualMedio / 100))
  }

  const calcularMaximoReurbMes = (monthIndex: number) => {
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
    // Médio = Faturamento GEO (tabela principal) + Percentual Médio
    const faturamentoGeo = data.faturamentoGeo[monthIndex] || 0
    const percentualMedio = data.growth?.medio || 0
    return formatNumber(faturamentoGeo + (faturamentoGeo * percentualMedio / 100))
  }

  const calcularMaximoGeoMes = (monthIndex: number) => {
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
    // Médio = Faturamento PLAN (tabela principal) + Percentual Médio
    const faturamentoPlan = data.faturamentoPlan[monthIndex] || 0
    const percentualMedio = data.growth?.medio || 0
    return formatNumber(faturamentoPlan + (faturamentoPlan * percentualMedio / 100))
  }

  const calcularMaximoPlanMes = (monthIndex: number) => {
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
    // Médio = Faturamento REG (tabela principal) + Percentual Médio
    const faturamentoReg = data.faturamentoReg[monthIndex] || 0
    const percentualMedio = data.growth?.medio || 0
    return formatNumber(faturamentoReg + (faturamentoReg * percentualMedio / 100))
  }

  const calcularMaximoRegMes = (monthIndex: number) => {
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
    return formatNumber(faturamentoNn + (faturamentoNn * percentualMinimo / 100))
  }

  const calcularMedioNnMes = (monthIndex: number) => {
    // Médio = Faturamento NN (tabela principal) + Percentual Médio
    const faturamentoNn = data.faturamentoNn[monthIndex] || 0
    const percentualMedio = data.growth?.medio || 0
    return formatNumber(faturamentoNn + (faturamentoNn * percentualMedio / 100))
  }

  const calcularMaximoNnMes = (monthIndex: number) => {
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
    const totalMkt = (data.mktComponents?.trafego[monthIndex] || 0) + 
                    (data.mktComponents?.socialMedia[monthIndex] || 0) + 
                    (data.mktComponents?.producaoConteudo[monthIndex] || 0)
    const percentualMinimo = data.growth?.minimo || 0
    return formatNumber(totalMkt + (totalMkt * percentualMinimo / 100))
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

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <h1 className="text-3xl font-bold flex items-center gap-3">
          <Calculator className="w-8 h-8 text-blue-600" />
          Projeção Anual
        </h1>
        <div className="flex items-center gap-4">
          <button
            onClick={() => {
              setManualEdits({})
              console.log('Edições manuais resetadas - cálculos automáticos reativados')
            }}
            className="flex items-center gap-3 px-6 py-3 bg-gradient-to-r from-blue-500 to-indigo-600 text-white font-semibold rounded-xl hover:from-blue-600 hover:to-indigo-700 shadow-lg hover:shadow-xl transform hover:-translate-y-1 transition-all duration-300"
            title="Resetar edições manuais e permitir cálculos automáticos"
          >
            <RotateCcw className="h-5 w-5" />
            Resetar Cálculos
          </button>
          
          <button
            onClick={clearAllProjectionData}
            className="flex items-center gap-3 px-6 py-3 bg-gradient-to-r from-red-600 to-red-800 text-white font-semibold rounded-xl hover:from-red-700 hover:to-red-900 shadow-lg hover:shadow-xl transform hover:-translate-y-1 transition-all duration-300"
            title="⚠️ APAGAR TODOS os dados de projeção permanentemente"
            disabled={isSaving}
          >
            <Trash2 className="h-5 w-5" />
            {isSaving ? 'Limpando...' : 'Limpar Todos os Dados'}
          </button>
          
        </div>
      </div>

      {/* Frase informativa */}
      <div className="flex items-center gap-2">
        <p className="text-sm text-gray-600">Preencha apenas os valores mensais - os cálculos são automáticos</p>
        {isSaving && (
          <div className="flex items-center gap-2 text-sm text-blue-600">
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
            salvando
          </div>
        )}
      </div>

      {/* Tabela RESULTADO - A mais importante - MOVIDA PARA O TOPO */}
      <div className="mb-8">
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
                <td className="px-6 py-4 text-gray-800 font-semibold sticky left-0 z-10 bg-white"><FaChartBar className="inline mr-2" /> Cenário Previsto</td>
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
                <td className="px-6 py-4 text-gray-800 font-semibold sticky left-0 z-10 bg-white"><FaChartLine className="inline mr-2" /> Cenário Médio</td>
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
                <td className="px-6 py-4 text-gray-800 font-semibold sticky left-0 z-10 bg-white"><FaRocket className="inline mr-2" /> Cenário Máximo</td>
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
                  <CalculatedCell value={calcularTrimestre(0, 2, (i) => calcularPrevistoVariableMes(i))} />
                </td>
                {meses.slice(0, 3).map((_, index) => (
                  <td key={index} className="px-3 py-2">
                    <InputCell 
                      value={calcularPrevistoVariableMes(index)} 
                      onBlur={(value) => {
                        const arr = (data.variablePrevistoManual && data.variablePrevistoManual.length === 12) ? [...data.variablePrevistoManual] : new Array(12).fill(null)
                        arr[index] = value
                        const updated = { ...data, variablePrevistoManual: arr }
                        setData(updated)
                        if (token) saveToServer(updated)
                      }}
                      category="variable-previsto"
                      monthIndex={index}
                    />
                  </td>
                ))}
                <td className="px-3 py-2">
                  <CalculatedCell value={calcularTrimestre(3, 5, (i) => calcularPrevistoVariableMes(i))} />
                </td>
                {meses.slice(3, 6).map((_, index) => (
                  <td key={index + 3} className="px-3 py-2">
                    <InputCell 
                      value={calcularPrevistoVariableMes(index + 3)} 
                      onBlur={(value) => {
                        const arr = (data.variablePrevistoManual && data.variablePrevistoManual.length === 12) ? [...data.variablePrevistoManual] : new Array(12).fill(null)
                        arr[index + 3] = value
                        const updated = { ...data, variablePrevistoManual: arr }
                        setData(updated)
                        if (token) saveToServer(updated)
                      }}
                      category="variable-previsto"
                      monthIndex={index + 3}
                    />
                  </td>
                ))}
                <td className="px-3 py-2">
                  <CalculatedCell value={calcularTrimestre(6, 8, (i) => calcularPrevistoVariableMes(i))} />
                </td>
                {meses.slice(6, 9).map((_, index) => (
                  <td key={index + 6} className="px-3 py-2">
                    <InputCell 
                      value={calcularPrevistoVariableMes(index + 6)} 
                      onBlur={(value) => {
                        const arr = (data.variablePrevistoManual && data.variablePrevistoManual.length === 12) ? [...data.variablePrevistoManual] : new Array(12).fill(null)
                        arr[index + 6] = value
                        const updated = { ...data, variablePrevistoManual: arr }
                        setData(updated)
                        if (token) saveToServer(updated)
                      }}
                      category="variable-previsto"
                      monthIndex={index + 6}
                    />
                  </td>
                ))}
                <td className="px-3 py-2">
                  <CalculatedCell value={calcularTrimestre(9, 11, (i) => calcularPrevistoVariableMes(i))} />
                </td>
                {meses.slice(9, 12).map((_, index) => (
                  <td key={index + 9} className="px-3 py-2">
                    <InputCell 
                      value={calcularPrevistoVariableMes(index + 9)} 
                      onBlur={(value) => {
                        const arr = (data.variablePrevistoManual && data.variablePrevistoManual.length === 12) ? [...data.variablePrevistoManual] : new Array(12).fill(null)
                        arr[index + 9] = value
                        const updated = { ...data, variablePrevistoManual: arr }
                        setData(updated)
                        if (token) saveToServer(updated)
                      }}
                      category="variable-previsto"
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
                    <CalculatedCell value={calcularTrimestre(0, 2, (i) => fixedExpensesData.previsto[i] || 0)} />
                  </td>
                  {meses.slice(0, 3).map((_, index) => (
                    <td key={index} className="px-3 py-2" style={{width: '100px', minWidth: '100px'}}>
                      <InputCell
                        value={fixedExpensesData.previsto[index] || 0}
                        onBlur={(value) => updateFixedExpensesAndSave('previsto', index, value)}
                        category="fixedExpenses-previsto"
                        monthIndex={index}
                      />
                    </td>
                  ))}
                  <td className="px-3 py-2">
                    <CalculatedCell value={calcularTrimestre(3, 5, (i) => fixedExpensesData.previsto[i] || 0)} />
                  </td>
                  {meses.slice(3, 6).map((_, index) => (
                    <td key={index + 3} className="px-3 py-2" style={{width: '100px', minWidth: '100px'}}>
                      <InputCell
                        value={fixedExpensesData.previsto[index + 3] || 0}
                        onBlur={(value) => updateFixedExpensesAndSave('previsto', index + 3, value)}
                        category="fixedExpenses-previsto"
                        monthIndex={index + 3}
                      />
                    </td>
                  ))}
                  <td className="px-3 py-2">
                    <CalculatedCell value={calcularTrimestre(6, 8, (i) => fixedExpensesData.previsto[i] || 0)} />
                  </td>
                  {meses.slice(6, 9).map((_, index) => (
                    <td key={index + 6} className="px-3 py-2" style={{width: '100px', minWidth: '100px'}}>
                      <InputCell
                        value={fixedExpensesData.previsto[index + 6] || 0}
                        onBlur={(value) => updateFixedExpensesAndSave('previsto', index + 6, value)}
                        category="fixedExpenses-previsto"
                        monthIndex={index + 6}
                      />
                    </td>
                  ))}
                  <td className="px-3 py-2">
                    <CalculatedCell value={calcularTrimestre(9, 11, (i) => fixedExpensesData.previsto[i] || 0)} />
                  </td>
                  {meses.slice(9, 12).map((_, index) => (
                    <td key={index + 9} className="px-3 py-2" style={{width: '100px', minWidth: '100px'}}>
                      <InputCell
                        value={fixedExpensesData.previsto[index + 9] || 0}
                        onBlur={(value) => updateFixedExpensesAndSave('previsto', index + 9, value)}
                        category="fixedExpenses-previsto"
                        monthIndex={index + 9}
                      />
                    </td>
                  ))}
                  <td className="px-3 py-2">
                    <CalculatedCell value={calcularTotalGeral((i) => fixedExpensesData.previsto[i] || 0)} />
                  </td>
                  <td className="px-3 py-2">
                    <CalculatedCell value={calcularMedia((i) => fixedExpensesData.previsto[i] || 0)} />
                  </td>
                </tr>

                {/* Linha Média */}
                <tr>
                  <td className="px-4 py-3 text-gray-700 sticky left-0 z-10 bg-white">Média</td>
                  <td className="px-3 py-2">
                    <CalculatedCell value={calcularTrimestre(0, 2, (i) => fixedExpensesData.media[i] || 0)} />
                  </td>
                  {meses.slice(0, 3).map((_, index) => (
                    <td key={index} className="px-3 py-2" style={{width: '100px', minWidth: '100px'}}>
                      <InputCell
                        value={fixedExpensesData.media[index] || 0}
                        onBlur={(value) => updateFixedExpensesAndSave('media', index, value)}
                        category="fixedExpenses-media"
                        monthIndex={index}
                      />
                    </td>
                  ))}
                  <td className="px-3 py-2">
                    <CalculatedCell value={calcularTrimestre(3, 5, (i) => fixedExpensesData.media[i] || 0)} />
                  </td>
                  {meses.slice(3, 6).map((_, index) => (
                    <td key={index + 3} className="px-3 py-2" style={{width: '100px', minWidth: '100px'}}>
                      <InputCell
                        value={fixedExpensesData.media[index + 3] || 0}
                        onBlur={(value) => updateFixedExpensesAndSave('media', index + 3, value)}
                        category="fixedExpenses-media"
                        monthIndex={index + 3}
                      />
                    </td>
                  ))}
                  <td className="px-3 py-2">
                    <CalculatedCell value={calcularTrimestre(6, 8, (i) => fixedExpensesData.media[i] || 0)} />
                  </td>
                  {meses.slice(6, 9).map((_, index) => (
                    <td key={index + 6} className="px-3 py-2" style={{width: '100px', minWidth: '100px'}}>
                      <InputCell
                        value={fixedExpensesData.media[index + 6] || 0}
                        onBlur={(value) => updateFixedExpensesAndSave('media', index + 6, value)}
                        category="fixedExpenses-media"
                        monthIndex={index + 6}
                      />
                    </td>
                  ))}
                  <td className="px-3 py-2">
                    <CalculatedCell value={calcularTrimestre(9, 11, (i) => fixedExpensesData.media[i] || 0)} />
                  </td>
                  {meses.slice(9, 12).map((_, index) => (
                    <td key={index + 9} className="px-3 py-2" style={{width: '100px', minWidth: '100px'}}>
                      <InputCell
                        value={fixedExpensesData.media[index + 9] || 0}
                        onBlur={(value) => updateFixedExpensesAndSave('media', index + 9, value)}
                        category="fixedExpenses-media"
                        monthIndex={index + 9}
                      />
                    </td>
                  ))}
                  <td className="px-3 py-2">
                    <CalculatedCell value={calcularTotalGeral((i) => fixedExpensesData.media[i] || 0)} />
                  </td>
                  <td className="px-3 py-2">
                    <CalculatedCell value={calcularMedia((i) => fixedExpensesData.media[i] || 0)} />
                  </td>
                </tr>

                {/* Linha Máximo */}
                <tr>
                  <td className="px-4 py-3 text-gray-700 sticky left-0 z-10 bg-white">Máximo</td>
                  <td className="px-3 py-2">
                    <CalculatedCell value={calcularTrimestre(0, 2, (i) => fixedExpensesData.maximo[i] || 0)} />
                  </td>
                  {meses.slice(0, 3).map((_, index) => (
                    <td key={index} className="px-3 py-2" style={{width: '100px', minWidth: '100px'}}>
                      <InputCell
                        value={fixedExpensesData.maximo[index] || 0}
                        onBlur={(value) => updateFixedExpensesAndSave('maximo', index, value)}
                        category="fixedExpenses-maximo"
                        monthIndex={index}
                      />
                    </td>
                  ))}
                  <td className="px-3 py-2">
                    <CalculatedCell value={calcularTrimestre(3, 5, (i) => fixedExpensesData.maximo[i] || 0)} />
                  </td>
                  {meses.slice(3, 6).map((_, index) => (
                    <td key={index + 3} className="px-3 py-2" style={{width: '100px', minWidth: '100px'}}>
                      <InputCell
                        value={fixedExpensesData.maximo[index + 3] || 0}
                        onBlur={(value) => updateFixedExpensesAndSave('maximo', index + 3, value)}
                        category="fixedExpenses-maximo"
                        monthIndex={index + 3}
                      />
                    </td>
                  ))}
                  <td className="px-3 py-2">
                    <CalculatedCell value={calcularTrimestre(6, 8, (i) => fixedExpensesData.maximo[i] || 0)} />
                  </td>
                  {meses.slice(6, 9).map((_, index) => (
                    <td key={index + 6} className="px-3 py-2" style={{width: '100px', minWidth: '100px'}}>
                      <InputCell
                        value={fixedExpensesData.maximo[index + 6] || 0}
                        onBlur={(value) => updateFixedExpensesAndSave('maximo', index + 6, value)}
                        category="fixedExpenses-maximo"
                        monthIndex={index + 6}
                      />
                    </td>
                  ))}
                  <td className="px-3 py-2">
                    <CalculatedCell value={calcularTrimestre(9, 11, (i) => fixedExpensesData.maximo[i] || 0)} />
                  </td>
                  {meses.slice(9, 12).map((_, index) => (
                    <td key={index + 9} className="px-3 py-2" style={{width: '100px', minWidth: '100px'}}>
                      <InputCell
                        value={fixedExpensesData.maximo[index + 9] || 0}
                        onBlur={(value) => updateFixedExpensesAndSave('maximo', index + 9, value)}
                        category="fixedExpenses-maximo"
                        monthIndex={index + 9}
                      />
                    </td>
                  ))}
                  <td className="px-3 py-2">
                    <CalculatedCell value={calcularTotalGeral((i) => fixedExpensesData.maximo[i] || 0)} />
                  </td>
                  <td className="px-3 py-2">
                    <CalculatedCell value={calcularMedia((i) => fixedExpensesData.maximo[i] || 0)} />
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
                  <CalculatedCell value={faturamentoReurbData.medio[0] + faturamentoReurbData.medio[1] + faturamentoReurbData.medio[2]} />
                </td>
                {meses.slice(0, 3).map((_, index) => (
                  <td key={index} className="px-3 py-2" style={{width: '100px', minWidth: '100px'}}>
                    <InputCell 
                      value={faturamentoReurbData.medio[index]} 
                      onBlur={(value: number) => {
                        const newData = {...faturamentoReurbData}
                        newData.medio[index] = value
                        setFaturamentoReurbData(newData)
                        saveFaturamentoReurbToServer(newData)
                      }}
                      category="faturamentoReurb"
                      monthIndex={index}
                    />
                  </td>
                ))}
                <td className="px-3 py-2">
                  <CalculatedCell value={faturamentoReurbData.medio[3] + faturamentoReurbData.medio[4] + faturamentoReurbData.medio[5]} />
                </td>
                {meses.slice(3, 6).map((_, index) => (
                  <td key={index + 3} className="px-3 py-2" style={{width: '100px', minWidth: '100px'}}>
                    <InputCell 
                      value={faturamentoReurbData.medio[index + 3]} 
                      onBlur={(value: number) => {
                        const newData = {...faturamentoReurbData}
                        newData.medio[index + 3] = value
                        setFaturamentoReurbData(newData)
                        saveFaturamentoReurbToServer(newData)
                      }}
                      category="faturamentoReurb"
                      monthIndex={index}
                    />
                  </td>
                ))}
                <td className="px-3 py-2">
                  <CalculatedCell value={faturamentoReurbData.medio[6] + faturamentoReurbData.medio[7] + faturamentoReurbData.medio[8]} />
                </td>
                {meses.slice(6, 9).map((_, index) => (
                  <td key={index + 6} className="px-3 py-2" style={{width: '100px', minWidth: '100px'}}>
                    <InputCell 
                      value={faturamentoReurbData.medio[index + 6]} 
                      onBlur={(value: number) => {
                        const newData = {...faturamentoReurbData}
                        newData.medio[index + 6] = value
                        setFaturamentoReurbData(newData)
                        saveFaturamentoReurbToServer(newData)
                      }}
                      category="faturamentoReurb"
                      monthIndex={index}
                    />
                  </td>
                ))}
                <td className="px-3 py-2">
                  <CalculatedCell value={faturamentoReurbData.medio[9] + faturamentoReurbData.medio[10] + faturamentoReurbData.medio[11]} />
                </td>
                {meses.slice(9, 12).map((_, index) => (
                  <td key={index + 9} className="px-3 py-2" style={{width: '100px', minWidth: '100px'}}>
                    <InputCell 
                      value={faturamentoReurbData.medio[index + 9]} 
                      onBlur={(value: number) => {
                        const newData = {...faturamentoReurbData}
                        newData.medio[index + 9] = value
                        setFaturamentoReurbData(newData)
                        saveFaturamentoReurbToServer(newData)
                      }}
                      category="faturamentoReurb"
                      monthIndex={index}
                    />
                  </td>
                ))}
                <td className="px-3 py-2">
                  <CalculatedCell value={faturamentoReurbData.medio.reduce((sum, v) => sum + v, 0)} />
                </td>
                <td className="px-3 py-2">
                  <CalculatedCell value={faturamentoReurbData.medio.reduce((sum, v) => sum + v, 0) / 12} />
                </td>
              </tr>

              {/* Linha Máximo */}
              <tr>
                <td className="px-4 py-3 text-gray-700 sticky left-0 z-10 bg-white">Máximo</td>
                <td className="px-3 py-2">
                  <CalculatedCell value={faturamentoReurbData.maximo[0] + faturamentoReurbData.maximo[1] + faturamentoReurbData.maximo[2]} />
                </td>
                {meses.slice(0, 3).map((_, index) => (
                  <td key={index} className="px-3 py-2" style={{width: '100px', minWidth: '100px'}}>
                    <InputCell 
                      value={faturamentoReurbData.maximo[index]} 
                      onBlur={(value: number) => {
                        const newData = {...faturamentoReurbData}
                        newData.maximo[index] = value
                        setFaturamentoReurbData(newData)
                        saveFaturamentoReurbToServer(newData)
                      }}
                      category="faturamentoReurb"
                      monthIndex={index}
                    />
                  </td>
                ))}
                <td className="px-3 py-2">
                  <CalculatedCell value={faturamentoReurbData.maximo[3] + faturamentoReurbData.maximo[4] + faturamentoReurbData.maximo[5]} />
                </td>
                {meses.slice(3, 6).map((_, index) => (
                  <td key={index + 3} className="px-3 py-2" style={{width: '100px', minWidth: '100px'}}>
                    <InputCell 
                      value={faturamentoReurbData.maximo[index + 3]} 
                      onBlur={(value: number) => {
                        const newData = {...faturamentoReurbData}
                        newData.maximo[index + 3] = value
                        setFaturamentoReurbData(newData)
                        saveFaturamentoReurbToServer(newData)
                      }}
                      category="faturamentoReurb"
                      monthIndex={index}
                    />
                  </td>
                ))}
                <td className="px-3 py-2">
                  <CalculatedCell value={faturamentoReurbData.maximo[6] + faturamentoReurbData.maximo[7] + faturamentoReurbData.maximo[8]} />
                </td>
                {meses.slice(6, 9).map((_, index) => (
                  <td key={index + 6} className="px-3 py-2" style={{width: '100px', minWidth: '100px'}}>
                    <InputCell 
                      value={faturamentoReurbData.maximo[index + 6]} 
                      onBlur={(value: number) => {
                        const newData = {...faturamentoReurbData}
                        newData.maximo[index + 6] = value
                        setFaturamentoReurbData(newData)
                        saveFaturamentoReurbToServer(newData)
                      }}
                      category="faturamentoReurb"
                      monthIndex={index}
                    />
                  </td>
                ))}
                <td className="px-3 py-2">
                  <CalculatedCell value={faturamentoReurbData.maximo[9] + faturamentoReurbData.maximo[10] + faturamentoReurbData.maximo[11]} />
                </td>
                {meses.slice(9, 12).map((_, index) => (
                  <td key={index + 9} className="px-3 py-2" style={{width: '100px', minWidth: '100px'}}>
                    <InputCell 
                      value={faturamentoReurbData.maximo[index + 9]} 
                      onBlur={(value: number) => {
                        const newData = {...faturamentoReurbData}
                        newData.maximo[index + 9] = value
                        setFaturamentoReurbData(newData)
                        saveFaturamentoReurbToServer(newData)
                      }}
                      category="faturamentoReurb"
                      monthIndex={index}
                    />
                  </td>
                ))}
                <td className="px-3 py-2">
                  <CalculatedCell value={faturamentoReurbData.maximo.reduce((sum, v) => sum + v, 0)} />
                </td>
                <td className="px-3 py-2">
                  <CalculatedCell value={faturamentoReurbData.maximo.reduce((sum, v) => sum + v, 0) / 12} />
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
                  <CalculatedCell value={faturamentoGeoData.medio[0] + faturamentoGeoData.medio[1] + faturamentoGeoData.medio[2]} />
                </td>
                {meses.slice(0, 3).map((_, index) => (
                  <td key={index} className="px-3 py-2" style={{width: '100px', minWidth: '100px'}}>
                    <InputCell 
                      value={faturamentoGeoData.medio[index]} 
                      onBlur={(value: number) => {
                        const newData = {...faturamentoGeoData}
                        newData.medio[index] = value
                        setFaturamentoGeoData(newData)
                        saveFaturamentoGeoToServer(newData)
                      }}
                      category="faturamentoGeo"
                      monthIndex={index}
                    />
                  </td>
                ))}
                <td className="px-3 py-2">
                  <CalculatedCell value={faturamentoGeoData.medio[3] + faturamentoGeoData.medio[4] + faturamentoGeoData.medio[5]} />
                </td>
                {meses.slice(3, 6).map((_, index) => (
                  <td key={index + 3} className="px-3 py-2" style={{width: '100px', minWidth: '100px'}}>
                    <InputCell 
                      value={faturamentoGeoData.medio[index + 3]} 
                      onBlur={(value: number) => {
                        const newData = {...faturamentoGeoData}
                        newData.medio[index + 3] = value
                        setFaturamentoGeoData(newData)
                        saveFaturamentoGeoToServer(newData)
                      }}
                      category="faturamentoGeo"
                      monthIndex={index}
                    />
                  </td>
                ))}
                <td className="px-3 py-2">
                  <CalculatedCell value={faturamentoGeoData.medio[6] + faturamentoGeoData.medio[7] + faturamentoGeoData.medio[8]} />
                </td>
                {meses.slice(6, 9).map((_, index) => (
                  <td key={index + 6} className="px-3 py-2" style={{width: '100px', minWidth: '100px'}}>
                    <InputCell 
                      value={faturamentoGeoData.medio[index + 6]} 
                      onBlur={(value: number) => {
                        const newData = {...faturamentoGeoData}
                        newData.medio[index + 6] = value
                        setFaturamentoGeoData(newData)
                        saveFaturamentoGeoToServer(newData)
                      }}
                      category="faturamentoGeo"
                      monthIndex={index}
                    />
                  </td>
                ))}
                <td className="px-3 py-2">
                  <CalculatedCell value={faturamentoGeoData.medio[9] + faturamentoGeoData.medio[10] + faturamentoGeoData.medio[11]} />
                </td>
                {meses.slice(9, 12).map((_, index) => (
                  <td key={index + 9} className="px-3 py-2" style={{width: '100px', minWidth: '100px'}}>
                    <InputCell 
                      value={faturamentoGeoData.medio[index + 9]} 
                      onBlur={(value: number) => {
                        const newData = {...faturamentoGeoData}
                        newData.medio[index + 9] = value
                        setFaturamentoGeoData(newData)
                        saveFaturamentoGeoToServer(newData)
                      }}
                      category="faturamentoGeo"
                      monthIndex={index}
                    />
                  </td>
                ))}
                <td className="px-3 py-2">
                  <CalculatedCell value={faturamentoGeoData.medio.reduce((sum, v) => sum + v, 0)} />
                </td>
                <td className="px-3 py-2">
                  <CalculatedCell value={faturamentoGeoData.medio.reduce((sum, v) => sum + v, 0) / 12} />
                </td>
              </tr>

              {/* Linha Máximo */}
              <tr>
                <td className="px-4 py-3 text-gray-700 sticky left-0 z-10 bg-white">Máximo</td>
                <td className="px-3 py-2">
                  <CalculatedCell value={faturamentoGeoData.maximo[0] + faturamentoGeoData.maximo[1] + faturamentoGeoData.maximo[2]} />
                </td>
                {meses.slice(0, 3).map((_, index) => (
                  <td key={index} className="px-3 py-2" style={{width: '100px', minWidth: '100px'}}>
                    <InputCell 
                      value={faturamentoGeoData.maximo[index]} 
                      onBlur={(value: number) => {
                        const newData = {...faturamentoGeoData}
                        newData.maximo[index] = value
                        setFaturamentoGeoData(newData)
                        saveFaturamentoGeoToServer(newData)
                      }}
                      category="faturamentoGeo"
                      monthIndex={index}
                    />
                  </td>
                ))}
                <td className="px-3 py-2">
                  <CalculatedCell value={faturamentoGeoData.maximo[3] + faturamentoGeoData.maximo[4] + faturamentoGeoData.maximo[5]} />
                </td>
                {meses.slice(3, 6).map((_, index) => (
                  <td key={index + 3} className="px-3 py-2" style={{width: '100px', minWidth: '100px'}}>
                    <InputCell 
                      value={faturamentoGeoData.maximo[index + 3]} 
                      onBlur={(value: number) => {
                        const newData = {...faturamentoGeoData}
                        newData.maximo[index + 3] = value
                        setFaturamentoGeoData(newData)
                        saveFaturamentoGeoToServer(newData)
                      }}
                      category="faturamentoGeo"
                      monthIndex={index}
                    />
                  </td>
                ))}
                <td className="px-3 py-2">
                  <CalculatedCell value={faturamentoGeoData.maximo[6] + faturamentoGeoData.maximo[7] + faturamentoGeoData.maximo[8]} />
                </td>
                {meses.slice(6, 9).map((_, index) => (
                  <td key={index + 6} className="px-3 py-2" style={{width: '100px', minWidth: '100px'}}>
                    <InputCell 
                      value={faturamentoGeoData.maximo[index + 6]} 
                      onBlur={(value: number) => {
                        const newData = {...faturamentoGeoData}
                        newData.maximo[index + 6] = value
                        setFaturamentoGeoData(newData)
                        saveFaturamentoGeoToServer(newData)
                      }}
                      category="faturamentoGeo"
                      monthIndex={index}
                    />
                  </td>
                ))}
                <td className="px-3 py-2">
                  <CalculatedCell value={faturamentoGeoData.maximo[9] + faturamentoGeoData.maximo[10] + faturamentoGeoData.maximo[11]} />
                </td>
                {meses.slice(9, 12).map((_, index) => (
                  <td key={index + 9} className="px-3 py-2" style={{width: '100px', minWidth: '100px'}}>
                    <InputCell 
                      value={faturamentoGeoData.maximo[index + 9]} 
                      onBlur={(value: number) => {
                        const newData = {...faturamentoGeoData}
                        newData.maximo[index + 9] = value
                        setFaturamentoGeoData(newData)
                        saveFaturamentoGeoToServer(newData)
                      }}
                      category="faturamentoGeo"
                      monthIndex={index}
                    />
                  </td>
                ))}
                <td className="px-3 py-2">
                  <CalculatedCell value={faturamentoGeoData.maximo.reduce((sum, v) => sum + v, 0)} />
                </td>
                <td className="px-3 py-2">
                  <CalculatedCell value={faturamentoGeoData.maximo.reduce((sum, v) => sum + v, 0) / 12} />
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
                  <CalculatedCell value={faturamentoPlanData.medio[0] + faturamentoPlanData.medio[1] + faturamentoPlanData.medio[2]} />
                </td>
                {meses.slice(0, 3).map((_, index) => (
                  <td key={index} className="px-3 py-2" style={{width: '100px', minWidth: '100px'}}>
                    <InputCell 
                      value={faturamentoPlanData.medio[index]} 
                      onBlur={(value: number) => {
                        const newData = {...faturamentoPlanData}
                        newData.medio[index] = value
                        setFaturamentoPlanData(newData)
                        saveFaturamentoPlanToServer(newData)
                      }}
                      category="faturamentoPlan"
                      monthIndex={index}
                    />
                  </td>
                ))}
                <td className="px-3 py-2">
                  <CalculatedCell value={faturamentoPlanData.medio[3] + faturamentoPlanData.medio[4] + faturamentoPlanData.medio[5]} />
                </td>
                {meses.slice(3, 6).map((_, index) => (
                  <td key={index + 3} className="px-3 py-2" style={{width: '100px', minWidth: '100px'}}>
                    <InputCell 
                      value={faturamentoPlanData.medio[index + 3]} 
                      onBlur={(value: number) => {
                        const newData = {...faturamentoPlanData}
                        newData.medio[index + 3] = value
                        setFaturamentoPlanData(newData)
                        saveFaturamentoPlanToServer(newData)
                      }}
                      category="faturamentoPlan"
                      monthIndex={index}
                    />
                  </td>
                ))}
                <td className="px-3 py-2">
                  <CalculatedCell value={faturamentoPlanData.medio[6] + faturamentoPlanData.medio[7] + faturamentoPlanData.medio[8]} />
                </td>
                {meses.slice(6, 9).map((_, index) => (
                  <td key={index + 6} className="px-3 py-2" style={{width: '100px', minWidth: '100px'}}>
                    <InputCell 
                      value={faturamentoPlanData.medio[index + 6]} 
                      onBlur={(value: number) => {
                        const newData = {...faturamentoPlanData}
                        newData.medio[index + 6] = value
                        setFaturamentoPlanData(newData)
                        saveFaturamentoPlanToServer(newData)
                      }}
                      category="faturamentoPlan"
                      monthIndex={index}
                    />
                  </td>
                ))}
                <td className="px-3 py-2">
                  <CalculatedCell value={faturamentoPlanData.medio[9] + faturamentoPlanData.medio[10] + faturamentoPlanData.medio[11]} />
                </td>
                {meses.slice(9, 12).map((_, index) => (
                  <td key={index + 9} className="px-3 py-2" style={{width: '100px', minWidth: '100px'}}>
                    <InputCell 
                      value={faturamentoPlanData.medio[index + 9]} 
                      onBlur={(value: number) => {
                        const newData = {...faturamentoPlanData}
                        newData.medio[index + 9] = value
                        setFaturamentoPlanData(newData)
                        saveFaturamentoPlanToServer(newData)
                      }}
                      category="faturamentoPlan"
                      monthIndex={index}
                    />
                  </td>
                ))}
                <td className="px-3 py-2">
                  <CalculatedCell value={faturamentoPlanData.medio.reduce((sum, v) => sum + v, 0)} />
                </td>
                <td className="px-3 py-2">
                  <CalculatedCell value={faturamentoPlanData.medio.reduce((sum, v) => sum + v, 0) / 12} />
                </td>
              </tr>

              {/* Linha Máximo */}
              <tr>
                <td className="px-4 py-3 text-gray-700 sticky left-0 z-10 bg-white">Máximo</td>
                <td className="px-3 py-2">
                  <CalculatedCell value={faturamentoPlanData.maximo[0] + faturamentoPlanData.maximo[1] + faturamentoPlanData.maximo[2]} />
                </td>
                {meses.slice(0, 3).map((_, index) => (
                  <td key={index} className="px-3 py-2" style={{width: '100px', minWidth: '100px'}}>
                    <InputCell 
                      value={faturamentoPlanData.maximo[index]} 
                      onBlur={(value: number) => {
                        const newData = {...faturamentoPlanData}
                        newData.maximo[index] = value
                        setFaturamentoPlanData(newData)
                        saveFaturamentoPlanToServer(newData)
                      }}
                      category="faturamentoPlan"
                      monthIndex={index}
                    />
                  </td>
                ))}
                <td className="px-3 py-2">
                  <CalculatedCell value={faturamentoPlanData.maximo[3] + faturamentoPlanData.maximo[4] + faturamentoPlanData.maximo[5]} />
                </td>
                {meses.slice(3, 6).map((_, index) => (
                  <td key={index + 3} className="px-3 py-2" style={{width: '100px', minWidth: '100px'}}>
                    <InputCell 
                      value={faturamentoPlanData.maximo[index + 3]} 
                      onBlur={(value: number) => {
                        const newData = {...faturamentoPlanData}
                        newData.maximo[index + 3] = value
                        setFaturamentoPlanData(newData)
                        saveFaturamentoPlanToServer(newData)
                      }}
                      category="faturamentoPlan"
                      monthIndex={index}
                    />
                  </td>
                ))}
                <td className="px-3 py-2">
                  <CalculatedCell value={faturamentoPlanData.maximo[6] + faturamentoPlanData.maximo[7] + faturamentoPlanData.maximo[8]} />
                </td>
                {meses.slice(6, 9).map((_, index) => (
                  <td key={index + 6} className="px-3 py-2" style={{width: '100px', minWidth: '100px'}}>
                    <InputCell 
                      value={faturamentoPlanData.maximo[index + 6]} 
                      onBlur={(value: number) => {
                        const newData = {...faturamentoPlanData}
                        newData.maximo[index + 6] = value
                        setFaturamentoPlanData(newData)
                        saveFaturamentoPlanToServer(newData)
                      }}
                      category="faturamentoPlan"
                      monthIndex={index}
                    />
                  </td>
                ))}
                <td className="px-3 py-2">
                  <CalculatedCell value={faturamentoPlanData.maximo[9] + faturamentoPlanData.maximo[10] + faturamentoPlanData.maximo[11]} />
                </td>
                {meses.slice(9, 12).map((_, index) => (
                  <td key={index + 9} className="px-3 py-2" style={{width: '100px', minWidth: '100px'}}>
                    <InputCell 
                      value={faturamentoPlanData.maximo[index + 9]} 
                      onBlur={(value: number) => {
                        const newData = {...faturamentoPlanData}
                        newData.maximo[index + 9] = value
                        setFaturamentoPlanData(newData)
                        saveFaturamentoPlanToServer(newData)
                      }}
                      category="faturamentoPlan"
                      monthIndex={index}
                    />
                  </td>
                ))}
                <td className="px-3 py-2">
                  <CalculatedCell value={faturamentoPlanData.maximo.reduce((sum, v) => sum + v, 0)} />
                </td>
                <td className="px-3 py-2">
                  <CalculatedCell value={faturamentoPlanData.maximo.reduce((sum, v) => sum + v, 0) / 12} />
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
                  <CalculatedCell value={faturamentoRegData.medio[0] + faturamentoRegData.medio[1] + faturamentoRegData.medio[2]} />
                </td>
                {meses.slice(0, 3).map((_, index) => (
                  <td key={index} className="px-3 py-2" style={{width: '100px', minWidth: '100px'}}>
                    <InputCell 
                      value={faturamentoRegData.medio[index]} 
                      onBlur={(value: number) => {
                        const newData = {...faturamentoRegData}
                        newData.medio[index] = value
                        setFaturamentoRegData(newData)
                        saveFaturamentoRegToServer(newData)
                      }}
                      category="faturamentoReg"
                      monthIndex={index}
                    />
                  </td>
                ))}
                <td className="px-3 py-2">
                  <CalculatedCell value={faturamentoRegData.medio[3] + faturamentoRegData.medio[4] + faturamentoRegData.medio[5]} />
                </td>
                {meses.slice(3, 6).map((_, index) => (
                  <td key={index + 3} className="px-3 py-2" style={{width: '100px', minWidth: '100px'}}>
                    <InputCell 
                      value={faturamentoRegData.medio[index + 3]} 
                      onBlur={(value: number) => {
                        const newData = {...faturamentoRegData}
                        newData.medio[index + 3] = value
                        setFaturamentoRegData(newData)
                        saveFaturamentoRegToServer(newData)
                      }}
                      category="faturamentoReg"
                      monthIndex={index}
                    />
                  </td>
                ))}
                <td className="px-3 py-2">
                  <CalculatedCell value={faturamentoRegData.medio[6] + faturamentoRegData.medio[7] + faturamentoRegData.medio[8]} />
                </td>
                {meses.slice(6, 9).map((_, index) => (
                  <td key={index + 6} className="px-3 py-2" style={{width: '100px', minWidth: '100px'}}>
                    <InputCell 
                      value={faturamentoRegData.medio[index + 6]} 
                      onBlur={(value: number) => {
                        const newData = {...faturamentoRegData}
                        newData.medio[index + 6] = value
                        setFaturamentoRegData(newData)
                        saveFaturamentoRegToServer(newData)
                      }}
                      category="faturamentoReg"
                      monthIndex={index}
                    />
                  </td>
                ))}
                <td className="px-3 py-2">
                  <CalculatedCell value={faturamentoRegData.medio[9] + faturamentoRegData.medio[10] + faturamentoRegData.medio[11]} />
                </td>
                {meses.slice(9, 12).map((_, index) => (
                  <td key={index + 9} className="px-3 py-2" style={{width: '100px', minWidth: '100px'}}>
                    <InputCell 
                      value={faturamentoRegData.medio[index + 9]} 
                      onBlur={(value: number) => {
                        const newData = {...faturamentoRegData}
                        newData.medio[index + 9] = value
                        setFaturamentoRegData(newData)
                        saveFaturamentoRegToServer(newData)
                      }}
                      category="faturamentoReg"
                      monthIndex={index}
                    />
                  </td>
                ))}
                <td className="px-3 py-2">
                  <CalculatedCell value={faturamentoRegData.medio.reduce((sum, v) => sum + v, 0)} />
                </td>
                <td className="px-3 py-2">
                  <CalculatedCell value={faturamentoRegData.medio.reduce((sum, v) => sum + v, 0) / 12} />
                </td>
              </tr>

              {/* Linha Máximo */}
              <tr>
                <td className="px-4 py-3 text-gray-700 sticky left-0 z-10 bg-white">Máximo</td>
                <td className="px-3 py-2">
                  <CalculatedCell value={faturamentoRegData.maximo[0] + faturamentoRegData.maximo[1] + faturamentoRegData.maximo[2]} />
                </td>
                {meses.slice(0, 3).map((_, index) => (
                  <td key={index} className="px-3 py-2" style={{width: '100px', minWidth: '100px'}}>
                    <InputCell 
                      value={faturamentoRegData.maximo[index]} 
                      onBlur={(value: number) => {
                        const newData = {...faturamentoRegData}
                        newData.maximo[index] = value
                        setFaturamentoRegData(newData)
                        saveFaturamentoRegToServer(newData)
                      }}
                      category="faturamentoReg"
                      monthIndex={index}
                    />
                  </td>
                ))}
                <td className="px-3 py-2">
                  <CalculatedCell value={faturamentoRegData.maximo[3] + faturamentoRegData.maximo[4] + faturamentoRegData.maximo[5]} />
                </td>
                {meses.slice(3, 6).map((_, index) => (
                  <td key={index + 3} className="px-3 py-2" style={{width: '100px', minWidth: '100px'}}>
                    <InputCell 
                      value={faturamentoRegData.maximo[index + 3]} 
                      onBlur={(value: number) => {
                        const newData = {...faturamentoRegData}
                        newData.maximo[index + 3] = value
                        setFaturamentoRegData(newData)
                        saveFaturamentoRegToServer(newData)
                      }}
                      category="faturamentoReg"
                      monthIndex={index}
                    />
                  </td>
                ))}
                <td className="px-3 py-2">
                  <CalculatedCell value={faturamentoRegData.maximo[6] + faturamentoRegData.maximo[7] + faturamentoRegData.maximo[8]} />
                </td>
                {meses.slice(6, 9).map((_, index) => (
                  <td key={index + 6} className="px-3 py-2" style={{width: '100px', minWidth: '100px'}}>
                    <InputCell 
                      value={faturamentoRegData.maximo[index + 6]} 
                      onBlur={(value: number) => {
                        const newData = {...faturamentoRegData}
                        newData.maximo[index + 6] = value
                        setFaturamentoRegData(newData)
                        saveFaturamentoRegToServer(newData)
                      }}
                      category="faturamentoReg"
                      monthIndex={index}
                    />
                  </td>
                ))}
                <td className="px-3 py-2">
                  <CalculatedCell value={faturamentoRegData.maximo[9] + faturamentoRegData.maximo[10] + faturamentoRegData.maximo[11]} />
                </td>
                {meses.slice(9, 12).map((_, index) => (
                  <td key={index + 9} className="px-3 py-2" style={{width: '100px', minWidth: '100px'}}>
                    <InputCell 
                      value={faturamentoRegData.maximo[index + 9]} 
                      onBlur={(value: number) => {
                        const newData = {...faturamentoRegData}
                        newData.maximo[index + 9] = value
                        setFaturamentoRegData(newData)
                        saveFaturamentoRegToServer(newData)
                      }}
                      category="faturamentoReg"
                      monthIndex={index}
                    />
                  </td>
                ))}
                <td className="px-3 py-2">
                  <CalculatedCell value={faturamentoRegData.maximo.reduce((sum, v) => sum + v, 0)} />
                </td>
                <td className="px-3 py-2">
                  <CalculatedCell value={faturamentoRegData.maximo.reduce((sum, v) => sum + v, 0) / 12} />
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
                  <CalculatedCell value={faturamentoNnData.previsto[6] + faturamentoNnData.previsto[7] + faturamentoNnData.previsto[8]} />
                </td>
                {meses.slice(6, 9).map((_, index) => (
                  <td key={index + 6} className="px-3 py-2" style={{width: '100px', minWidth: '100px'}}>
                    <InputCell 
                      value={faturamentoNnData.previsto[index + 6]} 
                      onBlur={(value: number) => {
                        const newData = {...faturamentoNnData}
                        newData.previsto[index + 6] = value
                        setFaturamentoNnData(newData)
                        saveFaturamentoNnToServer(newData)
                      }}
                      category="faturamentoNn"
                      monthIndex={index}
                    />
                  </td>
                ))}
                <td className="px-3 py-2">
                  <CalculatedCell value={faturamentoNnData.previsto[9] + faturamentoNnData.previsto[10] + faturamentoNnData.previsto[11]} />
                </td>
                {meses.slice(9, 12).map((_, index) => (
                  <td key={index + 9} className="px-3 py-2" style={{width: '100px', minWidth: '100px'}}>
                    <InputCell 
                      value={faturamentoNnData.previsto[index + 9]} 
                      onBlur={(value: number) => {
                        const newData = {...faturamentoNnData}
                        newData.previsto[index + 9] = value
                        setFaturamentoNnData(newData)
                        saveFaturamentoNnToServer(newData)
                      }}
                      category="faturamentoNn"
                      monthIndex={index}
                    />
                  </td>
                ))}
                <td className="px-3 py-2">
                  <CalculatedCell value={faturamentoNnData.previsto.reduce((sum, v) => sum + v, 0)} />
                </td>
                <td className="px-3 py-2">
                  <CalculatedCell value={faturamentoNnData.previsto.reduce((sum, v) => sum + v, 0) / 12} />
                </td>
              </tr>

              {/* Linha Médio */}
              <tr>
                <td className="px-4 py-3 text-gray-700 sticky left-0 z-10 bg-white">Médio</td>
                <td className="px-3 py-2">
                  <CalculatedCell value={faturamentoNnData.medio[0] + faturamentoNnData.medio[1] + faturamentoNnData.medio[2]} />
                </td>
                {meses.slice(0, 3).map((_, index) => (
                  <td key={index} className="px-3 py-2" style={{width: '100px', minWidth: '100px'}}>
                    <InputCell 
                      value={faturamentoNnData.medio[index]} 
                      onBlur={(value: number) => {
                        const newData = {...faturamentoNnData}
                        newData.medio[index] = value
                        setFaturamentoNnData(newData)
                        saveFaturamentoNnToServer(newData)
                      }}
                      category="faturamentoNn"
                      monthIndex={index}
                    />
                  </td>
                ))}
                <td className="px-3 py-2">
                  <CalculatedCell value={faturamentoNnData.medio[3] + faturamentoNnData.medio[4] + faturamentoNnData.medio[5]} />
                </td>
                {meses.slice(3, 6).map((_, index) => (
                  <td key={index + 3} className="px-3 py-2" style={{width: '100px', minWidth: '100px'}}>
                    <InputCell 
                      value={faturamentoNnData.medio[index + 3]} 
                      onBlur={(value: number) => {
                        const newData = {...faturamentoNnData}
                        newData.medio[index + 3] = value
                        setFaturamentoNnData(newData)
                        saveFaturamentoNnToServer(newData)
                      }}
                      category="faturamentoNn"
                      monthIndex={index}
                    />
                  </td>
                ))}
                <td className="px-3 py-2">
                  <CalculatedCell value={faturamentoNnData.medio[6] + faturamentoNnData.medio[7] + faturamentoNnData.medio[8]} />
                </td>
                {meses.slice(6, 9).map((_, index) => (
                  <td key={index + 6} className="px-3 py-2" style={{width: '100px', minWidth: '100px'}}>
                    <InputCell 
                      value={faturamentoNnData.medio[index + 6]} 
                      onBlur={(value: number) => {
                        const newData = {...faturamentoNnData}
                        newData.medio[index + 6] = value
                        setFaturamentoNnData(newData)
                        saveFaturamentoNnToServer(newData)
                      }}
                      category="faturamentoNn"
                      monthIndex={index}
                    />
                  </td>
                ))}
                <td className="px-3 py-2">
                  <CalculatedCell value={faturamentoNnData.medio[9] + faturamentoNnData.medio[10] + faturamentoNnData.medio[11]} />
                </td>
                {meses.slice(9, 12).map((_, index) => (
                  <td key={index + 9} className="px-3 py-2" style={{width: '100px', minWidth: '100px'}}>
                    <InputCell 
                      value={faturamentoNnData.medio[index + 9]} 
                      onBlur={(value: number) => {
                        const newData = {...faturamentoNnData}
                        newData.medio[index + 9] = value
                        setFaturamentoNnData(newData)
                        saveFaturamentoNnToServer(newData)
                      }}
                      category="faturamentoNn"
                      monthIndex={index}
                    />
                  </td>
                ))}
                <td className="px-3 py-2">
                  <CalculatedCell value={faturamentoNnData.medio.reduce((sum, v) => sum + v, 0)} />
                </td>
                <td className="px-3 py-2">
                  <CalculatedCell value={faturamentoNnData.medio.reduce((sum, v) => sum + v, 0) / 12} />
                </td>
              </tr>

              {/* Linha Máximo */}
              <tr>
                <td className="px-4 py-3 text-gray-700 sticky left-0 z-10 bg-white">Máximo</td>
                <td className="px-3 py-2">
                  <CalculatedCell value={faturamentoNnData.maximo[0] + faturamentoNnData.maximo[1] + faturamentoNnData.maximo[2]} />
                </td>
                {meses.slice(0, 3).map((_, index) => (
                  <td key={index} className="px-3 py-2" style={{width: '100px', minWidth: '100px'}}>
                    <InputCell 
                      value={faturamentoNnData.maximo[index]} 
                      onBlur={(value: number) => {
                        const newData = {...faturamentoNnData}
                        newData.maximo[index] = value
                        setFaturamentoNnData(newData)
                        saveFaturamentoNnToServer(newData)
                      }}
                      category="faturamentoNn"
                      monthIndex={index}
                    />
                  </td>
                ))}
                <td className="px-3 py-2">
                  <CalculatedCell value={faturamentoNnData.maximo[3] + faturamentoNnData.maximo[4] + faturamentoNnData.maximo[5]} />
                </td>
                {meses.slice(3, 6).map((_, index) => (
                  <td key={index + 3} className="px-3 py-2" style={{width: '100px', minWidth: '100px'}}>
                    <InputCell 
                      value={faturamentoNnData.maximo[index + 3]} 
                      onBlur={(value: number) => {
                        const newData = {...faturamentoNnData}
                        newData.maximo[index + 3] = value
                        setFaturamentoNnData(newData)
                        saveFaturamentoNnToServer(newData)
                      }}
                      category="faturamentoNn"
                      monthIndex={index}
                    />
                  </td>
                ))}
                <td className="px-3 py-2">
                  <CalculatedCell value={faturamentoNnData.maximo[6] + faturamentoNnData.maximo[7] + faturamentoNnData.maximo[8]} />
                </td>
                {meses.slice(6, 9).map((_, index) => (
                  <td key={index + 6} className="px-3 py-2" style={{width: '100px', minWidth: '100px'}}>
                    <InputCell 
                      value={faturamentoNnData.maximo[index + 6]} 
                      onBlur={(value: number) => {
                        const newData = {...faturamentoNnData}
                        newData.maximo[index + 6] = value
                        setFaturamentoNnData(newData)
                        saveFaturamentoNnToServer(newData)
                      }}
                      category="faturamentoNn"
                      monthIndex={index}
                    />
                  </td>
                ))}
                <td className="px-3 py-2">
                  <CalculatedCell value={faturamentoNnData.maximo[9] + faturamentoNnData.maximo[10] + faturamentoNnData.maximo[11]} />
                </td>
                {meses.slice(9, 12).map((_, index) => (
                  <td key={index + 9} className="px-3 py-2" style={{width: '100px', minWidth: '100px'}}>
                    <InputCell 
                      value={faturamentoNnData.maximo[index + 9]} 
                      onBlur={(value: number) => {
                        const newData = {...faturamentoNnData}
                        newData.maximo[index + 9] = value
                        setFaturamentoNnData(newData)
                        saveFaturamentoNnToServer(newData)
                      }}
                      category="faturamentoNn"
                      monthIndex={index}
                    />
                  </td>
                ))}
                <td className="px-3 py-2">
                  <CalculatedCell value={faturamentoNnData.maximo.reduce((sum, v) => sum + v, 0)} />
                </td>
                <td className="px-3 py-2">
                  <CalculatedCell value={faturamentoNnData.maximo.reduce((sum, v) => sum + v, 0) / 12} />
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
                    <CalculatedCell value={
                      (faturamentoReurbData.previsto[index] + faturamentoGeoData.previsto[index] + faturamentoPlanData.previsto[index] + faturamentoRegData.previsto[index] + faturamentoNnData.previsto[index])
                    } />
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
                    <CalculatedCell value={
                      (faturamentoReurbData.previsto[index + 3] + faturamentoGeoData.previsto[index + 3] + faturamentoPlanData.previsto[index + 3] + faturamentoRegData.previsto[index + 3] + faturamentoNnData.previsto[index + 3])
                    } />
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
                    <CalculatedCell value={
                      (faturamentoReurbData.previsto[index + 6] + faturamentoGeoData.previsto[index + 6] + faturamentoPlanData.previsto[index + 6] + faturamentoRegData.previsto[index + 6] + faturamentoNnData.previsto[index + 6])
                    } />
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
                    <CalculatedCell value={
                      (faturamentoReurbData.previsto[index + 9] + faturamentoGeoData.previsto[index + 9] + faturamentoPlanData.previsto[index + 9] + faturamentoRegData.previsto[index + 9] + faturamentoNnData.previsto[index + 9])
                    } />
                  </td>
                ))}
                <td className="px-3 py-2">
                  <CalculatedCell value={
                    Array.from({ length: 12 }, (_, i) => i).reduce((sum: number, i: number) => sum + (
                      faturamentoReurbData.previsto[i] + faturamentoGeoData.previsto[i] + faturamentoPlanData.previsto[i] + faturamentoRegData.previsto[i] + faturamentoNnData.previsto[i]
                    ), 0)
                  } />
                </td>
                <td className="px-3 py-2">
                  <CalculatedCell value={
                    (Array.from({ length: 12 }, (_, i) => i).reduce((sum: number, i: number) => sum + (
                      faturamentoReurbData.previsto[i] + faturamentoGeoData.previsto[i] + faturamentoPlanData.previsto[i] + faturamentoRegData.previsto[i] + faturamentoNnData.previsto[i]
                    ), 0) / 12)
                  } />
                </td>
              </tr>

              {/* Linha Médio */}
              <tr>
                <td className="px-4 py-3 text-gray-700 sticky left-0 z-10 bg-white">Médio</td>
                <td className="px-3 py-2">
                  <CalculatedCell value={
                    (
                      (faturamentoReurbData.medio[0] + faturamentoGeoData.medio[0] + faturamentoPlanData.medio[0] + faturamentoRegData.medio[0] + faturamentoNnData.medio[0]) +
                      (faturamentoReurbData.medio[1] + faturamentoGeoData.medio[1] + faturamentoPlanData.medio[1] + faturamentoRegData.medio[1] + faturamentoNnData.medio[1]) +
                      (faturamentoReurbData.medio[2] + faturamentoGeoData.medio[2] + faturamentoPlanData.medio[2] + faturamentoRegData.medio[2] + faturamentoNnData.medio[2])
                    )
                  } />
                </td>
                {meses.slice(0, 3).map((_, index) => (
                  <td key={index} className="px-3 py-2" style={{width: '100px', minWidth: '100px'}}>
                    <CalculatedCell value={
                      (faturamentoReurbData.medio[index] + faturamentoGeoData.medio[index] + faturamentoPlanData.medio[index] + faturamentoRegData.medio[index] + faturamentoNnData.medio[index])
                    } />
                  </td>
                ))}
                <td className="px-3 py-2">
                  <CalculatedCell value={
                    (
                      (faturamentoReurbData.medio[3] + faturamentoGeoData.medio[3] + faturamentoPlanData.medio[3] + faturamentoRegData.medio[3] + faturamentoNnData.medio[3]) +
                      (faturamentoReurbData.medio[4] + faturamentoGeoData.medio[4] + faturamentoPlanData.medio[4] + faturamentoRegData.medio[4] + faturamentoNnData.medio[4]) +
                      (faturamentoReurbData.medio[5] + faturamentoGeoData.medio[5] + faturamentoPlanData.medio[5] + faturamentoRegData.medio[5] + faturamentoNnData.medio[5])
                    )
                  } />
                </td>
                {meses.slice(3, 6).map((_, index) => (
                  <td key={index + 3} className="px-3 py-2" style={{width: '100px', minWidth: '100px'}}>
                    <CalculatedCell value={
                      (faturamentoReurbData.medio[index + 3] + faturamentoGeoData.medio[index + 3] + faturamentoPlanData.medio[index + 3] + faturamentoRegData.medio[index + 3] + faturamentoNnData.medio[index + 3])
                    } />
                  </td>
                ))}
                <td className="px-3 py-2">
                  <CalculatedCell value={
                    (
                      (faturamentoReurbData.medio[6] + faturamentoGeoData.medio[6] + faturamentoPlanData.medio[6] + faturamentoRegData.medio[6] + faturamentoNnData.medio[6]) +
                      (faturamentoReurbData.medio[7] + faturamentoGeoData.medio[7] + faturamentoPlanData.medio[7] + faturamentoRegData.medio[7] + faturamentoNnData.medio[7]) +
                      (faturamentoReurbData.medio[8] + faturamentoGeoData.medio[8] + faturamentoPlanData.medio[8] + faturamentoRegData.medio[8] + faturamentoNnData.medio[8])
                    )
                  } />
                </td>
                {meses.slice(6, 9).map((_, index) => (
                  <td key={index + 6} className="px-3 py-2" style={{width: '100px', minWidth: '100px'}}>
                    <CalculatedCell value={
                      (faturamentoReurbData.medio[index + 6] + faturamentoGeoData.medio[index + 6] + faturamentoPlanData.medio[index + 6] + faturamentoRegData.medio[index + 6] + faturamentoNnData.medio[index + 6])
                    } />
                  </td>
                ))}
                <td className="px-3 py-2">
                  <CalculatedCell value={
                    (
                      (faturamentoReurbData.medio[9] + faturamentoGeoData.medio[9] + faturamentoPlanData.medio[9] + faturamentoRegData.medio[9] + faturamentoNnData.medio[9]) +
                      (faturamentoReurbData.medio[10] + faturamentoGeoData.medio[10] + faturamentoPlanData.medio[10] + faturamentoRegData.medio[10] + faturamentoNnData.medio[10]) +
                      (faturamentoReurbData.medio[11] + faturamentoGeoData.medio[11] + faturamentoPlanData.medio[11] + faturamentoRegData.medio[11] + faturamentoNnData.medio[11])
                    )
                  } />
                </td>
                {meses.slice(9, 12).map((_, index) => (
                  <td key={index + 9} className="px-3 py-2" style={{width: '100px', minWidth: '100px'}}>
                    <CalculatedCell value={
                      (faturamentoReurbData.medio[index + 9] + faturamentoGeoData.medio[index + 9] + faturamentoPlanData.medio[index + 9] + faturamentoRegData.medio[index + 9] + faturamentoNnData.medio[index + 9])
                    } />
                  </td>
                ))}
                <td className="px-3 py-2">
                  <CalculatedCell value={
                    Array.from({ length: 12 }, (_, i) => i).reduce((sum: number, i: number) => sum + (
                      faturamentoReurbData.medio[i] + faturamentoGeoData.medio[i] + faturamentoPlanData.medio[i] + faturamentoRegData.medio[i] + faturamentoNnData.medio[i]
                    ), 0)
                  } />
                </td>
                <td className="px-3 py-2">
                  <CalculatedCell value={
                    (Array.from({ length: 12 }, (_, i) => i).reduce((sum: number, i: number) => sum + (
                      faturamentoReurbData.medio[i] + faturamentoGeoData.medio[i] + faturamentoPlanData.medio[i] + faturamentoRegData.medio[i] + faturamentoNnData.medio[i]
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
                      (faturamentoReurbData.maximo[0] + faturamentoGeoData.maximo[0] + faturamentoPlanData.maximo[0] + faturamentoRegData.maximo[0] + faturamentoNnData.maximo[0]) +
                      (faturamentoReurbData.maximo[1] + faturamentoGeoData.maximo[1] + faturamentoPlanData.maximo[1] + faturamentoRegData.maximo[1] + faturamentoNnData.maximo[1]) +
                      (faturamentoReurbData.maximo[2] + faturamentoGeoData.maximo[2] + faturamentoPlanData.maximo[2] + faturamentoRegData.maximo[2] + faturamentoNnData.maximo[2])
                    )
                  } />
                </td>
                {meses.slice(0, 3).map((_, index) => (
                  <td key={index} className="px-3 py-2" style={{width: '100px', minWidth: '100px'}}>
                    <CalculatedCell value={
                      (faturamentoReurbData.maximo[index] + faturamentoGeoData.maximo[index] + faturamentoPlanData.maximo[index] + faturamentoRegData.maximo[index] + faturamentoNnData.maximo[index])
                    } />
                  </td>
                ))}
                <td className="px-3 py-2">
                  <CalculatedCell value={
                    (
                      (faturamentoReurbData.maximo[3] + faturamentoGeoData.maximo[3] + faturamentoPlanData.maximo[3] + faturamentoRegData.maximo[3] + faturamentoNnData.maximo[3]) +
                      (faturamentoReurbData.maximo[4] + faturamentoGeoData.maximo[4] + faturamentoPlanData.maximo[4] + faturamentoRegData.maximo[4] + faturamentoNnData.maximo[4]) +
                      (faturamentoReurbData.maximo[5] + faturamentoGeoData.maximo[5] + faturamentoPlanData.maximo[5] + faturamentoRegData.maximo[5] + faturamentoNnData.maximo[5])
                    )
                  } />
                </td>
                {meses.slice(3, 6).map((_, index) => (
                  <td key={index + 3} className="px-3 py-2" style={{width: '100px', minWidth: '100px'}}>
                    <CalculatedCell value={
                      (faturamentoReurbData.maximo[index + 3] + faturamentoGeoData.maximo[index + 3] + faturamentoPlanData.maximo[index + 3] + faturamentoRegData.maximo[index + 3] + faturamentoNnData.maximo[index + 3])
                    } />
                  </td>
                ))}
                <td className="px-3 py-2">
                  <CalculatedCell value={
                    (
                      (faturamentoReurbData.maximo[6] + faturamentoGeoData.maximo[6] + faturamentoPlanData.maximo[6] + faturamentoRegData.maximo[6] + faturamentoNnData.maximo[6]) +
                      (faturamentoReurbData.maximo[7] + faturamentoGeoData.maximo[7] + faturamentoPlanData.maximo[7] + faturamentoRegData.maximo[7] + faturamentoNnData.maximo[7]) +
                      (faturamentoReurbData.maximo[8] + faturamentoGeoData.maximo[8] + faturamentoPlanData.maximo[8] + faturamentoRegData.maximo[8] + faturamentoNnData.maximo[8])
                    )
                  } />
                </td>
                {meses.slice(6, 9).map((_, index) => (
                  <td key={index + 6} className="px-3 py-2" style={{width: '100px', minWidth: '100px'}}>
                    <CalculatedCell value={
                      (faturamentoReurbData.maximo[index + 6] + faturamentoGeoData.maximo[index + 6] + faturamentoPlanData.maximo[index + 6] + faturamentoRegData.maximo[index + 6] + faturamentoNnData.maximo[index + 6])
                    } />
                  </td>
                ))}
                <td className="px-3 py-2">
                  <CalculatedCell value={
                    (
                      (faturamentoReurbData.maximo[9] + faturamentoGeoData.maximo[9] + faturamentoPlanData.maximo[9] + faturamentoRegData.maximo[9] + faturamentoNnData.maximo[9]) +
                      (faturamentoReurbData.maximo[10] + faturamentoGeoData.maximo[10] + faturamentoPlanData.maximo[10] + faturamentoRegData.maximo[10] + faturamentoNnData.maximo[10]) +
                      (faturamentoReurbData.maximo[11] + faturamentoGeoData.maximo[11] + faturamentoPlanData.maximo[11] + faturamentoRegData.maximo[11] + faturamentoNnData.maximo[11])
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
