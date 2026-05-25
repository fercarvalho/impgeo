// =============================================================================
// Defaults de permissões por role (Fase 2.1 → editáveis na Fase 2.x)
// =============================================================================
//
// Desde a migration 043, os defaults VIVEM NO BANCO (tabela
// role_default_permissions) e podem ser editados pelo painel admin.
//
// Este arquivo permanece como a CAMADA LÓGICA:
//   - Mantém o mapa hardcoded FALLBACK_DEFAULTS — usado como (a) fallback
//     quando o banco não tem registros (migration ainda não rodou ou alguém
//     deletou tudo) e (b) referência canônica para o botão "Restaurar padrão
//     original" na UI.
//   - Expõe computeDefaultsForRole(role, catalog, dbMap?) — função pura que
//     recebe o mapa do DB (ou usa fallback) e calcula a lista
//     [{moduleKey, accessLevel}] respeitando o catálogo de módulos.
//   - Conversores buildRoleMapFromDbRows / buildRoleMapFromMatrix ajudam o
//     caller (database-pg.js, server.js) a transformar entre formatos.
//
// Tabela canônica (fallback hardcoded — SEED da migration 043):
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
// =============================================================================

// As 5 roles do SISTEMA — têm comportamento especial no código (bypass de
// superadmin/admin em gates, defaults hardcoded como fallback) e nunca podem
// ser deletadas/renomeadas. Roles custom criadas via UI ficam fora desta lista.
const SYSTEM_ROLES = ['superadmin', 'admin', 'manager', 'user', 'guest'];
// Alias retrocompat — código antigo que importa VALID_ROLES continua funcionando
// porque toda role válida do sistema também é uma role válida em geral, mas o
// nome correto agora é SYSTEM_ROLES (a lista total de roles é dinâmica).
const VALID_ROLES = SYSTEM_ROLES;
const VALID_ACCESS_LEVELS = ['view', 'edit'];
const SUBSYSTEM_KEYS = ['admin', 'gestao', 'financeiro', 'gerenciamento', 'especial'];

// Hardcoded — fonte original e fallback. Estrutura subsystem-level com
// moduleOverrides; convertida em computeDefaultsForRole abaixo.
const FALLBACK_DEFAULTS = {
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
      roadmap: 'none',
    },
  },
};

// Alias antigo (retrocompat de imports externos)
const ROLE_DEFAULTS = FALLBACK_DEFAULTS;

/**
 * Calcula a lista de permissões a partir do mapa subsystem-level + overrides.
 * Função pura, sem I/O.
 *
 * @param {string} role
 * @param {Array<{moduleKey, subsystemKey, isActive?}>} catalog
 * @param {object|null} configMap  Mapa role → {subsystemKey: level, moduleOverrides?}
 *                                  Se null, usa FALLBACK_DEFAULTS.
 * @returns {Array<{moduleKey, accessLevel}>}
 */
function computeDefaultsForRole(role, catalog, configMap = null) {
  if (!role || typeof role !== 'string') return [];
  const root = configMap || FALLBACK_DEFAULTS;
  const config = root[role];
  // Role custom sem config no mapa = matriz vazia (sem acesso a nada).
  // Cabe ao superadmin definir as perms ao criar/editar a role.
  if (!config) return [];

  const overrides = config.moduleOverrides || {};
  const result = [];

  for (const module of catalog) {
    if (module.isActive === false) continue;
    const moduleKey = module.moduleKey;
    const subsystemKey = module.subsystemKey;

    if (Object.prototype.hasOwnProperty.call(overrides, moduleKey)) {
      const overrideLevel = overrides[moduleKey];
      if (overrideLevel === 'none' || overrideLevel === null) continue;
      if (VALID_ACCESS_LEVELS.includes(overrideLevel)) {
        result.push({ moduleKey, accessLevel: overrideLevel });
        continue;
      }
    }

    const subsystemDefault = config[subsystemKey];
    if (subsystemDefault === null || subsystemDefault === undefined) continue;
    if (VALID_ACCESS_LEVELS.includes(subsystemDefault)) {
      result.push({ moduleKey, accessLevel: subsystemDefault });
    }
  }

  return result;
}

