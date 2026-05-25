// Wrapper fetch para os endpoints de orçamento (admin /api/admin/tc-budgets/*).
// Mesmo padrão das outras chamadas admin do TerraControl: token via header
// Authorization Bearer, credentials: 'include' pra cookies (CSRF).
//
// Mantém forma simples (sem axios) — projeto não tem cliente HTTP unificado
// pra TerraControl. Erros viram exceções com a mensagem do backend.

const API_BASE_URL = '/api'

export type BudgetStatus =
  | 'draft'
  | 'sent'
  | 'revision_requested'
  | 'awaiting_payment'
  | 'paid'
  | 'cancelled'

export interface BudgetItem {
  description: string
  amount_cents: number
  // Campos opcionais preparados pra futuro (qty/unit/unitPrice)
  quantity?: number
  unit_label?: string
  unit_amount_cents?: number
}

export interface Budget {
  id: string
  terracontrol_id: string
  status: BudgetStatus
  current_revision: number
  total_amount_cents: number
  current_pdf_url: string | null
  abacatepay_charge_id: string | null
  abacatepay_external_id: string | null
  abacatepay_br_code: string | null
  abacatepay_br_code_base64: string | null
  abacatepay_expires_at: string | null
  abacatepay_attempt: number
  paid_at: string | null
  paid_amount_cents: number | null
  created_at: string
  created_by_user_id: string | null
  updated_at: string
}

export interface BudgetRevision {
  id: string
  budget_id: string
  revision_number: number
  content_json: any
  content_html_snapshot: string | null
  items: BudgetItem[]
  total_amount_cents: number
  pdf_url: string | null
  created_at: string
  created_by_user_id: string | null
  // G10: enriquecido pelo backend via JOIN com users (impgeo).
  // null quando o user foi excluído ou created_by_user_id é null.
  created_by_first_name?: string | null
  created_by_last_name?: string | null
  created_by_username?: string | null
}

export interface BudgetRevisionRequest {
  id: string
  budget_id: string
  against_revision_number: number
  comment: string | null
  source: 'tc_user' | 'auto_edit'
  created_at: string
  created_by_tc_user_id: string | null
  // G10: enriquecido pelo backend via JOIN com tc_users.
  created_by_first_name?: string | null
  created_by_last_name?: string | null
  created_by_username?: string | null
}

export interface BudgetEvent {
  id: string
  budget_id: string
  event_type: string
  actor_type: 'impgeo' | 'tc' | 'system' | 'abacatepay'
  actor_id: string | null
  payload: any
  created_at: string
  // G10: enriquecido pelo backend via LEFT JOIN dual (users/tc_users)
  // conforme actor_type. Null pra system/abacatepay.
  actor_first_name?: string | null
  actor_last_name?: string | null
  actor_username?: string | null
}

export interface BudgetTemplate {
  id: string
  name: string
  content_json: any
  default_items: BudgetItem[]
  is_active: boolean
  updated_at: string
  updated_by_user_id: string | null
}

export interface BudgetFullPayload {
  budget: Budget
  revisions: BudgetRevision[]
  requests: BudgetRevisionRequest[]
  events: BudgetEvent[]
}

interface ApiOk<T> { success: true; data: T }
interface ApiErr   { success: false; error: string }
type ApiResp<T> = ApiOk<T> | ApiErr

async function request<T>(path: string, init: RequestInit, token: string | null): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    credentials: 'include',
    headers: {
      ...(init.headers || {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  })
  let json: ApiResp<T>
  try { json = await res.json() }
  catch { throw new Error(`Resposta inválida do servidor (HTTP ${res.status})`) }
  if (!res.ok || !json.success) {
    const errMsg = (json as ApiErr).error || `HTTP ${res.status}`
    throw new Error(errMsg)
  }
  return (json as ApiOk<T>).data
}

// ─── Template ──────────────────────────────────────────────────────────────

