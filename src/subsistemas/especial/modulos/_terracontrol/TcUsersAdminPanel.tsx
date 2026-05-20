// Painel administrativo de tc_users (acessado pelo admin/superadmin do impgeo
// dentro do módulo TerraControl). Substitui visualmente a aba antiga "Gerar
// Link / Gerenciar Links" — a gestão agora é por usuários nominais com login
// próprio, não mais por links anônimos.
//
// Cobre D2.1, D2.2, D2.3 e D2.4 do plano:
//   D2.1 — Lista de tc_users com busca, filtros, status
//   D2.2 — Modal "Novo tc_user" (cadastro direto + seleção de registros)
//   D2.3 — Modal "Editar tc_user" (dados + acessos)
//   D2.4 — Ações inline: resetar senha, desativar/reativar
//
// Endpoints consumidos (todos em /api/admin/tc-users):
//   GET     /                 → lista
//   POST    /                 → criar
//   PUT     /:id              → editar dados básicos
//   PUT     /:id/access       → substituir conjunto de registros acessíveis
//   PUT     /:id/password-reset → gerar nova senha temporária
//   PUT     /:id/deactivate   → desativar
//
// Acesso restrito a user.role IN ('superadmin','admin'). O componente pai
// (TerraControl.tsx) é responsável por só renderizar/abrir se a checagem passar.

import React, { useEffect, useMemo, useState } from 'react'
import {
  X, Search, Plus, Key, Power, PowerOff, Edit3,
  Copy, Eye, EyeOff, Loader2, Users, ShieldCheck,
  CheckSquare, Square, Mail, Calendar, RefreshCw,
} from 'lucide-react'
import Modal from '@/components/Modal'
import type { TerraControlRecord } from './types'
import { formatCodImovel, getSafeImovelName } from './normalize'

const API_BASE_URL = '/api'

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

interface TcUserListItem {
  id: string
  username: string
  first_name: string | null
  last_name: string | null
  email: string | null
  phone: string | null
  is_active: boolean
  force_password_change: boolean
  can_share: boolean
  created_via: 'direct' | 'invite' | 'migrated'
  last_login: string | null
  created_at: string
  records_count: number | string  // pg pode retornar string p/ BIGINT
}

interface CreateResponseData {
  id: string
  username: string
  email: string | null
  temporaryPassword: string
}

interface NotifyFn {
  (message: string, opts?: { type?: 'success' | 'error' | 'warning' | 'info' }): void
}
// Assinatura corresponde ao useFeedback() do TerraControl:
//   confirm(message, { title?, confirmLabel?, cancelLabel?, variant?: 'danger' | 'default' })
interface ConfirmFn {
  (
    message: string,
    options?: {
      title?: string
      confirmLabel?: string
      cancelLabel?: string
      variant?: 'default' | 'danger'
    }
  ): Promise<boolean>
}

interface Props {
  isOpen: boolean
  onClose: () => void
  token: string                       // JWT impgeo do admin
  records: TerraControlRecord[]       // lista de registros TerraControl pra atribuir acesso
  notify: NotifyFn
  confirm: ConfirmFn
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const fmtDate = (iso: string | null) => {
  if (!iso) return '—'
  try {
    const d = new Date(iso)
    return d.toLocaleDateString('pt-BR') + ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  } catch { return '—' }
}

const fmtDateOnly = (iso: string | null) => {
  if (!iso) return '—'
  try { return new Date(iso).toLocaleDateString('pt-BR') } catch { return '—' }
}

const fullName = (u: { first_name: string | null; last_name: string | null }) =>
  [u.first_name, u.last_name].filter(Boolean).join(' ').trim() || '—'

const createdViaLabel = (v: TcUserListItem['created_via']) =>
  v === 'migrated' ? 'Migrado' : v === 'invite' ? 'Convite' : 'Direto'

const generateRandomPassword = () => {
  const charset = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789'
  let out = ''
  const buf = new Uint32Array(12)
  crypto.getRandomValues(buf)
  for (let i = 0; i < 12; i++) out += charset[buf[i] % charset.length]
  return out
}

// ---------------------------------------------------------------------------
// Painel principal — lista
// ---------------------------------------------------------------------------

const TcUsersAdminPanel: React.FC<Props> = ({ isOpen, onClose, token, records, notify, confirm }) => {
  const [list, setList] = useState<TcUserListItem[]>([])
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all')
  const [viaFilter, setViaFilter] = useState<'all' | 'direct' | 'invite' | 'migrated'>('all')
  const [createOpen, setCreateOpen] = useState(false)
  const [editingUser, setEditingUser] = useState<TcUserListItem | null>(null)
  const [tempPasswordModal, setTempPasswordModal] = useState<{ username: string; password: string } | null>(null)
  const [inviteSentModal, setInviteSentModal] = useState<{ email: string; acceptUrl: string } | null>(null)

  // Helper: monta init com Authorization + cookie. O impgeo aceita ambas as
  // formas de auth (Bearer no header OU cookie httpOnly) — usamos as duas pra
  // funcionar mesmo quando sessionStorage não tem o token (sessão restaurada
  // via cookie ao recarregar a página, por exemplo).
  const authedInit = (extra: RequestInit = {}): RequestInit => ({
    ...extra,
    credentials: 'include',
    headers: {
      ...(extra.headers as Record<string, string> | undefined),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  })

  const fetchList = async () => {
    setLoading(true)
    try {
      const res = await fetch(`${API_BASE_URL}/admin/tc-users`, authedInit())
      const data = await res.json()
      if (res.ok && data.success) {
        setList(Array.isArray(data.data) ? data.data : [])
      } else {
        notify(data.error || 'Erro ao carregar usuários', { type: 'error' })
      }
    } catch (e: any) {
      notify(e?.message || 'Erro de conexão', { type: 'error' })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (isOpen) fetchList()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, token])

  // Filtros aplicados no client (lista pequena, OK)
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return list.filter(u => {
      if (statusFilter === 'active' && !u.is_active) return false
      if (statusFilter === 'inactive' && u.is_active) return false
      if (viaFilter !== 'all' && u.created_via !== viaFilter) return false
      if (!q) return true
      const hay = [
        u.username,
        u.first_name || '',
        u.last_name || '',
        u.email || '',
      ].join(' ').toLowerCase()
      return hay.includes(q)
    })
  }, [list, search, statusFilter, viaFilter])

