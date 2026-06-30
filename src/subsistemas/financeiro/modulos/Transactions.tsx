import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { DollarSign, Plus, Download, Upload, Edit, Trash2, Calendar, Filter, X, RefreshCw, CheckCircle2, ChevronRight, ChevronLeft, Settings, MoreHorizontal, Link2 } from 'lucide-react'
import ProjectPickerModal from '@/components/ProjectPickerModal'
import { usePermissions } from '@/hooks/usePermissions'
import TransactionRulesModal from '@/components/modals/TransactionRulesModal'
import ResolveTransactionModal from '@/components/modals/ResolveTransactionModal'
import PendingTransactionsBanner from '@/components/PendingTransactionsBanner'
import Modal from '@/components/Modal'
import { CATEGORIES_BY_TYPE } from '@/config/categorias'

type TransactionType = 'Receita' | 'Despesa' | 'Transferência entre contas' | 'A confirmar' | 'Reforço de caixa' | 'Retirada de caixa'

interface Transaction {
  id: string
  date: string
  description: string
  value: number
  type: TransactionType
  category: string
  subcategory?: string
  applied_rule_id?: string | null
  original_type?: string | null
  needs_confirmation?: boolean
  is_hidden?: boolean
  project_id?: string | null
  source?: string | null
}

// Rótulo + estilo do badge de ORIGEM da transação (migration 068).
export const SOURCE_LABELS: Record<string, { label: string; badge: string }> = {
  manual:      { label: 'Manual',  badge: 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300' },
  import_xlsx: { label: 'Planilha', badge: 'bg-sky-100 text-sky-800 dark:bg-sky-900/30 dark:text-sky-300' },
  extrato:     { label: 'Extrato',  badge: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-300' },
  fatura:      { label: 'Fatura',   badge: 'bg-violet-100 text-violet-800 dark:bg-violet-900/30 dark:text-violet-300' },
  asaas:       { label: 'Asaas',    badge: 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900/30 dark:text-cyan-300' },
}
export const getSourceMeta = (s: string | null | undefined) =>
  SOURCE_LABELS[s || 'manual'] || SOURCE_LABELS.manual

// Estilos por tipo de transação — usado em badge da lista, valor monetário,
// filtros, etc. Centralizar aqui evita inconsistência de cores.
export const TRANSACTION_TYPE_STYLES: Record<TransactionType, { badge: string; valueText: string; sign: '+' | '-' | '' }> = {
  'Receita': {
    badge: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400',
    valueText: 'text-green-600',
    sign: '+',
  },
  'Despesa': {
    badge: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
    valueText: 'text-red-600',
    sign: '-',
  },
  'Transferência entre contas': {
    badge: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
    valueText: 'text-blue-600',
    sign: '',
  },
  'A confirmar': {
    badge: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400',
    valueText: 'text-purple-600',
    sign: '',
  },
  // Movimentações de caixa (aporte/sangria). Afetam o saldo/caixa, mas NÃO o
  // resultado operacional (DRE) nem as metas.
  'Reforço de caixa': {
    badge: 'bg-teal-100 text-teal-800 dark:bg-teal-900/30 dark:text-teal-400',
    valueText: 'text-teal-600',
    sign: '+',
  },
  'Retirada de caixa': {
    badge: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400',
    valueText: 'text-orange-600',
    sign: '-',
  },
}

// Tipos efetivamente financeiros (entram em DRE/Dashboard). Os outros 2 são
// neutros (transferências internas) ou pendentes (ainda não classificados).
export const FINANCIAL_TRANSACTION_TYPES: TransactionType[] = ['Receita', 'Despesa']
export const isFinancialType = (t: TransactionType | string | undefined): boolean =>
  FINANCIAL_TRANSACTION_TYPES.includes(t as TransactionType)

// Movimentações de caixa: aporte (reforço) e sangria (retirada). Afetam o
// saldo/caixa (reforço soma, retirada subtrai), mas ficam FORA do DRE, das
// metas e dos cards de Receita/Despesa (não são operacionais).
export const CAIXA_TRANSACTION_TYPES: TransactionType[] = ['Reforço de caixa', 'Retirada de caixa']
export const isReforcoType = (t: string | undefined): boolean => t === 'Reforço de caixa'
export const isRetiradaType = (t: string | undefined): boolean => t === 'Retirada de caixa'

// FIX [L52]: PreviewTx definido no escopo do módulo (não dentro do componente)
type PreviewTx = { _id: string; date: string; description: string; value: number; type: 'Receita' | 'Despesa'; category: string }
type PreviewTxWithSelection = PreviewTx & { _selected?: boolean }

const API_BASE_URL = '/api'

// SUBCATEGORIES agora será carregado do backend

interface TransactionsProps {
  showModal?: boolean
  onCloseModal?: () => void
}

// FIX [L1077]: BankBtn e DevBtn definidos fora do componente para evitar re-mount a cada render
interface BankBtnProps { id: string; label: string; bg: string; domain: string; initials: string; disabledInFatura?: boolean; importType: 'extrato' | 'fatura' | null; selectedBank: string | null; onSelect: (id: string) => void }
const BankBtn: React.FC<BankBtnProps> = ({ id, label, bg, domain, initials, disabledInFatura = false, importType, selectedBank, onSelect }) => {
  const isDisabled = disabledInFatura && importType === 'fatura'
  if (isDisabled) return (
    <div className="relative group">
      <button type="button" disabled className="relative flex flex-col items-center gap-2 p-4 rounded-xl border-2 border-dashed border-gray-200 dark:border-gray-600 bg-gray-50 dark:!bg-[#1e2d3e] opacity-60 cursor-not-allowed w-full">
        <div className="w-14 h-14 rounded-xl flex items-center justify-center overflow-hidden p-1 shadow-sm" style={{ backgroundColor: bg }}>
          <img src={`https://logo.clearbit.com/${domain}`} alt={label} className="w-full h-full object-contain" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display='none'; (e.currentTarget.nextSibling as HTMLElement).style.display='flex' }} />
          <span className="hidden w-full h-full items-center justify-center text-white font-bold text-xs">{initials}</span>
        </div>
        <span className="text-xs font-semibold text-gray-500 text-center leading-tight">{label}</span>
      </button>
      <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
        <span className="bg-gray-900/80 text-white text-[10px] font-semibold px-2 py-1 rounded-lg whitespace-nowrap">Sem suporte a fatura</span>
      </div>
    </div>
  )
  return (
    <button type="button" onClick={() => onSelect(selectedBank === id ? '' : id)}
      className={`relative flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all duration-200 hover:shadow-md ${selectedBank === id ? 'border-blue-500 bg-blue-50 shadow-md scale-[1.02]' : 'border-gray-200 bg-white hover:border-blue-300'}`}>
      {selectedBank === id && <CheckCircle2 className="w-4 h-4 text-blue-500 absolute top-2 right-2" />}
      <div className="w-14 h-14 rounded-xl flex items-center justify-center overflow-hidden p-1 shadow-sm" style={{ backgroundColor: bg }}>
        <img src={`https://logo.clearbit.com/${domain}`} alt={label} className="w-full h-full object-contain" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display='none'; (e.currentTarget.nextSibling as HTMLElement).style.display='flex' }} />
        <span className="hidden w-full h-full items-center justify-center text-white font-bold text-xs">{initials}</span>
      </div>
      <span className="text-xs font-semibold text-gray-700 text-center leading-tight">{label}</span>
    </button>
  )
}

interface DevBtnProps { label: string; bg: string; domain: string; initials: string }
const DevBtn: React.FC<DevBtnProps> = ({ label, bg, domain, initials }) => (
  <div className="relative group">
    <button type="button" disabled className="relative flex flex-col items-center gap-2 p-4 rounded-xl border-2 border-dashed border-gray-200 dark:border-gray-600 bg-gray-50 dark:!bg-[#1e2d3e] opacity-60 cursor-not-allowed w-full">
      <div className="w-14 h-14 rounded-xl flex items-center justify-center overflow-hidden p-1 shadow-sm" style={{ backgroundColor: bg }}>
        <img src={`https://logo.clearbit.com/${domain}`} alt={label} className="w-full h-full object-contain" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display='none'; (e.currentTarget.nextSibling as HTMLElement).style.display='flex' }} />
        <span className="hidden w-full h-full items-center justify-center text-white font-bold text-xs">{initials}</span>
      </div>
      <span className="text-xs font-semibold text-gray-500 text-center leading-tight">{label}</span>
    </button>
    <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
      <span className="bg-gray-900/80 text-white text-[10px] font-semibold px-2 py-1 rounded-lg whitespace-nowrap">Em desenvolvimento</span>
    </div>
  </div>
)

