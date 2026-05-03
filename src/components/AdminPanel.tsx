import { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useAuth } from '../contexts/AuthContext';
import UserCreationTypeModal from './admin/UserCreationTypeModal';
import UserCreatedModal from './admin/UserCreatedModal';
import CadastroCompletoModal from './admin/CadastroCompletoModal';
import {
  UserPlus,
  Edit,
  Pencil,
  KeyRound,
  RotateCcw,
  Lock,
  Settings2,
  Trash2,
  X,
  Save,
  UserCircle2,
  Shield,
  Check
} from 'lucide-react';

type RoleType = 'superadmin' | 'admin' | 'user' | 'guest';

interface User {
  id: string;
  username: string;
  role: RoleType;
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  phone?: string | null;
  cpf?: string | null;
  birthDate?: string | null;
  gender?: string | null;
  address?: {
    cep?: string;
    street?: string;
    number?: string;
    complement?: string;
    neighborhood?: string;
    city?: string;
    state?: string;
  } | null;
  position?: string | null;
  isActive?: boolean;
  createdAt?: string | null;
  updatedAt?: string | null;
  permissoesLegais?: Record<string, boolean>;
}

interface ModuleOption {
  moduleKey: string;
  moduleName: string;
  enabled: boolean;
}

const SUPERADMIN_MODULES = ['sessions', 'anomalies', 'security_alerts'];

const getDefaultModulesForRole = (role: RoleType): string[] => {
  switch (role) {
    case 'superadmin':
      return ['dashboard', 'projects', 'services', 'reports', 'metas', 'projecao', 'transactions', 'clients', 'dre', 'acompanhamentos', 'admin', 'sessions', 'anomalies', 'security_alerts'];
    case 'admin':
      return ['dashboard', 'projects', 'services', 'reports', 'metas', 'projecao', 'transactions', 'clients', 'dre', 'acompanhamentos', 'admin'];
    case 'user':
      return ['dashboard', 'projects', 'services', 'reports', 'metas', 'projecao', 'transactions', 'clients', 'dre', 'acompanhamentos'];
    case 'guest':
      return ['dashboard', 'metas', 'reports', 'dre'];
    default:
      return [];
  }
};

const DEFAULT_CREATE_FORM = {
  username: '',
  role: 'user' as RoleType,
  isActive: true,
  modules: getDefaultModulesForRole('user')
};

interface AdminPanelProps {
  embedded?: boolean;
}

