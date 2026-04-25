import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  BookOpen, Plus, Trash2, Edit2, ChevronRight, ChevronDown,
  FileText, Save, X, Eye, Code2, GripVertical, AlertTriangle
} from 'lucide-react';
const API_BASE_URL =
  typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
    ? 'http://localhost:9001/api'
    : ((import.meta as any).env?.VITE_API_URL || '/api');
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import { marked, Renderer, use as markedUse } from 'marked';

interface DocPage {
  id: string;
  sectionId: string;
  title: string;
  content: string;
  order: number;
  updatedAt: string;
}

interface DocSection {
  id: string;
  title: string;
  order: number;
  pages: DocPage[];
}

declare global {
  interface Window {
    mermaid?: {
      initialize: (config: object) => void;
      run: (opts?: object) => Promise<void>;
      render: (id: string, text: string) => Promise<{ svg: string }>;
    };
  }
}

// Renderer com suporte a Mermaid (mesmo da Documentation.tsx)
const adminRenderer = new Renderer();
adminRenderer.code = function ({ text, lang }: { text: string; lang?: string }) {
  if (lang === 'mermaid') {
    return `<div class="mermaid not-rendered-admin">${text}</div>`;
  }
  const escaped = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return `<pre class="admin-code-block"><code class="language-${lang || ''}">${escaped}</code></pre>`;
};
markedUse({ renderer: adminRenderer });

function loadMermaid(): Promise<void> {
  return new Promise((resolve) => {
    if (window.mermaid) { resolve(); return; }
    const existing = document.querySelector('script[data-mermaid]');
    if (existing) { existing.addEventListener('load', () => resolve()); return; }
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.min.js';
    script.setAttribute('data-mermaid', 'true');
    script.onload = () => {
      window.mermaid?.initialize({ startOnLoad: false, theme: 'default' });
      resolve();
    };
    document.head.appendChild(script);
  });
}

async function runMermaidIn(container: HTMLElement, isDark: boolean) {
  await loadMermaid();
  window.mermaid?.initialize({ startOnLoad: false, theme: isDark ? 'dark' : 'default' });

  const divs = Array.from(container.querySelectorAll<HTMLElement>('.mermaid.not-rendered-admin'));
  if (divs.length === 0) return;

  divs.forEach(d => d.classList.remove('not-rendered-admin'));

  try {
    await window.mermaid?.run({ nodes: divs });
  } catch { /* ignora diagrama inválido */ }
}

