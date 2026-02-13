import { useEffect, useMemo, useState } from 'react';
import { Plus, Edit, Trash2, Save, X, Shield } from 'lucide-react';
import { getAdminApiBaseUrl, getAuthHeaders } from './api';

interface ModuleItem {
  moduleKey: string;
  moduleName: string;
  iconName?: string | null;
  description?: string | null;
  routePath?: string | null;
  isSystem?: boolean;
  isActive?: boolean;
}

const defaultForm = {
  moduleKey: '',
  moduleName: '',
  iconName: 'Package',
  description: '',
  routePath: '',
  isActive: true
};

const ModuleManagement: React.FC = () => {
  const apiBase = useMemo(() => getAdminApiBaseUrl(), []);
  const [modules, setModules] = useState<ModuleItem[]>([]);
  const [showModuleModal, setShowModuleModal] = useState(false);
  const [editingModule, setEditingModule] = useState<ModuleItem | null>(null);
  const [form, setForm] = useState(defaultForm);

  const loadModules = async () => {
    try {
      const response = await fetch(`${apiBase}/admin/modules`, { headers: getAuthHeaders() });
      const result = await response.json();
      if (result.success) {
        setModules(result.data || []);
      }
    } catch (err) {
      console.error('Erro ao carregar módulos:', err);
    }
  };

  useEffect(() => {
    loadModules();
  }, []);

  const openEditModal = (module: ModuleItem) => {
    setEditingModule(module);
    setForm({
      moduleKey: module.moduleKey,
      moduleName: module.moduleName,
      iconName: module.iconName || 'Package',
      description: module.description || '',
      routePath: module.routePath || '',
      isActive: module.isActive !== false
    });
    setShowModuleModal(true);
  };

  const handleCreateModule = async () => {
    try {
      const response = await fetch(`${apiBase}/admin/modules`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          moduleName: form.moduleName,
          moduleKey: form.moduleKey,
          iconName: form.iconName,
          description: form.description,
          routePath: form.routePath || null,
          isActive: form.isActive
        })
      });
      const result = await response.json();
      if (result.success) {
        setShowModuleModal(false);
        setForm(defaultForm);
        loadModules();
      } else {
        alert(result.error || 'Erro ao criar módulo');
      }
    } catch (err) {
      console.error('Erro ao criar módulo:', err);
      alert('Erro ao criar módulo');
    }
  };

  const handleUpdateModule = async (moduleKey: string, updates: Partial<ModuleItem>) => {
    try {
      const response = await fetch(`${apiBase}/admin/modules/${moduleKey}`, {
        method: 'PUT',
        headers: getAuthHeaders(),
        body: JSON.stringify(updates)
      });
      const result = await response.json();
      if (result.success) {
        loadModules();
      } else {
        alert(result.error || 'Erro ao atualizar módulo');
      }
    } catch (err) {
      console.error('Erro ao atualizar módulo:', err);
      alert('Erro ao atualizar módulo');
    }
  };

  const handleDeleteModule = async (moduleKey: string) => {
    if (!confirm('Tem certeza que deseja deletar este módulo?')) return;
    try {
      const response = await fetch(`${apiBase}/admin/modules/${moduleKey}`, {
        method: 'DELETE',
        headers: getAuthHeaders()
      });
      const result = await response.json();
      if (result.success) {
        loadModules();
      } else {
        alert(result.error || 'Erro ao deletar módulo');
      }
    } catch (err) {
      console.error('Erro ao deletar módulo:', err);
      alert('Erro ao deletar módulo');
    }
  };

  const handleSaveEdit = async () => {
    if (!editingModule) return;
    await handleUpdateModule(editingModule.moduleKey, {
      moduleName: form.moduleName,
      iconName: form.iconName,
      description: form.description,
      routePath: form.routePath || null,
      isActive: form.isActive
    });
    setShowModuleModal(false);
    setEditingModule(null);
    setForm(defaultForm);
  };

  const commonIcons = ['Home', 'DollarSign', 'Package', 'Users', 'BarChart3', 'Target', 'Shield', 'Settings', 'Activity', 'TrendingUp'];

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-blue-900">Gerenciar Módulos</h2>
        <button
          onClick={() => {
            setEditingModule(null);
            setForm(defaultForm);
            setShowModuleModal(true);
          }}
          className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          <Plus className="h-5 w-5 mr-2" />
          Novo Módulo
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {modules.map((module) => (
          <div
            key={module.moduleKey}
            className={`bg-white rounded-lg shadow p-6 border-2 ${
              module.isSystem ? 'border-blue-300' : 'border-gray-200'
            }`}
          >
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-2">
                {module.isSystem && <Shield className="h-5 w-5 text-blue-600" />}
                <h3 className="text-lg font-semibold text-gray-900">{module.moduleName}</h3>
              </div>
              <span className={`px-2 py-1 text-xs rounded ${
                module.isActive !== false ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
              }`}>
                {module.isActive !== false ? 'Ativo' : 'Inativo'}
              </span>
            </div>

            <div className="space-y-2 mb-4">
              <div>
                <span className="text-sm font-medium text-gray-600">Key:</span>
                <span className="ml-2 text-sm text-gray-900 font-mono">{module.moduleKey}</span>
              </div>
              <div>
                <span className="text-sm font-medium text-gray-600">Ícone:</span>
                <span className="ml-2 text-sm text-gray-900">{module.iconName || '-'}</span>
              </div>
              {module.description && (
                <div>
                  <span className="text-sm text-gray-600">{module.description}</span>
                </div>
              )}
              <div>
                <span className="text-xs text-gray-500">
                  {module.isSystem ? 'Módulo do Sistema' : 'Módulo Customizado'}
                </span>
              </div>
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => handleUpdateModule(module.moduleKey, { isActive: !(module.isActive !== false) })}
                className="flex-1 px-3 py-2 text-sm border rounded-lg hover:bg-gray-50"
              >
                {module.isActive !== false ? 'Desativar' : 'Ativar'}
              </button>
              <button
                onClick={() => openEditModal(module)}
                className="px-3 py-2 text-sm text-blue-600 hover:text-blue-800"
                title="Editar"
              >
                <Edit className="h-4 w-4" />
              </button>
              {!module.isSystem && (
                <button
                  onClick={() => handleDeleteModule(module.moduleKey)}
                  className="px-3 py-2 text-sm text-red-600 hover:text-red-800"
                  title="Deletar"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {showModuleModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xl font-bold">
                {editingModule ? 'Editar Módulo' : 'Novo Módulo'}
              </h3>
              <button
                onClick={() => {
                  setShowModuleModal(false);
                  setEditingModule(null);
                }}
                className="text-gray-500 hover:text-gray-700"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nome</label>
                <input
                  type="text"
                  placeholder="Nome do módulo"
                  value={form.moduleName}
                  onChange={(e) => setForm({ ...form, moduleName: e.target.value })}
                  className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Key (única)</label>
                <input
                  type="text"
                  placeholder="key-do-modulo"
                  value={form.moduleKey}
                  onChange={(e) => setForm({ ...form, moduleKey: e.target.value.toLowerCase().replace(/\s+/g, '-') })}
                  className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  disabled={!!editingModule}
                />
                {editingModule && (
                  <p className="text-xs text-gray-500 mt-1">A key não pode ser alterada</p>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Ícone (Lucide)</label>
                <select
                  value={form.iconName}
                  onChange={(e) => setForm({ ...form, iconName: e.target.value })}
                  className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {commonIcons.map((icon) => (
                    <option key={icon} value={icon}>{icon}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Descrição</label>
                <textarea
                  placeholder="Descrição do módulo"
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  rows={3}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Rota (opcional)</label>
                <input
                  type="text"
                  placeholder="/rota-customizada"
                  value={form.routePath}
                  onChange={(e) => setForm({ ...form, routePath: e.target.value })}
                  className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="isActiveModule"
                  checked={form.isActive}
                  onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
                  className="mr-2"
                />
                <label htmlFor="isActiveModule" className="text-sm text-gray-700">Módulo ativo</label>
              </div>
              <div className="flex justify-end space-x-2 pt-4">
                <button
                  onClick={() => {
                    setShowModuleModal(false);
                    setEditingModule(null);
                  }}
                  className="px-4 py-2 border rounded-lg hover:bg-gray-50"
                >
                  Cancelar
                </button>
                <button
                  onClick={editingModule ? handleSaveEdit : handleCreateModule}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                >
                  <Save className="inline h-4 w-4 mr-1" />
                  {editingModule ? 'Salvar' : 'Criar'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ModuleManagement;
