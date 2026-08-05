import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { pettyCashService } from '../services/pettyCashService';
import {
  PettyCashFundFilters,
  PettyCashVoucherFilters,
  PettyCashReplenishmentFilters,
  CreatePettyCashFund,
  CreatePettyCashVoucher,
  CreatePettyCashReplenishment,
  VoucherActionData,
  ReplenishmentActionData,
} from '../types/pettyCash';

// ============================================
// QUERY KEYS
// ============================================

export const pettyCashKeys = {
  all: ['petty-cash'] as const,

  funds: () => [...pettyCashKeys.all, 'funds'] as const,
  fundsList: (filters?: PettyCashFundFilters) => [...pettyCashKeys.funds(), filters] as const,
  fundDetail: (id: number) => [...pettyCashKeys.funds(), id] as const,
  fundSummary: (id: number) => [...pettyCashKeys.funds(), id, 'summary'] as const,

  vouchers: () => [...pettyCashKeys.all, 'vouchers'] as const,
  vouchersList: (filters?: PettyCashVoucherFilters) =>
    [...pettyCashKeys.vouchers(), filters] as const,
  voucherDetail: (id: number) => [...pettyCashKeys.vouchers(), id] as const,

  replenishments: () => [...pettyCashKeys.all, 'replenishments'] as const,
  replenishmentsList: (filters?: PettyCashReplenishmentFilters) =>
    [...pettyCashKeys.replenishments(), filters] as const,
  replenishmentDetail: (id: number) => [...pettyCashKeys.replenishments(), id] as const,
};

// ============================================
// PETTY CASH FUND HOOKS
// ============================================

export const usePettyCashFunds = (filters?: PettyCashFundFilters) => {
  return useQuery({
    queryKey: pettyCashKeys.fundsList(filters),
    queryFn: () => pettyCashService.getFunds(filters),
    staleTime: 60 * 1000, // 1 minute
  });
};

export const usePettyCashFund = (id: number, enabled: boolean = true) => {
  return useQuery({
    queryKey: pettyCashKeys.fundDetail(id),
    queryFn: () => pettyCashService.getFund(id),
    enabled: enabled && !!id,
    staleTime: 60 * 1000,
  });
};

export const usePettyCashFundSummary = (id: number, enabled: boolean = true) => {
  return useQuery({
    queryKey: pettyCashKeys.fundSummary(id),
    queryFn: () => pettyCashService.getFundSummary(id),
    enabled: enabled && !!id,
    staleTime: 30 * 1000, // 30 seconds
  });
};

/**
 * Returns the single petty cash fund for this branch.
 * The backend automatically provisions it against the 1102 GL account
 * if it doesn't exist yet — no manual fund creation needed.
 */
export const useDefaultPettyCashFund = () => {
  return useQuery({
    queryKey: [...pettyCashKeys.funds(), 'default'] as const,
    queryFn: () => pettyCashService.getDefaultFund(),
    staleTime: 60 * 1000,
    retry: false, // surface 404 immediately if GL account not set up
  });
};

export const useCreatePettyCashFund = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreatePettyCashFund) => pettyCashService.createFund(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: pettyCashKeys.funds() });
    },
  });
};

export const useUpdatePettyCashFund = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<CreatePettyCashFund> }) =>
      pettyCashService.updateFund(id, data),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: pettyCashKeys.fundDetail(id) });
      queryClient.invalidateQueries({ queryKey: pettyCashKeys.funds() });
    },
  });
};

export const useDeletePettyCashFund = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: number) => pettyCashService.deleteFund(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: pettyCashKeys.funds() });
    },
  });
};

export const useSetupPettyCashFund = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, sourceAccountId }: { id: number; sourceAccountId: number }) =>
      pettyCashService.setupFund(id, sourceAccountId),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: pettyCashKeys.fundDetail(id) });
      queryClient.invalidateQueries({ queryKey: pettyCashKeys.funds() });
    },
  });
};

export const useLinkPettyCashCashierAccount = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: number) => pettyCashService.linkCashierAccount(id),
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: pettyCashKeys.fundDetail(id) });
      queryClient.invalidateQueries({ queryKey: pettyCashKeys.funds() });
      toast.success('Petty cash is now set up as a cashier till');
    },
    onError: (error: any) => {
      toast.error(error?.response?.data?.detail || 'Failed to set up cashier account');
    },
  });
};

