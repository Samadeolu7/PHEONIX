// src/services/inventoryService.ts
import { api } from './api';
import { ErrorHandler } from '../utils/errorHandler';
import {
  InventoryItem,
  InventoryStock,
  StockMovement,
  InventoryCategory,
  Location,
  StockAdjustmentRequest,
  StockAdjustment,
  StockTransferRequest,
  StockTransfer,
  PaginationParams,
  PaginatedResponse,
  CreateInventoryItem,
  CreateLocation,
  CreateInventoryCategory,
  MovementType,
  AdjustmentType,
  AdjustmentStatus,
  TransferStatus,
} from '../types/inventory';

// Interfaces are now imported from types/inventory.ts

// Special Allocation/Redemption Types - Updated to match backend
export interface AllocationRedemption {
  id: number;
  redemption_number: string;
  allocation: number;
  allocation_number: string;
  client_name: string;
  redemption_date?: string; // Date
  redemption_time: string; // Date-time
  amount_redeemed?: string; // Decimal string
  location: number;
  location_name: string;
  authorized_by: number;
  authorized_by_name: string;
  status?: 'pending' | 'completed' | 'cancelled';
  asset?: number | null;
  meter_reading?: string | null; // Decimal string - Odometer or hour meter reading
  is_posted: boolean;
  posted_at: string | null;
  transaction_entry?: number | null;
  items: RedemptionItem[];
  notes?: string;
  created_at: string;
  updated_at: string;
}

export interface Allocation {
  id: number;
  allocation_number: string;
  client: number;
  client_name: string;
  client_code: string;
  invoice: number; // Invoice that funded this allocation
  allocation_date?: string; // Date
  allocation_type: 'monetary' | 'item_specific' | 'item_category';
  allocated_amount?: string; // Decimal string - Total monetary value allocated
  consumed_amount: string; // Decimal string - Amount already used
  remaining_amount: string;
  valid_from?: string; // Date
  valid_until?: string | null; // Date
  status:
    | 'pending_payment'
    | 'partial_access'
    | 'active'
    | 'partially_used'
    | 'exhausted'
    | 'expired'
    | 'cancelled';
  is_valid_now: string;
  linked_asset?: number | null;
  usage_rules?: any; // {"max_per_transaction": 500.00,"max_daily": 1000.00,"allowed_days": ["monday", "tuesday"],"require_approval_above": 1000.00}
  notes?: string;
  items: AllocationItem[];
  created_at: string;
  updated_at: string;
}

export interface RedemptionItem {
  // Will be defined based on backend schema when available
  id?: number;
  item_id: number;
  quantity: string;
  amount: string;
}

export interface AllocationItem {
  // Will be defined based on backend schema when available
  id?: number;
  item_id: number;
  allocated_quantity: string;
  consumed_quantity: string;
}

export interface CreateRedemptionData {
  allocation: number;
  redemption_date?: string; // Date
  amount_redeemed?: string; // Decimal string
  location: number;
  authorized_by: number;
  status?: 'pending' | 'completed' | 'cancelled';
  asset?: number | null;
  meter_reading?: string | null; // Decimal string - Odometer or hour meter reading
  transaction_entry?: number | null;
  notes?: string;
}

// Stock Adjustment and Transfer interfaces are now imported from types/inventory.ts

// ============= SALES ORDER TYPES =============

export type SalesOrderStatus =
  | 'draft'
  | 'pending_approval'
  | 'approved'
  | 'rejected'
  | 'confirmed'
  | 'processing'
  | 'partially_delivered'
  | 'shipped'
  | 'delivered'
  | 'cancelled';

export interface SalesOrderItem {
  id: number;
  item: number;
  item_name: string;
  item_sku?: string;
  sku?: string;
  description?: string;
  quantity: number;
  unit_price: string;
  discount?: string;
  total_price: string;
  quantity_delivered?: number;
  location?: number;
  location_name?: string;
  notes?: string;
}

export interface SalesOrder {
  id: number;
  so_number: string;
  order_number?: string; // alias for backward compat
  client: number | null;
  client_name: string;
  order_date: string;
  expected_delivery_date?: string | null;
  status: SalesOrderStatus;
  subtotal?: string;
  discount?: string;
  tax_amount?: string;
  total_amount: string;
  approved_by?: number | null;
  approved_by_name?: string | null;
  approved_at?: string | null;
  approval_notes?: string | null;
  notes?: string;
  items: SalesOrderItem[];
  created_at: string;
  updated_at: string;
}

