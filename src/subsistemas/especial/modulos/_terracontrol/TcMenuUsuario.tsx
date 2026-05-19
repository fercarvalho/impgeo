// Dropdown do canto direito do header com avatar do tc_user + opções de menu.
// Itens: Perfil, Mudar senha, Mudar usuário, Sair.

import React, { useEffect, useRef, useState } from 'react'
import { User as UserIcon, Lock, AtSign, LogOut, ChevronDown } from 'lucide-react'
import type { TcUser } from '@/contexts/TcAuthContext'
import { useTcAuth } from '@/contexts/TcAuthContext'

interface Props {
  tcUser: TcUser
  onOpenProfile: () => void
  onOpenPassword: () => void
  onOpenUsername: () => void
}

const TcMenuUsuario: React.FC<Props> = ({ tcUser, onOpenProfile, onOpenPassword, onOpenUsername }) => {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const { logout } = useTcAuth()

  useEffect(() => {
    if (!open) return
    const onDocClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [open])

  const initials = (tcUser.firstName || tcUser.username || '?').slice(0, 1).toUpperCase()
    + (tcUser.lastName ? tcUser.lastName.slice(0, 1).toUpperCase() : '')

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="flex items-center gap-2 px-2 py-1.5 rounded-xl bg-white/20 hover:bg-white/30 text-white transition-colors"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        {tcUser.photoUrl ? (
          <img src={tcUser.photoUrl} alt={tcUser.username} className="w-8 h-8 rounded-full object-cover border border-white/40" />
        ) : (
          <div className="w-8 h-8 rounded-full bg-white/30 flex items-center justify-center font-bold text-sm">
            {initials}
          </div>
        )}
        <span className="hidden sm:block text-sm font-semibold max-w-[120px] truncate">
          {tcUser.firstName || tcUser.username}
        </span>
        <ChevronDown className="w-4 h-4 opacity-80" />
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-56 bg-white dark:bg-[#243040] rounded-xl shadow-2xl border border-gray-200 dark:border-gray-700 overflow-hidden z-50">
          <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-700">
            <p className="text-xs text-gray-500 dark:text-gray-400">Conectado como</p>
            <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">{tcUser.username}</p>
          </div>
          <MenuItem icon={<UserIcon className="w-4 h-4" />} label="Meu perfil" onClick={() => { setOpen(false); onOpenProfile() }} />
          <MenuItem icon={<Lock className="w-4 h-4" />}     label="Mudar senha" onClick={() => { setOpen(false); onOpenPassword() }} />
          <MenuItem icon={<AtSign className="w-4 h-4" />}   label="Mudar usuário" onClick={() => { setOpen(false); onOpenUsername() }} />
          <div className="border-t border-gray-100 dark:border-gray-700">
            <MenuItem icon={<LogOut className="w-4 h-4" />} label="Sair" danger onClick={async () => { setOpen(false); await logout() }} />
          </div>
        </div>
      )}
    </div>
  )
}

interface MIProps { icon: React.ReactNode; label: string; onClick: () => void; danger?: boolean }
const MenuItem: React.FC<MIProps> = ({ icon, label, onClick, danger }) => (
  <button
    type="button"
    onClick={onClick}
    className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm font-medium text-left transition-colors
      ${danger
        ? 'text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20'
        : 'text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700/50'}`}
  >
    <span className={danger ? 'text-red-500' : 'text-gray-400 dark:text-gray-500'}>{icon}</span>
    {label}
  </button>
)

export default TcMenuUsuario
