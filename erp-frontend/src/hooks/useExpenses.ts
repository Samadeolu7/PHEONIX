import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { expenseService } from '../services/expenseService';
import { CreateExpense, ExpenseFilters } from '../types/expense';

export const expenseKeys = {
  all: ['expenses'] as const,
  list: (filters?: ExpenseFilters) => [...expenseKeys.all, 'list', filters] as const,
  detail: (id: number) => [...expenseKeys.all, 'detail', id] as const,
  pendingApproval: () => [...expenseKeys.all, 'pending-approval'] as const,
  summary: () => [...expenseKeys.all, 'summary'] as const,
};

export const useExpenses = (filters?: ExpenseFilters) => {
  return useQuery({
    queryKey: expenseKeys.list(filters),
    queryFn: () => expenseService.getExpenses(filters),
    staleTime: 60 * 1000,
  });
};

export const useExpense = (id: number, enabled = true) => {
  return useQuery({
    queryKey: expenseKeys.detail(id),
    queryFn: () => expenseService.getExpense(id),
    enabled: enabled && !!id,
    staleTime: 60 * 1000,
  });
};

export const useExpenseSummary = () => {
  return useQuery({
    queryKey: expenseKeys.summary(),
    queryFn: () => expenseService.getSummary(),
    staleTime: 120 * 1000,
  });
};

export const useCreateExpense = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateExpense) => expenseService.createExpense(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: expenseKeys.all });
    },
  });
};

export const useUpdateExpense = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<CreateExpense> }) =>
      expenseService.updateExpense(id, data),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: expenseKeys.detail(id) });
      queryClient.invalidateQueries({ queryKey: expenseKeys.all });
    },
  });
};

export const useDeleteExpense = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => expenseService.deleteExpense(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: expenseKeys.all });
    },
  });
};

export const useSubmitExpense = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => expenseService.submitExpense(id),
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: expenseKeys.detail(id) });
      queryClient.invalidateQueries({ queryKey: expenseKeys.all });
    },
  });
};

export const useApproveExpense = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, notes }: { id: number; notes?: string }) =>
      expenseService.approveExpense(id, notes),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: expenseKeys.detail(id) });
      queryClient.invalidateQueries({ queryKey: expenseKeys.all });
    },
  });
};

export const useRejectExpense = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reason }: { id: number; reason: string }) =>
      expenseService.rejectExpense(id, reason),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: expenseKeys.detail(id) });
      queryClient.invalidateQueries({ queryKey: expenseKeys.all });
    },
  });
};

export const usePostExpense = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => expenseService.postExpense(id),
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: expenseKeys.detail(id) });
      queryClient.invalidateQueries({ queryKey: expenseKeys.all });
    },
  });
};
