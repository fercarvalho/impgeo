// Modal de perfil do tc_user — visualização read-only + atalho para edição.
// Versão MVP: campos exibidos, sem edição inline (que vive em TcEditarPerfilModal — fase futura).
// Foto, nome, username, email, telefone, CPF, data de nascimento, gênero, endereço.

import React, { useState } from 'react'
import { X, User as UserIcon, Mail, Phone, FileText, Calendar, MapPin, Bell } from 'lucide-react'
import Modal from '@/components/Modal'
import { useTcAuth, type TcUser } from '@/contexts/TcAuthContext'

interface Props {
  isOpen: boolean
  onClose: () => void
  tcUser: TcUser
  onEdit?: () => void
}

const TcUserProfileModal: React.FC<Props> = ({ isOpen, onClose, tcUser, onEdit }) => {
  const { tcToken, updateTcUser } = useTcAuth()
  // Default TRUE — se a flag vier undefined (ex: cache antigo de sessionStorage
  // antes da migration 034), tratamos como ligado pra refletir o default do DB.
  const emailNotifications = tcUser.emailNotifications !== false
  const [savingPref, setSavingPref] = useState(false)

  const togglePref = async () => {
    if (savingPref) return
    const next = !emailNotifications
    // Optimistic
    updateTcUser({ emailNotifications: next })
    setSavingPref(true)
    try {
      const res = await fetch('/api/tc-auth/me/preferences', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...(tcToken ? { Authorization: `Bearer ${tcToken}` } : {}),
        },
        credentials: 'include',
        body: JSON.stringify({ emailNotifications: next }),
      })
      if (!res.ok) throw new Error('failed')
    } catch {
      updateTcUser({ emailNotifications: !next })
    } finally {
      setSavingPref(false)
    }
  }

  const fullName = [tcUser.firstName, tcUser.lastName].filter(Boolean).join(' ') || tcUser.username
  const initials = (tcUser.firstName || tcUser.username || '?').slice(0, 1).toUpperCase()
    + (tcUser.lastName ? tcUser.lastName.slice(0, 1).toUpperCase() : '')

  return (
    <Modal isOpen={isOpen} onClose={onClose}>
      <div className="bg-white dark:bg-[#243040] rounded-2xl shadow-2xl w-full max-w-lg m-4 max-h-[90vh] flex flex-col overflow-hidden">
        <div className="bg-gradient-to-r from-tc-green to-tc-blue px-6 py-6 text-white flex-shrink-0">
          <div className="flex justify-between items-start mb-4">
            <h2 className="text-lg font-bold">Meu perfil</h2>
            <button onClick={onClose} className="text-white/80 hover:text-white">
              <X className="w-5 h-5" />
            </button>
          </div>
          <div className="flex items-center gap-4">
            {tcUser.photoUrl ? (
              <img src={tcUser.photoUrl} alt={fullName} className="w-16 h-16 rounded-full object-cover border-2 border-white/40" />
            ) : (
              <div className="w-16 h-16 rounded-full bg-white/20 flex items-center justify-center font-bold text-xl">
                {initials}
              </div>
            )}
            <div>
              <p className="font-bold text-lg leading-tight">{fullName}</p>
              <p className="text-sm text-white/80">@{tcUser.username}</p>
            </div>
          </div>
        </div>

        <div className="p-6 space-y-3 flex-1 overflow-y-auto">
          <Field icon={<UserIcon className="w-4 h-4" />} label="Nome completo" value={fullName} />
          <Field icon={<AtSignIcon />} label="Usuário" value={tcUser.username} />
          <Field icon={<Mail className="w-4 h-4" />} label="Email" value={tcUser.email || '—'} />
          <Field icon={<Phone className="w-4 h-4" />} label="Telefone" value={tcUser.phone || '—'} />
          <Field icon={<FileText className="w-4 h-4" />} label="CPF" value={tcUser.cpf || '—'} />
          <Field icon={<Calendar className="w-4 h-4" />} label="Data de nascimento" value={formatDate(tcUser.birthDate)} />
          <Field icon={<MapPin className="w-4 h-4" />} label="Endereço" value={formatAddress(tcUser.address)} />

          {/* Toggle opt-out de emails — só de eventos (aprovação/edição).
              Emails transacionais críticos (reset de senha, convite) NÃO
              são afetados por essa preferência. */}
          <div className="mt-2 p-4 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/30">
            <p className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400 font-semibold mb-3 flex items-center gap-2">
              <Bell className="w-3.5 h-3.5" /> Preferências de notificação
            </p>
            <label className="flex items-start gap-3 cursor-pointer select-none">
              <button
                type="button"
                role="switch"
                aria-checked={emailNotifications}
                onClick={togglePref}
                disabled={savingPref}
                className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors mt-0.5 ${
                  emailNotifications ? 'bg-tc-green' : 'bg-gray-300 dark:bg-gray-600'
                } ${savingPref ? 'opacity-60 cursor-wait' : ''}`}
              >
                <span
                  className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
                    emailNotifications ? 'translate-x-5' : 'translate-x-0.5'
                  }`}
                />
              </button>
              <span className="flex-1 text-sm">
                <span className="font-medium text-gray-900 dark:text-gray-100 block">
                  Receber emails sobre meus registros
                </span>
                <span className="text-xs text-gray-500 dark:text-gray-400">
                  Avisos por email quando o admin aprova ou edita um registro seu. Você sempre vai receber no sininho aqui dentro, mesmo desligado. Emails de senha e convite não são afetados.
                </span>
              </span>
            </label>
          </div>
        </div>

        <div className="px-6 pb-6 pt-3 flex justify-end gap-2 flex-shrink-0 border-t border-gray-200 dark:border-gray-700">
          <button onClick={onClose} className="px-4 py-2 rounded-xl bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 text-sm font-semibold">
            Fechar
          </button>
          {onEdit && (
            <button onClick={onEdit} className="px-6 py-2 rounded-xl bg-gradient-to-r from-tc-green to-tc-blue text-white font-semibold">
              Editar
            </button>
          )}
        </div>
      </div>
    </Modal>
  )
}

const AtSignIcon: React.FC = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
    <circle cx="12" cy="12" r="4" />
    <path d="M16 12v1.5a2.5 2.5 0 005 0V12a9 9 0 10-9 9" strokeLinecap="round" />
  </svg>
)

interface FProps { icon: React.ReactNode; label: string; value: string }
const Field: React.FC<FProps> = ({ icon, label, value }) => (
  <div className="flex items-start gap-3 py-1">
    <span className="mt-0.5 text-gray-400 dark:text-gray-500">{icon}</span>
    <div className="flex-1 min-w-0">
      <p className="text-xs uppercase tracking-wide text-gray-400 dark:text-gray-500 font-semibold mb-0.5">{label}</p>
      <p className="text-sm text-gray-900 dark:text-gray-100 break-words">{value}</p>
    </div>
  </div>
)

function formatDate(d?: string | null): string {
  if (!d) return '—'
  try { return new Date(d).toLocaleDateString('pt-BR') } catch { return d }
}
function formatAddress(a: any): string {
  if (!a || typeof a !== 'object') return '—'
  const parts = [a.street, a.number, a.neighborhood, a.city, a.state].filter(Boolean)
  return parts.length ? parts.join(', ') : '—'
}

export default TcUserProfileModal
