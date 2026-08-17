// Material Request Types
export interface MaterialRequest {
  id: number;
  request_number: string;
  request_date: string;
  client: number;
  client_details?: Client;
  client_name: string;
  requested_by: number;
  requested_by_name: string;
  service_invoice: number | null;
  service_invoice_number: string | null;
  delivery_location: number;
  delivery_location_name: string;
  purpose: string;
  notes: string;
  status: 'draft' | 'submitted' | 'approved' | 'rejected' | 'fulfilled' | 'cancelled';
  submitted_at: string | null;
  approved_by: number | null;
  approved_by_name: string | null;
  approved_at: string | null;
  approval_notes: string;
  rejected_by: number | null;
  rejected_by_name: string | null;
  rejected_at: string | null;
  rejection_reason: string;
  fulfilled_by: number | null;
  fulfilled_by_name: string | null;
  fulfilled_at: string | null;
  inventory_invoice: number | null;
  inventory_invoice_number: string | null;
  items: MaterialRequestItem[];
  total_items: number;
  created_at: string;
  updated_at: string;
  owner: number;
  branch: number;
}

export interface MaterialRequestItem {
  id: number;
  item: number;
  item_details?: InventoryItem;
  item_name: string;
  item_sku: string;
  unit_of_measure: string;
  quantity: string;
  approved_quantity: string | null;
  notes: string;
  created_at: string;
  updated_at: string;
}

export interface CreateMaterialRequest {
  client: number;
  service_invoice?: number | null;
  delivery_location: number;
  purpose: string;
  notes?: string;
  items: CreateMaterialRequestItem[];
}

export interface CreateMaterialRequestItem {
  item: number;
  quantity: string;
  notes?: string;
}

// Represents an inventory item returned by the eligible-items endpoint
export interface EligibleInventoryItem {
  id: number;
  name: string;
  sku: string;
  category: number | null;
  category_name: string;
  /** Short code for the category, e.g. 'CAT-001' */
  category_code: string;
  /** Broad type label for the category, e.g. 'Book', 'Uniform' */
  category_item_type: string;
  unit_of_measure: string;
  /**
   * - exact_match:    inventory item appears directly on the invoice
   * - category_match: invoice has a service item whose MR config covers this
   *                   item's category code OR item_type label
   * - not_eligible:   not authorized by this invoice
   */
  eligibility_type: 'exact_match' | 'category_match' | 'not_eligible';
  /** Name of the invoice line item / service item that authorizes this item */
  authorized_by: string | null;
}

export interface MaterialRequestFilters {
  status?: string;
  client?: number;
  date_from?: string;
  date_to?: string;
  search?: string;
  service_invoice?: number;
}

export interface MaterialRequestActionData {
  notes?: string;
  reason?: string;
}

export interface MaterialRequestSummary {
  total_requests: number;
  draft: number;
  submitted: number;
  approved: number;
  rejected: number;
  fulfilled: number;
  pending_approval: number;
}

// ============================================
// OFFICE USE REQUEST TYPES
// ============================================

export type OfficeUseRequestStatus =
  | 'draft'
  | 'submitted'
  | 'approved'
  | 'rejected'
  | 'fulfilled'
  | 'cancelled';

export interface OfficeUseRequest {
  id: number;
  request_number: string;
  request_date: string;
  requested_by: number;
  requested_by_name: string;
  department: string;
  /** Deprecated: expense accounts are now derived per item from item.category.cogs_account. */
  expense_account: number | null;
  expense_account_name?: string;
  expense_account_code?: string;
  delivery_location: number;
  delivery_location_name: string;
  purpose: string;
  notes: string;
  status: OfficeUseRequestStatus;
  submitted_at: string | null;
  approved_by: number | null;
  approved_by_name: string | null;
  approved_at: string | null;
  approval_notes: string;
  rejected_by: number | null;
  rejected_by_name: string | null;
  rejected_at: string | null;
  rejection_reason: string;
  fulfilled_by: number | null;
  fulfilled_by_name: string | null;
  fulfilled_at: string | null;
  cancelled_by: number | null;
  cancelled_by_name: string | null;
  cancelled_at: string | null;
  cancellation_reason: string;
  journal_entry: number | null;
  journal_entry_reference: string | null;
  items: OfficeUseRequestItem[];
  total_items: number;
  created_at: string;
  updated_at: string;
  owner: number;
  branch: number;
}

export interface OfficeUseRequestItem {
  id: number;
  item: number;
  item_name: string;
  item_sku: string;
  unit_of_measure: string;
  quantity: string;
  notes: string;
  /** GL expense account this line posts to on fulfilment, from item.category.cogs_account */
  expense_account_name?: string;
  expense_account_code?: string;
  created_at: string;
  updated_at: string;
}

export interface CreateOfficeUseRequest {
  department?: string;
  delivery_location: number;
  purpose: string;
  notes?: string;
  items: CreateOfficeUseRequestItem[];
}

