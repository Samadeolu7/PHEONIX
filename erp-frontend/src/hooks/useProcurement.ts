// src/hooks/useProcurement.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  procurementService,
  PurchaseOrder,
  CreatePurchaseOrderData,
  GoodsReceivedNote,
  CreateGRNData,
  PurchaseReturn,
  CreatePurchaseReturnData,
  PurchaseReturnApprovalData,
} from '../services/procurementService';

import {
  PurchaseRequisition,
  CreatePurchaseRequisitionData,
  UpdatePurchaseRequisitionData,
  RequisitionApprovalData,
  RequisitionToPOConversionData,
  Department,
  InventoryItem,
} from '../types/procurement';
import {
  Quote,
  CreateQuoteData,
  UpdateQuoteData,
  QuoteComparison,
  QuoteListParams,
  QuoteSelectionData,
} from '../types/quotes';
import { Location, PaginatedResponse } from '../types/inventory';

// Query Keys
export const procurementKeys = {
  all: ['procurement'] as const,

  // Purchase Orders
  purchaseOrders: () => [...procurementKeys.all, 'purchase-orders'] as const,
  purchaseOrdersList: (params?: any) =>
    [...procurementKeys.purchaseOrders(), 'list', params] as const,
  purchaseOrdersDetails: () => [...procurementKeys.purchaseOrders(), 'detail'] as const,
  purchaseOrdersDetail: (id: number) => [...procurementKeys.purchaseOrdersDetails(), id] as const,

  // Purchase Requisitions
  requisitions: () => [...procurementKeys.all, 'requisitions'] as const,
  requisitionsList: (params?: any) => [...procurementKeys.requisitions(), 'list', params] as const,
  requisitionsDetails: () => [...procurementKeys.requisitions(), 'detail'] as const,
  requisitionsDetail: (id: number) => [...procurementKeys.requisitionsDetails(), id] as const,

  // Departments
  departments: () => [...procurementKeys.all, 'departments'] as const,
  departmentsList: (params?: any) => [...procurementKeys.departments(), 'list', params] as const,

  // Suppliers
  suppliers: () => [...procurementKeys.all, 'suppliers'] as const,
  suppliersList: (params?: any) => [...procurementKeys.suppliers(), 'list', params] as const,

  // GRNs
  grns: () => [...procurementKeys.all, 'grns'] as const,
  grnsList: (params?: any) => [...procurementKeys.grns(), 'list', params] as const,
  grnsDetails: () => [...procurementKeys.grns(), 'detail'] as const,
  grnsDetail: (id: number) => [...procurementKeys.grnsDetails(), id] as const,

  // Inventory (for PO creation)
  inventoryItems: () => [...procurementKeys.all, 'inventory-items'] as const,
  inventoryItemsList: (params?: any) =>
    [...procurementKeys.inventoryItems(), 'list', params] as const,
  inventoryLocations: () => [...procurementKeys.all, 'inventory-locations'] as const,
  inventoryLocationsList: (params?: any) =>
    [...procurementKeys.inventoryLocations(), 'list', params] as const,

  // Purchase Returns
  returns: () => [...procurementKeys.all, 'returns'] as const,
  returnsList: (params?: any) => [...procurementKeys.returns(), 'list', params] as const,
  returnsDetails: () => [...procurementKeys.returns(), 'detail'] as const,
  returnsDetail: (id: number) => [...procurementKeys.returnsDetails(), id] as const,
};

// Purchase Order Hooks
export const usePurchaseOrders = (params?: {
  search?: string;
  status?: string;
  page?: number;
  ordering?: string;
}) => {
  return useQuery({
    queryKey: procurementKeys.purchaseOrdersList(params),
    queryFn: () => procurementService.getPurchaseOrders(params),
    placeholderData: previousData => previousData,
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes (formerly cacheTime)
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    refetchOnReconnect: true,
  });
};

export const usePurchaseOrder = (id: number, enabled: boolean = true) => {
  return useQuery({
    queryKey: procurementKeys.purchaseOrdersDetail(id),
    queryFn: () => procurementService.getPurchaseOrder(id),
    enabled: enabled && !!id,
  });
};

export const useCreatePurchaseOrder = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreatePurchaseOrderData) => procurementService.createPurchaseOrder(data),
    onSuccess: () => {
      // Invalidate ALL purchase order related queries
      queryClient.invalidateQueries({ queryKey: procurementKeys.purchaseOrders() });
      // Also invalidate any cached lists with different parameters
      queryClient.invalidateQueries({
        predicate: query => {
          return query.queryKey[0] === 'procurement' && query.queryKey[1] === 'purchase-orders';
        },
      });
      // Force refetch of the main list
      queryClient.refetchQueries({ queryKey: procurementKeys.purchaseOrdersList() });
    },
  });
};

export const useUpdatePurchaseOrder = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<CreatePurchaseOrderData> }) =>
      procurementService.updatePurchaseOrder(id, data),
    onSuccess: (updatedPO, { id }) => {
      // Update the specific PO in cache
      queryClient.setQueryData(procurementKeys.purchaseOrdersDetail(id), updatedPO);
      // Invalidate PO lists to reflect changes
      queryClient.invalidateQueries({ queryKey: procurementKeys.purchaseOrders() });
    },
  });
};

