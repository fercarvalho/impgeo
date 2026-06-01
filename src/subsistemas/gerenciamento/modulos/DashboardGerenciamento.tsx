import { useEffect, useState } from 'react';
import {
  FolderOpen,
  Briefcase,
  Users,
  TrendingUp,
  Activity,
  CheckCircle2,
  PauseCircle,
  AlertCircle,
} from 'lucide-react';
import PendingTasksBanner from './_pm/PendingTasksBanner';

const API_BASE_URL = '/api';

// Tipos mínimos — qualquer ampliação fica para os próprios módulos detalhados.
interface Project {
  id: string;
  name?: string;
  status?: 'ativo' | 'pausado' | 'concluido' | string;
  value?: number;
  client?: string;
  endDate?: string;
}
interface Service {
  id: string;
  name?: string;
  status?: 'ativo' | 'inativo' | string;
  price?: number;
}
interface Client {
  id: string;
  name?: string;
  email?: string;
  createdAt?: string;
}

interface CountCard {
  label: string;
  value: number | string;
  hint?: string;
  icon: React.ElementType;
  tone: 'violet' | 'emerald' | 'sky' | 'amber';
}

const TONE_CLASSES: Record<CountCard['tone'], { iconBg: string; iconText: string; accent: string }> = {
  violet:  { iconBg: 'bg-violet-50 dark:bg-violet-900/30',   iconText: 'text-violet-700 dark:text-violet-300',   accent: 'border-l-violet-500' },
  emerald: { iconBg: 'bg-emerald-50 dark:bg-emerald-900/30', iconText: 'text-emerald-700 dark:text-emerald-300', accent: 'border-l-emerald-500' },
  sky:     { iconBg: 'bg-sky-50 dark:bg-sky-900/30',         iconText: 'text-sky-700 dark:text-sky-300',         accent: 'border-l-sky-500' },
  amber:   { iconBg: 'bg-amber-50 dark:bg-amber-900/30',     iconText: 'text-amber-700 dark:text-amber-300',     accent: 'border-l-amber-500' },
};

