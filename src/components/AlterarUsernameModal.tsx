import React, { useState } from 'react';
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
  const { token, updateUser } = useAuth();
  const [newUsername, setNewUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<{
    username?: string;
    password?: string;
    general?: string;
  }>({});

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
    if (username.trim() === currentUsername) {
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

    setLoading(true);

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
        })
      });

      const result = await response.json();

      if (response.ok && result.success) {
        // Atualizar contexto com novos dados
        updateUser(
          {
            username: result.data.username
          },
          result.token
        );

        // Limpar formulário
        setNewUsername('');
        setPassword('');
        setErrors({});

        // Fechar modal
        onClose();

        // Mostrar mensagem de sucesso
        alert('Username alterado com sucesso!');
      } else {
        setErrors({ general: result.error || 'Erro ao alterar username' });
      }
    } catch (error) {
      console.error('Erro ao alterar username:', error);
      setErrors({ general: 'Erro ao alterar username. Tente novamente.' });
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  const modalContent = (
    <div
      className="fixed inset-0 bg-gradient-to-br from-amber-900/50 to-orange-900/50 backdrop-blur-sm flex items-center justify-center z-50 px-4 pb-4 pt-[180px]"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div className="bg-gradient-to-br from-white to-gray-50 dark:from-gray-800 dark:to-gray-900 rounded-2xl p-6 w-full max-w-md max-h-[calc(100vh-220px)] overflow-y-auto shadow-2xl border border-gray-200/50 dark:border-gray-700">
        {/* Header */}
        <div className="bg-gradient-to-r from-amber-50 to-orange-50 dark:from-gray-900/80 dark:to-gray-900/80 -mx-6 -mt-6 mb-6 px-6 py-4 border-b border-amber-200/50 dark:border-gray-700">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold text-amber-800 flex items-center gap-2">
              <Edit className="w-6 h-6 text-amber-700" />
              Alterar Username
            </h2>
            <button
              onClick={onClose}
              className="text-amber-600 hover:text-amber-800 hover:bg-amber-100 p-2 rounded-full transition-all"
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
              Username Atual
            </label>
            <input
              type="text"
              value={currentUsername}
              disabled
              className="w-full px-4 py-3 bg-gray-100 dark:!bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-gray-600 dark:text-gray-400 cursor-not-allowed"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              Novo Username <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={newUsername}
              onChange={handleUsernameChange}
              onBlur={() => {
                const error = validateUsername(newUsername);
                setErrors(prev => ({ ...prev, username: error }));
              }}
              className={`w-full px-4 py-3 border rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent transition-all dark:text-gray-100 dark:placeholder-gray-400 ${
                errors.username
                  ? 'bg-red-50 border-red-300 focus:ring-red-500'
                  : 'bg-gray-50 border-gray-200 dark:!bg-gray-700 dark:border-gray-600'
              }`}
              placeholder="Digite o novo username"
              disabled={loading}
            />
            {errors.username && (
              <p className="mt-1 text-sm text-red-600">{errors.username}</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              Senha Atual <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={`w-full px-4 py-3 pr-12 border rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent transition-all dark:text-gray-100 dark:placeholder-gray-400 ${
                  errors.password
                    ? 'bg-red-50 border-red-300 focus:ring-red-500'
                    : 'bg-gray-50 border-gray-200'
                }`}
                placeholder="Digite sua senha atual"
                disabled={loading}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700"
              >
                {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
              </button>
            </div>
            {errors.password && (
              <p className="mt-1 text-sm text-red-600">{errors.password}</p>
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
              className="flex-1 px-4 py-3 bg-gradient-to-r from-amber-500 to-orange-500 text-white rounded-xl hover:from-amber-600 hover:to-orange-600 transition-colors font-medium shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
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

export default AlterarUsernameModal;
