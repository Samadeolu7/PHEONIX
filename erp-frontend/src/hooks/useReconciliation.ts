import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { reconciliationService } from '../services/reconciliationService';
import { branchService } from '../services/branchService';
import type {
  ReconciliationFilters,
  OfficerReconciliationRiskFilters,
  ManualOverridesReportFilters,
  MissingMoneySummaryFilters,
  BulkRerunReconciliationRequest,
  RerunReconciliationRequest,
  ResolveExceptionRequest,
  SecondResolveExceptionRequest,
  UnmatchTransactionRequest,
  UnresolveExceptionRequest,
} from '../types/banks';

// ============= QUERY KEYS =============

export const reconciliationKeys = {
  all: ['reconciliation'] as const,
  lists: () => [...reconciliationKeys.all, 'list'] as const,
  list: (filters?: ReconciliationFilters) =>
    [...reconciliationKeys.lists(), filters] as const,
  details: () => [...reconciliationKeys.all, 'detail'] as const,
  detail: (id: number) => [...reconciliationKeys.details(), id] as const,
  transactions: (id: number, matched?: boolean) =>
    [...reconciliationKeys.detail(id), 'transactions', matched] as const,
  reports: () => [...reconciliationKeys.all, 'reports'] as const,
  officerRisk: (filters?: OfficerReconciliationRiskFilters) =>
    [...reconciliationKeys.reports(), 'officer-risk', filters] as const,
  manualOverrides: (filters?: ManualOverridesReportFilters) =>
    [...reconciliationKeys.reports(), 'manual-overrides', filters] as const,
  missingMoney: (filters?: MissingMoneySummaryFilters) =>
    [...reconciliationKeys.reports(), 'missing-money', filters] as const,
  missingMoneyByOfficer: (id: number | 'unattributed') =>
    [...reconciliationKeys.reports(), 'missing-money', 'officer', id] as const,
  missingMoneyByBankAccount: (id: number) =>
    [...reconciliationKeys.reports(), 'missing-money', 'bank-account', id] as const,
  branches: () => [...reconciliationKeys.all, 'branches'] as const,
};

// ============= QUERY HOOKS =============

export const useReconciliations = (filters?: ReconciliationFilters) => {
  return useQuery({
    queryKey: reconciliationKeys.list(filters),
    queryFn: () => reconciliationService.listReconciliations(filters),
    staleTime: 30_000,
  });
};

export const useReconciliation = (id: number, enabled = true) => {
  return useQuery({
    queryKey: reconciliationKeys.detail(id),
    queryFn: () => reconciliationService.getReconciliation(id),
    enabled,
    refetchInterval: (query) => {
      const data = query.state.data;
      if (data?.status === 'processing') return 3000;
      return false;
    },
    staleTime: 10_000,
  });
};

export const useReconciliationTransactions = (
  reconciliationId: number,
  matched?: boolean,
  enabled = true,
) => {
  return useQuery({
    queryKey: reconciliationKeys.transactions(reconciliationId, matched),
    queryFn: () => reconciliationService.getTransactions(reconciliationId, matched),
    enabled,
    staleTime: 30_000,
  });
};

export const useReconciliationBranches = () => {
  return useQuery({
    queryKey: reconciliationKeys.branches(),
    queryFn: () => branchService.listBranches(),
    staleTime: 5 * 60_000,
  });
};

// ============= REPORT QUERY HOOKS =============

export const useOfficerRiskReport = (filters?: OfficerReconciliationRiskFilters) => {
  return useQuery({
    queryKey: reconciliationKeys.officerRisk(filters),
    queryFn: () => reconciliationService.getOfficerRiskReport(filters),
    staleTime: 60_000,
  });
};

export const useManualOverridesReport = (filters?: ManualOverridesReportFilters) => {
  return useQuery({
    queryKey: reconciliationKeys.manualOverrides(filters),
    queryFn: () => reconciliationService.getManualOverridesReport(filters),
    staleTime: 60_000,
  });
};

export const useMissingMoneySummary = (filters?: MissingMoneySummaryFilters) => {
  return useQuery({
    queryKey: reconciliationKeys.missingMoney(filters),
    queryFn: () => reconciliationService.getMissingMoneySummary(filters),
    staleTime: 60_000,
  });
};

