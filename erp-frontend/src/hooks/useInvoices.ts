// src/hooks/useInvoices.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  invoiceService,
  type InvoiceFilters,
  type CreateInvoiceData,
  type CreateCreditNoteData,
} from '../services/invoiceService';
import { creditNoteService, type StandaloneCreditNoteFilters } from '../services/creditNoteService';
import { serviceItemService } from '../services/serviceItemService';

// ─── Query Key Factory ───────────────────────────────────────────────────────

export const invoiceKeys = {
  all: ['invoices'] as const,
  lists: () => [...invoiceKeys.all, 'list'] as const,
  list: (params?: InvoiceFilters) => [...invoiceKeys.lists(), params] as const,
  details: () => [...invoiceKeys.all, 'detail'] as const,
  detail: (id: number) => [...invoiceKeys.details(), id] as const,
  paymentHistory: (id: number) => [...invoiceKeys.detail(id), 'payments'] as const,

  creditNotes: () => [...invoiceKeys.all, 'credit-notes'] as const,
  creditNoteList: (invoiceId: number, params?: any) =>
    [...invoiceKeys.creditNotes(), 'list', invoiceId, params] as const,
  creditNoteDetail: (invoiceId: number, creditNoteId: number) =>
    [...invoiceKeys.creditNotes(), 'detail', invoiceId, creditNoteId] as const,

  // Standalone credit notes
  standaloneCreditNotes: () => ['standalone-credit-notes'] as const,
  standaloneCreditNoteList: (params?: StandaloneCreditNoteFilters) =>
    [...invoiceKeys.standaloneCreditNotes(), 'list', params] as const,
  standaloneCreditNoteDetail: (id: number) =>
    [...invoiceKeys.standaloneCreditNotes(), 'detail', id] as const,

  serviceItems: () => [...invoiceKeys.all, 'service-items'] as const,
  batchSample: (batchId: string, samplePct: number) =>
    [...invoiceKeys.all, 'batch-sample', batchId, samplePct] as const,
};

// ─── Query Hooks ─────────────────────────────────────────────────────────────

export const useInvoices = (params?: InvoiceFilters) => {
  return useQuery({
    queryKey: invoiceKeys.list(params),
    queryFn: async () => {
      const res = await invoiceService.getInvoices(params);
      return res;
    },
    staleTime: 60_000,
  });
};

export const useInvoice = (id: number, enabled = true) => {
  return useQuery({
    queryKey: invoiceKeys.detail(id),
    queryFn: () => invoiceService.getInvoice(id),
    enabled,
    staleTime: 30_000,
  });
};

export const useInvoicePaymentHistory = (id: number, enabled = true) => {
  return useQuery({
    queryKey: invoiceKeys.paymentHistory(id),
    queryFn: async () => {
      const data = await invoiceService.getPaymentHistory(id);
      return (data as any).payments || [];
    },
    enabled,
    staleTime: 10_000,
  });
};

export const useCreditNotes = (invoiceId: number, params?: any) => {
  return useQuery({
    queryKey: invoiceKeys.creditNoteList(invoiceId, params),
    queryFn: async () => {
      const res = await invoiceService.getCreditNotes(invoiceId, params);
      return res;
    },
    enabled: !!invoiceId,
    staleTime: 30_000,
  });
};

export const useCreditNote = (invoiceId: number, creditNoteId: number, enabled = true) => {
  return useQuery({
    queryKey: invoiceKeys.creditNoteDetail(invoiceId, creditNoteId),
    queryFn: () => invoiceService.getCreditNote(invoiceId, creditNoteId),
    enabled: enabled && !!invoiceId && !!creditNoteId,
    staleTime: 30_000,
  });
};

// Standalone credit note hooks
export const useStandaloneCreditNotes = (params?: StandaloneCreditNoteFilters) => {
  return useQuery({
    queryKey: invoiceKeys.standaloneCreditNoteList(params),
    queryFn: () => creditNoteService.getCreditNotes(params),
    staleTime: 30_000,
  });
};

export const useStandaloneCreditNote = (id: number, enabled = true) => {
  return useQuery({
    queryKey: invoiceKeys.standaloneCreditNoteDetail(id),
    queryFn: () => creditNoteService.getCreditNote(id),
    enabled,
    staleTime: 30_000,
  });
};

export const useInvoiceServiceItems = () => {
  return useQuery({
    queryKey: invoiceKeys.serviceItems(),
    queryFn: async () => {
      const res = await serviceItemService.getServiceItems({ is_active: true });
      return res.results || [];
    },
    staleTime: 120_000,
  });
};

export const useBatchReviewSample = (batchId: string, samplePercent: number, enabled = true) => {
  return useQuery({
    queryKey: invoiceKeys.batchSample(batchId, samplePercent),
    queryFn: () => invoiceService.getBatchSample(batchId, samplePercent),
    enabled: enabled && !!batchId,
    staleTime: 30_000,
  });
};

// ─── Mutation Hooks ──────────────────────────────────────────────────────────

export const useCreateInvoice = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateInvoiceData) => invoiceService.createInvoice(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: invoiceKeys.lists() });
    },
  });
};

export const useUpdateInvoice = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<CreateInvoiceData> }) =>
      invoiceService.updateInvoice(id, data),
    onSuccess: (_result, { id }) => {
      queryClient.invalidateQueries({ queryKey: invoiceKeys.lists() });
      queryClient.invalidateQueries({ queryKey: invoiceKeys.detail(id) });
    },
  });
};

export const useCreateCreditNote = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      invoiceId,
      data,
    }: {
      invoiceId: number;
      data: CreateCreditNoteData;
    }) => invoiceService.createCreditNote(invoiceId, data),
    onSuccess: (_result, { invoiceId }) => {
      queryClient.invalidateQueries({ queryKey: invoiceKeys.creditNoteList(invoiceId) });
      queryClient.invalidateQueries({ queryKey: invoiceKeys.creditNotes() });
    },
  });
};

export const useUpdateCreditNote = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      invoiceId,
      creditNoteId,
      data,
    }: {
      invoiceId: number;
      creditNoteId: number;
      data: Partial<CreateCreditNoteData>;
    }) => invoiceService.updateCreditNote(invoiceId, creditNoteId, data),
    onSuccess: (_result, { invoiceId, creditNoteId }) => {
      queryClient.invalidateQueries({ queryKey: invoiceKeys.creditNoteList(invoiceId) });
      queryClient.invalidateQueries({
        queryKey: invoiceKeys.creditNoteDetail(invoiceId, creditNoteId),
      });
      queryClient.invalidateQueries({ queryKey: invoiceKeys.creditNotes() });
    },
  });
};

export const useBulkInvoiceReview = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: any) => invoiceService.createBulkInvoices(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: invoiceKeys.lists() });
    },
  });
};

export const useSubmitInvoice = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateInvoiceData) => invoiceService.createInvoice(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: invoiceKeys.lists() });
    },
  });
};
