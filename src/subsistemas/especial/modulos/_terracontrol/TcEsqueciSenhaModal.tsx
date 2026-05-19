// Modal "Esqueci minha senha" para tc_users. Envia POST /api/tc-auth/recuperar-senha
// com email ou username. Resposta sempre genérica (não revela se conta existe).

import React, { useState } from 'react'
import { Mail, Loader2, X } from 'lucide-react'
import Modal from '@/components/Modal'
import { TC_API_BASE_URL } from '@/contexts/TcAuthContext'

interface Props {
  isOpen: boolean
  onClose: () => void
}

const TcEsqueciSenhaModal: React.FC<Props> = ({ isOpen, onClose }) => {
  const [identifier, setIdentifier] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (isSubmitting) return
    if (!identifier.trim()) {
      setError('Informe seu email ou usuário')
      return
    }
    setIsSubmitting(true)
    setError('')
    try {
      const body = identifier.includes('@')
        ? { email: identifier.trim() }
        : { username: identifier.trim() }
      const res = await fetch(`${TC_API_BASE_URL}/tc-auth/recuperar-senha`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      // Resposta genérica: 200 sempre que entrada válida
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setError(data?.error || 'Erro ao enviar email')
      } else {
        setSent(true)
      }
    } catch (e: any) {
      setError(e?.message || 'Erro de conexão')
    } finally {
      setIsSubmitting(false)
    }
  }

  const close = () => {
    setIdentifier(''); setSent(false); setError(''); onClose()
  }

  return (
    <Modal isOpen={isOpen} onClose={close}>
      <div className="bg-white dark:bg-[#243040] rounded-2xl shadow-2xl w-full max-w-md p-6 m-4">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">Recuperar senha</h2>
          <button onClick={close} className="text-gray-400 hover:text-gray-700 dark:hover:text-gray-200">
            <X className="w-5 h-5" />
          </button>
        </div>

        {sent ? (
          <div className="text-center py-4">
            <div className="mx-auto w-12 h-12 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center mb-3">
              <Mail className="w-6 h-6 text-green-600 dark:text-green-400" />
            </div>
            <p className="text-gray-700 dark:text-gray-200 mb-2 font-medium">Email enviado, se a conta existir</p>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Verifique sua caixa de entrada (e spam). O link expira em 60 minutos.
            </p>
            <button
              onClick={close}
              className="mt-5 px-6 py-2 rounded-xl bg-gradient-to-r from-tc-green to-tc-blue text-white font-semibold"
            >
              OK
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Informe seu email cadastrado ou seu usuário. Enviaremos um link de recuperação.
            </p>
            <div>
              <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">
                Email ou usuário
              </label>
              <input
                type="text"
                value={identifier}
                onChange={(e) => { setIdentifier(e.target.value); setError('') }}
                className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 dark:bg-[#1a2a3e] dark:text-gray-100 rounded-xl focus:ring-2 focus:ring-tc-green focus:border-transparent"
                placeholder="seu@email.com ou seu-usuario"
                autoFocus
              />
            </div>
            {error && (
              <div className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-3">
                {error}
              </div>
            )}
            <div className="flex gap-2 justify-end pt-2">
              <button type="button" onClick={close} className="px-4 py-2 rounded-xl bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 text-sm font-semibold">
                Cancelar
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="px-6 py-2 rounded-xl bg-gradient-to-r from-tc-green to-tc-blue text-white font-semibold disabled:opacity-60 flex items-center gap-2"
              >
                {isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
                Enviar
              </button>
            </div>
          </form>
        )}
      </div>
    </Modal>
  )
}

export default TcEsqueciSenhaModal
