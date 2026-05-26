/// <reference types="react" />

declare namespace NodeJS {
  interface ProcessEnv {
    REACT_APP_API_URL: string;
    NODE_ENV: 'development' | 'production' | 'test';
  }
}

interface Window {
  __REDUX_DEVTOOLS_EXTENSION_COMPOSE__?: any;
}

// API Response Types
interface ApiResponse<T> {
  data: T;
  message?: string;
  status: number;
}

interface PaginatedResponse<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

// Auth Types
interface User {
  id: number;
  username: string;
  email: string;
  firstName?: string;
  lastName?: string;
  roles: string[];
  permissions: string[];
}

interface AuthTokens {
  access: string;
  refresh: string;
}

interface LoginCredentials {
  usernameOrEmail: string;
  password: string;
}

// Tenant Types
interface Tenant {
  id: number;
  name: string;
  slug: string;
  theme: Record<string, string>;
  config: Record<string, any>;
}

// Error Types
interface ApiError {
  message: string;
  code?: string;
  status?: number;
  errors?: Record<string, string[]>;
}

// Utility Types
type Awaited<T> = T extends Promise<infer U> ? U : T;
type NonNullable<T> = T extends null | undefined ? never : T;
type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends Array<infer U>
    ? Array<DeepPartial<U>>
    : T[P] extends ReadonlyArray<infer U>
      ? ReadonlyArray<DeepPartial<U>>
      : DeepPartial<T[P]>;
};

// React Component Props Types
interface BaseComponentProps {
  className?: string;
  style?: React.CSSProperties;
  children?: React.ReactNode;
}

interface LoadingProps extends BaseComponentProps {
  size?: 'small' | 'medium' | 'large';
  color?: string;
}

interface ErrorProps extends BaseComponentProps {
  error: Error | null;
  onRetry?: () => void;
}
