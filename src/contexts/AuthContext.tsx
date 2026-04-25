import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';

interface User {
  id: string;
  username: string;
  role: string;
  modulesAccess?: Array<{
    moduleKey: string;
    moduleName?: string;
    accessLevel?: string;
  }>;
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  photoUrl?: string;
  cpf?: string;
  birthDate?: string;
  gender?: string;
  position?: string;
  address?: {
    cep?: string;
    street?: string;
    number?: string;
    complement?: string;
    neighborhood?: string;
    city?: string;
    state?: string;
  };
  isActive?: boolean;
  lastLogin?: string;
  createdAt?: string;
  updatedAt?: string;
  permissoesLegais?: Record<string, boolean>;
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  isImpersonating: boolean;
  originalUser: User | null;
  login: (username: string, password: string) => Promise<LoginResponse>;
  completeFirstLogin: () => Promise<void>;
  logout: () => void;
  updateUser: (userData: Partial<User>, newToken?: string) => void;
  refreshUser: () => Promise<boolean>;
  startImpersonation: (userId: string) => Promise<boolean>;
  stopImpersonation: () => void;
  isLoading: boolean;
}

interface LoginResponse {
  success: boolean;
  firstLogin?: boolean;
  newPassword?: string;
  error?: string;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth deve ser usado dentro de um AuthProvider');
  }
  return context;
};

interface AuthProviderProps {
  children: ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isImpersonating, setIsImpersonating] = useState<boolean>(
    () => sessionStorage.getItem('isImpersonating') === 'true'
  );
  const [originalUser, setOriginalUser] = useState<User | null>(null);

  const API_BASE_URL =
    (typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'))
      ? 'http://localhost:9001/api'
      : ((import.meta as any).env?.VITE_API_URL || '/api');

  useEffect(() => {
    const savedToken = localStorage.getItem('authToken');
    if (savedToken) {
      verifyToken(savedToken);
    } else {
      setIsLoading(false);
    }

    // Restaurar estado de impersonation ao recarregar
    if (sessionStorage.getItem('isImpersonating') === 'true') {
      const storedOriginalUser = sessionStorage.getItem('originalUser');
      if (storedOriginalUser) {
        try {
          setOriginalUser(JSON.parse(storedOriginalUser));
        } catch {}
      }
    }
  }, []);

  const verifyToken = async (tokenToVerify: string) => {
    try {
      const response = await fetch(`${API_BASE_URL}/auth/verify`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${tokenToVerify}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        const data = await response.json();
        setUser(data.user);
        setToken(tokenToVerify);
      } else {
        localStorage.removeItem('authToken');
        localStorage.removeItem('refreshToken');
        setUser(null);
        setToken(null);
      }
    } catch (error) {
      console.error('Erro ao verificar token:', error);
      localStorage.removeItem('authToken');
      setUser(null);
      setToken(null);
    } finally {
      setIsLoading(false);
    }
  };

  const login = async (username: string, password: string): Promise<LoginResponse> => {
    try {
      const response = await fetch(`${API_BASE_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });

      if (response.ok) {
        const data = await response.json();

        if (data.refreshToken) {
          localStorage.setItem('refreshToken', data.refreshToken);
        }

        if (data.firstLogin && data.newPassword) {
          localStorage.setItem('authToken', data.token);
          localStorage.setItem('pendingFirstLogin', 'true');
          return { success: true, firstLogin: true, newPassword: data.newPassword };
        }

        setUser(data.user);
        setToken(data.token);
        localStorage.setItem('authToken', data.token);
        localStorage.removeItem('pendingFirstLogin');
        return { success: true, firstLogin: false };
      } else {
        const errorData = await response.json();
        console.error('Erro no login:', errorData.error);
        return { success: false };
      }
    } catch (error) {
      console.error('Erro ao fazer login:', error);
      return { success: false };
    }
  };

  const completeFirstLogin = async () => {
    const savedToken = localStorage.getItem('authToken');
    if (savedToken) {
      await verifyToken(savedToken);
      localStorage.removeItem('pendingFirstLogin');
    }
  };

  const logout = () => {
    // Tentar revogar refresh token no servidor
    const refreshToken = localStorage.getItem('refreshToken');
    const currentToken = token;
    if (refreshToken && currentToken) {
      fetch(`${API_BASE_URL}/auth/logout`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${currentToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ refreshToken }),
      }).catch(() => {});
    }

    setUser(null);
    setToken(null);
    setIsImpersonating(false);
    setOriginalUser(null);
    localStorage.removeItem('authToken');
    localStorage.removeItem('refreshToken');
    localStorage.removeItem('pendingFirstLogin');
    sessionStorage.removeItem('isImpersonating');
    sessionStorage.removeItem('originalUser');
    sessionStorage.removeItem('originalToken');
  };

  const updateUser = (userData: Partial<User>, newToken?: string) => {
    if (user) {
      setUser({ ...user, ...userData });
    }
    if (newToken) {
      setToken(newToken);
      localStorage.setItem('authToken', newToken);
    }
  };

  const refreshUser = async (): Promise<boolean> => {
    if (!token) return false;
    try {
      const response = await fetch(`${API_BASE_URL}/auth/verify`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });
      if (!response.ok) return false;
      const data = await response.json();
      if (!data?.success || !data.user) return false;
      setUser(data.user);
      return true;
    } catch (error) {
      console.error('Erro ao atualizar usuário:', error);
      return false;
    }
  };

  const startImpersonation = async (userId: string): Promise<boolean> => {
    if (!token) return false;
    try {
      const response = await fetch(`${API_BASE_URL}/auth/impersonate/${userId}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) return false;
      const data = await response.json();

      // Salvar estado atual antes de impersonar
      sessionStorage.setItem('originalToken', token);
      sessionStorage.setItem('originalUser', JSON.stringify(user));
      sessionStorage.setItem('isImpersonating', 'true');

      setOriginalUser(user);
      setIsImpersonating(true);
      setToken(data.token);
      localStorage.setItem('authToken', data.token);

      // Verificar token do usuário representado para obter perfil completo
      await verifyToken(data.token);
      window.dispatchEvent(new CustomEvent('auth:impersonation-changed'));
      return true;
    } catch (error) {
      console.error('Erro ao iniciar impersonation:', error);
      return false;
    }
  };

  const stopImpersonation = () => {
    const originalToken = sessionStorage.getItem('originalToken');
    if (!originalToken) return;

    setIsImpersonating(false);
    setOriginalUser(null);
    setToken(originalToken);
    localStorage.setItem('authToken', originalToken);
    sessionStorage.removeItem('isImpersonating');
    sessionStorage.removeItem('originalUser');
    sessionStorage.removeItem('originalToken');

    verifyToken(originalToken);
    window.dispatchEvent(new CustomEvent('auth:impersonation-changed'));
  };

  const value: AuthContextType = {
    user,
    token,
    isImpersonating,
    originalUser,
    login,
    completeFirstLogin,
    logout,
    updateUser,
    refreshUser,
    startImpersonation,
    stopImpersonation,
    isLoading
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};
