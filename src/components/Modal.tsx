import { useEffect, useRef, type ReactNode, type MouseEvent } from 'react';
import { createPortal } from 'react-dom';

// Stack global de modais abertos — apenas o topo responde a ESC.
// Sem isso, modais aninhados (ex.: TransactionRulesModal com sub-modal de
// preview retroativo aberto por cima) fechariam todos de uma vez ao
// pressionar Escape.
const modalStack: number[] = [];
let nextModalId = 0;

// Wrapper único de modal — centraliza 4 comportamentos:
//   1. createPortal para document.body — escapa stacking contexts dos pais
//      (transform, filter, overflow:hidden) que faziam o backdrop-blur
//      aparecer "cortado" sobre o header em vários módulos do sistema.
//   2. z-index alto (default z-[10050]) — fica acima do NavigationBar (z-50)
//      E do ImpersonationBanner (z-[10000]).
//   3. Fechar com Escape — listener global de keydown enquanto aberto.
//   4. Fechar com click-outside — comparando e.target === e.currentTarget
//      (sem precisar de stopPropagation no filho).
//
// Adicional: bloqueia scroll do body enquanto aberto (UX padrão de modal).
//
// `destructive=true`: confirmações destrutivas (delete/role-change/confirmar
// transação) bloqueiam ESC e click-outside. Apenas o X (responsabilidade do
// filho) ou os botões de ação fecham. Evita fechar acidentalmente perdendo
// contexto.
//
// O Modal NÃO renderiza o "card" interno — o filho controla 100% do visual
// (cores, tamanho, header, X). Isso facilita migração: o JSX atual do modal
// vai dentro do <Modal> e ganha portal+ESC+click-outside de graça.
export interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Filho que renderiza o card visual. */
  children: ReactNode;
  /** Bloqueia ESC e click-outside. Use para confirmações destrutivas. */
  destructive?: boolean;
  /** Esconde o backdrop com blur (raro — ex.: modais aninhados). */
  noBackdrop?: boolean;
  /** Classe Tailwind do z-index. Default: `z-[10050]`. */
  zIndexClass?: string;
  /** Classes extras no backdrop (ex.: padding diferente, alinhamento). */
  backdropClassName?: string;
  /** Não bloqueia scroll do body. Default: bloqueia. */
  disableScrollLock?: boolean;
  /** aria-labelledby para acessibilidade. */
  ariaLabelledBy?: string;
}

export default function Modal({
  isOpen,
  onClose,
  children,
  destructive = false,
  noBackdrop = false,
  zIndexClass = 'z-[10050]',
  backdropClassName = '',
  disableScrollLock = false,
  ariaLabelledBy,
}: ModalProps) {
  // ESC handler — ativo apenas com modal aberto. Usa stack global para que
  // apenas o modal no topo (mais recente) responda quando há aninhamento.
  const idRef = useRef<number>(0);
  useEffect(() => {
    if (!isOpen) return;
    const id = ++nextModalId;
    idRef.current = id;
    modalStack.push(id);
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      // Só o topo da pilha responde.
      if (modalStack[modalStack.length - 1] !== id) return;
      if (destructive) return;
      e.stopPropagation();
      onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      const idx = modalStack.indexOf(id);
      if (idx !== -1) modalStack.splice(idx, 1);
      window.removeEventListener('keydown', onKey);
    };
  }, [isOpen, destructive, onClose]);

  // Body scroll lock — restaura o overflow original ao desmontar.
  useEffect(() => {
    if (!isOpen || disableScrollLock) return;
    const original = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = original;
    };
  }, [isOpen, disableScrollLock]);

  if (!isOpen) return null;
  if (typeof document === 'undefined') return null;

  const handleBackdropClick = (e: MouseEvent<HTMLDivElement>) => {
    if (destructive) return;
    // target === currentTarget: clique foi no backdrop, não em filho.
    if (e.target === e.currentTarget) onClose();
  };

  const backdropClasses = [
    'fixed inset-0',
    zIndexClass,
    'flex items-center justify-center px-4 py-8',
    noBackdrop ? '' : 'bg-black/40 backdrop-blur-sm',
    backdropClassName,
  ]
    .filter(Boolean)
    .join(' ');

  return createPortal(
    <div
      className={backdropClasses}
      onClick={handleBackdropClick}
      role="dialog"
      aria-modal="true"
      aria-labelledby={ariaLabelledBy}
    >
      {children}
    </div>,
    document.body
  );
}
