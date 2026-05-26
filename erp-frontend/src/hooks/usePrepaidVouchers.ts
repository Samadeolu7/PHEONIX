// Prepaid Voucher Hooks
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { prepaidVoucherService } from '../services/prepaidVoucherService';
import { VoucherFilters, CreateVoucherData } from '../types/vouchers';

// Query Keys
export const voucherKeys = {
  all: ['prepaid-vouchers'] as const,
  lists: () => [...voucherKeys.all, 'list'] as const,
  list: (params?: VoucherFilters) => [...voucherKeys.lists(), params] as const,
  details: () => [...voucherKeys.all, 'detail'] as const,
  detail: (id: number) => [...voucherKeys.details(), id] as const,
  balance: (id: number) => [...voucherKeys.all, 'balance', id] as const,
};

// Query Hooks
export const useVouchers = (params?: VoucherFilters) => {
  return useQuery({
    queryKey: voucherKeys.list(params),
    queryFn: () => prepaidVoucherService.getVouchers(params),
    staleTime: 60 * 1000, // 1 minute
    placeholderData: previousData => previousData,
  });
};

export const useVoucher = (id: number, enabled: boolean = true) => {
  return useQuery({
    queryKey: voucherKeys.detail(id),
    queryFn: () => prepaidVoucherService.getVoucher(id),
    enabled: enabled && !!id,
    staleTime: 60 * 1000, // 1 minute
  });
};

export const useVoucherBalance = (id: number, enabled: boolean = true) => {
  return useQuery({
    queryKey: voucherKeys.balance(id),
    queryFn: () => prepaidVoucherService.getVoucherBalance(id),
    enabled: enabled && !!id,
    staleTime: 30 * 1000, // 30 seconds
    refetchInterval: 60 * 1000, // Refetch every minute
  });
};

export const useActiveVouchers = (resourceId?: number, assetId?: number) => {
  return useQuery({
    queryKey: voucherKeys.list({
      status: 'available',
      resource: resourceId,
      linked_asset: assetId,
    }),
    queryFn: () => prepaidVoucherService.getActiveVouchers(resourceId, assetId),
    staleTime: 60 * 1000, // 1 minute
  });
};

export const useVouchersByResource = (resourceId: number, enabled: boolean = true) => {
  return useQuery({
    queryKey: voucherKeys.list({ resource: resourceId, status: 'active' }),
    queryFn: () => prepaidVoucherService.getVouchersByResource(resourceId),
    enabled: enabled && !!resourceId,
    staleTime: 60 * 1000, // 1 minute
  });
};

export const useVouchersByAsset = (assetId: number, enabled: boolean = true) => {
  return useQuery({
    queryKey: voucherKeys.list({ linked_asset: assetId, status: 'active' }),
    queryFn: () => prepaidVoucherService.getVouchersByAsset(assetId),
    enabled: enabled && !!assetId,
    staleTime: 60 * 1000, // 1 minute
  });
};

export const useExpiringVouchers = (days: number = 7) => {
  return useQuery({
    queryKey: [...voucherKeys.all, 'expiring', days],
    queryFn: () => prepaidVoucherService.getExpiringVouchers(days),
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
};

export const useVoucherConsumptions = (id: number, enabled: boolean = true) => {
  return useQuery({
    queryKey: [...voucherKeys.all, 'consumptions', id],
    queryFn: () => prepaidVoucherService.getVoucherConsumptions(id),
    enabled: enabled && !!id,
    staleTime: 60 * 1000, // 1 minute
  });
};

// Mutation Hooks
export const useCreateVoucher = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateVoucherData) => prepaidVoucherService.createVoucher(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: voucherKeys.lists() });
    },
  });
};

export const useUpdateVoucher = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<CreateVoucherData> }) =>
      prepaidVoucherService.updateVoucher(id, data),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: voucherKeys.detail(id) });
      queryClient.invalidateQueries({ queryKey: voucherKeys.balance(id) });
      queryClient.invalidateQueries({ queryKey: voucherKeys.lists() });
    },
  });
};

export const useDeleteVoucher = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: number) => prepaidVoucherService.deleteVoucher(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: voucherKeys.lists() });
    },
  });
};

export const useActivateVoucher = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: number) => prepaidVoucherService.activateVoucher(id),
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: voucherKeys.detail(id) });
      queryClient.invalidateQueries({ queryKey: voucherKeys.lists() });
    },
  });
};

export const useCancelVoucher = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, reason }: { id: number; reason?: string }) =>
      prepaidVoucherService.cancelVoucher(id, reason),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: voucherKeys.detail(id) });
      queryClient.invalidateQueries({ queryKey: voucherKeys.lists() });
    },
  });
};
