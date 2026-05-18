import React, { useState, useEffect } from 'react';
import { GitCommit, Tag, X, Check, Pencil, Bell, Trash2, ChevronLeft, ChevronRight } from 'lucide-react';
import Modal from './Modal';

const ROLES_DISPONIVEIS = [
  { value: 'admin', label: 'Administradores' },
  { value: 'user',  label: 'Usuários' },
  { value: 'guest', label: 'Convidados' },
];

export interface CommitItem {
  commitHash: string;
  mensagem: string;
  data: string;
}

interface ProcessParams {
  commitHash: string;
  action: 'manter' | 'nova_versao' | 'ignorar';
  novaVersao?: string;
  mensagem: string;
  data: string;
  rolesNotificados: string[];
}

interface Props {
  commits: CommitItem[];
  versaoAtual: string;
  onProcess: (params: ProcessParams) => Promise<void>;
  onClose: () => void;
}

const CommitVersionModal: React.FC<Props> = ({ commits, versaoAtual, onProcess, onClose }) => {
  const [pendentes, setPendentes] = useState<CommitItem[]>(commits);
  const [index, setIndex] = useState(0);

  const [choice, setChoice] = useState<'manter' | 'nova_versao'>('manter');
  const [novaVersao, setNovaVersao] = useState('');
  const [mensagem, setMensagem] = useState('');
  const [rolesNotificados, setRolesNotificados] = useState<string[]>(['admin', 'user', 'guest']);
  const [loading, setLoading] = useState(false);
  const [ignoring, setIgnoring] = useState(false);
  const [error, setError] = useState('');
  // Versão "iniciada" durante esta sessão de carrossel — fica sticky e pré-seleciona
  // os próximos commits para a mesma versão (sem precisar redigitar)
  const [versaoIniciada, setVersaoIniciada] = useState<string | null>(null);

  // Sincroniza pendentes quando a prop commits mudar (ex: novos commits detectados)
  useEffect(() => {
    setPendentes(commits);
    setIndex(0);
  }, [commits]);

  const atual = pendentes[index];
  const total = pendentes.length;

  // Reseta o formulário quando o commit atual muda.
  // Se já houve uma "nova versão" iniciada nesta sessão, pré-seleciona a opção
  // e mantém o número da versão preenchido para os commits seguintes.
  useEffect(() => {
    if (!atual) return;
    if (versaoIniciada) {
      setChoice('nova_versao');
      setNovaVersao(versaoIniciada);
    } else {
      setChoice('manter');
      setNovaVersao('');
    }
    setMensagem(atual.mensagem);
    setRolesNotificados(['admin', 'user', 'guest']);
    setError('');
    setLoading(false);
    setIgnoring(false);
  }, [atual?.commitHash, versaoIniciada]);

  // Bug 1: se commits esvaziou externamente sem passar por avancarOuFechar, avisa o pai
  useEffect(() => {
    if (pendentes.length === 0) onClose();
  }, [pendentes.length, onClose]);

  if (!atual) return null;

  const toggleRole = (role: string) => {
    setRolesNotificados(prev =>
      prev.includes(role) ? prev.filter(r => r !== role) : [...prev, role]
    );
  };

  const avancarOuFechar = () => {
    const novas = pendentes.filter((_, i) => i !== index);
    if (novas.length === 0) {
      onClose();
      return;
    }
    setPendentes(novas);
    setIndex(i => Math.min(i, novas.length - 1));
  };

  const handleConfirm = async () => {
    if (choice === 'nova_versao' && !novaVersao.trim()) { setError('Informe o número/nome da nova versão.'); return; }
    if (!mensagem.trim()) { setError('A mensagem não pode ficar em branco.'); return; }
    setError('');
    setLoading(true);
    try {
      const versaoParaEnviar = choice === 'nova_versao' ? novaVersao.trim() : undefined;
      await onProcess({
        commitHash: atual.commitHash,
        action: choice,
        novaVersao: versaoParaEnviar,
        mensagem: mensagem.trim(),
        data: atual.data,
        rolesNotificados,
      });
      // Sticky: a partir de agora os próximos commits assumem essa nova versão
      if (choice === 'nova_versao' && versaoParaEnviar) {
        setVersaoIniciada(versaoParaEnviar);
      }
      avancarOuFechar();
    } catch (err) {
      console.error('Erro ao confirmar commit:', err);
      setError('Erro ao confirmar. Tente novamente.');
      setLoading(false);
    }
  };

  const handleIgnore = async () => {
    setIgnoring(true);
    try {
      await onProcess({
        commitHash: atual.commitHash,
        action: 'ignorar',
        mensagem: '',
        data: atual.data,
        rolesNotificados: [],
      });
      avancarOuFechar();
    } catch (err) {
      console.error('Erro ao ignorar commit:', err);
      setError('Erro ao ignorar. Tente novamente.');
      setIgnoring(false);
    }
  };

  const irPara = (delta: number) => {
    setIndex(i => Math.max(0, Math.min(total - 1, i + delta)));
  };

  return (
    <Modal
      isOpen={true}
      onClose={onClose}
      ariaLabelledBy="commit-modal-title"
      backdropClassName="!items-start !justify-center !pt-16 !py-0"
    >
      <div
        className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-lg my-4 max-h-[calc(100vh-6rem)] flex flex-col overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 bg-gradient-to-r from-blue-500 to-indigo-600">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-white/20 rounded-lg">
              <GitCommit className="w-5 h-5 text-white" aria-hidden="true" />
            </div>
            <div>
              <h2 id="commit-modal-title" className="text-base font-semibold text-white">
                {total > 1 ? `Commits pendentes (${index + 1} de ${total})` : 'Novo commit detectado'}
              </h2>
              <p className="text-xs text-white/70 font-mono">{atual.commitHash.slice(0, 7)} · {atual.data}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-white/80 hover:text-white hover:bg-white/20 transition-all duration-200"
            aria-label="Fechar modal"
            disabled={loading || ignoring}
          >
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-5 overflow-y-auto flex-1">

          {/* Versão */}
          <div className="space-y-2">
            <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Versão</p>

            <label className={`flex items-center gap-3 p-3 rounded-lg border-2 cursor-pointer transition-all ${
              choice === 'manter'
                ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/30'
                : 'border-gray-200 dark:border-gray-600 hover:border-gray-300 dark:hover:border-gray-500'
            }`}>
              <input type="radio" name="versao-choice" value="manter" checked={choice === 'manter'}
                onChange={() => { setChoice('manter'); setError(''); }} className="accent-blue-600" />
              <div>
                <p className="text-sm font-medium text-gray-800 dark:text-gray-100">Manter versão {versaoAtual}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">O commit fica registrado na versão atual e os usuários selecionados são notificados</p>
              </div>
            </label>

            <label className={`flex items-start gap-3 p-3 rounded-lg border-2 cursor-pointer transition-all ${
              choice === 'nova_versao'
                ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/30'
                : 'border-gray-200 dark:border-gray-600 hover:border-gray-300 dark:hover:border-gray-500'
            }`}>
              <input type="radio" name="versao-choice" value="nova_versao" checked={choice === 'nova_versao'}
                onChange={() => { setChoice('nova_versao'); setError(''); }} className="accent-blue-600 mt-0.5" />
              <div className="flex-1">
                <p className="text-sm font-medium text-gray-800 dark:text-gray-100">Iniciar nova versão</p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Abre nova seção nas notas e notifica os usuários escolhidos</p>
                {choice === 'nova_versao' && (
                  <div className="mt-2.5 flex items-center gap-2">
                    <Tag className="w-4 h-4 text-blue-500 shrink-0" aria-hidden="true" />
                    <input type="text" value={novaVersao}
                      onChange={e => { setNovaVersao(e.target.value); setError(''); }}
                      placeholder="ex: 2.1, 3.0, 2.1 Beta…"
                      aria-label="Número ou nome da nova versão"
                      className="flex-1 text-sm border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-1.5 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      autoFocus />
                  </div>
                )}
              </div>
            </label>
          </div>

          {/* Quem notificar */}
          <div className="space-y-2">
            <div className="flex items-center gap-1.5">
              <Bell className="w-3.5 h-3.5 text-gray-400" aria-hidden="true" />
              <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Notificar ao entrar no sistema</p>
            </div>
            <div className="flex gap-2 flex-wrap">
              {ROLES_DISPONIVEIS.map(role => {
                const ativo = rolesNotificados.includes(role.value);
                return (
                  <button key={role.value} type="button" onClick={() => toggleRole(role.value)}
                    aria-pressed={ativo}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium border-2 transition-all ${
                      ativo
                        ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                        : 'border-gray-200 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:border-gray-300 dark:hover:border-gray-500'
                    }`}>
                    {ativo ? '✓ ' : ''}{role.label}
                  </button>
                );
              })}
            </div>
            {rolesNotificados.length === 0 && (
              <p className="text-xs text-blue-600 dark:text-blue-400">Nenhum grupo selecionado — a alteração será salva sem notificação.</p>
            )}
          </div>

          {/* Mensagem editável */}
          <div className="space-y-1.5">
            <div className="flex items-center gap-1.5">
              <Pencil className="w-3.5 h-3.5 text-gray-400" aria-hidden="true" />
              <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Como aparecerá nas notas</p>
            </div>
            <textarea value={mensagem} onChange={e => { setMensagem(e.target.value); setError(''); }} rows={3}
              placeholder="Descrição do que foi feito neste commit…"
              aria-label="Como aparecerá nas notas"
              className="w-full text-sm border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2.5 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none leading-relaxed" />
            {mensagem.trim() && (
              <p className="text-xs text-gray-400 dark:text-gray-500 pl-1">
                Preview: <span className="text-gray-600 dark:text-gray-300"><strong>{atual.data}</strong> — {mensagem.trim()}</span>
              </p>
            )}
          </div>

          {error && (
            <p className="text-xs text-red-600 dark:text-red-400" role="alert">{error}</p>
          )}

          {/* Indicador de carrossel */}
          {total > 1 && (
            <div className="flex items-center justify-center gap-2 pt-2">
              {pendentes.map((p, i) => (
                <span
                  key={p.commitHash}
                  className={`h-1.5 rounded-full transition-all ${i === index ? 'w-6 bg-blue-600' : 'w-1.5 bg-gray-300 dark:bg-gray-600'}`}
                />
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-700 flex items-center justify-between gap-3">
          <button
            onClick={handleIgnore}
            disabled={ignoring || loading}
            className="flex items-center gap-1.5 px-3 py-2 text-sm text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors disabled:opacity-60"
          >
            {ignoring
              ? <div role="status" className="w-3.5 h-3.5 border-2 border-red-400/30 border-t-red-400 rounded-full animate-spin" aria-label="Ignorando..." />
              : <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
            }
            Ignorar alterações
          </button>
          <div className="flex items-center gap-2">
            {total > 1 && (
              <>
                <button
                  onClick={() => irPara(-1)}
                  disabled={index === 0 || loading || ignoring}
                  className="p-2 rounded-lg text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  aria-label="Anterior"
                >
                  <ChevronLeft className="w-4 h-4" aria-hidden="true" />
                </button>
                <button
                  onClick={() => irPara(1)}
                  disabled={index === total - 1 || loading || ignoring}
                  className="p-2 rounded-lg text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  aria-label="Próximo"
                >
                  <ChevronRight className="w-4 h-4" aria-hidden="true" />
                </button>
              </>
            )}
            <button
              onClick={handleConfirm}
              disabled={loading || ignoring}
              aria-busy={loading}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors disabled:opacity-60"
            >
              {loading
                ? <div role="status" className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" aria-label="Salvando..." />
                : <Check className="w-4 h-4" aria-hidden="true" />
              }
              Salvar nas notas
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
};

export default CommitVersionModal;