export const fetchTemplate = (token: string | null) =>
  request<BudgetTemplate | null>('/admin/tc-budgets/template', { method: 'GET' }, token)

export const saveTemplate = (token: string | null, body: {
  name?: string
  contentJson: any
  defaultItems?: BudgetItem[]
}) => request<BudgetTemplate>('/admin/tc-budgets/template', {
  method: 'PUT',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
}, token)

// ─── Orçamentos ────────────────────────────────────────────────────────────

export const fetchBudgetByRecord = (token: string | null, terracontrolId: string) =>
  request<BudgetFullPayload | null>(
    `/admin/tc-budgets/by-record/${encodeURIComponent(terracontrolId)}`,
    { method: 'GET' },
    token
  )

export const fetchBudget = (token: string | null, budgetId: string) =>
  request<BudgetFullPayload>(
    `/admin/tc-budgets/${encodeURIComponent(budgetId)}`,
    { method: 'GET' },
    token
  )

export const sendNewBudget = (token: string | null, body: {
  terracontrolId: string
  contentJson: any
  items: BudgetItem[]
}) => request<{ budget: Budget; revision: BudgetRevision }>(
  '/admin/tc-budgets',
  {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  },
  token
)

export const reviseBudget = (token: string | null, budgetId: string, body: {
  contentJson: any
  items: BudgetItem[]
}) => request<{ budget: Budget; revision: BudgetRevision }>(
  `/admin/tc-budgets/${encodeURIComponent(budgetId)}/revise`,
  {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  },
  token
)

// Preview PDF: chama o backend que gera um PDF temporário com o conteúdo
// atual do editor (não persiste em uploads/). Retorna Blob pra criar object
// URL e exibir num iframe.
export async function previewBudgetPdf(token: string | null, body: {
  terracontrolId: string
  contentJson: any
  items: BudgetItem[]
}): Promise<Blob> {
  const res = await fetch(`${API_BASE_URL}/admin/tc-budgets/preview-pdf`, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    // Tenta extrair mensagem de erro JSON (quando o handler falha antes do stream)
    let msg = `HTTP ${res.status}`
    try {
      const j = await res.json()
      if (j?.error) msg = j.error
    } catch { /* não-json */ }
    throw new Error(msg)
  }
  return res.blob()
}

export const cancelBudget = (token: string | null, budgetId: string, reason?: string) =>
  request<Budget>(
    `/admin/tc-budgets/${encodeURIComponent(budgetId)}/cancel`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason }),
    },
    token
  )

// G10 — admin descarta pedido de revisão com motivo obrigatório.
// Status volta 'revision_requested' → 'sent'. Backend notifica tc_user via
// in-app + push + e-mail. Retorna budget atualizado.
export const dismissBudgetRevision = (token: string | null, budgetId: string, reason: string) =>
  request<Budget>(
    `/admin/tc-budgets/${encodeURIComponent(budgetId)}/dismiss-revision`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason }),
    },
    token
  )

// G10 — histórico completo do imóvel: eventos do registro + budget (com
// revisões/pedidos/eventos). Front intercala/exibe na timeline.
export interface RecordEvent {
  id: string
  terracontrol_id: string
  event_type: string  // created, edited, approved, unapproved
  actor_type: 'impgeo' | 'tc' | 'system' | 'abacatepay'
  actor_id: string | null
  payload: any
  created_at: string
  // G10: enriquecido pelo backend via LEFT JOIN dual (users/tc_users).
  actor_first_name?: string | null
  actor_last_name?: string | null
  actor_username?: string | null
}

export interface RecordHistoryPayload {
  record: any  // TerraControl row (raw)
  recordEvents: RecordEvent[]
  budget: BudgetFullPayload | null
}

export const fetchRecordHistory = (token: string | null, terracontrolId: string) =>
  request<RecordHistoryPayload>(
    `/admin/tc-records/${encodeURIComponent(terracontrolId)}/history`,
    { method: 'GET' },
    token
  )
