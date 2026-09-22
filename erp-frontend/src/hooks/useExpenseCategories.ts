import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { expenseCategoryService } from '../services/expenseCategoryService';
import {
  ExpenseCategory,
  CreateExpenseCategory,
  UpdateExpenseCategory,
  ExpenseCategoryFilters,
} from '../types/expenseCategory';

// Query Keys
export const expenseCategoryKeys = {
  all: ['expenseCategories'] as const,
  lists: () => [...expenseCategoryKeys.all, 'list'] as const,
  list: (filters?: ExpenseCategoryFilters) => [...expenseCategoryKeys.lists(), filters] as const,
  details: () => [...expenseCategoryKeys.all, 'detail'] as const,
  detail: (id: number) => [...expenseCategoryKeys.details(), id] as const,
};

// Hooks
export const useExpenseCategories = (filters?: ExpenseCategoryFilters) => {
  return useQuery({
    queryKey: expenseCategoryKeys.list(filters),
    queryFn: () => expenseCategoryService.getExpenseCategories(filters),
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
};

export const useExpenseCategory = (id: number, enabled = true) => {
  return useQuery({
    queryKey: expenseCategoryKeys.detail(id),
    queryFn: () => expenseCategoryService.getExpenseCategory(id),
    enabled: enabled && !!id,
    staleTime: 5 * 60 * 1000,
  });
};

export const useCreateExpenseCategory = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateExpenseCategory) => expenseCategoryService.createExpenseCategory(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: expenseCategoryKeys.lists() });
    },
  });
};

export const useUpdateExpenseCategory = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: UpdateExpenseCategory }) =>
      expenseCategoryService.updateExpenseCategory(id, data),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: expenseCategoryKeys.lists() });
      queryClient.invalidateQueries({ queryKey: expenseCategoryKeys.detail(id) });
    },
  });
};

export const useDeleteExpenseCategory = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: number) => expenseCategoryService.deleteExpenseCategory(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: expenseCategoryKeys.lists() });
    },
  });
};

// Utility hook for getting all expense categories (for dropdowns).
// Pass `branchId` to ask the backend to only return categories for that
// branch (e.g. PostToExpenseModal, which must never offer a category whose
// expense account belongs to a different branch than the reconciliation
// being resolved — see ExpenseCategoryViewSet.filterset_fields).
export const useAllExpenseCategories = (branchId?: number | null) => {
  const filters = { page_size: 1000, ...(branchId ? { branch: branchId } : {}) };
  return useQuery({
    queryKey: expenseCategoryKeys.list(filters),
    queryFn: () => expenseCategoryService.getExpenseCategories(filters),
    staleTime: 10 * 60 * 1000, // 10 minutes
    select: data => data.results,
  });
};
