import {
  useQuery,
  useMutation,
  useQueryClient,
  UseQueryOptions,
  UseMutationOptions,
} from '@tanstack/react-query';
import {
  getSavingsAccounts,
  getSavingsAccount,
  getAccountSchedule,
  generateAccountSchedule,
  getSmartSavings,
  toggleSmartSavings,
  getSavingsCollectionSheet,
  markContributionPaid,
  generateScheduleForMonth,
  createSavingsAccount,
  getCompulsorySavingsPolicies,
  updateCompulsorySavingsPolicy,
  createCompulsorySavingsPolicy,
  getSavingsProductConfig,
  createSavingsProductConfig,
  updateSavingsProductConfig,
  getWithdrawalTiers,
  createWithdrawalTier,
  updateWithdrawalTier,
  deleteWithdrawalTier,
  getWithdrawals,
  getPendingMyApproval,
  getPendingDisburse,
  approveWithdrawalStep,
  cancelWithdrawal,
  disburseWithdrawal,
  getSavingsTransactions,
  depositToSavings,
  type SavingsAccount,
  type SavingsAccountsPage,
  type ContributionScheduleItem,
  type CompulsorySavingsPolicy,
  type SavingsProductConfig,
  type WithdrawalApprovalTier,
  type WithdrawalListPage,
  type SavingsWithdrawalRequest,
  type SavingsTransactionPage,
  type SavingsDepositResult,
  type SavingsDepositPayload,
  type InitiateWithdrawalData,
  type GenerateScheduleResult,
  type ContributionCycle,
  type ContributionStatus,
  type SmartSavingsAccount,
  type CreateSavingsAccountData,
} from '../services/savingsService';
import api from '../services/api';

// ── Query key factory ─────────────────────────────────────────────────────

export const savingsKeys = {
  all: ['savings'] as const,
  accounts: () => [...savingsKeys.all, 'accounts'] as const,
  accountsList: (params?: Record<string, unknown>) => [...savingsKeys.accounts(), 'list', params] as const,
  accountDetail: (id: number) => [...savingsKeys.accounts(), 'detail', id] as const,
  transactions: (accountId: number, page: number, pageSize: number) =>
    [...savingsKeys.all, 'transactions', accountId, page, pageSize] as const,
  schedule: (accountId: number, year?: number, month?: number) =>
    [...savingsKeys.all, 'schedule', accountId, year, month] as const,
  smartSavings: (accountId: number) => [...savingsKeys.all, 'smartSavings', accountId] as const,
  products: () => [...savingsKeys.all, 'products'] as const,
  collections: (params?: Record<string, unknown>) => [...savingsKeys.all, 'collections', params] as const,
  policies: () => [...savingsKeys.all, 'policies'] as const,
  productConfig: (productId: number) => [...savingsKeys.all, 'productConfig', productId] as const,
  withdrawals: (params?: Record<string, unknown>) => [...savingsKeys.all, 'withdrawals', params] as const,
  withdrawalDetail: (id: number) => [...savingsKeys.all, 'withdrawals', 'detail', id] as const,
  pendingMyApproval: () => [...savingsKeys.all, 'withdrawals', 'pendingMyApproval'] as const,
  pendingDisburse: () => [...savingsKeys.all, 'withdrawals', 'pendingDisburse'] as const,
  withdrawalTiers: (params?: Record<string, unknown>) => [...savingsKeys.all, 'withdrawalTiers', params] as const,
};

// ── Query hooks ───────────────────────────────────────────────────────────

export const useSavingsAccounts = (
  params?: {
    client?: number;
    cycle?: ContributionCycle;
    product?: number;
    status?: string;
    search?: string;
    page?: number;
    page_size?: number;
  },
  options?: Omit<UseQueryOptions<SavingsAccountsPage | SavingsAccount[], Error>, 'queryKey' | 'queryFn'>
) => {
  return useQuery({
    queryKey: savingsKeys.accountsList(params),
    queryFn: () => getSavingsAccounts(params),
    ...options,
  });
};

