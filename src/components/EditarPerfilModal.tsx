import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X, User, Save } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
const API_BASE_URL =
  typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
    ? 'http://localhost:9001/api'
    : ((import.meta as any).env?.VITE_API_URL || '/api');
import PhotoUpload from './PhotoUpload';
import { validateEmail } from '../utils/validation';
import { applyPhoneMask, removePhoneMask, validatePhoneFormat } from '../utils/phoneMask';
import { applyCpfMask, removeCpfMask, validateCpfFormat } from '../utils/cpfMask';
import { applyCepMask, removeCepMask, validateCepFormat, fetchAddressByCep } from '../utils/cepMask';

interface EditarPerfilModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const EditarPerfilModal: React.FC<EditarPerfilModalProps> = ({
  isOpen,
  onClose
}) => {
  const { user, token, refreshUser } = useAuth();
  const [formData, setFormData] = useState({
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
  const [password, setPassword] = useState('');
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [errors, setErrors] = useState<{ [key: string]: string }>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const [isSearchingCep, setIsSearchingCep] = useState(false);
  const initializedRef = useRef(false);

  useEffect(() => {
    if (isOpen && user && !initializedRef.current) {
      // Aplicar máscaras apenas uma vez quando o modal abrir
      setFormData({
        firstName: user.firstName || '',
        lastName: user.lastName || '',
        email: user.email || '',
        phone: user.phone ? applyPhoneMask(user.phone) : '',
        cpf: user.cpf ? applyCpfMask(user.cpf) : '',
        birthDate: user.birthDate ? user.birthDate.split('T')[0] : '',
        gender: user.gender || '',
        position: user.position || '',
        address: user.address ? {
          cep: user.address.cep ? applyCepMask(user.address.cep) : '',
          street: user.address.street || '',
          number: user.address.number || '',
          complement: user.address.complement || '',
          neighborhood: user.address.neighborhood || '',
          city: user.address.city || '',
          state: user.address.state || ''
        } : {
          cep: '',
          street: '',
          number: '',
          complement: '',
          neighborhood: '',
          city: '',
          state: ''
        }
      });
      setPhotoUrl(user.photoUrl || null);
      setPassword('');
      setPhotoFile(null);
      setErrors({});
      initializedRef.current = true;
    }

    // Reset quando o modal fechar
    if (!isOpen) {
      initializedRef.current = false;
    }
  }, [isOpen, user]);

  const handleInputChange = (field: string, value: string) => {
    if (field === 'phone') {
      const masked = applyPhoneMask(value);
      setFormData(prev => ({ ...prev, [field]: masked }));
    } else if (field === 'cpf') {
      const masked = applyCpfMask(value);
      setFormData(prev => ({ ...prev, [field]: masked }));
    } else if (field === 'address.cep') {
      const masked = applyCepMask(value);
      setFormData(prev => ({
        ...prev,
        address: { ...prev.address, cep: masked }
      }));
    } else if (field.startsWith('address.')) {
      const addressField = field.replace('address.', '');
      setFormData(prev => ({
        ...prev,
        address: { ...prev.address, [addressField]: value }
      }));
    } else {
      setFormData(prev => ({ ...prev, [field]: value }));
    }

    // Limpar erro do campo
    if (errors[field]) {
      setErrors(prev => {
        const newErrors = { ...prev };
        delete newErrors[field];
        return newErrors;
      });
    }
  };

  const handleCepBlur = async () => {
    const cep = formData.address.cep;
    if (cep && removeCepMask(cep).length === 8) {
      setIsSearchingCep(true);
      try {
        const addressData = await fetchAddressByCep(cep);
        if (addressData) {
          setFormData(prev => ({
            ...prev,
            address: {
              ...prev.address,
              street: addressData.logradouro || '',
              neighborhood: addressData.bairro || '',
              city: addressData.localidade || '',
              state: addressData.uf || '',
              complement: addressData.complemento || prev.address.complement
            }
          }));
        } else {
          setErrors(prev => ({ ...prev, 'address.cep': 'CEP não encontrado' }));
        }
      } catch (error) {
        console.error('Erro ao buscar CEP:', error);
        setErrors(prev => ({ ...prev, 'address.cep': 'Erro ao buscar endereço' }));
      } finally {
        setIsSearchingCep(false);
      }
    }
  };

  const handleCpfBlur = () => {
    if (formData.cpf) {
      const validation = validateCpfFormat(formData.cpf);
      if (!validation.isValid) {
        setErrors(prev => ({ ...prev, cpf: validation.error || 'CPF inválido' }));
      }
    }
  };

  const handleEmailBlur = () => {
    if (formData.email) {
      const validation = validateEmail(formData.email);
      if (!validation.isValid) {
        setErrors(prev => ({ ...prev, email: validation.error || 'Email inválido' }));
      }
    }
  };

  const handlePhoneBlur = () => {
    if (formData.phone) {
      const validation = validatePhoneFormat(formData.phone);
      if (!validation.isValid) {
        setErrors(prev => ({ ...prev, phone: validation.error || 'Telefone inválido' }));
      }
    }
  };

  const handlePhotoProcessed = (file: File) => {
    setPhotoFile(file);
  };

  const handlePhotoRemoved = () => {
    setPhotoFile(null);
    setPhotoUrl(null);
  };

  const uploadPhoto = async (file: File): Promise<string | null> => {
    try {
      setIsUploadingPhoto(true);
      const formData = new FormData();
      formData.append('photo', file);

      const response = await fetch(`${API_BASE_URL}/user/upload-photo`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        },
        body: formData
      });

      const result = await response.json();
      if (result.success) {
        return result.data.photoUrl;
      } else {
        throw new Error(result.error || 'Erro ao fazer upload da foto');
      }
    } catch (error) {
      console.error('Erro ao fazer upload da foto:', error);
      throw error;
    } finally {
      setIsUploadingPhoto(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validações
    const newErrors: { [key: string]: string } = {};

    if (!password) {
      newErrors.password = 'Senha atual é obrigatória';
    }

    if (!formData.firstName || formData.firstName.trim().length < 2) {
      newErrors.firstName = 'Nome deve ter pelo menos 2 caracteres';
    }

    if (!formData.lastName || formData.lastName.trim().length < 2) {
      newErrors.lastName = 'Sobrenome deve ter pelo menos 2 caracteres';
    }

    if (!formData.email || !formData.email.trim()) {
      newErrors.email = 'Email é obrigatório';
    } else {
      const emailValidation = validateEmail(formData.email);
      if (!emailValidation.isValid) {
        newErrors.email = emailValidation.error || 'Email inválido';
      }
    }

    if (!formData.phone || !formData.phone.trim()) {
      newErrors.phone = 'Telefone é obrigatório';
    } else {
      const phoneValidation = validatePhoneFormat(formData.phone);
      if (!phoneValidation.isValid) {
        newErrors.phone = phoneValidation.error || 'Telefone inválido';
      }
    }

    if (!formData.cpf || !formData.cpf.trim()) {
      newErrors.cpf = 'CPF é obrigatório';
    } else {
      const cpfValidation = validateCpfFormat(formData.cpf);
      if (!cpfValidation.isValid) {
        newErrors.cpf = cpfValidation.error || 'CPF inválido';
      }
    }

    if (!formData.birthDate) {
      newErrors.birthDate = 'Data de nascimento é obrigatória';
    }

    if (!formData.gender) {
      newErrors.gender = 'Gênero é obrigatório';
    }

    if (!formData.position || !formData.position.trim()) {
      newErrors.position = 'Cargo é obrigatório';
    }

    if (!formData.address.cep || !formData.address.cep.trim()) {
      newErrors['address.cep'] = 'CEP é obrigatório';
    } else {
      const cepValidation = validateCepFormat(formData.address.cep);
      if (!cepValidation.isValid) {
        newErrors['address.cep'] = cepValidation.error || 'CEP inválido';
      }
    }

    if (!formData.address.street || !formData.address.street.trim()) {
      newErrors['address.street'] = 'Rua/Logradouro é obrigatório';
    }

    if (!formData.address.number || !formData.address.number.trim()) {
      newErrors['address.number'] = 'Número é obrigatório';
    }

    if (!formData.address.neighborhood || !formData.address.neighborhood.trim()) {
      newErrors['address.neighborhood'] = 'Bairro é obrigatório';
    }

    if (!formData.address.city || !formData.address.city.trim()) {
      newErrors['address.city'] = 'Cidade é obrigatória';
    }

    if (!formData.address.state || !formData.address.state.trim() || formData.address.state.length !== 2) {
      newErrors['address.state'] = 'Estado (UF) é obrigatório e deve ter 2 caracteres';
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    setIsSubmitting(true);

    try {
      // Se há foto nova, fazer upload primeiro
      let finalPhotoUrl = photoUrl;
      if (photoFile && !photoUrl) {
        finalPhotoUrl = await uploadPhoto(photoFile);
        setPhotoUrl(finalPhotoUrl);
      }

      // Preparar dados para envio - todos os campos são obrigatórios
      const updateData: any = {
        firstName: formData.firstName.trim(),
        lastName: formData.lastName.trim(),
        email: formData.email.trim(),
        phone: removePhoneMask(formData.phone),
        cpf: removeCpfMask(formData.cpf),
        birthDate: formData.birthDate,
        gender: formData.gender,
        position: formData.position.trim(),
        address: {
          cep: removeCepMask(formData.address.cep),
          street: formData.address.street.trim(),
          number: formData.address.number.trim(),
          complement: formData.address.complement.trim() || '',
          neighborhood: formData.address.neighborhood.trim(),
          city: formData.address.city.trim(),
          state: formData.address.state.trim().toUpperCase()
        },
        password // Senha atual para validação
      };

      if (finalPhotoUrl !== undefined) {
        updateData.photoUrl = finalPhotoUrl || null;
      }

      const response = await fetch(`${API_BASE_URL}/user/profile`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(updateData)
      });

      const result = await response.json();

      if (result.success) {
        // Atualizar contexto
        await refreshUser();
        setPassword('');
        setPhotoFile(null);
        setErrors({});
        onClose();
      } else {
        setErrors({ general: result.error || 'Erro ao atualizar perfil' });
      }
    } catch (error: any) {
      setErrors({ general: error.message || 'Erro ao atualizar perfil' });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen || !user) return null;

  const modalContent = (
    <div
      className="fixed inset-0 bg-gradient-to-br from-blue-900/50 to-indigo-900/50 backdrop-blur-sm flex items-center justify-center z-[90] px-4 pb-4 pt-[180px]"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div className="bg-[#ffffff] dark:!bg-[#243040] rounded-2xl p-6 w-full max-w-2xl max-h-[calc(100vh-220px)] overflow-y-auto shadow-2xl border border-gray-200/50 dark:border-gray-700">
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-500 to-indigo-600 -mx-6 -mt-6 mb-6 px-6 py-4 border-b border-white/20">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              <User className="w-6 h-6 text-white" />
              Editar Perfil
            </h2>
            <button
              onClick={onClose}
              className="text-white/80 hover:text-white hover:bg-white/20 p-2 rounded-lg transition-all duration-200"
              disabled={isSubmitting}
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {errors.general && (
            <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-lg text-sm">
              {errors.general}
            </div>
          )}

          {/* Senha Atual */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
              Senha Atual <span className="text-red-500">*</span>
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                if (errors.password) {
                  setErrors(prev => {
                    const newErrors = { ...prev };
                    delete newErrors.password;
                    return newErrors;
                  });
                }
              }}
              className={`w-full px-4 py-3 border rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all dark:text-gray-100 dark:placeholder-gray-400 ${errors.password ? 'bg-red-50 border-red-300' : 'bg-gray-50 border-gray-200 dark:!bg-gray-700 dark:border-gray-600'
                }`}
              placeholder="Digite sua senha atual"
              disabled={isSubmitting}
            />
            {errors.password && (
              <p className="mt-1 text-sm text-red-600">{errors.password}</p>
            )}
            <p className="mt-1 text-xs text-gray-500">
              Necessária para confirmar sua identidade
            </p>
          </div>

          {/* Nome e Sobrenome */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                Nome <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={formData.firstName}
                onChange={(e) => handleInputChange('firstName', e.target.value)}
                className={`w-full px-4 py-3 border rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all dark:text-gray-100 dark:placeholder-gray-400 ${errors.firstName ? 'bg-red-50 border-red-300' : 'bg-gray-50 border-gray-200 dark:!bg-gray-700 dark:border-gray-600'
                  }`}
                placeholder="Nome"
                disabled={isSubmitting}
              />
              {errors.firstName && (
                <p className="mt-1 text-sm text-red-600">{errors.firstName}</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                Sobrenome <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={formData.lastName}
                onChange={(e) => handleInputChange('lastName', e.target.value)}
                className={`w-full px-4 py-3 border rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all dark:text-gray-100 dark:placeholder-gray-400 ${errors.lastName ? 'bg-red-50 border-red-300' : 'bg-gray-50 border-gray-200 dark:!bg-gray-700 dark:border-gray-600'
                  }`}
                placeholder="Sobrenome"
                disabled={isSubmitting}
              />
              {errors.lastName && (
                <p className="mt-1 text-sm text-red-600">{errors.lastName}</p>
              )}
            </div>
          </div>

          {/* Email e Telefone */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                Email <span className="text-red-500">*</span>
              </label>
              <input
                type="email"
                value={formData.email}
                onChange={(e) => handleInputChange('email', e.target.value)}
                onBlur={handleEmailBlur}
                className={`w-full px-4 py-3 border rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all dark:text-gray-100 dark:placeholder-gray-400 ${errors.email ? 'bg-red-50 border-red-300' : 'bg-gray-50 border-gray-200 dark:!bg-gray-700 dark:border-gray-600'
                  }`}
                placeholder="email@exemplo.com"
                disabled={isSubmitting}
              />
              {errors.email && (
                <p className="mt-1 text-sm text-red-600">{errors.email}</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                Telefone <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={formData.phone}
                onChange={(e) => handleInputChange('phone', e.target.value)}
                onBlur={handlePhoneBlur}
                className={`w-full px-4 py-3 border rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all dark:text-gray-100 dark:placeholder-gray-400 ${errors.phone ? 'bg-red-50 border-red-300' : 'bg-gray-50 border-gray-200 dark:!bg-gray-700 dark:border-gray-600'
                  }`}
                placeholder="(00) 00000-0000"
                disabled={isSubmitting}
              />
              {errors.phone && (
                <p className="mt-1 text-sm text-red-600">{errors.phone}</p>
              )}
            </div>
          </div>

          {/* CPF e Data de Nascimento */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                CPF <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={formData.cpf}
                onChange={(e) => handleInputChange('cpf', e.target.value)}
                onBlur={handleCpfBlur}
                className={`w-full px-4 py-3 border rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all dark:text-gray-100 dark:placeholder-gray-400 ${errors.cpf ? 'bg-red-50 border-red-300' : 'bg-gray-50 border-gray-200 dark:!bg-gray-700 dark:border-gray-600'
                  }`}
                placeholder="000.000.000-00"
                maxLength={14}
                disabled={isSubmitting}
              />
              {errors.cpf && (
                <p className="mt-1 text-sm text-red-600">{errors.cpf}</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                Data de Nascimento <span className="text-red-500">*</span>
              </label>
              <input
                type="date"
                value={formData.birthDate}
                onChange={(e) => handleInputChange('birthDate', e.target.value)}
                className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50 dark:!bg-gray-700 dark:border-gray-600 dark:text-gray-100"
                disabled={isSubmitting}
              />
            </div>
          </div>

          {/* Gênero e Cargo */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                Gênero <span className="text-red-500">*</span>
              </label>
              <select
                value={formData.gender}
                onChange={(e) => handleInputChange('gender', e.target.value)}
                className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50 dark:!bg-gray-700 dark:border-gray-600 dark:text-gray-100"
                disabled={isSubmitting}
              >
                <option value="">Selecione...</option>
                <option value="masculino">Masculino</option>
                <option value="feminino">Feminino</option>
                <option value="nao-binario">Não-binário</option>
                <option value="outros">Outros</option>
                <option value="prefiro-nao-informar">Prefiro não informar</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                Cargo <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={formData.position}
                onChange={(e) => handleInputChange('position', e.target.value)}
                className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50 dark:!bg-gray-700 dark:border-gray-600 dark:text-gray-100"
                placeholder="Ex: Desenvolvedor, Analista..."
                disabled={isSubmitting}
              />
            </div>
          </div>

          {/* Endereço - CEP */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
              CEP <span className="text-red-500">*</span>
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={formData.address.cep}
                onChange={(e) => handleInputChange('address.cep', e.target.value)}
                onBlur={handleCepBlur}
                className={`flex-1 px-4 py-3 border rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all dark:text-gray-100 dark:placeholder-gray-400 ${errors['address.cep'] ? 'bg-red-50 border-red-300' : 'bg-gray-50 border-gray-200 dark:!bg-gray-700 dark:border-gray-600'
                  }`}
                placeholder="00000-000"
                maxLength={9}
                disabled={isSubmitting || isSearchingCep}
              />
              {isSearchingCep && (
                <div className="flex items-center px-4 text-blue-500">
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600"></div>
                </div>
              )}
            </div>
            {errors['address.cep'] && (
              <p className="mt-1 text-sm text-red-600">{errors['address.cep']}</p>
            )}
          </div>

          {/* Endereço - Rua e Número */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="sm:col-span-2">
              <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                Rua/Logradouro <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={formData.address.street}
                onChange={(e) => handleInputChange('address.street', e.target.value)}
                className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50 dark:!bg-gray-700 dark:border-gray-600 dark:text-gray-100"
                placeholder="Rua, Avenida, etc."
                disabled={isSubmitting}
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                Número <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={formData.address.number}
                onChange={(e) => handleInputChange('address.number', e.target.value)}
                className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50 dark:!bg-gray-700 dark:border-gray-600 dark:text-gray-100"
                placeholder="123"
                disabled={isSubmitting}
              />
            </div>
          </div>

          {/* Endereço - Complemento e Bairro */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                Complemento
              </label>
              <input
                type="text"
                value={formData.address.complement}
                onChange={(e) => handleInputChange('address.complement', e.target.value)}
                className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50 dark:!bg-gray-700 dark:border-gray-600 dark:text-gray-100"
                placeholder="Apto, Bloco, etc."
                disabled={isSubmitting}
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                Bairro <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={formData.address.neighborhood}
                onChange={(e) => handleInputChange('address.neighborhood', e.target.value)}
                className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50 dark:!bg-gray-700 dark:border-gray-600 dark:text-gray-100"
                placeholder="Bairro"
                disabled={isSubmitting}
              />
            </div>
          </div>

          {/* Endereço - Cidade e Estado */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                Cidade <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={formData.address.city}
                onChange={(e) => handleInputChange('address.city', e.target.value)}
                className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50 dark:!bg-gray-700 dark:border-gray-600 dark:text-gray-100"
                placeholder="Cidade"
                disabled={isSubmitting}
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                Estado <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={formData.address.state}
                onChange={(e) => handleInputChange('address.state', e.target.value.toUpperCase())}
                className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50 dark:!bg-gray-700 dark:border-gray-600 dark:text-gray-100"
                placeholder="UF"
                maxLength={2}
                disabled={isSubmitting}
              />
            </div>
          </div>

          {/* Foto */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
              Foto de Perfil
            </label>
            <PhotoUpload
              onPhotoProcessed={handlePhotoProcessed}
              onPhotoRemoved={handlePhotoRemoved}
              initialPhotoUrl={photoUrl || undefined}
              disabled={isSubmitting || isUploadingPhoto}
            />
          </div>

          {/* Botões */}
          <div className="flex gap-3 justify-end pt-4 border-t border-gray-200 dark:border-gray-700">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-6 py-3 border border-gray-300 dark:border-gray-600 rounded-xl text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isSubmitting || isUploadingPhoto}
              className="px-6 py-3 bg-gradient-to-r from-blue-500 to-indigo-600 text-white rounded-xl hover:from-blue-600 hover:to-indigo-700 hover:-translate-y-0.5 active:translate-y-0 transition-all duration-200 shadow-lg shadow-blue-500/25 hover:shadow-xl disabled:opacity-50 disabled:transform-none flex items-center gap-2"
            >
              {isSubmitting || isUploadingPhoto ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                  {isUploadingPhoto ? 'Enviando foto...' : 'Salvando...'}
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  Salvar Alterações
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );

  return typeof document !== 'undefined' ? createPortal(modalContent, document.body) : null;
};

export default EditarPerfilModal;
