import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  incomeFeeStructureService,
  type FeeStructure,
} from '../services/incomeFeeStructureService';
import { incomeCategoryService } from '../services/incomeCategoryService';

// ─── Query Key Factories ─────────────────────────────────────────────────────

export const incomeFeeKeys = {
  all: ['income-fees'] as const,
  structures: () => [...incomeFeeKeys.all, 'structures'] as const,
  structureList: (params?: Record<string, unknown>) =>
    [...incomeFeeKeys.structures(), 'list', params] as const,
  structureDetail: (id: number) => [...incomeFeeKeys.structures(), 'detail', id] as const,
  categories: () => [...incomeFeeKeys.all, 'categories'] as const,
  categoryList: (params?: Record<string, unknown>) =>
    [...incomeFeeKeys.categories(), 'list', params] as const,
  accounts: () => [...incomeFeeKeys.all, 'accounts'] as const,
};

// ─── Fee Structure Queries ───────────────────────────────────────────────────

export const useIncomeFeeStructures = (params?: {
  ordering?: string;
  page?: number;
  search?: string;
  is_active?: boolean;
  frequency?: string;
  category?: number;
}) => {
  return useQuery({
    queryKey: incomeFeeKeys.structureList(params),
    queryFn: () => incomeFeeStructureService.getFeeStructures(params),
    staleTime: 60_000,
  });
};

export const useIncomeFeeStructure = (id: number, enabled = true) => {
  return useQuery({
    queryKey: incomeFeeKeys.structureDetail(id),
    queryFn: () => incomeFeeStructureService.getFeeStructure(id),
    enabled,
    staleTime: 30_000,
  });
};

// ─── Income Category Queries ─────────────────────────────────────────────────

export const useIncomeCategories = (params?: {
  is_active?: boolean;
  search?: string;
  page?: number;
}) => {
  return useQuery({
    queryKey: incomeFeeKeys.categoryList(params),
    queryFn: () => incomeCategoryService.getIncomeCategories(params),
    staleTime: 60_000,
  });
};

// ─── Fee Structure Mutations ─────────────────────────────────────────────────

export const useCreateIncomeFeeStructure = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: any) => incomeFeeStructureService.createFeeStructure(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: incomeFeeKeys.structures() });
    },
  });
};

export const useUpdateIncomeFeeStructure = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<FeeStructure> }) =>
      incomeFeeStructureService.updateFeeStructure(id, data),
    onSuccess: (_data, { id }) => {
      qc.invalidateQueries({ queryKey: incomeFeeKeys.structureDetail(id) });
      qc.invalidateQueries({ queryKey: incomeFeeKeys.structures() });
    },
  });
};

export const useApproveFeeStructure = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, approval_notes }: { id: number; approval_notes: string }) =>
      incomeFeeStructureService.approveFeeStructure(id, approval_notes),
    onSuccess: (_data, { id }) => {
      qc.invalidateQueries({ queryKey: incomeFeeKeys.structureDetail(id) });
      qc.invalidateQueries({ queryKey: incomeFeeKeys.structures() });
    },
  });
};

export const useRejectFeeStructure = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, approval_notes }: { id: number; approval_notes: string }) =>
      incomeFeeStructureService.rejectFeeStructure(id, approval_notes),
    onSuccess: (_data, { id }) => {
      qc.invalidateQueries({ queryKey: incomeFeeKeys.structureDetail(id) });
      qc.invalidateQueries({ queryKey: incomeFeeKeys.structures() });
    },
  });
};

export const useSubmitForApproval = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, approval_notes }: { id: number; approval_notes?: string }) =>
      incomeFeeStructureService.submitForApproval(id, approval_notes),
    onSuccess: (_data, { id }) => {
      qc.invalidateQueries({ queryKey: incomeFeeKeys.structureDetail(id) });
      qc.invalidateQueries({ queryKey: incomeFeeKeys.structures() });
    },
  });
};

export const useSetupFeeStructure = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: any) => incomeFeeStructureService.setupFeeStructure(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: incomeFeeKeys.structures() });
    },
  });
};

export const useFeeStructureAccounts = (params?: {
  account_type?: string;
  account_level?: string;
  page?: number;
  search?: string;
}) => {
  return useQuery({
    queryKey: [...incomeFeeKeys.accounts(), params],
    queryFn: () => incomeFeeStructureService.getAccounts(params),
    staleTime: 120_000,
  });
};
