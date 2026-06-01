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

// Paleta de cor por subsistema. Usada no Picker (cards) e potencialmente em
// um destaque no header de cada subsistema (fase 1.6). Os tons são strings
// fixas porque o Tailwind precisa ver as classes literais para gerá-las no
// build — concatenação dinâmica não funciona.
export interface SubsystemPalette {
  // Borda à esquerda do card / faixa de identidade do subsistema
  accentBorder: string;     // ex.: 'border-l-blue-500'
  // Fundo do ícone no card (quadrado colorido)
  iconBg: string;           // ex.: 'bg-blue-50 dark:bg-blue-900/30'
  // Cor do ícone
  iconText: string;         // ex.: 'text-blue-700 dark:text-blue-300'
  // Hover do card (borda e ring)
  hoverBorder: string;      // ex.: 'hover:border-blue-400'
  hoverRing: string;        // ex.: 'hover:ring-blue-100 dark:hover:ring-blue-900/40'
  // Estado "está entrando" — borda e ring sólidos
  activeBorder: string;     // ex.: 'border-blue-500'
  activeRing: string;       // ex.: 'ring-2 ring-blue-200 dark:ring-blue-800'
}

export interface SubsystemDefinition {
  key: string;          // chave canônica (igual a subsystems.subsystem_key no banco)
  slug: string;         // segmento de subdomínio (ex.: 'financeiro' → financeiro.impgeo.local)
  name: string;         // nome exibido na UI
  description: string;  // descrição curta para cards do Picker
  iconName: string;     // ícone Lucide React
  moduleKeys: string[]; // chaves dos módulos que pertencem a este subsistema
  palette: SubsystemPalette;
}

// Tailwind JIT só gera classes que aparecem LITERALMENTE no código.
// Strings montadas com template literal (`bg-${tone}-50`) seriam purgadas.
// Por isso cada paleta é um objeto com classes inteiras escritas à mão.
const PALETTES = {
  rose: {
    accentBorder: 'border-l-rose-500',
    iconBg:       'bg-rose-50 dark:bg-rose-900/30',
    iconText:     'text-rose-700 dark:text-rose-300',
    hoverBorder:  'hover:border-rose-400',
    hoverRing:    'hover:ring-rose-100 dark:hover:ring-rose-900/40',
    activeBorder: 'border-rose-500',
    activeRing:   'ring-2 ring-rose-200 dark:ring-rose-800',
  },
  sky: {
    accentBorder: 'border-l-sky-500',
    iconBg:       'bg-sky-50 dark:bg-sky-900/30',
    iconText:     'text-sky-700 dark:text-sky-300',
    hoverBorder:  'hover:border-sky-400',
    hoverRing:    'hover:ring-sky-100 dark:hover:ring-sky-900/40',
    activeBorder: 'border-sky-500',
    activeRing:   'ring-2 ring-sky-200 dark:ring-sky-800',
  },
  emerald: {
    accentBorder: 'border-l-emerald-500',
    iconBg:       'bg-emerald-50 dark:bg-emerald-900/30',
    iconText:     'text-emerald-700 dark:text-emerald-300',
    hoverBorder:  'hover:border-emerald-400',
    hoverRing:    'hover:ring-emerald-100 dark:hover:ring-emerald-900/40',
    activeBorder: 'border-emerald-500',
    activeRing:   'ring-2 ring-emerald-200 dark:ring-emerald-800',
  },
  violet: {
    accentBorder: 'border-l-violet-500',
    iconBg:       'bg-violet-50 dark:bg-violet-900/30',
    iconText:     'text-violet-700 dark:text-violet-300',
    hoverBorder:  'hover:border-violet-400',
    hoverRing:    'hover:ring-violet-100 dark:hover:ring-violet-900/40',
    activeBorder: 'border-violet-500',
    activeRing:   'ring-2 ring-violet-200 dark:ring-violet-800',
  },
  amber: {
    accentBorder: 'border-l-amber-500',
    iconBg:       'bg-amber-50 dark:bg-amber-900/30',
    iconText:     'text-amber-700 dark:text-amber-300',
    hoverBorder:  'hover:border-amber-400',
    hoverRing:    'hover:ring-amber-100 dark:hover:ring-amber-900/40',
    activeBorder: 'border-amber-500',
    activeRing:   'ring-2 ring-amber-200 dark:ring-amber-800',
  },
} as const satisfies Record<string, SubsystemPalette>;

