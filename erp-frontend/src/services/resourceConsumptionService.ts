// Resource Consumption Service
import { api } from './api';
import { toDecimal } from '../utils/decimal';
import {
  ResourceConsumption,
  ConsumptionListResponse,
  ConsumptionFilters,
  CreatePrepaidConsumption,
  CreatePostpaidConsumption,
  BulkPostResponse,
  IrregularityResponse,
  AssetSummaryResponse,
  WorkflowResponse,
  PostingResponse,
} from '../types/consumption';

class ResourceConsumptionService {
  // CRUD Operations
  async getConsumptions(params?: ConsumptionFilters): Promise<ConsumptionListResponse> {
    const response = await api.get('/expenses/resource-consumptions/', { params });
    return response;
  }

  async getConsumption(id: number): Promise<ResourceConsumption> {
    const response = await api.get(`/expenses/resource-consumptions/${id}/`);
    return response;
  }

  async createConsumption(
    data: CreatePrepaidConsumption | CreatePostpaidConsumption
  ): Promise<ResourceConsumption> {
    const response = await api.post('/expenses/resource-consumptions/', data);
    return response;
  }

  async updateConsumption(
    id: number,
    data: Partial<CreatePrepaidConsumption | CreatePostpaidConsumption>
  ): Promise<ResourceConsumption> {
    const response = await api.patch(`/expenses/resource-consumptions/${id}/`, data);
    return response;
  }

  async deleteConsumption(id: number): Promise<void> {
    await api.delete(`/expenses/resource-consumptions/${id}/`);
  }

  // Workflow Actions
  async submitForApproval(id: number): Promise<WorkflowResponse> {
    const response = await api.post(
      `/expenses/resource-consumptions/${id}/submit_for_approval/`,
      {}
    );
    return response;
  }

  async approveConsumption(id: number, notes?: string): Promise<WorkflowResponse> {
    const response = await api.post(`/expenses/resource-consumptions/${id}/approve_consumption/`, {
      notes: notes || '',
    });
    return response;
  }

  async rejectConsumption(id: number, reason: string): Promise<WorkflowResponse> {
    const response = await api.post(`/expenses/resource-consumptions/${id}/reject_consumption/`, {
      reason,
    });
    return response;
  }

  // Posting Actions
  async postConsumption(id: number, explanation?: string): Promise<PostingResponse> {
    const response = await api.post(`/expenses/resource-consumptions/${id}/post_consumption/`, {
      explanation: explanation || '',
    });
    return response;
  }

  async bulkPost(consumptionIds: number[], forcePost: boolean = false): Promise<BulkPostResponse> {
    const response = await api.post('/expenses/resource-consumptions/bulk_post/', {
      consumption_ids: consumptionIds,
      force_post: forcePost,
    });
    return response;
  }

  // Query Actions
  async getIrregularities(): Promise<IrregularityResponse> {
    const response = await api.get('/expenses/resource-consumptions/irregularities/');
    return response;
  }

  async getAssetSummary(assetId: number, days: number = 30): Promise<AssetSummaryResponse> {
    const response = await api.get('/expenses/resource-consumptions/asset_summary/', {
      params: { asset_id: assetId, days },
    });
    return response;
  }

  // Utility Methods
  async validateVoucherBalance(
    voucherId: number,
    quantity: string
  ): Promise<{ valid: boolean; message?: string }> {
    // Validate client-side: fetch the voucher and compare remaining units.
    // The backend does not have a dedicated validate_balance action; the serializer
    // enforces the balance constraint on create. This method is a pre-flight UI check.
    try {
      const response = await api.get(`/expenses/vouchers/${voucherId}/`);
      const voucher = response;
      const remaining = toDecimal(voucher.remaining_units ?? '0');
      const requested = toDecimal(quantity);
      if (requested.greaterThan(remaining)) {
        return {
          valid: false,
          message: `Requested ${requested.toFixed(2)} exceeds available balance of ${remaining.toFixed(2)} ${voucher.unit_of_measure ?? 'units'}`,
        };
      }
      return { valid: true };
    } catch (error: any) {
      return {
        valid: false,
        message: error.response?.data?.detail || 'Could not verify voucher balance',
      };
    }
  }

  async getConsumptionHistory(
    assetId?: number,
    employeeId?: number,
    days: number = 30
  ): Promise<ResourceConsumption[]> {
    // Uses the standard list endpoint with filters — there is no dedicated /history/ action.
    const params: any = { days };
    if (assetId) params.asset = assetId;
    if (employeeId) params.employee = employeeId;
    const response = await api.get('/expenses/resource-consumptions/', { params });
    return response.results || [];
  }
}

export const resourceConsumptionService = new ResourceConsumptionService();
