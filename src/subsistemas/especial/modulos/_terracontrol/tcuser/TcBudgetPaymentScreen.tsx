// Tela de pagamento PIX (após tc_user aprovar orçamento).
// Renderiza QR Code base64 + copia-cola + countdown + polling de status.
//
// Polling a cada 5s no GET /api/tc-auth/me/budgets/:id. Quando status passa
// pra 'paid' → onPaid() é chamado e a tela sai pra TcBudgetPaidScreen.
// Quando o PIX expira, CTA muda pra "Gerar novo QR Code" → POST /refresh-pix.

import React, { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeft, Copy, Check, Clock, Loader2, RefreshCw, AlertTriangle } from 'lucide-react'
import { useTcAuth } from '@/contexts/TcAuthContext'
import {
  fetchBudget,
  refreshPix,
  type TcBudgetPayload,
  type PixPaymentSnapshot,
} from './tcBudgetApi'

interface NotifyFn {
  (message: string, opts?: { type?: 'success' | 'error' | 'warning' | 'info' }): void
}

interface Props {
  budgetId: string
  // Se já temos snapshot (vindo de onAccepted), evita o 1º fetch
  initialPayment?: PixPaymentSnapshot | null
  onBack: () => void
  onPaid: () => void
  notify: NotifyFn
}

const POLL_INTERVAL_MS = 5_000