export const useLinkExistingPettyCashCashierAccount = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, cashierAccountId }: { id: number; cashierAccountId: number }) =>
      pettyCashService.linkExistingCashierAccount(id, cashierAccountId),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: pettyCashKeys.fundDetail(id) });
      queryClient.invalidateQueries({ queryKey: pettyCashKeys.funds() });
      queryClient.invalidateQueries({ queryKey: ['cashier-accounts'] });
      toast.success('Petty cash is now linked to the selected cashier');
    },
    onError: (error: any) => {
      toast.error(error?.response?.data?.detail || 'Failed to link cashier account');
    },
  });
};

// ============================================
// PETTY CASH VOUCHER HOOKS
// ============================================

export const usePettyCashVouchers = (filters?: PettyCashVoucherFilters) => {
  return useQuery({
    queryKey: pettyCashKeys.vouchersList(filters),
    queryFn: () => pettyCashService.getVouchers(filters),
    staleTime: 60 * 1000,
  });
};

export const usePettyCashVoucher = (id: number, enabled: boolean = true) => {
  return useQuery({
    queryKey: pettyCashKeys.voucherDetail(id),
    queryFn: () => pettyCashService.getVoucher(id),
    enabled: enabled && !!id,
    staleTime: 60 * 1000,
  });
};

export const useCreatePettyCashVoucher = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreatePettyCashVoucher) => pettyCashService.createVoucher(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: pettyCashKeys.vouchers() });
      queryClient.invalidateQueries({ queryKey: pettyCashKeys.funds() }); // Update fund stats
    },
  });
};

export const useUpdatePettyCashVoucher = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<CreatePettyCashVoucher> }) =>
      pettyCashService.updateVoucher(id, data),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: pettyCashKeys.voucherDetail(id) });
      queryClient.invalidateQueries({ queryKey: pettyCashKeys.vouchers() });
    },
  });
};

export const useDeletePettyCashVoucher = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: number) => pettyCashService.deleteVoucher(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: pettyCashKeys.vouchers() });
      queryClient.invalidateQueries({ queryKey: pettyCashKeys.funds() });
    },
  });
};

// Voucher Workflow Actions
export const useSubmitVoucher = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: number) => pettyCashService.submitVoucher(id),
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: pettyCashKeys.voucherDetail(id) });
      queryClient.invalidateQueries({ queryKey: pettyCashKeys.vouchers() });
    },
  });
};

export const useApproveVoucher = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: VoucherActionData }) =>
      pettyCashService.approveVoucher(id, data),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: pettyCashKeys.voucherDetail(id) });
      queryClient.invalidateQueries({ queryKey: pettyCashKeys.vouchers() });
      queryClient.invalidateQueries({ queryKey: pettyCashKeys.funds() });
    },
  });
};

export const useRejectVoucher = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: VoucherActionData }) =>
      pettyCashService.rejectVoucher(id, data),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: pettyCashKeys.voucherDetail(id) });
      queryClient.invalidateQueries({ queryKey: pettyCashKeys.vouchers() });
    },
  });
};

export const useDisburseVoucher = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: VoucherActionData }) =>
      pettyCashService.disburseVoucher(id, data),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: pettyCashKeys.voucherDetail(id) });
      queryClient.invalidateQueries({ queryKey: pettyCashKeys.vouchers() });
      queryClient.invalidateQueries({ queryKey: pettyCashKeys.funds() }); // Update fund balance
    },
  });
};

export const useRetireVoucher = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: VoucherActionData }) =>
      pettyCashService.retireVoucher(id, data),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: pettyCashKeys.voucherDetail(id) });
      queryClient.invalidateQueries({ queryKey: pettyCashKeys.vouchers() });
    },
  });
};

export const useRequestVoucherReversal = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: VoucherActionData }) =>
      pettyCashService.requestVoucherReversal(id, data),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: pettyCashKeys.voucherDetail(id) });
      queryClient.invalidateQueries({ queryKey: pettyCashKeys.vouchers() });
    },
  });
};

export const useApproveVoucherReversal = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: number) => pettyCashService.approveVoucherReversal(id),
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: pettyCashKeys.voucherDetail(id) });
      queryClient.invalidateQueries({ queryKey: pettyCashKeys.vouchers() });
      queryClient.invalidateQueries({ queryKey: pettyCashKeys.funds() }); // Update fund balance
    },
  });
};

export const useRejectVoucherReversal = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: VoucherActionData }) =>
      pettyCashService.rejectVoucherReversal(id, data),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: pettyCashKeys.voucherDetail(id) });
      queryClient.invalidateQueries({ queryKey: pettyCashKeys.vouchers() });
    },
  });
};