export const useSavingsAccount = (
  id: number | null,
  options?: Omit<UseQueryOptions<SavingsAccount, Error>, 'queryKey' | 'queryFn'>
) => {
  return useQuery({
    queryKey: savingsKeys.accountDetail(id ?? 0),
    queryFn: () => getSavingsAccount(id!),
    enabled: !!id,
    ...options,
  });
};

export const useSavingsTransactions = (
  accountId: number | null,
  page: number,
  pageSize: number,
  options?: Omit<UseQueryOptions<SavingsTransactionPage, Error>, 'queryKey' | 'queryFn'>
) => {
  return useQuery({
    queryKey: savingsKeys.transactions(accountId ?? 0, page, pageSize),
    queryFn: () => getSavingsTransactions(accountId!, page, pageSize),
    enabled: !!accountId,
    ...options,
  });
};

export const useSavingsSchedule = (
  accountId: number | null,
  year?: number,
  month?: number,
  options?: Omit<UseQueryOptions<ContributionScheduleItem[], Error>, 'queryKey' | 'queryFn'>
) => {
  return useQuery({
    queryKey: savingsKeys.schedule(accountId ?? 0, year, month),
    queryFn: () => getAccountSchedule(accountId!, year, month),
    enabled: !!accountId,
    ...options,
  });
};

export const useSmartSavings = (
  accountId: number | null,
  options?: Omit<UseQueryOptions<SmartSavingsAccount, Error>, 'queryKey' | 'queryFn'>
) => {
  return useQuery({
    queryKey: savingsKeys.smartSavings(accountId ?? 0),
    queryFn: () => getSmartSavings(accountId!),
    enabled: !!accountId,
    ...options,
  });
};

export const useSavingsProducts = (
  options?: Omit<UseQueryOptions<unknown, Error>, 'queryKey' | 'queryFn'>
) => {
  return useQuery({
    queryKey: savingsKeys.products(),
    queryFn: () => api.get('/products/products/', { params: { product_type: 'SAVINGS' } }),
    ...options,
  });
};

export const useSavingsCollections = (
  params: {
    date?: string;
    status?: ContributionStatus;
    savings_account?: number;
    cycle?: ContributionCycle;
    product?: number;
  },
  options?: Omit<UseQueryOptions<ContributionScheduleItem[], Error>, 'queryKey' | 'queryFn'>
) => {
  return useQuery({
    queryKey: savingsKeys.collections(params),
    queryFn: () => getSavingsCollectionSheet(params),
    ...options,
  });
};

export const useCompulsorySavingsPolicies = (
  options?: Omit<UseQueryOptions<CompulsorySavingsPolicy[], Error>, 'queryKey' | 'queryFn'>
) => {
  return useQuery({
    queryKey: savingsKeys.policies(),
    queryFn: () => getCompulsorySavingsPolicies(),
    ...options,
  });
};

export const useSavingsProductConfig = (
  productId: number | null,
  options?: Omit<UseQueryOptions<SavingsProductConfig[], Error>, 'queryKey' | 'queryFn'>
) => {
  return useQuery({
    queryKey: savingsKeys.productConfig(productId ?? 0),
    queryFn: () => getSavingsProductConfig(productId!),
    enabled: !!productId,
    ...options,
  });
};

export const useWithdrawals = (
  params?: {
    savings_account?: number;
    status?: string;
    page?: number;
    page_size?: number;
  },
  options?: Omit<UseQueryOptions<WithdrawalListPage, Error>, 'queryKey' | 'queryFn'>
) => {
  return useQuery({
    queryKey: savingsKeys.withdrawals(params),
    queryFn: () => getWithdrawals(params),
    ...options,
  });
};

export const usePendingMyApproval = (
  options?: Omit<UseQueryOptions<SavingsWithdrawalRequest[], Error>, 'queryKey' | 'queryFn'>
) => {
  return useQuery({
    queryKey: savingsKeys.pendingMyApproval(),
    queryFn: () => getPendingMyApproval(),
    ...options,
  });
};

