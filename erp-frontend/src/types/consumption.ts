// Resource Consumption Types
export type ResourceType =
  | 'fuel'
  | 'electricity'
  | 'water'
  | 'gas'
  | 'telecom'
  | 'service'
  | 'consumable'
  | 'other';

export type ReadingType = 'odometer' | 'meter' | 'hours' | 'cycles' | 'quantity' | 'none' | null;

export type ConsumptionStatus =
  | 'draft'
  | 'submitted'
  | 'flagged'
  | 'approved'
  | 'posted'
  | 'cancelled';

export type IrregularityType =
  | 'excessive_consumption'
  | 'low_usage'
  | 'high_usage'
  | 'duplicate_reading'
  | 'reading_rollback'
  | 'impossible_rate'
  | 'no_usage'
  | 'frequency_anomaly'
  | '';

export interface ResourceConsumption {
  // Identifiers
  id: number;
  consumption_number: string;

  // Payment Flow
  payment_flow: 'prepaid' | 'postpaid';

  // Prepaid Flow Fields
  prepaid_voucher: number | null;
  prepaid_voucher_number?: string;
  prepaid_voucher_detail?: PrepaidVoucherDetail;

  // Postpaid Flow Fields
  supplier: number | null;
  supplier_name?: string;

  // Resource Information
  resource: number;
  resource_type: ResourceType;
  resource_name: string;

  // Beneficiary Information
  beneficiary_type: 'asset' | 'employee' | 'department' | 'location' | 'other';
  beneficiary_name: string;
  beneficiary_reference: string;

  // Asset Fields (when beneficiary_type = 'asset')
  asset: number | null;
  asset_name?: string;
  asset_number?: string;
  asset_detail?: AssetDetail;

  // Employee Fields (when beneficiary_type = 'employee')
  employee: number | null;
  employee_name?: string;

  // Consumption Details
  consumption_date: string; // ISO date format
  quantity_consumed: string; // Decimal as string
  unit_of_measure: string;
  unit_cost: string; // Decimal as string
  total_cost: string; // Decimal as string
  expense_category_name?: string;

  // Meter/Reading Information
  reading_type: ReadingType | null;
  previous_reading: string | null; // Decimal as string
  current_reading: string | null; // Decimal as string
  usage_since_last: string | null; // Decimal as string
  consumption_rate: string | null; // Decimal as string
  expected_consumption: string | null; // Decimal as string

  // Irregularity Detection
  is_irregular: boolean;
  irregularity_type: IrregularityType | '';
  variance_percentage: string; // Decimal as string
  irregularity_notes: string;
  requires_explanation: boolean;
  explanation_provided: string;

  // Approval Workflow
  approved_by: number | null;
  approved_by_name?: string;
  approved_at: string | null; // ISO datetime

  // Documentation
  operator: number | null;
  operator_name: string;
  operator_display: {
    id: number;
    staff_id: string;
    name: string;
    department: string;
    position: string;
  } | null;
  operator_signature: string | null;
  consumption_location: string;
  receipt_number: string;
  receipt_photo: string | null; // URL or file path
  invoice_number: string;

  // Status and Posting
  status: ConsumptionStatus;
  is_posted: boolean;
  posted_at: string | null; // ISO datetime
  posted_by: number | null;
  posted_by_name?: string;
  accounts_payable: number | null;

  // Additional Info
  notes: string;
  metadata: Record<string, any>;
  remaining_voucher_balance?: VoucherBalance;

  // Audit Fields
  branch: number;
  owner: number;
  created_at: string; // ISO datetime
  updated_at: string; // ISO datetime
}

export interface PrepaidVoucherDetail {
  id: number;
  voucher_number: string;
  allocated_units: string;
  consumed_units: string;
  remaining_units: string;
  status: 'active' | 'depleted' | 'cancelled';
}

export interface AssetDetail {
  id: number;
  asset_number: string;
  name: string;
  current_reading: string;
  average_consumption_rate: string;
  monthly_total_quantity: string;
  monthly_total_cost: string;
}

export interface VoucherBalance {
  units: string;
  amount: string;
}

// Create/Update DTOs
export interface CreatePrepaidConsumption {
  payment_flow: 'prepaid';
  prepaid_voucher: number;
  resource: number;
  consumption_date: string;
  quantity_consumed: string;
  unit_cost: string;
  beneficiary_type: 'asset' | 'employee' | 'department' | 'location' | 'other';
  beneficiary_name: string;
  beneficiary_reference: string;
  asset?: number;
  employee?: number;
  reading_type?: ReadingType;
  previous_reading?: string;
  current_reading?: string;
  operator?: number | null; // Staff FK — links consumption to traceable staff member
  operator_name?: string; // Auto-populated from operator.full_name; kept for legacy display
  operator_signature?: string;
  consumption_location: string;
  receipt_number?: string;
  receipt_photo?: File | string;
  notes?: string;
}

export interface CreatePostpaidConsumption {
  payment_flow: 'postpaid';
  supplier: number;
  resource: number;
  consumption_date: string;
  quantity_consumed: string;
  unit_cost: string;
  beneficiary_type: 'asset' | 'employee' | 'department' | 'location' | 'other';
  beneficiary_name: string;
  beneficiary_reference: string;
  asset?: number;
  employee?: number;
  reading_type?: ReadingType;
  previous_reading?: string;
  current_reading?: string;
  consumption_location: string;
  invoice_number?: string;
  notes?: string;
}

// API Response Types
export interface ConsumptionListResponse {
  count: number;
  next: string | null;
  previous: string | null;
  results: ResourceConsumption[];
}

export interface ConsumptionFilters {
  payment_flow?: 'prepaid' | 'postpaid';
  resource_type?: ResourceType;
  asset?: number;
  employee?: number;
  supplier?: number;
  status?: ConsumptionStatus;
  is_irregular?: boolean;
  is_posted?: boolean;
  consumption_date__gte?: string; // Date range start
  consumption_date__lte?: string; // Date range end
  total_cost__gte?: string; // Minimum cost
  total_cost__lte?: string; // Maximum cost
  beneficiary_type?: string;
  requires_explanation?: boolean;
  page?: number;
  page_size?: number;
  ordering?: string; // e.g., '-consumption_date', 'total_cost'
}

export interface BulkPostResponse {
  success: boolean;
  posted_count: number;
  failed: number;
  skipped: number;
  details: {
    success: Array<{ id: number; number: string }>;
    failed: Array<{ id: number; number: string; error: string }>;
    skipped: Array<{ id: number; number: string; reason: string }>;
  };
}

export interface IrregularityResponse {
  count: number;
  consumptions: ResourceConsumption[];
}

export interface AssetSummaryResponse {
  asset: {
    id: number;
    asset_number: string;
    name: string;
    current_reading: string;
  };
  period_days: number;
  totals: {
    quantity: number;
    cost: number;
    usage: number;
  };
  efficiency: {
    current: number;
    average: number;
    best: number;
    worst: number;
  };
  has_irregularities: boolean;
  recent_consumptions: ResourceConsumption[];
}

export interface WorkflowResponse {
  success: boolean;
  consumption_number: string;
  status: ConsumptionStatus;
  workflow_triggered?: boolean;
  approved_by?: string;
  approved_at?: string;
  message: string;
}

export interface PostingResponse {
  success: boolean;
  message: string;
  consumption_number: string;
  payment_flow: 'prepaid' | 'postpaid';
  total_cost: number;
  accounts_payable_id: number | null;
}

export interface ValidationError {
  [field: string]: string[];
}
