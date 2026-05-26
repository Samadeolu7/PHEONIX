/**
 * Fixed Asset Management API Service
 * Handles all asset-related API calls
 *
 * Uses the canonical services/api.ts client which handles:
 *   - Authorization header injection
 *   - Automatic 401 → token refresh → retry
 *   - Consistent error handling
 */

import { api } from './api';
import type {
  AssetCategory,
  FixedAsset,
  AssetDepreciation,
  AssetMaintenance,
  ResourceConsumption,
  CreateAssetCategoryRequest,
  CreateFixedAssetRequest,
  UpdateAssetLocationRequest,
  DisposeAssetRequest,
  CreateAssetDepreciationRequest,
  CreateAssetMaintenanceRequest,
  CreateResourceConsumptionRequest,
  AssetFilters,
  DepreciationFilters,
  MaintenanceFilters,
  ConsumptionFilters,
  AssetStatistics,
  ConsumptionEfficiency,
  ConsumptionTotals,
  AssetApiResponse,
  VehicleFleetSummaryResponse,
  AssetConsumptionHistoryResponse,
  StaffFuelSummaryResponse,
  BatchDepreciationRequest,
  BatchDepreciationResponse,
  AssetAcquisition,
  CreateAssetAcquisitionRequest,
  AssetRequisition,
  CreateAssetRequisitionRequest,
  AssetTransfer,
  AssetAssignment,
} from '../types/assets';

// ============ ASSET CATEGORIES ============

export const assetCategoryService = {
  async getAll(filters?: { search?: string }): Promise<AssetCategory[]> {
    const params = new URLSearchParams();
    if (filters?.search) params.append('search', filters.search);

    const data = await api.get(`/assets/categories/?${params.toString()}`);
    return data.results;
  },

  async getById(id: number): Promise<AssetCategory> {
    return await api.get(`/assets/categories/${id}/`);
  },

  async create(data: CreateAssetCategoryRequest): Promise<AssetCategory> {
    return await api.post(`/assets/categories/`, data);
  },

  async update(id: number, data: Partial<CreateAssetCategoryRequest>): Promise<AssetCategory> {
    return await api.patch(`/assets/categories/${id}/`, data);
  },

  async delete(id: number): Promise<void> {
    await api.delete(`/assets/categories/${id}/`);
  },
};

// ============ FIXED ASSETS ============

