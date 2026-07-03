// Helpers de API do workflow de tarefas (PM Fase 4). Centraliza fetch + parse.

const API = '/api'

export interface CompletionPrereq {
  kind: 'task' | 'stage'
  id: string
  name: string
  stage_name?: string | null
  project_name?: string | null
  status?: string
  assignee_user_id?: string | null
  gestor_only?: boolean
  claimable: boolean
}

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
  default_days?: number | null
  due_action?: 'edit' | 'request' | null
  can_assign?: boolean
  can_review?: boolean
  gestor_only?: boolean
  completion_prereqs?: CompletionPrereq[]
  assignee_name?: string | null
  project_name?: string
  stage_name?: string
}

async function parse(r: Response) {
  const j = await r.json().catch(() => ({}))
  if (!r.ok || !j.success) {
    const msg = j.code === 'invalid_transition' ? 'Ação não permitida no estado atual da tarefa.'
      : j.code === 'start_blocked' ? (j.error || 'Tarefa bloqueada por dependências de início.')
      : j.code === 'completion_blocked' ? (j.error || 'Tarefa não pode concluir: dependências pendentes.')
      : (j.error || `Erro (HTTP ${r.status})`)
    const e: any = new Error(msg); e.code = j.code; throw e
  }
  return j.data
}

// ─── Paginação (melhoria #12) ─────────────────────────────────────────────────
// Opt-in: sem `limit`, o backend devolve tudo (data continua array). O envelope
// `pagination` é lido só pelas funções de listagem via parsePaged.
export interface PageOpts { limit?: number; offset?: number }
export interface PageInfo { total: number; limit: number | null; offset: number; page: number; totalPages: number }
export interface Paginated<T> { data: T[]; pagination?: PageInfo }

async function parsePaged<T>(r: Response): Promise<Paginated<T>> {
  const j = await r.json().catch(() => ({}))
  if (!r.ok || !j.success) {
    const e: any = new Error(j.error || `Erro (HTTP ${r.status})`); e.code = j.code; throw e
  }
  return { data: j.data, pagination: j.pagination }
}

// Monta a URL com os params de paginação (só inclui se `limit` estiver definido)
// mais quaisquer params extras não-vazios.
function urlWithPage(path: string, page?: PageOpts, extra?: Record<string, string | undefined>): string {
  const p = new URLSearchParams()
  if (extra) for (const [k, v] of Object.entries(extra)) if (v) p.set(k, v)
  if (page?.limit != null) { p.set('limit', String(page.limit)); if (page.offset) p.set('offset', String(page.offset)) }
  const s = p.toString()
  return `${API}${path}${s ? `?${s}` : ''}`
}

export function fetchMyTasks(statuses?: string[], page?: PageOpts): Promise<Paginated<PmTask>> {
  const url = urlWithPage('/me/tasks', page, { status: statuses?.length ? statuses.join(',') : undefined })
  return fetch(url).then(parsePaged<PmTask>)
}

// Tarefas disponíveis para "pegar" (sem responsável).
export function fetchAvailableTasks(page?: PageOpts): Promise<Paginated<PmTask>> {
  return fetch(urlWithPage('/me/available-tasks', page)).then(parsePaged<PmTask>)
}

// Altera o prazo. Admin/superadmin aplica direto → { applied, task };
// manager/usuário gera pedido de aprovação → { requested, request }.
export const setTaskDueDate = (taskId: string, dueDate: string | null, justification?: string): Promise<any> =>
  fetch(`${API}/tasks/${taskId}/due-date`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ dueDate, ...(justification ? { justification } : {}) }) }).then(parse)

export interface DueDateRequest {
  id: string; task_id: string; project_id: string; requester_role: 'user' | 'manager'; status?: string
  requested_due_date: string | null; current_due_date: string | null; justification: string | null; decision_note?: string | null
  task_name?: string; project_name?: string; requester_name?: string; decided_by_name?: string
}
export const fetchPendingDueRequests = (page?: PageOpts): Promise<Paginated<DueDateRequest>> =>
  fetch(urlWithPage('/pm/due-date-requests/pending', page)).then(parsePaged<DueDateRequest>)