export interface SalesOrderListItem {
  id: number;
  so_number: string;
  order_number?: string; // alias
  client_name: string;
  order_date: string;
  expected_delivery_date?: string | null;
  status: SalesOrderStatus;
  total_amount: string;
  item_count?: number;
  items?: SalesOrderItem[];
}

export interface CreateSalesOrderData {
  client_name: string;
  order_date: string;
  expected_delivery_date?: string;
  notes?: string;
  items: Array<{
    item: number;
    quantity: number;
    unit_price: string;
    location?: number;
    notes?: string;
  }>;
}

export interface SalesOrdersResponse {
  count: number;
  next: string | null;
  previous: string | null;
  results: SalesOrderListItem[];
}

// Response type interfaces - using imported types where possible
export interface InventoryItemsResponse extends PaginatedResponse<InventoryItem> {}
export interface StockLevelsResponse extends PaginatedResponse<InventoryStock> {}
export interface StockMovementsResponse extends PaginatedResponse<StockMovement> {}
export interface LocationsResponse extends PaginatedResponse<Location> {}
export interface InventoryCategoriesResponse extends PaginatedResponse<InventoryCategory> {}

// ─── Write-Off Types ──────────────────────────────────────────────────────────
export type WriteOffStatus = 'pending' | 'approved' | 'rejected' | 'executed';

export interface WriteOffRequest {
  id: number;
  request_number: string;
  requested_by: number;
  requested_by_name: string;
  item: number;
  item_name: string;
  item_sku: string;
  location: number;
  location_name: string;
  quantity: string;
  unit_cost: string;
  estimated_cost: string;
  reason: string;
  notes?: string;
  status: WriteOffStatus;
  approved_by?: number | null;
  approved_by_name?: string | null;
  approved_at?: string | null;
  approval_notes?: string;
  stock_movement?: number | null;
  created_at: string;
  updated_at: string;
}

export interface CreateWriteOffData {
  item_id: number;
  location_id: number;
  quantity: string;
  unit_cost?: string;
  reason: string;
  notes?: string;
}

class InventoryService {
  // ============= INVENTORY ITEMS =============
  async getItems(params?: {
    search?: string;
    page?: number;
    page_size?: number;
    ordering?: string;
    is_active?: boolean;
    category?: number;
  }): Promise<InventoryItemsResponse> {
    const response = await api.get('/inventory/items/', { params });
    return response;
  }

  async getAllItems(params?: {
    search?: string;
    ordering?: string;
    is_active?: boolean;
    category?: number;
    page_size?: number;
  }): Promise<InventoryItem[]> {
    const all: InventoryItem[] = [];
    let page = 1;
    let hasMore = true;

    while (hasMore) {
      const response = await this.getItems({
        ...params,
        page,
        page_size: params?.page_size ?? 500,
      });
      all.push(...(response.results || []));
      hasMore = !!response.next;
      page += 1;
    }

    return all;
  }

  /**
   * Get items that need reordering (total stock <= reorder level).
   * Uses a server-side annotated query — much more efficient than
   * fetching all items and filtering client-side.
   */
  async getLowStockItems(params?: {
    search?: string;
    page?: number;
    page_size?: number;
    category?: number;
  }): Promise<InventoryItemsResponse> {
    const response = await api.get('/inventory/items/low_stock/', { params });
    return response;
  }

  async getItem(id: number): Promise<InventoryItem> {
    const response = await api.get(`/inventory/items/${id}/`);
    return response.data || response;
  }

  async createItem(data: CreateInventoryItem): Promise<InventoryItem> {
    const response = await api.post('/inventory/items/', data);
    return response.data || response;
  }

  async updateItem(id: number, data: Partial<InventoryItem>): Promise<InventoryItem> {
    const response = await api.patch(`/inventory/items/${id}/`, data);
    return response.data || response;
  }

