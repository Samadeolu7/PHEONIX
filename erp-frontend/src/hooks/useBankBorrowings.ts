import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { bankBorrowingService } from '../services/bankBorrowingService';
import type { BorrowingInput, TreasurySettings } from '../types/bankBorrowing';

export const bankBorrowingKeys = {
  all: ['bank-borrowings'] as const,
  borrowings: (status?: string) => [...bankBorrowingKeys.all, 'borrowings', status] as const,
  borrowing: (id: number) => [...bankBorrowingKeys.all, 'borrowing', id] as const,
  forecast: (branchId?: number, days?: number) => [...bankBorrowingKeys.all, 'forecast', branchId, days] as const,
  loanCheck: (loanId: number, stage: string) => [...bankBorrowingKeys.all, 'loan-check', loanId, stage] as const,
  settings: () => [...bankBorrowingKeys.all, 'settings'] as const,
  bankAccounts: () => [...bankBorrowingKeys.all, 'bank-accounts'] as const,
};

export const useBorrowings = (status?: string) =>
  useQuery({
    queryKey: bankBorrowingKeys.borrowings(status),
    queryFn: () => bankBorrowingService.listBorrowings(status),
    staleTime: 0,
  });

export const useBorrowing = (id: number, enabled = true) =>
  useQuery({
    queryKey: bankBorrowingKeys.borrowing(id),
    queryFn: () => bankBorrowingService.getBorrowing(id),
    enabled: enabled && !!id,
    staleTime: 0,
  });

export const usePreviewBorrowing = () =>
  useMutation({ mutationFn: (data: BorrowingInput) => bankBorrowingService.previewBorrowing(data) });

export const useCreateBorrowing = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: BorrowingInput) => bankBorrowingService.createBorrowing(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: bankBorrowingKeys.all }),
  });
};

const useBorrowingAction = <T>(fn: (arg: T) => Promise<unknown>) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    // Every action changes balances and what each branch can lend.
    onSuccess: () => qc.invalidateQueries({ queryKey: bankBorrowingKeys.all }),
  });
};

export const useReceiveBorrowing = () =>
  useBorrowingAction(({ id, receivedOn }: { id: number; receivedOn?: string }) =>
    bankBorrowingService.receiveBorrowing(id, receivedOn)
  );

export const useSendContribution = () =>
  useBorrowingAction(({ id, sentOn }: { id: number; sentOn?: string }) =>
    bankBorrowingService.sendContribution(id, sentOn)
  );

export const useRecordInstalment = () =>
  useBorrowingAction(({ id, paidOn }: { id: number; paidOn?: string }) =>
    bankBorrowingService.recordInstalment(id, paidOn)
  );

export const useBranchForecast = (branchId?: number, days?: number, enabled = true) =>
  useQuery({
    queryKey: bankBorrowingKeys.forecast(branchId, days),
    queryFn: () => bankBorrowingService.getForecast(branchId, days),
    enabled,
    staleTime: 30 * 1000,
  });

export const useLoanLiquidityCheck = (loanId: number, stage: 'approval' | 'disbursement', enabled = true) =>
  useQuery({
    queryKey: bankBorrowingKeys.loanCheck(loanId, stage),
    queryFn: () => bankBorrowingService.checkLoan(loanId, stage),
    enabled: enabled && !!loanId,
    staleTime: 0,
  });

export const useBankAccountChoices = (enabled = true) =>
  useQuery({
    queryKey: bankBorrowingKeys.bankAccounts(),
    queryFn: () => bankBorrowingService.listBankAccountChoices(),
    enabled,
    staleTime: 60 * 1000,
  });

export const useDeleteBorrowing = () =>
  useBorrowingAction((id: number) => bankBorrowingService.deleteBorrowing(id));

export const useTreasurySettings = () =>
  useQuery({
    queryKey: bankBorrowingKeys.settings(),
    queryFn: () => bankBorrowingService.getSettings(),
    staleTime: 5 * 60 * 1000,
  });

export const useUpdateTreasurySettings = () =>
  useBorrowingAction((data: Partial<TreasurySettings>) => bankBorrowingService.updateSettings(data));
