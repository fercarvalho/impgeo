import React, { useState, useEffect, useMemo } from 'react'
import { Map as MapIcon, ExternalLink, Download, FileText, ClipboardCheck, Loader2, Archive, X, Phone, Mail, Globe, Search } from 'lucide-react'
import ChartModal from '@/components/modals/ChartModal'
import Modal from '@/components/Modal'
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
    matriculas_dados = raw.matriculas.split(',').map((m: string, idx: number) => ({
      id: `legacy-mat-${String(raw?.id ?? '')}-${idx}`,
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
    itr_dados = raw.itr.split(',').map((m: string, idx: number) => ({
      id: `legacy-itr-${String(raw?.id ?? '')}-${idx}`,
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
    ccir_dados = legacyVal.split(',').map((m: string, idx: number) => ({
      id: `legacy-ccir-${String(raw?.id ?? '')}-${idx}`,
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
    .replace(/^_+|_+$/g, '') // Remove underscores nas bordas
    || 'Sem_Nome'
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
  const [isSubmittingPassword, setIsSubmittingPassword] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')

  useEffect(() => {
    const controller = new AbortController()

    const loadAcompanhamentos = async () => {
      let aborted = false
      try {
        // Tentar carregar sem senha primeiro
        const response = await fetch(`${API_BASE_URL}/acompanhamentos/public/${token}`, { signal: controller.signal })
        const result = await response.json()

        if (result.success) {
          setAcompanhamentos(normalizeAcompanhamentos(result.data))
          setShareLinkName(result.shareLinkName)
          setRequiresPassword(false)
        } else {
          // Verificar se requer senha
          if (result.requiresPassword || response.status === 403) {
            setRequiresPassword(true)
            if (result.shareLinkName) setShareLinkName(result.shareLinkName)
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
        if (error instanceof DOMException && error.name === 'AbortError') {
          aborted = true
          return
        }
        console.error('Erro ao carregar acompanhamentos:', error)
        setError('Erro ao carregar dados')
      } finally {
        if (!aborted) setLoading(false)
      }
    }
    loadAcompanhamentos()

    return () => { controller.abort() }
  }, [token])

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setPasswordError('')

    if (!password.trim()) {
      setPasswordError('Por favor, informe a senha')
      return
    }

    setIsSubmittingPassword(true)
    try {
      const response = await fetch(
        `${API_BASE_URL}/acompanhamentos/public/${token}?password=${encodeURIComponent(password.trim())}`,
        { method: 'GET' }
      )
      const result = await response.json()

      if (result.success) {
        setAcompanhamentos(normalizeAcompanhamentos(result.data))
        setShareLinkName(result.shareLinkName)
        setRequiresPassword(false)
        setPassword('')
      } else {
        if (result.shareLinkName) setShareLinkName(result.shareLinkName)
        if (response.status === 401) {
          setPasswordError('Senha incorreta. Tente novamente.')
        } else {
          setPasswordError(result.error || 'Erro ao validar senha')
        }
      }
    } catch (error) {
      console.error('Erro ao validar senha:', error)
      setPasswordError('Erro ao validar senha. Tente novamente.')
    } finally {
      setIsSubmittingPassword(false)
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

    setIsDownloadingZip(acompanhamentoId + 'ccir')
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

      if (ccirComUrl.length > 0) {
        const ccirPromises = ccirComUrl.map(async (mat) => {
          try {
            const response = await fetch(mat.url!)
            const blob = await response.blob()
            const safeName = mat.numero.replace(/[^a-z0-9]/gi, '_').toLowerCase()
            zip.folder('CCIR')?.file(`Ccir_${safeName}.pdf`, blob)
          } catch (e) {
            console.error(`Erro ao baixar CCIR ${mat.numero}:`, e)
          }
        })
        promises.push(...ccirPromises)
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
    return (num || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  }

  const getSortValue = (acomp: Acompanhamento, field: SortField): string | number => {
    if (field === 'saldoReservaLegal') {
      return (acomp.reservaLegal || 0) - ((acomp.areaTotal || 0) * 0.2)
    }
    return acomp[field as keyof Acompanhamento] as string | number
  }

  const sortedAcompanhamentos = useMemo(() => {
    const lower = searchTerm.toLowerCase()
    const filtered = searchTerm
      ? acompanhamentos.filter(a =>
          (a.imovel || '').toLowerCase().includes(lower) ||
          (a.municipio || '').toLowerCase().includes(lower) ||
          String(a.codImovel ?? '').includes(searchTerm)
        )
      : [...acompanhamentos]

    const direction = sortDirection === 'asc' ? 1 : -1

    filtered.sort((a, b) => {
      const aValue = getSortValue(a, sortField)
      const bValue = getSortValue(b, sortField)

      if (typeof aValue === 'number' && typeof bValue === 'number') {
        return (aValue - bValue) * direction
      }

      return String(aValue ?? '')
        .localeCompare(String(bValue ?? ''), 'pt-BR', { sensitivity: 'base' }) * direction
    })

    return filtered
  }, [acompanhamentos, sortField, sortDirection, searchTerm])

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
      // Capturar o valor ANTES de resetar os estilos
      const savedScrollY = document.body.style.top
      document.body.style.overflow = ''
      document.body.style.position = ''
      document.body.style.top = ''
      document.body.style.width = ''
      if (savedScrollY) {
        window.scrollTo(0, parseInt(savedScrollY || '0') * -1)
      }
    }
  }, [isMapModalOpen, itrDownloadModal, chartModalOpen])

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <p className="text-gray-500 font-medium">Carregando dados...</p>
        </div>
      </div>
    )
  }

  if (requiresPassword) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden">
          <div className="bg-gradient-to-r from-blue-500 to-indigo-600 px-8 py-8 text-center">
            <div className="mx-auto w-16 h-16 bg-white/20 rounded-2xl flex items-center justify-center mb-4">
              <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
            </div>
            {shareLinkName ? (
              <>
                <h1 className="text-2xl font-bold text-white mb-1">Bem-vindo(a)</h1>
                <p className="text-lg font-semibold text-blue-100 mb-1">{shareLinkName}</p>
                <p className="text-blue-200 text-sm">Este link está protegido por senha</p>
              </>
            ) : (
              <>
                <h1 className="text-2xl font-bold text-white mb-1">Acesso Protegido</h1>
                <p className="text-blue-100 text-sm">Este link compartilhável está protegido por senha</p>
              </>
            )}
          </div>

          <form onSubmit={handlePasswordSubmit} className="p-8 space-y-4">
            <div>
              <label htmlFor="password" className="block text-sm font-semibold text-gray-700 mb-2">
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
                className={`w-full px-4 py-3 border rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all ${
                  passwordError ? 'border-red-400 bg-red-50' : 'border-gray-200'
                }`}
                placeholder="Digite a senha"
                autoComplete="current-password"
                autoFocus
              />
              {passwordError && (
                <p className="mt-2 text-sm text-red-600">{passwordError}</p>
              )}
            </div>

            <button
              type="submit"
              disabled={isSubmittingPassword}
              className="w-full px-4 py-3 bg-gradient-to-r from-blue-500 to-indigo-600 text-white rounded-xl hover:from-blue-600 hover:to-indigo-700 font-semibold shadow-md shadow-blue-500/25 hover:-translate-y-0.5 transition-all duration-200 disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:translate-y-0 flex items-center justify-center gap-2"
            >
              {isSubmittingPassword && <Loader2 className="w-4 h-4 animate-spin" />}
              {isSubmittingPassword ? 'Verificando...' : 'Acessar'}
            </button>
          </form>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-50 flex items-center justify-center p-4">
        <div className="text-center bg-white p-8 rounded-2xl shadow-xl max-w-md border border-gray-100">
          <div className="w-16 h-16 bg-red-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <X className="w-8 h-8 text-red-500" />
          </div>
          <h1 className="text-xl font-bold text-gray-900 mb-2">Link indisponível</h1>
          <p className="text-gray-600">{error}</p>
          <p className="text-sm text-gray-400 mt-3">
            {error.includes('expirou')
              ? 'Entre em contato com o administrador para obter um novo link.'
              : 'O link pode estar inválido ou expirado.'}
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-[#111827]">
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-600 to-indigo-700 text-white shadow-lg">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-xl bg-white/15">
                <ClipboardCheck className="w-5 h-5 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-bold">Acompanhamentos de Imóveis</h1>
                <p className="text-blue-200 text-sm">Visualização somente leitura</p>
              </div>
            </div>
            <div className="flex items-center gap-2.5">
              <img src="/imp_logo.png" alt="IMPGEO Logo" className="h-9 w-9 object-contain rounded-lg" />
              <span className="text-base font-bold text-white">IMPGEO</span>
            </div>
          </div>
        </div>
      </div>

      <main className="max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8 space-y-6">
        {/* Mensagem de Boas-vindas */}
        <div className="bg-gradient-to-r from-blue-500 to-indigo-600 text-white rounded-2xl shadow-md shadow-blue-500/20 p-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-white/15 rounded-xl flex items-center justify-center flex-shrink-0">
              <MapIcon className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-bold">
                Bem-vindo(a){shareLinkName ? `, ${shareLinkName}` : ''}
              </h2>
              <p className="text-blue-100 text-sm">Visualização somente leitura dos acompanhamentos de imóveis</p>
            </div>
          </div>
        </div>

        {/* Estatísticas */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div 
            className="bg-white dark:!bg-[#243040] rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-4 cursor-pointer hover:shadow-md hover:-translate-y-0.5 hover:border-blue-200 dark:hover:border-blue-700 transition-all duration-200"
            onClick={() => openChart('Distribuição de Imóveis', 'Total de imóveis por município', getTotalImoveisData(), { valueFormat: 'number', valueUnit: '' })}
          >
            <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">Total de Imóveis</p>
            <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{acompanhamentos.length}</p>
          </div>
          <div 
            className="bg-white dark:!bg-[#243040] rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-4 cursor-pointer hover:shadow-md hover:-translate-y-0.5 hover:border-blue-200 dark:hover:border-blue-700 transition-all duration-200"
            onClick={() => openChart('Distribuição de Área Total', 'Área total por município (ha)', getAreaTotalData())}
          >
            <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">Área Total</p>
            <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">
              {formatNumber(acompanhamentos.reduce((sum, a) => sum + a.areaTotal, 0))} ha
            </p>
          </div>
          <div 
            className="bg-white dark:!bg-[#243040] rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-4 cursor-pointer hover:shadow-md hover:-translate-y-0.5 hover:border-blue-200 dark:hover:border-blue-700 transition-all duration-200"
            onClick={() => openChart('Geo Certificação', 'Distribuição de imóveis com e sem geo certificação', getGeoCertificacaoData(), { valueFormat: 'number', valueUnit: '' })}
          >
            <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">Com Geo Certificação</p>
            <p className="text-2xl font-bold text-green-600">
              {acompanhamentos.filter(a => a.geoCertificacao === 'SIM').length}
            </p>
          </div>
          <div 
            className="bg-white dark:!bg-[#243040] rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-4 cursor-pointer hover:shadow-md hover:-translate-y-0.5 hover:border-blue-200 dark:hover:border-blue-700 transition-all duration-200"
            onClick={() => openChart('Geo Registro', 'Distribuição de imóveis com e sem geo registro', getGeoRegistroData(), { valueFormat: 'number', valueUnit: '' })}
          >
            <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">Com Geo Registro</p>
            <p className="text-2xl font-bold text-green-600">
              {acompanhamentos.filter(a => a.geoRegistro === 'SIM').length}
            </p>
          </div>
        </div>

        {/* Estatísticas de Área por Tipo de Cultura */}
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4">
          <div 
            className="bg-white dark:!bg-[#243040] rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-4 cursor-pointer hover:shadow-md hover:-translate-y-0.5 hover:border-blue-200 dark:hover:border-blue-700 transition-all duration-200"
            onClick={() => openChart('Silvicultura', 'Distribuição de área por imóvel (ha)', getCulturaData('Silvicultura'))}
          >
            <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">Silvicultura</p>
            <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">
              {formatNumber(getAreaByCulturaType('Silvicultura'))} ha
            </p>
          </div>
          <div 
            className="bg-white dark:!bg-[#243040] rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-4 cursor-pointer hover:shadow-md hover:-translate-y-0.5 hover:border-blue-200 dark:hover:border-blue-700 transition-all duration-200"
            onClick={() => openChart('Cultura Temporária', 'Distribuição de área por imóvel (ha)', getCulturaData('Cultura Temporária'))}
          >
            <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">Cultura Temporária</p>
            <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">
              {formatNumber(getAreaByCulturaType('Cultura Temporária'))} ha
            </p>
          </div>
          <div 
            className="bg-white dark:!bg-[#243040] rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-4 cursor-pointer hover:shadow-md hover:-translate-y-0.5 hover:border-blue-200 dark:hover:border-blue-700 transition-all duration-200"
            onClick={() => openChart('Pasto', 'Distribuição de área por imóvel (ha)', getCulturaData('Pasto'))}
          >
            <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">Pasto</p>
            <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">
              {formatNumber(getAreaByCulturaType('Pasto'))} ha
            </p>
          </div>
          <div 
            className="bg-white dark:!bg-[#243040] rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-4 cursor-pointer hover:shadow-md hover:-translate-y-0.5 hover:border-blue-200 dark:hover:border-blue-700 transition-all duration-200"
            onClick={() => openChart('Banhado', 'Distribuição de área por imóvel (ha)', getCulturaData('Banhado'))}
          >
            <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">Banhado</p>
            <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">
              {formatNumber(getAreaByCulturaType('Banhado'))} ha
            </p>
          </div>
          <div 
            className="bg-white dark:!bg-[#243040] rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-4 cursor-pointer hover:shadow-md hover:-translate-y-0.5 hover:border-blue-200 dark:hover:border-blue-700 transition-all duration-200"
            onClick={() => openChart('Servidão', 'Distribuição de área por imóvel (ha)', getCulturaData('Servidão'))}
          >
            <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">Servidão</p>
            <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">
              {formatNumber(getAreaByCulturaType('Servidão'))} ha
            </p>
          </div>
        </div>

        {/* Estatísticas de APP, Reserva Legal e Remanescente Florestal */}
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4">
          <div 
            className="bg-white dark:!bg-[#243040] rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-4 cursor-pointer hover:shadow-md hover:-translate-y-0.5 hover:border-blue-200 dark:hover:border-blue-700 transition-all duration-200"
            onClick={() => openChart('Área Antropizada', 'Distribuição de área por imóvel (ha)', getCulturaData('Área Antropizada'))}
          >
            <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">Área Antropizada</p>
            <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">
              {formatNumber(getAreaByCulturaType('Área Antropizada'))} ha
            </p>
          </div>
          <div 
            className="bg-white dark:!bg-[#243040] rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-4 cursor-pointer hover:shadow-md hover:-translate-y-0.5 hover:border-blue-200 dark:hover:border-blue-700 transition-all duration-200"
            onClick={() => openChart('APP Código Florestal', 'Distribuição de área por imóvel (ha)', getAPPData('appCodigoFlorestal'))}
          >
            <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">APP Código Florestal</p>
            <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">
              {formatNumber(acompanhamentos.reduce((sum, a) => sum + (a.appCodigoFlorestal || 0), 0))} ha
            </p>
          </div>
          <div 
            className="bg-white dark:!bg-[#243040] rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-4 cursor-pointer hover:shadow-md hover:-translate-y-0.5 hover:border-blue-200 dark:hover:border-blue-700 transition-all duration-200"
            onClick={() => openChart('APP Vegetada', 'Distribuição de área por imóvel (ha)', getAPPData('appVegetada'))}
          >
            <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">APP Vegetada</p>
            <p className="text-2xl font-bold text-green-600">
              {formatNumber(acompanhamentos.reduce((sum, a) => sum + (a.appVegetada || 0), 0))} ha
            </p>
          </div>
          <div 
            className="bg-white dark:!bg-[#243040] rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-4 cursor-pointer hover:shadow-md hover:-translate-y-0.5 hover:border-blue-200 dark:hover:border-blue-700 transition-all duration-200"
            onClick={() => openChart('APP Não Vegetada', 'Distribuição de área por imóvel (ha)', getAPPData('appNaoVegetada'))}
          >
            <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">APP Não Vegetada</p>
            <p className="text-2xl font-bold text-orange-600">
              {formatNumber(acompanhamentos.reduce((sum, a) => sum + (a.appNaoVegetada || 0), 0))} ha
            </p>
          </div>
          <div
            className="bg-white dark:!bg-[#243040] rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-4 cursor-pointer hover:shadow-md hover:-translate-y-0.5 hover:border-blue-200 dark:hover:border-blue-700 transition-all duration-200"
            onClick={() => openChart('20% Reserva Legal', 'Distribuição de área por imóvel (ha)', getReservaLegalData())}
          >
            <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">20% Reserva Legal</p>
            <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">
              {formatNumber(acompanhamentos.reduce((sum, a) => sum + (a.reservaLegal || 0), 0))} ha
            </p>
          </div>
          <div 
            className="bg-white dark:!bg-[#243040] rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-4 cursor-pointer hover:shadow-md hover:-translate-y-0.5 hover:border-blue-200 dark:hover:border-blue-700 transition-all duration-200"
            onClick={() => openChart('Remanescente Florestal', 'Distribuição de área por imóvel (ha)', getAPPData('remanescenteFlorestal'))}
          >
            <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">Remanescente Florestal</p>
            <p className="text-2xl font-bold text-green-600 dark:text-green-400">
              {formatNumber(acompanhamentos.reduce((sum, a) => sum + (a.remanescenteFlorestal || 0), 0))} ha
            </p>
          </div>
        </div>

        {/* Busca + Ordenação */}
        <div className="flex flex-col sm:flex-row gap-2 bg-white dark:!bg-[#243040] rounded-2xl border border-gray-200 dark:border-gray-700 px-4 py-3 shadow-sm">
          <div className="flex-1 relative min-w-0">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500 h-4 w-4" />
            <input
              type="text"
              placeholder="Buscar por imóvel, município ou código..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-44 py-1.5 bg-gray-50 dark:!bg-[#1e2d3e] border border-gray-200 dark:border-gray-600 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:text-gray-100 dark:placeholder-gray-400 transition-all"
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold tabular-nums pointer-events-none select-none whitespace-nowrap px-1.5 py-0.5 rounded-lg transition-colors
              bg-blue-50 text-blue-500 dark:bg-blue-900/30 dark:text-blue-400">
              Mostrando {sortedAcompanhamentos.length}/{acompanhamentos.length} Resultados
            </span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <div className="hidden sm:block w-px h-5 bg-gray-200 dark:bg-gray-600" />
            <div className="flex items-center gap-1.5 bg-gray-50 dark:!bg-[#1e2d3e] border border-gray-200 dark:border-gray-600 rounded-xl px-3 py-1.5">
              <span className="text-xs font-semibold text-gray-400 dark:text-gray-500 whitespace-nowrap uppercase tracking-wide">Ordenar</span>
              <select
                id="sort-select"
                value={sortField}
                onChange={e => { setSortField(e.target.value as SortField); setSortDirection('asc') }}
                className="text-sm bg-transparent border-0 text-gray-700 dark:text-gray-200 focus:outline-none cursor-pointer font-medium"
              >
                <option value="codImovel">Código</option>
                <option value="imovel">Imóvel</option>
                <option value="municipio">Município</option>
                <option value="areaTotal">Área Total</option>
                <option value="reservaLegal">Reserva Legal</option>
                <option value="saldoReservaLegal">Saldo R.L.</option>
                <option value="geoCertificacao">Geo Certificação</option>
                <option value="geoRegistro">Geo Registro</option>
                <option value="car">CAR</option>
                <option value="statusCar">Status CAR</option>
              </select>
            </div>
            <button
              onClick={() => setSortDirection(d => d === 'asc' ? 'desc' : 'asc')}
              aria-label={sortDirection === 'asc' ? 'Ordem crescente — clique para decrescente' : 'Ordem decrescente — clique para crescente'}
              className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 text-sm font-semibold hover:bg-blue-100 dark:hover:bg-blue-900/50 transition-colors"
            >
              {sortDirection === 'asc' ? '↑ Cresc.' : '↓ Decresc.'}
            </button>
          </div>
        </div>

        {/* Cards */}
        <div className="space-y-4">
          {sortedAcompanhamentos.length === 0 ? (
            <div className="bg-white dark:!bg-[#243040] rounded-2xl border-2 border-dashed border-gray-200 dark:border-gray-700 p-12 text-center">
              <ClipboardCheck className="h-10 w-10 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500 dark:text-gray-400 font-medium">
                {searchTerm ? `Nenhum resultado para "${searchTerm}"` : 'Nenhum registro disponível'}
              </p>
            </div>
          ) : sortedAcompanhamentos.map((acomp) => {
            const saldo = (acomp.reservaLegal || 0) - ((acomp.areaTotal || 0) * 0.2)
            const hasDocs = !!acomp.carUrl
              || (acomp.matriculasDados || []).some(m => m.url)
              || (acomp.itrDados || []).some(m => m.declaracaoUrl || m.reciboUrl || m.url)
              || (acomp.ccirDados || []).some(m => m.url)
            const hasMatriculas = (acomp.matriculasDados || []).length > 0
            const hasCcir = (acomp.ccirDados || []).length > 0
            const hasItr = (acomp.itrDados || []).length > 0
            const hasMatriculasPdfs = (acomp.matriculasDados || []).some(m => m.url)
            const hasCcirPdfs = (acomp.ccirDados || []).some(m => m.url)
            const hasItrPdfs = (acomp.itrDados || []).some(m => m.declaracaoUrl || m.reciboUrl || m.url)
            const hasUsoDoSolo = acomp.cultura1 || acomp.cultura2 || acomp.outros
            const hasApp = acomp.appCodigoFlorestal > 0 || acomp.appVegetada > 0 || acomp.appNaoVegetada > 0 || acomp.remanescenteFlorestal > 0

            return (
              <div key={acomp.id} className="bg-white dark:!bg-[#243040] rounded-2xl shadow-md border border-gray-200 dark:border-gray-700 overflow-hidden hover:shadow-lg transition-shadow duration-200">

                {/* ── HEADER ───────────────────────────────── */}
                <div className="bg-gradient-to-r from-blue-500 to-indigo-600 px-4 py-3 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="shrink-0 bg-white/20 text-white text-xs font-bold px-2 py-0.5 rounded-lg tracking-wide">
                      #{formatCodImovel(acomp.codImovel)}
                    </span>
                    <div className="min-w-0">
                      <div className="text-white font-bold text-sm leading-tight truncate">{acomp.imovel}</div>
                      <div className="text-blue-200 text-xs mt-0.5">{acomp.municipio}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {acomp.mapaUrl && (
                      <button
                        onClick={() => { setSelectedMapUrl(acomp.mapaUrl || ''); setSelectedImovel(acomp.imovel); setIsMapModalOpen(true) }}
                        title="Ver mapa do imóvel"
                        aria-label={`Ver mapa do imóvel ${acomp.imovel}`}
                        className="p-1.5 bg-white/20 hover:bg-white/35 rounded-lg transition-colors"
                      >
                        <MapIcon className="w-4 h-4 text-white" aria-hidden="true" />
                      </button>
                    )}
                    <button
                      onClick={() => handleDownloadRegistroZip(acomp)}
                      disabled={!hasDocs || isDownloadingRecordZip === acomp.id}
                      title={hasDocs ? 'Baixar todos os documentos (ZIP)' : 'Nenhum documento disponível'}
                      aria-label={hasDocs ? `Baixar todos os documentos de ${acomp.imovel} em ZIP` : 'Nenhum documento disponível'}
                      className={`p-1.5 rounded-lg transition-colors ${hasDocs ? 'bg-white/20 hover:bg-white/35' : 'bg-white/10 opacity-40 cursor-not-allowed'}`}
                    >
                      {isDownloadingRecordZip === acomp.id
                        ? <Loader2 className="w-4 h-4 text-white animate-spin" aria-hidden="true" />
                        : <Archive className="w-4 h-4 text-white" aria-hidden="true" />
                      }
                    </button>
                  </div>
                </div>

                {/* ── BODY ─────────────────────────────────── */}
                <div className="divide-y divide-gray-100 dark:divide-gray-700/60">

                  {/* DOCUMENTOS */}
                  <div className="px-4 py-3 space-y-2.5">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-blue-500 dark:text-blue-400 flex items-center gap-1.5">
                      <FileText className="w-3.5 h-3.5" /> Documentos
                    </p>

                    {/* Matrículas */}
                    <div className="flex items-start gap-2">
                      <span className="text-xs text-gray-400 dark:text-gray-500 w-[88px] shrink-0 pt-0.5 leading-tight">Matrículas</span>
                      <div className="flex-1 flex flex-wrap gap-x-1.5 gap-y-1 min-w-0">
                        {hasMatriculas ? acomp.matriculasDados!.map((mat, i) => (
                          <React.Fragment key={mat.id}>
                            {mat.url
                              ? <a href={mat.url} target="_blank" rel="noopener noreferrer" title={`Baixar matrícula ${mat.numero}`} className="text-xs text-blue-600 dark:text-blue-400 hover:underline font-medium whitespace-nowrap inline-flex items-center gap-0.5"><FileText className="w-3 h-3 shrink-0" />{mat.numero}</a>
                              : <span className="text-xs text-gray-700 dark:text-gray-300 whitespace-nowrap">{mat.numero}</span>
                            }
                            {i < acomp.matriculasDados!.length - 1 && <span className="text-gray-300 text-xs">,</span>}
                          </React.Fragment>
                        )) : <span className="text-xs text-gray-400">—</span>}
                      </div>
                      {hasMatriculas && (
                        <button type="button" disabled={!hasMatriculasPdfs || isDownloadingZip === acomp.id}
                          onClick={() => handleDownloadAllZipped(acomp.id, acomp.matriculasDados || [], acomp.imovel)}
                          title={hasMatriculasPdfs ? 'Baixar todas as matrículas (ZIP)' : 'Sem PDFs disponíveis'}
                          className={`p-1 rounded-full shrink-0 transition-colors ${hasMatriculasPdfs ? 'text-blue-500 hover:bg-blue-100 dark:hover:bg-blue-900/30' : 'text-gray-300 cursor-not-allowed'}`}>
                          {isDownloadingZip === acomp.id ? <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-500" /> : <Download className="w-3.5 h-3.5" />}
                        </button>
                      )}
                    </div>

                    {/* N. INCRA / CCIR */}
                    <div className="flex items-start gap-2">
                      <span className="text-xs text-gray-400 dark:text-gray-500 w-[88px] shrink-0 pt-0.5 leading-tight">N. INCRA/CCIR</span>
                      <div className="flex-1 flex flex-wrap gap-x-1.5 gap-y-1 min-w-0">
                        {hasCcir ? acomp.ccirDados!.map((item, i) => (
                          <React.Fragment key={item.id}>
                            {item.url
                              ? <a href={item.url} target="_blank" rel="noopener noreferrer" title={`Baixar CCIR ${item.numero}`} className="text-xs text-blue-600 dark:text-blue-400 hover:underline font-medium whitespace-nowrap inline-flex items-center gap-0.5"><FileText className="w-3 h-3 shrink-0" />{item.numero}</a>
                              : <span className="text-xs text-gray-700 dark:text-gray-300 whitespace-nowrap">{item.numero}</span>
                            }
                            {i < acomp.ccirDados!.length - 1 && <span className="text-gray-300 text-xs">,</span>}
                          </React.Fragment>
                        )) : <span className="text-xs text-gray-400">{acomp.nIncraCcir || '—'}</span>}
                      </div>
                      {hasCcir && (
                        <button type="button" disabled={!hasCcirPdfs || isDownloadingZip === acomp.id + 'ccir'}
                          onClick={() => handleDownloadAllCcirZipped(acomp.id, acomp.ccirDados || [], acomp.imovel)}
                          title={hasCcirPdfs ? 'Baixar todos os CCIRs (ZIP)' : 'Sem PDFs disponíveis'}
                          className={`p-1 rounded-full shrink-0 transition-colors ${hasCcirPdfs ? 'text-blue-500 hover:bg-blue-100 dark:hover:bg-blue-900/30' : 'text-gray-300 cursor-not-allowed'}`}>
                          {isDownloadingZip === acomp.id + 'ccir' ? <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-500" /> : <Download className="w-3.5 h-3.5" />}
                        </button>
                      )}
                    </div>

                    {/* CAR */}
                    <div className="flex items-start gap-2">
                      <span className="text-xs text-gray-400 dark:text-gray-500 w-[88px] shrink-0 pt-0.5 leading-tight">CAR</span>
                      <div className="flex-1 flex flex-wrap items-center gap-x-2 gap-y-1 min-w-0">
                        {acomp.car ? (
                          acomp.carUrl
                            ? <a href={acomp.carUrl} target="_blank" rel="noopener noreferrer" title={`Baixar CAR: ${acomp.car}`} className="text-xs text-blue-600 dark:text-blue-400 hover:underline font-medium inline-flex items-center gap-0.5 truncate max-w-[180px]"><Download className="w-3 h-3 shrink-0" />{acomp.car}</a>
                            : <span className="text-xs text-gray-700 dark:text-gray-300 truncate max-w-[180px]">{acomp.car}</span>
                        ) : <span className="text-xs text-gray-400">—</span>}
                        {acomp.statusCar && (
                          <span className="text-[10px] font-semibold bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 px-2 py-0.5 rounded-full shrink-0">{acomp.statusCar}</span>
                        )}
                      </div>
                    </div>

                    {/* ITR */}
                    <div className="flex items-start gap-2">
                      <span className="text-xs text-gray-400 dark:text-gray-500 w-[88px] shrink-0 pt-0.5 leading-tight">ITR</span>
                      <div className="flex-1 flex flex-wrap gap-x-1.5 gap-y-1 min-w-0">
                        {hasItr ? acomp.itrDados!.map((item, i) => (
                          <React.Fragment key={item.id}>
                            {item.declaracaoUrl || item.reciboUrl || item.url
                              ? <button type="button" onClick={() => setItrDownloadModal({ item, imovel: acomp.imovel })} title={`Opções de download ITR ${item.numero}`} className="text-xs text-blue-600 dark:text-blue-400 hover:underline font-medium whitespace-nowrap inline-flex items-center gap-0.5"><FileText className="w-3 h-3 shrink-0" />{item.numero}</button>
                              : <span className="text-xs text-gray-700 dark:text-gray-300 whitespace-nowrap font-medium">{item.numero}</span>
                            }
                            {i < acomp.itrDados!.length - 1 && <span className="text-gray-300 text-xs">,</span>}
                          </React.Fragment>
                        )) : <span className="text-xs text-gray-400">{acomp.itr || '—'}</span>}
                      </div>
                      {hasItr && (
                        <button type="button" disabled={!hasItrPdfs || isDownloadingZip === acomp.id + 'itr'}
                          onClick={() => handleDownloadAllItrZipped(acomp.id, acomp.itrDados || [], acomp.imovel)}
                          title={hasItrPdfs ? 'Baixar todos os ITRs (ZIP)' : 'Sem PDFs disponíveis'}
                          className={`p-1 rounded-full shrink-0 transition-colors ${hasItrPdfs ? 'text-blue-500 hover:bg-blue-100 dark:hover:bg-blue-900/30' : 'text-gray-300 cursor-not-allowed'}`}>
                          {isDownloadingZip === acomp.id + 'itr' ? <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-500" /> : <Download className="w-3.5 h-3.5" />}
                        </button>
                      )}
                    </div>
                  </div>

                  {/* GEORREFERENCIAMENTO */}
                  <div className="px-4 py-3">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-blue-500 dark:text-blue-400 mb-2 flex items-center gap-1.5">
                      <MapIcon className="w-3.5 h-3.5" /> Georreferenciamento
                    </p>
                    <div className="flex items-center gap-5">
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-gray-500 dark:text-gray-400">Certificação</span>
                        <span className={`text-xs font-bold px-2.5 py-0.5 rounded-full ${acomp.geoCertificacao === 'SIM' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'}`}>
                          {acomp.geoCertificacao}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-gray-500 dark:text-gray-400">Registro</span>
                        <span className={`text-xs font-bold px-2.5 py-0.5 rounded-full ${acomp.geoRegistro === 'SIM' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'}`}>
                          {acomp.geoRegistro}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* ÁREAS */}
                  <div className="px-4 py-3">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-blue-500 dark:text-blue-400 mb-2.5">Áreas (ha)</p>
                    <div className="grid grid-cols-3 gap-2">
                      <div className="bg-gray-50 dark:bg-[#1a2a3e] rounded-xl p-2.5 text-center border border-gray-100 dark:border-gray-700/50">
                        <div className="text-[10px] text-gray-400 dark:text-gray-500 uppercase tracking-wide mb-0.5">Total</div>
                        <div className="text-sm font-bold text-gray-800 dark:text-gray-100 leading-tight">{formatNumber(acomp.areaTotal)}</div>
                      </div>
                      <div className="bg-gray-50 dark:bg-[#1a2a3e] rounded-xl p-2.5 text-center border border-gray-100 dark:border-gray-700/50">
                        <div className="text-[10px] text-gray-400 dark:text-gray-500 uppercase tracking-wide mb-0.5">Res. Legal</div>
                        <div className="text-sm font-bold text-gray-800 dark:text-gray-100 leading-tight">{formatNumber(acomp.reservaLegal)}</div>
                      </div>
                      <div className="bg-gray-50 dark:bg-[#1a2a3e] rounded-xl p-2.5 text-center border border-gray-100 dark:border-gray-700/50">
                        <div className="text-[10px] text-gray-400 dark:text-gray-500 uppercase tracking-wide mb-0.5">Saldo RL</div>
                        <div className={`text-sm font-bold leading-tight ${saldo >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                          {saldo >= 0 ? '+' : ''}{formatNumber(saldo)}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* USO DO SOLO */}
                  {hasUsoDoSolo && (
                    <div className="px-4 py-3">
                      <p className="text-[10px] font-bold uppercase tracking-widest text-blue-500 dark:text-blue-400 mb-2.5">Uso do Solo</p>
                      <div className="flex flex-wrap gap-2">
                        {acomp.cultura1 && (
                          <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800/50 rounded-xl px-3 py-1.5">
                            <div className="text-xs font-semibold text-blue-800 dark:text-blue-300">{acomp.cultura1}</div>
                            <div className="text-xs text-blue-500 dark:text-blue-400 mt-0.5">{formatNumber(acomp.areaCultura1)} ha</div>
                          </div>
                        )}
                        {acomp.cultura2 && (
                          <div className="bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-100 dark:border-indigo-800/50 rounded-xl px-3 py-1.5">
                            <div className="text-xs font-semibold text-indigo-800 dark:text-indigo-300">{acomp.cultura2}</div>
                            <div className="text-xs text-indigo-500 dark:text-indigo-400 mt-0.5">{formatNumber(acomp.areaCultura2)} ha</div>
                          </div>
                        )}
                        {acomp.outros && (
                          <div className="bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700/50 rounded-xl px-3 py-1.5">
                            <div className="text-xs font-semibold text-slate-700 dark:text-slate-300">{acomp.outros}</div>
                            <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{formatNumber(acomp.areaOutros)} ha</div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* APP / AMBIENTAL */}
                  {hasApp && (
                    <div className="px-4 py-3">
                      <p className="text-[10px] font-bold uppercase tracking-widest text-blue-500 dark:text-blue-400 mb-2.5">APP / Ambiental (ha)</p>
                      <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
                        {acomp.appCodigoFlorestal > 0 && (
                          <div className="flex justify-between items-center">
                            <span className="text-xs text-gray-500 dark:text-gray-400">Cód. Florestal</span>
                            <span className="text-xs font-semibold text-gray-700 dark:text-gray-300">{formatNumber(acomp.appCodigoFlorestal)}</span>
                          </div>
                        )}
                        {acomp.appVegetada > 0 && (
                          <div className="flex justify-between items-center">
                            <span className="text-xs text-gray-500 dark:text-gray-400">APP Vegetada</span>
                            <span className="text-xs font-semibold text-green-600 dark:text-green-400">{formatNumber(acomp.appVegetada)}</span>
                          </div>
                        )}
                        {acomp.appNaoVegetada > 0 && (
                          <div className="flex justify-between items-center">
                            <span className="text-xs text-gray-500 dark:text-gray-400">APP Não Veg.</span>
                            <span className="text-xs font-semibold text-rose-600 dark:text-rose-400">{formatNumber(acomp.appNaoVegetada)}</span>
                          </div>
                        )}
                        {acomp.remanescenteFlorestal > 0 && (
                          <div className="flex justify-between items-center">
                            <span className="text-xs text-gray-500 dark:text-gray-400">Remanescente</span>
                            <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">{formatNumber(acomp.remanescenteFlorestal)}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                </div>
              </div>
            )
          })}
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
                Sistema de Gestão Inteligente por Viver de PJ. A Viver de PJ é um ecossistema completo de gestão e educação para Empreendedores.
                <br /><br />
                Autor: Fernando Carvalho Gomes dos Santos 39063242816.
              </p>
            </div>
            
            <div>
              <h3 className="text-lg font-semibold mb-3">Contato</h3>
              <div className="space-y-2 text-gray-400">
                <div className="flex items-center">
                  <Phone className="h-4 w-4 mr-2" />
                  <a 
                    href="https://wa.me/5511971039181?text=Oi%20Sofia%2C%20tudo%20bem%3F%20Vim%20pelo%20site%20da%20IMPGEO%20e%20fiquei%20interessado%20pelo%20trabalho%20da%20Viver%20de%20PJ%20e%20gostaria%20de%20saber%20mais%20informações" 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="hover:text-white transition-colors"
                  >
                    (11) 97103-9181
                  </a>
                </div>
                <div className="flex items-center">
                  <Mail className="h-4 w-4 mr-2" />
                  <a 
                    href="mailto:vem@viverdepj.com.br" 
                    className="hover:text-white transition-colors"
                  >
                    vem@viverdepj.com.br
                  </a>
                </div>
                <div className="flex items-center">
                  <Globe className="h-4 w-4 mr-2" />
                  <a 
                    href="https://viverdepj.com.br" 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="hover:text-white transition-colors"
                  >
                    viverdepj.com.br
                  </a>
                </div>
                <div className="flex items-center">
                  <MapIcon className="h-4 w-4 mr-2" />
                  <span>Brasil</span>
                </div>
              </div>
            </div>
            
            <div>
              <h3 className="text-lg font-semibold mb-3">Serviços</h3>
              <div className="space-y-2 text-gray-400">
                <p>Consultoria Estratégica de Negócios</p>
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
            <p>&copy; {new Date().getFullYear()} Viver de PJ. TODOS OS DIREITOS RESERVADOS</p>
          </div>
        </div>
      </footer>

      {/* Modal do Mapa */}
      <Modal
        isOpen={isMapModalOpen && !!selectedMapUrl}
        onClose={() => {
          setIsMapModalOpen(false)
          setSelectedMapUrl('')
          setSelectedImovel('')
        }}
      >
        <div className="bg-white dark:bg-[#1e2a3a] rounded-lg shadow-xl w-full max-w-6xl max-h-[90vh] flex flex-col m-4">
            <div className="flex justify-between items-center p-6 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
              <div>
                <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Mapa do Imóvel</h2>
                <p className="text-gray-600 dark:text-gray-400 mt-1">{selectedImovel}</p>
              </div>
              <button
                onClick={() => {
                  setIsMapModalOpen(false)
                  setSelectedMapUrl('')
                  setSelectedImovel('')
                }}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-2xl transition-colors"
                aria-label="Fechar modal"
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
      </Modal>

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
      <Modal isOpen={!!itrDownloadModal} onClose={() => setItrDownloadModal(null)}>
        {itrDownloadModal && (
          <div className="bg-white dark:bg-[#1e2a3a] rounded-2xl shadow-2xl w-full max-w-md overflow-hidden transform animate-in zoom-in-95 duration-200 m-4">
            <div className="p-6">
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100">
                  Downloads ITR: <span className="text-blue-600 dark:text-blue-400">{itrDownloadModal.item.numero}</span>
                </h3>
                <button
                  onClick={() => setItrDownloadModal(null)}
                  className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full transition-colors"
                  aria-label="Fechar modal"
                >
                  <X className="w-6 h-6 text-gray-400" aria-hidden="true" />
                </button>
              </div>

              <div className="space-y-3">
                {(itrDownloadModal.item.declaracaoUrl || itrDownloadModal.item.url) && (
                  <a
                    href={itrDownloadModal.item.declaracaoUrl || itrDownloadModal.item.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-between p-4 bg-blue-50 dark:bg-blue-900/20 hover:bg-blue-100 dark:hover:bg-blue-900/40 rounded-xl transition-all group"
                  >
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 rounded-lg group-hover:bg-blue-200 dark:group-hover:bg-blue-900/60">
                        <FileText className="w-6 h-6" />
                      </div>
                      <div className="text-left">
                        <div className="font-semibold text-blue-900 dark:text-blue-200">Ver Declaração</div>
                        <div className="text-xs text-blue-600 dark:text-blue-400">Visualizar ou baixar PDF</div>
                      </div>
                    </div>
                    <Download className="w-5 h-5 text-blue-400 group-hover:text-blue-600 dark:group-hover:text-blue-300" />
                  </a>
                )}

                {itrDownloadModal.item.reciboUrl && (
                  <a
                    href={itrDownloadModal.item.reciboUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-between p-4 bg-green-50 dark:bg-green-900/20 hover:bg-green-100 dark:hover:bg-green-900/40 rounded-xl transition-all group"
                  >
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-green-100 dark:bg-green-900/40 text-green-600 dark:text-green-400 rounded-lg group-hover:bg-green-200 dark:group-hover:bg-green-900/60">
                        <ClipboardCheck className="w-6 h-6" />
                      </div>
                      <div className="text-left">
                        <div className="font-semibold text-green-900 dark:text-green-200">Ver Recibo</div>
                        <div className="text-xs text-green-600 dark:text-green-400">Visualizar ou baixar PDF</div>
                      </div>
                    </div>
                    <Download className="w-5 h-5 text-green-400 group-hover:text-green-600 dark:group-hover:text-green-300" />
                  </a>
                )}

                <button
                  onClick={() => handleDownloadSingleItrZipped(itrDownloadModal.item, itrDownloadModal.imovel)}
                  disabled={isDownloadingSingleZip === itrDownloadModal.item.id}
                  className="w-full flex items-center justify-between p-4 bg-indigo-50 dark:bg-indigo-900/20 hover:bg-indigo-100 dark:hover:bg-indigo-900/40 rounded-xl transition-all group disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-indigo-100 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400 rounded-lg group-hover:bg-indigo-200 dark:group-hover:bg-indigo-900/60">
                      {isDownloadingSingleZip === itrDownloadModal.item.id ? (
                        <Loader2 className="w-6 h-6 animate-spin" />
                      ) : (
                        <Archive className="w-6 h-6" />
                      )}
                    </div>
                    <div className="text-left">
                      <div className="font-semibold text-indigo-900 dark:text-indigo-200">Baixar Ambos (ZIP)</div>
                      <div className="text-xs text-indigo-600 dark:text-indigo-400">Pacote completo do ITR</div>
                    </div>
                  </div>
                  <Download className="w-5 h-5 text-indigo-400 group-hover:text-indigo-600 dark:group-hover:text-indigo-300" />
                </button>
              </div>

              <div className="mt-6 pt-6 border-t border-gray-100 dark:border-gray-700">
                <button
                  onClick={() => setItrDownloadModal(null)}
                  className="w-full py-3 bg-gray-50 dark:bg-gray-700 text-gray-700 dark:text-gray-200 font-semibold rounded-xl hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors"
                >
                  Fechar
                </button>
              </div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}

export default AcompanhamentosView

