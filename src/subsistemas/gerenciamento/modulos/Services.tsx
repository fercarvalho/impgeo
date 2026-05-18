import React, { useCallback, useEffect, useRef, useState } from 'react'
import Modal from '@/components/Modal'
import { Target, Plus, Edit, Trash2, X, DollarSign, Clock, Tag } from 'lucide-react'
import { usePermissions } from '@/hooks/usePermissions'

interface Service {
  id: string
  name: string
  description: string
  category: string
  price: number
  duration: number
  status: 'ativo' | 'inativo'
}

const API_BASE_URL = '/api'

const EMPTY_FORM = {
  name: '', description: '', category: '', price: '', duration: '', status: 'ativo' as 'ativo' | 'inativo'
}

const Services: React.FC = () => {
  const permissions = usePermissions();
  const [services, setServices] = useState<Service[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editing, setEditing] = useState<Service | null>(null)
  const [form, setForm] = useState<{
    name: string
    description: string
    category: string
    price: string
    duration: string
    status: 'ativo' | 'inativo'
  }>(EMPTY_FORM)
  const [formErrors, setFormErrors] = useState<{[key: string]: string}>({})
  const mountedRef = useRef(true)
  const firstFieldRef = useRef<HTMLInputElement>(null)
  const modalRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    mountedRef.current = true
    return () => { mountedRef.current = false }
  }, [])

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      try {
        const r = await fetch(`${API_BASE_URL}/services`)
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        const j = await r.json()
        if (mountedRef.current && j.success) setServices(j.data)
      } catch (err) {
        if (mountedRef.current) setErrorMsg('Falha ao carregar serviços. Tente novamente.')
        console.error('Erro ao carregar serviços:', err)
      } finally {
        if (mountedRef.current) setLoading(false)
      }
    }
    load()
  }, [])

  // Controla overlay global (classe no body) ao abrir/fechar modais
  useEffect(() => {
    const body = document.body
    if (isModalOpen) body.classList.add('modal-open')
    else body.classList.remove('modal-open')
    return () => { body.classList.remove('modal-open') }
  }, [isModalOpen])

  // Move o foco para o primeiro campo do formulário ao abrir o modal
  useEffect(() => {
    if (isModalOpen) {
      setTimeout(() => { firstFieldRef.current?.focus() }, 50)
    }
  }, [isModalOpen])

  const closeModal = useCallback(() => {
    setIsModalOpen(false)
    setEditing(null)
    setForm(EMPTY_FORM)
    setFormErrors({})
  }, [])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!isModalOpen) return

      // ESC vem do <Modal>; aqui só preservamos o focus trap de Tab.

      // Focus trap: manter foco dentro do modal com Tab
      if (event.key === 'Tab' && modalRef.current) {
        const focusable = modalRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        )
        const first = focusable[0]
        const last = focusable[focusable.length - 1]
        if (event.shiftKey) {
          if (document.activeElement === first) {
            event.preventDefault()
            last?.focus()
          }
        } else {
          if (document.activeElement === last) {
            event.preventDefault()
            first?.focus()
          }
        }
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [isModalOpen, closeModal])

  const validateForm = () => {
    const errors: {[key: string]: string} = {}

    if (!form.name.trim()) errors.name = 'Campo obrigatório'
    if (!form.description.trim()) errors.description = 'Campo obrigatório'
    if (!form.category.trim()) errors.category = 'Campo obrigatório'

    if (!form.price.trim()) {
      errors.price = 'Campo obrigatório'
    } else {
      const priceVal = parseFloat(form.price)
      if (isNaN(priceVal)) errors.price = 'Valor inválido'
      else if (priceVal < 0) errors.price = 'Preço não pode ser negativo'
    }

    if (!form.duration.trim()) {
      errors.duration = 'Campo obrigatório'
    } else {
      const durVal = parseInt(form.duration, 10)
      if (isNaN(durVal)) errors.duration = 'Valor inválido'
      else if (durVal <= 0) errors.duration = 'Duração deve ser maior que zero'
    }

    setFormErrors(errors)
    return Object.keys(errors).length === 0
  }

  const saveService = async () => {
    if (!validateForm()) return
    setSaving(true)
    setErrorMsg(null)

    const payload = {
      name: form.name,
      description: form.description,
      category: form.category,
      price: parseFloat(form.price),
      duration: parseInt(form.duration, 10),
      status: form.status
    }

    try {
      if (editing) {
        // Capturar editingId antes do await para evitar stale closure
        const editingId = editing.id
        const r = await fetch(`${API_BASE_URL}/services/${editingId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        const j = await r.json()
        if (j.success && mountedRef.current) setServices(prev => prev.map(s => s.id === editingId ? j.data : s))
      } else {
        const r = await fetch(`${API_BASE_URL}/services`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        const j = await r.json()
        if (j.success && mountedRef.current) setServices(prev => [j.data, ...prev])
      }
      if (mountedRef.current) closeModal()
    } catch (error) {
      console.error('Erro ao salvar:', error)
      if (mountedRef.current) setErrorMsg('Erro ao salvar serviço. Tente novamente.')
    } finally {
      if (mountedRef.current) setSaving(false)
    }
  }

  const deleteService = async (id: string) => {
    if (!confirm('Tem certeza que deseja excluir este serviço?')) return
    setDeletingId(id)
    setErrorMsg(null)
    try {
      const r = await fetch(`${API_BASE_URL}/services/${id}`, { method: 'DELETE' })
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      const j = await r.json()
      if (j.success && mountedRef.current) setServices(prev => prev.filter(s => s.id !== id))
    } catch (error) {
      console.error('Erro ao excluir:', error)
      if (mountedRef.current) setErrorMsg('Erro ao excluir serviço. Tente novamente.')
    } finally {
      if (mountedRef.current) setDeletingId(null)
    }
  }

  const getStatusColor = (status: 'ativo' | 'inativo') => {
    switch (status) {
      case 'ativo': return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
      case 'inativo': return 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400'
      default: return 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300'
    }
  }

  const getStatusLabel = (status: 'ativo' | 'inativo') => {
    switch (status) {
      case 'ativo': return 'Ativo'
      case 'inativo': return 'Inativo'
      default: return status
    }
  }

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    }).format(value)
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 shadow-md shadow-blue-500/25">
            <Target className="w-5 h-5 text-white" aria-hidden="true" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Serviços</h1>
            <p className="text-gray-500 dark:text-gray-400 text-sm">Gerencie seus serviços e preços</p>
          </div>
        </div>
        {permissions.canCreate && (
          <button
            onClick={() => { setEditing(null); setForm(EMPTY_FORM); setFormErrors({}); setErrorMsg(null); setIsModalOpen(true) }}
            className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-blue-500 to-indigo-600 text-white font-semibold rounded-xl hover:from-blue-600 hover:to-indigo-700 shadow-lg shadow-blue-500/25 hover:-translate-y-0.5 transition-all duration-200"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            Novo Serviço
          </button>
        )}
      </div>

      {/* Mensagem de erro global */}
      {errorMsg && (
        <div role="alert" className="flex items-center justify-between gap-3 px-4 py-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl text-red-700 dark:text-red-400 text-sm">
          <span>{errorMsg}</span>
          <button onClick={() => setErrorMsg(null)} className="text-red-500 hover:text-red-700 dark:hover:text-red-300 transition-colors" aria-label="Fechar mensagem de erro">
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>
      )}

      {/* Cards de Serviços */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3].map(i => (
            <div key={i} className="bg-white dark:!bg-[#243040] rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6 animate-pulse">
              <div className="h-4 bg-gray-200 dark:bg-gray-600 rounded w-3/4 mb-3"></div>
              <div className="h-3 bg-gray-200 dark:bg-gray-600 rounded w-full mb-2"></div>
              <div className="h-3 bg-gray-200 dark:bg-gray-600 rounded w-5/6"></div>
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {services.map((service) => (
            <div key={service.id} className="bg-white dark:!bg-[#243040] rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6 hover:shadow-lg hover:shadow-blue-500/10 hover:-translate-y-0.5 hover:border-blue-200 dark:hover:border-blue-700 transition-all duration-200 flex flex-col">
              <div className="flex items-start justify-between mb-3">
                <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100 leading-snug flex-1 mr-2">{service.name}</h2>
                <span className={`inline-flex px-2.5 py-0.5 text-xs font-semibold rounded-full flex-shrink-0 ${getStatusColor(service.status)}`}>
                  {getStatusLabel(service.status)}
                </span>
              </div>

              <p className="text-sm text-gray-500 dark:text-gray-400 mb-4 line-clamp-2 leading-relaxed">{service.description}</p>

              <div className="space-y-2 mb-5 flex-1">
                <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
                  <Tag className="w-3.5 h-3.5 text-blue-400 flex-shrink-0" aria-hidden="true" />
                  <span>{service.category}</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <DollarSign className="w-3.5 h-3.5 text-green-500 flex-shrink-0" aria-hidden="true" />
                  <span className="font-semibold text-green-600 dark:text-green-400">{formatCurrency(service.price)}</span>
                </div>
                <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
                  <Clock className="w-3.5 h-3.5 text-indigo-400 flex-shrink-0" aria-hidden="true" />
                  <span>{service.duration} dias</span>
                </div>
              </div>

              {(permissions.canEdit || permissions.canDelete) && (
                <div className="flex gap-2 pt-4 border-t border-gray-100 dark:border-gray-700">
                  {permissions.canEdit && (
                    <button
                      onClick={() => { setEditing(service); setForm({ name: service.name, description: service.description, category: service.category, price: String(service.price), duration: String(service.duration), status: service.status }); setFormErrors({}); setErrorMsg(null); setIsModalOpen(true) }}
                      className="flex-1 px-3 py-2 bg-blue-50 hover:bg-blue-100 dark:bg-blue-900/20 dark:hover:bg-blue-900/40 text-blue-600 dark:text-blue-400 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-1.5"
                    >
                      <Edit className="w-3.5 h-3.5" aria-hidden="true" />
                      Editar
                    </button>
                  )}
                  {permissions.canDelete && (
                    <button
                      onClick={() => deleteService(service.id)}
                      disabled={deletingId === service.id}
                      className="flex-1 px-3 py-2 bg-red-50 hover:bg-red-100 dark:bg-red-900/20 dark:hover:bg-red-900/40 text-red-600 dark:text-red-400 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                      {deletingId === service.id ? 'Excluindo…' : 'Excluir'}
                    </button>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Mensagem quando não há serviços */}
      {!loading && services.length === 0 && !errorMsg && (
        <div className="text-center py-16 bg-white dark:!bg-[#243040] rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm">
          <div className="w-16 h-16 bg-gradient-to-br from-blue-100 to-indigo-100 dark:from-blue-900/30 dark:to-indigo-900/30 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Target className="w-8 h-8 text-blue-400" aria-hidden="true" />
          </div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-1">Nenhum serviço cadastrado</h2>
          <p className="text-gray-500 dark:text-gray-400 mb-6 text-sm">Comece adicionando seu primeiro serviço</p>
          {permissions.canCreate && (
            <button
              onClick={() => { setEditing(null); setForm(EMPTY_FORM); setFormErrors({}); setErrorMsg(null); setIsModalOpen(true) }}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-blue-500 to-indigo-600 text-white font-semibold rounded-xl hover:from-blue-600 hover:to-indigo-700 shadow-lg shadow-blue-500/25 hover:-translate-y-0.5 transition-all duration-200"
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
              Adicionar Primeiro Serviço
            </button>
          )}
        </div>
      )}

      {/* Modal Novo/Editar Serviço */}
      <Modal isOpen={isModalOpen} onClose={closeModal} ariaLabelledBy="modal-title">
        <div ref={modalRef} className="bg-white dark:!bg-[#243040] rounded-2xl w-full max-w-md shadow-2xl overflow-hidden">
            <div className="bg-gradient-to-r from-blue-500 to-indigo-600 px-6 py-4 flex items-center justify-between">
              <h2 id="modal-title" className="text-lg font-bold text-white flex items-center gap-2">
                <Target className="w-5 h-5" aria-hidden="true" />
                {editing ? 'Editar Serviço' : 'Novo Serviço'}
              </h2>
              <button onClick={closeModal} className="text-white/80 hover:text-white hover:bg-white/20 rounded-lg p-1.5 transition-all duration-200" aria-label="Fechar modal">
                <X className="w-5 h-5" aria-hidden="true" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div className="relative">
                <label htmlFor="svc-name" className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">
                  Nome <span className="text-red-500">*</span>
                </label>
                <input
                  ref={firstFieldRef}
                  id="svc-name"
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm(prev => ({ ...prev, name: e.target.value }))}
                  className={`w-full px-3 py-2 border rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-gray-700 dark:text-gray-100 dark:border-gray-600 transition-all duration-200 ${
                    formErrors.name ? 'border-red-500 bg-red-50 dark:bg-red-900/20' : 'border-gray-300'
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
                <label htmlFor="svc-description" className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">
                  Descrição <span className="text-red-500">*</span>
                </label>
                <textarea
                  id="svc-description"
                  value={form.description}
                  onChange={(e) => setForm(prev => ({ ...prev, description: e.target.value }))}
                  rows={3}
                  className={`w-full px-3 py-2 border rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-gray-700 dark:text-gray-100 dark:border-gray-600 transition-all duration-200 ${
                    formErrors.description ? 'border-red-500 bg-red-50 dark:bg-red-900/20' : 'border-gray-300'
                  }`}
                />
                {formErrors.description && (
                  <div className="absolute top-full left-0 mt-1 bg-red-500 text-white text-xs px-2 py-1 rounded shadow-lg z-10">
                    {formErrors.description}
                    <div className="absolute -top-1 left-2 w-2 h-2 bg-red-500 transform rotate-45"></div>
                  </div>
                )}
              </div>

              <div className="relative">
                <label htmlFor="svc-category" className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">
                  Categoria <span className="text-red-500">*</span>
                </label>
                <select
                  id="svc-category"
                  value={form.category}
                  onChange={(e) => setForm(prev => ({ ...prev, category: e.target.value }))}
                  className={`w-full px-3 py-2 border rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-gray-700 dark:text-gray-100 dark:border-gray-600 transition-all duration-200 ${
                    formErrors.category ? 'border-red-500 bg-red-50 dark:bg-red-900/20' : 'border-gray-300'
                  }`}
                >
                  <option value="">Selecione uma categoria</option>
                  <option value="REURB">REURB</option>
                  <option value="GEO">GEO</option>
                  <option value="PLAN">PLAN</option>
                  <option value="REG">REG</option>
                  <option value="NN">NN</option>
                </select>
                {formErrors.category && (
                  <div className="absolute top-full left-0 mt-1 bg-red-500 text-white text-xs px-2 py-1 rounded shadow-lg z-10">
                    {formErrors.category}
                    <div className="absolute -top-1 left-2 w-2 h-2 bg-red-500 transform rotate-45"></div>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="relative">
                  <label htmlFor="svc-price" className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">
                    Preço <span className="text-red-500">*</span>
                  </label>
                  <input
                    id="svc-price"
                    type="number"
                    step="0.01"
                    min="0"
                    value={form.price}
                    onChange={(e) => setForm(prev => ({ ...prev, price: e.target.value }))}
                    className={`w-full px-3 py-2 border rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-gray-700 dark:text-gray-100 dark:border-gray-600 transition-all duration-200 ${
                      formErrors.price ? 'border-red-500 bg-red-50 dark:bg-red-900/20' : 'border-gray-300'
                    }`}
                  />
                  {formErrors.price && (
                    <div className="absolute top-full left-0 mt-1 bg-red-500 text-white text-xs px-2 py-1 rounded shadow-lg z-10">
                      {formErrors.price}
                      <div className="absolute -top-1 left-2 w-2 h-2 bg-red-500 transform rotate-45"></div>
                    </div>
                  )}
                </div>
                <div className="relative">
                  <label htmlFor="svc-duration" className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">
                    Duração (dias) <span className="text-red-500">*</span>
                  </label>
                  <input
                    id="svc-duration"
                    type="number"
                    min="1"
                    value={form.duration}
                    onChange={(e) => setForm(prev => ({ ...prev, duration: e.target.value }))}
                    className={`w-full px-3 py-2 border rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-gray-700 dark:text-gray-100 dark:border-gray-600 transition-all duration-200 ${
                      formErrors.duration ? 'border-red-500 bg-red-50 dark:bg-red-900/20' : 'border-gray-300'
                    }`}
                  />
                  {formErrors.duration && (
                    <div className="absolute top-full left-0 mt-1 bg-red-500 text-white text-xs px-2 py-1 rounded shadow-lg z-10">
                      {formErrors.duration}
                      <div className="absolute -top-1 left-2 w-2 h-2 bg-red-500 transform rotate-45"></div>
                    </div>
                  )}
                </div>
              </div>

              <div>
                <label htmlFor="svc-status" className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">Status</label>
                <select
                  id="svc-status"
                  value={form.status}
                  onChange={(e) => setForm(prev => ({ ...prev, status: e.target.value as 'ativo' | 'inativo' }))}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-gray-700 dark:text-gray-100 transition-all duration-200"
                >
                  <option value="ativo">Ativo</option>
                  <option value="inativo">Inativo</option>
                </select>
              </div>

              <div className="mt-2 flex justify-end gap-3">
                <button onClick={closeModal} className="px-4 py-2 rounded-xl bg-gray-100 dark:!bg-[#2d3f52] hover:bg-gray-200 dark:hover:!bg-[#354b60] text-gray-700 dark:text-gray-200 font-medium transition-all duration-200">Cancelar</button>
                <button
                  onClick={saveService}
                  disabled={saving}
                  className="px-4 py-2 rounded-xl bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 text-white font-semibold shadow-lg shadow-blue-500/25 hover:shadow-xl hover:shadow-blue-500/35 hover:-translate-y-0.5 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0"
                >
                  {saving ? 'Salvando…' : 'Salvar'}
                </button>
              </div>
            </div>
          </div>
      </Modal>
    </div>
  )
}

export default Services
