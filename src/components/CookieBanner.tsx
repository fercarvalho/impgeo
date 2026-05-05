import React, { useState, useEffect, useCallback } from 'react';
import { Cookie, X, Settings, ChevronDown, ChevronUp, Shield } from 'lucide-react';

const API_BASE_URL =
  typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
    ? 'http://localhost:9001/api'
    : ((import.meta as any).env?.VITE_API_URL || '/api');

interface CookieCategoria {
  id: number;
  chave: string;
  nome: string;
  descricao: string;
  ativo: boolean;
  obrigatorio: boolean;
  ordem: number;
}

interface BannerConfig {
  titulo: string;
  texto: string;
  textoBotaoAceitar: string;
  textoBotaoRejeitar: string;
  textoBotaoPersonalizar: string;
  textoDescricaoGerenciamento: string;
}

interface CookiePreferences {
  [key: string]: boolean;
}

interface CookieBannerProps {
  onOpenTermos: () => void;
  onOpenPolitica: () => void;
}

const STORAGE_KEY = 'cookieConsent';

const CookieBanner: React.FC<CookieBannerProps> = ({ onOpenTermos, onOpenPolitica }) => {
  const [showBanner, setShowBanner] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [config, setConfig] = useState<BannerConfig | null>(null);
  const [categorias, setCategorias] = useState<CookieCategoria[]>([]);
  const [preferences, setPreferences] = useState<CookiePreferences>({});
  const [expandedCategoria, setExpandedCategoria] = useState<string | null>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const existingConsent = localStorage.getItem(STORAGE_KEY);
    if (existingConsent) return;

    let cancelled = false;
    let visibilityTimer: ReturnType<typeof setTimeout>;

    Promise.all([
      fetch(`${API_BASE_URL}/cookie-banner-config`).then(r => r.json()).catch(() => null),
      fetch(`${API_BASE_URL}/cookie-categorias`).then(r => r.json()).catch(() => null),
    ]).then(([configRes, categRes]) => {
      if (cancelled) return;
      // Só exibe o banner se ao menos uma das APIs retornou dados válidos
      const hasConfig = configRes?.success;
      const hasCategorias = categRes?.success;
      if (!hasConfig && !hasCategorias) return;
      if (hasConfig) setConfig(configRes.data);
      if (hasCategorias) {
        setCategorias(categRes.data);
        const prefs: CookiePreferences = {};
        categRes.data.forEach((c: CookieCategoria) => { prefs[c.chave] = c.obrigatorio; });
        setPreferences(prefs);
      }
      setShowBanner(true);
      visibilityTimer = setTimeout(() => { if (!cancelled) setIsVisible(true); }, 100);
    });

    return () => {
      cancelled = true;
      clearTimeout(visibilityTimer);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const handleOpen = () => {
      Promise.all([
        fetch(`${API_BASE_URL}/cookie-banner-config`).then(r => r.json()).catch(() => null),
        fetch(`${API_BASE_URL}/cookie-categorias`).then(r => r.json()).catch(() => null),
      ]).then(([configRes, categRes]) => {
        if (cancelled) return;
        if (configRes?.success) setConfig(configRes.data);
        if (categRes?.success) {
          setCategorias(categRes.data);
          const prefs: CookiePreferences = {};
          categRes.data.forEach((c: CookieCategoria) => { prefs[c.chave] = c.obrigatorio; });
          try {
            const saved = localStorage.getItem(STORAGE_KEY);
            if (saved) {
              const parsed = JSON.parse(saved);
              if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
                Object.assign(prefs, parsed as CookiePreferences);
              }
            }
          } catch {}
          setPreferences(prefs);
        }
        setShowBanner(true);
        setShowModal(true);
      });
    };
    window.addEventListener('cookie:open-manager', handleOpen);
    return () => {
      cancelled = true;
      window.removeEventListener('cookie:open-manager', handleOpen);
    };
  }, []);

  const fecharModal = useCallback(() => {
    setShowModal(false);
    if (localStorage.getItem(STORAGE_KEY)) {
      setIsVisible(false);
      setTimeout(() => setShowBanner(false), 300);
    }
  }, []);

  useEffect(() => {
    if (!showModal) return;
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') fecharModal(); };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [showModal, fecharModal]);

  const salvarPreferencias = (prefs: CookiePreferences) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
    setIsVisible(false);
    setTimeout(() => setShowBanner(false), 300);
    setShowModal(false);
    // Nota: o timeout acima pode disparar após unmount em casos extremos, mas é tolerável
    // pois apenas atualiza estado de visibilidade sem side-effects críticos.
  };

  const handleAceitarTodos = () => {
    const all: CookiePreferences = {};
    categorias.forEach(c => { all[c.chave] = true; });
    // Não adicionar chave hardcoded 'necessary' — as categorias obrigatórias já vêm da API
    salvarPreferencias(all);
  };

  const handleRejeitarTodos = () => {
    const only: CookiePreferences = {};
    categorias.forEach(c => { only[c.chave] = c.obrigatorio; });
    salvarPreferencias(only);
  };

  const handleSalvarPersonalizados = () => {
    const final = { ...preferences };
    categorias.forEach(c => { if (c.obrigatorio) final[c.chave] = true; });
    salvarPreferencias(final);
  };

  const toggleCategoria = (chave: string) => {
    if (categorias.find(c => c.chave === chave)?.obrigatorio) return;
    setPreferences(prev => ({ ...prev, [chave]: !prev[chave] }));
  };

  if (!showBanner) return null;

  const titulo = config?.titulo || 'Política de Cookies e Privacidade';
  const texto = config?.texto || 'Utilizamos cookies para melhorar sua experiência e garantir a segurança do sistema, em conformidade com a LGPD (Lei 13.709/2018).';
  const btnAceitar = config?.textoBotaoAceitar || 'Aceitar Todos';
  const btnRejeitar = config?.textoBotaoRejeitar || 'Rejeitar Todos';
  const btnPersonalizar = config?.textoBotaoPersonalizar || 'Personalizar';
  const descricaoGerenciamento = config?.textoDescricaoGerenciamento || 'Escolha quais tipos de cookies você deseja aceitar.';

  return (
    <>
      {/* Banner Principal */}
      <div
        role="region"
        aria-label="Aviso de cookies"
        aria-live="polite"
        className={`fixed bottom-0 left-0 right-0 z-[9998] transition-transform duration-300 ${
          isVisible ? 'translate-y-0' : 'translate-y-full'
        }`}
      >
        <div className="mx-auto max-w-5xl mb-4 px-4">
          <div className="bg-white/95 backdrop-blur-md rounded-2xl shadow-2xl border border-gray-200 p-4 sm:p-5">
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
              <div className="flex-shrink-0 bg-gradient-to-br from-blue-100 to-indigo-100 rounded-xl p-2.5">
                <Cookie className="h-6 w-6 text-blue-600" aria-hidden="true" />
              </div>

              <div className="flex-1 min-w-0">
                <p className="font-semibold text-gray-900 text-sm mb-0.5">{titulo}</p>
                <p className="text-xs text-gray-500 leading-relaxed">
                  {texto}{' '}
                  <button onClick={onOpenTermos} className="text-blue-600 hover:underline font-medium">
                    Termos de Uso
                  </button>{' '}
                  e{' '}
                  <button onClick={onOpenPolitica} className="text-blue-600 hover:underline font-medium">
                    Política de Privacidade
                  </button>.
                </p>
              </div>

              <div className="flex flex-wrap gap-2 flex-shrink-0 w-full sm:w-auto">
                <button
                  onClick={handleRejeitarTodos}
                  className="flex-1 sm:flex-none px-3 py-2 text-xs font-medium rounded-xl border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors"
                >
                  {btnRejeitar}
                </button>
                <button
                  onClick={() => setShowModal(true)}
                  className="flex-1 sm:flex-none flex items-center justify-center gap-1 px-3 py-2 text-xs font-medium rounded-xl border border-blue-300 text-blue-700 hover:bg-blue-50 transition-colors"
                >
                  <Settings className="h-3.5 w-3.5" aria-hidden="true" />
                  {btnPersonalizar}
                </button>
                <button
                  onClick={handleAceitarTodos}
                  className="flex-1 sm:flex-none px-4 py-2 text-xs font-semibold rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white shadow-md transition-all"
                >
                  {btnAceitar}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Modal de Personalização */}
      {showModal && (
        <div
          className="fixed inset-0 bg-black/60 flex items-end sm:items-center justify-center z-[9999] p-4"
          onClick={fecharModal}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="cookie-modal-title"
            className="bg-white rounded-2xl shadow-2xl border border-gray-200 w-full max-w-lg max-h-[85vh] flex flex-col"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 flex-shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="bg-blue-100 rounded-lg p-1.5">
                  <Shield className="h-4 w-4 text-blue-600" aria-hidden="true" />
                </div>
                <h3 id="cookie-modal-title" className="font-bold text-gray-900 text-base">Gerenciar Cookies</h3>
              </div>
              <button
                onClick={fecharModal}
                aria-label="Fechar gerenciamento de cookies"
                className="text-gray-400 hover:text-gray-600 transition-colors rounded-lg p-1 hover:bg-gray-100"
              >
                <X className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>

            <div className="overflow-y-auto flex-1 px-5 py-4">
              <p className="text-sm text-gray-500 mb-4 leading-relaxed">{descricaoGerenciamento}</p>

              <div className="space-y-3">
                {categorias.map(cat => (
                  <div key={cat.chave} className="border border-gray-100 rounded-xl overflow-hidden">
                    <div className="flex items-center justify-between p-3.5 bg-gray-50/50">
                      <button
                        onClick={() => setExpandedCategoria(expandedCategoria === cat.chave ? null : cat.chave)}
                        aria-expanded={expandedCategoria === cat.chave}
                        aria-controls={`cookie-cat-desc-${cat.chave}`}
                        className="flex items-center gap-2 flex-1 text-left"
                      >
                        {expandedCategoria === cat.chave
                          ? <ChevronUp className="h-4 w-4 text-gray-400 flex-shrink-0" aria-hidden="true" />
                          : <ChevronDown className="h-4 w-4 text-gray-400 flex-shrink-0" aria-hidden="true" />
                        }
                        <span className="text-sm font-medium text-gray-800">{cat.nome}</span>
                        {cat.obrigatorio && (
                          <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-medium ml-1">
                            Necessário
                          </span>
                        )}
                      </button>

                      <button
                        role="switch"
                        onClick={() => toggleCategoria(cat.chave)}
                        disabled={cat.obrigatorio}
                        aria-checked={!!preferences[cat.chave]}
                        className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors flex-shrink-0 ml-3 ${
                          cat.obrigatorio ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'
                        } ${
                          preferences[cat.chave]
                            ? 'bg-gradient-to-r from-blue-600 to-indigo-600'
                            : 'bg-gray-200'
                        }`}
                        aria-label={`${preferences[cat.chave] ? 'Desativar' : 'Ativar'} ${cat.nome}`}
                      >
                        <span
                          className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${
                            preferences[cat.chave] ? 'translate-x-4' : 'translate-x-0.5'
                          }`}
                        />
                      </button>
                    </div>

                    {expandedCategoria === cat.chave && (
                      <div id={`cookie-cat-desc-${cat.chave}`} className="px-4 pb-3.5 pt-2.5 text-xs text-gray-500 leading-relaxed">
                        {cat.descricao}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div className="flex gap-2 px-5 py-4 border-t border-gray-100 flex-shrink-0">
              <button
                onClick={handleRejeitarTodos}
                className="flex-1 px-3 py-2.5 text-sm font-medium rounded-xl border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors"
              >
                {btnRejeitar}
              </button>
              <button
                onClick={handleSalvarPersonalizados}
                className="flex-1 px-3 py-2.5 text-sm font-semibold rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white shadow-md transition-all"
              >
                Salvar Preferências
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default CookieBanner;