export const useDeletePurchaseOrder = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: number) => procurementService.deletePurchaseOrder(id),
    onSuccess: (_, deletedId) => {
      // Remove from cache
      queryClient.removeQueries({ queryKey: procurementKeys.purchaseOrdersDetail(deletedId) });
      // Invalidate lists to reflect deletion
      queryClient.invalidateQueries({ queryKey: procurementKeys.purchaseOrders() });
    },
  });
};

// Purchase Order Actions
export const useSubmitPurchaseOrder = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: number) => procurementService.submitPurchaseOrder(id),
    onSuccess: (updatedPO, id) => {
      // Update the specific PO in cache
      queryClient.setQueryData(procurementKeys.purchaseOrdersDetail(id), updatedPO);
      // Invalidate ALL PO queries (including lists with different parameters)
      queryClient.invalidateQueries({ queryKey: procurementKeys.purchaseOrders() });
      // Also invalidate the base procurement queries to catch any other related queries
      queryClient.invalidateQueries({ queryKey: procurementKeys.all });
    },
  });
};

export const useApprovePurchaseOrder = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: number) => procurementService.approvePurchaseOrder(id),
    onSuccess: (updatedPO, id) => {
      // Update the specific PO in cache
      queryClient.setQueryData(procurementKeys.purchaseOrdersDetail(id), updatedPO);
      // Invalidate ALL PO queries (including lists with different parameters)
      queryClient.invalidateQueries({ queryKey: procurementKeys.purchaseOrders() });
      // Also invalidate the base procurement queries to catch any other related queries
      queryClient.invalidateQueries({ queryKey: procurementKeys.all });
    },
  });
};

export const useSendPurchaseOrder = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: number) => procurementService.sendPurchaseOrder(id),
    onSuccess: (updatedPO, id) => {
      // Update the specific PO in cache
      queryClient.setQueryData(procurementKeys.purchaseOrdersDetail(id), updatedPO);
      // Invalidate ALL PO queries (including lists with different parameters)
      queryClient.invalidateQueries({ queryKey: procurementKeys.purchaseOrders() });
      // Also invalidate the base procurement queries to catch any other related queries
      queryClient.invalidateQueries({ queryKey: procurementKeys.all });
    },
  });
};

export const useAcknowledgePurchaseOrder = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: number; data?: Partial<CreatePurchaseOrderData> }) =>
      procurementService.acknowledgePurchaseOrder(id, data),
    onSuccess: (updatedPO, { id }) => {
      // Update the specific PO in cache
      queryClient.setQueryData(procurementKeys.purchaseOrdersDetail(id), updatedPO);
      // Invalidate ALL PO queries (including lists with different parameters)
      queryClient.invalidateQueries({ queryKey: procurementKeys.purchaseOrders() });
      // Also invalidate the base procurement queries to catch any other related queries
      queryClient.invalidateQueries({ queryKey: procurementKeys.all });
    },
  });
};

export const useCancelPurchaseOrder = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, reason }: { id: number; reason: string }) =>
      procurementService.cancelPurchaseOrder(id, reason),
    onSuccess: (updatedPO, { id }) => {
      // Update the specific PO in cache
      queryClient.setQueryData(procurementKeys.purchaseOrdersDetail(id), updatedPO);
      // Invalidate ALL PO queries (including lists with different parameters)
      queryClient.invalidateQueries({ queryKey: procurementKeys.purchaseOrders() });
      // Also invalidate the base procurement queries to catch any other related queries
      queryClient.invalidateQueries({ queryKey: procurementKeys.all });
    },
  });
};

// Purchase Requisition Hooks
export const usePurchaseRequisitions = (params?: {
  search?: string;
  status?: string;
  department_id?: number;
  requester_id?: number;
  priority?: string;
  date_from?: string;
  date_to?: string;
  budget_code?: string;
  page?: number;
  ordering?: string;
}) => {
  return useQuery({
    queryKey: procurementKeys.requisitionsList(params),
    queryFn: () => procurementService.getPurchaseRequisitions(params),
    placeholderData: previousData => previousData,
  });
};

export const usePurchaseRequisition = (id: number, enabled: boolean = true) => {
  return useQuery({
    queryKey: procurementKeys.requisitionsDetail(id),
    queryFn: () => procurementService.getPurchaseRequisition(id),
    enabled: enabled && !!id,
  });
};

export const useCreatePurchaseRequisition = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreatePurchaseRequisitionData) =>
      procurementService.createPurchaseRequisition(data),
    onSuccess: () => {
      // Invalidate and refetch requisition lists
      queryClient.invalidateQueries({ queryKey: procurementKeys.requisitions() });
    },
  });
};

export const useCreatePurchaseRequisitionWithWorkflow = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreatePurchaseRequisitionData) =>
      procurementService.createRequisitionWithWorkflow(data),
    retry: false, // Explicitly disable retries for workflow submissions
    onSuccess: () => {
      // Invalidate and refetch requisition lists
      queryClient.invalidateQueries({ queryKey: procurementKeys.requisitions() });
    },
  });
};

export const useUpdatePurchaseRequisition = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: UpdatePurchaseRequisitionData }) =>
      procurementService.updatePurchaseRequisition(id, data),
    onSuccess: (updatedRequisition, { id }) => {
      // Update the specific requisition in cache
      queryClient.setQueryData(procurementKeys.requisitionsDetail(id), updatedRequisition);
      // Invalidate requisition lists to reflect changes
      queryClient.invalidateQueries({ queryKey: procurementKeys.requisitions() });
    },
  });
};

