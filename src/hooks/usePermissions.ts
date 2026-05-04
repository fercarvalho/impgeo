import { useMemo } from 'react';
import { useAuth } from '../contexts/AuthContext';

// Bug fix #3: role typed as a union so the switch is exhaustive at compile time.
// Any role string not in this list falls to `default` intentionally, but typos
// and new roles added to the DB without updating this file are now caught by TS.
type UserRole = 'superadmin' | 'admin' | 'user' | 'guest';

export interface Permissions {
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
  // canView kept in interface for future use — currently all authenticated roles get true.
  // Callers that do read-only screens can gate on this to future-proof against new roles.
  canView: boolean;
  canImport: boolean;
  canExport: boolean;
  // Bug fix #5: isLoading exposed — consumers can distinguish "unauthenticated" from
  // "auth still resolving" and avoid flashing a permission-denied state on cold load.
  isLoading: boolean;
}

// Fully-denied baseline: used for unauthenticated state and unknown roles.
const DENIED: Omit<Permissions, 'isLoading'> = {
  canCreate: false,
  canEdit: false,
  canDelete: false,
  canView: false,
  canImport: false,
  canExport: false,
};

// Bug fix #2 + #6: permissions resolved per role, then optionally narrowed by
// modulesAccess when the field is present on the user object.
// Returns a stable object (useMemo) so callers can safely list it as a useEffect dep.
export const usePermissions = (): Permissions => {
  const { user, isLoading } = useAuth();

  return useMemo<Permissions>(() => {
    // Bug fix #4: isLoading guard returns denied with isLoading:true so the
    // consumer can show a skeleton/spinner instead of a permission-denied UI.
    if (isLoading) return { ...DENIED, isLoading: true };

    if (!user) return { ...DENIED, isLoading: false };

    // Bug fix #3: cast through UserRole union — unknown/empty role string falls
    // to `default` below, where all permissions are denied and a warning is emitted.
    // Bug fix #4: explicit empty-string / falsy guard before the cast.
    if (!user.role) {
      console.warn('[usePermissions] user.role is empty or missing — all permissions denied.');
      return { ...DENIED, isLoading: false };
    }

    // Bug fix #7: normalize to lowercase before cast — backend may return "Admin", "SUPERADMIN", etc.
    // Without normalization, any non-lowercase role falls to `default` and denies all permissions.
    const role = user.role.toLowerCase() as UserRole;

    let base: Omit<Permissions, 'isLoading'>;

    switch (role) {
      case 'superadmin':
      case 'admin':
        base = {
          canCreate: true,
          canEdit: true,
          canDelete: true,
          canView: true,
          canImport: true,
          canExport: true,
        };
        break;

      case 'user':
        base = {
          canCreate: true,
          canEdit: true,
          canDelete: false,
          canView: true,
          canImport: true,
          canExport: true,
        };
        break;

      case 'guest':
        base = {
          canCreate: false,
          canEdit: false,
          canDelete: false,
          canView: true,
          canImport: false,
          // Bug fix #1: guests must NOT export — previous value `true` allowed unauthenticated
          // data extraction when combined with unprotected /api/export endpoints.
          canExport: false,
        };
        break;

      default: {
        // TypeScript exhaustiveness: `role` has type `never` here if UserRole is complete.
        // At runtime, an unexpected DB role string still reaches this branch — deny all.
        const _exhaustive: never = role;
        console.warn(`[usePermissions] Unknown role "${String(_exhaustive)}" — all permissions denied.`);
        base = { ...DENIED };
        break;
      }
    }

    // Bug fix #6: narrow by modulesAccess when present.
    // If the server has restricted a user's access to specific modules, those restrictions
    // take precedence over the role-based baseline (principle of least privilege).
    // Only applies when modulesAccess is a non-empty array — absence means "no restriction".
    if (Array.isArray(user.modulesAccess) && user.modulesAccess.length > 0) {
      // If the user has at least one module with accessLevel 'read', they can view.
      // If none has 'write' or higher, restrict create/edit/delete/import/export.
      const levels = new Set(
        user.modulesAccess.map(m => {
          if (!m.accessLevel) {
            console.warn(`[usePermissions] modulesAccess entry "${m.moduleKey}" has no accessLevel — treating as 'read'.`);
          }
          return m.accessLevel?.toLowerCase() ?? 'read';
        })
      );
      const hasWrite = levels.has('write') || levels.has('admin') || levels.has('full');
      if (!hasWrite) {
        base = {
          ...base,
          canCreate: false,
          canEdit: false,
          canDelete: false,
          canImport: false,
          canExport: false,
        };
      }
    }

    return { ...base, isLoading: false };
  // Bug fix #2 + #8: granular deps — recomputes only when role or modulesAccess change,
  // not on every setUser call that updates unrelated fields (photoUrl, phone, address, etc.)
  }, [user?.role, user?.modulesAccess, isLoading]);
};
