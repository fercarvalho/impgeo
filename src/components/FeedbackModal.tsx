import React, { useState, useEffect, useRef } from 'react';
import { X, Trash2, CheckCircle, ImageIcon, Link, MessageSquarePlus, MapPin, ChevronDown } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
const API_BASE_URL =
  typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
    ? 'http://localhost:9001/api'
    : ((import.meta as any).env?.VITE_API_URL || '/api');

interface FeedbackModalProps {
  isOpen: boolean;
  onClose: () => void;
  paginaAtual?: string;
}

const PAGINA_LABELS: Record<string, string> = {
  dashboard: 'Dashboard',
  transactions: 'Transações',
  products: 'Produtos',
  reports: 'Relatórios',
  metas: 'Metas',
  clients: 'Clientes',
  projecao: 'Projeção',
  admin: 'Administração',
  dre: 'DRE',
  activeSessions: 'Sessões Ativas',
  anomalies: 'Anomalias',
  securityAlerts: 'Alertas de Segurança',
  nuvemshop: 'Nuvemshop',
  roadmap: 'Roadmap',
  faq: 'FAQ',
};

type Categoria = 'duvida' | 'melhoria' | 'sugestao' | 'critica';

const CATEGORIAS: { id: Categoria; label: string; color: string; activeColor: string }[] = [
  { id: 'duvida', label: 'Dúvida', color: 'border-blue-200 text-blue-600 hover:border-blue-400 bg-white dark:bg-gray-700 dark:border-blue-800 dark:text-blue-400 dark:hover:border-blue-600', activeColor: 'bg-blue-500 border-blue-500 text-white' },
  { id: 'melhoria', label: 'Melhoria', color: 'border-green-200 text-green-600 hover:border-green-400 bg-white dark:bg-gray-700 dark:border-green-800 dark:text-green-400 dark:hover:border-green-600', activeColor: 'bg-green-500 border-green-500 text-white' },
  { id: 'sugestao', label: 'Sugestão', color: 'border-amber-200 text-amber-600 hover:border-amber-400 bg-white dark:bg-gray-700 dark:border-amber-800 dark:text-amber-400 dark:hover:border-amber-600', activeColor: 'bg-amber-500 border-amber-500 text-white' },
  { id: 'critica', label: 'Crítica', color: 'border-red-200 text-red-600 hover:border-red-400 bg-white dark:bg-gray-700 dark:border-red-800 dark:text-red-400 dark:hover:border-red-600', activeColor: 'bg-red-500 border-red-500 text-white' },
];

const TIPOS_ACEITOS = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_TAMANHO_MB = 5;

