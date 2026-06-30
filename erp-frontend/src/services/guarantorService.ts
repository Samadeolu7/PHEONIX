import { api } from './api';

const BASE = '/clients/guarantors';

export interface GuarantorProfile {
  id: number;
  first_name: string;
  middle_name: string;
  last_name: string;
  full_name: string;
  phone: string;
  email: string | null;
  gender: string;
  date_of_birth: string | null;
  occupation: string;
  address: string;
  nin: string;
  image: string | null;
  owner: number;
  branch: number;
  created_at: string;
  updated_at: string;
}

export interface CreateGuarantorPayload {
  first_name: string;
  last_name: string;
  middle_name?: string;
  phone?: string;
  email?: string;
  gender?: string;
  date_of_birth?: string;
  occupation?: string;
  address?: string;
  nin?: string;
}

export const guarantorService = {
  async createGuarantor(data: CreateGuarantorPayload): Promise<GuarantorProfile> {
    return api.post(BASE + '/', data);
  },

  async getGuarantors(params?: { search?: string }): Promise<GuarantorProfile[]> {
    const res = await api.get(BASE + '/', { params });
    return Array.isArray(res) ? res : (res?.results ?? []);
  },

  async getGuarantor(id: number): Promise<GuarantorProfile> {
    return api.get(`${BASE}/${id}/`);
  },

  async updateGuarantor(id: number, data: Partial<CreateGuarantorPayload>): Promise<GuarantorProfile> {
    return api.patch(`${BASE}/${id}/`, data);
  },

  async deleteGuarantor(id: number): Promise<void> {
    return api.delete(`${BASE}/${id}/`);
  },
};
