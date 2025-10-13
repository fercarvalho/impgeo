import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Map, Plus, Download, Upload, Edit, Trash2, Calendar, Filter, X } from 'lucide-react'
import { usePermissions } from '../hooks/usePermissions'

interface Project {
  id: string
  name: string
  description: string
  client: string
  startDate: string
  endDate: string
  status: 'ativo' | 'pausado' | 'concluido'
  value: number
  progress: number
  services: string[]
}

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

interface Client {
  id: string
  name: string
  email: string
  phone: string
  address: string
  cpf?: string
  cnpj?: string
}

const Projects: React.FC = () => {
  const permissions = usePermissions();
  const [projects, setProjects] = useState<Project[]>([])
  const [clients, setClients] = useState<Client[]>([])
  const [services, setServices] = useState<Service[]>([])
  const [selectedProjects, setSelectedProjects] = useState<Set<string>>(new Set())
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editing, setEditing] = useState<Project | null>(null)
  const [form, setForm] = useState<{
    name: string
    description: string
    client: string
    startDate: string
    endDate: string
    status: 'ativo' | 'pausado' | 'concluido'
    value: string
    progress: string
    selectedServices: string[]
  }>({
    name: '', description: '', client: '', startDate: new Date().toISOString().split('T')[0], 
    endDate: '', status: 'ativo', value: '', progress: '0', selectedServices: []
  })
  const [formErrors, setFormErrors] = useState<{[key: string]: string}>({})
  const [isImportExportOpen, setIsImportExportOpen] = useState(false)
  const [isServicesModalOpen, setIsServicesModalOpen] = useState(false)
  const [importType, setImportType] = useState<'projects'>('projects')
  const [newProject, setNewProject] = useState('')
  const [newProjectError, setNewProjectError] = useState('')
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  // Estados para filtros e ordenação
  const [filters, setFilters] = useState({
    name: '',
    client: '',
    status: ''
  })
  const [sortConfig, setSortConfig] = useState<{field: keyof Project; direction: 'asc' | 'desc'}>({
    field: 'startDate',
    direction: 'desc'
  })

  // calendários de filtro
  const [isFilterCalendarFromOpen, setIsFilterCalendarFromOpen] = useState(false)
  const [isFilterCalendarToOpen, setIsFilterCalendarToOpen] = useState(false)

  useEffect(() => {
    const load = async () => {
      try {
        const r = await fetch(`${API_BASE_URL}/projects`)
        const j = await r.json()
        if (j.success) setProjects(j.data)
      } catch {}
    }
    load()
  }, [])

  useEffect(() => {
    const loadClients = async () => {
      try {
        const r = await fetch(`${API_BASE_URL}/clients`)
        const j = await r.json()
        if (j.success) setClients(j.data)
      } catch {}
    }
    loadClients()
  }, [])

  useEffect(() => {
    const loadServices = async () => {
      try {
        const r = await fetch(`${API_BASE_URL}/services`)
        const j = await r.json()
        if (j.success) setServices(j.data)
      } catch {}
    }
    loadServices()
  }, [])

  // Controla overlay global (classe no body) ao abrir/fechar modais
  useEffect(() => {
    const body = document?.body
    if (!body) return
    if (isImportExportOpen || isModalOpen || isServicesModalOpen) body.classList.add('modal-open')
    else body.classList.remove('modal-open')
    return () => { body.classList.remove('modal-open') }
  }, [isImportExportOpen, isModalOpen, isServicesModalOpen])

  const handleSort = (field: keyof Project) => {
    let direction: 'asc' | 'desc' = 'asc'
    if (sortConfig.field === field && sortConfig.direction === 'asc') direction = 'desc'
    setSortConfig({ field, direction })
  }

  const getSortIcon = (field: keyof Project) => {
    if (sortConfig.field !== field) return <span className="text-gray-400">↕</span>
    return sortConfig.direction === 'asc' ? <span className="text-blue-600">↑</span> : <span className="text-blue-600">↓</span>
  }

  const filteredProjects = useMemo(() => {
    return projects.filter(p => {
      const matchesName = p.name.toLowerCase().includes(filters.name.toLowerCase())
      const matchesClient = p.client.toLowerCase().includes(filters.client.toLowerCase())
      const matchesStatus = !filters.status || p.status === filters.status
      return matchesName && matchesClient && matchesStatus
    }).sort((a, b) => {
      const aVal = a[sortConfig.field]
      const bVal = b[sortConfig.field]
      if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1
      if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1
      return 0
    })
  }, [projects, filters, sortConfig])

  const handleSelect = (id: string) => {
    setSelectedProjects(prev => {
      const newSet = new Set(prev)
      if (newSet.has(id)) newSet.delete(id)
      else newSet.add(id)
      return newSet
    })
  }

  const handleSelectAll = () => {
    if (selectedProjects.size === filteredProjects.length) {
      setSelectedProjects(new Set())
    } else {
      setSelectedProjects(new Set(filteredProjects.map(p => p.id)))
    }
  }

  const clearFilters = () => setFilters({ name: '', client: '', status: '' })

  const calculateServicesValue = (selectedServiceIds: string[]) => {
    return selectedServiceIds.reduce((total, serviceId) => {
      const service = services.find(s => s.id === serviceId)
      return total + (service ? service.price : 0)
    }, 0)
  }

  // CRUD
  const validateForm = () => {
    const errors: {[key: string]: string} = {}
    
    if (!form.name.trim()) errors.name = 'Campo obrigatório'
    if (!form.description.trim()) errors.description = 'Campo obrigatório'
    if (!form.client.trim()) errors.client = 'Campo obrigatório'
    if (!form.startDate.trim()) errors.startDate = 'Campo obrigatório'
    if (!form.value.trim()) errors.value = 'Campo obrigatório'
    if (!form.progress.trim()) errors.progress = 'Campo obrigatório'
    
    setFormErrors(errors)
    return Object.keys(errors).length === 0
  }

  const saveProject = async () => {
    if (!validateForm()) return
    
    const payload = {
      name: form.name,
      description: form.description,
      client: form.client,
      startDate: form.startDate,
      endDate: form.endDate || null,
      status: form.status,
      value: parseFloat(form.value),
      progress: parseInt(form.progress),
      services: form.selectedServices
    }
    
    try {
      if (editing) {
        const r = await fetch(`${API_BASE_URL}/projects/${editing.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
        const j = await r.json(); if (j.success) setProjects(prev => prev.map(p => p.id === editing.id ? j.data : p))
      } else {
        const r = await fetch(`${API_BASE_URL}/projects`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
        const j = await r.json(); if (j.success) setProjects(prev => [j.data, ...prev])
      }
      setIsModalOpen(false); setEditing(null); setForm({ name: '', description: '', client: '', startDate: new Date().toISOString().split('T')[0], endDate: '', status: 'ativo', value: '', progress: '0', selectedServices: [] }); setFormErrors({})
    } catch (error) {
      console.error('Erro ao salvar:', error)
    }
  }

  const deleteOne = async (id: string) => {
    if (!confirm('Tem certeza que deseja excluir este projeto?')) return
    try {
      const r = await fetch(`${API_BASE_URL}/projects/${id}`, { method: 'DELETE' })
      const j = await r.json()
      if (j.success) setProjects(prev => prev.filter(p => p.id !== id))
    } catch (error) {
      console.error('Erro ao excluir:', error)
    }
  }

  const deleteMultiple = async () => {
    if (selectedProjects.size === 0) return
    if (!confirm(`Tem certeza que deseja excluir ${selectedProjects.size} projeto(s)?`)) return
    try {
      const r = await fetch(`${API_BASE_URL}/projects`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids: Array.from(selectedProjects) }) })
      const j = await r.json()
      if (j.success) { setProjects(prev => prev.filter(p => !selectedProjects.has(p.id))); setSelectedProjects(new Set()) }
    } catch (error) {
      console.error('Erro ao excluir:', error)
    }
  }

  // Import/Export
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    
    const formData = new FormData()
    formData.append('file', file)
    formData.append('type', importType)
    
    fetch(`${API_BASE_URL}/import`, { method: 'POST', body: formData })
      .then(r => r.json())
      .then(data => {
        if (data.success) {
          setProjects(prev => [...data.data, ...prev])
          alert(`${data.data.length} projetos importados com sucesso!`)
        } else {
          alert('Erro ao importar: ' + data.error)
        }
      })
      .catch(() => alert('Erro ao importar arquivo'))
      .finally(() => {
        if (fileInputRef.current) fileInputRef.current.value = ''
        setIsImportExportOpen(false)
      })
  }

  const handleExport = () => {
    const data = filteredProjects.map(p => ({
      Nome: p.name,
      Descrição: p.description,
      Cliente: p.client,
      'Data Início': p.startDate,
      'Data Fim': p.endDate || '',
      Status: p.status,
      Valor: p.value,
      Progresso: p.progress
    }))
    
    const csv = [
      Object.keys(data[0] || {}).join(','),
      ...data.map(row => Object.values(row).map(v => `"${v}"`).join(','))
    ].join('\n')
    
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `projetos-${new Date().toISOString().split('T')[0]}.csv`
    a.click()
    URL.revokeObjectURL(url)
    setIsImportExportOpen(false)
  }

  const downloadModel = () => {
    window.open(`${API_BASE_URL}/modelo/projects`, '_blank')
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'ativo': return 'bg-green-100 text-green-800'
      case 'pausado': return 'bg-yellow-100 text-yellow-800'
      case 'concluido': return 'bg-blue-100 text-blue-800'
      default: return 'bg-gray-100 text-gray-800'
    }
  }

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'ativo': return 'Ativo'
      case 'pausado': return 'Pausado'
      case 'concluido': return 'Concluído'
      default: return status
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Projetos</h1>
          <p className="text-gray-600">Gerencie seus projetos e acompanhe o progresso</p>
        </div>
        <div className="flex flex-col sm:flex-row gap-3">
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
              onClick={() => { setEditing(null); setForm({ name: '', description: '', client: '', startDate: new Date().toISOString().split('T')[0], endDate: '', status: 'ativo', value: '', progress: '0', selectedServices: [] }); setFormErrors({}); setIsModalOpen(true) }}
              className="flex items-center gap-3 px-6 py-3 bg-gradient-to-r from-blue-500 to-indigo-600 text-white font-semibold rounded-xl hover:from-blue-600 hover:to-indigo-700 shadow-lg hover:shadow-xl transform hover:-translate-y-1 transition-all duration-300"
            >
              <Plus className="h-5 w-5" />
              Novo Projeto
            </button>
          )}
        </div>
      </div>

      {/* Filtros */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 sm:p-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="flex flex-col flex-1 min-w-0">
            <label className="text-xs sm:text-sm font-semibold text-gray-700 mb-1 truncate">Nome</label>
            <input
              type="text"
              placeholder="Nome..."
              value={filters.name}
              onChange={(e) => setFilters(prev => ({ ...prev, name: e.target.value }))}
              className="px-1 sm:px-2 md:px-3 py-1 sm:py-2 border border-blue-300 rounded-md text-xs sm:text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white w-full"
            />
          </div>
          <div className="flex flex-col flex-1 min-w-0">
            <label className="text-xs sm:text-sm font-semibold text-gray-700 mb-1 truncate">Cliente</label>
            <input
              type="text"
              placeholder="Cliente..."
              value={filters.client}
              onChange={(e) => setFilters(prev => ({ ...prev, client: e.target.value }))}
              className="px-1 sm:px-2 md:px-3 py-1 sm:py-2 border border-blue-300 rounded-md text-xs sm:text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white w-full"
            />
          </div>
          <div className="flex flex-col flex-1 min-w-0">
            <label className="text-xs sm:text-sm font-semibold text-gray-700 mb-1 truncate">Status</label>
            <select
              value={filters.status}
              onChange={(e) => setFilters(prev => ({ ...prev, status: e.target.value }))}
              className="px-1 sm:px-2 md:px-3 py-1 sm:py-2 border border-blue-300 rounded-md text-xs sm:text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white w-full"
            >
              <option value="">Todos</option>
              <option value="ativo">Ativo</option>
              <option value="pausado">Pausado</option>
              <option value="concluido">Concluído</option>
            </select>
          </div>
          <div className="flex items-end">
            <button
              onClick={clearFilters}
              className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-md text-sm font-medium transition-colors"
            >
              Limpar
            </button>
          </div>
        </div>
      </div>

      {/* Ações em lote */}
      {selectedProjects.size > 0 && permissions.canDelete && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <div className="flex items-center justify-between">
            <span className="text-blue-800 font-medium">
              {selectedProjects.size} projeto(s) selecionado(s)
            </span>
            <button
              onClick={deleteMultiple}
              className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-md text-sm font-medium transition-colors"
            >
              Excluir Selecionados
            </button>
          </div>
        </div>
      )}

      {/* Tabela */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-blue-50">
              <tr>
                {permissions.canDelete && (
                  <th className="px-4 sm:px-6 py-3 text-left">
                    <input
                      type="checkbox"
                      checked={projects.length > 0 && selectedProjects.size === projects.length}
                      onChange={handleSelectAll}
                      className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 focus:ring-2"
                    />
                  </th>
                )}
                <th className="px-4 sm:px-6 py-3 text-left">
                  <button onClick={() => handleSort('name')} className="flex items-center gap-1 hover:bg-blue-100 rounded px-1 sm:px-2 py-1 transition-colors">
                    <span className="text-xs sm:text-sm font-bold text-blue-800 uppercase tracking-wide">Nome</span>
                    {getSortIcon('name')}
                  </button>
                </th>
                <th className="px-4 sm:px-6 py-3 text-left">
                  <button onClick={() => handleSort('client')} className="flex items-center gap-1 hover:bg-blue-100 rounded px-1 sm:px-2 py-1 transition-colors">
                    <span className="text-xs sm:text-sm font-bold text-blue-800 uppercase tracking-wide">Cliente</span>
                    {getSortIcon('client')}
                  </button>
                </th>
                <th className="px-4 sm:px-6 py-3 text-left">
                  <button onClick={() => handleSort('startDate')} className="flex items-center gap-1 hover:bg-blue-100 rounded px-1 sm:px-2 py-1 transition-colors">
                    <span className="text-xs sm:text-sm font-bold text-blue-800 uppercase tracking-wide">Início</span>
                    {getSortIcon('startDate')}
                  </button>
                </th>
                <th className="px-4 sm:px-6 py-3 text-left">
                  <button onClick={() => handleSort('status')} className="flex items-center gap-1 hover:bg-blue-100 rounded px-1 sm:px-2 py-1 transition-colors">
                    <span className="text-xs sm:text-sm font-bold text-blue-800 uppercase tracking-wide">Status</span>
                    {getSortIcon('status')}
                  </button>
                </th>
                <th className="px-4 sm:px-6 py-3 text-left">
                  <button onClick={() => handleSort('value')} className="flex items-center gap-1 hover:bg-blue-100 rounded px-1 sm:px-2 py-1 transition-colors">
                    <span className="text-xs sm:text-sm font-bold text-blue-800 uppercase tracking-wide">Valor</span>
                    {getSortIcon('value')}
                  </button>
                </th>
                <th className="px-4 sm:px-6 py-3 text-left">
                  <button onClick={() => handleSort('progress')} className="flex items-center gap-1 hover:bg-blue-100 rounded px-1 sm:px-2 py-1 transition-colors">
                    <span className="text-xs sm:text-sm font-bold text-blue-800 uppercase tracking-wide">Progresso</span>
                    {getSortIcon('progress')}
                  </button>
                </th>
                <th className="px-4 sm:px-6 py-3 text-center">
                  <span className="text-xs sm:text-sm font-bold text-blue-800 uppercase tracking-wide">Ações</span>
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredProjects.map((project) => (
                <tr key={project.id} className="hover:bg-gray-50">
                  {permissions.canDelete && (
                    <td className="px-4 sm:px-6 py-4">
                      <input
                        type="checkbox"
                        checked={selectedProjects.has(project.id)}
                        onChange={() => handleSelect(project.id)}
                        className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 focus:ring-2"
                      />
                    </td>
                  )}
                  <td className="px-4 sm:px-6 py-4">
                    <div className="flex-1 min-w-0">
                      <h3 className="text-sm font-medium text-gray-900 truncate">{project.name}</h3>
                      <p className="text-xs text-gray-500 truncate">{project.description}</p>
                    </div>
                  </td>
                  <td className="px-4 sm:px-6 py-4">
                    <span className="text-sm text-gray-900">{project.client}</span>
                  </td>
                  <td className="px-4 sm:px-6 py-4">
                    <span className="text-sm text-gray-900">
                      {new Date(project.startDate).toLocaleDateString('pt-BR')}
                    </span>
                  </td>
                  <td className="px-4 sm:px-6 py-4">
                    <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getStatusColor(project.status)}`}>
                      {getStatusLabel(project.status)}
                    </span>
                  </td>
                  <td className="px-4 sm:px-6 py-4">
                    <span className="text-sm font-medium text-gray-900">
                      R$ {project.value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </span>
                  </td>
                  <td className="px-4 sm:px-6 py-4">
                    <div className="flex items-center">
                      <div className="w-16 bg-gray-200 rounded-full h-2 mr-2">
                        <div 
                          className="bg-blue-600 h-2 rounded-full" 
                          style={{ width: `${project.progress}%` }}
                        ></div>
                      </div>
                      <span className="text-sm text-gray-900">{project.progress}%</span>
                    </div>
                  </td>
                  <td className="px-4 sm:px-6 py-4">
                    <div className="flex justify-center space-x-2">
                      {permissions.canEdit && (
                        <button 
                          onClick={() => { setEditing(project); setForm({ name: project.name, description: project.description, client: project.client, startDate: project.startDate, endDate: project.endDate, status: project.status, value: String(project.value), progress: String(project.progress), selectedServices: project.services || [] }); setIsModalOpen(true) }}
                          className="p-1 text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded-full transition-colors"
                          title="Editar projeto"
                        >
                          <Edit className="w-4 h-4" />
                        </button>
                      )}
                      {permissions.canDelete && (
                        <button 
                          onClick={() => deleteOne(project.id)}
                          className="p-1 text-red-600 hover:text-red-800 hover:bg-red-50 rounded-full transition-colors"
                          title="Excluir projeto"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal Import/Export */}
      {isImportExportOpen && (
        <div className="fixed inset-0 flex items-center justify-center z-[10000] p-4" onClick={(e) => { if (e.target === e.currentTarget) setIsImportExportOpen(false) }}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl border border-gray-200">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Upload className="w-5 h-5 text-blue-600" />
                <h2 className="text-lg font-bold text-gray-800">Importar/Exportar Projetos</h2>
              </div>
              <button onClick={() => setIsImportExportOpen(false)} className="text-gray-500 hover:text-gray-700">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="border-b border-gray-200 mb-4"></div>
            <p className="text-sm text-gray-600 mb-6">Escolha uma das opções abaixo para gerenciar seus dados:</p>
            
            <div className="space-y-4">
              {/* Seção Baixar Modelo */}
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <p className="text-blue-600 font-semibold text-sm mb-2">Primeiro baixe o modelo, depois importe!</p>
                <p className="text-xs text-gray-600 mb-3">Baixe o arquivo modelo, preencha com seus dados e depois faça o upload.</p>
                <button
                  onClick={downloadModel}
                  className="w-full px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-bold transition-colors flex items-center justify-center gap-2"
                >
                  <Download className="w-4 h-4" />
                  Baixar Modelo de Projetos
                </button>
              </div>
              
              {/* Seção Ações */}
              <div className="space-y-3">
                {permissions.canImport && (
                  <div className="relative">
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".xlsx,.xls,.csv"
                      onChange={handleFileSelect}
                      className="hidden"
                    />
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      className="w-full px-4 py-3 bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 text-white rounded-lg transition-all duration-300 flex items-center justify-center gap-2"
                    >
                      <Upload className="w-4 h-4" />
                      <div className="text-center">
                        <div className="font-bold">Selecionar Arquivo</div>
                        <div className="text-xs opacity-90 font-normal">Carregar arquivo .xlsx</div>
                      </div>
                    </button>
                  </div>
                )}
                
                {permissions.canExport && (
                  <button
                    onClick={handleExport}
                    className="w-full px-4 py-3 bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 text-white rounded-lg transition-all duration-300 flex items-center justify-center gap-2"
                  >
                    <Download className="w-4 h-4" />
                    <div className="text-center">
                      <div className="font-bold">Exportar</div>
                      <div className="text-xs opacity-90 font-normal">Salvar dados em arquivo</div>
                    </div>
                  </button>
                )}
              </div>
              
              {/* Botão Cancelar */}
              <button
                onClick={() => setIsImportExportOpen(false)}
                className="w-full px-4 py-2 bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 rounded-lg font-bold transition-colors"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Novo/Editar Projeto */}
      {isModalOpen && (
        <div className="fixed inset-0 flex items-center justify-center z-[10000] p-4" onClick={(e) => { if (e.target === e.currentTarget) { setIsModalOpen(false); setEditing(null); setFormErrors({}) } }}>
          <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl border border-gray-200 max-h-[90vh] overflow-y-auto">
            <div className="p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-gray-800">{editing ? 'Editar Projeto' : 'Novo Projeto'}</h2>
              <button onClick={() => { setIsModalOpen(false); setEditing(null); setFormErrors({}) }} className="text-gray-500 hover:text-gray-700">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-4">
              <div className="relative">
                <label className="block text-sm font-semibold text-gray-700 mb-1">
                  Nome <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm(prev => ({ ...prev, name: e.target.value }))}
                  className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
                    formErrors.name ? 'border-red-500 bg-red-50' : ''
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
                <label className="block text-sm font-semibold text-gray-700 mb-1">
                  Descrição <span className="text-red-500">*</span>
                </label>
                <textarea
                  value={form.description}
                  onChange={(e) => setForm(prev => ({ ...prev, description: e.target.value }))}
                  rows={3}
                  className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
                    formErrors.description ? 'border-red-500 bg-red-50' : ''
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
                <label className="block text-sm font-semibold text-gray-700 mb-1">
                  Cliente <span className="text-red-500">*</span>
                </label>
                <select
                  value={form.client}
                  onChange={(e) => setForm(prev => ({ ...prev, client: e.target.value }))}
                  className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
                    formErrors.client ? 'border-red-500 bg-red-50' : ''
                  }`}
                >
                  <option value="">Selecione um cliente</option>
                  {clients.map(client => (
                    <option key={client.id} value={client.name}>
                      {client.name}
                    </option>
                  ))}
                </select>
                {formErrors.client && (
                  <div className="absolute top-full left-0 mt-1 bg-red-500 text-white text-xs px-2 py-1 rounded shadow-lg z-10">
                    {formErrors.client}
                    <div className="absolute -top-1 left-2 w-2 h-2 bg-red-500 transform rotate-45"></div>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="relative">
                  <label className="block text-sm font-semibold text-gray-700 mb-1">
                    Data Início <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="date"
                    value={form.startDate}
                    onChange={(e) => setForm(prev => ({ ...prev, startDate: e.target.value }))}
                    className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
                      formErrors.startDate ? 'border-red-500 bg-red-50' : ''
                    }`}
                  />
                  {formErrors.startDate && (
                    <div className="absolute top-full left-0 mt-1 bg-red-500 text-white text-xs px-2 py-1 rounded shadow-lg z-10">
                      {formErrors.startDate}
                      <div className="absolute -top-1 left-2 w-2 h-2 bg-red-500 transform rotate-45"></div>
                    </div>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Data Fim</label>
                  <input
                    type="date"
                    value={form.endDate}
                    onChange={(e) => setForm(prev => ({ ...prev, endDate: e.target.value }))}
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Status</label>
                  <select
                    value={form.status}
                    onChange={(e) => setForm(prev => ({ ...prev, status: e.target.value as 'ativo' | 'pausado' | 'concluido' }))}
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="ativo">Ativo</option>
                    <option value="pausado">Pausado</option>
                    <option value="concluido">Concluído</option>
                  </select>
                </div>
                <div className="relative">
                  <label className="block text-sm font-semibold text-gray-700 mb-1">
                    Valor <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={form.value}
                    onChange={(e) => setForm(prev => ({ ...prev, value: e.target.value }))}
                    className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
                      formErrors.value ? 'border-red-500 bg-red-50' : ''
                    }`}
                  />
                  {formErrors.value && (
                    <div className="absolute top-full left-0 mt-1 bg-red-500 text-white text-xs px-2 py-1 rounded shadow-lg z-10">
                      {formErrors.value}
                      <div className="absolute -top-1 left-2 w-2 h-2 bg-red-500 transform rotate-45"></div>
                    </div>
                  )}
                </div>
              </div>

              <div className="relative">
                <label className="block text-sm font-semibold text-gray-700 mb-1">
                  Progresso (%) <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={form.progress}
                  onChange={(e) => setForm(prev => ({ ...prev, progress: e.target.value }))}
                  className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
                    formErrors.progress ? 'border-red-500 bg-red-50' : ''
                  }`}
                />
                {formErrors.progress && (
                  <div className="absolute top-full left-0 mt-1 bg-red-500 text-white text-xs px-2 py-1 rounded shadow-lg z-10">
                    {formErrors.progress}
                    <div className="absolute -top-1 left-2 w-2 h-2 bg-red-500 transform rotate-45"></div>
                  </div>
                )}
              </div>

              {/* Seleção de Serviços */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Serviços Inclusos
                </label>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setIsServicesModalOpen(true)}
                    className="flex-1 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 text-gray-700 font-medium transition-colors"
                  >
                    {form.selectedServices.length > 0 
                      ? `${form.selectedServices.length} serviço(s) selecionado(s)`
                      : 'Selecionar Serviços'
                    }
                  </button>
                  {form.selectedServices.length > 0 && (
                    <button
                      type="button"
                      onClick={() => {
                        setForm(prev => ({ 
                          ...prev, 
                          selectedServices: [],
                          value: '0'
                        }))
                      }}
                      className="px-3 py-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                      title="Limpar seleção"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
                {form.selectedServices.length > 0 && (
                  <div className="mt-2 p-2 bg-blue-50 rounded-lg">
                    <p className="text-sm text-blue-800">
                      <strong>Valor calculado:</strong> R$ {calculateServicesValue(form.selectedServices).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </p>
                    <p className="text-xs text-blue-600 mt-1">
                      Você pode editar o valor final do projeto abaixo
                    </p>
                  </div>
                )}
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <button onClick={() => { setIsModalOpen(false); setEditing(null); setFormErrors({}) }} className="px-4 py-2 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700">Cancelar</button>
              <button onClick={saveProject} className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold">Salvar</button>
            </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal Seleção de Serviços */}
      {isServicesModalOpen && (
        <div className="fixed inset-0 flex items-center justify-center z-[10001] p-4" onClick={(e) => { if (e.target === e.currentTarget) setIsServicesModalOpen(false) }}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-2xl shadow-2xl border border-gray-200">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-gray-800">Selecionar Serviços</h2>
              <button onClick={() => setIsServicesModalOpen(false)} className="text-gray-500 hover:text-gray-700">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="max-h-96 overflow-y-auto space-y-3 mb-4">
              {services.filter(s => s.status === 'ativo').map((service) => (
                <label key={service.id} className="flex items-center space-x-3 cursor-pointer hover:bg-gray-50 p-3 rounded-lg border border-gray-200">
                  <input
                    type="checkbox"
                    checked={form.selectedServices.includes(service.id)}
                    onChange={(e) => {
                      if (e.target.checked) {
                        const newSelectedServices = [...form.selectedServices, service.id]
                        const calculatedValue = calculateServicesValue(newSelectedServices)
                        setForm(prev => ({ 
                          ...prev, 
                          selectedServices: newSelectedServices,
                          value: String(calculatedValue)
                        }))
                      } else {
                        const newSelectedServices = form.selectedServices.filter(id => id !== service.id)
                        const calculatedValue = calculateServicesValue(newSelectedServices)
                        setForm(prev => ({ 
                          ...prev, 
                          selectedServices: newSelectedServices,
                          value: String(calculatedValue)
                        }))
                      }
                    }}
                    className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 focus:ring-2"
                  />
                  <div className="flex-1">
                    <div className="flex justify-between items-center">
                      <span className="text-sm font-medium text-gray-900">{service.name}</span>
                      <span className="text-sm text-green-600 font-semibold">
                        R$ {service.price.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </span>
                    </div>
                    <p className="text-xs text-gray-500">{service.category} - {service.duration} dias</p>
                    <p className="text-xs text-gray-600 mt-1">{service.description}</p>
                  </div>
                </label>
              ))}
            </div>

            {form.selectedServices.length > 0 && (
              <div className="mb-4 p-3 bg-blue-50 rounded-lg">
                <p className="text-sm text-blue-800">
                  <strong>Valor total:</strong> R$ {calculateServicesValue(form.selectedServices).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </p>
                <p className="text-xs text-blue-600 mt-1">
                  {form.selectedServices.length} serviço(s) selecionado(s)
                </p>
              </div>
            )}

            <div className="flex justify-end gap-3">
              <button 
                onClick={() => {
                  setForm(prev => ({ 
                    ...prev, 
                    selectedServices: [],
                    value: '0'
                  }))
                }}
                className="px-4 py-2 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700"
              >
                Limpar Tudo
              </button>
              <button 
                onClick={() => setIsServicesModalOpen(false)}
                className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold"
              >
                Confirmar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default Projects
