import React, { useState, useEffect, useMemo } from 'react'
import { Map as MapIcon, ExternalLink, Download, FileText, ClipboardCheck, Loader2, Archive, X, Phone, Mail } from 'lucide-react'
import ChartModal from './modals/ChartModal'
import JSZip from 'jszip'
import { saveAs } from 'file-saver'
export interface MatriculaItem {
  id: string
  numero: string
  url?: string
}

interface ItrItem {
  id: string
  numero: string
  url?: string
  declaracaoUrl?: string
  reciboUrl?: string
}

export interface CcirItem {
  id: string
  numero: string
  url?: string
}

interface Acompanhamento {
  id: string
  codImovel: number
  imovel: string
  municipio: string
  mapaUrl?: string
  matriculas: string
  matriculasDados?: MatriculaItem[]
  nIncraCcir: string
  car: string
  carUrl?: string
  statusCar: string
  itr: string
  itrDados?: ItrItem[]
  ccirDados?: CcirItem[]
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

const normalizeAcompanhamento = (raw: any): Acompanhamento => {
  let matriculas_dados: MatriculaItem[] = []
  if (raw?.matriculasDados || raw?.matriculas_dados) {
    try {
      if (typeof (raw?.matriculasDados || raw?.matriculas_dados) === 'string') {
        matriculas_dados = JSON.parse(raw?.matriculasDados || raw?.matriculas_dados)
      } else {
        matriculas_dados = raw?.matriculasDados || raw?.matriculas_dados
      }
    } catch(e) { console.error('Error parsing matriculas_dados', e) }
  } else if (raw?.matriculas && typeof raw?.matriculas === 'string') {
    // legacy string support
    matriculas_dados = raw.matriculas.split(',').map((m: string) => ({
      id: Date.now().toString(36) + Math.random().toString(36).substr(2),
      numero: m.trim(),
      url: ''
    })).filter((m: MatriculaItem) => m.numero.length > 0)
  }

  let itr_dados: ItrItem[] = []
  if (raw?.itrDados || raw?.itr_dados) {
    try {
      if (typeof (raw?.itrDados || raw?.itr_dados) === 'string') {
        itr_dados = JSON.parse(raw?.itrDados || raw?.itr_dados)
      } else {
        itr_dados = raw?.itrDados || raw?.itr_dados
      }
    } catch(e) { console.error('Error parsing itr_dados', e) }
  } else if (raw?.itr && typeof raw?.itr === 'string') {
    // legacy string support
    itr_dados = raw.itr.split(',').map((m: string) => ({
      id: Date.now().toString(36) + Math.random().toString(36).substr(2),
      numero: m.trim(),
      url: '',
      declaracaoUrl: '',
      reciboUrl: ''
    })).filter((m: ItrItem) => m.numero.length > 0)
  }

  // Fallback for ITR documents: map existing 'url' to 'declaracaoUrl' if empty
  itr_dados = itr_dados.map(item => ({
    ...item,
    declaracaoUrl: item.declaracaoUrl || item.url || ''
  }))

  let ccir_dados: CcirItem[] = []
  if (raw?.ccirDados || raw?.ccir_dados) {
    try {
      if (typeof (raw?.ccirDados || raw?.ccir_dados) === 'string') {
        ccir_dados = JSON.parse(raw?.ccirDados || raw?.ccir_dados)
      } else {
        ccir_dados = raw?.ccirDados || raw?.ccir_dados
      }
    } catch(e) { console.error('Error parsing ccir_dados', e) }
  } else if ((raw?.nIncraCcir || raw?.n_incra_ccir) && typeof (raw?.nIncraCcir || raw?.n_incra_ccir) === 'string') {
    // legacy string support
    const legacyVal = raw?.nIncraCcir || raw?.n_incra_ccir
    ccir_dados = legacyVal.split(',').map((m: string) => ({
      id: Date.now().toString(36) + Math.random().toString(36).substr(2),
      numero: m.trim(),
      url: ''
    })).filter((m: any) => m.numero.length > 0)
  }

  return {
    id: String(raw?.id ?? ''),
    codImovel: Number(raw?.codImovel ?? raw?.cod_imovel ?? 0),
    imovel: raw?.imovel ?? raw?.endereco ?? '',
    municipio: raw?.municipio ?? '',
    mapaUrl: raw?.mapaUrl ?? raw?.mapa_url ?? '',
    matriculas: raw?.matriculas ?? '',
    matriculasDados: matriculas_dados,
    nIncraCcir: raw?.nIncraCcir ?? raw?.n_incra_ccir ?? '',
    ccirDados: ccir_dados,
    car: raw?.car ?? '',
    carUrl: raw?.carUrl ?? raw?.car_url ?? '',
  statusCar: raw?.statusCar ?? raw?.status_car ?? '',
  itr: raw?.itr ?? '',
  itrDados: itr_dados,
  geoCertificacao: (raw?.geoCertificacao ?? raw?.geo_certificacao) === 'SIM' ? 'SIM' : 'NÃO',
  geoRegistro: (raw?.geoRegistro ?? raw?.geo_registro) === 'SIM' ? 'SIM' : 'NÃO',
  areaTotal: Number(raw?.areaTotal ?? raw?.area_total ?? 0),
  reservaLegal: Number(raw?.reservaLegal ?? raw?.reserva_legal ?? 0),
  cultura1: raw?.cultura1 ?? '',
  areaCultura1: Number(raw?.areaCultura1 ?? raw?.area_cultura1 ?? 0),
  cultura2: raw?.cultura2 ?? '',
  areaCultura2: Number(raw?.areaCultura2 ?? raw?.area_cultura2 ?? 0),
  outros: raw?.outros ?? '',
  areaOutros: Number(raw?.areaOutros ?? raw?.area_outros ?? 0),
  appCodigoFlorestal: Number(raw?.appCodigoFlorestal ?? raw?.app_codigo_florestal ?? 0),
  appVegetada: Number(raw?.appVegetada ?? raw?.app_vegetada ?? 0),
  appNaoVegetada: Number(raw?.appNaoVegetada ?? raw?.app_nao_vegetada ?? 0),
  remanescenteFlorestal: Number(raw?.remanescenteFlorestal ?? raw?.remanescente_florestal ?? 0)
}
}

const normalizeAcompanhamentos = (rows: any[]): Acompanhamento[] =>
  Array.isArray(rows) ? rows.map(normalizeAcompanhamento) : []

const formatCodImovel = (value: number): string => String(Number(value || 0)).padStart(3, '0')

const getSafeImovelName = (name: string): string => {
  if (!name) return 'Sem_Nome'
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Remove acentos
    .replace(/[^a-z0-9]/gi, '_') // Remove caracteres especiais
    .replace(/_+/g, '_') // Remove underscores duplicados
    .trim()
}

type SortField =
  | 'codImovel'
  | 'imovel'
  | 'municipio'
  | 'nIncraCcir'
  | 'car'
  | 'statusCar'
  | 'itr'
  | 'geoCertificacao'
  | 'geoRegistro'
  | 'areaTotal'
  | 'reservaLegal'
  | 'saldoReservaLegal'
  | 'cultura1'
  | 'areaCultura1'
  | 'cultura2'
  | 'areaCultura2'
  | 'outros'
  | 'areaOutros'
  | 'appCodigoFlorestal'
  | 'appVegetada'
  | 'appNaoVegetada'
  | 'remanescenteFlorestal'

type SortDirection = 'asc' | 'desc'

const AcompanhamentosView: React.FC<{ token: string }> = ({ token }) => {
  const [acompanhamentos, setAcompanhamentos] = useState<Acompanhamento[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string>('')
  const [shareLinkName, setShareLinkName] = useState<string | null>(null)
  const [requiresPassword, setRequiresPassword] = useState(false)
  const [password, setPassword] = useState<string>('')
  const [passwordError, setPasswordError] = useState<string>('')
  const [selectedMapUrl, setSelectedMapUrl] = useState<string>('')
  const [selectedImovel, setSelectedImovel] = useState<string>('')
  const [isMapModalOpen, setIsMapModalOpen] = useState(false)
  const [chartModalOpen, setChartModalOpen] = useState(false)
  const [chartData, setChartData] = useState<Array<{name: string; value: number; color: string}>>([])
  const [chartTitle, setChartTitle] = useState('')
  const [chartSubtitle, setChartSubtitle] = useState('')
  const [chartTotal, setChartTotal] = useState(0)
  const [itrDownloadModal, setItrDownloadModal] = useState<{ item: ItrItem; imovel: string } | null>(null)
  const [isDownloadingSingleZip, setIsDownloadingSingleZip] = useState<string | null>(null)
  const [chartValueUnit, setChartValueUnit] = useState('ha')
  const [chartValueFormat, setChartValueFormat] = useState<'area' | 'number'>('area')
  const [sortField, setSortField] = useState<SortField>('codImovel')
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc')
  const [isDownloadingZip, setIsDownloadingZip] = useState<string | null>(null)
  const [isDownloadingRecordZip, setIsDownloadingRecordZip] = useState<string | null>(null)

  useEffect(() => {
    const loadAcompanhamentos = async () => {
      try {
        // Tentar carregar sem senha primeiro
        const response = await fetch(`${API_BASE_URL}/acompanhamentos/public/${token}`)
        const result = await response.json()
        
        if (result.success) {
          setAcompanhamentos(normalizeAcompanhamentos(result.data))
          setShareLinkName(result.shareLinkName)
          setRequiresPassword(false)
        } else {
          // Verificar se requer senha
          if (result.requiresPassword || response.status === 403) {
            setRequiresPassword(true)
            setLoading(false)
            return
          }
          
          // Verificar se é erro de expiração (status 410)
          if (response.status === 410) {
            setError('Este link compartilhável expirou e não está mais disponível.')
          } else {
            setError(result.error || 'Erro ao carregar dados')
          }
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

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setPasswordError('')
    
    if (!password.trim()) {
      setPasswordError('Por favor, informe a senha')
      return
    }

    try {
      const response = await fetch(`${API_BASE_URL}/acompanhamentos/public/${token}?password=${encodeURIComponent(password)}`)
      const result = await response.json()
      
      if (result.success) {
        setAcompanhamentos(normalizeAcompanhamentos(result.data))
        setShareLinkName(result.shareLinkName)
        setRequiresPassword(false)
        setPassword('')
      } else {
        if (response.status === 401) {
          setPasswordError('Senha incorreta. Tente novamente.')
        } else {
          setPasswordError(result.error || 'Erro ao validar senha')
        }
      }
    } catch (error) {
      console.error('Erro ao validar senha:', error)
      setPasswordError('Erro ao validar senha. Tente novamente.')
    }
  }

  const handleDownloadAllZipped = async (acompanhamentoId: string, matriculasDados: MatriculaItem[], imovelName: string) => {
    const matriculasComUrl = (matriculasDados || []).filter(m => m.url)
    if (matriculasComUrl.length === 0) return

    setIsDownloadingZip(acompanhamentoId)
    try {
      const zip = new JSZip()
      
      const downloadPromises = matriculasComUrl.map(async (mat) => {
        try {
          const response = await fetch(mat.url!)
          const blob = await response.blob()
          const safeName = mat.numero.replace(/[^a-z0-9]/gi, '_').toLowerCase()
          zip.file(`Matricula_${safeName}.pdf`, blob)
        } catch (e) {
          console.error(`Erro ao baixar a matrícula ${mat.numero}:`, e)
        }
      })

      await Promise.all(downloadPromises)
      
      const content = await zip.generateAsync({ type: 'blob' })
      const safeImovel = getSafeImovelName(imovelName)
      saveAs(content, `Matriculas_${safeImovel}.zip`)
    } catch (error) {
      console.error('Erro geral ao zipar arquivos:', error)
      alert('Erro ao tentar compactar as matrículas.')
    } finally {
      setIsDownloadingZip(null)
    }
  }

  const handleDownloadAllItrZipped = async (acompanhamentoId: string, itrDados: ItrItem[], imovelName: string) => {
    const itrsComDocumentos = (itrDados || []).filter(m => m.declaracaoUrl || m.reciboUrl || m.url)
    if (itrsComDocumentos.length === 0) return

    setIsDownloadingZip(acompanhamentoId + 'itr')
    try {
      const zip = new JSZip()
      const downloadPromises: Promise<void>[] = []
      
      itrsComDocumentos.forEach((item) => {
        const safeNumero = item.numero.replace(/[^a-z0-9]/gi, '_').toLowerCase()
        const declUrl = item.declaracaoUrl || item.url
        if (declUrl) {
          downloadPromises.push((async () => {
            try {
              const res = await fetch(declUrl)
              const blob = await res.blob()
              zip.file(`Itr_${safeNumero}_Declaracao.pdf`, blob)
            } catch (e) { console.error(`Erro ITR:`, e) }
          })())
        }
        if (item.reciboUrl) {
          downloadPromises.push((async () => {
            try {
              const res = await fetch(item.reciboUrl!)
              const blob = await res.blob()
              zip.file(`Itr_${safeNumero}_Recibo.pdf`, blob)
            } catch (e) { console.error(`Erro ITR:`, e) }
          })())
        }
      })

      await Promise.all(downloadPromises)
      const content = await zip.generateAsync({ type: 'blob' })
      const safeImovel = getSafeImovelName(imovelName)
      saveAs(content, `ITRs_${safeImovel}.zip`)
    } catch (error) {
      console.error('Erro geral ao zipar ITRs:', error)
      alert('Erro ao tentar compactar os ITRs.')
    } finally {
      setIsDownloadingZip(null)
    }
  }

  const handleDownloadSingleItrZipped = async (item: ItrItem, imovelName: string) => {
    if (!item.declaracaoUrl && !item.reciboUrl && !item.url) return

    setIsDownloadingSingleZip(item.id)
    try {
      const zip = new JSZip()
      const downloadPromises: Promise<void>[] = []
      const safeNumero = item.numero.replace(/[^a-z0-9]/gi, '_').toLowerCase()
      
      const declUrl = item.declaracaoUrl || item.url
      if (declUrl) {
        downloadPromises.push((async () => {
          try {
            const res = await fetch(declUrl)
            const blob = await res.blob()
            zip.file(`Itr_${safeNumero}_Declaracao.pdf`, blob)
          } catch (e) { console.error(`Erro:`, e) }
        })())
      }
      
      if (item.reciboUrl) {
        downloadPromises.push((async () => {
          try {
            const res = await fetch(item.reciboUrl!)
            const blob = await res.blob()
            zip.file(`Itr_${safeNumero}_Recibo.pdf`, blob)
          } catch (e) { console.error(`Erro:`, e) }
        })())
      }

      await Promise.all(downloadPromises)
      const content = await zip.generateAsync({ type: 'blob' })
      const safeImovel = getSafeImovelName(imovelName)
      saveAs(content, `ITR_${item.numero}_${safeImovel}.zip`)
    } catch (error) {
      console.error('Erro ao zipar ITR:', error)
      alert('Erro ao tentar compactar os documentos.')
    } finally {
      setIsDownloadingSingleZip(null)
    }
  }

  const handleDownloadAllCcirZipped = async (acompanhamentoId: string, ccirDados: CcirItem[], imovelName: string) => {
    const ccirsComUrl = (ccirDados || []).filter(m => m.url)
    if (ccirsComUrl.length === 0) return

    setIsDownloadingZip(acompanhamentoId)
    try {
      const zip = new JSZip()
      
      const downloadPromises = ccirsComUrl.map(async (mat) => {
        try {
          const response = await fetch(mat.url!)
          const blob = await response.blob()
          const safeName = mat.numero.replace(/[^a-z0-9]/gi, '_').toLowerCase()
          zip.file(`Ccir_${safeName}.pdf`, blob)
        } catch (e) {
          console.error(`Erro ao baixar o CCIR ${mat.numero}:`, e)
        }
      })

      await Promise.all(downloadPromises)
      
      const content = await zip.generateAsync({ type: 'blob' })
      const safeImovel = getSafeImovelName(imovelName)
      saveAs(content, `CCIRs_${safeImovel}.zip`)
    } catch (error) {
      console.error('Erro geral ao zipar arquivos CCIR:', error)
      alert('Erro ao tentar compactar os CCIRs.')
    } finally {
      setIsDownloadingZip(null)
    }
  }





  const handleDownloadRegistroZip = async (acomp: Acompanhamento) => {
    const matriculasComUrl = (acomp.matriculasDados || []).filter(m => m.url)
    const itrsComDados = (acomp.itrDados || []).filter(m => m.declaracaoUrl || m.reciboUrl || m.url)
    const ccirComUrl = (acomp.ccirDados || []).filter(m => m.url)
    const hasCarUrl = !!acomp.carUrl

    if (!hasCarUrl && matriculasComUrl.length === 0 && itrsComDados.length === 0 && ccirComUrl.length === 0) {
      alert('Nenhum documento disponível para download neste registro.')
      return
    }

    setIsDownloadingRecordZip(acomp.id)
    try {
      const zip = new JSZip()
      const promises: Promise<void>[] = []

      if (hasCarUrl) {
        promises.push((async () => {
          try {
            const response = await fetch(acomp.carUrl!)
            const blob = await response.blob()
            const safeName = (acomp.car || 'CAR').replace(/[^a-z0-9]/gi, '_').toLowerCase()
            zip.folder('CAR')?.file(`CAR_${safeName}.pdf`, blob)
          } catch (e) {
            console.error(`Erro ao baixar o CAR ${acomp.car}:`, e)
          }
        })())
      }

      if (matriculasComUrl.length > 0) {
        const matriculasPromises = matriculasComUrl.map(async (mat) => {
          try {
            const response = await fetch(mat.url!)
            const blob = await response.blob()
            const safeName = mat.numero.replace(/[^a-z0-9]/gi, '_').toLowerCase()
            zip.folder('Matriculas')?.file(`Matricula_${safeName}.pdf`, blob)
          } catch (e) {
            console.error(`Erro ao baixar a matrícula ${mat.numero}:`, e)
          }
        })
        promises.push(...matriculasPromises)
      }

      if (itrsComDados.length > 0) {
        const itrPromises = itrsComDados.flatMap((item) => {
          const itemPromises: Promise<void>[] = []
          const safeName = item.numero.replace(/[^a-z0-9]/gi, '_').toLowerCase()
          
          const declUrl = item.declaracaoUrl || item.url
          if (declUrl) {
            itemPromises.push((async () => {
              try {
                const res = await fetch(declUrl)
                const blob = await res.blob()
                zip.folder('Itr')?.file(`Itr_${safeName}_Declaracao.pdf`, blob)
              } catch (e) { console.error(`Erro ao baixar declaração ${item.numero}:`, e) }
            })())
          }

          if (item.reciboUrl) {
            itemPromises.push((async () => {
              try {
                const res = await fetch(item.reciboUrl!)
                const blob = await res.blob()
                zip.folder('Itr')?.file(`Itr_${safeName}_Recibo.pdf`, blob)
              } catch (e) { console.error(`Erro ao baixar recibo ${item.numero}:`, e) }
            })())
          }
          
          return itemPromises
        })
        promises.push(...itrPromises)
      }

      await Promise.all(promises)
      
      const content = await zip.generateAsync({ type: 'blob' })
      const safeImovel = getSafeImovelName(acomp.imovel)
      saveAs(content, `Documentos_${safeImovel}.zip`)
    } catch (error) {
      console.error('Erro geral ao zipar registro:', error)
      alert('Erro ao tentar compactar os documentos. Entre em contato com o suporte ou baixe manualmente.')
    } finally {
      setIsDownloadingRecordZip(null)
    }
  }

  const formatNumber = (num: number) => {
    return num.toFixed(2).replace('.', ',')
  }

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')
      return
    }
    setSortField(field)
    setSortDirection('asc')
  }

  const getSortIndicator = (field: SortField) => {
    if (sortField !== field) return '↕'
    return sortDirection === 'asc' ? '▲' : '▼'
  }

  const getSortValue = (acomp: Acompanhamento, field: SortField): string | number => {
    if (field === 'saldoReservaLegal') {
      return (acomp.reservaLegal || 0) - ((acomp.areaTotal || 0) * 0.2)
    }
    return acomp[field]
  }

  const sortedAcompanhamentos = useMemo(() => {
    const rows = [...acompanhamentos]
    const direction = sortDirection === 'asc' ? 1 : -1

    rows.sort((a, b) => {
      const aValue = getSortValue(a, sortField)
      const bValue = getSortValue(b, sortField)

      if (typeof aValue === 'number' && typeof bValue === 'number') {
        return (aValue - bValue) * direction
      }

      return String(aValue ?? '')
        .localeCompare(String(bValue ?? ''), 'pt-BR', { sensitivity: 'base' }) * direction
    })

    return rows
  }, [acompanhamentos, sortField, sortDirection])

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
  const openChart = (
    title: string,
    subtitle: string,
    data: Array<{name: string; value: number; color: string}>,
    options?: { valueUnit?: string; valueFormat?: 'area' | 'number' }
  ) => {
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
    setChartValueUnit(options?.valueUnit ?? 'ha')
    setChartValueFormat(options?.valueFormat ?? 'area')
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

  const getReservaLegalData = () => {
    const data = acompanhamentos
      .map(acomp => ({
        imovel: acomp.imovel,
        area: acomp.reservaLegal || 0
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
    const isAnyModalOpen = isMapModalOpen || !!itrDownloadModal || chartModalOpen
    
    if (isAnyModalOpen) {
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
      document.body.style.overflow = ''
      document.body.style.position = ''
      document.body.style.top = ''
      document.body.style.width = ''
    }
  }, [isMapModalOpen, itrDownloadModal, chartModalOpen])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return

      if (itrDownloadModal) {
        setItrDownloadModal(null)
        return
      }

      if (isMapModalOpen) {
        setIsMapModalOpen(false)
        setSelectedMapUrl('')
        setSelectedImovel('')
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [isMapModalOpen, itrDownloadModal])

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

  if (requiresPassword) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
        <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-8">
          <div className="text-center mb-6">
            <div className="mx-auto w-16 h-16 bg-purple-100 rounded-full flex items-center justify-center mb-4">
              <svg className="w-8 h-8 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
            </div>
            <h1 className="text-2xl font-bold text-gray-900 mb-2">Acesso Protegido</h1>
            <p className="text-gray-600">Este link compartilhável está protegido por senha</p>
          </div>
          
          <form onSubmit={handlePasswordSubmit} className="space-y-4">
            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-2">
                Senha
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value)
                  setPasswordError('')
                }}
                className={`w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent ${
                  passwordError ? 'border-red-500 bg-red-50' : 'border-gray-300'
                }`}
                placeholder="Digite a senha"
                autoFocus
              />
              {passwordError && (
                <p className="mt-2 text-sm text-red-600">{passwordError}</p>
              )}
            </div>
            
            <button
              type="submit"
              className="w-full px-4 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors font-semibold"
            >
              Acessar
            </button>
          </form>
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
          <p className="text-sm text-gray-500 mt-4">
            {error.includes('expirou') 
              ? 'Entre em contato com o administrador para obter um novo link.' 
              : 'O link pode estar inválido ou expirado.'}
          </p>
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
              <div>
                <h1 className="text-xl font-bold text-white leading-tight">IMPGEO</h1>
              </div>
            </div>
          </div>
        </div>
      </div>

      <main className="max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8 space-y-6">
        {/* Mensagem de Boas-vindas */}
        <div className="bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-lg shadow-md p-6">
          <h2 className="text-2xl font-bold">
            Bem-vindo(a) {shareLinkName ? shareLinkName : 'Visitante'}
          </h2>
          <p className="text-blue-100 mt-2">Visualização somente leitura dos acompanhamentos de imóveis</p>
        </div>

        {/* Estatísticas */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div 
            className="bg-white rounded-lg shadow-md p-4 cursor-pointer hover:shadow-lg transition-shadow"
            onClick={() => openChart('Distribuição de Imóveis', 'Total de imóveis por município', getTotalImoveisData(), { valueFormat: 'number', valueUnit: '' })}
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
            onClick={() => openChart('Geo Certificação', 'Distribuição de imóveis com e sem geo certificação', getGeoCertificacaoData(), { valueFormat: 'number', valueUnit: '' })}
          >
            <p className="text-sm text-gray-600">Com Geo Certificação</p>
            <p className="text-2xl font-bold text-green-600">
              {acompanhamentos.filter(a => a.geoCertificacao === 'SIM').length}
            </p>
          </div>
          <div 
            className="bg-white rounded-lg shadow-md p-4 cursor-pointer hover:shadow-lg transition-shadow"
            onClick={() => openChart('Geo Registro', 'Distribuição de imóveis com e sem geo registro', getGeoRegistroData(), { valueFormat: 'number', valueUnit: '' })}
          >
            <p className="text-sm text-gray-600">Com Geo Registro</p>
            <p className="text-2xl font-bold text-green-600">
              {acompanhamentos.filter(a => a.geoRegistro === 'SIM').length}
            </p>
          </div>
        </div>

        {/* Estatísticas de Área por Tipo de Cultura */}
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4">
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
        </div>

        {/* Estatísticas de APP, Reserva Legal e Remanescente Florestal */}
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4">
          <div 
            className="bg-white rounded-lg shadow-md p-4 cursor-pointer hover:shadow-lg transition-shadow"
            onClick={() => openChart('Área Antropizada', 'Distribuição de área por imóvel (ha)', getCulturaData('Área Antropizada'))}
          >
            <p className="text-sm text-gray-600">Área Antropizada</p>
            <p className="text-2xl font-bold text-gray-900">
              {formatNumber(getAreaByCulturaType('Área Antropizada'))} ha
            </p>
          </div>
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
            onClick={() => openChart('20% Reserva Legal', 'Distribuição de área por imóvel (ha)', getReservaLegalData())}
          >
            <p className="text-sm text-gray-600">20% Reserva Legal</p>
            <p className="text-2xl font-bold text-gray-900">
              {formatNumber(acompanhamentos.reduce((sum, a) => sum + (a.reservaLegal || 0), 0))} ha
            </p>
          </div>
          <div 
            className="bg-white rounded-lg shadow-md p-4 cursor-pointer hover:shadow-lg transition-shadow"
            onClick={() => openChart('Remanescente Florestal', 'Distribuição de área por imóvel (ha)', getAPPData('remanescenteFlorestal'))}
          >
            <p className="text-sm text-gray-600">Remanescente Florestal (saldo)</p>
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
                  <th className="px-3 py-3 text-left text-xs font-bold uppercase tracking-wider sticky left-0 z-20 bg-blue-900" style={{ width: '100px', minWidth: '100px' }}>
                    <button type="button" onClick={() => handleSort('codImovel')} className="inline-flex items-center gap-1 hover:text-blue-200">
                      COD. IMP <span>{getSortIndicator('codImovel')}</span>
                    </button>
                  </th>
                  <th className="px-3 py-3 text-left text-xs font-bold uppercase tracking-wider sticky left-[100px] z-20 bg-blue-900" style={{ width: '250px', minWidth: '250px' }}>
                    <button type="button" onClick={() => handleSort('imovel')} className="inline-flex items-center gap-1 hover:text-blue-200">
                      IMÓVEL <span>{getSortIndicator('imovel')}</span>
                    </button>
                  </th>
                  <th className="px-3 py-3 text-left text-xs font-bold uppercase tracking-wider sticky left-[350px] z-20 bg-blue-900" style={{ width: '150px', minWidth: '150px' }}>
                    <button type="button" onClick={() => handleSort('municipio')} className="inline-flex items-center gap-1 hover:text-blue-200">
                      MUNICÍPIO <span>{getSortIndicator('municipio')}</span>
                    </button>
                  </th>
                  <th className="px-3 py-3 text-left text-xs font-bold uppercase tracking-wider" style={{ minWidth: '350px' }}>MATRÍCULAS</th>
                  <th className="px-3 py-3 text-left text-xs font-bold uppercase tracking-wider">
                    <button type="button" onClick={() => handleSort('nIncraCcir')} className="inline-flex items-center gap-1 hover:text-blue-200">
                      N INCRA / CCIR <span>{getSortIndicator('nIncraCcir')}</span>
                    </button>
                  </th>
                  <th className="px-3 py-3 text-left text-xs font-bold uppercase tracking-wider">
                    <button type="button" onClick={() => handleSort('car')} className="inline-flex items-center gap-1 hover:text-blue-200">
                      CAR <span>{getSortIndicator('car')}</span>
                    </button>
                  </th>
                  <th className="px-3 py-3 text-left text-xs font-bold uppercase tracking-wider">
                    <button type="button" onClick={() => handleSort('statusCar')} className="inline-flex items-center gap-1 hover:text-blue-200">
                      STATUS CAR <span>{getSortIndicator('statusCar')}</span>
                    </button>
                  </th>
                  <th className="px-3 py-3 text-left text-xs font-bold uppercase tracking-wider">
                    <button type="button" onClick={() => handleSort('itr')} className="inline-flex items-center gap-1 hover:text-blue-200">
                      ITR <span>{getSortIndicator('itr')}</span>
                    </button>
                  </th>
                  <th className="px-3 py-3 text-left text-xs font-bold uppercase tracking-wider">
                    <button type="button" onClick={() => handleSort('geoCertificacao')} className="inline-flex items-center gap-1 hover:text-blue-200">
                      GEO CERTIFICAÇÃO <span>{getSortIndicator('geoCertificacao')}</span>
                    </button>
                  </th>
                  <th className="px-3 py-3 text-left text-xs font-bold uppercase tracking-wider">
                    <button type="button" onClick={() => handleSort('geoRegistro')} className="inline-flex items-center gap-1 hover:text-blue-200">
                      GEO REGISTRO <span>{getSortIndicator('geoRegistro')}</span>
                    </button>
                  </th>
                  <th className="px-3 py-3 text-left text-xs font-bold uppercase tracking-wider">
                    <button type="button" onClick={() => handleSort('areaTotal')} className="inline-flex items-center gap-1 hover:text-blue-200">
                      ÁREA TOTAL (ha) <span>{getSortIndicator('areaTotal')}</span>
                    </button>
                  </th>
                  <th className="px-3 py-3 text-left text-xs font-bold uppercase tracking-wider">
                    <button type="button" onClick={() => handleSort('reservaLegal')} className="inline-flex items-center gap-1 hover:text-blue-200">
                      20% RESERVA LEGAL (ha) <span>{getSortIndicator('reservaLegal')}</span>
                    </button>
                  </th>
                  <th className="px-3 py-3 text-left text-xs font-bold uppercase tracking-wider">
                    <button type="button" onClick={() => handleSort('saldoReservaLegal')} className="inline-flex items-center gap-1 hover:text-blue-200">
                      SALDO RESERVA LEGAL (ha) <span>{getSortIndicator('saldoReservaLegal')}</span>
                    </button>
                  </th>
                  <th className="px-3 py-3 text-left text-xs font-bold uppercase tracking-wider">
                    <button type="button" onClick={() => handleSort('cultura1')} className="inline-flex items-center gap-1 hover:text-blue-200">
                      CULTURAS <span>{getSortIndicator('cultura1')}</span>
                    </button>
                  </th>
                  <th className="px-3 py-3 text-left text-xs font-bold uppercase tracking-wider">
                    <button type="button" onClick={() => handleSort('areaCultura1')} className="inline-flex items-center gap-1 hover:text-blue-200">
                      ÁREA (ha) <span>{getSortIndicator('areaCultura1')}</span>
                    </button>
                  </th>
                  <th className="px-3 py-3 text-left text-xs font-bold uppercase tracking-wider">
                    <button type="button" onClick={() => handleSort('cultura2')} className="inline-flex items-center gap-1 hover:text-blue-200">
                      CULTURAS <span>{getSortIndicator('cultura2')}</span>
                    </button>
                  </th>
                  <th className="px-3 py-3 text-left text-xs font-bold uppercase tracking-wider">
                    <button type="button" onClick={() => handleSort('areaCultura2')} className="inline-flex items-center gap-1 hover:text-blue-200">
                      ÁREA (ha) <span>{getSortIndicator('areaCultura2')}</span>
                    </button>
                  </th>
                  <th className="px-3 py-3 text-left text-xs font-bold uppercase tracking-wider">
                    <button type="button" onClick={() => handleSort('outros')} className="inline-flex items-center gap-1 hover:text-blue-200">
                      OUTROS <span>{getSortIndicator('outros')}</span>
                    </button>
                  </th>
                  <th className="px-3 py-3 text-left text-xs font-bold uppercase tracking-wider">
                    <button type="button" onClick={() => handleSort('areaOutros')} className="inline-flex items-center gap-1 hover:text-blue-200">
                      ÁREA (ha) <span>{getSortIndicator('areaOutros')}</span>
                    </button>
                  </th>
                  <th className="px-3 py-3 text-left text-xs font-bold uppercase tracking-wider">
                    <button type="button" onClick={() => handleSort('appCodigoFlorestal')} className="inline-flex items-center gap-1 hover:text-blue-200">
                      APP (CÓDIGO FLORESTAL) <span>{getSortIndicator('appCodigoFlorestal')}</span>
                    </button>
                  </th>
                  <th className="px-3 py-3 text-left text-xs font-bold uppercase tracking-wider">
                    <button type="button" onClick={() => handleSort('appVegetada')} className="inline-flex items-center gap-1 hover:text-blue-200">
                      APP (VEGETADA) <span>{getSortIndicator('appVegetada')}</span>
                    </button>
                  </th>
                  <th className="px-3 py-3 text-left text-xs font-bold uppercase tracking-wider">
                    <button type="button" onClick={() => handleSort('appNaoVegetada')} className="inline-flex items-center gap-1 hover:text-blue-200">
                      APP (NÃO VEGETADA) <span>{getSortIndicator('appNaoVegetada')}</span>
                    </button>
                  </th>
                  <th className="px-3 py-3 text-left text-xs font-bold uppercase tracking-wider">
                    <button type="button" onClick={() => handleSort('remanescenteFlorestal')} className="inline-flex items-center gap-1 hover:text-blue-200">
                      REMANESCENTE FLORESTAL (ha) <span>{getSortIndicator('remanescenteFlorestal')}</span>
                    </button>
                  </th>
                  <th className="px-3 py-3 text-center text-xs font-bold uppercase tracking-wider sticky right-0 z-20 bg-blue-900 shadow-[-1px_0_0_rgba(229,231,235,1)]">
                    AÇÕES
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {sortedAcompanhamentos.map((acomp, index) => (
                  <tr
                    key={acomp.id}
                    className={index % 2 === 0 ? 'bg-white hover:bg-gray-50' : 'bg-blue-50 hover:bg-blue-100'}
                  >
                    <td className={`px-3 py-2 whitespace-nowrap font-semibold sticky left-0 z-10 ${index % 2 === 0 ? 'bg-white' : 'bg-blue-50'}`} style={{ width: '100px', minWidth: '100px' }}>{formatCodImovel(acomp.codImovel)}</td>
                    <td className={`px-3 py-2 whitespace-nowrap font-semibold sticky left-[100px] z-10 ${index % 2 === 0 ? 'bg-white' : 'bg-blue-50'}`} style={{ width: '250px', minWidth: '250px' }}>
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
                    <td className={`px-3 py-2 whitespace-nowrap font-semibold sticky left-[350px] z-10 ${index % 2 === 0 ? 'bg-white' : 'bg-blue-50'}`} style={{ width: '150px', minWidth: '150px' }}>{acomp.municipio}</td>
                    <td className="px-3 py-2 text-sm text-gray-700" style={{ width: '450px', minWidth: '450px' }}>
                      <div className="flex justify-between items-start gap-2">
                        <div className="flex flex-wrap gap-1 w-full">
                          {acomp.matriculasDados && acomp.matriculasDados.length > 0 ? (
                            acomp.matriculasDados.map((mat, i) => (
                               <React.Fragment key={mat.id}>
                                 {mat.url ? (
                                    <a 
                                      href={mat.url} 
                                      target="_blank" 
                                      rel="noopener noreferrer"
                                      className="text-blue-600 hover:text-blue-800 hover:underline font-medium inline-flex items-center gap-1 whitespace-nowrap"
                                      title={`Baixar documento matrícula: ${mat.numero}`}
                                    >
                                      {mat.numero}
                                    </a>
                                 ) : (
                                    <span className="whitespace-nowrap">{mat.numero}</span>
                                 )}
                                 {i < acomp.matriculasDados!.length - 1 && <span className="text-gray-400">,</span>}
                               </React.Fragment>
                            ))
                          ) : (
                            <span className="whitespace-nowrap">{acomp.matriculas}</span>
                          )}
                        </div>
                        
                        {(() => {
                          const hasPdfs = (acomp.matriculasDados || []).some(m => m.url);
                          return (
                            <button
                              type="button"
                              disabled={!hasPdfs || isDownloadingZip === acomp.id}
                              title={hasPdfs ? "Baixar todos os PDFs de matrícula (em ZIP)" : "Nenhum PDF disponível"}
                              onClick={(e) => {
                                e.preventDefault()
                                e.stopPropagation()
                                handleDownloadAllZipped(acomp.id, acomp.matriculasDados || [], acomp.imovel)
                              }}
                              className={`p-1 rounded-full flex-shrink-0 transition-colors ${
                                hasPdfs 
                                  ? (isDownloadingZip === acomp.id ? 'text-blue-400 bg-blue-50 cursor-wait' : 'text-blue-600 hover:bg-blue-100 hover:text-blue-800') 
                                  : 'text-gray-300 cursor-not-allowed'
                              }`}
                            >
                              {isDownloadingZip === acomp.id ? (
                                <Loader2 className="w-4 h-4 animate-spin text-blue-500" />
                              ) : (
                                <Download className={`w-4 h-4 ${!hasPdfs ? 'opacity-50' : ''}`} />
                              )}
                            </button>
                          )
                        })()}
                      </div>
                    </td>
                  <td className="px-3 py-2 text-sm text-gray-700" style={{ width: '550px', minWidth: '550px' }}>
                    <div className="flex justify-between items-start gap-2">
                      <div className="flex flex-wrap gap-1 w-full">
                        {acomp.ccirDados && acomp.ccirDados.length > 0 ? (
                          acomp.ccirDados.map((item, i) => (
                             <React.Fragment key={item.id}>
                               {item.url ? (
                                  <a 
                                    href={item.url} 
                                    target="_blank" 
                                    rel="noopener noreferrer"
                                    className="text-blue-600 hover:text-blue-800 hover:underline font-medium inline-flex items-center gap-1 whitespace-nowrap"
                                    title={`Baixar documento CCIR: ${item.numero}`}
                                  >
                                    {item.numero}
                                  </a>
                               ) : (
                                  <span className="whitespace-nowrap">{item.numero}</span>
                               )}
                               {i < acomp.ccirDados!.length - 1 && <span className="text-gray-400">,</span>}
                             </React.Fragment>
                          ))
                        ) : (
                          <span className="whitespace-nowrap">{acomp.nIncraCcir}</span>
                        )}
                      </div>
                      
                      {(() => {
                        const hasCcirPdfs = (acomp.ccirDados || []).some(m => m.url);
                        return (
                          <button
                            type="button"
                            disabled={!hasCcirPdfs || isDownloadingZip === acomp.id + 'ccir'}
                            title={hasCcirPdfs ? "Baixar todos os PDFs de CCIR (em ZIP)" : "Nenhum PDF disponível"}
                            onClick={(e) => {
                              e.preventDefault()
                              e.stopPropagation()
                              handleDownloadAllCcirZipped(acomp.id, acomp.ccirDados || [], acomp.imovel)
                            }}
                            className={`p-1 rounded-full flex-shrink-0 transition-colors ${
                              hasCcirPdfs 
                                ? (isDownloadingZip === acomp.id + 'ccir' ? 'text-blue-400 bg-blue-50 cursor-wait' : 'text-blue-600 hover:bg-blue-100 hover:text-blue-800') 
                                : 'text-gray-300 cursor-not-allowed'
                            }`}
                          >
                            {isDownloadingZip === acomp.id + 'ccir' ? (
                              <Loader2 className="w-4 h-4 animate-spin text-blue-500" />
                            ) : (
                              <Download className={`w-4 h-4 ${!hasCcirPdfs ? 'opacity-50' : ''}`} />
                            )}
                          </button>
                        )
                      })()}
                    </div>
                  </td>
                    <td className="px-3 py-2 text-sm max-w-xs truncate">
                      {acomp.car ? (
                        acomp.carUrl ? (
                          <a 
                            href={acomp.carUrl} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="text-blue-600 hover:text-blue-800 hover:underline font-medium inline-flex items-center gap-1"
                            title={`Baixar documento CAR: ${acomp.car}`}
                          >
                            {acomp.car}
                            <Download className="w-3 h-3" />
                          </a>
                        ) : (
                          <span title={acomp.car} className="text-gray-700">{acomp.car}</span>
                        )
                      ) : (
                        <span className="text-gray-400">-</span>
                      )}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap text-sm text-gray-700">{acomp.statusCar}</td>
                    <td className="px-3 py-2 text-sm text-gray-700" style={{ width: '450px', minWidth: '450px' }}>
                      <div className="flex justify-between items-start gap-2">
                         <div className="flex flex-row flex-wrap gap-x-2 gap-y-1 w-full">
                          {acomp.itrDados && acomp.itrDados.length > 0 ? (
                            acomp.itrDados.map((item, i) => (
                               <div key={item.id} className="flex items-center group">
                                 <div className="flex items-center overflow-hidden">
                                   {item.declaracaoUrl || item.reciboUrl || item.url ? (
                                     <button
                                       type="button"
                                       onClick={() => setItrDownloadModal({ item, imovel: acomp.imovel })}
                                       className="whitespace-nowrap font-medium text-blue-600 hover:text-blue-800 hover:underline text-left"
                                       title={`Opções de download para ITR ${item.numero}`}
                                     >
                                       {item.numero}
                                     </button>
                                   ) : (
                                     <span className="whitespace-nowrap font-medium text-gray-700">{item.numero}</span>
                                   )}
                                   {i < acomp.itrDados!.length - 1 && <span className="text-gray-400 ml-1">,</span>}
                                 </div>
                               </div>
                            ))
                          ) : (
                            <span className="whitespace-nowrap">{acomp.itr || '-'}</span>
                          )}
                        </div>
                        
                        {(() => {
                          const hasAnyItrPdf = (acomp.itrDados || []).some(m => m.declaracaoUrl || m.reciboUrl || m.url);
                          return (
                            <button
                              type="button"
                              disabled={!hasAnyItrPdf || isDownloadingZip === acomp.id + 'itr'}
                              title={hasAnyItrPdf ? "Baixar todos os PDFs de ITR (em ZIP)" : "Nenhum PDF disponível"}
                              onClick={(e) => {
                                e.preventDefault()
                                e.stopPropagation()
                                handleDownloadAllItrZipped(acomp.id, acomp.itrDados || [], acomp.imovel)
                              }}
                              className={`p-1 rounded-full flex-shrink-0 transition-colors ${
                                hasAnyItrPdf 
                                  ? (isDownloadingZip === acomp.id + 'itr' ? 'text-blue-400 bg-blue-50 cursor-wait' : 'text-blue-600 hover:bg-blue-100 hover:text-blue-800') 
                                  : 'text-gray-300 cursor-not-allowed'
                              }`}
                            >
                              {isDownloadingZip === acomp.id + 'itr' ? (
                                <Loader2 className="w-4 h-4 animate-spin text-blue-500" />
                              ) : (
                                <Download className={`w-4 h-4 ${!hasAnyItrPdf ? 'opacity-50' : ''}`} />
                              )}
                            </button>
                          )
                        })()}
                      </div>
                    </td>
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
                    <td
                      className="px-3 py-2 whitespace-nowrap text-sm font-semibold"
                      title="Saldo = Reserva Legal (ha) - 20% da Área Total (ha)"
                    >
                      {(() => {
                        const required = (acomp.areaTotal || 0) * 0.2
                        const saldo = (acomp.reservaLegal || 0) - required
                        const isOk = saldo >= 0
                        return (
                          <span className={isOk ? 'text-green-700' : 'text-red-600'}>
                            {isOk ? '+' : '-'}
                            {formatNumber(Math.abs(saldo))} ha
                          </span>
                        )
                      })()}
                    </td>
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
                    <td className={`px-3 py-2 whitespace-nowrap text-center text-sm font-medium sticky right-0 shadow-[-1px_0_0_rgba(229,231,235,1)] ${index % 2 === 0 ? 'bg-white' : 'bg-blue-50'}`}>
                      {(() => {
                        const hasDocs = !!acomp.carUrl || (acomp.matriculasDados || []).some(m => m.url);
                        return (
                          <button
                            onClick={() => handleDownloadRegistroZip(acomp)}
                            disabled={!hasDocs || isDownloadingRecordZip === acomp.id}
                            className={`inline-flex items-center justify-center p-2 rounded-full transition-colors ${
                              hasDocs 
                                ? (isDownloadingRecordZip === acomp.id ? 'text-blue-400 bg-blue-50 cursor-wait' : 'text-blue-600 hover:bg-blue-100 flex-shrink-0')
                                : 'text-gray-300 cursor-not-allowed'
                            }`}
                            title={hasDocs ? "Baixar todos os documentos do registro (ZIP)" : "Nenhum documento disponível"}
                          >
                            {isDownloadingRecordZip === acomp.id ? (
                              <Loader2 className="w-5 h-5 animate-spin text-blue-500" />
                            ) : (
                              <Download className={`w-5 h-5 ${!hasDocs ? 'opacity-50' : ''}`} />
                            )}
                          </button>
                        )
                      })()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="bg-gray-800 text-white py-8 mt-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div>
              <div className="flex items-center mb-3">
                <img 
                  src="/logo_rodape.PNG" 
                  alt="Viver de PJ Logo" 
                  className="h-12 w-12 mr-2 object-contain"
                />
                <div>
                  <span className="text-base font-bold">Viver de PJ</span>
                  <p className="text-gray-400 text-sm">Ecosistema de Empreendedorismo</p>
                </div>
              </div>
              <p className="text-gray-400 text-sm">
                Sistema de Gestão Inteligente por Viver de PJ. A Viver de PJ é um ecosistema completo de gestão e educação para Empreeendedores.
                <br /><br />
                Autor: Fernando Carvalho Gomes dos Santos 39063242816.
              </p>
            </div>
            
            <div>
              <h3 className="text-lg font-semibold mb-3">Contato</h3>
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
                  <MapIcon className="h-4 w-4 mr-2" />
                  <span>São Paulo, SP</span>
                </div>
              </div>
            </div>
            
            <div>
              <h3 className="text-lg font-semibold mb-3">Serviços</h3>
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

      {/* Modal do Mapa */}
      {isMapModalOpen && selectedMapUrl && (
        <div 
          className="fixed top-0 left-0 right-0 bottom-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50"
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
                  className="inline-flex items-center gap-3 px-6 py-3 bg-gradient-to-r from-blue-500 to-indigo-600 text-white font-semibold rounded-xl hover:from-blue-600 hover:to-indigo-700 shadow-lg hover:shadow-xl transform hover:-translate-y-1 transition-all duration-300"
                >
                  <ExternalLink className="w-5 h-5" />
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
        valueFormat={chartValueFormat}
        valueUnit={chartValueUnit}
      />
      {/* Modal de Download ITR */}
      {itrDownloadModal && (
        <div 
          className="fixed top-0 left-0 right-0 bottom-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-200"
          style={{ margin: 0, padding: 0 }}
          onClick={() => setItrDownloadModal(null)}
        >
          <div 
            className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden transform animate-in zoom-in-95 duration-200 m-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6">
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-xl font-bold text-gray-900">
                  Downloads ITR: <span className="text-blue-600">{itrDownloadModal.item.numero}</span>
                </h3>
                <button 
                  onClick={() => setItrDownloadModal(null)}
                  className="p-2 hover:bg-gray-100 rounded-full transition-colors"
                >
                  <X className="w-6 h-6 text-gray-400" />
                </button>
              </div>

              <div className="space-y-3">
                {(itrDownloadModal.item.declaracaoUrl || itrDownloadModal.item.url) && (
                  <a
                    href={itrDownloadModal.item.declaracaoUrl || itrDownloadModal.item.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-between p-4 bg-blue-50 hover:bg-blue-100 rounded-xl transition-all group"
                  >
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-blue-100 text-blue-600 rounded-lg group-hover:bg-blue-200">
                        <FileText className="w-6 h-6" />
                      </div>
                      <div className="text-left">
                        <div className="font-semibold text-blue-900">Ver Declaração</div>
                        <div className="text-xs text-blue-600">Visualizar ou baixar PDF</div>
                      </div>
                    </div>
                    <Download className="w-5 h-5 text-blue-400 group-hover:text-blue-600" />
                  </a>
                )}

                {itrDownloadModal.item.reciboUrl && (
                  <a
                    href={itrDownloadModal.item.reciboUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-between p-4 bg-green-50 hover:bg-green-100 rounded-xl transition-all group"
                  >
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-green-100 text-green-600 rounded-lg group-hover:bg-green-200">
                        <ClipboardCheck className="w-6 h-6" />
                      </div>
                      <div className="text-left">
                        <div className="font-semibold text-green-900">Ver Recibo</div>
                        <div className="text-xs text-green-600">Visualizar ou baixar PDF</div>
                      </div>
                    </div>
                    <Download className="w-5 h-5 text-green-400 group-hover:text-green-600" />
                  </a>
                )}

                <button
                  onClick={() => handleDownloadSingleItrZipped(itrDownloadModal.item, itrDownloadModal.imovel)}
                  disabled={isDownloadingSingleZip === itrDownloadModal.item.id}
                  className="w-full flex items-center justify-between p-4 bg-indigo-50 hover:bg-indigo-100 rounded-xl transition-all group disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-indigo-100 text-indigo-600 rounded-lg group-hover:bg-indigo-200">
                      {isDownloadingSingleZip === itrDownloadModal.item.id ? (
                        <Loader2 className="w-6 h-6 animate-spin" />
                      ) : (
                        <Archive className="w-6 h-6" />
                      )}
                    </div>
                    <div className="text-left">
                      <div className="font-semibold text-indigo-900">Baixar Ambos (ZIP)</div>
                      <div className="text-xs text-indigo-600">Pacote completo do ITR</div>
                    </div>
                  </div>
                  <Download className="w-5 h-5 text-indigo-400 group-hover:text-indigo-600" />
                </button>
              </div>

              <div className="mt-6 pt-6 border-t border-gray-100">
                <button
                  onClick={() => setItrDownloadModal(null)}
                  className="w-full py-3 bg-gray-50 text-gray-700 font-semibold rounded-xl hover:bg-gray-100 transition-colors"
                >
                  Fechar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default AcompanhamentosView