const Transactions: React.FC<TransactionsProps> = ({ showModal, onCloseModal }) => {
  const permissions = usePermissions('transactions');
  const projPerms = usePermissions('projects');
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [selectedTransactions, setSelectedTransactions] = useState<Set<string>>(new Set())
  // Vínculo a projeto: mapa id→nome + alvo do seletor ('bulk' = selecionadas; ou um txId)
  const [projectsMap, setProjectsMap] = useState<Record<string, string>>({})
  const [linkPickerFor, setLinkPickerFor] = useState<null | 'bulk' | string>(null)
  const [linkBusy, setLinkBusy] = useState(false)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editing, setEditing] = useState<Transaction | null>(null)
  const [form, setForm] = useState<{date: string; description: string; value: string; type: TransactionType; category: string; subcategory: string}>({
    date: new Date().toISOString().split('T')[0], description: '', value: '', type: 'Receita', category: '', subcategory: ''
  })
  const [formErrors, setFormErrors] = useState<{[key: string]: string}>({})
  const [isImportExportOpen, setIsImportExportOpen] = useState(false)
  const [isAddSubcategoryOpen, setIsAddSubcategoryOpen] = useState(false)
  const [newSubcategory, setNewSubcategory] = useState('')
  const [newSubcategoryError, setNewSubcategoryError] = useState('')
  const [subcategories, setSubcategories] = useState<string[]>([])
  const [isRemoveSubcategoryOpen, setIsRemoveSubcategoryOpen] = useState(false)
  const [isEditSubcategoryOpen, setIsEditSubcategoryOpen] = useState(false)
  const [editSubcategoryName, setEditSubcategoryName] = useState('')
  const [editSubcategoryError, setEditSubcategoryError] = useState('')
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  // ── Estados do modal de importar extrato / fatura ──────────────────────────
  const [isImportExtratoModalOpen, setIsImportExtratoModalOpen] = useState(false)
  const [importType, setImportType] = useState<'extrato' | 'fatura' | null>(null)
  const [selectedBank, setSelectedBank] = useState<string | null>(null)
  const [extratoStep, setExtratoStep] = useState<0 | 1 | 2 | 3>(0)
  const [extratoFile, setExtratoFile] = useState<File | null>(null)
  const [extratoPassword, setExtratoPassword] = useState('')
  const [isUploadingExtrato, setIsUploadingExtrato] = useState(false)
  const [extratoPreview, setExtratoPreview] = useState<PreviewTxWithSelection[]>([])
  const [isConfirmingImport, setIsConfirmingImport] = useState(false)
  // Undo system
  const [lastImportBatch, setLastImportBatch] = useState<string[]>([])
  const [showUndoToast, setShowUndoToast] = useState(false)
  const [undoCountdown, setUndoCountdown] = useState(60)
  const [undoMaxCountdown, setUndoMaxCountdown] = useState(60)
  const [isUndoing, setIsUndoing] = useState(false)

  const [isSyncingAsaas, setIsSyncingAsaas] = useState(false)
  const [syncResult, setSyncResult] = useState<{ inserted: number; skipped: number } | null>(null)

  // Modal "Conjunto de Regras"
  const [isRulesModalOpen, setIsRulesModalOpen] = useState(false)
  // Modal "Gerenciar Subcategorias" (criar / renomear / excluir)
  const [isManageSubcategoriesOpen, setIsManageSubcategoriesOpen] = useState(false)
  const [manageNewName, setManageNewName] = useState('')
  const [manageError, setManageError] = useState('')
  const [manageEditingName, setManageEditingName] = useState<string | null>(null)
  const [manageEditValue, setManageEditValue] = useState('')
  const [manageBusy, setManageBusy] = useState(false)
  // Seleção múltipla pra exclusão em massa no modal Gerenciar
  const [manageSelected, setManageSelected] = useState<Set<string>>(new Set())
  const [manageBulkResult, setManageBulkResult] = useState<{ deleted: string[]; blocked: { name: string; rules: { id: string; name: string }[] }[] } | null>(null)
  // Fluxo "subcategoria em uso por regra(s)": aviso → editar regras → exclui
  const [subcatInUseWarning, setSubcatInUseWarning] = useState<{ name: string; rules: { id: string; name: string }[] } | null>(null)
  const [pendingDeleteSubcat, setPendingDeleteSubcat] = useState<string | null>(null)
  const [subcatDeleteSuccess, setSubcatDeleteSuccess] = useState<string | null>(null)
  // Modal de resolução de conflito (clique na badge "A confirmar")
  const [resolveTarget, setResolveTarget] = useState<{ id: string; description: string } | null>(null)
  // Toggle: mostrar transações ocultas (is_hidden=true), por padrão escondidas
  const [showHidden, setShowHidden] = useState(false)
  // Dropdown "Ações" (agrupa ações secundárias)
  const [isActionsMenuOpen, setIsActionsMenuOpen] = useState(false)
  const actionsMenuRef = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    if (!isActionsMenuOpen) return
    const onClick = (e: MouseEvent) => {
      if (actionsMenuRef.current && !actionsMenuRef.current.contains(e.target as Node)) setIsActionsMenuOpen(false)
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setIsActionsMenuOpen(false) }
    window.addEventListener('mousedown', onClick)
    window.addEventListener('keydown', onKey)
    return () => { window.removeEventListener('mousedown', onClick); window.removeEventListener('keydown', onKey) }
  }, [isActionsMenuOpen])

  // Countdown do toast de desfazer importação
  useEffect(() => {
    if (!showUndoToast) return
    if (undoCountdown <= 0) { setShowUndoToast(false); setLastImportBatch([]); return }
    const timer = setTimeout(() => setUndoCountdown(c => c - 1), 1000)
    return () => clearTimeout(timer)
  }, [showUndoToast, undoCountdown])

  const syncAsaas = async () => {
    setIsSyncingAsaas(true)
    setSyncResult(null)
    try {
      const r = await fetch(`${API_BASE_URL}/asaas/sync`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',

        },
        body: JSON.stringify({}),
      })
      const data = await r.json()
      if (data.success) {
        setSyncResult({ inserted: data.inserted ?? 0, skipped: data.skipped ?? 0 })
        if (data.inserted > 0) {
          // FIX [L88]: incluir Authorization header no refetch após sync
          const r2 = await fetch(`${API_BASE_URL}/transactions`, {
            headers: { }
          })
          const d2 = await r2.json()
          if (d2.success) setTransactions(d2.data || [])
        }
        setTimeout(() => setSyncResult(null), 5000)
      }
    } catch {
      alert('Erro ao sincronizar com Asaas')
    } finally {
      setIsSyncingAsaas(false)
    }
  }

  // filtros / ordenação
  const [sortConfig, setSortConfig] = useState<{ field: keyof Transaction | null, direction: 'asc' | 'desc' }>({ field: null, direction: 'asc' })
  const [filters, setFilters] = useState<{ type: '' | TransactionType, category: string, subcategory: string, dateFrom: string, dateTo: string, description: string, source: string }>({ type: '', category: '', subcategory: '', dateFrom: '', dateTo: '', description: '', source: '' })

  // calendários de filtro

  useEffect(() => {
    const load = async () => {
      try {
        const r = await fetch(`${API_BASE_URL}/transactions`)
        const j = await r.json()
        if (j.success) setTransactions(j.data || [])
      } catch {}
    }
    load()
  }, [])

  // Carregar subcategorias do backend. O DB (tabela subcategories) é a única
  // fonte de verdade — a mesma consumida pelo modal de Regras. Adicionar/remover
  // aqui reflete lá automaticamente (cada modal recarrega do DB ao abrir).
  useEffect(() => {
    const loadSubcategories = async () => {
      try {
        const r = await fetch(`${API_BASE_URL}/subcategories`)
        const j = await r.json()
        if (j.success) setSubcategories(j.data as string[])
      } catch {}
    }
    loadSubcategories()
  }, [])

  // FIX [L174]: usar useCallback para que closeModal seja estável e possa estar nas dependências dos hooks
  const closeModal = useCallback(() => {
    setIsModalOpen(false)
    setEditing(null)
    setFormErrors({})
    if (onCloseModal) {
      onCloseModal()
    }
  }, [onCloseModal])

  // Controla overlay global (classe no body) ao abrir/fechar modais
  useEffect(() => {
    const body = document?.body
    if (!body) return
    if (isImportExportOpen || isModalOpen || isAddSubcategoryOpen || isRemoveSubcategoryOpen || isEditSubcategoryOpen || isManageSubcategoriesOpen || subcatInUseWarning || subcatDeleteSuccess) body.classList.add('modal-open')
    else body.classList.remove('modal-open')
    return () => { body.classList.remove('modal-open') }
  }, [isImportExportOpen, isModalOpen, isAddSubcategoryOpen, isRemoveSubcategoryOpen, isEditSubcategoryOpen, isManageSubcategoriesOpen, subcatInUseWarning, subcatDeleteSuccess])

  // ESC vem do <Modal> via stack global — apenas o modal no topo da pilha
  // responde, preservando hierarquia RemoveSubcategory > AddSubcategory >
  // ImportExport > Modal principal automaticamente conforme a ordem de abertura.

  // FIX [L177]: quando showModal muda para false, usar closeModal para garantir limpeza completa
  useEffect(() => {
    if (showModal !== undefined) {
      if (showModal) {
        setIsModalOpen(true)
      } else {
        closeModal()
      }
    }
  }, [showModal, closeModal])

  const handleSort = (field: keyof Transaction) => {
    let direction: 'asc' | 'desc' = 'asc'
    if (sortConfig.field === field && sortConfig.direction === 'asc') direction = 'desc'
    setSortConfig({ field, direction })
  }

  const getSortIcon = (field: keyof Transaction) => {
    if (sortConfig.field !== field) return <span className="text-gray-400" aria-hidden="true">↕</span>
    return sortConfig.direction === 'asc' ? <span className="text-blue-600" aria-hidden="true">↑</span> : <span className="text-blue-600" aria-hidden="true">↓</span>
  }

  const hiddenCount = useMemo(() => transactions.filter(t => t.is_hidden).length, [transactions])

  const filteredAndSorted = useMemo(() => {
    let list = [...transactions]
    if (!showHidden) list = list.filter(t => !t.is_hidden)
    if (filters.description) list = list.filter(t => t.description.toLowerCase().includes(filters.description.toLowerCase()))
    if (filters.type) list = list.filter(t => t.type === filters.type)
    if (filters.source) list = list.filter(t => (t.source || 'manual') === filters.source)
    if (filters.category) list = list.filter(t => t.category.toLowerCase().includes(filters.category.toLowerCase()))
    if (filters.subcategory) list = list.filter(t => (t.subcategory || '').toLowerCase().includes(filters.subcategory.toLowerCase()))
    // FIX [L209]: comparar strings ISO diretamente para evitar bug de timezone
    if (filters.dateFrom) list = list.filter(t => t.date >= filters.dateFrom)
    if (filters.dateTo) list = list.filter(t => t.date <= filters.dateTo)

    if (sortConfig.field) {
      list.sort((a, b) => {
        let av: any = a[sortConfig.field!]
        let bv: any = b[sortConfig.field!]
        if (sortConfig.field === 'date') {
          av = new Date(av).getTime(); bv = new Date(bv).getTime()
        } else if (sortConfig.field === 'value') {
          av = Number(av); bv = Number(bv)
        } else if (typeof av === 'string') { av = av.toLowerCase(); bv = String(bv).toLowerCase() }
        if (av < bv) return sortConfig.direction === 'asc' ? -1 : 1
        if (av > bv) return sortConfig.direction === 'asc' ? 1 : -1
        return 0
      })
    }
    return list
  }, [transactions, filters, sortConfig, showHidden])

  const handleSelectAll = () => {
    if (selectedTransactions.size === filteredAndSorted.length) setSelectedTransactions(new Set())
    else setSelectedTransactions(new Set(filteredAndSorted.map(t => t.id)))
  }

  const handleSelect = (id: string) => {
    setSelectedTransactions(prev => {
      const s = new Set(prev)
      if (s.has(id)) s.delete(id); else s.add(id)
      return s
    })
  }

  const clearFilters = () => setFilters({ type: '', category: '', subcategory: '', dateFrom: '', dateTo: '', description: '', source: '' })


  // Função para adicionar nova subcategoria
  const addNewSubcategory = async () => {
    if (!newSubcategory.trim()) {
      setNewSubcategoryError('Campo obrigatório')
      return
    }
    
    const trimmedSubcategory = newSubcategory.trim()
    
    if (subcategories.includes(trimmedSubcategory)) {
      setNewSubcategoryError('Esta subcategoria já existe')
      return
    }
    
    try {
      const r = await fetch(`${API_BASE_URL}/subcategories`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: trimmedSubcategory })
      })
      const j = await r.json()
      
      if (j.success) {
        // Recarregar subcategorias do backend (fonte única — sem filtro local)
        const subcategoriesResponse = await fetch(`${API_BASE_URL}/subcategories`)
        const subcategoriesData = await subcategoriesResponse.json()
        if (subcategoriesData.success) {
          setSubcategories(subcategoriesData.data as string[])
        }

        setForm(prev => ({ ...prev, subcategory: trimmedSubcategory }))
        setNewSubcategory('')
        setNewSubcategoryError('')
        setIsAddSubcategoryOpen(false)
      } else {
        setNewSubcategoryError(j.error || 'Erro ao salvar subcategoria')
      }
    } catch (error) {
      setNewSubcategoryError('Erro ao salvar subcategoria')
    }
  }

  // Exclusão de fato no DB. É a única fonte de verdade — some também do modal
  // de Regras. Transações já cadastradas mantêm o valor (texto livre), apenas
  // deixa de ser opção nos dropdowns. Retorna o status pra quem chamou decidir
  // a UX (sucesso/aviso). O backend recusa (409 'in_use') se ainda houver regra
  // dependente — não deveria acontecer porque pré-checamos, mas é a rede de
  // segurança do invariante.
  const performDeleteSubcategory = async (name: string): Promise<'ok' | 'in_use' | 'error'> => {
    try {
      const r = await fetch(`${API_BASE_URL}/subcategories/${encodeURIComponent(name)}`, {
        method: 'DELETE',
      })
      const j = await r.json().catch(() => ({} as { success?: boolean; error?: string }))
      if (r.ok && j.success) {
        setSubcategories(prev => prev.filter(s => s !== name))
        setForm(prev => (prev.subcategory === name ? { ...prev, subcategory: '' } : prev))
        return 'ok'
      }
      if (r.status === 409 || j.error === 'in_use') return 'in_use'
      return 'error'
    } catch {
      return 'error'
    }
  }

  // Gate único de exclusão: checa regras dependentes antes. Se houver, abre o
  // aviso "em uso"; senão, exclui direto. Usado tanto pelo botão de excluir do
  // form quanto pela lixeira do modal de Gerenciar.
  const attemptDeleteSubcategory = async (name: string) => {
    if (!name) return
    let dependentRules: { id: string; name: string }[] = []
    try {
      const r = await fetch(`${API_BASE_URL}/subcategories/${encodeURIComponent(name)}/rules`)
      const j = await r.json().catch(() => ({} as { success?: boolean; data?: { id: string; name: string }[] }))
      if (j.success && Array.isArray(j.data)) dependentRules = j.data
    } catch {
      // se a checagem falhar, tenta excluir — o backend ainda barra se preciso
    }

    if (dependentRules.length > 0) {
      setSubcatInUseWarning({ name, rules: dependentRules })
      return
    }
    await performDeleteSubcategory(name)
  }

  // Botão "Excluir Subcategoria" do modal de confirmação (campo do form).
  const removeSubcategoryFromList = async () => {
    const target = form.subcategory
    setIsRemoveSubcategoryOpen(false)
    await attemptDeleteSubcategory(target)
  }

  // Renomeia a subcategoria atualmente selecionada no form (PUT no DB).
  // Propaga pra transações e regras; reflete no modal de Regras.
  const renameSubcategoryFromForm = async () => {
    const oldName = form.subcategory
    const newName = editSubcategoryName.trim()
    if (!oldName) return
    if (!newName) { setEditSubcategoryError('Campo obrigatório'); return }
    if (newName === oldName) { setIsEditSubcategoryOpen(false); return }
    if (subcategories.includes(newName)) { setEditSubcategoryError('Já existe uma subcategoria com esse nome'); return }
    try {
      const r = await fetch(`${API_BASE_URL}/subcategories/${encodeURIComponent(oldName)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newName }),
      })
      const j = await r.json().catch(() => ({}))
      if (r.ok && j.success) {
        setSubcategories(prev => prev.map(s => (s === oldName ? newName : s)).sort((a, b) => a.localeCompare(b, 'pt-BR')))
        setForm(prev => ({ ...prev, subcategory: newName }))
        setEditSubcategoryError('')
        setIsEditSubcategoryOpen(false)
      } else {
        setEditSubcategoryError(j.error || 'Erro ao renomear subcategoria')
      }
    } catch {
      setEditSubcategoryError('Erro ao renomear subcategoria')
    }
  }

  // ── Gerenciamento de subcategorias (modal dedicado no menu de Ações) ──
  // Todas as operações batem direto no DB (fonte única, compartilhada com o
  // modal de Regras) e atualizam o estado local em seguida.

  const manageCreate = async () => {
    const name = manageNewName.trim()
    if (!name) { setManageError('Digite um nome'); return }
    if (subcategories.includes(name)) { setManageError('Esta subcategoria já existe'); return }
    setManageBusy(true)
    setManageError('')
    try {
      const r = await fetch(`${API_BASE_URL}/subcategories`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      })
      const j = await r.json().catch(() => ({}))
      if (r.ok && j.success) {
        setSubcategories(prev => [...prev, name].sort((a, b) => a.localeCompare(b, 'pt-BR')))
        setManageNewName('')
      } else {
        setManageError(j.error || 'Erro ao criar subcategoria')
      }
    } catch {
      setManageError('Erro ao criar subcategoria')
    } finally {
      setManageBusy(false)
    }
  }

  const manageSaveRename = async (oldName: string) => {
    const newName = manageEditValue.trim()
    if (!newName) { setManageError('Digite um nome'); return }
    if (newName === oldName) { setManageEditingName(null); return }
    if (subcategories.includes(newName)) { setManageError('Já existe uma subcategoria com esse nome'); return }
    setManageBusy(true)
    setManageError('')
    try {
      const r = await fetch(`${API_BASE_URL}/subcategories/${encodeURIComponent(oldName)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newName }),
      })
      const j = await r.json().catch(() => ({}))
      if (r.ok && j.success) {
        setSubcategories(prev => prev.map(s => (s === oldName ? newName : s)).sort((a, b) => a.localeCompare(b, 'pt-BR')))
        // Se a subcategoria renomeada estava selecionada no form, acompanha.
        setForm(prev => (prev.subcategory === oldName ? { ...prev, subcategory: newName } : prev))
        setManageEditingName(null)
        setManageEditValue('')
      } else {
        setManageError(j.error || 'Erro ao renomear subcategoria')
      }
    } catch {
      setManageError('Erro ao renomear subcategoria')
    } finally {
      setManageBusy(false)
    }
  }

  // Lixeira do modal Gerenciar: passa pelo mesmo gate (checa regras → exclui
  // ou abre aviso "em uso").
  const manageDelete = async (name: string) => {
    setManageBusy(true)
    setManageError('')
    try {
      if (manageEditingName === name) { setManageEditingName(null); setManageEditValue('') }
      await attemptDeleteSubcategory(name)
    } finally {
      setManageBusy(false)
    }
  }

  // ── Seleção múltipla + exclusão em massa ──
  const toggleManageSelected = (name: string) => {
    setManageSelected(prev => {
      const next = new Set(prev)
      if (next.has(name)) next.delete(name); else next.add(name)
      return next
    })
  }

  const allSelected = subcategories.length > 0 && manageSelected.size === subcategories.length

  // Exclui as selecionadas de uma vez. O backend pula as que estão em uso por
  // regra(s) e devolve em `blocked` — mostramos o resultado pro usuário.
  const manageBulkDelete = async () => {
    const names = [...manageSelected]
    if (names.length === 0) return
    setManageBusy(true)
    setManageError('')
    setManageBulkResult(null)
    try {
      const r = await fetch(`${API_BASE_URL}/subcategories/bulk-delete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ names }),
      })
      const j = await r.json().catch(() => ({} as { success?: boolean; error?: string; deleted?: string[]; blocked?: { name: string; rules: { id: string; name: string }[] }[] }))
      if (r.ok && j.success) {
        const deleted = j.deleted || []
        const blocked = j.blocked || []
        if (deleted.length) {
          setSubcategories(prev => prev.filter(s => !deleted.includes(s)))
          setForm(prev => (deleted.includes(prev.subcategory) ? { ...prev, subcategory: '' } : prev))
        }
        setManageSelected(new Set())
        // Só mostra o resumo se algo foi bloqueado (senão, exclusão silenciosa ok).
        if (blocked.length) setManageBulkResult({ deleted, blocked })
      } else {
        setManageError(j.error || 'Erro ao excluir em massa')
      }
    } catch {
      setManageError('Erro ao excluir em massa')
    } finally {
      setManageBusy(false)
    }
  }

  // Fechamento do modal de Regras. Se havia uma exclusão de subcategoria
  // pendente (usuário veio do aviso "em uso" e foi editar as regras), recheca:
  // se nenhuma regra usa mais a subcategoria, exclui e mostra modal de sucesso;
  // se ainda usa, reabre o aviso.
  const handleRulesModalClose = async () => {
    setIsRulesModalOpen(false)
    const target = pendingDeleteSubcat
    if (!target) return
    setPendingDeleteSubcat(null)
    try {
      const r = await fetch(`${API_BASE_URL}/subcategories/${encodeURIComponent(target)}/rules`)
      const j = await r.json().catch(() => ({} as { success?: boolean; data?: { id: string; name: string }[] }))
      const remaining = (j.success && Array.isArray(j.data)) ? j.data : []
      if (remaining.length > 0) {
        // Ainda há regras dependentes → reabre o aviso pra concluir.
        setSubcatInUseWarning({ name: target, rules: remaining })
        return
      }
      const status = await performDeleteSubcategory(target)
      if (status === 'ok') {
        setSubcatDeleteSuccess(target)
      }
    } catch {
      // silencioso
    }
  }

  // CRUD
  const validateForm = () => {
    const errors: {[key: string]: string} = {}
    
    if (!form.date) errors.date = 'Campo obrigatório'
    if (!form.description.trim()) errors.description = 'Campo obrigatório'
    // FIX [L311]: verificar NaN explicitamente para rejeitar valores não-numéricos
    const parsedValue = parseFloat(form.value)
    if (!form.value || isNaN(parsedValue) || parsedValue <= 0) errors.value = 'Campo obrigatório'
    if (!form.type) errors.type = 'Campo obrigatório'
    // Categoria deve ser uma das válidas do tipo. Vazio OU valor fora do
    // catálogo (ex.: importação antiga que gravou o tipo como categoria)
    // bloqueia o salvamento. Transferência/caixa não têm categoria.
    if (form.type !== 'Transferência entre contas'
      && !CAIXA_TRANSACTION_TYPES.includes(form.type as TransactionType)
      && !(form.type === 'Receita' ? CATEGORIES_BY_TYPE.Receita : CATEGORIES_BY_TYPE.Despesa).includes(form.category)) {
      errors.category = 'Selecione uma categoria válida'
    }
    // Subcategoria é obrigatória apenas para Despesas
    if (form.type === 'Despesa' && !form.subcategory.trim()) {
      errors.subcategory = 'Campo obrigatório'
    }
    
    setFormErrors(errors)
    return Object.keys(errors).length === 0
  }

  const saveTransaction = async () => {
    if (!validateForm()) {
      return
    }
    
    // Tipos sem categoria (transferência/caixa) não têm categoria nem
    // subcategoria: zera ambos ao salvar — inclusive ao editar uma transação
    // antiga que ainda as tivesse.
    const typeUsesCategory =
      form.type !== 'Transferência entre contas' &&
      !CAIXA_TRANSACTION_TYPES.includes(form.type as TransactionType)
    const payload = {
      ...(editing?.id && { id: editing.id }),
      date: form.date,
      description: form.description,
      value: parseFloat(form.value),
      type: form.type,
      category: typeUsesCategory ? form.category : '',
      subcategory: typeUsesCategory ? form.subcategory : ''
    }
    try {
      if (editing) {
        const r = await fetch(`${API_BASE_URL}/transactions/${editing.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
        const j = await r.json()
        // FIX [L346]: exibir feedback quando operação falha no servidor
        if (j.success) {
          setTransactions(prev => prev.map(t => t.id === editing.id ? j.data : t))
        } else {
          alert(j.error || 'Erro ao salvar transação. Tente novamente.')
          return
        }
      } else {
        const r = await fetch(`${API_BASE_URL}/transactions`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
        const j = await r.json()
        // FIX [L346]: exibir feedback quando operação falha no servidor
        if (j.success) {
          setTransactions(prev => [j.data, ...prev])
        } else {
          alert(j.error || 'Erro ao salvar transação. Tente novamente.')
          return
        }
      }
      closeModal(); setForm({ date: new Date().toISOString().split('T')[0], description: '', value: '', type: 'Receita', category: '', subcategory: '' })
    } catch (error) {
      console.error('Erro ao salvar:', error)
      alert('Erro ao salvar transação. Verifique sua conexão e tente novamente.')
    }
  }

  const deleteOne = async (id: string) => {
    try {
      const r = await fetch(`${API_BASE_URL}/transactions/${id}`, { method: 'DELETE' })
      const j = await r.json(); if (j.success) setTransactions(prev => prev.filter(t => t.id !== id))
    } catch {}
  }

  // Mapa de projetos (id→nome) para exibir o vínculo.
  useEffect(() => {
    fetch(`${API_BASE_URL}/projects`).then(r => r.json()).then(j => {
      if (j.success) { const m: Record<string, string> = {}; j.data.forEach((p: any) => { m[p.id] = p.name }); setProjectsMap(m) }
    }).catch(() => {})
  }, [])

  const refreshTransactions = async () => {
    try { const r = await fetch(`${API_BASE_URL}/transactions`); const j = await r.json(); if (j.success) setTransactions(j.data) } catch { /* noop */ }
  }

  const handlePickProject = async (project: { id: string; name: string }) => {
    setLinkBusy(true)
    try {
      if (linkPickerFor === 'bulk') {
        const ids = Array.from(selectedTransactions)
        await fetch(`${API_BASE_URL}/transactions/link-project-bulk`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids, projectId: project.id }) })
        setSelectedTransactions(new Set())
      } else if (linkPickerFor) {
        await fetch(`${API_BASE_URL}/transactions/${linkPickerFor}/link-project`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ projectId: project.id }) })
        setEditing(prev => prev ? { ...prev, project_id: project.id } : prev)
      }
      await refreshTransactions()
      setLinkPickerFor(null)
    } catch { /* noop */ } finally { setLinkBusy(false) }
  }

  const unlinkTransaction = async (txId: string) => {
    setLinkBusy(true)
    try {
      await fetch(`${API_BASE_URL}/transactions/${txId}/link-project`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ projectId: null }) })
      setEditing(prev => prev ? { ...prev, project_id: null } : prev)
      await refreshTransactions()
    } catch { /* noop */ } finally { setLinkBusy(false) }
  }

  const deleteSelected = async () => {
    try {
      // FIX [L360]: capturar ids antes do await para evitar stale closure
      const ids = Array.from(selectedTransactions)
      const r = await fetch(`${API_BASE_URL}/transactions`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids }) })
      const j = await r.json()
      if (j.success) {
        const idsSet = new Set(ids)
        setTransactions(prev => prev.filter(t => !idsSet.has(t.id)))
        setSelectedTransactions(new Set())
      }
    } catch {}
  }

  // Import/Export
  const downloadModel = () => {
    window.open(`${API_BASE_URL}/modelo/transactions`, '_blank')
  }

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const formData = new FormData()
    formData.append('file', file)
    formData.append('type', 'transactions')
    try {
      const r = await fetch(`${API_BASE_URL}/import`, { method: 'POST', body: formData })
      const j = await r.json()
      if (j.success) {
        setTransactions(prev => [...j.data, ...prev])
        setIsImportExportOpen(false)
        // Ativar toast de desfazer com 30 segundos
        const savedIds: string[] = (j.data ?? []).map((t: { id: string }) => String(t.id))
        setLastImportBatch(savedIds)
        setUndoMaxCountdown(30)
        setUndoCountdown(30)
        setShowUndoToast(true)
      } else {
        // FIX [L383]: exibir feedback de erro ao usuário
        alert(j.error || 'Erro ao importar arquivo. Verifique o formato e tente novamente.')
      }
    } catch {
      // FIX [L383]: catch não pode ser silencioso
      alert('Erro ao importar arquivo. Verifique sua conexão e tente novamente.')
    }
  }

  const handleExport = async () => {
    try {
      const r = await fetch(`${API_BASE_URL}/export`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'transactions', data: transactions }) })
      if (!r.ok) {
        // FIX [L394]: verificar status da resposta antes de criar blob
        alert('Erro ao exportar dados. Tente novamente.')
        return
      }
      const blob = await r.blob(); const url = URL.createObjectURL(blob)
      const a = document.createElement('a'); a.href = url; a.download = `transactions_${new Date().toISOString().split('T')[0]}.xlsx`; a.click(); URL.revokeObjectURL(url)
    } catch {
      // FIX [L394]: catch não pode ser silencioso
      alert('Erro ao exportar dados. Verifique sua conexão e tente novamente.')
    }
  }

  return (
    <div className="space-y-6">
      <PendingTransactionsBanner />
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <h1 className="text-3xl font-bold flex items-center gap-3">
          <DollarSign className="w-8 h-8 text-blue-600" aria-hidden="true" />
          Transações
        </h1>
        <div className="flex flex-wrap items-center justify-end gap-2">
          {/* Status flutuante do Sync Asaas */}
          {syncResult && (
            <span className="text-xs text-green-700 bg-green-100 px-3 py-1.5 rounded-lg font-medium hidden md:inline">
              ✓ {syncResult.inserted} importadas, {syncResult.skipped} já existiam
            </span>
          )}

          {/* Dropdown "Ações" — agrupa importar, extrato, sync e regras */}
          <div className="relative" ref={actionsMenuRef}>
            <button
              type="button"
              onClick={() => setIsActionsMenuOpen((o) => !o)}
              className="flex items-center gap-2 px-3 sm:px-4 py-2.5 bg-white hover:bg-slate-50 text-slate-700 dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-slate-100 font-semibold rounded-xl border-2 border-indigo-500 hover:border-indigo-600 dark:border-indigo-400 dark:hover:border-indigo-300 shadow-sm transition-all duration-200"
              aria-haspopup="menu"
              aria-expanded={isActionsMenuOpen}
              title="Mais ações"
            >
              <MoreHorizontal className="h-5 w-5" />
              <span className="hidden sm:inline">Ações</span>
            </button>

            {isActionsMenuOpen && (
              <div role="menu" className="absolute left-0 top-full mt-2 w-64 bg-white dark:bg-gray-800 rounded-xl shadow-2xl border border-gray-200 dark:border-gray-700 z-40 overflow-hidden">
                {(permissions.canImport || permissions.canExport) && (
                  <button
                    role="menuitem"
                    onClick={() => { setIsImportExportOpen(true); setIsActionsMenuOpen(false) }}
                    className="w-full flex items-center gap-3 px-4 py-3 text-left text-sm text-gray-800 dark:text-gray-100 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors"
                  >
                    <Download className="h-4 w-4 text-blue-600 flex-shrink-0" />
                    Importar / Exportar
                  </button>
                )}
                {permissions.canImport && (
                  <button
                    role="menuitem"
                    onClick={() => { setIsImportExtratoModalOpen(true); setExtratoStep(0); setImportType(null); setSelectedBank(null); setExtratoFile(null); setExtratoPassword(''); setExtratoPreview([]); setIsActionsMenuOpen(false) }}
                    className="w-full flex items-center gap-3 px-4 py-3 text-left text-sm text-gray-800 dark:text-gray-100 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors"
                  >
                    <Upload className="h-4 w-4 text-blue-600 flex-shrink-0" />
                    Importar Extrato / Fatura
                  </button>
                )}
                <button
                  role="menuitem"
                  onClick={() => { syncAsaas(); setIsActionsMenuOpen(false) }}
                  disabled={isSyncingAsaas}
                  className="w-full flex items-center gap-3 px-4 py-3 text-left text-sm text-gray-800 dark:text-gray-100 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 transition-colors disabled:opacity-60"
                >
                  <RefreshCw className={`h-4 w-4 text-emerald-600 flex-shrink-0 ${isSyncingAsaas ? 'animate-spin' : ''}`} />
                  {isSyncingAsaas ? 'Sincronizando Asaas...' : 'Sincronizar com Asaas'}
                </button>
                <button
                  role="menuitem"
                  onClick={() => { setIsRulesModalOpen(true); setIsActionsMenuOpen(false) }}
                  className="w-full flex items-center gap-3 px-4 py-3 text-left text-sm text-gray-800 dark:text-gray-100 hover:bg-purple-50 dark:hover:bg-purple-900/20 transition-colors border-t border-gray-100 dark:border-gray-700"
                >
                  <Settings className="h-4 w-4 text-purple-600 flex-shrink-0" />
                  Conjunto de Regras
                </button>
                <button
                  role="menuitem"
                  onClick={() => { setIsManageSubcategoriesOpen(true); setManageNewName(''); setManageError(''); setManageEditingName(null); setManageSelected(new Set()); setManageBulkResult(null); setIsActionsMenuOpen(false) }}
                  className="w-full flex items-center gap-3 px-4 py-3 text-left text-sm text-gray-800 dark:text-gray-100 hover:bg-amber-50 dark:hover:bg-amber-900/20 transition-colors border-t border-gray-100 dark:border-gray-700"
                >
                  <Link2 className="h-4 w-4 text-amber-600 flex-shrink-0" />
                  Gerenciar Subcategorias
                </button>
              </div>
            )}
          </div>

          {/* Botão primário: Nova Transação */}
          {permissions.canCreate && (
            <button
              onClick={() => { setEditing(null); setForm({ date: new Date().toISOString().split('T')[0], description: '', value: '', type: 'Receita', category: '', subcategory: '' }); setFormErrors({}); setIsModalOpen(true) }}
              className="flex items-center gap-2 px-3 sm:px-5 py-2.5 bg-gradient-to-r from-blue-500 to-indigo-600 text-white font-semibold rounded-xl hover:from-blue-600 hover:to-indigo-700 shadow-md hover:shadow-lg transition-all duration-200"
              title="Nova transação"
            >
              <Plus className="h-5 w-5 flex-shrink-0" />
              <span className="hidden sm:inline">Nova Transação</span>
            </button>
          )}
        </div>
      </div>

      <TransactionRulesModal
        isOpen={isRulesModalOpen}
        onClose={handleRulesModalClose}
        onRulesChanged={() => {
          // Recarrega transações para refletir regras aplicadas retroativamente
          fetch(`${API_BASE_URL}/transactions`).then(r => r.json()).then(j => {
            if (j.success) setTransactions(j.data || [])
          }).catch(() => {})
        }}
      />

      <ResolveTransactionModal
        transactionId={resolveTarget?.id || null}
        description={resolveTarget?.description}
        onClose={() => setResolveTarget(null)}
        onResolved={() => {
          fetch(`${API_BASE_URL}/transactions`).then(r => r.json()).then(j => {
            if (j.success) setTransactions(j.data || [])
          }).catch(() => {})
        }}
      />

      {/* Filtros */}
      <div className="bg-gradient-to-r from-blue-50/80 to-indigo-50/60 dark:from-blue-900/20 dark:to-indigo-900/10 p-5 rounded-2xl border border-blue-100 dark:border-blue-800/30 shadow-sm">
        <div className="flex flex-col lg:flex-row lg:items-center gap-4 lg:gap-6">
          <div className="flex items-center gap-2">
            <Filter className="w-5 h-5 text-blue-600" aria-hidden="true" />
            <h2 className="text-base font-bold text-gray-800 dark:text-gray-100 uppercase tracking-wide">Filtros</h2>
          </div>
          <div className="flex items-end gap-1 sm:gap-2 md:gap-3 lg:gap-4 flex-1">
            {/* Busca por descrição */}
            <div className="flex flex-col flex-1 min-w-0">
              <label htmlFor="transaction-description-filter" className="text-xs sm:text-sm font-semibold text-gray-700 mb-1 truncate">Buscar</label>
              <div className="relative">
                <input
                  id="transaction-description-filter"
                  name="transaction-description-filter"
                  aria-label="Buscar por nome da transação"
                  type="text"
                  placeholder="Nome da transação..."
                  value={filters.description}
                  onChange={(e) => setFilters(prev => ({ ...prev, description: e.target.value }))}
                  className="px-1 sm:px-2 md:px-3 py-1 sm:py-2 border border-blue-200 dark:border-blue-700 rounded-xl text-xs sm:text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white dark:!bg-[#243040] dark:text-gray-100 w-full pr-7"
                />
                {filters.description && (
                  <button
                    type="button"
                    onClick={() => setFilters(prev => ({ ...prev, description: '' }))}
                    className="absolute right-1 sm:right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  >
                    <X className="w-3 h-3 sm:w-4 sm:h-4" />
                  </button>
                )}
              </div>
            </div>
            <div className="flex flex-col flex-1 min-w-0">
              <label htmlFor="transaction-type-filter" className="text-xs sm:text-sm font-semibold text-gray-700 mb-1 truncate">Tipo</label>
              <select
                id="transaction-type-filter"
                name="transaction-type-filter"
                aria-label="Filtrar por tipo"
                value={filters.type}
                onChange={(e) => setFilters(prev => ({ ...prev, type: e.target.value as any }))}
                className="px-1 sm:px-2 md:px-3 py-1 sm:py-2 border border-blue-200 dark:border-blue-700 rounded-xl text-xs sm:text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white dark:!bg-[#243040] dark:text-gray-100 w-full"
              >
                <option value="">Todos os tipos</option>
                <option value="Receita">Receitas</option>
                <option value="Despesa">Despesas</option>
                <option value="Reforço de caixa">Reforço de caixa</option>
                <option value="Retirada de caixa">Retirada de caixa</option>
                <option value="Transferência entre contas">Transferências</option>
                <option value="A confirmar">A confirmar</option>
              </select>
            </div>
            <div className="flex flex-col flex-shrink-0 min-w-[110px]">
              <label htmlFor="transaction-source-filter" className="text-xs sm:text-sm font-semibold text-gray-700 mb-1 truncate">Origem</label>
              <select
                id="transaction-source-filter"
                name="transaction-source-filter"
                aria-label="Filtrar por origem"
                value={filters.source}
                onChange={(e) => setFilters(prev => ({ ...prev, source: e.target.value }))}
                className="px-1 sm:px-2 md:px-3 py-1 sm:py-2 border border-blue-200 dark:border-blue-700 rounded-xl text-xs sm:text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white dark:!bg-[#243040] dark:text-gray-100 w-full"
              >
                <option value="">Todas as origens</option>
                <option value="manual">Manual</option>
                <option value="import_xlsx">Planilha</option>
                <option value="extrato">Extrato</option>
                <option value="fatura">Fatura</option>
                <option value="asaas">Asaas</option>
              </select>
            </div>
            {hiddenCount > 0 && (
              <div className="flex flex-col flex-shrink-0">
                <label className="text-xs sm:text-sm font-semibold text-gray-700 mb-1 truncate">&nbsp;</label>
                <label className="flex items-center gap-2 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-xl cursor-pointer bg-white dark:bg-gray-700 text-xs sm:text-sm text-gray-700 dark:text-gray-200 whitespace-nowrap">
                  <input type="checkbox" checked={showHidden} onChange={(e) => setShowHidden(e.target.checked)} />
                  Mostrar ocultas ({hiddenCount})
                </label>
              </div>
            )}
            <div className="flex flex-col flex-1 min-w-0">
              <label htmlFor="transaction-category-filter" className="text-xs sm:text-sm font-semibold text-gray-700 mb-1 truncate">Categoria</label>
              <input
                id="transaction-category-filter"
                name="transaction-category-filter"
                aria-label="Filtrar por categoria"
                type="text"
                placeholder="Categoria..."
                value={filters.category}
                onChange={(e) => setFilters(prev => ({ ...prev, category: e.target.value }))}
                className="px-1 sm:px-2 md:px-3 py-1 sm:py-2 border border-blue-200 dark:border-blue-700 rounded-xl text-xs sm:text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white dark:!bg-[#243040] dark:text-gray-100 w-full"
              />
            </div>
            <div className="flex flex-col flex-1 min-w-0">
              <label htmlFor="transaction-subcategory-filter" className="text-xs sm:text-sm font-semibold text-gray-700 mb-1 truncate">Subcategoria</label>
              <input
                id="transaction-subcategory-filter"
                name="transaction-subcategory-filter"
                aria-label="Filtrar por subcategoria"
                type="text"
                placeholder="Subcategoria..."
                value={filters.subcategory}
                onChange={(e) => setFilters(prev => ({ ...prev, subcategory: e.target.value }))}
                className="px-1 sm:px-2 md:px-3 py-1 sm:py-2 border border-blue-200 dark:border-blue-700 rounded-xl text-xs sm:text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white dark:!bg-[#243040] dark:text-gray-100 w-full"
              />
            </div>
            <div className="flex flex-col flex-1 min-w-0">
              <label htmlFor="transaction-date-from-filter" className="text-xs sm:text-sm font-semibold text-gray-700 mb-1 truncate">Data Início</label>
              <div className="relative">
                <input
                  id="transaction-date-from-filter"
                  name="transaction-date-from-filter"
                  aria-label="Data início do filtro"
                  type="date"
                  value={filters.dateFrom}
                  onChange={(e) => setFilters(prev => ({ ...prev, dateFrom: e.target.value }))}
                  className="px-1 sm:px-2 md:px-3 py-1 sm:py-2 border border-blue-200 dark:border-blue-700 rounded-xl text-xs sm:text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white dark:!bg-[#243040] dark:text-gray-100 w-full"
                />
                <Calendar className="absolute right-1 sm:right-2 md:right-3 top-1/2 -translate-y-1/2 w-3 h-3 sm:w-4 sm:h-4 text-blue-600 pointer-events-none" />
              </div>
            </div>
            <div className="flex flex-col flex-1 min-w-0">
              <label htmlFor="transaction-date-to-filter" className="text-xs sm:text-sm font-semibold text-gray-700 mb-1 truncate">Data Fim</label>
              <div className="relative">
                <input
                  id="transaction-date-to-filter"
                  name="transaction-date-to-filter"
                  aria-label="Data fim do filtro"
                  type="date"
                  value={filters.dateTo}
                  onChange={(e) => setFilters(prev => ({ ...prev, dateTo: e.target.value }))}
                  className="px-1 sm:px-2 md:px-3 py-1 sm:py-2 border border-blue-200 dark:border-blue-700 rounded-xl text-xs sm:text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white dark:!bg-[#243040] dark:text-gray-100 w-full"
                />
                <Calendar className="absolute right-1 sm:right-2 md:right-3 top-1/2 -translate-y-1/2 w-3 h-3 sm:w-4 sm:h-4 text-blue-600 pointer-events-none" />
              </div>
            </div>
          </div>
          <div className="lg:ml-auto">
            <button onClick={clearFilters} className="px-3 sm:px-4 py-1.5 sm:py-2 bg-gradient-to-r from-blue-500 to-indigo-600 text-white font-semibold rounded-xl text-xs sm:text-sm hover:from-blue-600 hover:to-indigo-700 shadow-sm hover:shadow-md transition-all duration-200 w-full lg:w-auto">
              Limpar Filtros
            </button>
          </div>
        </div>
      </div>

      {/* Lista */}
      <div className="space-y-4">
        {/* FIX [L568]: usar filteredAndSorted.length para cobrir o caso de filtros ativos sem resultados */}
        {filteredAndSorted.length === 0 ? (
          <div className="bg-white dark:!bg-[#243040] rounded-2xl shadow-lg border border-gray-200 dark:border-gray-700 p-8 text-center">
            <p className="text-gray-600 dark:text-gray-300">Nenhuma transação encontrada.</p>
            <p className="text-gray-500 dark:text-gray-400 text-sm mt-2">
              {transactions.length === 0
                ? 'Adicione sua primeira transação clicando no botão "Nova Transação".'
                : 'Nenhuma transação corresponde aos filtros aplicados. Tente ajustar os critérios de busca.'}
            </p>
          </div>
        ) : (
          <div className="bg-white dark:!bg-[#243040] rounded-2xl shadow-lg border border-gray-100 dark:border-gray-700 overflow-hidden overflow-x-auto">
            <div className="bg-gradient-to-r from-blue-500 to-indigo-600 p-4 min-w-max">
              <div className="flex items-center gap-0.5 sm:gap-1 md:gap-2 lg:gap-3 min-w-[800px]">
                {permissions.canDelete && (
                  <div className="flex justify-center">
                    <input
                      type="checkbox"
                      checked={filteredAndSorted.length > 0 && selectedTransactions.size === filteredAndSorted.length}
                      onChange={handleSelectAll}
                      className="w-4 h-4 text-blue-600 bg-white/20 border-white/40 rounded focus:ring-blue-500 focus:ring-2"
                    />
                  </div>
                )}
                <button onClick={() => handleSort('date')} className="flex items-center justify-center gap-1 hover:bg-white/20 rounded-lg px-1 sm:px-2 py-1 transition-colors flex-shrink-0 w-20 sm:w-24">
                  <p className="text-xs sm:text-sm font-bold text-white uppercase tracking-wide truncate">Data</p>
                  {getSortIcon('date')}
                </button>
                <button onClick={() => handleSort('description')} className="flex items-center justify-center gap-1 hover:bg-white/20 rounded-lg px-1 sm:px-2 py-1 transition-colors flex-1 min-w-0">
                  <p className="text-xs sm:text-sm font-bold text-white uppercase tracking-wide truncate">Descrição</p>
                  {getSortIcon('description')}
                </button>
                <button onClick={() => handleSort('type')} className="flex items-center justify-center gap-1 hover:bg-white/20 rounded-lg px-1 sm:px-2 py-1 transition-colors flex-shrink-0 w-16 sm:w-20">
                  <p className="text-xs sm:text-sm font-bold text-white uppercase tracking-wide">Tipo</p>
                  {getSortIcon('type')}
                </button>
                <button onClick={() => handleSort('category')} className="flex items-center justify-center gap-1 hover:bg-white/20 rounded-lg px-1 sm:px-2 py-1 transition-colors flex-shrink-0 w-20 sm:w-24">
                  <p className="text-xs sm:text-sm font-bold text-white uppercase tracking-wide truncate">Categoria</p>
                  {getSortIcon('category')}
                </button>
                <div className="flex items-center justify-center gap-1 rounded px-1 sm:px-2 py-1 transition-colors flex-shrink-0 w-24 sm:w-28">
                  <p className="text-xs sm:text-sm font-bold text-white uppercase tracking-wide truncate">Subcategoria</p>
                </div>
                <button onClick={() => handleSort('value')} className="flex items-center justify-center gap-1 hover:bg-white/20 rounded-lg px-1 sm:px-2 py-1 transition-colors flex-shrink-0 w-28 sm:w-36">
                  <p className="text-xs sm:text-sm font-bold text-white uppercase tracking-wide">Valor</p>
                  {getSortIcon('value')}
                </button>
                <div className="flex-shrink-0 w-16 sm:w-20 flex justify-center">
                  <p className="text-xs sm:text-sm font-bold text-white uppercase tracking-wide">Ações</p>
                </div>
              </div>
            </div>

            {filteredAndSorted.map((t, index) => (
              <div key={t.id} className={`${index % 2 === 0 ? 'imp-row-even' : 'imp-row-odd'} border-b border-gray-100 dark:border-gray-700 p-4 transition-all duration-200 ${index === filteredAndSorted.length - 1 ? 'border-b-0' : ''} ${t.is_hidden ? 'opacity-50' : ''}`}>
                <div className="flex items-center gap-0.5 sm:gap-1 md:gap-2 lg:gap-3 min-w-[800px]">
                  {permissions.canDelete && (
                    <div className="flex-shrink-0 text-left">
                      <input
                        type="checkbox"
                        checked={selectedTransactions.has(t.id)}
                        onChange={() => handleSelect(t.id)}
                        className="w-3 h-3 sm:w-4 sm:h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 focus:ring-2"
                      />
                    </div>
                  )}
                  <div className="flex-shrink-0 w-20 sm:w-24 text-left">
                    <p className="text-xs sm:text-sm font-medium text-gray-900 truncate">{new Date(t.date).toLocaleDateString('pt-BR')}</p>
                  </div>
                  <div className="flex-1 min-w-0 text-left">
                    <h3 className="text-xs sm:text-sm font-semibold text-gray-900 truncate">
                      {t.is_hidden && <span className="inline-block mr-1.5 px-1.5 py-0.5 rounded text-[10px] font-bold bg-gray-300 text-gray-700 dark:bg-gray-600 dark:text-gray-200" title="Ocultada por regra">OCULTA</span>}
                      {t.description}
                    </h3>
                    {/* Origem da transação (migration 068) */}
                    <span className={`inline-block mt-0.5 px-1.5 py-0.5 rounded text-[10px] font-semibold ${getSourceMeta(t.source).badge}`} title={`Origem: ${getSourceMeta(t.source).label}`}>
                      {getSourceMeta(t.source).label}
                    </span>
                  </div>
                  <div className="flex-shrink-0 w-16 sm:w-20 text-center">
                    {t.type === 'A confirmar' ? (
                      <button
                        onClick={() => setResolveTarget({ id: t.id, description: t.description })}
                        className={`px-2 py-0.5 rounded-full text-xs font-semibold cursor-pointer hover:ring-2 hover:ring-purple-400 ${(TRANSACTION_TYPE_STYLES[t.type as TransactionType] || TRANSACTION_TYPE_STYLES['Despesa']).badge}`}
                        title="Clique para confirmar esta transação"
                      >
                        {t.type}
                      </button>
                    ) : (
                      <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${(TRANSACTION_TYPE_STYLES[t.type as TransactionType] || TRANSACTION_TYPE_STYLES['Despesa']).badge}`} title={t.type}>{t.type}</span>
                    )}
                  </div>
                  <div className="flex-shrink-0 w-20 sm:w-24 text-center">
                    <span className="text-xs sm:text-sm text-gray-600 dark:text-gray-400 bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded-lg truncate">{t.category || <span className="italic text-gray-400 dark:text-gray-500">Sem categoria</span>}</span>
                  </div>
                  <div className="flex-shrink-0 w-24 sm:w-28 text-center">
                    <span className="text-xs sm:text-sm text-gray-600 dark:text-gray-400 bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded-lg truncate">{t.subcategory || '-'}</span>
                  </div>
                  <div className="flex-shrink-0 w-28 sm:w-36 text-center">
                    <p className={`text-xs sm:text-sm md:text-base font-bold ${(TRANSACTION_TYPE_STYLES[t.type as TransactionType] || TRANSACTION_TYPE_STYLES['Despesa']).valueText} truncate`}>
                      {(TRANSACTION_TYPE_STYLES[t.type as TransactionType] || TRANSACTION_TYPE_STYLES['Despesa']).sign}R$ {(parseFloat(String(t.value)) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </p>
                  </div>
                  <div className="flex-shrink-0 w-16 sm:w-20 flex gap-0.5 sm:gap-1 justify-center">
                    {permissions.canEdit && (
                      <button onClick={() => { setEditing(t); setForm({ date: t.date, description: t.description, value: String(t.value), type: t.type, category: t.category, subcategory: t.subcategory || '' }); setIsModalOpen(true) }} className="p-0.5 sm:p-1 text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded-full transition-all duration-200" title="Editar transação">
                        <Edit className="w-2.5 h-2.5 sm:w-3 sm:h-3" />
                      </button>
                    )}
                    {permissions.canDelete && (
                      <button onClick={() => deleteOne(t.id)} className="p-0.5 sm:p-1 text-red-600 hover:text-red-800 hover:bg-red-50 rounded-full transition-all duration-200" title="Excluir transação">
                        <Trash2 className="w-2.5 h-2.5 sm:w-3 sm:h-3" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}

            {selectedTransactions.size > 0 && (
              <div className="flex flex-wrap justify-between items-center gap-2 p-4 bg-gray-50 dark:bg-[#2d3f52] border-t border-gray-200 dark:border-gray-700">
                <span className="text-sm font-semibold text-gray-700 dark:text-gray-200">{selectedTransactions.size} selecionada{selectedTransactions.size > 1 ? 's' : ''}</span>
                <div className="flex flex-wrap gap-2">
                  {projPerms.canEdit && (
                    <button onClick={() => setLinkPickerFor('bulk')} className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-violet-500 to-indigo-600 text-white font-semibold rounded-xl hover:-translate-y-0.5 transition-all duration-200 shadow-lg">
                      <Link2 className="h-4 w-4" /> Vincular a projeto ({selectedTransactions.size})
                    </button>
                  )}
                  {permissions.canDelete && (
                    <button onClick={deleteSelected} className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-red-500 to-red-600 text-white font-semibold rounded-xl hover:from-red-600 hover:to-red-700 transition-all duration-200 shadow-lg hover:shadow-xl hover:-translate-y-0.5">
                      <Trash2 className="h-4 w-4" /> Deletar ({selectedTransactions.size})
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Modal Nova/Editar Transação */}
      <Modal isOpen={isModalOpen} onClose={closeModal}>
        <div className="bg-white dark:!bg-[#243040] rounded-2xl w-full max-w-md shadow-2xl overflow-hidden">
            <div className="bg-gradient-to-r from-blue-500 to-indigo-600 px-6 py-4 flex items-center justify-between">
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                {/* FIX [L684]: ícone decorativo */}
                <DollarSign className="w-5 h-5" aria-hidden="true" />
                {editing ? 'Editar Transação' : 'Nova Transação'}
              </h2>
              {/* FIX [L687]: aria-label no botão de fechar */}
              <button onClick={closeModal} aria-label="Fechar modal" className="text-white/80 hover:text-white hover:bg-white/20 rounded-lg p-1.5 transition-all duration-200"><X className="w-5 h-5" aria-hidden="true" /></button>
            </div>
            <div className="p-6 space-y-3">
              <div className="relative">
                <label className="block text-sm font-semibold text-gray-700 mb-1">
                  Data <span className="text-red-500">*</span>
                </label>
                <input 
                  type="date" 
                  value={form.date} 
                  onChange={(e) => setForm(prev => ({ ...prev, date: e.target.value }))} 
                  className={`w-full px-3 py-2 border rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100 transition-all duration-200 ${
                    formErrors.date ? 'border-red-500 bg-red-50' : 'border-gray-300'
                  }`} 
                />
                {formErrors.date && (
                  <div className="absolute top-full left-0 mt-1 bg-red-500 text-white text-xs px-2 py-1 rounded shadow-lg z-10">
                    {formErrors.date}
                    <div className="absolute -top-1 left-2 w-2 h-2 bg-red-500 transform rotate-45"></div>
                  </div>
                )}
              </div>
              <div className="relative">
                <label className="block text-sm font-semibold text-gray-700 mb-1">
                  Descrição <span className="text-red-500">*</span>
                </label>
                <input 
                  type="text" 
                  value={form.description} 
                  onChange={(e) => setForm(prev => ({ ...prev, description: e.target.value }))} 
                  className={`w-full px-3 py-2 border rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100 transition-all duration-200 ${
                    formErrors.description ? 'border-red-500 bg-red-50' : 'border-gray-300'
                  }`} 
                />
                {formErrors.description && (
                  <div className="absolute top-full left-0 mt-1 bg-red-500 text-white text-xs px-2 py-1 rounded shadow-lg z-10">
                    {formErrors.description}
                    <div className="absolute -top-1 left-2 w-2 h-2 bg-red-500 transform rotate-45"></div>
                  </div>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="relative">
                  <label className="block text-sm font-semibold text-gray-700 mb-1">
                    Valor (R$) <span className="text-red-500">*</span>
                  </label>
                  <input 
                    type="number" 
                    step="0.01" 
                    value={form.value} 
                    onChange={(e) => setForm(prev => ({ ...prev, value: e.target.value }))} 
                    className={`w-full px-3 py-2 border rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100 transition-all duration-200 ${
                      formErrors.value ? 'border-red-500 bg-red-50' : 'border-gray-300'
                    }`} 
                  />
                  {formErrors.value && (
                    <div className="absolute top-full left-0 mt-1 bg-red-500 text-white text-xs px-2 py-1 rounded shadow-lg z-10">
                      {formErrors.value}
                      <div className="absolute -top-1 left-2 w-2 h-2 bg-red-500 transform rotate-45"></div>
                    </div>
                  )}
                </div>
                <div className="relative">
                  <label htmlFor="transaction-form-type" className="block text-sm font-semibold text-gray-700 mb-1">
                    Tipo <span className="text-red-500">*</span>
                  </label>
                  <select
                    id="transaction-form-type"
                    name="transaction-form-type"
                    value={form.type}
                    onChange={(e) => setForm(prev => ({
                      ...prev,
                      type: e.target.value as TransactionType,
                      category: '', // Limpar categoria quando tipo mudar
                      subcategory: '' // Limpar subcategoria quando tipo mudar
                    }))}
                    className={`w-full px-3 py-2 border rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100 transition-all duration-200 ${
                      formErrors.type ? 'border-red-500 bg-red-50' : 'border-gray-300'
                    }`}
                  >
                    <option value="Receita">Receita</option>
                    <option value="Despesa">Despesa</option>
                    <option value="Reforço de caixa">Reforço de caixa</option>
                    <option value="Retirada de caixa">Retirada de caixa</option>
                    <option value="Transferência entre contas">Transferência entre contas</option>
                  </select>
                  {formErrors.type && (
                    <div className="absolute top-full left-0 mt-1 bg-red-500 text-white text-xs px-2 py-1 rounded shadow-lg z-10">
                      {formErrors.type}
                      <div className="absolute -top-1 left-2 w-2 h-2 bg-red-500 transform rotate-45"></div>
                    </div>
                  )}
                </div>
              </div>
              {/* Categoria — não se aplica a transferência entre contas nem caixa */}
              {form.type !== 'Transferência entre contas' && !CAIXA_TRANSACTION_TYPES.includes(form.type as TransactionType) && (
              <div className="relative">
                <label htmlFor="transaction-form-category" className="block text-sm font-semibold text-gray-700 mb-1">
                  Categoria <span className="text-red-500">*</span>
                </label>
                <select
                  id="transaction-form-category"
                  name="transaction-form-category"
                  value={form.category}
                  onChange={(e) => setForm(prev => ({ ...prev, category: e.target.value }))}
                  className={`w-full px-3 py-2 border rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100 transition-all duration-200 ${
                    formErrors.category ? 'border-red-500 bg-red-50' : 'border-gray-300'
                  }`}
                >
                  <option value="">Selecione uma categoria</option>
                  {/* Valor fora do catálogo (ex.: importação antiga que gravou o
                      tipo como categoria): mostra como opção real para o select
                      não cair na primeira opção e enganar o usuário. */}
                  {form.category && !(form.type === 'Receita' ? CATEGORIES_BY_TYPE.Receita : CATEGORIES_BY_TYPE.Despesa).includes(form.category) && (
                    <option value={form.category}>{form.category} (fora do catálogo)</option>
                  )}
                  {(form.type === 'Receita' ? CATEGORIES_BY_TYPE.Receita : CATEGORIES_BY_TYPE.Despesa).map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
                {formErrors.category && (
                  <div className="absolute top-full left-0 mt-1 bg-red-500 text-white text-xs px-2 py-1 rounded shadow-lg z-10">
                    {formErrors.category}
                    <div className="absolute -top-1 left-2 w-2 h-2 bg-red-500 transform rotate-45"></div>
                  </div>
                )}
              </div>
              )}
              {/* Subcategoria — também não se aplica a transferência/caixa */}
              {form.type !== 'Transferência entre contas' && !CAIXA_TRANSACTION_TYPES.includes(form.type as TransactionType) && (
              <div className="relative">
                <label className="block text-sm font-semibold text-gray-700 mb-1">
                  Subcategoria {form.type === 'Despesa' && <span className="text-red-500">*</span>}
                </label>
                {form.type === 'Despesa' ? (
                  <div className="flex gap-2">
                    <select 
                      value={form.subcategory} 
                      onChange={(e) => setForm(prev => ({ ...prev, subcategory: e.target.value }))} 
                      className={`flex-1 px-3 py-2 border rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100 transition-all duration-200 ${
                        formErrors.subcategory ? 'border-red-500 bg-red-50' : 'border-gray-300'
                      }`}
                    >
                      <option value="">Selecione uma subcategoria</option>
                      {/* FIX [L831]: usar o valor como key em vez do índice */}
                      {subcategories.map((subcat) => (
                        <option key={subcat} value={subcat}>{subcat}</option>
                      ))}
                    </select>
                    {form.subcategory && (
                      <button
                        type="button"
                        onClick={() => { setEditSubcategoryName(form.subcategory); setEditSubcategoryError(''); setIsEditSubcategoryOpen(true) }}
                        className="px-3 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors"
                        title="Editar subcategoria"
                        aria-label="Editar subcategoria"
                      >
                        <Edit className="w-4 h-4" aria-hidden="true" />
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => form.subcategory ? setIsRemoveSubcategoryOpen(true) : setIsAddSubcategoryOpen(true)}
                      className={`px-3 py-2 rounded-lg transition-colors ${
                        form.subcategory
                          ? 'bg-red-600 text-white hover:bg-red-700'
                          : 'bg-blue-600 text-white hover:bg-blue-700'
                      }`}
                      title={form.subcategory ? "Excluir subcategoria do sistema" : "Adicionar nova subcategoria"}
                      aria-label={form.subcategory ? "Excluir subcategoria" : "Adicionar nova subcategoria"}
                    >
                      {form.subcategory ? <Trash2 className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
                    </button>
                  </div>
                ) : (
                  <input 
                    type="text" 
                    value={form.subcategory} 
                    onChange={(e) => setForm(prev => ({ ...prev, subcategory: e.target.value }))} 
                    placeholder="Digite a subcategoria (opcional)"
                    className={`w-full px-3 py-2 border rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100 transition-all duration-200 ${
                      formErrors.subcategory ? 'border-red-500 bg-red-50' : 'border-gray-300'
                    }`} 
                  />
                )}
                {formErrors.subcategory && (
                  <div className="absolute top-full left-0 mt-1 bg-red-500 text-white text-xs px-2 py-1 rounded shadow-lg z-10">
                    {formErrors.subcategory}
                    <div className="absolute -top-1 left-2 w-2 h-2 bg-red-500 transform rotate-45"></div>
                  </div>
                )}
              </div>
              )}
            </div>
            {editing && projPerms.canEdit && (
              <div className="px-6 pb-1">
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">Projeto vinculado</label>
                <div className="flex items-center gap-2">
                  <span className="flex-1 text-sm truncate">
                    {editing.project_id ? <span className="text-gray-800 dark:text-gray-100">{projectsMap[editing.project_id] || 'Projeto vinculado'}</span> : <span className="text-gray-400">Nenhum</span>}
                  </span>
                  <button onClick={() => setLinkPickerFor(editing.id)} disabled={linkBusy}
                    className="px-3 py-1.5 rounded-lg bg-violet-600 hover:bg-violet-700 text-white text-xs font-semibold disabled:opacity-50">
                    {editing.project_id ? 'Alterar' : 'Vincular'}
                  </button>
                  {editing.project_id && (
                    <button onClick={() => unlinkTransaction(editing.id)} disabled={linkBusy}
                      className="px-3 py-1.5 rounded-lg bg-gray-100 dark:!bg-[#2d3f52] text-gray-600 dark:text-gray-300 text-xs font-medium disabled:opacity-50">Desvincular</button>
                  )}
                </div>
              </div>
            )}
            <div className="mt-6 flex justify-end gap-3">
              <button onClick={closeModal} className="px-4 py-2.5 rounded-xl bg-gray-100 hover:bg-gray-200 dark:!bg-[#2d3f52] dark:hover:!bg-[#354b60] dark:text-gray-200 font-medium transition-all duration-200">Cancelar</button>
              <button onClick={saveTransaction} className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 text-white font-semibold shadow-lg shadow-blue-500/25 hover:shadow-xl hover:shadow-blue-500/35 hover:-translate-y-0.5 active:translate-y-0 transition-all duration-200">Salvar</button>
            </div>
          </div>
      </Modal>

      {linkPickerFor && (
        <ProjectPickerModal
          title="Vincular a projeto"
          busy={linkBusy}
          currentProjectId={linkPickerFor !== 'bulk' ? (editing?.project_id || null) : null}
          onPick={handlePickProject}
          onClose={() => setLinkPickerFor(null)}
        />
      )}

      {/* Modal Importar/Exportar */}
      <Modal isOpen={isImportExportOpen} onClose={() => setIsImportExportOpen(false)}>
        <div className="relative bg-white dark:!bg-[#243040] rounded-2xl w-full max-w-md shadow-2xl overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 bg-gradient-to-r from-blue-500 to-indigo-600">
              <div className="flex items-center gap-3">
                <Upload className="w-5 h-5 text-white" />
                <h2 className="text-lg font-bold text-white">Importar/Exportar Transações</h2>
              </div>
              {/* FIX [L885]: aria-label no botão de fechar */}
              <button onClick={() => setIsImportExportOpen(false)} aria-label="Fechar modal" className="text-white/80 hover:text-white hover:bg-white/20 rounded-lg p-1.5 transition-all duration-200"><X className="w-5 h-5" aria-hidden="true" /></button>
            </div>

            {/* Body */}
            <div className="px-5 py-5">
              <p className="text-center text-sm text-gray-700 mb-5">Escolha uma das opções abaixo para gerenciar seus dados:</p>

              {/* Dica / Info box */}
              <div className="rounded-xl border border-blue-200 bg-blue-50 p-5 mb-6 text-center">
                <p className="font-bold text-blue-800 mb-1">Primeiro baixe o modelo, depois importe!</p>
                <p className="text-blue-700 text-sm">Baixe o arquivo modelo, preencha com seus dados e depois faça o upload.</p>
                <button onClick={downloadModel} className="mt-4 inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 text-white font-semibold shadow-lg shadow-blue-500/25 hover:-translate-y-0.5 transition-all duration-200 mx-auto">
                  <Download className="w-4 h-4" /> Baixar Modelo de Transações
                </button>
              </div>

              {/* Importar */}
              <div className="space-y-3">
                {permissions.canImport && (
                  <label className="block w-full rounded-2xl bg-gradient-to-r from-blue-500 to-indigo-600 text-white cursor-pointer shadow hover:shadow-md transition-shadow text-center">
                    <div className="px-3 py-3 flex items-center justify-center gap-2">
                      <Upload className="w-4 h-4 opacity-90" />
                      <div className="text-center">
                        <p className="text-lg font-bold leading-tight">Selecionar Arquivo</p>
                        <p className="text-white/90 text-xs">Carregar arquivo .xlsx</p>
                      </div>
                    </div>
                    <input ref={fileInputRef} type="file" accept=".xlsx" className="hidden" onChange={handleImport} />
                  </label>
                )}

                {permissions.canExport && (
                  <button onClick={handleExport} className="w-full rounded-2xl bg-gradient-to-r from-blue-500 to-indigo-600 text-white px-3 py-3 text-center shadow hover:shadow-md transition-shadow">
                    <div className="flex items-center justify-center gap-2">
                      <Download className="w-4 h-4 opacity-90" />
                      <div className="text-center">
                        <p className="text-lg font-bold leading-tight">Exportar</p>
                        <p className="text-white/90 text-xs">Salvar dados em arquivo</p>
                      </div>
                    </div>
                  </button>
                )}
              </div>

              {/* Footer */}
              <div className="mt-6">
                <button onClick={() => setIsImportExportOpen(false)} className="w-full px-6 py-3 rounded-xl bg-gray-100 hover:bg-gray-200 dark:!bg-[#2d3f52] dark:hover:!bg-[#354b60] dark:text-gray-200 text-gray-800 font-semibold transition-all duration-200">
                  Cancelar
                </button>
              </div>
            </div>
          </div>
      </Modal>

      {/* Modal Adicionar Nova Subcategoria */}
      <Modal isOpen={isAddSubcategoryOpen} onClose={() => { setIsAddSubcategoryOpen(false); setNewSubcategoryError('') }}>
        <div className="bg-white dark:!bg-[#243040] rounded-2xl w-full max-w-md shadow-2xl overflow-hidden">
            <div className="bg-gradient-to-r from-blue-500 to-indigo-600 px-6 py-4 flex items-center justify-between">
              <h2 className="text-lg font-bold text-white flex items-center gap-2"><Plus className="w-5 h-5" /> Adicionar Nova Subcategoria</h2>
              {/* FIX [L946]: aria-label no botão de fechar */}
              <button onClick={() => { setIsAddSubcategoryOpen(false); setNewSubcategoryError('') }} aria-label="Fechar modal" className="text-white/80 hover:text-white hover:bg-white/20 rounded-lg p-1.5 transition-all duration-200"><X className="w-5 h-5" aria-hidden="true" /></button>
            </div>
            <div className="p-6">
            <div className="space-y-4">
              <div className="relative">
                <label className="block text-sm font-semibold text-gray-700 mb-1">
                  Nome da Subcategoria <span className="text-red-500">*</span>
                </label>
                <input 
                  type="text" 
                  value={newSubcategory} 
                  onChange={(e) => {
                    setNewSubcategory(e.target.value)
                    if (newSubcategoryError) setNewSubcategoryError('') // Limpa erro ao digitar
                  }} 
                  placeholder="Digite o nome da nova subcategoria"
                  className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
                    newSubcategoryError ? 'border-red-500 bg-red-50' : ''
                  }`}
                  onKeyDown={(e) => e.key === 'Enter' && addNewSubcategory()}
                />
                {newSubcategoryError && (
                  <div className="absolute top-full left-0 mt-1 bg-red-500 text-white text-xs px-2 py-1 rounded shadow-lg z-10">
                    {newSubcategoryError}
                    <div className="absolute -top-1 left-2 w-2 h-2 bg-red-500 transform rotate-45"></div>
                  </div>
                )}
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <button onClick={() => { setIsAddSubcategoryOpen(false); setNewSubcategoryError('') }} className="px-4 py-2 rounded-xl bg-gray-100 dark:!bg-[#2d3f52] hover:bg-gray-200 dark:hover:!bg-[#354b60] text-gray-700 dark:text-gray-200 font-medium transition-all duration-200">Cancelar</button>
              <button onClick={addNewSubcategory} className="px-4 py-2 rounded-xl bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 text-white font-semibold shadow-lg shadow-blue-500/25 hover:shadow-xl hover:shadow-blue-500/35 hover:-translate-y-0.5 transition-all duration-200">Adicionar</button>
            </div>
          </div>
        </div>
      </Modal>

      {/* Modal Remover Subcategoria */}
      <Modal isOpen={isRemoveSubcategoryOpen} onClose={() => setIsRemoveSubcategoryOpen(false)}>
        <div className="bg-white dark:!bg-[#243040] rounded-2xl w-full max-w-md shadow-2xl overflow-hidden">
            <div className="bg-gradient-to-r from-blue-500 to-indigo-600 px-6 py-4 flex items-center justify-between">
              <h2 className="text-lg font-bold text-white flex items-center gap-2"><Trash2 className="w-5 h-5" /> Remover Subcategoria</h2>
              {/* FIX [L990]: aria-label no botão de fechar */}
              <button onClick={() => setIsRemoveSubcategoryOpen(false)} aria-label="Fechar modal" className="text-white/80 hover:text-white hover:bg-white/20 rounded-lg p-1.5 transition-all duration-200"><X className="w-5 h-5" aria-hidden="true" /></button>
            </div>
            <div className="p-6">
              <div className="space-y-4">
                <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-700 rounded-xl p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-5 h-5 bg-yellow-500 rounded-full flex items-center justify-center">
                      <span className="text-white text-xs font-bold">!</span>
                    </div>
                    <h3 className="font-semibold text-yellow-800 dark:text-yellow-300">Atenção</h3>
                  </div>
                  <p className="text-yellow-700 dark:text-yellow-400 text-sm">
                    Você está excluindo a subcategoria <strong>"{form.subcategory}"</strong> do sistema.
                  </p>
                  <p className="text-yellow-700 dark:text-yellow-400 text-sm mt-2">
                    <strong>Importante:</strong> Esta ação remove a subcategoria do banco de dados para <strong>todos os usuários</strong> — ela deixa de aparecer aqui e também no modal de Regras. Transações já cadastradas mantêm o valor; ela apenas não estará mais disponível para novas seleções.
                  </p>
                </div>
              </div>
              <div className="mt-6 flex justify-end gap-3">
                <button onClick={() => setIsRemoveSubcategoryOpen(false)} className="px-4 py-2 rounded-xl bg-gray-100 dark:!bg-[#2d3f52] hover:bg-gray-200 dark:hover:!bg-[#354b60] text-gray-700 dark:text-gray-200 font-medium transition-all duration-200">Cancelar</button>
                <button onClick={removeSubcategoryFromList} className="px-4 py-2 rounded-xl bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 text-white font-semibold shadow-lg shadow-red-500/25 hover:shadow-xl hover:shadow-red-500/35 hover:-translate-y-0.5 transition-all duration-200">Excluir Subcategoria</button>
              </div>
            </div>
          </div>
      </Modal>

      {/* Modal Editar (renomear) Subcategoria */}
      <Modal isOpen={isEditSubcategoryOpen} onClose={() => { setIsEditSubcategoryOpen(false); setEditSubcategoryError('') }}>
        <div className="bg-white dark:!bg-[#243040] rounded-2xl w-full max-w-md shadow-2xl overflow-hidden">
          <div className="bg-gradient-to-r from-blue-500 to-indigo-600 px-6 py-4 flex items-center justify-between">
            <h2 className="text-lg font-bold text-white flex items-center gap-2"><Edit className="w-5 h-5" aria-hidden="true" /> Editar Subcategoria</h2>
            <button onClick={() => { setIsEditSubcategoryOpen(false); setEditSubcategoryError('') }} aria-label="Fechar modal" className="text-white/80 hover:text-white hover:bg-white/20 rounded-lg p-1.5 transition-all duration-200"><X className="w-5 h-5" aria-hidden="true" /></button>
          </div>
          <div className="p-6">
            <div className="space-y-4">
              <div className="relative">
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-200 mb-1">
                  Novo nome <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={editSubcategoryName}
                  onChange={(e) => { setEditSubcategoryName(e.target.value); if (editSubcategoryError) setEditSubcategoryError('') }}
                  onKeyDown={(e) => { if (e.key === 'Enter') renameSubcategoryFromForm() }}
                  autoFocus
                  className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100 ${
                    editSubcategoryError ? 'border-red-500 bg-red-50' : 'border-gray-300'
                  }`}
                />
                {editSubcategoryError && (
                  <p className="mt-1 text-sm text-red-600 dark:text-red-400" role="alert">{editSubcategoryError}</p>
                )}
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Renomear atualiza as transações já cadastradas e reflete no modal de Regras.
              </p>
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <button onClick={() => { setIsEditSubcategoryOpen(false); setEditSubcategoryError('') }} className="px-4 py-2 rounded-xl bg-gray-100 dark:!bg-[#2d3f52] hover:bg-gray-200 dark:hover:!bg-[#354b60] text-gray-700 dark:text-gray-200 font-medium transition-all duration-200">Cancelar</button>
              <button onClick={renameSubcategoryFromForm} className="px-4 py-2 rounded-xl bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 text-white font-semibold shadow-lg shadow-blue-500/25 hover:shadow-xl hover:shadow-blue-500/35 hover:-translate-y-0.5 transition-all duration-200">Salvar</button>
            </div>
          </div>
        </div>
      </Modal>

      {/* Modal aviso: subcategoria em uso por regra(s) — destrutivo */}
      <Modal isOpen={!!subcatInUseWarning} onClose={() => setSubcatInUseWarning(null)} zIndexClass="z-[10060]" destructive>
        {subcatInUseWarning && (
          <div className="bg-white dark:!bg-[#243040] rounded-2xl w-full max-w-md shadow-2xl overflow-hidden">
            <div className="bg-gradient-to-r from-amber-500 to-orange-500 px-6 py-4 flex items-center justify-between">
              <h2 className="text-lg font-bold text-white flex items-center gap-2"><Settings className="w-5 h-5" aria-hidden="true" /> Subcategoria em uso</h2>
              <button onClick={() => setSubcatInUseWarning(null)} aria-label="Fechar modal" className="text-white/80 hover:text-white hover:bg-white/20 rounded-lg p-1.5 transition-all duration-200"><X className="w-5 h-5" aria-hidden="true" /></button>
            </div>
            <div className="p-6">
              <p className="text-sm text-gray-700 dark:text-gray-200">
                A subcategoria <strong>"{subcatInUseWarning.name}"</strong> é usada por{' '}
                <strong>{subcatInUseWarning.rules.length} regra(s)</strong>. Para excluí-la, você precisa
                primeiro editar essa(s) regra(s) (para usar outra subcategoria) ou removê-la(s).
              </p>
              <ul className="mt-3 space-y-1 max-h-40 overflow-y-auto">
                {subcatInUseWarning.rules.map(rule => (
                  <li key={rule.id} className="text-sm text-gray-600 dark:text-gray-300 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg px-3 py-2">
                    {rule.name || '(regra sem nome)'}
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-sm text-gray-700 dark:text-gray-200">
                Deseja editar a(s) regra(s) agora? Ao terminar, a subcategoria será excluída automaticamente.
              </p>
              <div className="mt-6 flex justify-end gap-3">
                <button
                  onClick={() => setSubcatInUseWarning(null)}
                  className="px-4 py-2 rounded-xl bg-gray-100 dark:!bg-[#2d3f52] hover:bg-gray-200 dark:hover:!bg-[#354b60] text-gray-700 dark:text-gray-200 font-medium transition-all duration-200"
                >
                  Cancelar
                </button>
                <button
                  onClick={() => {
                    const name = subcatInUseWarning.name
                    setSubcatInUseWarning(null)
                    setPendingDeleteSubcat(name)
                    setIsManageSubcategoriesOpen(false)
                    setIsRulesModalOpen(true)
                  }}
                  className="px-4 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white font-semibold shadow-lg shadow-amber-500/25 hover:-translate-y-0.5 transition-all duration-200"
                >
                  Editar regras
                </button>
              </div>
            </div>
          </div>
        )}
      </Modal>

      {/* Modal sucesso: regras editadas + subcategoria excluída */}
      <Modal isOpen={!!subcatDeleteSuccess} onClose={() => setSubcatDeleteSuccess(null)} zIndexClass="z-[10060]">
        {subcatDeleteSuccess && (
          <div className="bg-white dark:!bg-[#243040] rounded-2xl w-full max-w-md shadow-2xl overflow-hidden">
            <div className="bg-gradient-to-r from-emerald-500 to-green-600 px-6 py-4 flex items-center justify-between">
              <h2 className="text-lg font-bold text-white flex items-center gap-2"><CheckCircle2 className="w-5 h-5" aria-hidden="true" /> Concluído</h2>
              <button onClick={() => setSubcatDeleteSuccess(null)} aria-label="Fechar modal" className="text-white/80 hover:text-white hover:bg-white/20 rounded-lg p-1.5 transition-all duration-200"><X className="w-5 h-5" aria-hidden="true" /></button>
            </div>
            <div className="p-6">
              <p className="text-sm text-gray-700 dark:text-gray-200">
                A(s) regra(s) foi(ram) editada(s) e a subcategoria <strong>"{subcatDeleteSuccess}"</strong> foi excluída com sucesso.
              </p>
              <div className="mt-6 flex justify-end">
                <button
                  onClick={() => setSubcatDeleteSuccess(null)}
                  className="px-5 py-2 rounded-xl bg-gradient-to-r from-emerald-500 to-green-600 hover:from-emerald-600 hover:to-green-700 text-white font-semibold shadow-md transition-all duration-200"
                >
                  Entendi
                </button>
              </div>
            </div>
          </div>
        )}
      </Modal>

      {/* Modal Gerenciar Subcategorias — criar / renomear / excluir */}
      <Modal isOpen={isManageSubcategoriesOpen} onClose={() => { setIsManageSubcategoriesOpen(false); setManageEditingName(null); setManageError('') }}>
        <div className="bg-white dark:!bg-[#243040] rounded-2xl w-full max-w-md shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">
          <div className="bg-gradient-to-r from-blue-500 to-indigo-600 px-6 py-4 flex items-center justify-between flex-shrink-0">
            <h2 className="text-lg font-bold text-white flex items-center gap-2"><Settings className="w-5 h-5" aria-hidden="true" /> Gerenciar Subcategorias</h2>
            <button onClick={() => { setIsManageSubcategoriesOpen(false); setManageEditingName(null); setManageError('') }} aria-label="Fechar modal" className="text-white/80 hover:text-white hover:bg-white/20 rounded-lg p-1.5 transition-all duration-200"><X className="w-5 h-5" aria-hidden="true" /></button>
          </div>

          <div className="p-6 flex flex-col gap-4 overflow-hidden">
            {/* Criar nova */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 dark:text-gray-200 mb-1">Nova subcategoria</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={manageNewName}
                  onChange={(e) => { setManageNewName(e.target.value); if (manageError) setManageError('') }}
                  onKeyDown={(e) => { if (e.key === 'Enter') manageCreate() }}
                  placeholder="Digite o nome e clique em Adicionar"
                  disabled={manageBusy}
                  className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-gray-100"
                />
                <button
                  onClick={manageCreate}
                  disabled={manageBusy || !manageNewName.trim()}
                  className="px-4 py-2 rounded-xl bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 text-white font-semibold shadow-md disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
                >
                  <Plus className="w-4 h-4" aria-hidden="true" /> Adicionar
                </button>
              </div>
            </div>

            {manageError && (
              <div className="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-700 text-red-700 dark:text-red-300 px-3 py-2 rounded-lg text-sm" role="alert">
                {manageError}
              </div>
            )}

            {manageBulkResult && (
              <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg px-3 py-2 text-sm" role="status">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-amber-800 dark:text-amber-300 font-semibold">
                    {manageBulkResult.deleted.length > 0
                      ? `${manageBulkResult.deleted.length} subcategoria(s) excluída(s).`
                      : 'Nenhuma subcategoria excluída.'}
                  </p>
                  <button onClick={() => setManageBulkResult(null)} aria-label="Fechar aviso" className="text-amber-700 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-900/40 rounded p-0.5 flex-shrink-0"><X className="w-3.5 h-3.5" aria-hidden="true" /></button>
                </div>
                <p className="text-amber-700 dark:text-amber-400 mt-1">
                  {manageBulkResult.blocked.length} não pôde(puderam) ser excluída(s) por estar(em) em uso por regras:
                </p>
                <p className="text-amber-700 dark:text-amber-400 mt-0.5 font-medium break-words">
                  {manageBulkResult.blocked.map(b => b.name).join(', ')}
                </p>
                <p className="text-amber-600 dark:text-amber-500 mt-1 text-xs">
                  Edite ou exclua essas regras (botão 🗑️ individual abre o fluxo) antes de removê-las.
                </p>
              </div>
            )}

            {/* Lista */}
            <div className="flex flex-col min-h-0">
              <div className="flex flex-wrap items-center gap-2 mb-2">
                <button
                  type="button"
                  onClick={() => setManageSelected(new Set(subcategories))}
                  disabled={subcategories.length === 0 || manageBusy || allSelected}
                  className="text-[11px] font-semibold px-2 py-1 rounded bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 disabled:opacity-50"
                >
                  Selecionar todas
                </button>
                {manageSelected.size > 0 && (
                  <button
                    type="button"
                    onClick={() => setManageSelected(new Set())}
                    disabled={manageBusy}
                    className="text-[11px] font-semibold px-2 py-1 rounded bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 disabled:opacity-50"
                  >
                    Desselecionar
                  </button>
                )}
                <span className="text-xs text-gray-500 dark:text-gray-400 ml-auto">
                  {manageSelected.size > 0 ? `${manageSelected.size} selecionada(s)` : `${subcategories.length} subcategoria(s)`}
                </span>
                <button
                  type="button"
                  onClick={manageBulkDelete}
                  disabled={manageSelected.size === 0 || manageBusy}
                  className="flex items-center gap-1 text-[11px] font-semibold px-2 py-1 rounded bg-red-600 hover:bg-red-700 text-white disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                  Excluir selecionadas{manageSelected.size > 0 ? ` (${manageSelected.size})` : ''}
                </button>
              </div>
              <div className="overflow-y-auto max-h-[40vh] -mx-1 px-1 space-y-1">
                {subcategories.length === 0 && (
                  <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-6">Nenhuma subcategoria cadastrada.</p>
                )}
                {subcategories.map((name) => (
                  <div key={name} className="flex items-center gap-2 p-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
                    {manageEditingName !== name && (
                      <input
                        type="checkbox"
                        checked={manageSelected.has(name)}
                        onChange={() => toggleManageSelected(name)}
                        disabled={manageBusy}
                        aria-label={`Selecionar ${name}`}
                        className="w-4 h-4 flex-shrink-0 accent-blue-600 cursor-pointer disabled:opacity-50"
                      />
                    )}
                    {manageEditingName === name ? (
                      <>
                        <input
                          type="text"
                          value={manageEditValue}
                          onChange={(e) => { setManageEditValue(e.target.value); if (manageError) setManageError('') }}
                          onKeyDown={(e) => { if (e.key === 'Enter') manageSaveRename(name); if (e.key === 'Escape') { setManageEditingName(null); setManageError('') } }}
                          autoFocus
                          disabled={manageBusy}
                          className="flex-1 min-w-0 px-2 py-1.5 border border-blue-300 dark:border-blue-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-gray-100 text-sm"
                        />
                        <button onClick={() => manageSaveRename(name)} disabled={manageBusy} aria-label="Salvar" className="px-2.5 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-semibold disabled:opacity-50">Salvar</button>
                        <button onClick={() => { setManageEditingName(null); setManageError('') }} disabled={manageBusy} aria-label="Cancelar" className="px-2 py-1.5 rounded-lg text-gray-500 hover:bg-gray-200 dark:hover:bg-gray-700"><X className="w-4 h-4" aria-hidden="true" /></button>
                      </>
                    ) : (
                      <>
                        <span className="flex-1 min-w-0 truncate text-sm text-gray-800 dark:text-gray-100" title={name}>{name}</span>
                        <button
                          onClick={() => { setManageEditingName(name); setManageEditValue(name); setManageError('') }}
                          disabled={manageBusy}
                          aria-label={`Renomear ${name}`}
                          className="p-1.5 rounded-lg text-blue-600 hover:bg-blue-100 dark:hover:bg-blue-900/30 disabled:opacity-50"
                        >
                          <Edit className="w-4 h-4" aria-hidden="true" />
                        </button>
                        <button
                          onClick={() => manageDelete(name)}
                          disabled={manageBusy}
                          aria-label={`Excluir ${name}`}
                          className="p-1.5 rounded-lg text-red-600 hover:bg-red-100 dark:hover:bg-red-900/30 disabled:opacity-50"
                        >
                          <Trash2 className="w-4 h-4" aria-hidden="true" />
                        </button>
                      </>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <p className="text-xs text-gray-500 dark:text-gray-400">
              Alterações valem para todo o sistema e refletem no modal de Regras. Renomear atualiza as transações já cadastradas; excluir mantém o valor nas transações antigas, só remove das opções.
            </p>
          </div>
        </div>
      </Modal>

      {/* Modal de Importar Extrato / Fatura */}
      <Modal
        isOpen={isImportExtratoModalOpen}
        onClose={() => { setIsImportExtratoModalOpen(false); setSelectedBank(null); setExtratoStep(0); setExtratoFile(null); setExtratoPassword(''); setExtratoPreview([]) }}
        backdropClassName={extratoStep === 3 ? '' : '!items-start pt-[100px]'}
      >
        {/* FIX [L1023]: overflow-hidden removido — conflitava com overflow-y-auto */}
        <div className={`bg-white rounded-2xl w-full ${extratoStep === 3 ? 'max-w-4xl max-h-[calc(100vh-40px)]' : 'max-w-lg max-h-[calc(100vh-120px)]'} overflow-y-auto shadow-2xl border border-gray-200`}>
            {/* Header */}
            <div className="bg-gradient-to-r from-blue-600 to-blue-800 px-6 py-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-white/20 rounded-xl"><Upload className="w-5 h-5 text-white" /></div>
                <div>
                  <h2 className="text-lg font-bold text-white">
                    {extratoStep === 0 ? 'Importar lançamentos' : extratoStep === 3 ? 'Revisar antes de importar' : importType === 'fatura' ? 'Importar Fatura de Cartão' : 'Importar Extrato Bancário'}
                  </h2>
                  <p className="text-blue-100 text-xs mt-0.5">
                    {extratoStep === 0 && 'Escolha o tipo de arquivo que deseja importar'}
                    {extratoStep === 1 && <>Selecione o banco · Arquivos aceitos: <span className="font-semibold">PDF</span></>}
                    {extratoStep === 2 && `Passo 2 de 3 · Envie o arquivo da ${importType === 'fatura' ? 'fatura' : 'extrato'}`}
                    {extratoStep === 3 && `Passo 3 de 3 · ${extratoPreview.length} transação${extratoPreview.length !== 1 ? 'ões' : ''} encontrada${extratoPreview.length !== 1 ? 's' : ''} · Edite, remova ou adicione antes de confirmar`}
                  </p>
                </div>
              </div>
              {/* FIX [L1041]: aria-label no botão de fechar */}
              <button type="button" aria-label="Fechar modal" onClick={() => { setIsImportExtratoModalOpen(false); setImportType(null); setSelectedBank(null); setExtratoStep(0); setExtratoFile(null); setExtratoPassword(''); setExtratoPreview([]) }} className="text-white/70 hover:text-white hover:bg-white/20 p-2 rounded-full transition-all">
                <X className="w-5 h-5" aria-hidden="true" />
              </button>
            </div>

            {/* Conteúdo */}
            <div className="p-5">
              {/* Passo 0 — Tipo */}
              {extratoStep === 0 && (
                <div className="flex flex-col gap-4">
                  <p className="text-sm text-gray-500 text-center">O que você deseja importar?</p>
                  <div className="grid grid-cols-2 gap-4">
                    <button type="button" onClick={() => { setImportType('extrato'); setExtratoStep(1) }} className="flex flex-col items-center gap-3 p-6 rounded-2xl border-2 border-gray-200 bg-white hover:border-blue-400 hover:shadow-md transition-all group">
                      <div className="w-14 h-14 rounded-2xl bg-blue-50 flex items-center justify-center group-hover:bg-blue-100 transition-colors">
                        <svg className="w-7 h-7 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" /></svg>
                      </div>
                      <div className="text-center">
                        <p className="font-semibold text-gray-800 text-sm">Extrato Bancário</p>
                        <p className="text-xs text-gray-500 mt-0.5">Movimentações da conta corrente</p>
                      </div>
                    </button>
                    <button type="button" onClick={() => { setImportType('fatura'); setExtratoStep(1) }} className="flex flex-col items-center gap-3 p-6 rounded-2xl border-2 border-gray-200 bg-white hover:border-purple-400 hover:shadow-md transition-all group">
                      <div className="w-14 h-14 rounded-2xl bg-purple-50 flex items-center justify-center group-hover:bg-purple-100 transition-colors">
                        <svg className="w-7 h-7 text-purple-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" /></svg>
                      </div>
                      <div className="text-center">
                        <p className="font-semibold text-gray-800 text-sm">Fatura de Cartão</p>
                        <p className="text-xs text-gray-500 mt-0.5">Compras e gastos no crédito</p>
                      </div>
                    </button>
                  </div>
                  {/* FIX: resetar todos os estados do extrato ao cancelar no passo 0 */}
                  <button type="button" onClick={() => { setIsImportExtratoModalOpen(false); setImportType(null); setExtratoStep(0); setExtratoFile(null); setExtratoPassword(''); setExtratoPreview([]) }} className="mt-1 w-full py-2.5 rounded-xl border border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 text-sm font-medium hover:bg-gray-50 dark:hover:!bg-[#2d3f52] transition-colors">Cancelar</button>
                </div>
              )}

              {/* Passo 1 — Seleção do banco */}
              {/* FIX [L1077]: BankBtn e DevBtn agora são componentes externos, sem re-mount a cada render */}
              {extratoStep === 1 && (
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                  {/* ── Ativos (ordem alfabética) ── */}
                  <BankBtn id="bb"          label="Banco do Brasil" bg="#003882" domain="bb.com.br"          initials="BB"  importType={importType} selectedBank={selectedBank} onSelect={(id) => setSelectedBank(id || null)} />
                  <BankBtn id="c6"          label="C6 Bank"         bg="#242424" domain="c6bank.com.br"      initials="C6"  importType={importType} selectedBank={selectedBank} onSelect={(id) => setSelectedBank(id || null)} />
                  <BankBtn id="infinitypay" label="InfinityPay"     bg="#00C853" domain="infinitepay.io"     initials="IP"  importType={importType} selectedBank={selectedBank} onSelect={(id) => setSelectedBank(id || null)} disabledInFatura />
                  <BankBtn id="mercadopago" label="Mercado Pago"    bg="#009EE3" domain="mercadopago.com.br" initials="MP"  importType={importType} selectedBank={selectedBank} onSelect={(id) => setSelectedBank(id || null)} disabledInFatura />
                  <BankBtn id="sicoob"      label="Sicoob"          bg="#007A4B" domain="sicoob.com.br"      initials="SC"  importType={importType} selectedBank={selectedBank} onSelect={(id) => setSelectedBank(id || null)} disabledInFatura />
                  {/* ── Em desenvolvimento (ordem alfabética, ignorando "Banco") ── */}
                  <DevBtn label="Bradesco"    bg="#CC092F" domain="bradesco.com.br"  initials="BD" />
                  <DevBtn label="BTG Pactual" bg="#003366" domain="btgpactual.com"   initials="BTG" />
                  <DevBtn label="Banco Inter" bg="#FF8700" domain="bancointer.com"   initials="IN" />
                  <DevBtn label="Nubank"      bg="#9C44DC" domain="nubank.com.br"    initials="NU" />
                  <DevBtn label="Banco Safra" bg="#1B3F7A" domain="safra.com.br"     initials="SF" />
                  <DevBtn label="Santander"   bg="#EA1D25" domain="santander.com.br" initials="SN" />
                  <DevBtn label="XP"          bg="#1A1A1A" domain="xpi.com.br"       initials="XP" />
                </div>
              )}

              {/* Rodapé passo 1 */}
              {extratoStep === 1 && (
                <div className="mt-4 flex gap-3">
                  <button type="button" onClick={() => { setSelectedBank(null); setExtratoStep(0) }} className="flex-1 px-4 py-3 bg-gray-100 dark:!bg-[#2d3f52] text-gray-700 dark:text-gray-200 font-semibold rounded-xl hover:bg-gray-200 dark:hover:!bg-[#354b60] transition-all">Voltar</button>
                  <button type="button" disabled={!selectedBank} onClick={() => setExtratoStep(2)}
                    className={`flex-1 px-4 py-3 font-semibold rounded-xl transition-all flex items-center justify-center gap-2 ${selectedBank ? 'bg-gradient-to-r from-blue-500 to-blue-700 text-white hover:from-blue-600 hover:to-blue-800 shadow-lg' : 'bg-gray-200 text-gray-400 cursor-not-allowed'}`}>
                    <ChevronRight className="w-4 h-4" />Continuar
                  </button>
                </div>
              )}

              {/* Passo 2 — Upload */}
              {extratoStep === 2 && (
                <div className="mt-4 space-y-4">
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 px-3 py-2 bg-purple-50 rounded-lg border border-purple-200">
                      <CheckCircle2 className="w-4 h-4 text-purple-500 flex-shrink-0" />
                      <span className="text-sm text-purple-700">Tipo: <span className="font-semibold">{importType === 'fatura' ? 'Fatura de Cartão' : 'Extrato Bancário'}</span></span>
                    </div>
                    <div className="flex items-center gap-2 px-3 py-2 bg-blue-50 rounded-lg border border-blue-200">
                      <CheckCircle2 className="w-4 h-4 text-blue-500 flex-shrink-0" />
                      <span className="text-sm text-blue-700">Banco: <span className="font-semibold">{{ bb: 'Banco do Brasil', sicoob: 'Sicoob', c6: 'C6 Bank', mercadopago: 'Mercado Pago', infinitypay: 'InfinityPay' }[selectedBank!]}</span></span>
                      <button type="button" onClick={() => { setExtratoStep(1); setExtratoFile(null) }} className="ml-auto text-blue-400 hover:text-blue-600 text-xs underline">Alterar</button>
                    </div>
                  </div>
                  {/* FIX [L1165]: remover input do DOM tanto no onchange quanto no focus da window (cancelamento) */}
                  {!extratoFile ? (
                    <button type="button" onClick={() => { const i = document.createElement('input'); i.type='file'; i.accept='.pdf,.xlsx'; i.style.display='none'; const cleanup = () => { if (document.body.contains(i)) document.body.removeChild(i); window.removeEventListener('focus', cleanup) }; i.onchange=(e) => { const f=(e.target as HTMLInputElement).files?.[0]; if(f) setExtratoFile(f); cleanup() }; window.addEventListener('focus', cleanup, { once: true }); document.body.appendChild(i); i.click() }}
                      className="w-full border-2 border-dashed border-blue-300 rounded-xl p-6 flex flex-col items-center gap-2 hover:border-blue-500 hover:bg-blue-50 transition-all">
                      <Upload className="w-8 h-8 text-blue-400" />
                      <span className="text-sm font-semibold text-gray-700">Clique para selecionar o arquivo</span>
                      <span className="text-xs text-gray-400">PDF ou XLSX · Máx. 10 MB</span>
                    </button>
                  ) : (
                    <div className="w-full p-4 bg-green-50 border-2 border-green-200 rounded-xl flex items-center gap-3">
                      <div className="p-2 bg-green-100 rounded-full"><CheckCircle2 className="w-5 h-5 text-green-600" /></div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-green-800 truncate">{extratoFile.name}</p>
                        <p className="text-xs text-green-600">{(extratoFile.size / 1024).toFixed(1)} KB</p>
                      </div>
                      <button type="button" onClick={() => setExtratoFile(null)} className="text-green-500 hover:text-green-700 p-1 rounded-full hover:bg-green-100"><X className="w-4 h-4" /></button>
                    </div>
                  )}
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-medium text-gray-500">Senha do PDF <span className="text-gray-400">(deixe em branco se não houver)</span></label>
                    <input type="password" value={extratoPassword} onChange={(e) => setExtratoPassword(e.target.value)} placeholder="Senha do arquivo PDF"
                      className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 transition-all" />
                  </div>
                  <div className="flex gap-3">
                    <button type="button" onClick={() => { setExtratoStep(1); setExtratoFile(null) }} className="flex-1 px-4 py-3 bg-gray-100 dark:!bg-[#2d3f52] text-gray-700 dark:text-gray-200 font-semibold rounded-xl hover:bg-gray-200 dark:hover:!bg-[#354b60] transition-all flex items-center justify-center gap-2">
                      <ChevronLeft className="w-4 h-4" />Voltar
                    </button>
                    <button type="button" disabled={!extratoFile || isUploadingExtrato}
                      onClick={async () => {
                        if (!extratoFile || !selectedBank) return
                        setIsUploadingExtrato(true)
                        try {
                          const formData = new FormData()
                          formData.append('file', extratoFile)
                          formData.append('bank', selectedBank)
                          formData.append('importType', importType ?? 'extrato')
                          if (extratoPassword) formData.append('password', extratoPassword)
                          const response = await fetch(`${API_BASE_URL}/import/extrato`, { method: 'POST', headers: { }, body: formData })
                          if (response.ok) {
                            const result = await response.json()
                            const withIds: PreviewTx[] = (result.data ?? []).map((t: Omit<PreviewTx, '_id'>, i: number) => ({ ...t, _id: `preview-${Date.now()}-${i}` }))
                            setExtratoPreview(withIds)
                            setExtratoStep(3)
                          } else {
                            const errBody = await response.json().catch(() => ({ error: 'Erro desconhecido' }))
                            alert(`Erro ao processar arquivo: ${errBody.error || 'Tente novamente.'}`)
                          }
                        } catch (e) {
                          alert(`Erro ao enviar arquivo: ${e instanceof Error ? e.message : 'Erro desconhecido'}`)
                        } finally {
                          setIsUploadingExtrato(false)
                        }
                      }}
                      className={`flex-1 px-4 py-3 font-semibold rounded-xl transition-all flex items-center justify-center gap-2 ${extratoFile && !isUploadingExtrato ? 'bg-gradient-to-r from-blue-500 to-blue-700 text-white hover:from-blue-600 hover:to-blue-800 shadow-lg' : 'bg-gray-200 text-gray-400 cursor-not-allowed'}`}>
                      <Upload className="w-4 h-4" />
                      {isUploadingExtrato ? 'Processando...' : 'Processar arquivo'}
                    </button>
                  </div>
                </div>
              )}

              {/* Passo 3 — Sandbox / Revisão */}
              {/* FIX [L1226]: usar PreviewTxWithSelection para eliminar casts (t as any)._selected */}
              {extratoStep === 3 && (() => {
                const selectedIds = extratoPreview.filter(t => t._selected).map(t => t._id)
                const allSelected = extratoPreview.length > 0 && selectedIds.length === extratoPreview.length
                const someSelected = selectedIds.length > 0 && !allSelected
                const toggleAll = () => setExtratoPreview(prev => prev.map(t => ({ ...t, _selected: !allSelected })))
                const toggleOne = (id: string) => setExtratoPreview(prev => prev.map(t => t._id === id ? { ...t, _selected: !t._selected } : t))
                const deleteSelected = () => setExtratoPreview(prev => prev.filter(t => !t._selected))
                const totalReceita = extratoPreview.filter(t => t.type === 'Receita').reduce((s, t) => s + t.value, 0)
                const totalDespesa = extratoPreview.filter(t => t.type === 'Despesa').reduce((s, t) => s + t.value, 0)
                const saldo = totalReceita - totalDespesa
                return (
                  <div className="mt-2 space-y-4">
                    <div className="grid grid-cols-3 gap-3">
                      <div className="bg-green-50 rounded-xl p-3 text-center"><p className="text-xs text-green-600 font-medium">Receitas</p><p className="text-sm font-bold text-green-700">R$ {totalReceita.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p></div>
                      <div className="bg-red-50 rounded-xl p-3 text-center"><p className="text-xs text-red-600 font-medium">Despesas</p><p className="text-sm font-bold text-red-700">R$ {totalDespesa.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p></div>
                      <div className={`rounded-xl p-3 text-center ${saldo >= 0 ? 'bg-blue-50' : 'bg-orange-50'}`}>
                        <p className={`text-xs font-medium ${saldo >= 0 ? 'text-blue-600' : 'text-orange-600'}`}>Saldo</p>
                        <p className={`text-sm font-bold ${saldo >= 0 ? 'text-blue-700' : 'text-orange-700'}`}>{saldo < 0 ? '-' : ''}R$ {Math.abs(saldo).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                      </div>
                    </div>
                    {selectedIds.length > 0 && (
                      <div className="flex items-center justify-between bg-red-50 border border-red-200 rounded-xl px-4 py-2.5">
                        <span className="text-xs font-semibold text-red-700">{selectedIds.length} selecionada{selectedIds.length !== 1 ? 's' : ''}</span>
                        <button type="button" onClick={deleteSelected} className="flex items-center gap-1.5 px-3 py-1.5 bg-red-500 hover:bg-red-600 text-white text-xs font-bold rounded-lg transition-colors">
                          <Trash2 className="w-3.5 h-3.5" />Excluir selecionadas
                        </button>
                      </div>
                    )}
                    <div className="overflow-x-auto rounded-xl border border-gray-200">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="bg-gray-50 text-gray-500 uppercase tracking-wide">
                            <th className="px-3 py-2 w-8"><input type="checkbox" checked={allSelected} ref={el => { if (el) el.indeterminate = someSelected }} onChange={toggleAll} className="w-3.5 h-3.5 rounded accent-blue-500 cursor-pointer" /></th>
                            <th className="px-3 py-2 text-left font-semibold w-28">Data</th>
                            <th className="px-3 py-2 text-left font-semibold">Descrição</th>
                            <th className="px-3 py-2 text-left font-semibold w-24">Valor</th>
                            <th className="px-3 py-2 text-left font-semibold w-24">Tipo</th>
                            <th className="px-3 py-2 text-left font-semibold w-28">Categoria</th>
                            <th className="px-3 py-2 w-8"></th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {extratoPreview.map((tx) => {
                            const isSelected = !!tx._selected
                            return (
                              <tr key={tx._id} className={`transition-colors ${isSelected ? 'bg-red-50' : 'hover:bg-gray-50'}`}>
                                <td className="px-3 py-1 text-center"><input type="checkbox" checked={isSelected} onChange={() => toggleOne(tx._id)} className="w-3.5 h-3.5 rounded accent-blue-500 cursor-pointer" /></td>
                                <td className="px-2 py-1"><input type="date" value={tx.date} onChange={(e) => setExtratoPreview(prev => prev.map(t => t._id === tx._id ? { ...t, date: e.target.value } : t))} className="w-full bg-transparent border border-transparent hover:border-gray-300 focus:border-blue-400 rounded px-1 py-0.5 text-xs text-gray-700 focus:outline-none transition-colors" /></td>
                                <td className="px-2 py-1"><input type="text" value={tx.description} onChange={(e) => setExtratoPreview(prev => prev.map(t => t._id === tx._id ? { ...t, description: e.target.value } : t))} className="w-full bg-transparent border border-transparent hover:border-gray-300 focus:border-blue-400 rounded px-1 py-0.5 text-xs text-gray-700 focus:outline-none transition-colors" /></td>
                                <td className="px-2 py-1"><input type="number" step="0.01" value={tx.value} onChange={(e) => setExtratoPreview(prev => prev.map(t => t._id === tx._id ? { ...t, value: parseFloat(e.target.value) || 0 } : t))} className="w-full bg-transparent border border-transparent hover:border-gray-300 focus:border-blue-400 rounded px-1 py-0.5 text-xs text-gray-700 focus:outline-none transition-colors" /></td>
                                <td className="px-2 py-1"><button type="button" onClick={() => setExtratoPreview(prev => prev.map(t => t._id === tx._id ? { ...t, type: t.type === 'Receita' ? 'Despesa' : 'Receita' } : t))} className={`px-2 py-0.5 rounded-full text-xs font-semibold transition-colors ${tx.type === 'Receita' ? 'bg-green-100 text-green-700 hover:bg-green-200' : 'bg-red-100 text-red-700 hover:bg-red-200'}`}>{tx.type}</button></td>
                                <td className="px-2 py-1"><input type="text" value={tx.category} onChange={(e) => setExtratoPreview(prev => prev.map(t => t._id === tx._id ? { ...t, category: e.target.value } : t))} className="w-full bg-transparent border border-transparent hover:border-gray-300 focus:border-blue-400 rounded px-1 py-0.5 text-xs text-gray-700 focus:outline-none transition-colors" /></td>
                                <td className="px-2 py-1 text-center"><button type="button" onClick={() => setExtratoPreview(prev => prev.filter(t => t._id !== tx._id))} className="text-gray-300 hover:text-red-500 transition-colors" title="Remover"><X className="w-3.5 h-3.5" /></button></td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                    {extratoPreview.length === 0 && <p className="text-center text-sm text-gray-400 py-4">Nenhuma transação. Adicione manualmente abaixo.</p>}
                    <button type="button" onClick={() => setExtratoPreview(prev => [...prev, { _id: `preview-new-${Date.now()}`, date: new Date().toISOString().split('T')[0], description: '', value: 0, type: 'Despesa', category: 'Outros' }])}
                      className="w-full py-2 rounded-xl border-2 border-dashed border-gray-300 text-gray-500 hover:border-blue-400 hover:text-blue-500 transition-all text-sm font-medium flex items-center justify-center gap-2">
                      <Plus className="w-4 h-4" />Adicionar transação
                    </button>
                    <div className="flex gap-3 pt-1">
                      <button type="button" onClick={() => { setExtratoStep(2); setExtratoPreview([]) }} className="flex-1 px-4 py-3 bg-gray-100 dark:!bg-[#2d3f52] text-gray-700 dark:text-gray-200 font-semibold rounded-xl hover:bg-gray-200 dark:hover:!bg-[#354b60] transition-all flex items-center justify-center gap-2">
                        <ChevronLeft className="w-4 h-4" />Voltar
                      </button>
                      <button type="button" disabled={extratoPreview.length === 0 || isConfirmingImport}
                        onClick={async () => {
                          if (extratoPreview.length === 0) return
                          const label = importType === 'fatura' ? 'fatura' : 'extrato'
                          const confirmed = window.confirm(`Confirmar a importação de ${extratoPreview.length} transação${extratoPreview.length !== 1 ? 'ões' : ''} do ${label}?\n\nEssa ação pode ser desfeita nos próximos 15 segundos após a importação.`)
                          if (!confirmed) return
                          setIsConfirmingImport(true)
                          try {
                            const response = await fetch(`${API_BASE_URL}/import/extrato/confirm`, {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              // FIX [L1226]: remover campos internos (_id, _selected) usando tipos corretos
                              body: JSON.stringify({ transactions: extratoPreview.map(({ _id: _r, _selected: _s, ...rest }) => rest), importType: importType || 'extrato' })
                            })
                            if (response.ok) {
                              const result = await response.json()
                              const savedIds: string[] = (result.data ?? []).map((t: { id: string }) => t.id)
                              if (result.data?.length) setTransactions(prev => [...result.data, ...prev])
                              setIsImportExtratoModalOpen(false); setImportType(null); setSelectedBank(null); setExtratoStep(0); setExtratoFile(null); setExtratoPassword(''); setExtratoPreview([])
                              setLastImportBatch(savedIds); setUndoMaxCountdown(60); setUndoCountdown(60); setShowUndoToast(true)
                            } else {
                              const errBody = await response.json().catch(() => ({ error: 'Erro desconhecido' }))
                              alert(`Erro ao importar: ${errBody.error || 'Tente novamente.'}`)
                            }
                          } catch (e) {
                            alert(`Erro ao importar: ${e instanceof Error ? e.message : 'Erro desconhecido'}`)
                          } finally {
                            setIsConfirmingImport(false)
                          }
                        }}
                        className={`flex-1 px-4 py-3 font-semibold rounded-xl transition-all flex items-center justify-center gap-2 ${extratoPreview.length > 0 && !isConfirmingImport ? 'bg-gradient-to-r from-green-500 to-green-700 text-white hover:from-green-600 hover:to-green-800 shadow-lg' : 'bg-gray-200 text-gray-400 cursor-not-allowed'}`}>
                        {isConfirmingImport ? <><span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />Importando...</> : <><CheckCircle2 className="w-4 h-4" />Confirmar importação</>}
                      </button>
                    </div>
                  </div>
                )
              })()}
            </div>
          </div>
      </Modal>

      {/* Toast de Desfazer Importação */}
      {showUndoToast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[100] animate-in slide-in-from-bottom-4 duration-300">
          <div className="flex items-center gap-3 bg-gray-900 text-white rounded-2xl shadow-2xl px-5 py-4 min-w-[320px] border border-gray-700">
            <div className="relative flex-shrink-0">
              <svg className="w-9 h-9 -rotate-90" viewBox="0 0 36 36">
                <circle cx="18" cy="18" r="15" fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="3" />
                <circle cx="18" cy="18" r="15" fill="none" stroke="#4ade80" strokeWidth="3" strokeDasharray={`${(undoCountdown / undoMaxCountdown) * 94.2} 94.2`} strokeLinecap="round" />
              </svg>
              <span className="absolute inset-0 flex items-center justify-center text-xs font-bold text-green-400">{undoCountdown}</span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold leading-tight">Importação concluída!</p>
              <p className="text-xs text-gray-400 mt-0.5">Deseja desfazer?</p>
            </div>
            <button type="button" disabled={isUndoing}
              onClick={async () => {
                if (lastImportBatch.length === 0) return
                setIsUndoing(true)
                try {
                  const response = await fetch(`${API_BASE_URL}/transactions`, {
                    method: 'DELETE',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ ids: lastImportBatch }),
                  })
                  if (response.ok) {
                    setTransactions(prev => prev.filter(t => !lastImportBatch.includes(String(t.id))))
                    setShowUndoToast(false); setLastImportBatch([])
                  } else {
                    alert('Não foi possível desfazer a importação. Tente excluir as transações manualmente.')
                  }
                } catch {
                  alert('Erro ao desfazer a importação.')
                } finally {
                  setIsUndoing(false)
                }
              }}
              className="px-3 py-1.5 bg-green-500 hover:bg-green-400 disabled:bg-gray-600 text-white text-xs font-bold rounded-xl transition-colors flex-shrink-0">
              {isUndoing ? '...' : 'Desfazer'}
            </button>
            <button type="button" onClick={() => { setShowUndoToast(false); setLastImportBatch([]) }} className="text-gray-400 hover:text-white transition-colors flex-shrink-0">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export default Transactions
export { Transactions as TransactionsPage }