export const useDeletePurchaseRequisition = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: number) => procurementService.deletePurchaseRequisition(id),
    onSuccess: (_, deletedId) => {
      // Remove from cache
      queryClient.removeQueries({ queryKey: procurementKeys.requisitionsDetail(deletedId) });
      // Invalidate lists to reflect deletion
      queryClient.invalidateQueries({ queryKey: procurementKeys.requisitions() });
    },
  });
};

// Purchase Requisition Actions with enhanced error handling
export const useSubmitRequisition = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: ['procurement', 'requisitions', 'submit'],
    mutationFn: (id: number) => procurementService.submitRequisition(id),
    onSuccess: (updatedRequisition, id) => {
      // Update the specific requisition in cache
      queryClient.setQueryData(procurementKeys.requisitionsDetail(id), updatedRequisition);
      // Invalidate requisition lists to reflect status change
      queryClient.invalidateQueries({ queryKey: procurementKeys.requisitions() });
    },
    onError: (error, id) => {
      // Error handling is now managed by the service layer with ErrorHandler
      // Just invalidate the specific requisition to refresh its state
      queryClient.invalidateQueries({ queryKey: procurementKeys.requisitionsDetail(id) });
    },
    meta: {
      context: 'submit-requisition',
      successMessage: 'Requisition submitted successfully',
      errorMessage: 'Failed to submit requisition',
      operationId: (id: number) => `submit-requisition-${id}`,
      disableButtons: (id: number) => [`submit-btn-${id}`, `edit-btn-${id}`],
    },
  });
};

export const useApproveRequisition = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: RequisitionApprovalData }) =>
      procurementService.approveRequisition(id, data),
    onSuccess: (updatedRequisition, { id }) => {
      // Update the specific requisition in cache
      queryClient.setQueryData(procurementKeys.requisitionsDetail(id), updatedRequisition);
      // Invalidate requisition lists to reflect status change
      queryClient.invalidateQueries({ queryKey: procurementKeys.requisitions() });
    },
  });
};

export const useVerifyRequisitionInvoice = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: FormData }) =>
      procurementService.verifyRequisitionInvoice(id, data),
    onSuccess: (updatedRequisition, { id }) => {
      // Update the specific requisition in cache
      queryClient.setQueryData(procurementKeys.requisitionsDetail(id), updatedRequisition);
      // Invalidate requisition lists to reflect updated invoice info
      queryClient.invalidateQueries({ queryKey: procurementKeys.requisitions() });
    },
  });
};

export const useRejectRequisition = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: RequisitionApprovalData }) =>
      procurementService.rejectRequisition(id, data),
    onSuccess: (updatedRequisition, { id }) => {
      // Update the specific requisition in cache
      queryClient.setQueryData(procurementKeys.requisitionsDetail(id), updatedRequisition);
      // Invalidate requisition lists to reflect status change
      queryClient.invalidateQueries({ queryKey: procurementKeys.requisitions() });
    },
  });
};

export const useConvertRequisitionToPO = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: ['procurement', 'requisitions', 'convert-to-po'],
    mutationFn: (id: number) => procurementService.convertRequisitionToPO(id),
    onSuccess: (newPO, requisitionId) => {
      // Invalidate requisition lists to reflect conversion
      queryClient.invalidateQueries({ queryKey: procurementKeys.requisitions() });
      // Invalidate PO lists to show new PO
      queryClient.invalidateQueries({ queryKey: procurementKeys.purchaseOrders() });
      // Update the specific requisition in cache to show converted status
      queryClient.invalidateQueries({
        queryKey: procurementKeys.requisitionsDetail(requisitionId),
      });
    },
    onError: (error, requisitionId) => {
      // Error handling is now managed by the service layer with ErrorHandler
      // Just invalidate the specific requisition to refresh its state
      queryClient.invalidateQueries({
        queryKey: procurementKeys.requisitionsDetail(requisitionId),
      });
    },
    meta: {
      context: 'convert-requisition',
      successMessage: 'Requisition converted to purchase order successfully',
      errorMessage: 'Failed to convert requisition to purchase order',
    },
  });
};

// Enhanced conversion hook with supplier and delivery location selection
export const useConvertRequisitionToPOWithDetails = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: ['procurement', 'requisitions', 'convert-to-po-with-details'],
    mutationFn: ({
      id,
      conversionData,
    }: {
      id: number;
      conversionData: RequisitionToPOConversionData;
    }) => procurementService.convertRequisitionToPOWithDetails(id, conversionData),
    onSuccess: (newPO, { id: requisitionId }) => {
      // Invalidate requisition lists to reflect conversion
      queryClient.invalidateQueries({ queryKey: procurementKeys.requisitions() });
      // Invalidate PO lists to show new PO
      queryClient.invalidateQueries({ queryKey: procurementKeys.purchaseOrders() });
      // Update the specific requisition in cache to show converted status
      queryClient.invalidateQueries({
        queryKey: procurementKeys.requisitionsDetail(requisitionId),
      });
    },
    onError: (error, { id: requisitionId }) => {
      // Error handling is now managed by the service layer with ErrorHandler
      // Just invalidate the specific requisition to refresh its state
      queryClient.invalidateQueries({
        queryKey: procurementKeys.requisitionsDetail(requisitionId),
      });
    },
    meta: {
      context: 'convert-requisition-with-details',
      successMessage: 'Requisition converted to purchase order successfully',
      errorMessage: 'Failed to convert requisition to purchase order',
    },
  });
};

