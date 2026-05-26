export interface AuthTokens {
  access: string;
  refresh: string;
}

export interface LoginCredentials {
  username: string;
  password: string;
}

export interface User {
  id: number;
  username: string;
  email: string;
  firstName?: string;
  lastName?: string;
  is_active_user?: boolean; // New field from migration
  assigned_dashboard?: number | null; // New field from migration
  roles: string[];
}

export interface TenantInfo {
  id: number;
  name: string;
  slug: string;
  theme: {
    primaryColor: string;
    secondaryColor: string;
    backgroundColor: string;
    textColor: string;
  };
  settings: Record<string, any>;
}
