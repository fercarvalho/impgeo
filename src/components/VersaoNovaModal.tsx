import React, { useEffect, useState } from 'react';
import { Sparkles, X, ChevronLeft, ChevronRight } from 'lucide-react';

export interface VersaoItem {
  versao: string;
  texto: string;
}

interface Props {
  versoes: VersaoItem[];
  onConfirm: (versao: string) => void | Promise<void>;
  onClose: () => void;
}

const VersaoNovaModal: React.FC<Props> = ({ versoes, onConfirm, onClose }) => {
  const [index, setIndex] = useState(0);
  const [pendentes, setPendentes] = useState<VersaoItem[]>(versoes);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  if (pendentes.length === 0) return null;

  const atual = pendentes[index];
  const total = pendentes.length;

  const handleEntendido = async () => {
    await onConfirm(atual.versao);
    const novas = pendentes.filter((_, i) => i !== index);
    if (novas.length === 0) {
      onClose();
      return;
    }
    setPendentes(novas);
    setIndex(i => Math.min(i, novas.length - 1));
  };

  const irPara = (delta: number) => {
    setIndex(i => Math.max(0, Math.min(total - 1, i + delta)));
  };

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
                <p className="text-white/80 text-xs font-medium uppercase tracking-wide">
                  {total > 1 ? `Novidades disponíveis (${index + 1} de ${total})` : 'Novidade disponível'}
                </p>
                <h2 className="text-white text-xl font-bold leading-tight">Versão {atual.versao}</h2>
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
          <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 min-h-[80px]">
            <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-line">{atual.texto}</p>
          </div>
          <p className="text-xs text-gray-400 mt-3">
            Confira as notas completas clicando na versão no rodapé do sistema.
          </p>

          {total > 1 && (
            <div className="flex items-center justify-center gap-2 mt-4">
              {pendentes.map((_, i) => (
                <span
                  key={i}
                  className={`h-1.5 rounded-full transition-all ${i === index ? 'w-6 bg-blue-600' : 'w-1.5 bg-gray-300'}`}
                />
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 pb-5 flex items-center justify-between gap-3">
          <div className="flex items-center gap-1">
            {total > 1 && (
              <>
                <button
                  onClick={() => irPara(-1)}
                  disabled={index === 0}
                  className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  aria-label="Anterior"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button
                  onClick={() => irPara(1)}
                  disabled={index === total - 1}
                  className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  aria-label="Próximo"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </>
            )}
          </div>
          <button onClick={handleEntendido}
            className="px-5 py-2 text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors">
            Entendido!
          </button>
        </div>
      </div>
    </div>
  );
};

export default VersaoNovaModal;
