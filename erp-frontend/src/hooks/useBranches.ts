import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { branchService, Branch, BranchFilters, CreateBranchData } from '../services/branchService';

export const branchKeys = {
  all: ['branches'] as const,
  lists: () => [...branchKeys.all, 'list'] as const,
  list: (filters?: BranchFilters) => [...branchKeys.lists(), filters] as const,
  details: () => [...branchKeys.all, 'detail'] as const,
  detail: (id: number) => [...branchKeys.details(), id] as const,
  options: () => [...branchKeys.all, 'options'] as const,
};

export function useBranches(filters?: BranchFilters) {
  return useQuery({
    queryKey: branchKeys.list(filters),
    queryFn: async () => {
      const response = await branchService.getBranches(filters);
      return {
        results: response.results || [],
        count: response.count || 0,
        next: response.next,
        previous: response.previous,
      };
    },
  });
}

export function useBranch(id: number) {
  return useQuery({
    queryKey: branchKeys.detail(id),
    queryFn: () => branchService.getBranch(id),
    enabled: Boolean(id),
  });
}

export function useBranchOptions() {
  return useQuery({
    queryKey: branchKeys.options(),
    queryFn: () => branchService.getBranchOptions(),
    staleTime: 5 * 60 * 1000,
  });
}

export function useCreateBranch() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateBranchData) => branchService.createBranch(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: branchKeys.all });
    },
  });
}

export function useUpdateBranch() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<CreateBranchData> }) =>
      branchService.updateBranch(id, data),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: branchKeys.all });
      queryClient.invalidateQueries({ queryKey: branchKeys.detail(variables.id) });
    },
  });
}

export function useDeleteBranch() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => branchService.deleteBranch(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: branchKeys.all });
    },
  });
}

export function useCloneBranchConfig() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      sourceBranchId,
      targetBranchId,
    }: {
      sourceBranchId: number;
      targetBranchId: number;
    }) => branchService.cloneConfig(sourceBranchId, targetBranchId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: branchKeys.all });
    },
  });
}
