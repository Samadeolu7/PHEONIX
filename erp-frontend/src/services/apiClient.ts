// API Client for Phoenix ERP
// Handles authentication and API requests

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api';

class APIClient {
  private accessToken: string | null = null;
  private refreshToken: string | null = null;

  constructor() {
    // Load tokens from localStorage on initialization
    this.accessToken = localStorage.getItem('access_token');
    this.refreshToken = localStorage.getItem('refresh_token');
  }

  /**
   * Set authentication tokens
   */
  setTokens(access: string, refresh: string) {
    this.accessToken = access;
    this.refreshToken = refresh;
    localStorage.setItem('access_token', access);
    localStorage.setItem('refresh_token', refresh);
  }

  /**
   * Clear authentication tokens
   */
  clearTokens() {
    this.accessToken = null;
    this.refreshToken = null;
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
  }

  /**
   * Get authorization header
   */
  private getAuthHeader(): Record<string, string> {
    if (this.accessToken) {
      return {
        Authorization: `Bearer ${this.accessToken}`,
      };
    }
    return {};
  }

  /**
   * Refresh access token
   */
  private async refreshAccessToken(): Promise<boolean> {
    if (!this.refreshToken) {
      return false;
    }

    try {
      const response = await fetch(`${API_BASE_URL}/users/auth/refresh/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          refresh: this.refreshToken,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        this.accessToken = data.access;
        localStorage.setItem('access_token', data.access);
        return true;
      }

      // Refresh token is invalid, clear all tokens
      this.clearTokens();
      return false;
    } catch (error) {
      console.error('Token refresh failed:', error);
      return false;
    }
  }

  /**
   * Make API request with automatic token refresh
   */
  private async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const url = `${API_BASE_URL}${endpoint}`;

    const defaultHeaders = {
      'Content-Type': 'application/json',
      ...this.getAuthHeader(),
    };

    const config: RequestInit = {
      ...options,
      headers: {
        ...defaultHeaders,
        ...options.headers,
      },
    };

    try {
      let response = await fetch(url, config);

      // If unauthorized, try to refresh token
      if (response.status === 401 && this.refreshToken) {
        const refreshed = await this.refreshAccessToken();
        if (refreshed) {
          // Retry request with new token
          config.headers = {
            ...defaultHeaders,
            ...this.getAuthHeader(),
            ...options.headers,
          };
          response = await fetch(url, config);
        } else {
          // Refresh failed, redirect to login
          window.location.href = '/login';
          throw new Error('Authentication required');
        }
      }

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.detail || errorData.error || `HTTP ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error(`API request failed [${endpoint}]:`, error);
      throw error;
    }
  }

  // ===================================
  // Generic HTTP Methods
  // ===================================

  async get<T>(endpoint: string, params?: Record<string, any>): Promise<T> {
    const url = params ? `${endpoint}?${new URLSearchParams(params).toString()}` : endpoint;
    return this.request<T>(url, { method: 'GET' });
  }

  async post<T>(endpoint: string, data?: any): Promise<T> {
    return this.request<T>(endpoint, {
      method: 'POST',
      body: data ? JSON.stringify(data) : undefined,
    });
  }

  async patch<T>(endpoint: string, data?: any): Promise<T> {
    return this.request<T>(endpoint, {
      method: 'PATCH',
      body: data ? JSON.stringify(data) : undefined,
    });
  }

  async put<T>(endpoint: string, data?: any): Promise<T> {
    return this.request<T>(endpoint, {
      method: 'PUT',
      body: data ? JSON.stringify(data) : undefined,
    });
  }

  async delete<T>(endpoint: string): Promise<T> {
    return this.request<T>(endpoint, { method: 'DELETE' });
  }

  // ===================================
  // Authentication APIs
  // ===================================

  async login(username: string, password: string) {
    const data = await this.request<{
      access: string;
      refresh: string;
      user: any;
    }>('/users/auth/login/', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    });

    this.setTokens(data.access, data.refresh);
    return data;
  }

  async logout() {
    this.clearTokens();
  }

  async getCurrentUser() {
    return this.request<any>('/users/auth/me/');
  }

  // ===================================
  // Approval APIs
  // ===================================

  async getPendingApprovals() {
    return this.request<{
      count: number;
      approvals: Approval[];
    }>('/automations/approvals/pending/');
  }

  async approveItem(approvalId: number, comment?: string) {
    return this.request<{
      success: boolean;
      message: string;
      approval: Approval;
    }>(`/automations/approvals/${approvalId}/approve/`, {
      method: 'POST',
      body: JSON.stringify({ comment }),
    });
  }