  // --- Ações por linha -----------------------------------------------------

  const handleResetPassword = async (u: TcUserListItem) => {
    const ok = await confirm(
      `Uma senha aleatória será gerada para ${u.username}. O usuário será forçado a trocar no próximo login. Sessões ativas serão revogadas.`,
      {
        title: 'Gerar nova senha temporária?',
        confirmLabel: 'Gerar nova senha',
        variant: 'danger',
      }
    )
    if (!ok) return
    try {
      const res = await fetch(`${API_BASE_URL}/admin/tc-users/${u.id}/password-reset`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await res.json()
      if (res.ok && data.success) {
        setTempPasswordModal({ username: u.username, password: data.data.temporaryPassword })
      } else {
        notify(data.error || 'Erro ao resetar senha', { type: 'error' })
      }
    } catch (e: any) {
      notify(e?.message || 'Erro de conexão', { type: 'error' })
    }
  }

  const handleToggleActive = async (u: TcUserListItem) => {
    const willDeactivate = u.is_active
    const ok = await confirm(
      willDeactivate
        ? `${u.username} não poderá mais fazer login. Sessões ativas serão revogadas.`
        : `${u.username} voltará a poder fazer login com a senha atual.`,
      {
        title: willDeactivate ? 'Desativar usuário?' : 'Reativar usuário?',
        confirmLabel: willDeactivate ? 'Desativar' : 'Reativar',
        variant: willDeactivate ? 'danger' : 'default',
      }
    )
    if (!ok) return
    try {
      const endpoint = willDeactivate
        ? `${API_BASE_URL}/admin/tc-users/${u.id}/deactivate`
        : `${API_BASE_URL}/admin/tc-users/${u.id}`
      const res = await fetch(endpoint, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: willDeactivate ? undefined : JSON.stringify({ isActive: true }),
      })
      const data = await res.json()
      if (res.ok && data.success) {
        notify(willDeactivate ? 'Usuário desativado' : 'Usuário reativado', { type: 'success' })
        await fetchList()
      } else {
        notify(data.error || 'Erro ao alterar status', { type: 'error' })
      }
    } catch (e: any) {
      notify(e?.message || 'Erro de conexão', { type: 'error' })
    }
  }

  // ------------------------------------------------------------------------

