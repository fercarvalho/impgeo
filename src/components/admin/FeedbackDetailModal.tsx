import React, { useState, useEffect } from 'react';
import {
  X, HelpCircle, TrendingUp, Lightbulb, ThumbsDown,
  Clock, CheckCircle, MessageCircle, ExternalLink,
  Send, CheckCheck, AlertCircle, User, MessageSquare
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { getAdminApiBaseUrl, getAuthHeaders } from './api';
import { Feedback } from './FeedbackManagement';

interface FeedbackDetailModalProps {
  feedback: Feedback;
  onClose: () => void;
  onAtualizar: () => void;
}

const CATEGORIA_CONFIG = {
  duvida:   { label: 'Dúvida',   icon: HelpCircle,  bg: 'bg-blue-100',   text: 'text-blue-700' },
  melhoria: { label: 'Melhoria', icon: TrendingUp,  bg: 'bg-green-100',  text: 'text-green-700' },
  sugestao: { label: 'Sugestão', icon: Lightbulb,   bg: 'bg-indigo-100', text: 'text-indigo-700' },
  critica:  { label: 'Crítica',  icon: ThumbsDown,  bg: 'bg-red-100',    text: 'text-red-700' },
};

const STATUS_CONFIG = {
  pendente:   { label: 'Pendente',   icon: Clock,         bg: 'bg-gray-100',  text: 'text-gray-600' },
  respondido: { label: 'Respondido', icon: MessageCircle, bg: 'bg-blue-100',  text: 'text-blue-700' },
  aceito:     { label: 'Aceito',     icon: CheckCircle,   bg: 'bg-green-100', text: 'text-green-700' },
};

type Acao = 'responder' | 'aceitar' | null;

const FeedbackDetailModal: React.FC<FeedbackDetailModalProps> = ({ feedback, onClose, onAtualizar }) => {
  const { user } = useAuth();
  const isSuperAdmin = user?.role === 'superadmin';
  const apiBase = getAdminApiBaseUrl();

  const [acao, setAcao] = useState<Acao>(null);
  const [mensagem, setMensagem] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [erro, setErro] = useState('');
  const [imagemExpandida, setImagemExpandida] = useState(false);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isSubmitting) {
        if (imagemExpandida) { setImagemExpandida(false); return; }
        if (acao) { setAcao(null); setMensagem(''); setErro(''); return; }
        onClose();
      }
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [isSubmitting, acao, imagemExpandida]);

  const formatarData = (dateStr: string) =>
    new Date(dateStr).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

  const handleAcao = async () => {
    if (!mensagem.trim() || mensagem.trim().length < 10) {
      setErro('A mensagem deve ter pelo menos 10 caracteres.');
      return;
    }
    setIsSubmitting(true);
    setErro('');
    try {
      const endpoint = acao === 'aceitar'
        ? `${apiBase}/admin/feedbacks/${feedback.id}/aceitar`
        : `${apiBase}/admin/feedbacks/${feedback.id}/responder`;

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify(
          acao === 'aceitar'
            ? { mensagem: mensagem.trim(), criarRoadmap: false }
            : { mensagem: mensagem.trim() }
        ),
      });

      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success !== false) {
        onAtualizar();
      } else {
        setErro(data.error || data.message || 'Erro ao processar ação. Tente novamente.');
      }
    } catch {
      setErro('Erro de conexão. Verifique sua internet e tente novamente.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const cat = CATEGORIA_CONFIG[feedback.categoria];
  const CatIcon = cat.icon;
  const st = STATUS_CONFIG[feedback.status];
  const StIcon = st.icon;
  const podeAgir = isSuperAdmin && feedback.status === 'pendente';

  return (
    <>
      <div
        className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 px-4 pb-4 pt-[180px]"
        onClick={e => { if (e.target === e.currentTarget && !isSubmitting) onClose(); }}
      >
        <div className="bg-white rounded-2xl p-6 w-full max-w-xl max-h-[calc(100vh-220px)] overflow-y-auto shadow-2xl border border-gray-200">
          {/* Header */}
          <div className="bg-blue-600 -mx-6 -mt-6 mb-6 px-6 py-4 rounded-t-2xl">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold text-white flex items-center gap-2">
                <MessageSquare className="w-6 h-6" />
                Feedback — {cat.label}
              </h2>
              <button
                onClick={onClose}
                disabled={isSubmitting}
                className="text-white/70 hover:text-white hover:bg-blue-700 p-2 rounded-full transition-all disabled:opacity-50"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex items-center gap-2 mt-2">
              <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold ${st.bg} ${st.text}`}>
                <StIcon className="w-3 h-3" />
                {st.label}
              </span>
              <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold ${cat.bg} ${cat.text}`}>
                <CatIcon className="w-3 h-3" />
                {cat.label}
              </span>
            </div>
          </div>

          <div className="space-y-5">
            {/* Usuário */}
            <div className="flex items-center gap-3 bg-gray-100 rounded-xl p-3">
              <div className="bg-blue-100 rounded-full p-2">
                <User className="w-4 h-4 text-blue-600" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-gray-700">{feedback.usuarioNome}</p>
                <p className="text-xs text-gray-400">{feedback.usuarioEmail}</p>
              </div>
              <span className="text-xs text-gray-400 shrink-0">{formatarData(feedback.createdAt)}</span>
            </div>

            {/* Descrição */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Descrição</label>
              <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap bg-gray-100 rounded-xl p-4">
                {feedback.descricao}
              </p>
            </div>

            {/* Imagem */}
            {feedback.imagemBase64 && (
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Imagem</label>
                <img
                  src={feedback.imagemBase64}
                  alt="Imagem do feedback"
                  onClick={() => setImagemExpandida(true)}
                  className="w-full max-h-48 object-contain bg-gray-50 rounded-xl border border-gray-200 cursor-zoom-in hover:opacity-90 transition-opacity"
                />
              </div>
            )}

            {/* Link de vídeo */}
            {feedback.linkVideo && (
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Vídeo</label>
                <a
                  href={feedback.linkVideo}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 text-sm text-blue-600 hover:text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-xl px-4 py-3 transition-colors"
                >
                  <ExternalLink className="w-4 h-4 shrink-0" />
                  <span className="truncate">{feedback.linkVideo}</span>
                </a>
              </div>
            )}

            {feedback.pagina && (
              <p className="text-xs text-gray-400">
                Enviado em: <span className="font-medium text-gray-500">{feedback.pagina}</span>
              </p>
            )}

            {/* Resposta existente */}
            {feedback.resposta && (
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
                <p className="text-xs font-semibold text-blue-600 uppercase tracking-wider mb-2">Resposta do administrador</p>
                <p className="text-sm text-blue-800 leading-relaxed whitespace-pre-wrap">{feedback.resposta}</p>
              </div>
            )}

            {/* Ações — superadmin */}
            {podeAgir && (
              <div className="border-2 border-dashed border-blue-200 rounded-xl p-4 bg-blue-50/30">
                {!acao ? (
                  <div>
                    <p className="text-xs font-semibold text-blue-700 uppercase tracking-wider mb-3">Ações disponíveis</p>
                    <div className="flex gap-3">
                      <button
                        onClick={() => { setAcao('responder'); setMensagem(''); setErro(''); }}
                        className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 border border-gray-300 rounded-xl text-gray-700 hover:bg-gray-50 transition-colors text-sm font-semibold"
                      >
                        <Send className="w-4 h-4" />
                        Responder
                      </button>
                      <button
                        onClick={() => { setAcao('aceitar'); setMensagem(''); setErro(''); }}
                        className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-green-600 hover:bg-green-700 text-white rounded-xl text-sm font-semibold shadow-sm transition-all"
                      >
                        <CheckCheck className="w-4 h-4" />
                        Aceitar e Responder
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-semibold text-blue-700 uppercase tracking-wider">
                        {acao === 'aceitar' ? 'Aceitar feedback' : 'Responder usuário'}
                      </p>
                      <button
                        onClick={() => { setAcao(null); setMensagem(''); setErro(''); }}
                        disabled={isSubmitting}
                        className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
                      >
                        Cancelar
                      </button>
                    </div>

                    {acao === 'aceitar' && (
                      <div className="bg-green-50 border border-green-200 text-green-800 px-4 py-3 rounded-lg text-sm flex items-start gap-2">
                        <CheckCircle className="w-4 h-4 shrink-0 mt-0.5 text-green-600" />
                        <span>Este feedback será aceito e o usuário receberá um email de confirmação com sua mensagem.</span>
                      </div>
                    )}

                    <textarea
                      value={mensagem}
                      onChange={e => { setMensagem(e.target.value); setErro(''); }}
                      placeholder={acao === 'aceitar'
                        ? 'Escreva uma mensagem para o usuário informando que o feedback foi aceito...'
                        : 'Escreva sua resposta para o usuário...'
                      }
                      rows={4}
                      disabled={isSubmitting}
                      className="w-full px-4 py-3 border border-gray-200 rounded-xl bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all text-sm resize-none disabled:opacity-50"
                    />

                    {erro && (
                      <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-lg text-sm flex items-center gap-2">
                        <AlertCircle className="w-4 h-4 shrink-0 text-red-500" />
                        {erro}
                      </div>
                    )}

                    <button
                      onClick={handleAcao}
                      disabled={isSubmitting}
                      className={`w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-semibold shadow-sm transition-all disabled:opacity-60 ${
                        acao === 'aceitar'
                          ? 'bg-green-600 hover:bg-green-700 text-white'
                          : 'bg-blue-600 hover:bg-blue-700 text-white'
                      }`}
                    >
                      {isSubmitting ? (
                        <><div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />Processando...</>
                      ) : acao === 'aceitar' ? (
                        <><CheckCheck className="w-4 h-4" />Confirmar Aceite</>
                      ) : (
                        <><Send className="w-4 h-4" />Enviar Resposta</>
                      )}
                    </button>
                  </div>
                )}
              </div>
            )}

            {!isSuperAdmin && feedback.status === 'pendente' && (
              <div className="bg-gray-50 border border-gray-200 text-gray-600 px-4 py-3 rounded-lg text-sm flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 text-gray-400" />
                Apenas superadmins podem responder ou aceitar feedbacks.
              </div>
            )}
          </div>

          <div className="flex justify-end pt-4 border-t border-gray-200 mt-6">
            <button
              onClick={onClose}
              disabled={isSubmitting}
              className="px-6 py-3 border border-gray-300 rounded-xl text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50"
            >
              Fechar
            </button>
          </div>
        </div>
      </div>

      {/* Imagem expandida */}
      {imagemExpandida && feedback.imagemBase64 && (
        <div
          className="fixed inset-0 bg-black/80 z-[60] flex items-center justify-center p-4 cursor-zoom-out"
          onClick={() => setImagemExpandida(false)}
        >
          <img
            src={feedback.imagemBase64}
            alt="Imagem expandida"
            className="max-w-full max-h-full object-contain rounded-xl shadow-2xl"
          />
          <button
            onClick={() => setImagemExpandida(false)}
            className="absolute top-4 right-4 bg-white/20 hover:bg-white/30 text-white rounded-full p-2 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      )}
    </>
  );
};

export default FeedbackDetailModal;
