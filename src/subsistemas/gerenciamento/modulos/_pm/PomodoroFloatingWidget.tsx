import React, { useCallback, useEffect, useRef, useState } from 'react'
import Modal from '@/components/Modal'
import { Pause, Play, Square, Coffee, Loader2, GripVertical, Timer } from 'lucide-react'
import { useActiveSession, sessionAction, fmtClock, notifyPomodoroChanged } from './pomodoroApi'

const POS_KEY = 'pm-pomodoro-widget-pos'

// Widget flutuante global do Pomodoro. Montado em App.tsx; aparece quando há
// sessão ativa. Durante a pausa obrigatória vira o modal grande "VÁ DESCANSAR".
const PomodoroFloatingWidget: React.FC = () => {
  const { session, refetch, remainingActive, remainingBreak } = useActiveSession()
  const [busy, setBusy] = useState(false)
  const transitioningRef = useRef(false)

  // Posição (arrastável, persistida).
  const [pos, setPos] = useState<{ x: number; y: number }>(() => {
    try { const p = localStorage.getItem(POS_KEY); if (p) return JSON.parse(p) } catch { /* noop */ }
    return { x: window.innerWidth - 320, y: window.innerHeight - 180 }
  })
  const dragRef = useRef<{ dx: number; dy: number } | null>(null)
  const onPointerDown = (e: React.PointerEvent) => {
    dragRef.current = { dx: e.clientX - pos.x, dy: e.clientY - pos.y }
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
  }
  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragRef.current) return
    const x = Math.max(0, Math.min(window.innerWidth - 280, e.clientX - dragRef.current.dx))
    const y = Math.max(0, Math.min(window.innerHeight - 120, e.clientY - dragRef.current.dy))
    setPos({ x, y })
  }
  const onPointerUp = () => {
    if (dragRef.current) { try { localStorage.setItem(POS_KEY, JSON.stringify(pos)) } catch { /* noop */ } }
    dragRef.current = null
  }

  const act = useCallback(async (action: string, body?: any) => {
    if (!session) return
    setBusy(true)
    try { await sessionAction(session.id, action, body); await refetch(); notifyPomodoroChanged() }
    catch { /* erros raros; reconciliação cuida */ }
    finally { setBusy(false) }
  }, [session, refetch])

  // Auto: tempo ativo acabou → entra em pausa (complete).
  useEffect(() => {
    if (!session || session.state !== 'running') return
    if (remainingActive <= 0 && !transitioningRef.current) {
      transitioningRef.current = true
      act('complete').finally(() => { transitioningRef.current = false })
    }
  }, [session, remainingActive, act])

  // Auto: pausa acabou → encerra (finish-break).
  useEffect(() => {
    if (!session || session.state !== 'break') return
    if (remainingBreak != null && remainingBreak <= 0 && !transitioningRef.current) {
      transitioningRef.current = true
      act('finish-break').finally(() => { transitioningRef.current = false })
    }
  }, [session, remainingBreak, act])

  if (!session || !['running', 'paused', 'break'].includes(session.state)) return null

  const targetLabel = session.task_id ? 'Tarefa' : (session.category || 'Foco')

  // ─── Pausa obrigatória: modal grande bloqueante ──────────────────────────────
  if (session.state === 'break') {
    return (
      <Modal isOpen onClose={() => { /* não fecha durante o descanso */ }} destructive>
        <div className="bg-gradient-to-br from-tc-green to-tc-blue rounded-3xl w-full max-w-md shadow-2xl p-8 text-center text-white">
          <Coffee className="w-16 h-16 mx-auto mb-4 opacity-90" />
          <h2 className="text-3xl font-extrabold tracking-tight mb-2">VÁ DESCANSAR!</h2>
          <p className="text-white/80 mb-6">Seu ciclo de foco terminou. Faça sua pausa antes de continuar.</p>
          <div className="font-mono text-5xl tabular-nums mb-6">{fmtClock(remainingBreak ?? 0)}</div>
          <div className="flex flex-col gap-2">
            {(remainingBreak != null && remainingBreak <= 0) ? (
              <button onClick={() => act('finish-break')} disabled={busy}
                className="w-full py-3 rounded-xl bg-white text-tc-blue font-bold hover:bg-white/90 disabled:opacity-50">
                Voltar ao trabalho
              </button>
            ) : (
              <div className="text-sm text-white/70">Aguarde o fim da pausa…</div>
            )}
            {session.derived?.canSkipBreak && (remainingBreak ?? 1) > 0 && (
              <button onClick={() => act('skip-break')} disabled={busy}
                className="w-full py-2 rounded-xl bg-white/15 text-white text-sm font-medium hover:bg-white/25 disabled:opacity-50">
                Pular pausa (próximo ciclo será mais longo)
              </button>
            )}
            {!session.derived?.canSkipBreak && (
              <p className="text-xs text-white/60">Ciclo de 100 min: a pausa é obrigatória.</p>
            )}
          </div>
        </div>
      </Modal>
    )
  }

  // ─── Widget flutuante (running / paused) ──────────────────────────────────────
  const paused = session.state === 'paused'
  return (
    <div
      style={{ left: pos.x, top: pos.y }}
      className="fixed z-[10040] w-72 rounded-2xl shadow-2xl border border-violet-200 dark:border-violet-900 bg-white dark:!bg-[#1a2332] overflow-hidden"
      role="dialog" aria-label="Cronômetro Pomodoro"
    >
      <div
        onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp}
        className="flex items-center gap-2 px-3 py-2 bg-gradient-to-r from-violet-500 to-indigo-600 text-white cursor-move select-none"
      >
        <GripVertical className="w-4 h-4 opacity-70" />
        <Timer className="w-4 h-4" />
        <span className="text-sm font-semibold flex-1">{paused ? 'Pausado' : 'Em foco'}</span>
        <span className="text-[11px] opacity-80">{session.planned_minutes}/{session.break_planned_minutes}</span>
      </div>
      <div className="p-4">
        <div className="text-xs text-gray-500 dark:text-gray-400 mb-0.5">{targetLabel}</div>
        <div className="font-mono text-4xl tabular-nums text-center text-gray-900 dark:text-gray-100 my-2">
          {fmtClock(remainingActive)}
        </div>
        <div className="flex items-center justify-center gap-2 mt-3">
          {paused ? (
            <button onClick={() => act('resume')} disabled={busy} title="Retomar"
              className="p-2.5 rounded-full bg-violet-600 hover:bg-violet-700 text-white disabled:opacity-50">
              {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : <Play className="w-5 h-5" />}
            </button>
          ) : (
            <button onClick={() => act('pause')} disabled={busy} title="Pausar"
              className="p-2.5 rounded-full bg-amber-500 hover:bg-amber-600 text-white disabled:opacity-50">
              <Pause className="w-5 h-5" />
            </button>
          )}
          <button onClick={() => act('abort', { reason: 'manual' })} disabled={busy} title="Parar"
            className="p-2.5 rounded-full bg-red-500 hover:bg-red-600 text-white disabled:opacity-50">
            <Square className="w-5 h-5" />
          </button>
        </div>
      </div>
    </div>
  )
}

export default PomodoroFloatingWidget
