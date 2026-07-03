import { useMemo, useState, Suspense, lazy } from 'react';
import * as LucideIcons from 'lucide-react';
import { LogOut } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import MenuUsuario from '@/components/MenuUsuario';
import NotificationBell from '@/components/NotificationBell';
import ImpersonationBanner from '@/components/ImpersonationBanner';
import Footer from '@/components/Footer';
import FeedbackButton from '@/components/FeedbackButton';
import PwaInstallBanner from '@/components/PwaInstallBanner';
// Mesmo do app principal: a tela de escolha também é o mesmo PWA e o mesmo
// sistema de notificações, então também convida a instalar/ativar.
const PushPermissionBanner = lazy(() => import('@/components/PushPermissionBanner'));
import {
  SUBSYSTEMS,
  buildSubsystemUrl,
  supportsSubdomainNavigation,
  userCanAccessSubsystem,
  type SubsystemDefinition,
} from './manifest';
import { useCurrentSubsystem } from './useCurrentSubsystem';

/**
 * Tela inicial pós-login no domínio raiz.
 *
 * Layout — fase 1.5:
 *   - ImpersonationBanner (quando ativo) acima de tudo
 *   - Header reduzido: mesmo gradient azul do header dos subsistemas, com
 *     logo + nome do sistema + MenuUsuario + botão Sair. SEM barra de módulos
 *     (esse é o ponto da tela de escolha — escolher antes de ver módulos).
 *   - Conteúdo: grid de cards (1 col mobile, 2 col tablet, 3 col desktop) com
 *     paleta de cor própria por subsistema (border-l, ícone tonalizado).
 *   - Cards não-acessíveis: estado vazio com explicação.
 *
 * Comportamento:
 *   - Click num card → spinner local + window.location.href (subdomínio)
 *     ou setSubsystem(slug) (localhost via sessionStorage).
 *   - Click duplo / múltiplo: ignorado durante navegação.
 */
