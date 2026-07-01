// src/services/procurementService.ts
import { api } from './api';
import { ErrorHandler } from '../utils/errorHandler';
import { sumDecimals } from '../utils/decimal';
import {
  PurchaseRequisition,
  CreatePurchaseRequisitionData,
  UpdatePurchaseRequisitionData,
  RequisitionApprovalData,
  RequisitionFilters,
  Department,
  InventoryItem,
  WorkflowRequisitionData,
  WorkflowRequisitionResponse,
  RequisitionToPOConversionData,
  RequisitionToPOConversionResponse,
  Location,
} from '../types/procurement';
import {
  Quote,
  CreateQuoteData,
  UpdateQuoteData,
  QuoteComparison,
  QuoteComparisonResponse,
  QuoteListParams,
  QuoteSelectionData,
} from '../types/quotes';
import { PaginatedResponse } from '../types/inventory';

// Error handling types
export interface ProcurementError {
  message: string;
  code?: string;
  details?: any;
  retryable?: boolean;
}

export interface RetryConfig {
  maxRetries: number;
  baseDelay: number;
  maxDelay: number;
  backoffMultiplier: number;
}

// Default retry configuration
const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  baseDelay: 1000, // 1 second
  maxDelay: 10000, // 10 seconds
  backoffMultiplier: 2,
};

// File upload types
export interface FileUploadOptions {
  onProgress?: (progress: number) => void;
  maxSize?: number; // in bytes
  allowedTypes?: string[];
}

export interface UploadedFile {
  id: string;
  name: string;
  url: string;
  size: number;
  type: string;
  uploadedAt: string;
}

// PDF generation types
export interface PDFGenerationOptions {
  template?: 'standard' | 'detailed' | 'minimal';
  includeImages?: boolean;
  watermark?: string;
  orientation?: 'portrait' | 'landscape';
}

export interface PDFGenerationResult {
  url: string;
  filename: string;
  size: number;
  generatedAt: string;
}

// ─── Procurement Config ────────────────────────────────────────────────────────
export interface ProcurementConfig {
  id: number;
  enable_three_way_matching: boolean;
  matching_tolerance_percentage: string;
  auto_approve_within_tolerance: boolean;
  pr_prefix: string;
  po_prefix: string;
  grn_prefix: string;
  high_value_threshold?: string | null;
  default_pr_workflow?: number | null;
  default_po_workflow?: number | null;
  default_grn_workflow?: number | null;
  high_value_po_workflow?: number | null;
  created_at?: string;
  updated_at?: string;
}

export type ProcurementConfigUpdate = Partial<
  Omit<ProcurementConfig, 'id' | 'created_at' | 'updated_at'>
>;

// Three-Way Matching Types
export type ThreeWayMatchStatus = 'passed' | 'warning' | 'failed';

export interface ThreeWayMatchRequest {
  po_id: number;
  grn_id: number;
  invoice_amount?: string | null;
  invoice_items?: Array<Record<string, unknown>>;
}

export interface ThreeWayMatchResult {
  overall_status: ThreeWayMatchStatus;
  can_proceed: boolean;
  requires_approval: boolean;
  matching_results: Record<string, unknown>;
  discrepancies: Array<Record<string, unknown>>;
  report?: string;
  approver_roles?: string[];
  critical_failures?: number;
  warnings?: number;
  summary?: string;
}

// Purchase Order Types - Updated to match backend API exactly
export interface PurchaseOrderItem {
  id?: number;
  item_id: number;
  item: InventoryItem; // Use the complete InventoryItem interface
  quantity: string; // Backend uses decimal string ^-?\d{0,16}(?:\.\d{0,2})?$
  unit_price: string; // Backend uses decimal string ^-?\d{0,16}(?:\.\d{0,2})?$
  quantity_received: string; // Backend uses decimal string ^-?\d{0,16}(?:\.\d{0,2})?$
  total_amount: string; // Backend uses decimal string ^-?\d{0,16}(?:\.\d{0,2})?$
}

export interface PurchaseOrder {
  id: number;
  po_number: string;
  requisition: number | null;
  selected_quote: number | null;
  supplier: number; // Backend returns ID, not object
  supplier_name: string;
  order_date?: string; // Optional in backend schema
  expected_delivery_date: string | null;
  delivery_date: string | null;
  delivery_location: number; // Backend returns ID, not object
  location_name: string;
  contact_person?: string; // Optional, max 200 chars
  contact_phone?: string; // Optional, max 20 chars
  contact_email?: string; // Optional, email format, max 254 chars
  payment_terms: 'cash' | 'net_15' | 'net_30' | 'net_60' | 'net_90' | 'custom';
  custom_payment_terms?: string; // Optional, max 200 chars
  status:
    | 'draft'
    | 'submitted'
    | 'approved'
    | 'sent'
    | 'acknowledged'
    | 'partially_received'
    | 'received'
    | 'cancelled';
  subtotal: string; // Required decimal string ^-?\d{0,16}(?:\.\d{0,2})?$
  tax_amount?: string; // Optional decimal string ^-?\d{0,16}(?:\.\d{0,2})?$
  shipping_cost?: string; // Optional decimal string ^-?\d{0,16}(?:\.\d{0,2})?$
  discount?: string; // Optional decimal string ^-?\d{0,16}(?:\.\d{0,2})?$
  total_amount: string; // Required decimal string ^-?\d{0,16}(?:\.\d{0,2})?$
  requires_approval?: boolean; // Optional
  approved_by: number | null; // Required but can be null
  approved_by_name: string | null; // Required but can be null
  approved_at: string | null; // Required but can be null, date-time format
  acknowledged_at?: string | null; // Optional, date-time format
  supplier_po_number?: string; // Optional, max 100 chars, supplier's PO reference
  notes?: string; // Optional
  received_percentage: string; // Required decimal string ^-?\d{0,3}(?:\.\d{0,2})?$
  created_at: string; // Required date-time
  updated_at: string; // Required date-time
  items?: PurchaseOrderItem[]; // Optional, only included in detail view
}

export interface CreatePurchaseOrderData {
  requisition?: number | null;
  selected_quote?: number | null;
  supplier: number; // Required
  order_date?: string; // Optional date
  expected_delivery_date?: string | null;
  delivery_date?: string | null;
  delivery_location: number; // Required
  contact_person?: string; // Optional, max 200 chars
  contact_phone?: string; // Optional, max 20 chars
  contact_email?: string; // Optional, email format, max 254 chars
  payment_terms: 'cash' | 'net_15' | 'net_30' | 'net_60' | 'net_90' | 'custom';
  custom_payment_terms?: string; // Optional, max 200 chars
  status?:
    | 'draft'
    | 'submitted'
    | 'approved'
    | 'sent'
    | 'acknowledged'
    | 'partially_received'
    | 'received'
    | 'cancelled';
  tax_amount?: string; // Optional decimal string ^-?\d{0,16}(?:\.\d{0,2})?$
  shipping_cost?: string; // Optional decimal string ^-?\d{0,16}(?:\.\d{0,2})?$
  discount?: string; // Optional decimal string ^-?\d{0,16}(?:\.\d{0,2})?$
  requires_approval?: boolean; // Optional
  acknowledged_at?: string | null; // Optional date-time
  supplier_po_number?: string; // Optional, max 100 chars
  notes?: string; // Optional
  items: {
    item_id: number;
    quantity: string; // Backend expects decimal string ^-?\d{0,16}(?:\.\d{0,2})?$
    unit_price: string; // Backend expects decimal string ^-?\d{0,16}(?:\.\d{0,2})?$
  }[];
}

