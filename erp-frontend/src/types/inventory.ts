// Inventory Types - Updated to match backend API schema exactly

// ============================================================================
// CORE INVENTORY TYPES
// ============================================================================

export interface InventoryItem {
  id: number;
  sku: string; // Max 100 chars
  name: string; // Max 200 chars
  barcode?: string; // Max 100 chars
  description?: string;
  category: number; // Required
  category_name: string; // Required
  /** Short code for the category, e.g. 'CAT-001' */
  category_code: string;
  /** Broad type label for the category, e.g. 'Book', 'Uniform' */
  category_item_type: string;
  unit_of_measure?: string; // Max 20 chars - unit, kg, liter, box, etc.
  cost_price: string; // Required decimal string - Cost price per unit
  selling_price: string; // Required decimal string - Selling price per unit
  minimum_selling_price?: string | null; // Decimal string - Minimum allowed selling price
  valuation_method?: 'fifo' | 'lifo' | 'average';
  reorder_level?: string; // Decimal string - Trigger reorder when stock reaches this level
  reorder_quantity?: string; // Decimal string - Quantity to reorder
  is_active?: boolean;
  is_sellable?: boolean;
  is_purchasable?: boolean;
  track_serial_numbers?: boolean;
  track_batch_numbers?: boolean;
  track_expiry?: boolean;
  total_stock: string; // Required decimal string - Total quantity on hand across all locations
  total_available: string; // Required decimal string - Total quantity available (on_hand - reserved)
  total_reserved: string; // Required decimal string - Total quantity reserved across all locations
  total_value: string; // Required decimal string - Total inventory value across all locations
  needs_reorder: boolean; // Required - True if total_stock <= reorder_level
  created_at: string;
  updated_at: string;
}

export interface InventoryStock {
  id: number;
  item: number;
  item_name: string;
  item_sku: string;
  location: number;
  location_name: string;
  location_code: string;
  quantity_on_hand?: string; // Decimal string ^-?\d{0,16}(?:\.\d{0,2})?$
  quantity_reserved?: string; // Decimal string - Reserved for orders/invoices
  quantity_available?: string; // Decimal string - On hand - reserved
  average_cost?: string; // Decimal string - Weighted average cost
  total_value?: string; // Decimal string - quantity_on_hand * average_cost
  created_at: string;
  updated_at: string;
}

export type MovementType =
  | 'purchase' // Purchase Receipt
  | 'sale' // Sales Delivery
  | 'adjustment' // Stock Adjustment
  | 'transfer' // Transfer
  | 'return_in' // Purchase Return
  | 'return_out' // Sales Return
  | 'write_off' // Write Off
  | 'production_in' // Production Receipt
  | 'production_out'; // Production Issue

export interface StockMovement {
  id: number;
  item: number;
  item_name: string;
  item_sku: string;
  from_location: number | null;
  from_location_name: string;
  to_location: number | null;
  to_location_name: string;
  movement_type: MovementType;
  movement_date?: string; // Date
  quantity: string; // Required decimal string ^-?\d{0,16}(?:\.\d{0,2})?$
  unit_cost?: string; // Decimal string ^-?\d{0,16}(?:\.\d{0,2})?$
  reference_number: string; // Required, max 100 chars
  notes?: string;
  batch_number?: string; // Max 100 chars
  serial_number?: string; // Max 100 chars
  expiry_date?: string | null; // Date
  created_by_name: string;
  created_at: string;
  updated_at: string;
}

export interface InventoryCategory {
  id: number;
  name: string; // Required, max 100 chars
  code: string; // Required, max 20 chars
  /** Broad type label for material-request authorization, e.g. 'Book', 'Uniform', 'Stationery' */
  item_type: string;
  description?: string;
  inventory_account: number; // Required - Asset account for inventory valuation
  inventory_account_name: string; // Required
  cogs_account: number; // Required - Expense account for cost of goods sold
  cogs_account_name: string; // Required
  sales_account: number; // Required - Income account for sales
  sales_account_name: string; // Required
  created_at: string;
  updated_at: string;
}

