import React, { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import Modal from '@/components/Modal'
import { Pause, Play, Square, Coffee, Loader2, GripVertical, Timer, PictureInPicture2, X } from 'lucide-react'
import { useActiveSession, sessionAction, fmtClock, notifyPomodoroChanged } from './pomodoroApi'
import { taskAction } from './taskApi'

const POS_KEY = 'pm-pomodoro-widget-pos'

// Suporte ao Document Picture-in-Picture (Chrome/Edge). Janela always-on-top real.
const supportsPip = typeof window !== 'undefined' && 'documentPictureInPicture' in window

// Clona os estilos (Tailwind etc.) da página para a janela PiP funcionar com as classes.
function copyStylesToPip(pip: Window) {
  for (const sheet of Array.from(document.styleSheets)) {
    try {
      const css = Array.from(sheet.cssRules).map(r => r.cssText).join('')
      const style = document.createElement('style')
      style.textContent = css
      pip.document.head.appendChild(style)
    } catch {
      // Folha cross-origin (ex.: Google Fonts): clona o <link>.
      if (sheet.href) {
        const link = document.createElement('link')
        link.rel = 'stylesheet'
        if (sheet.media?.length) link.media = sheet.media.mediaText
        link.href = sheet.href
        pip.document.head.appendChild(link)
      }
    }
  }
}

// Widget flutuante global do Pomodoro. Montado em App.tsx; aparece quando há
// sessão ativa. Durante a pausa obrigatória vira o modal grande "VÁ DESCANSAR".
// Pode ser destacado numa janela Picture-in-Picture (always-on-top do SO).
const PomodoroFloatingWidget: React.FC = () => {
  const { session, refetch, remainingActive, remainingBreak } = useActiveSession()
  const [busy, setBusy] = useState(false)
  const transitioningRef = useRef(false)

  // Picture-in-Picture (janela destacada always-on-top).
  const [pipWindow, setPipWindow] = useState<Window | null>(null)
  const [pipContainer, setPipContainer] = useState<HTMLElement | null>(null)

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

  // Stop (parar): se a sessão é de uma tarefa, PAUSA a tarefa (e a sessão junto,
  // preservando o tempo) e fecha o widget — retomar a tarefa reabre o cronômetro.
  // Sessão de categoria (sem tarefa) só aborta como antes.
  const onStop = useCallback(async () => {
    if (!session) return
    setBusy(true)
    try {
      if (session.task_id) {
        await taskAction(session.task_id, 'pause')
        try { window.dispatchEvent(new CustomEvent('pm-tasks-changed')) } catch { /* noop */ }
      } else {
        await sessionAction(session.id, 'abort', { reason: 'manual' })
      }
      await refetch(); notifyPomodoroChanged()
    } catch { /* noop */ }
    finally { setBusy(false) }
  }, [session, refetch])

  // Retoma a tarefa estacionada (reabre o cronômetro de onde parou).
  const onResumeParked = useCallback(async () => {
    if (!session?.task_id) return
    setBusy(true)
    try {
      await taskAction(session.task_id, 'resume')
      try { window.dispatchEvent(new CustomEvent('pm-tasks-changed')) } catch { /* noop */ }
      await refetch(); notifyPomodoroChanged()
    } catch { /* noop */ }
    finally { setBusy(false) }
  }, [session, refetch])

  // Polling de fechamento da janela destacada (cobre Document PiP e popup comum).
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const setupDetachedWindow = useCallback((w: Window) => {
    copyStylesToPip(w)
    w.document.documentElement.className = document.documentElement.className // herda dark mode
    w.document.title = 'Pomodoro'
    w.document.body.style.margin = '0'
    w.document.body.style.overflow = 'hidden'
    const container = w.document.createElement('div')
    w.document.body.appendChild(container)
    if (pollRef.current) clearInterval(pollRef.current)
    pollRef.current = setInterval(() => {
      if (w.closed) {
        if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }
        setPipWindow(null); setPipContainer(null)
      }
    }, 500)
    setPipContainer(container)
    setPipWindow(w)
  }, [])

  // Abre a janela destacada: Document PiP (always-on-top, Chrome/Edge) quando
  // disponível; senão cai pro window.open (janela separada comum — Safari/iOS/Android).
  const openDetached = useCallback(async () => {
    try {
      let w: Window | null = null
      if (supportsPip) {
        w = await (window as any).documentPictureInPicture.requestWindow({ width: 300, height: 230 })
      } else {
        w = window.open('', 'impgeo-pomodoro', 'width=300,height=240')
      }
      if (!w) { alert('Não foi possível abrir a janela. Permita pop-ups para este site e tente de novo.'); return }
      setupDetachedWindow(w)
    } catch { /* usuário cancelou ou indisponível */ }
  }, [setupDetachedWindow])

  const closePip = useCallback(() => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }
    try { pipWindow?.close() } catch { /* noop */ }
    setPipWindow(null); setPipContainer(null)
  }, [pipWindow])

  // Limpa o polling ao desmontar.
  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current) }, [])

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

  // Tarefa pausada (widget estaciona) → fecha a janela destacada, se aberta.
  useEffect(() => {
    if (pipWindow && session?.task_id && session?.task_paused_at) closePip()
  }, [session, pipWindow, closePip])

  // Pausa obrigatória ("VÁ DESCANSAR") tem que travar a tela PRINCIPAL do sistema:
  // fecha a janela destacada para o modal bloqueante aparecer na janela principal.
  useEffect(() => {
    if (pipWindow && session?.state === 'break') closePip()
  }, [session, pipWindow, closePip])

  // Sessão acabou (ou some) → fecha a janela PiP, se aberta.
  useEffect(() => {
    if (pipWindow && (!session || !['running', 'paused', 'break'].includes(session.state))) {
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }
      try { pipWindow.close() } catch { /* noop */ }
      setPipWindow(null); setPipContainer(null)
    }
  }, [session, pipWindow])

  if (!session || !['running', 'paused', 'break'].includes(session.state)) return null
  // Tarefa pausada → widget "estacionado": pílula compacta com botão de retomar.
  if (session.task_id && session.task_paused_at) {
    return (
      <div
        style={{ left: pos.x, top: pos.y }}
        className="fixed z-[10040] rounded-xl shadow-lg border border-amber-200 dark:border-amber-900 bg-white dark:!bg-[#1a2332] px-3 py-2 flex items-center gap-2"
        role="dialog" aria-label="Tarefa pausada"
      >
        <Pause className="w-4 h-4 text-amber-500" />
        <span className="text-xs text-gray-600 dark:text-gray-300">Tarefa pausada</span>
        <button onClick={onResumeParked} disabled={busy} title="Retomar tarefa e cronômetro"
          className="p-1.5 rounded-full bg-violet-600 hover:bg-violet-700 text-white disabled:opacity-50">
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
        </button>
      </div>
    )
  }

  const targetLabel = session.task_id ? 'Tarefa' : (session.category || 'Foco')
  const paused = session.state === 'paused'

  // ─── Controles reutilizáveis ──────────────────────────────────────────────────
  const timerControls = (
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
      <button onClick={onStop} disabled={busy} title={session.task_id ? 'Parar e pausar a tarefa' : 'Parar'}
        className="p-2.5 rounded-full bg-red-500 hover:bg-red-600 text-white disabled:opacity-50">
        <Square className="w-5 h-5" />
      </button>
    </div>
  )

  const breakControls = (
    <div className="flex flex-col gap-2 w-full">
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
  )

  // ─── Conteúdo para a janela PiP (preenche a janela inteira) ───────────────────
  // Durante a pausa obrigatória NÃO usa a janela destacada — o "VÁ DESCANSAR"
  // tem que travar a tela principal (a janela destacada é fechada pelo efeito).
  if (pipWindow && pipContainer && session.state !== 'break') {
    // Só o cronômetro vai pra janela destacada; a pausa obrigatória trava a tela principal.
    const pipBody = (
      <div className="flex flex-col h-screen w-screen bg-white dark:bg-[#1a2332] text-gray-900 dark:text-gray-100 select-none">
        <div className="flex items-center gap-2 px-3 py-2 bg-gradient-to-r from-violet-500 to-indigo-600 text-white">
          <Timer className="w-4 h-4" />
          <span className="text-sm font-semibold flex-1">{paused ? 'Pausado' : 'Em foco'}</span>
          <span className="text-[11px] opacity-80">{session.planned_minutes}/{session.break_planned_minutes}</span>
        </div>
        <div className="flex-1 flex flex-col items-center justify-center p-4">
          <div className="text-xs text-gray-500 dark:text-gray-400 mb-0.5">{targetLabel}</div>
          <div className="font-mono text-5xl tabular-nums text-center my-2">{fmtClock(remainingActive)}</div>
          {timerControls}
        </div>
      </div>
    )

    return (
      <>
        {createPortal(pipBody, pipContainer)}
        {/* Indicador discreto na página principal enquanto está destacado */}
        <div
          style={{ left: pos.x, top: pos.y }}
          className="fixed z-[10040] rounded-xl shadow-lg border border-violet-200 dark:border-violet-900 bg-white dark:!bg-[#1a2332] px-3 py-2 flex items-center gap-2"
          role="dialog" aria-label="Cronômetro Pomodoro (janela flutuante)"
        >
          <Timer className="w-4 h-4 text-violet-500" />
          <span className="text-xs text-gray-600 dark:text-gray-300">Cronômetro na janela flutuante</span>
          <button onClick={closePip} title="Trazer de volta para a página"
            className="p-1 rounded-md text-gray-400 hover:text-violet-600 dark:hover:text-violet-400">
            <X className="w-4 h-4" />
          </button>
        </div>
      </>
    )
  }

  // ─── Pausa obrigatória: modal grande bloqueante ──────────────────────────────
  if (session.state === 'break') {
    return (
      <Modal isOpen onClose={() => { /* não fecha durante o descanso */ }} destructive>
        <div className="bg-gradient-to-br from-tc-green to-tc-blue rounded-3xl w-full max-w-md shadow-2xl p-8 text-center text-white">
          <Coffee className="w-16 h-16 mx-auto mb-4 opacity-90" />
          <h2 className="text-3xl font-extrabold tracking-tight mb-2">VÁ DESCANSAR!</h2>
          <p className="text-white/80 mb-6">Seu ciclo de foco terminou. Faça sua pausa antes de continuar.</p>
          <div className="font-mono text-5xl tabular-nums mb-6">{fmtClock(remainingBreak ?? 0)}</div>
          {breakControls}
        </div>
      </Modal>
    )
  }

  // ─── Widget flutuante (running / paused) ──────────────────────────────────────
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
        <button onClick={openDetached}
          title={supportsPip ? 'Abrir em janela flutuante (fica acima de tudo)' : 'Abrir em janela separada'}
          className="p-0.5 rounded text-white/80 hover:text-white hover:bg-white/15">
          <PictureInPicture2 className="w-4 h-4" />
        </button>
      </div>
      <div className="p-4">
        <div className="text-xs text-gray-500 dark:text-gray-400 mb-0.5">{targetLabel}</div>
        <div className="font-mono text-4xl tabular-nums text-center text-gray-900 dark:text-gray-100 my-2">
          {fmtClock(remainingActive)}
        </div>
        {timerControls}
      </div>
    </div>
  )
}

export default PomodoroFloatingWidget
