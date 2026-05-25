import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X, UserPlus } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { validateEmail } from '@/utils/validation';
import { applyPhoneMask, removePhoneMask, validatePhoneFormat } from '@/utils/phoneMask';
import { applyCpfMask, removeCpfMask, validateCpfFormat } from '@/utils/cpfMask';
import { applyCepMask, removeCepMask, validateCepFormat, fetchAddressByCep } from '@/utils/cepMask';

type RoleType = 'superadmin' | 'admin' | 'manager' | 'user' | 'guest';

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
  // Fase 2.2: chaves alinhadas com server/permissions/defaults.js. Este helper
  // é apenas pré-seleção visual no formulário de cadastro — o backend reaplica
  // os defaults reais ao receber a role. Vai sumir na sub-fase 2.3 quando o
  // form passar a usar a matriz granular via /api/admin/users/:id/permissions.
  const base = [
    'dashboard_financeiro', 'metas_financeiro', 'relatorios_financeiro', 'projecao', 'transactions', 'dre',
    'dashboard_gerenciamento', 'metas_gerenciamento', 'projecao_gerenciamento', 'relatorios_gerenciamento',
    'projects', 'services', 'clients',
    'faq', 'documentacao',
    'terracontrol',
  ];
  switch (role) {
    case 'superadmin': return [...base, 'admin', 'roadmap', 'sessions', 'anomalies', 'security_alerts'];
    case 'admin':      return [...base, 'admin', 'roadmap'];
    case 'manager':    return base;
    case 'user':       return base;
    case 'guest':      return base.filter((key) => key !== 'roadmap');
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

// FIX bug#3: cria uma cópia profunda do defaultForm para evitar mutação de referências compartilhadas
const getResetForm = () => ({
  ...defaultForm,
  address: { ...defaultForm.address },
  modules: [...defaultForm.modules],
});

const CadastroCompletoModal = ({
  isOpen, onClose, onSuccess, apiBaseUrl, authHeaders, availableModules, superadminModules
}: CadastroCompletoModalProps) => {
  const { user: currentUser } = useAuth();
  const [form, setForm] = useState(getResetForm);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSearchingCep, setIsSearchingCep] = useState(false);

  // Refs para evitar stale closures no handler de teclado e demais handlers
  const isSubmittingRef = useRef(isSubmitting);
  const onCloseRef = useRef(onClose);
  useEffect(() => { isSubmittingRef.current = isSubmitting; }, [isSubmitting]);
  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);

  useEffect(() => {
    if (!isOpen) return;
    // FIX bug#3: usa getResetForm() para garantir deep-copy no reset
    setForm(getResetForm());
    setErrors({});
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isSubmittingRef.current) onCloseRef.current();
    };
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

  // FIX bug#5: contador de chamadas para descartar resultados de requisições obsoletas de CEP
  // (fetchAddressByCep usa seu próprio AbortController interno, não aceita signal externo)
  const cepCallIdRef = useRef(0);

  const handleCepBlur = async () => {
    const raw = removeCepMask(form.address.cep);
    if (raw.length !== 8) return;

    // Incrementa o id desta chamada; se uma chamada mais nova chegar antes,
    // o resultado desta será descartado sem sobrescrever o estado.
    const callId = ++cepCallIdRef.current;

    setIsSearchingCep(true);
    try {
      const data = await fetchAddressByCep(form.address.cep);
      // Descarta resultado se uma chamada mais nova já foi disparada
      if (callId !== cepCallIdRef.current) return;
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
      if (callId !== cepCallIdRef.current) return;
      setErrors(prev => ({ ...prev, 'address.cep': 'Erro ao buscar endereço' }));
    } finally {
      // Só encerra o loading se esta for ainda a chamada mais recente
      if (callId === cepCallIdRef.current) setIsSearchingCep(false);
    }
  };

  const validate = () => {
    const e: Record<string, string> = {};
    if (!form.firstName.trim() || form.firstName.trim().length < 2) e.firstName = 'Mínimo 2 caracteres';
    if (!form.lastName.trim() || form.lastName.trim().length < 2) e.lastName = 'Mínimo 2 caracteres';
    if (!form.username.trim() || form.username.trim().length < 3) e.username = 'Mínimo 3 caracteres';
    else if (!/^[a-zA-Z0-9_-]+$/.test(form.username.trim())) e.username = 'Sem espaços ou acentos';
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
      // FIX bug#1: adiciona Content-Type: application/json para que o servidor parse o corpo corretamente
      const response = await fetch(`${apiBaseUrl}/users`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify(body)
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

  // Helper unificado para inputs e selects: aplica estilo de erro visual quando necessário
  const inp = (hasErr: boolean) =>
    `w-full px-4 py-3 border rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all dark:text-gray-100 ${hasErr ? 'bg-red-50 dark:bg-red-900/20 border-red-300 dark:border-red-700' : 'bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700'}`;
  // sel() usa a mesma lógica de inp() — mantido como alias para clareza semântica (selects vs inputs)
  const sel = inp;

  const visibleModules = availableModules.filter(m =>
    !(superadminModules.includes(m.moduleKey) && currentUser?.role !== 'superadmin')
  );

  return createPortal(
    // FIX bug#9: adiciona role="dialog", aria-modal e aria-labelledby ao overlay/modal
    <div
      className="fixed inset-0 bg-gradient-to-br from-blue-900/50 to-indigo-900/50 backdrop-blur-sm flex items-center justify-center px-4 z-[10001]"
      // FIX bug#4: usa onCloseRef para evitar stale closure no click do overlay
      onClick={(e) => { if (e.target === e.currentTarget && !isSubmittingRef.current) onCloseRef.current(); }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="cadastro-modal-title"
        className="bg-white dark:bg-gray-900 rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl"
      >
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-500 to-indigo-600 px-6 py-4 flex items-center justify-between sticky top-0 z-10">
          <h2 id="cadastro-modal-title" className="text-xl font-bold text-white flex items-center gap-2">
            <UserPlus className="w-6 h-6 text-white" aria-hidden="true" />
            Cadastro Completo
          </h2>
          {/* FIX bug#4: usa onCloseRef no botão fechar */}
          <button onClick={() => onCloseRef.current()} disabled={isSubmitting} aria-label="Fechar modal" className="text-white/80 hover:text-white hover:bg-white/20 p-2 rounded-lg transition-all duration-200">
            <X className="w-5 h-5" aria-hidden="true" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {errors.general && <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-sm text-red-800 dark:text-red-300">{errors.general}</div>}

          {/* Nome e Sobrenome */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              {/* FIX bug#7: htmlFor+id em todos os campos */}
              <label htmlFor="firstName" className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Nome <span className="text-red-500">*</span></label>
              <input id="firstName" type="text" value={form.firstName} onChange={e => setField('firstName', e.target.value)}
                className={inp(!!errors.firstName)} placeholder="Nome" disabled={isSubmitting} />
              {errors.firstName && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{errors.firstName}</p>}
            </div>
            <div>
              <label htmlFor="lastName" className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Sobrenome <span className="text-red-500">*</span></label>
              <input id="lastName" type="text" value={form.lastName} onChange={e => setField('lastName', e.target.value)}
                className={inp(!!errors.lastName)} placeholder="Sobrenome" disabled={isSubmitting} />
              {errors.lastName && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{errors.lastName}</p>}
            </div>
          </div>

          {/* Username */}
          <div>
            <label htmlFor="username" className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Username <span className="text-red-500">*</span></label>
            <input id="username" type="text" value={form.username} onChange={e => setField('username', e.target.value)}
              className={inp(!!errors.username)} placeholder="username" disabled={isSubmitting} />
            {errors.username && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{errors.username}</p>}
          </div>

          {/* Email e Telefone */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="email" className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">E-mail <span className="text-red-500">*</span></label>
              <input id="email" type="email" value={form.email} onChange={e => setField('email', e.target.value)}
                onBlur={() => { if (form.email) { const v = validateEmail(form.email); if (!v.isValid) setErrors(p => ({ ...p, email: v.error || 'Inválido' })); } }}
                className={inp(!!errors.email)} placeholder="email@exemplo.com" disabled={isSubmitting} />
              {errors.email && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{errors.email}</p>}
            </div>
            <div>
              <label htmlFor="phone" className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Telefone <span className="text-red-500">*</span></label>
              <input id="phone" type="text" value={form.phone} onChange={e => setField('phone', e.target.value)}
                onBlur={() => { if (form.phone) { const v = validatePhoneFormat(form.phone); if (!v.isValid) setErrors(p => ({ ...p, phone: v.error || 'Inválido' })); } }}
                className={inp(!!errors.phone)} placeholder="(00) 00000-0000" disabled={isSubmitting} />
              {errors.phone && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{errors.phone}</p>}
            </div>
          </div>

          {/* CPF e Data de Nascimento */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="cpf" className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">CPF</label>
              <input id="cpf" type="text" value={form.cpf} onChange={e => setField('cpf', e.target.value)}
                onBlur={() => { if (form.cpf) { const v = validateCpfFormat(form.cpf); if (!v.isValid) setErrors(p => ({ ...p, cpf: v.error || 'Inválido' })); } }}
                className={inp(!!errors.cpf)} placeholder="000.000.000-00" maxLength={14} disabled={isSubmitting} />
              {errors.cpf && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{errors.cpf}</p>}
            </div>
            <div>
              <label htmlFor="birthDate" className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Data de Nascimento <span className="text-red-500">*</span></label>
              {/* FIX bug#2: usa inp() para mostrar erro visual; FIX bug#8: adiciona min razoável */}
              <input id="birthDate" type="date" value={form.birthDate} onChange={e => setField('birthDate', e.target.value)}
                min="1900-01-01"
                max={new Date().toISOString().split('T')[0]}
                className={inp(!!errors.birthDate)} disabled={isSubmitting} />
              {errors.birthDate && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{errors.birthDate}</p>}
            </div>
          </div>

          {/* Gênero e Cargo */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="gender" className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Gênero <span className="text-red-500">*</span></label>
              {/* FIX bug#2: usa sel() para mostrar erro visual no select */}
              <select id="gender" value={form.gender} onChange={e => setField('gender', e.target.value)}
                className={sel(!!errors.gender)} disabled={isSubmitting}>
                <option value="">Selecione...</option>
                <option value="masculino">Masculino</option>
                <option value="feminino">Feminino</option>
                <option value="nao-binario">Não-binário</option>
                <option value="outros">Outros</option>
                <option value="prefiro-nao-informar">Prefiro não informar</option>
              </select>
              {errors.gender && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{errors.gender}</p>}
            </div>
            <div>
              <label htmlFor="position" className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Cargo <span className="text-red-500">*</span></label>
              {/* FIX bug#2: usa inp() para mostrar erro visual */}
              <input id="position" type="text" value={form.position} onChange={e => setField('position', e.target.value)}
                className={inp(!!errors.position)}
                placeholder="Ex: Analista, Gestor..." disabled={isSubmitting} />
              {errors.position && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{errors.position}</p>}
            </div>
          </div>

          {/* CEP */}
          <div>
            <label htmlFor="address-cep" className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">CEP <span className="text-red-500">*</span></label>
            <div className="flex gap-2">
              <input id="address-cep" type="text" value={form.address.cep} onChange={e => setField('address.cep', e.target.value)}
                onBlur={handleCepBlur}
                className={`flex-1 px-4 py-3 border rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all dark:text-gray-100 ${errors['address.cep'] ? 'bg-red-50 dark:bg-red-900/20 border-red-300 dark:border-red-700' : 'bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700'}`}
                placeholder="00000-000" maxLength={9} disabled={isSubmitting || isSearchingCep} />
              {/* FIX bug#10: texto visível "Buscando..." para usuários visuais */}
              {isSearchingCep && (
                <div className="flex items-center gap-1 px-3 text-sm text-gray-500 dark:text-gray-400" role="status" aria-label="Buscando endereço">
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600" aria-hidden="true"></div>
                  <span className="sr-only">Buscando...</span>
                </div>
              )}
            </div>
            {errors['address.cep'] && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{errors['address.cep']}</p>}
          </div>

          {/* Rua e Número */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="sm:col-span-2">
              <label htmlFor="address-street" className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Rua/Logradouro <span className="text-red-500">*</span></label>
              {/* FIX bug#2: usa inp() para mostrar erro visual */}
              <input id="address-street" type="text" value={form.address.street} onChange={e => setField('address.street', e.target.value)}
                className={inp(!!errors['address.street'])}
                placeholder="Rua, Avenida..." disabled={isSubmitting} />
              {errors['address.street'] && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{errors['address.street']}</p>}
            </div>
            <div>
              <label htmlFor="address-number" className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Número <span className="text-red-500">*</span></label>
              {/* FIX bug#2: usa inp() para mostrar erro visual */}
              <input id="address-number" type="text" value={form.address.number} onChange={e => setField('address.number', e.target.value)}
                className={inp(!!errors['address.number'])}
                placeholder="123" disabled={isSubmitting} />
              {errors['address.number'] && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{errors['address.number']}</p>}
            </div>
          </div>

          {/* Complemento e Bairro */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="address-complement" className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Complemento</label>
              <input id="address-complement" type="text" value={form.address.complement} onChange={e => setField('address.complement', e.target.value)}
                className="w-full px-4 py-3 border border-gray-200 dark:border-gray-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50 dark:bg-gray-800 dark:text-gray-100"
                placeholder="Apto, Bloco..." disabled={isSubmitting} />
            </div>
            <div>
              <label htmlFor="address-neighborhood" className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Bairro <span className="text-red-500">*</span></label>
              {/* FIX bug#2: usa inp() para mostrar erro visual */}
              <input id="address-neighborhood" type="text" value={form.address.neighborhood} onChange={e => setField('address.neighborhood', e.target.value)}
                className={inp(!!errors['address.neighborhood'])}
                placeholder="Bairro" disabled={isSubmitting} />
              {errors['address.neighborhood'] && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{errors['address.neighborhood']}</p>}
            </div>
          </div>

          {/* Cidade e Estado */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="address-city" className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Cidade <span className="text-red-500">*</span></label>
              {/* FIX bug#2: usa inp() para mostrar erro visual */}
              <input id="address-city" type="text" value={form.address.city} onChange={e => setField('address.city', e.target.value)}
                className={inp(!!errors['address.city'])}
                placeholder="Cidade" disabled={isSubmitting} />
              {errors['address.city'] && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{errors['address.city']}</p>}
            </div>
            <div>
              <label htmlFor="address-state" className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Estado (UF) <span className="text-red-500">*</span></label>
              {/* FIX bug#2: usa inp() para mostrar erro visual */}
              <input id="address-state" type="text" value={form.address.state} onChange={e => setField('address.state', e.target.value.toUpperCase())}
                className={inp(!!errors['address.state'])}
                placeholder="SP" maxLength={2} disabled={isSubmitting} />
              {errors['address.state'] && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{errors['address.state']}</p>}
            </div>
          </div>

          {/* Função e Status */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="role" className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Função <span className="text-red-500">*</span></label>
              <select id="role" value={form.role}
                onChange={e => setForm(prev => ({ ...prev, role: e.target.value as RoleType, modules: getDefaultModules(e.target.value as RoleType) }))}
                className={sel(false)} disabled={isSubmitting}>
                {currentUser?.role === 'superadmin' && <option value="superadmin">Super Administrador</option>}
                <option value="admin">Administrador</option>
                <option value="manager">Gerente</option>
                <option value="user">Usuário</option>
                <option value="guest">Convidado</option>
              </select>
            </div>
            <div>
              <label htmlFor="isActive" className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Status</label>
              <select id="isActive" value={form.isActive ? 'active' : 'inactive'}
                onChange={e => setForm(prev => ({ ...prev, isActive: e.target.value === 'active' }))}
                className={sel(false)} disabled={isSubmitting}>
                <option value="active">Ativo</option>
                <option value="inactive">Inativo</option>
              </select>
            </div>
          </div>

          {/* Módulos */}
          {visibleModules.length > 0 && (
            <div>
              <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Módulos de Acesso</label>
              <div className="grid grid-cols-2 gap-2 p-4 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
                {visibleModules.map(m => (
                  // FIX 2ª passada: cursor-pointer condicional — não mostrar cursor de interação quando desabilitado
                  <label key={m.moduleKey} className={`flex items-center gap-2 p-2 rounded-lg transition-colors ${isSubmitting ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'} ${form.modules.includes(m.moduleKey) ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-900 dark:text-blue-200' : 'bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-600'}`}>
                    {/* FIX bug#6: adiciona disabled={isSubmitting} nos checkboxes */}
                    <input type="checkbox" checked={form.modules.includes(m.moduleKey)}
                      onChange={() => setForm(prev => ({
                        ...prev,
                        modules: prev.modules.includes(m.moduleKey)
                          ? prev.modules.filter(k => k !== m.moduleKey)
                          : [...prev.modules, m.moduleKey]
                      }))}
                      disabled={isSubmitting}
                      className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500" />
                    <span className="text-sm font-medium">{m.moduleName}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* Footer */}
          <div className="flex gap-3 justify-end pt-4 border-t dark:border-gray-700">
            {/* FIX bug#4: usa onCloseRef no botão Cancelar */}
            <button type="button" onClick={() => onCloseRef.current()} disabled={isSubmitting}
              className="px-6 py-3 border border-gray-300 dark:border-gray-600 rounded-xl text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors disabled:opacity-50">
              Cancelar
            </button>
            <button type="submit" disabled={isSubmitting}
              className="px-6 py-3 bg-gradient-to-r from-blue-500 to-indigo-600 text-white rounded-xl hover:from-blue-600 hover:to-indigo-700 hover:-translate-y-0.5 active:translate-y-0 transition-all duration-200 shadow-lg shadow-blue-500/25 hover:shadow-xl disabled:opacity-50 disabled:transform-none flex items-center gap-2">
              {isSubmitting ? (
                <><div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" aria-hidden="true"></div>Criando...</>
              ) : (
                <><UserPlus className="w-4 h-4" aria-hidden="true" />Criar Usuário</>
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
