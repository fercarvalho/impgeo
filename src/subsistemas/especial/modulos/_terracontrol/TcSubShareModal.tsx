// Modal pra tc_user gerar sub-share link a partir dos imóveis aos quais ele
// tem acesso. Aberto por:
//   - Botão "Compartilhar" no header da view (modo bulk: pré-seleciona todos)
//   - Botão pequeno em cada card (modo individual: pré-seleciona aquele imóvel)
//
// O backend (POST /api/tc-auth/me/share-links) já filtra os IDs contra o
// tc_user_record_access do usuário, então mesmo que o frontend mande algo
// fora do acesso, o backend ignora silenciosamente.
//
// Form: nome opcional, senha opcional, data de expiração opcional, lista de
// registros com checkboxes. Após criar, mostra a URL com botão de copiar.

import React, { useEffect, useMemo, useState } from 'react'
import { X, Search, CheckSquare, Square, Loader2, Copy, Share2, Calendar, Lock, Eye, EyeOff, Check } from 'lucide-react'
import Modal from '@/components/Modal'
import type { TerraControlRecord } from './types'
import { formatCodImovel, getSafeImovelName } from './normalize'

interface NotifyFn {
  (message: string, opts?: { type?: 'success' | 'error' | 'warning' | 'info' }): void
}

interface Props {
  isOpen: boolean
  onClose: () => void
  tcToken: string
  /** Lista completa dos registros que o tc_user tem acesso */
  records: TerraControlRecord[]
  /** IDs pré-selecionados ao abrir o modal (bulk = todos, single = um) */
  initialSelectedIds: string[]
  notify: NotifyFn
}

