import React, { useCallback, useEffect, useState } from 'react'
import { X, Plus, Edit, Trash2, ToggleLeft, ToggleRight, ArrowRight, AlertTriangle, ChevronUp, ChevronDown } from 'lucide-react'
import Modal from '../Modal'

const API_BASE_URL = '/api'

type RuleActionType = 'change_type'

interface TransactionRule {
  id: string
  name: string
  description_contains: string
  action_type: RuleActionType
  action_value: string | null
  set_category: string | null
  set_subcategory: string | null
  hide_transaction: boolean
  min_value: number | string | null
  max_value: number | string | null
  match_type: string | null
  is_active: boolean
  sort_order: number
  created_by: string | null
  created_at: string
  updated_at: string
}

interface RulePermissions {
  can_create: boolean
  can_edit: boolean
  can_delete: boolean
  is_admin_bypass?: boolean
}

interface RetroactivePreviewTx {
  id: string
  date: string
  description: string
  value: number | string
  type: string
  category: string
  applied_rule_id: string | null
  existing_rule_id: string | null
  existing_rule_name: string | null
}

interface DeleteAffectedTx {
  id: string
  date: string
  description: string
  value: number | string
  type: string
}

interface Props {
  isOpen: boolean
  onClose: () => void
  onRulesChanged?: () => void
}

const VALID_ACTION_VALUES = ['Receita', 'Despesa', 'Transferência entre contas']

interface FormState {
  name: string
  description_contains: string
  action_type: RuleActionType
  applyType: boolean
  applyCategory: boolean
  applySubcategory: boolean
  applyHide: boolean
  action_value: string
  set_category: string
  set_subcategory: string
  // Condições opcionais (strings para facilitar o input vazio)
  min_value: string
  max_value: string
  match_type: string // '' = qualquer
  is_active: boolean
}

const emptyForm: FormState = {
  name: '',
  description_contains: '',
  action_type: 'change_type',
  applyType: true,
  applyCategory: false,
  applySubcategory: false,
  applyHide: false,
  action_value: 'Transferência entre contas',
  set_category: '',
  set_subcategory: '',
  min_value: '',
  max_value: '',
  match_type: '',
  is_active: true,
}

