import React, { useEffect, useMemo, useRef, useState } from 'react'
import { DollarSign, Plus, Download, Upload, Edit, Trash2, Calendar, Filter, X, RefreshCw, CheckCircle2, ChevronRight, ChevronLeft } from 'lucide-react'
import { usePermissions } from '../hooks/usePermissions'

type TransactionType = 'Receita' | 'Despesa'

interface Transaction {
  id: string
  date: string
  description: string
  value: number
  type: TransactionType
  category: string
  subcategory?: string
}

const API_BASE_URL = '/api'

// SUBCATEGORIES agora será carregado do backend

interface TransactionsProps {
  showModal?: boolean
  onCloseModal?: () => void
}

const Transactions: React.FC<TransactionsProps> = ({ showModal, onCloseModal }) => {
  const permissions = usePermissions();
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [selectedTransactions, setSelectedTransactions] = useState<Set<string>>(new Set())
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
  const [hiddenSubcategories, setHiddenSubcategories] = useState<string[]>([])
  const [isRemoveSubcategoryOpen, setIsRemoveSubcategoryOpen] = useState(false)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  // ── Estados do modal de importar extrato / fatura ──────────────────────────
  const [isImportExtratoModalOpen, setIsImportExtratoModalOpen] = useState(false)
  const [importType, setImportType] = useState<'extrato' | 'fatura' | null>(null)
  const [selectedBank, setSelectedBank] = useState<string | null>(null)
  const [extratoStep, setExtratoStep] = useState<0 | 1 | 2 | 3>(0)
  const [extratoFile, setExtratoFile] = useState<File | null>(null)
  const [extratoPassword, setExtratoPassword] = useState('')
  const [isUploadingExtrato, setIsUploadingExtrato] = useState(false)
  type PreviewTx = { _id: string; date: string; description: string; value: number; type: 'Receita' | 'Despesa'; category: string }
  const [extratoPreview, setExtratoPreview] = useState<PreviewTx[]>([])
  const [isConfirmingImport, setIsConfirmingImport] = useState(false)
  // Undo system
  const [lastImportBatch, setLastImportBatch] = useState<string[]>([])
  const [showUndoToast, setShowUndoToast] = useState(false)
  const [undoCountdown, setUndoCountdown] = useState(15)
  const [isUndoing, setIsUndoing] = useState(false)

  const [isSyncingAsaas, setIsSyncingAsaas] = useState(false)
  const [syncResult, setSyncResult] = useState<{ inserted: number; skipped: number } | null>(null)

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
          'Authorization': `Bearer ${localStorage.getItem('authToken')}`,
        },
        body: JSON.stringify({}),
      })
      const data = await r.json()
      if (data.success) {
        setSyncResult({ inserted: data.inserted, skipped: data.skipped })
        if (data.inserted > 0) {
          const r2 = await fetch(`${API_BASE_URL}/transactions`)
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
  const [filters, setFilters] = useState<{ type: '' | TransactionType, category: string, subcategory: string, dateFrom: string, dateTo: string, description: string }>({ type: '', category: '', subcategory: '', dateFrom: '', dateTo: '', description: '' })

  // calendários de filtro

  useEffect(() => {
    const load = async () => {
      try {
        const r = await fetch(`${API_BASE_URL}/transactions`)
        const j = await r.json()
        if (j.success) setTransactions(j.data)
      } catch {}
    }
    load()
  }, [])

  // Carregar subcategorias do backend e subcategorias ocultas do localStorage
  useEffect(() => {
    const loadSubcategories = async () => {
      try {
        const r = await fetch(`${API_BASE_URL}/subcategories`)
        const j = await r.json()
        if (j.success) {
          // Carregar subcategorias ocultas do localStorage
          const hidden = JSON.parse(localStorage.getItem('hiddenSubcategories') || '[]')
          setHiddenSubcategories(hidden)
          
          // Filtrar subcategorias ocultas
          const visibleSubcategories = j.data.filter((subcat: string) => !hidden.includes(subcat))
          setSubcategories(visibleSubcategories)
        }
      } catch {}
    }
    loadSubcategories()
  }, [])

  // Controla overlay global (classe no body) ao abrir/fechar modais
  useEffect(() => {
    const body = document?.body
    if (!body) return
    if (isImportExportOpen || isModalOpen || isAddSubcategoryOpen || isRemoveSubcategoryOpen) body.classList.add('modal-open')
    else body.classList.remove('modal-open')
    return () => { body.classList.remove('modal-open') }
  }, [isImportExportOpen, isModalOpen, isAddSubcategoryOpen, isRemoveSubcategoryOpen])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return

      if (isRemoveSubcategoryOpen) {
        setIsRemoveSubcategoryOpen(false)
        return
      }

      if (isAddSubcategoryOpen) {
        setIsAddSubcategoryOpen(false)
        setNewSubcategoryError('')
        return
      }

      if (isImportExportOpen) {
        setIsImportExportOpen(false)
        return
      }

      if (isModalOpen) {
        closeModal()
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [isRemoveSubcategoryOpen, isAddSubcategoryOpen, isImportExportOpen, isModalOpen])

  // Controlar modal externamente (apenas se showModal for fornecido)
  useEffect(() => {
    if (showModal !== undefined) {
      setIsModalOpen(showModal)
    }
  }, [showModal])

  const closeModal = () => {
    setIsModalOpen(false)
    setEditing(null)
    setFormErrors({})
    if (onCloseModal) {
      onCloseModal()
    }
  }

  const handleSort = (field: keyof Transaction) => {
    let direction: 'asc' | 'desc' = 'asc'
    if (sortConfig.field === field && sortConfig.direction === 'asc') direction = 'desc'
    setSortConfig({ field, direction })
  }

  const getSortIcon = (field: keyof Transaction) => {
    if (sortConfig.field !== field) return <span className="text-gray-400">↕</span>
    return sortConfig.direction === 'asc' ? <span className="text-blue-600">↑</span> : <span className="text-blue-600">↓</span>
  }

  const filteredAndSorted = useMemo(() => {
    let list = [...transactions]
    if (filters.description) list = list.filter(t => t.description.toLowerCase().includes(filters.description.toLowerCase()))
    if (filters.type) list = list.filter(t => t.type === filters.type)
    if (filters.category) list = list.filter(t => t.category.toLowerCase().includes(filters.category.toLowerCase()))
    if (filters.subcategory) list = list.filter(t => (t.subcategory || '').toLowerCase().includes(filters.subcategory.toLowerCase()))
    if (filters.dateFrom) list = list.filter(t => new Date(t.date) >= new Date(filters.dateFrom))
    if (filters.dateTo) list = list.filter(t => new Date(t.date) <= new Date(filters.dateTo))

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
  }, [transactions, filters, sortConfig])

  const handleSelectAll = () => {
    if (selectedTransactions.size === transactions.length) setSelectedTransactions(new Set())
    else setSelectedTransactions(new Set(transactions.map(t => t.id)))
  }

  const handleSelect = (id: string) => {
    setSelectedTransactions(prev => {
      const s = new Set(prev)
      if (s.has(id)) s.delete(id); else s.add(id)
      return s
    })
  }

  const clearFilters = () => setFilters({ type: '', category: '', subcategory: '', dateFrom: '', dateTo: '', description: '' })


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
        // Recarregar subcategorias do backend
        const subcategoriesResponse = await fetch(`${API_BASE_URL}/subcategories`)
        const subcategoriesData = await subcategoriesResponse.json()
        if (subcategoriesData.success) {
          setSubcategories(subcategoriesData.data)
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

  // Função para remover subcategoria da lista local (salva no localStorage)
  const removeSubcategoryFromList = () => {
    if (form.subcategory) {
      // Adicionar à lista de subcategorias ocultas
      const newHidden = [...hiddenSubcategories, form.subcategory]
      setHiddenSubcategories(newHidden)
      
      // Salvar no localStorage
      localStorage.setItem('hiddenSubcategories', JSON.stringify(newHidden))
      
      // Remover da lista visível
      setSubcategories(prev => prev.filter(subcat => subcat !== form.subcategory))
      setForm(prev => ({ ...prev, subcategory: '' }))
      setIsRemoveSubcategoryOpen(false)
    }
  }

  // CRUD
  const validateForm = () => {
    const errors: {[key: string]: string} = {}
    
    if (!form.date) errors.date = 'Campo obrigatório'
    if (!form.description.trim()) errors.description = 'Campo obrigatório'
    if (!form.value || parseFloat(form.value) <= 0) errors.value = 'Campo obrigatório'
    if (!form.type) errors.type = 'Campo obrigatório'
    if (!form.category) errors.category = 'Campo obrigatório'
    // Subcategoria é obrigatória apenas para Despesas
    if (form.type === 'Despesa' && !form.subcategory.trim()) {
      errors.subcategory = 'Campo obrigatório'
    }
    
    setFormErrors(errors)
    return Object.keys(errors).length === 0
  }

  const saveTransaction = async () => {
    console.log('saveTransaction chamado', form)
    if (!validateForm()) {
      console.log('Validação falhou', formErrors)
      return
    }
    
    const payload = {
      ...(editing?.id && { id: editing.id }),
      date: form.date,
      description: form.description,
      value: parseFloat(form.value),
      type: form.type,
      category: form.category,
      subcategory: form.subcategory
    }
    try {
      if (editing) {
        const r = await fetch(`${API_BASE_URL}/transactions/${editing.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
        const j = await r.json(); if (j.success) setTransactions(prev => prev.map(t => t.id === editing.id ? j.data : t))
      } else {
        const r = await fetch(`${API_BASE_URL}/transactions`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
        const j = await r.json(); if (j.success) setTransactions(prev => [j.data, ...prev])
      }
      closeModal(); setForm({ date: new Date().toISOString().split('T')[0], description: '', value: '', type: 'Receita', category: '', subcategory: '' })
    } catch (error) {
      console.error('Erro ao salvar:', error)
    }
  }

  const deleteOne = async (id: string) => {
    try {
      const r = await fetch(`${API_BASE_URL}/transactions/${id}`, { method: 'DELETE' })
      const j = await r.json(); if (j.success) setTransactions(prev => prev.filter(t => t.id !== id))
    } catch {}
  }

  const deleteSelected = async () => {
    try {
      const ids = Array.from(selectedTransactions)
      await fetch(`${API_BASE_URL}/transactions`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids }) })
      setTransactions(prev => prev.filter(t => !selectedTransactions.has(t.id)))
      setSelectedTransactions(new Set())
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
      }
    } catch {}
  }

  const handleExport = async () => {
    try {
      const r = await fetch(`${API_BASE_URL}/export`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'transactions', data: transactions }) })
      const blob = await r.blob(); const url = URL.createObjectURL(blob)
      const a = document.createElement('a'); a.href = url; a.download = `transactions_${new Date().toISOString().split('T')[0]}.xlsx`; a.click(); URL.revokeObjectURL(url)
    } catch {}
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <h1 className="text-3xl font-bold flex items-center gap-3">
          <DollarSign className="w-8 h-8 text-blue-600" />
          Transações
        </h1>
        <div className="flex gap-3">
          {(permissions.canImport || permissions.canExport) && (
            <button
              onClick={() => setIsImportExportOpen(true)}
              className="flex items-center gap-3 px-6 py-3 bg-gradient-to-r from-blue-500 to-indigo-600 text-white font-semibold rounded-xl hover:from-blue-600 hover:to-indigo-700 shadow-lg hover:shadow-xl transform hover:-translate-y-1 transition-all duration-300"
            >
              <Download className="h-5 w-5" />
              Importar/Exportar
            </button>
          )}
          {permissions.canImport && (
            <button
              onClick={() => { setIsImportExtratoModalOpen(true); setExtratoStep(0); setImportType(null); setSelectedBank(null); setExtratoFile(null); setExtratoPassword(''); setExtratoPreview([]) }}
              className="flex items-center gap-3 px-6 py-3 bg-gradient-to-r from-blue-500 to-indigo-600 text-white font-semibold rounded-xl hover:from-blue-600 hover:to-indigo-700 shadow-lg shadow-blue-500/25 hover:shadow-xl hover:shadow-blue-500/35 transform hover:-translate-y-1 active:translate-y-0 transition-all duration-200"
            >
              <Upload className="h-5 w-5" />
              Importar Extrato
            </button>
          )}
          <div className="flex items-center gap-2">
            {syncResult && (
              <span className="text-xs text-green-700 bg-green-100 px-3 py-1.5 rounded-lg font-medium">
                ✓ {syncResult.inserted} importadas, {syncResult.skipped} já existiam
              </span>
            )}
            <button
              onClick={syncAsaas}
              disabled={isSyncingAsaas}
              className="flex items-center gap-2 px-4 py-2.5 bg-emerald-600 text-white font-semibold rounded-xl hover:bg-emerald-700 shadow-md transition-all duration-200 disabled:opacity-60 disabled:cursor-not-allowed"
              title="Sincronizar entradas e saídas do Asaas"
            >
              <RefreshCw className={`h-4 w-4 ${isSyncingAsaas ? 'animate-spin' : ''}`} />
              {isSyncingAsaas ? 'Sincronizando...' : 'Sync Asaas'}
            </button>
            {permissions.canCreate && (
              <button
                onClick={() => { setEditing(null); setForm({ date: new Date().toISOString().split('T')[0], description: '', value: '', type: 'Receita', category: '', subcategory: '' }); setFormErrors({}); setIsModalOpen(true) }}
                className="flex items-center gap-3 px-6 py-3 bg-gradient-to-r from-blue-500 to-indigo-600 text-white font-semibold rounded-xl hover:from-blue-600 hover:to-indigo-700 shadow-lg hover:shadow-xl transform hover:-translate-y-1 transition-all duration-300"
              >
                <Plus className="h-5 w-5" />
                Nova Transação
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Filtros */}
      <div className="bg-gradient-to-r from-blue-50/80 to-indigo-50/60 dark:from-blue-900/20 dark:to-indigo-900/10 p-5 rounded-2xl border border-blue-100 dark:border-blue-800/30 shadow-sm">
        <div className="flex flex-col lg:flex-row lg:items-center gap-4 lg:gap-6">
          <div className="flex items-center gap-2">
            <Filter className="w-5 h-5 text-blue-600" />
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
                  className="px-1 sm:px-2 md:px-3 py-1 sm:py-2 border border-blue-200 dark:border-blue-700 rounded-xl text-xs sm:text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-gray-800 dark:text-gray-100 w-full pr-7"
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
                className="px-1 sm:px-2 md:px-3 py-1 sm:py-2 border border-blue-200 dark:border-blue-700 rounded-xl text-xs sm:text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-gray-800 dark:text-gray-100 w-full"
              >
                <option value="">Todos os tipos</option>
                <option value="Receita">Receitas</option>
                <option value="Despesa">Despesas</option>
              </select>
            </div>
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
                className="px-1 sm:px-2 md:px-3 py-1 sm:py-2 border border-blue-200 dark:border-blue-700 rounded-xl text-xs sm:text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-gray-800 dark:text-gray-100 w-full"
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
                className="px-1 sm:px-2 md:px-3 py-1 sm:py-2 border border-blue-200 dark:border-blue-700 rounded-xl text-xs sm:text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-gray-800 dark:text-gray-100 w-full"
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
                  className="px-1 sm:px-2 md:px-3 py-1 sm:py-2 border border-blue-200 dark:border-blue-700 rounded-xl text-xs sm:text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-gray-800 dark:text-gray-100 w-full"
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
                  className="px-1 sm:px-2 md:px-3 py-1 sm:py-2 border border-blue-200 dark:border-blue-700 rounded-xl text-xs sm:text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-gray-800 dark:text-gray-100 w-full"
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
        {transactions.length === 0 ? (
          <div className="bg-white rounded-2xl shadow-lg border border-gray-200 p-8 text-center">
            <p className="text-gray-600">Nenhuma transação encontrada.</p>
            <p className="text-gray-500 text-sm mt-2">Adicione sua primeira transação clicando no botão "Nova Transação".</p>
          </div>
        ) : (
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg border border-gray-100 dark:border-gray-700 overflow-hidden overflow-x-auto">
            <div className="bg-gradient-to-r from-blue-500 to-indigo-600 p-4 min-w-max">
              <div className="flex items-center gap-0.5 sm:gap-1 md:gap-2 lg:gap-3 min-w-[800px]">
                {permissions.canDelete && (
                  <div className="flex justify-center">
                    <input
                      type="checkbox"
                      checked={transactions.length > 0 && selectedTransactions.size === transactions.length}
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
              <div key={t.id} className={`${index % 2 === 0 ? 'imp-row-even' : 'imp-row-odd'} border-b border-gray-100 dark:border-gray-700 p-4 transition-all duration-200 ${index === transactions.length - 1 ? 'border-b-0' : ''}`}>
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
                    <h3 className="text-xs sm:text-sm font-semibold text-gray-900 truncate">{t.description}</h3>
                  </div>
                  <div className="flex-shrink-0 w-16 sm:w-20 text-center">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${t.type === 'Receita' ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400' : 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400'}`}>{t.type}</span>
                  </div>
                  <div className="flex-shrink-0 w-20 sm:w-24 text-center">
                    <span className="text-xs sm:text-sm text-gray-600 dark:text-gray-400 bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded-lg truncate">{t.category}</span>
                  </div>
                  <div className="flex-shrink-0 w-24 sm:w-28 text-center">
                    <span className="text-xs sm:text-sm text-gray-600 dark:text-gray-400 bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded-lg truncate">{t.subcategory || '-'}</span>
                  </div>
                  <div className="flex-shrink-0 w-28 sm:w-36 text-center">
                    <p className={`text-xs sm:text-sm md:text-base font-bold ${t.type === 'Receita' ? 'text-green-600' : 'text-red-600'} truncate`}>
                      {t.type === 'Receita' ? '+' : '-'}R$ {(parseFloat(String(t.value)) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
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

            {selectedTransactions.size > 0 && permissions.canDelete && (
              <div className="flex justify-between items-center p-4 bg-red-50 dark:bg-red-900/20 border-t border-red-200 dark:border-red-800/30">
                <span className="text-sm font-semibold text-red-700 dark:text-red-400">{selectedTransactions.size} selecionada{selectedTransactions.size > 1 ? 's' : ''}</span>
                <button onClick={deleteSelected} className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-red-500 to-red-600 text-white font-semibold rounded-xl hover:from-red-600 hover:to-red-700 transition-all duration-200 shadow-lg hover:shadow-xl hover:-translate-y-0.5">
                  <Trash2 className="h-4 w-4" />
                  Deletar Selecionada{selectedTransactions.size > 1 ? 's' : ''} ({selectedTransactions.size})
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Modal Nova/Editar Transação */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-gradient-to-br from-blue-900/50 to-indigo-900/50 backdrop-blur-sm flex items-center justify-center z-[10000] p-4" onClick={(e) => { if (e.target === e.currentTarget) { closeModal() } }}>
          <div className="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden">
            <div className="bg-gradient-to-r from-blue-500 to-indigo-600 px-6 py-4 flex items-center justify-between">
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <DollarSign className="w-5 h-5" />
                {editing ? 'Editar Transação' : 'Nova Transação'}
              </h2>
              <button onClick={closeModal} className="text-white/80 hover:text-white hover:bg-white/20 rounded-lg p-1.5 transition-all duration-200"><X className="w-5 h-5" /></button>
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
                  </select>
                  {formErrors.type && (
                    <div className="absolute top-full left-0 mt-1 bg-red-500 text-white text-xs px-2 py-1 rounded shadow-lg z-10">
                      {formErrors.type}
                      <div className="absolute -top-1 left-2 w-2 h-2 bg-red-500 transform rotate-45"></div>
                    </div>
                  )}
                </div>
              </div>
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
                  {form.type === 'Receita' ? (
                    <>
                      <option value="Reforço de Caixa">Reforço de Caixa</option>
                      <option value="REURB">REURB</option>
                      <option value="GEO">GEO</option>
                      <option value="PLAN">PLAN</option>
                      <option value="REG">REG</option>
                      <option value="NN">NN</option>
                    </>
                  ) : (
                    <>
                      <option value="Fixo">Fixo</option>
                      <option value="Variavel">Variavel</option>
                      <option value="Investimento">Investimento</option>
                      <option value="Mkt">Mkt</option>
                    </>
                  )}
                </select>
                {formErrors.category && (
                  <div className="absolute top-full left-0 mt-1 bg-red-500 text-white text-xs px-2 py-1 rounded shadow-lg z-10">
                    {formErrors.category}
                    <div className="absolute -top-1 left-2 w-2 h-2 bg-red-500 transform rotate-45"></div>
                  </div>
                )}
              </div>
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
                      {subcategories.map((subcat, index) => (
                        <option key={index} value={subcat}>{subcat}</option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => form.subcategory ? setIsRemoveSubcategoryOpen(true) : setIsAddSubcategoryOpen(true)}
                      className={`px-3 py-2 rounded-lg transition-colors ${
                        form.subcategory 
                          ? 'bg-red-600 text-white hover:bg-red-700' 
                          : 'bg-blue-600 text-white hover:bg-blue-700'
                      }`}
                      title={form.subcategory ? "Remover subcategoria da lista" : "Adicionar nova subcategoria"}
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
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <button onClick={closeModal} className="px-4 py-2.5 rounded-xl bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 dark:text-gray-200 font-medium transition-all duration-200">Cancelar</button>
              <button onClick={saveTransaction} className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 text-white font-semibold shadow-lg shadow-blue-500/25 hover:shadow-xl hover:shadow-blue-500/35 hover:-translate-y-0.5 active:translate-y-0 transition-all duration-200">Salvar</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Importar/Exportar (estrutura Alya com visual IMPGEO) */}
      {isImportExportOpen && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4" onClick={(e) => { if (e.target === e.currentTarget) setIsImportExportOpen(false) }}>
          <div className="relative bg-white dark:bg-gray-800 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 bg-gradient-to-r from-blue-500 to-indigo-600">
              <div className="flex items-center gap-3">
                <Upload className="w-5 h-5 text-white" />
                <h2 className="text-lg font-bold text-white">Importar/Exportar Transações</h2>
              </div>
              <button onClick={() => setIsImportExportOpen(false)} className="text-white/80 hover:text-white hover:bg-white/20 rounded-lg p-1.5 transition-all duration-200"><X className="w-5 h-5" /></button>
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
                <button onClick={() => setIsImportExportOpen(false)} className="w-full px-6 py-3 rounded-xl bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 dark:text-gray-200 text-gray-800 font-semibold transition-all duration-200">
                  Cancelar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal Adicionar Nova Subcategoria */}
      {isAddSubcategoryOpen && (
        <div className="fixed inset-0 z-[10001] bg-gradient-to-br from-blue-900/50 to-indigo-900/50 backdrop-blur-sm flex items-center justify-center p-4" onClick={(e) => { if (e.target === e.currentTarget) { setIsAddSubcategoryOpen(false); setNewSubcategoryError('') } }}>
          <div className="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden">
            <div className="bg-gradient-to-r from-blue-500 to-indigo-600 px-6 py-4 flex items-center justify-between">
              <h2 className="text-lg font-bold text-white flex items-center gap-2"><Plus className="w-5 h-5" /> Adicionar Nova Subcategoria</h2>
              <button onClick={() => { setIsAddSubcategoryOpen(false); setNewSubcategoryError('') }} className="text-white/80 hover:text-white hover:bg-white/20 rounded-lg p-1.5 transition-all duration-200"><X className="w-5 h-5" /></button>
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
                  onKeyPress={(e) => e.key === 'Enter' && addNewSubcategory()}
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
              <button onClick={() => { setIsAddSubcategoryOpen(false); setNewSubcategoryError('') }} className="px-4 py-2 rounded-xl bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 font-medium transition-all duration-200">Cancelar</button>
              <button onClick={addNewSubcategory} className="px-4 py-2 rounded-xl bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 text-white font-semibold shadow-lg shadow-blue-500/25 hover:shadow-xl hover:shadow-blue-500/35 hover:-translate-y-0.5 transition-all duration-200">Adicionar</button>
            </div>
          </div>
        </div>
      </div>
      )}

      {/* Modal Remover Subcategoria */}
      {isRemoveSubcategoryOpen && (
        <div className="fixed inset-0 z-[10001] bg-gradient-to-br from-blue-900/50 to-indigo-900/50 backdrop-blur-sm flex items-center justify-center p-4" onClick={(e) => { if (e.target === e.currentTarget) setIsRemoveSubcategoryOpen(false) }}>
          <div className="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden">
            <div className="bg-gradient-to-r from-blue-500 to-indigo-600 px-6 py-4 flex items-center justify-between">
              <h2 className="text-lg font-bold text-white flex items-center gap-2"><Trash2 className="w-5 h-5" /> Remover Subcategoria</h2>
              <button onClick={() => setIsRemoveSubcategoryOpen(false)} className="text-white/80 hover:text-white hover:bg-white/20 rounded-lg p-1.5 transition-all duration-200"><X className="w-5 h-5" /></button>
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
                    Você está ocultando a subcategoria <strong>"{form.subcategory}"</strong> da sua lista.
                  </p>
                  <p className="text-yellow-700 dark:text-yellow-400 text-sm mt-2">
                    <strong>Importante:</strong> Esta ação não afeta o banco de dados. A subcategoria continuará disponível para outras transações já cadastradas, mas não aparecerá mais na sua lista mesmo após atualizar a página.
                  </p>
                </div>
              </div>
              <div className="mt-6 flex justify-end gap-3">
                <button onClick={() => setIsRemoveSubcategoryOpen(false)} className="px-4 py-2 rounded-xl bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 font-medium transition-all duration-200">Cancelar</button>
                <button onClick={removeSubcategoryFromList} className="px-4 py-2 rounded-xl bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 text-white font-semibold shadow-lg shadow-red-500/25 hover:shadow-xl hover:shadow-red-500/35 hover:-translate-y-0.5 transition-all duration-200">Remover da Lista</button>
              </div>
            </div>
          </div>
        </div>
      )}
      {/* Modal de Importar Extrato / Fatura */}
      {isImportExtratoModalOpen && (
        <div
          className={`fixed inset-0 bg-gradient-to-br from-blue-900/50 to-indigo-900/50 backdrop-blur-sm flex items-center justify-center px-4 pb-4 ${extratoStep === 3 ? 'z-[70] pt-4' : 'z-50 pt-[100px]'}`}
          onClick={(e) => { if (e.target === e.currentTarget) { setIsImportExtratoModalOpen(false); setSelectedBank(null); setExtratoStep(0); setExtratoFile(null); setExtratoPassword(''); setExtratoPreview([]) } }}
        >
          <div className={`bg-white rounded-2xl w-full ${extratoStep === 3 ? 'max-w-4xl max-h-[calc(100vh-40px)]' : 'max-w-lg max-h-[calc(100vh-120px)]'} overflow-y-auto shadow-2xl border border-gray-200 overflow-hidden`}>
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
              <button type="button" onClick={() => { setIsImportExtratoModalOpen(false); setImportType(null); setSelectedBank(null); setExtratoStep(0); setExtratoFile(null); setExtratoPassword(''); setExtratoPreview([]) }} className="text-white/70 hover:text-white hover:bg-white/20 p-2 rounded-full transition-all">
                <X className="w-5 h-5" />
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
                  <button type="button" onClick={() => { setIsImportExtratoModalOpen(false); setImportType(null); setExtratoStep(0); setExtratoFile(null) }} className="mt-1 w-full py-2.5 rounded-xl border border-gray-200 text-gray-600 text-sm font-medium hover:bg-gray-50 transition-colors">Cancelar</button>
                </div>
              )}

              {/* Passo 1 — Seleção do banco */}
              {extratoStep === 1 && (() => {
                const BankBtn = ({ id, label, bg, domain, initials, disabledInFatura = false }: { id: string; label: string; bg: string; domain: string; initials: string; disabledInFatura?: boolean }) => {
                  const isDisabled = disabledInFatura && importType === 'fatura'
                  if (isDisabled) return (
                    <div className="relative group">
                      <button type="button" disabled className="relative flex flex-col items-center gap-2 p-4 rounded-xl border-2 border-dashed border-gray-200 bg-gray-50 opacity-60 cursor-not-allowed w-full">
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
                    <button type="button" onClick={() => setSelectedBank(selectedBank === id ? null : id)}
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
                const DevBtn = ({ label, bg, domain, initials }: { label: string; bg: string; domain: string; initials: string }) => (
                  <div className="relative group">
                    <button type="button" disabled className="relative flex flex-col items-center gap-2 p-4 rounded-xl border-2 border-dashed border-gray-200 bg-gray-50 opacity-60 cursor-not-allowed w-full">
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
                return (
                  <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                    {/* ── Ativos (ordem alfabética) ── */}
                    <BankBtn id="bb"          label="Banco do Brasil" bg="#003882" domain="bb.com.br"          initials="BB" />
                    <BankBtn id="c6"          label="C6 Bank"         bg="#242424" domain="c6bank.com.br"      initials="C6" />
                    <BankBtn id="infinitypay" label="InfinityPay"     bg="#00C853" domain="infinitepay.io"     initials="IP" disabledInFatura />
                    <BankBtn id="mercadopago" label="Mercado Pago"    bg="#009EE3" domain="mercadopago.com.br" initials="MP" disabledInFatura />
                    <BankBtn id="sicoob"      label="Sicoob"          bg="#007A4B" domain="sicoob.com.br"      initials="SC" disabledInFatura />
                    {/* ── Em desenvolvimento (ordem alfabética, ignorando "Banco") ── */}
                    <DevBtn label="Bradesco"    bg="#CC092F" domain="bradesco.com.br"  initials="BD" />
                    <DevBtn label="BTG Pactual" bg="#003366" domain="btgpactual.com"   initials="BTG" />
                    <DevBtn label="Banco Inter" bg="#FF8700" domain="bancointer.com"   initials="IN" />
                    <DevBtn label="Nubank"      bg="#9C44DC" domain="nubank.com.br"    initials="NU" />
                    <DevBtn label="Banco Safra" bg="#1B3F7A" domain="safra.com.br"     initials="SF" />
                    <DevBtn label="Santander"   bg="#EA1D25" domain="santander.com.br" initials="SN" />
                    <DevBtn label="XP"          bg="#1A1A1A" domain="xpi.com.br"       initials="XP" />
                  </div>
                )
              })()}

              {/* Rodapé passo 1 */}
              {extratoStep === 1 && (
                <div className="mt-4 flex gap-3">
                  <button type="button" onClick={() => { setSelectedBank(null); setExtratoStep(0) }} className="flex-1 px-4 py-3 bg-gray-100 text-gray-700 font-semibold rounded-xl hover:bg-gray-200 transition-all">Voltar</button>
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
                  {!extratoFile ? (
                    <button type="button" onClick={() => { const i = document.createElement('input'); i.type='file'; i.accept='.pdf,.xlsx'; i.onchange=(e) => { const f=(e.target as HTMLInputElement).files?.[0]; if(f) setExtratoFile(f); document.body.removeChild(i) }; document.body.appendChild(i); i.click() }}
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
                    <button type="button" onClick={() => { setExtratoStep(1); setExtratoFile(null) }} className="flex-1 px-4 py-3 bg-gray-100 text-gray-700 font-semibold rounded-xl hover:bg-gray-200 transition-all flex items-center justify-center gap-2">
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
                          const response = await fetch(`${API_BASE_URL}/import/extrato`, { method: 'POST', headers: { 'Authorization': `Bearer ${localStorage.getItem('authToken')}` }, body: formData })
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
              {extratoStep === 3 && (() => {
                const selectedIds = extratoPreview.filter(t => (t as any)._selected).map(t => t._id)
                const allSelected = extratoPreview.length > 0 && selectedIds.length === extratoPreview.length
                const someSelected = selectedIds.length > 0 && !allSelected
                const toggleAll = () => setExtratoPreview(prev => prev.map(t => ({ ...t, _selected: !allSelected })))
                const toggleOne = (id: string) => setExtratoPreview(prev => prev.map(t => t._id === id ? { ...t, _selected: !(t as any)._selected } : t))
                const deleteSelected = () => setExtratoPreview(prev => prev.filter(t => !(t as any)._selected))
                const totalReceita = extratoPreview.filter(t => t.type === 'Receita').reduce((s, t) => s + t.value, 0)
                const totalDespesa = extratoPreview.filter(t => t.type === 'Despesa').reduce((s, t) => s + t.value, 0)
                const saldo = totalReceita - totalDespesa
                return (
                  <div className="mt-2 space-y-4">
                    <div className="grid grid-cols-3 gap-3">
                      <div className="bg-green-50 rounded-xl p-3 text-center"><p className="text-xs text-green-600 font-medium">Receitas</p><p className="text-sm font-bold text-green-700">R$ {totalReceita.toFixed(2).replace('.', ',')}</p></div>
                      <div className="bg-red-50 rounded-xl p-3 text-center"><p className="text-xs text-red-600 font-medium">Despesas</p><p className="text-sm font-bold text-red-700">R$ {totalDespesa.toFixed(2).replace('.', ',')}</p></div>
                      <div className={`rounded-xl p-3 text-center ${saldo >= 0 ? 'bg-blue-50' : 'bg-orange-50'}`}>
                        <p className={`text-xs font-medium ${saldo >= 0 ? 'text-blue-600' : 'text-orange-600'}`}>Saldo</p>
                        <p className={`text-sm font-bold ${saldo >= 0 ? 'text-blue-700' : 'text-orange-700'}`}>{saldo < 0 ? '-' : ''}R$ {Math.abs(saldo).toFixed(2).replace('.', ',')}</p>
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
                            const isSelected = !!(tx as any)._selected
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
                      <button type="button" onClick={() => { setExtratoStep(2); setExtratoPreview([]) }} className="flex-1 px-4 py-3 bg-gray-100 text-gray-700 font-semibold rounded-xl hover:bg-gray-200 transition-all flex items-center justify-center gap-2">
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
                              headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem('authToken')}` },
                              body: JSON.stringify({ transactions: extratoPreview.map(({ _id: _r, ...t }) => { const { _selected: _s, ...rest } = t as any; return rest }) })
                            })
                            if (response.ok) {
                              const result = await response.json()
                              const savedIds: string[] = (result.data ?? []).map((t: { id: string }) => t.id)
                              if (result.data?.length) setTransactions(prev => [...result.data, ...prev])
                              setIsImportExtratoModalOpen(false); setImportType(null); setSelectedBank(null); setExtratoStep(0); setExtratoFile(null); setExtratoPassword(''); setExtratoPreview([])
                              setLastImportBatch(savedIds); setUndoCountdown(15); setShowUndoToast(true)
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
        </div>
      )}

      {/* Toast de Desfazer Importação */}
      {showUndoToast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[100] animate-in slide-in-from-bottom-4 duration-300">
          <div className="flex items-center gap-3 bg-gray-900 text-white rounded-2xl shadow-2xl px-5 py-4 min-w-[320px] border border-gray-700">
            <div className="relative flex-shrink-0">
              <svg className="w-9 h-9 -rotate-90" viewBox="0 0 36 36">
                <circle cx="18" cy="18" r="15" fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="3" />
                <circle cx="18" cy="18" r="15" fill="none" stroke="#4ade80" strokeWidth="3" strokeDasharray={`${(undoCountdown / 15) * 94.2} 94.2`} strokeLinecap="round" />
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
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem('authToken')}` },
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


