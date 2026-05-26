import {
  SalaryComponent,
  SalaryComponentsResponse,
  CreateSalaryComponentRequest,
  UpdateSalaryComponentRequest,
  StaffPayInfo,
  StaffPayInfoResponse,
  CreateStaffPayInfoRequest,
  StaffWithPayInfo,
  PayComponentRemovalRequest,
  PayComponentRemovalListResponse,
  CreatePayComponentRemovalRequest,
} from '../types/salaryComponent';
import { api } from './api';

export const salaryComponentService = {
  // Salary Components CRUD
  async getSalaryComponents(params?: {
    component_type?: 'EARNING' | 'DEDUCTION';
    page?: number;
    page_size?: number;
  }): Promise<SalaryComponentsResponse> {
    const response = await api.get('/hr/salary-components/', { params });
    return response;
  },

  async getAllSalaryComponents(params?: {
    component_type?: 'EARNING' | 'DEDUCTION';
    page_size?: number;
  }): Promise<SalaryComponent[]> {
    const all: SalaryComponent[] = [];
    let page = 1;
    let hasMore = true;

    while (hasMore) {
      const response = await api.get('/hr/salary-components/', {
        params: { ...params, page, page_size: params?.page_size ?? 500 },
      });
      all.push(...(response.results || []));
      hasMore = !!response.next;
      page += 1;
    }

    return all;
  },

  async createSalaryComponent(data: CreateSalaryComponentRequest): Promise<SalaryComponent> {
    const response = await api.post('/hr/salary-components/', data);
    return response;
  },

  async getSalaryComponent(id: number): Promise<SalaryComponent> {
    const response = await api.get(`/hr/salary-components/${id}/`);
    return response;
  },

  async updateSalaryComponent(
    id: number,
    data: UpdateSalaryComponentRequest
  ): Promise<SalaryComponent> {
    const response = await api.patch(`/hr/salary-components/${id}/`, data);
    return response;
  },

  async deleteSalaryComponent(id: number): Promise<void> {
    await api.delete(`/hr/salary-components/${id}/`);
  },

  // Staff Pay Info Management
  async getStaffPayInfo(staffId: number | string): Promise<StaffPayInfoResponse> {
    const response = await api.get('/hr/staff-pay-info/', {
      params: { staff: staffId },
    });

    // Return the raw response - let the component handle the transformation
    // using the salary components data it already has
    return response;
  },

  async assignComponentToStaff(data: CreateStaffPayInfoRequest): Promise<StaffPayInfo> {
    const response = await api.post('/hr/staff-pay-info/', data);
    return response;
  },

  async updateStaffPayInfo(id: number, data: { amount: string }): Promise<StaffPayInfo> {
    const response = await api.patch(`/hr/staff-pay-info/${id}/`, data);
    return response;
  },

  async removeComponentFromStaff(id: number): Promise<void> {
    await api.delete(`/hr/staff-pay-info/${id}/`);
  },

  // Pay Component Removal Requests
  async getPayComponentRemovals(params?: {
    status?: string;
    staff?: number | string;
    page?: number;
  }): Promise<PayComponentRemovalListResponse> {
    const response = await api.get('/hr/pay-component-removals/', { params });
    return response;
  },

  async createPayComponentRemoval(
    data: CreatePayComponentRemovalRequest
  ): Promise<PayComponentRemovalRequest> {
    const response = await api.post('/hr/pay-component-removals/', data);
    return response;
  },

  async approvePayComponentRemoval(id: number): Promise<PayComponentRemovalRequest> {
    const response = await api.post(`/hr/pay-component-removals/${id}/approve/`);
    return response;
  },

  async rejectPayComponentRemoval(
    id: number,
    rejectionReason: string
  ): Promise<PayComponentRemovalRequest> {
    const response = await api.post(`/hr/pay-component-removals/${id}/reject/`, {
      rejection_reason: rejectionReason,
    });
    return response;
  },

  async getPayComponentRemovalPendingCount(): Promise<{ count: number }> {
    const response = await api.get('/hr/pay-component-removals/pending_count/');
    return response;
  },

  // Get staff with pay info (from staff endpoint)
  async getStaffWithPayInfo(staffId: number | string): Promise<StaffWithPayInfo> {
    const response = await api.get(`/hr/staff/${staffId}/`);
    return response;
  },
};
