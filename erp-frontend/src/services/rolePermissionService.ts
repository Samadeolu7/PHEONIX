import { api } from './api';

// Types based on backend response
export interface Action {
  id: number;
  code: string;
  name: string;
  action_type: string;
  icon: string | null;
  color: string | null;
}

export interface Page {
  id: number;
  title: string;
  actions: Action[];
}

export interface Module {
  id: number;
  code: string;
  name: string;
  icon: string | null;
  color: string | null;
  pages: Page[];
}

export interface Role {
  id: number;
  name: string;
  description: string;
  default_scope?: string;
  default_approval_limit?: string | null;
}

export interface PermissionFlags {
  can_view: boolean;
  can_create: boolean;
  can_edit: boolean;
  can_delete: boolean;
  can_approve: boolean;
  can_export: boolean;
}

export interface PermissionEntry extends PermissionFlags {
  id?: number;
}

export type PermissionMap = Record<string, PermissionEntry>; // key = `${roleId}-${actionId}`

export interface PermissionMatrixResponse {
  modules: Module[];
  roles: Role[];
  permissions: PermissionMap;
}

export interface BulkUpdateItem {
  role_id: number;
  action_id: number;
  can_view?: boolean;
  can_create?: boolean;
  can_edit?: boolean;
  can_delete?: boolean;
  can_approve?: boolean;
  can_export?: boolean;
}

export interface BulkUpdatePayload {
  updates: BulkUpdateItem[];
}

// ── New types for the scope-aware policy system ───────────────────────────────

export interface RolePermissionPolicy {
  id?: number;
  role: number;
  role_name?: string;
  module?: number | null;
  module_name?: string | null;
  page?: number | null;
  page_title?: string | null;
  action?: number | null;
  action_name?: string | null;
  action_code?: string | null;
  can_view: boolean;
  can_create: boolean;
  can_edit: boolean;
  can_delete: boolean;
  can_approve: boolean;
  can_export: boolean;
  scope: string;
  approval_limit: string | null;
  specificity?: number;
}

export interface UserPermissionOverride {
  id?: number;
  user: number;
  user_display?: string;
  module?: number | null;
  module_name?: string | null;
  page?: number | null;
  page_title?: string | null;
  action?: number | null;
  action_name?: string | null;
  action_code?: string | null;
  can_view?: boolean | null;
  can_create?: boolean | null;
  can_edit?: boolean | null;
  can_delete?: boolean | null;
  can_approve?: boolean | null;
  can_export?: boolean | null;
  scope?: string | null;
  scope_ajo_group?: number | null;
  ajo_group_name?: string | null;
  approval_limit?: string | null;
  expiry_type: string;
  expires_at?: string | null;
  expire_after_hours?: number | null;
  expiry_behavior: string;
  is_active: boolean;
  is_suspended: boolean;
  is_elevated: boolean;
  is_currently_active?: boolean;
  is_expired?: boolean;
  effective_expires_at?: string | null;
  hours_until_expiry?: number | null;
  granted_by?: number | null;
  granted_by_display?: string | null;
  granted_at?: string;
  grant_reason?: string;
  revoked_at?: string | null;
  revoked_by?: number | null;
  revoke_reason?: string;
}

export interface EffectivePermissionsResponse {
  can_view: boolean;
  can_create: boolean;
  can_edit: boolean;
  can_delete: boolean;
  can_approve: boolean;
  can_export: boolean;
  scope: string;
  scope_ajo_group_id: number | null;
  approval_limit: string | null;
  is_elevated: boolean;
  elevated_fields: string[];
}

class RolePermissionService {
  // ── Legacy matrix endpoint (unchanged) ───────────────────────────────────

  async getPermissionMatrix(): Promise<PermissionMatrixResponse> {
    try {
      console.log('🔍 Fetching permission matrix...');
      const response = await api.get('/pages/role-action-permissions/matrix/');
      console.log('📥 Raw API response:', response);
      console.log('📥 Response type:', typeof response);
      console.log('📥 Response keys:', response ? Object.keys(response) : 'null');

      let data;
      if (response?.data) {
        data = response.data;
        console.log('📊 Using response.data:', data);
      } else if (response?.success && response?.data !== undefined) {
        data = response.data;
        console.log('📊 Using response.data (success format):', data);
      } else {
        data = response;
        console.log('📊 Using response directly:', data);
      }

      if (!data) {
        console.error('❌ Invalid API response: missing data');
        console.error('❌ Full response:', response);
        throw new Error('Invalid API response: missing data');
      }

      const result = {
        modules: Array.isArray(data.modules) ? data.modules : [],
        roles: Array.isArray(data.roles) ? data.roles : [],
        permissions:
          data.permissions && typeof data.permissions === 'object' ? data.permissions : {},
      };

      console.log('✅ Processed result:', result);
      return result;
    } catch (error) {
      console.error('❌ Error in getPermissionMatrix:', error);
      throw error;
    }
  }

  async bulkUpdatePermissions(payload: BulkUpdatePayload): Promise<void> {
    await api.post('/pages/role-action-permissions/bulk-update/', payload);
  }

  // ── New policy CRUD ───────────────────────────────────────────────────────

  async getRolePolicies(params?: { role?: number; module?: number }): Promise<RolePermissionPolicy[]> {
    const response = await api.get('/permissions/role-policies/', { params });
    return response?.results ?? response ?? [];
  }

  async createRolePolicy(policy: Omit<RolePermissionPolicy, 'id'>): Promise<RolePermissionPolicy> {
    return await api.post('/permissions/role-policies/', policy);
  }