const DocumentationManagement: React.FC = () => {
  const { token } = useAuth();
  const { isDark } = useTheme();
  const [sections, setSections] = useState<DocSection[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set());
  const [selectedPage, setSelectedPage] = useState<DocPage | null>(null);
  const [editContent, setEditContent] = useState('');
  const [editTitle, setEditTitle] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const [previewMode, setPreviewMode] = useState<'split' | 'editor' | 'preview'>('split');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const previewRef = useRef<HTMLDivElement>(null);

  // Modais
  const [showNewSection, setShowNewSection] = useState(false);
  const [newSectionTitle, setNewSectionTitle] = useState('');
  const [showNewPage, setShowNewPage] = useState<string | null>(null); // sectionId
  const [newPageTitle, setNewPageTitle] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState<{
    type: 'section' | 'page';
    id: string;
    title: string;
  } | null>(null);
  const [editingSection, setEditingSection] = useState<{ id: string; title: string } | null>(null);

  const headers = useCallback(
    () => ({ Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }),
    [token]
  );

  const loadSections = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/documentation`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const result = await res.json();
      if (result.success) {
        setSections(result.data);
        if (result.data.length > 0) {
          setExpandedSections(new Set([result.data[0].id]));
        }
      }
    } catch {
      // silencioso
    } finally {
      setIsLoading(false);
    }
  }, [token]);

  useEffect(() => { loadSections(); }, [loadSections]);

  // Inclui o tema no HTML para forçar React a resetar o DOM quando o tema muda
  const renderedHtml = editContent
    ? `<!--${isDark ? 'dark' : 'light'}-->${marked(editContent) as string}`
    : '';
  useEffect(() => {
    if (previewRef.current && renderedHtml) {
      runMermaidIn(previewRef.current, isDark);
    }
  }, [renderedHtml]);

  const selectPage = (page: DocPage) => {
    if (isDirty && selectedPage) {
      if (!window.confirm('Você tem alterações não salvas. Deseja descartá-las?')) return;
    }
    setSelectedPage(page);
    setEditContent(page.content);
    setEditTitle(page.title);
    setIsDirty(false);
    setSidebarOpen(false); // fecha drawer no mobile ao selecionar página
  };

  const handleContentChange = (val: string) => {
    setEditContent(val);
    setIsDirty(true);
  };

  const handleTitleChange = (val: string) => {
    setEditTitle(val);
    setIsDirty(true);
  };

  const savePage = async () => {
    if (!selectedPage) return;
    setIsSaving(true);
    try {
      const res = await fetch(`${API_BASE_URL}/admin/documentation/pages/${selectedPage.id}`, {
        method: 'PUT',
        headers: headers(),
        body: JSON.stringify({ title: editTitle.trim(), content: editContent }),
      });
      const result = await res.json();
      if (result.success) {
        setIsDirty(false);
        setSections(prev =>
          prev.map(s => ({
            ...s,
            pages: s.pages.map(p =>
              p.id === selectedPage.id
                ? { ...p, title: editTitle.trim(), content: editContent, updatedAt: new Date().toISOString() }
                : p
            ),
          }))
        );
        setSelectedPage(prev => prev ? { ...prev, title: editTitle.trim(), content: editContent } : prev);
      }
    } finally {
      setIsSaving(false);
    }
  };

  // Criar seção
  const createSection = async () => {
    if (!newSectionTitle.trim()) return;
    const res = await fetch(`${API_BASE_URL}/admin/documentation/sections`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ title: newSectionTitle.trim() }),
    });
    const result = await res.json();
    if (result.success) {
      setSections(prev => [...prev, { ...result.data, pages: [] }]);
      setExpandedSections(prev => new Set([...prev, result.data.id]));
    }
    setNewSectionTitle('');
    setShowNewSection(false);
  };

  // Atualizar título de seção
  const updateSectionTitle = async () => {
    if (!editingSection || !editingSection.title.trim()) return;
    const res = await fetch(`${API_BASE_URL}/admin/documentation/sections/${editingSection.id}`, {
      method: 'PUT',
      headers: headers(),
      body: JSON.stringify({ title: editingSection.title.trim() }),
    });
    const result = await res.json();
    if (result.success) {
      setSections(prev =>
        prev.map(s => s.id === editingSection.id ? { ...s, title: editingSection.title.trim() } : s)
      );
    }
    setEditingSection(null);
  };

  // Deletar seção
  const deleteSection = async (id: string) => {
    const res = await fetch(`${API_BASE_URL}/admin/documentation/sections/${id}`, {
      method: 'DELETE',
      headers: headers(),
    });
    const result = await res.json();
    if (result.success) {
      setSections(prev => prev.filter(s => s.id !== id));
      if (selectedPage && sections.find(s => s.id === id)?.pages.some(p => p.id === selectedPage.id)) {
        setSelectedPage(null);
        setIsDirty(false);
      }
    }
    setDeleteConfirm(null);
  };

  // Criar página
  const createPage = async (sectionId: string) => {
    if (!newPageTitle.trim()) return;
    const res = await fetch(`${API_BASE_URL}/admin/documentation/sections/${sectionId}/pages`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ title: newPageTitle.trim(), content: '' }),
    });
    const result = await res.json();
    if (result.success) {
      const newPage: DocPage = result.data;
      setSections(prev =>
        prev.map(s => s.id === sectionId ? { ...s, pages: [...s.pages, newPage] } : s)
      );
      selectPage(newPage);
    }
    setNewPageTitle('');
    setShowNewPage(null);
  };

  // Deletar página
  const deletePage = async (id: string) => {
    const res = await fetch(`${API_BASE_URL}/admin/documentation/pages/${id}`, {
      method: 'DELETE',
      headers: headers(),
    });
    const result = await res.json();
    if (result.success) {
      setSections(prev =>
        prev.map(s => ({ ...s, pages: s.pages.filter(p => p.id !== id) }))
      );
      if (selectedPage?.id === id) {
        setSelectedPage(null);
        setIsDirty(false);
      }
    }
    setDeleteConfirm(null);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-400 text-sm">Carregando...</div>
      </div>
    );
  }

  // Conteúdo reutilizável da sidebar (desktop estático + mobile drawer)
  const sidebarContent = (
    <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm flex flex-col overflow-hidden h-full">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-gray-700 flex-shrink-0">
        <span className="text-sm font-semibold text-gray-700 dark:text-gray-200">Estrutura</span>
        <button
          onClick={() => setShowNewSection(true)}
          className="p-1.5 bg-amber-50 hover:bg-amber-100 text-amber-600 rounded-lg transition-colors"
          title="Nova seção"
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>

      <nav className="flex-1 overflow-y-auto">
        {sections.length === 0 ? (
          <div className="p-4 text-center text-sm text-gray-400">
            <FileText className="h-6 w-6 mx-auto mb-1 text-gray-300" />
            Nenhuma seção criada
          </div>
        ) : (
          sections.map(section => {
            const isExpanded = expandedSections.has(section.id);
            return (
              <div key={section.id}>
                <div className="flex items-center group hover:bg-amber-50 dark:hover:bg-gray-700 transition-colors">
                  <button
                    onClick={() =>
                      setExpandedSections(prev => {
                        const n = new Set(prev);
                        if (n.has(section.id)) n.delete(section.id); else n.add(section.id);
                        return n;
                      })
                    }
                    className="flex-1 flex items-center gap-1.5 px-3 py-2.5 text-sm font-semibold text-gray-700 dark:text-gray-200 text-left"
                  >
                    {isExpanded
                      ? <ChevronDown className="h-3.5 w-3.5 text-gray-400 flex-shrink-0" />
                      : <ChevronRight className="h-3.5 w-3.5 text-gray-400 flex-shrink-0" />}
                    <span className="truncate">{section.title}</span>
                  </button>
                  <div className="flex items-center gap-0.5 pr-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onClick={() => setShowNewPage(section.id)} className="p-1 text-amber-500 hover:bg-amber-100 rounded" title="Nova página">
                      <Plus className="h-3.5 w-3.5" />
                    </button>
                    <button onClick={() => setEditingSection({ id: section.id, title: section.title })} className="p-1 text-gray-400 hover:text-amber-600 hover:bg-amber-50 rounded" title="Renomear seção">
                      <Edit2 className="h-3.5 w-3.5" />
                    </button>
                    <button onClick={() => setDeleteConfirm({ type: 'section', id: section.id, title: section.title })} className="p-1 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded" title="Deletar seção">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>

                {isExpanded && (
                  <div className="bg-gray-50 dark:bg-gray-900/50 border-l-2 border-gray-100 dark:border-gray-700 ml-3">
                    {section.pages.map(page => (
                      <div
                        key={page.id}
                        className={`flex items-center group transition-colors ${
                          selectedPage?.id === page.id
                            ? 'bg-amber-100 dark:bg-amber-900/30 border-l-2 border-amber-500 -ml-0.5'
                            : 'hover:bg-amber-50 dark:hover:bg-gray-700'
                        }`}
                      >
                        <button onClick={() => selectPage(page)} className="flex-1 flex items-center gap-2 pl-3 pr-2 py-2 text-sm text-left truncate">
                          <FileText className={`h-3.5 w-3.5 flex-shrink-0 ${selectedPage?.id === page.id ? 'text-amber-600' : 'text-gray-400'}`} />
                          <span className={`truncate ${selectedPage?.id === page.id ? 'text-amber-700 dark:text-amber-300 font-medium' : 'text-gray-600 dark:text-gray-400'}`}>
                            {page.title}
                          </span>
                        </button>
                        <button onClick={() => setDeleteConfirm({ type: 'page', id: page.id, title: page.title })} className="pr-2 p-1 opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-500 rounded transition-opacity" title="Deletar página">
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                    ))}
                    {section.pages.length === 0 && (
                      <p className="pl-4 py-2 text-xs text-gray-400 italic">Sem páginas</p>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </nav>
    </div>
  );

  return (
    <div className="flex flex-col lg:flex-row gap-4 h-[calc(100vh-300px)] min-h-[500px]">

      {/* ── Botão flutuante sticky — mobile only ── */}
      <div className="lg:hidden sticky top-[185px] z-30 pointer-events-none flex-shrink-0">
        <button
          onClick={() => setSidebarOpen(v => !v)}
          className="pointer-events-auto flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-amber-500 to-orange-400 text-white rounded-full shadow-lg hover:shadow-xl active:scale-95 transition-all duration-200 text-sm font-semibold"
        >
          {sidebarOpen ? <X className="h-4 w-4" /> : <GripVertical className="h-4 w-4" />}
          <span>{sidebarOpen ? 'Fechar' : 'Estrutura'}</span>
        </button>
      </div>

      {/* ── MOBILE: drawer deslizante da esquerda ── */}
      <>
        <div
          onClick={() => setSidebarOpen(false)}
          className={`lg:hidden fixed inset-0 z-20 bg-black/50 transition-opacity duration-300 ${sidebarOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}
        />
        <div className={`lg:hidden fixed top-0 left-0 h-full w-[280px] z-30 flex flex-col transition-all duration-300 ease-in-out ${sidebarOpen ? 'translate-x-0 opacity-100' : '-translate-x-full opacity-0 pointer-events-none'}`}>
          <div className="flex items-center justify-between px-4 py-3 bg-gradient-to-r from-amber-500 to-orange-400 flex-shrink-0">
            <span className="text-white font-semibold text-sm">Estrutura</span>
            <button onClick={() => setSidebarOpen(false)} className="text-white/80 hover:text-white p-1 rounded-lg hover:bg-white/20 transition-colors">
              <X className="h-5 w-5" />
            </button>
          </div>
          <div className="flex-1 overflow-hidden">
            {sidebarContent}
          </div>
        </div>
      </>

      {/* ── DESKTOP: sidebar estática ── */}
      <aside className="hidden lg:flex w-64 flex-shrink-0 flex-col gap-2 h-full">
        {sidebarContent}
      </aside>

      {/* Editor + Preview */}
      <div className="flex-1 flex flex-col min-w-0 min-h-0">
        {selectedPage ? (
          <>
            {/* Toolbar */}
            <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm px-3 sm:px-4 py-2.5 mb-3 flex flex-wrap items-center gap-2 justify-between flex-shrink-0">
              <div className="flex items-center gap-2 min-w-0 flex-1">
                <input
                  type="text"
                  value={editTitle}
                  onChange={e => handleTitleChange(e.target.value)}
                  className="text-sm sm:text-base font-semibold text-gray-800 dark:text-gray-100 border-none outline-none bg-transparent truncate min-w-0 focus:ring-0"
                  placeholder="Título da página"
                />
                {isDirty && <span className="text-xs text-amber-500 flex-shrink-0">● não salvo</span>}
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                {/* Toggle view — no mobile esconde Split */}
                <div className="flex bg-gray-100 dark:bg-gray-700 rounded-xl p-0.5 gap-0.5">
                  <button
                    onClick={() => setPreviewMode('editor')}
                    className={`px-2 sm:px-3 py-1.5 rounded-lg text-xs font-medium transition-colors flex items-center gap-1 ${previewMode === 'editor' ? 'bg-white dark:bg-gray-600 text-amber-700 dark:text-amber-300 shadow-sm' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700'}`}
                  >
                    <Code2 className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">Editor</span>
                  </button>
                  <button
                    onClick={() => setPreviewMode('split')}
                    className={`hidden lg:flex px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${previewMode === 'split' ? 'bg-white dark:bg-gray-600 text-amber-700 dark:text-amber-300 shadow-sm' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700'}`}
                  >
                    Split
                  </button>
                  <button
                    onClick={() => setPreviewMode('preview')}
                    className={`px-2 sm:px-3 py-1.5 rounded-lg text-xs font-medium transition-colors flex items-center gap-1 ${previewMode === 'preview' ? 'bg-white dark:bg-gray-600 text-amber-700 dark:text-amber-300 shadow-sm' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700'}`}
                  >
                    <Eye className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">Preview</span>
                  </button>
                </div>
                <button
                  onClick={savePage}
                  disabled={!isDirty || isSaving}
                  className={`flex items-center gap-1.5 px-3 sm:px-4 py-1.5 rounded-xl text-sm font-medium transition-colors flex-shrink-0 ${isDirty && !isSaving ? 'bg-gradient-to-r from-amber-400 to-orange-400 text-white shadow-sm hover:shadow-md' : 'bg-gray-100 text-gray-400 cursor-not-allowed'}`}
                >
                  <Save className="h-3.5 w-3.5" />
                  <span>{isSaving ? 'Salvando...' : 'Salvar'}</span>
                </button>
              </div>
            </div>

            {/* Área de edição — split no desktop, alternado no mobile */}
            <div className="flex-1 flex gap-3 min-h-0">
              {/* Editor */}
              {(previewMode === 'editor' || previewMode === 'split') && (
                <div className={`flex flex-col ${previewMode === 'split' ? 'w-1/2' : 'flex-1'} bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden`}>
                  <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-700 flex-shrink-0">
                    <Code2 className="h-3.5 w-3.5 text-gray-400" />
                    <span className="text-xs text-gray-500 dark:text-gray-300 font-medium">Markdown + Mermaid</span>
                  </div>
                  <textarea
                    value={editContent}
                    onChange={e => handleContentChange(e.target.value)}
                    className="flex-1 p-4 text-sm font-mono text-gray-700 dark:text-gray-200 bg-white dark:!bg-gray-800 outline-none resize-none leading-relaxed"
                    placeholder={`# Título\n\nDigite o conteúdo em Markdown...\n\n\`\`\`mermaid\ngraph TD\n  A --> B\n\`\`\``}
                    spellCheck={false}
                  />
                </div>
              )}

              {/* Preview */}
              {(previewMode === 'preview' || previewMode === 'split') && (
                <div className={`flex flex-col ${previewMode === 'split' ? 'w-1/2' : 'flex-1'} bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden`}>
                  <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-700 flex-shrink-0">
                    <Eye className="h-3.5 w-3.5 text-gray-400" />
                    <span className="text-xs text-gray-500 dark:text-gray-300 font-medium">Preview</span>
                  </div>
                  <div
                    ref={previewRef}
                    className="flex-1 overflow-y-auto p-4 doc-content"
                    dangerouslySetInnerHTML={{ __html: renderedHtml || '<p class="text-gray-400 text-sm italic">Nenhum conteúdo para visualizar.</p>' }}
                  />
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="flex-1 bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm flex items-center justify-center">
            <div className="text-center px-6">
              <div className="flex justify-center mb-3">
                <div className="bg-amber-50 dark:bg-amber-900/30 rounded-full p-4">
                  <BookOpen className="h-10 w-10 text-amber-300" />
                </div>
              </div>
              <p className="text-gray-400 text-sm">Selecione uma página para editar</p>
              <p className="text-gray-300 text-xs mt-1">
                ou abra a <strong>Estrutura</strong> e crie uma nova seção
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Modal: Nova Seção */}
      {showNewSection && (
        <div
          className="fixed inset-0 bg-amber-900/30 backdrop-blur-sm flex items-center justify-center z-50"
          onClick={e => e.target === e.currentTarget && setShowNewSection(false)}
        >
          <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 w-full max-w-sm shadow-2xl">
            <h3 className="text-base font-bold text-gray-800 mb-4">Nova Seção</h3>
            <input
              autoFocus
              type="text"
              value={newSectionTitle}
              onChange={e => setNewSectionTitle(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && createSection()}
              placeholder="Nome da seção"
              className="w-full px-4 py-2.5 border border-gray-200 dark:border-gray-600 rounded-xl text-sm outline-none focus:ring-2 focus:ring-amber-500 focus:border-amber-500 mb-4 bg-white dark:!bg-gray-700 dark:text-gray-100 dark:placeholder-gray-400"
            />
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => { setShowNewSection(false); setNewSectionTitle(''); }}
                className="px-4 py-2 text-sm text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-xl"
              >
                Cancelar
              </button>
              <button
                onClick={createSection}
                disabled={!newSectionTitle.trim()}
                className="px-4 py-2 text-sm text-white bg-gradient-to-r from-amber-400 to-orange-400 rounded-xl disabled:opacity-50"
              >
                Criar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Nova Página */}
      {showNewPage && (
        <div
          className="fixed inset-0 bg-amber-900/30 backdrop-blur-sm flex items-center justify-center z-50"
          onClick={e => e.target === e.currentTarget && setShowNewPage(null)}
        >
          <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 w-full max-w-sm shadow-2xl">
            <h3 className="text-base font-bold text-gray-800 mb-4">Nova Página</h3>
            <input
              autoFocus
              type="text"
              value={newPageTitle}
              onChange={e => setNewPageTitle(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && createPage(showNewPage)}
              placeholder="Título da página"
              className="w-full px-4 py-2.5 border border-gray-200 dark:border-gray-600 rounded-xl text-sm outline-none focus:ring-2 focus:ring-amber-500 focus:border-amber-500 mb-4 bg-white dark:!bg-gray-700 dark:text-gray-100 dark:placeholder-gray-400"
            />
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => { setShowNewPage(null); setNewPageTitle(''); }}
                className="px-4 py-2 text-sm text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-xl"
              >
                Cancelar
              </button>
              <button
                onClick={() => createPage(showNewPage)}
                disabled={!newPageTitle.trim()}
                className="px-4 py-2 text-sm text-white bg-gradient-to-r from-amber-400 to-orange-400 rounded-xl disabled:opacity-50"
              >
                Criar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Renomear Seção */}
      {editingSection && (
        <div
          className="fixed inset-0 bg-amber-900/30 backdrop-blur-sm flex items-center justify-center z-50"
          onClick={e => e.target === e.currentTarget && setEditingSection(null)}
        >
          <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 w-full max-w-sm shadow-2xl">
            <h3 className="text-base font-bold text-gray-800 mb-4">Renomear Seção</h3>
            <input
              autoFocus
              type="text"
              value={editingSection.title}
              onChange={e => setEditingSection({ ...editingSection, title: e.target.value })}
              onKeyDown={e => e.key === 'Enter' && updateSectionTitle()}
              className="w-full px-4 py-2.5 border border-gray-200 dark:border-gray-600 rounded-xl text-sm outline-none focus:ring-2 focus:ring-amber-500 focus:border-amber-500 mb-4 bg-white dark:!bg-gray-700 dark:text-gray-100"
            />
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setEditingSection(null)}
                className="px-4 py-2 text-sm text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-xl"
              >
                Cancelar
              </button>
              <button
                onClick={updateSectionTitle}
                disabled={!editingSection.title.trim()}
                className="px-4 py-2 text-sm text-white bg-gradient-to-r from-amber-400 to-orange-400 rounded-xl disabled:opacity-50"
              >
                Salvar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Confirmar Delete */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-amber-900/30 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 w-full max-w-sm shadow-2xl">
            <div className="flex items-center gap-3 mb-4">
              <div className="bg-red-100 rounded-full p-2">
                <AlertTriangle className="h-5 w-5 text-red-500" />
              </div>
              <h3 className="text-base font-bold text-gray-800">
                Deletar {deleteConfirm.type === 'section' ? 'Seção' : 'Página'}
              </h3>
            </div>
            <p className="text-sm text-gray-600 mb-1">
              Tem certeza que deseja deletar{' '}
              <strong>"{deleteConfirm.title}"</strong>?
            </p>
            {deleteConfirm.type === 'section' && (
              <p className="text-xs text-red-500 mb-4">
                Todas as páginas desta seção também serão deletadas.
              </p>
            )}
            <div className="flex gap-2 justify-end mt-4">
              <button
                onClick={() => setDeleteConfirm(null)}
                className="px-4 py-2 text-sm text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-xl"
              >
                Cancelar
              </button>
              <button
                onClick={() =>
                  deleteConfirm.type === 'section'
                    ? deleteSection(deleteConfirm.id)
                    : deletePage(deleteConfirm.id)
                }
                className="px-4 py-2 text-sm text-white bg-red-500 hover:bg-red-600 rounded-xl"
              >
                Deletar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Estilos do conteúdo */}
      <style>{`
        .doc-content h1 { font-size: 1.75rem; font-weight: 700; color: #1f2937; margin: 1.5rem 0 0.75rem; }
        .doc-content h2 { font-size: 1.375rem; font-weight: 700; color: #374151; margin: 1.5rem 0 0.5rem; padding-bottom: 0.375rem; border-bottom: 1px solid #f3f4f6; }
        .doc-content h3 { font-size: 1.125rem; font-weight: 600; color: #4b5563; margin: 1.25rem 0 0.375rem; }
        .doc-content h4 { font-size: 1rem; font-weight: 600; color: #6b7280; margin: 1rem 0 0.25rem; }
        .doc-content p { color: #374151; line-height: 1.75; margin: 0.75rem 0; font-size: 0.875rem; }
        .doc-content ul { list-style: disc; padding-left: 1.5rem; margin: 0.75rem 0; }
        .doc-content ol { list-style: decimal; padding-left: 1.5rem; margin: 0.75rem 0; }
        .doc-content li { color: #374151; line-height: 1.75; margin: 0.25rem 0; font-size: 0.875rem; }
        .doc-content a { color: #d97706; text-decoration: underline; }
        .doc-content strong { font-weight: 700; color: #1f2937; }
        .doc-content em { font-style: italic; }
        .doc-content blockquote { border-left: 3px solid #f59e0b; padding: 0.5rem 1rem; background: #fffbeb; margin: 1rem 0; border-radius: 0 0.5rem 0.5rem 0; color: #78350f; }
        .doc-content code:not(pre code) { background: #f3f4f6; padding: 0.125rem 0.375rem; border-radius: 0.25rem; font-size: 0.85em; color: #b45309; font-family: monospace; }
        .admin-code-block { background: #1f2937; border-radius: 0.75rem; padding: 1.25rem; overflow-x: auto; margin: 1rem 0; }
        .admin-code-block code { color: #f9fafb; font-family: monospace; font-size: 0.875rem; }
        .doc-content table { width: 100%; border-collapse: collapse; margin: 1rem 0; font-size: 0.875rem; }
        .doc-content th { background: #fffbeb; color: #92400e; font-weight: 600; padding: 0.5rem 0.75rem; border: 1px solid #fde68a; text-align: left; }
        .doc-content td { padding: 0.4rem 0.75rem; border: 1px solid #e5e7eb; color: #374151; }
        .doc-content tr:nth-child(even) td { background: #f9fafb; }
        .doc-content hr { border: none; border-top: 1px solid #e5e7eb; margin: 1.5rem 0; }
        .mermaid { display: flex; justify-content: center; margin: 1rem 0; }
      `}</style>
    </div>
  );
};

export default DocumentationManagement;
