// Aba "Configurações" do TerraControl admin — edita o template padrão de
// orçamento (1 ativo MVP). Mesmo editor TipTap do TcBudgetEditorModal mas
// sem tabela de itens próprios — só itens default que vão pré-preenchidos
// em todos os orçamentos novos.

import React, { useCallback, useEffect, useState } from 'react'
import { Loader2, Plus, Save, Settings as SettingsIcon, Trash2 } from 'lucide-react'
import { useEditor, EditorContent, type Editor } from '@tiptap/react'
import { useAuth } from '@/contexts/AuthContext'
import {
  tiptapExtensions,
  EMPTY_TIPTAP_DOC,
  AVAILABLE_VARIABLES,
} from './tiptap-config'
import { fetchTemplate, saveTemplate, type BudgetItem } from './budgetApi'

interface NotifyFn {
  (message: string, opts?: { type?: 'success' | 'error' | 'warning' | 'info' }): void
}

interface EditableItem {
  id: string
  description: string
  amountStr: string
}

const localId = () => Math.random().toString(36).slice(2) + Date.now().toString(36)

function parseAmountToCents(str: string): number {
  if (!str) return 0
  const cleaned = String(str).replace(/[^\d.,-]/g, '').trim()
  if (!cleaned) return 0
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

interface Props {
  notify: NotifyFn
}

const TcBudgetSettingsTab: React.FC<Props> = ({ notify }) => {
  const { token } = useAuth()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [items, setItems] = useState<EditableItem[]>([])

  const editor = useEditor({
    extensions: tiptapExtensions,
    content: EMPTY_TIPTAP_DOC,
    editorProps: {
      attributes: {
        class: 'prose prose-sm dark:prose-invert max-w-none min-h-[300px] px-4 py-3 text-sm text-gray-900 dark:text-gray-100 focus:outline-none leading-relaxed',
      },
    },
  })

  // Hidrata ao montar (1x)
  useEffect(() => {
    if (!editor) return
    let cancelled = false
    ;(async () => {
      setLoading(true)
      try {
        const tpl = await fetchTemplate(token)
        if (cancelled) return
        if (tpl?.content_json) {
          editor.commands.setContent(tpl.content_json, { emitUpdate: false })
        } else {
          editor.commands.setContent(EMPTY_TIPTAP_DOC, { emitUpdate: false })
        }
        setItems(
          (tpl?.default_items || []).map((it: BudgetItem) => ({
            id: localId(),
            description: it.description || '',
            amountStr: ((it.amount_cents || 0) / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 }),
          }))
        )
      } catch (e: any) {
        notify(e?.message || 'Erro ao carregar template', { type: 'error' })
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor])

  const insertVariable = useCallback((label: string) => {
    if (!editor) return
    editor.chain().focus().insertContent(label).run()
  }, [editor])

  const addItem = () => setItems(prev => [...prev, { id: localId(), description: '', amountStr: '' }])
  const removeItem = (id: string) => setItems(prev => prev.filter(i => i.id !== id))
  const updateItem = (id: string, patch: Partial<EditableItem>) =>
    setItems(prev => prev.map(i => i.id === id ? { ...i, ...patch } : i))

  const handleSave = async () => {
    if (saving || !editor) return
    setSaving(true)
    try {
      const cleanItems: BudgetItem[] = items
        .map(it => ({
          description: it.description.trim(),
          amount_cents: parseAmountToCents(it.amountStr),
        }))
        .filter(it => it.description)
      await saveTemplate(token, {
        name: 'Padrão',
        contentJson: editor.getJSON(),
        defaultItems: cleanItems,
      })
      notify('Template salvo', { type: 'success' })
    } catch (e: any) {
      notify(e?.message || 'Erro ao salvar template', { type: 'error' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="bg-white dark:!bg-[#243040] rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-4">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-3">
          <div className="min-w-0">
            <h2 className="text-base font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
              <SettingsIcon className="w-4 h-4 shrink-0" />
              Template padrão do orçamento
            </h2>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              Conteúdo pré-preenchido toda vez que abrir o modal "Gerar orçamento". Variáveis ficam disponíveis nos chips abaixo.
            </p>
          </div>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || loading}
            className="w-full sm:w-auto justify-center inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg bg-gradient-to-r from-tc-green to-tc-blue text-white hover:from-tc-green-dark hover:to-tc-blue-dark disabled:opacity-50 shrink-0"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Salvar template
          </button>
        </div>

        {loading ? (
          <div className="py-12 text-center text-sm text-gray-500 dark:text-gray-400">
            <Loader2 className="w-5 h-5 animate-spin inline mr-2" /> Carregando…
          </div>
        ) : (
          <>
            <div className="border border-gray-200 dark:border-gray-600 rounded-lg overflow-hidden">
              <div className="flex flex-wrap gap-1 px-3 py-2 border-b border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-[#1a2332]">
                <ToolbarButtons editor={editor} />
              </div>
              <div className="px-3 py-2 border-b border-gray-100 dark:border-gray-700 bg-blue-50/30 dark:bg-blue-900/10">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-[10px] uppercase font-bold text-gray-500 dark:text-gray-400 tracking-wider mr-1">
                    Variáveis:
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
              <EditorContent editor={editor} />
            </div>
          </>
        )}
      </div>

      <div className="bg-white dark:!bg-[#243040] rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-4">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="text-sm font-bold text-gray-800 dark:text-gray-200">Itens padrão</h3>
            <p className="text-[11px] text-gray-500 dark:text-gray-400">
              Pré-preenchem a tabela de itens em novos orçamentos. Cada admin pode ajustar caso a caso.
            </p>
          </div>
          <button
            type="button"
            onClick={addItem}
            className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-lg bg-tc-blue/10 hover:bg-tc-blue/20 text-tc-blue"
          >
            <Plus className="w-3 h-3" /> Adicionar
          </button>
        </div>

        <div className="space-y-2">
          {items.length === 0 ? (
            <div className="text-center text-xs text-gray-500 dark:text-gray-400 py-6 border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-lg">
              Nenhum item padrão. Adicione se quiser que apareçam pré-preenchidos.
            </div>
          ) : items.map(it => (
            <div key={it.id} className="flex flex-col sm:flex-row gap-2 sm:items-center bg-gray-50 dark:bg-[#1a2332] border border-gray-200 dark:border-gray-700 rounded-lg p-2">
              <input
                type="text"
                value={it.description}
                onChange={e => updateItem(it.id, { description: e.target.value })}
                placeholder="Descrição do serviço"
                className="w-full sm:flex-1 px-2 py-1.5 text-xs border border-gray-200 dark:border-gray-600 rounded bg-white dark:!bg-[#243040] text-gray-900 dark:text-gray-100"
              />
              {/* No mobile: valor (cresce) + lixeira dividem uma segunda linha.
                  No sm+: valor com largura fixa ao lado da descrição. */}
              <div className="flex gap-2 items-center">
                <div className="relative flex-1 sm:w-40">
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
                  className="px-2 py-1.5 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 rounded border border-red-200 dark:border-red-800/50 shrink-0"
                  title="Remover item"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

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

export default TcBudgetSettingsTab
