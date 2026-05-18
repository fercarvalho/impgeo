import React, { useEffect, useRef, useState } from 'react';
import { Eye, EyeOff, KeyRound, X } from 'lucide-react';
import Modal from './Modal';

interface ResetarSenhaModalProps {
  isOpen: boolean;
  token: string;
  onClose: () => void;
}

const API_BASE_URL =
  typeof window !== 'undefined' &&
  (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
    ? 'http://localhost:9001/api'
    : ((import.meta as any).env?.VITE_API_URL || '/api');

const ResetarSenhaModal: React.FC<ResetarSenhaModalProps> = ({ isOpen, token, onClose }) => {
  const [isValidating, setIsValidating] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isTokenValid, setIsTokenValid] = useState(false);
  const [username, setUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const closeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      if (closeTimeoutRef.current !== null) {
        clearTimeout(closeTimeoutRef.current);
        closeTimeoutRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!isOpen || !token) return;
    // Reseta estados ao reabrir o modal com um novo token
    setIsTokenValid(false);
    setNewPassword('');
    setConfirmPassword('');
    setError('');
    setSuccess('');
    setShowNewPassword(false);
    setShowConfirmPassword(false);
    let mounted = true;
    const validateToken = async () => {
      try {
        setIsValidating(true);
        setError('');
        const response = await fetch(`${API_BASE_URL}/auth/validar-token/${encodeURIComponent(token)}`);
        let result: { valid?: boolean; error?: string; username?: string } = {};
        try {
          result = await response.json();
        } catch {
          // body não é JSON (ex: 502/504 sem body)
        }
        if (!response.ok || !result.valid) {
          throw new Error(result.error || 'Token inválido ou expirado.');
        }
        if (!mounted) return;
        setIsTokenValid(true);
        setUsername(result.username || '');
      } catch (validationError: unknown) {
        if (!mounted) return;
        setIsTokenValid(false);
        const message = validationError instanceof Error ? validationError.message : 'Token inválido ou expirado.';
        setError(message);
      } finally {
        if (mounted) setIsValidating(false);
      }
    };
    validateToken();
    return () => {
      mounted = false;
    };
  }, [isOpen, token]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    setSuccess('');

    const trimmedPassword = newPassword.trim();
    const trimmedConfirm = confirmPassword.trim();

    if (!trimmedPassword || !trimmedConfirm) {
      setError('Preencha os dois campos de senha.');
      return;
    }
    if (trimmedPassword.length < 6) {
      setError('A nova senha deve ter pelo menos 6 caracteres.');
      return;
    }
    if (trimmedPassword !== trimmedConfirm) {
      setError('As senhas não coincidem.');
      return;
    }

    try {
      setIsSubmitting(true);
      const response = await fetch(`${API_BASE_URL}/auth/resetar-senha`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token,
          novaSenha: trimmedPassword
        })
      });

      let result: { success?: boolean; error?: string; message?: string } = {};
      try {
        result = await response.json();
      } catch {
        // body não é JSON (ex: 502/504 sem body)
      }

      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Não foi possível redefinir a senha.');
      }
      if (!isMountedRef.current) return;
      setSuccess(result.message || 'Senha redefinida com sucesso.');
      setNewPassword('');
      setConfirmPassword('');
      // Delay para o usuário ver a mensagem de sucesso; timeout cancelável via ref
      closeTimeoutRef.current = setTimeout(() => {
        closeTimeoutRef.current = null;
        onClose();
      }, 1500);
    } catch (submitError: unknown) {
      if (!isMountedRef.current) return;
      const message = submitError instanceof Error ? submitError.message : 'Erro ao redefinir senha.';
      setError(message);
    } finally {
      if (isMountedRef.current) setIsSubmitting(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose}>
      <div className="w-full max-w-md bg-white dark:bg-gray-800 rounded-2xl shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 bg-gradient-to-r from-blue-500 to-indigo-600">
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <KeyRound className="w-5 h-5 text-white" aria-hidden="true" />
            Redefinir senha
          </h2>
          <button
            onClick={() => {
              if (!isSubmitting) onClose();
            }}
            className="p-1.5 rounded-lg text-white/80 hover:text-white hover:bg-white/20 transition-all duration-200"
            disabled={isSubmitting}
            aria-label="Fechar modal"
          >
            <X className="w-5 h-5" aria-hidden="true" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          {isValidating ? (
            <p className="text-sm text-gray-600 dark:text-gray-300">Validando token de recuperação...</p>
          ) : null}

          {!isValidating && isTokenValid ? (
            <p className="text-sm text-gray-600 dark:text-gray-300">
              Olá{username ? `, ${username}` : ''}. Defina sua nova senha para continuar.
            </p>
          ) : null}

          {error ? (
            <p className="text-sm text-red-600 dark:text-red-400" role="alert">{error}</p>
          ) : null}
          {success ? (
            <p className="text-sm text-green-600 dark:text-green-400" role="status">{success}</p>
          ) : null}

          {!isValidating && isTokenValid ? (
            <>
              <div>
                <label htmlFor="resetarSenhaNovaSenha" className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">
                  Nova senha
                </label>
                <div className="relative">
                  <input
                    id="resetarSenhaNovaSenha"
                    type={showNewPassword ? 'text' : 'password'}
                    value={newPassword}
                    onChange={(event) => setNewPassword(event.target.value)}
                    className="w-full px-3 py-2 pr-11 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500"
                    placeholder="Digite a nova senha"
                    autoComplete="new-password"
                    disabled={isSubmitting}
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPassword((prev) => !prev)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                    disabled={isSubmitting}
                    aria-label={showNewPassword ? 'Ocultar nova senha' : 'Mostrar nova senha'}
                  >
                    {showNewPassword ? <EyeOff className="w-4 h-4" aria-hidden="true" /> : <Eye className="w-4 h-4" aria-hidden="true" />}
                  </button>
                </div>
              </div>

              <div>
                <label htmlFor="resetarSenhaConfirmarSenha" className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">
                  Confirmar nova senha
                </label>
                <div className="relative">
                  <input
                    id="resetarSenhaConfirmarSenha"
                    type={showConfirmPassword ? 'text' : 'password'}
                    value={confirmPassword}
                    onChange={(event) => setConfirmPassword(event.target.value)}
                    className="w-full px-3 py-2 pr-11 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500"
                    placeholder="Digite novamente a nova senha"
                    autoComplete="new-password"
                    disabled={isSubmitting}
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword((prev) => !prev)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                    disabled={isSubmitting}
                    aria-label={showConfirmPassword ? 'Ocultar confirmação de senha' : 'Mostrar confirmação de senha'}
                  >
                    {showConfirmPassword ? <EyeOff className="w-4 h-4" aria-hidden="true" /> : <Eye className="w-4 h-4" aria-hidden="true" />}
                  </button>
                </div>
              </div>
            </>
          ) : null}

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => { if (!isSubmitting) onClose(); }}
              className="px-4 py-2 text-gray-700 dark:text-gray-200 bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
              disabled={isSubmitting}
            >
              Fechar
            </button>
            <button
              type="submit"
              className="px-4 py-2 text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-60 transition-colors"
              disabled={isSubmitting || isValidating || !isTokenValid}
              aria-busy={isSubmitting}
            >
              {isSubmitting ? 'Salvando...' : 'Salvar nova senha'}
            </button>
          </div>
        </form>
      </div>
    </Modal>
  );
};

export default ResetarSenhaModal;
