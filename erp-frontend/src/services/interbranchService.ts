/**
 * Inter-Branch Transfer Service
 * Handles API calls for inter-branch transfers (interbranch.InterBranchTransferViewSet)
 */

import { api } from './api';
import type {
  InterBranchTransfer,
  CreateInterBranchTransferRequest,
  InterBranchTransferFilters,
} from '../types/interbranch';

const BASE_URL = '/interbranch';

export const interbranchService = {
  async listTransfers(filters?: InterBranchTransferFilters): Promise<InterBranchTransfer[]> {
    const res = await api.get(`${BASE_URL}/transfers/`, { params: filters });
    return Array.isArray(res) ? res : (res?.results ?? []);
  },

  async getTransfer(id: number): Promise<InterBranchTransfer> {
    return api.get(`${BASE_URL}/transfers/${id}/`);
  },

  async createTransfer(data: CreateInterBranchTransferRequest): Promise<InterBranchTransfer> {
    return api.post(`${BASE_URL}/transfers/`, data);
  },

  async reverseTransfer(id: number, reason: string): Promise<InterBranchTransfer> {
    return api.post(`${BASE_URL}/transfers/${id}/reverse/`, { reason });
  },
};