// Supplier Types - Updated to match backend API
export interface Supplier {
  id: number;
  supplier_code: string;
  name: string;
  contact_person: string;
  email: string;
  phone: string;
  address: string;
  tax_id: string;
  payment_terms: 'cash' | 'net_15' | 'net_30' | 'net_60' | 'net_90' | 'custom';
  credit_limit: string; // Decimal string
  is_active: boolean;
  metadata: any; // Additional supplier information
  created_at: string;
  updated_at: string;
}

export interface CreateSupplierData {
  name: string;
  contact_person?: string;
  email?: string;
  phone?: string;
  address?: string;
  tax_id?: string;
  payment_terms?: 'cash' | 'net_15' | 'net_30' | 'net_60' | 'net_90' | 'custom';
  credit_limit?: string;
  is_active?: boolean;
  metadata?: any;
}

// GRN Types - Updated to match backend API
export interface GRNItem {
  id?: number; // GRN item primary key
  item: number; // Backend expects 'item' field, not 'item_id'
  item_name?: string;
  item_sku?: string;
  po_item?: number | null;
  quantity_ordered?: string;
  quantity_received: string;
  quantity_accepted: string;
  quantity_rejected: string;
  unit_cost: string;
  total_cost: string;
  batch_number?: string;
  serial_number?: string;
  expiry_date?: string | null;
  condition_notes?: string;
  rejection_reason?: string;
  quality_data?: {
    condition_rating?: string;
    visual_inspection?: string;
    packaging_condition?: string;
    expiry_check?: string;
    batch_verification?: string;
    temperature_check?: string;
  };
}

export interface GoodsReceivedNote {
  id: number;
  grn_number: string;
  purchase_order: number | null;
  po_number: string | null;
  supplier: number;
  supplier_name: string;
  received_date: string;
  received_time: string;
  received_location: number;
  location_name: string;
  received_by: number;
  received_by_name: string;
  delivery_note_number: string;
  vehicle_number: string;
  driver_name: string;
  driver_phone: string;
  supplier_invoice_number: string;
  supplier_invoice_date: string | null;
  supplier_invoice_amount: string | null;
  quality_status: 'pending' | 'passed' | 'failed' | 'partial';
  inspected_by: number | null;
  inspection_notes: string;
  total_amount: string;
  is_posted: boolean;
  posted_at: string | null;
  posted_by: number | null;
  accounts_payable: number | null;
  notes: string;
  delivery_note_attachment: string | null;
  photos: any; // List of photo URLs
  items: GRNItem[];
  created_at: string;
  updated_at: string;
}

export interface CreateGRNData {
  purchase_order?: number | null;
  supplier: number;
  received_date: string;
  received_time: string;
  received_location: number;
  delivery_note_number?: string;
  vehicle_number?: string;
  driver_name?: string;
  driver_phone?: string;
  supplier_invoice_number?: string;
  supplier_invoice_date?: string | null;
  supplier_invoice_amount?: string | null;
  quality_status?: 'pending' | 'passed' | 'failed' | 'partial';
  inspected_by?: number | null;
  inspection_notes?: string;
  total_amount?: string;
  notes?: string;
  delivery_note_attachment?: string | null;
  photos?: any;
  items: GRNItem[];
}

// Purchase Returns Types - Updated to match backend API exactly
export interface PurchaseReturnItem {
  id?: number;
  grn_item_id: number;
  grn_item: {
    id: number;
    item_id: number;
    item: {
      id: number;
      name: string;
      sku: string;
    };
    quantity_received: number;
    unit_cost: string;
  };
  quantity_returned: number;
  return_reason: string;
  condition: 'good' | 'damaged' | 'defective' | 'expired' | 'wrong_item';
  return_cost: string; // Decimal string
  notes?: string;
}

export interface PurchaseReturn {
  id: number;
  return_number: string;
  grn: number;
  grn_number: string;
  supplier: number;
  supplier_name: string;
  return_date: string; // date format
  return_reason: 'damaged' | 'wrong_item' | 'defective' | 'excess' | 'quality' | 'other';
  status: 'pending' | 'approved' | 'shipped' | 'completed' | 'cancelled';
  total_amount: string; // decimal string ^-?\d{0,16}(?:\.\d{0,2})?$
  refund_method: 'credit_note' | 'cash' | 'replacement';
  refund_received: boolean;
  refund_date: string | null; // date format
  is_posted: boolean;
  posted_at: string | null; // date-time format
  journal_entry: number | null;
  notes?: string;
  items: PurchaseReturnItem[];
  created_at: string; // date-time format
  updated_at: string; // date-time format
}

export interface GLEntry {
  id: number;
  account_id: number;
  account_code: string;
  account_name: string;
  debit: string;
  credit: string;
}

export interface GLEntriesResponse {
  journal_entry_id?: number;
  reference?: string;
  date?: string;
  description?: string;
  is_posted?: boolean;
  entries: GLEntry[];
  message?: string;
}

export interface CreatePurchaseReturnData {
  grn: number;
  supplier?: number; // Will be auto-populated from GRN
  return_date: string; // date format
  return_reason: 'damaged' | 'wrong_item' | 'defective' | 'excess' | 'quality' | 'other';
  status?: 'pending' | 'approved' | 'shipped' | 'completed' | 'cancelled';
  total_amount?: string; // Will be calculated from items
  refund_method: 'credit_note' | 'cash' | 'replacement';
  refund_received?: boolean;
  refund_date?: string | null;
  notes?: string;
  items: {
    grn_item_id: number; // Frontend field name
    grn_item?: number; // API field name (will be mapped)
    item?: number; // API field name (will be mapped from GRN)
    quantity_returned: number | string;
    unit_cost?: string; // API field (will be mapped from GRN)
    total_cost?: string; // API field (will be calculated)
    return_reason: string;
    reason?: string; // API field name (will be mapped)
    condition: 'good' | 'damaged' | 'defective' | 'expired' | 'wrong_item';
    return_cost: string; // decimal string
    notes?: string;
  }[];
}

export interface PurchaseReturnApprovalData {
  comments?: string;
  action: 'approve' | 'reject';
}

// Utility functions for error handling and retry logic
class ProcurementServiceUtils {
  static async sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  static calculateDelay(attempt: number, config: RetryConfig): number {
    const delay = config.baseDelay * Math.pow(config.backoffMultiplier, attempt - 1);
    return Math.min(delay, config.maxDelay);
  }

