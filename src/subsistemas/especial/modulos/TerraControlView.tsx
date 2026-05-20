import React, { useState, useEffect, useMemo } from 'react'
import { Map as MapIcon, ExternalLink, Download, FileText, ClipboardCheck, Loader2, Archive, X, Phone, Mail, Globe, Search, User, AlertTriangle, Share2 } from 'lucide-react'
import ChartModal from '@/components/modals/ChartModal'
import Modal from '@/components/Modal'
// Tipos, normalize, helpers de URL/cultura, builders de gráfico e empacotadores
// de ZIP vêm dos módulos compartilhados — ver src/subsistemas/especial/modulos/
// terracontrol/. Antes desta refatoração (G3.1), tudo estava duplicado aqui
// e em TerraControl.tsx, com pequenas divergências que vazavam bugs.
import {
  type ItrItem,
  type TerraControlRecord,
  type SortField,
  type SortDirection,
  normalizeRecords,
  formatCodImovel,
  formatNumber,
  isAllowedMapUrl,
  convertMapUrlToEmbed,
  getAreaByCulturaType,
  type ChartDatum,
  type APPField,
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
  PasswordGate,
} from './_terracontrol'

const API_BASE_URL = '/api'

// ---------------------------------------------------------------------------
// Modos de renderização
// ---------------------------------------------------------------------------
// O TerraControlView agora suporta 2 modos de operação:
//
//   1. mode={ kind: 'share', token } (default, retrocompat)
//      Fluxo público anônimo: lê /api/terracontrol/public/:token, abre
//      PasswordGate se necessário, autentica downloads via query string.
//
//   2. mode={ kind: 'tcuser', tcToken, tcUser, headerSlot, onShareBulk, onShareSingle }
//      Tc_user logado em terracontrol.viverdepj.com.br: lê /api/tc-auth/me/records
//      com Authorization Bearer, header substituído pelo TcHeader (logo+menu de
//      usuário), botões opcionais de compartilhamento (bulk no header + por card)
//      visíveis quando tcUser.canShare === true.
//
// Mantemos a assinatura `{ token: string }` como fallback pra compat com chamadas
// antigas (TerraControlView token=...).
//
export type TerraControlViewMode =
  | { kind: 'share'; token: string }
  | {
      kind: 'tcuser'
      tcToken: string
      tcUserFirstName?: string | null
      // Slot opcional para substituir o header padrão (logo+by). Se omitido,
      // o header padrão é renderizado.
      headerSlot?: React.ReactNode
      // Quando definido E tcUser.canShare = true, renderiza botão "Compartilhar"
      // no topo da página que abre modal de seleção múltipla.
      onShareBulk?: (recordIds: string[]) => void
      // Quando definido E tcUser.canShare = true, renderiza botão pequeno
      // "Compartilhar este imóvel" em cada card.
      onShareSingle?: (recordId: string) => void
    }

interface Props {
  // Modo novo (discriminated union)
  mode?: TerraControlViewMode
  // Modo legado (retrocompat — equivale a mode={ kind: 'share', token })
  token?: string
}

