// Tela principal do tc_user logado. Header verde→azul com avatar+dropdown
// (TcMenuUsuario), lista de registros TerraControl filtrada por
// tc_user_record_access, e os mesmos cards/visualização que o TerraControlView
// público usa para sub-shares.
//
// Em vez de duplicar TODA a UI de cards do TerraControlView, este componente
// reaproveita a estrutura via uma transformação simples: faz fetch em
// /api/tc-auth/me/records e renderiza com os mesmos cards/charts.
//
// Para MVP, focamos em:
//   1. Header com logo + menu de usuário
//   2. Lista de registros (cards básicos)
//   3. Modais de perfil / mudar senha / mudar usuário acionados pelo menu
//
// Sub-shares anônimos criados pelo tc_user ficam na sub-aba "Compartilhar" (fase D).

import React, { useEffect, useMemo, useState } from 'react'
import { Loader2 } from 'lucide-react'
import Footer from '@/components/Footer'
import { TC_API_BASE_URL, useTcAuth } from '@/contexts/TcAuthContext'
import {
  type TerraControlRecord,
  normalizeRecords,
  formatCodImovel,
  formatNumber,
  isAllowedMapUrl,
} from './index'
import TcMenuUsuario from './TcMenuUsuario'
import TcUserProfileModal from './TcUserProfileModal'
import TcEditarPerfilModal from './TcEditarPerfilModal'
import TcAlterarSenhaModal from './TcAlterarSenhaModal'
import TcAlterarUsernameModal from './TcAlterarUsernameModal'
import { useFeedback } from './feedback'

