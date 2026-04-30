import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Key, Eye, EyeOff } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
const API_BASE_URL =
  typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
    ? 'http://localhost:9001/api'
    : ((import.meta as any).env?.VITE_API_URL || '/api');

interface AlterarSenhaModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const AlterarSenhaModal: React.FC<AlterarSenhaModalProps> = ({ isOpen, onClose }) => {
  const { token } = useAuth();
  const [senhaAtual, setSenhaAtual] = useState('');
  const [novaSenha, setNovaSenha] = useState('');
  const [confirmarSenha, setConfirmarSenha] = useState('');
  const [showSenhaAtual, setShowSenhaAtual] = useState(false);
  const [showNovaSenha, setShowNovaSenha] = useState(false);
  const [showConfirmarSenha, setShowConfirmarSenha] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<{
    senhaAtual?: string;
    novaSenha?: string;
    confirmarSenha?: string;
    general?: string;
  }>({});

  const validateForm = (): boolean => {
    const newErrors: typeof errors = {};

    if (!senhaAtual.trim()) {
      newErrors.senhaAtual = 'Senha atual é obrigatória';
    }

    if (!novaSenha.trim()) {
      newErrors.novaSenha = 'Nova senha é obrigatória';
    } else if (novaSenha.length < 6) {
      newErrors.novaSenha = 'A nova senha deve ter no mínimo 6 caracteres';
    }

    if (!confirmarSenha.trim()) {
      newErrors.confirmarSenha = 'Confirmação de senha é obrigatória';
    } else if (novaSenha !== confirmarSenha) {
      newErrors.confirmarSenha = 'As senhas não coincidem';
    }

    if (senhaAtual && novaSenha && senhaAtual === novaSenha) {
      newErrors.novaSenha = 'A nova senha deve ser diferente da senha atual';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) {
      return;
    }

    setLoading(true);

    try {
      const response = await fetch(`${API_BASE_URL}/user/password`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          senhaAtual: senhaAtual,
          novaSenha: novaSenha
        })
      });

      const result = await response.json();

      if (response.ok && result.success) {
        // Limpar formulário
        setSenhaAtual('');
        setNovaSenha('');
        setConfirmarSenha('');
        setErrors({});

        // Fechar modal
        onClose();

        // Mostrar mensagem de sucesso
        alert('Senha alterada com sucesso!');
      } else {
        setErrors({ general: result.error || 'Erro ao alterar senha' });
      }
    } catch (error) {
      console.error('Erro ao alterar senha:', error);
      setErrors({ general: 'Erro ao alterar senha. Tente novamente.' });
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  const modalContent = (
    <div
      className="fixed inset-0 bg-gradient-to-br from-blue-900/50 to-indigo-900/50 backdrop-blur-sm flex items-center justify-center z-[70] px-4 pb-4 pt-[180px]"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl border border-gray-200/50 dark:border-gray-700 max-h-[calc(100vh-220px)] overflow-y-auto">
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-500 to-indigo-600 -mx-6 -mt-6 mb-6 px-6 py-4 border-b border-white/20">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              <Key className="w-6 h-6 text-white" />
              Alterar Senha
            </h2>
            <button
              onClick={onClose}
              className="text-white/80 hover:text-white hover:bg-white/20 p-2 rounded-lg transition-all duration-200"
              disabled={loading}
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Formulário */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {errors.general && (
            <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-lg text-sm">
              {errors.general}
            </div>
          )}

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              Senha Atual <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <input
                type={showSenhaAtual ? 'text' : 'password'}
                value={senhaAtual}
                onChange={(e) => setSenhaAtual(e.target.value)}
                className={`w-full px-4 py-3 pr-12 border rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all dark:text-gray-100 dark:placeholder-gray-400 ${
                  errors.senhaAtual
                    ? 'bg-red-50 border-red-300 focus:ring-red-500'
                    : 'bg-gray-50 border-gray-200 dark:!bg-gray-700 dark:border-gray-600'
                }`}
                placeholder="Digite sua senha atual"
                disabled={loading}
              />
              <button
                type="button"
                onClick={() => setShowSenhaAtual(!showSenhaAtual)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700"
              >
                {showSenhaAtual ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
              </button>
            </div>
            {errors.senhaAtual && (
              <p className="mt-1 text-sm text-red-600">{errors.senhaAtual}</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              Nova Senha <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <input
                type={showNovaSenha ? 'text' : 'password'}
                value={novaSenha}
                onChange={(e) => {
                  setNovaSenha(e.target.value);
                  if (errors.novaSenha) {
                    setErrors(prev => ({ ...prev, novaSenha: undefined }));
                  }
                  if (errors.confirmarSenha && confirmarSenha) {
                    if (e.target.value !== confirmarSenha) {
                      setErrors(prev => ({ ...prev, confirmarSenha: 'As senhas não coincidem' }));
                    } else {
                      setErrors(prev => ({ ...prev, confirmarSenha: undefined }));
                    }
                  }
                }}
                className={`w-full px-4 py-3 pr-12 border rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all dark:text-gray-100 dark:placeholder-gray-400 ${
                  errors.novaSenha
                    ? 'bg-red-50 border-red-300 focus:ring-red-500'
                    : 'bg-gray-50 border-gray-200 dark:!bg-gray-700 dark:border-gray-600'
                }`}
                placeholder="Digite a nova senha (mínimo 6 caracteres)"
                disabled={loading}
              />
              <button
                type="button"
                onClick={() => setShowNovaSenha(!showNovaSenha)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700"
              >
                {showNovaSenha ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
              </button>
            </div>
            {errors.novaSenha && (
              <p className="mt-1 text-sm text-red-600">{errors.novaSenha}</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              Confirmar Nova Senha <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <input
                type={showConfirmarSenha ? 'text' : 'password'}
                value={confirmarSenha}
                onChange={(e) => {
                  setConfirmarSenha(e.target.value);
                  if (errors.confirmarSenha) {
                    if (e.target.value === novaSenha) {
                      setErrors(prev => ({ ...prev, confirmarSenha: undefined }));
                    } else {
                      setErrors(prev => ({ ...prev, confirmarSenha: 'As senhas não coincidem' }));
                    }
                  }
                }}
                onBlur={() => {
                  if (confirmarSenha && confirmarSenha !== novaSenha) {
                    setErrors(prev => ({ ...prev, confirmarSenha: 'As senhas não coincidem' }));
                  }
                }}
                className={`w-full px-4 py-3 pr-12 border rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all dark:text-gray-100 dark:placeholder-gray-400 ${
                  errors.confirmarSenha
                    ? 'bg-red-50 border-red-300 focus:ring-red-500'
                    : 'bg-gray-50 border-gray-200 dark:!bg-gray-700 dark:border-gray-600'
                }`}
                placeholder="Confirme a nova senha"
                disabled={loading}
              />
              <button
                type="button"
                onClick={() => setShowConfirmarSenha(!showConfirmarSenha)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700"
              >
                {showConfirmarSenha ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
              </button>
            </div>
            {errors.confirmarSenha && (
              <p className="mt-1 text-sm text-red-600">{errors.confirmarSenha}</p>
            )}
          </div>

          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-3 bg-gray-100 text-gray-700 rounded-xl hover:bg-gray-200 transition-colors font-medium"
              disabled={loading}
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="flex-1 px-4 py-3 bg-gradient-to-r from-blue-500 to-indigo-600 text-white rounded-xl hover:from-blue-600 hover:to-indigo-700 hover:-translate-y-0.5 active:translate-y-0 transition-all duration-200 font-medium shadow-lg shadow-blue-500/25 hover:shadow-xl hover:shadow-blue-500/35 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
              disabled={loading}
            >
              {loading ? 'Salvando...' : 'Salvar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );

  return typeof document !== 'undefined' ? createPortal(modalContent, document.body) : null;
};

export default AlterarSenhaModal;