  static isRetryableError(error: any): boolean {
    // Network errors, timeouts, and 5xx server errors are retryable
    if (error.name === 'NetworkError' || error.name === 'TimeoutError') {
      return true;
    }

    if (error.message && error.message.includes('HTTP')) {
      const statusMatch = error.message.match(/HTTP (\d+)/);
      if (statusMatch) {
        const status = parseInt(statusMatch[1]);
        // Retry on 5xx server errors and 429 (rate limit)
        return status >= 500 || status === 429;
      }
    }

    return false;
  }

  static createProcurementError(error: any, operation: string): ProcurementError {
    let message = `Failed to ${operation}`;
    let code = 'UNKNOWN_ERROR';
    let retryable = false;

    if (error.message) {
      if (error.message.includes('HTTP 400')) {
        code = 'VALIDATION_ERROR';
        message = `Validation failed for ${operation}`;
      } else if (error.message.includes('HTTP 401')) {
        code = 'AUTHENTICATION_ERROR';
        message = `Authentication required for ${operation}`;
      } else if (error.message.includes('HTTP 403')) {
        code = 'PERMISSION_ERROR';
        message = `Permission denied for ${operation}`;
      } else if (error.message.includes('HTTP 404')) {
        code = 'NOT_FOUND_ERROR';
        message = `Resource not found for ${operation}`;
      } else if (error.message.includes('HTTP 409')) {
        code = 'CONFLICT_ERROR';
        message = `Conflict occurred during ${operation}`;
      } else if (error.message.includes('HTTP 429')) {
        code = 'RATE_LIMIT_ERROR';
        message = `Rate limit exceeded for ${operation}`;
        retryable = true;
      } else if (error.message.includes('HTTP 5')) {
        code = 'SERVER_ERROR';
        message = `Server error during ${operation}`;
        retryable = true;
      } else {
        message = error.message;
      }
    }

    return {
      message,
      code,
      details: error,
      retryable: retryable || this.isRetryableError(error),
    };
  }

  static async withRetry<T>(
    operation: () => Promise<T>,
    operationName: string,
    config: RetryConfig = DEFAULT_RETRY_CONFIG
  ): Promise<T> {
    let lastError: any;

    for (let attempt = 1; attempt <= config.maxRetries + 1; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error;
        const procurementError = this.createProcurementError(error, operationName);

        // Don't retry if it's the last attempt or error is not retryable
        if (attempt > config.maxRetries || !procurementError.retryable) {
          throw procurementError;
        }

        // Wait before retrying
        const delay = this.calculateDelay(attempt, config);
        console.warn(
          `Attempt ${attempt} failed for ${operationName}, retrying in ${delay}ms:`,
          procurementError.message
        );
        await this.sleep(delay);
      }
    }

    throw this.createProcurementError(lastError, operationName);
  }

  static validateFile(file: File, options: FileUploadOptions = {}): void {
    const { maxSize = 10 * 1024 * 1024, allowedTypes = [] } = options; // Default 10MB

    if (file.size > maxSize) {
      throw new Error(
        `File size ${(file.size / 1024 / 1024).toFixed(2)}MB exceeds maximum allowed size ${(maxSize / 1024 / 1024).toFixed(2)}MB`
      );
    }

    if (allowedTypes.length > 0 && !allowedTypes.includes(file.type)) {
      throw new Error(
        `File type ${file.type} is not allowed. Allowed types: ${allowedTypes.join(', ')}`
      );
    }
  }
}

class ProcurementService {
  // Enhanced Purchase Order operations with retry logic
  async getPurchaseOrders(params?: {
    search?: string;
    status?: string;
    page?: number;
    ordering?: string;
    supplier?: number;
  }): Promise<PaginatedResponse<PurchaseOrder>> {
    return ProcurementServiceUtils.withRetry(
      () => api.get('/procurement/purchase-orders/', { params }),
      'fetch purchase orders'
    );
  }

  async getPurchaseOrder(id: number): Promise<PurchaseOrder> {
    return ProcurementServiceUtils.withRetry(
      () => api.get(`/procurement/purchase-orders/${id}/`),
      `fetch purchase order ${id}`
    );
  }

  async createPurchaseOrder(data: CreatePurchaseOrderData): Promise<PurchaseOrder> {
    return ProcurementServiceUtils.withRetry(
      () => api.post('/procurement/purchase-orders/', data),
      'create purchase order'
    );
  }

  async updatePurchaseOrder(
    id: number,
    data: Partial<CreatePurchaseOrderData>
  ): Promise<PurchaseOrder> {
    return ProcurementServiceUtils.withRetry(
      () => api.patch(`/procurement/purchase-orders/${id}/`, data),
      `update purchase order ${id}`
    );
  }

  async deletePurchaseOrder(id: number): Promise<void> {
    return ProcurementServiceUtils.withRetry(
      () => api.delete(`/procurement/purchase-orders/${id}/`),
      `delete purchase order ${id}`
    );
  }

  // Purchase Order Actions
  async submitPurchaseOrder(id: number): Promise<PurchaseOrder> {
    return ProcurementServiceUtils.withRetry(
      () => api.patch(`/procurement/purchase-orders/${id}/`, { status: 'submitted' }),
      `submit purchase order ${id}`
    );
  }

  async approvePurchaseOrder(
    id: number,
    data?: Partial<CreatePurchaseOrderData>
  ): Promise<PurchaseOrder> {
    return ProcurementServiceUtils.withRetry(
      () => api.post(`/procurement/purchase-orders/${id}/approve/`, data || {}),
      `approve purchase order ${id}`
    );
  }

  async sendPurchaseOrder(id: number): Promise<PurchaseOrder> {
    return ProcurementServiceUtils.withRetry(
      () => api.post(`/procurement/purchase-orders/${id}/send_to_supplier/`, {}),
      `send purchase order ${id} to supplier`
    );
  }

  async acknowledgePurchaseOrder(
    id: number,
    data?: Partial<CreatePurchaseOrderData>
  ): Promise<PurchaseOrder> {
    return ProcurementServiceUtils.withRetry(
      () =>
        api.patch(`/procurement/purchase-orders/${id}/`, {
          status: 'acknowledged',
          acknowledged_at: new Date().toISOString(),
          ...data,
        }),
      `acknowledge purchase order ${id}`
    );
  }

  async cancelPurchaseOrder(
    id: number,
    data: Partial<CreatePurchaseOrderData>
  ): Promise<PurchaseOrder> {
    return ProcurementServiceUtils.withRetry(
      () => api.post(`/procurement/purchase-orders/${id}/cancel/`, data),
      `cancel purchase order ${id}`
    );
  }

  // Enhanced Supplier operations with retry logic
  async getSuppliers(params?: {
    search?: string;
    page?: number;
    page_size?: number;
    ordering?: string;
  }): Promise<PaginatedResponse<Supplier>> {
    return ProcurementServiceUtils.withRetry(
      () => api.get('/procurement/suppliers/', { params }),
      'fetch suppliers'
    );
  }

