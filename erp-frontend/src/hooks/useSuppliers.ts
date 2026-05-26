// src/hooks/useSuppliers.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  supplierService,
  Supplier,
  SupplierListResponse,
  CreateSupplierData,
} from '../services/supplierService';

// Query Keys
export const supplierKeys = {
  all: ['suppliers'] as const,
  lists: () => [...supplierKeys.all, 'list'] as const,
  list: (params?: any) => [...supplierKeys.lists(), params] as const,
  details: () => [...supplierKeys.all, 'detail'] as const,
  detail: (id: number) => [...supplierKeys.details(), id] as const,
};

// Hooks for queries
export const useSuppliers = (params?: {
  search?: string;
  is_active?: boolean;
  page?: number;
  page_size?: number;
  ordering?: string;
}) => {
  return useQuery({
    queryKey: supplierKeys.list(params),
    queryFn: () => supplierService.getSuppliers(params),
    placeholderData: previousData => previousData,
  });
};

export const useAllSuppliers = (params?: {
  search?: string;
  is_active?: boolean;
  ordering?: string;
  page_size?: number;
}) => {
  return useQuery({
    queryKey: [...supplierKeys.lists(), 'all', params],
    queryFn: () => supplierService.getAllSuppliers(params),
  });
};

export const useSupplier = (id: number, enabled: boolean = true) => {
  return useQuery({
    queryKey: supplierKeys.detail(id),
    queryFn: () => supplierService.getSupplier(id),
    enabled: enabled && !!id,
  });
};

// Hooks for mutations
export const useCreateSupplier = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateSupplierData) => supplierService.createSupplier(data),
    onSuccess: () => {
      // Invalidate and refetch supplier lists
      queryClient.invalidateQueries({ queryKey: supplierKeys.lists() });
    },
  });
};

export const useUpdateSupplier = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<CreateSupplierData> }) =>
      supplierService.updateSupplier(id, data),
    onSuccess: (updatedSupplier, { id }) => {
      // Update the specific supplier in cache
      queryClient.setQueryData(supplierKeys.detail(id), updatedSupplier);
      // Invalidate supplier lists to reflect changes
      queryClient.invalidateQueries({ queryKey: supplierKeys.lists() });
    },
  });
};

export const useDeleteSupplier = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: number) => supplierService.deleteSupplier(id),
    onSuccess: (_, deletedId) => {
      // Remove from cache
      queryClient.removeQueries({ queryKey: supplierKeys.detail(deletedId) });
      // Invalidate lists to reflect deletion
      queryClient.invalidateQueries({ queryKey: supplierKeys.lists() });
    },
  });
};

// Additional supplier action hooks
export const useActivateSupplier = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: number) => supplierService.activateSupplier(id),
    onSuccess: (_, id) => {
      // Invalidate supplier detail and lists
      queryClient.invalidateQueries({ queryKey: supplierKeys.detail(id) });
      queryClient.invalidateQueries({ queryKey: supplierKeys.lists() });
    },
  });
};

export const useDeactivateSupplier = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: number) => supplierService.deactivateSupplier(id),
    onSuccess: (_, id) => {
      // Invalidate supplier detail and lists
      queryClient.invalidateQueries({ queryKey: supplierKeys.detail(id) });
      queryClient.invalidateQueries({ queryKey: supplierKeys.lists() });
    },
  });
};
