import React, { useState, useEffect, useRef, useMemo } from 'react'
import { Plus, Edit, Trash2, Download, Upload, Search, Share2, Copy, Check, RefreshCw, ExternalLink, Loader2, FileText, ClipboardCheck, Archive, X, Map as MapIcon, AlertTriangle, Users, Settings } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import ChartModal from '@/components/modals/ChartModal'
import Modal from '@/components/Modal'
// Tipos, normalize, helpers de URL/cultura, builders de gráfico e empacotadores
// de ZIP vêm dos módulos compartilhados — ver src/subsistemas/especial/modulos/
// _terracontrol/. Antes desta refatoração (G3.1), tudo estava duplicado aqui
// e em TerraControlView.tsx, com pequenas divergências que vazavam bugs.
import {
  type ItrItem,
  type TerraControlRecord,
  type SortField,
  type SortDirection,
  type ChartDatum,
  type APPField,
  normalizeRecord,
  normalizeRecords,
  formatCodImovel,
  formatNumber,
  isAllowedMapUrl,
  convertMapUrlToEmbed,
  getAreaByCulturaType,
  getTotalImoveisData,
  getAreaTotalData,
  getGeoCertificacaoData,
  getGeoRegistroData,
  getCulturaData,
  getAPPData,
  getReservaLegalData,
  downloadAllMatriculasZip,
  downloadAllItrZip,
  downloadSingleItrZip,
  downloadAllCcirZip,
  downloadRegistroZip,
  useFeedback,
} from './_terracontrol'
import TcUsersAdminPanel from './_terracontrol/TcUsersAdminPanel'
import TcBudgetEditorModal from './_terracontrol/budgets/TcBudgetEditorModal'
import TcBudgetHistoryPanel from './_terracontrol/budgets/TcBudgetHistoryPanel'
import TcBudgetSettingsTab from './_terracontrol/budgets/TcBudgetSettingsTab'
import {
  fetchRecordHistory,
  type BudgetFullPayload,
  type RecordEvent,
} from './_terracontrol/budgets/budgetApi'

// Feature flag temporária: a UI antiga de share_links (botões "Gerar Link" e
// "Gerenciar Links") foi substituída pela aba "Usuários TerraControl" na fase
// tc_users. Mantemos o código atrás desta flag por enquanto para reverter
// rápido se aparecer regressão. Deletar quando tiver confiança em produção.
const SHOW_LEGACY_SHARE_BUTTONS = false

const API_BASE_URL = '/api'

type FormTab = 'basico' | 'documentos' | 'areas' | 'ambiental'