const TcLoggedView: React.FC = () => {
  const { tcUser, tcToken } = useTcAuth()
  const [records, setRecords] = useState<TerraControlRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // Modais
  const [showProfile, setShowProfile] = useState(false)
  const [showEditPerfil, setShowEditPerfil] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [showUsername, setShowUsername] = useState(false)
  const { notify, FeedbackHost } = useFeedback()

  useEffect(() => {
    if (!tcToken) return
    const controller = new AbortController()
    setLoading(true); setError('')
    fetch(`${TC_API_BASE_URL}/tc-auth/me/records`, {
      headers: { Authorization: `Bearer ${tcToken}` },
      signal: controller.signal,
    })
      .then(res => res.json())
      .then(data => {
        if (data?.success) {
          setRecords(normalizeRecords(data.data || []))
        } else {
          setError(data?.error || 'Falha ao carregar registros')
        }
      })
      .catch(err => {
        if (err?.name !== 'AbortError') setError(err?.message || 'Erro de conexão')
      })
      .finally(() => setLoading(false))
    return () => controller.abort()
  }, [tcToken])

  const totalArea = useMemo(
    () => records.reduce((sum, r) => sum + (r.areaTotal || 0), 0),
    [records]
  )

  if (!tcUser) return null

  return (
    <div className="min-h-screen flex flex-col bg-gray-50 dark:bg-[#111827]">
      {/* Header */}
      <div className="bg-gradient-to-r from-tc-green-dark to-tc-blue-dark text-white shadow-lg">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <img src="/logo_terracontrol.png" alt="TerraControl" className="h-12 w-12 object-contain rounded-lg shrink-0" />
              <div className="min-w-0">
                <h1 className="text-lg font-bold leading-tight">TerraControl</h1>
                <p className="text-blue-100 text-xs">Plataforma de gestão territorial</p>
              </div>
            </div>
            <TcMenuUsuario
              tcUser={tcUser}
              onOpenProfile={() => setShowProfile(true)}
              onOpenPassword={() => setShowPassword(true)}
              onOpenUsername={() => setShowUsername(true)}
            />
          </div>
        </div>
      </div>

      <main className="max-w-7xl mx-auto w-full py-6 px-4 sm:px-6 lg:px-8 space-y-6 flex-1">
        {/* Welcome */}
        <div className="bg-gradient-to-r from-tc-green to-tc-blue text-white rounded-2xl shadow-md p-6">
          <h2 className="text-lg font-bold mb-1">
            Bem-vindo(a){tcUser.firstName ? `, ${tcUser.firstName}` : ''}
          </h2>
          <p className="text-blue-100 text-sm">
            Você tem acesso a {records.length} {records.length === 1 ? 'registro' : 'registros'}.
            {totalArea > 0 && ` Total de ${formatNumber(totalArea)} ha.`}
          </p>
        </div>

        {loading ? (
          <div className="bg-white dark:bg-[#243040] rounded-2xl border border-gray-200 dark:border-gray-700 p-12 text-center">
            <Loader2 className="w-8 h-8 animate-spin text-tc-green mx-auto mb-3" />
            <p className="text-gray-500 dark:text-gray-400">Carregando registros…</p>
          </div>
        ) : error ? (
          <div className="bg-red-50 dark:bg-red-900/20 rounded-2xl border-2 border-dashed border-red-200 dark:border-red-800 p-12 text-center">
            <p className="text-red-600 dark:text-red-400 font-semibold mb-1">Não foi possível carregar os registros</p>
            <p className="text-red-500 dark:text-red-400 text-sm">{error}</p>
          </div>
        ) : records.length === 0 ? (
          <div className="bg-white dark:bg-[#243040] rounded-2xl border-2 border-dashed border-gray-200 dark:border-gray-700 p-12 text-center">
            <p className="text-gray-500 dark:text-gray-400">Nenhum registro disponível para você ainda.</p>
            <p className="text-gray-400 dark:text-gray-500 text-xs mt-2">Contate quem cadastrou seu acesso para liberar registros.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {records.map(r => (
              <div key={r.id} className="bg-white dark:bg-[#243040] rounded-2xl shadow-md border border-gray-200 dark:border-gray-700 overflow-hidden">
                <div className="bg-gradient-to-r from-tc-green to-tc-blue px-4 py-3 flex items-center gap-3">
                  <span className="bg-white/20 text-white text-xs font-bold px-2 py-0.5 rounded-lg tracking-wide">
                    #{formatCodImovel(r.codImovel)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="text-white font-bold text-sm leading-tight truncate">{r.imovel}</div>
                    <div className="text-blue-200 text-xs mt-0.5">{r.municipio}</div>
                  </div>
                </div>
                <div className="p-4 grid grid-cols-3 gap-2">
                  <div className="bg-gray-50 dark:bg-[#1a2a3e] rounded-xl p-2.5 text-center border border-gray-100 dark:border-gray-700/50">
                    <div className="text-[10px] text-gray-400 dark:text-gray-500 uppercase tracking-wide mb-0.5">Área Total</div>
                    <div className="text-sm font-bold text-gray-800 dark:text-gray-100">{formatNumber(r.areaTotal)} ha</div>
                  </div>
                  <div className="bg-gray-50 dark:bg-[#1a2a3e] rounded-xl p-2.5 text-center border border-gray-100 dark:border-gray-700/50">
                    <div className="text-[10px] text-gray-400 dark:text-gray-500 uppercase tracking-wide mb-0.5">Reserva Legal</div>
                    <div className="text-sm font-bold text-gray-800 dark:text-gray-100">{formatNumber(r.reservaLegal)} ha</div>
                  </div>
                  <div className="bg-gray-50 dark:bg-[#1a2a3e] rounded-xl p-2.5 text-center border border-gray-100 dark:border-gray-700/50">
                    <div className="text-[10px] text-gray-400 dark:text-gray-500 uppercase tracking-wide mb-0.5">Geo Cert.</div>
                    <div className={`text-sm font-bold ${r.geoCertificacao === 'SIM' ? 'text-green-600 dark:text-green-400' : 'text-gray-500'}`}>
                      {r.geoCertificacao}
                    </div>
                  </div>
                </div>
                {r.mapaUrl && isAllowedMapUrl(r.mapaUrl) && (
                  <div className="px-4 pb-3">
                    <a href={r.mapaUrl} target="_blank" rel="noopener noreferrer" className="text-xs font-semibold text-tc-blue hover:underline">
                      Ver mapa →
                    </a>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </main>

      <Footer />

      <TcUserProfileModal
        isOpen={showProfile}
        onClose={() => setShowProfile(false)}
        tcUser={tcUser}
        onEdit={() => { setShowProfile(false); setShowEditPerfil(true) }}
      />
      {/* Modal normal de edição (acionado pelo menu de usuário) */}
      <TcEditarPerfilModal
        isOpen={showEditPerfil && !tcUser.requiresProfileCompletion}
        onClose={() => setShowEditPerfil(false)}
        notify={notify}
      />
      {/* F2.3: modal obrigatório (não-fechável) — dispara sozinho quando o
          tc_user veio de convite e ainda não preencheu telefone/CPF/data/cidade.
          Quando salvar e backend devolver requiresProfileCompletion=false, o
          isOpen vira false naturalmente (a flag está no tcUser do contexto). */}
      {tcUser.requiresProfileCompletion && (
        <TcEditarPerfilModal
          isOpen={true}
          required
          onClose={() => { /* required = sem close */ }}
          notify={notify}
        />
      )}
      <TcAlterarSenhaModal
        isOpen={showPassword}
        mode="normal"
        onClose={() => setShowPassword(false)}
      />
      <TcAlterarUsernameModal
        isOpen={showUsername}
        onClose={() => setShowUsername(false)}
      />
      <FeedbackHost />
    </div>
  )
}

export default TcLoggedView
