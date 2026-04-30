import React, { useState, useEffect, useCallback } from 'react';
import {
  Plus, Edit2, Trash2, ChevronUp, ChevronDown, Eye, EyeOff,
  HelpCircle, Save, X, AlertTriangle, Globe, Users, ShieldCheck
} from 'lucide-react';
import { getAdminApiBaseUrl, getAuthHeaders } from './api';

type Visibility = 'todos' | 'usuarios' | 'admins';

interface FAQItem {
  id: string;
  pergunta: string;
  resposta: string;
  ativo: boolean;
  ordem: number;
  visibility: Visibility;
  createdAt: string;
  updatedAt: string;
}

// ── Configurações de visibilidade ────────────────────────────────────────────
const VISIBILITY_OPTIONS: {
  value: Visibility;
  label: string;
  desc: string;
  icon: React.ReactNode;
  badge: string;
  badgeCls: string;
}[] = [
  {
    value: 'todos',
    label: 'Todos',
    desc: 'Visível para qualquer visitante, incluindo convidados',
    icon: <Globe className="h-4 w-4" />,
    badge: 'Público',
    badgeCls: 'bg-green-100 text-green-700',
  },
  {
    value: 'usuarios',
    label: 'Usuários registrados',
    desc: 'Visível apenas para quem está logado no sistema',
    icon: <Users className="h-4 w-4" />,
    badge: 'Logados',
    badgeCls: 'bg-blue-100 text-blue-700',
  },
  {
    value: 'admins',
    label: 'Somente admins',
    desc: 'Visível apenas para administradores e superadmins',
    icon: <ShieldCheck className="h-4 w-4" />,
    badge: 'Admin',
    badgeCls: 'bg-purple-100 text-purple-700',
  },
];

