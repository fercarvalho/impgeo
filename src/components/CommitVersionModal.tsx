import React, { useState, useEffect } from 'react';
import { GitCommit, Tag, X, Check, Pencil, Bell, Trash2 } from 'lucide-react';

const ROLES_DISPONIVEIS = [
  { value: 'admin', label: 'Administradores' },
  { value: 'user',  label: 'Usuários' },
  { value: 'guest', label: 'Convidados' },
];

interface Props {
  commitHash: string;
  versaoAtual: string;
  mensagemOriginal: string;
  data: string;
  onConfirm: (params: {
    action: 'manter' | 'nova_versao';
    novaVersao?: string;
    mensagem: string;
    data: string;
    rolesNotificados: string[];
  }) => Promise<void>;
  onIgnore: () => Promise<void>;
  onClose: () => void;
}

const CommitVersionModal: React.FC<Props> = ({
  commitHash, versaoAtual, mensagemOriginal, data, onConfirm, onIgnore, onClose,
}) => {
  const [choice, setChoice] = useState<'manter' | 'nova_versao'>('manter');
  const [novaVersao, setNovaVersao] = useState('');
  const [mensagem, setMensagem] = useState(mensagemOriginal);
  const [rolesNotificados, setRolesNotificados] = useState<string[]>(['admin', 'user', 'guest']);
  const [loading, setLoading] = useState(false);
  const [ignoring, setIgnoring] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  const toggleRole = (role: string) => {
    setRolesNotificados(prev =>
      prev.includes(role) ? prev.filter(r => r !== role) : [...prev, role]
    );
  };

  const handleConfirm = async () => {
    if (choice === 'nova_versao' && !novaVersao.trim()) { setError('Informe o número/nome da nova versão.'); return; }
    if (!mensagem.trim()) { setError('A mensagem não pode ficar em branco.'); return; }
    setError('');
    setLoading(true);
    try {
      await onConfirm({
        action: choice,
        novaVersao: choice === 'nova_versao' ? novaVersao.trim() : undefined,
        mensagem: mensagem.trim(),
        data,
        rolesNotificados: choice === 'nova_versao' ? rolesNotificados : [],
      });
    } catch {
      setError('Erro ao confirmar. Tente novamente.');
      setLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 bg-gradient-to-br from-blue-900/50 to-indigo-900/50 backdrop-blur-sm flex items-start justify-center pt-[120px] z-50 px-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-lg my-4 max-h-[calc(100vh-140px)] flex flex-col overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 bg-gradient-to-r from-blue-500 to-indigo-600">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-white/20 rounded-lg">
              <GitCommit className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-white">Novo commit detectado</h2>
              <p className="text-xs text-white/70 font-mono">{commitHash.slice(0, 7)} · {data}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-white/80 hover:text-white hover:bg-white/20 transition-all duration-200">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-5 overflow-y-auto flex-1">

          {/* Versão */}
          <div className="space-y-2">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Versão</p>

            <label className={`flex items-center gap-3 p-3 rounded-lg border-2 cursor-pointer transition-all ${
              choice === 'manter' ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300'
            }`}>
              <input type="radio" name="versao-choice" value="manter" checked={choice === 'manter'}
                onChange={() => { setChoice('manter'); setError(''); }} className="accent-blue-600" />
              <div>
                <p className="text-sm font-medium text-gray-800">Manter versão {versaoAtual}</p>
                <p className="text-xs text-gray-500 mt-0.5">O commit fica registrado na versão atual, sem notificar usuários</p>
              </div>
            </label>

            <label className={`flex items-start gap-3 p-3 rounded-lg border-2 cursor-pointer transition-all ${
              choice === 'nova_versao' ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300'
            }`}>
              <input type="radio" name="versao-choice" value="nova_versao" checked={choice === 'nova_versao'}
                onChange={() => { setChoice('nova_versao'); setError(''); }} className="accent-blue-600 mt-0.5" />
              <div className="flex-1">
                <p className="text-sm font-medium text-gray-800">Iniciar nova versão</p>
                <p className="text-xs text-gray-500 mt-0.5">Abre nova seção nas notas e notifica os usuários escolhidos</p>
                {choice === 'nova_versao' && (
                  <div className="mt-2.5 flex items-center gap-2">
                    <Tag className="w-4 h-4 text-blue-500 shrink-0" />
                    <input type="text" value={novaVersao}
                      onChange={e => { setNovaVersao(e.target.value); setError(''); }}
                      placeholder="ex: 2.1, 3.0, 2.1 Beta…"
                      className="flex-1 text-sm border border-gray-300 rounded-lg px-3 py-1.5 bg-white text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      autoFocus />
                  </div>
                )}
              </div>
            </label>
          </div>

          {/* Quem notificar */}
          {choice === 'nova_versao' && (
            <div className="space-y-2">
              <div className="flex items-center gap-1.5">
                <Bell className="w-3.5 h-3.5 text-gray-400" />
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Notificar ao entrar no sistema</p>
              </div>
              <div className="flex gap-2 flex-wrap">
                {ROLES_DISPONIVEIS.map(role => {
                  const ativo = rolesNotificados.includes(role.value);
                  return (
                    <button key={role.value} type="button" onClick={() => toggleRole(role.value)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium border-2 transition-all ${
                        ativo ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-200 text-gray-500 hover:border-gray-300'
                      }`}>
                      {ativo ? '✓ ' : ''}{role.label}
                    </button>
                  );
                })}
              </div>
              {rolesNotificados.length === 0 && (
                <p className="text-xs text-blue-600">Nenhum grupo selecionado — a versão será lançada sem notificação.</p>
              )}
            </div>
          )}

          {/* Mensagem editável */}
          <div className="space-y-1.5">
            <div className="flex items-center gap-1.5">
              <Pencil className="w-3.5 h-3.5 text-gray-400" />
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Como aparecerá nas notas</p>
            </div>
            <textarea value={mensagem} onChange={e => { setMensagem(e.target.value); setError(''); }} rows={3}
              placeholder="Descrição do que foi feito neste commit…"
              className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2.5 bg-white text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none leading-relaxed" />
            {mensagem.trim() && (
              <p className="text-xs text-gray-400 pl-1">
                Preview: <span className="text-gray-600"><strong>{data}</strong> — {mensagem.trim()}</span>
              </p>
            )}
          </div>

          {error && <p className="text-xs text-red-600">{error}</p>}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-200 flex items-center justify-between gap-3">
          <button
            onClick={async () => { setIgnoring(true); try { await onIgnore(); } catch { setIgnoring(false); } }}
            disabled={ignoring || loading}
            className="flex items-center gap-1.5 px-3 py-2 text-sm text-red-500 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-60"
          >
            {ignoring ? <div className="w-3.5 h-3.5 border-2 border-red-400/30 border-t-red-400 rounded-full animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
            Ignorar alterações
          </button>
          <div className="flex gap-3">
            <button onClick={onClose} disabled={ignoring || loading}
              className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-60">
              Depois
            </button>
            <button onClick={handleConfirm} disabled={loading || ignoring}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors disabled:opacity-60">
              {loading ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Check className="w-4 h-4" />}
              Salvar nas notas
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CommitVersionModal;
