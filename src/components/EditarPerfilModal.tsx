import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X, User, Save } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import PhotoUpload from './PhotoUpload';
import { validateEmail } from '../utils/validation';
import { applyPhoneMask, removePhoneMask, validatePhoneFormat } from '../utils/phoneMask';
import { applyCpfMask, removeCpfMask, validateCpfFormat } from '../utils/cpfMask';
import { applyCepMask, removeCepMask, validateCepFormat, fetchAddressByCep } from '../utils/cepMask';

const API_BASE_URL =
  typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
    ? 'http://localhost:9001/api'
    : ((import.meta as any).env?.VITE_API_URL || '/api');

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
      let mounted = true;
      try {
        const addressData = await fetchAddressByCep(cep);
        if (!mounted) return;
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
        if (!mounted) return;
        console.error('Erro ao buscar CEP:', error);
        setErrors(prev => ({ ...prev, 'address.cep': 'Erro ao buscar endereço' }));
      } finally {
        if (mounted) setIsSearchingCep(false);
        mounted = false;
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
    if (!token) {
      throw new Error('Sessão expirada. Faça login novamente.');
    }
    try {
      setIsUploadingPhoto(true);
      const uploadFormData = new FormData();
      uploadFormData.append('photo', file);

      const response = await fetch(`${API_BASE_URL}/user/upload-photo`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        },
        body: uploadFormData
      });

      let result: { success?: boolean; error?: string; data?: { photoUrl?: string } } = {};
      try {
        result = await response.json();
      } catch {
        // body não é JSON
      }

      if (result.success) {
        return result.data?.photoUrl ?? null;
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

    if (!formData.address.state || !formData.address.state.trim() || formData.address.state.trim().length !== 2) {
      newErrors['address.state'] = 'Estado (UF) é obrigatório e deve ter 2 caracteres';
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    if (!token) {
      setErrors({ general: 'Sessão expirada. Faça login novamente.' });
      return;
    }

    setIsSubmitting(true);

    try {
      // Se há foto nova para enviar (photoFile presente), fazer upload independente de photoUrl
      let finalPhotoUrl = photoUrl;
      if (photoFile) {
        finalPhotoUrl = await uploadPhoto(photoFile);
        setPhotoUrl(finalPhotoUrl);
      }

      // Preparar dados para envio - todos os campos são obrigatórios
      const updateData: {
        firstName: string;
        lastName: string;
        email: string;
        phone: string;
        cpf: string;
        birthDate: string;
        gender: string;
        position: string;
        address: {
          cep: string;
          street: string;
          number: string;
          complement: string;
          neighborhood: string;
          city: string;
          state: string;
        };
        password: string;
        photoUrl?: string | null;
      } = {
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

      updateData.photoUrl = finalPhotoUrl || null;

      const response = await fetch(`${API_BASE_URL}/user/profile`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(updateData)
      });

      let result: { success?: boolean; error?: string } = {};
      try {
        result = await response.json();
      } catch {
        // body não é JSON
      }

      if (response.ok && result.success) {
        // Atualizar contexto
        await refreshUser();
        setPassword('');
        setPhotoFile(null);
        setErrors({});
        onClose();
      } else {
        setErrors({ general: result.error || 'Erro ao atualizar perfil' });
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Erro ao atualizar perfil';
      setErrors({ general: message });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen || !user) return null;

  const modalContent = (
    <div
      className="fixed inset-0 bg-gradient-to-br from-blue-900/50 to-indigo-900/50 backdrop-blur-sm flex items-center justify-center z-[90] px-4 py-8"
      onClick={(e) => {
        if (e.target === e.currentTarget && !isSubmitting && !isUploadingPhoto) {
          onClose();
        }
      }}
    >
      <div className="bg-[#ffffff] dark:!bg-[#243040] rounded-2xl p-6 w-full max-w-2xl max-h-[calc(100vh-4rem)] overflow-y-auto shadow-2xl border border-gray-200/50 dark:border-gray-700">
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-500 to-indigo-600 -mx-6 -mt-6 mb-6 px-6 py-4 border-b border-white/20">
          <div className="flex items-center justify-between">
            <h2 id="editarPerfilModalTitle" className="text-xl font-bold text-white flex items-center gap-2">
              <User className="w-6 h-6 text-white" aria-hidden="true" />
              Editar Perfil
            </h2>
            <button
              onClick={onClose}
              className="text-white/80 hover:text-white hover:bg-white/20 p-2 rounded-lg transition-all duration-200"
              disabled={isSubmitting || isUploadingPhoto}
              aria-label="Fechar modal"
            >
              <X className="w-5 h-5" aria-hidden="true" />
            </button>
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4" aria-labelledby="editarPerfilModalTitle">
          {errors.general && (
            <div
              className="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-700 text-red-800 dark:text-red-300 px-4 py-3 rounded-lg text-sm"
              role="alert"
            >
              {errors.general}
            </div>
          )}

          {/* Senha Atual */}
          <div>
            <label htmlFor="editarPerfilPassword" className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
              Senha Atual <span className="text-red-500">*</span>
            </label>
            <input
              id="editarPerfilPassword"
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
              className={`w-full px-4 py-3 border rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all dark:text-gray-100 dark:placeholder-gray-400 ${errors.password
                ? 'bg-red-50 border-red-300 dark:bg-red-900/20 dark:border-red-700'
                : 'bg-gray-50 border-gray-200 dark:!bg-gray-700 dark:border-gray-600'
                }`}
              placeholder="Digite sua senha atual"
              disabled={isSubmitting || isUploadingPhoto}
              autoComplete="current-password"
            />
            {errors.password && (
              <p className="mt-1 text-sm text-red-600 dark:text-red-400" role="alert">{errors.password}</p>
            )}
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              Necessária para confirmar sua identidade
            </p>
          </div>

          {/* Nome e Sobrenome */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="editarPerfilFirstName" className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                Nome <span className="text-red-500">*</span>
              </label>
              <input
                id="editarPerfilFirstName"
                type="text"
                value={formData.firstName}
                onChange={(e) => handleInputChange('firstName', e.target.value)}
                className={`w-full px-4 py-3 border rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all dark:text-gray-100 dark:placeholder-gray-400 ${errors.firstName
                  ? 'bg-red-50 border-red-300 dark:bg-red-900/20 dark:border-red-700'
                  : 'bg-gray-50 border-gray-200 dark:!bg-gray-700 dark:border-gray-600'
                  }`}
                placeholder="Nome"
                disabled={isSubmitting}
                autoComplete="given-name"
              />
              {errors.firstName && (
                <p className="mt-1 text-sm text-red-600 dark:text-red-400" role="alert">{errors.firstName}</p>
              )}
            </div>

            <div>
              <label htmlFor="editarPerfilLastName" className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                Sobrenome <span className="text-red-500">*</span>
              </label>
              <input
                id="editarPerfilLastName"
                type="text"
                value={formData.lastName}
                onChange={(e) => handleInputChange('lastName', e.target.value)}
                className={`w-full px-4 py-3 border rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all dark:text-gray-100 dark:placeholder-gray-400 ${errors.lastName
                  ? 'bg-red-50 border-red-300 dark:bg-red-900/20 dark:border-red-700'
                  : 'bg-gray-50 border-gray-200 dark:!bg-gray-700 dark:border-gray-600'
                  }`}
                placeholder="Sobrenome"
                disabled={isSubmitting}
                autoComplete="family-name"
              />
              {errors.lastName && (
                <p className="mt-1 text-sm text-red-600 dark:text-red-400" role="alert">{errors.lastName}</p>
              )}
            </div>
          </div>

          {/* Email e Telefone */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="editarPerfilEmail" className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                Email <span className="text-red-500">*</span>
              </label>
              <input
                id="editarPerfilEmail"
                type="email"
                value={formData.email}
                onChange={(e) => handleInputChange('email', e.target.value)}
                onBlur={handleEmailBlur}
                className={`w-full px-4 py-3 border rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all dark:text-gray-100 dark:placeholder-gray-400 ${errors.email
                  ? 'bg-red-50 border-red-300 dark:bg-red-900/20 dark:border-red-700'
                  : 'bg-gray-50 border-gray-200 dark:!bg-gray-700 dark:border-gray-600'
                  }`}
                placeholder="email@exemplo.com"
                disabled={isSubmitting}
                autoComplete="email"
              />
              {errors.email && (
                <p className="mt-1 text-sm text-red-600 dark:text-red-400" role="alert">{errors.email}</p>
              )}
            </div>

            <div>
              <label htmlFor="editarPerfilPhone" className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                Telefone <span className="text-red-500">*</span>
              </label>
              <input
                id="editarPerfilPhone"
                type="text"
                value={formData.phone}
                onChange={(e) => handleInputChange('phone', e.target.value)}
                onBlur={handlePhoneBlur}
                className={`w-full px-4 py-3 border rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all dark:text-gray-100 dark:placeholder-gray-400 ${errors.phone
                  ? 'bg-red-50 border-red-300 dark:bg-red-900/20 dark:border-red-700'
                  : 'bg-gray-50 border-gray-200 dark:!bg-gray-700 dark:border-gray-600'
                  }`}
                placeholder="(00) 00000-0000"
                disabled={isSubmitting}
                autoComplete="tel"
              />
              {errors.phone && (
                <p className="mt-1 text-sm text-red-600 dark:text-red-400" role="alert">{errors.phone}</p>
              )}
            </div>
          </div>

          {/* CPF e Data de Nascimento */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="editarPerfilCpf" className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                CPF <span className="text-red-500">*</span>
              </label>
              <input
                id="editarPerfilCpf"
                type="text"
                value={formData.cpf}
                onChange={(e) => handleInputChange('cpf', e.target.value)}
                onBlur={handleCpfBlur}
                className={`w-full px-4 py-3 border rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all dark:text-gray-100 dark:placeholder-gray-400 ${errors.cpf
                  ? 'bg-red-50 border-red-300 dark:bg-red-900/20 dark:border-red-700'
                  : 'bg-gray-50 border-gray-200 dark:!bg-gray-700 dark:border-gray-600'
                  }`}
                placeholder="000.000.000-00"
                maxLength={14}
                disabled={isSubmitting}
              />
              {errors.cpf && (
                <p className="mt-1 text-sm text-red-600 dark:text-red-400" role="alert">{errors.cpf}</p>
              )}
            </div>

            <div>
              <label htmlFor="editarPerfilBirthDate" className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                Data de Nascimento <span className="text-red-500">*</span>
              </label>
              <input
                id="editarPerfilBirthDate"
                type="date"
                value={formData.birthDate}
                onChange={(e) => handleInputChange('birthDate', e.target.value)}
                className={`w-full px-4 py-3 border rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all dark:text-gray-100 ${errors.birthDate
                  ? 'bg-red-50 border-red-300 dark:bg-red-900/20 dark:border-red-700'
                  : 'bg-gray-50 border-gray-200 dark:!bg-gray-700 dark:border-gray-600'
                  }`}
                disabled={isSubmitting}
              />
              {errors.birthDate && (
                <p className="mt-1 text-sm text-red-600 dark:text-red-400" role="alert">{errors.birthDate}</p>
              )}
            </div>
          </div>

          {/* Gênero e Cargo */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="editarPerfilGender" className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                Gênero <span className="text-red-500">*</span>
              </label>
              <select
                id="editarPerfilGender"
                value={formData.gender}
                onChange={(e) => handleInputChange('gender', e.target.value)}
                className={`w-full px-4 py-3 border rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all dark:text-gray-100 ${errors.gender
                  ? 'bg-red-50 border-red-300 dark:bg-red-900/20 dark:border-red-700'
                  : 'bg-gray-50 border-gray-200 dark:!bg-gray-700 dark:border-gray-600'
                  }`}
                disabled={isSubmitting}
              >
                <option value="">Selecione...</option>
                <option value="masculino">Masculino</option>
                <option value="feminino">Feminino</option>
                <option value="nao-binario">Não-binário</option>
                <option value="outros">Outros</option>
                <option value="prefiro-nao-informar">Prefiro não informar</option>
              </select>
              {errors.gender && (
                <p className="mt-1 text-sm text-red-600 dark:text-red-400" role="alert">{errors.gender}</p>
              )}
            </div>

            <div>
              <label htmlFor="editarPerfilPosition" className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                Cargo <span className="text-red-500">*</span>
              </label>
              <input
                id="editarPerfilPosition"
                type="text"
                value={formData.position}
                onChange={(e) => handleInputChange('position', e.target.value)}
                className={`w-full px-4 py-3 border rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all dark:text-gray-100 dark:placeholder-gray-400 ${errors.position
                  ? 'bg-red-50 border-red-300 dark:bg-red-900/20 dark:border-red-700'
                  : 'bg-gray-50 border-gray-200 dark:!bg-gray-700 dark:border-gray-600'
                  }`}
                placeholder="Ex: Desenvolvedor, Analista..."
                disabled={isSubmitting}
              />
              {errors.position && (
                <p className="mt-1 text-sm text-red-600 dark:text-red-400" role="alert">{errors.position}</p>
              )}
            </div>
          </div>

          {/* Endereço - CEP */}
          <div>
            <label htmlFor="editarPerfilCep" className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
              CEP <span className="text-red-500">*</span>
            </label>
            <div className="flex gap-2">
              <input
                id="editarPerfilCep"
                type="text"
                value={formData.address.cep}
                onChange={(e) => handleInputChange('address.cep', e.target.value)}
                onBlur={handleCepBlur}
                className={`flex-1 px-4 py-3 border rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all dark:text-gray-100 dark:placeholder-gray-400 ${errors['address.cep']
                  ? 'bg-red-50 border-red-300 dark:bg-red-900/20 dark:border-red-700'
                  : 'bg-gray-50 border-gray-200 dark:!bg-gray-700 dark:border-gray-600'
                  }`}
                placeholder="00000-000"
                maxLength={9}
                disabled={isSubmitting || isSearchingCep}
              />
              {isSearchingCep && (
                <div className="flex items-center px-4 text-blue-500" aria-label="Buscando endereço...">
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600" aria-hidden="true"></div>
                </div>
              )}
            </div>
            {errors['address.cep'] && (
              <p className="mt-1 text-sm text-red-600 dark:text-red-400" role="alert">{errors['address.cep']}</p>
            )}
          </div>

          {/* Endereço - Rua e Número */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="sm:col-span-2">
              <label htmlFor="editarPerfilStreet" className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                Rua/Logradouro <span className="text-red-500">*</span>
              </label>
              <input
                id="editarPerfilStreet"
                type="text"
                value={formData.address.street}
                onChange={(e) => handleInputChange('address.street', e.target.value)}
                className={`w-full px-4 py-3 border rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all dark:text-gray-100 dark:placeholder-gray-400 ${errors['address.street']
                  ? 'bg-red-50 border-red-300 dark:bg-red-900/20 dark:border-red-700'
                  : 'bg-gray-50 border-gray-200 dark:!bg-gray-700 dark:border-gray-600'
                  }`}
                placeholder="Rua, Avenida, etc."
                disabled={isSubmitting}
              />
              {errors['address.street'] && (
                <p className="mt-1 text-sm text-red-600 dark:text-red-400" role="alert">{errors['address.street']}</p>
              )}
            </div>
            <div>
              <label htmlFor="editarPerfilNumber" className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                Número <span className="text-red-500">*</span>
              </label>
              <input
                id="editarPerfilNumber"
                type="text"
                value={formData.address.number}
                onChange={(e) => handleInputChange('address.number', e.target.value)}
                className={`w-full px-4 py-3 border rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all dark:text-gray-100 dark:placeholder-gray-400 ${errors['address.number']
                  ? 'bg-red-50 border-red-300 dark:bg-red-900/20 dark:border-red-700'
                  : 'bg-gray-50 border-gray-200 dark:!bg-gray-700 dark:border-gray-600'
                  }`}
                placeholder="123"
                disabled={isSubmitting}
              />
              {errors['address.number'] && (
                <p className="mt-1 text-sm text-red-600 dark:text-red-400" role="alert">{errors['address.number']}</p>
              )}
            </div>
          </div>

          {/* Endereço - Complemento e Bairro */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="editarPerfilComplement" className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                Complemento
              </label>
              <input
                id="editarPerfilComplement"
                type="text"
                value={formData.address.complement}
                onChange={(e) => handleInputChange('address.complement', e.target.value)}
                className="w-full px-4 py-3 border border-gray-200 dark:border-gray-600 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50 dark:!bg-gray-700 dark:text-gray-100 dark:placeholder-gray-400"
                placeholder="Apto, Bloco, etc."
                disabled={isSubmitting}
              />
            </div>
            <div>
              <label htmlFor="editarPerfilNeighborhood" className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                Bairro <span className="text-red-500">*</span>
              </label>
              <input
                id="editarPerfilNeighborhood"
                type="text"
                value={formData.address.neighborhood}
                onChange={(e) => handleInputChange('address.neighborhood', e.target.value)}
                className={`w-full px-4 py-3 border rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all dark:text-gray-100 dark:placeholder-gray-400 ${errors['address.neighborhood']
                  ? 'bg-red-50 border-red-300 dark:bg-red-900/20 dark:border-red-700'
                  : 'bg-gray-50 border-gray-200 dark:!bg-gray-700 dark:border-gray-600'
                  }`}
                placeholder="Bairro"
                disabled={isSubmitting}
              />
              {errors['address.neighborhood'] && (
                <p className="mt-1 text-sm text-red-600 dark:text-red-400" role="alert">{errors['address.neighborhood']}</p>
              )}
            </div>
          </div>

          {/* Endereço - Cidade e Estado */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="editarPerfilCity" className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                Cidade <span className="text-red-500">*</span>
              </label>
              <input
                id="editarPerfilCity"
                type="text"
                value={formData.address.city}
                onChange={(e) => handleInputChange('address.city', e.target.value)}
                className={`w-full px-4 py-3 border rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all dark:text-gray-100 dark:placeholder-gray-400 ${errors['address.city']
                  ? 'bg-red-50 border-red-300 dark:bg-red-900/20 dark:border-red-700'
                  : 'bg-gray-50 border-gray-200 dark:!bg-gray-700 dark:border-gray-600'
                  }`}
                placeholder="Cidade"
                disabled={isSubmitting}
              />
              {errors['address.city'] && (
                <p className="mt-1 text-sm text-red-600 dark:text-red-400" role="alert">{errors['address.city']}</p>
              )}
            </div>
            <div>
              <label htmlFor="editarPerfilState" className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                Estado <span className="text-red-500">*</span>
              </label>
              <input
                id="editarPerfilState"
                type="text"
                value={formData.address.state}
                onChange={(e) => handleInputChange('address.state', e.target.value.toUpperCase())}
                className={`w-full px-4 py-3 border rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all dark:text-gray-100 dark:placeholder-gray-400 ${errors['address.state']
                  ? 'bg-red-50 border-red-300 dark:bg-red-900/20 dark:border-red-700'
                  : 'bg-gray-50 border-gray-200 dark:!bg-gray-700 dark:border-gray-600'
                  }`}
                placeholder="UF"
                maxLength={2}
                disabled={isSubmitting}
              />
              {errors['address.state'] && (
                <p className="mt-1 text-sm text-red-600 dark:text-red-400" role="alert">{errors['address.state']}</p>
              )}
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
              disabled={isSubmitting || isUploadingPhoto}
              className="px-6 py-3 border border-gray-300 dark:border-gray-600 rounded-xl text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isSubmitting || isUploadingPhoto}
              aria-busy={isSubmitting || isUploadingPhoto}
              className="px-6 py-3 bg-gradient-to-r from-blue-500 to-indigo-600 text-white rounded-xl hover:from-blue-600 hover:to-indigo-700 hover:-translate-y-0.5 active:translate-y-0 transition-all duration-200 shadow-lg shadow-blue-500/25 hover:shadow-xl disabled:opacity-50 disabled:transform-none flex items-center gap-2"
            >
              {isSubmitting || isUploadingPhoto ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" aria-hidden="true"></div>
                  {isUploadingPhoto ? 'Enviando foto...' : 'Salvando...'}
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" aria-hidden="true" />
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