function VisibilityBadge({ visibility }: { visibility: Visibility }) {
  const opt = VISIBILITY_OPTIONS.find(o => o.value === visibility);
  if (!opt || visibility === 'todos') return null;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${opt.badgeCls}`}>
      {opt.icon}
      {opt.badge}
    </span>
  );
}

// ── Seletor de 3 opções ───────────────────────────────────────────────────────
function VisibilitySelector({
  value,
  onChange,
}: {
  value: Visibility;
  onChange: (v: Visibility) => void;
}) {
  return (
    <div className="space-y-2">
      {VISIBILITY_OPTIONS.map(opt => (
        <label
          key={opt.value}
          className={`flex items-start gap-3 p-3 rounded-xl border-2 cursor-pointer transition-all ${
            value === opt.value
              ? 'border-blue-500 bg-blue-50'
              : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
          }`}
        >
          <input
            type="radio"
            name="visibility"
            value={opt.value}
            checked={value === opt.value}
            onChange={() => onChange(opt.value)}
            className="mt-0.5 accent-blue-600"
          />
          <span className={`mt-0.5 flex-shrink-0 ${value === opt.value ? 'text-blue-600' : 'text-gray-400'}`}>
            {opt.icon}
          </span>
          <span className="flex-1 min-w-0">
            <span className={`block text-sm font-semibold ${value === opt.value ? 'text-blue-800' : 'text-gray-700'}`}>
              {opt.label}
            </span>
            <span className="block text-xs text-gray-500 mt-0.5">{opt.desc}</span>
          </span>
        </label>
      ))}
    </div>
  );
}

// ── Componente principal ─────────────────────────────────────────────────────
const FAQManagement: React.FC = () => {
  const [items, setItems] = useState<FAQItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingItem, setEditingItem] = useState<FAQItem | null>(null);
  const [pergunta, setPergunta] = useState('');
  const [resposta, setResposta] = useState('');
  const [visibility, setVisibility] = useState<Visibility>('todos');
  const [isSaving, setIsSaving] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [error, setError] = useState('');

  useEffect(() => { loadItems(); }, []);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key !== 'Escape') return;
    if (deleteConfirm) { setDeleteConfirm(null); return; }
    if (showModal && !isSaving) { setShowModal(false); }
  }, [showModal, isSaving, deleteConfirm]);

  useEffect(() => {
    if (showModal || deleteConfirm) document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [showModal, deleteConfirm, handleKeyDown]);

  const loadItems = async () => {
    try {
      setIsLoading(true);
      const res = await fetch(`${getAdminApiBaseUrl()}/admin/faq`, { headers: getAuthHeaders() });
      const result = await res.json();
      if (result.success) setItems(result.data);
    } catch (e) {
      console.error('Erro ao carregar FAQ:', e);
    } finally {
      setIsLoading(false);
    }
  };

  const openCreate = () => {
    setEditingItem(null);
    setPergunta('');
    setResposta('');
    setVisibility('todos');
    setError('');
    setShowModal(true);
  };

  const openEdit = (item: FAQItem) => {
    setEditingItem(item);
    setPergunta(item.pergunta);
    setResposta(item.resposta);
    setVisibility(item.visibility || 'todos');
    setError('');
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!pergunta.trim() || !resposta.trim()) {
      setError('Pergunta e resposta são obrigatórias.');
      return;
    }
    setIsSaving(true);
    try {
      const url = editingItem
        ? `${getAdminApiBaseUrl()}/admin/faq/${editingItem.id}`
        : `${getAdminApiBaseUrl()}/admin/faq`;
      const method = editingItem ? 'PUT' : 'POST';
      const res = await fetch(url, {
        method,
        headers: getAuthHeaders(),
        body: JSON.stringify({ pergunta: pergunta.trim(), resposta: resposta.trim(), visibility }),
      });
      const result = await res.json();
      if (result.success) { setShowModal(false); loadItems(); }
      else setError(result.error || 'Erro ao salvar.');
    } catch {
      setError('Erro de conexão.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleToggleAtivo = async (item: FAQItem) => {
    try {
      const res = await fetch(`${getAdminApiBaseUrl()}/admin/faq/${item.id}`, {
        method: 'PUT',
        headers: getAuthHeaders(),
        body: JSON.stringify({ ativo: !item.ativo }),
      });
      const result = await res.json();
      if (result.success) loadItems();
    } catch (e) { console.error('Erro ao alterar status:', e); }
  };

  const handleDelete = async (id: string) => {
    try {
      const res = await fetch(`${getAdminApiBaseUrl()}/admin/faq/${id}`, {
        method: 'DELETE',
        headers: getAuthHeaders(),
      });
      const result = await res.json();
      if (result.success) { setDeleteConfirm(null); loadItems(); }
    } catch (e) { console.error('Erro ao deletar:', e); }
  };

  const handleMover = async (index: number, direcao: 'cima' | 'baixo') => {
    const novoArray = [...items];
    const troca = direcao === 'cima' ? index - 1 : index + 1;
    if (troca < 0 || troca >= novoArray.length) return;
    [novoArray[index], novoArray[troca]] = [novoArray[troca], novoArray[index]];
    setItems(novoArray);
    try {
      await fetch(`${getAdminApiBaseUrl()}/admin/faq/ordem`, {
        method: 'PUT',
        headers: getAuthHeaders(),
        body: JSON.stringify({ faqIds: novoArray.map(i => i.id) }),
      });
    } catch (e) { console.error('Erro ao reordenar:', e); loadItems(); }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl shadow-md shadow-blue-500/25">
            <HelpCircle className="h-5 w-5 text-white" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">Gerenciar FAQ</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {items.length} {items.length === 1 ? 'item cadastrado' : 'itens cadastrados'}
            </p>
          </div>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-blue-500 to-indigo-600 text-white rounded-xl font-semibold text-sm shadow-md shadow-blue-500/25 hover:from-blue-600 hover:to-indigo-700 hover:-translate-y-0.5 transition-all duration-200"
        >
          <Plus className="h-4 w-4" />
          Nova Pergunta
        </button>
      </div>

      {/* Lista */}
      {items.length === 0 ? (
        <div className="bg-white rounded-2xl border-2 border-dashed border-gray-200 p-12 text-center">
          <HelpCircle className="h-10 w-10 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 font-medium">Nenhuma pergunta cadastrada</p>
          <p className="text-gray-400 text-sm mt-1">Clique em "Nova Pergunta" para começar</p>
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((item, index) => (
            <div
              key={item.id}
              className={`bg-white rounded-2xl border-2 p-5 flex gap-4 items-start transition-all ${
                item.ativo ? 'border-gray-200' : 'border-gray-100 opacity-60'
              }`}
            >
              {/* Botões de ordem */}
              <div className="flex flex-col gap-1 flex-shrink-0 pt-0.5">
                <button
                  onClick={() => handleMover(index, 'cima')}
                  disabled={index === 0}
                  className="p-1 rounded-lg text-gray-300 hover:text-blue-500 hover:bg-blue-50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  title="Mover para cima"
                >
                  <ChevronUp className="h-4 w-4" />
                </button>
                <button
                  onClick={() => handleMover(index, 'baixo')}
                  disabled={index === items.length - 1}
                  className="p-1 rounded-lg text-gray-300 hover:text-blue-500 hover:bg-blue-50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  title="Mover para baixo"
                >
                  <ChevronDown className="h-4 w-4" />
                </button>
              </div>

              {/* Conteúdo */}
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-3 mb-2">
                  <p className="font-semibold text-gray-900 leading-snug">{item.pergunta}</p>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <VisibilityBadge visibility={item.visibility || 'todos'} />
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                      item.ativo ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                    }`}>
                      {item.ativo ? 'Ativo' : 'Inativo'}
                    </span>
                  </div>
                </div>
                <p className="text-gray-500 text-sm line-clamp-2">{item.resposta}</p>
              </div>

              {/* Ações */}
              <div className="flex items-center gap-1 flex-shrink-0">
                <button onClick={() => handleToggleAtivo(item)}
                  className="p-2 rounded-xl text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                  title={item.ativo ? 'Desativar' : 'Ativar'}>
                  {item.ativo ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                </button>
                <button onClick={() => openEdit(item)}
                  className="p-2 rounded-xl text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                  title="Editar">
                  <Edit2 className="h-4 w-4" />
                </button>
                <button onClick={() => setDeleteConfirm(item.id)}
                  className="p-2 rounded-xl text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                  title="Deletar">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal Criar/Editar */}
      {showModal && (
        <div
          className="fixed inset-0 bg-gradient-to-br from-blue-900/50 to-indigo-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4"
          onClick={e => { if (e.target === e.currentTarget && !isSaving) setShowModal(false); }}
        >
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            {/* Header */}
            <div className="bg-gradient-to-r from-blue-500 to-indigo-600 px-6 py-4 rounded-t-2xl flex items-center justify-between">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <HelpCircle className="h-5 w-5 text-white" />
                {editingItem ? 'Editar Pergunta' : 'Nova Pergunta'}
              </h3>
              <button
                onClick={() => setShowModal(false)}
                disabled={isSaving}
                className="p-2 rounded-full text-white/70 hover:text-white hover:bg-white/15 transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Campos */}
            <div className="p-6 space-y-5">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Pergunta <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={pergunta}
                  onChange={e => setPergunta(e.target.value)}
                  placeholder="Ex: Como funciona o sistema de projetos?"
                  disabled={isSaving}
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all text-sm disabled:opacity-50"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Resposta <span className="text-red-500">*</span>
                </label>
                <textarea
                  value={resposta}
                  onChange={e => setResposta(e.target.value)}
                  placeholder="Descreva a resposta de forma clara e objetiva..."
                  rows={4}
                  disabled={isSaving}
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all text-sm resize-none disabled:opacity-50"
                />
              </div>

              {/* Visibilidade */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-3">
                  Quem pode ver esta pergunta?
                </label>
                <VisibilitySelector value={visibility} onChange={setVisibility} />
              </div>

              {error && (
                <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-lg text-sm">
                  {error}
                </div>
              )}
            </div>

            {/* Botões */}
            <div className="flex gap-3 justify-end px-6 pb-6 pt-2 border-t border-gray-100">
              <button
                type="button"
                onClick={() => setShowModal(false)}
                disabled={isSaving}
                className="px-6 py-2.5 border border-gray-300 rounded-xl text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50 text-sm font-medium"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={isSaving}
                className="px-6 py-2.5 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors disabled:opacity-60 flex items-center gap-2 text-sm font-medium shadow-sm"
              >
                {isSaving ? (
                  <><div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />Salvando...</>
                ) : (
                  <><Save className="h-4 w-4" />Salvar</>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de confirmação de exclusão */}
      {deleteConfirm && (
        <div
          className="fixed inset-0 bg-gradient-to-br from-blue-900/50 to-indigo-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4"
          onClick={e => { if (e.target === e.currentTarget) setDeleteConfirm(null); }}
        >
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 text-center">
            <div className="flex justify-center mb-4">
              <div className="bg-red-100 rounded-full p-4">
                <AlertTriangle className="h-8 w-8 text-red-500" />
              </div>
            </div>
            <h3 className="text-lg font-bold text-gray-900 mb-2">Confirmar Exclusão</h3>
            <p className="text-gray-500 text-sm mb-6">Esta ação não pode ser desfeita.</p>
            <div className="flex gap-3">
              <button
                onClick={() => setDeleteConfirm(null)}
                className="flex-1 px-4 py-2.5 border border-gray-300 rounded-xl text-gray-700 hover:bg-gray-50 transition-colors text-sm font-medium"
              >
                Cancelar
              </button>
              <button
                onClick={() => handleDelete(deleteConfirm)}
                className="flex-1 px-4 py-2.5 bg-red-500 text-white rounded-xl hover:bg-red-600 transition-colors text-sm font-medium"
              >
                Excluir
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default FAQManagement;