export const useMissingMoneyByOfficer = (
  officerId: number | 'unattributed',
  enabled = true,
) => {
  return useQuery({
    queryKey: reconciliationKeys.missingMoneyByOfficer(officerId),
    queryFn: () => reconciliationService.getMissingMoneyByOfficer(officerId),
    enabled,
    staleTime: 60_000,
  });
};

export const useMissingMoneyByBankAccount = (bankAccountId: number, enabled = true) => {
  return useQuery({
    queryKey: reconciliationKeys.missingMoneyByBankAccount(bankAccountId),
    queryFn: () => reconciliationService.getMissingMoneyByBankAccount(bankAccountId),
    enabled,
    staleTime: 60_000,
  });
};

// ============= MUTATION HOOKS =============

export const useBulkRerunReconciliations = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data?: BulkRerunReconciliationRequest) =>
      reconciliationService.bulkRerunReconciliations(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: reconciliationKeys.all });
    },
  });
};

export const useRerunReconciliation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: number; data?: RerunReconciliationRequest }) =>
      reconciliationService.rerunReconciliation(id, data),
    onSuccess: (_result, { id }) => {
      queryClient.invalidateQueries({ queryKey: reconciliationKeys.detail(id) });
      queryClient.invalidateQueries({ queryKey: reconciliationKeys.lists() });
    },
  });
};

export const useResolveException = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      reconciliationId,
      exceptionId,
      data,
    }: {
      reconciliationId: number;
      exceptionId: number;
      data: ResolveExceptionRequest;
    }) => reconciliationService.resolveException(reconciliationId, exceptionId, data),
    onSuccess: (_result, { reconciliationId }) => {
      queryClient.invalidateQueries({ queryKey: reconciliationKeys.detail(reconciliationId) });
      queryClient.invalidateQueries({ queryKey: reconciliationKeys.lists() });
    },
  });
};

export const useSecondResolveException = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      reconciliationId,
      exceptionId,
      data,
    }: {
      reconciliationId: number;
      exceptionId: number;
      data: SecondResolveExceptionRequest;
    }) => reconciliationService.secondResolveException(reconciliationId, exceptionId, data),
    onSuccess: (_result, { reconciliationId }) => {
      queryClient.invalidateQueries({ queryKey: reconciliationKeys.detail(reconciliationId) });
      queryClient.invalidateQueries({ queryKey: reconciliationKeys.lists() });
    },
  });
};

export const useUnmatchTransaction = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      reconciliationId,
      transactionId,
      data,
    }: {
      reconciliationId: number;
      transactionId: string;
      data: UnmatchTransactionRequest;
    }) => reconciliationService.unmatchTransaction(reconciliationId, transactionId, data),
    onSuccess: (_result, { reconciliationId }) => {
      queryClient.invalidateQueries({ queryKey: reconciliationKeys.detail(reconciliationId) });
      queryClient.invalidateQueries({
        queryKey: reconciliationKeys.transactions(reconciliationId),
      });
      queryClient.invalidateQueries({ queryKey: reconciliationKeys.lists() });
    },
  });
};

export const useUnresolveException = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      exceptionId,
      data,
    }: {
      exceptionId: number;
      data: UnresolveExceptionRequest;
    }) => reconciliationService.unresolveException(exceptionId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: reconciliationKeys.all });
    },
  });
};

export const useResolveExceptionToExpense = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      reconciliationId,
      exceptionId,
      data,
    }: {
      reconciliationId: number;
      exceptionId: number;
      data: { resolution_notes: string; expense_account_id?: number; amount?: string };
    }) =>
      reconciliationService.resolveExceptionToExpense(reconciliationId, exceptionId, data),
    onSuccess: (_result, { reconciliationId }) => {
      queryClient.invalidateQueries({ queryKey: reconciliationKeys.detail(reconciliationId) });
      queryClient.invalidateQueries({ queryKey: reconciliationKeys.lists() });
    },
  });
};

export const useUploadReconciliation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: reconciliationService.uploadStatement,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: reconciliationKeys.all });
    },
  });
};
