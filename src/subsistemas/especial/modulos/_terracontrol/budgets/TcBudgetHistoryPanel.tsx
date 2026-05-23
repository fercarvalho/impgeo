// Painel de histórico de revisões + pedidos + eventos de um orçamento.
// Usado dentro de um modal/drawer no admin (e provavelmente reaproveitado
// numa versão simplificada pro tc_user no G8).

import React from 'react'
import { FileText, MessageCircle, Activity, Download, X, ExternalLink } from 'lucide-react'
import type { BudgetFullPayload, BudgetEvent, BudgetRevision, BudgetRevisionRequest, BudgetStatus } from './budgetApi'

interface Props {
  data: BudgetFullPayload
  onClose?: () => void
  // Quando true, esconde a coluna de eventos brutos (só revisões + pedidos).
  compact?: boolean
}

// Rótulo amigável dos status pra UI
const STATUS_LABEL: Record<BudgetStatus, string> = {
  draft: 'Rascunho',
  sent: 'Enviado',
  revision_requested: 'Revisão solicitada',
  awaiting_payment: 'Aguardando pagamento',
  paid: 'Pago',
  cancelled: 'Cancelado',
}

const STATUS_BADGE: Record<BudgetStatus, string> = {
  draft: 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-200',
  sent: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  revision_requested: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
  awaiting_payment: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300',
  paid: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
  cancelled: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
}

const EVENT_LABEL: Record<string, string> = {
  created: 'Orçamento criado',
  sent: 'Orçamento enviado',
  revised: 'Nova revisão enviada',
  revision_requested: 'Revisão solicitada',
  accepted: 'Aprovado pelo cliente',
  payment_initiated: 'Pagamento iniciado',
  payment_completed: 'Pagamento confirmado',
  payment_completed_unexpected: 'Pagamento fora de estado (replay/late)',
  payment_expired: 'PIX expirou',
  payment_refunded: 'Pagamento reembolsado',
  payment_disputed: 'Disputa aberta',
  cancelled: 'Orçamento cancelado',
}

function formatCentsBR(cents: number | null | undefined): string {
  const v = (Number(cents) || 0) / 100
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return ''
  try { return new Date(iso).toLocaleString('pt-BR') } catch { return iso }
}

function withTcAuthQs(url: string | null | undefined, _token: string | null): string {
  // PDF é servido por /api/documents/:filename. Admin (sessão JWT impgeo)
  // baixa direto sem query (cookie httpOnly autentica). Tc_user usa ?tcAuth=.
  // Como esse painel é admin, devolve URL como veio.
  return url || ''
}

const TcBudgetHistoryPanel: React.FC<Props> = ({ data, onClose, compact = false }) => {
  const { budget, revisions, requests, events } = data

  // Junta revisões + pedidos numa timeline única ordenada por data desc
  type TimelineItem =
    | { kind: 'revision'; at: string; rev: BudgetRevision }
    | { kind: 'request';  at: string; req: BudgetRevisionRequest }
    | { kind: 'event';    at: string; ev:  BudgetEvent }

  const timeline: TimelineItem[] = [
    ...revisions.map(r => ({ kind: 'revision' as const, at: r.created_at, rev: r })),
    ...requests.map(r  => ({ kind: 'request'  as const, at: r.created_at, req: r })),
    ...(!compact ? events.map(e => ({ kind: 'event' as const, at: e.created_at, ev: e })) : []),
  ].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())

  return (
    <div className="bg-white dark:!bg-[#1a2332] rounded-2xl shadow-2xl w-[96vw] max-w-3xl max-h-[88vh] flex flex-col overflow-hidden">
      {/* Header */}
      <div className="bg-gradient-to-r from-tc-green to-tc-blue px-5 py-3 text-white flex items-center justify-between">
        <div className="min-w-0">
          <h3 className="text-base font-bold leading-tight">Histórico do orçamento</h3>
          <p className="text-xs text-blue-100 mt-0.5">
            v{budget.current_revision} · {formatCentsBR(budget.total_amount_cents)}
            <span className={`ml-2 px-2 py-0.5 rounded-full text-[10px] font-bold ${STATUS_BADGE[budget.status]}`}>
              {STATUS_LABEL[budget.status]}
            </span>
          </p>
        </div>
        {onClose && (
          <button type="button" onClick={onClose} className="text-white/80 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        )}
      </div>

      <div className="flex-1 overflow-auto p-4 space-y-2">
        {timeline.length === 0 ? (
          <div className="text-center text-sm text-gray-500 dark:text-gray-400 py-10">
            Nenhuma atividade registrada.
          </div>
        ) : timeline.map((it, idx) => {
          if (it.kind === 'revision') {
            const r = it.rev
            return (
              <div key={`rev-${r.id}`} className="flex gap-3 p-3 rounded-lg border border-blue-100 dark:border-blue-900/40 bg-blue-50/40 dark:bg-blue-900/10">
                <FileText className="w-4 h-4 text-tc-blue mt-0.5 shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                      Revisão v{r.revision_number} enviada
                    </span>
                    <span className="text-[10px] text-gray-500 dark:text-gray-400 shrink-0">{formatDate(r.created_at)}</span>
                  </div>
                  <p className="text-xs text-gray-600 dark:text-gray-400 mt-0.5">
                    {(r.items || []).length} {(r.items || []).length === 1 ? 'item' : 'itens'} · {formatCentsBR(r.total_amount_cents)}
                  </p>
                  {r.pdf_url && (
                    <a
                      href={withTcAuthQs(r.pdf_url, null)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-[11px] text-tc-blue hover:underline mt-1"
                    >
                      <Download className="w-3 h-3" /> Baixar PDF v{r.revision_number}
                      <ExternalLink className="w-2.5 h-2.5 opacity-60" />
                    </a>
                  )}
                </div>
              </div>
            )
          }
          if (it.kind === 'request') {
            const r = it.req
            return (
              <div key={`req-${r.id}`} className="flex gap-3 p-3 rounded-lg border border-amber-200 dark:border-amber-900/40 bg-amber-50/50 dark:bg-amber-900/10">
                <MessageCircle className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                      {r.source === 'auto_edit' ? 'Revisão automática (cliente editou imóvel)' : 'Cliente solicitou revisão'}
                    </span>
                    <span className="text-[10px] text-gray-500 dark:text-gray-400 shrink-0">{formatDate(r.created_at)}</span>
                  </div>
                  <p className="text-xs text-gray-600 dark:text-gray-400 mt-0.5">
                    Contra a revisão v{r.against_revision_number}
                  </p>
                  {r.comment && (
                    <div className="mt-1.5 text-xs text-gray-800 dark:text-gray-200 bg-white dark:bg-[#1a2332] border border-amber-200 dark:border-amber-900/40 rounded p-2 whitespace-pre-wrap">
                      {r.comment}
                    </div>
                  )}
                </div>
              </div>
            )
          }
          // event
          const e = it.ev
          return (
            <div key={`ev-${e.id}-${idx}`} className="flex gap-3 p-2 rounded text-xs border border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-[#1a2332]">
              <Activity className="w-3 h-3 text-gray-400 mt-0.5 shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="font-medium text-gray-700 dark:text-gray-300">
                    {EVENT_LABEL[e.event_type] || e.event_type}
                  </span>
                  <span className="text-[10px] text-gray-400 shrink-0">{formatDate(e.created_at)}</span>
                </div>
                <p className="text-[10px] text-gray-500 dark:text-gray-400 mt-0.5">
                  por {e.actor_type}
                </p>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default TcBudgetHistoryPanel
