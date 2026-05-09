// Manifesto de subsistemas — fase 1.4 (subsistemas).
//
// Espelha a tabela `subsystems` do banco e a coluna `subsystem_key` em
// `modules_catalog`. Toda mudança aqui precisa ser refletida na migração SQL
// (ver server/migrations/016-SUBSISTEMAS.sql) e no seed do backend
// (server/database-pg.js → getDefaultModulesCatalog()).
//
// O frontend usa este manifesto para:
//   - Detectar o subsistema atual a partir do hostname (subdomínio)
//   - Filtrar os módulos exibidos no header pelos do subsistema atual
//   - Construir URLs de troca de subsistema (Picker, dropdown trocar-subsistema)

export interface SubsystemDefinition {
  key: string;          // chave canônica (igual a subsystems.subsystem_key no banco)
  slug: string;         // segmento de subdomínio (ex.: 'financeiro' → financeiro.impgeo.local)
  name: string;         // nome exibido na UI
  description: string;  // descrição curta para cards do Picker
  iconName: string;     // ícone Lucide React
  moduleKeys: string[]; // chaves dos módulos que pertencem a este subsistema
}

export const SUBSYSTEMS: ReadonlyArray<SubsystemDefinition> = [
  {
    key: 'admin',
    slug: 'admin',
    name: 'Admin',
    description: 'Administração do sistema, sessões, anomalias e alertas',
    iconName: 'ShieldCheck',
    moduleKeys: ['admin', 'sessions', 'anomalies', 'security_alerts'],
  },
  {
    key: 'gestao',
    slug: 'gestao',
    name: 'Gestão',
    description: 'Roadmap, documentação e perguntas frequentes',
    iconName: 'BookOpen',
    moduleKeys: ['roadmap', 'documentacao', 'faq'],
  },
  {
    key: 'financeiro',
    slug: 'financeiro',
    name: 'Financeiro',
    description: 'Dashboard, metas, relatórios, projeção, transações, DRE',
    iconName: 'DollarSign',
    moduleKeys: ['dashboard_financeiro', 'metas_financeiro', 'relatorios_financeiro', 'projecao', 'transactions', 'dre'],
  },
  {
    key: 'gerenciamento',
    slug: 'gerenciamento',
    name: 'Gerenciamento',
    description: 'Projetos, serviços, clientes e indicadores operacionais',
    iconName: 'Workflow',
    moduleKeys: ['dashboard_gerenciamento', 'metas_gerenciamento', 'projecao_gerenciamento', 'relatorios_gerenciamento', 'projects', 'services', 'clients'],
  },
  {
    key: 'especial',
    slug: 'especial',
    name: 'Módulos Extras',
    description: 'Acompanhamentos e demais módulos não-temáticos',
    iconName: 'Sparkles',
    moduleKeys: ['acompanhamentos'],
  },
];

const SUBDOMAIN_HOST_REGEXES = [
  /^([a-z0-9-]+)\.impgeo\.local$/,
  /^([a-z0-9-]+)\.impgeo\.sistemas\.viverdepj\.com\.br$/,
];

const ROOT_HOSTNAMES = new Set([
  'localhost',
  '127.0.0.1',
  '0.0.0.0',
  'impgeo.local',
  'impgeo.sistemas.viverdepj.com.br',
]);

// Chave usada como fallback de "subsistema selecionado" em ambientes que não
// suportam subdomínios (ex.: dev em localhost puro). O Picker grava aqui e o
// resto do app lê — funciona como sub-roteador in-memory por aba do navegador.
const SUBSYSTEM_OVERRIDE_KEY = 'currentSubsystemSlug';

export function detectSubsystemFromHostname(hostname: string): SubsystemDefinition | null {
  if (ROOT_HOSTNAMES.has(hostname)) return null;
  for (const regex of SUBDOMAIN_HOST_REGEXES) {
    const m = hostname.match(regex);
    if (m) return getSubsystemBySlug(m[1]);
  }
  return null;
}

export function getSubsystemBySlug(slug: string | null | undefined): SubsystemDefinition | null {
  if (!slug) return null;
  return SUBSYSTEMS.find(s => s.slug === slug) ?? null;
}

// Resolve o subsistema atual considerando ambas as fontes:
//   1. hostname (subdomínio real, prioritário em prod e em dev com /etc/hosts)
//   2. sessionStorage (fallback para localhost puro — Picker grava aqui)
export function resolveCurrentSubsystem(): SubsystemDefinition | null {
  if (typeof window === 'undefined') return null;
  const fromHost = detectSubsystemFromHostname(window.location.hostname);
  if (fromHost) return fromHost;
  try {
    const stored = sessionStorage.getItem(SUBSYSTEM_OVERRIDE_KEY);
    return getSubsystemBySlug(stored);
  } catch {
    return null;
  }
}

// `true` se o ambiente atual permite navegação por subdomínio. Em localhost
// puro (sem entry no /etc/hosts), redirecionamos não fazem sentido — usamos
// sessionStorage como sub-roteador.
export function supportsSubdomainNavigation(hostname: string = window.location.hostname): boolean {
  return hostname.endsWith('.impgeo.local')
    || hostname === 'impgeo.local'
    || hostname.endsWith('.impgeo.sistemas.viverdepj.com.br')
    || hostname === 'impgeo.sistemas.viverdepj.com.br';
}

// Constrói a URL para entrar num subsistema. Em ambiente que suporta
// subdomínio: redireciona para o subdomínio correto. Caso contrário (localhost
// puro): retorna a URL atual e o caller deve gravar o slug no sessionStorage.
export function buildSubsystemUrl(slug: string, location: Location = window.location): string {
  const protocol = location.protocol;
  const port = location.port ? `:${location.port}` : '';
  const hostname = location.hostname;

  if (hostname.endsWith('.impgeo.local') || hostname === 'impgeo.local') {
    return `${protocol}//${slug}.impgeo.local${port}`;
  }
  if (hostname.endsWith('.impgeo.sistemas.viverdepj.com.br') || hostname === 'impgeo.sistemas.viverdepj.com.br') {
    return `${protocol}//${slug}.impgeo.sistemas.viverdepj.com.br`;
  }
  // localhost puro etc. — sem mudança de URL
  return `${protocol}//${hostname}${port}`;
}

// URL do domínio raiz (onde fica o SubsystemPicker).
export function getRootUrl(location: Location = window.location): string {
  const protocol = location.protocol;
  const port = location.port ? `:${location.port}` : '';
  const hostname = location.hostname;

  if (hostname.endsWith('.impgeo.local') || hostname === 'impgeo.local') {
    return `${protocol}//impgeo.local${port}`;
  }
  if (hostname.endsWith('.impgeo.sistemas.viverdepj.com.br') || hostname === 'impgeo.sistemas.viverdepj.com.br') {
    return `${protocol}//impgeo.sistemas.viverdepj.com.br`;
  }
  return `${protocol}//${hostname}${port}`;
}

// Salva o slug do subsistema escolhido em sessionStorage e força re-render
// (útil em localhost onde redirecionamento não é viável).
export function setSubsystemOverride(slug: string | null): void {
  try {
    if (slug) sessionStorage.setItem(SUBSYSTEM_OVERRIDE_KEY, slug);
    else      sessionStorage.removeItem(SUBSYSTEM_OVERRIDE_KEY);
  } catch {
    // sessionStorage indisponível — nada a fazer
  }
}

export function clearSubsystemOverride(): void {
  setSubsystemOverride(null);
}
