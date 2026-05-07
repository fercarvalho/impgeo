import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Mail, User, X } from 'lucide-react';

interface EsqueciSenhaModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const API_BASE_URL =
  typeof window !== 'undefined' &&
  (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
    ? 'http://localhost:9001/api'
    : ((import.meta as any).env?.VITE_API_URL || '/api');

const EsqueciSenhaModal: React.FC<EsqueciSenhaModalProps> = ({ isOpen, onClose }) => {
  const [emailOuUsername, setEmailOuUsername] = useState('');
  const [usernameAuxiliar, setUsernameAuxiliar] = useState('');
  const [showUsernameAuxiliar, setShowUsernameAuxiliar] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const firstFocusableRef = useRef<HTMLButtonElement>(null);
  const modalRef = useRef<HTMLDivElement>(null);
  const headingId = 'esqueci-senha-modal-title';

  // Reset completo do estado ao fechar
  const handleClose = useCallback(() => {
    if (isSubmitting) return;
    setError('');
    setSuccess('');
    setEmailOuUsername('');
    setUsernameAuxiliar('');
    setShowUsernameAuxiliar(false);
    onClose();
  }, [isSubmitting, onClose]);

  // Move foco para o botão de fechar ao abrir o modal
  useEffect(() => {
    if (isOpen) {
      // Pequeno defer para garantir que o DOM já renderizou
      const id = setTimeout(() => {
        firstFocusableRef.current?.focus();
      }, 0);
      return () => clearTimeout(id);
    }
  }, [isOpen]);

  // Recria o listener sempre que isSubmitting ou handleClose mudam
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleClose();
        return;
      }
      // Focus trap: mantém o foco dentro do modal
      if (e.key === 'Tab' && modalRef.current) {
        const focusable = modalRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])'
        );
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey) {
          if (document.activeElement === first) {
            e.preventDefault();
            last.focus();
          }
        } else {
          if (document.activeElement === last) {
            e.preventDefault();
            first.focus();
          }
        }
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, handleClose]);

  if (!isOpen) return null;

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    // Guard contra double-submit
    if (isSubmitting) return;

    setError('');
    setSuccess('');

    if (!emailOuUsername.trim()) {
      setError('Informe seu email ou nome de usuário.');
      return;
    }

    if (showUsernameAuxiliar && !usernameAuxiliar.trim()) {
      setError('Informe também o nome de usuário.');
      return;
    }

    // setIsSubmitting antes do try para cobrir toda a operação assíncrona
    setIsSubmitting(true);

    try {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      const body: { email?: string; username?: string } = {};

      if (showUsernameAuxiliar) {
        body.email = emailOuUsername.trim().toLowerCase();
        body.username = usernameAuxiliar.trim();
      } else if (emailRegex.test(emailOuUsername.trim())) {
        body.email = emailOuUsername.trim().toLowerCase();
      } else {
        body.username = emailOuUsername.trim();
      }

      const response = await fetch(`${API_BASE_URL}/auth/recuperar-senha`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });

      let result: { error?: string; message?: string } = {};
      try {
        result = await response.json();
      } catch {
        // body não é JSON (ex: 502/504 sem body)
      }

      if (!response.ok) {
        if (result.error === 'MULTIPLE_USERS') {
          setShowUsernameAuxiliar(true);
          setError(result.message || 'Este email está associado a múltiplas contas. Informe também o nome de usuário.');
          return;
        }
        throw new Error(result.error || 'Não foi possível processar a solicitação.');
      }

      setSuccess(
        result.message ||
          'Se o email/nome de usuário estiver cadastrado, você receberá um link de recuperação em breve.'
      );
      setUsernameAuxiliar('');
      setShowUsernameAuxiliar(false);
      setEmailOuUsername('');
    } catch (requestError: unknown) {
      const message = requestError instanceof Error ? requestError.message : 'Erro ao solicitar recuperação de senha.';
      setError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 bg-gradient-to-br from-blue-900/50 to-indigo-900/50 backdrop-blur-sm flex items-center justify-center z-[9999] p-4"
      onClick={(event) => {
        if (event.target === event.currentTarget) handleClose();
      }}
    >
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={headingId}
        className="w-full max-w-md bg-white dark:bg-gray-800 rounded-2xl shadow-2xl overflow-hidden"
      >
        <div className="flex items-center justify-between px-6 py-4 bg-gradient-to-r from-blue-500 to-indigo-600">
          <h2 id={headingId} className="text-lg font-bold text-white flex items-center gap-2">
            <Mail className="w-5 h-5 text-white" aria-hidden="true" />
            Recuperar senha
          </h2>
          <button
            ref={firstFocusableRef}
            onClick={handleClose}
            className="p-1.5 rounded-lg text-white/80 hover:text-white hover:bg-white/20 transition-all duration-200"
            disabled={isSubmitting}
            aria-label="Fechar modal"
          >
            <X className="w-5 h-5" aria-hidden="true" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          <p className="text-sm text-gray-600 dark:text-gray-300">
            Digite seu email ou nome de usuário. Você receberá um link para redefinir sua senha.
          </p>

          {error ? (
            <p className="text-sm text-red-600 dark:text-red-400" role="alert">{error}</p>
          ) : null}
          {success ? (
            <p className="text-sm text-green-600 dark:text-green-400" role="status">{success}</p>
          ) : null}

          <div>
            <label htmlFor="esqueciSenhaEmailOuUsername" className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">
              {showUsernameAuxiliar ? 'Email' : 'Email ou nome de usuário'}
            </label>
            <input
              id="esqueciSenhaEmailOuUsername"
              type="text"
              value={emailOuUsername}
              onChange={(event) => setEmailOuUsername(event.target.value)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 disabled:opacity-50 disabled:cursor-not-allowed"
              placeholder={showUsernameAuxiliar ? 'Digite seu email' : 'Digite seu email ou usuário'}
              disabled={isSubmitting || showUsernameAuxiliar}
              autoComplete="off"
            />
          </div>

          {showUsernameAuxiliar ? (
            <div>
              <label htmlFor="esqueciSenhaUsernameAuxiliar" className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">
                Nome de usuário
              </label>
              <div className="relative">
                <input
                  id="esqueciSenhaUsernameAuxiliar"
                  type="text"
                  value={usernameAuxiliar}
                  onChange={(event) => setUsernameAuxiliar(event.target.value)}
                  className="w-full px-3 py-2 pl-10 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500"
                  placeholder="Digite o nome de usuário"
                  disabled={isSubmitting}
                  autoComplete="username"
                />
                <User className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" aria-hidden="true" />
              </div>
            </div>
          ) : null}

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={handleClose}
              className="px-4 py-2 text-gray-700 dark:text-gray-200 bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
              disabled={isSubmitting}
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="px-4 py-2 text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-60 transition-colors"
              disabled={isSubmitting}
              aria-busy={isSubmitting}
            >
              {isSubmitting ? 'Enviando...' : 'Enviar link'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default EsqueciSenhaModal;
