// =============================================================================
// Defaults de permissões por role (Fase 2.1)
// =============================================================================
//
// Fonte da verdade do mapeamento role × subsistema → access_level.
// Espelha exatamente o que a migration 042 aplicou no banco para os usuários
// existentes — qualquer novo usuário ou reset deve produzir o mesmo resultado.
//
// Tabela canônica (role × subsistema):
//
//   ┌─────────────┬───────┬────────┬──────────┬───────────────┬──────────┐
//   │ role        │ admin │ gestao │ financ.  │ gerenciamento │ especial │
//   ├─────────────┼───────┼────────┼──────────┼───────────────┼──────────┤
//   │ superadmin  │ edit  │ edit   │ edit     │ edit          │ edit     │
//   │ admin       │ edit¹ │ edit   │ edit     │ edit          │ edit     │
//   │ manager     │  —    │ edit   │ edit     │ edit          │ edit     │
//   │ user        │  —    │ view   │ view     │ edit          │ edit     │
//   │ guest       │  —    │ view²  │ view     │ view          │ view     │
//   └─────────────┴───────┴────────┴──────────┴───────────────┴──────────┘
//   ¹ admin: só módulo 'admin' (UserManagement); sessions/anomalies/
//     security_alerts permanecem exclusivos do superadmin.
//   ² guest/gestao: só faq + documentacao (sem roadmap).
//
// Convenção:
//   - subsystemDefault === null  → sem acesso ao subsistema inteiro
//   - subsystemDefault === 'view' | 'edit' → todos os módulos do subsistema
//     recebem esse nível, exceto overrides
//   - moduleOverrides[moduleKey] === 'none' → remove módulo
//   - moduleOverrides[moduleKey] === 'view' | 'edit' → força nível específico
// =============================================================================

const VALID_ROLES = ['superadmin', 'admin', 'manager', 'user', 'guest'];
const VALID_ACCESS_LEVELS = ['view', 'edit'];
const SUBSYSTEM_KEYS = ['admin', 'gestao', 'financeiro', 'gerenciamento', 'especial'];

const ROLE_DEFAULTS = {
  superadmin: {
    admin:         'edit',
    gestao:        'edit',
    financeiro:    'edit',
    gerenciamento: 'edit',
    especial:      'edit',
  },
  admin: {
    admin:         'edit',
    gestao:        'edit',
    financeiro:    'edit',
    gerenciamento: 'edit',
    especial:      'edit',
    moduleOverrides: {
      // Exclusivos do superadmin
      sessions:        'none',
      anomalies:       'none',
      security_alerts: 'none',
    },
  },
  manager: {
    admin:         null,
    gestao:        'edit',
    financeiro:    'edit',
    gerenciamento: 'edit',
    especial:      'edit',
  },
  user: {
    admin:         null,
    gestao:        'view',
    financeiro:    'view',
    gerenciamento: 'edit',
    especial:      'edit',
  },
  guest: {
    admin:         null,
    gestao:        'view',
    financeiro:    'view',
    gerenciamento: 'view',
    especial:      'view',
    moduleOverrides: {
      // guest não tem acesso a roadmap
      roadmap: 'none',
    },
  },
};

/**
 * Calcula a lista de permissões [{moduleKey, accessLevel}] que um usuário com
 * determinada role deveria ter, dadas as informações do catálogo de módulos.
 *
 * @param {string} role
 * @param {Array<{moduleKey:string, subsystemKey:string, isActive?:boolean}>} catalog
 * @returns {Array<{moduleKey:string, accessLevel:'view'|'edit'}>}
 */
function computeDefaultsForRole(role, catalog) {
  if (!VALID_ROLES.includes(role)) return [];
  const config = ROLE_DEFAULTS[role];
  if (!config) return [];

  const overrides = config.moduleOverrides || {};
  const result = [];

  for (const module of catalog) {
    if (module.isActive === false) continue;
    const moduleKey = module.moduleKey;
    const subsystemKey = module.subsystemKey;

    // Override de módulo tem prioridade
    if (Object.prototype.hasOwnProperty.call(overrides, moduleKey)) {
      const overrideLevel = overrides[moduleKey];
      if (overrideLevel === 'none' || overrideLevel === null) {
        continue; // não inclui esse módulo
      }
      if (VALID_ACCESS_LEVELS.includes(overrideLevel)) {
        result.push({ moduleKey, accessLevel: overrideLevel });
        continue;
      }
    }

    // Default do subsistema
    const subsystemDefault = config[subsystemKey];
    if (subsystemDefault === null || subsystemDefault === undefined) continue;
    if (VALID_ACCESS_LEVELS.includes(subsystemDefault)) {
      result.push({ moduleKey, accessLevel: subsystemDefault });
    }
  }

  return result;
}

/**
 * Retorna o access_level default para um par (role, subsystemKey), ignorando
 * overrides de módulos individuais. Útil para a UI que mostra o "estado base"
 * de um subsistema antes de o usuário editar individualmente.
 *
 * @returns {'view'|'edit'|null}
 */
function getDefaultLevelForRoleAndSubsystem(role, subsystemKey) {
  const config = ROLE_DEFAULTS[role];
  if (!config) return null;
  const level = config[subsystemKey];
  return level === undefined ? null : level;
}

/**
 * Lista módulos com override 'none' para a role — usado pela UI pra mostrar
 * "exclusivo do superadmin" ou "removido por padrão pra essa role".
 */
function getDefaultOverridesForRole(role) {
  const config = ROLE_DEFAULTS[role];
  if (!config) return {};
  return { ...(config.moduleOverrides || {}) };
}

module.exports = {
  VALID_ROLES,
  VALID_ACCESS_LEVELS,
  SUBSYSTEM_KEYS,
  ROLE_DEFAULTS,
  computeDefaultsForRole,
  getDefaultLevelForRoleAndSubsystem,
  getDefaultOverridesForRole,
};