// Bulk Requisition Actions
export const useBulkApproveRequisitions = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ ids, data }: { ids: number[]; data: RequisitionApprovalData }) =>
      procurementService.bulkApproveRequisitions(ids, data),
    onSuccess: () => {
      // Invalidate requisition lists to reflect bulk changes
      queryClient.invalidateQueries({ queryKey: procurementKeys.requisitions() });
    },
  });
};

export const useBulkRejectRequisitions = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ ids, data }: { ids: number[]; data: RequisitionApprovalData }) =>
      procurementService.bulkRejectRequisitions(ids, data),
    onSuccess: () => {
      // Invalidate requisition lists to reflect bulk changes
      queryClient.invalidateQueries({ queryKey: procurementKeys.requisitions() });
    },
  });
};

// Department Hooks
export const useDepartments = (params?: {
  search?: string;
  is_active?: boolean;
  page?: number;
}) => {
  return useQuery({
    queryKey: procurementKeys.departmentsList(params),
    queryFn: () => procurementService.getDepartments(params),
    placeholderData: previousData => previousData,
  });
};

// Supplier Hooks
export const useSuppliers = (params?: { search?: string; page?: number; ordering?: string }) => {
  return useQuery({
    queryKey: procurementKeys.suppliersList(params),
    queryFn: () => procurementService.getSuppliers(params),
    placeholderData: previousData => previousData,
  });
};

export const useAllProcurementSuppliers = (params?: {
  search?: string;
  ordering?: string;
  page_size?: number;
}) => {
  return useQuery({
    queryKey: [...procurementKeys.suppliers(), 'all', params],
    queryFn: () => procurementService.getAllSuppliers(params),
  });
};

// GRN Hooks
export const useGRNs = (params?: {
  search?: string;
  status?: string;
  quality_status?: string;
  supplier_id?: number;
  is_posted?: boolean;
  date_from?: string;
  date_to?: string;
  page?: number;
  ordering?: string;
}) => {
  return useQuery({
    queryKey: procurementKeys.grnsList(params),
    queryFn: () => procurementService.getGRNs(params),
    placeholderData: previousData => previousData,
  });
};

export const useGRN = (id: number, enabled: boolean = true) => {
  return useQuery({
    queryKey: procurementKeys.grnsDetail(id),
    queryFn: () => procurementService.getGRN(id),
    enabled: enabled && !!id,
  });
};

export const useCreateGRN = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateGRNData) => procurementService.createGRN(data),
    onSuccess: () => {
      // Invalidate and refetch GRN lists
      queryClient.invalidateQueries({ queryKey: procurementKeys.grns() });
      // Also invalidate PO lists as GRN creation affects PO status
      queryClient.invalidateQueries({ queryKey: procurementKeys.purchaseOrders() });
    },
  });
};

export const useUpdateGRN = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<CreateGRNData> }) =>
      procurementService.updateGRN(id, data),
    onSuccess: (updatedGRN, { id }) => {
      // Update the specific GRN in cache
      queryClient.setQueryData(procurementKeys.grnsDetail(id), updatedGRN);
      // Invalidate GRN lists to reflect changes
      queryClient.invalidateQueries({ queryKey: procurementKeys.grns() });
    },
  });
};

export const useDeleteGRN = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: number) => procurementService.deleteGRN(id),
    onSuccess: (_, deletedId) => {
      // Remove from cache
      queryClient.removeQueries({ queryKey: procurementKeys.grnsDetail(deletedId) });
      // Invalidate lists to reflect deletion
      queryClient.invalidateQueries({ queryKey: procurementKeys.grns() });
    },
  });
};

// GRN Actions
export const usePostGRNToInventory = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: number) => procurementService.postGRNToInventory(id),
    onSuccess: (updatedGRN, id) => {
      // Update the specific GRN in cache
      queryClient.setQueryData(procurementKeys.grnsDetail(id), updatedGRN);
      // Invalidate GRN lists to reflect posting status change
      queryClient.invalidateQueries({ queryKey: procurementKeys.grns() });
    },
  });
};

export const usePostGRNToAccounting = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: number) => procurementService.postGRNToAccounting(id),
    onSuccess: (updatedGRN, id) => {
      // Update the specific GRN in cache
      queryClient.setQueryData(procurementKeys.grnsDetail(id), updatedGRN);
      // Invalidate GRN lists to reflect posting status change
      queryClient.invalidateQueries({ queryKey: procurementKeys.grns() });
    },
  });
};

export const usePostGRNToBoth = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: number) => procurementService.postGRNToBoth(id),
    onSuccess: (updatedGRN, id) => {
      // Update the specific GRN in cache
      queryClient.setQueryData(procurementKeys.grnsDetail(id), updatedGRN);
      // Invalidate GRN lists to reflect posting status change
      queryClient.invalidateQueries({ queryKey: procurementKeys.grns() });
    },
  });
};

