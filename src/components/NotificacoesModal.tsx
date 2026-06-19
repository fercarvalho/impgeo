import React from 'react';
import { Bell, X } from 'lucide-react';
import Modal from './Modal';
import NotificationPreferencesSection from './NotificationPreferencesSection';

// Central de notificações do usuário (separada do Editar Perfil). NÃO exige
// senha — cada preferência é salva por toggle pela própria seção (sua própria API).
const NotificacoesModal: React.FC<{ isOpen: boolean; onClose: () => void }> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;
  return (
    <Modal isOpen={isOpen} onClose={onClose}>
      <div className="bg-white dark:!bg-[#243040] rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden max-h-[85vh] flex flex-col">
        <div className="bg-gradient-to-r from-blue-500 to-indigo-600 px-5 py-3 flex items-center justify-between flex-shrink-0">
          <h3 className="text-white font-bold flex items-center gap-2"><Bell className="w-4 h-4" /> Notificações</h3>
          <button onClick={onClose} className="text-white/80 hover:text-white" aria-label="Fechar"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-5 overflow-y-auto">
          <NotificationPreferencesSection scope="impgeo" />
        </div>
      </div>
    </Modal>
  );
};

export default NotificacoesModal;
