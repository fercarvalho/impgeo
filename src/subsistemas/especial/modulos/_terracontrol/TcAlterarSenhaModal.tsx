// Modal "Mudar senha" do tc_user.
// Modos:
//   - 'normal' (default): X de fechar, ESC fecha, click-outside fecha
//   - 'forced': não-fechável (1º login com senha temporária). User PRECISA trocar.
//
// PUT /api/tc-auth/me/password { currentPassword, newPassword }.
// Sucesso → revoga sessões antigas no backend → frontend faz logout e pede
// re-login com a senha nova (force_password_change agora é FALSE).

import React, { useState } from 'react'
import { Lock, Loader2, X } from 'lucide-react'
import Modal from '@/components/Modal'
import { TC_API_BASE_URL, useTcAuth } from '@/contexts/TcAuthContext'

interface Props {
  isOpen: boolean
  mode?: 'normal' | 'forced'
  onClose?: () => void
  onChanged?: () => void
}

const TcAlterarSenhaModal: React.FC<Props> = ({ isOpen, mode = 'normal', onClose, onChanged }) => {
  const { tcToken, logout, setForcePasswordChange } = useTcAuth()
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showAll, setShowAll] = useState(false)
  const [error, setError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [success, setSuccess] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (isSubmitting) return
    setError('')
    if (!currentPassword || !newPassword || !confirmPassword) {
      setError('Preencha todos os campos')
      return
    }
    if (newPassword.length < 6) {
      setError('Nova senha deve ter pelo menos 6 caracteres')
      return
    }
    if (newPassword !== confirmPassword) {
      setError('A confirmação não bate com a nova senha')
      return
    }
    if (newPassword === currentPassword) {
      setError('A nova senha deve ser diferente da atual')
      return
    }
    setIsSubmitting(true)
    try {
      const res = await fetch(`${TC_API_BASE_URL}/tc-auth/me/password`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tcToken}` },
        body: JSON.stringify({ currentPassword, newPassword }),
      })
      const data = await res.json()
      if (!res.ok || !data?.success) {
        setError(data?.error || 'Falha ao alterar senha')
        return
      }
      setSuccess(true)
      setForcePasswordChange(false)
      // Backend revogou todas as sessões; logout do frontend força re-login.
      setTimeout(async () => {
        await logout()
        if (onChanged) onChanged()
        // Recarrega para garantir estado limpo (volta pra LoginScreen)
        window.location.reload()
      }, 1500)
    } catch (e: any) {
      setError(e?.message || 'Erro de conexão')
    } finally {
      setIsSubmitting(false)
    }
  }

  // Modal destrutivo no modo forced
  return (
    <Modal isOpen={isOpen} onClose={mode === 'forced' ? () => {} : (onClose || (() => {}))} destructive={mode === 'forced'}>
      <div className="bg-white dark:bg-[#243040] rounded-2xl shadow-2xl w-full max-w-md p-6 m-4">
        <div className="flex justify-between items-center mb-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-gradient-to-r from-tc-green to-tc-blue text-white">
              <Lock className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">
                {mode === 'forced' ? 'Defina sua nova senha' : 'Mudar senha'}
              </h2>
              {mode === 'forced' && (
                <p className="text-xs text-amber-600 dark:text-amber-400 mt-0.5">
                  Por segurança, você precisa trocar a senha temporária antes de continuar.
                </p>
              )}
            </div>
          </div>
          {mode === 'normal' && onClose && (
            <button onClick={onClose} className="text-gray-400 hover:text-gray-700">
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        {success ? (
          <div className="text-center py-6">
            <div className="mx-auto w-12 h-12 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center mb-3">
              <Lock className="w-6 h-6 text-green-600 dark:text-green-400" />
            </div>
            <p className="text-gray-700 dark:text-gray-200 font-medium mb-1">Senha alterada com sucesso!</p>
            <p className="text-sm text-gray-500 dark:text-gray-400">Faça login novamente com a nova senha…</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-3">
            <PasswordField
              id="currentPwd"
              label={mode === 'forced' ? 'Senha temporária' : 'Senha atual'}
              value={currentPassword}
              onChange={setCurrentPassword}
              show={showAll}
            />
            <PasswordField
              id="newPwd"
              label="Nova senha"
              value={newPassword}
              onChange={setNewPassword}
              show={showAll}
            />
            <PasswordField
              id="confirmPwd"
              label="Confirme a nova senha"
              value={confirmPassword}
              onChange={setConfirmPassword}
              show={showAll}
            />

            <label className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400 select-none cursor-pointer pt-1">
              <input type="checkbox" checked={showAll} onChange={() => setShowAll(v => !v)} className="rounded" />
              Mostrar senhas
            </label>

            {error && (
              <div className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-3">
                {error}
              </div>
            )}

            <div className="flex gap-2 justify-end pt-2">
              {mode === 'normal' && onClose && (
                <button type="button" onClick={onClose} className="px-4 py-2 rounded-xl bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 text-sm font-semibold">
                  Cancelar
                </button>
              )}
              <button
                type="submit"
                disabled={isSubmitting}
                className="px-6 py-2 rounded-xl bg-gradient-to-r from-tc-green to-tc-blue text-white font-semibold disabled:opacity-60 flex items-center gap-2"
              >
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

interface PFProps {
  id: string
  label: string
  value: string
  onChange: (v: string) => void
  show: boolean
}

const PasswordField: React.FC<PFProps> = ({ id, label, value, onChange, show }) => (
  <div>
    <label htmlFor={id} className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">{label}</label>
    <div className="relative">
      <input
        id={id}
        type={show ? 'text' : 'password'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 dark:bg-[#1a2a3e] dark:text-gray-100 rounded-xl focus:ring-2 focus:ring-tc-green focus:border-transparent"
        autoComplete="new-password"
        required
      />
    </div>
  </div>
)

export default TcAlterarSenhaModal