// New GRN Actions - Quality Inspection and Unified Posting
export const useCompleteQualityInspection = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<CreateGRNData> }) =>
      procurementService.completeQualityInspection(id, data),
    onSuccess: (updatedGRN, { id }) => {
      // Update the specific GRN in cache
      queryClient.setQueryData(procurementKeys.grnsDetail(id), updatedGRN);
      // Invalidate GRN lists to reflect quality status change
      queryClient.invalidateQueries({ queryKey: procurementKeys.grns() });
    },
  });
};

export const usePostGRNToInventoryAndAccounting = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: number; data?: Partial<CreateGRNData> }) =>
      procurementService.postGRNToInventoryAndAccounting(id, data),
    onSuccess: (updatedGRN, { id }) => {
      // Update the specific GRN in cache
      queryClient.setQueryData(procurementKeys.grnsDetail(id), updatedGRN);
      // Invalidate GRN lists to reflect posting status change
      queryClient.invalidateQueries({ queryKey: procurementKeys.grns() });
    },
  });
};

// Inventory Hooks (for PO creation)
export const useInventoryItems = (params?: {
  search?: string;
  is_active?: boolean;
  page?: number;
  limit?: number;
}) => {
  return useQuery({
    queryKey: procurementKeys.inventoryItemsList(params),
    queryFn: () => procurementService.getInventoryItems(params),
    placeholderData: previousData => previousData,
  });
};

export const useAllInventoryItems = (params?: {
  search?: string;
  is_active?: boolean;
  page_size?: number;
  limit?: number;
}) => {
  return useQuery({
    queryKey: [...procurementKeys.inventoryItems(), 'all', params],
    queryFn: () => procurementService.getAllInventoryItems(params),
  });
};

export const useInventoryLocations = (params?: {
  search?: string;
  is_active?: boolean;
  page?: number;
}) => {
  return useQuery({
    queryKey: procurementKeys.inventoryLocationsList(params),
    queryFn: () => procurementService.getInventoryLocations(params),
    placeholderData: previousData => previousData,
  });
};

export const useAllInventoryLocations = (params?: {
  search?: string;
  is_active?: boolean;
  page_size?: number;
}) => {
  return useQuery({
    queryKey: [...procurementKeys.inventoryLocations(), 'all', params],
    queryFn: () => procurementService.getAllInventoryLocations(params),
  });
};

// Purchase Return Hooks
export const usePurchaseReturns = (params?: {
  search?: string;
  status?: string;
  supplier_id?: number;
  return_reason_category?: string;
  date_from?: string;
  date_to?: string;
  page?: number;
  ordering?: string;
}) => {
  return useQuery({
    queryKey: procurementKeys.returnsList(params),
    queryFn: () => procurementService.getPurchaseReturns(params),
    placeholderData: previousData => previousData,
  });
};

export const usePurchaseReturn = (id: number, enabled: boolean = true) => {
  return useQuery({
    queryKey: procurementKeys.returnsDetail(id),
    queryFn: () => procurementService.getPurchaseReturn(id),
    enabled: enabled && !!id,
  });
};

export const useCreatePurchaseReturn = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreatePurchaseReturnData) => procurementService.createPurchaseReturn(data),
    onSuccess: () => {
      // Invalidate and refetch return lists
      queryClient.invalidateQueries({ queryKey: procurementKeys.returns() });
      // Also invalidate GRN lists as returns affect GRN status
      queryClient.invalidateQueries({ queryKey: procurementKeys.grns() });
    },
  });
};

export const useUpdatePurchaseReturn = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<CreatePurchaseReturnData> }) =>
      procurementService.updatePurchaseReturn(id, data),
    onSuccess: (updatedReturn, { id }) => {
      // Update the specific return in cache
      queryClient.setQueryData(procurementKeys.returnsDetail(id), updatedReturn);
      // Invalidate return lists to reflect changes
      queryClient.invalidateQueries({ queryKey: procurementKeys.returns() });
    },
  });
};

export const useDeletePurchaseReturn = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: number) => procurementService.deletePurchaseReturn(id),
    onSuccess: (_, deletedId) => {
      // Remove from cache
      queryClient.removeQueries({ queryKey: procurementKeys.returnsDetail(deletedId) });
      // Invalidate lists to reflect deletion
      queryClient.invalidateQueries({ queryKey: procurementKeys.returns() });
    },
  });
};

// Purchase Return Actions
// Purchase Return Actions - Updated to use verified endpoints only
export const useApprovePurchaseReturn = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<CreatePurchaseReturnData> }) =>
      procurementService.postPurchaseReturn(id, data),
    onSuccess: (updatedReturn, { id }) => {
      // Update the specific return in cache
      queryClient.setQueryData(procurementKeys.returnsDetail(id), updatedReturn);
      // Invalidate return lists to reflect status change
      queryClient.invalidateQueries({ queryKey: procurementKeys.returns() });
    },
  });
};

// Purchase Return Actions - Updated to use verified endpoints only
export const usePostPurchaseReturn = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<CreatePurchaseReturnData> }) =>
      procurementService.postPurchaseReturn(id, data),
    onSuccess: (updatedReturn, { id }) => {
      // Update the specific return in cache
      queryClient.setQueryData(procurementKeys.returnsDetail(id), updatedReturn);
      // Invalidate return lists to reflect status change
      queryClient.invalidateQueries({ queryKey: procurementKeys.returns() });
    },
  });
};

