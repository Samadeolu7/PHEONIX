/**
 * Treasury Management React Query Hooks
 * Custom hooks for cash collections, reconciliations, transfers, and bank reconciliations
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import treasuryService from '../services/treasuryService';
import {
  CreateCashCollectionRequest,
  CreateCashTransferRequest,
  CreateCashReconciliationRequest,
  FinanceOfficerSignoffRequest,
  CreateBankReconciliationRequest,
  CashCollectionFilters,
  CashReconciliationFilters,
  BankReconciliationFilters,
} from '../types/treasury';
import { toast } from 'sonner';

// Query keys
export const treasuryKeys = {
  all: ['treasury'] as const,
  cashierAccounts: () => [...treasuryKeys.all, 'cashier-accounts'] as const,
  cashierAccount: (id: number) => [...treasuryKeys.cashierAccounts(), id] as const,
  activeCashiers: () => [...treasuryKeys.cashierAccounts(), 'active'] as const,
  needingReconciliation: () =>
    [...treasuryKeys.cashierAccounts(), 'needing-reconciliation'] as const,

  cashCollections: (filters?: CashCollectionFilters) =>
    [...treasuryKeys.all, 'cash-collections', filters] as const,
  cashCollection: (id: number) => [...treasuryKeys.all, 'cash-collection', id] as const,
  todayCollections: (cashierId: number) =>
    [...treasuryKeys.all, 'today-collections', cashierId] as const,

  cashTransfers: () => [...treasuryKeys.all, 'cash-transfers'] as const,
  cashTransfer: (id: number) => [...treasuryKeys.cashTransfers(), id] as const,
  pendingTransfers: () => [...treasuryKeys.cashTransfers(), 'pending'] as const,

  cashReconciliations: (filters?: CashReconciliationFilters) =>
    [...treasuryKeys.all, 'cash-reconciliations', filters] as const,
  cashReconciliation: (id: number) => [...treasuryKeys.all, 'cash-reconciliation', id] as const,
  needingSignoff: () => [...treasuryKeys.all, 'needing-signoff'] as const,
  todayReconciliations: () => [...treasuryKeys.all, 'today-reconciliations'] as const,

  bankReconciliations: (filters?: BankReconciliationFilters) =>
    [...treasuryKeys.all, 'bank-reconciliations', filters] as const,
  bankReconciliation: (id: number) => [...treasuryKeys.all, 'bank-reconciliation', id] as const,

  summary: () => [...treasuryKeys.all, 'summary'] as const,
  cashierSummaries: () => [...treasuryKeys.all, 'cashier-summaries'] as const,
};

/**
 * Cashier Account Hooks
 */
export const useAllCashierAccounts = () => {
  return useQuery({
    queryKey: treasuryKeys.cashierAccounts(),
    queryFn: treasuryService.cashierAccount.getAll,
  });
};

export const useCashierAccount = (id: number) => {
  return useQuery({
    queryKey: treasuryKeys.cashierAccount(id),
    queryFn: () => treasuryService.cashierAccount.getById(id),
    enabled: !!id,
  });
};

export const useActiveCashierAccounts = () => {
  return useQuery({
    queryKey: treasuryKeys.activeCashiers(),
    queryFn: treasuryService.cashierAccount.getActive,
  });
};

export const useCashiersNeedingReconciliation = () => {
  return useQuery({
    queryKey: treasuryKeys.needingReconciliation(),
    queryFn: async () => {
      try {
        return await treasuryService.cashierAccount.getNeedingReconciliation();
      } catch (error) {
        console.error('Failed to fetch cashiers needing reconciliation:', error);
        return [];
      }
    },
    retry: false,
  });
};

/**
 * Get-or-create the caller's cashier account for their currently active
 * branch (the branch switcher selection). Invalidates the cashier account
 * lists on success so a form that was showing "no cashier account" picks up
 * the newly created one immediately.
 */
export const useEnsureMyCashierAccount = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: treasuryService.cashierAccount.ensureMine,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: treasuryKeys.cashierAccounts() });
    },
  });
};

/**
 * Cash Collection Hooks
 */
export const useCashCollections = (filters?: CashCollectionFilters) => {
  return useQuery({
    queryKey: treasuryKeys.cashCollections(filters),
    queryFn: () => treasuryService.cashCollection.getAll(filters),
  });
};

export const useCashCollection = (id: number) => {
  return useQuery({
    queryKey: treasuryKeys.cashCollection(id),
    queryFn: () => treasuryService.cashCollection.getById(id),
    enabled: !!id,
  });
};

export const useTodayCollectionsByCashier = (cashierId: number) => {
  return useQuery({
    queryKey: treasuryKeys.todayCollections(cashierId),
    queryFn: () => treasuryService.cashCollection.getTodayByCashier(cashierId),
    enabled: !!cashierId,
  });
};

export const useCreateCashCollection = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateCashCollectionRequest) => treasuryService.cashCollection.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: treasuryKeys.cashCollections() });
      queryClient.invalidateQueries({ queryKey: treasuryKeys.cashierAccounts() });
      queryClient.invalidateQueries({ queryKey: treasuryKeys.summary() });
      toast.success('Cash collection created successfully');
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || 'Failed to create cash collection');
    },
  });
};

