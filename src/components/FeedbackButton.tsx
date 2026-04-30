import React, { useState } from 'react';
import { MessageSquarePlus } from 'lucide-react';
import FeedbackModal from './FeedbackModal';

interface FeedbackButtonProps {
  paginaAtual?: string;
}

const FeedbackButton: React.FC<FeedbackButtonProps> = ({ paginaAtual }) => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <div className="fixed bottom-6 right-6 z-40 group">
        <button
          onClick={() => setIsOpen(true)}
          className="relative flex items-center justify-center w-14 h-14 bg-gradient-to-br from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 text-white rounded-full shadow-lg shadow-blue-500/30 hover:shadow-xl hover:shadow-blue-500/40 transition-all duration-200 hover:-translate-y-1 active:translate-y-0"
          aria-label="Enviar feedback"
        >
          <MessageSquarePlus className="w-6 h-6" />
          <span className="absolute inset-0 rounded-full bg-blue-400 opacity-30 animate-ping" />
        </button>
        <div className="absolute right-16 top-1/2 -translate-y-1/2 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-200 whitespace-nowrap">
          <div className="bg-gray-800 text-white text-xs font-medium px-3 py-1.5 rounded-lg shadow-lg">
            Enviar feedback
            <div className="absolute right-[-6px] top-1/2 -translate-y-1/2 border-4 border-transparent border-l-gray-800" />
          </div>
        </div>
      </div>

      <FeedbackModal
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        paginaAtual={paginaAtual}
      />
    </>
  );
};

export default FeedbackButton;
