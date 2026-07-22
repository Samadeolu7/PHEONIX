import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  tenantManagementService,
  Tenant,
  TenantFilters,
  CreateTenantData,
} from '../services/tenantManagementService';

export const tenantKeys = {
  all: ['tenants'] as const,
  lists: () => [...tenantKeys.all, 'list'] as const,
  list: (filters?: TenantFilters) => [...tenantKeys.lists(), filters] as const,
  details: () => [...tenantKeys.all, 'detail'] as const,
  detail: (id: number) => [...tenantKeys.details(), id] as const,
  options: () => [...tenantKeys.all, 'options'] as const,
};

export function useTenants(filters?: TenantFilters) {
  return useQuery({
    queryKey: tenantKeys.list(filters),
    queryFn: async () => {
      const response = await tenantManagementService.getTenants(filters);
      return {
        results: response.results || [],
        count: response.count || 0,
        next: response.next,
        previous: response.previous,
      };
    },
  });
}

export function useTenant(id: number) {
  return useQuery({
    queryKey: tenantKeys.detail(id),
    queryFn: () => tenantManagementService.getTenant(id),
    enabled: Boolean(id),
  });
}

export function useTenantOptions() {
  return useQuery({
    queryKey: tenantKeys.options(),
    queryFn: () => tenantManagementService.getTenantOptions(),
    staleTime: 5 * 60 * 1000,
  });
}

export function useCreateTenant() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateTenantData) => tenantManagementService.createTenant(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: tenantKeys.all });
    },
  });
}

export function useUpdateTenant() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<CreateTenantData> }) =>
      tenantManagementService.updateTenant(id, data),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: tenantKeys.all });
      queryClient.invalidateQueries({ queryKey: tenantKeys.detail(variables.id) });
    },
  });
}

export function useDeleteTenant() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => tenantManagementService.deleteTenant(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: tenantKeys.all });
    },
  });
}