  async replaceItem(id: number, data: CreateInventoryItem): Promise<InventoryItem> {
    const response = await api.put(`/inventory/items/${id}/`, data);
    return response.data || response;
  }

  async deleteItem(id: number): Promise<void> {
    await api.delete(`/inventory/items/${id}/`);
  }

  // ============= STOCK LEVELS =============
  async getStockLevels(params?: {
    page?: number;
    ordering?: string;
    search?: string;
  }): Promise<StockLevelsResponse> {
    const response = await api.get('/inventory/stock/', { params });
    return response;
  }

  // Note: This endpoint does not exist in the backend - removed
  // async getItemStockLevels(itemId: number): Promise<StockLevel[]>

  // ============= STOCK MOVEMENTS =============
  async getMovements(params?: {
    page?: number;
    ordering?: string;
    search?: string;
  }): Promise<StockMovementsResponse> {
    // Updated endpoint URL to match backend
    const response = await api.get('/inventory/movements/', { params });
    return response;
  }

  // ============= ITEM-SPECIFIC STOCK LEVELS =============
  async getItemStockLevels(
    itemId: number,
    params?: PaginationParams
  ): Promise<PaginatedResponse<InventoryStock>> {
    return ErrorHandler.withRetry(async () => {
      try {
        const response = await api.get(`/inventory/items/${itemId}/stock/`, { params });

        // Handle empty state - ensure we always return a valid paginated response
        if (!response || typeof response !== 'object') {
          return {
            count: 0,
            next: null,
            previous: null,
            results: [],
          };
        }

        // Ensure the response has the expected structure
        return {
          count: response.count || 0,
          next: response.next || null,
          previous: response.previous || null,
          results: Array.isArray(response.results) ? response.results : [],
        };
      } catch (error: any) {
        // Handle 404 errors (item not found) by returning empty results
        const classifiedError = ErrorHandler.classifyError(error);
        if (classifiedError.code === 'NOT_FOUND') {
          return {
            count: 0,
            next: null,
            previous: null,
            results: [],
          };
        }
        // Re-throw other errors to be handled by retry logic
        throw error;
      }
    }, 'fetch-stock-levels');
  }

  // ============= STOCK MOVEMENTS =============
  async getItemMovements(
    itemId: number,
    params?: PaginationParams
  ): Promise<PaginatedResponse<StockMovement>> {
    return ErrorHandler.withRetry(async () => {
      try {
        const response = await api.get(`/inventory/items/${itemId}/movements/`, { params });

        // Handle empty state - ensure we always return a valid paginated response
        if (!response || typeof response !== 'object') {
          return {
            count: 0,
            next: null,
            previous: null,
            results: [],
          };
        }

        // Ensure the response has the expected structure
        return {
          count: response.count || 0,
          next: response.next || null,
          previous: response.previous || null,
          results: Array.isArray(response.results) ? response.results : [],
        };
      } catch (error: any) {
        // Handle 404 errors (item not found) by returning empty results
        const classifiedError = ErrorHandler.classifyError(error);
        if (classifiedError.code === 'NOT_FOUND') {
          return {
            count: 0,
            next: null,
            previous: null,
            results: [],
          };
        }
        // Re-throw other errors to be handled by retry logic
        throw error;
      }
    }, 'fetch-movements');
  }

  // ============= STOCK ADJUSTMENTS =============
  async getStockAdjustments(params?: {
    search?: string;
    page?: number;
    ordering?: string;
    status?: string;
    adjustment_type?: string;
  }): Promise<{
    count: number;
    next: string | null;
    previous: string | null;
    results: StockAdjustment[];
  }> {
    return ErrorHandler.withRetry(async () => {
      const response = await api.get('/inventory/adjustments/', { params });
      return response.data || response;
    }, 'get-stock-adjustments');
  }

  async getStockAdjustment(id: number): Promise<StockAdjustment> {
    return ErrorHandler.withRetry(async () => {
      const response = await api.get(`/inventory/adjustments/${id}/`);
      return response.data || response;
    }, 'get-stock-adjustment');
  }

  async approveStockAdjustment(id: number, data: StockAdjustmentRequest): Promise<StockAdjustment> {
    return ErrorHandler.withRetry(async () => {
      const response = await api.post(`/inventory/adjustments/${id}/approve/`, data);

      // Handle the specific response structure: {success: true, message: "...", data: {...}}
      if (response && typeof response === 'object' && response.success === true && response.data) {
        return response.data;
      }

      return response.data || response;
    }, 'approve-stock-adjustment');
  }

