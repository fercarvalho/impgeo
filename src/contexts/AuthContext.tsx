import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useRef,
  useMemo,
  useCallback,
  ReactNode,
} from 'react';

// Bug fix: API_BASE_URL at module level — never recomputed on re-render
const isLocalEnv =
  typeof window !== 'undefined' &&
  (window.location.hostname === 'localhost' ||
    window.location.hostname === '127.0.0.1' ||
    window.location.hostname === '0.0.0.0');

const API_BASE_URL: string = isLocalEnv
  ? 'http://localhost:9001/api'
  : ((import.meta.env.VITE_API_URL as string | undefined) ?? '/api');

// Bug fix: helper — avoids try/catch duplication when parsing sessionStorage
const safeParseUser = (raw: string | null): User | null => {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as User;
  } catch {
    return null;
  }
};

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
  // Bug fix: returns boolean so caller can detect firstLogin completion failure
  completeFirstLogin: () => Promise<boolean>;
  logout: () => void;
  updateUser: (userData: Partial<User>, newToken?: string) => void;
  refreshUser: () => Promise<boolean>;
  startImpersonation: (userId: string) => Promise<boolean>;
  // Bug fix: async — callers can await before reacting to user change
  stopImpersonation: () => Promise<void>;
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

  // Bug fix #8: initialize BOTH isImpersonating and originalUser lazily from sessionStorage
  // so the first render is always consistent — no race with useEffect restore
  const [isImpersonating, setIsImpersonating] = useState<boolean>(
    () => sessionStorage.getItem('isImpersonating') === 'true'
  );
  const [originalUser, setOriginalUser] = useState<User | null>(() => {
    if (sessionStorage.getItem('isImpersonating') !== 'true') return null;
    return safeParseUser(sessionStorage.getItem('originalUser'));
  });

  // Bug fix #9: `updateLoading` — only set isLoading=false on initial mount verify,
  //             NOT on mid-session calls (startImpersonation, stopImpersonation, etc.)
  // Bug fix #4: catch removes refreshToken as well as authToken
  // Bug fix #10: null-checks data.user before trusting the response
  // `clearStorage` — false when called as sub-operation (e.g. startImpersonation) so the
  //   original user's refreshToken is not silently wiped on an impersonation failure (REGRESSION-1)
  // Returns User | null so callers (startImpersonation, completeFirstLogin) can detect failure
  const verifyToken = useCallback(
    async (
      tokenToVerify: string,
      {
        updateLoading = true,
        clearStorage = true,
      }: { updateLoading?: boolean; clearStorage?: boolean } = {}
    ): Promise<User | null> => {
      try {
        const response = await fetch(`${API_BASE_URL}/auth/verify`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${tokenToVerify}`,
            'Content-Type': 'application/json',
          },
        });

        if (response.ok) {
          const data = await response.json().catch(() => null) as { user?: User } | null;
          // Bug fix #10: server responded OK but no user object → treat as failure
          if (!data?.user) {
            if (clearStorage) {
              localStorage.removeItem('authToken');
              localStorage.removeItem('refreshToken');
            }
            setUser(null);
            setToken(null);
            return null;
          }
          setUser(data.user);
          setToken(tokenToVerify);
          return data.user;
        } else {
          if (clearStorage) {
            localStorage.removeItem('authToken');
            localStorage.removeItem('refreshToken');
          }
          setUser(null);
          setToken(null);
          return null;
        }
      } catch (error) {
        console.error('Erro ao verificar token:', error);
        if (clearStorage) {
          localStorage.removeItem('authToken');
          // Bug fix #4: also clear refreshToken on network error so stale token isn't retried
          localStorage.removeItem('refreshToken');
        }
        setUser(null);
        setToken(null);
        return null;
      } finally {
        // Bug fix #9: only update loading state when explicitly requested (initial load only)
        if (updateLoading) setIsLoading(false);
      }
    },
    [] // API_BASE_URL is a module-level constant; only stable setState calls — no reactive deps
  );

  useEffect(() => {
    const savedToken = localStorage.getItem('authToken');
    if (savedToken) {
      // updateLoading: true (default) — correct for initial mount
      verifyToken(savedToken);
    } else {
      setIsLoading(false);
    }
    // Bug fix: originalUser restore removed — now done lazily in useState initializer above
    // Bug fix: verifyToken is stable (useCallback []), safe to include in deps
  }, [verifyToken]);

  const login = useCallback(
    async (username: string, password: string): Promise<LoginResponse> => {
      try {
        const response = await fetch(`${API_BASE_URL}/auth/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, password }),
        });

        if (response.ok) {
          const data = await response.json().catch(() => null) as {
            token?: string;
            refreshToken?: string;
            user?: User;
            firstLogin?: boolean;
            newPassword?: string;
          } | null;

          if (!data?.token) {
            return { success: false, error: 'Resposta inválida do servidor' };
          }

          if (data.refreshToken) {
            localStorage.setItem('refreshToken', data.refreshToken);
          }

          if (data.firstLogin && data.newPassword) {
            localStorage.setItem('authToken', data.token);
            localStorage.setItem('pendingFirstLogin', 'true');
            // Bug fix #1: populate token in React state during firstLogin modal
            setToken(data.token);
            // Bug fix #10: set user if server provides it alongside firstLogin flag
            if (data.user) setUser(data.user);
            return { success: true, firstLogin: true, newPassword: data.newPassword };
          }

          // Bug fix #10: null-check user on normal login path
          if (!data.user) {
            return { success: false, error: 'Resposta inválida do servidor' };
          }
          setUser(data.user);
          setToken(data.token);
          localStorage.setItem('authToken', data.token);
          localStorage.removeItem('pendingFirstLogin');
          return { success: true, firstLogin: false };
        } else {
          const errorData = await response.json().catch(() => ({})) as { error?: string };
          console.error('Erro no login:', errorData.error);
          return { success: false, error: errorData.error };
        }
      } catch (error) {
        console.error('Erro ao fazer login:', error);
        return { success: false, error: 'Erro de conexão com o servidor' };
      }
    },
    []
  );

  // Bug fix #5: returns boolean so callers know if verify succeeded or failed
  // Bug fix (BUG-2): pendingFirstLogin only removed on success — failure leaves it intact
  //   so a page refresh after a transient network error can retry the completion flow
  const completeFirstLogin = useCallback(async (): Promise<boolean> => {
    const savedToken = localStorage.getItem('authToken');
    if (!savedToken) return false;
    // updateLoading: false — we're not in the initial mount path
    const result = await verifyToken(savedToken, { updateLoading: false });
    if (result !== null) {
      localStorage.removeItem('pendingFirstLogin');
      return true;
    }
    return false;
  }, [verifyToken]);

  const logout = useCallback(() => {
    const refreshToken = localStorage.getItem('refreshToken');
    const currentToken = token;
    if (refreshToken && currentToken) {
      fetch(`${API_BASE_URL}/auth/logout`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${currentToken}`,
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
  }, [token]);

  const updateUser = useCallback((userData: Partial<User>, newToken?: string) => {
    // Bug fix: functional update avoids stale closure — works even if user is null
    setUser(prev => (prev ? { ...prev, ...userData } : prev));
    if (newToken) {
      setToken(newToken);
      localStorage.setItem('authToken', newToken);
    }
  }, []);

  // Bug fix: wrapped in useCallback with `token` dep so the closure is always fresh
  // Bug fix (BUG-4): clears stale auth state on 401 — previously left user/token intact
  //   allowing an indefinitely stale session to persist after the token expired
  const refreshUser = useCallback(async (): Promise<boolean> => {
    if (!token) return false;
    try {
      const response = await fetch(`${API_BASE_URL}/auth/verify`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });
      if (!response.ok) {
        // On 401/403 the token is no longer valid — clear everything so the app redirects to login
        if (response.status === 401 || response.status === 403) {
          setUser(null);
          setToken(null);
          localStorage.removeItem('authToken');
          localStorage.removeItem('refreshToken');
        }
        return false;
      }
      const data = await response.json().catch(() => null) as { success?: boolean; user?: User } | null;
      if (!data?.success || !data.user) return false;
      setUser(data.user);
      return true;
    } catch (error) {
      console.error('Erro ao atualizar usuário:', error);
      return false;
    }
  }, [token]);

  // Mutex ref — prevents concurrent startImpersonation calls (BUG-5)
  const impersonatingRef = useRef(false);

  // Bug fix #6: rollback on verifyToken failure (previously: isImpersonating=true with null user)
  // Bug fix #7: set isImpersonating/originalUser AFTER verifyToken resolves — no inconsistency window
  // Bug fix #11: capture `user` and `token` at call time so the stored value is guaranteed non-null
  // REGRESSION-1 fix: clearStorage:false so original refreshToken is not destroyed on failure
  // BUG-5 fix: mutex ref prevents concurrent calls from interleaving sessionStorage writes
  const startImpersonation = useCallback(
    async (userId: string): Promise<boolean> => {
      if (!token || !user || impersonatingRef.current) return false;
      impersonatingRef.current = true;

      // Capture current state — guaranteed non-null above
      const currentToken = token;
      const currentUser = user;

      try {
        const response = await fetch(`${API_BASE_URL}/auth/impersonate/${userId}`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${currentToken}`,
            'Content-Type': 'application/json',
          },
        });

        if (!response.ok) { impersonatingRef.current = false; return false; }
        const data = await response.json().catch(() => null) as { token?: string } | null;
        if (!data?.token) { impersonatingRef.current = false; return false; }

        // Persist original state to sessionStorage BEFORE any React state changes
        sessionStorage.setItem('originalToken', currentToken);
        sessionStorage.setItem('originalUser', JSON.stringify(currentUser));
        sessionStorage.setItem('isImpersonating', 'true');
        // Prepare localStorage so verifyToken reads the new token
        localStorage.setItem('authToken', data.token);

        // Bug fix #7: verify the impersonated token BEFORE updating isImpersonating state
        // REGRESSION-1: clearStorage:false — do NOT wipe the original user's refreshToken on failure
        const impersonatedUser = await verifyToken(data.token, {
          updateLoading: false,
          clearStorage: false,
        });

        if (!impersonatedUser) {
          // Bug fix #6: full rollback — undo all side-effects
          sessionStorage.removeItem('isImpersonating');
          sessionStorage.removeItem('originalUser');
          sessionStorage.removeItem('originalToken');
          localStorage.setItem('authToken', currentToken);
          // verifyToken (with clearStorage:false) called setUser(null)/setToken(null) — restore manually
          setToken(currentToken);
          setUser(currentUser);
          impersonatingRef.current = false;
          return false;
        }

        // verifyToken already called setUser(impersonatedUser) and setToken(data.token)
        // Now it is safe to commit the impersonation state
        setOriginalUser(currentUser);
        setIsImpersonating(true);
        impersonatingRef.current = false;
        window.dispatchEvent(new CustomEvent('auth:impersonation-changed'));
        return true;
      } catch (error) {
        console.error('Erro ao iniciar impersonation:', error);
        // Rollback any sessionStorage changes
        sessionStorage.removeItem('isImpersonating');
        sessionStorage.removeItem('originalUser');
        sessionStorage.removeItem('originalToken');
        localStorage.setItem('authToken', currentToken);
        setToken(currentToken);
        setUser(currentUser);
        impersonatingRef.current = false;
        return false;
      }
    },
    [token, user, verifyToken]
  );

  // Bug fix #3: async — verifyToken is awaited BEFORE dispatching the event
  //             so consumers that listen to 'auth:impersonation-changed' see an updated user
  // BUG-1 fix: user/token restored OPTIMISTICALLY (synchronously) before the await so there is
  //   no window where isImpersonating=false but user is still the impersonated account.
  //   verifyToken then fetches fresh user data from the server and may update fields.
  const stopImpersonation = useCallback(async (): Promise<void> => {
    const originalToken = sessionStorage.getItem('originalToken');
    const storedOriginalUser = safeParseUser(sessionStorage.getItem('originalUser'));
    if (!originalToken) return;

    // Clean up sessionStorage and localStorage immediately
    sessionStorage.removeItem('isImpersonating');
    sessionStorage.removeItem('originalUser');
    sessionStorage.removeItem('originalToken');
    localStorage.setItem('authToken', originalToken);

    // BUG-1 fix: restore user/token SYNCHRONOUSLY so no render sees isImpersonating=false
    // with a stale impersonated user. verifyToken will overwrite with fresh server data.
    setIsImpersonating(false);
    setOriginalUser(null);
    setUser(storedOriginalUser);
    setToken(originalToken);

    // Bug fix #3: await so user is refreshed from server before notifying consumers
    // clearStorage:false — tokens already managed above; don't let verifyToken wipe refreshToken
    await verifyToken(originalToken, { updateLoading: false, clearStorage: false });
    window.dispatchEvent(new CustomEvent('auth:impersonation-changed'));
  }, [verifyToken]);

  // Bug fix: memoize context value — prevents unnecessary re-renders of all consumers
  const value = useMemo<AuthContextType>(
    () => ({
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
      isLoading,
    }),
    [
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
      isLoading,
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