export interface Location {
  id: number;
  name: string; // Required, max 200 chars
  code?: string | null; // Max 20 chars - Optional location code. Must be unique per branch if provided.
  location_type?: 'warehouse' | 'store' | 'vehicle' | 'other';
  address?: string;
  is_active?: boolean;
  created_at: string;
  updated_at: string;
}

// ============================================================================
// STOCK ADJUSTMENT TYPES
// ============================================================================

export type AdjustmentType = 'increase' | 'decrease';
export type AdjustmentStatus = 'pending' | 'approved' | 'rejected' | 'executed';

export interface StockAdjustmentRequest {
  requested_by: number; // Required
  item: number; // Required
  location: number; // Required
  adjustment_type: AdjustmentType; // Required
  quantity: string; // Required decimal string ^-?\d{0,16}(?:\.\d{0,2})?$
  unit_cost?: string | null; // Optional decimal string ^-?\d{0,16}(?:\.\d{0,2})?$ - Estimated unit cost for approval decision
  reason: string; // Required non-empty - Reason for adjustment
  notes?: string; // Optional
  status?: AdjustmentStatus; // Optional
  approval_notes?: string; // Optional
}

export interface StockAdjustment {
  id: number;
  request_number: string;
  requested_by: number;
  requested_by_name: string;
  item: number;
  item_name: string;
  item_sku: string;
  location: number;
  location_name: string;
  adjustment_type: AdjustmentType;
  quantity: string; // Decimal string ^-?\d{0,16}(?:\.\d{0,2})?$
  unit_cost?: string | null; // Decimal string ^-?\d{0,16}(?:\.\d{0,2})?$ - Estimated unit cost for approval decision
  estimated_cost: string; // Decimal string ^-?\d{0,16}(?:\.\d{0,2})?$ - Total estimated cost (quantity × unit_cost)
  reason: string; // Reason for adjustment
  notes?: string;
  status: AdjustmentStatus;
  approved_by: number | null;
  approved_by_name: string | null;
  approved_at: string | null; // Date-time
  approval_notes?: string;
  stock_movement: number | null;
  created_at: string; // Date-time
  updated_at: string; // Date-time
}

// ============================================================================
// STOCK TRANSFER TYPES
// ============================================================================

export type TransferStatus = 'pending' | 'approved' | 'rejected' | 'executed';

export interface StockTransferRequest {
  requested_by: number; // Required
  item: number; // Required
  from_location: number; // Required
  to_location: number; // Required
  quantity: string; // Required decimal string ^-?\d{0,16}(?:\.\d{0,2})?$
  unit_cost?: string | null; // Optional decimal string ^-?\d{0,16}(?:\.\d{0,2})?$ - Estimated unit cost for approval decision
  reason: string; // Required non-empty - Reason for transfer
  notes?: string; // Optional
  reference_number?: string; // Optional, max 100 chars
  status?: TransferStatus; // Optional
  approval_notes?: string; // Optional
}

export interface StockTransfer {
  id: number;
  request_number: string;
  requested_by: number;
  requested_by_name: string;
  item: number;
  item_name: string;
  item_sku: string;
  from_location: number;
  from_location_name: string;
  to_location: number;
  to_location_name: string;
  quantity: string; // Decimal string ^-?\d{0,16}(?:\.\d{0,2})?$
  unit_cost?: string | null; // Decimal string ^-?\d{0,16}(?:\.\d{0,2})?$ - Estimated unit cost for approval decision
  estimated_cost: string; // Decimal string ^-?\d{0,16}(?:\.\d{0,2})?$ - Total estimated cost (quantity × unit_cost)
  reason: string; // Reason for transfer
  notes?: string;
  reference_number?: string; // Max 100 chars
  status: TransferStatus;
  approved_by: number | null;
  approved_by_name: string | null;
  approved_at: string | null; // Date-time
  approval_notes?: string;
  transfer_out_movement: number | null;
  transfer_in_movement: number | null;
  created_at: string; // Date-time
  updated_at: string; // Date-time
}

// ============================================================================
// PAGINATION AND RESPONSE TYPES
// ============================================================================

