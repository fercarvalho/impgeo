import React, { createContext, useCallback, useContext, useRef, useState } from 'react'
import Modal from '@/components/Modal'
import { AlertTriangle, CheckCircle2, Info, X } from 'lucide-react'

// ─────────────────────────────────────────────────────────────────────────────
// DialogProvider — substitui os avisos nativos do navegador (window.confirm/
// alert/prompt) por modais consistentes com o resto do sistema (portal, ESC,
// click-outside, dark mode), via uma API imperativa baseada em Promise:
//
//   const { confirm, alert, prompt } = useDialogs()
//   if (await confirm({ message: 'Excluir?', destructive: true })) { ... }
//   const motivo = await prompt({ title: 'Motivo da recusa', required: true })
//   await alert({ message: 'Importado!', variant: 'success' })
//
// Um único diálogo ativo por vez (ações são iniciadas pelo usuário, nunca
// concorrentes). A Promise resolve quando o usuário decide.
// ─────────────────────────────────────────────────────────────────────────────

type Variant = 'info' | 'success' | 'error'

export interface ConfirmOptions {
  title?: string
  message: React.ReactNode
  confirmLabel?: string
  cancelLabel?: string
  /** Bloqueia ESC/click-outside e pinta o botão de vermelho (exclusões). */
  destructive?: boolean
}
export interface AlertOptions {
  title?: string
  message: React.ReactNode
  confirmLabel?: string
  variant?: Variant
}
export interface PromptOptions {
  title?: string
  message?: React.ReactNode
  label?: string
  defaultValue?: string
  placeholder?: string
  multiline?: boolean
  required?: boolean
  confirmLabel?: string
  cancelLabel?: string
}

interface DialogContextValue {
  confirm: (opts: ConfirmOptions) => Promise<boolean>
  alert: (opts: AlertOptions) => Promise<void>
  prompt: (opts: PromptOptions) => Promise<string | null>
}

const DialogContext = createContext<DialogContextValue | null>(null)

type ActiveDialog =
  | { kind: 'confirm'; opts: ConfirmOptions; resolve: (v: boolean) => void }
  | { kind: 'alert'; opts: AlertOptions; resolve: () => void }
  | { kind: 'prompt'; opts: PromptOptions; resolve: (v: string | null) => void }

const variantStyle: Record<Variant, { grad: string; Icon: typeof Info }> = {
  info: { grad: 'from-sky-500 to-blue-600', Icon: Info },
  success: { grad: 'from-emerald-500 to-green-600', Icon: CheckCircle2 },
  error: { grad: 'from-rose-500 to-red-600', Icon: AlertTriangle },
}

export const DialogProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [active, setActive] = useState<ActiveDialog | null>(null)
  const [promptValue, setPromptValue] = useState('')
  // Guarda para não resolver duas vezes a mesma Promise.
  const settledRef = useRef(false)

  const open = useCallback((d: ActiveDialog, initialPrompt = '') => {
    settledRef.current = false
    setPromptValue(initialPrompt)
    setActive(d)
  }, [])

  const confirm = useCallback((opts: ConfirmOptions) => new Promise<boolean>((resolve) => {
    open({ kind: 'confirm', opts, resolve })
  }), [open])

  const alert = useCallback((opts: AlertOptions) => new Promise<void>((resolve) => {
    open({ kind: 'alert', opts, resolve })
  }), [open])

  const prompt = useCallback((opts: PromptOptions) => new Promise<string | null>((resolve) => {
    open({ kind: 'prompt', opts, resolve }, opts.defaultValue ?? '')
  }), [open])

  const settle = useCallback((fn: () => void) => {
    if (settledRef.current) return
    settledRef.current = true
    fn()
    setActive(null)
  }, [])

  const handleCancel = useCallback(() => {
    if (!active) return
    settle(() => {
      if (active.kind === 'confirm') active.resolve(false)
      else if (active.kind === 'prompt') active.resolve(null)
      else active.resolve()
    })
  }, [active, settle])

  const handleConfirm = useCallback(() => {
    if (!active) return
    if (active.kind === 'prompt') {
      const v = promptValue.trim()
      if (active.opts.required && !v) return // exige valor
      settle(() => active.resolve(promptValue))
    } else if (active.kind === 'confirm') {
      settle(() => active.resolve(true))
    } else {
      settle(() => active.resolve())
    }
  }, [active, promptValue, settle])

  const ctx: DialogContextValue = { confirm, alert, prompt }

  return (
    <DialogContext.Provider value={ctx}>
      {children}
      {active && (
        <Modal
          isOpen
          onClose={handleCancel}
          destructive={active.kind === 'confirm' && !!active.opts.destructive}
        >
          <DialogCard
            active={active}
            promptValue={promptValue}
            setPromptValue={setPromptValue}
            onCancel={handleCancel}
            onConfirm={handleConfirm}
          />
        </Modal>
      )}
    </DialogContext.Provider>
  )
}

