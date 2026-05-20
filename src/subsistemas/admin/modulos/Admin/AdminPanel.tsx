import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useAuth } from '@/contexts/AuthContext';
import UserCreationTypeModal from './UserCreationTypeModal';
import UserCreatedModal from './UserCreatedModal';
import CadastroCompletoModal from './CadastroCompletoModal';
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
  canManageTcUsers?: boolean;  // F2.4 — só superadmin pode editar
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
  // Atualizado pela fase 1.4 (subsistemas).
  // Financeiro: dashboard_financeiro, metas_financeiro, relatorios_financeiro, projecao, transactions, dre
  // Gerenciamento: + dashboard_gerenciamento, metas_gerenciamento, projecao_gerenciamento, relatorios_gerenciamento, projects, services, clients
  // Gestão: roadmap, documentacao, faq | Admin: admin, sessions, anomalies, security_alerts | Especial: terracontrol
  const allFinanceiroEGerenciamentoEEspecial = [
    'dashboard_financeiro', 'metas_financeiro', 'relatorios_financeiro', 'projecao', 'transactions', 'dre',
    'dashboard_gerenciamento', 'metas_gerenciamento', 'projecao_gerenciamento', 'relatorios_gerenciamento',
    'projects', 'services', 'clients',
    'terracontrol',
  ];
  switch (role) {
    case 'superadmin':
      return [...allFinanceiroEGerenciamentoEEspecial, 'admin', 'sessions', 'anomalies', 'security_alerts'];
    case 'admin':
      return [...allFinanceiroEGerenciamentoEEspecial, 'admin'];
    case 'user':
      return allFinanceiroEGerenciamentoEEspecial;
    case 'guest':
      return ['dashboard_financeiro', 'metas_financeiro', 'relatorios_financeiro', 'dre'];
    default:
      return [];
  }
};

const DEFAULT_CREATE_FORM = {
  username: '',
  role: 'user' as RoleType,
  isActive: true,
  modules: getDefaultModulesForRole('user'),
};

// BUG FIX: API_BASE_URL fora do componente — valor estático, sem recalcular a cada render
// BUG FIX: adicionado '0.0.0.0' para detectar dev server em rede local
const isLocalEnv =
  typeof window !== 'undefined' &&
  (window.location.hostname === 'localhost' ||
    window.location.hostname === '127.0.0.1' ||
    window.location.hostname === '0.0.0.0');

// BUG FIX: import.meta.env tipado corretamente; ?? em vez de || (não descarta string vazia)
const API_BASE_URL: string = isLocalEnv
  ? 'http://localhost:9001/api'
  : ((import.meta.env.VITE_API_URL as string | undefined) ?? '/api');

// Seletores de elementos focalizáveis para o focus trap
const FOCUSABLE_SELECTORS =
  'a[href], button:not([disabled]), textarea, input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

// BUG FIX: hook de focus trap para modais — confina Tab/Shift+Tab dentro do container
function useFocusTrap(containerRef: React.RefObject<HTMLDivElement | null>, active: boolean) {
  useEffect(() => {
    if (!active || !containerRef.current) return;
    const container = containerRef.current;

    // Move foco para o primeiro elemento focalizável ao abrir o modal
    const initialFocusables = container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTORS);
    requestAnimationFrame(() => initialFocusables[0]?.focus());

    // BUG FIX: focusables consultados dinamicamente a cada keydown — captura elementos
    // que aparecem após o mount (ex: mensagem de erro após submit falhado)
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      const focusables = Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTORS));
      if (focusables.length === 0) { e.preventDefault(); return; }
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey) {
        if (document.activeElement === first) { e.preventDefault(); last?.focus(); }
      } else {
        if (document.activeElement === last) { e.preventDefault(); first?.focus(); }
      }
    };

    container.addEventListener('keydown', onKeyDown);
    return () => container.removeEventListener('keydown', onKeyDown);
  }, [active, containerRef]);
}

interface AdminPanelProps {
  embedded?: boolean;
}