const TerraControl: React.FC = () => {
  const { token, user } = useAuth()
  // G4.3 — substitui alert()/window.confirm() nativos por toast/dialog estilizados
  const { notify, confirm, FeedbackHost } = useFeedback()
  // G4.4 — qual aba do modal de edição está ativa. Resetada para 'basico' a cada
  // open de modal (handleNew/handleEdit). Mantém todos os campos montados via
  // className condicional 'hidden' para não perder dados ao trocar de aba.
  const [activeFormTab, setActiveFormTab] = useState<FormTab>('basico')
  const [records, setRecords] = useState<TerraControlRecord[]>([])
  const [searchTerm, setSearchTerm] = useState('')
  // G5.4 — paginação incremental client-side. Antes renderizávamos 100% dos
  // registros de uma vez, o que ficava pesado com 100+ cards. Agora começa em
  // PAGE_SIZE e o usuário clica em "Carregar mais" para puxar mais 30.
  const [visibleCount, setVisibleCount] = useState(30)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [isMapModalOpen, setIsMapModalOpen] = useState(false)
  const [selectedMapUrl, setSelectedMapUrl] = useState<string>('')
  const [selectedImovel, setSelectedImovel] = useState<string>('')
  const [editing, setEditing] = useState<TerraControlRecord | null>(null)
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set())
  const [isImportModalOpen, setIsImportModalOpen] = useState(false)
  // Novo painel "Usuários TerraControl" (substitui share_links na UI admin)
  const [isTcUsersPanelOpen, setIsTcUsersPanelOpen] = useState(false)
  // F2.4: superadmin/admin OU usuário com permissão delegada
  const canManageTcUsers = user?.role === 'superadmin' || user?.role === 'admin' || user?.canManageTcUsers === true
  // Mantém alias antigo p/ minimizar diff em outros lugares
  const isAdmin = canManageTcUsers
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
  // F: filtro por status de aprovação ('all'|'pendentes'|'aprovados')
  const [approvalFilter, setApprovalFilter] = useState<'all' | 'pendentes' | 'aprovados'>('all')
  // F: estado do botão "Aprovar" inline por card
  const [approvingId, setApprovingId] = useState<string | null>(null)
  // G7 (migration 040) — Orçamentos:
  //   budgetEditorRecord: registro alvo do modal de criação/revisão (null = fechado)
  //   budgetEditorPayload: payload completo quando abrindo em modo "revisar"
  //   budgetHistoryPayload: payload sendo visualizado na timeline
  const [budgetEditorRecord, setBudgetEditorRecord] = useState<TerraControlRecord | null>(null)
  const [budgetEditorPayload, setBudgetEditorPayload] = useState<BudgetFullPayload | null>(null)
  const [budgetHistoryPayload, setBudgetHistoryPayload] = useState<BudgetFullPayload | null>(null)
  // G10: complementos do painel de histórico (eventos do registro + nome do
  // imóvel pro header). Ficam ao lado de budgetHistoryPayload pra não precisar
  // ser embrulhado num objeto único — vida útil é exatamente a mesma.
  const [budgetHistoryRecordEvents, setBudgetHistoryRecordEvents] = useState<RecordEvent[]>([])
  const [budgetHistoryRecord, setBudgetHistoryRecord] = useState<TerraControlRecord | null>(null)
  const [loadingBudgetForRecord, setLoadingBudgetForRecord] = useState<string | null>(null)
  // G7 (migration 040) — modal de Configurações do template de orçamento,
  // acionado pelo botão "Configurações" no header.
  const [isBudgetSettingsOpen, setIsBudgetSettingsOpen] = useState(false)
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
  
  // G2.5 — só aceitamos URLs do Google Maps no iframe. Qualquer outra origem
  // (ou esquema javascript:, data:, etc.) seria um vetor de phishing —
  // um admin malicioso ou registro adulterado poderia embedar conteúdo arbitrário.
  // Retorna '' se a URL não for confiável; o componente esconde o iframe.

  // Função para converter URL do Google Maps para formato embed

  
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
        } else {
          throw new Error(result.error || 'Resposta inválida da API')
        }
      } catch (error: any) {
        if (error?.name === 'AbortError') return
        console.error('Erro ao carregar TerraControl:', error)
        setLoadError(error?.message || 'Falha ao carregar registros')
        setRecords([])
      } finally {
        setIsLoadingRecords(false)
      }
    }
    loadRecords()
    return () => controller.abort()
  }, [])

  // G3.4 — filter + sort num único useMemo. Antes o useEffect setava
  // filteredRecords como state intermediário, gerando dois renders por mudança
  // de searchTerm e dificultando manter consistência (já houve bugs em que
  // share link refetch sobrescrevia o filtro ativo).
  const sortedRecords = useMemo(() => {
    const lower = searchTerm.toLowerCase()
    let filtered = searchTerm
      ? records.filter(record =>
          (record.imovel || '').toLowerCase().includes(lower) ||
          (record.municipio || '').toLowerCase().includes(lower) ||
          String(record.codImovel ?? '').includes(searchTerm)
        )
      : [...records]
    // F: filtro por status de aprovação
    if (approvalFilter === 'pendentes') filtered = filtered.filter(r => r.approved === false)
    else if (approvalFilter === 'aprovados') filtered = filtered.filter(r => r.approved !== false)

    const direction = sortDirection === 'asc' ? 1 : -1

    const getValue = (record: TerraControlRecord, field: SortField): string | number => {
      if (field === 'saldoReservaLegal') {
        return (record.reservaLegal || 0) - ((record.areaTotal || 0) * 0.2)
      }
      return record[field as keyof TerraControlRecord] as string | number
    }

    filtered.sort((a, b) => {
      const aValue = getValue(a, sortField)
      const bValue = getValue(b, sortField)
      if (typeof aValue === 'number' && typeof bValue === 'number') {
        return (aValue - bValue) * direction
      }
      return String(aValue ?? '')
        .localeCompare(String(bValue ?? ''), 'pt-BR', { sensitivity: 'base' }) * direction
    })

    return filtered
  }, [records, sortField, sortDirection, searchTerm, approvalFilter])

  // G5.4 — reset da paginação quando o conjunto exibido muda (busca/sort).
  // Sem isso, o usuário podia filtrar de "Fazenda" → 3 resultados e ver "Carregar
  // mais" mesmo só com 3 itens (visibleCount herdado).
  useEffect(() => {
    setVisibleCount(30)
  }, [searchTerm, sortField, sortDirection])

  const visibleRecords = useMemo(
    () => sortedRecords.slice(0, visibleCount),
    [sortedRecords, visibleCount]
  )
  const hasMoreToLoad = visibleCount < sortedRecords.length

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

  const handleEdit = (record: TerraControlRecord) => {
    setEditing(record)
    setForm(record)
    setActiveFormTab('basico')
    setIsModalOpen(true)
  }

  // G7+: deep-link via query string `?record=<id>`.
  // Quando admin clica numa notificação tc_record_created no sininho, o
  // NotificationBell redireciona pra /?subsystem=especial&module=terracontrol&record=<id>.
  // Aqui detectamos esse param e abrimos o modal de edição direto pra o
  // admin ver os dados que o tc_user cadastrou. Limpa o param depois pra
  // não reabrir em refreshes acidentais.
  //
  // Roda só depois que `records` carregou (pra ter o objeto pra preencher
  // o form). useRef garante que abre apenas 1x por carga de URL.
  const autoOpenAttemptedRef = useRef<string | null>(null)
  useEffect(() => {
    if (records.length === 0) return
    if (typeof window === 'undefined') return
    const params = new URLSearchParams(window.location.search)
    const recordId = params.get('record')
    if (!recordId) return
    // Já abriu pra esse id? Não repete (evita re-abrir se records muda)
    if (autoOpenAttemptedRef.current === recordId) return
    autoOpenAttemptedRef.current = recordId
    const found = records.find(r => String(r.id) === String(recordId))
    if (found) {
      handleEdit(found)
    } else {
      notify(`Registro #${recordId} não encontrado ou sem acesso`, { type: 'warning' })
    }
    // Limpa o param da URL pra não reabrir em F5 acidentais. Mantém os
    // demais (subsystem, module).
    params.delete('record')
    const newSearch = params.toString()
    const newUrl = window.location.pathname + (newSearch ? `?${newSearch}` : '') + window.location.hash
    window.history.replaceState({}, '', newUrl)
  }, [records, notify])

  // G10: deep-link via query string `?budget=<id>`.
  // Quando admin clica nas notificações tc_budget_revision_requested ou
  // tc_budget_payment_completed, o NotificationBell redireciona pra
  // /?subsystem=especial&module=terracontrol&budget=<id>. Aqui resolvemos o
  // budgetId pro record local (via currentBudgetId) e abrimos o painel de
  // histórico do imóvel — onde admin pode aceitar/descartar a revisão.
  const autoOpenBudgetAttemptedRef = useRef<string | null>(null)
  useEffect(() => {
    if (records.length === 0) return
    if (typeof window === 'undefined') return
    const params = new URLSearchParams(window.location.search)
    const budgetId = params.get('budget')
    if (!budgetId) return
    if (autoOpenBudgetAttemptedRef.current === budgetId) return
    autoOpenBudgetAttemptedRef.current = budgetId

    const found = records.find(r => r.currentBudgetId === budgetId)
    if (!found) {
      notify('Orçamento não encontrado ou sem acesso', { type: 'warning' })
    } else {
      // Carrega histórico completo e abre o painel — independente do status,
      // queremos mostrar o histórico (não o editor) quando vem por essa rota.
      ;(async () => {
        try {
          const history = await fetchRecordHistory(token, found.id)
          if (!history.budget) {
            notify('Orçamento sem dados disponíveis', { type: 'warning' })
            return
          }
          setBudgetHistoryPayload(history.budget)
          setBudgetHistoryRecordEvents(history.recordEvents || [])
          setBudgetHistoryRecord(found)
        } catch (e: any) {
          notify(e?.message || 'Erro ao carregar histórico do orçamento', { type: 'error' })
        }
      })()
    }

    params.delete('budget')
    const newSearch = params.toString()
    const newUrl = window.location.pathname + (newSearch ? `?${newSearch}` : '') + window.location.hash
    window.history.replaceState({}, '', newUrl)
  }, [records, notify, token])

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
    setActiveFormTab('basico')
    setIsModalOpen(true)
  }

  const handleCarFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      notify('Por favor, selecione apenas arquivos PDF.', { type: 'warning' })
      return
    }

    if (file.size > 20 * 1024 * 1024) {
      notify('O arquivo é muito grande. O tamanho máximo permitido é 20MB.', { type: 'warning' })
      return
    }

    setIsUploadingCar(true)
    try {
      const formData = new FormData()
      formData.append('file', file)

      const response = await fetch(`${API_BASE_URL}/terracontrol/upload-car`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token || ''}`
        },
        body: formData
      })

      const data = await response.json()
      if (data.success) {
        setForm(prev => ({ ...prev, carUrl: data.url }))
      } else {
        notify(data.error || 'Erro ao fazer upload do arquivo', { type: 'error' })
      }
    } catch (error) {
      console.error('Erro no upload:', error)
      notify('Erro ao enviar o arquivo. Tente novamente.', { type: 'error' })
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
      notify('Por favor, selecione apenas arquivos PDF.', { type: 'warning' })
      return
    }

    if (file.size > 20 * 1024 * 1024) {
      notify('O arquivo é muito grande. O tamanho máximo permitido é 20MB.', { type: 'warning' })
      return
    }

    setIsUploadingMatricula(id)
    try {
      const formData = new FormData()
      formData.append('file', file)

      const response = await fetch(`${API_BASE_URL}/terracontrol/upload-car`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token || ''}`
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
        notify(data.error || 'Erro ao fazer upload do arquivo', { type: 'error' })
      }
    } catch (error) {
      console.error('Erro no upload:', error)
      notify('Erro ao enviar o arquivo. Tente novamente.', { type: 'error' })
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
      notify('Por favor, selecione apenas arquivos PDF.', { type: 'warning' })
      return
    }

    if (file.size > 20 * 1024 * 1024) {
      notify('O arquivo é muito grande. O tamanho máximo permitido é 20MB.', { type: 'warning' })
      return
    }

    setIsUploadingItr(id + '_declaracao')
    try {
      const formData = new FormData()
      formData.append('file', file)

      const response = await fetch(`${API_BASE_URL}/terracontrol/upload-car`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token || ''}`
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
        notify(data.error || 'Erro ao fazer upload do arquivo', { type: 'error' })
      }
    } catch (error) {
      console.error('Erro no upload:', error)
      notify('Erro ao enviar o arquivo. Tente novamente.', { type: 'error' })
    } finally {
      setIsUploadingItr(null)
      if (event.target) event.target.value = ''
    }
  }

  const handleItrReciboUpload = async (event: React.ChangeEvent<HTMLInputElement>, id: string) => {
    const file = event.target.files?.[0]
    if (!file) return

    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      notify('Por favor, selecione apenas arquivos PDF.', { type: 'warning' })
      return
    }

    if (file.size > 20 * 1024 * 1024) {
      notify('O arquivo é muito grande. O tamanho máximo permitido é 20MB.', { type: 'warning' })
      return
    }

    setIsUploadingItr(id + '_recibo')
    try {
      const formData = new FormData()
      formData.append('file', file)

      const response = await fetch(`${API_BASE_URL}/terracontrol/upload-car`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token || ''}`
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
        notify(data.error || 'Erro ao fazer upload do arquivo', { type: 'error' })
      }
    } catch (error) {
      console.error('Erro no upload:', error)
      notify('Erro ao enviar o arquivo. Tente novamente.', { type: 'error' })
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
      notify('Por favor, selecione apenas arquivos PDF.', { type: 'warning' })
      return
    }

    if (file.size > 20 * 1024 * 1024) {
      notify('O arquivo é muito grande. O tamanho máximo permitido é 20MB.', { type: 'warning' })
      return
    }

    setIsUploadingCcir(id)
    try {
      const formData = new FormData()
      formData.append('file', file)

      const response = await fetch(`${API_BASE_URL}/terracontrol/upload-car`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token || ''}`
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
        notify(data.error || 'Erro ao fazer upload do arquivo', { type: 'error' })
      }
    } catch (error) {
      console.error('Erro no upload:', error)
      notify('Erro ao enviar o arquivo. Tente novamente.', { type: 'error' })
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
    if (!form.mapaUrl?.trim()) errors.mapaUrl = 'Link do Google Maps é obrigatório'
    
    setFormErrors(errors)
    return Object.keys(errors).length === 0
  }

  const handleSave = async () => {
    if (!validateForm()) {
      // G4.4 — todos os campos obrigatórios estão na aba "Básico"; se a
      // validação falhou, redireciona o usuário para lá automaticamente.
      setActiveFormTab('basico')
      return
    }

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
          // setRecords atualiza o estado; sortedRecords (useMemo) recalcula
          setRecords(updated)
          setIsModalOpen(false)
          setEditing(null)
          setFormErrors({})
        } else {
          notify('Erro ao atualizar registro: ' + (result.error || 'Erro desconhecido'), { type: 'error' })
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
          // setRecords atualiza o estado; sortedRecords (useMemo) recalcula
          setRecords(updated)
          setIsModalOpen(false)
          setEditing(null)
          setFormErrors({})
        } else {
          notify('Erro ao criar registro: ' + (result.error || 'Erro desconhecido'), { type: 'error' })
        }
      }
    } catch (error: any) {
      console.error('Erro ao salvar registro:', error)
      const errorMessage = error?.message || error?.toString() || 'Erro desconhecido ao salvar record'
      notify(`Erro ao salvar registro: ${errorMessage}`, { type: 'error' })
    }
  }

  const handleDelete = async (id: string) => {
    if (await confirm('Tem certeza que deseja excluir este registro?', { variant: 'danger', confirmLabel: 'Excluir' })) {
      try {
        const response = await fetch(`${API_BASE_URL}/terracontrol/${id}`, {
          method: 'DELETE'
        })
        const result = await response.json()
        if (result.success) {
          setRecords(records.filter(a => a.id !== id))
        } else {
          notify('Erro ao excluir registro: ' + result.error, { type: 'error' })
        }
      } catch (error) {
        console.error('Erro ao excluir registro:', error)
        notify('Erro ao excluir registro', { type: 'error' })
      }
    }
  }

  // G7 (migration 040): abre o modal/painel de orçamento. Estratégia:
  //   - Se record nunca teve orçamento (sem budgetStatus ou só 'locked'): abre editor em modo criação
  //   - Se já existe budget e está em sent/revision_requested: abre editor em modo revisão
  //   - Se já está em awaiting_payment/paid/cancelled: abre só o painel de histórico (sem editar)
  // G10: abre direto o painel de histórico (sem passar pelo editor).
  // Usado pelo badge "Revisão solicitada" — em revision_requested, o admin
  // precisa de um atalho pro painel onde os botões Aceitar/Descartar moram.
  // O fluxo via botão "Revisar orçamento" continua indo direto pro editor.
  const handleOpenBudgetHistory = async (record: TerraControlRecord) => {
    setLoadingBudgetForRecord(record.id)
    try {
      const history = await fetchRecordHistory(token, record.id)
      if (!history.budget) {
        notify('Esse registro ainda não tem orçamento', { type: 'warning' })
        return
      }
      setBudgetHistoryPayload(history.budget)
      setBudgetHistoryRecordEvents(history.recordEvents || [])
      setBudgetHistoryRecord(record)
    } catch (e: any) {
      notify(e?.message || 'Erro ao carregar histórico do orçamento', { type: 'error' })
    } finally {
      setLoadingBudgetForRecord(null)
    }
  }

  const handleOpenBudget = async (record: TerraControlRecord) => {
    setLoadingBudgetForRecord(record.id)
    try {
      // G10: usa o endpoint unificado de histórico — vem record + recordEvents
      // + budget no mesmo round-trip. fetchBudgetByRecord segue exportada
      // mas não é mais usada aqui (mantida pra retrocompat).
      const history = await fetchRecordHistory(token, record.id)
      const payload = history.budget
      if (!payload) {
        // Sem budget — abre editor em modo criação
        setBudgetEditorPayload(null)
        setBudgetEditorRecord(record)
        return
      }
      const status = payload.budget.status
      if (status === 'sent' || status === 'revision_requested') {
        setBudgetEditorPayload(payload)
        setBudgetEditorRecord(record)
      } else {
        // awaiting_payment/paid/cancelled → só visualizar histórico
        setBudgetHistoryPayload(payload)
        setBudgetHistoryRecordEvents(history.recordEvents || [])
        setBudgetHistoryRecord(record)
      }
    } catch (e: any) {
      notify(e?.message || 'Erro ao carregar orçamento', { type: 'error' })
    } finally {
      setLoadingBudgetForRecord(null)
    }
  }

  // G10: ações vindas do TcBudgetHistoryPanel quando há revisão pendente.
  //
  // Aceitar revisão: fecha o painel de histórico e abre o editor com o budget
  // atual + revisão corrente carregados (modo "revisar"). Reusa o mesmo
  // record/payload que o painel estava mostrando.
  const handleAcceptRevisionFromHistory = () => {
    if (!budgetHistoryPayload || !budgetHistoryRecord) return
    setBudgetEditorPayload(budgetHistoryPayload)
    setBudgetEditorRecord(budgetHistoryRecord)
    setBudgetHistoryPayload(null)
    setBudgetHistoryRecordEvents([])
    setBudgetHistoryRecord(null)
  }

  // Descartar revisão: o painel chamou o backend e a chamada deu sucesso —
  // status do budget voltou pra 'sent'. Aqui só fechamos o painel e
  // atualizamos o card local pra refletir o novo status.
  const handleRevisionDismissedFromHistory = () => {
    if (budgetHistoryRecord) {
      setRecords(prev => prev.map(r =>
        r.id === budgetHistoryRecord.id
          ? { ...r, budgetStatus: 'sent' as TerraControlRecord['budgetStatus'] }
          : r
      ))
    }
    setBudgetHistoryPayload(null)
    setBudgetHistoryRecordEvents([])
    setBudgetHistoryRecord(null)
  }

  // Após salvar o orçamento (criação ou revisão), atualiza state local
  // do card afetado pra refletir o novo budgetStatus sem refetch global.
  const handleBudgetSaved = (budget: { id: string; terracontrol_id: string; status: string }) => {
    setBudgetEditorRecord(null)
    setBudgetEditorPayload(null)
    setRecords(prev => prev.map(r =>
      r.id === budget.terracontrol_id
        ? { ...r, currentBudgetId: budget.id, budgetStatus: budget.status as TerraControlRecord['budgetStatus'] }
        : r
    ))
  }

  // F: aprovação inline. Marca o registro como approved=TRUE via PATCH admin.
  const handleApprove = async (id: string) => {
    setApprovingId(id)
    try {
      const res = await fetch(`${API_BASE_URL}/admin/terracontrol/${id}/approve`, {
        method: 'PATCH',
        credentials: 'include',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      })
      const data = await res.json()
      if (res.ok && data.success) {
        notify('Registro aprovado', { type: 'success' })
        // Atualiza o registro localmente (sem refetch)
        setRecords(prev => prev.map(r => r.id === id ? { ...r, approved: true, approvedAt: data.data?.approved_at || new Date().toISOString() } : r))
      } else {
        notify(data?.error || 'Erro ao aprovar', { type: 'error' })
      }
    } catch (e: any) {
      notify(e?.message || 'Erro de conexão', { type: 'error' })
    } finally {
      setApprovingId(null)
    }
  }

  // Handlers de download finos: gerenciam só o estado visual de "downloading"
  // e delegam a montagem do ZIP para os helpers em ./_terracontrol/downloads.ts.
  // Componente autenticado não precisa de UrlTransformer (cookie httpOnly autentica),
  // então as funções são chamadas com a assinatura padrão (transform = identity).
  const handleDownloadAllMatriculas = async (record: TerraControlRecord) => {
    setIsDownloadingZip(record.id)
    try {
      await downloadAllMatriculasZip(record.matriculasDados || [], record.imovel)
    } finally {
      setIsDownloadingZip(null)
    }
  }

  const handleDownloadAllItr = async (record: TerraControlRecord) => {
    setIsDownloadingZip(record.id + 'itr')
    try {
      await downloadAllItrZip(record.itrDados || [], record.imovel)
    } finally {
      setIsDownloadingZip(null)
    }
  }

  const handleDownloadSingleItr = async (item: ItrItem, imovelName: string) => {
    setIsDownloadingSingleZip(item.id)
    try {
      await downloadSingleItrZip(item, imovelName)
    } finally {
      setIsDownloadingSingleZip(null)
    }
  }

  const handleDownloadAllCcir = async (record: TerraControlRecord) => {
    setIsDownloadingZip(record.id + 'ccir')
    try {
      await downloadAllCcirZip(record.ccirDados || [], record.imovel)
    } finally {
      setIsDownloadingZip(null)
    }
  }

  const handleDownloadRegistro = async (record: TerraControlRecord) => {
    setIsDownloadingRecordZip(record.id)
    try {
      const result = await downloadRegistroZip(record)
      if (result.empty) {
        notify('Nenhum documento disponível para download neste registro.', { type: 'info' })
      }
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


  // Função para normalizar o nome da cultura (remove acentos e converte para maiúsculas)

  // Função para verificar se uma cultura corresponde ao tipo (com variações)

  // Função para calcular área total por tipo de cultura

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    // Validar extensão
    if (!file.name.toLowerCase().endsWith('.xlsx')) {
      notify('Por favor, selecione um arquivo Excel (.xlsx)', { type: 'warning' })
      if (fileInputRef.current) fileInputRef.current.value = ''
      return
    }

    // Validar tamanho (10MB)
    const maxSize = 10 * 1024 * 1024 // 10MB
    if (file.size > maxSize) {
      notify('O arquivo é muito grande! Tamanho máximo permitido: 10MB', { type: 'warning' })
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
          notify(`${data.data.length} registros importados com sucesso!`, { type: 'success' })
          setIsImportModalOpen(false)
        } else {
          notify('Erro ao importar: ' + (data.error || data.message || 'Erro desconhecido'), { type: 'error' })
        }
      })
      .catch(error => {
        console.error('Erro ao importar:', error)
        notify('Erro ao importar arquivo: ' + (error.message || 'Verifique se o arquivo está no formato correto e tente novamente'), { type: 'error' })
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
      notify('Erro ao exportar registros selecionados: ' + (error.message || 'Tente novamente'), { type: 'error' })
    }
  }

  const generateShareLink = async () => {
    if (!user) {
      notify('Você precisa estar autenticado para gerar um link compartilhável', { type: 'warning' })
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
      notify('Você precisa estar autenticado para gerenciar links compartilháveis', { type: 'warning' })
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
      // G3.5 — não recarregamos /api/terracontrol antes de criar o share link.
      // O state local de `selectedItems` já reflete a seleção atual; o backend
      // valida os IDs ao receber. Antes, esse refetch causava double-render,
      // confundia o filtro de busca, e era simplesmente desnecessário.
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
        notify('Erro ao gerar link: ' + (result.error || result.message || 'Erro desconhecido'), { type: 'error' })
      }
    } catch (error: any) {
      console.error('Erro ao gerar link:', error)
      notify('Erro ao gerar link compartilhável: ' + (error.message || 'Verifique sua conexão e tente novamente'), { type: 'error' })
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
        notify('Erro ao atualizar link: ' + (result.error || result.message || 'Erro desconhecido'), { type: 'error' })
      }
    } catch (error: any) {
      console.error('Erro ao atualizar link:', error)
      notify('Erro ao atualizar link: ' + (error.message || 'Verifique sua conexão e tente novamente'), { type: 'error' })
    }
  }

  const regenerateShareLinkToken = async (oldToken: string, name: string | null, expiresAt: string | null) => {
    if (!user) return

    if (!(await confirm('Tem certeza que deseja regenerar o token deste link? O link antigo deixará de funcionar.', { variant: 'danger', confirmLabel: 'Regenerar' }))) {
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
        notify('Erro ao regenerar token: ' + (result.error || result.message || 'Erro desconhecido'), { type: 'error' })
      }
    } catch (error: any) {
      console.error('Erro ao regenerar token:', error)
      notify('Erro ao regenerar token: ' + (error.message || 'Verifique sua conexão e tente novamente'), { type: 'error' })
    }
  }

  const deleteShareLink = async (tokenToDelete: string) => {
    if (!user) return

    if (!(await confirm('Tem certeza que deseja excluir este link compartilhável?', { variant: 'danger', confirmLabel: 'Excluir' }))) {
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
        notify('Erro ao excluir link: ' + (result.error || result.message || 'Erro desconhecido'), { type: 'error' })
      }
    } catch (error: any) {
      console.error('Erro ao excluir link:', error)
      notify('Erro ao excluir link: ' + (error.message || 'Verifique sua conexão e tente novamente'), { type: 'error' })
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

  // Builders de gráfico (G3.6 — memoizados). Antes recalculavam a cada render.
  const totalImoveisData    = useMemo(() => getTotalImoveisData(records),    [records])
  const areaTotalData       = useMemo(() => getAreaTotalData(records),       [records])
  const geoCertificacaoData = useMemo(() => getGeoCertificacaoData(records), [records])
  const geoRegistroData     = useMemo(() => getGeoRegistroData(records),     [records])
  const reservaLegalData    = useMemo(() => getReservaLegalData(records),    [records])
  const culturaChartData = (tipo: string)    => getCulturaData(records, tipo)
  const appChartData     = (field: APPField) => getAPPData(records, field)
  const areaPorCultura   = (tipo: string)    => getAreaByCulturaType(records, tipo)

  // Função para abrir gráfico
  const openChart = (
    title: string,
    subtitle: string,
    data: ChartDatum[],
    options?: { valueUnit?: string; valueFormat?: 'area' | 'number' }
  ) => {
    if (!data || data.length === 0) {
      notify('Não há dados disponíveis para exibir o gráfico.', { type: 'info' })
      return
    }
    const total = data.reduce((sum, item) => sum + item.value, 0)
    if (total === 0) {
      notify('Não há dados disponíveis para exibir o gráfico.', { type: 'info' })
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
          {/* Configurações de orçamento (template padrão) — estilo impgeo
              (azul→indigo), pra distinguir das ações específicas do TC. */}
          {isAdmin && (
            <button
              onClick={() => setIsBudgetSettingsOpen(true)}
              className="h-10 w-full sm:w-auto flex-shrink-0 whitespace-nowrap flex items-center justify-center gap-2 px-4 py-2 text-sm bg-gradient-to-r from-blue-500 to-indigo-600 text-white font-semibold rounded-xl hover:from-blue-600 hover:to-indigo-700 shadow-md hover:shadow-lg transition-all duration-200"
              title="Configurações de orçamento"
            >
              <Settings className="h-4 w-4" />
              Configurações
            </button>
          )}
          {/* Novo: aba "Usuários TerraControl" (substitui Gerar/Gerenciar Links) */}
          {isAdmin && (
            <button
              onClick={() => setIsTcUsersPanelOpen(true)}
              className="h-10 w-full sm:w-auto flex-shrink-0 whitespace-nowrap flex items-center justify-center gap-2 px-4 py-2 text-sm bg-gradient-to-r from-tc-green to-tc-blue text-white font-semibold rounded-xl hover:from-tc-green-dark hover:to-tc-blue-dark shadow-md shadow-tc-blue/25 hover:-translate-y-0.5 transition-all duration-200"
            >
              <Users className="h-4 w-4" />
              Usuários TerraControl
            </button>
          )}
          {/* Botões antigos de share_links — atrás de feature flag para reverter rápido se preciso */}
          {SHOW_LEGACY_SHARE_BUTTONS && (
            <>
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
            </>
          )}
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
          onClick={() => openChart('Distribuição de Imóveis', 'Total de imóveis por município', totalImoveisData, { valueFormat: 'number', valueUnit: '' })}
        >
          <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">Total de Imóveis</p>
          <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{records.length}</p>
        </div>
        <div 
          className="bg-white dark:!bg-[#243040] rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-4 cursor-pointer hover:shadow-md hover:-translate-y-0.5 hover:border-blue-200 dark:hover:border-blue-700 transition-all duration-200"
          onClick={() => openChart('Distribuição de Área Total', 'Área total por município (ha)', areaTotalData)}
        >
          <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">Área Total</p>
          <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">
            {formatNumber(records.reduce((sum, a) => sum + a.areaTotal, 0))} ha
          </p>
        </div>
        <div 
          className="bg-white dark:!bg-[#243040] rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-4 cursor-pointer hover:shadow-md hover:-translate-y-0.5 hover:border-blue-200 dark:hover:border-blue-700 transition-all duration-200"
          onClick={() => openChart('Geo Certificação', 'Distribuição de imóveis com e sem geo certificação', geoCertificacaoData, { valueFormat: 'number', valueUnit: '' })}
        >
          <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">Com Geo Certificação</p>
          <p className="text-2xl font-bold text-green-600">
            {records.filter(a => a.geoCertificacao === 'SIM').length}
          </p>
        </div>
        <div 
          className="bg-white dark:!bg-[#243040] rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-4 cursor-pointer hover:shadow-md hover:-translate-y-0.5 hover:border-blue-200 dark:hover:border-blue-700 transition-all duration-200"
          onClick={() => openChart('Geo Registro', 'Distribuição de imóveis com e sem geo registro', geoRegistroData, { valueFormat: 'number', valueUnit: '' })}
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
          onClick={() => openChart('Silvicultura', 'Distribuição de área por imóvel (ha)', culturaChartData('Silvicultura'))}
        >
          <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">Silvicultura</p>
          <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">
            {formatNumber(areaPorCultura('Silvicultura'))} ha
          </p>
        </div>
        <div 
          className="bg-white dark:!bg-[#243040] rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-4 cursor-pointer hover:shadow-md hover:-translate-y-0.5 hover:border-blue-200 dark:hover:border-blue-700 transition-all duration-200"
          onClick={() => openChart('Cultura Temporária', 'Distribuição de área por imóvel (ha)', culturaChartData('Cultura Temporária'))}
        >
          <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">Cultura Temporária</p>
          <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">
            {formatNumber(areaPorCultura('Cultura Temporária'))} ha
          </p>
        </div>
        <div 
          className="bg-white dark:!bg-[#243040] rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-4 cursor-pointer hover:shadow-md hover:-translate-y-0.5 hover:border-blue-200 dark:hover:border-blue-700 transition-all duration-200"
          onClick={() => openChart('Pasto', 'Distribuição de área por imóvel (ha)', culturaChartData('Pasto'))}
        >
          <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">Pasto</p>
          <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">
            {formatNumber(areaPorCultura('Pasto'))} ha
          </p>
        </div>
        <div 
          className="bg-white dark:!bg-[#243040] rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-4 cursor-pointer hover:shadow-md hover:-translate-y-0.5 hover:border-blue-200 dark:hover:border-blue-700 transition-all duration-200"
          onClick={() => openChart('Banhado', 'Distribuição de área por imóvel (ha)', culturaChartData('Banhado'))}
        >
          <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">Banhado</p>
          <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">
            {formatNumber(areaPorCultura('Banhado'))} ha
          </p>
        </div>
        <div 
          className="bg-white dark:!bg-[#243040] rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-4 cursor-pointer hover:shadow-md hover:-translate-y-0.5 hover:border-blue-200 dark:hover:border-blue-700 transition-all duration-200"
          onClick={() => openChart('Servidão', 'Distribuição de área por imóvel (ha)', culturaChartData('Servidão'))}
        >
          <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">Servidão</p>
          <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">
            {formatNumber(areaPorCultura('Servidão'))} ha
          </p>
        </div>
      </div>

      {/* Estatísticas de APP e Reserva Legal */}
      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4">
        <div 
          className="bg-white dark:!bg-[#243040] rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-4 cursor-pointer hover:shadow-md hover:-translate-y-0.5 hover:border-blue-200 dark:hover:border-blue-700 transition-all duration-200"
          onClick={() => openChart('Área Antropizada', 'Distribuição de área por imóvel (ha)', culturaChartData('Área Antropizada'))}
        >
          <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">Área Antropizada</p>
          <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">
            {formatNumber(areaPorCultura('Área Antropizada'))} ha
          </p>
        </div>
        <div 
          className="bg-white dark:!bg-[#243040] rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-4 cursor-pointer hover:shadow-md hover:-translate-y-0.5 hover:border-blue-200 dark:hover:border-blue-700 transition-all duration-200"
          onClick={() => openChart('APP Código Florestal', 'Distribuição de área por imóvel (ha)', appChartData('appCodigoFlorestal'))}
        >
          <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">APP Código Florestal</p>
          <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">
            {formatNumber(records.reduce((sum, a) => sum + (a.appCodigoFlorestal || 0), 0))} ha
          </p>
        </div>
        <div 
          className="bg-white dark:!bg-[#243040] rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-4 cursor-pointer hover:shadow-md hover:-translate-y-0.5 hover:border-blue-200 dark:hover:border-blue-700 transition-all duration-200"
          onClick={() => openChart('APP Vegetada', 'Distribuição de área por imóvel (ha)', appChartData('appVegetada'))}
        >
          <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">APP Vegetada</p>
          <p className="text-2xl font-bold text-green-600">
            {formatNumber(records.reduce((sum, a) => sum + (a.appVegetada || 0), 0))} ha
          </p>
        </div>
        <div 
          className="bg-white dark:!bg-[#243040] rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-4 cursor-pointer hover:shadow-md hover:-translate-y-0.5 hover:border-blue-200 dark:hover:border-blue-700 transition-all duration-200"
          onClick={() => openChart('APP Não Vegetada', 'Distribuição de área por imóvel (ha)', appChartData('appNaoVegetada'))}
        >
          <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">APP Não Vegetada</p>
          <p className="text-2xl font-bold text-orange-600">
            {formatNumber(records.reduce((sum, a) => sum + (a.appNaoVegetada || 0), 0))} ha
          </p>
        </div>
        <div
          className="bg-white dark:!bg-[#243040] rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-4 cursor-pointer hover:shadow-md hover:-translate-y-0.5 hover:border-blue-200 dark:hover:border-blue-700 transition-all duration-200"
          onClick={() => openChart('20% Reserva Legal', 'Distribuição de área por imóvel (ha)', reservaLegalData)}
        >
          <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">20% Reserva Legal</p>
          <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">
            {formatNumber(records.reduce((sum, a) => sum + (a.reservaLegal || 0), 0))} ha
          </p>
        </div>
      </div>

      {/* Busca + Ordenação + Seleção */}
      <div className="flex flex-col sm:flex-row gap-2 bg-white dark:!bg-[#243040] rounded-2xl border border-gray-200 dark:border-gray-700 px-4 py-3 shadow-sm">
        {/* No mobile esta linha também abriga o contador de resultados (que não
            cabe dentro do input) e pode quebrar em duas se a seleção estiver ativa. */}
        <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1 sm:flex-nowrap sm:justify-start sm:shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <input
              type="checkbox"
              onChange={handleSelectAll}
              checked={sortedRecords.length > 0 && sortedRecords.every(a => selectedItems.has(a.id))}
              // G5.3 — quando busca está ativa, o checkbox opera apenas sobre o
              // filtrado visível. Antes só dizia "Selecionar todos" e confundia
              // o usuário (parecia selecionar todos os 100, marcava só os 10 visíveis).
              title={
                searchTerm
                  ? `Selecionar/desmarcar os ${sortedRecords.length} registros visíveis (do filtro "${searchTerm}")`
                  : `Selecionar/desmarcar todos os ${sortedRecords.length} registros`
              }
              className="rounded border-gray-300 dark:border-gray-600 shrink-0"
            />
            {selectedItems.size > 0 && (
              <span className="text-xs font-semibold text-blue-600 dark:text-blue-400 whitespace-nowrap">
                {selectedItems.size} selecionado{selectedItems.size !== 1 ? 's' : ''}
                {searchTerm && selectedItems.size < records.length && (
                  <span className="text-gray-400 dark:text-gray-500 font-normal ml-1">
                    (de {records.length})
                  </span>
                )}
              </span>
            )}
            {/* G6.3 — botão textual ao lado do checkbox torna a ação óbvia.
                Antes só havia o checkbox e o tooltip; muitos usuários nem
                percebiam que dava pra selecionar tudo. */}
            {selectedItems.size === 0 ? (
              <button
                type="button"
                onClick={() => setSelectedItems(new Set(sortedRecords.map(r => r.id)))}
                disabled={sortedRecords.length === 0}
                className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline whitespace-nowrap disabled:text-gray-400 dark:disabled:text-gray-500 disabled:no-underline disabled:cursor-not-allowed"
              >
                {searchTerm ? `Selecionar visíveis (${sortedRecords.length})` : 'Selecionar todos'}
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setSelectedItems(new Set())}
                className="text-xs font-semibold text-gray-500 dark:text-gray-400 hover:text-red-600 dark:hover:text-red-400 hover:underline whitespace-nowrap"
              >
                Limpar seleção
              </button>
            )}
          </div>

          {/* Contador no mobile: o texto é mais largo que o padding reservado no
              input (pr-44) e acabava cobrindo o placeholder. Aqui ele ocupa o
              espaço livre desta linha; no sm+ volta pra dentro do input. */}
          <span className="sm:hidden shrink-0 text-xs font-semibold tabular-nums whitespace-nowrap px-1.5 py-0.5 rounded-lg bg-blue-50 text-blue-500 dark:bg-blue-900/30 dark:text-blue-400">
            {sortedRecords.length}/{records.length} resultados
          </span>
        </div>
        <div className="flex-1 relative min-w-0">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500 h-4 w-4" />
          <input
            type="text"
            placeholder="Buscar por imóvel, município ou código..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-3 sm:pr-44 py-1.5 bg-gray-50 dark:!bg-[#1e2d3e] border border-gray-200 dark:border-gray-600 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:text-gray-100 dark:placeholder-gray-400 transition-all"
          />
          <span className="hidden sm:block absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold tabular-nums pointer-events-none select-none whitespace-nowrap px-1.5 py-0.5 rounded-lg transition-colors
            bg-blue-50 text-blue-500 dark:bg-blue-900/30 dark:text-blue-400">
            Mostrando {sortedRecords.length}/{records.length} Resultados
          </span>
        </div>
        {/* No mobile: Status e Ordenar dividem uma linha e o botão de direção
            cai numa própria. Antes era uma linha só com shrink-0 em tudo — não
            cabia em 390px e o botão vazava pra fora do card. */}
        <div className="flex flex-wrap items-center gap-2 sm:flex-nowrap sm:shrink-0">
          <div className="hidden sm:block w-px h-5 bg-gray-200 dark:bg-gray-600" />
          {/* F: filtro por status de aprovação */}
          <div className="flex flex-1 min-w-0 sm:flex-none items-center gap-1.5 bg-gray-50 dark:!bg-[#1e2d3e] border border-gray-200 dark:border-gray-600 rounded-xl px-3 py-1.5">
            <span className="text-xs font-semibold text-gray-400 dark:text-gray-500 whitespace-nowrap uppercase tracking-wide">Status</span>
            <select
              value={approvalFilter}
              onChange={e => setApprovalFilter(e.target.value as any)}
              className="flex-1 min-w-0 text-sm bg-transparent border-0 text-gray-700 dark:text-gray-200 focus:outline-none cursor-pointer font-medium"
            >
              <option value="all">Todos</option>
              <option value="pendentes">Pendentes</option>
              <option value="aprovados">Aprovados</option>
            </select>
          </div>
          <div className="flex flex-1 min-w-0 sm:flex-none items-center gap-1.5 bg-gray-50 dark:!bg-[#1e2d3e] border border-gray-200 dark:border-gray-600 rounded-xl px-3 py-1.5">
            <span className="text-xs font-semibold text-gray-400 dark:text-gray-500 whitespace-nowrap uppercase tracking-wide">Ordenar</span>
            <select
              id="sort-select-record"
              value={sortField}
              onChange={e => { setSortField(e.target.value as SortField); setSortDirection('asc') }}
              className="flex-1 min-w-0 text-sm bg-transparent border-0 text-gray-700 dark:text-gray-200 focus:outline-none cursor-pointer font-medium"
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
            className="w-full justify-center sm:w-auto flex items-center gap-1 px-3 py-1.5 rounded-xl bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 text-sm font-semibold hover:bg-blue-100 dark:hover:bg-blue-900/50 transition-colors"
          >
            {sortDirection === 'asc' ? '↑ Cresc.' : '↓ Decresc.'}
          </button>
        </div>
      </div>

      {/* Cards */}
      <div className="space-y-4">
        {isLoadingRecords ? (
          // Skeleton — 3 placeholders animados imitando a estrutura de um card real
          // (header gradiente + linhas de dados). Comunica "lista chegando" em vez
          // de só "algo carregando".
          <>
            {[0, 1, 2].map((i) => (
              <div
                key={`skeleton-${i}`}
                className="bg-white dark:!bg-[#243040] rounded-2xl shadow-md border border-gray-200 dark:border-gray-700 overflow-hidden animate-pulse"
              >
                <div className="bg-gradient-to-r from-blue-500/40 to-indigo-600/40 dark:from-blue-500/20 dark:to-indigo-600/20 px-4 py-3 flex items-center gap-3">
                  <div className="h-4 w-10 bg-white/40 rounded" />
                  <div className="flex-1 space-y-2">
                    <div className="h-3 w-1/2 bg-white/40 rounded" />
                    <div className="h-2 w-1/4 bg-white/30 rounded" />
                  </div>
                </div>
                <div className="p-4 space-y-3">
                  <div className="h-3 w-3/4 bg-gray-200 dark:bg-gray-700 rounded" />
                  <div className="h-3 w-2/3 bg-gray-200 dark:bg-gray-700 rounded" />
                  <div className="grid grid-cols-3 gap-2 pt-2">
                    <div className="h-10 bg-gray-100 dark:bg-gray-700/50 rounded-xl" />
                    <div className="h-10 bg-gray-100 dark:bg-gray-700/50 rounded-xl" />
                    <div className="h-10 bg-gray-100 dark:bg-gray-700/50 rounded-xl" />
                  </div>
                </div>
              </div>
            ))}
            <p className="text-center text-gray-400 dark:text-gray-500 text-xs pt-2 flex items-center justify-center gap-2">
              <Loader2 className="h-3 w-3 animate-spin" /> Carregando registros...
            </p>
          </>
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
        ) : visibleRecords.map((record) => {
          const saldo = (record.reservaLegal || 0) - ((record.areaTotal || 0) * 0.2)
          const hasDocs = !!record.carUrl
            || (record.matriculasDados || []).some(m => m.url)
            || (record.itrDados || []).some(m => m.declaracaoUrl || m.reciboUrl || m.url)
            || (record.ccirDados || []).some(m => m.url)
          const hasMatriculas = (record.matriculasDados || []).length > 0
          const hasCcir = (record.ccirDados || []).length > 0
          const hasItr = (record.itrDados || []).length > 0
          const hasMatriculasPdfs = (record.matriculasDados || []).some(m => m.url)
          const hasCcirPdfs = (record.ccirDados || []).some(m => m.url)
          const hasItrPdfs = (record.itrDados || []).some(m => m.declaracaoUrl || m.reciboUrl || m.url)
          const hasUsoDoSolo = record.cultura1 || record.cultura2 || record.outros
          const hasApp = record.appCodigoFlorestal > 0 || record.appVegetada > 0 || record.appNaoVegetada > 0 || record.remanescenteFlorestal > 0

          return (
            <div key={record.id} className={`bg-white dark:!bg-[#243040] rounded-2xl shadow-md border overflow-hidden hover:shadow-lg transition-shadow duration-200 ${selectedItems.has(record.id) ? 'border-blue-400 dark:border-blue-500' : 'border-gray-200 dark:border-gray-700'}`}>

              {/* ── HEADER ─────────────────────────────────
                  Mobile (<sm): coluna — linha 1: checkbox + #code,
                  linha 2: imóvel + município, linha 3: badges. Botões de
                  ações empilhados verticalmente à direita.
                  Desktop (sm+): layout horizontal original.
              */}
              <div className="bg-gradient-to-r from-blue-500 to-indigo-600 px-4 py-3 flex items-start sm:items-center gap-3">
                <div className="flex-1 min-w-0 space-y-1.5 sm:space-y-0 sm:flex sm:items-center sm:gap-3">
                  {/* Linha 1 mobile / início inline desktop: checkbox + #code */}
                  <div className="flex items-center gap-2.5 sm:shrink-0">
                    <input
                      type="checkbox"
                      checked={selectedItems.has(record.id)}
                      onChange={() => handleSelectItem(record.id)}
                      className="rounded border-white/40 bg-white/20 text-blue-600 shrink-0"
                      title="Selecionar registro"
                    />
                    <span className="shrink-0 bg-white/20 text-white text-xs font-bold px-2 py-0.5 rounded-lg tracking-wide">
                      #{formatCodImovel(record.codImovel)}
                    </span>
                  </div>
                  <div className="min-w-0 sm:flex-1">
                    {/* Linha 1 do bloco: imóvel (mobile quebra, desktop truncate) */}
                    <div className="text-white font-bold text-sm leading-tight break-words sm:truncate">
                      {record.imovel}
                    </div>
                    {/* Linha 2 do bloco: município (sempre em linha separada,
                        mobile e desktop — badges vêm depois). */}
                    <div className="text-blue-200 font-normal text-xs mt-0.5 break-words">
                      {record.municipio}
                    </div>
                    {/* Linha 3 do bloco: badges sempre embaixo de município */}
                    <div className="text-blue-200 text-xs mt-1 flex items-center gap-1.5 flex-wrap">
                      {/* F: badge "Pendente aprovação" + botão Aprovar */}
                      {record.approved === false && (
                        <>
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-amber-400/90 text-amber-900 text-[10px] font-bold">
                            <AlertTriangle className="w-2.5 h-2.5" /> Pendente aprovação
                          </span>
                          <button
                            onClick={(e) => { e.stopPropagation(); handleApprove(record.id) }}
                            disabled={approvingId === record.id}
                            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-green-500 hover:bg-green-600 text-white text-[10px] font-bold disabled:opacity-50"
                          >
                            {approvingId === record.id ? <Loader2 className="w-2.5 h-2.5 animate-spin" /> : <Check className="w-2.5 h-2.5" />}
                            Aprovar
                          </button>
                        </>
                      )}
                      {/* G7 (migration 040): badge de status do orçamento + botão "Gerar/Ver" */}
                      {(() => {
                        const bs = record.budgetStatus
                        const isLoading = loadingBudgetForRecord === record.id
                        // Tons 100/700 + variantes dark: pra contraste forte em ambos os modos.
                        // Mesmo pattern do TcBudgetHistoryPanel — mantém consistência visual.
                        const badgeMap: Record<NonNullable<TerraControlRecord['budgetStatus']>, { text: string; cls: string }> = {
                          locked:             { text: 'Aguardando orçamento', cls: 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-200' },
                          sent:               { text: 'Orçamento enviado',    cls: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300' },
                          revision_requested: { text: 'Revisão solicitada',   cls: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300' },
                          awaiting_payment:   { text: 'Aguardando pagamento', cls: 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300' },
                          paid:               { text: 'Pago',                 cls: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300' },
                        }
                        const showCreate = !bs || bs === 'locked'
                        const showReview = bs === 'sent' || bs === 'revision_requested'
                        const showHistory = bs === 'awaiting_payment' || bs === 'paid'
                        return (
                          <>
                            {bs && badgeMap[bs] && (
                              bs === 'revision_requested' ? (
                                // G10: badge clicável — atalho pro painel de histórico
                                // onde ficam os botões Aceitar/Descartar revisão.
                                <button
                                  type="button"
                                  onClick={(e) => { e.stopPropagation(); handleOpenBudgetHistory(record) }}
                                  disabled={isLoading}
                                  className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold ${badgeMap[bs].cls} hover:brightness-95 dark:hover:brightness-110 transition-all disabled:opacity-50 cursor-pointer`}
                                  title="Ver pedido de revisão (aceitar/descartar)"
                                >
                                  {badgeMap[bs].text}
                                </button>
                              ) : (
                                <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold ${badgeMap[bs].cls}`}>
                                  {badgeMap[bs].text}
                                </span>
                              )
                            )}
                            <button
                              onClick={(e) => { e.stopPropagation(); handleOpenBudget(record) }}
                              disabled={isLoading}
                              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-tc-blue hover:bg-tc-blue-dark text-white text-[10px] font-bold disabled:opacity-50"
                              title={showCreate ? 'Gerar orçamento' : showReview ? 'Revisar orçamento' : 'Ver histórico do orçamento'}
                            >
                              {isLoading ? <Loader2 className="w-2.5 h-2.5 animate-spin" /> : <FileText className="w-2.5 h-2.5" />}
                              {showCreate ? 'Gerar orçamento' : showHistory ? 'Histórico' : 'Revisar orçamento'}
                            </button>
                          </>
                        )
                      })()}
                      {/* F: badge "Criado por @tcuser" */}
                      {record.createdByTcUsername && (
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded-full bg-white/15 text-blue-100 text-[10px] font-medium">
                          Criado por @{record.createdByTcUsername}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                {/* Botões: empilhados verticalmente no mobile (libera espaço
                    horizontal pros 3 blocos da esquerda), inline no desktop. */}
                <div className="flex flex-col sm:flex-row sm:items-center gap-1.5 shrink-0">
                  {record.mapaUrl && (
                    <button
                      onClick={() => { setSelectedMapUrl(record.mapaUrl || ''); setSelectedImovel(record.imovel); setIsMapModalOpen(true) }}
                      title="Ver mapa do imóvel"
                      aria-label={`Ver mapa de ${record.imovel}`}
                      className="p-1.5 bg-white/20 hover:bg-white/35 rounded-lg transition-colors"
                    >
                      <MapIcon className="w-4 h-4 text-white" aria-hidden="true" />
                    </button>
                  )}
                  <button
                    onClick={() => handleDownloadRegistro(record)}
                    disabled={!hasDocs || isDownloadingRecordZip === record.id}
                    title={hasDocs ? 'Baixar todos os documentos (ZIP)' : 'Nenhum documento disponível'}
                    aria-label={hasDocs ? `Baixar documentos de ${record.imovel}` : 'Sem documentos'}
                    className={`p-1.5 rounded-lg transition-colors ${hasDocs ? 'bg-white/20 hover:bg-white/35' : 'bg-white/10 opacity-40 cursor-not-allowed'}`}
                  >
                    {isDownloadingRecordZip === record.id
                      ? <Loader2 className="w-4 h-4 text-white animate-spin" />
                      : <Archive className="w-4 h-4 text-white" />
                    }
                  </button>
                  <button
                    onClick={() => handleEdit(record)}
                    title="Editar"
                    aria-label={`Editar ${record.imovel}`}
                    className="p-1.5 bg-white/20 hover:bg-white/35 rounded-lg transition-colors"
                  >
                    <Edit className="w-4 h-4 text-white" />
                  </button>
                  <button
                    onClick={() => handleDelete(record.id)}
                    title="Excluir"
                    aria-label={`Excluir ${record.imovel}`}
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
                      {hasMatriculas ? record.matriculasDados!.map((mat, i) => (
                        <React.Fragment key={mat.id}>
                          {mat.url
                            ? <a href={mat.url} target="_blank" rel="noopener noreferrer" title={`Baixar matrícula ${mat.numero}`} className="text-xs text-blue-600 dark:text-blue-400 hover:underline font-medium whitespace-nowrap inline-flex items-center gap-0.5"><FileText className="w-3 h-3 shrink-0" />{mat.numero}</a>
                            : <span className="text-xs text-gray-700 dark:text-gray-300 whitespace-nowrap">{mat.numero}</span>
                          }
                          {i < record.matriculasDados!.length - 1 && <span className="text-gray-300 text-xs">,</span>}
                        </React.Fragment>
                      )) : <span className="text-xs text-gray-400">{record.matriculas || '—'}</span>}
                    </div>
                    {hasMatriculas && (
                      <button type="button" disabled={!hasMatriculasPdfs || isDownloadingZip === record.id}
                        onClick={() => handleDownloadAllMatriculas(record)}
                        title={hasMatriculasPdfs ? 'Baixar todas as matrículas (ZIP)' : 'Anexe pelo menos um PDF de matrícula para habilitar este download'}
                        className={`p-1 rounded-full shrink-0 transition-colors ${hasMatriculasPdfs ? 'text-blue-500 hover:bg-blue-100 dark:hover:bg-blue-900/30' : 'text-gray-300 cursor-not-allowed'}`}>
                        {isDownloadingZip === record.id ? <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-500" /> : <Download className="w-3.5 h-3.5" />}
                      </button>
                    )}
                  </div>

                  {/* N. INCRA / CCIR */}
                  <div className="flex items-start gap-2">
                    <span className="text-xs text-gray-400 dark:text-gray-500 w-[88px] shrink-0 pt-0.5 leading-tight">N. INCRA/CCIR</span>
                    <div className="flex-1 flex flex-wrap gap-x-1.5 gap-y-1 min-w-0">
                      {hasCcir ? record.ccirDados!.map((item, i) => (
                        <React.Fragment key={item.id}>
                          {item.url
                            ? <a href={item.url} target="_blank" rel="noopener noreferrer" title={`Baixar CCIR ${item.numero}`} className="text-xs text-blue-600 dark:text-blue-400 hover:underline font-medium whitespace-nowrap inline-flex items-center gap-0.5"><FileText className="w-3 h-3 shrink-0" />{item.numero}</a>
                            : <span className="text-xs text-gray-700 dark:text-gray-300 whitespace-nowrap">{item.numero}</span>
                          }
                          {i < record.ccirDados!.length - 1 && <span className="text-gray-300 text-xs">,</span>}
                        </React.Fragment>
                      )) : <span className="text-xs text-gray-400">{record.nIncraCcir || '—'}</span>}
                    </div>
                    {hasCcir && (
                      <button type="button" disabled={!hasCcirPdfs || isDownloadingZip === record.id + 'ccir'}
                        onClick={() => handleDownloadAllCcir(record)}
                        title={hasCcirPdfs ? 'Baixar todos os CCIRs (ZIP)' : 'Anexe pelo menos um PDF de CCIR para habilitar este download'}
                        className={`p-1 rounded-full shrink-0 transition-colors ${hasCcirPdfs ? 'text-blue-500 hover:bg-blue-100 dark:hover:bg-blue-900/30' : 'text-gray-300 cursor-not-allowed'}`}>
                        {isDownloadingZip === record.id + 'ccir' ? <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-500" /> : <Download className="w-3.5 h-3.5" />}
                      </button>
                    )}
                  </div>

                  {/* CAR */}
                  <div className="flex items-start gap-2">
                    <span className="text-xs text-gray-400 dark:text-gray-500 w-[88px] shrink-0 pt-0.5 leading-tight">CAR</span>
                    <div className="flex-1 flex flex-wrap items-center gap-x-2 gap-y-1 min-w-0">
                      {record.car ? (
                        record.carUrl
                          ? <a href={record.carUrl} target="_blank" rel="noopener noreferrer" title={`Baixar CAR: ${record.car}`} className="text-xs text-blue-600 dark:text-blue-400 hover:underline font-medium inline-flex items-center gap-0.5 truncate max-w-[180px]"><Download className="w-3 h-3 shrink-0" />{record.car}</a>
                          : <span className="text-xs text-gray-700 dark:text-gray-300 truncate max-w-[180px]">{record.car}</span>
                      ) : <span className="text-xs text-gray-400">—</span>}
                      {record.statusCar && (
                        <span className="text-[10px] font-semibold bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 px-2 py-0.5 rounded-full shrink-0">{record.statusCar}</span>
                      )}
                    </div>
                  </div>

                  {/* ITR */}
                  <div className="flex items-start gap-2">
                    <span className="text-xs text-gray-400 dark:text-gray-500 w-[88px] shrink-0 pt-0.5 leading-tight">ITR</span>
                    <div className="flex-1 flex flex-wrap gap-x-1.5 gap-y-1 min-w-0">
                      {hasItr ? record.itrDados!.map((item, i) => (
                        <React.Fragment key={item.id}>
                          {item.declaracaoUrl || item.reciboUrl
                            ? <button type="button" onClick={() => setItrDownloadModal({ item, imovel: record.imovel })} title={`Opções de download ITR ${item.numero}`} className="text-xs text-blue-600 dark:text-blue-400 hover:underline font-medium whitespace-nowrap inline-flex items-center gap-0.5"><FileText className="w-3 h-3 shrink-0" />{item.numero}</button>
                            : <span className="text-xs text-gray-700 dark:text-gray-300 whitespace-nowrap font-medium">{item.numero}</span>
                          }
                          {i < record.itrDados!.length - 1 && <span className="text-gray-300 text-xs">,</span>}
                        </React.Fragment>
                      )) : <span className="text-xs text-gray-400">{record.itr || '—'}</span>}
                    </div>
                    {hasItr && (
                      <button type="button" disabled={!hasItrPdfs || isDownloadingZip === record.id + 'itr'}
                        onClick={() => handleDownloadAllItr(record)}
                        title={hasItrPdfs ? 'Baixar todos os ITRs (ZIP)' : 'Anexe pelo menos um PDF de ITR (declaração ou recibo) para habilitar este download'}
                        className={`p-1 rounded-full shrink-0 transition-colors ${hasItrPdfs ? 'text-blue-500 hover:bg-blue-100 dark:hover:bg-blue-900/30' : 'text-gray-300 cursor-not-allowed'}`}>
                        {isDownloadingZip === record.id + 'itr' ? <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-500" /> : <Download className="w-3.5 h-3.5" />}
                      </button>
                    )}
                  </div>
                </div>

                {/* GEORREFERENCIAMENTO */}
                <div className="px-4 py-3">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-blue-500 dark:text-blue-400 mb-2 flex items-center gap-1.5">
                    <ClipboardCheck className="w-3.5 h-3.5" /> Georreferenciamento / Incra
                  </p>
                  <div className="flex items-center gap-5">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-500 dark:text-gray-400">Certificação</span>
                      <span className={`text-xs font-bold px-2.5 py-0.5 rounded-full ${record.geoCertificacao === 'SIM' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'}`}>
                        {record.geoCertificacao}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-500 dark:text-gray-400">Registro</span>
                      <span className={`text-xs font-bold px-2.5 py-0.5 rounded-full ${record.geoRegistro === 'SIM' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'}`}>
                        {record.geoRegistro}
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
                      <div className="text-sm font-bold text-gray-800 dark:text-gray-100 leading-tight">{formatNumber(record.areaTotal)}</div>
                    </div>
                    <div className="bg-gray-50 dark:bg-[#1a2a3e] rounded-xl p-2.5 text-center border border-gray-100 dark:border-gray-700/50">
                      <div className="text-[10px] text-gray-400 dark:text-gray-500 uppercase tracking-wide mb-0.5">Res. Legal</div>
                      <div className="text-sm font-bold text-gray-800 dark:text-gray-100 leading-tight">{formatNumber(record.reservaLegal)}</div>
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
                      {record.cultura1 && (
                        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800/50 rounded-xl px-3 py-1.5">
                          <div className="text-xs font-semibold text-blue-800 dark:text-blue-300">{record.cultura1}</div>
                          <div className="text-xs text-blue-500 dark:text-blue-400 mt-0.5">{formatNumber(record.areaCultura1)} ha</div>
                        </div>
                      )}
                      {record.cultura2 && (
                        <div className="bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-100 dark:border-indigo-800/50 rounded-xl px-3 py-1.5">
                          <div className="text-xs font-semibold text-indigo-800 dark:text-indigo-300">{record.cultura2}</div>
                          <div className="text-xs text-indigo-500 dark:text-indigo-400 mt-0.5">{formatNumber(record.areaCultura2)} ha</div>
                        </div>
                      )}
                      {record.outros && (
                        <div className="bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700/50 rounded-xl px-3 py-1.5">
                          <div className="text-xs font-semibold text-slate-700 dark:text-slate-300">{record.outros}</div>
                          <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{formatNumber(record.areaOutros)} ha</div>
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
                      {record.appCodigoFlorestal > 0 && (
                        <div className="flex justify-between items-center">
                          <span className="text-xs text-gray-500 dark:text-gray-400">Cód. Florestal</span>
                          <span className="text-xs font-semibold text-gray-700 dark:text-gray-300">{formatNumber(record.appCodigoFlorestal)}</span>
                        </div>
                      )}
                      {record.appVegetada > 0 && (
                        <div className="flex justify-between items-center">
                          <span className="text-xs text-gray-500 dark:text-gray-400">APP Vegetada</span>
                          <span className="text-xs font-semibold text-green-600 dark:text-green-400">{formatNumber(record.appVegetada)}</span>
                        </div>
                      )}
                      {record.appNaoVegetada > 0 && (
                        <div className="flex justify-between items-center">
                          <span className="text-xs text-gray-500 dark:text-gray-400">APP Não Veg.</span>
                          <span className="text-xs font-semibold text-rose-600 dark:text-rose-400">{formatNumber(record.appNaoVegetada)}</span>
                        </div>
                      )}
                      {record.remanescenteFlorestal > 0 && (
                        <div className="flex justify-between items-center">
                          <span className="text-xs text-gray-500 dark:text-gray-400">Remanescente</span>
                          <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">{formatNumber(record.remanescenteFlorestal)}</span>
                        </div>
                      )}
                    </div>
                  </div>
                )}

              </div>
            </div>
          )
        })}

        {/* G5.4 — botão "Carregar mais" só aparece quando há sobra após o slice. */}
        {hasMoreToLoad && (
          <div className="flex justify-center pt-2">
            <button
              type="button"
              onClick={() => setVisibleCount(count => count + 30)}
              className="px-6 py-2.5 bg-white dark:!bg-[#243040] border border-gray-200 dark:border-gray-700 text-blue-600 dark:text-blue-400 font-semibold text-sm rounded-xl hover:bg-blue-50 dark:hover:bg-blue-900/20 hover:border-blue-200 dark:hover:border-blue-700 transition-colors shadow-sm"
            >
              Carregar mais {Math.min(30, sortedRecords.length - visibleCount)}
              <span className="text-gray-400 dark:text-gray-500 font-normal ml-2">
                ({visibleCount} de {sortedRecords.length})
              </span>
            </button>
          </div>
        )}
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
                  {editing ? 'Editar registro' : 'Novo registro'}
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

              {/* G4.4 — barra de abas. Todos os campos permanecem montados
                  (hidden via display:none) para não perder dados ao trocar de aba
                  e para validação ao salvar continuar enxergando o form todo. */}
              <div className="flex gap-1 border-b border-gray-200 dark:border-gray-700 mb-4 overflow-x-auto scrollbar-hide">
                {([
                  { id: 'basico',     label: 'Básico' },
                  { id: 'documentos', label: 'Documentos' },
                  { id: 'areas',      label: 'Áreas e culturas' },
                  { id: 'ambiental',  label: 'Ambiental' },
                ] as const).map(tab => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setActiveFormTab(tab.id)}
                    className={`px-4 py-2 text-sm font-semibold border-b-2 -mb-px transition-colors whitespace-nowrap ${
                      activeFormTab === tab.id
                        ? 'border-blue-600 text-blue-700 dark:text-blue-400'
                        : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              <div className="space-y-6">
                {/* ABA BÁSICO — Informações Básicas */}
                <div className={`grid grid-cols-1 md:grid-cols-3 gap-4 ${activeFormTab !== 'basico' ? 'hidden' : ''}`}>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Código do Imóvel
                    </label>
                    <input
                      type="text"
                      value={form.codImovel ? String(form.codImovel).padStart(3, '0') : 'Automático'}
                      readOnly
                      className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-[#1a2a3e] text-gray-500 dark:text-gray-400 cursor-not-allowed"
                    />
                    <p className="text-gray-400 dark:text-gray-500 text-[10px] mt-1 italic">Gerado automaticamente pelo sistema</p>
                  </div>

                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Nome do Imóvel *
                    </label>
                    <input
                      type="text"
                      value={form.imovel || ''}
                      onChange={(e) => setForm(prev => ({ ...prev, imovel: e.target.value }))}
                      className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 ${formErrors.imovel ? 'border-red-500' : 'border-gray-300 dark:border-gray-600'} dark:bg-[#1a2a3e] dark:text-gray-100`}
                    />
                    {formErrors.imovel && (
                      <p className="text-red-500 text-xs mt-1">{formErrors.imovel}</p>
                    )}
                  </div>

                  <div className="md:col-span-3">
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Município *
                    </label>
                    <input
                      type="text"
                      value={form.municipio || ''}
                      onChange={(e) => setForm(prev => ({ ...prev, municipio: e.target.value }))}
                      className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 ${formErrors.municipio ? 'border-red-500' : 'border-gray-300 dark:border-gray-600'} dark:bg-[#1a2a3e] dark:text-gray-100`}
                    />
                    {formErrors.municipio && (
                      <p className="text-red-500 text-xs mt-1">{formErrors.municipio}</p>
                    )}
                  </div>

                  <div className="md:col-span-3">
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Link do Google Maps *
                    </label>
                    <input
                      type="url"
                      value={form.mapaUrl || ''}
                      onChange={(e) => setForm(prev => ({ ...prev, mapaUrl: e.target.value }))}
                      placeholder="https://www.google.com/maps/d/u/0/viewer?..."
                      className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 ${formErrors.mapaUrl ? 'border-red-500' : 'border-gray-300 dark:border-gray-600'} dark:bg-[#1a2a3e] dark:text-gray-100`}
                    />
                    {formErrors.mapaUrl ? (
                      <p className="text-red-500 text-xs mt-1">{formErrors.mapaUrl}</p>
                    ) : (
                      <p className="text-xs text-gray-500 mt-1">
                        Cole o link completo do Google Maps para este imóvel
                      </p>
                    )}
                  </div>
                </div>

                {/* ABA DOCUMENTOS — Documentos e Registros */}
                <div className={`pt-4 ${activeFormTab !== 'documentos' ? 'hidden' : ''}`}>
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Documentos e Registros</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="md:col-span-2">
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Matrículas
                      </label>

                      <div className="space-y-3">
                        {form.matriculasDados?.map((matricula) => (
                          <div key={matricula.id} className="flex gap-2 items-start bg-gray-50 dark:bg-[#1a2a3e] p-3 rounded-lg border border-gray-100 dark:border-gray-700 relative">
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
                                className={`px-3 py-2 border rounded-lg flex items-center justify-center transition-colors ${matricula.url ? 'bg-green-50 text-green-600 border-green-200 hover:bg-green-100' : 'bg-white dark:bg-[#1a2a3e] text-gray-600 dark:text-gray-300 border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700'}`}
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
                                className="px-3 py-2 border border-red-200 dark:border-red-800 text-red-500 dark:text-red-400 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors bg-white dark:bg-[#1a2a3e]"
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

                        <button
                          type="button"
                          onClick={handleAddMatricula}
                          className="inline-flex items-center gap-2 px-3 py-1.5 text-sm bg-blue-50 text-blue-600 hover:bg-blue-100 rounded-lg transition-colors font-medium border border-blue-100"
                        >
                          <Plus className="w-4 h-4" /> Nova Matrícula
                        </button>

                        {(!form.matriculasDados || form.matriculasDados.length === 0) && (
                          <div className="text-center py-4 bg-gray-50 dark:bg-[#1a2a3e] border border-dashed border-gray-300 dark:border-gray-600 rounded-lg">
                            <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">Nenhuma matrícula adicionada</p>
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

                    <div className="md:col-span-2">
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        N INCRA / CCIR (Cadastro de Imóvel Rural)
                      </label>
                      <div className="space-y-2">
                        {form.ccirDados?.map((ccir) => (
                          <div key={ccir.id} className="flex flex-col gap-1 p-3 bg-gray-50 dark:bg-[#1a2a3e] rounded-lg border border-gray-200 dark:border-gray-700">
                            <div className="flex gap-2 relative">
                              <input
                                type="text"
                                value={ccir.numero}
                                onChange={(e) => handleCcirChange(ccir.id, e.target.value)}
                                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 dark:bg-[#1a2a3e] dark:text-gray-100 rounded-lg focus:ring-2 focus:ring-blue-500"
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
                                className={`px-3 py-2 border rounded-lg flex items-center justify-center transition-colors ${ccir.url ? 'bg-green-50 text-green-600 border-green-200 hover:bg-green-100' : 'bg-white dark:bg-[#1a2a3e] text-gray-600 dark:text-gray-300 border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700'}`}
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
                          <div className="p-4 border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-lg text-center bg-gray-50 dark:bg-[#1a2a3e] bg-opacity-50">
                            <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">Nenhum CCIR adicionado</p>
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
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        CAR (Cadastro Ambiental Rural)
                      </label>
                      <div className="flex gap-2 relative">
                        <input
                          type="text"
                          value={form.car || ''}
                          onChange={(e) => setForm(prev => ({ ...prev, car: e.target.value }))}
                          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 dark:bg-[#1a2a3e] dark:text-gray-100 rounded-lg focus:ring-2 focus:ring-blue-500"
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
                          className={`px-3 py-2 border rounded-lg flex items-center justify-center transition-colors ${form.carUrl ? 'bg-green-50 text-green-600 border-green-200 hover:bg-green-100' : 'bg-gray-50 dark:bg-[#1a2a3e] text-gray-600 dark:text-gray-300 border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700'}`}
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
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Status CAR
                      </label>
                      <select
                        value={form.statusCar || 'ATIVO - AGUARDANDO ANÁLISE SC'}
                        onChange={(e) => setForm(prev => ({ ...prev, statusCar: e.target.value }))}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 dark:bg-[#1a2a3e] dark:text-gray-100 rounded-lg focus:ring-2 focus:ring-blue-500"
                      >
                        <option>ATIVO - AGUARDANDO ANÁLISE SC</option>
                        <option>ATIVO</option>
                        <option>PENDENTE</option>
                        <option>INATIVO</option>
                      </select>
                    </div>

                    <div className="md:col-span-2">
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        ITR
                      </label>

                      <div className="space-y-3">
                        {form.itrDados?.map((item) => (
                          <div key={item.id} className="flex gap-2 items-start bg-gray-50 dark:bg-[#1a2a3e] p-3 rounded-lg border border-gray-100 dark:border-gray-700 relative">
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
                                  className={`px-3 py-2 border rounded-lg flex items-center justify-center transition-colors ${item.declaracaoUrl ? 'bg-blue-50 text-blue-600 border-blue-200 hover:bg-blue-100' : 'bg-white dark:bg-[#1a2a3e] text-gray-600 dark:text-gray-300 border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700'}`}
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
                                  className={`px-3 py-2 border rounded-lg flex items-center justify-center transition-colors ${item.reciboUrl ? 'bg-green-50 text-green-600 border-green-200 hover:bg-green-100' : 'bg-white dark:bg-[#1a2a3e] text-gray-600 dark:text-gray-300 border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700'}`}
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
                            
                            {(item.declaracaoUrl || item.reciboUrl) && (
                              <div className="absolute -bottom-2 left-3 bg-white px-2 flex items-center gap-3 text-[10px] border border-gray-100 rounded-full shadow-sm">
                                {item.declaracaoUrl && (
                                  <div className="flex items-center gap-1 text-blue-600">
                                    <Check className="w-3 h-3" /> Decl.
                                    <a href={item.declaracaoUrl} target="_blank" rel="noopener noreferrer" className="hover:underline font-bold inline-flex items-center">
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

                        <button
                          type="button"
                          onClick={handleAddItr}
                          className="inline-flex items-center gap-2 px-3 py-1.5 text-sm bg-blue-50 text-blue-600 hover:bg-blue-100 rounded-lg transition-colors font-medium border border-blue-100"
                        >
                          <Plus className="w-4 h-4" /> Novo ITR
                        </button>

                        {(!form.itrDados || form.itrDados.length === 0) && (
                          <div className="text-center py-4 bg-gray-50 dark:bg-[#1a2a3e] border border-dashed border-gray-300 dark:border-gray-600 rounded-lg">
                            <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">Nenhum ITR adicionado</p>
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

                {/* ABA BÁSICO (continuação) — Georreferenciamento / Incra */}
                <div className={`border-t border-gray-200 dark:border-gray-700 pt-4 ${activeFormTab !== 'basico' ? 'hidden' : ''}`}>
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Georreferenciamento / Incra</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Geo Certificação
                      </label>
                      <select
                        value={form.geoCertificacao || 'NÃO'}
                        onChange={(e) => setForm(prev => ({ ...prev, geoCertificacao: e.target.value as 'SIM' | 'NÃO' }))}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 dark:bg-[#1a2a3e] dark:text-gray-100 rounded-lg focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="SIM">SIM</option>
                        <option value="NÃO">NÃO</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Geo Registro
                      </label>
                      <select
                        value={form.geoRegistro || 'NÃO'}
                        onChange={(e) => setForm(prev => ({ ...prev, geoRegistro: e.target.value as 'SIM' | 'NÃO' }))}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 dark:bg-[#1a2a3e] dark:text-gray-100 rounded-lg focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="SIM">SIM</option>
                        <option value="NÃO">NÃO</option>
                      </select>
                    </div>
                  </div>
                </div>

                {/* ABA ÁREAS — Áreas (em hectares) */}
                <div className={`pt-4 ${activeFormTab !== 'areas' ? 'hidden' : ''}`}>
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Áreas (em hectares)</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Área Total (ha)
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        value={form.areaTotal || ''}
                        onChange={(e) => setForm(prev => ({ ...prev, areaTotal: parseFloat(e.target.value) || 0 }))}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 dark:bg-[#1a2a3e] dark:text-gray-100 rounded-lg focus:ring-2 focus:ring-blue-500"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        20% Reserva Legal (ha)
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        value={form.reservaLegal || ''}
                        onChange={(e) => setForm(prev => ({ ...prev, reservaLegal: parseFloat(e.target.value) || 0 }))}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 dark:bg-[#1a2a3e] dark:text-gray-100 rounded-lg focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  </div>
                </div>

                {/* ABA ÁREAS (continuação) — Culturas */}
                <div className={`border-t border-gray-200 dark:border-gray-700 pt-4 ${activeFormTab !== 'areas' ? 'hidden' : ''}`}>
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Culturas</h3>
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Cultura 1
                      </label>
                      <input
                        type="text"
                        value={form.cultura1 || ''}
                        onChange={(e) => setForm(prev => ({ ...prev, cultura1: e.target.value }))}
                        placeholder="Ex: Cultura Temporária"
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 dark:bg-[#1a2a3e] dark:text-gray-100 rounded-lg focus:ring-2 focus:ring-blue-500"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Área Cultura 1 (ha)
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        value={form.areaCultura1 || ''}
                        onChange={(e) => setForm(prev => ({ ...prev, areaCultura1: parseFloat(e.target.value) || 0 }))}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 dark:bg-[#1a2a3e] dark:text-gray-100 rounded-lg focus:ring-2 focus:ring-blue-500"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Cultura 2
                      </label>
                      <input
                        type="text"
                        value={form.cultura2 || ''}
                        onChange={(e) => setForm(prev => ({ ...prev, cultura2: e.target.value }))}
                        placeholder="Ex: Pasto"
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 dark:bg-[#1a2a3e] dark:text-gray-100 rounded-lg focus:ring-2 focus:ring-blue-500"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Área Cultura 2 (ha)
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        value={form.areaCultura2 || ''}
                        onChange={(e) => setForm(prev => ({ ...prev, areaCultura2: parseFloat(e.target.value) || 0 }))}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 dark:bg-[#1a2a3e] dark:text-gray-100 rounded-lg focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  </div>
                </div>

                {/* ABA ÁREAS (continuação) — Outros Usos */}
                <div className={`border-t border-gray-200 dark:border-gray-700 pt-4 ${activeFormTab !== 'areas' ? 'hidden' : ''}`}>
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Outros Usos</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Outros
                      </label>
                      <input
                        type="text"
                        value={form.outros || ''}
                        onChange={(e) => setForm(prev => ({ ...prev, outros: e.target.value }))}
                        placeholder="Ex: Horta, Servidão"
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 dark:bg-[#1a2a3e] dark:text-gray-100 rounded-lg focus:ring-2 focus:ring-blue-500"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Área Outros (ha)
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        value={form.areaOutros || ''}
                        onChange={(e) => setForm(prev => ({ ...prev, areaOutros: parseFloat(e.target.value) || 0 }))}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 dark:bg-[#1a2a3e] dark:text-gray-100 rounded-lg focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  </div>
                </div>

                {/* ABA AMBIENTAL — APP e Remanescente Florestal */}
                <div className={`pt-4 ${activeFormTab !== 'ambiental' ? 'hidden' : ''}`}>
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">APP e Remanescente Florestal</h3>
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        APP Código Florestal (ha)
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        value={form.appCodigoFlorestal || ''}
                        onChange={(e) => setForm(prev => ({ ...prev, appCodigoFlorestal: parseFloat(e.target.value) || 0 }))}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 dark:bg-[#1a2a3e] dark:text-gray-100 rounded-lg focus:ring-2 focus:ring-blue-500"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        APP Vegetada (ha)
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        value={form.appVegetada || ''}
                        onChange={(e) => setForm(prev => ({ ...prev, appVegetada: parseFloat(e.target.value) || 0 }))}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 dark:bg-[#1a2a3e] dark:text-gray-100 rounded-lg focus:ring-2 focus:ring-blue-500"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        APP Não Vegetada (ha)
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        value={form.appNaoVegetada || ''}
                        onChange={(e) => setForm(prev => ({ ...prev, appNaoVegetada: parseFloat(e.target.value) || 0 }))}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 dark:bg-[#1a2a3e] dark:text-gray-100 rounded-lg focus:ring-2 focus:ring-blue-500"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Remanescente Florestal (ha)
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        value={form.remanescenteFlorestal || ''}
                        onChange={(e) => setForm(prev => ({ ...prev, remanescenteFlorestal: parseFloat(e.target.value) || 0 }))}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 dark:bg-[#1a2a3e] dark:text-gray-100 rounded-lg focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Botões */}
              <div className="flex flex-wrap justify-end gap-3 mt-6 pt-4 border-t border-gray-200 dark:border-gray-700">
                {/* Atalho de gerar/revisar orçamento — só em modo edição (precisa
                    de record persistido). Mesmo handler do botão do card; label
                    muda conforme budgetStatus pra refletir o estado atual. */}
                {editing && isAdmin && (() => {
                  const bs = editing.budgetStatus
                  const isLoading = loadingBudgetForRecord === editing.id
                  const label = (!bs || bs === 'locked')
                    ? 'Gerar orçamento'
                    : (bs === 'sent' || bs === 'revision_requested')
                      ? 'Revisar orçamento'
                      : 'Ver orçamento'
                  return (
                    <button
                      type="button"
                      onClick={() => {
                        setIsModalOpen(false)
                        setFormErrors({})
                        handleOpenBudget(editing)
                      }}
                      disabled={isLoading}
                      className="mr-auto flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-tc-green to-tc-blue text-white font-semibold rounded-xl hover:from-tc-green-dark hover:to-tc-blue-dark shadow-md shadow-tc-blue/25 hover:-translate-y-0.5 transition-all duration-200 disabled:opacity-50"
                    >
                      {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
                      {label}
                    </button>
                  )
                })()}
                <button
                  type="button"
                  onClick={() => {
                    setIsModalOpen(false)
                    setEditing(null)
                    setFormErrors({})
                  }}
                  className="flex items-center gap-3 px-6 py-3 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-200 rounded-xl hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors font-semibold"
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
        {/* Altura FORÇADA (h-, não max-h) pra o flex-1 do iframe esticar.
            Mobile/tablet: 85vh (adapta à viewport).
            Desktop (lg+): 700px fixo (não estica em monitor grande).
            Footer separado do body garante que o botão "Abrir em nova aba"
            sempre fique visível independente da altura do iframe. */}
        <div className="bg-white rounded-lg shadow-xl w-full max-w-5xl h-[85vh] lg:h-[700px] lg:max-h-[85vh] flex flex-col m-4">
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
            <div className="flex-1 min-h-0 p-6 overflow-hidden flex flex-col">
              {isAllowedMapUrl(selectedMapUrl) ? (
                <div className="flex-1 min-h-[300px] rounded-lg overflow-hidden border border-gray-200">
                  <iframe
                    src={convertMapUrlToEmbed(selectedMapUrl)}
                    width="100%"
                    height="100%"
                    allowFullScreen
                    loading="lazy"
                    referrerPolicy="no-referrer-when-downgrade"
                    className="w-full h-full"
                    title={`Mapa do imóvel: ${selectedImovel}`}
                  />
                </div>
              ) : (
                <div className="flex-1 min-h-[300px] flex flex-col items-center justify-center text-center p-8 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
                  <AlertTriangle className="h-10 w-10 text-yellow-500 mb-3" />
                  <p className="text-yellow-800 dark:text-yellow-300 font-semibold mb-1">URL de mapa não confiável</p>
                  <p className="text-yellow-700 dark:text-yellow-400 text-sm max-w-md">
                    Por segurança, só exibimos mapas hospedados no Google Maps. Use o botão abaixo para abrir o link em uma nova aba e verifique antes de seguir.
                  </p>
                </div>
              )}
            </div>
            <div className="flex-shrink-0 px-6 py-3 border-t border-gray-200 flex justify-end">
              <a
                href={selectedMapUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-blue-500 to-indigo-600 text-white font-semibold rounded-xl hover:from-blue-600 hover:to-indigo-700 shadow-md hover:shadow-lg transition-all duration-200"
              >
                <ExternalLink className="w-4 h-4" />
                Abrir em nova aba
              </a>
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
                {(itrDownloadModal.item.declaracaoUrl) && (
                  <a
                    href={itrDownloadModal.item.declaracaoUrl}
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
                  onClick={() => handleDownloadSingleItr(itrDownloadModal.item, itrDownloadModal.imovel)}
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

      {/* Painel de gerenciamento de tc_users (substitui share_links na UI admin) */}
      {isTcUsersPanelOpen && (
        <TcUsersAdminPanel
          isOpen={isTcUsersPanelOpen}
          onClose={() => setIsTcUsersPanelOpen(false)}
          token={token || ''}
          records={records}
          notify={notify}
          confirm={confirm}
        />
      )}

      {/* G7 (migration 040): Editor de orçamento (criação ou revisão) */}
      {budgetEditorRecord && (
        <TcBudgetEditorModal
          isOpen={true}
          onClose={() => { setBudgetEditorRecord(null); setBudgetEditorPayload(null) }}
          record={{
            id: budgetEditorRecord.id,
            imovel: budgetEditorRecord.imovel,
            municipio: budgetEditorRecord.municipio,
            cod_imovel: budgetEditorRecord.codImovel,
            area_total: budgetEditorRecord.areaTotal,
            reserva_legal: budgetEditorRecord.reservaLegal,
            created_by_tc_user_id: budgetEditorRecord.createdByTcUserId || null,
          }}
          existingBudget={budgetEditorPayload?.budget || null}
          existingRevision={
            budgetEditorPayload
              ? budgetEditorPayload.revisions.find(r => r.revision_number === budgetEditorPayload.budget.current_revision) || null
              : null
          }
          tcUserName={budgetEditorRecord.createdByTcFullName || budgetEditorRecord.createdByTcUsername || null}
          onSaved={handleBudgetSaved}
          notify={notify}
        />
      )}

      {/* G7+G10: Painel de histórico do imóvel — junta eventos do registro
          (cadastros/edições/aprovações) com o ciclo de orçamento (revisões/
          pedidos/pagamentos). Em status 'revision_requested', renderiza
          botões "Aceitar revisão" (abre editor) e "Descartar revisão". */}
      {budgetHistoryPayload && (
        <Modal isOpen={true} onClose={() => {
          setBudgetHistoryPayload(null)
          setBudgetHistoryRecordEvents([])
          setBudgetHistoryRecord(null)
        }}>
          <TcBudgetHistoryPanel
            data={budgetHistoryPayload}
            recordEvents={budgetHistoryRecordEvents}
            recordImovel={budgetHistoryRecord?.imovel || null}
            onAcceptRevision={handleAcceptRevisionFromHistory}
            onRevisionDismissed={handleRevisionDismissedFromHistory}
            notify={notify}
            onClose={() => {
              setBudgetHistoryPayload(null)
              setBudgetHistoryRecordEvents([])
              setBudgetHistoryRecord(null)
            }}
          />
        </Modal>
      )}

      {/* G7: Configurações do template de orçamento — acionado pelo botão
          "Ações → Configurações de orçamento" no header. */}
      {isBudgetSettingsOpen && (
        <Modal isOpen={true} onClose={() => setIsBudgetSettingsOpen(false)}>
          <div className="bg-white dark:!bg-[#1a2332] rounded-2xl shadow-2xl w-[96vw] max-w-4xl max-h-[90vh] flex flex-col overflow-hidden">
            <div className="bg-gradient-to-r from-tc-green to-tc-blue px-6 py-4 text-white flex items-center justify-between">
              <h2 className="text-lg font-bold flex items-center gap-2">
                <Settings className="w-4 h-4" />
                Configurações de orçamento
              </h2>
              <button type="button" onClick={() => setIsBudgetSettingsOpen(false)} className="text-white/80 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 overflow-auto p-6">
              <TcBudgetSettingsTab notify={notify} />
            </div>
          </div>
        </Modal>
      )}

      {/* G4.3 — toasts e dialog de confirmação renderizados em portal lógico
          (z-index alto, position fixed). Veja src/.../_terracontrol/feedback.tsx. */}
      <FeedbackHost />
    </div>
  )
}

export default TerraControl

