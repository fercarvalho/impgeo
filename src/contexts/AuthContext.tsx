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

// API_BASE_URL no nível do módulo — não recomputa em re-render
const isLocalEnv =
  typeof window !== 'undefined' &&
  (window.location.hostname === 'localhost' ||
    window.location.hostname === '127.0.0.1' ||
    window.location.hostname === '0.0.0.0');

const API_BASE_URL: string = isLocalEnv
  ? 'http://localhost:9001/api'
  : ((import.meta.env.VITE_API_URL as string | undefined) ?? '/api');

// Fase 1.3 — auth via cookie httpOnly compartilhado entre subdomínios.
//
// Política de tokens:
//   - O cookie httpOnly `accessToken` é a fonte de verdade. JS não consegue ler.
//   - O backend, em /api/auth/login e /api/auth/refresh, retorna o token também
//     no body para compatibilidade com componentes que ainda fazem
//     `Authorization: Bearer ${token}` manualmente (50+ ocorrências).
//   - Mantemos esse token em STATE React durante a sessão — NÃO em localStorage.
//   - Após F5, o state perde o token; os componentes vão mandar `Bearer null` no
//     header. O backend descarta header inválido e usa o cookie automaticamente.
//   - Impersonation continua via header explícito (impersonatedToken sobrescreve
//     o cookie original).

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
  canManageTcUsers?: boolean;  // F2.4 — permissão delegada para gerenciar tc_users
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
  completeFirstLogin: () => Promise<boolean>;
  logout: () => void;
  updateUser: (userData: Partial<User>, newToken?: string) => void;
  refreshUser: () => Promise<boolean>;
  startImpersonation: (userId: string) => Promise<boolean>;
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

// Fetch helper que SEMPRE inclui credentials para que o cookie httpOnly viaje.
const authFetch = (url: string, options: RequestInit = {}) =>
  fetch(url, { ...options, credentials: 'include' });