export const usePendingDisburse = (
  options?: Omit<UseQueryOptions<SavingsWithdrawalRequest[], Error>, 'queryKey' | 'queryFn'>
) => {
  return useQuery({
    queryKey: savingsKeys.pendingDisburse(),
    queryFn: () => getPendingDisburse(),
    ...options,
  });
};

export const useWithdrawalTiers = (
  params?: { is_active?: boolean },
  options?: Omit<UseQueryOptions<WithdrawalApprovalTier[], Error>, 'queryKey' | 'queryFn'>
) => {
  return useQuery({
    queryKey: savingsKeys.withdrawalTiers(params),
    queryFn: () => getWithdrawalTiers(params),
    ...options,
  });
};

// ── Mutation hooks ────────────────────────────────────────────────────────

export const useCreateSavingsAccount = (
  options?: Omit<UseMutationOptions<SavingsAccount, Error, CreateSavingsAccountData>, 'mutationFn'>
) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data) => createSavingsAccount(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: savingsKeys.accounts() });
    },
    ...options,
  });
};

export const useDepositToSavings = (
  options?: Omit<UseMutationOptions<SavingsDepositResult, Error, { accountId: number; data: SavingsDepositPayload }>, 'mutationFn'>
) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ accountId, data }) => depositToSavings(accountId, data),
    onSuccess: (_data, { accountId }) => {
      queryClient.invalidateQueries({ queryKey: savingsKeys.accountDetail(accountId) });
      queryClient.invalidateQueries({ queryKey: savingsKeys.accounts() });
      queryClient.invalidateQueries({ queryKey: savingsKeys.transactions(accountId, 1, 25) });
    },
    ...options,
  });
};

export const useInitiateWithdrawal = (
  options?: Omit<UseMutationOptions<SavingsWithdrawalRequest, Error, InitiateWithdrawalData>, 'mutationFn'>
) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data) => {
      const svc = import('../services/savingsService');
      return svc.then(m => m.initiateWithdrawal(data));
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: savingsKeys.withdrawals() });
      queryClient.invalidateQueries({ queryKey: savingsKeys.pendingMyApproval() });
    },
    ...options,
  });
};

export const useMarkContributionPaid = (
  options?: Omit<UseMutationOptions<ContributionScheduleItem, Error, { scheduleId: number; cashierAccountId: number }>, 'mutationFn'>
) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ scheduleId, cashierAccountId }) => markContributionPaid(scheduleId, cashierAccountId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: savingsKeys.collections() });
    },
    ...options,
  });
};

export const useGenerateScheduleForMonth = (
  options?: Omit<UseMutationOptions<GenerateScheduleResult, Error, { year?: number; month?: number }>, 'mutationFn'>
) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ year, month }) => generateScheduleForMonth(year, month),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: savingsKeys.collections() });
    },
    ...options,
  });
};

export const useGenerateAccountSchedule = (
  options?: Omit<UseMutationOptions<GenerateScheduleResult, Error, { accountId: number; year?: number; month?: number }>, 'mutationFn'>
) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ accountId, year, month }) => generateAccountSchedule(accountId, year, month),
    onSuccess: (_data, { accountId }) => {
      queryClient.invalidateQueries({ queryKey: savingsKeys.schedule(accountId) });
    },
    ...options,
  });
};

export const useUpdateCompulsorySavingsPolicy = (
  options?: Omit<UseMutationOptions<CompulsorySavingsPolicy, Error, { id: number; data: Partial<Pick<CompulsorySavingsPolicy, 'amount' | 'enabled'>> }>, 'mutationFn'>
) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }) => updateCompulsorySavingsPolicy(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: savingsKeys.policies() });
    },
    ...options,
  });
};

export const useCreateCompulsorySavingsPolicy = (
  options?: Omit<UseMutationOptions<CompulsorySavingsPolicy, Error, Pick<CompulsorySavingsPolicy, 'amount' | 'enabled'>>, 'mutationFn'>
) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data) => createCompulsorySavingsPolicy(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: savingsKeys.policies() });
    },
    ...options,
  });
};

