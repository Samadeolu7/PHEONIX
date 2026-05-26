// Resource Hooks
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { resourceService } from '../services/resourceService';
import { ResourceFilters, CreateResourceData } from '../types/resources';

// Query Keys
export const resourceKeys = {
  all: ['resources'] as const,
  lists: () => [...resourceKeys.all, 'list'] as const,
  list: (params?: ResourceFilters) => [...resourceKeys.lists(), params] as const,
  details: () => [...resourceKeys.all, 'detail'] as const,
  detail: (id: number) => [...resourceKeys.details(), id] as const,
};

// Query Hooks
export const useResources = (params?: ResourceFilters) => {
  return useQuery({
    queryKey: resourceKeys.list(params),
    queryFn: () => resourceService.getResources(params),
    staleTime: 5 * 60 * 1000, // 5 minutes
    placeholderData: previousData => previousData,
  });
};

export const useResource = (id: number, enabled: boolean = true) => {
  return useQuery({
    queryKey: resourceKeys.detail(id),
    queryFn: () => resourceService.getResource(id),
    enabled: enabled && !!id,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
};

export const useActiveResources = () => {
  return useQuery({
    queryKey: resourceKeys.list({ is_active: true }),
    queryFn: () => resourceService.getActiveResources(),
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
};

export const useResourcesByType = (resourceType: string, enabled: boolean = true) => {
  return useQuery({
    queryKey: resourceKeys.list({ resource_type: resourceType, is_active: true }),
    queryFn: () => resourceService.getResourcesByType(resourceType),
    enabled: enabled && !!resourceType,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
};

// Mutation Hooks
export const useCreateResource = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateResourceData) => resourceService.createResource(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: resourceKeys.lists() });
    },
  });
};

export const useUpdateResource = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<CreateResourceData> }) =>
      resourceService.updateResource(id, data),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: resourceKeys.detail(id) });
      queryClient.invalidateQueries({ queryKey: resourceKeys.lists() });
    },
  });
};

export const useDeleteResource = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: number) => resourceService.deleteResource(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: resourceKeys.lists() });
    },
  });
};
