import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Plus, Edit, Trash2, Save, X, Shield, AlertTriangle, GripVertical } from 'lucide-react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { getAdminApiBaseUrl, getAuthHeaders } from './api';
import { useAuth } from '../../contexts/AuthContext';

interface ModuleItem {
  moduleKey: string;
  moduleName: string;
  iconName?: string | null;
  description?: string | null;
  routePath?: string | null;
  isSystem?: boolean;
  isActive?: boolean;
  sortOrder?: number | null;
}

const defaultForm = {
  moduleKey: '',
  moduleName: '',
  iconName: 'Package',
  description: '',
  routePath: '',
  isActive: true
};

/* ─── Card arrastável ─── */
interface SortableCardProps {
  module: ModuleItem;
  isSuperAdmin: boolean;
  protectedModules: string[];
  superAdminModules: string[];
  onToggleActive: (key: string, currentActive: boolean) => void;
  onEdit: (module: ModuleItem) => void;
  onDelete: (key: string) => void;
  onAdminBlock: () => void;
}

const SortableModuleCard: React.FC<SortableCardProps> = ({
  module,
  isSuperAdmin,
  protectedModules,
  superAdminModules,
  onToggleActive,
  onEdit,
  onDelete,
  onAdminBlock,
}) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: module.moduleKey });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 10 : undefined,
  };

  const isLocked = superAdminModules.includes(module.moduleKey) && !isSuperAdmin;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`bg-white dark:bg-gray-800 rounded-xl shadow-md p-4 border-2 flex items-center gap-3 hover:-translate-y-0.5 transition-all duration-200 ${
        module.isSystem ? 'border-blue-300 dark:border-blue-700' : 'border-gray-200 dark:border-gray-700'
      } ${isDragging ? 'shadow-xl' : ''}`}
    >
      {/* Handle de drag */}
      <button
        {...attributes}
        {...listeners}
        className="cursor-grab active:cursor-grabbing text-gray-300 hover:text-gray-500 flex-shrink-0 p-1 rounded"
        title="Arrastar para reordenar"
      >
        <GripVertical className="h-5 w-5" />
      </button>

      {/* Conteúdo */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          {module.isSystem && <Shield className="h-4 w-4 text-blue-600 flex-shrink-0" />}
          <h3 className="text-base font-semibold text-gray-900 truncate">{module.moduleName}</h3>
          <span className={`px-2 py-0.5 text-xs rounded flex-shrink-0 ${
            module.isActive !== false ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
          }`}>
            {module.isActive !== false ? 'Ativo' : 'Inativo'}
          </span>
        </div>
        <div className="flex items-center gap-3 text-xs text-gray-500">
          <span className="font-mono bg-gray-100 px-1.5 py-0.5 rounded">{module.moduleKey}</span>
          {module.iconName && <span>{module.iconName}</span>}
          <span>{module.isSystem ? 'Sistema' : 'Customizado'}</span>
        </div>
        {module.description && (
          <p className="text-xs text-gray-500 mt-1 truncate">{module.description}</p>
        )}
      </div>

      {/* Ações */}
      <div className="flex items-center gap-1 flex-shrink-0">
        <button
          onClick={() => {
            if (isLocked) return;
            if (protectedModules.includes(module.moduleKey) && module.isActive !== false) {
              onAdminBlock();
              return;
            }
            onToggleActive(module.moduleKey, module.isActive !== false);
          }}
          disabled={isLocked}
          className="px-3 py-1.5 text-xs border rounded-lg hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap"
        >
          {module.isActive !== false ? 'Desativar' : 'Ativar'}
        </button>
        <button
          onClick={() => { if (!isLocked) onEdit(module); }}
          disabled={isLocked}
          className="p-1.5 text-blue-600 hover:text-blue-800 disabled:opacity-40 disabled:cursor-not-allowed"
          title="Editar"
        >
          <Edit className="h-4 w-4" />
        </button>
        {!module.isSystem && (
          <button
            onClick={() => onDelete(module.moduleKey)}
            className="p-1.5 text-red-600 hover:text-red-800"
            title="Deletar"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  );
};

/* ─── Componente principal ─── */
const ModuleManagement: React.FC = () => {
  const apiBase = useMemo(() => getAdminApiBaseUrl(), []);
  const { user: currentUser } = useAuth();
  const [orderedModules, setOrderedModules] = useState<ModuleItem[]>([]);
  const [showModuleModal, setShowModuleModal] = useState(false);
  const [editingModule, setEditingModule] = useState<ModuleItem | null>(null);
  const [form, setForm] = useState(defaultForm);
  const [showAdminBlockModal, setShowAdminBlockModal] = useState(false);

  const PROTECTED_MODULES = ['admin', 'sessions', 'anomalies', 'security_alerts'];
  const SUPERADMIN_MODULES = ['sessions', 'anomalies', 'security_alerts'];
  const isSuperAdmin = currentUser?.role === 'superadmin';

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (showAdminBlockModal) setShowAdminBlockModal(false);
        else if (showModuleModal) { setShowModuleModal(false); setEditingModule(null); }
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [showAdminBlockModal, showModuleModal]);

  const loadModules = async () => {
    try {
      const response = await fetch(`${apiBase}/admin/modules`, { headers: getAuthHeaders() });
      const result = await response.json();
      if (result.success) {
        setOrderedModules(result.data || []);
      }
    } catch (err) {
      console.error('Erro ao carregar módulos:', err);
    }
  };

  useEffect(() => { loadModules(); }, []);

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = orderedModules.findIndex(m => m.moduleKey === active.id);
    const newIndex = orderedModules.findIndex(m => m.moduleKey === over.id);
    const newOrder = arrayMove(orderedModules, oldIndex, newIndex);

    setOrderedModules(newOrder); // otimista

    try {
      await fetch(`${apiBase}/admin/modules/reorder`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ keys: newOrder.map(m => m.moduleKey) })
      });
    } catch (err) {
      console.error('Erro ao salvar ordem:', err);
      loadModules(); // reverter em caso de erro
    }
  };

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
        <div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Gerenciar Módulos</h2>
          <p className="text-sm text-gray-500 mt-0.5">Arraste os cards para definir a ordem das abas na navegação</p>
        </div>
        <button
          onClick={() => { setEditingModule(null); setForm(defaultForm); setShowModuleModal(true); }}
          className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-blue-500 to-indigo-600 text-white rounded-xl hover:from-blue-600 hover:to-indigo-700 shadow-md shadow-blue-500/25 hover:-translate-y-0.5 transition-all duration-200"
        >
          <Plus className="h-5 w-5 mr-2" />
          Novo Módulo
        </button>
      </div>

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={orderedModules.map(m => m.moduleKey)} strategy={verticalListSortingStrategy}>
          <div className="flex flex-col gap-2">
            {orderedModules.map((module) => (
              <SortableModuleCard
                key={module.moduleKey}
                module={module}
                isSuperAdmin={isSuperAdmin}
                protectedModules={PROTECTED_MODULES}
                superAdminModules={SUPERADMIN_MODULES}
                onToggleActive={(key, active) => handleUpdateModule(key, { isActive: !active })}
                onEdit={openEditModal}
                onDelete={handleDeleteModule}
                onAdminBlock={() => setShowAdminBlockModal(true)}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>

      {/* Modal: bloqueio admin */}
      {showAdminBlockModal && createPortal(
        <div className="fixed inset-0 bg-gradient-to-br from-blue-900/50 to-indigo-900/50 backdrop-blur-sm flex items-center justify-center z-[10001] px-4" onClick={() => setShowAdminBlockModal(false)}>
          <div className="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="bg-gradient-to-r from-red-500 to-red-600 px-6 py-4 flex items-center gap-3">
              <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center flex-shrink-0">
                <AlertTriangle className="w-5 h-5 text-white" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-white">Ação bloqueada</h3>
                <p className="text-sm text-white/80">Módulo protegido pelo sistema</p>
              </div>
            </div>
            <div className="p-6">
              <p className="text-sm text-gray-700 dark:text-gray-300 mb-2">
                Este módulo não pode ser desativado pois é essencial para o funcionamento do sistema.
              </p>
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">
                Os módulos <strong>Admin</strong>, <strong>Sessões</strong>, <strong>Anomalias</strong> e <strong>Alertas de Segurança</strong> são protegidos e devem permanecer ativos.
              </p>
              <div className="flex justify-end">
                <button onClick={() => setShowAdminBlockModal(false)} className="px-6 py-2 bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 text-white rounded-xl font-medium shadow-lg shadow-red-500/25 hover:-translate-y-0.5 transition-all duration-200">
                  Entendido
                </button>
              </div>
            </div>
          </div>
        </div>
      , document.body)}

      {/* Modal: criar/editar módulo */}
      {showModuleModal && createPortal(
        <div className="fixed inset-0 bg-gradient-to-br from-blue-900/50 to-indigo-900/50 backdrop-blur-sm flex items-center justify-center z-[10001]" onClick={() => { setShowModuleModal(false); setEditingModule(null); }}>
          <div className="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="bg-gradient-to-r from-blue-500 to-indigo-600 px-6 py-4 flex items-center justify-between flex-shrink-0">
              <h3 className="text-lg font-bold text-white">{editingModule ? 'Editar Módulo' : 'Novo Módulo'}</h3>
              <button onClick={() => { setShowModuleModal(false); setEditingModule(null); }} className="text-white/80 hover:text-white hover:bg-white/20 rounded-lg p-1.5 transition-all duration-200"><X className="h-5 w-5" /></button>
            </div>
            <div className="p-6 space-y-4 overflow-y-auto">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Nome</label>
                <input type="text" placeholder="Nome do módulo" value={form.moduleName} onChange={(e) => setForm({ ...form, moduleName: e.target.value })} className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 dark:text-gray-100 transition-all duration-200" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Key (única)</label>
                <input type="text" placeholder="key-do-modulo" value={form.moduleKey} onChange={(e) => setForm({ ...form, moduleKey: e.target.value.toLowerCase().replace(/\s+/g, '-') })} className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 dark:text-gray-100 disabled:opacity-60 transition-all duration-200" disabled={!!editingModule} />
                {editingModule && <p className="text-xs text-gray-500 mt-1">A key não pode ser alterada</p>}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Ícone (Lucide)</label>
                <select value={form.iconName} onChange={(e) => setForm({ ...form, iconName: e.target.value })} className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 dark:text-gray-100 transition-all duration-200">
                  {commonIcons.map((icon) => <option key={icon} value={icon}>{icon}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Descrição</label>
                <textarea placeholder="Descrição do módulo" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 dark:text-gray-100 transition-all duration-200" rows={3} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Rota (opcional)</label>
                <input type="text" placeholder="/rota-customizada" value={form.routePath} onChange={(e) => setForm({ ...form, routePath: e.target.value })} className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 dark:text-gray-100 transition-all duration-200" />
              </div>
              <div className="flex items-center">
                <input type="checkbox" id="isActiveModule" checked={form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} className="mr-2" />
                <label htmlFor="isActiveModule" className="text-sm text-gray-700 dark:text-gray-300">Módulo ativo</label>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button onClick={() => { setShowModuleModal(false); setEditingModule(null); }} className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 font-medium transition-all duration-200">Cancelar</button>
                <button onClick={editingModule ? handleSaveEdit : handleCreateModule} className="px-4 py-2 bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 text-white rounded-xl shadow-lg shadow-blue-500/25 hover:-translate-y-0.5 transition-all duration-200 font-semibold">
                  <Save className="inline h-4 w-4 mr-1" />
                  {editingModule ? 'Salvar' : 'Criar'}
                </button>
              </div>
            </div>
          </div>
        </div>
      , document.body)}
    </div>
  );
};

export default ModuleManagement;
