// Tela de sucesso pós-pagamento. Aparece após o polling do
// TcBudgetPaymentScreen detectar status='paid'.
//
// Sem fetch próprio — recebe dados mínimos via props.

import React from 'react'
import { CheckCircle2, ArrowLeft } from 'lucide-react'

interface Props {
  imovel?: string | null
  municipio?: string | null
  onBackToList: () => void
}

const TcBudgetPaidScreen: React.FC<Props> = ({ imovel, municipio, onBackToList }) => {
  return (
    <div className="max-w-md mx-auto px-4 py-12 text-center">
      <div className="bg-white dark:!bg-[#243040] rounded-2xl shadow-lg border border-gray-200 dark:border-gray-700 p-8 space-y-5">
        <div className="w-16 h-16 mx-auto rounded-full bg-gradient-to-br from-tc-green to-tc-blue flex items-center justify-center">
          <CheckCircle2 className="w-8 h-8 text-white" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">
            Pagamento confirmado!
          </h2>
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
            Seu imóvel <strong>{imovel || 'TerraControl'}</strong>
            {municipio ? <> em <strong>{municipio}</strong></> : null} já está aprovado e disponível no sistema.
          </p>
        </div>
        <button
          onClick={onBackToList}
          className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-gradient-to-r from-tc-green to-tc-blue text-white text-sm font-bold hover:from-tc-green-dark hover:to-tc-blue-dark"
        >
          <ArrowLeft className="w-4 h-4" /> Voltar aos meus imóveis
        </button>
        <p className="text-[11px] text-gray-400 dark:text-gray-500">
          Um e-mail de confirmação foi enviado.
        </p>
      </div>
    </div>
  )
}

export default TcBudgetPaidScreen
