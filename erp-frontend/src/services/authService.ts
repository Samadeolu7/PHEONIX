import { api } from './api';
import { refreshWithToken } from './tokenClient';
import { permissionService } from './permissionService';

export interface AuthTokens {
  access: string;
  refresh: string;
}

export interface LoginCredentials {
  username: string;
  password: string;
}

export interface RegisterData {
  username: string;
  email: string;
  password: string;
  tenant_name: string;
  domain_type?: string;
  first_name?: string;
  last_name?: string;
}

export interface User {
  id: number;
  username: string;
  email: string;
  first_name: string;
  last_name: string;
  tenant_id: number | null;
  tenant_name: string | null;
  is_owner: boolean;
  is_staff: boolean;
  is_system_admin: boolean; // System-wide admin flag
  is_active_user: boolean; // New field from migration
  branch_id: number | null;
  branch_name?: string | null;
  assigned_dashboard?: number | null; // Updated field name from migration
  assigned_dashboard_id?: number | null; // Keep for backward compatibility
  assigned_dashboard_slug?: string | null;
  role_dashboard_id?: number | null;    // Default dashboard from the user's role
  role_dashboard_slug?: string | null;
  roles: string[];
  permissions?: string[];

  // Add these new fields from your login response
  permission_codes?: string[]; // User's direct permissions
  role_permission_codes?: Record<string, string[]>; // Permissions by role
  roles_permission_codes?: string[]; // Flattened list of all permissions
}

export interface ChangePasswordData {
  old_password: string;
  new_password: string;
}

export interface UpdateProfileData {
  first_name?: string;
  last_name?: string;
  email?: string;
}

class AuthService {
  private readonly TOKEN_KEY = 'accessToken';
  private readonly REFRESH_TOKEN_KEY = 'refreshToken';
  private readonly USER_KEY = 'user';
  private readonly REMEMBER_ME_KEY = 'rememberMe';

  async login(
    credentials: LoginCredentials,
    rememberMe: boolean = false
  ): Promise<{ tokens: AuthTokens; user: User }> {
    try {
      const response = await api.post('/users/auth/login/', credentials);

      const tokens = {
        access: response.access,
        refresh: response.refresh,
      };

      const user = response.user;

      // Validate that we have the required data
      if (!tokens.access || !tokens.refresh) {
        console.error('Missing tokens in response:', response);
        throw new Error('Invalid authentication response: missing tokens');
      }

      if (!user || !user.id) {
        console.error('Missing user data in response:', response);
        throw new Error('Invalid authentication response: missing user data');
      }

      // Add permissions to user object for easy access.
      // Prefer permission_codes (effective permissions, includes '*' for owners/admins)
      // over roles_permission_codes (only role-level codes, misses wildcard for owners).
      const effectivePermissions =
        user.permission_codes && user.permission_codes.length > 0
          ? user.permission_codes
          : user.roles_permission_codes || [];
      user.permissions = effectivePermissions;

      // Store tokens and user based on remember me preference
      this.setTokens(tokens, rememberMe);
      this.setUser(user, rememberMe);

      // Store permissions in localStorage for permissionService
      localStorage.setItem('userPermissions', JSON.stringify(effectivePermissions));
      if (user.role_permission_codes) {
        localStorage.setItem('rolePermissions', JSON.stringify(user.role_permission_codes));
      }

      // Initialise the permission service with the new user's data. This
      // sets the in-memory cache (isSuperUser, userRoles, excludedPermissions)
      // and dispatches 'permissions:updated' so any mounted hooks re-render.
      permissionService.setPermissions(user);

      // Dispatch custom event to notify other components (e.g., AuthContext)
      window.dispatchEvent(new CustomEvent('auth:login', { detail: { user } }));

      return { tokens, user };
    } catch (error: any) {
      console.error('Login error details:', {
        message: error.message,
        response: error.response?.data,
        status: error.response?.status,
      });
      throw new Error(error.response?.data?.detail || error.message || 'Login failed');
    }
  }

  // Update hasPermission to use roles_permission_codes
  hasPermission(permission: string): boolean {
    const user = this.getStoredUser();
    // Check if user is owner (has all permissions)
    if (user?.is_owner) return true;

    // Check roles_permission_codes first
    if (user?.roles_permission_codes?.includes(permission)) return true;

    // Fallback to permissions array
    return user?.permissions?.includes(permission) || false;
  }

  // Get all permissions for current user
  getAllPermissions(): string[] {
    const user = this.getStoredUser();
    if (user?.is_owner) return ['*']; // Owner has all permissions

    return user?.roles_permission_codes || user?.permissions || [];
  }

  // Get role-specific permissions
  getRolePermissions(role: string): string[] {
    const user = this.getStoredUser();
    return user?.role_permission_codes?.[role] || [];
  }

  async register(data: RegisterData): Promise<User> {
    try {
      const response = await api.post('/users/auth/register/', data);
      return response.user;
    } catch (error: any) {
      console.error('Registration error:', error);
      throw new Error(error.error || 'Registration failed');
    }
  }

