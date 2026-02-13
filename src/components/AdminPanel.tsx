import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../contexts/AuthContext';
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
  Save
} from 'lucide-react';

type RoleType = 'admin' | 'user' | 'guest';

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
}

interface ModuleOption {
  moduleKey: string;
  moduleName: string;
  enabled: boolean;
}

const DEFAULT_CREATE_FORM = {
  username: '',
  password: '',
  role: 'user' as RoleType
};

const AdminPanel: React.FC = () => {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
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

  const [createForm, setCreateForm] = useState(DEFAULT_CREATE_FORM);
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

  const API_BASE_URL =
    (typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'))
      ? 'http://localhost:9001/api'
      : ((import.meta as any).env?.VITE_API_URL || '/api');

  useEffect(() => {
    if (currentUser?.role === 'admin') {
      loadUsers();
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
    try {
      const response = await fetch(`${API_BASE_URL}/users`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify(createForm)
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data.error || 'Erro ao criar usuário');
        return;
      }

      setShowCreateModal(false);
      setCreateForm(DEFAULT_CREATE_FORM);
      showSuccess('Usuário criado com sucesso!');
      await loadUsers();
    } catch (err) {
      setError('Erro ao conectar com o servidor');
    }
  };

  const openProfileModal = (user: User) => {
    clearFeedback();
    setEditingUser(user);
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

  if (currentUser?.role !== 'admin') {
    return (
      <div className="p-6">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-red-800">Acesso negado. Apenas administradores podem acessar este painel.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
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

      {error && <div className="mb-4 bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-lg">{error}</div>}
      {successMessage && <div className="mb-4 bg-green-50 border border-green-200 text-green-800 px-4 py-3 rounded-lg">{successMessage}</div>}

      {loading ? (
        <div className="flex justify-center items-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-[1180px] w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    <button
                      type="button"
                      onClick={() => setNameSortOrder((previous) => (previous === 'asc' ? 'desc' : 'asc'))}
                      className="inline-flex items-center gap-2 hover:text-gray-700"
                      title={`Ordenar por nome (${nameSortOrder === 'asc' ? 'crescente' : 'decrescente'})`}
                    >
                      <span>Usuário</span>
                      <span className="text-[10px]">{nameSortOrder === 'asc' ? '▲' : '▼'}</span>
                    </button>
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Role</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Cadastro</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Módulos</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Credenciais</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Ações</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {users.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-6 py-8 text-center text-gray-500">Nenhum usuário encontrado</td>
                  </tr>
                ) : (
                  sortedUsers.map((user) => {
                    const isCurrent = user.id === currentUser?.id;
                    const isActive = user.isActive !== false;

                    return (
                      <tr key={user.id} className={!isActive ? 'bg-gray-50' : 'hover:bg-gray-50'}>
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

      {showCreateModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" onClick={() => setShowCreateModal(false)}>
          <div className="bg-white rounded-lg p-6 w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold text-gray-900">Criar novo usuário</h2>
              <button onClick={() => setShowCreateModal(false)} className="text-gray-400 hover:text-gray-600">
                <X className="h-6 w-6" />
              </button>
            </div>
            <form onSubmit={handleCreate}>
              <div className="space-y-4">
                <input type="text" required placeholder="Username" value={createForm.username} onChange={(e) => setCreateForm({ ...createForm, username: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg" />
                <input type="password" required placeholder="Senha" value={createForm.password} onChange={(e) => setCreateForm({ ...createForm, password: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg" />
                <select value={createForm.role} onChange={(e) => setCreateForm({ ...createForm, role: e.target.value as RoleType })} className="w-full px-3 py-2 border border-gray-300 rounded-lg">
                  <option value="admin">Administrador</option>
                  <option value="user">Usuário</option>
                  <option value="guest">Convidado</option>
                </select>
              </div>
              <div className="mt-6 flex justify-end gap-3">
                <button type="button" onClick={() => setShowCreateModal(false)} className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200">Cancelar</button>
                <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2">
                  <Save className="h-4 w-4" />
                  Criar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showProfileModal && editingUser && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" onClick={() => setShowProfileModal(false)}>
          <div className="bg-white rounded-lg p-6 w-full max-w-3xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
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
              <div className="mt-6 flex justify-end gap-3">
                <button type="button" onClick={() => setShowProfileModal(false)} className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200">Cancelar</button>
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
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" onClick={() => setShowUsernameModal(false)}>
          <div className="bg-white rounded-lg p-6 w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold text-gray-900">Alterar nome de usuário</h2>
              <button onClick={() => setShowUsernameModal(false)} className="text-gray-400 hover:text-gray-600">
                <X className="h-6 w-6" />
              </button>
            </div>
            <form onSubmit={handleUsernameUpdate}>
              <input type="text" required value={usernameForm.username} onChange={(e) => setUsernameForm({ username: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg" />
              <div className="mt-6 flex justify-end gap-3">
                <button type="button" onClick={() => setShowUsernameModal(false)} className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200">Cancelar</button>
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
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" onClick={() => setShowPasswordModal(false)}>
          <div className="bg-white rounded-lg p-6 w-full max-w-md" onClick={(e) => e.stopPropagation()}>
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
                <button type="button" onClick={() => setShowPasswordModal(false)} className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200">Cancelar</button>
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
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" onClick={() => setShowModulesModal(false)}>
          <div className="bg-white rounded-lg p-6 w-full max-w-2xl" onClick={(e) => e.stopPropagation()}>
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
              {moduleOptions.map((option) => (
                <label key={option.moduleKey} className="flex items-center gap-3 text-sm text-gray-700">
                  <input
                    type="checkbox"
                    checked={option.enabled}
                    onChange={() => toggleModuleOption(option.moduleKey)}
                    className="h-4 w-4 text-blue-600 rounded border-gray-300"
                  />
                  <span>{option.moduleName}</span>
                  <span className="text-xs text-gray-400">({option.moduleKey})</span>
                </label>
              ))}
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowModulesModal(false)}
                className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
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
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" onClick={() => setTemporaryPassword(null)}>
          <div className="bg-white rounded-lg p-6 w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-xl font-bold text-gray-900 mb-3">Senha resetada</h2>
            <p className="text-gray-600 mb-4">
              Senha temporária de <strong>{temporaryPassword.username}</strong>:
            </p>
            <div className="bg-gray-100 rounded-lg px-3 py-2 font-mono text-gray-900 break-all">{temporaryPassword.value}</div>
            <p className="text-xs text-gray-500 mt-3">Compartilhe esta senha com o usuário e peça para alterar no próximo login.</p>
            <div className="mt-5 flex justify-end">
              <button onClick={() => setTemporaryPassword(null)} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">Fechar</button>
            </div>
          </div>
        </div>
      )}

      {deleteConfirm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" onClick={() => setDeleteConfirm(null)}>
          <div className="bg-white rounded-lg p-6 w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-xl font-bold text-gray-900 mb-3">Confirmar exclusão</h2>
            <p className="text-gray-600 mb-6">
              Tem certeza que deseja excluir <strong>{users.find((u) => u.id === deleteConfirm)?.username}</strong>?
            </p>
            <div className="flex justify-end gap-3">
              <button onClick={() => setDeleteConfirm(null)} className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200">Cancelar</button>
              <button onClick={() => handleDelete(deleteConfirm)} className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 flex items-center gap-2">
                <Trash2 className="h-4 w-4" />
                Excluir
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminPanel;
