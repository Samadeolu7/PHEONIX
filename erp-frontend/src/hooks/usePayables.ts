import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  AccountsPayable,
  AccountsPayableListItem,
  CreatePayableRequest,
  UpdatePayableRequest,
  MakePaymentRequest,
  PaymentResult,
  ThreeWayMatchResult,
  PayablesSummary,
  PayablesFilters,
} from '../types/liabilities';
import liabilitiesService from '../services/liabilitiesService';

// ============================================================================
// QUERY KEYS
// ============================================================================

export const payablesKeys = {
  all: ['payables'] as const,
  lists: () => [...payablesKeys.all, 'list'] as const,
  list: (filters?: PayablesFilters) => [...payablesKeys.lists(), filters] as const,
  details: () => [...payablesKeys.all, 'detail'] as const,
  detail: (id: number) => [...payablesKeys.details(), id] as const,
  pendingValidation: () => [...payablesKeys.all, 'pending-validation'] as const,
  failedValidation: () => [...payablesKeys.all, 'failed-validation'] as const,
  overdue: () => [...payablesKeys.all, 'overdue'] as const,
  summary: () => [...payablesKeys.all, 'summary'] as const,
};

// ============================================================================
// QUERIES
// ============================================================================

export const usePayables = (filters?: PayablesFilters) => {
  return useQuery<{ results: AccountsPayableListItem[]; count: number }, Error>({
    queryKey: payablesKeys.list(filters),
    queryFn: () => liabilitiesService.listPayables(filters),
  });
};

export const usePayable = (id: number) => {
  return useQuery<AccountsPayable, Error>({
    queryKey: payablesKeys.detail(id),
    queryFn: () => liabilitiesService.getPayable(id),
    enabled: !!id,
  });
};

export const usePendingValidationPayables = () => {
  return useQuery<AccountsPayableListItem[], Error>({
    queryKey: payablesKeys.pendingValidation(),
    queryFn: liabilitiesService.getPendingValidation,
  });
};

export const useFailedValidationPayables = () => {
  return useQuery<AccountsPayableListItem[], Error>({
    queryKey: payablesKeys.failedValidation(),
    queryFn: liabilitiesService.getFailedValidation,
  });
};

export const useOverduePayables = () => {
  return useQuery<AccountsPayableListItem[], Error>({
    queryKey: payablesKeys.overdue(),
    queryFn: liabilitiesService.getOverduePayables,
  });
};

export const usePayablesSummary = () => {
  return useQuery<PayablesSummary, Error>({
    queryKey: payablesKeys.summary(),
    queryFn: liabilitiesService.getPayablesSummary,
  });
};

// ============================================================================
// MUTATIONS
// ============================================================================

export const useCreatePayable = () => {
  const queryClient = useQueryClient();

  return useMutation<AccountsPayable, Error, CreatePayableRequest>({
    mutationFn: liabilitiesService.createPayable,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: payablesKeys.lists() });
      queryClient.invalidateQueries({ queryKey: payablesKeys.summary() });
    },
  });
};

export const useUpdatePayable = () => {
  const queryClient = useQueryClient();

  return useMutation<AccountsPayable, Error, { id: number; data: UpdatePayableRequest }>({
    mutationFn: ({ id, data }) => liabilitiesService.updatePayable(id, data),
    onSuccess: data => {
      queryClient.invalidateQueries({ queryKey: payablesKeys.lists() });
      queryClient.invalidateQueries({ queryKey: payablesKeys.detail(data.id) });
      queryClient.invalidateQueries({ queryKey: payablesKeys.summary() });
    },
  });
};

export const useDeletePayable = () => {
  const queryClient = useQueryClient();

  return useMutation<void, Error, number>({
    mutationFn: liabilitiesService.deletePayable,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: payablesKeys.lists() });
      queryClient.invalidateQueries({ queryKey: payablesKeys.summary() });
    },
  });
};

export const useValidateThreeWayMatch = () => {
  const queryClient = useQueryClient();

  return useMutation<ThreeWayMatchResult, Error, number>({
    mutationFn: liabilitiesService.validateThreeWayMatch,
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: payablesKeys.detail(id) });
      queryClient.invalidateQueries({ queryKey: payablesKeys.lists() });
      queryClient.invalidateQueries({ queryKey: payablesKeys.pendingValidation() });
      queryClient.invalidateQueries({ queryKey: payablesKeys.failedValidation() });
    },
  });
};

export const useMakePayment = () => {
  const queryClient = useQueryClient();

  return useMutation<PaymentResult, Error, { id: number; data: MakePaymentRequest }>({
    mutationFn: ({ id, data }) => liabilitiesService.makePayment(id, data),
    onSuccess: result => {
      queryClient.invalidateQueries({ queryKey: payablesKeys.detail(result.payable_id) });
      queryClient.invalidateQueries({ queryKey: payablesKeys.lists() });
      queryClient.invalidateQueries({ queryKey: payablesKeys.overdue() });
      queryClient.invalidateQueries({ queryKey: payablesKeys.summary() });
    },
  });
};
