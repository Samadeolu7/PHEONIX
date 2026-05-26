import {
  ExpenseCategory,
  CreateExpenseCategory,
  UpdateExpenseCategory,
  ExpenseCategoryListResponse,
  ExpenseCategoryFilters,
} from '../types/expenseCategory';
import { api } from './api';

export const expenseCategoryService = {
  async getExpenseCategories(
    filters?: ExpenseCategoryFilters
  ): Promise<ExpenseCategoryListResponse> {
    const params = new URLSearchParams();

    if (filters?.search) params.append('search', filters.search);
    if (filters?.requires_approval !== undefined)
      params.append('requires_approval', filters.requires_approval.toString());
    if (filters?.expense_account)
      params.append('expense_account', filters.expense_account.toString());
    if (filters?.prepaid_account)
      params.append('prepaid_account', filters.prepaid_account.toString());
    if (filters?.page) params.append('page', filters.page.toString());
    if (filters?.page_size) params.append('page_size', filters.page_size.toString());

    const response = await api.get(`/expenses/categories/?${params.toString()}`);
    return response;
  },

  async getExpenseCategory(id: number): Promise<ExpenseCategory> {
    const response = await api.get(`/expenses/categories/${id}/`);
    return response;
  },

  async createExpenseCategory(data: CreateExpenseCategory): Promise<ExpenseCategory> {
    const response = await api.post('/expenses/categories/', data);
    return response;
  },

  async updateExpenseCategory(id: number, data: UpdateExpenseCategory): Promise<ExpenseCategory> {
    const response = await api.patch(`/expenses/categories/${id}/`, data);
    return response;
  },

  async deleteExpenseCategory(id: number): Promise<void> {
    await api.delete(`/expenses/categories/${id}/`);
  },

  async getBudgetStatus(id: number): Promise<{
    category: string;
    budget_amount: string | null;
    budget_period?: string;
    period_start?: string;
    total_spent?: string;
    remaining?: string;
    utilization_percent?: number;
    is_over_budget?: boolean;
    message?: string;
  }> {
    return api.get(`/expenses/categories/${id}/budget_status/`);
  },
};
