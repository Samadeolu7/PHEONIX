import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  rolePermissionService,
  PermissionMatrixResponse,
  BulkUpdatePayload,
} from '../services/rolePermissionService';

const QUERY_KEY = ['rolePermissions'];

export const usePermissionMatrix = () => {
  return useQuery<PermissionMatrixResponse>({
    queryKey: QUERY_KEY,
    queryFn: async () => {
      try {
        const result = await rolePermissionService.getPermissionMatrix();
        // Ensure we always return a valid object structure
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
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000,
  });
};

export const useBulkUpdatePermissions = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: BulkUpdatePayload) =>
      rolePermissionService.bulkUpdatePermissions(payload),
    onSuccess: () => {
      // Invalidate the matrix to refetch after updates
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
    },
  });
};