const TcSubShareModal: React.FC<Props> = ({
  isOpen, onClose, tcToken, records, initialSelectedIds, notify,
}) => {
  const [name, setName] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [expiresAt, setExpiresAt] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set(initialSelectedIds))
  const [search, setSearch] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [generatedUrl, setGeneratedUrl] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  // Resync ao reabrir
  useEffect(() => {
    if (isOpen) {
      setName('')
      setPassword('')
      setExpiresAt('')
      setSelected(new Set(initialSelectedIds))
      setSearch('')
      setGeneratedUrl(null)
      setCopied(false)
      setShowPassword(false)
    }
  }, [isOpen, initialSelectedIds])

  const filteredRecords = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return records
    return records.filter(r => {
      const hay = [
        getSafeImovelName(r.imovel),
        r.codImovel ? formatCodImovel(r.codImovel) : '',
        r.municipio || '',
      ].join(' ').toLowerCase()
      return hay.includes(q)
    })
  }, [records, search])

  const toggleRecord = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const toggleAllVisible = () => {
    const visibleIds = filteredRecords.map(r => String(r.id))
    const allSelected = visibleIds.length > 0 && visibleIds.every(id => selected.has(id))
    setSelected(prev => {
      const next = new Set(prev)
      if (allSelected) visibleIds.forEach(id => next.delete(id))
      else visibleIds.forEach(id => next.add(id))
      return next
    })
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (submitting) return
    if (selected.size === 0) {
      notify('Selecione ao menos um imóvel pra compartilhar', { type: 'warning' })
      return
    }
    setSubmitting(true)
    try {
      const res = await fetch('/api/tc-auth/me/share-links', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${tcToken}`,
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          name: name.trim() || undefined,
          password: password || undefined,
          expiresAt: expiresAt || undefined,
          selectedIds: Array.from(selected),
        }),
      })
      const data = await res.json()
      if (res.ok && data.success) {
        const url = `${window.location.origin}/v/${data.token}`
        setGeneratedUrl(url)
        notify('Link gerado', { type: 'success' })
      } else {
        notify(data.error || 'Erro ao gerar link', { type: 'error' })
      }
    } catch (err: any) {
      notify(err?.message || 'Erro de conexão', { type: 'error' })
    } finally {
      setSubmitting(false)
    }
  }

  const handleCopy = async () => {
    if (!generatedUrl) return
    try {
      await navigator.clipboard.writeText(generatedUrl)
      setCopied(true)
      notify('Link copiado', { type: 'success' })
      setTimeout(() => setCopied(false), 2000)
    } catch {
      notify('Selecione e copie manualmente', { type: 'warning' })
    }
  }

  if (!isOpen) return null

  return (
    <Modal isOpen={isOpen} onClose={onClose}>
      <div className="bg-white dark:!bg-[#1a2332] rounded-2xl shadow-2xl w-[96vw] max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
        <div className="bg-gradient-to-r from-tc-green to-tc-blue px-6 py-4 text-white flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Share2 className="w-5 h-5" />
            <h2 className="text-lg font-bold">Compartilhar link</h2>
          </div>
          <button type="button" onClick={onClose} className="text-white/80 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        {generatedUrl ? (
          // ────────────────────────── Fase 2: link gerado ──────────────────────────
          <div className="p-6 space-y-4">
            <div className="text-center py-4">
              <div className="mx-auto w-14 h-14 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center mb-3">
                <Check className="w-7 h-7 text-green-600 dark:text-green-400" />
              </div>
              <h3 className="text-base font-bold text-gray-900 dark:text-gray-100">Link pronto pra compartilhar</h3>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Envie pra quem precisa visualizar os imóveis.</p>
            </div>
            <div className="bg-gray-50 dark:bg-[#243040] border border-gray-200 dark:border-gray-700 rounded-xl p-3 flex items-center gap-2">
              <div className="font-mono text-xs flex-1 select-all text-gray-900 dark:text-gray-100 break-all">
                {generatedUrl}
              </div>
              <button
                type="button"
                onClick={handleCopy}
                className="p-2 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300 flex-shrink-0"
                title="Copiar"
              >
                {copied ? <Check className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4" />}
              </button>
            </div>
            <div className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
              Quem receber o link {password ? 'precisará da senha que você definiu pra acessar' : 'consegue visualizar os imóveis selecionados (sem login)'}.
              {expiresAt && <> O link expira em <strong>{new Date(expiresAt).toLocaleString('pt-BR')}</strong>.</>}
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => { setGeneratedUrl(null); setName(''); setPassword(''); setExpiresAt('') }}
                className="px-4 py-2 text-sm font-medium rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:!bg-[#1a2332] text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700"
              >
                Gerar outro link
              </button>
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-sm font-semibold rounded-lg bg-gradient-to-r from-tc-green to-tc-blue text-white hover:from-tc-green-dark hover:to-tc-blue-dark"
              >
                Concluir
              </button>
            </div>
          </div>
        ) : (
          // ────────────────────────── Fase 1: form ──────────────────────────
          <form onSubmit={handleSubmit} className="flex-1 flex flex-col overflow-hidden">
            <div className="flex-1 overflow-auto p-6 space-y-5">
              {/* Configurações do link */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                    Nome do link <span className="text-gray-400 font-normal">(opcional — ajuda você a reconhecer depois)</span>
                  </label>
                  <input type="text" value={name} onChange={(e) => setName(e.target.value)}
                    placeholder="Ex: Cliente XPTO, Banco do Brasil"
                    className="w-full h-10 px-3 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:!bg-[#243040] text-gray-900 dark:text-gray-100" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1 flex items-center gap-1.5">
                    <Lock className="w-3 h-3" /> Senha <span className="text-gray-400 font-normal">(opcional)</span>
                  </label>
                  <div className="relative">
                    <input type={showPassword ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)}
                      placeholder="Sem senha = acesso direto"
                      className="w-full h-10 px-3 pr-10 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:!bg-[#243040] text-gray-900 dark:text-gray-100" />
                    <button type="button" onClick={() => setShowPassword(s => !s)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-500">
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1 flex items-center gap-1.5">
                    <Calendar className="w-3 h-3" /> Expira em <span className="text-gray-400 font-normal">(opcional)</span>
                  </label>
                  <input type="datetime-local" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)}
                    className="w-full h-10 px-3 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:!bg-[#243040] text-gray-900 dark:text-gray-100" />
                </div>
              </div>

              {/* Lista de imóveis */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-semibold text-gray-700 dark:text-gray-300">
                    Imóveis a compartilhar <span className="font-normal text-gray-500">({selected.size} de {records.length})</span>
                  </label>
                  <button type="button" onClick={toggleAllVisible}
                    className="text-xs font-medium text-tc-blue hover:underline">
                    {filteredRecords.length > 0 && filteredRecords.every(r => selected.has(String(r.id)))
                      ? 'Limpar visíveis' : 'Selecionar visíveis'}
                  </button>
                </div>
                <div className="relative mb-2">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input type="text" value={search} onChange={(e) => setSearch(e.target.value)}
                    placeholder="Buscar imóvel..."
                    className="w-full pl-9 pr-3 h-9 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:!bg-[#243040] text-gray-900 dark:text-gray-100" />
                </div>
                <div className="border border-gray-200 dark:border-gray-700 rounded-lg max-h-64 overflow-y-auto">
                  {filteredRecords.length === 0 ? (
                    <div className="text-center py-8 text-sm text-gray-500">Nenhum imóvel</div>
                  ) : (
                    <ul className="divide-y divide-gray-100 dark:divide-gray-800">
                      {filteredRecords.map(r => {
                        const id = String(r.id)
                        const isSelected = selected.has(id)
                        return (
                          <li key={id}>
                            <button type="button" onClick={() => toggleRecord(id)}
                              className="w-full flex items-center gap-3 px-3 py-2 text-left hover:bg-gray-50 dark:hover:bg-[#243040]">
                              {isSelected
                                ? <CheckSquare className="w-4 h-4 text-tc-green flex-shrink-0" />
                                : <Square className="w-4 h-4 text-gray-400 flex-shrink-0" />}
                              <div className="flex-1 min-w-0">
                                <div className="text-sm text-gray-900 dark:text-gray-100 truncate">{r.imovel}</div>
                                <div className="text-xs text-gray-500 dark:text-gray-400 font-mono">
                                  #{formatCodImovel(r.codImovel)} {r.municipio ? `· ${r.municipio}` : ''}
                                </div>
                              </div>
                            </button>
                          </li>
                        )
                      })}
                    </ul>
                  )}
                </div>
              </div>
            </div>

            <div className="px-6 py-3 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-[#243040] flex justify-end gap-2">
              <button type="button" onClick={onClose}
                className="px-4 py-2 text-sm font-medium rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:!bg-[#1a2332] text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700">
                Cancelar
              </button>
              <button type="submit" disabled={submitting || selected.size === 0}
                className="px-4 py-2 text-sm font-semibold rounded-lg bg-gradient-to-r from-tc-green to-tc-blue text-white hover:from-tc-green-dark hover:to-tc-blue-dark disabled:opacity-50 flex items-center gap-2">
                {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
                Gerar link
              </button>
            </div>
          </form>
        )}
      </div>
    </Modal>
  )
}

export default TcSubShareModal