const DialogCard: React.FC<{
  active: ActiveDialog
  promptValue: string
  setPromptValue: (v: string) => void
  onCancel: () => void
  onConfirm: () => void
}> = ({ active, promptValue, setPromptValue, onCancel, onConfirm }) => {
  const variant: Variant = active.kind === 'alert' ? (active.opts.variant ?? 'info') : (active.kind === 'confirm' && active.opts.destructive ? 'error' : 'info')
  const { grad, Icon } = variantStyle[variant]
  const title = active.opts.title ?? (active.kind === 'confirm' ? 'Confirmação' : active.kind === 'alert' ? 'Aviso' : '')
  const showCancel = active.kind !== 'alert'
  const confirmLabel = active.opts.confirmLabel ?? (active.kind === 'alert' ? 'OK' : 'Confirmar')
  const cancelLabel = (active.kind === 'confirm' || active.kind === 'prompt') ? (active.opts.cancelLabel ?? 'Cancelar') : 'Cancelar'
  const confirmTone = active.kind === 'confirm' && active.opts.destructive
    ? 'from-rose-500 to-red-600'
    : 'from-blue-500 to-indigo-600'

  return (
    <div className="bg-white dark:!bg-[#243040] rounded-2xl w-full max-w-md shadow-2xl overflow-hidden">
      <div className={`bg-gradient-to-r ${grad} px-5 py-3 flex items-center justify-between`}>
        <h3 className="text-white font-bold flex items-center gap-2"><Icon className="w-4 h-4" /> {title}</h3>
        <button onClick={onCancel} className="text-white/80 hover:text-white"><X className="w-5 h-5" /></button>
      </div>
      <div className="p-5 space-y-3">
        {active.kind !== 'prompt' && (
          <div className="text-sm text-gray-700 dark:text-gray-200 whitespace-pre-line">{active.opts.message}</div>
        )}
        {active.kind === 'prompt' && (
          <>
            {active.opts.message && <div className="text-sm text-gray-600 dark:text-gray-300">{active.opts.message}</div>}
            {active.opts.label && <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">{active.opts.label}</label>}
            {active.opts.multiline ? (
              <textarea
                autoFocus rows={3} value={promptValue} placeholder={active.opts.placeholder}
                onChange={e => setPromptValue(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 dark:text-gray-100 text-sm"
              />
            ) : (
              <input
                autoFocus type="text" value={promptValue} placeholder={active.opts.placeholder}
                onChange={e => setPromptValue(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') onConfirm() }}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 dark:text-gray-100 text-sm"
              />
            )}
          </>
        )}
        <div className="flex justify-end gap-2 pt-1">
          {showCancel && (
            <button onClick={onCancel} className="px-4 py-2 rounded-xl bg-gray-100 dark:!bg-[#2d3f52] text-gray-700 dark:text-gray-200 text-sm font-medium">{cancelLabel}</button>
          )}
          <button onClick={onConfirm} className={`px-4 py-2 rounded-xl bg-gradient-to-r ${confirmTone} text-white text-sm font-semibold`}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  )
}

export function useDialogs(): DialogContextValue {
  const ctx = useContext(DialogContext)
  if (!ctx) throw new Error('useDialogs deve ser usado dentro de <DialogProvider>')
  return ctx
}
