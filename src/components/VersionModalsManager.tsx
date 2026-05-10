import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import CommitVersionModal from '@/components/CommitVersionModal';
import VersaoNovaModal from '@/components/VersaoNovaModal';

const isLocalEnv =
  typeof window !== 'undefined' &&
  (window.location.hostname === 'localhost' ||
    window.location.hostname === '127.0.0.1' ||
    window.location.hostname === '0.0.0.0');

const API_BASE_URL: string = isLocalEnv
  ? 'http://localhost:9001/api'
  : ((import.meta.env.VITE_API_URL as string | undefined) ?? '/api');

interface CommitItem {
  commitHash: string;
  mensagem: string;
  data: string;
}

interface CommitsPendentes {
  versaoAtual: string;
  commits: CommitItem[];
  manterSessionId: number;
}

interface VersaoNova {
  versao: string;
  texto: string;
  tipo?: 'versao' | 'aviso';
  versaoReferencia?: string;
}

/**
 * Gerencia os dois modais relacionados a versionamento do sistema:
 *
 *   1. CommitVersionModal — exibido para superadmin quando há commits do
 *      git ainda não confirmados/notificados. Carrossel cresce conforme
 *      a quantidade de commits pendentes.
 *
 *   2. VersaoNovaModal — exibido para usuários não-superadmin quando há
 *      versões novas que o superadmin acabou de publicar e que ainda não
 *      foram vistas por aquele usuário.
 *
 * Antes da fase 1, esses dois modais viviam dentro de AppMain — o que fazia
 * com que NÃO disparassem no SubsystemPicker (primeira tela pós-login agora).
 * Movidos para fora do AppMain a partir da fase 1.9+ para que apareçam logo
 * que houver usuário logado, independente da tela em que ele está (Picker,
 * AcessoNegado ou um subsistema).
 */
export default function VersionModalsManager() {
  const { user, token } = useAuth();
  const [commitsPendentes, setCommitsPendentes] = useState<CommitsPendentes | null>(null);
  const [versoesNovas, setVersoesNovas] = useState<VersaoNova[] | null>(null);

  // Commits pendentes (superadmin) — carrossel
  useEffect(() => {
    if (!user || user.role !== 'superadmin') return;
    let cancelled = false;

    const checkCommits = async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/admin/rodape/commits-pendentes`);
        if (!res.ok || cancelled) return;
        const json = await res.json();
        if (json.success && Array.isArray(json.data?.commits) && json.data.commits.length > 0 && !cancelled) {
          setCommitsPendentes({
            versaoAtual: json.data.versaoAtual || '',
            commits: json.data.commits.map((c: { commitHash: string; mensagem?: string; data?: string }) => ({
              commitHash: c.commitHash,
              mensagem: c.mensagem || '',
              data: c.data || '',
            })),
            manterSessionId: Date.now(),
          });
        }
      } catch {
        // silently ignore
      }
    };

    checkCommits();
    return () => { cancelled = true; };
  }, [user?.id, user?.role]);

  // Notificação de nova versão (admin/user/guest)
  useEffect(() => {
    if (!user || user.role === 'superadmin') return;
    let cancelled = false;

    const checkVersao = async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/notificacao-versao`);
        if (!res.ok || cancelled) return;
        const json = await res.json();
        if (json.success && json.data?.notificar && Array.isArray(json.data.versoes) && json.data.versoes.length > 0 && !cancelled) {
          setVersoesNovas(json.data.versoes.map((v: { versao: string; texto?: string; tipo?: string; versaoReferencia?: string }) => ({
            versao: v.versao,
            texto: v.texto || '',
            tipo: v.tipo === 'aviso' ? 'aviso' : 'versao',
            versaoReferencia: v.versaoReferencia || v.versao,
          })));
        }
      } catch {
        // silently ignore
      }
    };

    checkVersao();
    return () => { cancelled = true; };
  }, [user?.id, user?.role]);

  return (
    <>
      {commitsPendentes && commitsPendentes.commits.length > 0 && (
        <CommitVersionModal
          commits={commitsPendentes.commits}
          versaoAtual={commitsPendentes.versaoAtual}
          onClose={() => setCommitsPendentes(null)}
          onProcess={async ({ commitHash, action, novaVersao, mensagem, data, rolesNotificados }) => {
            const res = await fetch(`${API_BASE_URL}/admin/rodape/confirmar-commit`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                ...(token ? { Authorization: `Bearer ${token}` } : {}),
              },
              body: JSON.stringify({
                action,
                novaVersao,
                commitHash,
                mensagem,
                data,
                rolesNotificados,
                manterSessionId: commitsPendentes.manterSessionId,
              }),
            });
            if (!res.ok) throw new Error('Falha na requisição');
            window.dispatchEvent(new Event('rodape-updated'));
          }}
        />
      )}

      {versoesNovas && versoesNovas.length > 0 && (
        <VersaoNovaModal
          versoes={versoesNovas}
          onConfirm={async (versao) => {
            try {
              await fetch(`${API_BASE_URL}/notificacao-versao/vista`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  ...(token ? { Authorization: `Bearer ${token}` } : {}),
                },
                body: JSON.stringify({ versao }),
              });
            } catch {
              // silently ignore
            }
          }}
          onClose={() => setVersoesNovas(null)}
        />
      )}
    </>
  );
}