export interface CreateOfficeUseRequestItem {
  item: number;
  quantity: string;
  notes?: string;
}

export interface OfficeUseRequestFilters {
  status?: string;
  requested_by?: number;
  department?: string;
  date_from?: string;
  date_to?: string;
  search?: string;
  page?: number;
  page_size?: number;
}

export interface OfficeUseRequestActionData {
  notes?: string;
  reason?: string;
}

export interface OfficeUseRequestSummary {
  total_requests: number;
  draft_count: number;
  pending_approval_count: number;
  approved_count: number;
  fulfilled_count: number;
  rejected_count: number;
  cancelled_count: number;
}

// Ledger Report Types
export interface AccountLedgerEntry {
  date: string;
  transaction_id: number;
  reference_number: string;
  description: string;
  debit: number;
  credit: number;
  balance: number;
  client_name: string | null;
  created_by: string | null;
  approved: boolean;
  is_reversed: boolean;
}

export interface AccountLedger {
  account: {
    id: number;
    code: string;
    name: string;
    account_type: string;
    current_balance: number;
  };
  period: {
    date_from: string | null;
    date_to: string | null;
  };
  opening_balance: number;
  closing_balance: number;
  total_debits: number;
  total_credits: number;
  entries: AccountLedgerEntry[];
  entry_count: number;
}

export interface InventoryLedgerEntry {
  date: string;
  movement_type: string;
  movement_type_display: string;
  quantity_in: number;
  quantity_out: number;
  running_quantity: number;
  location: {
    id: number;
    name: string;
  } | null;
  reference: string;
  notes: string;
  created_by: string | null;
  invoice: {
    invoice_number: string;
    invoice_date: string;
    invoice_id: number;
  } | null;
  material_request: {
    request_number: string;
    request_date: string;
    request_id: number;
    requested_by: string;
    requested_by_id: number;
    purpose: string;
  } | null;
  recipient: {
    client_id: number;
    client_name: string;
    client_id_number: string;
  } | null;
}

export interface InventoryLedger {
  item: {
    id: number;
    name: string;
    sku: string;
    unit_of_measure: string;
    cost_price: number;
    selling_price: number;
  };
  period: {
    date_from: string | null;
    date_to: string | null;
  };
  total_in: number;
  total_out: number;
  net_movement: number;
  entries: InventoryLedgerEntry[];
  entry_count: number;
}

// ============================================================
// Item Lifecycle Ledger — enriched per-movement ledger types
// ============================================================

export interface PurchaseOrderRef {
  id: number;
  po_number: string;
  order_date: string;
  supplier_id: number;
  supplier_name: string;
}

export interface LifecyclePurchaseSource {
  type: 'grn' | 'purchase_order' | 'purchase' | string;
  document_number: string;
  document_id: number | null;
  received_date?: string;
  received_by?: string | null;
  purchase_order: PurchaseOrderRef | null;
}

export interface CostChange {
  previous_avg_cost: number;
  new_avg_cost: number;
  change_per_unit: number;
  qty_before_receipt: number;
  implicit_revaluation: number;
  direction: 'increase' | 'decrease' | 'unchanged';
  accounting_note: string;
}

export interface LifecycleLedgerEntry {
  seq: number;
  date: string;
  movement_type: string;
  movement_type_display: string;
  quantity_in: number;
  quantity_out: number;
  unit_cost: number;
  total_cost: number;
  running_qty: number;
  running_avg_cost: number;
  running_value: number;
  cost_changed: boolean;
  cost_change: CostChange | null;
  source: LifecyclePurchaseSource | null;
  invoice: {
    invoice_id: number;
    invoice_number: string;
    invoice_date: string;
    client: { id: number; name: string; client_id: string } | null;
  } | null;
  material_request: {
    request_id: number;
    request_number: string;
    request_date: string;
    requested_by: string;
    purpose: string;
    service_invoice_number: string | null;
  } | null;
  location: { id: number; name: string } | null;
  reference: string;
  notes: string;
  created_by: string | null;
}

export interface ItemLifecycleSummary {
  opening_qty: number;
  opening_avg_cost: number;
  opening_value: number;
  total_received_qty: number;
  total_received_value: number;
  total_issued_qty: number;
  total_issued_value: number;
  closing_qty: number;
  closing_avg_cost: number;
  closing_value: number;
  cost_change_count: number;
}

export interface ItemLifecycleLedger {
  item: {
    id: number;
    name: string;
    sku: string;
    unit_of_measure: string;
    valuation_method: 'fifo' | 'lifo' | 'average';
    valuation_method_display: string;
    current_cost: number;
    current_quantity: number;
    current_value: number;
    category_name: string;
    is_active: boolean;
  };
  period: { date_from: string | null; date_to: string | null };
  summary: ItemLifecycleSummary;
  entries: LifecycleLedgerEntry[];
  entry_count: number;
}

