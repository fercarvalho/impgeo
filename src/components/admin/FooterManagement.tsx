import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import {
  Plus, Edit2, Trash2, Save, X, AlertTriangle, GripVertical,
  Layout, Link2, Link2Off, Building2, Copyright,
  AlignLeft, AlignCenter, AlignRight, Bold, FileText, Rows, Eye, EyeOff, Tag
} from 'lucide-react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
  horizontalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useAuth } from '../../contexts/AuthContext';

const API_BASE_URL =
  typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
    ? 'http://localhost:9001/api'
    : ((import.meta as any).env?.VITE_API_URL || '/api');

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface RodapeLink {
  id: string;
  colunaId: string;
  texto: string;
  link: string;
  ehLink: boolean;
  ordem: number;
}

interface RodapeColuna {
  id: string;
  titulo: string;
  ordem: number;
  links: RodapeLink[];
}

interface RodapeConfig {
  empresa_nome: string;
  empresa_tagline: string;
  empresa_descricao: string;
  empresa_autor: string;
  empresa_logo: string;
  info_texto: string;
  info_alinhamento: 'left' | 'center' | 'right';
  copyright: string;
  versao_sistema: string;
  notas_versao: string;
}

interface BottomLink {
  id: string;
  texto: string;
  link: string;
  ativo: boolean;
  ordem: number;
}

type FooterTab = 'colunas' | 'empresa' | 'info' | 'inferior' | 'base' | 'versao';

// ─── Editor Rich Text (TipTap) ────────────────────────────────────────────────