export const fixedAssetService = {
  async getAll(filters?: AssetFilters): Promise<AssetApiResponse<FixedAsset>> {
    const params = new URLSearchParams();
    if (filters?.category) params.append('category', filters.category.toString());
    if (filters?.status) params.append('status', filters.status);
    if (filters?.search) params.append('search', filters.search);
    if (filters?.is_deleted !== undefined)
      params.append('is_deleted', filters.is_deleted.toString());
    if (filters?.ordering) params.append('ordering', filters.ordering);
    if (filters?.page) params.append('page', filters.page.toString());
    if (filters?.page_size) params.append('page_size', filters.page_size.toString());

    return await api.get(`/assets/assets/?${params.toString()}`);
  },

  async getAllPages(filters?: AssetFilters): Promise<AssetApiResponse<FixedAsset>> {
    const pageSize = filters?.page_size && filters.page_size > 0 ? filters.page_size : 100;
    const baseFilters = { ...filters, page_size: pageSize };

    let page = 1;
    let count = 0;
    const allResults: FixedAsset[] = [];

    while (true) {
      const response = await this.getAll({ ...baseFilters, page });
      count = response.count;
      allResults.push(...response.results);

      if (!response.next || response.results.length === 0 || allResults.length >= count) {
        break;
      }

      page += 1;
    }

    return {
      count,
      next: null,
      previous: null,
      results: allResults,
    };
  },

  async getById(id: number): Promise<FixedAsset> {
    return await api.get(`/assets/assets/${id}/`);
  },

  async create(data: CreateFixedAssetRequest): Promise<FixedAsset> {
    const formData = new FormData();

    // Add all fields to FormData
    Object.entries(data).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        if (key === 'photo' && value instanceof File) {
          formData.append(key, value);
        } else if (key === 'metadata') {
          formData.append(key, JSON.stringify(value));
        } else {
          formData.append(key, value.toString());
        }
      }
    });

    return await api.postFormData(`/assets/assets/`, formData);
  },

  async update(id: number, data: Partial<CreateFixedAssetRequest>): Promise<FixedAsset> {
    const formData = new FormData();

    Object.entries(data).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        if (key === 'photo' && value instanceof File) {
          formData.append(key, value);
        } else if (key === 'metadata') {
          formData.append(key, JSON.stringify(value));
        } else {
          formData.append(key, value.toString());
        }
      }
    });

    return await api.patchFormData(`/assets/assets/${id}/`, formData);
  },

  async updateLocation(id: number, data: UpdateAssetLocationRequest): Promise<FixedAsset> {
    return await api.patch(`/assets/assets/${id}/`, data);
  },

  async dispose(id: number, data: DisposeAssetRequest): Promise<FixedAsset> {
    return await api.post(`/assets/assets/${id}/dispose/`, data);
  },

  async delete(id: number): Promise<void> {
    await api.delete(`/assets/assets/${id}/`);
  },

  async getStatistics(): Promise<AssetStatistics> {
    return await api.get(`/assets/assets/statistics/`);
  },

  async getDepreciationSchedule(id: number): Promise<AssetDepreciation[]> {
    return await api.get(`/assets/assets/${id}/depreciation_schedule/`);
  },

  /** Preview projected depreciation schedule without persisting any entries. */
  async getDepreciationSchedulePreview(id: number): Promise<AssetDepreciation[]> {
    return await api.get(`/assets/assets/${id}/depreciation_schedule_preview/`);
  },

  /**
   * Generate a single depreciation entry for the asset for the current period.
   * Useful for mid-period activations or one-off corrections.
   */
  async generateDepreciation(
    id: number,
    params: { period_date?: string; post?: boolean } = {}
  ): Promise<import('../types/assets').AssetDepreciation> {
    return await api.post(`/assets/assets/${id}/generate_depreciation/`, params);
  },

  async getMaintenanceHistory(id: number): Promise<AssetMaintenance[]> {
    return await api.get(`/assets/assets/${id}/maintenance_history/`);
  },

  /**
   * Get fleet summary: all assets with efficiency metrics and anomaly flags.
   * Used for the Fleet / Energy Monitor dashboard.
   */
  async getFleetSummary(params?: {
    days?: number;
    category?: number;
    status?: string;
    resource_type?: string;
  }): Promise<VehicleFleetSummaryResponse> {
    const qp = new URLSearchParams();
    if (params?.days) qp.append('days', params.days.toString());
    if (params?.category) qp.append('category', params.category.toString());
    if (params?.status) qp.append('status', params.status);
    if (params?.resource_type) qp.append('resource_type', params.resource_type);

    return await api.get(`/assets/assets/fleet_summary/?${qp.toString()}`);
  },

  /**
   * Get full consumption history for a single asset with efficiency trends.
   */
  async getConsumptionHistory(
    id: number,
    params?: { days?: number; resource_type?: string }
  ): Promise<AssetConsumptionHistoryResponse> {
    const qp = new URLSearchParams();
    if (params?.days) qp.append('days', params.days.toString());
    if (params?.resource_type) qp.append('resource_type', params.resource_type);

    return await api.get(`/assets/assets/${id}/consumption_history/?${qp.toString()}`);
  },

  /**
   * Run depreciation for all active assets in a single request.
   * POST /api/assets/assets/run_depreciation_batch/
   */
  async generateDepreciationBatch(
    params: BatchDepreciationRequest = {}
  ): Promise<BatchDepreciationResponse> {
    return await api.post(`/assets/assets/run_depreciation_batch/`, params);
  },

  /** Initiate an asset transfer to a new staff member / location. */
  async transfer(
    id: number,
    data: {
      to_staff?: number;
      to_location?: string;
      reason?: string;
      notes?: string;
      transfer_date?: string;
    }
  ): Promise<AssetTransfer> {
    return await api.post(`/assets/assets/${id}/transfer/`, data);
  },

  /** Acknowledge the latest pending transfer for an asset. */
  async acknowledgeTransfer(id: number, transferId?: number): Promise<AssetTransfer> {
    const body: Record<string, unknown> = {};
    if (transferId) body.transfer_id = transferId;
    return await api.post(`/assets/assets/${id}/acknowledge_transfer/`, body);
  },

  /** Get all transfers for an asset (full history). */
  async getTransfers(id: number): Promise<{ results: AssetTransfer[]; count: number }> {
    return await api.get(`/assets/assets/${id}/transfers/`);
  },

  /** Get the full custody / assignment history for an asset. */
  async getAssignmentHistory(id: number): Promise<{ results: AssetAssignment[]; count: number }> {
    return await api.get(`/assets/assets/${id}/assignment_history/`);
  },
};