const FeedbackModal: React.FC<FeedbackModalProps> = ({ isOpen, onClose, paginaAtual }) => {
  const { token } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [categoria, setCategoria] = useState<Categoria | null>(null);
  const [descricao, setDescricao] = useState('');
  const [linkVideo, setLinkVideo] = useState('');
  const [paginaSelecionada, setPaginaSelecionada] = useState<string>(paginaAtual ?? '');
  const [imagemFile, setImagemFile] = useState<File | null>(null);
  const [imagemPreview, setImagemPreview] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [sucesso, setSucesso] = useState(false);

  // Sincroniza a página selecionada quando o modal abre
  useEffect(() => {
    if (isOpen) setPaginaSelecionada(paginaAtual ?? '');
  }, [isOpen, paginaAtual]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isSubmitting) handleClose();
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [isOpen, isSubmitting]);

  useEffect(() => {
    if (sucesso) {
      const t = setTimeout(() => handleClose(), 2500);
      return () => clearTimeout(t);
    }
  }, [sucesso]);

  const handleClose = () => {
    if (isSubmitting) return;
    setCategoria(null);
    setDescricao('');
    setLinkVideo('');
    setPaginaSelecionada(paginaAtual ?? '');
    setImagemFile(null);
    setImagemPreview(null);
    setErrors({});
    setSucesso(false);
    onClose();
  };

  const handleImagem = (file: File) => {
    if (!TIPOS_ACEITOS.includes(file.type)) {
      setErrors(e => ({ ...e, imagem: 'Formato inválido. Use JPG, PNG ou WebP.' }));
      return;
    }
    if (file.size > MAX_TAMANHO_MB * 1024 * 1024) {
      setErrors(e => ({ ...e, imagem: `Imagem muito grande. Máximo ${MAX_TAMANHO_MB}MB.` }));
      return;
    }
    setErrors(e => { const c = { ...e }; delete c.imagem; return c; });
    setImagemFile(file);
    const reader = new FileReader();
    reader.onload = ev => setImagemPreview(ev.target?.result as string);
    reader.readAsDataURL(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) handleImagem(file);
  };

  const removerImagem = () => {
    setImagemFile(null);
    setImagemPreview(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const validar = (): boolean => {
    const newErrors: Record<string, string> = {};
    if (!categoria) newErrors.categoria = 'Selecione uma categoria.';
    if (!descricao.trim() || descricao.trim().length < 20)
      newErrors.descricao = 'A descrição deve ter pelo menos 20 caracteres.';
    if (descricao.trim().length > 1000)
      newErrors.descricao = 'A descrição deve ter no máximo 1000 caracteres.';
    if (linkVideo.trim()) {
      const linkLower = linkVideo.toLowerCase();
      if (!linkLower.includes('drive.google.com') && !linkLower.includes('docs.google.com')) {
        newErrors.linkVideo = 'O link deve ser do Google Drive.';
      }
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validar()) return;

    setIsSubmitting(true);
    try {
      let imagemBase64: string | null = null;
      if (imagemFile) {
        imagemBase64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = ev => resolve(ev.target?.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(imagemFile);
        });
      }

      const res = await fetch(`${API_BASE_URL}/feedback`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          categoria,
          descricao: descricao.trim(),
          imagemBase64,
          linkVideo: linkVideo.trim() || null,
          pagina: paginaSelecionada || null,
        }),
      });

      if (res.ok) {
        setSucesso(true);
      } else {
        const data = await res.json().catch(() => ({}));
        setErrors({ geral: data.error || data.message || 'Erro ao enviar feedback. Tente novamente.' });
      }
    } catch {
      setErrors({ geral: 'Erro de conexão. Verifique sua internet e tente novamente.' });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 bg-gradient-to-br from-amber-900/50 to-orange-900/50 backdrop-blur-sm flex items-center justify-center z-50 px-4 pb-4 pt-[180px]"
      onClick={e => { if (e.target === e.currentTarget) handleClose(); }}
    >
      <div className="bg-gradient-to-br from-white to-gray-50 dark:from-gray-800 dark:to-gray-900 rounded-2xl p-6 w-full max-w-lg max-h-[calc(100vh-220px)] overflow-y-auto shadow-2xl border border-gray-200/50 dark:border-gray-700">
        {/* Header */}
        <div className="bg-gradient-to-r from-amber-50 to-orange-50 dark:from-gray-900/80 dark:to-gray-900/80 -mx-6 -mt-6 mb-6 px-6 py-4 border-b border-amber-200/50 dark:border-gray-700 rounded-t-2xl">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold text-amber-800 flex items-center gap-2">
              <MessageSquarePlus className="w-6 h-6 text-amber-700" />
              Enviar Feedback
            </h2>
            <button
              onClick={handleClose}
              disabled={isSubmitting}
              className="text-amber-600 hover:text-amber-800 hover:bg-amber-100 p-2 rounded-full transition-all disabled:opacity-50"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          <p className="text-sm text-amber-700/70 dark:text-amber-400/70 mt-0.5">Sua opinião nos ajuda a melhorar o sistema</p>
        </div>

        {sucesso ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <div className="bg-green-100 rounded-full p-4 mb-4">
              <CheckCircle className="w-10 h-10 text-green-500" />
            </div>
            <h3 className="text-lg font-bold text-gray-800 mb-1">Feedback enviado!</h3>
            <p className="text-sm text-gray-500">Obrigado pela sua contribuição. Analisaremos em breve.</p>
          </div>
        ) : (
          <form id="feedback-form" onSubmit={handleSubmit} noValidate className="space-y-4">
            {/* Categoria */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Categoria <span className="text-red-500">*</span>
              </label>
              <div className="flex flex-wrap gap-2">
                {CATEGORIAS.map(cat => (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => {
                      setCategoria(cat.id);
                      setErrors(e => { const c = { ...e }; delete c.categoria; return c; });
                    }}
                    className={`px-4 py-2 rounded-xl border-2 text-sm font-semibold transition-all duration-150 ${
                      categoria === cat.id ? cat.activeColor : cat.color
                    }`}
                  >
                    {cat.label}
                  </button>
                ))}
              </div>
              {errors.categoria && <p className="text-sm text-red-600 bg-red-50 p-2 rounded-md border border-red-100 mt-1.5">{errors.categoria}</p>}
            </div>

            {/* Descrição */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Descrição <span className="text-red-500">*</span>
              </label>
              <textarea
                value={descricao}
                onChange={e => {
                  setDescricao(e.target.value);
                  if (errors.descricao) setErrors(er => { const c = { ...er }; delete c.descricao; return c; });
                }}
                placeholder="Descreva seu feedback com detalhes..."
                rows={4}
                maxLength={1000}
                disabled={isSubmitting}
                className="w-full px-4 py-3 border border-gray-200 dark:border-gray-600 rounded-xl bg-gray-50 dark:!bg-gray-700 focus:outline-none focus:ring-2 focus:ring-amber-500 transition-all text-sm resize-none disabled:opacity-50 dark:text-gray-100 dark:placeholder-gray-400"
              />
              <div className="flex items-center justify-between mt-1">
                {errors.descricao
                  ? <p className="text-sm text-red-600 bg-red-50 p-2 rounded-md border border-red-100 flex-1 mr-2">{errors.descricao}</p>
                  : <span />
                }
                <span className={`text-xs ${descricao.length > 950 ? 'text-red-400' : 'text-gray-400'}`}>
                  {descricao.length}/1000
                </span>
              </div>
            </div>

            {/* Imagem */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Imagem <span className="text-gray-400 font-normal text-xs">(opcional)</span>
              </label>
              {imagemPreview ? (
                <div className="relative rounded-xl overflow-hidden border border-gray-200">
                  <img src={imagemPreview} alt="Preview" className="w-full max-h-48 object-contain bg-gray-50" />
                  <button
                    type="button"
                    onClick={removerImagem}
                    className="absolute top-2 right-2 bg-red-500 hover:bg-red-600 text-white rounded-lg p-1.5 shadow transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <div
                  onDrop={handleDrop}
                  onDragOver={e => e.preventDefault()}
                  onClick={() => fileInputRef.current?.click()}
                  className="flex flex-col items-center justify-center gap-2 border-2 border-dashed border-gray-200 dark:border-gray-600 hover:border-amber-400 dark:hover:border-amber-600 rounded-xl p-6 cursor-pointer transition-colors group bg-gray-50 dark:bg-gray-700/50 hover:bg-amber-50/30 dark:hover:bg-amber-900/20"
                >
                  <div className="bg-white dark:bg-gray-700 group-hover:bg-amber-50 dark:group-hover:bg-amber-900/30 rounded-xl p-3 shadow-sm transition-colors">
                    <ImageIcon className="w-6 h-6 text-gray-400 group-hover:text-amber-500 transition-colors" />
                  </div>
                  <p className="text-sm text-gray-500 text-center">
                    <span className="font-semibold text-amber-600">Clique</span> ou arraste uma imagem
                  </p>
                  <p className="text-xs text-gray-400">JPG, PNG, WebP — máx. 5MB</p>
                </div>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept=".jpg,.jpeg,.png,.webp"
                className="hidden"
                onChange={e => { if (e.target.files?.[0]) handleImagem(e.target.files[0]); }}
              />
              {errors.imagem && <p className="text-sm text-red-600 bg-red-50 p-2 rounded-md border border-red-100 mt-1.5">{errors.imagem}</p>}
            </div>

            {/* Link de vídeo */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Link de vídeo <span className="text-gray-400 font-normal text-xs">(opcional — Google Drive)</span>
              </label>
              <div className="relative">
                <Link className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="url"
                  value={linkVideo}
                  onChange={e => {
                    setLinkVideo(e.target.value);
                    if (errors.linkVideo) setErrors(er => { const c = { ...er }; delete c.linkVideo; return c; });
                  }}
                  placeholder="https://drive.google.com/..."
                  disabled={isSubmitting}
                  className="w-full pl-9 pr-4 py-3 border border-gray-200 dark:border-gray-600 rounded-xl bg-gray-50 dark:!bg-gray-700 focus:outline-none focus:ring-2 focus:ring-amber-500 transition-all text-sm disabled:opacity-50 dark:text-gray-100 dark:placeholder-gray-400"
                />
              </div>
              {errors.linkVideo && <p className="text-sm text-red-600 bg-red-50 p-2 rounded-md border border-red-100 mt-1.5">{errors.linkVideo}</p>}
            </div>

            {/* Página de referência */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Página de referência <span className="text-gray-400 font-normal text-xs">(opcional)</span>
              </label>
              <div className="relative">
                <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                <select
                  value={paginaSelecionada}
                  onChange={e => setPaginaSelecionada(e.target.value)}
                  disabled={isSubmitting}
                  className="w-full pl-9 pr-9 py-3 border border-gray-200 dark:border-gray-600 rounded-xl bg-gray-50 dark:!bg-gray-700 focus:outline-none focus:ring-2 focus:ring-amber-500 transition-all text-sm text-gray-700 dark:text-gray-100 appearance-none disabled:opacity-50"
                >
                  <option value="">Nenhuma página específica</option>
                  {Object.entries(PAGINA_LABELS).map(([key, label]) => (
                    <option key={key} value={key}>{label}</option>
                  ))}
                </select>
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
              </div>
            </div>

            {errors.geral && (
              <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-lg text-sm">
                {errors.geral}
              </div>
            )}

            {/* Botões */}
            <div className="flex gap-3 justify-end pt-2 border-t border-gray-200 dark:border-gray-700 mt-2">
              <button
                type="button"
                onClick={handleClose}
                disabled={isSubmitting}
                className="px-6 py-3 border border-gray-300 dark:border-gray-600 rounded-xl text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="px-6 py-3 bg-gradient-to-r from-amber-500 to-amber-600 text-white rounded-xl hover:from-amber-600 hover:to-amber-700 disabled:opacity-60 transition-all shadow-sm flex items-center gap-2"
              >
                {isSubmitting ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
                    Enviando...
                  </>
                ) : (
                  'Enviar Feedback'
                )}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};

export default FeedbackModal;