export const useUpdateCashCollection = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<CreateCashCollectionRequest> }) =>
      treasuryService.cashCollection.update(id, data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: treasuryKeys.cashCollections() });
      queryClient.invalidateQueries({ queryKey: treasuryKeys.cashCollection(variables.id) });
      queryClient.invalidateQueries({ queryKey: treasuryKeys.cashierAccounts() });
      toast.success('Cash collection updated successfully');
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || 'Failed to update cash collection');
    },
  });
};

export const useDeleteCashCollection = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: number) => treasuryService.cashCollection.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: treasuryKeys.cashCollections() });
      queryClient.invalidateQueries({ queryKey: treasuryKeys.cashierAccounts() });
      toast.success('Cash collection deleted successfully');
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || 'Failed to delete cash collection');
    },
  });
};

export const usePostCashCollection = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: number) => treasuryService.cashCollection.post(id),
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: treasuryKeys.cashCollections() });
      queryClient.invalidateQueries({ queryKey: treasuryKeys.cashCollection(id) });
      queryClient.invalidateQueries({ queryKey: treasuryKeys.cashierAccounts() });
      toast.success('Cash collection posted to accounts');
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || 'Failed to post cash collection');
    },
  });
};

/**
 * Cash Transfer Hooks
 */
export const useCashTransfers = () => {
  return useQuery({
    queryKey: treasuryKeys.cashTransfers(),
    queryFn: treasuryService.cashTransfer.getAll,
  });
};

export const useCashTransfer = (id: number) => {
  return useQuery({
    queryKey: treasuryKeys.cashTransfer(id),
    queryFn: () => treasuryService.cashTransfer.getById(id),
    enabled: !!id,
  });
};

export const usePendingCashTransfers = () => {
  return useQuery({
    queryKey: treasuryKeys.pendingTransfers(),
    queryFn: async () => {
      try {
        return await treasuryService.cashTransfer.getPending();
      } catch (error) {
        console.error('Failed to fetch pending cash transfers:', error);
        return [];
      }
    },
    retry: false,
  });
};

export const useCreateCashTransfer = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateCashTransferRequest) => treasuryService.cashTransfer.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: treasuryKeys.cashTransfers() });
      queryClient.invalidateQueries({ queryKey: treasuryKeys.cashierAccounts() });
      queryClient.invalidateQueries({ queryKey: treasuryKeys.summary() });
      toast.success('Cash transfer created successfully');
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || 'Failed to create cash transfer');
    },
  });
};

export const useSubmitCashTransfer = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: number) => treasuryService.cashTransfer.submit(id),
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: treasuryKeys.cashTransfers() });
      queryClient.invalidateQueries({ queryKey: treasuryKeys.cashTransfer(id) });
      queryClient.invalidateQueries({ queryKey: treasuryKeys.pendingTransfers() });
      toast.success('Cash transfer submitted for approval');
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || 'Failed to submit cash transfer');
    },
  });
};

export const useApproveCashTransfer = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, notes }: { id: number; notes?: string }) =>
      treasuryService.cashTransfer.approve(id, notes),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: treasuryKeys.cashTransfers() });
      queryClient.invalidateQueries({ queryKey: treasuryKeys.cashTransfer(variables.id) });
      queryClient.invalidateQueries({ queryKey: treasuryKeys.pendingTransfers() });
      toast.success('Cash transfer approved');
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || 'Failed to approve cash transfer');
    },
  });
};

export const useRejectCashTransfer = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, reason }: { id: number; reason: string }) =>
      treasuryService.cashTransfer.reject(id, reason),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: treasuryKeys.cashTransfers() });
      queryClient.invalidateQueries({ queryKey: treasuryKeys.cashTransfer(variables.id) });
      queryClient.invalidateQueries({ queryKey: treasuryKeys.pendingTransfers() });
      toast.success('Cash transfer rejected');
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || 'Failed to reject cash transfer');
    },
  });
};

export const usePostCashTransfer = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: number) => treasuryService.cashTransfer.post(id),
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: treasuryKeys.cashTransfers() });
      queryClient.invalidateQueries({ queryKey: treasuryKeys.cashTransfer(id) });
      queryClient.invalidateQueries({ queryKey: treasuryKeys.cashierAccounts() });
      toast.success('Cash transfer posted to accounts');
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || 'Failed to post cash transfer');
    },
  });
};

/**
 * Cash Reconciliation Hooks
 */
export const useCashReconciliations = (filters?: CashReconciliationFilters) => {
  return useQuery({
    queryKey: treasuryKeys.cashReconciliations(filters),
    queryFn: () => treasuryService.cashReconciliation.getAll(filters),
  });
};

export const useCashReconciliation = (id: number) => {
  return useQuery({
    queryKey: treasuryKeys.cashReconciliation(id),
    queryFn: () => treasuryService.cashReconciliation.getById(id),
    enabled: !!id,
  });
};

