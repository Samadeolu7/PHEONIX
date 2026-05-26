import { apiClient } from './api/apiClient';

export interface IncomeCategory {
  id?: number;
  name: string;
  code: string;
  description?: string;
  income_account: number;
  behavior_config?: any;
  parent_category?: number | null;
  is_active?: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface IncomeCategoryListResponse {
  count: number;
  next: string | null;
  previous: string | null;
  results: IncomeCategory[];
}

export interface IncomeAccount {
  id: number;
  code: string;
  name: string;
  account_type: string;
  balance: string;
}

export interface IncomeAccountListResponse {
  count: number;
  next: string | null;
  previous: string | null;
  results: IncomeAccount[];
}

class IncomeCategoryService {
  private baseUrl = '/incomes/categories';

  async getIncomeCategories(params?: {
    ordering?: string;
    page?: number;
    search?: string;
  }): Promise<IncomeCategoryListResponse> {
    const queryParams = new URLSearchParams();

    if (params?.ordering) {
      queryParams.append('ordering', params.ordering);
    }
    if (params?.page) {
      queryParams.append('page', params.page.toString());
    }
    if (params?.search) {
      queryParams.append('search', params.search);
    }

    const url = queryParams.toString()
      ? `${this.baseUrl}/?${queryParams.toString()}`
      : `${this.baseUrl}/`;

    return await apiClient.get<IncomeCategoryListResponse>(url);
  }

  async getIncomeCategory(id: number): Promise<IncomeCategory> {
    return await apiClient.get<IncomeCategory>(`${this.baseUrl}/${id}/`);
  }

  async createIncomeCategory(
    data: Omit<IncomeCategory, 'id' | 'created_at' | 'updated_at'>
  ): Promise<IncomeCategory> {
    return await apiClient.post<IncomeCategory>(`${this.baseUrl}/`, data);
  }

  async updateIncomeCategory(id: number, data: Partial<IncomeCategory>): Promise<IncomeCategory> {
    return await apiClient.patch<IncomeCategory>(`${this.baseUrl}/${id}/`, data);
  }

  async deleteIncomeCategory(id: number): Promise<void> {
    return await apiClient.delete(`${this.baseUrl}/${id}/`);
  }

  async getIncomeAccounts(params?: {
    page?: number;
    search?: string;
  }): Promise<IncomeAccountListResponse> {
    const queryParams = new URLSearchParams();

    // Filter for INCOME type accounts
    queryParams.append('account_type', 'INCOME');

    if (params?.page) {
      queryParams.append('page', params.page.toString());
    }
    if (params?.search) {
      queryParams.append('search', params.search);
    }

    const url = queryParams.toString()
      ? `/accounts/?${queryParams.toString()}`
      : '/accounts/?account_type=INCOME';

    return await apiClient.get<IncomeAccountListResponse>(url);
  }
}

export const incomeCategoryService = new IncomeCategoryService();