export interface PaginationParams {
  page?: number;
  page_size?: number;
  ordering?: string;
  search?: string;
}

export interface PaginatedResponse<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

// ============================================================================
// CREATE/UPDATE TYPES
// ============================================================================

export interface CreateInventoryItem {
  sku: string; // Required, 1-100 chars
  name: string; // Required, 1-200 chars
  barcode?: string; // Max 100 chars
  description?: string;
  category: number; // Required
  unit_of_measure?: string; // 1-20 chars - unit, kg, liter, box, etc.
  cost_price: string; // Required decimal string - Cost price per unit
  selling_price: string; // Required decimal string - Selling price per unit
  minimum_selling_price?: string | null; // Decimal string - Minimum allowed selling price
  valuation_method?: 'fifo' | 'lifo' | 'average';
  reorder_level?: string; // Decimal string - Trigger reorder when stock reaches this level
  reorder_quantity?: string; // Decimal string - Quantity to reorder
  is_active?: boolean;
  is_sellable?: boolean;
  is_purchasable?: boolean;
  track_serial_numbers?: boolean;
  track_batch_numbers?: boolean;
  track_expiry?: boolean;
}

export interface CreateLocation {
  name: string; // Required, max 200 chars
  code?: string | null; // Max 20 chars - Optional location code
  location_type?: 'warehouse' | 'store' | 'vehicle' | 'other';
  address?: string;
  is_active?: boolean;
}

export interface CreateInventoryCategory {
  name: string; // Required, max 100 chars
  code: string; // Required, max 20 chars
  /** Broad type label for material-request authorization, e.g. 'Book', 'Uniform', 'Stationery' */
  item_type?: string;
  description?: string;
  inventory_account: number; // Required - Asset account for inventory valuation
  cogs_account: number; // Required - Expense account for cost of goods sold
  sales_account: number; // Required - Income account for sales
}

// ============================================================================
// VALIDATION CONSTANTS
// ============================================================================

export const INVENTORY_VALIDATION_RULES = {
  sku: {
    required: true,
    minLength: 1,
    maxLength: 100,
  },
  name: {
    required: true,
    minLength: 1,
    maxLength: 200,
  },
  barcode: {
    maxLength: 100,
  },
  categoryCode: {
    required: true,
    minLength: 1,
    maxLength: 20,
  },
  categoryName: {
    required: true,
    minLength: 1,
    maxLength: 100,
  },
  unitOfMeasure: {
    minLength: 1,
    maxLength: 20,
  },
  locationName: {
    required: true,
    minLength: 1,
    maxLength: 200,
  },
  locationCode: {
    maxLength: 20,
  },
  quantity: {
    required: true,
    min: 0,
    pattern: /^-?\d{0,16}(?:\.\d{0,2})?$/,
  },
  unitCost: {
    min: 0,
    pattern: /^-?\d{0,16}(?:\.\d{0,2})?$/,
  },
  reason: {
    required: true,
    minLength: 1,
  },
  referenceNumber: {
    maxLength: 100,
  },
  batchNumber: {
    maxLength: 100,
  },
  serialNumber: {
    maxLength: 100,
  },
} as const;

// ============================================================================
// ENUM DEFINITIONS
// ============================================================================

export enum MovementTypeEnum {
  PURCHASE = 'purchase',
  SALE = 'sale',
  ADJUSTMENT = 'adjustment',
  TRANSFER = 'transfer',
  RETURN_IN = 'return_in',
  RETURN_OUT = 'return_out',
  WRITE_OFF = 'write_off',
  PRODUCTION_IN = 'production_in',
  PRODUCTION_OUT = 'production_out',
}

export enum AdjustmentTypeEnum {
  INCREASE = 'increase',
  DECREASE = 'decrease',
}

export enum StatusEnum {
  PENDING = 'pending',
  APPROVED = 'approved',
  REJECTED = 'rejected',
  EXECUTED = 'executed',
}

export enum LocationTypeEnum {
  WAREHOUSE = 'warehouse',
  STORE = 'store',
  VEHICLE = 'vehicle',
  OTHER = 'other',
}