// ============================================
// PETTY CASH REPLENISHMENT HOOKS
// ============================================

export const usePettyCashReplenishments = (filters?: PettyCashReplenishmentFilters) => {
  return useQuery({
    queryKey: pettyCashKeys.replenishmentsList(filters),
    queryFn: () => pettyCashService.getReplenishments(filters),
    staleTime: 60 * 1000,
  });
};

export const usePettyCashReplenishment = (id: number, enabled: boolean = true) => {
  return useQuery({
    queryKey: pettyCashKeys.replenishmentDetail(id),
    queryFn: () => pettyCashService.getReplenishment(id),
    enabled: enabled && !!id,
    staleTime: 60 * 1000,
  });
};

export const useCreatePettyCashReplenishment = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreatePettyCashReplenishment) => pettyCashService.createReplenishment(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: pettyCashKeys.replenishments() });
      queryClient.invalidateQueries({ queryKey: pettyCashKeys.funds() });
    },
  });
};

export const useUpdatePettyCashReplenishment = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<CreatePettyCashReplenishment> }) =>
      pettyCashService.updateReplenishment(id, data),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: pettyCashKeys.replenishmentDetail(id) });
      queryClient.invalidateQueries({ queryKey: pettyCashKeys.replenishments() });
    },
  });
};

export const useDeletePettyCashReplenishment = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: number) => pettyCashService.deleteReplenishment(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: pettyCashKeys.replenishments() });
    },
  });
};

// Replenishment Workflow Actions
export const useSubmitReplenishment = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: number) => pettyCashService.submitReplenishment(id),
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: pettyCashKeys.replenishmentDetail(id) });
      queryClient.invalidateQueries({ queryKey: pettyCashKeys.replenishments() });
    },
  });
};

export const useVerifyReplenishment = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: ReplenishmentActionData }) =>
      pettyCashService.verifyReplenishment(id, data),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: pettyCashKeys.replenishmentDetail(id) });
      queryClient.invalidateQueries({ queryKey: pettyCashKeys.replenishments() });
    },
  });
};

export const useApproveReplenishment = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: ReplenishmentActionData }) =>
      pettyCashService.approveReplenishment(id, data),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: pettyCashKeys.replenishmentDetail(id) });
      queryClient.invalidateQueries({ queryKey: pettyCashKeys.replenishments() });
    },
  });
};

export const useRejectReplenishment = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: ReplenishmentActionData }) =>
      pettyCashService.rejectReplenishment(id, data),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: pettyCashKeys.replenishmentDetail(id) });
      queryClient.invalidateQueries({ queryKey: pettyCashKeys.replenishments() });
    },
  });
};

export const usePostReplenishment = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: number) => pettyCashService.postReplenishment(id),
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: pettyCashKeys.replenishmentDetail(id) });
      queryClient.invalidateQueries({ queryKey: pettyCashKeys.replenishments() });
      queryClient.invalidateQueries({ queryKey: pettyCashKeys.funds() }); // Update fund balance
    },
  });
};
// Receipt hooks
export const useVoucherReceipts = (voucherId: number) => {
  return useQuery({
    queryKey: ['petty-cash-receipts', voucherId],
    queryFn: () => pettyCashService.getVoucherReceipts(voucherId),
    enabled: !!voucherId,
  });
};

export const useUploadReceipt = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      voucherId,
      file,
      description,
    }: {
      voucherId: number;
      file: File;
      description?: string;
    }) => pettyCashService.uploadReceipt(voucherId, file, description),
    onSuccess: (_, { voucherId }) => {
      queryClient.invalidateQueries({ queryKey: ['petty-cash-receipts', voucherId] });
      queryClient.invalidateQueries({ queryKey: pettyCashKeys.voucherDetail(voucherId) });
    },
    onError: (error: any) => {
      toast.error(error?.response?.data?.message || 'Failed to upload receipt. Please try again.');
    },
  });
};

export const useDeleteReceipt = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ voucherId, receiptId }: { voucherId: number; receiptId: number }) =>
      pettyCashService.deleteReceipt(voucherId, receiptId),
    onSuccess: (_, { voucherId }) => {
      queryClient.invalidateQueries({ queryKey: ['petty-cash-receipts', voucherId] });
      queryClient.invalidateQueries({ queryKey: pettyCashKeys.voucherDetail(voucherId) });
    },
    onError: (error: any) => {
      toast.error(error?.response?.data?.message || 'Failed to delete receipt. Please try again.');
    },
  });
};