export const SUBSYSTEMS: ReadonlyArray<SubsystemDefinition> = [
  {
    key: 'admin',
    slug: 'admin',
    name: 'Admin',
    description: 'Administração do sistema, sessões, anomalias e alertas de segurança',
    iconName: 'ShieldCheck',
    moduleKeys: ['admin', 'sessions', 'anomalies', 'security_alerts'],
    palette: PALETTES.rose,
  },
  {
    key: 'gestao',
    slug: 'gestao',
    name: 'Gestão',
    description: 'Roadmap do produto, documentação e perguntas frequentes',
    iconName: 'BookOpen',
    moduleKeys: ['roadmap', 'documentacao', 'faq'],
    palette: PALETTES.sky,
  },
  {
    key: 'financeiro',
    slug: 'financeiro',
    name: 'Financeiro',
    description: 'Dashboard, metas, relatórios, projeção, transações e DRE',
    iconName: 'DollarSign',
    moduleKeys: ['dashboard_financeiro', 'metas_financeiro', 'relatorios_financeiro', 'projecao', 'transactions', 'dre'],
    palette: PALETTES.emerald,
  },
  {
    key: 'gerenciamento',
    slug: 'gerenciamento',
    name: 'Gerenciamento',
    description: 'Projetos, serviços, clientes e indicadores operacionais',
    iconName: 'Workflow',
    moduleKeys: ['dashboard_gerenciamento', 'metas_gerenciamento', 'projecao_gerenciamento', 'relatorios_gerenciamento', 'projects', 'services', 'clients', 'tarefas_gerenciamento', 'pomodoro_gerenciamento', 'relatorios_tarefas_gerenciamento'],
    palette: PALETTES.violet,
  },
  {
    key: 'especial',
    slug: 'especial',
    name: 'Módulos Extras',
    description: 'TerraControl e módulos especiais que não pertencem aos demais subsistemas',
    iconName: 'Sparkles',
    moduleKeys: ['terracontrol'],
    palette: PALETTES.amber,
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

// Permissão de acesso aos subsistemas (fase 1.8).
//
// Fase 2.2: acesso a subsistema agora é determinado por permissões reais
// (user.modulesAccess), não mais por role hardcoded. Um usuário tem acesso
// ao subsistema X se possui PELO MENOS UM módulo de X com qualquer nível
// (view ou edit). Picker, Switcher e router macro consomem destas funções.
//
// Importante: o filtro role-based legado (só superadmin/admin) foi removido —
// user/guest agora podem ver subsistemas conforme suas permissões reais.
// O <AcessoNegado> continua sendo o guard final em caso de tentativa direta.

interface UserWithPermissions {
  role?: string;
  modulesAccess?: Array<{ moduleKey?: string; accessLevel?: string }>;
}

function getAccessibleModuleKeys(user: UserWithPermissions | null | undefined): Set<string> {
  if (!user) return new Set();
  const access = user.modulesAccess;
  if (!Array.isArray(access)) return new Set();
  return new Set(
    access
      .map((item) => item?.moduleKey)
      .filter((key): key is string => typeof key === 'string' && key.length > 0)
  );
}

export function userCanAccessSubsystem(
  user: UserWithPermissions | null | undefined,
  subsystem: SubsystemDefinition,
): boolean {
  const accessible = getAccessibleModuleKeys(user);
  if (accessible.size === 0) return false;
  return subsystem.moduleKeys.some((key) => accessible.has(key));
}

export function userCanAccessSubsystems(user: UserWithPermissions | null | undefined): boolean {
  if (!user) return false;
  return SUBSYSTEMS.some((subsystem) => userCanAccessSubsystem(user, subsystem));
}

// Retorna a lista de subsistemas que o user pode acessar, na ordem do manifesto.
export function getAccessibleSubsystems(
  user: UserWithPermissions | null | undefined,
): SubsystemDefinition[] {
  if (!user) return [];
  return SUBSYSTEMS.filter((subsystem) => userCanAccessSubsystem(user, subsystem));
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
