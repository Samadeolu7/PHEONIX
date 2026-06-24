// services/permissionSetupService.ts
import { api } from './api';
import { PERMISSION_REGISTRY, PermModule } from '../config/permissionRegistry';

export interface RoleListItem {
  id: number;
  name: string;
  description: string;
  level: number | null;
  has_policies: boolean;
  policy_count: number;
}

export interface PagePolicy {
  can_view: boolean;
  can_create: boolean;
  can_edit: boolean;
  can_delete: boolean;
  can_approve: boolean;
  can_export: boolean;
  scope: string;
  approval_limit: string | null;
}

export type PolicyMap = Record<string, PagePolicy>;

export interface RolePoliciesResponse {
  role: { id: number; name: string };
  policies: PolicyMap;
}

export const permissionSetupService = {
  /** Sync the frontend registry to the backend (creates Module/ModulePage DB records). */
  async syncRegistry(): Promise<{ synced: boolean; created_modules: number; created_pages: number }> {
    const modules = PERMISSION_REGISTRY.map((m: PermModule) => ({
      code: m.code,
      name: m.name,
      icon: m.icon,
      color: m.color,
      description: m.description || '',
      pages: m.pages.map(p => ({
        code: p.code,
        title: p.title,
        description: p.description || '',
      })),
    }));
    return api.post('/permissions/setup/sync/', { modules });
  },

  /** List all configurable roles for the tenant. */
  async getRoles(): Promise<RoleListItem[]> {
    const res = await api.get('/permissions/setup/roles/');
    return res.roles || [];
  },

  /** Get current policies for a role keyed by "module:page". */
  async getRolePolicies(roleId: number): Promise<RolePoliciesResponse> {
    return api.get(`/permissions/setup/role-policies/${roleId}/`);
  },

  /** Atomically replace all page-level policies for a role. */
  async saveRolePolicies(roleId: number, policies: PolicyMap): Promise<{ saved: number; warnings?: string[] | null }> {
    return api.put(`/permissions/setup/role-policies/${roleId}/`, { policies });
  },
};
