import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  FileText, ShieldCheck, Cookie, Save, RefreshCw, Plus, Trash2, Edit2,
  Check, X, AlertTriangle, Lock, ChevronDown, ChevronUp
} from 'lucide-react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { useAuth } from '../../contexts/AuthContext';

const API_BASE_URL =
  typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
    ? 'http://localhost:9001/api'
    : ((import.meta as any).env?.VITE_API_URL || '/api');

// ─── Tipos ───────────────────────────────────────────────────────────────────

interface LegalDoc {
  conteudo: string;
  versao: number;
  updatedAt: string | null;
  updatedByUsername?: string | null;
}

interface BannerConfig {
  titulo: string;
  texto: string;
  textoBotaoAceitar: string;
  textoBotaoRejeitar: string;
  textoBotaoPersonalizar: string;
  textoDescricaoGerenciamento: string;
}

interface CookieCategoria {
  id: number;
  chave: string;
  nome: string;
  descricao: string;
  ativo: boolean;
  obrigatorio: boolean;
  ordem: number;
}

type LegalTab = 'termos' | 'politica' | 'cookies';

// ─── Editor TipTap ───────────────────────────────────────────────────────────

const TipTapEditor: React.FC<{ content: string; onChange: (html: string) => void }> = ({ content, onChange }) => {
  const editor = useEditor({
    extensions: [StarterKit],
    content,
    onUpdate: ({ editor }) => onChange(editor.getHTML()),
    editorProps: {
      attributes: { class: 'min-h-[320px] px-4 py-3 text-sm text-gray-800 focus:outline-none leading-relaxed' },
    },
  });

  useEffect(() => {
    if (editor && content !== editor.getHTML()) {
      editor.commands.setContent(content || '', { emitUpdate: false });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [content]);

  if (!editor) return null;

  const ToolBtn: React.FC<{ onClick: () => void; active?: boolean; title: string; children: React.ReactNode }> = ({ onClick, active, title, children }) => (
    <button
      type="button"
      onMouseDown={e => { e.preventDefault(); onClick(); }}
      title={title}
      className={`px-2 py-1 rounded text-xs font-medium transition-colors ${
        active ? 'bg-blue-100 text-blue-700' : 'text-gray-500 hover:bg-gray-100'
      }`}
    >
      {children}
    </button>
  );

  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden bg-white">
      <div className="flex flex-wrap gap-1 px-3 py-2 border-b border-gray-100 bg-gray-50">
        <ToolBtn onClick={() => editor.chain().focus().toggleBold().run()} active={editor.isActive('bold')} title="Negrito"><strong>N</strong></ToolBtn>
        <ToolBtn onClick={() => editor.chain().focus().toggleItalic().run()} active={editor.isActive('italic')} title="Itálico"><em>I</em></ToolBtn>
        <div className="w-px bg-gray-200 mx-1" />
        <ToolBtn onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()} active={editor.isActive('heading', { level: 1 })} title="Título 1">H1</ToolBtn>
        <ToolBtn onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} active={editor.isActive('heading', { level: 2 })} title="Título 2">H2</ToolBtn>
        <ToolBtn onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} active={editor.isActive('heading', { level: 3 })} title="Título 3">H3</ToolBtn>
        <div className="w-px bg-gray-200 mx-1" />
        <ToolBtn onClick={() => editor.chain().focus().toggleBulletList().run()} active={editor.isActive('bulletList')} title="Lista">• Lista</ToolBtn>
        <ToolBtn onClick={() => editor.chain().focus().toggleOrderedList().run()} active={editor.isActive('orderedList')} title="Lista numerada">1. Lista</ToolBtn>
        <div className="w-px bg-gray-200 mx-1" />
        <ToolBtn onClick={() => editor.chain().focus().toggleBlockquote().run()} active={editor.isActive('blockquote')} title="Citação">❝</ToolBtn>
        <ToolBtn onClick={() => editor.chain().focus().setHorizontalRule().run()} active={false} title="Divisor">─</ToolBtn>
        <div className="w-px bg-gray-200 mx-1" />
        <ToolBtn onClick={() => editor.chain().focus().undo().run()} active={false} title="Desfazer">↩</ToolBtn>
        <ToolBtn onClick={() => editor.chain().focus().redo().run()} active={false} title="Refazer">↪</ToolBtn>
      </div>
      <EditorContent editor={editor} />
    </div>
  );
};

