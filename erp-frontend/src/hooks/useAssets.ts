/**
 * Fixed Asset Management React Query Hooks
 * Provides data fetching and mutation hooks with cache management
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';
import {
  assetCategoryService,
  fixedAssetService,
  assetDepreciationService,
  assetMaintenanceService,
  staffFuelService,
  assetAcquisitionService,
  assetRequisitionService,
} from '../services/assetsService';
import type {
  AssetCategory,
  FixedAsset,
  AssetDepreciation,
  AssetMaintenance,
  CreateAssetCategoryRequest,
  CreateFixedAssetRequest,
  UpdateAssetLocationRequest,
  DisposeAssetRequest,
  CreateAssetDepreciationRequest,
  CreateAssetMaintenanceRequest,
  AssetFilters,
  DepreciationFilters,
  MaintenanceFilters,
  VehicleFleetSummaryResponse,
  AssetConsumptionHistoryResponse,
  StaffFuelSummaryResponse,
  AssetAcquisition,
  CreateAssetAcquisitionRequest,
  AssetRequisition,
  CreateAssetRequisitionRequest,
  ActivateAssetRequisitionRequest,
  AssetTransfer,
  AssetAssignment,
  CreateAssetTransferRequest,
} from '../types/assets';

// ============ QUERY KEYS ============

export const assetKeys = {
  all: ['assets'] as const,
  categories: () => [...assetKeys.all, 'categories'] as const,
  category: (id: number) => [...assetKeys.categories(), id] as const,
  assets: (filters?: AssetFilters) => [...assetKeys.all, 'assets', filters] as const,
  asset: (id: number) => [...assetKeys.all, 'asset', id] as const,
  assetDepreciation: (id: number) => [...assetKeys.asset(id), 'depreciation'] as const,
  assetMaintenance: (id: number) => [...assetKeys.asset(id), 'maintenance'] as const,
  assetConsumptionHistory: (id: number, params?: object) =>
    [...assetKeys.asset(id), 'consumption-history', params] as const,
  depreciation: (filters?: DepreciationFilters) =>
    [...assetKeys.all, 'depreciation', filters] as const,
  depreciationEntry: (id: number) => [...assetKeys.all, 'depreciation', id] as const,
  maintenance: (filters?: MaintenanceFilters) =>
    [...assetKeys.all, 'maintenance', filters] as const,
  maintenanceEntry: (id: number) => [...assetKeys.all, 'maintenance', id] as const,
  statistics: () => [...assetKeys.all, 'statistics'] as const,
  fleetSummary: (params?: object) => [...assetKeys.all, 'fleet-summary', params] as const,
  staffFuelSummary: (params?: object) => [...assetKeys.all, 'staff-fuel-summary', params] as const,
  acquisitions: (filters?: object) => [...assetKeys.all, 'acquisitions', filters] as const,
  acquisition: (id: number) => [...assetKeys.all, 'acquisition', id] as const,
  requisitions: (filters?: object) => [...assetKeys.all, 'requisitions', filters] as const,
  requisition: (id: number) => [...assetKeys.all, 'requisition', id] as const,
  assetTransfers: (id: number) => [...assetKeys.asset(id), 'transfers'] as const,
  assetAssignments: (id: number) => [...assetKeys.asset(id), 'assignments'] as const,
};

// ============ ASSET CATEGORIES ============

export const useAssetCategories = (filters?: { search?: string }) => {
  return useQuery({
    queryKey: assetKeys.categories(),
    queryFn: () => assetCategoryService.getAll(filters),
  });
};

export const useAssetCategory = (id: number) => {
  return useQuery({
    queryKey: assetKeys.category(id),
    queryFn: () => assetCategoryService.getById(id),
    enabled: !!id,
  });
};

export const useCreateAssetCategory = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateAssetCategoryRequest) => assetCategoryService.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: assetKeys.categories() });
      toast.success('Asset category created successfully');
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || 'Failed to create asset category');
    },
  });
};

export const useUpdateAssetCategory = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<CreateAssetCategoryRequest> }) =>
      assetCategoryService.update(id, data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: assetKeys.categories() });
      queryClient.invalidateQueries({ queryKey: assetKeys.category(variables.id) });
      toast.success('Asset category updated successfully');
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || 'Failed to update asset category');
    },
  });
};

export const useDeleteAssetCategory = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: number) => assetCategoryService.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: assetKeys.categories() });
      toast.success('Asset category deleted successfully');
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || 'Failed to delete asset category');
    },
  });
};

// ============ FIXED ASSETS ============

export const useFixedAssets = (filters?: AssetFilters, options?: { fetchAll?: boolean }) => {
  return useQuery({
    queryKey: [...assetKeys.assets(filters), options?.fetchAll ?? false],
    queryFn: () =>
      options?.fetchAll
        ? fixedAssetService.getAllPages(filters)
        : fixedAssetService.getAll(filters),
  });
};

export const useFixedAsset = (id: number) => {
  return useQuery({
    queryKey: assetKeys.asset(id),
    queryFn: () => fixedAssetService.getById(id),
    enabled: !!id,
  });
};

export const useCreateFixedAsset = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateFixedAssetRequest) => fixedAssetService.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: assetKeys.all });
      queryClient.invalidateQueries({ queryKey: assetKeys.statistics() });
      toast.success('Fixed asset registered successfully');
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || 'Failed to register fixed asset');
    },
  });
};

export const useUpdateFixedAsset = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<CreateFixedAssetRequest> }) =>
      fixedAssetService.update(id, data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: assetKeys.all });
      queryClient.invalidateQueries({ queryKey: assetKeys.asset(variables.id) });
      queryClient.invalidateQueries({ queryKey: assetKeys.statistics() });
      toast.success('Fixed asset updated successfully');
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || 'Failed to update fixed asset');
    },
  });
};

export const useUpdateAssetLocation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: UpdateAssetLocationRequest }) =>
      fixedAssetService.updateLocation(id, data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: assetKeys.all });
      queryClient.invalidateQueries({ queryKey: assetKeys.asset(variables.id) });
      toast.success('Asset location updated successfully');
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || 'Failed to update asset location');
    },
  });
};

export const useDisposeAsset = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: DisposeAssetRequest }) =>
      fixedAssetService.dispose(id, data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: assetKeys.all });
      queryClient.invalidateQueries({ queryKey: assetKeys.asset(variables.id) });
      queryClient.invalidateQueries({ queryKey: assetKeys.statistics() });
      toast.success('Asset disposed successfully');
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || 'Failed to dispose asset');
    },
  });
};

export const useDeleteFixedAsset = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: number) => fixedAssetService.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: assetKeys.all });
      queryClient.invalidateQueries({ queryKey: assetKeys.statistics() });
      toast.success('Fixed asset deleted successfully');
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || 'Failed to delete fixed asset');
    },
  });
};

export const useAssetStatistics = () => {
  return useQuery({
    queryKey: assetKeys.statistics(),
    queryFn: () => fixedAssetService.getStatistics(),
  });
};

/** Run batch depreciation for all active assets in the current period. */
export const useRunDepreciationBatch = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (params: import('../types/assets').BatchDepreciationRequest) =>
      fixedAssetService.generateDepreciationBatch(params),
    onSuccess: () => {
      // Invalidate depreciation and asset caches since entries were created/posted
      queryClient.invalidateQueries({ queryKey: assetKeys.all });
    },
  });
};

