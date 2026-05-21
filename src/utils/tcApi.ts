import axios, { AxiosResponse, AxiosError, InternalAxiosRequestConfig } from 'axios';
import { attachOfflineInterceptors } from './offlineClient';

// Instância axios dedicada ao TerraControl (tc_users).
//
// Diferenças em relação ao axios do impgeo ([./axiosInterceptor.ts]):
//   - Refresh endpoint: /tc-auth/refresh (não /auth/refresh)
//   - Em 401 sem refresh válido, redireciona pra raiz do TC público (o
//     TcAuthContext.init() vai tratar — não força um "/" hard reload como
//     o impgeo, que tem um Login global)
//   - Cookies tcAccessToken / tcRefreshToken viajam via withCredentials
//
// Bearer header NÃO é injetado aqui — em prod usamos só cookie httpOnly.
// Em dev cross-port (frontend:9000 → backend:9001) o cookie pode não viajar
// dependendo do SameSite; quando isso for problema na hora de testar,
// rodamos vite com HTTPS local e domínios .terracontrol.local via /etc/hosts.

const isLocalEnv =
  typeof window !== 'undefined' &&
  (window.location.hostname === 'localhost' ||
    window.location.hostname === '127.0.0.1' ||
    window.location.hostname === '0.0.0.0');

const API_BASE_URL: string = isLocalEnv
  ? 'http://localhost:9001/api'
  : ((import.meta.env.VITE_API_URL as string | undefined) ?? '/api');

const tcApi = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true,
});

// Queue paralelo de refresh — múltiplos 401 simultâneos disparam UM refresh só.
let isRefreshing = false;
let failedQueue: Array<{ resolve: (value: unknown) => void; reject: (reason?: unknown) => void }> = [];

const processQueue = (error: unknown) => {
  failedQueue.forEach(({ resolve, reject }) => {
    if (error) reject(error);
    else resolve(null);
  });
  failedQueue = [];
};

interface RetryConfig extends InternalAxiosRequestConfig {
  _retry?: boolean;
}

let onRefreshFailure: (() => void) | null = null;

/**
 * Permite que o TcAuthContext registre o que fazer quando o refresh falha
 * (geralmente: limpar state e redirecionar pra tela de login do TC público).
 */
export function setTcRefreshFailureHandler(handler: (() => void) | null): void {
  onRefreshFailure = handler;
}

tcApi.interceptors.response.use(
  (response: AxiosResponse) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as RetryConfig | undefined;
    if (!originalRequest) return Promise.reject(error);

    // Não tenta refresh em chamadas pro próprio refresh ou login — evita loop.
    const url = originalRequest.url || '';
    if (url.includes('/tc-auth/refresh') || url.includes('/tc-auth/login')) {
      return Promise.reject(error);
    }

    if (error.response?.status === 401 && !originalRequest._retry) {
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        }).then(() => tcApi(originalRequest));
      }

      originalRequest._retry = true;
      isRefreshing = true;

      try {
        await axios.post(`${API_BASE_URL}/tc-auth/refresh`, {}, { withCredentials: true });
        processQueue(null);
        return tcApi(originalRequest);
      } catch (refreshError) {
        processQueue(refreshError);
        onRefreshFailure?.();
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }

    return Promise.reject(error);
  }
);

attachOfflineInterceptors(tcApi);

export default tcApi;
