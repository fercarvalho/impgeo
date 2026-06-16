// Helpers + hook do Pomodoro (PM Fase 5). O tempo é derivado do servidor;
// o cliente só exibe (tick local reconciliado a cada 30s).
import { useCallback, useEffect, useRef, useState } from 'react'

const API = '/api'

export interface PomodoroSession {
  id: string
  user_id: string
  task_id: string | null
  project_id: string | null
  category: string | null
  pomodoro_mode: string
  planned_minutes: number
  break_planned_minutes: number
  state: 'running' | 'paused' | 'break' | 'completed' | 'aborted' | 'daily_limit_reached'
  task_paused_at?: string | null
  derived?: {
    activeSeconds: number
    remainingActiveSeconds: number
    breakRemainingSeconds: number | null
    canSkipBreak: boolean
  }
}

async function parse(r: Response) {
  const j = await r.json().catch(() => ({}))
  if (!r.ok || !j.success) {
    const map: Record<string, string> = {
      daily_limit: j.error || 'Limite diário atingido.',
      cannot_skip_long_break: 'Você não pode pular a pausa após um ciclo de 100 minutos.',
      session_active: 'Você já tem uma sessão ativa.',
      target_required: 'Escolha uma tarefa ou categoria.',
    }
    throw new Error(map[j.code] || j.error || `Erro (HTTP ${r.status})`)
  }
  return j.data
}

export const getActive = () => fetch(`${API}/pomodoro/active`).then(parse)
export const startSession = (body: { taskId?: string | null; category?: string | null; plannedMinutes: number; breakMinutes?: number | null }) =>
  fetch(`${API}/pomodoro/sessions`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(parse)
export const sessionAction = (id: string, action: string, body?: any) =>
  fetch(`${API}/pomodoro/sessions/${id}/${action}`, {
    method: 'POST', headers: body ? { 'Content-Type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined,
  }).then(parse)
export const getStats = (range: string) => fetch(`${API}/pomodoro/stats?range=${range}`).then(parse)

// ─── Excedente de tempo diário (recomendação + aprovação de gestor) ───────────
export interface OverageRequest {
  id: string; user_id: string; day: string; justification: string | null
  status: 'pending' | 'approved' | 'rejected'; user_name?: string; worked_minutes?: number
}
export const getOverage = (): Promise<OverageRequest | null> => fetch(`${API}/pomodoro/overage`).then(parse)
export const requestOverage = (justification?: string): Promise<OverageRequest> =>
  fetch(`${API}/pomodoro/overage`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ justification: justification || null }) }).then(parse)
export const fetchPendingOverages = (): Promise<OverageRequest[]> => fetch(`${API}/pomodoro/overage/pending`).then(parse)
export const decideOverage = (id: string, approved: boolean): Promise<OverageRequest> =>
  fetch(`${API}/pomodoro/overage/${id}/decide`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ approved }) }).then(parse)
export const getConfig = () => fetch(`${API}/pomodoro/config`).then(parse)
export const updateConfig = (body: any) =>
  fetch(`${API}/pomodoro/config`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(parse)
export const markTaskAreaOpened = () => fetch(`${API}/me/task-area-opened`, { method: 'POST' }).catch(() => {})

export const MODE_OPTIONS = [
  { minutes: 25, label: '25 / 5', sub: '25 min foco · 5 min pausa' },
  { minutes: 50, label: '50 / 10', sub: '50 min foco · 10 min pausa' },
  { minutes: 100, label: '100 / 20', sub: '100 min foco · 20 min pausa' },
]

export function fmtClock(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds))
  const m = Math.floor(s / 60)
  const sec = s % 60
  return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
}

// Hook compartilhado: sessão ativa + tick local. Reconcilia a cada 30s e em
// 'pm-pomodoro-changed'. Mantém heartbeat de 60s enquanto há sessão viva.
export function useActiveSession() {
  const [session, setSession] = useState<PomodoroSession | null>(null)
  const [loading, setLoading] = useState(true)
  const fetchedAtRef = useRef<number>(Date.now())
  const [, forceTick] = useState(0)

  const refetch = useCallback(async () => {
    try {
      const s = await getActive()
      setSession(s)
      fetchedAtRef.current = Date.now()
    } catch { /* silencioso */ }
    finally { setLoading(false) }
  }, [])

  useEffect(() => {
    refetch()
    const onChanged = () => refetch()
    window.addEventListener('pm-pomodoro-changed', onChanged)
    const reconcile = setInterval(refetch, 30000)
    return () => { window.removeEventListener('pm-pomodoro-changed', onChanged); clearInterval(reconcile) }
  }, [refetch])

  // Tick local 1s (só re-render; tempo calculado a partir do servidor).
  useEffect(() => {
    if (!session) return
    const t = setInterval(() => forceTick(n => n + 1), 1000)
    return () => clearInterval(t)
  }, [session])

  // Heartbeat 60s enquanto viva.
  useEffect(() => {
    if (!session || !['running', 'paused', 'break'].includes(session.state)) return
    const hb = setInterval(() => { sessionAction(session.id, 'heartbeat').catch(() => {}) }, 60000)
    return () => clearInterval(hb)
  }, [session])

  // Segundos restantes considerando o tempo desde o último fetch.
  const elapsedSinceFetch = () => (Date.now() - fetchedAtRef.current) / 1000
  const remainingActive = session?.derived
    ? Math.max(0, (session.derived.remainingActiveSeconds ?? 0) - (session.state === 'running' ? elapsedSinceFetch() : 0))
    : 0
  const remainingBreak = session?.derived?.breakRemainingSeconds != null
    ? Math.max(0, session.derived.breakRemainingSeconds - (session.state === 'break' ? elapsedSinceFetch() : 0))
    : null

  return { session, loading, refetch, remainingActive, remainingBreak }
}

export function notifyPomodoroChanged() {
  try { window.dispatchEvent(new CustomEvent('pm-pomodoro-changed')) } catch { /* noop */ }
}
