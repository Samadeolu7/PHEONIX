// Prepaid Expense Service
import { api } from './api';
import {
  PrepaidExpense,
  PrepaidExpenseListResponse,
  PrepaidExpenseFilters,
  CreatePrepaidExpense,
  UpdatePrepaidExpense,
  AmortizePrepaidExpense,
  AmortizePrepaidExpensePayload,
  PostToAccountsResponse,
} from '../types/prepaidExpense';

class PrepaidExpenseService {
  // CRUD Operations
  async getPrepaidExpenses(params?: PrepaidExpenseFilters): Promise<PrepaidExpenseListResponse> {
    const response = await api.get('/expenses/prepaid/', { params });
    return response;
  }

  async getPrepaidExpense(id: number): Promise<PrepaidExpense> {
    const response = await api.get(`/expenses/prepaid/${id}/`);
    return response;
  }

  async createPrepaidExpense(data: CreatePrepaidExpense): Promise<PrepaidExpense> {
    const response = await api.post('/expenses/prepaid/', data);
    return response;
  }

  async updatePrepaidExpense(id: number, data: UpdatePrepaidExpense): Promise<PrepaidExpense> {
    const response = await api.patch(`/expenses/prepaid/${id}/`, data);
    return response;
  }

  async deletePrepaidExpense(id: number): Promise<void> {
    await api.delete(`/expenses/prepaid/${id}/`);
  }

  // Amortization - Updated to send full expense data as per API requirements
  async amortizePrepaidExpense(
    id: number,
    amortizationData: AmortizePrepaidExpense,
    expenseData: PrepaidExpense
  ): Promise<PrepaidExpense> {
    // Construct the full payload as required by the API
    const payload: AmortizePrepaidExpensePayload = {
      // Existing expense data
      category: expenseData.category,
      purchase_date: expenseData.purchase_date,
      description: expenseData.description,
      total_amount: expenseData.total_amount,
      measurable: expenseData.measurable,
      unit_of_measure: expenseData.unit_of_measure,
      total_units: expenseData.total_units,
      consumed_units: expenseData.consumed_units,
      unit_cost: expenseData.unit_cost,
      supplier_name: expenseData.supplier_name,
      supplier_invoice: expenseData.supplier_invoice,
      // Amortization data
      amount: amortizationData.amount,
      period_end_date: amortizationData.period_end_date,
      notes: amortizationData.notes,
    };

    const response = await api.post(`/expenses/prepaid/${id}/amortize/`, payload);
    return response;
  }

  // Menu/Dropdown data
  async getPrepaidExpensesMenu(): Promise<PrepaidExpense[]> {
    const response = await api.get('/expenses/prepaid/menu/');
    return response;
  }

  // Utility Methods
  async getActivePrepaidExpenses(): Promise<PrepaidExpense[]> {
    const response = await this.getPrepaidExpenses({
      status: 'active',
      page_size: 1000,
    });
    return response.results;
  }

  async getPrepaidExpensesByCategory(categoryId: number): Promise<PrepaidExpense[]> {
    const response = await this.getPrepaidExpenses({
      category: categoryId,
      page_size: 1000,
    });
    return response.results;
  }

  async postToAccounts(id: number): Promise<PostToAccountsResponse> {
    const response = await api.post(`/expenses/prepaid/${id}/post_to_accounts/`);
    return response;
  }
}

export const prepaidExpenseService = new PrepaidExpenseService();