export const useAssetDepreciationSchedule = (assetId: number) => {
  return useQuery({
    queryKey: assetKeys.assetDepreciation(assetId),
    queryFn: () => fixedAssetService.getDepreciationSchedule(assetId),
    enabled: !!assetId,
  });
};

export const useAssetDepreciationSchedulePreview = (assetId: number) => {
  return useQuery({
    queryKey: [...assetKeys.assetDepreciation(assetId), 'preview'],
    queryFn: () => fixedAssetService.getDepreciationSchedulePreview(assetId),
    enabled: !!assetId,
  });
};

export const useGenerateDepreciation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      params,
    }: {
      id: number;
      params?: { period_date?: string; post?: boolean };
    }) => fixedAssetService.generateDepreciation(id, params),
    onSuccess: data => {
      queryClient.invalidateQueries({ queryKey: assetKeys.depreciation() });
      queryClient.invalidateQueries({ queryKey: assetKeys.assetDepreciation(data.asset) });
      queryClient.invalidateQueries({ queryKey: assetKeys.asset(data.asset) });
      toast.success('Depreciation entry generated successfully');
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || 'Failed to generate depreciation entry');
    },
  });
};

export const useAssetMaintenanceHistory = (assetId: number) => {
  return useQuery({
    queryKey: assetKeys.assetMaintenance(assetId),
    queryFn: () => fixedAssetService.getMaintenanceHistory(assetId),
    enabled: !!assetId,
  });
};

