import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  rolePermissionService,
  PermissionMatrixResponse,
  BulkUpdatePayload,
  UserPermissionOverride,
} from '../services/rolePermissionService';

export const rolePermissionKeys = {
  all: ['rolePermissions'] as const,
  matrix: () => [...rolePermissionKeys.all, 'matrix'] as const,
  policies: (params?: { role?: number; module?: number }) =>
    [...rolePermissionKeys.all, 'policies', params] as const,
  userOverrides: (params?: {
    user?: number;
    elevated_only?: boolean;
    active_only?: boolean;
  }) => [...rolePermissionKeys.all, 'userOverrides', params] as const,
  exceptionReport: (params?: { user?: number; expiry_before?: string }) =>
    [...rolePermissionKeys.all, 'exceptionReport', params] as const,
  elevationLog: (params?: {
    user?: number;
    record_type?: string;
    from?: string;
    to?: string;
  }) => [...rolePermissionKeys.all, 'elevationLog', params] as const,
  effectivePermissions: (userId: number, context?: { module?: number; page?: number; action?: number }) =>
    [...rolePermissionKeys.all, 'effectivePermissions', userId, context] as const,
};

export const usePermissionMatrix = () => {
  return useQuery<PermissionMatrixResponse>({
    queryKey: rolePermissionKeys.matrix(),
    queryFn: async () => {
      try {
        const result = await rolePermissionService.getPermissionMatrix();
        return {
          modules: result?.modules || [],
          roles: result?.roles || [],
          permissions: result?.permissions || {},
        };
      } catch (error) {
        console.error('Error fetching permission matrix:', error);
        throw error;
      }
    },
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });
};

export const useBulkUpdatePermissions = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: BulkUpdatePayload) =>
      rolePermissionService.bulkUpdatePermissions(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: rolePermissionKeys.all });
    },
  });
};

// ── Role Policies ─────────────────────────────────────────────────────────────

export function useRolePolicies(params?: { role?: number; module?: number }) {
  return useQuery({
    queryKey: rolePermissionKeys.policies(params),
    queryFn: () => rolePermissionService.getRolePolicies(params),
  });
}

export function useCreateRolePolicy() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (policy: Omit<import('../services/rolePermissionService').RolePermissionPolicy, 'id'>) =>
      rolePermissionService.createRolePolicy(policy),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: rolePermissionKeys.all });
    },
  });
}

export function useUpdateRolePolicy() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      data,
    }: {
      id: number;
      data: Partial<import('../services/rolePermissionService').RolePermissionPolicy>;
    }) => rolePermissionService.updateRolePolicy(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: rolePermissionKeys.all });
    },
  });
}

export function useDeleteRolePolicy() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => rolePermissionService.deleteRolePolicy(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: rolePermissionKeys.all });
    },
  });
}

// ── User Overrides ────────────────────────────────────────────────────────────

export function useUserOverrides(params?: {
  user?: number;
  elevated_only?: boolean;
  active_only?: boolean;
}) {
  return useQuery({
    queryKey: rolePermissionKeys.userOverrides(params),
    queryFn: () => rolePermissionService.getUserOverrides(params),
    enabled: params?.user !== undefined ? params.user > 0 : true,
  });
}

export function useCreateUserOverride() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (override: Omit<UserPermissionOverride, 'id'>) =>
      rolePermissionService.createUserOverride(override),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: rolePermissionKeys.all });
    },
  });
}

export function useUpdateUserOverride() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      data,
    }: {
      id: number;
      data: Partial<UserPermissionOverride>;
    }) => rolePermissionService.updateUserOverride(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: rolePermissionKeys.all });
    },
  });
}

export function useRevokeUserOverride() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reason }: { id: number; reason?: string }) =>
      rolePermissionService.revokeUserOverride(id, reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: rolePermissionKeys.all });
    },
  });
}

export function useSuspendUserOverride() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => rolePermissionService.suspendUserOverride(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: rolePermissionKeys.all });
    },
  });
}

export function useReinstateUserOverride() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => rolePermissionService.reinstateUserOverride(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: rolePermissionKeys.all });
    },
  });
}

// ── Effective Permissions ─────────────────────────────────────────────────────

export function useEffectivePermissions(
  userId: number,
  context?: { module?: number; page?: number; action?: number }
) {
  return useQuery({
    queryKey: rolePermissionKeys.effectivePermissions(userId, context),
    queryFn: () => rolePermissionService.getEffectivePermissions(userId, context),
    enabled: Boolean(userId),
  });
}

// ── Exception Report ──────────────────────────────────────────────────────────

export function useExceptionReport(params?: { user?: number; expiry_before?: string }) {
  return useQuery({
    queryKey: rolePermissionKeys.exceptionReport(params),
    queryFn: () => rolePermissionService.getExceptionReport(params),
  });
}

// ── Elevation Log ─────────────────────────────────────────────────────────────

export function useElevationLog(params?: {
  user?: number;
  record_type?: string;
  from?: string;
  to?: string;
}) {
  return useQuery({
    queryKey: rolePermissionKeys.elevationLog(params),
    queryFn: () => rolePermissionService.getElevationLog(params),
  });
}