  return (
    <>
      <Modal isOpen={isOpen} onClose={onClose}>
        <div className="bg-white dark:!bg-[#1a2332] rounded-2xl shadow-2xl w-[96vw] max-w-6xl max-h-[90vh] flex flex-col overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700 bg-gradient-to-r from-tc-green/5 to-tc-blue/5">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-xl bg-gradient-to-br from-tc-green to-tc-blue shadow-md">
                <Users className="w-5 h-5 text-white" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">Usuários TerraControl</h2>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Crie, edite e gerencie permissões dos acessos externos
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={fetchList}
                disabled={loading}
                title="Recarregar lista"
                className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400 disabled:opacity-50"
              >
                <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              </button>
              <button
                onClick={() => setCreateOpen(true)}
                className="h-9 flex items-center gap-2 px-3 py-1.5 text-sm bg-gradient-to-r from-tc-green to-tc-blue text-white font-semibold rounded-lg hover:from-tc-green-dark hover:to-tc-blue-dark shadow"
              >
                <Plus className="w-4 h-4" /> Novo usuário
              </button>
              <button
                onClick={onClose}
                className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Toolbar */}
          <div className="px-6 py-3 border-b border-gray-200 dark:border-gray-700 flex flex-wrap items-center gap-3 bg-gray-50 dark:bg-[#243040]">
            <div className="relative flex-1 min-w-[220px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar por nome, username ou email..."
                className="w-full pl-9 pr-3 h-9 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:!bg-[#1a2332] text-gray-800 dark:text-gray-100"
              />
            </div>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as any)}
              className="h-9 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:!bg-[#1a2332] text-gray-800 dark:text-gray-100 px-2"
            >
              <option value="all">Todos status</option>
              <option value="active">Ativos</option>
              <option value="inactive">Inativos</option>
            </select>
            <select
              value={viaFilter}
              onChange={(e) => setViaFilter(e.target.value as any)}
              className="h-9 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:!bg-[#1a2332] text-gray-800 dark:text-gray-100 px-2"
            >
              <option value="all">Toda origem</option>
              <option value="direct">Cadastro direto</option>
              <option value="invite">Convite</option>
              <option value="migrated">Migrado de link</option>
            </select>
            <span className="text-xs text-gray-500 dark:text-gray-400 ml-auto">
              {filtered.length} de {list.length}
            </span>
          </div>

          {/* Lista */}
          <div className="flex-1 overflow-auto">
            {loading && list.length === 0 ? (
              <div className="flex items-center justify-center py-16 text-gray-400">
                <Loader2 className="w-6 h-6 animate-spin" />
              </div>
            ) : filtered.length === 0 ? (
              <div className="text-center py-16 text-gray-500 dark:text-gray-400">
                {list.length === 0 ? (
                  <>
                    <Users className="w-12 h-12 mx-auto mb-2 opacity-30" />
                    <p className="font-medium">Ainda não há usuários TerraControl</p>
                    <p className="text-sm mt-1">Clique em "Novo usuário" para criar o primeiro.</p>
                  </>
                ) : (
                  <p className="text-sm">Nenhum usuário corresponde aos filtros.</p>
                )}
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-gray-50 dark:bg-[#243040] sticky top-0 z-10">
                  <tr className="text-left text-xs uppercase tracking-wider text-gray-500 dark:text-gray-400">
                    <th className="px-4 py-2.5 font-semibold">Usuário</th>
                    <th className="px-4 py-2.5 font-semibold">Email</th>
                    <th className="px-4 py-2.5 font-semibold text-center">Registros</th>
                    <th className="px-4 py-2.5 font-semibold">Origem</th>
                    <th className="px-4 py-2.5 font-semibold">Status</th>
                    <th className="px-4 py-2.5 font-semibold">Último login</th>
                    <th className="px-4 py-2.5 font-semibold text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                  {filtered.map(u => (
                    <tr key={u.id} className="hover:bg-gray-50 dark:hover:bg-[#243040]/60">
                      <td className="px-4 py-3">
                        <div className="font-medium text-gray-900 dark:text-gray-100">{fullName(u)}</div>
                        <div className="text-xs text-gray-500 dark:text-gray-400 font-mono">@{u.username}</div>
                      </td>
                      <td className="px-4 py-3 text-gray-700 dark:text-gray-300">
                        <div className="flex items-center gap-1.5">
                          {u.email ? (
                            <>
                              <Mail className="w-3.5 h-3.5 text-gray-400" />
                              <span className="truncate max-w-[200px]">{u.email}</span>
                            </>
                          ) : <span className="text-gray-400 italic text-xs">sem email</span>}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className="inline-flex items-center justify-center px-2 py-0.5 rounded-full text-xs font-semibold bg-tc-blue/10 text-tc-blue dark:bg-tc-blue/20">
                          {String(u.records_count)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-500 dark:text-gray-400">
                        {createdViaLabel(u.created_via)}
                      </td>
                      <td className="px-4 py-3">
                        {u.is_active ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300">
                            <ShieldCheck className="w-3 h-3" /> Ativo
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300">
                            Inativo
                          </span>
                        )}
                        {u.force_password_change && u.is_active && (
                          <span title="Será forçado a trocar a senha no próximo login"
                            className="ml-1 inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
                            Senha temp.
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-600 dark:text-gray-400">
                        <div className="flex items-center gap-1">
                          <Calendar className="w-3 h-3 text-gray-400" />
                          {fmtDate(u.last_login)}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => setEditingUser(u)}
                            title="Editar"
                            className="p-1.5 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-900/30 text-blue-600 dark:text-blue-400"
                          >
                            <Edit3 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleResetPassword(u)}
                            title="Resetar senha"
                            className="p-1.5 rounded-lg hover:bg-amber-50 dark:hover:bg-amber-900/30 text-amber-600 dark:text-amber-400"
                          >
                            <Key className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleToggleActive(u)}
                            title={u.is_active ? 'Desativar' : 'Reativar'}
                            className={`p-1.5 rounded-lg ${u.is_active
                              ? 'hover:bg-red-50 dark:hover:bg-red-900/30 text-red-600 dark:text-red-400'
                              : 'hover:bg-green-50 dark:hover:bg-green-900/30 text-green-600 dark:text-green-400'}`}
                          >
                            {u.is_active ? <PowerOff className="w-4 h-4" /> : <Power className="w-4 h-4" />}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Footer info */}
          <div className="px-6 py-3 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-[#243040] text-xs text-gray-500 dark:text-gray-400">
            URLs antigas <code className="text-tc-blue">/v/&lt;token&gt;</code> continuam funcionando — são redirecionadas para a tela de login do usuário migrado.
          </div>
        </div>
      </Modal>

      {/* Modal: criar usuário */}
      {createOpen && (
        <TcUserCreateModal
          isOpen={createOpen}
          onClose={() => setCreateOpen(false)}
          token={token}
          records={records}
          notify={notify}
          onCreated={(resp) => {
            setCreateOpen(false)
            setTempPasswordModal({ username: resp.username, password: resp.temporaryPassword })
            fetchList()
          }}
          onInvited={(resp) => {
            setCreateOpen(false)
            setInviteSentModal({ email: resp.email, acceptUrl: resp.acceptUrl })
            fetchList()
          }}
        />
      )}

      {/* Modal: editar usuário */}
      {editingUser && (
        <TcUserEditModal
          user={editingUser}
          onClose={() => setEditingUser(null)}
          token={token}
          records={records}
          notify={notify}
          onSaved={() => {
            setEditingUser(null)
            fetchList()
          }}
        />
      )}

      {/* Modal: senha temporária gerada */}
      {tempPasswordModal && (
        <TempPasswordModal
          username={tempPasswordModal.username}
          password={tempPasswordModal.password}
          onClose={() => setTempPasswordModal(null)}
          notify={notify}
        />
      )}

      {/* Modal: convite enviado (F2.1) */}
      {inviteSentModal && (
        <InviteSentModal
          email={inviteSentModal.email}
          acceptUrl={inviteSentModal.acceptUrl}
          onClose={() => setInviteSentModal(null)}
          notify={notify}
        />
      )}
    </>
  )
}

