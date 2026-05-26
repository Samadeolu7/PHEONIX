// Service Response Types
export interface ServiceResponse<T = any> {
  data: T;
  message?: string;
  status: number;
}

// Base Service Types
export interface BaseServiceOptions {
  basePath: string;
  useAuth?: boolean;
  useTenant?: boolean;
}

export interface QueryParams {
  [key: string]: string | number | boolean | undefined;
}

export interface ListParams extends QueryParams {
  page?: number;
  pageSize?: number;
  ordering?: string;
  search?: string;
}

// Service Method Types
export interface CreateOptions<T> {
  data: Partial<T>;
  options?: RequestOptions;
}

export interface UpdateOptions<T> {
  id: number | string;
  data: Partial<T>;
  options?: RequestOptions;
}

export interface DeleteOptions {
  id: number | string;
  options?: RequestOptions;
}

export interface BatchOptions<T> {
  items: T[];
  options?: RequestOptions;
}

export interface RequestOptions {
  headers?: Record<string, string>;
  params?: QueryParams;
  signal?: AbortSignal;
}

// Error Types
export interface ServiceError extends Error {
  status?: number;
  code?: string;
  data?: any;
}

// Cache Types
export interface CacheEntry<T> {
  data: T;
  timestamp: number;
  expiresAt: number;
}

export interface CacheOptions {
  ttl?: number; // Time to live in milliseconds
  staleWhileRevalidate?: boolean;
}