const AdminPanel: React.FC<AdminPanelProps> = ({ embedded = false }) => {
  const { user: currentUser, startImpersonation } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [showCreationTypeModal, setShowCreationTypeModal] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showCompleteModal, setShowCompleteModal] = useState(false);
  const [showUserCreatedModal, setShowUserCreatedModal] = useState(false);
  const [createdUserData, setCreatedUserData] = useState<{ username: string; email?: string; role: string; tempPassword?: string } | null>(null);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [showUsernameModal, setShowUsernameModal] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [showModulesModal, setShowModulesModal] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [roleLoadingId, setRoleLoadingId] = useState<string | null>(null);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [modulesLoadingId, setModulesLoadingId] = useState<string | null>(null);
  const [modulesSaving, setModulesSaving] = useState(false);
  const [temporaryPassword, setTemporaryPassword] = useState<{ username: string; value: string } | null>(null);
  const [modulesTargetUser, setModulesTargetUser] = useState<User | null>(null);
  const [moduleOptions, setModuleOptions] = useState<ModuleOption[]>([]);
  const [nameSortOrder, setNameSortOrder] = useState<'asc' | 'desc'>('asc');

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (showModulesModal) setShowModulesModal(false);
      else if (showPasswordModal) setShowPasswordModal(false);
      else if (showUsernameModal) setShowUsernameModal(false);
      else if (showProfileModal) setShowProfileModal(false);
      else if (showCreateModal) setShowCreateModal(false);
      else if (deleteConfirm) setDeleteConfirm(null);
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [showModulesModal, showPasswordModal, showUsernameModal, showProfileModal, showCreateModal, deleteConfirm]);

  const [createForm, setCreateForm] = useState(DEFAULT_CREATE_FORM);
  const [allModules, setAllModules] = useState<{ moduleKey: string; moduleName: string }[]>([]);
  const [profileForm, setProfileForm] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    cpf: '',
    birthDate: '',
    gender: '',
    position: '',
    address: {
      cep: '',
      street: '',
      number: '',
      complement: '',
      neighborhood: '',
      city: '',
      state: ''
    }
  });
  const [usernameForm, setUsernameForm] = useState({ username: '' });
  const [passwordForm, setPasswordForm] = useState({ password: '', confirmPassword: '' });
  const [permissoesLegaisForm, setPermissoesLegaisForm] = useState<Record<string, boolean>>({});

  const API_BASE_URL =
    (typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'))
      ? 'http://localhost:9001/api'
      : ((import.meta as any).env?.VITE_API_URL || '/api');

  useEffect(() => {
    if (currentUser?.role === 'admin' || currentUser?.role === 'superadmin') {
      loadUsers();
      fetch(`${API_BASE_URL}/admin/modules`, { headers: authHeaders() })
        .then(r => r.json())
        .then(d => { if (d.success) setAllModules(d.data || []); })
        .catch(() => {});
    }
  }, [currentUser]);

  const authHeaders = () => ({
    Authorization: `Bearer ${localStorage.getItem('authToken') || ''}`,
    'Content-Type': 'application/json'
  });

  const clearFeedback = () => {
    setError(null);
    setSuccessMessage(null);
  };

  const showSuccess = (message: string) => {
    setSuccessMessage(message);
    setTimeout(() => setSuccessMessage(null), 4000);
  };

  const sortedUsers = useMemo(() => {
    const list = [...users];
    list.sort((a, b) => {
      const comparison = a.username.localeCompare(b.username, 'pt-BR', { sensitivity: 'base' });
      return nameSortOrder === 'asc' ? comparison : -comparison;
    });
    return list;
  }, [users, nameSortOrder]);

  const loadUsers = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await fetch(`${API_BASE_URL}/users`, { headers: authHeaders() });
      const data = await response.json();

      if (!response.ok) {
        setError(data.error || 'Erro ao carregar usuários');
        return;
      }

      setUsers(data.data || []);
    } catch (err) {
      setError('Erro ao conectar com o servidor');
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    clearFeedback();
    if (!createForm.username.trim() || createForm.username.trim().length < 3) {
      setError('Nome de usuário deve ter pelo menos 3 caracteres');
      return;
    }
    if (createForm.modules.length === 0) {
      setError('Selecione pelo menos um módulo');
      return;
    }
    try {
      const response = await fetch(`${API_BASE_URL}/users`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({
          username: createForm.username.trim(),
          role: createForm.role,
          isActive: createForm.isActive,
          modules: createForm.modules
        })
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data.error || 'Erro ao criar usuário');
        return;
      }
      setShowCreateModal(false);
      setCreateForm(DEFAULT_CREATE_FORM);
      setCreatedUserData({ username: createForm.username.trim(), role: createForm.role, tempPassword: data.temporaryPassword });
      setShowUserCreatedModal(true);
      await loadUsers();
    } catch (err) {
      setError('Erro ao conectar com o servidor');
    }
  };

  const openProfileModal = (user: User) => {
    clearFeedback();
    setEditingUser(user);
    setPermissoesLegaisForm(user.permissoesLegais || {});
    setProfileForm({
      firstName: user.firstName || '',
      lastName: user.lastName || '',
      email: user.email || '',
      phone: user.phone || '',
      cpf: user.cpf || '',
      birthDate: user.birthDate || '',
      gender: user.gender || '',
      position: user.position || '',
      address: {
        cep: user.address?.cep || '',
        street: user.address?.street || '',
        number: user.address?.number || '',
        complement: user.address?.complement || '',
        neighborhood: user.address?.neighborhood || '',
        city: user.address?.city || '',
        state: user.address?.state || ''
      }
    });
    setShowProfileModal(true);
  };

  const openUsernameModal = (user: User) => {
    clearFeedback();
    setEditingUser(user);
    setUsernameForm({ username: user.username });
    setShowUsernameModal(true);
  };

  const openPasswordModal = (user: User) => {
    clearFeedback();
    setEditingUser(user);
    setPasswordForm({ password: '', confirmPassword: '' });
    setShowPasswordModal(true);
  };

  const openModulesModal = async (user: User) => {
    clearFeedback();
    setModulesLoadingId(user.id);
    try {
      const response = await fetch(`${API_BASE_URL}/users/${user.id}/modules`, {
        headers: authHeaders()
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data.error || 'Erro ao carregar módulos do usuário');
        return;
      }

      setModulesTargetUser(user);
      setModuleOptions(data.data || []);
      setShowModulesModal(true);
    } catch (error) {
      setError('Erro ao conectar com o servidor');
    } finally {
      setModulesLoadingId(null);
    }
  };

  const toggleModuleOption = (moduleKey: string) => {
    setModuleOptions((previous) =>
      previous.map((option) =>
        option.moduleKey === moduleKey ? { ...option, enabled: !option.enabled } : option
      )
    );
  };

  const handleSaveModules = async () => {
    if (!modulesTargetUser) return;
    clearFeedback();
    setModulesSaving(true);
    try {
      const selectedKeys = moduleOptions
        .filter((option) => option.enabled)
        .map((option) => option.moduleKey);

      const response = await fetch(`${API_BASE_URL}/users/${modulesTargetUser.id}/modules`, {
        method: 'PUT',
        headers: authHeaders(),
        body: JSON.stringify({ moduleKeys: selectedKeys })
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data.error || 'Erro ao salvar módulos do usuário');
        return;
      }

      showSuccess('Módulos de acesso atualizados com sucesso!');
      setShowModulesModal(false);
      setModulesTargetUser(null);
      setModuleOptions([]);
    } catch (error) {
      setError('Erro ao conectar com o servidor');
    } finally {
      setModulesSaving(false);
    }
  };

  const updateUser = async (userId: string, payload: Record<string, unknown>, successText: string) => {
    const response = await fetch(`${API_BASE_URL}/users/${userId}`, {
      method: 'PUT',
      headers: authHeaders(),
      body: JSON.stringify(payload)
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || 'Erro ao atualizar usuário');
    }
    showSuccess(successText);
    await loadUsers();
  };

  const handleProfileUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;

    clearFeedback();
    try {
      await updateUser(
        editingUser.id,
        {
          firstName: profileForm.firstName.trim() || null,
          lastName: profileForm.lastName.trim() || null,
          email: profileForm.email.trim() || null,
          phone: profileForm.phone.trim() || null,
          cpf: profileForm.cpf.trim() || null,
          birthDate: profileForm.birthDate || null,
          gender: profileForm.gender || null,
          position: profileForm.position.trim() || null,
          address: {
            cep: profileForm.address.cep.trim(),
            street: profileForm.address.street.trim(),
            number: profileForm.address.number.trim(),
            complement: profileForm.address.complement.trim(),
            neighborhood: profileForm.address.neighborhood.trim(),
            city: profileForm.address.city.trim(),
            state: profileForm.address.state.trim().toUpperCase()
          }
        },
        'Cadastro do usuário atualizado com sucesso!'
      );
      // Salvar permissões legais se superadmin editando admin
      if (currentUser?.role === 'superadmin' && (editingUser.role === 'admin')) {
        await fetch(`${API_BASE_URL}/admin/permissoes-legais/${editingUser.id}`, {
          method: 'PUT',
          headers: authHeaders(),
          body: JSON.stringify({ permissoes: permissoesLegaisForm }),
        }).catch(err => console.error('Erro ao salvar permissões legais:', err));
      }
      setShowProfileModal(false);
      setEditingUser(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao atualizar cadastro');
    }
  };

  const handleUsernameUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;
    clearFeedback();

    try {
      await updateUser(
        editingUser.id,
        { username: usernameForm.username.trim() },
        'Nome de usuário atualizado com sucesso!'
      );
      setShowUsernameModal(false);
      setEditingUser(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao atualizar nome de usuário');
    }
  };

  const handlePasswordUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;
    clearFeedback();

    if (!passwordForm.password || passwordForm.password.length < 6) {
      setError('A nova senha deve ter pelo menos 6 caracteres');
      return;
    }
    if (passwordForm.password !== passwordForm.confirmPassword) {
      setError('A confirmação da senha não confere');
      return;
    }

    try {
      await updateUser(
        editingUser.id,
        { password: passwordForm.password },
        'Senha alterada com sucesso!'
      );
      setShowPasswordModal(false);
      setEditingUser(null);
      setPasswordForm({ password: '', confirmPassword: '' });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao alterar senha');
    }
  };

  const handleRoleChange = async (userId: string, role: RoleType) => {
    clearFeedback();
    setRoleLoadingId(userId);
    try {
      await updateUser(userId, { role }, 'Permissão atualizada com sucesso!');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao atualizar permissão');
    } finally {
      setRoleLoadingId(null);
    }
  };

  const handleResetPassword = async (user: User) => {
    clearFeedback();
    setActionLoadingId(user.id);
    try {
      const response = await fetch(`${API_BASE_URL}/users/${user.id}/reset-password`, {
        method: 'POST',
        headers: authHeaders()
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data.error || 'Erro ao resetar senha');
        return;
      }
      setTemporaryPassword({
        username: user.username,
        value: data.temporaryPassword
      });
      showSuccess('Senha resetada com sucesso!');
    } catch (err) {
      setError('Erro ao conectar com o servidor');
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleToggleActive = async (user: User) => {
    clearFeedback();
    setActionLoadingId(user.id);
    try {
      await updateUser(
        user.id,
        { isActive: !(user.isActive !== false) },
        user.isActive !== false ? 'Usuário desativado com sucesso!' : 'Usuário reativado com sucesso!'
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao alterar status do usuário');
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleDelete = async (userId: string) => {
    clearFeedback();
    setActionLoadingId(userId);
    try {
      const response = await fetch(`${API_BASE_URL}/users/${userId}`, {
        method: 'DELETE',
        headers: authHeaders()
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data.error || 'Erro ao excluir usuário');
        return;
      }
      setDeleteConfirm(null);
      showSuccess('Usuário excluído com sucesso!');
      await loadUsers();
    } catch (err) {
      setError('Erro ao conectar com o servidor');
    } finally {
      setActionLoadingId(null);
    }
  };

  if (currentUser?.role !== 'admin' && currentUser?.role !== 'superadmin') {
    return (
      <div className="p-6">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-red-800">Acesso negado. Apenas administradores podem acessar este painel.</p>
        </div>
      </div>
    );
  }

  return (
    <div className={embedded ? '' : 'p-6 max-w-7xl mx-auto'}>
      {!embedded && (
        <div className="mb-6 flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 mb-2">Painel Administrativo</h1>
            <p className="text-gray-600">Gerencie usuários, permissões e credenciais</p>
          </div>
          <button
            onClick={() => {
              clearFeedback();
              setCreateForm(DEFAULT_CREATE_FORM);
              setShowCreateModal(true);
            }}
            className="flex items-center gap-3 px-6 py-3 bg-gradient-to-r from-blue-500 to-indigo-600 text-white font-semibold rounded-xl hover:from-blue-600 hover:to-indigo-700 shadow-lg hover:shadow-xl transform hover:-translate-y-1 transition-all duration-300"
          >
            <UserPlus className="h-5 w-5" />
            Novo Usuário
          </button>
        </div>
      )}

      {error && <div className="mb-4 bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-lg">{error}</div>}
      {successMessage && <div className="mb-4 bg-green-50 border border-green-200 text-green-800 px-4 py-3 rounded-lg">{successMessage}</div>}

      <div className="flex justify-end mb-4">
        <button
          onClick={() => { clearFeedback(); setShowCreationTypeModal(true); }}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 shadow transition-all"
        >
          <UserPlus className="h-5 w-5" />
          Novo Usuário
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center items-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
        </div>
      ) : (
        <div className="bg-[#ffffff] dark:!bg-[#243040] rounded-lg shadow-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-[1180px] w-full divide-y divide-gray-200">
              <thead className="bg-gradient-to-r from-blue-500 to-indigo-600">
                <tr>
                  <th className="px-4 py-3 text-left">
                    <button
                      type="button"
                      onClick={() => setNameSortOrder((previous) => (previous === 'asc' ? 'desc' : 'asc'))}
                      className="inline-flex items-center gap-2 text-xs font-bold text-white uppercase tracking-wide hover:text-white/80"
                      title={`Ordenar por nome (${nameSortOrder === 'asc' ? 'crescente' : 'decrescente'})`}
                    >
                      <span>Usuário</span>
                      <span className="text-[10px]">{nameSortOrder === 'asc' ? '▲' : '▼'}</span>
                    </button>
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-bold text-white uppercase tracking-wide">Role</th>
                  <th className="px-4 py-3 text-left text-xs font-bold text-white uppercase tracking-wide">Cadastro</th>
                  <th className="px-4 py-3 text-left text-xs font-bold text-white uppercase tracking-wide">Módulos</th>
                  <th className="px-4 py-3 text-left text-xs font-bold text-white uppercase tracking-wide">Credenciais</th>
                  <th className="px-4 py-3 text-left text-xs font-bold text-white uppercase tracking-wide">Status</th>
                  <th className="px-4 py-3 text-right text-xs font-bold text-white uppercase tracking-wide">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {users.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-6 py-8 text-center text-gray-500">Nenhum usuário encontrado</td>
                  </tr>
                ) : (
                  sortedUsers.map((user, index) => {
                    const isCurrent = user.id === currentUser?.id;
                    const isActive = user.isActive !== false;
                    const isSuperadminTarget = user.role === 'superadmin' && currentUser?.role !== 'superadmin';

                    return (
                      <tr key={user.id} className={isSuperadminTarget ? 'bg-gray-50 dark:bg-gray-700/30 opacity-60 pointer-events-none' : !isActive ? 'bg-gray-50 dark:bg-gray-700/30' : `${index % 2 === 0 ? 'imp-row-even' : 'imp-row-odd'}`}>
                        <td className="px-4 py-4">
                          <div className="flex items-center gap-3">
                            <div className="flex-shrink-0 h-10 w-10 rounded-full bg-blue-100 flex items-center justify-center">
                              <span className="text-blue-600 font-semibold">{user.username.charAt(0).toUpperCase()}</span>
                            </div>
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-semibold text-gray-900">{user.username}</span>
                                <button
                                  onClick={() => openUsernameModal(user)}
                                  className="p-1 text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded"
                                  title="Alterar nome de usuário"
                                >
                                  <Pencil className="h-4 w-4" />
                                </button>
                              </div>
                              {isCurrent && <div className="text-xs text-gray-500">(Você)</div>}
                            </div>
                          </div>
                        </td>

                        <td className="px-4 py-4">
                          <div className="flex items-center gap-2">
                            <select
                              value={user.role}
                              onChange={(e) => handleRoleChange(user.id, e.target.value as RoleType)}
                              disabled={roleLoadingId === user.id}
                              className="px-2 py-1 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            >
                              {currentUser?.role === 'superadmin' && <option value="superadmin">Super Administrador</option>}
                              <option value="admin">Administrador</option>
                              <option value="user">Usuário</option>
                              <option value="guest">Convidado</option>
                            </select>
                            {roleLoadingId === user.id && <span className="text-xs text-gray-500">...</span>}
                          </div>
                        </td>

                        <td className="px-4 py-4">
                          <button
                            onClick={() => openProfileModal(user)}
                            className="inline-flex items-center gap-2 px-3 py-1.5 text-sm text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-md"
                            title="Editar cadastro do usuário"
                          >
                            <Edit className="h-4 w-4" />
                            Editar cadastro
                          </button>
                        </td>

                        <td className="px-4 py-4">
                          <button
                            onClick={() => openModulesModal(user)}
                            className="inline-flex items-center gap-2 px-3 py-1.5 text-sm text-indigo-700 bg-indigo-50 hover:bg-indigo-100 rounded-md"
                            title="Configurar módulos de acesso"
                            disabled={modulesLoadingId === user.id}
                          >
                            <Settings2 className="h-4 w-4" />
                            {modulesLoadingId === user.id ? 'Carregando...' : 'Configurar'}
                          </button>
                        </td>

                        <td className="px-4 py-4">
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => openPasswordModal(user)}
                              className="p-2 text-amber-700 hover:text-amber-900 hover:bg-amber-50 rounded"
                              title="Alterar senha"
                            >
                              <KeyRound className="h-4 w-4" />
                            </button>
                            <button
                              onClick={() => handleResetPassword(user)}
                              className="p-2 text-indigo-700 hover:text-indigo-900 hover:bg-indigo-50 rounded"
                              title="Resetar senha"
                              disabled={actionLoadingId === user.id}
                            >
                              <RotateCcw className="h-4 w-4" />
                            </button>
                            {currentUser?.role === 'superadmin' && !isCurrent && (
                              <button
                                onClick={async () => {
                                  const ok = await startImpersonation(user.id);
                                  if (!ok) alert('Erro ao iniciar representação');
                                }}
                                className="p-2 text-amber-700 hover:text-amber-900 hover:bg-amber-50 rounded"
                                title="Representar usuário"
                              >
                                <UserCircle2 className="h-4 w-4" />
                              </button>
                            )}
                          </div>
                        </td>

                        <td className="px-4 py-4">
                          <span className={`inline-flex px-2 py-1 text-xs rounded-full border ${isActive ? 'bg-green-50 border-green-200 text-green-700' : 'bg-gray-100 border-gray-300 text-gray-600'}`}>
                            {isActive ? 'Ativo' : 'Inativo'}
                          </span>
                        </td>

                        <td className="px-4 py-4">
                          <div className="flex justify-end items-center gap-2">
                            {!isCurrent && (
                              <>
                                <button
                                  onClick={() => handleToggleActive(user)}
                                  className="p-2 text-gray-700 hover:text-gray-900 hover:bg-gray-100 rounded"
                                  title={isActive ? 'Desativar usuário' : 'Reativar usuário'}
                                  disabled={actionLoadingId === user.id}
                                >
                                  <Lock className={`h-4 w-4 ${isActive ? '' : 'text-emerald-700'}`} />
                                </button>
                                <button
                                  onClick={() => setDeleteConfirm(user.id)}
                                  className="p-2 text-red-600 hover:text-red-800 hover:bg-red-50 rounded"
                                  title="Excluir usuário"
                                  disabled={actionLoadingId === user.id}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {createPortal(<>
      {showCreateModal && (() => {
        const roleOptions = [
          ...(currentUser?.role === 'superadmin' ? [{ value: 'superadmin' as RoleType, label: 'Super Administrador', description: 'Acesso total ao sistema' }] : []),
          { value: 'admin' as RoleType, label: 'Administrador', description: 'Gerencia usuários e módulos' },
          { value: 'user' as RoleType, label: 'Usuário', description: 'Acesso padrão ao sistema' },
          { value: 'guest' as RoleType, label: 'Convidado', description: 'Acesso somente leitura' }
        ];
        const visibleModules = allModules.filter(m => {
          if (SUPERADMIN_MODULES.includes(m.moduleKey) && currentUser?.role !== 'superadmin') return false;
          return true;
        });
        return (
          <div className="fixed inset-0 bg-gradient-to-br from-blue-900/50 to-indigo-900/50 backdrop-blur-sm flex items-center justify-center z-[10001]" onClick={() => setShowCreateModal(false)}>
            <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl" onClick={(e) => e.stopPropagation()}>
              {/* Header */}
              <div className="bg-gradient-to-r from-blue-50 to-indigo-50 px-6 py-4 border-b border-blue-200/50 rounded-t-2xl flex items-center justify-between">
                <h2 className="text-xl font-bold text-blue-900 flex items-center gap-2">
                  <UserPlus className="w-6 h-6 text-blue-700" />
                  Novo Usuário
                </h2>
                <button onClick={() => setShowCreateModal(false)} className="text-blue-600 hover:text-blue-800 hover:bg-blue-100 p-2 rounded-full transition-all">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleCreate} className="p-6 space-y-6">
                {/* Erro */}
                {error && <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-800">{error}</div>}

                {/* Username */}
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Nome de Usuário *</label>
                  <input
                    type="text"
                    value={createForm.username}
                    onChange={(e) => setCreateForm({ ...createForm, username: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="Digite o nome de usuário"
                    required
                  />
                  <p className="mt-1 text-xs text-gray-500">Este será o login do usuário. Uma senha temporária será gerada automaticamente.</p>
                </div>

                {/* Role */}
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-3">Função *</label>
                  <div className="grid gap-3">
                    {roleOptions.map((option) => (
                      <label key={option.value} className={`relative flex items-start p-4 border-2 rounded-lg cursor-pointer transition-all ${createForm.role === option.value ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-blue-300'}`}>
                        <input type="radio" name="role" value={option.value} checked={createForm.role === option.value}
                          onChange={(e) => setCreateForm({ ...createForm, role: e.target.value as RoleType, modules: getDefaultModulesForRole(e.target.value as RoleType) })}
                          className="sr-only" />
                        <div className="flex items-center gap-3 flex-1">
                          <Shield className={`w-5 h-5 ${createForm.role === option.value ? 'text-blue-600' : 'text-gray-400'}`} />
                          <div className="flex-1">
                            <p className="font-medium text-gray-900">{option.label}</p>
                            <p className="text-sm text-gray-500">{option.description}</p>
                          </div>
                          {createForm.role === option.value && <Check className="w-5 h-5 text-blue-600" />}
                        </div>
                      </label>
                    ))}
                  </div>
                </div>

                {/* Status */}
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Status</label>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input type="checkbox" checked={createForm.isActive}
                      onChange={(e) => setCreateForm({ ...createForm, isActive: e.target.checked })}
                      className="sr-only peer" />
                    <div className="w-11 h-6 bg-gray-200 peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                    <span className="ml-3 text-sm font-medium text-gray-900">{createForm.isActive ? 'Ativo' : 'Inativo'}</span>
                  </label>
                </div>

                {/* Módulos */}
                {visibleModules.length > 0 && (
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">Módulos de Acesso *</label>
                    <p className="text-xs text-gray-500 mb-3">Pré-selecionados para <span className="font-semibold">{roleOptions.find(r => r.value === createForm.role)?.label}</span>. Ajuste conforme necessário.</p>
                    <div className="grid grid-cols-2 gap-2 p-4 bg-gray-50 rounded-lg border border-gray-200">
                      {visibleModules.map((m) => (
                        <label key={m.moduleKey} className={`flex items-center gap-2 p-2 rounded-lg cursor-pointer transition-colors ${createForm.modules.includes(m.moduleKey) ? 'bg-blue-100 text-blue-900' : 'bg-white text-gray-700 hover:bg-gray-100'}`}>
                          <input type="checkbox" checked={createForm.modules.includes(m.moduleKey)}
                            onChange={() => setCreateForm(prev => ({
                              ...prev,
                              modules: prev.modules.includes(m.moduleKey)
                                ? prev.modules.filter(k => k !== m.moduleKey)
                                : [...prev.modules, m.moduleKey]
                            }))}
                            className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500" />
                          <span className="text-sm font-medium">{m.moduleName}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                )}

                {/* Info */}
                <div className="p-4 bg-blue-50 rounded-lg border border-blue-200 text-sm text-blue-800">
                  <p className="font-semibold mb-1">Informações</p>
                  <ul className="space-y-1 text-xs">
                    <li>• Uma senha temporária será gerada automaticamente</li>
                    <li>• O usuário deverá alterar a senha no primeiro acesso</li>
                    <li>• Você pode editar o perfil completo depois</li>
                  </ul>
                </div>

                {/* Footer */}
                <div className="flex justify-end gap-3 pt-2 border-t">
                  <button type="button" onClick={() => setShowCreateModal(false)} className="px-4 py-2 text-gray-700 font-medium hover:text-gray-900 transition-colors">Cancelar</button>
                  <button type="submit" className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium flex items-center gap-2">
                    <UserPlus className="w-4 h-4" />
                    Criar Usuário
                  </button>
                </div>
              </form>
            </div>
          </div>
        );
      })()}

      {showProfileModal && editingUser && (
        <div className="fixed inset-0 bg-gradient-to-br from-blue-900/50 to-indigo-900/50 backdrop-blur-sm flex items-center justify-center z-[10001]" onClick={() => setShowProfileModal(false)}>
          <div className="bg-[#ffffff] dark:!bg-[#243040] rounded-lg p-6 w-full max-w-3xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold text-gray-900">Editar cadastro de {editingUser.username}</h2>
              <button onClick={() => setShowProfileModal(false)} className="text-gray-400 hover:text-gray-600">
                <X className="h-6 w-6" />
              </button>
            </div>
            <form onSubmit={handleProfileUpdate}>
              <div className="space-y-6">
                <div>
                  <h3 className="text-sm font-semibold text-gray-700 mb-3">Dados pessoais</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <input type="text" placeholder="Nome" value={profileForm.firstName} onChange={(e) => setProfileForm({ ...profileForm, firstName: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg" />
                    <input type="text" placeholder="Sobrenome" value={profileForm.lastName} onChange={(e) => setProfileForm({ ...profileForm, lastName: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg" />
                    <input type="email" placeholder="Email" value={profileForm.email} onChange={(e) => setProfileForm({ ...profileForm, email: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg md:col-span-2" />
                    <input type="text" placeholder="Telefone" value={profileForm.phone} onChange={(e) => setProfileForm({ ...profileForm, phone: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg" />
                    <input type="text" placeholder="CPF" value={profileForm.cpf} onChange={(e) => setProfileForm({ ...profileForm, cpf: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg" />
                    <input type="date" placeholder="Data de nascimento" value={profileForm.birthDate} onChange={(e) => setProfileForm({ ...profileForm, birthDate: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg" />
                    <select value={profileForm.gender} onChange={(e) => setProfileForm({ ...profileForm, gender: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg">
                      <option value="">Gênero</option>
                      <option value="masculino">Masculino</option>
                      <option value="feminino">Feminino</option>
                      <option value="outro">Outro</option>
                      <option value="prefiro-nao-informar">Prefiro não informar</option>
                    </select>
                    <input type="text" placeholder="Cargo" value={profileForm.position} onChange={(e) => setProfileForm({ ...profileForm, position: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg" />
                  </div>
                </div>

                <div>
                  <h3 className="text-sm font-semibold text-gray-700 mb-3">Endereço</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <input
                      type="text"
                      placeholder="CEP"
                      value={profileForm.address.cep}
                      onChange={(e) => setProfileForm({ ...profileForm, address: { ...profileForm.address, cep: e.target.value } })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                    />
                    <input
                      type="text"
                      placeholder="Rua / Logradouro"
                      value={profileForm.address.street}
                      onChange={(e) => setProfileForm({ ...profileForm, address: { ...profileForm.address, street: e.target.value } })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                    />
                    <input
                      type="text"
                      placeholder="Número"
                      value={profileForm.address.number}
                      onChange={(e) => setProfileForm({ ...profileForm, address: { ...profileForm.address, number: e.target.value } })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                    />
                    <input
                      type="text"
                      placeholder="Complemento"
                      value={profileForm.address.complement}
                      onChange={(e) => setProfileForm({ ...profileForm, address: { ...profileForm.address, complement: e.target.value } })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                    />
                    <input
                      type="text"
                      placeholder="Bairro"
                      value={profileForm.address.neighborhood}
                      onChange={(e) => setProfileForm({ ...profileForm, address: { ...profileForm.address, neighborhood: e.target.value } })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                    />
                    <input
                      type="text"
                      placeholder="Cidade"
                      value={profileForm.address.city}
                      onChange={(e) => setProfileForm({ ...profileForm, address: { ...profileForm.address, city: e.target.value } })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                    />
                    <input
                      type="text"
                      placeholder="UF"
                      maxLength={2}
                      value={profileForm.address.state}
                      onChange={(e) => setProfileForm({ ...profileForm, address: { ...profileForm.address, state: e.target.value.toUpperCase() } })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                    />
                  </div>
                </div>
              </div>
              {/* Permissões Legais — visível apenas para superadmin editando admin */}
              {currentUser?.role === 'superadmin' && editingUser.role === 'admin' && (
                <div>
                  <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-1.5">
                    <Shield className="h-4 w-4 text-blue-600" /> Permissões Legais (LGPD)
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-4 bg-blue-50 rounded-xl border border-blue-100">
                    {([
                      { key: 'termos_uso', label: 'Editar Termos de Uso' },
                      { key: 'politica_privacidade', label: 'Editar Política de Privacidade' },
                      { key: 'cookies', label: 'Editar Cookies' },
                    ] as { key: string; label: string }[]).map(perm => (
                      <label key={perm.key} className="flex items-center gap-2 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={permissoesLegaisForm[perm.key] === true}
                          onChange={e => setPermissoesLegaisForm(prev => ({ ...prev, [perm.key]: e.target.checked }))}
                          className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                        />
                        <span className="text-xs font-medium text-gray-700">{perm.label}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              <div className="mt-6 flex justify-end gap-3">
                <button type="button" onClick={() => setShowProfileModal(false)} className="px-4 py-2 text-gray-700 dark:text-gray-200 bg-gray-100 dark:!bg-[#2d3f52] rounded-lg hover:bg-gray-200 dark:hover:!bg-[#354b60]">Cancelar</button>
                <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2">
                  <Save className="h-4 w-4" />
                  Salvar cadastro
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showUsernameModal && editingUser && (
        <div className="fixed inset-0 bg-gradient-to-br from-blue-900/50 to-indigo-900/50 backdrop-blur-sm flex items-center justify-center z-[10001]" onClick={() => setShowUsernameModal(false)}>
          <div className="bg-[#ffffff] dark:!bg-[#243040] rounded-lg p-6 w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold text-gray-900">Alterar nome de usuário</h2>
              <button onClick={() => setShowUsernameModal(false)} className="text-gray-400 hover:text-gray-600">
                <X className="h-6 w-6" />
              </button>
            </div>
            <form onSubmit={handleUsernameUpdate}>
              <input type="text" required value={usernameForm.username} onChange={(e) => setUsernameForm({ username: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg" />
              <div className="mt-6 flex justify-end gap-3">
                <button type="button" onClick={() => setShowUsernameModal(false)} className="px-4 py-2 text-gray-700 dark:text-gray-200 bg-gray-100 dark:!bg-[#2d3f52] rounded-lg hover:bg-gray-200 dark:hover:!bg-[#354b60]">Cancelar</button>
                <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2">
                  <Save className="h-4 w-4" />
                  Salvar nome
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showPasswordModal && editingUser && (
        <div className="fixed inset-0 bg-gradient-to-br from-blue-900/50 to-indigo-900/50 backdrop-blur-sm flex items-center justify-center z-[10001]" onClick={() => setShowPasswordModal(false)}>
          <div className="bg-[#ffffff] dark:!bg-[#243040] rounded-lg p-6 w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold text-gray-900">Alterar senha de {editingUser.username}</h2>
              <button onClick={() => setShowPasswordModal(false)} className="text-gray-400 hover:text-gray-600">
                <X className="h-6 w-6" />
              </button>
            </div>
            <form onSubmit={handlePasswordUpdate}>
              <div className="space-y-3">
                <input type="password" required placeholder="Nova senha" value={passwordForm.password} onChange={(e) => setPasswordForm({ ...passwordForm, password: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg" />
                <input type="password" required placeholder="Confirmar nova senha" value={passwordForm.confirmPassword} onChange={(e) => setPasswordForm({ ...passwordForm, confirmPassword: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg" />
              </div>
              <div className="mt-6 flex justify-end gap-3">
                <button type="button" onClick={() => setShowPasswordModal(false)} className="px-4 py-2 text-gray-700 dark:text-gray-200 bg-gray-100 dark:!bg-[#2d3f52] rounded-lg hover:bg-gray-200 dark:hover:!bg-[#354b60]">Cancelar</button>
                <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2">
                  <Save className="h-4 w-4" />
                  Salvar senha
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showModulesModal && modulesTargetUser && (
        <div className="fixed inset-0 bg-gradient-to-br from-blue-900/50 to-indigo-900/50 backdrop-blur-sm flex items-center justify-center z-[10001]" onClick={() => setShowModulesModal(false)}>
          <div className="bg-[#ffffff] dark:!bg-[#243040] rounded-lg p-6 w-full max-w-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold text-gray-900">Módulos de acesso de {modulesTargetUser.username}</h2>
              <button onClick={() => setShowModulesModal(false)} className="text-gray-400 hover:text-gray-600">
                <X className="h-6 w-6" />
              </button>
            </div>

            <p className="text-sm text-gray-600 mb-4">
              Marque os módulos que este usuário pode acessar.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-80 overflow-y-auto border border-gray-200 rounded-lg p-4">
              {moduleOptions.map((option) => {
                const superadminOnly = ['sessions', 'anomalies', 'security_alerts'].includes(option.moduleKey);
                const locked = superadminOnly && currentUser?.role !== 'superadmin';
                return (
                  <label key={option.moduleKey} className={`flex items-center gap-3 text-sm ${locked ? 'text-gray-400 cursor-not-allowed' : 'text-gray-700'}`}>
                    <input
                      type="checkbox"
                      checked={option.enabled}
                      onChange={() => !locked && toggleModuleOption(option.moduleKey)}
                      disabled={locked}
                      className="h-4 w-4 text-blue-600 rounded border-gray-300 disabled:opacity-50"
                    />
                    <span>{option.moduleName}</span>
                    <span className="text-xs text-gray-400">({option.moduleKey})</span>
                  </label>
                );
              })}
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowModulesModal(false)}
                className="px-4 py-2 text-gray-700 dark:text-gray-200 bg-gray-100 dark:!bg-[#2d3f52] rounded-lg hover:bg-gray-200 dark:hover:!bg-[#354b60]"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleSaveModules}
                disabled={modulesSaving}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2 disabled:opacity-70"
              >
                <Save className="h-4 w-4" />
                {modulesSaving ? 'Salvando...' : 'Salvar módulos'}
              </button>
            </div>
          </div>
        </div>
      )}

      {temporaryPassword && (
        <div className="fixed inset-0 bg-gradient-to-br from-blue-900/50 to-indigo-900/50 backdrop-blur-sm flex items-center justify-center z-[10001]" onClick={() => setTemporaryPassword(null)}>
          <div className="bg-[#ffffff] dark:!bg-[#243040] rounded-lg p-6 w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-xl font-bold text-gray-900 mb-3">Senha resetada</h2>
            <p className="text-gray-600 mb-4">
              Senha temporária de <strong>{temporaryPassword.username}</strong>:
            </p>
            <div className="bg-gray-100 dark:!bg-[#1e2d3e] rounded-lg px-3 py-2 font-mono text-gray-900 dark:text-gray-100 break-all">{temporaryPassword.value}</div>
            <p className="text-xs text-gray-500 mt-3">Compartilhe esta senha com o usuário e peça para alterar no próximo login.</p>
            <div className="mt-5 flex justify-end">
              <button onClick={() => setTemporaryPassword(null)} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">Fechar</button>
            </div>
          </div>
        </div>
      )}

      {deleteConfirm && (
        <div className="fixed inset-0 bg-gradient-to-br from-blue-900/50 to-indigo-900/50 backdrop-blur-sm flex items-center justify-center z-[10001]" onClick={() => setDeleteConfirm(null)}>
          <div className="bg-[#ffffff] dark:!bg-[#243040] rounded-lg p-6 w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-xl font-bold text-gray-900 mb-3">Confirmar exclusão</h2>
            <p className="text-gray-600 mb-6">
              Tem certeza que deseja excluir <strong>{users.find((u) => u.id === deleteConfirm)?.username}</strong>?
            </p>
            <div className="flex justify-end gap-3">
              <button onClick={() => setDeleteConfirm(null)} className="px-4 py-2 text-gray-700 dark:text-gray-200 bg-gray-100 dark:!bg-[#2d3f52] rounded-lg hover:bg-gray-200 dark:hover:!bg-[#354b60]">Cancelar</button>
              <button onClick={() => handleDelete(deleteConfirm)} className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 flex items-center gap-2">
                <Trash2 className="h-4 w-4" />
                Excluir
              </button>
            </div>
          </div>
        </div>
      )}
      </>, document.body)}

      <UserCreationTypeModal
        isOpen={showCreationTypeModal}
        onClose={() => setShowCreationTypeModal(false)}
        onSelectSimple={() => { setShowCreationTypeModal(false); setCreateForm(DEFAULT_CREATE_FORM); setShowCreateModal(true); }}
        onSelectComplete={() => { setShowCreationTypeModal(false); setShowCompleteModal(true); }}
      />

      <CadastroCompletoModal
        isOpen={showCompleteModal}
        onClose={() => setShowCompleteModal(false)}
        onSuccess={(userData) => { setShowCompleteModal(false); setCreatedUserData(userData); setShowUserCreatedModal(true); loadUsers(); }}
        apiBaseUrl={API_BASE_URL}
        authHeaders={authHeaders}
        availableModules={allModules}
        superadminModules={SUPERADMIN_MODULES}
      />

      {createdUserData && (
        <UserCreatedModal
          isOpen={showUserCreatedModal}
          onClose={() => { setShowUserCreatedModal(false); setCreatedUserData(null); }}
          onCreateAnother={() => { setShowUserCreatedModal(false); setCreatedUserData(null); setShowCreationTypeModal(true); }}
          userData={createdUserData}
        />
      )}
    </div>
  );
};

export default AdminPanel;
