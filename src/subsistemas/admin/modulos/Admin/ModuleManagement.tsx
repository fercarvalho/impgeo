// =============================================================================
// ModuleManagement — gestão de módulos agrupados por subsistema (Fase 3.1)
// =============================================================================
//
// Cada subsistema vira um card colorido (paleta do manifest). Dentro de cada
// card, os módulos aparecem em ordem (sort_order do banco) com:
//   - Drag-and-drop interno (reorder local ao subsistema)
//   - Botão "Editar" (modal de metadados)
//   - Botão "Mover para..." (modal com dropdown dos 5 subsistemas)
//   - Toggle ativar/desativar
//
// Removidos da versão antiga (Fase 1.x):
//   - Criar módulo novo: dead code (todos os 21 são seeds via
//     getDefaultModulesCatalog em database-pg.js)
//   - Excluir módulo: idem
//   - Drag-and-drop GLOBAL: agora é local por subsistema (alinhado à 016)
// =============================================================================

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Edit, Save, X, AlertTriangle, GripVertical, ArrowRightLeft, Eye, EyeOff, Loader2, CheckCircle } from 'lucide-react';
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
import { useAuth } from '@/contexts/AuthContext';
import { SUBSYSTEMS, type SubsystemDefinition } from '@/subsistemas/manifest';
import Modal from '@/components/Modal';

interface ModuleItem {
  moduleKey: string;
  moduleName: string;
  iconName?: string | null;
  description?: string | null;
  routePath?: string | null;
  isSystem?: boolean;
  isActive?: boolean;
  sortOrder?: number | null;
  subsystemKey?: string | null;
}

const API_BASE_URL = getAdminApiBaseUrl();

const fetchOpts = (method: string = 'GET', body?: unknown) => ({
  method,
  headers: getAuthHeaders(),
  credentials: 'include' as RequestCredentials,
  ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
});

// Módulos com proteção extra (só superadmin pode desativar)
const SUPERADMIN_ONLY_MODULES = ['admin', 'sessions', 'anomalies', 'security_alerts'];