export default function SubsystemPicker() {
  const { user, logout } = useAuth();
  const { setSubsystem } = useCurrentSubsystem();
  const canUseSubdomain = useMemo(() => supportsSubdomainNavigation(), []);
  const [enteringSlug, setEnteringSlug] = useState<string | null>(null);

  // Filtragem por permissão — centralizada em manifest.ts (fase 1.8).
  // user/guest sem permissão veem lista vazia (empty state).
  const visibleSubsystems = useMemo<SubsystemDefinition[]>(
    () => SUBSYSTEMS.filter(sub => userCanAccessSubsystem(user, sub)),
    [user]
  );

  const handleSelect = (sub: SubsystemDefinition) => {
    if (enteringSlug) return;
    setEnteringSlug(sub.slug);
    if (canUseSubdomain) {
      window.location.href = buildSubsystemUrl(sub.slug);
    } else {
      // localhost: só re-renderiza, sem F5 — por isso não pintamos loading muito.
      setSubsystem(sub.slug);
    }
  };

  const renderIcon = (iconName: string, sizeClass = 'h-7 w-7') => {
    const Icon = (LucideIcons as unknown as Record<string, React.ElementType>)[iconName]
      ?? LucideIcons.Layers;
    return <Icon className={sizeClass} aria-hidden="true" />;
  };

  return (
    <div className="min-h-screen flex flex-col bg-gray-50 dark:bg-gray-900">
      <ImpersonationBanner />

      {/* Header reduzido — usa o mesmo gradient azul do NavigationBar dos
          subsistemas para que o usuário sinta que está no mesmo sistema,
          apenas num "antessala" sem módulos. */}
      <nav className="bg-gradient-to-r from-blue-900 to-blue-800 shadow-lg">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16 py-2">
            <div className="flex items-center flex-shrink-0">
              <img src="/imp_logo.png" alt="IMPGEO Logo" className="h-8 w-8 mr-2 object-contain" />
              <div>
                <span className="text-white text-xl font-bold">IMPGEO</span>
                <p className="text-blue-200 text-sm">Sistema de Gestão Inteligente</p>
              </div>
            </div>
            <div className="flex items-center space-x-4">
              <NotificationBell />
              <MenuUsuario />
              <button
                onClick={logout}
                className="flex items-center space-x-2 px-3 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors"
                title="Sair"
              >
                <LogOut className="h-4 w-4" />
                <span className="hidden sm:inline">Sair</span>
              </button>
            </div>
          </div>
        </div>
      </nav>

      <main className="flex-1 min-h-screen max-w-5xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-10 sm:py-12">
        {/* Banners de ativar notificações / instalar PWA — mesmos do app
            principal. Somem sozinhos quando já instalado / notificações ativas
            / dispensados. É o mesmo PWA e sistema de notificações do sistema. */}
        <Suspense fallback={null}>
          <div className="mb-6">
            <PushPermissionBanner />
          </div>
        </Suspense>
        <PwaInstallBanner />

        <header className="mb-8 sm:mb-10">
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-gray-100 tracking-tight mb-2">
            Escolha um Módulo
          </h1>
          <p className="text-sm sm:text-base text-gray-600 dark:text-gray-400 max-w-2xl">
            {canUseSubdomain
              ? 'Cada módulo vive em seu próprio subdomínio. Você pode trocar a qualquer momento pelo botão "Trocar módulo" no header.'
              : 'Em desenvolvimento local sem subdomínios — a escolha fica nesta aba do navegador. Em produção, cada módulo terá seu próprio subdomínio.'}
          </p>
        </header>

        {visibleSubsystems.length === 0 ? (
          <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-10 text-center shadow-sm">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-gray-100 dark:bg-gray-700 mb-4">
              <LucideIcons.Lock className="h-7 w-7 text-gray-400 dark:text-gray-500" aria-hidden="true" />
            </div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">
              Nenhum módulo disponível
            </h2>
            <p className="text-sm text-gray-600 dark:text-gray-400 max-w-md mx-auto">
              O seu perfil ainda não tem acesso a nenhum módulo. A liberação para usuários
              comuns está prevista para uma próxima entrega — fale com um administrador se
              precisa de acesso antes disso.
            </p>
          </div>
        ) : (
          <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
            {visibleSubsystems.map(sub => {
              const isEntering = enteringSlug === sub.slug;
              const isAnyEntering = enteringSlug !== null;
              const palette = sub.palette;

              const cardClasses = [
                // h-full + items-start: o grid estica cada célula para a maior
                // descrição da linha; o card preenche toda a altura disponível
                // para que todos fiquem com o mesmo tamanho.
                'group w-full h-full text-left bg-white dark:bg-gray-800 rounded-xl shadow-sm transition-all duration-150',
                'border border-gray-200 dark:border-gray-700',
                'border-l-4', palette.accentBorder,
                'p-5 sm:p-6 flex items-start gap-4',
                'focus:outline-none focus:ring-2 focus:ring-offset-2 dark:focus:ring-offset-gray-900',
                isEntering
                  ? `${palette.activeBorder} ${palette.activeRing} cursor-wait`
                  : isAnyEntering
                    ? 'opacity-50 cursor-not-allowed'
                    : `${palette.hoverBorder} ${palette.hoverRing} hover:ring-4 hover:shadow-md`,
              ].join(' ');

              return (
                <li key={sub.key} className="h-full">
                  <button
                    onClick={() => handleSelect(sub)}
                    type="button"
                    disabled={isAnyEntering}
                    className={cardClasses}
                  >
                    <div className={`flex-shrink-0 w-12 h-12 rounded-lg flex items-center justify-center ${palette.iconBg} ${palette.iconText}`}>
                      {isEntering
                        ? <LucideIcons.Loader2 className="h-7 w-7 animate-spin" aria-hidden="true" />
                        : renderIcon(sub.iconName)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline justify-between gap-2 mb-1">
                        <h3 className="font-semibold text-gray-900 dark:text-gray-100 text-base">
                          {sub.name}
                        </h3>
                        <span className="text-[11px] font-mono text-gray-400 dark:text-gray-500 whitespace-nowrap">
                          {sub.moduleKeys.length} módulo{sub.moduleKeys.length === 1 ? '' : 's'}
                        </span>
                      </div>
                      <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">
                        {isEntering ? `Entrando em ${sub.name}…` : sub.description}
                      </p>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        <p className="mt-8 text-xs text-gray-400 dark:text-gray-500 text-center">
          {visibleSubsystems.length > 0 && (
            <>Logado como <span className="font-medium text-gray-600 dark:text-gray-300">{user?.firstName ?? user?.username}</span> ({user?.role}).</>
          )}
        </p>
      </main>

      <Footer />

      {/* Botão flutuante de feedback. paginaAtual='escolher_modulo' é a chave
          dedicada ao SubsystemPicker no FeedbackModal (grupo 'Geral'). */}
      <FeedbackButton paginaAtual="escolher_modulo" />
    </div>
  );
}