  async rejectStockAdjustment(id: number, data: StockAdjustmentRequest): Promise<StockAdjustment> {
    return ErrorHandler.withRetry(async () => {
      const response = await api.post(`/inventory/adjustments/${id}/reject/`, data);

      // Handle the specific response structure: {success: true, message: "...", data: {...}}
      if (response && typeof response === 'object' && response.success === true && response.data) {
        return response.data;
      }

      return response.data || response;
    }, 'reject-stock-adjustment');
  }

  async executeStockAdjustment(id: number, data: StockAdjustmentRequest): Promise<StockAdjustment> {
    return ErrorHandler.withRetry(async () => {
      const response = await api.post(`/inventory/adjustments/${id}/execute/`, data);

      // Handle the specific response structure: {success: true, message: "...", data: {...}}
      // If the response has a success field and it's true, extract the data
      if (response && typeof response === 'object' && response.success === true && response.data) {
        return response.data;
      }

      // Fallback to the original response handling
      return response.data || response;
    }, 'execute-stock-adjustment');
  }

  async createStockAdjustment(data: StockAdjustmentRequest): Promise<StockAdjustment> {
    return ErrorHandler.withRetry(async () => {
      const response = await api.post('/inventory/adjustments/', data);
      return response.data || response;
    }, 'create-stock-adjustment');
  }

  // ============= STOCK TRANSFERS =============
  async getStockTransfers(params?: {
    search?: string;
    status?: string;
    page?: number;
    page_size?: number;
    ordering?: string;
  }): Promise<{ results: StockTransfer[]; count: number }> {
    const response = await api.get('/inventory/transfers/', { params });
    return response.data || response;
  }

  async getStockTransfer(id: number): Promise<StockTransfer> {
    const response = await api.get(`/inventory/transfers/${id}/`);
    return response.data || response;
  }

  async createStockTransfer(data: StockTransferRequest): Promise<StockTransfer> {
    return ErrorHandler.withRetry(async () => {
      const response = await api.post('/inventory/transfers/', data);
      return response.data || response;
    }, 'create-stock-transfer');
  }

  async approveStockTransfer(id: number, notes?: string): Promise<StockTransfer> {
    const response = await api.post(`/inventory/transfers/${id}/approve/`, {
      notes,
    });
    return response.data || response;
  }

  async rejectStockTransfer(id: number, notes?: string): Promise<StockTransfer> {
    const response = await api.post(`/inventory/transfers/${id}/reject/`, {
      notes,
    });
    return response.data || response;
  }

  /** Mark an approved transfer as dispatched (in transit). Requires approval-tier authority. */
  async dispatchStockTransfer(id: number, notes?: string): Promise<StockTransfer> {
    const response = await api.post(`/inventory/transfers/${id}/dispatch/`, {
      notes,
    });
    return response.data || response;
  }

  /**
   * Destination confirms receipt. Omit actualQuantityReceived to acknowledge
   * the full dispatched quantity; pass a lower value for a short receipt
   * (posts a shrinkage entry automatically).
   */
  async acknowledgeStockTransfer(
    id: number,
    actualQuantityReceived?: string,
    notes?: string
  ): Promise<StockTransfer> {
    const response = await api.post(`/inventory/transfers/${id}/acknowledge/`, {
      actual_quantity_received: actualQuantityReceived,
      notes,
    });
    return response.data || response;
  }

  /** Destination flags a problem with the delivery instead of acknowledging it. Terminal for now. */
  async disputeStockTransfer(id: number, reason: string): Promise<StockTransfer> {
    const response = await api.post(`/inventory/transfers/${id}/dispute/`, {
      reason,
    });
    return response.data || response;
  }

  /**
   * All active locations in the tenant, across every branch — for the
   * transfer-creation form's "To Location" picker. Unlike the standard
   * location list (branch-scoped), a transfer's destination may be in any
   * branch.
   */
  async getTransferDestinations(): Promise<
    { id: number; name: string; code: string; branch: number | null; branch_name: string | null }[]
  > {
    const response = await api.get('/inventory/transfers/available-destinations/');
    return response.data || response;
  }

