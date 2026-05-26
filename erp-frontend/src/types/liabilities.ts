// ============================================================================
// ACCOUNTS PAYABLE TYPES
// ============================================================================

export interface VendorInfo {
  id: number;
  name: string;
  type: 'client' | 'supplier';
}

export interface PurchaseOrderInfo {
  id: number;
  po_number: string;
  order_date: string;
  total_amount: string; // Decimal string
}

export interface ThreeWayMatchResult {
  valid: boolean;
  po_matches: boolean;
  grn_matches: boolean;
  invoice_matches: boolean;
  messages: string[];
  po_amount?: string; // Decimal string
  grn_amount?: string; // Decimal string
  invoice_amount?: string; // Decimal string
  variance?: string; // Decimal string
}

export interface AccountsPayable {
  id: number;
  invoice_number: string;
  invoice_date: string;
  due_date: string;
  amount: string;
  amount_paid: string;
  outstanding_amount: string;
  description?: string;
  status: 'unpaid' | 'partial' | 'paid' | 'overdue' | 'cancelled';

  // Vendor (flat fields)
  vendor_type: string;
  vendor_id: number;
  vendor_name: string;
  vendor_code?: string;
  vendor_email?: string;

  // Account
  account?: number;
  account_name?: string;
  account_code?: string;

  // Purchase Order
  purchase_order: number | null;
  purchase_order_details: {
    id: number;
    po_number: string;
    order_date: string;
    total_amount: string;
    status: string;
    supplier_name: string;
  } | null;

  // 3-Way Matching
  three_way_match_status: string;
  three_way_match_result: ThreeWayMatchResult | null;
  validated_at?: string;
  validated_by?: number;
  validated_by_name?: string;

  // Payment Accountability
  posted_by: number;
  posted_by_name?: string;
  posted_at: string;
  posting_notes?: string;

  // Computed
  is_overdue: boolean;
  days_overdue: number;

  // Timestamps
  created_at: string;
  updated_at: string;

  // Optional legacy fields not always returned
  tax_amount?: string;
  total_amount?: string;
  payment_terms?: string;
  notes?: string;
}

export interface AccountsPayableListItem {
  id: number;
  invoice_number: string;
  invoice_date: string;
  due_date: string;
  amount: string;
  amount_paid: string;
  outstanding_amount: string;
  vendor_name: string;
  vendor_type?: string;
  account_name?: string;
  status: string;
  three_way_match_status: string;
  is_overdue: boolean;
  purchase_order: number | null;
}

export interface CreatePayableRequest {
  vendor_type: 'client' | 'supplier';
  vendor_id: number;
  purchase_order_id?: number | null;
  invoice_number: string;
  invoice_date: string;
  due_date: string;
  amount: string; // Decimal string
  tax_amount: string; // Decimal string
  payment_terms: string;
  description?: string;
  notes?: string;
  posted_by: number;
  posting_notes?: string;
}

export interface UpdatePayableRequest {
  invoice_number?: string;
  invoice_date?: string;
  due_date?: string;
  amount?: string;
  tax_amount?: string;
  payment_terms?: string;
  description?: string;
  notes?: string;
  status?: 'pending' | 'partial' | 'paid' | 'overdue' | 'cancelled';
}

export interface MakePaymentRequest {
  amount: string; // Decimal string
  payment_date: string;
  payment_method: string;
  reference_number?: string;
  notes?: string;
  posted_by: number;
}

export interface PaymentResult {
  success: boolean;
  message: string;
  payable_id: number;
  reference_number: string;
  amount_paid: string; // Decimal string
  amount_due: string; // Decimal string
  new_status: 'pending' | 'partial' | 'paid' | 'overdue' | 'cancelled';
}

export interface PayablesSummary {
  total_payables: number;
  total_amount: string; // Decimal string
  total_paid: string; // Decimal string
  total_outstanding: string; // Decimal string
  pending_validation: number;
  overdue_count: number;
  overdue_amount: string; // Decimal string
  status_breakdown: {
    pending: number;
    partial: number;
    paid: number;
    overdue: number;
    cancelled: number;
  };
}

export interface PayablesFilters {
  vendor_type?: 'client' | 'supplier';
  vendor_id?: number;
  status?: 'pending' | 'partial' | 'paid' | 'overdue' | 'cancelled';
  three_way_match_status?: 'pending' | 'passed' | 'failed' | 'not_required';
  date_from?: string;
  date_to?: string;
  due_date_from?: string;
  due_date_to?: string;
  search?: string;
  page?: number;
  page_size?: number;
  ordering?: string;
}
