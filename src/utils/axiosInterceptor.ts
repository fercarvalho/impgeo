import axios, { AxiosResponse, AxiosError, InternalAxiosRequestConfig } from 'axios';

const isLocalEnv =
  typeof window !== 'undefined' &&
  (window.location.hostname === 'localhost' ||
    window.location.hostname === '127.0.0.1' ||
    window.location.hostname === '0.0.0.0');

const API_BASE_URL: string = isLocalEnv
  ? 'http://localhost:9001/api'
  : ((import.meta.env.VITE_API_URL as string | undefined) ?? '/api');

// Fase 1.3 (subsistemas) — `withCredentials: true` faz o axios enviar e receber
// os cookies httpOnly de auth (accessToken / refreshToken) automaticamente.
// Não lemos mais token de localStorage nem injetamos header Authorization.
const api = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true,
});

// Refresh em paralelo: se múltiplas requisições chegarem com 401 ao mesmo tempo,
// só uma delas dispara o refresh e as outras esperam.
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

api.interceptors.response.use(
  (response: AxiosResponse) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as RetryConfig | undefined;

    if (error.response?.status === 401 && originalRequest && !originalRequest._retry) {
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        }).then(() => api(originalRequest));
      }

      originalRequest._retry = true;
      isRefreshing = true;

      try {
        // O cookie refreshToken vai no request automaticamente via withCredentials.
        // O backend rotaciona e devolve novos cookies. Não precisamos ler nada.
        await axios.post(`${API_BASE_URL}/auth/refresh`, {}, { withCredentials: true });
        processQueue(null);
        return api(originalRequest);
      } catch (refreshError) {
        processQueue(refreshError);
        // Cookie já foi limpo pelo backend (ou era inválido). Volta para o login.
        window.location.href = '/';
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }

    return Promise.reject(error);
  }
);

export default api;