// ============ ASSET DEPRECIATION ============

export const assetDepreciationService = {
  async getAll(filters?: DepreciationFilters): Promise<AssetApiResponse<AssetDepreciation>> {
    const params = new URLSearchParams();
    if (filters?.asset) params.append('asset', filters.asset.toString());
    if (filters?.is_posted !== undefined) params.append('is_posted', filters.is_posted.toString());
    if (filters?.ordering) params.append('ordering', filters.ordering);

    return await api.get(`/assets/depreciation/?${params.toString()}`);
  },

  async getById(id: number): Promise<AssetDepreciation> {
    return await api.get(`/assets/depreciation/${id}/`);
  },

  async create(data: CreateAssetDepreciationRequest): Promise<AssetDepreciation> {
    return await api.post(`/assets/depreciation/`, data);
  },

  async post(id: number): Promise<AssetDepreciation> {
    return await api.post(`/assets/depreciation/${id}/post/`, {});
  },

  async delete(id: number): Promise<void> {
    await api.delete(`/assets/depreciation/${id}/`);
  },
};

// ============ ASSET MAINTENANCE ============

export const assetMaintenanceService = {
  async getAll(filters?: MaintenanceFilters): Promise<AssetApiResponse<AssetMaintenance>> {
    const params = new URLSearchParams();
    if (filters?.asset) params.append('asset', filters.asset.toString());
    if (filters?.maintenance_type) params.append('maintenance_type', filters.maintenance_type);
    if (filters?.is_posted !== undefined) params.append('is_posted', filters.is_posted.toString());
    if (filters?.ordering) params.append('ordering', filters.ordering);

    return await api.get(`/assets/maintenance/?${params.toString()}`);
  },

  async getById(id: number): Promise<AssetMaintenance> {
    return await api.get(`/assets/maintenance/${id}/`);
  },

  async create(data: CreateAssetMaintenanceRequest): Promise<AssetMaintenance> {
    return await api.post(`/assets/maintenance/`, data);
  },

  async update(
    id: number,
    data: Partial<CreateAssetMaintenanceRequest>
  ): Promise<AssetMaintenance> {
    return await api.patch(`/assets/maintenance/${id}/`, data);
  },

  async post(id: number): Promise<AssetMaintenance> {
    return await api.post(`/assets/maintenance/${id}/post/`, {});
  },

  async delete(id: number): Promise<void> {
    await api.delete(`/assets/maintenance/${id}/`);
  },
};

// Note: Resource Consumption endpoints would be in inventory/resource service
// Since they're part of inventory management, not assets directly

// ============ FLEET / STAFF FUEL (expenses module) ============

export const staffFuelService = {
  /**
   * Get staff fuel consumption summary.
   * Tracks fuel directly given to employees (not to vehicles).
   * Accounting: prepaid → Dr Fuel Expense / Cr Prepaid Asset
   *             postpaid → Dr Staff Fuel Expense / Cr Accounts Payable
   */
  async getSummary(params?: {
    days?: number;
    resource_type?: string;
  }): Promise<StaffFuelSummaryResponse> {
    const qp = new URLSearchParams();
    if (params?.days) qp.append('days', params.days.toString());
    if (params?.resource_type) qp.append('resource_type', params.resource_type);

    return await api.get(`/expenses/resource-consumptions/staff_fuel_summary/?${qp.toString()}`);
  },
};

// ============ ASSET ACQUISITION (BULK PURCHASE) ============

