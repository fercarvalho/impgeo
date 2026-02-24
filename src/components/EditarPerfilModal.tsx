import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Save, User, X } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import PhotoUpload from './PhotoUpload';
import { validateEmail } from '../utils/validation';
import { applyPhoneMask, removePhoneMask, validatePhoneFormat } from '../utils/phoneMask';
import { applyCpfMask, removeCpfMask, validateCpfFormat } from '../utils/cpfMask';
import { applyCepMask, fetchAddressByCep, removeCepMask, validateCepFormat } from '../utils/cepMask';

interface EditarPerfilModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const API_BASE_URL =
  typeof window !== 'undefined' &&
    (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
    ? 'http://localhost:9001/api'
    : ((import.meta as any).env?.VITE_API_URL || '/api');

const EditarPerfilModal: React.FC<EditarPerfilModalProps> = ({ isOpen, onClose }) => {
  const { user, token, refreshUser, updateUser } = useAuth();
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
      state: '',
    },
  });
  const [password, setPassword] = useState('');
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const [isSearchingCep, setIsSearchingCep] = useState(false);
  const initializedRef = useRef(false);

  useEffect(() => {
    if (isOpen && user && !initializedRef.current) {
      setFormData({
        firstName: user.firstName || '',
        lastName: user.lastName || '',
        email: user.email || '',
        phone: user.phone ? applyPhoneMask(user.phone) : '',
        cpf: user.cpf ? applyCpfMask(user.cpf) : '',
        birthDate: user.birthDate || '',
        gender: user.gender || '',
        position: user.position || '',
        address: user.address
          ? {
            cep: user.address.cep ? applyCepMask(user.address.cep) : '',
            street: user.address.street || '',
            number: user.address.number || '',
            complement: user.address.complement || '',
            neighborhood: user.address.neighborhood || '',
            city: user.address.city || '',
            state: user.address.state || '',
          }
          : {
            cep: '',
            street: '',
            number: '',
            complement: '',
            neighborhood: '',
            city: '',
            state: '',
          },
      });
      setPhotoUrl(user.photoUrl || null);
      setPassword('');
      setPhotoFile(null);
      setErrors({});
      initializedRef.current = true;
    }

    if (!isOpen) {
      initializedRef.current = false;
    }
  }, [isOpen, user]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    if (isOpen) {
      window.addEventListener('keydown', onKeyDown);
    }
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose]);

  const clearError = (field: string) => {
    if (!errors[field]) return;
    setErrors((previous) => {
      const next = { ...previous };
      delete next[field];
      return next;
    });
  };

  const handleInputChange = (field: string, value: string) => {
    if (field === 'phone') {
      setFormData((previous) => ({ ...previous, phone: applyPhoneMask(value) }));
    } else if (field === 'cpf') {
      setFormData((previous) => ({ ...previous, cpf: applyCpfMask(value) }));
    } else if (field === 'address.cep') {
      setFormData((previous) => ({
        ...previous,
        address: { ...previous.address, cep: applyCepMask(value) },
      }));
    } else if (field.startsWith('address.')) {
      const addressField = field.replace('address.', '');
      setFormData((previous) => ({
        ...previous,
        address: { ...previous.address, [addressField]: value },
      }));
    } else {
      setFormData((previous) => ({ ...previous, [field]: value }));
    }

    clearError(field);
  };

  const handleCepBlur = async () => {
    const cep = formData.address.cep;
    if (!cep || removeCepMask(cep).length !== 8) return;
    setIsSearchingCep(true);
    try {
      const addressData = await fetchAddressByCep(cep);
      if (!addressData) {
        setErrors((previous) => ({ ...previous, 'address.cep': 'CEP não encontrado' }));
        return;
      }
      setFormData((previous) => ({
        ...previous,
        address: {
          ...previous.address,
          street: addressData.logradouro || '',
          neighborhood: addressData.bairro || '',
          city: addressData.localidade || '',
          state: addressData.uf || '',
          complement: addressData.complemento || previous.address.complement,
        },
      }));
    } catch (error) {
      setErrors((previous) => ({ ...previous, 'address.cep': 'Erro ao buscar endereço' }));
    } finally {
      setIsSearchingCep(false);
    }
  };

  const uploadPhoto = async (file: File): Promise<string | null> => {
    setIsUploadingPhoto(true);
    try {
      const uploadData = new FormData();
      uploadData.append('photo', file);
      const response = await fetch(`${API_BASE_URL}/user/upload-photo`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: uploadData,
      });
      const result = await response.json();
      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Erro ao enviar foto');
      }
      return result.data.photoUrl;
    } finally {
      setIsUploadingPhoto(false);
    }
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const newErrors: Record<string, string> = {};

    if (!password) newErrors.password = 'Senha atual é obrigatória';
    if (!formData.firstName || formData.firstName.trim().length < 2) newErrors.firstName = 'Nome inválido';
    if (!formData.lastName || formData.lastName.trim().length < 2) newErrors.lastName = 'Sobrenome inválido';
    if (!formData.email || !validateEmail(formData.email).isValid) {
      newErrors.email = validateEmail(formData.email).error || 'Email inválido';
    }
    if (!formData.phone || !validatePhoneFormat(formData.phone).isValid) {
      newErrors.phone = validatePhoneFormat(formData.phone).error || 'Telefone inválido';
    }
    if (!formData.cpf || !validateCpfFormat(formData.cpf).isValid) {
      newErrors.cpf = validateCpfFormat(formData.cpf).error || 'CPF inválido';
    }
    if (!formData.birthDate) newErrors.birthDate = 'Data de nascimento é obrigatória';
    if (!formData.gender) newErrors.gender = 'Gênero é obrigatório';
    if (!formData.position || !formData.position.trim()) newErrors.position = 'Cargo é obrigatório';
    if (!formData.address.cep || !validateCepFormat(formData.address.cep).isValid) {
      newErrors['address.cep'] = validateCepFormat(formData.address.cep).error || 'CEP inválido';
    }
    if (!formData.address.street.trim()) newErrors['address.street'] = 'Rua é obrigatória';
    if (!formData.address.number.trim()) newErrors['address.number'] = 'Número é obrigatório';
    if (!formData.address.neighborhood.trim()) newErrors['address.neighborhood'] = 'Bairro é obrigatório';
    if (!formData.address.city.trim()) newErrors['address.city'] = 'Cidade é obrigatória';
    if (!formData.address.state.trim() || formData.address.state.trim().length !== 2) {
      newErrors['address.state'] = 'UF deve ter 2 caracteres';
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    setIsSubmitting(true);
    try {
      let finalPhotoUrl = photoUrl;
      console.log('handleSubmit -> photoFile:', photoFile, 'photoUrl:', photoUrl);
      if (photoFile) {
        finalPhotoUrl = await uploadPhoto(photoFile);
        setPhotoUrl(finalPhotoUrl);
      }

      const payload: Record<string, any> = {
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
          complement: formData.address.complement.trim(),
          neighborhood: formData.address.neighborhood.trim(),
          city: formData.address.city.trim(),
          state: formData.address.state.trim().toUpperCase(),
        },
        password,
      };
      if (finalPhotoUrl !== undefined) payload.photoUrl = finalPhotoUrl || null;

      const response = await fetch(`${API_BASE_URL}/user/profile`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });
      const result = await response.json();
      if (!response.ok || !result.success) {
        setErrors({ general: result.error || 'Erro ao atualizar perfil' });
        return;
      }

      updateUser(result.data || {}, result.token);
      await refreshUser();
      setPassword('');
      setPhotoFile(null);
      setErrors({});
      onClose();
    } catch (error: any) {
      setErrors({ general: error?.message || 'Erro ao atualizar perfil' });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen || !user) return null;

  const content = (
    <div
      className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[9999] p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between z-10">
          <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2">
            <User className="w-5 h-5 text-blue-700" />
            Editar Perfil
          </h2>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg transition-colors" disabled={isSubmitting}>
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 sm:p-6 space-y-4">
          {errors.general ? (
            <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-lg text-sm">{errors.general}</div>
          ) : null}

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              Senha Atual <span className="text-red-500">*</span>
            </label>
            <input
              type="password"
              value={password}
              onChange={(event) => {
                setPassword(event.target.value);
                clearError('password');
              }}
              className={`w-full px-4 py-3 border rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all ${errors.password ? 'bg-red-50 border-red-300' : 'bg-gray-50 border-gray-200'
                }`}
              placeholder="Digite sua senha atual"
              disabled={isSubmitting}
            />
            {errors.password ? <p className="mt-1 text-sm text-red-600">{errors.password}</p> : null}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Nome <span className="text-red-500">*</span></label>
              <input
                type="text"
                value={formData.firstName}
                onChange={(event) => handleInputChange('firstName', event.target.value)}
                className={`w-full px-4 py-3 border rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all ${errors.firstName ? 'bg-red-50 border-red-300' : 'bg-gray-50 border-gray-200'
                  }`}
                disabled={isSubmitting}
              />
              {errors.firstName ? <p className="mt-1 text-sm text-red-600">{errors.firstName}</p> : null}
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Sobrenome <span className="text-red-500">*</span></label>
              <input
                type="text"
                value={formData.lastName}
                onChange={(event) => handleInputChange('lastName', event.target.value)}
                className={`w-full px-4 py-3 border rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all ${errors.lastName ? 'bg-red-50 border-red-300' : 'bg-gray-50 border-gray-200'
                  }`}
                disabled={isSubmitting}
              />
              {errors.lastName ? <p className="mt-1 text-sm text-red-600">{errors.lastName}</p> : null}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Email <span className="text-red-500">*</span></label>
              <input
                type="email"
                value={formData.email}
                onChange={(event) => handleInputChange('email', event.target.value)}
                onBlur={() => formData.email && clearError('email')}
                className={`w-full px-4 py-3 border rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all ${errors.email ? 'bg-red-50 border-red-300' : 'bg-gray-50 border-gray-200'
                  }`}
                disabled={isSubmitting}
              />
              {errors.email ? <p className="mt-1 text-sm text-red-600">{errors.email}</p> : null}
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Telefone <span className="text-red-500">*</span></label>
              <input
                type="text"
                value={formData.phone}
                onChange={(event) => handleInputChange('phone', event.target.value)}
                className={`w-full px-4 py-3 border rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all ${errors.phone ? 'bg-red-50 border-red-300' : 'bg-gray-50 border-gray-200'
                  }`}
                placeholder="(00) 00000-0000"
                disabled={isSubmitting}
              />
              {errors.phone ? <p className="mt-1 text-sm text-red-600">{errors.phone}</p> : null}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">CPF <span className="text-red-500">*</span></label>
              <input
                type="text"
                value={formData.cpf}
                onChange={(event) => handleInputChange('cpf', event.target.value)}
                maxLength={14}
                className={`w-full px-4 py-3 border rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all ${errors.cpf ? 'bg-red-50 border-red-300' : 'bg-gray-50 border-gray-200'
                  }`}
                placeholder="000.000.000-00"
                disabled={isSubmitting}
              />
              {errors.cpf ? <p className="mt-1 text-sm text-red-600">{errors.cpf}</p> : null}
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Data de Nascimento <span className="text-red-500">*</span></label>
              <input
                type="date"
                value={formData.birthDate}
                onChange={(event) => handleInputChange('birthDate', event.target.value)}
                className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50"
                disabled={isSubmitting}
              />
              {errors.birthDate ? <p className="mt-1 text-sm text-red-600">{errors.birthDate}</p> : null}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Gênero <span className="text-red-500">*</span></label>
              <select
                value={formData.gender}
                onChange={(event) => handleInputChange('gender', event.target.value)}
                className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50"
                disabled={isSubmitting}
              >
                <option value="">Selecione...</option>
                <option value="masculino">Masculino</option>
                <option value="feminino">Feminino</option>
                <option value="nao-binario">Não-binário</option>
                <option value="outros">Outros</option>
                <option value="prefiro-nao-informar">Prefiro não informar</option>
              </select>
              {errors.gender ? <p className="mt-1 text-sm text-red-600">{errors.gender}</p> : null}
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Cargo <span className="text-red-500">*</span></label>
              <input
                type="text"
                value={formData.position}
                onChange={(event) => handleInputChange('position', event.target.value)}
                className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50"
                disabled={isSubmitting}
              />
              {errors.position ? <p className="mt-1 text-sm text-red-600">{errors.position}</p> : null}
            </div>
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">CEP <span className="text-red-500">*</span></label>
            <div className="flex gap-2">
              <input
                type="text"
                value={formData.address.cep}
                onChange={(event) => handleInputChange('address.cep', event.target.value)}
                onBlur={handleCepBlur}
                maxLength={9}
                className={`flex-1 px-4 py-3 border rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all ${errors['address.cep'] ? 'bg-red-50 border-red-300' : 'bg-gray-50 border-gray-200'
                  }`}
                disabled={isSubmitting || isSearchingCep}
              />
              {isSearchingCep ? (
                <div className="flex items-center px-4 text-blue-600">
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600"></div>
                </div>
              ) : null}
            </div>
            {errors['address.cep'] ? <p className="mt-1 text-sm text-red-600">{errors['address.cep']}</p> : null}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="sm:col-span-2">
              <label className="block text-sm font-semibold text-gray-700 mb-2">Rua/Logradouro <span className="text-red-500">*</span></label>
              <input
                type="text"
                value={formData.address.street}
                onChange={(event) => handleInputChange('address.street', event.target.value)}
                className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50"
                disabled={isSubmitting}
              />
              {errors['address.street'] ? <p className="mt-1 text-sm text-red-600">{errors['address.street']}</p> : null}
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Número <span className="text-red-500">*</span></label>
              <input
                type="text"
                value={formData.address.number}
                onChange={(event) => handleInputChange('address.number', event.target.value)}
                className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50"
                disabled={isSubmitting}
              />
              {errors['address.number'] ? <p className="mt-1 text-sm text-red-600">{errors['address.number']}</p> : null}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Complemento</label>
              <input
                type="text"
                value={formData.address.complement}
                onChange={(event) => handleInputChange('address.complement', event.target.value)}
                className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50"
                disabled={isSubmitting}
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Bairro <span className="text-red-500">*</span></label>
              <input
                type="text"
                value={formData.address.neighborhood}
                onChange={(event) => handleInputChange('address.neighborhood', event.target.value)}
                className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50"
                disabled={isSubmitting}
              />
              {errors['address.neighborhood'] ? <p className="mt-1 text-sm text-red-600">{errors['address.neighborhood']}</p> : null}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Cidade <span className="text-red-500">*</span></label>
              <input
                type="text"
                value={formData.address.city}
                onChange={(event) => handleInputChange('address.city', event.target.value)}
                className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50"
                disabled={isSubmitting}
              />
              {errors['address.city'] ? <p className="mt-1 text-sm text-red-600">{errors['address.city']}</p> : null}
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Estado (UF) <span className="text-red-500">*</span></label>
              <input
                type="text"
                value={formData.address.state}
                onChange={(event) => handleInputChange('address.state', event.target.value.toUpperCase())}
                maxLength={2}
                className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50"
                disabled={isSubmitting}
              />
              {errors['address.state'] ? <p className="mt-1 text-sm text-red-600">{errors['address.state']}</p> : null}
            </div>
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">Foto de Perfil</label>
            <PhotoUpload
              onPhotoProcessed={(file) => setPhotoFile(file)}
              onPhotoRemoved={() => {
                setPhotoFile(null);
                setPhotoUrl(null);
              }}
              initialPhotoUrl={photoUrl || undefined}
              disabled={isSubmitting || isUploadingPhoto}
            />
          </div>

          <div className="flex gap-3 justify-end pt-4 border-t border-gray-200">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-6 py-3 border border-gray-300 rounded-xl text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isSubmitting || isUploadingPhoto}
              className="px-6 py-3 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors disabled:opacity-50 flex items-center gap-2"
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

  return typeof document !== 'undefined' ? createPortal(content, document.body) : null;
};

export default EditarPerfilModal;
