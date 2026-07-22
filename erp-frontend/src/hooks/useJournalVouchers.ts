import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  journalVoucherService,
  type JournalVoucherFilters,
  type CreateJournalVoucherData,
} from '../services/journalVoucherService';

export const journalVoucherKeys = {
  all: ['journal-vouchers'] as const,
  lists: () => [...journalVoucherKeys.all, 'list'] as const,
  list: (params?: JournalVoucherFilters) => [...journalVoucherKeys.lists(), params] as const,
  details: () => [...journalVoucherKeys.all, 'detail'] as const,
  detail: (id: number) => [...journalVoucherKeys.details(), id] as const,
  series: () => [...journalVoucherKeys.all, 'series'] as const,
};

export const useJournalVouchers = (params?: JournalVoucherFilters) => {
  return useQuery({
    queryKey: journalVoucherKeys.list(params),
    queryFn: () => journalVoucherService.getJournalVouchers(params),
    staleTime: 60_000,
  });
};

export const useJournalVoucher = (id: number, enabled = true) => {
  return useQuery({
    queryKey: journalVoucherKeys.detail(id),
    queryFn: () => journalVoucherService.getJournalVoucher(id),
    enabled,
    staleTime: 30_000,
  });
};

export const useTransactionSeries = () => {
  return useQuery({
    queryKey: journalVoucherKeys.series(),
    queryFn: () => journalVoucherService.getTransactionSeries(),
    staleTime: 300_000,
  });
};

export const useCreateJournalVoucher = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateJournalVoucherData) => journalVoucherService.createJournalVoucher(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: journalVoucherKeys.all });
    },
  });
};

export const useApproveJournalVoucher = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => journalVoucherService.approveJournalVoucher(id),
    onSuccess: (_data, id) => {
      qc.invalidateQueries({ queryKey: journalVoucherKeys.detail(id) });
      qc.invalidateQueries({ queryKey: journalVoucherKeys.lists() });
    },
  });
};

export const usePostJournalVoucher = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reason }: { id: number; reason: string }) =>
      journalVoucherService.reverseJournalVoucher(id, reason),
    onSuccess: (_data, { id }) => {
      qc.invalidateQueries({ queryKey: journalVoucherKeys.detail(id) });
      qc.invalidateQueries({ queryKey: journalVoucherKeys.lists() });
    },
  });
};