  async getAllSuppliers(params?: {
    search?: string;
    ordering?: string;
    page_size?: number;
  }): Promise<Supplier[]> {
    const all: Supplier[] = [];
    let page = 1;
    let hasMore = true;

    while (hasMore) {
      const response = await this.getSuppliers({
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

  async getSupplier(id: number): Promise<Supplier> {
    return ProcurementServiceUtils.withRetry(
      () => api.get(`/procurement/suppliers/${id}/`),
      `fetch supplier ${id}`
    );
  }

  async createSupplier(data: CreateSupplierData): Promise<Supplier> {
    return ProcurementServiceUtils.withRetry(
      () => api.post('/procurement/suppliers/', data),
      'create supplier'
    );
  }

  async updateSupplier(id: number, data: Partial<CreateSupplierData>): Promise<Supplier> {
    return ProcurementServiceUtils.withRetry(
      () => api.patch(`/procurement/suppliers/${id}/`, data),
      `update supplier ${id}`
    );
  }

  async deleteSupplier(id: number): Promise<void> {
    return ProcurementServiceUtils.withRetry(
      () => api.delete(`/procurement/suppliers/${id}/`),
      `delete supplier ${id}`
    );
  }

  // Enhanced Purchase Requisition operations with retry logic - Updated endpoints
  async getPurchaseRequisitions(params?: {
    search?: string;
    page?: number;
    ordering?: string;
  }): Promise<PaginatedResponse<PurchaseRequisition>> {
    return ErrorHandler.withRetry(
      () => api.get('/procurement/purchase-requisitions/', { params }),
      'fetch-requisitions'
    );
  }

  async getPurchaseRequisition(id: number): Promise<PurchaseRequisition> {
    return ErrorHandler.withRetry(
      () => api.get(`/procurement/purchase-requisitions/${id}/`),
      'fetch-requisition'
    );
  }

  async createPurchaseRequisition(
    data: CreatePurchaseRequisitionData
  ): Promise<PurchaseRequisition> {
    return ErrorHandler.withRetry(
      () => api.post('/procurement/purchase-requisitions/', data),
      'create-requisition'
    );
  }

  async updatePurchaseRequisition(
    id: number,
    data: UpdatePurchaseRequisitionData
  ): Promise<PurchaseRequisition> {
    return ErrorHandler.withRetry(
      () => api.patch(`/procurement/purchase-requisitions/${id}/`, data),
      'update-requisition'
    );
  }

  async deletePurchaseRequisition(id: number): Promise<void> {
    return ErrorHandler.withRetry(
      () => api.delete(`/procurement/purchase-requisitions/${id}/`),
      'delete-requisition'
    );
  }

  // Purchase Requisition Actions with retry logic
  async submitRequisition(id: number): Promise<PurchaseRequisition> {
    return ErrorHandler.withRetry(
      () => api.post(`/procurement/purchase-requisitions/${id}/submit/`, {}),
      'submit-requisition'
    );
  }

  async verifyRequisitionInvoice(id: number, data: FormData): Promise<PurchaseRequisition> {
    return ErrorHandler.withRetry(
      () =>
        api.post(`/procurement/purchase-requisitions/${id}/verify_invoice/`, data, {
          headers: {
            'Content-Type': 'multipart/form-data',
          },
        }),
      'verify-requisition-invoice'
    );
  }

  async approveRequisition(
    id: number,
    data: RequisitionApprovalData
  ): Promise<PurchaseRequisition> {
    return ErrorHandler.withRetry(
      () => api.post(`/procurement/purchase-requisitions/${id}/approve/`, data),
      'approve-requisition'
    );
  }

  async rejectRequisition(id: number, data: RequisitionApprovalData): Promise<PurchaseRequisition> {
    return ErrorHandler.withRetry(
      () => api.post(`/procurement/purchase-requisitions/${id}/reject/`, data),
      'reject-requisition'
    );
  }

  // Legacy conversion method (kept for backward compatibility)
  async convertRequisitionToPO(id: number): Promise<PurchaseOrder> {
    return ErrorHandler.withRetry(
      () => api.post(`/procurement/purchase-requisitions/${id}/create_po/`, {}),
      'convert-requisition'
    );
  }

  // Enhanced method for converting requisitions to PO with additional parameters
  // This method works with both manual and workflow requisitions
  async convertRequisitionToPOWithDetails(
    id: number,
    conversionData: RequisitionToPOConversionData
  ): Promise<RequisitionToPOConversionResponse> {
    return ErrorHandler.withRetry(
      () => api.post(`/procurement/purchase-requisitions/${id}/convert-to-po/`, conversionData),
      'convert-requisition-with-details'
    );
  }

  // New method for workflow-based requisition creation
  async createRequisitionWithWorkflow(
    data: WorkflowRequisitionData
  ): Promise<WorkflowRequisitionResponse> {
    return ErrorHandler.withRetry(
      () => api.post('/procurement/purchase-requisitions/create_with_workflow/', data),
      'create-requisition-with-workflow'
    );
  }

  // Note: Bulk operations have been removed from the backend API

  // Enhanced Department operations with retry logic
  async getDepartments(params?: {
    search?: string;
    is_active?: boolean;
    page?: number;
  }): Promise<PaginatedResponse<Department>> {
    return ProcurementServiceUtils.withRetry(
      () => api.get('/hr/departments/', { params }),
      'fetch departments'
    );
  }

  // Enhanced GRN operations with retry logic
  async getGRNs(params?: {
    search?: string;
    status?: string;
    quality_status?: string;
    supplier_id?: number;
    is_posted?: boolean;
    date_from?: string;
    date_to?: string;
    page?: number;
    ordering?: string;
  }): Promise<PaginatedResponse<GoodsReceivedNote>> {
    return ProcurementServiceUtils.withRetry(
      () => api.get('/procurement/goods-receipts/', { params }),
      'fetch goods received notes'
    );
  }

  async getGRN(id: number): Promise<GoodsReceivedNote> {
    return ProcurementServiceUtils.withRetry(
      () => api.get(`/procurement/goods-receipts/${id}/`),
      `fetch goods received note ${id}`
    );
  }

  async performThreeWayMatch(data: ThreeWayMatchRequest): Promise<ThreeWayMatchResult> {
    return ProcurementServiceUtils.withRetry(
      () => api.post('/procurement/three-way-matching/match/', data),
      'perform three-way match'
    );
  }

  async createGRN(data: CreateGRNData): Promise<GoodsReceivedNote> {
    return ProcurementServiceUtils.withRetry(
      () => api.post('/procurement/goods-receipts/', data),
      'create goods received note'
    );
  }

  async updateGRN(id: number, data: Partial<CreateGRNData>): Promise<GoodsReceivedNote> {
    return ProcurementServiceUtils.withRetry(
      () => api.patch(`/procurement/goods-receipts/${id}/`, data),
      `update goods received note ${id}`
    );
  }

  async deleteGRN(id: number): Promise<void> {
    return ProcurementServiceUtils.withRetry(
      () => api.delete(`/procurement/goods-receipts/${id}/`),
      `delete goods received note ${id}`
    );
  }

  // GRN Actions with retry logic
  async completeQualityInspection(
    id: number,
    data: {
      quality_status: 'passed' | 'failed' | 'partial';
      inspection_notes?: string;
      inspected_by?: number;
      items: Array<{
        id: number;
        quantity_accepted: string;
        quantity_rejected: string;
        condition_notes?: string;
        rejection_reason?: string;
      }>;
    }
  ): Promise<GoodsReceivedNote> {
    return ProcurementServiceUtils.withRetry(
      () => api.post(`/procurement/goods-receipts/${id}/inspect/`, data),
      `complete quality inspection for GRN ${id}`
    );
  }

  async postGRNToInventoryAndAccounting(
    id: number,
    data?: {
      posting_date?: string;
      notes?: string;
    }
  ): Promise<{
    success: boolean;
    message: string;
    grn: GoodsReceivedNote;
    accounts_payable_id?: number;
    total_amount: string;
    inventory_movements?: Array<{
      item_id: number;
      quantity: string;
      movement_type: string;
    }>;
    journal_entries?: Array<{
      account: string;
      debit: string;
      credit: string;
    }>;
  }> {
    // First, get the current GRN data to auto-populate the request body
    const currentGRN = await this.getGRN(id);

    // Build the complete request body with all required fields from the current GRN
    const postingData = {
      // Required fields from API spec
      purchase_order: currentGRN.purchase_order,
      supplier: currentGRN.supplier,
      received_date: currentGRN.received_date,
      received_time: currentGRN.received_time,
      received_location: currentGRN.received_location,

      // Optional fields that may be present
      delivery_note_number: currentGRN.delivery_note_number || '',
      vehicle_number: currentGRN.vehicle_number || '',
      driver_name: currentGRN.driver_name || '',
      driver_phone: currentGRN.driver_phone || '',
      supplier_invoice_number: currentGRN.supplier_invoice_number || '',
      supplier_invoice_date: currentGRN.supplier_invoice_date,
      supplier_invoice_amount: currentGRN.supplier_invoice_amount,
      quality_status: currentGRN.quality_status,
      inspected_by: currentGRN.inspected_by,
      inspection_notes: currentGRN.inspection_notes || '',
      total_amount: currentGRN.total_amount,
      notes: data?.notes || currentGRN.notes || '',
      delivery_note_attachment: currentGRN.delivery_note_attachment,
      photos: currentGRN.photos || [],

      // Items array with all the item details
      items: currentGRN.items.map(item => ({
        item: item.item,
        po_item: item.po_item,
        quantity_ordered: item.quantity_ordered,
        quantity_received: item.quantity_received,
        quantity_accepted: item.quantity_accepted,
        quantity_rejected: item.quantity_rejected,
        unit_cost: item.unit_cost,
        total_cost: item.total_cost,
        cost_price: item.total_cost, // Add cost_price field mapping from total_cost
        batch_number: item.batch_number || '',
        serial_number: item.serial_number || '',
        expiry_date: item.expiry_date,
        condition_notes: item.condition_notes || '',
        rejection_reason: item.rejection_reason || '',
      })),
    };

    return ProcurementServiceUtils.withRetry(
      () => api.post(`/procurement/goods-receipts/${id}/post/`, postingData),
      `post GRN ${id} to inventory and accounting`
    );
  }

  // Legacy methods - kept for backward compatibility
  async postGRNToInventory(id: number): Promise<GoodsReceivedNote> {
    return ProcurementServiceUtils.withRetry(
      () => api.post(`/procurement/goods-receipts/${id}/post-to-inventory/`, {}),
      `post GRN ${id} to inventory`
    );
  }

  async postGRNToAccounting(id: number): Promise<GoodsReceivedNote> {
    return ProcurementServiceUtils.withRetry(
      () => api.post(`/procurement/goods-receipts/${id}/post-to-accounting/`, {}),
      `post GRN ${id} to accounting`
    );
  }

  async postGRNToBoth(id: number): Promise<GoodsReceivedNote> {
    return ProcurementServiceUtils.withRetry(
      () => api.post(`/procurement/goods-receipts/${id}/post-to-both/`, {}),
      `post GRN ${id} to both inventory and accounting`
    );
  }

  // Enhanced Inventory operations with retry logic
  async getInventoryItems(params?: {
    search?: string;
    is_active?: boolean;
    page?: number;
    page_size?: number;
    limit?: number;
  }): Promise<PaginatedResponse<InventoryItem>> {
    return ProcurementServiceUtils.withRetry(
      () => api.get('/inventory/items/', { params }),
      'fetch inventory items'
    );
  }

  async getAllInventoryItems(params?: {
    search?: string;
    is_active?: boolean;
    page_size?: number;
    limit?: number;
  }): Promise<InventoryItem[]> {
    const all: InventoryItem[] = [];
    let page = 1;
    let hasMore = true;

    while (hasMore) {
      const response = await this.getInventoryItems({
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

  async getInventoryLocations(params?: {
    search?: string;
    is_active?: boolean;
    page?: number;
    page_size?: number;
  }): Promise<PaginatedResponse<Location>> {
    return ProcurementServiceUtils.withRetry(
      () => api.get('/inventory/locations/', { params }),
      'fetch inventory locations'
    );
  }

  async getAllInventoryLocations(params?: {
    search?: string;
    is_active?: boolean;
    page_size?: number;
  }): Promise<Location[]> {
    const all: Location[] = [];
    let page = 1;
    let hasMore = true;

    while (hasMore) {
      const response = await this.getInventoryLocations({
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

  // Enhanced Purchase Returns operations with retry logic - Updated endpoints
  async getPurchaseReturns(params?: {
    search?: string;
    status?: string;
    supplier_id?: number;
    return_reason?: string;
    date_from?: string;
    date_to?: string;
    page?: number;
    ordering?: string;
  }): Promise<PaginatedResponse<PurchaseReturn>> {
    return ProcurementServiceUtils.withRetry(
      () => api.get('/procurement/purchase-returns/', { params }),
      'fetch purchase returns'
    );
  }

  async getPurchaseReturn(id: number): Promise<PurchaseReturn> {
    return ProcurementServiceUtils.withRetry(
      () => api.get(`/procurement/purchase-returns/${id}/`),
      `fetch purchase return ${id}`
    );
  }

  async createPurchaseReturn(data: CreatePurchaseReturnData): Promise<PurchaseReturn> {
    // First, get the GRN data to auto-populate missing required fields
    const grn = await this.getGRN(data.grn);

    // Build the complete request body with all required fields
    const completeData = {
      ...data,
      supplier: grn.supplier, // Auto-populate supplier from GRN
      status: data.status || 'pending',
      total_amount:
        data.total_amount ||
        sumDecimals(data.items.map(item => item.return_cost || '0')).toFixed(2),

      // Transform items to match API expectations
      items: data.items.map(item => {
        // Find the corresponding GRN item by its ID (not by item reference)
        const grnItem = grn.items.find(gi => gi.id === item.grn_item_id);

        return {
          grn_item: item.grn_item_id, // API expects grn_item (the GRN item ID)
          item: grnItem?.item || item.grn_item_id, // Use the actual inventory item ID from GRN item
          quantity_returned: item.quantity_returned.toString(),
          unit_cost: grnItem?.unit_cost || '0.00', // Get unit_cost from GRN item
          total_cost: item.return_cost, // Map return_cost to total_cost
          reason: item.return_reason, // Map return_reason to reason
        };
      }),
    };

    return ProcurementServiceUtils.withRetry(
      () => api.post('/procurement/purchase-returns/', completeData),
      'create purchase return'
    );
  }

  async updatePurchaseReturn(
    id: number,
    data: Partial<CreatePurchaseReturnData>
  ): Promise<PurchaseReturn> {
    return ProcurementServiceUtils.withRetry(
      () => api.patch(`/procurement/purchase-returns/${id}/`, data),
      `update purchase return ${id}`
    );
  }

  async deletePurchaseReturn(id: number): Promise<void> {
    return ProcurementServiceUtils.withRetry(
      () => api.delete(`/procurement/purchase-returns/${id}/`),
      `delete purchase return ${id}`
    );
  }

  // Purchase Return Actions with retry logic - Updated to match backend
  async postPurchaseReturn(
    id: number,
    data: Partial<CreatePurchaseReturnData>
  ): Promise<PurchaseReturn> {
    return ProcurementServiceUtils.withRetry(
      () => api.post(`/procurement/purchase-returns/${id}/post/`, data),
      `post purchase return ${id}`
    );
  }

  async getPurchaseReturnGLEntries(id: number): Promise<GLEntriesResponse> {
    return ProcurementServiceUtils.withRetry(
      () => api.get(`/procurement/purchase-returns/${id}/gl_entries/`),
      `fetch GL entries for purchase return ${id}`
    );
  }

  // File Upload Service for GRN photos and documents
  async uploadGRNPhoto(
    grnId: number,
    file: File,
    options: FileUploadOptions = {}
  ): Promise<UploadedFile> {
    // Validate file before upload
    const defaultOptions: FileUploadOptions = {
      maxSize: 10 * 1024 * 1024, // 10MB
      allowedTypes: ['image/jpeg', 'image/png', 'image/gif', 'image/webp'],
      ...options,
    };

    ProcurementServiceUtils.validateFile(file, defaultOptions);

    const formData = new FormData();
    formData.append('photo', file);
    formData.append('grn_id', grnId.toString());

    return ProcurementServiceUtils.withRetry(async () => {
      const response = await fetch(`/api/procurement/goods-receipts/${grnId}/upload-photo/`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${localStorage.getItem('accessToken') || sessionStorage.getItem('accessToken')}`,
        },
        body: formData,
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const result = await response.json();

      return {
        id: result.id || Date.now().toString(),
        name: file.name,
        url: result.url || result.photo_url,
        size: file.size,
        type: file.type,
        uploadedAt: new Date().toISOString(),
      };
    }, `upload photo for GRN ${grnId}`);
  }

  async uploadGRNDocument(
    grnId: number,
    file: File,
    documentType: 'delivery_note' | 'invoice' | 'other' = 'other',
    options: FileUploadOptions = {}
  ): Promise<UploadedFile> {
    // Validate file before upload
    const defaultOptions: FileUploadOptions = {
      maxSize: 50 * 1024 * 1024, // 50MB for documents
      allowedTypes: [
        'application/pdf',
        'image/jpeg',
        'image/png',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      ],
      ...options,
    };

    ProcurementServiceUtils.validateFile(file, defaultOptions);

    const formData = new FormData();
    formData.append('document', file);
    formData.append('grn_id', grnId.toString());
    formData.append('document_type', documentType);

    return ProcurementServiceUtils.withRetry(async () => {
      const response = await fetch(`/api/procurement/goods-receipts/${grnId}/upload-document/`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${localStorage.getItem('accessToken') || sessionStorage.getItem('accessToken')}`,
        },
        body: formData,
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const result = await response.json();

      return {
        id: result.id || Date.now().toString(),
        name: file.name,
        url: result.url || result.document_url,
        size: file.size,
        type: file.type,
        uploadedAt: new Date().toISOString(),
      };
    }, `upload document for GRN ${grnId}`);
  }

  // PDF Generation Service for purchase orders
  async generatePurchaseOrderPDF(
    poId: number,
    options: PDFGenerationOptions = {}
  ): Promise<PDFGenerationResult> {
    const defaultOptions: PDFGenerationOptions = {
      template: 'standard',
      includeImages: true,
      orientation: 'portrait',
      ...options,
    };

    return ProcurementServiceUtils.withRetry(async () => {
      const response = await fetch(`/api/procurement/purchase-orders/${poId}/generate-pdf/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('accessToken') || sessionStorage.getItem('accessToken')}`,
        },
        body: JSON.stringify(defaultOptions),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const result = await response.json();

      return {
        url: result.pdf_url || result.url,
        filename: result.filename || `PO-${poId}.pdf`,
        size: result.size || 0,
        generatedAt: new Date().toISOString(),
      };
    }, `generate PDF for purchase order ${poId}`);
  }

  async generateGRNPDF(
    grnId: number,
    options: PDFGenerationOptions = {}
  ): Promise<PDFGenerationResult> {
    const defaultOptions: PDFGenerationOptions = {
      template: 'standard',
      includeImages: true,
      orientation: 'portrait',
      ...options,
    };

    return ProcurementServiceUtils.withRetry(async () => {
      const response = await fetch(`/api/procurement/goods-receipts/${grnId}/generate-pdf/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('accessToken') || sessionStorage.getItem('accessToken')}`,
        },
        body: JSON.stringify(defaultOptions),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const result = await response.json();

      return {
        url: result.pdf_url || result.url,
        filename: result.filename || `GRN-${grnId}.pdf`,
        size: result.size || 0,
        generatedAt: new Date().toISOString(),
      };
    }, `generate PDF for GRN ${grnId}`);
  }

  async generatePurchaseReturnPDF(
    returnId: number,
    options: PDFGenerationOptions = {}
  ): Promise<PDFGenerationResult> {
    const defaultOptions: PDFGenerationOptions = {
      template: 'standard',
      includeImages: false,
      orientation: 'portrait',
      ...options,
    };

    return ProcurementServiceUtils.withRetry(async () => {
      const response = await fetch(`/api/procurement/returns/${returnId}/generate-pdf/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('accessToken') || sessionStorage.getItem('accessToken')}`,
        },
        body: JSON.stringify(defaultOptions),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const result = await response.json();

      return {
        url: result.pdf_url || result.url,
        filename: result.filename || `Return-${returnId}.pdf`,
        size: result.size || 0,
        generatedAt: new Date().toISOString(),
      };
    }, `generate PDF for purchase return ${returnId}`);
  }

  // Email service for sending purchase orders
  async emailPurchaseOrder(
    poId: number,
    emailData: {
      to: string[];
      cc?: string[];
      bcc?: string[];
      subject?: string;
      message?: string;
      attachPDF?: boolean;
    }
  ): Promise<{ success: boolean; messageId?: string }> {
    return ProcurementServiceUtils.withRetry(async () => {
      const response = await fetch(`/api/procurement/purchase-orders/${poId}/email/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('accessToken') || sessionStorage.getItem('accessToken')}`,
        },
        body: JSON.stringify({
          attachPDF: true,
          ...emailData,
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const result = await response.json();

      return {
        success: result.success || true,
        messageId: result.message_id || result.messageId,
      };
    }, `email purchase order ${poId}`);
  }

  // Utility method to download generated PDFs
  async downloadPDF(url: string, filename: string): Promise<void> {
    return ProcurementServiceUtils.withRetry(async () => {
      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${localStorage.getItem('accessToken') || sessionStorage.getItem('accessToken')}`,
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const blob = await response.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(downloadUrl);
    }, `download PDF ${filename}`);
  }

  // Batch file upload for multiple GRN photos
  async uploadMultipleGRNPhotos(
    grnId: number,
    files: File[],
    options: FileUploadOptions = {}
  ): Promise<UploadedFile[]> {
    const uploadPromises = files.map(file => this.uploadGRNPhoto(grnId, file, options));

    try {
      return await Promise.all(uploadPromises);
    } catch (error) {
      // If any upload fails, we still want to return the successful ones
      const results = await Promise.allSettled(uploadPromises);
      const successful = results
        .filter(
          (result): result is PromiseFulfilledResult<UploadedFile> => result.status === 'fulfilled'
        )
        .map(result => result.value);

      if (successful.length === 0) {
        throw error;
      }

      console.warn(
        `${files.length - successful.length} out of ${files.length} photo uploads failed`
      );
      return successful;
    }
  }

  // ============= PROCUREMENT WORKFLOW INTEGRATION =============

  // Workflow Status Tracking
  async getWorkflowStatus(entityType: string, entityId: number): Promise<any> {
    return ProcurementServiceUtils.withRetry(
      () => api.get(`/procurement/workflow-status/${entityType}/${entityId}/`),
      `fetch workflow status for ${entityType} ${entityId}`
    );
  }

  async startWorkflow(data: {
    entity_type: string;
    entity_id: number;
    workflow_type: string;
    trigger_data: Record<string, any>;
    priority?: string;
  }): Promise<any> {
    return ProcurementServiceUtils.withRetry(
      () => api.post('/procurement/workflow/start/', data),
      `start workflow for ${data.entity_type} ${data.entity_id}`
    );
  }

  async updateWorkflowStatus(
    statusId: string,
    data: {
      status?: string;
      current_step?: string;
      progress_percentage?: number;
      error_message?: string;
      metadata?: Record<string, any>;
    }
  ): Promise<any> {
    return ProcurementServiceUtils.withRetry(
      () => api.patch(`/procurement/workflow-status/${statusId}/`, data),
      `update workflow status ${statusId}`
    );
  }

  async performWorkflowAction(
    statusId: string,
    data: {
      action: string;
      comments?: string;
      metadata?: Record<string, any>;
    }
  ): Promise<any> {
    return ProcurementServiceUtils.withRetry(
      () => api.post(`/procurement/workflow-status/${statusId}/action/`, data),
      `perform workflow action on ${statusId}`
    );
  }

  // Email Notifications
  async sendNotification(data: {
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
  }): Promise<any> {
    return ProcurementServiceUtils.withRetry(
      () => api.post('/procurement/notifications/send/', data),
      'send procurement notification'
    );
  }

  async getNotificationStatus(notificationId: string): Promise<any> {
    return ProcurementServiceUtils.withRetry(
      () => api.get(`/procurement/notifications/${notificationId}/`),
      `fetch notification status ${notificationId}`
    );
  }

  async getNotificationTemplates(entityType?: string): Promise<any> {
    const params = entityType ? { entity_type: entityType } : {};
    return ProcurementServiceUtils.withRetry(
      () => api.get('/procurement/notifications/templates/', { params }),
      'fetch notification templates'
    );
  }

  // Approval Workflows
  async getApprovalWorkflows(entityType?: string): Promise<any> {
    const params = entityType ? { entity_type: entityType } : {};
    return ProcurementServiceUtils.withRetry(
      () => api.get('/procurement/approval-workflows/', { params }),
      'fetch approval workflows'
    );
  }

  async createApprovalWorkflow(data: {
    name: string;
    entity_type: string;
    trigger_conditions: any[];
    approval_steps: any[];
    notification_settings: any;
    escalation_rules?: any[];
  }): Promise<any> {
    return ProcurementServiceUtils.withRetry(
      () => api.post('/procurement/approval-workflows/', data),
      'create approval workflow'
    );
  }

  async updateApprovalWorkflow(id: string, data: any): Promise<any> {
    return ProcurementServiceUtils.withRetry(
      () => api.patch(`/procurement/approval-workflows/${id}/`, data),
      `update approval workflow ${id}`
    );
  }

  async activateApprovalWorkflow(id: string): Promise<any> {
    return ProcurementServiceUtils.withRetry(
      () => api.post(`/procurement/approval-workflows/${id}/activate/`, {}),
      `activate approval workflow ${id}`
    );
  }

  async deactivateApprovalWorkflow(id: string): Promise<any> {
    return ProcurementServiceUtils.withRetry(
      () => api.post(`/procurement/approval-workflows/${id}/deactivate/`, {}),
      `deactivate approval workflow ${id}`
    );
  }

  // Automatic Status Updates
  async getAutoStatusConfigs(entityType?: string): Promise<any> {
    const params = entityType ? { entity_type: entityType } : {};
    return ProcurementServiceUtils.withRetry(
      () => api.get('/procurement/auto-status-configs/', { params }),
      'fetch auto status configurations'
    );
  }

  async createAutoStatusConfig(data: {
    entity_type: string;
    trigger_event: string;
    conditions: any[];
    target_status: string;
    additional_actions?: any[];
  }): Promise<any> {
    return ProcurementServiceUtils.withRetry(
      () => api.post('/procurement/auto-status-configs/', data),
      'create auto status configuration'
    );
  }

  async updateAutoStatusConfig(id: string, data: any): Promise<any> {
    return ProcurementServiceUtils.withRetry(
      () => api.patch(`/procurement/auto-status-configs/${id}/`, data),
      `update auto status configuration ${id}`
    );
  }

  async triggerAutoStatusUpdate(
    entityType: string,
    entityId: number,
    event: string,
    data?: any
  ): Promise<any> {
    return ProcurementServiceUtils.withRetry(
      () =>
        api.post('/procurement/auto-status-trigger/', {
          entity_type: entityType,
          entity_id: entityId,
          event: event,
          data: data || {},
        }),
      `trigger auto status update for ${entityType} ${entityId}`
    );
  }

  // Workflow Analytics
  async getWorkflowMetricsForProcurement(params: {
    entity_type?: string;
    period_start: string;
    period_end: string;
  }): Promise<any> {
    return ProcurementServiceUtils.withRetry(
      () => api.get('/procurement/workflow-metrics/', { params }),
      'fetch procurement workflow metrics'
    );
  }

  async getApprovalBottlenecks(params: { entity_type?: string; days?: number }): Promise<any> {
    return ProcurementServiceUtils.withRetry(
      () => api.get('/procurement/approval-bottlenecks/', { params }),
      'fetch approval bottlenecks'
    );
  }

  // Integration with Automation System
  async connectToAutomationWorkflow(data: {
    entity_type: string;
    entity_id: number;
    automation_template_id: number;
    trigger_data: Record<string, any>;
  }): Promise<any> {
    return ProcurementServiceUtils.withRetry(
      () => api.post('/procurement/connect-automation/', data),
      `connect ${data.entity_type} ${data.entity_id} to automation workflow`
    );
  }

  async getAutomationWorkflowStatus(entityType: string, entityId: number): Promise<any> {
    return ProcurementServiceUtils.withRetry(
      () => api.get(`/procurement/automation-status/${entityType}/${entityId}/`),
      `fetch automation workflow status for ${entityType} ${entityId}`
    );
  }

  async cancelAutomationWorkflow(entityType: string, entityId: number): Promise<any> {
    return ProcurementServiceUtils.withRetry(
      () => api.post(`/procurement/cancel-automation/${entityType}/${entityId}/`, {}),
      `cancel automation workflow for ${entityType} ${entityId}`
    );
  }

  // ============================================================================
  // SUPPLIER QUOTES WORKFLOW OPERATIONS
  // ============================================================================

  // Quote creation from requisition
  async createQuotesFromRequisition(requisitionId: number, data: CreateQuoteData): Promise<Quote> {
    const quoteData = {
      requisition: requisitionId,
      supplier: data.supplier,
      quote_date: data.quote_date,
      valid_until: data.valid_until,
      subtotal: data.subtotal,
      tax_amount: data.tax_amount || '0.00',
      shipping_cost: data.shipping_cost || '0.00',
      total_amount: data.total_amount,
      payment_terms: data.payment_terms || '',
      delivery_terms: data.delivery_terms || '',
      status: data.status || 'received',
      notes: data.notes || '',
      attachment: data.attachment || null,
      items: data.items,
    };

    return ProcurementServiceUtils.withRetry(
      () => api.post(`/procurement/supplier-quotes/`, quoteData),
      `create quote from requisition ${requisitionId}`
    );
  }

  // Convert selected quote to purchase order
  async convertQuoteToPO(
    quoteId: number,
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
    }
  ): Promise<PurchaseOrder> {
    // First get the quote to extract the requisition ID
    const quote = await this.getQuote(quoteId);

    // Use the requisition conversion endpoint with the quote's requisition
    const conversionData: RequisitionToPOConversionData = {
      supplier: data.supplier,
      delivery_location: data.delivery_location,
      expected_delivery_date: data.expected_delivery_date,
      order_date: data.order_date,
      payment_terms: data.payment_terms,
      custom_payment_terms: data.custom_payment_terms,
      contact_person: data.contact_person,
      contact_phone: data.contact_phone,
      contact_email: data.contact_email,
      notes: data.notes,
      selected_quote: quoteId,
    };

    const response = await ErrorHandler.withRetry(
      () =>
        api.post(
          `/procurement/purchase-requisitions/${quote.requisition}/convert-to-po/`,
          conversionData
        ),
      'convert-quote-to-purchase-order'
    );

    return response.purchase_order;
  }

  // ============= QUOTES METHODS =============

  // Enhanced Quotes operations with retry logic
  async getQuotes(params?: QuoteListParams): Promise<PaginatedResponse<Quote>> {
    return ProcurementServiceUtils.withRetry(
      () => api.get('/procurement/supplier-quotes/', { params }),
      'fetch quotes'
    );
  }

  async getQuote(id: number): Promise<Quote> {
    return ProcurementServiceUtils.withRetry(
      () => api.get(`/procurement/supplier-quotes/${id}/`),
      `fetch quote ${id}`
    );
  }

  async createQuote(data: CreateQuoteData): Promise<Quote> {
    return ProcurementServiceUtils.withRetry(
      () => api.post('/procurement/supplier-quotes/', data),
      'create quote'
    );
  }

  async updateQuote(id: number, data: UpdateQuoteData): Promise<Quote> {
    return ProcurementServiceUtils.withRetry(
      () => api.patch(`/procurement/supplier-quotes/${id}/`, data),
      `update quote ${id}`
    );
  }

  async deleteQuote(id: number): Promise<void> {
    return ProcurementServiceUtils.withRetry(
      () => api.delete(`/procurement/supplier-quotes/${id}/`),
      `delete quote ${id}`
    );
  }

  // Quote comparison - Updated to match new API response structure
  async compareQuotes(requisitionId: number): Promise<QuoteComparisonResponse> {
    return ProcurementServiceUtils.withRetry(
      () => api.get(`/procurement/supplier-quotes/by-requisition/?requisition_id=${requisitionId}`),
      `compare quotes for requisition ${requisitionId}`
    );
  }

  // Quote Actions
  async selectQuote(id: number, data?: QuoteSelectionData): Promise<Quote> {
    return ProcurementServiceUtils.withRetry(
      () => api.post(`/procurement/supplier-quotes/${id}/select/`, data || {}),
      `select quote ${id}`
    );
  }

  async rejectQuote(id: number, data?: QuoteSelectionData): Promise<Quote> {
    return ProcurementServiceUtils.withRetry(
      () => api.post(`/procurement/supplier-quotes/${id}/reject/`, data || {}),
      `reject quote ${id}`
    );
  }

  // ─── Procurement Config ───────────────────────────────────────────────────────
  async getProcurementConfig(): Promise<ProcurementConfig> {
    return ProcurementServiceUtils.withRetry(
      () => api.get('/procurement/config/for_branch/'),
      'fetch procurement config'
    );
  }

  async createProcurementConfig(data: ProcurementConfigUpdate): Promise<ProcurementConfig> {
    return ProcurementServiceUtils.withRetry(
      () => api.post('/procurement/config/', data),
      'create procurement config'
    );
  }

  async updateProcurementConfig(
    id: number,
    data: ProcurementConfigUpdate
  ): Promise<ProcurementConfig> {
    return ProcurementServiceUtils.withRetry(
      () => api.patch(`/procurement/config/${id}/`, data),
      `update procurement config ${id}`
    );
  }
}

// Add this export statement at the end of the file:
export const procurementService = new ProcurementService();

// Also export the class itself in case it's needed:
export { ProcurementService };
