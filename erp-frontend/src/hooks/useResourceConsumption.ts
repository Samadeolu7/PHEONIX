// Resource Consumption Hooks
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { resourceConsumptionService } from '../services/resourceConsumptionService';
import {
  ResourceConsumption,
  ConsumptionFilters,
  CreatePrepaidConsumption,
  CreatePostpaidConsumption,
} from '../types/consumption';

// Query Keys
export const consumptionKeys = {
  all: ['resource-consumptions'] as const,
  lists: () => [...consumptionKeys.all, 'list'] as const,
  list: (params?: ConsumptionFilters) => [...consumptionKeys.lists(), params] as const,
  details: () => [...consumptionKeys.all, 'detail'] as const,
  detail: (id: number) => [...consumptionKeys.details(), id] as const,
  irregularities: () => [...consumptionKeys.all, 'irregularities'] as const,
  assetSummary: (assetId: number, days: number) =>
    [...consumptionKeys.all, 'asset-summary', assetId, days] as const,
};

// Query Hooks
export const useConsumptions = (params?: ConsumptionFilters) => {
  return useQuery({
    queryKey: consumptionKeys.list(params),
    queryFn: () => resourceConsumptionService.getConsumptions(params),
    staleTime: 30 * 1000, // 30 seconds
    placeholderData: previousData => previousData,
  });
};

export const useConsumption = (id: number, enabled: boolean = true) => {
  return useQuery({
    queryKey: consumptionKeys.detail(id),
    queryFn: () => resourceConsumptionService.getConsumption(id),
    enabled: enabled && !!id,
    staleTime: 60 * 1000, // 1 minute
  });
};

export const useIrregularities = () => {
  return useQuery({
    queryKey: consumptionKeys.irregularities(),
    queryFn: () => resourceConsumptionService.getIrregularities(),
    staleTime: 30 * 1000, // 30 seconds
    refetchInterval: 60 * 1000, // Refetch every minute
  });
};

export const useAssetSummary = (assetId: number, days: number = 30, enabled: boolean = true) => {
  return useQuery({
    queryKey: consumptionKeys.assetSummary(assetId, days),
    queryFn: () => resourceConsumptionService.getAssetSummary(assetId, days),
    enabled: enabled && !!assetId,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
};

// Mutation Hooks
export const useCreateConsumption = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreatePrepaidConsumption | CreatePostpaidConsumption) =>
      resourceConsumptionService.createConsumption(data),
    onSuccess: () => {
      // Invalidate and refetch consumption lists
      queryClient.invalidateQueries({ queryKey: consumptionKeys.lists() });
      queryClient.invalidateQueries({ queryKey: consumptionKeys.irregularities() });
    },
  });
};

export const useUpdateConsumption = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      id,
      data,
    }: {
      id: number;
      data: Partial<CreatePrepaidConsumption | CreatePostpaidConsumption>;
    }) => resourceConsumptionService.updateConsumption(id, data),
    onSuccess: (_, { id }) => {
      // Invalidate specific consumption and lists
      queryClient.invalidateQueries({ queryKey: consumptionKeys.detail(id) });
      queryClient.invalidateQueries({ queryKey: consumptionKeys.lists() });
      queryClient.invalidateQueries({ queryKey: consumptionKeys.irregularities() });
    },
  });
};

export const useDeleteConsumption = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: number) => resourceConsumptionService.deleteConsumption(id),
    onSuccess: () => {
      // Invalidate consumption lists
      queryClient.invalidateQueries({ queryKey: consumptionKeys.lists() });
      queryClient.invalidateQueries({ queryKey: consumptionKeys.irregularities() });
    },
  });
};

// Workflow Mutations
export const useSubmitForApproval = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: number) => resourceConsumptionService.submitForApproval(id),
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: consumptionKeys.detail(id) });
      queryClient.invalidateQueries({ queryKey: consumptionKeys.lists() });
      queryClient.invalidateQueries({ queryKey: consumptionKeys.irregularities() });
    },
  });
};

export const useApproveConsumption = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, notes }: { id: number; notes?: string }) =>
      resourceConsumptionService.approveConsumption(id, notes),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: consumptionKeys.detail(id) });
      queryClient.invalidateQueries({ queryKey: consumptionKeys.lists() });
      queryClient.invalidateQueries({ queryKey: consumptionKeys.irregularities() });
    },
  });
};

export const useRejectConsumption = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, reason }: { id: number; reason: string }) =>
      resourceConsumptionService.rejectConsumption(id, reason),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: consumptionKeys.detail(id) });
      queryClient.invalidateQueries({ queryKey: consumptionKeys.lists() });
      queryClient.invalidateQueries({ queryKey: consumptionKeys.irregularities() });
    },
  });
};

// Posting Mutations
export const usePostConsumption = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, explanation }: { id: number; explanation?: string }) =>
      resourceConsumptionService.postConsumption(id, explanation),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: consumptionKeys.detail(id) });
      queryClient.invalidateQueries({ queryKey: consumptionKeys.lists() });
      queryClient.invalidateQueries({ queryKey: consumptionKeys.irregularities() });
    },
  });
};

export const useBulkPost = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ ids, forcePost }: { ids: number[]; forcePost?: boolean }) =>
      resourceConsumptionService.bulkPost(ids, forcePost),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: consumptionKeys.lists() });
      queryClient.invalidateQueries({ queryKey: consumptionKeys.irregularities() });
    },
  });
};