export const useUpdatePurchaseReturnStatus = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      id,
      status,
    }: {
      id: number;
      status: 'pending' | 'approved' | 'shipped' | 'completed' | 'cancelled';
    }) => procurementService.updatePurchaseReturn(id, { status }),
    onSuccess: (updatedReturn, { id }) => {
      // Update the specific return in cache
      queryClient.setQueryData(procurementKeys.returnsDetail(id), updatedReturn);
      // Invalidate return lists to reflect status change
      queryClient.invalidateQueries({ queryKey: procurementKeys.returns() });
    },
  });
};

// ============= QUOTES HOOKS =============

// Quotes Query Keys
export const quotesKeys = {
  quotes: () => [...procurementKeys.all, 'quotes'] as const,
  quotesList: (params?: any) => [...quotesKeys.quotes(), 'list', params] as const,
  quotesDetails: () => [...quotesKeys.quotes(), 'detail'] as const,
  quotesDetail: (id: number) => [...quotesKeys.quotesDetails(), id] as const,
  quotesComparison: (requisitionId: number) =>
    [...quotesKeys.quotes(), 'comparison', requisitionId] as const,
};

// Quotes Hooks
export const useQuotes = (params?: {
  search?: string;
  status?: string;
  supplier_id?: number;
  requisition_id?: number;
  date_from?: string;
  date_to?: string;
  page?: number;
  ordering?: string;
}) => {
  return useQuery({
    queryKey: quotesKeys.quotesList(params),
    queryFn: () => procurementService.getQuotes(params),
    placeholderData: previousData => previousData,
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    refetchOnReconnect: true,
  });
};

export const useQuote = (id: number, enabled: boolean = true) => {
  return useQuery({
    queryKey: quotesKeys.quotesDetail(id),
    queryFn: () => procurementService.getQuote(id),
    enabled: enabled && !!id,
  });
};

export const useCreateQuote = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: procurementService.createQuote,
    onSuccess: newQuote => {
      // Invalidate quotes list to show new quote
      queryClient.invalidateQueries({ queryKey: quotesKeys.quotes() });
      // Set the new quote in cache
      queryClient.setQueryData(quotesKeys.quotesDetail(newQuote.id), newQuote);
    },
  });
};

export const useUpdateQuote = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) =>
      procurementService.updateQuote(id, data),
    onSuccess: (updatedQuote, { id }) => {
      // Update the specific quote in cache
      queryClient.setQueryData(quotesKeys.quotesDetail(id), updatedQuote);
      // Invalidate quotes list to reflect changes
      queryClient.invalidateQueries({ queryKey: quotesKeys.quotes() });
    },
  });
};

export const useDeleteQuote = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: number) => procurementService.deleteQuote(id),
    onSuccess: (_, id) => {
      // Remove from cache
      queryClient.removeQueries({ queryKey: quotesKeys.quotesDetail(id) });
      // Invalidate quotes list
      queryClient.invalidateQueries({ queryKey: quotesKeys.quotes() });
    },
  });
};

// Quote Actions
export const useSelectQuote = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: number; data?: any }) =>
      procurementService.selectQuote(id, data),
    onSuccess: (selectedQuote, { id }) => {
      // Update the specific quote in cache
      queryClient.setQueryData(quotesKeys.quotesDetail(id), selectedQuote);
      // Invalidate quotes list to reflect status changes
      queryClient.invalidateQueries({ queryKey: quotesKeys.quotes() });
      // If there's a requisition, invalidate comparison data
      if (selectedQuote.requisition) {
        queryClient.invalidateQueries({
          queryKey: quotesKeys.quotesComparison(selectedQuote.requisition),
        });
      }
    },
  });
};

export const useCompareQuotes = (requisitionId: number, enabled: boolean = true) => {
  return useQuery({
    queryKey: quotesKeys.quotesComparison(requisitionId),
    queryFn: () => procurementService.compareQuotes(requisitionId),
    enabled: enabled && !!requisitionId,
  });
};

export const useConvertQuoteToPO = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      quoteId,
      data,
    }: {
      quoteId: number;
      data: {
        supplier: number;
        delivery_location: number;
        expected_delivery_date: string;
        order_date: string;
        payment_terms: string;
        custom_payment_terms?: string;
        contact_person?: string;
        contact_phone?: string;
        contact_email?: string;
        notes?: string;
      };
    }) => procurementService.convertQuoteToPO(quoteId, data),
    onSuccess: (newPO, { quoteId }) => {
      // Invalidate quotes to reflect conversion
      queryClient.invalidateQueries({ queryKey: quotesKeys.quotes() });
      // Invalidate PO lists to show new PO
      queryClient.invalidateQueries({ queryKey: procurementKeys.purchaseOrders() });
      // Update the specific quote in cache
      queryClient.invalidateQueries({ queryKey: quotesKeys.quotesDetail(quoteId) });
      // Invalidate requisitions as the conversion affects requisition status
      queryClient.invalidateQueries({ queryKey: procurementKeys.requisitions() });
    },
  });
};

export const useCreateQuotesFromRequisition = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ requisitionId, data }: { requisitionId: number; data: any }) =>
      procurementService.createQuotesFromRequisition(requisitionId, data),
    onSuccess: (_, { requisitionId }) => {
      // Invalidate quotes list to show new quote
      queryClient.invalidateQueries({ queryKey: quotesKeys.quotes() });
      // Invalidate comparison data for this requisition
      queryClient.invalidateQueries({
        queryKey: quotesKeys.quotesComparison(requisitionId),
      });
      // Invalidate the requisition to show updated status
      queryClient.invalidateQueries({
        queryKey: procurementKeys.requisitionsDetail(requisitionId),
      });
    },
  });
};

