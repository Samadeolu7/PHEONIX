// src/hooks/useInventory.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { inventoryService } from '../services/inventoryService';
import type {
  InventoryItem,
  InventoryStock,
  StockMovement,
  StockAdjustment,
  StockTransfer,
  StockAdjustmentRequest,
  StockTransferRequest,
  InventoryCategory,
  Location,
  CreateInventoryItem,
  CreateLocation,
  CreateInventoryCategory,
  PaginationParams,
} from '../types/inventory';

// Query Keys
export const inventoryKeys = {
  all: ['inventory'] as const,

  // Items
  items: () => [...inventoryKeys.all, 'items'] as const,
  item: (id: number) => [...inventoryKeys.items(), id] as const,
  itemsList: (params?: any) => [...inventoryKeys.items(), 'list', params] as const,

  // Stock Levels
  stockLevels: () => [...inventoryKeys.all, 'stock-levels'] as const,
  stockLevel: (params?: any) => [...inventoryKeys.stockLevels(), params] as const,
  itemStockLevels: (itemId: number) => [...inventoryKeys.stockLevels(), 'item', itemId] as const,

  // Movements
  movements: () => [...inventoryKeys.all, 'movements'] as const,
  movementsList: (params?: any) => [...inventoryKeys.movements(), 'list', params] as const,
  itemMovements: (itemId: number) => [...inventoryKeys.movements(), 'item', itemId] as const,

  // Categories
  categories: () => [...inventoryKeys.all, 'categories'] as const,

  // Locations
  locations: () => [...inventoryKeys.all, 'locations'] as const,

  // Reports
  reports: () => [...inventoryKeys.all, 'reports'] as const,
  valuationReport: (params?: any) => [...inventoryKeys.reports(), 'valuation', params] as const,
};

// ============= INVENTORY ITEMS HOOKS =============

export const useInventoryItems = (params?: {
  search?: string;
  page?: number;
  ordering?: string;
}) => {
  return useQuery({
    queryKey: inventoryKeys.itemsList(params),
    queryFn: () => inventoryService.getItems(params),
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
};

export const useInventoryItem = (id: number, enabled: boolean = true) => {
  return useQuery({
    queryKey: inventoryKeys.item(id),
    queryFn: () => inventoryService.getItem(id),
    enabled: enabled && !!id,
  });
};

export const useCreateInventoryItem = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateInventoryItem) => inventoryService.createItem(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: inventoryKeys.items() });
    },
  });
};

export const useUpdateInventoryItem = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<InventoryItem> }) =>
      inventoryService.updateItem(id, data),
    onSuccess: (updatedItem, { id }) => {
      queryClient.setQueryData(inventoryKeys.item(id), updatedItem);
      queryClient.invalidateQueries({ queryKey: inventoryKeys.items() });
      queryClient.invalidateQueries({ queryKey: inventoryKeys.stockLevels() });
    },
  });
};

export const useDeleteInventoryItem = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: number) => inventoryService.deleteItem(id),
    onSuccess: (_, deletedId) => {
      queryClient.removeQueries({ queryKey: inventoryKeys.item(deletedId) });
      queryClient.invalidateQueries({ queryKey: inventoryKeys.items() });
      queryClient.invalidateQueries({ queryKey: inventoryKeys.stockLevels() });
    },
  });
};

// ============= STOCK LEVELS HOOKS =============

export const useStockLevels = (params?: { page?: number; ordering?: string; search?: string }) => {
  return useQuery({
    queryKey: inventoryKeys.stockLevel(params),
    queryFn: () => inventoryService.getStockLevels(params),
    staleTime: 30 * 1000, // 30 seconds (stock levels change frequently)
  });
};

export const useItemStockLevels = (itemId: number, enabled: boolean = true) => {
  return useQuery({
    queryKey: inventoryKeys.itemStockLevels(itemId),
    queryFn: () => inventoryService.getItemStockLevels(itemId),
    enabled: enabled && !!itemId,
    staleTime: 30 * 1000, // 30 seconds
  });
};

// ============= STOCK MOVEMENTS HOOKS =============

export const useStockMovements = (params?: {
  page?: number;
  ordering?: string;
  search?: string;
}) => {
  return useQuery({
    queryKey: inventoryKeys.movementsList(params),
    queryFn: () => inventoryService.getMovements(params),
    staleTime: 30 * 1000, // 30 seconds
  });
};

export const useItemMovements = (itemId: number, enabled: boolean = true) => {
  return useQuery({
    queryKey: inventoryKeys.itemMovements(itemId),
    queryFn: () => inventoryService.getItemMovements(itemId),
    enabled: enabled && !!itemId,
    staleTime: 30 * 1000, // 30 seconds
  });
};