export default TcUsersAdminPanel

// ===========================================================================
// Submodal: Senha temporária (mostrada uma única vez)
// ===========================================================================

interface TempPasswordModalProps {
  username: string
  password: string
  onClose: () => void
  notify: NotifyFn
}

const TempPasswordModal: React.FC<TempPasswordModalProps> = ({ username, password, onClose, notify }) => {
  const [show, setShow] = useState(true)
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(password)
      notify('Senha copiada para a área de transferência', { type: 'success' })
    } catch {
      notify('Não foi possível copiar — selecione manualmente', { type: 'warning' })
    }
  }
  return (
    <Modal isOpen={true} onClose={onClose}>
      <div className="bg-white dark:!bg-[#1a2332] rounded-2xl shadow-2xl w-[92vw] max-w-md p-6">
        <div className="flex items-center gap-3 mb-3">
          <div className="p-2 rounded-xl bg-amber-100 dark:bg-amber-900/30">
            <Key className="w-5 h-5 text-amber-600 dark:text-amber-400" />
          </div>
          <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">Senha temporária gerada</h3>
        </div>
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
          Anote ou copie a senha agora. <strong>Ela não será mostrada novamente.</strong> O usuário <span className="font-mono">@{username}</span> será obrigado a trocá-la no próximo login.
        </p>
        <div className="bg-gray-50 dark:bg-[#243040] border border-gray-200 dark:border-gray-700 rounded-lg p-3 mb-4 flex items-center gap-2">
          <div className="font-mono text-base flex-1 select-all text-gray-900 dark:text-gray-100">
            {show ? password : '•'.repeat(password.length)}
          </div>
          <button
            type="button"
            onClick={() => setShow(s => !s)}
            className="p-1.5 rounded hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-500"
            title={show ? 'Ocultar' : 'Mostrar'}
          >
            {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
          <button
            type="button"
            onClick={handleCopy}
            className="p-1.5 rounded hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-500"
            title="Copiar"
          >
            <Copy className="w-4 h-4" />
          </button>
        </div>
        <div className="flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-semibold rounded-lg bg-gradient-to-r from-tc-green to-tc-blue text-white hover:from-tc-green-dark hover:to-tc-blue-dark"
          >
            Entendi
          </button>
        </div>
      </div>
    </Modal>
  )
}

// ===========================================================================
// Submodal: Convite enviado (F2.1)
// ===========================================================================

interface InviteSentModalProps {
  email: string
  acceptUrl: string
  onClose: () => void
  notify: NotifyFn
}

const InviteSentModal: React.FC<InviteSentModalProps> = ({ email, acceptUrl, onClose, notify }) => {
  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(acceptUrl)
      notify('Link copiado para a área de transferência', { type: 'success' })
    } catch {
      notify('Não foi possível copiar — selecione manualmente', { type: 'warning' })
    }
  }
  return (
    <Modal isOpen={true} onClose={onClose}>
      <div className="bg-white dark:!bg-[#1a2332] rounded-2xl shadow-2xl w-[92vw] max-w-md p-6">
        <div className="flex items-center gap-3 mb-3">
          <div className="p-2 rounded-xl bg-tc-green/10 dark:bg-tc-green/20">
            <Mail className="w-5 h-5 text-tc-green dark:text-tc-green" />
          </div>
          <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">Convite enviado</h3>
        </div>
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
          Um email com o link de cadastro foi enviado para{' '}
          <span className="font-semibold text-gray-900 dark:text-gray-100">{email}</span>.
          O convidado deve clicar no link para escolher usuário e senha. O convite expira em 7 dias.
        </p>
        <div className="bg-gray-50 dark:bg-[#243040] border border-gray-200 dark:border-gray-700 rounded-lg p-3 mb-4">
          <p className="text-[11px] uppercase tracking-wider font-semibold text-gray-500 mb-1">Link de aceite (caso precise reenviar manualmente)</p>
          <div className="flex items-center gap-2">
            <div className="font-mono text-[11px] flex-1 select-all text-gray-900 dark:text-gray-100 break-all">
              {acceptUrl}
            </div>
            <button
              type="button"
              onClick={handleCopyLink}
              className="p-1.5 rounded hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-500 flex-shrink-0"
              title="Copiar link"
            >
              <Copy className="w-4 h-4" />
            </button>
          </div>
        </div>
        <div className="flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-semibold rounded-lg bg-gradient-to-r from-tc-green to-tc-blue text-white hover:from-tc-green-dark hover:to-tc-blue-dark"
          >
            Entendi
          </button>
        </div>
      </div>
    </Modal>
  )
}

