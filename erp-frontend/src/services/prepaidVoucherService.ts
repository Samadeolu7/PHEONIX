// Prepaid Voucher Service (Updated to match actual API)
import { api } from './api';
import {
  PrepaidVoucher,
  VoucherListResponse,
  VoucherFilters,
  CreateVoucherData,
  VoucherBalance,
  VoucherConsumption,
  CancelVoucherData,
} from '../types/vouchers';

class PrepaidVoucherService {
  // CRUD Operations
  async getVouchers(params?: VoucherFilters): Promise<VoucherListResponse> {
    const response = await api.get('/expenses/vouchers/', { params });
    return response;
  }

  async getVoucher(id: number): Promise<PrepaidVoucher> {
    const response = await api.get(`/expenses/vouchers/${id}/`);
    return response;
  }

  async createVoucher(data: CreateVoucherData): Promise<PrepaidVoucher> {
    const response = await api.post('/expenses/vouchers/', data);
    return response;
  }

  async updateVoucher(id: number, data: Partial<CreateVoucherData>): Promise<PrepaidVoucher> {
    const response = await api.patch(`/expenses/vouchers/${id}/`, data);
    return response;
  }

  async deleteVoucher(id: number): Promise<void> {
    await api.delete(`/expenses/vouchers/${id}/`);
  }

  // Status Management
  async cancelVoucher(id: number, reason: string): Promise<PrepaidVoucher> {
    const response = await api.post(`/expenses/vouchers/${id}/cancel/`, {
      reason,
    });
    return response;
  }

  // New Endpoints
  async getExpiringVouchers(days: number = 7): Promise<PrepaidVoucher[]> {
    const response = await api.get(`/expenses/vouchers/expiring_soon/?days=${days}`);
    return Array.isArray(response) ? response : response.results || [];
  }

  async getVoucherConsumptions(id: number): Promise<VoucherConsumption[]> {
    const response = await api.get(`/expenses/vouchers/${id}/consumptions/`);
    return Array.isArray(response) ? response : response.results || [];
  }

  // Utility Methods
  async getActiveVouchers(prepaidExpenseId?: number): Promise<PrepaidVoucher[]> {
    try {
      const params: any = {
        status: 'available', // matches active + partially_used
      };

      if (prepaidExpenseId) params.prepaid_expense = prepaidExpenseId;

      const response = await this.getVouchers(params);
      return response.results;
    } catch (error) {
      console.warn('Failed to fetch active vouchers:', error);
      return [];
    }
  }

  async getVouchersByExpense(prepaidExpenseId: number): Promise<PrepaidVoucher[]> {
    try {
      const response = await this.getVouchers({
        prepaid_expense: prepaidExpenseId,
        status: 'available',
      });
      return response.results;
    } catch (error) {
      console.warn('Failed to fetch vouchers by expense:', error);
      return [];
    }
  }

  async getVouchersByBeneficiary(
    beneficiaryType: string,
    beneficiaryReference?: string
  ): Promise<PrepaidVoucher[]> {
    try {
      const params: any = {
        beneficiary_type: beneficiaryType,
        status: 'available',
      };

      if (beneficiaryReference) {
        params.search = beneficiaryReference; // Assuming search covers beneficiary_reference
      }

      const response = await this.getVouchers(params);
      return response.results;
    } catch (error) {
      console.warn('Failed to fetch vouchers by beneficiary:', error);
      return [];
    }
  }
}

export const prepaidVoucherService = new PrepaidVoucherService();
