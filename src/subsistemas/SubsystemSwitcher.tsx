import { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import * as LucideIcons from 'lucide-react';
import { Layers, ChevronDown, ArrowLeft, Check } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import {
  SUBSYSTEMS,
  buildSubsystemUrl,
  supportsSubdomainNavigation,
  getRootUrl,
  setSubsystemOverride,
  clearSubsystemOverride,
  type SubsystemDefinition,
} from './manifest';

interface Props {
  current: SubsystemDefinition;
}

/**
 * Dropdown de troca de módulo (versão final da fase 1.6 — substitui o botão
 * temporário azul "Trocar módulo" da fase 1.4+).
 *
 * Comportamento:
 *   - Botão pai exibe o módulo atual com ícone, nome e chevron.
 *   - Click → dropdown alinhado à direita, com:
 *       1. Lista dos OUTROS módulos acessíveis (filtrados por permissão).
 *          Cada item: ícone tonalizado da paleta + nome + descrição curta.
 *       2. Separador.
 *       3. Item "Voltar para escolha" → leva ao Picker.
 *
 * Fechamento: click fora, ESC, ou ao escolher um item.
 *
 * Comportamento de navegação igual ao Picker:
 *   - Em ambiente com subdomínio: window.location.href = buildSubsystemUrl(slug)
 *   - Em localhost puro: setSubsystemOverride(slug) + custom event
 */
export default function SubsystemSwitcher({ current }: Props) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [navigatingTo, setNavigatingTo] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const accessible = useMemo<SubsystemDefinition[]>(() => {
    if (!user) return [];
    if (user.role === 'superadmin' || user.role === 'admin') return [...SUBSYSTEMS];
    return [];
  }, [user]);

  // Lista para o dropdown: SEM o atual (esse já está visível no botão).
  const others = useMemo(
    () => accessible.filter(s => s.key !== current.key),
    [accessible, current.key]
  );

  // Click fora fecha
  useEffect(() => {
    if (!open) return;
    const onMouseDown = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onMouseDown);
    return () => document.removeEventListener('mousedown', onMouseDown);
  }, [open]);

  // ESC fecha + retorna foco para o botão
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  const goTo = useCallback((sub: SubsystemDefinition) => {
    if (navigatingTo) return;
    setNavigatingTo(sub.slug);
    if (supportsSubdomainNavigation()) {
      window.location.href = buildSubsystemUrl(sub.slug);
    } else {
      setSubsystemOverride(sub.slug);
      window.dispatchEvent(new CustomEvent('subsystem:override-changed'));
      // O AppContentRouter vai detectar o novo subsistema, AppMain remonta com
      // novo `subsystem` prop, este componente desmonta naturalmente.
      setOpen(false);
    }
  }, [navigatingTo]);

  const goBack = useCallback(() => {
    if (navigatingTo) return;
    setNavigatingTo('__root__');
    if (supportsSubdomainNavigation()) {
      window.location.href = getRootUrl();
    } else {
      clearSubsystemOverride();
      window.dispatchEvent(new CustomEvent('subsystem:override-changed'));
      setOpen(false);
    }
  }, [navigatingTo]);

  const renderIcon = (iconName: string, sizeClass = 'h-5 w-5') => {
    const Icon = (LucideIcons as unknown as Record<string, React.ElementType>)[iconName]
      ?? LucideIcons.Layers;
    return <Icon className={sizeClass} aria-hidden="true" />;
  };

  return (
    <div ref={containerRef} className="relative">
      <button
        ref={buttonRef}
        onClick={() => setOpen(o => !o)}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        title={`Trocar módulo (atual: ${current.name})`}
        className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-colors text-white
          ${open ? 'bg-blue-600' : 'bg-blue-700 hover:bg-blue-600'}
          focus:outline-none focus:ring-2 focus:ring-white focus:ring-offset-2 focus:ring-offset-blue-800`}
      >
        <Layers className="h-4 w-4" aria-hidden="true" />
        <span className="hidden sm:inline text-sm font-medium">{current.name}</span>
        <ChevronDown className={`h-4 w-4 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 mt-2 w-80 bg-white dark:bg-gray-800 rounded-lg shadow-xl border border-gray-200 dark:border-gray-700 z-50 overflow-hidden"
        >
          {others.length > 0 && (
            <>
              <div className="px-4 pt-3 pb-2 text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                Outros módulos
              </div>
              <ul className="pb-1">
                {others.map(sub => {
                  const isNav = navigatingTo === sub.slug;
                  return (
                    <li key={sub.key}>
                      <button
                        role="menuitem"
                        type="button"
                        onClick={() => goTo(sub)}
                        disabled={navigatingTo !== null}
                        className={`w-full text-left px-4 py-2.5 flex items-start gap-3 transition-colors
                          ${isNav
                            ? 'bg-blue-50 dark:bg-blue-900/20 cursor-wait'
                            : navigatingTo
                              ? 'opacity-50 cursor-not-allowed'
                              : 'hover:bg-gray-50 dark:hover:bg-gray-700/50'}`}
                      >
                        <div className={`flex-shrink-0 w-9 h-9 rounded-md flex items-center justify-center ${sub.palette.iconBg} ${sub.palette.iconText}`}>
                          {isNav
                            ? <LucideIcons.Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
                            : renderIcon(sub.iconName)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium text-gray-900 dark:text-gray-100">
                            {sub.name}
                          </div>
                          <div className="text-xs text-gray-500 dark:text-gray-400 line-clamp-1">
                            {isNav ? `Entrando em ${sub.name}…` : sub.description}
                          </div>
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
              <div className="border-t border-gray-200 dark:border-gray-700" />
            </>
          )}

          {/* Indicador do módulo atual (apenas leitura) */}
          <div className="px-4 py-2 flex items-center gap-3 bg-gray-50 dark:bg-gray-900/40">
            <div className={`flex-shrink-0 w-7 h-7 rounded-md flex items-center justify-center ${current.palette.iconBg} ${current.palette.iconText}`}>
              {renderIcon(current.iconName, 'h-4 w-4')}
            </div>
            <div className="flex-1 min-w-0 text-xs text-gray-600 dark:text-gray-400">
              Você está em <span className="font-semibold text-gray-800 dark:text-gray-200">{current.name}</span>
            </div>
            <Check className="h-4 w-4 text-emerald-500" aria-hidden="true" />
          </div>

          <div className="border-t border-gray-200 dark:border-gray-700" />

          <button
            role="menuitem"
            type="button"
            onClick={goBack}
            disabled={navigatingTo !== null}
            className={`w-full text-left px-4 py-2.5 flex items-center gap-3 text-sm transition-colors
              ${navigatingTo === '__root__'
                ? 'bg-blue-50 dark:bg-blue-900/20 cursor-wait text-blue-700 dark:text-blue-300'
                : navigatingTo
                  ? 'opacity-50 cursor-not-allowed text-gray-700 dark:text-gray-300'
                  : 'text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/50'}`}
          >
            {navigatingTo === '__root__'
              ? <LucideIcons.Loader2 className="h-4 w-4 animate-spin flex-shrink-0" aria-hidden="true" />
              : <ArrowLeft className="h-4 w-4 flex-shrink-0" aria-hidden="true" />}
            <span>{navigatingTo === '__root__' ? 'Voltando…' : 'Voltar para escolha de módulo'}</span>
          </button>
        </div>
      )}
    </div>
  );
}
