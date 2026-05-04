import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';

// API_BASE_URL at module level — static value, never recomputed on re-render
const isLocalEnv =
  typeof window !== 'undefined' &&
  (window.location.hostname === 'localhost' ||
    window.location.hostname === '127.0.0.1' ||
    window.location.hostname === '0.0.0.0');

const API_BASE_URL: string = isLocalEnv
  ? 'http://localhost:9001/api'
  // Bug fix #14: cast removed — VITE_API_URL is already typed as string | undefined in vite-env.d.ts
  : (import.meta.env.VITE_API_URL ?? '/api');

// Bug fix #3: interface updated to match actual server response field names.
// Server returns: moduleKey, moduleName, iconName, routePath (not key/name/icon/route/id).
// Previously all four mapped fields were always `undefined` at runtime.
export interface SystemModule {
  moduleKey: string;
  moduleName: string;
  iconName: string;
  description: string;
  routePath?: string | null;
  isActive: boolean;
  isSystem: boolean;
  sortOrder?: number;
  createdAt: string;
  updatedAt: string;
}

// Bug fix #15: explicit return type so API changes are caught at the hook boundary
export interface UseModulesReturn {
  modules: SystemModule[];
  isLoading: boolean;
  // Bug fix #10: error state exported — callers can now distinguish "empty" from "failed"
  error: string | null;
  // Accepts optional AbortSignal so callers can cancel a manual reload if needed
  reload: (signal?: AbortSignal) => Promise<void>;
}

export const useModules = (): UseModulesReturn => {
  const { user, token } = useAuth();
  const [modules, setModules] = useState<SystemModule[]>([]);
  // Bug fix #2: start as false — if user is null, isLoading never gets stuck at true
  const [isLoading, setIsLoading] = useState(false);
  // Bug fix #1 + #10: error state declared (previously setError was called without useState)
  const [error, setError] = useState<string | null>(null);
  // Ref for any in-flight reload() controller — aborted on unmount or next reload()
  const reloadControllerRef = useRef<AbortController | null>(null);

  // Bug fix #8: useCallback([token]) so loadModules is stable per token value.
  //   - Fixes stale closure: token is always current in the fetch headers
  //   - Fixes eslint-disable hack: token is now a real dep, not suppressed
  //   - Fixes reload referential stability: reload reference changes only when token changes
  // Bug fix #5: signal parameter is now actually passed to fetch (was accepted but ignored)
  // Bug fix #12: headers typed as Record<string, string> — safe string index writes
  const loadModules = useCallback(async (signal?: AbortSignal): Promise<void> => {
    setIsLoading(true);
    setError(null);
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
      const res = await fetch(`${API_BASE_URL}/modules-catalog`, { headers, signal });

      // Bug fix #10: HTTP errors now set error state instead of being silently ignored
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string };
        setError(body.error ?? `Erro ao carregar módulos (HTTP ${res.status})`);
        return;
      }

      const data = await res.json() as unknown;
      // Bug fix #11: Array.isArray guard on both branches — data.data might be non-array
      const raw = Array.isArray(data)
        ? data
        : Array.isArray((data as { data?: unknown }).data)
          ? (data as { data: unknown[] }).data
          : [];
      setModules(raw as SystemModule[]);
    } catch (err) {
      // Bug fix #7: AbortError is intentional — do not set error state for it
      if ((err as Error).name === 'AbortError') return;
      setError('Não foi possível conectar ao servidor');
    } finally {
      // Bug fix #7: only update loading state if the request was not intentionally aborted
      if (!signal?.aborted) setIsLoading(false);
    }
  }, [token]);

  // Bug fix #6: AbortController created per effect run — cancelled on unmount or dep change.
  //   Prevents orphaned fetches, race conditions in StrictMode, and setState-after-unmount.
  // Bug fix #2: user === null branch explicitly sets isLoading(false) so it never stays true.
  // Bug fix #9: loadModules (useCallback) is now in deps — when token changes, loadModules
  //   gets a new stable reference, which re-triggers this effect with the updated token.
  useEffect(() => {
    if (!user) {
      setIsLoading(false);
      return;
    }
    const controller = new AbortController();
    loadModules(controller.signal);
    return () => {
      controller.abort();
      // Also abort any in-flight reload() on unmount
      reloadControllerRef.current?.abort();
    };
  }, [user?.id, loadModules]);

  // Bug fix (reload): wraps loadModules with its own AbortController so manual reloads
  // are also protected against setState-after-unmount. Aborts the previous reload if
  // called again before the previous one finishes.
  const reload = useCallback((signal?: AbortSignal): Promise<void> => {
    if (signal) {
      // Caller provided their own signal — use it directly
      return loadModules(signal);
    }
    // No external signal: manage an internal controller
    reloadControllerRef.current?.abort();
    reloadControllerRef.current = new AbortController();
    return loadModules(reloadControllerRef.current.signal);
  }, [loadModules]);

  // Bug fix #13: reload is stable (useCallback [loadModules]) — safe as dep in consumers
  return { modules, isLoading, error, reload };
};
