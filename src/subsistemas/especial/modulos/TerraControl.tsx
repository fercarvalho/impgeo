import React, { useState, useEffect, useRef, useMemo } from 'react'
import { Plus, Edit, Trash2, Download, Upload, Search, Share2, Copy, Check, RefreshCw, ExternalLink, Loader2, FileText, ClipboardCheck, Archive, X, Map as MapIcon } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import ChartModal from '@/components/modals/ChartModal'
import Modal from '@/components/Modal'
import JSZip from 'jszip'
import { saveAs } from 'file-saver'
export interface MatriculaItem {
  id: string
  numero: string
  url?: string
}

export interface ItrItem {
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

interface TerraControlRecord {
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

const normalizeRecord = (raw: any): TerraControlRecord => {
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
      id: `${Date.now().toString(36)}_${idx}_${Math.random().toString(36).substr(2)}`,
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
      id: `${Date.now().toString(36)}_${idx}_${Math.random().toString(36).substr(2)}`,
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
      id: `${Date.now().toString(36)}_${idx}_${Math.random().toString(36).substr(2)}`,
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

const normalizeRecords = (rows: any[]): TerraControlRecord[] =>
  Array.isArray(rows) ? rows.map(normalizeRecord) : []

const formatCodImovel = (value: number): string => String(Number(value || 0)).padStart(3, '0')

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

const TerraControl: React.FC = () => {
  const { token, user } = useAuth()
  const [records, setRecords] = useState<TerraControlRecord[]>([])
  const [filteredRecords, setFilteredRecords] = useState<TerraControlRecord[]>([])
  const [searchTerm, setSearchTerm] = useState('')
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [isMapModalOpen, setIsMapModalOpen] = useState(false)
  const [selectedMapUrl, setSelectedMapUrl] = useState<string>('')
  const [selectedImovel, setSelectedImovel] = useState<string>('')
  const [editing, setEditing] = useState<TerraControlRecord | null>(null)
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set())
  const [isImportModalOpen, setIsImportModalOpen] = useState(false)
  const [isShareModalOpen, setIsShareModalOpen] = useState(false)
  const [shareModalMode, setShareModalMode] = useState<'create' | 'manage'>('create')
  const [isShareSelectionWarningOpen, setIsShareSelectionWarningOpen] = useState(false)
  const [shareLink, setShareLink] = useState<string>('')
  const [linkCopied, setLinkCopied] = useState(false)
  const [shareLinkName, setShareLinkName] = useState<string>('')
  const [shareLinks, setShareLinks] = useState<Array<{token: string; name: string | null; expiresAt: string | null; passwordHash: string | null; createdAt: string}>>([])
  const [editingLinkToken, setEditingLinkToken] = useState<string | null>(null)
  const [editingLinkName, setEditingLinkName] = useState<string>('')
  const [editingLinkExpiresAt, setEditingLinkExpiresAt] = useState<string>('')
  const [editingLinkPassword, setEditingLinkPassword] = useState<string>('')
  const [newLinkExpiresAt, setNewLinkExpiresAt] = useState<string>('')
  const [newLinkPassword, setNewLinkPassword] = useState<string>('')
  const [chartModalOpen, setChartModalOpen] = useState(false)
  const [chartData, setChartData] = useState<Array<{name: string; value: number; color: string}>>([])
  const [isDownloadingZip, setIsDownloadingZip] = useState<string | null>(null)
  const [isDownloadingRecordZip, setIsDownloadingRecordZip] = useState<string | null>(null)
  const [chartTitle, setChartTitle] = useState('')
  const [chartSubtitle, setChartSubtitle] = useState('')
  const [chartTotal, setChartTotal] = useState(0)
  const [chartValueUnit, setChartValueUnit] = useState('ha')
  const [chartValueFormat, setChartValueFormat] = useState<'area' | 'number'>('area')
  const [sortField, setSortField] = useState<SortField>('codImovel')
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc')
  const [isUploadingCar, setIsUploadingCar] = useState(false)
  const [isUploadingMatricula, setIsUploadingMatricula] = useState<string | null>(null)
  const [isUploadingItr, setIsUploadingItr] = useState<string | null>(null)
  const [isUploadingCcir, setIsUploadingCcir] = useState<string | null>(null)
  const [itrDownloadModal, setItrDownloadModal] = useState<{ item: ItrItem; imovel: string } | null>(null)
  const [isDownloadingSingleZip, setIsDownloadingSingleZip] = useState<string | null>(null)
  const [isImporting, setIsImporting] = useState(false)
  const [isLoadingRecords, setIsLoadingRecords] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
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

  const getSafeImovelName = (name: string): string => {
    if (!name) return 'Sem_Nome'
    const safe = name
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '') // Remove acentos
      .replace(/[^a-z0-9]/gi, '_') // Remove caracteres especiais
      .replace(/_+/g, '_') // Remove underscores duplicados
      .replace(/^_+|_+$/g, '') // Remove underscores no in\u00edcio e no fim
      .trim()
    return safe || 'Sem_Nome'
  }
  
  const [form, setForm] = useState<Partial<TerraControlRecord>>({
    codImovel: 0,
    imovel: '',
    municipio: '',
    mapaUrl: '',
    matriculas: '',
    nIncraCcir: '',
    car: '',
    carUrl: '',
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
    remanescenteFlorestal: 0,
    matriculasDados: [],
    itrDados: [],
    ccirDados: []
  })
  const [formErrors, setFormErrors] = useState<{[key: string]: string}>({})

  useEffect(() => {
    const controller = new AbortController()
    const loadRecords = async () => {
      setIsLoadingRecords(true)
      setLoadError(null)
      try {
        const response = await fetch(`${API_BASE_URL}/terracontrol`, { signal: controller.signal })
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`)
        }
        const result = await response.json()
        if (result.success) {
          const normalized = normalizeRecords(result.data)
          setRecords(normalized)
          setFilteredRecords(normalized)
        } else {
          throw new Error(result.error || 'Resposta inválida da API')
        }
      } catch (error: any) {
        if (error?.name === 'AbortError') return
        console.error('Erro ao carregar TerraControl:', error)
        setLoadError(error?.message || 'Falha ao carregar registros')
        setRecords([])
        setFilteredRecords([])
      } finally {
        setIsLoadingRecords(false)
      }
    }
    loadRecords()
    return () => controller.abort()
  }, [])

  useEffect(() => {
    const filtered = records.filter(acomp =>
      (acomp.imovel || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (acomp.municipio || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      String(acomp.codImovel ?? '').includes(searchTerm)
    )
    setFilteredRecords(filtered)
  }, [searchTerm, records])

  const sortedRecords = useMemo(() => {
    const rows = [...filteredRecords]
    const direction = sortDirection === 'asc' ? 1 : -1

    const getValue = (acomp: TerraControlRecord, field: SortField): string | number => {
      if (field === 'saldoReservaLegal') {
        return (acomp.reservaLegal || 0) - ((acomp.areaTotal || 0) * 0.2)
      }
      return acomp[field]
    }

    rows.sort((a, b) => {
      const aValue = getValue(a, sortField)
      const bValue = getValue(b, sortField)

      if (typeof aValue === 'number' && typeof bValue === 'number') {
        return (aValue - bValue) * direction
      }

      return String(aValue ?? '')
        .localeCompare(String(bValue ?? ''), 'pt-BR', { sensitivity: 'base' }) * direction
    })

    return rows
  }, [filteredRecords, sortField, sortDirection])

  // Bloquear scroll do body quando qualquer modal estiver aberto
  useEffect(() => {
    const anyModalOpen = isModalOpen || isMapModalOpen || isImportModalOpen || isShareModalOpen || isShareSelectionWarningOpen || chartModalOpen || !!itrDownloadModal

    const restoreScroll = () => {
      const top = document.body.style.top
      document.body.style.overflow = ''
      document.body.style.position = ''
      document.body.style.top = ''
      document.body.style.width = ''
      if (top) {
        const scrollY = parseInt(top, 10)
        if (!isNaN(scrollY)) {
          window.scrollTo(0, scrollY * -1)
        }
      }
    }

    if (anyModalOpen) {
      const scrollY = window.scrollY
      document.body.style.overflow = 'hidden'
      document.body.style.position = 'fixed'
      document.body.style.top = `-${scrollY}px`
      document.body.style.width = '100%'
    } else {
      restoreScroll()
    }

    return () => {
      restoreScroll()
    }
  }, [isModalOpen, isMapModalOpen, isImportModalOpen, isShareModalOpen, isShareSelectionWarningOpen, chartModalOpen, itrDownloadModal])

  const handleEdit = (acomp: TerraControlRecord) => {
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
      remanescenteFlorestal: 0,
      matriculasDados: [],
      itrDados: [],
      ccirDados: []
    })
    setFormErrors({})
    setIsModalOpen(true)
  }

  const handleCarFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      alert('Por favor, selecione apenas arquivos PDF.')
      return
    }

    if (file.size > 20 * 1024 * 1024) {
      alert('O arquivo é muito grande. O tamanho máximo permitido é 20MB.')
      return
    }

    setIsUploadingCar(true)
    try {
      const formData = new FormData()
      formData.append('file', file)

      const response = await fetch(`${API_BASE_URL}/terracontrol/upload-car`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token || localStorage.getItem('impgeo_token')}`
        },
        body: formData
      })

      const data = await response.json()
      if (data.success) {
        setForm(prev => ({ ...prev, carUrl: data.url }))
      } else {
        alert(data.error || 'Erro ao fazer upload do arquivo')
      }
    } catch (error) {
      console.error('Erro no upload:', error)
      alert('Erro ao enviar o arquivo. Tente novamente.')
    } finally {
      setIsUploadingCar(false)
      if (event.target) event.target.value = ''
    }
  }

  const handleAddMatricula = () => {
    setForm(prev => ({
      ...prev,
      matriculasDados: [
        ...(prev.matriculasDados || []),
        { id: Date.now().toString(36) + Math.random().toString(36).substr(2), numero: '', url: '' }
      ]
    }))
  }

  const handleRemoveMatricula = (id: string) => {
    setForm(prev => ({
      ...prev,
      matriculasDados: (prev.matriculasDados || []).filter(m => m.id !== id)
    }))
  }