const ModuleManagement = () => {
  const { user } = useAuth();
  const currentRole = (user as { role?: string } | null)?.role || '';

  const [modules, setModules] = useState<ModuleItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [editingModule, setEditingModule] = useState<ModuleItem | null>(null);
  const [movingModule, setMovingModule] = useState<ModuleItem | null>(null);
  const [savingKey, setSavingKey] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const loadModules = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`${API_BASE_URL}/admin/modules`, fetchOpts());
      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as { error?: string };
        setError(data.error || 'Erro ao carregar módulos');
        return;
      }
      const data = (await response.json()) as { data: ModuleItem[] };
      setModules(Array.isArray(data.data) ? data.data : []);
    } catch {
      setError('Erro ao conectar com o servidor');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadModules();
  }, [loadModules]);

  // Agrupa módulos por subsistema, na ordem do manifesto.
  const grouped = useMemo(() => {
    return SUBSYSTEMS.map((subsystem) => {
      const items = modules
        .filter((m) => m.subsystemKey === subsystem.key)
        .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
      return { subsystem, items };
    });
  }, [modules]);

  // Módulos sem subsystem_key — não deveriam existir, mas mostramos pra
  // diagnóstico se houver.
  const orphan = useMemo(() => modules.filter((m) => !m.subsystemKey), [modules]);

  // ── Reorder dentro de um subsistema ─────────────────────────────────────
  const handleDragEnd = async (subsystemKey: string, event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const current = grouped.find((g) => g.subsystem.key === subsystemKey);
    if (!current) return;

    const oldIndex = current.items.findIndex((m) => m.moduleKey === active.id);
    const newIndex = current.items.findIndex((m) => m.moduleKey === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    const newItems = arrayMove(current.items, oldIndex, newIndex);
    // Optimistic update local
    setModules((prev) =>
      prev.map((m) => {
        if (m.subsystemKey !== subsystemKey) return m;
        const newPos = newItems.findIndex((x) => x.moduleKey === m.moduleKey);
        return newPos === -1 ? m : { ...m, sortOrder: newPos + 1 };
      }),
    );

    try {
      const response = await fetch(
        `${API_BASE_URL}/admin/modules/reorder`,
        fetchOpts('POST', { subsystemKey, keys: newItems.map((m) => m.moduleKey) }),
      );
      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as { error?: string };
        setError(data.error || 'Erro ao salvar ordem');
        await loadModules();
        return;
      }
      setFeedback('Ordem atualizada.');
    } catch {
      setError('Erro ao conectar com o servidor');
      await loadModules();
    }
  };

  // ── Toggle ativo/inativo ────────────────────────────────────────────────
  const handleToggleActive = async (m: ModuleItem) => {
    const newActive = !m.isActive;
    if (!newActive && SUPERADMIN_ONLY_MODULES.includes(m.moduleKey) && currentRole !== 'superadmin') {
      setError('Apenas super administradores podem desativar este módulo.');
      return;
    }
    setSavingKey(m.moduleKey);
    setError(null);
    try {
      const response = await fetch(
        `${API_BASE_URL}/admin/modules/${m.moduleKey}`,
        fetchOpts('PUT', { isActive: newActive }),
      );
      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as { error?: string };
        setError(data.error || 'Erro ao atualizar');
        return;
      }
      await loadModules();
      setFeedback(`Módulo ${m.moduleName} ${newActive ? 'ativado' : 'desativado'}.`);
    } catch {
      setError('Erro ao conectar com o servidor');
    } finally {
      setSavingKey(null);
    }
  };

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center gap-3 text-gray-600 dark:text-gray-300">
        <Loader2 className="h-5 w-5 animate-spin" />
        Carregando módulos...
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Cabeçalho */}
      <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
        <h2 className="text-base font-bold text-blue-900 dark:text-blue-200 mb-1">Catálogo de Módulos</h2>
        <p className="text-sm text-blue-800 dark:text-blue-300">
          Módulos agrupados pelos 5 subsistemas. Use o ícone <GripVertical className="inline h-3 w-3" /> para reordenar
          dentro de cada subsistema. Para editar metadados ou mover um módulo entre subsistemas, use os botões no card.
        </p>
      </div>

      {error && (
        <div role="alert" className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3 text-sm text-red-800 dark:text-red-300">
          {error}
        </div>
      )}
      {feedback && (
        <div className="bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-lg p-3 text-sm text-emerald-800 dark:text-emerald-300 flex items-center gap-2">
          <CheckCircle className="h-4 w-4" />
          {feedback}
        </div>
      )}

      {/* Órfãos (não deveria acontecer) */}
      {orphan.length > 0 && (
        <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-3 text-sm text-amber-900 dark:text-amber-200">
          <strong>⚠️ {orphan.length} módulo(s) sem subsistema:</strong>{' '}
          {orphan.map((m) => m.moduleKey).join(', ')}. Use "Mover para..." pra associá-los.
        </div>
      )}

      {/* Cards por subsistema */}
      {grouped.map(({ subsystem, items }) => (
        <SubsystemCard
          key={subsystem.key}
          subsystem={subsystem}
          items={items}
          currentRole={currentRole}
          sensors={sensors}
          savingKey={savingKey}
          onDragEnd={(e) => handleDragEnd(subsystem.key, e)}
          onEdit={setEditingModule}
          onMove={setMovingModule}
          onToggleActive={handleToggleActive}
        />
      ))}

      {editingModule && (
        <EditModuleModal
          module={editingModule}
          onClose={() => setEditingModule(null)}
          onSaved={async () => {
            setEditingModule(null);
            await loadModules();
            setFeedback('Módulo atualizado.');
          }}
          setError={setError}
        />
      )}

      {movingModule && (
        <MoveModuleModal
          module={movingModule}
          onClose={() => setMovingModule(null)}
          onMoved={async () => {
            setMovingModule(null);
            await loadModules();
            setFeedback('Módulo movido.');
          }}
          setError={setError}
        />
      )}
    </div>
  );
};

// ─── Subcomponentes ──────────────────────────────────────────────────────────