export default function DashboardGerenciamento() {
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [services, setServices] = useState<Service[] | null>(null);
  const [clients, setClients]   = useState<Client[] | null>(null);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    Promise.all([
      fetch(`${API_BASE_URL}/projects`).then(r => r.ok ? r.json() : []).catch(() => []),
      fetch(`${API_BASE_URL}/services`).then(r => r.ok ? r.json() : []).catch(() => []),
      fetch(`${API_BASE_URL}/clients`).then(r => r.ok ? r.json() : []).catch(() => []),
    ])
      .then(([p, s, c]) => {
        if (cancelled) return;
        setProjects(Array.isArray(p) ? p : []);
        setServices(Array.isArray(s) ? s : []);
        setClients(Array.isArray(c) ? c : []);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e?.message || 'Falha ao carregar dados do gerenciamento');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, []);

  const totalProjects = projects?.length ?? 0;
  const projetosAtivos    = projects?.filter(p => p.status === 'ativo').length ?? 0;
  const projetosPausados  = projects?.filter(p => p.status === 'pausado').length ?? 0;
  const projetosConcluidos = projects?.filter(p => p.status === 'concluido').length ?? 0;

  const totalServices = services?.length ?? 0;
  const servicosAtivos = services?.filter(s => s.status !== 'inativo').length ?? 0;

  const totalClients = clients?.length ?? 0;
  const clientesNovosMes = clients?.filter(c => {
    if (!c.createdAt) return false;
    const created = new Date(c.createdAt);
    const ago30 = new Date();
    ago30.setDate(ago30.getDate() - 30);
    return created >= ago30;
  }).length ?? 0;

  const taxaConclusao = totalProjects > 0
    ? Math.round((projetosConcluidos / totalProjects) * 100)
    : 0;

  const cards: CountCard[] = [
    { label: 'Projetos',  value: totalProjects, hint: `${projetosAtivos} ativo${projetosAtivos === 1 ? '' : 's'}`, icon: FolderOpen, tone: 'violet'  },
    { label: 'Serviços',  value: totalServices, hint: `${servicosAtivos} ativo${servicosAtivos === 1 ? '' : 's'}`, icon: Briefcase,  tone: 'sky'     },
    { label: 'Clientes',  value: totalClients,  hint: clientesNovosMes > 0 ? `+${clientesNovosMes} no último mês` : 'sem novos no último mês', icon: Users, tone: 'emerald' },
    { label: 'Conclusão', value: `${taxaConclusao}%`, hint: `${projetosConcluidos} de ${totalProjects} projetos`,  icon: TrendingUp, tone: 'amber' },
  ];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <header className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-1">
          Dashboard de Gerenciamento
        </h1>
        <p className="text-sm text-gray-600 dark:text-gray-400">
          Visão consolidada da operação: projetos, serviços e clientes em um só lugar.
        </p>
      </header>

      <div className="mb-6">
        <PendingTasksBanner />
      </div>

      {error && (
        <div className="mb-6 p-4 rounded-lg border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-900/20 text-sm text-red-700 dark:text-red-300 flex items-start gap-2">
          <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {/* Cards de contagem */}
      <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {cards.map((card) => {
          const tone = TONE_CLASSES[card.tone];
          const Icon = card.icon;
          return (
            <li
              key={card.label}
              className={`bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 border-l-4 ${tone.accent} p-5`}
            >
              <div className="flex items-start justify-between mb-3">
                <span className="text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                  {card.label}
                </span>
                <div className={`flex-shrink-0 w-9 h-9 rounded-md flex items-center justify-center ${tone.iconBg} ${tone.iconText}`}>
                  <Icon className="h-5 w-5" aria-hidden="true" />
                </div>
              </div>
              <div className="text-3xl font-bold text-gray-900 dark:text-gray-100 leading-none mb-1">
                {loading ? <span className="inline-block w-12 h-8 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" /> : card.value}
              </div>
              <div className="text-xs text-gray-500 dark:text-gray-400">
                {loading ? <span className="inline-block w-24 h-3 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" /> : card.hint}
              </div>
            </li>
          );
        })}
      </ul>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Projetos por status */}
        <section className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-5">
          <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-2">
            <Activity className="h-4 w-4 text-violet-600" />
            Projetos por status
          </h2>
          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3].map(i => (
                <div key={i} className="h-10 bg-gray-100 dark:bg-gray-700 rounded animate-pulse" />
              ))}
            </div>
          ) : totalProjects === 0 ? (
            <p className="text-sm text-gray-500 dark:text-gray-400 py-6 text-center">
              Nenhum projeto cadastrado ainda.
            </p>
          ) : (
            <ul className="space-y-3">
              <StatusRow icon={CheckCircle2} label="Ativos"     count={projetosAtivos}     total={totalProjects} tone="emerald" />
              <StatusRow icon={PauseCircle}  label="Pausados"   count={projetosPausados}   total={totalProjects} tone="amber" />
              <StatusRow icon={CheckCircle2} label="Concluídos" count={projetosConcluidos} total={totalProjects} tone="sky" />
            </ul>
          )}
        </section>

        {/* Últimos clientes */}
        <section className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-5">
          <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-2">
            <Users className="h-4 w-4 text-emerald-600" />
            Clientes mais recentes
          </h2>
          {loading ? (
            <div className="space-y-2">
              {[1, 2, 3, 4].map(i => (
                <div key={i} className="h-8 bg-gray-100 dark:bg-gray-700 rounded animate-pulse" />
              ))}
            </div>
          ) : totalClients === 0 ? (
            <p className="text-sm text-gray-500 dark:text-gray-400 py-6 text-center">
              Nenhum cliente cadastrado ainda.
            </p>
          ) : (
            <ul className="divide-y divide-gray-100 dark:divide-gray-700">
              {[...(clients ?? [])]
                .sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''))
                .slice(0, 5)
                .map(c => (
                  <li key={c.id} className="py-2 flex items-center justify-between text-sm">
                    <span className="text-gray-900 dark:text-gray-100 truncate font-medium">
                      {c.name || 'Cliente sem nome'}
                    </span>
                    <span className="text-xs text-gray-500 dark:text-gray-400 ml-2 flex-shrink-0">
                      {c.email || '—'}
                    </span>
                  </li>
                ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

function StatusRow({ icon: Icon, label, count, total, tone }: {
  icon: React.ElementType;
  label: string;
  count: number;
  total: number;
  tone: 'emerald' | 'amber' | 'sky';
}) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  const toneMap = {
    emerald: { text: 'text-emerald-700 dark:text-emerald-300', bar: 'bg-emerald-500' },
    amber:   { text: 'text-amber-700 dark:text-amber-300',     bar: 'bg-amber-500' },
    sky:     { text: 'text-sky-700 dark:text-sky-300',         bar: 'bg-sky-500' },
  }[tone];

  return (
    <li>
      <div className="flex items-center justify-between text-sm mb-1">
        <span className={`flex items-center gap-2 ${toneMap.text}`}>
          <Icon className="h-4 w-4" />
          {label}
        </span>
        <span className="text-gray-900 dark:text-gray-100 font-medium">
          {count} <span className="text-xs text-gray-500 dark:text-gray-400">({pct}%)</span>
        </span>
      </div>
      <div className="h-1.5 bg-gray-100 dark:bg-gray-700 rounded overflow-hidden">
        <div className={`h-full ${toneMap.bar} transition-all`} style={{ width: `${pct}%` }} />
      </div>
    </li>
  );
}