const TerraControlView: React.FC<Props> = (props) => {
  // Resolução do modo: novo `mode` tem precedência; senão usa `token` legado.
  const mode: TerraControlViewMode = props.mode
    ?? { kind: 'share', token: props.token ?? '' }
  const isTcUserMode = mode.kind === 'tcuser'
  // G4.3 — substitui alert()/window.confirm() nativos por toast/dialog estilizados
  const { notify, FeedbackHost } = useFeedback()
  const [records, setRecords] = useState<TerraControlRecord[]>([])
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
  const [validatedPassword, setValidatedPassword] = useState<string>('')
  const [searchTerm, setSearchTerm] = useState('')

  // G2.1 — após o backend exigir auth em /api/documents, links públicos
  // precisam passar auth como query params (Authorization header não funciona
  // em <a href> nem em iframe). Helper aplicado em todo <a href> e fetch() de
  // PDF. URLs externas (Google Drive etc.) passam intactas.
  //
  // Modo 'share' → ?token=<share_token>&password=<password_validada>
  // Modo 'tcuser' → ?tcAuth=<jwt> (access token, expira em 15min — aceitável
  //                pra UX de download direto via clique)
  const withShareAuth = (url?: string): string => {
    if (!url) return ''
    if (!url.startsWith('/api/documents/')) return url
    if (mode.kind === 'tcuser') {
      const params = new URLSearchParams({ tcAuth: mode.tcToken })
      return `${url}?${params.toString()}`
    }
    const params = new URLSearchParams({ token: mode.token })
    if (validatedPassword) params.set('password', validatedPassword)
    return `${url}?${params.toString()}`
  }

  useEffect(() => {
    const controller = new AbortController()

    const loadRecords = async () => {
      let aborted = false
      try {
        // Modo tc_user: lê /api/tc-auth/me/records com Authorization Bearer.
        // Sem PasswordGate — o login já aconteceu.
        if (mode.kind === 'tcuser') {
          const response = await fetch(`${API_BASE_URL}/tc-auth/me/records`, {
            signal: controller.signal,
            headers: { Authorization: `Bearer ${mode.tcToken}` },
            credentials: 'include',
          })
          const result = await response.json()
          if (response.ok && result.success) {
            setRecords(normalizeRecords(result.data || []))
            setShareLinkName(mode.tcUserFirstName || null)
            setRequiresPassword(false)
          } else {
            setError(result?.error || 'Erro ao carregar registros')
          }
          return
        }

        // Modo share (público anônimo) — tenta sem senha primeiro
        const response = await fetch(`${API_BASE_URL}/terracontrol/public/${mode.token}`, { signal: controller.signal })
        const result = await response.json()

        if (result.success) {
          setRecords(normalizeRecords(result.data))
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
        console.error('Erro ao carregar TerraControl:', error)
        setError('Erro ao carregar dados')
      } finally {
        if (!aborted) setLoading(false)
      }
    }
    loadRecords()

    return () => { controller.abort() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode.kind, mode.kind === 'share' ? mode.token : mode.tcToken])

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setPasswordError('')

    if (!password.trim()) {
      setPasswordError('Por favor, informe a senha')
      return
    }

    // Não deve ser possível, mas blindando: PasswordGate só renderiza em mode 'share'
    if (mode.kind !== 'share') return
    setIsSubmittingPassword(true)
    try {
      const response = await fetch(
        `${API_BASE_URL}/terracontrol/public/${mode.token}?password=${encodeURIComponent(password.trim())}`,
        { method: 'GET' }
      )
      const result = await response.json()

      if (result.success) {
        setRecords(normalizeRecords(result.data))
        setShareLinkName(result.shareLinkName)
        setRequiresPassword(false)
        // Guarda a senha que acabou de funcionar — usada pelo withShareAuth
        // para autenticar downloads de PDF posteriores. Limpa o campo do form.
        setValidatedPassword(password.trim())
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

  // Handlers de download finos: gerenciam só o estado visual de "downloading"
  // e delegam a montagem do ZIP para os helpers em ./terracontrol/downloads.ts.
  // Cada chamada injeta withShareAuth para que /api/documents/* receba o
  // share token na query string (G2.1).
  const handleDownloadAllMatriculas = async (record: TerraControlRecord) => {
    setIsDownloadingZip(record.id)
    try {
      await downloadAllMatriculasZip(record.matriculasDados || [], record.imovel, withShareAuth)
    } finally {
      setIsDownloadingZip(null)
    }
  }

  const handleDownloadAllItr = async (record: TerraControlRecord) => {
    setIsDownloadingZip(record.id + 'itr')
    try {
      await downloadAllItrZip(record.itrDados || [], record.imovel, withShareAuth)
    } finally {
      setIsDownloadingZip(null)
    }
  }

  const handleDownloadSingleItr = async (item: ItrItem, imovelName: string) => {
    setIsDownloadingSingleZip(item.id)
    try {
      await downloadSingleItrZip(item, imovelName, withShareAuth)
    } finally {
      setIsDownloadingSingleZip(null)
    }
  }

  const handleDownloadAllCcir = async (record: TerraControlRecord) => {
    setIsDownloadingZip(record.id + 'ccir')
    try {
      await downloadAllCcirZip(record.ccirDados || [], record.imovel, withShareAuth)
    } finally {
      setIsDownloadingZip(null)
    }
  }

  const handleDownloadRegistro = async (record: TerraControlRecord) => {
    setIsDownloadingRecordZip(record.id)
    try {
      const result = await downloadRegistroZip(record, withShareAuth)
      if (result.empty) {
        notify('Nenhum documento disponível para download neste registro.', { type: 'info' })
      }
    } finally {
      setIsDownloadingRecordZip(null)
    }
  }

  // Helpers de cálculo derivados dos registros (G3.6 — memoizados).
  // Antes recalculavam a cada render mesmo sem o records mudar.
  const totalImoveisData       = useMemo(() => getTotalImoveisData(records),    [records])
  const areaTotalData          = useMemo(() => getAreaTotalData(records),       [records])
  const geoCertificacaoData    = useMemo(() => getGeoCertificacaoData(records), [records])
  const geoRegistroData        = useMemo(() => getGeoRegistroData(records),     [records])
  const reservaLegalData       = useMemo(() => getReservaLegalData(records),    [records])
  // Para builders que tomam um parâmetro (tipo/field), só capturamos `records`
  // num closure — quem chama passa o argumento. A memoização real fica a cargo
  // do useMemo do total agregado abaixo.
  const culturaChartData = (tipo: string)    => getCulturaData(records, tipo)
  const appChartData     = (field: APPField) => getAPPData(records, field)
  const areaPorCultura   = (tipo: string)    => getAreaByCulturaType(records, tipo)

  // Abre o ChartModal com os dados informados. Centralizado aqui porque vários
  // stat cards diferentes chamam a mesma rotina (título + dados + total).
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

  const getSortValue = (record: TerraControlRecord, field: SortField): string | number => {
    if (field === 'saldoReservaLegal') {
      return (record.reservaLegal || 0) - ((record.areaTotal || 0) * 0.2)
    }
    return record[field as keyof TerraControlRecord] as string | number
  }

  // G3.4 — filter + sort num único useMemo (já era assim na View; mantido).
  const sortedRecords = useMemo(() => {
    const lower = searchTerm.toLowerCase()
    const filtered = searchTerm
      ? records.filter(a =>
          (a.imovel || '').toLowerCase().includes(lower) ||
          (a.municipio || '').toLowerCase().includes(lower) ||
          String(a.codImovel ?? '').includes(searchTerm)
        )
      : [...records]

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
  }, [records, sortField, sortDirection, searchTerm])

  // G5.4 — paginação incremental client-side (mesmo padrão do componente autenticado).
  const [visibleCount, setVisibleCount] = useState(30)
  useEffect(() => {
    setVisibleCount(30)
  }, [searchTerm, sortField, sortDirection])
  const visibleRecords = useMemo(
    () => sortedRecords.slice(0, visibleCount),
    [sortedRecords, visibleCount]
  )
  const hasMoreToLoad = visibleCount < sortedRecords.length

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
      <div className="min-h-screen bg-gradient-to-br from-emerald-50 to-blue-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <p className="text-gray-500 font-medium">Carregando dados...</p>
        </div>
      </div>
    )
  }

  if (requiresPassword) {
    // Tela de "login" do share link — layout idêntico ao Login.tsx do impgeo
    // (glassmorphism + spotlight + grid de pontos + ondas SVG), mas com a
    // paleta verde/azul TerraControl. Extraída pra _terracontrol/PasswordGate.
    return (
      <PasswordGate
        shareLinkName={shareLinkName}
        password={password}
        passwordError={passwordError}
        isSubmitting={isSubmittingPassword}
        onPasswordChange={(value) => {
          setPassword(value)
          setPasswordError('')
        }}
        onSubmit={handlePasswordSubmit}
      />
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-emerald-50 to-blue-50 flex items-center justify-center p-4">
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
      {/* Header — em modo tc_user, slot customizado (TcHeader com menu de
          usuário). Em modo share (default), o header impgeo+by padrão. */}
      {isTcUserMode && mode.kind === 'tcuser' && mode.headerSlot ? (
        mode.headerSlot
      ) : (
        <div className="bg-gradient-to-r from-tc-green-dark to-tc-blue-dark text-white shadow-lg">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <img src="/logo_terracontrol.png" alt="TerraControl" className="h-14 w-14 object-contain rounded-lg" />
                <div>
                  <h1 className="text-xl font-bold">TerraControl</h1>
                  <p className="text-blue-200 text-sm">Plataforma de gestão territorial</p>
                </div>
              </div>
              <div className="flex items-center gap-2.5">
                <img src="/imp_logo.png" alt="IMPGEO Logo" className="h-9 w-9 object-contain rounded-lg" />
                <div className="flex flex-col leading-tight">
                  <span className="text-[10px] text-blue-200 font-medium tracking-wider">by</span>
                  <span className="text-base font-bold text-white">IMPGEO</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      <main className="max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8 space-y-6">
        {/* Mensagem de Boas-vindas */}
        <div className="bg-gradient-to-r from-tc-green to-tc-blue text-white rounded-2xl shadow-md shadow-blue-500/20 p-6">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 bg-white/15 rounded-xl flex items-center justify-center flex-shrink-0">
                <User className="w-5 h-5 text-white" />
              </div>
              <div className="min-w-0">
                <h2 className="text-lg font-bold truncate">
                  Bem-vindo(a){shareLinkName ? `, ${shareLinkName}` : ''}
                </h2>
                <p className="text-blue-100 text-sm">Gerencie seus imóveis de maneira descomplicada</p>
              </div>
            </div>
            {/* Botão "Compartilhar" (bulk) — só aparece em tc_user mode com permissão */}
            {mode.kind === 'tcuser' && mode.onShareBulk && (
              <button
                type="button"
                onClick={() => mode.onShareBulk?.(records.map(r => String(r.id)))}
                className="flex-shrink-0 inline-flex items-center gap-2 px-4 h-10 rounded-xl bg-white/15 hover:bg-white/25 border border-white/30 text-white text-sm font-semibold backdrop-blur-sm transition"
              >
                <Share2 className="w-4 h-4" />
                Compartilhar
              </button>
            )}
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

        {/* Estatísticas de APP, Reserva Legal e Remanescente Florestal */}
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4">
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
          <div 
            className="bg-white dark:!bg-[#243040] rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-4 cursor-pointer hover:shadow-md hover:-translate-y-0.5 hover:border-blue-200 dark:hover:border-blue-700 transition-all duration-200"
            onClick={() => openChart('Remanescente Florestal', 'Distribuição de área por imóvel (ha)', appChartData('remanescenteFlorestal'))}
          >
            <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">Remanescente Florestal</p>
            <p className="text-2xl font-bold text-green-600 dark:text-green-400">
              {formatNumber(records.reduce((sum, a) => sum + (a.remanescenteFlorestal || 0), 0))} ha
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
              Mostrando {sortedRecords.length}/{records.length} Resultados
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
          {sortedRecords.length === 0 ? (
            <div className="bg-white dark:!bg-[#243040] rounded-2xl border-2 border-dashed border-gray-200 dark:border-gray-700 p-12 text-center">
              <ClipboardCheck className="h-10 w-10 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500 dark:text-gray-400 font-medium">
                {searchTerm ? `Nenhum resultado para "${searchTerm}"` : 'Nenhum registro disponível'}
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
              <div key={record.id} className="bg-white dark:!bg-[#243040] rounded-2xl shadow-md border border-gray-200 dark:border-gray-700 overflow-hidden hover:shadow-lg transition-shadow duration-200">

                {/* ── HEADER ───────────────────────────────── */}
                <div className="bg-gradient-to-r from-tc-green to-tc-blue px-4 py-3 flex items-start justify-between gap-3">
                  <div className="flex items-start gap-2.5 min-w-0 flex-1">
                    <span className="shrink-0 bg-white/20 text-white text-xs font-bold px-2 py-0.5 rounded-lg tracking-wide mt-0.5">
                      #{formatCodImovel(record.codImovel)}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="text-white font-bold text-sm leading-tight break-words">{record.imovel}</div>
                      <div className="text-blue-200 text-xs mt-0.5">{record.municipio}</div>
                    </div>
                  </div>
                  <div className="flex flex-col sm:flex-row sm:items-center items-stretch gap-1.5 shrink-0">
                    {record.mapaUrl && (
                      <button
                        onClick={() => { setSelectedMapUrl(record.mapaUrl || ''); setSelectedImovel(record.imovel); setIsMapModalOpen(true) }}
                        title="Exibir Mapa"
                        aria-label={`Exibir mapa do imóvel ${record.imovel}`}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 bg-white/20 hover:bg-white/35 rounded-lg transition-colors text-white"
                      >
                        <MapIcon className="w-4 h-4 shrink-0" aria-hidden="true" />
                        <span className="text-xs font-semibold">Exibir Mapa</span>
                      </button>
                    )}
                    <button
                      onClick={() => handleDownloadRegistro(record)}
                      disabled={!hasDocs || isDownloadingRecordZip === record.id}
                      title={hasDocs ? 'Baixar Documentos (ZIP)' : 'Nenhum documento disponível'}
                      aria-label={hasDocs ? `Baixar documentos de ${record.imovel} em ZIP` : 'Nenhum documento disponível'}
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg transition-colors text-white ${hasDocs ? 'bg-white/20 hover:bg-white/35' : 'bg-white/10 opacity-40 cursor-not-allowed'}`}
                    >
                      {isDownloadingRecordZip === record.id
                        ? <Loader2 className="w-4 h-4 shrink-0 animate-spin" aria-hidden="true" />
                        : <Archive className="w-4 h-4 shrink-0" aria-hidden="true" />
                      }
                      <span className="text-xs font-semibold">Baixar Documentos</span>
                    </button>
                    {/* Botão "Compartilhar este imóvel" — só aparece em
                        tc_user mode com permissão de compartilhamento */}
                    {mode.kind === 'tcuser' && mode.onShareSingle && (
                      <button
                        onClick={() => mode.onShareSingle?.(String(record.id))}
                        title="Compartilhar este imóvel"
                        aria-label={`Compartilhar ${record.imovel}`}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 bg-white/20 hover:bg-white/35 rounded-lg transition-colors text-white"
                      >
                        <Share2 className="w-4 h-4 shrink-0" aria-hidden="true" />
                        <span className="text-xs font-semibold">Compartilhar</span>
                      </button>
                    )}
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
                              ? <a href={withShareAuth(mat.url)} target="_blank" rel="noopener noreferrer" title={`Baixar matrícula ${mat.numero}`} className="text-xs text-blue-600 dark:text-blue-400 hover:underline font-medium whitespace-nowrap inline-flex items-center gap-0.5"><FileText className="w-3 h-3 shrink-0" />{mat.numero}</a>
                              : <span className="text-xs text-gray-700 dark:text-gray-300 whitespace-nowrap">{mat.numero}</span>
                            }
                            {i < record.matriculasDados!.length - 1 && <span className="text-gray-300 text-xs">,</span>}
                          </React.Fragment>
                        )) : <span className="text-xs text-gray-400">—</span>}
                      </div>
                      {hasMatriculas && (
                        <button type="button" disabled={!hasMatriculasPdfs || isDownloadingZip === record.id}
                          onClick={() => handleDownloadAllMatriculas(record)}
                          title={hasMatriculasPdfs ? 'Baixar todas as matrículas (ZIP)' : 'Nenhum PDF de matrícula anexado neste registro'}
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
                              ? <a href={withShareAuth(item.url)} target="_blank" rel="noopener noreferrer" title={`Baixar CCIR ${item.numero}`} className="text-xs text-blue-600 dark:text-blue-400 hover:underline font-medium whitespace-nowrap inline-flex items-center gap-0.5"><FileText className="w-3 h-3 shrink-0" />{item.numero}</a>
                              : <span className="text-xs text-gray-700 dark:text-gray-300 whitespace-nowrap">{item.numero}</span>
                            }
                            {i < record.ccirDados!.length - 1 && <span className="text-gray-300 text-xs">,</span>}
                          </React.Fragment>
                        )) : <span className="text-xs text-gray-400">{record.nIncraCcir || '—'}</span>}
                      </div>
                      {hasCcir && (
                        <button type="button" disabled={!hasCcirPdfs || isDownloadingZip === record.id + 'ccir'}
                          onClick={() => handleDownloadAllCcir(record)}
                          title={hasCcirPdfs ? 'Baixar todos os CCIRs (ZIP)' : 'Nenhum PDF de CCIR anexado neste registro'}
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
                            ? <a href={withShareAuth(record.carUrl)} target="_blank" rel="noopener noreferrer" title={`Baixar CAR: ${record.car}`} className="text-xs text-blue-600 dark:text-blue-400 hover:underline font-medium inline-flex items-center gap-0.5 truncate max-w-[180px]"><Download className="w-3 h-3 shrink-0" />{record.car}</a>
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
                          title={hasItrPdfs ? 'Baixar todos os ITRs (ZIP)' : 'Nenhum PDF de ITR anexado neste registro'}
                          className={`p-1 rounded-full shrink-0 transition-colors ${hasItrPdfs ? 'text-blue-500 hover:bg-blue-100 dark:hover:bg-blue-900/30' : 'text-gray-300 cursor-not-allowed'}`}>
                          {isDownloadingZip === record.id + 'itr' ? <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-500" /> : <Download className="w-3.5 h-3.5" />}
                        </button>
                      )}
                    </div>
                  </div>

                  {/* GEORREFERENCIAMENTO */}
                  <div className="px-4 py-3">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-blue-500 dark:text-blue-400 mb-2 flex items-center gap-1.5">
                      <MapIcon className="w-3.5 h-3.5" /> Georreferenciamento / Incra
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
                          <div className="bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-100 dark:border-emerald-800/50 rounded-xl px-3 py-1.5">
                            <div className="text-xs font-semibold text-emerald-800 dark:text-emerald-300">{record.cultura2}</div>
                            <div className="text-xs text-emerald-500 dark:text-emerald-400 mt-0.5">{formatNumber(record.areaCultura2)} ha</div>
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

          {/* G5.4 — "Carregar mais" — mesmo padrão do componente autenticado. */}
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
              {isAllowedMapUrl(selectedMapUrl) ? (
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
              ) : (
                <div className="w-full min-h-[500px] flex flex-col items-center justify-center text-center p-8 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
                  <AlertTriangle className="h-10 w-10 text-yellow-500 mb-3" />
                  <p className="text-yellow-800 dark:text-yellow-300 font-semibold mb-1">URL de mapa não confiável</p>
                  <p className="text-yellow-700 dark:text-yellow-400 text-sm max-w-md">
                    Por segurança, só exibimos mapas hospedados no Google Maps. Use o botão abaixo para abrir o link em uma nova aba e verifique antes de seguir.
                  </p>
                </div>
              )}
              <div className="mt-4 flex justify-end">
                <a
                  href={selectedMapUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-3 px-6 py-3 bg-gradient-to-r from-tc-green to-tc-blue text-white font-semibold rounded-xl hover:from-tc-green-dark hover:to-tc-blue-dark shadow-lg hover:shadow-xl transform hover:-translate-y-1 transition-all duration-300"
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
                {(itrDownloadModal.item.declaracaoUrl) && (
                  <a
                    href={withShareAuth(itrDownloadModal.item.declaracaoUrl)}
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
                    href={withShareAuth(itrDownloadModal.item.reciboUrl)}
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
                  onClick={() => handleDownloadSingleItr(itrDownloadModal.item, itrDownloadModal.imovel)}
                  disabled={isDownloadingSingleZip === itrDownloadModal.item.id}
                  className="w-full flex items-center justify-between p-4 bg-emerald-50 dark:bg-emerald-900/20 hover:bg-emerald-100 dark:hover:bg-emerald-900/40 rounded-xl transition-all group disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-400 rounded-lg group-hover:bg-emerald-200 dark:group-hover:bg-emerald-900/60">
                      {isDownloadingSingleZip === itrDownloadModal.item.id ? (
                        <Loader2 className="w-6 h-6 animate-spin" />
                      ) : (
                        <Archive className="w-6 h-6" />
                      )}
                    </div>
                    <div className="text-left">
                      <div className="font-semibold text-emerald-900 dark:text-emerald-200">Baixar Ambos (ZIP)</div>
                      <div className="text-xs text-emerald-600 dark:text-emerald-400">Pacote completo do ITR</div>
                    </div>
                  </div>
                  <Download className="w-5 h-5 text-emerald-400 group-hover:text-emerald-600 dark:group-hover:text-emerald-300" />
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

      {/* G4.3 — toasts renderizados em portal lógico (z-index alto, fixed). */}
      <FeedbackHost />
    </div>
  )
}

export default TerraControlView

