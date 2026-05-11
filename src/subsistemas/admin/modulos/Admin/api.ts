export const getAdminApiBaseUrl = (): string => {
  if (typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')) {
    return 'http://localhost:9001/api';
  }
  return (import.meta as { env?: { VITE_API_URL?: string } }).env?.VITE_API_URL || '/api';
};

// Após a fase 1.3 (cookie httpOnly), Authorization deixou de ser necessário
// no frontend — o cookie viaja automaticamente em fetches same-origin (e via
// `withCredentials: true` no axiosInterceptor / monkey-patch do main.tsx).
export const getAuthHeaders = (): Record<string, string> => ({
  'Content-Type': 'application/json'
});
