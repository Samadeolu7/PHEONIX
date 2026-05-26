export interface PaginatedResponse<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

export interface ApiError {
  detail: string;
  code?: string;
  field?: string;
}

export interface ApiResponse<T> {
  data: T;
  error?: ApiError;
  message?: string;
}

export interface UpdateResponse<T> {
  data: T;
  message: string;
  status: 'success' | 'error';
}