function formatCentsBR(cents: number | null | undefined): string {
  const v = (Number(cents) || 0) / 100
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function formatRemaining(ms: number): string {
  if (ms <= 0) return '00:00:00'
  const total = Math.floor(ms / 1000)
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

const TcBudgetPaymentScreen: React.FC<Props> = ({ budgetId, initialPayment, onBack, onPaid, notify }) => {
  const { tcToken } = useTcAuth()
  const [payload, setPayload] = useState<TcBudgetPayload | null>(null)
  const [payment, setPayment] = useState<PixPaymentSnapshot | null>(initialPayment || null)
  const [loading, setLoading] = useState(!initialPayment)
  const [refreshing, setRefreshing] = useState(false)
  const [copied, setCopied] = useState(false)
  const [now, setNow] = useState(Date.now())
  const copiedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Snapshot inicial: se vier do onAccepted, já temos os dados PIX; precisa
  // ainda buscar o payload completo pra ter total/imovel/etc do header.
  useEffect(() => {
    if (!tcToken) return
    let cancelled = false
    ;(async () => {
      try {
        const data = await fetchBudget(tcToken, budgetId)
        if (cancelled) return
        setPayload(data)
        // Se não veio initialPayment, monta a partir do snapshot armazenado no budget
        if (!payment && data.budget.abacatepay_br_code) {
          setPayment({
            brCode: data.budget.abacatepay_br_code,
            brCodeBase64: data.budget.abacatepay_br_code_base64,
            expiresAt: data.budget.abacatepay_expires_at,
            attempt: data.budget.abacatepay_attempt,
          })
        }
        // Se já está pago, manda direto pro sucesso
        if (data.budget.status === 'paid') onPaid()
      } catch (e: any) {
        if (!cancelled) notify(e?.message || 'Erro ao carregar pagamento', { type: 'error' })
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tcToken, budgetId])

  // Polling de status (5s) — encerra ao detectar paid ou ao desmontar
  useEffect(() => {
    if (!tcToken) return
    const interval = setInterval(async () => {
      try {
        const data = await fetchBudget(tcToken, budgetId)
        setPayload(data)
        if (data.budget.status === 'paid') {
          clearInterval(interval)
          onPaid()
        }
      } catch { /* silencioso (rede) */ }
    }, POLL_INTERVAL_MS)
    return () => clearInterval(interval)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tcToken, budgetId])

  // Tick do countdown — 1s
  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(tick)
  }, [])

  const expiresMs = useMemo(() => {
    if (!payment?.expiresAt) return 0
    const exp = new Date(payment.expiresAt).getTime()
    return exp - now
  }, [payment?.expiresAt, now])

  const expired = expiresMs <= 0

  const handleCopy = async () => {
    if (!payment?.brCode) return
    try {
      await navigator.clipboard.writeText(payment.brCode)
      setCopied(true)
      if (copiedTimerRef.current) clearTimeout(copiedTimerRef.current)
      copiedTimerRef.current = setTimeout(() => setCopied(false), 2500)
    } catch {
      notify('Não foi possível copiar — selecione manualmente.', { type: 'warning' })
    }
  }

  const handleRefresh = async () => {
    if (refreshing) return
    setRefreshing(true)
    try {
      const newPayment = await refreshPix(tcToken, budgetId)
      setPayment(newPayment)
      notify('Novo QR Code gerado.', { type: 'success' })
    } catch (e: any) {
      notify(e?.message || 'Erro ao gerar novo QR Code', { type: 'error' })
    } finally {
      setRefreshing(false)
    }
  }

  if (loading) {
    return (
      <div className="max-w-md mx-auto px-4 py-12 text-center text-gray-500 dark:text-gray-400">
        <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2 text-tc-blue" />
        Carregando pagamento…
      </div>
    )
  }

  if (!payload || !payment) {
    return (
      <div className="max-w-md mx-auto px-4 py-12 text-center">
        <AlertTriangle className="w-8 h-8 mx-auto mb-2 text-amber-500" />
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
          Sem cobrança PIX ativa. Volte e aprove o orçamento de novo.
        </p>
        <button onClick={onBack} className="text-sm text-tc-blue hover:underline">Voltar</button>
      </div>
    )
  }

  return (
    <div className="max-w-md mx-auto px-4 py-6 space-y-4">
      <button
        onClick={onBack}
        className="inline-flex items-center gap-1.5 text-sm text-gray-600 dark:text-gray-400 hover:text-tc-blue"
      >
        <ArrowLeft className="w-4 h-4" /> Voltar pro orçamento
      </button>

      <div className="bg-white dark:!bg-[#243040] rounded-2xl shadow-md border border-gray-200 dark:border-gray-700 overflow-hidden">
        <div className="bg-gradient-to-r from-tc-green to-tc-blue px-5 py-4 text-white text-center">
          <p className="text-xs text-blue-100">Pagamento PIX</p>
          <p className="text-2xl font-bold mt-0.5">{formatCentsBR(payload.budget.total_amount_cents)}</p>
        </div>

        {expired ? (
          <div className="p-6 text-center space-y-4">
            <AlertTriangle className="w-10 h-10 mx-auto text-amber-500" />
            <div>
              <p className="text-base font-bold text-gray-900 dark:text-gray-100">QR Code expirou</p>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                Gere um novo pra concluir o pagamento.
              </p>
            </div>
            <button
              onClick={handleRefresh}
              disabled={refreshing}
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-gradient-to-r from-tc-green to-tc-blue text-white text-sm font-bold disabled:opacity-50"
            >
              {refreshing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
              Gerar novo QR Code
            </button>
          </div>
        ) : (
          <div className="p-6 space-y-4">
            {/* Countdown */}
            <div className="flex items-center justify-center gap-2 text-xs text-gray-500 dark:text-gray-400">
              <Clock className="w-3.5 h-3.5" />
              Expira em <span className="font-mono font-bold text-gray-700 dark:text-gray-200">{formatRemaining(expiresMs)}</span>
            </div>

            {/* QR Code */}
            {payment.brCodeBase64 ? (
              <div className="bg-white p-3 rounded-xl border border-gray-200 dark:border-gray-600 mx-auto w-fit">
                <img
                  src={payment.brCodeBase64}
                  alt="QR Code PIX"
                  className="w-56 h-56 block"
                />
              </div>
            ) : (
              <div className="bg-gray-100 dark:bg-gray-800 rounded-xl p-12 text-center text-xs text-gray-500">
                QR Code indisponível — use o código copia-cola abaixo.
              </div>
            )}

            {/* Copia-cola */}
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-1">
                Código PIX copia e cola
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  readOnly
                  value={payment.brCode || ''}
                  onClick={e => (e.target as HTMLInputElement).select()}
                  className="flex-1 px-3 py-2 text-xs font-mono border border-gray-200 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-[#1a2332] text-gray-700 dark:text-gray-200 truncate"
                />
                <button
                  type="button"
                  onClick={handleCopy}
                  className={`px-3 py-2 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors ${
                    copied
                      ? 'bg-green-500 text-white'
                      : 'bg-tc-blue hover:bg-tc-blue-dark text-white'
                  }`}
                >
                  {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  {copied ? 'Copiado' : 'Copiar'}
                </button>
              </div>
            </div>

            {/* Polling indicator */}
            <p className="text-center text-[11px] text-gray-400 dark:text-gray-500 flex items-center justify-center gap-1.5">
              <Loader2 className="w-3 h-3 animate-spin" />
              Verificando pagamento automaticamente…
            </p>

            {payment.attempt > 1 && (
              <p className="text-center text-[10px] text-gray-400">
                Tentativa #{payment.attempt}
              </p>
            )}
          </div>
        )}
      </div>

      <div className="text-center text-xs text-gray-500 dark:text-gray-400 px-2">
        Você será notificado automaticamente quando o pagamento for confirmado.
        Esta tela pode ser fechada — o pagamento continua funcionando.
      </div>
    </div>
  )
}

export default TcBudgetPaymentScreen
