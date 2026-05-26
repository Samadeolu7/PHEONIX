import { api as apiClient, type ApiErrorResponse } from '../api/axios';
import { AxiosRequestConfig } from 'axios';

export interface PaginationParams {
  page: number;
  limit: number;
  sort?: string;
  order?: 'asc' | 'desc';
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface QueryParams {
  [key: string]: string | number | boolean | undefined;
}

export class BaseService {
  protected basePath: string;

  constructor(basePath: string) {
    this.basePath = basePath;
  }

  protected buildUrl(path: string): string {
    return `${this.basePath}${path}`;
  }

  protected async get<T>(
    path: string,
    queryParams?: QueryParams,
    config?: AxiosRequestConfig
  ): Promise<T> {
    const url = this.buildUrl(path);
    const response = await api.get<T>(url, { ...config, params: queryParams });
    return response.data;
  }

  protected async getPaginated<T>(
    path: string,
    paginationParams: PaginationParams,
    queryParams?: QueryParams,
    config?: AxiosRequestConfig
  ): Promise<PaginatedResponse<T>> {
    const url = this.buildUrl(path);
    const params = {
      ...paginationParams,
      ...queryParams,
    };
    const response = await api.get<PaginatedResponse<T>>(url, { ...config, params });
    return response.data;
  }

  protected async post<T>(path: string, data?: unknown, config?: AxiosRequestConfig): Promise<T> {
    const url = this.buildUrl(path);
    const response = await api.post<T>(url, data, config);
    return response.data;
  }

  protected async put<T>(path: string, data?: unknown, config?: AxiosRequestConfig): Promise<T> {
    const url = this.buildUrl(path);
    const response = await api.put<T>(url, data, config);
    return response.data;
  }

  protected async patch<T>(path: string, data?: unknown, config?: AxiosRequestConfig): Promise<T> {
    const url = this.buildUrl(path);
    const response = await api.patch<T>(url, data, config);
    return response.data;
  }

  protected async delete<T>(path: string, config?: AxiosRequestConfig): Promise<T> {
    const url = this.buildUrl(path);
    const response = await api.delete<T>(url, config);
    return response.data;
  }

  protected handleError(error: unknown): never {
    if (error instanceof Error) {
      throw error;
    }

    const apiError = error as ApiErrorResponse;
    if (apiError.response?.data) {
      const message =
        typeof apiError.response.data === 'string'
          ? apiError.response.data
          : (apiError.response.data as any).detail || 'An error occurred';
      throw new Error(message);
    }

    throw new Error('An unexpected error occurred');
  }
}