// ─── Transporte de impersonation entre subdomínios ───────────────────────────
// #9 (segurança): o token de impersonation deixou de ser espelhado em cookies
// JS-legíveis no domínio-pai (`imp_*`, exfiltráveis por XSS). O backend agora
// entrega um cookie httpOnly `impersonationToken` (Domain=.impgeo.*, 2h) que
// cruza subdomínios nativamente e o JS não lê. Ao chegar num subdomínio novo, a
// UI descobre que está impersonando pelo campo `impersonation` do /auth/verify.
// O `sessionStorage.impersonationToken` permanece APENAS como fallback dev
// cross-port (localhost:9000→9001, onde a cookie pode não viajar) → vira header.

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  // `token` agora vive APENAS em state (sessão) — não em localStorage.
  // Após F5 fica null e o backend usa o cookie automaticamente como fallback.
  // Durante impersonation, recebe o impersonatedToken e tem prioridade no backend.
  const [token, setToken] = useState<string | null>(
    () => sessionStorage.getItem('authToken')
  );
  // Persiste o token no sessionStorage a cada mudança (sobrevive a F5 na mesma aba)
  const persistToken = useCallback((t: string | null) => {
    if (t) sessionStorage.setItem('authToken', t);
    else   sessionStorage.removeItem('authToken');
    setToken(t);
  }, []);
  const [isLoading, setIsLoading] = useState(true);

  const [isImpersonating, setIsImpersonating] = useState<boolean>(
    () => sessionStorage.getItem('isImpersonating') === 'true'
  );
  const [originalUser, setOriginalUser] = useState<User | null>(() => {
    if (sessionStorage.getItem('isImpersonating') !== 'true') return null;
    return safeParseUser(sessionStorage.getItem('originalUser'));
  });

  // verifyToken: revalida sessão usando cookie httpOnly E/OU header Authorization.
  // O header é preenchido a partir do sessionStorage quando disponível, para
  // sobreviver a cenários onde o cookie não chega (cross-origin em dev, SameSite,
  // navegação anônima, etc.). Backend aceita ambos.
  // `tokenForState` opcional: durante impersonation, queremos popular state.token
  // explicitamente porque verifyToken não retorna o JWT no body.
  const verifyToken = useCallback(
    async (
      {
        updateLoading = true,
        tokenForState,
      }: { updateLoading?: boolean; tokenForState?: string | null } = {}
    ): Promise<User | null> => {
      try {
        const persistedToken =
          sessionStorage.getItem('impersonationToken') ??
          sessionStorage.getItem('authToken');
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (persistedToken) headers['Authorization'] = `Bearer ${persistedToken}`;
        const response = await authFetch(`${API_BASE_URL}/auth/verify`, {
          method: 'POST',
          headers,
        });

        if (response.ok) {
          const data = await response.json().catch(() => null) as {
            user?: User;
            impersonation?: { active: boolean; originalUsername?: string | null };
          } | null;
          if (!data?.user) {
            setUser(null);
            persistToken(null);
            return null;
          }
          setUser(data.user);
          // #9: o backend (cookie httpOnly) é a fonte de verdade da impersonation.
          // Isto faz o banner aparecer/sumir corretamente ao cruzar subdomínios,
          // onde o sessionStorage é per-origin e não carrega o estado.
          const impActive = data.impersonation?.active === true;
          setIsImpersonating(impActive);
          if (!impActive) setOriginalUser(null);
          if (tokenForState !== undefined) persistToken(tokenForState);
          return data.user;
        } else {
          setUser(null);
          persistToken(null);
          return null;
        }
      } catch (error) {
        console.error('Erro ao verificar token:', error);
        setUser(null);
        persistToken(null);
        return null;
      } finally {
        if (updateLoading) setIsLoading(false);
      }
    },
    []
  );

  useEffect(() => {
    // F5 / mount inicial: valida a sessão. O cookie httpOnly (accessToken OU,
    // durante impersonation, impersonationToken) viaja sozinho; o verifyToken
    // descobre o estado de impersonation pelo campo `impersonation` da resposta.
    // #9: sem mais hidratação via cookie JS. Em dev cross-port mantemos o token
    // impersonado no sessionStorage como header fallback (a cookie pode não viajar).
    const impersonationToken = sessionStorage.getItem('impersonationToken');
    if (impersonationToken) persistToken(impersonationToken);
    verifyToken({ updateLoading: true });
  }, [verifyToken]);

  const login = useCallback(
    async (username: string, password: string): Promise<LoginResponse> => {
      try {
        const response = await authFetch(`${API_BASE_URL}/auth/login`, {
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

          // Cookie já foi setado pelo backend no Set-Cookie.
          // Guardamos o token em state durante a sessão (compat com componentes
          // que injetam Authorization manualmente).
          persistToken(data.token);

          if (data.firstLogin && data.newPassword) {
            sessionStorage.setItem('pendingFirstLogin', 'true');
            if (data.user) setUser(data.user);
            return { success: true, firstLogin: true, newPassword: data.newPassword };
          }

          if (!data.user) {
            return { success: false, error: 'Resposta inválida do servidor' };
          }
          setUser(data.user);
          sessionStorage.removeItem('pendingFirstLogin');
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

  const completeFirstLogin = useCallback(async (): Promise<boolean> => {
    // Cookie ainda válido após o reset de senha — só revalidamos.
    const result = await verifyToken({ updateLoading: false });
    if (result !== null) {
      sessionStorage.removeItem('pendingFirstLogin');
      return true;
    }
    return false;
  }, [verifyToken]);

  const logout = useCallback(() => {
    // Cookie é limpo pelo backend. Não precisamos enviar refreshToken — ele já
    // viaja no cookie httpOnly se existir.
    authFetch(`${API_BASE_URL}/auth/logout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    }).catch(() => {});

    setUser(null);
    persistToken(null);
    setIsImpersonating(false);
    setOriginalUser(null);
    sessionStorage.removeItem('pendingFirstLogin');
    sessionStorage.removeItem('isImpersonating');
    sessionStorage.removeItem('originalUser');
    sessionStorage.removeItem('impersonationToken');
    // #9: o cookie httpOnly de impersonation é limpo pelo backend em /auth/logout.
  }, []);

  const updateUser = useCallback((userData: Partial<User>, newToken?: string) => {
    // Se já há user → merge parcial (uso típico: atualizar foto/nome).
    // Se prev é null → estabelecendo sessão nova (ex: TerraControlAdminLogin
    // que chama /api/auth/login-terracontrol-admin manualmente, fora do login()).
    // Nesse caso, userData precisa vir como User completo do backend.
    setUser(prev => (prev ? { ...prev, ...userData } : (userData as User)));
    if (newToken) {
      persistToken(newToken);
    }
  }, []);

  const refreshUser = useCallback(async (): Promise<boolean> => {
    try {
      const persistedToken =
        sessionStorage.getItem('impersonationToken') ??
        sessionStorage.getItem('authToken');
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (persistedToken) headers['Authorization'] = `Bearer ${persistedToken}`;
      const response = await authFetch(`${API_BASE_URL}/auth/verify`, {
        method: 'POST',
        headers,
      });
      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          setUser(null);
          persistToken(null);
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
  }, []);

  const impersonatingRef = useRef(false);

  const startImpersonation = useCallback(
    async (userId: string): Promise<boolean> => {
      if (!user || impersonatingRef.current) return false;
      impersonatingRef.current = true;

      const currentUser = user;

      try {
        // Cookie original (superadmin) ainda viaja — backend valida
        const response = await authFetch(`${API_BASE_URL}/auth/impersonate/${userId}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        });

        if (!response.ok) { impersonatingRef.current = false; return false; }
        const data = await response.json().catch(() => null) as { token?: string } | null;
        if (!data?.token) { impersonatingRef.current = false; return false; }

        // #9: o cross-subdomínio agora é o cookie httpOnly setado pelo backend.
        // Guardamos o token no sessionStorage só como fallback dev (header) e o
        // originalUser p/ restaurar de imediato ao encerrar na mesma origem.
        sessionStorage.setItem('originalUser', JSON.stringify(currentUser));
        sessionStorage.setItem('isImpersonating', 'true');
        sessionStorage.setItem('impersonationToken', data.token);

        // Validamos o token impersonado com verify (cookie httpOnly já viaja; o
        // header é redundante mas mantém dev cross-port robusto).
        persistToken(data.token);
        const impersonatedUser = await fetch(`${API_BASE_URL}/auth/verify`, {
          method: 'POST',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${data.token}`,
          },
        }).then(r => r.ok ? r.json() : null).then(d => d?.user as User | undefined).catch(() => undefined);

        if (!impersonatedUser) {
          // Rollback completo — inclui limpar o cookie httpOnly no backend.
          sessionStorage.removeItem('isImpersonating');
          sessionStorage.removeItem('originalUser');
          sessionStorage.removeItem('impersonationToken');
          await fetch(`${API_BASE_URL}/auth/impersonate/stop`, { method: 'POST', credentials: 'include' }).catch(() => {});
          persistToken(null);
          setUser(currentUser);
          impersonatingRef.current = false;
          return false;
        }

        setUser(impersonatedUser);
        setOriginalUser(currentUser);
        setIsImpersonating(true);
        impersonatingRef.current = false;
        window.dispatchEvent(new CustomEvent('auth:impersonation-changed'));
        return true;
      } catch (error) {
        console.error('Erro ao iniciar impersonation:', error);
        sessionStorage.removeItem('isImpersonating');
        sessionStorage.removeItem('originalUser');
        sessionStorage.removeItem('impersonationToken');
        await fetch(`${API_BASE_URL}/auth/impersonate/stop`, { method: 'POST', credentials: 'include' }).catch(() => {});
        persistToken(null);
        setUser(currentUser);
        impersonatingRef.current = false;
        return false;
      }
    },
    [user]
  );

  const stopImpersonation = useCallback(async (): Promise<void> => {
    const storedOriginalUser = safeParseUser(sessionStorage.getItem('originalUser'));

    // #9: encerra no backend PRIMEIRO — limpa o cookie httpOnly de impersonation.
    // Só então o accessToken do superadmin (intacto) volta a valer.
    await fetch(`${API_BASE_URL}/auth/impersonate/stop`, { method: 'POST', credentials: 'include' }).catch(() => {});

    // Limpa o estado client-side (sessionStorage + fallback dev).
    sessionStorage.removeItem('isImpersonating');
    sessionStorage.removeItem('originalUser');
    sessionStorage.removeItem('impersonationToken');

    setIsImpersonating(false);
    setOriginalUser(null);
    persistToken(null); // sem header → cookie original (superadmin) volta a ser usado
    if (storedOriginalUser) setUser(storedOriginalUser);

    // Revalida com o cookie original (superadmin)
    await verifyToken({ updateLoading: false });
    window.dispatchEvent(new CustomEvent('auth:impersonation-changed'));
  }, [verifyToken]);

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