// ============ ASSET DEPRECIATION ============

export const useAssetDepreciation = (filters?: DepreciationFilters) => {
  return useQuery({
    queryKey: assetKeys.depreciation(filters),
    queryFn: () => assetDepreciationService.getAll(filters),
  });
};

export const useDepreciationEntry = (id: number) => {
  return useQuery({
    queryKey: assetKeys.depreciationEntry(id),
    queryFn: () => assetDepreciationService.getById(id),
    enabled: !!id,
  });
};

export const useCreateDepreciation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateAssetDepreciationRequest) => assetDepreciationService.create(data),
    onSuccess: data => {
      queryClient.invalidateQueries({ queryKey: assetKeys.depreciation() });
      queryClient.invalidateQueries({ queryKey: assetKeys.assetDepreciation(data.asset) });
      queryClient.invalidateQueries({ queryKey: assetKeys.asset(data.asset) });
      toast.success('Depreciation entry created successfully');
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || 'Failed to create depreciation entry');
    },
  });
};

export const usePostDepreciation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: number) => assetDepreciationService.post(id),
    onSuccess: data => {
      queryClient.invalidateQueries({ queryKey: assetKeys.depreciation() });
      queryClient.invalidateQueries({ queryKey: assetKeys.depreciationEntry(data.id) });
      queryClient.invalidateQueries({ queryKey: assetKeys.assetDepreciation(data.asset) });
      queryClient.invalidateQueries({ queryKey: assetKeys.asset(data.asset) });
      toast.success('Depreciation posted to GL successfully');
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || 'Failed to post depreciation');
    },
  });
};

export const useDeleteDepreciation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: number) => assetDepreciationService.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: assetKeys.depreciation() });
      toast.success('Depreciation entry deleted successfully');
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || 'Failed to delete depreciation entry');
    },
  });
};

// ============ ASSET MAINTENANCE ============

export const useAssetMaintenance = (filters?: MaintenanceFilters) => {
  return useQuery({
    queryKey: assetKeys.maintenance(filters),
    queryFn: () => assetMaintenanceService.getAll(filters),
  });
};

export const useMaintenanceEntry = (id: number) => {
  return useQuery({
    queryKey: assetKeys.maintenanceEntry(id),
    queryFn: () => assetMaintenanceService.getById(id),
    enabled: !!id,
  });
};

export const useCreateMaintenance = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateAssetMaintenanceRequest) => assetMaintenanceService.create(data),
    onSuccess: data => {
      queryClient.invalidateQueries({ queryKey: assetKeys.maintenance() });
      queryClient.invalidateQueries({ queryKey: assetKeys.assetMaintenance(data.asset) });
      queryClient.invalidateQueries({ queryKey: assetKeys.asset(data.asset) });
      toast.success('Maintenance record created successfully');
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || 'Failed to create maintenance record');
    },
  });
};

