import { Lock, ShieldAlert, ArrowLeft, LogOut } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import MenuUsuario from '@/components/MenuUsuario';
import ImpersonationBanner from '@/components/ImpersonationBanner';
import Footer from '@/components/Footer';
import FeedbackButton from '@/components/FeedbackButton';
import {
  supportsSubdomainNavigation,
  getRootUrl,
  clearSubsystemOverride,
  type SubsystemDefinition,
} from './manifest';

interface Props {
  /**
   * Subsistema que o usuário tentou entrar (para mensagens de contexto).
   * Não é estritamente necessário, mas torna a explicação mais útil.
   */
  attemptedSubsystem?: SubsystemDefinition | null;
}

/**
 * Tela de acesso negado — fase 1.8.
 *
 * Renderizada quando um user/guest tenta entrar num subsistema (via subdomínio
 * direto, sessionStorage manipulado, ou role rebaixado pelo admin enquanto
 * a sessão estava ativa).
 *
 * Layout espelha o SubsystemPicker (header reduzido + main centralizado) para
 * manter coerência visual com o resto do redesenho.
 */
export default function AcessoNegado({ attemptedSubsystem }: Props) {
  const { user, logout } = useAuth();

  const handleVoltar = () => {
    if (supportsSubdomainNavigation()) {
      window.location.href = getRootUrl();
    } else {
      clearSubsystemOverride();
      window.dispatchEvent(new CustomEvent('subsystem:override-changed'));
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-gray-50 dark:bg-gray-900">
      <ImpersonationBanner />

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

      <main className="flex-1 flex items-center justify-center px-4 sm:px-6 lg:px-8 py-12">
        <div className="max-w-lg w-full bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 border-l-4 border-l-rose-500 p-8 sm:p-10 text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-rose-50 dark:bg-rose-900/30 text-rose-700 dark:text-rose-300 mb-5">
            <ShieldAlert className="h-8 w-8" aria-hidden="true" />
          </div>

          <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-gray-100 mb-2">
            Acesso ainda não liberado
          </h1>

          <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed mb-6 max-w-md mx-auto">
            {attemptedSubsystem ? (
              <>
                O módulo <span className="font-semibold text-gray-800 dark:text-gray-200">{attemptedSubsystem.name}</span>{' '}
                ainda não está liberado para o seu perfil <span className="font-mono text-xs px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-700">{user?.role || 'desconhecido'}</span>.
              </>
            ) : (
              <>
                Os módulos do sistema ainda não estão liberados para o seu perfil <span className="font-mono text-xs px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-700">{user?.role || 'desconhecido'}</span>.
              </>
            )}
          </p>

          <div className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed mb-7 px-4 py-3 rounded-lg bg-gray-50 dark:bg-gray-900/40 border border-gray-200 dark:border-gray-700">
            <Lock className="h-3.5 w-3.5 inline-block mr-1 -mt-0.5" aria-hidden="true" />
            A liberação para usuários comuns está prevista para uma próxima entrega. Fale com um
            administrador se você precisa de acesso antes disso.
          </div>

          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <button
              type="button"
              onClick={handleVoltar}
              className="inline-flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
            >
              <ArrowLeft className="h-4 w-4" />
              Voltar para a escolha
            </button>
            <button
              type="button"
              onClick={logout}
              className="inline-flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-red-600 hover:bg-red-700 text-white transition-colors"
            >
              <LogOut className="h-4 w-4" />
              Sair
            </button>
          </div>
        </div>
      </main>

      <Footer />

      {/* Botão flutuante de feedback. user/guest sem acesso pode reportar a
          situação. paginaAtual='escolher_modulo' (mesmo do Picker) — o usuário
          pode descrever no texto qual módulo tentou abrir. */}
      <FeedbackButton paginaAtual="escolher_modulo" />
    </div>
  );
}
