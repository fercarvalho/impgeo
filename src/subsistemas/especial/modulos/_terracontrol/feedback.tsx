// Sistema leve de feedback que substitui as ~30 chamadas a alert()/window.confirm()
// dentro do TerraControl (G4.3). Vantagens:
//   - Dark mode aware (usa as classes do Tailwind)
//   - Estilo coerente com o resto do app (cantos arredondados, sombras, transição)
//   - Não bloqueia o thread principal (alert nativo bloqueia)
//   - confirm() retorna Promise<boolean>, compatível com async/await
//
// API:
//   const { notify, confirm, FeedbackHost } = useFeedback()
//   notify('Operação concluída', { type: 'success' })
//   const ok = await confirm('Tem certeza?')
//
// FeedbackHost é renderizado em algum lugar da árvore (uma vez por componente)
// e exibe os toasts/dialogs ativos.

import React, { useCallback, useRef, useState } from 'react'
import { CheckCircle2, AlertTriangle, Info, X, XCircle } from 'lucide-react'
import Modal from '@/components/Modal'

export type ToastType = 'info' | 'success' | 'warning' | 'error'

interface Toast {
  id: number
  message: string
  type: ToastType
}

interface ConfirmState {
  id: number
  message: string
  title?: string
  confirmLabel?: string
  cancelLabel?: string
  variant?: 'danger' | 'default'
  resolve: (ok: boolean) => void
}

let _seq = 0
const nextId = () => ++_seq

const TOAST_DURATION_MS = 4500

interface NotifyOptions {
  type?: ToastType
  durationMs?: number
}

interface ConfirmOptions {
  title?: string
  confirmLabel?: string
  cancelLabel?: string
  variant?: 'danger' | 'default'
}

export function useFeedback() {
  const [toasts, setToasts] = useState<Toast[]>([])
  const [confirmDialog, setConfirmDialog] = useState<ConfirmState | null>(null)
  const timersRef = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map())

  const removeToast = useCallback((id: number) => {
    setToasts(prev => prev.filter(t => t.id !== id))
    const timer = timersRef.current.get(id)
    if (timer) {
      clearTimeout(timer)
      timersRef.current.delete(id)
    }
  }, [])

  const notify = useCallback((message: string, options: NotifyOptions = {}) => {
    const id = nextId()
    const type = options.type ?? 'info'
    const duration = options.durationMs ?? TOAST_DURATION_MS
    setToasts(prev => [...prev, { id, message, type }])
    const timer = setTimeout(() => removeToast(id), duration)
    timersRef.current.set(id, timer)
    return id
  }, [removeToast])

  const confirm = useCallback((message: string, options: ConfirmOptions = {}): Promise<boolean> => {
    return new Promise(resolve => {
      setConfirmDialog({
        id: nextId(),
        message,
        title: options.title,
        confirmLabel: options.confirmLabel,
        cancelLabel: options.cancelLabel,
        variant: options.variant,
        resolve,
      })
    })
  }, [])

  const closeConfirm = useCallback((ok: boolean) => {
    setConfirmDialog(current => {
      if (current) current.resolve(ok)
      return null
    })
  }, [])

  const FeedbackHost = useCallback(() => (
    <>
      {/* Toasts empilhados no canto superior direito */}
      <div className="fixed top-4 right-4 z-[100] flex flex-col gap-2 pointer-events-none">
        {toasts.map(t => (
          <ToastView key={t.id} toast={t} onDismiss={() => removeToast(t.id)} />
        ))}
      </div>

      {/* Dialog de confirmação (centralizado, com backdrop) */}
      {confirmDialog && (
        <ConfirmDialogView state={confirmDialog} onResult={closeConfirm} />
      )}
    </>
  ), [toasts, confirmDialog, removeToast, closeConfirm])

  return { notify, confirm, FeedbackHost }
}

// --------------------------------------------------------------------------
// Componentes visuais — privados ao módulo. Mantidos no mesmo arquivo para
// não inflar a árvore de imports do componente consumidor.
// --------------------------------------------------------------------------

