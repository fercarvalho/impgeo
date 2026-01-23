import React, { useState, useEffect } from 'react'
import { Map as MapIcon, ExternalLink } from 'lucide-react'
import ChartModal from './modals/ChartModal'

interface Acompanhamento {
  id: string
  codImovel: number
  imovel: string
  municipio: string
  mapaUrl?: string
  matriculas: string
  nIncraCcir: string
  car: string
  statusCar: string
  itr: string
  geoCertificacao: 'SIM' | 'NÃO'
  geoRegistro: 'SIM' | 'NÃO'
  areaTotal: number
  reservaLegal: number
  cultura1: string
  areaCultura1: number
  cultura2: string
  areaCultura2: number
  outros: string
  areaOutros: number
  appCodigoFlorestal: number
  appVegetada: number
  appNaoVegetada: number
  remanescenteFlorestal: number
}

const API_BASE_URL = '/api'

const AcompanhamentosView: React.FC<{ token: string }> = ({ token }) => {
  const [acompanhamentos, setAcompanhamentos] = useState<Acompanhamento[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string>('')
  const [selectedMapUrl, setSelectedMapUrl] = useState<string>('')
  const [selectedImovel, setSelectedImovel] = useState<string>('')
  const [isMapModalOpen, setIsMapModalOpen] = useState(false)
  const [chartModalOpen, setChartModalOpen] = useState(false)
  const [chartData, setChartData] = useState<Array<{name: string; value: number; color: string}>>([])
  const [chartTitle, setChartTitle] = useState('')
  const [chartSubtitle, setChartSubtitle] = useState('')
  const [chartTotal, setChartTotal] = useState(0)

  useEffect(() => {
    const loadAcompanhamentos = async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/acompanhamentos/public/${token}`)
        const result = await response.json()
        if (result.success) {
          setAcompanhamentos(result.data)
        } else {
          setError(result.error || 'Erro ao carregar dados')
        }
      } catch (error) {
        console.error('Erro ao carregar acompanhamentos:', error)
        setError('Erro ao carregar dados')
      } finally {
        setLoading(false)
      }
    }
    loadAcompanhamentos()
  }, [token])

  const formatNumber = (num: number) => {
    return num.toFixed(2).replace('.', ',')
  }

  // Função para converter URL do Google Maps para formato embed
  const convertMapUrlToEmbed = (url: string): string => {
    if (!url) return ''
    
    // Se já for uma URL embed, retorna como está
    if (url.includes('/embed')) return url
    
    // Extrai o mid (map ID) da URL
    const midMatch = url.match(/[?&]mid=([^&]+)/)
    if (midMatch) {
      const mid = midMatch[1]
      return `https://www.google.com/maps/d/embed?mid=${mid}`
    }
    
    // Se não encontrar mid, tenta converter edit/viewer para embed
    let embedUrl = url
      .replace('/edit', '/embed')
      .replace('/u/0/viewer', '/embed')
      .replace('/viewer', '/embed')
    
    return embedUrl
  }

  // Cores para os gráficos
  const chartColors = [
    '#3b82f6', // azul
    '#22c55e', // verde
    '#ef4444', // vermelho
    '#f59e0b', // laranja
    '#8b5cf6', // roxo
    '#ec4899', // rosa
    '#06b6d4', // ciano
    '#84cc16', // verde limão
    '#f97316', // laranja escuro
    '#6366f1', // índigo
  ]

  // Função para abrir gráfico
  const openChart = (title: string, subtitle: string, data: Array<{name: string; value: number; color: string}>) => {
    if (!data || data.length === 0) {
      alert('Não há dados disponíveis para exibir o gráfico.')
      return
    }
    const total = data.reduce((sum, item) => sum + item.value, 0)
    if (total === 0) {
      alert('Não há dados disponíveis para exibir o gráfico.')
      return
    }
    setChartTitle(title)
    setChartSubtitle(subtitle)
    setChartData(data)
    setChartTotal(total)
    setChartModalOpen(true)
  }

  // Função para normalizar o nome da cultura (remove acentos e converte para maiúsculas)
  const normalizeCulturaName = (name: string): string => {
    if (!name) return ''
    return name
      .toUpperCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim()
  }

  // Função para verificar se uma cultura corresponde ao tipo (com variações)
  const matchesCulturaType = (cultura: string, tipo: string): boolean => {
    const culturaNorm = normalizeCulturaName(cultura)
    const tipoNorm = normalizeCulturaName(tipo)
    
    if (culturaNorm === tipoNorm) return true
    
    // Variações comuns
    const variacoes: { [key: string]: string[] } = {
      'CULTURA TEMPORARIA': ['CULTURA TEMPORARIA', 'CULTURA TEMPORÁRIA', 'TEMPORARIA', 'TEMPORÁRIA'],
      'SILVICULTURA': ['SILVICULTURA', 'SILVICULTURA', 'REFLORESTAMENTO'],
      'PASTO': ['PASTO', 'PASTAGEM', 'PASTAGENS'],
      'BANHADO': ['BANHADO', 'BANHADOS', 'BREJO', 'BREJOS'],
      'SERVIDAO': ['SERVIDAO', 'SERVIDÃO', 'SERVIDOES', 'SERVIÇÕES'],
      'AREA ANTROPIZADA': ['AREA ANTROPIZADA', 'ÁREA ANTROPIZADA', 'ANTROPIZADA', 'ANTROPIZADO']
    }
    
    const variacoesTipo = variacoes[tipoNorm] || []
    return variacoesTipo.some(v => normalizeCulturaName(v) === culturaNorm) || culturaNorm.includes(tipoNorm) || tipoNorm.includes(culturaNorm)
  }

  // Função para calcular área total por tipo de cultura
  const getAreaByCulturaType = (tipo: string): number => {
    let total = 0

    acompanhamentos.forEach(acomp => {
      // Verificar cultura1
      if (matchesCulturaType(acomp.cultura1, tipo)) {
        total += acomp.areaCultura1 || 0
      }
      // Verificar cultura2
      if (matchesCulturaType(acomp.cultura2, tipo)) {
        total += acomp.areaCultura2 || 0
      }
      // Verificar outros
      if (matchesCulturaType(acomp.outros, tipo)) {
        total += acomp.areaOutros || 0
      }
    })

    return total
  }

  // Funções para gerar dados de cada gráfico
  const getTotalImoveisData = () => {
    const byMunicipio = acompanhamentos.reduce((acc, acomp) => {
      acc[acomp.municipio] = (acc[acomp.municipio] || 0) + 1
      return acc
    }, {} as Record<string, number>)

    return Object.entries(byMunicipio)
      .map(([name, value], index) => ({
        name,
        value,
        color: chartColors[index % chartColors.length]
      }))
      .sort((a, b) => b.value - a.value)
  }

  const getAreaTotalData = () => {
    const byMunicipio = acompanhamentos.reduce((acc, acomp) => {
      acc[acomp.municipio] = (acc[acomp.municipio] || 0) + (acomp.areaTotal || 0)
      return acc
    }, {} as Record<string, number>)

    return Object.entries(byMunicipio)
      .map(([name, value], index) => ({
        name,
        value,
        color: chartColors[index % chartColors.length]
      }))
      .sort((a, b) => b.value - a.value)
  }

  const getGeoCertificacaoData = () => {
    const sim = acompanhamentos.filter(a => a.geoCertificacao === 'SIM').length
    const nao = acompanhamentos.filter(a => a.geoCertificacao === 'NÃO').length
    return [
      { name: 'SIM', value: sim, color: '#22c55e' },
      { name: 'NÃO', value: nao, color: '#ef4444' }
    ]
  }

  const getGeoRegistroData = () => {
    const sim = acompanhamentos.filter(a => a.geoRegistro === 'SIM').length
    const nao = acompanhamentos.filter(a => a.geoRegistro === 'NÃO').length
    return [
      { name: 'SIM', value: sim, color: '#22c55e' },
      { name: 'NÃO', value: nao, color: '#ef4444' }
    ]
  }

  const getCulturaData = (tipo: string) => {
    const data = acompanhamentos.map(acomp => {
      let area = 0
      if (matchesCulturaType(acomp.cultura1, tipo)) area += acomp.areaCultura1 || 0
      if (matchesCulturaType(acomp.cultura2, tipo)) area += acomp.areaCultura2 || 0
      if (matchesCulturaType(acomp.outros, tipo)) area += acomp.areaOutros || 0
      return { imovel: acomp.imovel, area }
    }).filter(item => item.area > 0)
      .sort((a, b) => b.area - a.area)
      .slice(0, 10) // Top 10

    return data.map((item, index) => ({
      name: item.imovel,
      value: item.area,
      color: chartColors[index % chartColors.length]
    }))
  }

  const getAPPData = (tipo: 'appCodigoFlorestal' | 'appVegetada' | 'appNaoVegetada' | 'remanescenteFlorestal') => {
    const data = acompanhamentos
      .map(acomp => ({
        imovel: acomp.imovel,
        area: acomp[tipo] || 0
      }))
      .filter(item => item.area > 0)
      .sort((a, b) => b.area - a.area)
      .slice(0, 10) // Top 10

    return data.map((item, index) => ({
      name: item.imovel,
      value: item.area,
      color: chartColors[index % chartColors.length]
    }))
  }

  // Bloquear scroll do body quando o modal de mapa estiver aberto
  useEffect(() => {
    if (isMapModalOpen) {
      const scrollY = window.scrollY
      document.body.style.overflow = 'hidden'
      document.body.style.position = 'fixed'
      document.body.style.top = `-${scrollY}px`
      document.body.style.width = '100%'
    } else {
      const scrollY = document.body.style.top
      document.body.style.overflow = ''
      document.body.style.position = ''
      document.body.style.top = ''
      document.body.style.width = ''
      if (scrollY) {
        window.scrollTo(0, parseInt(scrollY || '0') * -1)
      }
    }
    
    return () => {
      const scrollY = document.body.style.top
      document.body.style.overflow = ''
      document.body.style.position = ''
      document.body.style.top = ''
      document.body.style.width = ''
      if (scrollY) {
        window.scrollTo(0, parseInt(scrollY || '0') * -1)
      }
    }
  }, [isMapModalOpen])

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-3"></div>
          <p className="text-gray-600">Carregando dados...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="text-center bg-white p-8 rounded-lg shadow-md max-w-md">
          <h1 className="text-2xl font-bold text-red-600 mb-4">Erro</h1>
          <p className="text-gray-700">{error}</p>
          <p className="text-sm text-gray-500 mt-4">O link pode estar inválido ou expirado.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-900 to-blue-800 text-white shadow-lg">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold">Acompanhamentos de Imóveis</h1>
              <p className="text-blue-200 mt-1">Visualização somente leitura</p>
            </div>
            <div className="flex items-center gap-2">
              <img src="/imp_logo.png" alt="IMPGEO Logo" className="h-10 w-10 object-contain" />
            </div>
          </div>
        </div>
      </div>

      <main className="max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8 space-y-6">
        {/* Estatísticas */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div 
            className="bg-white rounded-lg shadow-md p-4 cursor-pointer hover:shadow-lg transition-shadow"
            onClick={() => openChart('Distribuição de Imóveis', 'Total de imóveis por município', getTotalImoveisData())}
          >
            <p className="text-sm text-gray-600">Total de Imóveis</p>
            <p className="text-2xl font-bold text-gray-900">{acompanhamentos.length}</p>
          </div>
          <div 
            className="bg-white rounded-lg shadow-md p-4 cursor-pointer hover:shadow-lg transition-shadow"
            onClick={() => openChart('Distribuição de Área Total', 'Área total por município (ha)', getAreaTotalData())}
          >
            <p className="text-sm text-gray-600">Área Total</p>
            <p className="text-2xl font-bold text-gray-900">
              {formatNumber(acompanhamentos.reduce((sum, a) => sum + a.areaTotal, 0))} ha
            </p>
          </div>
          <div 
            className="bg-white rounded-lg shadow-md p-4 cursor-pointer hover:shadow-lg transition-shadow"
            onClick={() => openChart('Geo Certificação', 'Distribuição de imóveis com e sem geo certificação', getGeoCertificacaoData())}
          >
            <p className="text-sm text-gray-600">Com Geo Certificação</p>
            <p className="text-2xl font-bold text-green-600">
              {acompanhamentos.filter(a => a.geoCertificacao === 'SIM').length}
            </p>
          </div>
          <div 
            className="bg-white rounded-lg shadow-md p-4 cursor-pointer hover:shadow-lg transition-shadow"
            onClick={() => openChart('Geo Registro', 'Distribuição de imóveis com e sem geo registro', getGeoRegistroData())}
          >
            <p className="text-sm text-gray-600">Com Geo Registro</p>
            <p className="text-2xl font-bold text-green-600">
              {acompanhamentos.filter(a => a.geoRegistro === 'SIM').length}
            </p>
          </div>
        </div>

        {/* Estatísticas de Área por Tipo de Cultura */}
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4">
          <div 
            className="bg-white rounded-lg shadow-md p-4 cursor-pointer hover:shadow-lg transition-shadow"
            onClick={() => openChart('Silvicultura', 'Distribuição de área por imóvel (ha)', getCulturaData('Silvicultura'))}
          >
            <p className="text-sm text-gray-600">Silvicultura</p>
            <p className="text-2xl font-bold text-gray-900">
              {formatNumber(getAreaByCulturaType('Silvicultura'))} ha
            </p>
          </div>
          <div 
            className="bg-white rounded-lg shadow-md p-4 cursor-pointer hover:shadow-lg transition-shadow"
            onClick={() => openChart('Cultura Temporária', 'Distribuição de área por imóvel (ha)', getCulturaData('Cultura Temporária'))}
          >
            <p className="text-sm text-gray-600">Cultura Temporária</p>
            <p className="text-2xl font-bold text-gray-900">
              {formatNumber(getAreaByCulturaType('Cultura Temporária'))} ha
            </p>
          </div>
          <div 
            className="bg-white rounded-lg shadow-md p-4 cursor-pointer hover:shadow-lg transition-shadow"
            onClick={() => openChart('Pasto', 'Distribuição de área por imóvel (ha)', getCulturaData('Pasto'))}
          >
            <p className="text-sm text-gray-600">Pasto</p>
            <p className="text-2xl font-bold text-gray-900">
              {formatNumber(getAreaByCulturaType('Pasto'))} ha
            </p>
          </div>
          <div 
            className="bg-white rounded-lg shadow-md p-4 cursor-pointer hover:shadow-lg transition-shadow"
            onClick={() => openChart('Banhado', 'Distribuição de área por imóvel (ha)', getCulturaData('Banhado'))}
          >
            <p className="text-sm text-gray-600">Banhado</p>
            <p className="text-2xl font-bold text-gray-900">
              {formatNumber(getAreaByCulturaType('Banhado'))} ha
            </p>
          </div>
          <div 
            className="bg-white rounded-lg shadow-md p-4 cursor-pointer hover:shadow-lg transition-shadow"
            onClick={() => openChart('Servidão', 'Distribuição de área por imóvel (ha)', getCulturaData('Servidão'))}
          >
            <p className="text-sm text-gray-600">Servidão</p>
            <p className="text-2xl font-bold text-gray-900">
              {formatNumber(getAreaByCulturaType('Servidão'))} ha
            </p>
          </div>
          <div 
            className="bg-white rounded-lg shadow-md p-4 cursor-pointer hover:shadow-lg transition-shadow"
            onClick={() => openChart('Área Antropizada', 'Distribuição de área por imóvel (ha)', getCulturaData('Área Antropizada'))}
          >
            <p className="text-sm text-gray-600">Área Antropizada</p>
            <p className="text-2xl font-bold text-gray-900">
              {formatNumber(getAreaByCulturaType('Área Antropizada'))} ha
            </p>
          </div>
        </div>

        {/* Estatísticas de APP e Remanescente Florestal */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div 
            className="bg-white rounded-lg shadow-md p-4 cursor-pointer hover:shadow-lg transition-shadow"
            onClick={() => openChart('APP Código Florestal', 'Distribuição de área por imóvel (ha)', getAPPData('appCodigoFlorestal'))}
          >
            <p className="text-sm text-gray-600">APP Código Florestal</p>
            <p className="text-2xl font-bold text-gray-900">
              {formatNumber(acompanhamentos.reduce((sum, a) => sum + (a.appCodigoFlorestal || 0), 0))} ha
            </p>
          </div>
          <div 
            className="bg-white rounded-lg shadow-md p-4 cursor-pointer hover:shadow-lg transition-shadow"
            onClick={() => openChart('APP Vegetada', 'Distribuição de área por imóvel (ha)', getAPPData('appVegetada'))}
          >
            <p className="text-sm text-gray-600">APP Vegetada</p>
            <p className="text-2xl font-bold text-green-600">
              {formatNumber(acompanhamentos.reduce((sum, a) => sum + (a.appVegetada || 0), 0))} ha
            </p>
          </div>
          <div 
            className="bg-white rounded-lg shadow-md p-4 cursor-pointer hover:shadow-lg transition-shadow"
            onClick={() => openChart('APP Não Vegetada', 'Distribuição de área por imóvel (ha)', getAPPData('appNaoVegetada'))}
          >
            <p className="text-sm text-gray-600">APP Não Vegetada</p>
            <p className="text-2xl font-bold text-orange-600">
              {formatNumber(acompanhamentos.reduce((sum, a) => sum + (a.appNaoVegetada || 0), 0))} ha
            </p>
          </div>
          <div 
            className="bg-white rounded-lg shadow-md p-4 cursor-pointer hover:shadow-lg transition-shadow"
            onClick={() => openChart('Remanescente Florestal', 'Distribuição de área por imóvel (ha)', getAPPData('remanescenteFlorestal'))}
          >
            <p className="text-sm text-gray-600">Remanescente Florestal</p>
            <p className="text-2xl font-bold text-green-700">
              {formatNumber(acompanhamentos.reduce((sum, a) => sum + (a.remanescenteFlorestal || 0), 0))} ha
            </p>
          </div>
        </div>

        {/* Tabela */}
        <div className="bg-white rounded-lg shadow-md overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[2000px]">
              <thead>
                <tr className="bg-gradient-to-r from-blue-900 to-blue-800 text-white">
                  <th className="px-3 py-3 text-left text-xs font-bold uppercase tracking-wider">COD. IMP</th>
                  <th className="px-3 py-3 text-left text-xs font-bold uppercase tracking-wider">IMÓVEL</th>
                  <th className="px-3 py-3 text-left text-xs font-bold uppercase tracking-wider">MUNICÍPIO</th>
                  <th className="px-3 py-3 text-left text-xs font-bold uppercase tracking-wider">MATRÍCULAS</th>
                  <th className="px-3 py-3 text-left text-xs font-bold uppercase tracking-wider">N INCRA / CCIR</th>
                  <th className="px-3 py-3 text-left text-xs font-bold uppercase tracking-wider">CAR</th>
                  <th className="px-3 py-3 text-left text-xs font-bold uppercase tracking-wider">STATUS CAR</th>
                  <th className="px-3 py-3 text-left text-xs font-bold uppercase tracking-wider">ITR</th>
                  <th className="px-3 py-3 text-left text-xs font-bold uppercase tracking-wider">GEO CERTIFICAÇÃO</th>
                  <th className="px-3 py-3 text-left text-xs font-bold uppercase tracking-wider">GEO REGISTRO</th>
                  <th className="px-3 py-3 text-left text-xs font-bold uppercase tracking-wider">ÁREA TOTAL (ha)</th>
                  <th className="px-3 py-3 text-left text-xs font-bold uppercase tracking-wider">20% RESERVA LEGAL (ha)</th>
                  <th className="px-3 py-3 text-left text-xs font-bold uppercase tracking-wider">CULTURAS</th>
                  <th className="px-3 py-3 text-left text-xs font-bold uppercase tracking-wider">ÁREA (ha)</th>
                  <th className="px-3 py-3 text-left text-xs font-bold uppercase tracking-wider">CULTURAS</th>
                  <th className="px-3 py-3 text-left text-xs font-bold uppercase tracking-wider">ÁREA (ha)</th>
                  <th className="px-3 py-3 text-left text-xs font-bold uppercase tracking-wider">OUTROS</th>
                  <th className="px-3 py-3 text-left text-xs font-bold uppercase tracking-wider">ÁREA (ha)</th>
                  <th className="px-3 py-3 text-left text-xs font-bold uppercase tracking-wider">APP (CÓDIGO FLORESTAL)</th>
                  <th className="px-3 py-3 text-left text-xs font-bold uppercase tracking-wider">APP (VEGETADA)</th>
                  <th className="px-3 py-3 text-left text-xs font-bold uppercase tracking-wider">APP (NÃO VEGETADA)</th>
                  <th className="px-3 py-3 text-left text-xs font-bold uppercase tracking-wider">REMANESCENTE FLORESTAL (ha)</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {acompanhamentos.map((acomp, index) => (
                  <tr
                    key={acomp.id}
                    className={index % 2 === 0 ? 'bg-white' : 'bg-blue-50 hover:bg-blue-100'}
                  >
                    <td className="px-3 py-2 whitespace-nowrap font-semibold">{acomp.codImovel}</td>
                    <td className="px-3 py-2 whitespace-nowrap font-semibold">
                      {acomp.mapaUrl ? (
                        <button
                          onClick={() => {
                            setSelectedMapUrl(acomp.mapaUrl || '')
                            setSelectedImovel(acomp.imovel)
                            setIsMapModalOpen(true)
                          }}
                          className="text-blue-600 hover:text-blue-800 hover:underline cursor-pointer flex items-center gap-1"
                          title="Ver mapa do imóvel"
                        >
                          {acomp.imovel}
                          <MapIcon className="w-4 h-4" />
                        </button>
                      ) : (
                        <span>{acomp.imovel}</span>
                      )}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap font-semibold">{acomp.municipio}</td>
                    <td className="px-3 py-2 whitespace-nowrap text-sm text-gray-700">{acomp.matriculas}</td>
                    <td className="px-3 py-2 whitespace-nowrap text-sm text-gray-700">{acomp.nIncraCcir}</td>
                    <td className="px-3 py-2 text-sm text-gray-700 max-w-xs truncate" title={acomp.car}>{acomp.car}</td>
                    <td className="px-3 py-2 whitespace-nowrap text-sm text-gray-700">{acomp.statusCar}</td>
                    <td className="px-3 py-2 whitespace-nowrap text-sm text-gray-700">{acomp.itr || '-'}</td>
                    <td className="px-3 py-2 whitespace-nowrap text-sm">
                      <span className={`px-2 py-1 rounded-full text-xs font-semibold ${
                        acomp.geoCertificacao === 'SIM' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                      }`}>
                        {acomp.geoCertificacao}
                      </span>
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap text-sm">
                      <span className={`px-2 py-1 rounded-full text-xs font-semibold ${
                        acomp.geoRegistro === 'SIM' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                      }`}>
                        {acomp.geoRegistro}
                      </span>
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap text-sm text-gray-700 font-semibold">{formatNumber(acomp.areaTotal)}</td>
                    <td className="px-3 py-2 whitespace-nowrap text-sm text-gray-700">{formatNumber(acomp.reservaLegal)}</td>
                    <td className="px-3 py-2 whitespace-nowrap text-sm text-gray-700">{acomp.cultura1}</td>
                    <td className="px-3 py-2 whitespace-nowrap text-sm text-gray-700">{formatNumber(acomp.areaCultura1)}</td>
                    <td className="px-3 py-2 whitespace-nowrap text-sm text-gray-700">{acomp.cultura2}</td>
                    <td className="px-3 py-2 whitespace-nowrap text-sm text-gray-700">{formatNumber(acomp.areaCultura2)}</td>
                    <td className="px-3 py-2 whitespace-nowrap text-sm text-gray-700">{acomp.outros}</td>
                    <td className="px-3 py-2 whitespace-nowrap text-sm text-gray-700">{formatNumber(acomp.areaOutros)}</td>
                    <td className="px-3 py-2 whitespace-nowrap text-sm text-gray-700">{formatNumber(acomp.appCodigoFlorestal)}</td>
                    <td className="px-3 py-2 whitespace-nowrap text-sm text-gray-700">{formatNumber(acomp.appVegetada)}</td>
                    <td className="px-3 py-2 whitespace-nowrap text-sm text-gray-700">{formatNumber(acomp.appNaoVegetada)}</td>
                    <td className="px-3 py-2 whitespace-nowrap text-sm text-gray-700">{formatNumber(acomp.remanescenteFlorestal)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </main>

      {/* Modal do Mapa */}
      {isMapModalOpen && selectedMapUrl && (
        <div 
          className="fixed top-0 left-0 right-0 bottom-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
          style={{ margin: 0, padding: 0 }}
          onClick={() => {
            setIsMapModalOpen(false)
            setSelectedMapUrl('')
            setSelectedImovel('')
          }}
        >
          <div 
            className="bg-white rounded-lg shadow-xl w-full max-w-6xl max-h-[90vh] flex flex-col m-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-center p-6 border-b flex-shrink-0">
              <div>
                <h2 className="text-2xl font-bold text-gray-900">Mapa do Imóvel</h2>
                <p className="text-gray-600 mt-1">{selectedImovel}</p>
              </div>
              <button
                onClick={() => {
                  setIsMapModalOpen(false)
                  setSelectedMapUrl('')
                  setSelectedImovel('')
                }}
                className="text-gray-400 hover:text-gray-600 text-2xl transition-colors"
              >
                ✕
              </button>
            </div>
            <div className="flex-1 p-6 overflow-hidden">
              <div className="w-full h-full min-h-[500px] rounded-lg overflow-hidden border border-gray-200">
                <iframe
                  src={convertMapUrlToEmbed(selectedMapUrl)}
                  width="100%"
                  height="100%"
                  style={{ minHeight: '500px' }}
                  allowFullScreen
                  loading="lazy"
                  referrerPolicy="no-referrer-when-downgrade"
                  className="w-full h-full"
                  title={`Mapa do imóvel: ${selectedImovel}`}
                />
              </div>
              <div className="mt-4 flex justify-end">
                <a
                  href={selectedMapUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-4 py-2 text-sm bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
                >
                  <ExternalLink className="w-4 h-4" />
                  Abrir em nova aba
                </a>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Gráfico */}
      <ChartModal
        isOpen={chartModalOpen}
        onClose={() => setChartModalOpen(false)}
        title={chartTitle}
        subtitle={chartSubtitle}
        data={chartData}
        totalValue={chartTotal}
        valueUnit="ha"
      />
    </div>
  )
}

export default AcompanhamentosView

