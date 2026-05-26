import axios, { AxiosInstance, AxiosRequestConfig, AxiosError } from 'axios';

export interface ApiErrorResponse {
  message: string;
  code: string;
  details?: Record<string, unknown>;
}

interface ApiClientConfig {
  baseURL: string;
  timeout?: number;
  headers?: Record<string, string>;
}

export class ApiClient {
  private client: AxiosInstance;
  private static instance: ApiClient;

  private constructor(config: ApiClientConfig) {
    this.client = axios.create({
      baseURL: config.baseURL,
      timeout: config.timeout || 30000,
      headers: {
        'Content-Type': 'application/json',
        ...config.headers,
      },
    });

    this.setupInterceptors();
  }

  public static getInstance(config?: ApiClientConfig): ApiClient {
    if (!ApiClient.instance) {
      if (!config) {
        throw new Error('API client needs to be initialized with config first');
      }
      ApiClient.instance = new ApiClient(config);
    }
    return ApiClient.instance;
  }

  private setupInterceptors(): void {
    // Request interceptor
    this.client.interceptors.request.use(
      config => {
        // Check for token in multiple possible keys
        const token =
          localStorage.getItem('accessToken') ||
          localStorage.getItem('access_token') ||
          sessionStorage.getItem('accessToken') ||
          sessionStorage.getItem('access_token');
        const tenant = localStorage.getItem('currentTenant');

        if (token) {
          config.headers['Authorization'] = `Bearer ${token}`;
        }
        if (tenant) {
          config.headers['X-Tenant-ID'] = tenant;
        }

        return config;
      },
      error => {
        return Promise.reject(error);
      }
    );

    // Response interceptor
    this.client.interceptors.response.use(
      response => response,
      async (error: AxiosError<ApiErrorResponse>) => {
        const originalRequest = error.config as AxiosRequestConfig & { _retry?: boolean };

        // Handle token refresh
        if (error.response?.status === 401 && !originalRequest._retry) {
          originalRequest._retry = true;

          try {
            const refreshToken = localStorage.getItem('refreshToken');
            if (!refreshToken) {
              throw new Error('No refresh token available');
            }

            // Call token refresh endpoint
            const response = await this.client.post('/auth/refresh', {
              refreshToken,
            });

            const { accessToken } = response.data;
            localStorage.setItem('accessToken', accessToken);

            // Retry the original request
            originalRequest.headers = {
              ...originalRequest.headers,
              Authorization: `Bearer ${accessToken}`,
            };

            return this.client(originalRequest);
          } catch (refreshError) {
            // Refresh token failed - clear auth but don't redirect
            localStorage.removeItem('accessToken');
            localStorage.removeItem('refreshToken');
            // Remove the automatic redirect
            // window.location.href = '/login';
            return Promise.reject(refreshError);
          }
        }

        // Format error response
        if (error.response?.data) {
          return Promise.reject({
            message: error.response.data.message || 'An unexpected error occurred',
            code: error.response.data.code || 'UNKNOWN_ERROR',
            details: error.response.data.details || {},
            status: error.response.status,
          });
        }

        return Promise.reject({
          message: error.message || 'Network error occurred',
          code: 'NETWORK_ERROR',
          status: 0,
        });
      }
    );
  }

  // Generic request methods
  public async get<T>(url: string, config?: AxiosRequestConfig): Promise<T> {
    const response = await this.client.get<T>(url, config);
    return response.data;
  }

  public async post<T>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<T> {
    const response = await this.client.post<T>(url, data, config);
    return response.data;
  }

  public async put<T>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<T> {
    const response = await this.client.put<T>(url, data, config);
    return response.data;
  }

  public async patch<T>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<T> {
    const response = await this.client.patch<T>(url, data, config);
    return response.data;
  }

  public async delete<T>(url: string, config?: AxiosRequestConfig): Promise<T> {
    const response = await this.client.delete<T>(url, config);
    return response.data;
  }
}

// Resolve API base URL from the build-time environment variable so that
// cross-origin deployments (e.g. Vercel preview at erp-cgun.vercel.app) reach
// the real backend instead of falling back to a relative '/api' path that only
// works when the frontend is served behind a same-origin reverse proxy.
const _apiBaseURL =
  (import.meta as Record<string, Record<string, string>>).env?.VITE_API_BASE_URL || '/api';

// Create and export singleton instance
export const apiClient = ApiClient.getInstance({
  baseURL: _apiBaseURL,
});