export const useUpdateMaintenance = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<CreateAssetMaintenanceRequest> }) =>
      assetMaintenanceService.update(id, data),
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: assetKeys.maintenance() });
      queryClient.invalidateQueries({ queryKey: assetKeys.maintenanceEntry(variables.id) });
      queryClient.invalidateQueries({ queryKey: assetKeys.assetMaintenance(data.asset) });
      toast.success('Maintenance record updated successfully');
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || 'Failed to update maintenance record');
    },
  });
};

export const usePostMaintenance = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: number) => assetMaintenanceService.post(id),
    onSuccess: data => {
      queryClient.invalidateQueries({ queryKey: assetKeys.maintenance() });
      queryClient.invalidateQueries({ queryKey: assetKeys.maintenanceEntry(data.id) });
      queryClient.invalidateQueries({ queryKey: assetKeys.assetMaintenance(data.asset) });
      toast.success('Maintenance posted to GL successfully');
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || 'Failed to post maintenance');
    },
  });
};

export const useDeleteMaintenance = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: number) => assetMaintenanceService.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: assetKeys.maintenance() });
      toast.success('Maintenance record deleted successfully');
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || 'Failed to delete maintenance record');
    },
  });
};

// ============ FLEET FUEL MONITORING ============

/**
 * Get fleet summary: all assets with fuel efficiency metrics and anomaly flags.
 * Powers the Fleet Fuel Monitor dashboard.
 */
export const useFleetSummary = (params?: {
  days?: number;
  category?: number;
  status?: string;
  resource_type?: string;
}) => {
  return useQuery<VehicleFleetSummaryResponse>({
    queryKey: assetKeys.fleetSummary(params),
    queryFn: () => fixedAssetService.getFleetSummary(params),
    staleTime: 2 * 60 * 1000, // 2 minutes
  });
};

/**
 * Get full consumption history for a single asset.
 * Includes mileage readings, efficiency trend, and anomaly details.
 */
export const useAssetConsumptionHistory = (
  id: number,
  params?: { days?: number; resource_type?: string }
) => {
  return useQuery<AssetConsumptionHistoryResponse>({
    queryKey: assetKeys.assetConsumptionHistory(id, params),
    queryFn: () => fixedAssetService.getConsumptionHistory(id, params),
    enabled: !!id,
  });
};

/**
 * Get staff fuel consumption summary.
 * Tracks fuel given directly to employees (staff benefit/allowance).
 */
export const useStaffFuelSummary = (params?: { days?: number; resource_type?: string }) => {
  return useQuery<StaffFuelSummaryResponse>({
    queryKey: assetKeys.staffFuelSummary(params),
    queryFn: () => staffFuelService.getSummary(params),
    staleTime: 2 * 60 * 1000,
  });
};

// ============ ASSET ACQUISITION (BULK PURCHASE) ============

export const useAssetAcquisitions = (filters?: {
  status?: string;
  supplier?: number;
  search?: string;
}) => {
  return useQuery({
    queryKey: assetKeys.acquisitions(filters),
    queryFn: () => assetAcquisitionService.getAll(filters),
  });
};

export const useAssetAcquisition = (id: number) => {
  return useQuery({
    queryKey: assetKeys.acquisition(id),
    queryFn: () => assetAcquisitionService.getById(id),
    enabled: !!id,
  });
};

export const useCreateAssetAcquisition = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateAssetAcquisitionRequest) => assetAcquisitionService.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: assetKeys.acquisitions() });
      toast.success('Acquisition submitted for approval');
    },
    onError: (error: any) => {
      toast.error(
        error.response?.data?.detail || error.response?.data?.error || 'Failed to save acquisition'
      );
    },
  });
};

export const useUpdateAssetAcquisition = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<CreateAssetAcquisitionRequest> }) =>
      assetAcquisitionService.update(id, data),
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: assetKeys.acquisitions() });
      queryClient.invalidateQueries({ queryKey: assetKeys.acquisition(vars.id) });
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.detail || 'Failed to update acquisition');
    },
  });
};

