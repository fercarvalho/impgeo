import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, Edit, Eye, EyeOff } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
const API_BASE_URL =
  typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
    ? 'http://localhost:9001/api'
    : ((import.meta as any).env?.VITE_API_URL || '/api');

interface AlterarUsernameModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUsername: string;
}

const AlterarUsernameModal: React.FC<AlterarUsernameModalProps> = ({
  isOpen,
  onClose,
  currentUsername
}) => {
  const { token, user, updateUser } = useAuth();
  const [newUsername, setNewUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [errors, setErrors] = useState<{
    username?: string;
    password?: string;
    general?: string;
  }>({});

  // [Bug 2] Ref para guardar o timer de fechamento automático
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // [Bug 3] Ref para AbortController do fetch em andamento
  const abortControllerRef = useRef<AbortController | null>(null);
  // [Bug 8] Ref para focar o primeiro campo ao abrir o modal
  const newUsernameInputRef = useRef<HTMLInputElement>(null);

  // [Bug 8] Focar o campo "Novo Username" quando o modal abrir
  useEffect(() => {
    if (isOpen) {
      const t = setTimeout(() => {
        newUsernameInputRef.current?.focus();
      }, 50);
      return () => clearTimeout(t);
    }
  }, [isOpen]);

  // [Bug 2 + Bug 3] Cleanup ao desmontar: cancelar timer e abortar fetch pendente
  useEffect(() => {
    return () => {
      if (closeTimerRef.current !== null) {
        clearTimeout(closeTimerRef.current);
      }
      abortControllerRef.current?.abort();
    };
  }, []);

  // [Bug 1] Reset completo do formulário
  const resetForm = () => {
    setNewUsername('');
    setPassword('');
    setShowPassword(false);
    setErrors({});
    setSuccessMessage('');
    if (closeTimerRef.current !== null) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
    // Abortar requisição em andamento ao fechar manualmente o modal
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  const validateUsername = (username: string): string | undefined => {
    if (!username.trim()) {
      return 'Username é obrigatório';
    }
    if (username.trim().length < 3) {
      return 'Username deve ter pelo menos 3 caracteres';
    }
    const usernameRegex = /^[a-zA-Z0-9_-]+$/;
    if (!usernameRegex.test(username.trim())) {
      return 'Username não pode conter espaços ou acentos. Use apenas letras, números, underscore (_) ou hífen (-)';
    }
    if (username.trim() === currentUsername.trim()) {
      return 'O novo username deve ser diferente do atual';
    }
    return undefined;
  };

  const handleUsernameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setNewUsername(value);
    if (errors.username) {
      const error = validateUsername(value);
      setErrors(prev => ({ ...prev, username: error }));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});

    // Validar username
    const usernameError = validateUsername(newUsername);
    if (usernameError) {
      setErrors({ username: usernameError });
      return;
    }

    // Validar senha
    if (!password.trim()) {
      setErrors({ password: 'Senha atual é obrigatória' });
      return;
    }

    if (!user) {
      setErrors({ general: 'Sessão expirada. Faça login novamente.' });
      return;
    }

    // [Bug 3] Cancelar requisição anterior se ainda estiver em andamento
    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;

    setLoading(true);
    setSuccessMessage('');

    try {
      const response = await fetch(`${API_BASE_URL}/user/profile`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          username: newUsername.trim(),
          password: password
        }),
        signal: controller.signal
      });

      let result: { success?: boolean; error?: string; data?: { username?: string }; token?: string } = {};
      try {
        result = await response.json();
      } catch {
        // body não é JSON (ex: 502/504 sem body)
      }

      if (response.ok && result.success) {
        // [Bug 4] Usar fallback seguro caso o servidor não retorne o novo username
        updateUser(
          {
            username: result.data?.username ?? currentUsername
          },
          result.token
        );

        // Limpar formulário
        setNewUsername('');
        setPassword('');
        setErrors({});
        setSuccessMessage('Username alterado com sucesso!');

        // [Bug 2] Fechar modal após breve delay — guardar timer para poder cancelá-lo
        closeTimerRef.current = setTimeout(() => {
          closeTimerRef.current = null;
          setSuccessMessage('');
          onClose();
        }, 1500);
      } else {
        setErrors({ general: result.error || 'Erro ao alterar username' });
      }
    } catch (error: unknown) {
      // [Bug 3] Ignorar erro de abort (requisição cancelada intencionalmente)
      if (error instanceof Error && error.name === 'AbortError') return;
      console.error('Erro ao alterar username:', error);
      setErrors({ general: 'Erro ao alterar username. Tente novamente.' });
    } finally {
      // Só limpar loading se a requisição não foi abortada
      if (!controller.signal.aborted) {
        setLoading(false);
      }
    }
  };

  if (!isOpen) return null;

  const modalContent = (
    // [Bug 5] Adicionar role="dialog", aria-modal e aria-labelledby
    <div
      className="fixed inset-0 bg-gradient-to-br from-blue-900/50 to-indigo-900/50 backdrop-blur-sm flex items-center justify-center z-50 px-4 py-8"
      role="dialog"
      aria-modal="true"
      aria-labelledby="alterar-username-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          handleClose();
        }
      }}
    >
      <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 w-full max-w-md max-h-[calc(100vh-4rem)] overflow-y-auto shadow-2xl border border-gray-200/50 dark:border-gray-700">
        {/* Header — [Bug 7] rounded-t-2xl para herdar o border-radius do card */}
        <div className="bg-gradient-to-r from-blue-500 to-indigo-600 -mx-6 -mt-6 mb-6 px-6 py-4 rounded-t-2xl border-b border-white/20">
          <div className="flex items-center justify-between">
            {/* [Bug 5] id para aria-labelledby */}
            <h2 id="alterar-username-title" className="text-xl font-bold text-white flex items-center gap-2">
              <Edit className="w-6 h-6 text-white" aria-hidden="true" />
              Alterar Username
            </h2>
            <button
              onClick={handleClose}
              className="text-white/80 hover:text-white hover:bg-white/20 p-2 rounded-lg transition-all duration-200"
              disabled={loading}
              aria-label="Fechar modal"
            >
              <X className="w-5 h-5" aria-hidden="true" />
            </button>
          </div>
        </div>

        {/* Formulário */}
        <form onSubmit={handleSubmit} className="space-y-4">
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
            <label htmlFor="currentUsername" className="block text-sm font-semibold text-gray-700 dark:text-gray-200 mb-2">
              Username Atual
            </label>
            {/* [Bug 6] dark:bg-gray-700/50 em vez de dark:!bg-gray-800 para criar contraste com o fundo do modal */}
            <input
              id="currentUsername"
              type="text"
              value={currentUsername}
              disabled
              className="w-full px-4 py-3 bg-gray-100 dark:bg-gray-700/50 border border-gray-200 dark:border-gray-700 rounded-xl text-gray-600 dark:text-gray-400 cursor-not-allowed"
            />
          </div>

          <div>
            <label htmlFor="newUsername" className="block text-sm font-semibold text-gray-700 dark:text-gray-200 mb-2">
              Novo Username <span className="text-red-500">*</span>
            </label>
            {/* [Bug 8] ref para focar automaticamente ao abrir */}
            <input
              ref={newUsernameInputRef}
              id="newUsername"
              type="text"
              value={newUsername}
              onChange={handleUsernameChange}
              onBlur={() => {
                const error = validateUsername(newUsername);
                setErrors(prev => ({ ...prev, username: error }));
              }}
              className={`w-full px-4 py-3 border rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all dark:text-gray-100 dark:placeholder-gray-400 ${
                errors.username
                  ? 'bg-red-50 border-red-300 focus:ring-red-500 dark:bg-red-900/20 dark:border-red-700'
                  : 'bg-gray-50 border-gray-200 dark:!bg-gray-700 dark:border-gray-600'
              }`}
              placeholder="Digite o novo username"
              disabled={loading}
              autoComplete="username"
            />
            {errors.username && (
              <p className="mt-1 text-sm text-red-600 dark:text-red-400" role="alert">{errors.username}</p>
            )}
          </div>

          <div>
            <label htmlFor="passwordUsername" className="block text-sm font-semibold text-gray-700 dark:text-gray-200 mb-2">
              Senha Atual <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <input
                id="passwordUsername"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={`w-full px-4 py-3 pr-12 border rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all dark:text-gray-100 dark:placeholder-gray-400 ${
                  errors.password
                    ? 'bg-red-50 border-red-300 focus:ring-red-500 dark:bg-red-900/20 dark:border-red-700'
                    : 'bg-gray-50 border-gray-200 dark:!bg-gray-700 dark:border-gray-600'
                }`}
                placeholder="Digite sua senha atual"
                disabled={loading}
                autoComplete="current-password"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                disabled={loading}
                aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
              >
                {showPassword ? <EyeOff className="w-5 h-5" aria-hidden="true" /> : <Eye className="w-5 h-5" aria-hidden="true" />}
              </button>
            </div>
            {errors.password && (
              <p className="mt-1 text-sm text-red-600 dark:text-red-400" role="alert">{errors.password}</p>
            )}
          </div>

          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={handleClose}
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

export default AlterarUsernameModal;