export const useReconciliationsNeedingSignoff = () => {
  return useQuery({
    queryKey: treasuryKeys.needingSignoff(),
    queryFn: async () => {
      try {
        return await treasuryService.cashReconciliation.getNeedingSignoff();
      } catch (error) {
        console.error('Failed to fetch reconciliations needing signoff:', error);
        return [];
      }
    },
    retry: false,
  });
};

export const useTodayReconciliations = () => {
  return useQuery({
    queryKey: treasuryKeys.todayReconciliations(),
    queryFn: async () => {
      try {
        return await treasuryService.cashReconciliation.getToday();
      } catch (error) {
        console.error('Failed to fetch today reconciliations:', error);
        return [];
      }
    },
    retry: false,
  });
};

export const useCreateCashReconciliation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateCashReconciliationRequest) =>
      treasuryService.cashReconciliation.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: treasuryKeys.cashReconciliations() });
      queryClient.invalidateQueries({ queryKey: treasuryKeys.cashierAccounts() });
      queryClient.invalidateQueries({ queryKey: treasuryKeys.summary() });
      toast.success('Cash reconciliation created successfully');
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || 'Failed to create cash reconciliation');
    },
  });
};

export const useUpdateCashReconciliation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<CreateCashReconciliationRequest> }) =>
      treasuryService.cashReconciliation.update(id, data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: treasuryKeys.cashReconciliations() });
      queryClient.invalidateQueries({ queryKey: treasuryKeys.cashReconciliation(variables.id) });
      queryClient.invalidateQueries({ queryKey: treasuryKeys.cashierAccounts() });
      toast.success('Cash reconciliation updated successfully');
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || 'Failed to update cash reconciliation');
    },
  });
};

export const useFinanceOfficerSignoff = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: FinanceOfficerSignoffRequest }) =>
      treasuryService.cashReconciliation.financeSignoff(id, data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: treasuryKeys.cashReconciliations() });
      queryClient.invalidateQueries({ queryKey: treasuryKeys.cashReconciliation(variables.id) });
      queryClient.invalidateQueries({ queryKey: treasuryKeys.needingSignoff() });
      toast.success('Finance officer sign-off completed');
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || 'Failed to complete sign-off');
    },
  });
};

/**
 * Bank Reconciliation Hooks
 */
export const useBankReconciliations = (filters?: BankReconciliationFilters) => {
  return useQuery({
    queryKey: treasuryKeys.bankReconciliations(filters),
    queryFn: () => treasuryService.bankReconciliation.getAll(filters),
  });
};

export const useBankReconciliation = (id: number) => {
  return useQuery({
    queryKey: treasuryKeys.bankReconciliation(id),
    queryFn: () => treasuryService.bankReconciliation.getById(id),
    enabled: !!id,
  });
};

export const useCreateBankReconciliation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateBankReconciliationRequest) =>
      treasuryService.bankReconciliation.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: treasuryKeys.bankReconciliations() });
      toast.success('Bank reconciliation created successfully');
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || 'Failed to create bank reconciliation');
    },
  });
};

export const useUpdateBankReconciliation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<CreateBankReconciliationRequest> }) =>
      treasuryService.bankReconciliation.update(id, data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: treasuryKeys.bankReconciliations() });
      queryClient.invalidateQueries({ queryKey: treasuryKeys.bankReconciliation(variables.id) });
      toast.success('Bank reconciliation updated successfully');
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || 'Failed to update bank reconciliation');
    },
  });
};

export const useSubmitBankReconciliationForReview = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: number) => treasuryService.bankReconciliation.submitForReview(id),
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: treasuryKeys.bankReconciliations() });
      queryClient.invalidateQueries({ queryKey: treasuryKeys.bankReconciliation(id) });
      toast.success('Bank reconciliation submitted for review');
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || 'Failed to submit for review');
    },
  });
};

export const useApproveBankReconciliation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: number) => treasuryService.bankReconciliation.approve(id),
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: treasuryKeys.bankReconciliations() });
      queryClient.invalidateQueries({ queryKey: treasuryKeys.bankReconciliation(id) });
      toast.success('Bank reconciliation approved');
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || 'Failed to approve bank reconciliation');
    },
  });
};

export const useDeleteBankReconciliation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: number) => treasuryService.bankReconciliation.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: treasuryKeys.bankReconciliations() });
      toast.success('Bank reconciliation deleted successfully');
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || 'Failed to delete bank reconciliation');
    },
  });
};

/**
 * Summary Hooks
 */
export const useTreasurySummary = () => {
  return useQuery({
    queryKey: treasuryKeys.summary(),
    queryFn: async () => {
      try {
        return await treasuryService.summary.getDashboard();
      } catch (error) {
        console.error('Failed to fetch treasury summary:', error);
        return null;
      }
    },
    refetchInterval: 60000, // Refresh every minute
    retry: false,
  });
};

export const useCashierSummaries = () => {
  return useQuery({
    queryKey: treasuryKeys.cashierSummaries(),
    queryFn: async () => {
      try {
        return await treasuryService.summary.getCashierSummaries();
      } catch (error) {
        console.error('Failed to fetch cashier summaries:', error);
        return [];
      }
    },
    refetchInterval: 60000, // Refresh every minute
    retry: false,
  });
};