  async rejectItem(approvalId: number, reason: string) {
    return this.request<{
      success: boolean;
      message: string;
      approval: Approval;
    }>(`/automations/approvals/${approvalId}/reject/`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    });
  }

  async bulkApprove(approvalIds: number[], comment?: string) {
    return this.request<{
      success: boolean;
      approved_count: number;
      total_requested: number;
      results: any[];
    }>('/automations/approvals/bulk-approve/', {
      method: 'POST',
      body: JSON.stringify({ approval_ids: approvalIds, comment }),
    });
  }

  async bulkReject(approvalIds: number[], reason: string) {
    return this.request<{
      success: boolean;
      rejected_count: number;
      total_requested: number;
      results: any[];
    }>('/automations/approvals/bulk-reject/', {
      method: 'POST',
      body: JSON.stringify({ approval_ids: approvalIds, reason }),
    });
  }

  // ===================================
  // Approval Delegation APIs
  // ===================================

  async getMyDelegations() {
    return this.request<{
      delegations_given: ApprovalDelegation[];
      delegations_received: ApprovalDelegation[];
    }>('/automations/delegations/my-active/');
  }

  async createDelegation(data: CreateDelegationData) {
    return this.request<{
      success: boolean;
      delegation: ApprovalDelegation;
    }>('/automations/delegations/', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateDelegation(delegationId: number, data: Partial<CreateDelegationData>) {
    return this.request<{
      success: boolean;
      delegation: ApprovalDelegation;
    }>(`/automations/delegations/${delegationId}/`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  async deleteDelegation(delegationId: number) {
    return this.request<{
      success: boolean;
    }>(`/automations/delegations/${delegationId}/`, {
      method: 'DELETE',
    });
  }

  // ===================================
  // Purchase Requisition APIs
  // ===================================

  async createPR(data: CreatePRData) {
    return this.request<{
      success: boolean;
      pr: any;
      reference: string;
      workflow_run: any;
    }>('/procurement/requisitions/create_with_workflow/', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  // ===================================
  // Reference Tracking APIs
  // ===================================

  async traceReference(referenceNumber: string) {
    return this.request<{
      reference: any;
      chain: any[];
      related: any[];
    }>(`/common/references/trace/${referenceNumber}/`);
  }

  async searchReferences(params: SearchParams = {}) {
    const queryString = new URLSearchParams(params as any).toString();
    return this.request<{
      count: number;
      results: any[];
    }>(`/common/references/search/?${queryString}`);
  }

  // ===================================
  // Analytics APIs
  // ===================================

  async getLoanRepaymentTrend(months = 6) {
    return this.request<{ success: boolean; data: LoanRepaymentTrendPoint[] }>(
      `/analytics/loan-repayment-trend/?months=${months}`
    );
  }

  async getClientGrowth(months = 6) {
    return this.request<{ success: boolean; data: ClientGrowthPoint[] }>(
      `/analytics/client-growth/?months=${months}`
    );
  }

  async getStaffAttendanceSummary(date?: string) {
    const qs = date ? `?date=${date}` : '';
    return this.request<{ success: boolean; data: StaffAttendanceSummaryData }>(
      `/analytics/staff-attendance/${qs}`
    );
  }
}

// ===================================
// Type Definitions
// ===================================

export interface Approval {
  id: number;
  workflow_run: {
    id: number;
    run_reference: string;
    template: {
      name: string;
      description: string;
    };
    context: any;
  };
  step_id: string;
  approver: {
    id: number;
    username: string;
    first_name: string;
    last_name: string;
  };
  status: 'pending' | 'approved' | 'rejected' | 'timeout';
  approval_message: string;
  context_data: any;
  approved_by?: any;
  approved_at?: string;
  rejection_reason?: string;
  timeout_at?: string;
  escalation_level: number;
  escalated_from?: {
    id: number;
    username: string;
    first_name: string;
    last_name: string;
  };
  escalated_at?: string;
  created_at: string;
  updated_at: string;
}

export interface ApprovalDelegation {
  id: number;
  delegator: number;
  delegator_name: string;
  delegator_username: string;
  delegate: number;
  delegate_name: string;
  delegate_username: string;
  start_date: string;
  end_date: string;
  is_active: boolean;
  is_currently_active: boolean;
  reason: string;
  workflow_types: string[];
  approval_limit?: number;
  created_at: string;
  updated_at: string;
}

export interface CreateDelegationData {
  delegate: number;
  start_date: string;
  end_date: string;
  reason: string;
  workflow_types?: string[];
  approval_limit?: number;
  is_active?: boolean;
}

export interface CreatePRData {
  department: string;
  purpose: string;
  items: Array<{
    description: string;
    quantity: number;
    estimated_unit_price: number;
    notes?: string;
  }>;
  priority?: 'low' | 'normal' | 'high' | 'urgent';
  required_by_date?: string;
}

export interface SearchParams {
  module?: string;
  status?: string;
  start_date?: string;
  end_date?: string;
  search?: string;
}

export interface LoanRepaymentTrendPoint {
  month: string;   // "2026-01"
  label: string;   // "Jan 2026"
  disbursed: number;
  repaid: number;
}

export interface ClientGrowthPoint {
  month: string;
  label: string;
  new_clients: number;
}

export interface StaffAttendanceSummaryData {
  date: string;
  total_staff: number;
  present: number;
  absent: number;
  late: number;
  on_leave: number;
  attendance_rate: number;
}

// Export singleton instance
export const apiClient = new APIClient();
export default apiClient;