const TipTapEditor: React.FC<{ content: string; onChange: (html: string) => void }> = ({ content, onChange }) => {
  const editor = useEditor({
    extensions: [StarterKit],
    content,
    onUpdate: ({ editor }) => onChange(editor.getHTML()),
    editorProps: {
      attributes: {
        class: 'min-h-[280px] px-4 py-3 text-sm text-gray-800 focus:outline-none leading-relaxed',
      },
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
        active
          ? 'bg-blue-100 text-blue-700'
          : 'text-gray-500 hover:bg-gray-100'
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

// ─── Componente sortable de link ──────────────────────────────────────────────

interface SortableLinkItemProps {
  link: RodapeLink;
  onEdit: (link: RodapeLink) => void;
  onDelete: (id: string) => void;
}

const SortableLinkItem: React.FC<SortableLinkItemProps> = ({ link, onEdit, onDelete }) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: link.id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-2 bg-white border border-gray-200 rounded-lg px-3 py-2 group"
    >
      <button {...attributes} {...listeners} className="cursor-grab text-gray-400 hover:text-gray-600 flex-shrink-0">
        <GripVertical className="h-4 w-4" />
      </button>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-800 truncate">{link.texto}</p>
        {link.ehLink && link.link && (
          <p className="text-xs text-gray-400 truncate">{link.link}</p>
        )}
      </div>
      {link.ehLink ? (
        <Link2 className="h-3.5 w-3.5 text-blue-500 flex-shrink-0" />
      ) : (
        <Link2Off className="h-3.5 w-3.5 text-gray-400 flex-shrink-0" />
      )}
      <button
        onClick={() => onEdit(link)}
        className="text-gray-400 hover:text-blue-600 flex-shrink-0 transition-colors"
      >
        <Edit2 className="h-3.5 w-3.5" />
      </button>
      <button
        onClick={() => onDelete(link.id)}
        className="text-gray-400 hover:text-red-500 flex-shrink-0 transition-colors"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  );
};

// ─── Componente sortable de coluna ────────────────────────────────────────────

interface SortableColunaProps {
  coluna: RodapeColuna;
  onRenameColuna: (id: string, novoTitulo: string) => void;
  onDeleteColuna: (id: string) => void;
  onAddLink: (colunaId: string) => void;
  onEditLink: (link: RodapeLink) => void;
  onDeleteLink: (id: string) => void;
  onReorderLinks: (colunaId: string, newLinks: RodapeLink[]) => void;
}

const SortableColuna: React.FC<SortableColunaProps> = ({
  coluna, onRenameColuna, onDeleteColuna, onAddLink, onEditLink, onDeleteLink, onReorderLinks
}) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: coluna.id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 };
  const [titulo, setTitulo] = useState(coluna.titulo);
  const [editandoTitulo, setEditandoTitulo] = useState(false);

  const linkSensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleDragEndLinks = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIdx = coluna.links.findIndex(l => l.id === active.id);
    const newIdx = coluna.links.findIndex(l => l.id === over.id);
    if (oldIdx === -1 || newIdx === -1) return;
    const newLinks = arrayMove(coluna.links, oldIdx, newIdx);
    onReorderLinks(coluna.id, newLinks);
  };

  const confirmarRename = () => {
    if (titulo.trim() && titulo.trim() !== coluna.titulo) {
      onRenameColuna(coluna.id, titulo.trim());
    } else {
      setTitulo(coluna.titulo);
    }
    setEditandoTitulo(false);
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="bg-gray-50 border border-gray-200 rounded-xl p-4 min-w-[220px] max-w-[280px] flex-shrink-0"
    >
      {/* Header da coluna */}
      <div className="flex items-center gap-2 mb-3">
        <button {...attributes} {...listeners} className="cursor-grab text-gray-400 hover:text-gray-600">
          <GripVertical className="h-4 w-4" />
        </button>
        {editandoTitulo ? (
          <div className="flex items-center gap-1 flex-1">
            <input
              type="text"
              value={titulo}
              onChange={e => setTitulo(e.target.value)}
              onBlur={confirmarRename}
              onKeyDown={e => { if (e.key === 'Enter') confirmarRename(); if (e.key === 'Escape') { setTitulo(coluna.titulo); setEditandoTitulo(false); } }}
              autoFocus
              className="flex-1 text-sm font-semibold border-b border-blue-400 bg-transparent outline-none text-gray-800 py-0.5"
            />
          </div>
        ) : (
          <span
            className="flex-1 text-sm font-semibold text-gray-800 cursor-pointer hover:text-blue-600 truncate"
            onClick={() => setEditandoTitulo(true)}
            title="Clique para renomear"
          >
            {coluna.titulo}
          </span>
        )}
        <button
          onClick={() => onDeleteColuna(coluna.id)}
          className="text-gray-400 hover:text-red-500 transition-colors flex-shrink-0"
          title="Excluir coluna"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Links da coluna */}
      <DndContext sensors={linkSensors} collisionDetection={closestCenter} onDragEnd={handleDragEndLinks}>
        <SortableContext items={coluna.links.map(l => l.id)} strategy={verticalListSortingStrategy}>
          <div className="space-y-1.5 min-h-[40px]">
            {coluna.links.length === 0 && (
              <p className="text-xs text-gray-400 text-center py-2 italic">Sem links ainda</p>
            )}
            {coluna.links.map(link => (
              <SortableLinkItem
                key={link.id}
                link={link}
                onEdit={onEditLink}
                onDelete={onDeleteLink}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>

      {/* Botão adicionar link */}
      <button
        onClick={() => onAddLink(coluna.id)}
        className="mt-2 w-full flex items-center justify-center gap-1 text-xs text-blue-600 border border-dashed border-blue-300 rounded-lg py-1.5 hover:bg-blue-50 transition-colors"
      >
        <Plus className="h-3.5 w-3.5" />
        Adicionar link
      </button>
    </div>
  );
};

// ─── Componente sortable de bottom link ──────────────────────────────────────

interface SortableBottomLinkItemProps {
  link: BottomLink;
  onEdit: (link: BottomLink) => void;
  onDelete: (link: BottomLink) => void;
  onToggleAtivo: (link: BottomLink) => void;
}

const SortableBottomLinkItem: React.FC<SortableBottomLinkItemProps> = ({ link, onEdit, onDelete, onToggleAtivo }) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: link.id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-center gap-3 border rounded-xl px-4 py-3 transition-colors ${
        link.ativo
          ? 'bg-white border-gray-200'
          : 'bg-gray-50 border-gray-200 opacity-60'
      }`}
    >
      <button {...attributes} {...listeners} className="cursor-grab text-gray-400 hover:text-gray-600 flex-shrink-0">
        <GripVertical className="h-4 w-4" />
      </button>

      {/* Status badge */}
      <span className={`flex-shrink-0 text-xs font-semibold px-2 py-0.5 rounded-full ${
        link.ativo
          ? 'bg-green-100 text-green-700'
          : 'bg-gray-100 text-gray-500'
      }`}>
        {link.ativo ? 'Ativo' : 'Inativo'}
      </span>

      {/* Texto e link */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-800 truncate">{link.texto}</p>
        {link.link && (
          <p className="text-xs text-gray-400 truncate">{link.link}</p>
        )}
      </div>

      {/* Ações */}
      <button
        onClick={() => onToggleAtivo(link)}
        title={link.ativo ? 'Desativar' : 'Ativar'}
        className={`flex-shrink-0 transition-colors ${link.ativo ? 'text-green-500 hover:text-gray-400' : 'text-gray-400 hover:text-green-500'}`}
      >
        {link.ativo ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
      </button>
      <button onClick={() => onEdit(link)} className="flex-shrink-0 text-gray-400 hover:text-blue-600 transition-colors">
        <Edit2 className="h-4 w-4" />
      </button>
      <button onClick={() => onDelete(link)} className="flex-shrink-0 text-gray-400 hover:text-red-500 transition-colors">
        <Trash2 className="h-4 w-4" />
      </button>
    </div>
  );
};

// ─── Componente principal ─────────────────────────────────────────────────────

const FooterManagement: React.FC = () => {
  const { token } = useAuth();
  const [activeTab, setActiveTab] = useState<FooterTab>('colunas');
  const [isLoading, setIsLoading] = useState(true);

  // Estado das colunas e links
  const [colunas, setColunas] = useState<RodapeColuna[]>([]);

  // Estado das configurações da empresa
  const [config, setConfig] = useState<RodapeConfig>({
    empresa_nome: '',
    empresa_tagline: '',
    empresa_descricao: '',
    empresa_autor: '',
    empresa_logo: '',
    info_texto: '',
    info_alinhamento: 'left',
    copyright: '',
    versao_sistema: '',
    notas_versao: '',
  });
  const [configOriginal, setConfigOriginal] = useState<RodapeConfig>(config);

  // Ref do textarea de informações (para bold via seleção)
  const infoTextareaRef = useRef<HTMLTextAreaElement>(null);

  // Bottom links
  const [bottomLinks, setBottomLinks] = useState<BottomLink[]>([]);
  const [showModalBottom, setShowModalBottom] = useState(false);
  const [bottomEditando, setBottomEditando] = useState<BottomLink | null>(null);
  const [bottomTexto, setBottomTexto] = useState('');
  const [bottomUrl, setBottomUrl] = useState('');
  const [bottomAtivo, setBottomAtivo] = useState(true);
  const [isSavingBottom, setIsSavingBottom] = useState(false);
  const [bottomError, setBottomError] = useState('');
  const [deleteBottomConfirm, setDeleteBottomConfirm] = useState<{ id: string; label: string } | null>(null);
  const [isDeletingBottom, setIsDeletingBottom] = useState(false);

  const bottomSensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );
  const [isSavingConfig, setIsSavingConfig] = useState<string | null>(null);

  // Modal de link
  const [showModalLink, setShowModalLink] = useState(false);
  const [linkEditando, setLinkEditando] = useState<RodapeLink | null>(null);
  const [linkColunaId, setLinkColunaId] = useState('');
  const [linkTexto, setLinkTexto] = useState('');
  const [linkUrl, setLinkUrl] = useState('');
  const [linkEhLink, setLinkEhLink] = useState(true);
  const [isSavingLink, setIsSavingLink] = useState(false);
  const [linkError, setLinkError] = useState('');

  // Modal confirmação de deleção
  const [deleteConfirm, setDeleteConfirm] = useState<{ tipo: 'link' | 'coluna'; id: string; label: string } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const authHeaders = {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };

  const colunaSensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  // ─── Carregar dados ──────────────────────────────────────────────────────────

  const loadData = useCallback(async () => {
    try {
      setIsLoading(true);
      const res = await fetch(`${API_BASE_URL}/admin/rodape`, { headers: authHeaders });
      const result = await res.json();
      if (!result.success) return;

      const { configuracoes, colunas: colsDados } = result.data;

      const cfg: RodapeConfig = {
        empresa_nome: configuracoes?.empresa_nome || '',
        empresa_tagline: configuracoes?.empresa_tagline || '',
        empresa_descricao: configuracoes?.empresa_descricao || '',
        empresa_autor: configuracoes?.empresa_autor || '',
        empresa_logo: configuracoes?.empresa_logo || '',
        info_texto: configuracoes?.info_texto || '',
        info_alinhamento: (configuracoes?.info_alinhamento as RodapeConfig['info_alinhamento']) || 'left',
        copyright: configuracoes?.copyright || '',
        versao_sistema: configuracoes?.versao_sistema || '',
        notas_versao: configuracoes?.notas_versao || '',
      };
      setConfig(cfg);
      setConfigOriginal(cfg);
      setColunas(colsDados || []);

      // Bottom links
      const bRes = await fetch(`${API_BASE_URL}/admin/rodape/bottom-links`, { headers: authHeaders });
      const bResult = await bRes.json();
      if (bResult.success) setBottomLinks(bResult.data || []);
    } catch {
      // silencioso
    } finally {
      setIsLoading(false);
    }
  }, [token]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Fechar modais com ESC
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (deleteConfirm) { setDeleteConfirm(null); return; }
      if (showModalLink && !isSavingLink) { fecharModalLink(); }
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [showModalLink, isSavingLink, deleteConfirm]);

  // ─── Colunas ────────────────────────────────────────────────────────────────

  const handleDragEndColunas = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIdx = colunas.findIndex(c => c.id === active.id);
    const newIdx = colunas.findIndex(c => c.id === over.id);
    if (oldIdx === -1 || newIdx === -1) return;
    const newColunas = arrayMove(colunas, oldIdx, newIdx);
    setColunas(newColunas);
    try {
      await fetch(`${API_BASE_URL}/admin/rodape/colunas/ordem`, {
        method: 'PUT',
        headers: authHeaders,
        body: JSON.stringify({ colunaIds: newColunas.map(c => c.id) }),
      });
      dispatchUpdate();
    } catch { loadData(); }
  };

  const handleAddColuna = async () => {
    const titulo = prompt('Nome da nova coluna:');
    if (!titulo || !titulo.trim()) return;
    try {
      const res = await fetch(`${API_BASE_URL}/admin/rodape/colunas`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({ titulo: titulo.trim() }),
      });
      const result = await res.json();
      if (result.success) {
        setColunas(prev => [...prev, { ...result.data, links: [] }]);
        dispatchUpdate();
      }
    } catch { /* silencioso */ }
  };

  const handleRenameColuna = async (id: string, novoTitulo: string) => {
    const prev = colunas;
    setColunas(colunas.map(c => c.id === id ? { ...c, titulo: novoTitulo } : c));
    try {
      const res = await fetch(`${API_BASE_URL}/admin/rodape/colunas/${id}`, {
        method: 'PUT',
        headers: authHeaders,
        body: JSON.stringify({ titulo: novoTitulo }),
      });
      if (!res.ok) setColunas(prev);
      else dispatchUpdate();
    } catch { setColunas(prev); }
  };

  const handleDeleteColuna = (id: string) => {
    const coluna = colunas.find(c => c.id === id);
    setDeleteConfirm({ tipo: 'coluna', id, label: coluna?.titulo || 'esta coluna' });
  };

  const confirmarDelete = async () => {
    if (!deleteConfirm) return;
    setIsDeleting(true);
    try {
      if (deleteConfirm.tipo === 'coluna') {
        const res = await fetch(`${API_BASE_URL}/admin/rodape/colunas/${deleteConfirm.id}`, {
          method: 'DELETE',
          headers: authHeaders,
        });
        if (res.ok) {
          setColunas(prev => prev.filter(c => c.id !== deleteConfirm.id));
          dispatchUpdate();
        }
      } else {
        const res = await fetch(`${API_BASE_URL}/admin/rodape/links/${deleteConfirm.id}`, {
          method: 'DELETE',
          headers: authHeaders,
        });
        if (res.ok) {
          setColunas(prev => prev.map(c => ({ ...c, links: c.links.filter(l => l.id !== deleteConfirm.id) })));
          dispatchUpdate();
        }
      }
    } finally {
      setIsDeleting(false);
      setDeleteConfirm(null);
    }
  };

  // ─── Links ──────────────────────────────────────────────────────────────────

  const handleReorderLinks = async (colunaId: string, newLinks: RodapeLink[]) => {
    setColunas(prev => prev.map(c => c.id === colunaId ? { ...c, links: newLinks } : c));
    try {
      await fetch(`${API_BASE_URL}/admin/rodape/links/ordem`, {
        method: 'PUT',
        headers: authHeaders,
        body: JSON.stringify({ linkIds: newLinks.map(l => l.id) }),
      });
      dispatchUpdate();
    } catch { loadData(); }
  };

  const abrirModalNovoLink = (colunaId: string) => {
    setLinkEditando(null);
    setLinkColunaId(colunaId);
    setLinkTexto('');
    setLinkUrl('');
    setLinkEhLink(true);
    setLinkError('');
    setShowModalLink(true);
  };

  const abrirModalEditarLink = (link: RodapeLink) => {
    setLinkEditando(link);
    setLinkColunaId(link.colunaId);
    setLinkTexto(link.texto);
    setLinkUrl(link.link);
    setLinkEhLink(link.ehLink);
    setLinkError('');
    setShowModalLink(true);
  };

  const fecharModalLink = () => {
    setShowModalLink(false);
    setLinkEditando(null);
    setLinkError('');
  };

  const handleSalvarLink = async () => {
    if (!linkTexto.trim()) { setLinkError('Texto é obrigatório.'); return; }
    if (linkEhLink && !linkUrl.trim()) { setLinkError('URL é obrigatória quando é um link.'); return; }
    setIsSavingLink(true);
    setLinkError('');
    try {
      const payload = { coluna_id: linkColunaId, texto: linkTexto.trim(), link: linkEhLink ? linkUrl.trim() : '', eh_link: linkEhLink };
      let res: Response;
      if (linkEditando) {
        res = await fetch(`${API_BASE_URL}/admin/rodape/links/${linkEditando.id}`, {
          method: 'PUT',
          headers: authHeaders,
          body: JSON.stringify(payload),
        });
      } else {
        res = await fetch(`${API_BASE_URL}/admin/rodape/links`, {
          method: 'POST',
          headers: authHeaders,
          body: JSON.stringify(payload),
        });
      }
      const result = await res.json();
      if (!result.success) {
        setLinkError(result.error || 'Erro ao salvar.');
        return;
      }
      const savedLink: RodapeLink = result.data;
      setColunas(prev => prev.map(c => {
        if (linkEditando) {
          if (c.id === linkColunaId) {
            return { ...c, links: c.links.map(l => l.id === linkEditando.id ? savedLink : l) };
          } else if (c.links.some(l => l.id === linkEditando.id)) {
            return { ...c, links: c.links.filter(l => l.id !== linkEditando.id) };
          }
        } else {
          if (c.id === savedLink.colunaId) {
            return { ...c, links: [...c.links, savedLink] };
          }
        }
        return c;
      }));
      dispatchUpdate();
      fecharModalLink();
    } catch {
      setLinkError('Erro de conexão. Tente novamente.');
    } finally {
      setIsSavingLink(false);
    }
  };

  const handleDeleteLink = (id: string) => {
    const link = colunas.flatMap(c => c.links).find(l => l.id === id);
    setDeleteConfirm({ tipo: 'link', id, label: `"${link?.texto || 'este link'}"` });
  };

  // ─── Info texto: negrito via seleção ────────────────────────────────────────

  const aplicarNegrito = () => {
    const el = infoTextareaRef.current;
    if (!el) return;
    const { selectionStart: start, selectionEnd: end, value } = el;
    if (start === end) return;
    const selecao = value.slice(start, end);
    let novoTexto: string;
    let novoCursorStart: number;
    let novoCursorEnd: number;
    if (selecao.startsWith('**') && selecao.endsWith('**') && selecao.length > 4) {
      const inner = selecao.slice(2, -2);
      novoTexto = value.slice(0, start) + inner + value.slice(end);
      novoCursorStart = start;
      novoCursorEnd = start + inner.length;
    } else {
      const wrapped = `**${selecao}**`;
      novoTexto = value.slice(0, start) + wrapped + value.slice(end);
      novoCursorStart = start;
      novoCursorEnd = start + wrapped.length;
    }
    setConfig(prev => ({ ...prev, info_texto: novoTexto }));
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(novoCursorStart, novoCursorEnd);
    });
  };

  const handleSalvarInfo = async () => {
    setIsSavingConfig('info_texto');
    try {
      await Promise.all([
        fetch(`${API_BASE_URL}/admin/rodape/config/info_texto`, {
          method: 'PUT', headers: authHeaders,
          body: JSON.stringify({ valor: config.info_texto }),
        }),
        fetch(`${API_BASE_URL}/admin/rodape/config/info_alinhamento`, {
          method: 'PUT', headers: authHeaders,
          body: JSON.stringify({ valor: config.info_alinhamento }),
        }),
      ]);
      setConfigOriginal(prev => ({ ...prev, info_texto: config.info_texto, info_alinhamento: config.info_alinhamento }));
      dispatchUpdate();
    } finally {
      setIsSavingConfig(null);
    }
  };

  const infoDirty = config.info_texto !== configOriginal.info_texto || config.info_alinhamento !== configOriginal.info_alinhamento;

  // ─── Configurações ───────────────────────────────────────────────────────────

  const handleSalvarConfig = async (chave: keyof RodapeConfig) => {
    setIsSavingConfig(chave);
    try {
      const res = await fetch(`${API_BASE_URL}/admin/rodape/config/${chave}`, {
        method: 'PUT',
        headers: authHeaders,
        body: JSON.stringify({ valor: config[chave] }),
      });
      const result = await res.json();
      if (result.success) {
        setConfigOriginal(prev => ({ ...prev, [chave]: config[chave] }));
        dispatchUpdate();
      }
    } finally {
      setIsSavingConfig(null);
    }
  };

  const handleSalvarTodaEmpresa = async () => {
    setIsSavingConfig('empresa_nome');
    const chaves: (keyof RodapeConfig)[] = ['empresa_nome', 'empresa_tagline', 'empresa_descricao', 'empresa_autor', 'empresa_logo'];
    try {
      for (const chave of chaves) {
        if (config[chave] !== configOriginal[chave]) {
          await fetch(`${API_BASE_URL}/admin/rodape/config/${chave}`, {
            method: 'PUT',
            headers: authHeaders,
            body: JSON.stringify({ valor: config[chave] }),
          });
        }
      }
      setConfigOriginal(prev => ({ ...prev, ...Object.fromEntries(chaves.map(k => [k, config[k]])) }));
      dispatchUpdate();
    } finally {
      setIsSavingConfig(null);
    }
  };

  const empresaDirty = ['empresa_nome', 'empresa_tagline', 'empresa_descricao', 'empresa_autor', 'empresa_logo'].some(
    k => config[k as keyof RodapeConfig] !== configOriginal[k as keyof RodapeConfig]
  );

  // ─── Bottom links ────────────────────────────────────────────────────────────

  const handleDragEndBottom = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIdx = bottomLinks.findIndex(l => l.id === active.id);
    const newIdx = bottomLinks.findIndex(l => l.id === over.id);
    if (oldIdx === -1 || newIdx === -1) return;
    const newLinks = arrayMove(bottomLinks, oldIdx, newIdx);
    setBottomLinks(newLinks);
    try {
      await fetch(`${API_BASE_URL}/admin/rodape/bottom-links/ordem`, {
        method: 'PUT', headers: authHeaders,
        body: JSON.stringify({ linkIds: newLinks.map(l => l.id) }),
      });
      dispatchUpdate();
    } catch { loadData(); }
  };

  const abrirModalNovoBottom = () => {
    setBottomEditando(null);
    setBottomTexto('');
    setBottomUrl('');
    setBottomAtivo(true);
    setBottomError('');
    setShowModalBottom(true);
  };

  const abrirModalEditarBottom = (link: BottomLink) => {
    setBottomEditando(link);
    setBottomTexto(link.texto);
    setBottomUrl(link.link);
    setBottomAtivo(link.ativo);
    setBottomError('');
    setShowModalBottom(true);
  };

  const fecharModalBottom = () => {
    setShowModalBottom(false);
    setBottomEditando(null);
    setBottomError('');
  };

  const handleSalvarBottom = async () => {
    if (!bottomTexto.trim()) { setBottomError('Texto é obrigatório.'); return; }
    setIsSavingBottom(true);
    setBottomError('');
    try {
      const payload = { texto: bottomTexto.trim(), link: bottomUrl.trim(), ativo: bottomAtivo };
      let res: Response;
      if (bottomEditando) {
        res = await fetch(`${API_BASE_URL}/admin/rodape/bottom-links/${bottomEditando.id}`, {
          method: 'PUT', headers: authHeaders, body: JSON.stringify(payload),
        });
      } else {
        res = await fetch(`${API_BASE_URL}/admin/rodape/bottom-links`, {
          method: 'POST', headers: authHeaders, body: JSON.stringify(payload),
        });
      }
      const result = await res.json();
      if (!result.success) { setBottomError(result.error || 'Erro ao salvar.'); return; }
      const saved: BottomLink = result.data;
      if (bottomEditando) {
        setBottomLinks(prev => prev.map(l => l.id === saved.id ? saved : l));
      } else {
        setBottomLinks(prev => [...prev, saved]);
      }
      dispatchUpdate();
      fecharModalBottom();
    } catch {
      setBottomError('Erro de conexão. Tente novamente.');
    } finally {
      setIsSavingBottom(false);
    }
  };

  const handleToggleAtivoBottom = async (link: BottomLink) => {
    const updated = { ...link, ativo: !link.ativo };
    setBottomLinks(prev => prev.map(l => l.id === link.id ? updated : l));
    try {
      await fetch(`${API_BASE_URL}/admin/rodape/bottom-links/${link.id}`, {
        method: 'PUT', headers: authHeaders,
        body: JSON.stringify({ ativo: updated.ativo }),
      });
      dispatchUpdate();
    } catch { loadData(); }
  };

  const handleDeleteBottom = (link: BottomLink) => {
    setDeleteBottomConfirm({ id: link.id, label: `"${link.texto}"` });
  };

  const confirmarDeleteBottom = async () => {
    if (!deleteBottomConfirm) return;
    setIsDeletingBottom(true);
    try {
      const res = await fetch(`${API_BASE_URL}/admin/rodape/bottom-links/${deleteBottomConfirm.id}`, {
        method: 'DELETE', headers: authHeaders,
      });
      if (res.ok) {
        setBottomLinks(prev => prev.filter(l => l.id !== deleteBottomConfirm.id));
        dispatchUpdate();
      }
    } finally {
      setIsDeletingBottom(false);
      setDeleteBottomConfirm(null);
    }
  };

  const dispatchUpdate = () => {
    window.dispatchEvent(new CustomEvent('rodape-updated'));
  };

  // ─── Render ──────────────────────────────────────────────────────────────────

  const tabs = [
    { id: 'colunas'  as FooterTab, label: 'Colunas',         icon: Layout    },
    { id: 'empresa'  as FooterTab, label: 'Empresa',          icon: Building2 },
    { id: 'info'     as FooterTab, label: 'Informações',      icon: FileText  },
    { id: 'inferior' as FooterTab, label: 'Rodapé Inferior',  icon: Copyright },
    { id: 'base'     as FooterTab, label: 'Links de Base',    icon: Rows      },
    { id: 'versao'   as FooterTab, label: 'Versão',           icon: Tag       },
  ];

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-500" />
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="bg-gradient-to-r from-gray-700 to-gray-800 rounded-2xl shadow-lg p-6 mb-6">
        <div className="flex items-center gap-4">
          <div className="bg-white/20 rounded-xl p-3">
            <Layout className="h-7 w-7 text-white" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-white">Rodapé</h2>
            <p className="text-white/80 text-sm">Gerencie o conteúdo do rodapé exibido em todas as páginas</p>
          </div>
        </div>
      </div>

      {/* Abas */}
      <div className="flex gap-2 mb-6 flex-wrap">
        {tabs.map(tab => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-2xl font-semibold text-sm transition-all duration-200 shadow-sm ${
                activeTab === tab.id
                  ? 'bg-gradient-to-r from-blue-500 to-blue-600 text-white shadow-lg'
                  : 'bg-white text-gray-600 border border-gray-200 hover:border-blue-300 hover:text-blue-600'
              }`}
            >
              <Icon className="h-4 w-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* ─── ABA: COLUNAS ─────────────────────────────────────────── */}
      {activeTab === 'colunas' && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm text-gray-500">
              Arraste as colunas para reordenar. Clique no título para renomear.
            </p>
            <button
              onClick={handleAddColuna}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white font-semibold rounded-xl hover:bg-blue-700 shadow-lg transition-all text-sm"
            >
              <Plus className="h-4 w-4" />
              Nova Coluna
            </button>
          </div>

          {colunas.length === 0 ? (
            <div className="text-center py-16 text-gray-400">
              <Layout className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p className="font-medium">Nenhuma coluna criada</p>
              <p className="text-sm mt-1">Clique em "Nova Coluna" para começar.</p>
            </div>
          ) : (
            <DndContext sensors={colunaSensors} collisionDetection={closestCenter} onDragEnd={handleDragEndColunas}>
              <SortableContext items={colunas.map(c => c.id)} strategy={horizontalListSortingStrategy}>
                <div className="flex gap-4 overflow-x-auto pb-4">
                  {colunas.map(coluna => (
                    <SortableColuna
                      key={coluna.id}
                      coluna={coluna}
                      onRenameColuna={handleRenameColuna}
                      onDeleteColuna={handleDeleteColuna}
                      onAddLink={abrirModalNovoLink}
                      onEditLink={abrirModalEditarLink}
                      onDeleteLink={handleDeleteLink}
                      onReorderLinks={handleReorderLinks}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          )}
        </div>
      )}

      {/* ─── ABA: EMPRESA ─────────────────────────────────────────── */}
      {activeTab === 'empresa' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Formulário */}
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Nome da Empresa</label>
              <input
                type="text"
                value={config.empresa_nome}
                onChange={e => setConfig(prev => ({ ...prev, empresa_nome: e.target.value }))}
                className="w-full px-4 py-3 border border-gray-200 rounded-xl bg-gray-50 text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Tagline / Subtítulo</label>
              <input
                type="text"
                value={config.empresa_tagline}
                onChange={e => setConfig(prev => ({ ...prev, empresa_tagline: e.target.value }))}
                className="w-full px-4 py-3 border border-gray-200 rounded-xl bg-gray-50 text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Descrição</label>
              <textarea
                value={config.empresa_descricao}
                onChange={e => setConfig(prev => ({ ...prev, empresa_descricao: e.target.value }))}
                rows={4}
                className="w-full px-4 py-3 border border-gray-200 rounded-xl bg-gray-50 text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm resize-none"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Texto do Autor / Registro</label>
              <input
                type="text"
                value={config.empresa_autor}
                onChange={e => setConfig(prev => ({ ...prev, empresa_autor: e.target.value }))}
                className="w-full px-4 py-3 border border-gray-200 rounded-xl bg-gray-50 text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Caminho do Logo
                <span className="ml-2 text-xs font-normal text-gray-400">(ex: /logo_rodape.PNG)</span>
              </label>
              <input
                type="text"
                value={config.empresa_logo}
                onChange={e => setConfig(prev => ({ ...prev, empresa_logo: e.target.value }))}
                className="w-full px-4 py-3 border border-gray-200 rounded-xl bg-gray-50 text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm font-mono"
              />
            </div>
            <button
              onClick={handleSalvarTodaEmpresa}
              disabled={!empresaDirty || isSavingConfig !== null}
              className={`w-full flex items-center justify-center gap-2 px-5 py-3 rounded-xl font-semibold text-sm transition-all ${
                empresaDirty && isSavingConfig === null
                  ? 'bg-blue-600 text-white hover:bg-blue-700 shadow-lg'
                  : 'bg-gray-100 text-gray-400 cursor-not-allowed'
              }`}
            >
              {isSavingConfig !== null ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
                  Salvando...
                </>
              ) : (
                <>
                  <Save className="h-4 w-4" />
                  Salvar Informações da Empresa
                </>
              )}
            </button>
          </div>

          {/* Preview */}
          <div>
            <p className="text-sm font-semibold text-gray-700 mb-3">Preview</p>
            <div className="bg-gray-800 rounded-xl p-5 text-white">
              <div className="flex items-start gap-3">
                {config.empresa_logo && (
                  <img
                    src={config.empresa_logo}
                    alt="Logo"
                    className="h-10 w-10 object-contain flex-shrink-0"
                    onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                  />
                )}
                <div>
                  <p className="font-bold text-base">{config.empresa_nome || '—'}</p>
                  <p className="text-gray-400 text-sm">{config.empresa_tagline || '—'}</p>
                  <p className="text-gray-400 text-xs mt-2 leading-relaxed">
                    {config.empresa_descricao || '—'}
                  </p>
                  {config.empresa_autor && (
                    <p className="text-gray-400 text-xs mt-2">{config.empresa_autor}</p>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─── ABA: INFORMAÇÕES ────────────────────────────────────── */}
      {activeTab === 'info' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Formulário */}
          <div>
            <p className="text-xs text-gray-500 mb-4">
              Este bloco aparece abaixo das colunas e acima do copyright, separado por linhas divisórias.
              Use <code className="bg-gray-100 px-1 rounded text-blue-600 font-mono">**texto**</code> para <strong>negrito</strong>.
            </p>

            {/* Alinhamento */}
            <div className="mb-4">
              <label className="block text-sm font-semibold text-gray-700 mb-2">Alinhamento</label>
              <div className="flex gap-2">
                {([
                  { valor: 'left',   icone: AlignLeft,   label: 'Esquerda' },
                  { valor: 'center', icone: AlignCenter, label: 'Centro' },
                  { valor: 'right',  icone: AlignRight,  label: 'Direita' },
                ] as const).map(({ valor, icone: Icone, label }) => (
                  <button
                    key={valor}
                    onClick={() => setConfig(prev => ({ ...prev, info_alinhamento: valor }))}
                    title={label}
                    className={`flex items-center gap-2 px-4 py-2 rounded-xl border text-sm font-medium transition-all ${
                      config.info_alinhamento === valor
                        ? 'bg-blue-500 border-blue-500 text-white shadow-md'
                        : 'bg-white border-gray-200 text-gray-600 hover:border-blue-400'
                    }`}
                  >
                    <Icone className="h-4 w-4" />
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* Toolbar de formatação */}
            <div className="mb-1 flex gap-1">
              <button
                onClick={aplicarNegrito}
                title="Negrito (selecione o texto e clique)"
                className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-gray-200 rounded-lg text-sm text-gray-600 hover:border-blue-400 hover:text-blue-600 transition-all font-semibold"
              >
                <Bold className="h-3.5 w-3.5" />
                Negrito
              </button>
              <span className="text-xs text-gray-400 self-center ml-1">
                Selecione o texto e clique em Negrito
              </span>
            </div>

            {/* Textarea */}
            <textarea
              ref={infoTextareaRef}
              value={config.info_texto}
              onChange={e => setConfig(prev => ({ ...prev, info_texto: e.target.value }))}
              rows={8}
              placeholder="Ex: CNPJ: 00.000.000/0001-00 · Razão Social: Empresa Ltda.&#10;Endereço: Rua Exemplo, 123 · São Paulo, SP · CEP 00000-000&#10;&#10;Todos os direitos reservados."
              className="w-full px-4 py-3 border border-gray-200 rounded-xl bg-gray-50 text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm resize-none font-mono"
            />

            {/* Botão salvar */}
            <button
              onClick={handleSalvarInfo}
              disabled={!infoDirty || isSavingConfig !== null}
              className={`mt-3 flex items-center gap-2 px-5 py-3 rounded-xl font-semibold text-sm transition-all ${
                infoDirty && isSavingConfig === null
                  ? 'bg-blue-600 text-white hover:bg-blue-700 shadow-lg'
                  : 'bg-gray-100 text-gray-400 cursor-not-allowed'
              }`}
            >
              {isSavingConfig === 'info_texto' ? (
                <><div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />Salvando...</>
              ) : (
                <><Save className="h-4 w-4" />Salvar Informações</>
              )}
            </button>
          </div>

          {/* Preview */}
          <div>
            <p className="text-sm font-semibold text-gray-700 mb-3">Preview</p>
            <div className="bg-gray-800 rounded-xl p-5">
              {config.info_texto.trim() ? (
                <div className="border-t border-b border-gray-700 py-4">
                  <div
                    className={`text-gray-400 text-sm leading-relaxed ${
                      config.info_alinhamento === 'center' ? 'text-center' :
                      config.info_alinhamento === 'right'  ? 'text-right'  : 'text-left'
                    }`}
                  >
                    {config.info_texto.split('\n').map((linha, i) => {
                      const partes = linha.split(/(\*\*[^*]+\*\*)/g);
                      return (
                        <p key={i} className={linha.trim() === '' ? 'h-2' : ''}>
                          {partes.map((parte, j) =>
                            parte.startsWith('**') && parte.endsWith('**')
                              ? <strong key={j}>{parte.slice(2, -2)}</strong>
                              : <span key={j}>{parte}</span>
                          )}
                        </p>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <div className="border-t border-b border-gray-700 py-4 text-center text-gray-500 text-xs italic">
                  Nenhum texto — a seção não será exibida
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ─── ABA: RODAPÉ INFERIOR ─────────────────────────────────── */}
      {activeTab === 'inferior' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div>
            <div className="mb-4">
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Texto de Copyright
                <span className="ml-2 text-xs font-normal text-gray-400">(sem o © e o ano — são adicionados automaticamente)</span>
              </label>
              <input
                type="text"
                value={config.copyright}
                onChange={e => setConfig(prev => ({ ...prev, copyright: e.target.value }))}
                className="w-full px-4 py-3 border border-gray-200 rounded-xl bg-gray-50 text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
              />
            </div>
            <button
              onClick={() => handleSalvarConfig('copyright')}
              disabled={config.copyright === configOriginal.copyright || isSavingConfig !== null}
              className={`flex items-center gap-2 px-5 py-3 rounded-xl font-semibold text-sm transition-all ${
                config.copyright !== configOriginal.copyright && isSavingConfig === null
                  ? 'bg-blue-600 text-white hover:bg-blue-700 shadow-lg'
                  : 'bg-gray-100 text-gray-400 cursor-not-allowed'
              }`}
            >
              {isSavingConfig === 'copyright' ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
                  Salvando...
                </>
              ) : (
                <>
                  <Save className="h-4 w-4" />
                  Salvar Copyright
                </>
              )}
            </button>
          </div>

          {/* Preview */}
          <div>
            <p className="text-sm font-semibold text-gray-700 mb-3">Preview</p>
            <div className="bg-gray-800 rounded-xl p-5">
              <div className="border-t border-gray-700 pt-4 text-center text-gray-400 text-sm">
                © {new Date().getFullYear()} {config.copyright || '—'}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─── ABA: LINKS DE BASE ──────────────────────────────────── */}
      {activeTab === 'base' && (
        <div>
          <div className="flex items-start justify-between mb-4 gap-4">
            <div>
              <p className="text-sm text-gray-500">
                Links exibidos abaixo do copyright, separados por <strong>|</strong>, lado a lado.
                Somente os links <strong>ativos</strong> aparecem no rodapé.
              </p>
              {/* Preview da barra */}
              {bottomLinks.filter(l => l.ativo).length > 0 && (
                <div className="mt-3 flex flex-wrap items-center gap-x-0 text-xs text-gray-600 bg-gray-100 border border-gray-200 rounded-xl px-4 py-2">
                  {bottomLinks.filter(l => l.ativo).map((item, idx, arr) => (
                    <span key={item.id} className="flex items-center">
                      <span className="px-1 font-medium">{item.texto}</span>
                      {idx < arr.length - 1 && <span className="text-gray-400 select-none">|</span>}
                    </span>
                  ))}
                </div>
              )}
            </div>
            <button
              onClick={abrirModalNovoBottom}
              className="flex-shrink-0 flex items-center gap-2 px-4 py-2 bg-blue-600 text-white font-semibold rounded-xl hover:bg-blue-700 shadow-lg transition-all text-sm"
            >
              <Plus className="h-4 w-4" />
              Novo Link
            </button>
          </div>

          {bottomLinks.length === 0 ? (
            <div className="text-center py-16 text-gray-400">
              <Rows className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p className="font-medium">Nenhum link criado</p>
              <p className="text-sm mt-1">Clique em "Novo Link" para começar.</p>
            </div>
          ) : (
            <DndContext sensors={bottomSensors} collisionDetection={closestCenter} onDragEnd={handleDragEndBottom}>
              <SortableContext items={bottomLinks.map(l => l.id)} strategy={verticalListSortingStrategy}>
                <div className="space-y-2">
                  {bottomLinks.map(link => (
                    <SortableBottomLinkItem
                      key={link.id}
                      link={link}
                      onEdit={abrirModalEditarBottom}
                      onDelete={handleDeleteBottom}
                      onToggleAtivo={handleToggleAtivoBottom}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          )}
        </div>
      )}

      {/* ─── ABA: VERSÃO ─────────────────────────────────────────── */}
      {activeTab === 'versao' && (
        <div className="space-y-8">

          {/* Número da versão */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">
                Versão do Sistema
              </label>
              <p className="text-xs text-gray-400 mb-3">
                Exibida no canto direito da barra inferior do rodapé. Ex: <span className="font-mono">2.0</span>, <span className="font-mono">3.1 Beta</span>, <span className="font-mono">2024.1</span>
              </p>
              <div className="flex items-center gap-2 mb-4">
                <span className="text-sm text-gray-400 font-mono">v</span>
                <input
                  type="text"
                  value={config.versao_sistema}
                  onChange={e => setConfig(prev => ({ ...prev, versao_sistema: e.target.value }))}
                  placeholder="ex: 2.0 Beta"
                  className="flex-1 px-4 py-3 border border-gray-200 rounded-xl bg-gray-50 text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm font-mono"
                />
              </div>
              <button
                onClick={() => handleSalvarConfig('versao_sistema')}
                disabled={config.versao_sistema === configOriginal.versao_sistema || isSavingConfig !== null}
                className={`flex items-center gap-2 px-5 py-3 rounded-xl font-semibold text-sm transition-all ${
                  config.versao_sistema !== configOriginal.versao_sistema && isSavingConfig === null
                    ? 'bg-blue-600 text-white hover:bg-blue-700 shadow-lg'
                    : 'bg-gray-100 text-gray-400 cursor-not-allowed'
                }`}
              >
                {isSavingConfig === 'versao_sistema' ? (
                  <><div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />Salvando...</>
                ) : (
                  <><Save className="h-4 w-4" />Salvar Versão</>
                )}
              </button>
            </div>

            {/* Preview da barra */}
            <div>
              <p className="text-sm font-semibold text-gray-700 mb-3">Preview da barra</p>
              <div className="bg-gray-800 rounded-xl p-5">
                <div className="flex items-center text-xs text-gray-500">
                  <div className="flex-1" />
                  <div className="flex-1 flex justify-center gap-x-2 text-gray-600">
                    <span>Política de Privacidade</span>
                    <span className="text-gray-600">|</span>
                    <span>Termos de Uso</span>
                  </div>
                  <div className="flex-1 flex justify-end">
                    {config.versao_sistema ? (
                      <span className="text-gray-500 font-mono underline decoration-dotted cursor-pointer">
                        v{config.versao_sistema}
                      </span>
                    ) : (
                      <span className="text-gray-600 italic">sem versão</span>
                    )}
                  </div>
                </div>
              </div>
              {config.versao_sistema && (
                <p className="text-xs text-gray-400 mt-2">
                  {config.notas_versao
                    ? '✓ Com notas — versão será clicável no rodapé'
                    : '○ Sem notas — versão aparece como texto simples'}
                </p>
              )}
            </div>
          </div>

          {/* Notas da versão */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <div>
                <label className="block text-sm font-semibold text-gray-700">
                  Notas da Versão
                </label>
                <p className="text-xs text-gray-400 mt-0.5">
                  Quando preenchido, a versão no rodapé vira um link que abre um modal com este conteúdo.
                </p>
              </div>
              <button
                onClick={() => handleSalvarConfig('notas_versao')}
                disabled={config.notas_versao === configOriginal.notas_versao || isSavingConfig !== null}
                className={`flex-shrink-0 flex items-center gap-2 px-5 py-3 rounded-xl font-semibold text-sm transition-all ${
                  config.notas_versao !== configOriginal.notas_versao && isSavingConfig === null
                    ? 'bg-blue-600 text-white hover:bg-blue-700 shadow-lg'
                    : 'bg-gray-100 text-gray-400 cursor-not-allowed'
                }`}
              >
                {isSavingConfig === 'notas_versao' ? (
                  <><div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />Salvando...</>
                ) : (
                  <><Save className="h-4 w-4" />Salvar Notas</>
                )}
              </button>
            </div>
            <TipTapEditor
              content={config.notas_versao}
              onChange={html => setConfig(prev => ({ ...prev, notas_versao: html }))}
            />
          </div>

        </div>
      )}

      {/* ─── MODAL DE LINK ─────────────────────────────────────────── */}
      {showModalLink && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 px-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl border border-gray-200">
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-base font-bold text-gray-800">
                {linkEditando ? 'Editar Link' : 'Novo Link'}
              </h3>
              <button onClick={fecharModalLink} className="text-gray-400 hover:text-gray-600">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-4">
              {/* Coluna */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Coluna <span className="text-red-500">*</span>
                </label>
                <select
                  value={linkColunaId}
                  onChange={e => setLinkColunaId(e.target.value)}
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl bg-gray-50 text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                >
                  {colunas.map(c => (
                    <option key={c.id} value={c.id}>{c.titulo}</option>
                  ))}
                </select>
              </div>

              {/* Texto */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Texto <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  placeholder="Ex: Entre em contato"
                  value={linkTexto}
                  onChange={e => setLinkTexto(e.target.value)}
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl bg-gray-50 text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                />
              </div>

              {/* Toggle é link */}
              <div className="flex items-center justify-between p-3 bg-gray-100 rounded-xl">
                <div>
                  <p className="text-sm font-semibold text-gray-700">É um link clicável?</p>
                  <p className="text-xs text-gray-500">
                    {linkEhLink ? 'Abre uma URL ao clicar' : 'Apenas texto informativo'}
                  </p>
                </div>
                <button
                  onClick={() => setLinkEhLink(v => !v)}
                  className={`relative w-11 h-6 rounded-full transition-colors ${linkEhLink ? 'bg-blue-500' : 'bg-gray-300'}`}
                >
                  <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${linkEhLink ? 'translate-x-5' : 'translate-x-0'}`} />
                </button>
              </div>

              {/* URL */}
              {linkEhLink && (
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    URL <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    placeholder="https://..."
                    value={linkUrl}
                    onChange={e => setLinkUrl(e.target.value)}
                    className="w-full px-4 py-3 border border-gray-200 rounded-xl bg-gray-50 text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm font-mono"
                  />
                </div>
              )}

              {/* Erro */}
              {linkError && (
                <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 rounded-xl px-4 py-3">
                  <AlertTriangle className="h-4 w-4 flex-shrink-0" />
                  {linkError}
                </div>
              )}

              {/* Botões */}
              <div className="flex gap-3 pt-2">
                <button
                  onClick={fecharModalLink}
                  disabled={isSavingLink}
                  className="flex-1 px-4 py-2.5 border border-gray-200 text-gray-600 rounded-xl font-semibold text-sm hover:bg-gray-50 transition-colors disabled:opacity-50"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleSalvarLink}
                  disabled={isSavingLink}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-xl font-semibold text-sm hover:bg-blue-700 transition-all disabled:opacity-50"
                >
                  {isSavingLink ? (
                    <><div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" /> Salvando...</>
                  ) : (
                    <><Save className="h-4 w-4" /> Salvar</>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─── MODAL DE CONFIRMAÇÃO DE DELEÇÃO ─────────────────────── */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 px-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-2xl border border-red-200">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center flex-shrink-0">
                <AlertTriangle className="w-6 h-6 text-red-600" />
              </div>
              <div>
                <h3 className="font-bold text-gray-800">Confirmar exclusão</h3>
                <p className="text-sm text-gray-600">
                  Excluir {deleteConfirm.label}?
                  {deleteConfirm.tipo === 'coluna' && ' Todos os links desta coluna também serão excluídos.'}
                </p>
              </div>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setDeleteConfirm(null)}
                disabled={isDeleting}
                className="flex-1 px-4 py-2.5 border border-gray-200 text-gray-600 rounded-xl font-semibold text-sm hover:bg-gray-50 transition-colors disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                onClick={confirmarDelete}
                disabled={isDeleting}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-red-500 text-white rounded-xl font-semibold text-sm hover:bg-red-600 transition-colors disabled:opacity-50"
              >
                {isDeleting ? (
                  <><div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" /> Excluindo...</>
                ) : (
                  <><Trash2 className="h-4 w-4" /> Excluir</>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── MODAL DE BOTTOM LINK ────────────────────────────────── */}
      {showModalBottom && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 px-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl border border-gray-200">
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-base font-bold text-gray-800">
                {bottomEditando ? 'Editar Link de Base' : 'Novo Link de Base'}
              </h3>
              <button onClick={fecharModalBottom} className="text-gray-400 hover:text-gray-600">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-4">
              {/* Texto */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Texto <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  placeholder="Ex: Política de Privacidade"
                  value={bottomTexto}
                  onChange={e => setBottomTexto(e.target.value)}
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl bg-gray-50 text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                />
              </div>

              {/* URL */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">
                  URL <span className="text-xs font-normal text-gray-400 ml-1">(opcional — pode adicionar depois)</span>
                </label>
                <input
                  type="text"
                  placeholder="https://... ou mailto:..."
                  value={bottomUrl}
                  onChange={e => setBottomUrl(e.target.value)}
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl bg-gray-50 text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm font-mono"
                />
              </div>

              {/* Status */}
              <div className="flex items-center justify-between p-3 bg-gray-100 rounded-xl">
                <div>
                  <p className="text-sm font-semibold text-gray-700">Ativo</p>
                  <p className="text-xs text-gray-500">
                    {bottomAtivo ? 'Aparece no rodapé' : 'Oculto no rodapé'}
                  </p>
                </div>
                <button
                  onClick={() => setBottomAtivo(v => !v)}
                  className={`relative w-11 h-6 rounded-full transition-colors ${bottomAtivo ? 'bg-blue-500' : 'bg-gray-300'}`}
                >
                  <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${bottomAtivo ? 'translate-x-5' : 'translate-x-0'}`} />
                </button>
              </div>

              {/* Erro */}
              {bottomError && (
                <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 rounded-xl px-4 py-3">
                  <AlertTriangle className="h-4 w-4 flex-shrink-0" />
                  {bottomError}
                </div>
              )}

              {/* Botões */}
              <div className="flex gap-3 pt-2">
                <button
                  onClick={fecharModalBottom}
                  disabled={isSavingBottom}
                  className="flex-1 px-4 py-2.5 border border-gray-200 text-gray-600 rounded-xl font-semibold text-sm hover:bg-gray-50 transition-colors disabled:opacity-50"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleSalvarBottom}
                  disabled={isSavingBottom}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-xl font-semibold text-sm hover:bg-blue-700 transition-all disabled:opacity-50"
                >
                  {isSavingBottom ? (
                    <><div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" /> Salvando...</>
                  ) : (
                    <><Save className="h-4 w-4" /> Salvar</>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─── MODAL CONFIRMAÇÃO DELETE BOTTOM LINK ────────────────── */}
      {deleteBottomConfirm && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 px-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-2xl border border-red-200">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center flex-shrink-0">
                <AlertTriangle className="w-6 h-6 text-red-600" />
              </div>
              <div>
                <h3 className="font-bold text-gray-800">Confirmar exclusão</h3>
                <p className="text-sm text-gray-600">
                  Excluir {deleteBottomConfirm.label}?
                </p>
              </div>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setDeleteBottomConfirm(null)}
                disabled={isDeletingBottom}
                className="flex-1 px-4 py-2.5 border border-gray-200 text-gray-600 rounded-xl font-semibold text-sm hover:bg-gray-50 transition-colors disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                onClick={confirmarDeleteBottom}
                disabled={isDeletingBottom}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-red-500 text-white rounded-xl font-semibold text-sm hover:bg-red-600 transition-colors disabled:opacity-50"
              >
                {isDeletingBottom ? (
                  <><div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" /> Excluindo...</>
                ) : (
                  <><Trash2 className="h-4 w-4" /> Excluir</>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default FooterManagement;