export const usePostAssetAcquisition = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => assetAcquisitionService.postAcquisition(id),
    onSuccess: data => {
      queryClient.invalidateQueries({ queryKey: [...assetKeys.all, 'acquisitions'] });
      queryClient.invalidateQueries({ queryKey: assetKeys.acquisition(data.id) });
      queryClient.invalidateQueries({ queryKey: [...assetKeys.all, 'requisitions'] });
      queryClient.invalidateQueries({ queryKey: assetKeys.all });
      queryClient.invalidateQueries({ queryKey: assetKeys.statistics() });
      const count = data.assets_activated ?? 0;
      toast.success(`Acquisition posted — ${count} asset(s) activated in the Fixed Asset Register`);
    },
    onError: (error: any) => {
      toast.error(
        error.response?.data?.error || error.response?.data?.detail || 'Failed to post acquisition'
      );
    },
  });
};

export const useDeleteAssetAcquisition = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => assetAcquisitionService.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: assetKeys.acquisitions() });
      toast.success('Acquisition deleted');
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.detail || 'Failed to delete acquisition');
    },
  });
};

// ============ ASSET REQUISITION HOOKS ============

export const useAssetRequisitions = (filters?: {
  status?: string;
  department?: string;
  search?: string;
}) => {
  return useQuery({
    queryKey: assetKeys.requisitions(filters),
    queryFn: () => assetRequisitionService.getAll(filters),
  });
};

export const useAssetRequisition = (id: number, enabled = true) => {
  return useQuery({
    queryKey: assetKeys.requisition(id),
    queryFn: () => assetRequisitionService.getById(id),
    enabled: enabled && id > 0,
  });
};

export const useCreateAssetRequisition = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateAssetRequisitionRequest) => assetRequisitionService.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: assetKeys.requisitions() });
      toast.success('Asset requisition created');
    },
    onError: (error: any) => {
      const msg =
        error.response?.data?.detail ||
        Object.values(error.response?.data || {})
          .flat()
          .join(', ') ||
        'Failed to create requisition';
      toast.error(msg);
    },
  });
};

export const useUpdateAssetRequisition = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<CreateAssetRequisitionRequest> }) =>
      assetRequisitionService.update(id, data),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: assetKeys.requisitions() });
      queryClient.invalidateQueries({ queryKey: assetKeys.requisition(id) });
      toast.success('Requisition updated');
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.detail || 'Failed to update requisition');
    },
  });
};

export const useSubmitAssetRequisition = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => assetRequisitionService.submit(id),
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: assetKeys.requisitions() });
      queryClient.invalidateQueries({ queryKey: assetKeys.requisition(id) });
      toast.success('Requisition submitted for approval');
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error || 'Failed to submit requisition');
    },
  });
};

export const useApproveAssetRequisition = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => assetRequisitionService.approve(id),
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: assetKeys.requisitions() });
      queryClient.invalidateQueries({ queryKey: assetKeys.requisition(id) });
      toast.success('Requisition approved');
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error || 'Failed to approve requisition');
    },
  });
};

export const useRejectAssetRequisition = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reason }: { id: number; reason: string }) =>
      assetRequisitionService.reject(id, reason),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: assetKeys.requisitions() });
      queryClient.invalidateQueries({ queryKey: assetKeys.requisition(id) });
      toast.success('Requisition rejected');
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error || 'Failed to reject requisition');
    },
  });
};

export const useConvertAssetRequisition = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => assetRequisitionService.convert(id),
    onSuccess: (data, id) => {
      queryClient.invalidateQueries({ queryKey: assetKeys.requisitions() });
      queryClient.invalidateQueries({ queryKey: assetKeys.requisition(id) });
      queryClient.invalidateQueries({ queryKey: assetKeys.acquisitions() });
      toast.success(`Converted to Acquisition ${data.acquisition_reference}`);
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error || 'Failed to convert requisition');
    },
  });
};

