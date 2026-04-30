import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, UserPlus } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { validateEmail } from '../../utils/validation';
import { applyPhoneMask, removePhoneMask, validatePhoneFormat } from '../../utils/phoneMask';
import { applyCpfMask, removeCpfMask, validateCpfFormat } from '../../utils/cpfMask';
import { applyCepMask, removeCepMask, validateCepFormat, fetchAddressByCep } from '../../utils/cepMask';

type RoleType = 'superadmin' | 'admin' | 'user' | 'guest';

interface CadastroCompletoModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (userData: { username: string; email: string; role: string; tempPassword?: string }) => void;
  apiBaseUrl: string;
  authHeaders: () => Record<string, string>;
  availableModules: { moduleKey: string; moduleName: string }[];
  superadminModules: string[];
}

const getDefaultModules = (role: RoleType): string[] => {
  switch (role) {
    case 'superadmin': return ['dashboard', 'projects', 'services', 'reports', 'metas', 'projecao', 'transactions', 'clients', 'dre', 'acompanhamentos', 'admin', 'sessions', 'anomalies', 'security_alerts'];
    case 'admin': return ['dashboard', 'projects', 'services', 'reports', 'metas', 'projecao', 'transactions', 'clients', 'dre', 'acompanhamentos', 'admin'];
    case 'user': return ['dashboard', 'projects', 'services', 'reports', 'metas', 'projecao', 'transactions', 'clients', 'dre', 'acompanhamentos'];
    case 'guest': return ['dashboard', 'metas', 'reports', 'dre'];
  }
};

const defaultForm = {
  firstName: '', lastName: '', username: '', email: '', phone: '', cpf: '',
  birthDate: '', gender: '', position: '',
  address: { cep: '', street: '', number: '', complement: '', neighborhood: '', city: '', state: '' },
  role: 'user' as RoleType,
  modules: getDefaultModules('user'),
  isActive: true
};

