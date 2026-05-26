// Prepaid Expense Hooks
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { prepaidExpenseService } from '../services/prepaidExpenseService';
import {
  PrepaidExpenseFilters,
  CreatePrepaidExpense,
  UpdatePrepaidExpense,
  AmortizePrepaidExpense,
  PrepaidExpense,
} from '../types/prepaidExpense';

// Query Keys
export const prepaidExpenseKeys = {
  all: ['prepaid-expenses'] as const,
  lists: () => [...prepaidExpenseKeys.all, 'list'] as const,
  list: (params?: PrepaidExpenseFilters) => [...prepaidExpenseKeys.lists(), params] as const,
  details: () => [...prepaidExpenseKeys.all, 'detail'] as const,
  detail: (id: number) => [...prepaidExpenseKeys.details(), id] as const,
  menu: () => [...prepaidExpenseKeys.all, 'menu'] as const,
};

// Query Hooks
export const usePrepaidExpenses = (params?: PrepaidExpenseFilters) => {
  return useQuery({
    queryKey: prepaidExpenseKeys.list(params),
    queryFn: () => prepaidExpenseService.getPrepaidExpenses(params),
    staleTime: 5 * 60 * 1000, // 5 minutes
    placeholderData: previousData => previousData,
  });
};

export const usePrepaidExpense = (id: number, enabled: boolean = true) => {
  return useQuery({
    queryKey: prepaidExpenseKeys.detail(id),
    queryFn: () => prepaidExpenseService.getPrepaidExpense(id),
    enabled: enabled && !!id,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
};

export const useActivePrepaidExpenses = () => {
  return useQuery({
    queryKey: prepaidExpenseKeys.list({ status: 'active', page_size: 1000 }),
    queryFn: () => prepaidExpenseService.getActivePrepaidExpenses(),
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
};

export const usePrepaidExpensesByCategory = (categoryId: number, enabled: boolean = true) => {
  return useQuery({
    queryKey: prepaidExpenseKeys.list({ category: categoryId, page_size: 1000 }),
    queryFn: () => prepaidExpenseService.getPrepaidExpensesByCategory(categoryId),
    enabled: enabled && !!categoryId,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
};

export const usePrepaidExpensesMenu = () => {
  return useQuery({
    queryKey: prepaidExpenseKeys.menu(),
    queryFn: () => prepaidExpenseService.getPrepaidExpensesMenu(),
    staleTime: 10 * 60 * 1000, // 10 minutes
  });
};

// Mutation Hooks
export const useCreatePrepaidExpense = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreatePrepaidExpense) => prepaidExpenseService.createPrepaidExpense(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: prepaidExpenseKeys.lists() });
      queryClient.invalidateQueries({ queryKey: prepaidExpenseKeys.menu() });
    },
  });
};

export const useUpdatePrepaidExpense = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: UpdatePrepaidExpense }) =>
      prepaidExpenseService.updatePrepaidExpense(id, data),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: prepaidExpenseKeys.detail(id) });
      queryClient.invalidateQueries({ queryKey: prepaidExpenseKeys.lists() });
      queryClient.invalidateQueries({ queryKey: prepaidExpenseKeys.menu() });
    },
  });
};

export const useDeletePrepaidExpense = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: number) => prepaidExpenseService.deletePrepaidExpense(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: prepaidExpenseKeys.lists() });
      queryClient.invalidateQueries({ queryKey: prepaidExpenseKeys.menu() });
    },
  });
};

export const useAmortizePrepaidExpense = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      id,
      data,
      expenseData,
    }: {
      id: number;
      data: AmortizePrepaidExpense;
      expenseData: PrepaidExpense;
    }) => prepaidExpenseService.amortizePrepaidExpense(id, data, expenseData),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: prepaidExpenseKeys.detail(id) });
      queryClient.invalidateQueries({ queryKey: prepaidExpenseKeys.lists() });
      queryClient.invalidateQueries({ queryKey: prepaidExpenseKeys.menu() });
    },
  });
};

export const usePostPrepaidExpenseToAccounts = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: number) => prepaidExpenseService.postToAccounts(id),
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: prepaidExpenseKeys.detail(id) });
      queryClient.invalidateQueries({ queryKey: prepaidExpenseKeys.lists() });
    },
  });
};
