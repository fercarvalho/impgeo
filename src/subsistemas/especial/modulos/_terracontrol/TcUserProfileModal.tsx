// Modal de perfil do tc_user — visualização read-only + atalho para edição.
// Versão MVP: campos exibidos, sem edição inline (que vive em TcEditarPerfilModal — fase futura).
// Foto, nome, username, email, telefone, CPF, data de nascimento, gênero, endereço.

import React from 'react'
import { X, User as UserIcon, Mail, Phone, FileText, Calendar, MapPin } from 'lucide-react'
import Modal from '@/components/Modal'
import type { TcUser } from '@/contexts/TcAuthContext'

interface Props {
  isOpen: boolean
  onClose: () => void
  tcUser: TcUser
  onEdit?: () => void
}

const TcUserProfileModal: React.FC<Props> = ({ isOpen, onClose, tcUser, onEdit }) => {
  const fullName = [tcUser.firstName, tcUser.lastName].filter(Boolean).join(' ') || tcUser.username
  const initials = (tcUser.firstName || tcUser.username || '?').slice(0, 1).toUpperCase()
    + (tcUser.lastName ? tcUser.lastName.slice(0, 1).toUpperCase() : '')

  return (
    <Modal isOpen={isOpen} onClose={onClose}>
      <div className="bg-white dark:bg-[#243040] rounded-2xl shadow-2xl w-full max-w-lg m-4 overflow-hidden">
        <div className="bg-gradient-to-r from-tc-green to-tc-blue px-6 py-6 text-white">
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

        <div className="p-6 space-y-3">
          <Field icon={<UserIcon className="w-4 h-4" />} label="Nome completo" value={fullName} />
          <Field icon={<AtSignIcon />} label="Usuário" value={tcUser.username} />
          <Field icon={<Mail className="w-4 h-4" />} label="Email" value={tcUser.email || '—'} />
          <Field icon={<Phone className="w-4 h-4" />} label="Telefone" value={tcUser.phone || '—'} />
          <Field icon={<FileText className="w-4 h-4" />} label="CPF" value={tcUser.cpf || '—'} />
          <Field icon={<Calendar className="w-4 h-4" />} label="Data de nascimento" value={formatDate(tcUser.birthDate)} />
          <Field icon={<MapPin className="w-4 h-4" />} label="Endereço" value={formatAddress(tcUser.address)} />
        </div>

        <div className="px-6 pb-6 flex justify-end gap-2">
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
