import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Users, Plus, Download, Upload, Edit, Trash2, Filter, X } from 'lucide-react'
import { usePermissions } from '../hooks/usePermissions'

interface Client {
  id: string
  name: string
  email: string
  phone: string
  address: string
  cpf?: string
  cnpj?: string
  createdAt?: string
  updatedAt?: string
}

const API_BASE_URL = '/api'

const Clients: React.FC = () => {
  const permissions = usePermissions();
  const [clients, setClients] = useState<Client[]>([])
  const [selectedClients, setSelectedClients] = useState<Set<string>>(new Set())
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editing, setEditing] = useState<Client | null>(null)
  const [form, setForm] = useState<{
    name: string
    email: string
    phone: string
    address: string
    documentType: 'cpf' | 'cnpj'
    cpf: string
    cnpj: string
  }>({
    name: '', email: '', phone: '', address: '', documentType: 'cpf', cpf: '', cnpj: ''
  })
  const [formErrors, setFormErrors] = useState<{[key: string]: string}>({})
  const [isImportExportOpen, setIsImportExportOpen] = useState(false)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  // filtros / ordenação
  const [sortConfig, setSortConfig] = useState<{ field: keyof Client | null, direction: 'asc' | 'desc' }>({ field: null, direction: 'asc' })
  const [filters, setFilters] = useState<{ name: string, email: string, phone: string }>({ name: '', email: '', phone: '' })

  useEffect(() => {
    const load = async () => {
      try {
        const r = await fetch(`${API_BASE_URL}/clients`)
        const j = await r.json()
        if (j.success) setClients(j.data)
      } catch {}
    }
    load()
  }, [])

  // Controla overlay global (classe no body) ao abrir/fechar modais
  useEffect(() => {
    const body = document?.body
    if (!body) return
    if (isImportExportOpen || isModalOpen) body.classList.add('modal-open')
    else body.classList.remove('modal-open')
    return () => { body.classList.remove('modal-open') }
  }, [isImportExportOpen, isModalOpen])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return

      if (isImportExportOpen) {
        setIsImportExportOpen(false)
        return
      }

      if (isModalOpen) {
        setIsModalOpen(false)
        setEditing(null)
        setFormErrors({})
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [isImportExportOpen, isModalOpen])

  const handleSort = (field: keyof Client) => {
    let direction: 'asc' | 'desc' = 'asc'
    if (sortConfig.field === field && sortConfig.direction === 'asc') direction = 'desc'
    setSortConfig({ field, direction })
  }

  const getSortIcon = (field: keyof Client) => {
    if (sortConfig.field !== field) return <span className="text-white/50">↕</span>
    return sortConfig.direction === 'asc' ? <span className="text-white">↑</span> : <span className="text-white">↓</span>
  }

  const filteredAndSorted = useMemo(() => {
    let list = [...clients]
    if (filters.name) list = list.filter(c => c.name.toLowerCase().includes(filters.name.toLowerCase()))
    if (filters.email) list = list.filter(c => c.email.toLowerCase().includes(filters.email.toLowerCase()))
    if (filters.phone) list = list.filter(c => c.phone.includes(filters.phone))

    if (sortConfig.field) {
      list.sort((a, b) => {
        let av: any = a[sortConfig.field!]
        let bv: any = b[sortConfig.field!]
        if (typeof av === 'string') { av = av.toLowerCase(); bv = String(bv).toLowerCase() }
        if (av < bv) return sortConfig.direction === 'asc' ? -1 : 1
        if (av > bv) return sortConfig.direction === 'asc' ? 1 : -1
        return 0
      })
    }
    return list
  }, [clients, filters, sortConfig])

  const handleSelectAll = () => {
    if (selectedClients.size === clients.length) setSelectedClients(new Set())
    else setSelectedClients(new Set(clients.map(c => c.id)))
  }

  const handleSelect = (id: string) => {
    setSelectedClients(prev => {
      const s = new Set(prev)
      if (s.has(id)) s.delete(id); else s.add(id)
      return s
    })
  }

  const clearFilters = () => setFilters({ name: '', email: '', phone: '' })

  // CRUD
  const validateForm = () => {
    const errors: {[key: string]: string} = {}
    
    if (!form.name.trim()) errors.name = 'Campo obrigatório'
    if (!form.email.trim()) errors.email = 'Campo obrigatório'
    if (!form.phone.trim()) errors.phone = 'Campo obrigatório'
    if (!form.address.trim()) errors.address = 'Campo obrigatório'
    
    // Validar CPF ou CNPJ baseado no tipo selecionado
    if (form.documentType === 'cpf' && !form.cpf.trim()) {
      errors.cpf = 'Campo obrigatório'
    } else if (form.documentType === 'cnpj' && !form.cnpj.trim()) {
      errors.cnpj = 'Campo obrigatório'
    }
    
    setFormErrors(errors)
    return Object.keys(errors).length === 0
  }

  const saveClient = async () => {
    if (!validateForm()) return
    
    const payload = {
      id: editing?.id,
      name: form.name,
      email: form.email,
      phone: form.phone,
      address: form.address,
      cpf: form.cpf || undefined,
      cnpj: form.cnpj || undefined
    }
    try {
      if (editing) {
        const r = await fetch(`${API_BASE_URL}/clients/${editing.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
        const j = await r.json(); if (j.success) setClients(prev => prev.map(c => c.id === editing.id ? j.data : c))
      } else {
        const r = await fetch(`${API_BASE_URL}/clients`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
        const j = await r.json(); if (j.success) setClients(prev => [j.data, ...prev])
      }
      setIsModalOpen(false); setEditing(null); setForm({ name: '', email: '', phone: '', address: '', documentType: 'cpf', cpf: '', cnpj: '' }); setFormErrors({})
    } catch (error) {
      console.error('Erro ao salvar:', error)
    }
  }

  const deleteOne = async (id: string) => {
    try {
      const r = await fetch(`${API_BASE_URL}/clients/${id}`, { method: 'DELETE' })
      const j = await r.json(); if (j.success) setClients(prev => prev.filter(c => c.id !== id))
    } catch {}
  }

  const deleteSelected = async () => {
    try {
      const ids = Array.from(selectedClients)
      await fetch(`${API_BASE_URL}/clients`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids }) })
      setClients(prev => prev.filter(c => !selectedClients.has(c.id)))
      setSelectedClients(new Set())
    } catch {}
  }

  // Import/Export
  const downloadModel = () => {
    window.open(`${API_BASE_URL}/modelo/clients`, '_blank')
  }

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const formData = new FormData()
    formData.append('file', file)
    formData.append('type', 'clients')
    try {
      const r = await fetch(`${API_BASE_URL}/import`, { method: 'POST', body: formData })
      const j = await r.json()
      if (j.success) {
        setClients(prev => [...j.data, ...prev])
        setIsImportExportOpen(false)
      }
    } catch {}
  }

  const handleExport = async () => {
    try {
      const r = await fetch(`${API_BASE_URL}/export`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'clients', data: clients }) })
      const blob = await r.blob(); const url = URL.createObjectURL(blob)
      const a = document.createElement('a'); a.href = url; a.download = `clients_${new Date().toISOString().split('T')[0]}.xlsx`; a.click(); URL.revokeObjectURL(url)
    } catch {}
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <h1 className="text-3xl font-bold flex items-center gap-3">
          <Users className="w-8 h-8 text-blue-600" />
          Clientes
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
          {permissions.canCreate && (
            <button
              onClick={() => { setEditing(null); setForm({ name: '', email: '', phone: '', address: '', documentType: 'cpf', cpf: '', cnpj: '' }); setFormErrors({}); setIsModalOpen(true) }}
              className="flex items-center gap-3 px-6 py-3 bg-gradient-to-r from-blue-500 to-indigo-600 text-white font-semibold rounded-xl hover:from-blue-600 hover:to-indigo-700 shadow-lg hover:shadow-xl transform hover:-translate-y-1 transition-all duration-300"
            >
              <Plus className="h-5 w-5" />
              Novo Cliente
            </button>
          )}
        </div>
      </div>

      {/* Filtros */}
      <div className="bg-gradient-to-r from-blue-50/80 to-indigo-50/60 dark:from-blue-900/20 dark:to-indigo-900/10 p-5 rounded-2xl border border-blue-100 dark:border-blue-800/30 shadow-sm">
        <div className="flex flex-col lg:flex-row lg:items-center gap-4 lg:gap-6">
          <div className="flex items-center gap-2">
            <Filter className="w-5 h-5 text-blue-600" />
            <h2 className="text-sm font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wide">Filtros</h2>
          </div>
          <div className="flex items-end gap-1 sm:gap-2 md:gap-3 lg:gap-4 flex-1">
            <div className="flex flex-col flex-1 min-w-0">
              <label htmlFor="client-name-filter" className="text-xs sm:text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1 truncate">Nome</label>
              <input
                id="client-name-filter"
                name="client-name-filter"
                aria-label="Filtrar por nome"
                type="text"
                placeholder="Nome..."
                value={filters.name}
                onChange={(e) => setFilters(prev => ({ ...prev, name: e.target.value }))}
                className="px-1 sm:px-2 md:px-3 py-1 sm:py-2 border border-blue-200 dark:border-blue-700 rounded-xl text-xs sm:text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white dark:!bg-[#243040] dark:text-gray-200 w-full transition-all duration-200"
              />
            </div>
            <div className="flex flex-col flex-1 min-w-0">
              <label htmlFor="client-email-filter" className="text-xs sm:text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1 truncate">Email</label>
              <input
                id="client-email-filter"
                name="client-email-filter"
                aria-label="Filtrar por email"
                type="text"
                placeholder="Email..."
                value={filters.email}
                onChange={(e) => setFilters(prev => ({ ...prev, email: e.target.value }))}
                className="px-1 sm:px-2 md:px-3 py-1 sm:py-2 border border-blue-200 dark:border-blue-700 rounded-xl text-xs sm:text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white dark:!bg-[#243040] dark:text-gray-200 w-full transition-all duration-200"
              />
            </div>
            <div className="flex flex-col flex-1 min-w-0">
              <label htmlFor="client-phone-filter" className="text-xs sm:text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1 truncate">Telefone</label>
              <input
                id="client-phone-filter"
                name="client-phone-filter"
                aria-label="Filtrar por telefone"
                type="text"
                placeholder="Telefone..."
                value={filters.phone}
                onChange={(e) => setFilters(prev => ({ ...prev, phone: e.target.value }))}
                className="px-1 sm:px-2 md:px-3 py-1 sm:py-2 border border-blue-200 dark:border-blue-700 rounded-xl text-xs sm:text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white dark:!bg-[#243040] dark:text-gray-200 w-full transition-all duration-200"
              />
            </div>
          </div>
          <div className="lg:ml-auto">
            <button onClick={clearFilters} className="px-3 sm:px-4 py-1.5 sm:py-2 bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 text-white rounded-xl text-xs sm:text-sm font-semibold shadow-lg shadow-blue-500/25 hover:shadow-xl hover:shadow-blue-500/35 hover:-translate-y-0.5 transition-all duration-200 w-full lg:w-auto">
              Limpar Filtros
            </button>
          </div>
        </div>
      </div>

      {/* Lista */}
      <div className="space-y-4">
        {clients.length === 0 ? (
          <div className="bg-white rounded-2xl shadow-lg border border-gray-200 p-8 text-center">
            <p className="text-gray-600">Nenhum cliente encontrado.</p>
            <p className="text-gray-500 text-sm mt-2">Adicione seu primeiro cliente clicando no botão "Novo Cliente".</p>
          </div>
        ) : (
          <div className="bg-white dark:!bg-[#243040] rounded-2xl shadow-lg border border-gray-200 dark:border-gray-700 overflow-hidden overflow-x-auto">
            <div className="bg-gradient-to-r from-blue-500 to-indigo-600 p-4 min-w-max">
              <div className="flex items-center gap-0.5 sm:gap-1 md:gap-2 lg:gap-3 min-w-[800px]">
                {permissions.canDelete && (
                  <div className="flex justify-center">
                    <input
                      type="checkbox"
                      checked={clients.length > 0 && selectedClients.size === clients.length}
                      onChange={handleSelectAll}
                      className="w-4 h-4 text-blue-600 bg-white/20 border-white/40 rounded focus:ring-blue-300 focus:ring-2"
                    />
                  </div>
                )}
                <button onClick={() => handleSort('name')} className="flex items-center justify-center gap-1 hover:bg-white/20 rounded-lg px-1 sm:px-2 py-1 transition-all duration-200 flex-shrink-0 w-52 sm:w-60">
                  <p className="text-xs sm:text-sm font-bold text-white uppercase tracking-wide truncate">Nome</p>
                  {getSortIcon('name')}
                </button>
                <button onClick={() => handleSort('email')} className="flex items-center justify-center gap-1 hover:bg-white/20 rounded-lg px-1 sm:px-2 py-1 transition-all duration-200 flex-shrink-0 w-36 sm:w-44">
                  <p className="text-xs sm:text-sm font-bold text-white uppercase tracking-wide truncate">Email</p>
                  {getSortIcon('email')}
                </button>
                <button onClick={() => handleSort('phone')} className="flex items-center justify-center gap-1 hover:bg-white/20 rounded-lg px-1 sm:px-2 py-1 transition-all duration-200 flex-shrink-0 w-28 sm:w-32">
                  <p className="text-xs sm:text-sm font-bold text-white uppercase tracking-wide truncate">Telefone</p>
                  {getSortIcon('phone')}
                </button>
                <button onClick={() => handleSort('address')} className="flex items-center justify-center gap-1 hover:bg-white/20 rounded-lg px-1 sm:px-2 py-1 transition-all duration-200 flex-1 min-w-0">
                  <p className="text-xs sm:text-sm font-bold text-white uppercase tracking-wide truncate">Endereço</p>
                  {getSortIcon('address')}
                </button>
                <div className="flex-shrink-0 w-16 sm:w-20 flex justify-center">
                  <p className="text-xs sm:text-sm font-bold text-white uppercase tracking-wide">Ações</p>
                </div>
              </div>
            </div>

            {filteredAndSorted.map((c, index) => (
              <div key={c.id} className={`${index % 2 === 0 ? 'imp-row-even' : 'imp-row-odd'} border-b border-gray-100 dark:border-gray-700 p-4 transition-all duration-200 ${index === clients.length - 1 ? 'border-b-0' : ''}`}>
                <div className="flex items-center gap-0.5 sm:gap-1 md:gap-2 lg:gap-3 min-w-[800px]">
                  {permissions.canDelete && (
                    <div className="flex-shrink-0 text-left">
                      <input
                        type="checkbox"
                        checked={selectedClients.has(c.id)}
                        onChange={() => handleSelect(c.id)}
                        className="w-3 h-3 sm:w-4 sm:h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 focus:ring-2"
                      />
                    </div>
                  )}
                  <div className="flex-shrink-0 w-52 sm:w-60 text-left">
                    <h3 className="text-xs sm:text-sm font-semibold text-gray-900 truncate">{c.name}</h3>
                    {(c.cpf || c.cnpj) && (
                      <p className="text-xs text-gray-500 truncate">{c.cpf || c.cnpj}</p>
                    )}
                  </div>
                  <div className="flex-shrink-0 w-36 sm:w-44 text-center">
                    <p className="text-xs sm:text-sm text-gray-600 truncate">{c.email}</p>
                  </div>
                  <div className="flex-shrink-0 w-28 sm:w-32 text-center">
                    <p className="text-xs sm:text-sm text-gray-600 truncate">{c.phone}</p>
                  </div>
                  <div className="flex-1 min-w-0 text-left">
                    <p className="text-xs sm:text-sm text-gray-600 truncate">{c.address}</p>
                  </div>
                  <div className="flex-shrink-0 w-16 sm:w-20 flex gap-0.5 sm:gap-1 justify-center">
                    {permissions.canEdit && (
                      <button onClick={() => { setEditing(c); setForm({ name: c.name, email: c.email, phone: c.phone, address: c.address, documentType: c.cpf ? 'cpf' : 'cnpj', cpf: c.cpf || '', cnpj: c.cnpj || '' }); setIsModalOpen(true) }} className="p-0.5 sm:p-1 text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded-full transition-all duration-200" title="Editar cliente">
                        <Edit className="w-2.5 h-2.5 sm:w-3 sm:h-3" />
                      </button>
                    )}
                    {permissions.canDelete && (
                      <button onClick={() => deleteOne(c.id)} className="p-0.5 sm:p-1 text-red-600 hover:text-red-800 hover:bg-red-50 rounded-full transition-all duration-200" title="Excluir cliente">
                        <Trash2 className="w-2.5 h-2.5 sm:w-3 sm:h-3" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}

            {selectedClients.size > 0 && permissions.canDelete && (
              <div className="flex items-center justify-between p-4 bg-red-50 dark:bg-red-900/20 border-t border-red-200 dark:border-red-800/40">
                <span className="text-sm font-semibold text-red-700 dark:text-red-400">{selectedClients.size} selecionado{selectedClients.size > 1 ? 's' : ''}</span>
                <button onClick={deleteSelected} className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 text-white font-semibold rounded-xl shadow-lg shadow-red-500/25 hover:shadow-xl hover:shadow-red-500/35 hover:-translate-y-0.5 transition-all duration-200">
                  <Trash2 className="h-4 w-4" />
                  Deletar Selecionado{selectedClients.size > 1 ? 's' : ''}
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Modal Novo/Editar Cliente */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-gradient-to-br from-blue-900/50 to-indigo-900/50 backdrop-blur-sm flex items-center justify-center z-[10000] p-4" onClick={(e) => { if (e.target === e.currentTarget) { setIsModalOpen(false); setEditing(null); setFormErrors({}) } }}>
          <div className="bg-white dark:!bg-[#243040] rounded-2xl w-full max-w-md shadow-2xl overflow-hidden">
            <div className="bg-gradient-to-r from-blue-500 to-indigo-600 px-6 py-4 flex items-center justify-between">
              <h2 className="text-lg font-bold text-white flex items-center gap-2"><Users className="w-5 h-5" />{editing ? 'Editar Cliente' : 'Novo Cliente'}</h2>
              <button onClick={() => { setIsModalOpen(false); setEditing(null); setFormErrors({}) }} className="text-white/80 hover:text-white hover:bg-white/20 rounded-lg p-1.5 transition-all duration-200"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-6 space-y-3">
              <div className="relative">
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">
                  Nome <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm(prev => ({ ...prev, name: e.target.value }))}
                  className={`w-full px-3 py-2 border rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-gray-700 dark:text-gray-100 dark:border-gray-600 transition-all duration-200 ${
                    formErrors.name ? 'border-red-500 bg-red-50' : 'border-gray-300'
                  }`}
                />
                {formErrors.name && (
                  <div className="absolute top-full left-0 mt-1 bg-red-500 text-white text-xs px-2 py-1 rounded shadow-lg z-10">
                    {formErrors.name}
                    <div className="absolute -top-1 left-2 w-2 h-2 bg-red-500 transform rotate-45"></div>
                  </div>
                )}
              </div>
              <div className="relative">
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">
                  Email <span className="text-red-500">*</span>
                </label>
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm(prev => ({ ...prev, email: e.target.value }))}
                  className={`w-full px-3 py-2 border rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-gray-700 dark:text-gray-100 dark:border-gray-600 transition-all duration-200 ${
                    formErrors.email ? 'border-red-500 bg-red-50' : 'border-gray-300'
                  }`}
                />
                {formErrors.email && (
                  <div className="absolute top-full left-0 mt-1 bg-red-500 text-white text-xs px-2 py-1 rounded shadow-lg z-10">
                    {formErrors.email}
                    <div className="absolute -top-1 left-2 w-2 h-2 bg-red-500 transform rotate-45"></div>
                  </div>
                )}
              </div>
              <div className="relative">
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">
                  Telefone <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={form.phone}
                  onChange={(e) => setForm(prev => ({ ...prev, phone: e.target.value }))}
                  className={`w-full px-3 py-2 border rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-gray-700 dark:text-gray-100 dark:border-gray-600 transition-all duration-200 ${
                    formErrors.phone ? 'border-red-500 bg-red-50' : 'border-gray-300'
                  }`}
                />
                {formErrors.phone && (
                  <div className="absolute top-full left-0 mt-1 bg-red-500 text-white text-xs px-2 py-1 rounded shadow-lg z-10">
                    {formErrors.phone}
                    <div className="absolute -top-1 left-2 w-2 h-2 bg-red-500 transform rotate-45"></div>
                  </div>
                )}
              </div>
              <div className="relative">
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">
                  Endereço <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={form.address}
                  onChange={(e) => setForm(prev => ({ ...prev, address: e.target.value }))}
                  className={`w-full px-3 py-2 border rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-gray-700 dark:text-gray-100 dark:border-gray-600 transition-all duration-200 ${
                    formErrors.address ? 'border-red-500 bg-red-50' : 'border-gray-300'
                  }`}
                />
                {formErrors.address && (
                  <div className="absolute top-full left-0 mt-1 bg-red-500 text-white text-xs px-2 py-1 rounded shadow-lg z-10">
                    {formErrors.address}
                    <div className="absolute -top-1 left-2 w-2 h-2 bg-red-500 transform rotate-45"></div>
                  </div>
                )}
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">
                  Tipo de Documento <span className="text-red-500">*</span>
                </label>
                <select
                  value={form.documentType}
                  onChange={(e) => setForm(prev => ({
                    ...prev,
                    documentType: e.target.value as 'cpf' | 'cnpj',
                    cpf: '',
                    cnpj: ''
                  }))}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-gray-700 dark:text-gray-100 transition-all duration-200"
                >
                  <option value="cpf">CPF (Pessoa Física)</option>
                  <option value="cnpj">CNPJ (Pessoa Jurídica)</option>
                </select>
              </div>
              <div className="relative">
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">
                  {form.documentType === 'cpf' ? 'CPF' : 'CNPJ'} <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={form.documentType === 'cpf' ? form.cpf : form.cnpj}
                  onChange={(e) => setForm(prev => ({
                    ...prev,
                    [form.documentType]: e.target.value
                  }))}
                  placeholder={form.documentType === 'cpf' ? '000.000.000-00' : '00.000.000/0000-00'}
                  className={`w-full px-3 py-2 border rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-gray-700 dark:text-gray-100 dark:border-gray-600 transition-all duration-200 ${
                    (form.documentType === 'cpf' && formErrors.cpf) || (form.documentType === 'cnpj' && formErrors.cnpj) ? 'border-red-500 bg-red-50' : 'border-gray-300'
                  }`}
                />
                {((form.documentType === 'cpf' && formErrors.cpf) || (form.documentType === 'cnpj' && formErrors.cnpj)) && (
                  <div className="absolute top-full left-0 mt-1 bg-red-500 text-white text-xs px-2 py-1 rounded shadow-lg z-10">
                    {form.documentType === 'cpf' ? formErrors.cpf : formErrors.cnpj}
                    <div className="absolute -top-1 left-2 w-2 h-2 bg-red-500 transform rotate-45"></div>
                  </div>
                )}
              </div>
              <div className="mt-6 flex justify-end gap-3">
                <button onClick={() => { setIsModalOpen(false); setEditing(null); setFormErrors({}) }} className="px-4 py-2 rounded-xl bg-gray-100 dark:!bg-[#2d3f52] hover:bg-gray-200 dark:hover:!bg-[#354b60] text-gray-700 dark:text-gray-200 font-medium transition-all duration-200">Cancelar</button>
                <button onClick={saveClient} className="px-4 py-2 rounded-xl bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 text-white font-semibold shadow-lg shadow-blue-500/25 hover:shadow-xl hover:shadow-blue-500/35 hover:-translate-y-0.5 transition-all duration-200">Salvar</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal Importar/Exportar */}
      {isImportExportOpen && (
        <div className="fixed inset-0 z-[9999] bg-gradient-to-br from-blue-900/50 to-indigo-900/50 backdrop-blur-sm flex items-center justify-center p-4" onClick={(e) => { if (e.target === e.currentTarget) setIsImportExportOpen(false) }}>
          <div className="relative bg-white dark:!bg-[#243040] rounded-2xl w-full max-w-md shadow-2xl overflow-hidden">
            {/* Header */}
            <div className="bg-gradient-to-r from-blue-500 to-indigo-600 px-6 py-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-1.5 bg-white/20 rounded-lg"><Upload className="w-5 h-5 text-white" /></div>
                <h2 className="text-lg font-bold text-white">Importar/Exportar Clientes</h2>
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
                <button onClick={downloadModel} className="mt-4 inline-flex items-center justify-center gap-2 px-5 py-3 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold shadow mx-auto">
                  <Download className="w-4 h-4" /> Baixar Modelo de Clientes
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
                <button onClick={() => setIsImportExportOpen(false)} className="w-full px-6 py-4 rounded-xl bg-gray-100 dark:!bg-[#2d3f52] hover:bg-gray-200 dark:hover:!bg-[#354b60] text-gray-800 dark:text-gray-200 font-semibold">
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

export default Clients
