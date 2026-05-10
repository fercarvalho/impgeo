import { useState, useEffect, useMemo, useCallback } from 'react';
import { HelpCircle, ChevronDown, ChevronUp, Search } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';

const isLocalEnv =
  typeof window !== 'undefined' &&
  (window.location.hostname === 'localhost' ||
    window.location.hostname === '127.0.0.1' ||
    window.location.hostname === '0.0.0.0');

const API_URL = isLocalEnv
  ? 'http://localhost:9001/api'
  : ((import.meta.env.VITE_API_URL as string | undefined) ?? '/api');

interface FAQItem {
  id: string;
  pergunta: string;
  resposta: string;
  ordem: number;
  /** Controlado pelo servidor — não usado para filtro no cliente */
  adminOnly?: boolean;
}

const FAQ = () => {
  const { token } = useAuth();
  const [items, setItems] = useState<FAQItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [busca, setBusca] = useState('');
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    let mounted = true;

    const load = async () => {
      setError(null);
      try {
        const headers: Record<string, string> = {};
        if (token) headers['Authorization'] = `Bearer ${token}`;
        const res = await fetch(`${API_URL}/faq`, {
          headers,
          signal: controller.signal,
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const result = await res.json();
        if (!mounted) return;
        if (result.success && Array.isArray(result.data)) {
          setItems(result.data);
          setOpenId(null);
        } else {
          setError('Não foi possível carregar as perguntas. Tente novamente.');
        }
      } catch (e) {
        if (!mounted) return;
        if ((e as Error).name !== 'AbortError') {
          console.error('Erro ao carregar FAQ:', e);
          setError('Não foi possível carregar as perguntas. Tente novamente.');
        }
      } finally {
        if (mounted) setIsLoading(false);
      }
    };

    load();
    return () => {
      mounted = false;
      controller.abort();
    };
  }, [token, retryCount]);

  const handleRetry = useCallback(() => {
    setIsLoading(true);
    setItems([]);
    setError(null);
    setOpenId(null);
    setRetryCount(c => c + 1);
  }, []);

  const buscaNorm = useMemo(() => busca.trim().toLowerCase(), [busca]);

  const itemsFiltrados = useMemo(
    () =>
      buscaNorm === ''
        ? items
        : items.filter(
            item =>
              item.pergunta.toLowerCase().includes(buscaNorm) ||
              item.resposta.toLowerCase().includes(buscaNorm)
          ),
    [items, buscaNorm]
  );

  const toggle = useCallback(
    (id: string) => setOpenId(prev => (prev === id ? null : id)),
    []
  );

  return (
    <div className="p-6">
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-600 to-indigo-600 rounded-2xl shadow-lg p-6 mb-6">
        <div className="flex items-center gap-4">
          <div className="bg-white/20 rounded-xl p-3">
            <HelpCircle className="h-8 w-8 text-white" aria-hidden="true" />
          </div>
          <div>
            <h2 className="text-3xl font-bold text-white">Perguntas Frequentes</h2>
            <p className="text-white/80 text-sm mt-0.5">
              Encontre respostas para as dúvidas mais comuns sobre o sistema
            </p>
          </div>
        </div>
      </div>

      {/* Campo de busca */}
      <div className="relative mb-6">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" aria-hidden="true" />
        <input
          type="text"
          value={busca}
          onChange={e => setBusca(e.target.value)}
          placeholder="Buscar pergunta ou resposta..."
          aria-label="Buscar perguntas frequentes"
          className="w-full pl-11 pr-4 py-3 bg-[#ffffff] dark:bg-[#243040] border border-gray-200 dark:border-gray-700 rounded-2xl shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm outline-none text-gray-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500"
        />
      </div>

      {/* Conteúdo */}
      {isLoading ? (
        <div
          className="flex items-center justify-center py-20"
          role="status"
          aria-label="Carregando perguntas frequentes"
        >
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" aria-hidden="true" />
        </div>
      ) : error ? (
        <div className="bg-[#ffffff] dark:bg-[#243040] rounded-2xl border-2 border-dashed border-red-200 dark:border-red-800 p-12 text-center">
          <HelpCircle className="h-10 w-10 text-red-400 mx-auto mb-3" aria-hidden="true" />
          <p className="text-red-500 font-medium">{error}</p>
          <button
            type="button"
            onClick={handleRetry}
            className="mt-3 text-sm text-blue-600 hover:text-blue-700 font-medium focus-visible:ring-2 focus-visible:ring-blue-500 rounded"
          >
            Tentar novamente
          </button>
        </div>
      ) : itemsFiltrados.length === 0 ? (
        <div className="bg-[#ffffff] dark:bg-[#243040] rounded-2xl border-2 border-dashed border-gray-200 dark:border-gray-700 p-12 text-center">
          <HelpCircle className="h-10 w-10 text-gray-300 mx-auto mb-3" aria-hidden="true" />
          <p className="text-gray-500 font-medium">
            {busca
              ? `Nenhuma pergunta encontrada para "${busca}"`
              : 'Nenhuma pergunta disponível'}
          </p>
          {busca && (
            <button
              type="button"
              onClick={() => setBusca('')}
              className="mt-3 text-sm text-blue-600 hover:text-blue-700 font-medium focus-visible:ring-2 focus-visible:ring-blue-500 rounded"
            >
              Limpar busca
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {itemsFiltrados.map(item => (
            <div
              key={item.id}
              className="bg-[#ffffff] dark:bg-[#243040] rounded-2xl border border-gray-200 dark:border-gray-700 shadow-md hover:shadow-xl hover:-translate-y-0.5 overflow-hidden transition-all duration-200"
            >
              <button
                type="button"
                onClick={() => toggle(item.id)}
                aria-expanded={openId === item.id}
                aria-controls={`faq-resposta-${item.id}`}
                className="w-full flex items-center justify-between gap-4 p-5 text-left hover:bg-blue-50/50 dark:hover:bg-blue-900/20 transition-colors focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500 outline-none"
              >
                <span className="font-semibold text-gray-900 dark:text-gray-100 text-sm leading-snug">
                  {item.pergunta}
                </span>
                {openId === item.id ? (
                  <ChevronUp className="h-5 w-5 text-blue-500 flex-shrink-0" aria-hidden="true" />
                ) : (
                  <ChevronDown className="h-5 w-5 text-gray-400 flex-shrink-0" aria-hidden="true" />
                )}
              </button>
              {openId === item.id && (
                <div
                  id={`faq-resposta-${item.id}`}
                  className="px-5 pb-5 pt-0 border-t border-blue-100 dark:border-gray-700"
                >
                  <p className="text-gray-600 dark:text-gray-300 text-sm leading-relaxed whitespace-pre-wrap pt-4">
                    {item.resposta}
                  </p>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {!isLoading && !error && items.length > 0 && (
        <p className="text-center text-xs text-gray-400 mt-6">
          {itemsFiltrados.length} de {items.length}{' '}
          {itemsFiltrados.length === 1 ? 'pergunta' : 'perguntas'}
        </p>
      )}
    </div>
  );
};

export default FAQ;
