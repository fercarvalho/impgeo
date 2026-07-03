import { useCallback, useEffect, useState } from 'react'
import type { Paginated, PageOpts } from './taskApi'

// Hook de lista paginada (melhoria #12). Encapsula {items,total,page,loading,
// error} para uma fetchFn(pageOpts) => Paginated<T>, evitando repetir estado nas
// seções do Tarefas.tsx. `page` é 1-based (bate com o envelope do backend).
export interface PaginatedList<T> {
  items: T[]
  total: number
  page: number
  totalPages: number
  loading: boolean
  error: string | null
  setPage: (p: number) => void
  reload: () => void
}

export function usePaginatedList<T>(
  fetchFn: (page: PageOpts) => Promise<Paginated<T>>,
  limit: number,
): PaginatedList<T> {
  const [items, setItems] = useState<T[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPageState] = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchPage = useCallback(async (p: number) => {
    setLoading(true); setError(null)
    try {
      const res = await fetchFn({ limit, offset: (p - 1) * limit })
      setItems(res.data)
      setTotal(res.pagination?.total ?? res.data.length)
    } catch (e: any) {
      setItems([]); setTotal(0); setError(e?.message || 'Falha ao carregar')
    } finally {
      setLoading(false)
    }
  }, [fetchFn, limit])

  useEffect(() => { fetchPage(page) }, [fetchPage, page])

  const setPage = useCallback((p: number) => setPageState(Math.max(1, p)), [])
  const reload = useCallback(() => fetchPage(page), [fetchPage, page])
  const totalPages = Math.max(1, Math.ceil(total / limit))

  return { items, total, page, totalPages, loading, error, setPage, reload }
}
