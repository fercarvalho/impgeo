import React, { useEffect, useMemo, useState } from 'react'
import Modal from './Modal'
import { FolderKanban, X, Loader2, Search } from 'lucide-react'

interface Proj { id: string; name: string; status?: string }

// Seletor de projeto reutilizável (busca + lista). onPick recebe o projeto.
const ProjectPickerModal: React.FC<{
  onPick: (p: Proj) => void
  onClose: () => void
  title?: string
  busy?: boolean
  currentProjectId?: string | null
}> = ({ onPick, onClose, title = 'Selecionar projeto', busy = false, currentProjectId = null }) => {
  const [projects, setProjects] = useState<Proj[]>([])
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState('')

  useEffect(() => {
    fetch('/api/projects')
      .then(r => r.json())
      .then(j => { if (j.success) setProjects(j.data) })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const list = useMemo(() => {
    const s = q.trim().toLowerCase()
    return projects.filter(p => !s || (p.name || '').toLowerCase().includes(s))
  }, [projects, q])

  return (
    <Modal isOpen onClose={onClose}>
      <div className="bg-white dark:!bg-[#243040] rounded-2xl w-full max-w-md shadow-2xl overflow-hidden max-h-[85vh] flex flex-col">
        <div className="bg-gradient-to-r from-violet-500 to-indigo-600 px-5 py-3 flex items-center justify-between flex-shrink-0">
          <h3 className="text-white font-bold flex items-center gap-2"><FolderKanban className="w-4 h-4" /> {title}</h3>
          <button onClick={onClose} className="text-white/80 hover:text-white"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-4 border-b border-gray-100 dark:border-gray-700 flex-shrink-0">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-2.5 text-gray-400" />
            <input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar projeto…"
              className="w-full pl-9 pr-3 py-2 border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 dark:text-gray-100 text-sm" />
          </div>
        </div>
        <div className="p-3 overflow-y-auto">
          {loading ? (
            <div className="flex justify-center py-6 text-gray-400"><Loader2 className="w-6 h-6 animate-spin" /></div>
          ) : list.length === 0 ? (
            <p className="text-sm text-gray-400 py-6 text-center">Nenhum projeto encontrado.</p>
          ) : (
            <div className="space-y-1">
              {list.map(p => (
                <button key={p.id} onClick={() => onPick(p)} disabled={busy}
                  className={`w-full text-left px-3 py-2 rounded-lg flex items-center gap-2 disabled:opacity-50 ${p.id === currentProjectId ? 'bg-violet-50 dark:bg-violet-900/20 ring-1 ring-violet-300' : 'hover:bg-violet-50 dark:hover:bg-violet-900/20'}`}>
                  <span className="flex-1 text-sm text-gray-800 dark:text-gray-100 truncate">{p.name}</span>
                  {p.status && <span className="text-[10px] text-gray-400 flex-shrink-0">{p.status}</span>}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </Modal>
  )
}

export default ProjectPickerModal
