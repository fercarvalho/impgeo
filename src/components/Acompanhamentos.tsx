import React, { useState, useEffect, useRef } from 'react'
import { Plus, Edit, Trash2, Download, Upload, Search, Filter, Share2, Copy, Check } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
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

const Acompanhamentos: React.FC = () => {
  const { token } = useAuth()
  const [acompanhamentos, setAcompanhamentos] = useState<Acompanhamento[]>([])
  const [filteredAcompanhamentos, setFilteredAcompanhamentos] = useState<Acompanhamento[]>([])
  const [searchTerm, setSearchTerm] = useState('')
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [isMapModalOpen, setIsMapModalOpen] = useState(false)
  const [selectedMapUrl, setSelectedMapUrl] = useState<string>('')
  const [selectedImovel, setSelectedImovel] = useState<string>('')
  const [editing, setEditing] = useState<Acompanhamento | null>(null)
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set())
  const [isImportModalOpen, setIsImportModalOpen] = useState(false)
  const [isShareModalOpen, setIsShareModalOpen] = useState(false)
  const [shareLink, setShareLink] = useState<string>('')
  const [linkCopied, setLinkCopied] = useState(false)
  const [chartModalOpen, setChartModalOpen] = useState(false)
  const [chartData, setChartData] = useState<Array<{name: string; value: number; color: string}>>([])
  const [chartTitle, setChartTitle] = useState('')
  const [chartSubtitle, setChartSubtitle] = useState('')
  const [chartTotal, setChartTotal] = useState(0)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  
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
  
  const [form, setForm] = useState<Partial<Acompanhamento>>({
    codImovel: 0,
    imovel: '',
    municipio: '',
    mapaUrl: '',
    matriculas: '',
    nIncraCcir: '',
    car: '',
    statusCar: 'ATIVO - AGUARDANDO ANÁLISE SC',
    itr: '',
    geoCertificacao: 'NÃO',
    geoRegistro: 'NÃO',
    areaTotal: 0,
    reservaLegal: 0,
    cultura1: '',
    areaCultura1: 0,
    cultura2: '',
    areaCultura2: 0,
    outros: '',
    areaOutros: 0,
    appCodigoFlorestal: 0,
    appVegetada: 0,
    appNaoVegetada: 0,
    remanescenteFlorestal: 0
  })
  const [formErrors, setFormErrors] = useState<{[key: string]: string}>({})

  // Dados de exemplo baseados na imagem
  const exemploDados: Acompanhamento[] = [
    {
      id: '1',
      codImovel: 1,
      imovel: 'Fazenda Jacarezinho',
      municipio: 'Joaquim Távora',
      mapaUrl: 'https://www.google.com/maps/d/u/0/viewer?mid=1k5w8dSy80Myferbi0r97qEkRs1mjvg8&ll=-23.49775002923756%2C-49.8515265&z=17',
      matriculas: '4031, 4183',
      nIncraCcir: '731.000.003.808-7',
      car: 'PR-4112803-06020389GGA77AG9000237709GA760A2',
      statusCar: 'ATIVO - AGUARDANDO ANÁLISE SC',
      itr: '',
      geoCertificacao: 'SIM',
      geoRegistro: 'SIM',
      areaTotal: 33.26,
      reservaLegal: 2.35,
      cultura1: 'Cultura Temporária',
      areaCultura1: 5.64,
      cultura2: 'Pasto',
      areaCultura2: 3.22,
      outros: 'Horta',
      areaOutros: 0.83,
      appCodigoFlorestal: 2.38,
      appVegetada: 1.44,
      appNaoVegetada: 0.62,
      remanescenteFlorestal: 0.68
    },
    {
      id: '2',
      codImovel: 2,
      imovel: 'Fazenda Imbu',
      municipio: 'Ivaí',
      matriculas: '8105, 957, 8156',
      nIncraCcir: '706.045.005.095-9',
      car: 'PR-4112803-06020389GGA77AG9000237709GA760A2',
      statusCar: 'ATIVO - AGUARDANDO ANÁLISE SC',
      itr: '',
      geoCertificacao: 'SIM',
      geoRegistro: 'SIM',
      areaTotal: 73.97,
      reservaLegal: 5.44,
      cultura1: 'Silvicultura',
      areaCultura1: 55.85,
      cultura2: 'Soja',
      areaCultura2: 66.34,
      outros: 'Área Arrozeada',
      areaOutros: 0.03,
      appCodigoFlorestal: 14.73,
      appVegetada: 13.68,
      appNaoVegetada: 1.05,
      remanescenteFlorestal: 4.35
    },
    {
      id: '3',
      codImovel: 3,
      imovel: 'Barro Preto',
      municipio: 'Tibagi (Ventania)',
      matriculas: '1192',
      nIncraCcir: '',
      car: '',
      statusCar: 'ATIVO - AGUARDANDO ANÁLISE SC',
      itr: '',
      geoCertificacao: 'NÃO',
      geoRegistro: 'NÃO',
      areaTotal: 114.24,
      reservaLegal: 22.62,
      cultura1: 'Cultura Temporária',
      areaCultura1: 72.58,
      cultura2: 'Bertado',
      areaCultura2: 4.21,
      outros: 'Servidão',
      areaOutros: 0.11,
      appCodigoFlorestal: 11.5,
      appVegetada: 11.13,
      appNaoVegetada: 0.57,
      remanescenteFlorestal: 37.15
    }
  ]

  useEffect(() => {
    // Carregar dados da API
    const loadAcompanhamentos = async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/acompanhamentos`)
        const result = await response.json()
        if (result.success) {
          setAcompanhamentos(result.data)
          setFilteredAcompanhamentos(result.data)
        } else {
          // Se não houver dados, usar dados de exemplo
          setAcompanhamentos(exemploDados)
          setFilteredAcompanhamentos(exemploDados)
        }
      } catch (error) {
        console.error('Erro ao carregar acompanhamentos:', error)
        // Em caso de erro, usar dados de exemplo
        setAcompanhamentos(exemploDados)
        setFilteredAcompanhamentos(exemploDados)
      }
    }
    loadAcompanhamentos()
  }, [])

  useEffect(() => {
    const filtered = acompanhamentos.filter(acomp =>
      acomp.imovel.toLowerCase().includes(searchTerm.toLowerCase()) ||
      acomp.municipio.toLowerCase().includes(searchTerm.toLowerCase()) ||
      acomp.codImovel.toString().includes(searchTerm)
    )
    setFilteredAcompanhamentos(filtered)
  }, [searchTerm, acompanhamentos])

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

  const handleEdit = (acomp: Acompanhamento) => {
    setEditing(acomp)
    setForm(acomp)
    setIsModalOpen(true)
  }

  const handleNew = () => {
    setEditing(null)
    setForm({
      codImovel: 0,
      imovel: '',
      municipio: '',
      mapaUrl: '',
      matriculas: '',
      nIncraCcir: '',
      car: '',
      statusCar: 'ATIVO - AGUARDANDO ANÁLISE SC',
      itr: '',
      geoCertificacao: 'NÃO',
      geoRegistro: 'NÃO',
      areaTotal: 0,
      reservaLegal: 0,
      cultura1: '',
      areaCultura1: 0,
      cultura2: '',
      areaCultura2: 0,
      outros: '',
      areaOutros: 0,
      appCodigoFlorestal: 0,
      appVegetada: 0,
      appNaoVegetada: 0,
      remanescenteFlorestal: 0
    })
    setFormErrors({})
    setIsModalOpen(true)
  }

  const validateForm = () => {
    const errors: {[key: string]: string} = {}
    
    if (!form.codImovel || form.codImovel <= 0) errors.codImovel = 'Código do imóvel é obrigatório'
    if (!form.imovel?.trim()) errors.imovel = 'Nome do imóvel é obrigatório'
    if (!form.municipio?.trim()) errors.municipio = 'Município é obrigatório'
    
    setFormErrors(errors)
    return Object.keys(errors).length === 0
  }

  const handleSave = async () => {
    if (!validateForm()) return

    try {
      const acompanhamentoData = {
        codImovel: form.codImovel || 0,
        imovel: form.imovel || '',
        municipio: form.municipio || '',
        mapaUrl: form.mapaUrl || '',
        matriculas: form.matriculas || '',
        nIncraCcir: form.nIncraCcir || '',
        car: form.car || '',
        statusCar: form.statusCar || 'ATIVO - AGUARDANDO ANÁLISE SC',
        itr: form.itr || '',
        geoCertificacao: form.geoCertificacao || 'NÃO',
        geoRegistro: form.geoRegistro || 'NÃO',
        areaTotal: form.areaTotal || 0,
        reservaLegal: form.reservaLegal || 0,
        cultura1: form.cultura1 || '',
        areaCultura1: form.areaCultura1 || 0,
        cultura2: form.cultura2 || '',
        areaCultura2: form.areaCultura2 || 0,
        outros: form.outros || '',
        areaOutros: form.areaOutros || 0,
        appCodigoFlorestal: form.appCodigoFlorestal || 0,
        appVegetada: form.appVegetada || 0,
        appNaoVegetada: form.appNaoVegetada || 0,
        remanescenteFlorestal: form.remanescenteFlorestal || 0
      }

      if (editing) {
        // Atualizar
        const response = await fetch(`${API_BASE_URL}/acompanhamentos/${editing.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(acompanhamentoData)
        })
        
        if (!response.ok) {
          const errorText = await response.text()
          throw new Error(errorText || `Erro HTTP: ${response.status}`)
        }
        
        const result = await response.json()
        if (result.success) {
          const updated = acompanhamentos.map(a => a.id === editing.id ? { ...result.data, id: editing.id } : a)
          setAcompanhamentos(updated)
          setFilteredAcompanhamentos(updated)
          setIsModalOpen(false)
          setEditing(null)
          setFormErrors({})
        } else {
          alert('Erro ao atualizar acompanhamento: ' + (result.error || 'Erro desconhecido'))
        }
      } else {
        // Criar novo
        const response = await fetch(`${API_BASE_URL}/acompanhamentos`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(acompanhamentoData)
        })
        
        if (!response.ok) {
          const errorText = await response.text()
          throw new Error(errorText || `Erro HTTP: ${response.status}`)
        }
        
        const result = await response.json()
        if (result.success) {
          const updated = [...acompanhamentos, result.data]
          setAcompanhamentos(updated)
          setFilteredAcompanhamentos(updated)
          setIsModalOpen(false)
          setEditing(null)
          setFormErrors({})
        } else {
          alert('Erro ao criar acompanhamento: ' + (result.error || 'Erro desconhecido'))
        }
      }
    } catch (error: any) {
      console.error('Erro ao salvar acompanhamento:', error)
      const errorMessage = error?.message || error?.toString() || 'Erro desconhecido ao salvar acompanhamento'
      alert(`Erro ao salvar acompanhamento: ${errorMessage}`)
    }
  }

  const handleDelete = async (id: string) => {
    if (window.confirm('Tem certeza que deseja excluir este acompanhamento?')) {
      try {
        const response = await fetch(`${API_BASE_URL}/acompanhamentos/${id}`, {
          method: 'DELETE'
        })
        const result = await response.json()
        if (result.success) {
          setAcompanhamentos(acompanhamentos.filter(a => a.id !== id))
          setFilteredAcompanhamentos(filteredAcompanhamentos.filter(a => a.id !== id))
        } else {
          alert('Erro ao excluir acompanhamento: ' + result.error)
        }
      } catch (error) {
        console.error('Erro ao excluir acompanhamento:', error)
        alert('Erro ao excluir acompanhamento')
      }
    }
  }

  const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) {
      setSelectedItems(new Set(acompanhamentos.map(a => a.id)))
    } else {
      setSelectedItems(new Set())
    }
  }

  const handleSelectItem = (id: string) => {
    const newSelected = new Set(selectedItems)
    if (newSelected.has(id)) {
      newSelected.delete(id)
    } else {
      newSelected.add(id)
    }
    setSelectedItems(newSelected)
  }

  const formatNumber = (num: number) => {
    return num.toFixed(2).replace('.', ',')
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

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    // Validar extensão
    if (!file.name.toLowerCase().endsWith('.xlsx')) {
      alert('Por favor, selecione um arquivo Excel (.xlsx)')
      if (fileInputRef.current) fileInputRef.current.value = ''
      return
    }

    // Validar tamanho (10MB)
    const maxSize = 10 * 1024 * 1024 // 10MB
    if (file.size > maxSize) {
      alert('O arquivo é muito grande! Tamanho máximo permitido: 10MB')
      if (fileInputRef.current) fileInputRef.current.value = ''
      return
    }
    
    const formData = new FormData()
    formData.append('file', file)
    formData.append('type', 'acompanhamentos')
    
    fetch(`${API_BASE_URL}/import`, { method: 'POST', body: formData })
      .then(async r => {
        const contentType = r.headers.get('content-type')
        if (contentType && contentType.includes('application/json')) {
          return r.json()
        } else {
          const text = await r.text()
          throw new Error(text || 'Erro desconhecido')
        }
      })
      .then(data => {
        if (data.success) {
          const updated = [...acompanhamentos, ...data.data]
          setAcompanhamentos(updated)
          setFilteredAcompanhamentos(updated)
          alert(`${data.data.length} acompanhamentos importados com sucesso!`)
          setIsImportModalOpen(false)
        } else {
          alert('Erro ao importar: ' + (data.error || data.message || 'Erro desconhecido'))
        }
      })
      .catch(error => {
        console.error('Erro ao importar:', error)
        alert('Erro ao importar arquivo: ' + (error.message || 'Verifique se o arquivo está no formato correto e tente novamente'))
      })
      .finally(() => {
        if (fileInputRef.current) fileInputRef.current.value = ''
      })
  }

  const downloadModel = () => {
    window.open(`${API_BASE_URL}/modelo/acompanhamentos`, '_blank')
  }

  const generateShareLink = async () => {
    if (!token) {
      alert('Você precisa estar autenticado para gerar um link compartilhável')
      return
    }

    try {
      const response = await fetch(`${API_BASE_URL}/acompanhamentos/generate-share-link`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      })
      
      const contentType = response.headers.get('content-type')
      if (!contentType || !contentType.includes('application/json')) {
        const text = await response.text()
        throw new Error(text || 'Erro desconhecido')
      }

      const result = await response.json()
      if (result.success) {
        const fullLink = `${window.location.origin}${window.location.pathname}?token=${result.token}`
        setShareLink(fullLink)
        setIsShareModalOpen(true)
      } else {
        alert('Erro ao gerar link: ' + (result.error || result.message || 'Erro desconhecido'))
      }
    } catch (error: any) {
      console.error('Erro ao gerar link:', error)
      alert('Erro ao gerar link compartilhável: ' + (error.message || 'Verifique sua conexão e tente novamente'))
    }
  }

  const copyToClipboard = () => {
    navigator.clipboard.writeText(shareLink).then(() => {
      setLinkCopied(true)
      setTimeout(() => setLinkCopied(false), 2000)
    })
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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white rounded-lg shadow-md p-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Acompanhamentos</h1>
            <p className="text-gray-600 mt-1">Gestão de propriedades rurais e cadastros ambientais</p>
          </div>
          <div className="flex gap-2">
            <button 
              onClick={generateShareLink}
              className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
            >
              <Share2 className="h-4 w-4" />
              Gerar Link Compartilhável
            </button>
            <button 
              onClick={() => setIsImportModalOpen(true)}
              className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
            >
              <Upload className="h-4 w-4" />
              Importar
            </button>
            <button className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">
              <Download className="h-4 w-4" />
              Exportar
            </button>
            <button
              onClick={handleNew}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              <Plus className="h-4 w-4" />
              Novo
            </button>
          </div>
        </div>
      </div>

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

      {/* Filtros e Busca */}
      <div className="bg-white rounded-lg shadow-md p-4">
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-5 w-5" />
            <input
              type="text"
              placeholder="Buscar por imóvel, município ou código..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          <button className="flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors">
            <Filter className="h-4 w-4" />
            Filtros
          </button>
        </div>
      </div>

      {/* Tabela */}
      <div className="bg-white rounded-lg shadow-md overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[2000px]">
            <thead>
              <tr className="bg-gradient-to-r from-blue-900 to-blue-800 text-white">
                <th className="px-3 py-3 text-left text-xs font-bold uppercase tracking-wider">
                  <input
                    type="checkbox"
                    onChange={handleSelectAll}
                    checked={selectedItems.size === acompanhamentos.length && acompanhamentos.length > 0}
                    className="rounded"
                  />
                </th>
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
                <th className="px-3 py-3 text-left text-xs font-bold uppercase tracking-wider">AÇÕES</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredAcompanhamentos.map((acomp, index) => (
                <tr
                  key={acomp.id}
                  className={index % 2 === 0 ? 'bg-white' : 'bg-blue-50 hover:bg-blue-100'}
                >
                  <td className="px-3 py-2 whitespace-nowrap">
                    <input
                      type="checkbox"
                      checked={selectedItems.has(acomp.id)}
                      onChange={() => handleSelectItem(acomp.id)}
                      className="rounded"
                    />
                  </td>
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
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
                        </svg>
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
                  <td className="px-3 py-2 whitespace-nowrap text-sm font-medium">
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleEdit(acomp)}
                        className="text-blue-600 hover:text-blue-900"
                        title="Editar"
                      >
                        <Edit className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => handleDelete(acomp.id)}
                        className="text-red-600 hover:text-red-900"
                        title="Excluir"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal de Edição/Criação */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-6xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-bold text-gray-900">
                  {editing ? 'Editar Acompanhamento' : 'Novo Acompanhamento'}
                </h2>
                <button
                  type="button"
                  onClick={() => {
                    setIsModalOpen(false)
                    setEditing(null)
                    setFormErrors({})
                  }}
                  className="text-gray-400 hover:text-gray-600 text-2xl"
                >
                  ✕
                </button>
              </div>

              <div className="space-y-6">
                {/* Informações Básicas */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Código do Imóvel *
                    </label>
                    <input
                      type="number"
                      value={form.codImovel || ''}
                      onChange={(e) => setForm({ ...form, codImovel: parseInt(e.target.value) || 0 })}
                      className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 ${
                        formErrors.codImovel ? 'border-red-500' : 'border-gray-300'
                      }`}
                    />
                    {formErrors.codImovel && (
                      <p className="text-red-500 text-xs mt-1">{formErrors.codImovel}</p>
                    )}
                  </div>

                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Nome do Imóvel *
                    </label>
                    <input
                      type="text"
                      value={form.imovel || ''}
                      onChange={(e) => setForm({ ...form, imovel: e.target.value })}
                      className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 ${
                        formErrors.imovel ? 'border-red-500' : 'border-gray-300'
                      }`}
                    />
                    {formErrors.imovel && (
                      <p className="text-red-500 text-xs mt-1">{formErrors.imovel}</p>
                    )}
                  </div>

                  <div className="md:col-span-3">
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Município *
                    </label>
                    <input
                      type="text"
                      value={form.municipio || ''}
                      onChange={(e) => setForm({ ...form, municipio: e.target.value })}
                      className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 ${
                        formErrors.municipio ? 'border-red-500' : 'border-gray-300'
                      }`}
                    />
                    {formErrors.municipio && (
                      <p className="text-red-500 text-xs mt-1">{formErrors.municipio}</p>
                    )}
                  </div>

                  <div className="md:col-span-3">
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Link do Google Maps
                    </label>
                    <input
                      type="url"
                      value={form.mapaUrl || ''}
                      onChange={(e) => setForm({ ...form, mapaUrl: e.target.value })}
                      placeholder="https://www.google.com/maps/d/u/0/viewer?..."
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      Cole o link completo do Google Maps para este imóvel
                    </p>
                  </div>
                </div>

                {/* Documentos e Registros */}
                <div className="border-t pt-4">
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">Documentos e Registros</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Matrículas
                      </label>
                      <input
                        type="text"
                        value={form.matriculas || ''}
                        onChange={(e) => setForm({ ...form, matriculas: e.target.value })}
                        placeholder="Ex: 4031, 4183"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        N INCRA / CCIR
                      </label>
                      <input
                        type="text"
                        value={form.nIncraCcir || ''}
                        onChange={(e) => setForm({ ...form, nIncraCcir: e.target.value })}
                        placeholder="Ex: 731.000.003.808-7"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        CAR (Cadastro Ambiental Rural)
                      </label>
                      <input
                        type="text"
                        value={form.car || ''}
                        onChange={(e) => setForm({ ...form, car: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Status CAR
                      </label>
                      <select
                        value={form.statusCar || 'ATIVO - AGUARDANDO ANÁLISE SC'}
                        onChange={(e) => setForm({ ...form, statusCar: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                      >
                        <option>ATIVO - AGUARDANDO ANÁLISE SC</option>
                        <option>ATIVO</option>
                        <option>PENDENTE</option>
                        <option>INATIVO</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        ITR
                      </label>
                      <input
                        type="text"
                        value={form.itr || ''}
                        onChange={(e) => setForm({ ...form, itr: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  </div>
                </div>

                {/* Geo Certificação e Registro */}
                <div className="border-t pt-4">
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">Geo Certificação e Registro</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Geo Certificação
                      </label>
                      <select
                        value={form.geoCertificacao || 'NÃO'}
                        onChange={(e) => setForm({ ...form, geoCertificacao: e.target.value as 'SIM' | 'NÃO' })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="SIM">SIM</option>
                        <option value="NÃO">NÃO</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Geo Registro
                      </label>
                      <select
                        value={form.geoRegistro || 'NÃO'}
                        onChange={(e) => setForm({ ...form, geoRegistro: e.target.value as 'SIM' | 'NÃO' })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="SIM">SIM</option>
                        <option value="NÃO">NÃO</option>
                      </select>
                    </div>
                  </div>
                </div>

                {/* Áreas */}
                <div className="border-t pt-4">
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">Áreas (em hectares)</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Área Total (ha)
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        value={form.areaTotal || ''}
                        onChange={(e) => setForm({ ...form, areaTotal: parseFloat(e.target.value) || 0 })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        20% Reserva Legal (ha)
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        value={form.reservaLegal || ''}
                        onChange={(e) => setForm({ ...form, reservaLegal: parseFloat(e.target.value) || 0 })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  </div>
                </div>

                {/* Culturas */}
                <div className="border-t pt-4">
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">Culturas</h3>
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Cultura 1
                      </label>
                      <input
                        type="text"
                        value={form.cultura1 || ''}
                        onChange={(e) => setForm({ ...form, cultura1: e.target.value })}
                        placeholder="Ex: Cultura Temporária"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Área Cultura 1 (ha)
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        value={form.areaCultura1 || ''}
                        onChange={(e) => setForm({ ...form, areaCultura1: parseFloat(e.target.value) || 0 })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Cultura 2
                      </label>
                      <input
                        type="text"
                        value={form.cultura2 || ''}
                        onChange={(e) => setForm({ ...form, cultura2: e.target.value })}
                        placeholder="Ex: Pasto"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Área Cultura 2 (ha)
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        value={form.areaCultura2 || ''}
                        onChange={(e) => setForm({ ...form, areaCultura2: parseFloat(e.target.value) || 0 })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  </div>
                </div>

                {/* Outros Usos */}
                <div className="border-t pt-4">
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">Outros Usos</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Outros
                      </label>
                      <input
                        type="text"
                        value={form.outros || ''}
                        onChange={(e) => setForm({ ...form, outros: e.target.value })}
                        placeholder="Ex: Horta, Servidão"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Área Outros (ha)
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        value={form.areaOutros || ''}
                        onChange={(e) => setForm({ ...form, areaOutros: parseFloat(e.target.value) || 0 })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  </div>
                </div>

                {/* APP e Remanescente Florestal */}
                <div className="border-t pt-4">
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">APP e Remanescente Florestal</h3>
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        APP Código Florestal (ha)
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        value={form.appCodigoFlorestal || ''}
                        onChange={(e) => setForm({ ...form, appCodigoFlorestal: parseFloat(e.target.value) || 0 })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        APP Vegetada (ha)
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        value={form.appVegetada || ''}
                        onChange={(e) => setForm({ ...form, appVegetada: parseFloat(e.target.value) || 0 })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        APP Não Vegetada (ha)
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        value={form.appNaoVegetada || ''}
                        onChange={(e) => setForm({ ...form, appNaoVegetada: parseFloat(e.target.value) || 0 })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Remanescente Florestal (ha)
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        value={form.remanescenteFlorestal || ''}
                        onChange={(e) => setForm({ ...form, remanescenteFlorestal: parseFloat(e.target.value) || 0 })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Botões */}
              <div className="flex justify-end gap-2 mt-6 pt-4 border-t">
                <button
                  type="button"
                  onClick={() => {
                    setIsModalOpen(false)
                    setEditing(null)
                    setFormErrors({})
                  }}
                  className="px-6 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleSave}
                  className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                >
                  {editing ? 'Atualizar' : 'Salvar'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Importação */}
      {isImportModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full">
            <div className="p-6">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-bold text-gray-900">Importar Acompanhamentos</h2>
                <button
                  onClick={() => setIsImportModalOpen(false)}
                  className="text-gray-400 hover:text-gray-600 text-2xl"
                >
                  ✕
                </button>
              </div>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Selecione o arquivo Excel (.xlsx)
                  </label>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".xlsx"
                    onChange={handleFileSelect}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={downloadModel}
                    className="flex-1 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
                  >
                    Baixar Modelo
                  </button>
                  <button
                    onClick={() => setIsImportModalOpen(false)}
                    className="flex-1 px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors"
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Link Compartilhável */}
      {isShareModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full">
            <div className="p-6">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-2xl font-bold text-gray-900">Link Compartilhável</h2>
                <button
                  onClick={() => {
                    setIsShareModalOpen(false)
                    setShareLink('')
                    setLinkCopied(false)
                  }}
                  className="text-gray-400 hover:text-gray-600 text-2xl"
                >
                  ✕
                </button>
              </div>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Link para visualização pública (somente leitura)
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={shareLink}
                      readOnly
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-lg bg-gray-50"
                    />
                    <button
                      onClick={copyToClipboard}
                      className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                    >
                      {linkCopied ? (
                        <>
                          <Check className="h-4 w-4" />
                          Copiado!
                        </>
                      ) : (
                        <>
                          <Copy className="h-4 w-4" />
                          Copiar
                        </>
                      )}
                    </button>
                  </div>
                </div>
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <p className="text-sm text-blue-800">
                    <strong>Nota:</strong> Este link permite visualizar todos os acompanhamentos em modo somente leitura, sem necessidade de login. 
                    Compartilhe este link com quem precisa visualizar os dados.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

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
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                  </svg>
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

export default Acompanhamentos

