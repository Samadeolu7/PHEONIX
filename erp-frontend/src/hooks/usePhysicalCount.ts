import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import physicalCountService from '../services/physicalCountService';
import type {
  PhysicalCountFilters,
  PhysicalCountFormData,
  PhysicalCountLineCreate,
  PhysicalCountLineFilters,
  VarianceReportFilters,
} from '../types/physicalCount';

export const physicalCountKeys = {
  all: ['physical-counts'] as const,
  lists: () => [...physicalCountKeys.all, 'list'] as const,
  list: (params?: object) => [...physicalCountKeys.lists(), params] as const,
  detail: (id: number) => [...physicalCountKeys.all, id] as const,
  lines: (params?: object) => [...physicalCountKeys.all, 'lines', params] as const,
  line: (id: number) => [...physicalCountKeys.all, 'line', id] as const,
  varianceReport: (id: number) => [...physicalCountKeys.all, id, 'variance-report'] as const,
  varianceSummary: (params?: object) =>
    [...physicalCountKeys.all, 'variance-summary', params] as const,
};

// ============= QUERIES =============

export const usePhysicalCounts = (filters?: PhysicalCountFilters, page = 1, pageSize = 20) => {
  return useQuery({
    queryKey: physicalCountKeys.list({ ...filters, page, pageSize }),
    queryFn: () => physicalCountService.getPhysicalCounts(filters, page, pageSize),
    staleTime: 30_000,
  });
};

export const usePhysicalCount = (id: number, enabled = true) => {
  return useQuery({
    queryKey: physicalCountKeys.detail(id),
    queryFn: () => physicalCountService.getPhysicalCount(id),
    enabled: enabled && !!id,
    staleTime: 30_000,
  });
};

export const usePhysicalCountLines = (
  filters?: PhysicalCountLineFilters,
  page = 1,
  pageSize = 100
) => {
  return useQuery({
    queryKey: physicalCountKeys.lines({ ...filters, page, pageSize }),
    queryFn: () => physicalCountService.getPhysicalCountLines(filters, page, pageSize),
    staleTime: 30_000,
  });
};

export const usePhysicalCountLine = (id: number, enabled = true) => {
  return useQuery({
    queryKey: physicalCountKeys.line(id),
    queryFn: () => physicalCountService.getPhysicalCountLine(id),
    enabled: enabled && !!id,
    staleTime: 30_000,
  });
};

export const useVarianceReport = (countId: number, enabled = true) => {
  return useQuery({
    queryKey: physicalCountKeys.varianceReport(countId),
    queryFn: () => physicalCountService.getVarianceReport(countId),
    enabled: enabled && !!countId,
    staleTime: 60_000,
  });
};

export const useVarianceSummary = (filters?: VarianceReportFilters) => {
  return useQuery({
    queryKey: physicalCountKeys.varianceSummary(filters),
    queryFn: () => physicalCountService.getVarianceSummary(filters),
    staleTime: 60_000,
  });
};

// ============= MUTATIONS =============

export const useCreatePhysicalCount = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: PhysicalCountFormData) => physicalCountService.createPhysicalCount(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: physicalCountKeys.lists() });
    },
  });
};

export const useUpdatePhysicalCount = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<PhysicalCountFormData> }) =>
      physicalCountService.updatePhysicalCount(id, data),
    onSuccess: (_, { id }) => {
      qc.invalidateQueries({ queryKey: physicalCountKeys.detail(id) });
      qc.invalidateQueries({ queryKey: physicalCountKeys.lists() });
    },
  });
};

export const useDeletePhysicalCount = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => physicalCountService.deletePhysicalCount(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: physicalCountKeys.lists() });
    },
  });
};

export const useAddCountLines = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ countId, lines }: { countId: number; lines: PhysicalCountLineCreate[] }) =>
      physicalCountService.addCountLines(countId, { lines }),
    onSuccess: (_, { countId }) => {
      qc.invalidateQueries({ queryKey: physicalCountKeys.detail(countId) });
      qc.invalidateQueries({ queryKey: physicalCountKeys.lists() });
    },
  });
};

export const useUpdatePhysicalCountLine = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<PhysicalCountLineCreate> }) =>
      physicalCountService.updatePhysicalCountLine(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: physicalCountKeys.all });
    },
  });
};

export const useDeletePhysicalCountLine = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => physicalCountService.deletePhysicalCountLine(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: physicalCountKeys.all });
    },
  });
};

export const useSubmitPhysicalCount = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (countId: number) => physicalCountService.submitCount(countId),
    onSuccess: (_, countId) => {
      qc.invalidateQueries({ queryKey: physicalCountKeys.detail(countId) });
      qc.invalidateQueries({ queryKey: physicalCountKeys.lists() });
    },
  });
};

export const useApprovePhysicalCount = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ countId, reviewNotes }: { countId: number; reviewNotes?: string }) =>
      physicalCountService.approveCount(countId, { review_notes: reviewNotes }),
    onSuccess: (_, { countId }) => {
      qc.invalidateQueries({ queryKey: physicalCountKeys.detail(countId) });
      qc.invalidateQueries({ queryKey: physicalCountKeys.lists() });
    },
  });
};

export const useRejectPhysicalCount = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ countId, reviewNotes }: { countId: number; reviewNotes: string }) =>
      physicalCountService.rejectCount(countId, { review_notes: reviewNotes }),
    onSuccess: (_, { countId }) => {
      qc.invalidateQueries({ queryKey: physicalCountKeys.detail(countId) });
      qc.invalidateQueries({ queryKey: physicalCountKeys.lists() });
    },
  });
};

export const usePostAdjustments = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (countId: number) => physicalCountService.postAdjustments(countId),
    onSuccess: (_, countId) => {
      qc.invalidateQueries({ queryKey: physicalCountKeys.detail(countId) });
      qc.invalidateQueries({ queryKey: physicalCountKeys.lists() });
    },
  });
};
