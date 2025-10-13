import React, { useEffect, useMemo, useRef, useState } from 'react'
import { DollarSign, Plus, Download, Upload, Edit, Trash2, Calendar, Filter, X } from 'lucide-react'

type TransactionType = 'Receita' | 'Despesa'

interface Transaction {
  id: string
  date: string
  description: string
  value: number
  type: TransactionType
  category: string
}

const API_BASE_URL = '/api'

const Transactions: React.FC = () => {
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [selectedTransactions, setSelectedTransactions] = useState<Set<string>>(new Set())
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editing, setEditing] = useState<Transaction | null>(null)
  const [form, setForm] = useState<{date: string; description: string; value: string; type: TransactionType; category: string}>({
    date: new Date().toISOString().split('T')[0], description: '', value: '', type: 'Receita', category: ''
  })
  const [isImportExportOpen, setIsImportExportOpen] = useState(false)
  const [importType, setImportType] = useState<'transactions'>('transactions')
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  // filtros / ordenação
  const [sortConfig, setSortConfig] = useState<{ field: keyof Transaction | null, direction: 'asc' | 'desc' }>({ field: null, direction: 'asc' })
  const [filters, setFilters] = useState<{ type: '' | TransactionType, category: string, dateFrom: string, dateTo: string }>({ type: '', category: '', dateFrom: '', dateTo: '' })

  // calendários de filtro
  const [isFilterCalendarFromOpen, setIsFilterCalendarFromOpen] = useState(false)
  const [isFilterCalendarToOpen, setIsFilterCalendarToOpen] = useState(false)

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
    if (filters.type) list = list.filter(t => t.type === filters.type)
    if (filters.category) list = list.filter(t => t.category.toLowerCase().includes(filters.category.toLowerCase()))
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

  const clearFilters = () => setFilters({ type: '', category: '', dateFrom: '', dateTo: '' })

  const renderFilterCalendarFrom = () => null
  const renderFilterCalendarTo = () => null

  // CRUD
  const saveTransaction = async () => {
    if (!form.description || !form.value || !form.type || !form.category || !form.date) return
    const payload = {
      id: editing?.id,
      date: form.date,
      description: form.description,
      value: parseFloat(form.value),
      type: form.type,
      category: form.category
    }
    try {
      if (editing) {
        const r = await fetch(`${API_BASE_URL}/transactions/${editing.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
        const j = await r.json(); if (j.success) setTransactions(prev => prev.map(t => t.id === editing.id ? j.data : t))
      } else {
        const r = await fetch(`${API_BASE_URL}/transactions`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
        const j = await r.json(); if (j.success) setTransactions(prev => [j.data, ...prev])
      }
      setIsModalOpen(false); setEditing(null); setForm({ date: new Date().toISOString().split('T')[0], description: '', value: '', type: 'Receita', category: '' })
    } catch {}
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
          <button
            onClick={() => setIsImportExportOpen(true)}
            className="flex items-center gap-3 px-6 py-3 bg-gradient-to-r from-blue-500 to-indigo-600 text-white font-semibold rounded-xl hover:from-blue-600 hover:to-indigo-700 shadow-lg hover:shadow-xl transform hover:-translate-y-1 transition-all duration-300"
          >
            <Download className="h-5 w-5" />
            Importar/Exportar
          </button>
          <button
            onClick={() => { setEditing(null); setForm({ date: new Date().toISOString().split('T')[0], description: '', value: '', type: 'Receita', category: '' }); setIsModalOpen(true) }}
            className="flex items-center gap-3 px-6 py-3 bg-gradient-to-r from-blue-500 to-indigo-600 text-white font-semibold rounded-xl hover:from-blue-600 hover:to-indigo-700 shadow-lg hover:shadow-xl transform hover:-translate-y-1 transition-all duration-300"
          >
            <Plus className="h-5 w-5" />
            Nova Transação
          </button>
        </div>
      </div>

      {/* Filtros */}
      <div className="bg-gradient-to-r from-blue-50 to-indigo-50 p-4 rounded-lg border border-blue-200 shadow-sm">
        <div className="flex flex-col lg:flex-row lg:items-center gap-4 lg:gap-6">
          <div className="flex items-center gap-2">
            <Filter className="w-5 h-5 text-blue-600" />
            <h2 className="text-lg font-bold text-gray-800 uppercase tracking-wide">Filtre seus itens:</h2>
          </div>
          <div className="flex items-end gap-1 sm:gap-2 md:gap-3 lg:gap-4 flex-1">
            <div className="flex flex-col flex-1 min-w-0">
              <label className="text-xs sm:text-sm font-semibold text-gray-700 mb-1 truncate">Tipo</label>
              <select
                value={filters.type}
                onChange={(e) => setFilters(prev => ({ ...prev, type: e.target.value as any }))}
                className="px-1 sm:px-2 md:px-3 py-1 sm:py-2 border border-blue-300 rounded-md text-xs sm:text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white w-full"
              >
                <option value="">Todos os tipos</option>
                <option value="Receita">Receitas</option>
                <option value="Despesa">Despesas</option>
              </select>
            </div>
            <div className="flex flex-col flex-1 min-w-0">
              <label className="text-xs sm:text-sm font-semibold text-gray-700 mb-1 truncate">Categoria</label>
              <input
                type="text"
                placeholder="Categoria..."
                value={filters.category}
                onChange={(e) => setFilters(prev => ({ ...prev, category: e.target.value }))}
                className="px-1 sm:px-2 md:px-3 py-1 sm:py-2 border border-blue-300 rounded-md text-xs sm:text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white w-full"
              />
            </div>
            <div className="flex flex-col flex-1 min-w-0">
              <label className="text-xs sm:text-sm font-semibold text-gray-700 mb-1 truncate">Data Início</label>
              <div className="relative">
                <input
                  type="date"
                  value={filters.dateFrom}
                  onChange={(e) => setFilters(prev => ({ ...prev, dateFrom: e.target.value }))}
                  className="px-1 sm:px-2 md:px-3 py-1 sm:py-2 border border-blue-300 rounded-md text-xs sm:text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white w-full"
                />
                <Calendar className="absolute right-1 sm:right-2 md:right-3 top-1/2 -translate-y-1/2 w-3 h-3 sm:w-4 sm:h-4 text-blue-600 pointer-events-none" />
              </div>
            </div>
            <div className="flex flex-col flex-1 min-w-0">
              <label className="text-xs sm:text-sm font-semibold text-gray-700 mb-1 truncate">Data Fim</label>
              <div className="relative">
                <input
                  type="date"
                  value={filters.dateTo}
                  onChange={(e) => setFilters(prev => ({ ...prev, dateTo: e.target.value }))}
                  className="px-1 sm:px-2 md:px-3 py-1 sm:py-2 border border-blue-300 rounded-md text-xs sm:text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white w-full"
                />
                <Calendar className="absolute right-1 sm:right-2 md:right-3 top-1/2 -translate-y-1/2 w-3 h-3 sm:w-4 sm:h-4 text-blue-600 pointer-events-none" />
              </div>
            </div>
          </div>
          <div className="lg:ml-auto">
            <button onClick={clearFilters} className="px-2 sm:px-3 md:px-4 py-1 sm:py-2 bg-blue-600 text-white rounded-md text-xs sm:text-sm hover:bg-blue-700 transition-colors w-full lg:w-auto">
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
          <div className="bg-white rounded-2xl shadow-lg border border-gray-200 overflow-hidden">
            <div className="bg-gradient-to-r from-blue-50 to-indigo-100 border-b border-blue-200 p-4">
              <div className="flex items-center gap-0.5 sm:gap-1 md:gap-2 lg:gap-3">
                <div className="flex justify-center">
                  <input
                    type="checkbox"
                    checked={transactions.length > 0 && selectedTransactions.size === transactions.length}
                    onChange={handleSelectAll}
                    className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 focus:ring-2"
                  />
                </div>
                <button onClick={() => handleSort('date')} className="flex items-center justify-center gap-1 hover:bg-blue-100 rounded px-1 sm:px-2 py-1 transition-colors flex-shrink-0 w-20 sm:w-24">
                  <p className="text-xs sm:text-sm font-bold text-blue-800 uppercase tracking-wide truncate">Data</p>
                  {getSortIcon('date')}
                </button>
                <button onClick={() => handleSort('description')} className="flex items-center justify-center gap-1 hover:bg-blue-100 rounded px-1 sm:px-2 py-1 transition-colors flex-1 min-w-0">
                  <p className="text-xs sm:text-sm font-bold text-blue-800 uppercase tracking-wide truncate">Descrição</p>
                  {getSortIcon('description')}
                </button>
                <button onClick={() => handleSort('type')} className="flex items-center justify-center gap-1 hover:bg-blue-100 rounded px-1 sm:px-2 py-1 transition-colors flex-shrink-0 w-16 sm:w-20">
                  <p className="text-xs sm:text-sm font-bold text-blue-800 uppercase tracking-wide">Tipo</p>
                  {getSortIcon('type')}
                </button>
                <button onClick={() => handleSort('category')} className="flex items-center justify-center gap-1 hover:bg-blue-100 rounded px-1 sm:px-2 py-1 transition-colors flex-shrink-0 w-20 sm:w-24">
                  <p className="text-xs sm:text-sm font-bold text-blue-800 uppercase tracking-wide truncate">Categoria</p>
                  {getSortIcon('category')}
                </button>
                <button onClick={() => handleSort('value')} className="flex items-center justify-center gap-1 hover:bg-blue-100 rounded px-1 sm:px-2 py-1 transition-colors flex-shrink-0 w-20 sm:w-24">
                  <p className="text-xs sm:text-sm font-bold text-blue-800 uppercase tracking-wide">Valor</p>
                  {getSortIcon('value')}
                </button>
                <div className="flex-shrink-0 w-16 sm:w-20 flex justify-center">
                  <p className="text-xs sm:text-sm font-bold text-blue-800 uppercase tracking-wide">Ações</p>
                </div>
              </div>
            </div>

            {filteredAndSorted.map((t, index) => (
              <div key={t.id} className={`bg-white border-b border-gray-100 p-4 hover:bg-blue-50/30 transition-all duration-200 ${index === transactions.length - 1 ? 'border-b-0' : ''}`}>
                <div className="flex items-center gap-0.5 sm:gap-1 md:gap-2 lg:gap-3">
                  <div className="flex-shrink-0 text-left">
                    <input
                      type="checkbox"
                      checked={selectedTransactions.has(t.id)}
                      onChange={() => handleSelect(t.id)}
                      className="w-3 h-3 sm:w-4 sm:h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 focus:ring-2"
                    />
                  </div>
                  <div className="flex-shrink-0 w-20 sm:w-24 text-left">
                    <p className="text-xs sm:text-sm font-medium text-gray-900 truncate">{new Date(t.date).toLocaleDateString('pt-BR')}</p>
                  </div>
                  <div className="flex-1 min-w-0 text-left">
                    <h3 className="text-xs sm:text-sm font-semibold text-gray-900 truncate">{t.description}</h3>
                  </div>
                  <div className="flex-shrink-0 w-16 sm:w-20 text-center">
                    <span className={`px-0.5 sm:px-1 py-0.5 rounded-full text-xs font-medium ${t.type === 'Receita' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>{t.type}</span>
                  </div>
                  <div className="flex-shrink-0 w-20 sm:w-24 text-center">
                    <span className="text-xs sm:text-sm text-gray-600 bg-gray-50 px-0.5 sm:px-1 py-0.5 rounded-md truncate">{t.category}</span>
                  </div>
                  <div className="flex-shrink-0 w-20 sm:w-24 text-center">
                    <p className={`text-xs sm:text-xs md:text-base font-bold ${t.type === 'Receita' ? 'text-green-600' : 'text-red-600'} truncate`}>
                      {t.type === 'Receita' ? '+' : '-'}R$ {t.value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </p>
                  </div>
                  <div className="flex-shrink-0 w-16 sm:w-20 flex gap-0.5 sm:gap-1 justify-center">
                    <button onClick={() => { setEditing(t); setForm({ date: t.date, description: t.description, value: String(t.value), type: t.type, category: t.category }); setIsModalOpen(true) }} className="p-0.5 sm:p-1 text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded-full transition-all duration-200" title="Editar transação">
                      <Edit className="w-2.5 h-2.5 sm:w-3 sm:h-3" />
                    </button>
                    <button onClick={() => deleteOne(t.id)} className="p-0.5 sm:p-1 text-red-600 hover:text-red-800 hover:bg-red-50 rounded-full transition-all duration-200" title="Excluir transação">
                      <Trash2 className="w-2.5 h-2.5 sm:w-3 sm:h-3" />
                    </button>
                  </div>
                </div>
              </div>
            ))}

            {selectedTransactions.size > 0 && (
              <div className="flex justify-end p-4 bg-red-50 border-t border-red-200">
                <button onClick={deleteSelected} className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white font-semibold rounded-lg hover:bg-red-700 transition-all duration-200 shadow-lg hover:shadow-xl">
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
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={(e) => { if (e.target === e.currentTarget) { setIsModalOpen(false); setEditing(null) } }}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl border border-gray-200">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-gray-800">{editing ? 'Editar Transação' : 'Nova Transação'}</h2>
              <button onClick={() => { setIsModalOpen(false); setEditing(null) }} className="text-gray-500 hover:text-gray-700"><X className="w-5 h-5" /></button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Data</label>
                <input type="date" value={form.date} onChange={(e) => setForm(prev => ({ ...prev, date: e.target.value }))} className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Descrição</label>
                <input type="text" value={form.description} onChange={(e) => setForm(prev => ({ ...prev, description: e.target.value }))} className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Valor (R$)</label>
                  <input type="number" step="0.01" value={form.value} onChange={(e) => setForm(prev => ({ ...prev, value: e.target.value }))} className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Tipo</label>
                  <select value={form.type} onChange={(e) => setForm(prev => ({ ...prev, type: e.target.value as TransactionType }))} className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500">
                    <option value="Receita">Receita</option>
                    <option value="Despesa">Despesa</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Categoria</label>
                <input type="text" value={form.category} onChange={(e) => setForm(prev => ({ ...prev, category: e.target.value }))} className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <button onClick={() => { setIsModalOpen(false); setEditing(null) }} className="px-4 py-2 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700">Cancelar</button>
              <button onClick={saveTransaction} className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold">Salvar</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Importar/Exportar (estrutura Alya com visual IMPGEO) */}
      {isImportExportOpen && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={(e) => { if (e.target === e.currentTarget) setIsImportExportOpen(false) }}>
          <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl border border-gray-200 overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-3 bg-gradient-to-b from-blue-50 to-white border-b">
              <div className="flex items-center gap-3">
                <Upload className="w-5 h-5 text-blue-700" />
                <h2 className="text-xl font-extrabold text-gray-800">Importar/Exportar Transações</h2>
              </div>
              <button onClick={() => setIsImportExportOpen(false)} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
            </div>

            {/* Body */}
            <div className="px-5 py-5">
              <p className="text-center text-sm text-gray-700 mb-5">Escolha uma das opções abaixo para gerenciar seus dados:</p>

              {/* Dica / Info box */}
              <div className="rounded-xl border border-blue-200 bg-blue-50 p-5 mb-6 text-center">
                <p className="font-bold text-blue-800 mb-1">Primeiro baixe o modelo, depois importe!</p>
                <p className="text-blue-700 text-sm">Baixe o arquivo modelo, preencha com seus dados e depois faça o upload.</p>
                <button onClick={downloadModel} className="mt-4 inline-flex items-center justify-center gap-2 px-5 py-3 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold shadow mx-auto">
                  <Download className="w-4 h-4" /> Baixar Modelo de Transações
                </button>
              </div>

              {/* Importar */}
              <div className="space-y-3">
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

                {/* Exportar */}
                <button onClick={handleExport} className="w-full rounded-2xl bg-gradient-to-r from-blue-500 to-indigo-600 text-white px-3 py-3 text-center shadow hover:shadow-md transition-shadow">
                  <div className="flex items-center justify-center gap-2">
                    <Download className="w-4 h-4 opacity-90" />
                    <div className="text-center">
                      <p className="text-lg font-bold leading-tight">Exportar</p>
                      <p className="text-white/90 text-xs">Salvar dados em arquivo</p>
                    </div>
                  </div>
                </button>
              </div>

              {/* Footer */}
              <div className="mt-6">
                <button onClick={() => setIsImportExportOpen(false)} className="w-full px-6 py-4 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-800 font-semibold">
                  Cancelar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default Transactions


