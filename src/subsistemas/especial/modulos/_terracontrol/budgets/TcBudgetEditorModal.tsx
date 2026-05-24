// Modal full-height pro admin gerar ou revisar orçamento.
// 2 áreas: editor TipTap (corpo do orçamento) à esquerda + tabela de itens
// à direita. Total recalculado automaticamente. Footer com Cancelar/Enviar.
//
// Modo: criação (nenhum budget ativo) → POST /api/admin/tc-budgets
//       revisão (budget já existe)    → POST /api/admin/tc-budgets/:id/revise
//
// Pré-preenchimento:
//   - Se existe budget: usa content_json + items da revisão mais recente
//   - Senão: usa template ativo (variáveis {{...}} substituídas pelo contexto)

import React, { useEffect, useMemo, useState } from 'react'
import { X, Plus, Trash2, Loader2, FileText, Save, Eye, EyeOff, FileSearch } from 'lucide-react'
import { useEditor, EditorContent, type Editor } from '@tiptap/react'
import Modal from '@/components/Modal'
import { useAuth } from '@/contexts/AuthContext'
import {
  tiptapExtensions,
  substituteVariables,
  EMPTY_TIPTAP_DOC,
  AVAILABLE_VARIABLES,
} from './tiptap-config'
import {
  fetchTemplate,
  sendNewBudget,
  reviseBudget,
  previewBudgetPdf,
  type Budget,
  type BudgetRevision,
  type BudgetItem,
} from './budgetApi'

interface NotifyFn {
  (message: string, opts?: { type?: 'success' | 'error' | 'warning' | 'info' }): void
}

interface RecordLite {
  id: string
  imovel?: string
  municipio?: string
  cod_imovel?: number | string | null
  area_total?: number | string | null
  reserva_legal?: number | string | null
  created_by_tc_user_id?: string | null
}

interface Props {
  isOpen: boolean
  onClose: () => void
  record: RecordLite
  // Quando passado, modal abre em modo revisão (PUT /revise). Senão, criação.
  existingBudget?: Budget | null
  // Revisão atual pra pré-preencher edição
  existingRevision?: BudgetRevision | null
  // Nome do tc_user dono pra substituir {{tcUserName}}
  tcUserName?: string | null
  onSaved: (budget: Budget, revision: BudgetRevision) => void
  notify: NotifyFn
}

interface EditableItem {
  id: string  // local; não vai pro backend
  description: string
  amountStr: string  // formatado pra UI, convertido pra cents no submit
}

const localId = () => Math.random().toString(36).slice(2) + Date.now().toString(36)

// Parse "1.234,56" / "1234.56" / "1234,56" → 123456 cents. Vazio → 0.
function parseAmountToCents(str: string): number {
  if (!str) return 0
  const cleaned = String(str).replace(/[^\d.,-]/g, '').trim()
  if (!cleaned) return 0
  // Detecta separador decimal: se tem vírgula E ponto, vírgula é decimal; só
  // vírgula → decimal; só ponto → decimal.
  let normalized: string
  if (cleaned.includes(',') && cleaned.includes('.')) {
    normalized = cleaned.replace(/\./g, '').replace(',', '.')
  } else if (cleaned.includes(',')) {
    normalized = cleaned.replace(',', '.')
  } else {
    normalized = cleaned
  }
  const n = Number(normalized)
  if (!Number.isFinite(n) || n < 0) return 0
  return Math.round(n * 100)
}

