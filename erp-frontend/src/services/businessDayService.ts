// src/services/businessDayService.ts
/**
 * Business Day Service
 * Feature #3 — Business Day Management & Back-date Requests
 * Endpoints: /api/common/business-days/ and /api/common/backdate-requests/
 */
import { api } from './api';

export type BusinessDayStatus = 'open' | 'closed';
export type BackdateRequestStatus = 'pending' | 'approved' | 'rejected';

export interface BusinessDay {
  id: number;
  branch: number;
  business_date: string;
  status: BusinessDayStatus;
  closed_by: number | null;
  closed_at: string | null;
  override_by: number | null;
  override_by_name: string | null;
  override_reason: string;
  closed_by_name: string | null;
  created_at: string;
  updated_at: string;
}

export interface BackdateRequest {
  id: number;
  branch: number;
  requested_by: number;
  requested_by_name: string | null;
  target_date: string;
  reason: string;
  status: BackdateRequestStatus;
  reviewed_by: number | null;
  reviewed_by_name: string | null;
  reviewed_at: string | null;
  rejection_reason: string;
  created_at: string;
  updated_at: string;
}

export interface CreateBackdateRequestData {
  target_date: string;
  reason: string;
}

const BASE_BD = '/common/business-days';
const BASE_BR = '/common/backdate-requests';

export const businessDayService = {

  // ===== BUSINESS DAYS =====

  async listBusinessDays(): Promise<BusinessDay[]> {
    const res = await api.get(`${BASE_BD}/`);
    return Array.isArray(res) ? res : (res?.results ?? []);
  },

  async getBusinessDay(id: number): Promise<BusinessDay> {
    return api.get(`${BASE_BD}/${id}/`);
  },

  async closeDay(): Promise<BusinessDay> {
    return api.post(`${BASE_BD}/close-day/`);
  },

  async reopenDay(id: number, reason: string): Promise<BusinessDay> {
    return api.post(`${BASE_BD}/${id}/reopen/`, { reason });
  },

  // ===== BACKDATE REQUESTS =====

  async listBackdateRequests(params?: { status?: BackdateRequestStatus }): Promise<BackdateRequest[]> {
    const res = await api.get(`${BASE_BR}/`, { params });
    return Array.isArray(res) ? res : (res?.results ?? []);
  },

  async createBackdateRequest(data: CreateBackdateRequestData): Promise<BackdateRequest> {
    return api.post(`${BASE_BR}/`, data);
  },

  async approveBackdateRequest(id: number): Promise<BackdateRequest> {
    return api.post(`${BASE_BR}/${id}/approve/`);
  },

  async rejectBackdateRequest(id: number, reason: string): Promise<BackdateRequest> {
    return api.post(`${BASE_BR}/${id}/reject/`, { reason });
  },
};

export default businessDayService;