  const handleMatriculaChange = (id: string, numero: string) => {
    setForm(prev => ({
      ...prev,
      matriculasDados: (prev.matriculasDados || []).map(m => 
        m.id === id ? { ...m, numero } : m
      )
    }))
  }

  const handleMatriculaFileUpload = async (event: React.ChangeEvent<HTMLInputElement>, id: string) => {
    const file = event.target.files?.[0]
    if (!file) return

    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      alert('Por favor, selecione apenas arquivos PDF.')
      return
    }

    if (file.size > 20 * 1024 * 1024) {
      alert('O arquivo é muito grande. O tamanho máximo permitido é 20MB.')
      return
    }

    setIsUploadingMatricula(id)
    try {
      const formData = new FormData()
      formData.append('file', file)

      const response = await fetch(`${API_BASE_URL}/terracontrol/upload-car`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token || localStorage.getItem('impgeo_token')}`
        },
        body: formData
      })

      const data = await response.json()
      if (data.success) {
        setForm(prev => ({
          ...prev,
          matriculasDados: (prev.matriculasDados || []).map(m => 
            m.id === id ? { ...m, url: data.url } : m
          )
        }))
      } else {
        alert(data.error || 'Erro ao fazer upload do arquivo')
      }
    } catch (error) {
      console.error('Erro no upload:', error)
      alert('Erro ao enviar o arquivo. Tente novamente.')
    } finally {
      setIsUploadingMatricula(null)
      if (event.target) event.target.value = ''
    }
  }

  const handleAddItr = () => {
    setForm(prev => ({
      ...prev,
      itrDados: [
        ...(prev.itrDados || []),
        { 
          id: Date.now().toString(36) + Math.random().toString(36).substr(2), 
          numero: '', 
          url: '',
          declaracaoUrl: '',
          reciboUrl: ''
        }
      ]
    }))
  }

  const handleRemoveItr = (id: string) => {
    setForm(prev => ({
      ...prev,
      itrDados: (prev.itrDados || []).filter(m => m.id !== id)
    }))
  }

  const handleItrChange = (id: string, numero: string) => {
    setForm(prev => ({
      ...prev,
      itrDados: (prev.itrDados || []).map(m => 
        m.id === id ? { ...m, numero } : m
      )
    }))
  }

  const handleItrDeclaracaoUpload = async (event: React.ChangeEvent<HTMLInputElement>, id: string) => {
    const file = event.target.files?.[0]
    if (!file) return

    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      alert('Por favor, selecione apenas arquivos PDF.')
      return
    }

    if (file.size > 20 * 1024 * 1024) {
      alert('O arquivo é muito grande. O tamanho máximo permitido é 20MB.')
      return
    }

    setIsUploadingItr(id + '_declaracao')
    try {
      const formData = new FormData()
      formData.append('file', file)

      const response = await fetch(`${API_BASE_URL}/terracontrol/upload-car`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token || localStorage.getItem('impgeo_token')}`
        },
        body: formData
      })

      const data = await response.json()
      if (data.success) {
        setForm(prev => ({
          ...prev,
          itrDados: (prev.itrDados || []).map(m => 
            m.id === id ? { ...m, declaracaoUrl: data.url } : m
          )
        }))
      } else {
        alert(data.error || 'Erro ao fazer upload do arquivo')
      }
    } catch (error) {
      console.error('Erro no upload:', error)
      alert('Erro ao enviar o arquivo. Tente novamente.')
    } finally {
      setIsUploadingItr(null)
      if (event.target) event.target.value = ''
    }
  }

  const handleItrReciboUpload = async (event: React.ChangeEvent<HTMLInputElement>, id: string) => {
    const file = event.target.files?.[0]
    if (!file) return

    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      alert('Por favor, selecione apenas arquivos PDF.')
      return
    }

    if (file.size > 20 * 1024 * 1024) {
      alert('O arquivo é muito grande. O tamanho máximo permitido é 20MB.')
      return
    }

    setIsUploadingItr(id + '_recibo')
    try {
      const formData = new FormData()
      formData.append('file', file)

      const response = await fetch(`${API_BASE_URL}/terracontrol/upload-car`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token || localStorage.getItem('impgeo_token')}`
        },
        body: formData
      })

      const data = await response.json()
      if (data.success) {
        setForm(prev => ({
          ...prev,
          itrDados: (prev.itrDados || []).map(m => 
            m.id === id ? { ...m, reciboUrl: data.url } : m
          )
        }))
      } else {
        alert(data.error || 'Erro ao fazer upload do arquivo')
      }
    } catch (error) {
      console.error('Erro no upload:', error)
      alert('Erro ao enviar o arquivo. Tente novamente.')
    } finally {
      setIsUploadingItr(null)
      if (event.target) event.target.value = ''
    }
  }

  const handleAddCcir = () => {
    setForm(prev => ({
      ...prev,
      ccirDados: [
        ...(prev.ccirDados || []),
        { id: Date.now().toString(36) + Math.random().toString(36).substr(2), numero: '', url: '' }
      ]
    }))
  }

  const handleRemoveCcir = (id: string) => {
    setForm(prev => ({
      ...prev,
      ccirDados: (prev.ccirDados || []).filter(m => m.id !== id)
    }))
  }

  const handleCcirChange = (id: string, numero: string) => {
    setForm(prev => ({
      ...prev,
      ccirDados: (prev.ccirDados || []).map(m => 
        m.id === id ? { ...m, numero } : m
      )
    }))
  }

  const handleCcirFileUpload = async (event: React.ChangeEvent<HTMLInputElement>, id: string) => {
    const file = event.target.files?.[0]
    if (!file) return

    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      alert('Por favor, selecione apenas arquivos PDF.')
      return
    }

    if (file.size > 20 * 1024 * 1024) {
      alert('O arquivo é muito grande. O tamanho máximo permitido é 20MB.')
      return
    }

    setIsUploadingCcir(id)
    try {
      const formData = new FormData()
      formData.append('file', file)

      const response = await fetch(`${API_BASE_URL}/terracontrol/upload-car`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token || localStorage.getItem('impgeo_token')}`
        },
        body: formData
      })

      const data = await response.json()
      if (data.success) {
        setForm(prev => ({
          ...prev,
          ccirDados: (prev.ccirDados || []).map(m => 
            m.id === id ? { ...m, url: data.url } : m
          )
        }))
      } else {
        alert(data.error || 'Erro ao fazer upload do arquivo')
      }
    } catch (error) {
      console.error('Erro no upload:', error)
      alert('Erro ao enviar o arquivo. Tente novamente.')
    } finally {
      setIsUploadingCcir(null)
      if (event.target) event.target.value = ''
    }
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
      const recordData = {
        codImovel: form.codImovel || 0,
        imovel: form.imovel || '',
        municipio: form.municipio || '',
        mapaUrl: form.mapaUrl || '',
        matriculas: (form.matriculasDados || []).map(m => m.numero.trim()).filter(n => n.length > 0).join(', '),
        matriculasDados: form.matriculasDados || [],
        nIncraCcir: form.nIncraCcir || '',
        car: form.car || '',
        carUrl: form.carUrl || '',
        statusCar: form.statusCar || 'ATIVO - AGUARDANDO ANÁLISE SC',
        itr: (form.itrDados || []).map(m => m.numero.trim()).filter(n => n.length > 0).join(', '),
        itrDados: form.itrDados || [],
        ccir: (form.ccirDados || []).map(m => m.numero.trim()).filter(n => n.length > 0).join(', '),
        ccirDados: form.ccirDados || [],
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
        const response = await fetch(`${API_BASE_URL}/terracontrol/${editing.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(recordData)
        })
        
        if (!response.ok) {
          const errorText = await response.text()
          throw new Error(errorText || `Erro HTTP: ${response.status}`)
        }
        
        const result = await response.json()
        if (result.success) {
          const normalizedUpdated = normalizeRecord(result.data)
          const updated = records.map(a => a.id === editing.id ? { ...normalizedUpdated, id: editing.id } : a)
          // setRecords dispara o useEffect [searchTerm, records] que atualiza filteredRecords
          setRecords(updated)
          setIsModalOpen(false)
          setEditing(null)
          setFormErrors({})
        } else {
          alert('Erro ao atualizar record: ' + (result.error || 'Erro desconhecido'))
        }
      } else {
        // Criar novo
        const response = await fetch(`${API_BASE_URL}/terracontrol`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(recordData)
        })

        if (!response.ok) {
          const errorText = await response.text()
          throw new Error(errorText || `Erro HTTP: ${response.status}`)
        }

        const result = await response.json()
        if (result.success) {
          const updated = [...records, normalizeRecord(result.data)]
          // setRecords dispara o useEffect [searchTerm, records] que atualiza filteredRecords
          setRecords(updated)
          setIsModalOpen(false)
          setEditing(null)
          setFormErrors({})
        } else {
          alert('Erro ao criar record: ' + (result.error || 'Erro desconhecido'))
        }
      }
    } catch (error: any) {
      console.error('Erro ao salvar record:', error)
      const errorMessage = error?.message || error?.toString() || 'Erro desconhecido ao salvar record'
      alert(`Erro ao salvar record: ${errorMessage}`)
    }
  }

  const handleDelete = async (id: string) => {
    if (window.confirm('Tem certeza que deseja excluir este record?')) {
      try {
        const response = await fetch(`${API_BASE_URL}/terracontrol/${id}`, {
          method: 'DELETE'
        })
        const result = await response.json()
        if (result.success) {
          setRecords(records.filter(a => a.id !== id))
          setFilteredRecords(filteredRecords.filter(a => a.id !== id))
        } else {
          alert('Erro ao excluir record: ' + result.error)
        }
      } catch (error) {
        console.error('Erro ao excluir record:', error)
        alert('Erro ao excluir record')
      }
    }
  }

  const handleDownloadAllZipped = async (recordId: string, matriculasDados: MatriculaItem[], imovelName: string) => {
    const matriculasComUrl = (matriculasDados || []).filter(m => m.url)
    if (matriculasComUrl.length === 0) return

    setIsDownloadingZip(recordId)
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
      setIsDownloadingZip(prev => prev === recordId ? null : prev)
    }
  }

  const handleDownloadAllItrZipped = async (recordId: string, itrDados: ItrItem[], imovelName: string) => {
    const itrsComDocumentos = (itrDados || []).filter(m => m.declaracaoUrl || m.reciboUrl || m.url)
    if (itrsComDocumentos.length === 0) return

    setIsDownloadingZip(recordId + 'itr')
    try {
      const zip = new JSZip()
      
      const downloadPromises: Promise<void>[] = []
      
      itrsComDocumentos.forEach((item) => {
        const safeNumero = item.numero.replace(/[^a-z0-9]/gi, '_').toLowerCase()
        
        // Declaração (ou URL legada)
        const declUrl = item.declaracaoUrl || item.url
        if (declUrl) {
          downloadPromises.push((async () => {
            try {
              const res = await fetch(declUrl)
              const blob = await res.blob()
              zip.file(`Itr_${safeNumero}_Declaracao.pdf`, blob)
            } catch (e) {
              console.error(`Erro ao baixar declaração ITR ${item.numero}:`, e)
            }
          })())
        }
        
        // Recibo
        if (item.reciboUrl) {
          downloadPromises.push((async () => {
            try {
              const res = await fetch(item.reciboUrl!)
              const blob = await res.blob()
              zip.file(`Itr_${safeNumero}_Recibo.pdf`, blob)
            } catch (e) {
              console.error(`Erro ao baixar recibo ITR ${item.numero}:`, e)
            }
          })())
        }
      })

      await Promise.all(downloadPromises)
      
      const content = await zip.generateAsync({ type: 'blob' })
      const safeImovel = getSafeImovelName(imovelName)
      saveAs(content, `ITRs_${safeImovel}.zip`)
    } catch (error) {
      console.error('Erro geral ao zipar arquivos ITR:', error)
      alert('Erro ao tentar compactar os ITRs.')
    } finally {
      setIsDownloadingZip(prev => prev === recordId + 'itr' ? null : prev)
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

  const handleDownloadAllCcirZipped = async (recordId: string, ccirDados: CcirItem[], imovelName: string) => {
    const ccirsComUrl = (ccirDados || []).filter(m => m.url)
    if (ccirsComUrl.length === 0) return

    setIsDownloadingZip(recordId + 'ccir')
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
      setIsDownloadingZip(prev => prev === recordId + 'ccir' ? null : prev)
    }
  }

  const handleDownloadRegistroZip = async (acomp: TerraControlRecord) => {
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

      // 3. ITR (Todos em pasta "Itr")
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

      // 4. CCIR (Todos em pasta "Ccir")
      if (ccirComUrl.length > 0) {
        const ccirPromises = ccirComUrl.map(async (item) => {
          try {
            const response = await fetch(item.url!)
            const blob = await response.blob()
            const safeName = item.numero.replace(/[^a-z0-9]/gi, '_').toLowerCase()
            zip.folder('Ccir')?.file(`Ccir_${safeName}.pdf`, blob)
          } catch (e) {
            console.error(`Erro ao baixar ccir ${item.numero}:`, e)
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

  const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) {
      setSelectedItems(new Set(sortedRecords.map(a => a.id)))
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
    return (num || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
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

    records.forEach(acomp => {
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
    
    if (isImporting) return

    const formData = new FormData()
    formData.append('file', file)
    formData.append('type', 'terracontrol')

    setIsImporting(true)
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
          const updated = [...records, ...normalizeRecords(data.data)]
          setRecords(updated)
          setFilteredRecords(updated)
          alert(`${data.data.length} records importados com sucesso!`)
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
        setIsImporting(false)
        if (fileInputRef.current) fileInputRef.current.value = ''
      })
  }

  const downloadModel = () => {
    window.open(`${API_BASE_URL}/modelo/terracontrol`, '_blank')
  }

  const handleExportSelected = async () => {
    const selectedIds = new Set(Array.from(selectedItems).map((id) => String(id)))
    const selectedRows = records.filter((item) => selectedIds.has(String(item.id)))

    if (selectedRows.length === 0) {
      setIsShareSelectionWarningOpen(true)
      return
    }

    try {
      const response = await fetch(`${API_BASE_URL}/export`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          type: 'terracontrol',
          data: selectedRows
        })
      })

      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(errorText || 'Falha ao exportar registros selecionados')
      }

      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const link = document.createElement('a')
      const today = new Date().toISOString().split('T')[0]
      link.href = url
      link.download = `terracontrol_${today}.xlsx`
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.URL.revokeObjectURL(url)
    } catch (error: any) {
      console.error('Erro ao exportar TerraControl selecionados:', error)
      alert('Erro ao exportar registros selecionados: ' + (error.message || 'Tente novamente'))
    }
  }

  const generateShareLink = async () => {
    if (!user) {
      alert('Você precisa estar autenticado para gerar um link compartilhável')
      return
    }

    if (selectedItems.size === 0) {
      setIsShareSelectionWarningOpen(true)
      return
    }

    setShareModalMode('create')
    await openShareLinkManager()
  }

  const openShareLinkManager = async () => {
    if (!user) {
      alert('Você precisa estar autenticado para gerenciar links compartilháveis')
      return
    }

    // Abrir modal de gerenciamento
    await loadShareLinks()
    setIsShareModalOpen(true)
  }

  const openManageShareLinks = async () => {
    setShareModalMode('manage')
    await openShareLinkManager()
  }

  const loadShareLinks = async () => {
    if (!user) return
    
    try {
      const response = await fetch(`${API_BASE_URL}/terracontrol/share-links`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })
      const result = await response.json()
      if (result.success) {
        setShareLinks(result.data || [])
      }
    } catch (error) {
      console.error('Erro ao carregar links compartilháveis:', error)
    }
  }

  const createNewShareLink = async () => {
    if (!user) return
    const selectedIds = Array.from(selectedItems)

    if (selectedIds.length === 0) {
      setIsShareSelectionWarningOpen(true)
      return
    }

    try {
      // Primeiro, recarregar os dados do servidor (sem sobrescrever o filtro de busca ativo)
      const refreshResponse = await fetch(`${API_BASE_URL}/terracontrol`)
      if (refreshResponse.ok) {
        const refreshResult = await refreshResponse.json()
        if (refreshResult.success && refreshResult.data) {
          const normalized = normalizeRecords(refreshResult.data)
          setRecords(normalized)
          // Reaplicar o searchTerm atual ao invés de sobrescrever filteredRecords
          if (searchTerm) {
            const lower = searchTerm.toLowerCase()
            setFilteredRecords(normalized.filter(acomp =>
              (acomp.imovel || '').toLowerCase().includes(lower) ||
              (acomp.municipio || '').toLowerCase().includes(lower) ||
              String(acomp.codImovel ?? '').includes(searchTerm)
            ))
          } else {
            setFilteredRecords(normalized)
          }
        }
      }

      const response = await fetch(`${API_BASE_URL}/terracontrol/generate-share-link`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          name: shareLinkName.trim() || undefined,
          expiresAt: newLinkExpiresAt || undefined,
          password: newLinkPassword.trim() || undefined,
          selectedIds
        })
      })
      
      const result = await response.json()
      if (result.success) {
        setShareLinkName('')
        setNewLinkExpiresAt('')
        setNewLinkPassword('')
        await loadShareLinks()
        const fullLink = `${window.location.origin}/v/${result.token}`
        setShareLink(fullLink)
        setLinkCopied(false)
      } else {
        alert('Erro ao gerar link: ' + (result.error || result.message || 'Erro desconhecido'))
      }
    } catch (error: any) {
      console.error('Erro ao gerar link:', error)
      alert('Erro ao gerar link compartilhável: ' + (error.message || 'Verifique sua conexão e tente novamente'))
    }
  }

  const updateShareLinkName = async (linkToken: string, newName: string, newExpiresAt: string, newPassword: string) => {
    if (!user) return

    try {
      const body: any = {
        name: newName.trim() || null,
        expiresAt: newExpiresAt || null
      }
      
      // Sempre enviar password quando estiver editando
      // Se vazio, remove a senha; se tiver conteúdo, atualiza
      body.password = newPassword || null
      
      const response = await fetch(`${API_BASE_URL}/terracontrol/share-links/${linkToken}`, {
        method: 'PUT',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(body)
      })
      
      const result = await response.json()
      if (result.success) {
        await loadShareLinks()
        setEditingLinkToken(null)
        setEditingLinkName('')
        setEditingLinkExpiresAt('')
        setEditingLinkPassword('')
      } else {
        alert('Erro ao atualizar link: ' + (result.error || result.message || 'Erro desconhecido'))
      }
    } catch (error: any) {
      console.error('Erro ao atualizar link:', error)
      alert('Erro ao atualizar link: ' + (error.message || 'Verifique sua conexão e tente novamente'))
    }
  }

  const regenerateShareLinkToken = async (oldToken: string, name: string | null, expiresAt: string | null) => {
    if (!user) return

    if (!window.confirm('Tem certeza que deseja regenerar o token deste link? O link antigo deixará de funcionar.')) {
      return
    }

    try {
      const response = await fetch(`${API_BASE_URL}/terracontrol/share-links/${oldToken}`, {
        method: 'PUT',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          regenerateToken: true,
          name: name || undefined,
          expiresAt: expiresAt || undefined,
          // Não enviar senha na regeneração, manter a existente
        })
      })
      
      const result = await response.json()
      if (result.success) {
        await loadShareLinks()
        const fullLink = `${window.location.origin}/v/${result.token}`
        setShareLink(fullLink)
        setLinkCopied(false)
      } else {
        alert('Erro ao regenerar token: ' + (result.error || result.message || 'Erro desconhecido'))
      }
    } catch (error: any) {
      console.error('Erro ao regenerar token:', error)
      alert('Erro ao regenerar token: ' + (error.message || 'Verifique sua conexão e tente novamente'))
    }
  }

  const deleteShareLink = async (tokenToDelete: string) => {
    if (!user) return

    if (!window.confirm('Tem certeza que deseja excluir este link compartilhável?')) {
      return
    }

    try {
      const response = await fetch(`${API_BASE_URL}/terracontrol/share-links/${tokenToDelete}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })
      
      const result = await response.json()
      if (result.success) {
        await loadShareLinks()
        if (shareLink.includes(tokenToDelete)) {
          setShareLink('')
        }
      } else {
        alert('Erro ao excluir link: ' + (result.error || result.message || 'Erro desconhecido'))
      }
    } catch (error: any) {
      console.error('Erro ao excluir link:', error)
      alert('Erro ao excluir link: ' + (error.message || 'Verifique sua conexão e tente novamente'))
    }
  }

  const formatDate = (dateString: string) => {
    if (!dateString) return '—'
    const date = new Date(dateString)
    if (isNaN(date.getTime())) return '—'
    return date.toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  const copyToClipboard = () => {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(shareLink).then(() => {
        setLinkCopied(true)
        setTimeout(() => setLinkCopied(false), 2000)
      }).catch(() => {
        // Fallback para navegadores sem suporte à Clipboard API
        const el = document.createElement('textarea')
        el.value = shareLink
        el.setAttribute('readonly', '')
        el.style.position = 'absolute'
        el.style.left = '-9999px'
        document.body.appendChild(el)
        el.select()
        document.execCommand('copy')
        document.body.removeChild(el)
        setLinkCopied(true)
        setTimeout(() => setLinkCopied(false), 2000)
      })
    } else {
      // Fallback direto para contextos sem Clipboard API
      const el = document.createElement('textarea')
      el.value = shareLink
      el.setAttribute('readonly', '')
      el.style.position = 'absolute'
      el.style.left = '-9999px'
      document.body.appendChild(el)
      el.select()
      document.execCommand('copy')
      document.body.removeChild(el)
      setLinkCopied(true)
      setTimeout(() => setLinkCopied(false), 2000)
    }
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

  // Funções para gerar dados de cada gráfico
  const getTotalImoveisData = () => {
    const byMunicipio = records.reduce((acc, acomp) => {
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
    const byMunicipio = records.reduce((acc, acomp) => {
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
    const sim = records.filter(a => a.geoCertificacao === 'SIM').length
    const nao = records.filter(a => a.geoCertificacao === 'NÃO').length
    return [
      { name: 'SIM', value: sim, color: '#22c55e' },
      { name: 'NÃO', value: nao, color: '#ef4444' }
    ]
  }

  const getGeoRegistroData = () => {
    const sim = records.filter(a => a.geoRegistro === 'SIM').length
    const nao = records.filter(a => a.geoRegistro === 'NÃO').length
    return [
      { name: 'SIM', value: sim, color: '#22c55e' },
      { name: 'NÃO', value: nao, color: '#ef4444' }
    ]
  }

  const getCulturaData = (tipo: string) => {
    const data = records.map(acomp => {
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
    const data = records
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
    const data = records
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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 shadow-md shadow-blue-500/25">
            <ClipboardCheck className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">TerraControl</h1>
            <p className="text-gray-500 dark:text-gray-400 text-sm">Plataforma de gestão territorial</p>
          </div>
        </div>
        <div className="flex w-full sm:w-auto flex-wrap gap-2 overflow-x-auto md:overflow-visible scrollbar-hide">
          <button
            onClick={generateShareLink}
            className="h-10 w-full sm:w-auto flex-shrink-0 whitespace-nowrap flex items-center justify-center gap-2 px-4 py-2 text-sm bg-gradient-to-r from-green-500 to-emerald-600 text-white font-semibold rounded-xl hover:from-green-600 hover:to-emerald-700 shadow-md shadow-green-500/25 hover:-translate-y-0.5 transition-all duration-200"
          >
            <Share2 className="h-4 w-4" />
            Gerar Link
          </button>
          <button
            onClick={openManageShareLinks}
            className="h-10 w-full sm:w-auto flex-shrink-0 whitespace-nowrap flex items-center justify-center gap-2 px-4 py-2 text-sm bg-white dark:!bg-[#243040] border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 font-semibold rounded-xl hover:bg-gray-50 dark:hover:bg-gray-700 hover:border-blue-300 dark:hover:border-blue-600 shadow-sm hover:-translate-y-0.5 transition-all duration-200"
          >
            <ExternalLink className="h-4 w-4" />
            Gerenciar Links
          </button>
          <button
            onClick={() => setIsImportModalOpen(true)}
            className="h-10 w-full sm:w-auto flex-shrink-0 whitespace-nowrap flex items-center justify-center gap-2 px-4 py-2 text-sm bg-white dark:!bg-[#243040] border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 font-semibold rounded-xl hover:bg-gray-50 dark:hover:bg-gray-700 hover:border-blue-300 dark:hover:border-blue-600 shadow-sm hover:-translate-y-0.5 transition-all duration-200"
          >
            <Upload className="h-4 w-4" />
            Importar/Exportar
          </button>
          <button
            onClick={handleNew}
            className="h-10 w-full sm:w-auto flex-shrink-0 whitespace-nowrap flex items-center justify-center gap-2 px-4 py-2 text-sm bg-gradient-to-r from-blue-500 to-indigo-600 text-white font-semibold rounded-xl hover:from-blue-600 hover:to-indigo-700 shadow-md shadow-blue-500/25 hover:-translate-y-0.5 transition-all duration-200"
          >
            <Plus className="h-4 w-4" />
            Novo
          </button>
        </div>
      </div>

      {/* Estatísticas */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div 
          className="bg-white dark:!bg-[#243040] rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-4 cursor-pointer hover:shadow-md hover:-translate-y-0.5 hover:border-blue-200 dark:hover:border-blue-700 transition-all duration-200"
          onClick={() => openChart('Distribuição de Imóveis', 'Total de imóveis por município', getTotalImoveisData(), { valueFormat: 'number', valueUnit: '' })}
        >
          <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">Total de Imóveis</p>
          <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{records.length}</p>
        </div>
        <div 
          className="bg-white dark:!bg-[#243040] rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-4 cursor-pointer hover:shadow-md hover:-translate-y-0.5 hover:border-blue-200 dark:hover:border-blue-700 transition-all duration-200"
          onClick={() => openChart('Distribuição de Área Total', 'Área total por município (ha)', getAreaTotalData())}
        >
          <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">Área Total</p>
          <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">
            {formatNumber(records.reduce((sum, a) => sum + a.areaTotal, 0))} ha
          </p>
        </div>
        <div 
          className="bg-white dark:!bg-[#243040] rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-4 cursor-pointer hover:shadow-md hover:-translate-y-0.5 hover:border-blue-200 dark:hover:border-blue-700 transition-all duration-200"
          onClick={() => openChart('Geo Certificação', 'Distribuição de imóveis com e sem geo certificação', getGeoCertificacaoData(), { valueFormat: 'number', valueUnit: '' })}
        >
          <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">Com Geo Certificação</p>
          <p className="text-2xl font-bold text-green-600">
            {records.filter(a => a.geoCertificacao === 'SIM').length}
          </p>
        </div>
        <div 
          className="bg-white dark:!bg-[#243040] rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-4 cursor-pointer hover:shadow-md hover:-translate-y-0.5 hover:border-blue-200 dark:hover:border-blue-700 transition-all duration-200"
          onClick={() => openChart('Geo Registro', 'Distribuição de imóveis com e sem geo registro', getGeoRegistroData(), { valueFormat: 'number', valueUnit: '' })}
        >
          <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">Com Geo Registro</p>
          <p className="text-2xl font-bold text-green-600">
            {records.filter(a => a.geoRegistro === 'SIM').length}
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

      {/* Estatísticas de APP e Reserva Legal */}
      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4">
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
            {formatNumber(records.reduce((sum, a) => sum + (a.appCodigoFlorestal || 0), 0))} ha
          </p>
        </div>
        <div 
          className="bg-white dark:!bg-[#243040] rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-4 cursor-pointer hover:shadow-md hover:-translate-y-0.5 hover:border-blue-200 dark:hover:border-blue-700 transition-all duration-200"
          onClick={() => openChart('APP Vegetada', 'Distribuição de área por imóvel (ha)', getAPPData('appVegetada'))}
        >
          <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">APP Vegetada</p>
          <p className="text-2xl font-bold text-green-600">
            {formatNumber(records.reduce((sum, a) => sum + (a.appVegetada || 0), 0))} ha
          </p>
        </div>
        <div 
          className="bg-white dark:!bg-[#243040] rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-4 cursor-pointer hover:shadow-md hover:-translate-y-0.5 hover:border-blue-200 dark:hover:border-blue-700 transition-all duration-200"
          onClick={() => openChart('APP Não Vegetada', 'Distribuição de área por imóvel (ha)', getAPPData('appNaoVegetada'))}
        >
          <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">APP Não Vegetada</p>
          <p className="text-2xl font-bold text-orange-600">
            {formatNumber(records.reduce((sum, a) => sum + (a.appNaoVegetada || 0), 0))} ha
          </p>
        </div>
        <div
          className="bg-white dark:!bg-[#243040] rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-4 cursor-pointer hover:shadow-md hover:-translate-y-0.5 hover:border-blue-200 dark:hover:border-blue-700 transition-all duration-200"
          onClick={() => openChart('20% Reserva Legal', 'Distribuição de área por imóvel (ha)', getReservaLegalData())}
        >
          <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">20% Reserva Legal</p>
          <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">
            {formatNumber(records.reduce((sum, a) => sum + (a.reservaLegal || 0), 0))} ha
          </p>
        </div>
      </div>

      {/* Busca + Ordenação + Seleção */}
      <div className="flex flex-col sm:flex-row gap-2 bg-white dark:!bg-[#243040] rounded-2xl border border-gray-200 dark:border-gray-700 px-4 py-3 shadow-sm">
        <div className="flex items-center gap-2 shrink-0">
          <input
            type="checkbox"
            onChange={handleSelectAll}
            checked={sortedRecords.length > 0 && sortedRecords.every(a => selectedItems.has(a.id))}
            title="Selecionar todos"
            className="rounded border-gray-300 dark:border-gray-600"
          />
          {selectedItems.size > 0 && (
            <span className="text-xs font-semibold text-blue-600 dark:text-blue-400 whitespace-nowrap">
              {selectedItems.size} selecionado{selectedItems.size !== 1 ? 's' : ''}
            </span>
          )}
        </div>
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
            Mostrando {sortedRecords.length}/{records.length} Resultados
          </span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <div className="hidden sm:block w-px h-5 bg-gray-200 dark:bg-gray-600" />
          <div className="flex items-center gap-1.5 bg-gray-50 dark:!bg-[#1e2d3e] border border-gray-200 dark:border-gray-600 rounded-xl px-3 py-1.5">
            <span className="text-xs font-semibold text-gray-400 dark:text-gray-500 whitespace-nowrap uppercase tracking-wide">Ordenar</span>
            <select
              id="sort-select-acomp"
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
        {isLoadingRecords ? (
          <div className="bg-white dark:!bg-[#243040] rounded-2xl border border-gray-200 dark:border-gray-700 p-12 text-center">
            <Loader2 className="h-10 w-10 text-blue-500 mx-auto mb-3 animate-spin" />
            <p className="text-gray-500 dark:text-gray-400 font-medium">Carregando registros...</p>
          </div>
        ) : loadError ? (
          <div className="bg-red-50 dark:bg-red-900/20 rounded-2xl border-2 border-dashed border-red-200 dark:border-red-800 p-12 text-center">
            <X className="h-10 w-10 text-red-400 mx-auto mb-3" />
            <p className="text-red-600 dark:text-red-400 font-semibold mb-1">Não foi possível carregar os registros</p>
            <p className="text-red-500 dark:text-red-400 text-sm">{loadError}</p>
          </div>
        ) : sortedRecords.length === 0 ? (
          <div className="bg-white dark:!bg-[#243040] rounded-2xl border-2 border-dashed border-gray-200 dark:border-gray-700 p-12 text-center">
            <ClipboardCheck className="h-10 w-10 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500 dark:text-gray-400 font-medium">
              {searchTerm ? `Nenhum resultado para "${searchTerm}"` : 'Nenhum registro cadastrado.'}
            </p>
          </div>
        ) : sortedRecords.map((acomp) => {
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
            <div key={acomp.id} className={`bg-white dark:!bg-[#243040] rounded-2xl shadow-md border overflow-hidden hover:shadow-lg transition-shadow duration-200 ${selectedItems.has(acomp.id) ? 'border-blue-400 dark:border-blue-500' : 'border-gray-200 dark:border-gray-700'}`}>

              {/* ── HEADER ───────────────────────────────── */}
              <div className="bg-gradient-to-r from-blue-500 to-indigo-600 px-4 py-3 flex items-center gap-3">
                <input
                  type="checkbox"
                  checked={selectedItems.has(acomp.id)}
                  onChange={() => handleSelectItem(acomp.id)}
                  className="rounded border-white/40 bg-white/20 text-blue-600 shrink-0"
                  title="Selecionar registro"
                />
                <div className="flex items-center gap-2.5 min-w-0 flex-1">
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
                      aria-label={`Ver mapa de ${acomp.imovel}`}
                      className="p-1.5 bg-white/20 hover:bg-white/35 rounded-lg transition-colors"
                    >
                      <MapIcon className="w-4 h-4 text-white" aria-hidden="true" />
                    </button>
                  )}
                  <button
                    onClick={() => handleDownloadRegistroZip(acomp)}
                    disabled={!hasDocs || isDownloadingRecordZip === acomp.id}
                    title={hasDocs ? 'Baixar todos os documentos (ZIP)' : 'Nenhum documento disponível'}
                    aria-label={hasDocs ? `Baixar documentos de ${acomp.imovel}` : 'Sem documentos'}
                    className={`p-1.5 rounded-lg transition-colors ${hasDocs ? 'bg-white/20 hover:bg-white/35' : 'bg-white/10 opacity-40 cursor-not-allowed'}`}
                  >
                    {isDownloadingRecordZip === acomp.id
                      ? <Loader2 className="w-4 h-4 text-white animate-spin" />
                      : <Archive className="w-4 h-4 text-white" />
                    }
                  </button>
                  <button
                    onClick={() => handleEdit(acomp)}
                    title="Editar"
                    aria-label={`Editar ${acomp.imovel}`}
                    className="p-1.5 bg-white/20 hover:bg-white/35 rounded-lg transition-colors"
                  >
                    <Edit className="w-4 h-4 text-white" />
                  </button>
                  <button
                    onClick={() => handleDelete(acomp.id)}
                    title="Excluir"
                    aria-label={`Excluir ${acomp.imovel}`}
                    className="p-1.5 bg-white/10 hover:bg-red-500/60 rounded-lg transition-colors"
                  >
                    <Trash2 className="w-4 h-4 text-white" />
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
                      )) : <span className="text-xs text-gray-400">{acomp.matriculas || '—'}</span>}
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
                    <ClipboardCheck className="w-3.5 h-3.5" /> Georreferenciamento
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

      {/* Modal de Edição/Criação */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false)
          setEditing(null)
          setFormErrors({})
        }}
      >
        <div className="bg-white dark:!bg-[#243040] rounded-lg shadow-xl max-w-6xl w-full max-h-[90vh] overflow-y-auto m-4">
            <div className="p-6">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                  {editing ? 'Editar TerraControlRecord' : 'Novo TerraControlRecord'}
                </h2>
                <button
                  type="button"
                  onClick={() => {
                    setIsModalOpen(false)
                    setEditing(null)
                    setFormErrors({})
                  }}
                  className="text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300 text-2xl"
                  aria-label="Fechar modal"
                >
                  ✕
                </button>
              </div>

              <div className="space-y-6">
                {/* Informações Básicas */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Código do Imóvel
                    </label>
                    <input
                      type="text"
                      value={form.codImovel ? String(form.codImovel).padStart(3, '0') : 'Automático'}
                      readOnly
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg bg-gray-50 text-gray-500 cursor-not-allowed"
                    />
                    <p className="text-gray-400 text-[10px] mt-1 italic">Gerado automaticamente pelo sistema</p>
                  </div>

                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Nome do Imóvel *
                    </label>
                    <input
                      type="text"
                      value={form.imovel || ''}
                      onChange={(e) => setForm(prev => ({ ...prev, imovel: e.target.value }))}
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
                      onChange={(e) => setForm(prev => ({ ...prev, municipio: e.target.value }))}
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
                      onChange={(e) => setForm(prev => ({ ...prev, mapaUrl: e.target.value }))}
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
                    <div className="md:col-span-2">
                       <div className="flex justify-between items-center mb-2">
                        <label className="block text-sm font-medium text-gray-700">
                          Matrículas
                        </label>
                        <button
                          type="button"
                          onClick={handleAddMatricula}
                          className="text-xs flex items-center gap-1 text-blue-600 hover:text-blue-800 font-medium"
                        >
                          <Plus className="w-3 h-3" /> Nova Matrícula
                        </button>
                      </div>
                      
                      <div className="space-y-3">
                        {form.matriculasDados?.map((matricula) => (
                          <div key={matricula.id} className="flex gap-2 items-start bg-gray-50 p-3 rounded-lg border border-gray-100 relative">
                            <div className="flex-1">
                              <input
                                type="text"
                                value={matricula.numero}
                                onChange={(e) => handleMatriculaChange(matricula.id, e.target.value)}
                                placeholder="Número da Matrícula"
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm"
                              />
                            </div>
                            
                            <div className="flex gap-2">
                              <input 
                                type="file" 
                                id={`matFile-${matricula.id}`}
                                accept=".pdf,application/pdf"
                                className="hidden"
                                onChange={(e) => handleMatriculaFileUpload(e, matricula.id)}
                              />
                              <button
                                type="button"
                                onClick={() => document.getElementById(`matFile-${matricula.id}`)?.click()}
                                className={`px-3 py-2 border rounded-lg flex items-center justify-center transition-colors ${matricula.url ? 'bg-green-50 text-green-600 border-green-200 hover:bg-green-100' : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-100'}`}
                                title={matricula.url ? "Documento anexado. Clique para alterar" : "Anexar PDF da Matrícula"}
                              >
                                {isUploadingMatricula === matricula.id ? (
                                  <RefreshCw className="w-4 h-4 animate-spin" />
                                ) : (
                                  <Upload className="w-4 h-4" />
                                )}
                              </button>
                              
                              <button
                                type="button"
                                onClick={() => handleRemoveMatricula(matricula.id)}
                                className="px-3 py-2 border border-red-200 text-red-500 rounded-lg hover:bg-red-50 transition-colors bg-white"
                                title="Remover Matrícula"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                            
                            {matricula.url && (
                              <div className="absolute -bottom-2 left-3 bg-white px-2 flex items-center gap-1 text-[10px] text-green-600 border border-green-100 rounded-full shadow-sm">
                                <Check className="w-3 h-3" /> PDF
                                <a href={matricula.url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline ml-1 inline-flex items-center">
                                  Ver <ExternalLink className="w-2 h-2 ml-[2px]" />
                                </a>
                                <button
                                  type="button"
                                  onClick={() => setForm(prev => ({
                                    ...prev,
                                    matriculasDados: (prev.matriculasDados || []).map(m => m.id === matricula.id ? { ...m, url: undefined } : m)
                                  }))}
                                  className="ml-1 text-red-500 hover:text-red-700 transition-colors"
                                  title="Remover PDF"
                                >
                                  <X className="w-2.5 h-2.5" />
                                </button>
                              </div>
                            )}
                          </div>
                        ))}
                        
                        {(!form.matriculasDados || form.matriculasDados.length === 0) && (
                          <div className="text-center py-4 bg-gray-50 border border-dashed border-gray-300 rounded-lg">
                            <p className="text-sm text-gray-500 mb-2">Nenhuma matrícula adicionada</p>
                            <button
                              type="button"
                              onClick={handleAddMatricula}
                              className="inline-flex items-center gap-1 text-sm text-blue-600 hover:text-blue-800 font-medium"
                            >
                              <Plus className="w-4 h-4" /> Adicionar Matrícula
                            </button>
                          </div>
                        )}
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        N INCRA / CCIR (Cadastro de Imóvel Rural)
                      </label>
                      <div className="space-y-2">
                        {form.ccirDados?.map((ccir) => (
                          <div key={ccir.id} className="flex flex-col gap-1 p-3 bg-gray-50 rounded-lg border border-gray-200">
                            <div className="flex gap-2 relative">
                              <input
                                type="text"
                                value={ccir.numero}
                                onChange={(e) => handleCcirChange(ccir.id, e.target.value)}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                                placeholder="Número do CCIR"
                              />
                              <input 
                                type="file" 
                                id={`ccirFile-${ccir.id}`}
                                accept=".pdf,application/pdf"
                                className="hidden"
                                onChange={(e) => handleCcirFileUpload(e, ccir.id)}
                              />
                              <button
                                type="button"
                                onClick={() => document.getElementById(`ccirFile-${ccir.id}`)?.click()}
                                className={`px-3 py-2 border rounded-lg flex items-center justify-center transition-colors ${ccir.url ? 'bg-green-50 text-green-600 border-green-200 hover:bg-green-100' : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'}`}
                                title={ccir.url ? "PDF anexado. Clique para alterar" : "Anexar PDF da CCIR"}
                              >
                                {isUploadingCcir === ccir.id ? (
                                  <RefreshCw className="w-5 h-5 animate-spin" />
                                ) : (
                                  <Upload className="w-5 h-5" />
                                )}
                              </button>
                              <button
                                type="button"
                                onClick={() => handleRemoveCcir(ccir.id)}
                                className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors border border-transparent hover:border-red-100"
                                title="Remover CCIR"
                              >
                                <Trash2 className="w-5 h-5" />
                              </button>
                            </div>
                            {ccir.url && (
                              <div className="flex items-center gap-2 text-xs text-green-600 px-1 mt-1">
                                <Check className="w-3 h-3" />
                                <span>PDF Anexado</span>
                                <a href={ccir.url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline inline-flex items-center ml-2 font-medium">
                                  <ExternalLink className="w-3 h-3 mr-1" />
                                  Ver documento
                                </a>
                                <button
                                  type="button"
                                  onClick={() => setForm(prev => ({
                                    ...prev,
                                    ccirDados: (prev.ccirDados || []).map(c => c.id === ccir.id ? { ...c, url: undefined } : c)
                                  }))}
                                  className="ml-1 text-red-500 hover:text-red-700 transition-colors p-0.5 rounded-full hover:bg-red-50"
                                  title="Remover PDF"
                                >
                                  <X className="w-3 h-3" />
                                </button>
                              </div>
                            )}
                          </div>
                        ))}

                        <button
                          type="button"
                          onClick={handleAddCcir}
                          className="inline-flex items-center gap-2 px-3 py-1.5 text-sm bg-blue-50 text-blue-600 hover:bg-blue-100 rounded-lg transition-colors font-medium border border-blue-100"
                        >
                          <Plus className="w-4 h-4" /> Novo CCIR
                        </button>

                        {(!form.ccirDados || form.ccirDados.length === 0) && (
                          <div className="p-4 border-2 border-dashed border-gray-200 rounded-lg text-center bg-gray-50 bg-opacity-50">
                            <p className="text-sm text-gray-500 mb-2">Nenhum CCIR adicionado</p>
                            <button
                              type="button"
                              onClick={handleAddCcir}
                              className="inline-flex items-center gap-1 text-sm text-blue-600 hover:text-blue-800 font-medium"
                            >
                              <Plus className="w-4 h-4" /> Adicionar CCIR
                            </button>
                          </div>
                        )}
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        CAR (Cadastro Ambiental Rural)
                      </label>
                      <div className="flex gap-2 relative">
                        <input
                          type="text"
                          value={form.car || ''}
                          onChange={(e) => setForm(prev => ({ ...prev, car: e.target.value }))}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                          placeholder="Número do CAR"
                        />
                        <input 
                          type="file" 
                          id="carFile"
                          accept=".pdf,application/pdf"
                          className="hidden"
                          onChange={handleCarFileUpload}
                        />
                        <button
                          type="button"
                          onClick={() => document.getElementById('carFile')?.click()}
                          className={`px-3 py-2 border rounded-lg flex items-center justify-center transition-colors ${form.carUrl ? 'bg-green-50 text-green-600 border-green-200 hover:bg-green-100' : 'bg-gray-50 text-gray-600 border-gray-300 hover:bg-gray-100'}`}
                          title={form.carUrl ? "Documento anexado. Clique para alterar" : "Anexar PDF do CAR"}
                        >
                          {isUploadingCar ? (
                            <RefreshCw className="w-5 h-5 animate-spin" />
                          ) : (
                            <Upload className="w-5 h-5" />
                          )}
                        </button>
                      </div>
                      {form.carUrl && (
                        <div className="mt-1 flex items-center gap-2 text-xs text-green-600">
                          <Check className="w-3 h-3" />
                          <span>PDF Anexado</span>
                          <a href={form.carUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline inline-flex items-center ml-2">
                            <ExternalLink className="w-3 h-3 mr-1" />
                            Ver atual
                          </a>
                          <button
                            type="button"
                            onClick={() => setForm({ ...form, carUrl: undefined })}
                            className="ml-1 text-red-500 hover:text-red-700 transition-colors p-0.5 rounded-full hover:bg-red-50"
                            title="Remover PDF"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      )}
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Status CAR
                      </label>
                      <select
                        value={form.statusCar || 'ATIVO - AGUARDANDO ANÁLISE SC'}
                        onChange={(e) => setForm(prev => ({ ...prev, statusCar: e.target.value }))}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                      >
                        <option>ATIVO - AGUARDANDO ANÁLISE SC</option>
                        <option>ATIVO</option>
                        <option>PENDENTE</option>
                        <option>INATIVO</option>
                      </select>
                    </div>

                    <div className="md:col-span-2">
                       <div className="flex justify-between items-center mb-2">
                        <label className="block text-sm font-medium text-gray-700">
                          ITR
                        </label>
                        <button
                          type="button"
                          onClick={handleAddItr}
                          className="text-xs flex items-center gap-1 text-blue-600 hover:text-blue-800 font-medium"
                        >
                          <Plus className="w-3 h-3" /> Novo ITR
                        </button>
                      </div>
                      
                      <div className="space-y-3">
                        {form.itrDados?.map((item) => (
                          <div key={item.id} className="flex gap-2 items-start bg-gray-50 p-3 rounded-lg border border-gray-100 relative">
                            <div className="flex-1">
                              <input
                                type="text"
                                value={item.numero}
                                onChange={(e) => handleItrChange(item.id, e.target.value)}
                                placeholder="Número do ITR"
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm"
                              />
                            </div>
                            
                            <div className="flex gap-2">
                              {/* Declaração ITR */}
                              <div className="flex flex-col gap-1 items-center">
                                <input 
                                  type="file" 
                                  id={`itrDeclaracaoFile-${item.id}`}
                                  accept=".pdf,application/pdf"
                                  className="hidden"
                                  onChange={(e) => handleItrDeclaracaoUpload(e, item.id)}
                                />
                                <button
                                  type="button"
                                  onClick={() => document.getElementById(`itrDeclaracaoFile-${item.id}`)?.click()}
                                  className={`px-3 py-2 border rounded-lg flex items-center justify-center transition-colors ${item.declaracaoUrl ? 'bg-blue-50 text-blue-600 border-blue-200 hover:bg-blue-100' : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-100'}`}
                                  title={item.declaracaoUrl ? "Declaração anexada. Clique para alterar" : "Anexar Declaração ITR"}
                                >
                                  {isUploadingItr === item.id + '_declaracao' ? (
                                    <RefreshCw className="w-4 h-4 animate-spin" />
                                  ) : (
                                    <FileText className="w-4 h-4" />
                                  )}
                                </button>
                                <span className="text-[9px] uppercase font-bold text-gray-400">Declaração</span>
                              </div>

                              {/* Recibo ITR */}
                              <div className="flex flex-col gap-1 items-center">
                                <input 
                                  type="file" 
                                  id={`itrReciboFile-${item.id}`}
                                  accept=".pdf,application/pdf"
                                  className="hidden"
                                  onChange={(e) => handleItrReciboUpload(e, item.id)}
                                />
                                <button
                                  type="button"
                                  onClick={() => document.getElementById(`itrReciboFile-${item.id}`)?.click()}
                                  className={`px-3 py-2 border rounded-lg flex items-center justify-center transition-colors ${item.reciboUrl ? 'bg-green-50 text-green-600 border-green-200 hover:bg-green-100' : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-100'}`}
                                  title={item.reciboUrl ? "Recibo anexado. Clique para alterar" : "Anexar Recibo ITR"}
                                >
                                  {isUploadingItr === item.id + '_recibo' ? (
                                    <RefreshCw className="w-4 h-4 animate-spin" />
                                  ) : (
                                    <ClipboardCheck className="w-4 h-4" />
                                  )}
                                </button>
                                <span className="text-[9px] uppercase font-bold text-gray-400">Recibo</span>
                              </div>
                              
                              <button
                                type="button"
                                onClick={() => handleRemoveItr(item.id)}
                                className="px-3 py-2 border border-red-200 text-red-500 rounded-lg hover:bg-red-50 transition-colors bg-white h-[38px]"
                                title="Remover ITR"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                            
                            {(item.declaracaoUrl || item.reciboUrl || item.url) && (
                              <div className="absolute -bottom-2 left-3 bg-white px-2 flex items-center gap-3 text-[10px] border border-gray-100 rounded-full shadow-sm">
                                {(item.declaracaoUrl || item.url) && (
                                  <div className="flex items-center gap-1 text-blue-600">
                                    <Check className="w-3 h-3" /> Decl.
                                    <a href={item.declaracaoUrl || item.url} target="_blank" rel="noopener noreferrer" className="hover:underline font-bold inline-flex items-center">
                                      Ver <ExternalLink className="w-2 h-2 ml-[2px]" />
                                    </a>
                                    <button
                                      type="button"
                                      onClick={() => setForm(prev => ({
                                        ...prev,
                                        itrDados: (prev.itrDados || []).map(i => i.id === item.id ? { ...i, declaracaoUrl: undefined, url: undefined } : i)
                                      }))}
                                      className="text-red-500 hover:text-red-700 ml-0.5"
                                      title="Remover PDF"
                                    >
                                      <X className="w-2.5 h-2.5" />
                                    </button>
                                  </div>
                                )}
                                {item.reciboUrl && (
                                  <div className="flex items-center gap-1 text-green-600 border-l pl-2 border-gray-100">
                                    <Check className="w-3 h-3" /> Rec.
                                    <a href={item.reciboUrl} target="_blank" rel="noopener noreferrer" className="hover:underline font-bold inline-flex items-center">
                                      Ver <ExternalLink className="w-2 h-2 ml-[2px]" />
                                    </a>
                                    <button
                                      type="button"
                                      onClick={() => setForm(prev => ({
                                        ...prev,
                                        itrDados: (prev.itrDados || []).map(i => i.id === item.id ? { ...i, reciboUrl: undefined } : i)
                                      }))}
                                      className="text-red-500 hover:text-red-700 ml-0.5"
                                      title="Remover PDF"
                                    >
                                      <X className="w-2.5 h-2.5" />
                                    </button>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        ))}
                        
                        {(!form.itrDados || form.itrDados.length === 0) && (
                          <div className="text-center py-4 bg-gray-50 border border-dashed border-gray-300 rounded-lg">
                            <p className="text-sm text-gray-500 mb-2">Nenhum ITR adicionado</p>
                            <button
                              type="button"
                              onClick={handleAddItr}
                              className="inline-flex items-center gap-1 text-sm text-blue-600 hover:text-blue-800 font-medium"
                            >
                              <Plus className="w-4 h-4" /> Adicionar ITR
                            </button>
                          </div>
                        )}
                      </div>
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
                        onChange={(e) => setForm(prev => ({ ...prev, geoCertificacao: e.target.value as 'SIM' | 'NÃO' }))}
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
                        onChange={(e) => setForm(prev => ({ ...prev, geoRegistro: e.target.value as 'SIM' | 'NÃO' }))}
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
                        onChange={(e) => setForm(prev => ({ ...prev, areaTotal: parseFloat(e.target.value) || 0 }))}
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
                        onChange={(e) => setForm(prev => ({ ...prev, reservaLegal: parseFloat(e.target.value) || 0 }))}
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
                        onChange={(e) => setForm(prev => ({ ...prev, cultura1: e.target.value }))}
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
                        onChange={(e) => setForm(prev => ({ ...prev, areaCultura1: parseFloat(e.target.value) || 0 }))}
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
                        onChange={(e) => setForm(prev => ({ ...prev, cultura2: e.target.value }))}
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
                        onChange={(e) => setForm(prev => ({ ...prev, areaCultura2: parseFloat(e.target.value) || 0 }))}
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
                        onChange={(e) => setForm(prev => ({ ...prev, outros: e.target.value }))}
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
                        onChange={(e) => setForm(prev => ({ ...prev, areaOutros: parseFloat(e.target.value) || 0 }))}
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
                        onChange={(e) => setForm(prev => ({ ...prev, appCodigoFlorestal: parseFloat(e.target.value) || 0 }))}
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
                        onChange={(e) => setForm(prev => ({ ...prev, appVegetada: parseFloat(e.target.value) || 0 }))}
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
                        onChange={(e) => setForm(prev => ({ ...prev, appNaoVegetada: parseFloat(e.target.value) || 0 }))}
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
                        onChange={(e) => setForm(prev => ({ ...prev, remanescenteFlorestal: parseFloat(e.target.value) || 0 }))}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Botões */}
              <div className="flex justify-end gap-3 mt-6 pt-4 border-t">
                <button
                  type="button"
                  onClick={() => {
                    setIsModalOpen(false)
                    setEditing(null)
                    setFormErrors({})
                  }}
                  className="flex items-center gap-3 px-6 py-3 bg-gray-200 text-gray-700 rounded-xl hover:bg-gray-300 transition-colors font-semibold"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleSave}
                  className="flex items-center gap-3 px-6 py-3 bg-gradient-to-r from-blue-500 to-indigo-600 text-white font-semibold rounded-xl hover:from-blue-600 hover:to-indigo-700 shadow-lg hover:shadow-xl transform hover:-translate-y-1 transition-all duration-300"
                >
                  {editing ? 'Atualizar' : 'Salvar'}
                </button>
              </div>
            </div>
          </div>
      </Modal>

      {/* Modal de Importação */}
      <Modal isOpen={isImportModalOpen} onClose={() => setIsImportModalOpen(false)}>
        <div className="bg-white rounded-lg shadow-xl max-w-md w-full m-4">
            <div className="p-6">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-bold text-gray-900">Importar / Exportar TerraControl</h2>
                <button
                  onClick={() => setIsImportModalOpen(false)}
                  className="text-gray-400 hover:text-gray-600 text-2xl"
                  aria-label="Fechar modal"
                >
                  ✕
                </button>
              </div>
              <div className="space-y-4">
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <p className="text-sm text-blue-800 mb-3">
                    Para exportar, os registros precisam estar selecionados na tabela.
                  </p>
                  <button
                    onClick={handleExportSelected}
                    className="w-full flex items-center justify-center gap-3 px-6 py-3 bg-gradient-to-r from-blue-500 to-indigo-600 text-white font-semibold rounded-xl hover:from-blue-600 hover:to-indigo-700 shadow-lg hover:shadow-xl transform hover:-translate-y-1 transition-all duration-300"
                  >
                    <Download className="h-5 w-5" />
                    Exportar Selecionados
                  </button>
                </div>

                <div className="border-t pt-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Selecione o arquivo Excel (.xlsx)
                  </label>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".xlsx"
                    onChange={handleFileSelect}
                    disabled={isImporting}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 disabled:opacity-60 disabled:cursor-not-allowed"
                  />
                  {isImporting && (
                    <p className="text-sm text-blue-600 mt-1 flex items-center gap-2">
                      <Loader2 className="w-4 h-4 animate-spin" /> Importando...
                    </p>
                  )}
                </div>
                <div className="flex gap-3">
                  <button
                    onClick={downloadModel}
                    className="flex items-center justify-center gap-3 flex-1 px-6 py-3 bg-gray-200 text-gray-700 rounded-xl hover:bg-gray-300 transition-colors font-semibold"
                  >
                    Baixar Modelo
                  </button>
                  <button
                    onClick={() => setIsImportModalOpen(false)}
                    className="flex items-center justify-center gap-3 flex-1 px-6 py-3 bg-gradient-to-r from-blue-500 to-indigo-600 text-white font-semibold rounded-xl hover:from-blue-600 hover:to-indigo-700 shadow-lg hover:shadow-xl transform hover:-translate-y-1 transition-all duration-300"
                  >
                    Cancelar
                  </button>
                </div>
                </div>
              </div>
            </div>
        </div>
      </Modal>

      {/* Modal de Aviso de Seleção para Compartilhar */}
      <Modal isOpen={isShareSelectionWarningOpen} onClose={() => setIsShareSelectionWarningOpen(false)}>
        <div className="bg-white rounded-lg shadow-xl max-w-md w-full m-4">
            <div className="p-6">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-bold text-gray-900">Nenhum registro selecionado</h2>
                <button
                  onClick={() => setIsShareSelectionWarningOpen(false)}
                  className="text-gray-400 hover:text-gray-600 text-2xl"
                  aria-label="Fechar modal"
                >
                  ✕
                </button>
              </div>
              <p className="text-gray-700 mb-6">
                Selecione pelo menos um registro para compartilhar ou exportar. Caso queira usar todos, marque a caixa de seleção do cabeçalho da tabela.
              </p>
              <div className="flex justify-end">
                <button
                  onClick={() => setIsShareSelectionWarningOpen(false)}
                  className="flex items-center gap-3 px-6 py-3 bg-gradient-to-r from-blue-500 to-indigo-600 text-white font-semibold rounded-xl hover:from-blue-600 hover:to-indigo-700 shadow-lg hover:shadow-xl transform hover:-translate-y-1 transition-all duration-300"
                >
                  Entendi
                </button>
              </div>
            </div>
        </div>
      </Modal>

      {/* Modal de Gerenciamento de Links Compartilháveis */}
      <Modal
        isOpen={isShareModalOpen}
        onClose={() => {
          setIsShareModalOpen(false)
          setShareModalMode('create')
          setShareLink('')
          setShareLinkName('')
          setNewLinkExpiresAt('')
          setNewLinkPassword('')
          setLinkCopied(false)
          setEditingLinkToken(null)
          setEditingLinkName('')
          setEditingLinkExpiresAt('')
          setEditingLinkPassword('')
        }}
      >
        <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col m-4">
            <div className="p-6 border-b flex-shrink-0">
              <div className="flex justify-between items-center">
                <h2 className="text-2xl font-bold text-gray-900">Gerenciar Links Compartilháveis</h2>
                <button
                  onClick={() => {
                    setIsShareModalOpen(false)
                    setShareModalMode('create')
                    setShareLink('')
                    setShareLinkName('')
                    setNewLinkExpiresAt('')
                    setNewLinkPassword('')
                    setLinkCopied(false)
                    setEditingLinkToken(null)
                    setEditingLinkName('')
                    setEditingLinkExpiresAt('')
                    setEditingLinkPassword('')
                  }}
                  className="text-gray-400 hover:text-gray-600 text-2xl"
                  aria-label="Fechar modal"
                >
                  ✕
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-6">
              {shareModalMode === 'create' && (
              <div className="bg-gray-50 rounded-lg p-4 mb-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Criar Novo Link</h3>
                <div className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Nome
                      </label>
                      <input
                        type="text"
                        value={shareLinkName}
                        onChange={(e) => setShareLinkName(e.target.value)}
                        placeholder="Nome personalizado"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Data de Validade
                      </label>
                      <input
                        type="datetime-local"
                        value={newLinkExpiresAt}
                        onChange={(e) => setNewLinkExpiresAt(e.target.value)}
                        placeholder="Data de expiração"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        min={new Date().toISOString().slice(0, 16)}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Senha
                      </label>
                      <input
                        type="password"
                        value={newLinkPassword}
                        onChange={(e) => setNewLinkPassword(e.target.value)}
                        placeholder="Senha de acesso"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                    </div>
                  </div>
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                    <p className="text-xs text-blue-800">
                      <strong><span aria-hidden="true">⚠️ </span>Todos os campos são opcionais.</strong> Você pode preencher apenas os que desejar.
                    </p>
                  </div>
                  <div className="flex gap-3">
                    <button
                      onClick={createNewShareLink}
                      className="flex items-center gap-3 px-6 py-3 bg-gradient-to-r from-blue-500 to-indigo-600 text-white font-semibold rounded-xl hover:from-blue-600 hover:to-indigo-700 shadow-lg hover:shadow-xl transform hover:-translate-y-1 transition-all duration-300"
                    >
                      Criar Link
                    </button>
                  </div>
                  <p className="text-xs text-gray-500">
                    <strong>Nome:</strong> Aparecerá na página compartilhada como "Bem-vindo(a) [nome]". Se deixar em branco, aparecerá "Bem-vindo Visitante".<br/>
                    <strong>Data de expiração:</strong> Após esta data, o link deixará de funcionar.<br/>
                    <strong>Senha:</strong> Se definida, será necessária para acessar o link compartilhado.
                  </p>
                </div>
              </div>
              )}

              {/* Link recém-criado ou copiado */}
              {shareModalMode === 'create' && shareLink && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Link gerado:
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={shareLink}
                      readOnly
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-lg bg-white"
                    />
                    <button
                      onClick={copyToClipboard}
                      className="flex items-center gap-3 px-6 py-3 bg-gradient-to-r from-blue-500 to-indigo-600 text-white font-semibold rounded-xl hover:from-blue-600 hover:to-indigo-700 shadow-lg hover:shadow-xl transform hover:-translate-y-1 transition-all duration-300"
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
              )}

              {/* Lista de links existentes */}
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Links Compartilháveis Existentes</h3>
                {shareLinks.length === 0 ? (
                  <p className="text-gray-500 text-center py-8">Nenhum link compartilhável criado ainda.</p>
                ) : (
                  <div className="space-y-3">
                    {shareLinks.map((link) => {
                      const expiresRaw = (link as any).expires_at || link.expiresAt
                      const isExpired = expiresRaw ? new Date(expiresRaw) < new Date() : false
                      const expiresAtDate = expiresRaw ? new Date(expiresRaw) : null
                      
                      return (
                        <div key={link.token} className={`bg-white border rounded-lg p-4 ${isExpired ? 'border-red-300 bg-red-50' : 'border-gray-200'}`}>
                          <div className="flex items-start justify-between gap-4">
                            <div className="flex-1">
                              {editingLinkToken === link.token ? (
                                <div className="space-y-3">
                                  <div className="flex gap-2 items-center">
                                    <input
                                      type="text"
                                      value={editingLinkName}
                                      onChange={(e) => setEditingLinkName(e.target.value)}
                                      placeholder="Nome do link"
                                      className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                                      autoFocus
                                    />
                                  </div>
                                  <div className="flex gap-2 items-center">
                                    <input
                                      type="datetime-local"
                                      value={editingLinkExpiresAt}
                                      onChange={(e) => setEditingLinkExpiresAt(e.target.value)}
                                      placeholder="Data de expiração (opcional)"
                                      className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                                      min={new Date().toISOString().slice(0, 16)}
                                    />
                                  </div>
                                  <div className="flex gap-2 items-center">
                                    <input
                                      type="password"
                                      value={editingLinkPassword}
                                      onChange={(e) => setEditingLinkPassword(e.target.value)}
                                      placeholder={link.passwordHash ? "Deixe em branco para remover senha ou digite nova senha" : "Digite uma senha (opcional)"}
                                      className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                                    />
                                    {link.passwordHash && (
                                      <span className="text-xs text-gray-500 whitespace-nowrap">
                                        (Senha atual será substituída)
                                      </span>
                                    )}
                                  </div>
                                  <div className="flex gap-3">
                                    <button
                                      onClick={() => {
                                        updateShareLinkName(link.token, editingLinkName, editingLinkExpiresAt, editingLinkPassword)
                                      }}
                                      className="flex items-center gap-3 px-6 py-3 bg-gradient-to-r from-green-500 to-emerald-600 text-white font-semibold rounded-xl hover:from-green-600 hover:to-emerald-700 shadow-lg hover:shadow-xl transform hover:-translate-y-1 transition-all duration-300"
                                    >
                                      Salvar
                                    </button>
                                    <button
                                      onClick={() => {
                                        setEditingLinkToken(null)
                                        setEditingLinkName('')
                                        setEditingLinkExpiresAt('')
                                        setEditingLinkPassword('')
                                      }}
                                      className="flex items-center gap-3 px-6 py-3 bg-gray-200 text-gray-700 rounded-xl hover:bg-gray-300 transition-colors font-semibold"
                                    >
                                      Cancelar
                                    </button>
                                  </div>
                                </div>
                              ) : (
                                <>
                                  <div className="flex items-center gap-2 mb-2">
                                    <span className="font-semibold text-gray-900">
                                      {link.name || 'Sem nome'}
                                    </span>
                                    {isExpired && (
                                      <span className="px-2 py-1 bg-red-100 text-red-800 rounded-full text-xs font-semibold">
                                        Expirado
                                      </span>
                                    )}
                                    {!isExpired && expiresAtDate && (
                                      <span className="px-2 py-1 bg-yellow-100 text-yellow-800 rounded-full text-xs font-semibold">
                                        Expira em {formatDate((link as any).expires_at || link.expiresAt!)}
                                      </span>
                                    )}
                                    {!expiresAtDate && (
                                      <span className="px-2 py-1 bg-green-100 text-green-800 rounded-full text-xs font-semibold">
                                        Sem expiração
                                      </span>
                                    )}
                                    {link.passwordHash && (
                                      <span className="px-2 py-1 bg-purple-100 text-purple-800 rounded-full text-xs font-semibold">
                                        <span aria-hidden="true">🔒 </span>Protegido por senha
                                      </span>
                                    )}
                                  </div>
                                  <div className="text-xs text-gray-500 mb-2">
                                    Criado em {formatDate((link as any).created_at || link.createdAt)}
                                  </div>
                                  <div className="flex gap-2 items-center">
                                    <input
                                      type="text"
                                      value={`${window.location.origin}/v/${link.token}`}
                                      readOnly
                                      className="flex-1 px-3 py-2 border border-gray-300 rounded-lg bg-gray-50 text-sm"
                                    />
                                    <button
                                      onClick={() => {
                                        const fullLink = `${window.location.origin}/v/${link.token}`
                                        navigator.clipboard.writeText(fullLink)
                                        setShareLink(fullLink)
                                        setLinkCopied(true)
                                        setTimeout(() => setLinkCopied(false), 2000)
                                      }}
                                      className="flex items-center gap-2 px-4 py-2 bg-gray-200 text-gray-700 rounded-xl hover:bg-gray-300 transition-colors font-semibold"
                                      title="Copiar link"
                                    >
                                      <Copy className="h-4 w-4" />
                                    </button>
                                  </div>
                                </>
                              )}
                            </div>
                            <div className="flex gap-2">
                              {editingLinkToken !== link.token && (
                                <>
                                  <button
                                    onClick={() => {
                                      setEditingLinkToken(link.token)
                                      setEditingLinkName(link.name || '')
                                      // Converter data ISO para formato datetime-local (YYYY-MM-DDTHH:mm)
                                      if (link.expiresAt) {
                                        const date = new Date(link.expiresAt)
                                        const year = date.getFullYear()
                                        const month = String(date.getMonth() + 1).padStart(2, '0')
                                        const day = String(date.getDate()).padStart(2, '0')
                                        const hours = String(date.getHours()).padStart(2, '0')
                                        const minutes = String(date.getMinutes()).padStart(2, '0')
                                        setEditingLinkExpiresAt(`${year}-${month}-${day}T${hours}:${minutes}`)
                                      } else {
                                        setEditingLinkExpiresAt('')
                                      }
                                      setEditingLinkPassword('') // Não mostrar senha existente por segurança
                                    }}
                                    className="flex items-center gap-2 px-4 py-2 bg-blue-100 text-blue-700 rounded-xl hover:bg-blue-200 transition-colors font-semibold"
                                    title="Editar nome, data e senha"
                                  >
                                    <Edit className="h-4 w-4" />
                                  </button>
                                  <button
                                    onClick={() => regenerateShareLinkToken(link.token, link.name, link.expiresAt)}
                                    className="flex items-center gap-2 px-4 py-2 bg-yellow-100 text-yellow-700 rounded-xl hover:bg-yellow-200 transition-colors font-semibold"
                                    title="Regenerar token"
                                  >
                                    <RefreshCw className="h-4 w-4" />
                                  </button>
                                  <button
                                    onClick={() => deleteShareLink(link.token)}
                                    className="flex items-center gap-2 px-4 py-2 bg-red-100 text-red-700 rounded-xl hover:bg-red-200 transition-colors font-semibold"
                                    title="Excluir"
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </button>
                                </>
                              )}
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            </div>

            <div className="p-6 border-t bg-gray-50 flex-shrink-0">
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <p className="text-sm text-blue-800">
                  <strong>Nota:</strong> Os links compartilháveis permitem visualizar todos os TerraControl em modo somente leitura, sem necessidade de login. 
                  Compartilhe os links com quem precisa visualizar os dados.
                </p>
              </div>
            </div>
        </div>
      </Modal>

      {/* Modal do Mapa */}
      <Modal
        isOpen={isMapModalOpen && !!selectedMapUrl}
        onClose={() => {
          setIsMapModalOpen(false)
          setSelectedMapUrl('')
          setSelectedImovel('')
        }}
      >
        <div className="bg-white rounded-lg shadow-xl w-full max-w-6xl max-h-[90vh] flex flex-col m-4">
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
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden transform animate-in zoom-in-95 duration-200 m-4">
            <div className="p-6">
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-xl font-bold text-gray-900">
                  Downloads ITR: <span className="text-blue-600">{itrDownloadModal.item.numero}</span>
                </h3>
                <button
                  onClick={() => setItrDownloadModal(null)}
                  className="p-2 hover:bg-gray-100 rounded-full transition-colors"
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
        )}
      </Modal>
    </div>
  )
}

export default TerraControl

