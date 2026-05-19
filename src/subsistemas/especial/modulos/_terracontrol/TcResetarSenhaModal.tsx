// Modal aberto pelo link de email "?reset=<token>" na URL pública do
// TerraControl. Valida o token + permite definir nova senha.
// Após sucesso, redireciona para tela de login.

import React, { useEffect, useState } from 'react'
import { Lock, Loader2, X } from 'lucide-react'
import Modal from '@/components/Modal'
import { TC_API_BASE_URL } from '@/contexts/TcAuthContext'

interface Props {
  isOpen: boolean
  token: string
  onClose: () => void
}

const TcResetarSenhaModal: React.FC<Props> = ({ isOpen, token, onClose }) => {
  const [validating, setValidating] = useState(true)
  const [validatedUsername, setValidatedUsername] = useState<string | null>(null)
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)

  useEffect(() => {
    if (!isOpen || !token) return
    setValidating(true)
    setError('')
    fetch(`${TC_API_BASE_URL}/tc-auth/validar-token/${encodeURIComponent(token)}`)
      .then(res => res.json())
      .then(data => {
        if (data?.success && data?.valid) {
          setValidatedUsername(data.username || null)
        } else {
          setError(data?.error || 'Link inválido ou expirado')
        }
      })
      .catch(() => setError('Erro ao validar link'))
      .finally(() => setValidating(false))
  }, [isOpen, token])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (isSubmitting) return
    setError('')
    if (!newPassword || !confirmPassword) {
      setError('Preencha ambos os campos'); return
    }
    if (newPassword.length < 6) {
      setError('A senha deve ter pelo menos 6 caracteres'); return
    }
    if (newPassword !== confirmPassword) {
      setError('As senhas não coincidem'); return
    }
    setIsSubmitting(true)
    try {
      const res = await fetch(`${TC_API_BASE_URL}/tc-auth/resetar-senha`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, novaSenha: newPassword }),
      })
      const data = await res.json()
      if (!res.ok || !data?.success) {
        setError(data?.error || 'Falha ao redefinir senha'); return
      }
      setSuccess(true)
      setTimeout(() => {
        // Remove ?reset= da URL e recarrega
        const url = new URL(window.location.href)
        url.searchParams.delete('reset')
        window.location.replace(url.toString())
      }, 1500)
    } catch (e: any) {
      setError(e?.message || 'Erro de conexão')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} destructive>
      <div className="bg-white dark:bg-[#243040] rounded-2xl shadow-2xl w-full max-w-md p-6 m-4">
        <div className="flex justify-between items-center mb-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-gradient-to-r from-tc-green to-tc-blue text-white">
              <Lock className="w-5 h-5" />
            </div>
            <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">Redefinir senha</h2>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700">
            <X className="w-5 h-5" />
          </button>
        </div>

        {validating ? (
          <div className="py-8 text-center text-gray-500 flex flex-col items-center gap-2">
            <Loader2 className="w-6 h-6 animate-spin" />
            Validando link…
          </div>
        ) : error && !validatedUsername ? (
          <div className="py-4">
            <p className="text-red-600 dark:text-red-400 mb-3">{error}</p>
            <button onClick={onClose} className="px-4 py-2 rounded-xl bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 text-sm font-semibold">Fechar</button>
          </div>
        ) : success ? (
          <div className="text-center py-6">
            <p className="text-gray-700 dark:text-gray-200 font-medium mb-1">Senha redefinida com sucesso!</p>
            <p className="text-sm text-gray-500 dark:text-gray-400">Redirecionando para a tela de login…</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-3">
            {validatedUsername && (
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Definindo nova senha para <span className="font-semibold text-gray-700 dark:text-gray-300">@{validatedUsername}</span>
              </p>
            )}
            <div>
              <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">Nova senha</label>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 dark:bg-[#1a2a3e] dark:text-gray-100 rounded-xl focus:ring-2 focus:ring-tc-green"
                autoComplete="new-password"
                autoFocus
                required
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">Confirme a nova senha</label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 dark:bg-[#1a2a3e] dark:text-gray-100 rounded-xl focus:ring-2 focus:ring-tc-green"
                autoComplete="new-password"
                required
              />
            </div>
            {error && (
              <div className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-3">
                {error}
              </div>
            )}
            <div className="flex gap-2 justify-end pt-2">
              <button type="button" onClick={onClose} className="px-4 py-2 rounded-xl bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 text-sm font-semibold">Cancelar</button>
              <button type="submit" disabled={isSubmitting} className="px-6 py-2 rounded-xl bg-gradient-to-r from-tc-green to-tc-blue text-white font-semibold disabled:opacity-60 flex items-center gap-2">
                {isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
                Salvar nova senha
              </button>
            </div>
          </form>
        )}
      </div>
    </Modal>
  )
}

export default TcResetarSenhaModal
