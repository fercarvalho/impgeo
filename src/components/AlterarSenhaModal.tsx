import React, { useState, useEffect, useRef } from 'react';
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
  const { token, user } = useAuth();
  const [senhaAtual, setSenhaAtual] = useState('');
  const [novaSenha, setNovaSenha] = useState('');
  const [confirmarSenha, setConfirmarSenha] = useState('');
  const [showSenhaAtual, setShowSenhaAtual] = useState(false);
  const [showNovaSenha, setShowNovaSenha] = useState(false);
  const [showConfirmarSenha, setShowConfirmarSenha] = useState(false);
  const [loading, setLoading] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [errors, setErrors] = useState<{
    senhaAtual?: string;
    novaSenha?: string;
    confirmarSenha?: string;
    general?: string;
  }>({});
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Bug 1: Cleanup do setTimeout ao desmontar para evitar memory leak
  useEffect(() => {
    return () => {
      if (closeTimerRef.current !== null) {
        clearTimeout(closeTimerRef.current);
      }
    };
  }, []);

  // Bug 2: Resetar estado quando o modal fecha
  useEffect(() => {
    if (!isOpen) {
      setSenhaAtual('');
      setNovaSenha('');
      setConfirmarSenha('');
      setShowSenhaAtual(false);
      setShowNovaSenha(false);
      setShowConfirmarSenha(false);
      setLoading(false);
      setSuccessMessage('');
      setErrors({});
      if (closeTimerRef.current !== null) {
        clearTimeout(closeTimerRef.current);
        closeTimerRef.current = null;
      }
    }
  }, [isOpen]);

  const validateForm = (): boolean => {
    const newErrors: typeof errors = {};

    if (!senhaAtual.trim()) {
      newErrors.senhaAtual = 'Senha atual é obrigatória';
    }

    if (!novaSenha.trim()) {
      newErrors.novaSenha = 'Nova senha é obrigatória';
    } else if (novaSenha.length < 6) {
      newErrors.novaSenha = 'A nova senha deve ter no mínimo 6 caracteres';
    } else if (senhaAtual && senhaAtual === novaSenha) {
      // Verificação "deve ser diferente" apenas quando comprimento já é válido
      newErrors.novaSenha = 'A nova senha deve ser diferente da senha atual';
    }

    if (!confirmarSenha.trim()) {
      newErrors.confirmarSenha = 'Confirmação de senha é obrigatória';
    } else if (novaSenha !== confirmarSenha) {
      newErrors.confirmarSenha = 'As senhas não coincidem';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) {
      return;
    }

    if (!user) {
      setErrors({ general: 'Sessão expirada. Faça login novamente.' });
      return;
    }

    setLoading(true);
    setSuccessMessage('');

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

      let result: { success?: boolean; error?: string } = {};
      try {
        result = await response.json();
      } catch {
        // body não é JSON (ex: 502/504 sem body)
      }

      if (response.ok && result.success) {
        // Limpar formulário
        setSenhaAtual('');
        setNovaSenha('');
        setConfirmarSenha('');
        setErrors({});
        setSuccessMessage('Senha alterada com sucesso!');

        // Fechar modal após breve delay para o usuário ver a mensagem
        closeTimerRef.current = setTimeout(() => {
          closeTimerRef.current = null;
          setSuccessMessage('');
          onClose();
        }, 1500);
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
      className="fixed inset-0 bg-gradient-to-br from-blue-900/50 to-indigo-900/50 backdrop-blur-sm flex items-center justify-center z-[70] px-4 py-8"
      onClick={(e) => {
        if (e.target === e.currentTarget && !loading) {
          onClose();
        }
      }}
    >
      <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 w-full max-w-md shadow-2xl border border-gray-200/50 dark:border-gray-700 max-h-[calc(100vh-4rem)] overflow-y-auto">
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-500 to-indigo-600 -mx-6 -mt-6 mb-6 px-6 py-4 rounded-t-2xl border-b border-white/20">
          <div className="flex items-center justify-between">
            <h2 id="alterar-senha-titulo" className="text-xl font-bold text-white flex items-center gap-2">
              <Key className="w-6 h-6 text-white" aria-hidden="true" />
              Alterar Senha
            </h2>
            <button
              onClick={onClose}
              className="text-white/80 hover:text-white hover:bg-white/20 p-2 rounded-lg transition-all duration-200"
              disabled={loading}
              aria-label="Fechar modal"
            >
              <X className="w-5 h-5" aria-hidden="true" />
            </button>
          </div>
        </div>

        {/* Formulário */}
        <form onSubmit={handleSubmit} className="space-y-4" aria-labelledby="alterar-senha-titulo">
          {errors.general && (
            <div
              className="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-700 text-red-800 dark:text-red-300 px-4 py-3 rounded-lg text-sm"
              role="alert"
            >
              {errors.general}
            </div>
          )}

          {successMessage && (
            <div
              className="bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-700 text-green-800 dark:text-green-300 px-4 py-3 rounded-lg text-sm"
              role="status"
            >
              {successMessage}
            </div>
          )}

          <div>
            <label htmlFor="senhaAtual" className="block text-sm font-semibold text-gray-700 dark:text-gray-200 mb-2">
              Senha Atual <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <input
                id="senhaAtual"
                type={showSenhaAtual ? 'text' : 'password'}
                value={senhaAtual}
                onChange={(e) => setSenhaAtual(e.target.value)}
                className={`w-full px-4 py-3 pr-12 border rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all dark:text-gray-100 dark:placeholder-gray-400 ${
                  errors.senhaAtual
                    ? 'bg-red-50 border-red-300 focus:ring-red-500 dark:bg-red-900/20 dark:border-red-700'
                    : 'bg-gray-50 border-gray-200 dark:bg-gray-700 dark:border-gray-600'
                }`}
                placeholder="Digite sua senha atual"
                disabled={loading}
                autoComplete="current-password"
              />
              <button
                type="button"
                onClick={() => setShowSenhaAtual(!showSenhaAtual)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                disabled={loading}
                aria-label={showSenhaAtual ? 'Ocultar senha atual' : 'Mostrar senha atual'}
              >
                {showSenhaAtual ? <EyeOff className="w-5 h-5" aria-hidden="true" /> : <Eye className="w-5 h-5" aria-hidden="true" />}
              </button>
            </div>
            {errors.senhaAtual && (
              <p className="mt-1 text-sm text-red-600 dark:text-red-400" role="alert">{errors.senhaAtual}</p>
            )}
          </div>

          <div>
            <label htmlFor="novaSenha" className="block text-sm font-semibold text-gray-700 dark:text-gray-200 mb-2">
              Nova Senha <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <input
                id="novaSenha"
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
                    ? 'bg-red-50 border-red-300 focus:ring-red-500 dark:bg-red-900/20 dark:border-red-700'
                    : 'bg-gray-50 border-gray-200 dark:bg-gray-700 dark:border-gray-600'
                }`}
                placeholder="Digite a nova senha (mínimo 6 caracteres)"
                disabled={loading}
                autoComplete="new-password"
              />
              <button
                type="button"
                onClick={() => setShowNovaSenha(!showNovaSenha)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                disabled={loading}
                aria-label={showNovaSenha ? 'Ocultar nova senha' : 'Mostrar nova senha'}
              >
                {showNovaSenha ? <EyeOff className="w-5 h-5" aria-hidden="true" /> : <Eye className="w-5 h-5" aria-hidden="true" />}
              </button>
            </div>
            {errors.novaSenha && (
              <p className="mt-1 text-sm text-red-600 dark:text-red-400" role="alert">{errors.novaSenha}</p>
            )}
          </div>

          <div>
            <label htmlFor="confirmarSenha" className="block text-sm font-semibold text-gray-700 dark:text-gray-200 mb-2">
              Confirmar Nova Senha <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <input
                id="confirmarSenha"
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
                    ? 'bg-red-50 border-red-300 focus:ring-red-500 dark:bg-red-900/20 dark:border-red-700'
                    : 'bg-gray-50 border-gray-200 dark:bg-gray-700 dark:border-gray-600'
                }`}
                placeholder="Confirme a nova senha"
                disabled={loading}
                autoComplete="new-password"
              />
              <button
                type="button"
                onClick={() => setShowConfirmarSenha(!showConfirmarSenha)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                disabled={loading}
                aria-label={showConfirmarSenha ? 'Ocultar confirmação de senha' : 'Mostrar confirmação de senha'}
              >
                {showConfirmarSenha ? <EyeOff className="w-5 h-5" aria-hidden="true" /> : <Eye className="w-5 h-5" aria-hidden="true" />}
              </button>
            </div>
            {errors.confirmarSenha && (
              <p className="mt-1 text-sm text-red-600 dark:text-red-400" role="alert">{errors.confirmarSenha}</p>
            )}
          </div>

          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-3 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 rounded-xl hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors font-medium"
              disabled={loading}
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="flex-1 px-4 py-3 bg-gradient-to-r from-blue-500 to-indigo-600 text-white rounded-xl hover:from-blue-600 hover:to-indigo-700 hover:-translate-y-0.5 active:translate-y-0 transition-all duration-200 font-medium shadow-lg shadow-blue-500/25 hover:shadow-xl hover:shadow-blue-500/35 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
              disabled={loading}
              aria-busy={loading}
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
