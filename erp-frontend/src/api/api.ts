import axios from 'axios';
import { refreshWithToken } from '../services/tokenClient';

// Determine base URL from environment. If `VITE_API_URL` is set, use it
// (useful for pointing at a deployed backend). Otherwise fall back to
// '/api' which will be proxied to the backend in development via Vite.
const BASE_URL = (import.meta.env.VITE_API_URL as string) || '/api';

const api = axios.create({
  baseURL: BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Add request interceptor to add auth token
// authService stores tokens in sessionStorage (no remember-me) or localStorage (remember-me),
// so we must check both.
api.interceptors.request.use(
  config => {
    const token = localStorage.getItem('accessToken') || sessionStorage.getItem('accessToken');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  error => {
    return Promise.reject(error);
  }
);

// Add response interceptor to handle auth errors and token refresh
api.interceptors.response.use(
  response => response,
  async error => {
    const originalRequest = error.config;

    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;

      const refreshToken =
        localStorage.getItem('refreshToken') || sessionStorage.getItem('refreshToken');
      if (refreshToken) {
        try {
          // Refresh using a lightweight token client (no interceptors)
          const tokens = await refreshWithToken(refreshToken);

          // Persist tokens using same storage strategy as authService
          const remember = localStorage.getItem('rememberMe') === 'true';
          if (remember) {
            localStorage.setItem('accessToken', tokens.access);
            if (tokens.refresh) localStorage.setItem('refreshToken', tokens.refresh);
          } else {
            sessionStorage.setItem('accessToken', tokens.access);
            if (tokens.refresh) sessionStorage.setItem('refreshToken', tokens.refresh);
          }

          // Retry the original request with new token
          originalRequest.headers.Authorization = `Bearer ${tokens.access}`;
          return api(originalRequest);
        } catch (refreshError) {
          // Refresh failed, clear all storage and redirect
          localStorage.removeItem('accessToken');
          localStorage.removeItem('refreshToken');
          sessionStorage.removeItem('accessToken');
          sessionStorage.removeItem('refreshToken');
          window.location.href = '/login';
        }
      } else {
        // No refresh token available anywhere — session truly expired
        localStorage.removeItem('accessToken');
        sessionStorage.removeItem('accessToken');
        window.location.href = '/login';
      }
    }

    return Promise.reject(error);
  }
);

export { api };
export type ApiErrorResponse = {
  response?: {
    data?: any;
    status?: number;
  };
  message: string;
};
