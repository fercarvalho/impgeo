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
// O estado de "capturar usuário" vive em sessionStorage, que é POR-ORIGEM —
// então ao trocar de subsistema (outro subdomínio) ele se perderia e a sessão
// cairia de volta no superadmin real. Espelhamos o estado em cookies escopados
// no domínio-pai compartilhado (.impgeo.*) só para REPOPULAR o sessionStorage
// ao chegar no novo subdomínio. O backend NÃO lê esses cookies (segue usando o
// Bearer/Authorization); são puro transporte client-side.
const IMP_COOKIE = { on: 'imp_on', tok: 'imp_tok', orig: 'imp_orig' } as const;

function impgeoCookieDomain(): string | null {
  const h = window.location.hostname;
  if (h === 'impgeo.local' || h.endsWith('.impgeo.local')) return '.impgeo.local';
  if (h === 'impgeo.sistemas.viverdepj.com.br' || h.endsWith('.impgeo.sistemas.viverdepj.com.br')) return '.impgeo.sistemas.viverdepj.com.br';
  return null; // localhost puro: same-origin, sessionStorage já basta
}
function readCookie(name: string): string | null {
  const m = document.cookie.match(new RegExp('(?:^|; )' + name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '=([^;]*)'));
  return m ? decodeURIComponent(m[1]) : null;
}
function writeImpCookies(tokenJwt: string, originalUserJson: string): void {
  const domain = impgeoCookieDomain();
  if (!domain) return;
  const secure = window.location.protocol === 'https:' ? '; Secure' : '';
  const base = `; domain=${domain}; path=/; max-age=7200; SameSite=Lax${secure}`;
  document.cookie = `${IMP_COOKIE.on}=1${base}`;
  document.cookie = `${IMP_COOKIE.tok}=${encodeURIComponent(tokenJwt)}${base}`;
  document.cookie = `${IMP_COOKIE.orig}=${encodeURIComponent(originalUserJson)}${base}`;
}
function clearImpCookies(): void {
  const domain = impgeoCookieDomain();
  if (!domain) return;
  const base = `; domain=${domain}; path=/; max-age=0; SameSite=Lax`;
  document.cookie = `${IMP_COOKIE.on}=${base}`;
  document.cookie = `${IMP_COOKIE.tok}=${base}`;
  document.cookie = `${IMP_COOKIE.orig}=${base}`;
}
// Repopula o sessionStorage a partir do cookie ao abrir um subdomínio novo.
function hydrateImpFromCookie(): void {
  if (sessionStorage.getItem('impersonationToken')) return; // já presente nesta origem
  if (readCookie(IMP_COOKIE.on) !== '1') return;
  const tok = readCookie(IMP_COOKIE.tok);
  if (!tok) return;
  sessionStorage.setItem('impersonationToken', tok);
  sessionStorage.setItem('isImpersonating', 'true');
  const orig = readCookie(IMP_COOKIE.orig);
  if (orig) sessionStorage.setItem('originalUser', orig);
}

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
          const data = await response.json().catch(() => null) as { user?: User } | null;
          if (!data?.user) {
            setUser(null);
            persistToken(null);
            return null;
          }
          setUser(data.user);
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
    // F5 / mount inicial: tenta validar a sessão (cookie httpOnly).
    // Antes, repopula a impersonation a partir do cookie (caso tenhamos acabado
    // de chegar de outro subdomínio, onde o sessionStorage não existe).
    hydrateImpFromCookie();
    const impersonationToken = sessionStorage.getItem('impersonationToken');
    if (impersonationToken) {
      persistToken(impersonationToken);
      if (sessionStorage.getItem('isImpersonating') === 'true') {
        setIsImpersonating(true);
        setOriginalUser(safeParseUser(sessionStorage.getItem('originalUser')));
      }
    }
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
    clearImpCookies();
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

        // Persistimos antes de qualquer mudança em state
        const originalUserJson = JSON.stringify(currentUser);
        sessionStorage.setItem('originalUser', originalUserJson);
        sessionStorage.setItem('isImpersonating', 'true');
        sessionStorage.setItem('impersonationToken', data.token);
        // Transporte entre subdomínios (ver helpers no topo do arquivo).
        writeImpCookies(data.token, originalUserJson);

        // Validamos o token impersonado fazendo verify (header tem prioridade
        // — vai usar o impersonationToken via Authorization).
        // Atualizamos state.token para o impersonado.
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
          // Rollback completo
          sessionStorage.removeItem('isImpersonating');
          sessionStorage.removeItem('originalUser');
          sessionStorage.removeItem('impersonationToken');
          clearImpCookies();
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
        clearImpCookies();
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

    // Limpa sessionStorage, cookies de transporte e state da impersonation.
    sessionStorage.removeItem('isImpersonating');
    sessionStorage.removeItem('originalUser');
    sessionStorage.removeItem('impersonationToken');
    clearImpCookies();

    setIsImpersonating(false);
    setOriginalUser(null);
    persistToken(null); // sem header → cookie original (superadmin) volta a ser usado
    if (storedOriginalUser) setUser(storedOriginalUser);

    // Revalida com o cookie original
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