export enum ValuationMethodEnum {
  FIFO = 'fifo',
  LIFO = 'lifo',
  AVERAGE = 'average',
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

export const validateDecimalString = (value: string): boolean => {
  return INVENTORY_VALIDATION_RULES.quantity.pattern.test(value);
};

export const formatDecimalString = (value: number): string => {
  return value.toFixed(2);
};

export const parseDecimalString = (value: string): number => {
  return parseFloat(value) || 0;
};

export const getMovementTypeLabel = (type: MovementType): string => {
  const labels: Record<MovementType, string> = {
    purchase: 'Purchase Receipt',
    sale: 'Sales Delivery',
    adjustment: 'Stock Adjustment',
    transfer: 'Transfer',
    return_in: 'Purchase Return',
    return_out: 'Sales Return',
    write_off: 'Write Off',
    production_in: 'Production Receipt',
    production_out: 'Production Issue',
  };
  return labels[type] || type;
};

export const getAdjustmentTypeLabel = (type: AdjustmentType): string => {
  const labels: Record<AdjustmentType, string> = {
    increase: 'Increase Stock',
    decrease: 'Decrease Stock',
  };
  return labels[type] || type;
};

export const getStatusLabel = (status: AdjustmentStatus | TransferStatus): string => {
  const labels: Record<string, string> = {
    pending: 'Pending Approval',
    approved: 'Approved',
    rejected: 'Rejected',
    executed: 'Executed',
  };
  return labels[status] || status;
};

export const getStatusColor = (status: AdjustmentStatus | TransferStatus): string => {
  const colors: Record<string, string> = {
    pending: 'yellow',
    approved: 'green',
    rejected: 'red',
    executed: 'blue',
  };
  return colors[status] || 'gray';
};

// ============================================================================
// VALIDATION FUNCTIONS
// ============================================================================

export const validateStockAdjustmentRequest = (data: Partial<StockAdjustmentRequest>): string[] => {
  const errors: string[] = [];

  if (!data.requested_by) {
    errors.push('Requested by is required');
  }

  if (!data.item) {
    errors.push('Item is required');
  }

  if (!data.location) {
    errors.push('Location is required');
  }

  if (!data.adjustment_type) {
    errors.push('Adjustment type is required');
  }

  if (!data.quantity) {
    errors.push('Quantity is required');
  } else if (!validateDecimalString(data.quantity)) {
    errors.push('Quantity must be a valid decimal string');
  } else if (parseDecimalString(data.quantity) <= 0) {
    errors.push('Quantity must be greater than 0');
  }

  if (data.unit_cost && !validateDecimalString(data.unit_cost)) {
    errors.push('Unit cost must be a valid decimal string');
  }

  if (!data.reason || data.reason.trim().length === 0) {
    errors.push('Reason is required');
  }

  return errors;
};

export const validateStockTransferRequest = (data: Partial<StockTransferRequest>): string[] => {
  const errors: string[] = [];

  if (!data.requested_by) {
    errors.push('Requested by is required');
  }

  if (!data.item) {
    errors.push('Item is required');
  }

  if (!data.from_location) {
    errors.push('From location is required');
  }

  if (!data.to_location) {
    errors.push('To location is required');
  }

  if (data.from_location && data.to_location && data.from_location === data.to_location) {
    errors.push('From location and to location must be different');
  }

  if (!data.quantity) {
    errors.push('Quantity is required');
  } else if (!validateDecimalString(data.quantity)) {
    errors.push('Quantity must be a valid decimal string');
  } else if (parseDecimalString(data.quantity) <= 0) {
    errors.push('Quantity must be greater than 0');
  }

  if (data.unit_cost && !validateDecimalString(data.unit_cost)) {
    errors.push('Unit cost must be a valid decimal string');
  }

  if (!data.reason || data.reason.trim().length === 0) {
    errors.push('Reason is required');
  }

  if (
    data.reference_number &&
    data.reference_number.length > INVENTORY_VALIDATION_RULES.referenceNumber.maxLength
  ) {
    errors.push(
      `Reference number must be ${INVENTORY_VALIDATION_RULES.referenceNumber.maxLength} characters or less`
    );
  }

  return errors;
};
