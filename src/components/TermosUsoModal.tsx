import React, { useState, useEffect, useCallback } from 'react';
import { X, FileText, RefreshCw } from 'lucide-react';
import DOMPurify from 'dompurify';

const API_BASE_URL =
  typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
    ? 'http://localhost:9001/api'
    : (import.meta.env.VITE_API_URL || '/api');

interface TermosData {
  conteudo: string;
  versao: number;
  updatedAt: string | null;
}

interface TermosUsoModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const DEFAULT_CONTENT = `
<h3>Termos de Uso</h3>
<p>Bem-vindo ao <strong>IMPGEO</strong>. Ao utilizar este sistema, você concorda com os presentes Termos de Uso.</p>
<h4>1. Aceitação dos Termos</h4>
<p>O uso deste sistema implica a aceitação integral destes Termos de Uso e da Política de Privacidade.</p>
<h4>2. Uso do Sistema</h4>
<p>O sistema é destinado exclusivamente ao uso por usuários autorizados. É proibido o compartilhamento de credenciais de acesso.</p>
<h4>3. Responsabilidades</h4>
<p>O usuário é responsável por manter a confidencialidade de suas credenciais e por todas as atividades realizadas em sua conta.</p>
<h4>4. Propriedade Intelectual</h4>
<p>Todo o conteúdo, design e funcionalidades do sistema são protegidos por direitos autorais e não podem ser reproduzidos sem autorização.</p>
<h4>5. Privacidade e LGPD</h4>
<p>O tratamento de dados pessoais é realizado em conformidade com a Lei Geral de Proteção de Dados (LGPD — Lei 13.709/2018).</p>
<h4>6. Alterações</h4>
<p>Estes Termos podem ser atualizados a qualquer momento. A continuidade do uso do sistema após alterações implica aceitação dos novos Termos.</p>
<h4>7. Contato</h4>
<p>Para dúvidas sobre estes Termos, entre em contato com a equipe de suporte.</p>
`;

const HEADING_ID = 'termos-uso-heading';

const TermosUsoModal: React.FC<TermosUsoModalProps> = ({ isOpen, onClose }) => {
  const [data, setData] = useState<TermosData | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      setData(null);
      setIsLoading(false);
      return;
    }
    let mounted = true;
    const load = async () => {
      setIsLoading(true);
      try {
        const r = await fetch(`${API_BASE_URL}/termos-uso`);
        let res: { success?: boolean; data?: TermosData } = {};
        try {
          res = await r.json();
        } catch {
          // body não é JSON (ex: 502 com HTML)
        }
        if (mounted) {
          if (r.ok && res.success && res.data) {
            setData(res.data);
          }
          // em caso de falha (rede ou success=false), conteúdo padrão será exibido
        }
      } catch {
        // falha de rede — conteúdo padrão será exibido
      } finally {
        if (mounted) setIsLoading(false);
      }
    };
    load();
    return () => { mounted = false; };
  }, [isOpen]);

  const handleKey = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') onClose();
  }, [onClose]);

  useEffect(() => {
    if (!isOpen) return;
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [isOpen, handleKey]);

  if (!isOpen) return null;

  const conteudo = data?.conteudo || DEFAULT_CONTENT;
  const versao = data?.versao ?? 1;

  let updatedAt: string | null = null;
  if (data?.updatedAt) {
    const parsed = new Date(data.updatedAt);
    if (!isNaN(parsed.getTime())) {
      updatedAt = parsed.toLocaleDateString('pt-BR');
    }
  }

  return (
    <div
      className="fixed inset-0 bg-gradient-to-br from-blue-900/50 to-indigo-900/50 backdrop-blur-sm flex items-center justify-center z-[10000] p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      role="dialog"
      aria-modal="true"
      aria-labelledby={HEADING_ID}
    >
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700 w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 bg-gradient-to-r from-blue-500 to-indigo-600 flex-shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="bg-white/20 rounded-lg p-1.5">
              <FileText className="h-5 w-5 text-white" aria-hidden="true" />
            </div>
            <div>
              <h2 id={HEADING_ID} className="font-bold text-white text-base leading-tight">Termos de Uso</h2>
              <p className="text-xs text-white/70 mt-0.5">
                Versão {versao}{updatedAt ? ` • Atualizado em ${updatedAt}` : ''}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-white/80 hover:text-white hover:bg-white/20 transition-all duration-200 rounded-lg p-1.5"
            aria-label="Fechar termos de uso"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        <div
          className="overflow-y-auto flex-1 px-5 py-4"
          tabIndex={0}
          aria-label="Conteúdo dos termos de uso"
          aria-live="polite"
        >
          {isLoading ? (
            <div className="flex items-center justify-center py-16" role="status" aria-label="Carregando termos de uso">
              <RefreshCw className="h-6 w-6 text-blue-500 animate-spin" aria-hidden="true" />
            </div>
          ) : (
            <div
              className="prose prose-sm dark:prose-invert max-w-none text-gray-700 dark:text-gray-200 leading-relaxed"
              dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(conteudo) }}
            />
          )}
        </div>

        <div className="flex justify-end px-5 py-4 border-t border-gray-100 dark:border-gray-700 flex-shrink-0">
          <button
            onClick={onClose}
            className="px-5 py-2.5 text-sm font-semibold rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white shadow-md transition-all"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
};

export default TermosUsoModal;
