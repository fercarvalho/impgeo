// Modal "Mudar usuário" do tc_user. Exige senha. PUT /api/tc-auth/me/username.

import React, { useState } from 'react'
import { AtSign, Loader2, X } from 'lucide-react'
import Modal from '@/components/Modal'
import { TC_API_BASE_URL, useTcAuth } from '@/contexts/TcAuthContext'

interface Props {
  isOpen: boolean
  onClose: () => void
}

const TcAlterarUsernameModal: React.FC<Props> = ({ isOpen, onClose }) => {
  const { tcToken, tcUser, refreshTcUser } = useTcAuth()
  const [newUsername, setNewUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (isSubmitting) return
    setError('')
    if (!newUsername.trim() || !password) {
      setError('Preencha ambos os campos')
      return
    }
    if (newUsername.trim().toLowerCase() === tcUser?.username) {
      setError('O novo usuário deve ser diferente do atual')
      return
    }
    setIsSubmitting(true)
    try {
      const res = await fetch(`${TC_API_BASE_URL}/tc-auth/me/username`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tcToken}` },
        body: JSON.stringify({ password, newUsername: newUsername.trim().toLowerCase() }),
      })
      const data = await res.json()
      if (!res.ok || !data?.success) {
        setError(data?.error || 'Falha ao alterar usuário')
        return
      }
      await refreshTcUser()
      setNewUsername(''); setPassword('')
      onClose()
    } catch (e: any) {
      setError(e?.message || 'Erro de conexão')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose}>
      <div className="bg-white dark:bg-[#243040] rounded-2xl shadow-2xl w-full max-w-md p-6 m-4">
        <div className="flex justify-between items-center mb-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-gradient-to-r from-tc-green to-tc-blue text-white">
              <AtSign className="w-5 h-5" />
            </div>
            <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">Mudar usuário</h2>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Atual: <span className="font-semibold text-gray-700 dark:text-gray-300">@{tcUser?.username}</span>
          </p>
          <div>
            <label htmlFor="tc-new-username" className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">
              Novo usuário
            </label>
            <input
              id="tc-new-username"
              type="text"
              value={newUsername}
              onChange={(e) => setNewUsername(e.target.value)}
              pattern="[a-z0-9][a-z0-9\-_]{2,}"
              className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 dark:bg-[#1a2a3e] dark:text-gray-100 rounded-xl focus:ring-2 focus:ring-tc-green"
              placeholder="usuario-novo"
              autoFocus
              required
            />
            <p className="text-xs text-gray-400 mt-1">Letras minúsculas, números, hífens ou underline. 3+ caracteres.</p>
          </div>
          <div>
            <label htmlFor="tc-pwd-confirm" className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">
              Confirme sua senha
            </label>
            <input
              id="tc-pwd-confirm"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 dark:bg-[#1a2a3e] dark:text-gray-100 rounded-xl focus:ring-2 focus:ring-tc-green"
              autoComplete="current-password"
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
              Salvar
            </button>
          </div>
        </form>
      </div>
    </Modal>
  )
}

export default TcAlterarUsernameModal
