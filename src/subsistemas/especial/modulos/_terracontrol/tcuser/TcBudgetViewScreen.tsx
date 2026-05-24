// Tela full-page do tc_user pra visualizar o orçamento recebido.
// Renderiza:
//   - cabeçalho com dados do imóvel + status + valor total
//   - conteúdo TipTap em modo readonly
//   - tabela de itens
//   - histórico de revisões (collapsible) se houver >1
//   - 2 CTAs: "Aprovar e pagar agora" / "Solicitar alterações"
//
// Quando tc_user clica "Aprovar e pagar", chama POST /accept, recebe o
// QR Code e transita pra tela de pagamento (controlado pelo pai via
// callback onAccepted).

import React, { useEffect, useMemo, useState } from 'react'
import { ArrowLeft, Download, MessageCircle, CreditCard, Loader2, AlertTriangle, ChevronDown, ChevronUp, FileText, MessageSquare } from 'lucide-react'
import { useEditor, EditorContent } from '@tiptap/react'
import { useTcAuth } from '@/contexts/TcAuthContext'
import Modal from '@/components/Modal'
import { tiptapExtensions } from '../budgets/tiptap-config'
import {
  fetchBudget,
  requestRevision as apiRequestRevision,
  acceptBudget,
  type TcBudgetPayload,
  type PixPaymentSnapshot,
} from './tcBudgetApi'

interface NotifyFn {
  (message: string, opts?: { type?: 'success' | 'error' | 'warning' | 'info' }): void
}

interface Props {
  budgetId: string
  onBack: () => void
  // Disparado quando tc_user aprova e PIX é criado.
  onAccepted: (budgetId: string, payment: PixPaymentSnapshot) => void
  notify: NotifyFn
  // Se já está em awaiting_payment ao abrir, pai pode mandar direto pra pagamento.
  onResumePayment?: (budgetId: string) => void
}

function formatCentsBR(cents: number | null | undefined): string {
  const v = (Number(cents) || 0) / 100
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return ''
  try { return new Date(iso).toLocaleString('pt-BR') } catch { return iso }
}