interface SubsystemCardProps {
  subsystem: SubsystemDefinition;
  items: ModuleItem[];
  currentRole: string;
  sensors: ReturnType<typeof useSensors>;
  savingKey: string | null;
  onDragEnd: (event: DragEndEvent) => void;
  onEdit: (m: ModuleItem) => void;
  onMove: (m: ModuleItem) => void;
  onToggleActive: (m: ModuleItem) => void;
}

const SubsystemCard: React.FC<SubsystemCardProps> = ({
  subsystem,
  items,
  currentRole,
  sensors,
  savingKey,
  onDragEnd,
  onEdit,
  onMove,
  onToggleActive,
}) => {
  return (
    <fieldset
      className={`border-l-4 ${subsystem.palette.accentBorder} bg-white dark:!bg-[#243040] rounded-r-lg border-y border-r border-gray-200 dark:border-gray-700 overflow-hidden`}
    >
      <legend className="sr-only">Módulos do subsistema {subsystem.name}</legend>
      <div className="flex items-center justify-between gap-3 px-4 py-2.5 bg-gray-50 dark:!bg-[#1f2937] border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center gap-3 min-w-0">
          <h3 className="font-semibold text-base text-gray-900 dark:text-gray-100 truncate">
            {subsystem.name}
          </h3>
          <span className="text-xs text-gray-500 dark:text-gray-400">
            {items.length} {items.length === 1 ? 'módulo' : 'módulos'}
          </span>
        </div>
      </div>

      {items.length === 0 ? (
        <p className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400 italic">
          Nenhum módulo neste subsistema.
        </p>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={items.map((m) => m.moduleKey)} strategy={verticalListSortingStrategy}>
            <ul className="divide-y divide-gray-100 dark:divide-gray-700">
              {items.map((m) => (
                <SortableModuleRow
                  key={m.moduleKey}
                  module={m}
                  currentRole={currentRole}
                  isSaving={savingKey === m.moduleKey}
                  onEdit={onEdit}
                  onMove={onMove}
                  onToggleActive={onToggleActive}
                />
              ))}
            </ul>
          </SortableContext>
        </DndContext>
      )}
    </fieldset>
  );
};

interface SortableModuleRowProps {
  module: ModuleItem;
  currentRole: string;
  isSaving: boolean;
  onEdit: (m: ModuleItem) => void;
  onMove: (m: ModuleItem) => void;
  onToggleActive: (m: ModuleItem) => void;
}

const SortableModuleRow: React.FC<SortableModuleRowProps> = ({ module: m, currentRole, isSaving, onEdit, onMove, onToggleActive }) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: m.moduleKey });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };
  const isProtected = SUPERADMIN_ONLY_MODULES.includes(m.moduleKey);
  const canToggle = !isProtected || currentRole === 'superadmin';
  const inactive = m.isActive === false;

  return (
    <li
      ref={setNodeRef}
      style={style}
      className={`flex items-center gap-3 px-4 py-2 hover:bg-gray-50 dark:hover:!bg-[#2d3f52] transition-colors ${inactive ? 'opacity-60' : ''}`}
    >
      <button
        type="button"
        {...attributes}
        {...listeners}
        className="text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 cursor-grab active:cursor-grabbing touch-none"
        aria-label="Arrastar para reordenar"
      >
        <GripVertical className="h-4 w-4" />
      </button>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{m.moduleName}</span>
          <code className="text-[11px] text-gray-400 dark:text-gray-500 truncate">({m.moduleKey})</code>
          {m.isSystem && (
            <span className="text-[10px] uppercase tracking-wide bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 px-1 py-0.5 rounded">
              sistema
            </span>
          )}
          {isProtected && (
            <span className="text-[10px] uppercase tracking-wide bg-rose-100 dark:bg-rose-900/40 text-rose-700 dark:text-rose-300 px-1 py-0.5 rounded">
              superadmin
            </span>
          )}
          {inactive && (
            <span className="text-[10px] uppercase tracking-wide bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 px-1 py-0.5 rounded">
              inativo
            </span>
          )}
        </div>
        {m.description && (
          <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{m.description}</p>
        )}
      </div>

      <div className="flex items-center gap-1 shrink-0">
        <button
          type="button"
          onClick={() => onEdit(m)}
          className="p-1.5 text-gray-500 hover:text-blue-600 dark:hover:text-blue-400 rounded transition-colors"
          aria-label="Editar metadados"
          title="Editar metadados"
        >
          <Edit className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => onMove(m)}
          className="p-1.5 text-gray-500 hover:text-indigo-600 dark:hover:text-indigo-400 rounded transition-colors"
          aria-label="Mover para outro subsistema"
          title="Mover para outro subsistema"
        >
          <ArrowRightLeft className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => onToggleActive(m)}
          disabled={isSaving || !canToggle}
          className={`p-1.5 rounded transition-colors disabled:opacity-50 ${inactive ? 'text-amber-600 hover:text-amber-700' : 'text-emerald-600 hover:text-emerald-700'}`}
          aria-label={inactive ? 'Ativar' : 'Desativar'}
          title={!canToggle ? 'Apenas super administradores podem alternar este módulo' : (inactive ? 'Ativar' : 'Desativar')}
        >
          {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : inactive ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
    </li>
  );
};