export const useApproveWithdrawalStep = (
  options?: Omit<UseMutationOptions<SavingsWithdrawalRequest, Error, { withdrawalId: number; data: { approved: boolean; comment?: string; payment_method?: 'cash' | 'bank' | null; cashier_account?: number | null } }>, 'mutationFn'>
) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ withdrawalId, data }) => approveWithdrawalStep(withdrawalId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: savingsKeys.pendingMyApproval() });
      queryClient.invalidateQueries({ queryKey: savingsKeys.pendingDisburse() });
      queryClient.invalidateQueries({ queryKey: savingsKeys.withdrawals() });
    },
    ...options,
  });
};

export const useCancelWithdrawal = (
  options?: Omit<UseMutationOptions<SavingsWithdrawalRequest, Error, number>, 'mutationFn'>
) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id) => cancelWithdrawal(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: savingsKeys.pendingMyApproval() });
      queryClient.invalidateQueries({ queryKey: savingsKeys.pendingDisburse() });
      queryClient.invalidateQueries({ queryKey: savingsKeys.withdrawals() });
    },
    ...options,
  });
};

export const useDisburseWithdrawal = (
  options?: Omit<UseMutationOptions<SavingsWithdrawalRequest, Error, { id: number; data: { destination_bank_account?: number } }>, 'mutationFn'>
) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }) => disburseWithdrawal(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: savingsKeys.pendingDisburse() });
      queryClient.invalidateQueries({ queryKey: savingsKeys.withdrawals() });
    },
    ...options,
  });
};

export const useCreateSavingsProductConfig = (
  options?: Omit<UseMutationOptions<SavingsProductConfig, Error, Partial<SavingsProductConfig>>, 'mutationFn'>
) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data) => createSavingsProductConfig(data),
    onSuccess: (_data, variables) => {
      if (variables.product) {
        queryClient.invalidateQueries({ queryKey: savingsKeys.productConfig(variables.product) });
      }
    },
    ...options,
  });
};

export const useUpdateSavingsProductConfig = (
  options?: Omit<UseMutationOptions<SavingsProductConfig, Error, { id: number; data: Partial<SavingsProductConfig> }>, 'mutationFn'>
) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }) => updateSavingsProductConfig(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: savingsKeys.all });
    },
    ...options,
  });
};

export const useCreateWithdrawalTier = (
  options?: Omit<UseMutationOptions<WithdrawalApprovalTier, Error, Partial<WithdrawalApprovalTier>>, 'mutationFn'>
) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data) => createWithdrawalTier(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: savingsKeys.withdrawalTiers() });
    },
    ...options,
  });
};

export const useUpdateWithdrawalTier = (
  options?: Omit<UseMutationOptions<WithdrawalApprovalTier, Error, { id: number; data: Partial<WithdrawalApprovalTier> }>, 'mutationFn'>
) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }) => updateWithdrawalTier(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: savingsKeys.withdrawalTiers() });
    },
    ...options,
  });
};

export const useDeleteWithdrawalTier = (
  options?: Omit<UseMutationOptions<void, Error, number>, 'mutationFn'>
) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id) => deleteWithdrawalTier(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: savingsKeys.withdrawalTiers() });
    },
    ...options,
  });
};

export const useToggleSmartSavings = (
  options?: Omit<UseMutationOptions<SmartSavingsAccount | { detail: string }, Error, { accountId: number; action: 'activate' | 'deactivate' }>, 'mutationFn'>
) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ accountId, action }) => toggleSmartSavings(accountId, action),
    onSuccess: (_data, { accountId }) => {
      queryClient.invalidateQueries({ queryKey: savingsKeys.smartSavings(accountId) });
      queryClient.invalidateQueries({ queryKey: savingsKeys.accountDetail(accountId) });
    },
    ...options,
  });
};