const TransactionRulesModal: React.FC<Props> = ({ isOpen, onClose, onRulesChanged }) => {
  const [rules, setRules] = useState<TransactionRule[]>([])
  const [perms, setPerms] = useState<RulePermissions>({ can_create: false, can_edit: false, can_delete: false })
  const [loading, setLoading] = useState(false)
  const [view, setView] = useState<'list' | 'edit'>('list')
  const [editing, setEditing] = useState<TransactionRule | null>(null)
  const [form, setForm] = useState<FormState>(emptyForm)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)
  const [availableSubcategories, setAvailableSubcategories] = useState<string[]>([])

  // Preview retroativo (mostrado depois de salvar uma regra). Em edição,
  // também inclui transações "órfãs" — que estavam governadas pela regra
  // mas não dão mais match com a nova condição (oferece revertê-las).
  const [retroPreview, setRetroPreview] = useState<{
    ruleId: string
    matches: RetroactivePreviewTx[]
    excluded: Set<string>
    orphans: RetroactivePreviewTx[]
    orphansToRevert: Set<string>
  } | null>(null)

  // Confirmação de exclusão (3 opções)
  const [deletePrompt, setDeletePrompt] = useState<{ rule: TransactionRule; affected: DeleteAffectedTx[] } | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const r = await fetch(`${API_BASE_URL}/transaction-rules`)
      const j = await r.json()
      if (j.success) {
        setRules(j.data || [])
        if (j.permissions) setPerms(j.permissions)
      }
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!isOpen) return
    refresh()
    fetch(`${API_BASE_URL}/subcategories`).then(r => r.json()).then(j => {
      if (j.success) setAvailableSubcategories((j.data || []).map((s: { name: string } | string) => typeof s === 'string' ? s : s.name))
    }).catch(() => {})
  }, [isOpen, refresh])

  // ESC do modal principal: se está no modo edit, ESC volta pro list (sem fechar
  // o modal). Senão, fecha. Os sub-modais (retroPreview/deletePrompt) têm seu
  // próprio handler via <Modal> e o stack do componente garante que apenas o
  // topo responda ao ESC.
  const handleMainEsc = useCallback(() => {
    if (view === 'edit') {
      setView('list')
      setEditing(null)
      setErrors({})
      return
    }
    onClose()
  }, [view, onClose])

  if (!isOpen) return null

  const startCreate = () => {
    if (!perms.can_create) return
    setEditing(null)
    setForm(emptyForm)
    setErrors({})
    setView('edit')
  }

  const startEdit = (rule: TransactionRule) => {
    if (!perms.can_edit) return
    setEditing(rule)
    setForm({
      name: rule.name,
      description_contains: rule.description_contains,
      action_type: rule.action_type,
      applyType: !!rule.action_value,
      applyCategory: !!rule.set_category,
      applySubcategory: !!rule.set_subcategory,
      applyHide: !!rule.hide_transaction,
      action_value: rule.action_value || 'Transferência entre contas',
      set_category: rule.set_category || '',
      set_subcategory: rule.set_subcategory || '',
      min_value: rule.min_value != null ? String(rule.min_value) : '',
      max_value: rule.max_value != null ? String(rule.max_value) : '',
      match_type: rule.match_type || '',
      is_active: rule.is_active,
    })
    setErrors({})
    setView('edit')
  }

  const validate = (): boolean => {
    const e: Record<string, string> = {}
    if (!form.name.trim()) e.name = 'Nome obrigatório'
    if (!form.description_contains.trim()) e.description_contains = 'Trecho da descrição obrigatório'
    if (!form.applyType && !form.applyCategory && !form.applySubcategory && !form.applyHide) {
      e.actions = 'Marque ao menos uma ação (tipo, categoria, subcategoria ou ignorar)'
    }
    if (form.applyType && !VALID_ACTION_VALUES.includes(form.action_value)) e.action_value = 'Tipo destino inválido'
    if (form.applyCategory && !form.set_category.trim()) e.set_category = 'Informe a categoria'
    if (form.applySubcategory && !form.set_subcategory.trim()) e.set_subcategory = 'Informe a subcategoria'
    if (form.min_value && form.max_value) {
      const mn = parseFloat(form.min_value)
      const mx = parseFloat(form.max_value)
      if (!isNaN(mn) && !isNaN(mx) && mn > mx) e.value_range = 'Valor mínimo deve ser ≤ máximo'
    }
    setErrors(e)
    return Object.keys(e).length === 0
  }

  const submitForm = async () => {
    if (!validate()) return
    setSubmitting(true)
    try {
      const body = JSON.stringify({
        name: form.name.trim(),
        description_contains: form.description_contains.trim(),
        action_type: form.action_type,
        action_value:     form.applyType        ? form.action_value           : null,
        set_category:     form.applyCategory    ? form.set_category.trim()    : null,
        set_subcategory:  form.applySubcategory ? form.set_subcategory.trim() : null,
        hide_transaction: form.applyHide,
        min_value:  form.min_value === '' ? null : parseFloat(form.min_value),
        max_value:  form.max_value === '' ? null : parseFloat(form.max_value),
        match_type: form.match_type || null,
        is_active: form.is_active,
      })
      let savedRule: TransactionRule | null = null
      if (editing) {
        const r = await fetch(`${API_BASE_URL}/transaction-rules/${editing.id}`, {
          method: 'PUT', headers: { 'Content-Type': 'application/json' }, body,
        })
        const j = await r.json()
        if (!j.success) { alert(j.error || 'Falha ao salvar regra'); return }
        savedRule = j.data
      } else {
        const r = await fetch(`${API_BASE_URL}/transaction-rules`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body,
        })
        const j = await r.json()
        if (!j.success) { alert(j.error || 'Falha ao criar regra'); return }
        savedRule = j.data
      }
      const wasEditing = !!editing
      await refresh()
      setView('list')
      setEditing(null)

      // Abre preview retroativo para o usuário decidir o que aplicar nas transações
      // já existentes. Em edição, também busca transações órfãs (governadas pela
      // regra mas que não casam mais com a nova condição) para oferecer reversão.
      if (savedRule) {
        const newDesc = savedRule.description_contains.toLowerCase()

        const [matchesResp, affectedResp] = await Promise.all([
          fetch(`${API_BASE_URL}/transaction-rules/preview`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ description_contains: savedRule.description_contains, ruleId: savedRule.id }),
          }).then(r => r.json()),
          wasEditing
            ? fetch(`${API_BASE_URL}/transaction-rules/${savedRule.id}/affected`).then(r => r.json())
            : Promise.resolve({ success: true, data: [] }),
        ])

        const matches: RetroactivePreviewTx[] = (matchesResp.success ? (matchesResp.data || []) : [])
          .filter((t: RetroactivePreviewTx) => !t.existing_rule_id || t.existing_rule_id === savedRule!.id)
          .filter((t: RetroactivePreviewTx) => t.applied_rule_id !== savedRule!.id) // já governadas pela regra ficam de fora (não há nada a aplicar)

        // Órfãs: governadas pela regra mas cuja descrição não contém mais a nova condição
        const orphans: RetroactivePreviewTx[] = (affectedResp.success ? (affectedResp.data || []) : [])
          .filter((t: RetroactivePreviewTx) => !(t.description || '').toLowerCase().includes(newDesc))

        if (matches.length > 0 || orphans.length > 0) {
          setRetroPreview({
            ruleId: savedRule.id,
            matches,
            excluded: new Set(),
            orphans,
            orphansToRevert: new Set(orphans.map((t) => t.id)),
          })
        }
      }
    } finally {
      setSubmitting(false)
    }
  }

  const moveRule = async (index: number, direction: -1 | 1) => {
    if (!perms.can_edit) return
    const target = index + direction
    if (target < 0 || target >= rules.length) return
    // Reordena localmente (otimista)
    const reordered = [...rules]
    const [moved] = reordered.splice(index, 1)
    reordered.splice(target, 0, moved)
    setRules(reordered)
    // Persiste
    try {
      const r = await fetch(`${API_BASE_URL}/transaction-rules/reorder`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderedIds: reordered.map(rr => rr.id) }),
      })
      const j = await r.json()
      if (!j.success) { alert(j.error || 'Falha ao reordenar'); await refresh() }
    } catch { await refresh() }
  }

  const toggleActive = async (rule: TransactionRule) => {
    if (!perms.can_edit) return
    const r = await fetch(`${API_BASE_URL}/transaction-rules/${rule.id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_active: !rule.is_active }),
    })
    const j = await r.json()
    if (j.success) await refresh()
  }

  const startDelete = async (rule: TransactionRule) => {
    if (!perms.can_delete) return
    // Busca transações afetadas (que têm applied_rule_id = rule.id)
    const r = await fetch(`${API_BASE_URL}/transaction-rules/preview`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ description_contains: rule.description_contains }),
    })
    const j = await r.json()
    const affected: DeleteAffectedTx[] = ((j.data as RetroactivePreviewTx[]) || []).filter((t) => t.applied_rule_id === rule.id)
    setDeletePrompt({ rule, affected })
  }

  const confirmDelete = async (transactionAction: 'delete' | 'revert' | 'keep') => {
    if (!deletePrompt) return
    setSubmitting(true)
    try {
      const r = await fetch(`${API_BASE_URL}/transaction-rules/${deletePrompt.rule.id}`, {
        method: 'DELETE', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transactionAction }),
      })
      const j = await r.json()
      if (!j.success) { alert(j.error || 'Falha ao excluir'); return }
      setDeletePrompt(null)
      await refresh()
      onRulesChanged?.()
    } finally {
      setSubmitting(false)
    }
  }

  const applyRetroactive = async () => {
    if (!retroPreview) return
    setSubmitting(true)
    try {
      // 1. Aplica regra retroativamente nas novas matches
      if (retroPreview.matches.length > 0) {
        const r = await fetch(`${API_BASE_URL}/transaction-rules/${retroPreview.ruleId}/apply-retroactive`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ excludedTransactionIds: Array.from(retroPreview.excluded) }),
        })
        const j = await r.json()
        if (!j.success) { alert(j.error || 'Falha na aplicação retroativa'); return }
      }
      // 2. Reverte transações órfãs marcadas
      if (retroPreview.orphansToRevert.size > 0) {
        const r2 = await fetch(`${API_BASE_URL}/transaction-rules/${retroPreview.ruleId}/revert`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ transactionIds: Array.from(retroPreview.orphansToRevert) }),
        })
        const j2 = await r2.json()
        if (!j2.success) { alert(j2.error || 'Falha ao reverter órfãs'); return }
      }
      setRetroPreview(null)
      onRulesChanged?.()
    } finally {
      setSubmitting(false)
    }
  }

  // "Decidir depois": marca TODAS as matches como A confirmar para o usuário
  // resolver via sino/badge/bulk quando quiser. As órfãs (se houver) não são
  // tocadas — continuam governadas pela regra.
  const markAllPending = async () => {
    if (!retroPreview) return
    if (retroPreview.matches.length === 0) { setRetroPreview(null); return }
    setSubmitting(true)
    try {
      const r = await fetch(`${API_BASE_URL}/transaction-rules/${retroPreview.ruleId}/mark-pending-retroactive`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transactionIds: retroPreview.matches.map((t) => t.id) }),
      })
      const j = await r.json()
      if (!j.success) { alert(j.error || 'Falha ao marcar como pendente'); return }
      setRetroPreview(null)
      onRulesChanged?.()
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={handleMainEsc}>
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700 bg-gradient-to-r from-purple-50 to-indigo-50 dark:from-purple-900/30 dark:to-indigo-900/30">
          <div>
            <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">Conjunto de Regras</h2>
            <p className="text-xs text-gray-600 dark:text-gray-400">Classifique transações automaticamente por trecho da descrição</p>
          </div>
          <button
            onClick={handleMainEsc}
            className="text-gray-500 hover:text-gray-800 dark:hover:text-gray-200"
            aria-label={view === 'edit' ? 'Voltar para lista' : 'Fechar modal'}
          >
            <X className="w-5 h-5" aria-hidden="true" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6">
          {view === 'list' && (
            <>
              <div className="flex justify-between items-center mb-4">
                <span className="text-sm text-gray-600 dark:text-gray-400">{rules.length} regra(s)</span>
                <button
                  disabled={!perms.can_create}
                  onClick={startCreate}
                  className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-lg shadow-sm"
                  title={perms.can_create ? 'Criar nova regra' : 'Você não tem permissão para criar regras'}
                >
                  <Plus className="w-4 h-4" /> Nova Regra
                </button>
              </div>

              {loading && <p className="text-sm text-gray-500">Carregando...</p>}

              {!loading && rules.length === 0 && (
                <div className="text-center py-12 text-gray-500 dark:text-gray-400">
                  <p className="mb-2">Nenhuma regra cadastrada ainda.</p>
                  <p className="text-xs">As regras aplicam automaticamente um tipo a transações cuja descrição contém um trecho específico.</p>
                </div>
              )}

              {!loading && rules.length > 0 && (
                <ul className="space-y-2">
                  {rules.map((rule, index) => (
                    <li
                      key={rule.id}
                      className={`flex items-center gap-3 p-4 rounded-xl border ${rule.is_active ? 'border-purple-200 bg-purple-50 dark:bg-purple-900/10 dark:border-purple-800/40' : 'border-gray-200 bg-gray-50 dark:bg-gray-700/30 dark:border-gray-600 opacity-70'}`}
                    >
                      <div className="flex flex-col -my-1">
                        <button
                          onClick={() => moveRule(index, -1)}
                          disabled={!perms.can_edit || index === 0}
                          title="Mover para cima"
                          className="p-0.5 text-gray-500 hover:text-purple-600 disabled:opacity-30 disabled:cursor-not-allowed"
                        >
                          <ChevronUp className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => moveRule(index, 1)}
                          disabled={!perms.can_edit || index === rules.length - 1}
                          title="Mover para baixo"
                          className="p-0.5 text-gray-500 hover:text-purple-600 disabled:opacity-30 disabled:cursor-not-allowed"
                        >
                          <ChevronDown className="w-4 h-4" />
                        </button>
                      </div>
                      <button onClick={() => toggleActive(rule)} disabled={!perms.can_edit} title={perms.can_edit ? (rule.is_active ? 'Desativar' : 'Ativar') : 'Sem permissão'} className="disabled:cursor-not-allowed">
                        {rule.is_active
                          ? <ToggleRight className="w-7 h-7 text-purple-600" />
                          : <ToggleLeft className="w-7 h-7 text-gray-400" />}
                      </button>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-gray-900 dark:text-gray-100 truncate">{rule.name}</p>
                        <p className="text-xs text-gray-600 dark:text-gray-400 mt-0.5 truncate">
                          Se descrição contém <span className="font-mono px-1.5 py-0.5 rounded bg-gray-200 dark:bg-gray-700">{rule.description_contains}</span>
                          {(rule.min_value != null || rule.max_value != null) && (
                            <>
                              {' · '}valor
                              {rule.min_value != null && ` ≥ R$ ${Number(rule.min_value).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`}
                              {rule.max_value != null && ` ≤ R$ ${Number(rule.max_value).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`}
                            </>
                          )}
                          {rule.match_type && <> · tipo atual: <span className="font-semibold">{rule.match_type}</span></>}
                          <ArrowRight className="inline w-3 h-3 mx-1" />
                          {[
                            rule.action_value && `tipo: ${rule.action_value}`,
                            rule.set_category && `categoria: ${rule.set_category}`,
                            rule.set_subcategory && `subcat: ${rule.set_subcategory}`,
                            rule.hide_transaction && 'ocultar',
                          ].filter(Boolean).join(' · ')}
                        </p>
                      </div>
                      <button onClick={() => startEdit(rule)} disabled={!perms.can_edit} className="p-2 text-blue-600 hover:bg-blue-100 dark:hover:bg-blue-900/30 rounded-lg disabled:opacity-40 disabled:cursor-not-allowed" title="Editar">
                        <Edit className="w-4 h-4" />
                      </button>
                      <button onClick={() => startDelete(rule)} disabled={!perms.can_delete} className="p-2 text-red-600 hover:bg-red-100 dark:hover:bg-red-900/30 rounded-lg disabled:opacity-40 disabled:cursor-not-allowed" title="Excluir">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}

              {!perms.can_create && !perms.can_edit && !perms.can_delete && (
                <div className="mt-6 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg text-xs text-amber-800 dark:text-amber-300">
                  Você só pode visualizar as regras. Peça a um administrador para conceder permissão de criar/editar/excluir.
                </div>
              )}
            </>
          )}

          {view === 'edit' && (
            <div className="space-y-4">
              <button onClick={() => { setView('list'); setEditing(null); setErrors({}) }} className="text-sm text-purple-600 hover:underline mb-2">← Voltar</button>
              <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">{editing ? 'Editar regra' : 'Nova regra'}</h3>

              <div>
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">Nome da regra *</label>
                <input
                  type="text" value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder='Ex: "Transferência interna IMP Geotecnologias"'
                  className={`w-full px-3 py-2 border rounded-xl dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100 ${errors.name ? 'border-red-500' : 'border-gray-300'}`}
                />
                {errors.name && <p className="text-xs text-red-500 mt-1">{errors.name}</p>}
              </div>

              <div className="border border-gray-200 dark:border-gray-700 rounded-xl p-4 space-y-3">
                <p className="text-sm font-semibold text-gray-700 dark:text-gray-300">Condições para casar a transação</p>

                <div>
                  <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">Descrição contém *</label>
                  <input
                    type="text" value={form.description_contains}
                    onChange={(e) => setForm((f) => ({ ...f, description_contains: e.target.value }))}
                    placeholder='Ex: "IMP GEOTECNOLOGIAS APLICADAS LTDA"'
                    className={`w-full px-3 py-2 border rounded-xl font-mono text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100 ${errors.description_contains ? 'border-red-500' : 'border-gray-300'}`}
                  />
                  <p className="text-xs text-gray-500 mt-1">Comparação é case-insensitive.</p>
                  {errors.description_contains && <p className="text-xs text-red-500 mt-1">{errors.description_contains}</p>}
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">Valor mínimo (opcional)</label>
                    <input
                      type="number" step="0.01" min="0"
                      value={form.min_value}
                      onChange={(e) => setForm((f) => ({ ...f, min_value: e.target.value }))}
                      placeholder="0,00"
                      className={`w-full px-3 py-2 border rounded-xl text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100 ${errors.value_range ? 'border-red-500' : 'border-gray-300'}`}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">Valor máximo (opcional)</label>
                    <input
                      type="number" step="0.01" min="0"
                      value={form.max_value}
                      onChange={(e) => setForm((f) => ({ ...f, max_value: e.target.value }))}
                      placeholder="Sem limite"
                      className={`w-full px-3 py-2 border rounded-xl text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100 ${errors.value_range ? 'border-red-500' : 'border-gray-300'}`}
                    />
                  </div>
                </div>
                {errors.value_range && <p className="text-xs text-red-500 -mt-2">{errors.value_range}</p>}
                <p className="text-xs text-gray-500">A faixa compara o valor absoluto da transação. Deixe em branco para qualquer valor.</p>

                <div>
                  <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">Apenas se o tipo atual for</label>
                  <select
                    value={form.match_type}
                    onChange={(e) => setForm((f) => ({ ...f, match_type: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100"
                  >
                    <option value="">Qualquer tipo</option>
                    <option value="Receita">Receita</option>
                    <option value="Despesa">Despesa</option>
                    <option value="Transferência entre contas">Transferência entre contas</option>
                  </select>
                </div>
              </div>

              <div className="border border-gray-200 dark:border-gray-700 rounded-xl p-4 space-y-3">
                <p className="text-sm font-semibold text-gray-700 dark:text-gray-300">O que a regra faz? *</p>
                {errors.actions && <p className="text-xs text-red-500">{errors.actions}</p>}

                {/* Ação: mudar tipo */}
                <div>
                  <label className="flex items-center gap-2 select-none">
                    <input type="checkbox" checked={form.applyType} onChange={(e) => setForm((f) => ({ ...f, applyType: e.target.checked }))} />
                    <span className="text-sm font-medium">Mudar tipo para</span>
                  </label>
                  {form.applyType && (
                    <select
                      value={form.action_value}
                      onChange={(e) => setForm((f) => ({ ...f, action_value: e.target.value }))}
                      className={`mt-2 ml-6 w-[calc(100%-1.5rem)] px-3 py-2 border rounded-xl dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100 ${errors.action_value ? 'border-red-500' : 'border-gray-300'}`}
                    >
                      {VALID_ACTION_VALUES.map((v) => (
                        <option key={v} value={v}>{v}</option>
                      ))}
                    </select>
                  )}
                </div>

                {/* Ação: categorizar */}
                <div>
                  <label className="flex items-center gap-2 select-none">
                    <input type="checkbox" checked={form.applyCategory} onChange={(e) => setForm((f) => ({ ...f, applyCategory: e.target.checked }))} />
                    <span className="text-sm font-medium">Categorizar como</span>
                  </label>
                  {form.applyCategory && (
                    <input
                      type="text"
                      value={form.set_category}
                      onChange={(e) => setForm((f) => ({ ...f, set_category: e.target.value }))}
                      placeholder='Ex: "Fixo"'
                      className={`mt-2 ml-6 w-[calc(100%-1.5rem)] px-3 py-2 border rounded-xl dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100 ${errors.set_category ? 'border-red-500' : 'border-gray-300'}`}
                    />
                  )}
                  {form.applyCategory && errors.set_category && <p className="text-xs text-red-500 mt-1 ml-6">{errors.set_category}</p>}
                </div>

                {/* Ação: subcategorizar */}
                <div>
                  <label className="flex items-center gap-2 select-none">
                    <input type="checkbox" checked={form.applySubcategory} onChange={(e) => setForm((f) => ({ ...f, applySubcategory: e.target.checked }))} />
                    <span className="text-sm font-medium">Subcategorizar como</span>
                  </label>
                  {form.applySubcategory && (
                    <>
                      <input
                        list="rules-subcat-list"
                        type="text"
                        value={form.set_subcategory}
                        onChange={(e) => setForm((f) => ({ ...f, set_subcategory: e.target.value }))}
                        placeholder='Ex: "Salários"'
                        className={`mt-2 ml-6 w-[calc(100%-1.5rem)] px-3 py-2 border rounded-xl dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100 ${errors.set_subcategory ? 'border-red-500' : 'border-gray-300'}`}
                      />
                      <datalist id="rules-subcat-list">
                        {availableSubcategories.map((s) => <option key={s} value={s} />)}
                      </datalist>
                    </>
                  )}
                  {form.applySubcategory && errors.set_subcategory && <p className="text-xs text-red-500 mt-1 ml-6">{errors.set_subcategory}</p>}
                </div>

                {/* Ação: ignorar/ocultar */}
                <div className="pt-2 border-t border-gray-100 dark:border-gray-700">
                  <label className="flex items-center gap-2 select-none">
                    <input type="checkbox" checked={form.applyHide} onChange={(e) => setForm((f) => ({ ...f, applyHide: e.target.checked }))} />
                    <span className="text-sm font-medium">Ignorar / ocultar a transação</span>
                  </label>
                  {form.applyHide && (
                    <p className="text-xs text-gray-500 mt-1 ml-6">A transação some das listas e dos totais (DRE, Dashboard, relatórios). Útil para duplicatas, taxas irrelevantes ou estornos automáticos.</p>
                  )}
                </div>
              </div>

              <label className="flex items-center gap-2 select-none">
                <input type="checkbox" checked={form.is_active} onChange={(e) => setForm((f) => ({ ...f, is_active: e.target.checked }))} />
                <span className="text-sm">Regra ativa</span>
              </label>

              <div className="flex justify-end gap-2 pt-4 border-t border-gray-200 dark:border-gray-700">
                <button onClick={() => { setView('list'); setEditing(null); setErrors({}) }} className="px-4 py-2 text-sm font-semibold text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg">
                  Cancelar
                </button>
                <button onClick={submitForm} disabled={submitting} className="px-5 py-2 text-sm font-semibold bg-purple-600 hover:bg-purple-700 disabled:bg-gray-400 text-white rounded-lg shadow-sm">
                  {submitting ? 'Salvando...' : editing ? 'Salvar alterações' : 'Criar regra'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Modal preview retroativo (aninhado) */}
      <Modal
        isOpen={!!retroPreview}
        onClose={() => setRetroPreview(null)}
        zIndexClass="z-[10100]"
      >
        {retroPreview && (
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-3xl max-h-[85vh] flex flex-col overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 bg-gradient-to-r from-purple-50 to-indigo-50 dark:from-purple-900/30 dark:to-indigo-900/30 flex items-start justify-between gap-2">
              <div className="min-w-0">
                <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">Revisar impacto retroativo</h3>
                <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                  {retroPreview.matches.length > 0 && `${retroPreview.matches.length} nova(s) transação(ões) podem ser classificadas.`}
                  {retroPreview.matches.length > 0 && retroPreview.orphans.length > 0 && ' '}
                  {retroPreview.orphans.length > 0 && `${retroPreview.orphans.length} transação(ões) não casam mais com a regra editada.`}
                </p>
              </div>
              <button
                onClick={() => setRetroPreview(null)}
                className="text-gray-500 hover:text-gray-800 dark:hover:text-gray-200 flex-shrink-0"
                aria-label="Fechar modal"
              >
                <X className="w-5 h-5" aria-hidden="true" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {/* Seção 1: Novas matches */}
              {retroPreview.matches.length > 0 && (
                <div>
                  <p className="text-xs font-bold text-purple-700 dark:text-purple-300 mb-2 uppercase tracking-wide">Aplicar a regra nestas transações</p>
                  <div className="space-y-1">
                    {retroPreview.matches.map((t) => {
                      const isExcluded = retroPreview.excluded.has(t.id)
                      return (
                        <label key={t.id} className={`flex items-center gap-3 p-2 rounded-lg cursor-pointer ${isExcluded ? 'opacity-50' : 'bg-purple-50 dark:bg-purple-900/10'}`}>
                          <input
                            type="checkbox"
                            checked={!isExcluded}
                            onChange={() => setRetroPreview((p) => {
                              if (!p) return p
                              const excluded = new Set(p.excluded)
                              if (excluded.has(t.id)) excluded.delete(t.id); else excluded.add(t.id)
                              return { ...p, excluded }
                            })}
                          />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">{t.description}</p>
                            <p className="text-xs text-gray-500">{t.date} · {t.type} · R$ {Number(t.value).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                          </div>
                        </label>
                      )
                    })}
                  </div>
                  <button
                    onClick={() => setRetroPreview((p) => p ? { ...p, excluded: new Set(p.matches.map((t) => t.id)) } : null)}
                    className="text-xs text-gray-500 hover:underline mt-2"
                  >
                    Só daqui pra frente (desmarcar todas)
                  </button>
                </div>
              )}

              {/* Seção 2: Órfãs (só aparece em edição) */}
              {retroPreview.orphans.length > 0 && (
                <div>
                  <p className="text-xs font-bold text-amber-700 dark:text-amber-300 mb-2 uppercase tracking-wide">Reverter transações que não casam mais</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
                    Estas transações foram classificadas por esta regra, mas com a nova condição não dão mais match. Marque para reverter ao tipo/categoria originais.
                  </p>
                  <div className="space-y-1">
                    {retroPreview.orphans.map((t) => {
                      const willRevert = retroPreview.orphansToRevert.has(t.id)
                      return (
                        <label key={t.id} className={`flex items-center gap-3 p-2 rounded-lg cursor-pointer ${willRevert ? 'bg-amber-50 dark:bg-amber-900/10' : 'opacity-50'}`}>
                          <input
                            type="checkbox"
                            checked={willRevert}
                            onChange={() => setRetroPreview((p) => {
                              if (!p) return p
                              const set = new Set(p.orphansToRevert)
                              if (set.has(t.id)) set.delete(t.id); else set.add(t.id)
                              return { ...p, orphansToRevert: set }
                            })}
                          />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">{t.description}</p>
                            <p className="text-xs text-gray-500">{t.date} · {t.type} · R$ {Number(t.value).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                          </div>
                        </label>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>
            <div className="flex flex-col sm:flex-row sm:justify-end sm:items-center px-6 py-4 border-t border-gray-200 dark:border-gray-700 gap-2">
              <button onClick={() => setRetroPreview(null)} className="px-4 py-2 text-sm font-semibold text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg">
                Cancelar
              </button>
              {retroPreview.matches.length > 0 && (
                <button
                  onClick={markAllPending}
                  disabled={submitting}
                  className="px-4 py-2 text-sm font-semibold text-amber-700 dark:text-amber-300 bg-amber-50 hover:bg-amber-100 dark:bg-amber-900/30 dark:hover:bg-amber-900/50 rounded-lg"
                  title="Marca todas as transações como 'A confirmar' para você decidir depois"
                >
                  {submitting ? 'Aguarde...' : `Decidir depois (${retroPreview.matches.length})`}
                </button>
              )}
              <button onClick={applyRetroactive} disabled={submitting} className="px-5 py-2 text-sm font-semibold bg-purple-600 hover:bg-purple-700 disabled:bg-gray-400 text-white rounded-lg shadow-sm">
                {submitting
                  ? 'Aplicando...'
                  : `Aplicar (${retroPreview.matches.length - retroPreview.excluded.size} aplicar, ${retroPreview.orphansToRevert.size} reverter)`}
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* Modal de exclusão com 3 opções (destrutivo — não fecha ao clicar fora) */}
      <Modal
        isOpen={!!deletePrompt}
        onClose={() => setDeletePrompt(null)}
        zIndexClass="z-[10100]"
        destructive
      >
        {deletePrompt && (
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-2xl flex flex-col overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 bg-gradient-to-r from-red-50 to-orange-50 dark:from-red-900/30 dark:to-orange-900/30 flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0" />
                  <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">Excluir regra "{deletePrompt.rule.name}"</h3>
                </div>
                <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                  Esta regra já modificou {deletePrompt.affected.length} transação(ões). O que fazer com elas?
                </p>
              </div>
              <button
                onClick={() => setDeletePrompt(null)}
                className="text-gray-500 hover:text-gray-800 dark:hover:text-gray-200 flex-shrink-0"
                aria-label="Fechar modal"
              >
                <X className="w-5 h-5" aria-hidden="true" />
              </button>
            </div>
            <div className="p-6 space-y-3">
              <button onClick={() => confirmDelete('revert')} disabled={submitting} className="w-full text-left p-4 border-2 border-gray-200 hover:border-purple-400 hover:bg-purple-50 dark:hover:bg-purple-900/20 rounded-xl transition-colors">
                <p className="font-semibold">Reverter ao tipo original</p>
                <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">Volta as transações ao tipo antes da regra (Receita/Despesa).</p>
              </button>
              <button onClick={() => confirmDelete('keep')} disabled={submitting} className="w-full text-left p-4 border-2 border-gray-200 hover:border-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-xl transition-colors">
                <p className="font-semibold">Manter como está</p>
                <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">Transações mantêm o tipo modificado, mas perdem a referência à regra.</p>
              </button>
              <button onClick={() => confirmDelete('delete')} disabled={submitting} className="w-full text-left p-4 border-2 border-red-200 hover:border-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-xl transition-colors">
                <p className="font-semibold text-red-700 dark:text-red-400">Excluir as transações</p>
                <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">Remove permanentemente as {deletePrompt.affected.length} transação(ões) afetadas. Esta ação não pode ser desfeita.</p>
              </button>
            </div>
            <div className="flex justify-end px-6 py-4 border-t border-gray-200 dark:border-gray-700">
              <button onClick={() => setDeletePrompt(null)} className="px-4 py-2 text-sm font-semibold text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg">
                Cancelar
              </button>
            </div>
          </div>
        )}
      </Modal>
    </Modal>
  )
}

export default TransactionRulesModal
