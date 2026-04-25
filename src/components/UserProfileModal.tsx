import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, User, Shield, CheckCircle, XCircle, Calendar, Clock, Edit, Mail, Phone, MapPin, Briefcase, CreditCard } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
const API_BASE_URL =
  typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
    ? 'http://localhost:9001/api'
    : ((import.meta as any).env?.VITE_API_URL || '/api');
import LazyAvatar from './LazyAvatar';
import EditarPerfilModal from './EditarPerfilModal';
import { applyPhoneMask } from '../utils/phoneMask';
import { applyCpfMask } from '../utils/cpfMask';
import { applyCepMask } from '../utils/cepMask';

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
  const { user: _user, token } = useAuth();
  const [profileData, setProfileData] = useState<UserProfileData | null>(null);
  const [loading, setLoading] = useState(false);
  const [showEditProfileModal, setShowEditProfileModal] = useState(false);

  useEffect(() => {
    if (isOpen) {
      loadProfileData();
    }
  }, [isOpen, showEditProfileModal]); // Recarregar quando modal de edição fechar

  const loadProfileData = async () => {
    setLoading(true);
    try {
      const response = await fetch(`${API_BASE_URL}/user/profile`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        const result = await response.json();
        if (result.success) {
          setProfileData(result.data);
        }
      }
    } catch (error) {
      console.error('Erro ao carregar perfil:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return 'Nunca';
    try {
      const date = new Date(dateString);
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

  const getRoleBadgeColor = (role: string) => {
    switch (role) {
      case 'superadmin':
        return 'bg-red-100 text-red-800 border-red-200';
      case 'user':
        return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'guest':
        return 'bg-gray-100 text-gray-800 border-gray-200';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200';
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
      className="fixed inset-0 bg-gradient-to-br from-amber-900/50 to-orange-900/50 backdrop-blur-sm flex items-center justify-center z-[70] px-4 pb-4 pt-[180px]"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div className="bg-gradient-to-br from-white to-gray-50 dark:from-gray-800 dark:to-gray-900 rounded-2xl p-6 w-full max-w-2xl max-h-[calc(100vh-220px)] overflow-y-auto shadow-2xl border border-gray-200/50 dark:border-gray-700">
        {/* Header */}
        <div className="bg-gradient-to-r from-amber-50 to-orange-50 dark:from-gray-900/80 dark:to-gray-900/80 -mx-6 -mt-6 mb-6 px-6 py-4 border-b border-amber-200/50 dark:border-gray-700">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold text-amber-800 flex items-center gap-2">
              <User className="w-6 h-6 text-amber-700" />
              Meu Perfil
            </h2>
            <button
              onClick={onClose}
              className="text-amber-600 hover:text-amber-800 hover:bg-amber-100 p-2 rounded-full transition-all"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-amber-600"></div>
          </div>
        ) : profileData ? (
          <div className="space-y-6">
            {/* Avatar e Nome */}
            <div className="bg-white rounded-xl p-6 border border-gray-200 shadow-sm text-center">
              <div className="flex flex-col items-center gap-4">
                <LazyAvatar
                  photoUrl={profileData.photoUrl}
                  firstName={profileData.firstName}
                  lastName={profileData.lastName}
                  username={profileData.username}
                  size="lg"
                />
                <div>
                  <h3 className="text-2xl font-bold text-gray-800">
                    {profileData.firstName && profileData.lastName
                      ? `${profileData.firstName} ${profileData.lastName}`
                      : profileData.username}
                  </h3>
                  <p className="text-gray-500 mt-1">@{profileData.username}</p>
                </div>
                <button
                  onClick={() => setShowEditProfileModal(true)}
                  className="px-4 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 transition-colors flex items-center gap-2"
                >
                  <Edit className="w-4 h-4" />
                  Editar Perfil
                </button>
              </div>
            </div>

            {/* Informações Básicas */}
            <div className="bg-white rounded-xl p-6 border border-gray-200 shadow-sm">
              <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
                <User className="w-5 h-5 text-amber-600" />
                Informações Básicas
              </h3>
              <div className="space-y-4">
                {profileData.email && (
                  <div>
                    <label className="text-sm font-medium text-gray-500 flex items-center gap-2">
                      <Mail className="w-4 h-4" />
                      Email
                    </label>
                    <p className="text-lg text-gray-800 mt-1">{profileData.email}</p>
                  </div>
                )}

                {profileData.phone && (
                  <div>
                    <label className="text-sm font-medium text-gray-500 flex items-center gap-2">
                      <Phone className="w-4 h-4" />
                      Telefone
                    </label>
                    <p className="text-lg text-gray-800 mt-1">{applyPhoneMask(profileData.phone)}</p>
                  </div>
                )}

                {profileData.cpf && (
                  <div>
                    <label className="text-sm font-medium text-gray-500 flex items-center gap-2">
                      <CreditCard className="w-4 h-4" />
                      CPF
                    </label>
                    <p className="text-lg text-gray-800 mt-1">{applyCpfMask(profileData.cpf)}</p>
                  </div>
                )}

                {profileData.birthDate && (
                  <div>
                    <label className="text-sm font-medium text-gray-500 flex items-center gap-2">
                      <Calendar className="w-4 h-4" />
                      Data de Nascimento
                    </label>
                    <p className="text-lg text-gray-800 mt-1">
                      {(() => {
                        const [year, month, day] = profileData.birthDate.split('T')[0].split('-');
                        return `${day}/${month}/${year}`;
                      })()}
                    </p>
                  </div>
                )}

                {profileData.gender && (
                  <div>
                    <label className="text-sm font-medium text-gray-500">Gênero</label>
                    <p className="text-lg text-gray-800 mt-1 capitalize">
                      {profileData.gender.replace('-', ' ')}
                    </p>
                  </div>
                )}

                {profileData.position && (
                  <div>
                    <label className="text-sm font-medium text-gray-500 flex items-center gap-2">
                      <Briefcase className="w-4 h-4" />
                      Cargo
                    </label>
                    <p className="text-lg text-gray-800 mt-1">{profileData.position}</p>
                  </div>
                )}

                {profileData.address && (profileData.address.cep || profileData.address.street) && (
                  <div>
                    <label className="text-sm font-medium text-gray-500 flex items-center gap-2 mb-2">
                      <MapPin className="w-4 h-4" />
                      Endereço
                    </label>
                    <div className="text-lg text-gray-800 mt-1 space-y-1">
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
                        <p className="text-sm text-gray-500">CEP: {applyCepMask(profileData.address.cep)}</p>
                      )}
                    </div>
                  </div>
                )}

                <div>
                  <label className="text-sm font-medium text-gray-500">Função</label>
                  <div className="mt-1">
                    <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium border ${getRoleBadgeColor(profileData.role)}`}>
                      <Shield className="w-3 h-3 mr-1" />
                      {getRoleLabel(profileData.role)}
                    </span>
                  </div>
                </div>

                <div>
                  <label className="text-sm font-medium text-gray-500">Status</label>
                  <div className="mt-1">
                    {profileData.isActive !== false ? (
                      <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-green-100 text-green-800 border border-green-200">
                        <CheckCircle className="w-3 h-3 mr-1" />
                        Ativo
                      </span>
                    ) : (
                      <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-red-100 text-red-800 border border-red-200">
                        <XCircle className="w-3 h-3 mr-1" />
                        Inativo
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Acesso */}
            <div className="bg-white rounded-xl p-6 border border-gray-200 shadow-sm">
              <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
                <Shield className="w-5 h-5 text-amber-600" />
                Acesso
              </h3>
              <div className="space-y-4">
                <div>
                  <label className="text-sm font-medium text-gray-500 mb-2 block">Módulos Ativos</label>
                  <div className="flex flex-wrap gap-2">
                    {profileData.modules && profileData.modules.length > 0 ? (
                      profileData.modules.map((module) => (
                        <span
                          key={module}
                          className="inline-flex items-center px-3 py-1 rounded-lg text-sm font-medium bg-amber-100 text-amber-800 border border-amber-200"
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
                  <label className="text-sm font-medium text-gray-500 flex items-center gap-2">
                    <Clock className="w-4 h-4" />
                    Última Data de Login
                  </label>
                  <p className="text-gray-800 mt-1">{formatDate(profileData.lastLogin)}</p>
                </div>

                <div>
                  <label className="text-sm font-medium text-gray-500 flex items-center gap-2">
                    <Calendar className="w-4 h-4" />
                    Data de Criação da Conta
                  </label>
                  <p className="text-gray-800 mt-1">{formatDate(profileData.createdAt)}</p>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="text-center py-12 text-gray-500">
            Erro ao carregar dados do perfil
          </div>
        )}
      </div>
    </div>
  );

  return (
    <>
      {typeof document !== 'undefined' ? createPortal(modalContent, document.body) : null}
      <EditarPerfilModal
        isOpen={showEditProfileModal}
        onClose={() => {
          setShowEditProfileModal(false);
          loadProfileData(); // Recarregar dados após fechar
        }}
      />
    </>
  );
};

export default UserProfileModal;
