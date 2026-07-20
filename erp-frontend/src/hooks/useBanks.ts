/**
 * Bank Management React Query Hooks
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { bankService } from '../services/bankService';
import type {
  CreateBankRequest,
  CreateBankAccountRequest,
  CreateBankTransferRequest,
  CreateBankPaymentRequest,
  ApplyAdvanceRequest,
} from '../types/banks';

export const bankKeys = {
  all: ['banks'] as const,
  banks: (params?: object) => [...bankKeys.all, 'list', params] as const,
  bank: (id: number) => [...bankKeys.all, 'detail', id] as const,
  bankSummary: (id: number) => [...bankKeys.all, 'summary', id] as const,
  accounts: (params?: object) => [...bankKeys.all, 'accounts', params] as const,
  account: (id: number) => [...bankKeys.all, 'account', id] as const,
  accountSummary: (id: number) => [...bankKeys.all, 'account-summary', id] as const,
  accountLedger: (id: number, params?: object) =>
    [...bankKeys.all, 'account-ledger', id, params] as const,
  transfers: (filters?: object) => [...bankKeys.all, 'transfers', filters] as const,
  transfer: (id: number) => [...bankKeys.all, 'transfer', id] as const,
  pendingApprovals: () => [...bankKeys.all, 'pending-approvals'] as const,
  payments: (filters?: object) => [...bankKeys.all, 'payments', filters] as const,
  payment: (id: number) => [...bankKeys.all, 'payment', id] as const,
};

// ============= BANKS =============

export const useBanks = (params?: { is_active?: boolean; search?: string }) => {
  return useQuery({
    queryKey: bankKeys.banks(params),
    queryFn: () => bankService.listBanks(params),
    staleTime: 60 * 1000,
  });
};

export const useBank = (id: number, enabled = true) => {
  return useQuery({
    queryKey: bankKeys.bank(id),
    queryFn: () => bankService.getBank(id),
    enabled: enabled && !!id,
    staleTime: 60 * 1000,
  });
};

export const useCreateBank = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateBankRequest) => bankService.createBank(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: bankKeys.all });
    },
  });
};

export const useUpdateBank = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<CreateBankRequest> }) =>
      bankService.updateBank(id, data),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: bankKeys.bank(id) });
      queryClient.invalidateQueries({ queryKey: bankKeys.banks() });
    },
  });
};

export const useDeleteBank = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => bankService.deleteBank(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: bankKeys.banks() });
    },
  });
};

// ============= BANK ACCOUNTS =============

export const useBankAccounts = (params?: {
  bank?: number;
  is_active?: boolean;
  is_cashier_collection_account?: boolean;
  search?: string;
}) => {
  return useQuery({
    queryKey: bankKeys.accounts(params),
    queryFn: () => bankService.listBankAccounts(params),
    staleTime: 60 * 1000,
  });
};

export const useBankAccount = (id: number, enabled = true) => {
  return useQuery({
    queryKey: bankKeys.account(id),
    queryFn: () => bankService.getBankAccount(id),
    enabled: enabled && !!id,
    staleTime: 60 * 1000,
  });
};

export const useBankAccountSummary = (id: number, enabled = true) => {
  return useQuery({
    queryKey: bankKeys.accountSummary(id),
    queryFn: () => bankService.getBankAccountSummary(id),
    enabled: enabled && !!id,
    staleTime: 30 * 1000,
  });
};

export const useBankAccountLedger = (
  id: number,
  params?: { from_date?: string; to_date?: string; limit?: number },
  enabled = true
) => {
  return useQuery({
    queryKey: bankKeys.accountLedger(id, params),
    queryFn: () => bankService.getBankAccountLedger(id, params),
    enabled: enabled && !!id,
    staleTime: 30 * 1000,
  });
};

export const useCreateBankAccount = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateBankAccountRequest) => bankService.createBankAccount(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: bankKeys.accounts() });
    },
  });
};

export const useUpdateBankAccount = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<CreateBankAccountRequest> }) =>
      bankService.updateBankAccount(id, data),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: bankKeys.account(id) });
      queryClient.invalidateQueries({ queryKey: bankKeys.accounts() });
    },
  });
};

export const useSuspendBankAccount = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reason }: { id: number; reason: string }) =>
      bankService.suspendBankAccount(id, reason),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: bankKeys.account(id) });
      queryClient.invalidateQueries({ queryKey: bankKeys.accounts() });
    },
  });
};

export const useActivateBankAccount = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => bankService.activateBankAccount(id),
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: bankKeys.account(id) });
      queryClient.invalidateQueries({ queryKey: bankKeys.accounts() });
    },
  });
};

// ============= BANK TRANSFERS =============

export const useBankTransfers = (filters?: Parameters<typeof bankService.listBankTransfers>[0]) => {
  return useQuery({
    queryKey: bankKeys.transfers(filters),
    queryFn: () => bankService.listBankTransfers(filters),
    staleTime: 0,
    refetchOnMount: true,
    refetchOnWindowFocus: true,
  });
};

export const useBankTransfer = (id: number, enabled = true) => {
  return useQuery({
    queryKey: bankKeys.transfer(id),
    queryFn: () => bankService.getBankTransfer(id),
    enabled: enabled && !!id,
    staleTime: 30 * 1000,
  });
};

export const usePendingBankTransferApprovals = () => {
  return useQuery({
    queryKey: bankKeys.pendingApprovals(),
    queryFn: () => bankService.getPendingApprovals(),
    staleTime: 30 * 1000,
  });
};

export const useCreateBankTransfer = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateBankTransferRequest) => bankService.createBankTransfer(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: bankKeys.transfers() });
    },
  });
};

// ============= BANK PAYMENTS =============

export const useBankPayments = (filters?: Parameters<typeof bankService.listBankPayments>[0]) => {
  return useQuery({
    queryKey: bankKeys.payments(filters),
    queryFn: () => bankService.listBankPayments(filters),
    staleTime: 0,
    refetchOnMount: true,
    refetchOnWindowFocus: true,
  });
};

export const useBankPayment = (id: number, enabled = true) => {
  return useQuery({
    queryKey: bankKeys.payment(id),
    queryFn: () => bankService.getBankPayment(id),
    enabled: enabled && !!id,
    staleTime: 30 * 1000,
  });
};

export const useCreateBankPayment = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateBankPaymentRequest) => bankService.createBankPayment(data),
    onSuccess: () => {
      // Invalidate and immediately refetch the payments list
      queryClient.invalidateQueries({ queryKey: bankKeys.payments() });
      queryClient.invalidateQueries({ queryKey: bankKeys.accounts() });
    },
  });
};

export const useApproveBankPayment = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, notes }: { id: number; notes?: string }) =>
      bankService.approveBankPayment(id, notes),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: bankKeys.payments() });
      queryClient.invalidateQueries({ queryKey: bankKeys.accounts() });
    },
  });
};

export const useRejectBankPayment = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reason }: { id: number; reason: string }) =>
      bankService.rejectBankPayment(id, reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: bankKeys.payments() });
    },
  });
};

export const usePendingBankPaymentApprovals = () => {
  return useQuery({
    queryKey: [...bankKeys.payments(), 'pending-approvals'],
    queryFn: () => bankService.getPendingPaymentApprovals(),
    staleTime: 0,
    refetchOnMount: true,
    refetchOnWindowFocus: true,
  });
};

export const useApplyAdvance = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: ApplyAdvanceRequest }) =>
      bankService.applyAdvanceToPayable(id, data),
    onSuccess: (_, { id }) => {
      // Refresh the specific payment and the full list
      queryClient.invalidateQueries({ queryKey: bankKeys.payment(id) });
      queryClient.invalidateQueries({ queryKey: bankKeys.payments() });
    },
  });
};

export const useSubmitBankTransfer = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => bankService.submitTransfer(id),
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: bankKeys.transfer(id) });
      queryClient.invalidateQueries({ queryKey: bankKeys.transfers() });
      queryClient.invalidateQueries({ queryKey: bankKeys.pendingApprovals() });
    },
  });
};

export const useDeleteBankTransfer = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => bankService.deleteBankTransfer(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: bankKeys.transfers() });
    },
  });
};

export const useApproveBankTransfer = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, notes }: { id: number; notes?: string }) =>
      bankService.approveTransfer(id, notes),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: bankKeys.transfer(id) });
      queryClient.invalidateQueries({ queryKey: bankKeys.transfers() });
      queryClient.invalidateQueries({ queryKey: bankKeys.pendingApprovals() });
    },
  });
};

export const useRejectBankTransfer = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reason }: { id: number; reason: string }) =>
      bankService.rejectTransfer(id, reason),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: bankKeys.transfer(id) });
      queryClient.invalidateQueries({ queryKey: bankKeys.transfers() });
      queryClient.invalidateQueries({ queryKey: bankKeys.pendingApprovals() });
    },
  });
};

export const useSecondApproveBankTransfer = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, notes }: { id: number; notes?: string }) =>
      bankService.secondApproveTransfer(id, notes),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: bankKeys.transfer(id) });
      queryClient.invalidateQueries({ queryKey: bankKeys.transfers() });
      queryClient.invalidateQueries({ queryKey: bankKeys.pendingApprovals() });
    },
  });
};