// Tons 100/700 + variantes dark: pra contraste forte em ambos os modos.
// Alinhado com badgeMap do TerraControl.tsx e STATUS_BADGE do TcBudgetHistoryPanel.
const STATUS_LABEL: Record<string, { text: string; cls: string }> = {
  sent:               { text: 'Aguardando sua resposta', cls: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300' },
  revision_requested: { text: 'Revisão solicitada',      cls: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300' },
  awaiting_payment:   { text: 'Aguardando pagamento',    cls: 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300' },
  paid:               { text: 'Pago',                    cls: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300' },
  cancelled:          { text: 'Cancelado',               cls: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300' },
  draft:              { text: 'Rascunho',                cls: 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-200' },
}

const TcBudgetViewScreen: React.FC<Props> = ({ budgetId, onBack, onAccepted, onResumePayment, notify }) => {
  const { tcToken } = useTcAuth()
  const [loading, setLoading] = useState(true)
  const [payload, setPayload] = useState<TcBudgetPayload | null>(null)
  const [showHistory, setShowHistory] = useState(false)
  const [showRevisionDialog, setShowRevisionDialog] = useState(false)
  const [revisionComment, setRevisionComment] = useState('')
  const [submittingRevision, setSubmittingRevision] = useState(false)
  const [submittingAccept, setSubmittingAccept] = useState(false)

  // Editor readonly pro conteúdo TipTap da revisão atual
  const editor = useEditor({
    extensions: tiptapExtensions,
    content: { type: 'doc', content: [{ type: 'paragraph' }] },
    editable: false,
    editorProps: {
      attributes: {
        class: 'prose prose-sm dark:prose-invert max-w-none px-4 py-3 text-sm text-gray-900 dark:text-gray-100 leading-relaxed',
      },
    },
  })

  useEffect(() => {
    if (!tcToken) return
    let cancelled = false
    setLoading(true)
    fetchBudget(tcToken, budgetId)
      .then(data => {
        if (cancelled) return
        setPayload(data)
        if (editor && data.currentRevision?.content_json) {
          editor.commands.setContent(data.currentRevision.content_json, { emitUpdate: false })
        }
        // Se já está em awaiting_payment, oferecemos retomar (botão dedicado;
        // não auto-redireciona pra não confundir quem chegou pela notificação
        // de "novo orçamento" e quer revisar conteúdo).
      })
      .catch(err => {
        if (!cancelled) notify(err?.message || 'Erro ao carregar orçamento', { type: 'error' })
      })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tcToken, budgetId, editor])

  const status = payload?.budget.status
  const canTakeAction = status === 'sent' || status === 'revision_requested'

  const handleSubmitRevision = async () => {
    if (submittingRevision || !revisionComment.trim()) return
    setSubmittingRevision(true)
    try {
      await apiRequestRevision(tcToken, budgetId, revisionComment.trim())
      notify('Solicitação enviada. O admin será notificado.', { type: 'success' })
      setShowRevisionDialog(false)
      setRevisionComment('')
      onBack()
    } catch (e: any) {
      notify(e?.message || 'Erro ao solicitar revisão', { type: 'error' })
    } finally {
      setSubmittingRevision(false)
    }
  }

  const handleAcceptAndPay = async () => {
    if (submittingAccept) return
    setSubmittingAccept(true)
    try {
      const { payment } = await acceptBudget(tcToken, budgetId)
      notify('Orçamento aprovado. Pague o PIX para concluir.', { type: 'success' })
      onAccepted(budgetId, payment)
    } catch (e: any) {
      notify(e?.message || 'Erro ao iniciar pagamento', { type: 'error' })
    } finally {
      setSubmittingAccept(false)
    }
  }

  const pdfDownloadUrl = useMemo(() => {
    const url = payload?.currentRevision?.pdf_url
    if (!url || !tcToken) return null
    return `${url}?tcAuth=${encodeURIComponent(tcToken)}`
  }, [payload?.currentRevision?.pdf_url, tcToken])

  if (loading) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-12 text-center text-gray-500 dark:text-gray-400">
        <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2 text-tc-blue" />
        Carregando orçamento…
      </div>
    )
  }

  if (!payload) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-12 text-center">
        <AlertTriangle className="w-8 h-8 mx-auto mb-2 text-amber-500" />
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">Orçamento não encontrado.</p>
        <button onClick={onBack} className="text-sm text-tc-blue hover:underline">Voltar</button>
      </div>
    )
  }

  const { budget, currentRevision } = payload
  const items = currentRevision?.items || []
  const statusInfo = STATUS_LABEL[budget.status] || STATUS_LABEL.draft

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 space-y-4">
      {/* Voltar */}
      <button
        onClick={onBack}
        className="inline-flex items-center gap-1.5 text-sm text-gray-600 dark:text-gray-400 hover:text-tc-blue"
      >
        <ArrowLeft className="w-4 h-4" /> Voltar
      </button>

      {/* Header card */}
      <div className="bg-white dark:!bg-[#243040] rounded-2xl shadow-md border border-gray-200 dark:border-gray-700 overflow-hidden">
        <div className="bg-gradient-to-r from-tc-green to-tc-blue px-5 py-4 text-white">
          <div className="flex items-baseline justify-between gap-3 flex-wrap">
            <div>
              <p className="text-xs text-blue-100">Orçamento v{budget.current_revision}</p>
              <p className="text-lg font-bold">{formatCentsBR(budget.total_amount_cents)}</p>
            </div>
            <span className={`px-3 py-1 rounded-full text-[11px] font-bold ${statusInfo.cls}`}>
              {statusInfo.text}
            </span>
          </div>
        </div>

        {/* Conteúdo do orçamento (readonly TipTap) */}
        <div className="border-b border-gray-100 dark:border-gray-700">
          <EditorContent editor={editor} />
        </div>

        {/* Itens */}
        {items.length > 0 && (
          <div className="p-5">
            <h3 className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">Itens</h3>
            <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
              {items.map((it, idx) => (
                <div
                  key={idx}
                  className={`flex items-center justify-between gap-3 px-3 py-2 text-sm ${
                    idx % 2 === 1 ? 'bg-gray-50 dark:bg-[#1a2332]' : ''
                  }`}
                >
                  <span className="text-gray-800 dark:text-gray-200 flex-1 min-w-0">{it.description}</span>
                  <span className="text-gray-900 dark:text-gray-100 font-semibold tabular-nums shrink-0">
                    {formatCentsBR(it.amount_cents)}
                  </span>
                </div>
              ))}
              <div className="flex items-center justify-between gap-3 px-3 py-2 text-sm bg-gradient-to-r from-tc-green to-tc-blue text-white font-bold">
                <span>Total</span>
                <span className="tabular-nums">{formatCentsBR(budget.total_amount_cents)}</span>
              </div>
            </div>
          </div>
        )}

        {/* Download PDF + retomar pagamento */}
        <div className="px-5 pb-5 flex flex-wrap items-center gap-2">
          {pdfDownloadUrl && (
            <a
              href={pdfDownloadUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-600 text-xs font-semibold text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
            >
              <Download className="w-3.5 h-3.5" /> Baixar PDF
            </a>
          )}
          {status === 'awaiting_payment' && onResumePayment && (
            <button
              onClick={() => onResumePayment(budgetId)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-orange-500 hover:bg-orange-600 text-white text-xs font-bold"
            >
              <CreditCard className="w-3.5 h-3.5" /> Retomar pagamento
            </button>
          )}
        </div>
      </div>

      {/* Histórico de revisões (>1) */}
      {payload.revisions.length > 1 && (
        <div className="bg-white dark:!bg-[#243040] rounded-xl border border-gray-200 dark:border-gray-700">
          <button
            onClick={() => setShowHistory(v => !v)}
            className="w-full px-4 py-3 flex items-center justify-between text-sm font-semibold text-gray-700 dark:text-gray-200"
          >
            <span className="flex items-center gap-2">
              <FileText className="w-4 h-4" />
              Histórico de revisões ({payload.revisions.length - 1} {payload.revisions.length - 1 === 1 ? 'versão anterior' : 'versões anteriores'})
            </span>
            {showHistory ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
          {showHistory && (
            <div className="border-t border-gray-100 dark:border-gray-700 divide-y divide-gray-100 dark:divide-gray-700">
              {payload.revisions
                .filter(r => r.revision_number !== budget.current_revision)
                .sort((a, b) => b.revision_number - a.revision_number)
                .map(r => (
                  <div key={r.id} className="px-4 py-2 flex items-center justify-between text-xs">
                    <span className="text-gray-700 dark:text-gray-300">
                      v{r.revision_number} · {formatCentsBR(r.total_amount_cents)}
                      <span className="ml-2 text-gray-400">{formatDate(r.created_at)}</span>
                    </span>
                    {r.pdf_url && tcToken && (
                      <a
                        href={`${r.pdf_url}?tcAuth=${encodeURIComponent(tcToken)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-tc-blue hover:underline inline-flex items-center gap-1"
                      >
                        <Download className="w-3 h-3" /> PDF
                      </a>
                    )}
                  </div>
                ))}
            </div>
          )}
        </div>
      )}

      {/* Comentários (pedidos de revisão) */}
      {payload.requests.length > 0 && (
        <div className="bg-white dark:!bg-[#243040] rounded-xl border border-gray-200 dark:border-gray-700 p-4">
          <h3 className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
            <MessageSquare className="w-3.5 h-3.5" /> Comentários
          </h3>
          <ul className="space-y-2">
            {payload.requests.map(r => (
              <li key={r.id} className="text-xs">
                <div className="flex items-center justify-between text-gray-500 dark:text-gray-400 mb-1">
                  <span className="font-semibold">
                    {r.source === 'auto_edit' ? 'Sistema (edição automática)' : 'Você'} · contra v{r.against_revision_number}
                  </span>
                  <span>{formatDate(r.created_at)}</span>
                </div>
                {r.comment && (
                  <div className="bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-900/40 rounded p-2 text-gray-800 dark:text-gray-200 whitespace-pre-wrap">
                    {r.comment}
                  </div>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* CTAs — só em sent/revision_requested */}
      {canTakeAction && (
        <div className="sticky bottom-4 z-10 bg-white dark:!bg-[#243040] rounded-2xl shadow-xl border border-gray-200 dark:border-gray-700 p-3 flex flex-wrap gap-2 justify-end">
          <button
            type="button"
            onClick={() => setShowRevisionDialog(true)}
            className="inline-flex items-center gap-1.5 px-4 py-2.5 text-sm font-semibold rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700"
          >
            <MessageCircle className="w-4 h-4" /> Solicitar alterações
          </button>
          <button
            type="button"
            onClick={handleAcceptAndPay}
            disabled={submittingAccept}
            className="inline-flex items-center gap-1.5 px-5 py-2.5 text-sm font-bold rounded-lg bg-gradient-to-r from-tc-green to-tc-blue text-white hover:from-tc-green-dark hover:to-tc-blue-dark disabled:opacity-50 shadow-md shadow-tc-blue/30"
          >
            {submittingAccept ? <Loader2 className="w-4 h-4 animate-spin" /> : <CreditCard className="w-4 h-4" />}
            Aprovar e pagar agora
          </button>
        </div>
      )}

      {/* Dialog de pedido de revisão — usa o <Modal> wrapper global (portal +
          backdrop-blur + z-[10050] + ESC + click-outside). Sem isso, o header
          sticky do TerraControlView aparecia em cima do backdrop sem blur. */}
      <Modal isOpen={showRevisionDialog} onClose={() => setShowRevisionDialog(false)}>
        <div className="bg-white dark:!bg-[#1a2332] rounded-2xl shadow-2xl w-full max-w-md p-5 space-y-3">
          <h3 className="text-base font-bold text-gray-900 dark:text-gray-100">Solicitar alterações</h3>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Descreva o que precisa ser ajustado. O admin será notificado e enviará uma nova versão.
          </p>
          <textarea
            value={revisionComment}
            onChange={e => setRevisionComment(e.target.value)}
            rows={5}
            placeholder="Ex: gostaria de remover o item X, ou ajustar o valor de Y…"
            className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:!bg-[#243040] text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-tc-blue"
          />
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowRevisionDialog(false)}
              className="px-3 py-1.5 text-sm rounded-lg border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-200"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleSubmitRevision}
              disabled={submittingRevision || !revisionComment.trim()}
              className="px-3 py-1.5 text-sm font-semibold rounded-lg bg-tc-blue hover:bg-tc-blue-dark text-white disabled:opacity-50 flex items-center gap-1.5"
            >
              {submittingRevision && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              Enviar pedido
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}

export default TcBudgetViewScreen
