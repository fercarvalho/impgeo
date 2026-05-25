// =============================================================================
// RoleDefaultsManagement — gestão das funções (roles) e seus padrões
// =============================================================================
//
// Aba "Padrões de Função" do painel Admin (só superadmin).
//   - Lista todas as funções (5 do sistema + custom) dinâmicamente do banco.
//   - Edita matriz de defaults por função.
//   - Cria funções novas (zerada ou clonando de outra existente).
//   - Edita label/descrição de qualquer função (a key é imutável).
//   - Exclui funções custom (bloqueia se houver users; oferece migração).
// =============================================================================

import { useState, useEffect, useCallback, useMemo } from 'react';
import { Save, RotateCcw, AlertTriangle, Loader2, CheckCircle, Plus, Pencil, Trash2, X, ChevronRight, Users as UsersIcon } from 'lucide-react';
import PermissionsMatrix, { type ModulePermission } from './PermissionsMatrix';
import { useAuth } from '@/contexts/AuthContext';
import { getAdminApiBaseUrl, getAuthHeaders } from './api';

interface Role {
  key: string;
  label: string;
  description: string | null;
  isSystem: boolean;
  sortOrder: number;
}

interface RoleUsage {
  role: string;
  label: string;
  users: Array<{ id: string; username: string; firstName?: string | null; lastName?: string | null }>;
}

const API_BASE_URL = getAdminApiBaseUrl();

const fetchOpts = (method: string = 'GET', body?: unknown) => ({
  method,
  headers: getAuthHeaders(),
  credentials: 'include' as RequestCredentials,
  ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
});