// ============= WORKFLOW INTEGRATION HOOKS =============

// Workflow Status Tracking Hooks
export const useWorkflowStatus = (
  entityType: string,
  entityId: number,
  enabled: boolean = true
) => {
  return useQuery({
    queryKey: [...procurementKeys.all, 'workflow-status', entityType, entityId] as const,
    queryFn: () => procurementService.getWorkflowStatus(entityType, entityId),
    enabled: enabled && !!entityType && !!entityId,
    refetchInterval: data => {
      // Auto-refresh if workflow is still active
      const isActive = data?.status === 'pending' || data?.status === 'in_progress';
      return isActive ? 10000 : false; // 10 seconds
    },
  });
};

export const useStartWorkflow = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: {
      entity_type: string;
      entity_id: number;
      workflow_type: string;
      trigger_data: Record<string, any>;
      priority?: string;
    }) => procurementService.startWorkflow(data),
    onSuccess: (_, variables) => {
      // Invalidate workflow status for this entity
      queryClient.invalidateQueries({
        queryKey: [
          ...procurementKeys.all,
          'workflow-status',
          variables.entity_type,
          variables.entity_id,
        ],
      });
      // Also invalidate the entity itself to show updated status
      if (variables.entity_type === 'requisition') {
        queryClient.invalidateQueries({
          queryKey: procurementKeys.requisitionsDetail(variables.entity_id),
        });
      } else if (variables.entity_type === 'grn') {
        queryClient.invalidateQueries({
          queryKey: procurementKeys.grnsDetail(variables.entity_id),
        });
      } else if (variables.entity_type === 'return') {
        queryClient.invalidateQueries({
          queryKey: procurementKeys.returnsDetail(variables.entity_id),
        });
      }
    },
  });
};

export const useUpdateWorkflowStatus = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      statusId,
      data,
    }: {
      statusId: string;
      data: {
        status?: string;
        current_step?: string;
        progress_percentage?: number;
        error_message?: string;
        metadata?: Record<string, any>;
      };
    }) => procurementService.updateWorkflowStatus(statusId, data),
    onSuccess: () => {
      // Invalidate all workflow status queries to refresh
      queryClient.invalidateQueries({ queryKey: [...procurementKeys.all, 'workflow-status'] });
    },
  });
};

export const usePerformWorkflowAction = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      statusId,
      data,
    }: {
      statusId: string;
      data: {
        action: string;
        comments?: string;
        metadata?: Record<string, any>;
      };
    }) => procurementService.performWorkflowAction(statusId, data),
    onSuccess: () => {
      // Invalidate all workflow status queries and related entities
      queryClient.invalidateQueries({ queryKey: [...procurementKeys.all, 'workflow-status'] });
      queryClient.invalidateQueries({ queryKey: procurementKeys.requisitions() });
      queryClient.invalidateQueries({ queryKey: procurementKeys.grns() });
      queryClient.invalidateQueries({ queryKey: procurementKeys.returns() });
    },
  });
};

// Email Notification Hooks
export const useSendNotification = () => {
  return useMutation({
    mutationFn: (data: {
      template_name: string;
      recipients: Array<{
        type: string;
        identifier: string;
        name?: string;
      }>;
      subject: string;
      variables: Record<string, any>;
      priority?: string;
      send_immediately?: boolean;
      scheduled_at?: string;
    }) => procurementService.sendNotification(data),
  });
};

export const useNotificationStatus = (notificationId: string, enabled: boolean = true) => {
  return useQuery({
    queryKey: [...procurementKeys.all, 'notification-status', notificationId] as const,
    queryFn: () => procurementService.getNotificationStatus(notificationId),
    enabled: enabled && !!notificationId,
    refetchInterval: data => {
      // Auto-refresh if notification is still pending
      const isPending = data?.status === 'pending';
      return isPending ? 5000 : false; // 5 seconds
    },
  });
};

export const useNotificationTemplates = (entityType?: string) => {
  return useQuery({
    queryKey: [...procurementKeys.all, 'notification-templates', entityType] as const,
    queryFn: () => procurementService.getNotificationTemplates(entityType),
    staleTime: 10 * 60 * 1000, // 10 minutes
  });
};

// Approval Workflow Hooks
export const useApprovalWorkflows = (entityType?: string) => {
  return useQuery({
    queryKey: [...procurementKeys.all, 'approval-workflows', entityType] as const,
    queryFn: () => procurementService.getApprovalWorkflows(entityType),
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
};

export const useCreateApprovalWorkflow = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: {
      name: string;
      entity_type: string;
      trigger_conditions: any[];
      approval_steps: any[];
      notification_settings: any;
      escalation_rules?: any[];
    }) => procurementService.createApprovalWorkflow(data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: [...procurementKeys.all, 'approval-workflows', variables.entity_type],
      });
      queryClient.invalidateQueries({
        queryKey: [...procurementKeys.all, 'approval-workflows'],
      });
    },
  });
};

export const useUpdateApprovalWorkflow = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) =>
      procurementService.updateApprovalWorkflow(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [...procurementKeys.all, 'approval-workflows'] });
    },
  });
};

