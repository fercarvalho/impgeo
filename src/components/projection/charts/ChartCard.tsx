import React from 'react'

export type ChartKpiItem = { label: string; value: string }

type Props = {
  title: string
  subtitle?: string
  onEditSection?: () => void
  kpis?: ChartKpiItem[]
  children: React.ReactNode
}

export function ChartCard({ title, subtitle, onEditSection, kpis = [], children }: Props) {
  return (
    <div className="bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden">
      <div className="p-5 border-b border-gray-200">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h3 className="text-lg font-bold text-gray-900 truncate">{title}</h3>
            {subtitle && <p className="text-sm text-gray-600 mt-1">{subtitle}</p>}
          </div>
          {onEditSection && (
            <button
              onClick={onEditSection}
              className="px-3 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 transition-colors flex-shrink-0"
              title="Voltar para tabelas e editar esta seção"
            >
              Editar esta seção
            </button>
          )}
        </div>

        {kpis.length > 0 && (
          <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {kpis.map((k, idx) => (
              <div key={idx} className="bg-gray-50 border border-gray-200 rounded-lg p-3">
                <p className="text-xs font-semibold text-gray-600">{k.label}</p>
                <p className="text-sm font-bold text-gray-900 mt-1">{k.value}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="p-5">{children}</div>
    </div>
  )
}