// Decisor: action = 'approve' | 'reject' | 'force' | 'propose'.
export const decideDueRequest = (id: string, body: { action: 'approve' | 'reject' | 'force' | 'propose'; newDueDate?: string | null; note?: string | null }) =>
  fetch(`${API}/pm/due-date-requests/${id}/decide`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(parse)
// Solicitante responde a uma contraproposta: 'accept' | 'reject' | 'propose'.
export const fetchMyDueProposals = (): Promise<DueDateRequest[]> => fetch(`${API}/pm/due-date-requests/mine`).then(parse)
export const respondDueProposal = (id: string, body: { action: 'accept' | 'reject' | 'propose'; newDueDate?: string | null; justification?: string | null }) =>
  fetch(`${API}/pm/due-date-requests/${id}/respond`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(parse)

// Auto-atribuir uma tarefa disponível ao usuário logado.
export async function claimTask(taskId: string): Promise<any> {
  const r = await fetch(`${API}/tasks/${taskId}/claim`, { method: 'POST' })
  return parse(r)
}

// Pega várias tarefas de uma vez (principal + pré-requisitos). Best-effort.
export async function claimTasksBulk(taskIds: string[]): Promise<{ claimed: string[]; skipped: { id: string; error: string }[] }> {
  const r = await fetch(`${API}/tasks/claim-bulk`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ taskIds }) })
  return parse(r)
}

// Desconcluir (reabrir) uma tarefa concluída. target: 'self' (capturar) |
// 'original' (devolver a quem concluiu). Retorna { reopened } ou { requested }.
export async function uncompleteTask(taskId: string, reason: string, target: 'self' | 'original' | 'pool'): Promise<any> {
  const r = await fetch(`${API}/tasks/${taskId}/uncomplete`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reason, target }) })
  return parse(r)
}

export interface UncompleteRequest {
  id: string; task_id: string; project_id: string; reason: string; target: 'self' | 'original' | 'pool'
  task_name?: string; project_name?: string; requester_name?: string
}
export const fetchPendingUncompleteRequests = (page?: PageOpts): Promise<Paginated<UncompleteRequest>> =>
  fetch(urlWithPage('/pm/uncomplete-requests', page)).then(parsePaged<UncompleteRequest>)
export const decideUncompleteRequest = (id: string, approve: boolean) =>
  fetch(`${API}/pm/uncomplete-requests/${id}/decide`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ approve }) }).then(parse)

export interface DelegationRequest {
  id: string; task_id: string; project_id: string; due_date: string | null
  task_name?: string; project_name?: string; requester_name?: string; to_name?: string
}
export const fetchPendingDelegations = (page?: PageOpts): Promise<Paginated<DelegationRequest>> =>
  fetch(urlWithPage('/pm/delegation-requests', page)).then(parsePaged<DelegationRequest>)
export const decideDelegation = (id: string, approved: boolean) =>
  fetch(`${API}/pm/delegation-requests/${id}/decide`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ approved }) }).then(parse)

export async function taskAction(
  taskId: string,
  action: 'accept' | 'refuse' | 'start' | 'pause' | 'resume' | 'complete' | 'cancel' | 'submit-review',
  body?: Record<string, any>,
): Promise<any> {
  const r = await fetch(`${API}/tasks/${taskId}/${action}`, {
    method: 'POST',
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  })
  return parse(r)
}

// ─── Fase 6: revisão, ajuda, anexos, usuários ─────────────────────────────────
export interface PmUser { id: string; name: string; role: string }
export interface HelpRequest {
  id: string; task_id: string; requester_user_id: string; target_user_id: string
  message: string | null; status: 'pending' | 'accepted' | 'refused' | 'completed'
  task_name?: string; project_name?: string
}

export const fetchPmUsers = (): Promise<PmUser[]> => fetch(`${API}/pm/users`).then(parse)
// Usuários a quem o ator pode atribuir a tarefa (filtrado por escopo no backend).
export const fetchAssignableUsers = (taskId?: string): Promise<PmUser[]> =>
  fetch(`${API}/pm/assignable-users${taskId ? `?taskId=${encodeURIComponent(taskId)}` : ''}`).then(parse)
export const fetchPendingReviews = (page?: PageOpts): Promise<Paginated<PmTask>> =>
  fetch(urlWithPage('/pm/pending-reviews', page)).then(parsePaged<PmTask>)
export const reviewApprove = (taskId: string) =>
  fetch(`${API}/tasks/${taskId}/review/approve`, { method: 'POST' }).then(parse)
export const reviewReject = (taskId: string, adjustmentNotes: string) =>
  fetch(`${API}/tasks/${taskId}/review/reject`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ adjustmentNotes }) }).then(parse)

export const fetchIncomingHelp = (): Promise<HelpRequest[]> => fetch(`${API}/me/help-requests`).then(parse)
export const createHelpRequest = (taskId: string, targetUserId: string, message: string) =>
  fetch(`${API}/tasks/${taskId}/help-request`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ targetUserId, message }) }).then(parse)
export const helpAction = (id: string, action: 'accept' | 'refuse' | 'complete', body?: any) =>
  fetch(`${API}/help-requests/${id}/${action}`, { method: 'POST', headers: body ? { 'Content-Type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined }).then(parse)

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