// BUG FIX: React.FC removido (deprecated no React 18); tipagem explícita nos parâmetros
const AdminPanel = ({ embedded = false }: AdminPanelProps): React.ReactElement => {
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
  // BUG FIX: pendingRoleChange — role change não dispara API direto no onChange (WCAG SC 3.2.2)
  const [pendingRoleChange, setPendingRoleChange] = useState<{ userId: string; role: RoleType } | null>(null);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [roleLoadingId, setRoleLoadingId] = useState<string | null>(null);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [modulesLoadingId, setModulesLoadingId] = useState<string | null>(null);
  const [modulesSaving, setModulesSaving] = useState(false);
  // BUG FIX: submittingCreate previne duplo submit (sem estado de loading o botão era clicável várias vezes)
  const [submittingCreate, setSubmittingCreate] = useState(false);
  const [temporaryPassword, setTemporaryPassword] = useState<{ username: string; value: string } | null>(null);
  const [modulesTargetUser, setModulesTargetUser] = useState<User | null>(null);
  const [moduleOptions, setModuleOptions] = useState<ModuleOption[]>([]);
  const [nameSortOrder, setNameSortOrder] = useState<'asc' | 'desc'>('asc');

  // BUG FIX: refs para focus trap de cada modal
  const createModalRef = useRef<HTMLDivElement>(null);
  const profileModalRef = useRef<HTMLDivElement>(null);
  const usernameModalRef = useRef<HTMLDivElement>(null);
  const passwordModalRef = useRef<HTMLDivElement>(null);
  const modulesModalRef = useRef<HTMLDivElement>(null);
  const deleteModalRef = useRef<HTMLDivElement>(null);
  const tempPwModalRef = useRef<HTMLDivElement>(null);
  const roleConfirmModalRef = useRef<HTMLDivElement>(null);

  // BUG FIX: ref para retorno de foco ao fechar qualquer modal
  const lastTriggerRef = useRef<HTMLElement | null>(null);

  // BUG FIX: ref para o timer de showSuccess — evita memory leak no unmount
  const successTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Focus traps (todos os modais inline)
  useFocusTrap(createModalRef, showCreateModal);
  useFocusTrap(profileModalRef, showProfileModal);
  useFocusTrap(usernameModalRef, showUsernameModal);
  useFocusTrap(passwordModalRef, showPasswordModal);
  useFocusTrap(modulesModalRef, showModulesModal);
  useFocusTrap(deleteModalRef, deleteConfirm !== null);
  useFocusTrap(tempPwModalRef, temporaryPassword !== null);
  useFocusTrap(roleConfirmModalRef, pendingRoleChange !== null);

  // BUG FIX: cleanup do timer ao desmontar o componente
  useEffect(() => {
    return () => {
      if (successTimerRef.current) clearTimeout(successTimerRef.current);
    };
  }, []);

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
    canManageTcUsers: false,  // F2.4 — só superadmin pode alterar (UI condicional)
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

  // authHeaders mantém useCallback para referência estável.
  // Authorization removido na fase 1.3 (cookie httpOnly cuida da auth).
  const authHeaders = useCallback((): Record<string, string> => ({
    'Content-Type': 'application/json',
  }), []);

  const clearFeedback = useCallback(() => {
    setError(null);
    setSuccessMessage(null);
  }, []);

  // BUG FIX: showSuccess com useRef para não vazar setTimeout no unmount
  const showSuccess = useCallback((message: string) => {
    if (successTimerRef.current) clearTimeout(successTimerRef.current);
    setSuccessMessage(message);
    successTimerRef.current = setTimeout(() => setSuccessMessage(null), 4000);
  }, []);

  // BUG FIX: loadUsers com useCallback e AbortSignal opcional; definido antes do useEffect
  const loadUsers = useCallback(async (signal?: AbortSignal) => {
    try {
      setLoading(true);
      setError(null);
      const response = await fetch(`${API_BASE_URL}/users`, { headers: authHeaders(), signal });
      // BUG FIX: res.ok verificado ANTES de res.json()
      if (!response.ok) {
        const data = await response.json().catch(() => ({})) as { error?: string };
        setError(data.error || 'Erro ao carregar usuários');
        return;
      }
      const data = await response.json();
      // BUG FIX: Array.isArray guard — data.data pode ser objeto truthy não-array
      setUsers(Array.isArray(data.data) ? data.data : []);
    } catch (err) {
      if ((err as Error).name === 'AbortError') return;
      setError('Erro ao conectar com o servidor');
    } finally {
      // BUG FIX: não chama setLoading se o fetch foi abortado — evita setState após unmount
      if (!signal?.aborted) setLoading(false);
    }
  }, [authHeaders]);

  // BUG FIX: AbortController para cancelar fetches ao desmontar; currentUser?.id/role em vez do objeto inteiro
  useEffect(() => {
    if (currentUser?.role !== 'admin' && currentUser?.role !== 'superadmin') return;
    const controller = new AbortController();
    let mounted = true;

    loadUsers(controller.signal);

    fetch(`${API_BASE_URL}/admin/modules`, { headers: authHeaders(), signal: controller.signal })
      // BUG FIX: res.ok verificado antes de .json() no fetch de módulos
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then(d => {
        if (!mounted) return;
        // BUG FIX: Array.isArray guard
        if (d.success) setAllModules(Array.isArray(d.data) ? d.data : []);
      })
      .catch(err => {
        if (!mounted || (err as Error).name === 'AbortError') return;
        // Módulos silenciosamente ignorados — tabela de usuários ainda funciona
      });

    return () => {
      mounted = false;
      controller.abort();
    };
  // BUG FIX: loadUsers e authHeaders incluídos nas deps
  }, [currentUser?.id, currentUser?.role, loadUsers, authHeaders]);

  // BUG FIX: Escape handler inclui os 3 modais que estavam faltando + retorna foco ao trigger
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      const restoreFocus = () => lastTriggerRef.current?.focus();
      if (showModulesModal)        { setShowModulesModal(false);        restoreFocus(); }
      else if (showPasswordModal)  { setShowPasswordModal(false);       restoreFocus(); }
      else if (showUsernameModal)  { setShowUsernameModal(false);       restoreFocus(); }
      else if (showProfileModal)   { setShowProfileModal(false);        restoreFocus(); }
      else if (showCreateModal)    { setShowCreateModal(false);         restoreFocus(); }
      else if (deleteConfirm)      { setDeleteConfirm(null);            restoreFocus(); }
      else if (pendingRoleChange)  { setPendingRoleChange(null);        restoreFocus(); }
      else if (temporaryPassword)  { setTemporaryPassword(null);        restoreFocus(); }
      // BUG FIX: 3 modais que estavam ausentes do handler
      else if (showCreationTypeModal) setShowCreationTypeModal(false);
      else if (showUserCreatedModal)  setShowUserCreatedModal(false);
      else if (showCompleteModal)     setShowCompleteModal(false);
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [
    showModulesModal, showPasswordModal, showUsernameModal, showProfileModal, showCreateModal,
    deleteConfirm, pendingRoleChange, temporaryPassword,
    showCreationTypeModal, showUserCreatedModal, showCompleteModal,
  ]);

  const sortedUsers = useMemo(() => {
    const list = [...users];
    list.sort((a, b) => {
      const comparison = a.username.localeCompare(b.username, 'pt-BR', { sensitivity: 'base' });
      return nameSortOrder === 'asc' ? comparison : -comparison;
    });
    return list;
  }, [users, nameSortOrder]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    clearFeedback();
    // BUG FIX: username extraído uma vez (era chamado .trim() duas vezes)
    const username = createForm.username.trim();
    if (!username || username.length < 3) {
      setError('Nome de usuário deve ter pelo menos 3 caracteres');
      return;
    }
    if (createForm.modules.length === 0) {
      setError('Selecione pelo menos um módulo');
      return;
    }
    setSubmittingCreate(true);
    try {
      const response = await fetch(`${API_BASE_URL}/users`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ username, role: createForm.role, isActive: createForm.isActive, modules: createForm.modules }),
      });
      // BUG FIX: res.ok antes de res.json()
      if (!response.ok) {
        const data = await response.json().catch(() => ({})) as { error?: string };
        setError(data.error || 'Erro ao criar usuário');
        return;
      }
      const data = await response.json();
      setShowCreateModal(false);
      // BUG FIX: spread para não reusar a mesma referência de array de DEFAULT_CREATE_FORM
      setCreateForm({ ...DEFAULT_CREATE_FORM, modules: [...DEFAULT_CREATE_FORM.modules] });
      setCreatedUserData({ username, role: createForm.role, tempPassword: data.temporaryPassword });
      setShowUserCreatedModal(true);
      await loadUsers();
      lastTriggerRef.current?.focus();
    } catch {
      setError('Erro ao conectar com o servidor');
    } finally {
      setSubmittingCreate(false);
    }
  };

  const openProfileModal = useCallback((user: User) => {
    clearFeedback();
    lastTriggerRef.current = document.activeElement as HTMLElement;
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
      canManageTcUsers: user.canManageTcUsers === true,
      address: {
        cep: user.address?.cep || '',
        street: user.address?.street || '',
        number: user.address?.number || '',
        complement: user.address?.complement || '',
        neighborhood: user.address?.neighborhood || '',
        city: user.address?.city || '',
        state: user.address?.state || '',
      },
    });
    setShowProfileModal(true);
  }, [clearFeedback]);

  const openUsernameModal = useCallback((user: User) => {
    clearFeedback();
    lastTriggerRef.current = document.activeElement as HTMLElement;
    setEditingUser(user);
    setUsernameForm({ username: user.username });
    setShowUsernameModal(true);
  }, [clearFeedback]);

  const openPasswordModal = useCallback((user: User) => {
    clearFeedback();
    lastTriggerRef.current = document.activeElement as HTMLElement;
    setEditingUser(user);
    setPasswordForm({ password: '', confirmPassword: '' });
    setShowPasswordModal(true);
  }, [clearFeedback]);

  // Permissões granulares de regras de transação (migration 018)
  const [rulePerms, setRulePerms] = useState<{ can_create: boolean; can_edit: boolean; can_delete: boolean; is_admin_bypass?: boolean }>({ can_create: false, can_edit: false, can_delete: false });

  const openModulesModal = useCallback(async (user: User) => {
    clearFeedback();
    lastTriggerRef.current = document.activeElement as HTMLElement;
    setModulesLoadingId(user.id);
    try {
      const response = await fetch(`${API_BASE_URL}/users/${user.id}/modules`, { headers: authHeaders() });
      // BUG FIX: res.ok antes de res.json()
      if (!response.ok) {
        const data = await response.json().catch(() => ({})) as { error?: string };
        setError(data.error || 'Erro ao carregar módulos do usuário');
        return;
      }
      const data = await response.json();
      setModulesTargetUser(user);
      // BUG FIX: Array.isArray guard
      setModuleOptions(Array.isArray(data.data) ? data.data : []);

      // Carrega permissões de regras
      try {
        const r2 = await fetch(`${API_BASE_URL}/users/${user.id}/rule-permissions`, { headers: authHeaders() });
        const j2 = await r2.json();
        if (j2.success) setRulePerms(j2.data);
        else setRulePerms({ can_create: false, can_edit: false, can_delete: false });
      } catch {
        setRulePerms({ can_create: false, can_edit: false, can_delete: false });
      }

      setShowModulesModal(true);
    } catch {
      setError('Erro ao conectar com o servidor');
    } finally {
      setModulesLoadingId(null);
    }
  }, [authHeaders, clearFeedback]);

  const toggleModuleOption = useCallback((moduleKey: string) => {
    setModuleOptions(previous =>
      previous.map(option =>
        option.moduleKey === moduleKey ? { ...option, enabled: !option.enabled } : option
      )
    );
  }, []);

  const handleSaveModules = useCallback(async () => {
    if (!modulesTargetUser) return;
    clearFeedback();
    setModulesSaving(true);
    try {
      const selectedKeys = moduleOptions.filter(o => o.enabled).map(o => o.moduleKey);
      const response = await fetch(`${API_BASE_URL}/users/${modulesTargetUser.id}/modules`, {
        method: 'PUT',
        headers: authHeaders(),
        body: JSON.stringify({ moduleKeys: selectedKeys }),
      });
      // BUG FIX: res.ok antes de res.json()
      if (!response.ok) {
        const data = await response.json().catch(() => ({})) as { error?: string };
        setError(data.error || 'Erro ao salvar módulos do usuário');
        return;
      }

      // Salva permissões granulares de regras (apenas para usuários não-admin —
      // admin/superadmin têm bypass e não precisam de linha em user_rule_permissions)
      if (!rulePerms.is_admin_bypass) {
        await fetch(`${API_BASE_URL}/users/${modulesTargetUser.id}/rule-permissions`, {
          method: 'PUT',
          headers: authHeaders(),
          body: JSON.stringify({ can_create: rulePerms.can_create, can_edit: rulePerms.can_edit, can_delete: rulePerms.can_delete }),
        });
      }

      showSuccess('Módulos e permissões atualizados com sucesso!');
      setShowModulesModal(false);
      setModulesTargetUser(null);
      setModuleOptions([]);
      lastTriggerRef.current?.focus();
    } catch {
      setError('Erro ao conectar com o servidor');
    } finally {
      setModulesSaving(false);
    }
  }, [modulesTargetUser, moduleOptions, rulePerms, authHeaders, clearFeedback, showSuccess]);

  // BUG FIX: res.ok verificado ANTES de res.json() em updateUser
  const updateUser = useCallback(async (userId: string, payload: Record<string, unknown>, successText: string) => {
    const response = await fetch(`${API_BASE_URL}/users/${userId}`, {
      method: 'PUT',
      headers: authHeaders(),
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      const data = await response.json().catch(() => ({})) as { error?: string };
      throw new Error(data.error || 'Erro ao atualizar usuário');
    }
    showSuccess(successText);
    await loadUsers();
  }, [authHeaders, showSuccess, loadUsers]);

  const handleProfileUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;
    clearFeedback();
    try {
      // F2.4: só inclui o campo se o requester é superadmin (backend também valida)
      const tcUsersPayload =
        currentUser?.role === 'superadmin'
          ? { canManageTcUsers: profileForm.canManageTcUsers }
          : {};

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
          ...tcUsersPayload,
          address: {
            cep: profileForm.address.cep.trim(),
            street: profileForm.address.street.trim(),
            number: profileForm.address.number.trim(),
            complement: profileForm.address.complement.trim(),
            neighborhood: profileForm.address.neighborhood.trim(),
            city: profileForm.address.city.trim(),
            state: profileForm.address.state.trim().toUpperCase(),
          },
        },
        'Cadastro do usuário atualizado com sucesso!'
      );

      // BUG FIX: erros de permissões legais agora surfaceados — dado não é perdido silenciosamente
      if (currentUser?.role === 'superadmin' && editingUser.role === 'admin') {
        try {
          const permRes = await fetch(`${API_BASE_URL}/admin/permissoes-legais/${editingUser.id}`, {
            method: 'PUT',
            headers: authHeaders(),
            body: JSON.stringify({ permissoes: permissoesLegaisForm }),
          });
          if (!permRes.ok) {
            const permData = await permRes.json().catch(() => ({})) as { error?: string };
            setError(permData.error || 'Erro ao salvar permissões legais');
            return; // mantém modal aberto para nova tentativa
          }
        } catch {
          setError('Erro ao salvar permissões legais');
          return;
        }
      }

      setShowProfileModal(false);
      setEditingUser(null);
      lastTriggerRef.current?.focus();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao atualizar cadastro');
    }
  };

  const handleUsernameUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;
    clearFeedback();
    try {
      await updateUser(editingUser.id, { username: usernameForm.username.trim() }, 'Nome de usuário atualizado com sucesso!');
      setShowUsernameModal(false);
      setEditingUser(null);
      lastTriggerRef.current?.focus();
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
      await updateUser(editingUser.id, { password: passwordForm.password }, 'Senha alterada com sucesso!');
      setShowPasswordModal(false);
      setEditingUser(null);
      setPasswordForm({ password: '', confirmPassword: '' });
      lastTriggerRef.current?.focus();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao alterar senha');
    }
  };

  // BUG FIX: handleRoleChange agora é chamado via modal de confirmação, não direto no onChange do select
  const handleRoleChange = useCallback(async (userId: string, role: RoleType) => {
    clearFeedback();
    setRoleLoadingId(userId);
    try {
      await updateUser(userId, { role }, 'Permissão atualizada com sucesso!');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao atualizar permissão');
    } finally {
      setRoleLoadingId(null);
      setPendingRoleChange(null);
      lastTriggerRef.current?.focus();
    }
  }, [updateUser, clearFeedback]);

  const handleResetPassword = useCallback(async (user: User) => {
    clearFeedback();
    setActionLoadingId(user.id);
    try {
      const response = await fetch(`${API_BASE_URL}/users/${user.id}/reset-password`, {
        method: 'POST',
        headers: authHeaders(),
      });
      // BUG FIX: res.ok antes de res.json()
      if (!response.ok) {
        const data = await response.json().catch(() => ({})) as { error?: string };
        setError(data.error || 'Erro ao resetar senha');
        return;
      }
      const data = await response.json();
      setTemporaryPassword({ username: user.username, value: data.temporaryPassword });
      showSuccess('Senha resetada com sucesso!');
    } catch {
      setError('Erro ao conectar com o servidor');
    } finally {
      setActionLoadingId(null);
    }
  }, [authHeaders, clearFeedback, showSuccess]);

  const handleToggleActive = useCallback(async (user: User) => {
    clearFeedback();
    setActionLoadingId(user.id);
    try {
      // BUG FIX: ?? true para tratar undefined como ativo (clarifica a lógica double-negative)
      const currentlyActive = user.isActive ?? true;
      await updateUser(
        user.id,
        { isActive: !currentlyActive },
        currentlyActive ? 'Usuário desativado com sucesso!' : 'Usuário reativado com sucesso!'
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao alterar status do usuário');
    } finally {
      setActionLoadingId(null);
    }
  }, [updateUser, clearFeedback]);

  const handleDelete = useCallback(async (userId: string) => {
    clearFeedback();
    setActionLoadingId(userId);
    try {
      const response = await fetch(`${API_BASE_URL}/users/${userId}`, {
        method: 'DELETE',
        headers: authHeaders(),
      });
      // BUG FIX: res.ok antes de res.json()
      if (!response.ok) {
        const data = await response.json().catch(() => ({})) as { error?: string };
        setError(data.error || 'Erro ao excluir usuário');
        return;
      }
      setDeleteConfirm(null);
      showSuccess('Usuário excluído com sucesso!');
      await loadUsers();
      lastTriggerRef.current?.focus();
    } catch {
      setError('Erro ao conectar com o servidor');
    } finally {
      setActionLoadingId(null);
    }
  }, [authHeaders, clearFeedback, showSuccess, loadUsers]);

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
        <div className="mb-6">
          <h2 className="text-3xl font-bold text-gray-900 mb-2">Painel Administrativo</h2>
          <p className="text-gray-600">Gerencie usuários, permissões e credenciais</p>
        </div>
      )}
      <div className="mb-6 flex justify-end">
        <button
          type="button"
          onClick={() => {
            clearFeedback();
            lastTriggerRef.current = document.activeElement as HTMLElement;
            setShowCreationTypeModal(true);
          }}
          className="flex items-center gap-3 px-6 py-3 bg-gradient-to-r from-blue-500 to-indigo-600 text-white font-semibold rounded-xl hover:from-blue-600 hover:to-indigo-700 shadow-lg hover:shadow-xl transform hover:-translate-y-1 transition-all duration-300"
        >
          <UserPlus className="h-5 w-5" aria-hidden="true" />
          Novo Usuário
        </button>
      </div>

      {/* BUG FIX: role="alert" aria-live="assertive" para erros; role="status" aria-live="polite" para sucesso */}
      <div role="alert" aria-live="assertive" aria-atomic="true">
        {error && (
          <div className="mb-4 bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-lg">{error}</div>
        )}
      </div>
      <div role="status" aria-live="polite" aria-atomic="true">
        {successMessage && (
          <div className="mb-4 bg-green-50 border border-green-200 text-green-800 px-4 py-3 rounded-lg">{successMessage}</div>
        )}
      </div>

      {loading ? (
        // BUG FIX: role="status" e aria-label para leitores de tela
        <div role="status" aria-label="Carregando usuários..." className="flex justify-center items-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600" aria-hidden="true"></div>
        </div>
      ) : (
        <div className="bg-[#ffffff] dark:!bg-[#243040] rounded-lg shadow-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-[1180px] w-full divide-y divide-gray-200">
              <thead className="bg-gradient-to-r from-blue-500 to-indigo-600">
                <tr>
                  {/* BUG FIX: scope="col" em todos os <th>; aria-sort no cabeçalho ordenável */}
                  <th scope="col" className="px-4 py-3 text-left"
                    aria-sort={nameSortOrder === 'asc' ? 'ascending' : 'descending'}>
                    <button
                      type="button"
                      onClick={() => setNameSortOrder(prev => prev === 'asc' ? 'desc' : 'asc')}
                      className="inline-flex items-center gap-2 text-xs font-bold text-white uppercase tracking-wide hover:text-white/80"
                      title={`Ordenar por nome (${nameSortOrder === 'asc' ? 'crescente' : 'decrescente'})`}
                    >
                      <span>Usuário</span>
                      {/* BUG FIX: aria-hidden no triângulo decorativo */}
                      <span className="text-[10px]" aria-hidden="true">
                        {nameSortOrder === 'asc' ? '▲' : '▼'}
                      </span>
                    </button>
                  </th>
                  <th scope="col" className="px-4 py-3 text-left text-xs font-bold text-white uppercase tracking-wide">Role</th>
                  <th scope="col" className="px-4 py-3 text-left text-xs font-bold text-white uppercase tracking-wide">Cadastro</th>
                  <th scope="col" className="px-4 py-3 text-left text-xs font-bold text-white uppercase tracking-wide">Módulos</th>
                  <th scope="col" className="px-4 py-3 text-left text-xs font-bold text-white uppercase tracking-wide">Credenciais</th>
                  <th scope="col" className="px-4 py-3 text-left text-xs font-bold text-white uppercase tracking-wide">Status</th>
                  <th scope="col" className="px-4 py-3 text-right text-xs font-bold text-white uppercase tracking-wide">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {/* BUG FIX: sortedUsers.length em vez de users.length para consistência */}
                {sortedUsers.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-6 py-8 text-center text-gray-500">Nenhum usuário encontrado</td>
                  </tr>
                ) : (
                  sortedUsers.map((user, index) => {
                    const isCurrent = user.id === currentUser?.id;
                    // BUG FIX: ?? true em vez de !== false (mais claro, mesmo resultado)
                    const isActive = user.isActive ?? true;
                    const isSuperadminTarget = user.role === 'superadmin' && currentUser?.role !== 'superadmin';

                    return (
                      <tr key={user.id} className={
                        isSuperadminTarget
                          ? 'bg-gray-50 dark:bg-gray-700/30 opacity-60'
                          : !isActive
                            ? 'bg-gray-50 dark:bg-gray-700/30'
                            : `${index % 2 === 0 ? 'imp-row-even' : 'imp-row-odd'}`
                      }>
                        <td className="px-4 py-4">
                          <div className="flex items-center gap-3">
                            <div className="flex-shrink-0 h-10 w-10 rounded-full bg-blue-100 flex items-center justify-center" aria-hidden="true">
                              <span className="text-blue-600 font-semibold">{user.username.charAt(0).toUpperCase()}</span>
                            </div>
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-semibold text-gray-900">{user.username}</span>
                                <button
                                  type="button"
                                  onClick={() => openUsernameModal(user)}
                                  className="p-1 text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded"
                                  aria-label={`Alterar nome de usuário de ${user.username}`}
                                  disabled={isSuperadminTarget}
                                  aria-disabled={isSuperadminTarget}
                                >
                                  <Pencil className="h-4 w-4" aria-hidden="true" />
                                </button>
                              </div>
                              {isCurrent && <div className="text-xs text-gray-500">(Você)</div>}
                            </div>
                          </div>
                        </td>

                        <td className="px-4 py-4">
                          <div className="flex items-center gap-2">
                            {/* BUG FIX: onChange abre confirmação (pendingRoleChange), não dispara API diretamente */}
                            <select
                              value={user.role}
                              onChange={e => {
                                lastTriggerRef.current = document.activeElement as HTMLElement;
                                setPendingRoleChange({ userId: user.id, role: e.target.value as RoleType });
                              }}
                              disabled={roleLoadingId === user.id || isSuperadminTarget}
                              aria-disabled={isSuperadminTarget}
                              // BUG FIX: aria-label — select sem label acessível
                              aria-label={`Função de ${user.username}`}
                              className="px-2 py-1 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            >
                              {currentUser?.role === 'superadmin' && <option value="superadmin">Super Administrador</option>}
                              <option value="admin">Administrador</option>
                              <option value="user">Usuário</option>
                              <option value="guest">Convidado</option>
                            </select>
                            {/* BUG FIX: role="status" + aria-live no indicador de loading */}
                            {roleLoadingId === user.id && (
                              <span role="status" aria-label="Salvando função..." aria-live="polite" className="text-xs text-gray-500">...</span>
                            )}
                          </div>
                        </td>

                        <td className="px-4 py-4">
                          <button
                            type="button"
                            onClick={() => openProfileModal(user)}
                            className="inline-flex items-center gap-2 px-3 py-1.5 text-sm text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-md"
                            disabled={isSuperadminTarget}
                            aria-disabled={isSuperadminTarget}
                          >
                            <Edit className="h-4 w-4" aria-hidden="true" />
                            Editar cadastro
                          </button>
                        </td>

                        <td className="px-4 py-4">
                          <button
                            type="button"
                            onClick={() => openModulesModal(user)}
                            className="inline-flex items-center gap-2 px-3 py-1.5 text-sm text-indigo-700 bg-indigo-50 hover:bg-indigo-100 rounded-md"
                            disabled={modulesLoadingId === user.id || isSuperadminTarget}
                            aria-disabled={isSuperadminTarget}
                          >
                            <Settings2 className="h-4 w-4" aria-hidden="true" />
                            {modulesLoadingId === user.id ? 'Carregando...' : 'Configurar'}
                          </button>
                        </td>

                        <td className="px-4 py-4">
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => openPasswordModal(user)}
                              className="p-2 text-amber-700 hover:text-amber-900 hover:bg-amber-50 rounded"
                              aria-label={`Alterar senha de ${user.username}`}
                              disabled={isSuperadminTarget}
                              aria-disabled={isSuperadminTarget}
                            >
                              <KeyRound className="h-4 w-4" aria-hidden="true" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleResetPassword(user)}
                              className="p-2 text-indigo-700 hover:text-indigo-900 hover:bg-indigo-50 rounded"
                              aria-label={`Resetar senha de ${user.username}`}
                              disabled={actionLoadingId === user.id || isSuperadminTarget}
                              aria-disabled={isSuperadminTarget}
                            >
                              <RotateCcw className="h-4 w-4" aria-hidden="true" />
                            </button>
                            {currentUser?.role === 'superadmin' && !isCurrent && (
                              <button
                                type="button"
                                onClick={async () => {
                                  try {
                                    const ok = await startImpersonation(user.id);
                                    // BUG FIX: alert() substituído por setError()
                                    if (!ok) setError('Erro ao iniciar representação de usuário');
                                  } catch {
                                    setError('Erro ao iniciar representação de usuário');
                                  }
                                }}
                                className="p-2 text-amber-700 hover:text-amber-900 hover:bg-amber-50 rounded"
                                aria-label={`Representar usuário ${user.username}`}
                              >
                                <UserCircle2 className="h-4 w-4" aria-hidden="true" />
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
                                  type="button"
                                  onClick={() => handleToggleActive(user)}
                                  className="p-2 text-gray-700 hover:text-gray-900 hover:bg-gray-100 rounded"
                                  aria-label={isActive ? `Desativar ${user.username}` : `Reativar ${user.username}`}
                                  disabled={actionLoadingId === user.id || isSuperadminTarget}
                                  aria-disabled={isSuperadminTarget}
                                >
                                  <Lock className={`h-4 w-4 ${isActive ? '' : 'text-emerald-700'}`} aria-hidden="true" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    lastTriggerRef.current = document.activeElement as HTMLElement;
                                    setDeleteConfirm(user.id);
                                  }}
                                  className="p-2 text-red-600 hover:text-red-800 hover:bg-red-50 rounded"
                                  aria-label={`Excluir usuário ${user.username}`}
                                  disabled={actionLoadingId === user.id || isSuperadminTarget}
                                  aria-disabled={isSuperadminTarget}
                                >
                                  <Trash2 className="h-4 w-4" aria-hidden="true" />
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
        {/* ── Modal: Criar usuário ── */}
        {showCreateModal && (() => {
          const roleOptions = [
            ...(currentUser?.role === 'superadmin' ? [{ value: 'superadmin' as RoleType, label: 'Super Administrador', description: 'Acesso total ao sistema' }] : []),
            { value: 'admin' as RoleType, label: 'Administrador', description: 'Gerencia usuários e módulos' },
            { value: 'user' as RoleType, label: 'Usuário', description: 'Acesso padrão ao sistema' },
            { value: 'guest' as RoleType, label: 'Convidado', description: 'Acesso somente leitura' },
          ];
          const visibleModules = allModules.filter(m =>
            !(SUPERADMIN_MODULES.includes(m.moduleKey) && currentUser?.role !== 'superadmin')
          );
          return (
            <div
              className="fixed inset-0 bg-gradient-to-br from-blue-900/50 to-indigo-900/50 backdrop-blur-sm flex items-center justify-center z-[10001]"
              onClick={() => { setShowCreateModal(false); lastTriggerRef.current?.focus(); }}
            >
              {/* BUG FIX: role="dialog", aria-modal, aria-labelledby */}
              <div
                ref={createModalRef}
                role="dialog"
                aria-modal="true"
                aria-labelledby="create-modal-title"
                className="bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl"
                onClick={e => e.stopPropagation()}
              >
                <div className="bg-gradient-to-r from-blue-50 to-indigo-50 px-6 py-4 border-b border-blue-200/50 rounded-t-2xl flex items-center justify-between">
                  <h2 id="create-modal-title" className="text-xl font-bold text-blue-900 flex items-center gap-2">
                    <UserPlus className="w-6 h-6 text-blue-700" aria-hidden="true" />
                    Novo Usuário
                  </h2>
                  {/* BUG FIX: type="button" — sem isso, dentro de <form> submete o form */}
                  <button
                    type="button"
                    onClick={() => { setShowCreateModal(false); lastTriggerRef.current?.focus(); }}
                    className="text-blue-600 hover:text-blue-800 hover:bg-blue-100 p-2 rounded-full transition-all"
                    aria-label="Fechar"
                  >
                    <X className="w-5 h-5" aria-hidden="true" />
                  </button>
                </div>

                <form onSubmit={handleCreate} className="p-6 space-y-6">
                  {error && (
                    <div role="alert" className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-800">{error}</div>
                  )}

                  <div>
                    <label htmlFor="new-username" className="block text-sm font-semibold text-gray-700 mb-2">
                      Nome de Usuário *
                    </label>
                    <input
                      id="new-username"
                      type="text"
                      value={createForm.username}
                      onChange={e => setCreateForm({ ...createForm, username: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      placeholder="Digite o nome de usuário"
                      required
                    />
                    <p className="mt-1 text-xs text-gray-500">Este será o login do usuário. Uma senha temporária será gerada automaticamente.</p>
                  </div>

                  {/* BUG FIX: fieldset + legend em vez de label + div para grupo de radios */}
                  <fieldset>
                    <legend className="block text-sm font-semibold text-gray-700 mb-3">Função *</legend>
                    <div className="grid gap-3">
                      {roleOptions.map(option => (
                        <label
                          key={option.value}
                          className={`relative flex items-start p-4 border-2 rounded-lg cursor-pointer transition-all ${createForm.role === option.value ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-blue-300'}`}
                        >
                          <input
                            type="radio"
                            name="role"
                            value={option.value}
                            checked={createForm.role === option.value}
                            onChange={e => setCreateForm({ ...createForm, role: e.target.value as RoleType, modules: getDefaultModulesForRole(e.target.value as RoleType) })}
                            className="sr-only"
                          />
                          <div className="flex items-center gap-3 flex-1">
                            <Shield className={`w-5 h-5 ${createForm.role === option.value ? 'text-blue-600' : 'text-gray-400'}`} aria-hidden="true" />
                            <div className="flex-1">
                              <p className="font-medium text-gray-900">{option.label}</p>
                              <p className="text-sm text-gray-500">{option.description}</p>
                            </div>
                            {createForm.role === option.value && <Check className="w-5 h-5 text-blue-600" aria-hidden="true" />}
                          </div>
                        </label>
                      ))}
                    </div>
                  </fieldset>

                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">Status</label>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={createForm.isActive}
                        onChange={e => setCreateForm({ ...createForm, isActive: e.target.checked })}
                        className="sr-only peer"
                      />
                      {/* BUG FIX: aria-hidden no div decorativo do toggle */}
                      <div
                        aria-hidden="true"
                        className="w-11 h-6 bg-gray-200 peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"
                      ></div>
                      <span className="ml-3 text-sm font-medium text-gray-900">{createForm.isActive ? 'Ativo' : 'Inativo'}</span>
                    </label>
                  </div>

                  {/* BUG FIX: fieldset + legend para grupo de checkboxes de módulos */}
                  {visibleModules.length > 0 && (
                    <fieldset>
                      <legend className="block text-sm font-semibold text-gray-700 mb-2">Módulos de Acesso *</legend>
                      <p className="text-xs text-gray-500 mb-3">
                        Pré-selecionados para <span className="font-semibold">{roleOptions.find(r => r.value === createForm.role)?.label}</span>. Ajuste conforme necessário.
                      </p>
                      <div className="grid grid-cols-2 gap-2 p-4 bg-gray-50 rounded-lg border border-gray-200">
                        {visibleModules.map(m => (
                          <label
                            key={m.moduleKey}
                            className={`flex items-center gap-2 p-2 rounded-lg cursor-pointer transition-colors ${createForm.modules.includes(m.moduleKey) ? 'bg-blue-100 text-blue-900' : 'bg-white text-gray-700 hover:bg-gray-100'}`}
                          >
                            <input
                              type="checkbox"
                              checked={createForm.modules.includes(m.moduleKey)}
                              onChange={() => setCreateForm(prev => ({
                                ...prev,
                                modules: prev.modules.includes(m.moduleKey)
                                  ? prev.modules.filter(k => k !== m.moduleKey)
                                  : [...prev.modules, m.moduleKey],
                              }))}
                              className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                            />
                            <span className="text-sm font-medium">{m.moduleName}</span>
                          </label>
                        ))}
                      </div>
                    </fieldset>
                  )}

                  <div className="p-4 bg-blue-50 rounded-lg border border-blue-200 text-sm text-blue-800">
                    <p className="font-semibold mb-1">Informações</p>
                    <ul className="space-y-1 text-xs">
                      <li>• Uma senha temporária será gerada automaticamente</li>
                      <li>• O usuário deverá alterar a senha no primeiro acesso</li>
                      <li>• Você pode editar o perfil completo depois</li>
                    </ul>
                  </div>

                  <div className="flex justify-end gap-3 pt-2 border-t">
                    <button
                      type="button"
                      onClick={() => { setShowCreateModal(false); lastTriggerRef.current?.focus(); }}
                      className="px-4 py-2 text-gray-700 font-medium hover:text-gray-900 transition-colors"
                    >
                      Cancelar
                    </button>
                    {/* BUG FIX: disabled enquanto submitting — previne criação duplicada por duplo clique */}
                    <button
                      type="submit"
                      disabled={submittingCreate}
                      className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium flex items-center gap-2 disabled:opacity-70"
                    >
                      <UserPlus className="w-4 h-4" aria-hidden="true" />
                      {submittingCreate ? 'Criando...' : 'Criar Usuário'}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          );
        })()}

        {/* ── Modal: Editar perfil ── */}
        {showProfileModal && editingUser && (
          <div
            className="fixed inset-0 bg-gradient-to-br from-blue-900/50 to-indigo-900/50 backdrop-blur-sm flex items-center justify-center z-[10001]"
            onClick={() => { setShowProfileModal(false); lastTriggerRef.current?.focus(); }}
          >
            <div
              ref={profileModalRef}
              role="dialog"
              aria-modal="true"
              aria-labelledby="profile-modal-title"
              className="bg-[#ffffff] dark:!bg-[#243040] rounded-lg p-6 w-full max-w-3xl max-h-[90vh] overflow-y-auto"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex justify-between items-center mb-4">
                <h2 id="profile-modal-title" className="text-xl font-bold text-gray-900">
                  Editar cadastro de {editingUser.username}
                </h2>
                <button
                  type="button"
                  onClick={() => { setShowProfileModal(false); lastTriggerRef.current?.focus(); }}
                  className="text-gray-400 hover:text-gray-600"
                  aria-label="Fechar"
                >
                  <X className="h-6 w-6" aria-hidden="true" />
                </button>
              </div>
              <form onSubmit={handleProfileUpdate}>
                <div className="space-y-6">
                  {/* BUG FIX: fieldset + legend em vez de div + h3 para grupos de campos */}
                  <fieldset>
                    <legend className="text-sm font-semibold text-gray-700 mb-3">Dados pessoais</legend>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {/* BUG FIX: labels sr-only em todos os inputs — placeholder não é suficiente */}
                      <div>
                        <label htmlFor="p-firstName" className="sr-only">Nome</label>
                        <input id="p-firstName" type="text" placeholder="Nome" value={profileForm.firstName}
                          onChange={e => setProfileForm({ ...profileForm, firstName: e.target.value })}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg" />
                      </div>
                      <div>
                        <label htmlFor="p-lastName" className="sr-only">Sobrenome</label>
                        <input id="p-lastName" type="text" placeholder="Sobrenome" value={profileForm.lastName}
                          onChange={e => setProfileForm({ ...profileForm, lastName: e.target.value })}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg" />
                      </div>
                      <div className="md:col-span-2">
                        <label htmlFor="p-email" className="sr-only">Email</label>
                        <input id="p-email" type="email" placeholder="Email" value={profileForm.email}
                          onChange={e => setProfileForm({ ...profileForm, email: e.target.value })}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg" />
                      </div>
                      <div>
                        <label htmlFor="p-phone" className="sr-only">Telefone</label>
                        <input id="p-phone" type="text" placeholder="Telefone" value={profileForm.phone}
                          onChange={e => setProfileForm({ ...profileForm, phone: e.target.value })}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg" />
                      </div>
                      <div>
                        <label htmlFor="p-cpf" className="sr-only">CPF</label>
                        <input id="p-cpf" type="text" placeholder="CPF" value={profileForm.cpf}
                          onChange={e => setProfileForm({ ...profileForm, cpf: e.target.value })}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg" />
                      </div>
                      <div>
                        <label htmlFor="p-birthDate" className="sr-only">Data de nascimento</label>
                        <input id="p-birthDate" type="date" placeholder="Data de nascimento" value={profileForm.birthDate}
                          onChange={e => setProfileForm({ ...profileForm, birthDate: e.target.value })}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg" />
                      </div>
                      <div>
                        <label htmlFor="p-gender" className="sr-only">Gênero</label>
                        <select id="p-gender" value={profileForm.gender}
                          onChange={e => setProfileForm({ ...profileForm, gender: e.target.value })}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg">
                          <option value="">Gênero</option>
                          <option value="masculino">Masculino</option>
                          <option value="feminino">Feminino</option>
                          <option value="outro">Outro</option>
                          <option value="prefiro-nao-informar">Prefiro não informar</option>
                        </select>
                      </div>
                      <div>
                        <label htmlFor="p-position" className="sr-only">Cargo</label>
                        <input id="p-position" type="text" placeholder="Cargo" value={profileForm.position}
                          onChange={e => setProfileForm({ ...profileForm, position: e.target.value })}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg" />
                      </div>
                    </div>
                  </fieldset>

                  <fieldset>
                    <legend className="text-sm font-semibold text-gray-700 mb-3">Endereço</legend>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div>
                        <label htmlFor="p-cep" className="sr-only">CEP</label>
                        <input id="p-cep" type="text" placeholder="CEP" value={profileForm.address.cep}
                          onChange={e => setProfileForm({ ...profileForm, address: { ...profileForm.address, cep: e.target.value } })}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg" />
                      </div>
                      <div>
                        <label htmlFor="p-street" className="sr-only">Rua / Logradouro</label>
                        <input id="p-street" type="text" placeholder="Rua / Logradouro" value={profileForm.address.street}
                          onChange={e => setProfileForm({ ...profileForm, address: { ...profileForm.address, street: e.target.value } })}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg" />
                      </div>
                      <div>
                        <label htmlFor="p-number" className="sr-only">Número</label>
                        <input id="p-number" type="text" placeholder="Número" value={profileForm.address.number}
                          onChange={e => setProfileForm({ ...profileForm, address: { ...profileForm.address, number: e.target.value } })}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg" />
                      </div>
                      <div>
                        <label htmlFor="p-complement" className="sr-only">Complemento</label>
                        <input id="p-complement" type="text" placeholder="Complemento" value={profileForm.address.complement}
                          onChange={e => setProfileForm({ ...profileForm, address: { ...profileForm.address, complement: e.target.value } })}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg" />
                      </div>
                      <div>
                        <label htmlFor="p-neighborhood" className="sr-only">Bairro</label>
                        <input id="p-neighborhood" type="text" placeholder="Bairro" value={profileForm.address.neighborhood}
                          onChange={e => setProfileForm({ ...profileForm, address: { ...profileForm.address, neighborhood: e.target.value } })}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg" />
                      </div>
                      <div>
                        <label htmlFor="p-city" className="sr-only">Cidade</label>
                        <input id="p-city" type="text" placeholder="Cidade" value={profileForm.address.city}
                          onChange={e => setProfileForm({ ...profileForm, address: { ...profileForm.address, city: e.target.value } })}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg" />
                      </div>
                      <div>
                        <label htmlFor="p-state" className="sr-only">UF</label>
                        <input id="p-state" type="text" placeholder="UF" maxLength={2} value={profileForm.address.state}
                          onChange={e => setProfileForm({ ...profileForm, address: { ...profileForm.address, state: e.target.value.toUpperCase() } })}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg" />
                      </div>
                    </div>
                  </fieldset>
                </div>

                {/* F2.4 — switch de permissão delegada (só superadmin vê e altera) */}
                {currentUser?.role === 'superadmin' && (
                  <fieldset className="mt-6">
                    <legend className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-1.5">
                      <Shield className="h-4 w-4 text-emerald-600" aria-hidden="true" /> Permissões TerraControl
                    </legend>
                    <label className="flex items-start gap-3 p-4 bg-emerald-50 rounded-xl border border-emerald-100 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={profileForm.canManageTcUsers}
                        onChange={e => setProfileForm({ ...profileForm, canManageTcUsers: e.target.checked })}
                        className="mt-0.5 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
                      />
                      <div>
                        <div className="text-sm font-semibold text-gray-800">Pode gerenciar usuários TerraControl</div>
                        <div className="text-xs text-gray-600 mt-0.5">
                          Quando ligado, este usuário (mesmo sem ser admin) pode acessar o painel
                          "Usuários TerraControl" e cadastrar/editar/desativar tc_users. Útil para
                          delegar a gestão a um parceiro que só precisa dessa função do sistema.
                        </div>
                      </div>
                    </label>
                  </fieldset>
                )}

                {currentUser?.role === 'superadmin' && editingUser.role === 'admin' && (
                  <fieldset className="mt-6">
                    <legend className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-1.5">
                      <Shield className="h-4 w-4 text-blue-600" aria-hidden="true" /> Permissões Legais (LGPD)
                    </legend>
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
                  </fieldset>
                )}

                <div className="mt-6 flex justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => { setShowProfileModal(false); lastTriggerRef.current?.focus(); }}
                    className="px-4 py-2 text-gray-700 dark:text-gray-200 bg-gray-100 dark:!bg-[#2d3f52] rounded-lg hover:bg-gray-200 dark:hover:!bg-[#354b60]"
                  >
                    Cancelar
                  </button>
                  <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2">
                    <Save className="h-4 w-4" aria-hidden="true" />
                    Salvar cadastro
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* ── Modal: Alterar username ── */}
        {showUsernameModal && editingUser && (
          <div
            className="fixed inset-0 bg-gradient-to-br from-blue-900/50 to-indigo-900/50 backdrop-blur-sm flex items-center justify-center z-[10001]"
            onClick={() => { setShowUsernameModal(false); lastTriggerRef.current?.focus(); }}
          >
            <div
              ref={usernameModalRef}
              role="dialog"
              aria-modal="true"
              aria-labelledby="username-modal-title"
              className="bg-[#ffffff] dark:!bg-[#243040] rounded-lg p-6 w-full max-w-md"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex justify-between items-center mb-4">
                <h2 id="username-modal-title" className="text-xl font-bold text-gray-900">Alterar nome de usuário</h2>
                <button
                  type="button"
                  onClick={() => { setShowUsernameModal(false); lastTriggerRef.current?.focus(); }}
                  className="text-gray-400 hover:text-gray-600"
                  aria-label="Fechar"
                >
                  <X className="h-6 w-6" aria-hidden="true" />
                </button>
              </div>
              <form onSubmit={handleUsernameUpdate}>
                {/* BUG FIX: label explícito — input não tinha nenhum label */}
                <label htmlFor="edit-username" className="block text-sm font-medium text-gray-700 mb-1">
                  Novo nome de usuário
                </label>
                <input
                  id="edit-username"
                  type="text"
                  required
                  value={usernameForm.username}
                  onChange={e => setUsernameForm({ username: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                />
                <div className="mt-6 flex justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => { setShowUsernameModal(false); lastTriggerRef.current?.focus(); }}
                    className="px-4 py-2 text-gray-700 dark:text-gray-200 bg-gray-100 dark:!bg-[#2d3f52] rounded-lg hover:bg-gray-200 dark:hover:!bg-[#354b60]"
                  >
                    Cancelar
                  </button>
                  <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2">
                    <Save className="h-4 w-4" aria-hidden="true" />
                    Salvar nome
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* ── Modal: Alterar senha ── */}
        {showPasswordModal && editingUser && (
          <div
            className="fixed inset-0 bg-gradient-to-br from-blue-900/50 to-indigo-900/50 backdrop-blur-sm flex items-center justify-center z-[10001]"
            onClick={() => { setShowPasswordModal(false); lastTriggerRef.current?.focus(); }}
          >
            <div
              ref={passwordModalRef}
              role="dialog"
              aria-modal="true"
              aria-labelledby="password-modal-title"
              className="bg-[#ffffff] dark:!bg-[#243040] rounded-lg p-6 w-full max-w-md"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex justify-between items-center mb-4">
                <h2 id="password-modal-title" className="text-xl font-bold text-gray-900">
                  Alterar senha de {editingUser.username}
                </h2>
                <button
                  type="button"
                  onClick={() => { setShowPasswordModal(false); lastTriggerRef.current?.focus(); }}
                  className="text-gray-400 hover:text-gray-600"
                  aria-label="Fechar"
                >
                  <X className="h-6 w-6" aria-hidden="true" />
                </button>
              </div>
              <form onSubmit={handlePasswordUpdate}>
                <div className="space-y-3">
                  {/* BUG FIX: labels sr-only para inputs de senha */}
                  <div>
                    <label htmlFor="new-password" className="sr-only">Nova senha</label>
                    <input
                      id="new-password"
                      type="password"
                      required
                      placeholder="Nova senha"
                      value={passwordForm.password}
                      onChange={e => setPasswordForm({ ...passwordForm, password: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                    />
                  </div>
                  <div>
                    <label htmlFor="confirm-password" className="sr-only">Confirmar nova senha</label>
                    <input
                      id="confirm-password"
                      type="password"
                      required
                      placeholder="Confirmar nova senha"
                      value={passwordForm.confirmPassword}
                      onChange={e => setPasswordForm({ ...passwordForm, confirmPassword: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                    />
                  </div>
                </div>
                <div className="mt-6 flex justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => { setShowPasswordModal(false); lastTriggerRef.current?.focus(); }}
                    className="px-4 py-2 text-gray-700 dark:text-gray-200 bg-gray-100 dark:!bg-[#2d3f52] rounded-lg hover:bg-gray-200 dark:hover:!bg-[#354b60]"
                  >
                    Cancelar
                  </button>
                  <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2">
                    <Save className="h-4 w-4" aria-hidden="true" />
                    Salvar senha
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* ── Modal: Módulos de acesso ── */}
        {showModulesModal && modulesTargetUser && (
          <div
            className="fixed inset-0 bg-gradient-to-br from-blue-900/50 to-indigo-900/50 backdrop-blur-sm flex items-center justify-center z-[10001]"
            onClick={() => { setShowModulesModal(false); lastTriggerRef.current?.focus(); }}
          >
            <div
              ref={modulesModalRef}
              role="dialog"
              aria-modal="true"
              aria-labelledby="modules-modal-title"
              className="bg-[#ffffff] dark:!bg-[#243040] rounded-lg p-6 w-full max-w-2xl"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex justify-between items-center mb-4">
                <h2 id="modules-modal-title" className="text-xl font-bold text-gray-900">
                  Módulos de acesso de {modulesTargetUser.username}
                </h2>
                <button
                  type="button"
                  onClick={() => { setShowModulesModal(false); lastTriggerRef.current?.focus(); }}
                  className="text-gray-400 hover:text-gray-600"
                  aria-label="Fechar"
                >
                  <X className="h-6 w-6" aria-hidden="true" />
                </button>
              </div>

              <p className="text-sm text-gray-600 mb-4">Marque os módulos que este usuário pode acessar.</p>

              {/* BUG FIX: fieldset + legend para grupo de checkboxes de módulos */}
              <fieldset>
                <legend className="sr-only">Módulos disponíveis para {modulesTargetUser.username}</legend>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-80 overflow-y-auto border border-gray-200 rounded-lg p-4">
                  {moduleOptions.map(option => {
                    const superadminOnly = ['sessions', 'anomalies', 'security_alerts'].includes(option.moduleKey);
                    const locked = superadminOnly && currentUser?.role !== 'superadmin';
                    return (
                      <label
                        key={option.moduleKey}
                        className={`flex items-center gap-3 text-sm ${locked ? 'text-gray-400 cursor-not-allowed' : 'text-gray-700'}`}
                      >
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
              </fieldset>

              {/* Permissões granulares de regras de transação (migration 018) */}
              <div className="mt-6 border-t border-gray-200 pt-5">
                <h3 className="text-sm font-bold text-gray-900 mb-2">Permissões de Regras de Transação</h3>
                {rulePerms.is_admin_bypass ? (
                  <p className="text-xs text-gray-600 bg-blue-50 border border-blue-200 rounded-lg p-3">
                    Admins e superadmins têm controle total sobre regras automaticamente — não é necessário configurar aqui.
                  </p>
                ) : (
                  <>
                    <p className="text-xs text-gray-500 mb-3">Conceda poderes específicos para gerenciar regras automáticas de transações.</p>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                      <label className="flex items-center gap-2 text-sm text-gray-700 p-2 border border-gray-200 rounded-lg">
                        <input
                          type="checkbox"
                          checked={rulePerms.can_create}
                          onChange={(e) => setRulePerms((p) => ({ ...p, can_create: e.target.checked }))}
                          className="h-4 w-4 text-blue-600 rounded border-gray-300"
                        />
                        <span>Criar regras</span>
                      </label>
                      <label className="flex items-center gap-2 text-sm text-gray-700 p-2 border border-gray-200 rounded-lg">
                        <input
                          type="checkbox"
                          checked={rulePerms.can_edit}
                          onChange={(e) => setRulePerms((p) => ({ ...p, can_edit: e.target.checked }))}
                          className="h-4 w-4 text-blue-600 rounded border-gray-300"
                        />
                        <span>Editar regras</span>
                      </label>
                      <label className="flex items-center gap-2 text-sm text-gray-700 p-2 border border-gray-200 rounded-lg">
                        <input
                          type="checkbox"
                          checked={rulePerms.can_delete}
                          onChange={(e) => setRulePerms((p) => ({ ...p, can_delete: e.target.checked }))}
                          className="h-4 w-4 text-blue-600 rounded border-gray-300"
                        />
                        <span>Excluir regras</span>
                      </label>
                    </div>
                  </>
                )}
              </div>

              <div className="mt-6 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => { setShowModulesModal(false); lastTriggerRef.current?.focus(); }}
                  className="px-4 py-2 text-gray-700 dark:text-gray-200 bg-gray-100 dark:!bg-[#2d3f52] rounded-lg hover:bg-gray-200 dark:hover:!bg-[#354b60]"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleSaveModules}
                  disabled={modulesSaving}
                  aria-busy={modulesSaving}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2 disabled:opacity-70"
                >
                  <Save className="h-4 w-4" aria-hidden="true" />
                  {modulesSaving ? 'Salvando...' : 'Salvar módulos e permissões'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── Modal: Senha temporária (após reset) ── */}
        {temporaryPassword && (
          <div
            className="fixed inset-0 bg-gradient-to-br from-blue-900/50 to-indigo-900/50 backdrop-blur-sm flex items-center justify-center z-[10001]"
            onClick={() => { setTemporaryPassword(null); lastTriggerRef.current?.focus(); }}
          >
            <div
              ref={tempPwModalRef}
              role="dialog"
              aria-modal="true"
              aria-labelledby="temppw-modal-title"
              className="bg-[#ffffff] dark:!bg-[#243040] rounded-lg p-6 w-full max-w-md"
              onClick={e => e.stopPropagation()}
            >
              <h2 id="temppw-modal-title" className="text-xl font-bold text-gray-900 mb-3">Senha resetada</h2>
              <p className="text-gray-600 mb-4">
                Senha temporária de <strong>{temporaryPassword.username}</strong>:
              </p>
              <div className="bg-gray-100 dark:!bg-[#1e2d3e] rounded-lg px-3 py-2 font-mono text-gray-900 dark:text-gray-100 break-all">
                {temporaryPassword.value}
              </div>
              <p className="text-xs text-gray-500 mt-3">Compartilhe esta senha com o usuário e peça para alterar no próximo login.</p>
              <div className="mt-5 flex justify-end">
                <button
                  type="button"
                  onClick={() => { setTemporaryPassword(null); lastTriggerRef.current?.focus(); }}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                >
                  Fechar
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── Modal: Confirmar exclusão ── */}
        {deleteConfirm && (
          <div
            className="fixed inset-0 bg-gradient-to-br from-blue-900/50 to-indigo-900/50 backdrop-blur-sm flex items-center justify-center z-[10001]"
            onClick={() => { setDeleteConfirm(null); lastTriggerRef.current?.focus(); }}
          >
            <div
              ref={deleteModalRef}
              role="dialog"
              aria-modal="true"
              aria-labelledby="delete-modal-title"
              className="bg-[#ffffff] dark:!bg-[#243040] rounded-lg p-6 w-full max-w-md"
              onClick={e => e.stopPropagation()}
            >
              <h2 id="delete-modal-title" className="text-xl font-bold text-gray-900 mb-3">Confirmar exclusão</h2>
              <p className="text-gray-600 mb-6">
                Tem certeza que deseja excluir <strong>{users.find(u => u.id === deleteConfirm)?.username}</strong>?
              </p>
              <div className="flex justify-end gap-3">
                {/* Cancelar recebe foco primeiro (ação segura padrão — gerido pelo focus trap) */}
                <button
                  type="button"
                  onClick={() => { setDeleteConfirm(null); lastTriggerRef.current?.focus(); }}
                  className="px-4 py-2 text-gray-700 dark:text-gray-200 bg-gray-100 dark:!bg-[#2d3f52] rounded-lg hover:bg-gray-200 dark:hover:!bg-[#354b60]"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={() => handleDelete(deleteConfirm)}
                  className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 flex items-center gap-2"
                >
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                  Excluir
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── Modal: Confirmar mudança de role (novo — evita onChange direto na API) ── */}
        {pendingRoleChange && (
          <div
            className="fixed inset-0 bg-gradient-to-br from-blue-900/50 to-indigo-900/50 backdrop-blur-sm flex items-center justify-center z-[10001]"
            onClick={() => { setPendingRoleChange(null); lastTriggerRef.current?.focus(); }}
          >
            <div
              ref={roleConfirmModalRef}
              role="dialog"
              aria-modal="true"
              aria-labelledby="roleconfirm-modal-title"
              className="bg-[#ffffff] dark:!bg-[#243040] rounded-lg p-6 w-full max-w-md"
              onClick={e => e.stopPropagation()}
            >
              <h2 id="roleconfirm-modal-title" className="text-xl font-bold text-gray-900 mb-3">
                Confirmar alteração de função
              </h2>
              <p className="text-gray-600 mb-6">
                Tem certeza que deseja alterar a função para{' '}
                <strong>
                  {pendingRoleChange.role === 'superadmin' ? 'Super Administrador'
                    : pendingRoleChange.role === 'admin' ? 'Administrador'
                    : pendingRoleChange.role === 'user' ? 'Usuário'
                    : 'Convidado'}
                </strong>?
              </p>
              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => { setPendingRoleChange(null); lastTriggerRef.current?.focus(); }}
                  className="px-4 py-2 text-gray-700 dark:text-gray-200 bg-gray-100 dark:!bg-[#2d3f52] rounded-lg hover:bg-gray-200 dark:hover:!bg-[#354b60]"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={() => handleRoleChange(pendingRoleChange.userId, pendingRoleChange.role)}
                  disabled={roleLoadingId === pendingRoleChange.userId}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2 disabled:opacity-70"
                >
                  {roleLoadingId === pendingRoleChange.userId ? 'Salvando...' : 'Confirmar'}
                </button>
              </div>
            </div>
          </div>
        )}
      </>, document.body)}

      <UserCreationTypeModal
        isOpen={showCreationTypeModal}
        onClose={() => setShowCreationTypeModal(false)}
        onSelectSimple={() => {
          setShowCreationTypeModal(false);
          lastTriggerRef.current = document.activeElement as HTMLElement;
          // BUG FIX: spread evita partilha de referência de array com DEFAULT_CREATE_FORM
          setCreateForm({ ...DEFAULT_CREATE_FORM, modules: [...DEFAULT_CREATE_FORM.modules] });
          setShowCreateModal(true);
        }}
        onSelectComplete={() => { setShowCreationTypeModal(false); setShowCompleteModal(true); }}
      />

      <CadastroCompletoModal
        isOpen={showCompleteModal}
        onClose={() => setShowCompleteModal(false)}
        onSuccess={userData => {
          setShowCompleteModal(false);
          setCreatedUserData(userData);
          setShowUserCreatedModal(true);
          // BUG FIX: .catch() evita rejeição sem tratamento (loadUsers é async)
          loadUsers().catch(() => setError('Erro ao recarregar lista de usuários'));
        }}
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