// ─── Modais ──────────────────────────────────────────────────────────────────

const EditModuleModal: React.FC<{
  module: ModuleItem;
  onClose: () => void;
  onSaved: () => void | Promise<void>;
  setError: (e: string | null) => void;
}> = ({ module: m, onClose, onSaved, setError }) => {
  const [form, setForm] = useState({
    moduleName: m.moduleName,
    iconName: m.iconName || '',
    description: m.description || '',
    routePath: m.routePath || '',
  });
  const [submitting, setSubmitting] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.moduleName.trim()) {
      setError('Nome do módulo é obrigatório.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch(
        `${API_BASE_URL}/admin/modules/${m.moduleKey}`,
        fetchOpts('PUT', {
          moduleName: form.moduleName.trim(),
          iconName: form.iconName.trim() || null,
          description: form.description.trim() || null,
          routePath: form.routePath.trim() || null,
        }),
      );
      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as { error?: string };
        setError(data.error || 'Erro ao salvar módulo');
        return;
      }
      await onSaved();
    } catch {
      setError('Erro ao conectar com o servidor');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal isOpen={true} onClose={onClose} ariaLabelledBy="edit-module-title">
      <div className="bg-white dark:!bg-[#243040] rounded-lg w-full max-w-xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between items-center px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <h2 id="edit-module-title" className="text-xl font-bold text-gray-900 dark:text-gray-100">Editar módulo</h2>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600" aria-label="Fechar"><X className="h-6 w-6" /></button>
        </div>
        <form onSubmit={submit} className="px-6 py-5 space-y-4">
          <div className="text-xs text-gray-500 dark:text-gray-400">
            Chave (imutável): <code className="text-gray-700 dark:text-gray-200">{m.moduleKey}</code>
          </div>
          <div>
            <label htmlFor="mod-name" className="block text-sm font-semibold text-gray-700 dark:text-gray-200 mb-1">Nome *</label>
            <input id="mod-name" type="text" value={form.moduleName} onChange={(e) => setForm({ ...form, moduleName: e.target.value })} required className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-[#1f2937] text-gray-900 dark:text-gray-100" />
          </div>
          <div>
            <label htmlFor="mod-icon" className="block text-sm font-semibold text-gray-700 dark:text-gray-200 mb-1">Ícone (Lucide)</label>
            <input id="mod-icon" type="text" value={form.iconName} onChange={(e) => setForm({ ...form, iconName: e.target.value })} placeholder="Ex: BarChart3" className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-[#1f2937] font-mono text-sm text-gray-900 dark:text-gray-100" />
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Nome exato de um ícone do <a href="https://lucide.dev/icons/" target="_blank" rel="noreferrer" className="text-blue-600 hover:underline">lucide.dev</a>.</p>
          </div>
          <div>
            <label htmlFor="mod-desc" className="block text-sm font-semibold text-gray-700 dark:text-gray-200 mb-1">Descrição</label>
            <textarea id="mod-desc" rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-[#1f2937] text-sm text-gray-900 dark:text-gray-100" />
          </div>
          <div>
            <label htmlFor="mod-route" className="block text-sm font-semibold text-gray-700 dark:text-gray-200 mb-1">Rota</label>
            <input id="mod-route" type="text" value={form.routePath} onChange={(e) => setForm({ ...form, routePath: e.target.value })} placeholder="Ex: transactions" className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-[#1f2937] font-mono text-sm text-gray-900 dark:text-gray-100" />
          </div>
          <div className="flex justify-end gap-3 pt-2 border-t border-gray-200 dark:border-gray-700">
            <button type="button" onClick={onClose} className="px-4 py-2 text-gray-700 dark:text-gray-200 bg-gray-100 dark:!bg-[#2d3f52] rounded-lg hover:bg-gray-200 dark:hover:!bg-[#354b60]">Cancelar</button>
            <button type="submit" disabled={submitting} className="px-5 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2 disabled:opacity-70">
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {submitting ? 'Salvando...' : 'Salvar'}
            </button>
          </div>
        </form>
      </div>
    </Modal>
  );
};

const MoveModuleModal: React.FC<{
  module: ModuleItem;
  onClose: () => void;
  onMoved: () => void | Promise<void>;
  setError: (e: string | null) => void;
}> = ({ module: m, onClose, onMoved, setError }) => {
  const currentSubsystemKey = m.subsystemKey || '';
  const targets = SUBSYSTEMS.filter((s) => s.key !== currentSubsystemKey);
  const [target, setTarget] = useState(targets[0]?.key || '');
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    if (!target) {
      setError('Escolha um subsistema de destino.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch(
        `${API_BASE_URL}/admin/modules/${m.moduleKey}`,
        fetchOpts('PUT', { subsystemKey: target }),
      );
      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as { error?: string };
        setError(data.error || 'Erro ao mover módulo');
        return;
      }
      await onMoved();
    } catch {
      setError('Erro ao conectar com o servidor');
    } finally {
      setSubmitting(false);
    }
  };

  const currentSubsystem = SUBSYSTEMS.find((s) => s.key === currentSubsystemKey);

  return (
    <Modal isOpen={true} onClose={onClose} ariaLabelledBy="move-module-title">
      <div className="bg-white dark:!bg-[#243040] rounded-lg w-full max-w-md" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between items-center px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <h2 id="move-module-title" className="text-xl font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
            <ArrowRightLeft className="h-5 w-5" />
            Mover módulo
          </h2>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600" aria-label="Fechar"><X className="h-6 w-6" /></button>
        </div>
        <div className="px-6 py-5 space-y-4">
          <div className="text-sm text-gray-700 dark:text-gray-200">
            Mover <strong>{m.moduleName}</strong> de <strong>{currentSubsystem?.name || '(órfão)'}</strong> para:
          </div>
          <div>
            <label htmlFor="move-target" className="block text-sm font-semibold text-gray-700 dark:text-gray-200 mb-1">Subsistema de destino</label>
            <select
              id="move-target"
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-[#1f2937] text-sm text-gray-900 dark:text-gray-100"
            >
              {SUBSYSTEMS.map((s) => (
                <option key={s.key} value={s.key} disabled={s.key === currentSubsystemKey}>
                  {s.name} {s.key === currentSubsystemKey ? '(atual)' : ''}
                </option>
              ))}
            </select>
          </div>
          <div className="text-xs text-gray-500 dark:text-gray-400 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded p-2">
            <AlertTriangle className="h-3.5 w-3.5 inline mr-1 text-amber-600" />
            O módulo será colocado no final da lista do subsistema destino. Você pode reordená-lo depois arrastando.
          </div>
        </div>
        <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-200 dark:border-gray-700">
          <button type="button" onClick={onClose} disabled={submitting} className="px-4 py-2 text-gray-700 dark:text-gray-200 bg-gray-100 dark:!bg-[#2d3f52] rounded-lg hover:bg-gray-200 dark:hover:!bg-[#354b60]">Cancelar</button>
          <button type="button" onClick={submit} disabled={submitting || !target} className="px-5 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2 disabled:opacity-70">
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRightLeft className="h-4 w-4" />}
            {submitting ? 'Movendo...' : 'Mover'}
          </button>
        </div>
      </div>
    </Modal>
  );
};

export default ModuleManagement;
