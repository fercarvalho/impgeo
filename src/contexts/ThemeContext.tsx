import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

type Theme = 'light' | 'dark';

interface ThemeContextType {
  theme: Theme;
  isDark: boolean;
  toggleTheme: () => void;
  // resetToSystem: lets users return to automatic OS-driven theme
  resetToSystem: () => void;
  // prefersReducedMotion: exposed so consumers can suppress CSS transitions
  prefersReducedMotion: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Storage helpers
// ─────────────────────────────────────────────────────────────────────────────

const STORAGE_KEY = 'impgeo-theme-preference';

// isDemoMode extracted to module level — `import.meta.env` is build-time static,
// and `window.location.hostname` is effectively immutable in a SPA.
// Guard ensures this is safe in SSR/Node environments.
const isDemoMode: boolean =
  (import.meta.env.VITE_DEMO_MODE as string | undefined) === 'true' ||
  (typeof window !== 'undefined' &&
    (window.location.hostname.includes('github.io') ||
      window.location.hostname.includes('demo')));

// try/catch catches SecurityError in Safari private mode / sandboxed iframes.
// Returns null when storage is unavailable — all callers must handle null.
function getStorage(): Storage | null {
  if (typeof window === 'undefined') return null;
  try {
    const storage = isDemoMode ? sessionStorage : localStorage;
    storage.getItem('__probe__'); // confirm storage is actually readable
    return storage;
  } catch {
    return null;
  }
}

function safeGet(key: string): string | null {
  try { return getStorage()?.getItem(key) ?? null; } catch { return null; }
}

function safeSet(key: string, value: string): void {
  try { getStorage()?.setItem(key, value); } catch { /* blocked — ignore */ }
}

function safeRemove(key: string): void {
  try { getStorage()?.removeItem(key); } catch { /* blocked — ignore */ }
}

// ─────────────────────────────────────────────────────────────────────────────
// Context
// ─────────────────────────────────────────────────────────────────────────────

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

// ─────────────────────────────────────────────────────────────────────────────
// Provider
// ─────────────────────────────────────────────────────────────────────────────

export function ThemeProvider({ children }: { children: ReactNode }) {
  // Tracks whether the user has manually chosen a theme.
  // Initialized from storage presence so the choice survives page reloads.
  // When true: system preference changes are ignored; storage is persisted.
  // When false (resetToSystem): system preference is followed; storage is NOT written.
  const userChoseRef = useRef<boolean>(safeGet(STORAGE_KEY) !== null);

  // SSR guard at top of lazy initializer prevents null.getItem() crash.
  // No `as Theme | null` cast — string | null narrowed by explicit guard below.
  const [theme, setTheme] = useState<Theme>(() => {
    if (typeof window === 'undefined') return 'light';
    const saved = safeGet(STORAGE_KEY);
    if (saved === 'light' || saved === 'dark') return saved;
    try {
      if (window.matchMedia('(prefers-color-scheme: dark)').matches) return 'dark';
    } catch { /* matchMedia unavailable */ }
    return 'light';
  });

  // prefers-reduced-motion state
  const [prefersReducedMotion, setPrefersReducedMotion] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; }
  });

  // aria-live announcement for screen readers
  const [announcement, setAnnouncement] = useState('');
  const announceClearTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Apply theme to document ──────────────────────────────────────────────
  // Sets class, color-scheme and data-theme. Also persists to storage —
  // BUT ONLY when userChoseRef is true (manual choice). This is what makes
  // resetToSystem() persist across reloads: when userChoseRef is false the
  // key stays absent, so the next mount reads matchMedia as the initial theme.
  // No cleanup here — cleanup is handled by the dedicated unmount effect below.
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const isDark = theme === 'dark';
    document.documentElement.classList.toggle('dark', isDark);
    document.documentElement.style.colorScheme = isDark ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', theme);
    if (userChoseRef.current) {
      safeSet(STORAGE_KEY, theme);
    }
  }, [theme]);

  // Separate unmount-only cleanup effect — avoids running between theme changes
  // (which would cause a brief flash in StrictMode and between transitions).
  useEffect(() => {
    return () => {
      if (typeof document === 'undefined') return;
      document.documentElement.classList.remove('dark');
      document.documentElement.style.colorScheme = '';
      document.documentElement.removeAttribute('data-theme');
    };
  }, []);

  // ── Announce theme changes to screen readers ─────────────────────────────
  // Uses prevThemeRef comparison instead of isFirstMount so that StrictMode's
  // double-invoke does not announce on the initial load (prevThemeRef equals
  // theme on both invocations, so the condition is false).
  const prevThemeRef = useRef<Theme | null>(null);
  useEffect(() => {
    if (prevThemeRef.current === null || prevThemeRef.current === theme) {
      prevThemeRef.current = theme;
      return;
    }
    prevThemeRef.current = theme;
    if (announceClearTimer.current) clearTimeout(announceClearTimer.current);
    setAnnouncement(`Tema alterado para ${theme === 'dark' ? 'escuro' : 'claro'}`);
    // Clear after 2 s so stale text is not re-read on DOM revisit
    announceClearTimer.current = setTimeout(() => setAnnouncement(''), 2000);
  }, [theme]);

  // Cleanup announcement timer on unmount
  useEffect(() => {
    return () => { if (announceClearTimer.current) clearTimeout(announceClearTimer.current); };
  }, []);

  // ── System preference listener ────────────────────────────────────────────
  // Uses userChoseRef (not storage) — storage is always populated after mount
  // when the user has chosen manually, making the storage check unreliable.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    let mq: MediaQueryList;
    try { mq = window.matchMedia('(prefers-color-scheme: dark)'); } catch { return; }
    const handler = (e: MediaQueryListEvent) => {
      if (!userChoseRef.current) {
        setTheme(e.matches ? 'dark' : 'light');
      }
    };
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  // ── prefers-reduced-motion listener ─────────────────────────────────────
  useEffect(() => {
    if (typeof window === 'undefined') return;
    let mq: MediaQueryList;
    try { mq = window.matchMedia('(prefers-reduced-motion: reduce)'); } catch { return; }
    const handler = (e: MediaQueryListEvent) => setPrefersReducedMotion(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  // ── Cross-tab sync ───────────────────────────────────────────────────────
  // Skipped in demo mode (sessionStorage doesn't propagate cross-tab events).
  // When resetToSystem() fires (e.newValue === null), other tabs reset their
  // userChoseRef and follow system. Since we now only call safeSet when
  // userChoseRef is true, no second storage event fires to re-set it to true.
  useEffect(() => {
    if (typeof window === 'undefined' || isDemoMode) return;
    const handler = (e: StorageEvent) => {
      if (e.key !== STORAGE_KEY) return;
      if (e.newValue === 'light' || e.newValue === 'dark') {
        userChoseRef.current = true;
        setTheme(e.newValue);
      } else if (e.newValue === null) {
        userChoseRef.current = false;
        try {
          const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
          setTheme(prefersDark ? 'dark' : 'light');
        } catch { /* ignore */ }
      }
    };
    window.addEventListener('storage', handler);
    return () => window.removeEventListener('storage', handler);
  }, []);

  // ── Handlers ─────────────────────────────────────────────────────────────

  const toggleTheme = useCallback(() => {
    userChoseRef.current = true;
    setTheme(prev => (prev === 'dark' ? 'light' : 'dark'));
  }, []);

  // resetToSystem: clears the storage key (so the next mount reads matchMedia)
  // and marks userChoseRef false so the apply-effect skips safeSet this cycle.
  // This ensures the reset survives page reloads — the key stays absent.
  const resetToSystem = useCallback(() => {
    userChoseRef.current = false;
    safeRemove(STORAGE_KEY);
    if (typeof window === 'undefined') return;
    try {
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      setTheme(prefersDark ? 'dark' : 'light');
    } catch { setTheme('light'); }
  }, []);

  const value = useMemo<ThemeContextType>(
    () => ({ theme, isDark: theme === 'dark', toggleTheme, resetToSystem, prefersReducedMotion }),
    [theme, toggleTheme, resetToSystem, prefersReducedMotion]
  );

  return (
    <ThemeContext.Provider value={value}>
      {children}
      {/* Visually-hidden aria-live region announces theme changes to screen readers */}
      <div
        role="status"
        aria-live="polite"
        aria-atomic="true"
        style={{
          position: 'absolute',
          width: 1,
          height: 1,
          padding: 0,
          margin: -1,
          overflow: 'hidden',
          clip: 'rect(0,0,0,0)',
          whiteSpace: 'nowrap',
          border: 0,
        }}
      >
        {announcement}
      </div>
    </ThemeContext.Provider>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Hook
// ─────────────────────────────────────────────────────────────────────────────

export const useTheme = (): ThemeContextType => {
  const ctx = useContext(ThemeContext);
  if (ctx === undefined) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
};