  async updateRolePolicy(id: number, policy: Partial<RolePermissionPolicy>): Promise<RolePermissionPolicy> {
    return await api.patch(`/permissions/role-policies/${id}/`, policy);
  }

  async deleteRolePolicy(id: number): Promise<void> {
    await api.delete(`/permissions/role-policies/${id}/`);
  }

  // ── User override CRUD ────────────────────────────────────────────────────

  async getUserOverrides(params?: {
    user?: number;
    elevated_only?: boolean;
    active_only?: boolean;
  }): Promise<UserPermissionOverride[]> {
    const response = await api.get('/permissions/user-overrides/', { params });
    return response?.results ?? response ?? [];
  }

  async createUserOverride(override: Omit<UserPermissionOverride, 'id'>): Promise<UserPermissionOverride> {
    return await api.post('/permissions/user-overrides/', override);
  }

  async updateUserOverride(id: number, data: Partial<UserPermissionOverride>): Promise<UserPermissionOverride> {
    return await api.patch(`/permissions/user-overrides/${id}/`, data);
  }

  async revokeUserOverride(id: number, reason?: string): Promise<UserPermissionOverride> {
    return await api.post(`/permissions/user-overrides/${id}/revoke/`, { reason: reason ?? '' });
  }

  async suspendUserOverride(id: number): Promise<UserPermissionOverride> {
    return await api.post(`/permissions/user-overrides/${id}/suspend/`);
  }

  async reinstateUserOverride(id: number): Promise<UserPermissionOverride> {
    return await api.post(`/permissions/user-overrides/${id}/reinstate/`);
  }

  // ── Effective permissions ─────────────────────────────────────────────────

  async getEffectivePermissions(
    userId: number,
    context?: { module?: number; page?: number; action?: number }
  ): Promise<EffectivePermissionsResponse> {
    const params: Record<string, number> = { user: userId, ...context };
    return await api.get('/permissions/effective/', { params });
  }

  // ── Exception report ──────────────────────────────────────────────────────

  async getExceptionReport(params?: {
    user?: number;
    expiry_before?: string;
  }): Promise<UserPermissionOverride[]> {
    const response = await api.get('/permissions/exception-report/', { params });
    return Array.isArray(response) ? response : [];
  }

  // ── Elevation log ─────────────────────────────────────────────────────────

  async getElevationLog(params?: {
    user?: number;
    record_type?: string;
    from?: string;
    to?: string;
  }) {
    const response = await api.get('/permissions/elevation-log/', { params });
    return Array.isArray(response) ? response : [];
  }
}

export const rolePermissionService = new RolePermissionService();

  id: number;
  code: string;
  name: string;
  action_type: string;
  icon: string | null;
  color: string | null;
}

export interface Page {
  id: number;
  title: string;
  actions: Action[];
}

export interface Module {
  id: number;
  code: string;
  name: string;
  icon: string | null;
  color: string | null;
  pages: Page[];
}

export interface Role {
  id: number;
  name: string;
  description: string;
}

export interface PermissionFlags {
  can_view: boolean;
  can_create: boolean;
  can_edit: boolean;
  can_delete: boolean;
  can_approve: boolean;
  can_export: boolean;
}

export interface PermissionEntry extends PermissionFlags {
  id?: number;
}

export type PermissionMap = Record<string, PermissionEntry>; // key = `${roleId}-${actionId}`

export interface PermissionMatrixResponse {
  modules: Module[];
  roles: Role[];
  permissions: PermissionMap;
}

export interface BulkUpdateItem {
  role_id: number;
  action_id: number;
  can_view?: boolean;
  can_create?: boolean;
  can_edit?: boolean;
  can_delete?: boolean;
  can_approve?: boolean;
  can_export?: boolean;
}

export interface BulkUpdatePayload {
  updates: BulkUpdateItem[];
}

class RolePermissionService {
  async getPermissionMatrix(): Promise<PermissionMatrixResponse> {
    try {
      console.log('🔍 Fetching permission matrix...');
      const response = await api.get('/pages/role-action-permissions/matrix/');
      console.log('📥 Raw API response:', response);
      console.log('📥 Response type:', typeof response);
      console.log('📥 Response keys:', response ? Object.keys(response) : 'null');

      // Check if response has the expected structure
      let data;
      if (response?.data) {
        // If response has a data property, use it
        data = response.data;
        console.log('📊 Using response.data:', data);
      } else if (response?.success && response?.data !== undefined) {
        // If response has success and data properties at root level
        data = response.data;
        console.log('📊 Using response.data (success format):', data);
      } else {
        // If response is the data itself
        data = response;
        console.log('📊 Using response directly:', data);
      }

      if (!data) {
        console.error('❌ Invalid API response: missing data');
        console.error('❌ Full response:', response);
        throw new Error('Invalid API response: missing data');
      }

      // Ensure we have valid structure
      const result = {
        modules: Array.isArray(data.modules) ? data.modules : [],
        roles: Array.isArray(data.roles) ? data.roles : [],
        permissions:
          data.permissions && typeof data.permissions === 'object' ? data.permissions : {},
      };

      console.log('✅ Processed result:', result);
      return result;
    } catch (error) {
      console.error('❌ Error in getPermissionMatrix:', error);
      throw error;
    }
  }

  async bulkUpdatePermissions(payload: BulkUpdatePayload): Promise<void> {
    await api.post('/pages/role-action-permissions/bulk-update/', payload);
  }
}

export const rolePermissionService = new RolePermissionService();
