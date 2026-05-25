// =============================================================================
// RoleDefaultsManagement — gestão dos padrões por função (role)
// =============================================================================
//
// Aba "Padrões de Função" do painel Admin (visível só para superadmin).
// Permite editar a matriz de permissões DEFAULT que cada role recebe ao ser
// criada ou resetada — antes hardcoded em server/permissions/defaults.js,
// agora persistida em role_default_permissions (migration 043).
//
// UI: sub-tabs por role no topo. Para cada role, renderiza o componente
// PermissionsMatrix com a matriz atual, botão "Salvar" e botão "Restaurar
// padrão original".
// =============================================================================

import { useState, useEffect, useCallback } from 'react';
import { Save, RotateCcw, AlertTriangle, Loader2, CheckCircle } from 'lucide-react';
import PermissionsMatrix, { type ModulePermission } from './PermissionsMatrix';
import { useAuth } from '@/contexts/AuthContext';
import { getAdminApiBaseUrl, getAuthHeaders } from './api';

type RoleKey = 'superadmin' | 'admin' | 'manager' | 'user' | 'guest';

const ROLES: Array<{ key: RoleKey; label: string; description: string }> = [
  { key: 'superadmin', label: 'Super Administrador', description: 'Padrão para a função de mais alto nível — controla tudo do sistema.' },
  { key: 'admin',      label: 'Administrador',       description: 'Padrão para administradores normais.' },
  { key: 'manager',    label: 'Gerente',             description: 'Padrão para gerentes (intermediário entre Admin e Usuário).' },
  { key: 'user',       label: 'Usuário',             description: 'Padrão para usuários comuns.' },
  { key: 'guest',      label: 'Convidado',           description: 'Padrão para visitantes em modo leitura.' },
];

const API_BASE_URL = getAdminApiBaseUrl();

interface RoleDefaultsResponse {
  success: boolean;
  data?: {
    roles: Record<RoleKey, ModulePermission[]>;
  };
  error?: string;
}