export interface HypotheticalScenario {
  purchase_qty: number;
  purchase_cost: number;
  receipt_value: number;
  journal_entry: { debit: string; credit: string };
  new_avg_cost: number;
  avg_cost_change: number;
  implicit_stock_reval: number;
  future_cogs_per_unit: number;
  cogs_change_vs_current: number;
}

export interface ItemCostAnalysis {
  item: {
    id: number;
    name: string;
    sku: string;
    valuation_method: string;
    valuation_method_display: string;
  };
  current_position: {
    quantity_on_hand: number;
    average_cost: number;
    total_value: number;
  };
  explanation: string;
  examples: {
    price_increase_10pct: HypotheticalScenario;
    price_decrease_10pct: HypotheticalScenario;
  };
}

// Statement of Account Types
export interface StatementItem {
  type: 'service_invoice' | 'inventory_invoice';
  invoice_id: number;
  invoice_number: string;
  invoice_date: string;
  due_date: string | null;
  description: string;
  amount: number;
  amount_paid: number;
  balance: number;
  status: string;
  status_display: string;
  is_overdue?: boolean;
  payments?: PaymentDetail[];
  material_request?: MaterialRequestInfo;
  created_by: string | null;
}

export interface PaymentDetail {
  payment_date: string;
  amount: number;
  payment_method: string | null;
  reference: string;
}

export interface MaterialRequestInfo {
  request_number: string;
  request_date: string;
  requested_by: string;
  purpose: string;
}

export interface ClientStatement {
  client: {
    id: number;
    client_id: string;
    name: string;
    email: string;
    phone: string;
    status: string;
  };
  period: {
    date_from: string | null;
    date_to: string | null;
  };
  summary: {
    total_invoiced: number;
    total_paid: number;
    total_balance: number;
    invoice_count: number;
    pending_count: number;
    partial_count: number;
    paid_count: number;
    overdue_count: number;
  };
  statement_items: StatementItem[];
}

export interface PaymentHistory {
  client: {
    id: number;
    name: string;
  };
  period: {
    date_from: string | null;
    date_to: string | null;
  };
  total_amount: number;
  payment_count: number;
  payments: PaymentHistoryItem[];
}

export interface PaymentHistoryItem {
  payment_date: string;
  amount: number;
  invoice_number: string;
  invoice_id: number;
  payment_method: string | null;
  reference: string;
  notes: string;
}

export interface OutstandingInvoice {
  type: 'service_invoice' | 'inventory_invoice';
  invoice_id: number;
  invoice_number: string;
  invoice_date: string;
  due_date: string | null;
  amount: number;
  amount_paid: number;
  balance: number;
  status: string;
  days_overdue: number;
}

export interface OutstandingInvoices {
  client: {
    id: number;
    name: string;
  };
  total_outstanding: number;
  invoice_count: number;
  outstanding_invoices: OutstandingInvoice[];
}

// Client Account Ledger Types
export interface ClientLedgerEntry {
  date: string;
  transaction_type: 'invoice' | 'payment' | 'payment_reversal';
  invoice_type?: 'service' | 'inventory';
  reference: string;
  description: string;
  debit: number; // Invoices (amounts owed)
  credit: number; // Payments (amounts paid)
  balance: number; // Running balance
  invoice_id?: number;
  journal_entry_id?: number;
  journal_entry_reference?: string;
  status?: string;
  related_invoice?: string;
  is_reversed: boolean;
  is_reversal: boolean;
  details?: {
    // Invoice details
    created_by?: string | null;
    created_at?: string | null;
    is_posted?: boolean;
    posted_by?: string | null;
    posted_at?: string | null;
    due_date?: string | null;
    subtotal?: number;
    discount_amount?: number;
    discount?: number;
    tax_amount?: number;
    amount_paid?: number;
    balance?: number;
    notes?: string;
    // Payment details
    approved?: boolean;
    approved_by?: string | null;
    approved_at?: string | null;
    workflow_reference?: string;
    is_reversed?: boolean;
    entries?: Array<{
      account_code: string;
      account_name: string;
      side: string;
      amount: number;
    }>;
  };
}

export interface ClientLedger {
  client: {
    id: number;
    client_id: string;
    name: string;
    email: string;
    phone: string;
    status: string;
  };
  period: {
    date_from: string | null;
    date_to: string | null;
  };
  summary: {
    total_invoiced: number;
    total_paid: number;
    current_balance: number;
    transaction_count: number;
  };
  ledger_entries: ClientLedgerEntry[];
}

// Supporting Types
interface Client {
  id: number;
  client_id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone_primary: string;
}

interface InventoryItem {
  id: number;
  name: string;
  sku: string;
  description: string;
  unit_of_measure: string;
  cost_price: string;
  selling_price: string;
  category: number;
}
