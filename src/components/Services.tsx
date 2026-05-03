import React, { useEffect, useState } from 'react'
import { Target, Plus, Edit, Trash2, X, DollarSign, Clock, Tag } from 'lucide-react'
import { usePermissions } from '../hooks/usePermissions'

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

const Services: React.FC = () => {
  const permissions = usePermissions();
  const [services, setServices] = useState<Service[]>([])
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editing, setEditing] = useState<Service | null>(null)
  const [form, setForm] = useState<{
    name: string
    description: string
    category: string
    price: string
    duration: string
    status: 'ativo' | 'inativo'
  }>({
    name: '', description: '', category: '', price: '', duration: '', status: 'ativo'
  })
  const [formErrors, setFormErrors] = useState<{[key: string]: string}>({})

  useEffect(() => {
    const load = async () => {
      try {
        const r = await fetch(`${API_BASE_URL}/services`)
        const j = await r.json()
        if (j.success) setServices(j.data)
      } catch {}
    }
    load()
  }, [])

  // Controla overlay global (classe no body) ao abrir/fechar modais
  useEffect(() => {
    const body = document?.body
    if (!body) return
    if (isModalOpen) body.classList.add('modal-open')
    else body.classList.remove('modal-open')
    return () => { body.classList.remove('modal-open') }
  }, [isModalOpen])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || !isModalOpen) return
      setIsModalOpen(false)
      setEditing(null)
      setFormErrors({})
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [isModalOpen])

  const validateForm = () => {
    const errors: {[key: string]: string} = {}
    
    if (!form.name.trim()) errors.name = 'Campo obrigatório'
    if (!form.description.trim()) errors.description = 'Campo obrigatório'
    if (!form.category.trim()) errors.category = 'Campo obrigatório'
    if (!form.price.trim()) errors.price = 'Campo obrigatório'
    if (!form.duration.trim()) errors.duration = 'Campo obrigatório'
    
    setFormErrors(errors)
    return Object.keys(errors).length === 0
  }

  const saveService = async () => {
    if (!validateForm()) return
    
    const payload = {
      name: form.name,
      description: form.description,
      category: form.category,
      price: parseFloat(form.price),
      duration: parseInt(form.duration),
      status: form.status
    }
    
    try {
      if (editing) {
        const r = await fetch(`${API_BASE_URL}/services/${editing.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
        const j = await r.json(); if (j.success) setServices(prev => prev.map(s => s.id === editing.id ? j.data : s))
      } else {
        const r = await fetch(`${API_BASE_URL}/services`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
        const j = await r.json(); if (j.success) setServices(prev => [j.data, ...prev])
      }
      setIsModalOpen(false); setEditing(null); setForm({ name: '', description: '', category: '', price: '', duration: '', status: 'ativo' }); setFormErrors({})
    } catch (error) {
      console.error('Erro ao salvar:', error)
    }
  }

  const deleteService = async (id: string) => {
    if (!confirm('Tem certeza que deseja excluir este serviço?')) return
    try {
      const r = await fetch(`${API_BASE_URL}/services/${id}`, { method: 'DELETE' })
      const j = await r.json()
      if (j.success) setServices(prev => prev.filter(s => s.id !== id))
    } catch (error) {
      console.error('Erro ao excluir:', error)
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'ativo': return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
      case 'inativo': return 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400'
      default: return 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300'
    }
  }

  const getStatusLabel = (status: string) => {
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
            <Target className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Serviços</h1>
            <p className="text-gray-500 dark:text-gray-400 text-sm">Gerencie seus serviços e preços</p>
          </div>
        </div>
        {permissions.canCreate && (
          <button
            onClick={() => { setEditing(null); setForm({ name: '', description: '', category: '', price: '', duration: '', status: 'ativo' }); setFormErrors({}); setIsModalOpen(true) }}
            className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-blue-500 to-indigo-600 text-white font-semibold rounded-xl hover:from-blue-600 hover:to-indigo-700 shadow-lg shadow-blue-500/25 hover:-translate-y-0.5 transition-all duration-200"
          >
            <Plus className="h-4 w-4" />
            Novo Serviço
          </button>
        )}
      </div>

      {/* Cards de Serviços */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {services.map((service) => (
          <div key={service.id} className="bg-white dark:!bg-[#243040] rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6 hover:shadow-lg hover:shadow-blue-500/10 hover:-translate-y-0.5 hover:border-blue-200 dark:hover:border-blue-700 transition-all duration-200 flex flex-col">
            <div className="flex items-start justify-between mb-3">
              <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100 leading-snug flex-1 mr-2">{service.name}</h3>
              <span className={`inline-flex px-2.5 py-0.5 text-xs font-semibold rounded-full flex-shrink-0 ${getStatusColor(service.status)}`}>
                {getStatusLabel(service.status)}
              </span>
            </div>

            <p className="text-sm text-gray-500 dark:text-gray-400 mb-4 line-clamp-2 leading-relaxed">{service.description}</p>

            <div className="space-y-2 mb-5 flex-1">
              <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
                <Tag className="w-3.5 h-3.5 text-blue-400 flex-shrink-0" />
                <span>{service.category}</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <DollarSign className="w-3.5 h-3.5 text-green-500 flex-shrink-0" />
                <span className="font-semibold text-green-600 dark:text-green-400">{formatCurrency(service.price)}</span>
              </div>
              <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
                <Clock className="w-3.5 h-3.5 text-indigo-400 flex-shrink-0" />
                <span>{service.duration} dias</span>
              </div>
            </div>

            {(permissions.canEdit || permissions.canDelete) && (
              <div className="flex gap-2 pt-4 border-t border-gray-100 dark:border-gray-700">
                {permissions.canEdit && (
                  <button
                    onClick={() => { setEditing(service); setForm({ name: service.name, description: service.description, category: service.category, price: String(service.price), duration: String(service.duration), status: service.status }); setIsModalOpen(true) }}
                    className="flex-1 px-3 py-2 bg-blue-50 hover:bg-blue-100 dark:bg-blue-900/20 dark:hover:bg-blue-900/40 text-blue-600 dark:text-blue-400 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-1.5"
                  >
                    <Edit className="w-3.5 h-3.5" />
                    Editar
                  </button>
                )}
                {permissions.canDelete && (
                  <button
                    onClick={() => deleteService(service.id)}
                    className="flex-1 px-3 py-2 bg-red-50 hover:bg-red-100 dark:bg-red-900/20 dark:hover:bg-red-900/40 text-red-600 dark:text-red-400 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-1.5"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Excluir
                  </button>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Mensagem quando não há serviços */}
      {services.length === 0 && (
        <div className="text-center py-16 bg-white dark:!bg-[#243040] rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm">
          <div className="w-16 h-16 bg-gradient-to-br from-blue-100 to-indigo-100 dark:from-blue-900/30 dark:to-indigo-900/30 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Target className="w-8 h-8 text-blue-400" />
          </div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-1">Nenhum serviço cadastrado</h3>
          <p className="text-gray-500 dark:text-gray-400 mb-6 text-sm">Comece adicionando seu primeiro serviço</p>
          {permissions.canCreate && (
            <button
              onClick={() => { setEditing(null); setForm({ name: '', description: '', category: '', price: '', duration: '', status: 'ativo' }); setFormErrors({}); setIsModalOpen(true) }}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-blue-500 to-indigo-600 text-white font-semibold rounded-xl hover:from-blue-600 hover:to-indigo-700 shadow-lg shadow-blue-500/25 hover:-translate-y-0.5 transition-all duration-200"
            >
              <Plus className="h-4 w-4" />
              Adicionar Primeiro Serviço
            </button>
          )}
        </div>
      )}

      {/* Modal Novo/Editar Serviço */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-gradient-to-br from-blue-900/50 to-indigo-900/50 backdrop-blur-sm flex items-center justify-center z-[10000] p-4" onClick={(e) => { if (e.target === e.currentTarget) { setIsModalOpen(false); setEditing(null); setFormErrors({}) } }}>
          <div className="bg-white dark:!bg-[#243040] rounded-2xl w-full max-w-md shadow-2xl overflow-hidden">
            <div className="bg-gradient-to-r from-blue-500 to-indigo-600 px-6 py-4 flex items-center justify-between">
              <h2 className="text-lg font-bold text-white flex items-center gap-2"><Target className="w-5 h-5" />{editing ? 'Editar Serviço' : 'Novo Serviço'}</h2>
              <button onClick={() => { setIsModalOpen(false); setEditing(null); setFormErrors({}) }} className="text-white/80 hover:text-white hover:bg-white/20 rounded-lg p-1.5 transition-all duration-200"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-6 space-y-4">
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
                  Descrição <span className="text-red-500">*</span>
                </label>
                <textarea
                  value={form.description}
                  onChange={(e) => setForm(prev => ({ ...prev, description: e.target.value }))}
                  rows={3}
                  className={`w-full px-3 py-2 border rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-gray-700 dark:text-gray-100 dark:border-gray-600 transition-all duration-200 ${
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

              <div className="relative">
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">
                  Categoria <span className="text-red-500">*</span>
                </label>
                <select
                  value={form.category}
                  onChange={(e) => setForm(prev => ({ ...prev, category: e.target.value }))}
                  className={`w-full px-3 py-2 border rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-gray-700 dark:text-gray-100 dark:border-gray-600 transition-all duration-200 ${
                    formErrors.category ? 'border-red-500 bg-red-50' : 'border-gray-300'
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
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">
                    Preço <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={form.price}
                    onChange={(e) => setForm(prev => ({ ...prev, price: e.target.value }))}
                    className={`w-full px-3 py-2 border rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-gray-700 dark:text-gray-100 dark:border-gray-600 transition-all duration-200 ${
                      formErrors.price ? 'border-red-500 bg-red-50' : 'border-gray-300'
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
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">
                    Duração (dias) <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="number"
                    value={form.duration}
                    onChange={(e) => setForm(prev => ({ ...prev, duration: e.target.value }))}
                    className={`w-full px-3 py-2 border rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-gray-700 dark:text-gray-100 dark:border-gray-600 transition-all duration-200 ${
                      formErrors.duration ? 'border-red-500 bg-red-50' : 'border-gray-300'
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
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">Status</label>
                <select
                  value={form.status}
                  onChange={(e) => setForm(prev => ({ ...prev, status: e.target.value as 'ativo' | 'inativo' }))}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-gray-700 dark:text-gray-100 transition-all duration-200"
                >
                  <option value="ativo">Ativo</option>
                  <option value="inativo">Inativo</option>
                </select>
              </div>

              <div className="mt-2 flex justify-end gap-3">
                <button onClick={() => { setIsModalOpen(false); setEditing(null); setFormErrors({}) }} className="px-4 py-2 rounded-xl bg-gray-100 dark:!bg-[#2d3f52] hover:bg-gray-200 dark:hover:!bg-[#354b60] text-gray-700 dark:text-gray-200 font-medium transition-all duration-200">Cancelar</button>
                <button onClick={saveService} className="px-4 py-2 rounded-xl bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 text-white font-semibold shadow-lg shadow-blue-500/25 hover:shadow-xl hover:shadow-blue-500/35 hover:-translate-y-0.5 transition-all duration-200">Salvar</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default Services
