// Prepaid Voucher Types (Updated to match actual API)
export interface PrepaidVoucher {
  id: number;
  voucher_number: string;
  prepaid_expense: number;
  prepaid_expense_name: string;

  // Validity and Dates
  issue_date: string; // ISO date
  expiry_date: string | null; // ISO date

  // Beneficiary Information
  beneficiary_type: 'asset' | 'employee' | 'department' | 'other';
  beneficiary_name: string;
  beneficiary_reference: string;
  asset_name: string;
  employee_name: string;

  // Allocation Details
  allocated_units: string; // Decimal as string
  allocated_amount: string; // Decimal as string

  // Consumption Tracking
  consumed_units: string; // Decimal as string
  consumed_amount: string; // Decimal as string
  remaining_units: string; // Decimal as string
  remaining_amount: string; // Decimal as string

  // Status and Redemption
  status: 'active' | 'partially_used' | 'fully_used' | 'expired' | 'cancelled';
  is_redeemed: boolean;
  redemption_date: string | null; // ISO date
  redemption_location: string;

  // Additional Info
  notes: string;
  consumption_count: string;

  // Audit Fields
  branch: number | null;
  owner: number | null;
  created_at: string;
  updated_at: string;
}

export interface CreateVoucherData {
  prepaid_expense: number;
  issue_date?: string;
  expiry_date?: string;
  beneficiary_type: 'asset' | 'employee' | 'department' | 'other';
  beneficiary_name: string;
  beneficiary_reference?: string;
  allocated_units: string;
  allocated_amount: string;
  odometer_reading?: string | null;
  redemption_date?: string;
  redemption_location?: string;
  notes?: string;
}

export interface VoucherListResponse {
  count: number;
  next: string | null;
  previous: string | null;
  results: PrepaidVoucher[];
}

export interface VoucherFilters {
  search?: string;
  prepaid_expense?: number;
  beneficiary_type?: string;
  status?: string;
  is_redeemed?: boolean;
  expiry_date__gte?: string;
  expiry_date__lte?: string;
  page?: number;
  ordering?: string;
}

export interface VoucherBalance {
  voucher_id: number;
  voucher_number: string;
  remaining_units: string;
  remaining_amount: string;
  can_consume: boolean;
  restrictions?: string[];
}

export interface VoucherConsumption {
  id: number;
  consumption_number: string;
  consumption_date: string;
  quantity_consumed: string;
  total_cost: string;
  operator_name: string;
  consumption_location: string;
  status: string;
  created_at: string;
}

export interface CancelVoucherData {
  reason: string;
}