  // ============= CATEGORIES =============
  async getCategories(params?: {
    search?: string;
    page?: number;
    ordering?: string;
  }): Promise<InventoryCategoriesResponse> {
    const response = await api.get('/inventory/categories/', { params });
    return response;
  }

  async createCategory(data: CreateInventoryCategory): Promise<InventoryCategory> {
    const response = await api.post('/inventory/categories/', data);
    return response.data || response;
  }

  // ============= LOCATIONS =============
  async getLocations(params?: {
    search?: string;
    page?: number;
    page_size?: number;
    ordering?: string;
  }): Promise<LocationsResponse> {
    const response = await api.get('/inventory/locations/', { params });
    return response;
  }

  async getAllLocations(params?: {
    search?: string;
    ordering?: string;
    page_size?: number;
  }): Promise<Location[]> {
    const all: Location[] = [];
    let page = 1;
    let hasMore = true;

    while (hasMore) {
      const response = await this.getLocations({
        ...params,
        page,
        page_size: params?.page_size ?? 500,
      });
      all.push(...(response.results || []));
      hasMore = !!response.next;
      page += 1;
    }

    return all;
  }

  async getLocation(id: number): Promise<Location> {
    const response = await api.get(`/inventory/locations/${id}/`);
    return response.data || response;
  }

  async createLocation(data: CreateLocation): Promise<Location> {
    const response = await api.post('/inventory/locations/', data);
    return response.data || response;
  }

  async updateLocation(id: number, data: Partial<CreateLocation>): Promise<Location> {
    const response = await api.patch(`/inventory/locations/${id}/`, data);
    return response.data || response;
  }

  async deleteLocation(id: number): Promise<void> {
    await api.delete(`/inventory/locations/${id}/`);
  }

  // ============= SPECIAL ALLOCATION/REDEMPTION FEATURES =============
  async getAllocations(params?: {
    search?: string;
    status?: string;
    page?: number;
    page_size?: number;
  }): Promise<{
    count: number;
    next: string | null;
    previous: string | null;
    results: Allocation[];
  }> {
    const response = await api.get('/inventory/allocations/', { params });
    return response.data || response;
  }

  async getRecentRedemptions(
    limit: number = 10
  ): Promise<{ success: boolean; data: AllocationRedemption[] }> {
    const response = await api.get(`/inventory/redemptions/recent/?limit=${limit}`);
    return response;
  }

  async searchAllocations(query: string): Promise<{ success: boolean; data: Allocation[] }> {
    const response = await api.get(
      `/inventory/allocations/search/?query=${encodeURIComponent(query)}`
    );
    return response;
  }

  async getAllocation(id: number): Promise<Allocation> {
    const response = await api.get(`/inventory/allocations/${id}/`);
    return response.data || response;
  }

  async getAllocationItems(id: number): Promise<{ success: boolean; data: AllocationItem[] }> {
    const response = await api.get(`/inventory/allocations/${id}/items/`);
    return response;
  }

  async processRedemption(
    data: CreateRedemptionData
  ): Promise<{ success: boolean; data: AllocationRedemption }> {
    const response = await api.post('/inventory/redemptions/redeem/', data);
    return response;
  }

  async getRedemptions(params?: {
    search?: string;
    status?: string;
    page?: number;
    page_size?: number;
  }): Promise<{
    count: number;
    next: string | null;
    previous: string | null;
    results: AllocationRedemption[];
  }> {
    const response = await api.get('/inventory/redemptions/', { params });
    return response.data || response;
  }

  async getRedemption(id: number): Promise<AllocationRedemption> {
    const response = await api.get(`/inventory/redemptions/${id}/`);
    return response.data || response;
  }

  // ============= SALES ORDERS =============
  async getSalesOrders(params?: {
    search?: string;
    status?: SalesOrderStatus;
    page?: number;
    page_size?: number;
    ordering?: string;
  }): Promise<SalesOrdersResponse> {
    const response = await api.get('/inventory/sales-orders/', { params });
    return response.data || response;
  }