// ─── Componente Principal ─────────────────────────────────────────────────────

const LegalManagement: React.FC = () => {
  const { user, token } = useAuth();
  const [activeTab, setActiveTab] = useState<LegalTab>('termos');
  const [isSaving, setIsSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const [termos, setTermos] = useState<LegalDoc | null>(null);
  const [termosContent, setTermosContent] = useState('');

  const [politica, setPolitica] = useState<LegalDoc | null>(null);
  const [politicaContent, setPoliticaContent] = useState('');

  const [bannerConfig, setBannerConfig] = useState<BannerConfig>({
    titulo: '', texto: '', textoBotaoAceitar: '',
    textoBotaoRejeitar: '', textoBotaoPersonalizar: '', textoDescricaoGerenciamento: '',
  });

  const [categorias, setCategorias] = useState<CookieCategoria[]>([]);
  const [showCatForm, setShowCatForm] = useState(false);
  const [editingCat, setEditingCat] = useState<CookieCategoria | null>(null);
  const [catForm, setCatForm] = useState({ chave: '', nome: '', descricao: '', ativo: true, obrigatorio: false, ordem: 0 });
  const [expandedCat, setExpandedCat] = useState<number | null>(null);

  const loadedRef = useRef<Set<LegalTab>>(new Set());

  useEffect(() => { loadedRef.current.clear(); }, [user?.id]);

  const permissoes = (user as any)?.permissoesLegais || {};
  const isSuperAdmin = user?.role === 'superadmin';
  const canTermos = isSuperAdmin || permissoes.termos_uso === true;
  const canPolitica = isSuperAdmin || permissoes.politica_privacidade === true;
  const canCookies = isSuperAdmin || permissoes.cookies === true;

  const authHeaders = useCallback(() => ({
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`,
  }), [token]);

  const showFeedback = (type: 'success' | 'error', text: string) => {
    setSaveMsg({ type, text });
    setTimeout(() => setSaveMsg(null), 4000);
  };

  const loadTab = useCallback(async (tab: LegalTab) => {
    if (loadedRef.current.has(tab)) return;
    loadedRef.current.add(tab);
    try {
      if (tab === 'termos' && canTermos) {
        const res = await fetch(`${API_BASE_URL}/admin/termos-uso`, { headers: authHeaders() });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (data.success) { setTermos(data.data); setTermosContent(data.data?.conteudo || ''); }
      }
      if (tab === 'politica' && canPolitica) {
        const res = await fetch(`${API_BASE_URL}/admin/politica-privacidade`, { headers: authHeaders() });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (data.success) { setPolitica(data.data); setPoliticaContent(data.data?.conteudo || ''); }
      }
      if (tab === 'cookies' && canCookies) {
        const [cfgRes, catRes] = await Promise.all([
          fetch(`${API_BASE_URL}/admin/cookie-banner-config`, { headers: authHeaders() }).then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); }),
          fetch(`${API_BASE_URL}/admin/cookie-categorias`, { headers: authHeaders() }).then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); }),
        ]);
        if (cfgRes.success && cfgRes.data) setBannerConfig(cfgRes.data);
        if (catRes.success) setCategorias(catRes.data);
      }
    } catch (err) {
      loadedRef.current.delete(tab);
      console.error('Erro ao carregar dados legais:', err);
    }
  }, [authHeaders, canTermos, canPolitica, canCookies]);

  useEffect(() => { loadTab(activeTab); }, [activeTab, loadTab]);

  const salvarTermos = async () => {
    setIsSaving(true);
    try {
      const res = await fetch(`${API_BASE_URL}/admin/termos-uso`, { method: 'PUT', headers: authHeaders(), body: JSON.stringify({ conteudo: termosContent }) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (data.success) { setTermos(prev => prev ? { ...prev, versao: data.data.versao } : null); showFeedback('success', `Termos salvos! (Versão ${data.data.versao})`); loadedRef.current.delete('termos'); }
      else showFeedback('error', data.error || 'Erro ao salvar termos.');
    } catch (err) { showFeedback('error', err instanceof Error ? err.message : 'Erro de conexão.'); }
    finally { setIsSaving(false); }
  };

  const salvarPolitica = async () => {
    setIsSaving(true);
    try {
      const res = await fetch(`${API_BASE_URL}/admin/politica-privacidade`, { method: 'PUT', headers: authHeaders(), body: JSON.stringify({ conteudo: politicaContent }) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (data.success) { setPolitica(prev => prev ? { ...prev, versao: data.data.versao } : null); showFeedback('success', `Política salva! (Versão ${data.data.versao})`); loadedRef.current.delete('politica'); }
      else showFeedback('error', data.error || 'Erro ao salvar política.');
    } catch (err) { showFeedback('error', err instanceof Error ? err.message : 'Erro de conexão.'); }
    finally { setIsSaving(false); }
  };

  const salvarBannerConfig = async () => {
    setIsSaving(true);
    try {
      const res = await fetch(`${API_BASE_URL}/admin/cookie-banner-config`, {
        method: 'PUT', headers: authHeaders(),
        body: JSON.stringify({
          titulo: bannerConfig.titulo, texto: bannerConfig.texto,
          textoBotaoAceitar: bannerConfig.textoBotaoAceitar, textoBotaoRejeitar: bannerConfig.textoBotaoRejeitar,
          textoBotaoPersonalizar: bannerConfig.textoBotaoPersonalizar, textoDescricaoGerenciamento: bannerConfig.textoDescricaoGerenciamento,
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (data.success) showFeedback('success', 'Configuração salva!');
      else showFeedback('error', data.error || 'Erro ao salvar configuração.');
    } catch (err) { showFeedback('error', err instanceof Error ? err.message : 'Erro de conexão.'); }
    finally { setIsSaving(false); }
  };

  const reloadCategorias = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/admin/cookie-categorias`, { headers: authHeaders() });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (data.success) setCategorias(data.data);
    } catch (err) { console.error('Erro ao recarregar categorias:', err); }
  };

  const abrirFormCategoria = (cat?: CookieCategoria) => {
    if (cat) { setEditingCat(cat); setCatForm({ chave: cat.chave, nome: cat.nome, descricao: cat.descricao, ativo: cat.ativo, obrigatorio: cat.obrigatorio, ordem: cat.ordem }); }
    else { setEditingCat(null); setCatForm({ chave: '', nome: '', descricao: '', ativo: true, obrigatorio: false, ordem: categorias.length }); }
    setShowCatForm(true);
  };

  const salvarCategoria = async () => {
    if (!catForm.nome.trim() || !catForm.descricao.trim()) { showFeedback('error', 'Nome e descrição são obrigatórios.'); return; }
    if (!editingCat && !catForm.chave.trim()) { showFeedback('error', 'Chave é obrigatória.'); return; }
    setIsSaving(true);
    try {
      const url = editingCat ? `${API_BASE_URL}/admin/cookie-categorias/${editingCat.id}` : `${API_BASE_URL}/admin/cookie-categorias`;
      const method = editingCat ? 'PUT' : 'POST';
      const body = editingCat ? { nome: catForm.nome, descricao: catForm.descricao, ativo: catForm.ativo, obrigatorio: catForm.obrigatorio, ordem: catForm.ordem } : catForm;
      const res = await fetch(url, { method, headers: authHeaders(), body: JSON.stringify(body) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (data.success) {
        showFeedback('success', editingCat ? 'Categoria atualizada!' : 'Categoria criada!');
        setShowCatForm(false); setEditingCat(null);
        setCatForm({ chave: '', nome: '', descricao: '', ativo: true, obrigatorio: false, ordem: categorias.length });
        await reloadCategorias();
      } else showFeedback('error', data.error || 'Erro ao salvar categoria.');
    } catch (err) { showFeedback('error', err instanceof Error ? err.message : 'Erro de conexão.'); }
    finally { setIsSaving(false); }
  };

  const deletarCategoria = async (id: number) => {
    if (!window.confirm('Remover esta categoria?')) return;
    try {
      const res = await fetch(`${API_BASE_URL}/admin/cookie-categorias/${id}`, { method: 'DELETE', headers: authHeaders() });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (data.success) { showFeedback('success', 'Categoria removida.'); await reloadCategorias(); }
      else showFeedback('error', data.error || 'Não foi possível remover.');
    } catch (err) { showFeedback('error', err instanceof Error ? err.message : 'Erro de conexão.'); }
  };

  const availableTabs = [
    ...(canTermos ? [{ id: 'termos' as LegalTab, label: 'Termos de Uso', icon: FileText }] : []),
    ...(canPolitica ? [{ id: 'politica' as LegalTab, label: 'Política de Privacidade', icon: ShieldCheck }] : []),
    ...(canCookies ? [{ id: 'cookies' as LegalTab, label: 'Cookies', icon: Cookie }] : []),
  ];

  useEffect(() => {
    if (availableTabs.length > 0 && !availableTabs.find(t => t.id === activeTab)) {
      setActiveTab(availableTabs[0].id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (availableTabs.length === 0) {
    return (
      <div className="flex items-center justify-center py-16 text-gray-400">
        <Lock className="h-6 w-6 mr-2" />
        <span className="text-sm">Sem permissão para gerenciar conteúdo legal.</span>
      </div>
    );
  }

  const saveBtn = (onClick: () => void) => (
    <button onClick={onClick} disabled={isSaving}
      className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white text-sm font-semibold shadow-md disabled:opacity-60 transition-all"
    >
      {isSaving ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
      Salvar
    </button>
  );

  return (
    <div className="space-y-5">
      {/* Sub-tabs */}
      <div className="flex gap-2 flex-wrap">
        {availableTabs.map(tab => {
          const Icon = tab.icon;
          return (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl font-medium text-sm transition-all border ${
                activeTab === tab.id
                  ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white border-transparent shadow-md'
                  : 'bg-white text-gray-600 border-gray-200 hover:border-blue-300 hover:text-blue-600'
              }`}
            >
              <Icon className="h-4 w-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Feedback */}
      {saveMsg && (
        <div className={`flex items-center gap-2 px-4 py-3 rounded-xl text-sm font-medium border ${
          saveMsg.type === 'success'
            ? 'bg-green-50 text-green-700 border-green-200'
            : 'bg-red-50 text-red-700 border-red-200'
        }`}>
          {saveMsg.type === 'success' ? <Check className="h-4 w-4 flex-shrink-0" /> : <AlertTriangle className="h-4 w-4 flex-shrink-0" />}
          {saveMsg.text}
        </div>
      )}

      {/* ── Aba: Termos de Uso ── */}
      {activeTab === 'termos' && canTermos && (
        <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-bold text-gray-800 flex items-center gap-2">
                <FileText className="h-4 w-4 text-blue-600" /> Termos de Uso
              </h3>
              {termos && (
                <p className="text-xs text-gray-400 mt-0.5">
                  Versão {termos.versao}
                  {termos.updatedAt ? ` • ${new Date(termos.updatedAt).toLocaleDateString('pt-BR')}` : ''}
                </p>
              )}
            </div>
            {saveBtn(salvarTermos)}
          </div>
          <TipTapEditor content={termosContent} onChange={setTermosContent} />
        </div>
      )}

      {/* ── Aba: Política de Privacidade ── */}
      {activeTab === 'politica' && canPolitica && (
        <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-bold text-gray-800 flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-indigo-600" /> Política de Privacidade
              </h3>
              {politica && (
                <p className="text-xs text-gray-400 mt-0.5">
                  Versão {politica.versao}
                  {politica.updatedAt ? ` • ${new Date(politica.updatedAt).toLocaleDateString('pt-BR')}` : ''}
                </p>
              )}
            </div>
            {saveBtn(salvarPolitica)}
          </div>
          <TipTapEditor content={politicaContent} onChange={setPoliticaContent} />
        </div>
      )}

      {/* ── Aba: Cookies ── */}
      {activeTab === 'cookies' && canCookies && (
        <div className="space-y-5">
          {/* Banner Config */}
          <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-gray-800 flex items-center gap-2">
                <Cookie className="h-4 w-4 text-blue-600" /> Configuração do Banner
              </h3>
              {saveBtn(salvarBannerConfig)}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {([
                { label: 'Título do Banner', key: 'titulo', placeholder: 'Política de Cookies e Privacidade' },
                { label: 'Botão Aceitar', key: 'textoBotaoAceitar', placeholder: 'Aceitar Todos' },
                { label: 'Botão Rejeitar', key: 'textoBotaoRejeitar', placeholder: 'Rejeitar Todos' },
                { label: 'Botão Personalizar', key: 'textoBotaoPersonalizar', placeholder: 'Personalizar' },
              ] as { label: string; key: keyof BannerConfig; placeholder: string }[]).map(field => (
                <div key={field.key}>
                  <label className="block text-xs font-medium text-gray-600 mb-1">{field.label}</label>
                  <input type="text" value={bannerConfig[field.key] || ''} placeholder={field.placeholder}
                    onChange={e => setBannerConfig(prev => ({ ...prev, [field.key]: e.target.value }))}
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white text-gray-800 focus:outline-none focus:border-blue-400 transition-colors"
                  />
                </div>
              ))}
              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-gray-600 mb-1">Texto do Banner</label>
                <textarea rows={2} value={bannerConfig.texto || ''}
                  onChange={e => setBannerConfig(prev => ({ ...prev, texto: e.target.value }))}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white text-gray-800 focus:outline-none focus:border-blue-400 transition-colors resize-none"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-gray-600 mb-1">Descrição no Modal de Gerenciamento</label>
                <textarea rows={2} value={bannerConfig.textoDescricaoGerenciamento || ''}
                  onChange={e => setBannerConfig(prev => ({ ...prev, textoDescricaoGerenciamento: e.target.value }))}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white text-gray-800 focus:outline-none focus:border-blue-400 transition-colors resize-none"
                />
              </div>
            </div>
          </div>

          {/* Categorias */}
          <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-gray-800 text-sm">Categorias de Cookies</h3>
              <button onClick={() => abrirFormCategoria()}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-50 text-blue-700 border border-blue-200 text-xs font-medium hover:bg-blue-100 transition-colors"
              >
                <Plus className="h-3.5 w-3.5" /> Nova Categoria
              </button>
            </div>

            <div className="space-y-2">
              {categorias.map(cat => (
                <div key={cat.id} className="border border-gray-100 rounded-xl overflow-hidden">
                  <div className="flex items-center justify-between px-4 py-3 bg-gray-50/50">
                    <button onClick={() => setExpandedCat(expandedCat === cat.id ? null : cat.id)} className="flex items-center gap-2 flex-1 text-left">
                      {expandedCat === cat.id ? <ChevronUp className="h-4 w-4 text-gray-400" /> : <ChevronDown className="h-4 w-4 text-gray-400" />}
                      <span className="text-sm font-medium text-gray-800">{cat.nome}</span>
                      <span className="text-xs text-gray-400 font-mono">({cat.chave})</span>
                      {cat.obrigatorio && (
                        <span className="flex items-center gap-1 text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full">
                          <Lock className="h-3 w-3" /> Obrigatório
                        </span>
                      )}
                      {!cat.ativo && <span className="text-xs bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded-full">Inativo</span>}
                    </button>
                    <div className="flex gap-1.5 ml-3">
                      <button onClick={() => abrirFormCategoria(cat)} className="p-1.5 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors" title="Editar">
                        <Edit2 className="h-3.5 w-3.5" />
                      </button>
                      {!cat.obrigatorio && (
                        <button onClick={() => deletarCategoria(cat.id)} className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors" title="Remover">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                  {expandedCat === cat.id && (
                    <div className="px-4 pb-3 pt-2 text-xs text-gray-500 leading-relaxed">{cat.descricao}</div>
                  )}
                </div>
              ))}
            </div>

            {/* Formulário de Categoria */}
            {showCatForm && (
              <div className="mt-4 border border-blue-200 rounded-xl p-4 bg-blue-50/30">
                <h4 className="text-sm font-semibold text-gray-800 mb-3">{editingCat ? 'Editar Categoria' : 'Nova Categoria'}</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {!editingCat && (
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Chave <span className="text-red-500">*</span></label>
                      <input type="text" value={catForm.chave} placeholder="ex: analytics"
                        onChange={e => setCatForm(prev => ({ ...prev, chave: e.target.value }))}
                        className="w-full px-3 py-1.5 text-sm border border-gray-200 rounded-lg bg-white text-gray-800 focus:outline-none focus:border-blue-400 font-mono"
                      />
                    </div>
                  )}
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Nome <span className="text-red-500">*</span></label>
                    <input type="text" value={catForm.nome} placeholder="Nome exibido"
                      onChange={e => setCatForm(prev => ({ ...prev, nome: e.target.value }))}
                      className="w-full px-3 py-1.5 text-sm border border-gray-200 rounded-lg bg-white text-gray-800 focus:outline-none focus:border-blue-400"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-medium text-gray-600 mb-1">Descrição <span className="text-red-500">*</span></label>
                    <textarea rows={2} value={catForm.descricao}
                      onChange={e => setCatForm(prev => ({ ...prev, descricao: e.target.value }))}
                      className="w-full px-3 py-1.5 text-sm border border-gray-200 rounded-lg bg-white text-gray-800 focus:outline-none focus:border-blue-400 resize-none"
                    />
                  </div>
                  <div className="flex items-center gap-4">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" checked={catForm.ativo} onChange={e => setCatForm(prev => ({ ...prev, ativo: e.target.checked }))} className="rounded" />
                      <span className="text-xs text-gray-600">Ativo</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" checked={catForm.obrigatorio} onChange={e => setCatForm(prev => ({ ...prev, obrigatorio: e.target.checked }))} className="rounded" />
                      <span className="text-xs text-gray-600">Obrigatório</span>
                    </label>
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs text-gray-600">Ordem:</span>
                      <input type="number" value={catForm.ordem}
                        onChange={e => setCatForm(prev => ({ ...prev, ordem: parseInt(e.target.value) || 0 }))}
                        className="w-16 px-2 py-1 text-xs border border-gray-200 rounded-lg bg-white text-gray-800 focus:outline-none focus:border-blue-400"
                      />
                    </div>
                  </div>
                </div>
                <div className="flex gap-2 mt-3 justify-end">
                  <button
                    onClick={() => { setShowCatForm(false); setEditingCat(null); setCatForm({ chave: '', nome: '', descricao: '', ativo: true, obrigatorio: false, ordem: categorias.length }); }}
                    className="px-3 py-1.5 text-xs rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50"
                  >
                    <X className="h-3.5 w-3.5 inline mr-1" /> Cancelar
                  </button>
                  <button onClick={salvarCategoria} disabled={isSaving}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-semibold disabled:opacity-60"
                  >
                    {isSaving ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                    Salvar
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default LegalManagement;
