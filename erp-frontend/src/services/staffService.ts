import { api } from './api';

export interface Staff {
  id: number;
  staff_id?: string;
  employee_id: string;
  first_name: string;
  last_name: string;
  full_name: string;
  email: string;
  phone: string;
  department: string;
  department_name?: string;
  position: string;
  hire_date: string;
  is_active: boolean;
}

export interface StaffListResponse {
  count: number;
  next: string | null;
  previous: string | null;
  results: Staff[];
}

export const staffService = {
  async getStaff(params?: {
    page?: number;
    page_size?: number;
    search?: string;
    department?: string;
    is_active?: boolean;
  }): Promise<StaffListResponse> {
    return api.get('/hr/staff/', { params });
  },

  async getStaffMember(id: number | string): Promise<Staff> {
    return api.get(`/hr/staff/${id}/`);
  },

  async getAllStaff(params?: {
    search?: string;
    department?: string;
    is_active?: boolean;
    page_size?: number;
  }): Promise<Staff[]> {
    const all: Staff[] = [];
    let page = 1;
    let hasMore = true;

    while (hasMore) {
      const response = await api.get('/hr/staff/', {
        params: { ...params, page, page_size: params?.page_size ?? 500 },
      });
      all.push(...(response.results || []));
      hasMore = !!response.next;
      page += 1;
    }

    return all;
  },
};