  async getSalesOrder(id: number): Promise<SalesOrder> {
    const response = await api.get(`/inventory/sales-orders/${id}/`);
    return response.data || response;
  }

  async createSalesOrder(data: CreateSalesOrderData): Promise<SalesOrder> {
    const response = await api.post('/inventory/sales-orders/', data);
    return response.data || response;
  }

  async updateSalesOrder(
    id: number,
    data: Partial<CreateSalesOrderData & { status: SalesOrderStatus }>
  ): Promise<SalesOrder> {
    const response = await api.patch(`/inventory/sales-orders/${id}/`, data);
    return response.data || response;
  }

  async confirmSalesOrder(id: number): Promise<SalesOrder> {
    const response = await api.post(`/inventory/sales-orders/${id}/confirm/`, {});
    return response.data || response;
  }

  async cancelSalesOrder(id: number, reason?: string): Promise<SalesOrder> {
    const response = await api.post(`/inventory/sales-orders/${id}/cancel/`, { reason });
    return response.data || response;
  }

  async submitSalesOrder(
    id: number
  ): Promise<{ success: boolean; requires_approval: boolean; message: string; data: SalesOrder }> {
    const response = await api.post(`/inventory/sales-orders/${id}/submit/`, {});
    return response.data || response;
  }

  async approveSalesOrder(
    id: number,
    notes?: string
  ): Promise<{ success: boolean; message: string; data: SalesOrder }> {
    const response = await api.post(`/inventory/sales-orders/${id}/approve/`, { notes });
    return response.data || response;
  }

  async rejectSalesOrder(
    id: number,
    notes?: string
  ): Promise<{ success: boolean; message: string; data: SalesOrder }> {
    const response = await api.post(`/inventory/sales-orders/${id}/reject/`, { notes });
    return response.data || response;
  }

  // ============= VALUATION REPORTS =============
  async getValuationReport(params?: {
    location_id?: number;
    category_id?: number;
    date?: string;
    include_inactive?: boolean;
  }): Promise<{
    total_value: string;
    total_items: number;
    locations: Array<{
      location_id: number;
      location_name: string;
      total_value: string;
      item_count: number;
    }>;
    categories: Array<{
      category_id: number;
      category_name: string;
      total_value: string;
      item_count: number;
    }>;
    items: Array<{
      id: number;
      name: string;
      sku: string;
      description?: string;
      category_name?: string;
      location_name?: string;
      quantity_on_hand: number;
      unit_cost: number;
      total_value: number;
      unit_of_measure: string;
      valuation_method: string;
    }>;
  }> {
    const response = await api.get('/inventory/items/valuation-report/', { params });
    return response.data || response;
  }

  // Note: This endpoint does not exist in the backend - removed
  // async getValuationReport(): Promise<ValuationReport>

  // ============= WRITE-OFF REQUESTS (INV-03) =============
  async getWriteOffs(params?: {
    status?: WriteOffStatus;
    search?: string;
    page?: number;
    page_size?: number;
  }): Promise<{
    count: number;
    next: string | null;
    previous: string | null;
    results: WriteOffRequest[];
  }> {
    const response = await api.get('/inventory/writeoffs/', { params });
    return response.data || response;
  }

  async getWriteOff(id: number): Promise<WriteOffRequest> {
    const response = await api.get(`/inventory/writeoffs/${id}/`);
    return response.data || response;
  }

  async createWriteOff(data: CreateWriteOffData): Promise<WriteOffRequest> {
    const response = await api.post('/inventory/writeoffs/', data);
    return response.data || response;
  }

  async approveWriteOff(id: number, notes?: string): Promise<WriteOffRequest> {
    const response = await api.post(`/inventory/writeoffs/${id}/approve/`, {
      approval_notes: notes ?? '',
    });
    return response.data || response;
  }

  async rejectWriteOff(id: number, notes?: string): Promise<WriteOffRequest> {
    const response = await api.post(`/inventory/writeoffs/${id}/reject/`, {
      approval_notes: notes ?? '',
    });
    return response.data || response;
  }

  async executeWriteOff(id: number): Promise<WriteOffRequest> {
    const response = await api.post(`/inventory/writeoffs/${id}/execute/`, {});
    return response.data || response;
  }
}

export const inventoryService = new InventoryService();