const CadastroCompletoModal: React.FC<CadastroCompletoModalProps> = ({
  isOpen, onClose, onSuccess, apiBaseUrl, authHeaders, availableModules, superadminModules
}) => {
  const { user: currentUser } = useAuth();
  const [form, setForm] = useState(defaultForm);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSearchingCep, setIsSearchingCep] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setForm(defaultForm);
    setErrors({});
    const handleKeyDown = (e: KeyboardEvent) => { if (e.key === 'Escape' && !isSubmitting) onClose(); };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  const setField = (field: string, value: string) => {
    if (field === 'phone') value = applyPhoneMask(value);
    else if (field === 'cpf') value = applyCpfMask(value);
    else if (field === 'address.cep') value = applyCepMask(value);

    if (field.startsWith('address.')) {
      const key = field.replace('address.', '');
      setForm(prev => ({ ...prev, address: { ...prev.address, [key]: value } }));
    } else {
      setForm(prev => ({ ...prev, [field]: value }));
    }
    setErrors(prev => { const e = { ...prev }; delete e[field]; return e; });
  };

  const handleCepBlur = async () => {
    const raw = removeCepMask(form.address.cep);
    if (raw.length !== 8) return;
    setIsSearchingCep(true);
    try {
      const data = await fetchAddressByCep(form.address.cep);
      if (data) {
        setForm(prev => ({
          ...prev,
          address: {
            ...prev.address,
            street: data.logradouro || '',
            neighborhood: data.bairro || '',
            city: data.localidade || '',
            state: data.uf || '',
          }
        }));
      } else {
        setErrors(prev => ({ ...prev, 'address.cep': 'CEP não encontrado' }));
      }
    } catch {
      setErrors(prev => ({ ...prev, 'address.cep': 'Erro ao buscar endereço' }));
    } finally {
      setIsSearchingCep(false);
    }
  };

  const validate = () => {
    const e: Record<string, string> = {};
    if (!form.firstName.trim() || form.firstName.trim().length < 2) e.firstName = 'Mínimo 2 caracteres';
    if (!form.lastName.trim() || form.lastName.trim().length < 2) e.lastName = 'Mínimo 2 caracteres';
    if (!form.username.trim() || form.username.trim().length < 3) e.username = 'Mínimo 3 caracteres';
    if (!/^[a-zA-Z0-9_-]+$/.test(form.username.trim())) e.username = 'Sem espaços ou acentos';
    if (!form.email.trim()) { e.email = 'Obrigatório'; } else { const v = validateEmail(form.email); if (!v.isValid) e.email = v.error || 'Inválido'; }
    if (!form.phone.trim()) { e.phone = 'Obrigatório'; } else { const v = validatePhoneFormat(form.phone); if (!v.isValid) e.phone = v.error || 'Inválido'; }
    if (form.cpf.trim()) { const v = validateCpfFormat(form.cpf); if (!v.isValid) e.cpf = v.error || 'CPF inválido'; }
    if (!form.birthDate) e.birthDate = 'Obrigatório';
    if (!form.gender) e.gender = 'Obrigatório';
    if (!form.position.trim()) e.position = 'Obrigatório';
    if (!form.address.cep.trim()) { e['address.cep'] = 'Obrigatório'; } else { const v = validateCepFormat(form.address.cep); if (!v.isValid) e['address.cep'] = v.error || 'Inválido'; }
    if (!form.address.street.trim()) e['address.street'] = 'Obrigatório';
    if (!form.address.number.trim()) e['address.number'] = 'Obrigatório';
    if (!form.address.neighborhood.trim()) e['address.neighborhood'] = 'Obrigatório';
    if (!form.address.city.trim()) e['address.city'] = 'Obrigatório';
    if (!form.address.state.trim() || form.address.state.length !== 2) e['address.state'] = 'UF obrigatório (2 letras)';
    return e;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length > 0) { setErrors(errs); return; }
    setIsSubmitting(true);
    try {
      const body = {
        firstName: form.firstName.trim(), lastName: form.lastName.trim(),
        username: form.username.trim(), email: form.email.trim(),
        phone: removePhoneMask(form.phone), cpf: removeCpfMask(form.cpf),
        birthDate: form.birthDate, gender: form.gender, position: form.position.trim(),
        address: {
          cep: removeCepMask(form.address.cep), street: form.address.street.trim(),
          number: form.address.number.trim(), complement: form.address.complement.trim(),
          neighborhood: form.address.neighborhood.trim(), city: form.address.city.trim(),
          state: form.address.state.trim().toUpperCase()
        },
        role: form.role,
        modules: form.modules.length > 0 ? form.modules : getDefaultModules(form.role),
        isActive: form.isActive
      };
      const response = await fetch(`${apiBaseUrl}/users`, {
        method: 'POST', headers: authHeaders(), body: JSON.stringify(body)
      });
      const data = await response.json();
      if (!response.ok) { setErrors({ general: data.error || 'Erro ao criar usuário' }); return; }
      onSuccess({ username: form.username.trim(), email: form.email.trim(), role: form.role, tempPassword: data.temporaryPassword });
    } catch {
      setErrors({ general: 'Erro ao conectar com o servidor' });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  const inp = (hasErr: boolean) =>
    `w-full px-4 py-3 border rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all ${hasErr ? 'bg-red-50 border-red-300' : 'bg-gray-50 border-gray-200'}`;

  const visibleModules = availableModules.filter(m =>
    !(superadminModules.includes(m.moduleKey) && currentUser?.role !== 'superadmin')
  );

  return createPortal(
    <div
      className="fixed inset-0 bg-gradient-to-br from-blue-900/50 to-indigo-900/50 backdrop-blur-sm flex items-center justify-center px-4 z-[10001]"
      onClick={(e) => { if (e.target === e.currentTarget && !isSubmitting) onClose(); }}
    >
      <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl">
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-500 to-indigo-600 px-6 py-4 flex items-center justify-between sticky top-0 z-10">
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <UserPlus className="w-6 h-6 text-white" />
            Cadastro Completo
          </h2>
          <button onClick={onClose} disabled={isSubmitting} className="text-white/80 hover:text-white hover:bg-white/20 p-2 rounded-lg transition-all duration-200">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {errors.general && <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-800">{errors.general}</div>}

          {/* Nome e Sobrenome */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Nome <span className="text-red-500">*</span></label>
              <input type="text" value={form.firstName} onChange={e => setField('firstName', e.target.value)}
                className={inp(!!errors.firstName)} placeholder="Nome" disabled={isSubmitting} />
              {errors.firstName && <p className="mt-1 text-xs text-red-600">{errors.firstName}</p>}
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Sobrenome <span className="text-red-500">*</span></label>
              <input type="text" value={form.lastName} onChange={e => setField('lastName', e.target.value)}
                className={inp(!!errors.lastName)} placeholder="Sobrenome" disabled={isSubmitting} />
              {errors.lastName && <p className="mt-1 text-xs text-red-600">{errors.lastName}</p>}
            </div>
          </div>

          {/* Username */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">Username <span className="text-red-500">*</span></label>
            <input type="text" value={form.username} onChange={e => setField('username', e.target.value)}
              className={inp(!!errors.username)} placeholder="username" disabled={isSubmitting} />
            {errors.username && <p className="mt-1 text-xs text-red-600">{errors.username}</p>}
          </div>

          {/* Email e Telefone */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">E-mail <span className="text-red-500">*</span></label>
              <input type="email" value={form.email} onChange={e => setField('email', e.target.value)}
                onBlur={() => { if (form.email) { const v = validateEmail(form.email); if (!v.isValid) setErrors(p => ({ ...p, email: v.error || 'Inválido' })); } }}
                className={inp(!!errors.email)} placeholder="email@exemplo.com" disabled={isSubmitting} />
              {errors.email && <p className="mt-1 text-xs text-red-600">{errors.email}</p>}
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Telefone <span className="text-red-500">*</span></label>
              <input type="text" value={form.phone} onChange={e => setField('phone', e.target.value)}
                onBlur={() => { if (form.phone) { const v = validatePhoneFormat(form.phone); if (!v.isValid) setErrors(p => ({ ...p, phone: v.error || 'Inválido' })); } }}
                className={inp(!!errors.phone)} placeholder="(00) 00000-0000" disabled={isSubmitting} />
              {errors.phone && <p className="mt-1 text-xs text-red-600">{errors.phone}</p>}
            </div>
          </div>

          {/* CPF e Data de Nascimento */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">CPF</label>
              <input type="text" value={form.cpf} onChange={e => setField('cpf', e.target.value)}
                onBlur={() => { if (form.cpf) { const v = validateCpfFormat(form.cpf); if (!v.isValid) setErrors(p => ({ ...p, cpf: v.error || 'Inválido' })); } }}
                className={inp(!!errors.cpf)} placeholder="000.000.000-00" maxLength={14} disabled={isSubmitting} />
              {errors.cpf && <p className="mt-1 text-xs text-red-600">{errors.cpf}</p>}
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Data de Nascimento <span className="text-red-500">*</span></label>
              <input type="date" value={form.birthDate} onChange={e => setField('birthDate', e.target.value)}
                className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50" disabled={isSubmitting} />
              {errors.birthDate && <p className="mt-1 text-xs text-red-600">{errors.birthDate}</p>}
            </div>
          </div>

          {/* Gênero e Cargo */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Gênero <span className="text-red-500">*</span></label>
              <select value={form.gender} onChange={e => setField('gender', e.target.value)}
                className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50" disabled={isSubmitting}>
                <option value="">Selecione...</option>
                <option value="masculino">Masculino</option>
                <option value="feminino">Feminino</option>
                <option value="nao-binario">Não-binário</option>
                <option value="outros">Outros</option>
                <option value="prefiro-nao-informar">Prefiro não informar</option>
              </select>
              {errors.gender && <p className="mt-1 text-xs text-red-600">{errors.gender}</p>}
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Cargo <span className="text-red-500">*</span></label>
              <input type="text" value={form.position} onChange={e => setField('position', e.target.value)}
                className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50"
                placeholder="Ex: Analista, Gestor..." disabled={isSubmitting} />
              {errors.position && <p className="mt-1 text-xs text-red-600">{errors.position}</p>}
            </div>
          </div>

          {/* CEP */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">CEP <span className="text-red-500">*</span></label>
            <div className="flex gap-2">
              <input type="text" value={form.address.cep} onChange={e => setField('address.cep', e.target.value)}
                onBlur={handleCepBlur}
                className={`flex-1 px-4 py-3 border rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all ${errors['address.cep'] ? 'bg-red-50 border-red-300' : 'bg-gray-50 border-gray-200'}`}
                placeholder="00000-000" maxLength={9} disabled={isSubmitting || isSearchingCep} />
              {isSearchingCep && <div className="flex items-center px-3"><div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600"></div></div>}
            </div>
            {errors['address.cep'] && <p className="mt-1 text-xs text-red-600">{errors['address.cep']}</p>}
          </div>

          {/* Rua e Número */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="sm:col-span-2">
              <label className="block text-sm font-semibold text-gray-700 mb-2">Rua/Logradouro <span className="text-red-500">*</span></label>
              <input type="text" value={form.address.street} onChange={e => setField('address.street', e.target.value)}
                className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50"
                placeholder="Rua, Avenida..." disabled={isSubmitting} />
              {errors['address.street'] && <p className="mt-1 text-xs text-red-600">{errors['address.street']}</p>}
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Número <span className="text-red-500">*</span></label>
              <input type="text" value={form.address.number} onChange={e => setField('address.number', e.target.value)}
                className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50"
                placeholder="123" disabled={isSubmitting} />
              {errors['address.number'] && <p className="mt-1 text-xs text-red-600">{errors['address.number']}</p>}
            </div>
          </div>

          {/* Complemento e Bairro */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Complemento</label>
              <input type="text" value={form.address.complement} onChange={e => setField('address.complement', e.target.value)}
                className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50"
                placeholder="Apto, Bloco..." disabled={isSubmitting} />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Bairro <span className="text-red-500">*</span></label>
              <input type="text" value={form.address.neighborhood} onChange={e => setField('address.neighborhood', e.target.value)}
                className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50"
                placeholder="Bairro" disabled={isSubmitting} />
              {errors['address.neighborhood'] && <p className="mt-1 text-xs text-red-600">{errors['address.neighborhood']}</p>}
            </div>
          </div>

          {/* Cidade e Estado */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Cidade <span className="text-red-500">*</span></label>
              <input type="text" value={form.address.city} onChange={e => setField('address.city', e.target.value)}
                className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50"
                placeholder="Cidade" disabled={isSubmitting} />
              {errors['address.city'] && <p className="mt-1 text-xs text-red-600">{errors['address.city']}</p>}
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Estado (UF) <span className="text-red-500">*</span></label>
              <input type="text" value={form.address.state} onChange={e => setField('address.state', e.target.value.toUpperCase())}
                className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50"
                placeholder="SP" maxLength={2} disabled={isSubmitting} />
              {errors['address.state'] && <p className="mt-1 text-xs text-red-600">{errors['address.state']}</p>}
            </div>
          </div>

          {/* Função e Status */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Função <span className="text-red-500">*</span></label>
              <select value={form.role}
                onChange={e => setForm(prev => ({ ...prev, role: e.target.value as RoleType, modules: getDefaultModules(e.target.value as RoleType) }))}
                className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50" disabled={isSubmitting}>
                {currentUser?.role === 'superadmin' && <option value="superadmin">Super Administrador</option>}
                <option value="admin">Administrador</option>
                <option value="user">Usuário</option>
                <option value="guest">Convidado</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Status</label>
              <select value={form.isActive ? 'active' : 'inactive'}
                onChange={e => setForm(prev => ({ ...prev, isActive: e.target.value === 'active' }))}
                className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50" disabled={isSubmitting}>
                <option value="active">Ativo</option>
                <option value="inactive">Inativo</option>
              </select>
            </div>
          </div>

          {/* Módulos */}
          {visibleModules.length > 0 && (
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Módulos de Acesso</label>
              <div className="grid grid-cols-2 gap-2 p-4 bg-gray-50 rounded-lg border border-gray-200">
                {visibleModules.map(m => (
                  <label key={m.moduleKey} className={`flex items-center gap-2 p-2 rounded-lg cursor-pointer transition-colors ${form.modules.includes(m.moduleKey) ? 'bg-blue-100 text-blue-900' : 'bg-white text-gray-700 hover:bg-gray-100'}`}>
                    <input type="checkbox" checked={form.modules.includes(m.moduleKey)}
                      onChange={() => setForm(prev => ({
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

          {/* Footer */}
          <div className="flex gap-3 justify-end pt-4 border-t">
            <button type="button" onClick={onClose} disabled={isSubmitting}
              className="px-6 py-3 border border-gray-300 rounded-xl text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50">
              Cancelar
            </button>
            <button type="submit" disabled={isSubmitting}
              className="px-6 py-3 bg-gradient-to-r from-blue-500 to-indigo-600 text-white rounded-xl hover:from-blue-600 hover:to-indigo-700 hover:-translate-y-0.5 active:translate-y-0 transition-all duration-200 shadow-lg shadow-blue-500/25 hover:shadow-xl disabled:opacity-50 disabled:transform-none flex items-center gap-2">
              {isSubmitting ? (
                <><div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>Criando...</>
              ) : (
                <><UserPlus className="w-4 h-4" />Criar Usuário</>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
};

export default CadastroCompletoModal;