// ============= STOCK ADJUSTMENTS & TRANSFERS HOOKS =============

export const useStockAdjustments = (params?: {
  search?: string;
  page?: number;
  ordering?: string;
  status?: string;
  adjustment_type?: string;
}) => {
  return useQuery({
    queryKey: ['inventory', 'stock-adjustments', params],
    queryFn: () => inventoryService.getStockAdjustments(params),
    staleTime: 30000, // 30 seconds
    meta: {
      context: 'fetch-stock-adjustments',
      errorMessage: 'Failed to fetch stock adjustments',
    },
  });
};

export const useStockAdjustment = (id: number) => {
  return useQuery({
    queryKey: ['inventory', 'stock-adjustments', id],
    queryFn: () => inventoryService.getStockAdjustment(id),
    enabled: !!id,
    staleTime: 30000, // 30 seconds
    meta: {
      context: 'fetch-stock-adjustment',
      errorMessage: 'Failed to fetch stock adjustment details',
    },
  });
};

export const useApproveStockAdjustment = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: ['inventory', 'stock-adjustments', 'approve'],
    mutationFn: ({ id, data }: { id: number; data: StockAdjustmentRequest }) =>
      inventoryService.approveStockAdjustment(id, data),
    onSuccess: (_, { id }) => {
      // Invalidate and refetch the specific adjustment
      queryClient.invalidateQueries({ queryKey: ['inventory', 'stock-adjustments', id] });
      // Invalidate the list to update counts and status
      queryClient.invalidateQueries({ queryKey: ['inventory', 'stock-adjustments'] });
      // Invalidate stock levels as they may have changed
      queryClient.invalidateQueries({ queryKey: inventoryKeys.stockLevels() });
    },
    meta: {
      context: 'approve-stock-adjustment',
      successMessage: 'Stock adjustment approved successfully',
      errorMessage: 'Failed to approve stock adjustment',
      operationId: 'approve-stock-adjustment',
      disableButtons: ['approve-btn', 'reject-btn'],
    },
  });
};

export const useRejectStockAdjustment = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: ['inventory', 'stock-adjustments', 'reject'],
    mutationFn: ({ id, data }: { id: number; data: StockAdjustmentRequest }) =>
      inventoryService.rejectStockAdjustment(id, data),
    onSuccess: (_, { id }) => {
      // Invalidate and refetch the specific adjustment
      queryClient.invalidateQueries({ queryKey: ['inventory', 'stock-adjustments', id] });
      // Invalidate the list to update counts and status
      queryClient.invalidateQueries({ queryKey: ['inventory', 'stock-adjustments'] });
    },
    meta: {
      context: 'reject-stock-adjustment',
      successMessage: 'Stock adjustment rejected successfully',
      errorMessage: 'Failed to reject stock adjustment',
      operationId: 'reject-stock-adjustment',
      disableButtons: ['approve-btn', 'reject-btn'],
    },
  });
};

export const useExecuteStockAdjustment = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: ['inventory', 'stock-adjustments', 'execute'],
    mutationFn: ({ id, data }: { id: number; data: StockAdjustmentRequest }) =>
      inventoryService.executeStockAdjustment(id, data),
    onSuccess: (_, { id }) => {
      // Invalidate and refetch the specific adjustment
      queryClient.invalidateQueries({ queryKey: ['inventory', 'stock-adjustments', id] });
      // Invalidate the list to update counts and status
      queryClient.invalidateQueries({ queryKey: ['inventory', 'stock-adjustments'] });
      // Invalidate stock levels as they will have changed after execution
      queryClient.invalidateQueries({ queryKey: inventoryKeys.stockLevels() });
      // Invalidate stock movements as a new movement will be created
      queryClient.invalidateQueries({ queryKey: inventoryKeys.movements() });
    },
    meta: {
      context: 'execute-stock-adjustment',
      successMessage: 'Stock adjustment executed successfully',
      errorMessage: 'Failed to execute stock adjustment',
      operationId: 'execute-stock-adjustment',
      disableButtons: ['execute-btn'],
    },
  });
};

