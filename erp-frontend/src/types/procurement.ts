// Purchase Requisition Types
export interface User {
  id: number;
  username: string;
  first_name: string;
  last_name: string;
  email: string;
}

export interface InventoryItem {
  id: number;
  sku: string; // Max 100 chars
  name: string; // Max 200 chars
  barcode?: string; // Max 100 chars
  description?: string;
  category: number; // Required
  category_name: string; // Required
  unit_of_measure?: string; // Max 20 chars - unit, kg, liter, box, etc.
  cost_price: string; // Required decimal string ^-?\d{0,16}(?:\.\d{0,2})?$ - Cost price per unit
  selling_price: string; // Required decimal string ^-?\d{0,16}(?:\.\d{0,2})?$ - Selling price per unit
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

export interface Department {
  id: number;
  name: string;
  code: string;
}

// Supplier Types
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

// Location Types (imported from inventory)
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

// Requisition to PO Conversion Types
export interface RequisitionToPOConversionData {
  supplier: number;
  delivery_location: number;
  expected_delivery_date: string;
  order_date: string;
  payment_terms: 'cash' | 'net_15' | 'net_30' | 'net_60' | 'net_90' | 'custom';
  custom_payment_terms?: string;
  contact_person?: string;
  contact_phone?: string;
  contact_email?: string;
  notes?: string;
  selected_quote?: number;
}

export interface RequisitionToPOConversionResponse {
  id: number;
  po_number: string;
  supplier: number;
  supplier_name: string;
  delivery_location: number;
  location_name: string;
  expected_delivery_date: string;
  status: string;
  total_amount: string;
  created_at: string;
}

// Requisition Status Enum - Updated to match backend
export enum RequisitionStatus {
  DRAFT = 'draft',
  SUBMITTED = 'submitted',
  APPROVED = 'approved',
  REJECTED = 'rejected',
  PO_CREATED = 'po_created',
  CANCELLED = 'cancelled',
}

// Urgency Level Enum
export enum UrgencyLevel {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical',
}

// Approval Status Enum
export enum ApprovalStatus {
  PENDING = 'pending',
  APPROVED = 'approved',
  REJECTED = 'rejected',
  DELEGATED = 'delegated',
}

// Purchase Requisition Item Interface - Updated to match backend
export interface PurchaseRequisitionItem {
  id?: number;
  item?: number | null; // Optional item reference
  description: string; // Required, non-empty
  quantity: string; // Required decimal string ^-?\d{0,16}(?:\.\d{0,2})?$
  estimated_unit_price: string; // Required decimal string ^-?\d{0,16}(?:\.\d{0,2})?$
  notes?: string; // Optional
  po_item?: number | null; // Optional PO item reference
}

// Purchase Requisition Interface - Updated to match backend exactly
export interface PurchaseRequisition {
  id: number;
  pr_number: string;
  requested_by: number; // Required
  requested_by_name: string; // Required
  department?: string; // Optional, max 100 chars
  request_date?: string; // Optional date
  required_by_date: string; // Required date - "When items are needed"
  purpose: string; // Required - "Reason for purchase"
  status: 'draft' | 'submitted' | 'approved' | 'rejected' | 'po_created' | 'cancelled';

  // Vendor invoice fields (pre-approval requirement)
  vendor_invoice_number?: string;
  vendor_invoice_date?: string;
  vendor_invoice_amount?: string;
  vendor_invoice_file?: string;
  invoice_verified_by?: number;
  invoice_verified_at?: string;

