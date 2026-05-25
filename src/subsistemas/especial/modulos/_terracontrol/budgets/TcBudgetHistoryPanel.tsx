// Painel de histórico do imóvel: junta eventos do registro (audit log via
// tc_record_events) com eventos do orçamento (revisões, pedidos, eventos
// brutos do tc_budgets). Timeline única ordenada por data desc.
//
// Quando o budget está em 'revision_requested' E o pedido mais recente é
// do tc_user (source='tc_user'), renderiza botões "Aceitar revisão"
// (callback) e "Descartar revisão" (sub-modal de motivo). Pedidos
// 'auto_edit' não têm botões — não há decisão pendente, admin só decide
// se revisa ou ignora.

import React, { useState } from 'react'
import { FileText, MessageCircle, Activity, Download, X, ExternalLink, Check, Loader2, AlertTriangle, Pencil } from 'lucide-react'
import Modal from '@/components/Modal'
import { useAuth } from '@/contexts/AuthContext'
import {
  dismissBudgetRevision,
  type BudgetFullPayload,
  type BudgetEvent,
  type BudgetRevision,
  type BudgetRevisionRequest,
  type BudgetStatus,
  type RecordEvent,
} from './budgetApi'

interface NotifyFn {
  (message: string, opts?: { type?: 'success' | 'error' | 'warning' | 'info' }): void
}

interface Props {
  /**
   * Payload do orçamento ativo. Quando null, o painel mostra só eventos do
   * registro (cadastros/edições) — útil pra imóveis legacy sem orçamento.
   */
  data: BudgetFullPayload | null
  /**
   * Eventos do registro (tc_record_events): created, edited, approved,
   * unapproved. Opcional — sem ele, o painel mostra só o ciclo de
   * orçamento (compatibilidade com o uso antigo de só budget).
   */
  recordEvents?: RecordEvent[]
  /** Nome do imóvel pro header */
  recordImovel?: string | null
  /**
   * Callback do botão "Aceitar revisão" — admin reabre o orçamento no editor
   * pra ajustar e reenviar. Painel fecha, pai abre o editor em modo revisão.
   */
  onAcceptRevision?: () => void
  /**
   * Callback após descartar revisão com sucesso — pai recarrega payload
   * pra refletir status novo ('sent') e some os botões.
   */
  onRevisionDismissed?: () => void
  /** Notify pra toast de erro/sucesso (usa o feedback global do TC) */
  notify?: NotifyFn
  onClose?: () => void
  /** Quando true, esconde a coluna de eventos brutos. */
  compact?: boolean
}

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

const BUDGET_EVENT_LABEL: Record<string, string> = {
  created: 'Orçamento criado',
  sent: 'Orçamento enviado',
  revised: 'Nova revisão enviada',
  revision_requested: 'Revisão solicitada',
  revision_dismissed: 'Revisão recusada pelo admin',
  accepted: 'Aprovado pelo cliente',
  payment_initiated: 'Pagamento iniciado',
  payment_completed: 'Pagamento confirmado',
  payment_completed_unexpected: 'Pagamento fora de estado (replay/late)',
  payment_expired: 'PIX expirou',
  payment_refunded: 'Pagamento reembolsado',
  payment_disputed: 'Disputa aberta',
  cancelled: 'Orçamento cancelado',
}

const RECORD_EVENT_LABEL: Record<string, string> = {
  created: 'Imóvel cadastrado',
  edited: 'Imóvel editado',
  approved: 'Imóvel aprovado',
  unapproved: 'Aprovação revogada',
  deleted: 'Imóvel excluído',
}

function formatCentsBR(cents: number | null | undefined): string {
  const v = (Number(cents) || 0) / 100
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return ''
  try { return new Date(iso).toLocaleString('pt-BR') } catch { return iso }
}

