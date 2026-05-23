// Shell para usuários impgeo logados em admin.terracontrol.viverdepj.com.br.
// Renderiza <TerraControl /> diretamente, sem o SubsystemPicker ou header de
// subsistemas — UX otimizada para quem só usa o módulo TerraControl.
//
// Inclui um header mínimo com:
//   - Logo TerraControl
//   - Username + dropdown com "Sair" e "Ir para impgeo completo"

import React, { Suspense, lazy, useState, useRef, useEffect } from 'react'
import { LogOut, ExternalLink, ChevronDown, Loader2 } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'

// Banner persistente convidando o user a ativar Web Push neste origin
// (tc-admin tem subscriptions próprias — uma por origin × device).
// Lazy: chunk de ~3KB compartilhado com os outros entries via Vite.
const PushPermissionBanner = lazy(() => import('@/components/PushPermissionBanner'))
import PwaInstallBanner from '@/components/PwaInstallBanner'

// Reaproveita TerraControl.tsx via lazy (mesmo do App.tsx).
// As tabs Registros/Configurações vivem DENTRO do TerraControl.tsx, então
// servem tanto este Shell (admin.terracontrol.*) quanto a rota via picker
// (App.tsx → activeTab='terracontrol').
const TerraControl = lazy(() => import('@/subsistemas/especial/modulos/TerraControl'))

const TerraControlAdminShell: React.FC = () => {
  const { user, logout } = useAuth()
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!menuOpen) return
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [menuOpen])

  const goToImpgeo = () => {
    // Em prod: redireciona para impgeo.sistemas.viverdepj.com.br
    // Em dev: a env var TC_IMPGEO_BASE_URL pode definir; senão usa o mesmo host.
    const target = import.meta.env.VITE_IMPGEO_BASE_URL || 'https://impgeo.sistemas.viverdepj.com.br'
    window.location.href = target
  }

  const initials = (user?.firstName || user?.username || '?').slice(0, 1).toUpperCase()
    + (user?.lastName ? user.lastName.slice(0, 1).toUpperCase() : '')

  return (
    <div className="min-h-screen flex flex-col bg-gray-50 dark:bg-[#111827]">
      {/* Header verde→azul, padrão TerraControl */}
      <div className="bg-gradient-to-r from-tc-green-dark to-tc-blue-dark text-white shadow-lg">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <img src="/logo_terracontrol.png" alt="TerraControl" className="h-11 w-11 object-contain rounded-lg shrink-0" />
              <div className="min-w-0">
                <h1 className="text-lg font-bold leading-tight">TerraControl</h1>
                <p className="text-blue-100 text-xs">Administração</p>
              </div>
            </div>

            <div ref={menuRef} className="relative">
              <button
                type="button"
                onClick={() => setMenuOpen(v => !v)}
                className="flex items-center gap-2 px-2 py-1.5 rounded-xl bg-white/20 hover:bg-white/30 text-white transition-colors"
              >
                {user?.photoUrl ? (
                  <img src={user.photoUrl} alt={user.username} className="w-8 h-8 rounded-full object-cover border border-white/40" />
                ) : (
                  <div className="w-8 h-8 rounded-full bg-white/30 flex items-center justify-center font-bold text-sm">
                    {initials}
                  </div>
                )}
                <span className="hidden sm:block text-sm font-semibold max-w-[120px] truncate">
                  {user?.firstName || user?.username}
                </span>
                <ChevronDown className="w-4 h-4 opacity-80" />
              </button>

              {menuOpen && (
                <div className="absolute right-0 mt-2 w-60 bg-white dark:bg-[#243040] rounded-xl shadow-2xl border border-gray-200 dark:border-gray-700 overflow-hidden z-50">
                  <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-700">
                    <p className="text-xs text-gray-500 dark:text-gray-400">Conectado como</p>
                    <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">{user?.username}</p>
                    <p className="text-xs text-gray-400 dark:text-gray-500">Papel: {user?.role}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => { setMenuOpen(false); goToImpgeo() }}
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700/50"
                  >
                    <ExternalLink className="w-4 h-4 text-gray-400" />
                    Ir para impgeo completo
                  </button>
                  <div className="border-t border-gray-100 dark:border-gray-700">
                    <button
                      type="button"
                      onClick={() => { setMenuOpen(false); logout() }}
                      className="w-full flex items-center gap-3 px-4 py-2.5 text-sm font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20"
                    >
                      <LogOut className="w-4 h-4 text-red-500" />
                      Sair
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Conteúdo — TerraControl.tsx já tem suas próprias tabs (Registros/
          Configurações) internas, então este Shell vira só auth + branding. */}
      <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-6">
        <Suspense fallback={null}>
          <div className="mb-6">
            <PushPermissionBanner />
          </div>
        </Suspense>

        <PwaInstallBanner />

        <Suspense fallback={
          <div className="text-center text-gray-500 py-20">
            <Loader2 className="w-8 h-8 animate-spin text-tc-green mx-auto mb-2" />
            Carregando módulo TerraControl…
          </div>
        }>
          <TerraControl />
        </Suspense>
      </main>
    </div>
  )
}

export default TerraControlAdminShell
