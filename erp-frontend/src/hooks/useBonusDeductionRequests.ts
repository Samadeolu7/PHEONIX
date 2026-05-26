import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { hrService } from '../services/hrService';
import {
  BonusDeductionRequest,
  CreateBonusDeductionRequestData,
  BonusDeductionRequestFilters,
  BonusDeductionPendingCountResponse,
} from '../types/hr';
import { PaginatedResponse } from '../types/inventory';
import { useToast } from '../contexts/ToastContext';

export const useBonusDeductionRequests = (params?: BonusDeductionRequestFilters) => {
  const queryClient = useQueryClient();
  const { success: showSuccess, error: showError } = useToast();

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['bonus-deduction-requests', params],
    queryFn: () => hrService.getBonusDeductionRequests(params),
    staleTime: 1 * 60 * 1000, // 1 minute (frequently changing)
    gcTime: 5 * 60 * 1000, // 5 minutes (renamed from cacheTime in v5)
  });

  const createRequestMutation = useMutation({
    mutationFn: (data: CreateBonusDeductionRequestData) =>
      hrService.createBonusDeductionRequest(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bonus-deduction-requests'] });
      queryClient.invalidateQueries({ queryKey: ['pending-bonus-deduction-count'] });
      showSuccess('Bonus/deduction request created successfully');
    },
    onError: (error: any) => {
      console.error('Failed to create bonus/deduction request:', error);
      showError(error?.response?.data?.message || 'Failed to create bonus/deduction request');
    },
  });

  const approveRequestMutation = useMutation({
    mutationFn: (id: number) => hrService.approveBonusDeductionRequest(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bonus-deduction-requests'] });
      queryClient.invalidateQueries({ queryKey: ['pending-bonus-deduction-count'] });
      showSuccess('Request approved successfully');
    },
    onError: (error: any) => {
      console.error('Failed to approve request:', error);
      showError(error?.response?.data?.message || 'Failed to approve request');
    },
  });

  const rejectRequestMutation = useMutation({
    mutationFn: ({ id, reason }: { id: number; reason: string }) =>
      hrService.rejectBonusDeductionRequest(id, reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bonus-deduction-requests'] });
      queryClient.invalidateQueries({ queryKey: ['pending-bonus-deduction-count'] });
      showSuccess('Request rejected successfully');
    },
    onError: (error: any) => {
      console.error('Failed to reject request:', error);
      showError(error?.response?.data?.message || 'Failed to reject request');
    },
  });

  return {
    requests: (data as PaginatedResponse<BonusDeductionRequest>)?.results || [],
    totalCount: (data as PaginatedResponse<BonusDeductionRequest>)?.count || 0,
    isLoading,
    error,
    refetch,
    createRequest: createRequestMutation.mutate,
    approveRequest: approveRequestMutation.mutate,
    rejectRequest: rejectRequestMutation.mutate,
    isCreating: createRequestMutation.isPending,
    isApproving: approveRequestMutation.isPending,
    isRejecting: rejectRequestMutation.isPending,
  };
};

export const usePendingBonusDeductionCount = () => {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['pending-bonus-deduction-count'],
    queryFn: () => hrService.getPendingBonusDeductionCount(),
    staleTime: 30 * 1000, // 30 seconds (very frequently changing)
    gcTime: 2 * 60 * 1000, // 2 minutes (renamed from cacheTime in v5)
    refetchInterval: 60 * 1000, // Refetch every minute
  });

  return {
    count: (data as BonusDeductionPendingCountResponse)?.count || 0,
    isLoading,
    error,
    refetch,
  };
};

export const useBonusDeductionRequest = (id: number) => {
  const {
    data: request,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ['bonus-deduction-request', id],
    queryFn: () => hrService.getBonusDeductionRequest(id),
    enabled: !!id,
    staleTime: 1 * 60 * 1000, // 1 minute
    gcTime: 5 * 60 * 1000, // 5 minutes (renamed from cacheTime in v5)
  });

  return {
    request,
    isLoading,
    error,
    refetch,
  };
};
