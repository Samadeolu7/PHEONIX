// src/services/userManagementService.ts
import { api } from './api';

export interface Permission {
  id: number;
  codename: string;
  name: string;
  content_type: string;
}

export interface PermissionDetail {
  id: number;
  codename: string;
  name: string;
  content_type: string;
}

export interface Role {
  id: number;
  name: string;
  description?: string;
  permissions: string[]; // Array of codenames
  permission_details?: PermissionDetail[]; // Detailed permission info
  default_dashboard?: number | null;
  can_access_dashboards?: number[];
  can_access_modules?: string[];
  can_access_pages?: string[];
  is_active?: boolean;
  user_count?: number;
  created_at?: string;
  updated_at?: string;
}

export interface User {
  id: number;
  username: string;
  email: string;
  first_name: string;
  last_name: string;
  full_name: string;
  tenant: number;
  branch: number | null;
  branch_name: string | null;
  roles: number[];
  role_names: string[];
  assigned_dashboard: number | null;
  assigned_dashboard_name: string | null;
  is_active: boolean;
  is_active_user: boolean;
  is_staff: boolean;
  is_owner: boolean;
  date_joined: string;
  last_login: string | null;
}

export interface Permission {
  id: number;
  codename: string;
  name: string;
  content_type: string;
}

export interface UserStatistics {
  total_users: number;
  active_users: number;
  inactive_users: number;
  users_with_dashboards: number;
  users_by_role: Array<{ role: string; count: number }>;
}

export interface Dashboard {
  id: number;
  name: string;
  slug: string;
  description?: string;
  is_public: boolean;
  is_active: boolean;
}

class UserManagementService {
  // User Management
  async getUsers(): Promise<User[]> {
    // /users/staff-users/ is paginated ({count, next, previous, results}), not
    // a bare array — unwrap here so every caller gets what this method's type
    // signature promises, instead of each one re-implementing the same
    // Array.isArray(...) ? ... : response?.results defensive check.
    const response = await api.get('/users/staff-users/');
    if (Array.isArray(response)) return response;
    return (response as unknown as { results?: User[] })?.results ?? [];
  }

  async getUser(userId: number): Promise<User> {
    const response = await api.get(`/users/staff-users/${userId}/`);
    return response;
  }

  async createUser(userData: Partial<User>): Promise<User> {
    const response = await api.post('/users/staff-users/', userData);
    return response;
  }

  async updateUser(userId: number, userData: Partial<User>): Promise<User> {
    const response = await api.patch(`/users/staff-users/${userId}/`, userData);
    return response;
  }

  async deleteUser(userId: number): Promise<void> {
    await api.delete(`/users/staff-users/${userId}/`);
  }

  async activateUser(userId: number): Promise<void> {
    await api.post(`/users/staff-users/${userId}/activate/`, {});
  }

  async deactivateUser(userId: number): Promise<void> {
    await api.post(`/users/staff-users/${userId}/deactivate/`, {});
  }

  async assignDashboard(userId: number, dashboardId: number | null): Promise<void> {
    await api.post(`/users/staff-users/${userId}/assign_dashboard/`, {
      dashboard_id: dashboardId,
    });
  }

  async updateUserRoles(userId: number, roleIds: number[]): Promise<User> {
    const response = await api.post(`/users/staff-users/${userId}/update_roles/`, {
      role_ids: roleIds,
    });
    return response;
  }

  async getUserStatistics(): Promise<UserStatistics> {
    const response = await api.get('/users/staff-users/statistics/');
    return response;
  }

  // Role Management
  async getRoles(): Promise<Role[]> {
    const response = await api.get('/users/roles/');
    return response;
  }

  async getRole(roleId: number): Promise<Role> {
    const response = await api.get(`/users/roles/${roleId}/`);
    return response;
  }

  async createRole(roleData: Partial<Role>): Promise<Role> {
    const response = await api.post('/users/roles/', roleData);
    return response;
  }

  async updateRole(roleId: number, roleData: Partial<Role>): Promise<Role> {
    const response = await api.patch(`/users/roles/${roleId}/`, roleData);
    return response;
  }

  async deleteRole(roleId: number): Promise<void> {
    await api.delete(`/users/roles/${roleId}/`);
  }

  async getAvailablePermissions(): Promise<Permission[]> {
    const response = await api.get('/users/roles/available_permissions/');
    return response;
  }

  // Dashboard Management (for assignment)
  async getAvailableDashboards(): Promise<Dashboard[]> {
    const response = await api.get('/dashboards/dashboards/');
    return response;
  }
}

export const userManagementService = new UserManagementService();