const TcBudgetHistoryPanel: React.FC<Props> = ({
  data, recordEvents, recordImovel, onAcceptRevision, onRevisionDismissed, notify, onClose, compact = false,
}) => {
  const { token } = useAuth()
  const [showDismissDialog, setShowDismissDialog] = useState(false)
  const [dismissReason, setDismissReason] = useState('')
  const [submittingDismiss, setSubmittingDismiss] = useState(false)

  const budget = data?.budget || null
  const revisions = data?.revisions || []
  const requests = data?.requests || []
  const events = data?.events || []

  // Achar o pedido de revisão "ativo" — só existe quando status='revision_requested'
  // E é o mais recente do tipo 'tc_user' (manual). Pedidos auto_edit não têm
  // botões porque não há decisão a tomar; admin só revisa quando quer.
  const activeUserRequest = (budget?.status === 'revision_requested')
    ? [...requests]
        .filter(r => r.source === 'tc_user')
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0]
    : null

  const handleDismiss = async () => {
    if (submittingDismiss || !budget || !dismissReason.trim()) return
    setSubmittingDismiss(true)
    try {
      await dismissBudgetRevision(token, budget.id, dismissReason.trim())
      notify?.('Revisão recusada. Cliente foi notificado.', { type: 'success' })
      setShowDismissDialog(false)
      setDismissReason('')
      onRevisionDismissed?.()
    } catch (e: any) {
      notify?.(e?.message || 'Erro ao descartar revisão', { type: 'error' })
    } finally {
      setSubmittingDismiss(false)
    }
  }

  // Junta tudo numa timeline única
  type TimelineItem =
    | { kind: 'revision'; at: string; rev: BudgetRevision }
    | { kind: 'request';  at: string; req: BudgetRevisionRequest }
    | { kind: 'event';    at: string; ev:  BudgetEvent }
    | { kind: 'record';   at: string; rec: RecordEvent }

  const timeline: TimelineItem[] = [
    ...revisions.map(r => ({ kind: 'revision' as const, at: r.created_at, rev: r })),
    ...requests.map(r  => ({ kind: 'request'  as const, at: r.created_at, req: r })),
    ...(!compact ? events.map(e => ({ kind: 'event' as const, at: e.created_at, ev: e })) : []),
    ...((recordEvents || []).map(e => ({ kind: 'record' as const, at: e.created_at, rec: e }))),
  ].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())

  const title = recordImovel ? `Histórico — ${recordImovel}` : 'Histórico do imóvel'

  return (
    <>
    <div className="bg-white dark:!bg-[#1a2332] rounded-2xl shadow-2xl w-[96vw] max-w-3xl max-h-[88vh] flex flex-col overflow-hidden">
      {/* Header */}
      <div className="bg-gradient-to-r from-tc-green to-tc-blue px-5 py-3 text-white flex items-center justify-between">
        <div className="min-w-0">
          <h3 className="text-base font-bold leading-tight truncate">{title}</h3>
          {budget && (
            <p className="text-xs text-blue-100 mt-0.5">
              v{budget.current_revision} · {formatCentsBR(budget.total_amount_cents)}
              <span className={`ml-2 px-2 py-0.5 rounded-full text-[10px] font-bold ${STATUS_BADGE[budget.status]}`}>
                {STATUS_LABEL[budget.status]}
              </span>
            </p>
          )}
        </div>
        {onClose && (
          <button type="button" onClick={onClose} className="text-white/80 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        )}
      </div>

      {/* Banner de ação — quando há pedido de revisão ativo do tc_user */}
      {activeUserRequest && (onAcceptRevision || notify) && (
        <div className="px-5 py-3 border-b border-amber-200 dark:border-amber-900/40 bg-amber-50 dark:bg-amber-900/15">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-gray-900 dark:text-gray-100">Revisão pendente</p>
              <p className="text-xs text-gray-600 dark:text-gray-400 mt-0.5">
                O cliente solicitou alterações neste orçamento. Decida como responder:
              </p>
              {activeUserRequest.comment && (
                <div className="mt-2 text-xs text-gray-800 dark:text-gray-200 bg-white dark:bg-[#1a2332] border border-amber-200 dark:border-amber-900/40 rounded p-2 whitespace-pre-wrap">
                  {activeUserRequest.comment}
                </div>
              )}
              <div className="flex flex-wrap gap-2 mt-3">
                {onAcceptRevision && (
                  <button
                    type="button"
                    onClick={onAcceptRevision}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg bg-gradient-to-r from-tc-green to-tc-blue text-white hover:from-tc-green-dark hover:to-tc-blue-dark shadow-sm"
                  >
                    <Pencil className="w-3 h-3" />
                    Aceitar revisão (editar e reenviar)
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setShowDismissDialog(true)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-white dark:bg-[#1a2332] border border-red-300 dark:border-red-800/60 text-red-700 dark:text-red-300 hover:bg-red-50 dark:hover:bg-red-900/20"
                >
                  <X className="w-3 h-3" />
                  Descartar revisão
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

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
                      href={r.pdf_url}
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
          if (it.kind === 'record') {
            const r = it.rec
            const label = RECORD_EVENT_LABEL[r.event_type] || r.event_type
            // Eventos de registro têm cor distinta — sutil verde TC pra
            // diferenciar visualmente de eventos do orçamento.
            return (
              <div key={`rec-${r.id}`} className="flex gap-3 p-2.5 rounded-lg border border-tc-green/20 dark:border-tc-green/30 bg-tc-green/5 dark:bg-tc-green/10">
                <Check className="w-4 h-4 text-tc-green mt-0.5 shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                      {label}
                    </span>
                    <span className="text-[10px] text-gray-500 dark:text-gray-400 shrink-0">{formatDate(r.created_at)}</span>
                  </div>
                  <p className="text-[10px] text-gray-500 dark:text-gray-400 mt-0.5">
                    por {r.actor_type}
                    {r.payload?.fields && Array.isArray(r.payload.fields) && (
                      <> · campos: {r.payload.fields.join(', ')}</>
                    )}
                  </p>
                </div>
              </div>
            )
          }
          // budget event bruto
          const e = it.ev
          // Destaca revision_dismissed (mais relevante)
          const isDismissed = e.event_type === 'revision_dismissed'
          return (
            <div
              key={`ev-${e.id}-${idx}`}
              className={`flex gap-3 p-2 rounded text-xs border ${
                isDismissed
                  ? 'border-red-200 dark:border-red-800/40 bg-red-50/50 dark:bg-red-900/10'
                  : 'border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-[#1a2332]'
              }`}
            >
              <Activity className={`w-3 h-3 mt-0.5 shrink-0 ${isDismissed ? 'text-red-500' : 'text-gray-400'}`} />
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline justify-between gap-2">
                  <span className={`font-medium ${isDismissed ? 'text-red-800 dark:text-red-200' : 'text-gray-700 dark:text-gray-300'}`}>
                    {BUDGET_EVENT_LABEL[e.event_type] || e.event_type}
                  </span>
                  <span className="text-[10px] text-gray-400 shrink-0">{formatDate(e.created_at)}</span>
                </div>
                <p className="text-[10px] text-gray-500 dark:text-gray-400 mt-0.5">
                  por {e.actor_type}
                </p>
                {isDismissed && e.payload?.reason && (
                  <div className="mt-1 text-[11px] text-gray-800 dark:text-gray-200 bg-white dark:bg-[#1a2332] border border-red-200 dark:border-red-800/40 rounded p-1.5 whitespace-pre-wrap">
                    <strong>Motivo:</strong> {e.payload.reason}
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>

    {/* Sub-modal de motivo do descarte — usa o <Modal> global pra ter
        backdrop-blur + z-index correto sobre o painel pai. */}
    {showDismissDialog && (
      <Modal isOpen={true} onClose={() => !submittingDismiss && setShowDismissDialog(false)}>
        <div className="bg-white dark:!bg-[#1a2332] rounded-2xl shadow-2xl w-full max-w-md p-5 space-y-3">
          <h3 className="text-base font-bold text-gray-900 dark:text-gray-100">Descartar pedido de revisão</h3>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Explique ao cliente por que a revisão não será feita. Ele vai receber esta
            mensagem por notificação e e-mail, e o orçamento original continua válido.
          </p>
          <textarea
            value={dismissReason}
            onChange={e => setDismissReason(e.target.value)}
            rows={4}
            placeholder="Ex: o valor solicitado está abaixo do nosso custo; ou os itens pedidos não fazem parte do escopo combinado…"
            className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:!bg-[#243040] text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-red-500"
          />
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowDismissDialog(false)}
              disabled={submittingDismiss}
              className="px-3 py-1.5 text-sm rounded-lg border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-200 disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleDismiss}
              disabled={submittingDismiss || !dismissReason.trim()}
              className="px-3 py-1.5 text-sm font-semibold rounded-lg bg-red-600 hover:bg-red-700 text-white disabled:opacity-50 flex items-center gap-1.5"
            >
              {submittingDismiss && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              Descartar e notificar cliente
            </button>
          </div>
        </div>
      </Modal>
    )}
    </>
  )
}

export default TcBudgetHistoryPanel