export const assetAcquisitionService = {
  async getAll(filters?: {
    status?: string;
    supplier?: number;
    search?: string;
  }): Promise<AssetApiResponse<AssetAcquisition>> {
    const params = new URLSearchParams();
    if (filters?.status) params.append('status', filters.status);
    if (filters?.supplier) params.append('supplier', filters.supplier.toString());
    if (filters?.search) params.append('search', filters.search);
    return await api.get(`/assets/acquisitions/?${params.toString()}`);
  },

  async getById(id: number): Promise<AssetAcquisition> {
    return await api.get(`/assets/acquisitions/${id}/`);
  },

  async create(data: CreateAssetAcquisitionRequest): Promise<AssetAcquisition> {
    return await api.post(`/assets/acquisitions/`, data);
  },

  async update(
    id: number,
    data: Partial<CreateAssetAcquisitionRequest>
  ): Promise<AssetAcquisition> {
    return await api.patch(`/assets/acquisitions/${id}/`, data);
  },

  /** Post a draft acquisition — creates PO, AP, GL entry, and activates/creates FixedAsset records. */
  async postAcquisition(id: number): Promise<
    AssetAcquisition & {
      assets_activated: number;
      asset_ids: number[];
      depreciation_batch_id?: string;
    }
  > {
    return await api.post(`/assets/acquisitions/${id}/post_acquisition/`, {});
  },

  /** Submit a draft acquisition for approval. */
  async submit(id: number): Promise<AssetAcquisition> {
    return await api.post(`/assets/acquisitions/${id}/submit_acquisition/`, {});
  },

  /** Approve a submitted acquisition (finance approver role). */
  async approve(id: number): Promise<AssetAcquisition> {
    return await api.post(`/assets/acquisitions/${id}/approve_acquisition/`, {});
  },

  /** Reject a submitted acquisition back to draft. */
  async reject(id: number, reason: string): Promise<AssetAcquisition> {
    return await api.post(`/assets/acquisitions/${id}/reject_acquisition/`, { reason });
  },

  async delete(id: number): Promise<void> {
    await api.delete(`/assets/acquisitions/${id}/`);
  },
};

// ============ ASSET REQUISITION ============

export const assetRequisitionService = {
  async getAll(filters?: {
    status?: string;
    department?: string;
    search?: string;
  }): Promise<AssetApiResponse<AssetRequisition>> {
    const params = new URLSearchParams();
    if (filters?.status) params.append('status', filters.status);
    if (filters?.department) params.append('department', filters.department);
    if (filters?.search) params.append('search', filters.search);
    return await api.get(`/assets/requisitions/?${params.toString()}`);
  },

  async getById(id: number): Promise<AssetRequisition> {
    return await api.get(`/assets/requisitions/${id}/`);
  },

  async create(data: CreateAssetRequisitionRequest): Promise<AssetRequisition> {
    return await api.post(`/assets/requisitions/`, data);
  },

  async update(
    id: number,
    data: Partial<CreateAssetRequisitionRequest>
  ): Promise<AssetRequisition> {
    return await api.patch(`/assets/requisitions/${id}/`, data);
  },

  /** Submit a draft requisition for approval. */
  async submit(id: number): Promise<AssetRequisition> {
    return await api.post(`/assets/requisitions/${id}/submit/`, {});
  },

  /** Approve a submitted requisition (approver role required). */
  async approve(id: number): Promise<AssetRequisition> {
    return await api.post(`/assets/requisitions/${id}/approve/`, {});
  },

  /** Reject a submitted requisition (approver role required). */
  async reject(id: number, reason: string): Promise<AssetRequisition> {
    return await api.post(`/assets/requisitions/${id}/reject/`, { reason });
  },

  /** Convert an approved requisition to an AssetAcquisition draft. */
  async convert(id: number): Promise<{
    success: boolean;
    acquisition_id: number;
    acquisition_reference: string;
    message: string;
  }> {
    return await api.post(`/assets/requisitions/${id}/convert/`, {});
  },

  /**
   * Directly activate all draft assets on an approved requisition.
   * Posts GL entries and creates AP records per supplier.
   * Returns the list of activated asset IDs and the shared depreciation_batch_id.
   */
  async activate(
    id: number,
    data?: import('../types/assets').ActivateAssetRequisitionRequest
  ): Promise<{ assets_activated: number; asset_ids: number[]; depreciation_batch_id: string }> {
    return await api.post(`/assets/requisitions/${id}/activate/`, data ?? {});
  },

  async delete(id: number): Promise<void> {
    await api.delete(`/assets/requisitions/${id}/`);
  },
};
