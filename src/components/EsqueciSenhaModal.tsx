import React, { useState } from 'react';
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

  if (!isOpen) return null;

  const handleClose = () => {
    if (isSubmitting) return;
    setError('');
    setSuccess('');
    onClose();
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
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

    try {
      setIsSubmitting(true);

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

      const result = await response.json();
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
    } catch (requestError: any) {
      setError(requestError.message || 'Erro ao solicitar recuperação de senha.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[9999] p-4"
      onClick={(event) => {
        if (event.target === event.currentTarget) handleClose();
      }}
    >
      <div className="w-full max-w-md bg-white rounded-xl shadow-xl border border-blue-100">
        <div className="flex items-center justify-between px-6 py-4 border-b border-blue-100 bg-blue-50 rounded-t-xl">
          <h2 className="text-lg font-semibold text-blue-900 flex items-center gap-2">
            <Mail className="w-5 h-5 text-blue-700" />
            Recuperar senha
          </h2>
          <button onClick={handleClose} className="p-2 rounded-full text-blue-700 hover:bg-blue-100">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          <p className="text-sm text-gray-600">
            Digite seu email ou nome de usuário. Você receberá um link para redefinir sua senha.
          </p>

          {error ? <p className="text-sm text-red-600">{error}</p> : null}
          {success ? <p className="text-sm text-green-600">{success}</p> : null}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {showUsernameAuxiliar ? 'Email' : 'Email ou nome de usuário'}
            </label>
            <input
              type="text"
              value={emailOuUsername}
              onChange={(event) => setEmailOuUsername(event.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              placeholder="Digite seu email ou usuário"
              disabled={isSubmitting || showUsernameAuxiliar}
            />
          </div>

          {showUsernameAuxiliar ? (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Nome de usuário</label>
              <div className="relative">
                <input
                  type="text"
                  value={usernameAuxiliar}
                  onChange={(event) => setUsernameAuxiliar(event.target.value)}
                  className="w-full px-3 py-2 pl-10 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="Digite o nome de usuário"
                  disabled={isSubmitting}
                />
                <User className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
              </div>
            </div>
          ) : null}

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={handleClose}
              className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
              disabled={isSubmitting}
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="px-4 py-2 text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-60"
              disabled={isSubmitting}
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