export const useCreateStockAdjustment = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: ['inventory', 'stock-adjustments', 'create'],
    mutationFn: (data: StockAdjustmentRequest) => inventoryService.createStockAdjustment(data),
    onSuccess: () => {
      // Invalidate stock adjustments list to show the new adjustment
      queryClient.invalidateQueries({ queryKey: ['inventory', 'stock-adjustments'] });
      // Also invalidate stock levels and movements as they may be affected
      queryClient.invalidateQueries({ queryKey: inventoryKeys.stockLevels() });
      queryClient.invalidateQueries({ queryKey: inventoryKeys.movements() });
    },
    meta: {
      context: 'create-stock-adjustment',
      successMessage: 'Stock adjustment created successfully',
      errorMessage: 'Failed to create stock adjustment',
      operationId: 'create-stock-adjustment',
      disableButtons: ['create-adjustment-btn', 'submit-adjustment-btn'],
    },
  });
};

export const useCreateStockTransfer = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: ['inventory', 'stock-transfers', 'create'],
    mutationFn: (data: StockTransferRequest) => inventoryService.createStockTransfer(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: inventoryKeys.stockLevels() });
      queryClient.invalidateQueries({ queryKey: inventoryKeys.movements() });
    },
    meta: {
      context: 'create-stock-transfer',
      successMessage: 'Stock transfer created successfully',
      errorMessage: 'Failed to create stock transfer',
      operationId: 'create-stock-transfer',
      disableButtons: ['create-transfer-btn', 'submit-transfer-btn'],
    },
  });
};

// ============= CATEGORIES HOOKS =============

export const useInventoryCategories = (params?: {
  search?: string;
  page?: number;
  ordering?: string;
}) => {
  return useQuery({
    queryKey: inventoryKeys.categories(),
    queryFn: () => inventoryService.getCategories(params),
    staleTime: 10 * 60 * 1000, // 10 minutes
  });
};

export const useCreateInventoryCategory = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateInventoryCategory) => inventoryService.createCategory(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: inventoryKeys.categories() });
    },
  });
};

// ============= LOCATIONS HOOKS =============

export const useInventoryLocations = (params?: {
  search?: string;
  page?: number;
  ordering?: string;
}) => {
  return useQuery({
    queryKey: inventoryKeys.locations(),
    queryFn: () => inventoryService.getLocations(params),
    staleTime: 10 * 60 * 1000, // 10 minutes
  });
};

// Simple hook for getting all locations as array (for dropdowns, etc.)
export const useInventoryLocationsList = () => {
  return useQuery({
    queryKey: [...inventoryKeys.locations(), 'all'],
    queryFn: () => inventoryService.getAllLocations(),
    staleTime: 10 * 60 * 1000, // 10 minutes
  });
};

// Locations across every branch of the tenant — for the stock transfer
// "To Location" picker, since a transfer's destination may be in any branch.
export const useTransferDestinations = () => {
  return useQuery({
    queryKey: [...inventoryKeys.locations(), 'transfer-destinations'],
    queryFn: () => inventoryService.getTransferDestinations(),
    staleTime: 5 * 60 * 1000,
  });
};

export const useInventoryLocation = (id: number, enabled: boolean = true) => {
  return useQuery({
    queryKey: [...inventoryKeys.locations(), id],
    queryFn: () => inventoryService.getLocation(id),
    enabled: enabled && !!id,
  });
};

export const useCreateInventoryLocation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateLocation) => inventoryService.createLocation(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: inventoryKeys.locations() });
    },
  });
};

export const useUpdateInventoryLocation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<CreateLocation> }) =>
      inventoryService.updateLocation(id, data),
    onSuccess: (updatedLocation, { id }) => {
      queryClient.setQueryData([...inventoryKeys.locations(), id], updatedLocation);
      queryClient.invalidateQueries({ queryKey: inventoryKeys.locations() });
    },
  });
};

export const useDeleteInventoryLocation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: number) => inventoryService.deleteLocation(id),
    onSuccess: (_, deletedId) => {
      queryClient.removeQueries({ queryKey: [...inventoryKeys.locations(), deletedId] });
      queryClient.invalidateQueries({ queryKey: inventoryKeys.locations() });
    },
  });
};

// ============= REPORTS HOOKS =============

export const useValuationReport = (params?: {
  location_id?: number;
  category_id?: number;
  date?: string;
  include_inactive?: boolean;
}) => {
  return useQuery({
    queryKey: inventoryKeys.valuationReport(params),
    queryFn: () => inventoryService.getValuationReport(params),
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
};

// Note: Valuation report functionality not yet implemented in the service
// export const useValuationReport = (params?: {
//   location?: number;
//   category?: number;
//   date?: string;
// }) => {
//   return useQuery({
//     queryKey: inventoryKeys.valuationReport(params),
//     queryFn: () => inventoryService.getValuationReport(params),
//     staleTime: 5 * 60 * 1000, // 5 minutes
//   });
// };