  async refreshToken(): Promise<AuthTokens> {
    try {
      const refreshToken = this.getRefreshToken();
      if (!refreshToken) {
        throw new Error('No refresh token available');
      }

      console.log('🔄 Refreshing token with:', refreshToken.substring(0, 20) + '...');
      const response = await refreshWithToken(refreshToken);
      const tokens = {
        access: response.access,
        refresh: response.refresh || refreshToken,
      };

      console.log('✅ Received new tokens:', {
        access: tokens.access ? tokens.access.substring(0, 20) + '...' : 'MISSING',
        refresh: tokens.refresh ? tokens.refresh.substring(0, 20) + '...' : 'MISSING',
        refreshChanged: tokens.refresh !== refreshToken,
      });

      // Preserve the remember me preference when refreshing tokens
      const rememberMe = this.getRememberMePreference();
      this.setTokens(tokens, rememberMe);
      return tokens;
    } catch (error: any) {
      console.error('Token refresh error:', error);
      this.logout();
      throw error;
    }
  }

  async getCurrentUser(): Promise<User> {
    try {
      const response = await api.get('/users/auth/me/');
      const user = response;
      const rememberMe = this.getRememberMePreference();
      this.setUser(user, rememberMe);
      return user;
    } catch (error: any) {
      console.error('Get current user error:', error);
      throw error;
    }
  }

  async changePassword(data: ChangePasswordData): Promise<void> {
    try {
      await api.post('/users/auth/change-password/', data);
    } catch (error: any) {
      console.error('Change password error:', error);
      throw new Error(error.error || 'Failed to change password');
    }
  }

  async updateProfile(data: UpdateProfileData): Promise<User> {
    try {
      const response = await api.put('/users/auth/update-profile/', data);
      const user = response.user;
      const rememberMe = this.getRememberMePreference();
      this.setUser(user, rememberMe);
      return user;
    } catch (error: any) {
      console.error('Update profile error:', error);
      throw new Error(error.error || 'Failed to update profile');
    }
  }

  async requestPasswordReset(email: string): Promise<void> {
    try {
      await api.post('/users/auth/reset-password/', { email });
    } catch (error: any) {
      console.error('Password reset error:', error);
      throw new Error(error.error || 'Failed to request password reset');
    }
  }

  async verifyToken(): Promise<boolean> {
    try {
      const response = await api.get('/users/auth/verify/');
      return response.valid === true;
    } catch (error) {
      return false;
    }
  }

  logout(): void {
    localStorage.removeItem(this.TOKEN_KEY);
    localStorage.removeItem(this.REFRESH_TOKEN_KEY);
    localStorage.removeItem(this.USER_KEY);
    localStorage.removeItem(this.REMEMBER_ME_KEY);
    localStorage.removeItem('savedCredentials'); // Clear saved login credentials
    sessionStorage.removeItem(this.TOKEN_KEY);
    sessionStorage.removeItem(this.REFRESH_TOKEN_KEY);
    sessionStorage.removeItem(this.USER_KEY);
  }

  getStoredToken(): string | null {
    return localStorage.getItem(this.TOKEN_KEY) || sessionStorage.getItem(this.TOKEN_KEY);
  }

  getRefreshToken(): string | null {
    return (
      localStorage.getItem(this.REFRESH_TOKEN_KEY) || sessionStorage.getItem(this.REFRESH_TOKEN_KEY)
    );
  }

  getStoredUser(): User | null {
    const userStr = localStorage.getItem(this.USER_KEY) || sessionStorage.getItem(this.USER_KEY);
    if (!userStr) return null;
    try {
      return JSON.parse(userStr);
    } catch {
      return null;
    }
  }

  getRememberMePreference(): boolean {
    return localStorage.getItem(this.REMEMBER_ME_KEY) === 'true';
  }

  isAuthenticated(): boolean {
    return !!this.getStoredToken();
  }

  private setTokens(tokens: AuthTokens, rememberMe: boolean = false): void {
    const storage = rememberMe ? localStorage : sessionStorage;
    storage.setItem(this.TOKEN_KEY, tokens.access);
    if (tokens.refresh) {
      storage.setItem(this.REFRESH_TOKEN_KEY, tokens.refresh);
    }

    // Store remember me preference in localStorage regardless
    if (rememberMe) {
      localStorage.setItem(this.REMEMBER_ME_KEY, 'true');
    } else {
      localStorage.removeItem(this.REMEMBER_ME_KEY);
    }
  }

  private setUser(user: User, rememberMe: boolean = false): void {
    const storage = rememberMe ? localStorage : sessionStorage;
    storage.setItem(this.USER_KEY, JSON.stringify(user));
  }

  hasRole(role: string): boolean {
    const user = this.getStoredUser();
    return user?.roles?.includes(role) || user?.is_owner || false;
  }
}

export const authService = new AuthService();