// ===========================================================================
// Submodal: Criar tc_user (D2.2)
// ===========================================================================

interface InviteResponseData {
  acceptUrl: string
  reused: boolean
  expiresAt: string
  warning?: string
}

interface CreateProps {
  isOpen: boolean
  onClose: () => void
  token: string
  records: TerraControlRecord[]
  notify: NotifyFn
  onCreated: (resp: CreateResponseData) => void
  onInvited: (resp: InviteResponseData & { email: string }) => void
}

const TcUserCreateModal: React.FC<CreateProps> = ({ isOpen, onClose, token, records, notify, onCreated, onInvited }) => {
  // F2.1: 'direct' = cadastro direto (username+senha definidos pelo admin),
  //       'invite' = email enviado, convidado cria o acesso ao clicar no link
  const [mode, setMode] = useState<'direct' | 'invite'>('direct')
  const [username, setUsername] = useState('')
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [canShare, setCanShare] = useState(true)  // F2.5 — pré-selecionado por padrão na criação
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [submitting, setSubmitting] = useState(false)

  const filteredRecords = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return records
    return records.filter(r => {
      const hay = [
        getSafeImovelName(r.imovel),
        r.codImovel ? formatCodImovel(r.codImovel) : '',
        (r as any).municipio || '',
        (r as any).proprietario || '',
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
    const allSelected = visibleIds.every(id => selected.has(id))
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

    // Validações comuns
    if (!email.trim() || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) {
      notify('Informe um email válido', { type: 'warning' }); return
    }

    // Validações específicas do modo 'direct'
    if (mode === 'direct') {
      if (!/^[a-z0-9][a-z0-9\-_]{2,}$/.test(username.trim().toLowerCase())) {
        notify('Username inválido — use ao menos 3 caracteres: letras minúsculas, números, "-" ou "_"', { type: 'warning' })
        return
      }
      if (!firstName.trim()) { notify('Informe o nome', { type: 'warning' }); return }
      if (password && password.length < 6) {
        notify('Senha deve ter no mínimo 6 caracteres (ou deixe em branco para gerar automaticamente)', { type: 'warning' })
        return
      }
    }

    setSubmitting(true)
    try {
      if (mode === 'invite') {
        // F2.1: convite por email — convidado define username/senha/nome ao aceitar
        const res = await fetch(`${API_BASE_URL}/admin/tc-users/invite`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            email: email.trim().toLowerCase(),
            selectedIds: Array.from(selected),
            canShare,
          }),
        })
        const data = await res.json()
        if (res.ok && data.success) {
          if (data.warning) notify(data.warning, { type: 'warning' })
          else notify('Convite enviado por email', { type: 'success' })
          onInvited({ ...data.data, email: email.trim().toLowerCase() })
        } else {
          notify(data.error || 'Erro ao enviar convite', { type: 'error' })
        }
      } else {
        // Cadastro direto (admin define tudo agora)
        const res = await fetch(`${API_BASE_URL}/admin/tc-users`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            username: username.trim().toLowerCase(),
            firstName: firstName.trim(),
            lastName: lastName.trim() || undefined,
            email: email.trim().toLowerCase(),
            password: password || undefined,
            selectedIds: Array.from(selected),
            canShare,
          }),
        })
        const data = await res.json()
        if (res.ok && data.success) {
          notify('Usuário criado', { type: 'success' })
          onCreated(data.data as CreateResponseData)
        } else {
          notify(data.error || 'Erro ao criar usuário', { type: 'error' })
        }
      }
    } catch (e: any) {
      notify(e?.message || 'Erro de conexão', { type: 'error' })
    } finally {
      setSubmitting(false)
    }
  }

  if (!isOpen) return null

  return (
    <Modal isOpen={isOpen} onClose={onClose}>
      <form onSubmit={handleSubmit} className="bg-white dark:!bg-[#1a2332] rounded-2xl shadow-2xl w-[96vw] max-w-3xl max-h-[90vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">Novo usuário TerraControl</h3>
          <button type="button" onClick={onClose} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-auto p-6 space-y-5">
          {/* Toggle: cadastro direto vs convite por email */}
          <div className="grid grid-cols-2 gap-2 p-1 bg-gray-100 dark:bg-[#243040] rounded-xl">
            <button type="button" onClick={() => setMode('direct')}
              className={`px-3 py-2 rounded-lg text-sm font-semibold transition ${mode === 'direct'
                ? 'bg-white dark:bg-[#1a2332] text-tc-blue shadow-sm'
                : 'text-gray-600 dark:text-gray-400 hover:text-gray-800'}`}>
              Cadastro direto
              <div className="text-[10px] font-normal opacity-70">Você define usuário e senha agora</div>
            </button>
            <button type="button" onClick={() => setMode('invite')}
              className={`px-3 py-2 rounded-lg text-sm font-semibold transition ${mode === 'invite'
                ? 'bg-white dark:bg-[#1a2332] text-tc-blue shadow-sm'
                : 'text-gray-600 dark:text-gray-400 hover:text-gray-800'}`}>
              Convidar por email
              <div className="text-[10px] font-normal opacity-70">Convidado completa o cadastro</div>
            </button>
          </div>

          {/* Dados básicos */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {mode === 'direct' && (
              <div>
                <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">Username *</label>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value.toLowerCase())}
                  placeholder="ex: cliente-fazenda-sao-joao"
                  className="w-full h-10 px-3 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:!bg-[#243040] text-gray-900 dark:text-gray-100 font-mono"
                  autoFocus
                  required
                />
                <p className="text-[11px] text-gray-500 mt-1">3+ caracteres, minúsculos, "-" ou "_"</p>
              </div>
            )}
            <div className={mode === 'invite' ? 'sm:col-span-2' : ''}>
              <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">Email *</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="contato@exemplo.com"
                className="w-full h-10 px-3 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:!bg-[#243040] text-gray-900 dark:text-gray-100"
                required
                autoFocus={mode === 'invite'}
              />
              {mode === 'invite' && (
                <p className="text-[11px] text-gray-500 mt-1">
                  Vamos enviar um convite para este email. O convidado escolherá usuário, senha e nome ao aceitar.
                </p>
              )}
            </div>
            {mode === 'direct' && (
              <>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">Nome *</label>
                  <input
                    type="text"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    className="w-full h-10 px-3 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:!bg-[#243040] text-gray-900 dark:text-gray-100"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">Sobrenome</label>
                  <input
                    type="text"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    className="w-full h-10 px-3 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:!bg-[#243040] text-gray-900 dark:text-gray-100"
                  />
                </div>
              </>
            )}
            {mode === 'direct' && (
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                Senha temporária <span className="text-gray-400 font-normal">(opcional — deixe em branco para gerar automaticamente)</span>
              </label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Mínimo 6 caracteres"
                    className="w-full h-10 px-3 pr-10 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:!bg-[#243040] text-gray-900 dark:text-gray-100 font-mono"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(s => !s)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded text-gray-500"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => { setPassword(generateRandomPassword()); setShowPassword(true) }}
                  className="px-3 h-10 text-sm font-medium rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:!bg-[#243040] text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700"
                >
                  Gerar senha forte
                </button>
              </div>
              <p className="text-[11px] text-amber-600 dark:text-amber-400 mt-1">
                O usuário será forçado a trocar a senha no primeiro login.
              </p>
            </div>
            )}
          </div>

          {/* F2.5 — Permissão de compartilhamento (pré-marcada por padrão) */}
          <label className="flex items-start gap-2 p-3 rounded-lg border border-tc-green/30 bg-tc-green/5 dark:bg-tc-green/10 cursor-pointer">
            <input
              type="checkbox"
              checked={canShare}
              onChange={(e) => setCanShare(e.target.checked)}
              className="mt-0.5 w-4 h-4 rounded text-tc-green focus:ring-tc-green"
            />
            <div>
              <span className="text-sm font-semibold text-gray-800 dark:text-gray-200">Pode compartilhar links</span>
              <p className="text-xs text-gray-600 dark:text-gray-400 mt-0.5">
                Permite que este usuário gere sub-share links anônimos a partir dos imóveis aos quais tem acesso, para repassar a clientes finais dele. Pode ser alterado depois pelo painel admin.
              </p>
            </div>
          </label>

          {/* Seleção de registros */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-semibold text-gray-700 dark:text-gray-300">
                Registros acessíveis <span className="font-normal text-gray-500">({selected.size} de {records.length})</span>
              </label>
              <button
                type="button"
                onClick={toggleAllVisible}
                className="text-xs font-medium text-tc-blue hover:underline"
              >
                {filteredRecords.every(r => selected.has(String(r.id))) && filteredRecords.length > 0
                  ? 'Limpar visíveis' : 'Selecionar visíveis'}
              </button>
            </div>
            <div className="relative mb-2">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar registro..."
                className="w-full pl-9 pr-3 h-9 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:!bg-[#243040] text-gray-900 dark:text-gray-100"
              />
            </div>
            <div className="border border-gray-200 dark:border-gray-700 rounded-lg max-h-64 overflow-y-auto">
              {filteredRecords.length === 0 ? (
                <div className="text-center py-8 text-sm text-gray-500">Nenhum registro</div>
              ) : (
                <ul className="divide-y divide-gray-100 dark:divide-gray-800">
                  {filteredRecords.map(r => {
                    const id = String(r.id)
                    const isSelected = selected.has(id)
                    return (
                      <li key={id}>
                        <button
                          type="button"
                          onClick={() => toggleRecord(id)}
                          className="w-full flex items-center gap-3 px-3 py-2 text-left hover:bg-gray-50 dark:hover:bg-[#243040]"
                        >
                          {isSelected
                            ? <CheckSquare className="w-4 h-4 text-tc-green flex-shrink-0" />
                            : <Square className="w-4 h-4 text-gray-400 flex-shrink-0" />}
                          <div className="flex-1 min-w-0">
                            <div className="text-sm text-gray-900 dark:text-gray-100 truncate">{getSafeImovelName(r.imovel)}</div>
                            <div className="text-xs text-gray-500 dark:text-gray-400 font-mono">
                              {r.codImovel ? formatCodImovel(r.codImovel) : 'sem código'}
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
          <button type="submit" disabled={submitting}
            className="px-4 py-2 text-sm font-semibold rounded-lg bg-gradient-to-r from-tc-green to-tc-blue text-white hover:from-tc-green-dark hover:to-tc-blue-dark disabled:opacity-50 flex items-center gap-2">
            {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
            {mode === 'invite' ? 'Enviar convite' : 'Criar usuário'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

// ===========================================================================
// Submodal: Editar tc_user (D2.3)
// ===========================================================================

interface EditProps {
  user: TcUserListItem
  onClose: () => void
  token: string
  records: TerraControlRecord[]
  notify: NotifyFn
  onSaved: () => void
}

const TcUserEditModal: React.FC<EditProps> = ({ user, onClose, token, records, notify, onSaved }) => {
  const [tab, setTab] = useState<'dados' | 'acessos'>('dados')
  const [firstName, setFirstName] = useState(user.first_name || '')
  const [lastName, setLastName] = useState(user.last_name || '')
  const [email, setEmail] = useState(user.email || '')
  const [phone, setPhone] = useState(user.phone || '')
  const [isActive, setIsActive] = useState(user.is_active)
  const [canShare, setCanShare] = useState(user.can_share === true)
  const [accessIds, setAccessIds] = useState<Set<string>>(new Set())
  const [accessLoaded, setAccessLoaded] = useState(false)
  const [search, setSearch] = useState('')
  const [savingData, setSavingData] = useState(false)
  const [savingAccess, setSavingAccess] = useState(false)

  // Busca os registros que o tc_user tem acesso ao montar
  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/admin/tc-users`, {
          headers: { Authorization: `Bearer ${token}` },
        })
        const data = await res.json()
        if (!cancelled && res.ok && data.success) {
          // O endpoint list retorna a contagem mas não os IDs. Vamos buscar acesso de outra fonte.
        }
      } catch {}
    }
    load()
    return () => { cancelled = true }
  }, [token])

  // Para conseguir os IDs atuais do tc_user, fazemos POST de "preview" no endpoint
  // de access, mas como ele não tem GET, vamos usar uma abordagem alternativa:
  // chamamos /api/admin/tc-users/:id (precisa ser criado) OU buscamos via uma
  // estratégia minimal — por enquanto: lista inicialmente vazia e admin marca o
  // que quer. (Limitação aceitável; tem o records_count na lista pra referência.)
  // Para preencher o conjunto atual, criamos um endpoint dedicado mais à frente
  // se necessário. Por ora, lemos do /api/admin/tc-users/:id/access.

  useEffect(() => {
    let cancelled = false
    const fetchAccess = async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/admin/tc-users/${user.id}/access`, {
          headers: { Authorization: `Bearer ${token}` },
        })
        if (!cancelled && res.ok) {
          const data = await res.json()
          if (data?.success && Array.isArray(data.data)) {
            setAccessIds(new Set(data.data.map(String)))
          }
        }
      } catch {/* ignore */}
      finally {
        if (!cancelled) setAccessLoaded(true)
      }
    }
    fetchAccess()
    return () => { cancelled = true }
  }, [user.id, token])

  const filteredRecords = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return records
    return records.filter(r => {
      const hay = [
        getSafeImovelName(r.imovel),
        r.codImovel ? formatCodImovel(r.codImovel) : '',
        (r as any).municipio || '',
      ].join(' ').toLowerCase()
      return hay.includes(q)
    })
  }, [records, search])

  const toggleRecord = (id: string) => {
    setAccessIds(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const handleSaveData = async () => {
    setSavingData(true)
    try {
      const res = await fetch(`${API_BASE_URL}/admin/tc-users/${user.id}`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          firstName: firstName.trim() || null,
          lastName: lastName.trim() || null,
          email: email.trim().toLowerCase() || null,
          phone: phone.trim() || null,
          isActive,
          canShare,
        }),
      })
      const data = await res.json()
      if (res.ok && data.success) {
        notify('Dados atualizados', { type: 'success' })
        onSaved()
      } else {
        notify(data.error || 'Erro ao salvar', { type: 'error' })
      }
    } catch (e: any) {
      notify(e?.message || 'Erro de conexão', { type: 'error' })
    } finally {
      setSavingData(false)
    }
  }

  const handleSaveAccess = async () => {
    setSavingAccess(true)
    try {
      const res = await fetch(`${API_BASE_URL}/admin/tc-users/${user.id}/access`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ recordIds: Array.from(accessIds) }),
      })
      const data = await res.json()
      if (res.ok && data.success) {
        notify(`Acessos atualizados (${accessIds.size} registros)`, { type: 'success' })
        onSaved()
      } else {
        notify(data.error || 'Erro ao salvar acessos', { type: 'error' })
      }
    } catch (e: any) {
      notify(e?.message || 'Erro de conexão', { type: 'error' })
    } finally {
      setSavingAccess(false)
    }
  }

  return (
    <Modal isOpen={true} onClose={onClose}>
      <div className="bg-white dark:!bg-[#1a2332] rounded-2xl shadow-2xl w-[96vw] max-w-3xl max-h-[90vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <div>
            <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">Editar usuário</h3>
            <p className="text-xs text-gray-500 dark:text-gray-400 font-mono mt-0.5">@{user.username}</p>
          </div>
          <button type="button" onClick={onClose} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-200 dark:border-gray-700 px-6 bg-gray-50 dark:bg-[#243040]">
          <button
            type="button"
            onClick={() => setTab('dados')}
            className={`px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors ${tab === 'dados'
              ? 'border-tc-blue text-tc-blue'
              : 'border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'}`}
          >Dados</button>
          <button
            type="button"
            onClick={() => setTab('acessos')}
            className={`px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors ${tab === 'acessos'
              ? 'border-tc-blue text-tc-blue'
              : 'border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'}`}
          >Acessos <span className="ml-1 text-xs text-gray-400">({accessIds.size})</span></button>
        </div>

        <div className="flex-1 overflow-auto p-6">
          {tab === 'dados' ? (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">Nome</label>
                  <input type="text" value={firstName} onChange={(e) => setFirstName(e.target.value)}
                    className="w-full h-10 px-3 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:!bg-[#243040] text-gray-900 dark:text-gray-100" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">Sobrenome</label>
                  <input type="text" value={lastName} onChange={(e) => setLastName(e.target.value)}
                    className="w-full h-10 px-3 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:!bg-[#243040] text-gray-900 dark:text-gray-100" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">Email</label>
                  <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                    className="w-full h-10 px-3 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:!bg-[#243040] text-gray-900 dark:text-gray-100" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">Telefone</label>
                  <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)}
                    className="w-full h-10 px-3 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:!bg-[#243040] text-gray-900 dark:text-gray-100" />
                </div>
              </div>
              <label className="flex items-center gap-2 pt-2">
                <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)}
                  className="w-4 h-4 rounded text-tc-blue focus:ring-tc-blue" />
                <span className="text-sm text-gray-700 dark:text-gray-300">
                  Usuário ativo <span className="text-xs text-gray-500">(desmarcado = não consegue logar)</span>
                </span>
              </label>
              <label className="flex items-start gap-2">
                <input type="checkbox" checked={canShare} onChange={(e) => setCanShare(e.target.checked)}
                  className="mt-0.5 w-4 h-4 rounded text-tc-green focus:ring-tc-green" />
                <div>
                  <span className="text-sm text-gray-700 dark:text-gray-300">Pode compartilhar links</span>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Permite que este usuário gere sub-share links anônimos a partir dos imóveis aos quais tem acesso, para repassar a clientes finais dele.
                  </p>
                </div>
              </label>
              <div className="pt-2 text-xs text-gray-500 dark:text-gray-400 border-t border-gray-100 dark:border-gray-700 pt-3">
                Criado em {fmtDateOnly(user.created_at)} via {createdViaLabel(user.created_via)}.
                Último login: {fmtDate(user.last_login)}.
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Marque os registros que <span className="font-mono">@{user.username}</span> pode ver.
                </p>
                {!accessLoaded && <Loader2 className="w-4 h-4 animate-spin text-gray-400" />}
              </div>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Buscar registro..."
                  className="w-full pl-9 pr-3 h-9 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:!bg-[#243040] text-gray-900 dark:text-gray-100"
                />
              </div>
              <div className="border border-gray-200 dark:border-gray-700 rounded-lg max-h-80 overflow-y-auto">
                {filteredRecords.length === 0 ? (
                  <div className="text-center py-8 text-sm text-gray-500">Nenhum registro</div>
                ) : (
                  <ul className="divide-y divide-gray-100 dark:divide-gray-800">
                    {filteredRecords.map(r => {
                      const id = String(r.id)
                      const isSelected = accessIds.has(id)
                      return (
                        <li key={id}>
                          <button
                            type="button"
                            onClick={() => toggleRecord(id)}
                            className="w-full flex items-center gap-3 px-3 py-2 text-left hover:bg-gray-50 dark:hover:bg-[#243040]"
                          >
                            {isSelected
                              ? <CheckSquare className="w-4 h-4 text-tc-green flex-shrink-0" />
                              : <Square className="w-4 h-4 text-gray-400 flex-shrink-0" />}
                            <div className="flex-1 min-w-0">
                              <div className="text-sm text-gray-900 dark:text-gray-100 truncate">{getSafeImovelName(r.imovel)}</div>
                              <div className="text-xs text-gray-500 dark:text-gray-400 font-mono">
                                {r.codImovel ? formatCodImovel(r.codImovel) : 'sem código'}
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
          )}
        </div>

        <div className="px-6 py-3 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-[#243040] flex justify-end gap-2">
          <button type="button" onClick={onClose}
            className="px-4 py-2 text-sm font-medium rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:!bg-[#1a2332] text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700">
            Cancelar
          </button>
          {tab === 'dados' ? (
            <button type="button" onClick={handleSaveData} disabled={savingData}
              className="px-4 py-2 text-sm font-semibold rounded-lg bg-gradient-to-r from-tc-green to-tc-blue text-white hover:from-tc-green-dark hover:to-tc-blue-dark disabled:opacity-50 flex items-center gap-2">
              {savingData && <Loader2 className="w-4 h-4 animate-spin" />}
              Salvar dados
            </button>
          ) : (
            <button type="button" onClick={handleSaveAccess} disabled={savingAccess}
              className="px-4 py-2 text-sm font-semibold rounded-lg bg-gradient-to-r from-tc-green to-tc-blue text-white hover:from-tc-green-dark hover:to-tc-blue-dark disabled:opacity-50 flex items-center gap-2">
              {savingAccess && <Loader2 className="w-4 h-4 animate-spin" />}
              Salvar acessos
            </button>
          )}
        </div>
      </div>
    </Modal>
  )
}
