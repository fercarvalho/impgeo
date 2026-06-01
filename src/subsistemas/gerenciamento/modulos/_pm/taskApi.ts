// Helpers de API do workflow de tarefas (PM Fase 4). Centraliza fetch + parse.

const API = '/api'

export interface PmTask {
  id: string
  project_id: string
  project_stage_id: string
  name: string
  description: string | null
  status: string
  assignee_user_id: string | null
  due_date: string | null
  review_required: boolean
  acceptance_required: boolean
  paused_at: string | null
  project_name?: string
  stage_name?: string
}

async function parse(r: Response) {
  const j = await r.json().catch(() => ({}))
  if (!r.ok || !j.success) {
    const msg = j.code === 'invalid_transition' ? 'Ação não permitida no estado atual da tarefa.'
      : j.code === 'start_blocked' ? 'Tarefa bloqueada por dependências de início.'
      : j.code === 'completion_blocked' ? 'Tarefa não pode concluir: dependências pendentes.'
      : (j.error || `Erro (HTTP ${r.status})`)
    throw new Error(msg)
  }
  return j.data
}

export async function fetchMyTasks(statuses?: string[]): Promise<PmTask[]> {
  const q = statuses?.length ? `?status=${encodeURIComponent(statuses.join(','))}` : ''
  const r = await fetch(`${API}/me/tasks${q}`)
  return parse(r)
}

export async function taskAction(
  taskId: string,
  action: 'accept' | 'refuse' | 'start' | 'pause' | 'resume' | 'complete' | 'cancel',
  body?: Record<string, any>,
): Promise<any> {
  const r = await fetch(`${API}/tasks/${taskId}/${action}`, {
    method: 'POST',
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  })
  return parse(r)
}

// Rótulos + cores de status (compartilhados com a página de detalhe).
export const TASK_STATUS_META: Record<string, { label: string; cls: string }> = {
  pending:            { label: 'Pendente',        cls: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300' },
  available:          { label: 'Disponível',      cls: 'bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400' },
  in_progress:        { label: 'Em andamento',    cls: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' },
  pending_acceptance: { label: 'Aguard. aceite',  cls: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' },
  pending_review:     { label: 'Aguard. revisão', cls: 'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400' },
  pending_adjustment: { label: 'Em ajuste',       cls: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400' },
  completed:          { label: 'Concluída',       cls: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' },
  overdue:            { label: 'Atrasada',        cls: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' },
  refused:            { label: 'Recusada',        cls: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' },
  canceled:           { label: 'Cancelada',       cls: 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400' },
}
