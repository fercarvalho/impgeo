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
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  login: (username: string, password: string) => Promise<LoginResponse>;
  completeFirstLogin: () => Promise<void>;
  logout: () => void;
  updateUser: (userData: Partial<User>, newToken?: string) => void;
  refreshUser: () => Promise<boolean>;
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

  // Decide dinamicamente o endpoint da API:
  // - Em localhost: usa o backend real em 9001
  // - Em produção (GitHub Pages): usa VITE_API_URL se definida, caso contrário "/api" (para o Service Worker mock)
  const API_BASE_URL =
    (typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'))
      ? 'http://localhost:9001/api'
      : ((import.meta as any).env?.VITE_API_URL || '/api');

  useEffect(() => {
    // Verificar se há token salvo no localStorage
    const savedToken = localStorage.getItem('authToken');
    if (savedToken) {
      verifyToken(savedToken);
    } else {
      setIsLoading(false);
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
        // Token inválido, remover do localStorage
        localStorage.removeItem('authToken');
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
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ username, password })
      });

      if (response.ok) {
        const data = await response.json();
        if (data.firstLogin && data.newPassword) {
          localStorage.setItem('authToken', data.token);
          localStorage.setItem('pendingFirstLogin', 'true');
          return {
            success: true,
            firstLogin: true,
            newPassword: data.newPassword
          };
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
    setUser(null);
    setToken(null);
    localStorage.removeItem('authToken');
    localStorage.removeItem('pendingFirstLogin');
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

  const value: AuthContextType = {
    user,
    token,
    login,
    completeFirstLogin,
    logout,
    updateUser,
    refreshUser,
    isLoading
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};
