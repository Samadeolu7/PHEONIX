import { LeaveBalance, LeaveBalancesResponse } from '../types/leaveBalance';
import { api } from './api';

export const leaveBalanceService = {
  async getLeaveBalances(params?: {
    staff?: number;
    year?: number;
    leave_type?: number;
    page?: number;
    page_size?: number;
  }): Promise<LeaveBalancesResponse> {
    const response = await api.get('/hr/leave-balances/', { params });
    return response;
  },

  async getLeaveBalance(id: number): Promise<LeaveBalance> {
    const response = await api.get(`/hr/leave-balances/${id}/`);
    return response;
  },

  async initializeLeaveBalancesForYear(data: {
    year: number;
    staff_ids?: number[];
  }): Promise<{ message: string; year: number }> {
    const response = await api.post('/hr/leave-balances/initialize_for_year/', data);
    return response;
  },
};
