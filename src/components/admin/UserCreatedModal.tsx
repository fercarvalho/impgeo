import { useEffect, useState } from 'react';
import { CheckCircle, User, Key, Copy, Check, UserPlus, Mail } from 'lucide-react';

interface UserCreatedModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreateAnother: () => void;
  userData: {
    username: string;
    email?: string;
    role: string;
    tempPassword?: string;
  };
}

const getRoleLabel = (role: string) => {
  switch (role) {
    case 'superadmin': return 'Super Administrador';
    case 'admin': return 'Administrador';
    case 'user': return 'Usuário';
    case 'guest': return 'Convidado';
    default: return role;
  }
};

const UserCreatedModal: React.FC<UserCreatedModalProps> = ({ isOpen, onClose, onCreateAnother, userData }) => {
  const [copiedField, setCopiedField] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const copyToClipboard = (text: string, field: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
  };

  const isTemp = userData.email?.includes('@temp.local');

  return (
    <div
      className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center px-4 z-[10001]"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl">
        {/* Header sucesso */}
        <div className="bg-gradient-to-r from-green-500 to-emerald-600 px-6 py-8 text-center rounded-t-2xl">
          <div className="flex justify-center mb-4">
            <div className="w-20 h-20 bg-white rounded-full flex items-center justify-center animate-bounce">
              <CheckCircle className="w-12 h-12 text-green-500" />
            </div>
          </div>
          <h2 className="text-2xl font-bold text-white mb-2">Usuário Criado com Sucesso!</h2>
          <p className="text-green-100">As credenciais foram geradas automaticamente</p>
        </div>

        <div className="p-6 space-y-4">
          {/* Informações do usuário */}
          <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
            <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
              <User className="w-4 h-4" />
              Informações do Usuário
            </h3>
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">Nome de usuário:</span>
                <span className="text-sm font-semibold text-gray-900">{userData.username}</span>
              </div>
              {userData.email && !isTemp && (
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600">E-mail:</span>
                  <span className="text-sm font-semibold text-gray-900">{userData.email}</span>
                </div>
              )}
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">Função:</span>
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                  {getRoleLabel(userData.role)}
                </span>
              </div>
            </div>
          </div>

          {/* Credenciais */}
          {userData.tempPassword && (
            <div className="bg-blue-50 rounded-lg p-4 border-2 border-blue-200">
              <h3 className="text-sm font-semibold text-blue-900 mb-3 flex items-center gap-2">
                <Key className="w-4 h-4" />
                Credenciais de Acesso
              </h3>
              <div>
                <label className="block text-xs font-medium text-blue-800 mb-1">Senha Temporária</label>
                <div className="flex items-center gap-2">
                  <code className="flex-1 px-3 py-2 bg-white border border-blue-300 rounded text-sm font-mono text-blue-900">
                    {userData.tempPassword}
                  </code>
                  <button
                    onClick={() => copyToClipboard(userData.tempPassword!, 'password')}
                    className="p-2 text-blue-600 hover:text-blue-700 hover:bg-blue-100 rounded transition-colors"
                    title="Copiar senha"
                  >
                    {copiedField === 'password' ? <Check className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              <p className="mt-3 text-xs text-blue-800">
                ⚠️ Guarde essa senha em local seguro. O usuário precisará dela para o primeiro acesso.
              </p>
            </div>
          )}

          {/* E-mail enviado */}
          {userData.email && !isTemp && (
            <div className="bg-green-50 rounded-lg p-4 border border-green-200 flex items-start gap-3">
              <Mail className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-green-900 mb-1">E-mail de Convite Enviado</p>
                <p className="text-xs text-green-800">
                  Um e-mail foi enviado para <span className="font-semibold">{userData.email}</span> com as instruções de acesso.
                </p>
              </div>
            </div>
          )}

          {/* E-mail temporário */}
          {isTemp && (
            <div className="bg-yellow-50 rounded-lg p-4 border border-yellow-200 flex items-start gap-3">
              <div className="flex-shrink-0 w-8 h-8 bg-yellow-500 rounded-full flex items-center justify-center text-white text-sm font-bold">!</div>
              <div>
                <p className="text-sm font-semibold text-yellow-900 mb-1">Cadastro Simplificado</p>
                <p className="text-xs text-yellow-800">
                  Edite o usuário para adicionar um e-mail válido e enviar o convite.
                </p>
              </div>
            </div>
          )}

          {/* Próximos passos */}
          <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
            <h3 className="text-sm font-semibold text-gray-900 mb-3">📋 Próximos Passos</h3>
            <ol className="space-y-2 text-xs text-gray-700">
              {[
                'Compartilhe as credenciais com o usuário de forma segura',
                'No primeiro acesso, uma nova senha será gerada automaticamente',
                'O usuário deve alterar a senha nas configurações do perfil'
              ].map((step, i) => (
                <li key={i} className="flex items-start gap-2">
                  <span className="flex-shrink-0 w-5 h-5 bg-blue-500 text-white rounded-full flex items-center justify-center text-xs font-bold">{i + 1}</span>
                  <span>{step}</span>
                </li>
              ))}
            </ol>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t bg-gray-50 rounded-b-2xl flex flex-col sm:flex-row justify-between gap-3">
          <button
            onClick={onCreateAnother}
            className="flex items-center justify-center gap-2 px-4 py-2 text-blue-700 border-2 border-blue-500 rounded-lg hover:bg-blue-50 font-medium transition-colors"
          >
            <UserPlus className="w-4 h-4" />
            Criar Outro Usuário
          </button>
          <button
            onClick={onClose}
            className="flex items-center justify-center gap-2 px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium transition-colors"
          >
            <Check className="w-4 h-4" />
            Concluir
          </button>
        </div>
      </div>
    </div>
  );
};

export default UserCreatedModal;
