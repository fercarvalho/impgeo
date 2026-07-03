import React from 'react'

// Controles de paginação reutilizáveis (melhoria #12). Neutro + dark mode;
// cada seção tem seu próprio acento, então a paginação fica discreta.
// `page` é 1-based (bate com o envelope `pagination` do backend).
interface PaginationProps {
  page: number
  totalPages: number
  total: number
  onPage: (p: number) => void
  disabled?: boolean
}

const Pagination: React.FC<PaginationProps> = ({ page, totalPages, total, onPage, disabled }) => {
  if (totalPages <= 1) return null
  const btn = 'px-3 py-1.5 text-sm border border-gray-200 dark:border-gray-700 rounded-lg ' +
    'disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-50 dark:hover:bg-gray-800 ' +
    'text-gray-600 dark:text-gray-300 transition-colors'
  return (
    <div className="flex items-center justify-center gap-4 mt-3">
      <button type="button" onClick={() => onPage(page - 1)} disabled={disabled || page <= 1} className={btn}>
        ← Anterior
      </button>
      <span className="text-sm text-gray-500 dark:text-gray-400">
        Página {page} de {totalPages}
        <span className="hidden sm:inline"> · {total} no total</span>
      </span>
      <button type="button" onClick={() => onPage(page + 1)} disabled={disabled || page >= totalPages} className={btn}>
        Próxima →
      </button>
    </div>
  )
}

export default Pagination
