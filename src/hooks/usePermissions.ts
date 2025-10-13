import { useAuth } from '../contexts/AuthContext';

export interface Permissions {
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
  canView: boolean;
  canImport: boolean;
  canExport: boolean;
}

export const usePermissions = (): Permissions => {
  const { user } = useAuth();

  if (!user) {
    return {
      canCreate: false,
      canEdit: false,
      canDelete: false,
      canView: false,
      canImport: false,
      canExport: false
    };
  }

  switch (user.role) {
    case 'admin':
      return {
        canCreate: true,
        canEdit: true,
        canDelete: true,
        canView: true,
        canImport: true,
        canExport: true
      };
    
    case 'user':
      return {
        canCreate: true,
        canEdit: true,
        canDelete: false,
        canView: true,
        canImport: true,
        canExport: true
      };
    
    case 'guest':
      return {
        canCreate: false,
        canEdit: false,
        canDelete: false,
        canView: true,
        canImport: false,
        canExport: true
      };
    
    default:
      return {
        canCreate: false,
        canEdit: false,
        canDelete: false,
        canView: false,
        canImport: false,
        canExport: false
      };
  }
};