  // Approval fields
  approved_by: number | null; // Required but can be null
  approved_by_name: string | null; // Required but can be null
  approved_at: string | null; // Required but can be null, date-time format
  rejection_reason?: string; // Optional
  estimated_total?: string; // Optional decimal string ^-?\d{0,16}(?:\.\d{0,2})?$
  notes?: string; // Optional
  items: PurchaseRequisitionItem[]; // Array of items
  created_at: string; // Required date-time
  updated_at: string; // Required date-time
  // Workflow fields for dual workflow support
  workflow_run_id?: number; // Optional workflow run ID for automated workflow
  workflow_status?: string; // Optional workflow status
}

// Create Purchase Requisition Data Interface - Updated to match backend
export interface CreatePurchaseRequisitionData {
  requested_by: number; // Required
  department?: string; // Optional, max 100 chars
  request_date?: string; // Optional date
  required_by_date: string; // Required date - "When items are needed"
  purpose: string; // Required, non-empty - "Reason for purchase"
  status?: 'draft' | 'submitted' | 'approved' | 'rejected' | 'po_created' | 'cancelled';
  rejection_reason?: string; // Optional
  estimated_total?: string; // Optional decimal string ^-?\d{0,16}(?:\.\d{0,2})?$
  notes?: string; // Optional
  items: {
    item?: number | null; // Optional item reference
    description: string; // Required, non-empty
    quantity: string; // Required decimal string ^-?\d{0,16}(?:\.\d{0,2})?$
    estimated_unit_price: string; // Required decimal string ^-?\d{0,16}(?:\.\d{0,2})?$
    notes?: string; // Optional
    po_item?: number | null; // Optional PO item reference
  }[];
}

// Update Purchase Requisition Data Interface
export interface UpdatePurchaseRequisitionData extends Partial<CreatePurchaseRequisitionData> {
  status?: 'draft' | 'submitted' | 'approved' | 'rejected' | 'po_created' | 'cancelled';
}

// Requisition Approval Data Interface
export interface RequisitionApprovalData {
  comments?: string;
  action: 'approve' | 'reject' | 'delegate';
  delegated_to_id?: number;
}

// Requisition Filter Interface
export interface RequisitionFilters {
  status?: RequisitionStatus[];
  department_id?: number;
  requester_id?: number;
  priority?: UrgencyLevel[];
  date_from?: string;
  date_to?: string;
  search?: string;
  budget_code?: string;
}

// Validation Rules
export const REQUISITION_VALIDATION_RULES = {
  title: {
    required: true,
    minLength: 3,
    maxLength: 200,
  },
  justification: {
    required: true,
    minLength: 10,
    maxLength: 1000,
  },
  items: {
    required: true,
    minItems: 1,
    maxItems: 50,
  },
  quantity: {
    required: true,
    min: 0.01,
    max: 999999.99,
  },
  estimatedCost: {
    required: true,
    min: 0.01,
    max: 9999999.99,
  },
  specification: {
    required: true,
    minLength: 5,
    maxLength: 500,
  },
  itemJustification: {
    required: true,
    minLength: 5,
    maxLength: 200,
  },
} as const;

// Status transition rules
export const REQUISITION_STATUS_TRANSITIONS: Record<RequisitionStatus, RequisitionStatus[]> = {
  [RequisitionStatus.DRAFT]: [RequisitionStatus.SUBMITTED, RequisitionStatus.CANCELLED],
  [RequisitionStatus.SUBMITTED]: [
    RequisitionStatus.UNDER_REVIEW,
    RequisitionStatus.REJECTED,
    RequisitionStatus.CANCELLED,
  ],
  [RequisitionStatus.UNDER_REVIEW]: [
    RequisitionStatus.APPROVED,
    RequisitionStatus.REJECTED,
    RequisitionStatus.SUBMITTED,
  ],
  [RequisitionStatus.APPROVED]: [RequisitionStatus.CONVERTED, RequisitionStatus.CANCELLED],
  [RequisitionStatus.REJECTED]: [RequisitionStatus.SUBMITTED, RequisitionStatus.CANCELLED],
  [RequisitionStatus.CONVERTED]: [], // Terminal state
  [RequisitionStatus.CANCELLED]: [], // Terminal state
};

// Helper functions for validation
export const validateRequisitionItem = (item: Partial<RequisitionItem>): string[] => {
  const errors: string[] = [];

  if (!item.item_id) {
    errors.push('Item selection is required');
  }

  if (!item.quantity || item.quantity <= 0) {
    errors.push('Quantity must be greater than 0');
  }

  if (!item.estimated_cost || parseFloat(item.estimated_cost) <= 0) {
    errors.push('Estimated cost must be greater than 0');
  }

  if (
    !item.specification ||
    item.specification.length < REQUISITION_VALIDATION_RULES.specification.minLength
  ) {
    errors.push(
      `Specification must be at least ${REQUISITION_VALIDATION_RULES.specification.minLength} characters`
    );
  }

  if (
    !item.justification ||
    item.justification.length < REQUISITION_VALIDATION_RULES.itemJustification.minLength
  ) {
    errors.push(
      `Item justification must be at least ${REQUISITION_VALIDATION_RULES.itemJustification.minLength} characters`
    );
  }

  return errors;
};

export const validatePurchaseRequisition = (
  requisition: Partial<CreatePurchaseRequisitionData>
): string[] => {
  const errors: string[] = [];

  if (
    !requisition.title ||
    requisition.title.length < REQUISITION_VALIDATION_RULES.title.minLength
  ) {
    errors.push(
      `Title must be at least ${REQUISITION_VALIDATION_RULES.title.minLength} characters`
    );
  }

  if (
    !requisition.justification ||
    requisition.justification.length < REQUISITION_VALIDATION_RULES.justification.minLength
  ) {
    errors.push(
      `Justification must be at least ${REQUISITION_VALIDATION_RULES.justification.minLength} characters`
    );
  }

  if (!requisition.department_id) {
    errors.push('Department selection is required');
  }

  if (!requisition.items || requisition.items.length === 0) {
    errors.push('At least one item is required');
  }

  if (requisition.items && requisition.items.length > REQUISITION_VALIDATION_RULES.items.maxItems) {
    errors.push(`Maximum ${REQUISITION_VALIDATION_RULES.items.maxItems} items allowed`);
  }

  // Validate each item
  if (requisition.items) {
    requisition.items.forEach((item, index) => {
      const itemErrors = validateRequisitionItem(item);
      itemErrors.forEach(error => {
        errors.push(`Item ${index + 1}: ${error}`);
      });
    });
  }

  return errors;
};

// Status display helpers
export const getProcurementStatusColor = (status: RequisitionStatus): string => {
  switch (status) {
    case RequisitionStatus.DRAFT:
      return 'gray';
    case RequisitionStatus.SUBMITTED:
      return 'blue';
    case RequisitionStatus.UNDER_REVIEW:
      return 'yellow';
    case RequisitionStatus.APPROVED:
      return 'green';
    case RequisitionStatus.REJECTED:
      return 'red';
    case RequisitionStatus.CONVERTED:
      return 'purple';
    case RequisitionStatus.CANCELLED:
      return 'gray';
    default:
      return 'gray';
  }
};

export const getProcurementStatusLabel = (status: RequisitionStatus): string => {
  switch (status) {
    case RequisitionStatus.DRAFT:
      return 'Draft';
    case RequisitionStatus.SUBMITTED:
      return 'Submitted';
    case RequisitionStatus.UNDER_REVIEW:
      return 'Under Review';
    case RequisitionStatus.APPROVED:
      return 'Approved';
    case RequisitionStatus.REJECTED:
      return 'Rejected';
    case RequisitionStatus.CONVERTED:
      return 'Converted to PO';
    case RequisitionStatus.CANCELLED:
      return 'Cancelled';
    default:
      return 'Unknown';
  }
};

export const getUrgencyColor = (urgency: UrgencyLevel): string => {
  switch (urgency) {
    case UrgencyLevel.LOW:
      return 'green';
    case UrgencyLevel.MEDIUM:
      return 'yellow';
    case UrgencyLevel.HIGH:
      return 'orange';
    case UrgencyLevel.CRITICAL:
      return 'red';
    default:
      return 'gray';
  }
};

export const getUrgencyLabel = (urgency: UrgencyLevel): string => {
  switch (urgency) {
    case UrgencyLevel.LOW:
      return 'Low';
    case UrgencyLevel.MEDIUM:
      return 'Medium';
    case UrgencyLevel.HIGH:
      return 'High';
    case UrgencyLevel.CRITICAL:
      return 'Critical';
    default:
      return 'Unknown';
  }
};

// ============================================================================
// GOODS RECEIVED NOTE (GRN) TYPES
// ============================================================================

// GRN Status Enum
export enum GRNStatus {
  DRAFT = 'draft',
  QUALITY_CHECK = 'quality_check',
  POSTED = 'posted',
  CANCELLED = 'cancelled',
}

// Inspection Status Enum
export enum InspectionStatus {
  PENDING = 'pending',
  PASSED = 'passed',
  FAILED = 'failed',
  PARTIAL = 'partial',
}

// Quality Check Result Enum
export enum QualityCheckResult {
  ACCEPTED = 'accepted',
  REJECTED = 'rejected',
  CONDITIONAL = 'conditional',
}

// Delivery Information Interface
export interface DeliveryInformation {
  delivery_note_number?: string;
  vehicle_number?: string;
  driver_name?: string;
  driver_phone?: string;
  delivery_company?: string;
  received_by_id: number;
  received_by: User;
  delivery_date: string;
  delivery_time?: string;
  special_instructions?: string;
  delivery_condition: 'good' | 'damaged' | 'partial' | 'late';
  photos?: string[]; // Array of photo URLs
}

// Quality Check Information Interface
export interface QualityCheckInfo {
  inspector_id?: number;
  inspector?: User;
  inspection_date?: string;
  inspection_notes?: string;
  overall_condition: 'excellent' | 'good' | 'fair' | 'poor' | 'damaged';
  temperature_check?: number; // For temperature-sensitive items
  weight_check?: number; // Actual weight vs expected
  dimension_check?: string; // Dimension verification notes
  packaging_condition: 'intact' | 'damaged' | 'opened' | 'missing';
  documentation_complete: boolean;
  photos?: string[]; // Array of inspection photo URLs
}

// Batch Tracking Information Interface
export interface BatchTrackingInfo {
  batch_number?: string;
  lot_number?: string;
  serial_number?: string;
  manufacturing_date?: string;
  expiry_date?: string;
  supplier_batch_ref?: string;
  certificate_number?: string;
  test_report_ref?: string;
}

// Purchase Order Item Interface (for GRN reference)
export interface PurchaseOrderItem {
  id: number;
  item_id: number;
  item: InventoryItem;
  quantity: number;
  unit_price: string; // Decimal string
  total_price: string; // Decimal string
  quantity_received: number;
  quantity_pending: number;
  specification?: string;
  notes?: string;
}

// Purchase Order Interface - Updated to match backend API exactly
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

// GRN Item Interface with quality inspection fields
export interface GRNItem {
  id?: number;
  po_item_id: number;
  po_item: PurchaseOrderItem;
  quantity_received: number;
  quantity_accepted: number;
  quantity_rejected: number;
  quantity_pending_inspection: number;
  unit_cost: string; // Decimal string - actual cost per unit
  total_cost: string; // Decimal string - total cost for this item
  inspection_status: InspectionStatus;
  quality_check_result: QualityCheckResult;
  condition_notes?: string;
  rejection_reason?: string;
  batch_tracking: BatchTrackingInfo;
  quality_check: QualityCheckInfo;
  storage_location?: string;
  requires_special_handling: boolean;
  photos?: string[]; // Array of item-specific photo URLs
  created_at?: string;
  updated_at?: string;
}

// Goods Received Note Interface with delivery information
export interface GoodsReceivedNote {
  id?: number;
  grn_number: string;
  purchase_order_id: number;
  purchase_order: PurchaseOrder;
  status: GRNStatus;
  received_date: string;
  delivery_information: DeliveryInformation;
  items: GRNItem[];
  total_received_value: string; // Decimal string
  total_accepted_value: string; // Decimal string
  total_rejected_value: string; // Decimal string
  overall_inspection_status: InspectionStatus;
  posted_to_inventory: boolean;
  posted_to_accounting: boolean;
  inventory_posting_date?: string;
  accounting_posting_date?: string;
  posted_by_id?: number;
  posted_by?: User;
  notes?: string;
  attachments?: string[]; // Array of document URLs
  created_by_id: number;
  created_by: User;
  created_at: string;
  updated_at: string;
}

// Create GRN Data Interface
export interface CreateGRNData {
  purchase_order_id: number;
  received_date: string;
  delivery_information: {
    delivery_note_number?: string;
    vehicle_number?: string;
    driver_name?: string;
    driver_phone?: string;
    delivery_company?: string;
    delivery_date: string;
    delivery_time?: string;
    special_instructions?: string;
    delivery_condition: 'good' | 'damaged' | 'partial' | 'late';
  };
  items: {
    po_item_id: number;
    quantity_received: number;
    quantity_accepted: number;
    quantity_rejected: number;
    unit_cost: string;
    condition_notes?: string;
    rejection_reason?: string;
    batch_tracking: {
      batch_number?: string;
      lot_number?: string;
      serial_number?: string;
      manufacturing_date?: string;
      expiry_date?: string;
      supplier_batch_ref?: string;
      certificate_number?: string;
      test_report_ref?: string;
    };
    quality_check: {
      overall_condition: 'excellent' | 'good' | 'fair' | 'poor' | 'damaged';
      temperature_check?: number;
      weight_check?: number;
      dimension_check?: string;
      packaging_condition: 'intact' | 'damaged' | 'opened' | 'missing';
      documentation_complete: boolean;
      inspection_notes?: string;
    };
    storage_location?: string;
    requires_special_handling: boolean;
  }[];
  notes?: string;
}

// Update GRN Data Interface
export interface UpdateGRNData extends Partial<CreateGRNData> {
  status?: GRNStatus;
}

// GRN Quality Inspection Data Interface
export interface GRNQualityInspectionData {
  inspector_id: number;
  inspection_date: string;
  items: {
    grn_item_id: number;
    quantity_accepted: number;
    quantity_rejected: number;
    quality_check_result: QualityCheckResult;
    inspection_status: InspectionStatus;
    condition_notes?: string;
    rejection_reason?: string;
    quality_check: {
      overall_condition: 'excellent' | 'good' | 'fair' | 'poor' | 'damaged';
      temperature_check?: number;
      weight_check?: number;
      dimension_check?: string;
      packaging_condition: 'intact' | 'damaged' | 'opened' | 'missing';
      documentation_complete: boolean;
      inspection_notes?: string;
    };
  }[];
  overall_inspection_notes?: string;
}

// GRN Posting Data Interface
export interface GRNPostingData {
  post_to_inventory: boolean;
  post_to_accounting: boolean;
  posting_date: string;
  notes?: string;
}

// GRN Filter Interface
export interface GRNFilters {
  status?: GRNStatus[];
  purchase_order_id?: number;
  supplier_id?: number;
  inspection_status?: InspectionStatus[];
  date_from?: string;
  date_to?: string;
  search?: string;
  posted_to_inventory?: boolean;
  posted_to_accounting?: boolean;
}

// GRN Validation Rules
export const GRN_VALIDATION_RULES = {
  receivedDate: {
    required: true,
  },
  deliveryDate: {
    required: true,
  },
  items: {
    required: true,
    minItems: 1,
  },
  quantityReceived: {
    required: true,
    min: 0,
    max: 999999.99,
  },
  quantityAccepted: {
    required: true,
    min: 0,
  },
  quantityRejected: {
    required: true,
    min: 0,
  },
  unitCost: {
    required: true,
    min: 0.01,
    max: 9999999.99,
  },
  driverName: {
    maxLength: 100,
  },
  vehicleNumber: {
    maxLength: 20,
  },
  deliveryNoteNumber: {
    maxLength: 50,
  },
  batchNumber: {
    maxLength: 50,
  },
  serialNumber: {
    maxLength: 50,
  },
  conditionNotes: {
    maxLength: 500,
  },
  inspectionNotes: {
    maxLength: 1000,
  },
} as const;

// Status transition rules for GRN
export const GRN_STATUS_TRANSITIONS: Record<GRNStatus, GRNStatus[]> = {
  [GRNStatus.DRAFT]: [GRNStatus.QUALITY_CHECK, GRNStatus.POSTED, GRNStatus.CANCELLED],
  [GRNStatus.QUALITY_CHECK]: [GRNStatus.POSTED, GRNStatus.DRAFT, GRNStatus.CANCELLED],
  [GRNStatus.POSTED]: [], // Terminal state
  [GRNStatus.CANCELLED]: [], // Terminal state
};

// Helper functions for GRN validation
export const validateGRNItem = (
  item: Partial<CreateGRNData['items'][0]>,
  poItem?: PurchaseOrderItem
): string[] => {
  const errors: string[] = [];

  if (!item.po_item_id) {
    errors.push('Purchase order item selection is required');
  }

  if (item.quantity_received === undefined || item.quantity_received < 0) {
    errors.push('Quantity received must be 0 or greater');
  }

  if (item.quantity_accepted === undefined || item.quantity_accepted < 0) {
    errors.push('Quantity accepted must be 0 or greater');
  }

  if (item.quantity_rejected === undefined || item.quantity_rejected < 0) {
    errors.push('Quantity rejected must be 0 or greater');
  }

  // Validate that accepted + rejected = received
  if (
    item.quantity_received !== undefined &&
    item.quantity_accepted !== undefined &&
    item.quantity_rejected !== undefined
  ) {
    if (item.quantity_accepted + item.quantity_rejected !== item.quantity_received) {
      errors.push('Accepted quantity + Rejected quantity must equal Received quantity');
    }
  }

  // Validate against PO quantity if available
  if (poItem && item.quantity_received !== undefined) {
    const remainingQuantity = poItem.quantity - poItem.quantity_received;
    if (item.quantity_received > remainingQuantity) {
      errors.push(`Cannot receive more than remaining quantity (${remainingQuantity})`);
    }
  }

  if (!item.unit_cost || parseFloat(item.unit_cost) <= 0) {
    errors.push('Unit cost must be greater than 0');
  }

  if (item.quantity_rejected && item.quantity_rejected > 0 && !item.rejection_reason) {
    errors.push('Rejection reason is required when quantity is rejected');
  }

  return errors;
};

export const validateGRN = (grn: Partial<CreateGRNData>): string[] => {
  const errors: string[] = [];

  if (!grn.purchase_order_id) {
    errors.push('Purchase order selection is required');
  }

  if (!grn.received_date) {
    errors.push('Received date is required');
  }

  if (!grn.delivery_information?.delivery_date) {
    errors.push('Delivery date is required');
  }

  if (!grn.items || grn.items.length === 0) {
    errors.push('At least one item is required');
  }

  // Validate each item
  if (grn.items) {
    grn.items.forEach((item, index) => {
      const itemErrors = validateGRNItem(item);
      itemErrors.forEach(error => {
        errors.push(`Item ${index + 1}: ${error}`);
      });
    });
  }

  return errors;
};

// Status display helpers for GRN
export const getGRNStatusColor = (status: GRNStatus): string => {
  switch (status) {
    case GRNStatus.DRAFT:
      return 'gray';
    case GRNStatus.QUALITY_CHECK:
      return 'yellow';
    case GRNStatus.POSTED:
      return 'green';
    case GRNStatus.CANCELLED:
      return 'red';
    default:
      return 'gray';
  }
};

export const getGRNStatusLabel = (status: GRNStatus): string => {
  switch (status) {
    case GRNStatus.DRAFT:
      return 'Draft';
    case GRNStatus.QUALITY_CHECK:
      return 'Quality Check';
    case GRNStatus.POSTED:
      return 'Posted';
    case GRNStatus.CANCELLED:
      return 'Cancelled';
    default:
      return 'Unknown';
  }
};

export const getInspectionStatusColor = (status: InspectionStatus): string => {
  switch (status) {
    case InspectionStatus.PENDING:
      return 'yellow';
    case InspectionStatus.PASSED:
      return 'green';
    case InspectionStatus.FAILED:
      return 'red';
    case InspectionStatus.PARTIAL:
      return 'orange';
    default:
      return 'gray';
  }
};

export const getInspectionStatusLabel = (status: InspectionStatus): string => {
  switch (status) {
    case InspectionStatus.PENDING:
      return 'Pending';
    case InspectionStatus.PASSED:
      return 'Passed';
    case InspectionStatus.FAILED:
      return 'Failed';
    case InspectionStatus.PARTIAL:
      return 'Partial';
    default:
      return 'Unknown';
  }
};

export const getQualityCheckResultColor = (result: QualityCheckResult): string => {
  switch (result) {
    case QualityCheckResult.ACCEPTED:
      return 'green';
    case QualityCheckResult.REJECTED:
      return 'red';
    case QualityCheckResult.CONDITIONAL:
      return 'orange';
    default:
      return 'gray';
  }
};

export const getQualityCheckResultLabel = (result: QualityCheckResult): string => {
  switch (result) {
    case QualityCheckResult.ACCEPTED:
      return 'Accepted';
    case QualityCheckResult.REJECTED:
      return 'Rejected';
    case QualityCheckResult.CONDITIONAL:
      return 'Conditional';
    default:
      return 'Unknown';
  }
};

// ============================================================================
// INVENTORY AND ACCOUNTING INTEGRATION TYPES
// ============================================================================

// Inventory Movement Types
export interface InventoryMovement {
  id: number;
  item_id: number;
  item: InventoryItem;
  location_id: number;
  location: {
    id: number;
    name: string;
    code: string;
  };
  movement_type: 'receipt' | 'issue' | 'adjustment' | 'transfer' | 'return';
  quantity: string; // Decimal string
  unit_cost: string; // Decimal string
  total_cost: string; // Decimal string
  reference_number: string;
  reference_type: 'grn' | 'return' | 'adjustment' | 'transfer';
  reference_id: number;
  batch_number?: string;
  serial_number?: string;
  expiry_date?: string;
  movement_date: string;
  notes?: string;
  created_by_id: number;
  created_by: User;
  created_at: string;
}

// Stock Update Types
export interface StockUpdate {
  item_id: number;
  location_id: number;
  previous_quantity: string; // Decimal string
  new_quantity: string; // Decimal string
  quantity_change: string; // Decimal string
  previous_value: string; // Decimal string
  new_value: string; // Decimal string
  value_change: string; // Decimal string
  average_cost: string; // Decimal string
  updated_at: string;
}

// Journal Entry Types
export interface JournalEntry {
  id: number;
  entry_number: string;
  entry_date: string;
  description: string;
  reference_type: 'grn' | 'return' | 'adjustment';
  reference_id: number;
  reference_number: string;
  total_debit: string; // Decimal string
  total_credit: string; // Decimal string
  is_posted: boolean;
  posted_at?: string;
  posted_by_id?: number;
  posted_by?: User;
  line_items: JournalEntryLineItem[];
  created_by_id: number;
  created_by: User;
  created_at: string;
}

export interface JournalEntryLineItem {
  id: number;
  account_id: string;
  account: {
    id: string;
    code: string;
    name: string;
    type: 'ASSET' | 'LIABILITY' | 'EQUITY' | 'INCOME' | 'EXPENSE';
  };
  description: string;
  debit_amount: string; // Decimal string
  credit_amount: string; // Decimal string
  cost_center_id?: number;
  cost_center?: CostCenter;
  budget_code_id?: number;
  budget_code?: BudgetCode;
}

// Accounts Payable Entry Types
export interface AccountsPayableEntry {
  id: number;
  supplier_id: number;
  supplier: {
    id: number;
    name: string;
    code: string;
  };
  invoice_number?: string;
  invoice_date?: string;
  due_date?: string;
  amount: string; // Decimal string
  tax_amount: string; // Decimal string
  total_amount: string; // Decimal string
  paid_amount: string; // Decimal string
  outstanding_amount: string; // Decimal string
  status: 'pending' | 'partial' | 'paid' | 'overdue' | 'cancelled';
  reference_type: 'grn' | 'return';
  reference_id: number;
  reference_number: string;
  payment_terms: string;
  notes?: string;
  created_at: string;
  updated_at: string;
}

// ============================================================================
// SUPPLIER QUOTES WORKFLOW TYPES
// ============================================================================

// Quote Status Enum
export enum QuoteStatus {
  RECEIVED = 'received',
  SELECTED = 'selected',
  REJECTED = 'rejected',
  EXPIRED = 'expired',
}

// Quote Item Interface
export interface QuoteItem {
  id: number;
  item: number;
  item_name: string;
  description: string;
  quantity: string; // Decimal string
  unit_price: string; // Decimal string
  total_price: string; // Decimal string
  lead_time_days: number;
}

// Quote Interface
export interface Quote {
  id: number;
  quote_number: string;
  requisition: number | null;
  supplier: number;
  supplier_name: string;
  quote_date: string;
  valid_until: string;
  status: 'received' | 'selected' | 'rejected' | 'expired';
  payment_terms: string;
  delivery_terms: string;
  notes: string;
  attachment?: string;
  total_amount: string; // Decimal string
  items: QuoteItem[];
  created_at: string;
  updated_at: string;
}

// Quote Creation Data Interface
export interface CreateQuoteData {
  requisition?: number | null;
  supplier: number;
  quote_date: string;
  valid_until: string;
  status?: 'received' | 'selected' | 'rejected' | 'expired';
  payment_terms?: string;
  delivery_terms?: string;
  notes?: string;
  attachment?: string;
  items: {
    item: number;
    description: string;
    quantity: string; // Decimal string
    unit_price: string; // Decimal string
    lead_time_days?: number;
  }[];
}

// Quote Update Data Interface
export interface UpdateQuoteData extends Partial<CreateQuoteData> {
  status?: 'received' | 'selected' | 'rejected' | 'expired';
}

// Quote Comparison Interface
export interface QuoteComparison {
  requisition: number;
  quotes: Quote[];
  comparison_matrix: ComparisonRow[];
}

// Comparison Row Interface
export interface ComparisonRow {
  item_id: number;
  item_name: string;
  quantity: string;
  quotes: {
    quote_id: number;
    supplier_name: string;
    unit_price: string;
    total_price: string;
    lead_time_days: number;
  }[];
  lowest_price_quote_id: number;
}

// Quote List Parameters Interface
export interface QuoteListParams {
  search?: string;
  status?: QuoteStatus;
  supplier_id?: number;
  requisition_id?: number;
  date_from?: string;
  date_to?: string;
  page?: number;
  ordering?: string;
}

// Quote Selection Data Interface
export interface QuoteSelectionData {
  comments?: string;
}

// Quote Filter Interface
export interface QuoteFilters {
  status?: QuoteStatus[];
  supplier_id?: number;
  requisition_id?: number;
  date_from?: string;
  date_to?: string;
  search?: string;
}

// Quote Validation Rules
export const QUOTE_VALIDATION_RULES = {
  supplier: {
    required: true,
  },
  quoteDate: {
    required: true,
  },
  validUntil: {
    required: true,
  },
  items: {
    required: true,
    minItems: 1,
  },
  quantity: {
    required: true,
    min: 0.01,
    max: 999999.99,
  },
  unitPrice: {
    required: true,
    min: 0.01,
    max: 9999999.99,
  },
  leadTimeDays: {
    min: 0,
    max: 365,
  },
  paymentTerms: {
    maxLength: 200,
  },
  deliveryTerms: {
    maxLength: 200,
  },
  notes: {
    maxLength: 1000,
  },
} as const;

// Status transition rules for Quotes
export const QUOTE_STATUS_TRANSITIONS: Record<QuoteStatus, QuoteStatus[]> = {
  [QuoteStatus.RECEIVED]: [QuoteStatus.SELECTED, QuoteStatus.REJECTED, QuoteStatus.EXPIRED],
  [QuoteStatus.SELECTED]: [QuoteStatus.REJECTED], // Can be unselected
  [QuoteStatus.REJECTED]: [QuoteStatus.RECEIVED], // Can be reconsidered
  [QuoteStatus.EXPIRED]: [], // Terminal state
};

// Helper functions for Quote validation
export const validateQuoteItem = (item: Partial<CreateQuoteData['items'][0]>): string[] => {
  const errors: string[] = [];

  if (!item.item) {
    errors.push('Item selection is required');
  }

  if (!item.quantity || parseFloat(item.quantity) <= 0) {
    errors.push('Quantity must be greater than 0');
  }

  if (!item.unit_price || parseFloat(item.unit_price) <= 0) {
    errors.push('Unit price must be greater than 0');
  }

  if (!item.description || item.description.trim().length === 0) {
    errors.push('Item description is required');
  }

  if (item.lead_time_days !== undefined && item.lead_time_days < 0) {
    errors.push('Lead time cannot be negative');
  }

  return errors;
};

export const validateQuote = (quote: Partial<CreateQuoteData>): string[] => {
  const errors: string[] = [];

  if (!quote.supplier) {
    errors.push('Supplier selection is required');
  }

  if (!quote.quote_date) {
    errors.push('Quote date is required');
  }

  if (!quote.valid_until) {
    errors.push('Valid until date is required');
  }

  if (quote.quote_date && quote.valid_until && quote.quote_date >= quote.valid_until) {
    errors.push('Valid until date must be after quote date');
  }

  if (!quote.items || quote.items.length === 0) {
    errors.push('At least one item is required');
  }

  // Validate each item
  if (quote.items) {
    quote.items.forEach((item, index) => {
      const itemErrors = validateQuoteItem(item);
      itemErrors.forEach(error => {
        errors.push(`Item ${index + 1}: ${error}`);
      });
    });
  }

  return errors;
};

// Status display helpers for Quotes
export const getQuoteStatusColor = (status: QuoteStatus): string => {
  switch (status) {
    case QuoteStatus.RECEIVED:
      return 'blue';
    case QuoteStatus.SELECTED:
      return 'green';
    case QuoteStatus.REJECTED:
      return 'red';
    case QuoteStatus.EXPIRED:
      return 'gray';
    default:
      return 'gray';
  }
};

export const getQuoteStatusLabel = (status: QuoteStatus): string => {
  switch (status) {
    case QuoteStatus.RECEIVED:
      return 'Received';
    case QuoteStatus.SELECTED:
      return 'Selected';
    case QuoteStatus.REJECTED:
      return 'Rejected';
    case QuoteStatus.EXPIRED:
      return 'Expired';
    default:
      return 'Unknown';
  }
};

// Cost Center Types
export interface CostCenter {
  id: number;
  code: string;
  name: string;
  description?: string;
  parent_id?: number;
  parent?: CostCenter;
  is_active: boolean;
  budget_allocated: string; // Decimal string
  budget_utilized: string; // Decimal string
  budget_remaining: string; // Decimal string
  created_at: string;
  updated_at: string;
}

// Budget Code Types
export interface BudgetCode {
  id: number;
  code: string;
  name: string;
  description?: string;
  cost_center_id: number;
  cost_center: CostCenter;
  budget_amount: string; // Decimal string
  utilized_amount: string; // Decimal string
  committed_amount: string; // Decimal string
  available_amount: string; // Decimal string
  budget_period: 'monthly' | 'quarterly' | 'yearly';
  start_date: string;
  end_date: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

// Budget Utilization Types
export interface BudgetUtilization {
  budget_code: BudgetCode;
  period_start: string;
  period_end: string;
  total_budget: string; // Decimal string
  utilized_amount: string; // Decimal string
  committed_amount: string; // Decimal string
  available_amount: string; // Decimal string
  utilization_percentage: number;
  transactions: BudgetTransaction[];
}

export interface BudgetTransaction {
  id: number;
  transaction_date: string;
  reference_type: 'requisition' | 'purchase_order' | 'grn' | 'return';
  reference_id: number;
  reference_number: string;
  description: string;
  amount: string; // Decimal string
  transaction_type: 'committed' | 'utilized';
}

// ============================================================================
// DUAL REQUISITION WORKFLOW TYPES
// ============================================================================

// Workflow API Types - New interfaces for dual requisition workflow
export interface WorkflowRequisitionData {
  department: string;
  purpose: string;
  required_by_date: string;
  items: {
    item: number;
    quantity: number;
    estimated_unit_price: string;
  }[];
}

export interface WorkflowRequisitionResponse {
  pr_id: number;
  pr_number: string;
  workflow_run_id: number;
  status: 'submitted';
}

// Enhanced Purchase Requisition with workflow information
export interface EnhancedPurchaseRequisition extends PurchaseRequisition {
  workflow_run_id?: number;
  workflow_status?: string;
  approval_inbox_url?: string;
}

// Form submission types for dual workflow
export type RequisitionSubmissionType = 'draft' | 'manual' | 'workflow';

// Enhanced form state for dual workflow support
export interface EnhancedRequisitionFormState {
  submissionType?: RequisitionSubmissionType;
  workflowInfo?: {
    workflow_run_id?: number;
    workflow_status?: string;
  };
}

// Data transformation interfaces
export interface RequisitionDataTransformer {
  toManualWorkflowFormat(formData: any): CreatePurchaseRequisitionData;
  toWorkflowFormat(formData: any): WorkflowRequisitionData;
}

// Validation result interface for enhanced validation
export interface EnhancedValidationResult {
  isValid: boolean;
  errors: Record<string, string>;
  canSubmitAsDraft: boolean;
  canSubmitForApproval: boolean;
  canCreateWithWorkflow: boolean;
}

// Workflow permissions interface
export interface WorkflowPermissions {
  canCreateDraft: boolean;
  canSubmitForApproval: boolean;
  canCreateWithWorkflow: boolean;
  canConvertToPO: boolean;
}

// Budget Validation Types
export interface BudgetValidationResult {
  is_valid: boolean;
  available_amount: string; // Decimal string
  requested_amount: string; // Decimal string
  remaining_amount: string; // Decimal string
  validation_message: string;
  warnings?: string[];
  budget_code: BudgetCode;
}

// Procurement Analytics Types
export interface ProcurementAnalytics {
  period_start: string;
  period_end: string;
  total_purchase_orders: number;
  total_po_value: string; // Decimal string
  total_grns: number;
  total_grn_value: string; // Decimal string
  total_returns: number;
  total_return_value: string; // Decimal string
  supplier_performance: SupplierPerformance[];
  category_analysis: CategoryAnalysis[];
  cost_center_utilization: CostCenterUtilization[];
  monthly_trends: MonthlyTrend[];
}

export interface SupplierPerformance {
  supplier: {
    id: number;
    name: string;
    code: string;
  };
  total_orders: number;
  total_value: string; // Decimal string
  on_time_deliveries: number;
  late_deliveries: number;
  quality_issues: number;
  return_rate: number; // Percentage
  average_delivery_days: number;
  performance_score: number; // 0-100
}

export interface CategoryAnalysis {
  category: {
    id: number;
    name: string;
    code: string;
  };
  total_orders: number;
  total_value: string; // Decimal string
  average_order_value: string; // Decimal string
  top_suppliers: {
    supplier_name: string;
    order_count: number;
    total_value: string;
  }[];
}

export interface CostCenterUtilization {
  cost_center: CostCenter;
  total_budget: string; // Decimal string
  utilized_amount: string; // Decimal string
  utilization_percentage: number;
  order_count: number;
  average_order_value: string; // Decimal string
}

export interface MonthlyTrend {
  month: string; // YYYY-MM format
  purchase_orders: number;
  po_value: string; // Decimal string
  grns: number;
  grn_value: string; // Decimal string
  returns: number;
  return_value: string; // Decimal string
}

// Inventory Impact Report Types
export interface InventoryImpactReport {
  period_start: string;
  period_end: string;
  total_receipts: number;
  total_receipt_value: string; // Decimal string
  total_returns: number;
  total_return_value: string; // Decimal string
  net_inventory_change: string; // Decimal string
  location_analysis: LocationInventoryAnalysis[];
  category_analysis: CategoryInventoryAnalysis[];
  item_movements: ItemMovementSummary[];
}

export interface LocationInventoryAnalysis {
  location: {
    id: number;
    name: string;
    code: string;
  };
  receipts_count: number;
  receipts_value: string; // Decimal string
  returns_count: number;
  returns_value: string; // Decimal string
  net_change_value: string; // Decimal string
  current_stock_value: string; // Decimal string
}

export interface CategoryInventoryAnalysis {
  category: {
    id: number;
    name: string;
    code: string;
  };
  receipts_count: number;
  receipts_value: string; // Decimal string
  returns_count: number;
  returns_value: string; // Decimal string
  net_change_value: string; // Decimal string
  current_stock_value: string; // Decimal string
}

export interface ItemMovementSummary {
  item: InventoryItem;
  total_receipts: number;
  total_receipt_value: string; // Decimal string
  total_returns: number;
  total_return_value: string; // Decimal string
  net_quantity_change: string; // Decimal string
  net_value_change: string; // Decimal string
  current_stock_quantity: string; // Decimal string
  current_stock_value: string; // Decimal string
}

// Accounting Impact Report Types
export interface AccountingImpactReport {
  period_start: string;
  period_end: string;
  total_ap_entries: number;
  total_ap_value: string; // Decimal string
  total_journal_entries: number;
  total_journal_value: string; // Decimal string
  cost_center_analysis: CostCenterAccountingAnalysis[];
  account_analysis: AccountAnalysis[];
  budget_impact: BudgetImpactSummary[];
}

export interface CostCenterAccountingAnalysis {
  cost_center: CostCenter;
  total_transactions: number;
  total_value: string; // Decimal string
  budget_utilization: number; // Percentage
  variance_amount: string; // Decimal string
  variance_percentage: number;
}

export interface AccountAnalysis {
  account: {
    id: string;
    code: string;
    name: string;
    type: 'ASSET' | 'LIABILITY' | 'EQUITY' | 'INCOME' | 'EXPENSE';
  };
  total_debits: string; // Decimal string
  total_credits: string; // Decimal string
  net_balance: string; // Decimal string
  transaction_count: number;
}

export interface BudgetImpactSummary {
  budget_code: BudgetCode;
  period_budget: string; // Decimal string
  utilized_amount: string; // Decimal string
  committed_amount: string; // Decimal string
  variance_amount: string; // Decimal string
  variance_percentage: number;
  transaction_count: number;
}

// Integration Status Types
export interface GRNIntegrationStatus {
  grn_id: number;
  grn_number: string;
  inventory_posted: boolean;
  inventory_posted_at?: string;
  inventory_posted_by?: User;
  accounting_posted: boolean;
  accounting_posted_at?: string;
  accounting_posted_by?: User;
  inventory_movements: InventoryMovement[];
  journal_entries: JournalEntry[];
  accounts_payable_entries: AccountsPayableEntry[];
  integration_errors: IntegrationError[];
  can_reverse_inventory: boolean;
  can_reverse_accounting: boolean;
}

export interface ReturnIntegrationStatus {
  return_id: number;
  return_number: string;
  inventory_posted: boolean;
  inventory_posted_at?: string;
  inventory_posted_by?: User;
  accounting_posted: boolean;
  accounting_posted_at?: string;
  accounting_posted_by?: User;
  inventory_movements: InventoryMovement[];
  journal_entries: JournalEntry[];
  accounts_payable_adjustments: AccountsPayableEntry[];
  integration_errors: IntegrationError[];
  can_reverse_inventory: boolean;
  can_reverse_accounting: boolean;
}

export interface IntegrationError {
  id: number;
  error_type: 'inventory' | 'accounting' | 'budget' | 'validation';
  error_code: string;
  error_message: string;
  error_details: any;
  occurred_at: string;
  resolved: boolean;
  resolved_at?: string;
  resolved_by?: User;
  resolution_notes?: string;
}

export interface PendingIntegration {
  id: number;
  entity_type: 'grn' | 'return';
  entity_id: number;
  entity_number: string;
  pending_systems: ('inventory' | 'accounting')[];
  priority: 'low' | 'medium' | 'high' | 'urgent';
  created_at: string;
  days_pending: number;
  estimated_value: string; // Decimal string
  supplier_name?: string;
  location_name?: string;
}

export interface BatchProcessingResult {
  total_processed: number;
  successful: number;
  failed: number;
  success_ids: number[];
  failed_items: {
    id: number;
    error_message: string;
    error_code?: string;
  }[];
  processing_summary: {
    inventory_updates: number;
    accounting_entries: number;
    budget_transactions: number;
    total_value_processed: string; // Decimal string
  };
}

export interface SupplierPerformanceMetrics {
  receipts_count: number;
  receipts_value: string; // Decimal string
  returns_count: number;
  returns_value: string; // Decimal string
  net_change_value: string; // Decimal string
  turnover_rate: number;
}

export interface ItemMovementSummary {
  item: InventoryItem;
  receipts_quantity: string; // Decimal string
  receipts_value: string; // Decimal string
  returns_quantity: string; // Decimal string
  returns_value: string; // Decimal string
  net_quantity_change: string; // Decimal string
  net_value_change: string; // Decimal string
  current_stock: string; // Decimal string
  current_value: string; // Decimal string
}

// Accounting Impact Report Types
export interface AccountingImpactReport {
  period_start: string;
  period_end: string;
  total_journal_entries: number;
  total_debit_amount: string; // Decimal string
  total_credit_amount: string; // Decimal string
  accounts_payable_created: string; // Decimal string
  accounts_payable_adjusted: string; // Decimal string
  account_analysis: AccountAnalysis[];
  cost_center_analysis: CostCenterAnalysis[];
  monthly_postings: MonthlyPosting[];
}

export interface AccountAnalysis {
  account: {
    id: string;
    code: string;
    name: string;
    type: 'ASSET' | 'LIABILITY' | 'EQUITY' | 'INCOME' | 'EXPENSE';
  };
  debit_amount: string; // Decimal string
  credit_amount: string; // Decimal string
  net_amount: string; // Decimal string
  transaction_count: number;
}

export interface CostCenterAnalysis {
  cost_center: CostCenter;
  total_amount: string; // Decimal string
  transaction_count: number;
  budget_utilization_percentage: number;
}

export interface MonthlyPosting {
  month: string; // YYYY-MM format
  journal_entries: number;
  debit_amount: string; // Decimal string
  credit_amount: string; // Decimal string
  accounts_payable_amount: string; // Decimal string
}

// Integration Status Types
export interface GRNIntegrationStatus {
  grn_id: number;
  grn_number: string;
  inventory_posted: boolean;
  inventory_posted_at?: string;
  inventory_posted_by?: User;
  accounting_posted: boolean;
  accounting_posted_at?: string;
  accounting_posted_by?: User;
  inventory_movements: InventoryMovement[];
  journal_entries: JournalEntry[];
  accounts_payable_entries: AccountsPayableEntry[];
  integration_errors: IntegrationError[];
}

export interface ReturnIntegrationStatus {
  return_id: number;
  return_number: string;
  inventory_posted: boolean;
  inventory_posted_at?: string;
  inventory_posted_by?: User;
  accounting_posted: boolean;
  accounting_posted_at?: string;
  accounting_posted_by?: User;
  inventory_movements: InventoryMovement[];
  journal_entries: JournalEntry[];
  accounts_payable_adjustments: AccountsPayableEntry[];
  integration_errors: IntegrationError[];
}

export interface IntegrationError {
  id: number;
  error_type: 'inventory' | 'accounting' | 'validation';
  error_code: string;
  error_message: string;
  error_details?: any;
  occurred_at: string;
  resolved: boolean;
  resolved_at?: string;
  resolved_by?: User;
  resolution_notes?: string;
}

// Pending Integration Types
export interface PendingIntegration {
  id: number;
  entity_type: 'grn' | 'return';
  entity_id: number;
  entity_number: string;
  pending_systems: ('inventory' | 'accounting')[];
  priority: 'low' | 'medium' | 'high' | 'urgent';
  created_at: string;
  due_date?: string;
  assigned_to?: User;
  notes?: string;
}

// Batch Processing Types
export interface BatchProcessingResult {
  total_processed: number;
  successful: number;
  failed: number;
  success_items: BatchProcessingItem[];
  failed_items: BatchProcessingItem[];
  processing_summary: {
    inventory_movements_created: number;
    journal_entries_created: number;
    accounts_payable_entries_created: number;
    total_value_processed: string; // Decimal string
  };
  started_at: string;
  completed_at: string;
  processing_time_seconds: number;
}

export interface BatchProcessingItem {
  entity_id: number;
  entity_number: string;
  status: 'success' | 'failed';
  error_message?: string;
  inventory_movements?: InventoryMovement[];
  journal_entries?: JournalEntry[];
  accounts_payable_entries?: AccountsPayableEntry[];
}

// Integration Validation Types
export interface IntegrationValidation {
  is_valid: boolean;
  validation_errors: ValidationError[];
  validation_warnings: ValidationWarning[];
  can_proceed: boolean;
}

export interface ValidationError {
  field: string;
  message: string;
  error_code: string;
}

export interface ValidationWarning {
  field: string;
  message: string;
  warning_code: string;
}

// ============================================================================
// PURCHASE RETURNS TYPES
// ============================================================================

// Return Status Enum
export enum ReturnStatus {
  PENDING = 'pending',
  APPROVED = 'approved',
  SHIPPED = 'shipped',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled',
}

// Return Reason Enum - categorization system
export enum ReturnReason {
  DAMAGED = 'damaged',
  WRONG_ITEM = 'wrong_item',
  DEFECTIVE = 'defective',
  QUALITY_ISSUES = 'quality_issues',
  EXPIRED = 'expired',
  OVERDELIVERY = 'overdelivery',
  NOT_ORDERED = 'not_ordered',
  SPECIFICATION_MISMATCH = 'specification_mismatch',
  PACKAGING_ISSUES = 'packaging_issues',
  OTHER = 'other',
}

// Refund Method Enum
export enum RefundMethod {
  CREDIT_NOTE = 'credit_note',
  CASH_REFUND = 'cash_refund',
  REPLACEMENT = 'replacement',
  ACCOUNT_CREDIT = 'account_credit',
  DEBIT_NOTE = 'debit_note',
}

// Return Condition Enum
export enum ReturnCondition {
  NEW = 'new',
  USED = 'used',
  DAMAGED = 'damaged',
  DEFECTIVE = 'defective',
  EXPIRED = 'expired',
  OPENED = 'opened',
  INCOMPLETE = 'incomplete',
}

// Return Priority Enum
export enum ReturnPriority {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  URGENT = 'urgent',
}

// Credit Note Information Interface
export interface CreditNoteInfo {
  credit_note_number?: string;
  credit_note_date?: string;
  credit_amount: string; // Decimal string
  tax_amount: string; // Decimal string
  total_credit_amount: string; // Decimal string
  issued_by_supplier: boolean;
  received_date?: string;
  notes?: string;
  attachments?: string[]; // Array of credit note document URLs
}

// Return Shipping Information Interface
export interface ReturnShippingInfo {
  shipping_method?: string;
  tracking_number?: string;
  shipping_cost: string; // Decimal string
  shipped_date?: string;
  expected_delivery_date?: string;
  shipping_company?: string;
  pickup_scheduled: boolean;
  pickup_date?: string;
  pickup_address?: string;
  special_instructions?: string;
}

// Return Item Interface with return reasons
export interface ReturnItem {
  id?: number;
  grn_item_id: number;
  grn_item: GRNItem;
  quantity_returned: number;
  unit_cost: string; // Decimal string - cost per unit being returned
  total_return_value: string; // Decimal string - total value of returned quantity
  return_reason: ReturnReason;
  return_condition: ReturnCondition;
  condition_description: string;
  quality_issue_details?: string;
  batch_number?: string;
  serial_number?: string;
  replacement_requested: boolean;
  replacement_item_id?: number;
  replacement_item?: InventoryItem;
  photos?: string[]; // Array of return item photo URLs
  inspection_notes?: string;
  supplier_acknowledgment: boolean;
  supplier_response?: string;
  created_at?: string;
  updated_at?: string;
}

// Purchase Return Enums - Updated to match backend
export enum ReturnReason {
  DAMAGED = 'damaged',
  WRONG_ITEM = 'wrong_item',
  DEFECTIVE = 'defective',
  EXCESS = 'excess',
  QUALITY = 'quality',
  OTHER = 'other',
}

export enum ReturnStatus {
  PENDING = 'pending',
  APPROVED = 'approved',
  SHIPPED = 'shipped',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled',
}

export enum RefundMethod {
  CREDIT_NOTE = 'credit_note',
  CASH = 'cash',
  REPLACEMENT = 'replacement',
}

// Purchase Return Item Interface - Updated to match backend
export interface PurchaseReturnItem {
  id?: number;
  grn_item: number; // Required - GRN item reference
  item: number; // Required - item reference
  quantity_returned: string; // Required decimal string ^-?\d{0,16}(?:\.\d{0,2})?$
  unit_cost: string; // Required decimal string ^-?\d{0,16}(?:\.\d{0,2})?$
  total_cost: string; // Required decimal string ^-?\d{0,16}(?:\.\d{0,2})?$
  reason: string; // Required, non-empty
}

// Purchase Return Interface - Updated to match backend exactly
export interface PurchaseReturn {
  id: number;
  return_number: string;
  grn: number; // Required - GRN reference
  grn_number: string;
  supplier: number; // Required - supplier ID
  supplier_name: string;
  return_date?: string; // Optional date
  return_reason: 'damaged' | 'wrong_item' | 'defective' | 'excess' | 'quality' | 'other';
  status: 'pending' | 'approved' | 'shipped' | 'completed' | 'cancelled';
  total_amount?: string; // Optional decimal string ^-?\d{0,16}(?:\.\d{0,2})?$
  refund_method: 'credit_note' | 'cash' | 'replacement';
  refund_received?: boolean;
  refund_date?: string | null;
  is_posted: boolean; // Required
  posted_at: string | null; // Required but can be null
  notes?: string;
  items: PurchaseReturnItem[];
  created_at: string;
  updated_at: string;
}

// Create Purchase Return Data Interface - Updated to match backend
export interface CreatePurchaseReturnData {
  grn: number; // Required - GRN reference
  supplier: number; // Required - supplier ID
  return_date?: string; // Optional date
  return_reason: 'damaged' | 'wrong_item' | 'defective' | 'excess' | 'quality' | 'other';
  status?: 'pending' | 'approved' | 'shipped' | 'completed' | 'cancelled';
  total_amount?: string; // Optional decimal string ^-?\d{0,16}(?:\.\d{0,2})?$
  refund_method: 'credit_note' | 'cash' | 'replacement';
  refund_received?: boolean;
  refund_date?: string | null;
  notes?: string;
  items: {
    grn_item: number; // Required - GRN item reference
    item: number; // Required - item reference
    quantity_returned: string; // Required decimal string ^-?\d{0,16}(?:\.\d{0,2})?$
    unit_cost: string; // Required decimal string ^-?\d{0,16}(?:\.\d{0,2})?$
    total_cost: string; // Required decimal string ^-?\d{0,16}(?:\.\d{0,2})?$
    reason: string; // Required, non-empty
  }[];
}

// Update Purchase Return Data Interface
export interface UpdatePurchaseReturnData extends Partial<CreatePurchaseReturnData> {
  status?: ReturnStatus;
  supplier_response_received?: boolean;
  supplier_response_date?: string;
  supplier_response?: string;
  quality_control_completed?: boolean;
  quality_control_date?: string;
  quality_control_notes?: string;
  credit_note_info?: {
    credit_note_number?: string;
    credit_note_date?: string;
    credit_amount: string;
    tax_amount: string;
    total_credit_amount: string;
    issued_by_supplier: boolean;
    received_date?: string;
    notes?: string;
  };
  shipping_info?: {
    tracking_number?: string;
    shipped_date?: string;
    expected_delivery_date?: string;
    shipping_company?: string;
    special_instructions?: string;
  };
}

// Return Approval Data Interface
export interface ReturnApprovalData {
  action: 'approve' | 'reject';
  comments?: string;
  approved_items?: {
    return_item_id: number;
    approved_quantity: number;
    approved_refund_method: RefundMethod;
  }[];
}

// Return Posting Data Interface
export interface ReturnPostingData {
  post_inventory_adjustment: boolean;
  post_accounts_payable_adjustment: boolean;
  posting_date: string;
  notes?: string;
}

// Purchase Return Filter Interface
export interface PurchaseReturnFilters {
  status?: ReturnStatus[];
  supplier_id?: number;
  grn_id?: number;
  reason_category?: ReturnReason[];
  priority?: ReturnPriority[];
  refund_method?: RefundMethod[];
  date_from?: string;
  date_to?: string;
  search?: string;
  supplier_response_received?: boolean;
  quality_control_required?: boolean;
  quality_control_completed?: boolean;
  accounting_impact_calculated?: boolean;
}

// Return Validation Rules
export const RETURN_VALIDATION_RULES = {
  returnDescription: {
    required: true,
    minLength: 10,
    maxLength: 500,
  },
  items: {
    required: true,
    minItems: 1,
    maxItems: 50,
  },
  quantityReturned: {
    required: true,
    min: 0.01,
    max: 999999.99,
  },
  conditionDescription: {
    required: true,
    minLength: 5,
    maxLength: 300,
  },
  qualityIssueDetails: {
    maxLength: 500,
  },
  inspectionNotes: {
    maxLength: 500,
  },
  returnAuthorizationNumber: {
    maxLength: 50,
  },
  supplierContactMethod: {
    maxLength: 100,
  },
  shippingCost: {
    min: 0,
    max: 999999.99,
  },
  creditAmount: {
    required: true,
    min: 0.01,
    max: 9999999.99,
  },
  notes: {
    maxLength: 1000,
  },
} as const;

// Status transition rules for Purchase Returns
export const RETURN_STATUS_TRANSITIONS: Record<ReturnStatus, ReturnStatus[]> = {
  [ReturnStatus.PENDING]: [ReturnStatus.APPROVED, ReturnStatus.CANCELLED],
  [ReturnStatus.APPROVED]: [ReturnStatus.SHIPPED, ReturnStatus.CANCELLED],
  [ReturnStatus.SHIPPED]: [ReturnStatus.COMPLETED, ReturnStatus.CANCELLED],
  [ReturnStatus.COMPLETED]: [], // Terminal state
  [ReturnStatus.CANCELLED]: [], // Terminal state
};

// Helper functions for Purchase Return validation
export const validateReturnItem = (
  item: Partial<CreatePurchaseReturnData['items'][0]>,
  grnItem?: GRNItem
): string[] => {
  const errors: string[] = [];

  if (!item.grn_item_id) {
    errors.push('GRN item selection is required');
  }

  if (!item.quantity_returned || item.quantity_returned <= 0) {
    errors.push('Return quantity must be greater than 0');
  }

  // Validate against GRN accepted quantity if available
  if (grnItem && item.quantity_returned !== undefined) {
    if (item.quantity_returned > grnItem.quantity_accepted) {
      errors.push(`Cannot return more than accepted quantity (${grnItem.quantity_accepted})`);
    }
  }

  if (!item.return_reason) {
    errors.push('Return reason is required');
  }

  if (!item.return_condition) {
    errors.push('Return condition is required');
  }

  if (
    !item.condition_description ||
    item.condition_description.length < RETURN_VALIDATION_RULES.conditionDescription.minLength
  ) {
    errors.push(
      `Condition description must be at least ${RETURN_VALIDATION_RULES.conditionDescription.minLength} characters`
    );
  }

  if (item.return_reason === ReturnReason.QUALITY_ISSUES && !item.quality_issue_details) {
    errors.push('Quality issue details are required for quality-related returns');
  }

  return errors;
};

export const validatePurchaseReturn = (returnData: Partial<CreatePurchaseReturnData>): string[] => {
  const errors: string[] = [];

  if (!returnData.grn_id) {
    errors.push('GRN selection is required');
  }

  if (!returnData.return_date) {
    errors.push('Return date is required');
  }

  if (!returnData.reason_category) {
    errors.push('Return reason category is required');
  }

  if (
    !returnData.return_description ||
    returnData.return_description.length < RETURN_VALIDATION_RULES.returnDescription.minLength
  ) {
    errors.push(
      `Return description must be at least ${RETURN_VALIDATION_RULES.returnDescription.minLength} characters`
    );
  }

  if (!returnData.refund_method) {
    errors.push('Refund method is required');
  }

  if (!returnData.items || returnData.items.length === 0) {
    errors.push('At least one item is required');
  }

  if (returnData.items && returnData.items.length > RETURN_VALIDATION_RULES.items.maxItems) {
    errors.push(`Maximum ${RETURN_VALIDATION_RULES.items.maxItems} items allowed`);
  }

  // Validate each item
  if (returnData.items) {
    returnData.items.forEach((item, index) => {
      const itemErrors = validateReturnItem(item);
      itemErrors.forEach(error => {
        errors.push(`Item ${index + 1}: ${error}`);
      });
    });
  }

  // Validate shipping info if provided
  if (returnData.shipping_info) {
    if (
      returnData.shipping_info.shipping_cost &&
      parseFloat(returnData.shipping_info.shipping_cost) < 0
    ) {
      errors.push('Shipping cost cannot be negative');
    }

    if (returnData.shipping_info.pickup_scheduled && !returnData.shipping_info.pickup_date) {
      errors.push('Pickup date is required when pickup is scheduled');
    }
  }

  return errors;
};

// Status display helpers for Purchase Returns
export const getReturnStatusColor = (status: ReturnStatus): string => {
  switch (status) {
    case ReturnStatus.PENDING:
      return 'yellow';
    case ReturnStatus.APPROVED:
      return 'blue';
    case ReturnStatus.SHIPPED:
      return 'purple';
    case ReturnStatus.COMPLETED:
      return 'green';
    case ReturnStatus.CANCELLED:
      return 'red';
    default:
      return 'gray';
  }
};

export const getReturnStatusLabel = (status: ReturnStatus): string => {
  switch (status) {
    case ReturnStatus.PENDING:
      return 'Pending';
    case ReturnStatus.APPROVED:
      return 'Approved';
    case ReturnStatus.SHIPPED:
      return 'Shipped';
    case ReturnStatus.COMPLETED:
      return 'Completed';
    case ReturnStatus.CANCELLED:
      return 'Cancelled';
    default:
      return 'Unknown';
  }
};

export const getReturnReasonColor = (reason: ReturnReason): string => {
  switch (reason) {
    case ReturnReason.DAMAGED:
    case ReturnReason.DEFECTIVE:
    case ReturnReason.QUALITY_ISSUES:
      return 'red';
    case ReturnReason.WRONG_ITEM:
    case ReturnReason.NOT_ORDERED:
    case ReturnReason.SPECIFICATION_MISMATCH:
      return 'orange';
    case ReturnReason.EXPIRED:
      return 'purple';
    case ReturnReason.OVERDELIVERY:
      return 'blue';
    case ReturnReason.PACKAGING_ISSUES:
      return 'yellow';
    case ReturnReason.OTHER:
      return 'gray';
    default:
      return 'gray';
  }
};

export const getReturnReasonLabel = (reason: ReturnReason): string => {
  switch (reason) {
    case ReturnReason.DAMAGED:
      return 'Damaged';
    case ReturnReason.WRONG_ITEM:
      return 'Wrong Item';
    case ReturnReason.DEFECTIVE:
      return 'Defective';
    case ReturnReason.QUALITY_ISSUES:
      return 'Quality Issues';
    case ReturnReason.EXPIRED:
      return 'Expired';
    case ReturnReason.OVERDELIVERY:
      return 'Over Delivery';
    case ReturnReason.NOT_ORDERED:
      return 'Not Ordered';
    case ReturnReason.SPECIFICATION_MISMATCH:
      return 'Specification Mismatch';
    case ReturnReason.PACKAGING_ISSUES:
      return 'Packaging Issues';
    case ReturnReason.OTHER:
      return 'Other';
    default:
      return 'Unknown';
  }
};

export const getRefundMethodColor = (method: RefundMethod): string => {
  switch (method) {
    case RefundMethod.CREDIT_NOTE:
      return 'blue';
    case RefundMethod.CASH_REFUND:
      return 'green';
    case RefundMethod.REPLACEMENT:
      return 'purple';
    case RefundMethod.ACCOUNT_CREDIT:
      return 'orange';
    case RefundMethod.DEBIT_NOTE:
      return 'yellow';
    default:
      return 'gray';
  }
};

export const getRefundMethodLabel = (method: RefundMethod): string => {
  switch (method) {
    case RefundMethod.CREDIT_NOTE:
      return 'Credit Note';
    case RefundMethod.CASH_REFUND:
      return 'Cash Refund';
    case RefundMethod.REPLACEMENT:
      return 'Replacement';
    case RefundMethod.ACCOUNT_CREDIT:
      return 'Account Credit';
    case RefundMethod.DEBIT_NOTE:
      return 'Debit Note';
    default:
      return 'Unknown';
  }
};

export const getReturnConditionColor = (condition: ReturnCondition): string => {
  switch (condition) {
    case ReturnCondition.NEW:
      return 'green';
    case ReturnCondition.USED:
      return 'blue';
    case ReturnCondition.DAMAGED:
    case ReturnCondition.DEFECTIVE:
      return 'red';
    case ReturnCondition.EXPIRED:
      return 'purple';
    case ReturnCondition.OPENED:
      return 'yellow';
    case ReturnCondition.INCOMPLETE:
      return 'orange';
    default:
      return 'gray';
  }
};

export const getReturnConditionLabel = (condition: ReturnCondition): string => {
  switch (condition) {
    case ReturnCondition.NEW:
      return 'New';
    case ReturnCondition.USED:
      return 'Used';
    case ReturnCondition.DAMAGED:
      return 'Damaged';
    case ReturnCondition.DEFECTIVE:
      return 'Defective';
    case ReturnCondition.EXPIRED:
      return 'Expired';
    case ReturnCondition.OPENED:
      return 'Opened';
    case ReturnCondition.INCOMPLETE:
      return 'Incomplete';
    default:
      return 'Unknown';
  }
};

export const getReturnPriorityColor = (priority: ReturnPriority): string => {
  switch (priority) {
    case ReturnPriority.LOW:
      return 'green';
    case ReturnPriority.MEDIUM:
      return 'yellow';
    case ReturnPriority.HIGH:
      return 'orange';
    case ReturnPriority.URGENT:
      return 'red';
    default:
      return 'gray';
  }
};

export const getReturnPriorityLabel = (priority: ReturnPriority): string => {
  switch (priority) {
    case ReturnPriority.LOW:
      return 'Low';
    case ReturnPriority.MEDIUM:
      return 'Medium';
    case ReturnPriority.HIGH:
      return 'High';
    case ReturnPriority.URGENT:
      return 'Urgent';
    default:
      return 'Unknown';
  }
};
