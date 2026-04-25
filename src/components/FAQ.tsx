import React, { useState, useEffect } from 'react';
import { HelpCircle, ChevronDown, ChevronUp, Search } from 'lucide-react';

const API_URL = typeof window !== 'undefined' &&
  (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
  ? 'http://localhost:9001/api'
  : ((import.meta as any).env?.VITE_API_URL || '/api');

interface FAQItem {
  id: string;
  pergunta: string;
  resposta: string;
  ordem: number;
}

const FAQ: React.FC = () => {
  const [items, setItems] = useState<FAQItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [openId, setOpenId] = useState<string | null>(null);
  const [busca, setBusca] = useState('');

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch(`${API_URL}/faq`);
        const result = await res.json();
        if (result.success) setItems(result.data);
      } catch (e) {
        console.error('Erro ao carregar FAQ:', e);
      } finally {
        setIsLoading(false);
      }
    };
    load();
  }, []);

  const itemsFiltrados = items.filter(item =>
    busca.trim() === '' ||
    item.pergunta.toLowerCase().includes(busca.toLowerCase()) ||
    item.resposta.toLowerCase().includes(busca.toLowerCase())
  );

  const toggle = (id: string) => setOpenId(prev => prev === id ? null : id);

  return (
    <div className="p-6">
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-600 to-indigo-600 rounded-2xl shadow-lg p-6 mb-6">
        <div className="flex items-center gap-4">
          <div className="bg-white/20 rounded-xl p-3">
            <HelpCircle className="h-8 w-8 text-white" />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-white">Perguntas Frequentes</h1>
            <p className="text-white/80 text-sm mt-0.5">
              Encontre respostas para as dúvidas mais comuns sobre o sistema
            </p>
          </div>
        </div>
      </div>

      {/* Campo de busca */}
      <div className="relative mb-6">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
        <input
          type="text"
          value={busca}
          onChange={e => setBusca(e.target.value)}
          placeholder="Buscar pergunta ou resposta..."
          className="w-full pl-11 pr-4 py-3 bg-white border border-gray-200 rounded-2xl shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm outline-none"
        />
      </div>

      {/* Conteúdo */}
      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
        </div>
      ) : itemsFiltrados.length === 0 ? (
        <div className="bg-white rounded-2xl border-2 border-dashed border-gray-200 p-12 text-center">
          <HelpCircle className="h-10 w-10 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 font-medium">
            {busca ? 'Nenhuma pergunta encontrada para a busca' : 'Nenhuma pergunta disponível'}
          </p>
          {busca && (
            <button
              onClick={() => setBusca('')}
              className="mt-3 text-sm text-blue-600 hover:text-blue-700 font-medium"
            >
              Limpar busca
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {itemsFiltrados.map(item => (
            <div key={item.id} className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
              <button
                onClick={() => toggle(item.id)}
                className="w-full flex items-center justify-between gap-4 p-5 text-left hover:bg-blue-50/50 transition-colors"
              >
                <span className="font-semibold text-gray-900 text-sm leading-snug">{item.pergunta}</span>
                {openId === item.id
                  ? <ChevronUp className="h-5 w-5 text-blue-500 flex-shrink-0" />
                  : <ChevronDown className="h-5 w-5 text-gray-400 flex-shrink-0" />
                }
              </button>
              {openId === item.id && (
                <div className="px-5 pb-5 pt-0 border-t border-blue-100">
                  <p className="text-gray-600 text-sm leading-relaxed whitespace-pre-wrap pt-4">
                    {item.resposta}
                  </p>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {!isLoading && items.length > 0 && (
        <p className="text-center text-xs text-gray-400 mt-6">
          {itemsFiltrados.length} de {items.length}{' '}
          {items.length === 1 ? 'pergunta' : 'perguntas'}
        </p>
      )}
    </div>
  );
};

export default FAQ;
