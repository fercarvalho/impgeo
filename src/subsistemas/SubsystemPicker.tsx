import { useMemo, useState } from 'react';
import * as LucideIcons from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import {
  SUBSYSTEMS,
  buildSubsystemUrl,
  supportsSubdomainNavigation,
  type SubsystemDefinition,
} from './manifest';
import { useCurrentSubsystem } from './useCurrentSubsystem';

/**
 * Tela inicial pós-login no domínio raiz: lista os subsistemas que o usuário
 * pode acessar e permite entrar em cada um. Em ambientes com subdomínio,
 * redireciona para o subdomínio correspondente; em localhost puro, grava a
 * escolha em sessionStorage e re-renderiza para o subsistema escolhido.
 *
 * Esta versão é a placeholder funcional da fase 1.4. A versão visual completa
 * (cards em grid + ícones + descrições + filtro por permissão) é fase 1.5.
 */
export default function SubsystemPicker() {
  const { user, logout } = useAuth();
  const { setSubsystem } = useCurrentSubsystem();
  const canUseSubdomain = useMemo(() => supportsSubdomainNavigation(), []);
  // Quando o usuário clica num card e a navegação envolve trocar de origem
  // (subdomínio diferente), a primeira visita pode levar segundos para o
  // browser baixar os ~200 módulos ESM do dev server na origem nova. Sem
  // feedback visual, a tela parece congelada. Marcamos qual card está sendo
  // ativado para mostrar spinner local.
  const [enteringSlug, setEnteringSlug] = useState<string | null>(null);

  // Por enquanto, admin/superadmin enxergam todos os 5 subsistemas.
  // Filtragem por permissão (user.modules + user.subsystems) entra em fase 1.8.
  const visibleSubsystems = useMemo<SubsystemDefinition[]>(() => {
    if (!user) return [];
    if (user.role === 'superadmin' || user.role === 'admin') return [...SUBSYSTEMS];
    return []; // user / guest sem acesso na fase 1
  }, [user]);

  const handleSelect = (sub: SubsystemDefinition) => {
    if (enteringSlug) return; // já está navegando, ignora cliques múltiplos
    setEnteringSlug(sub.slug);
    if (canUseSubdomain) {
      // window.location.href causa navigation síncrona — o setState acima
      // pinta o spinner antes do browser bloquear na navegação.
      window.location.href = buildSubsystemUrl(sub.slug);
    } else {
      // Em localhost o setSubsystem é instantâneo (sessionStorage) — limpa o
      // loading state quando o componente desmonta naturalmente.
      setSubsystem(sub.slug);
    }
  };

  const renderIcon = (iconName: string) => {
    const Icon = (LucideIcons as unknown as Record<string, React.ElementType>)[iconName]
      ?? LucideIcons.Layers;
    return <Icon className="h-7 w-7" aria-hidden="true" />;
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Header reduzido (fase 1.6 deixa idêntico ao header dos subsistemas em estilo) */}
      <header className="bg-blue-800 text-white px-6 py-4 flex items-center justify-between shadow">
        <h1 className="text-lg font-semibold">IMPGEO</h1>
        <div className="flex items-center gap-3 text-sm">
          {user && <span className="opacity-90">{user.firstName ?? user.username}</span>}
          <button
            onClick={logout}
            className="px-3 py-1.5 bg-red-600 hover:bg-red-700 rounded-md transition-colors"
            type="button"
          >
            Sair
          </button>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-12">
        <div className="mb-8">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-2">
            Escolha um subsistema
          </h2>
          <p className="text-gray-600 dark:text-gray-400 text-sm">
            {canUseSubdomain
              ? 'Cada subsistema tem seu próprio subdomínio.'
              : 'Em desenvolvimento local sem subdomínios — a escolha fica nesta aba do navegador.'}
          </p>
        </div>

        {visibleSubsystems.length === 0 ? (
          <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-8 text-center text-gray-700 dark:text-gray-300">
            <LucideIcons.Lock className="h-8 w-8 mx-auto mb-3 text-gray-400" aria-hidden="true" />
            <p className="font-medium">Nenhum subsistema disponível para o seu perfil ainda.</p>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              A liberação de subsistemas para usuários comuns está prevista para a próxima fase.
            </p>
          </div>
        ) : (
          <ul className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {visibleSubsystems.map(sub => {
              const isEntering = enteringSlug === sub.slug;
              const isAnyEntering = enteringSlug !== null;
              return (
                <li key={sub.key}>
                  <button
                    onClick={() => handleSelect(sub)}
                    type="button"
                    disabled={isAnyEntering}
                    className={`w-full text-left bg-white dark:bg-gray-800 border rounded-lg p-5 transition-all flex items-start gap-4 ${
                      isEntering
                        ? 'border-blue-500 ring-2 ring-blue-200 dark:ring-blue-800 cursor-wait'
                        : isAnyEntering
                          ? 'border-gray-200 dark:border-gray-700 opacity-50 cursor-not-allowed'
                          : 'border-gray-200 dark:border-gray-700 hover:border-blue-500 hover:shadow-md'
                    }`}
                  >
                    <div className="flex-shrink-0 w-12 h-12 rounded-lg bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 flex items-center justify-center">
                      {isEntering
                        ? <LucideIcons.Loader2 className="h-7 w-7 animate-spin" aria-hidden="true" />
                        : renderIcon(sub.iconName)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-1">
                        {sub.name}
                      </h3>
                      <p className="text-xs text-gray-600 dark:text-gray-400 leading-relaxed">
                        {isEntering ? `Entrando em ${sub.name}…` : sub.description}
                      </p>
                      <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-2 font-mono">
                        {sub.moduleKeys.length} módulo{sub.moduleKeys.length === 1 ? '' : 's'}
                      </p>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </main>
    </div>
  );
}
