import { useEffect } from 'react';
import { UserPlus, FileText, Zap, X } from 'lucide-react';

interface UserCreationTypeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectSimple: () => void;
  onSelectComplete: () => void;
}

const UserCreationTypeModal: React.FC<UserCreationTypeModalProps> = ({
  isOpen, onClose, onSelectSimple, onSelectComplete
}) => {
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 bg-gradient-to-br from-blue-900/50 to-indigo-900/50 backdrop-blur-sm flex items-center justify-center px-4 z-[10001]"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white rounded-2xl p-6 w-full max-w-2xl shadow-2xl">
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-500 to-indigo-600 -mx-6 -mt-6 mb-6 px-6 py-4 rounded-t-2xl flex items-center justify-between">
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <UserPlus className="w-6 h-6 text-white" />
            Criar Novo Usuário
          </h2>
          <button onClick={onClose} className="text-white/70 hover:text-white hover:bg-white/15 p-2 rounded-full transition-all">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Options */}
        <div className="grid md:grid-cols-2 gap-4">
          {/* Simplificado */}
          <button
            onClick={onSelectSimple}
            className="group relative overflow-hidden rounded-xl border-2 border-gray-200 p-6 text-left transition-all hover:border-blue-500 hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <div className="flex flex-col h-full">
              <div className="flex items-start justify-between mb-4">
                <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center group-hover:bg-blue-500 transition-colors">
                  <Zap className="w-6 h-6 text-blue-600 group-hover:text-white transition-colors" />
                </div>
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                  Rápido
                </span>
              </div>
              <h3 className="text-lg font-bold text-gray-900 mb-2">Cadastro Simplificado</h3>
              <p className="text-sm text-gray-600 mb-4 flex-grow">
                Crie rapidamente um usuário com informações básicas. Ideal para acesso imediato ao sistema.
              </p>
              <div className="space-y-2 mb-4">
                <p className="text-xs font-semibold text-gray-700">Campos obrigatórios:</p>
                <ul className="text-xs text-gray-600 space-y-1">
                  {['Nome de usuário', 'Função (admin, user, guest)', 'Status (ativo/inativo)', 'Módulos de acesso'].map(f => (
                    <li key={f} className="flex items-center gap-2">
                      <span className="w-1.5 h-1.5 bg-blue-500 rounded-full"></span>
                      {f}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="pt-4 border-t">
                <p className="text-xs text-gray-500">⏱️ Tempo estimado: <span className="font-semibold text-gray-700">~1 minuto</span></p>
              </div>
            </div>
          </button>

          {/* Completo */}
          <button
            onClick={onSelectComplete}
            className="group relative overflow-hidden rounded-xl border-2 border-gray-200 p-6 text-left transition-all hover:border-blue-500 hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <div className="flex flex-col h-full">
              <div className="flex items-start justify-between mb-4">
                <div className="w-12 h-12 bg-indigo-100 rounded-lg flex items-center justify-center group-hover:bg-blue-500 transition-colors">
                  <FileText className="w-6 h-6 text-indigo-600 group-hover:text-white transition-colors" />
                </div>
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                  Completo
                </span>
              </div>
              <h3 className="text-lg font-bold text-gray-900 mb-2">Cadastro Completo</h3>
              <p className="text-sm text-gray-600 mb-4 flex-grow">
                Cadastre todas as informações do usuário incluindo dados pessoais, contato e endereço.
              </p>
              <div className="space-y-2 mb-4">
                <p className="text-xs font-semibold text-gray-700">Campos adicionais:</p>
                <ul className="text-xs text-gray-600 space-y-1">
                  {['Nome completo', 'E-mail, telefone, CPF', 'Data de nascimento, gênero', 'Cargo e endereço completo'].map(f => (
                    <li key={f} className="flex items-center gap-2">
                      <span className="w-1.5 h-1.5 bg-indigo-500 rounded-full"></span>
                      {f}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="pt-4 border-t">
                <p className="text-xs text-gray-500">⏱️ Tempo estimado: <span className="font-semibold text-gray-700">~3-5 minutos</span></p>
              </div>
            </div>
          </button>
        </div>

        {/* Dica */}
        <div className="mt-6 p-4 bg-blue-50 rounded-lg border border-blue-200 flex items-start gap-3">
          <div className="flex-shrink-0 w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center">
            <span className="text-white text-sm font-bold">💡</span>
          </div>
          <div>
            <p className="text-sm font-semibold text-blue-900 mb-1">Dica</p>
            <p className="text-xs text-blue-800">
              Você pode começar com o cadastro simplificado e depois editar o usuário para adicionar mais informações.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default UserCreationTypeModal;