/**
 * Constrói o mapa subsystem-level a partir de uma matriz role-flat vinda do
 * banco. Quando a maioria dos módulos de um subsistema concorda no mesmo
 * nível, vira o default do subsistema; divergências viram moduleOverrides.
 * Módulos ausentes (sem perm) viram override 'none' apenas se o subsistema
 * tem default não-nulo (caso contrário ficam fora porque o subsistema já
 * está vazio).
 *
 * Esse formato bidirecional permite que a UI edite por matriz (granular)
 * e a tabela canônica continue legível por humanos.
 *
 * @param {Array<{role, moduleKey, accessLevel}>} dbRows
 * @param {Array<{moduleKey, subsystemKey}>} catalog
 * @returns {object} mapa role → {subsystem: level, moduleOverrides}
 */
function buildRoleMapFromDbRows(dbRows, catalog) {
  const moduleToSubsystem = new Map(catalog.map((m) => [m.moduleKey, m.subsystemKey]));
  const subsystemModules = new Map();
  for (const m of catalog) {
    if (!subsystemModules.has(m.subsystemKey)) subsystemModules.set(m.subsystemKey, []);
    subsystemModules.get(m.subsystemKey).push(m.moduleKey);
  }

  // Descobre dinamicamente quais roles aparecem nos rows + as system roles
  // (sempre incluídas mesmo que não tenham nenhum registro — viram config vazia).
  const rolesInData = new Set(SYSTEM_ROLES);
  for (const row of dbRows) {
    if (row.role) rolesInData.add(row.role);
  }
  const allRoles = Array.from(rolesInData);

  // Agrupa rows por role e subsistema
  const grouped = {};
  for (const role of allRoles) {
    grouped[role] = {};
    for (const sub of SUBSYSTEM_KEYS) grouped[role][sub] = new Map();
  }
  for (const row of dbRows) {
    if (!grouped[row.role]) continue;
    const subsystem = moduleToSubsystem.get(row.moduleKey);
    if (!subsystem) continue;
    grouped[row.role][subsystem].set(row.moduleKey, row.accessLevel);
  }

  const result = {};
  for (const role of allRoles) {
    const config = {};
    const overrides = {};
    for (const sub of SUBSYSTEM_KEYS) {
      const subModules = subsystemModules.get(sub) || [];
      const grantedMap = grouped[role][sub]; // Map<moduleKey, level>

      if (grantedMap.size === 0) {
        config[sub] = null;
        continue;
      }

      // Conta níveis para escolher o "default" do subsistema (modo)
      const levelCount = { view: 0, edit: 0 };
      for (const lvl of grantedMap.values()) levelCount[lvl]++;
      const dominantLevel = levelCount.edit >= levelCount.view ? 'edit' : 'view';

      // Se TODOS os módulos do subsistema têm o mesmo nível → default puro
      if (grantedMap.size === subModules.length) {
        const allSame = subModules.every((mk) => grantedMap.get(mk) === dominantLevel);
        if (allSame) {
          config[sub] = dominantLevel;
          continue;
        }
      }

      // Há divergência: default = dominante, overrides para o resto
      config[sub] = dominantLevel;
      for (const mk of subModules) {
        const lvl = grantedMap.get(mk);
        if (lvl === undefined) {
          overrides[mk] = 'none';
        } else if (lvl !== dominantLevel) {
          overrides[mk] = lvl;
        }
      }
    }
    if (Object.keys(overrides).length > 0) config.moduleOverrides = overrides;
    result[role] = config;
  }
  return result;
}

function getDefaultLevelForRoleAndSubsystem(role, subsystemKey, configMap = null) {
  const root = configMap || FALLBACK_DEFAULTS;
  const config = root[role];
  if (!config) return null;
  const level = config[subsystemKey];
  return level === undefined ? null : level;
}

function getDefaultOverridesForRole(role, configMap = null) {
  const root = configMap || FALLBACK_DEFAULTS;
  const config = root[role];
  if (!config) return {};
  return { ...(config.moduleOverrides || {}) };
}

module.exports = {
  SYSTEM_ROLES,
  VALID_ROLES, // alias retrocompat (= SYSTEM_ROLES)
  VALID_ACCESS_LEVELS,
  SUBSYSTEM_KEYS,
  ROLE_DEFAULTS, // alias retrocompat
  FALLBACK_DEFAULTS,
  computeDefaultsForRole,
  buildRoleMapFromDbRows,
  getDefaultLevelForRoleAndSubsystem,
  getDefaultOverridesForRole,
};
