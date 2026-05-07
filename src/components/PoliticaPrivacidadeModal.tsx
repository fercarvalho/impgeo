import React, { useState, useEffect, useRef } from 'react';
import { X, ShieldCheck, RefreshCw, AlertCircle } from 'lucide-react';
import DOMPurify from 'dompurify';

const API_BASE_URL =
  typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
    ? 'http://localhost:9001/api'
    : (import.meta.env.VITE_API_URL || '/api');

interface PoliticaData {
  conteudo: string;
  versao: number;
  updatedAt: string | null;
}

interface PoliticaPrivacidadeModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const DEFAULT_CONTENT = `
<h2>Política de Privacidade</h2>
<p>Esta Política de Privacidade descreve como tratamos seus dados pessoais em conformidade com a <strong>Lei Geral de Proteção de Dados (LGPD — Lei 13.709/2018)</strong>.</p>
<h3>1. Dados Coletados</h3>
<p>Coletamos apenas os dados necessários para o funcionamento do sistema, incluindo: nome, e-mail, dados de acesso e informações de uso.</p>
<h3>2. Finalidade do Tratamento</h3>
<p>Seus dados são utilizados exclusivamente para: autenticação, personalização da experiência, segurança e conformidade legal.</p>
<h3>3. Base Legal</h3>
<p>O tratamento é baseado no legítimo interesse do controlador, execução de contrato e cumprimento de obrigação legal (Art. 7º da LGPD).</p>
<h3>4. Compartilhamento de Dados</h3>
<p>Não compartilhamos seus dados com terceiros, exceto quando exigido por lei ou necessário para a prestação do serviço.</p>
<h3>5. Seus Direitos (LGPD)</h3>
<p>Você tem direito a: acesso, correção, eliminação, portabilidade e revogação do consentimento a qualquer momento.</p>
<h3>6. Cookies</h3>
<p>Utilizamos cookies para melhorar sua experiência. Você pode gerenciar suas preferências a qualquer momento pelo banner de cookies.</p>
<h3>7. Segurança</h3>
<p>Adotamos medidas técnicas e organizacionais para proteger seus dados contra acesso não autorizado, perda ou destruição.</p>
<h3>8. Retenção de Dados</h3>
<p>Os dados são mantidos pelo tempo necessário para cumprir as finalidades descritas ou conforme exigido por lei.</p>
<h3>9. Contato — DPO</h3>
<p>Para exercer seus direitos ou esclarecer dúvidas sobre privacidade, entre em contato com nosso Encarregado de Proteção de Dados (DPO).</p>
<h3>10. Alterações</h3>
<p>Esta política pode ser atualizada periodicamente. Notificaremos alterações significativas através do sistema.</p>
`;

const HEADING_ID = 'politica-privacidade-titulo';

const PoliticaPrivacidadeModal: React.FC<PoliticaPrivacidadeModalProps> = ({ isOpen, onClose }) => {
  const [data, setData] = useState<PoliticaData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [hasError, setHasError] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  // Reset state and fetch data when modal opens; cancel in-flight request on close
  useEffect(() => {
    if (!isOpen) {
      // Cancel any in-flight fetch and reset stale data
      abortRef.current?.abort();
      setData(null);
      setHasError(false);
      return;
    }

    const controller = new AbortController();
    abortRef.current = controller;

    setIsLoading(true);
    setHasError(false);

    fetch(`${API_BASE_URL}/politica-privacidade`, { signal: controller.signal })
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then(res => { if (res.success) setData(res.data); })
      .catch(err => {
        if (err.name !== 'AbortError') setHasError(true);
      })
      .finally(() => setIsLoading(false));

    return () => controller.abort();
  }, [isOpen]);

  // Keyboard handler: close on Escape
  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const conteudo = data?.conteudo?.trim() ? data.conteudo : DEFAULT_CONTENT;
  const versao = data?.versao ?? 1;
  const updatedAt = data?.updatedAt ? new Date(data.updatedAt).toLocaleDateString('pt-BR') : null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={HEADING_ID}
      className="fixed inset-0 bg-gradient-to-br from-blue-900/50 to-indigo-900/50 backdrop-blur-sm flex items-center justify-center z-[10000] p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700 w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 bg-gradient-to-r from-blue-500 to-indigo-600 flex-shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="bg-white/20 rounded-lg p-1.5">
              <ShieldCheck aria-hidden="true" className="h-5 w-5 text-white" />
            </div>
            <div>
              <h2 id={HEADING_ID} className="font-bold text-white text-base leading-tight">Política de Privacidade</h2>
              <p className="text-xs text-white/70 mt-0.5">
                Versão {versao}{updatedAt ? ` • Atualizado em ${updatedAt}` : ''} • LGPD
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-white/80 hover:text-white hover:bg-white/20 transition-all duration-200 rounded-lg p-1.5"
            aria-label="Fechar"
          >
            <X aria-hidden="true" className="h-5 w-5" />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 px-5 py-4">
          {isLoading ? (
            <div role="status" className="flex items-center justify-center py-16">
              <RefreshCw aria-hidden="true" className="h-6 w-6 text-indigo-500 animate-spin" />
              <span className="sr-only">Carregando política de privacidade…</span>
            </div>
          ) : hasError ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
              <AlertCircle aria-hidden="true" className="h-8 w-8 text-red-400" />
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Não foi possível carregar a política de privacidade. Exibindo versão padrão.
              </p>
              <div
                className="prose prose-sm max-w-none text-gray-700 dark:text-gray-300 leading-relaxed mt-2 text-left w-full"
                dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(DEFAULT_CONTENT) }}
              />
            </div>
          ) : (
            <div
              className="prose prose-sm max-w-none text-gray-700 dark:text-gray-300 leading-relaxed"
              dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(conteudo) }}
            />
          )}
        </div>

        <div className="flex justify-end px-5 py-4 border-t border-gray-200 dark:border-gray-700 flex-shrink-0">
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

export default PoliticaPrivacidadeModal;
