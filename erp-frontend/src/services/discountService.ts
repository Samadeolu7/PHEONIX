import { apiClient } from './api/apiClient';

export interface DiscountProgram {
  id: number;
  program_code: string;
  name: string;
  description?: string;
  program_type: 'scholarship' | 'staff_benefit' | 'discount' | 'waiver' | 'insurance' | 'promotion';
  discount_type: 'percentage' | 'fixed_amount' | 'full_waiver';
  discount_value: string;
  budget_allocated?: string;
  budget_used: string;
  budget_remaining: string;
  budget_utilization_percent: string;
  max_recipients?: number;
  current_recipients: number;
  start_date: string;
  end_date?: string;
  is_active?: boolean;
  is_renewable?: boolean;
  renewal_period?: 'term' | 'semester' | 'year' | 'none';
  requires_approval?: boolean;
  approval_workflow?: number;
  eligibility_criteria?: any;
  discount_account: number;
  discount_account_detail: any;
  is_within_budget: boolean;
  has_recipient_capacity: boolean;
  is_valid: boolean;
  statistics: string;
  created_at: string;
  updated_at: string;
  created_by?: number;
}

export interface DiscountProgramListParams {
  discount_type?: 'fixed_amount' | 'full_waiver' | 'percentage';
  is_active?: boolean;
  ordering?: string;
  page?: number;
  program_type?:
    | 'discount'
    | 'insurance'
    | 'promotion'
    | 'scholarship'
    | 'staff_benefit'
    | 'waiver';
  search?: string;
}

export interface DiscountProgramCreateData {
  name: string;
  description?: string;
  program_type: 'scholarship' | 'staff_benefit' | 'discount' | 'waiver' | 'insurance' | 'promotion';
  discount_type: 'percentage' | 'fixed_amount' | 'full_waiver';
  discount_value: string;
  budget_allocated?: string;
  max_recipients?: number;
  start_date: string;
  end_date?: string;
  is_active?: boolean;
  is_renewable?: boolean;
  renewal_period?: 'term' | 'semester' | 'year' | 'none';
  requires_approval?: boolean;
  approval_workflow?: number;
  eligibility_criteria?: any;
  discount_account: number;
}

export interface DiscountApplication {
  id: number;
  application_number: string;
  program: number;
  program_detail: any;
  client: number;
  client_detail: any;
  application_date?: string;
  reason: string;
  supporting_documents?: any;
  status: 'draft' | 'submitted' | 'under_review' | 'approved' | 'rejected' | 'expired' | 'revoked';
  reviewed_by?: number;
  reviewed_by_name: string;
  review_date?: string;
  review_notes: string;
  effective_from?: string;
  effective_to?: string;
  custom_discount_value?: string;
  actual_discount_value: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  created_by?: number;
}

export interface DiscountApplicationListParams {
  client?: number;
  ordering?: string;
  page?: number;
  program?: number;
  search?: string;
  status?: 'approved' | 'draft' | 'expired' | 'rejected' | 'revoked' | 'submitted' | 'under_review';
}

export interface DiscountApplicationCreateData {
  program: number;
  client: number;
  application_date?: string;
  reason: string;
  supporting_documents?: any;
  custom_discount_value?: string;
}

export interface AppliedDiscount {
  id: number;
  application: number;
  application_detail: any;
  receivable: number;
  receivable_details: {
    id: number;
    client_name: string;
    original_amount: number;
    balance: number;
    status: string;
    due_date: string;
  };
  discount_amount: string;
  is_posted: boolean;
  posted_at?: string;
  posted_by?: number;
  posted_by_name: string;
  journal_entry?: number;
  is_reversed: boolean;
  reversed_at?: string;
  reversed_by?: number;
  reversed_by_name: string;
  reversal_reason?: string;
  reversal_entry?: number;
  can_be_posted: boolean;
  can_be_reversed: boolean;
  created_at: string;
  updated_at: string;
  created_by?: number;
}

export interface AppliedDiscountListParams {
  application?: number;
  is_posted?: boolean;
  is_reversed?: boolean;
  ordering?: string;
  page?: number;
  receivable?: number;
  search?: string;
}

class DiscountService {
  // Discount Programs
  async getDiscountPrograms(params?: DiscountProgramListParams) {
    const response = await apiClient.get('/incomes/discount-programs/', { params });
    return response.data || response;
  }

  async createDiscountProgram(data: DiscountProgramCreateData) {
    const response = await apiClient.post('/incomes/discount-programs/', data);
    return response.data || response;
  }

  async updateDiscountProgram(id: number, data: Partial<DiscountProgramCreateData>) {
    const response = await apiClient.put(`/incomes/discount-programs/${id}/`, data);
    return response.data || response;
  }

  async deleteDiscountProgram(id: number) {
    const response = await apiClient.delete(`/incomes/discount-programs/${id}/`);
    return response.data || response;
  }

  // Discount Applications
  async getDiscountApplications(params?: DiscountApplicationListParams) {
    const response = await apiClient.get('/incomes/discount-applications/', { params });
    return response.data || response;
  }

  async createDiscountApplication(data: DiscountApplicationCreateData) {
    const response = await apiClient.post('/incomes/discount-applications/', data);
    return response.data || response;
  }

  async getDiscountApplication(id: number) {
    const response = await apiClient.get(`/incomes/discount-applications/${id}/`);
    return response.data || response;
  }

  async submitDiscountApplication(id: number, data: DiscountApplicationCreateData) {
    const response = await apiClient.post(`/incomes/discount-applications/${id}/submit/`, data);
    return response.data || response;
  }

  async approveDiscountApplication(
    id: number,
    data: {
      effective_from: string;
      effective_to?: string;
      review_notes: string;
      custom_discount_value?: string;
    }
  ) {
    const response = await apiClient.post(`/incomes/discount-applications/${id}/approve/`, data);
    return response.data || response;
  }

  async rejectDiscountApplication(id: number, data: { review_notes: string }) {
    const response = await apiClient.post(`/incomes/discount-applications/${id}/reject/`, data);
    return response.data || response;
  }

  // Applied Discounts
  async getAppliedDiscounts(params?: AppliedDiscountListParams) {
    const response = await apiClient.get('/incomes/applied-discounts/', { params });
    return response.data || response;
  }

  async applyDiscount(data: {
    application_id: number;
    receivable_id: number;
    discount_amount: string;
  }) {
    const response = await apiClient.post('/incomes/applied-discounts/apply/', {
      application_id: data.application_id,
      receivable_id: data.receivable_id,
      discount_amount: data.discount_amount,
    });
    return response.data || response;
  }

  async autoApplyDiscounts(data: { client_id: number }) {
    const response = await apiClient.post('/incomes/applied-discounts/auto-apply/', {
      client_id: data.client_id,
    });
    return response.data || response;
  }

  async getProgramStatistics(id: number) {
    const response = await apiClient.get(`/incomes/discount-programs/${id}/statistics/`);
    return response.data || response;
  }

  async getProgramBudget(id: number) {
    const response = await apiClient.get(`/incomes/discount-programs/${id}/budget/`);
    return response.data || response;
  }
}

export const discountService = new DiscountService();