const TOAST_STYLES: Record<ToastType, { container: string; icon: JSX.Element; iconBg: string }> = {
  info:    { container: 'border-blue-200 dark:border-blue-800',     iconBg: 'bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400',     icon: <Info        className="w-5 h-5" /> },
  success: { container: 'border-green-200 dark:border-green-800',   iconBg: 'bg-green-100 dark:bg-green-900/40 text-green-600 dark:text-green-400', icon: <CheckCircle2 className="w-5 h-5" /> },
  warning: { container: 'border-amber-200 dark:border-amber-800',   iconBg: 'bg-amber-100 dark:bg-amber-900/40 text-amber-600 dark:text-amber-400', icon: <AlertTriangle className="w-5 h-5" /> },
  error:   { container: 'border-red-200 dark:border-red-800',       iconBg: 'bg-red-100 dark:bg-red-900/40 text-red-600 dark:text-red-400',         icon: <XCircle     className="w-5 h-5" /> },
}

interface ToastViewProps {
  toast: Toast
  onDismiss: () => void
}

const ToastView: React.FC<ToastViewProps> = ({ toast, onDismiss }) => {
  const styles = TOAST_STYLES[toast.type]
  return (
    <div
      role={toast.type === 'error' ? 'alert' : 'status'}
      className={`pointer-events-auto bg-white dark:bg-[#243040] border rounded-xl shadow-lg p-3 pr-2 flex items-start gap-3 min-w-[260px] max-w-md animate-in slide-in-from-right duration-200 ${styles.container}`}
    >
      <div className={`p-1.5 rounded-lg shrink-0 ${styles.iconBg}`}>{styles.icon}</div>
      <p className="flex-1 text-sm text-gray-800 dark:text-gray-100 leading-snug whitespace-pre-line">{toast.message}</p>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Fechar notificação"
        className="text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors shrink-0 p-1 -mt-1"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  )
}

interface ConfirmDialogViewProps {
  state: ConfirmState
  onResult: (ok: boolean) => void
}

const ConfirmDialogView: React.FC<ConfirmDialogViewProps> = ({ state, onResult }) => {
  const isDanger = state.variant === 'danger'
  return (
    // Usa o <Modal> compartilhado: portal pra document.body (o antigo
    // `fixed inset-0` renderizava DENTRO do stacking context do modal-pai —
    // ex.: o painel de usuários — e o backdrop-blur saía cortado numa faixa
    // no topo) + z-[10060], acima de qualquer <Modal> (z-[10050]) já aberto,
    // então o confirm sempre fica NA FRENTE de quem o abriu. ESC/click-outside
    // = cancelar (resolve false).
    <Modal isOpen onClose={() => onResult(false)} zIndexClass="z-[10060]">
      <div className="bg-white dark:bg-[#243040] rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-150">
        <div className="p-6">
          <div className="flex items-start gap-3 mb-3">
            <div className={`p-2 rounded-lg shrink-0 ${isDanger ? 'bg-red-100 dark:bg-red-900/40 text-red-600 dark:text-red-400' : 'bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400'}`}>
              {isDanger ? <AlertTriangle className="w-5 h-5" /> : <Info className="w-5 h-5" />}
            </div>
            <div className="flex-1">
              {state.title && (
                <h3 className="text-base font-bold text-gray-900 dark:text-gray-100 mb-1">{state.title}</h3>
              )}
              <p className="text-sm text-gray-700 dark:text-gray-300 leading-snug whitespace-pre-line">{state.message}</p>
            </div>
          </div>

          <div className="flex justify-end gap-2 mt-5">
            <button
              type="button"
              onClick={() => onResult(false)}
              className="px-4 py-2 rounded-xl bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 text-sm font-semibold hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
            >
              {state.cancelLabel ?? 'Cancelar'}
            </button>
            <button
              type="button"
              onClick={() => onResult(true)}
              autoFocus
              className={`px-4 py-2 rounded-xl text-white text-sm font-semibold transition-colors shadow-sm ${
                isDanger
                  ? 'bg-red-600 hover:bg-red-700'
                  : 'bg-blue-600 hover:bg-blue-700'
              }`}
            >
              {state.confirmLabel ?? 'Confirmar'}
            </button>
          </div>
        </div>
      </div>
    </Modal>
  )
}