const RoleDefaultsManagement = () => {
  const { user } = useAuth();
  const isSuperadmin = (user as { role?: string } | null)?.role === 'superadmin';

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [activeRole, setActiveRole] = useState<RoleKey>('superadmin');
  // Matriz por role. Edição é local; só sobe pro servidor quando o admin
  // clica Salvar.
  const [matrices, setMatrices] = useState<Record<RoleKey, ModulePermission[]>>({
    superadmin: [], admin: [], manager: [], user: [], guest: [],
  });
  // Snapshot pra detectar "dirty" (mudanças não salvas)
  const [serverSnapshot, setServerSnapshot] = useState<Record<RoleKey, ModulePermission[]>>({
    superadmin: [], admin: [], manager: [], user: [], guest: [],
  });

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`${API_BASE_URL}/admin/role-defaults`, {
        headers: getAuthHeaders(),
        credentials: 'include',
      });
      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as { error?: string };
        setError(data.error || 'Erro ao carregar padrões');
        return;
      }
      const data = (await response.json()) as RoleDefaultsResponse;
      if (data.success && data.data) {
        setMatrices(data.data.roles);
        // Clone profundo pro snapshot
        setServerSnapshot(JSON.parse(JSON.stringify(data.data.roles)));
      }
    } catch {
      setError('Erro ao conectar com o servidor');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isSuperadmin) {
      loadAll();
    } else {
      setLoading(false);
    }
  }, [isSuperadmin, loadAll]);

  const isDirty = useCallback((role: RoleKey) => {
    return JSON.stringify(matrices[role]) !== JSON.stringify(serverSnapshot[role]);
  }, [matrices, serverSnapshot]);

  const handleMatrixChange = (role: RoleKey, next: ModulePermission[]) => {
    setMatrices((prev) => ({ ...prev, [role]: next }));
    setFeedback(null);
  };

  const handleSave = async (role: RoleKey) => {
    setSaving(true);
    setError(null);
    setFeedback(null);
    try {
      const permissions = matrices[role]
        .filter((p) => p.accessLevel === 'view' || p.accessLevel === 'edit')
        .map((p) => ({ moduleKey: p.moduleKey, accessLevel: p.accessLevel }));
      const response = await fetch(`${API_BASE_URL}/admin/role-defaults/${role}`, {
        method: 'PUT',
        headers: getAuthHeaders(),
        credentials: 'include',
        body: JSON.stringify({ permissions }),
      });
      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as { error?: string };
        setError(data.error || 'Erro ao salvar padrões');
        return;
      }
      // Atualiza snapshot
      setServerSnapshot((prev) => ({ ...prev, [role]: JSON.parse(JSON.stringify(matrices[role])) }));
      setFeedback(`Padrões de ${ROLES.find((r) => r.key === role)?.label} salvos.`);
    } catch {
      setError('Erro ao conectar com o servidor');
    } finally {
      setSaving(false);
    }
  };

  const handleResetToOriginal = async (role: RoleKey) => {
    if (!confirm(`Restaurar os padrões de ${ROLES.find((r) => r.key === role)?.label} para os valores originais? Isto sobrescreve as customizações salvas no banco.`)) {
      return;
    }
    setSaving(true);
    setError(null);
    setFeedback(null);
    try {
      const response = await fetch(`${API_BASE_URL}/admin/role-defaults/${role}/reset`, {
        method: 'POST',
        headers: getAuthHeaders(),
        credentials: 'include',
      });
      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as { error?: string };
        setError(data.error || 'Erro ao restaurar padrões');
        return;
      }
      // Recarrega tudo (matriz da role atualizada + snapshot)
      await loadAll();
      setFeedback(`Padrões de ${ROLES.find((r) => r.key === role)?.label} restaurados ao valor original.`);
    } catch {
      setError('Erro ao conectar com o servidor');
    } finally {
      setSaving(false);
    }
  };

  if (!isSuperadmin) {
    return (
      <div className="p-6 text-center">
        <AlertTriangle className="h-10 w-10 mx-auto text-amber-500 mb-3" />
        <p className="text-gray-700 dark:text-gray-300">
          Apenas <strong>super administradores</strong> podem editar padrões de função.
        </p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center gap-3 text-gray-600 dark:text-gray-300">
        <Loader2 className="h-5 w-5 animate-spin" />
        Carregando padrões...
      </div>
    );
  }

  const currentRole = ROLES.find((r) => r.key === activeRole);
  const dirty = isDirty(activeRole);

  return (
    <div className="space-y-4">
      {/* Cabeçalho */}
      <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-4">
        <h2 className="text-base font-bold text-amber-900 dark:text-amber-200 flex items-center gap-2 mb-1">
          <AlertTriangle className="h-5 w-5" />
          Padrões de função (defaults)
        </h2>
        <p className="text-sm text-amber-800 dark:text-amber-300">
          Estes valores definem as permissões que cada função recebe automaticamente ao criar um novo usuário ou
          resetar um existente. <strong>Não altera</strong> as permissões de usuários já configurados.
        </p>
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
          {ROLES.map((role) => {
            const tabDirty = isDirty(role.key);
            return (
              <button
                key={role.key}
                role="tab"
                aria-selected={activeRole === role.key}
                onClick={() => setActiveRole(role.key)}
                className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${
                  activeRole === role.key
                    ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                    : 'border-transparent text-gray-600 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400'
                }`}
              >
                {role.label}
                {tabDirty && (
                  <span className="inline-block w-2 h-2 rounded-full bg-amber-500" title="Mudanças não salvas" />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Conteúdo da role ativa */}
      {currentRole && (
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm text-gray-600 dark:text-gray-400">{currentRole.description}</p>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => handleResetToOriginal(activeRole)}
                disabled={saving}
                className="inline-flex items-center gap-2 px-3 py-1.5 text-sm text-gray-700 dark:text-gray-200 bg-white dark:!bg-[#243040] border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-100 dark:hover:!bg-[#2d3f52] disabled:opacity-60"
                title="Sobrescreve os padrões salvos com os valores originais hardcoded"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Restaurar padrão original
              </button>
              <button
                type="button"
                onClick={() => handleSave(activeRole)}
                disabled={saving || !dirty}
                className="inline-flex items-center gap-2 px-4 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-60"
              >
                {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                {saving ? 'Salvando...' : (dirty ? 'Salvar mudanças' : 'Salvo')}
              </button>
            </div>
          </div>

          <PermissionsMatrix
            permissions={matrices[activeRole]}
            onChange={(next) => handleMatrixChange(activeRole, next)}
            onResetToDefaults={() => handleResetToOriginal(activeRole)}
            isBusy={saving}
          />
        </div>
      )}
    </div>
  );
};

export default RoleDefaultsManagement;
