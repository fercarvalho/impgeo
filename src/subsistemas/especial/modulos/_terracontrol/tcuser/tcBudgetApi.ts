// Wrapper fetch para os endpoints de orçamento do tc_user.
// Espelha o budgetApi.ts admin mas usa tcToken via Bearer + credentials.
// Tipos reusados — mesmo formato do banco/backend.

const API_BASE_URL = '/api'

export type {
  BudgetStatus,
  Budget,
  BudgetRevision,
  BudgetRevisionRequest,
  BudgetEvent,
  BudgetFullPayload,
} from '../budgets/budgetApi'

import type { BudgetFullPayload, Budget } from '../budgets/budgetApi'

// Versão tc_user do payload retornado pelo backend (omite events brutos +
// inclui currentRevision pré-resolvido). Veja getBudgetForTcUser no service.
export interface TcBudgetPayload {
  budget: BudgetFullPayload['budget']
  currentRevision: BudgetFullPayload['revisions'][number] | null
  revisions: BudgetFullPayload['revisions']
  requests: BudgetFullPayload['requests']
}

export interface PixPaymentSnapshot {
  brCode: string | null
  brCodeBase64: string | null
  expiresAt: string | null
  attempt: number
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
  catch { throw new Error(`Resposta inválida (HTTP ${res.status})`) }
  if (!res.ok || !json.success) {
    throw new Error((json as ApiErr).error || `HTTP ${res.status}`)
  }
  return (json as ApiOk<T>).data
}

export const fetchBudgetByRecord = (tcToken: string | null, terracontrolId: string) =>
  request<TcBudgetPayload | null>(
    `/tc-auth/me/budgets/by-record/${encodeURIComponent(terracontrolId)}`,
    { method: 'GET' },
    tcToken
  )

export const fetchBudget = (tcToken: string | null, budgetId: string) =>
  request<TcBudgetPayload>(
    `/tc-auth/me/budgets/${encodeURIComponent(budgetId)}`,
    { method: 'GET' },
    tcToken
  )

export const requestRevision = (tcToken: string | null, budgetId: string, comment: string) =>
  request<{ budget: Budget; request: any }>(
    `/tc-auth/me/budgets/${encodeURIComponent(budgetId)}/request-revision`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ comment }),
    },
    tcToken
  )

export const acceptBudget = (tcToken: string | null, budgetId: string) =>
  request<{ budget: Budget; payment: PixPaymentSnapshot }>(
    `/tc-auth/me/budgets/${encodeURIComponent(budgetId)}/accept`,
    { method: 'POST' },
    tcToken
  )

export const refreshPix = (tcToken: string | null, budgetId: string) =>
  request<PixPaymentSnapshot>(
    `/tc-auth/me/budgets/${encodeURIComponent(budgetId)}/refresh-pix`,
    { method: 'POST' },
    tcToken
  )
