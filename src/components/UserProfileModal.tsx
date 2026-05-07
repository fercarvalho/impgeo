import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { X, User, Shield, CheckCircle, XCircle, Calendar, Clock, Edit, Mail, Phone, MapPin, Briefcase, CreditCard } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import LazyAvatar from './LazyAvatar';
import EditarPerfilModal from './EditarPerfilModal';
import { applyPhoneMask } from '../utils/phoneMask';
import { applyCpfMask } from '../utils/cpfMask';
import { applyCepMask } from '../utils/cepMask';

const API_BASE_URL =
  typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
    ? 'http://localhost:9001/api'
    : ((import.meta as any).env?.VITE_API_URL || '/api');

interface UserProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface UserProfileData {
  id: string;
  username: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  photoUrl?: string;
  cpf?: string;
  birthDate?: string;
  gender?: string;
  position?: string;
  address?: {
    cep?: string;
    street?: string;
    number?: string;
    complement?: string;
    neighborhood?: string;
    city?: string;
    state?: string;
  };
  role: string;
  modules?: string[];
  isActive?: boolean;
  lastLogin?: string;
  createdAt?: string;
  updatedAt?: string;
}

const UserProfileModal: React.FC<UserProfileModalProps> = ({ isOpen, onClose }) => {
  const { token } = useAuth();
  const [profileData, setProfileData] = useState<UserProfileData | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [showEditProfileModal, setShowEditProfileModal] = useState(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const loadProfileData = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setLoadError(false);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);

    try {
      const response = await fetch(`${API_BASE_URL}/user/profile`, {
        signal: controller.signal,
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        let result: { success?: boolean; data?: UserProfileData } = {};
        try {
          result = await response.json();
        } catch {
          // body não é JSON
        }
        if (result.success && mountedRef.current) {
          setProfileData(result.data ?? null);
        } else if (result.success === false && mountedRef.current) {
          setLoadError(true);
        }
      } else {
        if (mountedRef.current) setLoadError(true);
      }
    } catch (error: unknown) {
      if (error instanceof Error && error.name === 'AbortError') {
        console.error('Requisição de perfil cancelada (timeout)');
      } else {
        console.error('Erro ao carregar perfil:', error);
      }
      if (mountedRef.current) setLoadError(true);
    } finally {
      clearTimeout(timeoutId);
      if (mountedRef.current) setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (isOpen) {
      loadProfileData();
    }
  }, [isOpen, loadProfileData]);

  const handleClose = useCallback(() => {
    setShowEditProfileModal(false);
    onClose();
  }, [onClose]);

  const formatDate = (dateString?: string) => {
    if (!dateString) return 'Nunca';
    try {
      const date = new Date(dateString);
      if (isNaN(date.getTime())) return 'Data inválida';
      return date.toLocaleDateString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch {
      return 'Data inválida';
    }
  };

  const formatBirthDate = (dateString?: string): string => {
    if (!dateString) return '';
    try {
      const datePart = dateString.split('T')[0];
      const parts = datePart.split('-');
      if (parts.length !== 3) return dateString;
      const [year, month, day] = parts;
      return `${day}/${month}/${year}`;
    } catch {
      return dateString;
    }
  };

  const getRoleBadgeColor = (role: string) => {
    switch (role) {
      case 'superadmin':
        return 'bg-red-100 text-red-800 border-red-200 dark:bg-red-900/30 dark:text-red-300 dark:border-red-700';
      case 'admin':
        return 'bg-purple-100 text-purple-800 border-purple-200 dark:bg-purple-900/30 dark:text-purple-300 dark:border-purple-700';
      case 'user':
        return 'bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-700';
      case 'guest':
        return 'bg-gray-100 text-gray-800 border-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:border-gray-600';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:border-gray-600';
    }
  };

  const getRoleLabel = (role: string) => {
    switch (role) {
      case 'superadmin':
        return 'Super Administrador';
      case 'admin':
        return 'Administrador';
      case 'user':
        return 'Usuário';
      case 'guest':
        return 'Visitante';
      default:
        return role;
    }
  };

  if (!isOpen) return null;

  const modalContent = (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="user-profile-modal-title"
      className="fixed inset-0 bg-gradient-to-br from-blue-900/50 to-indigo-900/50 backdrop-blur-sm flex items-center justify-center z-[70] px-4 py-8"
      onClick={(e) => {
        if (e.target === e.currentTarget && !showEditProfileModal) {
          handleClose();
        }
      }}
    >
      <div className="bg-[#ffffff] dark:bg-[#243040] rounded-2xl p-6 w-full max-w-2xl max-h-[calc(100vh-4rem)] overflow-y-auto shadow-2xl border border-gray-200/50 dark:border-gray-700">
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-500 to-indigo-600 -mx-6 -mt-6 mb-6 px-6 py-4 border-b border-white/20">
          <div className="flex items-center justify-between">
            <h2 id="user-profile-modal-title" className="text-xl font-bold text-white flex items-center gap-2">
              <User className="w-6 h-6 text-white" aria-hidden="true" />
              Meu Perfil
            </h2>
            <button
              onClick={handleClose}
              className="text-white/80 hover:text-white hover:bg-white/20 p-2 rounded-lg transition-all duration-200"
              aria-label="Fechar modal"
            >
              <X className="w-5 h-5" aria-hidden="true" />
            </button>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" role="status" aria-label="Carregando perfil..." />
          </div>
        ) : profileData ? (
          <div className="space-y-6">
            {/* Avatar e Nome */}
            <div className="bg-[#ffffff] dark:bg-[#1e2d3e] rounded-xl p-6 border border-gray-200 dark:border-gray-700 shadow-sm text-center">
              <div className="flex flex-col items-center gap-4">
                <LazyAvatar
                  photoUrl={profileData.photoUrl}
                  firstName={profileData.firstName}
                  lastName={profileData.lastName}
                  username={profileData.username}
                  size="lg"
                />
                <div>
                  <h3 className="text-2xl font-bold text-gray-800 dark:text-gray-100">
                    {profileData.firstName
                      ? `${profileData.firstName}${profileData.lastName ? ` ${profileData.lastName}` : ''}`
                      : profileData.username}
                  </h3>
                  <p className="text-gray-500 dark:text-gray-400 mt-1">@{profileData.username}</p>
                </div>
                <button
                  onClick={() => setShowEditProfileModal(true)}
                  className="px-4 py-2 bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 text-white rounded-xl font-semibold shadow-md shadow-blue-500/25 hover:-translate-y-0.5 transition-all duration-200 flex items-center gap-2"
                >
                  <Edit className="w-4 h-4" aria-hidden="true" />
                  Editar Perfil
                </button>
              </div>
            </div>

            {/* Informações Básicas */}
            <div className="bg-[#ffffff] dark:bg-[#1e2d3e] rounded-xl p-6 border border-gray-200 dark:border-gray-700 shadow-sm">
              <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-100 mb-4 flex items-center gap-2">
                <User className="w-5 h-5 text-blue-500" aria-hidden="true" />
                Informações Básicas
              </h3>
              <div className="space-y-4">
                {profileData.email && (
                  <div>
                    <p className="text-sm font-medium text-gray-500 dark:text-gray-400 flex items-center gap-2">
                      <Mail className="w-4 h-4" aria-hidden="true" />
                      Email
                    </p>
                    <p className="text-lg text-gray-800 dark:text-gray-200 mt-1">{profileData.email}</p>
                  </div>
                )}

                {profileData.phone && (
                  <div>
                    <p className="text-sm font-medium text-gray-500 dark:text-gray-400 flex items-center gap-2">
                      <Phone className="w-4 h-4" aria-hidden="true" />
                      Telefone
                    </p>
                    <p className="text-lg text-gray-800 dark:text-gray-200 mt-1">{applyPhoneMask(profileData.phone)}</p>
                  </div>
                )}

                {profileData.cpf && (
                  <div>
                    <p className="text-sm font-medium text-gray-500 dark:text-gray-400 flex items-center gap-2">
                      <CreditCard className="w-4 h-4" aria-hidden="true" />
                      CPF
                    </p>
                    <p className="text-lg text-gray-800 dark:text-gray-200 mt-1">{applyCpfMask(profileData.cpf)}</p>
                  </div>
                )}

                {profileData.birthDate && (
                  <div>
                    <p className="text-sm font-medium text-gray-500 dark:text-gray-400 flex items-center gap-2">
                      <Calendar className="w-4 h-4" aria-hidden="true" />
                      Data de Nascimento
                    </p>
                    <p className="text-lg text-gray-800 dark:text-gray-200 mt-1">
                      {formatBirthDate(profileData.birthDate)}
                    </p>
                  </div>
                )}

                {profileData.gender && (
                  <div>
                    <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Gênero</p>
                    <p className="text-lg text-gray-800 dark:text-gray-200 mt-1 capitalize">
                      {profileData.gender.replace(/-/g, ' ')}
                    </p>
                  </div>
                )}

                {profileData.position && (
                  <div>
                    <p className="text-sm font-medium text-gray-500 dark:text-gray-400 flex items-center gap-2">
                      <Briefcase className="w-4 h-4" aria-hidden="true" />
                      Cargo
                    </p>
                    <p className="text-lg text-gray-800 dark:text-gray-200 mt-1">{profileData.position}</p>
                  </div>
                )}

                {profileData.address && (profileData.address.cep || profileData.address.street) && (
                  <div>
                    <p className="text-sm font-medium text-gray-500 dark:text-gray-400 flex items-center gap-2 mb-2">
                      <MapPin className="w-4 h-4" aria-hidden="true" />
                      Endereço
                    </p>
                    <div className="text-lg text-gray-800 dark:text-gray-200 mt-1 space-y-1">
                      {profileData.address.street && (
                        <p>
                          {profileData.address.street}
                          {profileData.address.number && `, ${profileData.address.number}`}
                          {profileData.address.complement && ` - ${profileData.address.complement}`}
                        </p>
                      )}
                      {profileData.address.neighborhood && (
                        <p>{profileData.address.neighborhood}</p>
                      )}
                      {(profileData.address.city || profileData.address.state) && (
                        <p>
                          {profileData.address.city && `${profileData.address.city}`}
                          {profileData.address.city && profileData.address.state && ' - '}
                          {profileData.address.state && profileData.address.state}
                        </p>
                      )}
                      {profileData.address.cep && (
                        <p className="text-sm text-gray-500 dark:text-gray-400">CEP: {applyCepMask(profileData.address.cep)}</p>
                      )}
                    </div>
                  </div>
                )}

                <div>
                  <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Função</p>
                  <div className="mt-1">
                    <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium border ${getRoleBadgeColor(profileData.role)}`}>
                      <Shield className="w-3 h-3 mr-1" aria-hidden="true" />
                      {getRoleLabel(profileData.role)}
                    </span>
                  </div>
                </div>

                <div>
                  <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Status</p>
                  <div className="mt-1">
                    {profileData.isActive === true ? (
                      <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-green-100 text-green-800 border border-green-200 dark:bg-green-900/30 dark:text-green-300 dark:border-green-700">
                        <CheckCircle className="w-3 h-3 mr-1" aria-hidden="true" />
                        Ativo
                      </span>
                    ) : (
                      <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-red-100 text-red-800 border border-red-200 dark:bg-red-900/30 dark:text-red-300 dark:border-red-700">
                        <XCircle className="w-3 h-3 mr-1" aria-hidden="true" />
                        Inativo
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Acesso */}
            <div className="bg-[#ffffff] dark:bg-[#1e2d3e] rounded-xl p-6 border border-gray-200 dark:border-gray-700 shadow-sm">
              <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-100 mb-4 flex items-center gap-2">
                <Shield className="w-5 h-5 text-blue-500" aria-hidden="true" />
                Acesso
              </h3>
              <div className="space-y-4">
                <div>
                  <p className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-2">Módulos Ativos</p>
                  <div className="flex flex-wrap gap-2">
                    {profileData.modules && profileData.modules.length > 0 ? (
                      profileData.modules.map((module) => (
                        <span
                          key={module}
                          className="inline-flex items-center px-3 py-1 rounded-lg text-sm font-medium bg-blue-100 text-blue-800 border border-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-700"
                        >
                          {module}
                        </span>
                      ))
                    ) : (
                      <span className="text-gray-400 text-sm">Nenhum módulo específico</span>
                    )}
                  </div>
                </div>

                <div>
                  <p className="text-sm font-medium text-gray-500 dark:text-gray-400 flex items-center gap-2">
                    <Clock className="w-4 h-4" aria-hidden="true" />
                    Última Data de Login
                  </p>
                  <p className="text-gray-800 dark:text-gray-200 mt-1">{formatDate(profileData.lastLogin)}</p>
                </div>

                <div>
                  <p className="text-sm font-medium text-gray-500 dark:text-gray-400 flex items-center gap-2">
                    <Calendar className="w-4 h-4" aria-hidden="true" />
                    Data de Criação da Conta
                  </p>
                  <p className="text-gray-800 dark:text-gray-200 mt-1">{formatDate(profileData.createdAt)}</p>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div role={loadError ? 'alert' : undefined} className="text-center py-12 text-gray-500 dark:text-gray-400">
            {loadError ? 'Erro ao carregar dados do perfil' : 'Nenhum dado disponível'}
          </div>
        )}
      </div>
    </div>
  );

  return (
    <>
      {typeof document !== 'undefined'
        ? createPortal(
            <>
              {modalContent}
              <EditarPerfilModal
                isOpen={showEditProfileModal}
                onClose={() => {
                  setShowEditProfileModal(false);
                  loadProfileData(); // Recarregar dados após fechar edição
                }}
              />
            </>,
            document.body
          )
        : null}
    </>
  );
};

export default UserProfileModal;
