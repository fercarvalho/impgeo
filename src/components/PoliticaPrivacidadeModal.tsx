import React, { useState, useEffect } from 'react';
import { X, ShieldCheck, RefreshCw } from 'lucide-react';
import DOMPurify from 'dompurify';

const API_BASE_URL =
  typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
    ? 'http://localhost:9001/api'
    : ((import.meta as any).env?.VITE_API_URL || '/api');

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

const PoliticaPrivacidadeModal: React.FC<PoliticaPrivacidadeModalProps> = ({ isOpen, onClose }) => {
  const [data, setData] = useState<PoliticaData | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setIsLoading(true);
    fetch(`${API_BASE_URL}/politica-privacidade`)
      .then(r => r.json())
      .then(res => { if (res.success) setData(res.data); })
      .catch(() => {})
      .finally(() => setIsLoading(false));
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const conteudo = data?.conteudo || DEFAULT_CONTENT;
  const versao = data?.versao ?? 1;
  const updatedAt = data?.updatedAt ? new Date(data.updatedAt).toLocaleDateString('pt-BR') : null;

  return (
    <div
      className="fixed inset-0 bg-black/60 flex items-center justify-center z-[10000] p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white rounded-2xl shadow-2xl border border-gray-200 w-full max-w-2xl max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 flex-shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="bg-indigo-100 rounded-lg p-1.5">
              <ShieldCheck className="h-5 w-5 text-indigo-600" />
            </div>
            <div>
              <h2 className="font-bold text-gray-900 text-base leading-tight">Política de Privacidade</h2>
              <p className="text-xs text-gray-400 mt-0.5">
                Versão {versao}{updatedAt ? ` • Atualizado em ${updatedAt}` : ''} • LGPD
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors rounded-lg p-1.5 hover:bg-gray-100"
            aria-label="Fechar"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 px-5 py-4">
          {isLoading ? (
            <div className="flex items-center justify-center py-16">
              <RefreshCw className="h-6 w-6 text-indigo-500 animate-spin" />
            </div>
          ) : (
            <div
              className="prose prose-sm max-w-none text-gray-700 leading-relaxed"
              dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(conteudo) }}
            />
          )}
        </div>

        <div className="flex justify-end px-5 py-4 border-t border-gray-100 flex-shrink-0">
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
