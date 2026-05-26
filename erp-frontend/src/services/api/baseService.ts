import { apiClient, ApiErrorResponse } from './apiClient';
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
    return apiClient.get<T>(url, { ...config, params: queryParams });
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
    return apiClient.get<PaginatedResponse<T>>(url, { ...config, params });
  }

  protected async post<T>(path: string, data?: unknown, config?: AxiosRequestConfig): Promise<T> {
    const url = this.buildUrl(path);
    return apiClient.post<T>(url, data, config);
  }

  protected async put<T>(path: string, data?: unknown, config?: AxiosRequestConfig): Promise<T> {
    const url = this.buildUrl(path);
    return apiClient.put<T>(url, data, config);
  }

  protected async patch<T>(path: string, data?: unknown, config?: AxiosRequestConfig): Promise<T> {
    const url = this.buildUrl(path);
    return apiClient.patch<T>(url, data, config);
  }

  protected async delete<T>(path: string, config?: AxiosRequestConfig): Promise<T> {
    const url = this.buildUrl(path);
    return apiClient.delete<T>(url, config);
  }

  protected handleError(error: unknown): never {
    if ((error as ApiErrorResponse).message) {
      throw error;
    }
    throw {
      message: 'An unexpected error occurred',
      code: 'UNKNOWN_ERROR',
    };
  }
}
