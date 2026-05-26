/**
 * Budget TanStack Query Hooks
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { budgetService } from '../services/budgetService';
import type {
  BudgetPeriodFormData,
  BudgetLineFormData,
  VarianceReportFilters,
} from '../types/budgets';

export const budgetKeys = {
  all: ['budgets'] as const,
  periods: (params?: object) => [...budgetKeys.all, 'periods', params] as const,
  period: (id: number) => [...budgetKeys.all, 'period', id] as const,
  lines: (params?: object) => [...budgetKeys.all, 'lines', params] as const,
  variance: (id: number, filters?: object) =>
    [...budgetKeys.period(id), 'variance', filters] as const,
};

export const useBudgetPeriods = (params?: Parameters<typeof budgetService.getBudgetPeriods>[0]) => {
  return useQuery({
    queryKey: budgetKeys.periods(params),
    queryFn: () => budgetService.getBudgetPeriods(params),
    staleTime: 30_000,
  });
};

export const useBudgetPeriod = (id: number) => {
  return useQuery({
    queryKey: budgetKeys.period(id),
    queryFn: () => budgetService.getBudgetPeriod(id),
    enabled: !!id,
  });
};

export const useCreateBudgetPeriod = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: BudgetPeriodFormData) => budgetService.createBudgetPeriod(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: budgetKeys.periods() });
    },
  });
};

export const useUpdateBudgetPeriod = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<BudgetPeriodFormData> }) =>
      budgetService.updateBudgetPeriod(id, data),
    onSuccess: (_, { id }) => {
      qc.invalidateQueries({ queryKey: budgetKeys.period(id) });
      qc.invalidateQueries({ queryKey: budgetKeys.periods() });
    },
  });
};

export const useApproveBudgetPeriod = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => budgetService.approveBudgetPeriod(id),
    onSuccess: (_, id) => {
      qc.invalidateQueries({ queryKey: budgetKeys.period(id) });
      qc.invalidateQueries({ queryKey: budgetKeys.periods() });
    },
  });
};

export const useActivateBudgetPeriod = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => budgetService.activateBudgetPeriod(id),
    onSuccess: (_, id) => {
      qc.invalidateQueries({ queryKey: budgetKeys.period(id) });
      qc.invalidateQueries({ queryKey: budgetKeys.periods() });
    },
  });
};

export const useBudgetLines = (params?: Parameters<typeof budgetService.getBudgetLines>[0]) => {
  return useQuery({
    queryKey: budgetKeys.lines(params),
    queryFn: () => budgetService.getBudgetLines(params),
    enabled: !!params?.budget_period,
  });
};

export const useCreateBudgetLine = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: BudgetLineFormData & { budget_period: number }) =>
      budgetService.createBudgetLine(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: budgetKeys.all });
    },
  });
};

export const useUpdateBudgetLine = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<BudgetLineFormData> }) =>
      budgetService.updateBudgetLine(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: budgetKeys.all });
    },
  });
};

export const useDeleteBudgetLine = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => budgetService.deleteBudgetLine(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: budgetKeys.all });
    },
  });
};

export const useBudgetVarianceReport = (id: number, filters?: VarianceReportFilters) => {
  return useQuery({
    queryKey: budgetKeys.variance(id, filters),
    queryFn: () => budgetService.getVarianceReport(id, filters),
    enabled: !!id,
  });
};
