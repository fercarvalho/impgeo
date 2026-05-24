import React, { useCallback, useEffect, useState } from 'react'
import { AlertTriangle, CheckCircle2 } from 'lucide-react'
import BulkResolveModal from '@/components/modals/BulkResolveModal'

const API_BASE_URL = '/api'
const POLL_INTERVAL_MS = 45_000

/**
 * Banner exibido no Dashboard e DRE quando há transações pendentes de
 * confirmação. Avisa o usuário que totais financeiros podem estar incompletos
 * porque transações 'A confirmar' não entram em Receita/Despesa.
 *
 * Clicar em "Confirmar agora" abre o BulkResolveModal direto (mesmo do botão
 * em Transações). Após resolver, re-fetcha a contagem; quando zera, o banner
 * some.
 */
const PendingTransactionsBanner: React.FC = () => {
  const [count, setCount] = useState(0)
  const [open, setOpen] = useState(false)

  const refresh = useCallback(async () => {
    try {
      const r = await fetch(`${API_BASE_URL}/transactions/pending`)
      const j = await r.json()
      if (j.success) setCount(j.data?.length || 0)
    } catch {
      // silencioso
    }
  }, [])

  useEffect(() => {
    refresh()
    const t = setInterval(refresh, POLL_INTERVAL_MS)
    const onChanged = () => refresh()
    // Browsers throttle setInterval em background — refetch imediato quando
    // a aba volta a ficar visível ou ganha foco evita banner estagnado.
    const onVisible = () => {
      if (document.visibilityState === 'visible') refresh()
    }
    const onFocus = () => refresh()
    window.addEventListener('impgeo:transactions-changed', onChanged)
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', onFocus)
    return () => {
      clearInterval(t)
      window.removeEventListener('impgeo:transactions-changed', onChanged)
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', onFocus)
    }
  }, [refresh])

  if (count === 0) return null

  return (
    <>
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 p-4 bg-amber-50 dark:bg-amber-900/20 border-l-4 border-amber-500 dark:border-amber-400 rounded-lg shadow-sm mb-4">
        <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5 sm:mt-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-amber-900 dark:text-amber-100">
            {count === 1 ? '1 transação pendente' : `${count} transações pendentes`} de confirmação
          </p>
          <p className="text-xs text-amber-800/80 dark:text-amber-200/80 mt-0.5">
            Resolva agora para que entrem corretamente nos relatórios e totais.
          </p>
        </div>
        <button
          onClick={() => setOpen(true)}
          className="flex items-center gap-2 px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white text-sm font-semibold rounded-lg shadow-sm transition-colors flex-shrink-0"
        >
          <CheckCircle2 className="w-4 h-4" />
          Confirmar agora
        </button>
      </div>

      <BulkResolveModal
        isOpen={open}
        onClose={() => setOpen(false)}
        onResolved={() => { refresh() }}
      />
    </>
  )
}

export default PendingTransactionsBanner
