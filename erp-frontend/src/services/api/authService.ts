import { BaseService } from './baseService';

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface LoginCredentials {
  username: string;
  password: string;
  tenantId?: string;
}

export interface User {
  id: string;
  username: string;
  email: string;
  tenantId: string;
  roles: string[];
}

export class AuthService extends BaseService {
  constructor() {
    super('/auth');
  }

  async login(credentials: LoginCredentials): Promise<AuthTokens> {
    try {
      const response = await this.post<AuthTokens>('/login', credentials);
      return response;
    } catch (error) {
      return this.handleError(error);
    }
  }

  async refreshToken(refreshToken: string): Promise<AuthTokens> {
    try {
      const response = await this.post<AuthTokens>('/refresh', { refreshToken });
      return response;
    } catch (error) {
      return this.handleError(error);
    }
  }

  async logout(): Promise<void> {
    try {
      await this.post('/logout');
    } catch (error) {
      return this.handleError(error);
    }
  }

  async getCurrentUser(): Promise<User> {
    try {
      return await this.get<User>('/me');
    } catch (error) {
      return this.handleError(error);
    }
  }
}
