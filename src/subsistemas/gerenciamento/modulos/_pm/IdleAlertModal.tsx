import React from 'react'
import Modal from '@/components/Modal'
import { AlertTriangle } from 'lucide-react'

// Alerta grande: usuário com a área de tarefas aberta há 5min sem iniciar nada.
const IdleAlertModal: React.FC<{ onChoose: () => void; onSnooze: () => void; onDismiss: () => void }> = ({ onChoose, onSnooze, onDismiss }) => (
  <Modal isOpen onClose={onDismiss}>
    <div className="bg-white dark:!bg-[#243040] rounded-3xl w-full max-w-md shadow-2xl p-8 text-center">
      <div className="w-16 h-16 rounded-2xl bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center mx-auto mb-4">
        <AlertTriangle className="w-8 h-8 text-amber-600 dark:text-amber-400" />
      </div>
      <h2 className="text-2xl font-extrabold text-gray-900 dark:text-gray-100 mb-2">VOCÊ AINDA NÃO INICIOU NENHUMA TAREFA</h2>
      <p className="text-gray-500 dark:text-gray-400 text-sm mb-6">Que tal iniciar o foco em uma das suas tarefas disponíveis?</p>
      <div className="flex flex-col gap-2">
        <button onClick={onChoose} className="w-full py-3 rounded-xl bg-gradient-to-r from-violet-500 to-indigo-600 text-white font-semibold">
          Escolher uma tarefa
        </button>
        <button onClick={onSnooze} className="w-full py-2 rounded-xl bg-gray-100 dark:!bg-[#2d3f52] text-gray-700 dark:text-gray-200 text-sm font-medium">
          Ignorar por 30 min
        </button>
        <button onClick={onDismiss} className="w-full py-2 text-gray-400 text-sm">Dispensar</button>
      </div>
    </div>
  </Modal>
)

export default IdleAlertModal
