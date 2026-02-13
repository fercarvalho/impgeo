import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { CheckCircle2, Clock3, Eye, PenSquare, Shield, UserCircle2, X } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import LazyAvatar from './LazyAvatar';

interface UserProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  onEditProfile?: () => void;
}

interface ModuleAccess {
  moduleKey: string;
  moduleName: string;
  accessLevel: 'view' | 'write' | 'edit';
}

interface UserProfileData {
  id: string;
  username: string;
  role: 'admin' | 'user' | 'guest' | string;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  phone: string | null;
  cpf: string | null;
  birthDate: string | null;
  gender: string | null;
  position: string | null;
  address: {
    cep?: string;
    street?: string;
    number?: string;
    complement?: string;
    neighborhood?: string;
    city?: string;
    state?: string;
  } | null;
  photoUrl: string | null;
  isActive: boolean;
  lastLogin: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  modulesAccess: ModuleAccess[];
  permissionsSource: 'persisted' | 'fallback' | string;
}

const API_BASE_URL =
  typeof window !== 'undefined' &&
  (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
    ? 'http://localhost:9001/api'
    : ((import.meta as any).env?.VITE_API_URL || '/api');

const UserProfileModal: React.FC<UserProfileModalProps> = ({ isOpen, onClose, onEditProfile }) => {
  const { token, user } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [profile, setProfile] = useState<UserProfileData | null>(null);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    if (isOpen) {
      window.addEventListener('keydown', onKeyDown);
    }
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose]);

  useEffect(() => {
    if (!isOpen) return;
    if (!token) {
      setError('Sessao invalida. Faca login novamente.');
      return;
    }

    const loadProfile = async () => {
      try {
        setIsLoading(true);
        setError('');
        const response = await fetch(`${API_BASE_URL}/user/profile`, {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        });
        const result = await response.json();
        if (!response.ok || !result.success) {
          setError(result.error || 'Nao foi possivel carregar o perfil.');
          setProfile(null);
          return;
        }
        setProfile(result.data);
      } catch (e) {
        setError('Erro de conexao ao carregar perfil.');
        setProfile(null);
      } finally {
        setIsLoading(false);
      }
    };

    loadProfile();
  }, [isOpen, token]);

  const roleLabel = useMemo(() => {
    const role = profile?.role || user?.role;
    if (role === 'admin') return 'Administrador';
    if (role === 'user') return 'Usuário';
    if (role === 'guest') return 'Convidado';
    return role || '-';
  }, [profile?.role, user?.role]);

  const formatDateTime = (dateString: string | null) => {
    if (!dateString) return 'Nunca';
    const date = new Date(dateString);
    if (Number.isNaN(date.getTime())) return '-';
    return date.toLocaleString('pt-BR');
  };

  const groupedModulesAccess = useMemo(() => {
    const groups = {
      edit: [] as ModuleAccess[],
      write: [] as ModuleAccess[],
      view: [] as ModuleAccess[],
    };
    for (const moduleAccess of profile?.modulesAccess || []) {
      groups[moduleAccess.accessLevel].push(moduleAccess);
    }
    return groups;
  }, [profile?.modulesAccess]);

  if (!isOpen) return null;

  const content = (
    <div
      className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[9999] p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-2xl max-h-[85vh] bg-white rounded-xl shadow-xl border border-blue-100 overflow-hidden flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-blue-100 bg-blue-50">
          <h2 className="text-lg font-semibold text-blue-900 flex items-center gap-2">
            <Eye className="w-5 h-5 text-blue-700" />
            Ver Perfil
          </h2>
          <button onClick={onClose} className="p-2 rounded-full text-blue-700 hover:bg-blue-100">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="px-6 py-5 space-y-5 overflow-y-auto">
          {isLoading ? (
            <div className="py-8 flex items-center justify-center text-gray-600">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600 mr-3"></div>
              Carregando perfil...
            </div>
          ) : error ? (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">{error}</div>
          ) : profile ? (
            <>
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-center gap-4">
                  {profile.photoUrl || profile.firstName || profile.lastName ? (
                    <LazyAvatar
                      photoUrl={profile.photoUrl || undefined}
                      firstName={profile.firstName || undefined}
                      lastName={profile.lastName || undefined}
                      username={profile.username}
                      size="lg"
                      className="w-14 h-14 text-base"
                    />
                  ) : (
                    <div className="w-14 h-14 rounded-full bg-blue-100 flex items-center justify-center border border-blue-200">
                      <UserCircle2 className="w-8 h-8 text-blue-700" />
                    </div>
                  )}
                  <div>
                    <p className="text-sm text-gray-500">Usuário</p>
                    <p className="text-lg font-semibold text-gray-900">{profile.username}</p>
                    {profile.firstName || profile.lastName ? (
                      <p className="text-sm text-gray-600">{`${profile.firstName || ''} ${profile.lastName || ''}`.trim()}</p>
                    ) : null}
                  </div>
                </div>

                {onEditProfile ? (
                  <button
                    onClick={onEditProfile}
                    className="shrink-0 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium transition-colors"
                  >
                    Editar Perfil
                  </button>
                ) : null}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="rounded-lg border border-blue-100 p-3">
                  <p className="text-xs text-gray-500 mb-1">Email</p>
                  <p className="text-sm text-gray-900">{profile.email || '-'}</p>
                </div>
                <div className="rounded-lg border border-blue-100 p-3">
                  <p className="text-xs text-gray-500 mb-1">Telefone</p>
                  <p className="text-sm text-gray-900">{profile.phone || '-'}</p>
                </div>
                <div className="rounded-lg border border-blue-100 p-3">
                  <p className="text-xs text-gray-500 mb-1">CPF</p>
                  <p className="text-sm text-gray-900">{profile.cpf || '-'}</p>
                </div>
                <div className="rounded-lg border border-blue-100 p-3">
                  <p className="text-xs text-gray-500 mb-1">Cargo</p>
                  <p className="text-sm text-gray-900">{profile.position || '-'}</p>
                </div>
              </div>

              {profile.address ? (
                <div className="rounded-lg border border-blue-100 p-3">
                  <p className="text-sm font-semibold text-gray-900 mb-2">Endereço</p>
                  <p className="text-sm text-gray-700">
                    {[profile.address.street, profile.address.number].filter(Boolean).join(', ') || '-'}
                  </p>
                  <p className="text-sm text-gray-700">
                    {[profile.address.neighborhood, profile.address.city, profile.address.state]
                      .filter(Boolean)
                      .join(' - ') || '-'}
                  </p>
                  {profile.address.cep ? <p className="text-sm text-gray-700">CEP: {profile.address.cep}</p> : null}
                  {profile.address.complement ? (
                    <p className="text-sm text-gray-700">Compl.: {profile.address.complement}</p>
                  ) : null}
                </div>
              ) : null}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="rounded-lg border border-blue-100 p-3">
                  <p className="text-xs text-gray-500 mb-1">Função</p>
                  <p className="text-sm font-medium text-gray-900">{roleLabel}</p>
                </div>
                <div className="rounded-lg border border-blue-100 p-3">
                  <p className="text-xs text-gray-500 mb-1">Status</p>
                  <p className="text-sm font-medium text-gray-900 flex items-center gap-1">
                    <CheckCircle2 className="w-4 h-4 text-green-600" />
                    {profile.isActive ? 'Ativo' : 'Inativo'}
                  </p>
                </div>
                <div className="rounded-lg border border-blue-100 p-3">
                  <p className="text-xs text-gray-500 mb-1">Último acesso</p>
                  <p className="text-sm text-gray-900">{formatDateTime(profile.lastLogin)}</p>
                </div>
                <div className="rounded-lg border border-blue-100 p-3">
                  <p className="text-xs text-gray-500 mb-1">Conta criada em</p>
                  <p className="text-sm text-gray-900">{formatDateTime(profile.createdAt)}</p>
                </div>
              </div>

              <div className="rounded-lg border border-blue-100 p-3">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                    <Shield className="w-4 h-4 text-blue-700" />
                    Acesso por módulo
                  </p>
                  {profile.permissionsSource === 'fallback' ? (
                    <span className="text-xs text-amber-700 bg-amber-100 rounded px-2 py-1 flex items-center gap-1">
                      <Clock3 className="w-3 h-3" />
                      fallback
                    </span>
                  ) : null}
                </div>

                {profile.modulesAccess.length > 0 ? (
                  <div className="space-y-3">
                    {groupedModulesAccess.edit.length > 0 ? (
                      <div className="rounded-lg border border-indigo-100 p-3 bg-indigo-50/60">
                        <p className="text-xs font-semibold text-indigo-800 mb-2 flex items-center gap-1">
                          <PenSquare className="w-3 h-3" />
                          Edição
                        </p>
                        <div className="flex flex-wrap gap-2">
                          {groupedModulesAccess.edit.map((moduleAccess) => (
                            <span
                              key={`edit-${moduleAccess.moduleKey}`}
                              className="inline-flex items-center rounded-full border border-indigo-200 bg-white px-3 py-1 text-xs font-medium text-indigo-800"
                            >
                              {moduleAccess.moduleName}
                            </span>
                          ))}
                        </div>
                      </div>
                    ) : null}

                    {groupedModulesAccess.write.length > 0 ? (
                      <div className="rounded-lg border border-blue-100 p-3 bg-blue-50/60">
                        <p className="text-xs font-semibold text-blue-800 mb-2 flex items-center gap-1">
                          <PenSquare className="w-3 h-3" />
                          Escrita
                        </p>
                        <div className="flex flex-wrap gap-2">
                          {groupedModulesAccess.write.map((moduleAccess) => (
                            <span
                              key={`write-${moduleAccess.moduleKey}`}
                              className="inline-flex items-center rounded-full border border-blue-200 bg-white px-3 py-1 text-xs font-medium text-blue-800"
                            >
                              {moduleAccess.moduleName}
                            </span>
                          ))}
                        </div>
                      </div>
                    ) : null}

                    {groupedModulesAccess.view.length > 0 ? (
                      <div className="rounded-lg border border-gray-200 p-3 bg-gray-50/70">
                        <p className="text-xs font-semibold text-gray-700 mb-2 flex items-center gap-1">
                          <Eye className="w-3 h-3" />
                          Visualização
                        </p>
                        <div className="flex flex-wrap gap-2">
                          {groupedModulesAccess.view.map((moduleAccess) => (
                            <span
                              key={`view-${moduleAccess.moduleKey}`}
                              className="inline-flex items-center rounded-full border border-gray-300 bg-white px-3 py-1 text-xs font-medium text-gray-700"
                            >
                              {moduleAccess.moduleName}
                            </span>
                          ))}
                        </div>
                      </div>
                    ) : null}
                  </div>
                ) : (
                  <p className="text-sm text-gray-500">Nenhum módulo ativo encontrado.</p>
                )}
              </div>

            </>
          ) : (
            <p className="text-sm text-gray-600">Nenhum dado de perfil disponível.</p>
          )}
        </div>
      </div>
    </div>
  );

  return typeof document !== 'undefined' ? createPortal(content, document.body) : null;
};

export default UserProfileModal;
