import { api } from './api';
import { Expense, CreateExpense, ExpenseFilters, ExpenseListResponse } from '../types/expense';

export const expenseService = {
  async getExpenses(filters?: ExpenseFilters): Promise<ExpenseListResponse> {
    const params = new URLSearchParams();
    if (filters?.status) params.append('status', filters.status);
    if (filters?.category) params.append('category', filters.category.toString());
    if (filters?.expense_type) params.append('expense_type', filters.expense_type);
    if (filters?.payment_method) params.append('payment_method', filters.payment_method);
    if (filters?.approved !== undefined) params.append('approved', filters.approved.toString());
    if (filters?.is_posted !== undefined) params.append('is_posted', filters.is_posted.toString());
    if (filters?.start_date) params.append('start_date', filters.start_date);
    if (filters?.end_date) params.append('end_date', filters.end_date);
    if (filters?.search) params.append('search', filters.search);
    if (filters?.page) params.append('page', filters.page.toString());
    if (filters?.page_size) params.append('page_size', filters.page_size.toString());

    const response = await api.get(`/expenses/?${params.toString()}`);
    return response;
  },

  async getExpense(id: number): Promise<Expense> {
    const response = await api.get(`/expenses/${id}/`);
    return response;
  },

  async createExpense(data: CreateExpense): Promise<Expense> {
    const response = await api.post('/expenses/', data);
    return response;
  },

  async updateExpense(id: number, data: Partial<CreateExpense>): Promise<Expense> {
    const response = await api.patch(`/expenses/${id}/`, data);
    return response;
  },

  async deleteExpense(id: number): Promise<void> {
    await api.delete(`/expenses/${id}/`);
  },

  async submitExpense(id: number): Promise<Expense> {
    const response = await api.post(`/expenses/${id}/submit/`, {});
    return response;
  },

  async approveExpense(id: number, notes?: string): Promise<Expense> {
    const response = await api.post(`/expenses/${id}/approve/`, { notes });
    return response;
  },

  async rejectExpense(id: number, reason: string): Promise<Expense> {
    const response = await api.post(`/expenses/${id}/reject/`, { reason });
    return response;
  },

  async postExpense(id: number): Promise<Expense> {
    const response = await api.post(`/expenses/${id}/post/`, {});
    return response;
  },

  async uploadReceipt(id: number, file: File): Promise<Expense> {
    const formData = new FormData();
    formData.append('receipt_file', file);
    const response = await api.patch(`/expenses/${id}/`, formData);
    return response;
  },

  async getPendingApproval(): Promise<ExpenseListResponse> {
    const response = await api.get('/expenses/pending_approval/');
    return response;
  },

  async getSummary(): Promise<Record<string, any>> {
    const response = await api.get('/expenses/summary/');
    return response;
  },
};
