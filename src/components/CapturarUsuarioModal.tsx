import React, { useEffect, useMemo, useState } from 'react'
import Modal from './Modal'
import { UserCircle2, X, Loader2, Search } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'

// Atalho rápido de "capturar usuário" (impersonation) para superadmin, direto
// do menu do usuário — evita ir até o subsistema Admin só pra representar.
interface ApiUser { id: string; username: string; firstName?: string; lastName?: string; role: string; is_active?: boolean }

const CapturarUsuarioModal: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const { user, startImpersonation } = useAuth()
  const [users, setUsers] = useState<ApiUser[]>([])
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState('')
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    (async () => {
      try {
        const tok = sessionStorage.getItem('impersonationToken') ?? sessionStorage.getItem('authToken')
        const r = await fetch('/api/users', {
          credentials: 'include',
          headers: tok ? { Authorization: `Bearer ${tok}` } : undefined,
        })
        const j = await r.json()
        if (!r.ok || !j.success) throw new Error(j.error || 'Falha ao carregar usuários')
        setUsers(Array.isArray(j.data) ? j.data : [])
      } catch (e: any) { setError(e.message || 'Erro ao carregar usuários') }
      finally { setLoading(false) }
    })()
  }, [])

  const name = (u: ApiUser) => [u.firstName, u.lastName].filter(Boolean).join(' ') || u.username

  // Não dá pra representar a si mesmo nem outro superadmin (backend bloqueia).
  const list = useMemo(() => {
    const term = q.trim().toLowerCase()
    return users
      .filter(u => u.id !== user?.id && u.role !== 'superadmin' && u.is_active !== false)
      .filter(u => !term || name(u).toLowerCase().includes(term) || u.username.toLowerCase().includes(term) || u.role.includes(term))
      .sort((a, b) => name(a).localeCompare(name(b), 'pt-BR'))
  }, [users, q, user])

  const capture = async (u: ApiUser) => {
    setBusyId(u.id); setError(null)
    try {
      const ok = await startImpersonation(u.id)
      if (!ok) { setError(`Não foi possível capturar ${name(u)}.`); setBusyId(null); return }
      onClose() // já está representando — o app re-renderiza no contexto do usuário
    } catch { setError('Erro ao capturar usuário'); setBusyId(null) }
  }

  return (
    <Modal isOpen onClose={onClose}>
      <div className="bg-white dark:!bg-[#243040] rounded-2xl w-full max-w-md shadow-2xl overflow-hidden max-h-[80vh] flex flex-col">
        <div className="bg-gradient-to-r from-amber-500 to-orange-600 px-5 py-3 flex items-center justify-between flex-shrink-0">
          <h3 className="text-white font-bold flex items-center gap-2"><UserCircle2 className="w-4 h-4" /> Capturar usuário</h3>
          <button onClick={onClose} className="text-white/80 hover:text-white"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-4 space-y-3 overflow-y-auto">
          <p className="text-xs text-gray-500 dark:text-gray-400">Veja o sistema como o usuário escolhido. Para voltar, use a barra de representação no topo.</p>
          <div className="relative">
            <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar por nome, usuário ou papel…"
              className="w-full pl-9 pr-3 py-2 border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 dark:text-gray-100 text-sm" />
          </div>
          {error && <div className="text-sm text-red-600 dark:text-red-400">{error}</div>}
          {loading ? (
            <div className="flex items-center justify-center py-10 text-gray-400"><Loader2 className="w-6 h-6 animate-spin" /></div>
          ) : list.length === 0 ? (
            <div className="py-10 text-center text-sm text-gray-400">Nenhum usuário encontrado.</div>
          ) : (
            <div className="divide-y divide-gray-100 dark:divide-gray-700 -my-1">
              {list.map(u => (
                <button key={u.id} onClick={() => capture(u)} disabled={!!busyId}
                  className="w-full py-2.5 flex items-center gap-3 text-left hover:bg-amber-50 dark:hover:bg-amber-900/10 rounded-lg px-2 transition-colors disabled:opacity-50">
                  <div className="w-8 h-8 rounded-full bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 flex items-center justify-center text-xs font-bold flex-shrink-0">
                    {name(u).charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-gray-800 dark:text-gray-100 truncate">{name(u)}</p>
                    <p className="text-xs text-gray-400 truncate">@{u.username} · {u.role}</p>
                  </div>
                  {busyId === u.id ? <Loader2 className="w-4 h-4 animate-spin text-amber-500" /> : <UserCircle2 className="w-4 h-4 text-amber-500" />}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </Modal>
  )
}

export default CapturarUsuarioModal
