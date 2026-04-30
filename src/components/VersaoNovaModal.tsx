import React, { useEffect } from 'react';
import { Sparkles, X } from 'lucide-react';

interface Props {
  versao: string;
  texto: string;
  onClose: () => void;
}

const VersaoNovaModal: React.FC<Props> = ({ versao, texto, onClose }) => {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 bg-gradient-to-br from-blue-900/50 to-indigo-900/50 backdrop-blur-sm flex items-center justify-center z-50 px-4 pb-4 pt-[120px]"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl shadow-2xl w-full max-w-md"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-600 to-indigo-600 rounded-t-xl px-6 py-5 relative overflow-hidden">
          <div className="absolute -top-4 -right-4 w-24 h-24 bg-white/10 rounded-full" />
          <div className="absolute -bottom-6 -right-8 w-32 h-32 bg-white/5 rounded-full" />
          <div className="relative flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-white/20 rounded-lg">
                <Sparkles className="w-5 h-5 text-white" />
              </div>
              <div>
                <p className="text-white/80 text-xs font-medium uppercase tracking-wide">Novidade disponível</p>
                <h2 className="text-white text-xl font-bold leading-tight">Versão {versao}</h2>
              </div>
            </div>
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/20 text-white/70 hover:text-white transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="px-6 py-5">
          <p className="text-sm font-medium text-gray-700 mb-2">O que há de novo:</p>
          <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-3">
            <p className="text-sm text-gray-700 leading-relaxed">{texto}</p>
          </div>
          <p className="text-xs text-gray-400 mt-3">
            Confira as notas completas clicando na versão no rodapé do sistema.
          </p>
        </div>

        {/* Footer */}
        <div className="px-6 pb-5 flex justify-end">
          <button onClick={onClose}
            className="px-5 py-2 text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors">
            Entendido!
          </button>
        </div>
      </div>
    </div>
  );
};

export default VersaoNovaModal;
