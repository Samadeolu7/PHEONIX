import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';

// Configure base API URL based on environment
import { env } from '../config/env';

const BASE_URL = env.API_URL;

export interface ApiErrorResponse {
  detail?: string;
  message?: string;
  error?: string;
  errors?: Record<string, string[]>;
}

export const api = axios.create({
  baseURL: BASE_URL,
  headers: {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  },
  withCredentials: true, // Important for handling cookies/CSRF
});

let isRefreshing = false;
let failedQueue: { resolve: Function; reject: Function }[] = [];

const processQueue = (error: Error | null) => {
  failedQueue.forEach(prom => {
    if (error) {
      prom.reject(error);
    } else {
      prom.resolve();
    }
  });
  failedQueue = [];
};

api.interceptors.request.use(config => {
  const token = localStorage.getItem('accessToken') || sessionStorage.getItem('accessToken');
  const tenantSlug = localStorage.getItem('tenant_slug');
  const csrfToken = document.cookie.match(/csrftoken=([^;]+)/)?.[1];

  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  if (tenantSlug) {
    config.headers['X-Tenant-Slug'] = tenantSlug;
  }

  // Add CSRF token for non-GET requests
  if (config.method !== 'get' && csrfToken) {
    config.headers['X-CSRFToken'] = csrfToken;
  }

  return config;
});

api.interceptors.response.use(
  response => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & { _retry?: boolean };

    if (!originalRequest) {
      return Promise.reject(error);
    }

    // Handle 401 Unauthorized errors
    if (error.response?.status === 401 && !originalRequest._retry) {
      // Check if this is a permissions issue (not auth issue) for certain endpoints
      // Don't trigger logout for accounts endpoint - it may return 401 for permission issues
      const url = originalRequest.url || '';
      if (url.includes('/accounts') || url.includes('/accounts/')) {
        console.warn(
          '[Axios] 401 from accounts endpoint - likely permissions issue, not auth failure'
        );
        return Promise.reject(error);
      }

      if (isRefreshing) {
        try {
          // Wait for token refresh
          await new Promise<void>((resolve, reject) => {
            failedQueue.push({ resolve, reject });
          });
          // Retry original request
          return api(originalRequest);
        } catch (err) {
          return Promise.reject(err);
        }
      }

      isRefreshing = true;
      originalRequest._retry = true;

      try {
        const refreshToken = localStorage.getItem('refresh_token');
        if (!refreshToken) {
          throw new Error('No refresh token available');
        }

        // Attempt to refresh the token
        const response = await api.post('/users/auth/refresh/', { refresh: refreshToken });
        const { access } = response.data;

        // Store new access token (use same key as AuthContext)
        localStorage.setItem('accessToken', access);

        // Update authorization headers
        originalRequest.headers.set('Authorization', `Bearer ${access}`);
        api.defaults.headers.common['Authorization'] = `Bearer ${access}`;

        // Process queued requests
        processQueue(null);

        // Retry original request
        return api(originalRequest);
      } catch (refreshError) {
        processQueue(refreshError as Error);
        // Clear tokens on refresh failure (use same keys as AuthContext)
        localStorage.removeItem('accessToken');
        localStorage.removeItem('refresh_token');
        window.location.href = '/login';
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }

    return Promise.reject(error);
  }
);
