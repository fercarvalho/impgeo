import React, { useEffect, useRef, useState } from 'react';
import { Sparkles, X, ChevronLeft, ChevronRight } from 'lucide-react';

export interface VersaoItem {
  versao: string;
  texto: string;
  tipo?: 'versao' | 'aviso';
  versaoReferencia?: string;
}

interface Props {
  versoes: VersaoItem[];
  onConfirm: (versao: string) => void | Promise<void>;
  onClose: () => void;
}

const VersaoNovaModal: React.FC<Props> = ({ versoes, onConfirm, onClose }) => {
  const [index, setIndex] = useState(0);
  const [pendentes, setPendentes] = useState<VersaoItem[]>(versoes);
  const [confirming, setConfirming] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);

  // Sincroniza pendentes quando a prop versoes mudar
  useEffect(() => {
    setPendentes(versoes);
    setIndex(0);
  }, [versoes]);

  // Move o foco para o modal ao montar
  useEffect(() => {
    if (dialogRef.current) {
      dialogRef.current.focus();
    }
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !confirming) onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose, confirming]);

  if (pendentes.length === 0) return null;

  // Garante que o índice é sempre válido
  const safeIndex = Math.min(index, pendentes.length - 1);
  const atual = pendentes[safeIndex];
  const total = pendentes.length;

  if (!atual) return null;

  const headerTitle = () => {
    if (atual.tipo === 'aviso') {
      const ref = atual.versaoReferencia?.trim();
      return ref ? `Atualização em ${ref}` : 'Atualização disponível';
    }
    return `Versão ${atual.versao}`;
  };

  const handleEntendido = async () => {
    if (confirming) return;
    setConfirming(true);
    let mounted = true;
    try {
      await onConfirm(atual.versao);
      const novas = pendentes.filter((_, i) => i !== safeIndex);
      if (novas.length === 0) {
        mounted = false;
        onClose();
        return;
      }
      if (mounted) {
        setPendentes(novas);
        setIndex(i => Math.min(i, novas.length - 1));
      }
    } catch (err: unknown) {
      console.error('Erro ao confirmar versão:', err);
    } finally {
      if (mounted) setConfirming(false);
    }
  };

  const irPara = (delta: number) => {
    setIndex(i => Math.max(0, Math.min(total - 1, i + delta)));
  };

  return (
    <div
      className="fixed inset-0 bg-gradient-to-br from-blue-900/50 to-indigo-900/50 backdrop-blur-sm flex items-center justify-center z-50 px-4 py-8"
      onClick={() => { if (!confirming) onClose(); }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="versao-modal-title"
        tabIndex={-1}
        className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-md outline-none"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-600 to-indigo-600 rounded-t-xl px-6 py-5 relative overflow-hidden">
          <div className="absolute -top-4 -right-4 w-24 h-24 bg-white/10 rounded-full" />
          <div className="absolute -bottom-6 -right-8 w-32 h-32 bg-white/5 rounded-full" />
          <div className="relative flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-white/20 rounded-lg">
                <Sparkles className="w-5 h-5 text-white" aria-hidden="true" />
              </div>
              <div>
                <p className="text-white/80 text-xs font-medium uppercase tracking-wide">
                  {total > 1 ? `Novidades disponíveis (${safeIndex + 1} de ${total})` : 'Novidade disponível'}
                </p>
                <h2 id="versao-modal-title" className="text-white text-xl font-bold leading-tight">
                  {headerTitle()}
                </h2>
              </div>
            </div>
            <button
              onClick={() => { if (!confirming) onClose(); }}
              className="p-1.5 rounded-lg hover:bg-white/20 text-white/70 hover:text-white transition-colors"
              aria-label="Fechar modal"
              disabled={confirming}
            >
              <X className="w-4 h-4" aria-hidden="true" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="px-6 py-5">
          <p className="text-sm font-medium text-gray-700 dark:text-gray-200 mb-2">O que há de novo:</p>
          <div
            aria-live="polite"
            aria-atomic="true"
            className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700 rounded-lg px-4 py-3 min-h-[80px]"
          >
            <p className="text-sm text-gray-700 dark:text-gray-200 leading-relaxed whitespace-pre-line">{atual.texto}</p>
          </div>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-3">
            Confira as notas completas clicando na versão no rodapé do sistema.
          </p>

          {total > 1 && (
            <div className="flex items-center justify-center gap-2 mt-4">
              {pendentes.map((v, i) => (
                <span
                  key={`${v.versao}-${i}`}
                  className={`h-1.5 rounded-full transition-all ${i === safeIndex ? 'w-6 bg-blue-600' : 'w-1.5 bg-gray-300 dark:bg-gray-600'}`}
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
                  disabled={safeIndex === 0 || confirming}
                  className="p-2 rounded-lg text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  aria-label="Anterior"
                >
                  <ChevronLeft className="w-4 h-4" aria-hidden="true" />
                </button>
                <button
                  onClick={() => irPara(1)}
                  disabled={safeIndex === total - 1 || confirming}
                  className="p-2 rounded-lg text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  aria-label="Próximo"
                >
                  <ChevronRight className="w-4 h-4" aria-hidden="true" />
                </button>
              </>
            )}
          </div>
          <button
            onClick={handleEntendido}
            disabled={confirming}
            aria-busy={confirming}
            className="px-5 py-2 text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors disabled:opacity-60 flex items-center gap-2"
          >
            {confirming ? (
              <>
                <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" aria-hidden="true" />
                Confirmando...
              </>
            ) : (
              'Entendido!'
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default VersaoNovaModal;