function formatCentsBR(cents: number): string {
  const v = (Number(cents) || 0) / 100
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

const TcBudgetEditorModal: React.FC<Props> = ({
  isOpen, onClose, record, existingBudget, existingRevision, tcUserName, onSaved, notify,
}) => {
  const { token } = useAuth()
  const isRevision = !!existingBudget && existingBudget.current_revision > 0

  const [items, setItems] = useState<EditableItem[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [loadingTemplate, setLoadingTemplate] = useState(false)
  // Toggle "Preview" — mostra como o tc_user verá o orçamento (TipTap em
  // readonly + tabela de itens visual + variáveis {{...}} substituídas pelos
  // valores reais do registro). Útil pra revisar antes de enviar.
  const [showPreview, setShowPreview] = useState(false)
  // Preview PDF — object URL do blob retornado pelo backend; quando definido,
  // abre sub-modal com iframe. Cleanup do URL ao fechar.
  const [pdfPreviewUrl, setPdfPreviewUrl] = useState<string | null>(null)
  const [generatingPdfPreview, setGeneratingPdfPreview] = useState(false)

  const editor = useEditor({
    extensions: tiptapExtensions,
    content: EMPTY_TIPTAP_DOC,
    editorProps: {
      attributes: {
        class: 'prose prose-sm dark:prose-invert max-w-none min-h-[400px] px-4 py-3 text-sm text-gray-900 dark:text-gray-100 focus:outline-none leading-relaxed',
      },
    },
  })

  // Editor secundário em modo readonly — exclusivo do preview. Sincronizado
  // com o conteúdo atual quando o usuário liga o toggle, com variáveis
  // substituídas pelo contexto do registro.
  const previewEditor = useEditor({
    extensions: tiptapExtensions,
    content: EMPTY_TIPTAP_DOC,
    editable: false,
    editorProps: {
      attributes: {
        class: 'prose prose-sm dark:prose-invert max-w-none min-h-[400px] px-4 py-3 text-sm text-gray-900 dark:text-gray-100 leading-relaxed',
      },
    },
  })

  // Atualiza o preview toda vez que ele é ligado, pegando o snapshot atual
  // do editor e rodando substituteVariables. Não fica observando o editor
  // continuamente — usuário precisa toggle pra refresh (evita re-render
  // pesado a cada keystroke).
  useEffect(() => {
    if (!showPreview || !editor || !previewEditor) return
    const ctx = {
      imovel: record.imovel,
      municipio: record.municipio,
      codImovel: record.cod_imovel,
      areaTotal: record.area_total,
      reservaLegal: record.reserva_legal,
      tcUserName,
    }
    const substituted = substituteVariables(editor.getJSON(), ctx)
    previewEditor.commands.setContent(substituted, { emitUpdate: false })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showPreview, previewEditor, editor])

  // Hidrata ao abrir
  useEffect(() => {
    if (!isOpen || !editor) return
    let cancelled = false
    ;(async () => {
      if (isRevision && existingRevision) {
        // Revisão: carrega conteúdo + itens da revisão atual
        editor.commands.setContent(existingRevision.content_json || EMPTY_TIPTAP_DOC, { emitUpdate: false })
        setItems(
          (existingRevision.items || []).map(it => ({
            id: localId(),
            description: it.description || '',
            amountStr: ((it.amount_cents || 0) / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 }),
          }))
        )
      } else {
        // Criação: busca template e substitui variáveis
        setLoadingTemplate(true)
        try {
          const tpl = await fetchTemplate(token)
          if (cancelled) return
          if (tpl?.content_json) {
            const ctx = {
              imovel: record.imovel,
              municipio: record.municipio,
              codImovel: record.cod_imovel,
              areaTotal: record.area_total,
              reservaLegal: record.reserva_legal,
              tcUserName,
            }
            const substituted = substituteVariables(tpl.content_json, ctx)
            editor.commands.setContent(substituted, { emitUpdate: false })
          } else {
            editor.commands.setContent(EMPTY_TIPTAP_DOC, { emitUpdate: false })
          }
          const defaults = (tpl?.default_items || []).map((it: BudgetItem) => ({
            id: localId(),
            description: it.description || '',
            amountStr: ((it.amount_cents || 0) / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 }),
          }))
          setItems(defaults)
        } catch {
          editor.commands.setContent(EMPTY_TIPTAP_DOC, { emitUpdate: false })
          setItems([])
        } finally {
          if (!cancelled) setLoadingTemplate(false)
        }
      }
    })()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, editor, isRevision, existingRevision?.id, record.id])

  const totalCents = useMemo(
    () => items.reduce((sum, it) => sum + parseAmountToCents(it.amountStr), 0),
    [items]
  )

  const addItem = () => setItems(prev => [...prev, { id: localId(), description: '', amountStr: '' }])
  const removeItem = (id: string) => setItems(prev => prev.filter(i => i.id !== id))
  const updateItem = (id: string, patch: Partial<EditableItem>) =>
    setItems(prev => prev.map(i => i.id === id ? { ...i, ...patch } : i))

  const insertVariable = (varLabel: string) => {
    if (!editor) return
    editor.chain().focus().insertContent(varLabel).run()
  }

  // Visualizar PDF — gera PDF temporário no backend com o conteúdo atual do
  // editor e abre num sub-modal com iframe. NÃO persiste, NÃO envia o
  // orçamento. Reusa o renderer do envio real, então o preview é fiel.
  const handlePreviewPdf = async () => {
    if (generatingPdfPreview || !editor) return
    setGeneratingPdfPreview(true)
    try {
      const cleanItems: BudgetItem[] = items
        .map(it => ({
          description: it.description.trim(),
          amount_cents: parseAmountToCents(it.amountStr),
        }))
        .filter(it => it.description && it.amount_cents > 0)
      const blob = await previewBudgetPdf(token, {
        terracontrolId: record.id,
        contentJson: editor.getJSON(),
        items: cleanItems,
      })
      const url = URL.createObjectURL(blob)
      // Revoga URL anterior se houver (evita memory leak)
      if (pdfPreviewUrl) URL.revokeObjectURL(pdfPreviewUrl)
      setPdfPreviewUrl(url)
    } catch (e: any) {
      notify(e?.message || 'Erro ao gerar preview do PDF', { type: 'error' })
    } finally {
      setGeneratingPdfPreview(false)
    }
  }

  // Cleanup: revoga object URL ao desmontar (ou ao fechar o sub-modal)
  useEffect(() => {
    return () => {
      if (pdfPreviewUrl) URL.revokeObjectURL(pdfPreviewUrl)
    }
  }, [pdfPreviewUrl])

  const handleSubmit = async () => {
    if (submitting || !editor) return
    if (items.length === 0) {
      notify('Adicione pelo menos um item ao orçamento.', { type: 'warning' })
      return
    }
    const cleanItems: BudgetItem[] = items
      .map(it => ({
        description: it.description.trim(),
        amount_cents: parseAmountToCents(it.amountStr),
      }))
      .filter(it => it.description && it.amount_cents > 0)
    if (cleanItems.length === 0) {
      notify('Os itens precisam ter descrição e valor maior que zero.', { type: 'warning' })
      return
    }
    if (cleanItems.length !== items.length) {
      notify('Itens sem descrição ou valor foram ignorados.', { type: 'info' })
    }
    setSubmitting(true)
    try {
      const contentJson = editor.getJSON()
      const result = isRevision
        ? await reviseBudget(token, existingBudget!.id, { contentJson, items: cleanItems })
        : await sendNewBudget(token, { terracontrolId: record.id, contentJson, items: cleanItems })
      notify(isRevision ? `Orçamento revisado (v${result.revision.revision_number}) e enviado` : 'Orçamento enviado', { type: 'success' })
      onSaved(result.budget, result.revision)
      onClose()
    } catch (err: any) {
      notify(err?.message || 'Erro ao enviar orçamento', { type: 'error' })
    } finally {
      setSubmitting(false)
    }
  }

  if (!isOpen) return null

  return (
    <Modal isOpen={isOpen} onClose={onClose}>
      <div className="bg-white dark:!bg-[#1a2332] rounded-2xl shadow-2xl w-[96vw] max-w-6xl max-h-[92vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-tc-green to-tc-blue px-6 py-4 text-white flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold">
              {isRevision
                ? `Revisar orçamento (v${(existingBudget?.current_revision || 0) + 1})`
                : 'Gerar orçamento'}
            </h2>
            <p className="text-xs text-blue-100 mt-0.5">
              {record.imovel} {record.municipio ? `· ${record.municipio}` : ''}
            </p>
          </div>
          <button type="button" onClick={onClose} className="text-white/80 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Corpo: editor à esquerda + itens à direita */}
        <div className="flex-1 overflow-hidden grid grid-cols-1 lg:grid-cols-3 gap-0">
          {/* Editor TipTap */}
          <div className="lg:col-span-2 flex flex-col border-r border-gray-200 dark:border-gray-700 overflow-hidden">
            <div className="px-4 py-2 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-[#243040] flex flex-wrap items-center gap-2">
              {!showPreview && <ToolbarButtons editor={editor} />}
              {showPreview && (
                <span className="text-[11px] font-semibold uppercase tracking-wider text-tc-blue flex items-center gap-1.5">
                  <Eye className="w-3.5 h-3.5" /> Preview — como o cliente verá
                </span>
              )}
              <div className="ml-auto flex items-center gap-1.5">
                {/* Visualizar PDF — gera o PDF real (mesmo renderer do envio)
                    e abre num sub-modal. Disponível em qualquer modo
                    (edit ou preview). */}
                <button
                  type="button"
                  onClick={handlePreviewPdf}
                  disabled={generatingPdfPreview}
                  title="Visualizar como vai ficar o PDF anexado ao e-mail"
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold bg-white dark:bg-[#1a2332] border border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50"
                >
                  {generatingPdfPreview
                    ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Gerando…</>
                    : <><FileSearch className="w-3.5 h-3.5" /> Visualizar PDF</>}
                </button>
                <button
                  type="button"
                  onClick={() => setShowPreview(v => !v)}
                  title={showPreview ? 'Voltar a editar' : 'Visualizar como o cliente verá'}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold transition-colors ${
                    showPreview
                      ? 'bg-tc-blue text-white hover:bg-tc-blue-dark'
                      : 'bg-white dark:bg-[#1a2332] border border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700'
                  }`}
                >
                  {showPreview ? <><EyeOff className="w-3.5 h-3.5" /> Editar</> : <><Eye className="w-3.5 h-3.5" /> Preview</>}
                </button>
              </div>
            </div>
            {/* Chips de variáveis — só em criação E não em preview */}
            {!isRevision && !showPreview && (
              <div className="px-4 py-2 border-b border-gray-100 dark:border-gray-700 bg-blue-50/30 dark:bg-blue-900/10">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-[10px] uppercase font-bold text-gray-500 dark:text-gray-400 tracking-wider mr-1">
                    Inserir variável:
                  </span>
                  {AVAILABLE_VARIABLES.map(v => (
                    <button
                      key={v.key}
                      type="button"
                      onMouseDown={(e) => { e.preventDefault(); insertVariable(v.label) }}
                      title={`Ex: ${v.example}`}
                      className="text-[11px] px-2 py-0.5 rounded-full bg-white dark:bg-[#1a2332] border border-blue-200 dark:border-blue-800/60 text-blue-700 dark:text-blue-300 font-mono hover:bg-blue-100 dark:hover:bg-blue-900/30"
                    >
                      {v.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <div className="flex-1 overflow-auto bg-white dark:bg-[#1a2332] relative">
              {loadingTemplate && (
                <div className="absolute inset-0 flex items-center justify-center bg-white/70 dark:bg-[#1a2332]/70 z-10">
                  <Loader2 className="w-5 h-5 animate-spin text-tc-blue" />
                </div>
              )}
              {/* Editor real (oculto, mas montado) vs preview readonly.
                  display:none em vez de unmount preserva o conteúdo + cursor. */}
              <div className={showPreview ? 'hidden' : ''}>
                <EditorContent editor={editor} />
              </div>
              <div className={showPreview ? '' : 'hidden'}>
                <EditorContent editor={previewEditor} />
              </div>
            </div>
          </div>

          {/* Tabela de itens */}
          <div className="lg:col-span-1 flex flex-col overflow-hidden bg-gray-50 dark:bg-[#141e2d]">
            <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
              <h3 className="text-sm font-bold text-gray-800 dark:text-gray-200">Itens</h3>
              {!showPreview && (
                <button
                  type="button"
                  onClick={addItem}
                  className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-lg bg-tc-blue/10 hover:bg-tc-blue/20 text-tc-blue"
                >
                  <Plus className="w-3 h-3" /> Adicionar
                </button>
              )}
            </div>
            <div className="flex-1 overflow-auto px-3 py-3 space-y-2">
              {/* Preview: lista visual no estilo do TcBudgetViewScreen */}
              {showPreview ? (
                items.length === 0 ? (
                  <div className="text-center text-xs text-gray-500 dark:text-gray-400 py-12">
                    Nenhum item.
                  </div>
                ) : (
                  <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden bg-white dark:bg-[#1a2332]">
                    {items.map((it, idx) => (
                      <div
                        key={it.id}
                        className={`flex items-center justify-between gap-3 px-3 py-2 text-xs ${
                          idx % 2 === 1 ? 'bg-gray-50 dark:bg-[#141e2d]' : ''
                        }`}
                      >
                        <span className="text-gray-800 dark:text-gray-200 flex-1 min-w-0">
                          {it.description || <span className="italic text-gray-400">(sem descrição)</span>}
                        </span>
                        <span className="text-gray-900 dark:text-gray-100 font-semibold tabular-nums shrink-0">
                          {formatCentsBR(parseAmountToCents(it.amountStr))}
                        </span>
                      </div>
                    ))}
                  </div>
                )
              ) : items.length === 0 ? (
                <div className="text-center text-xs text-gray-500 dark:text-gray-400 py-12">
                  Nenhum item ainda.<br />Clique em "Adicionar".
                </div>
              ) : items.map((it) => (
                <div key={it.id} className="bg-white dark:bg-[#1a2332] border border-gray-200 dark:border-gray-700 rounded-lg p-2 space-y-1">
                  <input
                    type="text"
                    value={it.description}
                    onChange={e => updateItem(it.id, { description: e.target.value })}
                    placeholder="Descrição do serviço"
                    className="w-full px-2 py-1.5 text-xs border border-gray-200 dark:border-gray-600 rounded bg-white dark:!bg-[#243040] text-gray-900 dark:text-gray-100"
                  />
                  <div className="flex gap-1">
                    <div className="relative flex-1">
                      <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[11px] text-gray-400">R$</span>
                      <input
                        type="text"
                        inputMode="decimal"
                        value={it.amountStr}
                        onChange={e => updateItem(it.id, { amountStr: e.target.value })}
                        placeholder="0,00"
                        className="w-full pl-7 pr-2 py-1.5 text-xs border border-gray-200 dark:border-gray-600 rounded bg-white dark:!bg-[#243040] text-gray-900 dark:text-gray-100 text-right tabular-nums"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => removeItem(it.id)}
                      className="px-2 py-1.5 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 rounded border border-red-200 dark:border-red-800/50"
                      title="Remover item"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
            {/* Total */}
            <div className="px-4 py-3 border-t border-gray-200 dark:border-gray-700 bg-gradient-to-r from-tc-green to-tc-blue">
              <div className="flex items-center justify-between text-white">
                <span className="text-xs font-bold uppercase tracking-wider">Total</span>
                <span className="text-lg font-bold tabular-nums">{formatCentsBR(totalCents)}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-[#243040] flex justify-between items-center gap-2">
          <p className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1.5">
            <FileText className="w-3.5 h-3.5" />
            Ao enviar, o tc_user recebe notificação + e-mail com PDF anexado.
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:!bg-[#1a2332] text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={submitting || totalCents <= 0}
              className="px-4 py-2 text-sm font-semibold rounded-lg bg-gradient-to-r from-tc-green to-tc-blue text-white hover:from-tc-green-dark hover:to-tc-blue-dark disabled:opacity-50 flex items-center gap-2"
            >
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              {isRevision ? 'Reenviar orçamento' : 'Enviar orçamento'}
            </button>
          </div>
        </div>
      </div>

      {/* Sub-modal de visualização de PDF — iframe + botão fechar/baixar.
          Object URL é revogado quando pdfPreviewUrl é setado pra null. */}
      {pdfPreviewUrl && (
        <Modal isOpen={true} onClose={() => setPdfPreviewUrl(null)}>
          <div className="bg-white dark:!bg-[#1a2332] rounded-2xl shadow-2xl w-[96vw] max-w-5xl h-[90vh] flex flex-col overflow-hidden">
            <div className="bg-gradient-to-r from-tc-green to-tc-blue px-5 py-3 text-white flex items-center justify-between">
              <h3 className="text-base font-bold flex items-center gap-2">
                <FileSearch className="w-4 h-4" /> Preview do PDF
              </h3>
              <div className="flex items-center gap-2">
                <a
                  href={pdfPreviewUrl}
                  download="preview-orcamento.pdf"
                  className="text-xs font-semibold px-2.5 py-1 rounded-md bg-white/20 hover:bg-white/30 text-white"
                >
                  Baixar
                </a>
                <button type="button" onClick={() => setPdfPreviewUrl(null)} className="text-white/80 hover:text-white">
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>
            <div className="flex-1 min-h-0 bg-gray-100 dark:bg-[#0d1420]">
              <iframe
                src={pdfPreviewUrl}
                title="Preview do PDF do orçamento"
                className="w-full h-full"
              />
            </div>
          </div>
        </Modal>
      )}
    </Modal>
  )
}

// ─── Toolbar simples — reusa padrão do LegalManagement/FooterManagement ────

const ToolbarButtons: React.FC<{ editor: Editor | null }> = ({ editor }) => {
  if (!editor) return null
  const Btn = ({ onClick, active, title, children }: { onClick: () => void; active?: boolean; title: string; children: React.ReactNode }) => (
    <button
      type="button"
      onMouseDown={(e) => { e.preventDefault(); onClick() }}
      title={title}
      className={`px-2 py-1 rounded text-xs font-medium transition-colors ${
        active
          ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
          : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
      }`}
    >{children}</button>
  )
  return (
    <>
      <Btn onClick={() => editor.chain().focus().toggleBold().run()} active={editor.isActive('bold')} title="Negrito"><strong>N</strong></Btn>
      <Btn onClick={() => editor.chain().focus().toggleItalic().run()} active={editor.isActive('italic')} title="Itálico"><em>I</em></Btn>
      <div className="w-px h-4 bg-gray-200 dark:bg-gray-600 mx-1" />
      <Btn onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()} active={editor.isActive('heading', { level: 1 })} title="Título 1">H1</Btn>
      <Btn onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} active={editor.isActive('heading', { level: 2 })} title="Título 2">H2</Btn>
      <Btn onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} active={editor.isActive('heading', { level: 3 })} title="Título 3">H3</Btn>
      <div className="w-px h-4 bg-gray-200 dark:bg-gray-600 mx-1" />
      <Btn onClick={() => editor.chain().focus().toggleBulletList().run()} active={editor.isActive('bulletList')} title="Lista">• Lista</Btn>
      <Btn onClick={() => editor.chain().focus().toggleOrderedList().run()} active={editor.isActive('orderedList')} title="Lista numerada">1. Lista</Btn>
      <Btn onClick={() => editor.chain().focus().setHorizontalRule().run()} title="Divisor">─</Btn>
      <div className="w-px h-4 bg-gray-200 dark:bg-gray-600 mx-1" />
      <Btn onClick={() => editor.chain().focus().undo().run()} title="Desfazer">↩</Btn>
      <Btn onClick={() => editor.chain().focus().redo().run()} title="Refazer">↪</Btn>
    </>
  )
}

export default TcBudgetEditorModal
