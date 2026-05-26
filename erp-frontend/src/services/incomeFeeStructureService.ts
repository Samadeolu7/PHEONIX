import { apiClient } from './api/apiClient';

export interface FeeComponent {
  name: string;
  amount: number;
  is_mandatory: boolean;
}

export interface PaymentTerms {
  allows_partial: boolean;
  minimum_percent: number;
  requires_invoice: boolean;
  grace_period_days: number;
  full_access_at_percent: number;
}

export interface IncomeAccount {
  create_new: boolean;
  account_id?: number;
  name?: string;
  code?: string;
  parent_code?: string;
  parent_name?: string;
  category_id?: number;
}

export interface FeeStructureSetupData {
  name: string;
  code: string;
  base_amount: number;
  description: string;
  income_account: IncomeAccount;
  payment_terms: PaymentTerms;
  fee_components: FeeComponent[];
}

export interface FeeStructureSetupResponse {
  success: boolean;
  fee_structure: {
    id: number;
    name: string;
    code: string;
  };
  income_account: {
    id: number;
    name: string;
    code: string;
  };
  category: {
    id: number;
    name: string;
  };
  needs_config?: boolean;
  message: string;
}

export interface IncomeCategory {
  id: number;
  name: string;
  code: string;
  description: string;
  income_account: {
    id: number;
    code: string;
    name: string;
  };
  is_active: boolean;
}

export interface IncomeCategoryListResponse {
  count: number;
  next: string | null;
  previous: string | null;
  results: IncomeCategory[];
}

export interface FeeStructure {
  id: number;
  name: string;
  code: string;
  description: string;
  category: number;
  category_name: string;
  base_amount: string;
  is_recurring: boolean;
  frequency: string;
  industry_config: string;
  is_active: boolean;
  effective_from: string;
  effective_to: string;
  approval_status?: 'draft' | 'pending_approval' | 'approved' | 'rejected';
  approved_by?: number;
  approved_by_name?: string;
  approved_at?: string;
  approval_notes?: string;
  created_at: string;
  updated_at: string;
}

export interface FeeStructureListResponse {
  count: number;
  next: string | null;
  previous: string | null;
  results: FeeStructure[];
}

export interface Account {
  id: number;
  code: string;
  name: string;
  account_type: string;
  account_level: string;
  parent: number;
  balance: string;
  balance_bf: string;
  category: number;
  can_post_transactions: string;
  is_category_account: string;
  children_count: string;
  total_children_balance: string;
  enable_smart_forms: boolean;
  generated_form_schema: string;
  generated_workflow: string;
  generated_page: string;
  allow_manual_entries: boolean;
  is_system_account: boolean;
  created_at: string;
  updated_at: string;
}

export interface AccountListResponse {
  count: number;
  next: string | null;
  previous: string | null;
  results: Account[];
}

class IncomeFeeStructureService {
  private baseUrl = '/incomes/setup/fee-structure';
  private listUrl = '/incomes/fee-structures';

  async setupFeeStructure(data: FeeStructureSetupData): Promise<FeeStructureSetupResponse> {
    return await apiClient.post<FeeStructureSetupResponse>(this.baseUrl + '/', data);
  }

  async getFeeStructures(params?: {
    ordering?: string;
    page?: number;
    search?: string;
    is_active?: boolean;
    frequency?: string;
    category?: number;
  }): Promise<FeeStructureListResponse> {
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
    if (params?.is_active !== undefined) {
      queryParams.append('is_active', params.is_active.toString());
    }
    if (params?.frequency) {
      queryParams.append('frequency', params.frequency);
    }
    if (params?.category) {
      queryParams.append('category', params.category.toString());
    }

    const url = queryParams.toString()
      ? `${this.listUrl}/?${queryParams.toString()}`
      : `${this.listUrl}/`;

    return await apiClient.get<FeeStructureListResponse>(url);
  }

  async getFeeStructure(id: number): Promise<FeeStructure> {
    return await apiClient.get<FeeStructure>(`${this.listUrl}/${id}/`);
  }

  async updateFeeStructure(id: number, data: Partial<FeeStructure>): Promise<FeeStructure> {
    return await apiClient.patch<FeeStructure>(`${this.listUrl}/${id}/`, data);
  }

  async deactivateFeeStructure(id: number): Promise<FeeStructure> {
    return await apiClient.patch<FeeStructure>(`${this.listUrl}/${id}/`, { is_active: false });
  }

  async activateFeeStructure(id: number): Promise<FeeStructure> {
    return await apiClient.patch<FeeStructure>(`${this.listUrl}/${id}/`, { is_active: true });
  }

  async getFeeStructureUsageStats(id: number): Promise<{
    total_invoices: number;
    total_amount: string;
    active_entitlements: number;
    clients_count: number;
  }> {
    return await apiClient.get<{
      total_invoices: number;
      total_amount: string;
      active_entitlements: number;
      clients_count: number;
    }>(`${this.listUrl}/${id}/usage_stats/`);
  }

  async getAccounts(params?: {
    account_type?: string;
    account_level?: string;
    page?: number;
    search?: string;
  }): Promise<AccountListResponse> {
    const queryParams = new URLSearchParams();

    if (params?.account_type) {
      queryParams.append('account_type', params.account_type);
    }
    if (params?.account_level) {
      queryParams.append('account_level', params.account_level);
    }
    if (params?.page) {
      queryParams.append('page', params.page.toString());
    }
    if (params?.search) {
      queryParams.append('search', params.search);
    }

    const url = queryParams.toString() ? `/accounts/?${queryParams.toString()}` : '/accounts/';

    return await apiClient.get<AccountListResponse>(url);
  }

  async getIncomeCategories(params?: {
    is_active?: boolean;
    search?: string;
    page?: number;
  }): Promise<IncomeCategoryListResponse> {
    const queryParams = new URLSearchParams();

    if (params?.is_active !== undefined) {
      queryParams.append('is_active', params.is_active.toString());
    }
    if (params?.search) {
      queryParams.append('search', params.search);
    }
    if (params?.page) {
      queryParams.append('page', params.page.toString());
    }

    const url = queryParams.toString()
      ? `/incomes/categories/?${queryParams.toString()}`
      : '/incomes/categories/';

    return await apiClient.get<IncomeCategoryListResponse>(url);
  }

  async createFeeStructure(data: any): Promise<FeeStructure> {
    return await apiClient.post<FeeStructure>(`${this.listUrl}/`, data);
  }

  // Approval Workflow Methods
  async submitForApproval(id: number, approval_notes?: string): Promise<FeeStructure> {
    return await apiClient.post<FeeStructure>(`${this.listUrl}/${id}/submit_for_approval/`, {
      approval_notes,
    });
  }

  async approveFeeStructure(id: number, approval_notes: string): Promise<FeeStructure> {
    return await apiClient.post<FeeStructure>(`${this.listUrl}/${id}/approve/`, {
      approval_notes,
    });
  }

  async rejectFeeStructure(id: number, approval_notes: string): Promise<FeeStructure> {
    return await apiClient.post<FeeStructure>(`${this.listUrl}/${id}/reject/`, {
      approval_notes,
    });
  }
}

export const incomeFeeStructureService = new IncomeFeeStructureService();
