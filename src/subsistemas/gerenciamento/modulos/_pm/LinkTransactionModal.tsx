import React, { useEffect, useState } from 'react'
import Modal from '@/components/Modal'
import { Link2, X, Loader2 } from 'lucide-react'

interface Tx { id: string; date: string; description: string | null; value: number; type: string }

const fmtBRL = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0)

// Vincula uma despesa (transação) ao projeto. O custo recalcula via trigger.
const LinkTransactionModal: React.FC<{ projectId: string; onClose: () => void; onDone: () => void }> = ({ projectId, onClose, onDone }) => {
  const [txs, setTxs] = useState<Tx[]>([])
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/pm/unlinked-transactions')
      .then(r => r.json())
      .then(j => { if (j.success) setTxs(j.data) })
      .catch(() => setError('Falha ao carregar despesas'))
      .finally(() => setLoading(false))
  }, [])

  const link = async (txId: string) => {
    setBusyId(txId); setError(null)
    try {
      const r = await fetch(`/api/transactions/${txId}/link-project`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId }),
      })
      const j = await r.json()
      if (!j.success) throw new Error(j.error || 'Falha ao vincular')
      setTxs(prev => prev.filter(t => t.id !== txId))
      onDone()
    } catch (e: any) { setError(e.message) } finally { setBusyId(null) }
  }

  return (
    <Modal isOpen onClose={onClose}>
      <div className="bg-white dark:!bg-[#243040] rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden max-h-[85vh] flex flex-col">
        <div className="bg-gradient-to-r from-violet-500 to-indigo-600 px-5 py-3 flex items-center justify-between flex-shrink-0">
          <h3 className="text-white font-bold flex items-center gap-2"><Link2 className="w-4 h-4" /> Vincular despesa ao projeto</h3>
          <button onClick={onClose} className="text-white/80 hover:text-white"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-5 overflow-y-auto">
          {error && <div className="text-sm text-red-600 dark:text-red-400 mb-2">{error}</div>}
          {loading ? (
            <div className="flex items-center justify-center py-8 text-gray-400"><Loader2 className="w-6 h-6 animate-spin" /></div>
          ) : txs.length === 0 ? (
            <p className="text-sm text-gray-400 py-6 text-center">Nenhuma despesa não-vinculada encontrada.</p>
          ) : (
            <div className="space-y-2">
              {txs.map(t => (
                <div key={t.id} className="flex items-center gap-3 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2">
                  <div className="min-w-0 flex-1">
                    <div className="text-sm text-gray-800 dark:text-gray-100 truncate">{t.description || '(sem descrição)'}</div>
                    <div className="text-xs text-gray-400">{t.date} · <span className="text-red-600 dark:text-red-400">{fmtBRL(t.value)}</span></div>
                  </div>
                  <button onClick={() => link(t.id)} disabled={busyId === t.id}
                    className="px-3 py-1.5 rounded-lg bg-violet-600 hover:bg-violet-700 text-white text-xs font-semibold disabled:opacity-50 flex items-center gap-1">
                    {busyId === t.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Link2 className="w-3.5 h-3.5" />} Vincular
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </Modal>
  )
}

export default LinkTransactionModal