export const useActivateApprovalWorkflow = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => procurementService.activateApprovalWorkflow(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [...procurementKeys.all, 'approval-workflows'] });
    },
  });
};

export const useDeactivateApprovalWorkflow = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => procurementService.deactivateApprovalWorkflow(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [...procurementKeys.all, 'approval-workflows'] });
    },
  });
};

// Auto Status Update Hooks
export const useAutoStatusConfigs = (entityType?: string) => {
  return useQuery({
    queryKey: [...procurementKeys.all, 'auto-status-configs', entityType] as const,
    queryFn: () => procurementService.getAutoStatusConfigs(entityType),
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
};

export const useCreateAutoStatusConfig = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: {
      entity_type: string;
      trigger_event: string;
      conditions: any[];
      target_status: string;
      additional_actions?: any[];
    }) => procurementService.createAutoStatusConfig(data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: [...procurementKeys.all, 'auto-status-configs', variables.entity_type],
      });
      queryClient.invalidateQueries({
        queryKey: [...procurementKeys.all, 'auto-status-configs'],
      });
    },
  });
};

export const useUpdateAutoStatusConfig = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) =>
      procurementService.updateAutoStatusConfig(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [...procurementKeys.all, 'auto-status-configs'] });
    },
  });
};

export const useTriggerAutoStatusUpdate = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      entityType,
      entityId,
      event,
      data,
    }: {
      entityType: string;
      entityId: number;
      event: string;
      data?: any;
    }) => procurementService.triggerAutoStatusUpdate(entityType, entityId, event, data),
    onSuccess: (_, variables) => {
      // Invalidate the specific entity to show updated status
      if (variables.entityType === 'requisition') {
        queryClient.invalidateQueries({
          queryKey: procurementKeys.requisitionsDetail(variables.entityId),
        });
        queryClient.invalidateQueries({ queryKey: procurementKeys.requisitions() });
      } else if (variables.entityType === 'grn') {
        queryClient.invalidateQueries({ queryKey: procurementKeys.grnsDetail(variables.entityId) });
        queryClient.invalidateQueries({ queryKey: procurementKeys.grns() });
      } else if (variables.entityType === 'return') {
        queryClient.invalidateQueries({
          queryKey: procurementKeys.returnsDetail(variables.entityId),
        });
        queryClient.invalidateQueries({ queryKey: procurementKeys.returns() });
      }
      // Also invalidate workflow status
      queryClient.invalidateQueries({
        queryKey: [
          ...procurementKeys.all,
          'workflow-status',
          variables.entityType,
          variables.entityId,
        ],
      });
    },
  });
};

// Workflow Analytics Hooks
export const useWorkflowMetricsForProcurement = (params: {
  entity_type?: string;
  period_start: string;
  period_end: string;
}) => {
  return useQuery({
    queryKey: [...procurementKeys.all, 'workflow-metrics', params] as const,
    queryFn: () => procurementService.getWorkflowMetricsForProcurement(params),
    enabled: !!params.period_start && !!params.period_end,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
};

export const useApprovalBottlenecks = (params: { entity_type?: string; days?: number }) => {
  return useQuery({
    queryKey: [...procurementKeys.all, 'approval-bottlenecks', params] as const,
    queryFn: () => procurementService.getApprovalBottlenecks(params),
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
};

// Automation Integration Hooks
export const useConnectToAutomationWorkflow = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: {
      entity_type: string;
      entity_id: number;
      automation_template_id: number;
      trigger_data: Record<string, any>;
    }) => procurementService.connectToAutomationWorkflow(data),
    onSuccess: (_, variables) => {
      // Invalidate automation workflow status for this entity
      queryClient.invalidateQueries({
        queryKey: [
          ...procurementKeys.all,
          'automation-status',
          variables.entity_type,
          variables.entity_id,
        ],
      });
      // Also invalidate the entity itself
      if (variables.entity_type === 'requisition') {
        queryClient.invalidateQueries({
          queryKey: procurementKeys.requisitionsDetail(variables.entity_id),
        });
      } else if (variables.entity_type === 'grn') {
        queryClient.invalidateQueries({
          queryKey: procurementKeys.grnsDetail(variables.entity_id),
        });
      } else if (variables.entity_type === 'return') {
        queryClient.invalidateQueries({
          queryKey: procurementKeys.returnsDetail(variables.entity_id),
        });
      }
    },
  });
};

export const useAutomationWorkflowStatus = (
  entityType: string,
  entityId: number,
  enabled: boolean = true
) => {
  return useQuery({
    queryKey: [...procurementKeys.all, 'automation-status', entityType, entityId] as const,
    queryFn: () => procurementService.getAutomationWorkflowStatus(entityType, entityId),
    enabled: enabled && !!entityType && !!entityId,
    refetchInterval: data => {
      // Auto-refresh if automation is still running
      const isActive = data?.status === 'running' || data?.status === 'queued';
      return isActive ? 10000 : false; // 10 seconds
    },
  });
};

export const useCancelAutomationWorkflow = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ entityType, entityId }: { entityType: string; entityId: number }) =>
      procurementService.cancelAutomationWorkflow(entityType, entityId),
    onSuccess: (_, variables) => {
      // Invalidate automation workflow status for this entity
      queryClient.invalidateQueries({
        queryKey: [
          ...procurementKeys.all,
          'automation-status',
          variables.entityType,
          variables.entityId,
        ],
      });
    },
  });
};