const RoleDefaultsManagement = () => {
  const { user } = useAuth();
  const isSuperadmin = (user as { role?: string } | null)?.role === 'superadmin';

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  const [roles, setRoles] = useState<Role[]>([]);
  const [activeRoleKey, setActiveRoleKey] = useState<string>('superadmin');
  // matrices: estado local (edição); serverSnapshot: o que está salvo.
  const [matrices, setMatrices] = useState<Record<string, ModulePermission[]>>({});
  const [serverSnapshot, setServerSnapshot] = useState<Record<string, ModulePermission[]>>({});

  // Modais
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditMetaModal, setShowEditMetaModal] = useState<Role | null>(null);
  const [showDeleteModal, setShowDeleteModal] = useState<{ role: Role; usage: RoleUsage | null } | null>(null);

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [rolesRes, defaultsRes] = await Promise.all([
        fetch(`${API_BASE_URL}/admin/roles`, fetchOpts()),
        fetch(`${API_BASE_URL}/admin/role-defaults`, fetchOpts()),
      ]);
      if (!rolesRes.ok) {
        const data = (await rolesRes.json().catch(() => ({}))) as { error?: string };
        setError(data.error || 'Erro ao carregar funções');
        return;
      }
      if (!defaultsRes.ok) {
        const data = (await defaultsRes.json().catch(() => ({}))) as { error?: string };
        setError(data.error || 'Erro ao carregar padrões');
        return;
      }
      const rolesData = (await rolesRes.json()) as { data: { roles: Role[] } };
      const defaultsData = (await defaultsRes.json()) as { data: { roles: Record<string, ModulePermission[]> } };

      setRoles(rolesData.data.roles);
      setMatrices(defaultsData.data.roles);
      setServerSnapshot(JSON.parse(JSON.stringify(defaultsData.data.roles)));

      // Se a role ativa não existe mais (foi deletada), pula pra primeira
      if (!rolesData.data.roles.some((r) => r.key === activeRoleKey)) {
        setActiveRoleKey(rolesData.data.roles[0]?.key || 'superadmin');
      }
    } catch {
      setError('Erro ao conectar com o servidor');
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (isSuperadmin) loadAll();
    else setLoading(false);
  }, [isSuperadmin, loadAll]);

  const activeRole = useMemo(() => roles.find((r) => r.key === activeRoleKey), [roles, activeRoleKey]);

  const isDirty = useCallback((key: string) => {
    return JSON.stringify(matrices[key] || []) !== JSON.stringify(serverSnapshot[key] || []);
  }, [matrices, serverSnapshot]);

  const handleMatrixChange = (key: string, next: ModulePermission[]) => {
    setMatrices((prev) => ({ ...prev, [key]: next }));
    setFeedback(null);
  };

  const handleSave = async (key: string) => {
    setSaving(true);
    setError(null);
    setFeedback(null);
    try {
      const permissions = (matrices[key] || [])
        .filter((p) => p.accessLevel === 'view' || p.accessLevel === 'edit')
        .map((p) => ({ moduleKey: p.moduleKey, accessLevel: p.accessLevel }));
      const response = await fetch(`${API_BASE_URL}/admin/role-defaults/${key}`, fetchOpts('PUT', { permissions }));
      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as { error?: string };
        setError(data.error || 'Erro ao salvar padrões');
        return;
      }
      setServerSnapshot((prev) => ({ ...prev, [key]: JSON.parse(JSON.stringify(matrices[key] || [])) }));
      setFeedback(`Padrões de ${roles.find((r) => r.key === key)?.label} salvos.`);
    } catch {
      setError('Erro ao conectar com o servidor');
    } finally {
      setSaving(false);
    }
  };

  const handleResetToOriginal = async (key: string) => {
    const role = roles.find((r) => r.key === key);
    if (!role) return;
    if (!role.isSystem) {
      setError('Apenas funções do sistema têm "padrão original" — para uma função custom, ajuste manualmente.');
      return;
    }
    if (!confirm(`Restaurar os padrões de ${role.label} para os valores originais? Isto sobrescreve as customizações salvas.`)) return;
    setSaving(true);
    setError(null);
    setFeedback(null);
    try {
      const response = await fetch(`${API_BASE_URL}/admin/role-defaults/${key}/reset`, fetchOpts('POST'));
      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as { error?: string };
        setError(data.error || 'Erro ao restaurar padrões');
        return;
      }
      await loadAll();
      setFeedback(`Padrões de ${role.label} restaurados ao valor original.`);
    } catch {
      setError('Erro ao conectar com o servidor');
    } finally {
      setSaving(false);
    }
  };

  // ── Delete (com fluxo de migração) ────────────────────────────────────────
  const openDeleteModal = async (role: Role) => {
    setError(null);
    try {
      const response = await fetch(`${API_BASE_URL}/admin/roles/${role.key}/usage`, fetchOpts());
      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as { error?: string };
        setError(data.error || 'Erro ao buscar uso da função');
        return;
      }
      const data = (await response.json()) as { data: RoleUsage };
      setShowDeleteModal({ role, usage: data.data });
    } catch {
      setError('Erro ao conectar com o servidor');
    }
  };

  if (!isSuperadmin) {
    return (
      <div className="p-6 text-center">
        <AlertTriangle className="h-10 w-10 mx-auto text-amber-500 mb-3" />
        <p className="text-gray-700 dark:text-gray-300">
          Apenas <strong>super administradores</strong> podem gerenciar funções.
        </p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center gap-3 text-gray-600 dark:text-gray-300">
        <Loader2 className="h-5 w-5 animate-spin" />
        Carregando funções...
      </div>
    );
  }

  const dirty = activeRole ? isDirty(activeRole.key) : false;

  return (
    <div className="space-y-4">
      {/* Cabeçalho */}
      <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-base font-bold text-amber-900 dark:text-amber-200 flex items-center gap-2 mb-1">
            <AlertTriangle className="h-5 w-5" />
            Padrões de função (defaults)
          </h2>
          <p className="text-sm text-amber-800 dark:text-amber-300">
            Estes valores definem as permissões que cada função recebe automaticamente ao criar um novo usuário ou
            resetar um existente. <strong>Não altera</strong> as permissões de usuários já configurados.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowCreateModal(true)}
          className="shrink-0 inline-flex items-center gap-2 px-3 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700"
        >
          <Plus className="h-4 w-4" /> Nova função
        </button>
      </div>

      {/* Feedbacks */}
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

      {/* Sub-tabs por role */}
      <div className="border-b border-gray-200 dark:border-gray-700">
        <div role="tablist" className="flex flex-wrap gap-1">
          {roles.map((role) => {
            const tabDirty = isDirty(role.key);
            return (
              <button
                key={role.key}
                role="tab"
                aria-selected={activeRoleKey === role.key}
                onClick={() => setActiveRoleKey(role.key)}
                className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${
                  activeRoleKey === role.key
                    ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                    : 'border-transparent text-gray-600 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400'
                }`}
              >
                {role.label}
                {!role.isSystem && (
                  <span className="inline-flex items-center text-[10px] uppercase tracking-wide bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 px-1 py-0.5 rounded">
                    custom
                  </span>
                )}
                {tabDirty && (
                  <span className="inline-block w-2 h-2 rounded-full bg-amber-500" title="Mudanças não salvas" />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Conteúdo da role ativa */}
      {activeRole && (
        <div className="space-y-3">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div className="min-w-0 flex-1">
              <p className="text-sm text-gray-600 dark:text-gray-400">
                {activeRole.description || (activeRole.isSystem ? 'Função do sistema.' : 'Sem descrição.')}
              </p>
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                Chave interna: <code className="text-gray-600 dark:text-gray-300">{activeRole.key}</code>
                {activeRole.isSystem && <span className="ml-2 inline-flex items-center text-[10px] uppercase tracking-wide bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 px-1 py-0.5 rounded">sistema</span>}
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0 flex-wrap">
              <button
                type="button"
                onClick={() => setShowEditMetaModal(activeRole)}
                disabled={saving}
                className="inline-flex items-center gap-2 px-3 py-1.5 text-sm text-gray-700 dark:text-gray-200 bg-white dark:!bg-[#243040] border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-100 dark:hover:!bg-[#2d3f52] disabled:opacity-60"
              >
                <Pencil className="h-3.5 w-3.5" />
                Renomear/Descrição
              </button>
              {!activeRole.isSystem && (
                <button
                  type="button"
                  onClick={() => openDeleteModal(activeRole)}
                  disabled={saving}
                  className="inline-flex items-center gap-2 px-3 py-1.5 text-sm text-red-700 dark:text-red-300 bg-white dark:!bg-[#243040] border border-red-300 dark:border-red-700 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-60"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Excluir função
                </button>
              )}
              {activeRole.isSystem && (
                <button
                  type="button"
                  onClick={() => handleResetToOriginal(activeRole.key)}
                  disabled={saving}
                  className="inline-flex items-center gap-2 px-3 py-1.5 text-sm text-gray-700 dark:text-gray-200 bg-white dark:!bg-[#243040] border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-100 dark:hover:!bg-[#2d3f52] disabled:opacity-60"
                  title="Sobrescreve os padrões salvos com os valores hardcoded originais"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  Restaurar padrão original
                </button>
              )}
              <button
                type="button"
                onClick={() => handleSave(activeRole.key)}
                disabled={saving || !dirty}
                className="inline-flex items-center gap-2 px-4 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-60"
              >
                {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                {saving ? 'Salvando...' : (dirty ? 'Salvar mudanças' : 'Salvo')}
              </button>
            </div>
          </div>

          <PermissionsMatrix
            permissions={matrices[activeRole.key] || []}
            onChange={(next) => handleMatrixChange(activeRole.key, next)}
            onResetToDefaults={activeRole.isSystem ? () => handleResetToOriginal(activeRole.key) : async () => { setError('Funções custom não têm "padrão original" — ajuste manualmente.'); }}
            isBusy={saving}
          />
        </div>
      )}

      {/* Modal: Criar nova função */}
      {showCreateModal && (
        <CreateRoleModal
          roles={roles}
          onClose={() => setShowCreateModal(false)}
          onCreated={async () => {
            setShowCreateModal(false);
            await loadAll();
            setFeedback('Nova função criada.');
          }}
          setError={setError}
        />
      )}

      {/* Modal: Editar meta (label/descrição) */}
      {showEditMetaModal && (
        <EditRoleMetaModal
          role={showEditMetaModal}
          onClose={() => setShowEditMetaModal(null)}
          onUpdated={async () => {
            setShowEditMetaModal(null);
            await loadAll();
            setFeedback('Função atualizada.');
          }}
          setError={setError}
        />
      )}

      {/* Modal: Excluir função */}
      {showDeleteModal && (
        <DeleteRoleModal
          role={showDeleteModal.role}
          usage={showDeleteModal.usage}
          otherRoles={roles.filter((r) => r.key !== showDeleteModal.role.key)}
          onClose={() => setShowDeleteModal(null)}
          onDone={async () => {
            setShowDeleteModal(null);
            await loadAll();
            setFeedback(`Função "${showDeleteModal.role.label}" excluída.`);
          }}
          setError={setError}
        />
      )}
    </div>
  );
};

// ─── Modais ───────────────────────────────────────────────────────────────────

const slugify = (input: string) => input.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 50);

const CreateRoleModal: React.FC<{
  roles: Role[];
  onClose: () => void;
  onCreated: () => void | Promise<void>;
  setError: (e: string | null) => void;
}> = ({ roles, onClose, onCreated, setError }) => {
  const [label, setLabel] = useState('');
  const [key, setKey] = useState('');
  const [description, setDescription] = useState('');
  const [keyEdited, setKeyEdited] = useState(false);
  // 'blank' ou key de outra role pra clonar
  const [initialMatrix, setInitialMatrix] = useState<'blank' | string>('blank');
  const [submitting, setSubmitting] = useState(false);

  const handleLabelChange = (value: string) => {
    setLabel(value);
    if (!keyEdited) setKey(slugify(value));
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!label.trim() || !key.trim()) {
      setError('Preencha label e chave.');
      return;
    }
    if (!/^[a-z][a-z0-9_]*$/.test(key)) {
      setError('Chave inválida — use só letras minúsculas, números e _ (deve começar com letra).');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const body: Record<string, unknown> = { key: key.trim(), label: label.trim() };
      if (description.trim()) body.description = description.trim();
      if (initialMatrix !== 'blank') body.cloneFromRole = initialMatrix;
      const response = await fetch(`${API_BASE_URL}/admin/roles`, fetchOpts('POST', body));
      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as { error?: string };
        setError(data.error || 'Erro ao criar função');
        return;
      }
      await onCreated();
    } catch {
      setError('Erro ao conectar com o servidor');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 bg-gradient-to-br from-blue-900/50 to-indigo-900/50 backdrop-blur-sm flex items-center justify-center z-[10001] p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        className="bg-white dark:!bg-[#243040] rounded-lg w-full max-w-xl max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-center px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">Nova função</h2>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600" aria-label="Fechar">
            <X className="h-6 w-6" />
          </button>
        </div>
        <form onSubmit={submit} className="px-6 py-5 space-y-5">
          <div>
            <label htmlFor="role-label" className="block text-sm font-semibold text-gray-700 dark:text-gray-200 mb-1">Nome exibido *</label>
            <input
              id="role-label"
              type="text"
              value={label}
              onChange={(e) => handleLabelChange(e.target.value)}
              placeholder="Ex: Supervisor de Vendas"
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-[#1f2937] text-gray-900 dark:text-gray-100"
              required
            />
          </div>
          <div>
            <label htmlFor="role-key" className="block text-sm font-semibold text-gray-700 dark:text-gray-200 mb-1">Chave interna *</label>
            <input
              id="role-key"
              type="text"
              value={key}
              onChange={(e) => { setKey(e.target.value.toLowerCase()); setKeyEdited(true); }}
              placeholder="supervisor_vendas"
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-[#1f2937] font-mono text-sm text-gray-900 dark:text-gray-100"
              required
            />
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">snake_case minúsculo. Imutável depois de criada.</p>
          </div>
          <div>
            <label htmlFor="role-desc" className="block text-sm font-semibold text-gray-700 dark:text-gray-200 mb-1">Descrição (opcional)</label>
            <textarea
              id="role-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              placeholder="Curta descrição do papel desta função."
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-[#1f2937] text-sm text-gray-900 dark:text-gray-100"
            />
          </div>

          <fieldset>
            <legend className="block text-sm font-semibold text-gray-700 dark:text-gray-200 mb-2">Matriz inicial</legend>
            <div className="grid grid-cols-1 gap-2">
              <label className={`flex items-start gap-3 p-3 border-2 rounded-lg cursor-pointer transition-colors ${initialMatrix === 'blank' ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/30' : 'border-gray-200 dark:border-gray-600 hover:border-blue-300'}`}>
                <input type="radio" name="initial" value="blank" checked={initialMatrix === 'blank'} onChange={() => setInitialMatrix('blank')} className="mt-1" />
                <div>
                  <div className="font-medium text-gray-900 dark:text-gray-100">Começar zerada</div>
                  <div className="text-xs text-gray-500 dark:text-gray-400">Função nasce sem nenhuma permissão. Você ajusta tudo manualmente depois.</div>
                </div>
              </label>
              <label className={`flex items-start gap-3 p-3 border-2 rounded-lg cursor-pointer transition-colors ${initialMatrix !== 'blank' ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/30' : 'border-gray-200 dark:border-gray-600 hover:border-blue-300'}`}>
                <input
                  type="radio"
                  name="initial"
                  value="clone"
                  checked={initialMatrix !== 'blank'}
                  onChange={() => setInitialMatrix(roles.find((r) => r.key !== key)?.key || roles[0].key)}
                  className="mt-1"
                />
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-gray-900 dark:text-gray-100">Clonar de uma função existente</div>
                  <div className="text-xs text-gray-500 dark:text-gray-400 mb-2">Copia toda a matriz de outra função para servir de base.</div>
                  {initialMatrix !== 'blank' && (
                    <select
                      value={initialMatrix}
                      onChange={(e) => setInitialMatrix(e.target.value)}
                      className="w-full px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-[#1f2937] text-gray-900 dark:text-gray-100"
                    >
                      {roles.map((r) => (
                        <option key={r.key} value={r.key}>{r.label} ({r.key})</option>
                      ))}
                    </select>
                  )}
                </div>
              </label>
            </div>
          </fieldset>

          <div className="flex justify-end gap-3 pt-2 border-t border-gray-200 dark:border-gray-700">
            <button type="button" onClick={onClose} className="px-4 py-2 text-gray-700 dark:text-gray-200 bg-gray-100 dark:!bg-[#2d3f52] rounded-lg hover:bg-gray-200 dark:hover:!bg-[#354b60]">Cancelar</button>
            <button type="submit" disabled={submitting} className="px-5 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2 disabled:opacity-70">
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              {submitting ? 'Criando...' : 'Criar função'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

const EditRoleMetaModal: React.FC<{
  role: Role;
  onClose: () => void;
  onUpdated: () => void | Promise<void>;
  setError: (e: string | null) => void;
}> = ({ role, onClose, onUpdated, setError }) => {
  const [label, setLabel] = useState(role.label);
  const [description, setDescription] = useState(role.description || '');
  const [submitting, setSubmitting] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch(`${API_BASE_URL}/admin/roles/${role.key}`, fetchOpts('PUT', { label, description }));
      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as { error?: string };
        setError(data.error || 'Erro ao atualizar');
        return;
      }
      await onUpdated();
    } catch {
      setError('Erro ao conectar com o servidor');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-gradient-to-br from-blue-900/50 to-indigo-900/50 backdrop-blur-sm flex items-center justify-center z-[10001] p-4" onClick={onClose}>
      <div role="dialog" aria-modal="true" className="bg-white dark:!bg-[#243040] rounded-lg w-full max-w-md" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between items-center px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">Editar função</h2>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600" aria-label="Fechar"><X className="h-6 w-6" /></button>
        </div>
        <form onSubmit={submit} className="px-6 py-5 space-y-4">
          <div>
            <p className="text-xs text-gray-500 dark:text-gray-400">Chave (imutável): <code className="text-gray-700 dark:text-gray-200">{role.key}</code></p>
          </div>
          <div>
            <label htmlFor="meta-label" className="block text-sm font-semibold text-gray-700 dark:text-gray-200 mb-1">Nome exibido *</label>
            <input id="meta-label" type="text" value={label} onChange={(e) => setLabel(e.target.value)} required className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-[#1f2937] text-gray-900 dark:text-gray-100" />
          </div>
          <div>
            <label htmlFor="meta-desc" className="block text-sm font-semibold text-gray-700 dark:text-gray-200 mb-1">Descrição</label>
            <textarea id="meta-desc" value={description} onChange={(e) => setDescription(e.target.value)} rows={2} className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-[#1f2937] text-sm text-gray-900 dark:text-gray-100" />
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
    </div>
  );
};

const DeleteRoleModal: React.FC<{
  role: Role;
  usage: RoleUsage | null;
  otherRoles: Role[];
  onClose: () => void;
  onDone: () => void | Promise<void>;
  setError: (e: string | null) => void;
}> = ({ role, usage, otherRoles, onClose, onDone, setError }) => {
  const [migrateTo, setMigrateTo] = useState<string>(otherRoles[0]?.key || '');
  const [resetPermissions, setResetPermissions] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const hasUsers = (usage?.users.length || 0) > 0;

  const doMigrateAndDelete = async () => {
    if (!migrateTo) { setError('Escolha uma função de destino para os usuários.'); return; }
    setSubmitting(true);
    setError(null);
    try {
      // 1. Migra usuários
      const migrateRes = await fetch(`${API_BASE_URL}/admin/roles/${role.key}/migrate-users`, fetchOpts('POST', { toKey: migrateTo, resetPermissions }));
      if (!migrateRes.ok) {
        const data = (await migrateRes.json().catch(() => ({}))) as { error?: string };
        setError(data.error || 'Erro ao migrar usuários');
        return;
      }
      // 2. Tenta deletar
      const delRes = await fetch(`${API_BASE_URL}/admin/roles/${role.key}`, fetchOpts('DELETE'));
      if (!delRes.ok) {
        const data = (await delRes.json().catch(() => ({}))) as { error?: string };
        setError(data.error || 'Erro ao excluir');
        return;
      }
      await onDone();
    } catch {
      setError('Erro ao conectar com o servidor');
    } finally {
      setSubmitting(false);
    }
  };

  const doDeleteOnly = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch(`${API_BASE_URL}/admin/roles/${role.key}`, fetchOpts('DELETE'));
      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as { error?: string };
        setError(data.error || 'Erro ao excluir');
        return;
      }
      await onDone();
    } catch {
      setError('Erro ao conectar com o servidor');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-gradient-to-br from-blue-900/50 to-indigo-900/50 backdrop-blur-sm flex items-center justify-center z-[10001] p-4" onClick={onClose}>
      <div role="dialog" aria-modal="true" className="bg-white dark:!bg-[#243040] rounded-lg w-full max-w-xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between items-center px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-xl font-bold text-red-700 dark:text-red-300 flex items-center gap-2"><Trash2 className="h-5 w-5" /> Excluir função</h2>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600" aria-label="Fechar"><X className="h-6 w-6" /></button>
        </div>
        <div className="px-6 py-5 space-y-4">
          <p className="text-sm text-gray-700 dark:text-gray-200">
            Vai excluir a função <strong>{role.label}</strong> (<code className="text-xs">{role.key}</code>).
          </p>

          {!hasUsers && (
            <div className="bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-lg p-3 text-sm text-emerald-800 dark:text-emerald-300 flex items-center gap-2">
              <CheckCircle className="h-4 w-4" />
              Nenhum usuário usa esta função — pode excluir com segurança.
            </div>
          )}

          {hasUsers && (
            <>
              <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-3">
                <div className="text-sm font-medium text-amber-900 dark:text-amber-200 flex items-center gap-2 mb-2">
                  <UsersIcon className="h-4 w-4" />
                  {usage?.users.length} usuário(s) ainda usam esta função
                </div>
                <ul className="text-xs text-amber-800 dark:text-amber-300 space-y-0.5 max-h-32 overflow-y-auto">
                  {usage?.users.map((u) => (
                    <li key={u.id}>• <strong>{u.username}</strong>{u.firstName || u.lastName ? ` (${[u.firstName, u.lastName].filter(Boolean).join(' ')})` : ''}</li>
                  ))}
                </ul>
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-200 mb-1">Migrar usuários para a função:</label>
                <select
                  value={migrateTo}
                  onChange={(e) => setMigrateTo(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-[#1f2937] text-sm text-gray-900 dark:text-gray-100"
                >
                  {otherRoles.map((r) => (
                    <option key={r.key} value={r.key}>{r.label} ({r.key})</option>
                  ))}
                </select>
              </div>

              <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-200">
                <input type="checkbox" checked={resetPermissions} onChange={(e) => setResetPermissions(e.target.checked)} />
                Resetar permissões granulares dos usuários migrados para os padrões da nova função
              </label>
            </>
          )}
        </div>

        <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-200 dark:border-gray-700">
          <button type="button" onClick={onClose} disabled={submitting} className="px-4 py-2 text-gray-700 dark:text-gray-200 bg-gray-100 dark:!bg-[#2d3f52] rounded-lg hover:bg-gray-200 dark:hover:!bg-[#354b60]">Cancelar</button>
          {!hasUsers && (
            <button type="button" onClick={doDeleteOnly} disabled={submitting} className="px-5 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 flex items-center gap-2 disabled:opacity-70">
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              {submitting ? 'Excluindo...' : 'Excluir'}
            </button>
          )}
          {hasUsers && (
            <button type="button" onClick={doMigrateAndDelete} disabled={submitting || !migrateTo} className="px-5 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 flex items-center gap-2 disabled:opacity-70">
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <ChevronRight className="h-4 w-4" />}
              {submitting ? 'Processando...' : 'Migrar e excluir'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default RoleDefaultsManagement;