export const useActivateAssetRequisition = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data?: ActivateAssetRequisitionRequest }) =>
      assetRequisitionService.activate(id, data),
    onSuccess: (result, { id }) => {
      queryClient.invalidateQueries({ queryKey: assetKeys.requisitions() });
      queryClient.invalidateQueries({ queryKey: assetKeys.requisition(id) });
      queryClient.invalidateQueries({ queryKey: assetKeys.all });
      queryClient.invalidateQueries({ queryKey: assetKeys.statistics() });
      toast.success(
        `${result.assets_activated} asset(s) activated — GL entries and AP records created`
      );
    },
    onError: (error: any) => {
      toast.error(
        error.response?.data?.error ||
          Object.values(error.response?.data || {})
            .flat()
            .join(', ') ||
          'Failed to activate assets'
      );
    },
  });
};

export const useDeleteAssetRequisition = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => assetRequisitionService.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: assetKeys.requisitions() });
      toast.success('Requisition deleted');
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.detail || 'Failed to delete requisition');
    },
  });
};

// ============ ASSET TRANSFER HOOKS ============

export const useAssetTransfers = (assetId: number) => {
  return useQuery({
    queryKey: assetKeys.assetTransfers(assetId),
    queryFn: () => fixedAssetService.getTransfers(assetId),
    enabled: !!assetId,
  });
};

export const useAssetAssignmentHistory = (assetId: number) => {
  return useQuery({
    queryKey: assetKeys.assetAssignments(assetId),
    queryFn: () => fixedAssetService.getAssignmentHistory(assetId),
    enabled: !!assetId,
  });
};

export const useTransferAsset = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: CreateAssetTransferRequest }) =>
      fixedAssetService.transfer(id, data),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: assetKeys.asset(id) });
      queryClient.invalidateQueries({ queryKey: assetKeys.assetTransfers(id) });
      queryClient.invalidateQueries({ queryKey: assetKeys.assetAssignments(id) });
      queryClient.invalidateQueries({ queryKey: assetKeys.assets() });
      toast.success('Asset transfer initiated successfully');
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error || 'Failed to initiate transfer');
    },
  });
};

export const useAcknowledgeTransfer = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ assetId, transferId }: { assetId: number; transferId?: number }) =>
      fixedAssetService.acknowledgeTransfer(assetId, transferId),
    onSuccess: (_, { assetId }) => {
      queryClient.invalidateQueries({ queryKey: assetKeys.asset(assetId) });
      queryClient.invalidateQueries({ queryKey: assetKeys.assetTransfers(assetId) });
      toast.success('Transfer acknowledged');
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error || 'Failed to acknowledge transfer');
    },
  });
};

// ============ ASSET ACQUISITION WORKFLOW HOOKS ============

export const useSubmitAcquisition = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => assetAcquisitionService.submit(id),
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: assetKeys.acquisitions() });
      queryClient.invalidateQueries({ queryKey: assetKeys.acquisition(id) });
      toast.success('Acquisition submitted for approval');
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error || 'Failed to submit acquisition');
    },
  });
};

export const useApproveAcquisition = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => assetAcquisitionService.approve(id),
    onSuccess: (data, id) => {
      queryClient.invalidateQueries({ queryKey: [...assetKeys.all, 'acquisitions'] });
      queryClient.invalidateQueries({ queryKey: assetKeys.acquisition(id) });
      queryClient.invalidateQueries({ queryKey: [...assetKeys.all, 'requisitions'] });
      queryClient.invalidateQueries({ queryKey: assetKeys.all });
      queryClient.invalidateQueries({ queryKey: assetKeys.statistics() });
      const count = (data as any).assets_activated ?? 0;
      toast.success(
        count > 0
          ? `Acquisition approved and posted — ${count} asset(s) activated`
          : 'Acquisition approved and posted'
      );
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error || 'Failed to approve acquisition');
    },
  });
};

export const useRejectAcquisition = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reason }: { id: number; reason: string }) =>
      assetAcquisitionService.reject(id, reason),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: assetKeys.acquisitions() });
      queryClient.invalidateQueries({ queryKey: assetKeys.acquisition(id) });
      toast.success('Acquisition rejected – returned to draft');
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error || 'Failed to reject acquisition');
    },
  });
};
