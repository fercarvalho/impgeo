import React, { useState, useEffect, useMemo } from 'react'
import { Map as MapIcon, ExternalLink, Download, FileText, ClipboardCheck, Loader2, Archive, X, Phone, Mail, Globe, Search, User, AlertTriangle } from 'lucide-react'
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
} from './_terracontrol'

const API_BASE_URL = '/api'

const TerraControlView: React.FC<{ token: string }> = ({ token }) => {
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
  // precisam passar o share token (e a senha validada, se houver) como query
  // params. Helper aplicado em todo <a href> e fetch() de PDF.
  // URLs externas (Google Drive etc.) passam intactas.
  const withShareAuth = (url?: string): string => {
    if (!url) return ''
    if (!url.startsWith('/api/documents/')) return url
    const params = new URLSearchParams({ token })
    if (validatedPassword) params.set('password', validatedPassword)
    return `${url}?${params.toString()}`
  }

  useEffect(() => {
    const controller = new AbortController()

    const loadRecords = async () => {
      let aborted = false
      try {
        // Tentar carregar sem senha primeiro
        const response = await fetch(`${API_BASE_URL}/terracontrol/public/${token}`, { signal: controller.signal })
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
        `${API_BASE_URL}/terracontrol/public/${token}?password=${encodeURIComponent(password.trim())}`,
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
        alert('Nenhum documento disponível para download neste registro.')
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
    return (
      <div className="min-h-screen bg-gradient-to-br from-emerald-50 to-blue-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden">
          <div className="bg-gradient-to-r from-[#86CA2D] to-[#1276F5] px-8 py-8 text-center">
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
              className="w-full px-4 py-3 bg-gradient-to-r from-[#86CA2D] to-[#1276F5] text-white rounded-xl hover:from-[#6BA224] hover:to-[#0E5EC4] font-semibold shadow-md shadow-blue-500/25 hover:-translate-y-0.5 transition-all duration-200 disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:translate-y-0 flex items-center justify-center gap-2"
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
      {/* Header */}
      <div className="bg-gradient-to-r from-[#6BA224] to-[#0E5EC4] text-white shadow-lg">
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
              <span className="text-base font-bold text-white">IMPGEO</span>
            </div>
          </div>
        </div>
      </div>

      <main className="max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8 space-y-6">
        {/* Mensagem de Boas-vindas */}
        <div className="bg-gradient-to-r from-[#86CA2D] to-[#1276F5] text-white rounded-2xl shadow-md shadow-blue-500/20 p-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-white/15 rounded-xl flex items-center justify-center flex-shrink-0">
              <User className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-bold">
                Bem-vindo(a){shareLinkName ? `, ${shareLinkName}` : ''}
              </h2>
              <p className="text-blue-100 text-sm">Gerencie seus imóveis de maneira descomplicada</p>
            </div>
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
              <div key={acomp.id} className="bg-white dark:!bg-[#243040] rounded-2xl shadow-md border border-gray-200 dark:border-gray-700 overflow-hidden hover:shadow-lg transition-shadow duration-200">

                {/* ── HEADER ───────────────────────────────── */}
                <div className="bg-gradient-to-r from-[#86CA2D] to-[#1276F5] px-4 py-3 flex items-center justify-between gap-3">
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
                      onClick={() => handleDownloadRegistro(acomp)}
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
                              ? <a href={withShareAuth(mat.url)} target="_blank" rel="noopener noreferrer" title={`Baixar matrícula ${mat.numero}`} className="text-xs text-blue-600 dark:text-blue-400 hover:underline font-medium whitespace-nowrap inline-flex items-center gap-0.5"><FileText className="w-3 h-3 shrink-0" />{mat.numero}</a>
                              : <span className="text-xs text-gray-700 dark:text-gray-300 whitespace-nowrap">{mat.numero}</span>
                            }
                            {i < acomp.matriculasDados!.length - 1 && <span className="text-gray-300 text-xs">,</span>}
                          </React.Fragment>
                        )) : <span className="text-xs text-gray-400">—</span>}
                      </div>
                      {hasMatriculas && (
                        <button type="button" disabled={!hasMatriculasPdfs || isDownloadingZip === acomp.id}
                          onClick={() => handleDownloadAllMatriculas(acomp)}
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
                              ? <a href={withShareAuth(item.url)} target="_blank" rel="noopener noreferrer" title={`Baixar CCIR ${item.numero}`} className="text-xs text-blue-600 dark:text-blue-400 hover:underline font-medium whitespace-nowrap inline-flex items-center gap-0.5"><FileText className="w-3 h-3 shrink-0" />{item.numero}</a>
                              : <span className="text-xs text-gray-700 dark:text-gray-300 whitespace-nowrap">{item.numero}</span>
                            }
                            {i < acomp.ccirDados!.length - 1 && <span className="text-gray-300 text-xs">,</span>}
                          </React.Fragment>
                        )) : <span className="text-xs text-gray-400">{acomp.nIncraCcir || '—'}</span>}
                      </div>
                      {hasCcir && (
                        <button type="button" disabled={!hasCcirPdfs || isDownloadingZip === acomp.id + 'ccir'}
                          onClick={() => handleDownloadAllCcir(acomp)}
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
                            ? <a href={withShareAuth(acomp.carUrl)} target="_blank" rel="noopener noreferrer" title={`Baixar CAR: ${acomp.car}`} className="text-xs text-blue-600 dark:text-blue-400 hover:underline font-medium inline-flex items-center gap-0.5 truncate max-w-[180px]"><Download className="w-3 h-3 shrink-0" />{acomp.car}</a>
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
                          onClick={() => handleDownloadAllItr(acomp)}
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
                          <div className="bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-100 dark:border-emerald-800/50 rounded-xl px-3 py-1.5">
                            <div className="text-xs font-semibold text-emerald-800 dark:text-emerald-300">{acomp.cultura2}</div>
                            <div className="text-xs text-emerald-500 dark:text-emerald-400 mt-0.5">{formatNumber(acomp.areaCultura2)} ha</div>
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
                  className="inline-flex items-center gap-3 px-6 py-3 bg-gradient-to-r from-[#86CA2D] to-[#1276F5] text-white font-semibold rounded-xl hover:from-[#6BA224] hover:to-[#0E5EC4] shadow-lg hover:shadow-xl transform hover:-translate-y-1 transition-all duration-300"
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
                    href={withShareAuth(itrDownloadModal.item.declaracaoUrl || itrDownloadModal.item.url)}
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
    </div>
  )
}

export default TerraControlView

