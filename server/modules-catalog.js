// ═══════════════════════════════════════════════════════════════════════════
// server/modules-catalog.js
//
// Catálogo de módulos do sistema (extraído de database-pg.js para ser importável
// sem instanciar a classe Database — permite o teste de consistência do #6).
//
// ⚠️ SINCRONIZAÇÃO (melhoria #6): este catálogo, o manifest do frontend
// (src/subsistemas/manifest.ts → SUBSYSTEMS[].moduleKeys) e a tabela `subsystems`
// (seed na migration 016) precisam CONCORDAR. O teste
// server/services/pm/__tests__/modules-consistency.test.js valida
// manifest ↔ catálogo no CI; um boot-warn em database-pg.js checa catálogo ↔
// tabela subsystems. Ao adicionar/mover um módulo, ajuste os 3.
//
// sortOrder é a ordem DENTRO do subsistema (não global).
// ═══════════════════════════════════════════════════════════════════════════

'use strict';

const MODULES_CATALOG = [
  // Subsistema admin
  { moduleKey: 'admin',                    moduleName: 'Admin',                 iconName: 'Shield',        routePath: 'admin',                    isSystem: true, description: 'Painel administrativo',                              subsystemKey: 'admin',         sortOrder: 1 },
  { moduleKey: 'sessions',                 moduleName: 'Sessões Ativas',        iconName: 'Monitor',       routePath: 'sessions',                 isSystem: true, description: 'Gerenciamento de sessões ativas por dispositivo',   subsystemKey: 'admin',         sortOrder: 2 },
  { moduleKey: 'anomalies',                moduleName: 'Anomalias',             iconName: 'AlertTriangle', routePath: 'anomalies',                isSystem: true, description: 'Dashboard de detecção de anomalias de segurança',  subsystemKey: 'admin',         sortOrder: 3 },
  { moduleKey: 'security_alerts',          moduleName: 'Alertas de Segurança',  iconName: 'ShieldAlert',   routePath: 'security_alerts',          isSystem: true, description: 'Portal de alertas e notificações de segurança',     subsystemKey: 'admin',         sortOrder: 4 },

  // Subsistema gestao
  { moduleKey: 'roadmap',                  moduleName: 'Roadmap',               iconName: 'Map',           routePath: 'roadmap',                  isSystem: true, description: 'Roadmap de desenvolvimento do sistema',             subsystemKey: 'gestao',        sortOrder: 1 },
  { moduleKey: 'documentacao',             moduleName: 'Documentação',          iconName: 'BookOpen',      routePath: 'documentacao',             isSystem: true, description: 'Manual e guias do sistema',                         subsystemKey: 'gestao',        sortOrder: 2 },
  { moduleKey: 'faq',                      moduleName: 'FAQ',                   iconName: 'HelpCircle',    routePath: 'faq',                      isSystem: true, description: 'Perguntas frequentes do sistema',                   subsystemKey: 'gestao',        sortOrder: 3 },

  // Subsistema financeiro
  { moduleKey: 'dashboard_financeiro',     moduleName: 'Dashboard',             iconName: 'BarChart3',     routePath: 'dashboard_financeiro',     isSystem: true, description: 'Visão geral do sistema',                            subsystemKey: 'financeiro',    sortOrder: 1 },
  { moduleKey: 'metas_financeiro',         moduleName: 'Metas',                 iconName: 'Target',        routePath: 'metas_financeiro',         isSystem: true, description: 'Definição e record de metas',               subsystemKey: 'financeiro',    sortOrder: 2 },
  { moduleKey: 'relatorios_financeiro',    moduleName: 'Relatórios',            iconName: 'FileText',      routePath: 'relatorios_financeiro',    isSystem: true, description: 'Relatórios e análises',                             subsystemKey: 'financeiro',    sortOrder: 3 },
  { moduleKey: 'projecao',                 moduleName: 'Projeção',              iconName: 'LineChart',     routePath: 'projecao',                 isSystem: true, description: 'Projeções financeiras',                             subsystemKey: 'financeiro',    sortOrder: 4 },
  { moduleKey: 'transactions',             moduleName: 'Transações',            iconName: 'Wallet',        routePath: 'transactions',             isSystem: true, description: 'Transações financeiras',                            subsystemKey: 'financeiro',    sortOrder: 5 },
  { moduleKey: 'dre',                      moduleName: 'DRE',                   iconName: 'Calculator',    routePath: 'dre',                      isSystem: true, description: 'Demonstrativo de resultados',                       subsystemKey: 'financeiro',    sortOrder: 6 },

  // Subsistema gerenciamento
  { moduleKey: 'dashboard_gerenciamento',  moduleName: 'Dashboard',             iconName: 'BarChart3',     routePath: 'dashboard_gerenciamento',  isSystem: true, description: 'Resumo do gerenciamento (projetos, serviços, clientes)', subsystemKey: 'gerenciamento', sortOrder: 1 },
  { moduleKey: 'metas_gerenciamento',      moduleName: 'Metas',                 iconName: 'Target',        routePath: 'metas_gerenciamento',      isSystem: true, description: 'Metas operacionais do gerenciamento',               subsystemKey: 'gerenciamento', sortOrder: 2 },
  { moduleKey: 'projecao_gerenciamento',   moduleName: 'Projeção',              iconName: 'LineChart',     routePath: 'projecao_gerenciamento',   isSystem: true, description: 'Projeções e definição de metas operacionais',       subsystemKey: 'gerenciamento', sortOrder: 3 },
  { moduleKey: 'relatorios_gerenciamento', moduleName: 'Relatórios',            iconName: 'FileText',      routePath: 'relatorios_gerenciamento', isSystem: true, description: 'Relatórios operacionais do gerenciamento',          subsystemKey: 'gerenciamento', sortOrder: 4 },
  { moduleKey: 'projects',                 moduleName: 'Projetos',              iconName: 'FolderOpen',    routePath: 'projects',                 isSystem: true, description: 'Gestão de projetos',                                subsystemKey: 'gerenciamento', sortOrder: 5 },
  { moduleKey: 'services',                 moduleName: 'Serviços',              iconName: 'Briefcase',     routePath: 'services',                 isSystem: true, description: 'Gestão de serviços',                                subsystemKey: 'gerenciamento', sortOrder: 6 },
  { moduleKey: 'clients',                  moduleName: 'Clientes',              iconName: 'Users',         routePath: 'clients',                  isSystem: true, description: 'Cadastro de clientes',                              subsystemKey: 'gerenciamento', sortOrder: 7 },
  { moduleKey: 'tarefas_gerenciamento',    moduleName: 'Tarefas',               iconName: 'ListTodo',      routePath: 'tarefas_gerenciamento',    isSystem: true, description: 'Execução e acompanhamento de tarefas dos projetos',  subsystemKey: 'gerenciamento', sortOrder: 8 },
  { moduleKey: 'pomodoro_gerenciamento',   moduleName: 'Pomodoro',              iconName: 'Timer',         routePath: 'pomodoro_gerenciamento',   isSystem: true, description: 'Controle de tempo (Pomodoro) e estatísticas pessoais', subsystemKey: 'gerenciamento', sortOrder: 9 },
  { moduleKey: 'relatorios_tarefas_gerenciamento', moduleName: 'Relatórios de Tarefas', iconName: 'BarChart3', routePath: 'relatorios_tarefas_gerenciamento', isSystem: true, description: 'Relatórios administrativos de produtividade e custos', subsystemKey: 'gerenciamento', sortOrder: 10 },
  { moduleKey: 'aprovacoes_gerenciamento', moduleName: 'Central de Aprovações', iconName: 'ClipboardCheck', routePath: 'aprovacoes_gerenciamento', isSystem: true, description: 'Fila única de aprovações do gestor (prazo, reabertura, delegação, revisão, overage)', subsystemKey: 'gerenciamento', sortOrder: 11 },

  // Subsistema especial (módulos extras)
  { moduleKey: 'terracontrol',          moduleName: 'TerraControl',       iconName: 'ClipboardList', routePath: 'terracontrol',          isSystem: true, description: 'Controle e acompanhamento de imóveis rurais',          subsystemKey: 'especial',      sortOrder: 1 },
];

// moduleKeys agrupadas por subsystemKey → { admin: Set, financeiro: Set, ... }.
function catalogModuleKeysBySubsystem() {
  const bySub = {};
  for (const m of MODULES_CATALOG) {
    (bySub[m.subsystemKey] || (bySub[m.subsystemKey] = new Set())).add(m.moduleKey);
  }
  return bySub;
}

module.exports = { MODULES_CATALOG, catalogModuleKeysBySubsystem };
