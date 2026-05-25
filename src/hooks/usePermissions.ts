import { useMemo } from 'react';
import { useAuth } from '../contexts/AuthContext';

// Fase 2.2: modelo de permissões granulares por módulo (view/edit).
// Compat retroativa: usePermissions() sem moduleKey mantém a semântica
// antiga (role-based), agora computada a partir do nível MÁXIMO entre
// todos os módulos. Quando moduleKey é passado, gateia pelo nível do
// módulo específico, que é o comportamento correto.

type AccessLevel = 'view' | 'edit';
type UserRole = 'superadmin' | 'admin' | 'manager' | 'user' | 'guest';

export interface Permissions {
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
  canView: boolean;
  canImport: boolean;
  canExport: boolean;
  // isLoading: distingue "ainda resolvendo auth" de "sem permissão".
  isLoading: boolean;
}

const DENIED: Omit<Permissions, 'isLoading'> = {
  canCreate: false,
  canEdit: false,
  canDelete: false,
  canView: false,
  canImport: false,
  canExport: false,
};

const FULL: Omit<Permissions, 'isLoading'> = {
  canCreate: true,
  canEdit: true,
  canDelete: true,
  canView: true,
  canImport: true,
  canExport: true,
};

const VIEW_ONLY: Omit<Permissions, 'isLoading'> = {
  canCreate: false,
  canEdit: false,
  canDelete: false,
  canView: true,
  canImport: false,
  canExport: false,
};

// Normaliza accessLevel vindo do backend, defensivo contra valores legados
// ('write' → tratado como 'edit'; qualquer outro string → null).
function normalizeLevel(raw: string | null | undefined): AccessLevel | null {
  if (!raw) return null;
  const lower = String(raw).toLowerCase();
  if (lower === 'edit' || lower === 'write' || lower === 'admin' || lower === 'full') return 'edit';
  if (lower === 'view' || lower === 'read') return 'view';
  return null;
}

// Roles privilegiadas têm acesso total a tudo, independente da matriz de
// modulesAccess (defesa em profundidade caso o backend não envie a matriz).
function isPrivilegedRole(role: string | undefined | null): boolean {
  if (!role) return false;
  const lower = role.toLowerCase();
  return lower === 'superadmin' || lower === 'admin';
}

interface UserPermissionsShape {
  role?: string;
  modulesAccess?: Array<{ moduleKey?: string; accessLevel?: string }>;
}

function getLevelForModule(
  user: UserPermissionsShape | null | undefined,
  moduleKey: string,
): AccessLevel | null {
  if (!user) return null;
  if (isPrivilegedRole(user.role)) return 'edit';
  if (!Array.isArray(user.modulesAccess)) return null;
  const entry = user.modulesAccess.find((m) => m?.moduleKey === moduleKey);
  return normalizeLevel(entry?.accessLevel);
}

function getMaxLevel(user: UserPermissionsShape | null | undefined): AccessLevel | null {
  if (!user) return null;
  if (isPrivilegedRole(user.role)) return 'edit';
  if (!Array.isArray(user.modulesAccess)) return null;
  let hasView = false;
  for (const entry of user.modulesAccess) {
    const level = normalizeLevel(entry?.accessLevel);
    if (level === 'edit') return 'edit';
    if (level === 'view') hasView = true;
  }
  return hasView ? 'view' : null;
}

/**
 * Helpers funcionais (sem hook) para uso em código não-React (manifest,
 * services, utilities).
 */
export function canViewModule(
  user: UserPermissionsShape | null | undefined,
  moduleKey: string,
): boolean {
  const level = getLevelForModule(user, moduleKey);
  return level === 'view' || level === 'edit';
}

export function canEditModule(
  user: UserPermissionsShape | null | undefined,
  moduleKey: string,
): boolean {
  return getLevelForModule(user, moduleKey) === 'edit';
}

/**
 * Hook principal de permissões.
 *
 *   - `usePermissions()`         → permissões agregadas (nível máximo do user
 *                                  em qualquer módulo). Compat com call sites
 *                                  legados que não conhecem moduleKey.
 *   - `usePermissions(moduleKey)` → permissões específicas do módulo. Use sempre
 *                                  que possível — é a forma correta no modelo
 *                                  granular.
 */
export const usePermissions = (moduleKey?: string): Permissions => {
  const { user, isLoading } = useAuth();

  return useMemo<Permissions>(() => {
    if (isLoading) return { ...DENIED, isLoading: true };
    if (!user) return { ...DENIED, isLoading: false };
    if (!user.role) {
      console.warn('[usePermissions] user.role is empty or missing — all permissions denied.');
      return { ...DENIED, isLoading: false };
    }

    const role = user.role.toLowerCase() as UserRole;
    if (!['superadmin', 'admin', 'manager', 'user', 'guest'].includes(role)) {
      console.warn(`[usePermissions] Unknown role "${role}" — all permissions denied.`);
      return { ...DENIED, isLoading: false };
    }

    // superadmin/admin: passe livre (modelo "edit em tudo que tem acesso");
    // se moduleKey for passado, ainda gateia por presença na matriz para
    // que admin não veja módulos exclusivos do superadmin (sessions etc.).
    if (isPrivilegedRole(role)) {
      if (moduleKey) {
        const level = getLevelForModule(user, moduleKey);
        if (level === null) return { ...DENIED, isLoading: false };
      }
      return { ...FULL, isLoading: false };
    }

    // manager/user/guest: nível vem da matriz.
    const level = moduleKey
      ? getLevelForModule(user, moduleKey)
      : getMaxLevel(user);

    if (level === null) return { ...DENIED, isLoading: false };
    if (level === 'edit') return { ...FULL, canDelete: role !== 'guest', isLoading: false };
    return { ...VIEW_ONLY, isLoading: false };
  }, [user, isLoading, moduleKey]);
};
